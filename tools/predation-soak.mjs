// node tools/predation-soak.mjs [years] [maps...]   (SEEDS=7,11,23)
// Predation balance on every map with hunters: the restored landscape of each map run for some
// years the way balance-sim runs the farm (a daily tick and ten wildlife steps of 0.1 day), seeded.
// Prints, per map, the mean over seeds of each hunter's and its prey's population at the end and
// the kills per hunter-year, so a hunting change can be compared before and after (decision 0026).
import { BIOMES } from '../js/biome.js';
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { preyFor } from '../js/data/animals.js';

globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const args = process.argv.slice(2), years = +(args[0] || 5);
const maps = args.slice(1).length ? args.slice(1) : Object.keys(BIOMES).filter(m => m !== 'reef');
const seeds = (process.env.SEEDS || '7,11,23').split(',').map(Number);
const t0 = Date.now();
for (const map of maps) {
  const sum = {}, add = (k, v) => { sum[k] = (sum[k] || 0) + v / seeds.length; };
  for (const seed of seeds) {
    Math.random = mulberry32(seed);
    const g = restoredGame(map, seed), cat = g.catalog;
    const hunters = cat.animals.filter(d => preyFor(d, g)), preyKeys = new Set(hunters.flatMap(d => preyFor(d, g)));
    const kills = {}, hy = {};
    const on = g.onPredation.bind(g);
    g.onPredation = (p, b) => { const k = cat.animals[p.sp].key; kills[k] = (kills[k] || 0) + 1; return on(p, b); };
    for (let d = 0; d < years * 120; d++) {
      g.dailyTick();
      for (let k = 0; k < 10; k++) g.wildlife.update(0.1);
      for (const h of hunters) hy[h.key] = (hy[h.key] || 0) + g.wildlife.state[h.index].pop / 120;
    }
    for (const h of hunters) { add(`${h.key} pop`, g.wildlife.state[h.index].pop); add(`${h.key} kills`, kills[h.key] || 0); add(`${h.key} hunterYears`, hy[h.key] || 0); }
    for (const k of preyKeys) if (cat.animal[k]) add(`  ${k}`, g.wildlife.state[cat.animal[k].index].pop);
  }
  console.log(`\n${map} (${years} y, seeds ${seeds})`);
  for (const k of Object.keys(sum).sort()) if (!k.endsWith('hunterYears')) {
    const per = k.endsWith(' kills') ? `  (${(sum[k] / Math.max(0.01, sum[k.replace('kills', 'hunterYears')])).toFixed(1)} per hunter-year)` : '';
    console.log(`  ${k.padEnd(22)} ${sum[k].toFixed(1)}${per}`);
  }
}
console.log('s', ((Date.now() - t0) / 1000).toFixed(0));
