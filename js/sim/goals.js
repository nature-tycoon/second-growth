// Ecosystem score, grant income, and restoration goals.

import { H, F, T, clamp } from '../config.js';
import { PLANTS } from '../data/plants.js';
import { ANIMALS, ANIMAL } from '../data/animals.js';

export function speciesPresent(game) {
  return game.wildlife.state.filter(s => s.pop > 0).length;
}

export function nativePlantSpecies(w) {
  const seen = new Set();
  for (let i = 0; i < w.n; i++) {
    if (w.ground[i] && w.groundG[i] > 0.4) seen.add(w.ground[i]);
    if (w.shrub[i] && w.shrubG[i] > 0.4) seen.add(w.shrub[i]);
    if (w.tree[i] && w.treeG[i] > 0.4) seen.add(w.tree[i]);
  }
  let n = 0;
  for (const id of seen) if (PLANTS[id].native) n++;
  return n;
}

export function ecoScore(game) {
  const w = game.world, st = w.stats;
  if (!st || !st.land) return { total: 0, parts: [] };
  const land = st.land;
  const nativeFrac = st.native / land;
  const invFrac = st.invasive / land;
  const farmFrac = st.farm / land;
  // bare, eroded ground (the Serengeti range's hardpan) counts against the land too
  const bareFrac = (st.counts?.[H.BARE] || 0) / land;
  const habs = [
    [H.MEADOW, 20], [H.SHRUB, 15], [H.YOUNG_FOREST, 20], [H.MATURE_FOREST, 15],
    [H.RIPARIAN, 15], [H.MARSH, 12], [H.POND, 10], [H.CREEK, 10],
  ];
  const habCount = habs.filter(([h, min]) => st.counts[h] >= min).length;
  const animals = speciesPresent(game);
  const nativePlants = game.cache.nativePlants ?? 0;
  let connected = false;
  for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.CREEK && w.connected[i]) { connected = true; break; }
  const shadedCreek = st.creek ? st.shadedCreek / st.creek : 0;

  const parts = [
    { name: 'Native plant cover', pts: 25 * clamp(nativeFrac / 0.85, 0, 1), max: 25 },
    { name: 'Habitat variety', pts: 20 * habCount / habs.length, max: 20 },
    { name: 'Wildlife species', pts: 30 * clamp(animals / (ANIMALS.length * 0.85), 0, 1), max: 30 },
    { name: 'Native plant species', pts: 15 * clamp(nativePlants / 26, 0, 1), max: 15 },
    { name: 'Healthy, connected creek', pts: (connected ? 4 : 0) + 6 * shadedCreek, max: 10 },
    { name: 'Invasive plants', pts: -25 * clamp(invFrac / 0.3, 0, 1), max: 0 },
    { name: 'Degraded or bare land left', pts: -10 * clamp(farmFrac, 0, 1) - 16 * clamp(bareFrac, 0, 1), max: 0 },
  ];
  const total = clamp(parts.reduce((s, p) => s + p.pts, 0), 0, 100);
  return { total, parts, nativeFrac, invFrac, farmFrac, bareFrac, animals, nativePlants, habCount };
}

export function monthlyGrant(game, score) {
  // the land trust's steady support: enough to keep working, not enough to skip building visitor trails
  return Math.round(80 + score * 5 + speciesPresent(game) * 4);
}

export const perimeterFence = w => {
  let n = 0;
  for (let x = 0; x < w.w; x++) if (w.feature[w.idx(x, 0)] === F.FENCE) n++;
  for (let y = 0; y < w.h; y++) if (w.feature[w.idx(w.w - 1, y)] === F.FENCE) n++;
  return n;
};
export const culvertExists = w => { for (let i = 0; i < w.n; i++) if (w.feature[i] === F.CULVERT) return true; return false; };
export const pop = (g, k) => ANIMAL[k] ? g.wildlife.state[ANIMAL[k].index].pop : 0;

// The active map's milestone goals (refilled by loadGoals when the map changes).
export const GOALS = [];
export function loadGoals(list) { GOALS.length = 0; GOALS.push(...list); }

// Pacific Northwest (Hollis farm) milestones.
export const PNW_GOALS = [
  { key: 'plant', name: 'Break ground', reward: 1000,
    desc: 'Plant 200 native plants anywhere on the farm.',
    check: g => g.stats.planted >= 200, prog: g => `${Math.min(200, g.stats.planted)} / 200 planted` },
  { key: 'water', name: 'Just add water', reward: 1500,
    desc: 'Dig 40 tiles of new pond, marsh or creek. Water is the fastest way to bring life back.',
    check: g => g.stats.dug >= 40, prog: g => `${Math.min(40, g.stats.dug)} / 40 tiles` },
  { key: 'culvert', name: 'Open the gate', reward: 2000,
    desc: 'Remove the old culvert where the river road crosses the ditch. It blocks fish from swimming upstream.',
    check: g => !culvertExists(g.world), prog: g => culvertExists(g.world) ? 'Culvert still in place' : 'Done' },
  { key: 'fence', name: 'Wildlife corridors', reward: 1500,
    desc: 'Tear out the boundary fence along the north and east edges so deer and elk can wander in from the forest.',
    check: g => perimeterFence(g.world) === 0, prog: g => `${perimeterFence(g.world)} fence tiles left` },
  { key: 'species12', name: 'Welcome wagon', reward: 2000,
    desc: 'Have 12 animal species living on the property at the same time.',
    check: g => speciesPresent(g) >= 12, prog: g => `${speciesPresent(g)} / 12 species` },
  { key: 'invasive', name: 'Pull the invaders', reward: 4000,
    desc: 'Get invasive plant cover below 3% of the land. Blackberry, broom and canarygrass all hate shade.',
    check: g => (g.cache.score?.invFrac ?? 1) < 0.03, prog: g => `${((g.cache.score?.invFrac ?? 1) * 100).toFixed(1)}% invasive` },
  { key: 'meadow', name: 'Prairie song', reward: 2500,
    desc: 'Grow 450 tiles of native meadow.',
    check: g => (g.world.stats.meadow || 0) >= 450, prog: g => `${g.world.stats.meadow || 0} / 450 tiles` },
  { key: 'dam', name: 'Keystone species', reward: 4000,
    desc: 'Beavers build their first dam. They need a creek lined with willow, alder or cottonwood.',
    check: g => !!g.flags.beaverDam, prog: g => g.flags.beaverDam ? 'Done' : `${pop(g, 'beaver')} beavers here` },
  { key: 'salmon', name: 'The salmon come home', reward: 8000,
    desc: 'Coho salmon spawn in your creek. They need fish passage and a shaded, clean creek. Runs happen in October.',
    check: g => !!g.flags.salmonSpawned, prog: g => g.flags.salmonSpawned ? 'Done' : 'Waiting for a run' },
  { key: 'forest', name: 'Second growth', reward: 6000,
    desc: 'Grow 400 tiles of forest, with at least 60 of them mature.',
    check: g => (g.world.stats.forest || 0) >= 400 && (g.world.stats.mature || 0) >= 60,
    prog: g => `${g.world.stats.forest || 0} / 400 forest, ${g.world.stats.mature || 0} / 60 mature` },
  { key: 'apex', name: 'Top of the food web', reward: 6000,
    desc: 'A cougar or black bear takes up residence.',
    check: g => pop(g, 'cougar') + pop(g, 'bear') > 0, prog: g => 'Needs big forest and plenty of prey or berries' },
  { key: 'species20', name: 'Living landscape', reward: 10000,
    desc: 'Have 20 animal species living here at once.',
    check: g => speciesPresent(g) >= 20, prog: g => `${speciesPresent(g)} / 20 species` },
  { key: 'trailhead', name: 'Open to the public', reward: 2000,
    desc: 'Build a trailhead parking lot next to a road and connect at least 40 tiles of trail to it.',
    check: g => g.visitors.net.length >= 40 && g.visitors.facilities().parking > 0, prog: g => `${g.visitors.net.length} / 40 connected trail tiles` },
  { key: 'visitors', name: 'Nature lovers', reward: 3000,
    desc: 'Welcome 1,000 visitors in total.',
    check: g => g.visitors.total >= 1000, prog: g => `${g.visitors.total.toLocaleString()} / 1,000 visitors` },
  { key: 'rating', name: 'Five-star preserve', reward: 5000,
    desc: 'Reach a visitor rating of 4.5 stars. Visitors love seeing wildlife, water, old trees and flowers from the trail.',
    check: g => g.visitors.rating >= 4.5, prog: g => `${g.visitors.rating.toFixed(1)} / 4.5 stars` },
  { key: 'sponge', name: 'Room for the river', reward: 4000,
    desc: 'Restore 200 tiles of marsh and pond. Wetlands soak up winter floods before they spread.',
    check: g => (g.world.stats.counts?.[H.MARSH] || 0) + (g.world.stats.counts?.[H.POND] || 0) >= 200,
    prog: g => `${(g.world.stats.counts?.[H.MARSH] || 0) + (g.world.stats.counts?.[H.POND] || 0)} / 200 wetland tiles` },
  { key: 'score', name: 'Thriving', reward: 12000,
    desc: 'Reach an ecosystem health score of 80.',
    check: g => (g.cache.score?.total ?? 0) >= 80, prog: g => `${Math.round(g.cache.score?.total ?? 0)} / 80` },
];
