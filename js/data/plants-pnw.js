// Pacific Northwest plant species (the Hollis farm map).
// Months: 0=Mar 1=Apr 2=May 3=Jun 4=Jul 5=Aug 6=Sep 7=Oct 8=Nov 9=Dec 10=Jan 11=Feb
// moist / light are preferred ranges on a 0..1 scale. soil = minimum soil health.
// grow = maturity gained per day in ideal conditions. spread = daily seeding chance once mature.

export default function buildPnwPlants(def, mix, get) {
  // ---------- Groundcover ----------
  def({ key: 'fescue', name: "Roemer's fescue", sci: 'Festuca roemeri', layer: 0, moist: [0.05, 0.6], light: [0.55, 1],
    grow: 0.02, spread: 0.025, radius: 2, life: 12, graze: 0.8, cost: 3,
    look: { type: 'grass', leaf: '#a3b37a', dry: '#c9b77e' },
    desc: 'A blue-green bunchgrass of prairies and oak savannas. Holds dry soil together and feeds voles and elk.' });
  def({ key: 'wildrye', name: 'Blue wildrye', sci: 'Elymus glaucus', layer: 0, moist: [0.25, 0.75], light: [0.35, 1],
    grow: 0.022, spread: 0.025, radius: 2, life: 8, graze: 0.8, cost: 3,
    look: { type: 'grass', leaf: '#7fa86b', dry: '#bfae78' },
    desc: 'A tall, tolerant native grass that grows in sun or dappled shade along forest edges.' });
  def({ key: 'camas', name: 'Common camas', sci: 'Camassia quamash', layer: 0, moist: [0.35, 0.85], light: [0.5, 1], soil: 0.15,
    grow: 0.015, spread: 0.018, radius: 2, life: 20, graze: 0.3, cost: 5,
    look: { type: 'forb', leaf: '#6f9a4f', flower: '#6d6fe0', bloom: [1, 2] },
    desc: 'Its blue spring flowers once carpeted wet prairies; the bulbs were a staple food of Coast Salish peoples.' });
  def({ key: 'lupine', name: 'Large-leaf lupine', sci: 'Lupinus polyphyllus', layer: 0, moist: [0.2, 0.8], light: [0.5, 1],
    grow: 0.022, spread: 0.022, radius: 2, life: 6, nfix: true, graze: 0.3, cost: 4,
    look: { type: 'forb', leaf: '#5f9152', flower: '#8b5fd0', bloom: [2, 3, 4] },
    desc: 'Fixes nitrogen and rebuilds worn-out farm soil. Bumblebees love it.' });
  def({ key: 'yarrow', name: 'Common yarrow', sci: 'Achillea millefolium', layer: 0, moist: [0.0, 0.6], light: [0.5, 1],
    grow: 0.022, spread: 0.025, radius: 2, life: 8, graze: 0.2, cost: 3,
    look: { type: 'forb', leaf: '#7fa060', flower: '#f3f0dc', bloom: [3, 4, 5] },
    desc: 'Flat white flower heads that feed a huge range of small native bees and hoverflies.' });
  def({ key: 'sunshine', name: 'Oregon sunshine', sci: 'Eriophyllum lanatum', layer: 0, moist: [0.0, 0.42], light: [0.65, 1],
    grow: 0.02, spread: 0.02, radius: 2, life: 6, cost: 4,
    look: { type: 'forb', leaf: '#a2b08c', flower: '#f2c230', bloom: [2, 3, 4] },
    desc: 'A woolly silver plant with bright yellow daisies. Thrives on the driest, rockiest ground.' });
  def({ key: 'fireweed', name: 'Fireweed', sci: 'Chamaenerion angustifolium', layer: 0, moist: [0.2, 0.8], light: [0.6, 1],
    grow: 0.03, spread: 0.04, radius: 4, life: 5, browse: 0.3, cost: 3,
    look: { type: 'tallforb', leaf: '#5c8a45', flower: '#dd4f9c', bloom: [4, 5], fall: '#b8452f' },
    desc: 'A fast pioneer that colonizes open, disturbed ground. Its seeds ride the wind.' });
  def({ key: 'swordfern', name: 'Western sword fern', sci: 'Polystichum munitum', layer: 0, moist: [0.35, 0.9], light: [0.0, 0.65], soil: 0.3,
    grow: 0.012, spread: 0.012, radius: 3, life: 60, cost: 6,
    look: { type: 'fern', leaf: '#2f6b3a' },
    desc: 'The signature evergreen fern of the PNW forest floor. Needs shade and good soil.' });
  def({ key: 'sedge', name: 'Slough sedge', sci: 'Carex obnupta', layer: 0, moist: [0.68, 1], light: [0.2, 1], wetOK: true,
    grow: 0.02, spread: 0.022, radius: 2, life: 20, graze: 0.4, cost: 4,
    look: { type: 'sedge', leaf: '#557d3a' },
    desc: 'A tough evergreen sedge that binds wet soil along creeks and ponds.' });
  def({ key: 'cattail', name: 'Broadleaf cattail', sci: 'Typha latifolia', layer: 0, moist: [0.88, 1], light: [0.5, 1], aquatic: true,
    grow: 0.025, spread: 0.035, radius: 2, life: 15, cost: 4,
    look: { type: 'cattail', leaf: '#6b8f45', head: '#6a4a2c' },
    desc: 'Shallow-water plant whose dense stands shelter red-winged blackbirds, frogs, and ducklings.' });
  def({ key: 'tule', name: 'Hardstem bulrush', sci: 'Schoenoplectus acutus', layer: 0, moist: [0.88, 1], light: [0.5, 1], aquatic: true,
    grow: 0.022, spread: 0.028, radius: 2, life: 20, cost: 4,
    look: { type: 'tule', leaf: '#476f3c' },
    desc: 'Tall round-stemmed tule of marsh edges. Traditionally woven into mats and canoes.' });
  def({ key: 'skunk', name: 'Western skunk cabbage', sci: 'Lysichiton americanus', layer: 0, moist: [0.75, 1], light: [0.0, 0.75], soil: 0.35, wetOK: true,
    grow: 0.012, spread: 0.012, radius: 2, life: 40, cost: 7,
    look: { type: 'skunk', leaf: '#4d8a3a', flower: '#f0d23c', bloom: [0, 1] },
    desc: 'Glowing yellow spathes in March swamps. Bears dig it up after hibernation.' });
  def({ key: 'canarygrass', name: 'Reed canarygrass', sci: 'Phalaris arundinacea', layer: 0, native: false, invasive: true,
    moist: [0.5, 1], light: [0.4, 1], wetOK: true, grow: 0.035, spread: 0.02, radius: 3, life: 30, compete: 0.6, graze: 0.2, cost: 0,
    look: { type: 'tallgrass', leaf: '#8fae62', dry: '#c7b683' },
    desc: 'INVASIVE. Chokes wet meadows and ditches in dense mats. Shade from trees is its weakness.' });

  // ---------- Shrubs ----------
  def({ key: 'salmonberry', name: 'Salmonberry', sci: 'Rubus spectabilis', layer: 1, moist: [0.5, 0.95], light: [0.15, 1], soil: 0.15,
    grow: 0.007, spread: 0.015, radius: 3, life: 30, browse: 0.5, cost: 10,
    look: { type: 'shrub', leaf: '#5f9a4a', flower: '#e0508a', bloom: [0, 1], berry: '#f29a2e', fruit: [3, 4], fall: '#b3a13f', deciduous: true },
    desc: 'Magenta flowers feed returning hummingbirds; salmon-colored berries feed everything else.' });
  def({ key: 'dogwood', name: 'Red-osier dogwood', sci: 'Cornus sericea', layer: 1, moist: [0.6, 1], light: [0.35, 1], wetOK: true,
    grow: 0.008, spread: 0.012, radius: 3, life: 30, browse: 0.8, beaverFood: true, cost: 10,
    look: { type: 'dogwood', leaf: '#5d8f48', flower: '#f1ecd2', bloom: [2, 3], berry: '#e7eef2', fruit: [5, 6], fall: '#b8452f', deciduous: true, stem: '#b0302a' },
    desc: 'Bright red winter stems along streambanks. Its roots stitch creek banks together.' });
  def({ key: 'willow', name: 'Sitka willow', sci: 'Salix sitchensis', layer: 1, moist: [0.65, 1], light: [0.5, 1], wetOK: true,
    grow: 0.012, spread: 0.014, radius: 4, life: 25, browse: 1, beaverFood: true, cost: 9,
    look: { type: 'willow', leaf: '#8aa872', fall: '#d6c24a', deciduous: true },
    desc: "Beavers' favorite food. Grows back from the stump after being chewed, so beaver and willow thrive together." });
  def({ key: 'rose', name: 'Nootka rose', sci: 'Rosa nutkana', layer: 1, moist: [0.2, 0.85], light: [0.4, 1],
    grow: 0.008, spread: 0.014, radius: 3, life: 25, browse: 0.4, cost: 8,
    look: { type: 'shrub', leaf: '#628f4c', flower: '#f07aa8', bloom: [2, 3], berry: '#d23a2a', fruit: [6, 7, 8, 9], fall: '#b7663a', deciduous: true, small: true },
    desc: 'Wild rose whose hips hang on into winter, feeding birds when little else is left.' });
  def({ key: 'snowberry', name: 'Common snowberry', sci: 'Symphoricarpos albus', layer: 1, moist: [0.1, 0.75], light: [0.1, 1],
    grow: 0.009, spread: 0.014, radius: 3, life: 30, browse: 0.5, cost: 8,
    look: { type: 'shrub', leaf: '#7b9c67', flower: '#f2c6d2', bloom: [3], berry: '#f4f6f4', fruit: [6, 7, 8, 9, 10], fall: '#a39a5a', deciduous: true, small: true },
    desc: 'Tough, thicket-forming shrub with white berries that persist through winter.' });
  def({ key: 'oregongrape', name: 'Tall Oregon grape', sci: 'Mahonia aquifolium', layer: 1, moist: [0.1, 0.7], light: [0.1, 1], soil: 0.2,
    grow: 0.006, spread: 0.01, radius: 3, life: 40, cost: 10,
    look: { type: 'holly', leaf: '#2f5e34', flower: '#f3cf2a', bloom: [0, 1], berry: '#40508f', fruit: [4, 5] },
    desc: "Oregon's state flower. Evergreen holly-like leaves and early flowers for queen bumblebees." });
  def({ key: 'salal', name: 'Salal', sci: 'Gaultheria shallon', layer: 1, moist: [0.25, 0.85], light: [0.0, 0.9], soil: 0.3,
    grow: 0.006, spread: 0.012, radius: 2, life: 60, browse: 0.4, cost: 9,
    look: { type: 'salal', leaf: '#335f36', flower: '#f1d9df', bloom: [2, 3], berry: '#2a2340', fruit: [4, 5, 6] },
    desc: 'Glossy evergreen understory shrub that forms dense cover. Its berries feed bears and birds.' });
  def({ key: 'huckleberry', name: 'Red huckleberry', sci: 'Vaccinium parvifolium', layer: 1, moist: [0.3, 0.85], light: [0.0, 0.7], soil: 0.45, nurse: true,
    grow: 0.005, spread: 0.012, radius: 4, life: 40, cost: 12,
    look: { type: 'shrub', leaf: '#6fa048', berry: '#e2332c', fruit: [3, 4, 5], fall: '#c1502f', deciduous: true, airy: true },
    desc: 'Often sprouts from rotting logs and stumps. Needs a real forest to be happy.' });
  def({ key: 'oceanspray', name: 'Oceanspray', sci: 'Holodiscus discolor', layer: 1, moist: [0.0, 0.6], light: [0.3, 1],
    grow: 0.008, spread: 0.012, radius: 3, life: 30, browse: 0.5, cost: 8,
    look: { type: 'shrub', leaf: '#6c8e50', flower: '#f4ecd6', bloom: [3, 4], fall: '#9a8a55', deciduous: true, plume: true },
    desc: 'Cascades of creamy flowers in early summer. Handles dry, sunny slopes.' });
  def({ key: 'elderberry', name: 'Red elderberry', sci: 'Sambucus racemosa', layer: 1, moist: [0.4, 0.9], light: [0.2, 1],
    grow: 0.01, spread: 0.014, radius: 4, life: 20, browse: 0.3, cost: 9,
    look: { type: 'shrub', leaf: '#5a9a4a', flower: '#f1ead0', bloom: [1, 2], berry: '#e2262a', fruit: [3, 4], fall: '#a8a24a', deciduous: true },
    desc: 'Fast-growing shrub with clusters of red berries relished by thrushes and band-tailed pigeons.' });
  def({ key: 'vinemaple', name: 'Vine maple', sci: 'Acer circinatum', layer: 1, moist: [0.35, 0.9], light: [0.0, 0.85], soil: 0.3,
    grow: 0.007, spread: 0.01, radius: 3, life: 60, browse: 0.6, cost: 12,
    look: { type: 'vinemaple', leaf: '#6ea24a', fall: '#d6432a', deciduous: true },
    desc: 'A sprawling understory maple that turns fire-red in autumn under the conifers.' });
  def({ key: 'blackberry', name: 'Himalayan blackberry', sci: 'Rubus armeniacus', layer: 1, native: false, invasive: true,
    moist: [0.15, 0.9], light: [0.45, 1], grow: 0.016, spread: 0.015, radius: 2, life: 40, compete: 0.8, browse: 0.2, cost: 0,
    look: { type: 'bramble', leaf: '#44743a', flower: '#f4eee6', bloom: [2, 3], berry: '#1c1426', fruit: [4, 5] },
    desc: 'INVASIVE. Impenetrable thorny thickets that smother everything. Birds spread the seeds. Cannot take shade.' });
  def({ key: 'broom', name: 'Scotch broom', sci: 'Cytisus scoparius', layer: 1, native: false, invasive: true, nfix: true,
    moist: [0.0, 0.6], light: [0.6, 1], grow: 0.014, spread: 0.016, radius: 3, life: 15, compete: 0.65, cost: 0,
    look: { type: 'broom', leaf: '#4f7a2e', flower: '#f5d31f', bloom: [1, 2] },
    desc: 'INVASIVE. Takes over dry meadows and prairies. Seeds stay viable in soil for decades.' });

  // ---------- Trees ----------
  def({ key: 'alder', name: 'Red alder', sci: 'Alnus rubra', layer: 2, moist: [0.4, 1], light: [0.5, 1], nfix: true,
    grow: 0.0055, spread: 0.012, radius: 5, life: 22, browse: 0.3, beaverFood: true, cost: 18,
    look: { type: 'alder', leaf: '#6f9d4f', fall: '#a09a58', deciduous: true, bark: '#c9c7bd' },
    desc: 'The great healer of disturbed ground. Grows fast, fixes nitrogen, and dies young, making way for conifers.' });
  def({ key: 'cottonwood', name: 'Black cottonwood', sci: 'Populus trichocarpa', layer: 2, moist: [0.6, 1], light: [0.6, 1],
    grow: 0.006, spread: 0.01, radius: 7, life: 40, browse: 0.3, beaverFood: true, cost: 18,
    look: { type: 'cottonwood', leaf: '#5f8d4a', fall: '#e4c64a', deciduous: true, bark: '#9a968a' },
    desc: 'The tallest broadleaf tree in the PNW. Fluffy seeds drift along rivers each June. Bald eagles nest in it.' });
  def({ key: 'maple', name: 'Bigleaf maple', sci: 'Acer macrophyllum', layer: 2, moist: [0.3, 0.85], light: [0.3, 1], soil: 0.2,
    grow: 0.0038, spread: 0.008, radius: 4, life: 90, mast: 0.3, cost: 22,
    look: { type: 'maple', leaf: '#5d9444', fall: '#e8b331', deciduous: true, bark: '#7b6a55' },
    desc: 'Giant leaves, mossy limbs draped in licorice fern. Its fallen leaves enrich the soil.' });
  def({ key: 'ash', name: 'Oregon ash', sci: 'Fraxinus latifolia', layer: 2, moist: [0.65, 1], light: [0.3, 1], soil: 0.15, wetOK: true,
    grow: 0.0032, spread: 0.008, radius: 4, life: 90, cost: 22,
    look: { type: 'ash', leaf: '#6c9a4c', fall: '#d9c55a', deciduous: true, bark: '#8a8174' },
    desc: 'One of the few trees that can stand in seasonally flooded bottomlands.' });
  def({ key: 'oak', name: 'Oregon white oak', sci: 'Quercus garryana', layer: 2, moist: [0.0, 0.5], light: [0.6, 1],
    grow: 0.0022, spread: 0.006, radius: 4, life: 250, mast: 1, cost: 26,
    look: { type: 'oak', leaf: '#5b7f3f', fall: '#a8783a', deciduous: true, bark: '#6d6457' },
    desc: 'Slow, gnarled, and long-lived. Its acorns and open savannas support hundreds of species.' });
  def({ key: 'fir', name: 'Douglas-fir', sci: 'Pseudotsuga menziesii', layer: 2, moist: [0.1, 0.75], light: [0.42, 1], soil: 0.25, conifer: true,
    grow: 0.0028, spread: 0.009, radius: 5, life: 400, cost: 25,
    look: { type: 'fir', leaf: '#2d5a38', bark: '#6b4a34' },
    desc: 'The iconic giant of Cascadia. Needs sun to get started, then towers for centuries.' });
  def({ key: 'cedar', name: 'Western redcedar', sci: 'Thuja plicata', layer: 2, moist: [0.5, 1], light: [0.0, 1], soil: 0.4, conifer: true,
    grow: 0.0024, spread: 0.007, radius: 4, life: 600, cost: 28,
    look: { type: 'cedar', leaf: '#46763b', bark: '#8a4f35' },
    desc: 'The "tree of life" of Northwest Coast cultures. Loves wet feet and grows happily in deep shade.' });
  def({ key: 'hemlock', name: 'Western hemlock', sci: 'Tsuga heterophylla', layer: 2, moist: [0.4, 0.9], light: [0.0, 0.9], soil: 0.45, conifer: true, nurse: true,
    grow: 0.0025, spread: 0.009, radius: 4, life: 400, cost: 26,
    look: { type: 'hemlock', leaf: '#2c5446', bark: '#5d4a3e' },
    desc: 'The most shade-tolerant tree here: it takes over old forests, often starting life on a nurse log.' });

  // ---------- Seed mixes ----------
    for (const m of [
    { key: 'mix_meadow', name: 'Upland meadow mix', layer: 0, cost: 3, density: 0.75,
      species: ['fescue', 'wildrye', 'camas', 'lupine', 'yarrow', 'sunshine', 'fireweed'],
      desc: 'Native grasses and wildflowers. Each seed finds the spot that suits it.' },
    { key: 'mix_wet', name: 'Wetland & marsh mix', layer: 0, cost: 4, density: 0.75,
      species: ['sedge', 'cattail', 'tule', 'camas', 'skunk'],
      desc: 'For pond edges, marshes, and soggy ground.' },
    { key: 'mix_forestfloor', name: 'Forest floor mix', layer: 0, cost: 6, density: 0.6,
      species: ['swordfern', 'wildrye'],
      desc: 'Ferns and shade grasses. Plant under trees once a canopy forms.' },
    { key: 'mix_riparian', name: 'Streamside shrubs', layer: 1, cost: 10, density: 0.45,
      species: ['willow', 'dogwood', 'salmonberry', 'elderberry', 'rose'],
      desc: 'Willow, dogwood and berries to shade creeks and feed wildlife.' },
    { key: 'mix_upland', name: 'Hedgerow shrubs', layer: 1, cost: 9, density: 0.4,
      species: ['snowberry', 'rose', 'oceanspray', 'oregongrape', 'elderberry'],
      desc: 'Cover and berries for drier edges and fence lines.' },
    { key: 'mix_understory', name: 'Understory shrubs', layer: 1, cost: 11, density: 0.4,
      species: ['salal', 'huckleberry', 'vinemaple', 'oregongrape', 'salmonberry'],
      desc: 'Shade-loving shrubs for a young forest.' },
    { key: 'mix_pioneer', name: 'Pioneer trees', layer: 2, cost: 18, density: 0.28,
      species: ['alder', 'cottonwood', 'maple', 'ash'],
      desc: 'Fast broadleaf trees that heal soil and make shade for the conifers to come.' },
    { key: 'mix_conifer', name: 'Conifer forest', layer: 2, cost: 26, density: 0.25,
      species: ['fir', 'cedar', 'hemlock'],
      desc: 'The long game. Douglas-fir in sun, redcedar and hemlock where it is wet or shady.' },
  ]) mix(m);

  // behaviour flags the simulation reads (fire, floods, seed dispersal, nectar)
  for (const k of ['willow', 'cottonwood', 'alder']) get(k).gravelOK = true;         // colonize bare gravel bars
  get('blackberry').birdSpread = true;                                                // birds carry the seeds far
  for (const k of ['salmonberry', 'snowberry', 'rose', 'oceanspray', 'willow', 'dogwood',
    'oregongrape', 'salal', 'vinemaple', 'elderberry', 'blackberry']) get(k).resprout = true; // regrow from roots after fire
  Object.entries({ fir: 0.9, oak: 0.85, maple: 0.5, cottonwood: 0.5, ash: 0.5, alder: 0.4, cedar: 0.4, hemlock: 0.3 })
    .forEach(([k, v]) => { get(k).fireSurvival = v; });                              // thick bark shrugs off ground fire
  get('broom').fuel = 1.6; get('blackberry').fuel = 1.2;                              // burns hot
  get('maple').nectar = { months: [1], amount: 0.3 };                                 // spring flowers feed pollinators
}
