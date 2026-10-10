// Seeded simulation checks for families, rut encounters and repeated short walks.
// Run: node tools/cervid-behavior-check.mjs
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { T, F, H, DAYS_PER_YEAR } from '../js/config.js';
import { ANIMAL, isMaleVariant, drawDef } from '../js/data/animals.js';
import { cervidLeader, keepCervidGroup } from '../js/sim/cervid-groups.js';
import { greet, socialHold, bolt, haremDay } from '../js/sim/animal-life.js';
import { mulberry32 } from '../js/rng.js';
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function setup(seed = 44, map = 'pnw', month = 1) {
  Math.random = mulberry32(seed);
  const g = new Game(); g.newGame(1987, 'free', 'standard', map); g.day = month * 10;
  const wl = g.wildlife, w = g.world;
  wl.agents = []; wl.flyovers = []; wl.passageWait = 1e6; wl.recount();
  w.terrain.fill(T.SOIL); w.struct.fill(-1); w.tree.fill(0); w.shrub.fill(0); w.feature.fill(0); w.fire.fill(0); w.distWater.fill(99);
  wl.suit.forEach(s => s.fill(1)); return g;
}
function spawn(g, key, male, x, y) {
  const def = ANIMAL[key], wl = g.wildlife;
  for (let k = 0; k < 100; k++) {
    const a = wl.spawn(def, Math.floor(x), Math.floor(y), { silent: true, age: 3 * DAYS_PER_YEAR });
    Object.assign(a, { x, y, wait: 0, thirst: 0 });
    if (isMaleVariant(def, a) === male) return a;
    wl.remove(a);
  }
  throw new Error('No requested appearance');
}
function run(g, days, observe = () => {}) {
  for (let i = 0; i < days * 20; i++) { g.wildlife.update(0.05); observe(i / 20); }
}
check('Deer families and elk cow/calf herds stay together during ordinary simulation', () => {
  for (const key of ['deer', 'elk']) {
    const g = setup(), wl = g.wildlife;
    const mothers = [spawn(g, key, false, 40.5, 30.5), spawn(g, key, false, 46.5, 33.5), spawn(g, key, false, 44.5, 27.5)];
    const calf = wl.spawn(ANIMAL[key], 43, 32, { silent: true, age: 0 }); calf.mom = mothers[0].id;
    let samples = 0, spread = 0, family = 0;
    run(g, 40, t => {
      if (t < 15) return;
      for (const c of mothers.slice(1)) { spread += Math.hypot(c.x - mothers[0].x, c.y - mothers[0].y); samples++; if (c.herdOf === mothers[0].id) family++; }
      assert.ok(Math.hypot(calf.x - mothers[0].x, calf.y - mothers[0].y) < 10, 'calf keeps up with mother');
    });
    assert.ok(family / samples > 0.95, `${key} stable membership`);
    assert.ok(spread / samples < 4, `${key} average spread ${spread / samples}`);
  }
});
check('Resting calves wake and keep up when their mother moves to a distant feeding patch', () => {
  for (const key of ['deer', 'elk']) {
    const g = setup(), wl = g.wildlife;
    const mother = spawn(g, key, false, 40.5, 30.5), calf = wl.spawn(ANIMAL[key], 41, 30, { silent: true, age: 10 });
    calf.mom = mother.id; calf.wait = 0; wl.update(0.05);
    assert.ok(wl.pathTo(mother, (j, x, y) => x === 58 && y === 30, 6000)); mother.trip = null;
    run(g, 12, () => assert.ok(Math.hypot(calf.x - mother.x, calf.y - mother.y) < 3.5, `${key} moving family gap`));
    assert.ok(mother.x > 56 && calf.x > 54, `${key}: family travels together (${mother.x}, ${calf.x})`);
  }
});
check('Families stay small, bachelors separate from does, and rutting males leave bachelor groups', () => {
  const g = setup(), wl = g.wildlife;
  const does = Array.from({ length: 8 }, (_, i) => spawn(g, 'deer', false, 40 + i, 30.5));
  const bucks = [spawn(g, 'deer', true, 42, 32), spawn(g, 'deer', true, 46, 32)];
  [...does, ...bucks].forEach(a => cervidLeader(wl, a));
  assert.equal(cervidLeader(wl, bucks[1]), bucks[0]);
  for (const d of does) assert.ok(!bucks.includes(cervidLeader(wl, d)));
  const groups = new Map(); for (const d of does) groups.set(d.herdOf, (groups.get(d.herdOf) || 0) + 1);
  assert.ok([...groups.values()].every(n => n <= ANIMAL.deer.familySize));
  g.day = 70; bucks.forEach(a => assert.equal(cervidLeader(wl, a), a));
  assert.ok(bucks.every(a => a.herdOf == null));
});
check('Initially isolated deer can join a family when they encounter one later', () => {
  const g = setup(), wl = g.wildlife;
  const a = spawn(g, 'deer', false, 30.5, 30.5), b = spawn(g, 'deer', false, 65.5, 30.5);
  assert.equal(cervidLeader(wl, a), a); assert.equal(cervidLeader(wl, b), b);
  b.x = 40.5; assert.equal(cervidLeader(wl, b), a);
});
check('Rut rivals meet naturally, including a moving partner, and fight a full bout', () => {
  for (const key of ['deer', 'elk']) for (const seed of [3, 17, 42]) {
    const g = setup(seed, 'pnw', 7), wl = g.wildlife;
    const a = spawn(g, key, true, 40.5, 30.5), b = spawn(g, key, true, 50.5, 30.5);
    assert.ok(wl.pathTo(b, (j, x, y) => x === 53 && y === 30, 1000)); assert.equal(b.state, 'walk');
    let began = false, settledAt = null, endedAt = null;
    run(g, 40, t => {
      if (a.state === 'spar') {
        began = true; assert.equal(b.state, 'spar');
        if (!a.sparPath?.length && !b.sparPath?.length && Math.hypot(a.x - a.sparAt[0], a.y - a.sparAt[1]) < 0.02 && Math.hypot(b.x - b.sparAt[0], b.y - b.sparAt[1]) < 0.02 && settledAt == null) settledAt = t;
      } else if (began && endedAt == null) { endedAt = t; assert.ok(a.state === 'flee' || b.state === 'flee', 'loser yields'); }
    });
    assert.ok(began, `${key}/${seed} observed a real encounter`);
    assert.ok(settledAt != null && endedAt - settledAt >= 2.9, `${key}/${seed} full bout: ${endedAt - settledAt}`);
    assert.ok(a.rutCooldown > 0 && b.rutCooldown > 0);
  }
});
check('An elk satellite can challenge a harem bull and cows retain a grazing centre', () => {
  const g = setup(3, 'pnw', 7), wl = g.wildlife;
  const bull = spawn(g, 'elk', true, 40.5, 30.5), satellite = spawn(g, 'elk', true, 54.5, 30.5);
  const cows = Array.from({ length: 4 }, (_, i) => spawn(g, 'elk', false, 39.5 + i, 34.5));
  for (const c of cows) c.haremOf = bull.id;
  let fought = false, spread = 0, samples = 0, ownerChanged = false;
  run(g, 60, t => {
    if (satellite.state === 'spar') fought = true;
    if (t > 15) for (const c of cows) {
      const owner = wl.agents.find(b => b.id === c.haremOf);
      if (!owner?.haremCenter) continue;
      spread += Math.hypot(c.x - owner.haremCenter[0], c.y - owner.haremCenter[1]); samples++;
      if (owner === satellite) ownerChanged = true;
    }
  });
  assert.ok(fought, 'satellite fought instead of only bugling');
  assert.ok(ownerChanged, 'winning satellite took the cows');
  assert.ok(samples && spread / samples < 4, `cow spread ${spread / samples}`);
});
check('Near-enough followers graze without alternating adjacent tile targets', () => {
  const g = setup(), wl = g.wildlife;
  const lead = spawn(g, 'deer', false, 40.1, 30.1), a = spawn(g, 'deer', false, 42, 31.5);
  a.herdOf = lead.id; a.slot = [0.7, 0.5]; a.familySettled = 'slot';
  for (let i = 0; i < 50; i++) { lead.x = 40.1 + (i % 2) * 0.15; assert.ok(keepCervidGroup(wl, a, ANIMAL.deer)); assert.equal(a.state, 'idle'); assert.ok(a.wait >= 2); }
});
check('Solo deer pause to forage even when only a few nearby tiles are suitable', () => {
  const g = setup(), wl = g.wildlife;
  const a = spawn(g, 'deer', false, 40.5, 30.5), map = wl.suit[a.sp]; map.fill(0);
  for (const x of [40, 43]) map[g.world.idx(x, 30)] = 1;
  let resting = 0, walks = 0, before = 'idle';
  run(g, 60, () => { if (a.state === 'idle') resting++; if (a.state === 'walk' && before !== 'walk') walks++; before = a.state; });
  assert.ok(resting / 1200 > 0.65, `rest fraction ${resting / 1200}`);
  assert.ok(walks < 10, `short walks ${walks}`);
});
check('Blocked families release unreachable leaders without crossing a fence', () => {
  const g = setup(), wl = g.wildlife, w = g.world;
  const lead = spawn(g, 'deer', false, 40.5, 30.5), a = spawn(g, 'deer', false, 47.5, 30.5);
  for (let y = 0; y < w.h; y++) w.feature[w.idx(44, y)] = F.FENCE;
  for (let i = 0; i < 800 && a.familyBlockedBy == null; i++) wl.update(0.05);
  assert.equal(a.herdOf, null); assert.equal(a.familyBlockedBy, lead.id); assert.equal(a.follow, false);
  run(g, 20); assert.ok(a.x > 44 && lead.x < 44);
});
check('Young male identities have no antlers; mothers, saved groups and leader death are handled', () => {
  const g = setup(), wl = g.wildlife;
  const mother = spawn(g, 'deer', false, 40.5, 30.5), aunt = spawn(g, 'deer', false, 44.5, 30.5), buck = spawn(g, 'deer', true, 46.5, 30.5);
  const child = spawn(g, 'deer', true, 41.5, 31.5); child.age = 0; child.mom = mother.id;
  assert.equal(isMaleVariant(ANIMAL.deer, child), false); assert.equal(drawDef(ANIMAL.deer, child).sprite.antlers, undefined);
  assert.equal(cervidLeader(wl, child), mother); cervidLeader(wl, aunt);
  wl.load(wl.serialize()); const restored = wl.agents.find(a => a.id === aunt.id);
  assert.equal(cervidLeader(wl, restored).id, mother.id);
  wl.remove(wl.agents.find(a => a.id === mother.id)); assert.equal(cervidLeader(wl, restored), restored);
  child.age = DAYS_PER_YEAR + 1; child.mom = buck.id; assert.equal(wl.keepWithMom(child, ANIMAL.deer), false);
});
check('Seasonal births use adult females as mothers, and all-male groups cannot produce calves', () => {
  for (const key of ['deer', 'elk']) for (const mixed of [false, true]) {
    const g = setup(37, 'pnw', 2), wl = g.wildlife, w = g.world, mothers = new Set();
    w.habitat.fill(H.MEADOW); w.distCover.fill(0); w.browse.fill(1); g.forestTiles = 500;
    for (let i = 0; i < 4; i++) {
      const male = !mixed || i === 0, a = spawn(g, key, male, 40.5 + i, 30.5);
      if (!male) mothers.add(a.id);
    }
    g.rng = mulberry32(576);
    for (let i = 0; i < 12; i++) wl.monthly();
    const calves = wl.agents.filter(a => a.key === key && a.age === 0);
    if (mixed) {
      assert.ok(calves.length > 0, `${key} born in seasonal simulation`);
      for (const c of calves) { assert.ok(mothers.has(c.mom)); assert.equal(isMaleVariant(ANIMAL[key], c), false); }
    } else assert.equal(wl.state[ANIMAL[key].index].births, 0, `${key} all-male group`);
  }
});
check('The rut interrupts old roaming trips and its harems disperse after the season', () => {
  const g = setup(), wl = g.wildlife;
  const bull = spawn(g, 'elk', true, 40.5, 30.5), cow = spawn(g, 'elk', false, 43.5, 30.5);
  assert.ok(wl.pathTo(bull, (j, x, y) => x === 70 && y === 30, 6000)); bull.trip = g.world.idx(70, 30);
  g.day = 70; haremDay(wl); assert.equal(bull.state, 'idle'); assert.equal(bull.trip, null);
  cow.haremOf = bull.id; bull.haremCenter = [43.5, 30.5]; g.day = 90; haremDay(wl);
  assert.equal(cow.haremOf, null); assert.equal(bull.haremCenter, null);
});
check('An unreachable rival cannot provoke repeated approaches across a fence', () => {
  const g = setup(3, 'pnw', 7), wl = g.wildlife, w = g.world;
  const a = spawn(g, 'deer', true, 40.5, 30.5), b = spawn(g, 'deer', true, 48.5, 30.5);
  for (let y = 0; y < w.h; y++) w.feature[w.idx(44, y)] = F.FENCE;
  run(g, 30, () => { assert.notEqual(a.state, 'spar'); assert.notEqual(b.state, 'spar'); assert.ok(a.x < 44 && b.x > 44); });
  assert.equal(a.greet, undefined); assert.equal(b.socialWith, undefined);
});
check('Saving during a social approach releases the old reservation on load', () => {
  const g = setup(3, 'pnw', 7), wl = g.wildlife;
  const a = spawn(g, 'deer', true, 40.5, 30.5), b = spawn(g, 'deer', true, 48.5, 30.5);
  for (let i = 0; i < 100 && !a.greet; i++) greet(wl, a, ANIMAL.deer);
  assert.equal(b.socialWith, a.id); wl.load(wl.serialize());
  for (const c of wl.agents) { assert.equal(c.socialWith, null); assert.equal(c.greet, null); }
  run(g, 30); assert.ok(wl.agents.some(c => c.rutCooldown > 0), 'encounters resume after loading');
});
check('Invitations yield to danger and cannot hold a partner after the visitor disappears', () => {
  const g = setup(3, 'pnw', 7), wl = g.wildlife;
  const a = spawn(g, 'deer', true, 40.5, 30.5), b = spawn(g, 'deer', true, 48.5, 30.5);
  for (let i = 0; i < 100 && !a.greet; i++) greet(wl, a, ANIMAL.deer);
  assert.equal(b.socialWith, a.id); assert.equal(socialHold(wl, b, ANIMAL.deer), true);
  bolt(wl, b, a, 2, 1); assert.equal(b.socialWith, null); assert.equal(b.state, 'flee');
  b.state = 'idle'; b.socialWith = a.id; b.socialUntil = b.age + 10;
  wl.remove(a); wl.ids = null; assert.equal(socialHold(wl, b, ANIMAL.deer), false);
});
console.log(`${checks} cervid behavior checks passed.`);
