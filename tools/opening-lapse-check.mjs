// The first visit's guided planting reads as success after the time-lapse (docs/ideas/2026-11-21-
// first-minutes/timelapse-2.md): on PNW, the opening (fence and culvert out) and its three guided steps
// as a player who does only what each asks (ui/opening-plan.js: every blackberry stand pulled by the
// button, then strokes along the highlighted creek bank until TREES are in, and across the meadow
// patch until MEADOW are), then ten years stepped exactly as the time-lapse
// steps them (Game.lapseDay). Three run seeds, judged on the median:
//   - trees are up on the stretch of creek the player planted (the one the time-lapse looks at): at least
//     20 standing within 3 tiles of the creek, grown past 0.6 on average
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
  let stretch = new Set(); // (the highlighted stretch the player planted and the time-lapse looks at, once the site is known)
  const count = () => {
    let bb = 0, bankBB = 0, trees = 0, grown = 0;
    for (let i = 0; i < w.n; i++) if (isBB(i)) bb++;
    for (const i of banks) { if (isBB(i)) bankBB++; if (stretch.has(i) && w.tree[i]) { trees++; grown += w.treeG[i]; } }
    return { bb, bankBB, trees, growth: trees ? grown / trees : 0 };
  };
  const start = count();
  // the guided steps as a player who does only what's asked does them: the pull by its button, the
  // trees and the meadow by strokes of the brush along the hint's line, stopping the moment the step
  // is done (`need` plants inside the highlighted tiles), not the whole creek
  let site = null; const spent = {}, strokes = {};
  for (const k of STEPS) {
    const plan = stepPlan(g, k, () => true, site);
    assert.ok(plan, `the ${k} step applies on PNW (run seed ${runSeed})`);
    site = plan.site; const m = g.money;
    if (!plan.need) assert.ok(act.apply(plan.tool, plan.tiles)?.count > 0, `the ${k} step does something`);
    else {
      const band = new Set(plan.tiles), STROKE = 8;
      let got = 0, n = 0;
      for (let at = 0; got < plan.need && at < plan.path.length; at += STROKE) {
        const s = act.begin(plan.tool);
        for (const p of plan.path.slice(at, at + STROKE)) act.paint(s, Math.floor(p.x), Math.floor(p.y), s.tool.size);
        act.end(s); n++;
        got += s.changed.filter(i => band.has(i)).length;
      }
      assert.ok(got >= plan.need, `a player can finish the ${k} step along its line (${got} of ${plan.need})`);
      strokes[k] = `${n} strokes, ${got} plants`;
    }
    spent[k] = Math.round(m - g.money);
  }
  stretch = new Set(banks.filter(i => Math.max(Math.abs(i % w.w - site.x), Math.abs(Math.floor(i / w.w) - site.y)) <= 19));
  const left = g.money;
  // ten years as the time-lapse steps them
  g.startLapse(60);
  for (let d = 0; d < years * DAYS_PER_YEAR; d++) for (const _ of g.lapseDay());
  g.stopLapse();
  const end = count();
  runs.push({ runSeed, start, end, spent, left });
  console.log(`  run seed ${runSeed}: ${JSON.stringify(strokes)}, spent ${JSON.stringify(spent)}, $${Math.round(left)} left; trees on the planted stretch ${end.trees} (growth ${end.growth.toFixed(2)}), creek blackberry ${start.bankBB} → ${end.bankBB}, farm blackberry ${start.bb} → ${end.bb}`);
}
const m = k => median(runs.map(r => k(r)));
assert.ok(m(r => r.left) >= 15000, `the steps leave at least $15,000 (median $${Math.round(m(r => r.left))})`);
assert.ok(m(r => r.end.trees) >= 20, `trees stand along the planted stretch of creek after ${years} years (median ${m(r => r.end.trees)})`);
assert.ok(m(r => r.end.growth) >= 0.6, `and they're well grown (median ${m(r => r.end.growth).toFixed(2)})`);
assert.ok(m(r => r.end.bankBB) <= m(r => r.start.bankBB), `blackberry along the creek hasn't come back (median ${m(r => r.end.bankBB)} vs ${m(r => r.start.bankBB)} at the start)`);
assert.ok(m(r => r.end.bb) <= 2 * m(r => r.start.bb), `blackberry on the farm stays within twice its start (median ${m(r => r.end.bb)} vs ${m(r => r.start.bb)})`);
console.log(`PASS opening-lapse: after ${years} years, median ${m(r => r.end.trees)} trees on the planted stretch (growth ${m(r => r.end.growth).toFixed(2)}), creek blackberry ${m(r => r.start.bankBB)} → ${m(r => r.end.bankBB)}, farm blackberry ${m(r => r.start.bb)} → ${m(r => r.end.bb)}`);
