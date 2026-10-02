// Great Barrier Reef wildlife (the Kalinda Reef map). The rest of the reef runs on to the east and
// west, the lagoon and the cay lie to the north, and the reef slope drops away to the open ocean in
// the south. Everything here swims (reef: true), drawn at its own depth between seabed and surface.
// Months: 0=Mar ... 9=Dec 10=Jan 11=Feb.

import { habW } from './animals.js';
import { PLANT } from './plants.js';

// what's living on a tile
const coral = (W, i) => (W.tree[i] && W.treeG[i] > 0.3 ? 1 : 0);
const has = (W, i, layer, key) => W[layer][i] === PLANT[key]?.id && W[layer + 'G'][i] > 0.35;
const algae = (W, i) => (W.ground[i] === PLANT.turf?.id ? W.groundG[i] : 0);
const branching = (W, i) => (W.tree[i] === PLANT.staghorn?.id && W.treeG[i] > 0.35 ? 1 : 0);
// an old coral head, where cleaner wrasse set up shop
const station = (W, i) => ((W.tree[i] === PLANT.boulder?.id || W.tree[i] === PLANT.brain?.id) && W.treeAge[i] > 40 * 120 ? 1 : 0);
const soft = (W, i) => (W.shrub[i] && (W.shrub[i] === PLANT.sponge?.id || W.shrub[i] === PLANT.softcoral?.id) && W.shrubG[i] > 0.35 ? 1 : 0);

export default function buildReefAnimals(def) {
  const reef = habW({ YOUNG_FOREST: 0.8, MATURE_FOREST: 1, SHRUB: 0.6, MEADOW: 0.25, INVASIVE: 0.25, BARE: 0.1 });
  const meadow = habW({ MEADOW: 1, YOUNG_FOREST: 0.3, MATURE_FOREST: 0.4, SHRUB: 0.3 });

  // ------------------------------------------------------------------ Reef fish
  def({ key: 'clownfish', reef: true, name: 'Orange clownfish', sci: 'Amphiprion percula', group: 'Fish', move: 'ground',
    speed: 0.5, hr: 1, max: 24, minK: 1, groupSize: [2, 3], sources: ['E', 'W'], mig: 0.3, breed: [8, 9, 10], litter: [2, 4], life: 6, mature: 1,
    suit: (W, i) => (has(W, i, 'shrub', 'anemone') ? 1 : 0),
    sprite: { kind: 'fish', size: 6, back: '#e86418', flank: '#f07420', belly: '#f49038', bands: '#f6f4ee', finColor: '#ec7422', finEdge: '#141210', tailShape: 'round', spiny: true, short: true, swim: 0.1, show: 4.5 },
    desc: 'Lives its whole life in one sea anemone, sheltering among the stinging tentacles that would kill any other fish. It keeps the anemone clean, and chases off the butterflyfish that nibble it.',
    hint: 'Sea anemones to live in.' });
  def({ key: 'chromis', reef: true, name: 'Blue-green chromis', sci: 'Chromis viridis', group: 'Fish', move: 'ground',
    speed: 0.7, hr: 3, max: 80, minK: 4, groupSize: [6, 12], sources: ['E', 'W'], mig: 0.5, breed: [8, 9, 10, 11], litter: [4, 8], life: 4, mature: 1,
    suit: (W, i) => branching(W, i) || coral(W, i) * 0.25,
    sprite: { kind: 'fish', size: 4, back: '#5ac0c8', flank: '#7ad4cc', belly: '#c4ecdc', finColor: '#6ac8cc', deep: true, swim: 0.4, show: 4.5 },
    desc: 'Shimmering little fish that hang in a cloud over a staghorn thicket, picking plankton from the water, and dive into the branches all at once when a hunter swims by.',
    hint: 'Thickets of branching staghorn coral.' });
  def({ key: 'tang', reef: true, name: 'Blue tang', sci: 'Paracanthurus hepatus', group: 'Fish', move: 'ground',
    speed: 0.8, hr: 5, max: 30, minK: 2, groupSize: [2, 5], sources: ['E', 'W'], mig: 0.4, breed: [8, 9, 10], litter: [2, 4], life: 10, mature: 1,
    suit: (W, i) => reef[W.habitat[i]] * (0.6 + 0.4 * coral(W, i)),
    req: g => Math.min(1, g.forestTiles / 120),
    sprite: { kind: 'fish', size: 9, back: '#2450d0', flank: '#3060e0', belly: '#4a7ae8', finColor: '#1c2c8a', tailColor: '#f0cc20', palette: '#141830', spiny: true, longAnal: true, tailShape: 'truncate', deep: true, short: true, swim: 0.35, show: 3.4 },
    desc: 'Royal blue with a lemon-yellow tail. Surgeonfish like this one graze algae off the reef all day, keeping it clear for young corals.',
    hint: 'Living coral reef.' });
  def({ key: 'parrotfish', reef: true, name: 'Steephead parrotfish', sci: 'Chlorurus microrhinos', group: 'Fish', move: 'ground',
    speed: 0.9, hr: 10, max: 20, minK: 2, groupSize: [2, 4], sources: ['E', 'W'], mig: 0.4, breed: [8, 9, 10], litter: [2, 4], life: 15, mature: 2,
    suit: (W, i) => reef[W.habitat[i]] * (0.5 + algae(W, i)),
    req: g => Math.min(1, g.forestTiles / 200),
    sprite: { kind: 'fish', size: 16, back: '#2a7c8c', flank: '#3a9aa8', belly: '#b8a0c0', finColor: '#3ab0c8', analColor: '#d890b0', scales: '#e0a0c0', beak: '#ece8da', tailShape: 'lunate', spiny: true, longAnal: true, deep: true, swim: 0.3, show: 2.6 },
    desc: 'Scrapes algae off dead coral with a beak of fused teeth, and grinds the rock into fine white sand: one big parrotfish makes hundreds of kilograms of beach a year. It keeps algae from taking over the reef.',
    hint: 'A good stretch of reef, with algae to graze.' });
  def({ key: 'butterfly', reef: true, name: 'Threadfin butterflyfish', sci: 'Chaetodon auriga', group: 'Fish', move: 'ground',
    speed: 0.6, hr: 4, max: 24, minK: 2, groupSize: [2, 2], sources: ['E', 'W'], mig: 0.4, breed: [8, 9], litter: [2, 2], life: 8, mature: 1,
    suit: (W, i) => coral(W, i) * reef[W.habitat[i]],
    req: g => Math.min(1, g.forestTiles / 160),
    sprite: { kind: 'butterflyfish', size: 8, swim: 0.25, show: 3.2 },
    desc: 'Pairs for life, and picks at coral polyps with its long little snout. Where butterflyfish are plentiful, the coral is healthy.',
    hint: 'Plenty of living coral to feed on.' });
  def({ key: 'trout', reef: true, name: 'Coral trout', sci: 'Plectropomus leopardus', group: 'Fish', move: 'ground',
    speed: 1.0, hr: 14, max: 10, minK: 1, groupSize: [1, 2], sources: ['E', 'W'], mig: 0.3, breed: [8, 9], litter: [1, 3], life: 14, mature: 2,
    prey: ['chromis', 'tang', 'butterfly'], preyPer: 8,
    suit: (W, i) => reef[W.habitat[i]],
    req: g => Math.min(1, Math.max(0, (g.stats?.coral || 0) - 250) / 300), // (a reef big enough to hold plenty of small fish)
    sprite: { kind: 'fish', size: 20, back: '#c8382a', flank: '#d84a32', belly: '#e8886a', spots: '#4ab0e8', finColor: '#c8382a', tailShape: 'truncate', spiny: true, jaw: true, swim: 0.3, show: 2.2 },
    desc: 'A red hunter speckled with electric-blue spots, lurking under table corals to ambush smaller fish. A sign of a reef with plenty of fish in it.',
    hint: 'Older reef, and plenty of small fish to hunt.' });

  def({ key: 'cleaner', reef: true, name: 'Bluestreak cleaner wrasse', sci: 'Labroides dimidiatus', group: 'Fish', move: 'ground',
    speed: 0.4, hr: 2, max: 24, minK: 1, groupSize: [2, 2], sources: ['E', 'W'], mig: 0.3, breed: [8, 9], litter: [2, 3], life: 4, mature: 1,
    suit: (W, i) => station(W, i),
    sprite: { kind: 'fish', size: 5, back: '#c8d6e8', flank: '#e8eef6', belly: '#f4f6f8', rear: '#2a5ad0', stripe: 'cleaner', stripeColor: '#141418', finColor: '#2a5ad0', tailShape: 'truncate', long: true, swim: 0.2, show: 4.5 },
    desc: 'Runs a "cleaning station" on an old coral head: big fish queue up, and it picks the parasites off them, even from inside a grouper\'s mouth. Manta rays come from far away to be cleaned.',
    hint: 'Old boulder and brain coral heads.' });
  def({ key: 'idol', reef: true, name: 'Moorish idol', sci: 'Zanclus cornutus', group: 'Fish', move: 'ground',
    speed: 0.6, hr: 5, max: 16, minK: 2, groupSize: [2, 3], sources: ['E', 'W'], mig: 0.4, breed: [8, 9], litter: [2, 2], life: 8, mature: 1,
    suit: (W, i) => reef[W.habitat[i]] * (0.5 + soft(W, i)),
    req: g => Math.min(1, g.forestTiles / 250),
    sprite: { kind: 'idol', size: 8, swim: 0.32, show: 3.2 },
    desc: 'Black, white and yellow, with a long white streamer trailing from its fin. It browses sponges, and is so hard to keep in an aquarium that you almost only see it on a living reef.',
    hint: 'Reef with sponges and soft corals.' });
  def({ key: 'humphead', reef: true, name: 'Humphead wrasse', sci: 'Cheilinus undulatus', group: 'Fish', move: 'ground',
    speed: 0.7, hr: 20, max: 4, minK: 1, groupSize: [1, 1], sources: ['E', 'W'], mig: 0.3, breed: [8], litter: [1, 2], life: 30, mature: 5,
    suit: (W, i) => reef[W.habitat[i]],
    req: g => Math.min(1, Math.max(0, (g.stats?.coral || 0) - 400) / 400),
    sprite: { kind: 'fish', size: 30, back: '#3a7868', flank: '#4c9a84', belly: '#9ac8b0', finColor: '#3a8a7a', lines: '#2a4a5a', hump: true, tailShape: 'round', spiny: true, longAnal: true, deep: true, swim: 0.3, show: 2.0 },
    desc: 'A gentle green giant as long as a person, with a bulging forehead and big lips. One of the few fish that eats crown-of-thorns starfish, spines and all.',
    hint: 'A big, healthy reef.' });
  def({ key: 'trevally', reef: true, name: 'Giant trevally', sci: 'Caranx ignobilis', group: 'Fish', move: 'ground',
    speed: 1.3, hr: 30, max: 12, minK: 2, groupSize: [3, 6], sources: ['E', 'W'], mig: 0.5, breed: [9, 10], litter: [2, 4], life: 20, mature: 3,
    prey: ['chromis', 'tang', 'idol', 'butterfly'], preyPer: 6,
    suit: (W, i) => reef[W.habitat[i]],
    req: g => Math.min(1, Math.max(0, (g.stats?.coral || 0) - 450) / 400),
    sprite: { kind: 'fish', size: 26, back: '#56626e', flank: '#a4acb4', belly: '#dfe3e6', finColor: '#3a4048', tailShape: 'lunate', deep: true, swim: 0.45, show: 1.9 },
    desc: 'A silver bruiser that hunts the reef in packs, charging into schools of small fish. Big trevally mean there are plenty of fish to eat.',
    hint: 'A big reef full of small fish.' });

  // ------------------------------------------------------------------ Turtles, sharks and rays
  def({ key: 'greenturtle', reef: true, name: 'Green sea turtle', sci: 'Chelonia mydas', group: 'Turtles, sharks & rays', move: 'ground',
    speed: 0.5, hr: 20, max: 8, minK: 1, groupSize: [1, 2], sources: ['E', 'W'], mig: 0.5, breed: [], life: 70, mature: 0,
    suit: (W, i) => meadow[W.habitat[i]],
    req: g => Math.min(1, g.meadowTiles / 150),
    sprite: { kind: 'turtle', sea: true, size: 22, color: '#5e5232', dark: '#4e4430', streak: '#a08a58', plastron: '#ecdca8', show: 1.7, swim: 0.45 },
    desc: 'Grazes the seagrass meadows like a cow grazes a field, and sleeps wedged under a coral ledge. The females nest on the cay\'s beach every few years.',
    hint: 'Seagrass meadows to graze.' });
  def({ key: 'hawksbill', reef: true, name: 'Hawksbill turtle', sci: 'Eretmochelys imbricata', group: 'Turtles, sharks & rays', move: 'ground',
    speed: 0.5, hr: 12, max: 6, minK: 1, groupSize: [1, 1], sources: ['E', 'W'], mig: 0.5, breed: [], life: 60, mature: 0,
    suit: (W, i) => reef[W.habitat[i]] * (0.5 + soft(W, i)),
    req: g => Math.min(1, g.forestTiles / 300),
    sprite: { kind: 'turtle', sea: true, hawk: true, size: 19, color: '#7a4a1e', dark: '#3e2e1e', streak: '#d8a050', plastron: '#f0dca0', show: 1.7, swim: 0.35 },
    desc: 'Named for its narrow, hooked beak, which it uses to pull sponges out of cracks in the reef. Its shell is the beautiful amber "tortoiseshell" it was once hunted for.',
    hint: 'Reef with sponges to eat.' });
  def({ key: 'dugong', reef: true, name: 'Dugong', sci: 'Dugong dugon', group: 'Turtles, sharks & rays', move: 'ground',
    speed: 0.4, hr: 40, max: 4, minK: 1, groupSize: [1, 2], sources: ['N', 'E', 'W'], mig: 0.4, breed: [], life: 70, mature: 0,
    suit: (W, i) => (W.habitat[i] === 3 ? 1 : 0.1),
    req: g => Math.min(1, Math.max(0, g.meadowTiles - 1800) / 1200),
    sprite: { kind: 'dugong', size: 40, color: '#8a8478', belly: '#b0aa9c', show: 2.1, swim: 0.15 },
    desc: 'A sea cow: it grazes seagrass all day, leaving long winding trails of bare sand behind it, and can live seventy years. It needs big meadows.',
    hint: 'Big seagrass meadows.' });
  def({ key: 'shark', reef: true, name: 'Whitetip reef shark', sci: 'Triaenodon obesus', group: 'Turtles, sharks & rays', move: 'ground',
    speed: 1.1, hr: 30, max: 4, minK: 1, groupSize: [1, 2], sources: ['E', 'W'], mig: 0.3, breed: [9], litter: [1, 3], life: 20, mature: 4,
    prey: ['parrotfish', 'tang', 'chromis', 'trout'], preyPer: 12,
    suit: (W, i) => reef[W.habitat[i]],
    req: g => Math.min(1, Math.max(0, (g.stats?.coral || 0) - 500) / 500),
    sprite: { kind: 'shark', size: 34, back: '#7a8088', flank: '#949aa2', belly: '#e4e6e8', swim: 0.4, show: 2.4 },
    desc: 'Rests in caves under the coral by day and hunts through the reef at night. Sharks keep the fish they prey on healthy; a reef with sharks is a reef in good shape.',
    hint: 'A big, old reef full of fish.' });
  def({ key: 'manta', reef: true, name: 'Reef manta ray', sci: 'Mobula alfredi', group: 'Turtles, sharks & rays', move: 'ground',
    speed: 0.9, hr: 40, max: 4, minK: 1, groupSize: [1, 3], sources: ['E', 'W'], mig: 0.7, season: [4, 5, 6, 7], breed: [], life: 40, mature: 0,
    suit: (W, i) => reef[W.habitat[i]],
    req: g => Math.min(1, Math.max(0, (g.stats?.coral || 0) - 700) / 500) * Math.min(1, (g.stats?.cleanerTiles || 0) / 20),
    sprite: { kind: 'ray', size: 40, color: '#2e343e', belly: '#eeeee8', swim: 0.7, show: 2.3 },
    desc: 'Four metres across, gliding in through the winter to have cleaner fish pick it over at the reef\'s "cleaning stations": old coral heads where the cleaners live.',
    hint: 'Old coral heads, in winter.' });

  // ------------------------------------------------------------------ Seabirds
  def({ key: 'booby', name: 'Brown booby', sci: 'Sula leucogaster', group: 'Seabirds', move: 'fly',
    speed: 2.6, hr: 40, max: 10, minK: 1, groupSize: [1, 3], sources: ['E', 'W', 'S'], mig: 0.5, breed: [5, 6], litter: [1, 2], life: 20, mature: 2,
    suit: (W, i) => reef[W.habitat[i]],
    req: g => Math.min(1, g.forestTiles / 200),
    sprite: { kind: 'booby', size: 18, show: 1.5, bib: true, color: '#4a3a2c', breast: '#f2efe6', head: '#4a3a2c', flight: '#2e241c', bill: '#e2cc6a', eye: '#ece8c0' },
    desc: 'Plunges from the air like a dart to catch fish, then sits on the water to rest and swallow, bobbing on the swell.',
    hint: 'Plenty of fish near the surface.' });
  def({ key: 'noddy', name: 'Black noddy', sci: 'Anous minutus', group: 'Seabirds', move: 'fly',
    speed: 2.6, hr: 30, max: 40, minK: 4, groupSize: [4, 8], sources: ['N', 'E'], mig: 0.6, breed: [7, 8, 9], litter: [1, 1], life: 18, mature: 2,
    suit: (W, i) => (W.tree[i] === PLANT.pisonia?.id && W.treeG[i] > 0.45 ? 1 : 0),
    sprite: { kind: 'songbird', size: 12, color: '#2e2a28', breast: '#3a3430', head: '#34302c', cap: '#ecebe6', wingShape: 'pointed', bill: '#1a1a1a' },
    desc: 'A small dark tern with a white cap. It nests by the thousand in the cay\'s pisonia trees, and its droppings feed the island and the reef around it.',
    hint: 'Pisonia trees on the cay to nest in.' });

  return {
    groups: ['Fish', 'Turtles, sharks & rays', 'Seabirds'],
    names: {
      clownfish: ['clownfish', 'clownfish'], chromis: ['chromis', 'chromis'], tang: ['blue tang', 'blue tangs'],
      parrotfish: ['parrotfish', 'parrotfish'], butterfly: ['butterflyfish', 'butterflyfish'], trout: ['coral trout', 'coral trout'],
      greenturtle: ['green turtle', 'green turtles'], shark: ['whitetip reef shark', 'whitetip reef sharks'], manta: ['manta ray', 'manta rays'],
      cleaner: ['cleaner wrasse', 'cleaner wrasse'], idol: ['Moorish idol', 'Moorish idols'], humphead: ['humphead wrasse', 'humphead wrasse'],
      trevally: ['giant trevally', 'giant trevally'], hawksbill: ['hawksbill turtle', 'hawksbill turtles'], dugong: ['dugong', 'dugongs'],
      booby: ['brown booby', 'brown boobies'], noddy: ['black noddy', 'black noddies'],
    },
    shy: { clownfish: 0.1, chromis: 0.1, tang: 0.2, parrotfish: 0.3, butterfly: 0.2, trout: 0.4, greenturtle: 0.4, shark: 0.6, manta: 0.6,
      cleaner: 0.1, idol: 0.2, humphead: 0.5, trevally: 0.4, hawksbill: 0.4, dugong: 0.8, booby: 0.3, noddy: 0.4 },
    frugivores: [],
    fenced: [],
    damBuilders: [],
    browsers: {},
  };
}
