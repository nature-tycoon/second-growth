// node tools/animal-culling-check.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Actors } = await import('../js/render3d/actors.js');
const { ActorView, animalViewRadius } = await import('../js/render3d/actor-view.js');
const { buildSpecies } = await import('../js/render3d/fauna.js');
const { Renderer } = await import('../js/render3d/scene.js');
import { Game } from '../js/game.js';
import { ANIMAL, ANIMALS } from '../js/data/animals.js';
import { PLANT } from '../js/data/plants.js';
import { T, LEVEL } from '../js/config.js';
import { adultAnimalScale } from '../js/render3d/animal-scale.js';
import { mulberry32 } from '../js/rng.js';
Math.random = mulberry32(1987);
let checks = 0, g, actors, camera;
const right = new THREE.Vector3(1, 0, 0);
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function reset(map = 'serengeti') {
  g = new Game(); g.newGame(1987, 'free', 'standard', map);
  g.wildlife.agents = []; g.wildlife.recount(); g.visitors.agents = []; g.residents = [];
  const w = g.world; w.vh.fill(0); w.tree.fill(0); w.ground.fill(0); w.shrub.fill(0);
  w.terrain.fill(T.SOIL); w.feature.fill(0); w.struct.fill(-1);
  actors = new Actors(new THREE.Scene()); camera = new THREE.OrthographicCamera(-5, 5, 3, -3, 0.01, 300);
  aim(30, 30);
}
function aim(x, z, az = Math.PI / 4, height = 0) {
  const target = new THREE.Vector3(x, height, z), el = 34 * Math.PI / 180;
  camera.position.copy(target).add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(120));
  camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
function spawn(key = 'zebra', x = 30, y = 30, opts = {}) {
  const a = g.wildlife.spawn(ANIMAL[key], x, y, { silent: true, ...opts }); a.wait = 100; return a;
}
function frame(time = 1) { actors.update(g, right, time, camera, 600); }
function count() { return [...actors.fauna.species.values()].reduce((n, p) => n + p.mesh.count, 0); }
const ctx = new Proxy({}, { get: (o, k) => o[k] ?? (() => {}) });
function sceneStub() {
  return { actors, world: g.world, zoom: 1, time: 1, trailFx: [],
    project: () => ({ x: 100, y: 100 }),
    camera, vw: 1000, vh: 600 };
}

check('Animals far outside the view never build models or prepare animation data', () => {
  reset(); spawn('zebra', 100, 80); frame();
  assert.equal(count(), 0); assert.equal(actors.fauna.species.size, 0);
  assert.equal(actors.pose.size, 0); assert.equal(actors.visibleWildlife.length, 0); assert.equal(actors.shadows.count, 0);
});
check('Visible instances and their ground shadows remain; hidden species pools go inactive', () => {
  reset(); const a = spawn(), b = spawn('elephant', 100, 80); frame();
  assert.deepEqual(actors.visibleWildlife, [a]); assert.equal(count(), 1); assert.equal(actors.shadows.count, 1);
  aim(100, 80); frame(2);
  assert.deepEqual(actors.visibleWildlife, [b]);
  const pool = actors.fauna.species.get('zebra'); assert.equal(pool.mesh.count, 0); assert.equal(pool.mesh.visible, false);
  const version = pool.mesh.instanceMatrix.version; frame(3); assert.equal(pool.mesh.instanceMatrix.version, version);
});
check('A 96-pixel margin preserves animals just past all four screen edges at any zoom', () => {
  reset(); const view = new ActorView();
  for (const zoom of [0.4, 1, 3]) {
    camera.zoom = zoom; camera.updateProjectionMatrix(); view.update(camera, 600);
    for (const [sx, sy] of [[-1.1, 0], [1.1, 0], [0, -1.1], [0, 1.1]]) {
      const p = new THREE.Vector3(sx, sy, 0).unproject(camera);
      assert.ok(view.visible(p.x, p.y, p.y, p.z, 0));
    }
    const far = new THREE.Vector3(1.6, 0, 0).unproject(camera);
    assert.equal(view.visible(far.x, far.y, far.y, far.z, 0), false);
  }
});
check('Camera rotation, pan, resize and zoom use the current view immediately', () => {
  reset(); const a = spawn(), b = spawn('gazelle', 100, 80); frame(); assert.ok(actors.visibleWildlife.includes(a));
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    aim(100, 80, angle); frame(); assert.deepEqual(actors.visibleWildlife, [b]);
  }
  camera.left = -150; camera.right = 150; camera.top = 100; camera.bottom = -100;
  camera.updateProjectionMatrix(); frame(); assert.equal(count(), 2);
  camera.left = -3; camera.right = 3; camera.top = 2; camera.bottom = -2;
  camera.updateProjectionMatrix(); frame(); assert.equal(count(), 1);
});
check('Returning animals resume at their current position and direction, including paused play', () => {
  reset(); const a = spawn(); frame(); const st = actors.pose.get(a.id);
  aim(100, 80); frame(2); assert.equal(st.visible, false);
  a.x = 31.2; a.y = 31.8; a.orientation = 1.3; a.state = 'walk'; a.phase = 7;
  aim(31, 32); g.speed = 0; frame(80);
  assert.equal(st.visible, true); assert.equal(st.x, a.x); assert.equal(st.z, a.y);
  assert.ok(Math.abs(st.yaw + a.orientation) < 1e-8); assert.equal(st.gait, 0);
  const p = actors.fauna.species.get('zebra');
  assert.equal(p.anim.getX(0), Math.fround(a.phase * Math.PI));
  assert.ok([...p.mesh.instanceMatrix.array.slice(0, 16)].every(Number.isFinite));
});
check('Dead or removed animals cannot remain in the pose cache or reappear', () => {
  reset(); const a = spawn(); frame(); aim(100, 80); frame(2);
  g.wildlife.remove(a, 'predation'); frame(3); assert.equal(actors.pose.has(a.id), false);
  aim(30, 30); frame(4); assert.equal(count(), 0);
});
check('Selection and picking stay valid while offscreen; focus uses no stale pose', () => {
  reset(); const a = spawn(); g.selectedAgent = a; frame(); assert.equal(actors.ring.visible, true);
  aim(100, 80); frame(2); assert.equal(actors.ring.visible, false); assert.equal(g.selectedAgent, a);
  const r = sceneStub(); assert.equal(Renderer.prototype.pickAgent.call(r, g, 100, 100), null);
  aim(30, 30); frame(3); assert.equal(actors.ring.visible, true);
  assert.equal(Renderer.prototype.pickAgent.call(r, g, 100, 100), a);
});
check('Canopy birds and flying animals stay visible when their ground tile is below the view', () => {
  reset('pnw'); const w = g.world, i = w.idx(30, 30);
  w.tree[i] = PLANT.fir.id; w.treeG[i] = 1;
  const perched = spawn('woodpecker'); const flying = spawn('heron'); flying.flying = true; flying.alt = 1;
  camera.top = 0.25; camera.bottom = -0.25; camera.left = -2; camera.right = 2;
  aim(30.5, 30.5, Math.PI / 4, 2); frame();
  assert.ok(actors.visibleWildlife.includes(perched)); assert.ok(actors.visibleWildlife.includes(flying));
});
check('Reef depth and swimmer turns resume cleanly without a huge bend or old depth', () => {
  reset('reef'); const a = spawn('shark'); frame(); const st = actors.pose.get(a.id);
  aim(100, 80); frame(2); assert.equal(st.visible, false);
  st.depth = 0.9; st.bend = 1; a.hd = 2.4;
  aim(30, 30); frame(400);
  assert.ok(st.depth < 0.7); assert.equal(st.bend, 0); assert.ok(Math.abs(st.yaw + a.hd) < 1e-8);
});
check('Only active instance data is uploaded, even when a pool has grown for a large herd', () => {
  reset(); for (let k = 0; k < 40; k++) spawn(); frame(); const p = actors.fauna.species.get('zebra');
  assert.ok(p.cap >= 40); const survivor = g.wildlife.agents[0]; g.wildlife.agents = [survivor]; frame(2);
  assert.equal(p.count, 1); assert.deepEqual(p.mesh.instanceMatrix.updateRanges, [{ start: 0, count: 16 }]);
  assert.deepEqual(p.anim.updateRanges, [{ start: 0, count: 4 }]);
  assert.deepEqual(actors.shadows.instanceMatrix.updateRanges, [{ start: 0, count: 16 }]);
});
check('A dense visible herd keeps every shadow when the camera moves or the buffer grows', () => {
  reset(); for (let k = 0; k < 650; k++) spawn('zebra', 30 + k * 0.001, 30);
  frame(); assert.equal(actors.shadows.count, 650);
  assert.ok(actors.shadows.instanceMatrix.array.slice(0, 650 * 16).every(Number.isFinite));
  const first = Array.from(actors.shadows.instanceMatrix.array.slice(0, 16));
  aim(100, 80); frame(2); assert.equal(actors.shadows.count, 0); assert.equal(actors.shadows.visible, false);
  aim(30, 30); frame(3); assert.equal(actors.shadows.count, 650);
  assert.deepEqual(Array.from(actors.shadows.instanceMatrix.array.slice(0, 16)), first);
});
check('Drawing and animal effects do not modify wildlife, saves or simulation randomness', () => {
  reset('pnw'); const a = spawn('coho'); g.world.terrain[g.world.idx(30, 30)] = T.CREEK;
  frame(); const r = sceneStub(); const data = JSON.stringify(g.wildlife.serialize()), rng = g.rng.state();
  const random = Math.random; Math.random = () => { throw new Error('Rendering consumed simulation randomness'); };
  try { frame(2); Renderer.prototype.drawTrails.call(r, ctx, g, 1); }
  finally { Math.random = random; }
  assert.equal(JSON.stringify(g.wildlife.serialize()), data); assert.equal(g.rng.state(), rng);
  aim(100, 80); frame(3); r.trailFx = []; Renderer.prototype.drawTrails.call(r, ctx, g, 1);
  assert.equal(r.trailFx.length, 0); assert.equal(a.rippled, undefined); assert.equal(a.leaping, undefined);
});
check('Hidden effect particles still expire and move, without being drawn', () => {
  reset(); aim(30, 30); frame(); const r = sceneStub();
  r.trailFx = [{ k: 'drop', x: 100, z: 80, y: 1, vx: 1, vz: 1, vy: 1, life: 1, max: 1 },
    { k: 'ring', x: 100, z: 80, y: 0, life: 0.1, max: 1, s: 1 }];
  r.project = () => { throw new Error('Offscreen effect was projected for drawing'); };
  Renderer.prototype.drawTrails.call(r, ctx, g, 0.2);
  assert.equal(r.trailFx.length, 1); assert.equal(r.trailFx[0].life, 0.8); assert.ok(r.trailFx[0].x > 100);
});
check('Offscreen animals continue moving and predators continue catching prey', () => {
  reset(); const predator = spawn('lion'), prey = spawn('zebra');
  predator.x = 30.5; prey.x = 30.7; predator.y = prey.y = 30.5;
  predator.state = 'hunt'; predator.target = prey.id; predator.huntTime = 3;
  aim(100, 80); frame(); assert.equal(count(), 0);
  const random = Math.random; Math.random = () => 0;
  try { g.wildlife.update(0.05); } finally { Math.random = random; }
  assert.equal(g.wildlife.agents.includes(prey), false); assert.equal(predator.hunger, 0);
  frame(2); assert.equal(count(), 0);
});
check('Conservative bounds enclose all maps’ models, adult variants and extended wings', () => {
  let models = 0;
  for (const map of ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'reef', 'sumatra']) {
    reset(map);
    for (const def of ANIMALS) for (const male of [false, ...(def.sprite.male ? [true] : [])]) {
      const d = male ? { ...def, sprite: { ...def.sprite, ...def.sprite.male } } : def;
      const { geo, motion } = buildSpecies(d), scale = adultAnimalScale(d.sprite);
      const bound = animalViewRadius(d); let extent = 0;
      for (const attr of [geo.attributes.position, geo.attributes.aExt]) for (let k = 0; k < attr.count; k++) {
        extent = Math.max(extent, Math.hypot(attr.getX(k), attr.getY(k), attr.getZ(k)));
      }
      extent += Math.abs(motion.bob || 0) + Math.abs(motion.wave || 0) * 1.35 + Math.abs(motion.bend || 0);
      assert.ok(extent * scale <= bound, `${map}/${d.key}/${male}: ${extent * scale} > ${bound}`);
      geo.dispose(); models++;
    }
  }
  console.log(`  ${models} models and adult variants fit their rendering bounds.`);
});
check('Culling reduces preparation work and submitted geometry in a populated map', () => {
  reset(); for (let y = 2; y < 88; y += 4) for (let x = 2; x < 118; x += 4) spawn('zebra', x, y);
  const n = g.wildlife.agents.length; aim(30, 30); actors.cullOffscreen = false;
  for (let k = 0; k < 50; k++) frame(k / 60);
  function bench(enabled) {
    actors.cullOffscreen = enabled; const times = [];
    for (let batch = 0; batch < 5; batch++) {
      const t = performance.now(); for (let k = 0; k < 150; k++) frame((batch * 150 + k) / 60 + 10);
      times.push((performance.now() - t) / 150);
    }
    times.sort((a, b) => a - b); return times[2];
  }
  const full = bench(false), all = count(), culled = bench(true), visible = count();
  assert.equal(all, n); assert.ok(visible < n * 0.15);
  console.log(`  ${n} animals: ${all} → ${visible} drawn; preparation ${full.toFixed(3)} → ${culled.toFixed(3)} ms/frame (${Math.round((1 - culled / full) * 100)}% reduction).`);
});
console.log(`${checks} animal culling checks passed.`);
