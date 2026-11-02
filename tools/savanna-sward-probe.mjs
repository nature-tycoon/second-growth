// Serengeti sward probe: what holds the meadow on an untended Serengeti, and where young mesquite
// comes up. Seeded like succession-check (same world, --veg stepping). Every N years prints the
// groundcover and shrub species (grown past 0.35), mean soil under each groundcover, invasive
// habitat, the average share of land burned a year since the last report, and the ground and shrub over young mesquite.
// With --why it also tallies why grass seeds failed in trySeed over the period (w.seedLog).
//   node tools/savanna-sward-probe.mjs [--years 200] [--every 10] [--seed 1] [--why]
const root = new URL('../js/', import.meta.url).href;
globalThis.localStorage = { getItem(){return null}, setItem(){}, removeItem(){} };
let lcg = 1;
Math.random = () => ((lcg = (lcg * 1103515245 + 12345) % 2147483648) / 2147483648);
const { Game } = await import(root + 'game.js');
const { H, T } = await import(root + 'config.js');
const { plantSuit } = await import(root + 'sim/plants.js');
const TN = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k.toLowerCase()]));
const { hashStr } = await import(root + 'rng.js');

const args = process.argv.slice(2);
const opt = (k, d) => { const j = args.indexOf('--' + k); return j < 0 ? d : args[j + 1]; };
const years = +opt('years', 200), every = +opt('every', 10), seed = +opt('seed', 1), why = args.includes('--why');
const map = opt('map', 'serengeti');
lcg = seed;
const g = new Game(); g.newGame(1987, 'free', 'standard', map);
g.rng.setState(hashStr(`${map}:${seed}`));
const w = g.world, P = g.catalog.plants, D = 120;
const LAND = new Set([H.BARE, H.FARM, H.INVASIVE, H.MEADOW, H.SHRUB, H.YOUNG_FOREST, H.MATURE_FOREST, H.RIPARIAN]);
const WATCH = new Set(['redoat', 'stargrass', 'finger', 'sporobolus', 'lantana', 'mesquite']);
const reasons = {};
if (why) w.seedLog = (p, i, r) => { if (!WATCH.has(p.key)) return; const o = reasons[p.key] ||= {}; o[r ?? 'ok'] = (o[r ?? 'ok'] || 0) + 1; };
const top = (o, n = 8) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${typeof v === 'number' && v % 1 ? v.toFixed(2) : v}`).join(', ');
const burnedDay = new Uint8Array(w.n); let burnedYear = 0, burnedSum = 0, yearsIn = 0;
const out = [];
function report(t) {
  const gr = {}, soilBy = {}, sh = {}, under = {}, bare = {};
  const redoat = g.catalog.plant.redoat; let redoatFits = 0;
  let land = 0, inv = 0, meadow = 0;
  for (let i = 0; i < w.n; i++) {
    if (!LAND.has(w.habitat[i])) continue;
    land++;
    if (w.habitat[i] === H.INVASIVE) inv++;
    if (w.habitat[i] === H.MEADOW) meadow++;
    const gk = w.ground[i] && w.groundG[i] > 0.35 ? P[w.ground[i]].key : '-';
    if (gk === '-') { const k = TN[w.terrain[i]] + (w.shrub[i] && w.shrubG[i] > 0.35 ? '/' + P[w.shrub[i]].key : ''); bare[k] = (bare[k] || 0) + 1; if (plantSuit(w, i, redoat) >= 0.3) redoatFits++; }
    gr[gk] = (gr[gk] || 0) + 1; soilBy[gk] = (soilBy[gk] || 0) + w.soil[i];
    const sk = w.shrub[i] && w.shrubG[i] > 0.35 ? P[w.shrub[i]].key : '-';
    if (sk !== '-') sh[sk] = (sh[sk] || 0) + 1;
    if (w.tree[i] && P[w.tree[i]].key === 'mesquite' && w.treeG[i] < 0.35) {
      const k = (w.ground[i] ? P[w.ground[i]].key : 'bare') + '/' + (w.shrub[i] ? P[w.shrub[i]].key : '-');
      under[k] = (under[k] || 0) + 1;
    }
  }
  for (const k in soilBy) soilBy[k] /= gr[k];
  const mesq = Object.values(under).reduce((a, b) => a + b, 0);
  const r = { t, bare, redoatFits, land, meadow, inv, burned: +(yearsIn ? burnedSum / yearsIn / land : 0).toFixed(3), ground: gr, shrubs: sh, soil: soilBy, youngMesquite: mesq, under };
  out.push(r);
  console.log(`t${String(t).padStart(3)} meadow=${meadow} inv=${inv} burned/yr=${(r.burned * 100).toFixed(0)}% | ground: ${top(gr, 9)}\n      shrubs: ${top(sh)} | soil: ${top(soilBy, 6)}\n      young mesquite ${mesq} on: ${top(under, 5)}\n      no groundcover: ${top(bare, 6)} (red oat suits ${redoatFits})`);
  if (why) { for (const [k, o] of Object.entries(reasons)) console.log(`      ${k}: ${top(o, 7)}`); for (const k in reasons) delete reasons[k]; }
}
report(0);
for (let d = 0; d < years * D; d++) {
  g.dailyTick(); g.wildlife.update(1.0);
  for (let i = 0; i < w.n; i++) if (w.fire[i] && !burnedDay[i]) { burnedDay[i] = 1; burnedYear++; }
  if ((d + 1) % D === 0) {
    burnedSum += burnedYear; yearsIn++; burnedDay.fill(0); burnedYear = 0;
    if (((d + 1) / D) % every === 0) { report((d + 1) / D); burnedSum = 0; yearsIn = 0; }
  }
}
if (opt('json', null)) (await import('node:fs')).writeFileSync(opt('json'), JSON.stringify(out));
