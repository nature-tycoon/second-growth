// Campaign for Enkare Conservancy: eight chapters that take an overgrazed, crusted range back to
// Serengeti grassland. The arc follows how dryland restoration really works in East Africa:
// break the crust and catch the rain, get grass back ahead of the weeds, free the sand river,
// open the migration route, grow acacia woodland, live with fire, bring in safari visitors,
// and finally welcome the herds and the animals that follow them.
// Built when the map loads, from shared helpers (see campaign.js).

import { perimeterFence } from './goals.js';
import { PLANT } from '../data/plants.js';

// tiles where a given ground plant has properly established
const established = (w, key) => {
  const id = PLANT[key]?.id; let n = 0;
  for (let i = 0; i < w.n; i++) if (w.ground[i] === id && w.groundG[i] > 0.4) n++;
  return n;
};

export function serengetiChapters(h) {
  const { used, pop, culvertGone, score, count, flag, layerTools, wildlifeTools, speciesPresent } = h;
  const grass = g => g.world.stats.meadow || 0;
  const woodland = g => g.world.stats.forest || 0;
  const redoat = g => established(g.world, 'redoat');
  return [
    {
      key: 'crust', title: 'Break the crust', reward: 2000,
      story: 'Too many cattle for too many years have stripped Enkare bare. The rain now runs straight off a hard crust and carries the last topsoil away. Before grass can come back, the ground has to hold water again.',
      teach: 'Use <b>Inspect</b> to click the land. <b>Landscape → Half-moon pits</b> digs crescent hollows that catch rain and blown seed, and <b>Loosen soil</b> rips the hardpan open. Sow the <b>Soil builders</b> mix into them: dropseed and wild legumes are the only plants that take on bare ground, and even they do far better once the crust is broken. Nothing else will root in crusted hardpan until you loosen or pit it.',
      unlock: ['lower', 'rip', 'mulch', 'mix_pioneers_s'],
      goals: [
        flag('Inspect a tile or an animal', g => !!g.flags.inspected),
        count('Dig 40 half-moon pits', g => used(g, 'lower'), 40, ' pits'),
        count('Sow 200 tiles of the soil builders mix', g => used(g, 'mix_pioneers_s'), 200, ' seeded'),
      ],
    },
    {
      key: 'weed', title: 'The famine weed', reward: 2500,
      story: 'Parthenium, the "famine weed", has moved onto the bare ground. Cattle won\'t eat it, it poisons the soil for other plants, and it spreads fast. Pull it out and put native grass in its place before it comes back.',
      teach: '<b>Remove → Pull invasives</b> digs out famine weed (the brush glows pink over it). Then sow <b>Grassland recovery</b> where the soil has started to build. The <b>Groundcover</b> tab has single grasses too: red oat grass needs good soil, star grass is tougher.',
      unlock: ['pull', 'clear', 'clearcut', 'mix_regrass', ...layerTools('ground')],
      goals: [
        count('Pull 60 tiles of invasive plants', g => used(g, 'pull'), 60, ' tiles'),
        count('Sow 150 tiles of grassland recovery', g => used(g, 'mix_regrass'), 150, ' seeded'),
        count('Grow 1,200 tiles of savanna grassland', grass, 1200, ' tiles'),
      ],
    },
    {
      key: 'lugga', title: 'Free the lugga', reward: 3000,
      story: 'The lugga is a sand river: dry most of the year, running hard in the rains. A culvert under the herders\' track blocks it, and nothing shades its banks. Along the river the old fig and fever trees are the last of the woodland.',
      teach: '<b>Demolish</b> the culvert where the track crosses the lugga. Plant the <b>Riverine woodland</b> mix and shrubs along the banks, and dig a <b>pond</b> or <b>marsh</b> in the wet hollows with the <b>Wetland edge</b> mix. Water that stays through the dry season brings everything else.',
      unlock: ['demolish', 'pond', 'marsh', 'creek', 'fill', 'mix_wetland_s', 'mix_riverine', ...layerTools('shrub')],
      goals: [
        flag('Remove the culvert on the lugga', g => culvertGone(g.world), 'Open', 'Still blocking the river'),
        count('Plant 40 shrubs or trees right beside the lugga', g => g.stats.creekPlanted || 0, 40, ' planted'),
        count('Dig 30 tiles of pond, marsh or channel', g => g.stats.dug || 0, 30, ' tiles'),
      ],
    },
    {
      key: 'route', title: 'Open the migration route', reward: 3500,
      story: 'Boundary wire runs along the north and east, right across the old path of the wildebeest and zebra. Take it down, and give smaller animals somewhere to shelter on open ground: rock piles, brush and dead wood.',
      teach: 'Demolish the <b>fences</b> along the north and east edges. The <b>Habitat</b> tools place snags, logs, rock and brush piles and nest boxes. The <b>Savanna flowers</b> mix brings bees, weavers and rollers. You can also rebuild the old ranger post and store.',
      unlock: ['snag', 'log', 'rocks', 'brush', 'nestbox', 'mix_wildflowers', 'build_barn', 'build_shed', 'build_house', 'build_silo'],
      goals: [
        { desc: 'Tear out the fence along the north and east edges', check: g => perimeterFence(g.world) === 0, prog: g => perimeterFence(g.world) ? `${perimeterFence(g.world)} fence tiles left` : 'Done' },
        count('Place 10 snags, logs, rock piles, brush piles or nest boxes', g => used(g, 'snag', 'log', 'rocks', 'brush', 'nestbox'), 10),
        count('Have 12 animal species living here', g => speciesPresent(g), 12, ' species'),
      ],
    },
    {
      key: 'acacia', title: 'Acacia country', reward: 4000,
      story: 'A healthy Serengeti is a mosaic: open plains, scattered umbrella thorns, and thicker woodland along the rivers and kopjes. Giraffe, elephants and vultures all need trees, and trees here grow slowly.',
      teach: 'The <b>Trees</b> tab is open. Sow <b>Acacia woodland</b> in patches across the plains, <b>Thorn scrub</b> on the rocky ground, and <b>Savanna giants</b> (baobab, sausage tree, sycamore fig) where the soil is deep. Leave most of the land open: grazers and lions need grass.',
      unlock: ['mix_thornscrub', 'mix_acacia', 'mix_giants', ...layerTools('tree')],
      goals: [
        count('Plant 250 trees', g => g.stats.treesPlanted || 0, 250, ' trees'),
        count('Grow 300 tiles of woodland', woodland, 300, ' tiles'),
        flag('Giraffe move in to browse', g => pop(g, 'giraffe') > 0, 'They\'re here', 'Needs acacia woodland'),
      ],
    },
    {
      key: 'fire', title: 'Fire on the plains', reward: 5000, events: true,
      story: 'From now on the late dry season brings fire. On the savanna that is not a disaster: grass fires sweep through fast, clear old growth and let fresh green shoots come up for the grazers. The danger is to young trees, and to thick weeds that burn hot.',
      teach: 'A <b>controlled burn</b> early in the dry season refreshes grassland and stops fuel building up. <b>Clear vegetation</b> cuts firebreaks around young woodland, and a <b>fire crew</b> can save trees when a wildfire gets close. Red oat grass comes back strongly after fire.',
      unlock: ['burn', 'firecrew', 'raise'],
      goals: [
        count('Do a controlled burn on 25 tiles', g => used(g, 'burn'), 25, ' tiles'),
        count('Grow 100 tiles of red oat grass', redoat, 100, ' tiles'),
        count('Reach an ecosystem health score of 60', score, 60),
      ],
    },
    {
      key: 'public', title: 'Safari', reward: 6000,
      story: 'Safari visitors will pay well to see a range coming back to life, and the fees can carry the work from here. But vehicles and crowds disturb shy animals, so lay the tracks with care.',
      teach: 'Build <b>trailhead parking</b> beside a road, then run a <b>game-viewing trail</b> out past the water and the kopjes. <b>Viewing blinds</b> let people watch without disturbing. Bare, weedy ground along the trail puts visitors off.',
      unlock: ['trail', 'boardwalk', 'blind', 'build_parking', 'build_center', 'build_road'],
      goals: [
        count('Connect 40 tiles of trail to a trailhead', g => g.visitors.facilities().parking ? g.visitors.net.length : 0, 40, ' tiles'),
        count('Welcome 300 visitors', g => g.visitors.total, 300, ' visitors'),
        { desc: 'Reach a 2.5-star visitor rating', check: g => g.visitors.rating >= 2.5, prog: g => `${g.visitors.rating.toFixed(1)} / 2.5 stars` },
      ],
    },
    {
      key: 'herds', title: 'The herds return', reward: 10000,
      story: 'Every dry season the Great Migration swings west in search of grass. With the fences down and the plains green again, the herds can pass through Enkare once more, and the lions will follow. Elephants and black rhino were lost here long ago and need help to come home.',
      teach: 'The <b>Wildlife</b> tools bring back elephants and black rhino. Each needs the right habitat first; the tool shows what it needs. Wildebeest and zebra swim the river at the crossing in the middle of the range from June to October: have lots of good grass and open water ready for them.',
      unlock: wildlifeTools(),
      goals: [
        count('Have 25 wildebeest on the range at once', g => pop(g, 'wildebeest'), 25, ' wildebeest'),
        flag('A pride of lions settles in', g => pop(g, 'lion') >= 2, 'The pride is here', 'Needs big grasslands full of grazers'),
        count('Reach an ecosystem health score of 65', score, 65),
      ],
    },
  ];
}
