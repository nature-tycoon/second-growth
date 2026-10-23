// Per-frame cost of tree-climbing primates in a dense crown, with a signature of their final
// positions, poses and grips so a faster canopy pass can be shown to move every animal exactly as before.
//   node tools/canopy-bench.mjs [species,...] [count] [frames]   (CANOPY_ROOT=<checkout> for an A/B comparison)
//   e.g. node tools/canopy-bench.mjs capuchin 12 450
import { register } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
register('./three-loader.mjs', import.meta.url);
const root = pathToFileURL(resolve(process.env.CANOPY_ROOT || fileURLToPath(new URL('..', import.meta.url))) + '/').href;
const THREE = await import('three');
const { mulberry32 } = await import(root + 'js/rng.js');
Math.random = mulberry32(1987);
const { canopyFixture } = await import(root + 'tools/canopy-support-fixture.mjs');
const { Flora } = await import(root + 'js/render3d/flora.js');
const { Actors } = await import(root + 'js/render3d/actors.js');
const { ANIMAL } = await import(root + 'js/data/animals.js');
const { PLANT } = await import(root + 'js/data/plants.js');

const species = (process.argv[2] || 'capuchin').split(','), count = +(process.argv[3] || 12), frames = +(process.argv[4] || 450);
const map = species.some(s => ['orangutan', 'siamang', 'langur'].includes(s)) ? 'sumatra' : species.some(s => ['congo', 'capuchin'].includes(s)) ? 'chinandega' : 'amazon';
const { game } = canopyFixture(map, species[0]), w = game.world;
game.wildlife.agents = [];
const trees = { amazon: ['fig', 'kapok'], sumatra: ['meranti', 'meranti'], chinandega: ['guanacaste', 'guanacaste'] }[map];
for (let x = 30; x < 52; x++) for (let z = 22; z < 44; z++) w.setPlant(w.idx(x, z), PLANT[(x + z) % 3 ? trees[0] : trees[1]], (x * 7 + z * 3) % 7 ? 1 : .35);
for (let n = 0; n < count; n++) game.wildlife.spawn(ANIMAL[species[n % species.length]], 33 + (n * 5) % 16, 25 + (n * 3) % 16, { silent: true, age: 1200 });
const scene = new THREE.Scene(), flora = new Flora(scene); flora.rebuild(game, true);
const camera = new THREE.PerspectiveCamera(45, 1.6, .1, 500); camera.position.set(41, 25, 50); camera.lookAt(41, 3, 33); camera.updateMatrixWorld();
const right = new THREE.Vector3(1, 0, 0), actors = new Actors(scene, flora);
let time = 1; actors.update(game, right, time, camera, 600); game.speed = 1;
const times = [];
for (let f = 0; f < frames; f++) {
  game.update(1 / 30); flora.rebuild(game); time += 1 / 30;
  const t = performance.now(); actors.update(game, right, time, camera, 600); times.push(performance.now() - t);
}
const s = times.slice(60).sort((a, b) => a - b), mean = s.reduce((a, b) => a + b, 0) / s.length;
const state = game.wildlife.agents.map(a => {
  const st = actors.pose.get(a.id);
  return [a.x, a.y, st?.branchPoint?.toArray(), st?.canopyQuaternion?.toArray(), st?.gripFeet?.map(f => f.point.toArray())].flat(3).join(',');
}).join('|');
console.log(`${species} x${count} on ${map}, ${frames} frames: Actors.update mean ${mean.toFixed(2)} ms, median ${s[s.length >> 1].toFixed(2)}, p95 ${s[Math.floor(s.length * .95)].toFixed(2)}, max ${s[s.length - 1].toFixed(2)}`);
console.log('signature', createHash('sha1').update(state).digest('hex').slice(0, 16));
