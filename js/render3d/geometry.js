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

function shadeVerts(g, fn) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i));
    c.setXYZ(i, c.getX(i) * v, c.getY(i) * v, c.getZ(i) * v);
  }
  return g;
}

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

// ---------------------------------------------------------------- trees (unit: tiles, mature size)
function trunk(h, r0, r1, color = 0xffffff, sides = 7) {
  return soft(new THREE.CylinderGeometry(r1, r0, h, sides, 3), { color, transform: g => g.translate(0, h / 2, 0), lump: r0 * 0.25, seed: 5 });
}

export function conifer(opts, seed, lod = 0) {
  const r = mulberry32(seed);
  const { height: H, radius: R, tiers, droop = 0, lean = 0 } = opts;
  const parts = [];
  const base = H * 0.16;
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers;
    const rad = R * Math.pow(1 - t, 0.95) + 0.04;
    const th = (H - base) / tiers * 2.2;
    const y = base + (H - base) * t * 0.92;
    const phase = r() * 6.28, lobes = 6 + Math.floor(r() * 3);
    const cone = soft(new THREE.ConeGeometry(rad, th, lod ? 7 : 12, lod ? 1 : 2), {
      seed: seed + k, lump: 0.03,
      transform: g => {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
          const u = (py + th / 2) / th;                // 0 at the rim, 1 at the tip
          const ang = Math.atan2(pz, px);
          // ragged branch tips around the rim, drooping at the ends
          const jag = 1 + (1 - u) * 0.22 * Math.sin(ang * lobes + phase);
          const sag = (1 - u) * (1 - u) * droop * (0.6 + 0.4 * Math.sin(ang * lobes + phase));
          p.setXYZ(i, px * jag, py - sag, pz * jag);
        }
        g.rotateY(r() * Math.PI);
        g.translate(0, y + th / 2, 0);
      },
    });
    const shade = 0.7 + t * 0.34;
    shadeVerts(cone, (x, yy) => shade * (0.78 + 0.34 * Math.min(1, Math.max(0, (yy - y) / th + 0.1))));
    parts.push(cone);
  }
  const crown = merge(parts);
  volumeNormals(crown, 0, 0, 0, 0.45, true);
  if (lean) {
    const p = crown.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > H * 0.85) p.setX(i, p.getX(i) + (y - H * 0.85) * lean); }
  }
  return { crown, trunk: trunk(base + 0.3, 0.07, 0.04) };
}

export function broadleaf(opts, seed, lod = 0) {
  const r = mulberry32(seed);
  const { height: H, rx, ry, blobs, trunkH, trunkR = 0.06, lobes = 1 } = opts;
  const cy = H - ry;
  const parts = [];
  const nBlobs = lod ? Math.ceil(blobs * 0.6) : Math.ceil(blobs * 0.75);
  for (let b = 0; b < nBlobs; b++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.78;
    const lobeX = lobes > 1 ? ((b % lobes) / (lobes - 1) - 0.5) * rx * 0.9 : 0;
    const x = lobeX + Math.cos(a) * rx * d * (lobes > 1 ? 0.55 : 1);
    const z = Math.sin(a) * rx * d * (lobes > 1 ? 0.8 : 1);
    const y = cy + (r() - 0.42) * ry * 1.05;
    const s = Math.min(rx, ry) * (lod ? 0.62 : 0.56) * (0.75 + r() * 0.5);
    const sy = 0.82 + r() * 0.3;
    const blob = soft(new THREE.IcosahedronGeometry(s, lod ? 0 : 1), { seed: seed + b * 7, lump: s * 0.28, transform: g => { g.scale(1, sy, 1); g.translate(x, y, z); } });
    const shade = 0.8 + (y - cy) / ry * 0.2 + r() * 0.08;
    shadeVerts(blob, (xx, yy) => shade * (0.84 + 0.22 * Math.min(1, Math.max(0, (yy - y) / s * 0.5 + 0.5))));
    parts.push(blob);
  }
  const crown = merge(parts);
  volumeNormals(crown, 0, cy, 0, 0.6);
  const limbs = [trunk(trunkH, trunkR, trunkR * 0.7)];
  for (let k = 0; k < 4; k++) {
    const l = soft(new THREE.CylinderGeometry(trunkR * 0.3, trunkR * 0.55, ry * 0.9, 6), {
      color: 0xffffff, transform: g => { g.translate(0, ry * 0.45, 0); g.rotateZ((r() - 0.5) * 1.3); g.rotateY(r() * Math.PI * 2); g.translate(0, trunkH * 0.85, 0); },
    });
    limbs.push(l);
  }
  return { crown, trunk: merge(limbs) };
}

// Winter silhouette for deciduous trees: trunk and bare branches.
export function bareTree(opts, seed) {
  const r = mulberry32(seed + 7);
  const { height: H, trunkH, trunkR = 0.06 } = opts;
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
  fir:        { kind: 'conifer', height: 2.3, radius: 0.38, tiers: 8 },
  cedar:      { kind: 'conifer', height: 1.95, radius: 0.48, tiers: 7, droop: 0.14 },
  hemlock:    { kind: 'conifer', height: 2.1, radius: 0.35, tiers: 9, droop: 0.09, lean: 0.35 },
  alder:      { kind: 'broad', height: 1.6, rx: 0.36, ry: 0.5, blobs: 10, trunkH: 0.8, trunkR: 0.045 },
  cottonwood: { kind: 'broad', height: 2.35, rx: 0.38, ry: 0.85, blobs: 13, trunkH: 0.95, trunkR: 0.065 },
  maple:      { kind: 'broad', height: 1.7, rx: 0.6, ry: 0.52, blobs: 14, trunkH: 0.68, trunkR: 0.075, lobes: 3 },
  ash:        { kind: 'broad', height: 1.55, rx: 0.42, ry: 0.46, blobs: 11, trunkH: 0.72, trunkR: 0.055 },
  oak:        { kind: 'broad', height: 1.35, rx: 0.64, ry: 0.38, blobs: 14, trunkH: 0.5, trunkR: 0.085, lobes: 4 },
  // Amazon
  inga:       { kind: 'broad', height: 1.55, rx: 0.56, ry: 0.4, blobs: 12, trunkH: 0.65, trunkR: 0.06, lobes: 2 },
  balsa:      { kind: 'broad', height: 1.95, rx: 0.46, ry: 0.5, blobs: 10, trunkH: 1.0, trunkR: 0.065 },
  mahogany:   { kind: 'broad', height: 2.3, rx: 0.64, ry: 0.55, blobs: 15, trunkH: 1.1, trunkR: 0.085, lobes: 3 },
  ipe:        { kind: 'broad', height: 2.05, rx: 0.6, ry: 0.44, blobs: 13, trunkH: 1.0, trunkR: 0.07, lobes: 3 },
  fig:        { kind: 'broad', height: 2.15, rx: 0.78, ry: 0.55, blobs: 16, trunkH: 0.85, trunkR: 0.11, lobes: 4 },
  leucaena:   { kind: 'broad', height: 1.2, rx: 0.42, ry: 0.32, blobs: 9, trunkH: 0.62, trunkR: 0.04 },
  cecropia:   { kind: 'cecropia', height: 2.0 },
  palm:       { kind: 'palm', height: 1.9, stems: 3 },
  fanpalm:    { kind: 'fanpalm', height: 2.3 },
  emergent:   { kind: 'emergent', height: 3.2, rx: 0.95, ry: 0.32, trunkR: 0.1 },
  kapok:      { kind: 'emergent', height: 3.4, rx: 1.05, ry: 0.3, trunkR: 0.11, buttress: true },
};

// Crown and trunk for any tree shape.
export function treeParts(shape, seed, lod = 0) {
  switch (shape.kind) {
    case 'conifer': return conifer(shape, seed, lod);
    case 'palm': return palm(shape, seed, lod);
    case 'fanpalm': return fanPalm(shape, seed, lod);
    case 'cecropia': return cecropia(shape, seed, lod);
    case 'emergent': return emergent(shape, seed, lod);
    default: return broadleaf(shape, seed, lod);
  }
}

// ---------------------------------------------------------------- tropical trees
// Palms: slender, slightly curving trunks (one or a clump) topped with arching pinnate fronds.
export function palm(opts, seed, lod = 0) {
  const r = mulberry32(seed);
  const trunks = [], fronds = [];
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
      const leaf = ribbon(0.5 + r() * 0.15, 0.075, 1.3 + r() * 0.4, lod ? 3 : 5, d, 0.35 + r() * 0.3, 0, 0, 0xffffff, 0.02);
      leaf.translate(tx, H, tz);
      fronds.push(leaf);
    }
  }
  const crown = twoSided(merge(fronds));
  return { crown, trunk: merge(trunks) };
}

// Buriti: one straight trunk and a round head of stiff fan leaves.
export function fanPalm(opts, seed, lod = 0) {
  const r = mulberry32(seed);
  const H = opts.height, parts = [];
  const n = lod ? 7 : 12;
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.28 + r() * 0.3, up = 0.25 + r() * 0.6;
    const fan = soft(new THREE.CircleGeometry(0.4, lod ? 6 : 10, -0.9, 1.8), { transform: g => {
      g.rotateX(-Math.PI / 2 + up); g.rotateY(-a + Math.PI / 2); g.translate(Math.cos(a) * 0.14, H + Math.sin(up) * 0.16, Math.sin(a) * 0.14);
    } });
    shadeVerts(fan, (x, y) => 0.8 + Math.min(0.25, (y - H) * 1.2));
    parts.push(fan);
  }
  // a skirt of dead brown fronds hanging below the crown
  for (let k = 0; k < (lod ? 3 : 6); k++) {
    const a = r() * 6.28;
    const dead = ribbon(0.3, 0.05, 0.3, 2, a, 2.6, 0, 0, 0x8a6a40);
    dead.translate(0, H - 0.02, 0);
    parts.push(dead);
  }
  const crown = twoSided(merge(parts));
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
    const b = soft(new THREE.CylinderGeometry(0.018, 0.026, Math.hypot(ex, len, ez), 5), { transform: g => {
      g.translate(0, Math.hypot(ex, len, ez) / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ex, len, ez).normalize()));
      g.translate(0, fork, 0);
    } });
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
    const l = soft(new THREE.CylinderGeometry(trunkR * 0.28, trunkR * 0.5, len, 5), { transform: g => {
      g.translate(0, len / 2, 0); g.rotateZ(-1.05); g.rotateY(-a); g.translate(0, cy - ry * 0.4, 0);
    } });
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

// ---------------------------------------------------------------- shrubs
export function shrub(type, seed, lod = 0) {
  const r = mulberry32(seed);
  const parts = [];
  let cy = 0.2;
  const blob = (x, y, z, s, sy = 0.85, shade = 1) => {
    const g = soft(new THREE.IcosahedronGeometry(s * (lod ? 1.15 : 1), lod ? 0 : 1), { seed: seed + parts.length * 3, lump: s * 0.3, transform: gg => { gg.scale(1, sy, 1); gg.translate(x, y, z); } });
    shadeVerts(g, (xx, yy) => shade * (0.8 + Math.min(0.3, (yy - y + s) / (2 * s) * 0.3)));
    parts.push(g);
  };
  switch (type) {
    case 'bramble':
      cy = 0.16;
      for (let k = 0; k < 10; k++) { const a = r() * 6.28, d = r() * 0.3; blob(Math.cos(a) * d, 0.1 + r() * 0.12, Math.sin(a) * d, 0.15 + r() * 0.07, 0.68, 0.8 + r() * 0.2); }
      for (let k = 0; k < 6; k++) {
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
    default:
      cy = 0.24;
      for (let k = 0; k < 8; k++) { const a = r() * 6.28, d = r() * 0.19; blob(Math.cos(a) * d, 0.15 + r() * 0.16, Math.sin(a) * d, 0.12 + r() * 0.06, 0.85, 0.8 + r() * 0.25); }
  }
  const g = merge(parts);
  if (type !== 'broom') volumeNormals(g, 0, cy, 0, 0.55);
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
    case 'grass': blades(8, 0.17, 0.014, 0.7); break;
    case 'tallgrass': blades(9, 0.28, 0.014, 0.8); break;
    case 'sedge': blades(10, 0.18, 0.016, 1.1); break;
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
      for (let k = 0, m = lo ? 5 : 9; k < m; k++) parts.push(ribbon(0.3 + r() * 0.06, 0.035 * (lo ? 1.3 : 1), 1.1 + r() * 0.3, lo ? 3 : 5, k / m * 6.28 + r() * 0.3, 0.35, 0, 0, 0xffffff, 0.02));
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
    default: blades(8, 0.15, 0.012, 0.6);
  }
  return merge(parts);
}

// ---------------------------------------------------------------- features & props
export function snag(seed) {
  const r = mulberry32(seed);
  const parts = [trunk(1.5, 0.09, 0.05, 0xffffff, 6)];
  const top = prep(new THREE.ConeGeometry(0.06, 0.2, 5)); at(top, 0.02, 1.58, 0); parts.push(top);
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
export function culvert() {
  const deck = at(prep(new THREE.BoxGeometry(1.0, 0.18, 0.7), 0xa89274), 0, 0.12, 0);
  const pipe = prep(new THREE.CylinderGeometry(0.16, 0.16, 1.0, 10, 1, true), 0x8d8a84); pipe.rotateX(Math.PI / 2); at(pipe, 0, -0.02, 0);
  const hole1 = prep(new THREE.CircleGeometry(0.12, 10), 0x1e2224); at(hole1, 0, -0.02, 0.5);
  return merge([deck, pipe, hole1]);
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
  return merge(parts);
}

