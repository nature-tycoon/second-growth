// "Look through" for the selected animal: trees, shrubs and buildings standing between the
// camera and the animal part like a gap in the canopy, so it stays visible behind cover and the
// view reads as peering down into the forest rather than through a hole punched in it:
//  - the edge is ragged, following leaf clumps (world-space noise) instead of a clean circle,
//    and the leaves along it stir with the wind;
//  - the opening flares toward the camera, a funnel, so the canopy layers step back one behind
//    another down to the animal;
//  - foliage lining the funnel is shaded, darker the deeper it sits, like the inside of a crown;
//    the ground, animal and surrounding landscape keep their normal light;
//  - shrubs, groundcover and litter on the floor stay, whole, where they show below the animal's
//    feet or beside it on screen, so the floor of the gap isn't bare.
// It opens and closes by growing and shrinking, and follows the animal smoothly (see
// Renderer.updateFocus). Only what sits in front of the animal along the line of sight is
// affected, and only while an animal is selected. Fragments are discarded (a crisp edge, no
// dithering), so there is no transparency to depth-sort.

import * as THREE from 'three';

export const focus = {
  uFocus: { value: new THREE.Vector3() },   // the selected animal, in world space
  uFocusAmt: { value: 0 },                  // 0 = off, 1 = fully see-through
  uFocusR: { value: 0.9 },                  // radius of the see-through column (scene units)
  uViewDir: { value: new THREE.Vector3(0, 1, 0) }, // from the scene toward the camera
  uCamUp: { value: new THREE.Vector3(0, 1, 0) },   // up on screen, in world space
  uFocusFoot: { value: 0 },                 // the height of the animal's feet
  uFocusHalfW: { value: 0.3 },              // half the animal's size across the screen, at most
};

const FOCUS_NOISE = `
float focusHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float focusNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(focusHash(i), focusHash(i + vec3(1, 0, 0)), f.x), mix(focusHash(i + vec3(0, 1, 0)), focusHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(focusHash(i + vec3(0, 0, 1)), focusHash(i + vec3(1, 0, 1)), f.x), mix(focusHash(i + vec3(0, 1, 1)), focusHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

// keep: for shrubs, groundcover and floor litter, about how far one plant reaches (scene units at
// scale 1). Each one stays whole in the window when all of it shows below the animal's feet or
// off to its side on screen (see above). Trees and buildings (no keep) open fully: keeping part of
// one would leave a sliced-off skirt behind.
export function withFocusFade(mat, keep = 0, { supportCrown = false } = {}) {
  const prev = mat.onBeforeCompile;
  const baseKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, focus);
    shader.vertexShader = 'varying vec3 vFocusW; varying vec3 vFocusBase; varying float vFocusS;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 fcW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        fcW = instanceMatrix * fcW;
      #endif
      vFocusW = (modelMatrix * fcW).xyz;
      #ifdef USE_INSTANCING
        vFocusBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; vFocusS = length(instanceMatrix[0].xyz);
      #else
        vFocusBase = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; vFocusS = 1.0;
      #endif`);
    shader.fragmentShader = 'uniform vec3 uFocus; uniform float uFocusAmt; uniform float uFocusR; uniform vec3 uViewDir; uniform vec3 uCamUp; uniform float uFocusFoot; uniform float uFocusHalfW; varying vec3 vFocusW; varying vec3 vFocusBase; varying float vFocusS;\n' + FOCUS_NOISE +
      shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      float focusWall = 0.0;
      if (uFocusAmt > 0.001) {
        vec3 fd = vFocusW - uFocus;
        float along = dot(fd, uViewDir);                 // > 0: between the animal and the camera
        float across = length(fd - along * uViewDir);    // distance from the line of sight
        float up = along / uFocusR;
        // a funnel: narrow at the animal, wider toward the camera
        float r = uFocusR * uFocusAmt * (1.0 + 0.1 * clamp(up, 0.0, 3.0)); // (the window irises open)
        // a ragged edge that follows leaf clumps, at two scales
        float n = focusNoise(vFocusW * 2.6) * 0.62 + focusNoise(vFocusW * 6.3 + 11.0) * 0.38;
        r *= 0.8 + 0.4 * n;
        // a plant on the floor stays whole wherever all of it shows below the animal's feet or off to
        // its side on screen: there it can't cover the animal, and the floor of the gap stays alive
        bool keep = false;
        ${supportCrown ? 'keep = vFocusW.y <= uFocusFoot + 0.02;' : ''}
        ${keep ? `{
          float ext = ${keep.toFixed(2)} * vFocusS;
          vec3 bd = vFocusBase - uFocus; vec3 bp = bd - dot(bd, uViewDir) * uViewDir;
          float bu = dot(bp, uCamUp), bx = length(bp - bu * uCamUp);
          bool low = vFocusBase.y - uFocusFoot < 0.4;
          keep = low && (bu + ext * (uCamUp.y + 0.5) < (uFocusFoot - uFocus.y) * uCamUp.y - 0.03 || bx - ext * 0.6 > uFocusHalfW + 0.06);
        }` : ''}
        if (along > -0.08 * uFocusR && across < r && !keep) discard;
        // the walls of the gap: what still stands near the edge, above the animal, falls into shade,
        // deepest low down by the animal and easing off toward the open top of the funnel
        float edge = 1.0 - smoothstep(0.0, 0.8 * uFocusR, across - r);
        float above = smoothstep(0.2, 0.75, (vFocusW.y - uFocus.y) / uFocusR) * step(-0.3 * uFocusR, along);
        float deep = 1.0 - 0.3 * smoothstep(0.5, 3.5, up);
        focusWall = edge * above * deep * uFocusAmt;
      }`).replace('#include <dithering_fragment>', `#include <dithering_fragment>
      gl_FragColor.rgb *= mix(vec3(1.0), vec3(0.3, 0.38, 0.36), focusWall);`);
  };
  mat.customProgramCacheKey = () => baseKey + '|focus' + keep + (supportCrown ? '|support-crown' : '');
  return mat;
}
