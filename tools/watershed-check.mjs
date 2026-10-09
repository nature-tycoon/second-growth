// Pure numerical checks; no browser, game state, random numbers, or Three.js.
import assert from 'node:assert/strict';
import { Watershed } from '../js/sim/watershed.js';
import { createWatershedFixture } from './watershed-fixtures.mjs';
let checks = 0;
const check = (name, fn) => { fn(); console.log('PASS ' + name); checks++; };
const close = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const advance = (w, days, forcing = {}) => { for (let d = 0; d < days; d++) w.step(1, forcing); };
const dry = options => ({ infiltration: 0, baseflow: 0, rechargeRate: 0, ...options });

check('A closed watershed conserves water under rain, infiltration, recharge and drying', () => {
  const w = new Watershed(9, 7, { bed: Array.from({ length: 63 }, (_, i) => (i % 9) * .03), surface: .2, soil: .2, groundwater: .1 });
  advance(w, 50, { rain: .025, evaporation: .01, plantUse: .003 });
  close(w.balance().error, 0);
  for (const key of ['surface', 'soil', 'groundwater']) assert.ok(w[key].every(v => Number.isFinite(v) && v >= 0));
  assert.ok(w.soil.every((v, i) => v <= w.capacity[i]));
});
check('Water rests at equal surface elevations and moves downhill into dry cells', () => {
  const still = new Watershed(3, 1, dry({ bed: [0, .1, .2], surface: [.4, .3, .2] }));
  const before = still.surface.slice(); advance(still, 8);
  for (let i = 0; i < 3; i++) close(still.surface[i], before[i]);
  const downhill = new Watershed(3, 1, dry({ bed: [.2, .1, 0], surface: [.6, 0, 0] }));
  advance(downhill, 8); assert.ok(downhill.surface[2] > .1); close(downhill.balance().error, 0);
});
check('A bowl retains water below its sill and spills above it', () => {
  const low = new Watershed(3, 1, dry({ bed: [1, 0, 1], surface: [0, .8, 0] }));
  advance(low, 10); close(low.surface[1], .8); close(low.surface[0], 0);
  const high = new Watershed(3, 1, dry({ bed: [1, 0, 1], surface: [0, 2, 0] }));
  advance(high, 10); assert.ok(high.surface[0] > 0 && high.surface[2] > 0); close(high.balance().error, 0);
});
check('A dam blocks sub-crest flow, overtops, leaks when permeable and releases on removal', () => {
  const w = new Watershed(2, 1, dry({ surface: [.5, 0] })); w.setBarrier(0, 1, .8);
  advance(w, 5); close(w.surface[1], 0);
  w.removeBarrier(0, 1); advance(w, 5); assert.ok(w.surface[1] > .1);
  const high = new Watershed(2, 1, dry({ surface: [1.5, 0] })); high.setBarrier(0, 1, .8); advance(high, 5); assert.ok(high.surface[1] > .1);
  const leak = new Watershed(2, 1, dry({ surface: [.5, 0] })); leak.setBarrier(0, 1, .8, .1); advance(leak, 5); assert.ok(leak.surface[1] > 0);
  for (const t of [w, high, leak]) close(t.balance().error, 0);
});
check('Infiltration reduces surface runoff; saturated soil cannot take unlimited water', () => {
  const compact = new Watershed(1, 1, { surface: .3, infiltration: .005, baseflow: 0, rechargeRate: 0 });
  const restored = new Watershed(1, 1, { surface: .3, infiltration: .15, baseflow: 0, rechargeRate: 0 });
  advance(compact, 2); advance(restored, 2); assert.ok(restored.surface[0] < compact.surface[0] * .5);
  const saturated = new Watershed(1, 1, { surface: .3, soil: .5, capacity: .5, infiltration: 10, baseflow: 0, rechargeRate: 0 });
  saturated.step(1); close(saturated.surface[0], .3);
});
check('Groundwater releases delayed water; evaporation and plant use are limited by storage', () => {
  const w = new Watershed(1, 1, { groundwater: 1, baseflow: .1, infiltration: 0 });
  w.step(1); assert.ok(w.surface[0] > .09 && w.groundwater[0] > .9); close(w.balance().error, 0);
  advance(w, 50, { evaporation: 5, plantUse: 5 }); close(w.surface[0], 0); close(w.soil[0], 0); close(w.balance().error, 0);
});
check('External sources and outlets are fully accounted, and dry outlets cannot suck water', () => {
  const w = new Watershed(3, 1, dry({ bed: [.1, 0, 0] })); w.addSource(0, .1); w.addOutlet(2);
  advance(w, 40); close(w.budget.inflow, 4); assert.ok(w.budget.outflow > 1); close(w.balance().error, 0);
  const empty = new Watershed(1, 1, dry({})); empty.addOutlet(0, -1); empty.step(1); close(empty.storage(), 0);
});
check('Simultaneous donor limits prevent negative water at a four-way junction', () => {
  const surface = new Array(9).fill(0); surface[4] = 100;
  const w = new Watershed(3, 3, dry({ surface, conductance: 10000 }));
  advance(w, 20); assert.ok(w.surface.every(v => v >= 0 && Number.isFinite(v))); close(w.balance().error, 0, 1e-7);
});
check('Both landscapes replay deterministically and survive state round trips', () => {
  for (const id of ['valley', 'amazon']) {
    const a = createWatershedFixture(id).w, b = createWatershedFixture(id).w;
    advance(a, 4, { rain: .03 }); advance(b, 4, { rain: .03 }); assert.deepEqual(a.surface, b.surface);
    const resumed = Watershed.deserialize(JSON.parse(JSON.stringify(a.serialize())));
    advance(a, 4, { evaporation: .01 }); advance(resumed, 4, { evaporation: .01 });
    assert.deepEqual(a.serialize(), resumed.serialize()); close(a.balance().error, 0);
  }
});
check('The creek fixture impounds more upstream water when its test dam is placed', () => {
  const open = createWatershedFixture('valley'), dammed = createWatershedFixture('valley');
  for (const e of dammed.damEdges) dammed.w.setBarrier(e.a, e.b, e.crest, .015);
  advance(open.w, 30); advance(dammed.w, 30);
  const upstream = w => w.surface.reduce((s, v, i) => s + (Math.floor(i / w.width) < 23 ? v : 0), 0);
  assert.ok(upstream(dammed.w) > upstream(open.w) * 1.15);
  close(open.w.balance().error, 0); close(dammed.w.balance().error, 0);
});
check('The Amazon oxbow connects under high water and isolates again while retaining lake water', () => {
  const { w } = createWatershedFixture('amazon'), gate = 13 * w.width + 27, lake = 19 * w.width + 39;
  const connected = () => {
    const seen = new Set([22 * w.width + 23]), queue = [...seen];
    for (let p = 0; p < queue.length; p++) {
      const i = queue[p], x = i % w.width, y = Math.floor(i / w.width);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const xx = x + dx, yy = y + dy, j = yy * w.width + xx;
        if (xx < 0 || yy < 0 || xx >= w.width || yy >= w.height || seen.has(j) || w.surface[j] <= .004) continue;
        seen.add(j); queue.push(j);
      }
    }
    return seen.has(lake);
  };
  advance(w, 15, { rain: .002, evaporation: .006, plantUse: .004 });
  close(w.surface[gate], 0); assert.equal(connected(), false);
  advance(w, 12, { rain: .05, sourceScale: 5, evaporation: .002, plantUse: .004 });
  assert.ok(w.surface[gate] > .1); assert.equal(connected(), true);
  advance(w, 40, { sourceScale: 0, evaporation: .02, plantUse: .004 });
  close(w.surface[gate], 0); assert.ok(w.surface[lake] > .04); assert.equal(connected(), false);
  close(w.balance().error, 0, 1e-7);
});
check('Invalid forcing, barriers and corrupted stored state fail explicitly', () => {
  const w = new Watershed(2, 2);
  assert.throws(() => w.step(1, { rain: NaN })); assert.throws(() => w.step(-1));
  assert.throws(() => w.setBarrier(0, 3, 1)); assert.throws(() => w.setBarrier(0, 1, 1, 2));
  const data = w.serialize(); data.surface[0] = 1; assert.throws(() => Watershed.deserialize(data));
});
const full = new Watershed(120, 90, { bed: Array.from({ length: 10800 }, (_, i) => .005 * (90 - Math.floor(i / 120))) });
const start = performance.now(); full.step(1, { rain: .02 });
console.log(`120 × 90 grid: one simulated day in ${(performance.now() - start).toFixed(1)} ms`);
console.log(`${checks} watershed checks passed.`);
