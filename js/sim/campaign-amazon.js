// Campaign for Fazenda Esperança: eight chapters that take a burned-out cattle ranch back to
// rainforest. The arc follows how pasture really comes back in the Amazon: get the grass off,
// seed the forest, free the stream, open the edge, survive the burning season, reconnect the
// canopy, bring in visitors, and finally bring home the animals that can't return on their own.
// Built when the map loads, from shared helpers (see campaign.js).

import { perimeterFence } from './goals.js';

export function amazonChapters(h) {
  const { used, pop, culvertGone, score, count, flag, layerTools, wildlifeTools, speciesPresent } = h;
  const forest = g => g.world.stats.forest || 0;
  return [
    {
      key: 'ground', title: 'Walk the ranch', reward: 2000,
      story: 'Thirty years of cattle have left Fazenda Esperança a sea of African pasture grass, packed hard by hooves. Before anything can grow, get to know the land and start getting the grass off it.',
      teach: 'Use <b>Inspect</b> to click the land and see what grows there. Then <b>Remove → Pull invasives</b> digs out braquiária, and <b>Plant → Native groundcover</b> or <b>Pasture recovery shrubs</b> go in its place. <b>Landscape → Loosen soil</b> breaks up compacted ground.',
      unlock: ['pull', 'rip', 'mix_groundcover', 'mix_pastureshrubs'],
      goals: [
        flag('Inspect a tile or an animal', g => !!g.flags.inspected),
        count('Pull 60 tiles of pasture grass', g => used(g, 'pull'), 60, ' tiles'),
        count('Sow 120 tiles of groundcover or pasture shrubs', g => used(g, 'mix_groundcover', 'mix_pastureshrubs'), 120, ' seeded'),
      ],
    },
    {
      key: 'muvuca', title: 'Seeds of the forest', reward: 2500,
      story: 'In the Xingu, farmers bring pasture back to forest with muvuca: a sack of dozens of native seeds, fast pioneers and future giants together, broadcast in one go. Start next to the forest reserve, where seed-carrying animals already live.',
      teach: 'Sow the <b>Muvuca seed mix</b> on pulled pasture along the north-east fences, next to the rainforest. <b>Pioneer trees</b> (cecropia, balsa and ingá) shade out the grass within a few years. The <b>Trees</b> tab lets you plant single species too.',
      unlock: ['mix_muvuca', 'mix_pioneers', 'mulch', ...layerTools('tree')],
      goals: [
        count('Sow 200 tiles of muvuca', g => used(g, 'mix_muvuca'), 200, ' seeded'),
        count('Plant 100 trees', g => g.stats.treesPlanted || 0, 100, ' trees'),
        count('Grow the forest to 280 tiles', forest, 280, ' tiles'),
      ],
    },
    {
      key: 'igarape', title: 'Free the igarapé', reward: 3000,
      story: 'The stream across the ranch is trampled bare and cut off from the river by a culvert under the lower road. Fish, river turtles and caiman can\'t get up it, and nothing shades the water.',
      teach: '<b>Demolish</b> the culvert where the lower road crosses the stream. Plant <b>Floodplain palms</b> and shrubs along the banks to shade it, and dig <b>marsh</b> in the wet hollows with the <b>Floodplain wetland mix</b>.',
      unlock: ['demolish', 'marsh', 'pond', 'creek', 'fill', 'mix_varzea', 'mix_wetland', ...layerTools('shrub')],
      goals: [
        flag('Remove the culvert under the lower road', g => culvertGone(g.world), 'Open', 'Still blocking the stream'),
        count('Plant 40 shrubs or trees right beside the stream', g => g.stats.creekPlanted || 0, 40, ' planted'),
        count('Dig 30 tiles of pond, marsh or stream', g => g.stats.dug || 0, 30, ' tiles'),
      ],
    },
    {
      key: 'edge', title: 'Open the forest edge', reward: 3500,
      story: 'Barbed wire still runs between the ranch and the rainforest. Tear it out, and give the forest\'s animals places to live when they come through: dead trunks to nest in, fallen logs, shelter on the ground.',
      teach: 'Demolish the <b>fences</b> along the north and east boundary. The <b>Habitat</b> tools place snags, logs, rock and brush piles and nest boxes. The <b>Understory</b> and <b>Forest floor</b> mixes fill in beneath young trees, and you can rebuild the old sheds as roosts.',
      unlock: ['snag', 'log', 'rocks', 'brush', 'nestbox', 'mix_understory', 'mix_forestfloor', 'build_barn', 'build_shed', 'build_house', 'build_silo', ...layerTools('ground')],
      goals: [
        { desc: 'Tear out the fence along the north and east edges', check: g => perimeterFence(g.world) === 0, prog: g => perimeterFence(g.world) ? `${perimeterFence(g.world)} fence tiles left` : 'Done' },
        count('Place 10 snags, logs, rock piles, brush piles or nest boxes', g => used(g, 'snag', 'log', 'rocks', 'brush', 'nestbox'), 10),
        count('Have 12 animal species living here', g => speciesPresent(g), 12, ' species'),
      ],
    },
    {
      key: 'fire', title: 'The burning season', reward: 5000, events: true,
      story: 'From now on the dry season brings fire: lightning, careless visitors, and the neighbours burning their pastures. Grass burns hot and fast, and every fire that reaches young forest sets it back years. Closed forest barely burns at all.',
      teach: '<b>Clear vegetation</b> cuts firebreaks between grass and young trees, and a <b>controlled burn</b> in the wet season clears grass before planting. Send a <b>fire crew</b> the moment a wildfire reaches trees. Shade is the lasting cure: pasture grass dies under canopy.',
      unlock: ['burn', 'clear', 'clearcut', 'firecrew', 'raise', 'lower'],
      goals: [
        count('Cut 30 tiles of firebreak', g => used(g, 'clear'), 30, ' tiles'),
        count('Pull 300 tiles of pasture grass in all', g => used(g, 'pull'), 300, ' tiles'),
        count('Reach an ecosystem health score of 35', score, 35),
      ],
    },
    {
      key: 'canopy', title: 'Canopy bridge', reward: 5000,
      story: 'Howler monkeys and sloths almost never come down to the ground. They will only reach the ranch through the treetops, so the new forest has to join up with the reserve and the rainforest beyond, without gaps.',
      teach: 'Grow forest out to the rainforest beyond the fences in one unbroken sweep. Sow <b>Canopy giants</b> (Brazil nut, kapok, mahogany, ipê) behind the pioneers. The <b>Overlay → Species</b> view for howler monkeys shows where the canopy already connects.',
      unlock: ['mix_canopy'],
      goals: [
        flag('Howler monkeys move in through the treetops', g => pop(g, 'howler') > 0, 'They\'re here', 'Not yet'),
        count('Grow the forest to 650 tiles', forest, 650, ' tiles'),
        count('Have 16 animal species living here', g => speciesPresent(g), 16, ' species'),
      ],
    },
    {
      key: 'public', title: 'Eco-tourism', reward: 6000,
      story: 'Birdwatchers and nature lovers want to see a ranch turning back into rainforest. Their donations can carry the work from here, but crowds on the trails push shy animals away, so plan the route with care.',
      teach: 'Build <b>trailhead parking</b> beside a road, then run a <b>nature trail</b> out through your best forest and past the water. <b>Boardwalks</b> cross the stream and marsh, and <b>viewing blinds</b> let people watch without disturbing. Weedy pasture along the trail puts visitors off.',
      unlock: ['trail', 'boardwalk', 'blind', 'build_parking', 'build_center', 'build_road'],
      goals: [
        count('Connect 40 tiles of trail to a trailhead', g => g.visitors.facilities().parking ? g.visitors.net.length : 0, 40, ' tiles'),
        count('Welcome 300 visitors', g => g.visitors.total, 300, ' visitors'),
        { desc: 'Reach a 2-star visitor rating', check: g => g.visitors.rating >= 2, prog: g => `${g.visitors.rating.toFixed(1)} / 2 stars` },
      ],
    },
    {
      key: 'giants', title: 'The return of the giants', reward: 10000,
      story: 'Some animals were hunted out long ago and can\'t find their way back on their own. With the forest growing and the water running clean, it\'s time to bring them home, and to make room for the jaguar.',
      teach: 'The <b>Wildlife</b> tools reintroduce the lowland tapir, spider monkeys, giant otters, arapaima and the harpy eagle. Each needs the right habitat first; the tool shows what it needs. The jaguar only comes on its own, when the forest is big and full of prey.',
      unlock: wildlifeTools(),
      goals: [
        flag('A jaguar takes up residence', g => pop(g, 'jaguar') > 0, 'The jaguar is back', 'Needs a big forest with prey'),
        count('Have 20 animal species living here', g => speciesPresent(g), 20, ' species'),
        count('Reach an ecosystem health score of 50', score, 50),
      ],
    },
  ];
}
