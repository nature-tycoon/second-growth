// Animal spacing cost for spread and packed herds, with a signature of the final positions so
// a faster spacing pass can be shown to move every animal exactly as before.
//   node tools/spacing-bench.mjs   (SPACING_ROOT=<checkout> for an A/B comparison)
import { register } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
register('./three-loader.mjs', import.meta.url);
const root = pathToFileURL(resolve(process.env.SPACING_ROOT || fileURLToPath(new URL('..', import.meta.url))) + '/').href;
const { Game } = await import(root + 'js/game.js');
const { T } = await import(root + 'js/config.js');
const { ANIMAL } = await import(root + 'js/data/animals.js');
const { passable } = await import(root + 'js/sim/animals.js');
const { mulberry32 } = await import(root + 'js/rng.js');
Math.random = mulberry32(1987);
const g = new Game();
function herd(n, packed) {
  g.newGame(1987, 'free', 'standard', 'serengeti'); g.wildlife.agents = []; g.wildlife.recount();
  const w = g.world; for (let i = 0; i < w.n; i++) { w.terrain[i] = T.SOIL; w.struct[i] = -1; w.feature[i] = 0; w.clearPlants(i); }
  const side = Math.ceil(Math.sqrt(n)), gap = packed ? 0.12 : 1.6;
  for (let k = 0; k < n; k++) { const a = g.wildlife.spawn(ANIMAL.zebra, 20 + (k % side) * gap + (k * 0.37 % 0.05), 20 + Math.floor(k / side) * gap, { silent: true }); a.wait = 100; a.orientation = 0; }
}
for (const packed of [false, true]) for (const n of [128, 256, 512, 1024]) {
  herd(n, packed); const sp = g.wildlife.spacing, times = [];
  for (let k = 0; k < (n > 512 ? 12 : 30); k++) { const t = performance.now(); sp.rebuild(g.world, g.wildlife.agents); sp.separate(0.024, passable); times.push(performance.now() - t); }
  const h = createHash('sha1'); for (const a of g.wildlife.agents) h.update(new Float64Array([a.x, a.y, a.pushX || 0, a.pushY || 0]));
  times.sort((a, b) => a - b);
  console.log(`${packed ? 'packed' : 'spread'} ${String(n).padStart(4)}: median ${times[times.length >> 1].toFixed(3)} ms  sig ${h.digest('hex').slice(0, 12)}`);
}
