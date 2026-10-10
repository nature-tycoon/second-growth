// node tools/animal-positioning-check.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
import { Game } from '../js/game.js';
import { T, F, isWater } from '../js/config.js';
import { ANIMAL, ANIMALS } from '../js/data/animals.js';
import { animalRadius } from '../js/sim/animal-positioning.js';
import { passable } from '../js/sim/animals.js';
import { mulberry32 } from '../js/rng.js';
Math.random = mulberry32(1987);
const { Actors } = await import('../js/render3d/actors.js');
const THREE = await import('three');
const g = new Game();
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function reset(map = 'serengeti') {
  g.newGame(1987, 'free', 'standard', map);
  g.wildlife.agents = []; g.wildlife.recount(); g.wildlife.spacingDirty = true;
  const w = g.world;
  for (let y = 18; y < 43; y++) for (let x = 18; x < 43; x++) {
    const i = w.idx(x, y); w.clearPlants(i); w.terrain[i] = T.SOIL;
    w.feature[i] = 0; w.struct[i] = -1; w.distWater[i] = 10;
  }
}
function spawn(key, x = 30, y = 30, opts = {}) {
  const a = g.wildlife.spawn(ANIMAL[key], x, y, { silent: true, ...opts });
  a.wait = 100; a.orientation = 0; return a;
}
function separate(steps = 80, dt = 0.05) {
  for (let k = 0; k < steps; k++) {
    g.wildlife.spacing.rebuild(g.world, g.wildlife.agents);
    g.wildlife.spacing.separate(dt, passable);
  }
}
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) - animalRadius(a) - animalRadius(b);
function pond() {
  const w = g.world;
  for (let y = 28; y <= 32; y++) for (let x = 28; x <= 32; x++) {
    w.terrain[w.idx(x, y)] = T.POND; w.distWater[w.idx(x, y)] = 0;
    w.carve(x, y, 0.6); // (dug like a real pond, so its water sits below the surrounding bank)
  }
  for (let y = 27; y <= 33; y++) for (let x = 27; x <= 33; x++) {
    const i = w.idx(x, y); if (!isWater(w.terrain[i])) w.distWater[i] = 1;
  }
}

check('Large animals on the identical point separate gradually without changing their heading', () => {
  reset(); const herd = Array.from({ length: 8 }, () => spawn('elephant'));
  for (const a of herd) { a.x = a.y = 30.5; }
  separate(1);
  for (const a of herd) { assert.ok(Math.hypot(a.x - 30.5, a.y - 30.5) <= 0.091); assert.equal(a.orientation, 0); }
  separate(600); // (standing animals shuffle apart slowly: a step, not a slide)
  for (const a of herd) for (const b of herd) if (a.id < b.id) assert.ok(gap(a, b) > -0.01, `${a.id}/${b.id}: ${gap(a, b)}`);
  const before = herd.map(a => [a.x, a.y]); separate(10);
  herd.forEach((a, k) => assert.ok(Math.hypot(a.x - before[k][0], a.y - before[k][1]) < 0.005));
});
check('Small species and calves use less room than large adults', () => {
  reset(); const adult = spawn('elephant'), calf = spawn('elephant', 30, 30, { juvenile: true, age: 20 });
  const gazelle = spawn('gazelle');
  assert.ok(animalRadius(calf) < animalRadius(adult) * 0.6);
  assert.ok(animalRadius(gazelle) < animalRadius(adult) * 0.5);
  calf.mom = adult.id; separate(); assert.ok(gap(adult, calf) > -0.01);
  assert.ok(Math.hypot(adult.x - calf.x, adult.y - calf.y) < 1.2);
});
check('Spacing stays on land and respects structures, fences, map edges and blocked corners', () => {
  reset(); const w = g.world, a = spawn('zebra'), b = spawn('zebra');
  a.x = b.x = 30.93; a.y = b.y = 30.93;
  w.terrain[w.idx(31, 30)] = T.POND; w.struct[w.idx(30, 31)] = 0;
  w.feature[w.idx(31, 31)] = F.FENCE;
  separate();
  for (const o of [a, b]) { const i = w.idx(Math.floor(o.x), Math.floor(o.y)); assert.ok(passable(w, i, o)); assert.equal(w.struct[i], -1); }
  a.x = b.x = a.y = b.y = 0.02;
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) { const i = w.idx(x, y); w.terrain[i] = T.SOIL; w.struct[i] = -1; w.feature[i] = 0; }
  separate(); for (const o of [a, b]) assert.ok(o.x >= 0 && o.y >= 0);
});
check('Flying animals and canopy animals do not push animals on the ground', () => {
  reset('pnw'); const deer = spawn('deer'), bird = spawn('heron');
  deer.x = bird.x = deer.y = bird.y = 30.5; bird.flying = true; bird.alt = 1;
  separate(); assert.equal(deer.x, 30.5); assert.equal(deer.y, 30.5);
  reset('amazon'); const tapir = spawn('tapir'), monkey = spawn('howler');
  tapir.x = monkey.x = tapir.y = monkey.y = 30.5;
  separate(); assert.equal(tapir.x, 30.5); assert.equal(monkey.x, 30.5);
});
check('Reef animals share space only within a similar depth band and remain in water', () => {
  reset('reef'); const w = g.world;
  for (let y = 28; y <= 32; y++) for (let x = 28; x <= 32; x++) w.terrain[w.idx(x, y)] = T.CREEK;
  const fish = ANIMALS.filter(a => a.reef);
  const low = fish.find(a => (a.sprite.swim ?? 0.3) <= 0.15), high = fish.find(a => (a.sprite.swim ?? 0.3) >= 0.45);
  const a = spawn(low.key), b = spawn(high.key); a.x = b.x = a.y = b.y = 30.5;
  separate(); assert.equal(a.x, 30.5); assert.equal(b.x, 30.5);
  const c = spawn(low.key); c.x = c.y = 30.5; separate(); assert.ok(gap(a, c) > -0.01);
  for (const o of [a, b, c]) assert.ok(isWater(w.terrain[w.idx(Math.floor(o.x), Math.floor(o.y))]));
});
check('Drinkers approach a bank and face real water on all four sides', () => {
  for (const [x, y, dx, dy] of [[27, 30, 1, 0], [33, 30, -1, 0], [30, 27, 0, 1], [30, 33, 0, -1]]) {
    reset(); pond(); const a = spawn('zebra', x, y); a.x = x + 0.5; a.y = y + 0.5; a.thirst = 20;
    assert.equal(g.wildlife.waterhole(a, ANIMAL.zebra), true); assert.ok(a.state === 'approach' || a.drinkT > 0); // (the dry spot at the waterline can be where it already stands)
    for (let k = 0; k < 30 && !(a.drinkT > 0); k++) g.wildlife.update(0.05);
    assert.ok(a.drinkT > 0); assert.equal(a.alt, 0);
    assert.ok(Math.cos(a.orientation) * dx + Math.sin(a.orientation) * dy > 0.99);
    assert.ok(!isWater(g.world.terrain[g.world.idx(Math.floor(a.x), Math.floor(a.y))]));
    assert.ok(isWater(g.world.terrain[g.world.idx(Math.floor(a.drinkAt[0]), Math.floor(a.drinkAt[1]))]));
  }
});
check('A dry diagonal corner and a covered drain cannot trigger drinking', () => {
  reset(); const w = g.world, a = spawn('zebra'); w.distWater[w.idx(30, 30)] = 1;
  w.terrain[w.idx(31, 31)] = T.POND; a.thirst = 6;
  assert.equal(g.wildlife.bankSpot(a), null);
  w.terrain[w.idx(31, 30)] = T.CREEK; w.feature[w.idx(31, 30)] = F.CULVERT;
  assert.equal(g.wildlife.bankSpot(a), null);
});
check('Drinkers in a crowded herd spread to separate bank positions', () => {
  reset(); pond(); const herd = Array.from({ length: 8 }, () => spawn('zebra', 27, 30));
  for (const a of herd) { a.thirst = 20; a.wait = 0; }
  for (let k = 0; k < 180; k++) g.wildlife.update(0.05);
  assert.ok(herd.some(a => a.drinkT > 0));
  for (const a of herd) for (const b of herd) if (a.id < b.id) assert.ok(gap(a, b) > -0.1, `${a.id}/${b.id}: ${gap(a, b)}`);
  separate(30);
  for (const a of herd) for (const b of herd) if (a.id < b.id) assert.ok(gap(a, b) > -0.01, `${a.id}/${b.id}: ${gap(a, b)}`);
  for (const a of herd.filter(a => a.drinkT > 0)) assert.ok(a.drinkAt && Math.cos(a.orientation - Math.atan2(a.drinkAt[1] - a.y, a.drinkAt[0] - a.x)) > 0.99);
});
check('Calves on dry ground do not copy their mother’s drinking pose', () => {
  reset(); pond(); const mom = spawn('zebra', 27, 30), calf = spawn('zebra', 26, 30, { juvenile: true, age: 10 });
  mom.drinkT = 4; calf.mom = mom.id; calf.momSlot = [-0.6, 0]; calf.thirst = 20;
  g.wildlife.keepWithMom(calf, ANIMAL.zebra); assert.ok(!(calf.drinkT > 0));
});
check('A perched bird lands to drink; it does not drink from a tree crown', () => {
  reset(); pond(); const a = spawn('secretary', 27, 30); a.thirst = 20; a.alt = 1;
  g.wildlife.waterhole(a, ANIMAL.secretary);
  for (let k = 0; k < 40 && !(a.drinkT > 0); k++) g.wildlife.update(0.05);
  assert.ok(a.drinkT > 0); assert.equal(a.alt, 0); assert.equal(a.flying, false);
});
check('Paused animals retain their spots; older saves acquire correct headings on movement', () => {
  reset(); const a = spawn('zebra'), b = spawn('zebra');
  const before = JSON.stringify(g.wildlife.agents); g.wildlife.update(0); assert.equal(JSON.stringify(g.wildlife.agents), before);
  const data = g.wildlife.serialize(); for (const o of data.agents) { delete o.orientation; delete o.drinkAt; delete o.restSpot; }
  g.wildlife.load(data); const old = g.wildlife.agents[0]; g.wildlife.stepToward(old, old.x, old.y + 1, 0.1);
  assert.ok(Math.abs(old.orientation - Math.PI / 2) < 1e-6);
  assert.ok(Number.isFinite(animalRadius(b)));
});
check('A predator can still close to catching distance', () => {
  reset(); const predator = spawn('lion'), prey = spawn('zebra'); predator.x = 30; prey.x = 30.7; predator.y = prey.y = 30.5;
  predator.state = 'hunt'; predator.target = prey.id;
  for (let k = 0; k < 20; k++) { g.wildlife.stepToward(predator, prey.x, prey.y, 0.03); separate(1); }
  assert.ok(Math.hypot(predator.x - prey.x, predator.y - prey.y) < 0.5);
});
check('Animals walking to the same tile settle without shuffling indefinitely', () => {
  reset(); const w = g.world, herd = Array.from({ length: 6 }, (_, k) => spawn('zebra', 28, 29 + k % 3));
  for (const a of herd) { a.path = [w.idx(30, 30), w.idx(29, 30)]; a.state = 'walk'; }
  // Leave completed walkers at their resting spots, rather than starting a new herd trip.
  const choose = g.wildlife.chooseTarget;
  g.wildlife.chooseTarget = a => { a.wait = 100; };
  try { for (let k = 0; k < 240; k++) g.wildlife.update(0.05); }
  finally { g.wildlife.chooseTarget = choose; }
  assert.ok(herd.every(a => a.state === 'idle'), herd.map(a => a.state).join(','));
  for (const a of herd) for (const b of herd) if (a.id < b.id) assert.ok(gap(a, b) > -0.015);
});
check('A dense elephant herd gives up crowded waypoints and finds room to settle', () => {
  reset(); const w = g.world;
  const herd = Array.from({ length: 24 }, (_, k) => spawn('elephant', 28, 29 + k % 3));
  for (const a of herd) { a.path = [w.idx(30, 30), w.idx(29, 30)]; a.state = 'walk'; }
  const choose = g.wildlife.chooseTarget;
  g.wildlife.chooseTarget = a => { a.wait = 1000; };
  try { for (let k = 0; k < 2000; k++) g.wildlife.update(0.05); }
  finally { g.wildlife.chooseTarget = choose; }
  assert.ok(herd.every(a => a.state === 'idle'), `${herd.filter(a => a.state === 'walk').length} elephants still walking after 100 days`);
  for (const a of herd) for (const b of herd) if (a.id < b.id) assert.ok(gap(a, b) > -0.015, `${a.id}/${b.id}: ${gap(a, b)}`);
});
check('Crowded herd recovery works across species, seeds and movement step sizes', () => {
  for (const [map, key] of [['serengeti', 'buffalo'], ['serengeti', 'zebra'], ['sumatra', 'gajah'], ['chinandega', 'cattle']]) {
    for (const dt of [0.01, 0.05]) {
      Math.random = mulberry32(dt === 0.01 ? 17 : 1987);
      reset(map); const w = g.world;
      const herd = Array.from({ length: 20 }, (_, k) => spawn(key, 28, 29 + k % 3));
      for (const a of herd) { a.path = [w.idx(30, 30), w.idx(29, 30)]; a.state = 'walk'; }
      const choose = g.wildlife.chooseTarget;
      g.wildlife.chooseTarget = a => { a.wait = 1000; };
      try { for (let t = 0; t < 40; t += dt) g.wildlife.update(dt); }
      finally { g.wildlife.chooseTarget = choose; }
      assert.ok(herd.every(a => a.state === 'idle'), `${key}, dt=${dt}: unfinished walkers`);
      for (const a of herd) for (const b of herd) if (a.id < b.id) assert.ok(gap(a, b) > -0.015, `${key}: ${gap(a, b)}`);
    }
  }
});
check('A stalled long trip takes a local detour and remembers its distant destination', () => {
  reset(); const w = g.world, a = spawn('elephant', 29, 30), dest = w.idx(100, 30);
  a.path = [dest, w.idx(30, 30)]; a.state = 'walk';
  g.wildlife.spacing.rebuild(w, g.wildlife.agents);
  const before = [a.x, a.y]; g.wildlife.recoverMovement(a);
  assert.deepEqual([a.x, a.y], before); // Recovery plans a walk; it never teleports.
  assert.equal(a.trip, dest); assert.equal(a.state, 'walk');
  assert.ok(Math.hypot(a.restSpot[1] - a.x, a.restSpot[2] - a.y) < 5);
  for (const j of a.path) assert.ok(passable(w, j, a));
});
check('Herd followers replace blocked formation slots while keeping family links', () => {
  reset(); const w = g.world, mom = spawn('elephant'), calf = spawn('elephant', 28, 30, { juvenile: true, age: 10 });
  calf.mom = mom.id; calf.slot = [0, 0]; calf.momSlot = [0, 0]; calf.follow = true;
  calf.path = [w.idx(30, 30), w.idx(29, 30)]; calf.state = 'walk';
  g.wildlife.spacing.rebuild(w, g.wildlife.agents); g.wildlife.recoverMovement(calf);
  assert.equal(calf.slot, null); assert.equal(calf.momSlot, null); assert.equal(calf.mom, mom.id);
  for (let k = 0; k < 200; k++) g.wildlife.update(0.05);
  assert.ok(calf.momSlot && Math.hypot(...calf.momSlot) > 0.4);
  assert.ok(Math.hypot(calf.x - mom.x, calf.y - mom.y) < 3);
});
check('Crowded shoreline approaches recover to real water without leaving the bank', () => {
  reset(); pond(); const w = g.world;
  const herd = Array.from({ length: 8 }, () => spawn('elephant', 27, 30));
  for (const a of herd) { a.localGoal = [27.84, 30.5]; a.state = 'approach'; a.thirst = 20; }
  let drank = false;
  for (let k = 0; k < 800; k++) {
    g.wildlife.update(0.05);
    for (const a of herd) {
      assert.ok(passable(w, w.idx(Math.floor(a.x), Math.floor(a.y)), a));
      if (a.drinkT > 0) {
        drank = true; assert.ok(a.drinkAt);
        assert.ok(isWater(w.terrain[w.idx(Math.floor(a.drinkAt[0]), Math.floor(a.drinkAt[1]))]));
      }
    }
  }
  assert.ok(drank); assert.ok(herd.every(a => (a.moveProgress?.stalled || 0) < 3));
});
check('A trapped herd cancels failed routes without crossing water, structures or fences', () => {
  reset(); const w = g.world;
  for (let y = 29; y <= 31; y++) for (let x = 29; x <= 31; x++) {
    if (x === 30 && y === 30) continue;
    const j = w.idx(x, y);
    if (x === 29) w.terrain[j] = T.POND;
    else if (x === 31) w.feature[j] = F.FENCE;
    else w.struct[j] = 0;
  }
  const herd = Array.from({ length: 4 }, () => spawn('elephant'));
  for (const a of herd) { a.path = [w.idx(30, 30)]; a.state = 'walk'; }
  const choose = g.wildlife.chooseTarget;
  g.wildlife.chooseTarget = a => { a.wait = 1000; };
  try { for (let k = 0; k < 400; k++) g.wildlife.update(0.05); }
  finally { g.wildlife.chooseTarget = choose; }
  assert.ok(herd.every(a => a.state === 'idle'));
  for (const a of herd) assert.equal(w.idx(Math.floor(a.x), Math.floor(a.y)), w.idx(30, 30));
});
check('Progress tracking pauses with the game and starts fresh after loading a save', () => {
  reset(); const a = spawn('elephant', 29, 30), w = g.world;
  a.path = [w.idx(32, 30), w.idx(30, 30)]; a.state = 'walk';
  g.wildlife.update(0.05); assert.ok(a.moveProgress);
  const before = JSON.stringify(g.wildlife.agents); g.wildlife.update(0);
  assert.equal(JSON.stringify(g.wildlife.agents), before);
  const data = g.wildlife.serialize(); assert.ok(!('moveProgress' in data.agents[0]));
  g.wildlife.load(data); assert.equal(g.wildlife.agents[0].moveProgress, null);
  assert.equal(g.wildlife.agents[0].state, 'idle');
});
check('Legacy drinking poses are repaired immediately and survive the restored rest timer', () => {
  reset(); pond(); const a = spawn('zebra', 30, 27), dry = spawn('zebra', 25, 30);
  a.drinkT = dry.drinkT = 4; delete a.orientation;
  g.wildlife.load(g.wildlife.serialize()); const [wet, inland] = g.wildlife.agents;
  for (let k = 0; k < 20; k++) g.wildlife.update(0.05);
  assert.ok(wet.drinkAt); assert.ok(Math.sin(wet.orientation) > 0.99); assert.ok(wet.drinkT > 2.9);
  assert.equal(inland.drinkT, 0);
});
check('An altered shoreline safely cancels an approach', () => {
  reset(); pond(); const a = spawn('zebra', 27, 30); a.thirst = 20;
  g.wildlife.waterhole(a, ANIMAL.zebra); assert.equal(a.state, 'approach');
  g.world.terrain.fill(T.SOIL); g.wildlife.update(0.05);
  assert.equal(a.state, 'idle'); assert.equal(a.localGoal, null); assert.ok(!(a.drinkT > 0));
});
check('River patrol directions remain independent of the rendered facing angle', () => {
  reset('amazon'); const w = g.world;
  for (let y = 18; y < 43; y++) for (let x = 18; x < 43; x++) w.terrain[w.idx(x, y)] = T.CREEK;
  for (const key of ['giantotter', 'dolphin']) {
    const a = spawn(key); a.heading = [1, 0];
    g.wildlife.stepToward(a, a.x, a.y + 1, 0.1);
    assert.deepEqual(a.heading, [1, 0]); assert.ok(Number.isFinite(a.orientation)); a.wait = 0;
  }
  for (let k = 0; k < 300; k++) g.wildlife.update(0.05);
  const actors = new Actors(new THREE.Scene()); g.visitors.agents = [];
  actors.update(g, new THREE.Vector3(1, 0, 0), 0);
  for (const a of g.wildlife.agents) {
    assert.ok(a.heading.every(Number.isFinite)); assert.ok(Number.isFinite(a.orientation));
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
    assert.ok(Number.isFinite(actors.pose.get(a.id).yaw));
  }
});
check('The rendered model turns toward water before lowering its head, and keeps facing it', () => {
  reset(); pond(); const a = spawn('zebra', 30, 27); a.thirst = 20;
  for (let k = 0; k < 40 && !(a.drinkT > 0); k++) { a.wait = 0; g.wildlife.update(0.05); }
  assert.ok(a.drinkAt);
  const actors = new Actors(new THREE.Scene()); g.visitors.agents = [];
  const right = new THREE.Vector3(1, 0, 0); actors.update(g, right, 0);
  const st = actors.pose.get(a.id); st.yaw = -a.orientation + Math.PI; st.graze = 0;
  actors.update(g, right, 0.016); assert.equal(st.graze, 0);
  for (let k = 2; k <= 160; k++) actors.update(g, right, k / 60);
  assert.ok(Math.cos(st.yaw + a.orientation) > 0.99); assert.ok(st.graze > 0.9);
  const yaw = st.yaw; a.x += 0.02; actors.update(g, right, 3);
  assert.ok(Math.abs(st.yaw - yaw) < 0.001);
});
check('Neighbour checks stay local with hundreds of animals', () => {
  reset(); const w = g.world;
  for (let i = 0; i < w.n; i++) { w.terrain[i] = T.SOIL; w.struct[i] = -1; w.feature[i] = 0; }
  for (let y = 2; y < 88; y += 4) for (let x = 2; x < 118; x += 4) spawn('gazelle', x, y);
  separate(1); const n = g.wildlife.agents.length;
  assert.ok(n > 500); assert.ok(g.wildlife.spacing.comparisons < n * 15);
  const t = performance.now(); for (let k = 0; k < 100; k++) g.wildlife.update(0.01);
  console.log(`  ${n} animals, ${g.wildlife.spacing.comparisons} local pairs; ${((performance.now() - t) / 100).toFixed(2)} ms/update`);
});
console.log(`${checks} animal positioning checks passed.`);
