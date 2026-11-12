// node tools/canopy-links-check.mjs
// Primates cross only between crowns they can really span (decision 0041): the simulation's
// crownsJoin agrees with the drawing, an orangutan climbs down and walks a gap and climbs the far
// tree, a siamang leaps a gap in an arc with an arm held out ahead instead of floating across, and
// walker monkeys are unaffected.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { mulberry32 } = await import('../js/rng.js');
const { canopyFixture } = await import('./canopy-support-fixture.mjs');
const { Flora } = await import('../js/render3d/flora.js');
const { Actors } = await import('../js/render3d/actors.js');
const { ANIMAL } = await import('../js/data/animals.js');
const { PLANT } = await import('../js/data/plants.js');
const { crownsJoin, crossGap } = await import('../js/sim/canopy-links.js');
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };

function stand(map, key, trees) {
  Math.random = mulberry32(7);
  const { game } = canopyFixture(map, key), w = game.world;
  game.wildlife.agents = [];
  for (const [x, z, plant, g] of trees) w.setPlant(w.idx(x, z), PLANT[plant], g);
  return { game, w };
}

check('Big interlaced crowns join for an orangutan; a sapling beside a giant does not', () => {
  const { game, w } = stand('sumatra', 'orangutan', [[40, 32, 'meranti', 1], [41, 32, 'meranti', 1], [40, 33, 'meranti', .5]]);
  const ou = ANIMAL.orangutan, ape = ANIMAL.siamang;
  const big = [[40, 32], [41, 32]].map(([x, z]) => w.idx(x, z)), small = w.idx(40, 33);
  assert.ok(!crownsJoin(w, small, big[0], ou), 'an orangutan cannot reach up from a half-grown crown into a giant');
  assert.ok(!crownsJoin(w, small, big[0], ape), 'nor can a siamang leap that far up');
  assert.ok(crownsJoin(w, big[0], small, ape), 'a siamang can drop from the giant down into it');
  // (whether two full-grown merantis interlace depends on each tile's size variation; the walker monkeys never need to)
  for (const k of ['howler', 'capuchin', 'langur']) if (ANIMAL[k]) assert.ok(crownsJoin(w, small, big[0], ANIMAL[k]), `${k} always finds a way`);
  void game;
});

check('An orangutan climbs down at a gap, walks it on the ground and climbs the far tree', () => {
  const { game, w } = stand('sumatra', 'orangutan', [[40, 32, 'meranti', .5], [41, 32, 'meranti', 1], [42, 32, 'meranti', 1]]);
  const a = game.wildlife.spawn(ANIMAL.orangutan, 40, 32, { silent: true, age: 1200 });
  a.x = 40.5; a.y = 32.5; a.state = 'idle'; a.wait = 0;
  const far = w.idx(42, 32);
  assert.ok(!crownsJoin(w, w.idx(40, 32), w.idx(41, 32), ANIMAL.orangutan), 'the fixture has a gap the arms cannot span');
  assert.ok(game.wildlife.pathTo(a, j => j === far, 200), 'a path is found over the ground');
  let down = false, up = false;
  for (let k = 0; k < 4000 && a.state === 'walk'; k++) {
    game.wildlife.update(.01);
    if (a.move === 'ground') down = true;
    if (down && a.move === 'tree') up = true;
  }
  assert.ok(down, 'it came down to cross');
  assert.ok(up && a.move === 'tree' && a.gapTo == null, 'and went back up into the far tree');
  // (crossGap leaves joined crowns alone)
  a.move = 'tree'; a.gapTo = null; crossGap(game.wildlife, a, ANIMAL.orangutan, far);
  assert.equal(a.move, 'tree');
});

check('A siamang leaps a gap in an arc, arm reaching ahead, and lands on the far tree', () => {
  const { game, w } = stand('sumatra', 'siamang', [[40, 32, 'durian', 1], [41, 32, 'durian', 1]]);
  const a = game.wildlife.spawn(ANIMAL.siamang, 40, 32, { silent: true, age: 1200 });
  a.x = 40.5; a.y = 32.5; a.state = 'idle'; a.wait = 1e9;
  const scene = new THREE.Scene(), flora = new Flora(scene); flora.rebuild(game, true);
  const actors = new Actors(scene, flora), right = new THREE.Vector3(1, 0, 0);
  let time = 1; actors.update(game, right, time); game.speed = 1;
  a.x = 41.5; // (the simulation moves on to the next tree; the body has to cross)
  let flights = 0, maxLift = 0, held = true, landed = false, last = null;
  for (let f = 0; f < 600 && !landed; f++) {
    time += 1 / 30; actors.update(game, right, time);
    const st = actors.pose.get(a.id);
    if (st.canopyLeap) {
      flights++; maxLift = Math.max(maxLift, st.canopyLeap.lift);
      const c = ((st.branchPhase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
      if (last != null && flights > 8 && Math.abs(c - .46) > .02) held = false;
      last = c;
    } else if (flights && st.branchAt?.site?.cell?.[0] === 41) landed = true;
  }
  assert.ok(flights > 0, 'it leapt');
  assert.ok(flights <= 30, `the flight took ${flights} frames: under a second, not a slow float`);
  assert.ok(maxLift > .02, 'the flight arcs up above the straight line');
  assert.ok(held, 'its arm stays reaching ahead through the flight instead of swinging at the air');
  assert.ok(landed, 'it caught the far tree');
  void w;
});

console.log(`${checks} canopy link checks passed`);
