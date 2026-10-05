// node tools/map-audit.mjs [years=30] [map=all] [seed=1987]
import { restoredGame, successionDay, landscapeMetrics } from './map-audit-fixtures.mjs';
import { BIOME_LIST } from '../js/biome.js';
import { WORLD_ARRAYS, EXTRA_ARRAYS } from '../js/game.js';
import { mkdir, writeFile } from 'node:fs/promises';
const years = Number(process.argv[2] ?? 30), map = process.argv[3] ?? 'all', seed = Number(process.argv[4] ?? 1987);
if (!Number.isFinite(years) || years < 0 || !Number.isInteger(seed) || map !== 'all' && !BIOME_LIST.some(b => b.id === map)) throw new Error('Use nonnegative years, a registered map (or all), and an integer seed.');
for (const b of BIOME_LIST.filter(b => map === 'all' || b.id === map)) {
  const g = restoredGame(b.id, seed);
  console.log(JSON.stringify(landscapeMetrics(g)));
  for (let d = 0; d < years * 120; d++) successionDay(g);
  console.log(JSON.stringify(landscapeMetrics(g)));
  if (process.argv.includes('--export')) {
    const dir = new URL('./map-audit-output/', import.meta.url);
    await mkdir(dir, { recursive: true });
    const arrays = Object.fromEntries([...WORLD_ARRAYS, ...Object.keys(EXTRA_ARRAYS)].filter(k => g.world[k]).map(k => [k, Array.from(g.world[k])]));
    await writeFile(new URL(`${b.id}.json`, dir), JSON.stringify({ map: b.id, seed, years, day: g.day, arrays }));
  }
}
