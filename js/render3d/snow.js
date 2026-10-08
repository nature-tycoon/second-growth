// Winter snow on the 3D scene. One shared uniform (0 = bare, 1 = deep snowpack) follows the game's
// snowpack. Plants, buildings and logs catch snow on their upward-facing surfaces; the ground
// (see terrain.js) whitens in soft, noisy patches that start on high ground and in the open.
import { Float32BufferAttribute } from 'three';

export const snow = { uSnow: { value: 0 } };
export const SNOW_RGB = 'vec3(0.99, 1.0, 1.04)';

// Normalize each crown separately: a short cedar and a tall fir share the same gradient.
export function snowCrown(geometry) {
  geometry.computeBoundingBox();
  const pos = geometry.attributes.position, { min, max } = geometry.boundingBox;
  const span = Math.max(.001, max.y - min.y), height = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) height[i] = (pos.getY(i) - min.y) / span;
  geometry.setAttribute('aSnowHeight', new Float32BufferAttribute(height, 1));
  return geometry;
}

// Crowns fade from snowy tips to green bases; other surfaces catch snow on their tops.
export function withSnowTops(mat, strength = 1, { crown = false } = {}) {
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
    if (crown) shader.vertexShader = 'attribute float aSnowHeight;\nvarying float vSnowHeight;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSnowHeight = aSnowHeight;');
    shader.fragmentShader = `uniform float uSnow;\nvarying float vSnowUp;\nvarying vec2 vSnowXZ;\n` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (uSnow > 0.01) {
        float snGrain = fract(sin(dot(floor(vSnowXZ * 9.0), vec2(12.9898, 78.233))) * 43758.5453);
        ${crown ? `// A soft snowline descends through the crown as the snowpack builds.
        float snLoad = clamp(uSnow, 0.0, 1.0);
        float snLine = 1.05 - snLoad * 1.5 * ${strength.toFixed(2)};
        float snHeight = vSnowHeight + (snGrain - 0.5) * 0.035;
        float snGradient = smoothstep(snLine - 0.22, snLine + 0.18, snHeight);
        float snFacing = mix(0.78, 1.0, smoothstep(-0.25, 0.65, vSnowUp));
        float snCover = snGradient * snFacing * (0.94 + 0.06 * snGrain);
        // Deep snow blankets even the lower and sheltered foliage.
        snCover = mix(snCover, 1.0, smoothstep(0.72, 1.0, snLoad));
        diffuseColor.rgb = mix(diffuseColor.rgb, ${SNOW_RGB}, snCover);` : `
        float snCover = uSnow * ${strength.toFixed(2)} * smoothstep(0.25, 0.8, vSnowUp) * (0.7 + 0.3 * snGrain);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${SNOW_RGB}, clamp(snCover * 1.15, 0.0, 0.9));`}
      }`);
    if (crown) shader.fragmentShader = 'varying float vSnowHeight;\n' + shader.fragmentShader;
  };
  mat.customProgramCacheKey = () => baseKey + '|snow' + strength + (crown ? ':crown-gradient' : '');
  return mat;
}
