// Run seed (docs/decisions/0035-fire-randomness-deadwood.md): every new game keeps the map's fixed
// layout but gets its own weather, fires and events; a given run seed replays exactly; the run seed
// and the random-number state survive a save; tools that pass no run seed get the old fixed sequence.
//   node tools/run-seed-check.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
// Seeded before the game loads: the wildlife still draws from Math.random, and an exact replay needs it fixed.
let lcg = 1;
const reseed = s => { lcg = s; };
Math.random = () => ((lcg = (lcg * 1103515245 + 12345) % 2147483648) / 2147483648);
const { Game } = await import('../js/game.js');

let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }

// A game's history over `days`: the weather each day and every fire (day, tile, tiles burned).
function history(map, runSeed, days = 120 * 3) {
  reseed(7);
  const g = new Game();
  if (runSeed === undefined) g.newGame(1987, 'free', 'standard', map); else g.newGame(1987, 'free', 'standard', map, runSeed);
  const weather = [], fires = [];
  let last = g.events.lastFire;
  for (let d = 0; d < days; d++) {
    g.dailyTick();
    weather.push(g.weather[0]);
    if (g.events.lastFire !== last) { last = g.events.lastFire; fires.push([g.day, g.events.fireStart]); }
  }
  return { g, weather: weather.join(''), fires: JSON.stringify(fires), layout: g.world };
}

check('Two run seeds give different weather and fire histories on the same land', () => {
  const a = history('serengeti', 11), b = history('serengeti', 12);
  assert.notEqual(a.weather, b.weather, 'weather differs');
  assert.notEqual(a.fires, b.fires, 'fires differ');
  // the land they started on was the same (check a fresh pair: the days above changed it)
  const g1 = new Game(), g2 = new Game();
  g1.newGame(1987, 'free', 'standard', 'serengeti', 11); g2.newGame(1987, 'free', 'standard', 'serengeti', 12);
  for (const k of ['terrain', 'tree', 'ground', 'feature']) assert.deepEqual(g1.world[k], g2.world[k], `same starting ${k}`);
});

check('The same run seed replays exactly', () => {
  const a = history('serengeti', 99), b = history('serengeti', 99);
  assert.equal(a.weather, b.weather); assert.equal(a.fires, b.fires);
  assert.deepEqual(a.g.world.tree, b.g.world.tree); assert.equal(a.g.rng.state(), b.g.rng.state());
});

check('Leaving out the run seed gives the old fixed sequence (seed * 31 + 7)', () => {
  const a = history('pnw', undefined, 120), b = history('pnw', (1987 * 31 + 7) >>> 0, 120);
  assert.equal(a.g.runSeed, (1987 * 31 + 7) >>> 0);
  assert.equal(a.weather, b.weather);
});

check('randomRunSeed gives a fresh 32-bit seed each time', () => {
  const s = new Set(Array.from({ length: 50 }, () => Game.randomRunSeed()));
  assert.ok(s.size >= 49); for (const v of s) assert.ok(Number.isInteger(v) && v >= 0 && v < 2 ** 32);
});

check('A save keeps the run seed and carries on exactly where it left off', () => {
  reseed(3);
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw', 4242);
  for (let d = 0; d < 60; d++) g.dailyTick();
  const data = g.saveData();
  assert.equal(data.runSeed, 4242);
  const h = new Game();
  assert.ok(h.restoreSave(structuredClone(data)), 'the save loads');
  assert.equal(h.runSeed, 4242); assert.equal(h.rng.state(), g.rng.state());
  assert.equal(h.rng(), g.rng(), 'the next draw is the same');
  // an older save without a run seed still loads, with its random-number state
  const old = g.saveData(); delete old.runSeed;
  const o = new Game(); assert.ok(o.restoreSave(structuredClone(old)));
  assert.equal(o.runSeed, null); assert.equal(o.rng.state(), g.rng.state());
});

console.log(`run-seed-check: ${checks} checks passed`);
