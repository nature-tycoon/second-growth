// Data boundaries shared by builders, restore code and the Node release checks.
// Keep these independent of Game, map modules and rendering so they create no import cycle.
import { T, F, BORDER, MONTHS_PER_YEAR, SPEEDS } from '../config.js';
import { WORLD_ARRAY_TYPES, EXTRA_ARRAYS, extraArrayLimit } from './world-schema.js';

/** @typedef {0|1|2} PlantLayer Groundcover, shrub, tree; separate from species IDs. */
/** @typedef {'ground'|'semi'|'tree'|'fly'|'swim'} AnimalMove */
/** @typedef {'free'|'campaign'} GameMode */
/** @typedef {'relaxed'|'standard'|'challenging'} Difficulty */
/** @typedef {'clear'|'cloud'|'rain'|'snow'} Weather */
/** @typedef {function(): number} RandomSource Values in [0, 1), supplied by the caller. */
/** @typedef {[number,number]} NumericRange Ordered inclusive bounds. */
/** @typedef {true|null|'blocked'|'unsuitable'} ToolResult Only true records a paid edit. */

/**
 * @typedef {Object} PlantLook
 * @property {string} type Geometry/growth habit, independent of species key.
 * @property {string} leaf CSS colour.
 * @property {number[]} [bloom] March-based month indices, 0..11.
 * @property {number[]} [fruit]
 * @property {boolean} [deciduous]
 * @property {boolean} [evergreen]
 * @property {boolean} [tropical]
 * @property {boolean} [savanna]
 * @property {boolean} [dryForest]
 * @property {number} [scale]
 * @property {string} [flower]
 * @property {string} [berry]
 * @property {string} [fall]
 * @property {string} [dry]
 * @property {string} [bark]
 * @property {string} [head]
 * @property {string} [stem]
 * @property {string} [seed]
 * @property {boolean} [plume]
 * @property {number} [bloomTint]
 * @property {number} [fruitSize]
 * @property {boolean} [airy]
 * @property {boolean} [small]
 * @property {boolean} [crownBloom]
 * @property {boolean} [hangFruit]
 * @property {boolean} [climbs]
 */

/**
 * Builder input. Defaults and numeric IDs are assigned by createPlants, not by map authors.
 * Optional ecological traits are validated by PLANT_FIELDS below.
 * @typedef {Object} PlantSpec
 * @property {string} key Stable key used by seeds, tools and save remapping.
 * @property {string} name
 * @property {string} sci
 * @property {string} desc
 * @property {PlantLayer} layer
 * @property {NumericRange} moist
 * @property {NumericRange} light
 * @property {number} grow Unscaled daily growth; the builder applies layer speed once.
 * @property {PlantLook} look
 * @property {number} [cost]
 * @property {number} [spread]
 * @property {number} [radius]
 * @property {number} [life]
 * @property {number} [soil]
 * @property {number} [compete]
 * @property {boolean} [native]
 * @property {boolean} [invasive]
 * @property {boolean} [aquatic]
 * @property {boolean} [wetOK]
 * @property {boolean} [nfix]
 * @property {boolean} [nurse]
 * @property {boolean} [conifer]
 * @property {boolean} [beaverFood]
 * @property {number} [graze]
 * @property {number} [browse]
 * @property {number} [mast]
 * @property {string} [was] Previous species key for compatible older saves.
 * @property {string} [mapId]
 * @property {boolean} [resprout]
 * @property {boolean} [gravelOK]
 * @property {boolean} [birdSpread]
 * @property {boolean} [floating]
 * @property {boolean} [swampTree]
 * @property {boolean} [weedy]
 * @property {boolean} [crustOK]
 * @property {boolean} [sod]
 * @property {boolean} [exotic]
 * @property {boolean} [caterpillars]
 * @property {boolean} [dune]
 * @property {boolean} [fencePost]
 * @property {boolean} [mangrove]
 * @property {boolean} [fragile]
 * @property {boolean} [cay]
 * @property {number} [fuel]
 * @property {number} [fireSurvival]
 * @property {number} [matureAge]
 * @property {number} [soilK]
 * @property {number} [pioneer]
 * @property {number} [bleach]
 * @property {number} [seedSpacing]
 * @property {number} [smother]
 * @property {number} [fruitFood]
 * @property {number} [harvest]
 * @property {string} [host]
 * @property {string} [disperser]
 * @property {string} [kindName]
 * @property {string} [tab]
 * @property {{months:number[],amount:number}} [nectar]
 */
/** @typedef {PlantSpec & {id:number, cost:number, spread:number, radius:number, life:number, soil:number, native:boolean, invasive:boolean}} PlantDefinition */
/** @typedef {{key:string, name:string, desc:string, layer:PlantLayer, cost:number, density:number, species:string[], fenceLine?:boolean}} SeedMix */
/** @typedef {function(PlantSpec): PlantDefinition} DefinePlant */
/** @typedef {function(DefinePlant, function(SeedMix):void, function(string):PlantDefinition):void} PlantBuilder */
/** @typedef {{plants:Array<PlantDefinition|null>, plant:Object<string,PlantDefinition>, mixes:SeedMix[], mix:Object<string,SeedMix>}} PlantCatalog */

/**
 * Sprite profiles retain extensible species-specific art options; core dimensions are explicit.
 * @typedef {{kind:string, len?:number, size?:number, male?:Object, winter?:Object, breedingPlumage?:number[], maleShare?:number} & Object<string,unknown>} AnimalSprite
 */
/**
 * @typedef {Object} AnimalSpec
 * @property {string} key Stable species key; index is assigned by the builder.
 * @property {string} name
 * @property {string} sci
 * @property {string} desc
 * @property {string} group
 * @property {AnimalMove} move
 * @property {number} hr Tiles per animal at full habitat suitability; must be positive.
 * @property {Array<'N'|'E'|'S'|'W'>} sources
 * @property {function(import('../world.js').World, number):number} suit Tile suitability, 0..1.
 * @property {AnimalSprite} sprite
 * @property {function(Object):number} [req] Global resource multiplier.
 * @property {string[]|null} [prey]
 * @property {string[]} [carries] prey a raptor or owl can lift as adults and carry to a perch (young of any prey it always can)
 * @property {string[]} [needs]
 * @property {number} [needsPer]
 * @property {number[]|null} [season]
 * @property {number[]} [breed]
 * @property {NumericRange} [litter]
 * @property {NumericRange} [groupSize]
 * @property {number|null} [intro]
 * @property {number} [max]
 * @property {number} [minK]
 * @property {number} [preyPer]
 * @property {number} [mature]
 * @property {number} [life]
 * @property {number} [speed]
 * @property {number} [mig]
 * @property {boolean} [fixedMax]
 * @property {boolean} [strictMax]
 * @property {string} [hint]
 * @property {string} [mapId]
 * @property {boolean} [herd]
 * @property {boolean} [familyHerd]
 * @property {boolean} [notPrey]
 * @property {boolean} [patrol]
 * @property {boolean} [soar] a raptor that circles high over open ground between perches
 * @property {boolean} [ambush]
 * @property {boolean} [noDrink]
 * @property {boolean} [quick]
 * @property {boolean} [domestic]
 * @property {boolean} [reef]
 * @property {boolean} [benthic]
 * @property {number} [familySize]
 * @property {number} [herdR]
 * @property {number} [bachelorSize]
 * @property {number} [bachelorR]
 * @property {number} [bachelorJoin]
 * @property {number} [bachelorSoloAge]
 * @property {number} [herdMax]
 * @property {string} [special]
 * @property {{x?:number}} [crossing]
 * @property {{dash:number, tiles:number}} [surfaceEscape] a surface fish's straight dash away from a charging hunter
 */
/** @typedef {AnimalSpec & {index:number, req:function(Object):number, max:number, minK:number, speed:number, life:number, mature:number, preyPer:number, shy:number, nouns?:[string,string], behavior:Object, frugivore:boolean, fenced:boolean, damBuilder:boolean, browseRate:number, challengePrey:string[]|null, challengePreyPer:number}} AnimalDefinition */
/** @typedef {function(AnimalSpec):AnimalDefinition} DefineAnimal */
/** @typedef {function(DefineAnimal):{groups:string[], names?:Object<string,[string,string]>, shy?:Object<string,number>, frugivores?:string[], fenced?:string[], damBuilders?:string[], browsers?:Object<string,number>, fishHunters?:Object<string,string>}} AnimalBuilder */
/** @typedef {{animals:AnimalDefinition[], animal:Object<string,AnimalDefinition>, animalGroups:string[]}} AnimalCatalog */
/** @typedef {{key:string, name:string, desc:string, reward:number, check:function(import('../game.js').Game):boolean, prog:function(import('../game.js').Game):string}} GoalDefinition */
/**
 * @typedef {Object} ToolDefinition
 * @property {string} key
 * @property {'land'|'plants'|'features'|'remove'|'visitors'|'wildlife'} cat
 * @property {string} name
 * @property {string} desc
 * @property {number} cost Base price; a negative price means salvage income.
 * @property {function(import('../game.js').Game, number, RandomSource):ToolResult} apply
 * @property {Object} icon
 * @property {boolean} brush
 * @property {number} size Brush radius, not footprint size.
 * @property {function(import('../game.js').Game, number):number} [costFor]
 * @property {[number,number]} [footprint]
 * @property {string[]} [species]
 * @property {PlantLayer} [layer]
 * @property {string} [animal]
 * @property {string} [sub]
 * @property {string} [hint]
 * @property {string} [doneText]
 * @property {boolean} [fenceLine]
 * @property {boolean} [mapTool]
 */
/** @typedef {{chapter:number, met?:Object<string,boolean>}} CampaignState */
/** @typedef {{in:Object<string,number>, out:Object<string,number>}} Ledger */
/** @typedef {{planted:number, dug:number, removed:number, spent:number, earned:number, used:Object<string,number>, ledger?:Ledger, grants?:Object<string,number>}} FarmStats */
/**
 * @typedef {Object} FarmState
 * @property {number} seed
 * @property {string} map
 * @property {GameMode} mode
 * @property {Difficulty} difficulty
 * @property {CampaignState} campaign
 * @property {number} day
 * @property {number} acc
 * @property {number} money Finite; ongoing upkeep can make it negative.
 * @property {number} speed Index into SPEEDS, including zero for pause.
 * @property {Object} flags Region-specific flags and event history.
 * @property {FarmStats} stats
 * @property {Ledger} ledger
 * @property {Ledger|null} lastLedger
 * @property {number} lastGrant
 * @property {Object<string,number>} goalsDone Completion day, keyed by goal.
 * @property {Object[]} history
 * @property {Weather} weather
 * @property {number} weatherDays
 * @property {number} rainStreak
 * @property {number} dryStreak
 * @property {number} snow
 * @property {Object} cache Derived state rebuilt on restore; only hunts are persisted.
 * @property {Object|null} selectedAgent
 * @property {Object[]|null} residents
 * @property {number} frugivoreCount
 */

/**
 * @typedef {Object} MapClimate
 * @property {string[]} seasons Four names in season order.
 * @property {number[]} rain Twelve probabilities, 0..1, starting in March.
 * @property {number[]} growth Twelve growth multipliers.
 * @property {number[]} spread Twelve spread multipliers.
 * @property {number[]} moist Twelve moisture offsets, -1..1.
 * @property {number[]} [fireMonths]
 * @property {number[]} [floodMonths]
 * @property {{months:number[],chance:function(number):number}|null} [snow]
 */
/**
 * Shared map interface; regional art, stories and simulation options extend it.
 * @typedef {Object} MapDefinition
 * @property {string} id
 * @property {string} name
 * @property {PlantBuilder} plants
 * @property {AnimalBuilder} animals
 * @property {function(number, import('./catalog.js').MapCatalog):import('../world.js').World} generate
 * @property {function(number,number,number,number,import('../world.js').World):Object} borderCell
 * @property {MapClimate} climate
 * @property {{light:Object[]}} look
 * @property {GoalDefinition[]} goals
 * @property {Array<[string,number,number,number,number]>} startWildlife
 * @property {Object<string,string[]>} [seedRain]
 * @property {function(import('../game.js').Game):void} [onStart]
 * @property {function(import('../game.js').Game):void} [daily]
 */
/** @typedef {{key:string,title:string,reward:number,unlock:string[],goals:Array<{desc:string,check:function(import('../game.js').Game):boolean,prog:function(import('../game.js').Game):string}>}} ChapterDefinition */

/** Errors name the map, entry and field without dumping a farm's full state. */
export class ContractError extends TypeError {
  constructor(path, expected) { super(`${path}: expected ${expected}`); this.name = 'ContractError'; this.path = path; }
}
const fail = (path, expected) => { throw new ContractError(path, expected); };
const object = (v, path) => { if (!v || typeof v !== 'object' || Array.isArray(v) || ArrayBuffer.isView(v)) fail(path, 'an object'); };
const text = (v, path) => { if (typeof v !== 'string' || !v.trim()) fail(path, 'a nonempty string'); };
const number = (v, path, min = -Infinity, max = Infinity) => { if (!Number.isFinite(v) || v < min || v > max) fail(path, `a finite number in [${min}, ${max}]`); };
const integer = (v, path, min = 0, max = Infinity) => { number(v, path, min, max); if (!Number.isInteger(v)) fail(path, 'an integer'); };
const boolean = (v, path) => { if (typeof v !== 'boolean') fail(path, 'a boolean'); };
const fn = (v, path) => { if (typeof v !== 'function') fail(path, 'a function'); };
const list = (v, path, check, length) => {
  if (!Array.isArray(v) || length != null && v.length !== length) fail(path, length == null ? 'an array' : `an array of length ${length}`);
  v.forEach((item, i) => check(item, `${path}[${i}]`));
};
const choice = (v, path, values) => { if (!values.includes(v)) fail(path, values.join(' | ')); };
const months = (v, path) => list(v, path, (n, p) => integer(n, p, 0, MONTHS_PER_YEAR - 1));
const range = (v, path, min = 0, max = Infinity) => {
  list(v, path, (n, p) => number(n, p, min, max), 2);
  if (v[0] > v[1]) fail(path, 'ordered [minimum, maximum]');
};
const keys = words => new Set(words.split(' '));
const fields = (o, path, allowed) => { for (const key of Object.keys(o)) if (!allowed.has(key)) fail(`${path}.${key}`, 'a declared field (possible spelling mistake)'); };
const optional = (o, names, path, check) => { for (const key of names.split(' ')) if (o[key] != null) check(o[key], `${path}.${key}`); };
const references = (values, lookup, path) => list(values, path, (key, p) => { text(key, p); if (!Object.hasOwn(lookup, key)) fail(p, `a species key defined in this map (got ${key})`); });
const layer = (v, path) => choice(v, path, [0, 1, 2]);

const PLANT_BOOLEANS = 'native invasive nfix aquatic wetOK nurse conifer beaverFood resprout gravelOK birdSpread floating swampTree weedy crustOK sod exotic caterpillars dune fencePost mangrove fragile cay';
const PLANT_NUMBERS = 'compete soil spread radius life cost graze browse mast fuel fireSurvival matureAge soilK pioneer bleach seedSpacing smother fruitFood harvest';
const PLANT_FIELDS = keys(`key name sci desc layer moist light grow look mapId id host disperser kindName tab was nectar ${PLANT_BOOLEANS} ${PLANT_NUMBERS}`);
const LOOK_FIELDS = keys('type leaf bloom fruit deciduous evergreen tropical savanna dryForest scale flower berry fall dry bark head stem seed plume bloomTint fruitSize airy small crownBloom hangFruit climbs');

/** @param {PlantSpec} p */
export function assertPlantSpec(p, path = 'plant') {
  object(p, path); fields(p, path, PLANT_FIELDS);
  for (const k of ['key', 'name', 'sci', 'desc']) text(p[k], `${path}.${k}`);
  layer(p.layer, `${path}.layer`); range(p.moist, `${path}.moist`, 0, 1); range(p.light, `${path}.light`, 0, 1);
  number(p.grow, `${path}.grow`, Number.MIN_VALUE);
  optional(p, PLANT_BOOLEANS, path, boolean); optional(p, PLANT_NUMBERS, path, (v, q) => number(v, q, 0));
  optional(p, 'host disperser kindName tab was mapId', path, text);
  object(p.look, `${path}.look`); fields(p.look, `${path}.look`, LOOK_FIELDS);
  text(p.look.type, `${path}.look.type`); text(p.look.leaf, `${path}.look.leaf`);
  optional(p.look, 'bloom fruit', `${path}.look`, months);
  optional(p.look, 'deciduous evergreen tropical savanna dryForest airy small crownBloom hangFruit climbs plume', `${path}.look`, boolean);
  optional(p.look, 'scale fruitSize bloomTint', `${path}.look`, (v, q) => number(v, q, Number.MIN_VALUE));
  optional(p.look, 'flower berry fall dry bark head stem seed', `${path}.look`, text);
  if (p.nectar != null) { object(p.nectar, `${path}.nectar`); fields(p.nectar, `${path}.nectar`, keys('months amount')); months(p.nectar.months, `${path}.nectar.months`); number(p.nectar.amount, `${path}.nectar.amount`, 0); }
}

export function assertSeedMix(m, plant, path = 'mix') {
  object(m, path); fields(m, path, keys('key name desc layer cost density species fenceLine'));
  for (const k of ['key', 'name', 'desc']) text(m[k], `${path}.${k}`);
  layer(m.layer, `${path}.layer`); number(m.cost, `${path}.cost`, 0); number(m.density, `${path}.density`, 0, 1);
  references(m.species, plant, `${path}.species`);
  if (!m.species.length) fail(`${path}.species`, 'at least one species');
  for (const key of m.species) if (plant[key].layer !== m.layer) fail(`${path}.species`, 'species in the mix’s declared layer');
  optional(m, 'fenceLine', path, boolean);
  // Repeated keys are intentional weights (for example, the reef's starter mix).
}

const ANIMAL_BOOLEANS = 'herd familyHerd fixedMax strictMax notPrey patrol soar ambush noDrink quick domestic reef benthic frugivore fenced damBuilder';
const ANIMAL_NUMBERS = 'minK mig intro life mature preyPer speed max hr familySize herdR bachelorSize bachelorR bachelorJoin bachelorSoloAge herdMax needsPer shy browseRate challengePreyPer';
const ANIMAL_FIELDS = keys(`key name sci desc group move sources suit sprite req hint mapId index nouns behavior groupSize breed litter season prey challengePrey carries needs special crossing surfaceEscape ${ANIMAL_BOOLEANS} ${ANIMAL_NUMBERS}`);
export const ANIMAL_MOVES = Object.freeze(['ground', 'semi', 'tree', 'fly', 'swim']);

/** @param {AnimalSpec} a */
export function assertAnimalSpec(a, path = 'animal') {
  object(a, path); fields(a, path, ANIMAL_FIELDS);
  for (const k of ['key', 'name', 'sci', 'desc', 'group']) text(a[k], `${path}.${k}`);
  choice(a.move, `${path}.move`, ANIMAL_MOVES); list(a.sources, `${path}.sources`, (v, q) => choice(v, q, ['N', 'E', 'S', 'W']));
  number(a.hr, `${path}.hr`, Number.MIN_VALUE); fn(a.suit, `${path}.suit`);
  optional(a, 'req', path, fn); optional(a, ANIMAL_BOOLEANS, path, boolean);
  optional(a, ANIMAL_NUMBERS, path, (v, q) => number(v, q, 0));
  optional(a, 'life speed preyPer needsPer', path, (v, q) => number(v, q, Number.MIN_VALUE));
  optional(a, 'breed season', path, months); optional(a, 'groupSize litter', path, range);
  object(a.sprite, `${path}.sprite`); text(a.sprite.kind, `${path}.sprite.kind`);
  if (!(a.sprite.len > 0 || a.sprite.size > 0)) fail(`${path}.sprite`, 'a positive len or size');
  optional(a.sprite, 'len size', `${path}.sprite`, (v, q) => number(v, q, Number.MIN_VALUE));
  optional(a.sprite, 'maleShare', `${path}.sprite`, (v, q) => number(v, q, 0, 1));
  optional(a.sprite, 'breedingPlumage', `${path}.sprite`, months);
  if (a.sprite.winter && !a.sprite.breedingPlumage?.length) fail(`${path}.sprite.breedingPlumage`, 'months for a winter plumage profile');
  if (a.crossing) { object(a.crossing, `${path}.crossing`); optional(a.crossing, 'x', `${path}.crossing`, (v, q) => number(v, q, 0, 1)); }
  if (a.surfaceEscape) { object(a.surfaceEscape, `${path}.surfaceEscape`); number(a.surfaceEscape.dash, `${path}.surfaceEscape.dash`, 1, 4); number(a.surfaceEscape.tiles, `${path}.surfaceEscape.tiles`, 1, 30); }
}

export function assertToolDefinition(t, catalog, path = 'tool') {
  object(t, path); fields(t, path, keys('key name desc cat cost apply icon brush size costFor footprint species layer animal sub hint doneText fenceLine mapTool'));
  for (const k of ['key', 'name', 'desc']) text(t[k], `${path}.${k}`);
  choice(t.cat, `${path}.cat`, ['land', 'plants', 'features', 'remove', 'visitors', 'wildlife']);
  number(t.cost, `${path}.cost`); boolean(t.brush, `${path}.brush`); integer(t.size, `${path}.size`); fn(t.apply, `${path}.apply`);
  object(t.icon, `${path}.icon`); optional(t, 'costFor', path, fn);
  if (t.footprint) list(t.footprint, `${path}.footprint`, (v, q) => integer(v, q, 1), 2);
  if (t.species) references(t.species, catalog.plant, `${path}.species`);
  if (t.layer != null) {
    layer(t.layer, `${path}.layer`);
    for (const key of t.species || []) if (catalog.plant[key].layer !== t.layer) fail(`${path}.layer`, 'the same layer as the tool’s species');
  }
  if (t.animal != null) references([t.animal], catalog.animal, `${path}.animal`);
  if (t.icon.plant != null) references([t.icon.plant], catalog.plant, `${path}.icon.plant`);
  if (t.icon.mix != null) references(t.icon.mix, catalog.plant, `${path}.icon.mix`);
  if (t.icon.animal != null) references([t.icon.animal], catalog.animal, `${path}.icon.animal`);
  if (t.icon.terrain != null) choice(t.icon.terrain, `${path}.icon.terrain`, Object.values(T));
  if (t.icon.feature != null) choice(t.icon.feature, `${path}.icon.feature`, Object.values(F));
}

/** @param {ToolResult} result */
export function assertToolResult(result, path = 'tool.apply') { choice(result, path, [true, null, 'blocked', 'unsuitable']); }
export function assertToolCost(cost, path = 'tool.costFor') { number(cost, path); }

export function assertAnimalMetadata(meta, animal, path = 'animalMetadata') {
  object(meta, path); fields(meta, path, keys('groups names shy frugivores fenced damBuilders browsers fishHunters'));
  list(meta.groups, `${path}.groups`, text);
  for (const key of ['frugivores', 'fenced', 'damBuilders']) if (meta[key]) references(meta[key], animal, `${path}.${key}`);
  for (const key of ['names', 'shy', 'browsers', 'fishHunters']) if (meta[key]) {
    object(meta[key], `${path}.${key}`);
    for (const [species, value] of Object.entries(meta[key])) {
      const q = `${path}.${key}.${species}`;
      references([species], animal, q);
      if (key === 'names') list(value, q, text, 2);
      else if (key === 'fishHunters') choice(value, q, ['fish', 'fish-frogs']);
      else number(value, q, 0, key === 'shy' ? 1 : Infinity);
    }
  }
}

export function assertMapDefinition(map, path = map?.id || 'map') {
  object(map, path); text(map.id, `${path}.id`); text(map.name, `${path}.name`);
  for (const key of ['plants', 'animals', 'generate', 'borderCell']) fn(map[key], `${path}.${key}`);
  object(map.climate, `${path}.climate`);
  list(map.climate.seasons, `${path}.climate.seasons`, text, 4);
  for (const key of ['rain', 'growth', 'spread', 'moist']) list(map.climate[key], `${path}.climate.${key}`, (v, q) => number(v, q, key === 'moist' ? -1 : 0, key === 'rain' || key === 'moist' ? 1 : Infinity), MONTHS_PER_YEAR);
  optional(map.climate, 'fireMonths floodMonths', `${path}.climate`, months);
  if (map.climate.snow) { object(map.climate.snow, `${path}.climate.snow`); months(map.climate.snow.months, `${path}.climate.snow.months`); fn(map.climate.snow.chance, `${path}.climate.snow.chance`); }
  for (const key of ['daily', 'update', 'onStart', 'stats', 'terrainFit', 'deadTree', 'dryLand', 'scoreWater']) optional(map, key, path, fn);
  object(map.look, `${path}.look`); list(map.look.light, `${path}.look.light`, (v, q) => object(v, q), 4);
  list(map.goals, `${path}.goals`, (g, q) => {
    object(g, q); for (const key of ['key', 'name', 'desc']) text(g[key], `${q}.${key}`);
    number(g.reward, `${q}.reward`, 0); fn(g.check, `${q}.check`); fn(g.prog, `${q}.prog`);
  });
}

// Only run at catalog construction/restore boundaries, never in a per-tile or per-frame loop.
export function assertCatalog(catalog) {
  const map = catalog.definition, path = map.id;
  assertMapDefinition(map);
  if (catalog.plants[0] !== null) fail(`${path}.plants[0]`, 'the empty-plant sentinel null');
  if (catalog.plants.length > 256) fail(`${path}.plants`, 'at most 255 species (tile IDs use Uint8Array)');
  const seen = new Set();
  for (let id = 1; id < catalog.plants.length; id++) {
    const p = catalog.plants[id], q = `${path}.plants.${p?.key || id}`; assertPlantSpec(p, q);
    if (p.id !== id || catalog.plant[p.key] !== p || seen.has(p.key)) fail(q, 'a unique key and matching one-based plant ID');
    if (p.mapId !== map.id) fail(`${q}.mapId`, 'the owning map ID');
    seen.add(p.key);
  }
  seen.clear();
  for (const m of catalog.mixes) {
    assertSeedMix(m, catalog.plant, `${path}.mixes.${m.key}`);
    if (catalog.mix[m.key] !== m || seen.has(m.key)) fail(`${path}.mixes.${m.key}`, 'a unique key and matching lookup');
    seen.add(m.key);
  }
  seen.clear();
  for (let index = 0; index < catalog.animals.length; index++) {
    const a = catalog.animals[index], q = `${path}.animals.${a?.key || index}`; assertAnimalSpec(a, q);
    if (a.index !== index || catalog.animal[a.key] !== a || seen.has(a.key)) fail(q, 'a unique key and matching zero-based animal index');
    if (a.mapId !== map.id) fail(`${q}.mapId`, 'the owning map ID');
    if (!catalog.animalGroups.includes(a.group)) fail(`${q}.group`, 'a declared animal group');
    seen.add(a.key);
    for (const key of ['prey', 'challengePrey', 'carries', 'needs']) if (a[key] != null) references(a[key], catalog.animal, `${q}.${key}`);
    for (const k of a.carries || []) if (!a.prey?.includes(k) && !a.challengePrey?.includes(k)) fail(`${q}.carries`, `${k} to be something it hunts`);
  }
  for (const [edge, values] of Object.entries(map.seedRain || {})) { choice(edge, `${path}.seedRain`, ['N', 'E', 'S', 'W']); references(values, catalog.plant, `${path}.seedRain.${edge}`); }
  for (const key of ['windSeeds', 'berrySeeds', 'floodSeeds', 'burnSeeds']) if (map[key]) references(map[key], catalog.plant, `${path}.${key}`);
  list(map.startWildlife, `${path}.startWildlife`, (row, q) => {
    if (!Array.isArray(row) || row.length !== 5) fail(q, '[species, count, x, y, radius]');
    references([row[0]], catalog.animal, `${q}.species`); integer(row[1], `${q}.count`);
    for (let k = 2; k < 5; k++) number(row[k], `${q}[${k}]`, 0);
  });
  const goals = new Set();
  for (const goal of catalog.goals) { if (goals.has(goal.key)) fail(`${path}.goals.${goal.key}`, 'a unique goal key'); goals.add(goal.key); }
}

export function assertCatalogTools(catalog) {
  for (const [key, tool] of Object.entries(catalog.tools)) {
    const path = `${catalog.definition.id}.tools.${key}`;
    if (tool.key !== key) fail(path, 'a key matching the tool lookup');
    assertToolDefinition(tool, catalog, path);
  }
}

export function assertChapters(catalog) {
  const seen = new Set();
  for (const chapter of catalog.chapters) {
    const path = `${catalog.definition.id}.chapters.${chapter.key}`;
    if (seen.has(chapter.key)) fail(path, 'a unique chapter key'); seen.add(chapter.key);
    text(chapter.key, `${path}.key`); text(chapter.title, `${path}.title`); number(chapter.reward, `${path}.reward`, 0);
    references(chapter.unlock, catalog.tools, `${path}.unlock`);
    list(chapter.goals, `${path}.goals`, (g, q) => { text(g.desc, `${q}.desc`); fn(g.check, `${q}.check`); fn(g.prog, `${q}.prog`); });
  }
}

/**
 * Saved arrays use bytes or legacy base64. Extra arrays also carry their element count.
 * Region-specific flags/events remain extensible; their shared envelope stays explicit.
 * @typedef {Uint8Array|string} SavedBytes
 * @typedef {{w:number, h:number, arrays:Object<string,SavedBytes|{n:number,b:SavedBytes}>, structures:Array<{type:string,x:number,y:number,w:number,h:number}|null>}} SavedWorld
 * @typedef {{id:number, sp:number, x:number, y:number, age:number, state:string, key?:string, move?:AnimalMove}} AnimalAgent
 * @typedef {{agents:AnimalAgent[], state:Object[], nextId:number, salmon:Object, dams:number}} SavedWildlife
 * @typedef {Partial<FarmState> & {v:1|2, seed:number, day:number, money:number, rng:number, world:SavedWorld, wildlife:SavedWildlife, flags:Object, stats:FarmStats, goalsDone:Object, plants?:string[], visitors?:Object, events?:Object}} FarmSave
 */
export function assertSaveEnvelope(data, path = 'save') {
  object(data, path); choice(data.v, `${path}.v`, [1, 2]);
  number(data.seed, `${path}.seed`); integer(data.day, `${path}.day`); number(data.money, `${path}.money`); number(data.rng, `${path}.rng`);
  optional(data, 'map', path, text);
  for (const key of ['flags', 'stats', 'goalsDone', 'world', 'wildlife']) object(data[key], `${path}.${key}`);
  integer(data.world.w, `${path}.world.w`, 1); integer(data.world.h, `${path}.world.h`, 1);
  object(data.world.arrays, `${path}.world.arrays`); list(data.world.structures, `${path}.world.structures`, (s, q) => { if (s != null) object(s, q); });
  list(data.wildlife.agents, `${path}.wildlife.agents`, (a, q) => {
    object(a, q); integer(a.id, `${q}.id`, 1); integer(a.sp, `${q}.sp`);
    number(a.x, `${q}.x`); number(a.y, `${q}.y`);
    optional(a, 'age', q, (v, p) => number(v, p, 0));
  });
  list(data.wildlife.state, `${path}.wildlife.state`, object);
  integer(data.wildlife.nextId, `${path}.wildlife.nextId`, 1);
  if (data.plants != null) list(data.plants, `${path}.plants`, (s, q) => { if (typeof s !== 'string') fail(q, 'a species key string'); });
}

export function assertWorld(world, catalog, path = 'world') {
  integer(world.w, `${path}.w`, 1); integer(world.h, `${path}.h`, 1);
  if (world.n !== world.w * world.h) fail(`${path}.n`, 'width × height');
  const vertices = (world.w + BORDER * 2 + 1) * (world.h + BORDER * 2 + 1);
  for (const [key, Type] of Object.entries({ ...WORLD_ARRAY_TYPES, ...EXTRA_ARRAYS })) {
    const values = world[key], q = `${path}.${key}`;
    if (values == null && key in EXTRA_ARRAYS) continue;
    if (!(values instanceof Type)) fail(q, Type.name);
    // Older saves may contain partially allocated optional arrays; retain that format.
    if (key in EXTRA_ARRAYS ? values.length > extraArrayLimit(key, world.n) : values.length !== (key === 'vh' ? vertices : world.n)) fail(q, `the ${key === 'vh' ? 'vertex' : 'tile'} array length`);
    if (Type === Float32Array && !values.every(Number.isFinite)) fail(q, 'finite values');
  }
  for (const [key, values] of [['terrain', Object.values(T)], ['feature', Object.values(F)]]) {
    const allowed = new Set(values); if (!world[key].every(v => allowed.has(v))) fail(`${path}.${key}`, 'declared enum values');
  }
  for (const [key, expectedLayer] of [['ground', 0], ['shrub', 1], ['tree', 2]]) for (const id of world[key]) {
    if (id && (!catalog.plants[id] || catalog.plants[id].layer !== expectedLayer)) fail(`${path}.${key}`, 'plant IDs belonging to this map and layer');
  }
  list(world.structures, `${path}.structures`, (s, q) => {
    if (s == null) return;
    if (!Object.hasOwn(catalog.structures, s.type)) fail(`${q}.type`, 'a structure type in this map');
    for (const key of ['x', 'y', 'w', 'h']) integer(s[key], `${q}.${key}`, key === 'w' || key === 'h' ? 1 : 0);
    if (s.x + s.w > world.w || s.y + s.h > world.h) fail(q, 'a footprint inside the farm');
  });
  for (const index of world.struct) if (index !== -1 && !world.structures[index]) fail(`${path}.struct`, 'existing structure indices or -1');
}

export function assertFarmState(state, path = 'farm') {
  object(state, path); text(state.map, `${path}.map`); number(state.seed, `${path}.seed`);
  choice(state.mode, `${path}.mode`, ['free', 'campaign']); choice(state.difficulty, `${path}.difficulty`, ['relaxed', 'standard', 'challenging']);
  integer(state.day, `${path}.day`); number(state.money, `${path}.money`); integer(state.speed, `${path}.speed`, 0, SPEEDS.length - 1);
  choice(state.weather, `${path}.weather`, ['clear', 'cloud', 'rain', 'snow']);
  for (const key of ['acc', 'weatherDays', 'rainStreak', 'dryStreak', 'snow', 'lastGrant', 'frugivoreCount']) number(state[key], `${path}.${key}`, 0);
  object(state.flags, `${path}.flags`); object(state.goalsDone, `${path}.goalsDone`); object(state.stats, `${path}.stats`); object(state.campaign, `${path}.campaign`);
  integer(state.campaign.chapter, `${path}.campaign.chapter`);
  for (const key of ['planted', 'dug', 'removed', 'spent', 'earned']) number(state.stats[key], `${path}.stats.${key}`, 0);
  object(state.stats.used, `${path}.stats.used`); for (const [key, n] of Object.entries(state.stats.used)) integer(n, `${path}.stats.used.${key}`);
  if (state.stats.ledger != null) assertLedger(state.stats.ledger, `${path}.stats.ledger`);
  if (state.stats.grants != null) { object(state.stats.grants, `${path}.stats.grants`); for (const [key, value] of Object.entries(state.stats.grants)) number(value, `${path}.stats.grants.${key}`, 0); }
  assertLedger(state.ledger, `${path}.ledger`); if (state.lastLedger != null) assertLedger(state.lastLedger, `${path}.lastLedger`);
  list(state.history, `${path}.history`, object);
}
function assertLedger(ledger, path) {
  object(ledger, path);
  for (const side of ['in', 'out']) { object(ledger[side], `${path}.${side}`); for (const [key, value] of Object.entries(ledger[side])) number(value, `${path}.${side}.${key}`, 0); }
}
