// node tools/canopy-support-check.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Flora, floraVersion } = await import('../js/render3d/flora.js');
const { Actors } = await import('../js/render3d/actors.js');
const { focus } = await import('../js/render3d/focus.js');
const { Renderer } = await import('../js/render3d/scene.js');
const { canopyFixture } = await import('./canopy-support-fixture.mjs');
const right = new THREE.Vector3(1, 0, 0);
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function setup(map = 'amazon', key = 'howler', growth = 1, fast = false) {
  const f = canopyFixture(map, key, growth), scene = new THREE.Scene();
  const flora = new Flora(scene); flora.setLight(fast); flora.setZoom(.8); flora.rebuild(f.game, true);
  const actors = new Actors(scene, flora); actors.update(f.game, right, 1);
  return { ...f, flora, actors };
}
function dispose({ flora, actors }) {
  for (const p of flora.pools.values()) for (const s of p.subs.values()) s.dispose();
  for (const p of flora.canopyPools.values()) p.dispose();
  const geos = new Set();
  for (const v of flora.geos.values()) for (const g of [v, ...Object.values(v), ...Object.values(v.lo || {}), ...Object.values(v.mid || {})]) if (g?.isBufferGeometry) geos.add(g);
  for (const geo of geos) geo.dispose();
  for (const m of [flora.foliage, flora.shrubs, flora.grass, flora.tallGrass, flora.bark, flora.small, flora.contact, flora.canopyBark]) m.dispose();
  for (const p of actors.fauna.species.values()) { p.geo.dispose(); p.mat.dispose(); p.mesh.dispose(); }
  actors.shadows.dispose(); actors.shadowGeo.dispose(); actors.shadowMat.dispose(); actors.ring.geometry.dispose(); actors.ring.material.dispose();
}
check('All canopy primates, sloths and squirrels acquire real wood footing across growth and graphics settings', () => {
  for (const [map, key] of [['amazon', 'howler'], ['amazon', 'spider'], ['amazon', 'sloth'], ['chinandega', 'congo'], ['chinandega', 'capuchin'], ['sumatra', 'orangutan'], ['sumatra', 'siamang'], ['sumatra', 'langur'], ['atlanta', 'graysquirrel'], ['atlanta', 'flyingsquirrel']])
    for (const growth of [.55, 1]) for (const fast of [false, true]) {
      const f = setup(map, key, growth, fast), { a, actors, flora, game } = f;
      const st = actors.pose.get(a.id), anchor = st.branch, motion = actors.fauna.species.values().next().value.motion;
      assert.ok(anchor, `${map}/${key}: real branch`);
      assert.ok(Math.hypot(st.x - a.x, st.z - a.y) < .9, `${map}/${key}: stays in its crown`);
      const hold = new THREE.Vector3(motion.gripX || 0, motion.supportY, motion.gripZ || 0).applyMatrix4(actors.fauna.m);
      assert.ok(hold.distanceTo(anchor.point) < 1e-6, `${map}/${key}: feet/hand stay attached while tilted`);
      assert.equal(flora.canopyVisible.size, 1);
      assert.equal([...flora.treeSites.values()].filter(s => s.matrix).length, 1, 'unoccupied trees defer support preparation');
      const site = flora.treeSites.get(game.world.idx(40, 32));
      assert.equal(anchor.site, site); assert.equal(flora.canopyPools.get(site.geo).geo, site.geo);
      assert.deepEqual([a.x, a.y, a.state], [40.68, 32.44, 'idle']);
      const before = new THREE.Vector3(st.x, st.y, st.z), version = floraVersion.n;
      for (let k = 0; k < 20; k++) actors.update(game, right, 1 + k / 60);
      assert.ok(before.distanceTo(new THREE.Vector3(st.x, st.y, st.z)) < 1e-6, `${map}/${key}: stable at rest`);
      assert.equal(floraVersion.n, version, 'unchanged occupied trees do not invalidate shadow caches');
      dispose(f);
    }
});
check('Occupied wood remains opaque through both global transparency and selected-animal reveal', () => {
  const f = setup(); f.flora.setFade(true); focus.uFocusAmt.value = 1;
  assert.equal(f.flora.foliage.opacity, .28); assert.equal(f.flora.canopyBark.opacity, 1);
  assert.equal(f.flora.canopyBark.transparent, false); assert.equal(f.flora.canopyBark.depthWrite, true);
  const shader = { uniforms: {}, vertexShader: '', fragmentShader: '' };
  f.flora.canopyBark.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uFocus, undefined);
  f.flora.setFade(false); assert.equal(f.flora.foliage.opacity, 1); focus.uFocusAmt.value = 0; dispose(f);
});
check('Boundary hysteresis keeps the current tree until a climber reaches the next crown', () => {
  const f = setup(), { a, actors, game, flora } = f;
  const old = actors.pose.get(a.id).branch.site;
  a.x = 41.03; a.state = 'walk'; actors.update(game, right, 1.1);
  assert.equal(actors.pose.get(a.id).branch.site, old);
  a.x = 41.35; actors.update(game, right, 1.2);
  assert.equal(actors.pose.get(a.id).branch.site, flora.treeSites.get(game.world.idx(41, 32)));
  assert.equal(flora.canopyVisible.size, 1); dispose(f);
});
check('Cut trees, culled animals and removed animals leave no stale solid scaffold', () => {
  const f = setup(), { game, a, actors, flora } = f;
  game.world.clearPlants(game.world.idx(40, 32)); flora.rebuild(game); actors.update(game, right, 1.1);
  assert.equal(actors.pose.get(a.id).branch, null); assert.equal(flora.canopyVisible.size, 0);
  assert.ok([...flora.canopyPools.values()].every(p => p.mesh.count === 0));
  a.x = 41.5; actors.update(game, right, 1.2); assert.equal(flora.canopyVisible.size, 1);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 200);
  camera.position.set(90, 20, 90); camera.lookAt(90, 0, 90); camera.updateMatrixWorld();
  actors.update(game, right, 1.3, camera, 480); assert.equal(flora.canopyVisible.size, 0);
  actors.update(game, right, 1.4); assert.equal(flora.canopyVisible.size, 1);
  game.wildlife.agents = []; actors.update(game, right, 1.5); assert.equal(flora.canopyVisible.size, 0);
  dispose(f);
});
check('Moving follows branch routes smoothly and pausing freezes the current hold', () => {
  const f = setup(), { a, game, actors } = f; game.speed = 1; a.state = 'walk';
  let time = 1, jumps = 0;
  for (let k = 0; k < 80; k++) {
    const st = actors.pose.get(a.id), before = new THREE.Vector3(st.x, st.y, st.z);
    a.x += .009; time += 1 / 60; actors.update(game, right, time);
    assert.ok(before.distanceTo(new THREE.Vector3(st.x, st.y, st.z)) < .15, 'smooth rendered steps');
    if (st.branchRoute) jumps++;
  }
  assert.ok(jumps > 0, 'crossed a fork/crown');
  const point = actors.pose.get(a.id).branchPoint.clone();
  game.speed = 0; actors.update(game, right, time + 1 / 60);
  assert.ok(actors.pose.get(a.id).branchPoint.distanceTo(point) < 1e-6);
  dispose(f);
});
check('Locate, picking and reveal follow the branch-attached body rather than its simulation position', () => {
  const f = setup('sumatra', 'orangutan'), { actors, game, a } = f;
  const r = Object.create(Renderer.prototype);
  Object.assign(r, { world: game.world, actors, vw: 844, vh: 390, zoom: 2.2, az: Math.PI / 4, azTarget: Math.PI / 4,
    target: new THREE.Vector3(), frame: { x: .5, y: .5 }, v3: new THREE.Vector3(),
    camera: new THREE.OrthographicCamera(-1, 1, 1, -1, -300, 300), sun: new THREE.DirectionalLight() });
  r.centerOnAnimal(a); r.updateAnimalCamera(); r.updateFocus(game, 1);
  const st = actors.pose.get(a.id), p = r.project(st.center.x, st.center.y, st.center.z);
  assert.ok(Math.abs(p.x - 422) < 1e-6 && Math.abs(p.y - 195) < 1e-6);
  assert.equal(r.pickAgent(game, p.x, p.y), a);
  assert.ok(focus.uFocus.value.distanceTo(st.center) < 1e-6);
  focus.uFocusAmt.value = 0; dispose(f);
});
console.log(`${checks} canopy support checks passed.`);
