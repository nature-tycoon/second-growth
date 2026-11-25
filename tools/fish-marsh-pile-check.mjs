// River fish don't pile at a marsh lip (decision 0034): node tools/fish-marsh-pile-check.mjs
// - A river fish sent to a marsh tile with only a sliver of water along its near edge (an escape:
//   evadeHunt) reaches it and stops there. Its waypoint, too shallow at the tile's spot, was nudged to
//   the nearest deep water, which can lie in the next tile past the dry part: it pressed at the lip
//   for days, and the rest of its kind fleeing the same way piled up behind it (Sumatra snakeheads
//   269 per 1000 fish samples, seed 1987, 2026-11-24). Now the waypoint stays in that tile, at the
//   point its route reached it by (swimPoint).
// - Sumatra grown three years, seeds 1987 and 13: snakeheads don't pile (river-fish-pile-probe's
//   measure). Seed 13 also covers the other two causes found then: a fish's roam (and disperse) route
//   now keeps to water it can swim (swimRoute), as its other routes did, and fish fleeing a hunter
//   scatter rather than all darting into the one tile farthest from it (evadeHunt).
import assert from 'node:assert/strict';
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { animalRadius } from '../js/sim/animal-positioning.js';
import { swimDepth, fishDepth, deepWaterNear } from '../js/sim/waterline.js';
import { swimRoute } from '../js/sim/swim-routes.js';
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };

check('a fish sent to a marsh tile with a sliver of water reaches it, fresh Sumatra', () => {
  Math.random = mulberry32(1987);
  const g = restoredGame('sumatra', 1987), wl = g.wildlife, w = g.world, cat = g.catalog;
  const a = wl.agents.find(o => o.key === 'snakehead'), def = cat.animals[a.sp], need = fishDepth(def);
  wl.agents = [a]; wl.ids = new Map([[a.id, a]]); // (just this fish: nothing to flee, nobody in the way)
  // tiles i (deep) next to j (shallow at its spot) that a route allows, with j's nearest deep water in a third tile
  const cases = [];
  for (let i = 0; i < w.n; i++) {
    const x = i % w.w, y = (i / w.w) | 0;
    if (swimDepth(w, x + 0.5, y + 0.5) < need) continue;
    a.x = x + 0.5; a.y = y + 0.5;
    const swim = swimRoute(wl, a, def);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!w.inb(x + dx, y + dy)) continue;
      const j = w.idx(x + dx, y + dy);
      if (swimDepth(w, x + dx + 0.5, y + dy + 0.5) >= need || !swim(i, j)) continue;
      const p = deepWaterNear(w, x + dx + 0.5, y + dy + 0.5, 0.9, need), k = p && w.idx(Math.floor(p[0]), Math.floor(p[1]));
      if (p && k !== i && k !== j) cases.push([i, j]);
    }
  }
  assert.ok(cases.length >= 1, 'the fixture has a marsh tile with a sliver of water by deep water (map changed?)');
  for (const [i, j] of cases) {
    Object.assign(a, { x: i % w.w + 0.5, y: ((i / w.w) | 0) + 0.5, state: 'walk', path: [j], restSpot: null, moveProgress: null, wait: 0, dormancy: null, run: null, threat: null });
    wl.update(0.05);
    const at = a.restSpot && w.idx(Math.floor(a.restSpot[1]), Math.floor(a.restSpot[2]));
    assert.ok(a.state !== 'walk' || at === j, `its waypoint for tile ${j % w.w},${(j / w.w) | 0} lies in tile ${at % w.w},${(at / w.w) | 0}, past where its route reached`);
    let t = 0.05;
    for (; t < 8 && a.state === 'walk' && a.path?.length; t += 0.05) { wl.update(0.05); }
    assert.ok(t < 8, `the fish never got into tile ${j % w.w},${(j / w.w) | 0} from ${i % w.w},${(i / w.w) | 0}: at ${a.x.toFixed(2)},${a.y.toFixed(2)}`);
    assert.ok(swimDepth(w, a.x, a.y) >= need, `it stopped in water too shallow for it at ${a.x.toFixed(2)},${a.y.toFixed(2)}`);
  }
});

for (const [seed, was] of [[1987, 269], [13, 324]]) check(`Sumatra snakeheads don't pile up in peat marsh, seed ${seed}, year 3`, () => {
  Math.random = mulberry32(seed);
  const g = restoredGame('sumatra', seed), wl = g.wildlife, w = g.world, cat = g.catalog;
  for (let d = 0; d < 360; d++) { g.dailyTick(); for (let k = 0; k < 10; k++) wl.update(0.1); }
  let samples = 0, piled = 0;
  for (let d = 0; d < 2; d++) {
    g.dailyTick();
    for (let k = 0; k < 40; k++) {
      wl.update(0.025);
      const fish = wl.agents.filter(a => a.key === 'snakehead' && !a.leaving && w.inb(Math.floor(a.x), Math.floor(a.y)));
      for (const a of fish) {
        samples++;
        const len = animalRadius(a, cat) / 0.65 * 1.5;
        if (fish.filter(b => b !== a && Math.hypot(a.x - b.x, a.y - b.y) < len).length >= 3) piled++;
      }
    }
  }
  assert.ok(samples > 200, `too few snakehead samples to judge (${samples})`);
  const rate = piled / samples * 1000;
  console.log(`  ${samples} snakehead samples, ${rate.toFixed(1)} per 1000 piled (${was} before 2026-11-24)`);
  assert.ok(rate < 40, `snakeheads piled ${rate.toFixed(1)} per 1000 samples`);
});

console.log(`fish-marsh-pile-check: ${checks} checks passed`);
