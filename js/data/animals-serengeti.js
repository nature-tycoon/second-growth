// Serengeti wildlife (the Enkare map). The Serengeti National Park lies to the north, the
// neighbours' grazing land to the east, village farms to the west, and the river to the south.
// Months: 0=Mar ... 9=Dec 10=Jan 11=Feb. The Great Migration's wildebeest and zebra pass through
// in the long dry season, then head back to the southern plains to calve.
// needs: species it depends on without hunting them (vultures follow the herds; dung beetles
// need dung), limiting how many can live here: K <= sum of their numbers / needsPer.

import { habW, near } from './animals.js';

// grass that's actually there to graze (0 on bare ground)
const grazing = (W, i) => (W.ground[i] && W.groundG[i] > 0.25 ? 1 : 0.15);
const shade = (W, i) => near(W.distForest[i], 3, 0.35);

export default function buildSerengetiAnimals(def) {
  // ------------------------------------------------------------------ Grazers and browsers
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.35, FARM: 0.25, RIPARIAN: 0.3 });
    def({ key: 'wildebeest', herd: true, herdR: 3, crossing: { x: 0.5 }, name: 'Wildebeest', sci: 'Connochaetes taurinus', group: 'Mammals', move: 'ground',
      speed: 1.6, hr: 14, max: 60, minK: 6, groupSize: [10, 20], sources: ['N'], mig: 0.6, season: [3, 4, 5, 6, 7],
      breed: [11], litter: [1, 1], life: 18, mature: 2,
      suit: (W, i) => w[W.habitat[i]] * grazing(W, i) * near(W.distWater[i], 10, 0.3),
      req: g => Math.min(1, g.meadowTiles / 250),
      sprite: { kind: 'wildebeest', len: 36, h: 18, leg: 17, color: '#7a7a7c', belly: '#6a6a6a', dark: '#1e1e20' },
      desc: 'A million and a half of them circle the Serengeti every year, following the rain and fresh grass. They pass through in the dry season.',
      hint: 'Lots of open, grazed grassland with water nearby, in the dry season.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.5, FARM: 0.3, RIPARIAN: 0.4 });
    def({ key: 'zebra', herd: true, herdR: 2.5, crossing: { x: 0.5 }, name: 'Plains zebra', sci: 'Equus quagga', group: 'Mammals', move: 'ground',
      speed: 1.6, hr: 14, max: 36, minK: 3, groupSize: [4, 9], sources: ['N'], mig: 0.5, season: [2, 3, 4, 5, 6, 7],
      breed: [10, 11], litter: [1, 1], life: 20, mature: 2.5,
      suit: (W, i) => w[W.habitat[i]] * grazing(W, i) * near(W.distWater[i], 10, 0.3),
      req: g => Math.min(1, g.meadowTiles / 180),
      sprite: { kind: 'zebra', len: 34, h: 18, leg: 16, color: '#f0ece2', belly: '#f4f0e6', dark: '#1a1a1a', show: 1.1 },
      desc: 'Zebras lead the migration, cropping the tall, coarse grass so the wildebeest behind them can reach the tender shoots.',
      hint: 'Open grassland, even coarse tall grass, with water nearby.' });
  }
  {
    const w = habW({ MEADOW: 1, FARM: 0.35, SHRUB: 0.35, BARE: 0.1 });
    def({ key: 'gazelle', herd: true, herdR: 3, herdMax: 10, name: "Thomson's gazelle", sci: 'Eudorcas thomsonii', group: 'Mammals', move: 'ground',
      speed: 1.9, hr: 8, max: 30, minK: 2, groupSize: [4, 10], sources: ['N', 'E'], mig: 0.45, breed: [9, 10, 11], litter: [1, 1], life: 10, mature: 1,
      suit: (W, i) => w[W.habitat[i]] * grazing(W, i),
      sprite: { kind: 'gazelle', len: 22, h: 11, leg: 12, color: '#c8904a', belly: '#f4ece0', dark: '#2a1e18' },
      desc: 'Small, fast and always twitching its tail. The favourite prey of cheetahs, which it can outlast if it jinks well.',
      hint: 'Short-grass plains.' });
  }
  {
    const w = habW({ SHRUB: 1, YOUNG_FOREST: 0.9, RIPARIAN: 0.9, MEADOW: 0.55, MATURE_FOREST: 0.6 });
    def({ key: 'impala', herd: true, herdR: 2.5, herdMax: 8, name: 'Impala', sci: 'Aepyceros melampus', group: 'Mammals', move: 'ground',
      speed: 1.7, hr: 8, max: 26, minK: 3, groupSize: [5, 10], sources: ['N', 'S'], mig: 0.4, breed: [9, 10], litter: [1, 1], life: 12, mature: 1.5,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 6, 0.4),
      req: g => Math.min(1, g.forestTiles / 300),
      sprite: { kind: 'impala', len: 26, h: 13, leg: 14, color: '#b87a44', belly: '#f2e8da', dark: '#1e1612', lyre: false,
        male: { len: 28, h: 14, leg: 15, lyre: true, neckWidth: 0.21 }, maleName: 'adult ram' },
      desc: 'Graceful leapers that both graze and browse, so they do well on the edge between thornbush and grass.',
      hint: 'Thornbush and open woodland near water.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 0.9, SHRUB: 0.8, RIPARIAN: 0.7, MEADOW: 0.25 });
    def({ key: 'giraffe', herd: true, herdR: 4, herdMax: 4, name: 'Maasai giraffe', sci: 'Giraffa tippelskirchi', group: 'Mammals', move: 'ground',
      speed: 1.2, hr: 40, max: 10, minK: 2, groupSize: [2, 5], sources: ['N'], mig: 0.3, breed: [4, 5], litter: [1, 1], life: 25, mature: 4,
      suit: (W, i) => w[W.habitat[i]],
      req: g => Math.min(1, g.forestTiles / 250),
      sprite: { kind: 'giraffe', len: 40, h: 21, leg: 38, color: '#a8622e', belly: '#f2e6c8', dark: '#6e3416' },
      desc: 'Browses acacia crowns no other animal can reach, curling a 45 cm tongue round the thorns.',
      hint: 'Acacia woodland and thornbush.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 1, RIPARIAN: 1, SHRUB: 0.8, MEADOW: 0.6, MARSH: 0.6 });
    def({ key: 'elephant', herd: true, herdR: 2.5, herdMax: 5, name: 'African elephant', sci: 'Loxodonta africana', group: 'Mammals', move: 'ground',
      speed: 1.1, hr: 160, max: 8, minK: 2, groupSize: [3, 6], sources: ['N'], mig: 0.2, intro: 16000,
      breed: [1], litter: [1, 1], life: 60, mature: 12,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 8, 0.3),
      req: g => Math.min(1, g.forestTiles / 400) * Math.min(1, (g.cleanWater + 10) / 30),
      sprite: { kind: 'elephant', len: 46, h: 26, leg: 20, color: '#8a8480', belly: '#7a7470', dark: '#4a4440', show: 1.45 },
      desc: 'Walks tens of kilometres a day, opening up thick bush and planting desert dates in its dung. A family herd needs a lot of room and water.',
      hint: 'Big areas of woodland and grass with permanent water. Fences keep them out.' });
  }
  {
    const w = habW({ RIPARIAN: 1, MARSH: 0.8, MEADOW: 0.8, SHRUB: 0.5, YOUNG_FOREST: 0.5 });
    def({ key: 'buffalo', herd: true, herdR: 2.2, herdMax: 10, name: 'Cape buffalo', sci: 'Syncerus caffer', group: 'Mammals', move: 'ground',
      speed: 1.1, hr: 30, max: 30, minK: 4, groupSize: [6, 12], sources: ['N', 'S'], mig: 0.3, breed: [1, 2], litter: [1, 1], life: 20, mature: 4,
      suit: (W, i) => w[W.habitat[i]] * grazing(W, i) * near(W.distWater[i], 3, 0.15),
      req: g => Math.min(1, g.meadowTiles / 1200),
      sprite: { kind: 'buffalo', len: 38, h: 20, leg: 14, color: '#3e3832', belly: '#4a433a', dark: '#1c1a16', show: 1.2 },
      desc: 'Moody, heavy and never far from water. A herd will turn on lions together.',
      hint: 'Tall grass right beside water.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.8, FARM: 0.4, BARE: 0.3, RIPARIAN: 0.5 });
    def({ key: 'warthog', name: 'Warthog', sci: 'Phacochoerus africanus', group: 'Mammals', move: 'ground',
      speed: 1.3, hr: 6, max: 18, minK: 2, groupSize: [2, 5], sources: ['N', 'E', 'W'], mig: 0.4, breed: [9, 10], litter: [2, 4], life: 12, mature: 1.5,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 8, 0.4),
      sprite: { kind: 'warthog', len: 24, h: 13, leg: 9, color: '#6a5a50', belly: '#7a6a5e', dark: '#2a2420' },
      desc: 'Kneels to graze, runs with its tail straight up like a flag, and backs into old aardvark burrows at night.',
      hint: 'Short grass and bare patches near water.' });
  }
  {
    const w = habW({ POND: 1, RIVER: 1, MARSH: 0.8 });
    def({ key: 'hippo', herd: true, herdR: 2, herdMax: 5, name: 'Hippopotamus', sci: 'Hippopotamus amphibius', group: 'Mammals', move: 'semi',
      speed: 0.8, hr: 20, max: 12, minK: 2, groupSize: [3, 6], sources: ['S'], mig: 0.3, breed: [5, 6], litter: [1, 1], life: 40, mature: 5,
      suit: (W, i) => w[W.habitat[i]],
      req: g => Math.min(1, g.meadowTiles / 100) * Math.min(1, (g.cleanWater + 5) / 25),
      sprite: { kind: 'hippo', len: 40, h: 18, leg: 8, color: '#6a5a5a', belly: '#b89088', dark: '#3a3232', show: 1.3 },
      desc: 'Spends the day in the water and walks out at night to graze. Its dung feeds the whole river food web.',
      hint: 'Deep waterholes or river pools with grassland to graze nearby.' });
  }
  {
    const w = habW({ SHRUB: 1, YOUNG_FOREST: 0.8, RIPARIAN: 0.6, MEADOW: 0.3 });
    def({ key: 'rhino', name: 'Black rhino', sci: 'Diceros bicornis', group: 'Mammals', move: 'ground', fixedMax: true,
      speed: 1, hr: 60, max: 4, minK: 1, groupSize: [1, 2], sources: ['N'], mig: 0, intro: 22000, breed: [2], litter: [1, 1], life: 40, mature: 7,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 8, 0.4),
      req: g => Math.min(1, g.forestTiles / 250),
      sprite: { kind: 'rhino', len: 38, h: 20, leg: 12, color: '#6a6660', belly: '#5a5650', dark: '#3a3834', show: 1.25 },
      desc: 'Critically endangered: poaching took the Serengeti down to a handful. A browser with a hooked lip for stripping thornbush.',
      hint: 'Thick thornbush and young woodland, quiet and with water.' });
  }
  // ------------------------------------------------------------------ Predators
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.8, YOUNG_FOREST: 0.7, RIPARIAN: 0.8 });
    def({ key: 'lion', name: 'Lion', sci: 'Panthera leo', group: 'Mammals', move: 'ground', fixedMax: true,
      speed: 1.4, hr: 200, max: 8, minK: 2, groupSize: [2, 4], sources: ['N'], mig: 0.15, breed: [3, 9], litter: [2, 3], life: 15, mature: 4,
      prey: ['wildebeest', 'zebra', 'buffalo', 'warthog', 'gazelle'], preyPer: 7,
      suit: (W, i) => w[W.habitat[i]] * (0.6 + 0.4 * shade(W, i)),
      req: g => Math.min(1, g.meadowTiles / 350),
      sprite: { scale: 1.14, kind: 'feline', lion: true, len: 42, h: 16, leg: 14, color: '#c89a5a', belly: '#e8d4ae', dark: '#6a4a2a', longtail: true, stocky: true,
        male: { len: 46, h: 18, leg: 15, mane: '#7a4a24' }, maleShare: 0.3, maleName: 'adult male', show: 0.88 },
      desc: 'Prides rest in the shade of a lone acacia or kopje all day and hunt the herds at night.',
      hint: 'Big open grasslands with plenty of large grazers, and shade to rest in.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.5, FARM: 0.3 });
    def({ key: 'cheetah', name: 'Cheetah', sci: 'Acinonyx jubatus', group: 'Mammals', move: 'ground', fixedMax: true,
      speed: 1.8, hr: 150, max: 4, minK: 1, sources: ['N'], mig: 0.12, breed: [9], litter: [2, 4], life: 12, mature: 2,
      prey: ['gazelle', 'impala', 'warthog'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]],
      req: g => Math.min(1, g.meadowTiles / 1500),
      sprite: { kind: 'feline', len: 38, h: 14, leg: 16, color: '#d8a852', belly: '#f0e4c4', dark: '#1e1812', longtail: true, cheetah: true },
      desc: 'The fastest land animal, built for short sprints across open plains. Loses its kills to lions and hyenas, so it avoids them.',
      hint: 'Wide open short-grass plains with gazelles.' });
  }
  {
    const w = habW({ RIPARIAN: 1, YOUNG_FOREST: 1, MATURE_FOREST: 0.9, SHRUB: 0.7 });
    def({ key: 'leopard', name: 'Leopard', sci: 'Panthera pardus', group: 'Mammals', move: 'ground', fixedMax: true,
      speed: 1.4, hr: 90, max: 4, minK: 1, sources: ['N', 'S'], mig: 0.15, breed: [2], litter: [1, 3], life: 14, mature: 3,
      prey: ['impala', 'gazelle', 'warthog'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]] * near(W.distForest[i], 2, 0.2),
      req: g => Math.min(1, g.forestTiles / 160),
      sprite: { kind: 'feline', len: 36, h: 14, leg: 12, color: '#d8a44a', belly: '#f2e2c0', dark: '#241a10', longtail: true, rosettes: true },
      desc: 'Hauls its kills up into a tree, out of reach of lions and hyenas. Needs thick cover along rivers and kopjes.',
      hint: 'Riverine woodland and big trees, with impala to hunt.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.8, FARM: 0.5, BARE: 0.3, RIPARIAN: 0.6 });
    def({ key: 'hyena', name: 'Spotted hyena', sci: 'Crocuta crocuta', group: 'Mammals', move: 'ground',
      speed: 1.4, hr: 90, max: 12, minK: 2, groupSize: [2, 5], sources: ['N', 'E'], mig: 0.25, breed: [0, 6], litter: [1, 2], life: 18, mature: 2.5,
      prey: ['wildebeest', 'zebra', 'gazelle', 'warthog'], preyPer: 5,
      suit: (W, i) => w[W.habitat[i]],
      req: g => Math.min(1, g.meadowTiles / 1200),
      sprite: { kind: 'hyena', len: 32, h: 16, leg: 13, color: '#b09a74', belly: '#c8b48c', dark: '#3a2e22' },
      desc: 'Not just a scavenger: clans hunt most of what they eat, and crunch the bones that everything else leaves behind.',
      hint: 'Open plains with plenty of grazers.' });
  }

  // ------------------------------------------------------------------ Birds
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.6, FARM: 0.5, BARE: 0.4 });
    def({ key: 'ostrich', name: 'Common ostrich', sci: 'Struthio camelus', group: 'Birds', move: 'ground',
      speed: 1.8, hr: 20, max: 12, minK: 2, groupSize: [2, 5], sources: ['N', 'E'], mig: 0.35, breed: [5, 6], litter: [3, 6], life: 30, mature: 3,
      suit: (W, i) => w[W.habitat[i]],
      req: g => Math.min(1, g.meadowTiles / 1200),
      sprite: { scale: 0.72, kind: 'ostrich', size: 34, color: '#1e1c1a', breast: '#1e1c1a', head: '#c8a0a0', tail: '#f2f0ea' },
      desc: 'The biggest bird alive, too heavy to fly but able to run at 70 km/h. Often grazes alongside zebras.',
      hint: 'Open grass and short scrub.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.7, YOUNG_FOREST: 0.6, MATURE_FOREST: 0.6, FARM: 0.4 });
    def({ key: 'vulture', name: 'White-backed vulture', sci: 'Gyps africanus', group: 'Birds', move: 'fly',
      speed: 1.4, hr: 60, max: 12, minK: 2, groupSize: [2, 4], sources: ['N'], mig: 0.3, breed: [5], litter: [1, 1], life: 25, mature: 5,
      needs: ['wildebeest', 'zebra', 'buffalo', 'gazelle'], needsPer: 8,
      suit: (W, i) => w[W.habitat[i]],
      req: g => Math.min(1, (g.bigTrees + 2) / 8),
      sprite: { kind: 'vulture', size: 34, color: '#8a7a64', breast: '#b8a88e', head: '#9a9aa0', tail: '#2a2622', flight: '#2a2622', bill: '#2a2a2a', show: 0.78 },
      desc: 'Circles high on thermals, watching for other vultures dropping to a carcass. Critically endangered, mostly from poisoned baits.',
      hint: 'Big herds of grazers (it cleans up after them) and tall trees to nest in.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.6, FARM: 0.3 });
    def({ key: 'secretary', name: 'Secretary bird', sci: 'Sagittarius serpentarius', group: 'Birds', move: 'fly',
      speed: 1.2, hr: 40, max: 4, minK: 1, groupSize: [1, 2], sources: ['N'], mig: 0.2, breed: [9], litter: [1, 2], life: 15, mature: 3,
      suit: (W, i) => w[W.habitat[i]] * (0.4 + 0.6 * Math.min(1, W.insects[i])),
      req: g => Math.min(1, g.meadowTiles / 1200),
      sprite: { scale: 0.68, kind: 'secretary', size: 30, color: '#b8b8b4', breast: '#d8d8d2', head: '#c8c8c2', flight: '#1a1a1a', quills: true, face: '#e87a2a', eye: '#6a4a2a' },
      desc: 'An eagle on stilts that strides through the grass and stamps snakes to death with its feet.',
      hint: 'Tall native grassland with insects and snakes.' });
  }
  {
    const w = habW({ MARSH: 1, MEADOW: 0.7, POND: 0.6, RIPARIAN: 0.5 });
    def({ key: 'crane', name: 'Grey crowned crane', sci: 'Balearica regulorum', group: 'Birds', move: 'fly',
      speed: 1.2, hr: 16, max: 8, minK: 2, groupSize: [2, 4], sources: ['S', 'W'], mig: 0.3, breed: [1, 2], litter: [2, 3], life: 20, mature: 3,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 4, 0.3),
      req: g => Math.min(1, g.meadowTiles / 900),
      sprite: { scale: 0.7, kind: 'crane', size: 26, color: '#8a8e94', breast: '#6a6e74', head: '#8a8e94', flight: '#8a3a1a', crown: '#e8c040', face: '#f4f2ee', eye: '#e8e8e0', velvet: '#141414', wattle: '#d02820' },
      desc: 'Wears a crown of stiff golden feathers and dances to court its mate. Needs wet grassland to nest.',
      hint: 'Marsh and wet grassland.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.7, YOUNG_FOREST: 0.6, FARM: 0.3 });
    def({ key: 'hornbill', name: 'Southern ground hornbill', sci: 'Bucorvus leadbeateri', group: 'Birds', move: 'ground',
      speed: 0.9, hr: 40, max: 6, minK: 2, groupSize: [2, 4], sources: ['N'], mig: 0.2, breed: [8], litter: [1, 1], life: 40, mature: 6,
      suit: (W, i) => w[W.habitat[i]] * (0.4 + 0.6 * Math.min(1, W.insects[i])),
      req: g => Math.min(1, g.meadowTiles / 1500, (g.bigTrees + 2) / 10),
      sprite: { scale: 0.9, kind: 'hornbill', size: 30, color: '#161616', breast: '#1a1a1a', head: '#161616', wattle: '#d8281e', face: '#d8281e', eye: '#e8d060', flight: '#262422' },
      desc: 'A turkey-sized hornbill that walks the grassland in family groups, booming like a lion before dawn. Nests in big hollow trees.',
      hint: 'Grassland with insects, and big old trees or dead trunks to nest in.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 0.8, RIPARIAN: 1, SHRUB: 0.6, MEADOW: 0.4 });
    def({ key: 'weaver', name: 'Speke\'s weaver', sci: 'Ploceus spekei', group: 'Birds', move: 'fly',
      speed: 1.5, hr: 6, max: 30, minK: 3, groupSize: [3, 6], sources: ['N', 'S', 'W'], mig: 0.45, breed: [1, 2, 9], litter: [2, 3], life: 6, mature: 0.6,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 8, 0.4),
      req: g => Math.min(1, g.forestTiles / 40),
      sprite: { kind: 'songbird', size: 11, color: '#d8b020', breast: '#f0cc28', head: '#1a1a14', flight: '#6a5a2a' },
      desc: 'Colonies of these yellow birds knot hundreds of hanging grass nests into a single acacia.',
      hint: 'Acacias for nesting colonies, with grass and water nearby.' });
  }
  {
    const w = habW({ SHRUB: 1, YOUNG_FOREST: 0.9, MEADOW: 0.7, MATURE_FOREST: 0.6 });
    def({ key: 'roller', name: 'Lilac-breasted roller', sci: 'Coracias caudatus', group: 'Birds', move: 'fly',
      speed: 1.6, hr: 10, max: 12, sources: ['N', 'E', 'W'], mig: 0.4, breed: [8, 9], litter: [2, 3], life: 10, mature: 1,
      suit: (W, i) => w[W.habitat[i]] * (0.3 + 0.7 * Math.min(1, W.insects[i])) * near(W.distPerch[i], 2, 0.4),
      req: g => Math.min(1, g.meadowTiles / 800),
      sprite: { kind: 'songbird', size: 14, color: '#6a8a6a', breast: '#b888c8', head: '#6ab0a8', flight: '#2a5ab8', tail: '#2a6ab0' },
      desc: 'Perches on a dead branch, then dives for grasshoppers, flashing electric blue wings.',
      hint: 'Open savanna with perches (snags, lone trees) and plenty of insects.' });
  }

  // ------------------------------------------------------------------ Reptiles
  {
    const w = habW({ RIVER: 1, POND: 1, MARSH: 0.7, CREEK: 0.5 });
    def({ key: 'crocodile', ambush: true, name: 'Nile crocodile', sci: 'Crocodylus niloticus', group: 'Reptiles & more', move: 'semi',
      speed: 0.9, hr: 30, max: 8, minK: 1, sources: ['S'], mig: 0.25, breed: [8, 9], litter: [3, 6], life: 50, mature: 8,
      prey: ['wildebeest', 'zebra', 'catfish', 'gazelle'], preyPer: 8,
      suit: (W, i) => w[W.habitat[i]],
      sprite: { kind: 'caiman', len: 50, color: '#5a5a3a', belly: '#c8c090' },
      desc: 'Waits at the river crossings for the migrating herds, then goes months without eating.',
      hint: 'The river and deep waterholes.' });
  }
  {
    const w = habW({ RIPARIAN: 1, MARSH: 0.8, POND: 0.7, CREEK: 0.8, SHRUB: 0.5 });
    def({ key: 'monitor', name: 'Nile monitor', sci: 'Varanus niloticus', group: 'Reptiles & more', move: 'semi',
      speed: 0.9, hr: 10, max: 8, sources: ['S'], mig: 0.3, breed: [6, 7], litter: [3, 6], life: 15, mature: 2,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 2, 0.1),
      sprite: { kind: 'monitor', size: 34, color: '#3a3a28', belly: '#c8b85a' },
      desc: 'Africa\'s longest lizard, a strong swimmer that raids crocodile nests for eggs.',
      hint: 'Riverbanks and waterholes with cover.' });
  }
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.9, YOUNG_FOREST: 0.4 });
    def({ key: 'tortoise', name: 'Leopard tortoise', sci: 'Stigmochelys pardalis', group: 'Reptiles & more', move: 'ground',
      speed: 0.25, hr: 6, max: 12, sources: ['N', 'E'], mig: 0.25, breed: [8, 9], litter: [2, 4], life: 60, mature: 10,
      suit: (W, i) => w[W.habitat[i]],
      sprite: { kind: 'turtle', size: 16, color: '#d8b870', dark: '#3a2e1e', dome: true },
      desc: 'A high-domed tortoise with leopard-spotted shell, grazing grass and eating old hyena dung for the calcium.',
      hint: 'Grassland and thornbush.' });
  }
  // ------------------------------------------------------------------ Insects and fish
  {
    const w = habW({ MEADOW: 1, SHRUB: 0.7, FARM: 0.5, RIPARIAN: 0.5 });
    def({ key: 'dungbeetle', noDrink: true, name: 'Dung beetle', sci: 'Scarabaeus satyrus', group: 'Reptiles & more', move: 'ground',
      speed: 0.3, hr: 2, max: 30, minK: 2, groupSize: [2, 4], sources: ['N', 'E'], mig: 0.5, breed: [0, 1, 8, 9], litter: [3, 5], life: 1, mature: 0.2,
      needs: ['wildebeest', 'zebra', 'buffalo', 'elephant', 'gazelle', 'impala', 'warthog'], needsPer: 1.5,
      suit: (W, i) => w[W.habitat[i]],
      sprite: { kind: 'beetle', size: 5, color: '#1a1a14', show: 0.55 },
      desc: 'Rolls balls of dung away and buries them, fertilising the soil and planting seeds. A herd is only as healthy as its beetles.',
      hint: 'Wherever big grazers leave dung.' });
  }
  {
    const w = habW({ RIVER: 1, POND: 1, CREEK: 0.7, MARSH: 0.6 });
    def({ key: 'catfish', name: 'African catfish', sci: 'Clarias gariepinus', group: 'Reptiles & more', move: 'swim',
      speed: 1, hr: 6, max: 30, minK: 3, groupSize: [3, 6], sources: ['S'], mig: 0.5, breed: [1, 8], litter: [4, 8], life: 8, mature: 1,
      suit: (W, i) => w[W.habitat[i]] * (W.connected[i] ? 1 : 0.6),
      sprite: { kind: 'fish', size: 18, back: '#3a3a30', flank: '#5e5e48', belly: '#c8c0a0', whiskers: true, catfish: true, long: true, finColor: '#3a3a2e', show: 1.15 },
      desc: 'Can breathe air and even wriggle across land between pools. It survives in waterholes that nearly dry out.',
      hint: 'Waterholes and the river.' });
  }

  return {
    groups: ['Mammals', 'Birds', 'Reptiles & more'],
    names: {
      wildebeest: ['wildebeest', 'wildebeest'], zebra: ['plains zebra', 'zebras'], gazelle: ["Thomson's gazelle", "Thomson's gazelles"],
      impala: ['impala', 'impala'], giraffe: ['giraffe', 'giraffes'], elephant: ['elephant', 'elephants'], buffalo: ['Cape buffalo', 'buffalo'],
      warthog: ['warthog', 'warthogs'], hippo: ['hippo', 'hippos'], rhino: ['black rhino', 'black rhinos'], lion: ['lion', 'lions'],
      cheetah: ['cheetah', 'cheetahs'], leopard: ['leopard', 'leopards'], hyena: ['spotted hyena', 'hyenas'], ostrich: ['ostrich', 'ostriches'],
      vulture: ['white-backed vulture', 'vultures'], secretary: ['secretary bird', 'secretary birds'], crane: ['crowned crane', 'crowned cranes'],
      hornbill: ['ground hornbill', 'ground hornbills'], weaver: ["Speke's weaver", 'weavers'], roller: ['lilac-breasted roller', 'rollers'],
      crocodile: ['Nile crocodile', 'crocodiles'], monitor: ['Nile monitor', 'monitor lizards'], tortoise: ['leopard tortoise', 'leopard tortoises'],
      dungbeetle: ['dung beetle', 'dung beetles'], catfish: ['catfish', 'catfish'],
    },
    shy: {
      rhino: 1, cheetah: 0.9, leopard: 0.9, elephant: 0.6, lion: 0.5, hippo: 0.6, buffalo: 0.5, giraffe: 0.4, crocodile: 0.4, hyena: 0.6,
      secretary: 0.5, crane: 0.5, hornbill: 0.5, vulture: 0.5, ostrich: 0.5, impala: 0.3, gazelle: 0.3, zebra: 0.25, wildebeest: 0.25,
      warthog: 0.3, weaver: 0.05, roller: 0.1, monitor: 0.4, tortoise: 0.2, dungbeetle: 0, catfish: 0.1,
    },
    frugivores: ['elephant', 'hornbill', 'impala'],
    fenced: ['wildebeest', 'zebra', 'buffalo', 'elephant', 'giraffe', 'rhino'],
    damBuilders: [],
    browsers: { giraffe: 0.01, elephant: 0.03, rhino: 0.012, impala: 0.004 },
  };
}
