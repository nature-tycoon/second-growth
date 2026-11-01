// River fish stay in water they can swim in (decision 0034): node tools/fish-water-check.mjs [--report]
// Every few steps, every river fish (move 'swim', not the reef) must stand in at least FISH_DEPTH
// of its tile's water (swimDepth, which the drawing uses too), and its drawn body must be under the
// surface and over the ground. PNW (cutthroat, coho), Amazon, Chinandega and Serengeti, two seeds.
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const root = new URL('../js/', import.meta.url).href;
const { Game } = await import(root + 'game.js');
const { tileWaterLevel, groundAt } = await import(root + 'sim/waterline.js');
const FISH_DEPTH = 0.07;
// (the same as waterline.js swimDepth; written out so the check runs on older code too)
const swimDepth = (w, x, y) => { const L = tileWaterLevel(w, w.idx(Math.floor(x), Math.floor(y))); return L == null ? -Infinity : L - groundAt(w, x, y); };
const { LEVEL } = await import(root + 'config.js');
const report = process.argv.includes('--report');
let fails = 0;
for (const map of ['pnw', 'amazon', 'chinandega', 'serengeti']) for (const seed of [1987, 91]) {
  let s = seed; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const g = new Game(); g.newGame(seed, 'free', 'standard', map); const w = g.world;
  const fishDefs = g.catalog.animals.filter(d => d.move === 'swim' && !d.reef);
  // stock every river fish the map has, spread through its water
  const { isWater, T } = await import(root + 'config.js');
  const water = []; for (let i = 0; i < w.n; i++) if (isWater(w.terrain[i]) && w.terrain[i] !== T.RIVER) water.push(i);
  for (const d of fishDefs) for (let k = 0; k < 12 && water.length; k++) { const i = water[Math.floor(Math.random() * water.length)]; g.wildlife.spawn(d, i % w.w, (i / w.w) | 0, { silent: true }); }
  let samples = 0, shallow = 0, buried = 0, oldBuried = 0, worst = Infinity;
  for (let day = 0; day < 40; day++) {
    g.dailyTick();
    for (let k = 0; k < 20; k++) {
      g.wildlife.update(0.05);
      for (const a of g.wildlife.agents) {
        const d = g.catalog.animals[a.sp]; if (d.move !== 'swim' || d.reef || a.leaving || a.state === 'carried') continue;
        if (!w.inb(Math.floor(a.x), Math.floor(a.y))) continue;
        samples++; const depth = swimDepth(w, a.x, a.y); worst = Math.min(worst, depth);
        if (depth < FISH_DEPTH - 1e-6) shallow++;
        // drawn as actors.js does: at its tile's surface, down by its sink but no more than half the water
        const L = tileWaterLevel(w, w.idx(Math.floor(a.x), Math.floor(a.y))), gy = groundAt(w, a.x, a.y) * LEVEL;
        if (L == null) { buried++; oldBuried++; continue; }
        const surf = L * LEVEL, y = surf - Math.max(0, Math.min(0.06, (surf - gy) * 0.5));
        if (y < gy - 1e-6) buried++;
        if (surf - 0.06 < gy) oldBuried++; // (the old drawing: always 0.05 + its sink under the surface)
      }
    }
  }
  const line = `${map} seed ${seed}: ${samples} fish samples, ${shallow} in too-shallow water (${(shallow / Math.max(1, samples) * 1000).toFixed(1)}/1000), ${buried} drawn under ground (${oldBuried} with the old drawing), shallowest ${worst.toFixed(3)}`;
  console.log(line);
  if (!report && samples && (shallow / samples > 0.002 || buried)) fails++;
}
if (!report) { assert.equal(fails, 0, 'fish out of their depth'); console.log('PASS River fish keep to water they can swim in'); }
