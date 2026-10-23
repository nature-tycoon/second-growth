// node tools/activity-budget.mjs [map] [seed]
// How each species spends its time (percent of samples) in a mixed community on a restored map,
// over 75 days with the daily tick. A report, not a check: decision 0013 uses it to find
// behaviours that crowd out others (water commuting, nonstop hunting, never soaring).
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { passable, canLand } from '../js/sim/animal-terrain.js';
const map = process.argv[2] || 'pnw', seed = +(process.argv[3] || 7);
Math.random = mulberry32(seed);
const g = restoredGame(map, seed), wl = g.wildlife, w = g.world;
wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability();
for (const d of g.catalog.animals) {
  const suit = wl.suit[d.index], good = [];
  for (let j = 0; j < w.n; j++) if (suit[j] > 0.3 && passable(w, j, d) && canLand(w, j, d) && !w.fire[j]) good.push(j);
  if (!good.length) continue;
  for (let k = 0; k < Math.min(d.max, 10); k++) { const j = good[Math.floor(Math.random() * good.length)]; const a = wl.spawn(d, j % w.w, j / w.w | 0, { silent: true }); a.wait = Math.random(); a.thirst = Math.random() * 5; }
}
const cat = a => a.state === 'dormant' ? 'dormant' : a.drinkT > 0 || a.waterTrip ? 'water'
  : ['hunt', 'feed', 'carry', 'forage'].includes(a.state) || a.forageGoal != null || a.fruitMeal || a.fruitGoal != null || a.bird?.kind === 'forage' ? 'eat'
  : a.bird?.kind === 'soar' ? 'soar' : a.state === 'flee' ? 'flee'
  : a.range?.goal != null ? 'rangeTrip' : a.trip != null ? 'roam' : a.follow ? 'follow' : a.territory?.goal != null ? 'patrol'
  : a.state === 'walk' || a.state === 'fly' || a.state === 'approach' ? 'wander' : 'still';
const C = ['eat', 'water', 'rangeTrip', 'roam', 'wander', 'follow', 'patrol', 'soar', 'flee', 'still', 'dormant'];
const tally = new Map();
for (let k = 0; k < 1600; k++) { if (k % 20 === 0) { g.day++; wl.daily(); } wl.update(0.05); if (k < 100) continue;
  for (const a of wl.agents) { if (a.leaving) continue; const t = tally.get(a.key) || {}; const c = cat(a); t[c] = (t[c] || 0) + 1; t.n = (t.n || 0) + 1; tally.set(a.key, t); } }
console.log(['species', ...C].join(' '));
for (const [k, t] of tally) console.log([k, ...C.map(c => Math.round(100 * (t[c] || 0) / t.n))].join(' '));
