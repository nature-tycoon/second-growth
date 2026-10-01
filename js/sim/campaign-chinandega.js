// Campaign for Finca El Guanacaste: eight chapters that take a burned-over cattle finca on the
// slopes of San Cristóbal back to a working farm full of forest, from the volcano to the sea. It
// follows how a Nicaraguan cattle cooperative would really do it: shade for the herd first, then
// living fences and the quebrada, the forest on the slope, fire, the mangroves, the turtle beach,
// and finally the animals that need all of it joined together.
// Built when the map loads, from shared helpers (see campaign.js).

import { F } from '../config.js';
import { PLANTS } from '../data/plants.js';
import { ANIMAL } from '../data/animals.js';

export function chinandegaChapters(h) {
  const { used, pop, culvertGone, score, count, flag, layerTools, wildlifeTools, speciesPresent } = h;
  const st = (g, k) => g.world.stats?.[k] || 0;
  // progress within the current chapter: what was already there when it began doesn't count
  const since = (g, key, now) => { const b = g.flags.chBase ||= {}; const k = key + ':' + g.campaign.chapter; if (b[k] == null) b[k] = now; return Math.max(0, now - b[k]); };
  // the value something had when the current chapter began (see since)
  const base = (g, key, now) => { const b = g.flags.chBase ||= {}; const k = key + ':' + g.campaign.chapter; if (b[k] == null) b[k] = now; return b[k]; };
  // health tops out at 100, so a farm that's already near the top only has to reach 94
  const healthTarget = g => Math.min(base(g, 'score', Math.round(score(g))) + 8, 94);
  const income = g => (g.cache.milk || 0) + (g.cache.catch || 0);
  const incomeTarget = g => Math.min(base(g, 'income', income(g)) + 1500, 4200);
  const births = (g, key) => (ANIMAL[key] && g.wildlife.state[ANIMAL[key].index]?.births) || 0;
  // the finca starts with plenty of shade from its old trees; the goals count only new shade
  const newShade = g => Math.max(0, st(g, 'silvo') - (g.flags.silvo0 ??= st(g, 'silvo')));
  // until the new trees are big enough to shade the grass, show how far along they are
  const shadeProg = target => g => {
    const n = Math.min(newShade(g), target), w = g.world;
    let sum = 0, k = 0;
    for (let i = 0; i < w.n; i++) {
      const p = w.tree[i] && PLANTS[w.tree[i]];
      if (p && !p.invasive && !p.mangrove && w.treeAge[i] < 360 && w.treeG[i] < 0.5) { sum += w.treeG[i] / 0.5; k++; }
    }
    const done = `${n.toLocaleString()} / ${target.toLocaleString()} newly shaded tiles`;
    return n < target && k ? `${done} · young trees ${Math.round(100 * sum / k)}% of the way to giving shade` : done;
  };
  // Chapter 1's planting sets Chapter 2's shade goal: about 2½ new shaded tiles per tree, which
  // brushed-in trees (clumped or in lines) reach once they're half grown, about as long as it
  // takes to plant the living fences. (Trees spread one by one shade far more.)
  const TREES1 = 100, SOIL1 = 80, SHADE2 = Math.round(TREES1 * 2.5);
  const breached = g => { let n = 0; for (let i = 0; i < g.world.n; i++) if (g.world.feature[i] === F.DIKE) n++; return Math.max(0, (g.flags.dikes0 ??= n) - n); };
  return [
    {
      key: 'shade', title: 'Shade for the herd', reward: 2000,
      story: 'The cooperative\'s cows stand in the sun all through the dry season, crowding under the last few guanacastes. They lose weight and give little milk. The first job is shade: trees growing right in the pasture, the way the old farmers did it.',
      teach: 'Use <b>Inspect</b> to click a cow, a tree or the grass. Then plant <b>Plant → Trees → Dry forest</b> in scattered spots across the pastures. The trees take about a year to grow big enough to shade the grass; the milk money rises as the shade spreads. Meanwhile, sow <b>Plant → Seed mixes → Soil cover</b> over the bare, burned patches: it greens up within weeks and starts healing the soil.',
      unlock: ['mix_dryforest', 'mix_groundcover'],
      goals: [
        flag('Inspect a tile or an animal', g => !!g.flags.inspected),
        count(`Plant ${TREES1} trees in the pastures`, g => g.stats.treesPlanted || 0, TREES1, ' trees'),
        count(`Sow Soil cover on ${SOIL1} tiles of bare, burned ground`, g => used(g, 'mix_groundcover'), SOIL1, ' tiles'),
      ],
    },
    {
      key: 'fences', title: 'Living fences', reward: 2500,
      story: 'Barbed wire on dead posts divides the paddocks. Farmers here have always known a better way: cut a branch of madero negro, stick it in the ground, and it takes root and grows into a living fence post. A line of them becomes a hedge that birds and monkeys can travel along.',
      teach: 'Plant <b>Plant → Trees → Living fence</b> right along the barbed-wire lines between the paddocks: the cuttings root as fence posts. The cows can\'t get at young trees planted in the fence line. <b>Remove → Pull invasives</b> clears jaragua, and <b>Soil cover</b> sown on the bare ground it leaves keeps the jaragua from coming straight back. The shade trees from Chapter 1 keep growing while you work, and count toward the shade goal.',
      unlock: ['mix_livingfence', 'pull', 'clear'],
      goals: [
        count('Plant 120 living-fence trees', g => used(g, 'mix_livingfence'), 120, ' planted'),
        count('Pull jaragua and sow Soil cover where you pulled it, on 150 tiles', g => g.stats.pulledCovered || 0, 150, ' tiles'),
        { desc: `Shade ${SHADE2} more tiles of pasture: the trees from Chapter 1 do it once they are half grown`, check: g => newShade(g) >= SHADE2, prog: shadeProg(SHADE2) },
      ],
    },
    {
      key: 'quebrada', title: 'The quebrada', reward: 3000,
      story: 'The quebrada comes down off the volcano and runs dry by February. The cows drink from it and trample its bare banks into mud, and a culvert under the farm road stops the fish from coming up from the estuary in the rains.',
      teach: '<b>Demolish</b> the culvert where the farm road crosses the quebrada. Plant <b>Quebrada trees</b> and <b>Dry forest shrubs</b> along the banks. Shade keeps water in the pools longer into the dry season, and the guardabarranco nests in shady stream banks.',
      unlock: ['demolish', 'mix_riverside', 'mix_shrubs', 'pond', 'fill', ...layerTools('shrub')],
      goals: [
        flag('Remove the culvert on the quebrada', g => culvertGone(g.world), 'Open', 'Still blocking the stream'),
        count('Plant 50 shrubs or trees right beside the quebrada', g => since(g, 'creek', g.stats.creekPlanted || 0), 50, ' planted'),
        flag('The guardabarranco nests on the finca', g => pop(g, 'motmot') > 0, 'It\'s here', 'Needs shady stream banks and insects'),
      ],
    },
    {
      key: 'volcano', title: 'Up the volcano', reward: 3500,
      story: 'The upper finca climbs the slopes of San Cristóbal. Too steep to graze well and burned every year, its black volcanic soil washes off the hillside with every storm. Given a chance, the dry forest will come back here fast: this is some of the richest soil in the country.',
      teach: 'The <b>Trees</b> tab is open. Plant <b>Dry forest</b> in blocks on the steep ground in the north, and let the slope go wild. Sow <b>Butterfly garden</b> in the gaps. Big trees grown together make the forest the monkeys and parrots need.',
      unlock: ['mix_flowers', ...layerTools('tree'), ...layerTools('ground'), 'snag', 'log', 'nestbox', 'rocks', 'brush'],
      goals: [
        count('Plant 200 more trees, in blocks on the volcano slope', g => since(g, 'trees', g.stats.treesPlanted || 0), 200, ' trees'),
        count('Grow 300 more tiles of dry forest on the volcano slope', g => since(g, 'slope', st(g, 'forestSlope')), 300, ' tiles'),
        count('Sow Butterfly garden on 60 tiles', g => since(g, 'flowers', used(g, 'mix_flowers')), 60, ' tiles'),
      ],
    },
    {
      key: 'fire', title: 'The burning season', reward: 4000, events: true,
      story: 'From now on the dry season brings fire. Neighbours burn their pastures for new grass, the jaragua dries to tinder, and a spark can run across the whole finca and kill the young trees. The dry forest can live with fire now and then, but not every year.',
      teach: '<b>Clear vegetation</b> cuts firebreaks around young trees. A careful <b>controlled burn</b> early in the dry season clears jaragua before it builds up, but in dry weather it can escape, so cut a firebreak around it first. When a wildfire comes, send a <b>fire crew</b>. Shade is the lasting cure: jaragua can\'t grow under trees.',
      unlock: ['burn', 'firecrew', 'clearcut', 'raise', 'lower'],
      goals: [
        count('Cut 40 tiles of firebreak (Clear vegetation)', g => since(g, 'clear', used(g, 'clear')), 40, ' tiles'),
        count('Grow 300 more tiles of dry forest', g => since(g, 'forest', st(g, 'forest')), 300, ' tiles'),
        { desc: 'Raise the ecosystem health score by 8 points (or to 94, if it is already high)', check: g => Math.round(score(g)) >= healthTarget(g), prog: g => `${Math.round(score(g))} / ${healthTarget(g)} health` },
      ],
    },
    {
      key: 'mangroves', title: 'Let the tide back in', reward: 5000,
      story: 'On the coast, shrimp ponds were dug into the mangroves and walled off with mud dikes. The fishers and the women who gather conchas negras (black cockles) among the mangrove roots have less every year. Break the dikes and the tide will bring the mangroves back by itself.',
      teach: '<b>Demolish</b> a section of dike to breach a shrimp pond. The tide floods in and out, the pond drains to mud, and mangrove seedlings drift in and take root, fastest next to the old mangroves. Planting <b>Mangroves</b> on the drained ponds gets them going much faster, and opening more than one pond helps. The catch money rises with every tile of mangrove.',
      unlock: ['mix_mangrove', 'mix_mangrovefloor', 'marsh', 'creek'],
      goals: [
        count('Breach 12 tiles of shrimp pond dike', g => since(g, 'breach', breached(g)), 12, ' tiles'),
        count('Get 60 mangroves growing where the shrimp ponds were', g => since(g, 'pondMangrove', st(g, 'pondMangrove')), 60, ' mangroves'),
        flag('Roseate spoonbills feed on the drained ponds', g => pop(g, 'spoonbill') > 0, 'They\'re here', 'Needs tidal mudflats where ponds were drained'),
      ],
    },
    {
      key: 'beach', title: 'The turtle beach', reward: 6000,
      story: 'For years no sea turtle has nested on the finca\'s beach. The dunes are bare, dogs and lights scare the turtles off, and people dig up the eggs. The paslamas will come back to a quiet, dark beach with plants holding the dunes behind it.',
      teach: 'Sow <b>Beach plants</b> on the dunes at the back of the beach, and leave the open sand by the waves clear: that is where the turtles dig. Keep the beach dark and quiet, and pull the castor bean and jaragua off the dunes.',
      unlock: ['mix_beach'],
      goals: [
        count('Sow Beach plants on 40 tiles of the dunes', g => since(g, 'beach', used(g, 'mix_beach')), 40, ' tiles'),
        flag('The turtles come ashore to nest', g => !!g.flags.nests, 'They came ashore', 'They come July to October to a quiet, planted beach'),
        flag('The hatchlings reach the sea', g => g.flags.moments?.hatchlings != null, 'They made it', 'About six weeks after the nesting'),
      ],
    },
    {
      key: 'wild', title: 'From the volcano to the sea', reward: 10000,
      story: 'The finca is joined together again: forest on the volcano, shade and living fences through the pastures, a green quebrada, mangroves and a turtle beach. Now the animals that need all of it can come home, and some need a little help.',
      teach: 'The <b>Wildlife</b> tools can bring back howler monkeys from the forest on the volcano. Each needs the right habitat first; the tool shows what it needs. Keep the herd healthy too: a finca that feeds its families and its wildlife is the whole point.',
      unlock: wildlifeTools(),
      goals: [
        // (a troop that already fills its forest doesn't breed, so a big troop counts too)
        flag('Monos congos settle in the forest: a troop of 10, or a baby born', g => pop(g, 'congo') >= 10 || (pop(g, 'congo') > 0 && since(g, 'congoBirths', births(g, 'congo')) > 0), 'The troop has settled', 'Needs big, connected forest (the Wildlife tools can bring a troop)'),
        count('Grow 250 more tiles of dry forest, joining the patches up', g => since(g, 'forest', st(g, 'forest')), 250, ' tiles'),
        // (it tops out around $4,500-5,000 a month on a well-run finca, so a farm that's already doing
        // well only has to reach $4,200)
        { desc: 'Raise the monthly milk and fish money by $1,500 (or to $4,200, if it is already high)', check: g => income(g) >= incomeTarget(g), prog: g => `$${income(g).toLocaleString()} / $${incomeTarget(g).toLocaleString()} a month` },
      ],
    },
  ];
}
