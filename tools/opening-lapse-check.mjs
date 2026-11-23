// The first visit's guided planting reads as success after the time-lapse (docs/ideas/2026-11-21-
// first-minutes/timelapse-2.md): on PNW, the opening (fence and culvert out) and its three guided steps
// as the buttons do them (ui/opening-plan.js: every blackberry stand pulled, trees two tiles either
// side of the creek, a meadow patch beside them), then ten years stepped exactly as the time-lapse
// steps them (Game.lapseDay). Three run seeds, judged on the median:
//   - trees are up along the creek: at least 30 standing within 3 tiles of it, grown past 0.6 on average
//   - blackberry along the creek hasn't come back past where it started, and on the whole farm it
//     stays within twice its start (birds bring seed in from the neighbours; untended it grows ~16×)
//   - the steps leave at least $15,000 of the $30,000 start
//   node tools/opening-lapse-check.mjs [years=10]
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const root = new URL('../js/', import.meta.url).href;
const { Game } = await import(root + 'game.js');
const { T, F, DAYS_PER_YEAR } = await import(root + 'config.js');
const { ToolActions } = await import(root + 'tool-actions.js');
const { STEPS, stepPlan } = await import(root + 'ui/opening-plan.js');

const years = +(process.argv[2] || 10);
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const runs = [];
for (const runSeed of [5, 7, 11]) {
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw', runSeed);
  const w = g.world, act = new ToolActions(g), P = g.catalog.plants;
  // the opening: the north fence and the culvert out
  const fence = [], culvert = [];
  for (let x = 0; x < w.w; x++) if (w.feature[w.idx(x, 0)] === F.FENCE) fence.push(w.idx(x, 0));
  for (let i = 0; i < w.n; i++) if (w.feature[i] === F.CULVERT) culvert.push(i);
  act.apply('demolish', fence); act.apply('demolish', culvert);
  const near = (i, r) => { const x = i % w.w, y = (i / w.w) | 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (w.inb(x + dx, y + dy) && w.terrain[w.idx(x + dx, y + dy)] === T.CREEK) return true; return false; };
  const banks = [];
  for (let i = 0; i < w.n; i++) if (i >= w.w && w.terrain[i] !== T.CREEK && near(i, 3)) banks.push(i);
  const isBB = i => P[w.shrub[i]]?.key === 'blackberry';
  const count = () => {
    let bb = 0, bankBB = 0, trees = 0, grown = 0;
    for (let i = 0; i < w.n; i++) if (isBB(i)) bb++;
    for (const i of banks) { if (isBB(i)) bankBB++; if (w.tree[i]) { trees++; grown += w.treeG[i]; } }
    return { bb, bankBB, trees, growth: trees ? grown / trees : 0 };
  };
  const start = count();
  // the three guided steps, as their buttons do them
  let site = null; const spent = {};
  for (const k of STEPS) {
    const plan = stepPlan(g, k, () => true, site);
    assert.ok(plan, `the ${k} step applies on PNW (run seed ${runSeed})`);
    site = plan.site; const m = g.money;
    const s = act.apply(plan.tool, plan.tiles);
    assert.ok(s?.count > 0, `the ${k} step does something`);
    spent[k] = Math.round(m - g.money);
  }
  const left = g.money;
  // ten years as the time-lapse steps them
  g.startLapse(60);
  for (let d = 0; d < years * DAYS_PER_YEAR; d++) for (const _ of g.lapseDay());
  g.stopLapse();
  const end = count();
  runs.push({ runSeed, start, end, spent, left });
  console.log(`  run seed ${runSeed}: spent ${JSON.stringify(spent)}, $${Math.round(left)} left; creek trees ${start.trees} → ${end.trees} (growth ${end.growth.toFixed(2)}), creek blackberry ${start.bankBB} → ${end.bankBB}, farm blackberry ${start.bb} → ${end.bb}`);
}
const m = k => median(runs.map(r => k(r)));
assert.ok(m(r => r.left) >= 15000, `the steps leave at least $15,000 (median $${Math.round(m(r => r.left))})`);
assert.ok(m(r => r.end.trees) >= 30, `trees stand along the creek after ${years} years (median ${m(r => r.end.trees)})`);
assert.ok(m(r => r.end.growth) >= 0.6, `and they're well grown (median ${m(r => r.end.growth).toFixed(2)})`);
assert.ok(m(r => r.end.bankBB) <= m(r => r.start.bankBB), `blackberry along the creek hasn't come back (median ${m(r => r.end.bankBB)} vs ${m(r => r.start.bankBB)} at the start)`);
assert.ok(m(r => r.end.bb) <= 2 * m(r => r.start.bb), `blackberry on the farm stays within twice its start (median ${m(r => r.end.bb)} vs ${m(r => r.start.bb)})`);
console.log(`PASS opening-lapse: after ${years} years, median ${m(r => r.end.trees)} trees along the creek (growth ${m(r => r.end.growth).toFixed(2)}), creek blackberry ${m(r => r.start.bankBB)} → ${m(r => r.end.bankBB)}, farm blackberry ${m(r => r.start.bb)} → ${m(r => r.end.bb)}`);
