// node tools/hunt-check.mjs [--report] [maps...]
// How hunts play out (decision 0026), on the restored landscapes of every map with hunters: prey
// spread over its habitat, hunters kept hungry. Every hunt by a lead hunter (not a pack's flankers)
// is followed from start to end, step by step, and per species it reports:
//   hunts      hunts started; catch, the share that ended in a catch; kills/10d, catches per hunter
//              per 10 days (the number to keep when tuning: predators kill as often as before)
//   grabs      times per hunt it reached its prey and the catch was rolled (a miss can be followed
//              by another grab in the same hunt)
//   miss, giveUp, lost   how the rest ended: the last grab missed; the hunter let the prey go;
//              timed out, the prey gone or out of reach
//   len        median hunt length in days, start to end
//   stalk      median days spent stalking (creeping or frozen) per hunt that stalked, and the share that did
//   gaps       stalls in a chase: steps in a rush (or an approach on prey already running), not
//              counting the grab, where the hunter covered under 15% of its usual pace, per 100 chase steps
//   rehunt     the same hunter starting on the same prey again within 4 days of a failed hunt, per
//              failed hunt, and idleRe the median days between. The old stop-and-start-again was
//              that, straight into another sprint after 1.5 days standing: `restart` counts those.
// It fails on the limits in decision 0026 (problems() below); --report only prints. SEED=91 another
// seed, DAYS=150 a longer run, TRACE=1 a few hunts step by step, BUDGET=1 how each hunter spends its time.
import { pathToFileURL } from 'node:url';
import { BIOMES } from '../js/biome.js';
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { populate } from './animal-steering-check.mjs';
import { preyFor } from '../js/data/animals.js';

globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const args = process.argv.slice(2), strict = !args.includes('--report');
const maps = args.filter(s => !s.startsWith('--'));
const DT = 0.02, DAYS = +(process.env.DAYS || 100), WARM = 1;
const median = xs => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

export function measure(map, { seed = 1987 } = {}) {
  Math.random = mulberry32(seed);
  const rng = mulberry32(seed + 1);
  const g = restoredGame(map, seed), wl = g.wildlife, cat = g.catalog;
  populate(g, rng);
  // keep the hunters hungry, so hunts keep happening all run long
  const hunters = new Set(cat.animals.filter(d => preyFor(d, g)).map(d => d.index));
  const caught = new Map(); // hunter id -> step it caught
  const onPred = g.onPredation.bind(g);
  g.onPredation = (p, b) => { caught.set(p.id, b.id); return onPred(p, b); };
  const by = {}, sp = key => by[key] ||= { time: {}, hunterDays: 0, hunts: 0, catch: 0, miss: 0, giveUp: 0, lost: 0, len: [], stalk: [], stalked: 0,
    chase: 0, gaps: 0, contacts: 0, failed: 0, rehunt: 0, restart: 0, idleRe: [], seq: [] };
  const live = new Map(), lastFail = new Map(), b0 = a => wl.ids.get(a.target);
  const total = Math.round((DAYS + WARM) / DT);
  let t = 0;
  for (let step = 0; step < total; step++) {
    const before = new Map();
    for (const a of wl.agents) if (a.state === 'hunt') { const b = wl.ids.get(a.target); before.set(a.id, [a.x, a.y, a.hunt?.phase, b ? Math.hypot(b.x - a.x, b.y - a.y) : 0]); }
    caught.clear();
    wl.update(DT); t += DT;
    if (step < WARM / DT) { live.clear(); continue; }
    for (const a of wl.agents) {
      const def = cat.animals[a.sp];
      if (!hunters.has(a.sp)) continue;
      const st = sp(def.key); st.hunterDays += DT;
      const what = a.state === 'hunt' ? (a.assist ? 'assist' : (a.hunt?.phase || 'hunt') + (a.hunt?.phase === 'creep' && b0(a)?.alertT > 0 ? '-frozen' : '')) : a.state;
      st.time[what] = (st.time[what] || 0) + DT;
      if (a.hunger < 9 && a.state !== 'feed' && a.state !== 'hunt' && !caught.has(a.id)) a.hunger = 9;
      let h = live.get(a.id);
      const hunting = a.state === 'hunt' && !a.assist;
      if (hunting && !h) {
        h = { start: t, prey: a.target, stalk: 0, steps: [] };
        live.set(a.id, h);
        const f = lastFail.get(a.id);
        if (f && f.prey === a.target && t - f.t < 4) { sp(def.key).rehunt++; sp(def.key).idleRe.push(t - f.t); h.re = t - f.t < 2; }
        lastFail.delete(a.id);
      }
      if (h && before.has(a.id)) {
        const [x0, y0, phase, d0] = before.get(a.id), moved = Math.hypot(a.x - x0, a.y - y0) / (def.speed * DT);
        if (phase === 'creep') h.stalk += DT;
        const b = wl.ids.get(h.prey);
        // a chase: the rush, or an approach that is closing on prey already running (not the grab
        // itself, within reach of the prey, which is a step spent on the catch roll)
        const chasing = (phase === 'rush' || phase === 'approach' && b?.state === 'flee') && d0 > 0.6;
        if (chasing && hunting) { sp(def.key).chase++; if (moved < 0.15) sp(def.key).gaps++; }
        const grab = a.hunt?.miss > (h.miss ?? 0); h.miss = a.hunt?.miss ?? 0;
        if (grab) h.misses = (h.misses || 0) + 1;
        // (a re-hunt that is sprinting within a sixth of a day: no approach or stalk between)
        if (h.re && a.hunt?.phase === 'rush' && t - h.start < 0.17) { h.re = false; sp(def.key).restart++; }
        if (h.steps.length < 4000) h.steps.push([(grab ? 'X' : '') + (phase ?? '-'), +moved.toFixed(2), b ? +Math.hypot(b.x - a.x, b.y - a.y).toFixed(2) : -1, b?.state?.[0] ?? '?']);
        h.last = phase;
      }
      if (h && !hunting) {
        const s = sp(def.key), b = wl.ids.get(h.prey);
        s.hunts++; s.len.push(t - h.start);
        if (h.stalk > 0) { s.stalked++; s.stalk.push(h.stalk); }
        let how;
        if (caught.get(a.id) === h.prey || a.state === 'feed' || a.state === 'carry') how = 'catch';
        else if (!b || b.leaving) how = 'lost';
        else if (Math.hypot(b.x - a.x, b.y - a.y) < 0.8 && a.state === 'idle') how = 'miss';
        else how = h.last === 'ease' || a.wait > 1.4 && a.wait <= 3 ? 'giveUp' : 'lost';
        s.contacts += (h.misses || 0) + (how === 'catch' || how === 'miss' ? 1 : 0);
        s[how]++;
        if (how !== 'catch') { s.failed++; lastFail.set(a.id, { prey: h.prey, t }); }
        if (s.seq.length < 3) s.seq.push({ how, steps: h.steps });
        live.delete(a.id);
      }
    }
  }
  return { by, cat };
}

function row(key, s) {
  const pct = (n, d) => d ? (100 * n / d).toFixed(0) + '%' : '-';
  return `${key.padEnd(13)} hunts ${String(s.hunts).padStart(4)}  catch ${pct(s.catch, s.hunts).padStart(4)}  kills/10d ${(10 * s.catch / Math.max(1, s.hunterDays)).toFixed(2)}` +
    `  grabs ${(s.contacts / Math.max(1, s.hunts)).toFixed(2)}  miss ${pct(s.miss, s.hunts).padStart(4)}  giveUp ${pct(s.giveUp, s.hunts).padStart(4)}  lost ${pct(s.lost, s.hunts).padStart(4)}` +
    `  len ${median(s.len).toFixed(2).padStart(5)}  stalk ${median(s.stalk).toFixed(2).padStart(5)} (${pct(s.stalked, s.hunts)})` +
    `  gaps ${(s.chase ? 100 * s.gaps / s.chase : 0).toFixed(1).padStart(4)}/100  rehunt ${pct(s.rehunt, s.failed).padStart(4)}  restart ${pct(s.restart, s.failed).padStart(4)}  idleRe ${median(s.idleRe).toFixed(2)}`;
}

// The limits in decision 0026, for a species with enough hunts to judge.
export function problems(map, by, cat) {
  const out = [];
  for (const [key, s] of Object.entries(by)) {
    if (s.chase >= 50 && s.gaps / s.chase > 0.01) out.push(`${map}/${key}: ${(100 * s.gaps / s.chase).toFixed(1)} stops per 100 chase steps (limit 1)`);
    // (not birds: a hawk on a perch drops straight on its prey, which is how it hunts)
    if (cat.animal[key]?.move !== 'fly' && s.failed >= 5 && s.restart / s.failed > 0.1) out.push(`${map}/${key}: ${(100 * s.restart / s.failed).toFixed(0)}% of failed hunts followed within 2 days by a sprint straight at the same prey (limit 10%)`);
    if (s.hunts >= 25 && !s.catch) out.push(`${map}/${key}: ${s.hunts} hunts and no catch`);
    if (cat.animal[key]?.sprite.kind === 'feline' && s.stalked >= 8 && median(s.stalk) < 1.5) out.push(`${map}/${key}: median stalk ${median(s.stalk).toFixed(2)} days (at least 1.5)`);
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seed = +(process.env.SEED || 1987);
  const list = maps.length ? maps : Object.keys(BIOMES), failures = [];
  for (const map of list) {
    const { by, cat } = measure(map, { seed });
    failures.push(...problems(map, by, cat));
    const keys = Object.keys(by);
    if (!keys.length) continue;
    console.log(`\n${map}`);
    for (const k of keys.sort()) if (by[k].hunts) console.log(row(k, by[k]));
    if (process.env.BUDGET) for (const k of keys.sort()) if (by[k].hunts) console.log(`  ${k}: ` + Object.entries(by[k].time).sort((x, y) => y[1] - x[1]).map(([w, v]) => `${w} ${(100 * v / by[k].hunterDays).toFixed(0)}%`).join(' '));
    if (process.env.TRACE) for (const k of keys) for (const q of by[k].seq) {
      console.log(`  ${k} ${q.how}: ` + q.steps.filter((_, i) => i % 3 === 0).map(([p, m, d, st]) => `${p[0] === 'X' ? 'X' + p[1] : p[0]}${m}@${d}${st}`).join(' '));
    }
  }
  if (failures.length) { console.log('\n' + failures.join('\n')); if (strict) process.exit(1); }
  else console.log('\nhunt-check: within the 0026 limits');
}
