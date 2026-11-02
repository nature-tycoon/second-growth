// Fire, deadwood and stones (docs/decisions/0035-fire-randomness-deadwood.md): snags stand where
// their trees stood and logs lie every which way, not on a grid; snags thin out over the years
// instead of falling together; grass and flowers come back under deadwood after a crown fire;
// loosening the soil turns up natural stones at each map's rate, which Demolish leaves.
//   node tools/fire-deadwood-check.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
let lcg = 5;
Math.random = () => ((lcg = (lcg * 1103515245 + 12345) % 2147483648) / 2147483648);
const { Game } = await import('../js/game.js');
const { setBiome } = await import('../js/biome.js');
const { TOOLS, naturalFeature } = await import('../js/tools.js');
const { snagSpot, logSpot, trunkSpot, snagTop } = await import('../js/sim/ground-obstacles.js');
const { snagLife, DECAY } = await import('../js/sim/plants.js');
const { T, F, PLACED, STONES } = await import('../js/config.js');

let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const game = (map, run = 77) => { const g = new Game(); g.newGame(1987, 'free', 'standard', map, run); return g; };

check('A snag stands where its tree stood; snags and logs scatter through their tiles', () => {
  const g = game('pnw'), w = g.world, p = g.catalog.plant.fir;
  const off = [], yaws = [];
  for (let y = 5; y < 65; y++) for (let x = 5; x < 85; x++) {
    assert.deepEqual(snagSpot(w, x, y, false), trunkSpot(w, x, y, p, false), 'the trunk spot');
    const [sx, sz] = snagSpot(w, x, y, false); off.push([sx - x - 0.5, sz - y - 0.5]);
    const [lx, lz, yaw] = logSpot(w, x, y, false);
    assert.ok(lx >= x + 0.1 && lx <= x + 0.9 && lz >= y + 0.1 && lz <= y + 0.9, 'a log centre stays in its tile');
    yaws.push(yaw);
  }
  const sd = k => Math.sqrt(off.reduce((s, o) => s + o[k] ** 2, 0) / off.length);
  const centred = off.filter(o => Math.hypot(o[0], o[1]) < 0.03).length / off.length;
  assert.ok(sd(0) > 0.11 && sd(1) > 0.11, `snag offsets spread ${sd(0).toFixed(3)}, ${sd(1).toFixed(3)} tiles (a grid: 0)`);
  assert.ok(centred < 0.03, `${(centred * 100).toFixed(1)}% of snags at the tile's middle`);
  // log headings (an axis: yaw and yaw + pi are the same log): every way, but neighbours roughly alike
  const bins = new Array(8).fill(0); for (const a of yaws) bins[Math.floor((((a % Math.PI) + Math.PI) % Math.PI) / Math.PI * 8) % 8]++;
  assert.ok(Math.min(...bins) > yaws.length / 8 * 0.4, `logs lie every which way: ${bins.join(' ')}`);
});

check('A leaning snag carries its perch with it', () => {
  const g = game('pnw'), w = g.world;
  let moved = 0;
  for (let k = 0; k < 200; k++) {
    const x = 10 + (k % 20), y = 10 + Math.floor(k / 20), i = w.idx(x, y); w.featureAge[i] = 0;
    const [bx, bz] = snagSpot(w, x, y, false), [tx, tz, h] = snagTop(w, x, y, i, false);
    assert.ok(h > 1.2 && h < 1.92, `top ${h.toFixed(2)} up`);
    if (Math.hypot(tx - bx, tz - bz) > 0.02) moved++;
    assert.ok(Math.hypot(tx - bx, tz - bz) < 0.3, "leans at most about 9 degrees"); // (the two leans add up to |rx| + |rz| at most: 0.15 rad)
  }
  assert.ok(moved > 100, 'most snags lean a little');
});

check('Snags thin out over the years instead of falling together', () => {
  // PNW fir on typical floor (rot rate about 0.5): the day each of 400 snags falls, at its own life plus the roll
  setBiome('pnw');
  const w = game('pnw').world, rate = 0.6 * (0.3 + (0.45 - 0.15) / 0.5), years = [];
  let r = 1; const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < 400; k++) {
    const i = w.idx(5 + (k % 40), 5 + Math.floor(k / 40));
    let d = Math.ceil(snagLife(w, i) * 120 / rate);
    while (rnd() >= DECAY.snagRoll * rate) d++;
    years.push(d / 120);
  }
  years.sort((a, b) => a - b);
  const q = f => years[Math.floor(years.length * f)];
  console.log(`  PNW fir snags down: 10% by ${q(0.1).toFixed(1)} y, half by ${q(0.5).toFixed(1)} y, 90% by ${q(0.9).toFixed(1)} y (rot rate ${rate.toFixed(2)})`);
  assert.ok(q(0.1) < 8, `10% down by ${q(0.1).toFixed(1)} y`);
  assert.ok(q(0.5) > 10 && q(0.5) < 20, `half down by ${q(0.5).toFixed(1)} y`);
  assert.ok(q(0.9) > 22, `10% still standing at ${q(0.9).toFixed(1)} y`);
});

check('Grass and flowers come back under snags and logs after a crown fire', () => {
  const g = game('pnw'), w = g.world, P = g.catalog.plant, tiles = [];
  for (let y = 30; y < 50; y++) for (let x = 40; x < 64; x++) {
    const i = w.idx(x, y); const t = w.terrain[i];
    if (w.struct[i] >= 0 || [T.RIVER, T.CREEK, T.POND, T.ROAD, T.TRAIL, T.MARSH].includes(t)) continue;
    w.terrain[i] = T.SOIL; w.feature[i] = 0; w.soil[i] = 0.6;
    w.setPlant(i, P.fir, 1, 120 * 90); w.setPlant(i, P.salal, 0.8); w.setPlant(i, P.swordfern, 0.7);
    tiles.push(i);
  }
  g.refreshEnvironment();
  const ev = g.events; ev.severe = true; ev.heat = 1; ev.severeTiles = [];
  for (const i of tiles) ev.burnTile(i);
  ev.severe = false; ev.heat = 0; ev.reseedBurn(); w.fire.fill(0);
  const cover = () => {
    const c = { dead: [0, 0], open: [0, 0] };
    for (const i of tiles) { const k = w.feature[i] === F.SNAG || w.feature[i] === F.LOG ? 'dead' : 'open'; c[k][0] += w.ground[i] ? w.groundG[i] : 0; c[k][1]++; }
    return { dead: c.dead[0] / c.dead[1], open: c.open[0] / Math.max(1, c.open[1]), n: c.dead[1] };
  };
  for (let d = 0; d < 120 * 3; d++) { ev.lastFire = g.day; g.dailyTick(); } // (three years, no new fire)
  const c = cover();
  assert.ok(c.n > tiles.length * 0.5, `deadwood on ${c.n} of ${tiles.length} burned tiles`);
  assert.ok(c.dead > 0.4, `ground cover under deadwood after 3 years ${c.dead.toFixed(2)}`);
  assert.ok(c.dead >= c.open * 0.8, `under deadwood ${c.dead.toFixed(2)} vs elsewhere in the burn ${c.open.toFixed(2)}`);
});

check('Loosening the soil turns up natural stones at each map\'s rate', () => {
  const rate = {};
  for (const map of ['pnw', 'atlanta', 'serengeti', 'chinandega', 'amazon', 'sumatra']) {
    const g = game(map), w = g.world, rip = TOOLS.rip;
    let n = 0, stones = 0; const ripped = [];
    for (let i = 0; i < w.n; i++) {
      if (w.feature[i] || w.tree[i]) continue;
      if (!rip.apply(g, i)) continue;
      n++; ripped.push(i);
      if (w.feature[i] === F.ROCKS) {
        stones++;
        assert.equal(w.featureAge[i], STONES); assert.equal(w.marks[i] & PLACED, 0, 'not placed');
        assert.ok(naturalFeature(w, i), 'Demolish leaves them');
      }
    }
    rate[map] = n ? stones / n : 0;
    // a tile gives up its stones once: working it again finds nothing new
    if (n) { const before = w.feature.slice(); for (const i of ripped) if (!before[i]) { w.terrain[i] = T.FIELD; rip.apply(g, i); } assert.deepEqual(w.feature, before); }
  }
  const pc = Object.fromEntries(Object.entries(rate).map(([k, v]) => [k, (v * 100).toFixed(1) + '%']));
  assert.ok(rate.pnw > 0.02 && rate.pnw < 0.06, `PNW ${pc.pnw}`);
  assert.ok(rate.amazon < 0.008, `Amazon ${pc.amazon}`);
  assert.ok(rate.pnw > rate.atlanta && rate.atlanta > rate.sumatra && rate.sumatra > rate.amazon, JSON.stringify(pc));
  console.log('  stones per loosened tile:', JSON.stringify(pc));
});

check('Fire burns resprouting trees back to the root; seedlings and conifers die', () => {
  const g = game('serengeti'), w = g.world, P = g.catalog.plant, ev = g.events;
  const site = k => { const i = w.idx(20 + k, 20); w.terrain[i] = T.SOIL; w.feature[i] = 0; return i; };
  g.rng = () => 0.5; // (above ROOT_KILL, below any survival roll that matters here)
  const a = site(0); w.setPlant(a, P.mesquite, 0.3, 120 * 3); ev.burnTile(a);
  assert.equal(w.tree[a], P.mesquite.id, 'a three-year-old mesquite sprouts back'); assert.ok(w.treeG[a] <= 0.1001, "burned back to a sprout");
  const b = site(1); w.setPlant(b, P.mesquite, 0.1, 60); ev.burnTile(b);
  assert.equal(w.tree[b], 0, 'a mesquite seedling dies');
  const c = site(2); w.setPlant(c, P.umbrella, 0.3, 120 * 4); ev.burnTile(c);
  assert.equal(w.tree[c], P.umbrella.id, 'an acacia sapling sprouts back');
  const h = game('pnw'), hw = h.world, hp = h.catalog.plant, i = hw.idx(30, 30);
  hw.terrain[i] = T.SOIL; hw.setPlant(i, hp.fir, 0.3, 120 * 6); h.rng = () => 0.5; h.events.burnTile(i);
  assert.equal(hw.tree[i], 0, 'a young Douglas-fir does not resprout');
});

check('Grass on crusted hardpan carries fire; bare hardpan does not', () => {
  const g = game('serengeti'), w = g.world, ev = g.events, i = w.idx(30, 30);
  w.terrain[i] = T.GRAVEL; w.flood[i] = 0; w.struct[i] = -1; w.moist[i] = 0.1; w.canopy[i] = 0; w.tree[i] = 0; w.shrub[i] = 0; w.feature[i] = 0;
  w.ground[i] = g.catalog.plant.sporobolus.id; w.groundG[i] = 0.9;
  assert.ok(ev.fuel(w, i) > 0.3, `grass on hardpan: fuel ${ev.fuel(w, i).toFixed(2)}`);
  w.ground[i] = 0; w.groundG[i] = 0; assert.equal(ev.fuel(w, i), 0);
});

check('Savanna grass fires are routine: one calm note a season, no alarm; the front runs two tiles a day', () => {
  const g = game('serengeti'), w = g.world, ev = g.events, notes = [], events = [];
  g.on('notify', n => notes.push(n)); g.on('event', e => events.push(e));
  // a sward of cured grass
  for (let y = 10; y < 70; y++) for (let x = 10; x < 90; x++) {
    const i = w.idx(x, y); if (w.struct[i] >= 0 || w.terrain[i] !== T.SOIL && w.terrain[i] !== T.GRAVEL) continue;
    w.ground[i] = g.catalog.plant.redoat.id; w.groundG[i] = 1; w.moist[i] = 0.05; w.canopy[i] = 0; w.flood[i] = 0;
  }
  g.weather = 'clear';
  const at = w.idx(50, 40);
  w.terrain[at] = T.SOIL; ev.ignite(at);
  ev.ignite(w.idx(52, 40)); // (a second fire the same season)
  assert.equal(notes.filter(n => n.kind === 'fire').length, 0, 'no alarm');
  assert.equal(notes.filter(n => /grass fire/.test(n.text)).length, 1, 'one note a season');
  assert.ok(events.includes('grassfire') && !events.includes('fire'), 'no pause-on-event');
  w.scorch.fill(0); w.fire.fill(0); ev.ignite(at); ev.routine = true;
  for (let d = 0; d < 5; d++) { g.weather = 'clear'; ev.updateFire(); }
  let far = 0; for (let i = 0; i < w.n; i++) if (w.scorch[i]) far = Math.max(far, Math.abs(i % w.w - 50), Math.abs(((i / w.w) | 0) - 40));
  assert.ok(far >= 7 && far <= 10, `the front ran ${far} tiles in 5 days`);
});

console.log(`fire-deadwood-check: ${checks} checks passed`);
