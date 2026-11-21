// Each map supplies a species builder. createPlants builds independent tables for its catalog.
// The uppercase exports are selected-map adapters for older tools and standalone previews.
// Months: 0=Mar 1=Apr 2=May 3=Jun 4=Jul 5=Aug 6=Sep 7=Oct 8=Nov 9=Dec 10=Jan 11=Feb
// moist / light are preferred ranges on a 0..1 scale. soil = minimum soil health.
// grow = maturity gained per day in ideal conditions. spread = daily seeding chance once mature.
// seedSpacing = same-species exclusion radius for natural recruits only (including juveniles).
// floating = foliage on still pond water; other aquatic plants occupy shallow shores/marshes.

import { assertPlantSpec, assertSeedMix, ContractError } from './contracts.js';
import { hash2 } from '../rng.js';

export const L = { GROUND: 0, SHRUB: 1, TREE: 2 };
export const LAYER_NAMES = ['Groundcover', 'Shrub', 'Tree'];

export const PLANTS = [null];
export const PLANT = {};

function definePlant(plants, plant, p) {
  const path = `${p.mapId || 'map'}.plants.${p.key || '?'}`;
  assertPlantSpec(p, path);
  if (Object.hasOwn(plant, p.key)) throw new ContractError(path, 'a unique species key');
  const o = Object.assign({
    native: true, invasive: false, nfix: false, aquatic: false, wetOK: false, nurse: false,
    conifer: false, compete: 0.15, soil: 0, spread: 0.02, radius: 2, life: 10, cost: 5,
    graze: 0, browse: 0, mast: 0, beaverFood: false,
  }, p);
  // Real restoration is slow: meadows take a season or two, shrubs a few years, forests decades.
  o.grow *= [0.45, 0.6, 0.65][o.layer];
  o.id = plants.length;
  plants.push(o);
  plant[o.key] = o;
  return o;
}

export const MIXES = [];
export const MIX = {};

// Build one map without changing the selected-map adapters.
/** @param {import('./contracts.js').PlantBuilder} build
 * @param {string} [mapId]
 * @returns {import('./contracts.js').PlantCatalog} */
export function createPlants(build, mapId) {
  const plants = [null], plant = {}, mixes = [], mix = {};
  build(p => definePlant(plants, plant, { ...p, mapId }), m => {
    if (Object.hasOwn(mix, m.key)) throw new ContractError(`${mapId || 'map'}.mixes.${m.key}`, 'a unique mix key');
    mixes.push(m); mix[m.key] = m;
  }, key => plant[key]);
  for (const m of mixes) assertSeedMix(m, plant, `${mapId || 'map'}.mixes.${m.key}`);
  return { plants, plant, mixes, mix };
}

export function selectPlants(catalog) {
  PLANTS.splice(0, PLANTS.length, ...catalog.plants);
  MIXES.splice(0, MIXES.length, ...catalog.mixes);
  for (const key in PLANT) delete PLANT[key];
  for (const key in MIX) delete MIX[key];
  Object.assign(PLANT, catalog.plant); Object.assign(MIX, catalog.mix);
}

export function loadPlants(build) {
  selectPlants(createPlants(build));
}

// Appearance phase for a plant in a given month. Used by the renderer and for food.
export function plantPhase(p, m) {
  const lk = p.look;
  if (lk.bloom && lk.bloom.includes(m)) return 'bloom';
  if (lk.evergreen) return 'green'; // (irrigated cane: the same green all year)
  if (lk.fruit && lk.fruit.includes(m)) return 'fruit';
  // tropical dry forest: bare through the dry season (December to April), a flush of new leaves
  // with the first rains in May; grasses and herbs cure brown from December to April
  if (lk.dryForest) {
    const dryM = m >= 9 || m <= 1;
    if (p.layer === 0) return dryM ? 'late' : 'green';
    if (lk.deciduous) return dryM ? 'winter' : m === 8 ? 'fall' : m === 2 ? 'spring' : 'green';
    return 'green';
  }
  // tropical plants stay green; only grasses and herbs dry out in the June–September dry season
  if (lk.tropical) return p.layer === 0 && m >= 3 && m <= 6 ? 'late' : 'green';
  // savanna: grasses and herbs cure gold through the long dry season (June–October); trees stay green
  if (lk.savanna) return p.layer === 0 && m >= 3 && m <= 7 ? 'late' : 'green';
  if (lk.deciduous || p.layer === 0) {
    if (m === 7 || m === 8) return 'fall';
    if (m >= 9 || m === 11) return 'winter';
    if (m === 0) return 'spring';
    if (m >= 4 && m <= 6) return 'late';
  }
  return 'green';
}

// The same phase on a given day for one plant at (x, y), drawing only: winter to spring and summer to
// bare spread over weeks instead of flipping every plant on the first of the month. Each plant leafs
// out on its own day: bushes first, then grasses, then trees, a species' leafOut later still (oaks
// and ash are among the last), a few days' spread between individuals, and later on cool high
// ground (cool: 0 lowest ground .. 1 highest). Autumn colour and leaf drop spread the same way,
// cool ground first. Flowers, fruit and every other regime keep plantPhase's months.
// Food and shade still go by the month (plantPhase, plantLeafCover).
export const DAY_PHASED = p => {
  const lk = p.look;
  if (lk.evergreen || p.conifer) return false;
  if (lk.dryForest) return !!lk.deciduous && p.layer !== 0;
  return !lk.tropical && !lk.savanna && (!!lk.deciduous || p.layer === 0);
};
const YEAR = 120, MONTH = 10;
export function leafDays(p, x, y, cool = 0) {
  const dry = !!p.look.dryForest;
  const spring = (dry ? 2 * MONTH : 0) + (p.layer === 1 ? -2 : p.layer === 0 ? 0 : 3) + (p.leafOut ?? 0)
    + hash2(x, y, 401) * 5 + cool * 3;
  const late = 4 * MONTH + (hash2(x, y, 404) - 0.5) * 4;
  const color = (dry ? 8 : 7) * MONTH + (hash2(x, y, 402) - 0.5) * 8 - cool * 2;
  const drop = 9 * MONTH + (hash2(x, y, 403) - 0.5) * 10 - cool * 2;
  return { spring, late, color, drop };
}
export function plantPhaseOn(p, day, x, y, cool = 0) {
  const doy = ((day % YEAR) + YEAR) % YEAR, m = Math.floor(doy / MONTH);
  if (!DAY_PHASED(p)) return plantPhase(p, m);
  const lk = p.look, mb = Math.floor(((doy - hash2(x, y, 405) * 6 + 3 + YEAR) % YEAR) / MONTH); // (each plant flowers and fruits a few days either side of the month)
  if (lk.bloom && lk.bloom.includes(mb)) return 'bloom';
  if (lk.fruit && lk.fruit.includes(mb)) return 'fruit';
  const L = leafDays(p, x, y, cool), d = doy >= 10 * MONTH ? doy - YEAR : doy; // (late winter counts toward spring)
  if (d < L.spring) return 'winter';
  if (d < L.spring + MONTH) return 'spring';
  if (!lk.dryForest && d >= L.late && d < L.color) return 'late';
  if (d < L.color) return 'green';
  return d < L.drop ? 'fall' : 'winter';
}

export const isBlooming = (p, m) => !!(p.look.bloom && p.look.bloom.includes(m));
export const isFruiting = (p, m) => !!(p.look.fruit && p.look.fruit.includes(m));

// Leaf shade independently of flowers and fruit (bare branches can still carry either).
// Residual winter shade represents woody branches; monthly leaf-out/drop is approximate.
export function plantLeafCover(p, m) {
  const lk = p.look;
  if (!lk.deciduous || lk.evergreen || p.conifer) return 1;
  if (lk.dryForest) return m >= 9 || m <= 1 ? 0.15 : m === 2 ? 0.65 : m === 8 ? 0.55 : 1;
  if (lk.tropical || lk.savanna) return 1;
  return m >= 9 ? 0.15 : m === 0 ? 0.65 : m === 7 ? 0.7 : m === 8 ? 0.35 : 1;
}
