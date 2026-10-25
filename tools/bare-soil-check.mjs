// node tools/bare-soil-check.mjs
// Bare earth up close (terrain-materials.js, SOIL_GLSL): the ground shader paints clods, pebbles and
// grit where the ground is bare and near the camera. Each tile tells it how bare it is and whether it's
// mud (low bits of the tile texture's green, under the rotation) and what kind of bare ground it is
// (blue: earth, sand or stones; 0 still marks crisp-edged tiles). Fast keeps only the grit.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Terrain } = await import('../js/render3d/terrain.js');
const { Game } = await import('../js/game.js');
const { T } = await import('../js/config.js');
globalThis.document = { createElement: () => ({ getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };
const atlas = { tex: null, uv: {}, slot: {} };
for (let season = 0; season < 4; season++) for (const t of Object.values(T)) { atlas.uv[`${t}|${season}|0`] = [0, 0, 0.1, 0.1]; atlas.slot[`${t}|${season}|0`] = t % 16; }

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
// what the shader reads back from a tile (tileBare, tileMud, the rotation in tileTex, crisp, tileStony, tileSand)
const read = (t, x, y) => {
  const k = ((y - t.Y0) * t.TW + (x - t.X0)) * 4, g = t.tileData[k + 1], b = t.tileData[k + 2];
  return { bare: (g % 32) / 31, mud: (g % 64) >= 32, rot: Math.floor(g / 64), crisp: b < 128, stony: Math.abs(b - 200) < 25, sand: Math.abs(b - 150) < 25 };
};
const paint = (map, cells) => {
  const g = new Game(); g.newGame(1987, 'free', 'standard', map);
  const w = g.world;
  for (const [x, y, terrain] of cells) {
    const i = w.idx(x, y);
    w.terrain[i] = terrain; w.variant[i] = 3; w.tree[i] = 0; w.shrub[i] = 0; w.ground[i] = 0; w.canopy[i] = 0; w.scorch[i] = 0; w.struct[i] = -1;
  }
  const t = new Terrain(new THREE.Scene(), atlas);
  t.setWorld(w, g.border); t.updateSurface(g);
  return { g, w, t };
};

check('Soil, mud and plowed fields are bare; grass is not; the rotation still reads back', () => {
  const { t } = paint('pnw', [[20, 20, T.SOIL], [21, 20, T.MUD], [22, 20, T.FIELD], [23, 20, T.PASTURE]]);
  const soil = read(t, 20, 20), mud = read(t, 21, 20), field = read(t, 22, 20), grass = read(t, 23, 20);
  assert.equal(soil.bare, 1); assert.equal(soil.mud, false); assert.equal(soil.rot, 3); assert.equal(soil.crisp, false);
  assert.equal(mud.bare, 1); assert.equal(mud.mud, true); assert.equal(mud.rot, 3);
  assert.equal(field.bare, 1); assert.equal(field.rot, 0, 'furrows all run one way'); assert.equal(field.crisp, true);
  assert.equal(grass.bare, 0); assert.equal(grass.rot, 3);
});

check('Groundcover growing on soil hides the bare earth', () => {
  const { g, w, t } = paint('pnw', [[20, 20, T.SOIL]]);
  const p = g.catalog.plants.find(p => p && p.layer === 0 && !p.aquatic && p.look.type === 'grass');
  const i = w.idx(20, 20); w.ground[i] = p.id; w.groundG[i] = 1;
  t.updateSurface(g);
  assert.equal(read(t, 20, 20).bare, 0);
});

check('Gravel is crusted earth on Serengeti, stones elsewhere', () => {
  const s = read(paint('serengeti', [[20, 20, T.GRAVEL]]).t, 20, 20);
  assert.equal(s.bare, 1); assert.equal(s.stony, false); assert.equal(s.sand, false); assert.equal(s.crisp, false);
  const p = read(paint('pnw', [[20, 20, T.GRAVEL]]).t, 20, 20);
  assert.equal(p.bare, 1); assert.equal(p.stony, true); assert.equal(p.crisp, false);
});

check('The shader paints soil only near the camera, and Fast leaves out the clods and the bump', () => {
  const { t } = paint('pnw', []);
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <map_fragment>\n#include <color_fragment>\n#include <normal_fragment_maps>' };
  t.material.onBeforeCompile(shader);
  const f = shader.fragmentShader;
  assert.ok(f.includes('float soilNear = 1.0 - smoothstep('), 'fades out once a tile texture is sharp');
  assert.ok(f.includes('if (soilK > 0.004)'), 'skipped where there is no bare ground near the camera');
  assert.ok(/#ifndef GROUND_FAST\s+if \(detail > 0\.0\)/.test(f), 'Fast: no clods or stones');
  assert.ok(/#ifndef GROUND_FAST\s+\{\s+\/\/ the soil's clods/.test(f), 'Fast: no bump');
  assert.ok(f.indexOf('bareEarth(diffuseColor.rgb') > f.indexOf('gameTrail(gp)'), 'worn trails get the soil too');
});

console.log(`${checks} bare soil checks passed`);
