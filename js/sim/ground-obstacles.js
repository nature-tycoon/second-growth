// Trunks and fallen logs on the ground (0023). Route finding works in whole tiles, where a tree's
// tile is open ground; this keeps walkers off the trunk itself, using the spot and size the trunk
// is drawn at. Only ground: crowns and branches never block, so birds fly and perch through the
// leaves, and climbers (monkeys, apes, sloths, squirrels in the canopy) are left alone.
// Elephants walk through saplings and knock them back; only small animals go round logs.
import { T, F, LEVEL, isWater, clamp } from '../config.js';
import { hash2, valueNoise } from '../rng.js';
import { groveForm } from '../render3d/groves.js';
import { CONIFER_HABITS, TREE_SHAPES } from '../render3d/geometry/tree-shapes.js';
import { groundAt, visibleLevel } from './waterline.js';
import { animalRadius } from './animal-positioning.js';
import { passable } from './animal-terrain.js';
import { isPrimate } from './primate-behavior.js';
import { removeTree, snagLife } from './plants.js';
import { isMaleVariant } from '../data/animals.js';

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

// Where a shrub stands in its tile, as flora.js draws it (before a bank tile moves it to the dry
// side): toward the far side of the tile from a tree sharing it, or a blue sea star beside its coral.
// Animals that live at one plant (a clownfish's anemone: sim/animal-territory.js) read it here.
export function shrubSpot(x, y, p, withTree) {
  if (!withTree) return [x + 0.5 + (hash2(x, y, 3) - 0.5) * 0.4, y + 0.5 + (hash2(x, y, 4) - 0.5) * 0.4];
  const ox = hash2(x, y, 3) - 0.5, oz = hash2(x, y, 4) - 0.5;
  const d = p.look.type === 'seastar' ? 0.34 : 0.24 + hash2(x, y, 5) * 0.08;
  return [x + 0.5 - Math.sign(ox || 1) * d, y + 0.5 - Math.sign(oz || 1) * d];
}

// Where a tree's trunk stands in its tile, as flora.js draws it.
export function trunkSpot(w, x, y, p, bankTile) {
  const tx = x + 0.5 + (hash2(x, y, 3) - 0.5) * 0.45, tz = y + 0.5 + (hash2(x, y, 4) - 0.5) * 0.45;
  return bankTile && !p.aquatic ? dryPoint(w, x, y, tx, tz) : [tx, tz];
}

// ---- Where deadwood lies (0035), as flora.js draws it and walkers go round it. A snag stands where
// its tree's trunk stood (the plant doesn't move a dry-land trunk), so a burned stand keeps the
// living stand's scatter rather than a grid. A log lies out from that spot: downhill on a slope (trees
// fall downhill), elsewhere along a direction that turns slowly across the map, so neighbouring logs
// lie roughly parallel as after a storm, each with its own scatter of up to ±50°.
const NOT_AQUATIC = { aquatic: false };
export function snagSpot(w, x, y, bankTile) { return trunkSpot(w, x, y, NOT_AQUATIC, bankTile); }
// A snag's lean (radians about x and z) and its drawn height: 0.8–1.15 of the model, shortening by
// up to 40% as it rots toward its fall (tops break off first).
export function snagPose(w, x, y, i) {
  const lean = (hash2(x, y, 43) - 0.5) * 0.22, dir = hash2(x, y, 44) * 6.28;
  const rot = clamp(w.featureAge[i] / (snagLife(w, i) * 120 || 1), 0, 1);
  return [Math.cos(dir) * lean, Math.sin(dir) * lean, (0.8 + hash2(x, y, 45) * 0.35) * (1 - 0.4 * rot)];
}
// The broken top of the snag on tile i (the model is 1.68 tall, its top 1.64 up), turned as flora.js
// turns it (Euler XYZ: lean about x, its yaw, lean about z): [x, z, height above its foot].
export const SNAG_TOP = 1.64;
export function snagTop(w, x, y, i, bankTile) {
  const [bx, bz] = snagSpot(w, x, y, bankTile), [rx, rz, sh] = snagPose(w, x, y, i), ry = hash2(x, y, 13) * 6.28, h = SNAG_TOP * sh;
  const x1 = -h * Math.sin(rz) * Math.cos(ry), z1 = h * Math.sin(rz) * Math.sin(ry), y1 = h * Math.cos(rz);
  return [bx + x1, bz + y1 * Math.sin(rx) + z1 * Math.cos(rx), y1 * Math.cos(rx) - z1 * Math.sin(rx)];
}
// The log on tile (x, y): its centre [x, z] and yaw (its axis runs (cos yaw, -sin yaw) in x, y).
export function logSpot(w, x, y, bankTile) {
  const [bx, bz] = trunkSpot(w, x, y, NOT_AQUATIC, false);
  const hx = (w.tileH(Math.min(w.w - 1, x + 1), y) - w.tileH(Math.max(0, x - 1), y)) * LEVEL / 2;
  const hz = (w.tileH(x, Math.min(w.h - 1, y + 1)) - w.tileH(x, Math.max(0, y - 1))) * LEVEL / 2;
  const slope = clamp(Math.hypot(hx, hz) / 0.15, 0, 1) * 0.85;
  const field = valueNoise(x, y, 7, 47) * 12.57; // (two turns over the noise's range, so every heading occurs)
  let ax = Math.cos(field) * (1 - slope) - (slope ? hx / Math.hypot(hx, hz) * slope : 0);
  let az = Math.sin(field) * (1 - slope) - (slope ? hz / Math.hypot(hx, hz) * slope : 0);
  const yaw = Math.atan2(-az, ax) + (hash2(x, y, 48) - 0.5) * 1.75;
  const dx = Math.cos(yaw), dz = -Math.sin(yaw), out = 0.18 + hash2(x, y, 49) * 0.12; // (the root end at the stump)
  let cx = bx + dx * out, cz = bz + dz * out;
  cx = clamp(cx, x + 0.1, x + 0.9); cz = clamp(cz, y + 0.1, y + 0.9);
  if (bankTile) [cx, cz] = dryPoint(w, x, y, cx, cz);
  return [cx, cz, yaw];
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
  const p = w.catalog.plants[tid], base = trunkRadius(p);
  if (!(base > 0)) return null; // (a kind with no drawn trunk has no grove shape to scale either)
  const r = base * trunkScale(w, x, y, i, p);
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

// The snag or log on tile i, as drawn ([x, y, yaw]; yaw 0 for a snag), kept until the feature or
// the distance to water changes.
const woodCaches = new WeakMap();
function cachedDeadwood(w, x, y, i) {
  let c = woodCaches.get(w);
  if (!c || c.f.length !== w.n) woodCaches.set(w, c = { f: new Uint8Array(w.n), dw: new Int16Array(w.n), xyr: new Float32Array(w.n * 3) });
  const f = w.feature[i], dw = Math.min(w.distWater[i], 3);
  if (c.f[i] !== f || c.dw[i] !== dw) {
    const bank = !isWater(w.terrain[i]) && w.distWater[i] <= 2 && visibleLevel(w, x, y) != null;
    const s = f === F.LOG ? logSpot(w, x, y, bank) : [...snagSpot(w, x, y, bank), 0];
    c.f[i] = f; c.dw[i] = dw; c.xyr[i * 3] = s[0]; c.xyr[i * 3 + 1] = s[1]; c.xyr[i * 3 + 2] = s[2];
  }
  return c.xyr;
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
    if (f === F.SNAG && !tid) { const c = cachedDeadwood(w, xx, yy, i); push(c[i * 3], c[i * 3 + 1], 0, 0, SNAG_R, Math.min(SNAG_R + body, KEEP_MAX), i); }
    else if (f === F.LOG && small) {
      const c = cachedDeadwood(w, xx, yy, i), rot = c[i * 3 + 2]; // (along the log as drawn: its local x turned by rot about the vertical)
      push(c[i * 3], c[i * 3 + 1], Math.cos(rot) * LOG_HALF, -Math.sin(rot) * LOG_HALF, LOG_R, LOG_R + body, i);
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
const bodyOf = (w, a) => animalRadius(a, w.catalog) * 0.38; // (half the body's width: animalRadius runs along its length; this world's catalog, not whichever map is active)
const active = (a, def) => groundWalker(def, a) && !(a.squeeze > 0);
// The body seen from above (0025): a capsule along the way it faces, from rump to chest, half its
// width round that line, and an antlered male's rack a disc at the head. A walker is long, so a
// round keep-out the width of its body let it turn its head or rump into a trunk (an elk's
// antlers into a fir, a deer standing half inside one). Reused record, fixed shape.
const body = { half: 0, reach: 0, rack: 0, ux: 1, uy: 0 };
function shape(w, a, def, heading = a.hd ?? a.orientation ?? 0) {
  const r = animalRadius(a, w.catalog);
  body.half = r * 0.38; body.reach = Math.max(0, r / 0.65 / 2 - body.half); // (animalRadius is 0.65 of the drawn length)
  body.rack = def.sprite.male?.antlers && isMaleVariant(def, a) ? r * 0.3 : 0;
  body.ux = Math.cos(heading); body.uy = Math.sin(heading);
  return body;
}
// How far the body standing at (x, y) is inside obstacle o, and which way to move it out: a
// trunk is tested against the body's line and its rack, a log (small animals) against its centre.
const out = { depth: 0, nx: 0, ny: 0 };
function intrusion(o, x, y, b) {
  out.depth = 0;
  if (o.hx || o.hy) { // (a log)
    const [px, py] = closest(o, x, y), d = Math.hypot(x - px, y - py);
    if (d < o.keep) set(o.keep - d, x - px, y - py, d);
    return out;
  }
  const t = clamp((o.cx - x) * b.ux + (o.cy - y) * b.uy, -b.reach, b.reach);
  const bx = x + b.ux * t, by = y + b.uy * t, d = Math.hypot(bx - o.cx, by - o.cy);
  if (d < o.keep) set(o.keep - d, bx - o.cx, by - o.cy, d);
  if (b.rack) {
    const hx = x + b.ux * (b.reach + b.half), hy = y + b.uy * (b.reach + b.half), dh = Math.hypot(hx - o.cx, hy - o.cy);
    const keep = Math.min(o.r + b.rack, Math.max(KEEP_MAX, o.r + 0.02));
    if (dh < keep && keep - dh > out.depth) set(keep - dh, hx - o.cx, hy - o.cy, dh);
  }
  return out;
}
function set(depth, dx, dy, d) {
  out.depth = depth;
  if (d > 1e-4) { out.nx = dx / d; out.ny = dy / d; } else { out.nx = 0; out.ny = 0; }
}

// A point to walk to that isn't inside a trunk: a rest spot or waypoint chosen by tile is moved
// out to the trunk's edge, so the walker can arrive instead of pressing on it.
export function clearSpot(w, a, def, x, y) {
  if ((x - a.x) ** 2 + (y - a.y) ** 2 > 2.25 || !active(a, def)) return [x, y]; // (only matters on arrival)
  const reach = shape(w, a, def).reach, n = gather(w, a, def, x, y, body.half);
  for (let pass = 0; pass < 2; pass++) for (let k = 0; k < n; k++) {
    // (it will stand there facing who knows which way: room for its length too, short of the
    // gap between two trunks, so a spot in a dense stand still exists)
    const o = near[k], [px, py] = closest(o, x, y), d = Math.hypot(x - px, y - py);
    const keep = o.hx || o.hy ? o.keep : Math.max(o.keep, Math.min(o.keep + reach, 0.27));
    if (d >= keep) continue;
    const [ux, uy] = d > 1e-4 ? [(x - px) / d, (y - py) / d] : [Math.cos(a.id || 0), Math.sin(a.id || 0)];
    const nx = px + ux * (keep + 0.01), ny = py + uy * (keep + 0.01);
    if (standable(w, a, nx, ny, x, y)) { x = nx; y = ny; }
  }
  return [x, y];
}

// Turn a heading aside of any wood ahead within reach: if it points into the cone a trunk (with
// the walker's half-width) fills, swing it to that cone's edge, and on round the next one if that
// edge points into it. It plans both ways round and takes the smaller turn, but keeps to the side
// it's already passing on (a.dodge) unless the other way is clearly shorter, so a trunk straight
// ahead doesn't have it flip from one side to the other step by step. Past the trunk, or changing
// sides, it eases back a little each step (a.dodgeOff) rather than snapping round, while that way is
// clear. Wood behind is ignored.
const SWITCH = 0.35; // (radians the other way round must save before a walker changes sides)
const EASE = 0.1; // (radians a step a dodge eases off by)
export function steerAround(w, a, def, heading, reach) {
  if (!active(a, def)) { a.dodge = 0; a.dodgeOff = 0; return heading; }
  const n = gather(w, a, def, a.x + Math.cos(heading) * reach * 0.5, a.y + Math.sin(heading) * reach * 0.5, bodyOf(w, a));
  let side = 0, out = heading;
  const left = n ? sweep(a, heading, reach, n, 1) : heading;
  if (left !== heading) {
    const right = sweep(a, heading, reach, n, -1), turn = h => Math.abs(h - heading);
    side = turn(left) <= turn(right) ? 1 : -1;
    if (a.dodge && a.dodge !== side && turn(a.dodge > 0 ? left : right) < turn(side > 0 ? left : right) + SWITCH) side = a.dodge;
    out = side > 0 ? left : right;
  }
  a.dodge = side;
  const off = out - heading, was = a.dodgeOff || 0;
  if (was && !(off * was > 0 && Math.abs(off) >= Math.abs(was))) {
    const eased = heading + clamp(off, was - EASE, was + EASE);
    if (!n || sweep(a, eased, reach, n, 1) === eased) { a.dodgeOff = eased - heading; return eased; }
  }
  a.dodgeOff = off;
  return out;
}
// Swing heading one way (side +1: anticlockwise) past each trunk it points into, until it's clear.
function sweep(a, heading, reach, n, side) {
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let k = 0; k < n; k++) {
      const o = near[k], [px, py] = closest(o, a.x + Math.cos(heading) * reach * 0.5, a.y + Math.sin(heading) * reach * 0.5);
      const dx = px - a.x, dy = py - a.y, d = Math.hypot(dx, dy);
      if (d <= o.keep || d > reach + o.keep) continue; // (already touching: the step's resolve slides it round)
      const toward = Math.atan2(dy, dx), half = Math.asin(Math.min(1, (o.keep + 0.02) / d));
      let off = heading - toward;
      off -= Math.round(off / (Math.PI * 2)) * Math.PI * 2;
      if (Math.abs(off) >= half - 1e-9 || Math.abs(off) > Math.PI / 2) continue;
      heading += side * half - off; moved = true; // (to toward + side × half, without wrapping)
    }
    if (!moved) break;
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
  const b = shape(w, a, def), n = gather(w, a, def, a.x, a.y, b.half);
  if (!n) { a.woodLost = 0; return; }
  let x = a.x, y = a.y, hit = false;
  for (let pass = 0; pass < 3; pass++) for (let k = 0; k < n; k++) {
    const o = intrusion(near[k], x, y, b);
    if (!(o.depth > 0)) continue;
    hit = true;
    let ux = o.nx, uy = o.ny;
    if (!ux && !uy) { const s = a.id & 1 ? 1 : -1, mx = a.x - fromX, my = a.y - fromY, m = Math.hypot(mx, my) || 1; ux = -my / m * s; uy = mx / m * s; }
    x += ux * o.depth; y += uy * o.depth;
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
  const x0 = Math.floor(a.x), y0 = Math.floor(a.y), body = bodyOf(w, a);
  for (let yy = y0 - 1; yy <= y0 + 1; yy++) for (let xx = x0 - 1; xx <= x0 + 1; xx++) {
    if (!w.inb(xx, yy)) continue;
    const i = w.idx(xx, yy), tid = w.tree[i];
    if (!tid || w.treeG[i] >= SAPLING || a.trampled === i || isWater(w.terrain[i]) || w.feature[i] === F.FENCE) continue;
    const t = treeTrunk(w, xx, yy, true);
    if (!t || Math.hypot(a.x - t[0], a.y - t[1]) > body + t[2]) continue;
    a.trampled = i;
    if ((w.treeG[i] -= 0.08) <= 0) { w.treeG[i] = 0; removeTree(w, i, 'browse', null, { deadwood: false }); } // (trampled flat)
  }
}

// Is (x, y) inside wood this animal keeps clear of? (for spacing's shoves)
export function inWood(w, a, def, x, y, heading) {
  if (!active(a, def)) return false;
  const b = shape(w, a, def, heading), n = gather(w, a, def, x, y, b.half);
  for (let k = 0; k < n; k++) if (intrusion(near[k], x, y, b).depth > 0.002) return true;
  return false;
}

// Standing still, turning on the spot (to drink, to face a rival or a neighbour) can swing a long
// body into a trunk: slide it back out, as a step would (0025). Not counted as ground lost.
export function settleBody(wl, a, def) {
  if (!active(a, def)) return;
  // (nothing has moved or turned it since it was last settled: nothing to do)
  const key = a.x * 7919 + a.y * 104729 + (a.orientation || 0);
  if (a.settleKey === key) return;
  const w = wl.game.world, b = shape(w, a, def), n = gather(w, a, def, a.x, a.y, b.half);
  if (!n) { a.settleKey = key; return; }
  let x = a.x, y = a.y, hit = false;
  for (let pass = 0; pass < 3; pass++) for (let k = 0; k < n; k++) {
    const o = intrusion(near[k], x, y, b);
    if (!(o.depth > 0.002) || !o.nx && !o.ny) continue;
    hit = true; x += o.nx * o.depth; y += o.ny * o.depth;
  }
  if (hit && standable(w, a, x, y, a.x, a.y)) { a.x = x; a.y = y; }
  else a.settleKey = key;
}
