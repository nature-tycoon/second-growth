// Player-dug creeks and joined ponds (decision 0048): node tools/dug-creek-check.mjs
// - A creek dug across Hollis's slope into the main creek is graded: every dug tile's water covers its
//   whole bed by at least FISH_DEPTH, the main creek's own bed doesn't move, and salmon swim it both ways
//   (from the dug creek into the main creek, and from the main creek up into the dug creek), over three
//   run seeds. Before, carve() left dry chutes over a metre high and every salmon stayed in the dug creek.
// - Dug in two strokes (the upper part first, on its own, then the joining part), it's graded when joined.
// - A pond dug up to the creek holds the creek's level through a dry summer; one two tiles off is a
//   vernal pool and draws down.
// - Digging never moves the corners of other water (the map's creek), and generated maps are unchanged.
// - Widening a pond joined to a creek (the map's, or a creek dug into it) keeps its water surface, its
//   floor a pond's depth under that water and a bank round it over the water, and leaves the creek's bed where it
//   was. Before, each tile of the widening stroke re-levelled the pond against the creek corners it had
//   just lowered, sinking pond and creek a step at a time: 1.9 levels (4.5 m) for a 6 by 4 stroke, a pit
//   with its water far under the rim (Cole, 2026-11-20).
import assert from 'node:assert/strict';
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { T, F } = await import('../js/config.js');
const { TOOLS } = await import('../js/tools.js');
const { tileWaterLevel, swimDepth, FISH_DEPTH } = await import('../js/sim/waterline.js');
const { waterModel } = await import('../js/sim/hollis-water.js');
const { compactSave } = await import('../js/saves.js');
waterModel.enabled = true;

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
const farm = (runSeed = 1) => { const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw', runSeed); g.autosave = false; return g; };
const dig = (g, key, tiles) => { for (const [x, y] of tiles) TOOLS[key].apply(g, g.world.idx(x, y)); g.refreshEnvironment(); };
const row = (x0, x1, y) => { const out = []; for (let x = x0; x !== x1 + Math.sign(x1 - x0); x += Math.sign(x1 - x0)) out.push([x, y]); return out; };
// (the main creek runs down x = 54 from y = 45 to the river; the culvert under the road blocks fish)
const MAIN = 54, Y = 65;
const mainCorners = w => { const out = []; for (let y = 46; y < 84; y++) out.push(...w.corners(MAIN, y)); return out; };

check('A creek dug across the slope is graded: its water covers its bed, and the main creek is untouched', () => {
  const g = farm(), w = g.world, before = mainCorners(w);
  dig(g, 'creek', row(64, 55, Y));
  assert.deepEqual(mainCorners(w), before, 'the main creek keeps its bed');
  for (let x = 55; x <= 64; x++) {
    const c = w.corners(x, Y), L = tileWaterLevel(w, w.idx(x, Y));
    assert.ok(L - Math.max(...c) >= FISH_DEPTH, `dug tile ${x} covered (${(L - Math.max(...c)).toFixed(2)})`);
  }
  for (let fx = MAIN + 0.5; fx <= 64.5; fx += 0.05) assert.ok(swimDepth(w, fx, Y + 0.5) >= FISH_DEPTH, `swimmable at x ${fx.toFixed(2)}`);
});

check('Dug in two strokes, it is graded once it is joined', () => {
  const g = farm(), w = g.world;
  dig(g, 'creek', row(64, 60, Y));
  dig(g, 'creek', row(59, 55, Y));
  for (let fx = MAIN + 0.5; fx <= 64.5; fx += 0.05) assert.ok(swimDepth(w, fx, Y + 0.5) >= FISH_DEPTH, `swimmable at x ${fx.toFixed(2)}`);
});

check('Salmon swim between a dug creek and the main creek both ways', () => {
  const out = [], into = [];
  for (const runSeed of [1, 2, 3]) {
    const g = farm(runSeed), w = g.world, wl = g.wildlife, coho = g.catalog.animal.coho;
    dig(g, 'creek', row(64, 55, Y));
    for (let i = 0; i < w.n; i++) if (w.feature[i] === F.CULVERT) w.feature[i] = 0;
    g.refreshEnvironment();
    wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability();
    // (the fresh farm's creek is unshaded, so coho rate it poor and stay put: rate every creek tile good)
    const good = () => { for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.CREEK) wl.suit[coho.index][i] = 0.8; };
    good();
    const down = [0, 1, 2].map(() => wl.spawn(coho, 63, Y, { silent: true })), up = [0, 1, 2].map(() => wl.spawn(coho, MAIN, 58, { silent: true }));
    const reached = new Set(), entered = new Set();
    for (let day = 0; day < 40; day++) {
      for (let s = 0; s < 20; s++) wl.update(0.05);
      g.day++; wl.daily(); good();
      for (const a of down) if (a.x < MAIN + 1 && (a.y < Y - 1 || a.y > Y + 2)) reached.add(a.id);
      for (const a of up) if (a.x >= 58) entered.add(a.id);
    }
    out.push(reached.size); into.push(entered.size);
  }
  console.log(`  of 3 salmon a seed: out into the main creek ${out.join(', ')}; up into the dug creek ${into.join(', ')}`);
  assert.ok(out.every(n => n >= 2), 'most salmon leave the dug creek in every seed');
  assert.ok(into.reduce((a, b) => a + b) >= 3, 'salmon in the main creek swim up the dug creek');
});

check('A pond dug up to the creek holds its level through a dry summer; one two tiles off draws down', () => {
  const summer = gap => {
    const g = farm(), w = g.world;
    const tiles = []; for (let y = 60; y < 63; y++) for (let x = MAIN + 1 + gap; x < MAIN + 4 + gap; x++) tiles.push([x, y]);
    dig(g, 'pond', tiles);
    const b = g.water.basins.find(b => b.core.includes(w.idx(MAIN + 1 + gap, 60))), creek = tileWaterLevel(w, w.idx(MAIN, 61));
    const start = g.water.level(b);
    g.weather = 'clear';
    while (g.month !== 3) g.day++;
    for (let k = 0; k < 90; k++) { g.water.step(g); g.day++; }
    return { start, end: g.water.level(b), creek, after: tileWaterLevel(w, w.idx(MAIN, 61)), b, w };
  };
  const joined = summer(0);
  assert.ok(joined.b.feed != null, 'joined to the creek');
  assert.ok(Math.abs(joined.start - joined.creek) < .02 && Math.abs(joined.end - joined.after) < .02, `at the creek's level (${joined.end.toFixed(2)} vs ${joined.after.toFixed(2)})`);
  assert.ok(joined.b.core.every(i => joined.w.terrain[i] === T.POND), 'still open water');
  const apart = summer(2);
  assert.equal(apart.b.feed, null, 'two tiles off: on its own');
  assert.ok(apart.end < apart.start - .1, `a vernal pool draws down (${apart.start.toFixed(2)} -> ${apart.end.toFixed(2)})`);
});

check('A joined pond keeps its level through a save and load', () => {
  const g = farm(), w = g.world;
  const tiles = []; for (let y = 60; y < 63; y++) for (let x = MAIN + 1; x < MAIN + 4; x++) tiles.push([x, y]);
  dig(g, 'pond', tiles); dig(g, 'creek', row(64, 58, Y));
  const h = new Game();
  assert.equal(h.restoreSave(compactSave(g.saveData())), true);
  const b = h.water.basins.find(b => b.core.includes(h.world.idx(MAIN + 1, 60)));
  assert.ok(b.feed != null && Math.abs(h.water.level(b) - tileWaterLevel(h.world, h.world.idx(MAIN, 61))) < .02);
  assert.ok(Number.isFinite(h.world.dugBed[h.world.idx(60, Y)]) && !Number.isFinite(h.world.dugBed[h.world.idx(MAIN, Y)]), 'dug creek known again after loading');
});

// (the corners of creek tiles no pond tile touches, before and after: the creek's own bed)
const creekBed = (w, pond) => {
  const out = [];
  for (let i = 0; i < w.n; i++) {
    if (w.terrain[i] !== T.CREEK) continue;
    const x = i % w.w, y = (i / w.w) | 0;
    for (const [vx, vy] of [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]]) {
      if ([[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([ox, oy]) => pond.has(w.idx(vx + ox, vy + oy)))) continue;
      out.push(w.vert(vx, vy));
    }
  }
  return out;
};
const rect = (x0, x1, y0, y1) => { const out = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]); return out; };
for (const [name, first, feeder, widen] of [
  ['beside the map\'s creek', rect(MAIN + 1, MAIN + 3, 60, 62), null, rect(MAIN + 1, MAIN + 6, 63, 66)],
  ['with a creek dug into it', rect(60, 62, 60, 62), row(68, 63, 61), rect(60, 65, 63, 66)],
  // (the pond wraps round the creek's end tile, touching all its corners, then widens)
  ['wrapped round the creek\'s end', rect(60, 62, 60, 62), row(68, 63, 61), [[63, 60], [63, 62], ...rect(60, 65, 63, 66)]],
]) check(`Widening a creek-fed pond ${name} keeps its water near the rim, and the creek's bed`, () => {
  const g = farm(), w = g.world;
  dig(g, 'pond', first);
  if (feeder) dig(g, 'creek', feeder);
  const at = () => g.water.basins.find(b => b.core.includes(w.idx(...first[0])));
  const before = g.water.level(at()), all = new Set([...first, ...widen].map(([x, y]) => w.idx(x, y))), creekWas = creekBed(w, all);
  dig(g, 'pond', widen);
  const b = at(), pond = new Set(b.core), L = g.water.level(b);
  assert.ok(b.feed != null, 'still joined to the creek');
  assert.deepEqual(creekBed(w, all), creekWas, 'the creek keeps its bed');
  // (the same surface, or the creek's a little lower where the pond now reaches further down it: a pond
  // along a falling creek joins it at its low end)
  assert.ok(Math.abs(L - before) < .1, `the same water surface (${before.toFixed(2)} -> ${L.toFixed(2)})`);
  const floor = Math.min(...b.core.map(i => Math.min(...w.corners(i % w.w, (i / w.w) | 0))));
  assert.ok(L - floor < .65, `floor a pond's depth under the water, no pit (${(L - floor).toFixed(2)} deep)`);
  // (the bank: the outer corners of the land round the pond stand over its water, where no other
  // water or building holds them)
  const ring = new Set();
  for (const i of b.core) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const j = w.idx(i % w.w + dx, ((i / w.w) | 0) + dy);
    if (!pond.has(j) && w.terrain[j] !== T.CREEK && w.terrain[j] !== T.RIVER && w.struct[j] < 0) ring.add(j);
  }
  const wet = [...ring].filter(j => w.terrain[j] === T.POND || w.terrain[j] === T.MARSH);
  // (a shallow sedge margin on the bank's foot is fine where the pond is dug deeper than a pond's depth
  // under the creek's level; a pit isn't: the rim stands over the water all round)
  assert.ok(wet.length <= ring.size * .5, `mostly a dry bank round it (${wet.length} of ${ring.size} bank tiles wet)`);
  // (leaving out the land between the pond and the creek, whose corners the creek holds)
  const byCreek = j => [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => w.terrain[j + dy * w.w + dx] === T.CREEK));
  const low = [...ring].filter(j => !byCreek(j) && Math.max(...w.corners(j % w.w, (j / w.w) | 0)) < L + .1);
  assert.equal(low.length, 0, `the rim stands over the water (${low.length} bank tiles under it)`);
  // (digging the same stroke again moves nothing: re-levelling is stable)
  const again = creekBed(w, pond), hv = w.hv;
  dig(g, 'pond', widen);
  assert.deepEqual(creekBed(w, pond), again, 'a second pass leaves the creek as it is');
  assert.equal(w.hv, hv, 'a second pass moves no corner');
  assert.ok(Math.abs(g.water.level(at()) - L) < .02, 'nor the water');
});

console.log(`dug-creek-check: ${checks} checks passed`);
