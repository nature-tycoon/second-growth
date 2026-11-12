// Landforms: the helpers each map's height recipe is built from, and the "drains downhill" pass
// (docs/decisions/0044-terrain-relief.md). Heights are in levels (2.4 m) on tile corners.

import { BORDER, T } from '../config.js';

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
