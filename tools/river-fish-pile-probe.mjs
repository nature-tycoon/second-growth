// River fish piling up (a probe, not a check: it fails on main too): node tools/river-fish-pile-probe.mjs
// RUNS="sumatra:91 chinandega:1987" sets the maps and seeds. A restored map grown three years (the
// marshes dry down and refill), then two days sampled: a river fish with PILE or more of its own kind
// within a body length and a half, centre to centre, is piled. Found 2026-11-19 (ideas batch
// cinema-creeks, s3): 20-30% of snakehead and snapper samples piled on some seeds. They press at a
// lip they can't cross: a route between water tiles over ground standing above the water for more
// than the 0.35-tile hop riverFishStep allows (Sumatra 91: a marsh tile dry along its north half, 0.6
// tiles of it). Making chooseTarget's `need` apply to every fish, not only the catfish, moved the
// piles about without shrinking them; the fix is routes that only cross water a fish can swim.
// Catfish crowding the last deep pool of a dry season is real.
// 2026-11-24 (ideas phone-creeks-fish s8): Sumatra piled again (seeds 1987, 7, 5, 11, 17, 23, 43: 110-496)
// from three causes the 11-20 fix never covered: an escape's waypoint nudged into deep water in the next
// tile past a dry band, roam/disperse routes with no swimRoute test, and fleeing fish all taking the one
// tile farthest from the hunter. Covered by tools/fish-marsh-pile-check.mjs. Measure over 10+ seeds.
// 2026-11-25 (s12): seed 37's pile was snakeheads stranded in a one-tile puddle the dry season cut off;
// air-breathers now wriggle over wet ground to bigger water (fish-wriggle.js, fish-wriggle-check). 50 -> 0.4.
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { animalRadius } from '../js/sim/animal-positioning.js';
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const PILE = 3, YEARS = 3;
const RUNS = process.env.RUNS ? process.env.RUNS.split(' ').map(r => r.split(':')).map(([m, sd]) => [m, +sd]) : [['sumatra', 91], ['chinandega', 91]];
for (const [map, seed] of RUNS) {
  Math.random = mulberry32(seed);
  const g = restoredGame(map, seed), wl = g.wildlife, w = g.world, cat = g.catalog;
  for (let d = 0; d < YEARS * 120; d++) { g.dailyTick(); for (let k = 0; k < 10; k++) wl.update(0.1); }
  let samples = 0, piled = 0; const by = {};
  for (let d = 0; d < 2; d++) {
    g.dailyTick();
    for (let k = 0; k < 40; k++) {
      wl.update(0.025);
      const fish = wl.agents.filter(a => { const def = cat.animals[a.sp]; return def.move === 'swim' && !def.reef && !a.leaving && w.inb(Math.floor(a.x), Math.floor(a.y)); });
      for (const a of fish) {
        samples++;
        const len = animalRadius(a, cat) / 0.65 * 1.5;
        if (fish.filter(b => b !== a && b.sp === a.sp && Math.hypot(a.x - b.x, a.y - b.y) < len).length >= PILE) { piled++; by[a.key] = (by[a.key] || 0) + 1; }
      }
    }
  }
  const rate = piled / Math.max(1, samples);
  console.log(`${map} seed ${seed}, year ${YEARS}: ${samples} fish samples, ${(rate * 1000).toFixed(1)}/1000 piled${piled ? ` (${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', ')})` : ''}`);
}
