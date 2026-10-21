// node tools/home-range-check.mjs
// Home ranges and water trips (decision 0013): residents settle apart from their own kind,
// drink at the nearest water within reach of their own home, reuse the same route there,
// and water trips take a modest share of their time. Real restored landscapes; no saves read.
import assert from 'node:assert/strict';
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { passable, canLand } from '../js/sim/animal-terrain.js';
import { homeEligible, homeRadius, waterReach, homeWater, drinkEvery } from '../js/sim/home-range.js';

let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function scene(map, seed) {
  Math.random = mulberry32(seed);
  const g = restoredGame(map, seed), wl = g.wildlife, w = g.world;
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability();
  const habitat = d => { const s = wl.suit[d.index], out = []; for (let j = 0; j < w.n; j++) if (s[j] > 0.3 && passable(w, j, d) && canLand(w, j, d) && !w.fire[j]) out.push(j); return out; };
  const put = (d, j) => { const a = wl.spawn(d, j % w.w, j / w.w | 0, { silent: true }); a.wait = Math.random(); a.thirst = Math.random() * 5; return a; };
  const step = (n, each) => { for (let k = 0; k < n; k++) { if (k % 20 === 0) { g.day++; wl.daily(); } wl.update(0.05); each?.(k); } };
  return { g, wl, w, habitat, put, step };
}
const tileDist = (w, i, j) => Math.hypot(i % w.w - j % w.w, (i / w.w | 0) - (j / w.w | 0));

check('PNW brush rabbits spread over their habitat instead of clumping on one stretch of river', () => {
  for (const seed of [1987, 91]) {
    const { g, wl, w, habitat, put, step } = scene('pnw', seed), d = g.catalog.animal.rabbit, good = habitat(d), suit = wl.suit[d.index];
    for (let k = 0; k < 20; k++) put(d, good[Math.floor(Math.random() * good.length)]);
    let samples = 0, bank = 0;
    step(1000, k => { if (k < 200) return; for (const a of wl.agents) if (a.sp === d.index && !a.leaving) { samples++; if (w.distWater[w.idx(Math.floor(a.x), Math.floor(a.y))] <= 1) bank++; } });
    const habitatBank = good.filter(j => w.distWater[j] <= 1).length / good.length;
    assert.ok(bank / samples < habitatBank * 2 + 0.03, `${seed}: rabbits on the bank ${(100 * bank / samples).toFixed(1)}% vs habitat ${(100 * habitatBank).toFixed(1)}%`);
    // nearest-neighbour distance against the same number drawn from habitat (weighted by suitability)
    const pos = wl.agents.filter(a => a.sp === d.index && !a.leaving).map(a => [a.x, a.y]);
    const nn = P => P.reduce((s, p, i) => s + Math.min(...P.filter((_, k) => k !== i).map(q => Math.hypot(p[0] - q[0], p[1] - q[1]))), 0) / P.length;
    let total = 0; for (const j of good) total += suit[j];
    const draw = () => { let r = Math.random() * total; for (const j of good) if ((r -= suit[j]) <= 0) return [j % w.w + 0.5, (j / w.w | 0) + 0.5]; return [0, 0]; };
    let ref = 0; for (let t = 0; t < 30; t++) ref += nn(pos.map(draw)) / 30;
    assert.ok(nn(pos) / ref > 0.85, `${seed}: rabbits spread like their habitat (ratio ${(nn(pos) / ref).toFixed(2)})`);
  }
});

check('Animals released together settle separate homes', () => {
  const { g, wl, w, habitat, put, step } = scene('pnw', 7), d = g.catalog.animal.rabbit, good = habitat(d);
  const j = good[Math.floor(good.length / 2)], group = Array.from({ length: 8 }, () => put(d, j));
  step(200);
  const homes = group.filter(a => a.home).map(a => a.home.center);
  assert.ok(homes.length >= 6, `most settled a home (${homes.length}/8)`);
  const nearest = homes.map((c, i) => Math.min(...homes.filter((_, k) => k !== i).map(o => tileDist(w, c, o))));
  const mean = nearest.reduce((s, v) => s + v, 0) / nearest.length;
  assert.ok(mean >= homeRadius(d) * 0.6, `homes spread apart (mean nearest ${mean.toFixed(1)} tiles)`);
});

check('Each home drinks at the nearest water within its reach, or makes no water trips at all', () => {
  const { g, wl, w, habitat, put, step } = scene('pnw', 11);
  const d = g.catalog.animal.raccoon, good = habitat(d);
  for (let k = 0; k < 10; k++) put(d, good[Math.floor(Math.random() * good.length)]);
  step(60);
  let withWater = 0, without = 0;
  for (const a of wl.agents.filter(a => a.home)) {
    const water = homeWater(wl, a, d), reach = waterReach(d);
    if (water < 0) { without++; continue; }
    withWater++;
    assert.ok(w.distWater[water] <= 1, 'the drinking place is on the bank');
    assert.ok(tileDist(w, a.home.center, water) <= reach + 0.5, 'and within reach of home');
    assert.ok(drinkEvery(wl, a, d) >= (2 * tileDist(w, a.home.center, water) / d.speed) / d.behavior.water.share - 1e-6, 'drinks rarely enough for trips to stay within their share of time');
  }
  assert.ok(withWater > 0, 'some raccoons live within reach of water');
  // a rabbit with no water in reach never sets off on a water trip, however thirsty
  const r = g.catalog.animal.rabbit, far = habitat(r).filter(j => w.distWater[j] > waterReach(r) + 4);
  assert.ok(far.length, 'fixture has rabbit habitat far from water');
  const dry = put(r, far[0]);
  let trips = 0;
  step(400, () => { dry.thirst = Math.max(dry.thirst, 1e4); if (dry.waterTrip) trips++; });
  assert.equal(trips, 0, 'no water trips from a home with no water in reach');
  void without;
});

check('A resident walks the same route to its water time after time', () => {
  const { g, wl, w, habitat, put, step } = scene('pnw', 3), d = g.catalog.animal.raccoon;
  // a home some way back from the creek, so each drink is a real walk
  const homeAt = j => ({ center: j, r: homeRadius(d), water: null, waterRoute: null, back: false });
  const probe = put(d, habitat(d)[0]);
  const home = habitat(d).find(j => w.distWater[j] >= 5 && (probe.home = homeAt(j), homeWater(wl, probe, d) >= 0));
  wl.remove(probe);
  assert.ok(home != null, 'a home some way from water, with water in reach');
  const a = put(d, home);
  a.home = homeAt(home);
  const trips = [];
  let cur = null, drinking = false;
  step(4000, () => {
    if (a.drinkT > 0) { if (!drinking && cur?.size > 3) trips.push(cur); cur = null; drinking = true; return; }
    drinking = false;
    if (a.waterTrip) (cur ||= new Set()).add(w.idx(Math.floor(a.x), Math.floor(a.y)));
    // keep it thirsty once it is home again, to see many trips
    else if (a.state === 'idle' && tileDist(w, w.idx(Math.floor(a.x), Math.floor(a.y)), home) < a.home.r) a.thirst = Math.max(a.thirst, drinkEvery(wl, a, d) + 1);
  });
  assert.ok(trips.length >= 3, `several water trips (${trips.length})`);
  // most tiles of a later trip lie on (or beside) the first trip's route
  const first = [...trips[0]], near = j => first.some(k => tileDist(w, j, k) <= 1.5);
  for (const t of trips.slice(1, 4)) {
    const on = [...t].filter(near).length / t.size;
    assert.ok(on >= 0.6, `trip reuses the route (${(100 * on).toFixed(0)}% on it)`);
  }
});

check('Water trips take a modest share of every resident species\' time on six maps', () => {
  for (const map of ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'sumatra']) {
    const { g, wl, habitat, put, step } = scene(map, 5);
    for (const d of g.catalog.animals) {
      if (!homeEligible(wl, d)) continue;
      const good = habitat(d);
      for (let k = 0; good.length && k < Math.min(d.max, 6); k++) put(d, good[Math.floor(Math.random() * good.length)]);
    }
    const tally = new Map();
    step(700, k => { if (k < 100) return; for (const a of wl.agents) { if (a.leaving) continue; const t = tally.get(a.key) || [0, 0]; t[0]++; if (a.drinkT > 0 || a.waterTrip) t[1]++; tally.set(a.key, t); } });
    for (const [key, [n, water]] of tally) {
      const d = g.catalog.animal[key];
      if (!homeEligible(wl, d)) continue;
      const limit = d.behavior.water.share > 0.1 ? 0.3 : 0.2;
      assert.ok(water / n <= limit, `${map}/${key}: ${(100 * water / n).toFixed(0)}% of time on water trips`);
    }
  }
});

check('Homes and water routes are copied into saves, not shared with live animals', () => {
  const { g, wl, habitat, put, step } = scene('pnw', 3), d = g.catalog.animal.raccoon;
  const a = put(d, habitat(d)[0]);
  step(40);
  a.home.waterRoute = [1, 2, 3];
  const saved = wl.serialize(), copy = saved.agents.find(o => o.id === a.id);
  assert.notEqual(copy.home, a.home); assert.notEqual(copy.home.waterRoute, a.home.waterRoute);
  a.home.waterRoute.push(4);
  assert.deepEqual(copy.home.waterRoute, [1, 2, 3]);
  wl.load(JSON.parse(JSON.stringify(saved)));
  const loaded = wl.agents.find(o => o.id === a.id);
  assert.equal(loaded.home.center, copy.home.center);
  // older saves without homes settle one on a later decision
  for (const o of wl.agents) o.home = o.homeAfter = undefined;
  step(200);
  assert.ok(wl.agents.some(o => o.home), 'legacy animals settle homes');
});

console.log(`${checks} home range checks passed.`);
