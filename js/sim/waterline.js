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
  return Math.min(...w.corners(x, y)) + WATER_FILL[t];
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
export function lastDry(w, x0, y0, x1, y1, steps = 12, margin = 0.03) {
  if (underWater(w, x0, y0, margin)) return null;
  let best = [x0, y0];
  for (let k = 1; k <= steps; k++) {
    const t = k / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    if (underWater(w, x, y, margin)) break;
    best = [x, y];
  }
  return best;
}
