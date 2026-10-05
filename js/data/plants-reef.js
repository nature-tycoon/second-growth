// Great Barrier Reef "plants" (the Kalinda Reef map): corals, soft corals, seagrass and algae on a
// patch of the southern reef, off a small sand cay. Corals are animals that farm algae in their
// tissue, but they grow, spread and compete for light and space the way plants do, so the game
// treats them as plants: hard corals take the place of trees, soft corals, sponges, sea fans,
// anemones and giant clams the place of shrubs, and seagrass and algae the groundcover.
// The crown-of-thorns starfish, an animal that eats coral, is drawn among the "shrubs" too: its
// outbreaks spread across a reef like a weed, and divers cull them by hand.
// Months: 0=Mar ... 9=Dec 10=Jan 11=Feb. Southern hemisphere: summer is Dec–Feb, when the water
// is warmest and corals bleach; corals spawn together a few nights after the November full moon.

export default function buildReefPlants(def, mix, get) {
  const sea = [0, 1]; // (everything here is underwater: "moisture" never limits anything)

  // ---------- Groundcover: seagrass and algae ----------
  def({ key: 'turf', name: 'Turf algae', sci: 'mixed filamentous algae', layer: 0, invasive: true,
    moist: sea, light: [0.2, 1], grow: 0.045, spread: 0.032, radius: 3, life: 2, compete: 0.5, cost: 0,
    look: { type: 'turf', leaf: '#7a7a42', evergreen: true },
    desc: 'NUISANCE. A shaggy fuzz of algae that smothers dead coral and rubble, and stops coral larvae settling. Runoff feeds it; parrotfish and surgeonfish graze it back.' });
  def({ key: 'cca', name: 'Coralline algae', sci: 'Porolithon onkodes', layer: 0, nfix: true,
    moist: sea, light: [0.3, 1], grow: 0.03, spread: 0.03, radius: 2, life: 30, compete: 0.2, cost: 2,
    look: { type: 'crust', leaf: '#b88a96', evergreen: true },
    desc: 'A pink, rock-hard crust of algae that cements loose rubble together, and the surface coral larvae most like to settle on. The reef\'s glue.' });
  def({ key: 'halophila', name: 'Spoon seagrass', sci: 'Halophila ovalis', layer: 0,
    moist: sea, light: [0.4, 1], soil: 0.04, pioneer: 0.2, grow: 0.035, spread: 0.016, radius: 2, life: 4, graze: 1, cost: 2,
    look: { type: 'spoongrass', leaf: '#5a9a48', evergreen: true },
    desc: 'Tiny paired oval leaves, the first seagrass to grow back on bare sand. Green turtles and dugongs graze it.' });
  def({ key: 'zostera', name: 'Eelgrass', sci: 'Zostera muelleri', layer: 0,
    moist: sea, light: [0.45, 1], soil: 0.1, grow: 0.022, spread: 0.012, radius: 2, life: 12, compete: 0.5, graze: 0.8, cost: 3,
    look: { type: 'seagrass', leaf: '#4a8a3a', evergreen: true },
    desc: 'Long green ribbons that grow into meadows on the lagoon sand. Its roots hold the sand down, and baby fish shelter in it.' });

  def({ key: 'halimeda', name: 'Halimeda', sci: 'Halimeda opuntia', layer: 0,
    moist: sea, light: [0.3, 1], grow: 0.03, spread: 0.02, radius: 2, life: 3, cost: 2,
    look: { type: 'halimeda', leaf: '#6aa84a', evergreen: true },
    desc: 'A green seaweed built of little chalky discs. When it dies they crumble, and much of the white sand on the reef was once Halimeda. Blue tangs graze it.' });

  // ---------- Shrubs: soft corals, sea fans, sponges, anemones, giant clams ----------
  def({ key: 'softcoral', name: 'Leather coral', sci: 'Sarcophyton', layer: 1,
    moist: sea, light: [0.3, 1], soil: 0.06, grow: 0.018, spread: 0.012, radius: 2, life: 30, cost: 6,
    look: { type: 'softcoral', leaf: '#c8b48a', evergreen: true },
    desc: 'A soft coral with a thick stalk and a wide, folded cap that sways in the current. It bends instead of breaking in storms.' });
  def({ key: 'seafan', name: 'Sea fan', sci: 'Annella mollis', layer: 1,
    moist: sea, light: [0.15, 0.9], soil: 0.1, grow: 0.012, spread: 0.01, radius: 2, life: 40, cost: 8,
    look: { type: 'seafan', leaf: '#d8603a', evergreen: true },
    desc: 'A gorgonian: a flat, lacy fan held up across the current to sieve plankton from the water. It grows where the current runs, and longnose hawkfish perch in its branches. Most sea fans have no algae in them, so they hardly bleach.' });
  def({ key: 'sponge', name: 'Barrel sponge', sci: 'Xestospongia testudinaria', layer: 1, kindName: 'Sponge',
    moist: sea, light: [0, 0.9], soil: 0.08, grow: 0.01, spread: 0.008, radius: 2, life: 80, cost: 8,
    look: { type: 'sponge', leaf: '#c87a4a', evergreen: true },
    desc: 'A huge vase of a sponge that pumps its own volume of seawater through its walls every few seconds, filtering it clean.' });
  def({ key: 'anemone', name: 'Magnificent sea anemone', sci: 'Heteractis magnifica', layer: 1, kindName: 'Sea anemone',
    moist: sea, light: [0.5, 1], soil: 0.06, grow: 0.016, spread: 0.008, radius: 2, life: 60, cost: 10,
    look: { type: 'anemone', leaf: '#e0c8b8', evergreen: true },
    desc: 'A mop of stinging tentacles that clownfish live in, safe from everything else. In return they chase off the fish that would eat it.' });
  def({ key: 'clam', name: 'Giant clam', sci: 'Tridacna gigas', layer: 1, kindName: 'Giant clam',
    // Occasional settlers drift into separated gaps; clams should never carpet the lagoon sand.
    moist: sea, light: [0.6, 1], soil: 0.05, grow: 0.008, spread: 0.0008, radius: 6, seedSpacing: 3, life: 100, cost: 18,
    look: { type: 'clam', leaf: '#4a72c8', evergreen: true },
    desc: 'The largest shellfish in the world, farmed back onto reefs where it was taken. Its blue mantle is full of the same algae corals carry, and it filters the water as it feeds, so turf algae has a harder time around it. It sits happily on sand or rubble.' });
  def({ key: 'fungia', name: 'Mushroom coral', sci: 'Fungia fungites', layer: 1, kindName: 'Hard coral (free-living)',
    moist: sea, light: [0.4, 1], soil: 0.02, grow: 0.012, spread: 0.004, radius: 2, life: 40, cost: 7,
    look: { type: 'mushroom', leaf: '#c0a47e', evergreen: true },
    desc: 'A hard coral that never fixes itself to the reef: one big polyp, lying loose on the sand and rubble. It can even right itself when a storm flips it over. The one coral that lives out on bare sand.' });
  def({ key: 'linckia', name: 'Blue sea star', sci: 'Linckia laevigata', layer: 1, kindName: 'Starfish',
    moist: sea, light: [0.3, 1], grow: 0.02, spread: 0.008, radius: 2, life: 10, cost: 4,
    look: { type: 'seastar', leaf: '#2a6ae0', evergreen: true },
    desc: 'A bright blue starfish with smooth, round-tipped arms, grazing the film of algae and detritus on rubble and sand. Harmless to coral.' });
  def({ key: 'cots', name: 'Crown-of-thorns starfish', sci: 'Acanthaster planci', layer: 1, kindName: 'Starfish (eats coral)', invasive: true,
    moist: sea, light: [0, 1], grow: 0.05, spread: 0, radius: 3, life: 4, compete: 0.6, cost: 0, // (it breeds once a summer: see the map's daily)
    look: { type: 'starfish', leaf: '#b8507e', evergreen: true, climbs: true },
    desc: 'OUTBREAK. A native starfish that eats coral. A few are normal; runoff from the land feeds its larvae, and then thousands of them strip a reef bare. Divers cull them by hand.' });

  // ---------- Hard corals (the reef's "trees") ----------
  def({ key: 'staghorn', name: 'Staghorn coral', sci: 'Acropora muricata', layer: 2,
    moist: sea, light: [0.5, 1], soil: 0.12, soilK: 6, grow: 0.022, spread: 0.008, radius: 3, life: 25, matureAge: 4, cost: 6,
    look: { type: 'staghorn', leaf: '#c8a27a', bark: '#a29a8a', evergreen: true },
    desc: 'The fastest-growing coral on the reef, branching into thickets that shelter clouds of little fish. Also the first to bleach, and easily broken.' });
  def({ key: 'tablecoral', name: 'Table coral', sci: 'Acropora hyacinthus', layer: 2,
    moist: sea, light: [0.55, 1], soil: 0.12, soilK: 6, grow: 0.016, spread: 0.007, radius: 3, life: 30, matureAge: 5, cost: 8,
    look: { type: 'tablecoral', leaf: '#a8946a', bark: '#a29a8a', evergreen: true },
    desc: 'Grows a wide, flat plate on a short stalk, shading the reef below. Coral trout lurk underneath it, sweetlips hang in its shade, and reef sharks rest there by day.' });
  def({ key: 'montipora', name: 'Plate coral', sci: 'Montipora capricornis', layer: 2,
    moist: sea, light: [0.4, 1], soil: 0.1, soilK: 6, grow: 0.017, spread: 0.007, radius: 3, life: 35, matureAge: 5, cost: 8,
    look: { type: 'plating', leaf: '#9a6c88', bark: '#a29a8a', evergreen: true },
    desc: 'Grows in whorls of thin, overlapping plates like an open cabbage, in purples and browns. Little fish hide between the layers, and sweetlips rest in its shade by day.' });
  def({ key: 'brain', name: 'Brain coral', sci: 'Platygyra daedalea', layer: 2,
    moist: sea, light: [0.45, 1], soil: 0.1, soilK: 6, grow: 0.008, spread: 0.005, radius: 2, life: 120, matureAge: 15, cost: 10,
    look: { type: 'brain', leaf: '#a8a058', bark: '#a29a8a', evergreen: true },
    desc: 'A slow, rounded dome covered in winding ridges. Tougher in a heatwave than the branching corals.' });
  def({ key: 'boulder', name: 'Boulder coral', sci: 'Porites lobata', layer: 2,
    moist: sea, light: [0.4, 1], soil: 0.1, soilK: 6, grow: 0.005, spread: 0.004, radius: 2, life: 400, matureAge: 30, cost: 14,
    look: { type: 'boulder', leaf: '#c8a878', bark: '#a29a8a', evergreen: true },
    desc: 'Grows a centimetre a year into lumpy mounds the size of a car, some of them older than the cities on the coast. The toughest coral on the reef.' });

  // ---------- The cay: the dry sand island in the middle of the lagoon ----------
  const dryLand = [0, 1];
  def({ key: 'spinifex', name: 'Beach spinifex', sci: 'Spinifex sericeus', layer: 0, cay: true, tab: 'cay', kindName: 'Island grass',
    moist: dryLand, light: [0.5, 1], grow: 0.03, spread: 0.025, radius: 2, life: 10, cost: 3,
    look: { type: 'grass', leaf: '#a8b080', evergreen: true },
    desc: 'A silvery, spreading beach grass whose runners bind the cay\'s loose sand against the wind and waves.' });
  def({ key: 'octopusbush', name: 'Octopus bush', sci: 'Heliotropium foertherianum', layer: 1, cay: true, tab: 'cay', kindName: 'Island shrub',
    moist: dryLand, light: [0.4, 1], grow: 0.02, spread: 0.015, radius: 2, life: 30, cost: 7,
    look: { type: 'shrub', leaf: '#a8b8a0', evergreen: true },
    desc: 'A silvery-leaved shrub of the cay\'s edge, salt-proof and wind-proof. Seabirds shelter under it.' });
  def({ key: 'pisonia', name: 'Pisonia', sci: 'Pisonia grandis', layer: 2, cay: true, tab: 'cay', kindName: 'Island tree',
    moist: dryLand, light: [0.3, 1], grow: 0.006, spread: 0.01, radius: 3, life: 80, matureAge: 12, cost: 14,
    look: { type: 'pisonia', leaf: '#7ab05a', bark: '#a89a80', evergreen: true },
    desc: 'The soft-wooded tree of the coral cays. Black noddies nest in its branches by the thousand, and their droppings feed the cay, the reef and the fish around it.' });

  for (const m of [
    { key: 'mix_rubble', name: 'Rubble starter', layer: 0, cost: 3, density: 0.6, species: ['cca', 'cca', 'halophila'],
      desc: 'Coralline algae to cement loose rubble and give coral larvae somewhere to settle, with spoon seagrass for the sandy gaps.' },
    { key: 'mix_meadow', name: 'Seagrass meadow', layer: 0, cost: 3, density: 0.6, species: ['halophila', 'zostera'],
      desc: 'Seagrass for the lagoon sand: a nursery for baby fish, and grazing for turtles.' },
    { key: 'mix_nursery', name: 'Coral nursery fragments', layer: 2, cost: 9, density: 0.4, species: ['staghorn', 'staghorn', 'staghorn', 'tablecoral', 'montipora', 'brain'],
      desc: 'Pieces of fast-growing coral raised in an underwater nursery and tied onto the reef. Plant them on stabilised rubble.' },
    { key: 'mix_resilient', name: 'Heat-tolerant corals', layer: 2, cost: 14, density: 0.3, species: ['boulder', 'brain', 'brain'],
      desc: 'Slow, massive corals that ride out heatwaves the branching corals can\'t. The long game.' },
    { key: 'mix_garden', name: 'Soft coral garden', layer: 1, cost: 8, density: 0.4, species: ['softcoral', 'softcoral', 'seafan', 'sponge', 'fungia', 'clam'],
      desc: 'Soft corals, sea fans, sponges and the odd giant clam, for the spaces between the hard corals. A spot one of them holds stays theirs: hard corals can\'t settle on it.' },
    { key: 'mix_cay', name: 'Cay planting', layer: 0, cost: 3, density: 0.6, species: ['spinifex'],
      desc: 'Beach spinifex for the cay\'s bare sand, to hold it down. Plant octopus bush and pisonia behind it.' },
  ]) mix(m);

  // behaviour flags the simulation reads
  get('cca').crustOK = true;                                                     // grows straight onto loose rubble
  for (const k of ['staghorn', 'tablecoral']) get(k).bleach = 1;  // how readily each one bleaches
  get('montipora').bleach = 0.85; get('anemone').bleach = 0.85; get('softcoral').bleach = 0.7; get('fungia').bleach = 0.6; get('seafan').bleach = 0.15;
  for (const k of ['staghorn', 'tablecoral', 'montipora', 'softcoral', 'seafan']) get(k).fragile = true; // (smashed to rubble by cyclone swells)
  get('brain').bleach = 0.5; get('boulder').bleach = 0.3; get('clam').bleach = 0.6; get('sponge').bleach = 0;
}
