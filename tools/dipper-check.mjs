// node tools/dipper-check.mjs
// The American dipper (fastWater, decision 0030) keeps to its creek: once settled it stands and
// walks only in the creek or on its edge, and its flights follow the water, never across land.
// Runs the Hollis restoration five years (so the creek is clean enough to hold dippers), brings
// in a pair, and watches them for 160 days.
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { ToolActions } = await import('../js/tool-actions.js');
const { hollisRestorePlan } = await import('./hollis-restore-plan.mjs');
const { T } = await import('../js/config.js');

const g = new Game(); g.newGame(1987);
const w = g.world, plan = hollisRestorePlan(g, ToolActions), def = g.catalog.animal.dipper, sp = def.index;
assert.ok(def, 'PNW has the dipper');
let day = 0;
const step = (n, dt, k) => { for (let d = 0; d < n; d++) { plan.day(day++); g.dailyTick(); for (let i = 0; i < k; i++) g.wildlife.update(dt); } };
step(5 * 120, 0.1, 10);
assert.ok(g.wildlife.state[sp].K >= 1, `a restored creek holds dippers (K ${g.wildlife.state[sp].K.toFixed(2)})`);
g.wildlife.immigrate(def, 2);
step(40, 0.01, 100); // (settling: the pair flies in from the edge to the creek)
// (flights are counted from a takeoff on the creek: a newcomer's flight in from the map's edge is
// over land, as any arrival is)
const fromCreek = new Set();
const creekBank = i => { const x = i % w.w, y = i / w.w | 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.inb(x + dx, y + dy) && w.terrain[w.idx(x + dx, y + dy)] === T.CREEK) return true;
  return false; };
let standing = 0, offWater = 0, flying = 0, overLand = 0;
for (let d = 0; d < 160; d++) {
  plan.day(day++); g.dailyTick();
  for (let k = 0; k < 100; k++) {
    g.wildlife.update(0.01);
    for (const a of g.wildlife.agents) {
      if (a.sp !== sp || a.leaving) continue;
      // (the creek or its bank: a newcomer that first lands on the river bank and then flies to
      // its creek is arriving, not straying, so a takeoff from the river doesn't count)
      const i = w.idx(Math.floor(a.x), Math.floor(a.y)), creekOrEdge = creekBank(i);
      if (a.flying) { if (fromCreek.has(a.id)) { flying++; if (w.distWater[i] > 1) overLand++; } }
      else { standing++; if (!creekOrEdge) offWater++; if (creekOrEdge) fromCreek.add(a.id); else fromCreek.delete(a.id); }
    }
  }
}
assert.ok(standing > 1000, `dippers watched (${standing})`);
assert.ok(offWater / standing < 0.05, `stands in the creek or on its edge (${(100 * offWater / standing).toFixed(1)}% off it)`);
assert.ok(flying === 0 || overLand / flying < 0.1, `flies along the water (${(100 * overLand / Math.max(1, flying)).toFixed(1)}% of flight over land)`);
assert.ok(flying > 50, `flies along the creek now and then (${flying})`);
assert.ok(flying < standing, 'mostly on its rock, not on the wing');
console.log(`PASS dipper: ${(100 * offWater / standing).toFixed(1)}% standing off the creek, ${(100 * overLand / Math.max(1, flying)).toFixed(1)}% of flight over land, ${(100 * flying / (flying + standing)).toFixed(0)}% flying`);
