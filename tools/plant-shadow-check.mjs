import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Flora, floraVersion } = await import('../js/render3d/flora.js');
const { Renderer } = await import('../js/render3d/scene.js');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const scene = new THREE.Scene(), flora = new Flora(scene), material = new THREE.MeshLambertMaterial({ vertexColors: true });
const pool = flora.pool('fixture', () => new THREE.BoxGeometry(1, 2, 1).toNonIndexed(), material);
const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, .01, 300), light = new THREE.DirectionalLight(); light.castShadow = true;
light.position.set(4, 50, 4); light.target.position.set(4, 0, 4); scene.add(light, light.target);
Object.assign(light.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 100 }); light.shadow.camera.updateProjectionMatrix();
camera.position.set(4, 12, 16); camera.lookAt(4, 0, 4); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
function plants(xs, col = [.4,.6,.3]) { pool.begin(); for (const x of xs) pool.add(x, 0, 4, 1, 1, 1, 0, col); pool.end(); }
function renderState() { flora.syncShadows(); flora.updateView(camera); flora.updateShadows(light, camera); }
plants([4, 16, 110]); renderState();
check('The shadow batch keeps an off-camera caster and excludes only trees outside the sun frustum', () => {
  assert.equal(flora.plantView.batches.get(pool).mesh.count, 1);
  const batch = flora.plantShadows.batches.get(pool); assert.equal(batch.mesh.count, 2); assert.ok(batch.mesh.geometry.index);
  const source = [...pool.subs.values()][0]; assert.deepEqual(batch.mesh.instanceMatrix.array.slice(0, 32), source.mesh.instanceMatrix.array.slice(0, 32));
  batch.mesh.onBeforeRender(); assert.equal(batch.mesh.count, 0); batch.mesh.onAfterRender(); assert.equal(batch.mesh.count, 2);
});
check('Unchanged casters reuse their packed matrices even when the shadow map is refreshed', () => {
  const batch = flora.plantShadows.batches.get(pool), version = batch.mesh.instanceMatrix.version, revision = flora.plantShadows.version;
  renderState(); assert.equal(batch.mesh.instanceMatrix.version, version); assert.equal(flora.plantShadows.version, revision);
});
check('Grass, colours and distant source edits do not invalidate the cached shadow map', () => {
  const revision = flora.plantShadows.version;
  const grass = flora.pool('grass-fixture', () => new THREE.BoxGeometry(), material, { shadow: false }); grass.begin(); grass.add(4,0,4,1,1,1,0,[1,1,1]); grass.end(); flora.syncShadows();
  assert.equal(flora.plantShadows.version, revision);
  plants([4, 16, 150], [.7,.2,.1]); flora.syncShadows(); assert.equal(flora.plantShadows.version, revision);
});
check('A changed visible caster invalidates its shadow and updates the packed transform', () => {
  const revision = flora.plantShadows.version; plants([5,16,150]); flora.syncShadows(); assert.ok(flora.plantShadows.version > revision);
  renderState(); assert.equal(flora.plantShadows.batches.get(pool).mesh.instanceMatrix.array[12], 5);
});
check('Removing and restoring all casters cannot reuse an old shadow batch', () => {
  plants([]); renderState(); assert.equal(flora.plantShadows.batches.get(pool).mesh.visible, false);
  plants([6]); renderState(); const mesh = flora.plantShadows.batches.get(pool).mesh; assert.equal(mesh.count, 1); assert.equal(mesh.instanceMatrix.array[12], 6);
});
check('Disabling and restoring the optimizations retains full source shadows and releases neither source buffer', () => {
  flora.setOptimizations({ indexedGeometry: false, cullShadows: false }); flora.syncShadows(); flora.updateView(camera);
  const source = [...pool.subs.values()][0]; assert.equal(source.mesh.geometry, source.geo); assert.ok(source.viewShadow.visible); assert.equal(source.viewShadow.count, 1);
  flora.setOptimizations({ indexedGeometry: true, cullShadows: true }); renderState(); assert.ok(flora.plantShadows.batches.get(pool).mesh.visible); assert.equal(source.viewShadow.visible, false);
});
check('Depth materials with alpha or custom behavior retain the original shadow path', () => {
  // (a material change is announced by whoever makes it, as Flora.setFade does: redrawing the same plants no longer bumps the plant version)
  material.alphaTest = .5; floraVersion.n++; plants([6]); renderState(); const source = [...pool.subs.values()][0]; assert.equal(source.packedShadows, false); assert.ok(source.viewShadow.visible);
  material.alphaTest = 0; floraVersion.n++; plants([6]); renderState(); assert.equal(source.packedShadows, true);
});
check('Shadow refresh still responds to camera motion, edits, sun motion, map loss and shadow settings', () => {
  const stub = { camera, sun: light, flora, terrain: { banks: { version: 0 } }, gl: { shadowMap: {} }, shadowRedraws: 0 };
  light.shadow.map = {}; assert.equal(Renderer.prototype.shadowsStale.call(stub), true); assert.equal(Renderer.prototype.shadowsStale.call(stub), false);
  camera.position.x++; assert.equal(Renderer.prototype.shadowsStale.call(stub), true);
  stub.terrain.banks.version++; assert.equal(Renderer.prototype.shadowsStale.call(stub), true);
  light.position.x += 5; assert.equal(Renderer.prototype.shadowsStale.call(stub), true);
  light.castShadow = false; assert.equal(Renderer.prototype.shadowsStale.call(stub), false); light.castShadow = true; assert.equal(Renderer.prototype.shadowsStale.call(stub), true);
  light.shadow.map = null; assert.equal(Renderer.prototype.shadowsStale.call(stub), true);
});
flora.geometryIndex.dispose(); flora.plantShadows.dispose();
console.log(`${checks} plant shadow checks passed.`);
