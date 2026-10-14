import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { canopyFixture } = await import('./canopy-support-fixture.mjs');
const { Flora } = await import('../js/render3d/flora.js');
const { Actors } = await import('../js/render3d/actors.js');
const { woodDistance } = await import('../js/render3d/wood-clearance.js');
const { floraVersion } = await import('../js/render3d/plant-pools.js');

const right = new THREE.Vector3(1, 0, 0);
let scenarios = 0;
for (const fast of [false, true]) for (const fps of [15, 60]) for (const speed of [1, 3]) {
  const { game, a } = canopyFixture('amazon', 'sloth'), scene = new THREE.Scene(), flora = new Flora(scene);
  flora.setLight(fast); flora.rebuild(game, true); flora.setFade(true);
  const actors = new Actors(scene, flora); a.x = 40.35;
  let time = 1; actors.update(game, right, time); game.speed = speed;
  let middle = 0, supported = 0, paused = false, finished = false, origins = new WeakMap();
  for (let frame = 1; frame <= fps * 60; frame++) {
    a.x = Math.min(41.65, a.x + .06 / fps); a.state = a.x < 41.65 ? 'walk' : 'idle';
    time += 1 / fps; actors.update(game, right, time);
    const st = actors.pose.get(a.id), bridge = st.slothBridge, route = st.branchRoute;
    if (bridge) {
      assert.ok(actors.slothBridges.visible.has(bridge), 'the connecting stick is actually drawn');
      assert.ok(flora.canopyVisible.has(bridge.source) && flora.canopyVisible.has(bridge.target), 'both ends stay attached to solid tree limbs');
      assert.equal(actors.slothBridges.pool.mat, flora.canopyBark, 'support stays opaque in see-through mode');
      const shown = new THREE.Matrix4(); actors.slothBridges.pool.mesh.getMatrixAt(0, shown);
      const midpoint = new THREE.Vector3().setFromMatrixPosition(shown);
      assert.ok(midpoint.distanceTo(bridge.wood[0].from.clone().lerp(bridge.wood[0].to, .5)) < 1e-5, 'drawn stick and grip surface agree');
      if (!origins.has(bridge)) origins.set(bridge, bridge.matrix.clone());
      else assert.ok(bridge.matrix.equals(origins.get(bridge)), 'the stick stays fixed as the sloth moves along it');
      if (route === bridge.route && route.cursor === route.gap) {
        const t = bridge.start.distanceTo(st.branchPoint) / bridge.start.distanceTo(bridge.end);
        if (t > .3 && t < .7) {
          middle++;
          supported += st.gripFeet.some(foot => !foot.free && (foot.site === bridge || foot.to?.canopySite === bridge)) ? 1 : 0;
          assert.ok(st.center.y < st.branchPoint.y, 'the body hangs underneath the stick');
          if (!paused) {
            const point = st.branchPoint.clone(), feet = st.gripFeet.map(foot => foot.point.clone());
            const matrix = bridge.matrix.clone(), version = floraVersion.n;
            game.speed = 0; time += .2; actors.update(game, right, time);
            assert.ok(st.branchPoint.distanceTo(point) < 1e-8 && bridge.matrix.equals(matrix), 'pause freezes the body and tree-fixed stick');
            st.gripFeet.forEach((foot, i) => assert.ok(foot.point.distanceTo(feet[i]) < 1e-8, 'pause freezes the claw grips'));
            assert.equal(floraVersion.n, version, 'an unchanged stick does not invalidate cached shadows');
            flora.rebuild(game, true); actors.update(game, right, time);
            assert.ok(st.slothBridge !== bridge, 'the stick rebases onto rebuilt trees');
            assert.ok(st.branchPoint.distanceTo(point) < 1e-8, 'an identical rebuild preserves the crossing');
            assert.ok(st.slothBridge.matrix.elements.every((n, i) => Math.abs(n - matrix.elements[i]) < 1e-8));
            for (const foot of st.gripFeet) if (!foot.free && !foot.from && foot.site?.transient)
              assert.ok(Math.abs(woodDistance(foot.point, foot.site.wood[0])) < .003, 'rebased claws still touch the stick');
            game.speed = speed; paused = true;
          }
        }
      }
    }
    if (paused && !st.branchRoute && st.branchAt.site.tile === game.world.idx(41, 32) && a.x === 41.65) { finished = true; break; }
  }
  assert.ok(middle > 0 && supported > 0 && paused && finished, 'crosses on visible support and completes the receiving-tree handover');
  assert.equal(supported, middle, 'a claw uses the connecting stick throughout the middle of the gap');
  const st = actors.pose.get(a.id), bridge = st.slothBridge || [...actors.slothBridges.visible][0];
  if (bridge) {
    game.speed = 0; game.world.clearPlants(bridge.source.tile); flora.rebuild(game, true);
    time += .1; actors.update(game, right, time);
    assert.equal(actors.slothBridges.visible.size, 0, 'cutting a supporting tree removes the connecting stick');
  }
  actors.clear(); assert.equal(actors.slothBridges.visible.size, 0, 'reset clears all artificial supports');
  assert.equal(actors.slothBridges.pool.mesh.visible, false, 'reset hides the support mesh');
  scenarios++;
  console.log(`PASS sloth connecting stick, ${fast ? 'Fast' : 'Full'}, ${fps}fps, speed ${speed}: supported crossing, pause, rebuild and cleanup (${supported}/${middle} middle-gap frames with claw support)`);
}
console.log(`${scenarios} sloth bridge scenarios passed.`);
