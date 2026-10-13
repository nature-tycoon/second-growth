// Pond establishment, seasonal light and gap-driven forest succession.
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { World } from '../js/world.js';
import { setBiome } from '../js/biome.js';
import { PLANT, plantLeafCover, plantPhase } from '../js/data/plants.js';
import { terrainFit, plantSuit, trySeed, updatePlants } from '../js/sim/plants.js';
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
  for (let n = 0; n < 100; n++) assert.equal(trySeed(w, PLANT.cedar, i, () => 0), false);
  assert.equal(w.tree[i], PLANT.alder.id); assert.equal(w.treeG[i], 1);
  assert.equal(w.treeAge[i], 3600); assert.equal(w.feature[i], 0);
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
console.log(`${checks} plant ecology checks passed.`);
