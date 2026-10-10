import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { CanopySite } = await import('../js/render3d/canopy-support.js');
const { canopyFixture } = await import('./canopy-support-fixture.mjs');
const { Flora } = await import('../js/render3d/flora.js');
const { Actors } = await import('../js/render3d/actors.js');
const { PLANT } = await import('../js/data/plants.js');
const { canopyStep } = await import('../js/render3d/canopy-motion.js');
const { easeAnimalTarget } = await import('../js/render3d/animal-camera.js');
const { siamangSwing } = await import('../js/render3d/siamang-swing.js');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function separation(p, wood) {
  const line = new THREE.Line3(wood.from, wood.to), t = line.closestPointToPointParameter(p, false), radial = p.distanceTo(line.at(t, new THREE.Vector3()));
  const radius = THREE.MathUtils.lerp(wood.r0, wood.r1, THREE.MathUtils.clamp(t, 0, 1));
  if (t < 0 || t > 1) return Math.hypot(Math.abs(t - THREE.MathUtils.clamp(t, 0, 1)) * wood.length, Math.max(0, radial - radius));
  return Math.max((radial - radius) / Math.hypot(1, (wood.r1 - wood.r0) / wood.length), -t * wood.length, (t - 1) * wood.length);
}
check('Thick, opposing main limbs route outside the trunk at the shared fork', () => {
  const geo = new THREE.BoxGeometry(.2, 2, .2);
  geo.userData.canopyTrunks = [{ from: [0, 0, 0], to: [0, 1.1, 0], r0: .18, r1: .15 }];
  geo.userData.canopyBranches = [{ from: [0, 1, 0], to: [-.8, 1.8, 0], r0: .15, r1: .06 },
    { from: [0, 1, 0], to: [.8, 1.8, 0], r0: .15, r1: .06 }];
  const site = new CanopySite(geo, [0, 0, 0, 1, 1, 1, 0]);
  for (const hanging of [false, true]) {
    const profile = { reach: .08, hanging }, from = site.endpoint(0, 1, profile), to = site.endpoint(1, 1, profile);
    const route = site.route(from, to); let before = from.point;
    for (const p of route) {
      assert.ok(p.distanceTo(before) < profile.reach * 2, 'successive holds remain within handover reach');
      for (let j = 0; j <= 5; j++) {
        const q = before.clone().lerp(p, j / 5);
        if (!hanging) for (const wood of site.wood) assert.ok(separation(q, wood) >= -.003, 'contact stays outside the wood between waypoints');
      }
      assert.ok(Math.min(...site.wood.map(b => Math.abs(separation(p, b)))) < .01, 'each hold touches the scaffold');
      before = p;
    }
  }
  geo.dispose();
});
check('Rendered primate torsos clear a real main-branch/trunk crossing, including the swinging body', () => {
  const failures = [];
  for (const key of ['spider', 'orangutan', 'siamang']) for (const growth of [.55, 1]) {
    const { game, a } = canopyFixture(key === 'spider' ? 'amazon' : 'sumatra', key, growth);
    // The young scaffold's main limbs cannot span a full adult orangutan's
    // grips (normal anchor selection rejects them); exercise a juvenile there.
    if (growth < .8 && key === 'orangutan') a.juvenile = true;
    for (const x of [40, 41]) game.world.setPlant(game.world.idx(x, 32), PLANT.fig, growth);
    a.x = 40.5; a.y = 32.5;
    const scene = new THREE.Scene(), flora = new Flora(scene); flora.rebuild(game, true);
    const actors = new Actors(scene, flora), site = flora.treeSites.get(game.world.idx(40, 32)); site.prepare();
    let target = 0;
    site.anchor = (x, z, previous, reach, hanging, body) => site.endpoint(target, 1, { reach, hanging, body });
    const right = new THREE.Vector3(1, 0, 0); actors.update(game, right, 1); game.speed = 1; target = 5;
    const pool = [...actors.fauna.species.values()][0], { geo, motion } = pool, positions = geo.attributes.position;
    let intersections = 0, worst = 0, maxTurn = 0;
    const previousRotation = new THREE.Quaternion(), renderedRotation = new THREE.Quaternion();
    actors.fauna.m.decompose(new THREE.Vector3(), previousRotation, new THREE.Vector3());
    for (let frame = 1; frame <= 900; frame++) {
      const st = actors.pose.get(a.id), before = st.branchPoint.clone();
      actors.update(game, right, 1 + frame / 60);
      assert.ok(st.branchPoint.distanceTo(before) < .07, 'no route teleport');
      const hold = new THREE.Vector3(motion.gripX || 0, motion.supportY, motion.gripZ || 0).applyMatrix4(actors.fauna.m);
      assert.ok(hold.distanceTo(st.branchPoint) < 1e-6, 'lean and turn keep the grip attached');
      actors.fauna.m.decompose(new THREE.Vector3(), renderedRotation, new THREE.Vector3());
      const turn = renderedRotation.angleTo(previousRotation);
      maxTurn = Math.max(maxTurn, turn);
      assert.ok(turn <= 1.5 / 60 + 1e-6, `${key}: rotation must stay within its gradual turn rate`);
      assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(renderedRotation).y >= -.00001, `${key}: no upside-down pose`);
      previousRotation.copy(renderedRotation);
      if (frame % 5) continue;
      const swing = key === 'siamang' ? siamangSwing(st.branchPhase, st.gait) : null;
      for (let i = 0; i < positions.count; i += 12) {
        if (!geo.userData.canopyCore.some(([start, end]) => i >= start && i < end)) continue;
        const p = new THREE.Vector3().fromBufferAttribute(positions, i);
        if (swing) p.sub(new THREE.Vector3(...swing.grip).multiplyScalar(motion.len))
          .applyAxisAngle(new THREE.Vector3(0, 0, 1), swing.sway).add(new THREE.Vector3(.14, 1.38, .02).multiplyScalar(motion.len));
        p.applyMatrix4(actors.fauna.m);
        for (const wood of site.wood) {
          const d = separation(p, wood);
          if (d < -.005) { intersections++; worst = Math.min(worst, d); }
        }
      }
    }
    console.log(`${key}, growth ${growth}: ${intersections} body intersections, deepest ${worst.toFixed(4)}, largest frame turn ${(maxTurn * 180 / Math.PI).toFixed(1)}°`);
    if (intersections) failures.push(`${key}, growth ${growth}: ${intersections}`);
    assert.equal(Boolean(actors.pose.get(a.id).branchRoute), false, `${key}, growth ${growth}: the smooth turn must finish its crossing`);
    const st = actors.pose.get(a.id), centre = st.center.clone(), roll = st.branchRoll, pitch = st.branchPitch, yaw = st.branchYaw;
    game.speed = 0;
    for (let frame = 1; frame <= 20; frame++) actors.update(game, right, 16 + frame / 60);
    assert.ok(st.center.distanceTo(centre) < 1e-8, 'pause freezes the body at the same hold');
    assert.deepEqual([st.branchRoll, st.branchPitch, st.branchYaw], [roll, pitch, yaw]);
  }
  assert.deepEqual(failures, [], 'torsos must not pass into the trunk or limbs');
});
check('Siamang handovers have a slow, bounded cadence at every game speed and frame rate', () => {
  const site = {}, def = { speed: 1, sprite: { kind: 'monkey', ape: true, len: 18 } };
  for (const fps of [15, 30, 60]) for (const speed of [1, 2, 3]) {
    const st = { sc: .02 }, game = { speed }, direction = new THREE.Vector3(1, 0, 0);
    const start = { site, index: 0, point: new THREE.Vector3(), direction };
    canopyStep(st, start, def, game, 0);
    const target = { ...start, point: new THREE.Vector3(2, 0, 0) };
    for (let frame = 1; frame <= fps * 3; frame++) {
      const phase = st.branchPhase;
      canopyStep(st, target, def, game, frame / fps);
      assert.ok(st.branchPhase - phase <= 2.8 / fps + 1e-8, 'a complete handover cycle takes at least 2.2 seconds');
    }
    const phase = st.branchPhase; game.speed = 0;
    canopyStep(st, target, def, game, 4);
    assert.equal(st.branchPhase, phase, 'pause also freezes the cadence');
  }
});
check('Animal follow camera eases torso shifts with a bounded speed and converges to a resting body', () => {
  for (const fps of [15, 30, 60]) {
    const target = new THREE.Vector3(), centre = new THREE.Vector3(.4, .3, -.2);
    for (let frame = 0; frame < fps * 3; frame++) {
      const before = target.clone(); easeAnimalTarget(target, centre, 1 / fps);
      assert.ok(target.distanceTo(before) <= 2.5 / fps + 1e-8, 'no camera snap after a handover');
    }
    assert.ok(target.distanceTo(centre) < .001);
    const before = target.clone(); easeAnimalTarget(target, new THREE.Vector3(10, 10, 10), .5);
    assert.ok(target.distanceTo(before) <= .25 + 1e-8, 'a dropped frame cannot jerk the camera across the map');
  }
});
console.log(`${checks} canopy route checks passed.`);
