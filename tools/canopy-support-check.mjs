// node tools/canopy-support-check.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Flora, floraVersion } = await import('../js/render3d/flora.js');
const { Actors } = await import('../js/render3d/actors.js');
const { focus } = await import('../js/render3d/focus.js');
const { canopyTile } = await import('../js/render3d/canopy-support.js');
const { PLANTS, PLANT } = await import('../js/data/plants.js');
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
  for (const m of [flora.foliage, flora.shrubs, flora.grass, flora.tallGrass, flora.bark, flora.small, flora.contact, flora.canopyBark, flora.canopyCrown]) m.dispose();
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
check('Monkeys on palms retain a solid leafy crown through tree transparency and animal reveal', () => {
  for (const [map, key, plant] of [['amazon', 'howler', 'acai'], ['amazon', 'spider', 'buriti'], ['sumatra', 'langur', 'oilpalm']]) for (const fast of [false, true]) {
    const f = setup(map, key, 1, fast), { game, flora, actors, a } = f;
    for (const x of [40, 41]) game.world.setPlant(game.world.idx(x, 32), PLANT[plant], 1);
    flora.rebuild(game, true); actors.pose.clear(); actors.update(game, right, 1);
    const site = actors.pose.get(a.id).branch.site, crown = flora.canopyPools.get(site.crown.geo), wood = flora.canopyPools.get(site.geo);
    assert.equal(crown.mesh.count, 1, `${plant}: occupied crown is rendered`);
    assert.deepEqual([...crown.mesh.instanceMatrix.array.slice(0, 16)], [...wood.mesh.instanceMatrix.array.slice(0, 16)], 'leaves share the supporting trunk transform');
    flora.setFade(true); focus.uFocusAmt.value = 1;
    assert.equal(crown.mat.opacity, 1); assert.equal(crown.mat.transparent, false); assert.equal(crown.mat.depthWrite, true);
    const shader = { uniforms: {}, vertexShader: '#include <project_vertex>', fragmentShader: '#include <clipping_planes_fragment>\n#include <dithering_fragment>' };
    crown.mat.onBeforeCompile(shader);
    assert.equal(shader.uniforms.uFocusFoot, focus.uFocusFoot);
    assert.ok(shader.fragmentShader.includes('keep = vFocusW.y <= uFocusFoot + 0.02;'), 'reveal retains leaves below the feet');
    assert.ok(shader.fragmentShader.includes('across < r && !keep) discard'), 'higher leaves still reveal the animal');
    assert.notEqual(crown.mat.customProgramCacheKey(), flora.foliage.customProgramCacheKey(), 'support crown compiles its own reveal shader');
    focus.uFocusAmt.value = 0; dispose(f);
  }
});
check('Boundary hysteresis keeps the current tree until a climber reaches the next crown', () => {
  const f = setup(), { a, actors, game, flora } = f;
  const old = actors.pose.get(a.id).branch.site;
  a.x = 41.03; a.state = 'walk'; actors.update(game, right, 1.1);
  assert.equal(actors.pose.get(a.id).branch.site, old);
  a.x = 41.35; actors.update(game, right, 1.2);
  assert.equal(actors.pose.get(a.id).branch.site, flora.treeSites.get(game.world.idx(41, 32)));
  assert.ok(flora.canopyVisible.has(old), 'the paused contacts retain their original supporting tree');
  assert.ok(flora.canopyVisible.has(actors.pose.get(a.id).branch.site), 'the new destination scaffold is also visible'); dispose(f);
});
check('Small spacing nudges keep a resting monkey on the same limb', () => {
  const f = setup('amazon', 'spider'), { a, actors, game } = f;
  const limb = actors.pose.get(a.id).branch.index;
  game.speed = 1;
  for (let frame = 1; frame <= 180; frame++) {
    a.x = 40.68 + Math.sin(frame * 1.7) * .03; a.y = 32.44 + Math.cos(frame * 2.1) * .03;
    actors.update(game, right, 1 + frame / 60);
    assert.equal(actors.pose.get(a.id).branch.index, limb, 'spacing cannot trigger a fork crossing');
    assert.equal(actors.pose.get(a.id).branchRoute, null);
  }
  dispose(f);
});
check('Surrounding forest supplies solid branch attachments across the property boundary and cleans up after edits', () => {
  const f = setup(), { game, a, actors, flora } = f, w = game.world, border = game.border;
  const plant = PLANTS[w.tree[w.idx(40, 32)]], bi = border.bi(40, -1);
  w.setPlant(w.idx(40, 0), plant, 1); border.tree[bi] = plant.id; border.treeG[bi] = 1;
  flora.rebuild(game); a.x = 40.68; a.y = -.6;
  actors.pose.clear(); actors.update(game, right, 1);
  const key = canopyTile(w, border, 40, -1), st = actors.pose.get(a.id);
  assert.ok(key < 0 && st.branch.site === flora.treeSites.get(key), 'outside trees use their own support');
  assert.ok(flora.canopyVisible.has(st.branch.site), 'the actual outside scaffold stays visible');
  const mo = actors.fauna.species.values().next().value.motion;
  const hold = new THREE.Vector3(mo.gripX || 0, mo.supportY, mo.gripZ || 0).applyMatrix4(actors.fauna.m);
  assert.ok(hold.distanceTo(st.branchPoint) < 1e-6, 'outside feet attach to the wood');
  game.speed = 1; a.state = 'walk';
  for (let frame = 1; frame <= 600; frame++) {
    const before = st.center.clone(); a.y = Math.min(.5, a.y + .004);
    actors.update(game, right, 1 + frame / 60);
    assert.ok(st.center.distanceTo(before) < .15, 'crossing the boundary does not drop the body to the ground');
  }
  assert.equal(st.branch.site.tile, w.idx(40, 0));
  border.tree[bi] = 0; flora.rebuild(game);
  assert.equal(flora.treeSites.has(key), false, 'incremental border edits remove stale supports');
  dispose(f);
});
check('Cached plant replays preserve inside and border tree holds while paused', () => {
  for (const outside of [false, true]) {
    const f = setup('amazon', 'sloth'), { game, a, actors, flora } = f, w = game.world, border = game.border;
    const plant = PLANTS[w.tree[w.idx(40, 32)]], z = outside ? -1 : 32;
    if (outside) {
      const bi = border.bi(40, z); border.tree[bi] = plant.id; border.treeG[bi] = 1;
      flora.rebuild(game); a.y = -.6; actors.pose.clear(); actors.update(game, right, 1);
    }
    const key = canopyTile(w, border, 40, z), st = actors.pose.get(a.id), old = flora.treeSites.get(key);
    assert.ok(flora.tileCache.some(record => record?.site === old), 'support is recorded with its plant tile');
    const point = st.branchPoint.clone(), centre = st.center.clone(), pose = st.canopyQuaternion.clone();
    if (outside) {
      const bi = border.bi(45, z); border.tree[bi] = plant.id; border.treeG[bi] = 1;
    } else w.setPlant(w.idx(45, z), plant, 1);
    flora.rebuild(game);
    assert.ok(flora.lastRebuild.worked < flora.lastRebuild.tiles, 'unchanged tiles are replayed from cache');
    const live = flora.treeSites.get(key);
    assert.ok(live && live !== old && live.geo === old.geo, 'replay recreates the same supporting scaffold');
    assert.equal(live.crown, old.crown, 'cached rebuild retains the supporting leaves and seasonal color');
    assert.equal(live.tile, key); assert.deepEqual(live.cell, [40, z]);
    assert.deepEqual(live.transform, old.transform);
    actors.update(game, right, 1.1);
    assert.equal(st.branch.site, live, 'paused animal follows the replacement site');
    assert.ok(st.branchPoint.distanceTo(point) < 1e-8 && st.center.distanceTo(centre) < 1e-8, 'no hold or body jump during a cached rebuild');
    assert.ok(st.canopyQuaternion.angleTo(pose) < 1e-7, 'paused body orientation is preserved');
    dispose(f);
  }
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
