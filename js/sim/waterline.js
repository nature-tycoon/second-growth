// Where the visible water actually ends. Water is simulated per tile, but a tile's surface is a
// sheet at its lowest corner plus a fill height, and a carved creek pulls down the corners it
// shares with the tiles beside it. So the drawn water reaches part-way up those neighbouring land
// tiles (the renderer carries each body's level one ring out onto the bank). Animals drinking at
// the bank and plants on bank tiles use this to stay on the dry side of the waterline.
import { T, isWater } from '../config.js';

// How far water fills each kind of basin above its lowest corner, in height levels.
export const WATER_FILL = { [T.POND]: .4, [T.CREEK]: .32, [T.RIVER]: .35, [T.MARSH]: .16 };

// The water surface on a water tile, in height levels (null when it holds none).
export function tileWaterLevel(w, i) {
  if (w.waterManaged?.[i]) return Number.isFinite(w.waterLevel[i]) ? w.waterLevel[i] : null;
  const t = w.terrain[i];
  if (!isWater(t)) return null;
  const x = i % w.w, y = (i / w.w) | 0;
  return Math.min(w.vert(x, y), w.vert(x + 1, y), w.vert(x + 1, y + 1), w.vert(x, y + 1)) + WATER_FILL[t];
}

// The ground under a point, on the same two triangles the terrain mesh draws (not bilinear).
export function groundAt(w, fx, fy) {
  const x = Math.floor(fx), y = Math.floor(fy), u = fx - x, v = fy - y;
  const a = w.vert(x, y), b = w.vert(x + 1, y), c = w.vert(x + 1, y + 1), d = w.vert(x, y + 1);
  return u >= v ? a + (b - a) * u + (c - b) * v : a + (c - d) * u + (d - a) * v;
}

// The highest water surface drawn over tile (x, y): its own, or carried onto it from water up to
// two tiles away (the renderer gives the bank ring the water's level, and shares each corner's
// highest level with every tile touching it). null where no water reaches.
export function visibleLevel(w, x, y) {
  let L = null;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (!w.inb(x + dx, y + dy)) continue;
    const l = tileWaterLevel(w, w.idx(x + dx, y + dy));
    if (l != null && (L == null || l > L)) L = l;
  }
  return L;
}

// Is the point (fx, fy) under the drawn water? (margin: how far above the waterline counts as wet)
export function underWater(w, fx, fy, margin = 0.02) {
  const x = Math.floor(fx), y = Math.floor(fy);
  if (!w.inb(x, y)) return false;
  const L = visibleLevel(w, x, y);
  return L != null && groundAt(w, fx, fy) < L + margin;
}

// Walk from (x0, y0) toward (x1, y1) and return the last point still on dry ground (or null if
// the start is already wet). steps: how finely to search.
// underWater for one search that samples many points over a few tiles: each tile's drawn water
// level is looked up once. (Make a new one for each search: the water moves.)
export function wetTest(w, margin = 0.02) {
  let li = -1, L = null;
  const seen = new Map();
  return (fx, fy) => {
    const x = Math.floor(fx), y = Math.floor(fy);
    if (!w.inb(x, y)) return false;
    const i = w.idx(x, y);
    if (i !== li) {
      li = i; L = seen.get(i);
      if (L === undefined) seen.set(i, L = visibleLevel(w, x, y));
    }
    return L != null && groundAt(w, fx, fy) < L + margin;
  };
}

export function lastDry(w, x0, y0, x1, y1, steps = 12, margin = 0.03) {
  const wet = wetTest(w, margin);
  if (wet(x0, y0)) return null;
  let best = [x0, y0];
  for (let k = 1; k <= steps; k++) {
    const t = k / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    if (wet(x, y)) break;
    best = [x, y];
  }
  return best;
}

// A river fish swims in its own tile's water (decision 0034): the depth of that water over the
// ground at (fx, fy), in height levels (-Infinity off the water). The renderer draws a fish at
// this tile's surface (waterSurfaceY), down into this depth, so sim and drawing agree.
export const FISH_DEPTH = 0.07; // (about 17 cm: a trout's room in the shallows)
export function swimDepth(w, fx, fy) {
  const x = Math.floor(fx), y = Math.floor(fy);
  if (!w.inb(x, y)) return Infinity; // (the water beyond the farm's edge)
  const L = tileWaterLevel(w, w.idx(x, y));
  return L == null ? -Infinity : L - groundAt(w, fx, fy);
}
// The nearest point within r of (fx, fy) with at least `min` of water, else the deepest one there.
// The points are a 0.15 grid round it, tried nearest first (ties in grid order), so it stops at the
// first deep enough, and each tile's water level is looked up once: a fish stranded in the
// shallows asks this every step.
const offsets = new Map(), levels = new Map();
function offsetsFor(r) {
  let o = offsets.get(r);
  if (o) return o;
  o = [];
  for (let dy = -r; dy <= r + 1e-9; dy += 0.15) for (let dx = -r; dx <= r + 1e-9; dx += 0.15) {
    const dist = Math.hypot(dx, dy);
    if (dist <= r) o.push({ dx, dy, dist, order: o.length });
  }
  o.sort((a, b) => a.dist - b.dist || a.order - b.order);
  offsets.set(r, o);
  return o;
}
export function deepWaterNear(w, fx, fy, r = 1.2, min = FISH_DEPTH) {
  let deep = null, deepest = -Infinity, deepOrder = Infinity;
  levels.clear();
  for (const { dx, dy, order } of offsetsFor(r)) {
    const x = fx + dx, y = fy + dy, tx = Math.floor(x), ty = Math.floor(y);
    let d;
    if (!w.inb(tx, ty)) d = Infinity; // (as swimDepth: the water beyond the farm's edge)
    else {
      const i = w.idx(tx, ty);
      let L = levels.get(i);
      if (L === undefined) levels.set(i, L = tileWaterLevel(w, i));
      d = L == null ? -Infinity : L - groundAt(w, x, y);
    }
    if (d >= min) return [x, y];
    // (the deepest, the first of equals in grid order)
    if (d > deepest || d === deepest && d > -Infinity && order < deepOrder) { deepest = d; deep = [x, y]; deepOrder = order; }
  }
  return deep;
}
