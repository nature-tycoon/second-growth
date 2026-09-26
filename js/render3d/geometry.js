// Procedural low-poly geometry for plants, features and buildings.
// Every builder returns a non-indexed BufferGeometry with position, normal and color attributes.
// Colors baked into geometry are light "shading" values; instance colors supply the hue.

import * as THREE from 'three';
import { mulberry32 } from '../rng.js';

// ---------------------------------------------------------------- helpers
export function prep(geo, color = 0xffffff) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  if (!g.attributes.color) {
    const c = new THREE.Color(color);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return g;
}

export function merge(list) {
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}

// Displace vertices by a hash of their position so shared corners stay welded.
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

function shadeVerts(g, fn) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i));
    c.setXYZ(i, c.getX(i) * v, c.getY(i) * v, c.getZ(i) * v);
  }
  return g;
}

const at = (g, x, y, z) => { g.translate(x, y, z); return g; };

// ---------------------------------------------------------------- trees (unit: tiles, mature size)
function trunk(h, r0, r1, color = 0xffffff, sides = 6) {
  return at(prep(new THREE.CylinderGeometry(r1, r0, h, sides, 1), color), 0, h / 2, 0);
}

export function conifer(opts, seed) {
  const r = mulberry32(seed);
  const { height: H, radius: R, tiers, droop = 0, lean = 0 } = opts;
  const parts = [];
  const top = H;
  const base = H * 0.18;
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers;
    const rad = R * Math.pow(1 - t, 0.9) + 0.05;
    const th = (H - base) / tiers * 2.1;
    const y = base + (H - base) * t * 0.93;
    const cone = prep(new THREE.ConeGeometry(rad, th, 7, 1));
    cone.rotateY(r() * Math.PI);
    if (droop) {
      // bend the rim down for drooping cedar and hemlock sprays
      const p = cone.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < -th * 0.45) p.setY(i, p.getY(i) - droop);
    }
    at(cone, 0, y + th / 2, 0);
    const shade = 0.72 + t * 0.35;
    shadeVerts(cone, (x, yy) => shade * (0.85 + 0.25 * Math.min(1, (yy - y) / th + 0.2)));
    parts.push(cone);
  }
  let crown = merge(parts);
  wobble(crown, 0.06, seed);
  if (lean) {
    const p = crown.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > top * 0.85) p.setX(i, p.getX(i) + (y - top * 0.85) * lean); }
    crown.computeVertexNormals();
  }
  return { crown, trunk: trunk(base + 0.3, 0.075, 0.045) };
}

export function broadleaf(opts, seed) {
  const r = mulberry32(seed);
  const { height: H, rx, ry, blobs, trunkH, trunkR = 0.06, lobes = 1 } = opts;
  const cy = H - ry;
  const parts = [];
  for (let b = 0; b < blobs; b++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.75;
    const lobeX = lobes > 1 ? ((b % lobes) / (lobes - 1) - 0.5) * rx * 0.9 : 0;
    const x = lobeX + Math.cos(a) * rx * d * (lobes > 1 ? 0.55 : 1);
    const z = Math.sin(a) * rx * d * (lobes > 1 ? 0.8 : 1);
    const y = cy + (r() - 0.45) * ry * 1.1;
    const s = (Math.min(rx, ry) * 0.55) * (0.75 + r() * 0.5);
    const ico = prep(new THREE.IcosahedronGeometry(s, 0));
    ico.scale(1, 0.85 + r() * 0.3, 1);
    at(ico, x, y, z);
    const shade = 0.8 + (y - cy) / ry * 0.18 + r() * 0.1;
    shadeVerts(ico, () => shade);
    parts.push(ico);
  }
  const crown = wobble(merge(parts), 0.05, seed);
  // a few visible limbs
  const limbs = [trunk(trunkH, trunkR, trunkR * 0.7)];
  for (let k = 0; k < 3; k++) {
    const l = prep(new THREE.CylinderGeometry(trunkR * 0.35, trunkR * 0.55, ry * 0.9, 5));
    l.translate(0, ry * 0.45, 0);
    l.rotateZ((r() - 0.5) * 1.2); l.rotateY(r() * Math.PI * 2);
    at(l, 0, trunkH * 0.85, 0);
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
    const c = prep(new THREE.CylinderGeometry(rad * 0.6, rad, len, 4));
    c.translate(0, len / 2, 0);
    c.rotateX(ax); c.rotateZ(az);
    at(c, x, y, z);
    parts.push(c);
    if (depth <= 0) return;
    const ex = x - Math.sin(az) * len * Math.cos(ax), ey = y + Math.cos(az) * Math.cos(ax) * len, ez = z + Math.sin(ax) * len;
    for (let k = 0; k < 2; k++) branch(ex, ey, ez, len * 0.65, rad * 0.6, ax + (r() - 0.5) * 0.9, az + (k ? 0.5 : -0.5) + (r() - 0.5) * 0.4, depth - 1);
  };
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2 + r();
    branch(0, trunkH * 0.9, 0, (H - trunkH) * 0.45, trunkR * 0.55, Math.sin(a) * 0.6, Math.cos(a) * 0.6, 2);
  }
  return merge(parts);
}

export const TREE_SHAPES = {
  fir:        { kind: 'conifer', height: 2.7, radius: 0.46, tiers: 7 },
  cedar:      { kind: 'conifer', height: 2.3, radius: 0.58, tiers: 6, droop: 0.12 },
  hemlock:    { kind: 'conifer', height: 2.5, radius: 0.42, tiers: 8, droop: 0.07, lean: 0.35 },
  alder:      { kind: 'broad', height: 1.9, rx: 0.42, ry: 0.6, blobs: 8, trunkH: 0.95, trunkR: 0.055 },
  cottonwood: { kind: 'broad', height: 2.8, rx: 0.45, ry: 1.0, blobs: 11, trunkH: 1.1, trunkR: 0.08 },
  maple:      { kind: 'broad', height: 2.0, rx: 0.72, ry: 0.62, blobs: 12, trunkH: 0.8, trunkR: 0.09, lobes: 3 },
  ash:        { kind: 'broad', height: 1.8, rx: 0.5, ry: 0.55, blobs: 9, trunkH: 0.85, trunkR: 0.07 },
  oak:        { kind: 'broad', height: 1.55, rx: 0.75, ry: 0.45, blobs: 12, trunkH: 0.6, trunkR: 0.1, lobes: 4 },
};

// ---------------------------------------------------------------- shrubs
export function shrub(type, seed) {
  const r = mulberry32(seed);
  const parts = [];
  const blob = (x, y, z, s, sy = 0.85, shade = 1) => {
    const g = prep(new THREE.IcosahedronGeometry(s, 0));
    g.scale(1, sy, 1);
    at(g, x, y, z);
    shadeVerts(g, (xx, yy) => shade * (0.8 + Math.min(0.3, (yy - y + s) / (2 * s) * 0.3)));
    parts.push(g);
  };
  switch (type) {
    case 'bramble':
      for (let k = 0; k < 9; k++) { const a = r() * 6.28, d = r() * 0.32; blob(Math.cos(a) * d, 0.12 + r() * 0.12, Math.sin(a) * d, 0.17 + r() * 0.08, 0.7, 0.8 + r() * 0.2); }
      // arching canes
      for (let k = 0; k < 6; k++) {
        const c = prep(new THREE.TorusGeometry(0.2 + r() * 0.1, 0.012, 3, 8, Math.PI), 0xb07070);
        c.rotateY(r() * Math.PI); at(c, (r() - 0.5) * 0.4, 0.05, (r() - 0.5) * 0.4); parts.push(c);
      }
      break;
    case 'willow':
      for (let k = 0; k < 6; k++) { const a = r() * 6.28, d = r() * 0.14; blob(Math.cos(a) * d, 0.3 + r() * 0.35, Math.sin(a) * d, 0.13 + r() * 0.05, 2.0, 0.85 + r() * 0.2); }
      break;
    case 'broom':
      for (let k = 0; k < 14; k++) {
        const c = prep(new THREE.ConeGeometry(0.03, 0.5 + r() * 0.2, 4));
        c.translate(0, 0.28, 0); c.rotateX((r() - 0.5) * 0.7); c.rotateZ((r() - 0.5) * 0.7);
        at(c, (r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.1); parts.push(c);
      }
      break;
    case 'salal': case 'holly':
      for (let k = 0; k < 7; k++) { const a = r() * 6.28, d = r() * 0.25; blob(Math.cos(a) * d, 0.1 + r() * 0.08, Math.sin(a) * d, 0.13 + r() * 0.05, 0.75, 0.75 + r() * 0.2); }
      break;
    case 'vinemaple':
      for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) { const a = r() * 6.28, d = r() * 0.25; blob(Math.cos(a) * d, 0.2 + k * 0.17, Math.sin(a) * d, 0.18 - k * 0.03, 0.45, 0.8 + k * 0.1); }
      break;
    default:
      for (let k = 0; k < 6; k++) { const a = r() * 6.28, d = r() * 0.2; blob(Math.cos(a) * d, 0.18 + r() * 0.16, Math.sin(a) * d, 0.15 + r() * 0.06, 0.85, 0.8 + r() * 0.25); }
  }
  return wobble(merge(parts), 0.03, seed);
}

export function twigs(seed, height = 0.5) {
  const r = mulberry32(seed);
  const parts = [];
  for (let k = 0; k < 9; k++) {
    const c = prep(new THREE.CylinderGeometry(0.006, 0.014, height * (0.6 + r() * 0.5), 3));
    c.translate(0, height * 0.35, 0); c.rotateX((r() - 0.5) * 1.0); c.rotateZ((r() - 0.5) * 1.0);
    at(c, (r() - 0.5) * 0.15, 0, (r() - 0.5) * 0.15); parts.push(c);
  }
  return merge(parts);
}

// ---------------------------------------------------------------- groundcover tufts
export function tuft(type, seed) {
  const r = mulberry32(seed);
  const parts = [];
  const blade = (h, w, lean, rot, x = 0, z = 0) => {
    const c = prep(new THREE.ConeGeometry(w, h, 3));
    c.translate(0, h / 2, 0); c.rotateZ(lean); c.rotateY(rot);
    at(c, x, 0, z);
    shadeVerts(c, (xx, y) => 0.7 + 0.45 * (y / h));
    parts.push(c);
  };
  switch (type) {
    case 'grass': case 'tallgrass': case 'sedge': {
      const h = type === 'tallgrass' ? 0.32 : type === 'sedge' ? 0.2 : 0.2;
      const n = type === 'sedge' ? 9 : 7;
      for (let k = 0; k < n; k++) blade(h * (0.7 + r() * 0.5), 0.022, 0.25 + r() * 0.45, r() * 6.28, (r() - 0.5) * 0.06, (r() - 0.5) * 0.06);
      break;
    }
    case 'forb': {
      for (let k = 0; k < 5; k++) {
        const g = prep(new THREE.IcosahedronGeometry(0.05, 0)); g.scale(1.4, 0.35, 0.7); g.rotateY(k * 1.26);
        at(g, Math.cos(k * 1.26) * 0.05, 0.03, Math.sin(k * 1.26) * 0.05); parts.push(g);
      }
      blade(0.16, 0.012, 0.1, 0);
      break;
    }
    case 'tallforb': {
      for (let k = 0; k < 3; k++) blade(0.28 + r() * 0.08, 0.02, (r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.08, (r() - 0.5) * 0.08);
      break;
    }
    case 'fern': {
      for (let k = 0; k < 8; k++) {
        const c = prep(new THREE.ConeGeometry(0.035, 0.34, 3));
        c.translate(0, 0.17, 0); c.scale(1, 1, 0.3); c.rotateZ(1.0 + r() * 0.25); c.rotateY(k / 8 * 6.28);
        shadeVerts(c, (x, y) => 0.75 + y);
        parts.push(c);
      }
      break;
    }
    case 'cattail': {
      for (let k = 0; k < 4; k++) blade(0.45 + r() * 0.15, 0.02, (r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.08, (r() - 0.5) * 0.08);
      break;
    }
    case 'tule': {
      for (let k = 0; k < 7; k++) blade(0.5 + r() * 0.2, 0.01, (r() - 0.5) * 0.2, r() * 6.28, (r() - 0.5) * 0.1, (r() - 0.5) * 0.1);
      break;
    }
    case 'skunk': {
      for (let k = 0; k < 5; k++) {
        const g = prep(new THREE.IcosahedronGeometry(0.1, 0)); g.scale(0.5, 1.5, 0.2); g.rotateX(0.5); g.rotateY(k * 1.26);
        at(g, Math.cos(k * 1.26) * 0.06, 0.12, Math.sin(k * 1.26) * 0.06); parts.push(g);
      }
      break;
    }
    default: blade(0.15, 0.02, 0.3, 0);
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

