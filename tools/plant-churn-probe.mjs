// How much of the map's plants a day of a new game asks the drawing to redo, per map: regions
// queued, tiles worked out afresh, and the time to draw them (a probe for the 2026-11 lag review).
//   node tools/plant-churn-probe.mjs [maps] [days]
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const THREE = await import('three');
const { Game } = await import('../js/game.js');
const { Flora } = await import('../js/render3d/flora.js');
const maps = (process.argv[2] || 'pnw,sumatra,serengeti,amazon').split(','), days = +(process.argv[3] || 20);
for (const map of maps) {
  const g = new Game(); g.newGame(1987, 'free', 'standard', map);
  const f = new Flora(new THREE.Scene(), { catalog: g.catalog }); f.setZoom(0.7); f.rebuild(g, true);
  let regions = 0, tiles = 0, ms = 0, calls = 0, month = 0;
  for (let d = 0; d < days; d++) {
    const was = g.month; g.dailyTick(); for (let k = 0; k < 20; k++) g.wildlife.update(0.05);
    if (g.month !== was) { month++; f.rebuild(g, false, Infinity); continue; }
    const t = performance.now(); let more = true;
    while (more) { more = f.rebuild(g, false, 1); calls++; regions += f.lastRebuild.regions || 0; tiles += f.lastRebuild.tiles; }
    ms += performance.now() - t;
  }
  const n = days - month;
  console.log(`${map}: per day ${(regions / n).toFixed(1)} regions of ${Math.ceil((g.world.w + 8) / f.chunkSize) * Math.ceil((g.world.h + 8) / f.chunkSize)}, ${(tiles / n).toFixed(0)} tiles visited, ${(ms / n).toFixed(1)} ms in ${(calls / n).toFixed(1)} calls`);
}
