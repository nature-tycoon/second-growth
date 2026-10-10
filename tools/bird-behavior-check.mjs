// node tools/bird-behavior-check.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { buildSpecies } = await import('../js/render3d/fauna.js');
const { Actors } = await import('../js/render3d/actors.js');
const { Renderer } = await import('../js/render3d/scene.js');
import { Game } from '../js/game.js';
import { ANIMALS, ANIMAL, animalDef } from '../js/data/animals.js';
import { PASSAGE_SPECIES } from '../js/data/bird-passage.js';
import { passageChoices, spawnPassage, updatePassage } from '../js/sim/bird-passage.js';
import { birdChoose, birdUpdate, birdAlarm, isBird } from '../js/sim/bird-behavior.js';
import { T, F } from '../js/config.js';
import { mulberry32 } from '../js/rng.js';
Math.random = mulberry32(20261010);
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
function setup(map = 'pnw') {
  const g = new Game(); g.newGame(1987, 'free', 'challenging', map);
  const wl = g.wildlife, w = g.world;
  wl.agents = []; wl.flyovers = []; wl.passageWait = 1e6; wl.recount();
  g.visitors.agents = []; g.residents = [];
  w.vh.fill(0); w.terrain.fill(T.SOIL); w.tree.fill(0); w.shrub.fill(0); w.feature.fill(0); w.fire.fill(0); w.struct.fill(-1); w.distWater.fill(20);
  wl.suit.forEach(s => s.fill(1)); return g;
}
function spawn(g, key, x = 40.5, y = 30.5) {
  const a = g.wildlife.spawn(ANIMAL[key], Math.floor(x), Math.floor(y), { silent: true });
  Object.assign(a, { x, y, state: 'idle', flying: false, alt: 0, wait: 99 }); return a;
}
function fixed(value, fn) { const before = Math.random; Math.random = () => value; try { return fn(); } finally { Math.random = before; } }
const idx = (g, a) => g.world.idx(Math.floor(a.x), Math.floor(a.y));
check('Every map and season uses real flyable species; reef passage is seabirds', () => {
  for (const map of ['pnw', 'atlanta', 'amazon', 'serengeti', 'chinandega', 'sumatra', 'reef']) {
    const g = setup(map);
    for (const day of [0, 30, 60, 90]) {
      g.day = day; const choices = passageChoices(g); assert.ok(choices.length, `${map}/${g.season}`);
      for (const d of choices) { assert.equal(d.move, 'fly'); assert.ok(d.sci && d.sprite.kind); if (map === 'reef') assert.equal(d.group, 'Seabirds'); }
    }
  }
});
check('Flyovers do not alter residents, discovery, capacity, serialization, or the ecology RNG', () => {
  const g = setup(), wl = g.wildlife, saved = JSON.stringify(wl.serialize().state), rng = g.rng;
  g.rng = () => { throw new Error('Passage touched ecology RNG'); };
  const a = spawnPassage(wl, PASSAGE_SPECIES.canada_goose)[0];
  assert.equal(wl.agents.length, 0); assert.equal(wl.viewAgents.length, wl.flyovers.length);
  assert.equal(wl.findAgent(a.id), a); assert.equal(wl.hasAgent(a), true);
  assert.equal(JSON.stringify(wl.serialize().state), saved); assert.equal(wl.serialize().agents.length, 0);
  updatePassage(wl, 0.1); g.rng = rng;
  const data = wl.serialize(); wl.load(data); assert.equal(wl.flyovers.length, 0);
});
check('Goose V formation holds its spacing as the whole flock moves', () => {
  const g = setup(), wl = g.wildlife;
  const flock = spawnPassage(wl, PASSAGE_SPECIES.canada_goose, { angle: 0, n: 7, speed: 8 });
  const offsets = flock.map(a => [a.x - flock[0].x, a.y - flock[0].y]);
  assert.equal(offsets[0][1], 0); assert.ok(Math.abs(offsets[1][1] - 0.7) < 1e-8); assert.ok(Math.abs(offsets[2][1] + 0.7) < 1e-8);
  const x = flock[0].x; updatePassage(wl, 0.5); assert.equal(flock[0].x, x + 4);
  flock.forEach((a, k) => { assert.ok(Math.abs(a.x - flock[0].x - offsets[k][0]) < 1e-8); assert.ok(Math.abs(a.y - flock[0].y - offsets[k][1]) < 1e-8); });
});
check('Passage respects pause, crosses the map, expires selection, and limits total birds', () => {
  const g = setup(), wl = g.wildlife;
  spawnPassage(wl, PASSAGE_SPECIES.barn_swallow, { n: 40, angle: 0 }); assert.equal(wl.flyovers.length, 28);
  const a = wl.flyovers[0], x = a.x, phase = a.phase; g.selectedAgent = a;
  wl.update(0); assert.equal(a.x, x); assert.equal(a.phase, phase);
  for (let k = 0; k < 600 && wl.flyovers.length; k++) wl.update(0.05);
  assert.equal(wl.flyovers.length, 0); assert.equal(g.selectedAgent, null);
});
check('Snow suppresses new flocks; simulation spawns them without an effects renderer', () => {
  const g = setup(), wl = g.wildlife;
  g.weather = 'snow'; wl.passageWait = 0; wl.update(0.05); assert.equal(wl.flyovers.length, 0);
  g.weather = 'clear'; wl.passageWait = 0; wl.update(0.05); assert.ok(wl.flyovers.length > 0);
});
check('A ground-feeding bird hops along a safe path then stops to peck', () => {
  const g = setup(), wl = g.wildlife, a = spawn(g, 'robin');
  assert.equal(fixed(0.5, () => birdChoose(wl, a, ANIMAL.robin)), true);
  assert.equal(a.state, 'walk'); assert.equal(a.birdGround, true); assert.equal(a.flying, false);
  for (const j of a.path) assert.equal(g.world.terrain[j], T.SOIL);
  for (let k = 0; k < 150 && a.state === 'walk'; k++) wl.update(0.05);
  assert.equal(a.state, 'bird'); assert.equal(a.bird.kind, 'forage');
  const actors = new Actors(new THREE.Scene()); actors.update(g, new THREE.Vector3(1, 0, 0), 1);
  assert.ok(actors.pose.get(a.id).y < 0.2);
});
check('Perch and preen routines stay on a tree, and react to its removal', () => {
  const g = setup(), wl = g.wildlife, a = spawn(g, 'robin'), i = idx(g, a);
  g.world.tree[i] = 1; g.world.treeG[i] = 1;
  fixed(0.8, () => birdChoose(wl, a, ANIMAL.robin)); assert.equal(a.bird.kind, 'perch');
  const random = Math.random; let calls = 0; Math.random = () => calls++ ? 0.2 : 0.8;
  try { birdChoose(wl, a, ANIMAL.robin); } finally { Math.random = random; }
  assert.equal(a.bird.kind, 'preen');
  const actors = new Actors(new THREE.Scene()); actors.update(g, new THREE.Vector3(1, 0, 0), 1);
  assert.ok(actors.pose.get(a.id).y > 0.4);
  g.world.tree[i] = 0; birdUpdate(wl, a, ANIMAL.robin, 0.05); assert.equal(a.state, 'idle');
});
check('Nest visits remember a nest box and stop when it is removed; saves retain resident routines', () => {
  const g = setup('atlanta'), wl = g.wildlife, a = spawn(g, 'chickadee'), i = idx(g, a);
  g.day = ANIMAL.chickadee.breed[0] * 10; g.world.feature[i] = F.NESTBOX;
  fixed(0.05, () => birdChoose(wl, a, ANIMAL.chickadee)); assert.equal(a.bird.kind, 'nest'); assert.equal(a.nestSite, i);
  wl.load(wl.serialize()); const restored = wl.agents[0]; assert.equal(restored.bird.kind, 'nest'); assert.equal(restored.nestSite, i);
  g.world.feature[i] = 0; wl.update(0.05); assert.equal(restored.state, 'idle');
});
check('Bathing flies to a real bank before settling, faces water, and survives water removal', () => {
  const g = setup(), wl = g.wildlife, a = spawn(g, 'robin'), w = g.world;
  const bank = w.idx(40, 30); w.terrain[w.idx(41, 30)] = T.POND; w.distWater[bank] = 1;
  const old = [a.x, a.y]; fixed(0.2, () => birdChoose(wl, a, ANIMAL.robin));
  assert.deepEqual([a.x, a.y], old); assert.equal(a.birdGoal?.kind, 'bathe');
  for (let k = 0; k < 100 && a.state === 'fly'; k++) wl.update(0.05);
  assert.equal(a.bird.kind, 'bathe'); assert.ok(a.bird.water[0] > a.x); assert.equal(w.terrain[idx(g, a)], T.SOIL);
  w.terrain[w.idx(41, 30)] = T.SOIL; w.distWater[bank] = 20; birdUpdate(wl, a, ANIMAL.robin, 0.05); assert.equal(a.state, 'idle');
});
check('A nearby predator flushes the feeding group, clearing their activities', () => {
  const g = setup(), wl = g.wildlife;
  const key = 'robin';
  const a = spawn(g, key), b = spawn(g, key, 41, 30.5); spawn(g, 'hawk', 38, 30.5);
  for (const o of [a, b]) { o.state = 'bird'; o.bird = { kind: 'forage', t: 5 }; o.birdGround = true; }
  assert.equal(birdAlarm(wl, a, ANIMAL[key]), true);
  for (const o of [a, b]) { assert.equal(o.state, 'fly'); assert.equal(o.flying, true); assert.equal(o.bird, null); }
});
check('A social takeoff recruits neighbors, while butterflies and bats keep their own behavior', () => {
  const g = setup(), wl = g.wildlife, a = spawn(g, 'robin'), b = spawn(g, 'robin', 41.5, 30.5);
  fixed(0.95, () => birdChoose(wl, a, ANIMAL.robin)); assert.equal(a.state, 'fly'); assert.equal(b.state, 'fly');
  assert.equal(isBird(ANIMALS.find(d => d.sprite.kind === 'butterfly')), false); assert.equal(isBird(ANIMAL.bat), false);
});
check('Actual flyover models render and can be picked at their visible bodies', () => {
  const g = setup(), wl = g.wildlife, actors = new Actors(new THREE.Scene());
  const a = spawnPassage(wl, PASSAGE_SPECIES.canada_goose, { n: 1 })[0]; a.x = 40; a.y = 30;
  for (let k = 0; k < 20; k++) actors.update(g, new THREE.Vector3(1, 0, 0), k / 60);
  const pose = actors.pose.get(a.id); assert.ok(pose?.visible); assert.equal(pose.y, a.flightY); assert.equal(animalDef(a).key, 'canada_goose');
  const r = { actors, project: (x, y, z) => ({ x: x * 10, y: z * 10 - y }) };
  const screen = r.project(pose.center.x, pose.center.y, pose.center.z);
  assert.equal(Renderer.prototype.pickAgent.call(r, g, screen.x, screen.y), a);
});
check('Every added passage species builds finite articulated geometry', () => {
  for (const def of Object.values(PASSAGE_SPECIES)) {
    const { geo, motion } = buildSpecies(def);
    for (const name of ['position', 'normal', 'aExt']) assert.ok([...geo.attributes[name].array].every(Number.isFinite), `${def.key}/${name}`);
    assert.equal(motion.bird, 1); assert.ok(motion.wingSpan > 0); geo.dispose();
  }
});
check('Large ground foragers stride and hummingbirds skip ground pecking', () => {
  let g = setup('serengeti'), a = spawn(g, 'secretary');
  fixed(0.5, () => birdChoose(g.wildlife, a, ANIMAL.secretary)); assert.equal(a.birdGround, true);
  g = setup(); a = spawn(g, 'hummingbird');
  assert.equal(fixed(0.5, () => birdChoose(g.wildlife, a, ANIMAL.hummingbird)), false); assert.equal(a.birdGround, undefined);
});
check('Fire and departure interrupt held bird routines immediately', () => {
  const g = setup(), wl = g.wildlife, a = spawn(g, 'robin');
  a.state = 'bird'; a.bird = { kind: 'forage', t: 5 }; a.birdGround = true;
  g.world.fire[idx(g, a)] = 1; wl.update(0.05);
  assert.equal(a.state, 'fly'); assert.equal(a.fromFire, true); assert.equal(a.bird, null);
  g.world.fire.fill(0); a.state = 'bird'; a.bird = { kind: 'perch', t: 5 };
  wl.leave(a); assert.equal(a.state, 'leave'); assert.equal(a.bird, null);
});
check('Vultures glide on spread wings between wingbeats', () => {
  const g = setup('chinandega'), wl = g.wildlife;
  const a = spawnPassage(wl, PASSAGE_SPECIES.black_vulture, { n: 1 })[0];
  a.passage.phase = 0; a.phase = 0.25;
  for (let k = 0; k < 20; k++) updatePassage(wl, 0.05);
  assert.equal(a.soaring, true); assert.ok(Math.abs(a.phase) < 0.001);
});
console.log(`${checks} bird behavior checks passed.`);
