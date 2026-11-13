// The simulation's random numbers are its own (decision 0035, js/sim/sim-random.js): a seeded game
// replays exactly however many times something else draws Math.random in between. three.js draws
// Math.random for every geometry's UUID, so before this a new animal or plant model sent the
// simulation down another path and seeded checks flipped pass/fail by luck.
//   node tools/sim-rng-check.mjs
import assert from 'node:assert/strict';
import { BoxGeometry } from '../vendor/three/three.module.js';
import { hashStr } from '../js/rng.js';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');

let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }

// A seeded game run for `days` (wildlife steps and daily ticks); `between` runs after every step.
// Returns a hash of everything the simulation decides: where each animal is and what it does,
// populations, plants, weather, fires and visitors.
function run(map, runSeed, days, between = () => {}) {
  const g = new Game();
  g.newGame(1987, 'free', 'standard', map, runSeed);
  const DT = 0.05;
  for (let d = 0; d < days; d++) {
    for (let k = 0; k < 1 / DT; k++) { g.wildlife.update(DT); g.visitors.update(DT); between(); }
    g.dailyTick(); between();
  }
  const r = n => Math.round(n * 1e4);
  const animals = g.wildlife.agents.map(a => [a.id, a.sp, r(a.x), r(a.y), a.state, r(a.hunger || 0)].join(',')).join(';');
  const pops = g.wildlife.state.map(s => s.pop).join(',');
  const w = g.world, plants = [w.tree, w.shrub, w.ground].map(a => hashStr(Array.from(a).join(','))).join(',');
  const visitors = g.visitors.agents.map(a => [r(a.x), r(a.y)].join(',')).join(';');
  return { hash: hashStr([animals, pops, plants, JSON.stringify(g.weather), g.events.lastFire, visitors, g.rng.state(), g.wildRng.state()].join('|')), agents: g.wildlife.agents.length };
}

const plain = run('serengeti', 11, 6);
check('Extra Math.random draws between ticks leave a seeded game unchanged', () => {
  const noisy = run('serengeti', 11, 6, () => { for (let i = 0; i < 1000; i++) Math.random(); });
  assert.ok(plain.agents > 0, 'the game has animals');
  assert.equal(noisy.hash, plain.hash);
});
check('A new geometry between ticks (three.js draws a UUID) leaves a seeded game unchanged', () => {
  const geo = run('serengeti', 11, 6, () => new BoxGeometry(1, 1, 1).dispose());
  assert.equal(geo.hash, plain.hash);
});
check('Hollis visitors and wildlife replay too', () => {
  const a = run('pnw', 5, 4), b = run('pnw', 5, 4, () => { for (let i = 0; i < 1000; i++) Math.random(); });
  assert.equal(b.hash, a.hash);
});
check('Another run seed takes another path (the hash sees the difference)', () => {
  assert.notEqual(run('serengeti', 12, 6).hash, plain.hash);
});
console.log(`sim-rng-check: ${checks} checks passed`);
