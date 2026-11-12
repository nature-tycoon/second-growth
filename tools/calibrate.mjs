// One calibration command per map: seeded balance-sim runs, their medians compared with the map's
// reference ecosystem (data/eco-reference.js, the Ecosystem Report's vital signs, decision 0031).
// Prints only what is out of range, and what changed since the last saved run of the same command.
//   node tools/calibrate.mjs <map|all> [years=15] [seeds=3]
//   node tools/calibrate.mjs pnw            (Hollis runs the scripted restoration, as /balance does)
//   node tools/calibrate.mjs all 15 3       (every map at once, in parallel child processes under nice)
// Each seed is a run seed (decision 0035); seed 7 is the /balance skill's, so seed 7's run is exactly
// `/balance`'s `restore 15 --run-seed=7`.
// --idle runs Hollis untended too. The last run of each map is kept in tools/release-output/calibrate.json.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

const MAPS = ['pnw', 'atlanta', 'serengeti', 'amazon', 'sumatra', 'chinandega', 'reef'];
const SEEDS = [7, 11, 23, 31, 47, 59, 71, 83, 97];
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const idle = process.argv.includes('--idle');
const which = args[0] || 'pnw';
const years = +(args[1] || 15);
const seeds = SEEDS.slice(0, Math.max(1, +(args[2] || 3)));
const maps = which === 'all' ? MAPS : which.split(',');
for (const m of maps) if (!MAPS.includes(m)) throw new Error(`unknown map ${m} (${MAPS.join(', ')})`);
const modeOf = m => (m === 'pnw' && !idle ? 'restore' : 'idle');

const SIM = fileURLToPath(new URL('./balance-sim.mjs', import.meta.url));
const SAVE = fileURLToPath(new URL('./release-output/calibrate.json', import.meta.url));

// ------------------------------------------------------------------ what counts as out of range
// The reference is the intact ecosystem, which no farm reaches in 15 years, so falling short of it
// isn't a fault. These are the signs that the balance is off, whatever the run length:
const FELL = 0.05;        // a vital sign ended lower than it started
const OVERSHOOT = 1.5;    // a habitat or species past 1.5x the reference (or its carrying capacity)
const INVASIVE = 0.15;    // invasives over 15% of the plants (the native sign's full penalty is at 30%)
const OVER_PARTS = ['meadow', 'shrub', 'forest', 'old', 'wetland', 'deadwood', 'bigTrees', 'coral', 'softCoral', 'seagrass', 'oldCoral'];

function runOne(map, seed) {
  return new Promise((resolve, reject) => {
    const child = spawn('nice', ['-n', '15', process.execPath, SIM, modeOf(map), String(years), `--map=${map}`, `--run-seed=${seed}`, '--json'],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.on('close', (code, signal) => {
      const last = out.trim().split('\n').pop();
      if (code === 0 && last?.startsWith('{')) resolve(JSON.parse(last));
      else reject(Object.assign(new Error(`${map} seed ${seed} failed (${signal || `exit ${code}`}): ${err.trim().split('\n').slice(-4).join(' | ')}`), { signal }));
    });
  });
}

// A small pool: one child per map and seed, a couple of cores left for Cole
async function runAll(jobs) {
  const width = Math.max(2, cpus().length - 2), results = new Array(jobs.length);
  let next = 0;
  const worker = async () => { while (next < jobs.length) { const j = next++; results[j] = await runOne(...jobs[j]).catch(e => e);
    // a child killed from outside (not a crash in the game) gets one more try
    if (results[j]?.signal) results[j] = await runOne(...jobs[j]).catch(e => e); } };
  await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, worker));
  return results;
}

const median = xs => { const s = [...xs].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const med = (runs, get) => median(runs.map(get).map(v => v ?? 0));
const r2 = v => Math.round(v * 100) / 100;
const pct = v => `${Math.round(v * 100)}%`;
const fmt = v => (Math.abs(v) >= 10 ? Math.round(v) : r2(v)).toString().replace(/^0\./, '.');

// The medians of one map's runs, in the shape the save file keeps
function summarize(runs) {
  const end = runs.map(r => r.end), start = runs.map(r => r.start), first = end[0];
  const s = {
    score: med(end, e => e.score), scoreRange: [Math.min(...end.map(e => e.score)), Math.max(...end.map(e => e.score))],
    invFrac: med(end, e => e.invFrac), vitals: {}, vitalsStart: {}, parts: {}, species: {},
    herbivores: first.herbivores && { total: med(end, e => e.herbivores.total), range: first.herbivores.range },
    apex: first.apex, msDay: med(runs, r => r.msDay),
  };
  for (const k in first.vitals) { s.vitals[k] = med(end, e => e.vitals[k]); s.vitalsStart[k] = med(start, e => e.vitals[k]); }
  for (const k in first.parts) s.parts[k] = { value: med(end, e => e.parts[k]?.value), target: first.parts[k].target };
  for (const k in first.species) s.species[k] = { pop: med(end, e => e.species[k]?.pop), K: med(end, e => e.species[k]?.K) };
  return s;
}

// Each finding has an id (to tell new from old ones) and the line to print
function findings(s) {
  const out = [];
  for (const [k, v] of Object.entries(s.vitals))
    if (v < s.vitalsStart[k] - FELL) out.push({ id: `fell:${k}`, text: `${k} sign fell ${fmt(s.vitalsStart[k])} -> ${fmt(v)}` });
  for (const k of OVER_PARTS) {
    const p = s.parts[k];
    if (p && p.target > 0 && p.value > OVERSHOOT * p.target) out.push({ id: `over:${k}`, text: `${k} ${fmt(p.value)} vs reference ${fmt(p.target)} (x${(p.value / p.target).toFixed(1)})` });
  }
  if (s.invFrac > INVASIVE) out.push({ id: 'invasive', text: `invasives ${pct(s.invFrac)} of plants (over ${pct(INVASIVE)})` });
  const h = s.herbivores;
  if (h?.range && (h.total < h.range[0] || h.total > h.range[1]))
    out.push({ id: `herb:${h.total < h.range[0] ? 'low' : 'high'}`, text: `herbivores ${fmt(h.total)} kg/ha, reference ${h.range[0]}-${h.range[1]}` });
  const sp = Object.entries(s.species);
  const missingApex = (s.apex || []).filter(k => s.species[k] && s.species[k].pop === 0);
  if (missingApex.length) out.push({ id: `apex:${missingApex.join(',')}`, text: `top predators absent: ${missingApex.join(', ')}` });
  const absent = sp.filter(([k, v]) => v.pop === 0 && v.K >= 1 && !missingApex.includes(k));
  for (const [k, v] of absent) out.push({ id: `absent:${k}`, group: 'absent', text: `${k} 0/${fmt(v.K)}` });
  for (const [k, v] of sp) if (v.pop > OVERSHOOT * v.K + 2) out.push({ id: `crowd:${k}`, group: 'crowd', text: `${k} ${fmt(v.pop)}/${fmt(v.K)}` });
  return out;
}

// What moved since the last saved run: findings that came or went, and the numbers that moved
function changes(s, last) {
  if (!last) return 'first saved run';
  const now = new Set(findings(s).map(f => f.id)), before = new Set(findings(last).map(f => f.id));
  const bits = [];
  const came = [...now].filter(id => !before.has(id)), went = [...before].filter(id => !now.has(id));
  if (came.length) bits.push(`new ${came.join(' ')}`);
  if (went.length) bits.push(`cleared ${went.join(' ')}`);
  const d = s.score - last.score;
  if (Math.abs(d) >= 2) bits.push(`score ${d > 0 ? '+' : ''}${Math.round(d)}`);
  for (const k in s.vitals) {
    const dv = s.vitals[k] - (last.vitals[k] ?? 0);
    if (Math.abs(dv) >= 0.05) bits.push(`${k} ${dv > 0 ? '+' : ''}${fmt(dv)}`);
  }
  for (const [k, v] of Object.entries(s.species)) {
    const was = last.species[k]?.pop ?? 0, dp = v.pop - was;
    if (Math.abs(dp) >= Math.max(3, 0.3 * Math.max(was, v.pop))) bits.push(`${k} ${fmt(was)}->${fmt(v.pop)}`);
  }
  if (last.msDay && s.msDay > 1.25 * last.msDay) bits.push(`ms/day ${fmt(last.msDay)}->${fmt(s.msDay)}`);
  return bits.length ? bits.join(', ') : 'nothing moved';
}

// ------------------------------------------------------------------ run
const t0 = Date.now();
const jobs = maps.flatMap(m => seeds.map(s => [m, s]));
const results = await runAll(jobs);
let saved = {};
try { saved = JSON.parse(readFileSync(SAVE, 'utf8')); } catch {}

console.log(`calibrate ${which} ${years}y, seeds ${seeds.join(',')} (medians; Hollis ${modeOf('pnw')}, others idle): ${((Date.now() - t0) / 1000).toFixed(0)} s`);
let failed = 0;
for (const map of maps) {
  const mine = results.filter((r, j) => jobs[j][0] === map);
  const errors = mine.filter(r => r instanceof Error);
  for (const e of errors) { console.log(`${map}: ${e.message}`); failed++; }
  const runs = mine.filter(r => !(r instanceof Error));
  if (!runs.length) continue;
  const s = summarize(runs), key = `${map}|${modeOf(map)}|${years}|${seeds.join(',')}`;
  const vit = Object.entries(s.vitals).map(([k, v]) => `${k} ${fmt(v)}`).join(' ');
  console.log(`${map}: score ${Math.round(s.score)} (${Math.round(s.scoreRange[0])}-${Math.round(s.scoreRange[1])}) | ${vit}`);
  const list = findings(s);
  for (const f of list.filter(f => !f.group)) console.log(`  ! ${f.text}`);
  const absent = list.filter(f => f.group === 'absent'), crowd = list.filter(f => f.group === 'crowd');
  if (absent.length) console.log(`  ! absent where habitat holds one (pop/K): ${absent.map(f => f.text).join(', ')}`);
  if (crowd.length) console.log(`  ! over ${OVERSHOOT}x carrying capacity: ${crowd.map(f => f.text).join(', ')}`);
  if (!list.length) console.log('  all in range');
  console.log(`  since last: ${changes(s, saved[key])}`);
  saved[key] = s;
}
mkdirSync(fileURLToPath(new URL('./release-output/', import.meta.url)), { recursive: true });
writeFileSync(SAVE, JSON.stringify(saved));
if (failed) process.exitCode = 1;
