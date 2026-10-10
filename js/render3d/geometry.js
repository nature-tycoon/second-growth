// Procedural geometry for plants, features and buildings.
// Plants are built from welded, smooth-shaded parts so they read as soft, organic volumes;
// buildings and props stay crisp. Every builder returns a non-indexed BufferGeometry with
// position, normal and color attributes. Baked colors are shading values; instance colors supply hue.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/BufferGeometryUtils.js';
import { mulberry32 } from '../rng.js';

// ---------------------------------------------------------------- helpers
function addColor(g, color) {
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Crisp part: flat faces, keeps the geometry's own normals.
export function prep(geo, color = 0xffffff) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) addColor(g, color);
  return g;
}

// Displace vertices by a hash of their position so shared vertices move together.
function wobble(g, amt, seed) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 991) * 78.233 + Math.round(z * 983) * 37.719 + seed) * 43758.5453;
    const f = h - Math.floor(h);
    const h2 = Math.sin(f * 311.7 + seed) * 12345.678; const f2 = h2 - Math.floor(h2);
    const h3 = Math.sin(f2 * 173.3 + seed) * 5678.123; const f3 = h3 - Math.floor(h3);
    p.setXYZ(i, x + (f - 0.5) * amt, y + (f2 - 0.5) * amt * 0.6, z + (f3 - 0.5) * amt);
  }
  return g;
}

// Soft part: welded, optionally lumpy, smooth normals.
function soft(geo, { color = 0xffffff, lump = 0, seed = 1, transform = null } = {}) {
  let g = geo;
  for (const k of ['uv', 'normal']) if (g.attributes[k]) g.deleteAttribute(k);
  g = mergeVertices(g, 1e-4);
  if (transform) transform(g);
  if (lump) wobble(g, lump, seed);
  g.computeVertexNormals();
  g = g.toNonIndexed();
  return addColor(g, color);
}

export function merge(list) {
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), col = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  const branches = list.flatMap(g => g.userData.canopyBranches || []);
  if (branches.length) out.userData.canopyBranches = branches;
  const trunks = list.flatMap(g => g.userData.canopyTrunks || []);
  if (trunks.length) out.userData.canopyTrunks = trunks;
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// Thin leaves (palm fronds, fans, paddles) drawn with a one-sided material vanish when seen
// from behind: add every triangle again with the opposite winding, keeping the same colours
// and normals so both faces light alike.
function twoSided(g) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const a = g.attributes[name].array, n = a.length, b = new Float32Array(n * 2);
    b.set(a);
    for (let t = 0; t < n; t += 9) { b.set(a.subarray(t, t + 3), n + t); b.set(a.subarray(t + 6, t + 9), n + t + 3); b.set(a.subarray(t + 3, t + 6), n + t + 6); }
    out.setAttribute(name, new THREE.BufferAttribute(b, 3));
  }
  return out;
}

// fn returns a shade, or [r, g, b] to tint (multipliers over 1 shift the instance colour's hue)
function shadeVerts(g, fn) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i));
    if (typeof v === 'number') c.setXYZ(i, c.getX(i) * v, c.getY(i) * v, c.getZ(i) * v);
    else c.setXYZ(i, c.getX(i) * v[0], c.getY(i) * v[1], c.getZ(i) * v[2]);
  }
  return g;
}
// Blotches: give each whole triangle of g one of two tints, picked at random by where it is.
function blotch(g, odds, a, b, seed = 0) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let t = 0; t < p.count; t += 3) {
    const v = speck((p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3, (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3, (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3, seed) < odds ? a : b;
    for (let i = t; i < t + 3; i++) c.setXYZ(i, c.getX(i) * v[0], c.getY(i) * v[1], c.getZ(i) * v[2]);
  }
  return g;
}
// a fixed random number for a point, the same wherever the point is repeated (blotches, mottling)
const speck = (x, y, z, s = 0) => { const h = Math.sin(Math.round(x * 523) * 12.9898 + Math.round(y * 517) * 78.233 + Math.round(z * 509) * 37.719 + s) * 43758.5453; return h - Math.floor(h); };

// Light foliage as one soft volume: bend normals toward pointing out from a center (or axis).
function volumeNormals(g, cx, cy, cz, amount, axis = false) {
  const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) - cx, axis ? 0.35 : p.getY(i) - cy, p.getZ(i) - cz).normalize();
    m.set(n.getX(i), n.getY(i), n.getZ(i)).lerp(v, amount).normalize();
    n.setXYZ(i, m.x, m.y, m.z);
  }
  return g;
}

const at = (g, x, y, z) => { g.translate(x, y, z); return g; };

// Baked ambient occlusion: darken the places light doesn't reach, once, into the vertex colours,
// so it costs nothing to draw. 'crown': the underside and the core of a leafy mass; 'base': where
// a trunk, a log or a building meets the ground; 'blade': the foot of a grass tuft.
export function bakeAO(g, mode = 'base') {
  const p = g.attributes.position, c = g.attributes.color;
  if (!p || !c || g.userData.ao) return g;
  let y0 = Infinity, y1 = -Infinity, R = 1e-6;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); R = Math.max(R, Math.hypot(p.getX(i), p.getZ(i))); }
  const H = Math.max(1e-6, y1 - y0), ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let f;
    if (mode === 'crown') f = (0.7 + 0.3 * ss(0, 0.7, (y - y0) / H)) * (0.84 + 0.16 * ss(0.15, 0.9, Math.hypot(x, z) / R));
    else if (mode === 'blade') f = 0.76 + 0.3 * ss(0, 0.9, (y - y0) / H); // (a soft foot and sunlit tips, not a dark speck)
    else f = 0.66 + 0.34 * ss(0, Math.min(0.28, 0.35 * H + 0.04), y);
    c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
  }
  g.userData.ao = true;
  return g;
}

// A curved, tapering ribbon (grass blades, fern fronds, cattail leaves).
function ribbon(len, width, bend, segments, dir, tilt, x = 0, z = 0, color = 0xffffff, cup = 0) {
  const pos = [], col = [];
  const pts = [];
  for (let k = 0; k <= segments; k++) {
    const t = k / segments;
    const a = tilt + bend * t * t;          // leans more toward the tip
    const r = len * t;
    pts.push([Math.sin(a) * r, Math.cos(a) * r * (1 - t * bend * 0.15), (1 - t) * width, t]);
  }
  const c = new THREE.Color(color);
  const side = [Math.cos(dir), 0, -Math.sin(dir)];
  const fwd = [Math.sin(dir), 0, Math.cos(dir)];
  const P = ([h, y, w, t], s) => [x + fwd[0] * h + side[0] * w * s, y + cup * w * w * 40 * (s * s), z + fwd[2] * h + side[2] * w * s];
  for (let k = 0; k < segments; k++) {
    const a = pts[k], b = pts[k + 1];
    const a0 = P(a, -1), a1 = P(a, 1), b0 = P(b, -1), b1 = P(b, 1);
    pos.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0);
    const s0 = 0.62 + 0.45 * a[3], s1 = 0.62 + 0.45 * b[3];
    for (const s of [s0, s0, s1, s0, s1, s1]) col.push(c.r * s, c.g * s, c.b * s);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // ribbons are thin: point their normals mostly up so both sides catch the sun
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) { const ny = Math.abs(n.getY(i)); n.setXYZ(i, n.getX(i) * 0.4, 0.6 + ny * 0.4, n.getZ(i) * 0.4); }
  return g;
}

// Thin leaves built triangle by triangle (fronds, straps): each face wound to face the sky and
// its normal bent up, as for ribbons, so both faces catch the sun.
function sheet(pos, col, up = 0.45) {
  const g = new THREE.BufferGeometry(), nor = new Float32Array(pos.length);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  for (let t = 0; t < pos.length; t += 9) {
    a.fromArray(pos, t); b.fromArray(pos, t + 3).sub(a); c.fromArray(pos, t + 6).sub(a);
    const n = b.cross(c).normalize();
    if (n.y < 0) { // (swap the last two corners)
      n.negate();
      for (const arr of [pos, col]) for (let k = 0; k < 3; k++) { const v = arr[t + 3 + k]; arr[t + 3 + k] = arr[t + 6 + k]; arr[t + 6 + k] = v; }
    }
    n.lerp(UP, up).normalize();
    for (let k = 0; k < 3; k++) n.toArray(nor, t + k * 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// A leaf's midrib: it sets off elev above the horizontal toward az and bends down by droop by the tip.
function midrib(base, az, elev, droop, L, segs) {
  const fx = Math.cos(az), fz = Math.sin(az), pts = [base.slice()], tan = [];
  for (let k = 0; k < segs; k++) {
    const e = elev - droop * ((k + 0.5) / segs) ** 1.6, s = L / segs, p = pts[k];
    tan.push([fx * Math.cos(e), Math.sin(e), fz * Math.cos(e)]);
    pts.push([p[0] + fx * Math.cos(e) * s, p[1] + Math.sin(e) * s, p[2] + fz * Math.cos(e) * s]);
  }
  tan.push(tan[segs - 1]);
  const side = [-fz, 0, fx];
  const along = t => { const f = Math.min(segs - 1e-6, t * segs), k = Math.floor(f), u = f - k, p = pts[k], q = pts[k + 1]; return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]; };
  const up = t => { const T = tan[Math.min(segs, Math.floor(t * segs))]; return [side[1] * T[2] - side[2] * T[1], side[2] * T[0] - side[0] * T[2], side[0] * T[1] - side[1] * T[0]]; };
  return { pts, tan, side, along, up };
}

// A pinnate palm frond into pos/col: a pale midrib with a leaflet either side every step, the
// leaflets held in a V and alternating steep and flat (the bristly look of an oil palm), longest
// mid-frond, swept toward the tip and hanging a little at their ends; fill is how much of the
// midrib each leaflet's base takes up (1: no gaps). 2 triangles per segment and 2 per leaflet pair.
function frond(o, pos, col) {
  const { base, az, elev, droop, L, n = 10, w = 0.15, segs = 5, bare = 0.15, v = 0.45, rib = 0.01, sweep = 0.8, hang = 0.3, fill = 0.55, shade = 1, tint = [1, 1, 1] } = o;
  const m = midrib(base, az, elev, droop, L, segs), sd = m.side;
  const put = (p, s, pale = 1) => { pos.push(p[0], p[1], p[2]); col.push(s * tint[0] * pale, s * tint[1] * pale, s * tint[2] * pale * (pale > 1 ? 0.8 : 1)); };
  for (let k = 0; k < segs; k++) {
    const p = m.pts[k], q = m.pts[k + 1], w0 = rib * (1 - 0.7 * k / segs), w1 = rib * (1 - 0.7 * (k + 1) / segs);
    const a0 = [p[0] - sd[0] * w0, p[1], p[2] - sd[2] * w0], a1 = [p[0] + sd[0] * w0, p[1], p[2] + sd[2] * w0];
    const b0 = [q[0] - sd[0] * w1, q[1], q[2] - sd[2] * w1], b1 = [q[0] + sd[0] * w1, q[1], q[2] + sd[2] * w1];
    for (const pt of [a0, a1, b1, a0, b1, b0]) put(pt, 0.8 * shade, 1.12);
  }
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, t = bare + (1 - bare) * u, A = m.along(t), B = m.along(Math.min(1, t + (1 - bare) / n * fill));
    const T = m.tan[Math.min(segs, Math.floor(t * segs))], N = m.up(t);
    const len = w * Math.pow(Math.sin(Math.PI * (0.1 + 0.8 * u)), 0.7);
    for (const s of [-1, 1]) {
      const vv = v + ((i + (s > 0 ? 1 : 0)) % 2 ? 0.4 : -0.2), cv = Math.cos(vv), sv = Math.sin(vv);
      const D = new THREE.Vector3(sd[0] * s * cv + N[0] * sv + T[0] * sweep, sd[1] * s * cv + N[1] * sv + T[1] * sweep, sd[2] * s * cv + N[2] * sv + T[2] * sweep).normalize();
      put(A, 0.78 * shade); put(B, 0.78 * shade); put([A[0] + D.x * len, A[1] + D.y * len - len * hang, A[2] + D.z * len], 1.06 * shade);
    }
  }
}

// A strap-shaped leaf into pos/col (pandan, ginger, pitcher-plant rosettes, titan leaflets):
// pointed, or lance-shaped (narrow at both ends); it can twist along its length and be creased
// into a V along the midrib (fold). 2 triangles per segment, 4 when folded.
function strap(o, pos, col) {
  const { base, az, elev, droop, L, w, segs = 4, twist = 0, lance = false, blunt = false, fold = 0, shade = 1, tint = [1, 1, 1] } = o;
  const m = midrib(base, az, elev, droop, L, segs), sd = m.side;
  const ring = j => {
    const t = j / segs, p = m.pts[j], N = m.up(Math.min(t, 0.999)), th = twist * t, c = Math.cos(th), s = Math.sin(th);
    const wd = lance ? w * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * t)), 0.8)
      : blunt ? w * Math.min(1, 0.25 + t / 0.12) * Math.sqrt(Math.max(0.04, 1 - Math.pow(Math.max(0, (t - 0.72) / 0.28), 2))) // (an oblong paddle with a rounded end: a banana leaf)
      : w * (1 - Math.pow(t, 1.6));
    const W = [sd[0] * c + N[0] * s, sd[1] * c + N[1] * s, sd[2] * c + N[2] * s], K = [N[0] * c - sd[0] * s, N[1] * c - sd[1] * s, N[2] * c - sd[2] * s];
    return { l: [p[0] - W[0] * wd, p[1] - W[1] * wd, p[2] - W[2] * wd], r: [p[0] + W[0] * wd, p[1] + W[1] * wd, p[2] + W[2] * wd], c: [p[0] + K[0] * wd * fold, p[1] + K[1] * wd * fold, p[2] + K[2] * wd * fold], s: shade * (0.72 + 0.34 * t) };
  };
  const put = (p, s) => { pos.push(p[0], p[1], p[2]); col.push(s * tint[0], s * tint[1], s * tint[2]); };
  for (let j = 0; j < segs; j++) {
    const a = ring(j), b = ring(j + 1);
    const quad = (p0, p1, q1, q0) => { put(p0, a.s); put(p1, a.s); put(q1, b.s); put(p0, a.s); put(q1, b.s); put(q0, b.s); };
    if (fold) { quad(a.l, a.c, b.c, b.l); quad(a.c, a.r, b.r, b.c); } else quad(a.l, a.r, b.r, b.l);
  }
}

// ---------------------------------------------------------------- trees (unit: tiles, mature size)
export const MID = 0.5; // the in-between level of detail (see treeParts)
function trunk(h, r0, r1, color = 0xffffff, sides = 7) {
  const g = soft(new THREE.CylinderGeometry(r1, r0, h, sides, 3), { color, transform: g => g.translate(0, h / 2, 0), lump: r0 * 0.25, seed: 5 });
  // Collision clearance also needs the trunk, which is not a traversable limb.
  g.userData.canopyTrunks = [{ from: [0, 0, 0], to: [0, h, 0], r0: r0 * 1.25, r1: r1 * 1.25 }];
  return g;
}

// Evergreen crowns: a stack of dense, lobed branch tiers. Each tier is a skirt whose lobes are
// branches of varied length (now and then a short one leaves a gap), sagging at their tips and,
// for some species, curling up again at the very end; underneath, a darker belly closes it.
// The habit sets the look: Douglas-fir narrow and spiky, redcedar broad with drooping, upturned
// sprays, hemlock fine and soft with a nodding leader. Loblolly is a tall bare pole with tufts.
const CONIFER_HABITS = {
  fir:     { lobes: 7, profile: 0.95, sag: 0.18, curl: 0.12, drop: 1.9, gap: 0.16, base: 0.15, trunkR: 0.065 },
  cedar:   { lobes: 9, profile: 0.78, sag: 0.5, curl: 0.3, drop: 2.3, gap: 0.08, base: 0.1, trunkR: 0.09 },
  hemlock: { lobes: 10, profile: 0.9, sag: 0.38, curl: 0.05, drop: 2.1, gap: 0.1, base: 0.13, trunkR: 0.06, nod: 0.5 },
};
// lod: 0 close, 1 distant, MID the in-between model for the normal play zoom (the close model's
// outline with fewer points; it draws the same random numbers so the two match exactly)
function skirt(y, r, drop, h, rng, lod) {
  const far = lod === 1, mid = lod === MID;
  const per = far || mid ? 2 : 4, M = h.lobes * per, phase = rng() * 6.28;
  const lens = Array.from({ length: h.lobes }, () => rng() < h.gap ? 0.5 + rng() * 0.15 : 0.84 + rng() * 0.3);
  const reach = [], ang = [];
  for (let i = 0; i < M; i++) {
    const j = Math.floor(i / per), u = (i % per) / per, next = lens[(j + 1) % h.lobes];
    // a lobe's tip, its shoulders and the notch before the next branch
    const prof = per === 4 ? [1, 0.84, 0.62, 0.84][i % per] : [1, 0.64][i % per];
    reach.push(prof * (u <= 0.25 ? lens[j] : u >= 0.75 ? next : (lens[j] + next) / 2));
    ang.push(phase + (i / M) * Math.PI * 2 + (far ? 0 : (rng() - 0.5) * 0.05 * (mid ? 2 : 1)));
    if (mid) rng(); // (as many draws as the close model, two points per lobe-quarter pair)
  }
  // (the distant model is one ring and a flat belly: a few dozen triangles per tier)
  const rings = far ? [1] : mid ? [0.55, 1] : [0.38, 0.72, 1], pos = [y], top = [], belly = [];
  const vert = (s, i) => {
    const f = reach[i], tip = Math.min(1, Math.max(0, (f - 0.6) / 0.4)), end = Math.min(1, Math.max(0, (s - 0.7) / 0.3));
    const yy = y - drop * (0.3 * s + 0.7 * s ** 1.6) - h.sag * drop * s * s * tip + h.curl * drop * end * end * tip;
    return [Math.cos(ang[i]) * r * s * f, yy, Math.sin(ang[i]) * r * s * f];
  };
  const P = [[0, y + drop * 0.12, 0]];
  for (const s of rings) for (let i = 0; i < M; i++) P.push(vert(s, i));
  const id = (ring, i) => 1 + ring * M + (i % M);
  for (let i = 0; i < M; i++) top.push(0, id(0, i + 1), id(0, i));
  for (let k = 0; k + 1 < rings.length; k++) for (let i = 0; i < M; i++) {
    const a = id(k, i), b = id(k, i + 1), c = id(k + 1, i + 1), d = id(k + 1, i);
    top.push(a, b, c, a, c, d);
  }
  // the belly: from the rim back in, a little above it, to the trunk
  const rim = rings.length - 1, B0 = P.length;
  for (let i = 0; i < M; i++) P.push([Math.cos(ang[i]) * r * 0.3 * reach[i], y - drop * 0.82, Math.sin(ang[i]) * r * 0.3 * reach[i]]);
  P.push([0, y - drop * 0.62, 0]);
  const C = P.length - 1;
  for (let i = 0; i < M; i++) {
    const a = id(rim, i), b = id(rim, i + 1), c = B0 + (i + 1) % M, d = B0 + i;
    if (far || mid) belly.push(a, b, C); else belly.push(a, b, c, a, c, d, d, c, C);
  }
  const build = (idx, shade) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3)); g.setIndex(idx);
    return shade(soft(g, { lump: r * 0.05, seed: Math.floor(rng() * 1e4) }));
  };
  return [
    build(top, g => shadeVerts(g, (x, yy, z) => 0.66 + 0.46 * Math.min(1, Math.hypot(x, z) / r) ** 1.5)),
    build(belly, g => shadeVerts(g, () => 0.52)),
  ];
}
function pineTree(opts, seed, lod) {
  // Mature loblolly keeps an open, high crown of needle clusters on a long bare bole.
  const { height: H, radius: R } = opts, base = H * (opts.base ?? 0.57);
  const pos = [], col = [], cores = [], limbs = [trunk(H * 0.96, 0.07, 0.012)];
  for (let k = 0, n = lod ? 5 : 7; k < n; k++) {
    const a = k * 2.4, t = k / (n - 1), d = R * (0.65 - t * 0.4);
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = H * (0.7 + t * 0.25);
    const cluster = soft(new THREE.IcosahedronGeometry(1, lod ? 0 : 1), {
      seed: seed + k, lump: 0.13, transform: g => g.scale(R * 0.6, H * 0.07, R * 0.53).translate(x, y, z) });
    shadeVerts(cluster, () => 0.8 + t * 0.2); cores.push(cluster);
    limbs.push(rod([0, base, 0], [x, y, z], 0.018, 0.005));
    if (!lod) for (let j = 0; j < 4; j++) frond({ base: [x, y, z], az: a + j * Math.PI / 2,
      elev: 0.16, droop: 0.15, L: R * 0.62, n: 5, w: R * 0.16, segs: 3,
      bare: 0.05, v: 0.1, rib: 0.003, fill: 0.95, sweep: 0.08, hang: 0.15, shade: 0.88 }, pos, col);
  }
  return { crown: lod ? merge(cores) : merge([...cores, twoSided(sheet(pos, col))]), trunk: merge(limbs) };
}
export function conifer(opts, seed, lod = 0) {
  if (opts.habit === 'pine') return pineTree(opts, seed, lod === MID ? 0 : lod);
  const rng = mulberry32(seed), { height: H, radius: R, tiers } = opts, h = CONIFER_HABITS[opts.habit] || CONIFER_HABITS.fir;
  const base = H * h.base, n = lod === 1 ? Math.ceil((tiers + 2) * 0.6) : tiers + 2, parts = [];
  const span = H * 0.88 - base, drop = span / n * h.drop;
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1), y = base + drop + (span - drop) * t;
    const r = R * Math.pow(1 - t * 0.94, h.profile) * (0.92 + rng() * 0.16) + 0.03;
    const [top, belly] = skirt(y, r, drop * (1 - t * 0.35), h, rng, lod);
    parts.push(shadeVerts(top, () => 0.86 + t * 0.2), belly); // (the lower, shaded tiers a little darker)
  }
  // the leader: a slim spire of new growth
  parts.push(soft(new THREE.ConeGeometry(R * 0.1, H * 0.16, lod ? 4 : 6, 1), { transform: g => g.translate(0, H * 0.91, 0) }));
  const crown = merge(parts);
  volumeNormals(crown, 0, 0, 0, 0.4, true);
  if (h.nod) { // (a hemlock's leader droops over)
    const p = crown.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), u = (y - H * 0.72) / (H * 0.28); if (u > 0) { p.setX(i, p.getX(i) + u * u * R * h.nod); p.setY(i, y - u * u * H * 0.035); } }
  }
  return { crown, trunk: trunk(base + 0.35, h.trunkR, 0.035) };
}

// Broadleaf crowns grow on a branching scaffold: main limbs fork into smaller branches, and
// each branch tip carries a leafy clump on the crown's outer shell. That gives a lobed outline
// with gaps at its edges where limbs show through, a shaded interior and a sunlit top. The habit
// sets the envelope and how the limbs rise: 'round' (alder, ash, maple), 'spread' (oaks: wide,
// low, near-level limbs), 'spire' (cottonwood, tulip poplar: tall and upright), 'layered'
// (dogwood: flat tiers) and 'vase' (redbud: a V that opens into a broad top).
export function broadleaf(opts, seed, lod = 0) {
  // (the in-between model is the close one with plainer leaf clumps: same branches, same outline)
  if (lod === MID) return broadleaf(opts, seed, -1);
  const rng = mulberry32(seed), { height: H, rx, ry, trunkH, trunkR = 0.06 } = opts;
  const habit = opts.habit || 'round', cy = H - ry;
  const crownParts = [], limbs = [];
  const forkY = habit === 'spread' ? trunkH * 0.75 : habit === 'vase' ? Math.min(trunkH, H * 0.22) : habit === 'spire' ? Math.min(trunkH, cy - ry * 0.6) : trunkH * 0.9;
  limbs.push(trunk(forkY + 0.06, trunkR, trunkR * 0.62));
  // the crown's centre leans a little off the trunk, as real crowns grow toward the light
  const lx = (rng() - 0.5) * rx * 0.16, lz = (rng() - 0.5) * rx * 0.16;
  const shell = (a, e, f = 1) => [lx + Math.cos(e) * Math.cos(a) * rx * f, cy + Math.sin(e) * ry * f, lz + Math.cos(e) * Math.sin(a) * rx * f];
  const clump = (c, s, sy, shade, salt) => {
    const g = soft(new THREE.IcosahedronGeometry(1, lod ? 0 : 1), { seed: seed + salt, lump: lod === -1 ? 0.14 : 0.09,
      transform: g => g.scale(s, s * sy, s).translate(...c) });
    // dark underneath, bright where it faces the sky
    shadeVerts(g, (x, y) => shade * (0.62 + 0.48 * Math.min(1, Math.max(0, (y - c[1]) / (s * sy) * 0.5 + 0.5))));
    crownParts.push(g);
  };
  // elevation of the limbs' targets on the crown shell, by habit
  const elev = t => habit === 'spread' ? -0.15 + t * 0.75 : habit === 'spire' ? -0.35 + t * 1.25
    : habit === 'vase' ? 0.15 + t * 0.7 : -0.3 + t * 1.05;
  const primaries = habit === 'layered' ? 0 : lod === 1 ? 4 : habit === 'spire' ? 6 : 5, seconds = lod === 1 ? 2 : 3;
  for (let k = 0; k < primaries; k++) {
    const t = (k + 0.5) / primaries, a = k * 2.4 + rng() * 0.5, e = elev(t);
    const end = shell(a, e, 0.55), r0 = trunkR * 0.62, r1 = trunkR * 0.32;
    const from = [0, forkY, 0], kink = [end[0] * 0.5, forkY + (end[1] - forkY) * (habit === 'spread' ? 0.35 : 0.55), end[2] * 0.5];
    limbs.push(rod(from, kink, r0, (r0 + r1) / 2, lod ? 4 : 5), rod(kink, end, (r0 + r1) / 2, r1, lod ? 4 : 5));
    for (let j = 0; j < seconds; j++) {
      const aa = a + (j - (seconds - 1) / 2) * 0.62 + (rng() - 0.5) * 0.2, ee = e + (rng() - 0.4) * 0.5 + (habit === 'spire' ? 0.15 : 0);
      const tip = shell(aa, ee, 0.68 + rng() * 0.3); // (some branches reach further than others: a lobed outline)
      if (lod !== 1) limbs.push(rod(end, tip, r1, r1 * 0.3, 3));
      const s = rx * (0.24 + rng() * 0.16) * (habit === 'spire' ? 0.85 : 1);
      clump(tip, s, habit === 'spread' ? 0.62 : 0.78, 0.9 + Math.sin(ee) * 0.12 + rng() * 0.06, k * 10 + j);
    }
  }
  if (habit === 'layered') {
    // flat tiers of foliage held out on level branches
    for (let tier = 0; tier < 3; tier++) {
      const y = cy - ry * 0.55 + tier * ry * 0.62, f = 1 - tier * 0.28, n = lod === 1 ? 4 - Math.floor(tier / 2) : 6 - tier;
      for (let k = 0; k < n; k++) {
        const a = k / n * 6.28 + tier * 0.9 + rng() * 0.4, d = rx * f * (0.62 + rng() * 0.18);
        const tip = [lx * f + Math.cos(a) * d, y, lz * f + Math.sin(a) * d];
        limbs.push(rod([0, Math.min(y, forkY + tier * 0.12), 0], tip, trunkR * 0.4, trunkR * 0.12, lod ? 3 : 4));
        clump(tip, rx * 0.3 * (0.85 + rng() * 0.3), 0.42, 0.88 + tier * 0.08, 300 + tier * 10 + k);
      }
    }
  }
  // a leafy core, set back inside the shell, so the crown is full in the middle and open at its edges
  const core = habit === 'layered' ? 0 : lod === 1 ? 1 : 2;
  for (let k = 0; k < core; k++) {
    const a = k * 2.1 + rng(), c = shell(a, habit === 'spread' ? 0.2 : 0.15 + k * 0.2, 0.32);
    clump(c, rx * (habit === 'spire' ? 0.38 : 0.44), habit === 'spread' ? 0.6 : 0.85, 0.66, 200 + k);
  }
  // the crown's top: a sunlit clump or two
  if (habit !== 'layered') clump(shell(rng() * 6.28, 1.25, 0.82), rx * 0.34, habit === 'spread' ? 0.55 : 0.75, 1.06, 250);
  const crown = merge(crownParts); volumeNormals(crown, lx, cy, lz, 0.35);
  return { crown, trunk: merge(limbs) };
}

// Winter silhouette for deciduous trees: trunk and bare branches.
export function bareTree(opts, seed) {
  const r = mulberry32(seed + 7);
  const { height: H, trunkR = 0.06 } = opts, trunkH = opts.trunkH ?? H * (opts.fork ?? 0.62); // (emergent crowns like ceiba and guanacaste give no trunk height)
  const parts = [trunk(trunkH, trunkR, trunkR * 0.7)];
  const branch = (x, y, z, len, rad, ax, az, depth) => {
    const c = soft(new THREE.CylinderGeometry(rad * 0.6, rad, len, 5), { transform: g => { g.translate(0, len / 2, 0); g.rotateX(ax); g.rotateZ(az); g.translate(x, y, z); } });
    parts.push(c);
    if (depth <= 0) return;
    const ex = x - Math.sin(az) * len * Math.cos(ax), ey = y + Math.cos(az) * Math.cos(ax) * len, ez = z + Math.sin(ax) * len;
    for (let k = 0; k < 2; k++) branch(ex, ey, ez, len * 0.66, rad * 0.62, ax + (r() - 0.5) * 0.9, az + (k ? 0.5 : -0.5) + (r() - 0.5) * 0.4, depth - 1);
  };
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2 + r();
    branch(0, trunkH * 0.9, 0, (H - trunkH) * 0.45, trunkR * 0.55, Math.sin(a) * 0.6, Math.cos(a) * 0.6, 2);
  }
  return merge(parts);
}

// Sizes in tiles. Kept a little under one tile across so forests have depth, not a solid carpet.
export const TREE_SHAPES = {
  mangrove:   { kind: 'mangrove', height: 1.2, radius: 0.45 },
  fir:        { kind: 'conifer', height: 2.3, radius: 0.38, tiers: 8, habit: 'fir' },
  cedar:      { kind: 'conifer', height: 1.95, radius: 0.48, tiers: 7, droop: 0.14, habit: 'cedar' },
  hemlock:    { kind: 'conifer', height: 2.1, radius: 0.35, tiers: 9, droop: 0.09, lean: 0.65, habit: 'hemlock' },
  alder:      { kind: 'broad', height: 1.6, rx: 0.36, ry: 0.5, blobs: 10, trunkH: 0.8, trunkR: 0.045 },
  cottonwood: { kind: 'broad', height: 2.35, rx: 0.38, ry: 0.85, blobs: 13, trunkH: 0.95, trunkR: 0.065 },
  maple:      { kind: 'broad', height: 1.7, rx: 0.6, ry: 0.52, blobs: 14, trunkH: 0.68, trunkR: 0.075, lobes: 3 },
  ash:        { kind: 'broad', height: 1.55, rx: 0.42, ry: 0.46, blobs: 11, trunkH: 0.72, trunkR: 0.055 },
  oak:        { kind: 'broad', height: 1.35, rx: 0.64, ry: 0.38, blobs: 14, trunkH: 0.5, trunkR: 0.085, lobes: 4, habit: 'spread' },
  // Amazon
  inga:       { kind: 'broad', height: 1.55, rx: 0.56, ry: 0.4, blobs: 12, trunkH: 0.65, trunkR: 0.06, lobes: 2 },
  balsa:      { kind: 'broad', height: 1.95, rx: 0.46, ry: 0.5, blobs: 10, trunkH: 1.0, trunkR: 0.065 },
  mahogany:   { kind: 'broad', height: 2.3, rx: 0.64, ry: 0.55, blobs: 15, trunkH: 1.1, trunkR: 0.085, lobes: 3 },
  ipe:        { kind: 'broad', height: 2.05, rx: 0.6, ry: 0.44, blobs: 13, trunkH: 1.0, trunkR: 0.07, lobes: 3 },
  fig:        { kind: 'broad', height: 2.15, rx: 0.78, ry: 0.55, blobs: 16, trunkH: 0.85, trunkR: 0.11, lobes: 4 },
  leucaena:   { kind: 'broad', height: 1.2, rx: 0.42, ry: 0.32, blobs: 9, trunkH: 0.62, trunkR: 0.04 },
  cecropia:   { kind: 'cecropia', height: 2.0 },
  palm:       { kind: 'palm', height: 1.9, stems: 3 },
  oilpalm:    { kind: 'oilpalm', height: 2.3 },
  banana:     { kind: 'banana', height: 0.9 },
  fanpalm:    { kind: 'fanpalm', height: 2.3 },
  emergent:   { kind: 'emergent', height: 3.2, rx: 0.95, ry: 0.32, trunkR: 0.1 },
  kapok:      { kind: 'emergent', height: 3.4, rx: 1.05, ry: 0.3, trunkR: 0.11, buttress: true },
  // Serengeti
  umbrella:   { kind: 'emergent', height: 1.55, rx: 1.0, ry: 0.17, trunkR: 0.06, fork: 0.42 },
  fevertree:  { kind: 'emergent', height: 1.9, rx: 0.78, ry: 0.26, trunkR: 0.065, fork: 0.5 },
  balanites:  { kind: 'broad', height: 1.3, rx: 0.5, ry: 0.46, blobs: 11, trunkH: 0.55, trunkR: 0.06 },
  commiphora: { kind: 'broad', height: 1.1, rx: 0.48, ry: 0.3, blobs: 7, trunkH: 0.55, trunkR: 0.07 },
  sausage:    { kind: 'broad', height: 1.55, rx: 0.78, ry: 0.5, blobs: 15, trunkH: 0.6, trunkR: 0.085, lobes: 3 },
  mesquite:   { kind: 'broad', height: 1.0, rx: 0.7, ry: 0.32, blobs: 12, trunkH: 0.35, trunkR: 0.045, lobes: 3 },
  baobab:     { kind: 'baobab', height: 1.9 },
  // Atlanta
  pine:       { kind: 'conifer', height: 2.4, radius: 0.48, tiers: 5, base: 0.57, habit: 'pine' }, // loblolly: tall bare trunk, high needle sprays
  magnolia:   { kind: 'broad', height: 1.75, rx: 0.4, ry: 0.78, blobs: 15, trunkH: 0.3, trunkR: 0.06, habit: 'spire' },        // dense, tall, rounded cone
  understory: { kind: 'broad', height: 1.0, rx: 0.56, ry: 0.26, blobs: 11, trunkH: 0.48, trunkR: 0.04, lobes: 3, habit: 'layered' }, // dogwood, redbud: flat layered crowns
  vase:       { kind: 'broad', height: 1.25, rx: 0.5, ry: 0.36, blobs: 11, trunkH: 0.62, trunkR: 0.035, lobes: 3, habit: 'vase' },  // crepe myrtle
  // Nicaragua
  guanacaste: { kind: 'broad', height: 2.0, rx: 1.02, ry: 0.5, blobs: 20, trunkH: 0.75, trunkR: 0.12, lobes: 4 },   // a huge wide dome
  raintree:   { kind: 'broad', height: 1.75, rx: 0.98, ry: 0.36, blobs: 18, trunkH: 0.72, trunkR: 0.1, lobes: 4 },   // genízaro: a broad umbrella
  mangrovebush: { kind: 'broad', height: 0.95, rx: 0.48, ry: 0.36, blobs: 11, trunkH: 0.26, trunkR: 0.05, lobes: 2 }, // black and white mangroves
  euphorbia:  { kind: 'euphorbia', height: 1.6 },
  // Great Barrier Reef corals (the reef map draws them as its "trees")
  staghorn:   { kind: 'staghorn', height: 0.55 },  // branching Acropora thickets
  tablecoral: { kind: 'tablecoral', height: 0.5 }, // a wide flat plate on a short stalk
  boulder:    { kind: 'boulder', height: 0.5 },    // massive Porites: a lumpy dome, centuries old
  brain:      { kind: 'brain', height: 0.36 },     // a rounded dome with meandering grooves
  plating:    { kind: 'plating', height: 0.42 },   // Montipora: whorls of thin, overlapping plates like a cabbage
  pisonia:    { kind: 'broad', height: 1.45, rx: 0.62, ry: 0.42, blobs: 13, trunkH: 0.5, trunkR: 0.09, lobes: 3 }, // the cay's soft-wooded forest tree
};

// Crown and trunk for any tree shape.
export function treeParts(shape, seed, lod = 0) {
  const t = treePartsRaw(shape, seed, lod);
  bakeAO(t.crown, 'crown'); bakeAO(t.trunk, 'base');
  return t;
}
function treePartsRaw(shape, seed, lod) {
  // (only the conifers and broadleaf crowns have an in-between model; the rest use their close one)
  if (lod === MID && shape.kind !== 'conifer' && shape.kind !== 'broad' && shape.kind) lod = 0;
  switch (shape.kind) {
    case 'conifer': return conifer(shape, seed, lod);
    case 'palm': return palm(shape, seed, lod);
    case 'oilpalm': return oilPalm(shape, seed, lod);
    case 'banana': return banana(shape, seed, lod);
    case 'fanpalm': return fanPalm(shape, seed, lod);
    case 'cecropia': return cecropia(shape, seed, lod);
    case 'emergent': return emergent(shape, seed, lod);
    case 'baobab': return baobab(shape, seed, lod);
    case 'euphorbia': return euphorbia(shape, seed, lod);
    case 'mangrove': return mangrove(shape, seed, lod);
    case 'staghorn': return staghorn(shape, seed, lod);
    case 'tablecoral': return tableCoral(shape, seed, lod);
    case 'boulder': return boulderCoral(shape, seed, lod);
    case 'brain': return brainCoral(shape, seed, lod);
    case 'plating': return platingCoral(shape, seed, lod);
    default: return broadleaf(shape, seed, lod);
  }
}

// ---------------------------------------------------------------- tropical trees
// Palms: slender, slightly curving trunks (one or a clump) topped with arching pinnate fronds.
export function palm(opts, seed, lod = 0) {
  const r = mulberry32(seed);
  const trunks = [], shafts = [], pos = [], col = [];
  const stems = opts.stems || 1;
  for (let s = 0; s < stems; s++) {
    const a = r() * 6.28, lean = stems > 1 ? 0.12 + r() * 0.18 : r() * 0.08;
    const H = opts.height * (stems > 1 ? 0.7 + r() * 0.35 : 1);
    const bx = Math.cos(a) * (stems > 1 ? 0.07 : 0), bz = Math.sin(a) * (stems > 1 ? 0.07 : 0);
    const tx = bx + Math.cos(a) * lean * H * 0.35, tz = bz + Math.sin(a) * lean * H * 0.35;
    // trunk in two segments so it can curve
    for (let k = 0; k < 2; k++) {
      const y0 = H * k / 2, y1 = H * (k + 1) / 2, f0 = (k / 2) ** 1.6, f1 = ((k + 1) / 2) ** 1.6;
      const x0 = bx + (tx - bx) * f0, z0 = bz + (tz - bz) * f0, x1 = bx + (tx - bx) * f1, z1 = bz + (tz - bz) * f1;
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const c = soft(new THREE.CylinderGeometry(0.022, 0.028, len, lod ? 5 : 6), { transform: g => {
        g.translate(0, len / 2, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize());
        g.applyQuaternion(q); g.translate(x0, y0, z0);
      } });
      trunks.push(c);
    }
    const n = lod ? 6 : 9;
    for (let k = 0; k < n; k++) {
      const d = k / n * 6.28 + r() * 0.4;
      // Preserve the trunk's seeded variation; replace each solid strap with a feathered frond.
      const len = 0.5 + r() * 0.15, bend = 1.3 + r() * 0.4, tilt = 0.35 + r() * 0.3, u = k / (n - 1);
      frond({ base: [tx, H, tz], az: d, elev: 1.05 - u * 0.98 + (tilt - 0.5) * 0.2,
        droop: bend + u * 0.35, L: len * (0.85 + u * 0.42), n: lod ? 5 : 10,
        w: 0.09 + u * 0.035, segs: lod ? 3 : 5, bare: 0.12, rib: 0.006,
        v: 0.2, sweep: 0.28, hang: 0.25, fill: lod ? 1.1 : 0.9, shade: 1 - u * 0.12 }, pos, col);
    }
    shafts.push(rod([tx, H - 0.07, tz], [tx, H + 0.035, tz], 0.021, 0.012, 5));
  }
  const crown = merge([twoSided(sheet(pos, col)), ...shafts]);
  return { crown, trunk: merge(trunks) };
}

// African oil palm, 20-odd years after planting: one stout, straight trunk armoured with the cut
// stubs of old frond bases spiralling up it (a few ferns rooted among them), under a big, dense,
// even crown of long pinnate fronds: the young ones near upright round a furled spear, the old
// ones arching out and drooping, yellowing a little. The fruit bunches wedged in among the frond
// bases are a part of their own (`fruit`), drawn in the berry colour while the palm is fruiting.
// About 2 tiles across. Triangles (lod 0 / 1): crown ~2000 / ~480, trunk ~600 / 120, fruit 240 / 40.
export function oilPalm(opts, seed, lod = 0) {
  const r = mulberry32(seed), H = opts.height, top = H * 0.7;
  const pos = [], col = [], n = lod ? 13 : 22;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), az = k * 2.39996 + (r() - 0.5) * 0.3, old = Math.max(0, u - 0.62) / 0.38;
    frond({ base: [Math.cos(az) * 0.05, top + 0.06 - u * 0.13, Math.sin(az) * 0.05], az,
      elev: 1.2 - 1.0 * u + (r() - 0.5) * 0.12, droop: 0.5 + 1.3 * u + r() * 0.15, L: (0.76 + 0.46 * u) * (0.94 + r() * 0.12),
      n: lod ? 6 : 12, w: (lod ? 0.22 : 0.23) + 0.04 * u, segs: lod ? 3 : 4, bare: 0.14, v: lod ? 0.35 : 0.5, sweep: lod ? 0.55 : 0.6, rib: 0.016, fill: lod ? 1.1 : 0.75, hang: 0.4,
      shade: 0.94 + r() * 0.12 - old * 0.06, tint: [1 + old * 0.16, 1, 1 - old * 0.32] }, pos, col);
  }
  // the spear: the next frond, still furled, standing straight up out of the middle
  strap({ base: [0, top + 0.03, 0], az: r() * 6.28, elev: 1.5, droop: 0.12, L: 0.34, w: 0.022, segs: 2, shade: 1.08, tint: [1.1, 1.08, 0.8] }, pos, col);
  const leaves = [sheet(pos, col)];
  // ferns rooted in the old frond bases, hanging out from the trunk
  if (!lod) for (let k = 0; k < 3; k++) {
    const a = r() * 6.28, y = 0.45 + k * 0.2 + r() * 0.1;
    for (let j = 0; j < 4; j++) {
      const f = ribbon(0.11 + r() * 0.04, 0.022, 0.9, 3, Math.PI / 2 - a + (j - 1.5) * 0.45, 0.9 + r() * 0.4, Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0xffffff, 0.02);
      leaves.push(shadeVerts(f.translate(0, y, 0), () => [1.25, 1.22, 0.85]));
    }
  }
  const crown = twoSided(merge(leaves));
  // trunk: a little swollen at the foot, its stubs cut flat, older and fewer toward the ground
  const tr = [soft(new THREE.CylinderGeometry(0.075, 0.09, top + 0.05, lod ? 6 : 9, lod ? 1 : 4), { lump: 0.014, seed, transform: g => g.translate(0, (top + 0.05) / 2, 0) })];
  const ns = lod ? 12 : 32;
  for (let j = 0; j < ns; j++) {
    const y = 0.3 + (top - 0.3) * j / (ns - 1), a = j * 2.39996 + r() * 0.3, len = 0.05 + r() * 0.025, wd = 0.034 + r() * 0.01;
    const stub = soft(new THREE.CylinderGeometry(wd, wd * 0.75, len, 4, 1, !!lod), { transform: g => {
      g.rotateY(Math.PI / 4); g.scale(1, 1, 0.45); g.translate(0, len / 2, 0); g.rotateZ(-0.75 - r() * 0.3); g.translate(0.062, y, 0); g.rotateY(-a);
    } });
    tr.push(shadeVerts(stub, (x, yy) => (yy > y + 0.025 ? 1.18 : 0.82) * (0.85 + (j % 3) * 0.08)));
  }
  // fruit bunches: knobbly ovals of tightly packed fruit, black-red on top, fiery orange below
  const fr = [];
  for (let b = 0, nb = lod ? 2 : 3; b < nb; b++) {
    const a = b / nb * 6.28 + r() * 0.8, y = top - 0.06 + r() * 0.05, d = 0.1;
    const bunch = soft(new THREE.IcosahedronGeometry(0.045, lod ? 0 : 1), { seed: seed + b, lump: 0.024, transform: g => { g.scale(1, 1.15, 1); g.rotateZ(-0.4); g.rotateY(-a); g.translate(Math.cos(a) * d, y, Math.sin(a) * d); } });
    fr.push(shadeVerts(bunch, (x, yy, z) => (Math.hypot(x, z) > d + 0.012 && yy > y - 0.01 ? 0.32 : yy > y + 0.015 ? 0.5 : 1.0)));
  }
  return { crown, trunk: merge(tr), fruit: merge(fr) };
}

// Banana: not a tree but a giant herb. A smooth green "trunk" (the pseudostem, rolled leaf
// sheaths) under a crown of huge, blunt paddle leaves: the newest standing up round a furled
// one, the older arching out, the oldest hanging down dry and brown against the stem. A young
// sucker comes up at its foot. Its bunch (`fruit`) hangs from the top on a curving stalk: tiers
// of green hands, with the maroon flower bud (the heart) dangling at the end in the bark colour.
export function banana(opts, seed, lod = 0) {
  const r = mulberry32(seed), H = opts.height, top = H * 0.56;
  const pos = [], col = [], n = lod ? 6 : 9;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), az = k * 2.39996 + (r() - 0.5) * 0.4;
    strap({ base: [Math.cos(az) * 0.025, top - u * 0.05, Math.sin(az) * 0.025], az, elev: 1.3 - 0.95 * u + (r() - 0.5) * 0.15, droop: 0.7 + 1.3 * u,
      L: 0.5 + 0.16 * u + r() * 0.08, w: 0.075 + r() * 0.012, segs: lod ? 3 : 7, blunt: true, fold: 0.1, twist: (r() - 0.5) * 0.4,
      shade: 0.95 + r() * 0.1, tint: u > 0.85 ? [1.05, 0.98, 0.8] : [1, 1, 1] }, pos, col);
  }
  // the newest leaf, still rolled into a spike
  strap({ base: [0, top, 0], az: r() * 6.28, elev: 1.52, droop: 0.05, L: 0.2, w: 0.016, segs: 2, shade: 1.1, tint: [1.08, 1.06, 0.88] }, pos, col);
  // old leaves hanging dead against the stem
  for (let k = 0, m = lod ? 1 : 2; k < m; k++) {
    const az = r() * 6.28;
    strap({ base: [Math.cos(az) * 0.035, top - 0.06, Math.sin(az) * 0.035], az, elev: -1.25, droop: 0.15, L: 0.22, w: 0.045, segs: 2, fold: 0.3, shade: 0.8, tint: [1.75, 1.15, 0.5] }, pos, col);
  }
  // a sucker at the foot: a short stem and a few small upright leaves
  const sa = r() * 6.28, sx = Math.cos(sa) * 0.09, sz = Math.sin(sa) * 0.09, sh = H * 0.16;
  for (let k = 0; k < (lod ? 2 : 4); k++) {
    const az = k * 2.39996 + r();
    strap({ base: [sx, sh, sz], az, elev: 1.1 - k * 0.15, droop: 0.3, L: 0.16 + r() * 0.04, w: 0.04, segs: 3, blunt: true, shade: 1.02, tint: [1.02, 1.04, 0.92] }, pos, col);
  }
  const crown = twoSided(sheet(pos, col));
  const stem = soft(new THREE.CylinderGeometry(0.036, 0.05, top, lod ? 6 : 9, 2), { lump: 0.006, seed, transform: g => g.translate(0, top / 2, 0) });
  shadeVerts(stem, (x, y) => [0.95 + 0.25 * (y / top), 1.1 + 0.15 * (y / top), 0.85]); // greener and paler toward the top
  const sucker = soft(new THREE.CylinderGeometry(0.018, 0.026, sh, 6, 1), { transform: g => g.translate(sx, sh / 2, sz) });
  shadeVerts(sucker, () => [1, 1.2, 0.9]);
  const heartAt = [0.14, top - 0.33, 0.03];
  const heart = soft(new THREE.IcosahedronGeometry(0.036, lod ? 0 : 1), { transform: g => { g.scale(0.8, 1.6, 0.8); g.rotateZ(0.2); g.translate(...heartAt); } });
  shadeVerts(heart, () => [1.15, 0.45, 0.75]); // (maroon, from the stem's bark colour)
  // the bunch: a stalk arching out from the crown and hanging down, ringed with tiers of hands
  const fr = [], stalk = [[0.02, top - 0.02, 0], [0.1, top - 0.05, 0.01], [0.135, top - 0.13, 0.02], [0.14, top - 0.3, 0.03]];
  for (let k = 1; k < stalk.length; k++) fr.push(rod(stalk[k - 1], stalk[k], 0.014, 0.011, 4));
  for (let t = 0, tiers = lod ? 4 : 6; t < tiers; t++) {
    const y = top - 0.1 - t * 0.03, rad = 0.05 - t * 0.003, cx = 0.135 + t * 0.001, cz = 0.022 + t * 0.001;
    for (let f = 0, nf = lod ? 6 : 10; f < nf; f++) {
      const a = f / nf * 6.28 + t * 0.4, ox = Math.cos(a) * rad, oz = Math.sin(a) * rad;
      fr.push(rod([cx + ox * 0.45, y, cz + oz * 0.45], [cx + ox * 1.2, y + 0.055, cz + oz * 1.2], 0.011, 0.008, lod ? 3 : 4)); // (bananas point up, curving away from the stalk)
    }
  }
  return { crown, trunk: merge([stem, sucker, heart]), fruit: merge(fr) };
}

// Buriti: one straight trunk and a round head of stiff fan leaves.
export function fanPalm(opts, seed, lod = 0) {
  const r = mulberry32(seed);
  const H = opts.height, parts = [], pos = [], col = [];
  const n = lod ? 7 : 12;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), a = k * 2.39996 + r() * 0.3, up = 1.05 - u * 1.35 + (r() - 0.5) * 0.24;
    const joint = [Math.cos(a) * 0.2 * Math.cos(up), H + Math.sin(up) * 0.2 - u * 0.07, Math.sin(a) * 0.2 * Math.cos(up)];
    parts.push(rod([0, H - 0.025, 0], joint, 0.009, 0.004, 4));
    const at = (phi, t, fold = 0) => {
      const reach = Math.cos(phi) * 0.4 * t, side = Math.sin(phi) * 0.4 * t;
      return [joint[0] + Math.cos(a) * reach * Math.cos(up) - Math.sin(a) * side,
        joint[1] + reach * Math.sin(up) + fold * t - 0.035 * t * t,
        joint[2] + Math.sin(a) * reach * Math.cos(up) + Math.cos(a) * side];
    };
    const tri = (p, q, s, shade) => { pos.push(...p, ...q, ...s); for (let j = 0; j < 3; j++) col.push(shade, shade, shade); };
    // A joined inner web opens into pleated fingers, each narrowing to its own point.
    for (let j = 0, m = lod ? 7 : 11; j < m; j++) {
      const left = -1 + j / m * 2, right = -1 + (j + 1) / m * 2, mid = (left + right) / 2;
      const wl = at(left, 0.46), wr = at(right, 0.46), wm = at(mid, 0.46, 0.02);
      const tip = at(mid, 1, 0.012), ol = at(left + (right - left) * 0.16, 0.87), orr = at(right - (right - left) * 0.16, 0.87);
      tri(joint, wl, wm, 0.83); tri(joint, wm, wr, 0.95);
      tri(wl, ol, tip, 0.94); tri(wl, tip, wm, 1.04); tri(wm, tip, wr, 1.08); tri(wr, tip, orr, 0.98);
    }
  }
  strap({ base: [0, H + 0.025, 0], az: 0, elev: 1.48, droop: 0.08, L: 0.3, w: 0.022, segs: 2, shade: 1.08 }, pos, col);
  // a skirt of dead brown fronds hanging below the crown
  for (let k = 0; k < (lod ? 3 : 6); k++) {
    const a = r() * 6.28;
    const dead = ribbon(0.3, 0.05, 0.3, 2, a, 2.6, 0, 0, 0x8a6a40);
    dead.translate(0, H - 0.02, 0);
    parts.push(dead);
  }
  const crown = merge([twoSided(sheet(pos, col)), twoSided(merge(parts))]);
  return { crown, trunk: trunk(H, 0.06, 0.05) };
}

// Cecropia: a pale, bare trunk forking into a few upturned branches, each ending in a flat
// umbrella of huge hand-shaped leaves.
export function cecropia(opts, seed, lod = 0) {
  const r = mulberry32(seed);
  const H = opts.height, fork = H * 0.62;
  const limbs = [trunk(fork + 0.05, 0.045, 0.035)], leaves = [];
  const n = 3 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.28 + r() * 0.5, len = H - fork + (r() - 0.5) * 0.2, out = 0.22 + r() * 0.15;
    const ex = Math.cos(a) * out, ez = Math.sin(a) * out, ey = fork + len;
    const b = rod([0, fork, 0], [ex, ey, ez], .026, .018);
    limbs.push(b);
    // umbrella: a few overlapping flattened lobes, pale underneath
    for (let l = 0; l < (lod ? 3 : 6); l++) {
      const la = l / 6 * 6.28 + r() * 0.4, lr = 0.1 + r() * 0.04;
      const lobe = soft(new THREE.IcosahedronGeometry(lr, lod ? 0 : 1), { transform: g => {
        g.scale(1.5, 0.22, 0.8); g.rotateY(-la); g.translate(ex + Math.cos(la) * lr * 0.9, ey + 0.02 - l * 0.004, ez + Math.sin(la) * lr * 0.9);
      } });
      shadeVerts(lobe, (x, y) => (y > ey ? 1 : 0.72));
      leaves.push(lobe);
    }
  }
  const crown = merge(leaves);
  volumeNormals(crown, 0, H, 0, 0.35);
  return { crown, trunk: merge(limbs) };
}

// Emergents (Brazil nut, kapok): a tall, straight, clean trunk rising above the canopy to a
// broad, flat-topped crown. Kapoks stand on great buttress roots.
export function emergent(opts, seed, lod = 0) {
  if (opts.fork) return thornTree(opts, seed, lod);
  const r = mulberry32(seed);
  const { height: H, rx, ry, trunkR } = opts;
  const cy = H - ry * 0.9, parts = [];
  const nB = lod ? 9 : 16;
  for (let b = 0; b < nB; b++) {
    const a = r() * 6.28, d = Math.sqrt(r());
    const x = Math.cos(a) * rx * d, z = Math.sin(a) * rx * d * 0.9, y = cy + (r() - 0.35) * ry * (1.2 - d * 0.6);
    const s = rx * (lod ? 0.36 : 0.3) * (0.7 + r() * 0.5);
    const blob = soft(new THREE.IcosahedronGeometry(s, lod ? 0 : 1), { seed: seed + b * 5, lump: s * 0.25, transform: g => { g.scale(1, 0.62, 1); g.translate(x, y, z); } });
    shadeVerts(blob, (xx, yy) => 0.82 + Math.min(0.24, Math.max(0, (yy - y) / s * 0.5 + 0.5) * 0.24));
    parts.push(blob);
  }
  const crown = merge(parts);
  volumeNormals(crown, 0, cy, 0, 0.5);
  const limbs = [trunk(cy, trunkR, trunkR * 0.72)];
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * 6.28 + r() * 0.5, len = rx * 0.75;
    const base = [0, cy - ry * .4, 0];
    const tip = [Math.cos(a) * Math.sin(1.05) * len, base[1] + Math.cos(1.05) * len, Math.sin(a) * Math.sin(1.05) * len];
    const l = rod(base, tip, trunkR * .5, trunkR * .28);
    limbs.push(l);
  }
  if (opts.buttress) for (let k = 0; k < 5; k++) {
    const a = k / 5 * 6.28 + r() * 0.4;
    const fin = soft(new THREE.BoxGeometry(0.34, 0.5, 0.025), { transform: g => {
      // taper the fin into a triangle: narrow at the top, spreading along the ground
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0) p.setX(i, p.getX(i) * 0.12 - 0.12); }
      g.translate(0.17, 0.25, 0); g.rotateY(-a);
    } });
    limbs.push(fin);
  }
  return { crown, trunk: merge(limbs) };
}

// Thorn-tree foliage follows spreading, repeatedly forked branches in a shallow crown.
// Tall rainforest emergents retain their existing geometry above.
function thornTree(opts, seed, lod) {
  const r = mulberry32(seed), { height: H, rx, ry, trunkR } = opts, cy = H - ry * 0.9, fh = cy * opts.fork;
  const limbs = [trunk(fh + 0.04, trunkR, trunkR * 0.85)], leaves = [], n = lod ? 4 : 6;
  const cloud = (p, sx, sy, sz, salt) => {
    const g = soft(new THREE.IcosahedronGeometry(1, lod ? 0 : 1), { seed: seed + salt, lump: 0.1,
      transform: g => g.scale(sx, sy, sz).translate(...p) });
    shadeVerts(g, (x, y) => 0.8 + Math.min(0.24, Math.max(0, (y - cy + ry) / (ry * 2)) * 0.24)); leaves.push(g);
  };
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.28 + r() * 0.35, d = rx * (0.56 + r() * 0.1), y = cy + (r() - 0.5) * ry * 0.25;
    const elbow = [Math.cos(a) * d * 0.38, fh + (y - fh) * 0.6, Math.sin(a) * d * 0.38];
    const tip = [Math.cos(a) * d, y, Math.sin(a) * d * 0.9];
    limbs.push(rod([0, fh, 0], elbow, trunkR * 0.7, trunkR * 0.37));
    limbs.push(rod(elbow, tip, trunkR * 0.37, trunkR * 0.1));
    cloud(tip, rx * 0.39, ry * 0.88, rx * 0.35, k * 7);
    for (let j = 0, m = lod ? 1 : 2; j < m; j++) {
      const aa = a + (j ? -0.35 : 0.35), out = [Math.cos(aa) * rx * 0.82, y - ry * 0.12, Math.sin(aa) * rx * 0.74];
      limbs.push(rod(elbow, out, trunkR * 0.26, trunkR * 0.07, 4));
      cloud(out, rx * 0.24, ry * 0.64, rx * 0.22, 100 + k * 2 + j);
    }
  }
  cloud([0, cy + ry * 0.06, 0], rx * 0.42, ry * 0.94, rx * 0.38, 201);
  const crown = merge(leaves); volumeNormals(crown, 0, cy, 0, 0.5);
  return { crown, trunk: merge(limbs) };
}

// A tapered branch between two points.
function rod(p0, p1, r0, r1, sides = 5) {
  const a = new THREE.Vector3(...p0), d = new THREE.Vector3(...p1).sub(a), len = d.length() || 1e-3;
  const g = soft(new THREE.CylinderGeometry(r1, r0, len, sides), { transform: g => {
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate(a.x, a.y, a.z);
  } });
  g.userData.canopyBranches = [{ from: p0, to: p1, r0, r1 }];
  return g;
}

// Baobab: a swollen bottle of a trunk, stubby branches like roots in the air, a thin crown.
export function baobab(opts, seed, lod = 0) {
  const r = mulberry32(seed), H = opts.height;
  const top = H * 0.62;
  const profile = [[0.001, 0], [0.3, 0.02], [0.33, top * 0.2], [0.31, top * 0.55], [0.24, top * 0.85], [0.17, top], [0.001, top + 0.02]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const limbs = [soft(new THREE.LatheGeometry(profile, lod ? 7 : 11), { lump: 0.02, seed })];
  const leaves = [];
  const n = lod ? 5 : 7;
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.28 + r() * 0.5, out = 0.28 + r() * 0.18, up = 0.25 + r() * 0.2;
    const tip = [Math.cos(a) * out, top + up, Math.sin(a) * out];
    limbs.push(rod([Math.cos(a) * 0.08, top - 0.02, Math.sin(a) * 0.08], tip, 0.07, 0.035));
    // a stubby side branch
    const t2 = [tip[0] * 1.35 + (r() - 0.5) * 0.1, tip[1] + 0.08, tip[2] * 1.35 + (r() - 0.5) * 0.1];
    limbs.push(rod(tip, t2, 0.035, 0.018, 4));
    for (const p of [tip, t2]) {
      const s = 0.12 + r() * 0.05;
      const blob = soft(new THREE.IcosahedronGeometry(s, lod ? 0 : 1), { seed: seed + k * 7, lump: s * 0.3, transform: g => { g.scale(1, 0.55, 1); g.translate(p[0], p[1] + 0.03, p[2]); } });
      shadeVerts(blob, (xx, yy) => (yy > p[1] + 0.03 ? 1 : 0.78));
      leaves.push(blob);
    }
  }
  const crown = merge(leaves);
  volumeNormals(crown, 0, top + 0.3, 0, 0.5);
  return { crown, trunk: merge(limbs) };
}

// Red mangrove: a dense, dark, rounded crown held up on a tangle of arching stilt roots that
// spring out of the trunk and bow down into the mud and water.
export function mangrove(opts, seed, lod = 0) {
  const r = mulberry32(seed), H = opts.height, base = H * 0.36;
  const limbs = [rod([0, H * 0.14, 0], [0, H * 0.62, 0], 0.045, 0.035)];
  const nRoots = lod ? 6 : 10;
  for (let k = 0; k < nRoots; k++) {
    const a = k / nRoots * 6.28 + r() * 0.4, h0 = base * (0.55 + r() * 0.5), out = 0.3 + r() * 0.14;
    const controlY = h0 + 0.06 + r() * 0.05;
    const at = t => {
      const u = 1 - t, d = u * u * 0.03 + 2 * u * t * out * 0.45 + t * t * out;
      return [Math.cos(a) * d, u * u * h0 + 2 * u * t * controlY - t * t * 0.06, Math.sin(a) * d];
    };
    for (let j = 0, m = lod ? 2 : 4; j < m; j++) limbs.push(rod(at(j / m), at((j + 1) / m), 0.023 - j / m * 0.011, 0.023 - (j + 1) / m * 0.011, lod ? 4 : 5));
    if (!lod && k % 3 === 0) limbs.push(rod(at(0.58), [Math.cos(a + 0.18) * out, -0.06, Math.sin(a + 0.18) * out], 0.015, 0.009, 4));
  }
  const leaves = [], n = lod ? 5 : 9;
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.28 + r(), d = k === 0 ? 0 : 0.18 + r() * 0.22, s = 0.2 + r() * 0.08;
    const p = [Math.cos(a) * d, H * 0.72 + r() * 0.14 - d * 0.25, Math.sin(a) * d];
    if (k > 0) limbs.push(rod([0, H * 0.58, 0], [p[0], p[1] - 0.025, p[2]], 0.024, 0.007, lod ? 4 : 5));
    const blob = soft(new THREE.IcosahedronGeometry(s, lod ? 0 : 1), { seed: seed + k * 5, lump: s * 0.25, transform: g => { g.scale(1, 0.7, 1); g.translate(p[0], p[1], p[2]); } });
    shadeVerts(blob, (xx, yy) => (yy > p[1] ? 1 : 0.75));
    leaves.push(blob);
  }
  const crown = merge(leaves);
  volumeNormals(crown, 0, H * 0.75, 0, 0.45);
  return { crown, trunk: merge(limbs) };
}

// Candelabra tree: a short trunk holding up a crown of thick green succulent arms that curve
// out and then straight up. The arms are the "leaves" (painted with the leaf colour).
export function euphorbia(opts, seed, lod = 0) {
  const r = mulberry32(seed), H = opts.height, base = H * 0.28;
  const arms = [];
  arms.push(rod([0, base, 0], [0, H, 0], 0.075, 0.06, 6));
  const n = lod ? 6 : 10;
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.28 + r() * 0.4, tier = base + 0.08 + (k % 3) * 0.12, out = 0.22 + r() * 0.2, rise = H * (0.55 + r() * 0.35);
    const elbow = [Math.cos(a) * out, tier + 0.1, Math.sin(a) * out];
    arms.push(rod([0, tier, 0], elbow, 0.055, 0.05, 5));
    arms.push(rod(elbow, [elbow[0], Math.min(H, tier + rise * 0.6), elbow[2]], 0.05, 0.042, 5));
  }
  const crown = merge(arms);
  return { crown, trunk: trunk(base + 0.05, 0.085, 0.075) };
}

// ---------------------------------------------------------------- corals
// Each coral is its "crown" (painted with the coral's colour); its "trunk" is the little knob of old
// reef rock it grew on, in the rock's colour.
const reefRock = (seed, r = 0.12) => soft(new THREE.IcosahedronGeometry(r, 0), { seed, lump: r * 0.4, transform: g => { g.scale(1.3, 0.45, 1.1); } });

// Staghorn: a thicket of branches forking up and out from the base, paler at the growing tips.
export function staghorn(opts, seed, lod = 0) {
  const r = mulberry32(seed), H = opts.height, parts = [];
  const branch = (p0, dir, len, rad, depth) => {
    const p1 = [p0[0] + dir[0] * len, p0[1] + dir[1] * len, p0[2] + dir[2] * len];
    parts.push(rod(p0, p1, rad, rad * 0.72, lod ? 4 : 5));
    if (depth === 0 || (lod && depth < 2)) { parts.push(soft(new THREE.IcosahedronGeometry(rad * 0.8, 0), { transform: g => g.translate(...p1) })); return; }
    const forks = depth > 1 ? 3 : 2;
    for (let k = 0; k < forks; k++) {
      const a = r() * 6.28, out = 0.3 + r() * 0.35;
      const d = new THREE.Vector3(dir[0] + Math.cos(a) * out, dir[1] + 0.3, dir[2] + Math.sin(a) * out).normalize();
      branch(p1, [d.x, d.y, d.z], len * (0.6 + r() * 0.2), rad * 0.78, depth - 1);
    }
  };
  // a dense, rounded thicket of stubby, finger-thick branches
  const n = lod ? 6 : 9;
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.28 + r() * 0.6, out = 0.35 + r() * 0.5;
    const d = new THREE.Vector3(Math.cos(a) * out, 1, Math.sin(a) * out).normalize();
    branch([Math.cos(a) * 0.05, 0.02, Math.sin(a) * 0.05], [d.x, d.y, d.z], H * (0.3 + r() * 0.12), 0.05, 2);
  }
  const crown = merge(parts);
  shadeVerts(crown, (x, y) => 0.7 + 0.6 * Math.min(1, y / H)); // darker deep in the thicket, bright where it's growing
  return { crown, trunk: reefRock(seed) };
}

// Table coral: a short stalk holding up a broad, nearly flat plate, its rim a little wavy and
// its underside in shadow.
export function tableCoral(opts, seed, lod = 0) {
  const r = mulberry32(seed), H = opts.height, R = 0.38 + r() * 0.08;
  const plate = soft(new THREE.CylinderGeometry(R, R * 0.82, 0.07, lod ? 10 : 22, 1), { seed, lump: 0.05, transform: g => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z); p.setY(i, p.getY(i) + d * d * 0.18 + Math.sin(Math.atan2(z, x) * 5) * 0.015 * d); }
    g.translate(0, H * 0.82, 0);
  } });
  shadeVerts(plate, (x, y, z) => (y > H * 0.84 ? 1.0 + 0.12 * Math.sin(Math.atan2(z, x) * 13) : 0.6)); // fine radial ridges on top, shadow underneath
  const stalk = rod([0, 0, 0], [0.02, H * 0.8, 0], 0.07, 0.05, lod ? 5 : 7);
  const parts = [plate, stalk];
  if (!lod && r() < 0.6) { // a second, smaller plate to one side
    const a = r() * 6.28, d = 0.18;
    parts.push(soft(new THREE.CylinderGeometry(0.22, 0.18, 0.05, 14, 1), { seed: seed + 3, lump: 0.03, transform: g => g.translate(Math.cos(a) * d, H * 0.45, Math.sin(a) * d) }));
    parts.push(rod([Math.cos(a) * d * 0.6, 0, Math.sin(a) * d * 0.6], [Math.cos(a) * d, H * 0.44, Math.sin(a) * d], 0.04, 0.03, 5));
  }
  return { crown: merge(parts), trunk: reefRock(seed, 0.1) };
}

// Boulder coral: a big, lumpy, rounded mound of smaller domes.
export function boulderCoral(opts, seed, lod = 0) {
  const r = mulberry32(seed), H = opts.height, parts = [];
  const dome = (x, z, rad, h) => parts.push(soft(new THREE.IcosahedronGeometry(rad, lod ? 1 : 2), { seed: seed + parts.length * 7, lump: rad * 0.18, transform: g => { g.scale(1, h / rad, 1); g.translate(x, 0, z); } }));
  dome(0, 0, 0.4, H);
  for (let k = 0, m = lod ? 3 : 6; k < m; k++) { const a = r() * 6.28, d = 0.22 + r() * 0.16, rad = 0.14 + r() * 0.1; dome(Math.cos(a) * d, Math.sin(a) * d, rad, H * (0.55 + r() * 0.35)); }
  const crown = merge(parts);
  shadeVerts(crown, (x, y) => 0.7 + 0.42 * Math.min(1, Math.max(0, y) / H));
  return { crown, trunk: reefRock(seed, 0.1) };
}

// Brain coral: one smooth dome, ridged all over with meandering grooves.
export function brainCoral(opts, seed, lod = 0) {
  const H = opts.height, R = 0.36;
  const g = soft(new THREE.IcosahedronGeometry(R, lod ? 2 : 4), { seed, lump: 0.02, transform: gg => { gg.scale(1, H / R, 1); } });
  const k = (seed % 7) * 0.7;
  shadeVerts(g, (x, y, z) => {
    const m = Math.sin(x * 26 + Math.sin(z * 17 + k) * 2.2) * Math.cos(z * 21 + Math.sin(x * 13) * 1.8);
    return (0.68 + 0.4 * Math.min(1, Math.max(0, y) / H)) * (Math.abs(m) < 0.28 ? 0.62 : 1); // dark valleys between the ridges
  });
  return { crown: g, trunk: reefRock(seed, 0.08) };
}

// Plating coral: tiers of thin, wavy plates spiralling up and out from the middle.
export function platingCoral(opts, seed, lod = 0) {
  const r = mulberry32(seed), H = opts.height, parts = [];
  for (let k = 0, m = lod ? 4 : 8; k < m; k++) {
    const a = k * 2.4 + r() * 0.5, tier = k / m, R = 0.16 + (1 - tier) * 0.12 + r() * 0.04, d = 0.06 + (1 - tier) * 0.14;
    parts.push(soft(new THREE.CircleGeometry(R, lod ? 7 : 14, 0, Math.PI * 1.3), { seed: seed + k, transform: g => {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), q = Math.hypot(x, y); p.setZ(i, Math.sin(Math.atan2(y, x) * 4) * 0.025 * q / R - q * q * 0.5); }
      g.rotateX(-Math.PI / 2 + 0.35); g.rotateY(a); g.translate(Math.cos(a) * d, 0.05 + tier * H * 0.85, Math.sin(a) * d);
    } }));
  }
  const crown = twoSided(merge(parts));
  shadeVerts(crown, (x, y) => 0.7 + 0.5 * Math.min(1, y / H));
  return { crown, trunk: reefRock(seed, 0.1) };
}

// A giant clam's two shells, sunk hinge-down in the reef with the opening facing up: heavy, pale
// and deeply fluted, each with five big ribs that run from the hinge out to the rim, so the rims
// are zig-zagged and the two shells' points interlock along the gape. (The mantle is drawn by
// shrub('clam'), in the clam's own colour; these take a shell colour.)
export function clamShell(seed = 1) {
  const parts = [], L = 0.44, W = 0.15, H = 0.085, U = 60, V = 12, PH = 0.82 * Math.PI;
  for (const side of [1, -1]) {
    const pos = [], col = [], idx = [];
    for (let i = 0; i <= U; i++) {
      const u = i / U, x = (u - 0.5) * L, R = Math.pow(Math.max(0, 1 - Math.pow(2 * u - 1, 2)), 0.45);
      const fq = u * 2.5 + (side < 0 ? 0.5 : 0), fold = 1 - 2 * Math.abs(2 * (fq - Math.floor(fq)) - 1); // five sharp ribs (a triangle wave), offset on the other shell so the points interlock
      for (let j = 0; j <= V; j++) {
        const v = j / V, ph = v * PH, k = 1 + 0.3 * fold * Math.pow(v, 1.4);
        const r = R * k;
        pos.push(x, H * r * (1 - Math.cos(ph)), side * W * r * Math.sin(ph) + side * 0.008);
        const sh = (0.6 + 0.4 * (fold * 0.5 + 0.5)) * (0.72 + 0.28 * v) * (j === V ? 1.12 : 1); // darker in the grooves and low down
        col.push(sh, sh, sh);
      }
    }
    for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
      const a = i * (V + 1) + j, b = a + V + 1;
      side > 0 ? idx.push(a, b, a + 1, b, b + 1, a + 1) : idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const ng = g.toNonIndexed(); ng.computeVertexNormals();
    parts.push(twoSided(ng));
  }
  return merge(parts);
}

// Shade cloth over a patch of reef in a marine heatwave: a square of dark mesh hung just under the
// surface on a frame, with a white float at each corner. (Unit tile, centred, at its own surface.)
export function shadeCloth() {
  // (an open weave of dark strips, so the corals still show through it)
  const parts = [];
  for (let k = 0; k < 7; k++) {
    const o = -0.45 + k * 0.15;
    parts.push(at(prep(new THREE.BoxGeometry(0.96, 0.01, 0.045), 0xffffff), 0, 0, o));
    parts.push(at(prep(new THREE.BoxGeometry(0.045, 0.012, 0.96), 0xffffff), o, 0, 0));
  }
  for (const [x, z] of [[-0.47, -0.47], [0.47, -0.47], [-0.47, 0.47], [0.47, 0.47]]) {
    parts.push(prep(new THREE.BoxGeometry(0.03, 0.03, 0.03), 0xffffff)); at(parts[parts.length - 1], x, 0.0, z);
    const f = prep(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 8), 0xffffff); at(f, x, 0.028, z);
    shadeVerts(f, () => [6, 6, 6]); // (the instance colour is the cloth's dark green: floats show white)
    parts.push(f);
  }
  return merge(parts);
}

// A reef star: a six-armed steel frame, coated in sand, pegged down over loose rubble; each arm
// arches up from the middle and down to a foot. They're laid in webs, and corals are tied onto them.
export function reefStar(seed) {
  const r = mulberry32(seed), parts = [];
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2 + r() * 0.08, c = Math.cos(a), s = Math.sin(a);
    const p0 = [0, 0.09, 0], p1 = [c * 0.22, 0.1, s * 0.22], p2 = [c * 0.4, 0.05, s * 0.4], p3 = [c * 0.46, 0.0, s * 0.46];
    parts.push(rod(p0, p1, 0.026, 0.025, 5), rod(p1, p2, 0.025, 0.024, 5), rod(p2, p3, 0.024, 0.022, 5));
    parts.push(soft(new THREE.IcosahedronGeometry(0.032, 0), { transform: g => g.translate(...p3) })); // the foot
  }
  parts.push(soft(new THREE.IcosahedronGeometry(0.05, 1), { transform: g => { g.scale(1, 0.7, 1); g.translate(0, 0.09, 0); } })); // the welded hub
  const g = merge(parts);
  shadeVerts(g, (x, y, z) => 0.85 + 0.25 * Math.abs(Math.sin(x * 40 + z * 37))); // a rough coat of sand
  return g;
}

// ---------------------------------------------------------------- shrubs
// Pandan's branches: two or three (one to three in life, but each map only gets a couple of
// variants), each ending in a tuft (shared by the plant and its fruit, at either lod).
const PANDAN_TT = 0.36;
function pandanBranches(seed) {
  const r = mulberry32(seed * 7 + 5), nb = r() < 0.6 ? 2 : 3, out = [];
  for (let b = 0; b < nb; b++) {
    const a = b / nb * 6.28 + r(), d = 0.15 + r() * 0.08;
    out.push({ tip: [Math.cos(a) * d, PANDAN_TT + 0.16 + r() * 0.12, Math.sin(a) * d], elbow: [Math.cos(a) * d * 0.6, PANDAN_TT + 0.05, Math.sin(a) * d * 0.6], a });
  }
  return out;
}

// Where torch ginger's flower stalks stand (shared by the plant and its torches, at either lod).
function gingerStalks(seed) {
  const r = mulberry32(seed * 3 + 11), out = [];
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + r() * 0.9, d = 0.13 + r() * 0.07, h = 0.3 + r() * 0.13, lean = 0.08 + r() * 0.1;
    out.push({ b: [Math.cos(a) * d, 0, Math.sin(a) * d], t: [Math.cos(a) * (d + lean * h), h, Math.sin(a) * (d + lean * h)] });
  }
  return out;
}

export function shrub(type, seed, lod = 0) {
  const r = mulberry32(seed);
  const parts = [];
  let cy = 0.2;
  const blob = (x, y, z, s, sy = 0.85, shade = 1) => {
    const g = soft(new THREE.IcosahedronGeometry(s * (lod ? 1.15 : 1), lod ? 0 : 1), { seed: seed + parts.length * 3, lump: s * 0.3, transform: gg => { gg.scale(1, sy, 1); gg.translate(x, y, z); } });
    shadeVerts(g, (xx, yy) => shade * (0.8 + Math.min(0.3, (yy - y + s) / (2 * s) * 0.3)));
    parts.push(g);
  };
  // woody stems, darkened to read as bark under the leaf colour the instance carries
  const stem = (p, q, r0, r1, sides = lod ? 3 : 4) => parts.push(shadeVerts(rod(p, q, r0, r1, sides), () => [0.62, 0.5, 0.42]));
  switch (type) {
    case 'bramble':
      cy = 0.16;
      for (let k = 0; k < 10; k++) { const a = r() * 6.28, d = r() * 0.3; blob(Math.cos(a) * d, 0.1 + r() * 0.12, Math.sin(a) * d, 0.15 + r() * 0.07, 0.68, 0.8 + r() * 0.2); }
      for (let k = 0; k < (lod ? 0 : 6); k++) { // (the thin arching canes are too fine to see on the simple model)
        const c = prep(new THREE.TorusGeometry(0.19 + r() * 0.1, 0.009, 4, 12, Math.PI), 0xb07070);
        c.rotateY(r() * Math.PI); at(c, (r() - 0.5) * 0.4, 0.04, (r() - 0.5) * 0.4); parts.push(c);
      }
      break;
    case 'heliconia': {
      // upright paddle leaves on long stalks
      cy = 0.35;
      for (let k = 0; k < (lod ? 5 : 9); k++) parts.push(twoSided(ribbon(0.46 + r() * 0.2, 0.075, 0.5 + r() * 0.4, lod ? 2 : 4, r() * 6.28, 0.12 + r() * 0.3, (r() - 0.5) * 0.12, (r() - 0.5) * 0.12, 0xffffff, 0.015)));
      break;
    }
    case 'aloe': {
      // a rosette of thick, pointed, curving leaves
      cy = 0.2;
      const n = lod ? 8 : 14;
      for (let k = 0; k < n; k++) parts.push(twoSided(ribbon(0.24 + r() * 0.08, 0.06, 0.7 + r() * 0.3, lod ? 2 : 3, k / n * 6.28 + r() * 0.3, 0.35 + (k % 3) * 0.25, 0, 0, 0xffffff, 0.03)));
      break;
    }
    case 'cactus': {
      // prickly pear: flat oval pads growing out of each other's edges
      cy = 0.3;
      const pads = [[0, 0.14, 0, 0]];
      for (let k = 1; k < (lod ? 6 : 10); k++) {
        const pr = pads[Math.floor(r() * pads.length)], a = r() * 6.28;
        pads.push([pr[0] + Math.cos(a) * 0.1, Math.min(0.62, pr[1] + 0.11 + r() * 0.05), pr[2] + Math.sin(a) * 0.1, a]);
      }
      for (const [x, y, z, a] of pads) {
        const pad = soft(new THREE.IcosahedronGeometry(0.1, lod ? 0 : 1), { seed: seed + parts.length, lump: 0.01, transform: g => { g.scale(0.9, 1.15, 0.28); g.rotateZ((r() - 0.5) * 0.7); g.rotateY(a); g.translate(x, y, z); } });
        shadeVerts(pad, (xx, yy) => 0.82 + (yy - y + 0.1) * 0.9);
        parts.push(pad);
      }
      break;
    }
    case 'bamboo': {
      // a clump of arching culms, feathery with narrow leaves toward the tops
      cy = 0.5;
      for (let k = 0; k < (lod ? 5 : 8); k++) {
        const a = r() * 6.28, lean = 0.1 + r() * 0.25, h = 0.75 + r() * 0.35, bx = Math.cos(a) * 0.05, bz = Math.sin(a) * 0.05;
        const tx = bx + Math.cos(a) * Math.sin(lean) * h, tz = bz + Math.sin(a) * Math.sin(lean) * h, ty = Math.cos(lean) * h;
        parts.push(soft(new THREE.CylinderGeometry(0.008, 0.014, h, 4), { color: 0xd8e0a0, transform: g => {
          g.translate(0, h / 2, 0);
          g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(tx - bx, ty, tz - bz).normalize()));
          g.translate(bx, 0, bz);
        } }));
        for (let l = 0; l < (lod ? 2 : 4); l++) {
          const t = 0.55 + l * 0.13;
          parts.push(twoSided(ribbon(0.16, 0.03, 0.9, 2, r() * 6.28, 0.9 + r() * 0.4, bx + (tx - bx) * t, bz + (tz - bz) * t)).translate(0, ty * t, 0));
        }
      }
      break;
    }
    case 'rattan': {
      // climbing rattan (Calamus): a clump of thin, spiny canes sprawling out under arching
      // pinnate fronds, and long whippy tendrils (cirri) reaching out to hook on and climb
      cy = 0.25;
      const pos = [], col = [];
      for (let k = 0, ns = lod ? 4 : 6; k < ns; k++) {
        const a = k / ns * 6.28 + r() * 0.8, lean = 0.35 + r() * 0.5, h = 0.3 + r() * 0.25;
        const b = [Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03], tip = [b[0] + Math.cos(a) * Math.sin(lean) * h, Math.cos(lean) * h, b[2] + Math.sin(a) * Math.sin(lean) * h];
        parts.push(shadeVerts(rod(b, tip, 0.011, 0.007, 4), () => [0.8, 0.7, 0.45]));
        if (!lod) for (let j = 1; j <= 3; j++) { // spines on the leaf sheaths
          const t = j / 4, sa = a + j * 2.2, p = [b[0] + (tip[0] - b[0]) * t, tip[1] * t, b[2] + (tip[2] - b[2]) * t];
          parts.push(shadeVerts(rod(p, [p[0] + Math.cos(sa) * 0.03, p[1] + 0.012, p[2] + Math.sin(sa) * 0.03], 0.004, 0.0006, 3), () => 0.4));
        }
        for (let f = 0; f < (lod ? 2 : 3); f++) {
          const last = f === (lod ? 1 : 2), t = last ? 1 : 0.5 + f * 0.25, p = [b[0] + (tip[0] - b[0]) * t, tip[1] * t, b[2] + (tip[2] - b[2]) * t];
          frond({ base: p, az: last ? a : a + (f % 2 ? 1 : -1) * (0.7 + r() * 0.6), elev: 0.55 + r() * 0.3, droop: 1.4, L: 0.32 + r() * 0.12,
            n: lod ? 5 : 8, w: lod ? 0.13 : 0.11, segs: lod ? 2 : 3, bare: 0.08, v: 0.15, sweep: 0.45, hang: 0.45, rib: 0.006, fill: lod ? 0.9 : 0.6 }, pos, col);
        }
      }
      // cirri: long thin whips arching out and down to the ground
      for (let k = 0, nc = lod ? 2 : 4; k < nc; k++) {
        const a = r() * 6.28, h0 = 0.28 + r() * 0.14, reach = 0.42 + r() * 0.2, pts = [];
        for (let j = 0; j <= 5; j++) { const t = j / 5; pts.push([Math.cos(a) * (0.08 + reach * t), h0 + 0.16 * Math.sin(Math.PI * t * 0.7) - (h0 + 0.02) * t ** 2.2, Math.sin(a) * (0.08 + reach * t)]); }
        for (let j = 0; j < 5; j++) parts.push(shadeVerts(rod(pts[j], pts[j + 1], 0.005 - j * 0.0007, 0.0044 - j * 0.0007, 3), () => [1.05, 1, 0.65]));
      }
      parts.push(twoSided(sheet(pos, col)));
      break;
    }
    case 'pandan': {
      // screw pine (Pandanus) of the peat swamps: a short trunk perched on a cone of stilt roots,
      // forking into one to three branches, each ending in a spiralling tuft of long, stiff,
      // keeled strap leaves, twisted and drooping at the tips
      cy = 0.45;
      const pos = [], col = [], wood = () => [1.25, 0.98, 0.75], tb = 0.16, tt = PANDAN_TT;
      for (let k = 0, nr = lod ? 5 : 7; k < nr; k++) {
        const a = k / nr * 6.28 + r() * 0.4, out = 0.12 + r() * 0.05, h0 = tb + r() * 0.07;
        const p0 = [Math.cos(a) * 0.015, h0, Math.sin(a) * 0.015], knee = [Math.cos(a) * out * 0.55, h0 * 0.5, Math.sin(a) * out * 0.55], foot = [Math.cos(a) * out, -0.02, Math.sin(a) * out];
        parts.push(shadeVerts(rod(p0, knee, 0.011, 0.01, 4), wood), shadeVerts(rod(knee, foot, 0.01, 0.009, 4), wood));
      }
      parts.push(shadeVerts(rod([0, tb - 0.03, 0], [0, tt, 0], 0.024, 0.021, lod ? 5 : 6), wood));
      for (const { tip, elbow } of pandanBranches(seed)) {
        parts.push(shadeVerts(rod([0, tt - 0.01, 0], elbow, 0.019, 0.017, 5), wood), shadeVerts(rod(elbow, tip, 0.017, 0.014, 5), wood));
        for (let j = 0, m = lod ? 8 : 12; j < m; j++) {
          const u = j / (m - 1);
          strap({ base: tip, az: j * 2.25 + r() * 0.2, elev: 1.3 - 1.05 * u, droop: 0.8 + 0.8 * u + r() * 0.2, L: (0.3 + 0.16 * u) * (0.9 + r() * 0.2), w: lod ? 0.034 : 0.028,
            segs: lod ? 3 : 4, twist: (r() - 0.5) * 1.6, fold: lod ? 0 : 0.7 }, pos, col);
        }
      }
      parts.push(twoSided(sheet(pos, col)));
      break;
    }
    case 'ginger': {
      // torch ginger (Etlingera): a stand of tall, leafy canes, each with long narrow leaves in
      // two ranks; the flower stalks rise apart from them, shorter, each ending in a green bud
      // (accent('ginger') draws the waxy red torches over the buds while it blooms)
      cy = 0.5;
      const pos = [], col = [];
      for (let k = 0, nk = lod ? 5 : 7; k < nk; k++) {
        const a = r() * 6.28, d = 0.02 + r() * 0.07, lean = 0.06 + r() * 0.2, h = 0.72 + r() * 0.3;
        const b = [Math.cos(a) * d, 0, Math.sin(a) * d], tip = [b[0] + Math.cos(a) * Math.sin(lean) * h, Math.cos(lean) * h, b[2] + Math.sin(a) * Math.sin(lean) * h];
        parts.push(shadeVerts(rod(b, tip, 0.009, 0.006, 4), () => [0.8, 0.85, 0.6]));
        const plane = r() * 6.28;
        for (let l = 0, nl = lod ? 4 : 7; l < nl; l++) {
          const t = 0.34 + 0.64 * l / (nl - 1), p = [b[0] + (tip[0] - b[0]) * t, tip[1] * t, b[2] + (tip[2] - b[2]) * t];
          strap({ base: p, az: plane + (l % 2 ? Math.PI : 0) + (r() - 0.5) * 0.4, elev: 0.75 - 0.3 * t, droop: 1.3, L: (0.34 - 0.08 * t) * (0.9 + r() * 0.2), w: 0.024 * (lod ? 1.3 : 1), segs: 3, lance: true }, pos, col);
        }
      }
      for (const s of gingerStalks(seed)) {
        parts.push(shadeVerts(rod(s.b, s.t, 0.006, 0.005, 4), () => [1.1, 1.1, 0.7]));
        parts.push(soft(new THREE.IcosahedronGeometry(0.017, 0), { transform: g => { g.scale(1, 1.4, 1); g.translate(s.t[0], s.t[1] + 0.012, s.t[2]); } }));
      }
      parts.push(twoSided(sheet(pos, col)));
      break;
    }
    case 'willow':
      cy = 0.45;
      for (let k = 0; k < 7; k++) { const a = r() * 6.28, d = r() * 0.12; blob(Math.cos(a) * d, 0.28 + r() * 0.34, Math.sin(a) * d, 0.11 + r() * 0.04, 2.0, 0.85 + r() * 0.2); }
      break;
    case 'broom':
      cy = 0.3;
      for (let k = 0; k < 18; k++) {
        const c = soft(new THREE.CylinderGeometry(0.004, 0.012, 0.45 + r() * 0.2, 4), { transform: g => { g.translate(0, 0.25, 0); g.rotateX((r() - 0.5) * 0.8); g.rotateZ((r() - 0.5) * 0.8); g.translate((r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.1); } });
        parts.push(c);
      }
      break;
    case 'salal': case 'holly':
      cy = 0.1;
      for (let k = 0; k < 8; k++) { const a = r() * 6.28, d = r() * 0.24; blob(Math.cos(a) * d, 0.08 + r() * 0.08, Math.sin(a) * d, 0.11 + r() * 0.05, 0.72, 0.75 + r() * 0.2); }
      break;
    case 'vinemaple':
      cy = 0.35;
      for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) { const a = r() * 6.28, d = r() * 0.24; blob(Math.cos(a) * d, 0.18 + k * 0.15, Math.sin(a) * d, 0.16 - k * 0.03, 0.45, 0.8 + k * 0.1); }
      break;
    // ---- the reef's "shrubs": soft corals, sea fans, anemones, giant clams and starfish
    case 'softcoral': {
      // leather coral: a thick stalk under a wide, deeply folded cap
      cy = 0.16;
      parts.push(rod([0, 0, 0], [0, 0.12, 0], 0.07, 0.08, 7));
      parts.push(soft(new THREE.CylinderGeometry(0.22, 0.14, 0.06, lod ? 10 : 24, 1), { seed, transform: g => {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z), a = Math.atan2(z, x); p.setY(i, p.getY(i) + Math.sin(a * 7 + 1) * 0.045 * d / 0.22); }
        g.translate(0, 0.15, 0);
      } }));
      break;
    }
    case 'seafan': {
      // a gorgonian: a broad, flat lattice fan standing up into the current
      cy = 0.25;
      const fan = prep(new THREE.CircleGeometry(0.3, lod ? 8 : 16, 0.15, Math.PI - 0.3).translate(0, 0.05, 0));
      shadeVerts(fan, (x, y) => 0.8 + y * 0.6);
      parts.push(twoSided(fan));
      for (let k = 0; k < (lod ? 3 : 6); k++) { const a = 0.3 + k / 5 * (Math.PI - 0.6); parts.push(rod([0, 0.02, 0.005], [Math.cos(a) * 0.3, 0.05 + Math.sin(a) * 0.3, 0.005], 0.012, 0.005, 4)); }
      parts.push(rod([0, 0, 0], [0, 0.06, 0], 0.025, 0.02, 5));
      const g = merge(parts); return g;
    }
    case 'anemone': {
      // a column topped with a mop of fat, rounded tentacles that sway in the current
      cy = 0.12;
      parts.push(rod([0, 0, 0], [0, 0.08, 0], 0.13, 0.15, 9));
      for (let k = 0, m = lod ? 14 : 34; k < m; k++) {
        const a = r() * 6.28, d = Math.sqrt(r()) * 0.15, out = d / 0.15;
        const p0 = [Math.cos(a) * d, 0.08, Math.sin(a) * d], len = 0.07 + r() * 0.04;
        const p1 = [p0[0] + Math.cos(a) * len * out * 0.8, p0[1] + len * (1 - out * 0.5), p0[2] + Math.sin(a) * len * out * 0.8];
        parts.push(rod(p0, p1, 0.016, 0.014, 4));
        parts.push(soft(new THREE.IcosahedronGeometry(0.016, 0), { transform: g => g.translate(...p1) }));
      }
      const g = merge(parts);
      shadeVerts(g, (x, y) => (y < 0.08 ? 0.62 : 0.9 + y));
      return g;
    }
    case 'clam': {
      // a giant clam's mantle: a fleshy, ruffled oval spread out between the gaping shells, in
      // the instance colour (its blue), mottled, darker round the frilled edge, with the dark
      // slit of its siphon at one end. The shells are their own model (clamShell), in shell colour.
      cy = 0.1;
      const L = 0.4, Wd = 0.1, rimY = 0.128;
      const mantle = soft(new THREE.SphereGeometry(1, lod ? 12 : 28, lod ? 6 : 12), { seed: seed + 5, transform: g => {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
          // (only the very edge ripples, in small waves, like a ruffled lip)
          const edge = Math.max(0, Math.hypot(x, z) - 0.75) / 0.25, frill = 1 + 0.035 * Math.sin(a * 22 + seed) * edge;
          p.setXYZ(i, x * L * 0.5 * frill, rimY + Math.max(-0.4, y) * 0.018 + 0.006 * Math.sin(a * 22 + seed) * edge, z * Wd * frill);
        }
      } });
      shadeVerts(mantle, (x, y, z) => {
        const edge = Math.hypot(x / (L * 0.5), z / Wd);
        if (Math.hypot(x - L * 0.3, z) < 0.025 && y > rimY) return 0.25;            // the siphon
        const spot = speck(Math.round(x * 40) / 40, 0, Math.round(z * 40) / 40, seed) > 0.8 ? 1.35 : 1; // pale flecks
        return (edge > 0.85 ? 0.6 : 1.05) * spot * (y < rimY ? 0.7 : 1);
      });
      parts.push(mantle);
      return merge(parts);
    }
    case 'starfish': {
      // crown-of-thorns: a broad disc with a dozen and more thick arms, bristling with spines
      cy = 0.04;
      parts.push(soft(new THREE.IcosahedronGeometry(0.11, lod ? 1 : 2), { seed, transform: g => { g.scale(1, 0.32, 1); g.translate(0, 0.03, 0); } }));
      const arms = lod ? 9 : 14;
      for (let k = 0; k < arms; k++) {
        const a = k / arms * 6.28 + r() * 0.15, len = 0.2 + r() * 0.05;
        const tip = [Math.cos(a) * (0.08 + len), 0.012, Math.sin(a) * (0.08 + len)];
        parts.push(rod([Math.cos(a) * 0.06, 0.03, Math.sin(a) * 0.06], tip, 0.03, 0.012, 4));
        if (!lod) for (let j = 1; j <= 3; j++) {
          const t = 0.25 + j * 0.2, sx = Math.cos(a) * (0.06 + (len + 0.02) * t), sz = Math.sin(a) * (0.06 + (len + 0.02) * t);
          parts.push(shadeVerts(rod([sx, 0.035, sz], [sx + Math.cos(a) * 0.01, 0.07, sz + Math.sin(a) * 0.01], 0.008, 0.002, 3), () => 1.35));
        }
      }
      for (let k = 0; k < (lod ? 0 : 14); k++) { const a = r() * 6.28, d = r() * 0.08; parts.push(rod([Math.cos(a) * d, 0.05, Math.sin(a) * d], [Math.cos(a) * d, 0.09, Math.sin(a) * d], 0.007, 0.002, 3)); }
      return merge(parts);
    }
    case 'mushroom': {
      // mushroom coral: a single loose, oval disc lying on the sand, its top ridged like a mushroom's gills
      cy = 0.03;
      const g = soft(new THREE.CylinderGeometry(0.16, 0.13, 0.05, lod ? 10 : 28, 1), { seed, transform: gg => {
        const p = gg.attributes.position;
        for (let i = 0; i < p.count; i++) { if (p.getY(i) > 0) p.setY(i, p.getY(i) + 0.03 * (1 - Math.hypot(p.getX(i), p.getZ(i)) / 0.16)); }
        gg.scale(1.25, 1, 0.85); gg.translate(0, 0.025, 0);
      } });
      shadeVerts(g, (x, y, z) => (y > 0.04 ? 0.9 + 0.2 * Math.abs(Math.sin(Math.atan2(z, x) * 14)) : 0.6));
      return g;
    }
    case 'seastar': {
      // a blue sea star: five smooth, round-tipped arms
      cy = 0.03;
      parts.push(soft(new THREE.IcosahedronGeometry(0.05, lod ? 1 : 2), { transform: g => { g.scale(1, 0.4, 1); g.translate(0, 0.02, 0); } }));
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * 6.28 + r() * 0.2, tip = [Math.cos(a) * 0.2, 0.012, Math.sin(a) * 0.2];
        parts.push(rod([Math.cos(a) * 0.03, 0.02, Math.sin(a) * 0.03], tip, 0.03, 0.016, lod ? 4 : 6));
        parts.push(soft(new THREE.IcosahedronGeometry(0.016, 0), { transform: g => g.translate(...tip) }));
      }
      return merge(parts);
    }
    case 'sponge': {
      // a barrel sponge: a thick-walled vase, open at the top
      cy = 0.2;
      const outer = soft(new THREE.CylinderGeometry(0.17, 0.12, 0.34, lod ? 8 : 16, 3, true), { seed, lump: 0.02, transform: g => g.translate(0, 0.17, 0) });
      const inner = soft(new THREE.CylinderGeometry(0.13, 0.09, 0.3, lod ? 8 : 16, 1, true), { transform: g => { g.scale(-1, 1, 1); g.translate(0, 0.2, 0); } });
      shadeVerts(inner, () => 0.45);
      parts.push(outer, inner, soft(new THREE.TorusGeometry(0.15, 0.025, 5, lod ? 8 : 16), { transform: g => { g.rotateX(Math.PI / 2); g.translate(0, 0.34, 0); } }));
      shadeVerts(outer, (x, y) => 0.75 + y * 0.8);
      return merge(parts);
    }
    // ---- growth habits of the broadleaf shrubs (see SHRUB_HABIT in flora.js)
    case 'arching': {
      // canes rising from a leafy crown and arching over, leafy along their outer half (salmonberry, roses)
      cy = 0.24;
      blob(0, 0.15, 0, 0.15, 0.75, 0.78); blob(0.05, 0.27, -0.04, 0.1, 0.8, 0.9);
      for (let k = 0, n = 5; k < n; k++) {
        const a = k / n * 6.28 + r() * 0.8, h = 0.36 + r() * 0.14, reach = 0.3 + r() * 0.12;
        const at = t => [Math.cos(a) * reach * t, h * (2 * t - t * t) - 0.14 * t * t * t, Math.sin(a) * reach * t];
        if (!lod) for (let j = 0; j < 3; j++) stem(at(j / 3), at((j + 1) / 3), 0.011 - j * 0.002, 0.009 - j * 0.002);
        for (let j = 0; j < 3; j++) { const [x, y, z] = at(0.42 + j * 0.27); blob(x, y, z, 0.095 + r() * 0.025 - j * 0.012, 0.66, 0.84 + j * 0.08 + r() * 0.1); }
      }
      break;
    }
    case 'vase': {
      // several upright stems from a spreading base, bare low down, opening into a leafy top (elderberry, red-osier dogwood)
      cy = 0.34;
      for (let k = 0, n = 5; k < n; k++) {
        const a = k / n * 6.28 + r() * 0.6, lean = 0.22 + r() * 0.2, h = 0.42 + r() * 0.16;
        const base = [Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08], tip = [base[0] + Math.cos(a) * Math.sin(lean) * h, Math.cos(lean) * h, base[2] + Math.sin(a) * Math.sin(lean) * h];
        const along = t => [base[0] + (tip[0] - base[0]) * t, tip[1] * t, base[2] + (tip[2] - base[2]) * t];
        stem(base, tip, 0.014, 0.007);
        blob(tip[0], tip[1] - 0.02, tip[2], 0.11 + r() * 0.03, 0.75, 0.92 + r() * 0.12);
        const m = along(0.68); blob(m[0] * 1.2, m[1], m[2] * 1.2, 0.085 + r() * 0.02, 0.7, 0.82 + r() * 0.1);
        const l = along(0.36); blob(l[0] * 1.3, l[1], l[2] * 1.3, 0.06 + r() * 0.02, 0.7, 0.72 + r() * 0.08);
      }
      break;
    }
    case 'airy': {
      // a loose, open dome: fine twigs from a few stems, small sprays of leaves along and at their tips (huckleberry, snowberry)
      cy = 0.22;
      blob(0, 0.13, 0, 0.1, 0.8, 0.75);
      for (let k = 0, n = 12; k < n; k++) {
        const a = k * 2.4 + r() * 0.5, up = 0.45 + r() * 0.8, L = 0.24 + r() * 0.14;
        const root = [Math.cos(k * 2.1) * 0.04, 0.03, Math.sin(k * 2.1) * 0.04];
        const tip = [root[0] + Math.cos(a) * Math.cos(up) * L, 0.05 + Math.sin(up) * L * 1.15, root[2] + Math.sin(a) * Math.cos(up) * L];
        if (!lod) parts.push(shadeVerts(rod(root, tip, 0.005, 0.002, 3), () => [0.8, 0.7, 0.6]));
        blob(tip[0], tip[1], tip[2], 0.065 + r() * 0.025, 0.75, 0.86 + r() * 0.2);
      }
      break;
    }
    case 'bigleaf': {
      // broad leaves held out on short stalks around a leafy core (oakleaf hydrangea, castor bean, sea grape)
      cy = 0.24;
      blob(0, 0.16, 0, 0.13, 0.85, 0.72); blob(0.04, 0.27, -0.03, 0.09, 0.8, 0.8);
      for (let k = 0, n = lod ? 12 : 20; k < n; k++) {
        const t = k / n, a = k * 2.4 + r() * 0.3, y = 0.1 + t * 0.26 + r() * 0.04, d = 0.13 - t * 0.06;
        const len = 0.13 + r() * 0.04, wid = len * (0.6 + r() * 0.2), tilt = 0.5 - t * 0.55 + r() * 0.2;
        const leaf = soft(new THREE.CircleGeometry(1, lod ? 5 : 8), { seed: seed + k, transform: g => {
          g.rotateX(-Math.PI / 2); g.scale(len, 1, wid); g.translate(len * 0.85, 0, 0);
          const p = g.attributes.position; // cupped along the midrib, tips falling away
          for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, z * z * 2.2 - x * x * 0.6); }
          g.rotateZ(-tilt); g.rotateY(-a); g.translate(Math.cos(a) * d, y, Math.sin(a) * d);
        } });
        const nr = leaf.attributes.normal; // (thin: let both faces catch the sky)
        for (let i = 0; i < nr.count; i++) { const v = new THREE.Vector3(nr.getX(i), Math.abs(nr.getY(i)), nr.getZ(i)).lerp(new THREE.Vector3(0, 1, 0), 0.5).normalize(); nr.setXYZ(i, v.x, v.y, v.z); }
        parts.push(shadeVerts(twoSided(leaf), () => 0.84 + t * 0.2 + r() * 0.08));
      }
      break;
    }
    default:
      cy = 0.24;
      for (let k = 0; k < 8; k++) { const a = r() * 6.28, d = r() * 0.19; blob(Math.cos(a) * d, 0.15 + r() * 0.16, Math.sin(a) * d, 0.12 + r() * 0.06, 0.85, 0.8 + r() * 0.25); }
  }
  const g = merge(parts);
  if (type !== 'broom' && type !== 'softcoral' && type !== 'bigleaf') volumeNormals(g, 0, cy, 0, 0.55);
  return g;
}

export function twigs(seed, height = 0.5) {
  const r = mulberry32(seed);
  const parts = [];
  for (let k = 0; k < 11; k++) {
    parts.push(soft(new THREE.CylinderGeometry(0.004, 0.011, height * (0.6 + r() * 0.5), 4), {
      transform: g => { g.translate(0, height * 0.35, 0); g.rotateX((r() - 0.5) * 1.0); g.rotateZ((r() - 0.5) * 1.0); g.translate((r() - 0.5) * 0.15, 0, (r() - 0.5) * 0.15); },
    }));
  }
  return merge(parts);
}

// ---------------------------------------------------------------- groundcover tufts
const TITAN_BLOOM = 1.3; // a corpse flower in bloom: about 0.4 tall at the spathe's rim, 0.86 to the spadix tip
// lo: a light version for anything but close-ups (fewer, straighter blades, simpler flowers).
export function tuft(type, seed, lo = false) {
  const r = mulberry32(seed);
  const parts = [];
  const few = n => lo ? Math.max(2, Math.round(n * 0.45)) : n;
  const blades = (n, len, width, bendMax, spread = 0.05) => {
    for (let k = 0, m = few(n); k < m; k++) {
      const dir = r() * 6.28;
      parts.push(ribbon(len * (0.65 + r() * 0.5), width * (lo ? 1.35 : 1), 0.25 + r() * bendMax, lo ? 1 : 2, dir, 0.1 + r() * 0.35, (r() - 0.5) * spread, (r() - 0.5) * spread));
    }
  };
  switch (type) {
    // thick, full clumps: many blades, wider at the base, splayed a little further out
    case 'grass': blades(13, 0.18, 0.019, 0.75, 0.09); break;
    case 'tallgrass': blades(14, 0.3, 0.018, 0.85, 0.1); break;
    case 'savannagrass': blades(16, 0.82, 0.016, 0.65, 0.075); break;
    case 'dropseed': blades(13, 0.32, 0.009, 0.6, 0.065); break;
    case 'papyrus': blades(8, 0.57, 0.007, 0.15, 0.06); break;
    case 'sedge': blades(12, 0.19, 0.018, 1.1, 0.07); break;
    case 'forb': {
      for (let k = 0, m = lo ? 4 : 6; k < m; k++) {
        const a = k / m * 6.28 + r() * 0.4;
        parts.push(soft(new THREE.IcosahedronGeometry(0.035, lo ? 0 : 1), { transform: g => { g.scale(1.6, 0.3, 0.8); g.rotateY(-a); g.translate(Math.cos(a) * 0.045, 0.02, Math.sin(a) * 0.045); } }));
      }
      blades(3, 0.14, 0.006, 0.2, 0.02);
      break;
    }
    case 'tallforb': {
      for (let k = 0; k < 3; k++) {
        const x = (r() - 0.5) * 0.08, z = (r() - 0.5) * 0.08, h = 0.24 + r() * 0.08;
        parts.push(soft(new THREE.CylinderGeometry(0.004, 0.007, h, 4), { transform: g => g.translate(x, h / 2, z) }));
        for (let l = 0, m = lo ? 2 : 4; l < m; l++) parts.push(ribbon(0.07, 0.01, 0.6, lo ? 1 : 2, r() * 6.28, 1.0, x, z).translate(0, h * (0.25 + l * (lo ? 0.34 : 0.17)), 0));
      }
      break;
    }
    case 'fern': {
      const pos = [], col = [];
      for (let k = 0, m = lo ? 5 : 8; k < m; k++) frond({ base: [0, 0.01, 0], az: k / m * 6.28 + r() * 0.2,
        elev: 0.9, droop: 1.2, L: 0.32 + r() * 0.06, n: lo ? 4 : 8, w: 0.045,
        segs: lo ? 2 : 4, bare: 0.1, rib: 0.0025, v: 0.08, fill: 0.7, sweep: 0.35, hang: 0.15 }, pos, col);
      parts.push(sheet(pos, col));
      break;
    }
    case 'cattail': blades(6, 0.44, 0.013, 0.35, 0.08); break;
    case 'lily': {
      // floating round pads with a notch, raised rims on the giant water lily
      for (let k = 0, m = lo ? 2 : 4; k < m; k++) {
        const a = r() * 6.28, d = 0.03 + r() * 0.1, rad = 0.07 + r() * 0.06;
        parts.push(prep(new THREE.CircleGeometry(rad, lo ? 8 : 14, 0.3, 5.9).rotateX(-Math.PI / 2).rotateY(r() * 6.28).translate(Math.cos(a) * d, 0.004 + k * 0.001, Math.sin(a) * d)));
      }
      break;
    }
    case 'tule': {
      for (let k = 0, m = lo ? 4 : 8; k < m; k++) {
        const x = (r() - 0.5) * 0.1, z = (r() - 0.5) * 0.1, h = 0.45 + r() * 0.2;
        parts.push(soft(new THREE.CylinderGeometry(0.003, 0.006, h, 4), { transform: g => { g.translate(0, h / 2, 0); g.rotateZ((r() - 0.5) * 0.25); g.translate(x, 0, z); } }));
      }
      break;
    }
    case 'skunk': {
      for (let k = 0; k < 5; k++) parts.push(ribbon(0.22, 0.05, 0.5, lo ? 2 : 4, k / 5 * 6.28, 0.35, 0, 0, 0xffffff, 0.04));
      break;
    }
    // ---- the reef's groundcover
    case 'seagrass': blades(10, 0.26, 0.014, 0.5, 0.08); break; // long ribbons streaming in the current
    case 'spoongrass': {
      // spoon seagrass: little paired oval leaves on short stalks
      for (let k = 0, m = lo ? 4 : 8; k < m; k++) {
        const a = r() * 6.28, d = r() * 0.07, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.035 + r() * 0.03;
        parts.push(soft(new THREE.IcosahedronGeometry(0.022, lo ? 0 : 1), { transform: g => { g.scale(0.6, 0.18, 1.3); g.rotateY(r() * 6.28); g.rotateX(0.5); g.translate(x, h, z); } }));
        if (!lo) parts.push(soft(new THREE.CylinderGeometry(0.002, 0.003, h, 3), { transform: g => g.translate(x, h / 2, z) }));
      }
      break;
    }
    case 'crust': {
      // coralline algae: thin, knobbly pink crusts spreading over the rubble
      for (let k = 0, m = lo ? 2 : 3; k < m; k++) {
        const a = r() * 6.28, d = r() * 0.14, s0 = 0.04 + r() * 0.035;
        parts.push(soft(new THREE.IcosahedronGeometry(s0, lo ? 0 : 1), { seed: seed + k, lump: s0 * 0.5, transform: g => { g.scale(1.3, 0.12, 1.1); g.translate(Math.cos(a) * d, 0.002, Math.sin(a) * d); } }));
      }
      break;
    }
    case 'turf': blades(16, 0.06, 0.013, 0.9, 0.16); break; // a low, shaggy fuzz of algae
    case 'halimeda': {
      // Halimeda: little upright chains of flat green discs, which crumble into white sand when they die
      for (let k = 0, m = lo ? 2 : 4; k < m; k++) {
        const x0 = (r() - 0.5) * 0.12, z0 = (r() - 0.5) * 0.12, lean = (r() - 0.5) * 0.5, rot = r() * 6.28;
        for (let j = 0, n = lo ? 3 : 5; j < n; j++) {
          const s0 = 0.022 - j * 0.002, y = 0.015 + j * 0.03;
          parts.push(soft(new THREE.IcosahedronGeometry(s0, 0), { transform: g => { g.scale(1, 0.4, 0.25); g.rotateY(rot); g.rotateZ(1.2 + lean); g.translate(x0 + lean * y, y, z0); } }));
        }
      }
      break;
    }
    case 'pitcher': {
      // Nepenthes on wet peat: a low rosette of strap leaves, with tendrils running out to the
      // pitchers (accent('pitcher') draws those, in a colour of their own)
      const pos = [], col = [];
      for (let k = 0, m = lo ? 4 : 7; k < m; k++) strap({ base: [0, 0.008, 0], az: k / m * 6.28 + r() * 0.4, elev: 0.5, droop: 0.75, L: 0.1 + r() * 0.04, w: 0.015 * (lo ? 1.3 : 1), segs: lo ? 2 : 3, lance: true }, pos, col);
      parts.push(sheet(pos, col));
      if (!lo) for (const s of pitcherSpots(seed, 4)) parts.push(rod([s.x * 0.4, 0.035, s.z * 0.4], [s.x, 0.012, s.z], 0.0025, 0.002, 3));
      break;
    }
    case 'titan': {
      // Amorphophallus titanum in leaf: one tall, mottled stalk carrying a single huge leaf, split
      // in three and forked again and again into an umbrella of leaflets, like a small tree
      const Hs = 0.5, pos = [], col = [];
      const mottle = g => blotch(g, 0.4, [2.0, 1.8, 2.7], [0.78, 0.86, 0.7], seed); // pale blotches on dark olive
      parts.push(mottle(soft(new THREE.CylinderGeometry(0.014, 0.022, Hs, lo ? 5 : 7, lo ? 5 : 12), { transform: g => g.translate(0, Hs / 2, 0) })));
      const branch = (p0, az, len, depth) => {
        const rise = [-0.4, 0.0, 0.5][depth], p1 = [p0[0] + Math.cos(az) * len, p0[1] + rise * len, p0[2] + Math.sin(az) * len];
        parts.push(mottle(rod(p0, p1, 0.004 + depth * 0.003, 0.003 + depth * 0.003, 3)));
        if (depth === 0 || (lo && depth === 1)) {
          // the leaflets: pinnate along the last fork, one at the tip
          const big = lo ? 1.35 : 1, at = lo ? [0.4, 0.8] : [0.2, 0.5, 0.8];
          for (const t of at) for (const s of [-1, 1]) strap({ base: [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t], az: az + s * (1.1 - t * 0.4), elev: 0.1, droop: 0.6, L: 0.1 * big, w: 0.028 * big, segs: lo ? 2 : 3, lance: true }, pos, col);
          strap({ base: p1, az, elev: 0.0, droop: 0.6, L: 0.11 * big, w: 0.03 * big, segs: lo ? 2 : 3, lance: true }, pos, col);
          return;
        }
        for (const s of [-1, 1]) branch(p1, az + s * (0.45 + r() * 0.2), len * 0.8, depth - 1);
      };
      for (let k = 0; k < 3; k++) branch([0, Hs, 0], k * 2.094 + r() * 0.3, 0.13, 2);
      parts.push(twoSided(sheet(pos, col)));
      break;
    }
    case 'titanbloom': {
      // ...and once in a long while in flower instead: a huge vase of a spathe, ribbed outside, its
      // rim flared and ruffled, deep maroon within (accent('titanbloom') draws the spadix rising out of it)
      const prof = [[0.035, 0], [0.08, 0.035], [0.1, 0.1], [0.106, 0.17], [0.12, 0.23], [0.155, 0.28], [0.2, 0.305]];
      const seg = lo ? 12 : 22;
      const ruffle = g => {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), t = y / 0.305;
          const f = 1 + 0.12 * Math.sin(a * 9 + 0.5) * t ** 3;
          p.setXYZ(i, x * f, y + 0.025 * Math.sin(a * 7) * t ** 3 - 0.045 * (1 + Math.cos(a)) * t * t, z * f);
        }
      };
      const lathe = (k, dy) => new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x * k, y + dy)), seg);
      parts.push(shadeVerts(soft(lathe(1, 0), { transform: ruffle }), (x, y, z) => (0.55 + 0.25 * y / 0.3) * (0.82 + 0.18 * Math.abs(Math.sin(Math.atan2(z, x) * 11)))));
      parts.push(shadeVerts(soft(lathe(0.93, 0.008), { transform: g => { g.scale(-1, 1, 1); ruffle(g); } }), (x, y) => 0.75 + 0.5 * y / 0.3));
      for (const g of parts) g.scale(TITAN_BLOOM, TITAN_BLOOM, TITAN_BLOOM); // (drawn a bit bigger than life beside its leaf, so it reads as the event it is)
      break;
    }
    default: blades(8, 0.15, 0.012, 0.6);
  }
  return merge(parts);
}

// Where a pitcher plant's pitchers sit (shared by its rosette and the pitchers, at either lod):
// mostly squat, round lower pitchers on the peat, and one taller, slender one.
function pitcherSpots(seed, n) {
  const r = mulberry32(seed * 5 + 3), out = [];
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * 6.28 + r() * 0.9, d = 0.075 + r() * 0.06;
    out.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, s: 0.8 + r() * 0.45, tall: k === 1, rot: r() * 6.28, lean: (r() - 0.5) * 0.4 });
  }
  return out.slice(0, n);
}

// Parts of a plant drawn in a colour of their own, over the plant itself (same position, scale and
// turn, and the same seed and lod):
//   'ginger'     torch ginger's waxy torches on their stalks: the flower colour, while in bloom
//   'pitcher'    the pitchers, mottled red and green: the flower colour, always
//   'pandan'     screw pine's fruit, hanging under the leaf tufts: the berry colour, while fruiting
//   'titanbloom' the corpse flower's tall spadix: look.head (pale yellow), while in bloom
export function accent(type, seed, lo = false) {
  const parts = [];
  switch (type) {
    case 'pandan':
      // big, round, knobbly heads like pineapples, each on a short stalk under a tuft
      for (const { tip, a } of pandanBranches(seed).slice(0, 2)) {
        const f = [tip[0] + Math.cos(a + 1) * 0.03, tip[1] - 0.08, tip[2] + Math.sin(a + 1) * 0.03];
        parts.push(shadeVerts(rod([tip[0], tip[1] - 0.01, tip[2]], f, 0.006, 0.005, 3), () => 0.5));
        parts.push(shadeVerts(soft(new THREE.IcosahedronGeometry(0.045, lo ? 0 : 1), { seed, lump: 0.012, transform: g => { g.scale(1, 1.2, 1); g.translate(f[0], f[1] - 0.04, f[2]); } }),
          (x, y, z) => (0.8 + 0.35 * Math.min(1, Math.max(0, (y - f[1] + 0.09) / 0.1))) * (0.85 + 0.3 * Math.abs(Math.sin(x * 240) * Math.sin(z * 240 + y * 200)))));
      }
      break;
    case 'ginger':
      for (const s of gingerStalks(seed)) {
        const pos = [], col = [];
        // a collar of flared, waxy outer bracts round a tight cone of inner ones
        for (let k = 0, m = lo ? 5 : 8; k < m; k++) strap({ base: [s.t[0], s.t[1] + 0.008, s.t[2]], az: k / m * 6.28, elev: 0.35, droop: 0.9, L: 0.07, w: 0.026, segs: lo ? 1 : 2, lance: true, shade: 1.25 }, pos, col);
        parts.push(twoSided(sheet(pos, col, 0.3)));
        const cone = [[0.001, -0.006], [0.026, 0.004], [0.03, 0.026], [0.024, 0.05], [0.012, 0.068], [0.001, 0.075]].map(([x, y]) => new THREE.Vector2(x, y));
        parts.push(shadeVerts(soft(new THREE.LatheGeometry(cone, lo ? 6 : 9), { transform: g => g.translate(s.t[0], s.t[1] + 0.012, s.t[2]) }), (x, y) => 0.85 + 0.3 * Math.abs(Math.sin((y - s.t[1]) * 160))));
      }
      break;
    case 'pitcher':
      for (const s of pitcherSpots(seed, lo ? 3 : 4)) {
        // a lathed cup: swollen belly, waist, a ridged rim (the peristome) curling into a dark throat
        const prof = s.tall ? [[0.001, 0], [0.016, 0.006], [0.022, 0.03], [0.02, 0.06], [0.016, 0.085], [0.019, 0.1], [0.015, 0.103], [0.011, 0.07]]
          : [[0.001, 0], [0.02, 0.004], [0.029, 0.02], [0.03, 0.036], [0.024, 0.05], [0.027, 0.057], [0.021, 0.061], [0.014, 0.035]];
        const pts = (lo ? prof.filter((p, k) => k !== 2 && k !== 5) : prof).map(([x, y]) => new THREE.Vector2(x * s.s, y * s.s));
        const rimY = (s.tall ? 0.1 : 0.057) * s.s;
        const cup = soft(new THREE.LatheGeometry(pts, lo ? 5 : 7), { transform: g => { g.rotateZ(s.lean); g.rotateY(s.rot); g.translate(s.x, -0.004, s.z); } });
        shadeVerts(cup, (x, y, z) => {
          const t = (y + 0.004) / rimY;
          if (Math.hypot(x - s.x, z - s.z) < 0.016 * s.s && t > 0.4 && t < 0.97) return 0.28; // the throat
          if (t > 0.9) return [1.2, 0.75, 0.8];                                               // the peristome
          return speck(x, y, z, 7) > 0.55 ? [0.5, 3.4, 1.4] : [1, 1, 1];                       // red, mottled green
        });
        parts.push(cup);
        // the lid, standing up over the mouth from the back of the rim
        const lid = soft(new THREE.CircleGeometry(0.017 * s.s, lo ? 4 : 6), { transform: g => {
          g.scale(1, 0.75, 1); g.translate(0, 0.012 * s.s, 0); g.rotateX(-0.35); g.translate(0, rimY, -0.02 * s.s);
          g.rotateZ(s.lean); g.rotateY(s.rot); g.translate(s.x, -0.004, s.z);
        } });
        parts.push(shadeVerts(lid, () => [0.6, 2.6, 1.2]));
      }
      break;
    case 'titanbloom': {
      // the spadix: a tall, hollow, ridged spike, pale yellow, standing twice the spathe's height
      const prof = [[0.001, 0.02], [0.04, 0.04], [0.048, 0.12], [0.046, 0.26], [0.037, 0.42], [0.024, 0.56], [0.01, 0.64], [0.001, 0.66]];
      parts.push(shadeVerts(soft(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), lo ? 7 : 12)),
        (x, y, z) => (0.78 + 0.3 * Math.min(1, y / 0.4)) * (0.88 + 0.12 * Math.abs(Math.sin(Math.atan2(z, x) * 6)))).scale(TITAN_BLOOM, TITAN_BLOOM, TITAN_BLOOM));
      break;
    }
    default: return null;
  }
  return merge(parts);
}

// ---------------------------------------------------------------- features & props
export function snag(seed) {
  const r = mulberry32(seed);
  // The broken tip shares the trunk's upper ring, so the bark wobble cannot
  // pull two separate, differently sized parts out of alignment.
  const profile = [[0, 0], [0.09, 0], [0.077, 0.5], [0.063, 1], [0.05, 1.5], [0, 1.68]];
  const parts = [soft(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 6),
    { lump: 0.09 * 0.25, seed: 5 })];
  for (let k = 0; k < 2; k++) {
    const b = prep(new THREE.CylinderGeometry(0.015, 0.03, 0.35, 4));
    b.translate(0, 0.17, 0); b.rotateZ(k ? 1.1 : -1.2); b.rotateY(r() * 6.28); at(b, 0, 0.8 + k * 0.3, 0); parts.push(b);
  }
  const hole = prep(new THREE.BoxGeometry(0.05, 0.08, 0.02), 0x221a14); at(hole, 0, 0.9, 0.08); parts.push(hole);
  return wobble(merge(parts), 0.01, seed);
}
export function log() {
  const body = prep(new THREE.CylinderGeometry(0.11, 0.12, 0.95, 7), 0x8a6444);
  body.rotateZ(Math.PI / 2); at(body, 0, 0.1, 0);
  const moss = prep(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 7, 1, false, 0, Math.PI), 0x6f8f3a);
  moss.rotateZ(Math.PI / 2); moss.rotateX(-Math.PI / 2); at(moss, -0.05, 0.14, 0);
  return merge([body, moss]);
}
// a cut stump: pale cut face with growth rings, a few roots flaring into the ground
export function stump(seed) {
  const r = mulberry32(seed);
  const parts = [at(prep(new THREE.CylinderGeometry(0.1, 0.135, 0.17, 9), 0x7a5a3e), 0, 0.085, 0)];
  parts.push(at(prep(new THREE.CylinderGeometry(0.097, 0.097, 0.012, 9), 0xcfae7c), 0, 0.172, 0));
  parts.push(at(prep(new THREE.CylinderGeometry(0.055, 0.055, 0.014, 9), 0xb08d60), 0, 0.174, 0));
  parts.push(at(prep(new THREE.CylinderGeometry(0.02, 0.02, 0.016, 6), 0x9a7650), 0, 0.176, 0));
  for (let k = 0; k < 4; k++) {
    const a = k * 1.57 + r() * 0.6, root = prep(new THREE.CylinderGeometry(0.018, 0.035, 0.16, 4), 0x6e5038);
    root.rotateZ(Math.PI / 2 - 0.35); root.rotateY(a); at(root, Math.cos(a) * 0.12, 0.025, -Math.sin(a) * 0.12); parts.push(root);
  }
  return wobble(merge(parts), 0.006, seed);
}
export function rocks(seed) {
  const r = mulberry32(seed);
  const parts = [];
  for (let k = 0; k < 5; k++) {
    const g = prep(new THREE.DodecahedronGeometry(0.08 + r() * 0.08, 0), 0x8f8b84);
    g.scale(1, 0.7, 1); at(g, (r() - 0.5) * 0.4, 0.05, (r() - 0.5) * 0.4);
    shadeVerts(g, () => 0.85 + r() * 0.3);
    parts.push(g);
  }
  return merge(parts);
}
export function brushPile(seed) {
  const r = mulberry32(seed);
  const parts = [];
  for (let k = 0; k < 16; k++) {
    const c = prep(new THREE.CylinderGeometry(0.012, 0.018, 0.4 + r() * 0.3, 3), 0x7a5e40);
    c.rotateZ(Math.PI / 2 + (r() - 0.5) * 0.5); c.rotateY(r() * 6.28);
    at(c, (r() - 0.5) * 0.25, 0.04 + r() * 0.2, (r() - 0.5) * 0.25); parts.push(c);
  }
  return merge(parts);
}
export function nestbox() {
  const post = at(prep(new THREE.BoxGeometry(0.05, 0.9, 0.05), 0x7a5e42), 0, 0.45, 0);
  const box = at(prep(new THREE.BoxGeometry(0.16, 0.22, 0.16), 0xb08a5e), 0, 0.98, 0);
  const roof = prep(new THREE.ConeGeometry(0.14, 0.08, 4), 0x6a4a30); roof.rotateY(Math.PI / 4); at(roof, 0, 1.13, 0);
  const hole = at(prep(new THREE.BoxGeometry(0.05, 0.05, 0.01), 0x201510), 0, 1.0, 0.085);
  return merge([post, box, roof, hole]);
}
export function blind() {
  const parts = [];
  parts.push(at(prep(new THREE.BoxGeometry(0.7, 0.5, 0.55), 0x7d6448), 0, 0.25, 0));
  const roof = prep(new THREE.BoxGeometry(0.85, 0.06, 0.7), 0x4f6a3a); roof.rotateX(-0.2); at(roof, 0, 0.56, 0);
  parts.push(roof);
  parts.push(at(prep(new THREE.BoxGeometry(0.5, 0.06, 0.02), 0x181410), 0, 0.36, 0.28));
  parts.push(at(prep(new THREE.BoxGeometry(0.02, 0.06, 0.4), 0x181410), 0.36, 0.36, 0));
  return merge(parts);
}
export function fencePost() { return at(prep(new THREE.BoxGeometry(0.05, 0.34, 0.05), 0x7a6d5a), 0, 0.17, 0); }
export function fenceRail() {
  // one tile long, along +x from the post
  const a = at(prep(new THREE.BoxGeometry(1, 0.025, 0.02), 0x9a8c76), 0.5, 0.26, 0);
  const b = at(prep(new THREE.BoxGeometry(1, 0.025, 0.02), 0x8a7d6a), 0.5, 0.14, 0);
  return merge([a, b]);
}
// a white picket fence: posts, two rails and pointed pickets (one tile long, along +x)
export function picketPost() { return merge([at(prep(new THREE.BoxGeometry(0.07, 0.4, 0.07), 0xf2f0ea), 0, 0.2, 0), at(prep(new THREE.ConeGeometry(0.055, 0.06, 4), 0xf2f0ea), 0, 0.43, 0)]); }
export function picketRail() {
  const parts = [at(prep(new THREE.BoxGeometry(1, 0.03, 0.02), 0xe8e6de), 0.5, 0.28, 0), at(prep(new THREE.BoxGeometry(1, 0.03, 0.02), 0xe8e6de), 0.5, 0.12, 0)];
  for (let k = 1; k < 9; k++) {
    parts.push(at(prep(new THREE.BoxGeometry(0.045, 0.32, 0.015), 0xf6f4ee), k * 0.111, 0.16, 0.012));
    const tip = prep(new THREE.ConeGeometry(0.032, 0.05, 4), 0xf6f4ee); tip.rotateY(Math.PI / 4); parts.push(at(tip, k * 0.111, 0.345, 0.012));
  }
  return merge(parts);
}
export function boardwalk() {
  const parts = [];
  for (let k = 0; k < 6; k++) parts.push(at(prep(new THREE.BoxGeometry(0.15, 0.04, 1.0), k % 2 ? 0xb08a5e : 0xa07e54), -0.4 + k * 0.16, 0.1, 0));
  for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) parts.push(at(prep(new THREE.BoxGeometry(0.05, 0.35, 0.05), 0x6a5238), x, -0.05, z));
  return merge(parts);
}
export function dam(seed) {
  const r = mulberry32(seed);
  const mound = prep(new THREE.IcosahedronGeometry(0.5, 1), 0x5a4430);
  mound.scale(1.05, 0.25, 0.55); at(mound, 0, 0.02, 0);
  const parts = [mound];
  for (let k = 0; k < 14; k++) {
    const c = prep(new THREE.CylinderGeometry(0.015, 0.02, 0.5 + r() * 0.3, 3), 0x8a6a4a);
    c.rotateZ(Math.PI / 2 + (r() - 0.5) * 0.6); c.rotateY((r() - 0.5) * 0.8);
    at(c, (r() - 0.5) * 0.6, 0.08 + r() * 0.06, (r() - 0.5) * 0.3); parts.push(c);
  }
  return merge(parts);
}
// A canal block: a wall of round piles driven in across a drainage canal (one tile, across x),
// their tops a little uneven, a rail bolted along them, and dark peat and a few sandbags heaped
// against the upstream (+z) face and up onto the banks at either end, so the peat stays wet.
export function canalBlock(seed) {
  const r = mulberry32(seed), parts = [];
  for (let k = 0; k < 10; k++) {
    const x = -0.45 + k * 0.1, h = 0.4 + r() * 0.07;
    const pile = prep(new THREE.CylinderGeometry(0.045, 0.048, h, 6), 0x8a7050);
    pile.translate(x, h / 2 - 0.16, 0); shadeVerts(pile, (xx, y) => (y > h - 0.17 ? 1.2 : 0.85)); parts.push(pile); // (pale, weathered cut tops)
  }
  parts.push(at(prep(new THREE.BoxGeometry(1.0, 0.05, 0.03), 0x6a5238), 0, 0.15, -0.06)); // the rail, downstream
  // packed peat against the upstream face, heaped higher where it runs up onto the banks
  const peat = soft(new THREE.IcosahedronGeometry(0.5, 1), { color: 0x3a2c22, seed, lump: 0.05, transform: g => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) * (1 + 1.4 * (x / 0.5) ** 4)); }
    g.scale(1.1, 0.42, 0.38); g.translate(0, 0.03, 0.17);
  } });
  parts.push(peat);
  for (let k = 0; k < 5; k++) { // sandbags along the top of it
    const bag = soft(new THREE.IcosahedronGeometry(0.06, 0), { color: 0xa89a74, seed: seed + k, lump: 0.01, transform: g => { g.scale(1.5, 0.6, 1); g.rotateY((r() - 0.5) * 0.5); g.translate(-0.3 + k * 0.15, 0.2 + Math.abs(k - 2) * 0.03, 0.12 + r() * 0.04); } });
    parts.push(bag);
  }
  return merge(parts);
}
export function culvert() {
  const deck = at(prep(new THREE.BoxGeometry(1.0, 0.18, 0.7), 0xa89274), 0, 0.12, 0);
  const pipe = prep(new THREE.CylinderGeometry(0.16, 0.16, 1.0, 10, 1, true), 0x8d8a84); pipe.rotateX(Math.PI / 2); at(pipe, 0, -0.02, 0);
  const hole1 = prep(new THREE.CircleGeometry(0.12, 10), 0x1e2224); at(hole1, 0, -0.02, 0.5);
  return merge([deck, pipe, hole1]);
}
// A soft contact shadow: a flat disc of radius 1 on the ground, darkest in the middle and fading
// to nothing at its rim (alpha in the vertex colours), to sit under trees, bushes and animals.
export function contactShadow(segs = 16) {
  const rings = [[0, 1], [0.4, 0.78], [0.72, 0.32], [1, 0]], pos = [], col = [];
  const at = (r, k) => [Math.cos(k / segs * Math.PI * 2) * r, 0, Math.sin(k / segs * Math.PI * 2) * r];
  const put = (r, k, a) => { pos.push(...at(r, k)); col.push(1, 1, 1, a); };
  for (let j = 0; j + 1 < rings.length; j++) for (let k = 0; k < segs; k++) {
    const [r0, a0] = rings[j], [r1, a1] = rings[j + 1];
    if (!r0) { put(0, 0, a0); put(r1, k + 1, a1); put(r1, k, a1); continue; } // (the centre: one triangle per segment)
    put(r0, k, a0); put(r1, k + 1, a1); put(r1, k, a1);
    put(r0, k, a0); put(r0, k + 1, a0); put(r1, k + 1, a1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  g.userData.ao = true; // (no baked shading: it is a shadow)
  return g;
}

export function blob(color, r = 0.035) { return prep(new THREE.IcosahedronGeometry(r, 0), color); }

// ---------------------------------------------------------------- buildings (unit: tiles)
function gableRoof(len, width, rise, color, overhang = 0.12) {
  const s = new THREE.Shape();
  const hw = width / 2 + overhang;
  s.moveTo(-hw, 0); s.lineTo(0, rise); s.lineTo(hw, 0); s.lineTo(hw, -0.06); s.lineTo(0, rise - 0.08); s.lineTo(-hw, -0.06);
  const g = new THREE.ExtrudeGeometry(s, { depth: len + overhang * 2, bevelEnabled: false });
  g.translate(0, 0, -(len + overhang * 2) / 2);
  g.rotateY(Math.PI / 2);
  return prep(g, color);
}
function gambrelRoof(len, width, rise, color) {
  const s = new THREE.Shape();
  const hw = width / 2 + 0.12;
  s.moveTo(-hw, 0); s.lineTo(-hw * 0.72, rise * 0.62); s.lineTo(0, rise); s.lineTo(hw * 0.72, rise * 0.62); s.lineTo(hw, 0);
  s.lineTo(hw, -0.06); s.lineTo(-hw, -0.06);
  const g = new THREE.ExtrudeGeometry(s, { depth: len + 0.24, bevelEnabled: false });
  g.translate(0, 0, -(len + 0.24) / 2);
  g.rotateY(Math.PI / 2);
  return prep(g, color);
}
const box = (w, h, d, color, x = 0, y = 0, z = 0) => at(prep(new THREE.BoxGeometry(w, h, d), color), x, y + h / 2, z);

// Where the dive boat lies alongside the cay's jetty, from the jetty structure's centre (tiles).
export const JETTY_BOAT = { x: 0.82, z: 4.45 };

// The dive boat that brings the snorkelers out: a white monohull about the length of two and a
// half tiles, built around its waterline (y = 0), bow toward +z. A deep-V hull with a flared bow
// and a sheer that rises toward it, a navy boot stripe and dark antifouling below the waterline,
// a wheelhouse with a raked, tinted windscreen, a blue bimini over the open dive deck at the back
// with racks of yellow tanks either side, twin outboards on the transom above a swim platform and
// ladder, a bow rail, and white fenders hung over the side toward the jetty.
export function diveBoat(bollardY = 0.45) { // (bollardY: how far the jetty's bollards stand above the sea)
  const parts = [], L = 2.3, B = 0.64, z0 = -L / 2, z1 = L / 2;
  const S = 22, C = 14; // stations along the hull, points around each half section
  // at a station t (0 stern .. 1 bow): half beam, sheer height, keel depth
  const beam = t => (B / 2) * (t < 0.55 ? 0.9 + 0.1 * Math.sin(t / 0.55 * Math.PI / 2) : Math.pow(Math.max(0, 1 - Math.pow((t - 0.55) / 0.45, 2.2)), 0.62));
  const sheer = t => 0.17 + 0.1 * Math.pow(t, 2.2);
  const keel = t => -0.13 * (t < 0.7 ? 0.62 + 0.38 * Math.sin(Math.min(1, t / 0.55) * Math.PI / 2) : Math.max(0, 1 - Math.pow((t - 0.7) / 0.3, 1.6))); // (the forefoot sweeps up into the stem)
  // a section from the keel up to the sheer: the V bottom flattens out at a chine, then the
  // topsides rise with a little flare (u: 0 keel .. 1 sheer)
  const sect = (t, u) => {
    const b = beam(t), sh = sheer(t), k = keel(t);
    if (u < 0.5) { const v = u / 0.5; return [b * 0.86 * v, k + (k * -0.72) * Math.pow(v, 1.35)]; } // bottom: keel to chine
    const v = (u - 0.5) / 0.5, chineY = k * 0.28;
    return [b * (0.86 + 0.14 * Math.sin(v * Math.PI / 2)), chineY + (sh - chineY) * v];
  };
  const pos = [], col = [];
  const paint = y => (y > 0.035 ? [0.95, 0.95, 0.93] : y > -0.005 ? [0.12, 0.2, 0.38] : [0.42, 0.13, 0.12]); // white, boot stripe, antifouling
  const tri = (a, b, c, ca, cb, cc) => { pos.push(...a, ...b, ...c); col.push(...ca, ...cb, ...cc); };
  const quad = (a, b, c, d, f) => { tri(a, b, c, f(a[1]), f(b[1]), f(c[1])); tri(a, c, d, f(a[1]), f(c[1]), f(d[1])); };
  const P = (t, u, side) => { const [x, y] = sect(t, u); return [side * x, y, z0 + t * L]; };
  for (let i = 0; i < S; i++) for (let j = 0; j < C; j++) for (const side of [1, -1]) {
    const t0 = i / S, t1 = (i + 1) / S, u0 = j / C, u1 = (j + 1) / C;
    const a = P(t0, u0, side), b = P(t1, u0, side), c = P(t1, u1, side), d = P(t0, u1, side);
    // the sheer stripe: a navy line just under the gunwale
    const f = y => (y > sheer((t0 + t1) / 2) - 0.045 && y < sheer((t0 + t1) / 2) - 0.022 ? [0.16, 0.3, 0.55] : paint(y));
    side > 0 ? quad(a, d, c, b, f) : quad(a, b, c, d, f); // (wound so the faces point outward)
  }
  // the transom: the flat stern, filled in from the keel up
  for (let j = 0; j < C; j++) for (const side of [1, -1]) {
    const a = P(0, j / C, side), b = P(0, (j + 1) / C, side), c = [0, (sheer(0) + keel(0)) / 2, z0];
    side > 0 ? tri(a, c, b, paint(a[1]), paint(c[1]), paint(b[1])) : tri(a, b, c, paint(a[1]), paint(b[1]), paint(c[1]));
  }
  // the deck, a little below the gunwale: pale grey non-skid
  const deckY = t => sheer(t) - 0.035;
  for (let i = 0; i < S; i++) {
    const t0 = i / S, t1 = (i + 1) / S, w0 = beam(t0) * 0.92, w1 = beam(t1) * 0.92, za = z0 + t0 * L, zb = z0 + t1 * L, g = [0.8, 0.8, 0.78];
    tri([-w0, deckY(t0), za], [-w1, deckY(t1), zb], [w1, deckY(t1), zb], g, g, g);
    tri([-w0, deckY(t0), za], [w1, deckY(t1), zb], [w0, deckY(t0), za], g, g, g);
  }
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    parts.push(g);
  }
  const dy = z => deckY((z - z0) / L);
  // gunwale cap: a thin teak rail along the top of each side
  for (let i = 0; i < S; i++) for (const side of [1, -1]) {
    const t0 = i / S, t1 = (i + 1) / S, a = [side * beam(t0), sheer(t0), z0 + t0 * L], b = [side * beam(t1), sheer(t1), z0 + t1 * L];
    const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const r = prep(new THREE.BoxGeometry(0.035, 0.018, len + 0.01), 0x8a6a48);
    r.rotateY(Math.atan2(dx, dz)); at(r, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.006, (a[2] + b[2]) / 2); parts.push(r);
  }
  // the wheelhouse: raked windscreen at the front, tinted windows all round, a white roof
  {
    const zA = -0.12, zB = 0.42, H = 0.27, Wd = 0.44, y0 = dy(0.15);
    const sideShape = sh => { sh.moveTo(zA, 0); sh.lineTo(zB, 0); sh.lineTo(zB - 0.1, H); sh.lineTo(zA, H); sh.lineTo(zA, 0); };
    const body = new THREE.Shape(); sideShape(body);
    const cab = prep(new THREE.ExtrudeGeometry(body, { depth: Wd, bevelEnabled: false }), 0xf4f4f0);
    cab.rotateY(-Math.PI / 2); at(cab, Wd / 2, y0, 0); parts.push(cab);
    const win = new THREE.Shape(); win.moveTo(zA + 0.04, H * 0.5); win.lineTo(zB - 0.05, H * 0.5); win.lineTo(zB - 0.1 + 0.012, H - 0.03); win.lineTo(zA + 0.04, H - 0.03); win.lineTo(zA + 0.04, H * 0.5);
    const glass = prep(new THREE.ExtrudeGeometry(win, { depth: Wd + 0.012, bevelEnabled: false }), 0x1e2c38);
    glass.rotateY(-Math.PI / 2); at(glass, (Wd + 0.012) / 2, y0, 0); parts.push(glass);
    // the windscreen itself, across the raked front
    const ws = prep(new THREE.BoxGeometry(Wd - 0.06, 0.13, 0.01), 0x26384a); ws.rotateX(-Math.atan2(0.1, H)); at(ws, 0, y0 + H * 0.74, zB - 0.075); parts.push(ws);
    parts.push(box(Wd + 0.08, 0.025, zB - zA + 0.02, 0xf8f8f4, 0, y0 + H, (zA + zB) / 2 - 0.04)); // roof, overhanging
    parts.push(box(0.03, 0.16, 0.03, 0xd8d8d8, 0, y0 + H + 0.025, 0.05)); // mast
    parts.push(box(0.14, 0.015, 0.015, 0xd8d8d8, 0, y0 + H + 0.15, 0.05)); // and its spreader
    const dome = prep(new THREE.SphereGeometry(0.04, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xf4f4f0); at(dome, 0.12, y0 + H + 0.025, -0.02); parts.push(dome); // radar
    parts.push(box(0.02, 0.025, 0.02, 0xd84a2a, -0.13, y0 + H + 0.025, 0.12)); // a port running light on the roof
  }
  // the open dive deck at the back: benches along each side with yellow tanks racked upright on
  // them, and a blue bimini on stainless poles over it all
  {
    const za = -1.0, zb = -0.2, yd = dy(-0.6);
    for (const side of [1, -1]) {
      const x = side * (B / 2 - 0.09);
      parts.push(box(0.1, 0.06, zb - za, 0x9aa0a6, x, yd, (za + zb) / 2)); // bench
      for (let k = 0; k < 6; k++) {
        const tank = prep(new THREE.CylinderGeometry(0.024, 0.024, 0.13, 8), 0xe8c020); at(tank, x + side * 0.015, yd + 0.06 + 0.065, za + 0.07 + k * 0.13); parts.push(tank);
        const valve = prep(new THREE.CylinderGeometry(0.008, 0.008, 0.025, 6), 0x3a3a3c); at(valve, x + side * 0.015, yd + 0.06 + 0.14, za + 0.07 + k * 0.13); parts.push(valve);
      }
    }
    const bimY = yd + 0.36, poles = [[-1, za + 0.05], [1, za + 0.05], [-1, zb - 0.02], [1, zb - 0.02]];
    for (const [side, z] of poles) parts.push(box(0.018, bimY - yd, 0.018, 0xd8dcdc, side * (B / 2 - 0.05), yd, z));
    const top = prep(new THREE.BoxGeometry(B - 0.02, 0.022, zb - za + 0.12), 0x1f5fa8); at(top, 0, bimY + 0.01, (za + zb) / 2); parts.push(top);
    for (const side of [1, -1]) { const v = prep(new THREE.BoxGeometry(0.012, 0.05, zb - za + 0.12), 0x1a5098); at(v, side * (B / 2 - 0.01), bimY - 0.012, (za + zb) / 2); parts.push(v); } // its valance
  }
  // the stern: a swim platform, a ladder down into the water, and twin outboards
  parts.push(box(B * 0.84, 0.03, 0.14, 0xb8b4aa, 0, 0.03, z0 - 0.065));
  for (const x of [-0.07, 0.07]) parts.push(box(0.012, 0.3, 0.012, 0xd8dcdc, x, -0.2, z0 - 0.13));
  for (let k = 0; k < 3; k++) parts.push(box(0.15, 0.01, 0.025, 0xd8dcdc, 0, -0.16 + k * 0.08, z0 - 0.13));
  for (const x of [-0.16, 0.16]) {
    const cowl = soft(new THREE.BoxGeometry(0.1, 0.14, 0.12, 2, 2, 2), { color: 0x3a3e44, transform: g => { g.translate(x, 0.24, z0 - 0.06); } });
    parts.push(cowl);
    parts.push(box(0.035, 0.24, 0.05, 0x2e3236, x, -0.06, z0 - 0.06)); // the leg down into the water
    parts.push(box(0.012, 0.045, 0.012, 0xe8e8e4, x, 0.31, z0 - 0.03)); // (a white stripe on the cowl)
  }
  // a bow rail on stanchions round the foredeck
  for (let k = 0; k <= 7; k++) for (const side of [1, -1]) {
    const t = 0.6 + k * 0.05, x = side * beam(t) * 0.9, z = z0 + t * L, y = deckY(t);
    if (k < 7 || side > 0) parts.push(box(0.012, 0.11, 0.012, 0xd8dcdc, x, y, z));
    if (k < 7) {
      const t2 = t + 0.05, x2 = side * beam(t2) * 0.9, z2 = z0 + t2 * L, y2 = deckY(t2);
      const r = prep(new THREE.BoxGeometry(0.01, 0.01, Math.hypot(x2 - x, z2 - z) + 0.01), 0xd8dcdc);
      r.rotateY(Math.atan2(x2 - x, z2 - z)); at(r, (x + x2) / 2, (y + y2) / 2 + 0.11, (z + z2) / 2); parts.push(r);
    }
  }
  // fenders over the jetty side (-x), and mooring lines from bow and stern cleats to the jetty's bollards
  for (const z of [-0.55, 0.05, 0.6]) {
    const f = prep(new THREE.CylinderGeometry(0.03, 0.03, 0.13, 8), 0xf2f2ee); at(f, -beam((z - z0) / L) - 0.028, 0.07, z); parts.push(f);
  }
  for (const [zb, zj] of [[z0 + 0.12, -1.05], [z1 - 0.3, 0.95]]) {
    const a = [-beam((zb - z0) / L) * 0.8, dy(zb) + 0.02, zb], b = [0.36 - JETTY_BOAT.x, bollardY, zj]; // (the jetty's bollards, in the boat's frame)
    const dx = b[0] - a[0], dyy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dyy, dz);
    const line = prep(new THREE.CylinderGeometry(0.006, 0.006, len, 4), 0xe8dcc0);
    line.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dyy, dz).normalize())));
    at(line, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); parts.push(line);
  }
  return merge(parts);
}

export function building(type, w, d) {
  const parts = [];
  switch (type) {
    case 'barn': {
      const H = 1.3;
      parts.push(box(w * 0.92, H, d * 0.85, 0x9a3b2f));
      parts.push(at(gambrelRoof(w * 0.92, d * 0.85, 1.1, 0x55535a), 0, H, 0));
      // doors and trim on the side that faces south (+z)
      const fz = d * 0.425 + 0.005;
      parts.push(box(0.9, 0.95, 0.02, 0x6e2a22, 0, 0, fz));
      parts.push(box(0.95, 0.06, 0.03, 0xefe8da, 0, 0.95, fz));
      for (const x of [-0.45, 0.45]) parts.push(box(0.06, 0.95, 0.03, 0xefe8da, x, 0, fz));
      parts.push(box(0.4, 0.35, 0.02, 0x2a2220, 0, 1.3, fz));
      parts.push(box(0.9, 0.05, 0.03, 0xefe8da, -1.2 + 1.2, 0.47, fz + 0.01));
      // weathered patches on the roof
      parts.push(at(prep(new THREE.BoxGeometry(0.6, 0.02, 0.5), 0x8a5a3a), 0.8, H + 0.8, 0.3));
      break;
    }
    case 'house': {
      const H = 0.95;
      parts.push(box(w * 0.85, H, d * 0.8, 0xd6d0c0));
      parts.push(at(gableRoof(w * 0.85, d * 0.8, 0.75, 0x5a4a44), 0, H, 0));
      parts.push(box(0.2, 0.6, 0.2, 0x8a4a3a, w * 0.25, H + 0.3, -0.1));
      const fz = d * 0.4 + 0.01;
      for (const x of [-0.8, 0.8]) parts.push(box(0.32, 0.36, 0.02, 0x3a4a58, x, 0.4, fz));
      parts.push(box(0.3, 0.6, 0.02, 0x5a4030, 0, 0, fz));
      // sagging porch
      parts.push(box(w * 0.5, 0.05, 0.4, 0x7a6a58, 0, 0.62, fz + 0.2));
      for (const x of [-0.7, 0.7]) parts.push(box(0.05, 0.62, 0.05, 0x6a5a48, x, 0, fz + 0.38));
      break;
    }
    case 'home': {
      // the builder's two-story plan, the same on every lot: beige siding, a two-car garage,
      // a gable roof in grey shingle, and a little brick-front stoop
      const H = 1.45, bw = w * 0.9, bd = d * 0.78, fz = bd / 2 + 0.01;
      parts.push(box(bw, H, bd, 0xd9ccb2));
      parts.push(at(gableRoof(bw, bd, 0.62, 0x54565a), 0, H, 0));
      parts.push(box(bw + 0.02, 0.05, bd + 0.02, 0xf2eee6, 0, H * 0.5, 0));                 // band between the floors
      parts.push(box(1.1, 0.62, 0.02, 0xf2f0ea, bw / 2 - 0.62, 0, fz));                      // garage door
      for (let k = 1; k < 4; k++) parts.push(box(1.1, 0.012, 0.025, 0xc8c4bc, bw / 2 - 0.62, k * 0.15, fz + 0.005));
      parts.push(box(0.42, 0.06, 0.3, 0x9a4a38, -0.25, 0, fz + 0.14));                       // brick stoop
      parts.push(box(0.2, 0.46, 0.02, 0x3a4a5a, -0.25, 0.04, fz));                           // front door
      for (const x of [-0.95, -0.25, 0.45]) parts.push(box(0.26, 0.28, 0.02, 0x4a5a6a, x, H * 0.62, fz)); // upstairs windows
      parts.push(box(0.3, 0.28, 0.02, 0x4a5a6a, -0.95, 0.18, fz));
      for (const x of [-1.1, -0.8]) parts.push(box(0.03, 0.3, 0.025, 0x3a3e44, x, 0.17, fz + 0.005)); // shutters
      break;
    }
    case 'clubhouse': {
      const H = 1.1;
      parts.push(box(w * 0.88, H, d * 0.7, 0xe8e2d4));
      parts.push(at(gableRoof(w * 0.88, d * 0.7, 0.55, 0x4a5058), 0, H, 0));
      const fz = d * 0.35 + 0.01;
      for (const x of [-1.2, -0.4, 0.4, 1.2]) parts.push(box(0.08, H * 0.9, 0.08, 0xf6f4ee, x, 0, fz + 0.3)); // porch columns
      parts.push(box(w * 0.8, 0.05, 0.36, 0xf6f4ee, 0, H * 0.9, fz + 0.18));
      parts.push(box(0.4, 0.6, 0.02, 0x3a4a5a, 0, 0, fz));
      for (const x of [-1.0, 1.0]) parts.push(box(0.4, 0.4, 0.02, 0x4a5a6a, x, 0.35, fz));
      break;
    }
    case 'pool': {
      parts.push(box(w * 0.95, 0.08, d * 0.9, 0xd8d4ca));                                    // concrete deck
      parts.push(box(w * 0.72, 0.03, d * 0.6, 0x4ab0d0, 0, 0.08, 0));                       // the water
      for (const [x, z] of [[-1.25, 0.8], [-0.7, 0.8], [0.9, -0.8]]) parts.push(box(0.4, 0.05, 0.16, 0xf0f0ea, x, 0.1, z)); // loungers
      parts.push(box(0.03, 0.4, 0.03, 0x8a8a8a, 1.3, 0.08, 0.8));                            // umbrella pole
      parts.push(at(prep(new THREE.ConeGeometry(0.35, 0.14, 8), 0x2a6a9a), 1.3, 0.55, 0.8));
      break;
    }
    case 'silo': {
      const body = prep(new THREE.CylinderGeometry(0.62, 0.65, 2.6, 14), 0xbcb7aa);
      at(body, 0, 1.3, 0); parts.push(body);
      for (let k = 1; k < 5; k++) { const ring = prep(new THREE.CylinderGeometry(0.66, 0.66, 0.04, 14), 0x8a867c); at(ring, 0, k * 0.52, 0); parts.push(ring); }
      const dome = prep(new THREE.SphereGeometry(0.64, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x9a6a44);
      at(dome, 0, 2.6, 0); parts.push(dome);
      break;
    }
    case 'shed': {
      parts.push(box(w * 0.85, 0.75, d * 0.8, 0x7d7466));
      const roof = prep(new THREE.BoxGeometry(w * 0.95, 0.05, d * 0.95), 0x9aa0a2); roof.rotateX(0.25); at(roof, 0, 0.85, 0);
      parts.push(roof);
      parts.push(box(0.8, 0.55, 0.02, 0x2a2622, 0, 0, d * 0.4 + 0.01));
      break;
    }
    case 'tractor': {
      parts.push(box(0.45, 0.22, 0.28, 0xa8382a, 0.05, 0.14, 0));
      parts.push(box(0.2, 0.28, 0.26, 0x8a2e22, -0.15, 0.3, 0));
      parts.push(box(0.03, 0.25, 0.03, 0x2a2622, 0.2, 0.36, 0));
      for (const [x, z, rr] of [[-0.15, 0.16, 0.16], [-0.15, -0.16, 0.16], [0.22, 0.14, 0.09], [0.22, -0.14, 0.09]]) {
        const wh = prep(new THREE.CylinderGeometry(rr, rr, 0.07, 10), 0x1e1c1a); wh.rotateX(Math.PI / 2); at(wh, x, rr, z); parts.push(wh);
      }
      break;
    }
    case 'jetty': {
      // the cay's boat landing: a plank jetty on posts running out over the lagoon, and the dive
      // boat that brings the snorkelers tied up alongside
      // (it runs on out past the beach to water deep enough for the boat)
      const N = 29, len = N * 0.22;
      for (let k = 0; k < N; k++) parts.push(box(0.9, 0.04, 0.2, k % 2 ? 0x9a8460 : 0x8a7454, 0, 0.1, -0.6 + k * 0.22));
      for (const x of [-0.42, 0.42]) parts.push(box(0.05, 0.06, len, 0x6a5a44, x, 0.04, -0.7 + len / 2)); // stringers under the planks
      for (let k = 0; k < 8; k++) for (const x of [-0.42, 0.42]) parts.push(box(0.08, 2.4, 0.08, 0x5e4f3c, x, -2.3, -0.5 + k * 0.85));
      parts.push(box(0.04, 0.04, len - 1.9, 0x7a6a50, -0.45, 0.32, -0.7 + (len - 1.9) / 2)); // handrail on the far side all the way;
      parts.push(box(0.04, 0.04, 2.6, 0x7a6a50, 0.45, 0.32, 0.6)); // the near side stays open where the boat ties up
      for (let k = 0; k < 9; k++) parts.push(box(0.04, 0.2, 0.04, 0x7a6a50, -0.45, 0.14, -0.6 + k * 0.6));
      for (let k = 0; k < 4; k++) parts.push(box(0.04, 0.2, 0.04, 0x7a6a50, 0.45, 0.14, -0.6 + k * 0.6));
      // (the dive boat tied up alongside is its own model, floating on the sea: see diveBoat)
      // a bollard at each end of the boat's berth, for its mooring lines
      for (const z of [JETTY_BOAT.z - 1.05, JETTY_BOAT.z + 0.95]) parts.push(box(0.08, 0.1, 0.08, 0x3a3a3c, 0.36, 0.14, z));
      break;
    }
    case 'parking': {
      const cars = [0x3a6a8a, 0xb0482a, 0xd8d0c0, 0x4a5a3a];
      for (let k = 0; k < 3; k++) {
        const x = -0.55 + k * 0.55;
        parts.push(box(0.3, 0.14, 0.55, cars[k], x, 0.04, 0.1));
        parts.push(box(0.26, 0.11, 0.3, 0x9ab8c8, x, 0.18, 0.12));
      }
      for (let k = 0; k < 4; k++) parts.push(box(0.03, 0.005, 0.6, 0xefe8da, -0.82 + k * 0.55, 0, 0.1));
      parts.push(box(0.04, 0.6, 0.04, 0x6a5238, 0.85, 0, -0.8));
      parts.push(box(0.4, 0.25, 0.03, 0x4f6a3a, 0.85, 0.45, -0.78));
      break;
    }
    case 'center': {
      const H = 0.9;
      parts.push(box(w * 0.8, H, d * 0.7, 0x8a6444));
      parts.push(at(gableRoof(w * 0.8, d * 0.7, 0.9, 0x4f6a3a, 0.2), 0, H, 0));
      const fz = d * 0.35 + 0.01;
      parts.push(box(w * 0.55, 0.45, 0.02, 0x9fc4d0, 0, 0.28, fz));
      parts.push(box(0.3, 0.6, 0.02, 0x4a3020, w * 0.3, 0, fz));
      parts.push(box(w * 0.85, 0.06, 0.5, 0xa88a60, 0, 0, fz + 0.25));
      for (const x of [-1, 0, 1]) parts.push(box(0.06, 0.2, 0.06, 0x6a4a30, x * w * 0.35, 0, fz + 0.45));
      break;
    }
  }
  return bakeAO(merge(parts), 'base');
}
