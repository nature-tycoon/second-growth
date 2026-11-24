// Routes a river fish can swim (decision 0034): a route only steps from one tile to the next where
// the water between them is deep enough for the fish all the way, bar a lip no wider than the HOP
// it leaps (riverFishStep). Without it, a fish's route between two pools could cross a strip of
// ground standing above the water (a marsh tile with its north half dry); it pressed at the edge
// for days and the ones behind it piled up (2026-11-19). Real fish keep to connected water.
//
// Each tile's swimming point is its centre, or the nearest point in it with water deep enough; a
// step joins the two points in a straight line, or through a deep point by the edge they share.
// Edges are worked out when first asked and kept for the game day (levels move day by day; a
// player's edit starts them afresh: forgetSwimRoutes), per depth a fish needs. An edge a fish
// still couldn't get along for shallow water is marked shut for the day (blockSwim, from
// recoverMovement): it turns to other water rather than pressing.
import { swimDepth, deepWaterNear, fishDepth, tileWaterLevel, groundAt } from './waterline.js';
import { isFall } from '../maps/landform.js';
import { T } from '../config.js';

export const HOP = 0.35;
const STEP = 0.07; // (spacing of the depth samples along a step: a fifth of the hop)
const IN = 0.42;   // (a swimming point stays this far from its tile's centre, inside the tile)

// The water a river fish can swim through on its way (not where it rests: swimDepth). On a creek
// tile the drawn sheet slopes down from the water upstream (terrain.js: each drawn corner takes the
// highest level of the water tiles round it), while swimDepth is the tile's own flat sheet, which
// on a steep reach leaves the upper half of every tile "dry". There the creek runs thin and fast
// over its bed, a riffle a trout swims up and drops down. So here a creek tile's corners each take
// the highest level of the creek tiles round them, the drawing's sheet. A fall keeps its own flat
// sheet and lends its level to none (0050: no fish climbs one). Without this, every tile of a reach
// dropping more than about 0.4 a tile was a wall both ways, longer than the hop: below PNW's fall
// the steep reach sealed the plunge pool off, so fish in it never left and none below got in
// (2026-11-23). Elsewhere (ponds, marsh, the river, a fall) it is swimDepth.
// (only from a creek tile beside it that isn't a fall, stands at most RUN_STEP over the tile's own
// water (a chute steeper than that, near a fall, stays a wall) and is on the same side of a dam:
// a beaver pond doesn't lend its level to the creek below the dam)
const RUN_STEP = 0.7;
const runCreek = (w, i) => w.terrain[i] === T.CREEK && !isFall(w, i) ? tileWaterLevel(w, i) : null;
const runs = new WeakMap();
function cornerRun(w, vx, vy, i, own) {
  let L = own;
  const man = !!w.waterManaged?.[i];
  for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
    const x = vx + dx, y = vy + dy;
    if (!w.inb(x, y)) continue;
    const j = w.idx(x, y);
    if (j === i || !!w.waterManaged?.[j] !== man) continue;
    const l = runCreek(w, j);
    if (l != null && l > L && l <= own + RUN_STEP) L = l;
  }
  return L;
}
export function runDepth(w, fx, fy) {
  const L = runLevel(w, fx, fy);
  return L == null ? swimDepth(w, fx, fy) : L - groundAt(w, fx, fy);
}
// The running water's level at a point on a creek tile that isn't a fall (null elsewhere): what
// runDepth reads, and where a fish crossing a riffle is drawn (actors-swim.js). Never over the drawn
// sheet, whose corners take the highest level of all the water round them, uncapped.
let flat = false;
export function runLevel(w, fx, fy) {
  if (flat) return null;
  const x = Math.floor(fx), y = Math.floor(fy);
  if (!w.inb(x, y)) return null;
  const i = w.idx(x, y), own = runCreek(w, i);
  if (own == null) return null;
  const c = runCache(w, i, own), u = fx - x, v = fy - y;
  return u >= v ? c[0] + (c[1] - c[0]) * u + (c[2] - c[1]) * v : c[0] + (c[2] - c[3]) * u + (c[3] - c[0]) * v; // (groundAt's two triangles)
}
// (a creek tile's four run levels, worked out once until the water or the land changes: a fish asks
// every step, and a route search samples every 0.07 of a tile)
function runCache(w, i, own) {
  let c = runs.get(w);
  if (!c || c.n !== w.n) runs.set(w, c = { n: w.n, at: new Float64Array(w.n).fill(NaN), L: new Float32Array(w.n * 4) });
  const k = i * 4;
  if (c.at[i] !== own) {
    const x = i % w.w, y = (i / w.w) | 0;
    c.L[k] = cornerRun(w, x, y, i, own); c.L[k + 1] = cornerRun(w, x + 1, y, i, own);
    c.L[k + 2] = cornerRun(w, x + 1, y + 1, i, own); c.L[k + 3] = cornerRun(w, x, y + 1, i, own);
    c.at[i] = own;
  }
  return c.L.subarray(k, k + 4);
}

const caches = new WeakMap();
export const forgetSwimRoutes = w => { caches.delete(w); runs.delete(w); };
function cacheFor(game, lim) {
  const w = game.world;
  let c = caches.get(w);
  if (!c || c.day !== game.day || c.n !== w.n) { caches.set(w, c = { day: game.day, n: w.n, byLim: new Map() }); runs.delete(w); } // (levels move by the day)
  let e = c.byLim.get(lim);
  if (!e) c.byLim.set(lim, e = { pt: new Float32Array(w.n * 2), has: new Uint8Array(w.n), edge: new Uint8Array(w.n * 8) });
  return e;
}

// The point in tile i deep enough (lim) for a fish, or null: its centre, else the nearest on a
// 0.14 grid inside the tile.
function wetPoint(w, e, lim, i) {
  if (e.has[i]) return e.has[i] === 1 ? [e.pt[i * 2], e.pt[i * 2 + 1]] : null;
  const cx = i % w.w + 0.5, cy = (i / w.w | 0) + 0.5;
  let best = null, bd = Infinity;
  if (swimDepth(w, cx, cy) >= lim) best = [cx, cy];
  else for (let dy = -IN; dy <= IN + 1e-9; dy += 0.14) for (let dx = -IN; dx <= IN + 1e-9; dx += 0.14) {
    const d = dx * dx + dy * dy;
    if (d < bd && swimDepth(w, cx + dx, cy + dy) >= lim) { bd = d; best = [cx + dx, cy + dy]; }
  }
  e.has[i] = best ? 1 : 2;
  if (best) { e.pt[i * 2] = best[0]; e.pt[i * 2 + 1] = best[1]; }
  return best;
}

// Whether a fish can swim straight from (x0, y0) to (x1, y1): no stretch shallower than lim
// longer than the hop.
function clearRun(w, x0, y0, x1, y1, lim) {
  const L = Math.hypot(x1 - x0, y1 - y0), k = Math.max(1, Math.ceil(L / STEP));
  let dry = 0;
  for (let s = 1; s < k; s++) {
    if (runDepth(w, x0 + (x1 - x0) * s / k, y0 + (y1 - y0) * s / k) >= lim) dry = 0;
    else if ((dry += L / k) > HOP) return false;
  }
  return true;
}

function swims(w, lim, P, Q, i, j) {
  if (clearRun(w, P[0], P[1], Q[0], Q[1], lim)) return true;
  // (round a bar: through a deep point by the edge (or, diagonally, the corner) the tiles share)
  const x = i % w.w, y = i / w.w | 0, dx = j % w.w - x, dy = (j / w.w | 0) - y;
  const mx = x + 0.5 + dx * 0.5, my = y + 0.5 + dy * 0.5;
  const M = deepWaterNear(w, mx, my, HOP, lim);
  return !!M && runDepth(w, M[0], M[1]) >= lim && clearRun(w, P[0], P[1], M[0], M[1], lim) && clearRun(w, M[0], M[1], Q[0], Q[1], lim);
}

// (which of the eight ways from tile i the next tile j lies)
const dir = (W, i, j) => { const d = ((j / W | 0) - (i / W | 0) + 1) * 3 + j % W - i % W + 1; return d > 4 ? d - 1 : d; };

// The depth a fish's route keeps to: its own (fishDepth), or, stranded shallower than that, the
// water it is in (as riverFishStep lets it swim on across water as shallow as where it is).
const limFor = (w, a, def) => { const need = fishDepth(def), here = runDepth(w, a.x, a.y); return here >= need ? need : Math.max(0.01, Math.floor(here * 100) / 100); };

// For a river fish (not leaving the map), a test of whether it can swim from tile i to the next
// tile j, for a route search; null for any other animal. Steps out of the tile it is in start
// from where it is.
export function swimRoute(wl, a, def) {
  if (a.move !== 'swim' || def.reef || a.leaving) return null;
  const w = wl.game.world, W = w.w, lim = limFor(w, a, def), e = cacheFor(wl.game, lim);
  const start = w.idx(Math.floor(a.x), Math.floor(a.y)), here = [a.x, a.y];
  return (i, j) => {
    if (i === start) { const Q = wetPoint(w, e, lim, j); return !!Q && e.edge[i * 8 + dir(W, i, j)] !== 2 && swims(w, lim, here, Q, i, j); }
    const k = i * 8 + dir(W, i, j);
    if (!e.edge[k]) {
      const P = wetPoint(w, e, lim, i), Q = wetPoint(w, e, lim, j);
      e.edge[k] = e.edge[j * 8 + dir(W, j, i)] = P && Q && swims(w, lim, P, Q, i, j) ? 1 : 2;
    }
    return e.edge[k] === 1;
  };
}

// A fish couldn't get from tile i into j after all: shut that way for the rest of the day.
export function blockSwim(wl, a, def, i, j) {
  const w = wl.game.world;
  // (only when shallow water held it, riverFishStep's a.swimHeld: not a fish queued behind another)
  if (a.move !== 'swim' || def.reef || a.leaving || j == null || !a.swimHeld) return;
  if (i === j || Math.abs(i % w.w - j % w.w) > 1 || Math.abs((i / w.w | 0) - (j / w.w | 0)) > 1) return;
  const e = cacheFor(wl.game, limFor(w, a, def));
  e.edge[i * 8 + dir(w.w, i, j)] = e.edge[j * 8 + dir(w.w, j, i)] = 2;
}

// Whether a river fish needing water `lim` deep can swim from tile i to the next tile j, worked out
// afresh with no day's cache (for a change being tried before it's made: a flood's cut, 0054).
// It keeps to each tile's own flat sheet (no riffles), as before runDepth: a cut is carved only where
// the new channel holds water a fish can swim even then (creek-cutoff-check's steep bend stays uncut).
export function swimsBetween(w, i, j, lim) {
  flat = true;
  try { const e = { has: {}, pt: {} }, P = wetPoint(w, e, lim, i), Q = wetPoint(w, e, lim, j); return !!P && !!Q && swims(w, lim, P, Q, i, j); }
  finally { flat = false; }
}
