// Focused ecological regression checks: node tools/map-audit-check.mjs
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { PLANT, plantPhase } from '../js/data/plants.js';
import { terrainFit, plantSuit, trySeed, updatePlants } from '../js/sim/plants.js';
import { TOOLS } from '../js/tools.js';
import { T, F } from '../js/config.js';

const g = new Game();
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function tile(x, y, terrain = T.SOIL, moisture = 0.5) {
  const w = g.world, i = w.idx(x, y);
  w.clearPlants(i); w.struct[i] = -1; w.feature[i] = 0;
  w.terrain[i] = terrain; w.moist[i] = moisture; w.baseMoist[i] = moisture;
  w.soil[i] = 0.8; w.canopy[i] = w.nbCanopy[i] = 0; w.distWater[i] = 10;
  return i;
}

g.newGame(1987, 'free', 'standard', 'chinandega');
check('Nicaragua keeps established native grazing gaps open', () => {
  const i = tile(65, 36); g.world.setPlant(i, PLANT.paspalum, 1);
  assert.equal(trySeed(g.world, PLANT.guanacaste, i, () => 0), false);
});
check('Players can still plant shade trees in Nicaragua paddocks', () => {
  const i = tile(65, 36); g.world.setPlant(i, PLANT.paspalum, 1);
  assert.equal(TOOLS.plant_guanacaste.apply(g, i, () => 0), true);
  assert.equal(g.world.tree[i], PLANT.guanacaste.id);
});
check('Nicaragua slope forest still regenerates through native grass', () => {
  const i = tile(20, 15); g.world.setPlant(i, PLANT.paspalum, 1);
  assert.equal(trySeed(g.world, PLANT.guanacaste, i, () => 0), true);
});
check('Nicaragua stream banks and living fences still regenerate', () => {
  const i = tile(65, 36); g.world.setPlant(i, PLANT.paspalum, 1); g.world.distWater[i] = 2;
  assert.equal(trySeed(g.world, PLANT.chilamate, i, () => 0), true);
  const j = tile(24, 36); g.world.setPlant(j, PLANT.paspalum, 1); g.world.feature[j] = F.FENCE;
  assert.equal(trySeed(g.world, PLANT.madero, j, () => 0), true);
});
check('Dry forest sheds leaves seasonally; mangroves stay green', () => {
  assert.equal(plantPhase(PLANT.guanacaste, 10), 'winter');
  assert.equal(plantPhase(PLANT.guanacaste, 3), 'green');
  assert.equal(plantPhase(PLANT.redmangrove, 10), 'green');
});

g.newGame(1987, 'free', 'standard', 'sumatra');
check('Peat swamp specialists establish in flooded marsh', () => {
  const i = tile(20, 65, T.MARSH, 0.97);
  for (const key of ['jelutong', 'nibung']) {
    g.world.clearPlants(i);
    assert.ok(plantSuit(g.world, i, PLANT[key]) >= 0.3);
    assert.equal(trySeed(g.world, PLANT[key], i, () => 0), true);
  }
});
check('Wet peat excludes oil palms and mineral-soil trees', () => {
  const i = tile(20, 65, T.SOIL, 0.64);
  for (const key of ['oilpalm', 'meranti', 'durian']) assert.ok(plantSuit(g.world, i, PLANT[key]) < 0.3, key);
  assert.ok(plantSuit(g.world, i, PLANT.jelutong) > 0.3);
  g.world.baseMoist[i] = 0.4;
  assert.ok(plantSuit(g.world, i, PLANT.oilpalm) > 0.3);
  const j = tile(20, 20, T.SOIL, 0.64);
  assert.ok(plantSuit(g.world, j, PLANT.meranti) > 0.3);
});
check('Sumatra has common groundcover for a closed rainforest canopy', () => {
  const i = tile(20, 20, T.DUFF, 0.65);
  g.world.canopy[i] = 1; g.world.shrubG[i] = 1;
  assert.ok(plantSuit(g.world, i, PLANT.spikemoss) >= 0.3);
  assert.ok(PLANT.titan.spread * 50 < PLANT.spikemoss.spread);
  assert.equal(plantPhase(PLANT.spikemoss, 10), 'green');
});
check('Sumatra saves from before the new groundcover retain their plants', () => {
  const memory = new Map();
  globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  const i = tile(20, 20, T.DUFF, 0.65); g.world.setPlant(i, PLANT.meranti, 0.9);
  assert.equal(g.save(), true);
  const key = Game.saveKey('sumatra'), old = JSON.parse(memory.get(key));
  assert.equal(old.plants.pop(), 'spikemoss');
  memory.set(key, JSON.stringify(old));
  assert.equal(g.load('sumatra'), true);
  assert.equal(g.world.tree[i], PLANT.meranti.id);
});

g.newGame(1987, 'free', 'standard', 'pnw');
check('Washington marsh remains open and excludes ordinary trees', () => {
  const i = tile(20, 60, T.MARSH, 0.97);
  assert.equal(terrainFit(g.world, i, PLANT.cedar), 0);
  assert.ok(plantSuit(g.world, i, PLANT.sedge) > 0.3);
});

g.newGame(1987, 'free', 'standard', 'atlanta');
check('Atlanta native flower beds resist woody encroachment', () => {
  const i = tile(10, 10); g.world.setPlant(i, PLANT.coneflower, 1);
  assert.equal(trySeed(g.world, PLANT.whiteoak, i, () => 0), false);
});

g.newGame(1987, 'free', 'standard', 'amazon');
check('Amazon rainforest can recruit trees into restored groundcover', () => {
  const i = tile(20, 20, T.SOIL, 0.65); g.world.setPlant(i, PLANT.heliconia, 1);
  assert.equal(trySeed(g.world, PLANT.mahogany, i, () => 0), true);
  assert.equal(plantPhase(PLANT.mahogany, 10), 'green');
});

g.newGame(1987, 'free', 'standard', 'serengeti');
check('Serengeti scattered mature trees exclude nearby tree recruits', () => {
  const i = tile(20, 20, T.SOIL, 0.35), j = tile(21, 20, T.SOIL, 0.35);
  g.world.setPlant(j, PLANT.umbrella, 1);
  assert.equal(trySeed(g.world, PLANT.umbrella, i, () => 0), false);
  g.world.distWater[i] = 2;
  assert.equal(trySeed(g.world, PLANT.umbrella, i, () => 0), true);
});

g.newGame(1987, 'free', 'standard', 'reef');
check('Reef keeps sand for seagrass and stable substrate for coral', () => {
  const i = tile(60, 55, T.PASTURE, 0.5);
  assert.ok(plantSuit(g.world, i, PLANT.halophila) >= 0.3);
  assert.ok(plantSuit(g.world, i, PLANT.staghorn) < 0.3);
  g.world.terrain[i] = T.SOIL;
  assert.ok(plantSuit(g.world, i, PLANT.staghorn) >= 0.3);
});
// A clean patch isolates recruitment from the reef's randomly generated residents.
function sandPatch(cx, cy) {
  for (let y = Math.max(0, cy - 7); y <= Math.min(g.world.h - 1, cy + 7); y++) {
    for (let x = Math.max(0, cx - 7); x <= Math.min(g.world.w - 1, cx + 7); x++) tile(x, y, T.PASTURE);
  }
}
check('Clam larvae settle in gaps beyond their parent, not in dense carpets', () => {
  sandPatch(60, 55);
  const w = g.world, parent = w.idx(60, 55);
  w.setPlant(parent, PLANT.clam, 1);
  for (const [x, y] of [[61, 55], [63, 55], [57, 52], [63, 58]]) {
    assert.equal(trySeed(w, PLANT.clam, w.idx(x, y), () => 0), false);
  }
  const gap = w.idx(64, 55);
  assert.ok(PLANT.clam.radius > PLANT.clam.seedSpacing);
  assert.equal(trySeed(w, PLANT.clam, gap, () => 0), true);
  assert.equal(trySeed(w, PLANT.clam, w.idx(67, 55), () => 0), false, 'new juveniles also reserve space');
});
check('Clam spacing preserves existing adults and intentional player planting', () => {
  sandPatch(60, 55);
  const w = g.world, adult = w.idx(60, 55), beside = w.idx(61, 55);
  w.setPlant(adult, PLANT.clam, 0.8);
  assert.equal(TOOLS.plant_clam.apply(g, beside, () => 0), true);
  assert.ok(plantSuit(w, adult, PLANT.clam) >= 0.3);
  assert.ok(plantSuit(w, beside, PLANT.clam) >= 0.3);
  g.rng = () => 1;
  updatePlants(g);
  assert.equal(w.shrub[adult], PLANT.clam.id);
  assert.ok(w.shrubG[adult] > 0.8);
  assert.equal(w.shrub[beside], PLANT.clam.id);
});
check('Clam spacing clips at map edges without wrapping across rows', () => {
  sandPatch(0, 55);
  const w = g.world, i = w.idx(0, 55);
  const wrapped = tile(w.w - 1, 54, T.PASTURE);
  w.setPlant(wrapped, PLANT.clam, 1);
  assert.equal(trySeed(w, PLANT.clam, i, () => 0), true);
  assert.equal(trySeed(w, PLANT.clam, w.idx(1, 55), () => 0), false);
});
console.log(`${checks} ecological checks passed.`);
