// How well drawn climbing primates follow the simulation through a forest, headless, through the
// real game.update and Actors.update. Reports per species: how far the drawn body trails the
// simulation (lag), snaps (the body jumping more than half a tile in one frame), stuck time (the
// body still for a second while the simulation is more than a tile away), blocked routes, dashes
// (drawn speed above twice the species' climbing pace), crown crossings, and time on the ground.
//   node tools/monkey-movement-measure.mjs [species,...] [forest=patchy|dense] [speed=1] [seconds=60] [count=8]
//   e.g. node tools/monkey-movement-measure.mjs howler,spider,capuchin,congo,langur,siamang,orangutan patchy 1 60
// MEASURE_ROOT=<checkout> measures another checkout (an A/B).
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
register('./three-loader.mjs', import.meta.url);
const root = pathToFileURL(resolve(process.env.MEASURE_ROOT || fileURLToPath(new URL('..', import.meta.url))) + '/').href;
const THREE = await import('three');
const { mulberry32 } = await import(root + 'js/rng.js');
const { canopyFixture } = await import(root + 'tools/canopy-support-fixture.mjs');
const { Flora } = await import(root + 'js/render3d/flora.js');
const { Actors } = await import(root + 'js/render3d/actors.js');
const { ANIMAL } = await import(root + 'js/data/animals.js');
const { PLANT } = await import(root + 'js/data/plants.js');
const { climbPace, climbSpeed } = await import(root + 'js/sim/climb-pace.js');
const { ANIMAL_SPEEDS } = await import(root + 'js/config.js');

const [list = 'howler,spider,capuchin,congo,langur,siamang,orangutan', forest = 'patchy', speedArg = '1', secondsArg = '60', countArg = '8'] = process.argv.slice(2);
const speed = +speedArg, frames = Math.round(+secondsArg * 30), count = +countArg;
const mapOf = s => ['orangutan', 'siamang', 'langur'].includes(s) ? 'sumatra' : ['congo', 'capuchin'].includes(s) ? 'chinandega' : 'amazon';
const TREES = { amazon: ['fig', 'kapok'], sumatra: ['meranti', 'meranti'], chinandega: ['guanacaste', 'guanacaste'] };

function measure(sp) {
  Math.random = mulberry32(1987);
  const map = mapOf(sp), { game } = canopyFixture(map, sp), w = game.world, rng = mulberry32(42);
  game.wildlife.agents = [];
  const trees = TREES[map];
  // patchy: about two tiles in three wooded, with a few open strips the troop has to go round or down to cross
  for (let x = 28; x < 54; x++) for (let z = 20; z < 46; z++) {
    if (forest === 'patchy' && (rng() < .3 || x === 41 && z % 6 < 3)) continue;
    w.setPlant(w.idx(x, z), PLANT[(x + z) % 3 ? trees[0] : trees[1]], .55 + rng() * .45);
  }
  // (each starts up a tree: the spawn spot is nudged onto the nearest wooded tile)
  for (let n = 0; n < count; n++) {
    let x = 31 + (n * 5) % 20, z = 23 + (n * 7) % 20;
    for (let r = 0; !w.tree[w.idx(x, z)] && r < 40; r++) x += r % 2 ? 1 : 0, z += r % 2 ? 0 : 1;
    const a = game.wildlife.spawn(ANIMAL[sp], x, z, { silent: true, age: 1200 });
    a.x = x + .5; a.y = z + .5;
  }
  const scene = new THREE.Scene(), flora = new Flora(scene); flora.rebuild(game, true);
  const camera = new THREE.PerspectiveCamera(50, 1.6, .1, 500); camera.position.set(41, 30, 56); camera.lookAt(41, 2, 33); camera.updateMatrixWorld();
  const right = new THREE.Vector3(1, 0, 0), actors = new Actors(scene, flora);
  let time = 1; actors.update(game, right, time, camera, 600); game.speed = speed;
  const def = ANIMAL[sp], pace = climbPace(def) * (ANIMAL_SPEEDS[speed] || 0);
  const last = new Map(), still = new Map(), lags = [], ms = [];
  const routes = new WeakSet(); let stretch = 0, routeN = 0, chaseTiles = 0, chaseTime = 0, simMoving = 0;
  let samples = 0, snaps = 0, stuck = 0, blocked = 0, dash = 0, ground = 0, crossings = 0, simTiles = 0, bodyTiles = 0, agentFrames = 0;
  for (let f = 0; f < frames; f++) {
    const before = new Map(game.wildlife.agents.map(a => [a.id, [a.x, a.y]]));
    game.update(1 / 30); flora.rebuild(game); time += 1 / 30;
    const t0 = performance.now(); actors.update(game, right, time, camera, 600); ms.push(performance.now() - t0);
    for (const a of game.wildlife.agents) {
      if (a.sp !== def.index) continue;
      agentFrames++;
      const b = before.get(a.id); if (b) { const m = Math.hypot(a.x - b[0], a.y - b[1]); simTiles += m; if (m > 1e-4) simMoving++; }
      if (a.move === 'ground') { ground++; last.delete(a.id); continue; }
      const st = actors.pose.get(a.id);
      if (!st?.branchPoint || st.visible === false) { last.delete(a.id); continue; }
      samples++;
      const p = st.branchPoint, lag = Math.hypot(p.x - a.x, p.z - a.y); lags.push(lag);
      const prev = last.get(a.id);
      if (prev) {
        const moved = Math.hypot(p.x - prev.x, p.z - prev.z);
        bodyTiles += moved;
        if (moved > .5) snaps++;
        else if (moved * 30 > Math.max(.05, pace * 2.2) && !st.canopyLeap) dash++;
        if (prev.site !== st.branchAt?.site && prev.site && st.branchAt?.site) crossings++;
        const s = still.get(a.id) || { at: p.clone(), t: 0 };
        if (p.distanceTo(s.at) < .02 && lag > 1) { s.t += 1 / 30; if (s.t >= 1) stuck++; }
        else { s.at.copy(p); s.t = 0; }
        still.set(a.id, s);
      }
      const r = st.branchRoute;
      if (r && !r.blocked && !routes.has(r) && r.startPoint && r.target) {
        routes.add(r); let len = 0, q0 = r.startPoint;
        for (const q1 of r.points) { len += q0.distanceTo(q1); q0 = q1; }
        const flat = Math.hypot(r.target.point.x - r.startPoint.x, r.target.point.z - r.startPoint.z);
        if (flat > .3) { stretch += len / flat; routeN++; }
      }
      if (prev && lag > .7) { chaseTiles += Math.hypot(p.x - prev.x, p.z - prev.z); chaseTime += 1 / 30; }
      if (r?.blocked) blocked++;
      last.set(a.id, { x: p.x, z: p.z, site: st.branchAt?.site });
    }
  }
  lags.sort((x, y) => x - y); ms.sort((x, y) => x - y);
  const q = (arr, k) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * k))] : 0;
  const share = n => samples ? (100 * n / samples).toFixed(1) + '%' : '-';
  return { sp, forest, speed, samples, lagMean: lags.reduce((s, v) => s + v, 0) / (lags.length || 1), lagP95: q(lags, .95),
    over1: share(lags.filter(v => v > 1).length), snaps, stuck: share(stuck), blocked: share(blocked), dash: share(dash),
    ground: agentFrames ? (100 * ground / agentFrames).toFixed(1) + '%' : '-', crossings, simTiles, bodyTiles,
    stretch: routeN ? stretch / routeN : 0, chase: chaseTime ? chaseTiles / chaseTime / (climbSpeed(def) * (ANIMAL_SPEEDS[speed] || 0)) : 0, moving: 100 * simMoving / (agentFrames || 1),
    actorsMs: ms.reduce((s, v) => s + v, 0) / ms.length, actorsP95: q(ms, .95) };
}

console.log(`${forest} forest, speed ${speed}, ${frames / 30} s at 30 fps, ${count} each`);
console.log('species    lag mean/p95  >1 tile  snaps  stuck  blocked  dash   ground  crossings  sim/body tiles   Actors ms mean/p95  route stretch  chase/sim pace  sim moving');
for (const sp of list.split(',')) {
  const r = measure(sp);
  console.log(`${sp.padEnd(10)} ${r.lagMean.toFixed(2)}/${r.lagP95.toFixed(2)}`.padEnd(25) + ` ${r.over1.padStart(6)}  ${String(r.snaps).padStart(5)}  ${r.stuck.padStart(5)}  ${r.blocked.padStart(6)}  ${r.dash.padStart(5)}  ${r.ground.padStart(6)}  ${String(r.crossings).padStart(9)}  ${r.simTiles.toFixed(0).padStart(6)}/${r.bodyTiles.toFixed(0).padEnd(6)}  ${r.actorsMs.toFixed(2)}/${r.actorsP95.toFixed(2)}           ${r.stretch.toFixed(2)}          ${r.chase.toFixed(2)}        ${r.moving.toFixed(0)}%`);
}
