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
const { orangutanHold, orangutanSwing, orangutanSwingPose } = await import('../js/render3d/orangutan-swing.js');
const { canopyStep } = await import('../js/render3d/canopy-motion.js');
const { climbPace } = await import('../js/sim/climb-pace.js');
const { SPEEDS } = await import('../js/config.js');

const paceDef = { key: 'orangutan', speed: .8, sprite: { kind: 'orangutan', len: 22 } };
const paceGame = { speed: 1 }, paceDirection = new THREE.Vector3(1, 0, 0);
const paceStart = { site: {}, index: 0, point: new THREE.Vector3(), direction: paceDirection };
const paceEnd = { ...paceStart, site: {}, point: new THREE.Vector3(1, 0, 0) };
const budget = climbPace(paceDef) * SPEEDS[1] * .1;
for (const t of [.15, .3, .5, .63, .8]) {
  const st = { sc: .02, canopyQuaternion: new THREE.Quaternion() };
  canopyStep(st, paceStart, paceDef, paceGame, 0);
  st.branchPoint.x = t;
  st.branchRoute = { points: [paceStart.point.clone(), paceEnd.point.clone()], gap: 1, cursor: 1, swingable: true, target: paceEnd };
  canopyStep(st, paceEnd, paceDef, paceGame, .1);
  const expected = t === .3 ? .35 + (budget - (.35 - t) / 1.1) * .55
    : t === .63 ? .65 + (budget - (.65 - t) / .55) * 1.1
    : t + budget * (t < .35 || t >= .65 ? 1.1 : .55);
  assert.ok(Math.abs(st.branchPoint.x - expected) < 1e-10, 'entering and leaving the swing are quicker; the handover keeps its original pace');
}

const transfer = { gap: 1, cursor: 1, points: [new THREE.Vector3(), new THREE.Vector3(1, 0, 0)] };
for (let i = 0; i <= 1000; i++) {
  const swing = orangutanSwing(transfer, new THREE.Vector3(i / 1000, 0, 0));
  assert.ok(swing.left === 1 || swing.right === 1, 'receiving hand catches before the supporting hand releases');
  if (i === 0 || i === 1000) {
    assert.equal(swing.blend, 0, 'walking pose at each end of the crossing');
    assert.ok(new THREE.Vector3(...swing.grip).distanceTo(new THREE.Vector3(0, -.015, 0)) < 1e-10);
  }
}
assert.equal(orangutanSwing({ ...transfer, gap: -1 }, new THREE.Vector3()), null, 'same-tree routes never swing');
assert.equal(orangutanSwing({ ...transfer, swingable: false }, new THREE.Vector3(.5, 0, 0)), null, 'crowded crossings retain their clambering gait');
for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
  const end = new THREE.Vector3(Math.cos(heading), .2, Math.sin(heading));
  const from = new THREE.Vector3();
  from.canopyPose = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -heading + Math.PI);
  end.canopyPose = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -heading + Math.PI / 2);
  const route = { ...transfer, points: [from, end] };
  const pose = orangutanSwingPose(route, from.clone().lerp(end, .5));
  const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(pose);
  assert.ok(forward.dot(new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading))) > .999, 'swing faces the next tree despite sideways or backward branch poses');
  assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(pose).y > .999, 'hanging torso stays upright');
}

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
  let swingFrames = 0, leftSupports = 0, rightSupports = 0, pausedSwing = false;
  for (let frame = 1; frame <= fps * 30; frame++) {
    const time = 1 + frame / fps;
    target = Math.floor(time / 6) % 2 ? other : 0;
    if (mode === 'crown') {
      a.x = Math.min(41.65, a.x + .24 / fps); a.state = a.x < 41.65 ? 'walk' : 'idle';
    }
    const journey = st.branchRoute, wasTransitioning = st.orangutanSwing && (st.orangutanSwing.t < .35 || st.orangutanSwing.t >= .65); actors.update(game, right, time);
    assert.equal(st.canopyLeap, null, 'orangutans never use the monkey leap arc');
    if (st.orangutanSwing?.blend > .5) {
      if (st.orangutanSwing.blend > .9) swingFrames++;
      if (st.orangutanSwing.left === 1 && st.orangutanSwing.right < .1) leftSupports++;
      if (st.orangutanSwing.right === 1) rightSupports++;
      if (st.orangutanSwing.blend > .9) {
        assert.ok(st.center.y < st.branchPoint.y, 'torso hangs below the supporting hand during the crossing');
        const route = st.branchRoute, heading = route.points[route.gap].clone().sub(route.points[route.gap - 1]);
        const facing = new THREE.Vector3(1, 0, 0).applyQuaternion(st.canopyQuaternion);
        heading.y = facing.y = 0;
        assert.ok(heading.normalize().dot(facing.normalize()) > .95, `${variant.name}: arm swings point along the crossing`);
      }
      if (!pausedSwing) {
        const centre = st.center.clone(), phase = st.orangutanSwing.phase, blend = st.orangutanSwing.blend;
        game.speed = 0; actors.update(game, right, time);
        assert.ok(st.center.distanceTo(centre) < 1e-8, 'pause freezes the hanging body');
        assert.equal(st.orangutanSwing.phase, phase); assert.equal(st.orangutanSwing.blend, blend);
        game.speed = 1; pausedSwing = true;
      }
    }
    const delta = st.branchPoint.clone().sub(point), turn = st.canopyQuaternion.angleTo(rotation);
    if (delta.length() > .0001) {
      if (lastDelta.length() > .0001 && delta.dot(lastDelta) < 0) reversals++;
      lastDelta.copy(delta);
    }
    rotationSum += turn;
    const transitioning = st.orangutanSwing && (st.orangutanSwing.t < .35 || st.orangutanSwing.t >= .65);
    const turnRate = wasTransitioning || transitioning ? 2.4 : 1;
    assert.ok(turn <= turnRate / fps + 1e-6, `${variant.name}: bounded body turn, with quicker transitions`);
    assert.ok(delta.length() < .07, `${variant.name}: no jump between holds`);
    assert.ok(!st.canopyForce, `${variant.name}: no forced step after a stall`);
    const wood = [...new Set([st.branchAt?.site, st.branchRoute?.fromSite, st.branch?.site])].filter(Boolean).flatMap(s => { s.prepare(); return s.wood; });
    const hold = orangutanHold(st, mo, new THREE.Vector3());
    assert.ok(bodyFitsWood({ motion: { ...mo, gripX: hold.x, supportY: hold.y, gripZ: hold.z }, scale: st.sc }, st.branchPoint, st.canopyQuaternion, wood), `${variant.name}: torso clears actual wood`);
    const euler = new THREE.Euler().setFromQuaternion(st.canopyQuaternion, 'YZX');
    assert.ok(Math.abs(euler.x) <= .3 + 1e-6, 'feet remain underneath the torso');
    if (st.branch.index !== lastLimb) { limbChanges++; lastLimb = st.branch.index; }
    if (journey && !st.branchRoute) finished++;
    point.copy(st.branchPoint); rotation.copy(st.canopyQuaternion);
  }
  // A crown transfer now visits tips with room for the hanging torso, adding
  // approach bends. Keep total turning bounded, including the long idle period.
  assert.ok(rotationSum < Math.PI * (mode === 'crown' ? 3 : 2), `${variant.name}: excess rotation during ${mode}`);
  assert.ok(reversals <= (mode === 'crown' ? 4 : 12), `${variant.name}: repeated backtracking during ${mode}: ${reversals}`);
  assert.ok(limbChanges <= (mode === 'crown' ? 1 : 5), 'branch choice stays committed');
  assert.ok(finished >= (mode === 'crown' ? 1 : 4), 'crossings finish');
  assert.equal(Boolean(st.branchRoute), false, 'last route finishes');
  assert.equal(st.orangutanSwing, null, 'returns to the normal branch gait after landing');
  if (mode === 'crown' && swingFrames) assert.ok(leftSupports && rightSupports && pausedSwing, 'both arms support the crossing, including a paused handover');
  else if (mode === 'crown') assert.ok(variant.growth < 1, 'only the crowded young scaffold needs a clambering fallback');
  else assert.equal(swingFrames, 0, 'ordinary travel on one tree keeps the walking gait');
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
