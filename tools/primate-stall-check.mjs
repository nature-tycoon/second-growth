import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
import { mulberry32 } from '../js/rng.js';
import { SPEEDS } from '../js/config.js';
const cases = [
  ['orangutan', 'sumatra', 1, 15, 60], ['orangutan', 'sumatra', 1, 60, 60],
  ['orangutan', 'sumatra', 3, 15, 240], ['orangutan', 'sumatra', 3, 60, 240],
  ['langur', 'sumatra', 3, 60, 240], ['howler', 'amazon', 3, 60, 240],
];
const caseArg = process.argv.indexOf('--case');
if (caseArg < 0) {
  // Keep model/simulation caches and their random consumption independent,
  // as the release runner does for its individual checks.
  for (const i of process.argv.includes('--quick') ? [3] : cases.keys()) {
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--case', String(i)], { stdio: 'inherit' });
    if (run.error) throw run.error;
    if (run.status !== 0) process.exit(run.status || 1);
  }
  process.exit(0);
}
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { canopyFixture } = await import('./canopy-support-fixture.mjs');
const { Flora } = await import('../js/render3d/flora.js');
const { Actors } = await import('../js/render3d/actors.js');
const { PLANT } = await import('../js/data/plants.js');

// Drive actual wildlife decisions and accepted branch motion together. A fixed
// target crossing misses stalls caused by successive destinations and meals.
const random = Math.random;
try {
  for (const [key, map, speed, fps, days] of [cases[Number(process.argv[caseArg + 1])]]) {
    Math.random = mulberry32(1987);
    const { game } = canopyFixture(map, key), w = game.world;
    game.wildlife.agents = [];
    for (let x = 34; x < 47; x++) for (let z = 26; z < 39; z++) w.setPlant(w.idx(x, z), PLANT.fig, 1);
    game.refreshEnvironment(); game.wildlife.computeSuitability();
    const def = game.catalog.animal[key];
    const animals = [0, 1, 2].map(n => game.wildlife.spawn(def, 37 + n * 3, 30 + n, { silent: true, age: 2000 }));
    game.selectedAgent = animals[0];
    const scene = new THREE.Scene(), flora = new Flora(scene);
    flora.rebuild(game, true);
    const actors = new Actors(scene, flora), right = new THREE.Vector3(1, 0, 0);
    let time = 1; actors.update(game, right, time); game.speed = speed;
    const stats = animals.map(a => {
      const st = actors.pose.get(a.id);
      return { point: st.branchPoint.clone(), pose: st.canopyQuaternion.clone(), last: game.day,
        position: st.branchPoint.clone(), positionLast: game.day, positionStill: 0,
        still: 0, travelled: 0, tree: st.branchAt.site.tile, changes: 0 };
    });
    for (let frame = 1; frame <= Math.ceil(days / SPEEDS[speed] * fps); frame++) {
      game.day += SPEEDS[speed] / fps; game.wildlife.update(SPEEDS[speed] / fps); time += 1 / fps;
      const before = animals.map(a => actors.pose.get(a.id).branchPoint.clone());
      actors.update(game, right, time);
      animals.forEach((a, i) => {
        const st = actors.pose.get(a.id), s = stats[i];
        assert.ok(st.branchPoint, 'continuous forest retains actual tree support');
        const step = st.branchPoint.distanceTo(before[i]); s.travelled += step;
        if (key === 'orangutan') {
          assert.ok(step <= def.sprite.len * st.sc * 1.5 / fps + 1e-7, 'recovery keeps the same real-time body pace');
          assert.ok(!st.canopyForce, 'recovery never forces the torso through wood');
        }
        if (st.branchPoint.distanceTo(s.point) > .02 || st.canopyQuaternion.angleTo(s.pose) > .15) {
          s.point.copy(st.branchPoint); s.pose.copy(st.canopyQuaternion); s.last = game.day;
        }
        s.still = Math.max(s.still, game.day - s.last);
        if (!st.branchRoute || Math.hypot(st.branchPoint.x - a.x, st.branchPoint.z - a.y) < .75 || st.branchPoint.distanceTo(s.position) > .08) { s.position.copy(st.branchPoint); s.positionLast = game.day; }
        s.positionStill = Math.max(s.positionStill, game.day - s.positionLast);
        if (s.tree !== st.branchAt.site.tile) { s.changes++; s.tree = st.branchAt.site.tile; }
      });
    }
    for (const s of stats) {
      assert.ok(s.positionStill < Math.max(18, SPEEDS[speed] * 6), `${key}: body must not stay at a failed hold for months (${s.positionStill.toFixed(1)} days)`);
      assert.ok(s.travelled > 2, `${key}: recovery must resume substantial climbing on real wood`);
    }
    assert.ok(stats.reduce((n, s) => n + s.changes, 0) >= 2, `${key}: reachable forest transfers must complete`);
    console.log(`PASS ${key}, speed ${speed}, ${fps} fps: ` + stats.map(s => `${s.still.toFixed(1)} days still, ${s.changes} tree changes`).join('; '));
    actors.clear();
  }
} finally { Math.random = random; }
