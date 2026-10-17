// Shared geometry preparation, paints, leaves and primitive shapes.
import * as THREE from 'three';
import { weldVertices } from './weld.js';

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
  g = weldVertices(g, 1e-4);
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

export { at, blotch, frond, ribbon, rod, shadeVerts, sheet, soft, speck, strap, twoSided, volumeNormals, wobble };
