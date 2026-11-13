// node tools/fishing-check.mjs
// Fish-eaters fish (decision 0030): herons strike from the shallows, kingfishers plunge and
// eagles snatch and fly off to a perch, otters fish afloat, bears swipe from the bank. A strike
// takes a drawn fish only when one is in reach; otherwise (all but bears) it comes up with one of
// the fish the water holds, taking nothing from the drawn fish. Boobies plunge-dive and noddies
// dip at the reef's sea, mostly coming up empty. Ends with a seeded PNW soak.
import { forceSimRandom, forcedSimRandom } from '../js/sim/sim-random.js';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { BIOME_LIST, mapCatalog } from '../js/biome.js';
import { T, DAYS_PER_YEAR } from '../js/config.js';
import { fishing, fishStrike, fishChoose, isFish } from '../js/sim/fishing.js';
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { passable, canLand, shallows } from '../js/sim/animal-terrain.js';
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
const seeded = (seed, fn) => { const r = forcedSimRandom(); forceSimRandom(mulberry32(seed)); try { return fn(); } finally { forceSimRandom(r); } };
const fixed = (v, fn) => { const r = forcedSimRandom(); forceSimRandom(() => v); try { return fn(); } finally { forceSimRandom(r); } };
Math.random = mulberry32(30);
// A strip of land with a creek down x = 30 and a fir beside it at (27, 30).
function setup(map = 'pnw', diff = 'standard') {
  const g = new Game(); g.newGame(1987, 'free', diff, map);
  const wl = g.wildlife, w = g.world; wl.agents = []; wl.flyovers = []; wl.passageWait = 1e6; wl.recount();
  for (let y = 15; y < 45; y++) for (let x = 15; x < 45; x++) {
    const i = w.idx(x, y); w.terrain[i] = x === 30 || x === 31 ? T.CREEK : T.SOIL; w.tree[i] = 0; w.shrub[i] = 0; w.struct[i] = -1;
    w.feature[i] = 0; w.fire[i] = 0; w.waterQ[i] = 0.8; w.distWater[i] = x < 30 ? 30 - x : x > 31 ? x - 31 : 0;
  }
  const fir = g.catalog.plants.find(p => p && p.layer === 2 && p.heightM)?.id, t = w.idx(27, 30);
  w.tree[t] = fir; w.treeG[t] = 1;
  return g;
}
function spawn(g, key, x, y) {
  const a = g.wildlife.spawn(g.catalog.animal[key], Math.floor(x), Math.floor(y), { silent: true });
  Object.assign(a, { x, y, state: 'idle', flying: false, alt: 0, wait: 99, age: (g.catalog.animal[key].mature + 1) * DAYS_PER_YEAR, juvenile: false });
  return a;
}
const run = (g, until, n = 800) => { for (let k = 0; k < n && !until(); k++) g.wildlife.update(0.05); };

check('Fishers have profiles on every map; they fish where they do not already hunt fish', () => {
  const fishers = { pnw: ['heron', 'kingfisher', 'eagle', 'otter', 'bear'], atlanta: ['heron'], amazon: ['cocoi', 'amkingfisher'], chinandega: ['egret'], sumatra: ['stork', 'kingfisher'], reef: ['booby', 'noddy'] };
  for (const b of BIOME_LIST) {
    const g = new Game(); g.newGame(1987, 'free', 'standard', b.id);
    for (const key of fishers[b.id] || []) assert.ok(fishing(g.catalog.animal[key], g), `${b.id}/${key} fishes on Standard`);
    for (const d of mapCatalog(b.id).animals) if (d.behavior.fishing && !(fishers[b.id] || []).includes(d.key))
      assert.ok(!fishing(d, g) || d.key === 'otter' || d.key === 'giantotter', `${b.id}/${d.key}`);
  }
  const ch = new Game(); ch.newGame(1987, 'free', 'challenging', 'pnw');
  assert.equal(fishing(ch.catalog.animal.heron, ch), null, 'a Challenging heron hunts the fish themselves');
  assert.ok(fishing(ch.catalog.animal.bear, ch), 'bears fish in both');
});
check('A heron strike takes a drawn fish in reach, or else comes up with one the water holds', () => {
  const g = setup(), wl = g.wildlife, H = g.catalog.animal.heron;
  const h = spawn(g, 'heron', 29.6, 30.5), trout = spawn(g, 'cutthroat', 30.2, 30.5);
  assert.equal(fixed(0, () => fishStrike(wl, h, H, 30.1, 30.5)), true);
  assert.ok(!wl.agents.includes(trout), 'the drawn trout is gone');
  assert.equal(h.state, 'feed'); assert.equal(h.prey.fish, true); assert.equal(h.prey.id, trout.id);
  const h2 = spawn(g, 'heron', 29.6, 35.5), other = spawn(g, 'cutthroat', 30.5, 40.5), before = wl.agents.length;
  assert.equal(fixed(0, () => fishStrike(wl, h2, H, 30.1, 35.5)), true);
  assert.equal(wl.agents.length, before, 'nothing drawn taken'); assert.ok(wl.agents.includes(other));
  assert.equal(h2.prey.id, -1); assert.ok(isFish(g.catalog.animals[h2.prey.sp]));
  assert.equal(fixed(0, () => fishStrike(wl, h2, H, 20.5, 35.5)), false, 'no fish on dry land');
  assert.ok(h2.fishFed > h2.age, 'fed for a while after');
});
check('A hungry heron goes to the shallows and fishes there', () => {
  const g = setup(), wl = g.wildlife, h = spawn(g, 'heron', 22.5, 30.5); h.wait = 0;
  let fished = false;
  run(g, () => (fished = h.state === 'feed' && h.prey?.fish), 3000);
  assert.ok(fished, `caught a fish (${h.state})`);
  // (at the test creek, or real shallows past the test ground: the map around it is the real pnw)
  const w = g.world; assert.ok(shallows(w, w.idx(Math.floor(h.x), Math.floor(h.y))) || Math.abs(h.x - 30.5) < 2.5, `at the water (${h.x.toFixed(1)}, ${h.y.toFixed(1)})`);
});
for (const [key, style] of [['kingfisher', 'plunge'], ['eagle', 'snatch']]) check(`A ${key} dives on the water and flies to a perch with its fish`, () => {
  const g = setup(), wl = g.wildlife, D = g.catalog.animal[key], a = spawn(g, key, 27.5, 30.5);
  assert.equal(fishing(D, g).style, style);
  assert.equal(seeded(2, () => { for (let k = 0; k < 20; k++) if (fishChoose(wl, a, D)) return true; return false; }), true); assert.equal(a.state, 'fish');
  const seen = new Set();
  const r = forcedSimRandom(); forceSimRandom(mulberry32(5));
  try { run(g, () => { seen.add(a.state === 'fish' ? a.fishing.phase : a.state); return a.state === 'feed'; }, 2000); } finally { forceSimRandom(r); }
  assert.ok(seen.has('dive'), 'a dive'); assert.ok(seen.has('carry'), `carried it (${[...seen]})`);
  assert.equal(a.state, 'feed'); assert.equal(a.prey?.fish, true);
  const w = g.world, i = w.idx(Math.floor(a.x), Math.floor(a.y));
  assert.ok(w.tree[i] || w.feature[i], 'eats on a perch');
});
check('An otter swims out to fish and eats its catch afloat', () => {
  const g = setup(), wl = g.wildlife, O = g.catalog.animal.otter, o = spawn(g, 'otter', 26.5, 30.5);
  assert.equal(seeded(2, () => { for (let k = 0; k < 20; k++) if (fishChoose(wl, o, O)) return true; return false; }), true);
  const r = forcedSimRandom(); forceSimRandom(mulberry32(9));
  try { run(g, () => o.state === 'feed', 3000); } finally { forceSimRandom(r); }
  assert.equal(o.state, 'feed'); assert.equal(o.prey?.fish, true);
  assert.ok(isFinite(o.x) && Math.abs(o.x - 30.5) < 2, 'in or by the creek');
});
check('A bear between runs swipes a trout it can see from the bank, and never an unseen one', () => {
  const g = setup(), wl = g.wildlife, B = g.catalog.animal.bear, b = spawn(g, 'bear', 25.5, 30.5); b.wait = 0;
  assert.equal(fishing(B, g).unseen, false);
  const r = forcedSimRandom(); forceSimRandom(mulberry32(3));
  try { run(g, () => b.state === 'feed', 3000); } finally { forceSimRandom(r); }
  assert.notEqual(b.state, 'feed', 'no fish, no catch');
  const t = spawn(g, 'cutthroat', 30.5, 30.5); t.wait = 99;
  Object.assign(b, { x: 25.5, y: 30.5, state: 'idle', wait: 0, path: null, home: null, range: null });
  forceSimRandom(mulberry32(4));
  try { run(g, () => b.state === 'feed' && b.prey?.fish, 4000); } finally { forceSimRandom(r); }
  assert.equal(b.prey?.id, t.id, 'the trout'); assert.ok(!wl.agents.includes(t));
});
// The reef's seabirds over open sea, off the cay.
function reefSea(seed = 1987) {
  const g = new Game(); g.newGame(seed, 'free', 'standard', 'reef');
  const wl = g.wildlife, w = g.world, dry = g.catalog.definition.dryLand;
  wl.agents = []; wl.flyovers = []; wl.passageWait = 1e6; wl.recount(); wl.computeSuitability();
  let at = -1;
  for (let j = 0; j < w.n && at < 0; j++) { const x = j % w.w, y = j / w.w | 0; if (x > 10 && y > 10 && x < w.w - 10 && y < w.h - 10 && !dry(w, j)) at = j; }
  return { g, wl, x: at % w.w + 0.5, y: (at / w.w | 0) + 0.5 };
}
for (const [key, style] of [['booby', 'dive'], ['noddy', 'dip']]) check(`A ${key} fishes the sea (${style}), mostly coming up empty, and catches a surface fish`, () => {
  const { g, wl, x, y } = reefSea(), D = g.catalog.animal[key];
  assert.equal(fishing(D, g)?.style, style);
  const a = spawn(g, key, x, y);
  let strikes = 0, catches = 0, maxAlt = 0, under = false, lastPhase = null;
  const r = forcedSimRandom(); forceSimRandom(mulberry32(key === 'booby' ? 3 : 8));
  try {
    for (let k = 0; k < 60000 && catches < 6; k++) {
      if (a.state !== 'fish' && a.state !== 'feed') { a.fishFed = 0; Object.assign(a, { state: 'idle', wait: 99 }); fishChoose(wl, a, D); }
      const before = a.fishing?.phase;
      g.wildlife.update(0.05);
      if (a.state === 'fish') maxAlt = Math.max(maxAlt, a.alt);
      under ||= a.fishing?.phase === 'under';
      const now = a.state === 'fish' ? a.fishing?.phase : a.state;
      if ((before === 'under' || before === 'touch') && now !== before) { strikes++; if (a.state === 'feed' || a.fishing?.phase === 'rise' && a.fishFed > a.age) catches++; }
      lastPhase = now;
    }
  } finally { forceSimRandom(r); }
  assert.ok(catches >= 3, `${key}: ${catches} catches in ${strikes} strikes (${lastPhase})`);
  assert.ok(catches / strikes < 0.5, `${key}: most strikes miss (${catches}/${strikes})`);
  if (style === 'dive') { assert.ok(under, 'it goes under'); assert.ok(maxAlt >= 1.4, `plunges from high up (${maxAlt.toFixed(2)})`); }
  else { assert.ok(!under, 'a noddy never goes under'); assert.ok(maxAlt <= 0.6, `flies low (${maxAlt.toFixed(2)})`); }
  if (a.prey) assert.ok(g.catalog.animals[a.prey.sp].surfaceFish, 'a surface fish');
});
check('PNW community soak: every fisher is seen fishing, and the drawn fish are not emptied', () => {
  for (const seed of [7, 11]) {
    Math.random = mulberry32(seed);
    const g = restoredGame('pnw', seed), wl = g.wildlife, w = g.world;
    wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability();
    for (const d of g.catalog.animals) {
      const near = d.behavior.fishing, good = [];
      for (let j = 0; j < w.n; j++) if ((near ? w.distWater[j] >= 1 && w.distWater[j] <= 3 : wl.suit[d.index][j] > 0.3) && passable(w, j, d) && canLand(w, j, d) && !w.fire[j]) good.push(j);
      for (let k = 0; k < Math.min(d.max, near ? 3 : 10) && good.length; k++) { const j = good[Math.floor(Math.random() * good.length)]; wl.spawn(d, j % w.w, j / w.w | 0, { silent: true }).wait = Math.random(); }
    }
    const fish = () => wl.agents.filter(a => isFish(g.catalog.animals[a.sp])).length, start = fish();
    const caught = {}, seen = new Map();
    for (let k = 0; k < 2000; k++) {
      if (k % 20 === 0) { g.day++; wl.daily(); }
      wl.update(0.05);
      for (const a of wl.agents) if (a.prey?.fish && (a.state === 'feed' || a.state === 'carry') && seen.get(a.id) !== a.prey) { seen.set(a.id, a.prey); caught[a.key] = (caught[a.key] || 0) + 1; }
    }
    console.log(`  seed ${seed}: 100 days, catches ${JSON.stringify(caught)}, drawn fish ${start} -> ${fish()}`);
    for (const key of ['heron', 'kingfisher', 'eagle', 'otter']) assert.ok(caught[key] >= 3, `seed ${seed}: ${key} caught ${caught[key] || 0}`);
    assert.ok(fish() >= start * 0.5, `seed ${seed}: drawn fish ${start} -> ${fish()}`);
  }
});
console.log(`${checks} fishing checks passed.`);
