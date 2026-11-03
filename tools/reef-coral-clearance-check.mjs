// Reef fish keep clear of the hard corals by body size and never get stuck (flight-clearance.js
// coralFloor): node tools/reef-coral-clearance-check.mjs [--report]
// Plants a dense coral garden over the Kalinda reef, then runs the fish for 120
// game days. Every non-benthic fish must have room for its coral floor under the surface on
// almost every sample, and none may sit on one spot the whole time while it means to be moving.
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const root = new URL('../js/', import.meta.url).href;
const { Game } = await import(root + 'game.js');
const { mulberry32 } = await import(root + 'rng.js');
const { coralFloor, SHELTER_SIZE } = await import(root + 'render3d/flight-clearance.js');
const { LEVEL } = await import(root + 'config.js');
const report = process.argv.includes('--report');
Math.random = mulberry32(1987);
const g = new Game(); g.newGame(1987, 'free', 'standard', 'reef');
const w = g.world, plants = g.catalog.plants, seaY = g.catalog.definition.look.underwater.level * LEVEL;
// a dense coral garden: staghorn and table coral everywhere the sea floor is deep enough
const stag = g.catalog.plant.staghorn, table = g.catalog.plant.tablecoral;
for (let i = 0; i < w.n; i++) if (!w.tree[i] && !w.shrub[i] && (i * 7) % 3 && !g.catalog.definition.dryLand?.(w, i)) {
  w.tree[i] = (i % 5 ? stag : table).id; w.treeG[i] = 1; w.treeAge[i] = 2000;
}
for (let d = 0; d < 60; d++) g.wildlife.update(0.25);
const fish = () => g.wildlife.agents.filter(a => a && g.catalog.animals[a.sp].reef && !g.catalog.animals[a.sp].benthic);
const start = new Map(fish().map(a => [a.id, [a.x, a.y, 0]]));
let samples = 0, clamped = 0, small = 0, big = 0;
for (let f = 0; f < 2400; f++) { // (2400 steps of 0.05 days)
  g.wildlife.update(0.05);
  if (f % 10) continue;
  for (const a of fish()) {
    const def = g.catalog.animals[a.sp], floor = coralFloor(w, plants, a, def);
    samples++; if (floor > seaY - 0.08) clamped++;
    if (floor > -Infinity) (def.sprite.size <= SHELTER_SIZE ? small++ : big++);
    const s = start.get(a.id); if (s) s[2] = Math.max(s[2], Math.hypot(a.x - s[0], a.y - s[1]));
  }
}
const stuck = fish().filter(a => { const s = start.get(a.id); return s && s[2] < 0.3 && !g.catalog.animals[a.sp].behavior?.territory?.tether; });
if (report) console.log({ fish: fish().length, samples, clamped, overCoralSmall: small, overCoralBig: big, stuck: stuck.map(a => a.sp) });
assert(samples > 500, 'enough fish to check');
assert(big > 0, 'bigger fish crossed coral and were lifted over it');
assert(clamped / samples < 0.01, `coral floor above the surface on ${clamped}/${samples} samples`);
assert(stuck.length === 0, `fish that never moved: ${stuck.map(a => g.catalog.animals[a.sp].key).join(', ')}`);
console.log(`PASS reef fish keep clear of coral (${samples} samples, ${clamped} with no room, none stuck)`);
