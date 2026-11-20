// Animals leaving the map get off it: young coho swim down the creek to the river and away, and
// anything that can't find a way out slips away after LEAVE_DAYS rather than staying for ever.
// (Stuck coho fry once piled up by the thousand: 2,340 of them in a 400-year Hollis game, never
// ageing, which made old farms steadily laggier: docs/performance-review-2026-10-23.md.)
// Run: node tools/leaving-check.mjs
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { F, T } from '../js/config.js';
import { ANIMAL, ANIMALS } from '../js/data/animals.js';
import { mulberry32 } from '../js/rng.js';
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const SALMON = ANIMALS.find(d => d.special === 'salmon');

function creekGame() {
  Math.random = mulberry32(1987);
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw'); g.autosave = false; g.day = 40;
  const w = g.world, wl = g.wildlife;
  for (let i = 0; i < w.n; i++) if (w.feature[i] === F.CULVERT) w.feature[i] = 0; // (an open passage, as restored)
  w.hydroDirty = true; g.refreshEnvironment();
  wl.agents = []; wl.recount();
  return g;
}
const day = g => { g.dailyTick(); for (let k = 0; k < 10; k++) g.wildlife.update(0.1); };

check('Young coho leaving the creek swim down it to the river and off the map', () => {
  const g = creekGame(), w = g.world, wl = g.wildlife;
  // creek tiles some way up from the river (straight south from most of them is dry land)
  const creek = [];
  for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.CREEK && w.connected[i]) creek.push(i);
  creek.sort((a, b) => b - a);
  const fry = creek.slice(8, 48).filter((_, k) => k % 5 === 0).map(i => wl.spawn(SALMON, i % w.w + 0.5, ((i / w.w) | 0) + 0.5, { juvenile: true, age: 0, silent: true }));
  assert.ok(fry.length >= 4, 'fry placed up the creek');
  const left = new Map(), remove = wl.remove.bind(wl);
  wl.remove = (a, cause) => { left.set(a, a.leaveDays || 0); return remove(a, cause); };
  for (const a of fry) wl.leave(a);
  for (let d = 0; d < 40; d++) day(g);
  wl.remove = remove;
  assert.equal(fry.filter(a => wl.agents.includes(a)).length, 0, 'every fry has gone');
  const swam = fry.filter(a => left.get(a) <= 20).length;
  assert.ok(swam >= 1, `some fry swam out within the allowance (${swam} of ${fry.length})`);
});

check('An animal that can never get off the map is gone after LEAVE_DAYS, not kept for ever', () => {
  const g = creekGame(), w = g.world, wl = g.wildlife;
  // a vole shut in a fenced square can't walk out
  const x = 30, y = 30;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === 2) w.struct[w.idx(x + dx, y + dy)] = 0;
  const a = wl.spawn(ANIMAL.vole, x + 0.5, y + 0.5, { silent: true });
  wl.leave(a);
  for (let d = 0; d < 10; d++) day(g);
  assert.ok(wl.agents.includes(a), 'still trying to leave after 10 days');
  for (let d = 0; d < 15; d++) day(g);
  assert.ok(!wl.agents.includes(a), 'gone after the allowance');
  assert.ok(wl.agents.every(o => !o.leaving || o.leaveDays <= 21), 'no leaver past the allowance');
});

console.log(`${checks} leaving checks passed.`);
