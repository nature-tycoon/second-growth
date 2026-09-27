// Serengeti plant species (the Enkare map): a communal grazing range on the edge of the
// Serengeti, Tanzania, where too many cattle for too long have stripped the grass and left
// bare, crusted soil. Invasive famine weed, prickly pear and mesquite fill the gaps.
// Months: 0=Mar 1=Apr 2=May 3=Jun 4=Jul 5=Aug 6=Sep 7=Oct 8=Nov 9=Dec 10=Jan 11=Feb
// Long rains Mar–May, long dry season Jun–Oct, short rains Nov–Dec, a short dry spell Jan–Feb.

export default function buildSerengetiPlants(def, mix, get) {
  // ---------- Groundcover ----------
  def({ key: 'parthenium', name: 'Famine weed', sci: 'Parthenium hysterophorus', layer: 0, native: false, invasive: true,
    moist: [0.05, 0.8], light: [0.4, 1], grow: 0.034, spread: 0.034, radius: 3, life: 3, compete: 0.45, graze: 0.05, cost: 0,
    look: { type: 'tallforb', leaf: '#7f9a52', flower: '#f4f2e6', bloom: [0, 1, 8, 9] },
    desc: 'INVASIVE. A fast American weed that takes over bare, overgrazed ground. Cattle and wildlife won\'t eat it, and it poisons the soil for grasses.' });
  def({ key: 'sodomapple', name: 'Sodom apple', sci: 'Solanum incanum', layer: 0,
    moist: [0.05, 0.7], light: [0.5, 1], soil: 0.06, soilK: 10, grow: 0.02, spread: 0.018, radius: 2, life: 4, graze: 0.1, cost: 2, weedy: true,
    look: { type: 'forb', leaf: '#8a9a6a', flower: '#a88ad0', bloom: [0, 1], berry: '#e8c02a', fruit: [2, 3, 4] },
    desc: 'A spiny native weed of trampled ground, with little yellow "apples". It thrives where grazing has been too heavy, and fades as grass comes back.' });
  def({ key: 'sporobolus', name: 'Rat\'s-tail dropseed', sci: 'Sporobolus pyramidalis', layer: 0,
    moist: [0.03, 0.75], light: [0.5, 1], soil: 0.09, soilK: 12, pioneer: 0.2, grow: 0.016, spread: 0.01, radius: 3, life: 8, graze: 0.4, cost: 2,
    look: { type: 'grass', leaf: '#8aa05a', dry: '#c8b078' },
    desc: 'A tough, wiry native grass that will grow on the poorest crusted soil. The first grass back on bare ground.' });
  def({ key: 'stargrass', name: 'Star grass', sci: 'Cynodon dactylon', layer: 0,
    moist: [0.08, 0.85], light: [0.45, 1], soil: 0.12, soilK: 8, pioneer: 0.32, grow: 0.022, spread: 0.024, radius: 2, life: 10, graze: 1, cost: 3,
    look: { type: 'grass', leaf: '#7fa04a', dry: '#c0b070' },
    desc: 'A creeping, sweet grass that knits bare soil together. Zebra, wildebeest and gazelles all graze it hard.' });
  def({ key: 'finger', name: 'Finger grass', sci: 'Digitaria macroblephara', layer: 0,
    moist: [0.1, 0.75], light: [0.5, 1], soil: 0.18, soilK: 8, grow: 0.02, spread: 0.02, radius: 2, life: 10, graze: 1, cost: 3,
    look: { type: 'grass', leaf: '#8aa850', dry: '#d0b87a' },
    desc: 'The short grass of the southern Serengeti plains. Wildebeest time their calving to its fresh growth.' });
  def({ key: 'redoat', name: 'Red oat grass', sci: 'Themeda triandra', layer: 0,
    moist: [0.12, 0.8], light: [0.45, 1], soil: 0.28, grow: 0.018, spread: 0.022, radius: 2, life: 15, compete: 0.6, graze: 0.8, cost: 4,
    look: { type: 'tallgrass', leaf: '#8a9a4a', dry: '#b8703a' },
    desc: 'The tall grass of a healthy Serengeti, turning rust-red in the dry season. It only comes back once the soil has recovered.' });
  def({ key: 'indigofera', name: 'Wild indigo', sci: 'Indigofera arrecta', layer: 0, nfix: true,
    moist: [0.08, 0.75], light: [0.45, 1], grow: 0.022, spread: 0.02, radius: 2, life: 5, cost: 3,
    look: { type: 'forb', leaf: '#6f9048', flower: '#d8508a', bloom: [1, 2, 9] },
    desc: 'A native legume that fixes nitrogen and puts life back into worn-out soil. Its pink flowers feed bees.' });
  def({ key: 'crotalaria', name: 'Rattlepod', sci: 'Crotalaria laburnifolia', layer: 0, nfix: true,
    moist: [0.05, 0.7], light: [0.5, 1], grow: 0.024, spread: 0.022, radius: 2, life: 4, cost: 3,
    look: { type: 'tallforb', leaf: '#7a9a50', flower: '#f0c828', bloom: [1, 2, 8, 9] },
    desc: 'Tall yellow pea-flowers after the rains. Another soil-builder: grasses grow back faster wherever it has been.' });
  def({ key: 'fireball', name: 'Fireball lily', sci: 'Scadoxus multiflorus', layer: 0,
    moist: [0.2, 0.85], light: [0.2, 0.9], soil: 0.2, grow: 0.012, spread: 0.01, radius: 2, life: 12, cost: 7,
    look: { type: 'skunk', leaf: '#5a8a44', flower: '#e8402a', bloom: [8, 9] },
    desc: 'A scarlet globe of flowers that pops up with the short rains, in the shade of thornbush and trees.' });
  def({ key: 'papyrus', name: 'Papyrus', sci: 'Cyperus papyrus', layer: 0, wetOK: true,
    moist: [0.7, 1], light: [0.3, 1], grow: 0.025, spread: 0.02, radius: 2, life: 12, cost: 4,
    look: { type: 'sedge', leaf: '#6a9a45', dry: '#a0a060' },
    desc: 'Tall green sedge with feather-duster heads, lining swamps and river pools. Hippos wallow in it.' });
  def({ key: 'bluelily', name: 'Blue water lily', sci: 'Nymphaea nouchali', layer: 0, aquatic: true,
    moist: [0.9, 1], light: [0.6, 1], grow: 0.02, spread: 0.016, radius: 2, life: 8, cost: 6,
    look: { type: 'lily', leaf: '#4f8a3f', flower: '#8a9ae8', bloom: [0, 1, 2, 8, 9], small: true },
    desc: 'Floating pads and pale blue flowers on the waterholes that last into the dry season.' });

  // ---------- Shrubs ----------
  def({ key: 'whistling', name: 'Whistling thorn', sci: 'Vachellia drepanolobium', layer: 1, nfix: true,
    moist: [0.08, 0.8], light: [0.45, 1], soil: 0.1, grow: 0.012, spread: 0.012, radius: 3, life: 40, browse: 0.2, cost: 8,
    look: { type: 'broom', leaf: '#6a8a48' },
    desc: 'A thorny acacia bush with swollen hollow galls that whistle in the wind. Ants live in the galls and drive off elephants.' });
  def({ key: 'croton', name: 'Croton', sci: 'Croton dichogamus', layer: 1,
    moist: [0.1, 0.8], light: [0.3, 1], soil: 0.12, grow: 0.014, spread: 0.014, radius: 3, life: 30, browse: 0.3, cost: 8,
    look: { type: 'shrub', leaf: '#5f8a4a' },
    desc: 'A dense, aromatic shrub of kopjes and gullies. Its shade shelters the first grass seedlings from the sun.' });
  def({ key: 'grewia', name: 'Raisin bush', sci: 'Grewia bicolor', layer: 1,
    moist: [0.1, 0.8], light: [0.35, 1], soil: 0.12, grow: 0.013, spread: 0.012, radius: 3, life: 30, browse: 0.4, cost: 9,
    look: { type: 'shrub', leaf: '#6a904a', flower: '#f0d040', bloom: [9, 10], berry: '#a85a2a', fruit: [11, 0] },
    desc: 'Small sweet berries that birds, baboons and people all eat. Browsed hard by giraffe and impala.' });
  def({ key: 'aloe', name: 'Serengeti aloe', sci: 'Aloe secundiflora', layer: 1,
    moist: [0.02, 0.6], light: [0.5, 1], grow: 0.009, spread: 0.008, radius: 2, life: 30, browse: 0.05, cost: 7,
    look: { type: 'aloe', leaf: '#7a9a6a', flower: '#e8502a', bloom: [4, 5, 6] },
    desc: 'A succulent rosette that flowers in the heart of the dry season, when little else is blooming. Sunbirds depend on it.' });
  def({ key: 'lantana', name: 'Lantana', sci: 'Lantana camara', layer: 1, native: false, invasive: true,
    moist: [0.15, 0.85], light: [0.3, 1], grow: 0.02, spread: 0.008, radius: 4, life: 25, compete: 0.6, browse: 0, cost: 0,
    look: { type: 'bramble', leaf: '#4f7a3e', flower: '#f09a3a', bloom: [0, 1, 2, 8, 9], berry: '#2a2a3a', fruit: [3, 4] },
    desc: 'INVASIVE. A pretty garden shrub from the Americas that forms thickets along gullies and streams. Poisonous to cattle and wildlife.' });
  def({ key: 'pricklypear', name: 'Prickly pear', sci: 'Opuntia stricta', layer: 1, native: false, invasive: true,
    moist: [0.0, 0.7], light: [0.45, 1], grow: 0.014, spread: 0.007, radius: 4, life: 40, compete: 0.6, browse: 0, cost: 0,
    look: { type: 'cactus', leaf: '#6a9a5a', flower: '#f0d040', bloom: [0, 1], berry: '#a83a5a', fruit: [2, 3] },
    desc: 'INVASIVE. A cactus from the Americas planted as a hedge. Baboons and elephants spread its fruit, and its spines injure the animals that eat it.' });

  // ---------- Trees ----------
  def({ key: 'umbrella', name: 'Umbrella thorn', sci: 'Vachellia tortilis', layer: 2, nfix: true,
    moist: [0.03, 0.75], light: [0.45, 1], grow: 0.006, spread: 0.009, radius: 5, life: 150, matureAge: 16, cost: 18,
    look: { type: 'umbrella', leaf: '#6a8a42', bark: '#4a3a2e', flower: '#f4f0d8', bloom: [8, 9] },
    desc: 'The flat-topped acacia of every Serengeti sunset. Giraffe browse it, weavers nest in it, and its nitrogen-rich shade grows the best grass.' });
  def({ key: 'fevertree', name: 'Fever tree', sci: 'Vachellia xanthophloea', layer: 2, nfix: true, wetOK: false,
    moist: [0.45, 1], light: [0.45, 1], grow: 0.008, spread: 0.009, radius: 4, life: 80, matureAge: 14, cost: 20,
    look: { type: 'fevertree', leaf: '#8aa850', bark: '#d8c860' },
    desc: 'An acacia with glowing lime-yellow bark, growing where the water table is high. Early travellers blamed it for malaria (it was the mosquitoes).' });
  def({ key: 'balanites', name: 'Desert date', sci: 'Balanites aegyptiaca', layer: 2,
    moist: [0.03, 0.7], light: [0.4, 1], grow: 0.0055, spread: 0.008, radius: 5, life: 120, matureAge: 14, cost: 16,
    look: { type: 'balanites', leaf: '#5f7a44', bark: '#6a5a48', berry: '#d8a040', fruit: [4, 5, 6] },
    desc: 'A spiny, drought-proof tree whose sticky dates feed elephants, baboons and people. Elephants spread its seeds in their dung.' });
  def({ key: 'commiphora', name: 'Corkwood', sci: 'Commiphora africana', layer: 2,
    moist: [0.02, 0.6], light: [0.5, 1], grow: 0.006, spread: 0.008, radius: 4, life: 80, matureAge: 12, cost: 14,
    look: { type: 'commiphora', leaf: '#7a8a48', bark: '#8a8a70' },
    desc: 'A small, peeling-barked myrrh tree of the driest ground. Cuttings root easily, so it\'s used for living fences.' });
  def({ key: 'baobab', name: 'Baobab', sci: 'Adansonia digitata', layer: 2,
    moist: [0.05, 0.7], light: [0.45, 1], soil: 0.1, grow: 0.0025, spread: 0.005, radius: 6, life: 1500, matureAge: 25, mast: 0.8, cost: 32,
    look: { type: 'baobab', leaf: '#6a8a4a', bark: '#a89080', flower: '#f4f0e0', bloom: [9, 10] },
    desc: 'A swollen giant that can live over a thousand years and store tonnes of water in its trunk. Bats pollinate its night flowers.' });
  def({ key: 'sausage', name: 'Sausage tree', sci: 'Kigelia africana', layer: 2,
    moist: [0.35, 0.95], light: [0.35, 1], soil: 0.15, grow: 0.0045, spread: 0.007, radius: 5, life: 200, matureAge: 14, cost: 26,
    look: { type: 'sausage', leaf: '#4a7a3a', bark: '#7a6a58', flower: '#8a2a3a', bloom: [5, 6], berry: '#8a7a50', fruit: [8, 9, 10] },
    desc: 'Hangs enormous sausage-shaped fruit on long ropes. Hippos, giraffe and elephants eat the fallen fruit.' });
  def({ key: 'sycamorefig', name: 'Sycamore fig', sci: 'Ficus sycomorus', layer: 2,
    moist: [0.4, 0.95], light: [0.3, 1], soil: 0.15, grow: 0.005, spread: 0.008, radius: 5, life: 300, matureAge: 12, mast: 0.6, cost: 24,
    look: { type: 'fig', leaf: '#3f7a44', bark: '#b8a888', berry: '#c8604a', fruit: [1, 2, 7, 8] },
    desc: 'A spreading riverbank giant that fruits several times a year, feeding hornbills, monkeys and fruit bats.' });
  def({ key: 'euphorbia', name: 'Candelabra tree', sci: 'Euphorbia candelabrum', layer: 2,
    moist: [0.0, 0.55], light: [0.5, 1], grow: 0.004, spread: 0.005, radius: 4, life: 200, matureAge: 16, cost: 22,
    look: { type: 'euphorbia', leaf: '#5a8a4a', bark: '#6a7a50' },
    desc: 'A giant succulent shaped like a candelabra, growing out of the granite kopjes. Its milky sap is poisonous.' });
  def({ key: 'mesquite', name: 'Mesquite', sci: 'Prosopis juliflora', layer: 2, native: false, invasive: true, nfix: true,
    moist: [0.0, 0.8], light: [0.45, 1], grow: 0.011, spread: 0.007, radius: 4, life: 60, matureAge: 99, compete: 0.6, cost: 0,
    look: { type: 'mesquite', leaf: '#7a9a4a', bark: '#5a4a3a' },
    desc: 'INVASIVE. Planted to stop the desert spreading, it spread instead: impenetrable thorn thickets that drink the groundwater and crowd out grass.' });

  // ---------- Seed mixes ----------
  for (const m of [
    { key: 'mix_pioneers_s', name: 'Soil builders', layer: 0, cost: 3, density: 0.7,
      species: ['sporobolus', 'indigofera', 'crotalaria'],
      desc: 'Tough grass and nitrogen-fixing legumes that will take on bare, crusted ground and feed the soil for what follows.' },
    { key: 'mix_regrass', name: 'Savanna grass seed', layer: 0, cost: 4, density: 0.7,
      species: ['stargrass', 'finger', 'redoat', 'sporobolus'],
      desc: 'Native grasses for recovering rangeland. Red oat grass only takes hold once the soil has come back.' },
    { key: 'mix_wildflowers', name: 'Savanna wildflowers', layer: 0, cost: 5, density: 0.6,
      species: ['fireball', 'indigofera', 'crotalaria'],
      desc: 'Flowers for bees and butterflies after the rains.' },
    { key: 'mix_wetland_s', name: 'Waterhole plants', layer: 0, cost: 4, density: 0.7,
      species: ['papyrus', 'bluelily'],
      desc: 'Papyrus and water lilies for waterholes, swamps and river pools.' },
    { key: 'mix_thornscrub', name: 'Thornbush', layer: 1, cost: 8, density: 0.4,
      species: ['whistling', 'croton', 'grewia'],
      desc: 'Thorny shrubs that shelter grass seedlings from grazing and give birds and small animals cover.' },
    { key: 'mix_acacia', name: 'Acacia woodland', layer: 2, cost: 16, density: 0.28,
      species: ['umbrella', 'balanites', 'commiphora'],
      desc: 'The drought-hardy trees of the open savanna. Grass grows greener in their shade.' },
    { key: 'mix_riverine', name: 'Riverine trees', layer: 2, cost: 22, density: 0.28,
      species: ['fevertree', 'sycamorefig', 'sausage'],
      desc: 'Trees for the river, seasonal streams and waterholes, where the water table is high.' },
    { key: 'mix_giants', name: 'Savanna giants', layer: 2, cost: 30, density: 0.18,
      species: ['baobab', 'euphorbia', 'umbrella'],
      desc: 'The long game: baobabs and candelabra trees that will outlive everyone who plants them.' },
  ]) mix(m);

  // behaviour flags the simulation reads
  for (const k of ['commiphora', 'euphorbia', 'aloe']) get(k).gravelOK = true; // kopje succulents root even in hardpan
  for (const k of ['redoat', 'stargrass', 'finger', 'sporobolus', 'whistling', 'croton', 'grewia', 'aloe', 'lantana']) get(k).resprout = true; // savanna plants shrug off fire
  Object.entries({ baobab: 0.9, umbrella: 0.7, balanites: 0.7, euphorbia: 0.6, fevertree: 0.5, commiphora: 0.5, sycamorefig: 0.4, sausage: 0.5, mesquite: 0.6 })
    .forEach(([k, v]) => { get(k).fireSurvival = v; });
  get('redoat').fuel = 1.2; get('lantana').fuel = 1.1;
  get('aloe').nectar = { months: [4, 5, 6], amount: 0.6 };
  get('umbrella').nectar = { months: [8, 9], amount: 0.4 };
  get('indigofera').nectar = { months: [1, 2, 9], amount: 0.4 };
  get('balanites').disperser = 'elephant';                                               // mostly spread in elephant dung
  // savanna plants: grasses and herbs cure gold through the long dry season; trees keep their leaves
  for (const k of ['parthenium', 'sodomapple', 'sporobolus', 'stargrass', 'finger', 'redoat', 'indigofera', 'crotalaria', 'fireball', 'papyrus', 'bluelily',
    'whistling', 'croton', 'grewia', 'aloe', 'lantana', 'pricklypear', 'umbrella', 'fevertree', 'balanites', 'commiphora', 'baobab', 'sausage', 'sycamorefig',
    'euphorbia', 'mesquite']) get(k).look.savanna = true;
}
