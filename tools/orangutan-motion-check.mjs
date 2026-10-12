import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { canopyFixture } = await import('./canopy-support-fixture.mjs');
const { Flora } = await import('../js/render3d/flora.js');
const { Actors } = await import('../js/render3d/actors.js');
const { PLANT } = await import('../js/data/plants.js');
const { ANIMALS, drawDef, isMaleVariant } = await import('../js/data/animals.js');
const { bodyFitsWood } = await import('../js/render3d/wood-clearance.js');

const variants = [
  { name: 'adult', id: 4, growth: 1 },
  { name: 'flanged adult', id: 1, growth: 1 },
  { name: 'juvenile on young wood', id: 4, growth: .55, juvenile: true }
];
for (const variant of variants) for (const fps of [15, 60]) for (const mode of ['crown', 'fork']) {
  const { game, a } = canopyFixture('sumatra', 'orangutan', variant.growth);
  a.id = variant.id; a.juvenile = !!variant.juvenile;
  assert.equal(isMaleVariant(ANIMALS[a.sp], a), variant.name === 'flanged adult');
  for (const x of [40, 41]) game.world.setPlant(game.world.idx(x, 32), PLANT.fig, variant.growth);
  a.x = mode === 'fork' ? 40.5 : 40.35; a.y = 32.5; a.state = 'walk';
  const scene = new THREE.Scene(), flora = new Flora(scene); flora.rebuild(game, true);
  const actors = new Actors(scene, flora), site = flora.treeSites.get(game.world.idx(40, 32));
  site.prepare();
  const other = site.branches.findIndex((b, i) => i > 0 && b.from.distanceTo(site.branches[0].from) < .001);
  assert.ok(other > 0);
  let target = 0;
  if (mode === 'fork') site.anchor = (x, z, previous, reach, hanging, body) => site.endpoint(target, 1, { reach, hanging, body });
  const right = new THREE.Vector3(1, 0, 0); actors.update(game, right, 1); game.speed = 1;
  const st = actors.pose.get(a.id), mo = actors.fauna.motion(drawDef(ANIMALS[a.sp], a));
  let point = st.branchPoint.clone(), rotation = st.canopyQuaternion.clone(), lastDelta = new THREE.Vector3();
  let reversals = 0, rotationSum = 0, limbChanges = 0, finished = 0, lastLimb = st.branch.index;
  for (let frame = 1; frame <= fps * 30; frame++) {
    const time = 1 + frame / fps;
    target = Math.floor(time / 6) % 2 ? other : 0;
    if (mode === 'crown') {
      a.x = Math.min(41.65, a.x + .24 / fps); a.state = a.x < 41.65 ? 'walk' : 'idle';
    }
    const journey = st.branchRoute; actors.update(game, right, time);
    const delta = st.branchPoint.clone().sub(point), turn = st.canopyQuaternion.angleTo(rotation);
    if (delta.length() > .0001) {
      if (lastDelta.length() > .0001 && delta.dot(lastDelta) < 0) reversals++;
      lastDelta.copy(delta);
    }
    rotationSum += turn;
    assert.ok(turn <= 1 / fps + 1e-6, `${variant.name}: bounded body turn`);
    assert.ok(delta.length() < .07, `${variant.name}: no jump between holds`);
    assert.ok(!st.canopyForce, `${variant.name}: no forced step after a stall`);
    const wood = [...new Set([st.branchAt?.site, st.branchRoute?.fromSite, st.branch?.site])].filter(Boolean).flatMap(s => { s.prepare(); return s.wood; });
    assert.ok(bodyFitsWood({ motion: mo, scale: st.sc }, st.branchPoint, st.canopyQuaternion, wood), `${variant.name}: torso clears actual wood`);
    const euler = new THREE.Euler().setFromQuaternion(st.canopyQuaternion, 'YZX');
    assert.ok(Math.abs(euler.x) <= .3 + 1e-6, 'feet remain underneath the torso');
    if (st.branch.index !== lastLimb) { limbChanges++; lastLimb = st.branch.index; }
    if (journey && !st.branchRoute) finished++;
    point.copy(st.branchPoint); rotation.copy(st.canopyQuaternion);
  }
  // Include the long stationary interval: idle pose hunting used to add turns
  // even after reaching the target. Five commanded fork crossings allow real
  // direction changes, but must not add a full revolution of extra rotation.
  assert.ok(rotationSum < Math.PI * 2, `${variant.name}: excess rotation during ${mode}`);
  assert.ok(reversals <= (mode === 'crown' ? 0 : 12), `${variant.name}: repeated backtracking during ${mode}: ${reversals}`);
  assert.ok(limbChanges <= (mode === 'crown' ? 1 : 5), 'branch choice stays committed');
  assert.ok(finished >= (mode === 'crown' ? 1 : 4), 'crossings finish');
  assert.equal(Boolean(st.branchRoute), false, 'last route finishes');
  target = st.branchAt.index; a.state = 'idle';
  point.copy(st.branchPoint); rotation.copy(st.canopyQuaternion);
  for (let frame = 1; frame <= fps; frame++) actors.update(game, right, 31 + frame / fps);
  assert.ok(st.branchPoint.distanceTo(point) < 1e-8, 'rest holds the same bark contact');
  assert.ok(st.canopyQuaternion.angleTo(rotation) < 1e-7, 'rest does not hunt for a different orientation');
  game.speed = 0;
  for (let frame = 1; frame <= fps; frame++) actors.update(game, right, 32 + frame / fps);
  assert.ok(st.canopyQuaternion.angleTo(rotation) < 1e-7, 'pause freezes body orientation');
  console.log(`PASS ${variant.name}, ${fps} fps, ${mode}: ${Math.round(rotationSum * 180 / Math.PI)}° total turn, ${reversals} direction changes, ${finished} completed routes`);
  actors.clear();
}
console.log('12 orangutan movement scenarios passed.');
