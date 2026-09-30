// Wildlife of the Pacific lowlands of northwest Nicaragua (the Chinandega map): tropical dry forest,
// the Padre Ramos mangroves and the beach. Local Nicaraguan names are in the descriptions.
// Months: 0=Mar ... 9=Dec 10=Jan 11=Feb. The dry season is November to April.

import { habW, near } from './animals.js';
import { T } from '../config.js';

export default function buildChinandegaAnimals(def) {
  const stat = (g, k) => g.stats?.[k] || 0;
  const rainy = [2, 3, 4, 5, 6, 7];

  // ------------------------------------------------------------------ Mammals
  {
    def({ key: 'congo', name: 'Mantled howler monkey', sci: 'Alouatta palliata', group: 'Mammals', move: 'tree',
      speed: 0.7, hr: 60, max: 12, minK: 3, groupSize: [3, 5], sources: ['N'], mig: 0.3, intro: 6000, breed: [2, 3, 4], litter: [1, 1], life: 20, mature: 3,
      suit: (W, i) => (W.tree[i] && W.treeG[i] > 0.6 ? 1 : 0),
      req: g => Math.min(1, (g.forestTiles || 0) / 250),
      sprite: { kind: 'monkey', len: 18, color: '#2a1a12', belly: '#3a2418', hands: '#6a3a1e' },
      desc: 'Mono congo. Its roar at dawn carries for kilometres. It eats leaves and never comes down to the ground, so it can only live where the tree crowns join up.',
      hint: 'Tall dry forest whose crowns connect, joined to the forest on the volcano.' });
  }
  {
    def({ key: 'capuchin', name: 'White-faced capuchin', sci: 'Cebus imitator', group: 'Mammals', move: 'tree',
      speed: 1.2, hr: 80, max: 10, minK: 3, groupSize: [3, 5], sources: ['N'], mig: 0.25, breed: [2, 3], litter: [1, 1], life: 25, mature: 4,
      suit: (W, i) => (W.tree[i] && W.treeG[i] > 0.6 ? 0.6 + 0.4 * Math.min(1, W.berries[i] * 2) : 0),
      req: g => Math.min(1, (g.forestTiles || 0) / 350),
      sprite: { kind: 'monkey', len: 16, color: '#1a1612', belly: '#1a1612', face: '#f0e8d8' },
      desc: 'Mono cara blanca. A clever, noisy monkey that eats fruit, insects and eggs, and uses stones as tools.',
      hint: 'Big patches of dry forest with fruit trees.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 0.9, SHRUB: 1, RIPARIAN: 0.9, MEADOW: 0.6, FARM: 0.1, INVASIVE: 0.2 });
    def({ key: 'deer', name: 'White-tailed deer', sci: 'Odocoileus virginianus', group: 'Mammals', move: 'ground',
      speed: 1.6, hr: 50, max: 12, minK: 1.5, groupSize: [1, 3], sources: ['N', 'E'], mig: 0.35, breed: [3, 4], litter: [1, 2], life: 10,
      suit: (W, i) => w[W.habitat[i]] * near(W.distCover[i], 4, 0.3),
      sprite: { kind: 'deer', len: 32, h: 15, leg: 15, color: '#a07850', belly: '#e8dcc4', dark: '#3a2c20' },
      desc: 'Venado cola blanca, hunted nearly to nothing on the Pacific plain. It browses the forest edge and eats guanacaste and guácimo fruit.',
      hint: 'Dry forest next to open ground, with fruiting trees.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 1, SHRUB: 0.8, RIPARIAN: 1, MEADOW: 0.3 });
    def({ key: 'coati', name: 'White-nosed coati', sci: 'Nasua narica', group: 'Mammals', move: 'ground',
      speed: 1.2, hr: 40, max: 12, groupSize: [3, 5], sources: ['N', 'E'], mig: 0.3, breed: [3], litter: [2, 4], life: 8,
      suit: (W, i) => w[W.habitat[i]] * (0.5 + 0.5 * Math.min(1, W.berries[i] + W.insects[i])),
      sprite: { kind: 'raccoon', len: 26, color: '#8a6a44', belly: '#c8b08a', dark: '#3a2a1a' },
      desc: 'Pizote. Bands of females and young roam the forest floor with their tails in the air, rooting for insects and fruit.',
      hint: 'Forest with fruit and leaf litter.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 1, SHRUB: 0.8, RIPARIAN: 0.9, MEADOW: 0.5, FARM: 0.1 });
    def({ key: 'armadillo', name: 'Nine-banded armadillo', sci: 'Dasypus novemcinctus', group: 'Mammals', move: 'ground',
      speed: 0.8, hr: 15, max: 12, sources: ['N', 'E', 'W'], mig: 0.35, breed: [4], litter: [4, 4], life: 10,
      suit: (W, i) => w[W.habitat[i]] * (0.4 + 0.6 * Math.min(1, W.insects[i] * 1.5)),
      sprite: { kind: 'armadillo', len: 18, color: '#8a7a68', belly: '#c8b8a0' },
      desc: 'Cusuco. It digs for ants and beetle grubs at night and always has four identical babies.',
      hint: 'Soft, insect-rich ground under shrubs and trees.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 1, RIPARIAN: 1, SHRUB: 0.5 });
    def({ key: 'agouti', name: 'Central American agouti', sci: 'Dasyprocta punctata', group: 'Mammals', move: 'ground',
      speed: 1.4, hr: 10, max: 14, sources: ['N', 'E'], mig: 0.3, breed: [2, 3, 4], litter: [1, 2], life: 10, mature: 0.8,
      suit: (W, i) => w[W.habitat[i]] * (0.5 + 0.5 * Math.min(1, W.berries[i] * 2)),
      sprite: { kind: 'agouti', len: 16, color: '#9a6a38', belly: '#c89a60' },
      desc: 'Guatusa. It buries seeds to eat later and forgets many of them, planting the forest of the future.',
      hint: 'Forest with plenty of fallen fruit and seeds.' });
  }
  {
    const w = habW({ MARSH: 1, RIPARIAN: 1, POND: 0.6, CREEK: 0.8, YOUNG_FOREST: 0.5 });
    def({ key: 'raccoon', name: 'Crab-eating raccoon', sci: 'Procyon cancrivorus', group: 'Mammals', move: 'semi',
      speed: 1.1, hr: 30, max: 8, sources: ['S', 'E'], mig: 0.35, breed: [3], litter: [2, 4], life: 6,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 3, 0.2),
      sprite: { kind: 'raccoon', len: 22, color: '#8a8278', belly: '#b0a89c', dark: '#2a2622' },
      desc: 'Mapache cangrejero. It hunts crabs among the mangrove roots at low tide.',
      hint: 'Mangroves and tidal mud full of crabs.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 1, RIPARIAN: 1, SHRUB: 0.6 });
    def({ key: 'ocelot', name: 'Ocelot', sci: 'Leopardus pardalis', group: 'Mammals', move: 'ground',
      speed: 1.6, hr: 220, max: 2, sources: ['N'], mig: 0.2, breed: [4], litter: [1, 2], life: 12, mature: 2,
      prey: ['agouti', 'armadillo', 'iguana'], preyPer: 7,
      suit: (W, i) => w[W.habitat[i]],
      req: g => Math.min(1, (g.forestTiles || 0) / 400),
      sprite: { kind: 'feline', len: 30, h: 12, leg: 10, color: '#c8a068', belly: '#f0e4c8', dark: '#2a2018', longtail: true, rosettes: true, chains: true },
      desc: 'Tigrillo. A beautiful spotted cat that hunts agoutis and iguanas at night. Its return means the forest is big and whole again.',
      hint: 'A large area of connected dry forest with agoutis and iguanas.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 1, RIPARIAN: 1, MARSH: 0.6, MEADOW: 0.5 });
    def({ key: 'bat', name: 'Jamaican fruit bat', sci: 'Artibeus jamaicensis', group: 'Mammals', move: 'fly',
      speed: 3, hr: 10, max: 20, sources: ['N', 'E', 'S', 'W'], mig: 0.4, breed: [2, 8], litter: [1, 1], life: 8,
      suit: (W, i) => w[W.habitat[i]] * (0.3 + 0.7 * Math.min(1, W.berries[i] * 2 + W.nectar[i])),
      sprite: { kind: 'bat', size: 12, color: '#5a4a3e' },
      desc: 'Murciélago frutero. It carries figs away to eat and drops the seeds far across the open land: one of the best tree planters there is.',
      hint: 'Fruiting trees, especially figs.' });
  }

  // ------------------------------------------------------------------ The herd
  // The cooperative's cattle: domestic, so they don't count as wildlife. They graze the pasture and
  // do best (and give the most milk) where there are shade trees in it; out in the open in the dry
  // season they lose weight. They nibble young trees that aren't protected.
  {
    const w = habW({ FARM: 1, MEADOW: 0.9, INVASIVE: 0.7, SHRUB: 0.3, YOUNG_FOREST: 0.35, BARE: 0.1 });
    def({ key: 'cattle', domestic: true, fixedMax: true, name: 'Brahman cattle', sci: 'Bos indicus', group: 'The herd', move: 'ground',
      herd: true, herdR: 3, herdMax: 12, speed: 0.9, hr: 14, max: 48, sources: [], mig: 0, breed: [2, 3, 4], litter: [1, 1], life: 14, mature: 2,
      suit: (W, i) => w[W.habitat[i]] * (0.5 + 0.5 * Math.min(1, W.graze[i] * 1.5)) * (W.canopy[i] > 0.2 || W.distForest[i] <= 2 ? 1.2 : 1),
      req: g => Math.min(1.3, 0.6 + stat(g, 'silvo') / 400),
      sprite: { kind: 'buffalo', len: 38, h: 20, leg: 14, color: '#e4ded2', belly: '#f0ece2', dark: '#7a7266' },
      desc: 'Ganado. The cooperative\'s herd of white, heat-tough Brahman cows. With shade trees and living fences in the pasture they stay cool through the dry season, give more milk, and share the farm with the wildlife instead of pushing it out.',
      hint: 'Pasture with shade trees in it: silvopasture.' });
  }

  // ------------------------------------------------------------------ Birds
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 0.9, RIPARIAN: 1, SHRUB: 0.7, MEADOW: 0.3 });
    def({ key: 'motmot', name: 'Turquoise-browed motmot', sci: 'Eumomota superciliosa', group: 'Birds', move: 'fly',
      speed: 2.4, hr: 10, max: 12, sources: ['N', 'E'], mig: 0.4, breed: [2, 3], litter: [2, 4], life: 6,
      suit: (W, i) => w[W.habitat[i]] * (0.4 + 0.6 * Math.min(1, W.insects[i] * 1.5)) * (W.distWater[i] <= 8 ? 1 : 0.6),
      // it digs its nest burrow in the banks of a shaded quebrada: the bare, sun-baked stream the
      // finca starts with (about an eighth of it shaded) isn't enough
      req: g => Math.max(0, Math.min(1, (stat(g, 'shadedCreek') / Math.max(1, stat(g, 'creek')) - 0.18) / 0.2)),
      sprite: { kind: 'songbird', size: 15, color: '#3a8a6a', breast: '#c8803a', head: '#2a7a5a', face: '#50c8e8', tail: '#2a5a8a', tailTip: '#50a0d8' },
      desc: 'Guardabarranco, the national bird of Nicaragua. It swings its racket-tipped tail like a pendulum and nests in burrows it digs in the banks of the quebradas.',
      hint: 'Dry forest near stream banks, with plenty of insects, and a quebrada with shade along its banks (at least a fifth of it, more is better).' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 1, RIPARIAN: 1, MEADOW: 0.3, SHRUB: 0.5 });
    def({ key: 'lora', name: 'Yellow-naped parrot', sci: 'Amazona auropalliata', group: 'Birds', move: 'fly',
      speed: 2.6, hr: 40, max: 10, groupSize: [2, 2], sources: ['N'], mig: 0.3, breed: [11, 0], litter: [1, 2], life: 40, mature: 3,
      suit: (W, i) => w[W.habitat[i]] * (0.4 + 0.6 * Math.min(1, W.berries[i] * 2)),
      req: g => Math.min(1, (g.bigTrees || 0) / 20),
      sprite: { kind: 'macaw', size: 18, color: '#3a9a3a', breast: '#4aaa44', head: '#48a840', wing: '#3a8a3a', wingtip: '#2a5a9a' },
      desc: 'Lora nuca amarilla. A talking parrot so often taken from its nest for pets that it is now critically endangered. It nests in holes in big old trees.',
      hint: 'Big old trees for nest holes, and fruiting dry forest.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 0.8, RIPARIAN: 0.9, SHRUB: 0.6, MEADOW: 0.5, FARM: 0.1 });
    def({ key: 'chocoyo', name: 'Orange-fronted parakeet', sci: 'Eupsittula canicularis', group: 'Birds', move: 'fly',
      speed: 3, hr: 20, max: 20, groupSize: [4, 6], sources: ['N', 'E'], mig: 0.4, breed: [0, 1], litter: [2, 4], life: 15,
      suit: (W, i) => w[W.habitat[i]] * (0.4 + 0.6 * Math.min(1, W.berries[i] * 2 + W.nectar[i])),
      sprite: { kind: 'macaw', size: 12, color: '#4aa844', breast: '#8ac860', head: '#4aa844', wing: '#3a9a3a', wingtip: '#3a6ab0' },
      desc: 'Chocoyo. Noisy flocks of little green parakeets that dig their nests into termite mounds in the trees.',
      hint: 'Trees with fruit, flowers and seeds.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 0.7, RIPARIAN: 0.9, SHRUB: 0.8, MEADOW: 0.4 });
    def({ key: 'urraca', name: 'White-throated magpie-jay', sci: 'Calocitta formosa', group: 'Birds', move: 'fly',
      speed: 2.5, hr: 16, max: 14, groupSize: [2, 4], sources: ['N', 'E', 'W'], mig: 0.4, breed: [1, 2], litter: [2, 4], life: 8,
      suit: (W, i) => w[W.habitat[i]],
      sprite: { kind: 'songbird', size: 16, color: '#3a5aa8', breast: '#f2f2ee', head: '#3a5aa8', crest: 'spiky', crestColor: '#1a1a2a', tail: '#3a5aa8' },
      desc: 'Urraca. A loud blue-and-white jay with a curled crest and a very long tail, always in a gang.',
      hint: 'Open dry forest and forest edges.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 1, RIPARIAN: 0.9, YOUNG_FOREST: 0.6, MARSH: 0.6 });
    def({ key: 'hummingbird', name: 'Cinnamon hummingbird', sci: 'Amazilia rutila', group: 'Birds', move: 'fly',
      speed: 3, hr: 6, max: 12, sources: ['N', 'E', 'S', 'W'], mig: 0.5, breed: [5, 6, 7], litter: [2, 2], life: 4,
      suit: (W, i) => w[W.habitat[i]] * Math.min(1, 0.1 + W.nectar[i] * 1.5),
      sprite: { kind: 'hummer', size: 8, color: '#4a8a4a', breast: '#d89a60', head: '#4a8a4a' },
      desc: 'Colibrí canelo. It feeds on firebush, sage and the dry-season blossoms of the trees.',
      hint: 'Flowers through the year: firebush, sage, and flowering trees.' });
  }
  {
    const w = habW({ MARSH: 1, POND: 1, RIVER: 0.6, CREEK: 0.6 });
    // (wide-ranging waders: they find fresh mudflats quickly)
    def({ key: 'spoonbill', name: 'Roseate spoonbill', sci: 'Platalea ajaja', group: 'Birds', move: 'fly', quick: true,
      speed: 2.2, hr: 40, max: 8, groupSize: [2, 4], sources: ['S'], mig: 0.7, breed: [], life: 15,
      suit: (W, i) => w[W.habitat[i]] * (0.4 + 0.6 * W.waterQ[i]),
      req: g => Math.min(1, stat(g, 'pondsDrained') / 60), // it feeds on the tidal mudflats left where shrimp ponds are breached
      sprite: { kind: 'heron', size: 24, color: '#e8a0b8', breast: '#f0b8c8', head: '#f0e8e0', flight: '#d85a80' },
      desc: 'Garza rosada. It sweeps its spoon-shaped bill through the shallows for shrimp, which is what turns it pink.',
      hint: 'Tidal mudflats where old shrimp ponds have been breached and drained, with mangroves around them.' });
  }
  {
    const w = habW({ MARSH: 1, POND: 1, RIVER: 0.7, CREEK: 0.7, RIPARIAN: 0.4 });
    def({ key: 'egret', name: 'Great egret', sci: 'Ardea alba', group: 'Birds', move: 'fly',
      speed: 2.2, hr: 40, max: 8, sources: ['S', 'W'], mig: 0.4, breed: [3, 4], litter: [2, 3], life: 15,
      suit: (W, i) => w[W.habitat[i]] * (0.4 + 0.6 * W.waterQ[i]),
      sprite: { kind: 'heron', size: 26, color: '#f4f4ee', breast: '#fafaf6', head: '#f8f8f4', flight: '#f0f0ea' },
      desc: 'Garza blanca. It stalks fish and crabs in the shallows and roosts in the mangroves at night.',
      hint: 'Shallow water, mangroves and the estuary.' });
  }
  {
    const w = habW({ RIPARIAN: 1, MATURE_FOREST: 1, YOUNG_FOREST: 0.7, MEADOW: 0.5 });
    def({ key: 'guaco', name: 'Laughing falcon', sci: 'Herpetotheres cachinnans', group: 'Birds', move: 'fly',
      speed: 2.8, hr: 120, max: 2, sources: ['N', 'E'], mig: 0.25, breed: [0, 1], litter: [1, 1], life: 12,
      prey: ['boa', 'iguana'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]],
      sprite: { kind: 'raptor', size: 22, color: '#5a4030', breast: '#f0e0c0', head: '#f0e0c0', tail: '#2a2622', tailBars: '#f0e0c0' },
      desc: 'Guaco. A falcon that hunts snakes, and whose loud "guaco, guaco" call, people say, brings the rain.',
      hint: 'Tall trees at the forest edge with snakes to hunt.' });
  }

  // ------------------------------------------------------------------ Reptiles
  {
    const w = habW({ YOUNG_FOREST: 1, RIPARIAN: 1, MATURE_FOREST: 0.8, SHRUB: 0.6, MARSH: 0.5 });
    def({ key: 'iguana', name: 'Green iguana', sci: 'Iguana iguana', group: 'Reptiles', move: 'semi',
      speed: 0.7, hr: 8, max: 20, sources: ['S', 'N', 'E'], mig: 0.3, breed: [0, 1], litter: [4, 8], life: 15, mature: 2,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 6, 0.35),
      sprite: { kind: 'monitor', size: 26, color: '#5a9a3a', belly: '#b8c878' },
      desc: 'Garrobo verde. It eats leaves high in the trees along water, and dives in when danger comes. Hunted for food, it has become rare.',
      hint: 'Trees along the quebrada and the estuary.' });
  }
  {
    const w = habW({ SHRUB: 1, YOUNG_FOREST: 1, MEADOW: 0.6, RIPARIAN: 0.6, DEVELOPED: 0.3, FARM: 0.1 });
    def({ key: 'ctenosaur', name: 'Black spiny-tailed iguana', sci: 'Ctenosaura similis', group: 'Reptiles', move: 'ground',
      speed: 1.2, hr: 6, max: 20, sources: ['N', 'E', 'W'], mig: 0.4, breed: [0], litter: [4, 8], life: 12, mature: 1.5,
      suit: (W, i) => w[W.habitat[i]] * (W.distRocks[i] <= 4 || W.distLog[i] <= 4 ? 1 : 0.6),
      sprite: { kind: 'monitor', size: 22, color: '#4a4a3a', belly: '#9a9a70' },
      desc: 'Garrobo negro. It basks on rocks and old fences and is the fastest lizard in the world on land.',
      hint: 'Sunny rocks, logs and shrubs.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 1, SHRUB: 0.8, RIPARIAN: 0.8, MEADOW: 0.4 });
    def({ key: 'boa', name: 'Boa constrictor', sci: 'Boa imperator', group: 'Reptiles', move: 'semi',
      speed: 0.4, hr: 30, max: 5, sources: ['N', 'E'], mig: 0.2, breed: [3], litter: [6, 10], life: 20, mature: 3,
      prey: ['agouti', 'ctenosaur'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]],
      sprite: { kind: 'snake', size: 30, color: '#9a8a6a', stripe: '#9a8a6a', side: '#3a2a1e', blotches: '#5a3a24', belly: '#d8c8a0' },
      desc: 'Boa. Big and harmless to people, it keeps the rats down around the farms.',
      hint: 'Forest and shrubs with small animals to eat.' });
  }
  {
    const w = habW({ RIVER: 1, MARSH: 0.9, POND: 0.7, CREEK: 0.6 });
    def({ key: 'crocodile', name: 'American crocodile', sci: 'Crocodylus acutus', group: 'Reptiles', move: 'semi',
      speed: 0.8, hr: 40, max: 4, sources: ['S'], mig: 0.2, breed: [0], litter: [3, 5], life: 50, mature: 8,
      prey: ['snook', 'raccoon'], preyPer: 8,
      suit: (W, i) => w[W.habitat[i]] * (W.connected[i] ? 1 : 0.4),
      req: g => Math.min(1, stat(g, 'mangrove') / 80),
      sprite: { kind: 'caiman', len: 48, color: '#6a6a4a', belly: '#c8c090' },
      desc: 'Cocodrilo. It basks on the mudbanks of the estuary. Shy, and hunted out of most of the coast.',
      hint: 'A wide, quiet estuary with mangroves.' });
  }
  {
    def({ key: 'seaturtle', name: 'Olive ridley sea turtle', sci: 'Lepidochelys olivacea', group: 'Reptiles', move: 'semi',
      speed: 0.4, hr: 6, max: 12, sources: ['S'], mig: 0.5, breed: [], life: 50, mature: 0, season: [4, 5, 6, 7, 8], // (mature 0: hatchlings are drawn at half size, not smaller)
      // nests on clean, dark, quiet beach sand with dune plants behind it
      suit: (W, i) => (W.terrain[i] === T.GRAVEL && W.distWater[i] <= 3 ? 1 : 0) * (1 - Math.min(1, W.disturb[i] * 2)),
      req: g => Math.min(1, stat(g, 'beach') / 30) * Math.min(1, Math.max(0, stat(g, 'beachPlants') - 8) / 20), // (the bare beach isn't enough: it needs dune plants)
      sprite: { kind: 'turtle', size: 20, color: '#5a6a4a', dark: '#7a8a5a', show: 1.3, juv: 0.55 },
      desc: 'Paslama. From July to December the females crawl up the beach at night to dig a nest and lay about 100 eggs. Poaching, dogs and lights all drive them away.',
      hint: 'A quiet stretch of beach sand, with dune plants and no trail or buildings close by. They come July to November.' });
  }

  // ------------------------------------------------------------------ Fish
  {
    const w = habW({ RIVER: 1, MARSH: 0.9, CREEK: 0.7, POND: 0.4 });
    def({ key: 'snook', name: 'Common snook', sci: 'Centropomus undecimalis', group: 'Fish', move: 'swim',
      speed: 1.6, hr: 6, max: 20, minK: 2, sources: ['S'], mig: 0.4, breed: [4, 5], litter: [2, 4], life: 10, mature: 2,
      suit: (W, i) => w[W.habitat[i]] * (0.3 + 0.7 * W.waterQ[i]) * (W.connected[i] ? 1 : 0.3),
      req: g => Math.min(1, 0.3 + stat(g, 'mangrove') / 60),
      sprite: { kind: 'fish', size: 20, back: '#6a7068', flank: '#c8c8b8', belly: '#f0eee4', spots: '#2a2a2a' },
      desc: 'Róbalo. The young grow up hiding among the mangrove roots; the adults feed families along the whole coast.',
      hint: 'Mangrove channels connected to the estuary.' });
  }
  {
    const w = habW({ RIVER: 1, MARSH: 0.8, CREEK: 0.6, POND: 0.5 });
    def({ key: 'snapper', name: 'Mangrove snapper', sci: 'Lutjanus griseus', group: 'Fish', move: 'swim',
      speed: 1.4, hr: 4, max: 24, minK: 2, sources: ['S'], mig: 0.4, breed: [3, 4, 5], litter: [3, 5], life: 8, mature: 1.5,
      suit: (W, i) => w[W.habitat[i]] * (0.3 + 0.7 * W.waterQ[i]) * (W.connected[i] ? 1 : 0.3),
      sprite: { kind: 'fish', size: 14, back: '#7a5a4a', flank: '#b88a6a', belly: '#e8d0b0', spots: '#6a3a2a' },
      desc: 'Pargo. Another fish that needs the mangroves as a nursery before it heads out to the reefs.',
      hint: 'Clean mangrove channels.' });
  }

  return {
    groups: ['Mammals', 'Birds', 'Reptiles', 'Fish', 'The herd'],
    names: {
      congo: ['howler monkey', 'howler monkeys'], capuchin: ['white-faced capuchin', 'white-faced capuchins'], deer: ['white-tailed deer', 'white-tailed deer'],
      coati: ['coati', 'coatis'], armadillo: ['armadillo', 'armadillos'], agouti: ['agouti', 'agoutis'], raccoon: ['crab-eating raccoon', 'crab-eating raccoons'],
      ocelot: ['ocelot', 'ocelots'], bat: ['fruit bat', 'fruit bats'], motmot: ['turquoise-browed motmot', 'turquoise-browed motmots'],
      lora: ['yellow-naped parrot', 'yellow-naped parrots'], chocoyo: ['orange-fronted parakeet', 'orange-fronted parakeets'], urraca: ['magpie-jay', 'magpie-jays'],
      hummingbird: ['cinnamon hummingbird', 'cinnamon hummingbirds'], spoonbill: ['roseate spoonbill', 'roseate spoonbills'], egret: ['great egret', 'great egrets'],
      guaco: ['laughing falcon', 'laughing falcons'], iguana: ['green iguana', 'green iguanas'], ctenosaur: ['spiny-tailed iguana', 'spiny-tailed iguanas'],
      boa: ['boa', 'boas'], crocodile: ['American crocodile', 'American crocodiles'], seaturtle: ['olive ridley turtle', 'olive ridley turtles'],
      snook: ['snook', 'snook'], snapper: ['mangrove snapper', 'mangrove snapper'], cattle: ['cow', 'cattle'],
    },
    shy: {
      congo: 0.3, capuchin: 0.3, deer: 0.6, coati: 0.3, armadillo: 0.3, agouti: 0.4, raccoon: 0.3, ocelot: 0.9, bat: 0.1,
      motmot: 0.3, lora: 0.5, chocoyo: 0.2, urraca: 0.1, hummingbird: 0, spoonbill: 0.5, egret: 0.3, guaco: 0.4,
      iguana: 0.4, ctenosaur: 0.1, boa: 0.3, crocodile: 0.8, seaturtle: 0.9, snook: 0.2, snapper: 0.2, cattle: 0,
    },
    frugivores: ['capuchin', 'coati', 'agouti', 'bat', 'lora', 'chocoyo', 'urraca'], fenced: ['deer'],
    browsers: { deer: 0.012, cattle: 0.02 },
  };
}
