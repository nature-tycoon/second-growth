// Pond establishment, seasonal light and gap-driven forest succession.
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { World } from '../js/world.js';
import { setBiome } from '../js/biome.js';
import { PLANT, plantLeafCover, plantPhase } from '../js/data/plants.js';
import { terrainFit, plantSuit, trySeed, updatePlants, removeTree } from '../js/sim/plants.js';
import { updateCanopy, layerLight, updateEnvironment, classifyAndResources } from '../js/sim/environment.js';
import { TOOLS } from '../js/tools.js';
import { T, F, H } from '../js/config.js';
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
function fixture(map, terrain = T.SOIL, moisture = .65) {
  setBiome(map);
  const w = new World(9, 9);
  w.terrain.fill(terrain); w.moist.fill(moisture); w.baseMoist.fill(moisture);
  w.soil.fill(.8); w.distWater.fill(10); w.distLog.fill(255);
  return { world: w, catalog: w.catalog, month: 4, rng: () => 1, diff: {}, flags: {}, stats: { planted: 0, dug: 0 } };
}
check('Floating plants establish, survive and grow in pond interiors on three maps', () => {
  for (const [map, keys] of [['amazon', ['waterlily', 'hyacinth']], ['serengeti', ['bluelily']], ['sumatra', ['lotus']]]) {
    for (const key of keys) {
      const g = fixture(map, T.POND, 1), w = g.world, p = PLANT[key], i = w.idx(4, 4);
      assert.equal(terrainFit(w, i, p), 1, map + '/' + key);
      assert.ok(plantSuit(w, i, p) >= .3);
      assert.equal(trySeed(w, p, i, () => 0), true);
      const before = w.groundG[i]; updatePlants(g);
      assert.equal(w.ground[i], p.id); assert.ok(w.groundG[i] > before);
      const j = w.idx(5, 4);
      assert.equal(TOOLS['plant_' + key].apply(g, j, () => 0), true, 'player planting');
    }
  }
});
check('Reeds occupy shallow pond shores, and water plants stay out of dry/flowing ground', () => {
  const g = fixture('pnw', T.POND, 1), w = g.world, i = w.idx(4, 4);
  for (const key of ['cattail', 'tule']) {
    assert.equal(terrainFit(w, i, PLANT[key]), 0, 'no reeds in pond interior');
    w.terrain[w.idx(5, 4)] = T.MARSH;
    assert.equal(terrainFit(w, i, PLANT[key]), 1, 'shallow margin');
    w.terrain[w.idx(5, 4)] = T.POND;
  }
  setBiome('amazon');
  for (const t of [T.SOIL, T.FIELD, T.RIVER, T.CREEK, T.ROAD, T.TRAIL]) {
    w.terrain[i] = t; assert.equal(terrainFit(w, i, PLANT.waterlily), 0);
  }
  w.terrain[i] = T.POND; w.struct[i] = 0;
  assert.equal(terrainFit(w, i, PLANT.waterlily), 0, 'structures still exclude plants');
});
check('Floodplain palms grow in marsh but ordinary trees cannot occupy open water', () => {
  for (const key of ['acai', 'buriti']) {
    const g = fixture('amazon', T.MARSH, .97), w = g.world, p = PLANT[key], i = w.idx(4, 4);
    assert.equal(trySeed(w, p, i, () => 0), true);
    const before = w.treeG[i]; updatePlants(g);
    assert.equal(w.tree[i], p.id); assert.ok(w.treeG[i] > before);
    assert.equal(TOOLS['plant_' + key].apply(g, w.idx(5, 4), () => 0), true);
    assert.equal(terrainFit(w, i, PLANT.mahogany), 0);
    w.terrain[i] = T.POND; assert.equal(terrainFit(w, i, p), 0);
    w.terrain[i] = T.SOIL; w.setPlant(i, p, 1, 1200);
    assert.equal(TOOLS.marsh.apply(g, i), true, 'restoring marsh preserves swamp trees');
    assert.equal(w.tree[i], p.id); assert.equal(w.treeAge[i], 1200);
  }
  const g = fixture('pnw', T.MARSH, .97);
  assert.equal(terrainFit(g.world, 40, PLANT.cedar), 0);
});
check('Deciduous shade opens in winter without erasing mature forest or changing trees', () => {
  for (const [map, key] of [['pnw', 'maple'], ['atlanta', 'redmaple']]) {
    const g = fixture(map), w = g.world, i = w.idx(4, 4), j = w.idx(5, 4);
    const p = PLANT[key]; assert.ok(p, key); w.setPlant(i, p, 1, 40 * 120);
    const tree = w.tree.slice(), growth = w.treeG.slice(), age = w.treeAge.slice();
    updateCanopy(w, 4);
    const summer = [0, 1, 2].map(layer => layerLight(w, j, layer));
    const summerOwn = layerLight(w, i, 0);
    updateCanopy(w, 10);
    for (let layer = 0; layer < 3; layer++) assert.ok(layerLight(w, j, layer) > summer[layer]);
    assert.ok(layerLight(w, i, 0) > summerOwn + .4);
    classifyAndResources(w, 10); assert.equal(w.habitat[i], H.MATURE_FOREST);
    assert.deepEqual(w.tree, tree); assert.deepEqual(w.treeG, growth); assert.deepEqual(w.treeAge, age);
  }
});
check('Evergreen trees retain shade, while deciduous shrubs admit winter ground light', () => {
  const g = fixture('pnw'), w = g.world, i = w.idx(4, 4);
  w.setPlant(i, PLANT.cedar, 1);
  updateCanopy(w, 4); const summer = layerLight(w, i, 0);
  updateCanopy(w, 10); assert.equal(layerLight(w, i, 0), summer);
  w.clearPlants(i); w.setPlant(i, PLANT.snowberry, 1);
  updateCanopy(w, 4); const shrubSummer = layerLight(w, i, 0);
  updateCanopy(w, 10);
  assert.equal(plantPhase(PLANT.snowberry, 10), 'fruit', 'fruit can remain after leaves drop');
  assert.ok(layerLight(w, i, 0) > shrubSummer + .3);
  w.clearPlants(i); w.setPlant(i, PLANT.salal, 1);
  updateCanopy(w, 4); const salalSummer = layerLight(w, i, 0);
  updateCanopy(w, 10); assert.equal(layerLight(w, i, 0), salalSummer);
});
check('Dry forest shade follows its own seasons even during leafless flowering', () => {
  const g = fixture('chinandega'), w = g.world, i = w.idx(4, 4), p = PLANT.cortes;
  assert.ok(p); w.setPlant(i, p, 1);
  updateCanopy(w, 4); const wet = layerLight(w, i, 0);
  assert.equal(plantPhase(p, 0), 'bloom');
  updateCanopy(w, 0); assert.ok(layerLight(w, i, 0) > wet + .4);
  assert.equal(plantLeafCover(p, 0), .15);
});
check('Seasonal streamside shade affects water quality and sunlight together', () => {
  const g = fixture('pnw'), w = g.world, i = w.idx(4, 4);
  w.terrain[i] = T.CREEK;
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) {
    const j = w.idx(x, y); if (j !== i) w.setPlant(j, PLANT.maple, 1, 2400);
  }
  updateEnvironment(w, 4); const summerQ = w.waterQ[i], summerLight = layerLight(w, i, 0);
  updateEnvironment(w, 10);
  assert.ok(w.waterQ[i] < summerQ); assert.ok(layerLight(w, i, 0) > summerLight);
});
check('Recruitment cannot overwrite a living pioneer, including a stressed old tree', () => {
  const g = fixture('pnw'), w = g.world, i = w.idx(4, 4);
  w.setPlant(i, PLANT.alder, 1, 30 * 120); w.nbCanopy[i] = .85;
  assert.ok(plantSuit(w, i, PLANT.cedar) > plantSuit(w, i, PLANT.alder) + .1);
  for (let n = 0; n < 100; n++) trySeed(w, PLANT.cedar, i, () => 0); // (it may wait in the understory, never take the tree's place)
  assert.equal(w.tree[i], PLANT.alder.id); assert.equal(w.treeG[i], 1);
  assert.equal(w.treeAge[i], 3600); assert.equal(w.feature[i], 0);
});
check('Advance regeneration: shade-tolerant saplings wait under a tree and take its place when it dies', () => {
  const g = fixture('pnw'), w = g.world, i = w.idx(4, 4);
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) w.setPlant(w.idx(x, y), PLANT.maple, 1, 30 * 120);
  updateCanopy(w, 4);
  assert.ok(layerLight(w, i, 1) < PLANT.fir.light[0], 'a closed canopy');
  assert.equal(trySeed(w, PLANT.fir, i, () => 0), false, 'fir needs more light than this');
  assert.equal(trySeed(w, PLANT.alder, i, () => 0), false);
  assert.equal(trySeed(w, PLANT.hemlock, i, () => 0), true, 'hemlock waits in the shade');
  assert.equal(w.tree[i], PLANT.maple.id); assert.equal(w.understory[i], PLANT.hemlock.id);
  // it grows only slowly, and no further than the understory cap
  w.understoryG[i] = 0.24; g.rng = () => 0.5;
  for (let d = 0; d < 400; d++) updatePlants(g);
  assert.ok(w.understory[i] === PLANT.hemlock.id && w.understoryG[i] <= 0.25 + 1e-6 && w.understoryG[i] > 0.24, 'capped at 0.25');
  // the tree dies: the waiting hemlock takes the slot at its own size
  const waited = w.understoryG[i]; removeTree(w, i, 'age', () => 0);
  assert.equal(w.tree[i], PLANT.hemlock.id); assert.equal(w.treeG[i], waited); assert.equal(w.treeAge[i], 0);
  assert.equal(w.understory[i], 0, 'released: the slot is empty');
  // fire and clearing take the waiting sapling with the tree
  const j = w.idx(3, 4);
  assert.equal(trySeed(w, PLANT.cedar, j, () => 0), true);
  removeTree(w, j, 'fire', () => 0); assert.equal(w.tree[j], 0); assert.equal(w.understory[j], 0);
  const k = w.idx(5, 4); assert.equal(trySeed(w, PLANT.cedar, k, () => 0), true);
  w.clearPlants(k, 'player'); assert.equal(w.tree[k], 0); assert.equal(w.understory[k], 0);
  // nothing waits under a young tree
  const m = w.idx(4, 3); removeTree(w, m, 'age', () => 0); w.setPlant(m, PLANT.alder, 0.2, 0);
  assert.equal(trySeed(w, PLANT.hemlock, m, () => 0), false);
});
check('Conspecific negative density dependence: fewer seedlings survive among their own kind', () => {
  const g = fixture('pnw'), w = g.world, i = w.idx(4, 4);
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) if (x !== 4 || y !== 4) w.setPlant(w.idx(x, y), PLANT.fir, 1, 30 * 120);
  updateCanopy(w, 4); w.nbCanopy[i] = 0; w.canopy[i] = 0; // (the gap itself is open)
  const odds = p => { let lo = 0, hi = 1; for (let n = 0; n < 30; n++) { const r = (lo + hi) / 2; w.tree[i] = 0; if (trySeed(w, p, i, () => r)) lo = r; else hi = r; } w.tree[i] = 0; return lo; };
  const fir = odds(PLANT.fir), hemlock = odds(PLANT.hemlock);
  const share = plantSuit(w, i, PLANT.fir), shareH = plantSuit(w, i, PLANT.hemlock);
  assert.ok(Math.abs(fir / share - 0.7) < 0.02, `fir among firs: ${fir} of ${share}`); // pnw cndd 0.3, all neighbours fir
  assert.ok(Math.abs(hemlock / shareH - 1) < 0.02, `hemlock among firs: ${hemlock} of ${shareH}`);
});
check('Relaxed: fewer invasive seedlings take, wherever the seed came from; natives are untouched', () => {
  const g = fixture('pnw'), w = g.world, i = w.idx(4, 4);
  const odds = p => { let lo = 0, hi = 1; for (let n = 0; n < 30; n++) { const r = (lo + hi) / 2; w.shrub[i] = 0; if (trySeed(w, p, i, () => r)) lo = r; else hi = r; } w.shrub[i] = 0; return lo; };
  g.diff = { invasives: 1.4 }; updatePlants(g); assert.equal(w.invasiveOdds, 1, 'Challenging presses harder through seed rain, not here');
  const bb = odds(PLANT.blackberry), sb = odds(PLANT.salmonberry);
  g.diff = { invasives: 0.6 }; updatePlants(g); assert.equal(w.invasiveOdds, 0.6);
  assert.ok(Math.abs(odds(PLANT.blackberry) / bb - 0.6) < 0.02, 'blackberry takes 0.6 as often');
  assert.ok(Math.abs(odds(PLANT.salmonberry) - sb) < 1e-6, 'native salmonberry unchanged');
});
check('Succession recruits beside living trees and after natural death, preserving deadwood', () => {
  const g = fixture('pnw'), w = g.world, i = w.idx(4, 4), j = w.idx(5, 4);
  w.setPlant(i, PLANT.alder, 1, 30 * 120); updateCanopy(w, 4);
  assert.equal(trySeed(w, PLANT.cedar, j, () => 0), true);
  assert.equal(w.tree[i], PLANT.alder.id);
  g.rng = () => 0; updatePlants(g);
  assert.equal(w.tree[i], 0); assert.equal(w.feature[i], F.SNAG);
  assert.equal(trySeed(w, PLANT.cedar, i, () => 0), true);
  assert.equal(w.treeAge[i], 0); assert.ok(Math.abs(w.treeG[i] - .04) < 1e-6);
  assert.equal(w.feature[i], F.SNAG, 'new sapling does not erase deadwood');
});
check('Older saves rebuild seasonal light and preserve tree ages on restoration', () => {
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw'); g.day = 100;
  const i = g.world.idx(40, 35); g.world.clearPlants(i); g.world.struct[i] = -1;
  g.world.terrain[i] = T.SOIL; g.world.setPlant(i, PLANT.maple, 1, 2400);
  g.refreshEnvironment(); const light = layerLight(g.world, i, 0);
  const data = g.saveData(); assert.equal(data.world.arrays.canopyMonth, undefined);
  const restored = new Game(); assert.equal(restored.restoreSave(data), true);
  assert.equal(restored.world.canopyMonth, 10);
  assert.equal(layerLight(restored.world, i, 0), light);
  assert.equal(restored.world.treeAge[i], 2400);
});
check('Saplings waiting in the understory save and load, and older saves load with none', () => {
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw');
  const w = g.world, i = w.tree.findIndex((id, j) => id && w.treeG[j] > 0.5);
  w.understory[i] = PLANT.hemlock.id; w.understoryG[i] = 0.2;
  const data = g.saveData(), restored = new Game();
  assert.equal(restored.restoreSave(structuredClone(data)), true);
  assert.equal(restored.world.understory[i], PLANT.hemlock.id); assert.ok(Math.abs(restored.world.understoryG[i] - 0.2) < 1e-6);
  delete data.world.arrays.understory; delete data.world.arrays.understoryG;
  const old = new Game(); assert.equal(old.restoreSave(data), true);
  assert.equal(old.world.understory.length, old.world.n); assert.equal(old.world.understory.some(Boolean), false);
});
console.log(`${checks} plant ecology checks passed.`);
