// node tools/herd-crawl-probe.mjs [maps...]  (SEEDS=a,b,... OUT=file.json)
// The motion sweep's counts over many seed pairs: per map, per species, per seed pair, every count
// that breaks its limit, plus totals across all pairs. The sweep's limits were set on four seeds;
// this shows which failures are seed noise and which are real (herd squeeze crawl, 2026-11-20).
import { writeFileSync } from 'node:fs';
import { BIOME_LIST } from '../js/biome.js';
const { sweep, tally, LIMITS } = await import('./motion-sweep-check.mjs');
const args = process.argv.slice(2);
const SEEDS = (process.env.SEEDS || '1987,91,7,42,3,5,11,13,17,23,101,202,303,404,505,606,707,808,909,1010').split(',').map(Number);
const out = { seeds: SEEDS, maps: {} };
for (const biome of BIOME_LIST) {
  if (args.length && !args.includes(biome.id)) continue;
  const runs = SEEDS.map(seed => sweep(biome.id, { seed }));
  const pairs = [];
  for (let i = 0; i + 1 < runs.length; i += 2) pairs.push({ seeds: `${runs[i].seed},${runs[i + 1].seed}`, broken: tally([runs[i], runs[i + 1]]).broken });
  const all = tally(runs), crawl = {};
  for (const [key, c] of Object.entries(all.by)) if (c.crawl) crawl[key] = +all.rate(c, 'crawl').toFixed(2);
  out.maps[biome.id] = { pairs, totalBroken: all.broken, crawl };
  console.log(`\n${biome.id}: crawl per 1000 over ${SEEDS.length} seeds ${JSON.stringify(crawl)}`);
  for (const p of pairs) if (p.broken.length) console.log(`  ${p.seeds}: ${p.broken.join('; ')}`);
  console.log(`  pairs failing: ${pairs.filter(p => p.broken.length).length}/${pairs.length}; all seeds together: ${all.broken.join('; ') || 'none'}`);
}
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
