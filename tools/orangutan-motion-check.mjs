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
const { orangutanReverse } = await import('../js/render3d/orangutan-motion.js');
const { canopyLean } = await import('../js/render3d/canopy-pose.js');
const { woodDistance } = await import('../js/render3d/wood-clearance.js');
const { canopyStep, settleCanopyStep } = await import('../js/render3d/canopy-motion.js');
const { climbPace } = await import('../js/sim/climb-pace.js');
const { SPEEDS } = await import('../js/config.js');
const { faunaMaterial } = await import('../js/render3d/fauna.js');

const paceDef = { key: 'orangutan', speed: .8, sprite: { kind: 'orangutan', len: 22 } };
const paceGame = { speed: 1 }, paceDirection = new THREE.Vector3(1, 0, 0);
const paceStart = { site: {}, index: 0, point: new THREE.Vector3(), direction: paceDirection };
const paceEnd = { ...paceStart, site: {}, point: new THREE.Vector3(1, 0, 0) };
const budget = climbPace(paceDef) * SPEEDS[1] * .1;
for (const speed of [1, 2, 3]) for (const catchUp of [1, 8]) for (const facingYaw of [0, Math.PI]) {
  const st = { sc: .02, catchUp, canopyQuaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facingYaw), canopyReverse: true };
  const game = { speed };
  canopyStep(st, paceStart, paceDef, game, 0);
  const uphill = { ...paceEnd, point: new THREE.Vector3(1, .8, 0) };
  st.branchRoute = { points: [paceStart.point.clone(), uphill.point.clone()], gap: -1, cursor: 1, target: uphill };
  const motion = canopyStep(st, uphill, paceDef, game, .1);
  assert.equal(st.canopyReverse, false, 'an uphill route releases the previous downhill facing, even when the body still faces backward');
  assert.ok(motion.heading.x > 0 && motion.heading.y > 0, 'turning follows the intended uphill route');
  const expected = Math.min(facingYaw ? budget * .05 : climbPace(paceDef) * st.catchUp * SPEEDS[speed] * .1, .1 * paceDef.sprite.len * st.sc * 1.5);
  assert.ok(Math.abs(motion.travelled - expected) < 1e-10, 'opposing body facing permits only a grip shuffle while turning uphill, even at fast game or catch-up speeds');
}
assert.equal(orangutanReverse(new THREE.Vector3(1, -1, 0), false, new THREE.Vector3(-1, 0, 0)), true, 'an uphill-facing body can back down steep wood');
assert.equal(orangutanReverse(new THREE.Vector3(1, -1, 0), false, new THREE.Vector3(1, 0, 0)), false, 'a body already facing downhill need not turn backward');
assert.equal(orangutanReverse(new THREE.Vector3(1, -.2, 0), true), true, 'small slope changes preserve a descent');
assert.equal(orangutanReverse(new THREE.Vector3(1, 0, 0), true), false, 'level travel releases the downhill facing');
for (const t of [.15, .3, .5, .63, .8]) {
  const st = { sc: .02, canopyQuaternion: new THREE.Quaternion() };
  canopyStep(st, paceStart, paceDef, paceGame, 0);
  st.branchPoint.x = t;
  st.branchRoute = { points: [paceStart.point.clone(), paceEnd.point.clone()], gap: 1, cursor: 1, swingable: true, target: paceEnd };
  canopyStep(st, paceEnd, paceDef, paceGame, .1);
  assert.ok(Math.abs(st.branchPoint.x - t - budget) < 1e-10, 'clambering keeps the same pace through the whole crossing');
}

for (const fps of [15, 60]) for (const speed of [1, 2, 3]) {
  const st = { sc: .02, canopyQuaternion: new THREE.Quaternion(), branchPhase: 2.3 }, game = { speed };
  canopyStep(st, paceStart, paceDef, game, 0);
  const destination = { ...paceStart, point: new THREE.Vector3(3, 0, 0) };
  for (let frame = 1; frame <= fps * 3; frame++) {
    const phase = st.branchPhase;
    const motion = canopyStep(st, destination, paceDef, game, frame / fps);
    assert.ok(st.branchPhase >= phase && st.branchPhase - phase <= 4.2 / fps + 1e-8, 'clamber cycle stays slow and continuous at every game speed');
    // A rejected part of a step must not advance the arm cycle.
    st.branchPoint.lerp(motion.before, .6); motion.acceptedDistance = motion.travelled * .4;
    settleCanopyStep(st, motion);
    assert.ok(st.branchPhase >= phase && st.branchPhase - phase <= 4.2 / fps + 1e-8, 'shortened steps preserve the same bounded cycle');
  }
  const phase = st.branchPhase, point = st.branchPoint.clone(); game.speed = 0;
  canopyStep(st, destination, paceDef, game, 4);
  assert.equal(st.branchPhase, phase); assert.ok(st.branchPoint.equals(point), 'pause freezes clambering');
}

// A tiny resting projection is not a new travel direction.
{
  const st = { sc: .02, canopyQuaternion: new THREE.Quaternion() };
  canopyStep(st, paceStart, paceDef, paceGame, 0);
  const motion = canopyStep(st, { ...paceStart, point: new THREE.Vector3(.001, .001, 0) }, paceDef, paceGame, .1);
  assert.equal(motion.heading.lengthSq(), 0, 'tiny resting corrections do not turn the torso');
  assert.equal(motion.travelled, 0);
}
// Same-limb motion has a one-point trace. A rejected part of that step must
// still be shortened rather than moving the torso into the obstacle.
{
  const points = [new THREE.Vector3(0,.2,0),new THREE.Vector3(.1,.2,0),new THREE.Vector3(0,.3,0),new THREE.Vector3(.1,.3,0)];
  const mo = { len: 1, primate: 2, canopyBody: points, canopyBounds: new THREE.Box3().setFromPoints(points) };
  const before = new THREE.Vector3(), st = { sc: 1, yaw: 0, branchPoint: new THREE.Vector3(.1,0,0), canopyQuaternion: new THREE.Quaternion() };
  const wood = [{ from: new THREE.Vector3(.22,0,0), to: new THREE.Vector3(.22,1,0), dir: new THREE.Vector3(0,1,0), up: new THREE.Vector3(1,0,0), length:1, r0:.1, r1:.1 }];
  const motion = { heading:new THREE.Vector3(1,0,0), trace:[{point:before,cursor:0}], travelled:.1, dt:.1 };
  canopyLean(st,mo,[{wood,prepare(){}}],0,1,0,.1,before,motion);
  assert.ok(st.branchPoint.x < .05, 'blocked same-limb movement commits only the clear part of the step');
  assert.ok(bodyFitsWood({motion:mo,scale:1},st.branchPoint,st.canopyQuaternion,wood));
}

// Walking after leaving a crown must retain the slow cycle and bounded turns,
// even when simulation phase advances quickly or its heading changes suddenly.
for (const fps of [15, 60]) for (const speed of [1, 2, 3]) {
  const { game, a } = canopyFixture('sumatra', 'orangutan');
  game.world.tree.fill(0);
  const scene = new THREE.Scene(), flora = new Flora(scene); flora.rebuild(game, true);
  const actors = new Actors(scene, flora), right = new THREE.Vector3(1, 0, 0);
  actors.update(game, right, 1); game.speed = speed; a.state = 'walk';
  const st = actors.pose.get(a.id), pool = actors.fauna.pool(drawDef(ANIMALS[a.sp], a));
  for (let frame = 1; frame <= fps * 2; frame++) {
    const phase = st.branchPhase || 0, yaw = st.yaw;
    a.x += .24 / fps; a.phase += 2; a.hd = Math.floor(frame / (fps / 2)) % 2 * Math.PI;
    actors.update(game, right, 1 + frame / fps);
    assert.ok(st.branchPhase >= phase && st.branchPhase - phase <= 4.2 / fps + 1e-8, 'ground walking keeps the slow clamber cadence instead of adopting the fast simulation cycle');
    assert.ok(Math.abs(st.yaw - yaw) <= 1 / fps + 1e-8, 'ordinary walking does not spin with sudden simulation headings');
    assert.ok(Math.abs(pool.anim.getX(0) - st.branchPhase) < 1e-5);
  }
  const phase = st.branchPhase, yaw = st.yaw; game.speed = 0; a.hd += Math.PI;
  actors.update(game, right, 4);
  assert.equal(st.branchPhase, phase); assert.equal(st.yaw, yaw, 'pause freezes ground walking');
  actors.clear();
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
  const blockedCrown = mode === 'crown' && !!variant.juvenile;
  let target = 0;
  if (mode === 'fork') site.anchor = (x, z, previous, reach, hanging, body) => site.endpoint(target, 1, { reach, hanging, body });
  const right = new THREE.Vector3(1, 0, 0); actors.update(game, right, 1); game.speed = 1;
  const st = actors.pose.get(a.id), pool = actors.fauna.pool(drawDef(ANIMALS[a.sp], a)), mo = pool.motion;
  assert.equal(pool.geo.attributes.aSwing, undefined, 'orangutan uses the original clamber model without overhead swing poses');
  const material = faunaMaterial(mo), shader = { uniforms: {}, vertexShader: '' }; material.onBeforeCompile(shader);
  assert.ok(!shader.vertexShader.includes('float crossing') && !shader.vertexShader.includes('attribute vec3 aSwing'), 'shader cannot blend the orangutan into a hanging pose');
  material.dispose();
  let point = st.branchPoint.clone(), rotation = st.canopyQuaternion.clone(), lastDelta = new THREE.Vector3();
  let reversals = 0, rotationSum = 0, limbChanges = 0, finished = 0, lastLimb = st.branch.index;
  let backwardUphill = 0;
  let pausedCrossing = false, crossingFrames = 0;
  const handSteps = [0, 0];
  const forkPeriod = 12, duration = mode === 'fork' ? 75 : 30;
  for (let frame = 1; frame <= fps * duration; frame++) {
    const time = 1 + frame / fps;
    // Five handovers, then enough time to finish the last forward-facing turn.
    target = Math.min(5, Math.floor(time / forkPeriod)) % 2 ? other : 0;
    if (mode === 'crown') {
      a.x = Math.min(41.65, a.x + .24 / fps); a.state = a.x < 41.65 ? 'walk' : 'idle';
    }
    const journey = st.branchRoute, phase = st.branchPhase;
    const oldFeet = st.gripFeet.map(f=>({point:f.point.clone(),planted:!f.free&&!f.from,swing:!!f.from}));
    actors.update(game, right, time);
    assert.equal(st.canopyLeap, null, 'orangutans never use the monkey leap arc');
    assert.ok(st.branchPhase >= phase && st.branchPhase - phase <= 4.2 / fps + 1e-8, 'arm cycle never resets at takeoff or landing');
    assert.ok(Math.abs(pool.anim.getX(0) - st.branchPhase) < 1e-5, 'drawn arms use the same continuous clamber phase');
    assert.equal(pool.anim.getW(0), -1, 'clamber uses planted contact offsets instead of the sliding cycle');
    for (let i = 0; i < 4; i++) {
      const foot = st.gripFeet[i], local = mo.canopyFeet[i].clone().add(st.gripOffsets[i]);
      assert.ok(local.distanceTo(mo.canopyJoints[i]) <= mo.canopyFeet[i].distanceTo(mo.canopyJoints[i]) * 1.08 + 1e-7, 'a reaching limb stays within its anatomical length');
      assert.ok(st.gripOffsets[i].length() <= mo.len * mo.canopyFootReach[i] + 1e-6, 'grip movement stays bounded');
      if (i < 2 && foot.from && !oldFeet[i].swing) handSteps[i]++;
      if (!foot.free && !foot.from) {
        assert.ok(Math.min(...foot.site.wood.map(b=>Math.abs(woodDistance(foot.point,b)))) < .003, 'a planted hand or foot touches actual bark');
        if (oldFeet[i].planted) assert.ok(foot.point.distanceTo(oldFeet[i].point) < 1e-8, 'a planted grip stays still as the body passes it');
      }
    }
    const support = new THREE.Vector3(mo.gripX || 0, mo.supportY || 0, mo.gripZ || 0);
    const center = mo.center.clone().sub(support).multiplyScalar(st.sc).applyQuaternion(st.canopyQuaternion).add(st.branchPoint);
    assert.ok(st.center.distanceTo(center) < 1e-7, 'body stays at its normal footing instead of dropping and shifting around a swinging hand');
    if (st.branchRoute?.cursor === st.branchRoute?.gap && st.branchRoute) {
      crossingFrames++;
      if (!pausedCrossing) {
        const center = st.center.clone(), rotation = st.canopyQuaternion.clone(), phase = st.branchPhase;
        game.speed = 0; actors.update(game, right, time);
        assert.ok(st.center.distanceTo(center) < 1e-8, 'pause freezes a crown handover');
        assert.ok(st.canopyQuaternion.angleTo(rotation) < 1e-7); assert.equal(st.branchPhase, phase);
        game.speed = 1; pausedCrossing = true;
      }
    }
    const delta = st.branchPoint.clone().sub(point), turn = st.canopyQuaternion.angleTo(rotation);
    if (delta.length() > .0001) {
      if (lastDelta.length() > .0001 && delta.dot(lastDelta) < 0) reversals++;
      lastDelta.copy(delta);
      const facing = new THREE.Vector3(1, 0, 0).applyQuaternion(st.canopyQuaternion);
      if (delta.y > delta.length() * .1 && facing.x * delta.x + facing.z * delta.z < 0) backwardUphill += delta.length();
    }
    rotationSum += turn;
    assert.ok(turn <= 1 / fps + 1e-6, `${variant.name}: the same slow body turn applies during handovers`);
    assert.ok(delta.length() < .07, `${variant.name}: no jump between holds`);
    assert.ok(!st.canopyForce, `${variant.name}: no forced step after a stall`);
    const wood = [...new Set([st.branchAt?.site, st.branchRoute?.fromSite, st.branch?.site])].filter(Boolean).flatMap(s => { s.prepare(); return s.wood; });
    const hold = support;
    assert.ok(bodyFitsWood({ motion: { ...mo, gripX: hold.x, supportY: hold.y, gripZ: hold.z }, scale: st.sc }, st.branchPoint, st.canopyQuaternion, wood), `${variant.name}: torso clears actual wood`);
    const euler = new THREE.Euler().setFromQuaternion(st.canopyQuaternion, 'YZX');
    assert.ok(Math.abs(euler.x) <= .3 + 1e-6, 'feet remain underneath the torso');
    assert.ok(Math.abs(euler.z) <= mo.canopyPitchLimit + 1e-6, 'the torso stays within readable climbing postures');
    if (st.branch.index !== lastLimb) { limbChanges++; lastLimb = st.branch.index; }
    if (journey && !st.branchRoute) finished++;
    point.copy(st.branchPoint); rotation.copy(st.canopyQuaternion);
  }
  // Facing each receiving limb adds deliberate turns that the old backward
  // handovers skipped. Keep those turns bounded, including the idle period.
  assert.ok(rotationSum < Math.PI * (mode === 'crown' ? 3 : 5), `${variant.name}: excess rotation during ${mode}`);
  assert.ok(backwardUphill < .1, `${variant.name}: uphill travel must face forward apart from short grip shuffles (${backwardUphill.toFixed(3)} tiles backward)`);
  assert.ok(reversals <= (mode === 'crown' ? 4 : 12), `${variant.name}: repeated backtracking during ${mode}: ${reversals}`);
  assert.ok(limbChanges <= (mode === 'crown' ? 1 : 5), 'branch choice stays committed');
  if (blockedCrown) {
    assert.ok(st.branchRoute?.blocked, 'a small orangutan holds the tree when the rigid crown gap exceeds its reach');
    assert.equal(st.branchAt.site, site); assert.equal(crossingFrames, 0, 'no unsupported air-walking across young trees');
  } else {
    assert.ok(finished >= (mode === 'crown' ? 1 : 4), 'supported crossings finish');
    assert.equal(Boolean(st.branchRoute), false, 'last route finishes');
    assert.ok(handSteps.every(n=>n>0), 'both front hands reach and place new grips during travel');
  }
  if (mode === 'crown' && !blockedCrown) assert.ok(crossingFrames && pausedCrossing, 'uses and pauses a normal clambering handover');
  else assert.equal(crossingFrames, 0, 'same-tree or blocked travel stays on the clamber');
  target = st.branchAt.index; a.state = 'idle';
  point.copy(st.branchPoint); rotation.copy(st.canopyQuaternion);
  for (let frame = 1; frame <= fps; frame++) actors.update(game, right, duration + 1 + frame / fps);
  assert.ok(st.branchPoint.distanceTo(point) < 1e-8, 'rest holds the same bark contact');
  assert.ok(st.canopyQuaternion.angleTo(rotation) < 1e-7, 'rest does not hunt for a different orientation');
  game.speed = 0;
  for (let frame = 1; frame <= fps; frame++) actors.update(game, right, duration + 2 + frame / fps);
  assert.ok(st.canopyQuaternion.angleTo(rotation) < 1e-7, 'pause freezes body orientation');
  console.log(`PASS ${variant.name}, ${fps} fps, ${mode}: ${Math.round(rotationSum * 180 / Math.PI)}° total turn, ${reversals} direction changes, ${finished} completed routes, ${backwardUphill.toFixed(3)} tiles of uphill grip shuffles`);
  actors.clear();
}
console.log('12 canopy and 6 ground-walking orangutan movement scenarios passed.');
