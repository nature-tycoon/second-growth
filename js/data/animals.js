// Each map supplies a species builder. createAnimals compiles a catalog's wildlife and diets.
// The uppercase exports are selected-map adapters for older tools and standalone previews.
// Each species says where it can live (suit: per-tile 0..1) and what it needs across the whole
// property (req: multiplier on carrying capacity). K = sum(suit) / hr (home range), capped at max.

import { behaviorFor } from './animal-behavior.js';
import { assertAnimalSpec, assertAnimalMetadata, ContractError } from './contracts.js';
import { H, DAYS_PER_YEAR } from '../config.js';

export const habW = obj => {
  const a = new Float32Array(13);
  for (const k in obj) a[H[k]] = obj[k];
  return a;
};
export const near = (d, n, far = 0.15) => d <= n ? 1 : far;

export const ANIMALS = [];
export const ANIMAL = {};
export const animalDef = (a, catalog) => a.passageDef || (catalog?.animals || ANIMALS)[a.sp];

// Additional diets are active only in Challenging; existing food webs retain
// their diets in every difficulty. The registry compiles fish keys once per map.
export const preyFor = (def, game) => def.prey || (game.diff.ecology ? def.challengePrey : null);
export const preyPer = (def, game) => def.prey ? def.preyPer : game.diff.ecology ? def.challengePreyPer || def.preyPer : def.preyPer;

function defineAnimal(animals, animal, a) {
  const path = `${a.mapId || 'map'}.animals.${a.key || '?'}`;
  assertAnimalSpec(a, path);
  if (Object.hasOwn(animal, a.key)) throw new ContractError(path, 'a unique species key');
  const o = Object.assign({
    minK: 1, groupSize: [1, 1], mig: 0.3, intro: null, breed: [1, 2], litter: [1, 2],
    life: 5, mature: 1, season: null, prey: null, preyPer: 5, speed: 1, max: 10,
    req: () => 1, hint: '',
  }, a);
  // fixedMax preserves the configured ceiling; strictMax additionally prevents recruitment
  // and whole litters from overshooting it (including animals still walking out).
  // the maps are larger than the original design, so there's room for more of most species
  if (!o.fixedMax) o.max = Math.round(o.max * 1.4);
  o.index = animals.length;
  animals.push(o);
  animal[o.key] = o;
  return o;
}

export const ANIMAL_GROUPS = [];

// Build one map without changing the selected-map adapters.
/** @param {import('./contracts.js').AnimalBuilder} build
 * @param {string} [mapId]
 * @returns {import('./contracts.js').AnimalCatalog} */
export function createAnimals(build, mapId) {
  const animals = [], animal = {};
  const meta = build(a => defineAnimal(animals, animal, { ...a, mapId }));
  assertAnimalMetadata(meta, animal, `${mapId || 'map'}.animalMetadata`);
  for (const a of animals) {
    a.nouns = meta.names?.[a.key];
    a.behavior = behaviorFor(a);
    a.shy = meta.shy?.[a.key] ?? 0.2;
    a.frugivore = !!meta.frugivores?.includes(a.key);
    a.fenced = !!meta.fenced?.includes(a.key);
    a.damBuilder = !!meta.damBuilders?.includes(a.key);
    a.browseRate = meta.browsers?.[a.key] || 0;
    const diet = meta.fishHunters?.[a.key];
    a.challengePrey = diet ? animals.filter(p => !p.notPrey && (p.sprite.kind === 'fish' && p.move === 'swim' || diet === 'fish-frogs' && p.sprite.kind === 'frog')).map(p => p.key) : null;
    a.challengePreyPer = a.sprite.kind === 'otter' ? 4 : 2;
  }
  return { animals, animal, animalGroups: [...meta.groups] };
}

export function selectAnimals(catalog) {
  ANIMALS.splice(0, ANIMALS.length, ...catalog.animals);
  ANIMAL_GROUPS.splice(0, ANIMAL_GROUPS.length, ...catalog.animalGroups);
  for (const key in ANIMAL) delete ANIMAL[key];
  Object.assign(ANIMAL, catalog.animal);
}

export function loadAnimals(build) {
  selectAnimals(createAnimals(build));
}

// A species can look different in some of its adults (Sumatra's flanged male orangutans, tusker
// bull elephants): sprite.male holds the overrides and sprite.maleShare how many adults wear them.
// Which ones is fixed per animal. Returns the def to draw it with.
const variants = new WeakMap();
// Each animal's sex, fixed by its id: the species' share of males where adults look different
// (antlers, manes: see isMaleVariant), otherwise half and half.
export const isMale = (def, a) => ((a.id * 7919) % 100) / 100 < (def.sprite.male ? def.sprite.maleShare ?? 0.5 : 0.5);
export const isMaleVariant = (def, a) => !!def.sprite.male && !a.juvenile && (a.age == null || a.age >= def.mature * DAYS_PER_YEAR) && isMale(def, a);
export function drawDef(def, a, month = null) {
  let look = def;
  if (isMaleVariant(def, a)) {
    look = variants.get(def);
    if (!look) { look = { ...def, key: def.key + ':male', sprite: { ...def.sprite, ...def.sprite.male } }; variants.set(def, look); }
  }
  // Without a calendar (field-guide/model previews), show breeding plumage.
  // Winter only changes drawing; the animal's sex, identity and ecology stay fixed.
  if (month != null && def.sprite.winter && !def.sprite.breedingPlumage.includes(month)) {
    let winter = winterVariants.get(look);
    if (!winter) { winter = { ...look, key: look.key + ':winter', sprite: { ...look.sprite, ...def.sprite.winter } }; winterVariants.set(look, winter); }
    return winter;
  }
  return look;
}
const winterVariants = new WeakMap();

export const one = def => def.nouns?.[0] ?? def.name;
export const many = def => def.nouns?.[1] ?? def.name + 's';
export const aOne = def => (/^[aeiou]/i.test(one(def)) ? 'an ' : 'a ') + one(def);
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
