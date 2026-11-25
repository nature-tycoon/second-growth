// node tools/terrain-patch-check.mjs [maps] [--report]
// Land tools redraw only the edited patch (Terrain.reshape, batch phone-creeks-fish s7). On every map,
// strokes of Raise, Lower, Fill & grade, Dig creek, Dig pond and Demolish go through ToolActions as a
// player's do, the drawing following each sample the way Scene.refreshWorld does (reshape, then a patch
// repaint of the ground; the water held while dragging near water, then caught up), and at the end of
// the stroke (the creek run on, the shores shaped again). Then:
// - everything drawn matches a fresh whole-map updateHeights + updateSurface exactly: the ground's
//   positions, normals, colours, snow, shore heights and UVs, the tile textures, the overlay, the
//   height range, the skirt, the farm line and every water attribute (so no seam at the patch's edge,
//   and the water skipped far from water really was unchanged);
// - every ground position and normal that changed lies inside the ranges sent to the graphics chip;
// - a drag frame and the end of a stroke cost a small fraction of a whole-map rebuild: under
//   DRY_SHARE of it away from water; near water (whose mesh is still rebuilt whole) a drag frame under
//   DRY_SHARE while its rebuild is held, and the end one water rebuild with no whole-map redraw.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Terrain } = await import('../js/render3d/terrain.js');
const { Game } = await import('../js/game.js');
const { ToolActions } = await import('../js/tool-actions.js');
const { BIOME_LIST } = await import('../js/biome.js');
const { T, isWater } = await import('../js/config.js');
const { mulberry32 } = await import('../js/rng.js');

globalThis.document = { createElement: () => ({
  getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} })
}) };
const atlas = { tex: null, uv: {}, slot: {} };
for (let season = 0; season < 4; season++) for (const t of Object.values(T)) {
  atlas.uv[t + '|' + season + '|0'] = [0.1 * (t % 8), 0.05 * season, 0.1 * (t % 8) + 0.1, 0.05 * season + 0.05];
  atlas.slot[t + '|' + season + '|0'] = t % 16;
}
const args = process.argv.slice(2), report = args.includes('--report');
const maps = args.find(a => !a.startsWith('--'))?.split(',') ?? BIOME_LIST.map(b => b.id);
// (near water the end of a stroke still rebuilds the water mesh whole: pond bodies, the current's
// coordinates and the riverbank stones are worked out over the whole map, 13-30 ms warm, more the first
// time a new stretch is drawn. That end is checked by what it does, one water rebuild and no whole-map
// redraw, not timed: one cold run against a warm median failed under load.)
const DRY_SHARE = 0.25, NEAR_END_BUILDS = 1;
let checks = 0, failed = 0;
const check = (name, fn) => { try { fn(); checks++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } };
const median = a => [...a].sort((p, q) => p - q)[a.length >> 1];

function make(map) {
  Math.random = mulberry32(1987);
  const game = new Game(); game.newGame(1987, 'free', 'standard', map);
  game.money = 1e9;
  const terrain = new Terrain(new THREE.Scene(), atlas);
  terrain.setWorld(game.world, game.border); terrain.updateSurface(game);
  terrain.setOverlay(new Float32Array(game.world.n * 4).fill(0.5)); // (an overlay that's on follows the land)
  return { game, terrain, actions: new ToolActions(game, { refreshEnvironment: false }) };
}

// Everything the drawing holds that a height change can move.
function snapshot(t) {
  const g = t.mesh.geometry, out = {};
  for (const n of ['position', 'normal', 'color', 'aSnow', 'aShore', 'uv']) out['ground.' + n] = g.attributes[n].array;
  out.tileData = t.tileData; out.tintData = t.tintData; out.top = t.top;
  out.overlay = t.overlay.geometry.attributes.position.array;
  out.skirt = t.skirt.geometry.attributes.position.array;
  out.line = t.line.geometry.attributes.position.array;
  out.hRange = Float64Array.from(t.tiles.hRange.value.toArray());
  for (const [n, a] of Object.entries(t.water?.geometry.attributes || {})) out['water.' + n] = a.array;
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.slice()]));
}
function same(a, b, label) {
  for (const k of Object.keys(b)) {
    assert.equal(a[k]?.length, b[k].length, `${label}: ${k} length`);
    const at = b[k].findIndex((v, i) => !Object.is(v, a[k][i]));
    assert.equal(at, -1, `${label}: ${k} differs at ${at} (${a[k][at]} vs ${b[k][at]})`);
  }
}

// The drawing's side of one frame of the stroke, as Scene.refreshWorld: reshape (water held while
// dragging), then the ground patch repainted; returns ms. `ranges` checks the uploads.
function frame(game, t, dragging, state) {
  const g = t.mesh.geometry, before = [g.attributes.position.array.slice(), g.attributes.normal.array.slice()];
  const at = performance.now();
  let area = null, whole = false;
  const grow = a => { if (!a) return; area = area ? { x0: Math.min(area.x0, a.x0), y0: Math.min(area.y0, a.y0), x1: Math.max(area.x1, a.x1), y1: Math.max(area.y1, a.y1) } : { ...a }; };
  if (game.world.hv !== t.hv) {
    const r = t.reshape(dragging);
    if (r === 'all') { whole = true; state.whole = true; }
    else { grow(r.area); if (r.water === 'held') state.held = true; if (r.water === 'built') state.built++; }
  }
  if (state.held && !dragging) { state.held = false; const was = t.water; t.refreshWater(); if (t.water !== was) { state.built++; grow(t.shoreMoved); } }
  if (whole) t.updateSurface(game); else if (area) t.updateSurface(game, area);
  const ms = performance.now() - at;
  ['position', 'normal'].forEach((n, q) => {
    const attr = g.attributes[n], a = attr.array, ranges = attr.updateRanges;
    if (!ranges.length) return; // (sent up whole)
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], before[q][i])) assert.ok(ranges.some(r => i >= r.start && i < r.start + r.count), `${n}[${i}] changed outside the uploaded range`);
  });
  return ms;
}

// A stroke as a player drags it: tile by tile along `path`, then let go.
function stroke(game, t, actions, tool, path, radius = 0) {
  const s = actions.begin(tool);
  assert.ok(s, `${tool}: stroke began`);
  const state = { held: false, built: 0, whole: false }, drag = [];
  for (const [x, y] of path) { actions.paint(s, x, y, radius); drag.push(frame(game, t, true, state)); }
  actions.end(s);
  const end = frame(game, t, false, state);
  return { drag, end, changed: s.changed.length, built: state.built, whole: state.whole };
}

const wholeCost = (game, t) => { const s = []; for (let k = 0; k < 5; k++) { const at = performance.now(); t.updateHeights(); t.updateSurface(game); s.push(performance.now() - at); } return median(s); };

// Places to work: open land at least `far` tiles from any water (or within `near` of it), away from
// buildings and locked ground, with room for a short stroke east.
function spot(game, { far = 0, near = 0, len = 6, avoid = [] }) {
  const w = game.world, def = game.catalog.definition;
  const ok = (x, y) => w.inb(x, y) && !isWater(w.terrain[w.idx(x, y)]) && w.struct[w.idx(x, y)] < 0 && !def.locked?.(game, w.idx(x, y))
    && w.terrain[w.idx(x, y)] !== T.ROAD && w.terrain[w.idx(x, y)] !== T.GRAVEL;
  const waterWithin = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (w.inb(xx, yy) && isWater(w.terrain[w.idx(xx, yy)])) return true; } return false; };
  for (let y = 6; y < w.h - 6; y += 3) for (let x = 6; x < w.w - len - 6; x += 3) {
    if (avoid.some(([ax, ay]) => Math.abs(ax - x) < 12 && Math.abs(ay - y) < 12)) continue;
    let good = true;
    for (let k = 0; k < len && good; k++) good = ok(x + k, y) && (far ? !waterWithin(x + k, y, far) : true);
    if (!good) continue;
    if (near && !waterWithin(x, y, near)) continue;
    return [x, y];
  }
  return null;
}
const east = ([x, y], n) => Array.from({ length: n }, (_, k) => [x + k, y]);

for (const map of maps) {
  if (map === 'reef') continue; // (no land tools on the reef)
  check(`${map}: every land stroke redraws a patch that matches a whole-map redraw`, () => {
    const { game, terrain, actions } = make(map);
    const whole = wholeCost(game, terrain);
    const dry = spot(game, { far: 9, len: 8 }), dry2 = dry && spot(game, { far: 9, len: 8, avoid: [dry] });
    const wet = spot(game, { near: 1, len: 3 });
    const plan = [];
    if (dry) plan.push(['raise', east(dry, 8), 1, 'dry'], ['lower', east([dry[0], dry[1] + 3], 6), 1, 'dry'], ['fill', east([dry[0], dry[1] + 6], 6), 1, 'dry']);
    if (dry2) plan.push(['creek', east(dry2, 8), 0, 'new water'], ['pond', east([dry2[0], dry2[1] + 5], 3), 1, 'new water']);
    if (wet) plan.push(['raise', east(wet, 3), 1, 'near'], ['lower', east([wet[0], wet[1]], 3), 1, 'near']);
    // (one stroke from beside the water out onto dry land: the rebuild held near the water is still owed)
    const out = wet && (() => { const w = game.world; for (const d of [1, -1]) { const p = Array.from({ length: 14 }, (_, k) => [wet[0] + d * k, wet[1]]); if (p.every(([x, y]) => w.inb(x, y) && !isWater(w.terrain[w.idx(x, y)]))) return p; } return null; })();
    if (out) plan.push(['raise', out, 0, 'near to dry']);
    const road = (() => { const w = game.world; for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.ROAD || w.terrain[i] === T.GRAVEL) return [i % w.w, (i / w.w) | 0]; return null; })();
    if (road) plan.push(['demolish', [road], 0, 'demolish']);
    assert.ok(plan.length >= 5, `${map}: found places for the strokes (${plan.length})`);
    const rows = [], slow = [];
    let reshaped = 0;
    for (const [tool, path, r, kind] of plan) {
      const hv = game.world.hv, res = stroke(game, terrain, actions, tool, path, r);
      if (game.world.hv === hv) { rows.push(`${tool}/${kind}: no height change`); continue; }
      reshaped++;
      const patched = snapshot(terrain);
      terrain.updateHeights(); terrain.updateSurface(game);
      same(patched, snapshot(terrain), `${map} ${tool} (${kind})`);
      const dragMs = res.drag.length ? Math.max(...res.drag.slice(1).concat(res.drag[0])) : 0, dragMed = res.drag.length ? median(res.drag) : 0;
      rows.push(`${tool}/${kind}: drag median ${dragMed.toFixed(1)} max ${dragMs.toFixed(1)}, end ${res.end.toFixed(1)} ms, water rebuilds ${res.built}`);
      if (res.whole) slow.push(`${tool} (${kind}): a whole-map redraw`);
      if (kind === 'dry') {
        assert.equal(res.built, 0, `${tool}: no water rebuild away from water`);
        if (!(dragMed < whole * DRY_SHARE && res.end < whole * DRY_SHARE)) slow.push(`${tool}: drag ${dragMed.toFixed(1)} / end ${res.end.toFixed(1)} ms vs whole ${whole.toFixed(1)}`);
      } else {
        assert.ok(res.built >= 1 || kind === 'demolish', `${tool} (${kind}): its water was drawn`);
        if (!(dragMed < whole * DRY_SHARE)) slow.push(`${tool} (${kind}): drag median ${dragMed.toFixed(1)} ms vs whole ${whole.toFixed(1)}`);
        // (its end is one cold water rebuild, timed once against a warm median: too noisy to time under
        // load, so what it does is checked instead)
        if (res.built > NEAR_END_BUILDS) slow.push(`${tool} (${kind}): ${res.built} water rebuilds`);
      }
    }
    assert.ok(reshaped >= 4, `${map}: at least four strokes reshaped the land (${reshaped})`);
    if (report || slow.length) console.log(`  ${map}: whole-map rebuild ${whole.toFixed(1)} ms\n    ` + rows.join('\n    '));
    assert.equal(slow.length, 0, slow.join('; '));
  });
}

check('An unchanged world reshapes nothing, and a big change still redraws exactly', () => {
  const { game, terrain } = make('pnw'), w = game.world;
  w.hv++;
  const r = terrain.reshape();
  assert.deepEqual(r, { area: null, water: 'same' });
  for (let y = 0; y <= w.h; y++) for (let x = 0; x <= w.w; x++) w.setVert(x, y, w.vert(x, y) + 0.01 * ((x * 7 + y * 3) % 5));
  w.hv++;
  terrain.reshape(); terrain.updateSurface(game);
  const patched = snapshot(terrain);
  terrain.updateHeights(); terrain.updateSurface(game);
  same(patched, snapshot(terrain), 'whole map reshaped');
});

console.log(failed ? `${failed} of ${checks + failed} terrain patch checks FAILED` : `${checks} terrain patch checks passed`);
if (failed) process.exit(1);
