// Headless: sandbox money (never limits building, books nothing, survives a save) and the Invasive
// species setting (kept when a saved farm is loaded, and no invasive seedling takes while it is off).
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { saves, saveChecksum } from '../js/saves.js';
import { ToolActions } from '../js/tool-actions.js';

let checks = 0;
const check = (name, run) => { run(); checks++; console.log('PASS ' + name); };

check('Sandbox: every price is affordable, nothing is spent or booked, grants add nothing', () => {
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw');
  g.money = 0;
  assert.equal(g.canAfford(1e9), false); // (a normal game stays tight: decision 0001)
  assert.equal(g.spend(100), false);
  g.flags.sandbox = true;
  assert.equal(g.canAfford(1e9), true);
  assert.equal(g.spend(100), true);
  g.pay(50, 'trails'); g.grant(1000, 'goal'); g.earn(10);
  assert.equal(g.money, 0); assert.equal(g.stats.spent, 0); assert.equal(g.stats.earned, 0);
  assert.deepEqual(g.ledger, { in: {}, out: {} });
});

check('Sandbox is saved with the farm and a normal farm has none', () => {
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw');
  assert.equal(g.sandbox, false);
  g.flags.sandbox = true;
  const h = new Game();
  assert.equal(h.restoreSave(structuredClone(g.saveData())), true);
  assert.equal(h.sandbox, true);
});

check('The Invasive species setting survives loading a saved farm', () => {
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw');
  const data = g.saveData();
  const snapshot = { data, checksum: saveChecksum(data), savedAt: 1 };
  const h = new Game(); h.newGame(1987, 'free', 'standard', 'pnw'); h.invasives = false;
  assert.equal(h.restoreSnapshot(snapshot), true);
  assert.equal(h.invasives, false);
});

check('With invasives off none take root or spread over four years', () => {
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw'); g.invasives = false;
  const w = g.world, P = g.catalog.plants;
  const count = () => { let n = 0; for (let i = 0; i < w.n; i++) if ((w.ground[i] && P[w.ground[i]].invasive) || (w.shrub[i] && P[w.shrub[i]].invasive) || (w.tree[i] && P[w.tree[i]].invasive)) n++; return n; };
  const start = count();
  for (let d = 0; d < 480; d++) g.dailyTick();
  assert.ok(count() <= start, `invasives grew from ${start} to ${count()}`);
});

console.log(`${checks} sandbox checks passed`);
