// Amazon wildlife (the Fazenda Esperança map). Rainforest lies to the north and east, a
// neighbouring ranch to the west, and a big whitewater river to the south.
// Months: 0=Mar ... 9=Dec 10=Jan 11=Feb.  Moves: ground, semi (land and water), swim, fly,
// and tree (arboreal: only through connected canopy).

import { habW, near } from './animals.js';

// canopy dwellers only use tiles with real tree cover overhead
const canopy = (W, i) => (W.canopy[i] > 0.45 ? 1 : 0);
const fruit = (W, i, base = 0.4) => base + (1 - base) * Math.min(1, W.berries[i]);

export default function buildAmazonAnimals(def) {
  // ------------------------------------------------------------------ Mammals
  {
    const w = habW({ MARSH: 1, RIPARIAN: 1, POND: 0.8, CREEK: 0.6, MEADOW: 0.6, FARM: 0.5, INVASIVE: 0.45, SHRUB: 0.3 });
    def({ key: 'capybara', name: 'Capybara', sci: 'Hydrochoerus hydrochaeris', group: 'Mammals', move: 'semi',
      speed: 1, hr: 12, max: 24, minK: 2, groupSize: [3, 6], sources: ['S', 'W'], mig: 0.4, breed: [8, 9, 10], litter: [2, 4], life: 8, mature: 1.5,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 3, 0.2),
      sprite: { kind: 'capybara', len: 30, color: '#8a6a48', belly: '#a08060' },
      desc: "The world's largest rodent. Families graze wet grass and slip into the water at the first sign of a jaguar.",
      hint: 'Grassy banks right beside ponds, marsh or the river.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.7, RIPARIAN: 1, MARSH: 0.6, SHRUB: 0.4 });
    def({ key: 'tapir', name: 'Lowland tapir', sci: 'Tapirus terrestris', group: 'Mammals', move: 'semi',
      speed: 1.1, hr: 100, max: 8, minK: 2, groupSize: [1, 2], sources: ['N', 'E'], mig: 0.25, intro: 12000,
      breed: [10, 11], litter: [1, 1], life: 25, mature: 3,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 6, 0.4),
      req: g => Math.min(1, g.forestTiles / 600),
      sprite: { kind: 'tapir', len: 44, h: 22, leg: 13, color: '#3a3432', belly: '#4a4440', rim: '#e8e2dc' },
      desc: 'South America\'s largest land mammal, "the gardener of the forest". It swallows fruit whole and plants the seeds far away.',
      hint: 'Forest with water to wallow in. Fences keep it out.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.7, RIPARIAN: 1, MARSH: 0.5, SHRUB: 0.3 });
    def({ key: 'jaguar', name: 'Jaguar', sci: 'Panthera onca', group: 'Mammals', move: 'ground', fixedMax: true,
      speed: 1.6, hr: 400, max: 2, minK: 1, sources: ['N', 'E'], mig: 0.15, breed: [2], litter: [1, 2], life: 14, mature: 3,
      prey: ['capybara', 'peccary', 'caiman', 'tapir', 'agouti'], preyPer: 8,
      suit: (W, i) => w[W.habitat[i]] * near(W.distForest[i], 3, 0.2),
      req: g => Math.min(1, g.forestTiles / 1500), // a big, grown forest
      sprite: { kind: 'feline', len: 44, h: 17, leg: 14, color: '#d8a040', belly: '#f0e0c0', dark: '#2a2018', longtail: true, rosettes: true, stocky: true },
      desc: "The Americas' greatest cat. It swims rivers, hunts caiman and capybara, and needs a huge, connected forest.",
      hint: 'Lots of connected forest, with capybara, peccaries or caiman to hunt.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.9, RIPARIAN: 0.8, SHRUB: 0.5 });
    def({ key: 'ocelot', name: 'Ocelot', sci: 'Leopardus pardalis', group: 'Mammals', move: 'ground',
      speed: 1.4, hr: 80, max: 5, sources: ['N', 'E'], mig: 0.25, breed: [2, 3], litter: [1, 2], life: 10, mature: 2,
      prey: ['agouti', 'armadillo'], preyPer: 5,
      suit: (W, i) => w[W.habitat[i]] * near(W.distForest[i], 2, 0.2),
      sprite: { kind: 'feline', len: 28, h: 12, leg: 10, color: '#c8a068', belly: '#f0e4c8', dark: '#2a2018', longtail: true, rosettes: true, chains: true },
      desc: 'A night-hunting spotted cat about twice the size of a house cat. Stalks agoutis along forest trails.',
      hint: 'Young or old forest with agoutis and armadillos.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 0.9, SHRUB: 0.7, RIPARIAN: 0.8, MEADOW: 0.3 });
    def({ key: 'peccary', name: 'Collared peccary', sci: 'Pecari tajacu', group: 'Mammals', move: 'ground',
      speed: 1.3, hr: 50, max: 16, minK: 3, groupSize: [4, 8], sources: ['N', 'E', 'W'], mig: 0.3, breed: [9, 10], litter: [1, 2], life: 10, mature: 1.5,
      suit: (W, i) => w[W.habitat[i]] * fruit(W, i, 0.6),
      sprite: { kind: 'peccary', len: 26, h: 13, leg: 8, color: '#4a4440', belly: '#5a524a', collar: '#c8c0b0' },
      desc: 'A wild pig-like herd animal that roots up seeds and tubers. Jaguars follow the herds.',
      hint: 'Young forest and thickets with fallen fruit.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.9, SHRUB: 0.6, RIPARIAN: 0.7 });
    def({ key: 'agouti', name: 'Red-rumped agouti', sci: 'Dasyprocta leporina', group: 'Mammals', move: 'ground',
      speed: 1.5, hr: 10, max: 20, sources: ['N', 'E'], mig: 0.4, breed: [8, 9, 10, 11], litter: [1, 2], life: 8, mature: 0.8,
      suit: (W, i) => w[W.habitat[i]] * fruit(W, i, 0.5),
      sprite: { kind: 'agouti', len: 16, color: '#a06a38', belly: '#c89a60' },
      desc: 'A long-legged rodent that buries Brazil nuts and forgets some, planting the next generation of forest giants.',
      hint: 'Forest with fruit and nut trees. Brazil nuts barely spread without it.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.8, YOUNG_FOREST: 0.7, FARM: 0.5, INVASIVE: 0.4 });
    def({ key: 'anteater', name: 'Giant anteater', sci: 'Myrmecophaga tridactyla', group: 'Mammals', move: 'ground',
      speed: 0.9, hr: 60, max: 4, sources: ['W', 'N'], mig: 0.25, breed: [3], litter: [1, 1], life: 15, mature: 2.5,
      suit: (W, i) => w[W.habitat[i]] * (0.4 + 0.6 * Math.min(1, W.insects[i])),
      sprite: { kind: 'anteater', len: 40, color: '#6a5a48', belly: '#4a3a30', stripe: '#1a1410', show: 0.78 },
      desc: 'Rips open termite mounds with huge claws and licks up tens of thousands of insects a day. Fire kills many.',
      hint: 'Open native grassland and scrub near forest, with plenty of insects.' });
  }
  {
    const w = habW({ SHRUB: 1, YOUNG_FOREST: 0.9, MEADOW: 0.7, RIPARIAN: 0.6, FARM: 0.45, INVASIVE: 0.4 });
    def({ key: 'armadillo', name: 'Nine-banded armadillo', sci: 'Dasypus novemcinctus', group: 'Mammals', move: 'ground',
      speed: 0.8, hr: 10, max: 14, sources: ['W', 'E', 'N'], mig: 0.4, breed: [9, 10, 11], litter: [4, 4], life: 8, mature: 1,
      suit: (W, i) => w[W.habitat[i]] * (0.5 + 0.5 * Math.min(1, W.insects[i])),
      sprite: { kind: 'armadillo', len: 18, color: '#8a7a68', belly: '#c8b8a0' },
      desc: 'Digs for grubs and ants, and always has identical quadruplets.',
      hint: 'Scrub, young forest or grassland with loose soil.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.7, RIPARIAN: 0.8 });
    def({ key: 'howler', name: 'Red-handed howler monkey', sci: 'Alouatta belzebul', group: 'Mammals', move: 'tree',
      speed: 0.7, hr: 25, max: 20, minK: 3, groupSize: [4, 8], sources: ['N', 'E'], mig: 0.3, breed: [4, 5, 6], litter: [1, 1], life: 18, mature: 3,
      suit: (W, i) => w[W.habitat[i]] * canopy(W, i) * fruit(W, i),
      req: g => Math.max(0, Math.min(1, (g.forestTiles - 450) / 300)), // a good stretch of grown forest
      sprite: { kind: 'monkey', len: 16, color: '#3a1e12', belly: '#2a160c', hands: '#b8501e', show: 1.35 },
      desc: 'Its dawn roar carries for kilometres. Howlers only travel through the treetops, so they need an unbroken canopy.',
      hint: 'Connected canopy leading in from the rainforest edge.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.4 });
    def({ key: 'spider', name: 'White-cheeked spider monkey', sci: 'Ateles marginatus', group: 'Mammals', move: 'tree',
      speed: 1.2, hr: 60, max: 14, minK: 3, groupSize: [3, 6], sources: ['N'], mig: 0.2, intro: 9000,
      breed: [9], litter: [1, 1], life: 25, mature: 4,
      suit: (W, i) => w[W.habitat[i]] * canopy(W, i) * fruit(W, i),
      req: g => Math.min(1, g.forestTiles / 1000),
      sprite: { kind: 'monkey', len: 18, color: '#18140f', belly: '#221c16', face: '#e8dcc8', long: true, show: 1.3 },
      desc: 'An acrobat that swings by a grasping tail and eats mostly ripe fruit, spreading more seeds than almost any other animal.',
      hint: 'Tall, fruit-rich forest canopy.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 0.9, RIPARIAN: 0.9 });
    def({ key: 'sloth', name: 'Brown-throated sloth', sci: 'Bradypus variegatus', group: 'Mammals', move: 'tree',
      speed: 0.15, hr: 4, max: 16, sources: ['N', 'E'], mig: 0.15, breed: [3, 4], litter: [1, 1], life: 20, mature: 3,
      suit: (W, i) => w[W.habitat[i]] * canopy(W, i),
      sprite: { kind: 'sloth', len: 18, color: '#9a8a6a', face: '#e8dcc0', mask: '#3a2a1a' },
      desc: 'Moves a few metres a day and grows algae in its fur. It favours cecropia leaves.',
      hint: 'Young forest canopy, especially cecropia.' });
  }
  {
    const w = habW({ CREEK: 1, POND: 1, RIVER: 0.8, MARSH: 0.6, RIPARIAN: 0.5 });
    def({ key: 'giantotter', name: 'Giant otter', sci: 'Pteronura brasiliensis', group: 'Mammals', move: 'semi', patrol: true,
      speed: 1.4, hr: 40, max: 8, minK: 3, groupSize: [3, 5], sources: ['S'], mig: 0.2, intro: 10000, breed: [8, 9], litter: [1, 3], life: 12, mature: 2,
      prey: ['piranha', 'arapaima'], preyPer: 4,
      suit: (W, i) => w[W.habitat[i]] * W.waterQ[i],
      req: g => Math.min(1, g.fishIndex / 15) * Math.min(1, g.cleanWater / 50),
      sprite: { kind: 'otter', len: 44, color: '#4a3426', belly: '#6a5040', throat: '#e8dcc0', show: 0.8 },
      desc: 'Two metres long and loud: families patrol clean creeks and oxbow lakes, fishing together.',
      hint: 'Clean, shaded creeks and ponds full of fish.' });
  }

  // ------------------------------------------------------------------ Birds
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.8, RIPARIAN: 0.7 });
    def({ key: 'toucan', name: 'Toco toucan', sci: 'Ramphastos toco', group: 'Birds', move: 'fly',
      speed: 1.2, hr: 20, max: 16, sources: ['N', 'E'], mig: 0.4, breed: [7, 8], litter: [2, 3], life: 15, mature: 1.5,
      suit: (W, i) => w[W.habitat[i]] * fruit(W, i),
      req: g => Math.min(1, (g.snagCount + g.bigTrees / 10) / 4),
      sprite: { kind: 'toucan', size: 16, color: '#141210', breast: '#f4f0e0', head: '#141210', bill: '#f08a2a' },
      desc: 'That enormous orange bill is light as foam and sheds heat. Toucans swallow fruit whole and drop the seeds far away.',
      hint: 'Fruiting trees and old trunks with nest holes.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, RIPARIAN: 0.8, YOUNG_FOREST: 0.5, MARSH: 0.3 });
    def({ key: 'macaw', name: 'Scarlet macaw', sci: 'Ara macao', group: 'Birds', move: 'fly',
      speed: 1.4, hr: 60, max: 12, minK: 2, groupSize: [2, 2], sources: ['N', 'E', 'S'], mig: 0.3, breed: [10, 11], litter: [2, 2], life: 40, mature: 4,
      suit: (W, i) => w[W.habitat[i]] * fruit(W, i),
      req: g => Math.min(1, (g.snagCount + g.bigTrees / 8) / 6) * Math.min(1, g.forestTiles / 700),
      sprite: { kind: 'macaw', size: 22, color: '#d8201a', breast: '#d8201a', head: '#d8201a', wing: '#f0c020', wingtip: '#2a5ac8' },
      desc: 'Pairs mate for life and nest in hollow dead trunks, especially old buriti palms.',
      hint: 'Big trees and dead trunks (snags or old buriti palms) for nesting, and fruit.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.4 });
    def({ key: 'harpy', name: 'Harpy eagle', sci: 'Harpia harpyja', group: 'Birds', move: 'fly', fixedMax: true,
      speed: 1.3, hr: 300, max: 2, sources: ['N'], mig: 0.1, intro: 20000, breed: [3], litter: [1, 1], life: 30, mature: 5,
      prey: ['sloth', 'howler', 'spider'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]],
      req: g => Math.min(1, g.forestTiles / 2200),
      sprite: { kind: 'raptor', size: 32, color: '#3a3a3e', breast: '#eeeeea', head: '#b8b8b4', tail: '#3a3a3e', crest: 'double', band: '#26262a', bill: '#2a2a2a', bigFeet: true, tailBars: '#a8a8a8' },
      desc: 'The most powerful eagle in the world. Plucks sloths and monkeys from the canopy.',
      hint: 'A large mature forest full of sloths and monkeys.' });
  }
  {
    const w = habW({ RIPARIAN: 1, MARSH: 0.8, SHRUB: 0.4 });
    def({ key: 'hoatzin', name: 'Hoatzin', sci: 'Opisthocomus hoazin', group: 'Birds', move: 'fly',
      speed: 0.8, hr: 8, max: 18, groupSize: [2, 5], sources: ['S'], mig: 0.4, breed: [9, 10], litter: [2, 3], life: 10, mature: 1.5,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 2, 0.1),
      sprite: { kind: 'songbird', size: 18, color: '#5a4028', breast: '#e0c090', head: '#8a5a30', crest: 'spiky', crestColor: '#c06a30', face: '#4a7ae0', eye: '#c0201a', tail: '#4a3420', tailTip: '#e0c890' },
      desc: 'The "stinkbird" digests leaves like a cow. Chicks escape predators by dropping into the water, then climb back with claws on their wings.',
      hint: 'Shrubby, leafy banks overhanging water.' });
  }
  {
    const w = habW({ MARSH: 1, POND: 0.8, CREEK: 0.7, RIVER: 0.6, RIPARIAN: 0.5 });
    def({ key: 'cocoi', name: 'Cocoi heron', sci: 'Ardea cocoi', group: 'Birds', move: 'fly',
      speed: 1.1, hr: 30, max: 6, sources: ['S'], mig: 0.35, breed: [6, 7], litter: [2, 3], life: 15, mature: 2,
      suit: (W, i) => w[W.habitat[i]] * W.waterQ[i],
      req: g => Math.min(1, g.fishIndex / 10),
      sprite: { scale: 0.72, kind: 'heron', size: 26, color: '#9aa4ac', breast: '#f0f0ec', head: '#e8e8e4', flight: '#262628' },
      desc: 'The Amazon\'s great heron. Stands motionless in the shallows, then spears a fish.',
      hint: 'Shallow water with fish.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 0.8, RIPARIAN: 0.9, SHRUB: 0.7 });
    def({ key: 'hermit', name: 'Long-tailed hermit', sci: 'Phaethornis superciliosus', group: 'Birds', move: 'fly',
      speed: 1.6, hr: 6, max: 20, sources: ['N', 'E'], mig: 0.5, breed: [8, 9, 10], litter: [2, 2], life: 5, mature: 0.5,
      suit: (W, i) => w[W.habitat[i]] * (0.2 + 0.8 * Math.min(1, W.nectar[i] * 1.5)),
      sprite: { kind: 'hummer', size: 8, color: '#6a7a4a', breast: '#c8a070', head: '#5a6a3a', tailLength: 0.68, tailGraduation: 0.52, centralTailTip: '#eee4d2' },
      desc: 'A hummingbird that "traplines" the same heliconia flowers every day, along a route it memorises.',
      hint: 'Heliconias, gingers and flowering trees.' });
  }
  {
    const w = habW({ CREEK: 1, POND: 0.9, RIVER: 0.6, MARSH: 0.5 });
    def({ key: 'amkingfisher', name: 'Amazon kingfisher', sci: 'Chloroceryle amazona', group: 'Birds', move: 'fly',
      speed: 1.5, hr: 10, max: 8, sources: ['S'], mig: 0.4, breed: [6, 7], litter: [3, 4], life: 6, mature: 1,
      suit: (W, i) => w[W.habitat[i]] * W.waterQ[i] * near(W.distPerch[i], 2, 0.4),
      req: g => Math.min(1, g.fishIndex / 8),
      sprite: { kind: 'songbird', size: 14, color: '#2a5a3a', breast: '#f2f2ee', head: '#2a5a3a', crest: true, band: '#b8502a', wingShape: 'pointed' },
      desc: 'A green-backed kingfisher that dives from branches over clear streams.',
      hint: 'Clear creeks with overhanging branches.' });
  }

  // ------------------------------------------------------------------ Reptiles & amphibians
  {
    const w = habW({ POND: 1, MARSH: 1, CREEK: 0.8, RIVER: 0.7 });
    def({ key: 'caiman', name: 'Black caiman', sci: 'Melanosuchus niger', group: 'Reptiles & amphibians', move: 'semi',
      speed: 0.9, hr: 20, max: 8, sources: ['S'], mig: 0.3, breed: [7, 8], litter: [3, 5], life: 40, mature: 5,
      prey: ['piranha', 'capybara'], preyPer: 5,
      suit: (W, i) => w[W.habitat[i]],
      sprite: { kind: 'caiman', len: 40, color: '#4a4a34', belly: '#b0a880', show: 1.3 },
      desc: 'Hunted nearly to extinction for leather, now recovering. Mothers guard their nests and carry hatchlings to the water.',
      hint: 'Ponds, marshes and slow water.' });
  }
  {
    const w = habW({ MARSH: 1, POND: 0.9, CREEK: 0.7, RIPARIAN: 0.6 });
    def({ key: 'anaconda', name: 'Green anaconda', sci: 'Eunectes murinus', group: 'Reptiles & amphibians', move: 'semi',
      speed: 0.5, hr: 25, max: 4, sources: ['S'], mig: 0.2, breed: [2], litter: [4, 6], life: 20, mature: 3,
      prey: ['capybara'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]],
      sprite: { kind: 'snake', heavy: true, size: 30, color: '#5a6a2a', stripe: '#5a6a2a', side: '#141410', blotches: '#16160f', belly: '#c8b860' },
      desc: 'The heaviest snake on Earth. Lies in swampy shallows with only its eyes above the surface.',
      hint: 'Swamps and marshes with capybara nearby.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.6, RIPARIAN: 0.7 });
    def({ key: 'dartfrog', name: 'Dyeing poison frog', sci: 'Dendrobates tinctorius', group: 'Reptiles & amphibians', move: 'semi',
      speed: 0.5, hr: 3, max: 30, sources: ['N', 'E'], mig: 0.3, breed: [9, 10, 11, 0], litter: [2, 4], life: 5, mature: 0.5,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 6, 0.5) * near(W.distLog[i], 4, 0.6),
      sprite: { kind: 'frog', size: 6, color: '#2a5ae0', dark: '#1e3a9a', spotted: '#0e0e14' },
      desc: 'Its colours warn predators away. Fathers carry tadpoles on their backs to tiny pools in bromeliads.',
      hint: 'Damp forest floor with fallen logs near water.' });
  }
  {
    const w = habW({ POND: 1, MARSH: 0.7, CREEK: 0.6, RIVER: 0.6 });
    def({ key: 'riverturtle', name: 'Yellow-spotted river turtle', sci: 'Podocnemis unifilis', group: 'Reptiles & amphibians', move: 'semi',
      speed: 0.4, hr: 12, max: 14, sources: ['S'], mig: 0.3, breed: [6, 7], litter: [3, 5], life: 40, mature: 5,
      suit: (W, i) => w[W.habitat[i]] * (W.distLog[i] <= 3 ? 1 : 0.6),
      sprite: { kind: 'turtle', size: 13, color: '#2a2a24', dark: '#3a3a30', spots: '#f0c020', show: 1.2 },
      desc: 'Basks on logs and lays eggs on sandy beaches when the river drops in the dry season.',
      hint: 'Ponds and slow water with basking logs.' });
  }

  // ------------------------------------------------------------------ River life
  {
    const w = habW({ RIVER: 1, CREEK: 0.5, POND: 0.6 });
    def({ key: 'dolphin', name: 'Amazon river dolphin', sci: 'Inia geoffrensis', group: 'River life', move: 'swim', notPrey: true, patrol: true,
      speed: 1.6, hr: 30, max: 4, sources: ['S'], mig: 0.25, breed: [10], litter: [1, 1], life: 30, mature: 5,
      suit: (W, i) => w[W.habitat[i]] * W.waterQ[i] * (W.connected[i] ? 1 : 0),
      req: g => Math.min(1, g.fishIndex / 12) * Math.min(1, g.cleanWater / 40), // clean, shaded, connected creeks
      sprite: { kind: 'dolphin', size: 30, color: '#e0a0a8', belly: '#f4c8cc', show: 1.4 },
      desc: 'The pink boto of legend. It swims into flooded forest in the high-water season, hunting between the trunks.',
      hint: 'A clean, fish-filled river and connected creeks.' });
  }
  {
    const w = habW({ POND: 1, MARSH: 0.6, CREEK: 0.4, RIVER: 0.3 });
    def({ key: 'arapaima', name: 'Arapaima (pirarucu)', sci: 'Arapaima gigas', group: 'River life', move: 'swim',
      speed: 1, hr: 20, max: 6, minK: 2, sources: ['S'], mig: 0.2, intro: 6000, breed: [6, 7], litter: [2, 3], life: 20, mature: 5,
      suit: (W, i) => w[W.habitat[i]] * W.waterQ[i],
      sprite: { kind: 'fish', size: 34, back: '#4a5a4a', flank: '#7a8a6a', belly: '#c8b89a', spots: '#c83a30', tailRed: true, long: true, rearFins: true, tailShape: 'round' },
      desc: 'One of the largest freshwater fish on Earth, up to 3 m. It gulps air at the surface every few minutes.',
      hint: 'Deep, clean ponds and oxbow lakes.' });
  }
  {
    const w = habW({ RIVER: 1, CREEK: 0.8, POND: 0.8, MARSH: 0.3 });
    def({ key: 'piranha', name: 'Red-bellied piranha', sci: 'Pygocentrus nattereri', group: 'River life', move: 'swim',
      speed: 1.6, hr: 4, max: 40, minK: 4, groupSize: [4, 8], sources: ['S'], mig: 0.5, breed: [10, 11, 0], litter: [4, 8], life: 6, mature: 0.8,
      suit: (W, i) => w[W.habitat[i]] * (W.connected[i] ? 1 : 0.5),
      sprite: { kind: 'fish', size: 10, back: '#6a7078', flank: '#9aa0a8', belly: '#e0402a', spots: '#c8c8c8', deep: true, jaw: true, tailShape: 'truncate', finEdge: '#2a2a30', show: 1.3 },
      desc: 'More scavenger than monster. Schools clean up the river and feed caiman, otters, herons and dolphins.',
      hint: 'Rivers and connected creeks.' });
  }

  return {
    groups: ['Mammals', 'Birds', 'Reptiles & amphibians', 'River life'],
    names: {
      capybara: ['capybara', 'capybaras'], tapir: ['lowland tapir', 'lowland tapirs'], jaguar: ['jaguar', 'jaguars'],
      ocelot: ['ocelot', 'ocelots'], peccary: ['collared peccary', 'collared peccaries'], agouti: ['agouti', 'agoutis'],
      anteater: ['giant anteater', 'giant anteaters'], armadillo: ['armadillo', 'armadillos'],
      howler: ['howler monkey', 'howler monkeys'], spider: ['spider monkey', 'spider monkeys'], sloth: ['sloth', 'sloths'],
      giantotter: ['giant otter', 'giant otters'], toucan: ['toco toucan', 'toco toucans'], macaw: ['scarlet macaw', 'scarlet macaws'],
      harpy: ['harpy eagle', 'harpy eagles'], hoatzin: ['hoatzin', 'hoatzins'], cocoi: ['cocoi heron', 'cocoi herons'],
      hermit: ['long-tailed hermit', 'long-tailed hermits'], amkingfisher: ['Amazon kingfisher', 'Amazon kingfishers'],
      caiman: ['black caiman', 'black caimans'], anaconda: ['green anaconda', 'green anacondas'],
      dartfrog: ['poison frog', 'poison frogs'], riverturtle: ['river turtle', 'river turtles'],
      dolphin: ['river dolphin', 'river dolphins'], arapaima: ['arapaima', 'arapaima'], piranha: ['piranha', 'piranhas'],
    },
    shy: {
      jaguar: 1, tapir: 0.8, harpy: 0.9, ocelot: 0.8, spider: 0.6, giantotter: 0.6, anteater: 0.5, peccary: 0.5,
      macaw: 0.35, toucan: 0.3, howler: 0.3, sloth: 0.1, capybara: 0.25, agouti: 0.3, armadillo: 0.2, caiman: 0.4,
      anaconda: 0.5, cocoi: 0.5, hoatzin: 0.2, hermit: 0.05, amkingfisher: 0.3, dartfrog: 0.15, riverturtle: 0.5,
      dolphin: 0.3, arapaima: 0.3, piranha: 0.05,
    },
    frugivores: ['tapir', 'spider', 'howler', 'toucan', 'macaw', 'agouti', 'peccary'],
    fenced: ['tapir'],
    damBuilders: [],
    browsers: { tapir: 0.006 },
    fishHunters: { cocoi: 'fish', amkingfisher: 'fish', dolphin: 'fish' },
  };
}
