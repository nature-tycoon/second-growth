// Sumatran wildlife (the Kebun Tualang map). The Leuser rainforest lies to the north and east,
// a village and smallholder palms to the west, and a peat-stained river to the south.
// Months: 0=Mar ... 9=Dec 10=Jan 11=Feb.  Moves: ground, semi (land and water), swim, fly,
// and tree (arboreal: only through connected canopy).

import { habW, near } from './animals.js';

// canopy dwellers only use tiles with real tree cover overhead
const canopy = (W, i) => (W.canopy[i] > 0.45 ? 1 : 0);
const fruit = (W, i, base = 0.4) => base + (1 - base) * Math.min(1, W.berries[i]);
const bugs = (W, i, base = 0.4) => base + (1 - base) * Math.min(1, W.insects[i]);

export default function buildSumatraAnimals(def) {
  // ------------------------------------------------------------------ Mammals
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.55, RIPARIAN: 0.9, MARSH: 0.5 });
    def({ key: 'orangutan', name: 'Sumatran orangutan', sci: 'Pongo abelii', group: 'Mammals', move: 'tree',
      speed: 0.6, hr: 70, max: 8, sources: ['N', 'E'], mig: 0.15, intro: 15000,
      breed: [9], litter: [1, 1], life: 45, mature: 10,
      suit: (W, i) => w[W.habitat[i]] * canopy(W, i) * fruit(W, i, 0.3),
      req: g => Math.max(0, Math.min(1, (g.forestTiles - 700) / 600)), // a big, joined-up forest with fruit all year
      sprite: { kind: 'orangutan', len: 24, color: '#b4561e', belly: '#8e3e16', face: '#3c2c24', show: 1.3,
        male: { flanged: true, len: 27 }, maleShare: 0.35, maleName: 'flanged adult male' },
      desc: 'The "person of the forest". It lives almost entirely in the trees, eats fruit above all (figs, durian, terap), builds a fresh nest of branches every night, and raises one baby at a time for seven or eight years. Grown males develop huge cheek pads and a throat sac for the long call that carries a kilometre through the forest. Fewer than 14,000 are left, and oil palm took much of their lowland forest.',
      hint: 'Fruiting forest canopy joined to the rainforest beyond the fences. Rescued orangutans can be released once the forest is big enough.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.5, RIPARIAN: 0.8 });
    def({ key: 'siamang', name: 'Siamang', sci: 'Symphalangus syndactylus', group: 'Mammals', move: 'tree',
      speed: 1.2, hr: 30, max: 12, minK: 2, groupSize: [2, 4], sources: ['N', 'E'], mig: 0.2,
      breed: [3], litter: [1, 1], life: 35, mature: 6,
      suit: (W, i) => w[W.habitat[i]] * canopy(W, i) * fruit(W, i),
      req: g => Math.max(0, Math.min(1, (g.forestTiles - 300) / 300)),
      sprite: { kind: 'monkey', len: 18, color: '#141210', belly: '#1c1a18', ape: true, sac: '#8a7c74', show: 1.2 },
      desc: 'The biggest gibbon. Families swing arm over arm through the canopy, and every morning the pair sings a duet you can hear kilometres away, booming through the bare throat sac.',
      hint: 'Tall, fruiting forest canopy. Siamangs never come to the ground.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 0.9, RIPARIAN: 1 });
    def({ key: 'langur', name: "Thomas's langur", sci: 'Presbytis thomasi', group: 'Mammals', move: 'tree',
      speed: 1, hr: 14, max: 18, minK: 3, groupSize: [3, 6], sources: ['N', 'E'], mig: 0.3,
      breed: [5, 6], litter: [1, 1], life: 20, mature: 4,
      suit: (W, i) => w[W.habitat[i]] * canopy(W, i),
      req: g => Math.max(0, Math.min(1, (g.forestTiles - 150) / 250)),
      sprite: { kind: 'monkey', len: 15, color: '#8a8884', belly: '#e8e6e0', face: '#ece8e0', crest: '#3a3836', long: true, show: 1.35 },
      desc: 'A grey leaf monkey with a punk crest and a white face, found only in northern Sumatra. It eats young leaves, so it settles into young forest sooner than the fruit eaters.',
      hint: 'Young or old forest canopy, especially along streams.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 0.9, RIPARIAN: 0.9, SHRUB: 0.7, INVASIVE: 0.5, FARM: 0.2 });
    def({ key: 'macaque', name: 'Southern pig-tailed macaque', sci: 'Macaca nemestrina', group: 'Mammals', move: 'ground',
      speed: 1.2, hr: 30, max: 22, minK: 4, groupSize: [5, 10], sources: ['N', 'E', 'W'], mig: 0.35,
      breed: [8, 9, 10], litter: [1, 1], life: 25, mature: 4,
      suit: (W, i) => w[W.habitat[i]] * fruit(W, i, 0.5),
      sprite: { kind: 'monkey', len: 16, color: '#8a6a44', belly: '#c8b08a', face: '#c89a88', shortTail: true, show: 1.4 },
      desc: 'Bold troops that spend as much time on the ground as in the trees, and raid oil palm fruit along the plantation edge. In villages, some are trained to pick coconuts.',
      hint: 'Forest and scrub with fruit. They will forage in the palms too.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.8, RIPARIAN: 1, SHRUB: 0.5, MARSH: 0.4 });
    def({ key: 'tiger', name: 'Sumatran tiger', sci: 'Panthera tigris sondaica', group: 'Mammals', move: 'ground', fixedMax: true,
      speed: 1.6, hr: 500, max: 2, sources: ['N'], mig: 0.1, breed: [6], litter: [2, 3], life: 15, mature: 3,
      prey: ['sambar', 'boar', 'mousedeer', 'tapir', 'macaque'], preyPer: 8,
      suit: (W, i) => w[W.habitat[i]] * near(W.distForest[i], 3, 0.2),
      req: g => Math.min(1, g.forestTiles / 2400) * Math.min(1, g.matureTiles / 120), // a big, grown forest, joined to Leuser
      sprite: { kind: 'feline', len: 46, h: 17, leg: 13, color: '#d8742a', belly: '#f2ebdc', dark: '#1a1410', stripes: true, show: 0.9 },
      desc: 'The smallest, darkest and most densely striped tiger, and the last of the island tigers. Perhaps 600 are left. It needs a huge forest with plenty of deer and wild pigs, and forest corridors to move between.',
      hint: 'A large, connected forest with sambar deer and wild boar to hunt.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.6, RIPARIAN: 0.8 });
    def({ key: 'clouded', name: 'Sunda clouded leopard', sci: 'Neofelis diardi', group: 'Mammals', move: 'ground', fixedMax: true,
      speed: 1.4, hr: 200, max: 3, sources: ['N', 'E'], mig: 0.12, breed: [2], litter: [1, 2], life: 14, mature: 2.5,
      prey: ['langur', 'macaque', 'mousedeer', 'civet'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]] * canopy(W, i),
      req: g => Math.min(1, g.forestTiles / 900),
      sprite: { scale: 0.78, kind: 'feline', len: 32, h: 11, leg: 8, color: '#a89068', belly: '#e0d4bc', dark: '#2a2218', clouds: true },
      desc: 'A secretive cat with cloud-shaped markings, the longest canine teeth for its size of any cat, and ankles that let it climb down trees head first.',
      hint: 'Tall forest with monkeys and mouse-deer.' });
  }
  {
    const w = habW({ SHRUB: 1, YOUNG_FOREST: 1, RIPARIAN: 0.8, INVASIVE: 0.75, MATURE_FOREST: 0.6, MEADOW: 0.6, FARM: 0.5 });
    def({ key: 'leopardcat', name: 'Leopard cat', sci: 'Prionailurus bengalensis', group: 'Mammals', move: 'ground',
      speed: 1.3, hr: 14, max: 10, sources: ['W', 'N', 'E'], mig: 0.35, breed: [2, 8], litter: [2, 3], life: 10, mature: 1,
      prey: ['woodrat'], preyPer: 5,
      suit: (W, i) => w[W.habitat[i]] * near(W.distCover[i], 2, 0.3),
      sprite: { kind: 'feline', len: 18, h: 7, leg: 6, color: '#c8a064', belly: '#f2e8d4', dark: '#2a2018', spotted: true },
      desc: 'A spotted wild cat the size of a house cat. It hunts rats through the palms at night, and is one of the few wild cats that does well on plantation edges.',
      hint: 'Cover near the palms, where the rats are.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.8, RIPARIAN: 0.8, SHRUB: 0.3 });
    def({ key: 'sunbear', name: 'Sun bear', sci: 'Helarctos malayanus', group: 'Mammals', move: 'ground',
      speed: 1, hr: 120, max: 4, sources: ['N', 'E'], mig: 0.18, breed: [7], litter: [1, 2], life: 25, mature: 3,
      suit: (W, i) => w[W.habitat[i]] * (0.3 + 0.35 * Math.min(1, W.berries[i]) + 0.35 * Math.min(1, W.insects[i])),
      req: g => Math.min(1, g.forestTiles / 700) * Math.min(1, (g.snagCount + g.bigTrees / 6) / 6),
      sprite: { kind: 'bear', len: 26, h: 11, leg: 7, color: '#1c1714', muzzle: '#c8a070', chest: '#e8b45a', show: 1.2 },
      desc: 'The smallest bear, with a golden blaze on its chest. It rips open rotten logs and tree trunks for termites and grubs, and climbs for honey and fruit with an extraordinarily long tongue.',
      hint: 'Forest with fruit, dead wood and big old trees.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, SHRUB: 1, RIPARIAN: 1, MATURE_FOREST: 0.7, MEADOW: 0.7, MARSH: 0.5 });
    def({ key: 'gajah', herd: true, herdR: 2.5, herdMax: 6, name: 'Sumatran elephant', sci: 'Elephas maximus sumatranus', group: 'Mammals', move: 'ground',
      speed: 1, hr: 220, max: 7, minK: 3, groupSize: [3, 6], sources: ['N'], mig: 0.12,
      breed: [7], litter: [1, 1], life: 60, mature: 12,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 8, 0.3),
      req: g => Math.min(1, g.forestTiles / 1000),
      sprite: { kind: 'elephant', len: 40, h: 23, leg: 17, color: '#7a7672', belly: '#6c6864', dark: '#3e3a38', asian: true,
        male: { tusker: true, len: 43, h: 25, leg: 18 }, maleShare: 0.25, maleName: 'tusker bull', show: 1.38 },
      desc: 'The Sumatran elephant has lost most of its lowland forest to plantations in a single generation, and herds that find their old routes fenced off end up raiding crops. Give them a way through and they open up thickets, dig for water and carry seeds for kilometres.',
      hint: 'A big mix of young forest, scrub and water, with the elephant fence along the north boundary taken down.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.6, RIPARIAN: 0.9 });
    def({ key: 'sumrhino', name: 'Sumatran rhino', sci: 'Dicerorhinus sumatrensis', group: 'Mammals', move: 'ground', fixedMax: true,
      speed: 0.8, hr: 300, max: 2, sources: ['N'], mig: 0.04, breed: [8], litter: [1, 1], life: 35, mature: 6,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 4, 0.3),
      req: g => Math.min(1, g.forestTiles / 2800) * Math.min(1, g.matureTiles / 300), // old, quiet forest
      sprite: { kind: 'rhino', len: 30, h: 15, leg: 9, color: '#6a5242', belly: '#5a4636', dark: '#3a2c22', hairy: true, show: 1.3 },
      desc: 'The smallest and hairiest rhino, and the most endangered: fewer than fifty are left. It browses saplings in old forest and wallows in mud every day.',
      hint: 'Old, undisturbed forest with mud wallows, joined to Leuser. It almost never comes.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.7, RIPARIAN: 1, MARSH: 0.7, SHRUB: 0.4 });
    def({ key: 'tapir', name: 'Malayan tapir', sci: 'Tapirus indicus', group: 'Mammals', move: 'semi',
      speed: 1, hr: 120, max: 6, minK: 2, groupSize: [1, 2], sources: ['N', 'E'], mig: 0.2,
      breed: [10, 11], litter: [1, 1], life: 25, mature: 3,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 5, 0.4),
      req: g => Math.min(1, g.forestTiles / 600),
      sprite: { kind: 'tapir', len: 44, h: 22, leg: 13, color: '#1c1a1a', belly: '#262222', rim: '#e8e2dc', saddle: '#e6e2da' },
      desc: 'Black at both ends with a white saddle in between, which breaks up its outline in the moonlit forest. It browses at night and swims well, often walking along the riverbed.',
      hint: 'Forest with streams and swamp. Fences keep it out.' });
  }
  {
    const w = habW({ SHRUB: 1, YOUNG_FOREST: 0.9, MEADOW: 0.8, RIPARIAN: 0.9, MATURE_FOREST: 0.6, MARSH: 0.4 });
    def({ key: 'sambar', name: 'Sambar deer', sci: 'Rusa unicolor', group: 'Mammals', move: 'ground',
      speed: 1.3, hr: 50, max: 14, minK: 2, groupSize: [2, 4], sources: ['N', 'E'], mig: 0.25,
      breed: [7, 8], litter: [1, 1], life: 16, mature: 2,
      suit: (W, i) => w[W.habitat[i]] * (0.4 + 0.6 * Math.min(1, W.browse[i] + W.graze[i])),
      sprite: { scale: 0.85, kind: 'deer', len: 38, h: 18, leg: 17, color: '#5e4a38', belly: '#6e5a46', dark: '#2e241a', antlers: true },
      desc: 'A big, shaggy forest deer with a dark coat, and the tiger\'s main prey. It browses young leaves along forest edges and in regrowth.',
      hint: 'Young forest, scrub and clearings. Fences keep it out.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.9, RIPARIAN: 0.9, SHRUB: 0.5 });
    def({ key: 'mousedeer', name: 'Lesser mouse-deer', sci: 'Tragulus kanchil', group: 'Mammals', move: 'ground',
      speed: 1.3, hr: 6, max: 24, sources: ['N', 'E'], mig: 0.35, breed: [0, 4, 8], litter: [1, 1], life: 10, mature: 0.6,
      suit: (W, i) => w[W.habitat[i]] * fruit(W, i, 0.5) * near(W.distCover[i], 1, 0.4),
      sprite: { kind: 'agouti', len: 11, color: '#8a5a34', belly: '#ece0cc', mousedeer: true, show: 1.4 },
      desc: 'A tiny hoofed animal no bigger than a rabbit, on legs as thin as pencils. In Malay and Indonesian folk tales, Sang Kancil the mouse-deer outwits the tiger and the crocodile.',
      hint: 'Thick forest undergrowth with fallen fruit.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, SHRUB: 1, MATURE_FOREST: 0.8, RIPARIAN: 0.9, INVASIVE: 0.75, FARM: 0.4, MARSH: 0.5 });
    def({ key: 'boar', name: 'Banded wild boar', sci: 'Sus scrofa vittatus', group: 'Mammals', move: 'ground',
      speed: 1.3, hr: 24, max: 24, minK: 3, groupSize: [3, 7], sources: ['W', 'N', 'E'], mig: 0.35, breed: [9, 10, 11], litter: [3, 5], life: 10, mature: 1.2,
      suit: (W, i) => w[W.habitat[i]] * fruit(W, i, 0.55),
      sprite: { kind: 'peccary', len: 30, h: 13, leg: 9, color: '#5a4c40', belly: '#6a5c50', beard: '#d8ccb8' },
      desc: 'Wild pigs with a pale band across the snout. They grow fat on fallen palm fruit and root up the plantation floor, but in the forest they turn the soil and are what tigers eat most.',
      hint: 'Almost anywhere with fallen fruit, palms included.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, MATURE_FOREST: 1, SHRUB: 0.7, RIPARIAN: 0.8 });
    def({ key: 'pangolin', name: 'Sunda pangolin', sci: 'Manis javanica', group: 'Mammals', move: 'ground',
      speed: 0.6, hr: 16, max: 8, sources: ['N', 'E'], mig: 0.2, breed: [9, 10], litter: [1, 1], life: 15, mature: 1.5,
      suit: (W, i) => w[W.habitat[i]] * bugs(W, i, 0.3),
      sprite: { kind: 'pangolin', len: 22, color: '#8a6a48', belly: '#d2bc98' },
      desc: 'A walking pine cone: the only mammal covered in scales. It digs out ants and termites at night, and rolls into a ball when threatened. It is the most trafficked mammal in the world.',
      hint: 'Forest with plenty of ants and termites, and quiet.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, SHRUB: 0.9, INVASIVE: 0.85, MATURE_FOREST: 0.8, RIPARIAN: 0.8, FARM: 0.4 });
    def({ key: 'civet', name: 'Common palm civet', sci: 'Paradoxurus hermaphroditus', group: 'Mammals', move: 'ground',
      speed: 1.1, hr: 10, max: 16, sources: ['W', 'N', 'E'], mig: 0.4, breed: [2, 8], litter: [2, 3], life: 12, mature: 1,
      suit: (W, i) => w[W.habitat[i]] * fruit(W, i, 0.5),
      sprite: { kind: 'raccoon', len: 24, color: '#6e665a', belly: '#c8c0b0', dark: '#1c1a18', civet: true, show: 0.78 },
      desc: 'A masked, cat-sized fruit eater that climbs at night. It swallows fruit whole and spreads the seeds, which is how oil palm seedlings turn up deep in the forest, and how kopi luwak coffee is made.',
      hint: 'Anywhere with fruit: forest, scrub and palms.' });
  }
  {
    const w = habW({ INVASIVE: 1, FARM: 0.6, SHRUB: 0.5, MEADOW: 0.4, YOUNG_FOREST: 0.3 });
    def({ key: 'woodrat', name: 'Malaysian wood rat', sci: 'Rattus tiomanicus', group: 'Mammals', move: 'ground',
      speed: 1.2, hr: 1.2, max: 90, minK: 2, groupSize: [2, 4], sources: ['W'], mig: 0.6, breed: [0, 2, 4, 6, 8, 10], litter: [3, 6], life: 1, mature: 0.25,
      suit: (W, i) => w[W.habitat[i]] * fruit(W, i, 0.6),
      sprite: { kind: 'rodent', len: 12, color: '#7a6650', belly: '#c8b8a0', show: 1.2 },
      desc: 'The plantation rat. It lives on fallen palm fruit and can eat a tenth of an estate\'s harvest. Barn owls, leopard cats and pythons keep it in check; as the palms go, so do most of the rats.',
      hint: 'Oil palms and weedy ground.' });
  }
  {
    const w = habW({ CREEK: 1, RIVER: 0.9, POND: 0.9, MARSH: 0.7, RIPARIAN: 0.5 });
    def({ key: 'otter', name: 'Smooth-coated otter', sci: 'Lutrogale perspicillata', group: 'Mammals', move: 'semi', patrol: true,
      speed: 1.4, hr: 30, max: 8, minK: 2, groupSize: [2, 5], sources: ['S'], mig: 0.25, breed: [7, 8], litter: [2, 4], life: 10, mature: 2,
      prey: ['snakehead', 'mahseer'], preyPer: 4,
      suit: (W, i) => w[W.habitat[i]] * W.waterQ[i],
      req: g => Math.min(1, g.fishIndex / 12) * Math.min(1, g.cleanWater / 40) * Math.min(1, g.forestTiles / 300), // (dens under streamside cover)
      sprite: { kind: 'otter', len: 30, color: '#5a4434', belly: '#a89070' },
      desc: 'Family groups fish together along rivers and canals, herding fish into the shallows. They need clean water and banks with cover for their dens.',
      hint: 'Clean, shaded streams and canals full of fish.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.8, RIPARIAN: 1, MARSH: 0.6 });
    def({ key: 'flyingfox', name: 'Large flying fox', sci: 'Pteropus vampyrus', group: 'Mammals', move: 'fly',
      speed: 1.4, hr: 40, max: 24, minK: 3, groupSize: [3, 6], sources: ['N', 'E', 'S'], mig: 0.45, breed: [1, 2], litter: [1, 1], life: 15, mature: 2,
      suit: (W, i) => w[W.habitat[i]] * (0.3 + 0.7 * Math.min(1, W.berries[i] + W.nectar[i])),
      sprite: { kind: 'bat', batType: 'fox', size: 22, color: '#4a3426' },
      desc: 'A fruit bat with a wingspan wider than a person is tall. Flying foxes pollinate durian and petai flowers at night, and carry seeds for many kilometres.',
      hint: 'Fruit and flowering trees, durian and petai especially.' });
  }

  // ------------------------------------------------------------------ Birds
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.6, RIPARIAN: 0.8 });
    def({ key: 'hornbill', name: 'Rhinoceros hornbill', sci: 'Buceros rhinoceros', group: 'Birds', move: 'fly',
      speed: 1.3, hr: 60, max: 6, minK: 2, groupSize: [2, 2], sources: ['N', 'E'], mig: 0.25, breed: [0, 1], litter: [1, 2], life: 35, mature: 5,
      suit: (W, i) => w[W.habitat[i]] * fruit(W, i),
      req: g => Math.min(1, (g.snagCount + g.bigTrees / 6) / 5) * Math.min(1, g.forestTiles / 600),
      sprite: { kind: 'hornbill', size: 28, color: '#141210', breast: '#141210', head: '#141210', bill: '#f2e6b0', casque: '#e8601e', tail: '#f4f0e8', tailBand: '#141210', perch: true, show: 0.85 },
      desc: 'A huge black-and-white hornbill with an upturned orange casque, and wings that whoosh like a passing train. The female seals herself into a tree hollow to nest, and the male feeds her figs through a slit for months.',
      hint: 'Big old trees with hollows, or snags, and plenty of figs.' });
  }
  {
    const w = habW({ INVASIVE: 0.9, FARM: 0.9, MEADOW: 1, SHRUB: 0.8, YOUNG_FOREST: 0.4, RIPARIAN: 0.4 });
    def({ key: 'barnowl', name: 'Barn owl', sci: 'Tyto alba javanica', group: 'Birds', move: 'fly',
      speed: 1.2, hr: 18, max: 8, sources: ['W'], mig: 0.3, breed: [2, 3], litter: [3, 5], life: 6, mature: 1,
      prey: ['woodrat'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]] * near(W.distNest[i], 10, 0.3),
      req: g => Math.min(1, (g.nestboxCount + g.structureCount + g.snagCount / 3) / 3),
      sprite: { kind: 'owl', size: 20, color: '#c8a46a', breast: '#f4ece0', head: '#c8a46a', barn: true },
      desc: 'A ghost-pale owl that plantations put up nest boxes for: a pair and their chicks eat over a thousand rats a year. It hunts open ground at night.',
      hint: 'Nest boxes (or old buildings and snags) near open ground with rats.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 1, RIPARIAN: 1, SHRUB: 0.5, MARSH: 0.5 });
    def({ key: 'serpenteagle', name: 'Crested serpent eagle', sci: 'Spilornis cheela', group: 'Birds', move: 'fly',
      speed: 1.2, hr: 90, max: 3, sources: ['N', 'E'], mig: 0.2, breed: [1, 2], litter: [1, 1], life: 20, mature: 3,
      prey: ['python', 'monitor', 'flyingfrog'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]] * near(W.distPerch[i], 3, 0.4),
      req: g => Math.min(1, g.forestTiles / 400),
      sprite: { kind: 'raptor', size: 26, color: '#4a3826', breast: '#8a6440', head: '#2a2018', tail: '#2a2018', crest: 'mane', tailBars: '#e8e0d0', bill: '#5a5a58' },
      desc: 'Circles over the forest calling a loud, ringing "kek-kek-kek-kweeee", and drops on snakes and lizards. It raises a black-and-white crest when alarmed.',
      hint: 'Forest edges with tall perches and snakes or lizards.' });
  }
  {
    const w = habW({ MARSH: 1, POND: 0.8, CREEK: 0.8, RIVER: 0.6, RIPARIAN: 0.7 });
    def({ key: 'stork', name: "Storm's stork", sci: 'Ciconia stormi', group: 'Birds', move: 'fly',
      speed: 1, hr: 50, max: 4, sources: ['S'], mig: 0.2, breed: [7, 8], litter: [2, 2], life: 18, mature: 3,
      suit: (W, i) => w[W.habitat[i]] * W.waterQ[i] * near(W.distForest[i], 3, 0.3),
      req: g => Math.min(1, g.fishIndex / 10) * Math.min(1, g.forestTiles / 700),
      sprite: { scale: 0.76, kind: 'heron', size: 26, color: '#1a1a1a', breast: '#f2f2ee', head: '#1a1a1a', flight: '#141414', bill: '#d8281e', stork: true, show: 0.85 },
      desc: 'One of the rarest storks on Earth, with a red bill and golden eye-rings. It feeds alone along streams and pools inside peat swamp and riverside forest, never in the open.',
      hint: 'Clean streams and wet peat inside forest.' });
  }
  {
    const w = habW({ CREEK: 1, POND: 0.9, RIVER: 0.7, MARSH: 0.6 });
    def({ key: 'kingfisher', name: 'Stork-billed kingfisher', sci: 'Pelargopsis capensis', group: 'Birds', move: 'fly',
      speed: 1.4, hr: 10, max: 8, sources: ['S'], mig: 0.4, breed: [2, 3], litter: [2, 4], life: 8, mature: 1,
      suit: (W, i) => w[W.habitat[i]] * W.waterQ[i] * near(W.distPerch[i], 2, 0.4),
      req: g => Math.min(1, g.fishIndex / 8),
      sprite: { kind: 'songbird', size: 16, color: '#2e8aa0', breast: '#eab070', head: '#a48a5a', bill: '#d8281a', wingShape: 'pointed' },
      desc: 'A big kingfisher with an enormous red bill, watching from branches over shady streams before plunging in.',
      hint: 'Clear creeks and canals with overhanging branches.' });
  }
  {
    const w = habW({ YOUNG_FOREST: 1, SHRUB: 1, RIPARIAN: 0.9, MATURE_FOREST: 0.7, MEADOW: 0.5 });
    def({ key: 'sunbird', name: 'Crimson sunbird', sci: 'Aethopyga siparaja', group: 'Birds', move: 'fly',
      speed: 1.6, hr: 4, max: 24, sources: ['N', 'E', 'W'], mig: 0.5, breed: [1, 2, 7, 8], litter: [2, 2], life: 5, mature: 0.5,
      suit: (W, i) => w[W.habitat[i]] * (0.15 + 0.85 * Math.min(1, W.nectar[i] * 1.5)),
      sprite: { kind: 'hummer', size: 8, color: '#5a5a3a', breast: '#d8281e', head: '#c81e1e' },
      desc: 'The Old World\'s answer to a hummingbird: the male is scarlet, with a long curved bill for torch ginger and ixora flowers. It perches to feed rather than hovering.',
      hint: 'Flowering shrubs: torch ginger, ixora and senduduk.' });
  }
  {
    const w = habW({ SHRUB: 1, YOUNG_FOREST: 0.8, MEADOW: 0.6, RIPARIAN: 0.7, INVASIVE: 0.35, FARM: 0.2 });
    def({ key: 'bulbul', name: 'Sooty-headed bulbul', sci: 'Pycnonotus aurigaster', group: 'Birds', move: 'fly',
      speed: 1.3, hr: 4, max: 30, sources: ['W', 'N', 'E'], mig: 0.5, breed: [1, 2, 3], litter: [2, 3], life: 5, mature: 0.5,
      suit: (W, i) => w[W.habitat[i]] * fruit(W, i, 0.4),
      sprite: { kind: 'songbird', size: 11, color: '#8a8478', breast: '#e8e4dc', head: '#1a1816', crest: true, tail: '#3a3630', vent: '#d83a2a' },
      desc: 'A cheerful crested songbird of scrub and regrowth that eats berries all day and drops the seeds as it goes, planting the next generation of shrubs.',
      hint: 'Scrub and young forest with berries.' });
  }

  // ------------------------------------------------------------------ Reptiles & amphibians
  {
    const w = habW({ CREEK: 1, MARSH: 1, POND: 0.9, RIVER: 0.7, RIPARIAN: 0.8, INVASIVE: 0.4, YOUNG_FOREST: 0.4 });
    def({ key: 'monitor', name: 'Asian water monitor', sci: 'Varanus salvator', group: 'Reptiles & amphibians', move: 'semi',
      speed: 1, hr: 18, max: 10, sources: ['S', 'W'], mig: 0.35, breed: [3, 4], litter: [4, 8], life: 15, mature: 2,
      prey: ['woodrat', 'snakehead'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 3, 0.3),
      sprite: { kind: 'monitor', size: 32, color: '#3a3a2a', belly: '#d0c060' },
      desc: 'A two-metre lizard that swims canals with its tail, eats almost anything, and cleans up dead fish and carrion. It does well wherever there is water.',
      hint: 'Canals, streams and swamp edges.' });
  }
  {
    const w = habW({ MARSH: 1, RIPARIAN: 1, YOUNG_FOREST: 0.8, MATURE_FOREST: 0.6, INVASIVE: 0.6, SHRUB: 0.6 });
    def({ key: 'python', name: 'Reticulated python', sci: 'Malayopython reticulatus', group: 'Reptiles & amphibians', move: 'semi',
      speed: 0.5, hr: 30, max: 4, sources: ['S', 'W'], mig: 0.2, breed: [6], litter: [4, 6], life: 20, mature: 3,
      prey: ['woodrat', 'boar', 'macaque'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 4, 0.4),
      sprite: { kind: 'snake', reticulated: true, size: 30, color: '#8a7a4a', stripe: '#8a7a4a', side: '#2a2016', blotches: '#e0c870', belly: '#e8dcb8' },
      desc: 'The longest snake in the world, patterned like a net. It waits near water and in the palms, where it eats a great many rats.',
      hint: 'Swamp, streamside forest and palms with rats.' });
  }
  {
    const w = habW({ RIVER: 1, MARSH: 0.9, CREEK: 0.6, POND: 0.7 });
    def({ key: 'gharial', name: 'False gharial', sci: 'Tomistoma schlegelii', group: 'Reptiles & amphibians', move: 'semi',
      speed: 0.8, hr: 40, max: 3, sources: ['S'], mig: 0.12, breed: [5, 6], litter: [3, 6], life: 50, mature: 10,
      prey: ['snakehead', 'mahseer', 'arowana'], preyPer: 6,
      suit: (W, i) => w[W.habitat[i]] * W.waterQ[i] * near(W.distForest[i], 2, 0.3),
      req: g => Math.min(1, g.fishIndex / 14) * Math.min(1, g.cleanWater / 50) * Math.min(1, g.forestTiles / 900),
      sprite: { kind: 'caiman', len: 46, color: '#5a4a32', belly: '#c8b890', gharial: true },
      desc: 'A crocodile with a long, needle-thin snout for catching fish, living in blackwater peat swamp rivers. Draining and burning of the peat swamps has made it endangered.',
      hint: 'Clean, fish-filled river and swamp channels with forest on the banks.' });
  }
  {
    const w = habW({ MATURE_FOREST: 1, YOUNG_FOREST: 0.7, RIPARIAN: 1, MARSH: 0.8 });
    def({ key: 'flyingfrog', name: "Wallace's flying frog", sci: 'Rhacophorus nigropalmatus', group: 'Reptiles & amphibians', move: 'semi',
      speed: 0.6, hr: 3, max: 30, sources: ['N', 'E'], mig: 0.3, breed: [7, 8, 9], litter: [3, 6], life: 4, mature: 0.6,
      suit: (W, i) => w[W.habitat[i]] * near(W.distWater[i], 4, 0.3) * canopy(W, i),
      sprite: { kind: 'frog', size: 7, color: '#3aa04a', dark: '#2a6a34', show: 1.3 },
      desc: 'A tree frog that glides from branch to branch on huge webbed feet, and lays its eggs in a foam nest over a pool, so the tadpoles drop straight in.',
      hint: 'Forest canopy over swamp pools and streams.' });
  }

  // ------------------------------------------------------------------ River life
  {
    const w = habW({ POND: 1, MARSH: 0.8, CREEK: 0.6, RIVER: 0.5 });
    def({ key: 'arowana', name: 'Asian arowana', sci: 'Scleropages formosus', group: 'River life', move: 'swim',
      speed: 1, hr: 10, max: 8, minK: 2, sources: ['S'], mig: 0.15, breed: [6, 7], litter: [2, 3], life: 20, mature: 4,
      suit: (W, i) => w[W.habitat[i]] * W.waterQ[i],
      req: g => Math.min(1, g.cleanWater / 50) * Math.min(1, g.forestTiles / 500),
      sprite: { kind: 'fish', size: 22, back: '#5a5a3a', flank: '#d8a83a', belly: '#e8d8a0', long: true, rearFins: true, finColor: '#c8402a', tailShape: 'round' },
      desc: 'The "dragon fish", with big shining scales and chin barbels. The fathers carry the eggs and young in their mouths. Prized and poached for aquariums, it lives in blackwater peat swamps.',
      hint: 'Clean, still blackwater: rewetted peat pools and blocked canals.' });
  }
  {
    const w = habW({ POND: 1, MARSH: 1, CREEK: 0.8, RIVER: 0.6 });
    def({ key: 'snakehead', name: 'Giant snakehead', sci: 'Channa micropeltes', group: 'River life', move: 'swim',
      speed: 1.2, hr: 6, max: 30, minK: 2, groupSize: [2, 4], sources: ['S'], mig: 0.45, breed: [5, 6, 7], litter: [4, 8], life: 8, mature: 1.5,
      suit: (W, i) => w[W.habitat[i]] * (0.4 + 0.6 * W.waterQ[i]),
      sprite: { kind: 'fish', size: 20, back: '#2a3a30', flank: '#6a7a60', belly: '#d8dcc8', long: true, spots: '#1a2018', tailShape: 'round' },
      desc: 'Toman: a big predatory fish that can breathe air, so it lives even in murky canals and swamp pools. Both parents guard their bright orange fry.',
      hint: 'Canals, ponds and swamp water.' });
  }
  {
    const w = habW({ CREEK: 1, RIVER: 0.8, POND: 0.3 });
    def({ key: 'mahseer', name: 'Malayan mahseer', sci: 'Tor tambroides', group: 'River life', move: 'swim',
      speed: 1.4, hr: 8, max: 18, minK: 2, groupSize: [2, 4], sources: ['S'], mig: 0.35, breed: [8, 9], litter: [3, 6], life: 15, mature: 3,
      suit: (W, i) => w[W.habitat[i]] * W.waterQ[i] * (W.connected[i] ? 1 : 0.2),
      req: g => Math.min(1, g.cleanWater / 30),
      sprite: { kind: 'fish', size: 18, back: '#4a5a4a', flank: '#b8a878', belly: '#e8e0c8', finColor: '#c8603a', tailShape: 'fork', show: 1.3 },
      desc: 'Ikan kelah: a big, bronze-scaled river fish that swims up clear forest streams to eat fallen fruit and seeds. It vanishes when streams run muddy and bare.',
      hint: 'Clear, shaded streams connected to the river.' });
  }

  // ------------------------------------------------------------------ Insects
  {
    const w = habW({ RIPARIAN: 1, YOUNG_FOREST: 0.9, MATURE_FOREST: 0.8, SHRUB: 0.6 });
    def({ key: 'birdwing', name: "Rajah Brooke's birdwing", sci: 'Trogonoptera brookiana', group: 'Insects', move: 'fly',
      speed: 1.3, hr: 3, max: 24, groupSize: [1, 3], sources: ['N', 'E'], mig: 0.6, breed: [1, 5, 9], litter: [1, 3], life: 0.6, mature: 0.1,
      suit: (W, i) => w[W.habitat[i]] * (0.2 + 0.8 * Math.min(1, W.nectar[i] * 1.4)) * near(W.distWater[i], 4, 0.4),
      req: g => Math.min(1, g.forestTiles / 250),
      sprite: { kind: 'butterfly', size: 11, color: '#141614', vein: '#0a0a0a', spots: '#2ad070', show: 1.9, birdwing: true },
      desc: 'A big, swallow-winged butterfly, velvet black with bands of emerald green. Males gather in groups to sip minerals from wet sand along forest streams.',
      hint: 'Forest streams with flowers nearby.' });
  }

  return {
    groups: ['Mammals', 'Birds', 'Reptiles & amphibians', 'River life', 'Insects'],
    names: {
      orangutan: ['orangutan', 'orangutans'], siamang: ['siamang', 'siamangs'], langur: ["Thomas's langur", "Thomas's langurs"],
      macaque: ['pig-tailed macaque', 'pig-tailed macaques'], tiger: ['Sumatran tiger', 'Sumatran tigers'],
      clouded: ['clouded leopard', 'clouded leopards'], leopardcat: ['leopard cat', 'leopard cats'], sunbear: ['sun bear', 'sun bears'],
      gajah: ['Sumatran elephant', 'Sumatran elephants'], sumrhino: ['Sumatran rhino', 'Sumatran rhinos'], tapir: ['Malayan tapir', 'Malayan tapirs'],
      sambar: ['sambar deer', 'sambar deer'], mousedeer: ['mouse-deer', 'mouse-deer'], boar: ['wild boar', 'wild boar'],
      pangolin: ['pangolin', 'pangolins'], civet: ['palm civet', 'palm civets'], woodrat: ['wood rat', 'wood rats'],
      otter: ['smooth-coated otter', 'smooth-coated otters'], flyingfox: ['flying fox', 'flying foxes'],
      hornbill: ['rhinoceros hornbill', 'rhinoceros hornbills'], barnowl: ['barn owl', 'barn owls'], serpenteagle: ['serpent eagle', 'serpent eagles'],
      stork: ["Storm's stork", "Storm's storks"], kingfisher: ['stork-billed kingfisher', 'stork-billed kingfishers'],
      sunbird: ['crimson sunbird', 'crimson sunbirds'], bulbul: ['bulbul', 'bulbuls'],
      monitor: ['water monitor', 'water monitors'], python: ['reticulated python', 'reticulated pythons'], gharial: ['false gharial', 'false gharials'],
      flyingfrog: ['flying frog', 'flying frogs'], arowana: ['arowana', 'arowanas'], snakehead: ['snakehead', 'snakeheads'],
      mahseer: ['mahseer', 'mahseer'], birdwing: ['birdwing', 'birdwings'],
    },
    shy: {
      orangutan: 0.5, siamang: 0.5, langur: 0.35, macaque: 0.1, tiger: 1, clouded: 0.9, leopardcat: 0.4, sunbear: 0.7,
      gajah: 0.7, sumrhino: 1, tapir: 0.8, sambar: 0.6, mousedeer: 0.5, boar: 0.3, pangolin: 0.8, civet: 0.3, woodrat: 0.05,
      otter: 0.5, flyingfox: 0.2, hornbill: 0.5, barnowl: 0.3, serpenteagle: 0.5, stork: 0.8, kingfisher: 0.3, sunbird: 0.05, bulbul: 0.05,
      monitor: 0.2, python: 0.5, gharial: 0.7, flyingfrog: 0.2, arowana: 0.4, snakehead: 0.1, mahseer: 0.3, birdwing: 0.05,
    },
    frugivores: ['orangutan', 'siamang', 'macaque', 'boar', 'civet', 'hornbill', 'flyingfox', 'gajah', 'sunbear', 'bulbul', 'tapir', 'mousedeer'],
    fenced: ['gajah', 'tapir', 'sambar', 'sumrhino'],
    damBuilders: [],
    browsers: { gajah: 0.01, sambar: 0.004, tapir: 0.004 },
  };
}
