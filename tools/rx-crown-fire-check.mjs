// A controlled burn can torch into a crown fire where a shrub layer under big trees carries it into a
// dry canopy (Events.rxTorch). Open meadow never torches, a burn after rain is safe, and maps without
// crown fires (savannas, the reef) never get one.
//   node tools/rx-crown-fire-check.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { DAYS_PER_MONTH } = await import('../js/config.js');

let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }

// A farm with one big tree standing over a thick shrub, in a dry spell in the fire season.
function farm(map = 'pnw', { dry = 10, month } = {}) {
  const g = new Game(); g.newGame(5, 'free', 'standard', map);
  const w = g.world, cl = g.mapDefinition.climate;
  g.day = (month ?? cl.fireMonths[0] ?? 5) * DAYS_PER_MONTH; g.dryStreak = dry; g.weather = 'clear';
  const tree = g.catalog.plants.findIndex((p, k) => k && p.layer === 2 && !p.invasive);
  const shrub = g.catalog.plants.findIndex((p, k) => k && p.layer === 1 && !p.invasive);
  const i = w.idx(w.w >> 1, w.h >> 1);
  w.fire.fill(0); w.rx.fill(0); w.scorch.fill(0);
  w.tree[i] = tree; w.treeG[i] = 0.9; w.shrub[i] = shrub; w.shrubG[i] = 0.9; w.moist[i] = 0.35;
  return { g, w, i };
}

check('a big tree over a shrub layer can torch in a dry fire season', () => {
  const { g, i } = farm();
  assert.ok(g.events.rxTorch(i) > 0.03, `torch chance ${g.events.rxTorch(i)}`);
});

check('the chance falls after rain, off season and in wet ground', () => {
  const dry = farm(), wet = farm('pnw', { dry: 1 }), off = farm('pnw', { month: 9 });
  assert.equal(wet.g.events.rxTorch(wet.i), 0);
  assert.ok(off.g.events.rxTorch(off.i) < dry.g.events.rxTorch(dry.i) * 0.5);
  dry.w.moist[dry.i] = 0.8; assert.equal(dry.g.events.rxTorch(dry.i), 0);
});

check('no ladder, no torch: open meadow, a bare forest floor, or a young tree', () => {
  const { g, w, i } = farm();
  const t = w.tree[i], s = w.shrub[i];
  w.tree[i] = 0; assert.equal(g.events.rxTorch(i), 0);
  w.tree[i] = t; w.shrub[i] = 0; w.shrubG[i] = 0; assert.equal(g.events.rxTorch(i), 0);
  w.shrub[i] = s; w.shrubG[i] = 0.9; w.treeG[i] = 0.4; assert.equal(g.events.rxTorch(i), 0);
});

check('maps without crown fires never torch', () => {
  for (const map of ['serengeti', 'chinandega', 'atlanta']) {
    const { g, i } = farm(map);
    assert.equal(g.events.rxTorch(i), 0, map);
  }
});

check('a torching tile starts a crown fire and says so', () => {
  const { g, w, i } = farm();
  const notes = []; g.on('notify', n => notes.push(n.text));
  w.rx[i] = 1; g.rng = () => 0;
  g.events.igniteRx(i);
  assert.equal(g.events.severe, true); assert.ok(g.events.heat >= 0.5);
  assert.ok(w.fire[i] > 0); assert.equal(w.rx[i], 0); // burning as a wildfire now, not held by the crew
  assert.equal(g.stats.rxCrownFires, 1);
  assert.match(notes.at(-1), /gone into the treetops/);
});

check('a burn that already jumped the line goes up into the crowns with it', () => {
  const { g, w, i } = farm();
  g.events.ignite(i - 5, false, 'escaped'); g.events.fireTiles = 3;
  const burned = g.events.burned;
  w.rx[i] = 1; g.rng = () => 0;
  g.events.igniteRx(i);
  assert.equal(g.events.severe, true); assert.equal(g.events.burned, burned + 1);
});

check('a meadow burn stays a controlled burn', () => {
  const { g, w, i } = farm();
  w.tree[i] = 0; w.treeG[i] = 0; w.rx[i] = 1; g.rng = () => 0;
  g.events.igniteRx(i);
  assert.equal(g.events.severe, false); assert.equal(w.rx[i], 2);
});

console.log(`${checks} checks passed`);
