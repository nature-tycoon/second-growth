// node tools/plant-view-check.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Flora } = await import('../js/render3d/flora.js');
import { Game } from '../js/game.js';
import { ANIMAL } from '../js/data/animals.js';
import { mulberry32 } from '../js/rng.js';
Math.random = mulberry32(1987);
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const scene = new THREE.Scene(), flora = new Flora(scene, { incremental: false });
const material = new THREE.MeshLambertMaterial({ vertexColors: true });
const pool = flora.pool('fixture', () => new THREE.BoxGeometry(1, 2, 1), material, {}, () => new THREE.BoxGeometry(.8, 1.8, .8));
pool.begin();
for (const x of [4, 70, 110]) pool.add(x, 0, 4, 1, 1, 1, .3, [x / 120, .6, .2]);
pool.end();
const camera = new THREE.OrthographicCamera(-5, 5, 4, -4, .01, 300);
function aim(x, az = Math.PI / 4) {
  const target = new THREE.Vector3(x, 0, 4), el = 34 * Math.PI / 180;
  camera.position.copy(target).add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(120));
  camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
aim(4);
check('Visible source plants retain their exact matrices, colours and models in one shared batch', () => {
  const before = [...pool.subs.values()].map(p => [p, p.mesh.instanceMatrix.array.slice(), p.mesh.instanceColor.array.slice()]);
  flora.updateView(camera);
  const batch = flora.plantView.batches.get(pool);
  assert.equal(batch.mesh.count, 1); assert.equal(batch.mesh.geometry, before[0][0].mesh.geometry);
  assert.deepEqual(batch.mesh.instanceMatrix.array.slice(0, 16), before[0][1].slice(0, 16));
  assert.deepEqual(batch.mesh.instanceColor.array.slice(0, 3), before[0][2].slice(0, 3));
  for (const [p, matrices, colors] of before) {
    assert.deepEqual(p.mesh.instanceMatrix.array, matrices); assert.deepEqual(p.mesh.instanceColor.array, colors);
    assert.equal(p.mesh.parent, null);
    assert.equal(p.viewShadow.count, p.n); assert.ok(p.viewShadow.visible);
    assert.equal(p.viewShadow.instanceMatrix, p.mesh.instanceMatrix);
  }
});
check('Unchanged frames reuse packed instance buffers without uploads or visibility work', () => {
  const batch = flora.plantView.batches.get(pool), version = batch.mesh.instanceMatrix.version;
  const updates = flora.plantView.stats.updates;
  assert.equal(flora.updateView(camera), false);
  assert.equal(batch.mesh.instanceMatrix.version, version); assert.equal(flora.plantView.stats.updates, updates);
});
check('Small pans reuse buffers, then refresh before leaving the padded view', () => {
  aim(4); flora.updateView(camera);
  const batch = flora.plantView.batches.get(pool), version = batch.mesh.instanceMatrix.version;
  aim(4.2);
  assert.equal(flora.updateView(camera), false);
  assert.equal(batch.mesh.instanceMatrix.version, version, 'no upload during a covered pan');
  aim(4.8);
  assert.equal(flora.updateView(camera), true, 'the margin boundary refreshes visibility');
});
check('Panning never changes a model batch\'s draw-order bounds', () => {
  aim(4); flora.updateView(camera);
  const sphere = flora.plantView.batches.get(pool).mesh.boundingSphere.clone();
  aim(70); flora.updateView(camera);
  assert.deepEqual(flora.plantView.batches.get(pool).mesh.boundingSphere, sphere);
});
check('Zoom and rotation invalidate a covered pan immediately', () => {
  aim(4); flora.updateView(camera);
  aim(4, Math.PI / 4 + .01); assert.equal(flora.updateView(camera), true);
  camera.left = -4.9; camera.updateProjectionMatrix();
  assert.equal(flora.updateView(camera), true);
  camera.left = -5; aim(4);
});
check('Panning and rotation immediately bring offscreen plants back with their original colours', () => {
  for (const az of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
    aim(70, az); flora.updateView(camera);
    const batch = flora.plantView.batches.get(pool), p = [...pool.subs.values()][1];
    assert.equal(batch.mesh.count, 1);
    assert.deepEqual(batch.mesh.instanceMatrix.array.slice(0, 16), p.mesh.instanceMatrix.array.slice(0, 16));
    assert.deepEqual(batch.mesh.instanceColor.array.slice(0, 3), p.mesh.instanceColor.array.slice(0, 3));
  }
});
check('Shadow-only meshes skip main-camera draws and restore every caster for the shadow pass', () => {
  for (const p of pool.subs.values()) {
    const s = p.viewShadow, count = s.count;
    s.onBeforeRender(); assert.equal(s.count, 0); s.onAfterRender(); assert.equal(s.count, count);
    s.onBeforeShadow(); assert.equal(s.count, count);
  }
});
check('Transparent plants preserve their separate region drawing order, then resume batching', () => {
  material.transparent = true; pool.setView(...pool.view); flora.updateView(camera);
  assert.equal(flora.plantView.batches.get(pool).mesh.visible, false);
  for (const p of pool.subs.values()) { assert.equal(p.mesh.parent, scene); assert.equal(p.viewShadow.visible, false); }
  material.transparent = false; pool.setView(...pool.view); flora.updateView(camera);
  assert.equal(flora.plantView.batches.get(pool).mesh.count, 1);
});
check('Disabling instance culling restores source meshes and complete shadow data', () => {
  flora.cullInstances = false; flora.updateView(camera);
  for (const p of pool.subs.values()) assert.equal(p.mesh.parent, scene);
  assert.equal(flora.plantView.batches.get(pool).mesh.visible, false);
  flora.cullInstances = true; flora.updateView(camera);
});
check('A rebuilt region invalidates visibility and removes old plant instances', () => {
  pool.begin(); pool.add(110, 0, 4, 1, 1, 1, 0, [.4, .5, .2]); pool.end(); flora.updateView(camera);
  assert.equal(flora.plantView.batches.get(pool).mesh.count, 0);
  aim(110); flora.updateView(camera); assert.equal(flora.plantView.batches.get(pool).mesh.count, 1);
});
function batchFixture() {
  const f = new Flora(new THREE.Scene(), { incremental: false });
  const make = key => f.pool(key, () => new THREE.BoxGeometry(1, 2, 1), material);
  const a = make('a'), b = make('b');
  const paint = (p, x, color = [.4, .5, .2]) => { p.begin(); p.add(x, 0, 4, 1, 1, 1, 0, color); p.end(); };
  paint(a, 4); paint(b, 4); aim(4); f.updateView(camera);
  return { f, a, b, paint };
}
check('A local edit uploads its model while other models keep their instance buffers', () => {
  const { f, a, b, paint } = batchFixture();
  const unchanged = f.plantView.batches.get(b).mesh.instanceMatrix.version;
  paint(a, 5); f.updateView(camera);
  assert.equal(f.plantView.batches.get(a).mesh.instanceMatrix.array[12], 5);
  assert.equal(f.plantView.batches.get(b).mesh.instanceMatrix.version, unchanged);
});
check('An offscreen edit to the same model does not upload its visible buffer', () => {
  const { f, a } = batchFixture();
  a.begin(); a.add(4, 0, 4, 1, 1, 1, 0, [.4, .5, .2]); a.add(70, 0, 4, 1, 1, 1, 0, [.4, .5, .2]); a.end();
  f.updateView(camera);
  const visible = f.plantView.batches.get(a).mesh.instanceMatrix.version;
  const source = [...a.subs.values()][1];
  source.begin(); source.add(71, 0, 4, 1, 1, 1, 0, [.4, .5, .2]); source.end();
  f.updateView(camera);
  assert.equal(f.plantView.batches.get(a).mesh.instanceMatrix.version, visible);
  aim(71); f.updateView(camera);
  assert.equal(f.plantView.batches.get(a).mesh.instanceMatrix.array[12], 71, 'panning reveals the edited source');
});
check('Colour-only edits and hidden grass update immediately inside a cached pan', () => {
  const { f, a, paint } = batchFixture();
  const batch = f.plantView.batches.get(a), before = batch.mesh.instanceColor.array.slice(0, 3);
  paint(a, 4, [.8, .2, .1]); aim(4.1); f.updateView(camera);
  assert.notDeepEqual(batch.mesh.instanceColor.array.slice(0, 3), before);
  const source = [...a.subs.values()][0]; source.kind = 'grass'; source.setView(0, false, true);
  f.updateView(camera); assert.equal(batch.mesh.count, 0); assert.equal(batch.mesh.visible, false);
});
check('Canopy-only revisions keep all ordinary plant batches intact', () => {
  const { f, a, b } = batchFixture();
  const versions = [a, b].map(p => f.plantView.batches.get(p).mesh.instanceMatrix.version);
  f.showCanopySites(new Set([{ geo: new THREE.BoxGeometry(1, 1, 1), transform: [4, 0, 4, 1, 1, 1, 0], color: [.4, .5, .2] }]));
  assert.equal(f.updateView(camera), false);
  assert.deepEqual([a, b].map(p => f.plantView.batches.get(p).mesh.instanceMatrix.version), versions);
});
check('The persistent animal ID index stays correct across movement, spawn, removal, replacement and load', () => {
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw'); const wl = g.wildlife;
  wl.agents = []; const ids = wl.ids;
  const a = wl.spawn(ANIMAL.deer, 30, 30, { silent: true }); a.wait = 100;
  assert.equal(ids.get(a.id), a);
  for (let k = 0; k < 20; k++) { wl.update(.01); assert.equal(wl.ids, ids); assert.equal(ids.get(a.id), a); }
  const b = wl.spawn(ANIMAL.deer, 31, 30, { silent: true });
  wl.remove(a, 'left'); assert.equal(ids.has(a.id), false); assert.equal(ids.get(b.id), b);
  const stored = wl.serialize(); wl.load(stored);
  assert.equal(wl.ids, ids); assert.equal(ids.get(b.id), wl.agents[0]);
  const keep = wl.agents; wl.agents = []; assert.equal(ids.size, 0);
  wl.agents = keep; assert.equal(ids.get(b.id), keep[0]);
  wl.agents = wl.agents.filter(a => a.id < b.id); wl.recount(); assert.equal(ids.size, 0);
});
console.log(`${checks} plant visibility and lookup-cache checks passed.`);
