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
import { swimDepth, deepWaterNear, fishDepth } from './waterline.js';

export const HOP = 0.35;
const STEP = 0.07; // (spacing of the depth samples along a step: a fifth of the hop)
const IN = 0.42;   // (a swimming point stays this far from its tile's centre, inside the tile)

const caches = new WeakMap();
export const forgetSwimRoutes = w => caches.delete(w);
function cacheFor(game, lim) {
  const w = game.world;
  let c = caches.get(w);
  if (!c || c.day !== game.day || c.n !== w.n) caches.set(w, c = { day: game.day, n: w.n, byLim: new Map() });
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
    if (swimDepth(w, x0 + (x1 - x0) * s / k, y0 + (y1 - y0) * s / k) >= lim) dry = 0;
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
  return !!M && swimDepth(w, M[0], M[1]) >= lim && clearRun(w, P[0], P[1], M[0], M[1], lim) && clearRun(w, M[0], M[1], Q[0], Q[1], lim);
}

// (which of the eight ways from tile i the next tile j lies)
const dir = (W, i, j) => { const d = ((j / W | 0) - (i / W | 0) + 1) * 3 + j % W - i % W + 1; return d > 4 ? d - 1 : d; };

// The depth a fish's route keeps to: its own (fishDepth), or, stranded shallower than that, the
// water it is in (as riverFishStep lets it swim on across water as shallow as where it is).
const limFor = (w, a, def) => { const need = fishDepth(def), here = swimDepth(w, a.x, a.y); return here >= need ? need : Math.max(0.01, Math.floor(here * 100) / 100); };

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
export function swimsBetween(w, i, j, lim) {
  const e = { has: {}, pt: {} }, P = wetPoint(w, e, lim, i), Q = wetPoint(w, e, lim, j);
  return !!P && !!Q && swims(w, lim, P, Q, i, j);
}
