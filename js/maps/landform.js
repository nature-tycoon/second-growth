// Landforms: the helpers each map's height recipe is built from, and the "drains downhill" pass
// (docs/decisions/0044-terrain-relief.md). Heights are in levels (2.4 m) on tile corners.

import { BORDER, T, F, isWater } from '../config.js';

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

// Each creek tile's distance (4-way steps along the creek) from where it runs out into the river, a
// pond, a marsh or off the map's south edge (0 there; -1 off the creek). In order: `q`.
function creekOutletDist(w, q = []) {
  const creek = i => w.terrain[i] === T.CREEK;
  const dist = new Int32Array(w.n).fill(-1);
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
  return dist;
}

// Make each creek's bed fall (or at worst stay level) all the way to where it runs out: into the
// river, a pond, a marsh or off the map. Only ever lowers, from the top of the creek down.
export function creekDownhill(w) {
  const creek = i => w.terrain[i] === T.CREEK, q = [], dist = creekOutletDist(w, q);
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
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
// (FISH_DEPTH 0.07). And how much deeper than the dig cut it grading may take a dug tile (0.6, about
// 1.4 m), so a creek dug straight up a steep hill keeps a few cascades rather than becoming a ravine.
// (The player's edits, creek grading and Fill & grade included, are in js/terrain-edit.js: 0048.)
export const CHANNEL_STEP = 0.2, CHANNEL_CUT = 0.6;

// Waterfalls (ideas batch cinema-creeks, session 6): where a creek runs down a steep reach (each
// tile's bed STEEP or more under the one above, as the PNW ditch does in the foothills), the drop
// is gathered at one resistant ledge, as falls form in real Cascade creeks: the bed below the ledge
// is lowered by FALL_DROP, so the creek runs off a lip and drops about 5 m in one tile; a plunge
// pool is scoured at its foot (its far end POOL_RISE over its near end, so it holds water at its
// tail-out, the lowest way out, and the creek runs on from there); and the gorge below eases back
// out to the old bed, each tile at least MIN_DROP (more than POOL_RISE: the water below never
// stands higher than the pool). Only ever lowers, and only on a straight reach one tile wide. Rocks
// stand on the land either side of the fall. Maps opt in (`land.falls`); a map without such a reach
// gets none. Returns the falls made: [{ x, y, drop }] (the fall's tile; drop in levels).
// Drawing and checks find them from the heights alone (fallTiles), so nothing is saved.
export const FALL_STEEP = 0.45, FALL_DROP = 1.5, POOL_RISE = 0.12, FALL_MIN_DROP = 0.18, FALL_MIN = 1.2;
export function creekFalls(w, max = 2) {
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], creek = i => w.terrain[i] === T.CREEK;
  const dist = creekOutletDist(w), falls = [];
  const bed = i => Math.min(...w.corners(i % w.w, (i / w.w) | 0));
  const nb = i => { const x = i % w.w, y = (i / w.w) | 0, out = []; for (const [dx, dy] of N4) if (w.inb(x + dx, y + dy) && creek(w.idx(x + dx, y + dy))) out.push(w.idx(x + dx, y + dy)); return out; };
  // the two corners a tile shares with the next one down
  const edge = (i, j) => {
    const x = i % w.w, y = (i / w.w) | 0, dx = j % w.w - x, dy = ((j / w.w) | 0) - y;
    return dx === 1 ? [[x + 1, y], [x + 1, y + 1]] : dx === -1 ? [[x, y], [x, y + 1]] : dy === 1 ? [[x, y + 1], [x + 1, y + 1]] : [[x, y], [x + 1, y]];
  };
  for (let s0 = 0; s0 < w.n && falls.length < max; s0++) {
    // from each spring (a creek tile with nothing above it) down to where the creek runs out
    if (!creek(s0) || dist[s0] <= 0 || nb(s0).some(j => dist[j] === dist[s0] + 1)) continue;
    const c = [s0];
    for (let i = s0; dist[i] > 0;) { const j = nb(i).find(j => dist[j] === dist[i] - 1); if (j == null) break; c.push(i = j); }
    const h = c.map(bed), m = c.length;
    const straight = (a, b) => { for (let k = Math.max(1, a); k <= Math.min(m - 2, b); k++) if (c[k + 1] - c[k] !== c[k] - c[k - 1] || nb(c[k]).length > 2) return false; return true; };
    // steep runs: tiles k whose bed stands STEEP or more over the next one's
    for (let s = 0; s < m - 1 && falls.length < max;) {
      if (h[s] - h[s + 1] < FALL_STEEP) { s++; continue; }
      let e = s; while (e + 1 < m - 1 && h[e + 1] - h[e + 2] >= FALL_STEEP) e++;
      const mid = (s + e) >> 1, tries = [];
      for (let f = s + 2; f <= e - 2; f++) tries.push(f);
      tries.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
      for (const f of tries) {
        // the new height of each edge below the ledge (edge k joins tile k to k + 1)
        const nh = new Map([[f, h[f] - FALL_DROP], [f + 1, h[f] - FALL_DROP + POOL_RISE]]);
        let k = f + 2;
        for (; k < m - 1; k++) { const v = Math.min(h[k], nh.get(k - 1) - FALL_MIN_DROP); if (v >= h[k]) break; nh.set(k, v); }
        if (k > e + 1 || h[f + 1] < nh.get(f + 1) || !straight(f - 1, k)) continue;
        for (const [kk, v] of nh) for (const [vx, vy] of edge(c[kk], c[kk + 1])) w.setVert(vx, vy, w.vert(vx, vy) - (h[kk] - v));
        const x = c[f] % w.w, y = (c[f] / w.w) | 0, along = [c[f + 1] % w.w - x, ((c[f + 1] / w.w) | 0) - y];
        for (const sd of [-1, 1]) { // (the ledge's rock, either side of the fall)
          const rx = x + along[1] * sd, ry = y - along[0] * sd;
          if (!w.inb(rx, ry)) continue;
          const r = w.idx(rx, ry);
          if (!isWater(w.terrain[r]) && w.terrain[r] !== T.ROAD && w.struct[r] < 0 && !w.feature[r] && !w.tree[r] && !w.shrub[r]) w.feature[r] = F.ROCKS;
        }
        falls.push({ x, y, drop: h[f - 1] - nh.get(f) });
        break;
      }
      s = e + 1;
    }
  }
  return falls;
}

// Is creek tile i a fall: its bed drops FALL_MIN or more from one edge to the edge opposite (not
// counting the tilt across it)? From the heights alone; drawing (terrain.js) and beaver dams
// (hollis-water.js damCrest: a pond never drowns a fall) ask it.
export function isFall(w, i) {
  return w.terrain[i] === T.CREEK && bedDrop(w, i) >= FALL_MIN;
}
// How far a creek tile's bed drops from one edge to the edge opposite (0 off a creek): a riffle
// or a fall's fast water, which dippers feed in (js/data/animals-pnw.js).
export function bedDrop(w, i) {
  if (w.terrain[i] !== T.CREEK) return 0;
  const c = w.corners(i % w.w, (i / w.w) | 0);
  return Math.max(Math.abs(c[0] + c[1] - c[2] - c[3]), Math.abs(c[0] + c[3] - c[1] - c[2])) / 2;
}
export function fallTiles(w) {
  const out = [];
  for (let i = 0; i < w.n; i++) if (isFall(w, i)) out.push(i);
  return out;
}
