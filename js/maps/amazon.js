// Map: Fazenda Esperança, a cattle ranch carved out of the Amazon rainforest in southern Pará, Brazil.

import buildAmazonPlants from '../data/plants-amazon.js';
import buildAmazonAnimals from '../data/animals-amazon.js';
import { generateRanch, amazonBorderCell } from './amazon-world.js';
import { PNW_GOALS, perimeterFence, culvertExists, pop, speciesPresent } from '../sim/goals.js';
import { PLANT } from '../data/plants.js';

const reuse = key => PNW_GOALS.find(g => g.key === key);
// established trees only: seedlings in a fresh muvuca sowing don't count yet
const countTrees = (w, key) => { const id = PLANT[key]?.id; let n = 0; for (let i = 0; i < w.n; i++) if (w.tree[i] === id && w.treeG[i] > 0.5) n++; return n; };
const invPct = g => (g.cache.score?.invFrac ?? 1) * 100;

const GOALS = [
  { key: 'plant', name: 'Break ground', reward: 1000,
    desc: 'Plant 200 native plants anywhere on the ranch.',
    check: g => g.stats.planted >= 200, prog: g => `${Math.min(200, g.stats.planted)} / 200 planted` },
  { key: 'muvuca', name: 'Seeds of change', reward: 2000,
    desc: 'Sow 300 tiles with the muvuca seed mix. Broadcasting many native seeds at once is how pastures are turned back into forest in the Xingu.',
    check: g => (g.stats.used?.mix_muvuca || 0) >= 300, prog: g => `${Math.min(300, g.stats.used?.mix_muvuca || 0)} / 300 tiles` },
  { key: 'culvert', name: 'Free the igarapé', reward: 2000,
    desc: 'Remove the culvert where the river road crosses the stream, so fish, caiman and river turtles can move upstream.',
    check: g => !culvertExists(g.world), prog: g => culvertExists(g.world) ? 'Culvert still in place' : 'Done' },
  { key: 'fence', name: 'Open the forest edge', reward: 1500,
    desc: 'Tear out the barbed wire along the north and east boundary, where the ranch meets the rainforest.',
    check: g => perimeterFence(g.world) === 0, prog: g => `${perimeterFence(g.world)} fence tiles left` },
  { key: 'grass', name: 'Beat back the braquiária', reward: 3000,
    desc: 'Get invasive pasture grass below 40% of the land. It dies in shade, so trees are your best weapon.',
    check: g => invPct(g) < 40, prog: g => `${invPct(g).toFixed(0)}% invasive` },
  { key: 'firesafe', name: 'A dry season without fire', reward: 3000,
    desc: 'Get through a whole burning season (July to October) without a fire on the ranch. Firebreaks, fire crews and closed canopy all help.',
    check: g => g.year >= 2 && g.month === 8 && g.day - g.events.lastFire > 150, prog: g => g.day - g.events.lastFire > 150 ? 'No fire yet this season' : 'A fire burned recently' },
  { key: 'canopy', name: 'Canopy bridge', reward: 4000,
    desc: 'Howler monkeys move in. They only travel through the treetops, so the forest has to be connected to the reserve and the rainforest edge.',
    check: g => pop(g, 'howler') > 0, prog: g => `${pop(g, 'howler')} howlers here` },
  { key: 'species12', name: 'Welcome back', reward: 2000,
    desc: 'Have 12 animal species living on the ranch at the same time.',
    check: g => speciesPresent(g) >= 12, prog: g => `${speciesPresent(g)} / 12 species` },
  { key: 'nuts', name: 'Nut planters', reward: 3000,
    desc: 'Have 25 Brazil nut trees growing. Agoutis bury the nuts; without them the giants barely spread.',
    check: g => countTrees(g.world, 'brazilnut') >= 25, prog: g => `${countTrees(g.world, 'brazilnut')} / 25 trees` },
  { key: 'grass2', name: 'From pasture to forest', reward: 5000,
    desc: 'Get invasive grass below 15% of the land.',
    check: g => invPct(g) < 15, prog: g => `${invPct(g).toFixed(0)}% invasive` },
  { key: 'macaw', name: 'Scarlet sky', reward: 5000,
    desc: 'A pair of scarlet macaws settles in. They need big trees or dead trunks to nest in.',
    check: g => pop(g, 'macaw') >= 2, prog: g => `${pop(g, 'macaw')} macaws here` },
  { key: 'dolphin', name: 'Pink dolphins', reward: 4000,
    desc: 'Amazon river dolphins hunt along your stretch of the river. They follow clean water and plenty of fish.',
    check: g => pop(g, 'dolphin') > 0, prog: g => `${pop(g, 'dolphin')} dolphins` },
  { key: 'forest', name: 'Rainforest again', reward: 6000,
    desc: 'Grow 600 tiles of forest, with at least 60 of them old growth.',
    check: g => (g.world.stats.forest || 0) >= 600 && (g.world.stats.mature || 0) >= 60,
    prog: g => `${g.world.stats.forest || 0} / 600 forest, ${g.world.stats.mature || 0} / 60 old growth` },
  { key: 'jaguar', name: 'The jaguar returns', reward: 8000,
    desc: 'A jaguar takes up residence. It needs a big, connected forest and plenty of prey.',
    check: g => pop(g, 'jaguar') > 0, prog: g => 'Needs a large forest with capybara, peccaries or caiman' },
  { key: 'species20', name: 'Living forest', reward: 10000,
    desc: 'Have 22 animal species living here at once.',
    check: g => speciesPresent(g) >= 22, prog: g => `${speciesPresent(g)} / 22 species` },
  reuse('trailhead'), reuse('visitors'), reuse('rating'),
  { key: 'score', name: 'Thriving', reward: 12000,
    desc: 'Reach an ecosystem health score of 75.',
    check: g => (g.cache.score?.total ?? 0) >= 75, prog: g => `${Math.round(g.cache.score?.total ?? 0)} / 75` },
];

export default {
  id: 'amazon',
  name: 'Amazon rainforest',
  farm: 'Fazenda Esperança',
  region: 'Pará, Brazil',
  blurb: 'An old cattle ranch cut from the rainforest: pasture grass that burns every dry season, a trampled stream, lone Brazil nut trees and a scrap of forest to grow from.',
  campaign: true,
  // eco-tourists come a long way to see the Amazon and give more per visit
  visitorValue: 1.3,
  campaignEnd: 'You finished the campaign. Fazenda Esperança is turning back into rainforest, the igarapé runs clear, and the jaguar hunts where the cattle used to graze. Every tool is yours now: keep going as long as you like, because the forest giants are only just getting started.',
  image: 'assets/maps/amazon.jpg',
  lat: -6.6, lon: -51.9,
  plants: buildAmazonPlants,
  animals: buildAmazonAnimals,
  goals: GOALS,
  generate: generateRanch,
  borderCell: amazonBorderCell,
  startWildlife: [['capybara', 4, 54, 41, 3], ['armadillo', 2, 22, 50, 6], ['caiman', 1, 54, 40, 2], ['piranha', 6, 60, 86, 6],
    ['anteater', 1, 76, 30, 4], ['agouti', 2, 102, 12, 5], ['toucan', 2, 100, 10, 5], ['hermit', 2, 96, 16, 4]],
  startText: 'The rains are ending, Year 1. Capybaras graze the cattle pond and an anteater works the pasture edge. The rainforest is right there to the north and east, waiting to come back.',
  story: `<p><b>Your family bought Fazenda Esperança</b>, a cattle ranch in southern Pará that was cleared from the rainforest about thirty years ago. Now it is signal grass from fence to fence, burned every dry season. A thin scrap of the legal forest reserve still clings to the north-east corner, touching the real rainforest beyond. Your job is to let the forest back in.</p>`,
  rules: [
    'You don\'t buy animals or upgrades. <b>You build habitat</b>, and wildlife follows its own rules: it wanders in from the rainforest, the river and the neighbouring ranches when there\'s room, raises young, hunts, and moves on when there isn\'t enough.',
    '<b>The grass is the enemy.</b> African pasture grass (braquiária and colonião) smothers tree seedlings and fuels fires, but it dies in shade. Get fast pioneer trees up and it fades.',
    '<b>Forest comes back fast here.</b> Cecropia, balsa and ingá shade a pasture within a few years. Sow the <b>muvuca</b> seed mix to plant pioneers and future giants together.',
    '<b>Fire is the big threat.</b> From July to October the grass cures to tinder and neighbours burn their pastures. Trails and bare ground stop fires; fire crews put them out.',
    '<b>Connect the canopy.</b> Monkeys and sloths never touch the ground. Grow forest that links to the reserve and the rainforest edge, and they will move in through the treetops.',
    '<b>Animals plant the forest.</b> Toucans, monkeys and tapirs spread fruit seeds; agoutis are the only animals that plant Brazil nuts.',
    '<b>High water</b> floods the river flats from January to April. Clean, connected water brings caiman, giant otters and pink river dolphins.',
    '<b>Money is tight.</b> Grants grow with forest health, and eco-tourists on your trails pay their way, but crowds push shy wildlife away.',
  ],
  firstYear: [
    'Demolish the <b>culvert</b> where the lower ranch road crosses the igarapé, then plant <b>floodplain palms</b> and <b>pioneer trees</b> along its banks.',
    'Sow <b>muvuca</b> on the pasture next to the forest reserve, so the forest grows out from its edge.',
    'Pull out the <b>reserve fence</b> and the east boundary fences so tapirs and peccaries can wander in.',
    'Before the burning season (September), cut a <b>trail</b> between the pasture and your young trees as a firebreak.',
  ],
  toolText: {
    pull: { icon: { plant: 'brachiaria' }, desc: 'Dig out braquiária and colonião grass and leucaena scrub. Native plants are left alone.' },
    pond: { desc: 'Deep, open water for caiman, river turtles, fish and capybaras.' },
    lower: { desc: 'Scoop out a swale. Hollows collect water and stay moist, which suits açaí, sedges and heliconias.' },
    burn: { desc: 'A cool, controlled burn in the wet season clears pasture grass before planting. Kills young shrubs, saplings and grass. Keep it well away from forest.' },
  },
  structureNames: { house: 'Ranch house', barn: 'Cattle shed', silo: 'Water tank', shed: 'Corral', tractor: 'Old truck' },
  habitatNames: {
    FARM: 'Degraded pasture', INVASIVE: 'Braquiária pasture', MEADOW: 'Native grassland', SHRUB: 'Scrub (capoeira)',
    YOUNG_FOREST: 'Young forest', MATURE_FOREST: 'Old-growth forest', RIPARIAN: 'Streamside forest', CREEK: 'Stream (igarapé)',
  },

  climate: {
    // Mar–May high water, Jun–Aug dry, Sep–Nov burning season and first rains, Dec–Feb rainy
    seasons: ['High water', 'Dry season', 'Burning season', 'Rainy season'],
    rain: [0.7, 0.6, 0.45, 0.2, 0.1, 0.1, 0.18, 0.32, 0.5, 0.65, 0.7, 0.72],
    growth: [1.0, 1.0, 0.9, 0.7, 0.5, 0.45, 0.6, 0.85, 1.0, 1.0, 1.0, 1.0],
    spread: [1.0, 1.0, 0.9, 0.8, 0.9, 1.0, 1.1, 1.0, 0.9, 0.9, 0.9, 1.0],
    moist: [0.14, 0.1, 0.04, -0.05, -0.14, -0.18, -0.12, -0.02, 0.06, 0.12, 0.15, 0.16],
    snow: null,
    fireMonths: [4, 5, 6, 7],
    floodMonths: [10, 11, 0, 1],
    tips: [
      'High water: the river swells into the flooded forest. Fish and dolphins swim among the trunks.',
      'Dry season: the pasture grass cures to tinder. Get trees up and trails cut before the burning season.',
      'Burning season: ranchers burn their pastures and fires escape. Watch the fence lines and keep a fire crew ready.',
      'Rainy season: everything grows fast. This is the best time to plant.',
    ],
    fireCause: ['Lightning', "A visitor's cooking fire", "Sparks from a neighbour's pasture burn"],
  },
  seedRain: {
    N: ['cecropia', 'cecropia', 'inga', 'fig', 'brazilnut', 'kapok', 'mahogany', 'heliconia', 'piper', 'psychotria', 'adiantum', 'calathea'],
    E: ['cecropia', 'inga', 'balsa', 'fig', 'mahogany', 'ipe', 'heliconia', 'piper', 'costus', 'vismia'],
    W: ['brachiaria', 'brachiaria', 'guinea', 'leucaena'],
    S: ['acai', 'cecropia', 'cyperus', 'hyacinth', 'waterlily', 'buriti'],
  },
  windSeeds: ['cecropia', 'balsa', 'kapok'],
  berrySeeds: ['inga', 'fig', 'acai', 'cecropia', 'piper', 'cacao', 'heliconia'],
  floodSeeds: ['acai', 'cyperus', 'hyacinth', 'cecropia', 'buriti'],
  burnSeeds: ['brachiaria', 'brachiaria', 'guinea', 'andropogon', 'mimosa', 'cecropia', 'vismia'],

  text: {
    edges: { N: 'the rainforest to the north', E: 'the rainforest to the east', S: 'the river', W: 'the ranches to the west' },
    creekFish: 'fish', culvertBlocks: 'fish, caiman and river turtles', fenceBlocks: 'tapirs',
    flood: 'High water!',
    floodOut: 'Açaí, sedges and cecropia seed into it, and fish have spread into new ponds.',
    fireOutRain: 'Pasture grass resprouts first; plant trees fast before it takes the ash.',
    fireOut: 'The grass will be back within weeks. Every fire that reaches young forest sets it back years.',
    crownOut: 'Rainforest trees have thin bark and few survive. Cecropia and grass will race into the gap, so plant it fast; macaws and toucans will nest in the dead trunks.',
  },
  look: {
    // colour grade: humid, deep and green
    grade: { gain: [0.96, 0.98, 0.95], lift: [0.0, 0.008, 0.006], sat: 0.97, contrast: 1.04 },
    pasture: ['#9cb85a', '#abb262', '#bcae66', '#98b65c'],
    soil: [0.74, 0.5, 0.38], mud: [0.58, 0.42, 0.32],
    // southern Pará's rivers (Xingu, Tapajós) run clear and green; the cattle pond is murkier
    water: { pond: [0.4, 0.46, 0.34, 0.86], creek: [0.32, 0.5, 0.44, 0.8], river: [0.26, 0.46, 0.42, 0.88], marsh: [0.44, 0.54, 0.4, 0.55] },
    light: [
      { sun: 0xfff0d8, sunI: 2.6, sky: 0xe8f0f0, ground: 0x5a6a3a, hemiI: 1.3 },
      { sun: 0xfff2d0, sunI: 2.9, sky: 0xf0eee0, ground: 0x6e6a3c, hemiI: 1.3 },
      { sun: 0xffd8a8, sunI: 2.3, sky: 0xf0dcc8, ground: 0x6a5a38, hemiI: 1.2 },
      { sun: 0xf0f4ff, sunI: 2.1, sky: 0xdce6ec, ground: 0x4f5e40, hemiI: 1.2 },
    ],
    // falling leaves, kapok floss and mist (0..1 per season), and the flocks that pass over
    ambience: {
      leaves: [0, 0.55, 0.8, 0], fluff: [0.15, 0.9, 0.6, 0.15], mist: [1, 0.3, 0.05, 0.8],
      leafColors: ['#c8a040', '#a8783a', '#8a9a3a', '#d0b060'],
      flocks: [['egrets', 'parrots', 'macaws'], ['parrots', 'macaws'], ['macaws', 'parrots'], ['parrots', 'egrets', 'macaws']],
    },
    // the burning season hangs a smoky haze over everything
    tint: ['rgba(255,250,230,0)', 'rgba(255,230,160,0.04)', 'rgba(220,150,100,0.1)', 'rgba(150,180,190,0.06)'],
  },
};
