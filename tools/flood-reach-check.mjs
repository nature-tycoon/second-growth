// Floods spread along every creek (decision 0034): node tools/flood-reach-check.mjs
// - On a fresh PNW farm a big flood reaches the land beside the ditch above the culvert at (54, 75),
//   not only the creek below it that the river's fish can reach. The culvert passes water; it still
//   stops fish (fish passage is unchanged by the flood).
// - Land still floods only as far as its height allows: every flooded tile beside a creek is within
//   the flood's rise over a creek within three tiles, or within the river's reach.
// - Buildings (struct) never flood; water tiles never carry flood marks.
// - A flood cut-off (0054) on a creek dug off the upper ditch still works with the wider flood: the
//   new channel carries no flood mark, the old loop is marsh.
import assert from 'node:assert/strict';
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { T, F, isWater } = await import('../js/config.js');
const { TOOLS } = await import('../js/tools.js');
const { waterModel } = await import('../js/sim/hollis-water.js');
waterModel.enabled = true;

let checks = 0, failed = 0;
const check = (name, fn) => { try { fn(); checks++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + (e.stack || e.message)); } };
const farm = (map = 'pnw', runSeed = 1) => { const g = new Game(); g.newGame(1987, 'free', 'standard', map, runSeed); g.autosave = false; return g; };
const MAIN = 54, CULVERT_Y = 75; // (the PNW ditch runs down x = 54 to the river, its culvert at y = 75)

check('PNW: a big flood reaches the ditch above the culvert; the culvert still stops fish', () => {
  const g = farm(), w = g.world;
  const culverts = []; for (let i = 0; i < w.n; i++) if (w.feature[i] === F.CULVERT) culverts.push(i);
  assert.deepEqual(culverts, [w.idx(MAIN, CULVERT_Y)], 'the culvert is where the check expects it');
  const fish = w.connected.slice();
  assert.equal(fish[w.idx(MAIN, 60)], 0, 'the upper ditch is cut off from the river\'s fish');
  g.events.startFlood(1.8);
  let upper = 0;
  for (let y = 48; y < CULVERT_Y - 1; y++) for (let dx = -3; dx <= 3; dx++) {
    const i = w.idx(MAIN + dx, y);
    if (w.flood[i]) upper++;
  }
  console.log(`  ${g.events.floodTiles} tiles flooded, ${upper} beside the ditch above the culvert`);
  assert.ok(upper >= 40, `land beside the upper ditch floods (${upper})`);
  g.refreshEnvironment();
  assert.deepEqual(w.connected, fish, 'fish passage unchanged');
});

check('Every map: floods only where the land is low enough, never on water or buildings', () => {
  for (const map of ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'sumatra']) {
    const g = farm(map), w = g.world, ev = g.events;
    const intensity = 1.8, eff = intensity * (1 - ev.sponge());
    ev.startFlood(intensity);
    for (let i = 0; i < w.n; i++) {
      if (!w.flood[i]) continue;
      assert.ok(!isWater(w.terrain[i]), `${map}: flood mark on water at ${i}`);
      assert.ok(w.struct[i] < 0, `${map}: a building flooded at ${i}`);
      const x = i % w.w, y = (i / w.w) | 0, h = w.tileH(x, y);
      // (a source within its reach that the tile sits low enough above; the walk carries the source's
      // height outward, so this is the loosest form of the same rule)
      let ok = false;
      for (let dy = -9; dy <= 9 && !ok; dy++) for (let dx = -9; dx <= 9 && !ok; dx++) {
        if (!w.inb(x + dx, y + dy)) continue;
        const j = w.idx(x + dx, y + dy), t = w.terrain[j], d = Math.abs(dx) + Math.abs(dy);
        if (t === T.RIVER && d <= 9) ok = h - w.tileH(x + dx, y + dy) <= eff * 1.1 + 1e-6;
        else if (t === T.CREEK && d <= 3) ok = h - w.tileH(x + dx, y + dy) <= eff * 0.45 + 1e-6;
      }
      assert.ok(ok, `${map}: tile (${x}, ${y}) flooded higher than the flood rises`);
    }
  }
});

check('A creek dug beside the river never takes land the river would have flooded', () => {
  for (const map of ['serengeti', 'amazon']) {
    const g = farm(map), w = g.world, ev = g.events;
    const before = [1.0, 1.8].map(s => ev.floodReach(s));
    // (a short creek dug on dry land two tiles from the river, on its floodplain)
    const river = (x, y) => w.inb(x, y) && w.terrain[w.idx(x, y)] === T.RIVER;
    let dug = 0;
    for (let i = 0; i < w.n && dug < 8; i++) {
      const x = i % w.w, y = (i / w.w) | 0;
      if (isWater(w.terrain[i]) || w.struct[i] >= 0 || w.feature[i] || !before[1][i]) continue;
      const N = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      if (N.some(([dx, dy]) => river(x + dx, y + dy)) || !N.some(([dx, dy]) => river(x + 2 * dx, y + 2 * dy))) continue;
      TOOLS.creek.apply(g, i); if (w.terrain[i] === T.CREEK) dug++;
    }
    g.refreshEnvironment();
    assert.ok(dug > 0, `${map}: dug a creek beside the river`);
    [1.0, 1.8].forEach((s, k) => {
      const after = ev.floodReach(s);
      let lost = 0; for (let i = 0; i < w.n; i++) if (before[k][i] && !after[i] && !isWater(w.terrain[i])) lost++;
      assert.equal(lost, 0, `${map}: ${lost} tiles the river flooded at ${s} lost to the dug creek`);
    });
  }
});

check('PNW: a flood cut-off on a creek dug off the upper ditch works with the wider flood', () => {
  const g = farm(), w = g.world;
  // (the creek-cutoff-check's L-shaped creek: east along y = 56 off the ditch, then south)
  const X = 62, Y = 56;
  for (let x = MAIN + 1; x <= X; x++) TOOLS.creek.apply(g, w.idx(x, Y));
  for (let y = Y + 1; y <= Y + 8; y++) TOOLS.creek.apply(g, w.idx(X, y));
  g.refreshEnvironment();
  let add = [], loop = [];
  for (let k = 0; k < 20 && !add.length; k++) {
    const before = w.terrain.slice();
    g.events.startFlood(1.8);
    for (let i = 0; i < w.n; i++) if (w.terrain[i] !== before[i]) (w.terrain[i] === T.CREEK ? add : loop).push(i);
    if (!add.length) { w.flood.fill(0); g.events.floodTiles = 0; }
  }
  assert.ok(add.length > 0, 'a big flood cut the bend');
  assert.ok(loop.every(i => w.terrain[i] === T.MARSH), 'the old loop is marsh');
  assert.ok(add.every(i => !w.flood[i]), 'the new channel carries no flood mark');
  let beside = 0;
  for (let x = MAIN + 1; x <= X; x++) for (const dy of [-1, 1]) if (w.flood[w.idx(x, Y + dy)]) beside++;
  assert.ok(beside > 0, 'the flood reaches the dug creek\'s banks');
});

console.log(`\n${checks} passed, ${failed} failed`);
if (failed) process.exit(1);
