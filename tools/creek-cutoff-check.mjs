// Big floods trim tight creek bends (decision 0054): node tools/creek-cutoff-check.mjs
// - A fresh farm on every map has no bend a flood may cut, and a flood there draws nothing more from
//   the run's random stream (so seeded runs and calibrate play out as before).
// - On the PNW, a creek dug off the ditch with a right-angle corner (dug tile by tile, as an old save
//   or a creek filled back to a corner leaves one) is cut round by big floods: the bend is gone, the
//   creek still runs from its head to the ditch, salmon-depth water all along the new channel, the old
//   loop is marsh on its old bed, no other water's level moved, nothing built moved, and the flood's
//   notice says so. A small flood never cuts.
// - A beaver dam near the bend, or a creek dug with the creek tool (steered round, within the limit),
//   is never cut.
// - Save and load keep the new course and its heights; the new channel is known as dug creek again.
import assert from 'node:assert/strict';
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { BIOME_LIST } = await import('../js/biome.js');
const { T, F, isWater } = await import('../js/config.js');
const { TOOLS } = await import('../js/tools.js');
const { ToolActions } = await import('../js/tool-actions.js');
const { tileWaterLevel, FISH_DEPTH } = await import('../js/sim/waterline.js');
const { waterModel } = await import('../js/sim/hollis-water.js');
const { compactSave } = await import('../js/saves.js');
const { sharpBends } = await import('../js/maps/water-shape.js');
const { swimsBetween } = await import('../js/sim/swim-routes.js');
const { cutoffCandidates, floodCutoff } = await import('../js/sim/creek-cutoff.js');
waterModel.enabled = true;

let checks = 0, failed = 0;
const check = (name, fn) => { try { fn(); checks++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + (e.stack || e.message)); } };
const farm = (map = 'pnw', runSeed = 1) => { const g = new Game(); g.newGame(1987, 'free', 'standard', map, runSeed); g.autosave = false; return g; };
const dig = (g, tiles) => { for (const [x, y] of tiles) TOOLS.creek.apply(g, g.world.idx(x, y)); g.refreshEnvironment(); };
// (the PNW's ditch runs down x = 54 from y = 48 to the river, culvert at y = 75: an L-shaped creek dug
// off it east along y = Y, then south along x = X, its corner at (X, Y). Turning north instead, up
// Hollis's slope, the corner is a drop the shorter cut can't grade for fish, and it is refused)
const MAIN = 54, X = 62, Y = 56, HEAD = Y + 8;
const L_CREEK = [];
for (let x = MAIN + 1; x <= X; x++) L_CREEK.push([x, Y]);
for (let y = Y + 1; y <= HEAD; y++) L_CREEK.push([X, y]);
const near = (b, x, y, r) => Math.abs(b.x - x) <= r && Math.abs(b.y - y) <= r;
// Big floods until one cuts the bend (at most 20): what the flood said, and the cut.
function floodUntilCut(g, intensity = 1.8, tries = 20) {
  const notes = [];
  g.on('notify', n => notes.push(n.text));
  for (let k = 0; k < tries; k++) {
    const before = g.world.terrain.slice();
    g.events.startFlood(intensity);
    // (the flood goes down before the next: flooded ground is left as it was)
    g.world.flood.fill(0); g.events.floodTiles = 0;
    const add = [], loop = [];
    for (let i = 0; i < g.world.n; i++) if (g.world.terrain[i] !== before[i]) (g.world.terrain[i] === T.CREEK ? add : loop).push(i);
    if (add.length || loop.length) return { add, loop, notes, floods: k + 1 };
  }
  return { add: [], loop: [], notes, floods: tries };
}

check('A fresh farm on every map has no bend to cut, and its floods draw no more random numbers', () => {
  for (const map of BIOME_LIST.map(b => b.id)) {
    const g = farm(map);
    assert.equal(cutoffCandidates(g).length, 0, `${map}: a bend to cut`);
    let draws = 0;
    const rng = g.rng; g.rng = () => { draws++; return rng(); };
    assert.equal(floodCutoff(g, 1.8), null, `${map}: cut`);
    assert.equal(draws, 0, `${map}: random numbers drawn`);
  }
});

let cutGame = null, cut = null;
check('PNW: big floods cut a right-angle creek bend round, and the old loop is left as marsh', () => {
  const g = farm(), w = g.world;
  dig(g, L_CREEK);
  assert.ok(sharpBends(w).some(b => near(b, X, Y, 2)), 'the dug corner is a sharp bend');
  const corners = () => { const o = []; for (let vy = 0; vy <= w.h; vy++) for (let vx = 0; vx <= w.w; vx++) o.push(w.vert(vx, vy)); return o; };
  const vh0 = corners(), levels = new Map();
  for (let i = 0; i < w.n; i++) { const l = tileWaterLevel(w, i); if (l != null) levels.set(i, l); }
  const mainBed = []; for (let y = 48; y < 84; y++) mainBed.push(...w.corners(MAIN, y));
  const culvert = []; for (let i = 0; i < w.n; i++) if (w.feature[i] === F.CULVERT) culvert.push(i);
  const r = floodUntilCut(g);
  console.log(`  cut after ${r.floods} big flood(s): ${r.add.length} tiles of new channel, ${r.loop.length} of old loop`);
  assert.ok(r.add.length > 0 && r.add.length <= 8 && r.loop.length > 0 && r.loop.length <= 10, 'a few tiles cut');
  assert.ok(!sharpBends(w).some(b => near(b, X, Y, 9)), 'no sharp bend left there');
  assert.ok(r.loop.every(i => w.terrain[i] === T.MARSH), 'the old loop is marsh');
  assert.ok(r.notes.some(t => /new channel across a tight bend/.test(t)), 'the flood notice says so');
  // (the creek still runs from its head to the ditch, through creek tiles)
  const seen = new Set([w.idx(X, HEAD)]), q = [w.idx(X, HEAD)];
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % w.w, y = (i / w.w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = w.idx(x + dx, y + dy); if (w.inb(x + dx, y + dy) && !seen.has(j) && w.terrain[j] === T.CREEK) { seen.add(j); q.push(j); } } }
  assert.ok(seen.has(w.idx(MAIN, Y)), 'the creek still reaches the ditch from its head');
  // (fish swim the whole creek both ways, head to ditch, by the test their routes use: swim-routes.js)
  const route = [w.idx(X, HEAD)], prev = new Map([[route[0], -1]]);
  for (let h = 0; h < route.length; h++) { const i = route[h], x = i % w.w, y = (i / w.w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = w.idx(x + dx, y + dy); if (w.inb(x + dx, y + dy) && !prev.has(j) && w.terrain[j] === T.CREEK) { prev.set(j, i); route.push(j); } } }
  for (let i = w.idx(MAIN, Y); prev.get(i) >= 0; i = prev.get(i)) {
    const j = prev.get(i);
    assert.ok(swimsBetween(w, i, j, FISH_DEPTH) && swimsBetween(w, j, i, FISH_DEPTH), `fish swim between ${i % w.w},${(i / w.w) | 0} and ${j % w.w},${(j / w.w) | 0}`);
  }
  // (no height moved beyond the cut and the shore pass's reach round it: the player's dug creek above
  // and below keeps its bed)
  const reach = new Set();
  for (const i of [...r.add, ...r.loop]) { const x = i % w.w, y = (i / w.w) | 0; for (let dy = -4; dy <= 5; dy++) for (let dx = -4; dx <= 5; dx++) reach.add((y + dy) * (w.w + 1) + x + dx); }
  const vh1 = corners();
  for (let k = 0; k < vh1.length; k++) if (!reach.has(k)) assert.equal(vh1[k], vh0[k], `corner ${k % (w.w + 1)}, ${(k / (w.w + 1)) | 0} moved`);
  assert.ok(r.loop.every(i => !Number.isFinite(w.dugBed[i])), 'the old loop is no longer dug creek');
  // (the oxbow holds water on its old bed, not over the land round it)
  for (const i of r.loop) {
    const x = i % w.w, y = (i / w.w) | 0, L = tileWaterLevel(w, i);
    assert.ok(L != null && L > Math.min(...w.corners(x, y)), `the oxbow at ${x}, ${y} holds water`);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = w.idx(x + dx, y + dy); if (!isWater(w.terrain[j])) assert.ok(w.tileH(x + dx, y + dy) > L - 0.05, `land beside the oxbow at ${x + dx}, ${y + dy} under its water`); }
  }
  // (every other water tile's level where it was, the ditch's bed and the culvert untouched)
  const cutTiles = new Set([...r.add, ...r.loop]);
  for (const [i, l] of levels) if (!cutTiles.has(i)) { const now = tileWaterLevel(w, i); assert.ok(now != null && Math.abs(now - l) < 1e-6, `water at ${i % w.w}, ${(i / w.w) | 0} moved ${l} → ${now}`); }
  const mainNow = []; for (let y = 48; y < 84; y++) mainNow.push(...w.corners(MAIN, y));
  assert.deepEqual(mainNow, mainBed, 'the ditch keeps its bed');
  assert.ok(culvert.every(i => w.feature[i] === F.CULVERT), 'the culvert stays');
  assert.ok(r.add.every(i => Number.isFinite(w.dugBed[i])), 'the new channel is graded as dug creek');
  cutGame = g; cut = r;
});

check('PNW: a bend whose cut fish could not swim (a drop up the slope) is refused, the farm left as it was', () => {
  const g = farm(), w = g.world, tiles = [];
  for (let x = MAIN + 1; x <= X; x++) tiles.push([x, 65]);
  for (let y = 64; y >= 57; y--) tiles.push([X, y]);
  dig(g, tiles);
  assert.ok(sharpBends(w).some(b => near(b, X, 65, 2)), 'a sharp bend');
  const vh = w.vh.slice(), terrain = w.terrain.slice(), dug = w.dugBed.slice();
  assert.equal(cutoffCandidates(g, 1.8).length, 0, 'refused');
  assert.deepEqual([...w.vh], [...vh], 'heights put back after the trial');
  assert.deepEqual([...w.terrain], [...terrain], 'terrain put back');
  assert.deepEqual([...w.dugBed].map(String), [...dug].map(String), 'dug creek marks put back');
});

// (the land inside this bend stands so low that even the most a farm's wetlands soak up, 60%, leaves
// a big flood over it: 95% here only checks the share is counted)
check('PNW: the wetlands\' share of a flood is counted: water kept off the land inside the bend cuts nothing', () => {
  const g = farm(); dig(g, L_CREEK);
  assert.ok(cutoffCandidates(g, 1.8 * 0.4).length > 0, 'cut at the most wetlands soak up');
  let draws = 0; const rng = g.rng; g.rng = () => { draws++; return rng(); };
  assert.equal(floodCutoff(g, 1.8, 0.95), null);
  assert.equal(draws, 0, 'no random number drawn');
});

check('PNW: a small flood never cuts a bend', () => {
  const g = farm(); dig(g, L_CREEK);
  const r = floodUntilCut(g, 1.0, 10);
  assert.equal(r.add.length + r.loop.length, 0);
});

check('PNW: a beaver dam near the bend keeps it as it is', () => {
  const g = farm(), w = g.world; dig(g, L_CREEK);
  w.feature[w.idx(X, Y + 6)] = F.DAM;
  const r = floodUntilCut(g, 1.8, 10);
  assert.equal(r.add.length + r.loop.length, 0);
});

check('PNW: a creek dug with the creek tool (steered within the limit) is never cut', () => {
  const g = farm(), w = g.world, acts = new ToolActions(g);
  const s = acts.begin('creek');
  for (const [x, y] of L_CREEK) acts.paint(s, x, y);
  acts.end(s); g.refreshEnvironment();
  assert.equal(sharpBends(w).length, 0, 'no sharp bend after a steered stroke');
  const r = floodUntilCut(g, 1.8, 10);
  assert.equal(r.add.length + r.loop.length, 0);
});

check('Save and load keep the new course, its heights, and know it as dug creek', () => {
  assert.ok(cutGame, 'cut farm from the earlier check');
  const g = cutGame, w = g.world, h = new Game();
  assert.equal(h.restoreSave(compactSave(g.saveData())), true);
  const v = h.world;
  for (let i = 0; i < w.n; i++) assert.equal(v.terrain[i], w.terrain[i], `terrain at ${i}`);
  for (const i of cut.add) {
    const x = i % w.w, y = (i / w.w) | 0;
    assert.deepEqual(v.corners(x, y).map(c => c.toFixed(4)), w.corners(x, y).map(c => c.toFixed(4)), `heights at ${x}, ${y}`);
    assert.ok(Number.isFinite(v.dugBed[i]), `dug creek at ${x}, ${y}`);
  }
});

console.log(`${checks} checks passed${failed ? `, ${failed} FAILED` : ''}`);
if (failed) process.exit(1);
