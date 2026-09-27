// Wildlife registry: the active map's species. Each map supplies a builder (animals-pnw.js,
// animals-amazon.js); loadAnimals() refills these tables in place so every importer sees them.
// Each species says where it can live (suit: per-tile 0..1) and what it needs across the whole
// property (req: multiplier on carrying capacity). K = sum(suit) / hr (home range), capped at max.

import { H } from '../config.js';

export const habW = obj => {
  const a = new Float32Array(13);
  for (const k in obj) a[H[k]] = obj[k];
  return a;
};
export const near = (d, n, far = 0.15) => d <= n ? 1 : far;

export const ANIMALS = [];
export const ANIMAL = {};

function def(a) {
  const o = Object.assign({
    minK: 1, groupSize: [1, 1], mig: 0.3, intro: null, breed: [1, 2], litter: [1, 2],
    life: 5, mature: 1, season: null, prey: null, preyPer: 5, speed: 1, max: 10,
    req: () => 1, hint: '',
  }, a);
  // the maps are larger than the original design, so there's room for more of most species
  if (!o.fixedMax) o.max = Math.round(o.max * 1.4);
  o.index = ANIMALS.length;
  ANIMALS.push(o);
  ANIMAL[o.key] = o;
  return o;
}

export const ANIMAL_GROUPS = [];
let NAMES = {}, SHY = {};

// Replace the registry with another map's wildlife.
export function loadAnimals(build) {
  ANIMALS.length = 0;
  for (const k in ANIMAL) delete ANIMAL[k];
  const meta = build(def);
  ANIMAL_GROUPS.length = 0; ANIMAL_GROUPS.push(...meta.groups);
  NAMES = meta.names || {}; SHY = meta.shy || {};
  for (const a of ANIMALS) {
    a.shy = SHY[a.key] ?? 0.2;
    a.frugivore = !!meta.frugivores?.includes(a.key);
    a.fenced = !!meta.fenced?.includes(a.key);
    a.damBuilder = !!meta.damBuilders?.includes(a.key);
    a.browseRate = meta.browsers?.[a.key] || 0;
  }
}

export const one = def => NAMES[def.key]?.[0] ?? def.name;
export const many = def => NAMES[def.key]?.[1] ?? def.name + 's';
export const aOne = def => (/^[aeiou]/i.test(one(def)) ? 'an ' : 'a ') + one(def);
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

