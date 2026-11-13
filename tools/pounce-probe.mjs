// How hunts end in a pounce (decision 0026, startLeap in sim/animal-life.js): per species, leaps
// started, how many came down on the prey, how many fell short, and the leap's length and time.
// Hungry hunters, as hunt-check. Usage: node tools/pounce-probe.mjs [maps] (DAYS=60, SEED=1987)
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { populate } from './animal-steering-check.mjs';
import { preyFor } from '../js/data/animals.js';

const maps = process.argv.slice(2).length ? process.argv.slice(2) : ['pnw', 'atlanta', 'serengeti', 'amazon'];
const DT = 0.02, DAYS = +(process.env.DAYS || 60), seed = +(process.env.SEED || 1987);
for (const map of maps) {
  Math.random = mulberry32(seed);
  const g = restoredGame(map, seed), wl = g.wildlife, cat = g.catalog;
  populate(g, mulberry32(seed + 1));
  const hunters = new Set(cat.animals.filter(d => preyFor(d, g)).map(d => d.index));
  const by = {}, open = new Map();
  let caughtBy = new Set();
  const onPred = g.onPredation.bind(g);
  g.onPredation = (p, b) => { caughtBy.add(p.id); return onPred(p, b); };
  for (let step = 0; step < DAYS / DT; step++) {
    caughtBy = new Set();
    wl.update(DT);
    for (const a of wl.agents) {
      if (!hunters.has(a.sp)) continue;
      if (a.hunger < 9 && a.state !== 'feed' && a.state !== 'hunt') a.hunger = 9;
      const key = cat.animals[a.sp].key, s = by[key] ||= { leaps: 0, landed: 0, short: 0, kills: 0, len: 0, T: 0 };
      if (caughtBy.has(a.id)) s.kills++;
      const L = a.state === 'hunt' ? a.hunt?.leap : null, was = open.get(a.id);
      if (L && L !== was) { s.leaps++; s.len += L.len; s.T += L.T; }
      if (was && L !== was) { if (a.hunt?.stumble > 0.25) s.short++; else s.landed++; }
      if (L) open.set(a.id, L); else open.delete(a.id);
    }
  }
  console.log(`\n${map}`);
  for (const [k, s] of Object.entries(by)) if (s.leaps || s.kills) console.log(`  ${k.padEnd(14)} leaps ${String(s.leaps).padStart(4)}  on prey ${String(s.landed).padStart(4)}  short ${String(s.short).padStart(4)}  kills ${String(s.kills).padStart(4)}  len ${(s.len / (s.leaps || 1)).toFixed(2)} tiles  ${(s.T / (s.leaps || 1)).toFixed(2)} days`);
}
