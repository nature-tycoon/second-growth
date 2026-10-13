// Map definitions and stable catalogs: plants, wildlife, goals, names and tool rules.
// setBiome selects the UI/legacy defaults. Live games and worlds retain their catalog.

import { createPlants, selectPlants } from './data/plants.js';
import { createAnimals, selectAnimals } from './data/animals.js';
import { selectCatalog } from './data/catalog.js';
import { assertMapDefinition, assertCatalog } from './data/contracts.js';
import { loadGoals } from './sim/goals.js';
import { STRUCTURES } from './world.js';
import { H, T, HABITAT_INFO, TERRAIN_NAMES } from './config.js';
import PNW from './maps/pnw.js';
import AMAZON from './maps/amazon.js';
import SERENGETI from './maps/serengeti.js';
import ATLANTA from './maps/atlanta.js';
import CHINANDEGA from './maps/chinandega.js';
import REEF from './maps/reef.js';
import SUMATRA from './maps/sumatra.js';

export const BIOMES = { pnw: PNW, amazon: AMAZON, serengeti: SERENGETI, atlanta: ATLANTA, chinandega: CHINANDEGA, reef: REEF, sumatra: SUMATRA };
export const BIOME_LIST = [PNW, AMAZON, SERENGETI, ATLANTA, CHINANDEGA, REEF, SUMATRA];

export let biome = null;
const hooks = [];
// Run fn now for the current map and again whenever the map changes.
export function onBiome(fn) { hooks.push(fn); if (biome) fn(biome); }

const baseNames = Object.fromEntries(Object.entries(STRUCTURES).map(([k, s]) => [k, s.name]));
const baseHabitats = HABITAT_INFO.map(h => h.name);
const baseTerrains = [...TERRAIN_NAMES];

const catalogs = new Map();
/** @returns {import('./data/catalog.js').MapCatalog} */
export function mapCatalog(id) {
  const definition = BIOMES[id] || PNW;
  if (!catalogs.has(definition.id)) {
    assertMapDefinition(definition);
    const catalog = {
      definition,
      ...createPlants(definition.plants, definition.id),
      ...createAnimals(definition.animals, definition.id),
      goals: definition.goals,
      structures: Object.fromEntries(Object.entries(STRUCTURES).map(([key, value]) => [key, { ...value, name: definition.structureNames?.[key] || baseNames[key] }])),
      habitatInfo: HABITAT_INFO.map((value, index) => ({ ...value, name: definition.habitatNames?.[Object.keys(H).find(key => H[key] === index)] || baseHabitats[index] })),
      terrainNames: baseTerrains.map((name, index) => definition.terrainNames?.[Object.keys(T).find(key => T[key] === index)] || name),
    };
    assertCatalog(catalog);
    catalogs.set(definition.id, catalog);
  }
  return catalogs.get(definition.id);
}

export function setBiome(id) {
  const next = BIOMES[id] || PNW;
  if (biome === next) return biome;
  biome = next;
  const catalog = mapCatalog(next.id);
  selectCatalog(catalog);
  selectPlants(catalog);
  selectAnimals(catalog);
  loadGoals(next.goals);
  // the same kinds of old buildings go by local names (a barn in Washington, a cattle shed in Pará)
  for (const [k, s] of Object.entries(STRUCTURES)) s.name = next.structureNames?.[k] || baseNames[k];
  HABITAT_INFO.forEach((h, k) => { h.name = baseHabitats[k]; });
  for (const [key, name] of Object.entries(next.habitatNames || {})) HABITAT_INFO[H[key]].name = name;
  TERRAIN_NAMES.splice(0, TERRAIN_NAMES.length, ...baseTerrains);
  for (const [key, name] of Object.entries(next.terrainNames || {})) TERRAIN_NAMES[T[key]] = name;
  for (const fn of hooks) fn(next);
  return next;
}

setBiome('pnw');
