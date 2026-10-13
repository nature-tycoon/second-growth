// Cross-map isolation: interleaved farms must behave like farms run on their own.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Actors } = await import('../js/render3d/actors.js');
const { Flora, leafColor } = await import('../js/render3d/flora.js');
import { Game } from '../js/game.js';
import { BIOME_LIST, mapCatalog, setBiome } from '../js/biome.js';
import { ToolActions } from '../js/tool-actions.js';
import { many } from '../js/data/animals.js';
import { mulberry32 } from '../js/rng.js';
import { wildlifeDiagnostics } from '../js/sim/wildlife-diagnostics.js';
import { passageGuide } from '../js/sim/bird-passage.js';
import { currentChapter, unlockedTools } from '../js/sim/campaign.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }
function create(map) {
  Math.random = mulberry32(42);
  const game = new Game(); game.newGame(1987, 'campaign', 'challenging', map);
  return game;
}
function advance(game, day) {
  Math.random = mulberry32(1987 + day);
  game.dailyTick(); game.wildlife.update(0.05);
}

const solo = new Map();
for (const { id } of BIOME_LIST) {
  const game = create(id);
  for (let day = 0; day < 12; day++) advance(game, day);
  solo.set(id, digest(game.saveData()));
}
const farms = BIOME_LIST.map(({ id }) => create(id));
for (let day = 0; day < 12; day++) for (const game of farms) {
  // Deliberately select another map before every tick.
  setBiome(game.map === 'reef' ? 'pnw' : 'reef');
  advance(game, day);
}
for (const game of farms) check(`${game.map}: interleaved ecology, campaign and save match the isolated farm`, () => {
  assert.equal(game.world.catalog, game.catalog);
  assert.equal(digest(game.saveData()), solo.get(game.map));
  for (const layer of ['ground', 'shrub', 'tree']) for (const id of game.world[layer]) assert.ok(!id || game.catalog.plants[id]);
  assert.equal(game.wildlife.state.length, game.catalog.animals.length);
});

check('Tool strokes retain their map definitions when another map is selected', () => {
  const game = farms[0]; game.mode = 'free'; game.money = 10000;
  const actions = new ToolActions(game);
  const i = game.world.idx(10, 10), stroke = actions.begin('raise');
  assert.ok(stroke); const cost = stroke.tool.cost;
  setBiome('reef');
  assert.equal(actions.current(stroke), true);
  assert.equal(actions.applyTiles(stroke, [i]).length, 1);
  actions.end(stroke);
  assert.equal(game.money, 10000 - Math.round(cost * game.diff.costs));
  assert.equal(actions.begin(mapCatalog('reef').tools.raise), null, 'foreign tool objects are rejected');
});

check('Diagnostics, passing birds and campaign unlocks retain the owning catalog', () => {
  for (const game of farms) {
    setBiome(game.map);
    const def = game.catalog.animals[0];
    const before = digest([wildlifeDiagnostics(game, def), passageGuide(game), currentChapter(game), [...(unlockedTools(game) || [])], many(def)]);
    setBiome(game.map === 'reef' ? 'pnw' : 'reef');
    assert.equal(digest([wildlifeDiagnostics(game, def), passageGuide(game), currentChapter(game), [...(unlockedTools(game) || [])], many(def)]), before);
  }
});

check('Restored farms use their saved map even while other farms remain live', () => {
  for (const source of farms) {
    source.refreshEnvironment();
    const data = source.saveData(), restored = create(source.map === 'reef' ? 'pnw' : 'reef');
    assert.equal(restored.restoreSave(data), true);
    assert.equal(restored.catalog, source.catalog);
    assert.deepEqual(restored.saveData().plants, data.plants);
    setBiome(source.map === 'reef' ? 'pnw' : 'reef');
    assert.equal(digest(source.saveData()), digest(data));
    restored.refreshEnvironment(); restored.wildlife.computeSuitability();
    assert.equal(digest(restored.world.stats), digest(source.world.stats));
  }
});

check('Plant instance placement and colours are independent of the selected map', () => {
  for (const game of [farms[0], farms[5]]) {
    const flora = new Flora(new THREE.Scene(), { catalog: game.catalog });
    const instances = () => [...flora.pools].map(([key, pool]) => [key, [...pool.subs].map(([chunk, p]) => [chunk, p.n, p.m, p.c])]);
    setBiome(game.map); flora.rebuild(game, true);
    const before = digest(instances());
    const plant = game.catalog.plants.find(p => p?.native), colour = leafColor(plant, 'green');
    setBiome(game.map === 'reef' ? 'pnw' : 'reef'); flora.rebuild(game, true);
    assert.equal(digest(instances()), before);
    assert.deepEqual(leafColor(plant, 'green'), colour);
  }
});

check('Animal drawing resolves each farm’s species after selecting another map', () => {
  const cameraRight = new THREE.Vector3(1, 0, 0);
  for (const game of farms) {
    const actors = new Actors(new THREE.Scene());
    setBiome(game.map === 'reef' ? 'pnw' : 'reef');
    actors.update(game, cameraRight, 0);
    for (const a of game.wildlife.agents) assert.ok(actors.pose.has(a.id));
  }
});

console.log(`${checks} map catalog isolation checks passed.`);
