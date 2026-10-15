import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { canopyFixture } = await import('./canopy-support-fixture.mjs');
const { Flora } = await import('../js/render3d/flora.js');
const { Actors } = await import('../js/render3d/actors.js');
const { Fauna, faunaMaterial, buildSpecies } = await import('../js/render3d/fauna.js');
const { ANIMALS } = await import('../js/data/animals.js');
const { PLANT } = await import('../js/data/plants.js');
const { canopyStep, settleCanopyStep } = await import('../js/render3d/canopy-motion.js');
const { woodDistance, bodyFitsWood } = await import('../js/render3d/wood-clearance.js');
const { canopyGrips } = await import('../js/render3d/canopy-grips.js');
const { climbPace } = await import('../js/sim/climb-pace.js');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
check('Every tree monkey and the sloth keep a forward crown route with bounded, supported limbs', () => {
  for (const [map, key] of [['amazon', 'howler'], ['amazon', 'spider'], ['amazon', 'sloth'], ['sumatra', 'langur'], ['chinandega', 'congo'], ['chinandega', 'capuchin']]) {
    const { game, a } = canopyFixture(map, key), scene = new THREE.Scene(), flora = new Flora(scene);
    flora.rebuild(game, true);
    const actors = new Actors(scene, flora), right = new THREE.Vector3(1, 0, 0);
    a.x = 40.35; actors.update(game, right, 1); game.speed = 1;
    const mo = actors.fauna.motion(ANIMALS[a.sp]);
    const handSteps = [0, 0];
    let previousDelta = new THREE.Vector3(), reversals = 0, releases = 0, placements = 0, changes = 0;
    let limb = actors.pose.get(a.id).branch.index, leapFrames = 0, maxLift = 0, pausedLeap = false;
    for (let frame = 1; frame <= 2400; frame++) {
      a.x = Math.min(41.65, a.x + (key === 'sloth' ? .001 : .004)); a.state = a.x < 41.65 ? 'walk' : 'idle';
      const st = actors.pose.get(a.id), before = st.branchPoint.clone();
      const journey = st.branchRoute, cursor = journey?.cursor;
      const nextHold = journey?.points[cursor]?.clone();
      const feet = st.gripFeet.map(foot => ({ point: foot.point.clone(), free: foot.free, swing: !!foot.from }));
      actors.update(game, right, 1 + frame / 60);
      const delta = st.branchPoint.clone().sub(before);
      if (journey && journey === st.branchRoute) {
        assert.ok(st.branchRoute.cursor >= cursor, 'accepted route progress never returns to a passed hold');
        if (st.branchRoute.cursor === cursor) assert.ok(delta.dot(nextHold.sub(before)) >= -1e-10, 'a shortened step still advances toward its next hold');
      }
      if(!mo.canopyWalkerMotion)assert.ok(!st.canopyForce, `${key}: crown route does not force the body through wood`);
      if (delta.length() > .0001) {
        if (previousDelta.length() > .0001 && delta.dot(previousDelta) < 0) reversals++;
        previousDelta.copy(delta);
      }
      if (limb !== st.branch.index) { changes++; limb = st.branch.index; }
      if (st.canopyLeap?.lift > 0) {
        leapFrames++; maxLift = Math.max(maxLift, st.canopyLeap.lift);
        assert.ok(st.gripFeet.every(foot => foot.free && !foot.site && !foot.from), `${key}: all limbs release during the leap`);
        if (!pausedLeap && st.canopyLeap.t > .3 && st.canopyLeap.t < .7) {
          const center = st.center.clone(), airborneFeet = st.gripFeet.map(foot => foot.point.clone());
          game.speed = 0; actors.update(game, right, 1 + frame / 60);
          assert.ok(st.center.distanceTo(center) < 1e-8, 'pause freezes the airborne body');
          st.gripFeet.forEach((foot, i) => assert.ok(foot.point.distanceTo(airborneFeet[i]) < 1e-8, 'pause freezes the tucked limbs'));
          game.speed = 1; pausedLeap = true;
        }
      }
      for (let i = 0; i < 4; i++) {
        const foot = st.gripFeet[i], local = mo.canopyFeet[i].clone().add(st.gripOffsets[i]);
        const reach = mo.canopyWalkerMotion ? mo.howlerLengths[i][0]+mo.howlerLengths[i][1] : mo.canopyFeet[i].distanceTo(mo.canopyJoints[i]) * 1.08;
        assert.ok(local.distanceTo(mo.canopyJoints[i]) <= reach + 1e-7, `${key}: limb cannot elongate to maintain contact`);
        if(!st.canopyLeap&&!st.howlerJump)assert.ok(local.distanceTo(mo.canopyFeet[i]) <= mo.len * (mo.canopyWalkerMotion ? .55*(mo.canopyReachScale || 1) : i < 2 ? .24 : .18) + 1e-6, `${key}: placement stays within a short reach`);
        assert.ok(local.applyMatrix4(actors.fauna.m).distanceTo(foot.point) < 1e-7, 'shader offset reaches the drawn contact');
        if (i < 2 && foot.from && !feet[i].swing) handSteps[i]++;
        if (foot.free) releases++;
        if (!foot.free && !foot.from) {
          placements++;
          assert.ok(Math.min(...foot.site.wood.map(b => Math.abs(woodDistance(foot.point, b)))) < .003, 'planted grip touches real bark');
          assert.ok(foot.site.transient ? actors.slothBridges.visible.has(foot.site) : flora.canopyVisible.has(foot.site), 'supporting wood stays solid until the foot releases it');
          if (!feet[i].free && !feet[i].swing) assert.ok(foot.point.distanceTo(feet[i].point) < 1e-8, 'planted feet do not skate');
        }
      }
    }
    // Shorter, bounded jumps may approach a different limb via its fork.
    // Allow its deliberate bend while the cursor checks forbid backtracking.
    assert.ok(reversals <= 2, `${key}: no repeated corrective backtracking`);
    assert.ok(changes <= 1, `${key}: keeps a limb until reaching the next crown`);
    if (['spider', 'howler', 'sloth'].includes(key)) assert.ok(releases > 0, `${key}: limbs can release during a transfer`);
    if (key === 'langur') assert.ok(handSteps.every(n => n > 0), 'both langur hands lift and place new bark grips during ordinary travel');
    assert.ok(placements > 100, `${key}: catches the branch again`);
    assert.equal(Boolean(actors.pose.get(a.id).branchRoute), false, `${key}: finishes the crossing`);
    if (['howler', 'spider', 'langur', 'congo','capuchin'].includes(key)) {
      assert.ok(leapFrames > 0 && maxLift > .03, `${key}: crossing has a visible airborne arc`);
      assert.ok(pausedLeap, `${key}: exercised a pause during flight`);
      assert.equal(actors.pose.get(a.id).canopyLeap, null, `${key}: clears the leap state after landing`);
    } else assert.equal(leapFrames, 0, `${key}: retains its existing crossing animation`);
    const settled = actors.pose.get(a.id).gripFeet.filter(foot => !foot.free).length;
    assert.ok(settled >= 2, `${key}: regains multiple bark grips after crossing`);
    if (['spider', 'howler'].includes(key)) assert.equal(settled, 4, 'all four feet settle on the final limb');
    if (key === 'sloth') assert.ok(actors.pose.get(a.id).center.y < actors.pose.get(a.id).branchPoint.y, 'sloth body hangs below its contacts');
    const st = actors.pose.get(a.id), feet = st.gripFeet.map(foot => foot.point.clone());
    game.speed = 0;
    actors.update(game, right, 42);
    st.gripFeet.forEach((foot, i) => assert.ok(foot.point.distanceTo(feet[i]) < 1e-8, 'pause freezes supported and free limbs'));
    console.log(`${key}: ${reversals} reversals, ${changes} limb changes, limbs released and caught again`);
  }
});
check('Langur free hands alternate reaching while planted rear feet retain their bark contacts', () => {
  canopyFixture('sumatra', 'langur');
  const def=ANIMALS.find(d=>d?.key==='langur');
  const { motion: mo, geo } = buildSpecies({...def,sprite:{...def.sprite,canopyWalkerMotion:false}});
  const sc = .02, size = mo.len * sc;
  // A limb ends beneath the rear feet; both front hands are beyond its tip.
  const wood = [{ from: new THREE.Vector3(-size * 3, 0, 0), to: new THREE.Vector3(0, 0, 0),
    dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), length: size * 3, r0: size * .05, r1: size * .05 }];
  const site = { wood, prepare() {} }, matrix = new THREE.Matrix4().makeScale(sc, sc, sc);
  for (const fps of [15, 60]) {
    const st = { sc, gait: 1, branchPhase: 0 };
    canopyGrips(st, mo, [site], matrix, 0, 1);
    const rear = st.gripFeet.slice(2).map(f => f.point.clone()), samples = [[], []];
    for (let frame = 1; frame <= fps * 2; frame++) {
      st.branchPhase = frame / fps * Math.PI * 2;
      canopyGrips(st, mo, [site], matrix, frame / fps, 1);
      for (let i = 0; i < 2; i++) {
        const local = mo.canopyFeet[i].clone().add(st.gripOffsets[i]);
        assert.ok(st.gripFeet[i].free, 'no invented wood beyond the branch tip');
        assert.ok(local.distanceTo(mo.canopyJoints[i]) <= mo.canopyFeet[i].distanceTo(mo.canopyJoints[i]) * 1.08 + 1e-8);
        if (frame > fps) samples[i].push(st.gripOffsets[i].x);
      }
      for (let i = 2; i < 4; i++) assert.ok(st.gripFeet[i].point.distanceTo(rear[i - 2]) < 1e-8, 'planted feet stay on the bark');
    }
    for (const hand of samples) assert.ok(Math.max(...hand) - Math.min(...hand) > mo.len * .06, 'each front hand visibly reaches instead of holding a static pose');
    const left = samples[0], right = samples[1], lm = left.reduce((a,b)=>a+b)/left.length, rm = right.reduce((a,b)=>a+b)/right.length;
    assert.ok(left.reduce((sum,x,i)=>sum+(x-lm)*(right[i]-rm),0) < 0, 'hands alternate instead of reaching in unison');
    const before = st.gripFeet.map(f => f.point.clone()); st.branchPhase += 1;
    canopyGrips(st, mo, [site], matrix, 3, 0);
    st.gripFeet.forEach((f,i)=>assert.ok(f.point.distanceTo(before[i]) < 1e-8, 'pause freezes the reach'));
  }
  geo.dispose();
});
check('Legacy comparison main-fork handovers stay clear and do not oscillate between projected bark holds', () => {
  for (const [map, key] of [['amazon', 'spider'], ['amazon', 'howler'], ['amazon', 'sloth'], ['sumatra', 'langur'], ['chinandega', 'congo'], ['chinandega', 'capuchin']]) for (const fps of [15, 60]) {
    const { game, a } = canopyFixture(map, key), scene = new THREE.Scene(), flora = new Flora(scene);
    a.x = 40.5; a.y = 32.5; a.state = 'walk';
    const fig = Object.values(PLANT).find(p => p.look.type === 'fig');
    for (const x of [40, 41]) game.world.setPlant(game.world.idx(x, 32), fig, 1);
    flora.rebuild(game, true);
    const actors = new Actors(scene, flora,{canopyWalkerMotion:false}), right = new THREE.Vector3(1, 0, 0), site = flora.treeSites.get(game.world.idx(40, 32));
    site.prepare(); const other = site.branches.findIndex((b, i) => i > 0 && b.from.distanceTo(site.branches[0].from) < .001);
    let target = 0, time = 1;
    site.anchor = (x, z, previous, reach, hanging, body) => site.endpoint(target, 1, { reach, hanging, body });
    actors.update(game, right, time); game.speed = 1;
    const mo = [...actors.fauna.species.values()][0].motion;
    for (const destination of [other, 0, other, 0]) {
      target = destination;
      let reversals = 0, finished = false, delta = new THREE.Vector3();
      for (let frame = 0; frame < fps * (key === 'sloth' ? 25 : 8); frame++) {
        const st = actors.pose.get(a.id), before = st.branchPoint.clone(), rotation = st.canopyQuaternion.clone();
        time += 1 / fps; actors.update(game, right, time);
        const step = st.branchPoint.clone().sub(before);
        if (step.length() > .0001) { if (delta.length() > .0001 && step.dot(delta) < 0) reversals++; delta.copy(step); }
        assert.ok(!st.canopyForce, `${key}: no forced passage through the fork`);
        assert.ok(rotation.angleTo(st.canopyQuaternion) <= 1.5 / fps + 1e-6, 'fork turns remain gradual');
        assert.ok(bodyFitsWood({ motion: mo, scale: st.sc }, st.branchPoint, st.canopyQuaternion, site.wood), `${key}, ${fps}fps, frame ${frame}, destination ${destination}: fork clearance includes the accepted position`);
        if (frame === 1) {
          const hold = st.branchPoint.clone(), pose = st.canopyQuaternion.clone(), yaw = st.yaw;
          const feet = st.gripFeet.map(foot => foot.point.clone());
          game.speed = 0; time += .2; actors.update(game, right, time);
          assert.ok(st.branchPoint.distanceTo(hold) < 1e-8 && st.canopyQuaternion.angleTo(pose) < 1e-7, 'pausing at the fork freezes both the hold and turn');
          assert.equal(st.yaw, yaw, 'the route heading cannot steer while paused');
          st.gripFeet.forEach((foot, i) => assert.ok(foot.point.distanceTo(feet[i]) < 1e-8));
          game.speed = 1;
        }
        if (!st.branchRoute && st.branchAt.index === target) { finished = true; break; }
      }
      // A single bend around the trunk is necessary; repeated tiny reversals
      // on either side of that bend were the visible fork glitch.
      assert.ok(reversals <= 1, `${key}, ${fps}fps: no repeated corrective backtracking (${reversals})`);
      assert.ok(finished, `${key}: completes each fork handover`);
      for (let frame = 0; frame < fps * 2; frame++) { time += 1 / fps; actors.update(game, right, time); }
      assert.ok(actors.pose.get(a.id).gripFeet.some(foot => !foot.free), `${key}: regains bark support after the turn`);
    }
  }
});
check('A shortened step commits passed waypoints and advances gait only by accepted distance', () => {
  const direction = new THREE.Vector3(1, 0, 0), site = {}, start = { site, index: 0, point: new THREE.Vector3(), direction };
  const def = { speed: 1, sprite: { len: 16, kind: 'monkey' } }, game = { speed: 1 }, st = { sc: .02 };
  canopyStep(st, start, def, game, 0);
  st.branchRoute = { points: [.005, .01, .015, .02].map(x => new THREE.Vector3(x, 0, 0)), sites: Array(4).fill(site), gap: -1, cursor: 0, target: { ...start, point: new THREE.Vector3(.02, 0, 0) } };
  const phase = st.branchPhase, motion = canopyStep(st, start, def, game, .1);
  st.branchPoint.set(.012, 0, 0); settleCanopyStep(st, motion);
  assert.equal(st.branchRoute.cursor, 2, 'two passed waypoints remain passed');
  assert.ok(Math.abs(st.branchPhase - phase - .012 / motion.stride * Math.PI * 2) < 1e-8);
  const before = st.branchPoint.clone(), next = canopyStep(st, start, def, game, .11);
  st.branchPoint.copy(before); settleCanopyStep(st, next);
  assert.equal(st.branchRoute.cursor, 2, 'fully blocked step stays at the same cursor');
  assert.equal(next.gait, 0, 'blocked step does not walk in place');
});
check('A sloth crossing survives a routine tree rebuild with its paused grips and planned turn intact', () => {
  const { game, a } = canopyFixture('amazon', 'sloth'), scene = new THREE.Scene(), flora = new Flora(scene);
  flora.rebuild(game, true); const actors = new Actors(scene, flora), right = new THREE.Vector3(1, 0, 0);
  a.x = 40.35; actors.update(game, right, 1); game.speed = 1;
  a.x = 41.65; a.state = 'walk';
  for (let frame = 1; frame <= 30; frame++) actors.update(game, right, 1 + frame / 60);
  const st = actors.pose.get(a.id), hold = st.branchPoint.clone(), rotation = st.canopyQuaternion.clone();
  assert.ok(st.branchRoute, 'rebuild happens during an actual crossing');
  const feet = st.gripFeet.map(foot => ({ point: foot.point.clone(), tile: foot.site?.tile }));
  game.speed = 0; flora.rebuild(game, true); actors.update(game, right, 13);
  assert.ok(st.branchPoint.distanceTo(hold) < 1e-8 && st.canopyQuaternion.angleTo(rotation) < 1e-7);
  st.gripFeet.forEach((foot, i) => {
    assert.ok(foot.point.distanceTo(feet[i].point) < 1e-8);
    if (feet[i].tile !== undefined) assert.equal(foot.site, flora.treeSites.get(feet[i].tile));
  });
  game.speed = 1;
  for (let frame = 1; frame <= 3600 && st.branchRoute; frame++) actors.update(game, right, 13 + frame / 60);
  assert.equal(Boolean(st.branchRoute), false, 'continues to the destination after the rebuild');
  assert.ok(!st.canopyForce);
});
check('Grip buffers survive species-pool growth and use a separate shader program from swinging apes', () => {
  const { game, a } = canopyFixture('amazon', 'howler'), def = ANIMALS[a.sp], fauna = new Fauna(new THREE.Scene());
  const offsets = [1, 2, 3, 4].map(n => new THREE.Vector3(n, n + .1, n + .2));
  for (let i = 0; i < 33; i++) fauna.add(def, 0, 0, 0, 0, .02, 0, 0, 0, 0, 0, 0, offsets);
  fauna.end(); const pool = fauna.pool(def);
  const expected = offsets.flatMap(v => v.toArray());
  for (const instance of [0, 15, 16, 32]) {
    const actual = pool.grips.flatMap(attribute => [...attribute.array.slice(instance * 4, instance * 4 + 4)]);
    actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-6));
    assert.equal(pool.anim.getW(instance), -1, 'grazing slot enables contact pose');
  }
  const { a: ape } = canopyFixture('sumatra', 'siamang'), motion = buildSpecies(ANIMALS[ape.sp]).motion;
  assert.notEqual(faunaMaterial(pool.motion).customProgramCacheKey(), faunaMaterial(motion).customProgramCacheKey());
  const { a: sloth } = canopyFixture('amazon', 'sloth'), slothDef = ANIMALS[sloth.sp], hanging = buildSpecies(slothDef).motion;
  assert.notEqual(faunaMaterial(pool.motion).customProgramCacheKey(), faunaMaterial(hanging).customProgramCacheKey(), 'hanging grips have their own shader program');
  assert.ok(hanging.canopyBounds.max.y < hanging.len * .8, 'the sloth does not carry a modelled branch in its body geometry');
  assert.equal(climbPace(slothDef), slothDef.speed, 'sloth keeps its slow species pace');
});
console.log(`${checks} canopy grip checks passed.`);
