// Paired dailyTick A/B between two checkouts, on one grown world:
//   node tools/daily-tick-ab.mjs <newRepo> <oldRepo> <world.bin> [years=120] [blocks=30]
// If <world.bin> doesn't exist, grows a PNW restore world for [years] with the new code and saves it there.
// Both builds load the same world and alternate 60-day blocks (timing dailyTick only). Each block starts
// from the saved world again, so both builds always run on identical land; RESET=0 lets the worlds drift
// apart instead, which also counts what each build's ecology grows. Run both load orders (swap the repos):
// differences under about 3 points from one pair are noise. See docs/decisions/0017 (Phase 6 results).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import v8 from 'node:v8';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
let lcg = 1; Math.random = () => ((lcg = (lcg * 1103515245 + 12345) % 2147483648) / 2147483648);
const [NEW, OLD, SAVE] = process.argv.slice(2, 5).map(p => p && resolve(p));
if (!SAVE) { console.log('usage: node tools/daily-tick-ab.mjs <newRepo> <oldRepo> <world.bin> [years] [blocks]'); process.exit(1); }
const years = +(process.argv[5] || 120), blocks = +(process.argv[6] || 30), RESET = process.env.RESET !== '0';
const A = await import('file://' + NEW + '/js/game.js'), B = await import('file://' + OLD + '/js/game.js');
const { hashStr } = await import('file://' + NEW + '/js/rng.js');
let data;
if (existsSync(SAVE)) data = v8.deserialize(readFileSync(SAVE));
else {
  const { ToolActions } = await import('file://' + NEW + '/js/tool-actions.js');
  const { hollisRestorePlan } = await import('file://' + NEW + '/tools/hollis-restore-plan.mjs');
  const g = new A.Game(); g.newGame(1987, 'free', 'standard', 'pnw'); g.rng.setState(hashStr('pnw:1'));
  const plan = hollisRestorePlan(g, ToolActions);
  for (let d = 0; d < years * 120; d++) { plan.day(d); g.dailyTick(); g.wildlife.update(1.0); }
  data = g.saveData();
  writeFileSync(SAVE, v8.serialize(data));
  console.log('grew', years, 'years into', SAVE);
}
const Game = { new: A.Game, old: B.Game }, games = {};
const load = (k, seed) => { const g = new Game[k](); if (!g.restoreSave(structuredClone(data))) throw new Error('restore failed: ' + k); g.rng.setState(hashStr(seed)); return g; };
for (const k of ['new', 'old']) games[k] = load(k, 'ab');
const ms = { new: [], old: [] };
for (let b = 0; b < blocks; b++) {
  for (const k of b % 2 ? ['old', 'new'] : ['new', 'old']) {
    if (RESET) games[k] = load(k, 'ab' + b);
    const g = games[k]; let t = 0;
    for (let d = 0; d < 60; d++) { const t0 = performance.now(); g.dailyTick(); t += performance.now() - t0; g.wildlife.update(1.0); }
    ms[k].push(t / 60);
  }
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => Math.sqrt(a.reduce((x, y) => x + (y - mean(a)) ** 2, 0) / (a.length - 1));
const diffs = ms.new.map((v, i) => v - ms.old[i]);
console.log(`new ${mean(ms.new).toFixed(3)} ms, old ${mean(ms.old).toFixed(3)} ms per dailyTick: ${(mean(diffs) / mean(ms.old) * 100).toFixed(1)}% ± ${(sd(diffs) / Math.sqrt(diffs.length) / mean(ms.old) * 100).toFixed(1)}% (paired SE, ${blocks} blocks, ${RESET ? 'same land each block' : 'worlds drifting'})`);
