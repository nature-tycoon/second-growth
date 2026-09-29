// Map: Finca El Guanacaste, on the slopes of San Cristóbal in Chinandega, northwest Nicaragua. Cotton and then
// cattle pasture replaced the tropical dry forest here; shrimp ponds were cut into the mangroves. A
// farming cooperative wants to bring back the forest, the living fences, the mangroves and the
// beach where the sea turtles used to nest.

import buildChinandegaPlants from '../data/plants-chinandega.js';
import buildChinandegaAnimals from '../data/animals-chinandega.js';
import { generateFinca, chinandegaBorderCell, volcanoTint, ESTUARY_X, BEACH } from './chinandega-world.js';
import { PNW_GOALS, culvertExists, pop, speciesPresent } from '../sim/goals.js';
import { PLANT, PLANTS } from '../data/plants.js';
import { ANIMAL } from '../data/animals.js';
import { riverRow } from '../world.js';
import { T, F } from '../config.js';
import { moment } from '../sim/moments.js';
import { plantSuit } from '../sim/plants.js';
const MANGROVES = ['redmangrove', 'blackmangrove', 'whitemangrove'];

const reuse = key => PNW_GOALS.find(g => g.key === key);
const st = (g, k) => g.world.stats?.[k] || 0;
const invPct = g => (g.cache.score?.invFrac ?? 1) * 100;
const start = (g, k, now) => { const f = g.flags.startCounts || (g.flags.startCounts = {}); if (f[k] == null) f[k] = now; return f[k]; };
const shadedPct = g => st(g, 'creek') ? Math.round(100 * st(g, 'shadedCreek') / st(g, 'creek')) : 0;

const GOALS = [
  { key: 'plant', name: 'First trees', reward: 1000,
    desc: 'Plant 200 native plants anywhere on the finca.',
    check: g => g.stats.planted >= 200, prog: g => `${Math.min(200, g.stats.planted)} / 200 planted` },
  { key: 'livingfence', name: 'Living fences', reward: 2000,
    desc: 'Plant 100 living-fence trees (Plant → Trees → Living fence). Lines of madero negro and jiñocuabo along the field edges join the patches of forest together.',
    check: g => (g.stats.used?.mix_livingfence || 0) >= 100, prog: g => `${Math.min(100, g.stats.used?.mix_livingfence || 0)} / 100 planted` },
  { key: 'culvert', name: 'Free the quebrada', reward: 2000,
    desc: 'Remove the culvert where the farm road crosses the quebrada, so fish can swim up from the estuary in the rainy season.',
    check: g => !culvertExists(g.world), prog: g => culvertExists(g.world) ? 'Culvert still in place' : 'Done' },
  { key: 'silvo', name: 'Shade for the herd', reward: 3000,
    desc: 'Grow trees through the pasture so 300 tiles of grazing land have shade close by. This is silvopasture: the cows stay cool, give more milk, and wildlife can cross the farm.',
    check: g => st(g, 'silvo') >= 300, prog: g => `${Math.min(300, st(g, 'silvo'))} / 300 shaded pasture tiles` },
  { key: 'herd', name: 'A healthy herd', reward: 3000,
    desc: 'Keep 30 head of cattle on the finca, well fed and shaded, alongside the wildlife.',
    check: g => pop(g, 'cattle') >= 30, prog: g => `${pop(g, 'cattle')} / 30 cattle` },
  { key: 'shade', name: 'A shady quebrada', reward: 3000,
    desc: 'Plant trees and shrubs along half of the quebrada. Shade keeps water in it longer into the dry season.',
    check: g => shadedPct(g) >= 50, prog: g => `${shadedPct(g)}% / 50% shaded` },
  { key: 'ponds', name: 'Open the shrimp ponds', reward: 3000,
    desc: 'Breach the dikes around the old shrimp ponds (Remove → Demolish a dike) so the tide flows in again. The ponds drain to tidal mud, and mangroves seed in on their own. Get the pond water below 60 tiles.',
    check: g => st(g, 'shrimpPonds') < 60, prog: g => `${st(g, 'shrimpPonds')} tiles of shrimp pond left` },
  { key: 'mangroves', name: 'The mangroves come back', reward: 4000,
    desc: 'Grow 300 tiles of mangrove forest. Once the tide flows, mangrove seedlings drift in from the old mangroves by themselves; planting red, black and white mangroves speeds it up.',
    check: g => st(g, 'mangrove') >= 300, prog: g => `${st(g, 'mangrove')} / 300 tiles` },
  { key: 'dunes', name: 'Hold the dunes', reward: 2000,
    desc: 'Grow beach morning glory or sea grape on 25 tiles of the dunes at the back of the beach. It holds the sand the sea turtles nest in.',
    check: g => st(g, 'beachPlants') >= 25, prog: g => `${st(g, 'beachPlants')} / 25 tiles` },
  { key: 'weeds', name: 'Beat the jaragua', reward: 3000,
    desc: 'Get invasive plants below 25% of the land. Jaragua and guinea grass burn every dry season; shade from young trees is what finally kills them.',
    check: g => invPct(g) < 25, prog: g => `${invPct(g).toFixed(0)}% invasive` },
  { key: 'firesafe', name: 'A dry season without fire', reward: 3000,
    desc: 'Get through a whole dry season (January to April) with no fire on the finca. Pasture is burned every year here; firebreaks, fire crews and shade trees over the grass all help.',
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
  { key: 'species20', name: 'A living finca', reward: 10000,
    desc: 'Have 20 animal species living here at once.',
    check: g => speciesPresent(g) >= 20, prog: g => `${speciesPresent(g)} / 20 species` },
  { key: 'score', name: 'Thriving', reward: 12000,
    desc: 'Reach an ecosystem health score of 70.',
    check: g => (g.cache.score?.total ?? 0) >= 70, prog: g => `${Math.round(g.cache.score?.total ?? 0)} / 70` },
];

// ------------------------------------------------------------------ the finca's own counts
function fincaStats(w, s) {
  const beachIds = [PLANT.pescaprae?.id, PLANT.seagrape?.id], W = w.w;
  let mangrove = 0, ponds = 0, beach = 0, beachPlants = 0, silvo = 0, pasture = 0;
  // shade trees: native trees grown big enough to stand in (not mangroves)
  const shade = new Uint8Array(w.n);
  for (let i = 0; i < w.n; i++) if (w.tree[i] && w.treeG[i] > 0.5 && !PLANTS[w.tree[i]].invasive && !PLANTS[w.tree[i]].mangrove) {
    const x = i % W, y = (i / W) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (w.inb(x + dx, y + dy)) shade[(y + dy) * W + x + dx] = 1;
  }
  for (let i = 0; i < w.n; i++) {
    const x = i % w.w, y = (i / w.w) | 0, t = w.terrain[i];
    const h = w.habitat[i];
    if ((h === 1 || h === 3 || h === 2) && !w.tree[i] && t !== T.GRAVEL) { pasture++; if (shade[i]) silvo++; } // (FARM, MEADOW or INVASIVE grass: grazing land)
    if (w.tree[i] && PLANTS[w.tree[i]].mangrove && w.treeG[i] > 0.4) mangrove++;
    if (t === T.POND && y > 55) ponds++;
    if (t === T.GRAVEL && x < ESTUARY_X && y >= riverRow(x) - BEACH) {
      beach++;
      if ((beachIds.includes(w.ground[i]) && w.groundG[i] > 0.3) || (beachIds.includes(w.shrub[i]) && w.shrubG[i] > 0.3)) beachPlants++;
    }
  }
  Object.assign(s, { mangrove, shrimpPonds: ponds, beach, beachPlants, silvo, pasture });
}

// ------------------------------------------------------------------ keystone moments
function fincaDaily(g) {
  const done = g.flags.moments || {}, W = g.wildlife, w = g.world;
  // the howlers are back
  if (done.congos == null && ANIMAL.congo) {
    const a = W.agents.find(o => o.sp === ANIMAL.congo.index && !o.leaving);
    if (a) moment(g, 'congos', a);
  }
  // Each month the cooperative sells milk and cheese (more cows, and better milk where the pasture
  // has shade), and the fishers and cockle gatherers sell their catch (more mangroves, more fish,
  // shrimp and conchas negras: the mangroves are the nursery for the whole coast).
  if (g.day % 10 === 0) {
    const n = ANIMAL.cattle ? pop(g, 'cattle') : 0, shadeFrac = w.stats.pasture ? (w.stats.silvo || 0) / w.stats.pasture : 0;
    const milk = Math.round(n * 38 * (0.55 + 0.9 * Math.min(1, shadeFrac * 2)));
    const catchV = Math.round((w.stats.mangrove || 0) * 2 + (pop(g, 'snook') + pop(g, 'snapper')) * 14);
    if (milk + catchV > 0) { g.earn(milk + catchV); g.cache.milk = milk; g.cache.catch = catchV; }
    if (!g.flags.incomeHint && g.day >= 20) {
      g.flags.incomeHint = true;
      g.notify(`This month the cooperative sold $${milk.toLocaleString()} of milk and cheese, and the fishers and cockle gatherers $${catchV.toLocaleString()} of fish and conchas negras. Shade trees in the pasture raise the first; mangroves raise the second.`, 'info');
    }
  }
  // Breached shrimp ponds drain: the tide washes in through the gap, and pond water next to the
  // open marsh turns to tidal mud and marsh, a little more each day.
  const W0 = w.w;
  const tidal = j => { const t = w.terrain[j]; return t === T.MARSH || t === T.CREEK || t === T.RIVER || (t === T.MUD && w.feature[j] !== F.DIKE); };
  for (let i = 0; i < w.n; i++) {
    if (w.terrain[i] !== T.POND || (i % W0) < ESTUARY_X || ((i / W0) | 0) < 50) continue;
    const x = i % W0, y = (i / W0) | 0;
    let open = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.inb(x + dx, y + dy) && tidal(w.idx(x + dx, y + dy))) { open = true; break; }
    if (open && g.rng() < 0.12) { w.terrain[i] = g.rng() < 0.4 ? T.MUD : T.MARSH; w.hydroDirty = true; w.renderDirty = true; }
  }
  // Mangrove propagules: seedlings that float in on the tide and root in open mud and marsh,
  // mostly close to grown mangroves (in the rainy season, when they drop).
  if (g.month >= 3 && g.month <= 7) {
    const ids = MANGROVES.map(k => PLANT[k]?.id).filter(Boolean);
    for (let i = 0; i < w.n; i++) {
      const t = w.terrain[i];
      if ((t !== T.MARSH && t !== T.MUD) || w.tree[i] || w.feature[i] === F.DIKE) continue;
      const x = i % W0, y = (i / W0) | 0;
      if (x < ESTUARY_X - 4 || y < 45) continue;
      let near = 0, pick = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (!w.inb(x + dx, y + dy)) continue;
        const j = w.idx(x + dx, y + dy);
        if (ids.includes(w.tree[j]) && w.treeG[j] > 0.6) { near++; if (g.rng() < 1 / near) pick = w.tree[j]; }
      }
      if (near && g.rng() < 0.004 * near) { const p = PLANTS[pick]; if (plantSuit(w, i, p) > 0.2) w.setPlant(i, p, 0.06); }
    }
  }
  // Sea turtles: when they first come to a beach that's ready for them, many come ashore on the same
  // night along its whole length (an arribada); about six weeks later the hatchlings come out of
  // every nest and race for the sea.
  if (ANIMAL.seaturtle) {
    const T0 = ANIMAL.seaturtle;
    const beachRow = x => riverRow(x) - 1 - Math.floor(g.rng() * 3);  // the open sand, a few steps from the waves
    // (in the campaign, not before the turtle-beach chapter)
    const beachReady = g.mode !== 'campaign' || g.campaign.chapter >= 6;
    if (done.arribada == null && beachReady && g.month >= 4 && g.month <= 7 && W.agents.some(o => o.sp === T0.index && !o.leaving && !o.juvenile)) {
      const nests = [];
      for (let k = 0; k < 16; k++) {
        const x = 2 + Math.floor((ESTUARY_X - 6) * (k + 0.2 + g.rng() * 0.6) / 16), y = beachRow(x);
        if (!w.inb(x, y) || w.terrain[w.idx(x, y)] !== T.GRAVEL) continue;
        nests.push([x + 0.5, y + 0.5]);
        const m = W.spawn(T0, x, y, { silent: true });
        m.x += g.rng() - 0.5; m.nestUntil = g.day + 2 + g.rng() * 2; m.state = 'idle'; m.wait = 99;
      }
      if (nests.length) {
        g.flags.nests = nests; g.flags.nestDay = g.day;
        moment(g, 'arribada', { x: nests[Math.floor(nests.length / 2)][0], y: nests[Math.floor(nests.length / 2)][1] });
      }
    }
    // the mothers go back to sea once they've laid
    for (const a of W.agents) if (a.nestUntil && g.day >= a.nestUntil && !a.leaving) { W.leave(a); a.ty = w.h + 4; a.nestUntil = 0; }
    if (done.hatchlings == null && g.flags.nests && g.day - g.flags.nestDay >= 15) { // (about six weeks of game time)
      const nests = g.flags.nests;
      moment(g, 'hatchlings', { x: nests[Math.floor(nests.length / 2)][0], y: nests[Math.floor(nests.length / 2)][1] });
      for (const [nx, ny] of nests) for (let k = 0; k < 3 + Math.floor(g.rng() * 3); k++) {
        const x = Math.floor(nx + (g.rng() - 0.5) * 1.5), y = Math.floor(ny - g.rng());
        if (!w.inb(x, y)) continue;
        const h = W.spawn(T0, x, y, { silent: true, juvenile: true, age: 0 });
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
  arribada: {
    title: 'The turtles come ashore',
    text: 'On a dark night in the rainy season, one after another, the paslamas have crawled up out of the waves along the whole beach. Each one digs a hole in the sand with her back flippers, lays about a hundred eggs, covers them over, and drags herself back to the sea before dawn. Keep the beach quiet and dark, and in six weeks it will hatch.',
    night: true,
  },
};

export default {
  id: 'chinandega',
  name: 'Nicaragua',
  farm: 'Finca El Guanacaste',
  region: 'Chinandega, Nicaragua',
  blurb: 'A cattle finca running from the slopes of the San Cristóbal volcano down to the Pacific: burned-over pasture where the dry forest was, a bare quebrada, shrimp ponds in the mangroves, and a beach the sea turtles stopped using.',
  campaign: true,
  // no tourists here: the finca pays its way by farming and fishing (and a small conservation grant)
  noVisitors: true, grantScale: 0.35,
  campaignEnd: 'You finished the campaign. Finca El Guanacaste runs from forest on the volcano, through shaded pastures and living fences, to mangroves and a turtle beach, and the herd is healthier for it. Every tool is yours now: keep going as long as you like.',
  image: 'assets/maps/chinandega.jpg',
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
  startView: { x: 60, y: 8, zoom: 0.3 }, // the herd in the paddocks, San Cristóbal behind
  startWildlife: [['cattle', 12, 66, 30, 4], ['cattle', 10, 30, 38, 6], ['ctenosaur', 5, 96, 40, 10], ['urraca', 3, 60, 6, 10], ['armadillo', 2, 14, 4, 6], ['egret', 2, 90, 72, 8],
    ['iguana', 2, 42, 60, 6], ['snapper', 6, 100, 84, 6], ['raccoon', 1, 80, 78, 6], ['chocoyo', 4, 104, 4, 6]],
  startText: 'The dry season, Year 1. The pastures are brown, the cattle crowd under the few shade trees, smoke from the neighbours\' burning drifts down the volcano, and the quebrada is down to a few pools. On the beach, nothing has nested for years.',
  story: `<p><b>A farming cooperative in Chinandega has taken over Finca El Guanacaste</b>, and asked you to help them bring it back. Tropical dry forest once covered these slopes, from the San Cristóbal volcano down to the Pacific. It was cleared for cotton in the 1950s. The dark volcanic soil here is some of the richest in Central America, but decades of pesticides, burning and erosion wore away its top layer; then it became cattle pasture, burned every dry season, with barely a tree left for shade. Shrimp ponds were cut into the mangroves on the coast, and the sea turtles stopped nesting on the beach. The cooperative\'s families raise cattle, and want to keep doing it, in a way that brings the forest, the water and the wildlife back too.</p>`,
  rules: [
    'You don\'t buy animals or upgrades. <b>You build habitat</b>, and wildlife follows its own rules: it comes in from the forest on the volcano, the estuary and the sea when there\'s room, raises young, and moves on when there isn\'t enough.',
    '<b>Rich volcanic soil.</b> The black soil from San Cristóbal\'s ash is naturally fertile. Cover it with plants and shade and it heals quickly; leave it bare and burned and the rains wash it off the slopes.',
    '<b>Two seasons.</b> From May to October it rains; from November to April it hardly rains at all, and most dry-forest trees drop their leaves. Plant at the start of the rains, so young trees have six months to grow roots before the dry season.',
    '<b>The herd</b> belongs here. Cattle do best with trees in the pasture: shade keeps them cool in the dry season and they give more milk, which pays the cooperative every month. This is silvopasture. But cows nibble young trees, so plant in protected corners or behind living fences.',
    '<b>Fire is the enemy of the dry forest.</b> Jaragua and guinea grass dry out every year and burn hot, and pasture is burned every dry season. Firebreaks, fire crews and shade from trees all help.',
    '<b>Living fences</b> of madero negro and jiñocuabo join patches of forest together, so monkeys, birds and seeds can travel between them.',
    '<b>The mangroves</b> are the nursery for the fish, shrimp and conchas negras of the whole coast, and the fishers and cockle gatherers earn more every month as they grow back. Breach the dikes of the old shrimp ponds to let the tide back in, and the mangroves will return largely on their own.',
    '<b>The beach</b> is where olive ridley turtles nest from July to November. They need quiet, dark sand with dune plants behind it, away from trails and buildings.',
    '<b>The finca pays its way.</b> Every month the cooperative sells milk and cheese, and the fishers and cockle gatherers sell fish and conchas negras. Shade in the pasture raises the first, and mangroves raise the second. A small conservation grant helps too.',
  ],
  firstYear: [
    'Plant <b>shade trees</b> through the pastures (guanacaste, genízaro, guácimo) and <b>living fences</b> along the paddock lines, as the rains start in May.',
    'Let the steep ground on the <b>volcano slope</b> go back to <b>dry forest</b>, and pull the <b>jaragua</b> there.',
    'Plant <b>quebrada trees</b> along the stream to shade it.',
    'On the coast, <b>breach a shrimp pond dike</b> (Remove → Demolish) next to the old mangroves, and sow <b>beach plants</b> on the dunes.',
  ],
  toolText: {
    pull: { icon: { plant: 'jaragua' }, desc: 'Pull out jaragua, guinea grass, castor bean and neem seedlings. Native plants are left alone.' },
    marsh: { desc: 'Dig tidal marsh on low, wet ground. Mangroves can grow in it.' },
    demolish: { desc: 'Tear out fences, old buildings, the culvert, or a shrimp pond dike (breaching a dike lets the tide back into the pond).' },
    clear: { desc: 'Strip a tile back to bare soil: jaragua, whatever is on it. Then plant natives.' },
    burn: { desc: 'A careful early burn clears jaragua before it builds up. Keep it well away from young trees.' },
  },
  structureNames: { house: 'Cooperative house', barn: 'Corral and milking shed', silo: 'Water tank', shed: 'Tool shed', tractor: 'Ox cart', parking: 'Visitor parking', center: 'Visitor center' },
  habitatNames: {
    FARM: 'Cattle pasture', INVASIVE: 'Jaragua grass', MEADOW: 'Native grass and flowers', SHRUB: 'Scrub', YOUNG_FOREST: 'Young dry forest',
    MATURE_FOREST: 'Old dry forest', RIPARIAN: 'Streamside forest', MARSH: 'Mangrove and tidal marsh', POND: 'Pond', CREEK: 'Quebrada and channels', RIVER: 'Estuary', BARE: 'Bare ground',
  },
  terrainNames: { PASTURE: 'Pasture', SOIL: 'Bare, burned ground', GRAVEL: 'Beach sand', MUD: 'Mud', MARSH: 'Tidal marsh', POND: 'Shrimp pond', CREEK: 'Quebrada', RIVER: 'Estuary', ROAD: 'Farm road' },

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
    fireCause: ['A neighbour burning pasture for new grass', 'A spark from a passing truck', 'Someone burning trash by the road'],
  },
  seedRain: {
    N: ['guacimo', 'jinocuabo', 'madrono', 'guanacaste', 'cortes', 'ceiba', 'lantana', 'hamelia', 'jaragua'],
    E: ['redmangrove', 'blackmangrove', 'whitemangrove', 'leatherfern', 'guinea', 'neem'],
    W: ['jaragua', 'guinea', 'castor', 'neem'],
    S: ['pescaprae', 'seagrape', 'redmangrove', 'whitemangrove'],
  },
  windSeeds: ['ceiba', 'cortes', 'macuelizo', 'cosmos', 'jaragua'],
  berrySeeds: ['guacimo', 'chilamate', 'jinocuabo', 'lantana', 'hamelia', 'castor', 'neem', 'jicaro'],
  floodSeeds: ['whitemangrove', 'redmangrove', 'chilamate', 'guinea'],
  burnSeeds: ['jaragua', 'jaragua', 'guinea', 'paspalum', 'dormilona', 'cosmos'],

  text: {
    edges: { N: 'the slopes of San Cristóbal to the north', E: 'the mangroves of the estuary to the east', S: 'the estuary and the sea', W: 'the neighbours\' pasture to the west' },
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
    soil: [0.2, 0.17, 0.15], mud: [0.25, 0.22, 0.2],      // young volcanic ash soil: near-black
    sand: true,
    volcano: { x: 60, z: -13 }, borderTint: volcanoTint,                           // San Cristóbal's summit, off the north edge
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
