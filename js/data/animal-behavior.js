import { dormancyProfileFor } from './animal-dormancy.js';
import { territoryProfileFor } from './animal-territories.js';
// Behavioral guilds complement species habitat/diet data; they never change population capacity.
// Research and per-map audit: tools/animal-behavior-audit.json.
const GRAZE = new Set(['rabbit', 'capybara', 'zebra', 'wildebeest', 'gazelle', 'antelope', 'buffalo', 'warthog', 'hippo']);
const BROWSE = new Set(['deer', 'tapir', 'rhino', 'giraffe', 'elephant', 'impala']);
const INSECTS = new Set(['armadillo', 'anteater', 'pangolin', 'frog', 'newt']);
const HORNS = new Set(['deer', 'buffalo', 'impala', 'gazelle', 'antelope', 'wildebeest', 'rhino']);
// Grazers that must drink most days and walk well beyond their grazing to reach water.
const WATER_DEPENDENT = new Set(['wildebeest', 'zebra', 'buffalo', 'elephant', 'gajah', 'cattle']);
// How far an animal walks to drink (a multiple of its species' usual reach), and the
// share of its time water trips may take. With no water in reach it gets by on food and dew (decision 0013).
const waterProfileFor = def => WATER_DEPENDENT.has(def.key) ? { reach: 1.5, share: 0.15 } : { reach: 1, share: 0.08 };
export function behaviorFor(def) {
  const s = def.sprite, k = s.kind;
  let forage = [];
  if (GRAZE.has(k)) forage = ['grass'];
  if (BROWSE.has(k)) forage = ['browse', 'grass'];
  if (def.key === 'elk') forage = ['grass', 'browse']; // (a grazer first: elk feed out on the meadows and browse in winter)
  if (INSECTS.has(k)) forage = ['insects'];
  if (['squirrel', 'rodent', 'agouti', 'peccary', 'raccoon'].includes(k)) forage = ['fruit', 'seeds', 'insects'];
  if (k === 'bear') forage = ['fruit', 'insects'];
  if (k === 'sloth' || ['howler', 'congo', 'langur'].includes(def.key)) forage = ['leaves'];
  if (k === 'monkey' || k === 'orangutan') forage = forage.length ? forage : ['fruit'];
  if (k === 'bat') forage = s.batType === 'fruit' || s.batType === 'fox' ? ['fruit'] : ['insects'];
  if (['bee', 'butterfly', 'hummer'].includes(k) || def.key === 'sunbird') forage = ['nectar'];
  if (s.lizard === 'iguana') forage = ['browse'];
  if (s.lizard === 'ctenosaur') forage = ['browse', 'insects'];
  if (s.lizard === 'anole') forage = ['insects'];
  if (k === 'turtle' && s.dome) forage = ['grass'];
  if (def.key === 'boxturtle') forage = ['fruit', 'insects'];
  if (def.key === 'dungbeetle') forage = ['dung'];
  if (def.key === 'boar') forage = ['seeds', 'insects', 'fruit'];
  if (def.reef) {
    const reefFood = { greenturtle: ['seagrass'], dugong: ['seagrass'], hawksbill: ['sponge'],
      idol: ['sponge'], butterfly: ['coral'], cleaner: ['cleaning'], manta: ['plankton'],
      chromis: ['plankton'], clownfish: ['plankton'], tang: ['algae'], parrotfish: ['algae'],
      urchin: ['algae'], seacucumber: ['sediment'] };
    forage = reefFood[def.key] || [];
  }
  let hunt = k === 'feline' ? (def.key === 'cheetah' ? 'sprint' : 'stalk')
    : ['snake', 'caiman', 'monitor'].includes(k) ? 'ambush'
    : k === 'canine' || k === 'hyena' ? 'chase' : 'pursue';
  if (def.move === 'fly') hunt = ['heron', 'crane', 'secretary'].includes(k) ? 'wade' : 'stoop';
  // Coyotes pursuing the small prey represented here hunt alone or with one companion.
  const partners = def.key === 'coyote' ? 1 : ['lion', 'hyena', 'giantotter'].includes(def.key) ? 3 : 0;
  const combat = def.domestic ? null : HORNS.has(k) ? 'horns' : k === 'giraffe' ? 'necking' : null;
  return { forage, hunt, partners, combat, territory: territoryProfileFor(def), dormancy: dormancyProfileFor(def), water: waterProfileFor(def) };
}
