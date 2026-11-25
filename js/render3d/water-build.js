// The water mesh (Terrain.buildWater): built whole, or only near what changed (batch phone-creeks-fish
// s11, decision 0048's patch redraw line).
//
// Water lies level in its basin and spills a tile onto the banks; wherever the ground rises above it,
// the ground hides it. So shorelines follow the land's contours instead of tile edges. Each stage below
// keeps its whole-map results in a cache on the Terrain (t.wc). A build compares the heights and every
// tile's water (terrain, the pond model's flag and level) with what the cache was built from, and redoes
// each stage only as far as that change reaches: the tiles' own levels, then any pond or marsh body within
// reach (one body, one surface), the bank ring round them, their corners, the flow field's changes, the
// current's coordinates of the stretches whose corners changed, the riverbank stones near them. A whole
// build is the same code with the window over everything and a fresh cache, so a patch writes exactly the
// values a whole build would (tools/terrain-patch-check.mjs compares them byte for byte).
// It falls back to a whole build when the change is wide (PATCH_SHARE), a beaver dam's edges or spill
// changed, the creek beyond the north fence went dry or wet, or the window reaches the fence row on a map
// with a creek beyond it (that row's corners are laid by the north creek's ribbon).

import * as THREE from 'three';
import { T, LEVEL, isWater } from '../config.js';
import { WATER_FILL } from '../sim/waterline.js';
import { surfaceHeight } from './riverbanks.js';
import { creekRibbon, ribbonKind, RIBBON_CAP, RIBBON_K, RIBBON_DEEP, RIBBON_DEEP_HEAD } from './creek-ribbon.js';
import { northCreekAt, NORTH_JOIN } from '../maps/water-shape.js';

const FILL = WATER_FILL;
const lin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
// The starting creek beyond the north fence (outsideCreek) comes down steep hills on some maps: run
// white in full, its sloped sheet read as a snowfield in the intro film, so only streaks of white.
const OUTSIDE_WHITE = 0.3;
// (a change wider than this share of the drawn tiles is built whole: a patch that size costs about as much)
const PATCH_SHARE = 0.35;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const AROUND = [[-1, -1], [0, -1], [-1, 0], [0, 0]]; // (the four tiles round a corner)

// How far downstream and how far across the current each corner of a water mesh lies, in tiles,
// for the water shader's streaks and wavelets. The shader used to project the position onto the
// local current, which squeezed the bands into swirls wherever the current turns round a
// headland (a few degrees of turn, a hundred tiles from the origin, shifts them by whole tiles).
// Here the coordinates are walked out corner by corner along the current from one corner of each
// stretch, then relaxed so the small mismatches round a headland spread out instead of leaving a
// seam. Corners are integers; pos has three numbers per vertex, flow two; still water gets 0.
// (Each stretch, the corners joined edge to edge with flow, is worked out on its own and in the order its
// corners first appear: given just one stretch's corners in that order, it returns the same numbers.)
export function flowCoords(pos, flow, count) {
  const out = new Float32Array(count * 2), key = (x, z) => (z + 4096) * 8192 + x + 4096;
  const index = new Map(), dx = [], dz = [], cx = [], cz = [];
  for (let v = 0; v < count; v++) {
    const fx = flow[v * 2], fz = flow[v * 2 + 1], l = Math.hypot(fx, fz);
    if (l < 0.01) continue;
    const k = key(pos[v * 3], pos[v * 3 + 2]);
    if (!index.has(k)) { index.set(k, dx.length); dx.push(fx / l); dz.push(fz / l); cx.push(pos[v * 3]); cz.push(pos[v * 3 + 2]); }
  }
  const n = dx.length, nb = new Int32Array(n * 4).fill(-1);
  for (let i = 0; i < n; i++) [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ox, oz], s) => { nb[i * 4 + s] = index.get(key(cx[i] + ox, cz[i] + oz)) ?? -1; });
  // the step from corner j to its neighbour i, along the current between them and across it
  const step = (i, j, s) => {
    const ox = cx[i] - cx[j], oz = cz[i] - cz[j], ax = dx[i] + dx[j], az = dz[i] + dz[j], l = Math.hypot(ax, az);
    if (s) return l < 1e-6 ? 0 : (ox * -az + oz * ax) / l;
    return l < 1e-6 ? 0 : (ox * ax + oz * az) / l;
  };
  const along = new Float32Array(n), across = new Float32Array(n), seen = new Uint8Array(n);
  for (let s0 = 0; s0 < n; s0++) {
    if (seen[s0]) continue;
    const q = [s0]; seen[s0] = 1;
    for (let h = 0; h < q.length; h++) for (let e = 0; e < 4; e++) {
      const j = q[h], i = nb[j * 4 + e];
      if (i < 0 || seen[i]) continue;
      seen[i] = 1; along[i] = along[j] + step(i, j, 0); across[i] = across[j] + step(i, j, 1); q.push(i);
    }
  }
  // (each corner's steps to its neighbours, worked out once rather than on every pass)
  const sa = new Float64Array(n * 4), sc = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) for (let e = 0; e < 4; e++) { const j = nb[i * 4 + e]; if (j >= 0) { sa[i * 4 + e] = step(i, j, 0); sc[i * 4 + e] = step(i, j, 1); } }
  for (let pass = 0; pass < 60; pass++) for (let i = 0; i < n; i++) {
    let a = 0, c = 0, m = 0;
    for (let e = 0; e < 4; e++) { const j = nb[i * 4 + e]; if (j >= 0) { a += along[j] + sa[i * 4 + e]; c += across[j] + sc[i * 4 + e]; m++; } }
    if (m) { along[i] = a / m; across[i] = c / m; }
  }
  for (let v = 0; v < count; v++) {
    const i = index.get(key(pos[v * 3], pos[v * 3 + 2]));
    if (i !== undefined && Math.hypot(flow[v * 2], flow[v * 2 + 1]) >= 0.01) { out[v * 2] = along[i]; out[v * 2 + 1] = across[i]; }
  }
  return out;
}

// flowCoords for one stretch of corners (drawing corner indices, `order`: the order they first appear in
// the mesh), written to cur: the same arithmetic in the same order, so the same numbers, without the
// lookups by position. slot: scratch, -1 everywhere (left so).
function relaxStretch(order, vertexFlow, VW, TW, X0, Y0, slot, cur) {
  const n = order.length;
  for (let j = 0; j < n; j++) slot[order[j]] = j;
  const dx = new Float64Array(n), dz = new Float64Array(n), cx = new Float64Array(n), cz = new Float64Array(n), nb = new Int32Array(n * 4).fill(-1);
  for (let j = 0; j < n; j++) {
    const v = order[j], fx = vertexFlow[v * 3], fz = vertexFlow[v * 3 + 1], l = Math.hypot(fx, fz);
    dx[j] = fx / l; dz[j] = fz / l; cx[j] = v % VW + X0; cz[j] = ((v / VW) | 0) + Y0;
  }
  for (let j = 0; j < n; j++) {
    const v = order[j], x = v % VW;
    nb[j * 4] = x < TW ? slot[v + 1] : -1;
    nb[j * 4 + 1] = x > 0 ? slot[v - 1] : -1;
    nb[j * 4 + 2] = v + VW < slot.length ? slot[v + VW] : -1;
    nb[j * 4 + 3] = v - VW >= 0 ? slot[v - VW] : -1;
  }
  const step = (i, j, s) => {
    const ox = cx[i] - cx[j], oz = cz[i] - cz[j], ax = dx[i] + dx[j], az = dz[i] + dz[j], l = Math.hypot(ax, az);
    if (s) return l < 1e-6 ? 0 : (ox * -az + oz * ax) / l;
    return l < 1e-6 ? 0 : (ox * ax + oz * az) / l;
  };
  const along = new Float32Array(n), across = new Float32Array(n), seen = new Uint8Array(n);
  for (let s0 = 0; s0 < n; s0++) {
    if (seen[s0]) continue;
    const q = [s0]; seen[s0] = 1;
    for (let h = 0; h < q.length; h++) for (let e = 0; e < 4; e++) {
      const j = q[h], i = nb[j * 4 + e];
      if (i < 0 || seen[i]) continue;
      seen[i] = 1; along[i] = along[j] + step(i, j, 0); across[i] = across[j] + step(i, j, 1); q.push(i);
    }
  }
  const sa = new Float64Array(n * 4), sc = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) for (let e = 0; e < 4; e++) { const j = nb[i * 4 + e]; if (j >= 0) { sa[i * 4 + e] = step(i, j, 0); sc[i * 4 + e] = step(i, j, 1); } }
  for (let pass = 0; pass < 60; pass++) for (let i = 0; i < n; i++) {
    let a = 0, c = 0, m = 0;
    for (let e = 0; e < 4; e++) { const j = nb[i * 4 + e]; if (j >= 0) { a += along[j] + sa[i * 4 + e]; c += across[j] + sc[i * 4 + e]; m++; } }
    if (m) { along[i] = a / m; across[i] = c / m; }
  }
  for (let j = 0; j < n; j++) { const v = order[j]; cur[v * 2] = along[j]; cur[v * 2 + 1] = across[j]; slot[v] = -1; }
}

// a tile box (drawing tiles, inclusive), grown by m and kept on the grid
const grow = (b, m, TW, TH) => ({ x0: Math.max(0, b.x0 - m), y0: Math.max(0, b.y0 - m), x1: Math.min(TW - 1, b.x1 + m), y1: Math.min(TH - 1, b.y1 + m) });
const unite = (a, b) => !a ? b && { ...b } : !b ? a : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };

function damKey(w) {
  let h = 2166136261;
  for (const e of w.damEdges || []) h = Math.imul(h ^ (e[0] * 31 + e[1] * 7919), 16777619) >>> 0;
  for (const d of w.damSpills || []) h = Math.imul(h ^ (d.site * 7 + Math.round(d.crest * 100) * 131071 + d.edges.length), 16777619) >>> 0;
  return h;
}

function freshCache(t, dams, outsideDry) {
  const TW = t.TW, TH = t.TH, n = TW * TH, nv = (TW + 1) * (TH + 1);
  return {
    world: t.world, border: t.border, TW, TH, dams, outsideDry,
    // what it was built from: the heights, and each tile's terrain, pond-model flag and level
    vh: null, inT: new Uint8Array(n), inM: new Uint8Array(n), inL: new Float64Array(n).fill(NaN), landKey: null,
    raw: new Float32Array(n).fill(NaN), kind0: new Uint8Array(n), wet: new Uint8Array(n),
    level: new Float32Array(n).fill(NaN), kind: new Uint8Array(n), body: new Int32Array(n).fill(-1), bodies: new Map(),
    cornerLevel: new Float64Array(nv).fill(NaN), tileFlow: new Float32Array(n * 2), tileBend: new Float32Array(n), tileDrop: new Float32Array(n),
    vertexFlow: new Float32Array(nv * 3),
    // each corner's vertex values (every vertex at a corner gets the same), and its current stretch
    cY: new Float32Array(nv), cCol: new Float32Array(nv * 4), cDep: new Float32Array(nv), cRound: new Float32Array(nv),
    cRib: new Float32Array(nv), cWhite: new Float32Array(nv), cCur: new Float32Array(nv * 2), comp: new Int32Array(nv).fill(-1), comps: new Map(),
    cRank: new Int32Array(nv).fill(-1), fChanged: new Uint8Array(nv), slot: new Int32Array(nv).fill(-1),
    ribbon: null, northRibbon: new Map(), tiles: null, near: new Uint8Array(n)
  };
}

// The tiles whose water could have changed since the cache was built: those touching a corner whose
// height moved, and those whose water itself changed. null: nothing changed. Updates the cache's inputs.
function changes(t, c) {
  const w = t.world, TW = t.TW, TH = t.TH, VW = TW + 1, X0 = t.X0, Y0 = t.Y0, vh = w.vh, old = c.vh;
  let box = null;
  const creek = new Set(); // (the map's creek tiles round a moved corner: the ribbon reads their beds)
  let cx0 = Infinity, cy0 = Infinity, cx1 = -1, cy1 = -1;
  for (let k = 0; k < vh.length; k++) if (vh[k] !== old[k]) {
    const cx = k % VW, cy = (k / VW) | 0;
    if (cx < cx0) cx0 = cx; if (cx > cx1) cx1 = cx; if (cy < cy0) cy0 = cy; if (cy > cy1) cy1 = cy;
    for (const [dx, dy] of AROUND) {
      const x = cx + dx + X0, y = cy + dy + Y0;
      if (x >= 0 && y >= 0 && x < w.w && y < w.h && w.terrain[y * w.w + x] === T.CREEK) creek.add(y * w.w + x);
    }
  }
  if (cx1 >= 0) { box = { x0: Math.max(0, cx0 - 1), y0: Math.max(0, cy0 - 1), x1: Math.min(TW - 1, cx1), y1: Math.min(TH - 1, cy1) }; c.vh.set(vh); }
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const x = tx + X0, y = ty + Y0, k = ty * TW + tx;
    let tt, m = 0, L = NaN;
    if (x >= 0 && y >= 0 && x < w.w && y < w.h) { const i = y * w.w + x; tt = w.terrain[i]; if (w.waterManaged?.[i]) { m = 1; L = w.waterLevel[i]; } }
    else tt = t.terrainAt(x, y);
    if (tt === c.inT[k] && m === c.inM[k] && Object.is(L, c.inL[k])) continue;
    // (a creek tile's pond-model level: the ribbon reads it exactly, the water's key only to 0.01)
    if ((tt === T.CREEK || c.inT[k] === T.CREEK) && x >= 0 && y >= 0 && x < w.w && y < w.h) creek.add(y * w.w + x);
    c.inT[k] = tt; c.inM[k] = m; c.inL[k] = L;
    if (tx < x0) x0 = tx; if (tx > x1) x1 = tx; if (ty < y0) y0 = ty; if (ty > y1) y1 = ty;
  }
  if (x1 >= 0) box = unite(box, { x0, y0, x1, y1 });
  return box && { box, creek };
}

function readInputs(t, c) {
  const w = t.world, TW = t.TW, TH = t.TH, X0 = t.X0, Y0 = t.Y0;
  c.vh = w.vh.slice();
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const x = tx + X0, y = ty + Y0, k = ty * TW + tx;
    if (x >= 0 && y >= 0 && x < w.w && y < w.h) { const i = y * w.w + x; c.inT[k] = w.terrain[i]; c.inM[k] = w.waterManaged?.[i] ? 1 : 0; c.inL[k] = c.inM[k] ? w.waterLevel[i] : NaN; }
    else { c.inT[k] = t.terrainAt(x, y); c.inM[k] = 0; c.inL[k] = NaN; }
  }
}

// Build the water: whole, or (when the cache allows) only near what changed. Sets t.water, t.waterAt,
// t.shoreVertices, t.shoreMoved, t.waterNear, the riverbanks, the falls; t.waterPatch says which it was
// ('whole', 'patch' or 'same').
export function buildWater(t, whole = false) {
  const w = t.world, TW = t.TW, TH = t.TH, X0 = t.X0, Y0 = t.Y0, VW = TW + 1, nv = VW * (TH + 1);
  const wc = t.catalog.definition.look.water;
  const COL = { [T.POND]: wc.pond, [T.CREEK]: wc.creek, [T.RIVER]: wc.river, [T.MARSH]: wc.marsh };
  // (the water model runs a dry summer on the farm, not beyond it: where the starting creek is dry at
  // the fence, the stretch drawn beyond it, outsideCreek, is too)
  const nc = t.catalog.definition.northCreek, ni = nc ? w.idx(nc(0), 0) : -1;
  const outsideDry = ni >= 0 && !!w.waterManaged?.[ni] && !Number.isFinite(w.waterLevel[ni]);
  const north = t.border?.north, dams = damKey(w);
  const landKey = t.waterKeyLand; // (set by Terrain.buildWater just before)
  let c = t.wc, D = null, creekCorner = [];
  if (!whole && c && c.world === w && c.border === t.border && c.TW === TW && c.TH === TH && c.dams === dams && c.outsideDry === outsideDry && t.water) {
    const ch = changes(t, c);
    // (nothing it's drawn from changed: the mesh stays; the water's quality is read again, as any build did)
    if (!ch) { c.landKey = landKey; t.waterPatch = 'same'; t.shoreMoved = null; t.refreshWaterQuality(); return; }
    D = ch.box; creekCorner = ch.creek;
  }
  if (!D) { c = t.wc = freshCache(t, dams, outsideDry); readInputs(t, c); }
  const full = !D, ALL = { x0: 0, y0: 0, x1: TW - 1, y1: TH - 1 };
  if (full) D = ALL;
  const { raw, kind0, wet, level, kind, body } = c;
  const managed = k => c.inM[k] === 1;

  // 1. each tile's own water: its level, what kind it is, whether it's wet
  const rawTile = (tx, ty) => {
    const x = tx + X0, y = ty + Y0, k = ty * TW + tx, tt = c.inT[k];
    raw[k] = NaN; kind0[k] = 0; wet[k] = 0;
    if (c.inM[k]) {
      if (!Number.isFinite(c.inL[k])) return;
      raw[k] = c.inL[k]; kind0[k] = isWater(tt) ? tt : T.MARSH; wet[k] = 1;
    } else {
      if (!isWater(tt)) return;
      if (outsideDry && tt === T.CREEK && y < 0) return; // (the creek beyond the fence runs dry with the ditch it feeds)
      raw[k] = Math.min(...w.corners(x, y)) + FILL[tt]; kind0[k] = tt; wet[k] = 1;
    }
  };
  for (let ty = D.y0; ty <= D.y1; ty++) for (let tx = D.x0; tx <= D.x1; tx++) rawTile(tx, ty);

  // 2. Ponds and marshes that touch are one body of standing water: give it one surface, so a
  // deeper pond reads as darker water under a continuous sheet instead of a sunken square.
  // (Capped a little above its lowest tile so water never climbs a slope.) A body within reach of the
  // change (its spill scan reads two tiles past it) is filled again whole; the others keep theirs.
  const eligible = k => !managed(k) && wet[k] && (kind0[k] === T.POND || kind0[k] === T.MARSH);
  const wetV = (vx, vy) => AROUND.some(([dx, dy]) => {
    const xx = vx + dx, yy = vy + dy;
    return xx >= 0 && yy >= 0 && xx < TW && yy < TH && wet[yy * TW + xx];
  });
  const seen = new Uint8Array(TW * TH);
  let B = null;
  const fillBody = k0 => {
    const q = [k0]; seen[k0] = 1;
    let lo = Infinity, hi = -Infinity, root = k0;
    for (let h = 0; h < q.length; h++) {
      const k = q[h], tx = k % TW, ty = (k / TW) | 0;
      if (k < root) root = k;
      lo = Math.min(lo, raw[k]); hi = Math.max(hi, raw[k]);
      for (const [dx, dy] of N4) {
        const xx = tx + dx, yy = ty + dy;
        if (xx < 0 || yy < 0 || xx >= TW || yy >= TH) continue;
        const j = yy * TW + xx;
        if (!seen[j] && eligible(j)) { seen[j] = 1; q.push(j); }
      }
    }
    // Nor does it stand above its lowest rim: on a slope the land past the downhill bank can
    // drop below the basin's fill line, and the sheet would run out over it and stop in mid-air
    // along a tile edge. So the surface sits just under that spill point (the ground the bank
    // ring reaches out to, away from other water), but keeps most of its depth: drained lower,
    // a dug pond shows its dark pit walls. (Where the land falls away faster still, the bank
    // ring's outer edge comes down to meet the ground instead: see vLevel.)
    let spill = Infinity;
    for (const k of q) {
      const tx = k % TW, ty = (k / TW) | 0;
      for (let vy = ty - 1; vy <= ty + 2; vy++) for (let vx = tx - 1; vx <= tx + 2; vx++) {
        if (!wetV(vx, vy)) spill = Math.min(spill, w.vert(vx + X0, vy + Y0));
      }
    }
    const rim = spill - 0.02, L = Math.max(Math.min(hi, lo + 0.3, rim), lo - 0.1);
    let bx0 = TW, by0 = TH, bx1 = -1, by1 = -1;
    for (const k of q) {
      const tx = k % TW, ty = (k / TW) | 0;
      const own = Math.min(...w.corners(tx + X0, ty + Y0)) + 0.3;
      level[k] = Math.max(L, Math.min(raw[k], Math.max(rim, own)));
      if (body[k] >= 0 && body[k] !== root) c.bodies.delete(body[k]); // (never: a body it reaches was within reach too)
      body[k] = root;
      if (tx < bx0) bx0 = tx; if (tx > bx1) bx1 = tx; if (ty < by0) by0 = ty; if (ty > by1) by1 = ty;
    }
    c.bodies.set(root, Int32Array.from(q));
    B = unite(B, { x0: bx0, y0: by0, x1: bx1, y1: by1 });
  };
  {
    const reach = full ? ALL : grow(D, 2, TW, TH), seeds = [];
    // (the bodies there as they were: filled again from what's left of them, as they may have split)
    if (!full) {
      const old = new Set();
      for (let ty = reach.y0; ty <= reach.y1; ty++) for (let tx = reach.x0; tx <= reach.x1; tx++) { const r = body[ty * TW + tx]; if (r >= 0) old.add(r); }
      for (const r of old) {
        const m = c.bodies.get(r); c.bodies.delete(r);
        let bx0 = TW, by0 = TH, bx1 = -1, by1 = -1;
        for (const k of m) {
          body[k] = -1; seeds.push(k);
          const tx = k % TW, ty = (k / TW) | 0;
          if (tx < bx0) bx0 = tx; if (tx > bx1) bx1 = tx; if (ty < by0) by0 = ty; if (ty > by1) by1 = ty;
        }
        B = unite(B, { x0: bx0, y0: by0, x1: bx1, y1: by1 }); // (an old body's tiles take their own level or the bank ring's again)
      }
    }
    for (let ty = reach.y0; ty <= reach.y1; ty++) for (let tx = reach.x0; tx <= reach.x1; tx++) seeds.push(ty * TW + tx);
    if (full) seeds.sort((a, b) => a - b);
    // the tiles' own levels first (a body's are set as it's filled)
    const X = full ? ALL : grow(unite(D, B), 1, TW, TH);
    if (!full) {
      // (a wide change, or one reaching the rows by the fence the creek beyond it draws: build whole)
      const W = grow(X, 2, TW, TH);
      if ((W.x1 - W.x0 + 1) * (W.y1 - W.y0 + 1) > TW * TH * PATCH_SHARE || (north && X.y0 + Y0 <= 0)) { t.wc = null; return buildWater(t, true); }
    }
    for (let ty = X.y0; ty <= X.y1; ty++) for (let tx = X.x0; tx <= X.x1; tx++) {
      const k = ty * TW + tx;
      if (!wet[k]) { level[k] = NaN; kind[k] = 0; continue; }
      kind[k] = kind0[k];
      if (body[k] < 0) level[k] = raw[k];
    }
    for (const k of seeds) if (!seen[k] && body[k] < 0 && eligible(k)) fillBody(k);
    c.X = X;
  }
  const X = c.X;

  // 3. one ring of bank tiles carries the neighbouring water level
  // (except the pond's level onto the dry ground just below a beaver dam: the dam holds the pond
  // off it, and the sheet carried over would run down the bank past the dam's mounds)
  const belowDam = new Set();
  for (const e of w.damEdges || []) belowDam.add(e[1]);
  for (let ty = X.y0; ty <= X.y1; ty++) for (let tx = X.x0; tx <= X.x1; tx++) {
    const k = ty * TW + tx;
    if (wet[k]) continue; // (a managed tile without water is bank too: the pond model's dry margins)
    const below = belowDam.size > 0 && w.inb(tx + X0, ty + Y0) && belowDam.has(w.idx(tx + X0, ty + Y0));
    // (the water beside it, or else at its corner: beside a steep creek, the creek a tile upstream
    // stood the bank's water up to 0.6 over the creek's own, and over a waterfall it held the
    // lip's level out over the pool below)
    // (beyond the fence, the lowest: on the inside of a bend in the steep creek there the water a row
    // upstream stood up in the air over the bank's lower corner)
    let L = -Infinity, kd = 0;
    const out = ty + Y0 < 0;
    for (const diag of [0, 1]) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((dx && dy ? 1 : 0) !== diag || !(dx || dy)) continue;
        const xx = tx + dx, yy = ty + dy;
        if (xx < 0 || yy < 0 || xx >= TW || yy >= TH) continue;
        const j = yy * TW + xx;
        if (below && managed(j)) continue; // (the pond's water, held behind the dam; the creek below still banks it)
        if (wet[j] && (L === -Infinity || (out ? level[j] < L : level[j] > L))) { L = level[j]; kd = kind[j]; }
      }
      if (L > -Infinity) break;
    }
    if (L > -Infinity && Math.min(...w.corners(tx + X0, ty + Y0)) < L) { level[k] = L; kind[k] = kd; }
  }
  // (beyond the fence every tile under the creek's ribbon has a sheet: a diagonal's side tiles weren't
  // always in the bank ring, their level set below by the bed, northCreekAt; whole builds only)
  if (full && north && !outsideDry) {
    const nxs = north.line.map(p => p[0]);
    const ntx0 = Math.max(0, Math.floor(Math.min(...nxs)) - X0 - 3), ntx1 = Math.min(TW - 1, Math.ceil(Math.max(...nxs)) - X0 + 3);
    for (let ty = 0; ty < -Y0; ty++) for (let tx = ntx0; tx <= ntx1; tx++) {
      const k = ty * TW + tx;
      if (level[k] === level[k] || northCreekAt(north, tx + X0 + 0.5, ty + Y0 + 0.5).d > north.half + 0.75) continue;
      level[k] = Math.min(...w.corners(tx + X0, ty + Y0)) + FILL[T.CREEK]; kind[k] = T.CREEK;
    }
  }

  // 4. each corner's level
  const cornerLevel = c.cornerLevel;
  // fully clear at the outer edge of the bank ring, so shallows fade out instead of ending in a line
  const vWet = (vx, vy) => {
    for (const [dx, dy] of AROUND) {
      const tx = vx - X0 + dx, ty = vy - Y0 + dy;
      if (tx >= 0 && ty >= 0 && tx < TW && ty < TH && wet[ty * TW + tx]) return true;
    }
    return false;
  };
  const levelAt = (vx, vy) => {
    let L = -Infinity;
    for (const [dx, dy] of AROUND) {
      const tx = vx - X0 + dx, ty = vy - Y0 + dy;
      if (tx < 0 || ty < 0 || tx >= TW || ty >= TH) continue;
      const l = level[ty * TW + tx];
      if (l === l && l > L) L = l;
    }
    // (at the bank ring's outer edge the sheet comes down to meet the ground, never ending in
    // mid-air along the tile line where the land falls away faster than the water can follow)
    return L > -Infinity && !vWet(vx, vy) ? Math.min(L, w.vert(vx, vy)) : L;
  };
  // (the corners of the window's tiles)
  const CX = { x0: X.x0, y0: X.y0, x1: X.x1 + 1, y1: X.y1 + 1 };
  for (let vy = CX.y0; vy <= CX.y1; vy++) for (let vx = CX.x0; vx <= CX.x1; vx++) cornerLevel[vy * VW + vx] = levelAt(vx + X0, vy + Y0);
  // The creek beyond the north fence (outsideCreek, 0054): its sheet lies on the bed it was carved to,
  // bed + fill across from each corner (not tile by tile: on a steep hillside a tile's flat level stood
  // in the air over the next one's bank, or sank under it), and its outline is its ribbon's edge,
  // the farm creek's width (northRibbon: aRibbon below), out to NORTH_REACH tiles from its line. The
  // fence row's corners keep the farm's level; the ribbon ends the water there too (with the farm's
  // own where that governs): beside the creek the border's water spilled over them onto the farm.
  const NORTH_REACH = 6;
  const farmWetFence = vx => [vx - 1, vx].some(x => w.inb(x, 0) && wet[-Y0 * TW + x - X0] === 1);
  if (full && north && !outsideDry) {
    const northRibbon = c.northRibbon, fill = FILL[T.CREEK], xs = north.line.map(p => p[0]);
    const x0 = Math.max(X0, Math.floor(Math.min(...xs)) - NORTH_REACH), x1 = Math.min(X0 + TW, Math.ceil(Math.max(...xs)) + NORTH_REACH);
    for (let vy = Y0; vy <= NORTH_JOIN; vy++) for (let vx = x0; vx <= x1; vx++) {
      const { d, bed } = northCreekAt(north, vx, vy);
      if (d > NORTH_REACH) continue;
      northRibbon.set(vy * 100000 + vx, Math.max(-RIBBON_CAP, Math.min(RIBBON_CAP, north.half - d)) * RIBBON_K);
      const k = (vy - Y0) * VW + vx - X0;
      // (outside the ribbon's edge never over the ground: where the creek bends sharply, PNW's round its
      // film stage, a corner across from a higher stretch of bed held the sheet 0.4 over a low bank)
      if (vy < 0 && Number.isFinite(cornerLevel[k])) cornerLevel[k] = d > north.half ? Math.min(bed + fill, w.vert(vx, vy) + 0.05) : bed + fill;
    }
  }
  const vLevel = (vx, vy) => {
    const tx = vx - X0, ty = vy - Y0;
    return tx >= 0 && ty >= 0 && tx <= TW && ty <= TH ? cornerLevel[ty * VW + tx] : levelAt(vx, vy);
  };
  // the shore heights the ground's wet fringe reads, and where they moved (for a patch repaint: reshape)
  {
    const was = t.shoreVertices0;
    if (full) {
      const shoreVertices = t.shoreVertices = new Float32Array(nv * 2);
      for (let v = 0; v < nv; v++) { const L = cornerLevel[v]; if (Number.isFinite(L)) { shoreVertices[v * 2] = L * LEVEL; shoreVertices[v * 2 + 1] = 1; } }
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      if (was && was.length === shoreVertices.length) for (let v = 0; v < nv; v++) {
        if (was[v * 2] === shoreVertices[v * 2] && was[v * 2 + 1] === shoreVertices[v * 2 + 1]) continue;
        const vx = v % VW, vy = (v / VW) | 0;
        if (vx < x0) x0 = vx; if (vx > x1) x1 = vx; if (vy < y0) y0 = vy; if (vy > y1) y1 = vy;
      }
      t.shoreMoved = !was || was.length !== shoreVertices.length ? { x0: X0, y0: Y0, x1: X0 + TW - 1, y1: Y0 + TH - 1 }
        : x1 < 0 ? null : { x0: x0 - 1 + X0, y0: y0 - 1 + Y0, x1: x1 + X0, y1: y1 + Y0 };
      t.shoreVertices0 = shoreVertices;
    } else {
      // (written in place: the old values are read before each is written)
      const s = t.shoreVertices;
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (let vy = CX.y0; vy <= CX.y1; vy++) for (let vx = CX.x0; vx <= CX.x1; vx++) {
        const v = vy * VW + vx, L = cornerLevel[v], a = Number.isFinite(L) ? Math.fround(L * LEVEL) : 0, b = Number.isFinite(L) ? 1 : 0;
        if (s[v * 2] === a && s[v * 2 + 1] === b) continue;
        s[v * 2] = a; s[v * 2 + 1] = b;
        if (vx < x0) x0 = vx; if (vx > x1) x1 = vx; if (vy < y0) y0 = vy; if (vy > y1) y1 = vy;
      }
      t.shoreMoved = x1 < 0 ? null : { x0: x0 - 1 + X0, y0: y0 - 1 + Y0, x1: x1 + X0, y1: y1 + Y0 };
    }
  }
  // the tiles under the drawn sheet, the bank ring included (reshape: is an edit near the water)
  for (let ty = X.y0; ty <= X.y1; ty++) for (let tx = X.x0; tx <= X.x1; tx++) { const k = ty * TW + tx; c.near[k] = level[k] === level[k] ? 1 : 0; }
  t.waterNear = c.near;
  const tiles = [], cells = [];
  for (let k = 0; k < TW * TH; k++) if (level[k] === level[k]) { tiles.push(k); cells.push([k % TW + X0, Math.floor(k / TW) + Y0]); }
  const waterAt = (x, z) => {
    const xx = Math.floor(x), zz = Math.floor(z);
    if ([vLevel(xx, zz), vLevel(xx + 1, zz), vLevel(xx + 1, zz + 1), vLevel(xx, zz + 1)].some(v => !Number.isFinite(v))) return NaN;
    return surfaceHeight(vLevel, x, z) * LEVEL;
  };
  t.waterAt = waterAt; // (the drawn surface at a point, NaN off the water: animals swim by it)
  // Only scatter where all four corners share a water sheet (bankDetails). Near the change every cell is
  // scattered again (its stones read the water and ground of the tiles round it); elsewhere a cell keeps
  // its stones unless what they're read from changed (Riverbanks.scatter).
  {
    const R = grow(X, 2, TW, TH);
    const redo = full ? null : (x, z) => { const tx = x - X0, ty = z - Y0; return tx >= R.x0 && tx <= R.x1 && ty >= R.y0 && ty <= R.y1; };
    t.banks.bind(w, t.border, cells, waterAt, t.bankTerrainAt, !!t.catalog.definition.look.underwater, redo);
  }

  // 5. Which way the water runs, worked out for every stretch (cheap: only the water's own tiles)
  const dirty = new Uint8Array(nv); // (corners whose vertex values must be worked out again)
  const markTile = k => { const v = ((k / TW) | 0) * VW + k % TW; dirty[v] = dirty[v + 1] = dirty[v + VW] = dirty[v + VW + 1] = 1; };
  const moving = k => kind[k] === T.CREEK || kind[k] === T.RIVER;
  const wetAt = (tx, ty) => tx >= 0 && ty >= 0 && tx < TW && ty < TH && wet[ty * TW + tx] && moving(ty * TW + tx);
  {
    const tileFlow = new Float32Array(TW * TH * 2), tileBend = new Float32Array(TW * TH);
    channelFlow(w, TW, TH, X0, Y0, tiles, kind, wet, moving, wetAt, tileFlow, tileBend);
    const of = c.tileFlow, ob = c.tileBend;
    if (!full) for (let k = 0; k < TW * TH; k++) if (tileFlow[k * 2] !== of[k * 2] || tileFlow[k * 2 + 1] !== of[k * 2 + 1] || tileBend[k] !== ob[k]) markTile(k);
    c.tileFlow = tileFlow; c.tileBend = tileBend;
  }
  // (the window's tiles: their levels, kinds and wetness changed; and one corner past, as the rounded
  // waterline reads the ground a corner round)
  for (let vy = Math.max(0, CX.y0 - 1); vy <= Math.min(TH, CX.y1 + 1); vy++) for (let vx = Math.max(0, CX.x0 - 1); vx <= Math.min(TW, CX.x1 + 1); vx++) dirty[vy * VW + vx] = 1;
  // Shared corner samples avoid visible seams in flow and bend highlights.
  const vertexFlow = c.vertexFlow, tileFlow = c.tileFlow, tileBend = c.tileBend;
  for (let vy = 0; vy <= TH; vy++) for (let vx = 0; vx <= TW; vx++) {
    const vi = vy * VW + vx;
    if (!full && !dirty[vi]) continue;
    let fx = 0, fy = 0, b = 0, n = 0;
    for (const [dx, dy] of AROUND) {
      const tx = vx + dx, ty = vy + dy;
      if (tx < 0 || ty < 0 || tx >= TW || ty >= TH) continue;
      const k = ty * TW + tx;
      if (!Number.isFinite(level[k])) continue;
      fx += tileFlow[k * 2]; fy += tileFlow[k * 2 + 1]; b += tileBend[k]; n++;
    }
    const ax = Math.fround(n ? fx / n : 0), ay = Math.fround(n ? fy / n : 0);
    c.fChanged[vi] = ax !== vertexFlow[vi * 3] || ay !== vertexFlow[vi * 3 + 1] ? 1 : 0;
    vertexFlow[vi * 3] = ax; vertexFlow[vi * 3 + 1] = ay; vertexFlow[vi * 3 + 2] = n ? b / n : 0;
  }
  // Falling water: how far the sheet drops across each moving tile, so a waterfall (landform.js
  // creekFalls) runs white over its lip and foams out across the pool at its foot, and a steep
  // cascade shows a little white. Each corner takes the most of the tiles round it.
  {
    const tileDrop = new Float32Array(TW * TH);
    for (const k of tiles) {
      if (!moving(k)) continue;
      const x = (k % TW) + X0, y = Math.floor(k / TW) + Y0;
      // (from one edge to the edge opposite, as isFall measures the bed: not the tilt across the stream)
      const l = [vLevel(x, y), vLevel(x + 1, y), vLevel(x + 1, y + 1), vLevel(x, y + 1)];
      tileDrop[k] = Math.max(Math.abs(l[0] + l[1] - l[2] - l[3]), Math.abs(l[0] + l[3] - l[1] - l[2])) / 2;
    }
    if (!full) for (let k = 0; k < TW * TH; k++) if (tileDrop[k] !== c.tileDrop[k]) markTile(k);
    c.tileDrop = tileDrop;
  }
  const tileDrop = c.tileDrop;
  const vWhite = (vx, vy) => {
    let d = 0;
    for (const [dx, dy] of AROUND) {
      const tx = vx - X0 + dx, ty = vy - Y0 + dy;
      if (tx >= 0 && ty >= 0 && tx < TW && ty < TH) d = Math.max(d, tileDrop[ty * TW + tx]);
    }
    return d <= 0.9 ? 0 : Math.min(1, (d - 0.9) / 0.8); // (a steep reach's 0.6 a tile stays clear; a fall's 2 runs white)
  };
  // A one-tile creek's outline follows a smooth ribbon along its course, not the tiles (creek-ribbon.js,
  // 0055): where the shader's edge is cut, off the map's corners, nothing is (RIBBON_CAP). It reads the
  // creek's tiles (and a creek tile's own bed), so it's found again only when they may have changed.
  const RW = w.w + 1;
  // (a creek tile's own corners moved: found again only if that tile's part in it changed, ribbonKind)
  if (full || c.landKey !== landKey || !c.ribbon || [...creekCorner].some(i => ribbonKind(w, i) !== c.ribbon.kind[i])) {
    const was = c.ribbon;
    c.ribbon = creekRibbon(w);
    if (!full && was) for (let k = 0; k < was.field.length; k++) if (was.field[k] !== c.ribbon.field[k] || was.bed[k] !== c.ribbon.bed[k]) {
      const vx = k % RW, vy = (k / RW) | 0; dirty[(vy - Y0) * VW + vx - X0] = 1;
    }
  }
  c.landKey = landKey;
  const ribbon = c.ribbon;
  // blend the water's colour across tile corners, so pond, marsh and creek shade into each other
  const vColor = (vx, vy) => {
    const out = [0, 0, 0, 0]; let n = 0;
    for (const [dx, dy] of AROUND) {
      const tx = vx - X0 + dx, ty = vy - Y0 + dy;
      if (tx < 0 || ty < 0 || tx >= TW || ty >= TH) continue;
      const k = ty * TW + tx;
      if (level[k] !== level[k]) continue;
      const cc = COL[kind[k]];
      for (let e = 0; e < 4; e++) out[e] += cc[e];
      n++;
    }
    return n ? out.map(v => v / n) : COL[T.POND];
  };
  // the ground at a corner smoothed over its neighbours (1-2-1 each way): the water shader
  // rounds the waterline's tile-sized steps against it
  const smooth = (vx, vy) => {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += w.vert(vx + dx, vy + dy) * (2 - Math.abs(dx)) * (2 - Math.abs(dy));
    return s / 16;
  };
  const present = vi => {
    const cx = vi % VW, cy = (vi / VW) | 0;
    for (const [dx, dy] of AROUND) { const tx = cx + dx, ty = cy + dy; if (tx >= 0 && ty >= 0 && tx < TW && ty < TH && level[ty * TW + tx] === level[ty * TW + tx]) return true; }
    return false;
  };
  // 6. each corner's vertex values
  const { cY, cCol, cDep, cRound, cRib, cWhite } = c, northRibbon = c.northRibbon;
  for (let vi = 0; vi < nv; vi++) {
    if (!full && !dirty[vi]) continue;
    if (!present(vi)) continue;
    const vx = vi % VW + X0, vy = ((vi / VW) | 0) + Y0;
    // (the pond model's water too shares its level at each corner and rounds its waterline like
    // any pond: drawn tile by tile at its own level, it ended in hard steps at the tile lines)
    const cc = vColor(vx, vy), lv = vLevel(vx, vy);
    cY[vi] = lv * LEVEL;
    cDep[vi] = lv - w.vert(vx, vy); cRound[vi] = lv - smooth(vx, vy);
    {
      const nr = northRibbon.get(vy * 100000 + vx) ?? RIBBON_CAP * RIBBON_K;
      cRib[vi] = w.inb(vx, vy) || (vx === w.w && vy >= 0 && vy <= w.h) || (vy === w.h && vx >= 0 && vx <= w.w) ? ribbon.edge(vy * RW + vx, cDep[vi]) : nr;
      // (on the fence row only where no farm water meets the corner: the border's water spilled over the
      // farm's bare corners there; a two-tile creek's or a pond's own corners keep the farm's edge)
      if (vy === 0 && !farmWetFence(vx)) cRib[vi] = Math.min(cRib[vi], nr);
      // (the farm creek's last NORTH_JOIN rows, where its own ribbon governs, near the line: the line bends
      // there into the creek beyond, so they're drawn by it, with the farm ribbon's bed guard: never hiding
      // water deeper than RIBBON_DEEP on the creek's own corners)
      else if (vy >= 0 && vy <= NORTH_JOIN && vx >= 0 && vx <= w.w && northRibbon.has(vy * 100000 + vx) && nr > -RIBBON_K && ribbon.field[vy * RW + vx] < RIBBON_CAP) {
        const b = ribbon.bed[vy * RW + vx];
        cRib[vi] = b ? Math.max(nr, cDep[vi] - (b === 2 ? RIBBON_DEEP_HEAD : RIBBON_DEEP)) : nr;
      }
    }
    // (the fence row's corners too, beside the creek beyond it: its bed drops a couple of levels in that
    // row on PNW, and full white there read as a flat pale apron at the fence, Cole 2026-11-25)
    cWhite[vi] = vy < 0 || (vy === 0 && northRibbon.has(vx)) ? Math.min(OUTSIDE_WHITE, vWhite(vx, vy)) : vWhite(vx, vy);
    cCol[vi * 4] = lin(cc[0]); cCol[vi * 4 + 1] = lin(cc[1]); cCol[vi * 4 + 2] = lin(cc[2]); cCol[vi * 4 + 3] = vWet(vx, vy) ? cc[3] : 0;
  }

  // 7. the current's coordinates (flowCoords), one stretch of flowing corners at a time: in a patch only
  // the stretches holding a corner whose flow or place in the mesh changed
  const flowing = vi => present(vi) && Math.hypot(vertexFlow[vi * 3], vertexFlow[vi * 3 + 1]) >= 0.01;
  // (a corner's first vertex in the mesh: the tiles round it in row order, and its place in a tile's six)
  const rank = vi => {
    const cx = vi % VW, cy = (vi / VW) | 0;
    for (const [dx, dy, s] of [[-1, -1, 1], [0, -1, 4], [-1, 0, 2], [0, 0, 0]]) {
      const tx = cx + dx, ty = cy + dy, k = ty * TW + tx;
      if (tx >= 0 && ty >= 0 && tx < TW && ty < TH && level[k] === level[k]) return k * 6 + s;
    }
    return -1;
  };
  {
    const { comp, comps, cCur, cRank, fChanged } = c;
    const starts = [];
    if (full) { for (let vi = 0; vi < nv; vi++) { cRank[vi] = rank(vi); if (flowing(vi)) starts.push(vi); } }
    else for (let vi = 0; vi < nv; vi++) if (dirty[vi]) {
      // (a stretch is worked out again only if one of its corners' flow, or place in the mesh, changed)
      const r0 = rank(vi);
      if (!fChanged[vi] && r0 === cRank[vi]) continue;
      cRank[vi] = r0;
      const r = comp[vi];
      if (r >= 0 && comps.has(r)) { for (const u of comps.get(r)) { comp[u] = -1; if (cCur[u * 2] || cCur[u * 2 + 1]) { cCur[u * 2] = cCur[u * 2 + 1] = 0; dirty[u] = 1; } starts.push(u); } comps.delete(r); }
      else { comp[vi] = -1; if (cCur[vi * 2] || cCur[vi * 2 + 1]) { cCur[vi * 2] = cCur[vi * 2 + 1] = 0; } starts.push(vi); }
    }
    if (full) comps.clear();
    for (const s of starts) {
      if (comp[s] >= 0 || !flowing(s)) continue;
      const q = [s]; comp[s] = s;
      for (let h = 0; h < q.length; h++) {
        const v = q[h], vx = v % VW, vy = (v / VW) | 0;
        for (const [dx, dy] of N4) {
          const xx = vx + dx, yy = vy + dy;
          if (xx < 0 || yy < 0 || xx > TW || yy > TH) continue;
          const u = yy * VW + xx;
          if (comp[u] < 0 && flowing(u)) { comp[u] = s; q.push(u); }
        }
      }
      // (in the order the stretch's corners first appear in the mesh, as flowCoords meets them)
      const order = Float64Array.from(q, v => (cRank[v] = rank(v)) * nv + v).sort();
      for (let j = 0; j < order.length; j++) order[j] %= nv;
      relaxStretch(order, vertexFlow, VW, TW, X0, Y0, c.slot, cCur);
      for (const v of q) dirty[v] = 1;
      comps.set(s, Int32Array.from(q));
    }
  }

  // 8. the mesh: every vertex of a water tile takes its corner's values
  const tileList = Int32Array.from(tiles), old = c.tiles;
  const sameTiles = !full && old && old.length === tileList.length && old.every((k, i) => k === tileList[i]);
  c.tiles = tileList;
  const prev = t.water;
  let g, lo = 0, hi = tileList.length - 1;
  if (sameTiles) {
    g = prev.geometry;
    lo = Infinity; hi = -1;
    for (let i = 0; i < tileList.length; i++) {
      const k = tileList[i], v = ((k / TW) | 0) * VW + k % TW;
      if (dirty[v] || dirty[v + 1] || dirty[v + VW] || dirty[v + VW + 1]) { if (i < lo) lo = i; hi = i; }
    }
  } else {
    const n = tileList.length * 6;
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const nor = new Float32Array(n * 3); for (let v = 0; v < n; v++) nor[v * 3 + 1] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    g.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aFlow', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('aCurrent', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('aBend', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aQual', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aRound', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aWhite', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aRibbon', new THREE.BufferAttribute(new Float32Array(n), 1));
  }
  if (hi >= lo) {
    const A = g.attributes, pos = A.position.array, col = A.color.array, dep = A.aDepth.array, flow = A.aFlow.array, cur = A.aCurrent.array;
    const bend = A.aBend.array, round = A.aRound.array, white = A.aWhite.array, rib = A.aRibbon.array;
    const { cCur } = c;
    for (let i = lo; i <= hi; i++) {
      const k = tileList[i], x = k % TW, y = (k / TW) | 0;
      let od = i * 6;
      for (const [vx, vy] of [[x, y], [x + 1, y + 1], [x + 1, y], [x, y], [x, y + 1], [x + 1, y + 1]]) {
        const vi = vy * VW + vx;
        pos[od * 3] = vx + X0; pos[od * 3 + 1] = cY[vi]; pos[od * 3 + 2] = vy + Y0;
        col[od * 4] = cCol[vi * 4]; col[od * 4 + 1] = cCol[vi * 4 + 1]; col[od * 4 + 2] = cCol[vi * 4 + 2]; col[od * 4 + 3] = cCol[vi * 4 + 3];
        dep[od] = cDep[vi]; round[od] = cRound[vi]; rib[od] = cRib[vi]; white[od] = cWhite[vi];
        flow[od * 2] = vertexFlow[vi * 3]; flow[od * 2 + 1] = vertexFlow[vi * 3 + 1]; bend[od] = vertexFlow[vi * 3 + 2];
        cur[od * 2] = cCur[vi * 2]; cur[od * 2 + 1] = cCur[vi * 2 + 1];
        od++;
      }
    }
    if (sameTiles) {
      for (const name of ['position', 'color', 'aDepth', 'aFlow', 'aCurrent', 'aBend', 'aRound', 'aWhite', 'aRibbon']) {
        const a = A[name]; a.addUpdateRange(lo * 6 * a.itemSize, (hi - lo + 1) * 6 * a.itemSize); a.needsUpdate = true;
      }
      g.boundingSphere = null; // (recounted for culling when next drawn)
    }
  }
  if (prev) { t.scene.remove(prev); if (prev.geometry !== g) prev.geometry.dispose(); }
  t.water = new THREE.Mesh(g, t.waterMat);
  t.water.renderOrder = 2;
  t.scene.add(t.water);
  t.buildFalls(tiles, tileDrop, wet, vLevel, vColor, vertexFlow);
  t.refreshWaterQuality();
  t.waterPatch = full ? 'whole' : 'patch';
}

// Which way the water runs: downstream along the channel network, so a creek flows into the
// river it joins and the river runs on past the mouth (no eddy at the confluence). Each
// connected stretch of creek and river drains out of the side of the view where its bed is
// lowest; the distance back from that exit, through the channel, gives every tile a
// downstream direction, which is then smoothed so bends and junctions turn gradually.
// (Over the water's tiles only, the bank ring included, which is cheap; so it's done whole every build.)
function channelFlow(w, TW, TH, X0, Y0, tiles, kind, wet, moving, wetAt, tileFlow, tileBend) {
  const dist = new Int32Array(TW * TH).fill(-1), comp = new Int32Array(TW * TH).fill(-1);
  const bedOf = k => Math.min(...w.corners((k % TW) + X0, Math.floor(k / TW) + Y0));
  for (const k0 of tiles) {
    if (!moving(k0) || comp[k0] >= 0) continue;
    const members = [k0]; comp[k0] = k0;
    for (let h = 0; h < members.length; h++) {
      const k = members[h], tx = k % TW, ty = (k / TW) | 0;
      for (const [dx, dy] of N4) if (wetAt(tx + dx, ty + dy)) { const n = (ty + dy) * TW + tx + dx; if (comp[n] < 0) { comp[n] = k0; members.push(n); } }
    }
    // the exit: the view's edge where this stretch's bed is lowest (or its lowest tile)
    const side = k => { const tx = k % TW, ty = (k / TW) | 0; return tx === 0 ? 0 : tx === TW - 1 ? 1 : ty === 0 ? 2 : ty === TH - 1 ? 3 : -1; };
    let exitSide = -1, low = Infinity, lowest = members[0];
    for (const k of members) { const b = bedOf(k); if (b < bedOf(lowest)) lowest = k; if (side(k) >= 0 && b < low) { low = b; exitSide = side(k); } }
    const q = exitSide >= 0 ? members.filter(k => side(k) === exitSide) : [lowest];
    for (const k of q) dist[k] = 0;
    for (let h = 0; h < q.length; h++) {
      const k = q[h], tx = k % TW, ty = (k / TW) | 0;
      for (const [dx, dy] of N4) if (wetAt(tx + dx, ty + dy)) { const n = (ty + dy) * TW + tx + dx; if (dist[n] < 0) { dist[n] = dist[k] + 1; q.push(n); } }
    }
  }
  // downhill in that distance field, over all eight neighbours
  let fl = new Float32Array(TW * TH * 2);
  for (const k of tiles) {
    if (!moving(k) || dist[k] < 0) continue;
    const tx = k % TW, ty = (k / TW) | 0;
    let fx = 0, fy = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || !wetAt(tx + dx, ty + dy)) continue;
      const n = (ty + dy) * TW + tx + dx, drop = dist[k] - dist[n];
      if (dist[n] < 0 || !drop) continue;
      const l = Math.hypot(dx, dy); fx += dx / l * drop / l; fy += dy / l * drop / l;
    }
    if (!dist[k]) { // (at the exit itself: straight out of the view)
      const e = (tx === 0 ? [-1, 0] : tx === TW - 1 ? [1, 0] : ty === 0 ? [0, -1] : ty === TH - 1 ? [0, 1] : [0, 0]);
      fx += e[0]; fy += e[1];
    }
    const l = Math.hypot(fx, fy) || 1; fl[k * 2] = fx / l; fl[k * 2 + 1] = fy / l;
  }
  // smooth along the channel so the current turns gradually at bends and mouths
  for (let pass = 0; pass < 3; pass++) {
    const nx = new Float32Array(fl.length);
    for (const k of tiles) {
      if (!moving(k) || !wet[k]) continue;
      const tx = k % TW, ty = (k / TW) | 0;
      let fx = fl[k * 2] * 2, fy = fl[k * 2 + 1] * 2;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && wetAt(tx + dx, ty + dy)) {
        const n = (ty + dy) * TW + tx + dx; fx += fl[n * 2]; fy += fl[n * 2 + 1];
      }
      const l = Math.hypot(fx, fy) || 1; nx[k * 2] = fx / l; nx[k * 2 + 1] = fy / l;
    }
    fl = nx;
  }
  for (const k of tiles) {
    if (!moving(k)) continue;
    const tx = k % TW, ty = (k / TW) | 0, speed = kind[k] === T.CREEK ? 0.7 : 1;
    let fx = fl[k * 2], fy = fl[k * 2 + 1];
    if (!wet[k]) { // (the bank ring: carries on the current of the water beside it)
      fx = fy = 0;
      for (const [dx, dy] of N4) if (wetAt(tx + dx, ty + dy)) { const n = (ty + dy) * TW + tx + dx; fx += fl[n * 2]; fy += fl[n * 2 + 1]; }
      const l = Math.hypot(fx, fy) || 1; fx /= l; fy /= l;
    }
    tileFlow[k * 2] = fx * speed; tileFlow[k * 2 + 1] = fy * speed;
    const h = Number(wetAt(tx - 1, ty)) + Number(wetAt(tx + 1, ty));
    const v = Number(wetAt(tx, ty - 1)) + Number(wetAt(tx, ty + 1));
    tileBend[k] = h && v && h + v <= 3 ? 1 : 0;
  }
}
