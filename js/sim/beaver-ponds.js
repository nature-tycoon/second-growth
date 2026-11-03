// Beaver ponds, from dam to meadow and back to creek (decision 0034).
//
// A colony dams a slow stretch of creek where the water will back up into a real pond, not a
// trickle over a steep riffle. Ponds are spaced with flowing creek between them, so a creek with
// several colonies is a chain of ponds. A dam stands while beavers tend it, and they tend it while
// there is willow, alder, aspen and the like to eat round it; once that is eaten out they leave,
// and the untended dam breaches within a year or two (damDay in animals.js). The drained pond is
// a beaver meadow: wet sedge where the open water stood, sedge and rushes over its old shallows,
// the drowned trees standing as snags and falling as logs, and willow, birch and ash coming in.
// Over decades the meadow dries back toward creekside forest, and beavers return once the willow
// has grown back.
//
// Real numbers: dams mostly under 1.5 m (DAM_HEAD in hollis-water.js), ponds commonly a few tenths
// of a hectare to a hectare or so (a tile is 8 m: 0.1 ha ~ 16 tiles), recolonisation of an
// abandoned site after about nine years on average, flooding killing most trees and setting the
// stand back to early succession; pond to meadow to stream (Naiman et al. 1988, as cited in the
// decision record).
import { T, F, DAYS_PER_YEAR } from '../config.js';

// world.meadow per tile: 0 none; 1..MEADOW_YEARS years since a beaver pond drained there;
// PENDING_DEEP / PENDING_SHALLOW while its water is still running off (open water / shallows).
export const MEADOW_YEARS = 60, PENDING_DEEP = 255, PENDING_SHALLOW = 254;
// A pond worth building: at least this many tiles under water, this many of them open water.
export const SITE_WET = 15, SITE_OPEN = 5;
// Room between ponds: no dam within this many tiles of another, and none inside another's pool.
export const DAM_GAP = 9;
// Creek tiles per dam the farm can hold at most (about one per 160 m: 2-16 dams/km are recorded).
export const CREEK_PER_DAM = 20;
// Beaver food round a dam (shrub and tree growth summed within FOOD_R): below FOOD_MIN the
// colony stops keeping it up.
export const FOOD_R = 6, FOOD_MIN = 1.5;

// How much a colony has to eat round tile i: beaverFood shrubs and trees, by growth.
export function beaverFood(w, i, r = FOOD_R) {
  const x0 = i % w.w, y0 = (i / w.w) | 0, P = w.catalog.plants;
  let food = 0;
  for (let y = Math.max(0, y0 - r); y <= Math.min(w.h - 1, y0 + r); y++) for (let x = Math.max(0, x0 - r); x <= Math.min(w.w - 1, x0 + r); x++) {
    const j = y * w.w + x;
    if (w.shrub[j] && P[w.shrub[j]].beaverFood && w.shrubG[j] > 0.35) food += w.shrubG[j];
    if (w.tree[j] && P[w.tree[j]].beaverFood && w.treeG[j] > 0.15) food += Math.min(1, w.treeG[j]) * 0.6;
  }
  return food;
}

const dams = w => { const out = []; for (let i = 0; i < w.n; i++) if (w.feature[i] === F.DAM && !(w.marks[i] & 4)) out.push(i); return out; };

// Can a colony dam the creek at `site`? Room on the creek, room from other ponds, and (with the
// water model) a pond big enough to be worth it.
export function damSiteOK(game, site) {
  const w = game.world;
  if (w.terrain[site] !== T.CREEK || w.feature[site] !== 0) return false;
  if (game.water && w.waterOwner[site] >= 0 && game.water.basins[w.waterOwner[site]]?.kind !== 'pond') return false; // (already in another dam's pond)
  const existing = dams(w), x = site % w.w, y = (site / w.w) | 0;
  if (existing.some(j => Math.max(Math.abs(j % w.w - x), Math.abs(((j / w.w) | 0) - y)) <= DAM_GAP)) return false;
  let creek = 0; for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.CREEK || (w.terrain[i] === T.POND && w.waterOwner?.[i] >= 0 && game.water?.base[i] === T.CREEK)) creek++;
  if (existing.length >= Math.max(1, Math.floor(creek / CREEK_PER_DAM))) return false;
  if (beaverFood(w, site) < FOOD_MIN * 1.5) return false;
  if (game.water) { const p = game.water.damPotential(site); if (p.wet < SITE_WET || p.open < SITE_OPEN) return false; }
  return true;
}

// The dam at `site` is going: remember what its pond covered, so the ground becomes beaver meadow
// once the water has run off.
export function drainToMeadow(game, site) {
  const w = game.world, water = game.water;
  if (water) {
    const k = w.waterOwner[site], b = k >= 0 ? water.basins[k] : null;
    if (!b || b.kind === 'pond') return;
    for (const v of b.cells) {
      const i = v.i, t = water.base[i];
      if (w.waterOwner[i] !== k || t === T.CREEK || t === T.RIVER || t === T.POND || w.waterDepth[i] <= .04) continue;
      w.meadow[i] = w.terrain[i] === T.POND ? PENDING_DEEP : PENDING_SHALLOW;
    }
  }
}
// (the older, water-model-free flooding: its marsh and mud become meadow straight away)
export function meadowTile(w, i, deep) {
  w.meadow[i] = 1;
  if (deep) w.terrain[i] = T.MARSH;
  else if (w.terrain[i] === T.MUD) { w.terrain[i] = T.SOIL; w.soil[i] = Math.max(w.soil[i], 0.5); }
  sedge(w, i);
}
// Wet sedge on the bare, drowned ground (it comes up from the seed bank in a drained pond).
function sedge(w, i) {
  const P = w.catalog.plants;
  if (w.ground[i] && P[w.ground[i]].wetOK) return;
  const s = P.find(p => p && p.layer === 0 && p.wetOK && !p.invasive && p.look?.type === 'sedge');
  if (s) { w.ground[i] = s.id; w.groundG[i] = 0.25; }
}

// Daily: pending meadow whose water has gone becomes meadow (and once a year, meadows age).
export function meadowDay(game) {
  const w = game.world; let changed = false;
  if (game.day % DAYS_PER_YEAR === 0) meadowYear(game);
  for (let i = 0; i < w.n; i++) {
    const m = w.meadow[i];
    if (m < PENDING_SHALLOW) continue;
    if (w.waterManaged?.[i] && w.waterDepth[i] > .04) continue;
    const deep = m === PENDING_DEEP;
    w.meadow[i] = 1;
    if (deep) { w.terrain[i] = T.MARSH; changed = true; }
    sedge(w, i);
  }
  if (changed) { w.hydroDirty = true; w.renderDirty = true; game.water?.sync(); }
}

// Yearly: a meadow ages. The marsh where the pond stood dries to wet meadow ground, a few tiles a
// year after the first three (about half gone by year 15, most by 40), and after MEADOW_YEARS
// it is ordinary ground again.
export function meadowYear(game) {
  const w = game.world, rng = game.rng; let changed = false;
  for (let i = 0; i < w.n; i++) {
    const m = w.meadow[i];
    if (!m || m >= PENDING_SHALLOW) continue;
    if (m >= MEADOW_YEARS) { w.meadow[i] = 0; continue; }
    w.meadow[i] = m + 1;
    if (w.terrain[i] === T.MARSH && m >= 3 && rng() < 0.05) { w.terrain[i] = T.SOIL; w.soil[i] = Math.max(w.soil[i], 0.55); changed = true; }
  }
  if (changed) { w.hydroDirty = true; w.renderDirty = true; game.water?.sync(); }
}

// Extra wetness of a meadow: a drained pond's ground stays soggy for decades, drying as it ages.
export const meadowMoist = m => m && m < PENDING_SHALLOW ? 0.22 * (1 - m / MEADOW_YEARS) : 0;

// A farm saved before the water model ran beaver ponds by marks (16: drowned creek, 32: flooded
// land). The model rebuilds the pond behind each standing dam, so the old pools go back to creek
// and their flooded ground becomes meadow.
export function migrateMarkedPools(w) {
  const POOL_CREEK = 16, POOL_LAND = 32;
  for (let i = 0; i < w.n; i++) {
    if (!(w.marks[i] & (POOL_CREEK | POOL_LAND))) continue;
    if ((w.marks[i] & POOL_CREEK) && w.terrain[i] === T.POND) w.terrain[i] = T.CREEK;
    else if ((w.marks[i] & POOL_LAND) && (w.terrain[i] === T.MARSH || w.terrain[i] === T.MUD)) meadowTile(w, i, w.terrain[i] === T.MARSH);
    w.marks[i] &= ~(POOL_CREEK | POOL_LAND);
  }
}

export const isMeadow = (w, i) => w.meadow[i] > 0 && w.meadow[i] < PENDING_SHALLOW;

// For the tile notes.
export function meadowNote(game, i) {
  const w = game.world, m = w.meadow[i];
  if (!m) return null;
  if (m >= PENDING_SHALLOW) return 'The beaver dam that held this pond is gone, and the water is running off. The pond bed will become a wet beaver meadow.';
  return m < 15
    ? `A beaver meadow, ${m} year${m === 1 ? '' : 's'} old: the bed of an old beaver pond, rich wet silt grown over with sedge tussocks, with the drowned trees standing as snags. Willow and birch come in first, and elk (and moose, where they live) come to browse them. Beavers may return once the willow has grown back.`
    : `An old beaver meadow (${m} years): the pond it once was is drying back toward creekside forest, and its silt makes some of the richest ground on the farm.`;
}
