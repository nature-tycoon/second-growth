// node tools/migration-crossing-check.mjs
// The Serengeti migration comes over the river from the far bank beyond the map's south edge.
// Herds must start on the far-bank grass, walk off-map into the river, and climb out onto the
// range: once, the smooth walker refused every off-map step, so they stood still and were then
// snapped onto the map's last row, mid-river. The great crossing keystone moment then has to
// wait for the herd to reach the water, not play while it is still walking up the far bank.
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { T } from '../js/config.js';
import { momentsUpdate } from '../js/sim/moments.js';
import { serengetiBorderCell } from '../js/maps/serengeti-world.js';

Math.random = mulberry32(3);
const g = restoredGame('serengeti', 3), wl = g.wildlife, w = g.world;
for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.FENCE) w.terrain[i] = T.PASTURE;
wl.agents = []; wl.recount(); wl.computeSuitability();
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); if (!ok) failed++; };
const def = g.catalog.animals.find(d => d.key === 'wildebeest');
g.flags.moments = {}; g.flags.momentQueue = []; g.flags.lastMomentDay = -1e9;
let swimmingAt = null;
const watch = () => { momentsUpdate(g); if (g.flags.moments.crossing != null && swimmingAt == null) swimmingAt = herd.filter(a => wl.agents.includes(a) && wet(a) && a.y < w.h).length; };
wl.crossRiver(def, 25);
const herd = wl.agents.filter(a => a.key === 'wildebeest');
const wet = a => (w.inb(Math.floor(a.x), Math.floor(a.y)) ? w.terrain[w.idx(Math.floor(a.x), Math.floor(a.y))] : serengetiBorderCell(Math.floor(a.x), Math.floor(a.y), 0.5, 0.5, w).t) === T.RIVER;
check(herd.length === 25 && herd.every(a => a.y >= w.h && !wet(a)), 'the herd starts on the far bank, out of the water');
watch();
check(g.flags.moments.crossing == null, 'the great crossing moment does not play while the herd is still on the far bank');
const y0 = herd.map(a => a.y);
for (let k = 0; k < 20; k++) { wl.update(0.05); watch(); }
check(herd.every((a, k) => a.y < y0[k] - 0.2), 'every animal walks toward the river from beyond the map edge');
let t = 0;
for (; t < 20 * 40 && !herd.every(a => !wl.agents.includes(a) || a.y < w.h && !wet(a)); t++) { if (t % 20 === 0) { g.day++; wl.daily(); } wl.update(0.05); watch(); }
check(herd.every(a => !wl.agents.includes(a) || a.y < w.h && !wet(a)), `the herd swims over and climbs out onto the range (${t} updates)`);
check(swimmingAt >= 3, `the great crossing moment plays once the herd is swimming (${swimmingAt} in the river)`);
if (failed) { console.log(`${failed} migration crossing checks failed.`); process.exit(1); }
console.log('5 migration crossing checks passed.');
