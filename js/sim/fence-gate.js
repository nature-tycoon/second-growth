// Animals waiting at a boundary fence (part of the Wildlife class's arrivals, wildlife-population.js).
//
// A group that comes to the property's edge and finds the old boundary fence in the way used to
// vanish with a warning. Now it stands a while just beyond the fence, at the forest edge, facing in,
// and walks in if a gap opens near it; otherwise it drifts back into the forest after a week or two.
// Real deer do exactly this along a fence line. While waiting the animals are outside the farm:
// `leaving` (so they're left out of the population, prey lists, herds and watch mode, as a departing
// animal is) and handled here alone, the way a dormant animal is handled by animal-dormancy.js.
//
// a.gate = { edge: 'N'|'E'|'W', at: the edge tile's column (N) or row (E, W), until: game day it gives
//            up, entering: set once it's walking in (k: the gap it uses, depth: tiles in), until it's on the map }

import { passable } from './animal-terrain.js';
import { facePoint } from './animal-positioning.js';
import { simRandom } from './sim-random.js';
import { travelSpeed } from './climb-pace.js';

const REACH = 4;          // how far along the fence (tiles) a waiting animal notices a gap
const OUT = [1.15, 1.85]; // how far beyond the edge it stands (leaving animals are removed past 2)
const WAIT = [8, 14];     // game days it waits before going back into the forest
const HOLD_MAX = 90;      // a first visit's opening holds them while its prompt is up, at most this long

const edgeTile = (w, edge, k) => edge === 'N' ? w.idx(k, 0) : edge === 'E' ? w.idx(w.w - 1, k) : w.idx(0, k);
const inward = edge => edge === 'N' ? [0, 1] : edge === 'E' ? [-1, 0] : [1, 0];

// Stand a group of n just beyond edge tile `at` (column for N, row for E and W). Returns the animals.
export function waitAtFence(wl, def, n, edge, at) {
  const w = wl.game.world, out = [], [ix, iy] = inward(edge);
  const until = wl.game.day + WAIT[0] + simRandom() * (WAIT[1] - WAIT[0]);
  for (let k = 0; k < n; k++) {
    const a = wl.spawn(def, edge === 'N' ? at : edge === 'E' ? w.w - 1 : 0, edge === 'N' ? 0 : at, { outside: true });
    const along = (k - (n - 1) / 2) * 0.9 + (simRandom() - 0.5) * 0.4, back = OUT[0] + simRandom() * (OUT[1] - OUT[0]);
    if (edge === 'N') { a.x = at + 0.5 + along; a.y = -back; }
    else if (edge === 'E') { a.x = w.w + back; a.y = at + 0.5 + along; }
    else { a.x = -back; a.y = at + 0.5 + along; }
    a.leaving = true; a.state = 'idle'; a.wait = 1e9; a.path = null;
    a.gate = { edge, at, until, entering: false };
    facePoint(a, a.x + ix * 4 + (simRandom() - 0.5) * 2, a.y + iy * 4 + (simRandom() - 0.5) * 2);
    out.push(a);
  }
  return out;
}

// The nearest edge tile within REACH of the animal's spot that it can now walk through, or -1.
function gap(w, a, g) {
  const span = g.edge === 'N' ? w.w : w.h;
  for (let d = 0; d <= REACH; d++) for (const s of d ? [-1, 1] : [1]) {
    const k = g.at + d * s;
    if (k < 0 || k >= span) continue;
    const i = edgeTile(w, g.edge, k);
    if (passable(w, i, a)) return k;
  }
  return -1;
}

// One frame for an animal with a.gate. True when it's handled here (waiting, or still stepping in
// from beyond the edge), false to carry on with the usual update (on the map, or gone back to the forest).
export function gateStep(wl, a, def, dt) {
  const g = a.gate, w = wl.game.world, game = wl.game;
  if (g.entering) return enterStep(wl, a, def, dt);
  const k = gap(w, a, g);
  if (k >= 0) { admit(wl, a, def, k); return enterStep(wl, a, def, dt); }
  const held = game.flags.opening?.stage === 'fence' && game.day < g.until + HOLD_MAX;
  if (!held && game.day >= g.until) { // gave up: back into the forest the way it came
    a.gate = null;
    const [ix, iy] = inward(g.edge);
    a.tx = a.x - ix * 3; a.ty = a.y - iy * 3;
    a.state = 'leave'; a.leaveWait = simRandom() * 2; a.path = null; a.wait = 0; a.leaveDays = 0;
    return false;
  }
  a.phase += dt * 6 * 0.3; // (standing: a slow sway, see Wildlife.update)
  return true;
}

// The path in: from the gap's edge tile straight in a few tiles, while the ground allows.
function pathIn(w, a, g) {
  const [ix, iy] = inward(g.edge), path = [];
  let x = g.edge === 'N' ? g.k : g.edge === 'E' ? w.w - 1 : 0, y = g.edge === 'N' ? 0 : g.k;
  for (let s = 0; s < g.depth && w.inb(x, y) && passable(w, w.idx(x, y), a); s++, x += ix, y += iy) path.push(w.idx(x, y));
  return path.reverse(); // (a path is walked from its end)
}

// Stepping in from beyond the edge, done here rather than by the usual walk: off the map there are
// no tiles to route or stand on (pathTo and the stall recovery need the map). Once on the map it
// walks the rest of its path as any animal does, and from there on it's an ordinary animal.
function enterStep(wl, a, def, dt) {
  const w = wl.game.world, g = a.gate;
  if (w.inb(Math.floor(a.x), Math.floor(a.y))) {
    // on the farm now: counted, found, and an ordinary animal from here on (until then it stayed
    // `leaving`, so no hunt or herd picked a target off the map)
    a.gate = null; a.leaving = false;
    const st = wl.state[def.index];
    st.pop++;
    wl.spacingDirty = true;
    if (!st.discovered) { st.discovered = true; wl.game.onDiscover(def, a); }
    if (!a.path?.length) a.path = pathIn(w, a, g);
    a.state = a.path.length ? 'walk' : 'idle'; a.wait = 0;
    return false;
  }
  const i = g.edge === 'N' ? w.idx(g.k, 0) : g.edge === 'E' ? w.idx(w.w - 1, g.k) : w.idx(0, g.k);
  if (!passable(w, i, a)) { a.gate = { ...g, entering: false }; a.state = 'idle'; a.path = null; return true; } // (fenced again: an undo)
  if (!a.path?.length) a.path = pathIn(w, a, g); // (also after a reload, which drops paths)
  a.state = 'walk';
  const tx = i % w.w + 0.5 + (g.edge === 'N' ? hashOff(a) : 0), ty = ((i / w.w) | 0) + 0.5 + (g.edge === 'N' ? 0 : hashOff(a));
  const d = Math.hypot(tx - a.x, ty - a.y), step = Math.min(d, travelSpeed(def) * dt * (a.pace || 1));
  if (d > 1e-6) { a.x += (tx - a.x) / d * step; a.y += (ty - a.y) / d * step; facePoint(a, tx, ty); }
  a.phase += dt * 6;
  return true;
}
const hashOff = a => ((a.id * 0.618) % 1 - 0.5) * 0.5;

// Through the gap and a few tiles in, staggered so a group strings through one after another.
function admit(wl, a, def, k) {
  const w = wl.game.world, g = a.gate;
  g.k = k; g.depth = 5 + Math.floor(simRandom() * 4); g.entering = true;
  a.path = pathIn(w, a, g);
  a.state = 'walk'; a.wait = 0; a.leaveWait = 0; a.leaveDays = 0;
  a.pace = 0.75 + simRandom() * 0.35;
}

// Animals of this species already waiting at a fence.
export const waitingAtFence = (wl, def) => wl.agents.some(a => a.sp === def.index && a.gate && !a.gate.entering);
