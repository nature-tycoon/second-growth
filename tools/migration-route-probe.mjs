// node tools/migration-route-probe.mjs [years=6] [seeds=7,11,23] [--grid]
// Where the Serengeti migration goes on the range, year by year (idea batch cinema-creeks s8).
// A restored range with the fences down runs seeded years through the real daily tick and the
// wildlife update. For every migrating herd animal (a species with `crossing`) on the map it
// records, per year and season month: the herds' mean position, and how green the grass under
// them is against the range's grass as a whole that day. Prints per seed and year:
//   cross  the column the herds swam the river at
//   months each month's mean position (x,y; y 0 is the north edge, the park)
//   green  mean greenness under the herds on land / mean over all the grass that day (>1: they find
//          the green); 'standing/feeding' counts only herds standing or grazing, not walking;
//          'pasture before grazing' leaves out how far the grass is eaten down (theirs included)
// and per seed: how far the years' routes differ (mean distance between the same month's
// positions in different years) and whether each year still runs south to north (the loop).
// The greenness measure is this probe's own copy, so it reads HEAD and the change the same way.
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { clamp, isWater } from '../js/config.js';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const years = +(args[0] || 6);
const seeds = (args[1] || '7,11,23').split(',').map(Number);
const MONTHS = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'];
const GRASS = new Set(['grass', 'tallgrass', 'sedge']);
const green = (w, i, eaten = true) => {
  const p = w.catalog.plants[w.ground[i]];
  if (!p || !GRASS.has(p.look.type) || w.fire[i]) return 0;
  return clamp(w.groundG[i] * (eaten ? 1 - 0.7 * Math.min(1, w.grazed?.[i] || 0) : 1) * clamp(0.25 + 1.5 * w.moist[i], 0.15, 1), 0, 1);
};

const summary = [];
for (const seed of seeds) {
  Math.random = mulberry32(seed);
  const g = restoredGame('serengeti', 1987, seed), w = g.world, wl = g.wildlife;
  const migrant = new Set(g.catalog.animals.filter(d => d.crossing).map(d => d.index));
  const yrs = [];
  let lastCross = null;
  for (let d = 0; d < years * 120; d++) {
    g.dailyTick();
    for (let k = 0; k < 10; k++) wl.update(0.1);
    const y = Math.floor(d / 120), m = g.month;
    const Y = yrs[y] ||= { cross: [], months: {}, gUnder: 0, gAll: 0, n: 0 };
    if (wl.crossingAt && wl.crossingAt !== lastCross) { lastCross = wl.crossingAt; Y.cross.push(wl.crossingAt.x); }
    let allSum = 0, allN = 0, pSum = 0;
    for (let i = 0; i < w.n; i++) { const p = w.catalog.plants[w.ground[i]]; if (p && GRASS.has(p.look.type)) { allSum += green(w, i); pSum += green(w, i, false); allN++; } }
    const mean = allN ? allSum / allN : 0, pMean = allN ? pSum / allN : 0;
    for (const a of wl.agents) {
      if (!migrant.has(a.sp) || a.leaving || !w.inb(Math.floor(a.x), Math.floor(a.y))) continue;
      const i = w.idx(Math.floor(a.x), Math.floor(a.y));
      if (isWater(w.terrain[i])) continue; // (swimming the river, wading a pond: not choosing grass)
      const M = Y.months[m] ||= { x: 0, y: 0, n: 0 };
      M.x += a.x; M.y += a.y; M.n++;
      Y.gUnder += green(w, i); Y.gAll += mean; Y.n++; Y.pUnder = (Y.pUnder || 0) + green(w, i, false); Y.pAll = (Y.pAll || 0) + pMean;
      if (a.state === 'idle' || a.state === 'forage') { Y.fUnder = (Y.fUnder || 0) + green(w, i); Y.fAll = (Y.fAll || 0) + mean; }
    }
  }
  console.log(`seed ${seed} (map ${w.w}x${w.h})`);
  const pos = [];
  yrs.forEach((Y, k) => {
    const ms = Object.keys(Y.months).map(Number).sort((a, b) => a - b).filter(m => Y.months[m].n > 30);
    const p = {}; for (const m of ms) p[m] = [Y.months[m].x / Y.months[m].n, Y.months[m].y / Y.months[m].n];
    pos.push(p);
    const ratio = Y.gAll ? Y.gUnder / Y.gAll : 0;
    console.log(`  Y${k + 1} cross ${Y.cross.join(',') || '-'}  green ${Y.n ? (Y.gUnder / Y.n).toFixed(3) : '-'} x${ratio.toFixed(2)}  ${ms.map(m => `${MONTHS[m]}(${p[m][0].toFixed(0)},${p[m][1].toFixed(0)})`).join(' ')}`);
  });
  // route difference: same month, different years
  let dsum = 0, dn = 0, north = 0, steps = 0;
  for (let a = 0; a < pos.length; a++) for (let b = a + 1; b < pos.length; b++) for (const m in pos[a]) if (pos[b][m]) { dsum += Math.hypot(pos[a][m][0] - pos[b][m][0], pos[a][m][1] - pos[b][m][1]); dn++; }
  for (const p of pos) { const ms = Object.keys(p).map(Number).sort((a, b) => a - b); for (let k = 1; k < ms.length; k++) { steps++; if (p[ms[k]][1] <= p[ms[k - 1]][1] + 2) north++; } }
  const gU = yrs.reduce((s, Y) => s + Y.gUnder, 0), gA = yrs.reduce((s, Y) => s + Y.gAll, 0), n = yrs.reduce((s, Y) => s + Y.n, 0);
  const fU = yrs.reduce((s, Y) => s + (Y.fUnder || 0), 0), fA = yrs.reduce((s, Y) => s + (Y.fAll || 0), 0);
  const pU = yrs.reduce((s, Y) => s + (Y.pUnder || 0), 0), pA = yrs.reduce((s, Y) => s + (Y.pAll || 0), 0);
  const row = { seed, pastureRatio: pA ? pU / pA : 0, feedRatio: fA ? fU / fA : 0, routeDiff: dn ? dsum / dn : 0, northward: steps ? north / steps : 0, green: n ? gU / n : 0, greenRatio: gA ? gU / gA : 0, migrantDays: n };
  summary.push(row);
  console.log(`  route differs ${row.routeDiff.toFixed(1)} tiles between years; month-to-month north (or holding) ${(row.northward * 100).toFixed(0)}%; green ${row.green.toFixed(3)} x${row.greenRatio.toFixed(2)}, standing/feeding x${row.feedRatio.toFixed(2)}, pasture before grazing x${row.pastureRatio.toFixed(2)}; migrant-days ${n}`);
}
const avg = k => summary.reduce((s, r) => s + r[k], 0) / summary.length;
console.log(`ALL route differs ${avg('routeDiff').toFixed(1)}; northward ${(avg('northward') * 100).toFixed(0)}%; green ${avg('green').toFixed(3)} x${avg('greenRatio').toFixed(2)}, standing/feeding x${avg('feedRatio').toFixed(2)}, pasture before grazing x${avg('pastureRatio').toFixed(2)}; migrant-days ${avg('migrantDays').toFixed(0)}`);
