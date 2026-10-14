import assert from 'node:assert/strict';
import { register } from 'node:module';
import { mulberry32 } from '../js/rng.js';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { canopyFixture } = await import('./canopy-support-fixture.mjs');
const { Flora } = await import('../js/render3d/flora.js');
const { Actors } = await import('../js/render3d/actors.js');
const { ANIMAL } = await import('../js/data/animals.js');
const { PLANT } = await import('../js/data/plants.js');
const { SPEEDS } = await import('../js/config.js');
const { climbPace } = await import('../js/sim/climb-pace.js');

const right = new THREE.Vector3(1, 0, 0), originalRandom = Math.random;
let scenarios = 0;
try {
  // The simulation keeps walking while the body negotiates forks and taller
  // trunks. This used to trigger several times the normal climbing speed.
  for (const fps of [15, 60]) for (const speed of [1, 2, 3]) {
    Math.random = mulberry32(1987);
    const { game } = canopyFixture('amazon', 'howler'), w = game.world;
    game.wildlife.agents = [];
    for (let x = 34; x < 48; x++) for (let z = 26; z < 40; z++)
      w.setPlant(w.idx(x, z), PLANT[(x + z) % 3 ? 'fig' : 'kapok'], (x * 7 + z * 3) % 7 ? 1 : .35);
    const monkeys = [0, 1, 2].map(n => game.wildlife.spawn(ANIMAL.howler, 36 + n * 3, 30 + n * 2, { silent: true, age: 1200 }));
    const scene = new THREE.Scene(), flora = new Flora(scene); flora.rebuild(game, true);
    const actors = new Actors(scene, flora); let time = 1;
    actors.update(game, right, time); game.speed = speed;
    let lagged = 0, crossings = 0;
    for (let frame = 1; frame <= fps * 40; frame++) {
      const before = new Map(monkeys.map(a => [a.id, actors.pose.get(a.id)?.branchPoint?.clone()]));
      game.update(1 / fps); time += 1 / fps; flora.rebuild(game); actors.update(game, right, time);
      for (const a of monkeys) {
        const st = actors.pose.get(a.id), point = before.get(a.id);
        if (!point || !st?.branchPoint) continue;
        const step = st.branchPoint.distanceTo(point);
        const limit = climbPace(ANIMAL.howler) * SPEEDS[speed] * 1.5 * 2.6 / fps;
        assert.ok(step <= limit + .025, `${fps}fps, speed ${speed}: no burst after a delayed climb (${step.toFixed(3)} tiles)`);
        lagged += st.canopyLag > 1.8 ? 1 : 0;
        crossings += st.branchRoute?.gap >= 0 ? 1 : 0;
        if (st.branchRoute?.gap >= 0) {
          const from = st.branchRoute.fromSite.cell, to = st.branchRoute.target.site.cell;
          assert.ok(Math.max(Math.abs(from[0] - to[0]), Math.abs(from[1] - to[1])) <= 1, 'catch-up still visits adjacent trees');
        }
      }
      if (frame === fps * 5) {
        const saved = monkeys.map(a => {
          const st = actors.pose.get(a.id);
          return { st, point: st.branchPoint?.clone(), phase: st.branchPhase, pace: st.catchUp };
        });
        game.speed = 0; time += .2; actors.update(game, right, time);
        for (const { st, point, phase, pace } of saved) {
          if (point) assert.ok(st.branchPoint.distanceTo(point) < 1e-8, 'pause holds the delayed climb');
          assert.equal(st.branchPhase, phase); assert.equal(st.catchUp, pace);
        }
        game.speed = speed;
      }
    }
    assert.ok(lagged > 0 && crossings > fps, 'exercises real delayed crown crossings');
    actors.clear(); scenarios++;
    console.log(`PASS mixed-height howler forest, ${fps}fps, speed ${speed}: delayed climbs stay within a gentle pace`);
  }

  // This taller departure tree requires a real trunk descent before takeoff,
  // rather than the direct crown leap exercised by equal-height trees.
  for (const [map, key, tall, short] of [
    ['amazon', 'howler', 'kapok', 'fig'], ['amazon', 'spider', 'kapok', 'fig'],
    ['chinandega', 'congo', 'ceiba', 'guanacaste'], ['sumatra', 'langur', 'meranti', 'fig']
  ]) for (const fps of [15, 60]) for (const speed of [1, 3]) {
    const { game, a } = canopyFixture(map, key), w = game.world;
    w.setPlant(w.idx(40, 32), PLANT[tall], 1); w.setPlant(w.idx(41, 32), PLANT[short], .3);
    a.x = 40.5; a.y = 32.5;
    const scene = new THREE.Scene(), flora = new Flora(scene); flora.rebuild(game, true);
    const actors = new Actors(scene, flora); let time = 1;
    actors.update(game, right, time); game.speed = speed; a.x = 41.35; a.state = 'walk';
    const st = actors.pose.get(a.id), initialHeight = st.branchPoint.y;
    let route, completed = false, paused = false;
    for (let frame = 1; frame <= fps * 40; frame++) {
      const before = st.branchPoint.clone(); time += 1 / fps; actors.update(game, right, time);
      route ||= st.branchRoute;
      const limit = climbPace(ANIMAL[key]) * SPEEDS[speed] * 1.5 * 2.6 / fps;
      assert.ok(st.branchPoint.distanceTo(before) <= limit + 1e-8, `${key}: trunk descent never bursts ahead`);
      if (!paused && route?.trunkTransfer && st.branchPoint.y < initialHeight - .2 && st.branchRoute?.cursor < route.gap) {
        const point = st.branchPoint.clone(), rotation = st.canopyQuaternion.clone();
        game.speed = 0; time += .2; actors.update(game, right, time);
        assert.ok(st.branchPoint.distanceTo(point) < 1e-8 && st.canopyQuaternion.angleTo(rotation) < 1e-7, 'pause freezes the trunk descent');
        w.treeG[w.idx(40, 32)] = .999; flora.rebuild(game, true); actors.update(game, right, time);
        assert.equal(st.branchRoute, route, 'growth keeps the committed descent');
        assert.ok(st.branchPoint.distanceTo(point) < .035, 'growth only adjusts the existing bark hold');
        game.speed = speed; paused = true;
      }
      if (route && !st.branchRoute) { completed = true; break; }
    }
    assert.ok(completed && st.branchAt.site.tile === w.idx(41, 32), `${key}: descent and receiving-tree catch finish`);
    if (key === 'howler' || key === 'spider') assert.ok(route.trunkTransfer && route.gap > 1 && paused, 'exercises a paused tall-trunk descent');
    actors.clear(); scenarios++;
    console.log(`PASS ${key} tall-to-short transfer, ${fps}fps, speed ${speed}: descent completes, pause and growth remain continuous`);
  }
} finally { Math.random = originalRandom; }
console.log(`${scenarios} monkey pace scenarios passed.`);
