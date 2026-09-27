// Winter snow on the 3D scene. One shared uniform (0 = bare, 1 = deep snowpack) follows the game's
// snowpack. Plants, buildings and logs catch snow on their upward-facing surfaces; the ground
// (see terrain.js) whitens in soft, noisy patches that start on high ground and in the open.

export const snow = { uSnow: { value: 0 } };
export const SNOW_RGB = 'vec3(0.99, 1.0, 1.04)';

// Snow on top of things: whitens surfaces whose world normal points up, with a little grain
// so it reads as drifts rather than paint.
export function withSnowTops(mat, strength = 1) {
  const prev = mat.onBeforeCompile;
  const baseKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer);
    shader.uniforms.uSnow = snow.uSnow;
    shader.vertexShader = 'varying float vSnowUp;\nvarying vec2 vSnowXZ;\n' + shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      vec3 snN = objectNormal;
      #ifdef USE_INSTANCING
        snN = mat3(instanceMatrix) * snN;
      #endif
      vSnowUp = normalize(mat3(modelMatrix) * snN).y;`).replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vSnowXZ = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz;
      #else
        vSnowXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
      #endif`);
    shader.fragmentShader = `uniform float uSnow;\nvarying float vSnowUp;\nvarying vec2 vSnowXZ;\n` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (uSnow > 0.01) {
        float snGrain = fract(sin(dot(floor(vSnowXZ * 9.0), vec2(12.9898, 78.233))) * 43758.5453);
        float snCover = uSnow * ${strength.toFixed(2)} * smoothstep(0.25, 0.8, vSnowUp) * (0.7 + 0.3 * snGrain);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${SNOW_RGB}, clamp(snCover * 1.15, 0.0, 0.9));
      }`);
  };
  mat.customProgramCacheKey = () => baseKey + '|snow' + strength;
  return mat;
}
