// Seeded regressions for continuous vigilance and species-safe escape movement.
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { BIOME_LIST } from '../js/biome.js';
import { T, F } from '../js/config.js';
import { preyFor } from '../js/data/animals.js';
import { passable, canLand } from '../js/sim/animal-terrain.js';
import { watch, bolt, fleeUpdate, updateVigilance, huntStep } from '../js/sim/animal-life.js';
import { mulberry32 } from '../js/rng.js';
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }
function setup(map = 'pnw', difficulty = 'standard') {
  Math.random = mulberry32(6201);
  const g = new Game(); g.newGame(1987, 'free', difficulty, map);
  const w = g.world, wl = g.wildlife;
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6;
  w.terrain.fill(T.SOIL); w.feature.fill(0); w.struct.fill(-1); w.fire.fill(0);
  w.tree.fill(0); w.treeG.fill(0); w.shrub.fill(0); w.ground.fill(0); w.canopy.fill(0);
  w.distWater.fill(99); w.distLog.fill(99); w.distRocks.fill(99);
  wl.suit.forEach(s => s.fill(1));
  return g;
}
function spawn(g, key, x = 40.5, y = 30.5, opts = {}) {
  const a = g.wildlife.spawn(g.catalog.animal[key], Math.floor(x), Math.floor(y), { silent: true, ...opts });
  Object.assign(a, { x, y, wait: 100, thirst: 0, hunger: 0 }); return a;
}
function pursue(p, a) { p.state = 'hunt'; p.target = a.id; p.huntTime = 10; p.hunt = { phase: 'creep' }; }
check('A stalked target escapes instead of freezing until the rush', () => {
  const g = setup(), a = spawn(g, 'rabbit'), p = spawn(g, 'coyote', 36, 30.5);
  pursue(p, a);
  assert.ok(watch(g.wildlife, a, g.catalog.animal.rabbit));
  assert.equal(a.state, 'flee'); assert.equal(a.threat, p.id);
});
check('Waiting, walking, feeding and juvenile prey notice danger without a new target decision', () => {
  for (const state of ['idle', 'walk', 'feed', 'forage', 'spar']) for (const juvenile of [false, true]) {
    const g = setup(), a = spawn(g, 'rabbit', 40.5, 30.5, { juvenile, age: juvenile ? 10 : 300 });
    a.state = state; a.feedT = 10; a.path = [g.world.idx(38, 30)]; a.trip = g.world.idx(36, 30);
    a.drinkT = 3; a.socialWith = 998; a.sparWith = 999;
    const p = spawn(g, 'coyote', 38.5, 30.5); p.wait = 100;
    g.wildlife.update(0.05);
    assert.equal(a.state, 'flee', `${state}/${juvenile}`);
    assert.equal(a.trip, null); assert.equal(a.drinkT, 0); assert.equal(a.socialWith, null);
  }
});
check('An active pursuer outranks a nearer feeding predator', () => {
  const g = setup(), a = spawn(g, 'rabbit'), fed = spawn(g, 'coyote', 39.5, 30.5), p = spawn(g, 'bobcat', 36, 30.5);
  fed.state = 'feed'; fed.feedT = 10; pursue(p, a);
  watch(g.wildlife, a, g.catalog.animal.rabbit);
  assert.equal(a.threat, p.id);
});
check('Grounded birds take off promptly and only choose safe landing ground', () => {
  const g = setup(), a = spawn(g, 'robin'), p = spawn(g, 'hawk', 38.5, 30.5);
  a.state = 'bird'; a.bird = { kind: 'forage', t: 5 }; a.birdGround = true;
  updateVigilance(g.wildlife, 0.05);
  assert.equal(a.state, 'fly'); assert.equal(a.flying, true); assert.equal(a.bird, null);
  assert.ok(Math.hypot(a.tx - p.x, a.ty - p.y) > Math.hypot(a.x - p.x, a.y - p.y));
  assert.ok(canLand(g.world, g.world.idx(Math.floor(a.tx), Math.floor(a.ty)), g.catalog.animal.robin));
  g.world.terrain.fill(T.POND); g.world.fire.fill(1);
  bolt(g.wildlife, a, p, 2, 1);
  assert.equal(a.state, 'idle'); assert.equal(a.flying, true); assert.ok(a.alt > 0.2);
});
check('Swimming and reef prey react before a catch and keep escapes in water', () => {
  for (const [map, key, pred] of [['pnw', 'cutthroat', 'otter'], ['reef', 'tang', 'shark']]) {
    const g = setup(map, 'challenging'), w = g.world;
    w.terrain.fill(T.CREEK);
    const a = spawn(g, key), p = spawn(g, pred, 36.5, 30.5); pursue(p, a);
    updateVigilance(g.wildlife, 0.05);
    assert.equal(a.state, 'walk', key); assert.ok(a.path?.length); assert.equal(a.threat, p.id);
    const path = [...a.path]; updateVigilance(g.wildlife, 0.2);
    assert.deepEqual(a.path, path, 'a useful escape is not replaced every vigilance tick');
    assert.ok(a.path.every(j => passable(w, j, a) && !w.fire[j]));
  }
});
check('Reef escape pace actually increases swimming speed', () => {
  const speeds = [];
  for (const run of [1, 1.7]) {
    const g = setup('reef'), w = g.world, a = spawn(g, 'tang');
    w.terrain.fill(T.CREEK);
    a.state = 'walk'; a.path = [w.idx(44, 30), w.idx(43, 30), w.idx(42, 30)];
    a.run = run; a.hd = 0; a.spd = 0;
    g.wildlife.update(0.05); speeds.push(a.spd);
  }
  assert.ok(speeds[1] > speeds[0] * 1.6, 'escape pace reaches the reef locomotion controller');
});
check('Prey keep running through a live pursuit and settle when the threat is gone', () => {
  const g = setup(), wl = g.wildlife, a = spawn(g, 'rabbit'), p = spawn(g, 'coyote', 38, 30.5);
  pursue(p, a); bolt(wl, a, p, 2, 0.01);
  fleeUpdate(wl, a, g.catalog.animal.rabbit, 0.05);
  assert.equal(a.state, 'flee'); assert.ok(a.fleeT > 0);
  wl.remove(p); a.fleeT = 0.01;
  fleeUpdate(wl, a, g.catalog.animal.rabbit, 0.05);
  assert.equal(a.state, 'idle'); assert.equal(a.threat, null);
});
check('Escape steering avoids running into a second predator', () => {
  const g = setup(), wl = g.wildlife, a = spawn(g, 'rabbit'), p = spawn(g, 'coyote', 38, 30.5);
  const other = spawn(g, 'bobcat', 42.5, 30.5); pursue(p, a); pursue(other, a);
  bolt(wl, a, p, 2, 1); a.fleeSide = 1;
  fleeUpdate(wl, a, g.catalog.animal.rabbit, 0.05);
  assert.ok(Math.abs(a.y - 30.5) > 0.04, 'prey moves out of the line between hunters');
});
check('Safer covered routes beat an equally open escape', () => {
  const g = setup(), wl = g.wildlife, a = spawn(g, 'rabbit'), p = spawn(g, 'coyote', 38, 30.5), w = g.world;
  // Two equivalent diagonals; only the lower route has dense shrubs.
  for (let y = 31; y <= 34; y++) for (let x = 40; x <= 44; x++) { w.shrub[w.idx(x, y)] = 1; w.shrubG[w.idx(x, y)] = 1; }
  pursue(p, a); bolt(wl, a, p, 2, 2); a.fleeSide = 1;
  fleeUpdate(wl, a, g.catalog.animal.rabbit, 0.05);
  assert.ok(a.y > 30.5, 'chooses nearby shelter while gaining distance');
});
check('A rushing hunter does not artificially slow its target below the prey escape pace', () => {
  const g = setup(), a = spawn(g, 'rabbit'), p = spawn(g, 'coyote', 36.5, 30.5);
  pursue(p, a); p.hunt.phase = 'approach';
  huntStep(g.wildlife, p, g.catalog.animal.coyote, a, 0.01);
  assert.equal(a.state, 'flee');
  assert.ok(a.fleeSpeed >= g.catalog.animal.rabbit.speed * 1.8);
});
check('Escape steering remains similar at different simulation step sizes', () => {
  const positions = [];
  for (const dt of [0.01, 0.05]) {
    const g = setup(), a = spawn(g, 'rabbit'), p = spawn(g, 'coyote', 38, 30.5);
    pursue(p, a); bolt(g.wildlife, a, p, 2, 3);
    a.fx = 0; a.fy = 1; a.fleeSide = 1;
    for (let k = 0; k < Math.round(2 / dt); k++) fleeUpdate(g.wildlife, a, g.catalog.animal.rabbit, dt);
    positions.push([a.x, a.y]);
  }
  assert.ok(Math.hypot(positions[0][0] - positions[1][0], positions[0][1] - positions[1][1]) < 0.25);
});
check('Connected-canopy escapes keep making progress without repeated path resets', () => {
  const g = setup('amazon'), w = g.world, wl = g.wildlife;
  w.tree.fill(1); w.treeG.fill(1);
  const a = spawn(g, 'howler'), p = spawn(g, 'harpy', 37, 30.5); pursue(p, a);
  assert.ok(watch(wl, a, g.catalog.animal.howler));
  assert.equal(a.state, 'walk'); assert.equal(a.threat, p.id);
  const path = [...a.path]; updateVigilance(wl, 0.05);
  assert.deepEqual(a.path, path);
});
check('Long escape steps cannot tunnel across fences, structures or water', () => {
  for (const barrier of ['fence', 'structure', 'water']) {
    const g = setup(), w = g.world, wl = g.wildlife, a = spawn(g, 'deer'), p = spawn(g, 'cougar', 38, 30.5);
    for (let y = 0; y < w.h; y++) {
      const j = w.idx(41, y);
      if (barrier === 'fence') w.feature[j] = F.FENCE;
      if (barrier === 'structure') w.struct[j] = 0;
      if (barrier === 'water') w.terrain[j] = T.POND;
    }
    pursue(p, a); bolt(wl, a, p, 4, 3);
    fleeUpdate(wl, a, g.catalog.animal.deer, 1);
    assert.ok(a.x < 41, barrier);
    assert.ok(passable(w, w.idx(Math.floor(a.x), Math.floor(a.y)), a));
  }
});
check('A fire-free escape is preferred over burning ground', () => {
  const g = setup(), w = g.world, a = spawn(g, 'rabbit'), p = spawn(g, 'coyote', 38, 30.5);
  for (let y = 29; y <= 32; y++) for (let x = 41; x <= 43; x++) w.fire[w.idx(x, y)] = 1;
  pursue(p, a); bolt(g.wildlife, a, p, 2, 3);
  for (let k = 0; k < 10; k++) {
    fleeUpdate(g.wildlife, a, g.catalog.animal.rabbit, 0.05);
    assert.equal(w.fire[w.idx(Math.floor(a.x), Math.floor(a.y))], 0);
  }
});
check('Fear does not interrupt fire evacuation, panic at non-predators or disturb paused animals', () => {
  const g = setup(), wl = g.wildlife, a = spawn(g, 'rabbit');
  spawn(g, 'deer', 39, 30.5);
  assert.equal(watch(wl, a, g.catalog.animal.rabbit), false);
  const p = spawn(g, 'coyote', 39, 30.5);
  a.fromFire = true; a.state = 'flee'; a.threat = null; a.fx = 0; a.fy = 1; a.fleeT = 3;
  updateVigilance(wl, 0.2); assert.equal(a.fromFire, true); assert.equal(a.threat, null);
  const before = JSON.stringify(wl.agents); wl.update(0); assert.equal(JSON.stringify(wl.agents), before);
});
check('Threat relationships follow the active difficulty', () => {
  const g = setup('pnw', 'challenging'), a = spawn(g, 'cutthroat'), p = spawn(g, 'otter', 39, 30.5);
  g.world.terrain.fill(T.POND); pursue(p, a);
  assert.ok(watch(g.wildlife, a, g.catalog.animal.cutthroat));
  g.difficulty = 'standard'; a.state = 'idle'; a.threat = null;
  assert.equal(watch(g.wildlife, a, g.catalog.animal.cutthroat), false);
});
check('Every map can alert prey for its registered predator diets', () => {
  let relationships = 0;
  for (const biome of BIOME_LIST) {
    const g = setup(biome.id, 'challenging'), wl = g.wildlife, w = g.world;
    for (const def of g.catalog.animals) for (const key of preyFor(def, g) || []) {
      wl.agents = []; wl.recount();
      const pd = g.catalog.animal[key];
      w.terrain.fill(pd.move === 'swim' || pd.reef ? T.CREEK : T.SOIL);
      if (pd.move === 'tree') { w.tree.fill(1); w.treeG.fill(1); } else w.tree.fill(0);
      const a = spawn(g, key), p = spawn(g, def.key, 36.5, 30.5); pursue(p, a);
      assert.ok(watch(wl, a, pd), `${biome.id}/${def.key}/${key}`);
      assert.notEqual(a.state, 'idle', `${key} escapes`);
      relationships++;
    }
  }
  console.log(`  ${relationships} predator/prey relationships across seven maps`);
});
console.log(`${checks} prey avoidance checks passed.`);
