// Plants of the Pacific lowlands of northwest Nicaragua (the Chinandega map): tropical dry forest,
// mangroves and beach. Local Nicaraguan names are given in each description.
// Months: 0=Mar 1=Apr 2=May 3=Jun 4=Jul 5=Aug 6=Sep 7=Oct 8=Nov 9=Dec 10=Jan 11=Feb
// The dry season runs from November to April: most trees drop their leaves (dryForest: bare from
// December to April, a flush of new green with the first rains in May), and many flower while bare.
// mangrove: a tree that grows in tidal marsh.

export default function buildChinandegaPlants(def, mix, get) {
  const dry = { dryForest: true };
  // ---------- Groundcover ----------
  def({ key: 'jaragua', name: 'Jaragua grass', sci: 'Hyparrhenia rufa', layer: 0, native: false, invasive: true,
    moist: [0.0, 0.75], light: [0.5, 1], grow: 0.03, spread: 0.03, radius: 3, life: 20, compete: 0.7, graze: 0.6, cost: 0,
    look: { type: 'tallgrass', leaf: '#8a9a4a', dry: '#c8a860', ...dry },
    desc: 'INVASIVE. An African pasture grass. It grows head-high, dries out every summer and burns hot, and each fire kills the young trees and lets more jaragua in. Shade from trees is what finally beats it.' });
  def({ key: 'guinea', name: 'Guinea grass', sci: 'Megathyrsus maximus', layer: 0, native: false, invasive: true,
    moist: [0.15, 0.85], light: [0.35, 1], grow: 0.03, spread: 0.025, radius: 2, life: 20, compete: 0.65, graze: 0.7, cost: 0,
    look: { type: 'tallgrass', leaf: '#6a9a48', dry: '#b8a060', ...dry },
    desc: 'INVASIVE. Zacate guinea, another African pasture grass, thick along roads and in old fields. It even grows in part shade.' });
  def({ key: 'paspalum', name: 'Native paspalum', sci: 'Paspalum notatum', layer: 0, moist: [0.1, 0.8], light: [0.45, 1],
    grow: 0.022, spread: 0.022, radius: 2, life: 12, graze: 0.7, cost: 3,
    look: { type: 'grass', leaf: '#7aa050', dry: '#c0a868', ...dry },
    desc: 'Grama. A low native grass that holds the soil on bare ground and feeds deer and iguanas.' });
  def({ key: 'dormilona', name: 'Sensitive plant', sci: 'Mimosa pudica', layer: 0, moist: [0.1, 0.8], light: [0.5, 1],
    grow: 0.028, spread: 0.028, radius: 2, life: 4, nfix: true, cost: 2,
    look: { type: 'forb', leaf: '#6a9a4a', flower: '#e8a0c8', bloom: [3, 4, 5, 6], ...dry },
    desc: 'Dormilona: its leaves fold up when you touch them. A tough little legume that puts nitrogen back into worn-out soil.' });
  def({ key: 'tithonia', name: 'Mexican sunflower', sci: 'Tithonia rotundifolia', layer: 0, moist: [0.05, 0.7], light: [0.6, 1],
    grow: 0.03, spread: 0.028, radius: 3, life: 3, cost: 3,
    look: { type: 'tallforb', leaf: '#5f8a44', flower: '#f06a1e', bloom: [5, 6, 7, 8], ...dry },
    desc: 'Big orange flowers at the end of the rains, full of nectar for butterflies and hummingbirds.' });
  def({ key: 'cosmos', name: 'Yellow cosmos', sci: 'Cosmos sulphureus', layer: 0, moist: [0.0, 0.65], light: [0.6, 1],
    grow: 0.03, spread: 0.03, radius: 2, life: 2, cost: 2,
    look: { type: 'forb', leaf: '#6f9a4a', flower: '#f4a820', bloom: [4, 5, 6, 7, 8], ...dry },
    desc: 'A quick native wildflower for bare, dry ground. Bees and butterflies visit it all through the rainy season.' });
  def({ key: 'salvia', name: 'Tropical sage', sci: 'Salvia coccinea', layer: 0, moist: [0.1, 0.75], light: [0.4, 1],
    grow: 0.024, spread: 0.022, radius: 2, life: 4, cost: 3,
    look: { type: 'forb', leaf: '#5a8a44', flower: '#d8202a', bloom: [3, 4, 5, 6, 7, 8, 9], ...dry },
    desc: 'Scarlet flowers for most of the year, a favorite of hummingbirds.' });
  def({ key: 'heliconia', name: 'Heliconia', sci: 'Heliconia latispatha', layer: 0, moist: [0.55, 1], light: [0.1, 0.8], soil: 0.2,
    grow: 0.018, spread: 0.014, radius: 2, life: 15, cost: 5,
    look: { type: 'heliconia', leaf: '#3f7a3a', flower: '#f07a1a', bloom: [3, 4, 5, 6, 7] },
    desc: 'Platanillo. Big leaves and orange flower spikes in the damp shade along the quebrada.' });
  def({ key: 'pescaprae', name: 'Beach morning glory', sci: 'Ipomoea pes-caprae', layer: 0, moist: [0.0, 0.7], light: [0.6, 1], gravelOK: true,
    grow: 0.03, spread: 0.028, radius: 3, life: 10, cost: 2,
    look: { type: 'forb', leaf: '#4a8a3a', flower: '#d860b0', bloom: [4, 5, 6, 7, 8] },
    desc: 'Riñonina. A vine that runs across the back of the beach and holds the dunes together. The open sand in front, down to the waves, is where the sea turtles nest.' });
  def({ key: 'leatherfern', name: 'Mangrove fern', sci: 'Acrostichum aureum', layer: 0, moist: [0.7, 1], light: [0.2, 1], wetOK: true,
    grow: 0.02, spread: 0.018, radius: 2, life: 20, cost: 3,
    look: { type: 'fern', leaf: '#4a7a3a' },
    desc: 'A giant fern of the salty mud at the edge of the mangroves.' });

  // ---------- Shrubs ----------
  def({ key: 'lantana', name: 'Lantana', sci: 'Lantana camara', layer: 1, moist: [0.0, 0.7], light: [0.45, 1],
    grow: 0.016, spread: 0.016, radius: 3, life: 15, cost: 7,
    look: { type: 'shrub', leaf: '#5a8a44', flower: '#f0902a', bloom: [2, 3, 4, 5, 6, 7], berry: '#2a1e3a', fruit: [6, 7, 8], ...dry },
    desc: 'Cinco negritos. Native here, with clusters of orange-and-yellow flowers that butterflies love, and berries for the birds.' });
  def({ key: 'hamelia', name: 'Firebush', sci: 'Hamelia patens', layer: 1, moist: [0.2, 0.85], light: [0.2, 1],
    grow: 0.016, spread: 0.014, radius: 2, life: 20, cost: 8,
    look: { type: 'shrub', leaf: '#5a8a3e', flower: '#e8401e', bloom: [3, 4, 5, 6, 7, 8], berry: '#1a1410', fruit: [7, 8, 9] },
    desc: 'Coralillo. Red tube flowers nearly all year for hummingbirds, and berries for motmots and tanagers.' });
  def({ key: 'cornizuelo', name: 'Bullhorn acacia', sci: 'Vachellia collinsii', layer: 1, moist: [0.0, 0.6], light: [0.5, 1],
    grow: 0.014, spread: 0.014, radius: 3, life: 25, nfix: true, cost: 7,
    look: { type: 'shrub', leaf: '#7a9a50', flower: '#f0d040', bloom: [11, 0], ...dry },
    desc: 'Cornizuelo. Its big hollow thorns are home to fierce little ants that guard it from anything that tries to eat it.' });
  def({ key: 'seagrape', name: 'Sea grape', sci: 'Coccoloba uvifera', layer: 1, moist: [0.0, 0.7], light: [0.5, 1], gravelOK: true,
    grow: 0.012, spread: 0.01, radius: 3, life: 60, cost: 9,
    look: { type: 'shrub', leaf: '#4a7a3a', berry: '#5a2a5a', fruit: [3, 4] },
    desc: 'Uva de playa. Round, leathery leaves at the top of the beach. It shades the sand and shelters the dunes.' });
  def({ key: 'castor', name: 'Castor bean', sci: 'Ricinus communis', layer: 1, native: false, invasive: true,
    moist: [0.1, 0.85], light: [0.5, 1], grow: 0.022, spread: 0.018, radius: 3, life: 6, compete: 0.6, cost: 0,
    look: { type: 'shrub', leaf: '#5a6a3a', ...dry },
    desc: 'INVASIVE. Higuerilla takes over disturbed ground along roads, corrals and overgrazed pasture. Its seeds are poisonous.' });

  // ---------- Trees ----------
  def({ key: 'guanacaste', name: 'Guanacaste', sci: 'Enterolobium cyclocarpum', layer: 2, moist: [0.1, 0.85], light: [0.5, 1], nfix: true,
    grow: 0.0045, spread: 0.007, radius: 5, life: 250, mast: 1, cost: 22,
    look: { type: 'umbrella', leaf: '#5a8a40', ...dry, deciduous: true, bark: '#6a5a4a' },
    desc: 'Guanacaste or "ear tree", for its ear-shaped seed pods. The biggest shade tree of the Pacific lowlands; its pods feed deer, peccaries and cattle.' });
  def({ key: 'genizaro', name: 'Rain tree', sci: 'Samanea saman', layer: 2, moist: [0.15, 0.85], light: [0.5, 1], nfix: true,
    grow: 0.004, spread: 0.007, radius: 5, life: 200, mast: 0.8, cost: 20,
    look: { type: 'umbrella', leaf: '#4f8a3a', flower: '#e880a8', bloom: [0, 1], bloomTint: 0.25, bark: '#5a4a3a' },
    desc: 'Genízaro. A huge umbrella of a tree whose leaves fold up at night and before rain. Its pink puffball flowers feed bats and moths.' });
  def({ key: 'ceiba', name: 'Ceiba', sci: 'Ceiba pentandra', layer: 2, moist: [0.2, 0.9], light: [0.5, 1],
    grow: 0.0048, spread: 0.006, radius: 6, life: 300, cost: 24,
    look: { type: 'kapok', leaf: '#5f9048', ...dry, deciduous: true, bark: '#9a9a8a' },
    desc: 'The giant of the forest, with its buttress roots. Its flowers open at night for bats, and its seeds float away on silky kapok fluff.' });
  def({ key: 'madrono', name: 'Madroño', sci: 'Calycophyllum candidissimum', layer: 2, moist: [0.05, 0.75], light: [0.4, 1],
    grow: 0.0035, spread: 0.007, radius: 4, life: 150, cost: 20,
    look: { type: 'ash', leaf: '#5a8a44', flower: '#f6f4ea', bloom: [9, 10], bloomTint: 0.6, ...dry, deciduous: true, bark: '#c07a4a' },
    desc: 'The national tree of Nicaragua. It covers itself in white flowers around Christmas, and its orange bark peels away smooth.' });
  def({ key: 'cortes', name: 'Cortez', sci: 'Handroanthus ochraceus', layer: 2, moist: [0.0, 0.7], light: [0.5, 1],
    grow: 0.003, spread: 0.007, radius: 4, life: 150, cost: 20,
    look: { type: 'ipe', leaf: '#5a8a40', flower: '#f4c820', bloom: [11, 0], crownBloom: true, ...dry, deciduous: true, bark: '#6a5a4a' },
    desc: 'Cortés. In the driest weeks of the year, with no leaves at all, it bursts into solid golden yellow flowers for a few days.' });
  def({ key: 'macuelizo', name: 'Pink trumpet tree', sci: 'Tabebuia rosea', layer: 2, moist: [0.1, 0.85], light: [0.45, 1],
    grow: 0.0038, spread: 0.008, radius: 4, life: 100, cost: 18,
    look: { type: 'ipe', leaf: '#5a8a44', flower: '#e88ac8', bloom: [0, 1], crownBloom: true, ...dry, deciduous: true, bark: '#7a6a5a' },
    desc: 'Roble macuelizo. Leafless and covered in pink trumpet flowers in March and April, full of bees and hummingbirds.' });
  def({ key: 'madero', name: 'Quickstick', sci: 'Gliricidia sepium', layer: 2, moist: [0.0, 0.8], light: [0.5, 1], nfix: true,
    grow: 0.007, spread: 0.01, radius: 3, life: 40, cost: 10,
    look: { type: 'leucaena', leaf: '#5f9048', flower: '#f0a0c8', bloom: [10, 11, 0], crownBloom: true, ...dry, deciduous: true, bark: '#8a7a6a' },
    desc: 'Madero negro. Farmers stick cut branches in the ground and they take root as a "living fence". It fixes nitrogen, and its pink flowers bloom in the dry season.' });
  def({ key: 'guacimo', name: 'Guácimo', sci: 'Guazuma ulmifolia', layer: 2, moist: [0.1, 0.85], light: [0.45, 1],
    grow: 0.006, spread: 0.012, radius: 4, life: 60, mast: 0.6, cost: 12,
    look: { type: 'oak', leaf: '#4f8a3a', berry: '#2a1a14', fruit: [9, 10, 11], ...dry, deciduous: true, bark: '#6a5a4a' },
    desc: 'A fast, tough pioneer tree of old pastures. Its hard black fruits feed deer, iguanas and parrots through the dry season.' });
  def({ key: 'jinocuabo', name: 'Gumbo-limbo', sci: 'Bursera simaruba', layer: 2, moist: [0.0, 0.75], light: [0.45, 1],
    grow: 0.005, spread: 0.009, radius: 4, life: 80, cost: 12,
    look: { type: 'balanites', leaf: '#6a9a4a', ...dry, deciduous: true, bark: '#b0603a' },
    desc: 'Jiñocuabo, the "tourist tree", for its red, peeling bark. Its small red fruits feed dozens of kinds of birds.' });
  def({ key: 'jicaro', name: 'Calabash tree', sci: 'Crescentia alata', layer: 2, moist: [0.1, 0.8], light: [0.5, 1],
    grow: 0.004, spread: 0.007, radius: 3, life: 60, cost: 12,
    look: { type: 'commiphora', leaf: '#4f8a3a', berry: '#8aa050', fruit: [9, 10, 11, 0], bark: '#6a6050' },
    desc: 'Jícaro. Its round, hard fruits grow straight out of the trunk; the seeds make the drink semilla de jícaro, and horses crack the fruits open.' });
  def({ key: 'chilamate', name: 'Wild fig', sci: 'Ficus insipida', layer: 2, moist: [0.45, 1], light: [0.3, 1], soil: 0.1,
    grow: 0.005, spread: 0.008, radius: 5, life: 200, cost: 20,
    look: { type: 'fig', leaf: '#3f7a36', berry: '#c8a040', fruit: [2, 6, 10], bark: '#9a9a8a' },
    desc: 'Chilamate. A great fig along the quebrada that stays green all year. Something is always fruiting, and monkeys, bats and parrots come from far away to eat.' });
  def({ key: 'redmangrove', name: 'Red mangrove', sci: 'Rhizophora mangle', layer: 2, moist: [0.75, 1], light: [0.4, 1], wetOK: true, mangrove: true,
    grow: 0.004, spread: 0.009, radius: 3, life: 100, cost: 16,
    look: { type: 'mangrove', leaf: '#2f6a32', bark: '#6a4a3a' },
    desc: 'Mangle rojo. It stands on arching stilt roots in the salt water. Fish, shrimp and crabs grow up among the roots before heading out to sea.' });
  def({ key: 'blackmangrove', name: 'Black mangrove', sci: 'Avicennia germinans', layer: 2, moist: [0.65, 1], light: [0.4, 1], wetOK: true, mangrove: true,
    grow: 0.0045, spread: 0.009, radius: 3, life: 80, cost: 16,
    look: { type: 'alder', leaf: '#4a6a44', bark: '#4a3e34' },
    desc: 'Mangle negro. It grows a little higher on the mud, breathing through thousands of pencil-like roots that poke up out of it.' });
  def({ key: 'whitemangrove', name: 'White mangrove', sci: 'Laguncularia racemosa', layer: 2, moist: [0.6, 1], light: [0.45, 1], wetOK: true, mangrove: true,
    grow: 0.005, spread: 0.01, radius: 3, life: 60, cost: 14,
    look: { type: 'alder', leaf: '#5a8a4a', bark: '#7a6a5a' },
    desc: 'Mangle blanco, the fastest mangrove to grow back on the edge of cleared ponds and mudflats.' });
  def({ key: 'neem', name: 'Neem', sci: 'Azadirachta indica', layer: 2, native: false, invasive: true,
    moist: [0.0, 0.75], light: [0.35, 1], grow: 0.007, spread: 0.012, radius: 4, life: 60, compete: 0.6, cost: 0,
    look: { type: 'mahogany', leaf: '#4f8a3a', bark: '#5a4a3e' },
    desc: 'INVASIVE. Nim, planted from India for shade and medicine, now seeds itself everywhere and shades out the native dry forest.' });

  // ---------- Seed mixes ----------
  for (const m of [
    { key: 'mix_groundcover', name: 'Soil cover', layer: 0, cost: 3, density: 0.8,
      species: ['paspalum', 'dormilona', 'cosmos'],
      desc: 'A low native grass, a nitrogen-fixing legume and a quick wildflower to cover and feed worn-out pasture.' },
    { key: 'mix_flowers', name: 'Butterfly garden', layer: 0, cost: 4, density: 0.8,
      species: ['tithonia', 'cosmos', 'salvia', 'dormilona'],
      desc: 'Native flowers for butterflies, bees and hummingbirds through the rainy season.' },
    { key: 'mix_beach', name: 'Beach plants', layer: 0, cost: 3, density: 0.7,
      species: ['pescaprae'],
      desc: 'Beach morning glory to hold the sand where the sea turtles nest.' },
    { key: 'mix_mangrovefloor', name: 'Mangrove edge', layer: 0, cost: 3, density: 0.7,
      species: ['leatherfern'],
      desc: 'Mangrove fern for the salty mud at the edge of the mangroves.' },
    { key: 'mix_shrubs', name: 'Dry forest shrubs', layer: 1, cost: 8, density: 0.45,
      species: ['lantana', 'hamelia', 'cornizuelo'],
      desc: 'Flowering, fruiting native shrubs for cover and food.' },
    { key: 'mix_livingfence', name: 'Living fence', layer: 2, cost: 10, density: 0.6,
      species: ['madero', 'jinocuabo'],
      desc: 'Madero negro and jiñocuabo, the trees Nicaraguan farmers plant as living fences. They join patches of forest together like a hedge.' },
    { key: 'mix_dryforest', name: 'Dry forest', layer: 2, cost: 18, density: 0.3,
      species: ['guacimo', 'guanacaste', 'genizaro', 'madrono', 'cortes', 'macuelizo', 'jicaro', 'ceiba'],
      desc: 'The trees of the tropical dry forest: guanacaste, genízaro, madroño, cortés and ceiba, with fast guácimo to shade out the grass.' },
    { key: 'mix_riverside', name: 'Quebrada trees', layer: 2, cost: 20, density: 0.3,
      species: ['chilamate', 'ceiba', 'genizaro'],
      desc: 'Evergreen figs and big trees for the banks of the quebrada.' },
    { key: 'mix_mangrove', name: 'Mangroves', layer: 2, cost: 16, density: 0.35,
      species: ['redmangrove', 'blackmangrove', 'whitemangrove'],
      desc: 'Red, black and white mangroves for the tidal marsh and mud. Each finds the level of water that suits it.' },
  ]) mix(m);

  // behaviour flags the simulation reads (fire, floods, seed dispersal, nectar)
  for (const k of ['whitemangrove', 'guacimo', 'madero']) get(k).gravelOK = true;
  for (const k of ['madero', 'jinocuabo']) get(k).fencePost = true; // living fences: planted as posts in the wire
  for (const k of ['castor', 'neem', 'lantana', 'hamelia', 'guacimo', 'chilamate', 'jinocuabo']) get(k).birdSpread = true;
  for (const k of ['lantana', 'hamelia', 'cornizuelo', 'madero', 'guacimo', 'jaragua', 'guinea']) get(k).resprout = true;
  Object.entries({ guanacaste: 0.8, genizaro: 0.7, ceiba: 0.6, madrono: 0.6, cortes: 0.7, macuelizo: 0.5, guacimo: 0.6, jinocuabo: 0.5, jicaro: 0.7, madero: 0.6 })
    .forEach(([k, v]) => { get(k).fireSurvival = v; });
  get('jaragua').fuel = 1.6; get('guinea').fuel = 1.3;
  for (const k of ['pescaprae', 'seagrape']) get(k).dune = true; // dune plants: the back of the beach only, never the open sand by the waves
  get('ceiba').nectar = { months: [9, 10], amount: 0.5 };                           // night flowers for bats
  get('genizaro').nectar = { months: [0, 1], amount: 0.4 };
  get('madero').nectar = { months: [10, 11, 0], amount: 0.5 };
  get('cortes').nectar = { months: [11, 0], amount: 0.5 };
  get('macuelizo').nectar = { months: [0, 1], amount: 0.5 };
  get('madrono').nectar = { months: [9, 10], amount: 0.3 };
}
