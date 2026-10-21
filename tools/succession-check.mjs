// Long-run vegetation and succession check (docs/decisions/0013-succession-dynamics.md).
// Seeded, headless. Prints, every N years: habitat mix and turnover, tree deaths by cause (from
// removeTree's w.treeDeathsEst counter; by diffing tiles on builds without it) and recruits, age structure, species shares and diversity, saplings waiting in the understory, deadwood, fire, wildlife, and dailyTick cost.
//   node tools/succession-check.mjs [--map pnw|all|<id>[,<id>]] [--mode idle|restore] [--years 200]
//        [--seeds 1,2,3] [--every 10] [--veg] [--assert] [--json out.json]
// --veg steps wildlife once a day at dt 1.0 instead of 10x0.1: about 3x faster, for structure runs.
// --assert checks the 0013 acceptance targets and exits 1 on a miss (default: report only).
// Run long jobs in the background under `nice`: 200 years is 10–40 min per map and seed unloaded.
// ms figures are only comparable between runs made back to back at the same priority (AGENTS.md).
import { writeFileSync } from 'node:fs';
const root = new URL('../js/', import.meta.url).href;
globalThis.localStorage = { getItem(){return null}, setItem(){}, removeItem(){} };
// Seeded before the game modules load, so module-level draws are seeded too (128 sim sites still use it).
let lcg = 1;
Math.random = () => ((lcg = (lcg * 1103515245 + 12345) % 2147483648) / 2147483648);
const { Game } = await import(root + 'game.js');
const { ToolActions } = await import(root + 'tool-actions.js');
const { H } = await import(root + 'config.js');
const { hashStr } = await import(root + 'rng.js');
const HAS_COUNTER = 'removeTree' in await import(root + 'sim/plants.js');
const { hollisRestorePlan } = await import('./hollis-restore-plan.mjs');

const ALL_MAPS = ['pnw', 'atlanta', 'amazon', 'serengeti', 'sumatra', 'chinandega', 'reef'];
const FORESTED = new Set(['pnw', 'atlanta', 'amazon', 'sumatra', 'chinandega']);
// Acceptance targets from 0013, per map. Shares are of established trees (treeG > 0.35).
//   largest: largest species share, final year · tolerant: share of mature-forest trees with
//   light[0] <= TOLERANT (PNW: hemlock + cedar) · keep: named species still >= this share of
//   mature-forest trees · opened: mature tiles that pass through an opening (meadow, shrub, invasive,
//   bare, marsh, pond) in the last 50 years without burning; fire already opens 13-16% of PNW ·
//   rd: recruits / deaths over the last 50 years
const TARGETS = {
  pnw: { largest: 0.60, tolerant: 0.25, keep: { fir: 0.25 }, opened: 0.10 },
  amazon: { largest: 0.40 },
};
const RD = [0.7, 1.5];
// Animal species alive at year 200 in the 0013 baseline runs (the lowest seed; full wildlife).
// Target: >= baseline - 1. Keyed map:mode.
const BASELINE_SPECIES = {
  'pnw:restore': 29, 'pnw:idle': 29, 'atlanta:idle': 29, 'amazon:idle': 24, 'serengeti:idle': 20,
  'sumatra:idle': 34, 'chinandega:idle': 23, 'reef:idle': 21,
};
const TOLERANT = 0.15;
const LAND = new Set([H.BARE, H.FARM, H.INVASIVE, H.MEADOW, H.SHRUB, H.YOUNG_FOREST, H.MATURE_FOREST, H.RIPARIAN, H.MARSH, H.POND]);
const OPEN = new Set([H.BARE, H.FARM, H.INVASIVE, H.MEADOW, H.SHRUB, H.MARSH, H.POND]); // "an opening": not forest, not riparian thicket
const HAB = ['bare', 'farm', 'inv', 'meadow', 'shrub', 'young', 'mature', 'rip', 'marsh', 'pond', 'creek', 'river', 'dev'];
const EST = 0.35; // a tree counts as established (a "tree" in every share and count) above this size

// ---- CLI
const args = process.argv.slice(2);
const opt = (name, def) => { const k = args.indexOf('--' + name); return k < 0 ? def : args[k + 1]; };
const flag = name => args.includes('--' + name);
const mapArg = opt('map', 'pnw');
const maps = mapArg === 'all' ? ALL_MAPS : mapArg.split(',');
for (const m of maps) if (!ALL_MAPS.includes(m)) { console.error(`unknown map ${m} (${ALL_MAPS.join(', ')})`); process.exit(2); }
const modeArg = opt('mode', 'idle');
if (!['idle', 'restore'].includes(modeArg)) { console.error('--mode is idle or restore'); process.exit(2); }
const years = +opt('years', 200), every = +opt('every', 10);
const seeds = String(opt('seeds', '1')).split(',').map(Number);
const veg = flag('veg'), doAssert = flag('assert'), jsonOut = opt('json', null);
const WINDOW = Math.min(50, years); // the turnover and recruits/deaths window: the run's last 50 years

const q = (sorted, f) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))] : 0;
const pct = v => v == null || !isFinite(v) ? '-' : (v * 100).toFixed(0) + '%';

function run(map, seed) {
  let mode = modeArg;
  if (mode === 'restore' && map !== 'pnw') { console.log(`(${map}: the restore plan is Hollis-specific; running idle)`); mode = 'idle'; }
  lcg = seed;
  const g = new Game(); g.newGame(1987, 'free', 'standard', map);
  g.rng.setState(hashStr(`${map}:${seed}`)); // same world for every seed, different history
  const w = g.world, P = g.catalog.plants, n = w.n, D = 120;
  const plan = mode === 'restore' ? hollisRestorePlan(g, ToolActions) : null;
  const tag = `${map} ${mode}${veg ? ' veg' : ''} seed ${seed}`;
  console.log(`== ${tag}: ${w.w}x${w.h}, ${years} years`);

  const counted = new Uint8Array(n); // the tile's current tree has been counted as a recruit
  const prevTree = w.tree.slice(), prevAge = w.treeAge.slice();
  const lastOpen = new Int32Array(n).fill(-1), lastBurn = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (w.tree[i] && w.treeG[i] > EST) counted[i] = 1;
    if (OPEN.has(w.habitat[i])) lastOpen[i] = 0;
  }
  const matureSnap = new Map(); // elapsed year -> Uint8Array of mature tiles then
  const snapMature = t => { const m = new Uint8Array(n); for (let i = 0; i < n; i++) m[i] = w.habitat[i] === H.MATURE_FOREST; matureSnap.set(t, m); };
  let prevHab = w.habitat.slice();
  // Deaths of established trees by cause. removeTree counts them in w.treeDeathsEst; a build
  // without it (before 0013 phase 2) falls back to guessing the cause from the tile.
  const counter = () => HAS_COUNTER ? { ...w.treeDeathsEst } : null;
  const since = (now, then) => Object.fromEntries(Object.entries(now).map(([k, v]) => [k, v - (then[k] || 0)]).filter(([, v]) => v));
  let per = null, perFrom = null; const resetPer = () => { per = { deaths: {}, recruits: 0, fires: 0, burned: 0, tickMs: 0, dayMs: 0, days: 0 }; perFrom = counter(); };
  resetPer();
  const win = { deaths: 0, recruits: 0, byCause: {}, from: null };
  let lastFire = g.events.lastFire, prevBurned = g.events.burned;
  const reports = [];
  const elkIdx = g.catalog.animal?.elk?.index;

  function report(t) {
    const c = w.stats.counts;
    let land = 0, changed = 0; const trans = {};
    for (let i = 0; i < n; i++) {
      const h = w.habitat[i]; if (!LAND.has(h)) continue;
      land++;
      if (h !== prevHab[i]) { changed++; const k = `${HAB[prevHab[i]]}>${HAB[h]}`; trans[k] = (trans[k] || 0) + 1; }
    }
    const sp = {}, spMature = {}, ages = []; let nt = 0, ntm = 0, tol = 0, near = 0;
    for (let i = 0; i < n; i++) {
      const id = w.tree[i]; if (!id || w.treeG[i] <= EST) continue;
      const p = P[id], a = w.treeAge[i] / D;
      sp[p.key] = (sp[p.key] || 0) + 1; nt++; ages.push(a);
      if (a > p.life * 0.8) near++;
      if (w.habitat[i] === H.MATURE_FOREST) { spMature[p.key] = (spMature[p.key] || 0) + 1; ntm++; if (p.light[0] <= TOLERANT) tol++; }
    }
    ages.sort((x, y) => x - y);
    // saplings waiting under the canopy (0013 §3; none on builds without the understory)
    const und = {}; let nu = 0;
    if (w.understory) for (let i = 0; i < n; i++) if (w.understory[i]) { const k = P[w.understory[i]].key; und[k] = (und[k] || 0) + 1; nu++; }
    const shares = Object.entries(sp).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v / nt]);
    const simpson = 1 - shares.reduce((s, [, f]) => s + f * f, 0);
    let opened = null, openedNoFire = null;
    const snap = matureSnap.get(t - WINDOW);
    if (snap) {
      let m = 0, o = 0, onf = 0; const since = (t - WINDOW) * D;
      for (let i = 0; i < n; i++) if (snap[i]) { m++; if (lastOpen[i] > since) { o++; if (lastBurn[i] <= since) onf++; } }
      if (m) { opened = o / m; openedNoFire = onf / m; }
    }
    const pops = g.wildlife.state.filter(x => x.pop > 0);
    if (perFrom) per.deaths = since(counter(), perFrom);
    const deaths = Object.values(per.deaths).reduce((a, b) => a + b, 0);
    const r = {
      t, hab: Object.fromEntries(HAB.slice(0, 10).map((k, h) => [k, c[h] || 0])), changed: land ? changed / land : 0,
      trans: Object.entries(trans).sort((a, b) => b[1] - a[1]).slice(0, 6),
      matureOut: Object.entries(trans).filter(([k]) => k.startsWith('mature>')).reduce((a, [, v]) => a + v, 0),
      trees: nt, matureTrees: ntm, ageQ: [q(ages, 0.25), q(ages, 0.5), q(ages, 0.75), q(ages, 0.95)].map(v => +v.toFixed(0)),
      meanAge: nt ? +(ages.reduce((a, b) => a + b, 0) / nt).toFixed(1) : 0, nearLife: nt ? near / nt : 0,
      deaths: { ...per.deaths, total: deaths }, recruits: per.recruits,
      shares: shares.slice(0, 5).map(([k, f]) => [k, +f.toFixed(3)]), largest: shares[0]?.[1] ?? 0, simpson: +simpson.toFixed(3),
      tolerant: ntm ? tol / ntm : null, matureShares: Object.fromEntries(Object.entries(spMature).map(([k, v]) => [k, +(v / ntm).toFixed(3)])),
      understory: nu, understoryShares: Object.entries(und).sort((a, b) => b[1] - a[1]).slice(0, 4),
      released: { ...(w.understoryReleased || {}) },
      opened, openedNoFire, snags: w.stats.snags, logs: w.stats.logs, fires: per.fires, burned: per.burned,
      species: pops.length, animals: pops.reduce((a, x) => a + x.pop, 0), elk: elkIdx != null ? g.wildlife.state[elkIdx].pop : null,
      grazed: w.grazed ? +(w.grazed.reduce((a, b) => a + b, 0) / land).toFixed(4) : 0,
      msTick: per.days ? +(per.tickMs / per.days).toFixed(2) : null, msDay: per.days ? +(per.dayMs / per.days).toFixed(2) : null,
    };
    reports.push(r);
    const hb = r.hab;
    console.log(`t${String(t).padStart(3)} meadow=${hb.meadow} shrub=${hb.shrub} young=${hb.young} mature=${hb.mature} rip=${hb.rip} inv=${hb.inv} open=${hb.bare + hb.farm} wet=${hb.marsh + hb.pond}` +
      ` | changed=${pct(r.changed)} mature>*=${r.matureOut} opened50=${pct(opened)} (no fire ${pct(openedNoFire)})` +
      ` | trees=${nt} age q25/50/75/95=${r.ageQ.join('/')} died=${deaths} (${Object.entries(per.deaths).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', ')}) recruits=${per.recruits}` +
      ` | snags=${r.snags} logs=${r.logs} fires=${r.fires} burned=${r.burned} | spp=${r.species} animals=${r.animals}${r.elk != null ? ` elk=${r.elk}` : ''}` +
      ` | ${r.shares.map(([k, f]) => k + Math.round(f * 100)).join(' ')} D=${r.simpson} tol=${pct(r.tolerant)}${nu ? ` under=${nu} (${r.understoryShares.map(([k, v]) => k + ' ' + v).join(', ')})` : ''}${Object.keys(r.released).length ? ` released=${Object.entries(r.released).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ' ' + v).join(', ')}` : ''}${r.msTick != null ? ` | ${r.msTick}/${r.msDay} ms` : ''}`);
    if (r.trans.length) console.log(`     ${r.trans.map(([k, v]) => `${k} ${v}`).join(', ')}`);
    prevHab = w.habitat.slice(); resetPer(); snapMature(t);
  }

  report(0);
  for (let d = 0; d < years * D; d++) {
    plan?.day(d);
    const t0 = performance.now();
    g.dailyTick();
    const t1 = performance.now();
    if (veg) g.wildlife.update(1.0); else for (let k = 0; k < 10; k++) g.wildlife.update(0.1);
    per.tickMs += t1 - t0; per.dayMs += performance.now() - t0; per.days++;
    // fires: count each new one, and the tiles it burns (events.burned restarts at each ignition)
    if (g.events.lastFire !== lastFire) { per.fires++; lastFire = g.events.lastFire; prevBurned = 0; }
    per.burned += Math.max(0, g.events.burned - prevBurned); prevBurned = g.events.burned;
    const inWin = d >= (years - WINDOW) * D, day = d + 1;
    if (inWin && !win.from) win.from = counter() || {};
    for (let i = 0; i < n; i++) {
      const a = prevTree[i], b = w.tree[i];
      if (counted[i] && (b !== a || w.treeAge[i] < prevAge[i])) {
        counted[i] = 0;
        if (!HAS_COUNTER) {
          const p = P[a];
          const cause = prevAge[i] / D > p.life ? 'age' : w.fire[i] ? 'fire' : w.flood[i] || w.waterWetDays?.[i] >= 30 ? 'flood' : 'other';
          per.deaths[cause] = (per.deaths[cause] || 0) + 1;
          if (inWin) { win.deaths++; win.byCause[cause] = (win.byCause[cause] || 0) + 1; }
        }
      }
      if (!counted[i] && b && w.treeG[i] > EST) { counted[i] = 1; per.recruits++; if (inWin) win.recruits++; }
      if (OPEN.has(w.habitat[i])) lastOpen[i] = day;
      if (w.fire[i]) lastBurn[i] = day;
    }
    prevTree.set(w.tree); prevAge.set(w.treeAge);
    const t = (d + 1) / D;
    if ((d + 1) % (every * D) === 0) report(t);
    else if (t === years - WINDOW && !matureSnap.has(t)) snapMature(t);
  }
  if (reports.at(-1).t !== years) report(years);
  if (HAS_COUNTER) { win.byCause = since(counter(), win.from || {}); win.deaths = Object.values(win.byCause).reduce((a, b) => a + b, 0); }
  const last = reports.at(-1), tot = reports.slice(1);
  const summary = {
    map, mode, seed, veg, years,
    largest: last.largest, largestKey: last.shares[0]?.[0], simpson: last.simpson, tolerant: last.tolerant, matureShares: last.matureShares,
    rd: win.deaths ? win.recruits / win.deaths : null, winDeaths: win.deaths, winRecruits: win.recruits, winByCause: win.byCause,
    opened: last.opened, openedNoFire: last.openedNoFire, changed: last.changed, species: last.species, animals: last.animals, trees: last.trees, ageQ: last.ageQ,
    understory: last.understory, understoryShares: last.understoryShares, meadow: last.hab.meadow, mature: last.hab.mature, elk: last.elk,
    msTick: +(tot.reduce((a, r) => a + r.msTick, 0) / tot.length).toFixed(2), msDay: +(tot.reduce((a, r) => a + r.msDay, 0) / tot.length).toFixed(2),
  };
  console.log(`-- ${tag}: largest ${summary.largestKey} ${pct(summary.largest)}, Simpson ${summary.simpson}, tolerant/mature ${pct(summary.tolerant)},` +
    ` recruits/deaths t${years - WINDOW}-${years} ${summary.rd?.toFixed(2) ?? '-'} (${win.recruits}/${win.deaths}; ${Object.entries(win.byCause).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', ')}),` +
    ` mature opened in ${WINDOW}y ${pct(summary.opened)} (unburned ${pct(summary.openedNoFire)}), changed/decade ${pct(summary.changed)}, species ${summary.species}, ${summary.msTick} ms/dailyTick, ${summary.msDay} ms/day`);
  return { summary, reports };
}

function check(s) {
  const out = [], T = TARGETS[s.map] || {};
  const add = (name, ok, got) => out.push({ name, ok, got });
  if (T.largest != null) add(`largest share <= ${pct(T.largest)}`, s.largest <= T.largest, pct(s.largest));
  if (T.tolerant != null) add(`shade-tolerant share of mature trees >= ${pct(T.tolerant)}`, s.tolerant >= T.tolerant, pct(s.tolerant));
  for (const [k, v] of Object.entries(T.keep || {})) add(`${k} share of mature trees >= ${pct(v)}`, (s.matureShares[k] || 0) >= v, pct(s.matureShares[k] || 0));
  if (T.opened != null) add(`mature tiles opened without fire in ${WINDOW}y >= ${pct(T.opened)}`, s.openedNoFire >= T.opened, pct(s.openedNoFire));
  if (FORESTED.has(s.map)) add(`recruits/deaths in ${RD.join('-')}`, s.rd >= RD[0] && s.rd <= RD[1], s.rd?.toFixed(2) ?? "no deaths");
  const base = BASELINE_SPECIES[`${s.map}:${s.mode}`];
  if (base != null && !s.veg) add(`animal species >= ${base - 1}`, s.species >= base - 1, s.species);
  return out;
}

const results = [];
for (const map of maps) for (const seed of seeds) results.push(run(map, seed));

if (results.length > 1) {
  console.log('\nmap        mode    seed largest      Simpson tolerant R/D   opened changed spp ms/tick ms/day');
  for (const { summary: s } of results) console.log(`${s.map.padEnd(10)} ${s.mode.padEnd(7)} ${String(s.seed).padStart(4)} ${`${s.largestKey} ${pct(s.largest)}`.padEnd(12)} ${String(s.simpson).padEnd(7)} ${pct(s.tolerant).padEnd(8)} ${(s.rd?.toFixed(2) ?? '-').padEnd(5)} ${pct(s.opened).padEnd(6)} ${pct(s.changed).padEnd(7)} ${String(s.species).padEnd(3)} ${String(s.msTick).padEnd(7)} ${s.msDay}`);
}
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify({ args, results }, null, 1)); console.log(`wrote ${jsonOut}`); }
let failed = 0;
if (doAssert) {
  if (years < 200) console.log(`(--assert: targets are for 200-year runs; this run is ${years})`);
  for (const { summary: s } of results) for (const c of check(s)) {
    if (!c.ok) failed++;
    console.log(`${c.ok ? 'PASS' : 'FAIL'} ${s.map} ${s.mode} seed ${s.seed}: ${c.name} (got ${c.got})`);
  }
  console.log(failed ? `${failed} target(s) missed` : 'all targets met');
}
process.exit(failed ? 1 : 0);
