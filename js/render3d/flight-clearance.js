// Flying animals clear the treetops (decision 0024 made trees much taller than a bird's ordinary
// flight height). Plain arithmetic with no three.js, so checks can run it headless.
import { LEVEL } from '../config.js';
import { treeHeight } from './tree-stature.js';

// A crown reaches about half a tile out from its trunk: look at the tile under each sample point
// and a crown's width around it.
const AROUND = [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]];
// The top of the tallest crown (scene y) a flier at x, y is over, or will be within `ahead` tiles
// along its heading (ux, uy), so it rises before it reaches a tall tree rather than clipping it.
// (samples every 0.7 tiles along the way, so a lone crown between them isn't missed)
export function canopyTop(w, plants, x, y, ux = 0, uy = 0, ahead = 1.4) {
  let top = -Infinity;
  const n = Math.ceil(ahead / 0.7);
  for (let s = 0; s <= n; s++) for (const [ox, oy] of AROUND) {
    const t = n ? ahead * s / n : 0;
    const xi = Math.floor(x + ux * t + ox), yi = Math.floor(y + uy * t + oy);
    if (!w.inb(xi, yi)) continue;
    const i = w.idx(xi, yi);
    if (!w.tree[i]) continue;
    const h = w.heightAt(xi + 0.5, yi + 0.5) * LEVEL + treeHeight(plants[w.tree[i]]) * w.treeG[i];
    if (h > top) top = h;
  }
  return top;
}
// How far over the crowns a flier keeps (scene units; a tile is 1): a bird's body plus a little
// air, and more for a flock passing over, which holds one height for the whole crossing.
export const CANOPY_GAP = 0.2, PASSAGE_GAP = 0.8;
// Whether a flier is on its way down through the trees, where it doesn't have to clear them: a
// stoop onto prey, the last tile before it lands (a perch, the ground under the trees, a carcass),
// or the end of a vulture's spiral. Pollinators flit among the flowers, in crowns too.
export function descending(a, def, mx = 0, my = 0) {
  const kind = def.sprite.kind;
  if (kind === 'butterfly' || kind === 'bee' || kind === 'hummer' && a.state !== 'fly') return true;
  if (a.stoop > 0 || a.state === 'idle') return true; // (idle in the air: settling where it arrived)
  if (a.carry?.low) return true;
  if (a.bird?.kind === 'soar' && a.bird.carcass != null) return a.bird.t < 0.6;
  // (coming in to land: within a tile of its goal and not moving away from it)
  if (a.state === 'fly' && a.tx != null) return Math.hypot(a.tx - a.x, a.ty - a.y) < 1 && (a.tx - a.x) * mx + (a.ty - a.y) * my >= 0;
  return false;
}
// The heading a flier is travelling on, as a unit vector: the way it actually moved since it was
// last drawn (mx, my), else toward its goal while flying to one, else the way it faces.
export function flightHeading(a, mx = 0, my = 0) {
  const m = Math.hypot(mx, my);
  if (m > 1e-4) return [mx / m, my / m];
  if (a.state === 'fly' && a.tx != null) {
    const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
    if (d > 1e-3) return [dx / d, dy / d];
  }
  const h = a.hd ?? a.orientation;
  return h == null ? [0, 0] : [Math.cos(h), Math.sin(h)];
}
// The height to draw a flier at: its own flight height y, or over the crowns ahead. out.floor is
// the top of the crown right under it, which a bird in full flight climbs out of quickly if its
// eased height finds it there (a new heading can point straight into a tall tree).
// `ahead` is how far it looks along its heading: the drawing passes about a second of its flight,
// so a fast bird starts its climb as early before a tree as a slow one (no pop over the crown).
export function clearCanopy(w, plants, a, def, y, out = null, mx = 0, my = 0, ahead = 1.4) {
  if (out) { out.floor = -Infinity; out.clearing = false; }
  if (def.reef || descending(a, def, mx, my)) return y;
  if (out) out.clearing = true; // (holding its height over the trees, not on its way down)
  const [ux, uy] = flightHeading(a, mx, my);
  const top = canopyTop(w, plants, a.x, a.y, ux, uy, ahead);
  if (top === -Infinity) return y;
  if (out) out.floor = canopyTop(w, plants, a.x, a.y, 0, 0, 0);
  return Math.max(y, top + (a.passing ? PASSAGE_GAP : CANOPY_GAP));
}

// Reef fish keep clear of the hard corals (the reef's trees) by body size, one rule for every
// fish. A fish small enough to shelter in the reef (a clownfish, a chromis, a cleaner wrasse)
// only rises over coral growing on its own tile, so it stays down in an anemone or a gap beside
// a thicket but never sits inside the branches. A bigger fish looks a crown's width round it and
// a little way ahead, and keeps its own body depth over the top (a grouper, a turtle, a shark
// swims above and round the coral heads). Returns the lowest scene y its body may be drawn at.
export const SHELTER_SIZE = 6;
const HERE = [[0, 0]];
export function coralFloor(w, plants, a, def) {
  if (def.benthic) return -Infinity;
  const size = def.sprite.size || 10, small = size <= SHELTER_SIZE;
  const h = a.hd ?? a.orientation ?? 0, ahead = small ? 0 : 0.7;
  let top = -Infinity;
  // (a big fish looks 1.4 tiles ahead, so it can rise over a head as a slope: easeCoralLift)
  for (let s = 0; s <= (small ? 0 : 2); s++) for (const [ox, oy] of small ? HERE : AROUND) {
    const xi = Math.floor(a.x + Math.cos(h) * ahead * s + ox), yi = Math.floor(a.y + Math.sin(h) * ahead * s + oy);
    if (!w.inb(xi, yi)) continue;
    const i = w.idx(xi, yi), p = w.tree[i] && plants[w.tree[i]];
    if (!p || p.cay) continue; // (the cay's palms are out of the water)
    const t = w.heightAt(xi + 0.5, yi + 0.5) * LEVEL + treeHeight(p) * w.treeG[i];
    if (t > top) top = t;
  }
  return top + 0.02 + size * 0.006;
}

// The seabed a reef fish keeps its depth over: the scene height averaged over a ring 1.2 tiles
// round it, so it holds a fairly level line over rough bottom instead of rising and falling with
// every rock and hollow (2026-11-11). What it can't clear it rises over: coralFloor, and the
// seabed right under it, in the drawing.
const RING = [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2], [0.85, 0.85], [-0.85, 0.85], [0.85, -0.85], [-0.85, -0.85]];
export function smoothSeabed(w, x, y) {
  let sum = 0;
  for (const [ox, oy] of RING) sum += w.heightAt(Math.max(0, Math.min(w.w, x + ox)), Math.max(0, Math.min(w.h, y + oy)));
  return sum / RING.length * LEVEL;
}

// The drawn height of a bird moves like a body, not a number easing to its target: a vertical
// speed that builds and fades (no step in its climb rate) and is capped at a slant to how fast it's
// travelling, so taking off from a perch, rising over the crowns or dropping in to land is a
// sloping swoop, not a pop. Every bird (and bat) shares it. `rate` (per second) is how hard it
// heads for the target, `speed` its travel over the ground (tiles a second), dt the frame's seconds.
// Returns the new height; keeps its climb rate in st.birdVy.
export const CLIMB_BASE = 1.4, CLIMB_SLOPE = 1.1, CLIMB_ACCEL = 9;
export function easeBirdHeight(st, y, rate, speed, dt) {
  if (!(dt > 0)) return st.birdY;
  const cap = CLIMB_BASE + CLIMB_SLOPE * Math.min(4, speed);
  // (and no faster than it can brake from by the time it gets there, so a climb rounds off into
  // level flight instead of stopping dead at the top)
  const gap = y - st.birdY, brake = Math.sqrt(2 * CLIMB_ACCEL * 0.8 * Math.abs(gap));
  const want = Math.sign(gap) * Math.min(cap, Math.abs(gap) * rate, brake);
  const vy = st.birdVy || 0, dv = CLIMB_ACCEL * dt;
  st.birdVy = vy + Math.max(-dv, Math.min(dv, want - vy));
  let next = st.birdY + st.birdVy * dt;
  if ((y - st.birdY) * (y - next) < 0) { next = y; st.birdVy = 0; } // (arrived: no overshoot)
  return next;
}

// A bird in level flight holds its height (2026-11-11, Cole: "bird flight bobs jerkily up and
// down"). The height it's drawn at was its flight height over the ground, or over the crowns
// ahead, worked out afresh each frame, so it climbed over every crown and sank between them and
// followed each rise of the ground. Real flapping flight keeps a steady line: it climbs at once
// when the way ahead calls for it, but comes down only as a long, shallow glide (GLIDE tiles a
// second), and only once the way has been lower for HOLD seconds, so a forest is one level
// crossing, a dip in the ground passes under it, and a bird circling over uneven crowns doesn't
// rise and sink with each. Off level flight (taking off, coming in to land, stooping) the hold is
// the plain target. st.cruise keeps it, st.cruiseHold the time left before it may glide down.
export const GLIDE = 0.35, HOLD = 1.5;
export function holdCruise(st, y, level, dt) {
  if (!level || st.cruise == null || !(dt > 0) || y >= st.cruise) { st.cruiseHold = HOLD; return (st.cruise = y); }
  if ((st.cruiseHold = (st.cruiseHold ?? HOLD) - dt) > 0) return st.cruise;
  return (st.cruise = Math.max(y, st.cruise - GLIDE * dt));
}

// How far a reef fish is lifted over the coral and rock under it eases like a body too (it was a
// plain ease, so a head coming into view lifted a grouper or a dugong 0.3 tiles in one frame): up
// at most LIFT_RISE tiles a second, down a quarter as fast, and its climb rate builds and fades.
// st.coralLift is the lift, st.coralVy its rate.
export const LIFT_RISE = 2, LIFT_ACCEL = 8;
export function easeCoralLift(st, lift, dt) {
  if (st.coralLift == null || !(dt > 0)) { st.coralVy = 0; return (st.coralLift = lift); }
  const gap = lift - st.coralLift, up = gap > 0;
  const want = Math.sign(gap) * Math.min(up ? LIFT_RISE : LIFT_RISE / 4, Math.abs(gap) * (up ? 6 : 1.2),
    Math.sqrt(2 * LIFT_ACCEL * 0.8 * Math.abs(gap)));
  const v = st.coralVy || 0, dv = LIFT_ACCEL * dt;
  st.coralVy = v + Math.max(-dv, Math.min(dv, want - v));
  let next = st.coralLift + st.coralVy * dt;
  if (gap * (lift - next) < 0) { next = lift; st.coralVy = 0; }
  return (st.coralLift = next);
}
