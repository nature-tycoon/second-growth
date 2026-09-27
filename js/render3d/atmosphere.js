// Cloud shadows: soft patches of shade drifting across the valley with the wind. One set of
// shared uniforms drives every lit material; only direct sunlight is blocked, so the shaded
// ground keeps its sky light (as real cloud shadows do). Few and small on clear days, large
// and frequent under a cloudy sky.

export const sky = {
  uCloudT: { value: 0 },       // seconds of drift
  uCloudCover: { value: 0.25 }, // 0 = clear sky .. 1 = overcast
  uCloudAmt: { value: 0 },     // how much sun a cloud blocks (0 turns the effect off)
};

const CLOUD_GLSL = `
  uniform float uCloudT, uCloudCover, uCloudAmt;
  varying vec2 vCloudXZ;
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
    shader.vertexShader = 'varying vec2 vCloudXZ;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 clW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        clW = instanceMatrix * clW;
      #endif
      vCloudXZ = (modelMatrix * clW).xz;`);
    shader.fragmentShader = CLOUD_GLSL + shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      if (uCloudAmt > 0.001) {
        float clS = 1.0 - uCloudAmt * cloudShade(vCloudXZ);
        reflectedLight.directDiffuse *= clS;
        reflectedLight.directSpecular *= clS;
      }`);
  };
  mat.customProgramCacheKey = () => baseKey + '|clouds';
  return mat;
}
