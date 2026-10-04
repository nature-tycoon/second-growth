// Sumatran plant species (the Kebun Tualang map): an old oil palm estate on the edge of the
// Leuser rainforest in North Sumatra, with drained peat swamp running down to the river.
// The oil palms themselves are the invasive to beat, along with the weeds of the estate.
// Months: 0=Mar 1=Apr 2=May 3=Jun 4=Jul 5=Aug 6=Sep 7=Oct 8=Nov 9=Dec 10=Jan 11=Feb
// Wet nearly all year; the driest months are June–August and February.

export default function buildSumatraPlants(def, mix, get) {
  // ---------- Groundcover ----------
  def({ key: 'asystasia', name: 'Chinese violet', sci: 'Asystasia gangetica', layer: 0, native: false, invasive: true,
    moist: [0.15, 0.9], light: [0.42, 1], grow: 0.03, spread: 0.03, radius: 3, life: 8, compete: 0.8, cost: 0, smother: 0.3,
    look: { type: 'forb', leaf: '#5e9a3e', flower: '#d4c8e2', bloom: [1, 7] },
    desc: 'INVASIVE. An African creeper that carpets the ground between plantation rows. It smothers forest seedlings but gives way in deep shade.' });
  def({ key: 'mikania', name: 'Mile-a-minute', sci: 'Mikania micrantha', layer: 0, native: false, invasive: true,
    moist: [0.2, 0.95], light: [0.4, 1], grow: 0.034, spread: 0.032, radius: 4, life: 6, compete: 1, cost: 0, smother: 0.15,
    look: { type: 'tallforb', leaf: '#7aac44', flower: '#f0f0e0', bloom: [8, 9, 10] },
    desc: 'INVASIVE. A South American vine that climbs over young trees and pulls them down under a blanket of leaves. Its fluffy seeds blow in from every clearing.' });
  def({ key: 'alang', name: 'Alang-alang', sci: 'Imperata cylindrica', layer: 0, invasive: true,
    moist: [0.05, 0.8], light: [0.5, 1], grow: 0.03, spread: 0.028, radius: 3, life: 20, compete: 0.9, graze: 0.4, cost: 0,
    look: { type: 'tallgrass', leaf: '#9cb456', dry: '#d2c286' },
    desc: 'A native grass, but the worst weed of burned land in Southeast Asia. Its runners survive every fire, it burns hot in the dry season, and it holds out forest seedlings for decades. It cannot stand shade.' });
  def({ key: 'resam', name: 'Resam fern', sci: 'Dicranopteris linearis', layer: 0,
    moist: [0.15, 0.85], light: [0.45, 1], grow: 0.02, spread: 0.02, radius: 2, life: 15, cost: 3,
    look: { type: 'fern', leaf: '#7aa046' },
    desc: 'A tangle of forking fronds that covers bare, burned and landslipped ground. It holds the soil while trees take over, and dies back as they shade it.' });
  def({ key: 'kelakai', name: 'Kelakai swamp fern', sci: 'Stenochlaena palustris', layer: 0, wetOK: true,
    moist: [0.5, 1], light: [0.2, 0.95], grow: 0.018, spread: 0.018, radius: 2, life: 15, cost: 4,
    look: { type: 'fern', leaf: '#4e8a3a' },
    desc: 'A climbing fern of wet peat. People eat its red young shoots, and it is one of the first plants back on rewetted peat.' });
  def({ key: 'purun', name: 'Purun sedge', sci: 'Lepironia articulata', layer: 0, wetOK: true,
    moist: [0.72, 1], light: [0.35, 1], grow: 0.022, spread: 0.018, radius: 2, life: 12, cost: 4,
    look: { type: 'sedge', leaf: '#6a9446', dry: '#a4a060' },
    desc: 'Tall, hollow, rush-like stems in swampy pools on peat. Women weave its stems into mats and baskets.' });
  def({ key: 'lotus', name: 'Water lily', sci: 'Nymphaea pubescens', layer: 0, aquatic: true,
    moist: [0.9, 1], light: [0.6, 1], grow: 0.02, spread: 0.016, radius: 2, life: 8, cost: 6,
    look: { type: 'lily', leaf: '#4f8a3f', flower: '#f2d2e0', bloom: [7, 8, 9, 10, 11, 0] },
    desc: 'Floating pads and pink-white flowers on still water. Fish shelter under the pads.' });
  def({ key: 'nepenthes', name: 'Pitcher plant', sci: 'Nepenthes ampullaria', layer: 0, wetOK: true,
    moist: [0.55, 1], light: [0.15, 0.85], grow: 0.012, spread: 0.01, radius: 2, life: 15, cost: 10,
    look: { type: 'pitcher', leaf: '#6a9a3a', flower: '#a8442e', bloom: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    desc: 'Grows on poor, wet peat where nothing else can: its cup-shaped pitchers catch falling leaves and insects for the nutrients the soil lacks.' });
  def({ key: 'titan', name: 'Corpse flower', sci: 'Amorphophallus titanum', layer: 0,
    moist: [0.45, 0.9], light: [0.05, 0.6], soil: 0.3, grow: 0.006, spread: 0.004, radius: 3, life: 40, cost: 25,
    look: { type: 'titan', leaf: '#5e8a46', flower: '#6a1a2a', bloom: [] },
    desc: 'Found only in the rainforests of Sumatra. For years it grows a single leaf as big as a small tree; then, once in a long while, it sends up the largest flower on Earth, which smells of rotting meat to bring in beetles and flies for a single night.' });

  // ---------- Shrubs ----------
  def({ key: 'clidemia', name: "Koster's curse", sci: 'Clidemia hirta', layer: 1, native: false, invasive: true,
    moist: [0.25, 0.95], light: [0.42, 1], grow: 0.02, spread: 0.024, radius: 3, life: 12, compete: 0.7, cost: 0,
    look: { type: 'shrub', leaf: '#4a7a3a', berry: '#3a2a4a', fruit: [7, 8, 9, 10] },
    desc: 'INVASIVE. A hairy shrub from tropical America that birds spread everywhere. It forms thickets on plantation edges and in forest gaps.' });
  def({ key: 'chromolaena', name: 'Siam weed', sci: 'Chromolaena odorata', layer: 1, native: false, invasive: true,
    moist: [0.1, 0.85], light: [0.45, 1], grow: 0.024, spread: 0.026, radius: 4, life: 10, compete: 0.8, cost: 0,
    look: { type: 'broom', leaf: '#6a9640', flower: '#d8c8e8', bloom: [9, 10, 11] },
    desc: 'INVASIVE. A fast scrambling shrub whose wind-blown seeds take over every clearing. It dries out and burns readily in the dry season.' });
  def({ key: 'melastoma', name: 'Senduduk', sci: 'Melastoma malabathricum', layer: 1,
    moist: [0.2, 0.95], light: [0.5, 1], grow: 0.016, spread: 0.018, radius: 3, life: 15, browse: 0.2, cost: 6,
    look: { type: 'shrub', leaf: '#4f7e3a', flower: '#d870c0', bloom: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], berry: '#2a1a3a', fruit: [6, 7, 8] },
    desc: 'A tough native pioneer with pink flowers all year. Birds eat its purple-black berries and stain their beaks with them, and the bushes shade out alang-alang.' });
  def({ key: 'ixora', name: 'Jungle geranium', sci: 'Ixora javanica', layer: 1,
    moist: [0.35, 0.95], light: [0.05, 0.7], soil: 0.2, grow: 0.01, spread: 0.01, radius: 2, life: 25, cost: 9,
    look: { type: 'salal', leaf: '#3a6e3a', flower: '#e8502a', bloom: [1, 2, 3, 7, 8] },
    desc: 'Red-orange flower heads in the shady understory. Sunbirds and butterflies work every one.' });
  def({ key: 'ginger', name: 'Torch ginger', sci: 'Etlingera elatior', layer: 1,
    moist: [0.45, 1], light: [0.15, 0.75], soil: 0.2, grow: 0.012, spread: 0.012, radius: 2, life: 20, cost: 9,
    look: { type: 'ginger', scale: 0.72, leaf: '#3e8040', flower: '#e02a3a', bloom: [8, 9, 10, 11, 0] },
    desc: 'Leafy canes taller than a person, and waxy red flower torches on their own stalks near the ground. A forest-edge plant of damp gullies.' });
  def({ key: 'rattan', name: 'Rattan', sci: 'Calamus manan', layer: 1,
    moist: [0.35, 0.95], light: [0.05, 0.7], soil: 0.25, grow: 0.008, spread: 0.008, radius: 3, life: 60, cost: 12,
    look: { type: 'rattan', leaf: '#4a7038', berry: '#c8a868', fruit: [9, 10] },
    desc: 'A spiny climbing palm that hauls itself up into the canopy on whip-like hooks. Its canes become furniture; harvested carefully, it pays people to keep the forest standing.' });
  def({ key: 'bamboo', name: 'Giant bamboo', sci: 'Gigantochloa apus', layer: 1, wetOK: true,
    moist: [0.35, 1], light: [0.4, 1], grow: 0.02, spread: 0.01, radius: 3, life: 40, compete: 0.5, cost: 8,
    look: { type: 'bamboo', leaf: '#86a64a', scale: 1.4 },
    desc: 'Native clumping bamboo along streams. It binds riverbanks against floods and grows a stem as thick as a leg in a few months.' });
  def({ key: 'pandan', name: 'Swamp screw pine', sci: 'Pandanus helicopus', layer: 1, wetOK: true,
    moist: [0.65, 1], light: [0.25, 1], grow: 0.012, spread: 0.012, radius: 3, life: 40, cost: 10,
    look: { type: 'pandan', leaf: '#5a7e3e', berry: '#d8682a', fruit: [8, 9] },
    desc: 'Stands on stilt roots in black peat-swamp water, with spirals of long, saw-edged leaves. False gharials nest among them.' });

  // ---------- Trees ----------
  def({ key: 'oilpalm', name: 'Oil palm', sci: 'Elaeis guineensis', layer: 2, native: false, invasive: true,
    moist: [0.2, 0.78], light: [0.68, 1], grow: 0.0045, spread: 0.001, radius: 5, life: 80, matureAge: 99, compete: 0.5, cost: 0,
    look: { type: 'oilpalm', scale: 0.65, leaf: '#4e7430', bark: '#6a5a40', berry: '#b03c18', fruit: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    desc: 'INVASIVE here: the West African palm this estate was planted with. Its fruit bunches give palm oil; under them, little else lives. Civets, rats and wild pigs carry its seeds into the forest, so stray seedlings keep coming up. On peat that is wet again, it slowly drowns.' });
  def({ key: 'acacia', name: 'Brown salwood', sci: 'Acacia mangium', layer: 2, native: false, invasive: true, nfix: true,
    moist: [0.1, 0.85], light: [0.55, 1], grow: 0.011, spread: 0.016, radius: 4, life: 30, matureAge: 99, compete: 0.6, cost: 0,
    look: { type: 'leucaena', leaf: '#5e7e3a', bark: '#8a7a64', scale: 1.53 },
    desc: 'INVASIVE. An Australian pulpwood tree that seeds into burned ground and old clearings. Fire makes its seeds sprout by the thousand.' });
  def({ key: 'macaranga', name: 'Mahang', sci: 'Macaranga gigantea', layer: 2,
    moist: [0.2, 0.95], light: [0.6, 1], grow: 0.011, spread: 0.014, radius: 6, life: 25, matureAge: 99, cost: 12,
    look: { type: 'cecropia', leaf: '#7aa45a', bark: '#cfc8b4', berry: '#6a8a3a', fruit: [7, 8], scale: 0.81 },
    desc: 'The first tree up in any gap, with leaves as big as umbrellas. Ants live in its hollow twigs and guard it; birds and squirrels eat its seeds.' });
  def({ key: 'terap', name: 'Terap', sci: 'Artocarpus elasticus', layer: 2,
    moist: [0.25, 0.9], light: [0.45, 1], grow: 0.008, spread: 0.01, radius: 5, life: 60, matureAge: 25, mast: 0.6, cost: 15,
    look: { type: 'inga', leaf: '#3e7a3a', bark: '#a89a84', berry: '#c8a040', fruit: [5, 6, 7], hangFruit: true, fruitSize: 1.6, scale: 1.35 },
    desc: 'A fast-growing wild breadfruit with huge lobed leaves. Its big spiky fruit feed orangutans, hornbills and bears.' });
  def({ key: 'petai', name: 'Petai', sci: 'Parkia speciosa', layer: 2, nfix: true,
    moist: [0.2, 0.85], light: [0.4, 1], grow: 0.007, spread: 0.008, radius: 4, life: 80, matureAge: 15, cost: 16,
    look: { type: 'raintree', leaf: '#4e8a3a', bark: '#8a7a64', berry: '#7a9a3a', fruit: [3, 4], hangFruit: true, fruitSize: 1.1, scale: 1.25 },
    desc: 'A spreading legume that fixes nitrogen, with "stink bean" pods that sell well in every market. Bats pollinate its hanging flower balls at night.' });
  def({ key: 'durian', name: 'Durian', sci: 'Durio zibethinus', layer: 2,
    moist: [0.3, 0.85], light: [0.3, 1], soil: 0.25, grow: 0.0045, spread: 0.007, radius: 5, life: 150, matureAge: 15, mast: 1, cost: 22,
    look: { type: 'mahogany', leaf: '#3f6a38', bark: '#8a6a54', berry: '#a8a838', fruit: [9, 10, 11], hangFruit: true, fruitSize: 1.9 },
    desc: 'The king of fruits. Bats pollinate its flowers, and when the spiky fruit fall, orangutans, sun bears, tigers and elephants all come for them, and plant the seeds as they go.' });
  def({ key: 'rambutan', name: 'Rambutan', sci: 'Nephelium lappaceum', layer: 2,
    moist: [0.3, 0.85], light: [0.35, 1], soil: 0.2, grow: 0.006, spread: 0.007, radius: 4, life: 80, matureAge: 10, cost: 18,
    look: { type: 'balanites', leaf: '#3e6e36', bark: '#7a6650', berry: '#d8242a', fruit: [9, 10, 11], hangFruit: true, fruitSize: 1.1 },
    desc: 'Clusters of hairy red fruit with sweet white flesh. The village sells them by the bunch, and macaques, hornbills and civets raid the trees.' });
  def({ key: 'mangosteen', name: 'Mangosteen', sci: 'Garcinia mangostana', layer: 2,
    moist: [0.35, 0.9], light: [0.15, 1], soil: 0.25, grow: 0.004, spread: 0.005, radius: 3, life: 100, matureAge: 12, cost: 20,
    look: { type: 'magnolia', leaf: '#2e5e34', bark: '#5a4a3a', berry: '#4a1a3a', fruit: [9, 10, 11], hangFruit: true, fruitSize: 1.2, scale: 0.86 },
    desc: 'The "queen of fruits": a dense, dark evergreen that grows happily in the shade of bigger trees, with purple fruit around snow-white segments. Slow to start bearing, but it pays for decades.' });
  def({ key: 'cempedak', name: 'Cempedak', sci: 'Artocarpus integer', layer: 2,
    moist: [0.3, 0.9], light: [0.3, 1], soil: 0.2, grow: 0.006, spread: 0.007, radius: 4, life: 80, matureAge: 10, cost: 16,
    look: { type: 'ash', leaf: '#3e7038', bark: '#8a7a64', berry: '#c8b040', fruit: [10, 11, 0], hangFruit: true, fruitSize: 1.9 },
    desc: 'A wild jackfruit whose big fruits grow straight off the trunk and branches. Orangutans, sun bears and people all love it.' });
  def({ key: 'banana', was: 'duku', name: 'Banana', sci: 'Musa acuminata', layer: 2,
    moist: [0.35, 0.9], light: [0.35, 1], soil: 0.2, grow: 0.03, spread: 0.006, radius: 2, life: 40, matureAge: 2, cost: 8,
    look: { type: 'banana', leaf: '#5a9a40', bark: '#6e7a44', berry: '#9cba48', fruit: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    desc: 'Not a tree at all but a giant herb: its "trunk" is rolled leaf sheaths. Wild bananas are native to Sumatra, and every village garden has a clump. Each stem fruits once and dies, and a sucker comes up to take its place, so a clump bears all year round. Quick to plant and quick to pay, while the slow fruit trees grow up around it.' });
  def({ key: 'jengkol', name: 'Jengkol', sci: 'Archidendron pauciflorum', layer: 2, nfix: true,
    moist: [0.3, 0.9], light: [0.35, 1], grow: 0.006, spread: 0.007, radius: 4, life: 60, matureAge: 8, cost: 12,
    look: { type: 'raintree', leaf: '#4a8040', bark: '#8a7a6a', berry: '#5a3a5a', fruit: [2, 3], hangFruit: true, fruitSize: 1.1 },
    desc: 'A nitrogen-fixing legume with twisted dark pods of pungent beans, a favourite in Sumatran cooking. It enriches worn soil while it earns.' });
  def({ key: 'fig', name: 'Strangler fig', sci: 'Ficus stupenda', layer: 2,
    moist: [0.3, 0.95], light: [0.3, 1], soil: 0.15, grow: 0.005, spread: 0.008, radius: 5, life: 300, matureAge: 12, mast: 0.7, cost: 22,
    look: { type: 'fig', leaf: '#3f7a44', bark: '#9a9080', berry: '#c84a2a', fruit: [0, 1, 4, 5, 8, 9], hangFruit: true, fruitSize: 0.9 },
    desc: 'Fruits several times a year, so it feeds hornbills, gibbons and orangutans when nothing else is ripe. The single most important tree for rainforest wildlife.' });
  def({ key: 'meranti', name: 'Light red meranti', sci: 'Shorea leprosula', layer: 2,
    moist: [0.25, 0.85], light: [0.3, 1], soil: 0.25, grow: 0.0036, spread: 0.007, radius: 4, life: 300, matureAge: 16, mast: 0.8, cost: 28,
    look: { type: 'emergent', leaf: '#4a7a3a', bark: '#8a7262' },
    desc: 'A dipterocarp, the giant timber trees of Southeast Asia. Every few years all of them fruit at once, and their two-winged seeds spin down by the million.' });
  def({ key: 'keruing', name: 'Keruing', sci: 'Dipterocarpus grandiflorus', layer: 2,
    moist: [0.25, 0.85], light: [0.3, 1], soil: 0.25, grow: 0.0034, spread: 0.006, radius: 4, life: 300, matureAge: 16, mast: 0.6, cost: 28,
    look: { type: 'kapok', leaf: '#3e6a36', bark: '#9a8a7a', scale: 0.78 },
    desc: 'A towering dipterocarp with a straight grey trunk, resin that was once used to caulk boats, and big winged fruit that whirl down like shuttlecocks.' });
  def({ key: 'tualang', name: 'Tualang', sci: 'Koompassia excelsa', layer: 2,
    moist: [0.2, 0.85], light: [0.35, 1], soil: 0.2, grow: 0.0032, spread: 0.005, radius: 5, life: 400, matureAge: 18, cost: 30,
    look: { type: 'kapok', leaf: '#557e3e', bark: '#d8d2c2' },
    desc: 'The tallest tree in the Asian tropics, with a smooth silver trunk. Giant honey bees hang dozens of combs from its branches, so honey hunters never let it be felled.' });
  def({ key: 'jelutong', name: 'Jelutong', sci: 'Dyera polyphylla', layer: 2, wetOK: true,
    moist: [0.55, 1], light: [0.3, 1], soil: 0.15, grow: 0.0045, spread: 0.007, radius: 4, life: 200, matureAge: 15, cost: 22,
    look: { type: 'ipe', leaf: '#4a7a3e', bark: '#b0a690', scale: 1.31 },
    desc: 'A tall peat-swamp tree, tapped for its latex once used in chewing gum. One of the few big trees that grows well when drained peat is wet again.' });
  def({ key: 'nibung', name: 'Nibung palm', sci: 'Oncosperma tigillarium', layer: 2, wetOK: true,
    moist: [0.6, 1], light: [0.3, 1], grow: 0.006, spread: 0.01, radius: 4, life: 80, matureAge: 10, cost: 16,
    look: { type: 'palm', leaf: '#4a7438', bark: '#6a6050', berry: '#2a2030', fruit: [6, 7, 8] },
    desc: 'A clumping, spiny-trunked native palm of swamps and riverbanks, with drooping feathery fronds. Hornbills and pigeons eat its fruit.' });

  // ---------- Seed mixes ----------
  for (const m of [
    { key: 'mix_interplant', name: 'Jangka benah trees', layer: 2, cost: 15, density: 0.3,
      species: ['petai', 'durian', 'rambutan', 'cempedak', 'terap', 'macaranga', 'jelutong'],
      desc: 'Forest trees and fruit trees to plant between the palm rows while the old palms are still standing. They grow up in the palms\' half-shade, and as they close over, the palms are felled. Petai and durian also pay their way.' },
    { key: 'mix_fruit', name: 'Village fruit trees', layer: 2, cost: 17, density: 0.3,
      species: ['durian', 'rambutan', 'mangosteen', 'cempedak', 'banana', 'petai', 'jengkol'],
      desc: 'Fruit trees for a forest garden: the village sells their fruit every season, and orangutans, hornbills, bears and macaques eat their share. Bananas bear within a couple of years; mangosteen grows well in the shade of bigger trees.' },
    { key: 'mix_pioneers', name: 'Pioneer trees', layer: 2, cost: 12, density: 0.32,
      species: ['macaranga', 'terap', 'petai'],
      desc: 'Fast, sun-loving trees that shade out the weeds within a few years. Plant them where palms have been felled.' },
    { key: 'mix_canopy', name: 'Dipterocarp giants', layer: 2, cost: 26, density: 0.22,
      species: ['meranti', 'keruing', 'tualang', 'durian', 'fig'],
      desc: 'The trees that make a Sumatran rainforest: the dipterocarps, tualang, durian and figs. Slow, and best planted in the shade of pioneers.' },
    { key: 'mix_peatswamp', name: 'Peat swamp trees', layer: 2, cost: 18, density: 0.28,
      species: ['jelutong', 'nibung'],
      desc: 'Trees for wet peat. They only thrive once the canals are blocked and the peat stays wet.' },
    { key: 'mix_belukar', name: 'Regrowth shrubs', layer: 1, cost: 7, density: 0.42,
      species: ['melastoma', 'bamboo', 'ginger'],
      desc: 'Tough native shrubs to take over cleared ground and shade out alang-alang and Siam weed.' },
    { key: 'mix_understory', name: 'Understory plants', layer: 1, cost: 11, density: 0.4,
      species: ['ixora', 'rattan', 'ginger'],
      desc: 'Shade lovers for a young forest: flowers for sunbirds and butterflies, rattan to climb into the canopy.' },
    { key: 'mix_swampshrubs', name: 'Swamp plants', layer: 1, cost: 9, density: 0.4,
      species: ['pandan', 'bamboo'],
      desc: 'Screw pines and bamboo for wet peat and stream banks.' },
    { key: 'mix_groundcover', name: 'Native ferns', layer: 0, cost: 3, density: 0.7,
      species: ['resam', 'kelakai'],
      desc: 'Native ferns to cover bare ground where weeds were pulled, without choking tree seedlings.' },
    { key: 'mix_peatfloor', name: 'Peat swamp floor', layer: 0, cost: 5, density: 0.6,
      species: ['kelakai', 'purun', 'nepenthes', 'lotus'],
      desc: 'Ferns, sedges, pitcher plants and water lilies for rewetted peat and the pools of blocked canals.' },
  ]) mix(m);

  // behaviour flags the simulation reads
  for (const k of ['macaranga', 'acacia']) get(k).gravelOK = true;                        // colonize gravel roads and sandbars
  for (const k of ['melastoma', 'bamboo', 'ginger', 'chromolaena', 'clidemia', 'resam', 'pandan']) get(k).resprout = true;
  Object.entries({ oilpalm: 0.7, acacia: 0.5, tualang: 0.5, keruing: 0.4, meranti: 0.35, nibung: 0.4, jelutong: 0.3, petai: 0.3, durian: 0.25, rambutan: 0.25, mangosteen: 0.3, cempedak: 0.25, banana: 0.2, jengkol: 0.25, fig: 0.3, terap: 0.25, macaranga: 0.2 })
    .forEach(([k, v]) => { get(k).fireSurvival = v; });
  get('chromolaena').fuel = 1.1; get('bamboo').fuel = 1.2; get('clidemia').fuel = 0.7;
  get('ginger').nectar = { months: [8, 9, 10, 11, 0], amount: 0.5 };
  get('ixora').nectar = { months: [1, 2, 3, 7, 8], amount: 0.5 };
  get('melastoma').nectar = { months: [0, 2, 4, 6, 8, 10], amount: 0.3 };
  get('durian').nectar = { months: [6, 7], amount: 0.6 };
  get('petai').nectar = { months: [0, 1], amount: 0.5 };
  get('tualang').nectar = { months: [4, 5], amount: 0.4 };                                 // (and the bees' honey)
  get('durian').disperser = 'orangutan';
  // fruit trees: what a grown tree's fruit sells for each month it's in season, and food for wildlife
  Object.entries({ durian: 14, rambutan: 7, mangosteen: 9, cempedak: 7, banana: 1.5, petai: 6, jengkol: 5 }).forEach(([k, v]) => { get(k).harvest = v; });
  for (const k of ['durian', 'rambutan', 'mangosteen', 'cempedak', 'banana', 'petai', 'jengkol', 'terap', 'fig']) get(k).fruitFood = 0.8;                                                // orangutans carry durian seeds far
  // evergreen rainforest plants: only the grasses and ferns of open ground brown off in a dry spell
  for (const k of ['asystasia', 'mikania', 'alang', 'resam', 'kelakai', 'purun', 'lotus', 'nepenthes', 'titan',
    'clidemia', 'chromolaena', 'melastoma', 'ixora', 'ginger', 'rattan', 'bamboo', 'pandan',
    'oilpalm', 'acacia', 'macaranga', 'terap', 'petai', 'durian', 'rambutan', 'mangosteen', 'cempedak', 'banana', 'jengkol', 'fig', 'meranti', 'keruing', 'tualang', 'jelutong', 'nibung']) get(k).look.tropical = true;
}
