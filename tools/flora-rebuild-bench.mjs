// Times budgeted plant rebuilds after a small edit and after a day's growth, as the renderer
// schedules them (one region per call), and prints a signature of the drawn instances so a
// change to the rebuild can be shown to draw exactly the same plants.
//   node tools/flora-rebuild-bench.mjs [maps=pnw,sumatra] [rounds=5]
// FLORA_ROOT=<checkout> runs another checkout's code for an A/B comparison.
import { register } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
register('./three-loader.mjs', import.meta.url);
const root = pathToFileURL(resolve(process.env.FLORA_ROOT || fileURLToPath(new URL('..', import.meta.url))) + '/').href;
const THREE = await import('three');
const { Flora, floraVersion } = await import(root + 'js/render3d/flora.js');
const { plantFixture, editPlants, growPlants } = await import(root + 'tools/plant-performance-fixtures.mjs');
const { mulberry32 } = await import(root + 'js/rng.js');
const maps = (process.argv[2] || 'pnw,sumatra').split(','), rounds = Number(process.argv[3] || 5);
const stats = a => { const s = [...a].sort((x, y) => x - y); return { mean: s.reduce((n, x) => n + x, 0) / s.length, p95: s[Math.min(s.length - 1, Math.floor(s.length * .95))], max: s.at(-1) }; };
function signature(flora) {
  const h = createHash('sha1');
  for (const [key, pool] of [...flora.pools].sort((a, b) => a[0] < b[0] ? -1 : 1)) for (const [k, p] of [...pool.subs].sort((a, b) => a[0] - b[0])) {
    if (!p.mesh || !p.mesh.count) continue;
    h.update(key + ':' + k + ':' + p.mesh.count + ':' + p.lod);
    h.update(Buffer.from(p.mesh.instanceMatrix.array.buffer, 0, p.mesh.count * 64)); h.update(Buffer.from(p.mesh.instanceColor.array.buffer, 0, p.mesh.count * 12));
  }
  return h.digest('hex').slice(0, 12);
}
function drain(flora, game, out) {
  const before = floraVersion.n; let calls = 0;
  for (;;) { const t = performance.now(); const more = flora.rebuild(game, false, 1); out.push(performance.now() - t); calls++; if (!more) break; }
  return { calls, bumps: floraVersion.n - before };
}
for (const map of maps) {
  const edit = [], grow = [], info = {}; let sig;
  for (let r = 0; r < rounds; r++) {
    Math.random = mulberry32(1987);
    const game = plantFixture(map), flora = new Flora(new THREE.Scene()); flora.setZoom(1);
    const t0 = performance.now(); flora.rebuild(game, true); info.full = performance.now() - t0;
    flora.rebuild(game); // (settle)
    editPlants(game); info.edit = drain(flora, game, edit);
    growPlants(game); info.grow = drain(flora, game, grow);
    sig = signature(flora);
  }
  const e = stats(edit), g = stats(grow);
  console.log(`${map}: full ${info.full.toFixed(0)}ms | edit ${info.edit.calls} calls mean ${e.mean.toFixed(2)} p95 ${e.p95.toFixed(2)} max ${e.max.toFixed(2)}ms, ${info.edit.bumps} plant-version bumps | growth ${info.grow.calls} calls mean ${g.mean.toFixed(2)} p95 ${g.p95.toFixed(2)} max ${g.max.toFixed(2)}ms, ${info.grow.bumps} bumps | sig ${sig}`);
}
