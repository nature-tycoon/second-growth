// "Look through" for the selected animal: trees, shrubs and buildings standing between the
// camera and the animal part like a gap in the canopy, so it stays visible behind cover and the
// view reads as peering down into the forest rather than through a hole punched in it:
//  - the edge is ragged, following leaf clumps (world-space noise) instead of a clean circle,
//    and the leaves along it stir with the wind;
//  - the opening flares toward the camera, a funnel, so the canopy layers step back one behind
//    another down to the animal;
//  - foliage lining the funnel is shaded, darker the deeper it sits, like the inside of a crown;
//    the ground and the animal at the bottom keep full light (see Renderer.drawFocusLens for the
//    soft dimming of the screen around the opening).
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
};

const FOCUS_NOISE = `
float focusHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float focusNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(focusHash(i), focusHash(i + vec3(1, 0, 0)), f.x), mix(focusHash(i + vec3(0, 1, 0)), focusHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(focusHash(i + vec3(0, 0, 1)), focusHash(i + vec3(1, 0, 1)), f.x), mix(focusHash(i + vec3(0, 1, 1)), focusHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

export function withFocusFade(mat) {
  const prev = mat.onBeforeCompile;
  const baseKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, focus);
    shader.vertexShader = 'varying vec3 vFocusW;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 fcW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        fcW = instanceMatrix * fcW;
      #endif
      vFocusW = (modelMatrix * fcW).xyz;`);
    shader.fragmentShader = 'uniform vec3 uFocus; uniform float uFocusAmt; uniform float uFocusR; uniform vec3 uViewDir; varying vec3 vFocusW;\n' + FOCUS_NOISE +
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
        if (along > -0.08 * uFocusR && across < r) discard;
        // the walls of the gap: what still stands near the edge, above the animal, falls into shade,
        // deepest low down by the animal and easing off toward the open top of the funnel
        float edge = 1.0 - smoothstep(0.0, 0.8 * uFocusR, across - r);
        float above = smoothstep(0.2, 0.75, (vFocusW.y - uFocus.y) / uFocusR) * step(-0.3 * uFocusR, along);
        float deep = 1.0 - 0.3 * smoothstep(0.5, 3.5, up);
        focusWall = edge * above * deep * uFocusAmt;
      }`).replace('#include <dithering_fragment>', `#include <dithering_fragment>
      gl_FragColor.rgb *= mix(vec3(1.0), vec3(0.3, 0.38, 0.36), focusWall);`);
  };
  mat.customProgramCacheKey = () => baseKey + '|focus';
  return mat;
}
