// Map: Enkare Conservancy, a communal grazing range on the western edge of the Serengeti,
// Tanzania, where overgrazing has turned grassland to bare, eroding hardpan.

import buildSerengetiPlants from '../data/plants-serengeti.js';
import buildSerengetiAnimals from '../data/animals-serengeti.js';
import { generateRange, serengetiBorderCell } from './serengeti-world.js';
import { PNW_GOALS, perimeterFence, culvertExists, pop, speciesPresent } from '../sim/goals.js';
import { PLANT } from '../data/plants.js';

const reuse = key => PNW_GOALS.find(g => g.key === key);
const countPlant = (w, key, layer = 'ground', minG = 0.4) => {
  const id = PLANT[key]?.id; let n = 0;
  const ids = w[layer], gs = w[layer + 'G'];
  for (let i = 0; i < w.n; i++) if (ids[i] === id && gs[i] > minG) n++;
  return n;
};
const invPct = g => (g.cache.score?.invFrac ?? 1) * 100;

const GOALS = [
  { key: 'plant', name: 'Break ground', reward: 1000,
    desc: 'Plant 200 native plants anywhere on the range.',
    check: g => g.stats.planted >= 200, prog: g => `${Math.min(200, g.stats.planted)} / 200 planted` },
  { key: 'soil', name: 'Feed the soil', reward: 2000,
    desc: 'Sow 300 tiles of the soil builders mix. Dropseed and wild legumes are the only plants that will take on bare hardpan, and they rebuild the soil for everything else.',
    check: g => (g.stats.used?.mix_pioneers_s || 0) >= 300, prog: g => `${Math.min(300, g.stats.used?.mix_pioneers_s || 0)} / 300 tiles` },
  { key: 'pits', name: 'Catch the rain', reward: 2000,
    desc: 'Dig 40 half-moon pits (Landscape → Lower). Each crescent hollow catches rain and blown seed, so plants sprout in it even on crusted ground.',
    check: g => (g.stats.used?.lower || 0) >= 40, prog: g => `${Math.min(40, g.stats.used?.lower || 0)} / 40 pits` },
  { key: 'culvert', name: 'Free the lugga', reward: 1500,
    desc: 'Remove the culvert where the herders\' track crosses the sand river, so catfish and crocodiles can move up it in the rains.',
    check: g => !culvertExists(g.world), prog: g => culvertExists(g.world) ? 'Culvert still in place' : 'Done' },
  { key: 'fence', name: 'Open the migration route', reward: 2500,
    desc: 'Tear out the boundary wire along the north and east edges. It cuts the path the wildebeest and zebra used to take through here.',
    check: g => perimeterFence(g.world) === 0, prog: g => `${perimeterFence(g.world)} fence tiles left` },
  { key: 'weeds', name: 'Beat the famine weed', reward: 3000,
    desc: 'Get invasive plants below 8% of the land. Famine weed, prickly pear, lantana and mesquite all spread fastest on bare ground.',
    check: g => invPct(g) < 8, prog: g => `${invPct(g).toFixed(0)}% invasive` },
  { key: 'grass', name: 'Grass comes home', reward: 4000,
    desc: 'Grow 2,000 tiles of savanna grassland.',
    check: g => (g.world.stats.meadow || 0) >= 2000, prog: g => `${(g.world.stats.meadow || 0).toLocaleString()} / 2,000 tiles` },
  { key: 'species12', name: 'Welcome back', reward: 2000,
    desc: 'Have 12 animal species living on the range at the same time.',
    check: g => speciesPresent(g) >= 12, prog: g => `${speciesPresent(g)} / 12 species` },
  { key: 'redoat', name: 'Red oat grass', reward: 4000,
    desc: 'Grow 150 tiles of red oat grass, the tall grass of a healthy Serengeti. It only comes back once the soil has.',
    check: g => countPlant(g.world, 'redoat') >= 150, prog: g => `${countPlant(g.world, 'redoat')} / 150 tiles` },
  { key: 'migration', name: 'The migration returns', reward: 6000,
    desc: 'Have 20 wildebeest on the range at once, as the Great Migration passes through in the dry season.',
    check: g => pop(g, 'wildebeest') >= 20, prog: g => `${pop(g, 'wildebeest')} / 20 wildebeest (they pass through June to October)` },
  { key: 'giraffe', name: 'Tall browsers', reward: 3000,
    desc: 'Giraffe move in. They need acacia woodland to browse.',
    check: g => pop(g, 'giraffe') > 0, prog: g => `${pop(g, 'giraffe')} giraffe here` },
  { key: 'vulture', name: 'The clean-up crew', reward: 3000,
    desc: 'White-backed vultures nest on the range. They need big herds to follow and tall trees to nest in.',
    check: g => pop(g, 'vulture') > 0, prog: g => `${pop(g, 'vulture')} vultures here` },
  { key: 'elephant', name: 'Elephants', reward: 6000,
    desc: 'An elephant family moves in (or is brought back). They need a lot of woodland and permanent water.',
    check: g => pop(g, 'elephant') > 0, prog: g => `${pop(g, 'elephant')} elephants here` },
  { key: 'lion', name: 'The pride', reward: 8000,
    desc: 'A pride of at least two lions settles in. They need big grasslands full of grazers.',
    check: g => pop(g, 'lion') >= 2, prog: g => `${pop(g, 'lion')} / 2 lions` },
  { key: 'species20', name: 'Living savanna', reward: 10000,
    desc: 'Have 20 animal species living here at once.',
    check: g => speciesPresent(g) >= 20, prog: g => `${speciesPresent(g)} / 20 species` },
  reuse('trailhead'), reuse('visitors'), reuse('rating'),
  { key: 'score', name: 'Thriving', reward: 12000,
    desc: 'Reach an ecosystem health score of 75.',
    check: g => (g.cache.score?.total ?? 0) >= 75, prog: g => `${Math.round(g.cache.score?.total ?? 0)} / 75` },
];

export default {
  id: 'serengeti',
  name: 'Serengeti',
  farm: 'Enkare Conservancy',
  region: 'Serengeti, Tanzania',
  blurb: 'A communal grazing range on the Serengeti\'s edge, overgrazed to bare, crusted earth: gullies, famine weed, prickly pear hedges and a fence across the migration route.',
  campaign: true,
  campaignEnd: 'You finished the campaign. Enkare is savanna again: red oat grass to the horizon, the wildebeest pouring through every dry season, and lions in the shade of the old umbrella thorns. Every tool is yours now: keep going as long as you like.',
  image: 'assets/maps/serengeti.jpg',
  // safari visitors come a long way and give generously
  visitorValue: 1.4,
  // bare ground is crusted hardpan: nothing roots in it until it's loosened or pitted
  hardpan: true,
  // open savanna: trees stay scattered (see sim/plants.js), except along the water
  savanna: true,
  // native seed bank: on healthy land, buried native seed beats weeds into burned and bare ground
  seedbank: true,
  // every animal walks (or flies) to water every few days to drink
  waterholes: true,
  // where the map sits on the world-map picker (degrees)
  lat: -2.3, lon: 34.8,
  plants: buildSerengetiPlants,
  animals: buildSerengetiAnimals,
  goals: GOALS,
  generate: generateRange,
  borderCell: serengetiBorderCell,
  startWildlife: [['warthog', 3, 50, 44, 4], ['gazelle', 5, 56, 20, 5], ['tortoise', 2, 40, 58, 4], ['monitor', 1, 56, 52, 2],
    ['catfish', 5, 58, 52, 2], ['weaver', 4, 50, 40, 3], ['dungbeetle', 3, 52, 46, 3]],
  startText: 'The long rains have started, Year 1. A few warthogs and gazelles pick at what grass is left, and the park\'s tall grass waves just across the fence to the north.',
  story: `<p><b>The Enkare community has turned its old grazing land into a conservancy</b>, and asked you to bring it back. Generations of too many cattle, goats and sheep have stripped the grass from these 180 acres on the western edge of the Serengeti. Rain runs off the bare, crusted soil and cuts gullies down to the river. Famine weed and prickly pear fill the gaps, and a wire fence blocks the route the migration used to take. Your job is to turn bare earth back into savanna.</p>`,
  rules: [
    'You don\'t buy animals or upgrades. <b>You build habitat</b>, and wildlife follows its own rules: it wanders in from the park, the river and the neighbouring land when there\'s room, raises young, hunts, and moves on when there isn\'t enough.',
    '<b>Bare ground is the problem.</b> Crusted hardpan sheds rain and nothing takes root. <b>Loosen the soil</b>, dig <b>half-moon pits</b> to catch rain, and spread <b>mulch</b>.',
    '<b>Soil first, then grass, then trees.</b> Dropseed and wild legumes grow on the poorest ground and feed the soil. Star and finger grass follow; red oat grass only returns once the soil is healthy again.',
    '<b>Invasives</b> (famine weed, prickly pear, lantana and mesquite) take over bare ground. Pull them and cover the ground with natives.',
    '<b>The migration</b> swims the river at the crossing in the middle of the range from June to October, then passes through north to the park, if there\'s grass and the north fence is down. Crocodiles wait at the crossing, and the herds bring lions, hyenas, vultures and dung beetles with them.',
    '<b>Fire is natural here.</b> The dry-season grass burns every few years and savanna plants resprout. Controlled early burns keep invasive scrub down.',
    '<b>Money is tight.</b> Grants grow with the land\'s health, and safari visitors on your trails pay generously, but crowds push shy animals like rhino and cheetah away.',
  ],
  firstYear: [
    'On the bare hardpan, <b>loosen the soil</b> and dig <b>half-moon pits</b>, then sow <b>soil builders</b> into them while the long rains last.',
    '<b>Pull the famine weed</b> around the bomas and along the track before it seeds.',
    'Tear out the <b>boundary fence</b> on the north and east edges to open the migration route.',
    'Plant <b>riverine trees</b> along the lugga and <b>thornbush</b> on the gully edges to stop them eating further into the land.',
  ],
  toolText: {
    pull: { icon: { plant: 'parthenium' }, desc: 'Dig out famine weed, lantana, prickly pear and mesquite. Native plants are left alone.' },
    lower: { name: 'Half-moon pits', desc: 'Dig half-moon pits: crescent hollows that catch rainwater, silt and blown seed, so plants sprout in them even on bare hardpan.' },
    rip: { desc: 'Break the crust on bare, trampled ground so rain soaks in instead of running off.' },
    mulch: { desc: 'Spread cut brush and old dung as mulch. It shades the soil, feeds it, and traps seed.' },
    pond: { desc: 'A waterhole for hippos, crocodiles, catfish and thirsty herds in the dry season.' },
    burn: { desc: 'A cool burn early in the dry season clears old grass and invasive scrub; native grass comes back greener. Keep it away from young trees. In dry weather it can escape: cut a firebreak around it first.' },
  },
  structureNames: { house: 'Ranger post', barn: 'Cattle boma', silo: 'Water tank', shed: 'Store', tractor: 'Old Land Rover' },
  habitatNames: {
    FARM: 'Overgrazed range', INVASIVE: 'Invasive weeds', MEADOW: 'Savanna grassland', SHRUB: 'Thornbush',
    YOUNG_FOREST: 'Acacia woodland', MATURE_FOREST: 'Old woodland', RIPARIAN: 'Riverine thicket', CREEK: 'Sand river (lugga)', BARE: 'Bare, eroded ground',
  },
  terrainNames: { PASTURE: 'Grazed-out range', GRAVEL: 'Crusted hardpan', MUD: 'Gully', FIELD: 'Village field' },

  climate: {
    // Mar–May long rains, Jun–Aug dry season, Sep–Nov late dry season and the short rains, Dec–Feb short dry spell
    seasons: ['Long rains', 'Dry season', 'Late dry season', 'Short rains'],
    rain: [0.62, 0.66, 0.45, 0.07, 0.04, 0.04, 0.08, 0.16, 0.42, 0.46, 0.24, 0.26],
    growth: [1.0, 1.0, 0.85, 0.5, 0.35, 0.3, 0.35, 0.55, 0.95, 1.0, 0.75, 0.7],
    spread: [1.0, 1.0, 0.9, 0.6, 0.5, 0.5, 0.6, 0.8, 1.0, 1.0, 0.8, 0.8],
    moist: [0.1, 0.12, 0.06, -0.08, -0.15, -0.2, -0.2, -0.12, 0.03, 0.06, -0.02, -0.02],
    snow: null,
    fireMonths: [4, 5, 6, 7],
    // grass fires sweep the plains most dry seasons; they kill saplings but not grown, thick-barked
    // acacias, and never carry into the crowns. With the browsers, that's what keeps it savanna.
    fireRate: 5, fireGap: 18, fireSpread: 1.6, crownFires: false,
    floodMonths: [1, 2],
    tips: [
      'Long rains: the best time to sow. Get seed into the half-moon pits while the ground is soft.',
      'Dry season: the grass cures gold and the migration arrives. Watch for fire in the tall grass.',
      'Late dry season: the hardest months. Waterholes shrink and animals crowd the river.',
      'Short rains: a second flush of green. Plant again, and the herds head south to calve.',
    ],
    fireCause: ['Lightning', "A visitor's cooking fire", 'Herders burning old grass for new growth'],
  },
  seedRain: {
    N: ['redoat', 'redoat', 'finger', 'stargrass', 'umbrella', 'balanites', 'whistling', 'croton', 'indigofera', 'crotalaria'],
    E: ['parthenium', 'parthenium', 'sodomapple', 'pricklypear', 'sporobolus'],
    W: ['parthenium', 'lantana', 'mesquite', 'sporobolus'],
    S: ['papyrus', 'bluelily', 'fevertree', 'sycamorefig', 'sausage'],
  },
  windSeeds: ['umbrella', 'commiphora'],
  berrySeeds: ['grewia', 'balanites', 'sycamorefig', 'sausage', 'lantana', 'pricklypear'],
  floodSeeds: ['papyrus', 'bluelily', 'fevertree', 'sycamorefig'],
  burnSeeds: ['stargrass', 'finger', 'redoat', 'indigofera', 'crotalaria', 'parthenium'],

  text: {
    edges: { N: 'the national park to the north', E: 'the neighbours\' rangeland to the east', S: 'the river', W: 'the village farms to the west' },
    creekFish: 'catfish', culvertBlocks: 'catfish and crocodiles', fenceBlocks: 'the migrating herds, buffalo, giraffe and elephants',
    flood: 'The river is up!',
    floodOut: 'Fresh silt spreads over the riverbank, and papyrus and fever trees seed into it.',
    fireOutRain: 'Native grass resprouts from its roots within weeks; famine weed takes longer.',
    fireOut: 'The savanna is built for fire: the grass will be back with the next rains. Young trees are the ones that suffer.',
    crownOut: 'Even the acacias burned. Standing dead trunks will host vultures and hornbills while grass takes the ground.',
  },
  look: {
    // colour grade: sunlit and clear, only a touch warm
    grade: { gain: [1.015, 1.0, 0.975], lift: [0.004, 0.002, 0.0], sat: 1.05, contrast: 1.08 },
    pasture: ['#a2a862', '#b6aa7c', '#baa47c', '#a8aa6a'], // muted straw, not mustard
    soil: [0.72, 0.54, 0.4], mud: [0.54, 0.43, 0.33],
    water: { pond: [0.34, 0.44, 0.44, 0.9], creek: [0.38, 0.46, 0.4, 0.8], river: [0.33, 0.42, 0.38, 0.9], marsh: [0.42, 0.5, 0.38, 0.55] }, // silty, but still reads as water
    light: [
      { sun: 0xfff6e8, sunI: 2.7, sky: 0xe4edf4, ground: 0x66683c, hemiI: 1.2 },
      { sun: 0xfff2dc, sunI: 2.9, sky: 0xe6ecf2, ground: 0x6e6a44, hemiI: 1.18 },
      { sun: 0xffeccc, sunI: 2.85, sky: 0xe8eaec, ground: 0x6e6644, hemiI: 1.15 },
      { sun: 0xfff4e6, sunI: 2.5, sky: 0xe2eaf0, ground: 0x666a42, hemiI: 1.2 },
    ],
    // falling leaves, seed and dust motes, and mist (0..1 per season), and the flocks that pass over
    ambience: {
      leaves: [0, 0.2, 0.4, 0], fluff: [0.25, 0.6, 0.9, 0.25], mist: [0.4, 0, 0, 0.35],
      leafColors: ['#c8a848', '#b8883a', '#9a9a4a', '#d8b860'],
      flocks: [['storks', 'weavers', 'vultures'], ['vultures', 'weavers'], ['vultures', 'storks', 'weavers'], ['storks', 'weavers', 'egrets']],
    },
    // the dry season hangs a golden haze of dust over the plains
    tint: ['rgba(255,250,230,0)', 'rgba(255,232,190,0.02)', 'rgba(245,215,170,0.03)', 'rgba(255,245,225,0)'],
  },
};
