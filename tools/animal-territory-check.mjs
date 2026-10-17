import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { BIOME_LIST } from '../js/biome.js';
import { DAYS_PER_YEAR, T, F } from '../js/config.js';
import { isMale } from '../js/data/animals.js';
import { activeTerritory, territorialRivals } from '../js/data/animal-territories.js';
import { territorialChoose, territoryRadius, hasTerritory, territoryArrive } from '../js/sim/animal-territory.js';
import { bolt, greet } from '../js/sim/animal-life.js';
import { passable } from '../js/sim/animal-terrain.js';
import { mulberry32 } from '../js/rng.js';
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function setup(map = 'pnw', seed = 1987) {
  Math.random = mulberry32(seed);
  const g = new Game(); g.newGame(seed, 'free', 'standard', map); g.day = 20;
  const w = g.world, wl = g.wildlife;
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6;
  w.terrain.fill(map === 'reef' ? T.CREEK : T.SOIL); w.feature.fill(0); w.struct.fill(-1); w.fire.fill(0);
  w.tree.fill(0); w.shrub.fill(0); w.distWater.fill(99); wl.suit.forEach(s => s.fill(1));
  return g;
}
function spawn(g, key, x = 40.5, y = 30.5, male = true) {
  const d = g.catalog.animal[key], wl = g.wildlife;
  for (let k = 0; k < 100; k++) {
    const a = wl.spawn(d, Math.floor(x), Math.floor(y), { silent: true, age: d.mature * DAYS_PER_YEAR + 100 });
    if (isMale(d, a) !== male) { wl.remove(a); continue; }
    Object.assign(a, { x, y, wait: 0, hunger: 0, thirst: 0 }); return a;
  }
  throw Error('no requested sex');
}
function claim(g, a) { territorialChoose(g.wildlife, a, g.catalog.animals[a.sp]); assert.ok(hasTerritory(g.wildlife, a, g.catalog.animals[a.sp])); return a.territory.home; }
check('Only explicitly researched species receive territorial profiles on every map', () => {
  const selected = new Set(['bobcat', 'cougar', 'jaguar', 'ocelot', 'leopard', 'tiger', 'robin', 'cardinal', 'clownfish']);
  let profiles = 0;
  for (const b of BIOME_LIST) {
    const g = setup(b.id);
    for (const d of g.catalog.animals) {
      assert.equal(!!d.behavior.territory, selected.has(d.key), `${b.id}/${d.key}`);
      if (d.behavior.territory) profiles++;
    }
  }
  assert.equal(profiles, 10); // Ocelot appears in Amazon and Chinandega.
});
check('Residents keep stable home cores and same-sex rivals settle apart', () => {
  const g = setup(), a = spawn(g, 'bobcat'), d = g.catalog.animal.bobcat;
  const h = claim(g, a), b = spawn(g, 'bobcat', 41.5, 30.5), bh = claim(g, b);
  assert.notEqual(h, bh); assert.ok(b.path?.length, 'newcomer walks to a reachable core');
  const w = g.world;
  assert.ok(Math.hypot(h % w.w - bh % w.w, (h / w.w | 0) - (bh / w.w | 0)) >= territoryRadius(d, a));
  for (let k = 0; k < 10; k++) { a.age++; territorialChoose(g.wildlife, a, d); assert.equal(a.territory.home, h); }
});
check('Opposite-sex ranges may overlap and dependent young never claim or become rivals', () => {
  const g = setup(), a = spawn(g, 'bobcat'), b = spawn(g, 'bobcat', 40.5, 30.5, false), d = g.catalog.animal.bobcat;
  assert.equal(claim(g, a), claim(g, b)); assert.equal(territorialRivals(d, a, b, g.month), false);
  const young = g.wildlife.spawn(d, 40, 30, { silent: true, age: 10, juvenile: true }); young.mom = b.id;
  territorialChoose(g.wildlife, young, d); assert.equal(young.territory, undefined);
  assert.equal(territorialRivals(d, a, young, g.month), false); assert.equal(young.mom, b.id);
});
check('Male-only defense profiles do not make female cougars fight over overlapping ranges', () => {
  const g = setup(), a = spawn(g, 'cougar', 40.5, 30.5, false), b = spawn(g, 'cougar', 40.5, 30.5, false), d = g.catalog.animal.cougar;
  assert.equal(claim(g, a), claim(g, b)); assert.equal(territorialRivals(d, a, b, g.month), false);
});
check('Robin and cardinal defense is seasonal, and pairs can overlap', () => {
  for (const [map, key] of [['pnw', 'robin'], ['atlanta', 'cardinal']]) {
    const g = setup(map), a = spawn(g, key), b = spawn(g, key, 40.5, 30.5, false), d = g.catalog.animal[key];
    g.day = d.breed[0] * 10;
    assert.equal(claim(g, a), claim(g, b));
    g.day = Array.from({ length: 12 }, (_, k) => k).find(k => !d.breed.includes(k)) * 10;
    territorialChoose(g.wildlife, a, d);
    assert.equal(a.territory, null); assert.equal(activeTerritory(d, a, g.month), null);
  }
});
check('An intrusion causes a brief display and a reachable retreat without population or hunger changes', () => {
  const g = setup(), wl = g.wildlife, a = spawn(g, 'bobcat'), home = claim(g, a);
  const b = spawn(g, 'bobcat', a.x + 1, a.y), d = g.catalog.animal.bobcat;
  const before = wl.agents.length;
  assert.equal(territorialChoose(wl, a, d), true);
  assert.equal(a.territory.mode, 'display'); assert.equal(b.territory.mode, 'withdraw');
  assert.equal(b.state, 'walk'); assert.ok(b.path.every(j => passable(g.world, j, b)));
  assert.equal(wl.agents.length, before); assert.equal(a.hunger, 0); assert.equal(b.hunger, 0);
  assert.equal(a.territory.home, home);
  const route = [...b.path]; territorialChoose(wl, a, d); assert.deepEqual(b.path, route, 'cooldown prevents repeated reversals');
});
check('An unreachable intruder is not shoved through blocked ground or repeatedly confronted', () => {
  const g = setup(), wl = g.wildlife, a = spawn(g, 'bobcat', 38.5, 30.5), d = g.catalog.animal.bobcat;
  claim(g, a); const b = spawn(g, 'bobcat', 41.5, 30.5);
  for (let y = 29; y <= 31; y++) for (let x = 40; x <= 42; x++) if (x !== 41 || y !== 30) g.world.struct[g.world.idx(x, y)] = 0;
  const position = [b.x, b.y]; territorialChoose(wl, a, d);
  assert.deepEqual([b.x, b.y], position); assert.equal(b.path, null);
  assert.ok(a.territory.encounter > a.age);
});
check('Patrols stay local and pause at an arrived marking spot', () => {
  const g = setup(), wl = g.wildlife, a = spawn(g, 'bobcat'), d = g.catalog.animal.bobcat, home = claim(g, a);
  a.age = a.territory.next + 1;
  assert.equal(territorialChoose(wl, a, d), true); assert.equal(a.territory.mode, 'patrol');
  assert.ok(a.path?.length); const goal = a.territory.goal;
  a.x = goal % g.world.w + 0.5; a.y = (goal / g.world.w | 0) + 0.5; a.state = 'idle'; a.wait = 0;
  territoryArrive(wl, a); assert.equal(a.territory.mode, 'mark'); assert.ok(a.wait >= 1); assert.ok(a.alertT > 0);
  assert.equal(a.territory.home, home);
});
check('Displaced residents return home, but habitat loss releases the old claim', () => {
  const g = setup(), a = spawn(g, 'bobcat'), d = g.catalog.animal.bobcat, home = claim(g, a);
  a.x += territoryRadius(d, a) + 3;
  assert.ok(territorialChoose(g.wildlife, a, d)); assert.equal(a.territory.mode, 'return');
  assert.equal(a.path[0], home);
  a.state = 'idle'; g.wildlife.suit[a.sp].fill(0); territorialChoose(g.wildlife, a, d);
  assert.equal(a.territory, null); assert.ok(a.territoryAfter > a.age);
});
check('Clownfish share a stable anemone home and distribute new arrivals across hosts', () => {
  const g = setup('reef'), w = g.world, wl = g.wildlife, d = g.catalog.animal.clownfish;
  const h1 = w.idx(40, 30), h2 = w.idx(46, 30);
  for (const h of [h1, h2]) { w.shrub[h] = g.catalog.plant.anemone.id; w.shrubG[h] = 1; }
  const a = spawn(g, 'clownfish'), b = spawn(g, 'clownfish'); claim(g, a); claim(g, b);
  assert.notEqual(a.territory.home, b.territory.home);
  const groupmate = spawn(g, 'clownfish'); groupmate.territory = { ...a.territory };
  assert.equal(territorialRivals(d, a, groupmate, g.month), false);
  assert.equal(territorialRivals(d, a, b, g.month), true);
  const home = a.territory.home; w.shrub[home] = 0; a.state = 'idle';
  territorialChoose(wl, a, d); assert.equal(a.territory.home, home === h1 ? h2 : h1);
  assert.ok(a.path.every(j => passable(w, j, a)), 'new host reached through sea');
});
check('Territorial goals yield to hunger, hunts, predator avoidance and fire', () => {
  const g = setup(), wl = g.wildlife, a = spawn(g, 'bobcat'), d = g.catalog.animal.bobcat; const home = claim(g, a);
  a.territory.goal = home;
  bolt(wl, a, { id: null, x: a.x - 1, y: a.y }, 2, 1);
  assert.equal(a.territory.home, home); assert.equal(a.territory.goal, null);
  a.run = null;
  for (const state of ['hunt', 'flee', 'feed']) { a.state = state; assert.equal(territorialChoose(wl, a, d), false); assert.equal(a.state, state); }
  a.state = 'idle'; a.hunger = 10; assert.equal(territorialChoose(wl, a, d), false);
  a.hunger = 0; a.fromFire = true; assert.equal(territorialChoose(wl, a, d), false);
  const prey = spawn(g, 'robin'), p = spawn(g, 'hawk', prey.x - 2, prey.y); g.day = 10;
  claim(g, prey); wl.update(0.05); assert.equal(prey.flying, true);
});
check('Old and new saves preserve independent home state and lazily acquire missing territories', () => {
  const g = setup(), wl = g.wildlife, a = spawn(g, 'bobcat'); const home = claim(g, a);
  const data = wl.serialize(); a.territory.home++;
  assert.equal(data.agents[0].territory.home, home, 'serialized snapshot owns its home state');
  wl.load(data); const b = wl.agents[0]; b.territory.home++;
  assert.equal(data.agents[0].territory.home, home, 'loaded state does not mutate save input');
  delete data.agents[0].territory; wl.load(data); claim(g, wl.agents[0]);
  const before = JSON.stringify(wl.agents); wl.update(0); assert.equal(JSON.stringify(wl.agents), before);
});
check('Territorial rivals do not seek friendly greetings, while herd behavior is retained', () => {
  const g = setup(), a = spawn(g, 'bobcat'), b = spawn(g, 'bobcat', 41.5, 30.5);
  const random = Math.random; Math.random = () => 0;
  try { assert.equal(greet(g.wildlife, a, g.catalog.animal.bobcat), false); } finally { Math.random = random; }
  assert.equal(g.catalog.animal.elk.behavior.territory, null);
});
console.log(`${checks} territorial behavior checks passed.`);
