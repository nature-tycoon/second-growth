// Plant registry: the active map's species. Each map supplies a builder (plants-pnw.js,
// plants-amazon.js) and loadPlants() refills these tables in place, so every module that
// imported them sees the new map's plants.
// Months: 0=Mar 1=Apr 2=May 3=Jun 4=Jul 5=Aug 6=Sep 7=Oct 8=Nov 9=Dec 10=Jan 11=Feb
// moist / light are preferred ranges on a 0..1 scale. soil = minimum soil health.
// grow = maturity gained per day in ideal conditions. spread = daily seeding chance once mature.

export const L = { GROUND: 0, SHRUB: 1, TREE: 2 };
export const LAYER_NAMES = ['Groundcover', 'Shrub', 'Tree'];

export const PLANTS = [null];
export const PLANT = {};

function def(p) {
  const o = Object.assign({
    native: true, invasive: false, nfix: false, aquatic: false, wetOK: false, nurse: false,
    conifer: false, compete: 0.15, soil: 0, spread: 0.02, radius: 2, life: 10, cost: 5,
    graze: 0, browse: 0, mast: 0, beaverFood: false,
  }, p);
  // Real restoration is slow: meadows take a season or two, shrubs a few years, forests decades.
  o.grow *= [0.45, 0.6, 0.65][o.layer];
  o.id = PLANTS.length;
  PLANTS.push(o);
  PLANT[o.key] = o;
  return o;
}

export const MIXES = [];
export const MIX = {};

// Replace the registry with another map's plants and seed mixes.
export function loadPlants(build) {
  PLANTS.length = 1;
  for (const k in PLANT) delete PLANT[k];
  MIXES.length = 0;
  for (const k in MIX) delete MIX[k];
  build(def, m => { MIXES.push(m); MIX[m.key] = m; }, key => PLANT[key]);
}

// Appearance phase for a plant in a given month. Used by the renderer and for food.
export function plantPhase(p, m) {
  const lk = p.look;
  if (lk.bloom && lk.bloom.includes(m)) return 'bloom';
  if (lk.fruit && lk.fruit.includes(m)) return 'fruit';
  // tropical plants stay green; only grasses and herbs dry out in the June–September dry season
  if (lk.tropical) return p.layer === 0 && m >= 3 && m <= 6 ? 'late' : 'green';
  if (lk.deciduous || p.layer === 0) {
    if (m === 7 || m === 8) return 'fall';
    if (m >= 9 || m === 11) return 'winter';
    if (m === 0) return 'spring';
    if (m >= 4 && m <= 6) return 'late';
  }
  return 'green';
}

export const isBlooming = (p, m) => !!(p.look.bloom && p.look.bloom.includes(m));
export const isFruiting = (p, m) => !!(p.look.fruit && p.look.fruit.includes(m));
