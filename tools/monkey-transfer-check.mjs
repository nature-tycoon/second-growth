import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { canopyFixture } = await import('./canopy-support-fixture.mjs');
const { Flora } = await import('../js/render3d/flora.js');
const { Actors } = await import('../js/render3d/actors.js');
const { CanopySite } = await import('../js/render3d/canopy-support.js');
const { canopyStep } = await import('../js/render3d/canopy-motion.js');
const { PLANT } = await import('../js/data/plants.js');
const { ANIMALS } = await import('../js/data/animals.js');
const { climbPace } = await import('../js/sim/climb-pace.js');
const { SPEEDS } = await import('../js/config.js');
const { bodyFitsWood, woodDistance } = await import('../js/render3d/wood-clearance.js');

let scenarios = 0;
for (const [map, key, tree, receivingTree = tree] of [
  ['amazon', 'howler', 'fig'], ['amazon', 'spider', 'fig'], ['sumatra', 'langur', 'meranti'], ['chinandega', 'congo', 'guanacaste'],
  ['sumatra', 'langur', 'meranti', 'oilpalm'], ['sumatra', 'langur', 'oilpalm', 'meranti'], ['amazon', 'spider', 'fig', 'buriti']
]) {
  for (const fps of [15, 60]) for (const reverse of [false, true]) {
    const { game, a } = canopyFixture(map, key, reverse ? 1 : .3);
    game.world.setPlant(game.world.idx(40, 32), PLANT[tree], reverse ? 1 : .3);
    game.world.setPlant(game.world.idx(41, 32), PLANT[receivingTree], reverse ? .3 : 1);
    a.x = 40.5; a.y = 32.5;
    const scene = new THREE.Scene(), flora = new Flora(scene); flora.rebuild(game, true);
    const actors = new Actors(scene, flora), right = new THREE.Vector3(1, 0, 0);
    actors.update(game, right, 1);
    const st = actors.pose.get(a.id), mo = actors.fauna.species.values().next().value.motion;
    game.speed = 1; a.x = 41.35; a.state = 'walk'; actors.update(game, right, 1.1);
    const route = st.branchRoute;
    assert.ok(route && !route.blocked, `${key}: height mismatch still has a usable transfer`);
    const launch = route.points[route.gap - 1], catchPoint = route.points[route.gap];
    const size = mo.len * st.sc;
    assert.ok(Math.hypot(catchPoint.x - launch.x, catchPoint.z - launch.z) <= Math.max(.65, Math.min(1.4, size * 5)) + 1e-8, 'jump stays within a moderate sideways span');
    assert.ok(catchPoint.y - launch.y <= Math.max(.08, size * 1.2) + 1e-8, 'cannot leap upward into a distant crown');
    assert.ok(launch.y - catchPoint.y <= Math.max(.3, size * 4) + 1e-8, 'large height losses require descending the old wood first');
    if (!reverse && tree === receivingTree) assert.notEqual(route.landingTrunk, null, 'short-to-tall travel catches the receiving trunk');
    if (route.landingTrunk != null) {
      const trunk = route.target.site.trunks[route.landingTrunk];
      assert.ok(Math.abs(woodDistance(catchPoint, trunk)) < .01, 'catch point lies on actual trunk bark');
      if (!reverse && tree === receivingTree) assert.ok(route.target.point.y - catchPoint.y > size, 'the receiving crown is reached by climbing after the catch');
      for (let i = route.gap + 1; i < route.points.length; i++) {
        const point = route.points[i];
        assert.ok(Math.min(...route.target.site.wood.map(wood => Math.abs(woodDistance(point, wood)))) < .015, 'climb after landing follows real wood');
      }
    }
    let flightFrames = 0, paused = false, caught = false, finished = false, finishTime = null;
    for (let frame = 1; frame <= fps * 40; frame++) {
      const time = 1.1 + frame / fps, before = st.branchPoint.clone();
      actors.update(game, right, time);
      const maxStep = climbPace(ANIMALS[a.sp]) * SPEEDS[1] * (st.catchUp || 1) * 2.6 / fps;
      assert.ok(st.branchPoint.distanceTo(before) <= maxStep + 1e-8, 'takeoff, catch and climb stay within the frame movement budget');
      if (st.canopyLeap?.t > 0 && st.canopyLeap.t < 1) {
        flightFrames++;
        assert.ok(st.gripFeet.every(foot => foot.free && !foot.site), 'all contacts release in flight');
        if (!reverse) {
          const bodyPoint = st.branchPoint.clone(); bodyPoint.y += st.canopyLeap.lift;
          assert.ok(bodyFitsWood({ motion: mo, scale: st.sc }, bodyPoint, st.canopyQuaternion,
            route.target.site.wood), `${key}: flying torso clears the receiving trunk`);
        }
        if (!paused && st.canopyLeap.t > .3 && st.canopyLeap.t < .7) {
          const center = st.center.clone(), rotation = st.canopyQuaternion.clone(), phase = st.canopyLeap.t;
          game.speed = 0; actors.update(game, right, time);
          assert.ok(st.center.distanceTo(center) < 1e-8, 'pause holds the airborne body');
          assert.ok(st.canopyQuaternion.angleTo(rotation) < 1e-7, 'pause holds the catch pose');
          assert.equal(st.canopyLeap.t, phase);
          if (key === 'spider' && tree === receivingTree && !reverse && fps === 60) {
            const point = st.branchPoint.clone();
            game.world.treeG[game.world.idx(41, 32)] = .999;
            flora.rebuild(game, true); actors.update(game, right, time);
            assert.equal(st.branchRoute, route, 'a rebuilt tree preserves the planned trunk catch');
            assert.ok(st.branchPoint.distanceTo(point) < .025, 'routine growth does not snap the airborne hold');
            assert.equal(route.target.site, flora.treeSites.get(game.world.idx(41, 32)), 'climb continues on the rebuilt receiving trunk');
          }
          game.speed = 1; paused = true;
        }
      }
      for (let i = 0; i < 4; i++) {
        const local = mo.canopyFeet[i].clone().add(st.gripOffsets[i]);
        assert.ok(local.distanceTo(mo.canopyJoints[i]) <= mo.canopyFeet[i].distanceTo(mo.canopyJoints[i]) * 1.08 + 1e-7, 'catching limbs never stretch');
      }
      caught ||= st.gripFeet.some(foot => !foot.free && foot.site === route.target.site);
      if (!st.branchRoute) { finished = true; finishTime ??= time; }
      if (finishTime && time - finishTime > 1 && caught) break;
    }
    assert.ok(flightFrames && paused, 'exercises a visible leap and paused catch pose');
    assert.ok(caught && finished, `${key}: catches receiving bark and completes the climb`);
    assert.equal(st.canopyLeap, null, 'landing clears flight state');
    assert.equal(st.branchAt.site, route.target.site);
    actors.clear(); scenarios++;
    console.log(`PASS ${key}, ${tree} to ${receivingTree}, ${fps} fps, ${reverse ? 'tall to small' : 'small to tall'}: ${(launch.distanceTo(catchPoint)).toFixed(2)}-tile jump, bark caught, climb completed`);
  }
}

// A genuinely separated pair of trunks must not fall back to a huge leap or
// walk across empty air when no candidate meets the transfer limits.
const geo = new THREE.BoxGeometry(.1, 1.4, .1);
geo.userData.canopyTrunks = [{ from: [0, 0, 0], to: [0, 1, 0], r0: .07, r1: .05 }];
geo.userData.canopyBranches = [{ from: [0, 1, 0], to: [.3, 1.15, 0], r0: .05, r1: .02 }];
const source = new CanopySite(geo, [0, 0, 0, 1, 1, 1, 0]);
const destination = new CanopySite(geo, [2.6, 0, 0, 1, 1, 1, 0]);
const from = source.endpoint(0, 1), to = destination.endpoint(0, 1);
const st = { sc: .02 }, def = { key: 'langur', speed: 1, sprite: { kind: 'monkey', len: 20 } }, game = { speed: 1 };
canopyStep(st, from, def, game, 0);
for (let frame = 1; frame <= 60; frame++) {
  const motion = canopyStep(st, to, def, game, frame / 20);
  assert.ok(st.branchRoute?.blocked, 'unreachable gap waits for a usable destination');
  assert.ok(st.branchPoint.distanceTo(from.point) < 1e-10, 'no fallback glide across an unreachable gap');
  assert.equal(st.canopyLeap, null); assert.equal(motion.lift, 0);
}
geo.dispose();

for (const fps of [15, 60]) for (const speed of [1, 2, 3]) {
  const direction = new THREE.Vector3(1, 0, 0), a = { site: {}, index: 0, point: new THREE.Vector3(), direction };
  const b = { ...a, site: {}, point: new THREE.Vector3(1, 0, 0) };
  a.point.canopyPose = new THREE.Quaternion();
  b.point.canopyPose = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.2);
  const pose = { sc: .02, canopyQuaternion: new THREE.Quaternion() }, game = { speed };
  canopyStep(pose, a, def, game, 0);
  pose.branchRoute = { points: [a.point, b.point], sites: [a.site, b.site], gap: 1, cursor: 1, target: b, landingTrunk: 0, trunkTransfer: true };
  let landingTime = 0, phase = 0;
  const catchTime = .9 * SPEEDS[1] / SPEEDS[speed];
  for (let frame = 1; frame <= fps * 3 && pose.branchRoute; frame++) {
    canopyStep(pose, b, def, game, frame / fps);
    if (pose.canopyLeap) {
      assert.ok(pose.canopyLeap.t >= phase && pose.canopyLeap.t - phase <= 1 / (catchTime * fps) + 1e-8, 'trunk-catch progress follows the selected game speed continuously');
      phase = pose.canopyLeap.t;
    }
    landingTime = frame / fps;
  }
  assert.ok(!pose.branchRoute && landingTime >= catchTime - 1e-8 && landingTime < 3, 'trunk catch has time to turn without falling behind game time');
}
console.log(`${scenarios} height-mismatch transfers, tree rebuilds, unreachable gaps and fast-game trunk catches passed.`);
