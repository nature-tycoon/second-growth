// node tools/animal-course-check.mjs
// Curved journeys (js/sim/animal-course.js): a walk of six tiles or more follows a curve rather
// than the route search's staircase of tile rows and columns, the same corridor gets the same bends
// every time, and an animal walking beside a worn track steps into it.
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { mulberry32 } from '../js/rng.js';
import { T, DAYS_PER_YEAR } from '../js/config.js';
import { shapeCourse } from '../js/sim/animal-course.js';
import { trailSample } from '../js/sim/animal-trails.js';

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('PASS ' + name); };
function setup() {
  Math.random = mulberry32(7); const g = new Game(); g.newGame(7, 'free', 'standard', 'pnw'); g.day = 20;
  const w = g.world, wl = g.wildlife; wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6;
  w.terrain.fill(T.SOIL); w.struct.fill(-1); w.feature.fill(0); w.fire.fill(0); w.flood.fill(0); w.tree.fill(0); w.shrub.fill(0); w.ground.fill(0); w.distWater.fill(99); wl.suit.forEach(s => s.fill(1));
  return { g, w, wl };
}
function deer(s, x, y) {
  const d = s.g.catalog.animal.deer, a = s.wl.spawn(d, Math.floor(x), Math.floor(y), { silent: true, age: 3 * DAYS_PER_YEAR });
  Object.assign(a, { x, y, state: 'idle', wait: 99, thirst: 0, hunger: 0 }); return a;
}
// Walk a to tile (tx, ty) and return the positions it passed through.
function walk(s, a, tx, ty) {
  const dest = s.w.idx(tx, ty), track = [];
  assert.ok(s.wl.pathTo(a, j => j === dest, 4000));
  for (let k = 0; k < 4000 && a.state === 'walk'; k++) { s.wl.update(0.05); track.push([a.x, a.y]); }
  assert.equal(a.state, 'idle', 'the walk finishes');
  return track;
}

check('A long walk across open ground curves instead of following tile rows and columns', () => {
  const s = setup(), a = deer(s, 30.5, 30.5), track = walk(s, a, 52, 41);
  let axis = 0, steps = 0, off = 0;
  for (let k = 1; k < track.length; k++) {
    const dx = track[k][0] - track[k - 1][0], dy = track[k][1] - track[k - 1][1], d = Math.hypot(dx, dy);
    if (d < 1e-4) continue;
    steps++; if (Math.abs(dx) < d * 0.1 || Math.abs(dy) < d * 0.1) axis++;
    // distance from the straight line between the ends
    const [x, y] = track[k], L = Math.hypot(52.5 - 30.5, 41.5 - 30.5);
    off = Math.max(off, Math.abs((x - 30.5) * (41.5 - 30.5) - (y - 30.5) * (52.5 - 30.5)) / L);
  }
  assert.ok(axis / steps < 0.3, `only ${(100 * axis / steps).toFixed(0)}% of steps run along a row or column`);
  assert.ok(off > 0.25 && off < 2.2, `bends ${off.toFixed(2)} tiles off the straight line`);
});

check('The same corridor gets the same bends, whoever walks it', () => {
  const s = setup(), a = deer(s, 30.5, 30.5), b = deer(s, 30.5, 30.5);
  for (const x of [a, b]) { s.wl.pathTo(x, j => j === s.w.idx(50, 44), 4000); shapeCourse(s.wl, x, s.g.catalog.animal.deer); }
  assert.deepEqual(a.path, b.path);
  assert.deepEqual([...a.course.pts].map(v => v.toFixed(3)), [...b.course.pts].map(v => v.toFixed(3)));
});

check('An animal walking beside a worn track steps into it', () => {
  const s = setup(), a = deer(s, 30.5, 30.5);
  for (let n = 0; n < 30; n++) { a.x = 30.5; a.y = 30.5; walk(s, a, 54, 31); }
  const worn = (x, y) => trailSample(s.w, x, y);
  // a second animal sets off a tile to the side, for the same place
  const b = deer(s, 30.5, 31.5), track = walk(s, b, 54, 31);
  const mid = track.filter(([x]) => x > 38 && x < 46);
  const on = mid.filter(([x, y]) => worn(x, y) > 0.05).length / mid.length;
  assert.ok(on > 0.6, `walks on the worn track ${(100 * on).toFixed(0)}% of the shared stretch`);
});

check('Shaping a journey is cheap', () => {
  const s = setup(), a = deer(s, 30.5, 30.5), d = s.g.catalog.animal.deer, t0 = performance.now();
  let n = 0;
  for (; n < 300; n++) { a.x = 20.5 + n % 7; a.y = 20.5 + n % 5; s.wl.pathTo(a, j => j === s.w.idx(60 + n % 9, 50 - n % 11), 6000); shapeCourse(s.wl, a, d); }
  const ms = (performance.now() - t0) / n;
  assert.ok(ms < 2, `${ms.toFixed(2)} ms a journey (route search included)`);
  console.log(`  ${ms.toFixed(2)} ms a 40-tile journey, route search included`);
});
console.log(`${passed} curved journey checks passed.`);
