// Map: Finca El Guanacaste, on the coastal plain of Chinandega, northwest Nicaragua. Cotton and then
// sugarcane replaced the tropical dry forest here; shrimp ponds were cut into the mangroves. A
// farming cooperative wants to bring back the forest, the living fences, the mangroves and the
// beach where the sea turtles used to nest.

import buildChinandegaPlants from '../data/plants-chinandega.js';
import buildChinandegaAnimals from '../data/animals-chinandega.js';
import { generateFinca, chinandegaBorderCell, ESTUARY_X } from './chinandega-world.js';
import { PNW_GOALS, culvertExists, pop, speciesPresent } from '../sim/goals.js';
import { PLANT, PLANTS } from '../data/plants.js';
import { ANIMAL } from '../data/animals.js';
import { riverRow } from '../world.js';
import { T } from '../config.js';
import { moment } from '../sim/moments.js';

const reuse = key => PNW_GOALS.find(g => g.key === key);
const st = (g, k) => g.world.stats?.[k] || 0;
const invPct = g => (g.cache.score?.invFrac ?? 1) * 100;
const start = (g, k, now) => { const f = g.flags.startCounts || (g.flags.startCounts = {}); if (f[k] == null) f[k] = now; return f[k]; };
const caneGone = g => Math.max(0, start(g, 'cane', st(g, 'cane')) - st(g, 'cane'));
const shadedPct = g => st(g, 'creek') ? Math.round(100 * st(g, 'shadedCreek') / st(g, 'creek')) : 0;

const GOALS = [
  { key: 'plant', name: 'First trees', reward: 1000,
    desc: 'Plant 200 native plants anywhere on the finca.',
    check: g => g.stats.planted >= 200, prog: g => `${Math.min(200, g.stats.planted)} / 200 planted` },
  { key: 'livingfence', name: 'Living fences', reward: 2000,
    desc: 'Plant 100 living-fence trees (Plant → Trees → Living fence). Lines of madero negro and jiñocuabo along the field edges join the patches of forest together.',
    check: g => (g.stats.used?.mix_livingfence || 0) >= 100, prog: g => `${Math.min(100, g.stats.used?.mix_livingfence || 0)} / 100 planted` },
  { key: 'culvert', name: 'Free the quebrada', reward: 2000,
    desc: 'Remove the culvert where the lower haul road crosses the quebrada, so fish can swim up from the estuary in the rainy season.',
    check: g => !culvertExists(g.world), prog: g => culvertExists(g.world) ? 'Culvert still in place' : 'Done' },
  { key: 'cane', name: 'Cane to forest', reward: 3000,
    desc: 'Clear 800 tiles of sugarcane (Remove → Clear vegetation) and plant natives in its place.',
    check: g => caneGone(g) >= 800, prog: g => `${Math.min(800, caneGone(g))} / 800 tiles of cane gone` },
  { key: 'shade', name: 'A shady quebrada', reward: 3000,
    desc: 'Plant trees and shrubs along half of the quebrada. Shade keeps water in it longer into the dry season.',
    check: g => shadedPct(g) >= 50, prog: g => `${shadedPct(g)}% / 50% shaded` },
  { key: 'ponds', name: 'Open the shrimp ponds', reward: 3000,
    desc: 'Turn the old shrimp ponds back into tidal marsh (Landscape → Marsh) so the tide can flow in again and mangroves can take root. Get the pond water below 60 tiles.',
    check: g => st(g, 'shrimpPonds') < 60, prog: g => `${st(g, 'shrimpPonds')} tiles of shrimp pond left` },
  { key: 'mangroves', name: 'The mangroves come back', reward: 4000,
    desc: 'Grow 300 tiles of mangrove forest. Plant red mangrove in the water, black and white mangrove on the mud.',
    check: g => st(g, 'mangrove') >= 300, prog: g => `${st(g, 'mangrove')} / 300 tiles` },
  { key: 'dunes', name: 'Hold the dunes', reward: 2000,
    desc: 'Grow beach morning glory or sea grape on 25 tiles of the beach, where sea turtles nest.',
    check: g => st(g, 'beachPlants') >= 25, prog: g => `${st(g, 'beachPlants')} / 25 tiles` },
  { key: 'weeds', name: 'Beat the jaragua', reward: 3000,
    desc: 'Get invasive plants below 25% of the land. Jaragua and guinea grass burn every dry season; shade from young trees is what finally kills them.',
    check: g => invPct(g) < 25, prog: g => `${invPct(g).toFixed(0)}% invasive` },
  { key: 'firesafe', name: 'A dry season without fire', reward: 3000,
    desc: 'Get through a whole dry season (January to April) with no fire on the finca. Firebreaks and fire crews help, and so does replacing the jaragua.',
    check: g => g.year >= 2 && g.month === 2 && g.day - g.events.lastFire > 130, prog: g => g.day - g.events.lastFire > 130 ? 'No fire yet this dry season' : 'A fire burned recently' },
  { key: 'forest', name: 'Dry forest', reward: 5000,
    desc: 'Grow 600 tiles of dry forest.',
    check: g => (g.world.stats.forest || 0) >= 600, prog: g => `${(g.world.stats.forest || 0).toLocaleString()} / 600 tiles` },
  { key: 'motmot', name: 'Guardabarranco', reward: 3000,
    desc: 'The turquoise-browed motmot, Nicaragua\'s national bird, nests on the finca. It digs its nest in the banks of shady streams.',
    check: g => pop(g, 'motmot') > 0, prog: g => `${pop(g, 'motmot')} here` },
  { key: 'turtles', name: 'Paslama', reward: 5000,
    desc: 'Olive ridley sea turtles come ashore to nest on the finca\'s beach. They need quiet sand, dune plants, and no trail or buildings close by.',
    check: g => pop(g, 'seaturtle') > 0, prog: g => `${pop(g, 'seaturtle')} turtles here` },
  { key: 'congo', name: 'Monos congo', reward: 6000,
    desc: 'Howler monkeys come back. They only travel through the treetops, so the forest has to be big and connected to the forest on the volcano.',
    check: g => pop(g, 'congo') > 0, prog: g => `${pop(g, 'congo')} howlers here` },
  { key: 'lora', name: 'Lora', reward: 6000,
    desc: 'Yellow-naped parrots nest here. They need big old trees with holes in them.',
    check: g => pop(g, 'lora') > 0, prog: g => `${pop(g, 'lora')} parrots here` },
  { key: 'species12', name: 'Welcome back', reward: 2000,
    desc: 'Have 12 animal species living on the finca at the same time.',
    check: g => speciesPresent(g) >= 12, prog: g => `${speciesPresent(g)} / 12 species` },
  reuse('trailhead'), reuse('visitors'), reuse('rating'),
  { key: 'species20', name: 'A living finca', reward: 10000,
    desc: 'Have 20 animal species living here at once.',
    check: g => speciesPresent(g) >= 20, prog: g => `${speciesPresent(g)} / 20 species` },
  { key: 'score', name: 'Thriving', reward: 12000,
    desc: 'Reach an ecosystem health score of 70.',
    check: g => (g.cache.score?.total ?? 0) >= 70, prog: g => `${Math.round(g.cache.score?.total ?? 0)} / 70` },
];

// ------------------------------------------------------------------ the finca's own counts
function fincaStats(w, s) {
  const cane = PLANT.cane?.id, beachIds = [PLANT.pescaprae?.id, PLANT.seagrape?.id];
  let caneN = 0, mangrove = 0, ponds = 0, beach = 0, beachPlants = 0;
  for (let i = 0; i < w.n; i++) {
    const x = i % w.w, y = (i / w.w) | 0, t = w.terrain[i];
    if (w.ground[i] === cane && w.groundG[i] > 0.3) caneN++;
    if (w.tree[i] && PLANTS[w.tree[i]].mangrove && w.treeG[i] > 0.4) mangrove++;
    if (t === T.POND && y > 55) ponds++;
    if (t === T.GRAVEL && x < ESTUARY_X && y >= riverRow(x) - 4) {
      beach++;
      if ((beachIds.includes(w.ground[i]) && w.groundG[i] > 0.3) || (beachIds.includes(w.shrub[i]) && w.shrubG[i] > 0.3)) beachPlants++;
    }
  }
  Object.assign(s, { cane: caneN, mangrove, shrimpPonds: ponds, beach, beachPlants });
}

// ------------------------------------------------------------------ keystone moments
function fincaDaily(g) {
  const done = g.flags.moments || {}, W = g.wildlife, w = g.world;
  // the howlers are back
  if (done.congos == null && ANIMAL.congo) {
    const a = W.agents.find(o => o.sp === ANIMAL.congo.index && !o.leaving);
    if (a) moment(g, 'congos', a);
  }
  // the first rains: once there's real forest, the day in May when it all turns green
  if (done.firstrains == null && g.month === 2 && g.year >= 2 && (w.stats.forest || 0) >= 200) {
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < w.n; i++) if (w.tree[i] && w.treeG[i] > 0.6 && !PLANTS[w.tree[i]].mangrove) { sx += i % w.w; sy += (i / w.w) | 0; n++; }
    if (n) { g.weather = 'rain'; g.weatherDays = 3; moment(g, 'firstrains', { x: sx / n, y: sy / n }); }
  }
  // sea turtles: note when the first one nests, and about fifty days later the hatchlings come out
  if (ANIMAL.seaturtle) {
    const t = W.agents.find(o => o.sp === ANIMAL.seaturtle.index && !o.leaving);
    // (the main nesting months are July to October, so the hatchlings come out September to December)
    if (t && g.flags.nestDay == null && g.month >= 4 && g.month <= 7) {
      // the nest: the patch of beach sand nearest where she came ashore, a few steps up from the water
      let best = null, bd = 1e9;
      for (let i = 0; i < w.n; i++) {
        const x = i % w.w, y = (i / w.w) | 0;
        if (w.terrain[i] !== T.GRAVEL || x >= ESTUARY_X || y < riverRow(x) - 4 || y > riverRow(x) - 2) continue;
        const d = (x - t.x) ** 2 + (y - t.y) ** 2;
        if (d < bd) { bd = d; best = [x + 0.5, y + 0.5]; }
      }
      if (best) { g.flags.nestDay = g.day; g.flags.nestAt = best; }
    }
    if (done.hatchlings == null && g.flags.nestDay != null && g.day - g.flags.nestDay >= 15) { // (about a month and a half of game time)
      const [nx, ny] = g.flags.nestAt;
      moment(g, 'hatchlings', { x: nx, y: ny });
      for (let k = 0; k < 26; k++) {
        const x = Math.floor(nx + (g.rng() - 0.5) * 3), y = Math.floor(ny - g.rng() * 1.5);
        if (!w.inb(x, y)) continue;
        const h = W.spawn(ANIMAL.seaturtle, x, y, { silent: true, juvenile: true, age: 0 });
        h.x += (g.rng() - 0.5) * 0.8; h.pace = 0.4 + g.rng() * 0.4;
        W.leave(h); h.tx = h.x + (g.rng() - 0.5) * 2; h.ty = w.h + 4; // straight down the beach to the sea
      }
    }
  }
}
const MOMENTS = {
  hatchlings: {
    title: 'The hatchlings run for the sea',
    text: 'Weeks after a paslama crawled up the beach to lay her eggs, the babies have dug their way out of the sand together and are racing for the waves. Only about one in a thousand will grow up, and the ones that do will come back to this beach to nest.',
  },
  congos: {
    title: 'The monos congo are back',
    text: 'A troop of howler monkeys has travelled in from the volcano through the treetops, and at dawn you can hear them roar across the finca. The forest you planted is big enough, and connected enough, for them to live in again.',
  },
  firstrains: {
    title: 'The first rains',
    text: 'After six months without rain, the first storm of May has come. Within days, the grey, leafless dry forest turns green again, frogs call from every puddle, and the trees you planted start another year of growing.',
  },
};

export default {
  id: 'chinandega',
  name: 'Nicaragua',
  farm: 'Finca El Guanacaste',
  region: 'Chinandega, Nicaragua',
  blurb: 'A finca on the Pacific plain below the San Cristóbal volcano: sugarcane where the dry forest was, a bare quebrada, shrimp ponds in the mangroves, and a beach the sea turtles stopped using.',
  campaign: false,
  image: 'assets/maps/chinandega.jpg',
  visitorValue: 0.9,
  lat: 12.63, lon: -87.13,
  pinLabel: 'se',
  plants: buildChinandegaPlants,
  animals: buildChinandegaAnimals,
  goals: GOALS,
  moments: MOMENTS,
  generate: generateFinca,
  borderCell: chinandegaBorderCell,
  stats: fincaStats,
  daily: fincaDaily,
  onStart: g => { g.flags.startCounts = { cane: g.world.stats?.cane || 0 }; },
  startWildlife: [['ctenosaur', 5, 96, 36, 10], ['urraca', 3, 60, 6, 10], ['armadillo', 2, 14, 4, 6], ['egret', 2, 90, 72, 8],
    ['iguana', 2, 42, 60, 6], ['snapper', 6, 100, 84, 6], ['raccoon', 1, 80, 78, 6], ['chocoyo', 4, 104, 4, 6]],
  startText: 'The dry season, Year 1. The cane is being burned for the harvest, ash drifts across the finca, and the quebrada is down to a few pools. On the beach, nothing has nested for years.',
  story: `<p><b>A farming cooperative in Chinandega has taken over Finca El Guanacaste</b>, and asked you to help them bring it back. Tropical dry forest once covered this coastal plain between the San Cristóbal volcano and the Pacific. It was cleared for cotton in the 1950s, and decades of pesticides and burning left the soil worn out; then it was all planted to sugarcane. Shrimp ponds were cut into the mangroves on the coast, and the sea turtles stopped nesting on the beach. The cooperative wants the land to feed people and wildlife both.</p>`,
  rules: [
    'You don\'t buy animals or upgrades. <b>You build habitat</b>, and wildlife follows its own rules: it comes in from the forest on the volcano, the estuary and the sea when there\'s room, raises young, and moves on when there isn\'t enough.',
    '<b>Two seasons.</b> From May to October it rains; from November to April it hardly rains at all, and most dry-forest trees drop their leaves. Plant at the start of the rains, so young trees have six months to grow roots before the dry season.',
    '<b>Fire is the enemy of the dry forest.</b> Jaragua and guinea grass dry out every year and burn hot, and neighbours burn their cane before harvest. Firebreaks, fire crews and shade from trees all help.',
    '<b>Living fences</b> of madero negro and jiñocuabo join patches of forest together, so monkeys, birds and seeds can travel between them.',
    '<b>The mangroves</b> are a nursery for the fish of the whole coast. Open the old shrimp ponds to the tide and replant red, black and white mangrove.',
    '<b>The beach</b> is where olive ridley turtles nest from July to November. They need quiet, dark sand with dune plants behind it, away from trails and buildings.',
    '<b>Money is tight.</b> Grants grow with the land\'s health, and visitors who come to see the turtles and the forest help too, but crowds on the beach keep the turtles away.',
  ],
  firstYear: [
    'Clear some <b>cane</b> (Remove → Clear vegetation) and sow <b>soil cover</b> and <b>butterfly garden</b> mixes when the rains start in May.',
    'Plant <b>living fences</b> along the haul roads and field edges, and <b>dry forest</b> trees in blocks between them.',
    'Plant <b>quebrada trees</b> along the stream to shade it.',
    'On the coast, turn a <b>shrimp pond</b> back into marsh and plant <b>mangroves</b>, and sow <b>beach plants</b> on the sand.',
  ],
  toolText: {
    pull: { icon: { plant: 'jaragua' }, desc: 'Pull out jaragua, guinea grass, castor bean and neem seedlings. Native plants are left alone.' },
    marsh: { desc: 'Dig tidal marsh. On the coast, use it to open the old shrimp ponds to the tide, then plant mangroves.' },
    clear: { desc: 'Strip a tile back to bare soil: cane, grass, whatever is on it. Then plant natives.' },
    burn: { desc: 'A careful early burn clears jaragua before it builds up. Keep it well away from young trees.' },
  },
  structureNames: { house: 'Cooperative house', barn: 'Cane warehouse', silo: 'Water tank', shed: 'Tool shed', tractor: 'Cane cart', parking: 'Visitor parking', center: 'Visitor center' },
  habitatNames: {
    FARM: 'Cane and old pasture', INVASIVE: 'Jaragua grass', MEADOW: 'Native grass and flowers', SHRUB: 'Scrub', YOUNG_FOREST: 'Young dry forest',
    MATURE_FOREST: 'Old dry forest', RIPARIAN: 'Streamside forest', MARSH: 'Mangrove and tidal marsh', POND: 'Pond', CREEK: 'Quebrada and channels', RIVER: 'Estuary', BARE: 'Bare ground',
  },
  terrainNames: { PASTURE: 'Old pasture', FIELD: 'Cane field', GRAVEL: 'Beach sand', MUD: 'Mud', MARSH: 'Tidal marsh', POND: 'Shrimp pond', CREEK: 'Quebrada', RIVER: 'Estuary', ROAD: 'Haul road' },

  climate: {
    seasons: ['Late dry season', 'Rainy season', 'Late rains', 'Dry season'],
    // Chinandega: almost no rain November–April; May–October rains, with a short dry spell (the canícula) in July–August
    rain: [0.02, 0.06, 0.4, 0.55, 0.3, 0.3, 0.62, 0.55, 0.14, 0.03, 0.01, 0.01],
    growth: [0.25, 0.35, 1.0, 1.0, 0.85, 0.85, 1.0, 1.0, 0.6, 0.35, 0.25, 0.25],
    spread: [0.4, 0.6, 1.0, 1.0, 0.9, 0.9, 1.0, 1.0, 0.8, 0.5, 0.4, 0.4],
    moist: [-0.2, -0.18, 0.05, 0.1, 0.0, 0.0, 0.12, 0.12, -0.04, -0.12, -0.18, -0.2],
    snow: null,
    fireMonths: [10, 11, 0, 1],
    fireRate: 3, fireGap: 30, fireSpread: 1.3, crownFires: false,
    floodMonths: [6, 7],
    tips: [
      'End of the dry season: the hottest, driest weeks, until the first rains in May turn everything green. Plant as the rains start.',
      'Rainy season: warm and wet, with a short dry spell (the canícula) in July. Sea turtles start nesting.',
      'Late rains: the heaviest storms, and the quebrada runs full. Turtle hatchlings head for the sea.',
      'Dry season: almost no rain for months. The trees drop their leaves, the grass dries, and fire is the danger.',
    ],
    fireCause: ['A neighbour burning cane before the harvest', "A visitor's cigarette", 'Someone burning trash by the road'],
  },
  seedRain: {
    N: ['guacimo', 'jinocuabo', 'madrono', 'guanacaste', 'cortes', 'ceiba', 'lantana', 'hamelia', 'jaragua'],
    E: ['redmangrove', 'blackmangrove', 'whitemangrove', 'leatherfern', 'guinea', 'neem'],
    W: ['jaragua', 'guinea', 'castor', 'neem', 'cane'],
    S: ['pescaprae', 'seagrape', 'redmangrove', 'whitemangrove'],
  },
  windSeeds: ['ceiba', 'cortes', 'macuelizo', 'cosmos', 'jaragua'],
  berrySeeds: ['guacimo', 'chilamate', 'jinocuabo', 'lantana', 'hamelia', 'castor', 'neem', 'jicaro'],
  floodSeeds: ['whitemangrove', 'redmangrove', 'chilamate', 'guinea'],
  burnSeeds: ['jaragua', 'jaragua', 'guinea', 'paspalum', 'dormilona', 'cosmos'],

  text: {
    edges: { N: 'the slopes of San Cristóbal to the north', E: 'the mangroves of the estuary to the east', S: 'the estuary and the sea', W: 'the neighbours\' cane to the west' },
    creekFish: 'snook', culvertBlocks: 'fish from the estuary', fenceBlocks: 'the deer',
    flood: 'The quebrada is in flood!',
    floodOut: 'Fresh silt spreads across the low ground, and mangrove and fig seedlings come up in it.',
    fireOutRain: 'The first rain put it out. Native grasses resprout from the roots; young trees take longer.',
    fireOut: 'The jaragua will be back first, unless trees shade it out.',
    crownOut: 'Standing dead trees will host woodpeckers and parrots while the forest grows back.',
  },
  look: {
    grade: { gain: [1.01, 1.0, 0.98], lift: [0.004, 0.002, 0.0], sat: 1.06, contrast: 1.07 },
    pasture: ['#a8a468', '#8aa452', '#8aa452', '#b0a46a'],
    soil: [0.46, 0.36, 0.28], mud: [0.4, 0.34, 0.28],     // dark volcanic soil
    sand: true,
    water: { pond: [0.36, 0.46, 0.42, 0.88], creek: [0.38, 0.5, 0.44, 0.8], river: [0.32, 0.46, 0.46, 0.9], marsh: [0.4, 0.5, 0.4, 0.55] },
    light: [
      { sun: 0xfff2dc, sunI: 2.8, sky: 0xe4ecf2, ground: 0x6a6a42, hemiI: 1.18 },
      { sun: 0xfff6e8, sunI: 2.6, sky: 0xe2ecf2, ground: 0x5a6a3a, hemiI: 1.22 },
      { sun: 0xfff4e4, sunI: 2.6, sky: 0xe2eaf0, ground: 0x5a6a3a, hemiI: 1.2 },
      { sun: 0xffeccc, sunI: 2.85, sky: 0xe8eaec, ground: 0x706a44, hemiI: 1.15 },
    ],
    ambience: {
      leaves: [0.2, 0, 0, 0.5], fluff: [0.4, 0.3, 0.3, 0.6], mist: [0.2, 0.3, 0.35, 0.1],
      leafColors: ['#c8a848', '#b8883a', '#9a8a4a', '#d8b860'],
      flocks: [['parrots', 'egrets'], ['parrots', 'egrets', 'swallows'], ['parrots', 'egrets', 'storks'], ['parrots', 'vultures']],
    },
    tint: ['rgba(255,240,215,0.02)', 'rgba(255,250,235,0)', 'rgba(255,250,235,0)', 'rgba(250,228,190,0.03)'],
  },
};
