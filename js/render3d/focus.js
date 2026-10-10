// "Look through" for the selected animal: trees, shrubs and buildings standing between the
// camera and the animal open up in a clean round window, so it stays visible behind cover.
// The middle of the window is fully clear; its edge feathers out over a soft band and the
// leaves left standing at the rim catch a faint warm glow, like looking through a lens. Only
// what sits in a column along the line of sight is affected, and only while an animal is
// selected. The feathering is dithered with interleaved gradient noise, so there is still no
// transparency to depth-sort.

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
        float front = smoothstep(-0.15, 0.25, along);
        float f = uFocusAmt * (1.0 - smoothstep(uFocusR * 0.8, uFocusR, across)) * front;
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (f > 0.995 || n < f * f * (3.0 - 2.0 * f)) discard;
        // the leaves still standing around the window's edge
        focusRim = uFocusAmt * front * smoothstep(uFocusR * 0.8, uFocusR * 0.98, across) * (1.0 - smoothstep(uFocusR, uFocusR * 1.12, across));
      }`).replace('#include <dithering_fragment>', `#include <dithering_fragment>
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.95, 0.8), focusRim * 0.2);`);
  };
  mat.customProgramCacheKey = () => baseKey + '|focus';
  return mat;
}
