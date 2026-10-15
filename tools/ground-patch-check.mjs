// node tools/ground-patch-check.mjs
// Brush strokes repaint only the edited patch of ground. The result must match a whole-map
// repaint exactly, and only the patch's rows may be sent to the graphics chip.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Terrain } = await import('../js/render3d/terrain.js');
import { Game } from '../js/game.js';
import { TOOLS } from '../js/tools.js';
import { T } from '../js/config.js';
import { mulberry32 } from '../js/rng.js';

// Terrain's only DOM dependency here creates a noise texture; no rendering or canvas art.
globalThis.document = { createElement: () => ({
  getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} })
}) };
const atlas = { tex: null, uv: {}, slot: {} };
for (let season = 0; season < 4; season++) for (const t of Object.values(T)) {
  atlas.uv[t + '|' + season + '|0'] = [0.1 * (t % 8), 0.05 * season, 0.1 * (t % 8) + 0.1, 0.05 * season + 0.05];
  atlas.slot[t + '|' + season + '|0'] = t % 16;
}
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
const ATTRS = ['color', 'aSnow', 'aShore', 'uv'];
const snapshot = terrain => ({
  ...Object.fromEntries(ATTRS.map(n => [n, terrain.mesh.geometry.attributes[n].array.slice()])),
  tileData: terrain.tileData.slice(), tintData: terrain.tintData.slice(),
});
function make(map) {
  Math.random = mulberry32(1987);
  const game = new Game(); game.newGame(1987, 'free', 'standard', map);
  game.money = 1e9;
  const terrain = new Terrain(new THREE.Scene(), atlas);
  terrain.setWorld(game.world, game.border); terrain.updateSurface(game);
  return { game, terrain };
}
// paint like a player: apply a tool tile by tile, repainting the patch as the renderer does
function paint(game, terrain, tool, tiles) {
  const w = game.world, area = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const [x, y] of tiles) {
    if (TOOLS[tool].apply(game, w.idx(x, y), Math.random) !== true) continue;
    area.x0 = Math.min(area.x0, x); area.y0 = Math.min(area.y0, y); area.x1 = Math.max(area.x1, x); area.y1 = Math.max(area.y1, y);
  }
  if (area.x0 === Infinity) return null;
  terrain.updateSurface(game, area);
  return area;
}
const line = (x, y, n, dx = 1, dy = 0) => Array.from({ length: n }, (_, k) => [x + k * dx, y + k * dy]);

for (const map of ['pnw', 'sumatra', 'chinandega', 'atlanta']) check(map + ': patch repaints match a whole-map repaint', () => {
  const { game, terrain } = make(map), w = game.world;
  const strokes = [
    ['clear', line(20, 30, 6)],
    ['log', [[40, 40], [41, 40], [44, 42]]],
    ['rocks', [[50, 20], [52, 22]]],
    ['trail', line(10, 10, 12, 0, 1)],
    ['clear', [[0, 0], [w.w - 1, w.h - 1], [0, w.h - 1]]], // (edges and corners of the property)
  ];
  let painted = 0;
  for (const [tool, tiles] of strokes) {
    if (!TOOLS[tool]) continue;
    const area = paint(game, terrain, tool, tiles);
    if (!area) continue;
    painted++;
    assert.ok(terrain.lastPaint < terrain.TW * terrain.TH * 0.35, `${tool} repainted a patch, not the map`);
    const partial = snapshot(terrain);
    terrain.updateSurface(game);
    const full = snapshot(terrain);
    for (const key of Object.keys(full)) assert.deepEqual(partial[key], full[key], `${map}/${tool}/${key}`);
  }
  assert.ok(painted >= 3, `${map}: at least three strokes changed the ground (${painted})`);
});

for (const map of ['pnw', 'sumatra', 'reef']) check(map + ': a day repainted band by band matches a whole-map repaint', () => {
  const { game, terrain } = make(map), whole = terrain.TW * terrain.TH;
  const month = game.month;
  for (let k = 0; k < 3; k++) game.dailyTick(); // (a few days' growth, shade and water within the month)
  assert.equal(game.month, month, 'still the same month');
  const bands = terrain.dayBands(game);
  assert.ok(bands && bands.length > 1, 'within a month the day goes in bands');
  for (const band of bands) { terrain.updateSurface(game, band); assert.ok(terrain.lastPaint < whole, 'each band is a patch'); }
  const banded = { ...snapshot(terrain), quality: terrain.water?.geometry.attributes.aQual?.array.slice() };
  terrain.updateSurface(game);
  const full = { ...snapshot(terrain), quality: terrain.water?.geometry.attributes.aQual?.array.slice() };
  for (const key of Object.keys(full)) {
    const a = banded[key], b = full[key]; // (the first difference, not a diff of two large arrays)
    assert.equal(a?.length, b?.length, `${map}/${key} length`);
    const at = b ? b.findIndex((v, i) => !Object.is(v, a[i])) : -1;
    assert.equal(at, -1, `${map}/${key} differs at ${at}`);
  }
});

check('A new month and season also go in bands, ending as a whole-map repaint', () => {
  const { game, terrain } = make('pnw'), whole = terrain.TW * terrain.TH;
  const season = game.season; while (game.season === season) game.dailyTick();
  for (const band of terrain.dayBands(game)) { terrain.updateSurface(game, band); assert.ok(terrain.lastPaint < whole, 'each band is a patch'); }
  const banded = snapshot(terrain);
  terrain.updateSurface(game);
  const full = snapshot(terrain);
  for (const key of Object.keys(full)) assert.equal(full[key].findIndex((v, i) => !Object.is(v, banded[key][i])), -1, key);
  game.world.carve(30, 30, .3); terrain.updateHeights();
  assert.equal(terrain.dayBands(game), null, 'reshaped land repaints the whole map at once');
});

check('Only the rows a patch covers are sent to the graphics chip', () => {
  const { game, terrain } = make('pnw');
  assert.ok(paint(game, terrain, 'log', [[30, 30], [32, 31]]), 'the logs went down');
  for (const name of ATTRS) {
    const attr = terrain.mesh.geometry.attributes[name], ranges = attr.updateRanges;
    assert.equal(ranges.length, 1, name);
    assert.ok(ranges[0].count * 4 < attr.array.byteLength * 0.1, `${name}: ${ranges[0].count * 4} of ${attr.array.byteLength} bytes`);
  }
  terrain.updateSurface(game);
  for (const name of ATTRS) assert.equal(terrain.mesh.geometry.attributes[name].updateRanges.length, 0, name + ' goes up whole');
});

check('A new month, reshaped land or a big patch repaints the whole map', () => {
  const { game, terrain } = make('pnw'), whole = terrain.TW * terrain.TH;
  terrain.updateSurface(game, { x0: 30, y0: 30, x1: 30, y1: 30 });
  assert.ok(terrain.lastPaint < whole);
  const was = game.month; while (game.month === was) game.day++;
  terrain.updateSurface(game, { x0: 30, y0: 30, x1: 30, y1: 30 });
  assert.equal(terrain.lastPaint, whole, 'new month');
  game.world.carve(30, 30, .3); terrain.updateHeights();
  terrain.updateSurface(game, { x0: 30, y0: 30, x1: 30, y1: 30 });
  assert.equal(terrain.lastPaint, whole, 'reshaped land');
  terrain.updateSurface(game, { x0: 0, y0: 0, x1: 100, y1: 80 });
  assert.equal(terrain.lastPaint, whole, 'big patch');
});

check('A patch repaint is much cheaper than a whole-map repaint', () => {
  const { game, terrain } = make('pnw');
  const time = fn => { fn(); const s = []; for (let k = 0; k < 9; k++) { const t = performance.now(); fn(); s.push(performance.now() - t); } return s.sort((a, b) => a - b)[4]; };
  const whole = time(() => terrain.updateSurface(game));
  const patch = time(() => terrain.updateSurface(game, { x0: 40, y0: 40, x1: 43, y1: 43 }));
  console.log(`  whole map ${whole.toFixed(2)} ms, 4x4 patch ${patch.toFixed(2)} ms`);
  assert.ok(patch < whole / 4, `patch ${patch} ms vs whole ${whole} ms`);
});

console.log(`${checks} ground patch checks passed`);
