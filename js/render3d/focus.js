// "Look through" for the selected animal: trees, shrubs and buildings standing between the
// camera and the animal open in a clean round window, so it stays visible behind cover. The
// window has a crisp edge (no dithered fade, which reads as pixel noise inside a crown) and the
// leaves left standing around it catch a faint warm rim. It opens and closes by growing and
// shrinking, and follows the animal smoothly (see Renderer.updateFocus). Only what sits in a
// column along the line of sight, in front of the animal, is affected, and only while an animal
// is selected. Fragments are discarded, so there is no transparency to depth-sort.

import * as THREE from 'three';

export const focus = {
  uFocus: { value: new THREE.Vector3() },   // the selected animal, in world space
  uFocusAmt: { value: 0 },                  // 0 = off, 1 = fully see-through
  uFocusR: { value: 0.9 },                  // radius of the see-through column (scene units)
  uViewDir: { value: new THREE.Vector3(0, 1, 0) }, // from the scene toward the camera
};

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
    shader.fragmentShader = 'uniform vec3 uFocus; uniform float uFocusAmt; uniform float uFocusR; uniform vec3 uViewDir; varying vec3 vFocusW;\n' +
      shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      float focusRim = 0.0;
      if (uFocusAmt > 0.001) {
        vec3 fd = vFocusW - uFocus;
        float along = dot(fd, uViewDir);                 // > 0: between the animal and the camera
        float across = length(fd - along * uViewDir);    // distance from the line of sight
        float r = uFocusR * uFocusAmt;                   // (the window irises open)
        if (along > -0.08 * uFocusR && across < r) discard;
        // the leaves still standing around the window's edge, in front of the animal
        focusRim = smoothstep(-0.3 * uFocusR, 0.0, along) * (1.0 - smoothstep(0.0, 0.18 * uFocusR, abs(across - r) - 0.02)) * uFocusAmt;
      }`).replace('#include <dithering_fragment>', `#include <dithering_fragment>
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.95, 0.8), focusRim * 0.2);`);
  };
  mat.customProgramCacheKey = () => baseKey + '|focus';
  return mat;
}
