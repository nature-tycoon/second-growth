// New wildlife must stay sparse through immigration, births, habitat loss and save/restore.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const { restoredGame } = await import('./map-audit-fixtures.mjs');
const { Game } = await import('../js/game.js');
const { ANIMALS, ANIMAL } = await import('../js/data/animals.js');
const { PLANT } = await import('../js/data/plants.js');
const { DAYS_PER_YEAR } = await import('../js/config.js');
const { BIOMES } = await import('../js/biome.js');
const { passable } = await import('../js/sim/animal-terrain.js');
const { buildSpecies } = await import('../js/render3d/fauna.js');
const { mulberry32 } = await import('../js/rng.js');
const additions = { atlanta: { otter: 2, coyote: 2 }, serengeti: { topi: 8, hartebeest: 6 }, reef: { seacucumber: 10, urchin: 8 } };
const originalCount = { atlanta: 30, serengeti: 26, reef: 19 };
const present = (wl, def) => wl.agents.filter(a => a.sp === def.index).length;
for (const [map, keys] of Object.entries(additions)) {
  const g = restoredGame(map), wl = g.wildlife, w = g.world;
  // A pre-addition save has a shorter species state table.
  const legacy = g.saveData(); legacy.wildlife.state.length = originalCount[map];
  legacy.wildlife.agents = legacy.wildlife.agents.filter(a => a.sp < originalCount[map]);
  const legacyGame = new Game(); assert.equal(legacyGame.restoreSave(legacy), true);
  for (const a of legacyGame.wildlife.agents) assert.equal(ANIMALS[a.sp].key, a.key, 'Legacy identities retained');
  for (const key of Object.keys(keys)) assert.equal(legacyGame.wildlife.state[ANIMAL[key].index].pop, 0);
  Math.random = mulberry32(8739);
  const defs = Object.keys(keys).map(key => ANIMAL[key]);
  // (later additions, like the reef's longtom and blacktip, append after these in turn)
  assert.deepEqual(ANIMALS.slice(originalCount[map], originalCount[map] + defs.length).map(d => d.key), Object.keys(keys), 'Append new species after saved indices');
  for (const def of defs) {
    assert.equal(def.max, keys[def.key]); assert.equal(def.fixedMax, true); assert.equal(def.strictMax, true);
    const { geo } = buildSpecies(def);
    assert(geo.index.count / 3 < 16000, `${def.key}: modest geometry budget`);
    assert(geo.attributes.position.array.every(Number.isFinite));
    geo.computeBoundingBox(); assert(geo.boundingBox.min.y >= -0.2); geo.dispose();
    // One place left: an oversized arriving group cannot overshoot, even with departing residents.
    wl.agents = []; wl.ids.clear(); wl.recount(); wl.computeSuitability();
    const st = wl.state[def.index]; st.K = def.max;
    const tile = wl.suit[def.index].findIndex((s, i) => s > 0.1 && passable(w, i, def));
    assert(tile >= 0, `${map}/${def.key}: restored landscape supports habitat`);
    for (let n = 0; n < def.max - 1; n++) wl.spawn(def, tile % w.w, Math.floor(tile / w.w), { silent: true });
    const first = wl.agents[0]; wl.leave(first); wl.recount();
    assert.equal(wl.recruitmentRoom(def), 1, 'Departing animals count toward the visual limit');
    for (let n = 0; n < 12 && present(wl, def) < def.max; n++) wl.immigrate(def, 1000);
    assert.equal(present(wl, def), def.max, `${map}/${def.key}: recruitment fills just one remaining place`);
    assert.equal(wl.immigrate(def, 1000), 0);
    st.K = 0; assert.equal(wl.immigrate(def, 1000), 0, 'Habitat loss stops recruitment');
    // Stress an oversized litter with room for only one young, without changing production tuning.
    wl.agents = []; wl.ids.clear(); wl.recount();
    for (let n = 0; n < 2; n++) wl.spawn(def, tile % w.w, Math.floor(tile / w.w), { age: 3 * DAYS_PER_YEAR, silent: true });
    const previous = { max: def.max, breed: def.breed, litter: def.litter, life: def.life, mig: def.mig };
    def.max = 3; def.breed = [g.month]; def.litter = [8, 8]; def.life = 1e9; def.mig = 0;
    const compute = wl.computeSuitability.bind(wl), rng = g.rng;
    wl.computeSuitability = () => { for (const s of wl.state) s.K = 0; st.K = 3; };
    g.rng = () => 0;
    wl.monthly();
    assert.equal(present(wl, def), 3, `${map}/${def.key}: litter respects remaining room`);
    wl.computeSuitability = compute; g.rng = rng; Object.assign(def, previous);
  }
  // Real habitat/prey capacity, all difficulties, ten years of monthly population dynamics.
  for (const difficulty of ['relaxed', 'standard', 'challenging']) {
    g.difficulty = difficulty;
    const peaks = Object.fromEntries(Object.keys(keys).map(k => [k, 0]));
    wl.agents = []; wl.ids.clear(); wl.recount();
    for (const def of ANIMALS.filter(d => d.move === 'swim' || ['cottontail', 'chipmunk'].includes(d.key))) {
      const tile = w.terrain.findIndex((t, i) => passable(w, i, def));
      for (let n = 0; n < 20; n++) wl.spawn(def, tile % w.w, Math.floor(tile / w.w), { silent: true });
    }
    for (let month = 0; month < 120; month++) {
      g.day = month * 10;
      for (const a of wl.agents.slice()) { if (a.leaving) wl.remove(a, 'departure'); else a.age += 10; }
      wl.monthly();
      for (const def of defs) {
        peaks[def.key] = Math.max(peaks[def.key], present(wl, def));
        assert(present(wl, def) <= def.max, `${map}/${difficulty}/${def.key}: ten-year population limit`);
      }
    }
    for (const def of defs) assert(peaks[def.key] > 0, `${map}/${difficulty}/${def.key}: natural arrivals are attainable`);
    console.log(`  ${map}/${difficulty} ten-year peaks: ${JSON.stringify(peaks)}`);
    const save = g.saveData(), expected = wl.agents.map(a => [a.id, a.key]);
    const restored = new Game(); assert.equal(restored.restoreSave(save), true);
    assert.deepEqual(restored.wildlife.agents.map(a => [a.id, a.key]), expected, 'New wildlife survives save/restore');
  }
  console.log(`PASS ${map}: strict arrival/litter limits, departing residents, habitat loss, ten-year populations and saves`);
}
// Grazing stays local, and bottom dwellers cannot walk onto the island.
{
  const g = restoredGame('reef'), w = g.world, def = ANIMAL.urchin;
  const tile = w.terrain.findIndex((t, i) => passable(w, i, def) && !w.tree[i] && !w.shrub[i] && i % w.w > 2 && i % w.w < w.w - 3);
  assert(tile >= 0); g.wildlife.agents = []; g.wildlife.ids.clear(); g.wildlife.recount();
  const a = g.wildlife.spawn(def, tile % w.w, Math.floor(tile / w.w), { silent: true }); a.x = tile % w.w + 0.5; a.y = Math.floor(tile / w.w) + 0.5;
  w.ground[tile] = w.ground[tile + 1] = PLANT.turf.id; w.groundG[tile] = w.groundG[tile + 1] = 0.5;
  // Isolate the new grazer from existing giant-clam filtration.
  for (let i = 0; i < w.n; i++) if (w.shrub[i] === PLANT.clam.id) w.shrub[i] = 0;
  g.day = 25; BIOMES.reef.daily(g);
  assert(Math.abs(w.groundG[tile] - 0.475) < 1e-5, 'Urchins graze turf on their own tile');
  assert.equal(w.groundG[tile + 1], 0.5, 'Urchins do not clear surrounding reef');
  const cay = w.terrain.findIndex((t, i) => BIOMES.reef.dryLand(w, i)); assert(cay >= 0);
  for (const key of ['urchin', 'seacucumber']) assert.equal(passable(w, cay, ANIMAL[key]), false, 'Benthic animals stay off the cay');
}
console.log('Wildlife additions stay sparse and integrate with reef habitat.');
