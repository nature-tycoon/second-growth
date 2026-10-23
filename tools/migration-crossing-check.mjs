// node tools/migration-crossing-check.mjs
// The Serengeti migration comes over the river from the far bank beyond the map's south edge.
// Herds must start on the far-bank grass, walk off-map into the river, and climb out onto the
// range: once, the smooth walker refused every off-map step, so they stood still and were then
// snapped onto the map's last row, mid-river.
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { T } from '../js/config.js';
import { serengetiBorderCell } from '../js/maps/serengeti-world.js';

Math.random = mulberry32(3);
const g = restoredGame('serengeti', 3), wl = g.wildlife, w = g.world;
for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.FENCE) w.terrain[i] = T.PASTURE;
wl.agents = []; wl.recount(); wl.computeSuitability();
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); if (!ok) failed++; };
const def = g.catalog.animals.find(d => d.key === 'wildebeest');
wl.crossRiver(def, 25);
const herd = wl.agents.filter(a => a.key === 'wildebeest');
const wet = a => (w.inb(Math.floor(a.x), Math.floor(a.y)) ? w.terrain[w.idx(Math.floor(a.x), Math.floor(a.y))] : serengetiBorderCell(Math.floor(a.x), Math.floor(a.y), 0.5, 0.5, w).t) === T.RIVER;
check(herd.length === 25 && herd.every(a => a.y >= w.h && !wet(a)), 'the herd starts on the far bank, out of the water');
const y0 = herd.map(a => a.y);
for (let k = 0; k < 20; k++) wl.update(0.05);
check(herd.every((a, k) => a.y < y0[k] - 0.2), 'every animal walks toward the river from beyond the map edge');
let t = 0;
for (; t < 20 * 40 && !herd.every(a => !wl.agents.includes(a) || a.y < w.h && !wet(a)); t++) { if (t % 20 === 0) { g.day++; wl.daily(); } wl.update(0.05); }
check(herd.every(a => !wl.agents.includes(a) || a.y < w.h && !wet(a)), `the herd swims over and climbs out onto the range (${t} updates)`);
if (failed) { console.log(`${failed} migration crossing checks failed.`); process.exit(1); }
console.log('3 migration crossing checks passed.');
