// Trunks and fallen logs on the ground (0023). Route finding works in whole tiles, where a tree's
// tile is open ground; this keeps walkers off the trunk itself, using the spot and size the trunk
// is drawn at. Only ground: crowns and branches never block, so birds fly and perch through the
// leaves, and climbers (monkeys, apes, sloths, squirrels in the canopy) are left alone.
// Elephants walk through saplings and knock them back; only small animals go round logs.
import { T, F, isWater, clamp } from '../config.js';
import { hash2 } from '../rng.js';
import { groveForm } from '../render3d/groves.js';
import { CONIFER_HABITS, TREE_SHAPES } from '../render3d/geometry/tree-shapes.js';
import { groundAt, visibleLevel } from './waterline.js';
import { animalRadius } from './animal-positioning.js';
import { passable } from './animal-terrain.js';
import { isPrimate } from './primate-behavior.js';

// Mature trunk radius at the base for the kinds whose shape gives none (see geometry/trees.js).
const KIND_TRUNK = { palm: 0.06, oilpalm: 0.09, banana: 0.05, fanpalm: 0.06, cecropia: 0.045, baobab: 0.31, euphorbia: 0.085, mangrove: 0.05 };
const CORAL = new Set(['staghorn', 'tablecoral', 'boulder', 'brain', 'plating']);
// The most room one trunk takes from a walker's centre. Trunks in neighbouring tiles are at least
// 0.55 apart, so two of these always leave a way between them, however dense the stand.
const KEEP_MAX = 0.26;
const SAPLING = 0.4; // an elephant walks through trees younger than this
const LOG_SMALL = 0.2; // animals smaller than this (animalRadius) go round a log; bigger ones step over
export const SNAG_R = 0.09, LOG_R = 0.11, LOG_HALF = 0.42;
const BLOCKED = 0.5; // tiles of walking lost against wood before an animal squeezes through
const SQUEEZE = 1; // ...and then how far it walks before wood blocks it again

export function trunkRadius(p) {
  const shape = TREE_SHAPES[p.look.type];
  if (!shape || CORAL.has(shape.kind)) return 0;
  return shape.trunkR ?? (shape.kind === 'conifer' ? (CONIFER_HABITS[shape.habit] || CONIFER_HABITS.fir).trunkR : KIND_TRUNK[shape.kind] ?? 0.06);
}

// A land tile beside a carved channel draws its plants on the dry side of the waterline.
export function dryPoint(w, x, y, px, pz) {
  const L = visibleLevel(w, x, y), margin = 0.12;
  if (L == null || groundAt(w, px, pz) > L + margin) return [px, pz];
  let best = null, bd = Infinity, high = [px, pz], hh = groundAt(w, px, pz);
  for (let v = 0; v < 5; v++) for (let u = 0; u < 5; u++) {
    const qx = x + 0.12 + u * 0.19, qz = y + 0.12 + v * 0.19, h = groundAt(w, qx, qz);
    if (h > hh) { hh = h; high = [qx, qz]; }
    if (h <= L + margin) continue;
    const d = (qx - px) ** 2 + (qz - pz) ** 2;
    if (d < bd) { bd = d; best = [qx, qz]; }
  }
  return best || high;
}

// Where a tree's trunk stands in its tile, as flora.js draws it.
export function trunkSpot(w, x, y, p, bankTile) {
  const tx = x + 0.5 + (hash2(x, y, 3) - 0.5) * 0.45, tz = y + 0.5 + (hash2(x, y, 4) - 0.5) * 0.45;
  return bankTile && !p.aquatic ? dryPoint(w, x, y, tx, tz) : [tx, tz];
}

// Drawn scale of a tree (flora.js): growth, a per-tile variation, the species' look and the grove's width.
function trunkScale(w, x, y, i, p) {
  const g = w.treeG[i];
  return (0.2 + 0.8 * g) * (0.78 + hash2(x, y, 9) * 0.42) * (p.look.scale ?? 1) * groveForm(x, y, g, TREE_SHAPES[p.look.type]).width;
}
// The trunk on tile (x, y) as drawn: [x, y, radius], or null.
export function treeTrunk(w, x, y, bankless = false) {
  const i = w.idx(x, y), tid = w.tree[i];
  if (!tid) return null;
  const p = w.catalog.plants[tid], r = trunkRadius(p) * trunkScale(w, x, y, i, p);
  if (!(r > 0)) return null;
  const bank = !bankless && w.distWater[i] <= 2 && visibleLevel(w, x, y) != null;
  return [...trunkSpot(w, x, y, p, bank), r];
}
// Walkers ask for the same trunks many times a step: keep each tile's until its tree, growth or
// distance to water changes. (A flood shifting a bank tree's dry spot is picked up when it grows.)
const caches = new WeakMap();
function cachedTrunk(w, x, y, i) {
  let c = caches.get(w);
  if (!c || c.tid.length !== w.n) caches.set(w, c = { tid: new Int32Array(w.n).fill(-1), g: new Float32Array(w.n), dw: new Int16Array(w.n), xyr: new Float32Array(w.n * 3) });
  const tid = w.tree[i], g = w.treeG[i], dw = Math.min(w.distWater[i], 3);
  if (c.tid[i] !== tid || c.g[i] !== g || c.dw[i] !== dw) {
    const t = treeTrunk(w, x, y);
    c.tid[i] = tid; c.g[i] = g; c.dw[i] = dw;
    c.xyr[i * 3] = t ? t[0] : 0; c.xyr[i * 3 + 1] = t ? t[1] : 0; c.xyr[i * 3 + 2] = t ? t[2] : 0;
  }
  return c;
}

// Whose way wood is in: walkers on the ground. Not fliers, swimmers, climbers or any primate.
export function groundWalker(def, a) {
  return !def.reef && (a.move === 'ground' || a.move === 'semi') && !isPrimate(def) && !a.leaving && !a.flying && !(a.alt > 0.05);
}

// The wood near (x, y) that this animal must keep clear of: circles (trunks, snags) and capsules
// (logs), each with how near its axis the animal's centre may come. Reused buffer, fixed shape.
const near = [];
let count = 0;
function gather(w, a, def, x, y, body) {
  count = 0;
  if (w.catalog.definition.look.underwater) return 0;
  const big = def.tramples, small = body < LOG_SMALL * 0.38;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  for (let yy = y0 - 1; yy <= y0 + 1; yy++) for (let xx = x0 - 1; xx <= x0 + 1; xx++) {
    if (!w.inb(xx, yy)) continue;
    const i = w.idx(xx, yy);
    if (isWater(w.terrain[i])) continue; // (mangrove roots and floating logs: the swimmers' business)
    const tid = w.tree[i];
    if (tid && !(big && w.treeG[i] < SAPLING)) {
      const c = cachedTrunk(w, xx, yy, i).xyr, r = c[i * 3 + 2];
      if (r > 0) push(c[i * 3], c[i * 3 + 1], 0, 0, r, Math.min(r + body, Math.max(KEEP_MAX, r + 0.02)), i);
    }
    const f = w.feature[i];
    if (f === F.SNAG && !tid) push(xx + 0.5, yy + 0.5, 0, 0, SNAG_R, Math.min(SNAG_R + body, KEEP_MAX), i);
    else if (f === F.LOG && small) {
      const rot = hash2(xx, yy, 13) * 6.28; // (along the log as drawn: its local x turned by rot about the vertical)
      push(xx + 0.5, yy + 0.5, Math.cos(rot) * LOG_HALF, -Math.sin(rot) * LOG_HALF, LOG_R, LOG_R + body, i);
    }
  }
  return count;
}
function push(cx, cy, hx, hy, r, keep, i) {
  const o = near[count] ||= { cx: 0, cy: 0, hx: 0, hy: 0, r: 0, keep: 0, i: 0 };
  o.cx = cx; o.cy = cy; o.hx = hx; o.hy = hy; o.r = r; o.keep = keep; o.i = i; count++;
}
// Closest point on an obstacle's axis to (x, y).
function closest(o, x, y) {
  if (!o.hx && !o.hy) return [o.cx, o.cy];
  const L2 = o.hx * o.hx + o.hy * o.hy, t = clamp(((x - o.cx) * o.hx + (y - o.cy) * o.hy) / L2, -1, 1);
  return [o.cx + o.hx * t, o.cy + o.hy * t];
}
const bodyOf = a => animalRadius(a) * 0.38; // (half the body's width: animalRadius runs along its length)
const active = (a, def) => groundWalker(def, a) && !(a.squeeze > 0);

// A point to walk to that isn't inside a trunk: a rest spot or waypoint chosen by tile is moved
// out to the trunk's edge, so the walker can arrive instead of pressing on it.
export function clearSpot(w, a, def, x, y) {
  if ((x - a.x) ** 2 + (y - a.y) ** 2 > 2.25 || !active(a, def)) return [x, y]; // (only matters on arrival)
  const n = gather(w, a, def, x, y, bodyOf(a));
  for (let pass = 0; pass < 2; pass++) for (let k = 0; k < n; k++) {
    const o = near[k], [px, py] = closest(o, x, y), d = Math.hypot(x - px, y - py);
    if (d >= o.keep) continue;
    const [ux, uy] = d > 1e-4 ? [(x - px) / d, (y - py) / d] : [Math.cos(a.id || 0), Math.sin(a.id || 0)];
    const nx = px + ux * (o.keep + 0.01), ny = py + uy * (o.keep + 0.01);
    if (standable(w, a, nx, ny, x, y)) { x = nx; y = ny; }
  }
  return [x, y];
}

// Turn a heading aside of any wood ahead within reach: if it points into the cone a trunk (with
// the walker's half-width) fills, swing it to that cone's nearer edge. Wood behind is ignored.
export function steerAround(w, a, def, heading, reach) {
  if (!active(a, def)) return heading;
  const n = gather(w, a, def, a.x, a.y, bodyOf(a));
  for (let k = 0; k < n; k++) {
    const o = near[k], [px, py] = closest(o, a.x + Math.cos(heading) * reach * 0.5, a.y + Math.sin(heading) * reach * 0.5);
    const dx = px - a.x, dy = py - a.y, d = Math.hypot(dx, dy);
    if (d <= o.keep || d > reach + o.keep) continue; // (already touching: the step's resolve slides it round)
    const toward = Math.atan2(dy, dx), half = Math.asin(Math.min(1, (o.keep + 0.02) / d));
    let off = heading - toward;
    off -= Math.round(off / (Math.PI * 2)) * Math.PI * 2;
    if (Math.abs(off) >= half || Math.abs(off) > Math.PI / 2) continue;
    heading = toward + (off !== 0 ? Math.sign(off) : (a.id & 1 ? 1 : -1)) * half;
  }
  return heading;
}

// After a step from (fromX, fromY): push the walker out of any wood it has moved into, so it slides
// round the trunk rather than through it. A push into a fence, building or water is refused. An
// animal that keeps losing ground against wood (a cramped stand, a jam with the herd) squeezes
// through for a tile, so wood can slow a walker but never trap it. Elephants trample saplings.
export function resolveStep(wl, a, def, fromX, fromY) {
  const w = wl.game.world;
  const moved = Math.hypot(a.x - fromX, a.y - fromY);
  if (a.squeeze > 0) { a.squeeze -= moved; if (def.tramples) trample(w, a, def); return; }
  if (!groundWalker(def, a)) return;
  if (def.tramples) trample(w, a, def);
  const n = gather(w, a, def, a.x, a.y, bodyOf(a));
  if (!n) { a.woodLost = 0; return; }
  let x = a.x, y = a.y, hit = false;
  for (let pass = 0; pass < 3; pass++) for (let k = 0; k < n; k++) {
    const o = near[k], [px, py] = closest(o, x, y), d = Math.hypot(x - px, y - py);
    if (d >= o.keep) continue;
    hit = true;
    let ux, uy;
    if (d > 1e-4) { ux = (x - px) / d; uy = (y - py) / d; }
    else { const s = a.id & 1 ? 1 : -1, mx = a.x - fromX, my = a.y - fromY, m = Math.hypot(mx, my) || 1; ux = -my / m * s; uy = mx / m * s; }
    x = px + ux * o.keep; y = py + uy * o.keep;
  }
  if (!hit) { a.woodLost = Math.max(0, (a.woodLost || 0) - moved); return; }
  if (!standable(w, a, x, y, a.x, a.y)) return;
  const kept = Math.max(0, (x - fromX) * (a.x - fromX) + (y - fromY) * (a.y - fromY)) / (moved || 1);
  a.x = x; a.y = y;
  a.woodLost = (a.woodLost || 0) + Math.max(0, moved - kept);
  if (a.woodLost > BLOCKED) { a.woodLost = 0; a.squeeze = SQUEEZE; }
}

// Would this position, nudged out from (fx, fy), stand on ground the animal can use?
function standable(w, a, x, y, fx, fy) {
  const xx = Math.floor(x), yy = Math.floor(y), x0 = Math.floor(fx), y0 = Math.floor(fy);
  if (xx === x0 && yy === y0) return true;
  const ok = (u, v) => w.inb(u, v) && !w.fire[w.idx(u, v)] && passable(w, w.idx(u, v), a) &&
    isWater(w.terrain[w.idx(u, v)]) === (w.inb(x0, y0) && isWater(w.terrain[w.idx(x0, y0)]));
  return ok(xx, yy) && (xx === x0 || yy === y0 || ok(xx, y0) && ok(x0, yy));
}

// An elephant pushing through a sapling bends or breaks it: once per tree it walks into, the
// same knock a savanna herd's trampling gives (animals.js trample), and a seedling is flattened.
function trample(w, a, def) {
  const x0 = Math.floor(a.x), y0 = Math.floor(a.y), body = bodyOf(a);
  for (let yy = y0 - 1; yy <= y0 + 1; yy++) for (let xx = x0 - 1; xx <= x0 + 1; xx++) {
    if (!w.inb(xx, yy)) continue;
    const i = w.idx(xx, yy), tid = w.tree[i];
    if (!tid || w.treeG[i] >= SAPLING || a.trampled === i || isWater(w.terrain[i]) || w.feature[i] === F.FENCE) continue;
    const t = treeTrunk(w, xx, yy, true);
    if (!t || Math.hypot(a.x - t[0], a.y - t[1]) > body + t[2]) continue;
    a.trampled = i;
    if ((w.treeG[i] -= 0.08) <= 0) { w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0; }
  }
}

// Is (x, y) inside wood this animal keeps clear of? (for spacing's shoves)
export function inWood(w, a, def, x, y) {
  if (!active(a, def)) return false;
  const n = gather(w, a, def, x, y, bodyOf(a));
  for (let k = 0; k < n; k++) {
    const o = near[k], [px, py] = closest(o, x, y);
    if (Math.hypot(x - px, y - py) < o.keep) return true;
  }
  return false;
}
