// The Ecosystem Report's numbers (decision 0031): carbon stored, six "vital signs" measured
// against the map's reference ecosystem, the stage the land has reached, the weakest sign as a
// hint, and badges. Plain arithmetic over the world, with no DOM, so the report, the postcard
// and analytics can all read it. It runs once a month (monthlyTick) and when the report opens,
// never per frame: one pass over the tiles.

import { herbivoreTotals } from './herbivory.js';
import { H, T, F, DAYS_PER_YEAR, clamp } from '../config.js';
import { REFERENCE, referenceFor, CARBON_FRACTION, TILE_HA, BURIAL, SEAGRASS_LIVING, SEAGRASS, CO2_PER_C, CAR_CO2_YEAR } from '../data/eco-reference.js';
import { speciesPresent, nativePlantSpecies } from './goals.js';

export { REFERENCE, CO2_PER_C, CAR_CO2_YEAR };

// English names (the interface translates them)
export const VITAL_NAMES = { carbon: 'Carbon', layers: 'Plant layers', foodweb: 'Food web', native: 'Native plants', water: 'Water',
  oldgrowth: 'Old trees and deadwood', coral: 'Living coral', variety: 'Coral variety', clean: 'Clean reef', seagrass: 'Seagrass',
  oldcoral: 'Old coral heads', health: 'Health', streak: 'Better every year' };
export const TIER_NAMES = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

const isWater = t => t === T.CREEK || t === T.POND || t === T.MARSH || t === T.RIVER;
const ICON = { carbon: '🌲', layers: '🌿', foodweb: '🦉', native: '🌼', water: '💧', oldgrowth: '🪵',
  coral: '🪸', variety: '🐚', clean: '🧽', seagrass: '🌾', oldcoral: '🪨' };

// ------------------------------------------------------------------ carbon
// Tonnes of carbon on the land, from each plant's species, size and age (an estimate: see 0031).
// A tile is about 67 m2, room for one canopy tree's share of a stand.
export function carbonOf(game) {
  const w = game.world, ref = referenceFor(game.map), plants = w.catalog.plants;
  const perTile = ref.agb * CARBON_FRACTION * TILE_HA; // a reference tree's carbon on one tile
  let trees = 0, shrubs = 0, grass = 0, dead = 0, soil = 0, oldTrees = 0, mangrove = 0, seagrass = 0;
  const seagrassIds = new Set(SEAGRASS.map(k => w.catalog.plant[k]?.id).filter(Boolean));
  for (let i = 0; i < w.n; i++) {
    const t = w.terrain[i], tr = w.tree[i];
    if (tr) {
      const p = plants[tr], g = w.treeG[i];
      // (on the reef, only the cay's trees: corals build limestone, not stored carbon)
      if (!ref.reef || p.cay) {
        const size = clamp((p.heightM ?? ref.href) / ref.href, 0.3, 1.6);
        const years = w.treeAge[i] / DAYS_PER_YEAR, mature = p.matureAge ?? (p.conifer ? 12 : 18);
        // a tree's wood grows with the square of its growth, and keeps thickening for decades after
        trees += perTile * size * g * g * (0.75 + 0.25 * Math.min(1, years / (3 * mature)));
        if (p.mangrove && g > 0.3) mangrove++;
        if (!p.invasive && !p.exotic && g >= 0.95 && years >= mature) oldTrees++;
      }
    }
    const s = w.shrub[i];
    if (s && !ref.reef) shrubs += perTile * 0.12 * w.shrubG[i];
    const gr = w.ground[i];
    if (gr) {
      if (seagrassIds.has(gr) && w.groundG[i] > 0.3) { seagrass++; grass += SEAGRASS_LIVING * TILE_HA * w.groundG[i]; }
      else if (!ref.reef) grass += ref.grass * CARBON_FRACTION * TILE_HA * w.groundG[i];
    }
    const f = w.feature[i];
    if (f === F.LOG) dead += perTile * 0.4;
    else if (f === F.SNAG) dead += perTile * 0.3;
    else if (f === F.STUMP || f === F.BRUSH) dead += perTile * 0.05;
    // soil to 30 cm: wetland beds hold more; farmed soil has lost some, and wins it back as it heals
    if (t === T.MARSH || t === T.POND) soil += ref.socWet * TILE_HA;
    else if (!isWater(t) && w.struct[i] < 0 && t !== T.ROAD && t !== T.TRAIL) soil += ref.soc * TILE_HA * (ref.fLU + (1 - ref.fLU) * clamp(w.soil[i], 0, 1));
  }
  const blue = game.stats.eco?.blue || 0;
  const living = trees + shrubs + grass;
  return { trees, shrubs, grass, living, dead, soil, blue, total: living + dead + soil + blue, oldTrees, mangrove, seagrass };
}

// Mangrove and seagrass mud buries carbon year after year: added up month by month (monthlyTick).
export function buryBlueCarbon(game, carbon) {
  const eco = ecoState(game);
  eco.blue = (eco.blue || 0) + (carbon.mangrove * BURIAL.mangrove + carbon.seagrass * BURIAL.seagrass) * TILE_HA / 12;
}

// ------------------------------------------------------------------ food web
// Three levels: plant and insect eaters, hunters, and the map's top predators.
export function foodWeb(game) {
  const ref = referenceFor(game.map), animals = game.catalog.animals, state = game.wildlife.state;
  const groups = { grazers: { present: [], missing: [] }, hunters: { present: [], missing: [] }, apex: { present: [], missing: [] } };
  animals.forEach((a, k) => {
    if (a.domestic) return;
    const g = ref.apex.includes(a.key) ? 'apex' : a.prey || a.challengePrey ? 'hunters' : 'grazers';
    (state[k]?.pop > 0 ? groups[g].present : groups[g].missing).push(a.name);
  });
  const parts = Object.values(groups).filter(x => x.present.length + x.missing.length)
    .map(x => Math.min(1, x.present.length / Math.max(1, 0.7 * (x.present.length + x.missing.length))));
  return { groups, score: parts.length ? parts.reduce((s, v) => s + v, 0) / parts.length : 0 };
}

// ------------------------------------------------------------------ vital signs
// Each sign is 0..1 of the reference, with the parts it's made of (for the deep dive and the hint).
const part = (key, value, target) => ({ key, value, target, score: target > 0 ? clamp(value / target, 0, 1) : 0 });
const mean = parts => parts.length ? parts.reduce((s, p) => s + p.score, 0) / parts.length : 0;

function landVitals(game, carbon, fw) {
  const w = game.world, st = w.stats, ref = referenceFor(game.map), land = st.land || 1, s = game.cache.score || {};
  const refLiving = ref.agb * CARBON_FRACTION * TILE_HA * land * ref.cover.forest;
  const c = st.counts;
  const layers = [
    part('meadow', st.meadow, land * ref.cover.meadow),
    part('shrub', c[H.SHRUB] + c[H.RIPARIAN], land * ref.cover.shrub),
    part('forest', st.forest, land * ref.cover.forest),
    part('old', st.mature, land * ref.cover.old),
  ];
  const inv = clamp((s.invFrac || 0) / 0.3, 0, 1);
  const native = [
    part('nativeCover', s.nativeFrac || 0, 0.85),
    part('nativeKinds', game.cache.nativePlants ?? nativePlantSpecies(w), game.catalog.definition.plantSpeciesTarget || 26),
    { key: 'invasive', value: s.invFrac || 0, target: 0, score: 1 - inv },
  ];
  // water: wetland area, water quality, and how much of the creek is shaded
  let q = 0, qn = 0;
  for (let i = 0; i < w.n; i++) { const t = w.terrain[i]; if (isWater(t) && t !== T.RIVER) { q += w.waterQ[i]; qn++; } }
  const water = [part('wetland', c[H.MARSH] + c[H.POND], land * ref.wet), part('quality', qn ? q / qn : 0, 0.8)];
  if (st.creek) water.push(part('creekShade', st.shadedCreek / st.creek, 0.8));
  const dead = (st.logs || 0) + (st.snags || 0);
  const old = [part('bigTrees', carbon.oldTrees, land * ref.big), part('deadwood', dead, land * ref.dead)];
  return [
    { key: 'carbon', score: clamp(carbon.living / refLiving, 0, 1), parts: [part('living', carbon.living, refLiving)] },
    { key: 'layers', score: mean(layers), parts: layers },
    { key: 'foodweb', score: fw.score, parts: [] },
    { key: 'native', score: mean(native.slice(0, 2)) * (1 - 0.6 * inv), parts: native },
    { key: 'water', score: mean(water), parts: water },
    { key: 'oldgrowth', score: mean(old), parts: old },
  ];
}

function reefVitals(game, carbon, fw) {
  const st = game.world.stats, ref = referenceFor(game.map), s = game.cache.score || {};
  const coral = [part('coral', st.coral || 0, ref.coral)];
  const variety = [part('coralKinds', st.coralKinds || 0, ref.coralKinds), part('softCoral', st.softCoral || 0, ref.softCoral)];
  const inv = clamp((s.invFrac || 0) / 0.3, 0, 1), bleached = clamp((st.bleached || 0) / Math.max(1, st.coral || 0), 0, 1);
  const clean = [{ key: 'algae', value: s.invFrac || 0, target: 0, score: 1 - inv }, { key: 'bleached', value: bleached, target: 0, score: 1 - bleached }];
  return [
    { key: 'coral', score: coral[0].score, parts: coral },
    { key: 'variety', score: mean(variety), parts: variety },
    { key: 'foodweb', score: fw.score, parts: [] },
    { key: 'clean', score: mean(clean), parts: clean },
    { key: 'seagrass', score: clamp((st.meadow || 0) / ref.seagrass, 0, 1), parts: [part('seagrass', st.meadow || 0, ref.seagrass)] },
    { key: 'oldcoral', score: clamp(carbon.oldCoral / ref.oldCoral, 0, 1), parts: [part('oldCoral', carbon.oldCoral, ref.oldCoral)] },
  ];
}

// Old coral heads: big, old hard corals (the reef's version of old trees)
function oldCorals(w) {
  let n = 0;
  for (let i = 0; i < w.n; i++) {
    const tr = w.tree[i];
    if (tr && !w.catalog.plants[tr].cay && w.treeG[i] >= 0.95 && w.treeAge[i] >= 15 * DAYS_PER_YEAR) n++;
  }
  return n;
}

// ------------------------------------------------------------------ the whole report
const STAGE_AT = [0.2, 0.4, 0.6, 0.8];
export const stageOf = v => STAGE_AT.filter(t => v >= t).length;

export function ecoMetrics(game) {
  const ref = referenceFor(game.map);
  const carbon = carbonOf(game);
  if (ref.reef) carbon.oldCoral = oldCorals(game.world);
  const fw = foodWeb(game);
  const vitals = (ref.reef ? reefVitals : landVitals)(game, carbon, fw);
  for (const v of vitals) v.icon = ICON[v.key];
  const overall = vitals.reduce((s, v) => s + v.score, 0) / vitals.length;
  const weakest = vitals.reduce((a, b) => (b.score < a.score ? b : a));
  const weakPart = weakest.parts.reduce((a, b) => (!a || b.score < a.score ? b : a), null);
  return { reference: ref, carbon, foodWeb: fw, vitals, overall, stage: stageOf(overall), weakest: weakest.key, weakPart: weakPart?.key || null,
    herbivores: ref.herbivores ? { ...herbivoreTotals(game.world), range: ref.herbivores } : null, // (0033)
    species: speciesPresent(game), speciesMax: game.catalog.animals.filter(a => !a.domestic).length };
}

// ------------------------------------------------------------------ saved state
// stats.eco: { start: the farm's numbers on day one, blue: buried blue carbon, badges: { key: day },
// streak: years in a row health went up }. stats is saved, so it all survives a reload.
export function ecoState(game) {
  return game.stats.eco ||= { start: null, blue: 0, badges: {}, streak: 0 };
}

// The farm as the player found it, to show "since you arrived". An older save that predates the
// report starts its baseline the day it's first opened (since: that day), and says so.
export function ensureBaseline(game, m = ecoMetrics(game)) {
  const eco = ecoState(game);
  if (!eco.start) {
    eco.start = { day: game.day, score: game.cache.score?.total ?? 0, carbon: round1(m.carbon.total), living: round1(m.carbon.living),
      vitals: m.vitals.map(v => round2(v.score)), species: m.species };
    // badges already met on day one are the starting point, not something earned
    for (const b of badgeList(game)) if (b.met(m, game)) eco.badges[b.key] = -1;
  }
  return eco.start;
}

// ------------------------------------------------------------------ badges
// Bronze, silver and gold for each vital sign, plus health and a streak of better years. They're
// for show: no grant (so they don't change the game's balance). Earned once, kept for good.
export const TIERS = [['bronze', 0.3], ['silver', 0.6], ['gold', 0.9]];
const HEALTH_TIERS = [['bronze', 50], ['silver', 70], ['gold', 90]];
const STREAK_TIERS = [['bronze', 2], ['silver', 3], ['gold', 5]];
export function badgeList(game) {
  const keys = referenceFor(game.map).reef ? ['coral', 'variety', 'foodweb', 'clean', 'seagrass', 'oldcoral'] : ['carbon', 'layers', 'foodweb', 'native', 'water', 'oldgrowth'];
  const list = [];
  keys.forEach((k, n) => TIERS.forEach(([tier, at]) => list.push({ key: `${k}-${tier}`, vital: k, tier, at, icon: ICON[k],
    progress: m => m.vitals[n].score / at, met: m => m.vitals[n].score >= at })));
  HEALTH_TIERS.forEach(([tier, at]) => list.push({ key: `health-${tier}`, vital: 'health', tier, at, icon: '⭐',
    progress: (m, g) => (g.cache.score?.total ?? 0) / at, met: (m, g) => (g.cache.score?.total ?? 0) >= at }));
  STREAK_TIERS.forEach(([tier, at]) => list.push({ key: `streak-${tier}`, vital: 'streak', tier, at, icon: '🔥',
    progress: (m, g) => ecoState(g).streak / at, met: (m, g) => ecoState(g).streak >= at }));
  return list;
}

// Award any badge newly met; returns the new ones (the game announces them).
export function checkBadges(game, m) {
  const eco = ecoState(game), out = [];
  for (const b of badgeList(game)) if (eco.badges[b.key] == null && b.met(m, game)) { eco.badges[b.key] = game.day; out.push(b); }
  return out;
}

// At the turn of each year: one more year in the streak if health went up, back to zero if not.
export function yearEnd(game, scoreNow, scoreYearAgo) {
  const eco = ecoState(game);
  eco.streak = scoreNow > scoreYearAgo + 0.5 ? eco.streak + 1 : 0;
}

// The compact numbers kept in game.history each month, for the trend lines.
export const historyEntry = m => ({ c: round1(m.carbon.total), cl: round1(m.carbon.living), v: m.vitals.map(v => round2(v.score)) });

export const co2 = c => c * CO2_PER_C;
export const carsForAYear = c => co2(c) / CAR_CO2_YEAR;
const round1 = v => Math.round(v * 10) / 10, round2 = v => Math.round(v * 100) / 100;
