// Exercise public data boundaries with real maps and deliberately malformed inputs.
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { BIOME_LIST, biome } from '../js/biome.js';
import { createPlants } from '../js/data/plants.js';
import { createAnimals } from '../js/data/animals.js';
import { ToolActions } from '../js/tool-actions.js';
import { createFarmState } from '../js/farm-state.js';
import { ContractError, assertCatalog, assertSeedMix, assertAnimalMetadata,
  assertToolDefinition, assertChapters, assertMapDefinition, assertFarmState,
  assertSaveEnvelope, assertWorld } from '../js/data/contracts.js';

let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }
function rejects(run, path) {
  assert.throws(run, error => error instanceof ContractError && error.path === path);
}
const g = new Game();
g.newGame(1987, 'free', 'standard', 'pnw');
const catalog = g.catalog, plant = catalog.plants[1], animal = catalog.animals[0];
const plantBuilder = spec => createPlants(def => def(spec), 'fixture');
const animalBuilder = spec => createAnimals(def => { def(spec); return { groups: [spec.group] }; }, 'fixture');

check('Species builders reject misspelled fields, bad ranges and invalid movement', () => {
  rejects(() => plantBuilder({ ...plant, growth: 1 }), `fixture.plants.${plant.key}.growth`);
  rejects(() => plantBuilder({ ...plant, grow: NaN }), `fixture.plants.${plant.key}.grow`);
  rejects(() => plantBuilder({ ...plant, moist: [0.8, 0.2] }), `fixture.plants.${plant.key}.moist`);
  rejects(() => plantBuilder({ ...plant, look: { ...plant.look, bloom: [12] } }), `fixture.plants.${plant.key}.look.bloom[0]`);
  rejects(() => animalBuilder({ ...animal, move: 'flying' }), `fixture.animals.${animal.key}.move`);
  rejects(() => animalBuilder({ ...animal, hr: 0 }), `fixture.animals.${animal.key}.hr`);
});

check('Duplicate species and mix keys fail at registration instead of overwriting lookups', () => {
  rejects(() => createPlants(def => { def(plant); def(plant); }, 'fixture'), `fixture.plants.${plant.key}`);
  rejects(() => createAnimals(def => { def(animal); def(animal); }, 'fixture'), `fixture.animals.${animal.key}`);
  const mix = { ...catalog.mixes[0], species: [plant.key], layer: plant.layer };
  rejects(() => createPlants((def, addMix) => { def(plant); addMix(mix); addMix(mix); }, 'fixture'), `fixture.mixes.${mix.key}`);
});

check('Mixes require local species and matching layers, while repeated keys remain weights', () => {
  const mix = { ...catalog.mixes[0], species: [plant.key, plant.key], layer: plant.layer };
  assertSeedMix(mix, catalog.plant, 'mix');
  rejects(() => assertSeedMix({ ...mix, species: ['missing'] }, catalog.plant, 'mix'), 'mix.species[0]');
  rejects(() => assertSeedMix({ ...mix, layer: (plant.layer + 1) % 3 }, catalog.plant, 'mix'), 'mix.species');
  rejects(() => assertSeedMix({ ...mix, density: 1.1 }, catalog.plant, 'mix'), 'mix.density');
});

check('Animal metadata and food webs cannot silently refer to missing species', () => {
  rejects(() => assertAnimalMetadata({ groups: [], shy: { missing: 0.2 } }, catalog.animal, 'meta'), 'meta.shy.missing[0]');
  const replacement = { ...animal, prey: ['missing'] };
  rejects(() => assertCatalog({ ...catalog, animals: [replacement, ...catalog.animals.slice(1)], animal: { ...catalog.animal, [animal.key]: replacement } }), `pnw.animals.${animal.key}.prey[0]`);
});

check('Tools and chapters require valid callbacks, prices and local references', () => {
  const tool = catalog.tools.raise;
  rejects(() => assertToolDefinition({ ...tool, cost: Infinity }, catalog, 'tool'), 'tool.cost');
  rejects(() => assertToolDefinition({ ...tool, apply: true }, catalog, 'tool'), 'tool.apply');
  rejects(() => assertToolDefinition({ ...tool, animal: 'missing' }, catalog, 'tool'), 'tool.animal[0]');
  const chapter = { ...catalog.chapters[0], unlock: ['missing'] };
  rejects(() => assertChapters({ ...catalog, chapters: [chapter] }), `pnw.chapters.${chapter.key}.unlock[0]`);
});

check('Monthly climate tables have twelve entries and probabilities stay bounded', () => {
  const map = catalog.definition;
  rejects(() => assertMapDefinition({ ...map, climate: { ...map.climate, rain: [0.5] } }), 'pnw.climate.rain');
  rejects(() => assertMapDefinition({ ...map, climate: { ...map.climate, rain: new Array(12).fill(2) } }), 'pnw.climate.rain[0]');
});

check('Computed tool prices are checked before edits and invalid outcomes cannot be booked', () => {
  const original = catalog.tools.raise, i = 0, actions = new ToolActions(g);
  const balance = g.money, spent = g.stats.spent;
  let edits = 0;
  try {
    catalog.tools.raise = { ...original, costFor: () => NaN, apply: () => { edits++; return true; } };
    rejects(() => actions.apply('raise', [i]), 'pnw.tools.raise.costFor');
    assert.equal(edits, 0); assert.equal(g.money, balance);
    catalog.tools.raise = { ...original, apply: () => 'changed' };
    rejects(() => actions.apply('raise', [i]), 'pnw.tools.raise.apply');
    assert.equal(g.money, balance); assert.equal(g.stats.spent, spent);
    assert.equal(g.stats.used.raise, undefined);
  } finally { catalog.tools.raise = original; }
});

check('Farm contracts accept debt and regional flags but reject invalid shared counters', () => {
  const state = createFarmState(); state.money = -10; state.flags.regional = { nested: true };
  assertFarmState(state);
  rejects(() => assertFarmState({ ...state, day: -1 }), 'farm.day');
  rejects(() => assertFarmState({ ...state, stats: { ...state.stats, spent: '10' } }), 'farm.stats.spent');
});

for (const map of BIOME_LIST) check(`${map.id}: defaults, world types, binary/legacy saves and older optional fields`, () => {
  for (const difficulty of ['relaxed', 'standard', 'challenging']) {
    g.newGame(1987, 'free', difficulty, map.id);
    assertCatalog(g.catalog); assertFarmState(g); assertWorld(g.world, g.catalog);
  }
  const data = g.saveData(); assertSaveEnvelope(data);
  assert.equal(data.v, 2); assert.ok(g.restoreSave(data));
  const legacy = structuredClone(data); legacy.v = 1;
  for (const [key, value] of Object.entries(legacy.world.arrays)) {
    if (value instanceof Uint8Array) legacy.world.arrays[key] = Buffer.from(value).toString('base64');
    else value.b = Buffer.from(value.b).toString('base64');
  }
  for (const key of ['difficulty', 'campaign', 'mode', 'ledger', 'weather']) delete legacy[key];
  legacy.stats = { planted: 3 };
  assert.ok(g.restoreSave(legacy));
  assert.equal(g.stats.planted, 3); assert.equal(g.stats.dug, 0); assert.equal(g.difficulty, 'standard');
  assertFarmState(g); assertWorld(g.world, g.catalog);
});

for (const map of BIOME_LIST) check(`${map.id}: every real tool produces a declared outcome and finite price`, () => {
  g.newGame(1987, 'free', 'challenging', map.id); g.money = 1e8;
  const actions = new ToolActions(g, { refreshEnvironment: false }), w = g.world;
  // Exercise both ordinary positions and a representative of every starting terrain.
  const tiles = [w.idx(20, 20), w.idx(50, 40), w.idx(80, 60),
    ...[...new Set(w.terrain)].map(terrain => w.terrain.indexOf(terrain))];
  for (const tool of Object.values(g.catalog.tools)) {
    const stroke = actions.apply(tool.key, tiles, { random: () => 0.1 });
    assert.ok(stroke); assert.ok(Number.isFinite(stroke.cost));
  }
  assertFarmState(g); assertWorld(w, g.catalog);
});

check('Malformed saves are rejected without changing the current farm or selected map', () => {
  g.newGame(1987, 'free', 'standard', 'reef');
  const donor = new Game(); donor.newGame(1987, 'free', 'standard', 'pnw');
  // Select the live farm again; rejecting the other map must not change UI defaults.
  g.newGame(1987, 'free', 'standard', 'reef');
  const before = { world: g.world, catalog: g.catalog, money: g.money, day: g.day, biome };
  for (const change of [
    d => { d.weather = 'storm'; },
    d => { d.stats.spent = NaN; },
    d => { d.campaign.chapter = -1; },
    d => { d.world.structures.push({ type: 'missing', x: 1, y: 1, w: 1, h: 1 }); },
    d => { d.world.arrays.ground[0] = donor.catalog.plants.find(p => p?.layer === 2).id; },
    d => { new Float32Array(d.world.arrays.moist.buffer)[0] = NaN; },
    d => { d.wildlife.agents[0].sp = 0.5; },
  ]) {
    const data = donor.saveData(); change(data);
    assert.equal(g.restoreSave(data), false);
    assert.equal(g.world, before.world); assert.equal(g.catalog, before.catalog);
    assert.equal(g.money, before.money); assert.equal(g.day, before.day); assert.equal(biome, before.biome);
  }
});

check('Optional array counts and empty old landscape fields retain save compatibility', () => {
  g.newGame(); const data = g.saveData(); data.v = 1;
  data.world.arrays.trod = { n: 10, b: new Uint8Array(new Float32Array(10).buffer) };
  delete data.world.arrays.rx; delete data.world.arrays.marks;
  assert.ok(g.restoreSave(data)); assert.equal(g.world.trod.length, 10);
  assertWorld(g.world, g.catalog);
});

console.log(`${checks} data contract checks passed.`);
