// Trees in water (docs/decisions/0028 Rules, 0034): a tree whose trunk stands in a flowing creek dies
// within a season and no tree seeds there; in held (beaver-pond) water a dry-ground tree drowns over
// weeks, a wet-tolerant one (wetOK) lives through a year or two and then dies if the water stays deep;
// mangroves and swamp trees never drown. node tools/creek-trees-check.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const root = new URL('../js/', import.meta.url).href;
const { World } = await import(root + 'world.js');
const { setBiome } = await import(root + 'biome.js');
const { PLANT } = await import(root + 'data/plants.js');
const { drownOdds, inChannel, trySeed } = await import(root + 'sim/plants.js');
const { Game } = await import(root + 'game.js');
const { T, F } = await import(root + 'config.js');
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };

function fixture(map = 'pnw') {
  setBiome(map);
  const w = new World(9, 9);
  w.terrain.fill(T.SOIL); w.moist.fill(.7); w.baseMoist.fill(.7); w.soil.fill(.8); w.distWater.fill(10); w.distLog.fill(255);
  w.vh.fill(10);
  return w;
}
// a creek down column 5: its bed one level under the bank, so its water (bed + 0.32) laps a bank
// whose ground slopes down into it
function creek(w) {
  for (let y = 0; y < w.h; y++) { w.terrain[w.idx(5, y)] = T.CREEK; w.distWater[w.idx(4, y)] = 1; w.distWater[w.idx(5, y)] = 0; }
  for (let y = 0; y <= w.h; y++) { w.vh[y * (w.w + 1) + 5] = 9; w.vh[y * (w.w + 1) + 6] = 9; }
}
const survive = (odds, days) => (1 - odds) ** days;

check('a tree on a creek tile, or a bank tile whose trunk the creek covers, is in the channel', () => {
  const w = fixture(); creek(w);
  assert.ok(inChannel(w, w.idx(5, 4), PLANT.alder), 'on the channel itself');
  // bank tile (4,4): its east corners are the creek's (9), its west 10; the creek's water at 9.32
  // covers the east half, and the whole tile once the west corners come down too
  for (let y = 0; y <= w.h; y++) w.vh[y * (w.w + 1) + 4] = 9.1;
  assert.ok(inChannel(w, w.idx(4, 4), PLANT.alder), 'trunk under the creek water');
  assert.ok(!inChannel(w, w.idx(2, 4), PLANT.alder), 'two tiles back is dry land');
  assert.ok(survive(drownOdds(w, w.idx(4, 4), PLANT.ash), 30) < 0.1, 'even a wet-tolerant tree dies within a season in running water');
});

check('no tree seeds where its trunk would stand in the creek', () => {
  const w = fixture(); creek(w);
  for (let y = 0; y <= w.h; y++) w.vh[y * (w.w + 1) + 4] = 9.1;
  w.seedFrom = -1;
  const reasons = []; w.seedLog = (p, i, why) => reasons.push(why);
  trySeed(w, PLANT.alder, w.idx(4, 4), () => 0.5);
  assert.equal(w.tree[w.idx(4, 4)], 0); assert.ok(reasons.includes('channel'), reasons.join());
});

check('held water: dry-ground trees drown over weeks, wet-tolerant ones after years, mangroves never', () => {
  const w = fixture(), i = w.idx(3, 3);
  w.waterDepth = new Float32Array(w.n); w.waterWetDays = new Uint16Array(w.n);
  w.waterDepth[i] = .3; w.waterWetDays[i] = 10;
  assert.equal(drownOdds(w, i, PLANT.fir), 0, 'not on the first days');
  w.waterWetDays[i] = 20;
  const fir = drownOdds(w, i, PLANT.fir);
  assert.ok(survive(fir, 20) > 0.3 && survive(fir, 80) < 0.1, 'most die in the first season or two, not on one day');
  assert.equal(drownOdds(w, i, PLANT.ash), 0, 'ash takes a flood of a year');
  w.waterWetDays[i] = 240;
  assert.ok(drownOdds(w, i, PLANT.ash) > 0, 'but not years of deep water');
  w.waterDepth[i] = .1;
  assert.equal(drownOdds(w, i, PLANT.ash), 0, 'on the shallow margin it lives');
  assert.ok(drownOdds(w, i, PLANT.fir) > 0, 'a fir does not');
  setBiome('chinandega');
  const m = fixture('chinandega'); m.waterDepth = new Float32Array(m.n).fill(.5); m.waterWetDays = new Uint16Array(m.n).fill(2000);
  const mangrove = m.catalog.plants.find(p => p?.mangrove);
  assert.equal(drownOdds(m, m.idx(3, 3), mangrove), 0);
});

check('in a game, a grown tree whose tile becomes creek dies within a season and leaves deadwood', () => {
  const g = new Game(); g.newGame(1987, undefined, undefined, 'pnw', 7);
  const w = g.world;
  const picks = [];
  for (let i = 0; i < w.n && picks.length < 12; i++) if (w.tree[i] && w.treeG[i] > 0.8 && w.distWater[i] > 3 && !g.catalog.plants[w.tree[i]].wetOK) picks.push(i);
  assert.ok(picks.length >= 8);
  for (const i of picks) { w.terrain[i] = T.CREEK; w.waterManaged && (w.waterManaged[i] = 0); }
  const before = w.treeDeaths?.flood || 0;
  for (let d = 0; d < 30; d++) { for (const i of picks) w.terrain[i] = T.CREEK; g.dailyTick(); }
  const alive = picks.filter(i => w.tree[i]).length;
  assert.ok(alive <= 2, `${alive} of ${picks.length} still standing in the creek`);
  assert.ok((w.treeDeaths?.flood || 0) - before >= picks.length - alive - 1, 'drowned, not some other cause');
  assert.ok(picks.filter(i => !w.tree[i] && (w.feature[i] === F.SNAG || w.feature[i] === F.LOG)).length >= (picks.length - alive) / 2, 'grown trees leave a snag or log');
});
console.log(`creek-trees-check: ${checks} passed`);
