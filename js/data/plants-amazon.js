// Amazon plant species (the Fazenda Esperança map): a cattle ranch cut from rainforest in
// southern Pará, Brazil. The pasture grass the ranchers planted is now the invasive to beat.
// Months: 0=Mar 1=Apr 2=May 3=Jun 4=Jul 5=Aug 6=Sep 7=Oct 8=Nov 9=Dec 10=Jan 11=Feb
// Wet season Dec–Apr, dry season Jun–Sep.

export default function buildAmazonPlants(def, mix, get) {
  // ---------- Groundcover ----------
  def({ key: 'brachiaria', name: 'Signal grass (braquiária)', sci: 'Urochloa brizantha', layer: 0, native: false, invasive: true,
    moist: [0.08, 0.88], light: [0.45, 1], grow: 0.032, spread: 0.032, radius: 3, life: 30, compete: 0.9, graze: 1, cost: 0,
    look: { type: 'tallgrass', leaf: '#8fae4a', dry: '#c9b56a' },
    desc: 'INVASIVE. The African pasture grass planted across the Amazon for cattle. It chokes out tree seedlings and burns hot every dry season, but it cannot survive in shade.' });
  def({ key: 'guinea', name: 'Guinea grass (colonião)', sci: 'Megathyrsus maximus', layer: 0, native: false, invasive: true,
    moist: [0.1, 0.85], light: [0.4, 1], grow: 0.028, spread: 0.022, radius: 3, life: 25, compete: 0.8, graze: 0.9, cost: 0,
    look: { type: 'tallgrass', leaf: '#7ea445', dry: '#cdb872' },
    desc: 'INVASIVE. Head-high African grass that turns old pastures into a fire trap in the dry season.' });
  def({ key: 'andropogon', name: 'Broomsedge (rabo-de-burro)', sci: 'Andropogon bicornis', layer: 0,
    moist: [0.05, 0.75], light: [0.5, 1], grow: 0.02, spread: 0.022, radius: 2, life: 10, graze: 0.5, cost: 3,
    look: { type: 'grass', leaf: '#9bb06a', dry: '#c8a868' },
    desc: 'A native bunchgrass of open ground. Holds bare soil while forest seedlings get going, and lets them through.' });
  def({ key: 'mimosa', name: 'Sensitive plant', sci: 'Mimosa pudica', layer: 0, nfix: true,
    moist: [0.1, 0.8], light: [0.5, 1], grow: 0.024, spread: 0.024, radius: 2, life: 5, cost: 3,
    look: { type: 'forb', leaf: '#6f9a4a', flower: '#f08ac8', bloom: [7, 8, 9, 10] },
    desc: 'Its leaves fold shut when touched. A native pioneer that fixes nitrogen in worn-out pasture soil.' });
  def({ key: 'costus', name: 'Spiral ginger', sci: 'Costus scaber', layer: 0,
    moist: [0.45, 0.95], light: [0.1, 0.7], soil: 0.2, grow: 0.015, spread: 0.014, radius: 2, life: 12, cost: 6,
    look: { type: 'skunk', leaf: '#4f8a3a', flower: '#e8503a', bloom: [9, 10, 11] },
    desc: 'Spiralling stems and red flower cones in the damp understory. Hummingbirds work every bloom.' });
  def({ key: 'calathea', name: 'Prayer plant', sci: 'Calathea lutea', layer: 0,
    moist: [0.4, 0.95], light: [0.0, 0.55], soil: 0.3, grow: 0.012, spread: 0.012, radius: 2, life: 15, cost: 7,
    look: { type: 'skunk', leaf: '#3f7a44', flower: '#e8d24a', bloom: [0, 1] },
    desc: 'Broad, waxy leaves of the deep forest floor. Its leaves were used to wrap food and thatch roofs.' });
  def({ key: 'adiantum', name: 'Maidenhair fern', sci: 'Adiantum latifolium', layer: 0,
    moist: [0.45, 1], light: [0.0, 0.6], soil: 0.25, grow: 0.015, spread: 0.014, radius: 2, life: 15, cost: 6,
    look: { type: 'fern', leaf: '#4a8a4a' },
    desc: 'Delicate fronds that only return once the canopy closes and the soil stays moist.' });
  def({ key: 'cyperus', name: 'Giant sedge', sci: 'Cyperus giganteus', layer: 0, wetOK: true,
    moist: [0.7, 1], light: [0.3, 1], grow: 0.025, spread: 0.02, radius: 2, life: 12, cost: 4,
    look: { type: 'sedge', leaf: '#5f8f45', dry: '#9a9a5a' },
    desc: 'Tall papyrus-like sedge of floodplain marshes. Capybaras graze its shoots.' });
  def({ key: 'waterlily', name: 'Giant water lily', sci: 'Victoria amazonica', layer: 0, aquatic: true,
    moist: [0.9, 1], light: [0.6, 1], grow: 0.02, spread: 0.014, radius: 2, life: 8, cost: 8,
    look: { type: 'lily', leaf: '#4f8a3f', flower: '#f4eef0', bloom: [0, 1, 10, 11] },
    desc: 'Pads up to three meters across, strong enough to hold a child. Its flowers open white and blush pink by the second night.' });
  def({ key: 'hyacinth', name: 'Water hyacinth', sci: 'Eichhornia azurea', layer: 0, aquatic: true,
    moist: [0.88, 1], light: [0.5, 1], grow: 0.03, spread: 0.028, radius: 2, life: 5, cost: 3,
    look: { type: 'lily', leaf: '#4f9a4a', flower: '#9a7ae0', bloom: [9, 10, 11, 0], small: true },
    desc: 'Floating rafts of lavender flowers on still water. Fish shelter and spawn among its roots.' });

  // ---------- Shrubs ----------
  def({ key: 'heliconia', name: 'Lobster-claw heliconia', sci: 'Heliconia rostrata', layer: 1,
    moist: [0.4, 1], light: [0.25, 0.9], soil: 0.15, grow: 0.012, spread: 0.012, radius: 2, life: 20, cost: 9,
    look: { type: 'heliconia', leaf: '#3f8a3e', flower: '#e03a2a', bloom: [9, 10, 11, 0, 1] },
    desc: 'Paddle leaves and hanging red-and-yellow bracts, built for hummingbird bills.' });
  def({ key: 'piper', name: 'Spiked pepper', sci: 'Piper aduncum', layer: 1,
    moist: [0.3, 0.9], light: [0.4, 1], grow: 0.018, spread: 0.02, radius: 3, life: 12, browse: 0.3, cost: 7,
    look: { type: 'shrub', leaf: '#4f8a44', berry: '#e8e0b0', fruit: [10, 11] },
    desc: 'A fast pioneer shrub of clearings. Fruit bats eat its catkin-like fruit and scatter the seeds.' });
  def({ key: 'psychotria', name: 'Hot lips', sci: 'Psychotria poeppigiana', layer: 1,
    moist: [0.4, 0.95], light: [0.05, 0.7], soil: 0.2, grow: 0.01, spread: 0.01, radius: 2, life: 15, cost: 9,
    look: { type: 'salal', leaf: '#3f7a3e', flower: '#e8284a', bloom: [8, 9] },
    desc: 'Bright red lip-shaped bracts in the shady understory. A sure sign the forest is coming back.' });
  def({ key: 'cacao', name: 'Cacao', sci: 'Theobroma cacao', layer: 1,
    moist: [0.45, 0.9], light: [0.1, 0.65], soil: 0.3, grow: 0.008, spread: 0.008, radius: 2, life: 60, mast: 0.4, cost: 12,
    look: { type: 'shrub', leaf: '#3f7040', berry: '#e0902a', fruit: [2, 3, 4] },
    desc: 'Chocolate starts here: a native understory tree whose pods grow straight from the trunk. Monkeys raid them.' });
  def({ key: 'guadua', name: 'Guadua bamboo', sci: 'Guadua weberbaueri', layer: 1,
    moist: [0.4, 1], light: [0.4, 1], grow: 0.02, spread: 0.012, radius: 3, life: 30, compete: 0.5, cost: 8,
    look: { type: 'bamboo', leaf: '#8aa84a' },
    desc: 'Giant native bamboo. Grows metres a month and fills gaps fast, sometimes too fast.' });
  def({ key: 'vismia', name: 'Lacre', sci: 'Vismia guianensis', layer: 1,
    moist: [0.15, 0.8], light: [0.55, 1], grow: 0.02, spread: 0.018, radius: 3, life: 20, cost: 6,
    look: { type: 'shrub', leaf: '#6a8a3a', flower: '#f0e0a0', bloom: [6, 7] },
    desc: 'The classic pioneer of abandoned Amazon pastures, with rusty leaves and orange sap. It shades out grass.' });

  // ---------- Trees ----------
  def({ key: 'cecropia', name: 'Embaúba (cecropia)', sci: 'Cecropia pachystachya', layer: 2,
    moist: [0.25, 0.95], light: [0.6, 1], grow: 0.01, spread: 0.014, radius: 6, life: 25, matureAge: 99, cost: 14,
    look: { type: 'cecropia', leaf: '#8ab06a', bark: '#d8d4c4' },
    desc: 'The first tree up in any clearing: pale trunk and giant umbrella leaves. Sloths love it, and ants guard it.' });
  def({ key: 'inga', name: 'Ice-cream bean (ingá)', sci: 'Inga edulis', layer: 2, nfix: true,
    moist: [0.3, 0.95], light: [0.45, 1], grow: 0.008, spread: 0.01, radius: 4, life: 40, matureAge: 30, mast: 0.5, cost: 16,
    look: { type: 'inga', leaf: '#4f8a3e', bark: '#8a7a64', berry: '#e8e4c8', fruit: [8, 9] },
    desc: 'Fixes nitrogen, shades out grass fast, and its sweet pods feed monkeys and people. A restoration workhorse.' });
  def({ key: 'balsa', name: 'Balsa', sci: 'Ochroma pyramidale', layer: 2,
    moist: [0.25, 0.9], light: [0.65, 1], grow: 0.011, spread: 0.012, radius: 6, life: 30, matureAge: 99, cost: 14,
    look: { type: 'balsa', leaf: '#7aa05a', bark: '#c8c0b0' },
    desc: 'Among the fastest-growing trees on Earth, with wood lighter than cork. Its night flowers feed bats.' });
  def({ key: 'acai', name: 'Açaí palm', sci: 'Euterpe oleracea', layer: 2, wetOK: true,
    moist: [0.55, 1], light: [0.2, 1], grow: 0.006, spread: 0.01, radius: 4, life: 60, matureAge: 10, cost: 18,
    look: { type: 'palm', leaf: '#4f7a3a', bark: '#8a8070', berry: '#3a1a3a', fruit: [4, 5, 6, 7] },
    desc: 'Clumps of slender palms on flooded ground. Toucans, macaws and people all come for the purple fruit.' });
  def({ key: 'buriti', name: 'Buriti palm', sci: 'Mauritia flexuosa', layer: 2, wetOK: true,
    moist: [0.65, 1], light: [0.5, 1], grow: 0.004, spread: 0.006, radius: 4, life: 100, matureAge: 14, mast: 0.4, cost: 22,
    look: { type: 'fanpalm', leaf: '#6a8a3a', bark: '#7a6a50' },
    desc: 'The "tree of life" of Amazon swamps. Dead buriti trunks are where scarlet macaws nest.' });
  def({ key: 'brazilnut', name: 'Brazil nut (castanheira)', sci: 'Bertholletia excelsa', layer: 2,
    moist: [0.2, 0.8], light: [0.35, 1], soil: 0.25, grow: 0.0032, spread: 0.008, radius: 5, life: 500, matureAge: 16, mast: 1, cost: 30,
    look: { type: 'emergent', leaf: '#3f6a38', bark: '#8a7a6a' },
    desc: 'A 50 m giant, protected by law, so ranchers left some standing in pasture. Only agoutis can open its pods and plant the seeds.' });
  def({ key: 'kapok', name: 'Kapok (samaúma)', sci: 'Ceiba pentandra', layer: 2,
    moist: [0.35, 0.95], light: [0.5, 1], soil: 0.2, grow: 0.0042, spread: 0.007, radius: 8, life: 300, matureAge: 14, cost: 28,
    look: { type: 'kapok', leaf: '#5a8a44', bark: '#b8b0a0' },
    desc: 'The queen of the forest, with a buttressed trunk and a crown above the canopy. Its seeds float away on cotton.' });
  def({ key: 'mahogany', name: 'Big-leaf mahogany', sci: 'Swietenia macrophylla', layer: 2,
    moist: [0.25, 0.85], light: [0.25, 1], soil: 0.25, grow: 0.0034, spread: 0.006, radius: 4, life: 250, matureAge: 14, cost: 30,
    look: { type: 'mahogany', leaf: '#3f6a3a', bark: '#7a5a44' },
    desc: 'Logged almost to extinction for its red timber. Replanting it rebuilds the canopy for the long run.' });
  def({ key: 'ipe', name: 'Pink ipê', sci: 'Handroanthus impetiginosus', layer: 2,
    moist: [0.1, 0.75], light: [0.4, 1], soil: 0.15, grow: 0.0036, spread: 0.008, radius: 5, life: 200, matureAge: 14, cost: 26,
    look: { type: 'ipe', leaf: '#4a7a3a', flower: '#e87ab8', bloom: [4, 5], crownBloom: true, bark: '#6a5a48' },
    desc: 'Bursts into solid pink in the dry season, when its leaves are gone. Bees and hummingbirds swarm it.' });
  def({ key: 'fig', name: 'Strangler fig', sci: 'Ficus insipida', layer: 2,
    moist: [0.3, 0.95], light: [0.3, 1], soil: 0.15, grow: 0.005, spread: 0.008, radius: 5, life: 300, matureAge: 12, mast: 0.6, cost: 24,
    look: { type: 'fig', leaf: '#3f7a44', bark: '#9a9080', berry: '#8a3a3a', fruit: [0, 1, 6, 7] },
    desc: 'Fruits several times a year, so it feeds monkeys, toucans, bats and fish when nothing else does.' });
  def({ key: 'leucaena', name: 'Leucaena', sci: 'Leucaena leucocephala', layer: 2, native: false, invasive: true, nfix: true,
    moist: [0.05, 0.75], light: [0.55, 1], grow: 0.01, spread: 0.02, radius: 3, life: 30, matureAge: 99, compete: 0.6, cost: 0,
    look: { type: 'leucaena', leaf: '#7a9a4a', bark: '#9a8a70' },
    desc: 'INVASIVE. A cattle-fodder tree from Central America that forms dense thickets and keeps native trees out.' });

  // ---------- Seed mixes ----------
  for (const m of [
    { key: 'mix_muvuca', name: 'Muvuca seed mix', layer: 2, cost: 16, density: 0.32,
      species: ['cecropia', 'inga', 'balsa', 'mahogany', 'brazilnut', 'ipe', 'kapok', 'fig'],
      desc: 'Direct seeding the way the Xingu Seed Network does it: dozens of native tree seeds mixed with sand and broadcast. Pioneers sprout first; the giants follow.' },
    { key: 'mix_pioneers', name: 'Pioneer trees', layer: 2, cost: 15, density: 0.3,
      species: ['cecropia', 'inga', 'balsa'],
      desc: 'Fast trees that shade out pasture grass within a few years.' },
    { key: 'mix_canopy', name: 'Canopy giants', layer: 2, cost: 28, density: 0.22,
      species: ['brazilnut', 'kapok', 'mahogany', 'ipe', 'fig'],
      desc: 'The long game: the trees that make a rainforest. Plant under or beside pioneers.' },
    { key: 'mix_varzea', name: 'Floodplain palms', layer: 2, cost: 20, density: 0.28,
      species: ['acai', 'buriti'],
      desc: 'Palms for wet ground, stream banks and flooded forest.' },
    { key: 'mix_pastureshrubs', name: 'Pasture recovery shrubs', layer: 1, cost: 8, density: 0.42,
      species: ['vismia', 'piper', 'guadua'],
      desc: 'Tough pioneer shrubs that take over old pasture and shade the grass out.' },
    { key: 'mix_understory', name: 'Understory plants', layer: 1, cost: 11, density: 0.4,
      species: ['heliconia', 'psychotria', 'cacao', 'piper'],
      desc: 'Shade lovers for a young forest: flowers for hummingbirds, fruit for monkeys.' },
    { key: 'mix_forestfloor', name: 'Forest floor mix', layer: 0, cost: 6, density: 0.6,
      species: ['adiantum', 'calathea', 'costus'],
      desc: 'Ferns, gingers and prayer plants for moist shade.' },
    { key: 'mix_groundcover', name: 'Native groundcover', layer: 0, cost: 3, density: 0.7,
      species: ['andropogon', 'mimosa'],
      desc: 'Native grass and sensitive plant to cover bare ground without choking tree seedlings.' },
    { key: 'mix_wetland', name: 'Floodplain wetland mix', layer: 0, cost: 4, density: 0.7,
      species: ['cyperus', 'waterlily', 'hyacinth'],
      desc: 'Sedges and floating plants for ponds, oxbows and marshes.' },
  ]) mix(m);

  // behaviour flags the simulation reads
  for (const k of ['cecropia', 'balsa']) get(k).gravelOK = true;                     // colonize river sandbars
  for (const k of ['heliconia', 'piper', 'guadua', 'vismia', 'costus']) get(k).resprout = true;
  Object.entries({ buriti: 0.7, brazilnut: 0.6, leucaena: 0.6, kapok: 0.5, ipe: 0.5, acai: 0.4, mahogany: 0.3, fig: 0.3, inga: 0.3, cecropia: 0.2, balsa: 0.2 })
    .forEach(([k, v]) => { get(k).fireSurvival = v; });
  get('guadua').fuel = 1.3; get('vismia').fuel = 0.8;
  get('heliconia').nectar = { months: [9, 10, 11, 0, 1], amount: 0.5 };
  get('ipe').nectar = { months: [4, 5], amount: 0.6 };
  get('inga').nectar = { months: [7, 8], amount: 0.4 };
  get('brazilnut').disperser = 'agouti';                                             // only agoutis plant its nuts
  // evergreen tropical plants: grasses only brown off in the dry season
  for (const k of ['brachiaria', 'guinea', 'andropogon', 'mimosa', 'costus', 'calathea', 'adiantum', 'cyperus', 'waterlily', 'hyacinth',
    'heliconia', 'piper', 'psychotria', 'cacao', 'guadua', 'vismia', 'cecropia', 'inga', 'balsa', 'acai', 'buriti',
    'brazilnut', 'kapok', 'mahogany', 'ipe', 'fig', 'leucaena']) get(k).look.tropical = true;
}
