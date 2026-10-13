// Foliage wind and leaf lighting, plus the materials used by plant placement.
import * as THREE from 'three';
import { withFocusFade } from './focus.js';
import { withSnowTops } from './snow.js';
import { withClouds } from './atmosphere.js';

// Foliage sways in the wind: displacement grows with height above each plant's base.
const gust = { value: 1 }; // how hard it's blowing (storms push everything further)
export const windGust = gust;
// Leaf light: light wraps a little way round a leafy mass (so the shaded side falls off softly
// instead of going dark), and leaves with a low sun behind them glow where it shines through.
// A few extra operations per pixel; nothing else changes.
const LEAF_LIGHT = THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
  '\tfloat dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tvec3 irradiance = dotNL * directLight.color;',
  `\tfloat nl = dot( geometryNormal, directLight.direction );
\tfloat dotNL = saturate( ( nl + LEAF_WRAP ) / ( 1.0 + LEAF_WRAP ) );
\tvec3 irradiance = dotNL * directLight.color;
\tfloat back = pow( saturate( dot( geometryViewDir, - directLight.direction ) ), 2.0 ) * saturate( 0.55 - nl * 0.45 );
\tirradiance += back * LEAF_GLOW * directLight.color * vec3( 1.0, 0.93, 0.62 );`);
if (LEAF_LIGHT === THREE.ShaderChunk.lights_lambert_pars_fragment) console.warn('leaf light: three.js lighting code changed, leaves use plain lighting');

export function windy(mat, amount, wind, bothSidesLit = false, wrap = 0.3, glow = 0.55) {
  mat.onBeforeCompile = shader => {
    shader.fragmentShader = `#define LEAF_WRAP ${wrap.toFixed(2)}\n#define LEAF_GLOW ${glow.toFixed(2)}\n` + shader.fragmentShader.replace('#include <lights_lambert_pars_fragment>', LEAF_LIGHT);
    // thin blades: light both faces as if they faced the sky, instead of darkening the back
    if (bothSidesLit) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
    shader.uniforms.uTime = wind;
    shader.uniforms.uWind = { value: amount };
    shader.uniforms.uGust = gust;
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\nuniform float uGust;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 wOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        vec3 wOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif
      float wPh = uTime * 1.1 + wOrigin.x * 0.35 + wOrigin.z * 0.27;
      float wS = (sin(wPh) * 0.6 + sin(wPh * 2.3 + wOrigin.x) * 0.25 + 0.2) * uGust
        + max(uGust - 1.0, 0.0) * 0.2 * sin(uTime * 2.2 + wOrigin.x * 0.9) * sin(uTime * 0.5 + wOrigin.z * 0.5); // gusts rolling through
      float wH = max(transformed.y, 0.0);
      transformed.x += wS * wH * wH * uWind;
      transformed.z += wS * 0.5 * wH * wH * uWind;`);
  };
  mat.customProgramCacheKey = () => 'wind' + amount + (bothSidesLit ? 'b' : '') + ':leaf' + wrap + glow;
  return mat;
}

// Each Flora owns its materials and time uniform; gust strength remains session-wide.
export function createPlantMaterials(wind) {
  const materials = {};
  // everything that can hide an animal dissolves around the selected one (see focus.js)
  // ...and everything catches snow on top in winter (see snow.js)
  materials.foliage = withClouds(withSnowTops(withFocusFade(windy(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.012, wind)), 0.95, { crown: true }));
  materials.shrubs = withClouds(withSnowTops(withFocusFade(windy(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.12, wind, false, 0.38, 0.6), 0.75), 0.85));
  materials.grass = withClouds(withSnowTops(withFocusFade(windy(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 1.4, wind, true, 0.5, 0.7), 0.4), 1.3));
  materials.tallGrass = withClouds(withSnowTops(withFocusFade(windy(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0.4, wind, true, 0.5, 0.7), 0.9), 1.3));
  materials.bark = withClouds(withSnowTops(withFocusFade(new THREE.MeshLambertMaterial({ vertexColors: true })), 1));
  materials.small = withClouds(withSnowTops(withFocusFade(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.35), 1));
  // Occupied branches stay solid when foliage is revealed. They use the real
  // tree scaffold, with no focus cutout, wind deformation or global tree fade.
  materials.canopyBark = withClouds(withSnowTops(new THREE.MeshLambertMaterial({ vertexColors: true }), 1));
  // Keep the occupied tree's leaves beneath the feet as well as its wood.
  // Higher foliage still opens around a selected animal so it remains visible.
  materials.canopyCrown = withClouds(withSnowTops(withFocusFade(new THREE.MeshLambertMaterial({ vertexColors: true,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 0, { supportCrown: true }), .95, { crown: true }));
  // soft contact shadows on the ground under trees and bushes, so they still sit on the land
  // when the sun's shadows are off (see Renderer.draw)
  materials.contact = new THREE.MeshBasicMaterial({ color: 0x0a1206, vertexColors: true, transparent: true, opacity: 0.48, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  materials.contact.visible = false; // (the renderer shows them only while the sun's shadows are off)
  return materials;
}
