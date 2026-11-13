// Wallows (decision 0034): the heaviest herbivores roll and dig in damp ground, and the dish they
// wear fills with rain in the wet season and dries out in the dry one. While it holds water it is
// a breeding pool for frogs and toads, and fairy shrimp and tadpole shrimp hatch in it from eggs
// that wait out the dry months in the mud. One that is no longer used slowly fills in.
//
// Real wallows: bison wear dishes a few metres across and a few tens of centimetres deep, used
// over years; elk bulls dig and urinate in rutting wallows; elephants, buffalo, rhinos, warthogs,
// tapirs and wild pigs wallow to cool off and coat themselves in mud. Hippos live in the water and
// don't need one. A wallow is smaller than a tile (8 m): world.wallow holds how worn it is
// (0 none, up to 255), world.wallowWet how full of water (0-255, never above its depth).
//
// Who wallows is data: a species with `wallow: { size, rut }` on its definition (js/data/animal-kinds.js),
// so a species added later (bison, moose) wallows as soon as it has one. rut: only in the rut (the
// bulls' wallows); size: how big a dish, 1 for an elk.
import { T, F, isWater } from '../config.js';
import { inRut } from './cervid-groups.js';

export const wallower = def => def.wallow || null;

// A wallow holding at least this much water counts as a pool (for frogs: environment.js distPond).
export const WALLOW_POOL = 25;
// At most this many wallows on the farm, and two per wallowing animal.
export const WALLOW_MAX = 40;

// Damp, open, fairly level ground an animal can wear a dish into.
export function wallowGround(w, i) {
  const t = w.terrain[i];
  if (isWater(t) || t === T.ROAD || t === T.TRAIL || t === T.GRAVEL || w.struct[i] >= 0) return false;
  if (w.tree[i] || (w.feature[i] && w.feature[i] !== F.STUMP)) return false;
  if (w.moist[i] < 0.55) return false;
  const c = w.corners(i % w.w, (i / w.w) | 0);
  return Math.max(...c) - Math.min(...c) < 0.35; // (not on a slope: about 0.8 m across a tile)
}

// An animal's wallow today: deepen one it stands by, or wear a new one in damp ground.
export function wallowVisit(game, a, def, i) {
  const spec = wallower(def), w = game.world;
  if (!spec || (spec.rut && !inRut(game)) || a.juvenile) return false;
  if (game.rng() > 0.03 * spec.size) return false; // (a few times a month for a wallowing herd)
  const x = i % w.w, y = (i / w.w) | 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!w.inb(x + dx, y + dy)) continue;
    const j = w.idx(x + dx, y + dy);
    if (w.wallow[j]) { w.wallow[j] = Math.min(255, w.wallow[j] + Math.round(25 * spec.size)); return true; }
  }
  if (!wallowGround(w, i)) return false;
  let n = 0; for (let j = 0; j < w.n; j++) if (w.wallow[j]) n++;
  const wallowers = game.wildlife.agents.reduce((s, b) => s + (wallower(game.catalog.animals[b.sp]) && !b.leaving ? 1 : 0), 0);
  if (n >= Math.min(WALLOW_MAX, 2 * wallowers)) return false;
  w.wallow[i] = Math.round(70 * spec.size);
  return true;
}

// Daily: rain fills the wallows, dry weather and the heat empty them, and unused ones fill in.
export function wallowDay(game) {
  const w = game.world, m = game.month, rainy = game.weather === 'rain', clim = game.mapDefinition.climate;
  const dryness = 1 - (clim.rain?.[m] ?? 0.3); // (how dry this month usually is)
  let crossed = false;
  for (let i = 0; i < w.n; i++) {
    const d = w.wallow[i]; if (!d) continue;
    const was = w.wallowWet[i] >= WALLOW_POOL;
    let water = w.wallowWet[i];
    if (rainy) water += 45;
    else water -= 2 + 10 * dryness * dryness + (w.moist[i] > 0.85 ? -1 : 0); // (a wet seep keeps it longer)
    if (w.flood[i]) water = 255;
    w.wallowWet[i] = Math.max(0, Math.min(d, water));
    if ((w.wallowWet[i] >= WALLOW_POOL) !== was) crossed = true;
    // (unused, it slumps and grasses over: a well-worn one lasts a few years)
    if (game.day % 8 === 0) { w.wallow[i] = d - 1; if (!w.wallow[i]) w.wallowWet[i] = 0; }
    if (isWater(w.terrain[i]) || w.struct[i] >= 0 || w.tree[i] > 0 && w.treeG[i] > 0.3) { w.wallow[i] = 0; w.wallowWet[i] = 0; crossed = true; }
  }
  if (crossed) w.hydroDirty = true; // (a pool for the frogs: distPond)
}

// For the tile notes.
export function wallowNote(game, i) {
  const w = game.world; if (!w.wallow[i]) return null;
  const wet = w.wallowWet[i] >= WALLOW_POOL;
  return wet
    ? 'A wallow, worn into the damp ground by big animals rolling in the mud. After rain it is a small pool: frogs and toads lay their eggs here, and fairy shrimp and tadpole shrimp hatch from eggs that waited out the dry months in its mud.'
    : 'A wallow, worn into the damp ground by big animals rolling in the mud. It is dry now; rain will fill it again, and the eggs of fairy shrimp and tadpole shrimp wait in its mud until it does.';
}

export const wallowCount = w => { let n = 0, wet = 0; for (let i = 0; i < w.n; i++) if (w.wallow[i]) { n++; if (w.wallowWet[i] >= WALLOW_POOL) wet++; } return { n, wet }; };
