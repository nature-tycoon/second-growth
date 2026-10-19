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
import { birdChoose, birdUpdate, birdAlarm, isBird, carryCatch, liftable } from '../js/sim/bird-behavior.js';
import { T, F, isWater } from '../js/config.js';
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
check('A bathing bird renders splash rings without crashing the frame, including a removed water tile', () => {
  const g = setup(), w = g.world, a = spawn(g, 'robin');
  const water = w.idx(41, 30); w.terrain[water] = T.POND;
  w.waterManaged?.fill(0);
  a.bird = { kind: 'bathe', water: [41.5, 30.5] };
  const r = { world: w, zoom: 1, trailRng: () => 0,
    actors: { visibleWildlife: [a], pose: new Map([[a.id, { gait: 0, y: 0, yaw: 0 }]]), view: { visible: () => true } },
    project: (x, y, z) => ({ x: x - z, y }),
  };
  let drawn = 0;
  const ctx = { beginPath() {}, ellipse(...args) { assert.ok(args.every(Number.isFinite)); drawn++; }, stroke() {} };
  Renderer.prototype.drawTrails.call(r, ctx, g, .1);
  assert.equal(drawn, 1); assert.equal(r.trailFx.length, 1);
  const ring = r.trailFx[0]; assert.equal(ring.k, 'ring');
  assert.deepEqual([ring.x, ring.z], a.bird.water); assert.ok(Number.isFinite(ring.y) && ring.y > 0);
  r.trailFx = []; g.speed = 0;
  Renderer.prototype.drawTrails.call(r, ctx, g, .1); assert.equal(r.trailFx.length, 0);
  g.speed = 1; w.terrain[water] = T.SOIL;
  Renderer.prototype.drawTrails.call(r, ctx, g, .1); assert.equal(r.trailFx.length, 0);
});
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
  // Having sat in this tree, it moves on to another a few trees away rather than settling in again.
  const far = g.world.idx(44, 30); g.world.tree[far] = 1; g.world.treeG[far] = 1;
  fixed(0.8, () => birdChoose(wl, a, ANIMAL.robin));
  assert.equal(a.state, 'fly'); assert.equal(a.birdGoal.kind, 'perch'); assert.equal(a.birdGoal.i, far);
  Object.assign(a, { state: 'idle', flying: false, birdGoal: null, perchedAt: null });
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
check('A fed hawk circles over open ground on still wings, then glides down to a perch', () => {
  for (const map of ['pnw', 'atlanta']) {
    const g = setup(map), wl = g.wildlife, w = g.world, a = spawn(g, 'hawk');
    assert.equal(ANIMAL.hawk.soar, true);
    a.hunger = 0;
    assert.equal(fixed(0.1, () => birdChoose(wl, a, ANIMAL.hawk)), true);
    const b = a.bird; assert.equal(b?.kind, 'soar'); assert.equal(a.flying, true);
    let swept = 0, last = Math.atan2(a.y - b.cy, a.x - b.cx), off = 0, still = 0, n = 0, maxAlt = 0;
    for (let k = 0; k < 400 && a.bird === b; k++) {
      a.hunger = 0; wl.update(0.05);
      if (a.bird !== b) break;
      const ang = Math.atan2(a.y - b.cy, a.x - b.cx); let d = ang - last; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; swept += d; last = ang;
      if (k > 80) { off = Math.max(off, Math.abs(Math.hypot(a.x - b.cx, a.y - b.cy) - b.r)); n++; if (Math.abs(Math.sin(a.phase * Math.PI * 1.6)) < 0.05) still++; }
      maxAlt = Math.max(maxAlt, a.alt);
    }
    assert.ok(Math.abs(swept) > 2 * Math.PI, `${map}: circled ${swept.toFixed(2)} rad`);
    assert.ok(off < 0.6, `${map}: held its circle (off by ${off.toFixed(2)})`);
    assert.ok(maxAlt > 1.3, `${map}: soars above ordinary flight (${maxAlt.toFixed(2)})`);
    assert.ok(still / n > 0.6, `${map}: wings mostly held out (${(still / n).toFixed(2)})`);
    // the soar ends; on its next flight it sinks back to ordinary height without a jump
    a.bird.t = 0; wl.update(0.05); assert.notEqual(a.bird?.kind, 'soar');
    w.tree.fill(0); w.tree[w.idx(48, 30)] = 1; w.treeG[w.idx(48, 30)] = 1;
    let prev = a.alt;
    for (let k = 0; k < 200 && a.state === 'fly'; k++) { wl.update(0.05); assert.ok(Math.abs(a.alt - prev) < 0.16, `${map}: altitude jumped ${prev} -> ${a.alt}`); prev = a.alt; }
  }
});
check('A hungry soaring hawk breaks off its circle to hunt', () => {
  const g = setup(), wl = g.wildlife, a = spawn(g, 'hawk');
  a.hunger = 0; fixed(0.1, () => birdChoose(wl, a, ANIMAL.hawk));
  assert.equal(a.bird?.kind, 'soar');
  a.hunger = 5; birdUpdate(wl, a, ANIMAL.hawk, 0.05);
  assert.equal(a.bird, null); assert.equal(a.state, 'idle'); assert.equal(a.wait, 0);
});
// What each raptor and owl can lift as an adult: anything else is eaten where it fell
// (or, for a fish, dragged to the bank). The young of any prey are always light enough.
const CARRY = {
  pnw: { hawk: [['vole', 'gartersnake'], ['rabbit']], owl: [['vole', 'squirrel', 'rabbit'], []], eagle: [['cutthroat'], ['coho']] },
  atlanta: { owl: [['chipmunk', 'toad', 'peeper'], []], hawk: [['chipmunk', 'toad', 'anole'], ['ratsnake']] },
  amazon: { harpy: [['sloth', 'howler', 'spider'], []] },
  chinandega: { guaco: [[], ['boa', 'iguana']] },
  sumatra: { barnowl: [['woodrat'], []], serpenteagle: [['flyingfrog'], ['python', 'monitor']] },
};
function catchPrey(g, hunter, key, x, y, juvenile = false) {
  const wl = g.wildlife, b = spawn(g, key, x, y); b.juvenile = juvenile;
  hunter.x = b.x; hunter.y = b.y; hunter.state = 'idle'; hunter.flying = true; hunter.alt = 0.4;
  wl.remove(b, 'predation');
  return carryCatch(wl, hunter, g.catalog.animals[hunter.sp], b);
}
check('Raptors and owls carry off only what they can lift; the young of any prey they always can', () => {
  for (const [map, table] of Object.entries(CARRY)) {
    const g = setup(map);
    for (const [key, [carried, heavy]] of Object.entries(table)) {
      const def = g.catalog.animal[key];
      assert.deepEqual([...def.carries].sort(), [...carried].sort(), `${map} ${key}`);
      for (const p of carried) assert.equal(liftable(def, g.catalog.animal[p], {}), true, `${map} ${key} lifts ${p}`);
      for (const p of heavy) {
        assert.equal(liftable(def, g.catalog.animal[p], {}), false, `${map} ${key} can't lift an adult ${p}`);
        assert.equal(liftable(def, g.catalog.animal[p], { juvenile: true }), true, `${map} ${key} lifts a young ${p}`);
      }
    }
  }
});
check('A hawk mantles over a vole, carries it to a tree, eats it there, and saves mid-flight', () => {
  const g = setup(), wl = g.wildlife, w = g.world, a = spawn(g, 'hawk');
  const tree = w.idx(46, 30); w.tree[tree] = 1; w.treeG[tree] = 1;
  assert.equal(catchPrey(g, a, 'vole', 40.5, 30.5), true);
  assert.equal(a.state, 'carry'); assert.equal(a.carry.phase, 'mantle'); assert.equal(a.prey.sp, ANIMAL.vole.index);
  let k = 0, prev = a.alt, saved = false;
  for (; k < 600 && a.state === 'carry'; k++) {
    wl.update(0.05);
    assert.ok(Math.abs(a.alt - prev) < 0.16, `altitude jumped ${prev} -> ${a.alt}`); prev = a.alt;
    if (!saved && a.carry?.phase === 'lift' && a.x > 42) {
      saved = true;
      const g2 = setup(); g2.wildlife.load(JSON.parse(JSON.stringify(wl.serialize())));
      const b = g2.wildlife.agents.find(o => o.id === a.id);
      assert.equal(b.state, 'carry'); assert.equal(b.prey.sp, a.prey.sp); assert.deepEqual(b.carry, a.carry);
    }
  }
  assert.ok(saved, 'was carried through the air');
  assert.equal(a.state, 'feed'); assert.equal(idx(g, a), tree); assert.ok(a.prey); assert.ok(a.feedT > 4);
  // drawn: the hawk and the vole in its feet
  const actors = new Actors(new THREE.Scene()); actors.update(g, new THREE.Vector3(1, 0, 0), 1);
  const vole = actors.fauna.species.get(actors.fauna.modelKey(ANIMAL.vole)), hawk = actors.fauna.species.get(actors.fauna.modelKey(ANIMAL.hawk));
  assert.ok(hawk && hawk.count + (hawk.far?.count || 0) === 1, 'the hawk is drawn');
  assert.ok(vole && vole.count + (vole.far?.count || 0) === 1, 'the vole is drawn under the hawk');
  for (k = 0; k < 400 && a.state === 'feed'; k++) wl.update(0.05);
  assert.notEqual(a.state, 'feed'); assert.equal(a.prey, null);
});
check('A hawk eats a rabbit where it fell; an owl swallows small prey quickly', () => {
  const g = setup(), a = spawn(g, 'hawk');
  const tree = g.world.idx(46, 30); g.world.tree[tree] = 1; g.world.treeG[tree] = 1;
  assert.equal(catchPrey(g, a, 'rabbit', 40.5, 30.5), true);
  assert.equal(a.state, 'feed'); assert.equal(a.flying, false); assert.equal(a.prey.sp, ANIMAL.rabbit.index);
  const o = spawn(g, 'owl', 40.5, 34.5);
  catchPrey(g, o, 'vole', 40.5, 34.5); assert.equal(o.state, 'carry');
  for (let k = 0; k < 600 && o.state === 'carry'; k++) g.wildlife.update(0.05);
  assert.equal(o.state, 'feed'); assert.ok(o.feedT <= 3, 'an owl swallows a vole whole');
});
check('A bald eagle carries a trout to a tree and drags a heavy coho low to the bank', () => {
  const g = setup(), wl = g.wildlife, w = g.world;
  for (let y = 0; y < w.h; y++) for (let x = 36; x < 46; x++) w.terrain[w.idx(x, y)] = T.RIVER;
  const tree = w.idx(48, 30); w.tree[tree] = 1; w.treeG[tree] = 1;
  const e = spawn(g, 'eagle', 40.5, 30.5);
  assert.equal(catchPrey(g, e, 'cutthroat', 40.5, 30.5), true);
  assert.equal(e.carry.phase, 'lift'); assert.equal(e.carry.low, false);
  for (let k = 0; k < 600 && e.state === 'carry'; k++) wl.update(0.05);
  assert.equal(e.state, 'feed'); assert.equal(idx(g, e), tree);
  const f = spawn(g, 'eagle', 40.5, 20.5);
  assert.equal(catchPrey(g, f, 'coho', 40.5, 20.5), true);
  assert.equal(f.carry.low, true);
  let high = 0;
  for (let k = 0; k < 600 && f.state === 'carry'; k++) { wl.update(0.05); if (k > 20) high = Math.max(high, f.alt); }
  assert.equal(f.state, 'feed'); assert.ok(!isWater(w.terrain[idx(g, f)]), 'ate it on the bank'); assert.ok(high <= 0.4, `skimmed low (${high})`);
});
console.log(`${checks} bird behavior checks passed.`);
