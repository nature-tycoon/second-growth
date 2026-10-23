// node tools/animal-density-check.mjs
// The "Where animals are" overlay: a smoothed head count per tile that peaks where the animals are,
// one species at a time if asked, and a monthly per-species census in game.history for the
// legend's yearly change. Real restored PNW landscape; no saves read.
import assert from 'node:assert/strict';
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { animalDensity, speciesCounts, speciesColor } from '../js/sim/animal-density.js';

let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function scene(seed = 7) {
  Math.random = mulberry32(seed);
  const g = restoredGame('pnw', seed), wl = g.wildlife;
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6;
  return { g, wl, w: g.world };
}
const peak = (w, d) => { let b = 0; for (let i = 1; i < w.n; i++) if (d[i] > d[b]) b = i; return [b % w.w, b / w.w | 0]; };

check('Density peaks where the animals are and fades a few tiles away', () => {
  const { g, wl, w } = scene(), deer = g.catalog.animal.deer;
  for (let k = 0; k < 5; k++) wl.spawn(deer, 20.5 + k * 0.2, 30.5, { silent: true });
  const d = animalDensity(w, wl.agents);
  const [px, py] = peak(w, d);
  assert.ok(Math.hypot(px - 20.5, py - 30.5) < 2, `peak at the herd (${px},${py})`);
  assert.equal(d[w.idx(px, py)], 1, 'scaled to 1 at the densest spot');
  assert.equal(d[w.idx(px + 12, py)], 0, 'nothing far away');
});

check('A lone animal still shows beside a big herd, and one species can be picked out', () => {
  const { g, wl, w } = scene(), deer = g.catalog.animal.deer, rabbit = g.catalog.animal.rabbit;
  for (let k = 0; k < 16; k++) wl.spawn(deer, 20.5, 30.5, { silent: true });
  wl.spawn(rabbit, 60.5, 40.5, { silent: true });
  const all = animalDensity(w, wl.agents);
  assert.ok(all[w.idx(60, 40)] > 0.2, `lone rabbit visible (${all[w.idx(60, 40)].toFixed(2)})`);
  const only = animalDensity(w, wl.agents, rabbit.index);
  assert.equal(only[w.idx(60, 40)], 1, 'rabbit-only map peaks at the rabbit');
  assert.equal(only[w.idx(20, 30)], 0, 'deer left out');
});

check('Animals walking off the map are not counted', () => {
  const { g, wl } = scene(), deer = g.catalog.animal.deer;
  const a = wl.spawn(deer, 20.5, 30.5, { silent: true }); wl.spawn(deer, 21.5, 30.5, { silent: true });
  a.leaving = true;
  assert.equal(speciesCounts(wl.agents, g.catalog.animals.length)[deer.index], 1);
});

check('Species colours differ between neighbours in the catalog', () => {
  const cs = new Set(Array.from({ length: 30 }, (_, k) => speciesColor(k)));
  assert.equal(cs.size, 30);
});

check('Each month-end records a head count per species in game.history', () => {
  const { g, wl } = scene(), deer = g.catalog.animal.deer;
  for (let k = 0; k < 3; k++) wl.spawn(deer, 20.5 + k, 30.5, { silent: true });
  const before = g.history.length;
  g.monthlyTick(g.month);
  const h = g.history.at(-1);
  assert.equal(g.history.length, before + 1);
  assert.deepEqual(h.pops, speciesCounts(wl.agents, g.catalog.animals.length), 'matches the animals on the map');
  assert.ok(h.pops[deer.index] >= 1, `deer counted (${h.pops[deer.index]})`);
});

console.log(`${checks} checks passed`);
