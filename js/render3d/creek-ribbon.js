// A creek's water drawn as one smooth ribbon along its course (decision 0055), drawing only.
//
// The water mesh is a sheet a tile (terrain.js buildWater), and a one-tile creek's banks sit only
// just over its water (0054: beaver ponds and floods spread over them), so its waterline ran out along
// the next tiles' edges and a creek dug on a diagonal or round a tight S drew as a staircase. Here
// each creek's course is found again from its tiles (creekCourses: courses aren't saved, and map
// creeks and dug ones are drawn alike), smoothed, and every corner of the map gets how far inside a
// ribbon along it it lies: its half-width less its distance from the course, in tiles. The water
// shader ends the water where that falls to zero (min with the ground's own waterline), so the
// creek's outline follows the ribbon's smooth edge; the sim, its tiles, levels and flow don't move.
//
// Only where a creek is one tile wide and nothing else wet is near (a pond, marsh, river, a fall, a
// wide stretch, a beaver pond over it, the map's edge): there the field is RIBBON_CAP, no cut, and
// the water keeps its own waterline.

import { T, isWater } from '../config.js';
import { WATER_FILL } from '../sim/waterline.js';
import { creekCourses, smoothLine } from '../maps/water-shape.js';
import { isFall } from '../maps/landform.js';

// (half-width in tiles: a dug creek's bed lies within about 0.7 of its course and the corners the
// shore pass lifts at each step's outer side at about 1.06, so 0.9 covers the bed and trims the bank
// strip the staircase flooded)
export const RIBBON_HALF = 0.9;
export const RIBBON_HEAD = 0.5; // (at a creek's head it narrows to this, the end tile's own half-width)
const HEAD_RUN = 2.5;           // (tiles back from a head over which it widens to the full ribbon)
// (the field is clamped to this either side: more than a tile's diagonal, so the zero crossing on any
// triangle edge next to it is where the true distance puts it)
export const RIBBON_CAP = 1.5;
export const RIBBON_K = 0.35;   // (height levels a tile, in the water shader: the bank's own slope, so the fade and foam keep their width)
// (at a corner of the creek's own tiles the ribbon never hides water deeper than this over the drawn
// ground, in height levels: a dug bed left outside it would show as a dry pit, the "dry bites" the
// shader's rounding guards against too. Only there: a deep strip of bank flooded downhill stays cut,
// and a head's last tiles narrow.)
export const RIBBON_DEEP = 0.2;
export const RIBBON_DEEP_HEAD = 0.28; // (a head's last tiles: only the deepest bed, so the end still narrows)

// The ribbon over the world's corners ((w.w + 1) * (w.h + 1), row by row): `field`, tiles inside the
// ribbon's edge (positive) or beyond it (negative), RIBBON_CAP where the ribbon doesn't govern; `bed`, 1
// at a corner of a ribbon creek's own tile. `edge(k, depth)` is what the water shader takes at corner k
// (aRibbon, height levels), given the drawn water's depth over the ground there.
export function creekRibbon(w) {
  const W = w.w, H = w.h, VW = W + 1, n = W * H;
  const field = new Float32Array(VW * (H + 1)).fill(RIBBON_CAP), bed = new Uint8Array(VW * (H + 1));
  const edge = (k, depth) => bed[k] ? Math.max(field[k] * RIBBON_K, depth - (bed[k] === 2 ? RIBBON_DEEP_HEAD : RIBBON_DEEP)) : field[k] * RIBBON_K;
  const out = { field, bed, edge };
  // each tile: 1 a one-tile-wide creek's, 2 other water (or a creek too wide, a fall, a pond over it)
  const kind = out.kind = new Uint8Array(n);
  const wetI = i => wetTile(w, i);
  for (let i = 0; i < n; i++) kind[i] = ribbonKind(w, i);
  const courses = creekCourses(w, i => kind[i] === 1);
  if (!courses.length) return out;
  const on = new Uint8Array(n);
  for (const c of courses) for (const [x, y] of c) on[y * W + x] = 1;
  const best = new Float32Array(VW * (H + 1)).fill(-RIBBON_CAP);
  const head = (x, y) => {
    let k = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (!w.inb(xx, yy)) return false; // (a creek running off the map's edge runs on)
      if (wetI(w.idx(xx, yy))) k++;
    }
    return k === 1;
  };
  // (a junction, a tile with creek on three or four sides, and the tiles within two of it keep their
  // centres: Sumatra's canals meet at right angles, and 0054 keeps a confluence sharp)
  const creekT = (x, y) => w.inb(x, y) && kind[w.idx(x, y)] === 1;
  const junction = (x, y) => creekT(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => creekT(x + dx, y + dy)).length >= 3;
  const pinned = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (junction(x + dx, y + dy)) return true; return false; };
  const nearHead = new Uint8Array(n); // (a head's last tiles: the ribbon narrows into them, guarded only over the deepest bed)
  for (const chain of courses) {
    for (const [end, step] of [[0, 1], [chain.length - 1, -1]]) if (head(...chain[end])) for (let j = 0; j < 3 && end + j * step >= 0 && end + j * step < chain.length; j++) { const [x, y] = chain[end + j * step]; nearHead[y * W + x] = 1; }
    // (smoothed along the course over 1 tile: rounds the tile steps, barely tightens a 4-tile bend)
    const line = smoothLine(chain.map(([x, y]) => [x + 0.5, y + 0.5]), chain.map(([x, y]) => pinned(x, y)));
    // half-width along it: narrowing into a head at either end
    const cum = [0];
    for (let k = 1; k < line.length; k++) cum.push(cum[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
    const L = cum.at(-1), h0 = head(...chain[0]), h1 = head(...chain.at(-1));
    const taper = s => s >= HEAD_RUN ? 1 : (t => t * t * (3 - 2 * t))(s / HEAD_RUN);
    const half = line.map((_, k) => {
      let f = 1;
      if (h0) f = Math.min(f, taper(cum[k]));
      if (h1) f = Math.min(f, taper(L - cum[k]));
      return RIBBON_HEAD + (RIBBON_HALF - RIBBON_HEAD) * f;
    });
    for (let k = 0; k < line.length - 1; k++) splat(best, VW, H, line[k], line[k + 1], half[k], half[k + 1]);
    if (line.length === 1) splat(best, VW, H, line[0], line[0], half[0], half[0]);
  }
  // governed corners: a creek course's tile among the 4x4 tiles round it and nothing else wet (beyond the
  // map's edge, where the drawing carries a creek on, the field isn't laid: terrain.js takes RIBBON_CAP)
  for (let vy = 0; vy <= H; vy++) for (let vx = 0; vx <= W; vx++) {
    let mine = false, ok = true;
    for (let ty = vy - 2; ty <= vy + 1 && ok; ty++) for (let tx = vx - 2; tx <= vx + 1; tx++) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const i = ty * W + tx;
      if (kind[i] === 2 || (kind[i] === 1 && !on[i])) { ok = false; break; }
      if (on[i]) mine = true;
    }
    if (ok && mine) field[vy * VW + vx] = best[vy * VW + vx];
  }
  // (a head's last tiles take the head's guard, 2, unless a corner is shared with the tiles before them)
  for (const pass of [2, 1]) for (let i = 0; i < n; i++) if (on[i] && (pass === 2) === !!nearHead[i]) {
    const k = ((i / W) | 0) * VW + i % W;
    for (const c of [k, k + 1, k + VW, k + VW + 1]) bed[c] = pass;
  }
  return out;
}

const wetTile = (w, i) => w.waterManaged?.[i] ? Number.isFinite(w.waterLevel[i]) : isWater(w.terrain[i]);
// A tile's part in the ribbon: 0 dry, 1 a one-tile-wide creek's, 2 other water (a creek too wide, a fall,
// a beaver pond standing over it). Only a creek tile's own corners (isFall, the pond's bed) are read, so
// a change of height elsewhere leaves it as it was (water-build.js asks before finding the ribbon again).
export function ribbonKind(w, i) {
  if (!wetTile(w, i)) return 0;
  if (w.terrain[i] !== T.CREEK || isFall(w, i)) return 2;
  const W = w.w, x = i % W, y = (i / W) | 0;
  if (w.waterManaged?.[i]) {
    // (a beaver pond standing over the creek is a pond)
    const c = w.corners(x, y), bed = Math.min(c[0], c[1], c[2], c[3]);
    if (w.waterLevel[i] > bed + WATER_FILL[T.CREEK] + 0.05) return 2;
  }
  for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
    let all = true;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const xx = x + ox + dx, yy = y + oy + dy;
      if (!w.inb(xx, yy) || !wetTile(w, w.idx(xx, yy))) { all = false; break; }
    }
    if (all) return 2;
  }
  return 1;
}

// The field from one segment a-b (half-widths ha, hb): each corner near it keeps the most inside.
export function splat(best, VW, H, a, b, ha, hb) {
  const reach = Math.max(ha, hb) + RIBBON_CAP;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - reach)), x1 = Math.min(VW - 1, Math.ceil(Math.max(a[0], b[0]) + reach));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - reach)), y1 = Math.min(H, Math.ceil(Math.max(a[1], b[1]) + reach));
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  for (let vy = y0; vy <= y1; vy++) for (let vx = x0; vx <= x1; vx++) {
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((vx - a[0]) * dx + (vy - a[1]) * dy) / l2)) : 0;
    const d = Math.hypot(vx - a[0] - dx * t, vy - a[1] - dy * t), v = ha + (hb - ha) * t - d, k = vy * VW + vx;
    if (v > best[k]) best[k] = v;
  }
}
