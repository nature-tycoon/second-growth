// node tools/wildlife-diagnostics-check.mjs
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { ANIMALS, ANIMAL } from '../js/data/animals.js';
import { T, F, H, clamp } from '../js/config.js';
import { arrivalFinding } from '../js/sim/animals.js';
import { arrivalAccess, resourceDiagnostics, wildlifeDiagnostics } from '../js/sim/wildlife-diagnostics.js';
import { tr } from '../js/i18n.js';
import '../js/lang/es.js';

const g = new Game();
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const row = (d, key) => d.rows.find(r => r.key === key);
const explain = key => wildlifeDiagnostics(g, ANIMAL[key]);
function state(key, values) { Object.assign(g.wildlife.state[ANIMAL[key].index], values); }
function openEdges() { g.world.feature.fill(0); g.world.struct.fill(-1); }

check('Every map produces finite diagnostics without changing simulation state or consuming randomness', () => {
  let count = 0;
  for (const map of ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'reef', 'sumatra']) {
    g.newGame(1987, 'free', 'standard', map);
    const before = JSON.stringify({ states: g.wildlife.state, globals: g.wildlife.g, flags: g.flags, agents: g.wildlife.agents });
    const rng = g.rng, random = Math.random;
    g.rng = Math.random = () => { throw Error('Diagnostics consumed random state'); };
    try {
      for (const def of ANIMALS) {
        const d = wildlifeDiagnostics(g, def);
        assert.ok(d.status && d.rows.length, `${map}/${def.key}`);
        assert.ok(!JSON.stringify(d).match(/NaN|undefined|Infinity/), `${map}/${def.key}`);
        assert.ok(Number.isFinite(g.wildlife.state[def.index].K));
        count++;
      }
    } finally { g.rng = rng; Math.random = random; }
    assert.equal(JSON.stringify({ states: g.wildlife.state, globals: g.wildlife.g, flags: g.flags, agents: g.wildlife.agents }), before);
  }
  assert.equal(count, 194); // Adult model variants share their species' diagnostic.
});

g.newGame(1987, 'free', 'standard', 'pnw');
check('Capacity instrumentation preserves the ordinary simulation formula', () => {
  g.wildlife.computeSuitability();
  for (const def of ANIMALS.filter(d => d.special !== 'salmon')) {
    const st = g.wildlife.state[def.index];
    let expected = st.suitSum / def.hr * clamp(def.req(g.wildlife.g), 0, 1.5);
    if (def.prey) expected = Math.min(expected, def.prey.reduce((n, k) => n + g.wildlife.state[ANIMAL[k].index].pop, 0) / def.preyPer);
    assert.equal(st.K, Math.min(def.max, expected), def.key);
  }
});
check('Fully closed deer source edges block arrival; a gap changes the advice; cleared fences remove it', () => {
  const w = g.world; openEdges(); w.terrain.fill(T.SOIL);
  for (let x = 0; x < w.w; x++) w.feature[w.idx(x, 0)] = F.FENCE;
  for (let y = 0; y < w.h; y++) w.feature[w.idx(w.w - 1, y)] = F.FENCE;
  state('deer', { K: 8, pop: 0, baseK: 8, ready: 20 });
  assert.equal(explain('deer').status, 'Arrival access is blocked');
  w.feature[w.idx(4, 0)] = 0;
  assert.equal(arrivalAccess(g, ANIMAL.deer).blocked, false);
  assert.equal(row(explain('deer'), 'access').title, 'Some entry points are blocked');
  w.feature.fill(0);
  assert.equal(row(explain('deer'), 'access'), undefined);
});
check('Fences do not block flying species or unfenced small mammals', () => {
  g.world.feature.fill(F.FENCE);
  assert.equal(arrivalAccess(g, ANIMAL.robin).blocked, false);
  assert.equal(arrivalAccess(g, ANIMAL.vole).blocked, false);
});
check('Seasonal absence takes priority and points to the next visiting season', () => {
  g.day = 80; // November
  state('bat', { K: 10, pop: 0, baseK: 10 });
  const d = explain('bat');
  assert.equal(d.status, 'Waiting for the visiting season');
  assert.match(row(d, 'season').text, /March/);
  state('bat', { lastYear: 3 });
  assert.ok(row(explain('bat'), 'returning'));
});
check('Prey limits are reported even when habitat is also insufficient', () => {
  state('cougar', { K: 0, habitatK: 0, preyK: 0, pop: 0 });
  assert.ok(row(explain('cougar'), 'prey'));
});
check('Missing forest and berries are both detected when the requirement product is zero', () => {
  const globals = { ...g.wildlife.g, forestTiles: 0, berryTiles: 0, salmonBonus: 0 };
  const limits = resourceDiagnostics(ANIMAL.bear, globals).map(r => r.key);
  assert.deepEqual(limits.sort(), ['berries', 'forest']);
});
check('Adequate alternative roosts do not falsely recommend nest boxes', () => {
  const globals = { ...g.wildlife.g, snagCount: 10, nestboxCount: 0, structureCount: 0 };
  assert.equal(resourceDiagnostics(ANIMAL.bat, globals).length, 0);
});
check('Disturbance is named only when it actually removes meaningful habitat', () => {
  state('heron', { K: 0.4, baseK: 0.4, calmK: 2, rawK: 2, pop: 0 });
  assert.ok(row(explain('heron'), 'disturbance'));
  state('heron', { calmK: 0.4, rawK: 0.4 });
  assert.equal(row(explain('heron'), 'disturbance'), undefined);
});
check('Fire and flooding are distinguished from visitor disturbance', () => {
  state('heron', { baseK: 0.4, calmK: 0.4, rawK: 2 });
  assert.ok(row(explain('heron'), 'disaster'));
  assert.equal(row(explain('heron'), 'disturbance'), undefined);
});
check('Initial discovery, random arrivals and full capacity have different explanations', () => {
  openEdges(); g.day = 0;
  state('deer', { K: 8, baseK: 8, habitatK: 8, pop: 0, discovered: false, ready: 3, resourceFactor: 1, calmK: 8, rawK: 8 });
  assert.equal(explain('deer').status, 'New habitat is still being discovered');
  state('deer', { ready: 4 });
  assert.equal(explain('deer').status, 'Ready for a possible natural arrival');
  assert.match(row(explain('deer'), 'arrival').text, /no guaranteed date/);
  state('deer', { pop: 8 });
  assert.equal(explain('deer').status, 'At current capacity');
  state('deer', { pop: 12 });
  assert.equal(explain('deer').status, 'Population exceeds current capacity');
});
check('The shared discovery ramp retains seasonal and quick-arrival rules', () => {
  assert.equal(arrivalFinding(ANIMAL.deer, { pop: 0, ready: 3 }), 0);
  assert.equal(arrivalFinding(ANIMAL.deer, { pop: 0, ready: 19 }), 1);
  assert.equal(arrivalFinding(ANIMAL.bat, { pop: 0, ready: 2 }), 0);
  assert.ok(arrivalFinding(ANIMAL.bat, { pop: 0, ready: 3 }) > 0);
  assert.equal(arrivalFinding({ quick: true }, { pop: 0 }), 1);
  assert.equal(arrivalFinding(ANIMAL.deer, { pop: 0, discovered: true }), 1);
});
check('Salmon use the actual 15-tile run threshold, passage and October timing', () => {
  const w = g.world; openEdges(); w.terrain.fill(T.SOIL); w.connected.fill(0);
  w.habitat.fill(H.FARM); w.waterQ.fill(0); w.disturb.fill(0); w.fire.fill(0); w.flood.fill(0);
  for (let x = 0; x < 15; x++) { const i = w.idx(x, 30); w.terrain[i] = T.CREEK; w.habitat[i] = H.CREEK; w.waterQ[i] = 0.8; w.connected[i] = 1; }
  const entry = w.idx(0, w.h - 1); w.terrain[entry] = T.RIVER; w.connected[entry] = 1;
  g.wildlife.computeSuitability();
  assert.equal(g.wildlife.state[ANIMAL.coho.index].K, 5);
  assert.equal(row(explain('coho'), 'habitat').tone, 'good');
  assert.match(row(explain('coho'), 'season').text, /October/);
  w.connected[w.idx(0, 30)] = 0;
  g.wildlife.computeSuitability();
  assert.equal(row(explain('coho'), 'habitat').tone, 'warn');
  assert.ok(row(explain('coho'), 'passage'));
  w.connected[w.idx(1, 30)] = 1; w.waterQ[w.idx(1, 30)] = 0.35;
  g.wildlife.computeSuitability();
  assert.ok(row(explain('coho'), 'quality'));
  g.day = 70;
  assert.match(row(explain('coho'), 'season').text, /start of October/);
});

g.newGame(1987, 'free', 'standard', 'serengeti');
check('Migration uses the exact north fence threshold, including the allowed four tiles', () => {
  const w = g.world; openEdges();
  for (let x = 0; x < 5; x++) w.feature[w.idx(x, 0)] = F.FENCE;
  assert.equal(arrivalAccess(g, ANIMAL.wildebeest).blocked, true);
  w.feature[w.idx(4, 0)] = 0;
  assert.equal(arrivalAccess(g, ANIMAL.wildebeest).blocked, false);
  assert.equal(row(explain('wildebeest'), 'access'), undefined);
});
check('Scavengers and dung beetles explain their dependence on herds', () => {
  for (const def of ANIMALS.filter(d => d.needs)) {
    Object.assign(g.wildlife.state[def.index], { K: 0, hostK: 0, habitatK: 0 });
    assert.ok(row(wildlifeDiagnostics(g, def), 'hosts'), def.key);
  }
});

g.newGame(1987, 'free', 'standard', 'amazon');
check('Canopy entry diagnostics follow grown edge trees, not a claim of full path connectivity', () => {
  const w = g.world; openEdges(); w.tree.fill(0); w.treeG.fill(0);
  assert.equal(arrivalAccess(g, ANIMAL.howler).blocked, true);
  const i = w.idx(4, 0); w.tree[i] = 1; w.treeG[i] = 0.5;
  assert.equal(arrivalAccess(g, ANIMAL.howler).blocked, false);
});

g.newGame(1987, 'free', 'standard', 'reef');
check('Reef requirements use coral and seagrass wording', () => {
  const globals = { ...g.wildlife.g, forestTiles: 0, meadowTiles: 0 };
  assert.equal(resourceDiagnostics(ANIMAL.tang, globals)[0].title, 'Coral habitat');
  const grazer = ANIMALS.find(d => d.req({ ...globals, meadowTiles: 1e6 }) > d.req(globals));
  assert.ok(grazer);
  assert.ok(resourceDiagnostics(grazer, globals).some(r => r.title === 'Seagrass habitat'));
});

g.newGame(1987, 'free', 'standard', 'chinandega');
check('Cattle never claim to be waiting for natural wildlife immigration', () => {
  assert.equal(explain('cattle').status, 'Managed herd');
  assert.equal(row(explain('cattle'), 'arrival'), undefined);
});
check('Creek shade advice uses the actual shade ratio without increasing its denominator', () => {
  const globals = { ...g.wildlife.g, stats: { ...g.wildlife.g.stats, creek: 100, shadedCreek: 0 } };
  const species = ANIMALS.find(d => resourceDiagnostics(d, globals).some(r => r.key === 'shade'));
  assert.ok(species);
  globals.stats.shadedCreek = 80;
  assert.equal(resourceDiagnostics(species, globals).some(r => r.key === 'shade'), false);
});
check('Nicaragua diagnostic statuses and advice retain Spanish support', () => {
  for (const def of ANIMALS) {
    const d = wildlifeDiagnostics(g, def);
    for (const text of [d.status, ...d.rows.flatMap(r => [r.title, r.text])]) assert.notEqual(tr(text, 'es'), text, text);
  }
  assert.match(tr('The next visiting season starts in March. An absence this month is expected.', 'es'), /marzo/);
});
console.log(`${checks} wildlife diagnostic checks passed.`);
