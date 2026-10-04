// Map: Kebun Tualang, an old oil palm estate on the edge of the Leuser Ecosystem in North Sumatra,
// Indonesia. The estate's permit was revoked and the land handed back to be forest again, with the
// village next door. Two things set it apart: the palms are still standing and still bear fruit
// (the village harvests them while forest trees are planted between the rows: "jangka benah"),
// and the southern half is peat, drained by canals, which dries out and burns until the canals
// are blocked and the peat is wet again.

import buildSumatraPlants from '../data/plants-sumatra.js';
import buildSumatraAnimals from '../data/animals-sumatra.js';
import { generateEstate, sumatraBorderCell, isPeat, streamX } from './sumatra-world.js';
import { PNW_GOALS, perimeterFence, culvertExists, pop, speciesPresent } from '../sim/goals.js';
import { PLANT, PLANTS, isFruiting } from '../data/plants.js';
import { ANIMAL, ANIMALS } from '../data/animals.js';
import { T, F, clamp } from '../config.js';
import { moment, arrivalMoment } from '../sim/moments.js';
import { valueNoise } from '../rng.js';

const reuse = key => PNW_GOALS.find(g => g.key === key);
const st = (g, k) => g.world.stats?.[k] || 0;
const invPct = g => (g.cache.score?.invFrac ?? 1) * 100;
const wetPct = g => st(g, 'peat') ? Math.round(100 * st(g, 'peatWet') / st(g, 'peat')) : 0;
const felled = g => g.stats.palmsFelled || 0;
const isPalm = (w, i) => w.tree[i] && PLANTS[w.tree[i]].key === 'oilpalm';

const GOALS = [
  { key: 'plant', name: 'First seedlings', reward: 1000,
    desc: 'Plant 200 native plants anywhere on the estate.',
    check: g => g.stats.planted >= 200, prog: g => `${Math.min(200, g.stats.planted)} / 200 planted` },
  { key: 'benah', name: 'Jangka benah', reward: 2500,
    desc: 'Grow 300 forest trees up between the palm rows (within two tiles of a standing palm). The palms give them half-shade while they get going, and the village keeps harvesting until the young trees close over.',
    check: g => st(g, 'interplanted') >= 300, prog: g => `${Math.min(300, st(g, 'interplanted'))} / 300 trees among the palms` },
  { key: 'canals', name: 'Block the canals', reward: 2000,
    desc: 'Build 8 canal blocks across the drainage canals in the peat (Landscape → Block a canal). Each one holds the water back for a stretch upstream of it.',
    check: g => st(g, 'canalBlocks') >= 8, prog: g => `${Math.min(8, st(g, 'canalBlocks'))} / 8 blocks` },
  { key: 'culvert', name: 'Free the sungai', reward: 2000,
    desc: 'Remove the culvert where the main road crosses the stream, so mahseer and otters can get up it from the river.',
    check: g => !culvertExists(g.world), prog: g => culvertExists(g.world) ? 'Culvert still in place' : 'Done' },
  { key: 'fence', name: 'An elephant corridor', reward: 1500,
    desc: 'Take down the electric elephant fence along the north and east boundary (Remove → Demolish), so elephants, tapirs and deer can come through from Leuser again.',
    check: g => perimeterFence(g.world) === 0, prog: g => `${perimeterFence(g.world)} fence tiles left` },
  { key: 'fell', name: 'Down come the palms', reward: 3000,
    desc: 'Fell 300 oil palms. Each one felled is fruit the village can no longer sell, so fell where the young trees are ready to take over.',
    check: g => felled(g) >= 300, prog: g => `${Math.min(300, felled(g))} / 300 felled` },
  { key: 'peatwet', name: 'Wet peat doesn\'t burn', reward: 4000,
    desc: 'Rewet 60% of the peat. Peat is waterlogged plant matter thousands of years old: drained, it dries, sinks and burns for weeks underground. Kept wet, it holds more carbon than any forest above it.',
    check: g => wetPct(g) >= 60, prog: g => `${wetPct(g)}% / 60% of the peat wet` },
  { key: 'firesafe', name: 'A dry season without fire', reward: 3000,
    desc: 'Get through a whole dry season (June to August) with no fire on the estate. Wet peat, closed canopy, firebreaks and fire crews all help.',
    check: g => g.year >= 2 && g.month === 6 && g.day - g.events.lastFire > 45, prog: g => g.day - g.events.lastFire > 45 ? 'No fire yet this dry season' : 'A fire burned recently' },
  { key: 'weeds', name: 'Fewer palms than trees', reward: 3000,
    desc: 'Get oil palms and weeds below 40% of the land.',
    check: g => invPct(g) < 40, prog: g => `${invPct(g).toFixed(0)}% palms and weeds` },
  { key: 'species14', name: 'Welcome back', reward: 2000,
    desc: 'Have 14 animal species living on the estate at the same time.',
    check: g => speciesPresent(g) >= 14, prog: g => `${speciesPresent(g)} / 14 species` },
  { key: 'hornbill', name: 'Hornbills', reward: 5000,
    desc: 'A pair of rhinoceros hornbills settles in. They need big old trees or snags with hollows to nest in, and figs.',
    check: g => pop(g, 'hornbill') >= 2, prog: g => `${pop(g, 'hornbill')} hornbills here` },
  { key: 'forest', name: 'Rainforest again', reward: 6000,
    desc: 'Grow 700 tiles of forest, with at least 60 of them old growth.',
    check: g => st(g, 'forest') >= 700 && st(g, 'mature') >= 60, prog: g => `${st(g, 'forest')} / 700 forest, ${st(g, 'mature')} / 60 old growth` },
  { key: 'orangutan', name: 'Orang hutan', reward: 8000,
    desc: 'Orangutans live on the estate. They travel through the treetops, so the forest has to join up with Leuser beyond the fences, and fruit all year round.',
    check: g => pop(g, 'orangutan') > 0, prog: g => `${pop(g, 'orangutan')} orangutans here` },
  { key: 'weeds2', name: 'From plantation to forest', reward: 5000,
    desc: 'Get oil palms and weeds below 15% of the land.',
    check: g => invPct(g) < 15, prog: g => `${invPct(g).toFixed(0)}% palms and weeds` },
  { key: 'gajah', name: 'The elephants come through', reward: 6000,
    desc: 'A herd of Sumatran elephants uses the estate again. The fence has to be down, and they need young forest, scrub and water.',
    check: g => pop(g, 'gajah') > 0, prog: g => `${pop(g, 'gajah')} elephants here` },
  { key: 'species26', name: 'A living forest', reward: 10000,
    desc: 'Have 26 animal species living here at once.',
    check: g => speciesPresent(g) >= 26, prog: g => `${speciesPresent(g)} / 26 species` },
  { key: 'tiger', name: 'Harimau', reward: 10000,
    desc: 'A Sumatran tiger takes up residence. It needs a big forest joined to Leuser, full of deer and wild pigs.',
    check: g => pop(g, 'tiger') > 0, prog: g => 'Needs a large, connected forest with sambar and wild boar' },
  reuse('trailhead'), reuse('visitors'), reuse('rating'),
  { key: 'score', name: 'Thriving', reward: 12000,
    desc: 'Reach an ecosystem health score of 75.',
    check: g => (g.cache.score?.total ?? 0) >= 75, prog: g => `${Math.round(g.cache.score?.total ?? 0)} / 75` },
];

// ------------------------------------------------------------------ the peat and its canals
// The stream's own bed, which drains the peat no more than any natural river does.
let streamMask = null;
function natural(w) {
  if (streamMask && streamMask.length === w.n) return streamMask;
  streamMask = new Uint8Array(w.n);
  for (let y = 0; y < w.h; y++) {
    const a = streamX(y), b = streamX(y + 1);
    for (let x = Math.min(a, b) - 1; x <= Math.max(a, b) + 1; x++) if (w.inb(x, y)) streamMask[w.idx(x, y)] = 1;
  }
  return streamMask;
}
const REACH = 8; // how far up a canal one block holds the water back
// Canal water in the peat that still drains it: every channel in the peat (except the stream's
// own bed) that isn't held back by a block within REACH tiles downstream of it.
function drainingCanals(w) {
  const n = w.n, W = w.w, nat = natural(w);
  const canal = i => w.terrain[i] === T.CREEK && isPeat(w, i) && !nat[i];
  // distance to the river along the channels: which way is downstream
  const down = new Int16Array(n).fill(-1), q = [];
  for (let i = 0; i < n; i++) if (w.terrain[i] === T.RIVER) { down[i] = 0; q.push(i); }
  const nb = i => { const x = i % W, out = []; if (x > 0) out.push(i - 1); if (x < W - 1) out.push(i + 1); if (i >= W) out.push(i - W); if (i < n - W) out.push(i + W); return out; };
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    for (const j of nb(i)) if (down[j] < 0 && (w.terrain[j] === T.CREEK || w.terrain[j] === T.MARSH || w.terrain[j] === T.POND)) { down[j] = down[i] + 1; q.push(j); }
  }
  // water held back: up to REACH tiles upstream of each block
  const held = new Uint8Array(n);
  for (let b = 0; b < n; b++) {
    if (w.feature[b] !== F.DAM || w.terrain[b] !== T.CREEK) continue;
    held[b] = 1;
    const seen = new Map([[b, 0]]), bq = [b];
    for (let h = 0; h < bq.length; h++) {
      const i = bq[h], d = seen.get(i);
      if (d >= REACH) continue;
      for (const j of nb(i)) if (!seen.has(j) && (w.terrain[j] === T.CREEK || w.terrain[j] === T.MARSH) && down[j] >= down[b]) { seen.set(j, d + 1); held[j] = 1; bq.push(j); } // (through canal that has already silted up into swamp, too)
    }
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (canal(i) && !held[i] && down[i] >= 0) out[i] = 1;
  return { drain: out, held };
}
// low spots in the peat, where water stands once it's wet again
const hollow = (x, y) => valueNoise(x, y, 4, 91) * 0.7 + valueNoise(x, y, 11, 93) * 0.3 > 0.66;

function peatDaily(g, rate = 0.025) {
  const w = g.world, n = w.n, W = w.w;
  const { drain, held } = drainingCanals(w);
  g.cache.peatDrain = drain; g.cache.peatHeld = held;
  // how far each tile of peat is from a draining canal (through the peat)
  const dist = new Uint8Array(n).fill(255), q = [];
  for (let i = 0; i < n; i++) if (drain[i]) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], d = dist[i] + 1;
    if (d > 6) continue;
    const x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && dist[j] > d && isPeat(w, j)) { dist[j] = d; q.push(j); }
  }
  // The water table follows: within a few tiles of a draining canal the top of the peat dries
  // out (even right beside the water); elsewhere it slowly rises back to the surface.
  for (let i = 0; i < n; i++) {
    if (!isPeat(w, i)) continue;
    const t = w.terrain[i];
    if (t === T.CREEK || t === T.RIVER || t === T.POND || t === T.MARSH) continue;
    const d = dist[i];
    const target = d <= 5 ? 0.26 + d * 0.03 - 0.5 * Math.exp(-d / 2.1) : 0.64;
    w.baseMoist[i] += (target - w.baseMoist[i]) * rate;
  }
  if (rate >= 1) return; // (settling the water table at the start)
  g.cache.peatDist = dist;
  // Behind a block the canal brims over and fills in with sedges and ferns: open water turns to swamp
  // within a season or two. And once the peat is wet again, water stands in its low spots in the rains.
  const rains = g.month >= 6 && g.month <= 10;
  for (let i = 0; i < n; i++) {
    const t = w.terrain[i];
    if (t === T.CREEK) {
      if (!held[i] || !isPeat(w, i) || natural(w)[i] || w.feature[i] === F.DAM) continue;
      if (g.rng() < 0.012) { // (and sedges and swamp ferns take it over)
        w.terrain[i] = T.MARSH; w.hydroDirty = true;
        w.setPlant(i, PLANT[g.rng() < 0.6 ? 'purun' : 'kelakai'], 0.25);
      }
    } else if (rains && (t === T.PASTURE || t === T.SOIL || t === T.MUD) && !w.tree[i] && !w.feature[i] && w.struct[i] < 0 && isPeat(w, i)
      && w.baseMoist[i] > 0.57 && hollow(i % W, (i / W) | 0) && g.rng() < 0.006) {
      w.terrain[i] = T.MARSH; w.clearPlants(i); w.hydroDirty = true;
    }
  }
}

// ------------------------------------------------------------------ the estate's own counts
function estateStats(w, s) {
  const W = w.w;
  let peat = 0, peatWet = 0, palms = 0, inter = 0, blocks = 0;
  for (let i = 0; i < w.n; i++) {
    if (isPeat(w, i)) {
      const t = w.terrain[i];
      if (t === T.CREEK && w.feature[i] === F.DAM) blocks++;
      if (t !== T.CREEK && t !== T.RIVER && t !== T.POND && t !== T.ROAD) { peat++; if (w.baseMoist[i] >= 0.5 || t === T.MARSH) peatWet++; }
    }
    if (!w.tree[i]) continue;
    const p = PLANTS[w.tree[i]];
    if (p.key === 'oilpalm') { if (w.treeG[i] > 0.6) palms++; continue; }
    if (p.invasive || w.treeG[i] < 0.5) continue;
    // a forest tree growing up among the palms
    const x = i % W, y = (i / W) | 0;
    let among = false;
    for (let dy = -2; dy <= 2 && !among; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (!w.inb(x + dx, y + dy)) continue;
      const j = w.idx(x + dx, y + dy);
      if (isPalm(w, j) && w.treeG[j] > 0.5) { among = true; break; }
    }
    if (among) inter++;
  }
  Object.assign(s, { peat, peatWet, palms, interplanted: inter, canalBlocks: blocks });
}

// ------------------------------------------------------------------ each day
const PALM_RATE = 0.33; // dollars a month from a grown palm in full sun
function estateDaily(g) {
  const w = g.world;
  peatDaily(g);
  // Every month the village harvests the palms still standing and sells the fruit bunches to the
  // mill. A palm shaded by the young forest around it bears less, and old palms bear less every
  // year (an estate would replant them at about 25).
  if (g.day % 10 === 0) {
    let crop = 0;
    for (let i = 0; i < w.n; i++) {
      if (!isPalm(w, i) || w.treeG[i] < 0.6) continue;
      const age = w.treeAge[i] / 120;
      crop += clamp(1 - w.nbCanopy[i] * 1.3, 0.15, 1) * clamp(1 - (age - 22) * 0.06, 0.25, 1); // (past about 22 years a palm bears less every year)
    }
    const fruit = Math.round(crop * PALM_RATE);
    if (fruit > 0) { g.earn(fruit); g.cache.palmFruit = fruit; }
    // The fruit trees in season: the village picks and sells what the wildlife leaves. The more
    // orangutans, hornbills, bears, civets and macaques there are, the bigger their share.
    let worth = 0; const kinds = new Set();
    for (let i = 0; i < w.n; i++) {
      const id = w.tree[i]; if (!id) continue;
      const p = PLANTS[id];
      if (p.harvest && w.treeG[i] > 0.7 && isFruiting(p, g.month)) { worth += p.harvest; kinds.add(p.name.toLowerCase()); }
    }
    if (worth > 0) {
      const eaters = ANIMALS.filter(a => a.frugivore).reduce((s, a) => s + g.wildlife.state[a.index].pop, 0);
      const share = Math.min(0.4, eaters / 250);
      const sold = Math.round(worth * (1 - share));
      g.earn(sold); g.cache.fruitSales = sold;
      if (!g.flags.fruitHint && sold >= 20) {
        g.flags.fruitHint = true;
        g.notify(`The village picked the fruit trees this month (${[...kinds].join(', ')}) and sold $${sold.toLocaleString()} of fruit${share > 0.05 ? `, after the wildlife took about ${Math.round(share * 100)}%` : ''}. Fruit trees keep paying long after the palms are gone, and they feed the orangutans, hornbills and bears too.`, 'good');
      }
    } else g.cache.fruitSales = 0;
    if (!g.flags.palmHint && g.day >= 20) {
      g.flags.palmHint = true;
      g.notify(`This month the village sold $${fruit.toLocaleString()} of palm fruit to the mill and paid it into the restoration. Every palm you fell is fruit they can't sell, and palms shaded by young trees bear less. Plant forest between the rows first, and fell the palms as it takes over.`, 'info');
    }
  }
  // the first time a block holds the water back
  if (!g.flags.peatHint && st(g, 'canalBlocks') > 0) {
    g.flags.peatHint = true;
    g.notify('The canal block is holding. Water is backing up behind it: that stretch of canal will brim over and turn to swamp, and over the coming weeks the peat beside it turns from pale and dusty to dark and wet. One block holds back only about eight tiles: build them in a staircase up each canal, and block the collector canals too. Inspect any peat tile to see if it is drained or wet, or use Overlay → Moisture.', 'good');
  }
  // how much of the peat is wet, whenever it has moved on by a tenth
  if (g.day % 10 === 5 && st(g, 'peat')) {
    const pct = wetPct(g), shown = g.flags.wetShown ?? pct;
    if (Math.abs(pct - shown) >= 10) g.notify(`${pct}% of the peat is wet now${pct > shown ? ', up' : ', down'} from ${shown}%. ${pct > shown ? 'The canal blocks are working.' : 'Canals still drain it: block them.'}`, pct > shown ? 'good' : 'warn');
    if (Math.abs(pct - shown) >= 10 || g.flags.wetShown == null) g.flags.wetShown = pct;
  }
  // the orangutans, the elephants and the tiger come in
  for (const [key, sp] of [['orangutans', 'orangutan'], ['gajah', 'gajah'], ['harimau', 'tiger']]) if (ANIMAL[sp] && pop(g, sp) > 0) arrivalMoment(g, key, ANIMAL[sp]);
  // The corpse flower: years after it's planted (or found in the ravine), one sends up its giant
  // flower in the wet season. It blooms for a single month.
  const tp = PLANT.titan;
  if (tp) {
    const done = g.flags.moments || {};
    if (g.flags.titanMonth != null && g.flags.titanMonth !== g.month) { tp.look.bloom = []; g.flags.titanMonth = null; w.renderDirty = true; }
    if (g.flags.titanMonth == null && g.year >= 2 && g.month >= 8 && g.rng() < (done.titan == null ? 0.01 : 0.0015)) {
      let at = -1;
      for (let i = 0; i < w.n; i++) if (w.ground[i] === tp.id && w.groundG[i] > 0.9 && (at < 0 || g.rng() < 0.3)) at = i;
      if (at >= 0) {
        tp.look.bloom = [g.month]; g.flags.titanMonth = g.month; w.renderDirty = true;
        const pos = { x: at % w.w + 0.5, y: ((at / w.w) | 0) + 0.5 };
        if (done.titan == null) moment(g, 'titan', pos);
        else g.notify('A corpse flower is in bloom again, and the smell of it carries across the forest.', 'good', pos);
      }
    }
  }
}

// ------------------------------------------------------------------ the estate's own tools
// Felling a palm, or pulling weeds: the chainsaw crew drops the big palms and leaves the trunk to
// rot where it fell, with its fronds stacked beside it. Beetles, termites and fungi turn them into soil.
function dropPalm(game, i) {
  const w = game.world, rng = game.rng, W = w.w;
  if (!w.feature[i]) { w.feature[i] = F.LOG; w.featureAge[i] = 0; }
  const x = i % W, y = (i / W) | 0;
  for (let k = 0; k < 6; k++) {
    const dx = Math.floor(rng() * 3) - 1, dy = Math.floor(rng() * 3) - 1;
    if (!w.inb(x + dx, y + dy)) continue;
    const j = w.idx(x + dx, y + dy), t = w.terrain[j];
    if (j === i || w.feature[j] || w.tree[j] || w.struct[j] >= 0 || t === T.ROAD || t === T.TRAIL || t === T.CREEK || t === T.RIVER || t === T.POND || t === T.MARSH) continue;
    w.feature[j] = F.BRUSH; w.featureAge[j] = 0; break;
  }
}
function fellOrPull(game, i) {
  const w = game.world;
  let n = 0;
  if (w.ground[i] && PLANTS[w.ground[i]].invasive) {
    w.ground[i] = 0; w.groundG[i] = 0; n++;
    const pulled = game.flags.pulled ||= {};
    if (Object.keys(pulled).length < 4000) pulled[i] = 1;
  }
  if (w.shrub[i] && PLANTS[w.shrub[i]].invasive) { w.shrub[i] = 0; w.shrubG[i] = 0; n++; }
  if (w.tree[i] && PLANTS[w.tree[i]].invasive) {
    const big = w.treeG[i] > 0.4, palm = isPalm(w, i);
    w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0; n++;
    if (big) dropPalm(game, i);
    if (big && palm) game.stats.palmsFelled = (game.stats.palmsFelled || 0) + 1;
  }
  if (!n) return null;
  game.stats.removed += n;
  return true;
}
const CANAL_BLOCK = {
  key: 'canalblock', cat: 'land', name: 'Block a canal', cost: 250, brush: false, size: 0, icon: { feature: F.DAM },
  desc: 'Build a canal block: a dam of logs, planks and packed peat across a drainage canal. The water backs up behind it and the peat beside that stretch slowly turns wet again, and wet peat can\'t burn. One block holds back about eight tiles of canal, so build a staircase of them up each canal.',
  apply: (game, i) => {
    const w = game.world;
    if (w.terrain[i] !== T.CREEK || w.feature[i] || !isPeat(w, i)) {
      if (!game.flags.blockHint) { game.flags.blockHint = true; game.notify('Canal blocks go across the drainage canals in the peat, in the south of the estate.', 'warn'); }
      return 'blocked';
    }
    w.feature[i] = F.DAM; w.featureAge[i] = 0; w.marks[i] |= 4;
    w.hydroDirty = true;
    return true;
  },
};

const MOMENTS = {
  orangutans: {
    title: 'Orang hutan',
    text: 'An orangutan has come in through the treetops from Leuser, and tonight it will bend branches into a nest in a tree you planted. It eats fruit above all, and it will spend its days travelling between the figs, durians and terap, dropping seeds as it goes. The forest is big enough, and joined up enough, for the "person of the forest" again.',
  },
  gajah: {
    title: 'The elephants come home',
    text: 'A Sumatran elephant family has walked in along the old route the fence used to block. For years herds like this ended up raiding the plantations around Leuser, because there was nowhere else for them to go. Now they browse the young trees, dig for water by the stream, and move on through, carrying seeds for kilometres.',
  },
  harimau: {
    title: 'Harimau',
    text: 'There are tiger tracks in the mud by the stream. A Sumatran tiger has made the estate part of its range, which means the forest is big enough and full enough of deer and wild pigs to feed one. Perhaps 600 are left, on this one island. The village calls it "datuk", grandfather, and does not say its name in the forest.',
  },
  titan: {
    title: 'The corpse flower blooms',
    text: 'After years of growing nothing but a single leaf, the corpse flower has sent up the largest flower on Earth: a frilled purple spathe taller than a person, around a pale spike that heats itself and pours out the smell of rotting meat. Carrion beetles and sweat bees come from all over the forest to pollinate it. By tomorrow night it will have collapsed.',
    reveal: true,
  },
};

export default {
  id: 'sumatra',
  name: 'Sumatra',
  farm: 'Kebun Tualang',
  region: 'North Sumatra, Indonesia',
  blurb: 'An old oil palm estate on the edge of the Leuser rainforest: palms in rows from fence to fence, peat drained by canals that burns in the dry season, an elephant fence across the old routes, and one ancient honey tree.',
  campaign: false,
  campaignEnd: '',
  image: 'assets/maps/sumatra.jpg',
  lat: 3.9, lon: 98.0, pinLabel: 'n',
  // trekkers come to Sumatra to see orangutans, and give well
  visitorValue: 1.25,
  funder: 'restoration fund',
  grantScale: 0.75, // (the palm fruit pays a good part of the work at first)
  plants: buildSumatraPlants,
  animals: buildSumatraAnimals,
  goals: GOALS,
  moments: MOMENTS,
  generate: generateEstate,
  borderCell: sumatraBorderCell,
  stats: estateStats,
  daily: estateDaily,
  onStart: g => peatDaily(g, 1), // the peat starts as dry as the canals keep it
  tools: [CANAL_BLOCK],
  // what the inspector says about peat and canals
  tileNote: (g, i) => {
    const w = g.world, t = w.terrain[i];
    if (!isPeat(w, i)) return null;
    if (t === T.CREEK && !natural(w)[i]) {
      if (w.feature[i] === F.DAM) return '<b>Canal block.</b> It holds the water back for about eight tiles of canal upstream of it.';
      return g.cache.peatDrain?.[i] ? '<b>Drainage canal.</b> It drains the peat within about five tiles of it. Block it to hold the water back.' : '<b>Blocked canal.</b> A block downstream holds this stretch full; it will fill in and turn to swamp.';
    }
    if (t === T.CREEK || t === T.RIVER || t === T.POND) return null;
    const m = w.baseMoist[i];
    return m >= 0.5 ? '<b>Wet peat.</b> The water table is back at the surface: it can\'t burn, and peat swamp trees will grow here. Oil palms slowly drown on it.'
      : `<b>Drained peat.</b> A canal ${g.cache.peatDist?.[i] < 255 ? g.cache.peatDist[i] + ' tile' + (g.cache.peatDist[i] === 1 ? '' : 's') + ' away' : 'nearby'} keeps it dry: it is sinking, and it burns in the dry season. Block that canal to wet it again.`;
  },
  // dry, drained peat is fuel in its own right: it smoulders under the weeds
  fuelBonus: (w, i) => (isPeat(w, i) && w.baseMoist[i] < 0.42 ? 0.35 * clamp((0.42 - w.baseMoist[i]) / 0.18, 0, 1) : 0),
  // health score: wet peat counts alongside a healthy stream
  scoreWater: g => {
    const s = g.world.stats || {};
    const wet = s.peat ? s.peatWet / s.peat : 0, shaded = s.creek ? s.shadedCreek / s.creek : 0;
    return { name: 'Wet peat and a healthy stream', pts: 6 * clamp(wet / 0.8, 0, 1) + (culvertExists(g.world) ? 0 : 1.5) + 2.5 * clamp(shaded / 0.6, 0, 1), max: 10 };
  },
  plantSpeciesTarget: 22,
  startView: { x: 60, y: 44, zoom: 0.45 },
  startWildlife: [['woodrat', 10, 30, 40, 10], ['woodrat', 8, 72, 66, 10], ['woodrat', 8, 96, 36, 10], ['boar', 5, 44, 62, 5], ['macaque', 6, 100, 18, 4],
    ['civet', 2, 60, 36, 6], ['monitor', 2, 46, 70, 4], ['bulbul', 4, 26, 68, 6], ['snakehead', 6, 100, 72, 3], ['python', 1, 30, 72, 4], ['leopardcat', 1, 20, 44, 6]],
  startText: 'The first rains, Year 1. Rats run between the palm rows, a troop of macaques raids the fruit along the ravine, and a monitor lizard swims the canal. Beyond the north fence, the Leuser forest is calling with gibbons.',
  story: `<p><b>The government has revoked Kebun Tualang's permit</b> and handed the estate back to be forest again, and the village next door is doing it with you. Twenty-five years ago this was lowland rainforest on the edge of the Leuser Ecosystem, the last place on Earth where orangutans, tigers, elephants and rhinos still live side by side. It was cleared for oil palm, the peat swamp in the south was drained with canals, and an electric fence went up across the route the elephants used. In the haze year of 2015 the dry peat caught fire and burned for weeks. The palms are still standing, still bearing fruit, and the village still harvests them: the plan is to grow the forest up between them, and take them out as it does.</p>`,
  rules: [
    'You don\'t buy animals or upgrades. <b>You build habitat</b>, and wildlife follows its own rules: it comes in from the Leuser forest, the river and the swamp when there\'s room, raises young, and moves on when there isn\'t enough.',
    '<b>The palms are the problem, and the income.</b> Every month the village sells the fruit of the palms still standing and puts it into the work. <b>Fell a palm</b> (Remove → Fell palms & pull weeds) and that fruit is gone; palms shaded by young trees bear less anyway. So plant forest between the rows first (<b>jangka benah</b>), and fell the palms as it closes over.',
    '<b>Fruit trees pay too.</b> Durian, rambutan, mangosteen, cempedak, duku, petai and jengkol (Plant → Village fruit trees) bear fruit each season that the village sells, and orangutans, hornbills, sun bears and macaques eat their share. Over the years they replace the palm income.',
    '<b>Nothing lives in a monoculture.</b> Under the palms there are rats, wild pigs and weeds. Native trees bring back everything else, and the orangutans, gibbons and hornbills need them joined up with the forest beyond the north and east fences.',
    '<b>The peat must be wet.</b> The canals in the south keep the peat dry so palms can grow on it. Dry peat sinks, and in the dry season it burns underground for weeks. <b>Block the canals</b> (Landscape → Block a canal) in a staircase up each one, and the peat turns wet again. Only peat swamp trees like jelutong and nibung grow on it once it\'s wet, and the palms on it slowly drown.',
    '<b>Fire</b> comes in the dry months, June to August, and in dry spells in February. No burning: clearing land with fire is banned in Indonesia. Wet peat, canopy, firebreaks and fire crews keep it out.',
    '<b>The elephant fence</b> along the north boundary keeps the herds, the tapirs and the deer out. Take it down to open the corridor.',
    '<b>Animals plant the forest.</b> Hornbills, gibbons, orangutans, civets and fruit bats spread fruit seeds; only orangutans really spread durian. Civets, rats and wild pigs spread oil palm seed too: pull the seedlings.',
    '<b>Barn owls</b> keep down the plantation rats. Put up nest boxes for them.',
    '<b>Trekkers</b> come from all over the world to see orangutans in the wild. Trails pay, but crowds push shy wildlife away.',
  ],
  firstYear: [
    'Sow <b>Jangka benah trees</b> between the palm rows near the north-east ravine, where the forest is, and up the stream, and <b>Village fruit trees</b> near the estate office.',
    'Build a few <b>canal blocks</b> in the peat, starting with the canals around the burn scar in the south-west.',
    'Pull the <b>mile-a-minute</b> off the road edges, and sow <b>native ferns</b> where you pull it.',
    'Put up <b>barn owl boxes</b> in the palms, and cut a <b>trail</b> as a firebreak before the dry season in June.',
  ],
  hideTools: ['burn'],
  toolText: {
    pull: { name: 'Fell palms & pull weeds', icon: { plant: 'oilpalm' },
      desc: 'Fell oil palms (a chainsaw crew, $20 a palm; each trunk is left to rot where it falls, with its fronds stacked beside it: food and shelter for beetles, termites, sun bears and pangolins), and pull out palm and acacia seedlings, mile-a-minute, Chinese violet, alang-alang, Koster\'s curse and Siam weed. Native plants are left alone.',
      costFor: (game, i) => { const w = game.world; return w.tree[i] && PLANTS[w.tree[i]].invasive && w.treeG[i] > 0.4 ? 20 : 8; },
      apply: fellOrPull },
    clearcut: { desc: 'Fell any trees on the tile, native or not, and leave everything else. Oil palms fall and are left to rot, fronds and all; other big trees leave a stump that rots.',
      apply: (game, i) => {
        const w = game.world;
        if (!w.tree[i]) return null;
        const big = w.treeG[i] > 0.4, palm = isPalm(w, i);
        w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0;
        if (palm && big) { game.stats.palmsFelled = (game.stats.palmsFelled || 0) + 1; dropPalm(game, i); }
        else if (big && !w.feature[i]) { w.feature[i] = F.STUMP; w.featureAge[i] = 0; }
        game.stats.treesCut = (game.stats.treesCut || 0) + 1;
        return true;
      } },
    nestbox: { name: 'Barn owl box', desc: 'A nest box on a pole for barn owls. Plantations put them up because a family of barn owls eats over a thousand rats a year.' },
    pond: { desc: 'Deep, open water for snakeheads, arowanas, otters and monitor lizards.' },
    creek: { desc: 'Carve a channel. On the peat, any channel that runs to the river drains the peat around it, like the old canals.' },
    fill: { desc: 'Fill in water, including the old drainage canals, or rip up roads and gravel, leaving loose bare soil.' },
    demolish: { desc: 'Tear out the elephant fence, old buildings, roads or the road culvert. Buildings and machinery sell for salvage.' },
    lower: { desc: 'Scoop out a hollow. Hollows stay moist, which suits ferns, gingers and pitcher plants.' },
  },
  structureNames: { house: 'Estate office', barn: 'Fertiliser store', silo: 'Water tower', shed: 'Fruit loading ramp', tractor: 'Old fruit truck', parking: 'Trailhead', center: 'Visitor centre' },
  habitatNames: {
    FARM: 'Bare plantation ground', INVASIVE: 'Oil palm and weeds', MEADOW: 'Ferns and native grasses', SHRUB: 'Belukar (young regrowth)', YOUNG_FOREST: 'Young forest',
    MATURE_FOREST: 'Old rainforest', RIPARIAN: 'Streamside forest', MARSH: 'Peat swamp', POND: 'Pool', CREEK: 'Stream and canals', RIVER: 'River', BARE: 'Bare ground',
  },
  terrainNames: { PASTURE: 'Plantation ground', SOIL: 'Bare soil', GRAVEL: 'Gravel', MUD: 'Peat mud', MARSH: 'Peat swamp', POND: 'Pool', CREEK: 'Stream or canal', ROAD: 'Estate road', DUFF: 'Forest floor' },

  climate: {
    // Wet nearly all year. Mar–May the first rains, Jun–Aug the driest months (and the haze),
    // Sep–Nov the big rains and floods, Dec–Feb the fruit season, drying out in February.
    seasons: ['First rains', 'Dry season', 'Big rains', 'Fruit season'],
    rain: [0.45, 0.55, 0.5, 0.3, 0.26, 0.36, 0.6, 0.72, 0.74, 0.66, 0.52, 0.36],
    growth: [1.0, 1.0, 1.0, 0.85, 0.8, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95],
    spread: [1.0, 1.0, 0.9, 0.8, 0.8, 0.9, 1.0, 1.0, 0.9, 1.0, 1.1, 1.0],
    moist: [0.06, 0.1, 0.06, -0.08, -0.12, -0.06, 0.08, 0.14, 0.16, 0.12, 0.06, -0.03],
    snow: null,
    fireMonths: [3, 4, 5, 11],
    fireRate: 2.4, fireGap: 50, crownFires: false,
    floodMonths: [7, 8, 9],
    tips: [
      'First rains: warm, wet and growing fast. A good time to plant.',
      'Dry season: the driest weeks of the year. Drained peat dries out and burns, and smoke from fires all over the island can turn the sky orange. Keep a fire crew ready.',
      'Big rains: the heaviest rain of the year. The river floods the low peat.',
      'Fruit season: the durians and figs are ripe, and everything comes for them. It dries out again in February.',
    ],
    fireCause: ['A fire smouldering underground in the dry peat', "A visitor's cigarette", 'A neighbour clearing land with fire'],
  },
  seedRain: {
    N: ['macaranga', 'macaranga', 'fig', 'terap', 'meranti', 'keruing', 'durian', 'petai', 'ginger', 'rattan', 'ixora', 'kelakai'],
    E: ['macaranga', 'fig', 'terap', 'meranti', 'tualang', 'bamboo', 'ginger', 'rattan', 'melastoma', 'kelakai'],
    W: ['oilpalm', 'asystasia', 'asystasia', 'mikania', 'chromolaena', 'clidemia', 'alang', 'acacia'],
    S: ['nibung', 'pandan', 'purun', 'lotus', 'jelutong', 'kelakai'],
  },
  windSeeds: ['meranti', 'keruing', 'mikania', 'chromolaena', 'alang'],
  berrySeeds: ['fig', 'macaranga', 'terap', 'melastoma', 'clidemia', 'oilpalm', 'ixora', 'rattan', 'nibung', 'durian', 'rambutan', 'cempedak'],
  floodSeeds: ['nibung', 'pandan', 'purun', 'jelutong', 'macaranga', 'kelakai'],
  burnSeeds: ['alang', 'alang', 'resam', 'mikania', 'chromolaena', 'macaranga', 'acacia'],

  text: {
    edges: { N: 'the Leuser forest to the north', E: 'the forest to the east', S: 'the river', W: 'the village to the west' },
    creekFish: 'mahseer', culvertBlocks: 'mahseer and otters', fenceBlocks: 'the elephants',
    fenceName: 'Elephant fence (electric)',
    flood: 'The river is in flood!',
    floodOut: 'Swamp palms, screw pines and sedges seed into the low ground.',
    fireOutRain: 'Rain has reached it, but fire in dry peat can smoulder on underground. Alang-alang will be first into the burn: plant it fast.',
    fireOut: 'Alang-alang and acacia will race into the burn. Every fire in the peat sets the forest back, and the peat itself: block the canals.',
    crownOut: '',
  },
  look: {
    // colour grade: humid and deep green, a little hazy
    grade: { gain: [0.99, 1.0, 0.97], lift: [0.004, 0.005, 0.004], sat: 1.03, contrast: 1.05 },
    pasture: ['#8ea456', '#a0a660', '#8aa456', '#92a65a'],
    soil: [0.66, 0.42, 0.3], mud: [0.28, 0.21, 0.16],                 // red tropical soil, black peat
    // peat-stained blackwater: tea-brown and clear
    water: { pond: [0.2, 0.13, 0.06, 0.92], creek: [0.24, 0.16, 0.07, 0.9], river: [0.28, 0.19, 0.09, 0.92], marsh: [0.34, 0.42, 0.22, 0.42] },
    // peat shows through the weeds: pale and dusty where it's drained, dark and sodden where it's wet
    groundTint: (w, i, c) => {
      if (!isPeat(w, i)) return null;
      const wet = clamp((w.baseMoist[i] - 0.36) / 0.24, 0, 1);
      const dry = [0.66, 0.55, 0.4], sod = [0.13, 0.17, 0.12], k = 0.34 + 0.06 * wet;
      return c.map((v, q) => v * (1 - k) + (dry[q] * (1 - wet) + sod[q] * wet) * k);
    },
    light: [
      { sun: 0xfff2dc, sunI: 2.6, sky: 0xe6eeee, ground: 0x5a6a3a, hemiI: 1.3 },
      { sun: 0xffe2bc, sunI: 2.4, sky: 0xf0e2cc, ground: 0x6a623c, hemiI: 1.24 },
      { sun: 0xf2f4fa, sunI: 2.15, sky: 0xdce4e8, ground: 0x4f5e40, hemiI: 1.22 },
      { sun: 0xfff4e0, sunI: 2.7, sky: 0xe8eeee, ground: 0x5a6a3a, hemiI: 1.3 },
    ],
    ambience: {
      leaves: [0.1, 0.4, 0.1, 0.2], fluff: [0.2, 0.5, 0.1, 0.3], mist: [0.7, 0.2, 1, 0.6],
      leafColors: ['#b8a040', '#a87a3a', '#8a9a3a', '#c8a450'],
      flocks: [['hornbills', 'parrots', 'egrets'], ['hornbills', 'swallows'], ['egrets', 'parrots', 'hornbills'], ['hornbills', 'parrots']],
    },
    // the dry season hangs a smoky haze over everything
    tint: ['rgba(255,250,235,0)', 'rgba(230,190,140,0.05)', 'rgba(170,190,200,0.03)', 'rgba(255,245,225,0.01)'],
  },
};
