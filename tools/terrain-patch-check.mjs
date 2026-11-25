// node tools/terrain-patch-check.mjs [maps] [--report] [--fuzz=steps]
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
//   DRY_SHARE of it away from water; near water a drag frame under DRY_SHARE while its water is held,
//   and the end one water rebuild, a patch (s11), with no whole-map redraw.
// Then the water alone (water-build.js, batch phone-creeks-fish s11), on every map:
// - fuzz: random height, water and growth changes near water (beyond what the tools allow: a moved creek
//   corner, a land tile turned to pond or creek, a pond filled, a pond-model level nudged, a building or
//   feature put on a bank, trees and sedge grown, a ground repaint between), each drawn as a patch on
//   one Terrain and compared with a whole build on another, byte for byte: every water attribute, the
//   shore heights, the tiles near water, the drawn surface (waterAt), the riverbank details, the falls;
//   shoreMoved covers every shore corner that moved; most of them really are patches (a change that
//   leaves the water as it was draws nothing, 'same': its banks aren't compared then);
// - cost: a bank corner beside a creek, a pond and the river moved, the patch's median under
//   WATER_SHARE of a whole water build's (warm medians, same conditions).
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
// (near water the end of a stroke is one water rebuild, a patch since s11 (water-build.js). It's checked
// by what it does, one patch and no whole-map redraw, not timed: one cold run against a warm median failed
// under load. The patch's cost is timed on its own below, warm medians against warm medians.)
const DRY_SHARE = 0.25, NEAR_END_BUILDS = 1, WATER_SHARE = 0.4;
const FUZZ_STEPS = +(args.find(a => a.startsWith('--fuzz='))?.slice(7) ?? 36); // (--fuzz=300 for a long run)
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
  if (state.built && t.waterPatch) (state.kinds ||= new Set()).add(t.waterPatch);
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
  return { drag, end, changed: s.changed.length, built: state.built, whole: state.whole, kinds: [...(state.kinds || [])] };
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
      rows.push(`${tool}/${kind}: drag median ${dragMed.toFixed(1)} max ${dragMs.toFixed(1)}, end ${res.end.toFixed(1)} ms, water rebuilds ${res.built} (${res.kinds.join(', ') || '-'})`);
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
        if (kind !== 'demolish' && res.kinds.includes('whole')) slow.push(`${tool} (${kind}): its water was built whole, not as a patch`);
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


// Everything the water drawing holds, for comparing a patch with a whole build.
function waterState(t) {
  const out = {};
  for (const [n, a] of Object.entries(t.water.geometry.attributes)) out['water.' + n] = a.array.slice();
  out.shore = t.shoreVertices.slice(); out.near = t.waterNear.slice();
  for (const m of ['falls', 'spills', 'fallRock']) out[m] = t[m] ? t[m].geometry.attributes.position.array.slice() : new Float32Array(0);
  const w = t.world, at = [];
  for (let k = 0; k < 3000; k++) at.push(t.waterAt(-8 + (k * 37.13) % (w.w + 16), -8 + (k * 19.71) % (w.h + 16)));
  out.waterAt = Float64Array.from(at);
  out.banks = new TextEncoder().encode(JSON.stringify(t.banks.details));
  return out;
}

for (const map of maps) {
  check(`${map}: the water patched after random changes near it matches a whole build`, () => {
    const { game, terrain: A } = make(map), w = game.world;
    const B = new Terrain(new THREE.Scene(), atlas); B.setWorld(w, game.border); B.updateSurface(game); // (its banks scattered for this month too)
    const rnd = mulberry32(map.length * 7919 + 11);
    const water = []; for (let i = 0; i < w.n; i++) if (isWater(w.terrain[i])) water.push(i);
    if (!water.length) return; // (the reef's sea: no tiles of water to draw)
    const kinds = { patch: 0, whole: 0, same: 0 };
    for (let step = 0; step < FUZZ_STEPS; step++) {
      // a few changes round one water tile, then one water build
      const i0 = water[Math.floor(rnd() * water.length)], x0 = i0 % w.w, y0 = (i0 / w.w) | 0;
      for (let e = 0; e < 1 + Math.floor(rnd() * 3); e++) {
        const x = x0 + Math.floor(rnd() * 7) - 3, y = y0 + Math.floor(rnd() * 7) - 3, r = rnd();
        if (!w.inb(x, y)) continue;
        const i = w.idx(x, y);
        if (r < 0.55) w.setVert(x + (rnd() < 0.5), y + (rnd() < 0.5), w.vert(x, y) + (rnd() - 0.55) * 0.5);
        else if (r < 0.7) { if (!isWater(w.terrain[i]) && w.struct[i] < 0) w.terrain[i] = [T.POND, T.MARSH, T.CREEK][Math.floor(rnd() * 3)]; else if (w.terrain[i] !== T.RIVER) w.terrain[i] = T.DUFF; }
        else if (r < 0.8 && w.waterManaged?.[i]) w.waterLevel[i] = rnd() < 0.2 ? NaN : rnd() < 0.5 ? w.waterLevel[i] + (rnd() - 0.5) * 0.006 : Math.min(...w.corners(x, y)) + rnd() * 0.5;
        else if (r < 0.8 && !isWater(w.terrain[i])) { if (rnd() < 0.5) w.feature[i] = w.feature[i] ? 0 : 1; else w.struct[i] = w.struct[i] >= 0 ? -1 : 0; }
        else { w.groundG[i] = rnd(); for (let k = 0; k < 4; k++) { const j = w.idx(Math.max(0, Math.min(w.w - 1, x + k - 2)), y); w.treeG[j] = Math.min(1, w.treeG[j] + rnd() * 0.3); } }
      }
      w.hv++;
      const before = A.shoreVertices.slice();
      if (rnd() < 0.3) A.banks.refresh(game.month); // (a ground repaint's refresh between builds: the per-cell memo)
      A.buildWater(); kinds[A.waterPatch]++;
      B.buildWater(true);
      const a = waterState(A), b = waterState(B);
      // (nothing in the water changed, so nothing was drawn: the banks stay as last scattered, as a ground
      // repaint's refresh keeps them till its rounded key moves; a whole build scatters them all again)
      if (A.waterPatch === 'same') { delete a.banks; delete b.banks; }
      same(a, b, `${map} step ${step} (${A.waterPatch})`);
      // (every shore corner that moved lies in shoreMoved, for the ground's wet fringe)
      const VW = A.TW + 1, m = A.shoreMoved;
      for (let v = 0; v < before.length / 2; v++) if (before[v * 2] !== a.shore[v * 2] || before[v * 2 + 1] !== a.shore[v * 2 + 1]) {
        const vx = v % VW + A.X0, vy = ((v / VW) | 0) + A.Y0;
        assert.ok(m && vx >= m.x0 && vx <= m.x1 + 1 && vy >= m.y0 && vy <= m.y1 + 1, `${map} step ${step}: shore corner (${vx}, ${vy}) moved outside shoreMoved`);
      }
    }
    assert.ok(kinds.patch >= 12 && kinds.patch >= 2 * kinds.whole, `${map}: most changes drawn as patches (${JSON.stringify(kinds)})`);
    if (report) console.log(`  ${map}: ${JSON.stringify(kinds)}`);
  });
}

check('A patch beside a creek, a pond and the river costs a small fraction of a whole water build', () => {
  const rows = [], slow = [];
  for (const map of maps) {
    if (map === 'reef') continue;
    const { game, terrain: t } = make(map), w = game.world;
    const spots = {};
    for (let i = 0; i < w.n && Object.keys(spots).length < 3; i++) {
      const tt = w.terrain[i], name = tt === T.CREEK ? 'creek' : tt === T.RIVER ? 'river' : tt === T.POND ? 'pond' : null;
      if (!name || spots[name]) continue;
      const x = i % w.w, y = (i / w.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (yy > 4 && w.inb(xx, yy) && !isWater(w.terrain[w.idx(xx, yy)]) && !spots[name]) spots[name] = [xx + (dx > 0), yy + (dy > 0)];
      }
    }
    const whole = []; for (let k = 0; k < 7; k++) { const a = performance.now(); t.buildWater(true); whole.push(performance.now() - a); }
    const W = median(whole), row = [`${map}: whole ${W.toFixed(1)} ms`];
    for (const [name, [vx, vy]] of Object.entries(spots)) {
      const h0 = w.vert(vx, vy), ms = [];
      for (let k = 0; k < 9; k++) { w.setVert(vx, vy, h0 + (k % 2 ? 0 : -0.08)); w.hv++; const a = performance.now(); t.buildWater(); ms.push(performance.now() - a); }
      w.setVert(vx, vy, h0); w.hv++; t.buildWater();
      const P = median(ms);
      row.push(`${name} ${P.toFixed(2)} (${(P / W * 100).toFixed(0)}%)`);
      if (!(P < W * WATER_SHARE)) slow.push(`${map} ${name}: ${P.toFixed(1)} ms vs whole ${W.toFixed(1)}`);
    }
    rows.push(row.join(', '));
  }
  if (report || slow.length) console.log('  ' + rows.join('\n  '));
  assert.equal(slow.length, 0, slow.join('; '));
});

console.log(failed ? `${failed} of ${checks + failed} terrain patch checks FAILED` : `${checks} terrain patch checks passed`);
if (failed) process.exit(1);
