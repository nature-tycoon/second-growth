// The active map ("biome"): its plants, wildlife, goals, climate, layout and look.
// Maps live in js/maps/. setBiome() swaps every shared registry in place, then tells the
// modules that build things from those registries (tools, UI) to rebuild.

import { loadPlants } from './data/plants.js';
import { loadAnimals } from './data/animals.js';
import { loadGoals } from './sim/goals.js';
import { STRUCTURES } from './world.js';
import { H, T, HABITAT_INFO, TERRAIN_NAMES } from './config.js';
import PNW from './maps/pnw.js';
import AMAZON from './maps/amazon.js';
import SERENGETI from './maps/serengeti.js';
import ATLANTA from './maps/atlanta.js';
import CHINANDEGA from './maps/chinandega.js';
import REEF from './maps/reef.js';

export const BIOMES = { pnw: PNW, amazon: AMAZON, serengeti: SERENGETI, atlanta: ATLANTA, chinandega: CHINANDEGA, reef: REEF };
export const BIOME_LIST = [PNW, AMAZON, SERENGETI, ATLANTA, CHINANDEGA, REEF];

export let biome = null;
const hooks = [];
// Run fn now for the current map and again whenever the map changes.
export function onBiome(fn) { hooks.push(fn); if (biome) fn(biome); }

const baseNames = Object.fromEntries(Object.entries(STRUCTURES).map(([k, s]) => [k, s.name]));
const baseHabitats = HABITAT_INFO.map(h => h.name);
const baseTerrains = [...TERRAIN_NAMES];

export function setBiome(id) {
  const next = BIOMES[id] || PNW;
  if (biome === next) return biome;
  biome = next;
  loadPlants(next.plants);
  loadAnimals(next.animals);
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
