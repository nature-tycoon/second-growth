// Pacific Northwest wildlife (the Hollis farm map). Each species describes where it can live
// (suit: per-tile 0..1) and what it needs across the whole property (req: multiplier on
// carrying capacity). Carrying capacity K = sum(suit) / hr (home range in tiles), capped at max.
// Months: 0=Mar ... 9=Dec 10=Jan 11=Feb

import { habW, near } from './animals.js';

export default function buildPnwAnimals(def) {
  // ------------------------------------------------------------------ Mammals
  {
    const w = habW({ MEADOW: 1, RIPARIAN: 0.5, SHRUB: 0.3, INVASIVE: 0.15, FARM: 0.025, MARSH: 0.2 });
    def({ key: 'vole', name: "Townsend's vole", sci: 'Microtus townsendii', group: 'Mammals', move: 'ground',
      speed: 0.8, hr: 6, max: 36, sources: ['W', 'E', 'N'], mig: 0.6, breed: [0, 1, 2, 3, 4, 5, 6], litter: [2, 4], life: 1.3, mature: 0.15,
      suit: (W, i) => w[W.habitat[i]] * (0.5 + 0.5 * Math.min(1, W.graze[i] * 1.5)),
      sprite: { kind: 'rodent', len: 12, color: '#6b5642', belly: '#8d7a62' },
      desc: 'A chunky meadow vole. Not glamorous, but it feeds hawks, owls, coyotes and snakes.',
      hint: 'Grassy native meadows.' });
  }
  {
    const w = habW({ SHRUB: 1, RIPARIAN: 0.8, INVASIVE: 0.55, MEADOW: 0.35, YOUNG_FOREST: 0.45 });
    def({ key: 'rabbit', name: 'Brush rabbit', sci: 'Sylvilagus bachmani', group: 'Mammals', move: 'ground',
      speed: 1.3, hr: 14, max: 20, sources: ['W', 'E'], mig: 0.4, breed: [0, 1, 2, 3, 4, 5], litter: [2, 4], life: 3, mature: 0.3,
      suit: (W, i) => w[W.habitat[i]] * near(W.distCover[i], 2, 0.3),
      sprite: { kind: 'rabbit', len: 18, color: '#7a6448', belly: '#a89478', show: 1.3 },
      desc: 'A small, dark rabbit that never strays far from dense brush.',
      hint: 'Dense shrubs next to open ground.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.35 });
    def({ key: 'squirrel', name: 'Douglas squirrel', sci: 'Tamiasciurus douglasii', group: 'Mammals', move: 'ground',
      speed: 1.4, hr: 12, max: 20, sources: ['N', 'E'], mig: 0.4, breed: [1, 2], litter: [2, 4], life: 5, mature: 0.5,
      suit: (W, i) => w[W.habitat[i]] * (W.conifer[i] ? 1 : 0.25),
      sprite: { kind: 'squirrel', len: 14, color: '#6e4a2e', belly: '#d9954a', show: 1.25 },
      desc: 'The chattering "chickaree" of conifer forests. Stashes cones and plants accidental forests.',
      hint: 'Maturing conifer forest.' });
  }
  {
    const w = habW({ MEADOW: 0.7, SHRUB: 1, YOUNG_FOREST: 0.9, RIPARIAN: 0.85, MATURE_FOREST: 0.45, INVASIVE: 0.25, FARM: 0.05, MARSH: 0.2 });
    def({ key: 'deer', name: 'Black-tailed deer', sci: 'Odocoileus hemionus columbianus', group: 'Mammals', move: 'ground',
      speed: 1.6, hr: 45, max: 14, minK: 1.5, groupSize: [1, 2], sources: ['N', 'E'], mig: 0.35, breed: [2, 3], litter: [1, 2], life: 10,
      suit: (W, i) => w[W.habitat[i]] * near(W.distCover[i], 4, 0.3) * (0.6 + 0.4 * Math.min(1, W.browse[i])),
      sprite: { kind: 'deer', len: 34, h: 16, leg: 16, color: '#8a6a48', belly: '#c9b595', dark: '#3a2c20' },
      desc: 'Coastal mule deer. Browses shrubs along forest edges and hides fawns in tall grass.',
      hint: 'A patchwork of shrubs, young forest and meadow. Fences stop deer from wandering in.' });
  }
  {
    const w = habW({ MEADOW: 1, YOUNG_FOREST: 0.6, MATURE_FOREST: 0.55, RIPARIAN: 0.6, SHRUB: 0.5, MARSH: 0.25 });
    def({ key: 'elk', name: 'Roosevelt elk', sci: 'Cervus canadensis roosevelti', group: 'Mammals', move: 'ground',
      speed: 1.5, hr: 120, max: 14, minK: 3, groupSize: [3, 5], sources: ['N'], mig: 0.3, intro: 15000,
      breed: [2, 3], litter: [1, 1], life: 14, mature: 2,
      suit: (W, i) => w[W.habitat[i]],
      req: g => Math.min(1, g.forestTiles / 120),
      sprite: { kind: 'deer', len: 48, h: 22, leg: 22, color: '#8f6b45', belly: '#b89770', dark: '#4a3322', neck: '#4f3a28', rump: '#d9c6a0', antlers: 'elk' },
      desc: 'The largest elk in North America. Herds graze meadows and shelter in old forest.',
      hint: 'Large native meadows beside forest.' });
  }
  {
    const wt = habW({ CREEK: 1, POND: 0.9, MARSH: 0.8, RIVER: 0.3, RIPARIAN: 0.35 });
    def({ key: 'beaver', name: 'North American beaver', sci: 'Castor canadensis', group: 'Mammals', move: 'semi',
      speed: 0.9, hr: 40, max: 8, groupSize: [2, 2], sources: ['S'], mig: 0.2, intro: 3000,
      breed: [1], litter: [1, 3], life: 12, mature: 2,
      suit: (W, i) => wt[W.habitat[i]] * near(W.distWoody[i], 3, 0.1),
      sprite: { kind: 'beaver', len: 26, color: '#5b3f2a', belly: '#6d4d34' },
      desc: 'Nature\'s engineer. Beavers dam creeks, flood new wetlands, and coppice willow and alder.',
      hint: 'A creek or pond lined with willow, alder or cottonwood.' });
  }
  {
    const wt = habW({ POND: 1, CREEK: 0.85, MARSH: 0.6, RIVER: 0.8, RIPARIAN: 0.25 });
    def({ key: 'otter', name: 'North American river otter', sci: 'Lontra canadensis', group: 'Mammals', move: 'semi',
      speed: 1.6, hr: 70, max: 4, groupSize: [1, 2], sources: ['S'], mig: 0.3, breed: [1], litter: [1, 3], life: 10,
      suit: (W, i) => wt[W.habitat[i]] * (0.4 + 0.6 * W.waterQ[i]) * (W.connected[i] ? 1 : 0.5),
      req: g => g.fishIndex >= 4 ? 1 : g.fishIndex / 4,
      sprite: { kind: 'otter', len: 30, color: '#4a3526', belly: '#8a7358' },
      desc: 'Playful and always hungry. Otters travel whole watersheds following fish.',
      hint: 'Clean, fish-filled water connected to the river.' });
  }
  {
    const w = habW({ RIPARIAN: 1, MARSH: 0.6, YOUNG_FOREST: 0.6, MATURE_FOREST: 0.5, SHRUB: 0.5, DEVELOPED: 0.35, FARM: 0.03, INVASIVE: 0.4 });
    def({ key: 'raccoon', name: 'Raccoon', sci: 'Procyon lotor', group: 'Mammals', move: 'ground',
      speed: 1.1, hr: 35, max: 8, sources: ['W', 'E'], mig: 0.4, breed: [2], litter: [2, 4], life: 5,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 6, 0.4),
      sprite: { kind: 'raccoon', len: 22, color: '#77716a', belly: '#9c958c', dark: '#2a2622' },
      desc: 'A clever generalist that forages frogs, crayfish, berries and anything left in the barn.',
      hint: 'Anywhere near water with some cover. Not picky.' });
  }
  {
    const w = habW({ MEADOW: 1, FARM: 0.35, SHRUB: 0.6, YOUNG_FOREST: 0.35, INVASIVE: 0.3, RIPARIAN: 0.4 });
    def({ key: 'coyote', name: 'Coyote', sci: 'Canis latrans', group: 'Mammals', move: 'ground',
      speed: 2, hr: 130, max: 5, sources: ['E', 'W'], mig: 0.3, breed: [2], litter: [2, 4], life: 8,
      prey: ['vole', 'rabbit'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]],
      sprite: { kind: 'canine', len: 30, h: 12, leg: 13, color: '#9c8466', belly: '#cdbfa6', dark: '#4a3b2c' },
      desc: 'An adaptable hunter of voles and rabbits. Keeps rodent numbers in check.',
      hint: 'Open ground with plenty of voles and rabbits.' });
  }
  {
    const w = habW({ SHRUB: 1, YOUNG_FOREST: 1, MATURE_FOREST: 0.7, RIPARIAN: 0.8, MEADOW: 0.35 });
    def({ key: 'bobcat', name: 'Bobcat', sci: 'Lynx rufus', group: 'Mammals', move: 'ground',
      speed: 1.6, hr: 180, max: 3, sources: ['E', 'N'], mig: 0.25, breed: [2], litter: [1, 3], life: 10,
      prey: ['rabbit', 'vole', 'squirrel'], preyPer: 7,
      suit: (W, i) => w[W.habitat[i]],
      sprite: { kind: 'feline', len: 26, h: 12, leg: 12, color: '#a0825c', belly: '#d8c7a8', dark: '#4d3a28', bobtail: true },
      desc: 'A secretive, spotted wild cat that ambushes rabbits from brushy cover.',
      hint: 'Brushy young forest with lots of rabbits.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.8, RIPARIAN: 0.9, SHRUB: 0.7, MEADOW: 0.3, MARSH: 0.3 });
    def({ key: 'bear', name: 'American black bear', sci: 'Ursus americanus', group: 'Mammals', move: 'ground',
      speed: 1.2, hr: 400, max: 2, sources: ['N'], mig: 0.25, breed: [3], litter: [1, 2], life: 20, mature: 3,
      suit: (W, i) => w[W.habitat[i]],
      req: g => Math.min(1, g.berryTiles / 150) * (g.forestTiles > 150 ? 1 : g.forestTiles / 150) + g.salmonBonus,
      sprite: { kind: 'bear', len: 40, h: 22, leg: 12, color: '#1f1a17', belly: '#2d2622', muzzle: '#8a6a4a' },
      desc: 'Mostly eats berries, roots and insects, plus salmon in the fall. Needs a big, wild home.',
      hint: 'Forest with lots of berry shrubs. Salmon help a lot.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.8, SHRUB: 0.5, RIPARIAN: 0.6 });
    def({ key: 'cougar', fixedMax: true, name: 'Cougar', sci: 'Puma concolor', group: 'Mammals', move: 'ground',
      speed: 1.8, hr: 450, max: 1, sources: ['N'], mig: 0.3, breed: [], life: 12, mature: 2,
      prey: ['deer', 'elk'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]],
      sprite: { kind: 'feline', len: 42, h: 16, leg: 16, color: '#b08a5e', belly: '#e0cfb0', dark: '#4d3a28', longtail: true },
      desc: 'The apex predator of Cascadia. Its presence keeps deer moving so streamside plants can recover.',
      hint: 'Forest and a healthy deer or elk herd.' });
  }
  {
    const w = habW({ POND: 1, MARSH: 1, CREEK: 0.8, MEADOW: 0.6, RIPARIAN: 0.8, YOUNG_FOREST: 0.4, RIVER: 0.5 });
    def({ key: 'bat', name: 'Little brown bat', sci: 'Myotis lucifugus', group: 'Mammals', move: 'fly',
      speed: 3, hr: 8, max: 20, sources: ['N', 'E', 'S', 'W'], mig: 0.3, breed: [3], litter: [1, 1], life: 8,
      season: [0, 1, 2, 3, 4, 5, 6, 7],
      suit: (W, i) => w[W.habitat[i]] * Math.min(1, W.insects[i] * 1.4),
      req: g => Math.min(1, (g.snagCount * 3 + g.nestboxCount * 5 + g.structureCount * 4) / 20),
      sprite: { kind: 'bat', size: 12, color: '#4a3a30' },
      desc: 'Eats up to half its weight in insects each night over ponds and meadows. Hibernates off-site in winter.',
      hint: 'Insect-rich water and meadows, plus roosts: snags, nest boxes or old buildings.' });
  }

  // ------------------------------------------------------------------ Birds
  {
    const w = habW({ MEADOW: 0.8, SHRUB: 0.85, YOUNG_FOREST: 0.8, RIPARIAN: 0.9, MATURE_FOREST: 0.4, FARM: 0.04, DEVELOPED: 0.3, INVASIVE: 0.3 });
    def({ key: 'robin', name: 'American robin', sci: 'Turdus migratorius', group: 'Birds', move: 'fly',
      speed: 3, hr: 12, max: 20, sources: ['N', 'E', 'S', 'W'], mig: 0.5, breed: [1, 2, 3], litter: [2, 3], life: 3,
      suit: (W, i) => w[W.habitat[i]] * (0.6 + 0.4 * Math.min(1, W.berries[i] + W.insects[i])),
      sprite: { kind: 'songbird', size: 12, color: '#5a5048', breast: '#d86a2e', head: '#2e2926', bill: '#e0a830', ring: '#f2eee6' },
      desc: 'Tugs worms from lawns and gorges on berries, spreading seeds as it goes.',
      hint: 'Almost anywhere with some trees and open ground.' });
  }
  {
    def({ key: 'hummingbird', name: 'Rufous hummingbird', sci: 'Selasphorus rufus', group: 'Birds', move: 'fly',
      speed: 4, hr: 6, max: 14, sources: ['S'], mig: 0.5, breed: [2, 3], litter: [1, 2], life: 4,
      season: [0, 1, 2, 3, 4, 5],
      suit: (W, i) => Math.min(1, W.nectar[i] * 1.2) * near(W.distCover[i], 3, 0.3),
      sprite: { kind: 'hummer', size: 7, color: '#c8642e', breast: '#f0e4d4', head: '#b8682e', gorget: '#e8482a' },
      desc: 'Flies 3,000 miles from Mexico each spring, timing its arrival with salmonberry flowers.',
      hint: 'Lots of flowers blooming in spring and summer.' });
  }
  {
    const w = habW({ MEADOW: 1, FARM: 0.005 });
    def({ key: 'meadowlark', name: 'Western meadowlark', sci: 'Sturnella neglecta', group: 'Birds', move: 'fly',
      speed: 3, hr: 20, max: 10, minK: 2, sources: ['S', 'W'], mig: 0.35, breed: [1, 2, 3], litter: [2, 3], life: 4,
      suit: (W, i) => w[W.habitat[i]] * (W.distForest[i] >= 4 ? 1 : 0.25),
      sprite: { kind: 'songbird', size: 13, color: '#8a6e4a', breast: '#f0c83a', head: '#7a6040', vee: true },
      desc: 'Its flute-like song was once the sound of every Puget lowland prairie. Now rare west of the Cascades.',
      hint: 'Big, open native meadows away from trees.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.7, RIPARIAN: 0.4 });
    def({ key: 'jay', name: "Steller's jay", sci: 'Cyanocitta stelleri', group: 'Birds', move: 'fly',
      speed: 3, hr: 25, max: 10, sources: ['N', 'E'], mig: 0.4, breed: [1, 2], litter: [2, 3], life: 6,
      suit: (W, i) => w[W.habitat[i]] * (W.conifer[i] || W.distForest[i] <= 1 ? 1 : 0.4),
      sprite: { kind: 'songbird', size: 14, color: '#2a4a8a', breast: '#3a62a8', head: '#1c1c2a', crest: true },
      desc: 'A loud, crested blue jay of conifer forests. Buries seeds and forgets some, planting trees.',
      hint: 'Conifer forest.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.3, RIPARIAN: 0.3 });
    def({ key: 'woodpecker', name: 'Pileated woodpecker', sci: 'Dryocopus pileatus', group: 'Birds', move: 'fly',
      speed: 3, hr: 150, max: 3, sources: ['N'], mig: 0.3, breed: [1, 2], litter: [1, 2], life: 9,
      suit: (W, i) => w[W.habitat[i]] * near(W.distSnag[i], 5, 0.25),
      req: g => Math.min(1, g.snagCount / 4),
      sprite: { kind: 'woodpecker', size: 16, color: '#1e1c1c', breast: '#1e1c1c', head: '#d8322a' },
      desc: 'A crow-sized woodpecker whose rectangular holes become homes for owls, ducks and bats.',
      hint: 'Mature forest with standing dead trees (snags).' });
  }
  {
    const w = habW({ MARSH: 1, POND: 0.6, CREEK: 0.8, RIVER: 0.35 });
    def({ key: 'heron', name: 'Great blue heron', sci: 'Ardea herodias', group: 'Birds', move: 'fly',
      speed: 2.5, hr: 60, max: 4, sources: ['S'], mig: 0.4, breed: [1, 2], litter: [1, 2], life: 15,
      suit: (W, i) => w[W.habitat[i]] * (0.4 + 0.6 * W.waterQ[i]),
      req: g => Math.min(1, (g.fishIndex + g.frogIndex) / 5),
      sprite: { kind: 'heron', size: 26, color: '#7c8ea0', breast: '#b9c3cc', head: '#e8ecee', flight: '#2a2e38' },
      desc: 'Stands motionless in the shallows, then strikes. Hunts fish, frogs, and voles.',
      hint: 'Shallow marshes with fish and frogs.' });
  }
  {
    const w = habW({ POND: 1, CREEK: 1, RIVER: 0.6, MARSH: 0.3 });
    def({ key: 'kingfisher', name: 'Belted kingfisher', sci: 'Megaceryle alcyon', group: 'Birds', move: 'fly',
      speed: 3.5, hr: 50, max: 3, sources: ['S'], mig: 0.4, breed: [2], litter: [2, 3], life: 5,
      suit: (W, i) => w[W.habitat[i]] * W.waterQ[i] * near(W.distPerch[i], 2, 0.2),
      req: g => Math.min(1, g.fishIndex / 4),
      sprite: { kind: 'songbird', size: 13, color: '#4a6a8a', breast: '#f2f2ee', head: '#3a5a7a', crest: true, band: '#b0502a', wingShape: 'pointed' },
      desc: 'Rattles along creeks and dives for small fish from an overhanging branch.',
      hint: 'Clear water with fish and overhanging perches.' });
  }
  {
    const w = habW({ POND: 1, MARSH: 1, CREEK: 0.5 });
    def({ key: 'woodduck', name: 'Wood duck', sci: 'Aix sponsa', group: 'Birds', move: 'fly',
      speed: 2.5, hr: 20, max: 10, groupSize: [1, 2], sources: ['S'], mig: 0.4, breed: [1, 2], litter: [2, 4], life: 4,
      suit: (W, i) => w[W.habitat[i]] * (W.distForest[i] <= 2 || W.distNest[i] <= 3 ? 1 : 0.2),
      sprite: { kind: 'duck', size: 15, color: '#6a4a3a', head: '#2a6a4a', breast: '#8a3a2a', fancy: true, speculum: '#2a5aa0' },
      desc: 'The most ornate duck in North America. Nests in tree cavities or nest boxes near wooded ponds.',
      hint: 'Ponds with trees or nest boxes close by.' });
  }
  {
    const w = habW({ POND: 1, MARSH: 0.9, CREEK: 0.35, RIVER: 0.4 });
    def({ key: 'mallard', name: 'Mallard', sci: 'Anas platyrhynchos', group: 'Birds', move: 'fly',
      speed: 2.5, hr: 12, max: 14, groupSize: [2, 2], sources: ['S', 'W'], mig: 0.5, breed: [1, 2], litter: [2, 4], life: 4,
      suit: (W, i) => w[W.habitat[i]],
      sprite: { kind: 'duck', size: 15, color: '#8a7a68', head: '#2a6a3a', breast: '#6a4030', speculum: '#3a48b8' },
      desc: 'The familiar dabbling duck. Shows up on almost any pond.',
      hint: 'Any pond or marsh.' });
  }
  {
    const w = habW({ MEADOW: 1, FARM: 0.45, SHRUB: 0.45, RIPARIAN: 0.3, INVASIVE: 0.2 });
    def({ key: 'hawk', name: 'Red-tailed hawk', sci: 'Buteo jamaicensis', group: 'Birds', move: 'fly',
      speed: 3, hr: 250, max: 2, sources: ['N', 'E', 'S', 'W'], mig: 0.35, breed: [1], litter: [1, 2], life: 12,
      prey: ['vole', 'rabbit', 'gartersnake'], preyPer: 8,
      suit: (W, i) => w[W.habitat[i]] * near(W.distPerch[i], 6, 0.3),
      sprite: { kind: 'raptor', size: 22, color: '#6a4a30', breast: '#e8dcc6', head: '#5a3c26', tail: '#b0502a' },
      desc: 'Circles over open country, then drops onto voles. Perches on tall snags and trees.',
      hint: 'Open meadows full of voles, with tall perches.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 0.8, MATURE_FOREST: 1, RIPARIAN: 0.7, MEADOW: 0.3 });
    def({ key: 'owl', name: 'Great horned owl', sci: 'Bubo virginianus', group: 'Birds', move: 'fly',
      speed: 2.5, hr: 220, max: 2, sources: ['N', 'E'], mig: 0.3, breed: [11, 0], litter: [1, 2], life: 13,
      prey: ['vole', 'rabbit', 'squirrel'], preyPer: 8,
      suit: (W, i) => w[W.habitat[i]],
      sprite: { kind: 'owl', size: 20, color: '#6a5238', breast: '#c9b08a', head: '#6a5238' },
      desc: 'The tiger of the sky. Hoots through winter nights and nests before anything else.',
      hint: 'Forest next to open hunting ground with rodents.' });
  }
  {
    const w = habW({ RIVER: 1, POND: 0.8, CREEK: 0.5, MARSH: 0.5 });
    def({ key: 'eagle', name: 'Bald eagle', sci: 'Haliaeetus leucocephalus', group: 'Birds', move: 'fly',
      speed: 3, hr: 350, max: 2, sources: ['S'], mig: 0.3, breed: [0], litter: [1, 2], life: 20, mature: 4,
      suit: (W, i) => w[W.habitat[i]] * near(W.distPerch[i], 3, 0.2),
      req: g => Math.min(1, g.fishIndex / 6 + g.salmonBonus) * (g.bigTrees >= 3 ? 1 : 0.3),
      sprite: { kind: 'raptor', size: 30, color: '#3a2a1e', breast: '#3a2a1e', head: '#f4f2ea', tail: '#f4f2ea' },
      desc: 'Gathers along Northwest rivers each winter to feast on spawned-out salmon.',
      hint: 'Big trees beside fish-rich water. Salmon runs bring them in.' });
  }
  {
    const w = habW({ RIPARIAN: 1, YOUNG_FOREST: 0.9, SHRUB: 0.7, MATURE_FOREST: 0.6 });
    def({ key: 'thrush', name: "Swainson's thrush", sci: 'Catharus ustulatus', group: 'Birds', move: 'fly',
      speed: 3, hr: 10, max: 14, sources: ['S'], mig: 0.45, breed: [3, 4], litter: [2, 3], life: 4,
      season: [2, 3, 4, 5, 6],
      suit: (W, i) => w[W.habitat[i]],
      sprite: { kind: 'songbird', size: 12, color: '#7a6a4a', breast: '#e0d0b0', head: '#7a6a4a', spots: true },
      desc: 'Its spiraling, flute-like song means summer evenings in the PNW. Winters in the tropics.',
      hint: 'Dense streamside thickets and young forest.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.4, RIPARIAN: 0.5 });
    def({ key: 'wren', name: 'Pacific wren', sci: 'Troglodytes pacificus', group: 'Birds', move: 'fly',
      speed: 2, hr: 10, max: 12, sources: ['N'], mig: 0.35, breed: [1, 2], litter: [2, 3], life: 3,
      suit: (W, i) => w[W.habitat[i]] * near(W.distLog[i], 3, 0.3),
      sprite: { kind: 'songbird', size: 8, color: '#6a4a30', breast: '#8a6a48', head: '#6a4a30', cocked: true },
      desc: 'A tiny brown bird with an enormous song, flitting among mossy logs and ferns.',
      hint: 'Mature forest with fallen logs.' });
  }

  // ------------------------------------------------------------------ Amphibians & reptiles
  {
    const w = habW({ MARSH: 1, POND: 0.5, MEADOW: 0.4, RIPARIAN: 0.6, SHRUB: 0.3, YOUNG_FOREST: 0.3, CREEK: 0.3 });
    def({ key: 'treefrog', name: 'Pacific chorus frog', sci: 'Pseudacris regilla', group: 'Amphibians & reptiles', move: 'semi',
      speed: 0.5, hr: 3, max: 40, sources: ['N', 'E', 'S', 'W'], mig: 0.5, breed: [0, 1], litter: [2, 4], life: 3,
      suit: (W, i) => w[W.habitat[i]] * near(W.distPond[i], 4, 0.05),
      sprite: { kind: 'frog', size: 7, color: '#5a9a3a', dark: '#2a4a1e' },
      desc: 'The "ribbit" of Hollywood movies. Breeds in shallow, fishless wetlands.',
      hint: 'Shallow marshes and ponds with vegetation.' });
  }
  {
    const w = habW({ MARSH: 1, POND: 0.7, RIPARIAN: 1, YOUNG_FOREST: 0.6, MATURE_FOREST: 0.7, CREEK: 0.3 });
    def({ key: 'redlegged', name: 'Northern red-legged frog', sci: 'Rana aurora', group: 'Amphibians & reptiles', move: 'semi',
      speed: 0.6, hr: 6, max: 24, sources: ['N', 'E'], mig: 0.12, intro: 800, breed: [11, 0], litter: [2, 3], life: 8,
      suit: (W, i) => w[W.habitat[i]] * near(W.distPond[i], 3, 0.05) * (W.distForest[i] <= 4 ? 1 : 0.2),
      sprite: { kind: 'frog', size: 10, color: '#8a6a4a', dark: '#b03a2a' },
      desc: 'A declining native frog that breeds in shaded ponds and lives in damp forest.',
      hint: 'Ponds or marshes shaded by nearby forest.' });
  }
  {
    const w = habW({ POND: 1, MARSH: 0.9, MATURE_FOREST: 0.6, YOUNG_FOREST: 0.5, RIPARIAN: 0.6 });
    def({ key: 'newt', name: 'Rough-skinned newt', sci: 'Taricha granulosa', group: 'Amphibians & reptiles', move: 'semi',
      speed: 0.35, hr: 5, max: 20, sources: ['N'], mig: 0.25, breed: [1, 2], litter: [2, 3], life: 10,
      suit: (W, i) => w[W.habitat[i]] * near(W.distPond[i], 5, 0.05) * (W.distForest[i] <= 3 ? 1 : 0.3),
      sprite: { kind: 'newt', size: 10, color: '#6a4a2e', belly: '#f08a2a' },
      desc: 'Toxic enough to deter almost every predator. Wanders forest floors on rainy days.',
      hint: 'Ponds inside or near forest.' });
  }
  {
    const w = habW({ POND: 1, MARSH: 0.6 });
    def({ key: 'turtle', name: 'Western pond turtle', sci: 'Actinemys marmorata', group: 'Amphibians & reptiles', move: 'semi',
      speed: 0.3, hr: 20, max: 8, sources: ['S'], mig: 0.04, intro: 2500, breed: [3], litter: [1, 3], life: 40, mature: 6,
      suit: (W, i) => w[W.habitat[i]] * near(W.distLog[i], 2, 0.35),
      req: g => g.meadowTiles > 30 ? 1 : 0.5,
      sprite: { kind: 'turtle', size: 12, color: '#3a3a2a', dark: '#5a5a3a' },
      desc: "Washington's only native freshwater turtle, nearly lost from the state. Basks on logs, nests in sunny meadows.",
      hint: 'Ponds with basking logs and open meadow nearby.' });
  }
  {
    const w = habW({ MEADOW: 0.8, MARSH: 0.6, RIPARIAN: 0.8, SHRUB: 0.5, FARM: 0.1 });
    def({ key: 'gartersnake', name: 'Common garter snake', sci: 'Thamnophis sirtalis', group: 'Amphibians & reptiles', move: 'semi',
      speed: 0.6, hr: 10, max: 12, sources: ['N', 'E', 'S', 'W'], mig: 0.35, breed: [4], litter: [3, 5], life: 6,
      prey: ['treefrog'], preyPer: 3,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 5, 0.3) * (W.distRocks[i] <= 3 ? 1 : 0.6),
      sprite: { kind: 'snake', size: 18, color: '#2a3a2a', stripe: '#e8d23a', side: '#b03a2a' },
      desc: 'Harmless and colorful. Hunts frogs and slugs near water, warms up on rock piles.',
      hint: 'Meadows near water with frogs. Rock piles help.' });
  }

  // ------------------------------------------------------------------ Fish
  {
    const w = habW({ CREEK: 1, POND: 0.7, MARSH: 0.3, RIVER: 0.4 });
    def({ key: 'cutthroat', name: 'Coastal cutthroat trout', sci: 'Oncorhynchus clarkii clarkii', group: 'Fish', move: 'swim',
      speed: 1.5, hr: 6, max: 20, minK: 3, sources: ['S'], mig: 0.4, intro: 1500, breed: [11, 0], litter: [2, 3], life: 5,
      suit: (W, i) => w[W.habitat[i]] * W.waterQ[i] * (W.connected[i] ? 1 : 0.6),
      sprite: { kind: 'fish', size: 12, color: '#8a9a6a', spots: '#2a2a1a', throat: '#e04a2a', show: 1.25 },
      desc: 'Named for the red slash under its jaw. Needs cool, shaded, clean water.',
      hint: 'Shaded creeks connected to the river.' });
  }
  {
    const w = habW({ CREEK: 1, POND: 0.5, MARSH: 0.25, RIVER: 0.2 });
    def({ key: 'coho', name: 'Coho salmon', sci: 'Oncorhynchus kisutch', group: 'Fish', move: 'swim',
      speed: 1.8, hr: 3, max: 30, sources: ['S'], mig: 0, breed: [], life: 3, special: 'salmon',
      // coho need cool water: streamside shade matters
      suit: (W, i) => w[W.habitat[i]] * (W.connected[i] ? 1 : 0) * Math.max(0, Math.min(1, (W.waterQ[i] - 0.34) / 0.35)),
      sprite: { kind: 'fish', size: 20, color: '#c8403a', spots: '#2a2a1a', head: '#3a5a3a' },
      desc: 'Returns each fall from the Pacific to spawn in the creek of its birth, then dies, feeding the whole forest.',
      hint: 'A shaded creek with open fish passage to the river. Watch for them in October.' });
  }

  return {
    groups: ['Mammals', 'Birds', 'Amphibians & reptiles', 'Fish'],
    names: {
      vole: ["Townsend's vole", "Townsend's voles"], rabbit: ['brush rabbit', 'brush rabbits'],
      squirrel: ['Douglas squirrel', 'Douglas squirrels'], deer: ['black-tailed deer', 'black-tailed deer'],
      elk: ['Roosevelt elk', 'Roosevelt elk'], beaver: ['beaver', 'beavers'], otter: ['river otter', 'river otters'],
      raccoon: ['raccoon', 'raccoons'], coyote: ['coyote', 'coyotes'], bobcat: ['bobcat', 'bobcats'],
      bear: ['black bear', 'black bears'], cougar: ['cougar', 'cougars'], bat: ['little brown bat', 'little brown bats'],
      robin: ['American robin', 'American robins'], hummingbird: ['rufous hummingbird', 'rufous hummingbirds'],
      meadowlark: ['western meadowlark', 'western meadowlarks'], jay: ["Steller's jay", "Steller's jays"],
      woodpecker: ['pileated woodpecker', 'pileated woodpeckers'], heron: ['great blue heron', 'great blue herons'],
      kingfisher: ['belted kingfisher', 'belted kingfishers'], woodduck: ['wood duck', 'wood ducks'],
      mallard: ['mallard', 'mallards'], hawk: ['red-tailed hawk', 'red-tailed hawks'],
      owl: ['great horned owl', 'great horned owls'], eagle: ['bald eagle', 'bald eagles'],
      thrush: ["Swainson's thrush", "Swainson's thrushes"], wren: ['Pacific wren', 'Pacific wrens'],
      treefrog: ['Pacific chorus frog', 'Pacific chorus frogs'], redlegged: ['red-legged frog', 'red-legged frogs'],
      newt: ['rough-skinned newt', 'rough-skinned newts'], turtle: ['western pond turtle', 'western pond turtles'],
      gartersnake: ['garter snake', 'garter snakes'], cutthroat: ['cutthroat trout', 'cutthroat trout'],
      coho: ['coho salmon', 'coho salmon'],
    },
    shy: {
      elk: 0.85, cougar: 1, bear: 0.8, bobcat: 0.8, deer: 0.45, coyote: 0.5, otter: 0.6, beaver: 0.35,
      heron: 0.6, eagle: 0.6, owl: 0.5, woodpecker: 0.35, hawk: 0.3, turtle: 0.6, woodduck: 0.4,
      kingfisher: 0.3, meadowlark: 0.4, squirrel: 0.1, rabbit: 0.25, vole: 0.1, jay: 0.1, wren: 0.2,
      thrush: 0.25, redlegged: 0.3, newt: 0.2, gartersnake: 0.3, treefrog: 0.1, mallard: 0.05,
      robin: 0, raccoon: 0, bat: 0.1, hummingbird: 0.05, cutthroat: 0.2, coho: 0.2,
    },
    // behaviour flags: fruit eaters that spread seed, big animals stopped by fences,
    // dam builders, and browsers that nibble shrubs down
    frugivores: ['robin', 'thrush', 'jay', 'bear'], fenced: ['deer', 'elk'], damBuilders: ['beaver'],
    browsers: { deer: 0.012, elk: 0.02 },
  };
}
