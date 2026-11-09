// Where a game day's whole-map work goes, after a seeded run of a few years (finding 3 of the
// 2026-10-23 performance review): dailyTick split into its parts, and updateEnvironment into its own.
//   node tools/daily-env-profile.mjs [maps=sumatra,amazon,serengeti] [years=2] [days=60] [--fresh]
// It grows play-profile's game (a restored farm, release fixture 'forest'); --fresh starts a new farm.
// Seed Math.random as /balance does (an LCG) so runs compare between checkouts.
let s = 7; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
const root = new URL('../js/', import.meta.url).href;
globalThis.localStorage = { getItem() { return null }, setItem() {}, removeItem() {} };
const { Game } = await import(root + 'game.js');
const { releaseGame } = await import('./release-fixtures.mjs');
const fixture = process.argv.includes('--fresh') ? null : 'forest'; // (the review's game: a restored farm, play-profile's)
const env = await import(root + 'sim/environment.js');
const argv = process.argv.filter(a => !a.startsWith('--'));
const maps = (argv[2] || 'sumatra,amazon,serengeti').split(',');
const years = +(argv[3] || 2), days = +(argv[4] || 60);
const med = a => { const v = [...a].sort((x, y) => x - y); return v[v.length >> 1]; };
const now = () => performance.now();
for (const map of maps) {
  let g;
  if (fixture) { g = releaseGame(map, fixture).game; s = 7; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
  else { s = 7; g = new Game(); g.newGame(1987, undefined, undefined, map); }
  for (let d = 0; d < years * 120; d++) { g.dailyTick(); for (let k = 0; k < 10; k++) g.wildlife.update(0.1); }
  const w = g.world, T = {};
  const add = (k, ms) => (T[k] ||= []).push(ms);
  for (let d = 0; d < days; d++) {
    g.finishDay();
    const run = g.dayWork();
    let t = now(); run.next(); add('part1 (water, meadows, env)', now() - t);
    t = now(); run.next(); add('part2 (plants, seeds)', now() - t);
    t = now(); for (const _ of run); add('part3 (wildlife, events, month)', now() - t);
    t = now(); for (let k = 0; k < 20; k++) { g.wildlife.update(0.05); g.visitors.update(0.05); } add('animal steps (a day of them)', now() - t);
    // The environment's parts again on the same state (each is a pure recomputation of it)
    t = now(); env.updateDisturbance(w, g.visitors.traffic); add(' disturbance', now() - t);
    t = now(); env.updateCanopy(w, g.month); add(' canopy', now() - t);
    t = now(); env.updateMoisture(w, g.month); add(' moisture', now() - t);
    t = now(); env.updateDistances(w); add(' distances', now() - t);
    const stats = w.catalog.definition.stats; let st = 0;
    if (stats) w.catalog.definition.stats = (...a) => { const t0 = now(); stats(...a); st = now() - t0; };
    t = now(); env.classifyAndResources(w, g.month); const c = now() - t;
    if (stats) w.catalog.definition.stats = stats;
    add(' classify (without map stats)', c - st); if (stats) add(' map stats', st);
    t = now(); env.updateEnvironment(w, g.month, g.visitors.traffic); add(' updateEnvironment', now() - t);
  }
  const tot = T['part1 (water, meadows, env)'].map((v, i) => v + T['part2 (plants, seeds)'][i] + T['part3 (wildlife, events, month)'][i]);
  const day = med(tot), steps = med(T['animal steps (a day of them)']);
  console.log(`${map} after ${years} y, ${days} days, ${w.w}x${w.h}: dailyTick median ${day.toFixed(2)} ms; at top speed (8 days/s, 60 fps) ${((day + steps) * 8 / 60).toFixed(2)} ms of simulation a frame`);
  for (const [k, a] of Object.entries(T)) console.log(`  ${k.padEnd(32)} ${med(a).toFixed(2)}`);
}
