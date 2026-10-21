// node tools/predation-risk-check.mjs
// Landscape of fear (decision 0015): prey remember where their kind was killed or chased,
// per species, for a few weeks, and weigh it when choosing a home, a site or a drinking spot.
// It is never a wall. Real restored PNW landscape; no saves read.
import assert from 'node:assert/strict';
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { passable, canLand } from '../js/sim/animal-terrain.js';
import { markRisk, riskAt, decayRisk } from '../js/sim/predation-risk.js';
import { ensureHome, homeWater, homeRadius } from '../js/sim/home-range.js';

let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function scene(seed = 5) {
  Math.random = mulberry32(seed);
  const g = restoredGame('pnw', seed), wl = g.wildlife, w = g.world;
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability(); wl.risk = null;
  const habitat = d => { const s = wl.suit[d.index], out = []; for (let j = 0; j < w.n; j++) if (s[j] > 0.3 && passable(w, j, d) && canLand(w, j, d) && !w.fire[j]) out.push(j); return out; };
  return { g, wl, w, habitat };
}
const tileDist = (w, i, j) => Math.hypot(i % w.w - j % w.w, (i / w.w | 0) - (j / w.w | 0));
const at = (w, j) => [j % w.w + 0.5, (j / w.w | 0) + 0.5];

check('A kill is remembered by its own kind only, and fades by about half in two weeks', () => {
  const { g, wl, w } = scene(), rabbit = g.catalog.animal.rabbit, deer = g.catalog.animal.deer, j = w.idx(40, 30);
  markRisk(wl, rabbit.index, 40.5, 30.5, 1);
  assert.ok(riskAt(wl, rabbit.index, j) > 0.8 && riskAt(wl, rabbit.index, w.idx(42, 30)) > 0, 'marks the spot and nearby');
  assert.equal(riskAt(wl, deer.index, j), 0, 'other species unaffected');
  const start = riskAt(wl, rabbit.index, j);
  for (let d = 0; d < 14; d++) decayRisk(wl);
  const left = riskAt(wl, rabbit.index, j) / start;
  assert.ok(left > 0.4 && left < 0.6, `about half left after 14 days (${left.toFixed(2)})`);
  for (let d = 0; d < 120; d++) decayRisk(wl);
  assert.equal(wl.risk.get(rabbit.index).size, 0, 'old memories are dropped');
});

check('A rabbit settles away from where its kind was just killed', () => {
  const { g, wl, w, habitat } = scene(), d = g.catalog.animal.rabbit, good = habitat(d);
  const a = wl.spawn(d, good[0] % w.w, good[0] / w.w | 0, { silent: true });
  const first = ensureHome(wl, a, d).center;
  a.home = null; a.homeAfter = 0;
  markRisk(wl, d.index, ...at(w, first), 3);
  const second = ensureHome(wl, a, d).center;
  assert.ok(tileDist(w, first, second) >= 3, `moved off the kill site (${tileDist(w, first, second).toFixed(1)} tiles)`);
});

check('Repeated kills make a resident give up its home; a single scare does not', () => {
  const { g, wl, w, habitat } = scene(), d = g.catalog.animal.rabbit, good = habitat(d);
  const a = wl.spawn(d, good[5] % w.w, good[5] / w.w | 0, { silent: true });
  const home = ensureHome(wl, a, d).center;
  a.homeAfter = 0; // (days later: past the settling cooldown)
  markRisk(wl, d.index, ...at(w, home), 0.25); // a flight
  assert.equal(ensureHome(wl, a, d).center, home, 'one scare: stays');
  markRisk(wl, d.index, ...at(w, home), 1); markRisk(wl, d.index, ...at(w, home), 1); // two kills
  const after = ensureHome(wl, a, d);
  assert.ok(after && tileDist(w, after.center, home) >= 2, 'resettled elsewhere');
});

check('Prey drink at another bank nearby after an ambush at their usual spot', () => {
  const { g, wl, w, habitat } = scene(), d = g.catalog.animal.raccoon;
  let a = null, first = -1;
  for (const j of habitat(d).filter(j => w.distWater[j] >= 3)) {
    a = wl.spawn(d, j % w.w, j / w.w | 0, { silent: true });
    a.home = { center: j, r: homeRadius(d), water: null, waterRoute: null, back: false };
    first = homeWater(wl, a, d);
    if (first >= 0) break;
    wl.remove(a);
  }
  assert.ok(first >= 0, 'fixture home with water');
  markRisk(wl, d.index, ...at(w, first), 2); markRisk(wl, d.index, ...at(w, first), 2);
  const second = homeWater(wl, a, d);
  assert.notEqual(second, first, 'chose a different bank');
  assert.ok(riskAt(wl, d.index, second) < riskAt(wl, d.index, first), 'a safer one');
  assert.ok(w.distWater[second] <= 1, 'still on the bank');
});

check('Danger everywhere is not a wall: prey still settle and drink where they must', () => {
  const { g, wl, w, habitat } = scene(), d = g.catalog.animal.rabbit, good = habitat(d);
  for (let y = 0; y < w.h; y += 2) for (let x = 0; x < w.w; x += 2) markRisk(wl, d.index, x + 0.5, y + 0.5, 1);
  const a = wl.spawn(d, good[0] % w.w, good[0] / w.w | 0, { silent: true });
  assert.ok(ensureHome(wl, a, d), 'still settles a home');
});

check('Hunts mark danger for the prey, and a loaded game starts the memory afresh', () => {
  const { g, wl, w } = scene(), deer = g.catalog.animal.deer, cougar = g.catalog.animal.cougar;
  const prey = wl.spawn(deer, 40, 30, { silent: true }), cat = wl.spawn(cougar, 42, 30, { silent: true });
  prey.x = 40.5; prey.y = 30.5; cat.x = 42.5; cat.y = 30.5;
  wl.startHunt(cat, cougar, ['deer'], 12);
  for (let k = 0; k < 400 && wl.agents.includes(prey) && !(riskAt(wl, deer.index, w.idx(Math.floor(prey.x), Math.floor(prey.y))) > 0); k++) wl.update(0.05);
  assert.ok(wl.risk?.get(deer.index)?.size > 0, 'the chase or kill was remembered for deer');
  assert.ok(!wl.risk.get(cougar.index)?.size, 'not for the cougar');
  wl.load(JSON.parse(JSON.stringify(wl.serialize())));
  assert.equal(wl.risk, null, 'memory not carried through a load');
});

console.log(`${checks} predation risk checks passed.`);
