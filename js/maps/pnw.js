// Map: the Hollis farm, a worn-out dairy farm in a Cascade foothill valley, Washington.

import buildPnwPlants from '../data/plants-pnw.js';
import buildPnwAnimals from '../data/animals-pnw.js';
import { PNW_GOALS } from '../sim/goals.js';
import { generateFarm, pnwBorderCell } from '../world.js';

export default {
  id: 'pnw',
  name: 'Cascade foothills',
  farm: 'Hollis Farm',
  region: 'Pacific Northwest',
  blurb: 'A worn-out dairy farm in a Washington valley: salmon creek, conifer forest, winter floods and summer fires.',
  campaign: true,
  campaignEnd: 'You finished the campaign. The Hollis farm is a living valley again, and every tool is yours. Keep going as long as you like: the old forest is still growing up, and the salmon are still coming home.',
  image: 'assets/maps/pnw.jpg',
  lat: 46.6, lon: -122.9, // where the pin sits on the world map
  plants: buildPnwPlants,
  animals: buildPnwAnimals,
  goals: PNW_GOALS,
  generate: generateFarm,
  borderCell: pnwBorderCell,
  startWildlife: [['vole', 6, 90, 14, 8], ['robin', 3, 25, 24, 6], ['raccoon', 1, 33, 22, 4], ['mallard', 2, 93, 37, 2], ['treefrog', 5, 93, 37, 4]],
  startText: 'Spring, Year 1. The farm is quiet: a few voles, robins and a pair of mallards on the stock pond. Let\'s change that.',
  story: `<p><b>Your great-aunt left you the old Hollis farm</b>: 180 acres of tired pasture and plowed fields in a Cascade foothill valley, bordered by second-growth forest to the north and east and a salmon river to the south. The land trust will fund your work. Your job is to give it back to the wild.</p>`,
  rules: [
    'You don\'t buy animals or upgrades. <b>You build habitat</b>, and wildlife follows its own rules: it wanders in from the surrounding forest, river and farms when there\'s room, raises young, hunts, and moves on when there isn\'t enough.',
    '<b>Plants follow succession.</b> Pioneers like red alder, lupine and fireweed heal worn-out soil. Later, shade-loving cedar and hemlock take over. Every plant has water, light and soil needs.',
    '<b>Water ties it all together.</b> Ponds, marshes and creeks raise soil moisture nearby. Shaded, connected creeks let salmon return. Beavers will build dams and flood new wetlands on their own.',
    '<b>Invasives</b> (blackberry, Scotch broom, reed canarygrass) spread from the neighbors. Pull them, then shade them out.',
    '<b>The land has shape.</b> Hollows stay wet, ridges drain dry. Raise and lower ground to make new niches.',
    '<b>Disturbance is natural.</b> Summer wildfires race through dry grass and broom; winter floods spill over the low ground. Wetlands soak up floods and burned meadows bounce back.',
    '<b>Money is tight.</b> Grants grow with ecosystem health, and visitors on your trails pay their way, but crowds push shy wildlife away.',
  ],
  firstYear: [
    'Demolish the <b>culvert</b> where the river road crosses the ditch, then plant <b>streamside shrubs</b> and <b>pioneer trees</b> along the creek to shade it.',
    'Dig a <b>marsh</b> or two, loosen the plowed fields and sow <b>meadow mix</b>.',
    'Pull out the east and north <b>boundary fences</b> so deer can find you.',
    'When you can afford it, put a <b>trailhead parking</b> lot by the road and a trail into your best habitat.',
  ],

  // Months run March..February.
  climate: {
    seasons: ['Spring', 'Summer', 'Autumn', 'Winter'],
    rain: [0.45, 0.35, 0.3, 0.2, 0.08, 0.08, 0.2, 0.45, 0.6, 0.65, 0.65, 0.55],
    growth: [0.75, 1.0, 1.0, 0.9, 0.65, 0.55, 0.6, 0.4, 0.15, 0.04, 0.04, 0.3],
    spread: [0.3, 0.5, 0.8, 1.0, 1.2, 1.3, 1.3, 1.0, 0.4, 0.05, 0.05, 0.1],
    moist: [0.07, 0.05, 0.0, -0.05, -0.12, -0.15, -0.08, 0.02, 0.09, 0.12, 0.12, 0.1],
    snow: { months: [9, 10, 11], chance: m => (m === 10 ? 0.4 : 0.25) },
    fireMonths: [4, 5, 6],
    floodMonths: [8, 9, 10, 11, 0],
    tips: [
      'Spring: seeds germinate and migrant birds return. A great time to plant.',
      'Summer: dry weather. Plants grow slower and streams get warm without shade.',
      'Autumn: berries ripen, leaves turn, and coho salmon run in October if they can get upstream.',
      'Winter: rain soaks the valley. Most plants rest, but owls and eagles are busy.',
    ],
    fireCause: ['A dry lightning strike', 'A stray campfire spark'],
  },
  // seeds drifting in from each side of the property
  seedRain: {
    N: ['fir', 'hemlock', 'cedar', 'alder', 'swordfern', 'salal', 'vinemaple', 'salmonberry'],
    E: ['alder', 'maple', 'fir', 'salmonberry', 'snowberry', 'swordfern', 'elderberry'],
    W: ['blackberry', 'blackberry', 'broom', 'canarygrass'],
    S: ['willow', 'cottonwood', 'alder', 'canarygrass', 'dogwood', 'sedge'],
  },
  windSeeds: ['fireweed', 'cottonwood'],
  berrySeeds: ['salmonberry', 'elderberry', 'snowberry', 'rose', 'salal', 'oregongrape', 'blackberry'],
  floodSeeds: ['willow', 'cottonwood', 'sedge', 'canarygrass', 'alder'],
  burnSeeds: ['fireweed', 'fireweed', 'wildrye', 'fescue', 'lupine', 'yarrow'],

  text: {
    edges: { N: 'the forest to the north', E: 'the woods to the east', S: 'the river', W: 'the farms to the west' },
    creekFish: 'salmon', culvertBlocks: 'salmon and trout', fenceBlocks: 'deer and elk',
    flood: 'Winter flood!',
    floodOut: 'Willow and cottonwood seeds love it (and so does reed canarygrass).',
    fireOutRain: 'Watch camas, lupine and fireweed come back strong in the ash.',
    fireOut: 'Burned meadows green up fast; young forest will take years.',
    crownOut: 'Fireweed, lupine and grasses will turn the burn into meadow for years before trees return, and woodpeckers love the snags.',
  },
  look: {
    pasture: ['#a2b56a', '#abb26c', '#a9a46c', '#8c976a'],
    soil: [0.8, 0.66, 0.5], mud: [0.62, 0.54, 0.42],
    water: { pond: [0.3, 0.56, 0.66, 0.82], creek: [0.38, 0.63, 0.7, 0.78], river: [0.28, 0.52, 0.63, 0.86], marsh: [0.46, 0.62, 0.52, 0.55] },
    light: [
      { sun: 0xfff3dc, sunI: 2.5, sky: 0xe4eeff, ground: 0x5f6e3c, hemiI: 1.25 },
      { sun: 0xffeccc, sunI: 2.8, sky: 0xf0f0ff, ground: 0x6e6a3c, hemiI: 1.3 },
      { sun: 0xffd9a8, sunI: 2.3, sky: 0xf4e4d0, ground: 0x6a5a38, hemiI: 1.2 },
      { sun: 0xdfe8ff, sunI: 1.7, sky: 0xd2dcec, ground: 0x4a5048, hemiI: 1.15 },
    ],
    // falling leaves, seed fluff and mist (0..1 per season), and the flocks that pass over
    ambience: {
      leaves: [0, 0.05, 1, 0.08], fluff: [0.55, 1, 0.3, 0], mist: [0.45, 0.05, 0.75, 0.9],
      leafColors: ['#d89a2a', '#c8602a', '#e0b83a', '#a8482a', '#b8903a'],
      flocks: [['geese', 'geese', 'songbirds', 'swallows'], ['swallows', 'songbirds'], ['geese', 'geese', 'songbirds'], ['geese', 'songbirds']],
    },
    tint: ['rgba(255,250,230,0)', 'rgba(255,215,140,0.05)', 'rgba(255,160,80,0.06)', 'rgba(140,165,200,0.1)'],
  },
};
