// Cloud shadows: soft patches of shade drifting across the valley with the wind. One set of
// shared uniforms drives every lit material; only direct sunlight is blocked, so the shaded
// ground keeps its sky light (as real cloud shadows do). Few and small on clear days, large
// and frequent under a cloudy sky.

import { Vector2, Color } from 'three';

export const haze = {
  uHazeOrigin: { value: new Vector2() },
  uHazeDir: { value: new Vector2() },
  uHazeSpan: { value: 1 },
  uHazeColor: { value: new Color('#b9cdcf') },
  uHazeAmount: { value: 0 },
};

export const sky = {
  uCloudT: { value: 0 },       // seconds of drift
  uCloudCover: { value: 0.25 }, // 0 = clear sky .. 1 = overcast
  uCloudAmt: { value: 0 },     // how much sun a cloud blocks (0 turns the effect off)
};

// Under the sea (the reef map): everything below the surface is seen through water. Sunlight on
// the seabed ripples into a moving net of caustics, and the deeper it is, the more the water
// soaks up the reds and veils it in blue-green. Off (uSeaOn 0) on every other map.
export const sea = {
  uSeaOn: { value: 0 },
  uSeaY: { value: 0 },                  // height of the sea surface, in scene units
  uSeaShallow: { value: [0.1, 0.42, 0.42] }, // the colour the water scatters over the shallows...
  uSeaDeep: { value: [0.02, 0.16, 0.3] },   // ...and in deep water
  uSeaLight: { value: [1, 1, 1] },          // how bright the daylight is (the water's own colour dims at dusk)
  uSeaMurk: { value: 0 },                   // a flood plume clouding the water (0 clear .. 1 murky green-brown)
};

const CLOUD_GLSL = `
  uniform float uCloudT, uCloudCover, uCloudAmt;
  uniform float uSeaOn, uSeaY, uSeaMurk;
  uniform vec3 uSeaShallow, uSeaDeep, uSeaLight;
  uniform vec2 uHazeOrigin, uHazeDir;
  uniform float uHazeSpan, uHazeAmount;
  uniform vec3 uHazeColor;
  varying vec2 vCloudXZ;
  varying float vSeaY;
  // caustics: two warped interference patterns, kept where they're brightest, so the light gathers
  // into thin bright lines that drift and re-knot
  float seaCaustic(vec2 p, float t) {
    p *= 1.35;
    vec2 q = p + vec2(sin(p.y * 1.3 + t * 0.6), cos(p.x * 1.1 - t * 0.5)) * 0.7;
    float a = abs(sin(q.x * 2.1 + t * 0.8) + sin(q.y * 2.3 - t * 0.7));
    float b = abs(sin((q.x + q.y) * 1.7 - t * 0.9) + sin((q.x - q.y) * 1.9 + t * 0.6));
    return pow(1.0 - min(a, b) * 0.5, 7.0);
  }
  float clH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float clN(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(clH(i), clH(i + vec2(1.0, 0.0)), f.x), mix(clH(i + vec2(0.0, 1.0)), clH(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float cloudShade(vec2 xz) {
    vec2 p = xz / 9.0 + uCloudT * vec2(0.04, 0.016); // clouds a few tiles to a dozen across, drifting ~0.4 tiles/s
    float n = clN(p) * 0.58 + clN(p * 2.07 + 3.7) * 0.28 + clN(p * 4.3 + 9.1) * 0.14;
    float edge = 0.76 - uCloudCover * 0.42;
    return smoothstep(edge - 0.05, edge + 0.05, n);
  }
`;

export function withClouds(mat) {
  const prev = mat.onBeforeCompile;
  const baseKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, sky);
    Object.assign(shader.uniforms, sea);
    Object.assign(shader.uniforms, haze);
    shader.vertexShader = 'varying vec2 vCloudXZ;\nvarying float vSeaY;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 clW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        clW = instanceMatrix * clW;
      #endif
      clW = modelMatrix * clW;
      vCloudXZ = clW.xz; vSeaY = clW.y;`);
    shader.fragmentShader = CLOUD_GLSL + shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      if (uCloudAmt > 0.001) {
        float clS = 1.0 - uCloudAmt * cloudShade(vCloudXZ);
        reflectedLight.directDiffuse *= clS;
        reflectedLight.directSpecular *= clS;
      }
      float seaD = uSeaOn * max(0.0, uSeaY - vSeaY);
      if (seaD > 0.0) {
        float ca = seaCaustic(vCloudXZ, uCloudT);
        reflectedLight.directDiffuse *= 0.85 + ca * 0.9 * exp(-seaD * 0.6); // fading with depth
        reflectedLight.directSpecular *= 0.3;
      }`).replace('#include <opaque_fragment>', `if (seaD > 0.0) {
        // the water drinks the reds first, then the greens, and scatters its own colour back in
        vec3 absorb = exp(-seaD * vec3(0.36, 0.1, 0.07));
        float scat = 1.0 - exp(-seaD * (0.26 + uSeaMurk * 0.7));
        vec3 seaCol = mix(mix(uSeaShallow, uSeaDeep, clamp(seaD * 0.3, 0.0, 1.0)), vec3(0.26, 0.36, 0.26), uSeaMurk * 0.7);
        outgoingLight = outgoingLight * absorb + seaCol * uSeaLight * scat;
      }
      // Orthographic views have no perspective falloff: veil only scenery beyond the focus.
      float hzDepth = dot(vCloudXZ - uHazeOrigin, uHazeDir) / max(1.0, uHazeSpan);
      float hzAmount = smoothstep(0.1, 1.0, hzDepth) * uHazeAmount;
      outgoingLight = mix(outgoingLight, uHazeColor, hzAmount);
      #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => baseKey + '|clouds:haze';
  return mat;
}
