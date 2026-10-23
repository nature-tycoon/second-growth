// Curved journeys. A route search returns a staircase of tiles (it steps N/S/E/W), and walking it
// laid every trail along a tile row or column, crossing in a checkerboard. A journey's route is
// redrawn as a curve: pulled straight across open ground, bent by a gentle meander that belongs to
// the land (so every animal on the same corridor walks the same bends and wears one trail), and
// drawn into any worn track within a tile and a half (animals keep to a beaten path). The curve is turned
// back into a chain of tiles, each with the point where the curve crosses it, so everything that
// reads a.path (its destination, its length, popping tiles on arrival) works as before.
import { T, clamp } from '../config.js';
import { passable } from './animal-terrain.js';
import { valueNoise } from '../rng.js';
import { trailSample, walkNode } from './animal-trails.js';

export const COURSE_MIN = 6;      // tiles: shorter walks keep their tile-by-tile route
const MEANDER = 1.0;              // tiles each side at most
const MEANDER_SCALE = 6;          // tiles between bends, roughly
const TRACK_REACH = 1.5;          // tiles: how far to the side an animal steps into a worn track (about a body length)
const TRACK_SEEN = 0.05;          // worn enough to be drawn to (the drawn trail starts at 0.09)
const STEP = 0.25;                // sampling along the curve, tiles

// The point an animal steers for in path tile k: where its course crosses that tile, or the tile's
// usual waypoint when the path has no course (a short walk, or the course was refused).
export function pathPoint(w, a, k) {
  const j = a.path[k], c = a.course;
  if (c && c.path === a.path && c.pts && !Number.isNaN(c.pts[k * 2])) return [c.pts[k * 2], c.pts[k * 2 + 1]];
  const p = walkNode(w, a, j);
  return [j % w.w + p[0], (j / w.w | 0) + p[1]];
}

function standable(w, a, def, x, y) {
  if (!w.inb(x, y)) return false;
  const j = w.idx(x, y);
  return !w.fire[j] && (passable(w, j, a) || !!def.crossing && w.terrain[j] === T.RIVER);
}
// The straight walk from (x0, y0) to (x1, y1) stays on standable ground, including both sides of a
// diagonal tile corner (as walkSegmentSafe does for a step).
function lineClear(w, a, def, x0, y0, x1, y1) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.1));
  let px = Math.floor(x0), py = Math.floor(y0);
  for (let k = 1; k <= n; k++) {
    const xx = Math.floor(x0 + (x1 - x0) * k / n), yy = Math.floor(y0 + (y1 - y0) * k / n);
    if (xx === px && yy === py) continue;
    if (!standable(w, a, def, xx, yy) || xx !== px && yy !== py && (!standable(w, a, def, xx, py) || !standable(w, a, def, px, yy))) return false;
    px = xx; py = yy;
  }
  return true;
}

// The land's meander: a smooth vector field, read across the direction of travel. The same spot
// pushes a walker the same way whichever direction it's going, so a return trip retraces the bends.
function meander(x, y, nx, ny) {
  const vx = valueNoise(x, y, MEANDER_SCALE, 311) * 2 - 1, vy = valueNoise(x, y, MEANDER_SCALE, 653) * 2 - 1;
  return clamp((vx * nx + vy * ny) * 1.6, -1, 1) * MEANDER;
}
// The worn track nearest the line, within reach to the side: the offset to step to, or null.
function track(w, x, y, nx, ny, from) {
  let best = null, score = TRACK_SEEN;
  for (let t = -TRACK_REACH; t <= TRACK_REACH + 1e-6; t += 0.15) {
    const v = trailSample(w, x + nx * t, y + ny * t) * (1 - 0.35 * Math.abs(t - from) / TRACK_REACH);
    if (v > score) { score = v; best = t; }
  }
  return best;
}

// Redraw a's current path as a curved course, in place. Returns false (leaving the path as it was)
// when the curve can't be walked safely or would be much longer than the route it replaces.
export function shapeCourse(wl, a, def) {
  const w = wl.game.world, path = a.path;
  a.course = { path, pts: null };
  if (!path || path.length < COURSE_MIN || a.fromFire || a.run || !w.inb(Math.floor(a.x), Math.floor(a.y))) return false;
  // 1. The route from here to the destination tile, as tile centers, pulled straight wherever the
  // ground allows (the farthest point it can see, again and again).
  const pts = [[a.x, a.y]];
  for (let k = path.length - 1; k >= 0; k--) pts.push([path[k] % w.w + 0.5, (path[k] / w.w | 0) + 0.5]);
  const keys = [pts[0]];
  for (let i = 0; i < pts.length - 1;) {
    let far = i + 1;
    for (let k = Math.min(pts.length - 1, i + 40); k > i + 1; k--) if (lineClear(w, a, def, pts[i][0], pts[i][1], pts[k][0], pts[k][1])) { far = k; break; }
    keys.push(pts[far]); i = far;
  }
  // 2. Sample along it, push each sample across the line by the land's meander (tapering to nothing
  // at either end), then into a worn track within reach, and smooth the offsets.
  const xs = [], ys = [], ns = [];
  for (let k = 0; k < keys.length - 1; k++) {
    const [x0, y0] = keys[k], [x1, y1] = keys[k + 1], d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(d / STEP));
    for (let s = 0; s < n; s++) { xs.push(x0 + (x1 - x0) * s / n); ys.push(y0 + (y1 - y0) * s / n); }
  }
  xs.push(keys[keys.length - 1][0]); ys.push(keys[keys.length - 1][1]);
  const m = xs.length, length = (m - 1) * STEP;
  const nx = new Float32Array(m), ny = new Float32Array(m), off = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const p = Math.max(0, i - 3), q = Math.min(m - 1, i + 3), dx = xs[q] - xs[p], dy = ys[q] - ys[p], d = Math.hypot(dx, dy) || 1;
    nx[i] = -dy / d; ny[i] = dx / d;
    const taper = clamp(Math.min(i * STEP, length - i * STEP) / 2.5, 0, 1);
    let o = meander(xs[i], ys[i], nx[i], ny[i]) * taper;
    const t = taper > 0.3 ? track(w, xs[i], ys[i], nx[i], ny[i], o) : null;
    if (t != null) o = t * taper;
    off[i] = o;
  }
  for (let pass = 0; pass < 3; pass++) for (let i = 1; i < m - 1; i++) off[i] = (off[i - 1] + off[i] * 2 + off[i + 1]) / 4;
  // 3. Keep every sample, and every step between them, on standable ground: pull a sample back
  // toward the line where the ground beside it is blocked.
  for (let i = 0; i < m; i++) {
    let o = off[i], ok = false;
    for (const f of [1, 0.5, 0]) {
      const x = xs[i] + nx[i] * o * f, y = ys[i] + ny[i] * o * f;
      if (standable(w, a, def, Math.floor(x), Math.floor(y)) && (i === 0 || lineClear(w, a, def, xs[i - 1], ys[i - 1], x, y))) { xs[i] = x; ys[i] = y; ok = true; break; }
    }
    if (!ok) return false;
  }
  // 4. The tiles the curve passes through, in order (4-connected: a diagonal step passes through
  // whichever side tile the curve runs nearer), each with the middle of its stretch of curve.
  const tiles = [], first = [], last = [];
  let cx = Math.floor(xs[0]), cy = Math.floor(ys[0]);
  const enter = (tx, ty, i) => {
    const j = w.idx(tx, ty), seen = tiles.lastIndexOf(j);
    if (seen >= 0) { tiles.length = first.length = last.length = seen + 1; last[seen] = i; return; } // (a loop back: cut it)
    tiles.push(j); first.push(i); last.push(i);
  };
  for (let i = 1; i < m; i++) {
    const tx = Math.floor(xs[i]), ty = Math.floor(ys[i]);
    if (tx === cx && ty === cy) { if (tiles.length) last[tiles.length - 1] = i; continue; }
    if (tx !== cx && ty !== cy) {
      const fx = xs[i] - (tx > cx ? tx : cx), fy = ys[i] - (ty > cy ? ty : cy);
      const side = Math.abs(fx) < Math.abs(fy) ? [tx, cy] : [cx, ty];
      if (!standable(w, a, def, ...side)) return false;
      enter(side[0], side[1], i);
    }
    enter(tx, ty, i); cx = tx; cy = ty;
  }
  const dest = path[0];
  if (tiles[tiles.length - 1] !== dest || tiles.length > path.length * 1.35 + 2) return false;
  if (tiles[0] === w.idx(Math.floor(a.x), Math.floor(a.y))) { tiles.shift(); first.shift(); last.shift(); }
  if (!tiles.length) return false;
  // a.path runs destination first, next tile last; the destination keeps its usual waypoint, where
  // the animal settles or drinks
  const out = tiles.slice().reverse(), at = new Float32Array(out.length * 2).fill(NaN);
  for (let k = 1; k < out.length; k++) {
    const i = tiles.length - 1 - k, mid = (first[i] + last[i]) >> 1, j = out[k], x0 = j % w.w, y0 = j / w.w | 0;
    at[k * 2] = clamp(xs[mid], x0 + 0.06, x0 + 0.94); at[k * 2 + 1] = clamp(ys[mid], y0 + 0.06, y0 + 0.94);
  }
  a.path = out; a.course = { path: out, pts: at };
  return true;
}
