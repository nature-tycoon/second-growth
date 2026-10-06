// Georgia Piedmont wildlife (the Magnolia Ridge subdivision outside Atlanta). The suburb's
// story is pollinators and canopy: butterflies and bees need flowers through the seasons and
// the right caterpillar food plants; squirrels, owls and flying squirrels need tree crowns that
// connect, yard to yard, from the woods on the ridge down to the river.
// Months: 0=Mar ... 9=Dec 10=Jan 11=Feb
// W.canopyNet (set by the map, see maps/atlanta.js) is the size of the connected canopy a tile belongs to.

import { habW, near } from './animals.js';

export default function buildAtlantaAnimals(def) {
  const stat = (g, k) => g.stats?.[k] || 0;
  const net = (W, i, n) => Math.min(1, (W.canopyNet?.[i] || 0) / n);

  // ------------------------------------------------------------------ Pollinators
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.6, RIPARIAN: 0.5, MARSH: 0.5, YOUNG_FOREST: 0.2, FARM: 0.05, DEVELOPED: 0.05 });
    def({ key: 'monarch', quick: true, name: 'Monarch butterfly', sci: 'Danaus plexippus', group: 'Pollinators', move: 'fly',
      speed: 1.2, hr: 1.4, max: 30, groupSize: [2, 3], sources: ['S', 'W', 'N', 'E'], mig: 0.9, breed: [2, 3, 4, 5], litter: [1, 3], life: 0.6, mature: 0.08,
      season: [1, 2, 3, 4, 5, 6, 7],
      suit: (W, i) => w[W.habitat[i]] * Math.min(1, 0.15 + W.nectar[i] * 1.6),
      req: g => Math.min(1, 0.2 + stat(g, 'milkweed') / 10), // a few milkweeds in one garden bring the first monarchs
      sprite: { kind: 'butterfly', size: 8, color: '#e8781a', vein: '#1a1210', spots: '#f4f2ea', show: 2 },
      desc: 'Every fall, monarchs fly 2,000 miles to the mountains of Mexico. Their caterpillars eat nothing but milkweed, so they can only breed where it grows.',
      hint: 'Milkweed for the caterpillars (butterfly weed, swamp milkweed) and flowers for nectar from spring to fall.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.8, RIPARIAN: 0.9, YOUNG_FOREST: 0.5, MATURE_FOREST: 0.3, MARSH: 0.5, FARM: 0.05, DEVELOPED: 0.05 });
    def({ key: 'swallowtail', quick: true, name: 'Eastern tiger swallowtail', sci: 'Papilio glaucus', group: 'Pollinators', move: 'fly',
      speed: 1.3, hr: 2, max: 20, groupSize: [1, 2], sources: ['N', 'S', 'E', 'W'], mig: 0.8, breed: [1, 3, 5], litter: [1, 3], life: 0.6, mature: 0.1,
      season: [0, 1, 2, 3, 4, 5, 6, 7],
      suit: (W, i) => w[W.habitat[i]] * Math.min(1, 0.2 + W.nectar[i] * 1.5),
      req: g => Math.min(1, 0.3 + stat(g, 'hostSwallow') / 6),
      sprite: { kind: 'butterfly', size: 10, color: '#f0cc2a', vein: '#1a1612', spots: '#3a6ad0', tails: true, show: 1.48 },
      desc: 'Georgia\'s state butterfly: big, yellow and striped like a tiger. The caterpillars grow up on tulip poplar, black cherry and spicebush.',
      hint: 'Tulip poplar, black cherry or spicebush for the caterpillars, and flowers like Joe-Pye weed and bergamot.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.7, RIPARIAN: 0.6, MARSH: 0.4, YOUNG_FOREST: 0.35, FARM: 0.04, DEVELOPED: 0.04 });
    def({ key: 'bumblebee', quick: true, name: 'Common eastern bumblebee', sci: 'Bombus impatiens', group: 'Pollinators', move: 'fly',
      speed: 1.4, hr: 1.2, max: 36, groupSize: [2, 4], sources: ['N', 'E', 'S', 'W'], mig: 0.9, breed: [1, 2, 3], litter: [2, 4], life: 0.5, mature: 0.08,
      season: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      suit: (W, i) => w[W.habitat[i]] * Math.min(1, 0.1 + W.nectar[i] * 1.8),
      // a colony has to eat every month from the queen's first spring flight to the fall: gaps in bloom starve it
      req: g => Math.min(1, 0.35 + stat(g, 'bloomMonths') / 9) * Math.min(1, 0.3 + stat(g, 'nativeBloom') / 20),
      sprite: { kind: 'bee', size: 5, color: '#e8c02a', dark: '#1a1612', show: 1.32 },
      desc: 'A fuzzy bee that buzzes pollen loose from flowers. The colony needs flowers every month from March to November, and a clump of bunchgrass or leaf litter to nest in.',
      hint: 'Native flowers blooming through the whole season, and unmown meadow or leaf litter for nests.' });
  }

  // ------------------------------------------------------------------ Birds
  {
    const w = habW({ MEADOW: 0.8, SHRUB: 1, RIPARIAN: 0.9, YOUNG_FOREST: 0.6, MARSH: 0.5, FARM: 0.03, DEVELOPED: 0.08 });
    def({ key: 'hummingbird', quick: true, name: 'Ruby-throated hummingbird', sci: 'Archilochus colubris', group: 'Birds', move: 'fly',
      speed: 3, hr: 5, max: 10, sources: ['S', 'W'], mig: 0.7, breed: [2, 3], litter: [1, 2], life: 4, season: [0, 1, 2, 3, 4, 5, 6],
      suit: (W, i) => w[W.habitat[i]] * Math.min(1, 0.1 + W.nectar[i] * 1.5),
      req: g => Math.min(1, 0.3 + stat(g, 'nativeBloom') / 20),
      sprite: { kind: 'hummer', size: 7, color: '#4a8a4a', breast: '#e8e8e0', head: '#4a8a4a', gorget: '#c8203a', show: 1.02 },
      desc: 'Weighs less than a nickel and crosses the Gulf of Mexico in one flight. Feeds on azalea, bergamot and cardinal flower, and on tiny insects.',
      hint: 'Tube-shaped native flowers from March to September: azalea, bergamot, cardinal flower.' });
  }
  {
    const w = habW({ SHRUB: 1, YOUNG_FOREST: 0.9, RIPARIAN: 1, MATURE_FOREST: 0.6, MEADOW: 0.45, INVASIVE: 0.35, DEVELOPED: 0.12, FARM: 0.05 });
    def({ key: 'cardinal', name: 'Northern cardinal', sci: 'Cardinalis cardinalis', group: 'Birds', move: 'fly',
      speed: 2.5, hr: 10, max: 18, sources: ['N', 'E', 'S', 'W'], mig: 0.5, breed: [1, 2, 3, 4], litter: [2, 3], life: 3,
      suit: (W, i) => w[W.habitat[i]] * near(W.distCover[i], 2, 0.4),
      sprite: { kind: 'songbird', size: 12, color: '#c8202a', breast: '#d83a30', head: '#c8202a', crest: true },
      desc: 'The bright red bird at every Georgia feeder. Nests low in dense shrubs.',
      hint: 'Thick shrubs next to open ground.' });
  }
  {
    const w = habW({ SHRUB: 1, RIPARIAN: 1, YOUNG_FOREST: 0.8, MATURE_FOREST: 0.6, INVASIVE: 0.3, MEADOW: 0.3, DEVELOPED: 0.05 });
    def({ key: 'wren', name: 'Carolina wren', sci: 'Thryothorus ludovicianus', group: 'Birds', move: 'fly',
      speed: 2.5, hr: 8, max: 14, sources: ['N', 'E', 'S', 'W'], mig: 0.4, breed: [1, 2, 3], litter: [2, 4], life: 3,
      suit: (W, i) => w[W.habitat[i]] * near(W.distCover[i], 1, 0.3) * (0.5 + 0.5 * Math.min(1, W.insects[i] * 1.5)),
      sprite: { kind: 'songbird', size: 9, color: '#9a6a3a', breast: '#e0b67a', head: '#9a6a3a', cocked: true },
      desc: 'A tiny bird with a huge voice: "teakettle-teakettle!" Hunts insects in brush piles and tangles.',
      hint: 'Dense native shrubs and brush piles, with plenty of insects.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.5, YOUNG_FOREST: 0.35, FARM: 0.12, RIPARIAN: 0.4 });
    def({ key: 'bluebird', name: 'Eastern bluebird', sci: 'Sialia sialis', group: 'Birds', move: 'fly',
      speed: 2.6, hr: 14, max: 12, sources: ['N', 'E', 'W'], mig: 0.4, breed: [1, 2, 3], litter: [2, 4], life: 3,
      suit: (W, i) => w[W.habitat[i]] * (W.distNest[i] <= 6 ? 1 : 0.2) * (0.4 + 0.6 * Math.min(1, W.insects[i] * 1.5)),
      sprite: { kind: 'songbird', size: 11, color: '#3a6ac8', breast: '#d8783a', head: '#3a6ac8' },
      desc: 'Sky-blue on top, rusty below. Hunts insects in open meadows and nests in tree holes and nest boxes.',
      hint: 'Open meadow full of insects, with a nest box or dead tree nearby.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.6, RIPARIAN: 0.6, YOUNG_FOREST: 0.3, FARM: 0.04 });
    def({ key: 'goldfinch', name: 'American goldfinch', sci: 'Spinus tristis', group: 'Birds', move: 'fly',
      speed: 2.6, hr: 10, max: 16, sources: ['N', 'E', 'S', 'W'], mig: 0.5, breed: [4, 5], litter: [2, 4], life: 3,
      suit: (W, i) => w[W.habitat[i]],
      req: g => Math.min(1, (g.meadowTiles || 0) / 70),
      sprite: { kind: 'songbird', size: 10, color: '#e8c828', breast: '#f0d030', head: '#1a1a14', flight: '#2a2a1a' },
      desc: 'Waits until late summer to nest, when the coneflowers and thistles go to seed, and lines the nest with the fluff.',
      hint: 'Wildflowers left standing to go to seed: coneflower, black-eyed Susan, aster.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.8, RIPARIAN: 0.8, SHRUB: 0.4, DEVELOPED: 0.05 });
    def({ key: 'chickadee', name: 'Carolina chickadee', sci: 'Poecile carolinensis', group: 'Birds', move: 'fly',
      speed: 2.4, hr: 12, max: 14, sources: ['N', 'E', 'S'], mig: 0.4, breed: [1, 2], litter: [3, 5], life: 3,
      suit: (W, i) => w[W.habitat[i]] * (0.3 + 0.7 * Math.min(1, W.insects[i] * 1.4)),
      // one brood of chickadees needs 6,000 to 9,000 caterpillars: that means native trees, mostly oaks
      req: g => Math.min(1, stat(g, 'caterpillarTrees') / 18),
      sprite: { kind: 'songbird', size: 9, color: '#7a8088', breast: '#ece6da', head: '#1a1a1a', face: '#f4f2ee' },
      desc: 'Raising one brood takes thousands of caterpillars, and caterpillars need native trees. A yard of Bradford pears and crepe myrtles can\'t feed a single nest.',
      hint: 'Native trees full of caterpillars, above all oaks and black cherry.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.6, RIPARIAN: 0.7 });
    def({ key: 'woodpecker', name: 'Pileated woodpecker', sci: 'Dryocopus pileatus', group: 'Birds', move: 'fly',
      speed: 2.6, hr: 60, max: 3, sources: ['N', 'S'], mig: 0.3, breed: [1], litter: [1, 3], life: 8,
      suit: (W, i) => w[W.habitat[i]] * near(W.distSnag[i], 8, 0.4),
      req: g => Math.min(1, (g.forestTiles || 0) / 70),
      sprite: { kind: 'woodpecker', size: 16, color: '#1e1c1c', breast: '#1e1c1c', head: '#d8322a' },
      desc: 'Crow-sized, with a flaming red crest. Chisels big rectangular holes in dead wood hunting carpenter ants.',
      hint: 'Real woods with dead trees left standing.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.7, RIPARIAN: 1, MARSH: 0.4 });
    def({ key: 'owl', name: 'Barred owl', sci: 'Strix varia', group: 'Birds', move: 'fly',
      speed: 2.4, hr: 90, max: 2, sources: ['S', 'N'], mig: 0.25, breed: [0], litter: [1, 3], life: 12,
      prey: ['chipmunk', 'toad', 'peeper'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]] * net(W, i, 60),
      req: g => Math.min(1, stat(g, 'canopyLargest') / 110),
      sprite: { kind: 'owl', barred: true, size: 20, color: '#8a7658', breast: '#e0d4ba', head: '#8a7658' },
      desc: '"Who cooks for you, who cooks for you-all?" The owl of Southern river swamps. Needs a big, connected canopy with old trees to nest in.',
      hint: 'A large, unbroken canopy near water.' });
  }
  {
    const w = habW({ RIPARIAN: 1, MATURE_FOREST: 0.9, YOUNG_FOREST: 0.7, MARSH: 0.6, MEADOW: 0.3 });
    def({ key: 'hawk', name: 'Red-shouldered hawk', sci: 'Buteo lineatus', group: 'Birds', move: 'fly',
      speed: 3, hr: 120, max: 2, sources: ['S', 'N'], mig: 0.3, breed: [1], litter: [1, 3], life: 10,
      prey: ['chipmunk', 'toad', 'ratsnake', 'anole'], preyPer: 7,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 8, 0.4),
      sprite: { kind: 'raptor', size: 22, color: '#7a4a2a', breast: '#c8743a', head: '#6a4228', tail: '#2a2622' },
      desc: 'A loud woodland hawk of creeks and floodplains. It hunts frogs, snakes and chipmunks from a perch under the canopy.',
      hint: 'Woods along water with frogs, snakes and chipmunks to hunt.' });
  }
  {
    const w = habW({ POND: 1, MARSH: 1, RIVER: 0.6, CREEK: 0.7, RIPARIAN: 0.3 });
    def({ key: 'heron', name: 'Great blue heron', sci: 'Ardea herodias', group: 'Birds', move: 'fly',
      speed: 2.2, hr: 60, max: 3, sources: ['S'], mig: 0.3, breed: [], life: 15,
      suit: (W, i) => w[W.habitat[i]] * (0.4 + 0.6 * W.waterQ[i]),
      req: g => Math.min(1, (g.fishIndex || 0) / 6),
      sprite: { scale: 0.72, kind: 'heron', size: 26, color: '#7c8ea0', breast: '#b9c3cc', head: '#e8ecee', flight: '#2a2e38' },
      desc: 'Stalks the retention pond at dawn like a statue, waiting for a fish.',
      hint: 'A pond or river with fish, and shallow, planted edges to wade in.' });
  }
  {
    const w = habW({ POND: 1, MARSH: 0.9, RIVER: 0.5, CREEK: 0.6, RIPARIAN: 0.5 });
    def({ key: 'woodduck', name: 'Wood duck', sci: 'Aix sponsa', group: 'Birds', move: 'fly',
      speed: 2.4, hr: 30, max: 6, sources: ['S'], mig: 0.3, breed: [1, 2], litter: [2, 4], life: 5,
      suit: (W, i) => w[W.habitat[i]] * near(W.distForest[i], 3, 0.3),
      req: g => Math.min(1, ((g.snagCount || 0) * 2 + (g.nestboxCount || 0) * 4) / 8),
      sprite: { kind: 'duck', size: 15, color: '#6a4a3a', head: '#2a6a4a', breast: '#8a3a2a', fancy: true, speculum: '#2a5aa0' },
      desc: 'The most beautiful duck in North America nests in tree holes above the water. The ducklings jump out the day they hatch.',
      hint: 'A pond ringed with trees, and nest boxes or dead trees for nesting.' });
  }

  // ------------------------------------------------------------------ Mammals
  {
    // squirrels travel through the treetops (move: 'tree'): a gap in the canopy is a wall
    def({ key: 'graysquirrel', name: 'Eastern gray squirrel', sci: 'Sciurus carolinensis', group: 'Mammals', move: 'tree',
      speed: 1.4, hr: 10, max: 24, sources: ['N', 'E', 'W', 'S'], mig: 0.4, breed: [0, 5], litter: [2, 3], life: 5, mature: 0.6,
      suit: (W, i) => (W.tree[i] && W.treeG[i] > 0.45 ? 0.4 + 0.6 * net(W, i, 20) : 0),
      sprite: { kind: 'squirrel', len: 16, color: '#8a8a86', belly: '#e2ddd2', show: 1.35 },
      desc: 'Travels the neighborhood through the treetops, leaping crown to crown. It buries acorns and forgets half of them, planting oaks.',
      hint: 'Trees, ideally with crowns that touch. Oaks for acorns.' });
  }
  {
    def({ key: 'flyingsquirrel', name: 'Southern flying squirrel', sci: 'Glaucomys volans', group: 'Mammals', move: 'tree',
      speed: 1.3, hr: 14, max: 14, sources: ['N', 'S'], mig: 0.3, breed: [1, 6], litter: [2, 4], life: 5, mature: 0.6,
      suit: (W, i) => (W.tree[i] && W.treeG[i] > 0.45 ? net(W, i, 80) : 0) * near(W.distNest[i], 6, 0.3),
      req: g => Math.min(1, stat(g, 'canopyLargest') / 70),
      sprite: { kind: 'squirrel', len: 12, color: '#9a7e62', belly: '#f0eadc' },
      desc: 'More common than anyone realizes, and only out at night. It glides up to 150 feet between trees on furry flaps of skin, but can\'t cross a gap wider than that.',
      hint: 'A big, connected canopy, and dead trees or nest boxes for dens.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 0.9, SHRUB: 0.8, RIPARIAN: 0.7, MEADOW: 0.3, DEVELOPED: 0.03 });
    def({ key: 'chipmunk', name: 'Eastern chipmunk', sci: 'Tamias striatus', group: 'Mammals', move: 'ground',
      speed: 1.3, hr: 6, max: 24, sources: ['N', 'E'], mig: 0.35, breed: [1, 5], litter: [3, 5], life: 3, mature: 0.3,
      suit: (W, i) => w[W.habitat[i]] * (W.distLog[i] <= 3 || W.distRocks[i] <= 3 ? 1 : 0.4),
      sprite: { kind: 'rodent', len: 12, color: '#a8723e', belly: '#ecd8b0', stripes: true },
      desc: 'Stuffs its cheeks with seeds and acorns. Lives in burrows under logs, rock piles and shrubs.',
      hint: 'Woods and shrubs with logs or rock piles.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 1, YOUNG_FOREST: 0.5, RIPARIAN: 0.5, FARM: 0.25, INVASIVE: 0.5, DEVELOPED: 0.02 });
    def({ key: 'cottontail', name: 'Eastern cottontail', sci: 'Sylvilagus floridanus', group: 'Mammals', move: 'ground',
      speed: 1.3, hr: 14, max: 22, sources: ['W', 'E', 'N'], mig: 0.4, breed: [0, 1, 2, 3, 4, 5], litter: [2, 4], life: 3, mature: 0.3,
      suit: (W, i) => w[W.habitat[i]] * near(W.distCover[i], 2, 0.3),
      sprite: { kind: 'rabbit', len: 18, color: '#8a7050', belly: '#d8ccb4', show: 1.4 },
      desc: 'Grazes the lawn edges at dusk and dashes for cover. Hawks, owls and foxes all depend on it.',
      hint: 'Grass or meadow right next to dense shrubs.' });
  }
  {
    const w = habW({ RIPARIAN: 1, YOUNG_FOREST: 0.9, MATURE_FOREST: 0.8, SHRUB: 0.8, MEADOW: 0.4, DEVELOPED: 0.3, FARM: 0.1, INVASIVE: 0.4 });
    def({ key: 'opossum', name: 'Virginia opossum', sci: 'Didelphis virginiana', group: 'Mammals', move: 'ground',
      speed: 0.9, hr: 30, max: 8, sources: ['N', 'E', 'W', 'S'], mig: 0.4, breed: [0, 3], litter: [3, 6], life: 3,
      suit: (W, i) => w[W.habitat[i]],
      sprite: { kind: 'raccoon', opossum: true, len: 22, color: '#a8a4a0', belly: '#e8e4de', dark: '#3a3634' },
      desc: 'North America\'s only marsupial. It eats ticks, slugs and fallen fruit, and plays dead when cornered.',
      hint: 'Anywhere with some cover. Loves a messy garden.' });
  }
  {
    const w = habW({ RIPARIAN: 1, MARSH: 0.6, YOUNG_FOREST: 0.6, MATURE_FOREST: 0.6, SHRUB: 0.5, DEVELOPED: 0.3, FARM: 0.05, INVASIVE: 0.4 });
    def({ key: 'raccoon', name: 'Raccoon', sci: 'Procyon lotor', group: 'Mammals', move: 'ground',
      speed: 1.1, hr: 35, max: 8, sources: ['S', 'W', 'E'], mig: 0.4, breed: [2], litter: [2, 4], life: 5,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 6, 0.4),
      sprite: { kind: 'raccoon', len: 22, color: '#77716a', belly: '#9c958c', dark: '#2a2622' },
      desc: 'Washes crayfish in the creek and raids the trash cans. Not picky at all.',
      hint: 'Near water with some cover.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 0.8, SHRUB: 0.9, RIPARIAN: 0.8, MEADOW: 0.5 });
    def({ key: 'fox', name: 'Gray fox', sci: 'Urocyon cinereoargenteus', group: 'Mammals', move: 'ground',
      speed: 1.8, hr: 140, max: 3, sources: ['N', 'S'], mig: 0.3, breed: [1], litter: [2, 4], life: 7,
      prey: ['cottontail', 'chipmunk'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]] * near(W.distCover[i], 3, 0.4),
      sprite: { kind: 'canine', len: 26, h: 11, leg: 9, color: '#8a8a88', belly: '#f0ece2', dark: '#b8683a', fox: true },
      desc: 'The only fox that climbs trees. It hunts rabbits and chipmunks along wooded edges.',
      hint: 'Brushy woods with rabbits and chipmunks to hunt.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 0.8, SHRUB: 1, RIPARIAN: 0.9, MEADOW: 0.7, FARM: 0.1, INVASIVE: 0.3 });
    def({ key: 'deer', name: 'White-tailed deer', sci: 'Odocoileus virginianus', group: 'Mammals', move: 'ground',
      speed: 1.6, hr: 50, max: 10, minK: 1.5, groupSize: [1, 3], sources: ['N', 'S'], mig: 0.35, breed: [2, 3], litter: [1, 2], life: 10,
      suit: (W, i) => w[W.habitat[i]] * near(W.distCover[i], 4, 0.3) * (0.6 + 0.4 * Math.min(1, W.browse[i])),
      sprite: { kind: 'deer', len: 34, h: 16, leg: 16, color: '#9a7250', belly: '#e8dcc4', dark: '#3a2c20' },
      desc: 'Moves through the neighborhood at dawn along the wooded edges, and eats the hostas. Backyard fences stop it.',
      hint: 'Wooded edges and shrubs. Fences keep deer out.' });
  }
  {
    const w = habW({ POND: 1, MARSH: 1, MEADOW: 0.8, RIPARIAN: 0.9, YOUNG_FOREST: 0.6, MATURE_FOREST: 0.5, DEVELOPED: 0.1, RIVER: 0.5 });
    def({ key: 'bat', name: 'Big brown bat', sci: 'Eptesicus fuscus', group: 'Mammals', move: 'fly',
      speed: 3, hr: 8, max: 20, sources: ['N', 'E', 'S', 'W'], mig: 0.3, breed: [3], litter: [1, 2], life: 10,
      suit: (W, i) => w[W.habitat[i]] * Math.min(1, W.insects[i] * 1.4),
      req: g => Math.min(1, ((g.snagCount || 0) * 3 + (g.nestboxCount || 0) * 5 + (g.structureCount || 0) * 0.3) / 20),
      sprite: { kind: 'bat', size: 13, color: '#6a4a32' },
      desc: 'Roosts in attics and dead trees and hunts beetles and moths over the streetlights and the pond.',
      hint: 'Insects over gardens and water, and roosts in dead trees or bat boxes.' });
  }

  // ------------------------------------------------------------------ Reptiles & amphibians
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 1, RIPARIAN: 0.8, MEADOW: 0.6, SHRUB: 0.7 });
    def({ key: 'boxturtle', name: 'Eastern box turtle', sci: 'Terrapene carolina', group: 'Reptiles & amphibians', move: 'ground',
      speed: 0.25, hr: 30, max: 6, sources: ['N', 'S'], mig: 0.04, breed: [3], litter: [1, 3], life: 60, mature: 8,
      suit: (W, i) => w[W.habitat[i]] * (0.5 + 0.5 * Math.min(1, W.berries[i] + W.insects[i])),
      sprite: { kind: 'turtle', size: 11, color: '#4a3a24', dark: '#d8a030' },
      desc: 'Can live over 100 years in the same few acres, if it can cross them safely. Eats berries, mushrooms and slugs.',
      hint: 'Leafy woods and meadow edges with berries and leaf litter.' });
  }
  {
    const w = habW({ SHRUB: 1, YOUNG_FOREST: 0.8, MEADOW: 0.6, RIPARIAN: 0.7, DEVELOPED: 0.15, INVASIVE: 0.3 });
    def({ key: 'anole', name: 'Green anole', sci: 'Anolis carolinensis', group: 'Reptiles & amphibians', move: 'ground',
      speed: 0.9, hr: 3, max: 30, sources: ['N', 'E', 'S', 'W'], mig: 0.4, breed: [2, 3, 4], litter: [1, 2], life: 4, mature: 0.4,
      suit: (W, i) => w[W.habitat[i]] * (0.4 + 0.6 * Math.min(1, W.insects[i] * 1.5)),
      sprite: { kind: 'monitor', lizard: 'anole', size: 9, color: '#5ab040', belly: '#c8e0a0' },
      desc: 'Georgia\'s little native lizard. It changes from green to brown and flashes a pink throat fan to show off.',
      hint: 'Sunny shrubs and garden beds full of insects.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.8, YOUNG_FOREST: 0.7, RIPARIAN: 0.8, MARSH: 0.6, FARM: 0.1 });
    def({ key: 'toad', name: 'American toad', sci: 'Anaxyrus americanus', group: 'Reptiles & amphibians', move: 'semi',
      speed: 0.4, hr: 8, max: 20, sources: ['S', 'N'], mig: 0.3, breed: [0, 1], litter: [3, 5], life: 5, mature: 1,
      suit: (W, i) => w[W.habitat[i]] * near(W.distPond[i], 12, 0.2) * (0.4 + 0.6 * Math.min(1, W.insects[i] * 1.5)),
      sprite: { kind: 'frog', size: 10, color: '#8a6a44', dark: '#5a4028' },
      desc: 'Eats thousands of garden pests a summer. Breeds in ponds and rain gardens, then lives in the garden beds.',
      hint: 'A fish-free pond or rain garden to breed in, and insect-rich garden beds around it.' });
  }
  {
    const w = habW({ MARSH: 1, POND: 0.8, RIPARIAN: 1, YOUNG_FOREST: 0.6, MATURE_FOREST: 0.5 });
    def({ key: 'peeper', name: 'Spring peeper', sci: 'Pseudacris crucifer', group: 'Reptiles & amphibians', move: 'semi',
      speed: 0.4, hr: 5, max: 24, sources: ['S'], mig: 0.3, breed: [11, 0], litter: [3, 5], life: 3, mature: 1,
      suit: (W, i) => w[W.habitat[i]] * near(W.distPond[i], 5, 0.15),
      sprite: { kind: 'frog', size: 6, color: '#b08a60', dark: '#6a4a30' },
      desc: 'A frog the size of a thumbnail whose chorus of peeps is the first sound of spring, in February, from the wet woods.',
      hint: 'Wet woods and shallow, fish-free marsh or rain gardens.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 0.8, SHRUB: 0.8, RIPARIAN: 0.8, MEADOW: 0.5, DEVELOPED: 0.05 });
    def({ key: 'ratsnake', name: 'Gray rat snake', sci: 'Pantherophis spiloides', group: 'Reptiles & amphibians', move: 'semi',
      speed: 0.6, hr: 20, max: 6, sources: ['N', 'S', 'E'], mig: 0.25, breed: [3], litter: [3, 6], life: 15, mature: 3,
      prey: ['chipmunk', 'toad'], preyPer: 4,
      suit: (W, i) => w[W.habitat[i]] * (W.distLog[i] <= 4 || W.distRocks[i] <= 4 ? 1 : 0.5),
      sprite: { kind: 'snake', mottled: true, size: 20, color: '#6a6a60', stripe: '#3a3a34', side: '#8a8a7e' },
      desc: 'A big, harmless climbing snake that keeps mice and chipmunks in check. It spends half its time up in the trees.',
      hint: 'Woods and brushy edges with logs or rock piles.' });
  }

  // ------------------------------------------------------------------ Fish
  {
    const w = habW({ POND: 1, RIVER: 0.6, CREEK: 0.5, MARSH: 0.3 });
    def({ key: 'bluegill', name: 'Bluegill', sci: 'Lepomis macrochirus', group: 'Fish', move: 'swim',
      speed: 1.2, hr: 3, max: 30, minK: 2, sources: ['S'], mig: 0.3, breed: [2, 3, 4], litter: [3, 5], life: 5, mature: 1,
      suit: (W, i) => w[W.habitat[i]] * (0.3 + 0.7 * W.waterQ[i]),
      sprite: { kind: 'fish', size: 9, back: '#3e5a5a', flank: '#7a9a7a', belly: '#e8a040', throat: '#e8902a', deep: 2, short: true, spiny: true, bars: true, ear: '#141c2a', finColor: '#4a6058', show: 1.35 },
      desc: 'A sunfish that fans out nests in the shallows. Food for herons, bass and kingfishers.',
      hint: 'A clean pond with planted, shady edges.' });
  }
  {
    const w = habW({ RIVER: 1, POND: 0.7, CREEK: 0.5 });
    def({ key: 'bass', name: 'Largemouth bass', sci: 'Micropterus salmoides', group: 'Fish', move: 'swim',
      speed: 1.5, hr: 8, max: 10, minK: 2, sources: ['S'], mig: 0.3, breed: [1, 2], litter: [2, 3], life: 10, mature: 2,
      prey: ['bluegill'], preyPer: 5,
      suit: (W, i) => w[W.habitat[i]] * W.waterQ[i],
      sprite: { kind: 'fish', size: 16, back: '#3e5a32', flank: '#8aa060', belly: '#e8e6c8', spiny: true, stripe: 'band', stripeColor: '#24301c', jaw: true, finColor: '#5a6a40' },
      desc: 'The top predator of the pond. It comes up from the Yellow River once the water is clean and shaded.',
      hint: 'Clean, shaded water with plenty of bluegill.' });
  }

  return {
    groups: ['Pollinators', 'Birds', 'Mammals', 'Reptiles & amphibians', 'Fish'],
    names: {
      monarch: ['monarch', 'monarchs'], swallowtail: ['tiger swallowtail', 'tiger swallowtails'], bumblebee: ['bumblebee', 'bumblebees'],
      hummingbird: ['ruby-throated hummingbird', 'ruby-throated hummingbirds'], cardinal: ['cardinal', 'cardinals'],
      wren: ['Carolina wren', 'Carolina wrens'], bluebird: ['eastern bluebird', 'eastern bluebirds'], goldfinch: ['goldfinch', 'goldfinches'],
      chickadee: ['Carolina chickadee', 'Carolina chickadees'], woodpecker: ['pileated woodpecker', 'pileated woodpeckers'],
      owl: ['barred owl', 'barred owls'], hawk: ['red-shouldered hawk', 'red-shouldered hawks'], heron: ['great blue heron', 'great blue herons'],
      woodduck: ['wood duck', 'wood ducks'], graysquirrel: ['gray squirrel', 'gray squirrels'], flyingsquirrel: ['flying squirrel', 'flying squirrels'],
      chipmunk: ['chipmunk', 'chipmunks'], cottontail: ['cottontail', 'cottontails'], opossum: ['opossum', 'opossums'],
      raccoon: ['raccoon', 'raccoons'], fox: ['gray fox', 'gray foxes'], deer: ['white-tailed deer', 'white-tailed deer'],
      bat: ['big brown bat', 'big brown bats'], boxturtle: ['box turtle', 'box turtles'], anole: ['green anole', 'green anoles'],
      toad: ['American toad', 'American toads'], peeper: ['spring peeper', 'spring peepers'], ratsnake: ['rat snake', 'rat snakes'],
      bluegill: ['bluegill', 'bluegill'], bass: ['largemouth bass', 'largemouth bass'],
    },
    // suburban wildlife is used to people; a few species still keep well away from the trails
    shy: {
      deer: 0.4, fox: 0.6, owl: 0.4, woodpecker: 0.35, hawk: 0.25, heron: 0.4, woodduck: 0.4, boxturtle: 0.4,
      flyingsquirrel: 0.2, ratsnake: 0.2, bluebird: 0.15, chickadee: 0.05, cardinal: 0, wren: 0.05, goldfinch: 0.05,
      graysquirrel: 0, chipmunk: 0.05, cottontail: 0.1, opossum: 0, raccoon: 0, bat: 0.05, anole: 0, toad: 0.05,
      peeper: 0.1, monarch: 0, swallowtail: 0, bumblebee: 0, hummingbird: 0, bluegill: 0.05, bass: 0.1,
    },
    frugivores: ['cardinal', 'bluebird', 'opossum', 'boxturtle'], fenced: ['deer', 'fox', 'boxturtle'],
    browsers: { deer: 0.012 },
  };
}
