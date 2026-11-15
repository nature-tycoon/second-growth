// Landforms: the helpers each map's height recipe is built from, and the "drains downhill" pass
// (docs/decisions/0044-terrain-relief.md). Heights are in levels (2.4 m) on tile corners.

import { BORDER, T, isWater } from '../config.js';
import { WATER_FILL } from '../sim/waterline.js';

export const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// Tiles (as a w.n array, 255 = farther than `max`) from the nearest tile `is(i)` picks, by 8-way steps.
export function tileDistance(w, is, max = 30) {
  const d = new Uint8Array(w.n).fill(255), q = [];
  for (let i = 0; i < w.n; i++) if (is(i)) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % w.w, y = (i / w.w) | 0;
    if (d[i] >= max) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (!w.inb(xx, yy)) continue;
      const j = w.idx(xx, yy);
      if (d[j] === 255) { d[j] = d[i] + 1; q.push(j); }
    }
  }
  return d;
}

// Fill every closed hollow in the land, so rain anywhere could run off to the river or the edge
// (a priority flood: each corner ends no lower than the lowest way out, plus `lean`, so a filled
// hollow slopes gently, about 0.6%, toward its way out; a hair's lean left one level plain around
// the Hollis stock pond that the water model flooded whole). Run before the water is carved:
// ponds and marsh are dug afterwards.
export function fillPits(w, isOutlet, lean = 0.02) {
  const VW = w.VW, VH = w.VH, vh = w.vh, n = VW * VH;
  const done = new Uint8Array(n), heap = [];
  const push = v => {
    heap.push(v); let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (vh[heap[p]] <= vh[v]) break; heap[k] = heap[p]; k = p; }
    heap[k] = v;
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k, mh = vh[last];
        if (l < heap.length && vh[heap[l]] < mh) { m = l; mh = vh[heap[l]]; }
        if (r < heap.length && vh[heap[r]] < mh) m = r;
        if (m === k) break;
        heap[k] = heap[m]; k = m;
      }
      heap[k] = last;
    }
    return top;
  };
  for (let vy = 0; vy < VH; vy++) for (let vx = 0; vx < VW; vx++) {
    const v = vy * VW + vx;
    if (vx === 0 || vy === 0 || vx === VW - 1 || vy === VH - 1 || isOutlet(vx - BORDER, vy - BORDER)) { done[v] = 1; push(v); }
  }
  while (heap.length) {
    const v = pop(), vx = v % VW, vy = (v / VW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = vx + dx, ny = vy + dy;
      if (nx < 0 || ny < 0 || nx >= VW || ny >= VH) continue;
      const u = ny * VW + nx;
      if (done[u]) continue;
      done[u] = 1;
      if (vh[u] < vh[v] + lean) vh[u] = vh[v] + lean;
      push(u);
    }
  }
}

// Make each creek's bed fall (or at worst stay level) all the way to where it runs out: into the
// river, a pond, a marsh or off the map. Only ever lowers, from the top of the creek down.
export function creekDownhill(w) {
  const creek = i => w.terrain[i] === T.CREEK;
  const dist = new Int32Array(w.n).fill(-1), q = [];
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let i = 0; i < w.n; i++) {
    if (!creek(i)) continue;
    const x = i % w.w, y = (i / w.w) | 0;
    let out = false;
    for (const [dx, dy] of N4) {
      const xx = x + dx, yy = y + dy;
      if (!w.inb(xx, yy)) { out = yy >= w.h; continue; } // (off the map's south edge, into the river)
      const t = w.terrain[w.idx(xx, yy)];
      if (t === T.RIVER || t === T.POND || t === T.MARSH) out = true;
    }
    if (out) { dist[i] = 0; q.push(i); }
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % w.w, y = (i / w.w) | 0;
    for (const [dx, dy] of N4) {
      const xx = x + dx, yy = y + dy;
      if (!w.inb(xx, yy)) continue;
      const j = w.idx(xx, yy);
      if (creek(j) && dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); }
    }
  }
  const bed = i => { const x = i % w.w, y = (i / w.w) | 0; return Math.min(w.vert(x, y), w.vert(x + 1, y), w.vert(x + 1, y + 1), w.vert(x, y + 1)); };
  const cap = new Float32Array(w.n);
  const order = q.slice().sort((a, b) => dist[b] - dist[a]); // from the top of each creek down
  for (const i of order) {
    const x = i % w.w, y = (i / w.w) | 0;
    let c = bed(i);
    for (const [dx, dy] of N4) {
      const xx = x + dx, yy = y + dy;
      if (!w.inb(xx, yy)) continue;
      const j = w.idx(xx, yy);
      if (creek(j) && dist[j] === dist[i] + 1) c = Math.min(c, cap[j]);
    }
    cap[i] = c;
    // a step up on the way down: sink the whole tile by it, keeping its own shape
    const drop = bed(i) - c;
    if (drop > 0) for (const [dx, dy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) w.setVert(x + dx, y + dy, w.vert(x + dx, y + dy) - drop);
  }
}

// How far a creek's bed may fall from one tile to the next and still be one swimmable stream: each
// tile's water stands WATER_FILL (0.32) over its lowest corner, so a bed whose highest corner is at most
// 0.2 over its lowest is covered by about 0.12 (30 cm) everywhere, more than a river fish needs
// (FISH_DEPTH 0.07). And how much deeper than carve() cut it grading may take a dug tile (0.6, about
// 1.4 m), so a creek dug straight up a steep hill keeps a few cascades rather than becoming a ravine.
export const CHANNEL_STEP = 0.2, CHANNEL_CUT = 0.6;

// A creek the player digs (decision 0048): carve() cuts each tile from its own highest corner, so
// across a slope a dug creek was a staircase of flat pools and dry chutes over a metre high, and
// salmon in it could never reach the creek it joined. This grades the dug creek tiles 4-connected to
// (x, y) (`dugBed`: NaN off them, else the floor carve gave each, its highest corner) so that each dug
// tile's floor stands within CHANNEL_STEP of every corner it shares with the water it joins (a creek,
// the river, a pond or a marsh) and of every dug tile it shares a corner with: then each tile's water
// covers its whole bed. Floors go at most CHANNEL_CUT under carve's floor and never over it, and no
// corner of the map's own creeks or any other water moves. A dug creek joined to no other water (yet)
// is left as it is: it's graded when it's joined.
export function gradeDugCreek(w, x, y, dugBed) {
  const dug = i => w.terrain[i] === T.CREEK && Number.isFinite(dugBed[i]);
  const start = w.idx(x, y);
  if (!dug(start)) return false;
  const top = i => { const x = i % w.w, y = (i / w.w) | 0; return Math.max(w.vert(x, y), w.vert(x + 1, y), w.vert(x + 1, y + 1), w.vert(x, y + 1)); };
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const comp = [start], b = new Map([[start, top(start)]]);
  let joined = false;
  for (let k = 0; k < comp.length; k++) {
    const i = comp[k], cx = i % w.w, cy = (i / w.w) | 0;
    for (const [dx, dy] of N4) {
      if (!w.inb(cx + dx, cy + dy)) continue;
      const j = w.idx(cx + dx, cy + dy);
      if (dug(j)) { if (!b.has(j)) { b.set(j, top(j)); comp.push(j); } }
      else if (isWater(w.terrain[j])) joined = true;
    }
  }
  if (!joined) return false;
  const fixed = (vx, vy) => [[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([ox, oy]) => w.inb(vx + ox, vy + oy) && isWater(w.terrain[w.idx(vx + ox, vy + oy)]) && !dug(w.idx(vx + ox, vy + oy)));
  const C4 = [[0, 0], [1, 0], [1, 1], [0, 1]];
  // (each floor within CHANNEL_STEP of the other water's corners it shares, then of each dug tile it
  // shares a corner with: a shortest-path relaxation, as each lowered tile may lower those above it.
  // First down (the floor comes down to the water it joins), then up (a floor cut deeper than the
  // water beside it comes back up), each within its bounds)
  const was = new Map(b), lo = i => dugBed[i] - CHANNEL_CUT, hi = i => Math.max(dugBed[i], was.get(i));
  for (const sign of [1, -1]) {
    for (const i of comp) {
      const cx = i % w.w, cy = (i / w.w) | 0;
      for (const [dx, dy] of C4) if (fixed(cx + dx, cy + dy)) {
        const bound = w.vert(cx + dx, cy + dy) + sign * CHANNEL_STEP;
        b.set(i, sign > 0 ? Math.max(lo(i), Math.min(b.get(i), bound)) : Math.min(hi(i), Math.max(b.get(i), bound)));
      }
    }
    const q = comp.slice();
    for (let k = 0; k < q.length; k++) {
      const i = q[k], cx = i % w.w, cy = (i / w.w) | 0, bound = b.get(i) + sign * CHANNEL_STEP;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = w.inb(cx + dx, cy + dy) ? w.idx(cx + dx, cy + dy) : -1;
        if (!b.has(j)) continue;
        const v = sign > 0 ? Math.max(lo(j), Math.min(b.get(j), bound)) : Math.min(hi(j), Math.max(b.get(j), bound));
        if (Math.abs(v - b.get(j)) > 1e-6) { b.set(j, v); q.push(j); }
      }
    }
  }
  // (a corner takes the lowest floor of the dug tiles round it; the other water's corners stay put)
  const corner = new Map();
  for (const i of comp) {
    const cx = i % w.w, cy = (i / w.w) | 0;
    for (const [dx, dy] of C4) {
      const vx = cx + dx, vy = cy + dy, key = vy * (w.w + 1) + vx;
      if (!fixed(vx, vy)) corner.set(key, Math.min(corner.get(key) ?? Infinity, b.get(i)));
    }
  }
  let changed = false;
  for (const [key, h] of corner) {
    const vx = key % (w.w + 1), vy = (key / (w.w + 1)) | 0;
    if (Math.abs(w.vert(vx, vy) - h) > 1e-6) { w.setVert(vx, vy, h); changed = true; }
  }
  if (changed) { w.heightDirty = true; w.hv = (w.hv || 0) + 1; }
  return changed;
}

// Fill & grade: one level across a stroke. How far (in levels) a land tile may sit from the stroke's
// level and still be graded to it: 1.5 levels (3.6 m) over the tile's 8 m is the steepest cut bank
// or fill slope a grader leaves; past that the pad simply stops where the ground gets too steep.
export const GRADE_REACH = 1.5;
// (a tile whose corners all stand this near the level is left as it is, so grading ground that is
// already level, or has the 0.02 lean fillPits leaves, moves and charges nothing)
const GRADE_SLACK = 0.03;

// The level a Fill & grade stroke starting on tile (x, y) grades to: that tile's own height, or, on
// water being filled, the land round it (as before) but never under the water's surface plus a bank
// (0.15), so the filled ground stands dry rather than being flooded again by the water beside it.
export function gradeLevel(w, x, y) {
  const i = w.idx(x, y), t = w.terrain[i];
  if (!isWater(t)) return w.tileH(x, y);
  let s = 0, n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || !w.inb(x + dx, y + dy) || isWater(w.terrain[w.idx(x + dx, y + dy)])) continue;
    s += w.tileH(x + dx, y + dy); n++;
  }
  const c = w.corners(x, y), surface = Math.min(...c) + (WATER_FILL[t] ?? 0.3) + 0.15;
  return Math.max(n ? s / n : Math.max(...c), surface);
}

// Set tile (x, y)'s corners to `level`, so the ground there is perfectly flat; the tiles round it
// that aren't graded take the slope between (a one-tile cut bank or fill slope). A corner shared with
// other water or a building stays put (0048: an edit never moves another water body's corners, and a
// building keeps the flat ground it was built on). One exception: filling part of a pond or marsh
// (`filling`) may raise, never lower, the corners it shares with the rest of it, as tipped earth
// slumps into the water's edge; held there, a filled shore tile sloped down under the water and the
// water model called it marsh. A creek's or the river's bed never moves. Returns whether any corner moved.
export function gradeTile(w, x, y, level, filling = false) {
  const C4 = [[0, 0], [1, 0], [1, 1], [0, 1]];
  if (C4.every(([dx, dy]) => Math.abs(w.vert(x + dx, y + dy) - level) <= GRADE_SLACK)) return false;
  let moved = false;
  for (const [dx, dy] of C4) {
    const vx = x + dx, vy = y + dy;
    if (w.vert(vx, vy) === level) continue;
    const held = [[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([ox, oy]) => {
      const tx = vx + ox, ty = vy + oy;
      if ((tx === x && ty === y) || !w.inb(tx, ty)) return false;
      const j = w.idx(tx, ty), t = w.terrain[j];
      if (filling && (t === T.POND || t === T.MARSH) && level > w.vert(vx, vy)) return false;
      return isWater(t) || w.struct[j] >= 0;
    });
    if (held) continue;
    w.setVert(vx, vy, level); moved = true;
  }
  if (moved) { w.heightDirty = true; w.hv = (w.hv || 0) + 1; }
  return moved;
}
