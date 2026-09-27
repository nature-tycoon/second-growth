// Wildlife as small, soft 3D models. Each species is built once from smooth primitives
// (bodies, limbs, heads, wings) with baked vertex colours, then drawn as one instanced mesh.
// A vertex shader animates legs, wings, tails, heads and swimming, driven by a per-animal
// attribute, so hundreds of animals cost one draw call per species.
//
// Models are built in "sprite pixel" units (the same numbers as the 2D field-guide art):
// +x is forward, +y is up, the feet stand on y = 0.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/BufferGeometryUtils.js';
import { withClouds } from './atmosphere.js';

// Body parts the shader knows how to move.
const P = { BODY: 0, LEG_FL: 1, LEG_FR: 2, LEG_BL: 3, LEG_BR: 4, TAIL: 5, WING_L: 6, WING_R: 7, HEAD: 8 };

// ---------------------------------------------------------------- colour helpers
const colorCache = new Map();
function col(c) {
  if (c instanceof THREE.Color) return c;
  let out = colorCache.get(c);
  if (!out) { out = new THREE.Color(c); colorCache.set(c, out); }
  return out;
}
const shade = (c, f) => { const o = col(c).clone(); return f < 0 ? o.multiplyScalar(1 + f) : o.lerp(col('#ffffff'), f); };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const tmp = new THREE.Color();
const solid = c => { const k = col(c); return () => k; };
// countershading: darker back, lighter belly, blended over the part's own height
const grad = (top, bottom, at = -0.2, soft = 0.45) => {
  const a = col(top), b = col(bottom);
  return u => tmp.copy(b).lerp(a, smooth(at - soft, at + soft, u.y));
};
// Cellular (Voronoi) pattern in model space: returns [gap between the two nearest cell points,
// a hash of the nearest cell]. Irregular polygons with seams, for giraffe patches and tortoise plates.
function cells(p, size) {
  const x = p.x / size, y = p.y / size, z = p.z / size, ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let d1 = 9, d2 = 9, id = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const cx = ix + a, cy = iy + b, cz = iz + c;
    const d = Math.hypot(cx + hash3(cx, cy, cz) - x, cy + hash3(cy, cz, cx) - y, cz + hash3(cz, cx, cy) - z);
    if (d < d1) { d2 = d1; d1 = d; id = hash3(cx * 1.3, cy * 1.7, cz * 2.1); } else if (d < d2) d2 = d;
  }
  return [d2 - d1, id];
}
const hash3 = (x, y, z) => { const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return h - Math.floor(h); };

// ---------------------------------------------------------------- geometry builder
const SPH = new THREE.SphereGeometry(1, 12, 9);
const SPH_LO = new THREE.SphereGeometry(1, 7, 5);
const SPH_HI = new THREE.SphereGeometry(1, 24, 16); // for bodies that carry fine markings
const SPH_XL = new THREE.SphereGeometry(1, 56, 36); // a tortoise's plated shell

// A thin flat shape (fins, wing membranes): drawn in 2D, given a hair of thickness, indexed so it
// merges with the rest of the model. plane 'xz' lays it flat (span along z), 'xy' stands it up.
function flat(draw, plane = 'xy', curveSegments = 8) {
  const shape = new THREE.Shape();
  draw(shape);
  let g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments });
  g.translate(0, 0, -0.5);
  if (plane === 'xz') g.rotateX(Math.PI / 2);
  g.deleteAttribute('uv'); g.clearGroups();
  return mergeVertices(g);
}
const cylCache = new Map();
function cyl(r0, r1, seg = 7, rings = 1) {
  const k = r0.toFixed(3) + '|' + r1.toFixed(3) + '|' + seg + '|' + rings;
  let g = cylCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(r1, r0, 1, seg, rings, true).translate(0, 0.5, 0); cylCache.set(k, g); }
  return g;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Q = new THREE.Quaternion(), E = new THREE.Euler(), UP = V(0, 1, 0);
const place = (pos, rot, scl) => new THREE.Matrix4().compose(V(...pos), Q.setFromEuler(E.set(rot[0], rot[1], rot[2])).clone(), V(...scl));

// Wing planforms: a thin two-faced grid in xz. Chord runs along x (leading edge at +0.5), span
// along z from the shoulder (0) to the tip (1, mirrored for the right wing). The grid has
// interior vertices, so feather zones and colour bands can be painted across it.
//   round: songbirds, woodpeckers, owls: bowed leading edge, rounded tip, scalloped feather tips
//   pointed: hummingbirds, ducks, kingfishers, parrots: swept back to a sharp tip
//   fingered: eagles, hawks, herons: broad, with the outer primaries spread like fingers
const WING_CACHE = new Map();
const PLANFORM = {
  round: t => [0.5 + 0.1 * Math.sin(Math.PI * t) - 0.55 * t ** 4, -0.5 + 0.34 * t * t - 0.05 * Math.abs(Math.sin(Math.PI * t * 7))],
  pointed: t => [0.5 - 0.1 * t - 0.55 * t * t, -0.5 + 0.1 * t + 0.25 * t * t - 0.03 * Math.abs(Math.sin(Math.PI * t * 5)) * (1 - t)],
  fingered: t => [0.5 + 0.05 * Math.sin(Math.PI * t), -0.5 + 0.22 * t * t - 0.04 * Math.abs(Math.sin(Math.PI * t * 6))],
};
function wingShape(kind, side) {
  const key = kind + side;
  if (WING_CACHE.has(key)) return WING_CACHE.get(key);
  const pos = [], idx = [];
  // a strip of quads between two edge functions, on both faces
  const strip = (edge, t0, t1, N, M) => {
    for (const face of [0.5, -0.5]) {
      const base = pos.length / 3;
      for (let i = 0; i <= N; i++) {
        const t = t0 + (t1 - t0) * i / N, [le, te] = edge(t);
        for (let j = 0; j <= M; j++) pos.push(te + (le - te) * j / M, face, side * t);
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
        const a = base + i * (M + 1) + j, b = a + M + 1;
        // wind each face so it points outward (up for the top, down for the bottom), whichever wing it is
        if ((face > 0) === (side > 0)) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  };
  if (kind === 'fingered') {
    strip(PLANFORM.fingered, 0, 0.66, 12, 5);
    for (let f = 0; f < 5; f++) {
      const cx = 0.38 - f * 0.16, tip = 1.0 - Math.abs(f - 1.3) * 0.05, w = 0.075;
      strip(t => { const k = (t - 0.6) / (tip - 0.6), half = w * (1 - k * 0.6); const c = cx - k * 0.08; return [c + half, c - half]; }, 0.6, tip, 4, 1);
    }
  } else strip(PLANFORM[kind] || PLANFORM.round, 0, 1, 18, 5);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  WING_CACHE.set(key, g);
  return g;
}

class Model {
  constructor() { this.parts = []; }
  // geo: a unit primitive; m: where it goes; paint(unitPos, worldPos) -> colour.
  // ext: a second placement (wings spread out), blended in by the shader when flying.
  // paintGeo: optional geometry whose positions are handed to paint() instead of geo's own
  // extSrc: optional geometry the ext placement is applied to, when geo itself was pre-shaped
  add(geo, m, paint, { part = P.BODY, pivot = null, ext = null, paintGeo = null, extSrc = null } = {}) {
    const unit = geo.clone();
    const paintPos = (paintGeo || unit).attributes.position;
    if (unit.attributes.uv) unit.deleteAttribute('uv');
    const g = unit.clone().applyMatrix4(m);
    const n = g.attributes.position.count;
    const color = new Float32Array(n * 3), u = new THREE.Vector3(), p = new THREE.Vector3();
    const fn = typeof paint === 'function' ? paint : solid(paint);
    for (let i = 0; i < n; i++) {
      u.fromBufferAttribute(paintPos, i);
      p.fromBufferAttribute(g.attributes.position, i);
      const c = fn(u, p);
      color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
    const pv = pivot || [0, 0, 0], piv = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { piv[i * 3] = pv[0]; piv[i * 3 + 1] = pv[1]; piv[i * 3 + 2] = pv[2]; }
    g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
    const e = ext ? (extSrc || unit).clone().applyMatrix4(ext) : g;
    g.setAttribute('aExt', e.attributes.position.clone());
    g.setAttribute('aExtN', e.attributes.normal.clone());
    this.parts.push(g);
  }
  ell(pos, r, paint, o = {}) { this.add(o.lo ? SPH_LO : SPH, place(pos, o.rot || [0, 0, 0], r), paint, o); }
  // A tapered limb from p0 (radius r0) to p1 (radius r1), with rounded ends.
  limb(p0, p1, r0, r1, paint, o = {}) {
    const a = V(...p0), d = V(...p1).sub(a), len = d.length() || 1e-3;
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    this.add(cyl(r0, r1, o.seg, o.rings), new THREE.Matrix4().compose(a, q, V(1, len, 1)), paint, o);
    if (o.caps !== false) {
      this.add(SPH_LO, place(p0, [0, 0, 0], [r0, r0, r0]), paint, o);
      this.add(SPH_LO, place(p1, [0, 0, 0], [r1, r1, r1]), paint, o);
    }
  }
  // A wing: spread sideways from the shoulder when flying, folded along the flank when not.
  // Folded, it wraps around the curve of the body (radius R about the body's axis at fold):
  // leading edge along the top, primaries reaching back toward the tail.
  wing(side, pivot, span, chord, thick, paint, fold, kind = 'round', R = chord, tilt = 0) {
    const unit = wingShape(kind, side);
    // spread, a real wing is broad: roughly 2.5 times as long as it is wide
    const ext = place([pivot[0] - chord * 0.25, pivot[1], pivot[2]], [0, 0, 0], [chord * 1.9, thick, span * 1.7]);
    const g = unit.clone(), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), t = Math.abs(p.getZ(i));
      const along = span * 1.2 * t, th = 0.3 + (x * chord * 0.9) / R, r = R + y * thick * 2 + chord * 0.02;
      // then tip the whole folded wing with the body (owls and woodpeckers sit upright)
      const lx = span * 0.5 - along, ly = r * Math.sin(th) - along * 0.06, c = Math.cos(tilt), sn = Math.sin(tilt);
      p.setXYZ(i, fold[0] + lx * c - ly * sn, fold[1] + lx * sn + ly * c, side * r * Math.cos(th));
    }
    g.computeVertexNormals();
    this.add(g, new THREE.Matrix4(), paint, { part: side > 0 ? P.WING_L : P.WING_R, pivot, ext, extSrc: unit, paintGeo: unit });
  }
  build() {
    const g = mergeGeometries(this.parts);
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- mammals
function eyes(m, at, rx, ry, rz, r, part, pivot, color = '#15110e') {
  for (const side of [1, -1]) m.ell([at[0] + rx, at[1] + ry, side * rz], [r, r, r], color, { lo: true, part, pivot });
}

// One smooth body: a tube along x whose oval cross-section swells from haunch to chest and
// rounds off at both ends (no seams between separate blobs). Paint gets (ny, x, side) in
// unit-like coordinates, so countershading and spots work as they do on a sphere.
function loftBody(m, { x0, x1, cy0, cy1, ry0, ry1, rz0, rz1, sag = 0, fine = false }, paint, o = {}) {
  const R = fine === 2 ? 84 : fine ? 56 : 22, A = fine === 2 ? 60 : fine ? 36 : 14, pos = [], idx = [], u = [];
  for (let i = 0; i <= R; i++) {
    const t = i / R, x = x0 + (x1 - x0) * t;
    const w = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 2.6))); // rounded, blunt ends
    const e = t * t * (3 - 2 * t);
    const ry = (ry0 + (ry1 - ry0) * e) * w, rz = (rz0 + (rz1 - rz0) * e) * w, cy = cy0 + (cy1 - cy0) * e - sag * Math.sin(t * Math.PI);
    for (let j = 0; j <= A; j++) {
      const a = j / A * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      pos.push(x, cy + c * ry, sn * rz);
      u.push(2 * t - 1, c, sn);
    }
  }
  for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) {
    const a = i * (A + 1) + j, b = a + A + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1); // wound so the faces (and normals) point outward
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const unitG = new THREE.BufferGeometry();
  unitG.setAttribute('position', new THREE.Float32BufferAttribute(u, 3));
  m.add(g, new THREE.Matrix4(), paint, { ...o, paintGeo: unitG });
}

// Jaguar and ocelot rosettes: broken dark rings with a warmer centre, laid on a jittered grid
// over the coat (u is the unit-sphere-like coordinate every body part is painted with).
// chains: the ocelot's markings stretch into long open blotches running along the body
function rosettes(base, dark, belly, chains = false) {
  const d = col(dark), mid = col(shade(base, -0.18)), b = grad(base, belly, -0.3, 0.5);
  return u => {
    if (u.y < -0.5) return b(u);
    const gx = u.x * (chains ? 3.6 : 5.5), ga = Math.atan2(u.z, u.y) * (chains ? 2.6 : 1.9); // roughly square cells over the body
    const ix = Math.floor(gx), ia = Math.floor(ga);
    const cx = ix + 0.5 + (hash3(ix, ia, 1) - 0.5) * 0.35, ca = ia + 0.5 + (hash3(ix, ia, 2) - 0.5) * 0.35;
    const dist = Math.hypot(gx - cx, ga - ca);
    if (dist > 0.19 && dist < 0.4) return d;
    if (dist <= 0.19) return mid;
    return b(u);
  };
}

// Solid round spots on a jittered grid (cheetah, hyena); size is the spot radius in cell units.
function dots(base, dark, cells, size) {
  const d = col(dark);
  return u => {
    if (u.y < -0.55) return base(u);
    const gx = u.x * cells, ga = Math.atan2(u.z, u.y) * cells * 0.32;
    const ix = Math.floor(gx), ia = Math.floor(ga);
    const cx = ix + 0.5 + (hash3(ix, ia, 1) - 0.5) * 0.4, ca = ia + 0.5 + (hash3(ix, ia, 2) - 0.5) * 0.4;
    return Math.hypot(gx - cx, ga - ca) < size ? d : base(u);
  };
}

function quadruped(m, s, o) {
  const L = s.len, H = o.H, leg = o.leg, W = o.wide ?? 1;
  const by = leg + H * 0.5;
  const base = grad(s.color, s.belly || s.color, -0.3, 0.5);
  // spotted coats (bobcat): small dark rosettes on the back and flanks
  const coat = o.coat ? o.coat(base) : o.dots ? dots(base, o.dots[0], o.dots[1], o.dots[2]) : o.rosettes ? rosettes(s.color, s.dark, s.belly, s.chains)
    : o.spots ? (u => (u.y > -0.35 && hash3(Math.round(u.x * 16), Math.round(u.y * 8), Math.round(u.z * 8)) > 0.7 ? col(o.spots) : base(u))) : base;
  loftBody(m, {
    x0: -L * 0.47, x1: L * 0.45,
    cy0: by + H * (o.hip ?? 0.02), cy1: by + H * (o.shoulder ?? 0.04),
    ry0: H * 0.52 * (o.haunch ?? 1), ry1: H * 0.54 * (o.chest ?? 1),
    rz0: H * 0.42 * W, rz1: H * 0.41 * W, sag: H * 0.04, fine: o.rosettes || o.dots || o.fine ? 2 : false,
  }, coat);
  if (o.extra) o.extra(m, { L, H, leg, by, W, coat });

  // legs: upper and lower segment, swinging from the hip
  const lc = o.legColor || shade(s.color, -0.2);
  const spots = [[L * 0.26, 1, P.LEG_FL], [L * 0.26, -1, P.LEG_FR], [-L * 0.25, 1, P.LEG_BL], [-L * 0.25, -1, P.LEG_BR]];
  for (const [x, side, part] of spots) {
    // set in far enough that even thick upper legs stay inside the body's outline
    const z = side * Math.min(H * 0.24, H * 0.42 - o.legR0) * W, hip = [x, by - H * 0.05, z];
    const r0 = o.legR0, r1 = o.legR1, knee = [x + (part >= P.LEG_BL ? -r0 * 0.5 : r0 * 0.2), leg * 0.5, z];
    const c = part < P.LEG_BL && o.frontLeg ? o.frontLeg : lc;
    m.limb(hip, knee, r0, (r0 + r1) * 0.55, c, { part, pivot: hip });
    m.limb(knee, [x, r1, z], (r0 + r1) * 0.55, r1, c, { part, pivot: hip });
    if (o.hoof) m.ell([x + r1 * 0.2, r1 * 0.75, z], [r1 * 1.3, r1 * 0.85, r1 * 1.15], o.hoof, { part, pivot: hip, lo: true });
  }

  // head and neck, which dip together when grazing
  const neck = [L * 0.3, by + H * 0.12, 0];
  const hp = o.head, hr = o.headR;
  const hc = o.headColor ? grad(o.headColor, s.belly || o.headColor, -0.4, 0.5) : coat;
  const hd = { part: P.HEAD, pivot: neck };
  if (o.neckR) m.limb(neck, [hp[0] - hr[0] * 0.3, hp[1] - hr[1] * 0.2, 0], o.neckR, o.neckR * 0.8, o.neckColor ? solid(o.neckColor) : hc, { ...hd, seg: o.neckSeg, rings: o.neckRings });
  m.ell(hp, hr, hc, hd);
  const sn = [hp[0] + hr[0] * 0.78, hp[1] - hr[1] * 0.28, 0];
  m.ell([sn[0] + o.snout * 0.3, sn[1], 0], [o.snout, hr[1] * 0.55, hr[2] * 0.58], o.muzzle || hc, hd);
  if (o.nose !== false) m.ell([sn[0] + o.snout * 1.22, sn[1] + hr[1] * 0.1, 0], [hr[1] * 0.2, hr[1] * 0.17, hr[1] * 0.22], '#1c1714', { ...hd, lo: true });
  eyes(m, hp, hr[0] * 0.42, hr[1] * 0.28, hr[2] * 0.78, Math.max(0.55, H * 0.045), P.HEAD, neck);
  if (o.mask) m.ell([hp[0] + hr[0] * 0.4, hp[1] + hr[1] * 0.2, 0], [hr[0] * 0.35, hr[1] * 0.3, hr[2] * 1.02], s.dark, hd);
  const ec = o.earColor || shade(s.color, -0.1);
  for (const side of [1, -1]) {
    const base = [hp[0] - hr[0] * 0.2, hp[1] + hr[1] * 0.75, side * hr[2] * 0.55];
    if (o.ears === 'none') continue;
    if (o.ears === 'round') m.ell([base[0], base[1] + o.ear * 0.3, base[2]], [o.ear * 0.45, o.ear * 0.55, o.ear * 0.25], ec, hd);
    else {
      const tip = [base[0] - o.ear * (o.earBack ?? 0.25), base[1] + o.ear, base[2] + side * o.ear * (o.earOut ?? 0.35)];
      m.limb(base, tip, o.ear * (o.earW ?? 0.32), o.ear * 0.06, ec, hd);
      if (o.tufts) m.limb(tip, [tip[0], tip[1] + o.ear * 0.35, tip[2]], o.ear * 0.08, o.ear * 0.02, s.dark, { ...hd, caps: false });
    }
  }
  if (o.antlers) o.antlers(m, hp, hr, hd);
  if (o.face) o.face(m, hp, hr, hd, sn);
  if (o.tail) o.tail(m, { L, H, leg, by, W, coat, part: P.TAIL });
}

const MAMMALS = {
  deer: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    return {
      H, leg, legR0: H * 0.12, legR1: H * 0.055, hoof: '#2a211a', neckR: H * 0.17, neckColor: s.neck,
      head: [L * 0.5, by + H * 0.95], headR: [H * 0.3, H * 0.24, H * 0.21], snout: H * 0.28,
      ears: 'point', ear: H * 0.34, earOut: 0.8, earBack: 0.1, earW: 0.3, headColor: s.neck ? s.neck : null,
      extra: s.rump ? (m, b) => m.ell([-L * 0.33, b.by + H * 0.08, 0], [L * 0.12, H * 0.34, H * 0.36], s.rump) : null,
      tail: (m, b) => m.ell([-L * 0.45, b.by + H * 0.28, 0], [H * 0.12, H * 0.2, H * 0.1], s.rump || shade(s.belly, 0.4), { part: P.TAIL, pivot: [-L * 0.42, b.by + H * 0.35, 0], rot: [0, 0, -0.5] }),
      antlers: s.antlers ? (m, hp, hr, hd) => {
        for (const side of [1, -1]) {
          const z = side * hr[2] * 0.5, base = [hp[0] - hr[0] * 0.3, hp[1] + hr[1] * 0.7, z];
          const r = H * 0.05, bone = '#cdb994', tip = '#efe6d0';
          const beam = [[base[0] - H * 0.12, base[1] + H * 0.35, z + side * H * 0.22], [base[0] - H * 0.38, base[1] + H * 0.7, z + side * H * 0.42],
            [base[0] - H * 0.66, base[1] + H * 0.95, z + side * H * 0.5], [base[0] - H * 0.9, base[1] + H * 1.05, z + side * H * 0.42]];
          let prev = base;
          beam.forEach((pt, n) => { m.limb(prev, pt, r * (1 - n * 0.12), r * (0.9 - n * 0.14), n === 3 ? tip : bone, hd); prev = pt; });
          // brow tine forward, then upswept tines along the beam
          m.limb(beam[0], [beam[0][0] + H * 0.32, beam[0][1] + H * 0.1, beam[0][2] + side * H * 0.05], r * 0.7, r * 0.2, tip, { ...hd, caps: false });
          for (const n of [1, 2]) m.limb(beam[n], [beam[n][0] + H * 0.08, beam[n][1] + H * 0.36, beam[n][2] + side * H * 0.04], r * 0.65, r * 0.18, tip, { ...hd, caps: false });
        }
      } : null,
    };
  },
  canine: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    return {
      H, leg, legR0: H * 0.18, legR1: H * 0.1, neckR: H * 0.28, legColor: shade(s.color, -0.12),
      head: [L * 0.52, by + H * 0.5], headR: [H * 0.34, H * 0.3, H * 0.27], snout: H * 0.36,
      ears: 'point', ear: H * 0.38, earOut: 0.15, earBack: 0.05, muzzle: grad(s.color, s.belly, -0.1, 0.4),
      tail: (m, b) => {
        m.ell([-L * 0.58, b.by - H * 0.1, 0], [L * 0.24, H * 0.2, H * 0.2], grad(s.color, s.belly), { part: P.TAIL, pivot: [-L * 0.42, b.by + H * 0.15, 0], rot: [0, 0, 0.75] });
        m.ell([-L * 0.72, b.by - H * 0.42, 0], [H * 0.17, H * 0.14, H * 0.14], s.dark, { part: P.TAIL, pivot: [-L * 0.42, b.by + H * 0.15, 0], lo: true });
      },
    };
  },
  feline: s => {
    // jaguars are built like wrestlers: deep chest, thick legs, a broad heavy head and a shorter tail
    const k = s.stocky ? 1 : 0;
    const L = s.len, H = s.h * (1 + k * 0.12), leg = s.leg * (0.85 - k * 0.08), by = leg + H * 0.5;
    const hs = 1 + k * 0.18;
    return {
      H, leg, chest: 1 + k * 0.1, legR0: H * (s.cheetah ? 0.16 : 0.22 + k * 0.08), legR1: H * (s.cheetah ? 0.09 : 0.14 + k * 0.06), neckR: H * (0.3 + k * 0.08), spots: s.bobtail ? shade(s.color, -0.45) : null, dots: s.cheetah ? [s.dark, 9, 0.2] : null, rosettes: s.rosettes,
      hoof: s.rosettes ? shade(s.color, -0.12) : null, // big soft paws
      head: [L * 0.5, by + H * (0.38 - k * 0.1)], headR: [H * 0.36 * hs, H * 0.33 * hs, H * 0.34 * hs], snout: H * 0.15 * hs,
      ears: s.rosettes || s.mane || s.cheetah ? 'round' : 'point', ear: H * (s.rosettes || s.cheetah ? 0.3 : s.mane ? 0.24 : 0.26), earOut: 0.2, earBack: 0.1, earW: 0.45, tufts: s.bobtail, muzzle: grad(s.color, s.belly, 0.1, 0.4),
      face: s.mane ? (m, hp, hr, hd) => {
        // a lion's mane: a shaggy ruff around the head and down the neck
        const mane = u => tmp.copy(col(s.mane)).multiplyScalar(0.8 + hash3(Math.round(u.x * 7), Math.round(u.y * 7), Math.round(u.z * 7)) * 0.4);
        m.ell([hp[0] - hr[0] * 0.55, hp[1] - hr[1] * 0.15, 0], [hr[0] * 0.95, hr[1] * 1.45, hr[2] * 1.45], mane, hd);
        m.ell([hp[0] - hr[0] * 1.3, hp[1] - hr[1] * 0.7, 0], [hr[0] * 0.9, hr[1] * 1.1, hr[2] * 1.15], mane, hd);
      } : s.cheetah ? (m, hp, hr, hd) => {
        // cheetah: black "tear" lines from the eyes to the mouth
        for (const side of [1, -1]) m.limb([hp[0] + hr[0] * 0.5, hp[1] + hr[1] * 0.1, side * hr[2] * 0.62], [hp[0] + hr[0] * 0.95, hp[1] - hr[1] * 0.45, side * hr[2] * 0.42], hr[1] * 0.06, hr[1] * 0.05, s.dark, { ...hd, caps: false });
      } : null,
      tail: (m, b) => {
        const base = [-L * 0.42, b.by + H * 0.15, 0], o = { part: P.TAIL, pivot: base };
        if (s.bobtail) { m.ell([-L * 0.47, b.by + H * 0.22, 0], [H * 0.2, H * 0.12, H * 0.12], s.color, { ...o, rot: [0, 0, 0.5] }); return; }
        const tl = s.stocky ? 0.72 : 1;
        const p1 = [-L * (0.42 + 0.28 * tl), b.by - H * 0.35, 0], p2 = [-L * (0.42 + 0.53 * tl), b.by - H * 0.2, 0];
        m.limb(base, p1, H * 0.11, H * 0.1, s.color, o);
        m.limb(p1, p2, H * 0.1, H * 0.09, s.color, o);
        m.ell(p2, [H * 0.12, H * 0.12, H * 0.12], s.dark, { ...o, lo: true });
      },
    };
  },
  bear: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    return {
      H, leg, wide: 1.25, shoulder: 0.14, chest: 1.08, legR0: H * 0.21, legR1: H * 0.17, neckR: H * 0.3,
      head: [L * 0.52, by + H * 0.08], headR: [H * 0.32, H * 0.3, H * 0.31], snout: H * 0.26, muzzle: s.muzzle,
      ears: 'round', ear: H * 0.18, earColor: s.color,
      tail: (m, b) => m.ell([-L * 0.45, b.by + H * 0.15, 0], [H * 0.1, H * 0.1, H * 0.1], s.color, { part: P.TAIL, pivot: [-L * 0.42, b.by, 0], lo: true }),
    };
  },
  raccoon: s => {
    const L = s.len, H = L * 0.46, leg = L * 0.2, by = leg + H * 0.5;
    return {
      H, leg, wide: 1.1, legR0: H * 0.22, legR1: H * 0.14, legColor: s.dark, neckR: H * 0.32, hip: 0.18, haunch: 1.12,
      head: [L * 0.47, by + H * 0.3], headR: [H * 0.4, H * 0.35, H * 0.38], snout: H * 0.32, muzzle: shade(s.belly, 0.3), mask: true,
      ears: 'point', ear: H * 0.28, earOut: 0.3, earW: 0.45, earColor: shade(s.belly, 0.2),
      tail: (m, b) => {
        const base = [-L * 0.4, b.by + H * 0.05, 0], o = { part: P.TAIL, pivot: base };
        for (let k = 0; k < 5; k++) {
          const t0 = k / 5, t1 = (k + 1) / 5;
          const p = t => [base[0] - L * 0.5 * t, base[1] - H * 0.55 * t, 0];
          m.limb(p(t0), p(t1), H * (0.2 - t0 * 0.05), H * (0.2 - t1 * 0.05), k % 2 ? s.dark : s.belly, { ...o, caps: k === 4 });
        }
      },
    };
  },
  otter: s => {
    const L = s.len, H = L * 0.3, leg = L * 0.14, by = leg + H * 0.5;
    return {
      H, leg, wide: 1.05, legR0: H * 0.2, legR1: H * 0.14, neckR: H * 0.36,
      head: [L * 0.48, by + H * 0.3], headR: [H * 0.44, H * 0.36, H * 0.4], snout: H * 0.22, muzzle: shade(s.belly, 0.2),
      ears: 'round', ear: H * 0.12,
      // giant otters carry a creamy throat blotch, different on every animal
      face: s.throat ? (m, hp, hr, hd) => m.ell([hp[0] + hr[0] * 0.1, hp[1] - hr[1] * 0.75, 0], [hr[0] * 0.75, hr[1] * 0.45, hr[2] * 0.8], s.throat, hd) : null,
      tail: (m, b) => { const base = [-L * 0.36, b.by, 0]; m.limb(base, [-L * 0.85, H * 0.3, 0], H * 0.34, H * 0.07, s.color, { part: P.TAIL, pivot: base }); },
    };
  },
  beaver: s => {
    const L = s.len, H = L * 0.46, leg = L * 0.12, by = leg + H * 0.5;
    return {
      H, leg, wide: 1.15, hip: 0.08, haunch: 1.1, legR0: H * 0.16, legR1: H * 0.12, legColor: shade(s.color, -0.35), neckR: H * 0.34,
      head: [L * 0.43, by + H * 0.05], headR: [H * 0.34, H * 0.32, H * 0.33], snout: H * 0.2, muzzle: shade(s.belly, 0.1),
      ears: 'round', ear: H * 0.1,
      tail: (m, b) => {
        const base = [-L * 0.4, b.by - H * 0.15, 0];
        m.ell([-L * 0.62, H * 0.2, 0], [L * 0.22, H * 0.07, H * 0.3], u => tmp.copy(col('#2e2a26')).lerp(col('#48403a'), hash3(Math.round(u.x * 5), 0, Math.round(u.z * 4))), { part: P.TAIL, pivot: base, rot: [0, 0, 0.12] });
      },
    };
  },
  rodent: s => {
    const L = s.len, H = L * 0.52, leg = L * 0.12, by = leg + H * 0.5;
    return {
      H, leg, wide: 1.05, legR0: H * 0.12, legR1: H * 0.08, legColor: shade(s.color, 0.1),
      head: [L * 0.4, by + H * 0.08], headR: [H * 0.42, H * 0.38, H * 0.38], snout: H * 0.24,
      ears: 'round', ear: H * 0.18, earColor: shade(s.color, 0.12),
      tail: (m, b) => { const base = [-L * 0.36, b.by - H * 0.1, 0]; m.limb(base, [-L * 0.75, H * 0.12, 0], H * 0.06, H * 0.03, shade(s.color, 0.1), { part: P.TAIL, pivot: base }); },
    };
  },
  rabbit: s => {
    const L = s.len, H = L * 0.5, leg = L * 0.16, by = leg + H * 0.5;
    return {
      H, leg, hip: 0.14, haunch: 1.15, legR0: H * 0.14, legR1: H * 0.09,
      head: [L * 0.4, by + H * 0.55], headR: [H * 0.36, H * 0.32, H * 0.3], snout: H * 0.18, neckR: H * 0.28,
      ears: 'point', ear: H * 0.95, earOut: 0.18, earBack: 0.45, earW: 0.2, earColor: shade(s.color, 0.05),
      tail: (m, b) => m.ell([-L * 0.44, b.by + H * 0.15, 0], [H * 0.2, H * 0.2, H * 0.2], '#f2eee6', { part: P.TAIL, pivot: [-L * 0.4, b.by, 0], lo: true }),
    };
  },
  squirrel: s => {
    const L = s.len, H = L * 0.42, leg = L * 0.2, by = leg + H * 0.5;
    return {
      H, leg, hip: 0.1, legR0: H * 0.14, legR1: H * 0.09, neckR: H * 0.3,
      head: [L * 0.44, by + H * 0.45], headR: [H * 0.4, H * 0.36, H * 0.36], snout: H * 0.2,
      ears: 'point', ear: H * 0.32, earOut: 0.1, earW: 0.4,
      tail: (m, b) => {
        const base = [-L * 0.36, b.by, 0], o = { part: P.TAIL, pivot: base }, c = grad(s.color, s.belly, 0.2, 0.6);
        m.ell([-L * 0.52, b.by + H * 0.3, 0], [H * 0.4, H * 0.55, H * 0.35], c, { ...o, rot: [0, 0, -0.6] });
        m.ell([-L * 0.58, b.by + H * 1.0, 0], [H * 0.42, H * 0.5, H * 0.36], c, { ...o, rot: [0, 0, 0.3] });
        m.ell([-L * 0.42, b.by + H * 1.45, 0], [H * 0.35, H * 0.3, H * 0.3], c, o);
      },
    };
  },
  // Collared peccary: a bristly wedge with a pig's disc snout and a pale collar over the shoulders.
  peccary: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    return {
      H, leg, hip: -0.02, shoulder: 0.12, chest: 1.08, haunch: 0.92, legR0: H * 0.14, legR1: H * 0.07, legColor: shade(s.color, -0.3), hoof: '#1a1614', neckR: H * 0.36,
      coat: base => u => {
        const cx = u.x - 0.46 - u.y * 0.12; // a thin band slanting back from the throat over the shoulders
        if (Math.abs(cx) < 0.045 && u.y > -0.55) return col(s.collar);
        const c = base(u); return tmp.copy(c).multiplyScalar(0.85 + hash3(Math.round(u.x * 24), Math.round(u.y * 10), Math.round(u.z * 10)) * 0.3);
      },
      head: [L * 0.5, by - H * 0.02], headR: [H * 0.34, H * 0.26, H * 0.23], snout: H * 0.26, muzzle: shade(s.color, -0.1), nose: false,
      face: (m, hp, hr, hd, sn) => m.ell([sn[0] + H * 0.34, sn[1], 0], [H * 0.035, H * 0.1, H * 0.1], '#5a4440', hd),
      ears: 'point', ear: H * 0.22, earOut: 0.35, earW: 0.45,
    };
  },
  // Agouti: a big-eyed rodent up on thin legs, rump high and rounded, no visible tail.
  agouti: s => {
    const L = s.len, H = L * 0.4, leg = L * 0.28, by = leg + H * 0.5;
    return {
      H, leg, wide: 0.85, hip: 0.24, haunch: 1.2, chest: 0.8, legR0: H * 0.13, legR1: H * 0.05, legColor: shade(s.color, -0.3), hoof: '#2a1f18', neckR: H * 0.28,
      coat: base => u => (u.x < -0.3 && u.y > -0.2 ? col(shade(s.color, 0.12)) : base(u)), // golden rump
      head: [L * 0.46, by + H * 0.3], headR: [H * 0.4, H * 0.33, H * 0.3], snout: H * 0.3,
      ears: 'round', ear: H * 0.2, earColor: shade(s.color, -0.25),
    };
  },
  // Giant anteater: a long tube of a face, a huge flag of a tail, and the black-and-white shoulder sash.
  anteater: s => {
    const L = s.len, H = L * 0.4, leg = L * 0.2, by = leg + H * 0.5;
    const white = col('#e8e0cc'), black = col(s.stripe);
    return {
      H, leg, hip: 0.02, shoulder: 0.1, chest: 1.05, legR0: H * 0.19, legR1: H * 0.11, legColor: s.belly, frontLeg: '#ddd4c0', neckR: H * 0.36,
      coat: base => u => {
        const d = u.x - 0.34 + u.y * 0.32; // diagonal from the chest up and back over the shoulder
        if (u.y > -0.7 && Math.abs(d) < 0.08) return black;
        if (u.y > -0.7 && Math.abs(d) < 0.14) return white;
        return base(u);
      },
      head: [L * 0.5, by - H * 0.02], headR: [H * 0.32, H * 0.22, H * 0.2], snout: H * 0.12, nose: false,
      face: (m, hp, hr, hd) => {
        const tip = [hp[0] + H * 1.0, hp[1] - H * 0.36, 0];
        m.limb([hp[0] + hr[0] * 0.3, hp[1] - hr[1] * 0.05, 0], tip, hr[1] * 0.85, hr[1] * 0.2, shade(s.color, -0.05), hd);
        m.ell(tip, [hr[1] * 0.22, hr[1] * 0.2, hr[1] * 0.2], '#1a1410', { ...hd, lo: true });
      },
      ears: 'round', ear: H * 0.1,
      tail: (m, b) => {
        const base = [-L * 0.44, b.by + H * 0.05, 0], o = { part: P.TAIL, pivot: base };
        const fur = u => tmp.copy(col(s.color)).lerp(col(shade(s.color, -0.35)), smooth(0.2, -0.8, u.y));
        m.ell([-L * 0.68, b.by + H * 0.08, 0], [L * 0.3, H * 0.24, H * 0.13], fur, { ...o, rot: [0, 0, 0.08] });  // the tail itself
        m.ell([-L * 0.72, b.by - H * 0.2, 0], [L * 0.33, H * 0.42, H * 0.07], shade(s.color, -0.25), { ...o, rot: [0, 0, 0.06] }); // long hair hanging below
      },
    };
  },
  // ---------------------------------------------------------------- Serengeti hoofed animals
  // Plains zebra: a horse with bold black stripes (chevrons over the rump), striped legs and an
  // upright mane.
  zebra: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    const dark = col(s.dark), light = col(s.color), belly = col(s.belly);
    const stripes = () => u => {
      if (u.y < -0.7) return belly;
      const a = Math.abs(Math.atan2(u.z, u.y));
      const rump = u.x < -0.35 ? (u.x + 0.35) * a * 6 : 0;
      return Math.sin(u.x * 24 + rump + a * 1.2) > 0.15 ? dark : light;
    };
    const legC = u => (Math.sin(u.y * 9) > 0.2 ? dark : light);
    return {
      H, leg, legR0: H * 0.14, legR1: H * 0.075, hoof: '#141414', neckR: H * 0.22, shoulder: 0.06, chest: 0.95,
      coat: stripes, legColor: legC, headColor: null,
      head: [L * 0.55, by + H * 0.72], headR: [H * 0.32, H * 0.21, H * 0.17], snout: H * 0.3, muzzle: '#2a2626',
      ears: 'point', ear: H * 0.27, earOut: 0.3, earBack: 0.1, earW: 0.3, earColor: s.color,
      face: (m, hp, hr, hd) => m.limb([L * 0.3, by + H * 0.52, 0], [hp[0] - hr[0] * 0.6, hp[1] + hr[1] * 0.9, 0], H * 0.07, H * 0.05, u => (Math.sin(u.y * 8) > 0 ? dark : light), hd),
      tail: (m, b) => { const base = [-L * 0.46, b.by + H * 0.25, 0]; m.limb(base, [-L * 0.55, b.by - H * 0.35, 0], H * 0.04, H * 0.03, s.color, { part: P.TAIL, pivot: base }); m.ell([-L * 0.56, b.by - H * 0.45, 0], [H * 0.06, H * 0.13, H * 0.06], s.dark, { part: P.TAIL, pivot: base, lo: true }); },
    };
  },
  // Wildebeest: a front-heavy antelope with high shoulders and a sloping back, a long, broad,
  // blunt face carried low, cow-like horns that sweep out and hook up, a black mane and beard, and
  // silvery grey coat with dark bands over the shoulders.
  wildebeest: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    const dark = col(s.dark);
    return {
      H, leg, hip: -0.16, shoulder: 0.22, chest: 1.12, haunch: 0.8, legR0: H * 0.14, legR1: H * 0.055, hoof: '#141414', neckR: H * 0.24,
      legColor: u => tmp.copy(col(s.color)).lerp(dark, smooth(0.6, 0.1, u.y) * 0.6),
      coat: base => u => (u.x > -0.05 && u.y > -0.55 && Math.sin(u.x * 26 + u.y * 2) > 0.45 ? col(shade(s.color, -0.28)) : base(u)), // the brindled bands
      head: [L * 0.57, by + H * 0.22], headR: [H * 0.24, H * 0.24, H * 0.19], snout: H * 0.04, muzzle: s.dark, nose: false,
      ears: 'point', ear: H * 0.17, earOut: 1.0, earBack: 0.05, earW: 0.35, earColor: s.color,
      antlers: (m, hp, hr, hd) => {
        for (const side of [1, -1]) {
          const b0 = [hp[0] - hr[0] * 0.2, hp[1] + hr[1] * 0.75, side * hr[2] * 0.5], b1 = [b0[0] - H * 0.02, b0[1] - H * 0.03, side * H * 0.42];
          const b2 = [b1[0] + H * 0.03, b1[1] + H * 0.18, side * H * 0.44], b3 = [b2[0] - H * 0.03, b2[1] + H * 0.1, side * H * 0.32];
          m.limb(b0, b1, H * 0.055, H * 0.045, '#4a4640', hd); m.limb(b1, b2, H * 0.045, H * 0.03, '#3a3632', hd); m.limb(b2, b3, H * 0.03, H * 0.008, '#2a2826', { ...hd, caps: false });
        }
      },
      face: (m, hp, hr, hd) => {
        // the long, blunt face, angled down to a broad black nose
        const f0 = [hp[0] + hr[0] * 0.3, hp[1] - hr[1] * 0.1, 0], f1 = [hp[0] + H * 0.46, hp[1] - H * 0.42, 0];
        m.limb(f0, f1, H * 0.17, H * 0.15, u => tmp.copy(col(s.color)).lerp(dark, 0.55), hd);
        m.ell([f1[0] + H * 0.02, f1[1] - H * 0.02, 0], [H * 0.11, H * 0.1, H * 0.16], s.dark, hd);
        for (const side of [1, -1]) m.ell([f1[0] + H * 0.08, f1[1] - H * 0.01, side * H * 0.08], [H * 0.03, H * 0.03, H * 0.03], '#0a0a0a', { ...hd, lo: true }); // nostrils
        // black beard hanging from the throat, and the upright mane along the neck
        m.ell([hp[0] - hr[0] * 0.2, hp[1] - hr[1] * 1.3, 0], [H * 0.14, H * 0.3, H * 0.07], s.dark, hd);
        m.ell([L * 0.38, by + H * 0.08, 0], [H * 0.16, H * 0.26, H * 0.06], s.dark, hd);
        for (let k = 0; k < 7; k++) {
          const t = k / 6, p = [L * 0.22 + (hp[0] - hr[0] * 0.5 - L * 0.22) * t, by + H * 0.56 + (hp[1] + hr[1] * 0.8 - by - H * 0.56) * t, 0];
          m.ell(p, [H * 0.09, H * 0.11, H * 0.035], s.dark, { ...hd, lo: true });
        }
      },
      tail: (m, b) => {
        const base = [-L * 0.46, b.by + H * 0.08, 0];
        m.limb(base, [-L * 0.52, b.by - H * 0.3, 0], H * 0.04, H * 0.035, s.color, { part: P.TAIL, pivot: base });
        m.limb([-L * 0.52, b.by - H * 0.3, 0], [-L * 0.53, b.by - H * 0.75, 0], H * 0.06, H * 0.03, s.dark, { part: P.TAIL, pivot: base }); // long black switch
      },
    };
  },
  // Thomson's gazelle: slim and small, tan with a black flank band, white belly and ringed horns.
  gazelle: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    return {
      H, leg, legR0: H * 0.12, legR1: H * 0.05, legColor: shade(s.color, 0.1), hoof: '#1a1612', neckR: H * 0.19, chest: 0.95,
      coat: base => u => (u.y < -0.45 ? col(s.belly) : u.y < -0.2 && u.x > -0.6 && u.x < 0.55 ? col(s.dark) : base(u)),
      head: [L * 0.53, by + H * 0.85], headR: [H * 0.27, H * 0.2, H * 0.17], snout: H * 0.24,
      ears: 'point', ear: H * 0.3, earOut: 0.45, earBack: 0.1, earW: 0.3,
      antlers: (m, hp, hr, hd) => {
        const ring = u => (Math.sin(u.y * 14) > 0 ? col('#2a241e') : col('#4a4034'));
        for (const side of [1, -1]) { const b0 = [hp[0] - hr[0] * 0.2, hp[1] + hr[1] * 0.8, side * hr[2] * 0.3], b1 = [b0[0] - H * 0.14, b0[1] + H * 0.36, side * hr[2] * 0.4], b2 = [b1[0] + H * 0.02, b1[1] + H * 0.14, side * hr[2] * 0.3]; m.limb(b0, b1, H * 0.035, H * 0.026, ring, hd); m.limb(b1, b2, H * 0.026, H * 0.01, '#2a241e', { ...hd, caps: false }); }
      },
      tail: (m, b) => m.ell([-L * 0.47, b.by + H * 0.1, 0], [H * 0.05, H * 0.14, H * 0.05], s.dark, { part: P.TAIL, pivot: [-L * 0.45, b.by + H * 0.2, 0] }),
    };
  },
  // Impala: reddish and two-toned, the ram with long lyre-shaped horns, black tufts on the rump.
  impala: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    return {
      H, leg, legR0: H * 0.12, legR1: H * 0.055, legColor: shade(s.color, -0.05), hoof: '#1a1612', neckR: H * 0.19,
      coat: base => u => (u.y < -0.55 ? col(s.belly) : u.y < -0.2 ? col(shade(s.color, 0.2)) : base(u)),
      head: [L * 0.53, by + H * 0.85], headR: [H * 0.27, H * 0.2, H * 0.17], snout: H * 0.26,
      ears: 'point', ear: H * 0.32, earOut: 0.5, earBack: 0.1, earW: 0.32,
      antlers: s.lyre ? (m, hp, hr, hd) => {
        for (const side of [1, -1]) {
          const pts = [[hp[0] - hr[0] * 0.2, hp[1] + hr[1] * 0.8, side * hr[2] * 0.3], [hp[0] - H * 0.22, hp[1] + H * 0.42, side * H * 0.22], [hp[0] - H * 0.22, hp[1] + H * 0.82, side * H * 0.12], [hp[0] - H * 0.08, hp[1] + H * 1.05, side * H * 0.2]];
          for (let k = 1; k < pts.length; k++) m.limb(pts[k - 1], pts[k], H * (0.05 - k * 0.012), H * (0.04 - k * 0.012), '#2e2620', { ...hd, caps: false });
        }
      } : null,
      tail: (m, b) => m.ell([-L * 0.48, b.by + H * 0.12, 0], [H * 0.05, H * 0.16, H * 0.07], s.belly, { part: P.TAIL, pivot: [-L * 0.45, b.by + H * 0.2, 0] }),
    };
  },
  // Cape buffalo: heavy and black, with a massive boss of horn that sweeps down and hooks up.
  buffalo: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    return {
      H, leg, wide: 1.18, shoulder: 0.12, chest: 1.1, legR0: H * 0.2, legR1: H * 0.12, hoof: '#0e0c0a', neckR: H * 0.34,
      head: [L * 0.53, by - H * 0.0], headR: [H * 0.33, H * 0.28, H * 0.26], snout: H * 0.28, muzzle: '#1a1614',
      ears: 'point', ear: H * 0.2, earOut: 1.2, earBack: 0.1, earW: 0.45, earColor: s.color,
      antlers: (m, hp, hr, hd) => {
        m.ell([hp[0] - hr[0] * 0.25, hp[1] + hr[1] * 0.85, 0], [hr[0] * 0.5, hr[1] * 0.28, hr[2] * 1.1], '#8c826e', hd); // the boss
        for (const side of [1, -1]) {
          const b0 = [hp[0] - hr[0] * 0.2, hp[1] + hr[1] * 0.8, side * hr[2] * 0.9], b1 = [b0[0] + H * 0.04, b0[1] - H * 0.2, side * H * 0.52], b2 = [b1[0] + H * 0.1, b1[1] + H * 0.2, side * H * 0.62];
          m.limb(b0, b1, H * 0.09, H * 0.065, '#8c826e', hd); m.limb(b1, b2, H * 0.065, H * 0.015, '#5a5446', { ...hd, caps: false });
        }
      },
      tail: (m, b) => { const base = [-L * 0.46, b.by + H * 0.15, 0]; m.limb(base, [-L * 0.52, b.by - H * 0.5, 0], H * 0.035, H * 0.03, s.color, { part: P.TAIL, pivot: base }); m.ell([-L * 0.52, b.by - H * 0.56, 0], [H * 0.05, H * 0.1, H * 0.05], s.dark, { part: P.TAIL, pivot: base, lo: true }); },
    };
  },
  // Warthog: a wide flat face with warts and curling tusks, a bristly mane, and the tail held straight up.
  warthog: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    return {
      H, leg, shoulder: 0.1, chest: 1.05, haunch: 0.9, legR0: H * 0.13, legR1: H * 0.08, legColor: shade(s.color, -0.2), hoof: '#1a1614', neckR: H * 0.34,
      head: [L * 0.5, by - H * 0.08], headR: [H * 0.4, H * 0.28, H * 0.32], snout: H * 0.3, muzzle: shade(s.color, -0.1), nose: false,
      ears: 'point', ear: H * 0.2, earOut: 0.6, earW: 0.4,
      face: (m, hp, hr, hd, sn) => {
        m.ell([sn[0] + H * 0.38, sn[1], 0], [H * 0.04, H * 0.12, H * 0.14], '#4a3a36', hd); // disc of a nose
        for (const side of [1, -1]) {
          m.limb([sn[0] + H * 0.2, sn[1] - H * 0.04, side * H * 0.12], [sn[0] + H * 0.24, sn[1] + H * 0.26, side * H * 0.3], H * 0.04, H * 0.012, '#ece4d0', { ...hd, caps: false }); // tusks
          m.ell([hp[0] + hr[0] * 0.45, hp[1] - hr[1] * 0.2, side * hr[2] * 0.95], [H * 0.07, H * 0.06, H * 0.05], shade(s.color, -0.15), { ...hd, lo: true }); // warts
        }
        m.limb([hp[0] - hr[0] * 0.6, hp[1] + hr[1] * 0.8, 0], [-L * 0.25, by + H * 0.5, 0], H * 0.07, H * 0.04, s.dark, hd); // mane
      },
      tail: (m, b) => { const base = [-L * 0.46, b.by + H * 0.2, 0]; m.limb(base, [-L * 0.5, b.by + H * 0.9, 0], H * 0.03, H * 0.02, s.color, { part: P.TAIL, pivot: base }); m.ell([-L * 0.5, b.by + H * 0.98, 0], [H * 0.05, H * 0.1, H * 0.05], s.dark, { part: P.TAIL, pivot: base, lo: true }); },
    };
  },
  // Spotted hyena: high shoulders, low haunches, a heavy head with round ears, spotted coat.
  hyena: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    return {
      H, leg, hip: -0.16, shoulder: 0.16, chest: 1.1, haunch: 0.8, legR0: H * 0.16, legR1: H * 0.09, legColor: shade(s.color, -0.1), neckR: H * 0.32, dots: [s.dark, 6, 0.26],
      head: [L * 0.54, by + H * 0.35], headR: [H * 0.36, H * 0.3, H * 0.28], snout: H * 0.28, muzzle: '#2a2420',
      ears: 'round', ear: H * 0.26, earColor: shade(s.color, -0.1),
      tail: (m, b) => { const base = [-L * 0.44, b.by, 0]; m.limb(base, [-L * 0.55, b.by - H * 0.4, 0], H * 0.07, H * 0.09, s.dark, { part: P.TAIL, pivot: base }); },
    };
  },
  // Black rhino: heavy and grey, with two horns and a hooked upper lip for browsing.
  rhino: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    const hide = base => u => tmp.copy(base(u)).multiplyScalar(0.92 + hash3(Math.round(u.x * 14), Math.round(u.y * 7), Math.round(u.z * 7)) * 0.12);
    return {
      H, leg, wide: 1.15, hip: 0.06, shoulder: 0.1, chest: 1.05, legR0: H * 0.2, legR1: H * 0.15, hoof: '#2a2826', neckR: H * 0.36, coat: hide,
      head: [L * 0.52, by - H * 0.12], headR: [H * 0.36, H * 0.25, H * 0.22], snout: H * 0.3, muzzle: shade(s.color, -0.05), nose: false,
      ears: 'point', ear: H * 0.2, earOut: 0.25, earBack: 0.15, earW: 0.4,
      face: (m, hp, hr, hd, sn) => {
        m.limb([sn[0] + H * 0.18, sn[1] + H * 0.12, 0], [sn[0] + H * 0.34, sn[1] + H * 0.62, 0], H * 0.1, H * 0.01, '#8a8478', { ...hd, caps: false });   // front horn
        m.limb([sn[0] - H * 0.08, sn[1] + H * 0.2, 0], [sn[0] - H * 0.05, sn[1] + H * 0.44, 0], H * 0.08, H * 0.01, '#8a8478', { ...hd, caps: false }); // back horn
        m.ell([sn[0] + H * 0.3, sn[1] - H * 0.08, 0], [H * 0.09, H * 0.06, H * 0.08], shade(s.color, -0.05), hd);                                    // pointed, hooked upper lip
      },
      tail: (m, b) => { const base = [-L * 0.46, b.by + H * 0.2, 0]; m.limb(base, [-L * 0.5, b.by - H * 0.2, 0], H * 0.03, H * 0.025, s.color, { part: P.TAIL, pivot: base }); },
    };
  },
  // Masai giraffe: long legs, a sloping back, and a neck twice the body's height, with jagged
  // chestnut patches on cream and two ossicones.
  giraffe: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    // jagged chestnut patches split by a network of cream lines, over the body, neck and head
    const patch = () => {
      const light = col(s.belly), d = col(s.dark), m2 = col(s.color);
      return (u, p) => {
        if (p.y < leg * 0.7) return light;
        const [gap, id] = cells(p, H * 0.3);
        if (gap < 0.16) return light;
        return tmp.copy(m2).lerp(d, id * 0.8);
      };
    };
    return {
      H, leg, hip: -0.14, shoulder: 0.2, chest: 1.1, haunch: 0.88, legR0: H * 0.16, legR1: H * 0.07, hoof: '#2a211a', neckR: H * 0.27,
      legColor: (u, p) => (p.y < leg * 0.62 ? col(s.belly) : patch()(u, p)), coat: patch, fine: true, neckSeg: 14, neckRings: 18,
      head: [L * 0.8, by + H * 2.7], headR: [H * 0.28, H * 0.18, H * 0.16], snout: H * 0.24, muzzle: shade(s.belly, -0.1),
      ears: 'point', ear: H * 0.2, earOut: 0.9, earBack: 0.1, earW: 0.35,
      antlers: (m, hp, hr, hd) => { for (const side of [1, -1]) { const b0 = [hp[0] - hr[0] * 0.3, hp[1] + hr[1] * 0.8, side * hr[2] * 0.35]; m.limb(b0, [b0[0] - H * 0.04, b0[1] + H * 0.22, b0[2]], H * 0.04, H * 0.035, s.color, hd); m.ell([b0[0] - H * 0.04, b0[1] + H * 0.24, b0[2]], [H * 0.05, H * 0.05, H * 0.05], '#2a2018', { ...hd, lo: true }); } },
      face: (m, hp, hr, hd) => m.limb([L * 0.34, by + H * 0.6, 0], [hp[0] - hr[0] * 0.8, hp[1] + hr[1] * 0.2, 0], H * 0.05, H * 0.035, s.dark, hd), // short mane
      tail: (m, b) => { const base = [-L * 0.46, b.by, 0]; m.limb(base, [-L * 0.52, b.by - H * 0.9, 0], H * 0.03, H * 0.025, s.color, { part: P.TAIL, pivot: base }); m.ell([-L * 0.52, b.by - H * 1.0, 0], [H * 0.06, H * 0.14, H * 0.06], '#1e1612', { part: P.TAIL, pivot: base, lo: true }); },
    };
  },
  // African elephant: pillar legs, a domed head, big flapping ears, tusks and a long trunk.
  elephant: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    const hide = base => u => tmp.copy(base(u)).multiplyScalar(0.94 + hash3(Math.round(u.x * 18), Math.round(u.y * 9), Math.round(u.z * 9)) * 0.1);
    return {
      H, leg, wide: 1.12, hip: 0.02, shoulder: 0.1, chest: 1.05, legR0: H * 0.18, legR1: H * 0.16, hoof: shade(s.color, 0.15), neckR: H * 0.4, coat: hide,
      head: [L * 0.5, by + H * 0.25], headR: [H * 0.38, H * 0.4, H * 0.34], snout: H * 0.1, nose: false,
      ears: 'none',
      face: (m, hp, hr, hd) => {
        // trunk: three tapering segments hanging and curling forward at the tip
        const t0 = [hp[0] + hr[0] * 0.75, hp[1] - hr[1] * 0.2, 0], t1 = [t0[0] + H * 0.14, t0[1] - H * 0.5, 0], t2 = [t1[0] + H * 0.02, t1[1] - H * 0.45, 0], t3 = [t2[0] + H * 0.1, t2[1] - H * 0.2, 0];
        m.limb(t0, t1, H * 0.15, H * 0.1, s.color, hd); m.limb(t1, t2, H * 0.1, H * 0.07, s.color, hd); m.limb(t2, t3, H * 0.07, H * 0.05, s.color, hd);
        for (const side of [1, -1]) {
          m.limb([hp[0] + hr[0] * 0.55, hp[1] - hr[1] * 0.45, side * hr[2] * 0.4], [hp[0] + hr[0] * 1.3, hp[1] - hr[1] * 1.05, side * hr[2] * 0.55], H * 0.05, H * 0.025, '#ece4d0', { ...hd, caps: false }); // tusks
          m.ell([hp[0] - hr[0] * 0.35, hp[1] - hr[1] * 0.05, side * hr[2] * 1.05], [hr[0] * 0.75, hr[1] * 1.05, H * 0.04], shade(s.color, -0.05), { ...hd, rot: [side * 0.25, side * -0.35, 0] }); // ears
        }
      },
      tail: (m, b) => { const base = [-L * 0.46, b.by + H * 0.2, 0]; m.limb(base, [-L * 0.5, b.by - H * 0.45, 0], H * 0.03, H * 0.025, s.color, { part: P.TAIL, pivot: base }); m.ell([-L * 0.5, b.by - H * 0.5, 0], [H * 0.04, H * 0.08, H * 0.04], s.dark, { part: P.TAIL, pivot: base, lo: true }); },
    };
  },
};

// A vole is a furry egg with a blunt nose: tiny feet, ears tucked in the fur, a short tail.
function vole(m, s) {
  const fur = grad(s.color, s.belly, -0.35, 0.5);
  m.ell([-0.4, 2.9, 0], [4.4, 2.8, 2.7], fur);
  const hd = { part: P.HEAD, pivot: [2.2, 3, 0] }, hp = [3.6, 3.1, 0];
  m.ell(hp, [2.3, 2.1, 2.1], fur, hd);
  m.ell([5.3, 2.8, 0], [0.9, 0.85, 0.95], shade(s.belly, 0.1), hd);
  m.ell([6.1, 2.95, 0], [0.28, 0.24, 0.28], '#2a1c18', { ...hd, lo: true });
  for (const side of [1, -1]) {
    m.ell([4.3, 3.7, side * 1.35], [0.34, 0.34, 0.2], '#120e0c', { ...hd, lo: true });
    m.ell([3.1, 4.7, side * 1.15], [0.55, 0.6, 0.28], shade(s.color, 0.12), { ...hd, rot: [side * -0.35, 0, 0] });
    for (const [x, part] of [[2.3, side > 0 ? P.LEG_FL : P.LEG_FR], [-2.5, side > 0 ? P.LEG_BL : P.LEG_BR]]) {
      const hip = [x, 1.4, side * 1.6];
      m.ell([x + 0.4, 0.35, side * 1.7], [0.75, 0.35, 0.45], shade(s.belly, 0.2), { part, pivot: hip, lo: true });
    }
  }
  m.limb([-4.5, 2.4, 0], [-7.8, 1.3, 0], 0.32, 0.14, shade(s.color, 0.15), { part: P.TAIL, pivot: [-4.4, 2.4, 0] });
}

// Squirrel, rabbit and bear have their own builders: their shapes (a crouch with a curling tail,
// long hind feet and leaf ears, a heavy rolling bulk) don't fit the generic quadruped.
function paw(m, pos, r, color, o) { m.ell(pos, [r[0], r[1], r[2]], color, { ...o, lo: true }); }

function squirrel(m, s) {
  const coat = u => u.y < -0.38 ? col(s.belly) : u.y < -0.16 ? col(shade(s.color, -0.35)) : col(s.color); // belly, dark flank line, back
  m.ell([0, 3.5, 0], [3.4, 2.5, 2.2], coat, { rot: [0, 0, 0.35] });
  m.ell([-1.8, 3.0, 0], [2.5, 2.4, 2.4], coat);
  m.ell([1.7, 4.2, 0], [1.9, 2.1, 1.9], coat, { rot: [0, 0, 0.5] });
  // head with a pale eye ring and tufted ears
  const neck = [2.4, 4.6, 0], hd = { part: P.HEAD, pivot: neck }, hp = [3.8, 5.8, 0];
  m.ell(hp, [1.85, 1.65, 1.55], grad(s.color, s.belly, -0.3, 0.3), hd);
  m.ell([5.1, 5.35, 0], [0.95, 0.8, 0.85], grad(s.color, s.belly, 0, 0.4), hd);
  m.ell([6.0, 5.5, 0], [0.26, 0.22, 0.26], '#1c1714', { ...hd, lo: true });
  for (const side of [1, -1]) {
    m.ell([4.45, 6.25, side * 1.18], [0.55, 0.5, 0.2], shade(s.belly, 0.25), { ...hd, lo: true });
    m.ell([4.55, 6.25, side * 1.26], [0.36, 0.36, 0.14], '#15110e', { ...hd, lo: true });
    m.ell([3.4, 7.3, side * 0.85], [0.45, 0.85, 0.28], s.color, { ...hd, rot: [side * -0.25, 0, 0.1] });
    m.limb([3.35, 7.9, side * 0.95], [3.2, 8.6, side * 1.0], 0.22, 0.05, '#2a1f18', { ...hd, caps: false });
  }
  // short front legs, big folded hind legs with long feet
  for (const side of [1, -1]) {
    const sh = [2.3, 3.4, side * 0.9], fl = { part: side > 0 ? P.LEG_FL : P.LEG_FR, pivot: sh };
    m.limb(sh, [2.9, 0.45, side * 0.95], 0.48, 0.36, shade(s.belly, -0.1), fl);
    paw(m, [3.2, 0.3, side * 0.95], [0.55, 0.3, 0.4], shade(s.color, -0.2), fl);
    const hip = [-1.6, 3.1, side * 1.5], hl = { part: side > 0 ? P.LEG_BL : P.LEG_BR, pivot: hip };
    m.ell([-1.4, 2.3, side * 1.55], [1.75, 1.55, 0.85], coat, { ...hl, rot: [0, 0, 0.3] });
    paw(m, [-0.3, 0.35, side * 1.5], [1.35, 0.35, 0.5], shade(s.color, -0.2), hl);
  }
  // the tail: a smooth plume sweeping up and curling forward over the back, pale at the fringe
  const tailPts = [[-3.7, 3.3, 1.2], [-5.0, 4.6, 1.6], [-5.7, 6.4, 1.95], [-5.6, 8.3, 2.1], [-4.8, 9.8, 2.05], [-3.5, 10.6, 1.85], [-2.2, 10.5, 1.5], [-1.4, 9.8, 1.1]];
  const plume = grad(shade(s.color, -0.1), shade(s.belly, -0.05), -0.4, 0.7);
  const to = { part: P.TAIL, pivot: [-3.6, 3.4, 0] };
  for (let k = 0; k < tailPts.length - 1; k++) for (let j = 0; j < 5; j++) {
    const a = tailPts[k], b = tailPts[k + 1], t = j / 5;
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, r = a[2] + (b[2] - a[2]) * t;
    m.ell([x, y, 0], [r, r, r * 0.72], plume, to);
  }
}

function rabbit(m, s) {
  const fur = grad(s.color, s.belly, -0.3, 0.45);
  // round, low body: a big rump behind a smaller chest
  m.ell([-0.6, 4.4, 0], [4.4, 3.6, 3.3], fur, { rot: [0, 0, 0.22] });
  m.ell([2.3, 5.0, 0], [2.4, 2.7, 2.5], fur);
  m.ell([-4.8, 4.9, 0], [1.1, 1.1, 1.1], '#f4f0e8', { part: P.TAIL, pivot: [-4.3, 4.6, 0] }); // cottontail
  const neck = [3.0, 6.0, 0], hd = { part: P.HEAD, pivot: neck }, hp = [4.4, 7.3, 0];
  m.ell(hp, [2.35, 2.05, 1.95], fur, hd);
  m.ell([5.9, 6.8, 0], [1.2, 1.0, 1.15], grad(s.belly, shade(s.belly, 0.25), 0, 0.5), hd);
  m.ell([6.95, 7.05, 0], [0.3, 0.25, 0.32], '#b98378', { ...hd, lo: true });
  for (const side of [1, -1]) {
    m.ell([5.05, 7.75, side * 1.5], [0.55, 0.58, 0.3], '#15110e', { ...hd, lo: true });
    m.ell([5.25, 7.95, side * 1.68], [0.14, 0.14, 0.08], '#ffffff', { ...hd, lo: true });
    // leaf-shaped ears laid back, darker at the tips
    const ear = u => u.y > 0.72 ? col(shade(s.color, -0.3)) : col(shade(s.color, 0.05));
    m.ell([3.4, 10.0, side * 0.95], [0.85, 2.45, 0.36], ear, { ...hd, rot: [side * -0.18, 0, 0.55] });
  }
  for (const side of [1, -1]) {
    const sh = [2.8, 3.8, side * 1.25], fl = { part: side > 0 ? P.LEG_FL : P.LEG_FR, pivot: sh };
    m.limb(sh, [3.4, 0.45, side * 1.3], 0.78, 0.55, fur, fl);
    paw(m, [3.7, 0.35, side * 1.3], [0.7, 0.35, 0.5], shade(s.belly, 0.1), fl);
    const hip = [-2.2, 4.2, side * 1.6], hl = { part: side > 0 ? P.LEG_BL : P.LEG_BR, pivot: hip };
    m.ell([-2.4, 2.85, side * 1.85], [2.6, 2.4, 1.5], fur, hl);
    paw(m, [-1.0, 0.5, side * 1.9], [2.3, 0.55, 0.75], shade(s.belly, 0.05), hl);
  }
}

function bear(m, s) {
  // lift the near-black coat a little so the form reads: glossy on top, deep underneath
  const coat = grad('#3b2f28', '#120e0c', -0.1, 0.65);
  const L = s.len, H = s.h, by = s.leg + H * 0.5;
  m.ell([0, by + 1, 0], [L * 0.4, H * 0.5, H * 0.45], coat);
  m.ell([L * 0.2, by + 1.2, 0], [L * 0.24, H * 0.52, H * 0.47], coat);
  m.ell([-L * 0.22, by + 2.4, 0], [L * 0.25, H * 0.52, H * 0.48], coat); // black bears stand rump-high
  const neck = [L * 0.3, by + 1.5, 0], hd = { part: P.HEAD, pivot: neck }, hp = [L * 0.51, by - 0.4, 0];
  m.limb(neck, [hp[0] - 3, hp[1], 0], H * 0.33, H * 0.28, coat, hd);
  m.ell(hp, [H * 0.29, H * 0.26, H * 0.26], coat, hd);
  m.ell([hp[0] + H * 0.26, hp[1] - H * 0.08, 0], [H * 0.2, H * 0.13, H * 0.13], s.muzzle, hd);
  m.ell([hp[0] + H * 0.44, hp[1] - H * 0.05, 0], [H * 0.055, H * 0.05, H * 0.07], '#0c0a09', { ...hd, lo: true });
  for (const side of [1, -1]) {
    m.ell([hp[0] - H * 0.06, hp[1] + H * 0.24, side * H * 0.17], [H * 0.09, H * 0.1, H * 0.05], '#2e2520', hd);
    m.ell([hp[0] + H * 0.1, hp[1] + H * 0.07, side * H * 0.19], [H * 0.035, H * 0.035, H * 0.02], '#d8c8a8', { ...hd, lo: true });
  }
  for (const [x, side, part, top] of [[L * 0.24, 1, P.LEG_FL, by - 2], [L * 0.24, -1, P.LEG_FR, by - 2], [-L * 0.24, 1, P.LEG_BL, by], [-L * 0.24, -1, P.LEG_BR, by]]) {
    const z = side * H * 0.25, hip = [x, top, z], o = { part, pivot: hip };
    if (part >= P.LEG_BL) m.ell([x - 1, by - 2, z * 1.05], [H * 0.3, H * 0.4, H * 0.2], coat, o); // heavy thigh
    m.limb(hip, [x + 0.6, 3, z], H * 0.25, H * 0.17, coat, o);
    paw(m, [x + 1.6, 1.6, z], [H * 0.21, H * 0.09, H * 0.17], '#0e0b09', o);
  }
  m.ell([-L * 0.46, by + 3.5, 0], [1.3, 1.2, 1.2], coat, { part: P.TAIL, pivot: [-L * 0.44, by + 3, 0], lo: true });
}

// ---------------------------------------------------------------- birds
const BIRDS = {
  songbird: s => ({ legH: 0.2, tilt: 0.35, span: 0.62, chord: 0.24, beak: 0.16, beakColor: '#3a3028', legColor: '#6a5a4a', tail: s.cocked ? -1.1 : 0.25 }),
  hummer: s => ({ legH: 0.1, tilt: 0.2, span: 0.7, chord: 0.2, beak: 0.55, beakColor: '#1e1a18', legColor: '#1e1a18', tail: 0.2, beakR: 0.03 }),
  woodpecker: s => ({ legH: 0.14, tilt: 0.75, span: 0.62, chord: 0.26, beak: 0.26, beakColor: '#2a2622', legColor: '#4a4440', tail: 0.5 }),
  heron: s => ({ legH: 1.05, tilt: 0.3, span: 0.9, chord: 0.3, beak: 0.42, beakColor: '#e0b030', legColor: '#b8a060', tail: 0.2, neck: true, head: 0.13 }),
  duck: s => ({ legH: 0.08, tilt: 0.05, span: 0.6, chord: 0.24, beak: 0.2, beakColor: '#d8a030', legColor: '#e08a30', tail: -0.4, duck: true }),
  raptor: s => ({ legH: 0.16, tilt: 0.45, span: 0.95, chord: 0.3, beak: 0.14, beakColor: s.bill || '#e0b030', legColor: '#e0b030', tail: 0.35, hook: true }),
  vulture: s => ({ legH: 0.2, tilt: 0.3, span: 0.95, chord: 0.34, beak: 0.13, beakColor: s.bill || '#2a2a2a', legColor: '#5a5650', tail: 0.2, hook: true, head: 0.12, vulture: true }),
  secretary: s => ({ legH: 1.05, tilt: 0.18, span: 1.0, chord: 0.3, beak: 0.09, beakColor: '#8a8a88', legColor: '#e2c49a', tail: 0.1, hook: true, neck: true, head: 0.13, secretary: true }),
  crane: s => ({ legH: 0.95, tilt: 0.22, span: 1.0, chord: 0.32, beak: 0.15, beakColor: '#2a2a2a', legColor: '#3a3a3a', tail: 0.2, neck: true, head: 0.13 }),
  hornbill: s => ({ legH: 0.44, tilt: 0.22, span: 0.8, chord: 0.3, beak: 0, beakColor: '#1c1a18', legColor: '#2a2624', tail: 0.3, head: 0.16, hornbill: true }),
  toucan: s => ({ legH: 0.18, tilt: 0.45, span: 0.55, chord: 0.26, beak: 0, beakColor: s.bill, legColor: '#4a6aa0', tail: 0.4, head: 0.2, toucan: true }),
  macaw: s => ({ legH: 0.14, tilt: 0.55, span: 0.95, chord: 0.28, beak: 0.13, beakColor: '#e8e2d4', legColor: '#5a5048', tail: 0.45, hook: true, head: 0.21, macaw: true }),
  ostrich: s => ({ legH: 1.15, tilt: 0.05, span: 0.45, chord: 0.3, beak: 0.1, beakColor: '#c8a088', legColor: '#d0a898', tail: -0.6, neck: true, tall: true, head: 0.09, fluffy: true }),
  owl: s => ({ legH: 0.12, tilt: 1.3, span: 0.85, chord: 0.3, beak: 0.08, beakColor: '#3a3028', legColor: '#8a7a5a', tail: 1.2, owl: true, head: 0.22 }),
};

const WING_KIND = { vulture: 'fingered', secretary: 'fingered', crane: 'fingered', hornbill: 'fingered', ostrich: 'round', songbird: 'round', woodpecker: 'round', owl: 'round', toucan: 'round', hummer: 'pointed', duck: 'pointed', macaw: 'pointed', heron: 'fingered', raptor: 'fingered' };

function bird(m, s) {
  const S = s.size, o = BIRDS[s.kind](s);
  const by = o.legH * S + S * 0.26;
  const body = grad(s.color, s.breast || s.color, -0.15, 0.4);
  m.ell([0, by, 0], [S * 0.4, S * (o.duck ? 0.24 : 0.25), S * (o.duck ? 0.27 : 0.23)], body, { rot: [0, 0, o.tilt] });
  if (s.band) m.ell([S * 0.12, by - S * 0.02, 0], [S * 0.12, S * 0.22, S * 0.235], s.band, { rot: [0, 0, o.tilt] });
  if (s.vee) m.ell([S * 0.22, by + S * 0.02, 0], [S * 0.06, S * 0.16, S * 0.2], '#1e1a18', { rot: [0, 0, o.tilt + 0.3] });
  if (s.spots) for (let k = 0; k < 7; k++) m.ell([S * (0.1 + (k % 3) * 0.06), by - S * (0.04 + (k % 4) * 0.035), (k % 2 ? 1 : -1) * S * (0.14 + (k % 3) * 0.03)], [S * 0.03, S * 0.03, S * 0.03], '#4a3a28', { lo: true });

  // head (with a long S-neck for the heron)
  const hr = S * (o.head ?? 0.19);
  let hp;
  if (o.owl) hp = [S * 0.1, by + S * 0.33, 0];
  else if (o.tall) hp = [S * 0.45, by + S * 1.0, 0];
  else if (o.vulture) hp = [S * 0.5, by + S * 0.1, 0];
  else if (o.neck) hp = [S * 0.5, by + S * 0.6, 0];
  else if (o.duck) hp = [S * 0.38, by + S * 0.28, 0];
  else hp = [S * 0.34 + Math.sin(o.tilt) * S * 0.02, by + S * 0.2 + Math.sin(o.tilt) * S * 0.12, 0];
  const neckBase = [S * 0.25, by + S * 0.1, 0], hd = { part: P.HEAD, pivot: neckBase };
  if (o.vulture) {
    // white-backed vulture: a long, bare grey neck hanging forward out of a thick white ruff
    m.limb([S * 0.26, by + S * 0.12, 0], [S * 0.4, by + S * 0.18, 0], S * 0.05, S * 0.04, s.head, hd);
    m.limb([S * 0.4, by + S * 0.18, 0], [hp[0] - hr * 0.5, hp[1], 0], S * 0.04, S * 0.035, s.head, hd);
    m.ell([S * 0.24, by + S * 0.1, 0], [S * 0.13, S * 0.12, S * 0.17], '#f2eee6', hd);
  }
  if (o.tall) {
    // ostrich: a bare pinkish neck rising straight up out of the black plumes
    m.limb([S * 0.3, by + S * 0.08, 0], [S * 0.4, by + S * 0.5, 0], S * 0.07, S * 0.05, s.head, hd);
    m.limb([S * 0.4, by + S * 0.5, 0], [hp[0] - hr * 0.5, hp[1] - hr * 0.3, 0], S * 0.05, S * 0.04, s.head, hd);
  } else if (o.neck) {
    m.limb([S * 0.3, by + S * 0.08, 0], [S * 0.42, by + S * 0.32, 0], S * 0.09, S * 0.07, s.breast, hd);
    m.limb([S * 0.42, by + S * 0.32, 0], [hp[0] - hr * 0.5, hp[1] - hr * 0.2, 0], S * 0.07, S * 0.06, s.breast, hd);
  }
  if (o.duck) m.limb([S * 0.3, by + S * 0.08, 0], hp, S * 0.12, S * 0.11, s.head, hd);
  const pecker = s.kind === 'woodpecker';
  m.ell(hp, [hr * 1.05, hr, hr * (o.owl ? 1.1 : 0.95)], pecker ? s.color : s.head, hd);
  if (pecker) {
    // pileated: a flaming red crest, and a white stripe from the bill down the neck
    m.limb([hp[0] + hr * 0.1, hp[1] + hr * 0.6, 0], [hp[0] - hr * 1.1, hp[1] + hr * 1.05, 0], hr * 0.55, hr * 0.12, s.head, hd);
    m.ell([hp[0] + hr * 0.2, hp[1] + hr * 0.75, 0], [hr * 0.6, hr * 0.35, hr * 0.5], s.head, hd);
    for (const side of [1, -1]) m.ell([hp[0] + hr * 0.1, hp[1] - hr * 0.25, side * hr * 0.72], [hr * 0.85, hr * 0.14, hr * 0.28], '#f2f0ea', hd);
  }
  if (o.owl) {
    // great horned: feather "horns", a tawny facial disc and yellow eyes
    for (const side of [1, -1]) m.limb([hp[0] - hr * 0.1, hp[1] + hr * 0.75, side * hr * 0.45], [hp[0] - hr * 0.35, hp[1] + hr * 1.45, side * hr * 0.62], hr * 0.22, hr * 0.04, s.color, hd);
    for (const side of [1, -1]) m.ell([hp[0] + hr * 0.62, hp[1], side * hr * 0.42], [hr * 0.25, hr * 0.52, hr * 0.45], s.breast, hd);
    eyes(m, hp, hr * 0.85, hr * 0.08, hr * 0.4, hr * 0.17, P.HEAD, neckBase, '#e8c030');
    eyes(m, hp, hr * 0.97, hr * 0.08, hr * 0.4, hr * 0.09, P.HEAD, neckBase);
  } else if (s.eye) {
    // coloured eyes (the hoatzin's red eye in a patch of bare blue skin)
    if (s.face) for (const side of [1, -1]) m.ell([hp[0] + hr * 0.4, hp[1] + hr * 0.2, side * hr * 0.72], [hr * 0.38, hr * 0.3, hr * 0.2], s.face, hd);
    eyes(m, hp, hr * 0.47, hr * 0.24, hr * 0.84, Math.max(0.55, hr * 0.19), P.HEAD, neckBase, s.eye);
    eyes(m, hp, hr * 0.52, hr * 0.24, hr * 0.9, Math.max(0.3, hr * 0.09), P.HEAD, neckBase);
  } else {
    // bare facial skin (secretarybird's orange, crowned crane's white cheek)
    if (s.face) for (const side of [1, -1]) m.ell([hp[0] + hr * 0.35, hp[1] + hr * 0.05, side * hr * 0.7], [hr * 0.5, hr * 0.4, hr * 0.3], s.face, hd);
    eyes(m, hp, hr * 0.45, hr * 0.25, hr * 0.78, Math.max(0.45, hr * 0.17), P.HEAD, neckBase);
  }
  if (s.quills) for (let k = 0; k < 6; k++) { // secretarybird: long black quills hanging off the back of the head
    const z = (k % 2 ? 1 : -1) * hr * 0.15 * (1 + (k >> 1));
    m.limb([hp[0] - hr * 0.5, hp[1] + hr * 0.3, z * 0.5], [hp[0] - hr * (2 + (k % 3) * 0.4), hp[1] + hr * (0.4 - (k % 3) * 0.5), z], hr * 0.1, hr * 0.05, '#141414', { ...hd, caps: false });
  }
  if (s.crown) for (let k = 0; k < 9; k++) { // crowned crane: a fan of golden bristles
    const a = -0.9 + k * 0.22;
    m.limb([hp[0] - hr * 0.1, hp[1] + hr * 0.7, 0], [hp[0] - hr * 0.1 - Math.sin(a) * hr * 1.4, hp[1] + hr * 0.7 + Math.cos(a) * hr * 1.3, (k % 2 ? 1 : -1) * hr * 0.3], hr * 0.08, hr * 0.03, s.crown, { ...hd, caps: false });
  }
  if (s.wattle && !o.toucan && !o.hornbill) m.ell([hp[0] + hr * 0.45, hp[1] - hr * 0.95, 0], [hr * 0.22, hr * 0.38, hr * 0.14], s.wattle, hd); // crowned crane's red throat wattle
  if (s.velvet) m.ell([hp[0] + hr * 0.55, hp[1] + hr * 0.45, 0], [hr * 0.45, hr * 0.35, hr * 0.5], s.velvet, hd); // black velvet forehead
  if (o.fluffy) m.ell([-S * 0.1, by + S * 0.02, 0], [S * 0.36, S * 0.28, S * 0.3], s.color); // plumes bulk out the body
  if (s.crest === 'double') {
    // harpy: a split crest of grey plumes that fans up when it's alert
    for (const side of [1, -1]) m.limb([hp[0] - hr * 0.3, hp[1] + hr * 0.7, side * hr * 0.2], [hp[0] - hr * 0.9, hp[1] + hr * 1.55, side * hr * 0.55], hr * 0.28, hr * 0.06, shade(s.head, -0.35), hd);
  } else if (s.crest === 'spiky') {
    // hoatzin: a ragged fan of stiff rufous spikes
    for (let k = 0; k < 7; k++) {
      const a = -0.25 + k * 0.28, z = (k % 2 ? 1 : -1) * hr * 0.08 * (k % 3);
      m.limb([hp[0] - hr * 0.1, hp[1] + hr * 0.75, z], [hp[0] - hr * 0.1 - Math.sin(a) * hr * 1.25, hp[1] + hr * 0.75 + Math.cos(a) * hr * 1.1, z * 2], hr * 0.1, hr * 0.03, s.crestColor || s.head, { ...hd, caps: false });
    }
  } else if (s.crest) m.limb([hp[0] - hr * 0.2, hp[1] + hr * 0.7, 0], [hp[0] - hr * 1.2, hp[1] + hr * 1.3, 0], hr * 0.35, hr * 0.05, s.head, hd);
  if (s.fancy) m.limb([hp[0] - hr * 0.3, hp[1] + hr * 0.5, 0], [hp[0] - hr * 1.5, hp[1] + hr * 0.1, 0], hr * 0.45, hr * 0.12, s.head, hd);
  const bb = [hp[0] + hr * 0.85, hp[1] - hr * (o.duck ? 0.25 : 0.1), 0], bl = S * o.beak;
  if (o.toucan) {
    // the toco's huge orange bill, with a black tip and a white throat bib beneath
    const bill = u => u.x > 0.72 ? col('#141210') : u.x > 0.2 && u.y > 0.55 ? col(shade(s.bill, 0.2)) : col(s.bill);
    m.ell([bb[0] + S * 0.25, bb[1] - S * 0.02, 0], [S * 0.3, hr * 0.6, hr * 0.42], bill, { ...hd, rot: [0, 0, -0.12] });
    m.ell([hp[0] + hr * 0.3, hp[1] - hr * 0.8, 0], [hr * 0.7, hr * 0.7, hr * 0.8], s.breast, hd);
    for (const side of [1, -1]) m.ell([hp[0] + hr * 0.45, hp[1] + hr * 0.25, side * hr * 0.72], [hr * 0.3, hr * 0.3, hr * 0.12], s.wattle || '#3a8ae0', { ...hd, lo: true });
    if (s.wattle) m.ell([hp[0] + hr * 0.4, hp[1] - hr * 0.95, 0], [hr * 0.55, hr * 0.5, hr * 0.5], s.wattle, hd); // ground hornbill's red throat
  } else if (o.hornbill) {
    // southern ground hornbill: a heavy, down-curved black bill with a low casque on top, and a
    // big bare red throat pouch below it
    const t0 = bb, t1 = [bb[0] + S * 0.17, bb[1] - S * 0.04, 0], t2 = [bb[0] + S * 0.3, bb[1] - S * 0.14, 0];
    m.limb(t0, t1, S * 0.06, S * 0.042, o.beakColor, hd); m.limb(t1, t2, S * 0.042, S * 0.008, o.beakColor, { ...hd, caps: false });
    m.limb([bb[0], bb[1] - S * 0.035, 0], [bb[0] + S * 0.2, bb[1] - S * 0.1, 0], S * 0.035, S * 0.01, shade(o.beakColor, 0.08), { ...hd, caps: false }); // lower mandible
    m.ell([bb[0] + S * 0.05, bb[1] + S * 0.045, 0], [S * 0.085, S * 0.03, S * 0.028], o.beakColor, hd); // casque
    m.ell([hp[0] + hr * 0.35, hp[1] - hr * 1.05, 0], [hr * 0.75, hr * 0.7, hr * 0.62], s.wattle, hd);    // throat pouch
    m.ell([hp[0] + hr * 0.1, hp[1] - hr * 0.55, 0], [hr * 0.6, hr * 0.45, hr * 0.8], s.wattle, hd);
  } else if (o.duck) m.ell([bb[0] + bl * 0.45, bb[1], 0], [bl * 0.6, hr * 0.18, hr * 0.42], o.beakColor, hd);
  else {
    if (o.macaw) {
      // bare white face and a deep, hooked two-tone bill
      for (const side of [1, -1]) m.ell([hp[0] + hr * 0.45, hp[1] - hr * 0.05, side * hr * 0.7], [hr * 0.5, hr * 0.45, hr * 0.2], '#f4f0ea', hd);
      m.ell([bb[0] + S * 0.03, bb[1] - S * 0.03, 0], [S * 0.07, S * 0.08, S * 0.06], '#2a2420', { ...hd, lo: true });
    }
    m.limb(bb, [bb[0] + bl, bb[1] - (o.hook ? bl * 0.35 : bl * 0.05), 0], S * (o.beakR ?? 0.06), S * 0.01, o.beakColor, { ...hd, caps: false });
    if (o.hook) m.ell(bb, [S * 0.06, S * 0.06, S * 0.06], o.beakColor, { ...hd, lo: true });
  }

  // tail
  const tb = [-S * 0.3, by - S * 0.02, 0];
  if (o.secretary) for (const z of [-0.025, 0.025]) m.limb([-S * 0.4, by - S * 0.06, S * z], [-S * 1.05, by - S * 0.32, S * z * 2], S * 0.03, S * 0.012, u => u.y > 0.8 ? col('#1a1a1a') : col(s.color), { part: P.TAIL, pivot: tb, caps: false }); // the long central streamers
  if (o.macaw) m.ell([-S * 0.8, by - S * 0.3, 0], [S * 0.6, S * 0.03, S * 0.09], u => u.x < -0.5 ? col(s.wingtip) : col(s.color), { rot: [0, 0, 0.45], part: P.TAIL, pivot: tb });
  else if (s.tailTip) m.ell([-S * 0.62, by - S * 0.12, 0], [S * 0.42, S * 0.04, S * 0.16], u => u.x < -0.6 ? col(s.tailTip) : col(s.tail || s.color), { rot: [0, 0, 0.35], part: P.TAIL, pivot: tb });
  else if (s.tailBars) m.ell([-S * 0.52, by - S * 0.08 + Math.sin(-o.tail * 0.3) * S * 0.2, 0], [S * 0.3, S * 0.035, S * 0.13], u => Math.sin(u.x * 11) > 0.4 ? col(s.tailBars) : col(s.tail || s.color), { rot: [0, 0, o.tail * 0.6 + 0.15], part: P.TAIL, pivot: tb });
  else m.ell([-S * 0.52, by - S * 0.08 + Math.sin(-o.tail * 0.3) * S * 0.2, 0], [S * 0.3, S * 0.035, S * 0.13], s.tail || s.color, { rot: [0, 0, o.tail * 0.6 + 0.15], part: P.TAIL, pivot: tb });

  // legs
  if (!o.duck) for (const side of [1, -1]) {
    const hip = [S * 0.02, by - S * 0.12, side * S * 0.07];
    const lp = { part: side > 0 ? P.LEG_FL : P.LEG_FR, pivot: hip }, thick = s.bigFeet ? 1.9 : o.tall ? 1.8 : o.hornbill ? 1.5 : 1;
    m.limb(hip, [S * 0.04, S * 0.02, side * S * 0.08], S * (o.legH > 0.5 ? 0.028 : 0.035) * thick, S * 0.022 * thick, o.legColor, lp);
    if (o.secretary) m.limb(hip, [S * 0.03, by - S * 0.62, side * S * 0.08], S * 0.075, S * 0.05, '#1a1a1a', lp); // feathered black thighs
    if (s.bigFeet) for (const t of [-1, 0, 1]) m.limb([S * 0.04, S * 0.02, side * S * 0.08], [S * (0.04 + 0.07 * (t === 0 ? 1 : 0.6)), S * 0.005, side * S * 0.08 + t * S * 0.04], S * 0.02, S * 0.01, '#2a2420', { ...lp, caps: false });
  }

  // wings
  // coverts in the body colour, darker flight feathers along the trailing edge and out to the tip
  const covert = col(o.owl ? s.color : shade(s.color, 0.1)), flight = col(s.flight || shade(s.color, o.owl ? -0.15 : -0.4));
  const spec = s.speculum ? col(s.speculum) : null;
  const wc = u => {
    const a = Math.abs(u.z), x = u.x, back = x < -0.08 + a * 0.12; // the flight-feather zone
    if (s.wing) return a > 0.62 || x < -0.12 ? col(s.wingtip) : x < 0.14 ? col(s.wing) : col(s.color); // scarlet macaw: red, yellow band, blue
    if (spec && back && a > 0.18 && a < 0.5) return spec;                                        // a duck's speculum
    if (back || a > 0.72) return flight;
    return x > 0.36 && a < 0.5 ? col(shade(s.color, 0.2)) : covert;                                // pale leading edge
  };
  const shape = s.wingShape || WING_KIND[s.kind] || 'round';
  for (const side of [1, -1]) {
    m.wing(side, [S * 0.1, by + S * 0.1, side * S * 0.14], S * o.span, S * o.chord * (shape === 'fingered' ? 1.15 : 1), S * 0.018, wc, [-S * 0.02, by, 0], shape, S * (o.duck ? 0.285 : 0.245), o.tilt * 0.8);
  }
}

// Bat: a furry body and big ears, with membrane wings stretched over long finger bones
// and a scalloped trailing edge between the fingertips.
const BAT_FINGERS = [[0.2, 1.0], [-0.12, 0.96], [-0.38, 0.72], [-0.48, 0.38]], BAT_WRIST = [0.27, 0.46];
function batWing(side) {
  return flat(sh => {
    const Y = y => y * side;
    sh.moveTo(0.36, 0); sh.lineTo(BAT_WRIST[0], Y(BAT_WRIST[1])); sh.lineTo(0.2, Y(1.0));
    sh.quadraticCurveTo(0.0, Y(0.78), -0.12, Y(0.96));
    sh.quadraticCurveTo(-0.16, Y(0.6), -0.38, Y(0.72));
    sh.quadraticCurveTo(-0.28, Y(0.42), -0.48, Y(0.38));
    sh.quadraticCurveTo(-0.3, Y(0.2), -0.46, Y(0.02));
    sh.lineTo(0.36, 0);
  }, 'xz');
}
function bat(m, s) {
  const S = s.size, by = S * 0.32;
  const fur = grad(s.color, shade(s.color, 0.28), -0.2, 0.5), dark = shade(s.color, -0.35);
  m.ell([0, by, 0], [S * 0.24, S * 0.15, S * 0.14], fur);
  m.ell([S * 0.12, by + S * 0.02, 0], [S * 0.13, S * 0.14, S * 0.14], fur);
  const hp = [S * 0.28, by + S * 0.05, 0], neck = [S * 0.15, by, 0], hd = { part: P.HEAD, pivot: neck };
  m.ell(hp, [S * 0.11, S * 0.1, S * 0.1], fur, hd);
  m.ell([hp[0] + S * 0.08, hp[1] - S * 0.02, 0], [S * 0.05, S * 0.04, S * 0.045], dark, hd);
  for (const side of [1, -1]) {
    m.limb([hp[0] - S * 0.02, hp[1] + S * 0.07, side * S * 0.05], [hp[0] - S * 0.04, hp[1] + S * 0.22, side * S * 0.1], S * 0.045, S * 0.008, dark, hd);
  }
  eyes(m, hp, S * 0.07, S * 0.03, S * 0.07, S * 0.02, P.HEAD, neck);
  // tail membrane between the legs
  m.add(flat(sh => { sh.moveTo(0, -0.5); sh.lineTo(0, 0.5); sh.quadraticCurveTo(-0.9, 0.2, -1, 0); sh.quadraticCurveTo(-0.9, -0.2, 0, -0.5); }, 'xz'),
    place([-S * 0.18, by - S * 0.02, 0], [0, 0, 0.15], [S * 0.28, S * 0.012, S * 0.28]), shade(s.color, -0.15), { part: P.TAIL, pivot: [-S * 0.18, by, 0] });
  // wings: finger bones painted darker across the membrane
  const mem = col(shade(s.color, -0.05)), bone = col(dark);
  const paint = u => {
    const x = u.x, y = Math.abs(u.z);
    for (const [fx, fy] of BAT_FINGERS) {
      const dx = fx - BAT_WRIST[0], dy = fy - BAT_WRIST[1], t = Math.max(0, Math.min(1, ((x - BAT_WRIST[0]) * dx + (y - BAT_WRIST[1]) * dy) / (dx * dx + dy * dy)));
      if (Math.hypot(x - (BAT_WRIST[0] + dx * t), y - (BAT_WRIST[1] + dy * t)) < 0.035) return bone;
    }
    if (y < BAT_WRIST[1] && Math.abs(x - (0.36 + (BAT_WRIST[0] - 0.36) * y / BAT_WRIST[1])) < 0.04) return bone; // forearm
    return mem;
  };
  for (const side of [1, -1]) {
    const pivot = [S * 0.1, by + S * 0.06, side * S * 0.1];
    const ext = place(pivot, [0, 0, 0], [S * 0.62, S * 0.012, S * 0.95]);
    const folded = place([pivot[0] - S * 0.12, pivot[1] - S * 0.02, pivot[2]], [0, 0, 0], [S * 0.45, S * 0.012, S * 0.16]);
    m.add(batWing(side), folded, paint, { part: side > 0 ? P.WING_L : P.WING_R, pivot, ext });
  }
}

// ---------------------------------------------------------------- herps and fish
// Frogs sit up on folded hind legs: thigh back, shin forward, long foot flat on the ground.
function frog(m, s) {
  const S = s.size, plain = grad(s.color, shade(s.color, 0.4), -0.15, 0.35);
  const skin = s.spotted ? (u => hash3(Math.round(u.x * 5), Math.round(u.y * 5), Math.round(u.z * 5)) > 0.7 ? col(s.spotted) : plain(u)) : plain;
  const leg = s.dark && s.dark !== '#2a4a1e' ? s.dark : shade(s.color, -0.1);
  m.ell([-S * 0.02, S * 0.3, 0], [S * 0.38, S * 0.24, S * 0.3], skin, { rot: [0, 0, 0.35] });
  m.ell([S * 0.28, S * 0.4, 0], [S * 0.22, S * 0.16, S * 0.26], skin, { rot: [0, 0, 0.15] });
  for (const side of [1, -1]) {
    // eyes on top, gold with a dark pupil
    m.ell([S * 0.33, S * 0.53, side * S * 0.14], [S * 0.075, S * 0.075, S * 0.075], skin, { lo: true });
    m.ell([S * 0.38, S * 0.55, side * S * 0.16], [S * 0.045, S * 0.05, S * 0.045], '#c8a040', { lo: true });
    m.ell([S * 0.405, S * 0.555, side * S * 0.165], [S * 0.022, S * 0.035, S * 0.022], '#141210', { lo: true });
    if (s.dark === '#2a4a1e') m.ell([S * 0.3, S * 0.45, side * S * 0.2], [S * 0.2, S * 0.03, S * 0.05], s.dark, { lo: true, rot: [0, 0, -0.15] }); // tree frog's eye stripe
    const hip = [-S * 0.15, S * 0.24, side * S * 0.2], hl = { part: side > 0 ? P.LEG_BL : P.LEG_BR, pivot: hip };
    m.ell([-S * 0.16, S * 0.2, side * S * 0.3], [S * 0.22, S * 0.1, S * 0.09], leg, { ...hl, rot: [0, side * 0.3, 0.45] });
    m.ell([-S * 0.02, S * 0.1, side * S * 0.36], [S * 0.18, S * 0.06, S * 0.07], leg, { ...hl, rot: [0, side * -0.25, -0.35] });
    m.ell([S * 0.02, S * 0.025, side * S * 0.38], [S * 0.2, S * 0.025, S * 0.07], leg, { ...hl, lo: true });
    const sh = [S * 0.25, S * 0.24, side * S * 0.18], fl = { part: side > 0 ? P.LEG_FL : P.LEG_FR, pivot: sh };
    m.limb(sh, [S * 0.34, S * 0.03, side * S * 0.24], S * 0.05, S * 0.04, leg, fl);
    m.ell([S * 0.38, S * 0.02, side * S * 0.25], [S * 0.06, S * 0.02, S * 0.05], leg, { ...fl, lo: true });
  }
}

function newt(m, s) {
  const S = s.size, skin = grad(s.color, s.belly, -0.1, 0.3);
  m.ell([0, S * 0.12, 0], [S * 0.3, S * 0.1, S * 0.12], skin);
  m.ell([S * 0.35, S * 0.13, 0], [S * 0.13, S * 0.08, S * 0.1], skin, { part: P.HEAD, pivot: [S * 0.25, S * 0.12, 0] });
  eyes(m, [S * 0.35, S * 0.13, 0], S * 0.06, S * 0.05, S * 0.07, S * 0.025, P.HEAD, [S * 0.25, S * 0.12, 0]);
  m.limb([-S * 0.25, S * 0.12, 0], [-S * 0.85, S * 0.08, 0], S * 0.09, S * 0.02, skin, { part: P.TAIL, pivot: [-S * 0.25, S * 0.12, 0] });
  const legs = [[S * 0.18, 1, P.LEG_FL], [S * 0.18, -1, P.LEG_FR], [-S * 0.18, 1, P.LEG_BL], [-S * 0.18, -1, P.LEG_BR]];
  for (const [x, side, part] of legs) { const hip = [x, S * 0.1, side * S * 0.1]; m.limb(hip, [x + S * 0.05, S * 0.02, side * S * 0.24], S * 0.035, S * 0.03, skin, { part, pivot: hip }); }
}

function turtle(m, s) {
  const S = s.size;
  const shell = (u, p) => tmp.copy(col(s.color)).lerp(col(s.dark), hash3(Math.round(p.x / (S * 0.22)), Math.round(p.z / (S * 0.22)), 1) * 0.7);
  if (s.dome) {
    // leopard tortoise: a tall dome of pale scutes with dark flecks
    // leopard tortoise: a high dome of plates, each pale gold with a dark rim and dark flecks
    // radiating from its middle
    const gold = col(s.color), dk = col(s.dark);
    const plates = (u, p) => {
      const [gap, id] = cells(p, S * 0.26);
      if (gap < 0.12) return tmp.copy(dk).lerp(gold, 0.2);                                     // seams between plates
      if (gap < 0.3 && hash3(Math.round(p.x * 3), Math.round(p.y * 3), Math.round(p.z * 3)) > 0.55) return tmp.copy(dk).lerp(gold, 0.4); // flecks near the edges
      return tmp.copy(gold).multiplyScalar(0.85 + 0.15 * id + 0.15 * smooth(-0.2, 1, u.y));
    };
    m.add(SPH_XL, place([0, S * 0.3, 0], [0, 0, 0], [S * 0.46, S * 0.36, S * 0.38]), plates); // fine mesh, so the plates show
    m.ell([0, S * 0.14, 0], [S * 0.47, S * 0.05, S * 0.39], shade(s.color, -0.3)); // the rim of the shell
  } else m.ell([0, S * 0.24, 0], [S * 0.46, S * 0.24, S * 0.38], shell);
  m.ell([0, S * 0.13, 0], [S * 0.47, S * 0.05, S * 0.39], shade(s.dark, -0.2));
  const skin = shade(s.dark, 0.1);
  m.ell([S * 0.52, S * 0.2, 0], [S * 0.16, S * 0.12, S * 0.12], skin, { part: P.HEAD, pivot: [S * 0.4, S * 0.18, 0] });
  eyes(m, [S * 0.52, S * 0.2, 0], S * 0.08, S * 0.04, S * 0.09, S * 0.025, P.HEAD, [S * 0.4, S * 0.18, 0]);
  if (s.spots) for (const [x, y, z] of [[0.58, 0.28, 0], [0.5, 0.29, 0.06], [0.5, 0.29, -0.06], [0.6, 0.22, 0.08], [0.6, 0.22, -0.08]])
    m.ell([S * x, S * y, S * z], [S * 0.035, S * 0.02, S * 0.03], s.spots, { part: P.HEAD, pivot: [S * 0.4, S * 0.18, 0], lo: true }); // yellow-spotted river turtle
  const legs = [[S * 0.28, 1, P.LEG_FL], [S * 0.28, -1, P.LEG_FR], [-S * 0.28, 1, P.LEG_BL], [-S * 0.28, -1, P.LEG_BR]];
  for (const [x, side, part] of legs) { const hip = [x, S * 0.15, side * S * 0.28]; m.limb(hip, [x, S * 0.04, side * S * 0.4], S * 0.08, S * 0.07, skin, { part, pivot: hip }); }
  m.limb([-S * 0.42, S * 0.16, 0], [-S * 0.58, S * 0.08, 0], S * 0.05, S * 0.015, skin, { part: P.TAIL, pivot: [-S * 0.42, S * 0.16, 0] });
}

// Garter snake: rests in a lazy S-curve (the swim/slither wave adds to it), with a yellow back
// stripe and red-checked sides.
function snake(m, s) {
  const S = s.size, Ls = S * 2.2, N = 16, cy = S * 0.08;
  const segPaint = (a, b) => {
    const ax = b[0] - a[0], az = b[2] - a[2], al = Math.hypot(ax, az) || 1;
    return (u, p) => {
      // radial direction from the segment's axis at this point
      const t = Math.max(0, Math.min(1, ((p.x - a[0]) * ax + (p.z - a[2]) * az) / (al * al)));
      const rx = p.x - (a[0] + ax * t), ry = p.y - (a[1] + (b[1] - a[1]) * t), rz = p.z - (a[2] + az * t);
      const r = Math.hypot(rx, ry, rz) || 1, up = ry / r, sd = Math.abs((rx * -az + rz * ax) / al) / r;
      if (s.blotches) { // anaconda: paired dark ovals down an olive back, a yellowish belly
        if (up < -0.5) return col(s.belly);
        return hash3(Math.round(p.x / (S * 0.16)), Math.round(up * 1.5), 3) > 0.55 ? col(s.blotches) : col(s.color);
      }
      if (up > 0.9) return col(s.stripe);
      if (sd > 0.85 && up > -0.35 && up < 0.35) return hash3(Math.round((p.x + p.z) / (S * 0.1)), 0, 0) > 0.5 ? col(s.side) : shade(s.stripe, -0.2);
      return up < -0.55 ? shade(s.color, 0.45) : col(s.color);
    };
  };
  const pts = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N, x = Ls * 0.45 - t * Ls, z = Math.sin(t * Math.PI * 1.7 + 0.3) * S * 0.3 * (0.45 + t * 0.55);
    const r = S * 0.1 * (t < 0.08 ? 0.85 + t * 2 : t > 0.6 ? 1 - (t - 0.6) * 2.1 : 1);
    pts.push({ p: [x, cy * Math.max(0.55, r / (S * 0.085)), z], r: Math.max(r, S * 0.014) });
  }
  for (let k = 1; k < pts.length; k++) m.limb(pts[k - 1].p, pts[k].p, pts[k - 1].r, pts[k].r, segPaint(pts[k - 1].p, pts[k].p), { caps: true, seg: 12 });
  const hp = [Ls * 0.5, cy, pts[0].p[2]];
  m.ell(hp, [S * 0.12, S * 0.07, S * 0.09], u => u.y < -0.3 ? shade(s.color, 0.4) : col(s.color));
  eyes(m, hp, S * 0.05, S * 0.025, S * 0.065, S * 0.018, P.BODY, null);
}

function fish(m, s) {
  const S = s.size, cy = S * 0.2, coho = !!s.head, D = s.deep ? 1.7 : 1; // deep: piranha's tall body
  const back = s.back || (coho ? '#2f4a38' : '#66784a'), flank = s.flank || (coho ? '#c5403a' : '#c6bd86'), belly = s.belly || (coho ? '#9a6a60' : '#ece6d2');
  const red = col('#b8322a');
  const spotAt = (u, dens) => hash3(u.x * 37.1, u.y * 53.7, u.z * 29.3) > dens; // single-vertex freckles
  const body = u => {
    const t = (1 - u.x) / 2; // 0 at the nose, 1 at the tail
    let c = u.y > 0.25 ? tmp.copy(col(back)).lerp(col(flank), smooth(0.55, 0.25, u.y)) : tmp.copy(col(flank)).lerp(col(belly), smooth(-0.25, -0.6, u.y));
    if (coho && t < 0.3) c = tmp.copy(col(back)).lerp(col(belly), smooth(0.1, -0.5, u.y));
    if (s.tailRed && u.y < 0.35) c = tmp.copy(c).lerp(red, smooth(0.45, 0.9, t) * 0.85); // arapaima's red-edged rear scales
    const dens = coho ? 0.95 : 0.96 - t * 0.1; // cutthroat spots gather toward the tail
    if (u.y > -0.35 && spotAt(u, dens)) return col(s.spots);
    return c;
  };
  m.add(SPH_HI, place([0, cy, 0], [0, 0, 0], [S * 0.44, S * 0.15 * D, S * 0.085]), body);
  // head, slightly pointed, with the cutthroat's red slash under the jaw
  const head = u => {
    if (s.throat && u.y < -0.35 && u.x > -0.2) return col(s.throat);
    return coho ? tmp.copy(col(back)).lerp(col(belly), smooth(0.2, -0.6, u.y)) : tmp.copy(col(back)).lerp(col(belly), smooth(0.35, -0.55, u.y));
  };
  m.ell([S * 0.3, cy - S * 0.005, 0], [S * 0.17, S * 0.115 * D, S * 0.075], head);
  m.ell([S * 0.43, cy - S * 0.03, 0], [S * 0.06, S * 0.035, S * 0.05], coho ? '#3a3a30' : shade(back, 0.2)); // snout / kype
  if (s.whiskers) for (const side of [1, -1]) for (const [dy, dz] of [[0, 0.05], [-0.05, 0.12]]) // catfish barbels
    m.limb([S * 0.46, cy - S * 0.03, side * S * 0.03], [S * 0.5, cy - S * (0.09 + dy), side * S * dz * 2], S * 0.012, S * 0.004, back, { caps: false });
  for (const side of [1, -1]) {
    m.ell([S * 0.36, cy + S * 0.025, side * S * 0.058], [S * 0.03, S * 0.03, S * 0.012], '#e8d890', { lo: true });
    m.ell([S * 0.365, cy + S * 0.025, side * S * 0.066], [S * 0.017, S * 0.017, S * 0.008], '#111010', { lo: true });
    m.ell([S * 0.2, cy - S * 0.07, side * S * 0.075], [S * 0.07, S * 0.012, S * 0.03], shade(flank, -0.1), { rot: [side * 0.5, 0.3 * side, -0.4] }); // pectoral
  }
  // narrow tail stock, then the forked tail that sweeps side to side
  const tailC = s.tailRed ? '#9a2a22' : shade(s.back || (coho ? back : '#7a8452'), -0.05);
  m.ell([-S * 0.38, cy, 0], [S * 0.16, S * 0.075, S * 0.045], body);
  const tail = { part: P.TAIL, pivot: [-S * 0.46, cy, 0] };
  m.add(flat(sh => { sh.moveTo(0, 0.2); sh.quadraticCurveTo(-0.6, 0.5, -1, 0.7); sh.quadraticCurveTo(-0.72, 0.2, -0.75, 0); sh.quadraticCurveTo(-0.72, -0.2, -1, -0.7); sh.quadraticCurveTo(-0.6, -0.5, 0, -0.2); sh.lineTo(0, 0.2); }),
    place([-S * 0.5, cy, 0], [0, 0, 0], [S * 0.2, S * 0.2, S * 0.012]), tailC, tail);
  // dorsal, adipose and anal fins
  const fin = flat(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.2, 0.9, -0.2, 1); sh.quadraticCurveTo(-0.3, 0.4, -0.5, 0); sh.lineTo(0.5, 0); });
  m.add(fin, place([S * 0.02, cy + S * 0.12 * D, 0], [0, 0, 0], [S * 0.13, S * 0.1, S * 0.01]), tailC);
  m.ell([-S * 0.3, cy + S * 0.075, 0], [S * 0.035, S * 0.025, S * 0.008], tailC, { lo: true });
  m.add(fin, place([-S * 0.22, cy - S * 0.11 * D, 0], [Math.PI, 0, 0], [S * 0.09, S * 0.07, S * 0.01]), shade(flank, -0.15));
}

// ---------------------------------------------------------------- Amazon oddities
// Four short legs swinging from the hips: [x, z, top, r0, r1, colour] for front then back.
function stumpLegs(m, legs, hoof) {
  const parts = [P.LEG_FL, P.LEG_FR, P.LEG_BL, P.LEG_BR];
  legs.forEach(([x, z, top, r0, r1, c], k) => {
    const hip = [x, top, z], o = { part: parts[k], pivot: hip };
    m.limb(hip, [x + r1 * 0.2, r1, z], r0, r1, c, o);
    if (hoof) m.ell([x + r1 * 0.35, r1 * 0.6, z], [r1 * 1.25, r1 * 0.7, r1 * 1.1], hoof, { ...o, lo: true });
  });
}

// Capybara: a barrel with its rump higher than its shoulders, no neck to speak of, and a huge
// blunt, boxy head with the eyes, ears and nostrils all set high (so it can swim almost hidden).
function capybara(m, s) {
  const L = s.len, H = L * 0.5, leg = L * 0.17, by = leg + H * 0.5;
  const fur = u => tmp.copy(col(s.color)).lerp(col(s.belly), smooth(-0.1, -0.75, u.y))
    .multiplyScalar(0.9 + hash3(Math.round(u.x * 22), Math.round(u.y * 10), Math.round(u.z * 10)) * 0.16);
  loftBody(m, { x0: -L * 0.46, x1: L * 0.3, cy0: by + H * 0.1, cy1: by, ry0: H * 0.56, ry1: H * 0.48, rz0: H * 0.46, rz1: H * 0.42, sag: H * 0.03 }, fur);
  const neck = [L * 0.24, by + H * 0.05, 0], hd = { part: P.HEAD, pivot: neck };
  const face = grad(shade(s.color, -0.05), s.belly, -0.2, 0.5);
  m.ell([L * 0.33, by + H * 0.12, 0], [H * 0.36, H * 0.36, H * 0.31], face, hd);                           // crown of the head
  m.ell([L * 0.47, by - H * 0.02, 0], [H * 0.34, H * 0.35, H * 0.26], face, { ...hd, rot: [0, 0, -0.35] }); // deep, square muzzle
  m.ell([L * 0.56, by - H * 0.16, 0], [H * 0.12, H * 0.14, H * 0.2], shade(s.color, -0.3), hd);            // dark blunt nose
  for (const side of [1, -1]) {
    m.ell([L * 0.57, by - H * 0.04, side * H * 0.08], [H * 0.035, H * 0.03, H * 0.035], '#1a120c', { ...hd, lo: true });  // nostrils on top
    m.ell([L * 0.4, by + H * 0.26, side * H * 0.22], [H * 0.07, H * 0.07, H * 0.05], '#140e0a', { ...hd, lo: true });   // eyes high up
    m.ell([L * 0.28, by + H * 0.44, side * H * 0.16], [H * 0.08, H * 0.1, H * 0.05], shade(s.color, -0.3), hd);         // little round ears
  }
  const lc = shade(s.color, -0.22), r0 = H * 0.17, r1 = H * 0.12;
  stumpLegs(m, [[L * 0.2, H * 0.24, by - H * 0.1, r0, r1, lc], [L * 0.2, -H * 0.24, by - H * 0.1, r0, r1, lc],
    [-L * 0.28, H * 0.26, by, r0 * 1.2, r1, lc], [-L * 0.28, -H * 0.26, by, r0 * 1.2, r1, lc]], '#2a1e16');
}

// Lowland tapir: pear-shaped (heavy rounded rump, narrow shoulders), the head carried low with
// a short drooping trunk, a stiff little mane, white-rimmed ears and a stub of a tail.
function tapir(m, s) {
  const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
  const hide = grad(shade(s.color, 0.08), s.belly, -0.2, 0.5);
  loftBody(m, { x0: -L * 0.47, x1: L * 0.32, cy0: by + H * 0.08, cy1: by - H * 0.02, ry0: H * 0.6, ry1: H * 0.44, rz0: H * 0.48, rz1: H * 0.35, sag: H * 0.05 }, hide);
  const neck = [L * 0.28, by + H * 0.06, 0], hd = { part: P.HEAD, pivot: neck };
  const hp = [L * 0.48, by - H * 0.08, 0];
  m.limb(neck, [hp[0] - H * 0.12, hp[1] + H * 0.04, 0], H * 0.32, H * 0.25, hide, hd);
  m.ell(hp, [H * 0.36, H * 0.25, H * 0.2], hide, { ...hd, rot: [0, 0, -0.3] });
  // the trunk: tapering and curling down, pale at the lip
  const t0 = [hp[0] + H * 0.3, hp[1] - H * 0.12, 0], t1 = [t0[0] + H * 0.2, t0[1] - H * 0.1, 0], t2 = [t1[0] + H * 0.06, t1[1] - H * 0.16, 0];
  m.limb(t0, t1, H * 0.1, H * 0.075, shade(s.color, 0.05), hd);
  m.limb(t1, t2, H * 0.075, H * 0.05, shade(s.color, 0.1), hd);
  m.ell([hp[0] + H * 0.18, hp[1] - H * 0.2, 0], [H * 0.16, H * 0.07, H * 0.13], shade(s.belly, 0.25), hd); // pale lips and chin
  m.limb([hp[0] - H * 0.05, hp[1] + H * 0.2, 0], [neck[0] - H * 0.15, neck[1] + H * 0.34, 0], H * 0.07, H * 0.05, shade(s.color, -0.3), hd); // mane
  for (const side of [1, -1]) {
    m.ell([hp[0] + H * 0.08, hp[1] + H * 0.06, side * H * 0.17], [H * 0.04, H * 0.04, H * 0.03], '#0e0c0a', { ...hd, lo: true });
    const ear = u => u.y > 0.5 || Math.abs(u.x) > 0.75 ? col(s.rim) : col(shade(s.color, -0.1));
    m.ell([hp[0] - H * 0.14, hp[1] + H * 0.3, side * H * 0.14], [H * 0.09, H * 0.13, H * 0.04], ear, { ...hd, rot: [side * -0.35, 0, 0.3] });
  }
  const lc = shade(s.color, -0.1), r0 = H * 0.19, r1 = H * 0.13;
  stumpLegs(m, [[L * 0.22, H * 0.2, by - H * 0.05, r0, r1, lc], [L * 0.22, -H * 0.2, by - H * 0.05, r0, r1, lc],
    [-L * 0.28, H * 0.24, by, r0 * 1.25, r1, lc], [-L * 0.28, -H * 0.24, by, r0 * 1.25, r1, lc]], '#1a1614');
  m.ell([-L * 0.48, by + H * 0.2, 0], [H * 0.07, H * 0.09, H * 0.06], s.color, { part: P.TAIL, pivot: [-L * 0.46, by + H * 0.2, 0], lo: true });
}

// Nine-banded armadillo: a domed shell with flexible bands across its middle, a pointed
// head with upright ears, and a long ringed tail.
function armadillo(m, s) {
  const L = s.len, cy = L * 0.22;
  const shell = u => {
    const band = u.x > -0.35 && u.x < 0.3;
    if (band) return Math.abs(Math.sin(u.x * 26)) < 0.28 ? col(shade(s.color, -0.35)) : col(s.color);
    return tmp.copy(col(s.color)).multiplyScalar(0.85 + hash3(Math.round(u.x * 12), Math.round(u.y * 8), Math.round(u.z * 8)) * 0.25);
  };
  m.add(SPH_HI, place([0, cy, 0], [0, 0, 0], [L * 0.38, L * 0.21, L * 0.23]), shell);
  m.ell([0, cy - L * 0.12, 0], [L * 0.36, L * 0.07, L * 0.2], s.belly); // pale skirt
  const neck = [L * 0.3, cy, 0], hd = { part: P.HEAD, pivot: neck };
  m.ell([L * 0.4, cy - L * 0.02, 0], [L * 0.1, L * 0.08, L * 0.075], shade(s.color, 0.1), hd);
  m.limb([L * 0.46, cy - L * 0.03, 0], [L * 0.6, cy - L * 0.08, 0], L * 0.045, L * 0.02, shade(s.belly, -0.1), hd);
  for (const side of [1, -1]) m.limb([L * 0.37, cy + L * 0.05, side * L * 0.04], [L * 0.33, cy + L * 0.15, side * L * 0.06], L * 0.03, L * 0.012, shade(s.belly, -0.15), hd);
  eyes(m, [L * 0.4, cy - L * 0.02, 0], L * 0.06, L * 0.03, L * 0.055, L * 0.013, P.HEAD, neck);
  const base = [-L * 0.34, cy - L * 0.04, 0], to = { part: P.TAIL, pivot: base };
  for (let k = 0; k < 4; k++) {
    const t0 = k / 4, t1 = (k + 1) / 4, p = t => [base[0] - L * 0.42 * t, base[1] - L * 0.12 * t, 0];
    m.limb(p(t0), p(t1), L * (0.06 - t0 * 0.045), L * (0.06 - t1 * 0.045), k % 2 ? shade(s.color, -0.25) : s.color, { ...to, caps: k === 3 });
  }
  for (const [x, side, part] of [[L * 0.22, 1, P.LEG_FL], [L * 0.22, -1, P.LEG_FR], [-L * 0.2, 1, P.LEG_BL], [-L * 0.2, -1, P.LEG_BR]]) {
    const hip = [x, cy - L * 0.06, side * L * 0.13];
    m.limb(hip, [x + L * 0.02, L * 0.02, side * L * 0.15], L * 0.05, L * 0.035, shade(s.belly, -0.2), { part, pivot: hip });
  }
}

// Monkeys walk the branches on all fours with the prehensile tail curled up behind.
// Red-handed howler: black with rusty hands, feet and tail tip, and a bearded throat.
// Spider monkey: pot-bellied and long in every limb, with a pale ring round the face.
function monkey(m, s) {
  const L = s.len, long = !!s.long, legL = L * (long ? 0.62 : 0.45), by = legL;
  const fur = grad(s.color, s.belly, -0.2, 0.5), limbC = shade(s.color, -0.05), hands = s.hands || limbC;
  loftBody(m, { x0: -L * 0.34, x1: L * 0.3, cy0: by + L * 0.02, cy1: by + L * 0.1, ry0: L * 0.17, ry1: L * 0.16, rz0: L * 0.14, rz1: L * 0.13, sag: L * (long ? 0.03 : 0.01) }, fur);
  const neck = [L * 0.28, by + L * 0.14, 0], hd = { part: P.HEAD, pivot: neck }, hp = [L * 0.44, by + L * 0.24, 0], hr = L * 0.13;
  m.ell(hp, [hr, hr * 0.95, hr * 0.9], fur, hd);
  if (s.face) m.ell([hp[0] + hr * 0.55, hp[1], 0], [hr * 0.55, hr * 0.75, hr * 0.7], s.face, hd);
  m.ell([hp[0] + hr * 0.85, hp[1] - hr * 0.2, 0], [hr * 0.35, hr * 0.4, hr * 0.5], shade(s.face || s.color, -0.35), hd); // muzzle
  if (!long) m.ell([hp[0] + hr * 0.3, hp[1] - hr * 0.85, 0], [hr * 0.6, hr * 0.6, hr * 0.62], shade(s.color, 0.08), hd); // howler's beard
  eyes(m, hp, hr * 0.78, hr * 0.15, hr * 0.35, hr * 0.12, P.HEAD, neck, '#3a2210');
  for (const side of [1, -1]) {
    const sh = [L * 0.22, by + L * 0.06, side * L * 0.1], fl = { part: side > 0 ? P.LEG_FL : P.LEG_FR, pivot: sh };
    const el = [L * 0.26, by * 0.5, side * L * 0.12];
    m.limb(sh, el, L * 0.065, L * 0.05, limbC, fl);
    m.limb(el, [L * 0.3, L * 0.04, side * L * 0.12], L * 0.05, L * 0.04, limbC, fl);
    m.ell([L * 0.32, L * 0.03, side * L * 0.12], [L * 0.06, L * 0.03, L * 0.045], hands, { ...fl, lo: true });
    const hip = [-L * 0.26, by, side * L * 0.1], hl = { part: side > 0 ? P.LEG_BL : P.LEG_BR, pivot: hip };
    const kn = [-L * 0.16, by * 0.52, side * L * 0.13];
    m.limb(hip, kn, L * 0.08, L * 0.055, limbC, hl);
    m.limb(kn, [-L * 0.24, L * 0.04, side * L * 0.12], L * 0.055, L * 0.04, limbC, hl);
    m.ell([-L * 0.2, L * 0.03, side * L * 0.12], [L * 0.07, L * 0.03, L * 0.045], hands, { ...hl, lo: true });
  }
  // the tail rises behind in a long arc and curls at the tip
  const pts = [], n = 12, tl = L * (long ? 1.5 : 1.2);
  for (let k = 0; k <= n; k++) {
    const t = k / n, a = t * Math.PI * 1.25;
    pts.push([-L * 0.32 - Math.sin(a * 0.8) * tl * 0.45 + (t > 0.75 ? (t - 0.75) * tl * 0.6 : 0), by + L * 0.05 + (1 - Math.cos(a * 0.8)) * tl * 0.32, 0]);
  }
  const to = { part: P.TAIL, pivot: [-L * 0.3, by + L * 0.05, 0] };
  for (let k = 1; k <= n; k++) m.limb(pts[k - 1], pts[k], L * 0.045 * (1 - (k - 1) / n * 0.5), L * 0.045 * (1 - k / n * 0.5), k > n - 2 && s.hands ? s.hands : limbC, to);
}

// Brown-throated three-toed sloth, in its classic pose: hanging under a branch from long arms
// and legs hooked on by curved claws, a shaggy algae-tinged coat, and a small round face with a
// dark stripe through each eye.
function sloth(m, s) {
  const L = s.len, bY = L * 0.95, cy = L * 0.5;
  const shag = u => tmp.copy(col(s.color)).lerp(col('#7a8a52'), hash3(Math.round(u.x * 7), Math.round(u.y * 5), 11) > 0.72 ? 0.35 : 0)
    .multiplyScalar(0.82 + hash3(Math.round(u.x * 14), Math.round(u.y * 8), Math.round(u.z * 8)) * 0.3);
  m.limb([-L * 0.7, bY, 0], [L * 0.7, bY + L * 0.03, 0], L * 0.05, L * 0.045, '#6a5238', { seg: 7 }); // the branch
  loftBody(m, { x0: -L * 0.36, x1: L * 0.28, cy0: cy, cy1: cy + L * 0.02, ry0: L * 0.17, ry1: L * 0.15, rz0: L * 0.18, rz1: L * 0.16, sag: -L * 0.05 }, shag);
  const claw = '#e0d8c0', parts = [P.LEG_FL, P.LEG_FR, P.LEG_BL, P.LEG_BR];
  [[L * 0.18, 1, L * 0.36], [L * 0.18, -1, L * 0.36], [-L * 0.26, 1, -L * 0.4], [-L * 0.26, -1, -L * 0.4]].forEach(([x, side, hx], k) => {
    const sh = [x, cy + L * 0.06, side * L * 0.12], o = { part: parts[k], pivot: sh };
    const el = [(x + hx) / 2 + (k < 2 ? L * 0.06 : -L * 0.06), (cy + bY) / 2 + L * 0.02, side * L * 0.15];
    const hand = [hx, bY - L * 0.04, side * L * 0.07];
    m.limb(sh, el, L * 0.07, L * 0.058, shag, o);
    m.limb(el, hand, L * 0.058, L * 0.045, shag, o);
    // three long hooked claws curling over the top of the branch
    for (const t of [-1, 0, 1]) {
      const c0 = [hand[0] + t * L * 0.02, bY + L * 0.06, hand[2]], c1 = [hand[0] + t * L * 0.02 + (k < 2 ? L * 0.04 : -L * 0.04), bY + L * 0.03, hand[2] - side * L * 0.05];
      m.limb(hand, c0, L * 0.014, L * 0.011, claw, { ...o, caps: false });
      m.limb(c0, c1, L * 0.011, L * 0.005, claw, { ...o, caps: false });
    }
  });
  // the head, turned up to look ahead; pale face, dark eye stripes, a little black nose
  const neck = [L * 0.26, cy + L * 0.02, 0], hd = { part: P.HEAD, pivot: neck }, hp = [L * 0.42, cy - L * 0.01, 0], hr = L * 0.145;
  m.limb(neck, hp, L * 0.12, L * 0.1, shag, hd);
  m.ell(hp, [hr, hr * 0.95, hr], shag, hd);
  m.ell([hp[0] + hr * 0.55, hp[1] - hr * 0.05, 0], [hr * 0.5, hr * 0.72, hr * 0.82], s.face, hd);
  for (const side of [1, -1]) {
    m.ell([hp[0] + hr * 0.92, hp[1] + hr * 0.12, side * hr * 0.34], [hr * 0.12, hr * 0.13, hr * 0.36], s.mask, { ...hd, rot: [side * 0.45, 0, 0] });
  }
  eyes(m, hp, hr * 0.98, hr * 0.14, hr * 0.33, hr * 0.085, P.HEAD, neck);
  m.ell([hp[0] + hr * 1.03, hp[1] - hr * 0.25, 0], [hr * 0.14, hr * 0.11, hr * 0.16], '#2a2018', { ...hd, lo: true });
  m.ell([hp[0] + hr * 0.6, hp[1] - hr * 0.72, 0], [hr * 0.35, hr * 0.25, hr * 0.5], shade(s.color, -0.3), hd); // the brown throat
}

// Spectacled caiman: long and low, with an armoured back, a bony ridge between the eyes,
// splayed legs and a heavy tail that sweeps as it swims.
function caiman(m, s) {
  const L = s.len, cy = L * 0.07;
  const hide = u => {
    if (u.y < -0.35) return col(s.belly);
    const scute = Math.abs(Math.sin(u.x * 30)) < 0.3 || Math.abs(Math.sin(Math.atan2(u.z, u.y) * 6)) < 0.25;
    return scute ? col(shade(s.color, -0.3)) : tmp.copy(col(s.color)).lerp(col(s.belly), smooth(0.1, -0.35, u.y) * 0.6);
  };
  loftBody(m, { x0: -L * 0.3, x1: L * 0.24, cy0: cy, cy1: cy, ry0: L * 0.075, ry1: L * 0.08, rz0: L * 0.11, rz1: L * 0.13, fine: true }, hide);
  const neck = [L * 0.22, cy, 0], hd = { part: P.HEAD, pivot: neck };
  const head = u => u.y < -0.3 ? col(s.belly) : col(shade(s.color, 0.05));
  m.ell([L * 0.3, cy + L * 0.005, 0], [L * 0.1, L * 0.05, L * 0.085], head, hd);
  m.ell([L * 0.44, cy - L * 0.005, 0], [L * 0.11, L * 0.03, L * 0.055], head, hd);
  m.ell([L * 0.38, cy + L * 0.03, 0], [L * 0.03, L * 0.008, L * 0.045], shade(s.color, -0.25), hd); // the "spectacles" ridge
  for (const side of [1, -1]) {
    m.ell([L * 0.32, cy + L * 0.035, side * L * 0.035], [L * 0.022, L * 0.018, L * 0.02], shade(s.color, 0.1), { ...hd, lo: true });
    m.ell([L * 0.335, cy + L * 0.04, side * L * 0.04], [L * 0.01, L * 0.012, L * 0.01], '#c8a030', { ...hd, lo: true });
  }
  // the tail starts well inside the haunches (where the body is still thick) so there's no pinch
  const base = [-L * 0.17, cy, 0], to = { part: P.TAIL, pivot: [-L * 0.24, cy, 0] };
  for (let k = 0; k < 7; k++) {
    const t0 = k / 7, t1 = (k + 1) / 7, p = t => [base[0] - L * 0.6 * t, cy - L * 0.012 * t, 0];
    const r = t => L * (0.074 - t * 0.064);
    m.limb(p(t0), p(t1), r(t0), r(t1), hide, { ...to, caps: k === 0 || k === 6 });
    if (t0 > 0.1) for (const side of [1, -1]) m.ell([p(t0 + 0.07)[0], cy + r(t0) * 0.92, side * L * 0.02 * (1 - t0 * 0.9)], [L * 0.016, L * 0.006, L * 0.007], shade(s.color, -0.25), { ...to, lo: true });
  }
  for (const [x, side, part] of [[L * 0.16, 1, P.LEG_FL], [L * 0.16, -1, P.LEG_FR], [-L * 0.2, 1, P.LEG_BL], [-L * 0.2, -1, P.LEG_BR]]) {
    const hip = [x, cy - L * 0.01, side * L * 0.09], el = [x + L * 0.02, cy - L * 0.02, side * L * 0.17];
    m.limb(hip, el, L * 0.035, L * 0.028, s.color, { part, pivot: hip });
    m.limb(el, [x + L * 0.05, L * 0.008, side * L * 0.19], L * 0.028, L * 0.022, s.color, { part, pivot: hip });
    m.ell([x + L * 0.07, L * 0.008, side * L * 0.19], [L * 0.03, L * 0.008, L * 0.025], s.color, { part, pivot: hip, lo: true });
  }
}

// Boto, the Amazon river dolphin: pink and flexible, with a long slender beak, a bulging
// melon, a low ridge instead of a tall dorsal fin, and broad paddle flippers.
function dolphin(m, s) {
  const L = s.len || s.size, cy = L * 0.13;
  const skin = u => tmp.copy(col(shade(s.color, -0.12))).lerp(col(s.belly), smooth(0.35, -0.5, u.y));
  loftBody(m, { x0: -L * 0.46, x1: L * 0.3, cy0: cy + L * 0.01, cy1: cy, ry0: L * 0.04, ry1: L * 0.12, rz0: L * 0.035, rz1: L * 0.11, fine: true }, skin);
  const hd = { part: P.HEAD, pivot: [L * 0.22, cy, 0] };
  m.ell([L * 0.32, cy + L * 0.02, 0], [L * 0.1, L * 0.095, L * 0.085], skin, hd); // melon
  m.limb([L * 0.38, cy - L * 0.03, 0], [L * 0.62, cy - L * 0.05, 0], L * 0.032, L * 0.016, shade(s.color, 0.05), hd);
  eyes(m, [L * 0.35, cy, 0], L * 0.02, -L * 0.01, L * 0.07, L * 0.008, P.HEAD, hd.pivot);
  m.add(flat(sh => { sh.moveTo(0.6, 0); sh.quadraticCurveTo(0, 0.5, -0.6, 0.15); sh.lineTo(-0.6, 0); sh.lineTo(0.6, 0); }),
    place([-L * 0.05, cy + L * 0.1, 0], [0, 0, 0], [L * 0.16, L * 0.08, L * 0.01]), shade(s.color, -0.1)); // low dorsal ridge
  for (const side of [1, -1]) m.ell([L * 0.14, cy - L * 0.07, side * L * 0.12], [L * 0.08, L * 0.012, L * 0.045], shade(s.color, -0.05), { rot: [side * 0.35, side * 0.4, -0.2] });
  const fluke = flat(sh => { sh.moveTo(0, 0.08); sh.quadraticCurveTo(-0.4, 0.4, -0.8, 1); sh.quadraticCurveTo(-0.7, 0.4, -1, 0); sh.quadraticCurveTo(-0.7, -0.4, -0.8, -1); sh.quadraticCurveTo(-0.4, -0.4, 0, -0.08); sh.lineTo(0, 0.08); }, 'xz');
  m.add(fluke, place([-L * 0.44, cy + L * 0.01, 0], [0, 0, 0], [L * 0.14, L * 0.012, L * 0.14]), shade(s.color, -0.12), { part: P.TAIL, pivot: [-L * 0.44, cy, 0] });
}

// ---------------------------------------------------------------- visitors
// Same palettes as the old 2D visitor sprites, so the eight looks carry over.
const SHIRTS = ['#c8583a', '#3a6a9a', '#e0b030', '#5a8a4a', '#8a4a8a', '#d88a6a', '#2a4a3a', '#b0302a'];
const PANTS = ['#3a3a4a', '#5a4a3a', '#2a3a5a', '#6a6a5a'];
const SKIN = ['#f0c8a0', '#d8a878', '#a87850', '#7a5030'];
const HAIR = ['#3a2a1a', '#8a6a3a', '#1a1a1a', '#c8a060'];

function person(m, look) {
  const shirt = SHIRTS[look % SHIRTS.length], pants = PANTS[look % PANTS.length], skin = SKIN[(look >> 1) % SKIN.length];
  const shirtC = grad(shirt, shade(shirt, -0.18), 0, 0.6);
  // legs and boots (they swing from the hip)
  for (const side of [1, -1]) {
    const hip = [0, 15.5, side * 1.9], part = side > 0 ? P.LEG_FL : P.LEG_FR;
    m.limb(hip, [0.2, 2.2, side * 1.95], 1.75, 1.35, side > 0 ? pants : shade(pants, -0.08), { part, pivot: hip });
    m.ell([0.9, 1.1, side * 1.95], [2.1, 1.15, 1.35], '#3a2e26', { part, pivot: hip, lo: true });
  }
  m.ell([0, 16, 0], [2.7, 2.4, 3.6], pants);
  // torso, a little broader at the shoulders
  m.ell([0, 20.8, 0], [2.8, 5.6, 3.9], shirtC);
  m.ell([0, 24, 0], [2.6, 2.4, 4.4], shirtC);
  if (look % 3 === 0) { // daypack
    m.ell([-3.3, 21.5, 0], [1.9, 3.8, 3.1], shade(shirt, -0.4));
    for (const side of [1, -1]) m.limb([1.2, 25.3, side * 2.4], [1.4, 19, side * 2.9], 0.45, 0.45, shade(shirt, -0.5), { caps: false });
  }
  // arms swing opposite the legs: the left arm moves with the right leg
  for (const side of [1, -1]) {
    const sh = [0, 24.6, side * 4.3], part = side > 0 ? P.LEG_BL : P.LEG_BR;
    m.limb(sh, [0.4, 17.4, side * 4.9], 1.25, 1.05, shirtC, { part, pivot: sh });
    m.ell([0.5, 16.6, side * 5], [1.05, 1.15, 1.0], skin, { part, pivot: sh, lo: true });
  }
  // head, hair or a sun hat
  const hp = [0.3, 30, 0], hd = { part: P.HEAD, pivot: [0, 26.5, 0] };
  m.limb([0, 26, 0], [0.1, 28, 0], 1.3, 1.25, skin, { ...hd, caps: false });
  m.ell(hp, [3.1, 3.4, 3], skin, hd);
  eyes(m, hp, 2.8, 0.4, 1.1, 0.42, P.HEAD, hd.pivot);
  if (look % 2) {
    const hat = look % 4 === 1 ? '#6a5a3a' : '#3a5a3a';
    m.ell([0.2, 32.3, 0], [5.2, 0.55, 5.2], hat, hd);
    m.ell([0, 33.4, 0], [3.1, 1.9, 3.1], shade(hat, 0.08), hd);
  } else {
    const hair = HAIR[look % 4];
    m.ell([-0.5, 31.1, 0], [3.35, 2.6, 3.25], hair, hd);
    m.ell([-1.6, 29.4, 0], [2.1, 2.8, 3.05], hair, hd);
  }
}

// Hippo: a huge grey barrel slung low on stumpy legs, and a head that is mostly muzzle: a wide,
// flared box with the nostrils, eyes and little ears all set on top so it can lie almost
// hidden in the water. Pinkish skin around the eyes, the mouth and underneath.
function hippo(m, s) {
  const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
  const pink = col(s.belly), grey = col(s.color);
  const hide = u => tmp.copy(grey).lerp(pink, smooth(-0.35, -0.85, u.y) * 0.75)
    .multiplyScalar(0.94 + hash3(Math.round(u.x * 16), Math.round(u.y * 8), Math.round(u.z * 8)) * 0.1);
  loftBody(m, { x0: -L * 0.5, x1: L * 0.34, cy0: by + H * 0.06, cy1: by + H * 0.02, ry0: H * 0.66, ry1: H * 0.62, rz0: H * 0.6, rz1: H * 0.58, sag: H * 0.03, fine: true }, hide);
  const neck = [L * 0.27, by + H * 0.08, 0], hd = { part: P.HEAD, pivot: neck };
  const face = u => tmp.copy(grey).lerp(pink, smooth(-0.1, -0.8, u.y) * 0.8);
  m.limb(neck, [L * 0.4, by + H * 0.05, 0], H * 0.5, H * 0.42, face, hd);                                      // thick neck
  m.ell([L * 0.45, by + H * 0.12, 0], [H * 0.36, H * 0.34, H * 0.36], face, hd);                               // skull
  m.ell([L * 0.62, by - H * 0.02, 0], [H * 0.34, H * 0.3, H * 0.44], face, hd);                                // the broad, flared muzzle
  m.ell([L * 0.6, by - H * 0.26, 0], [H * 0.32, H * 0.14, H * 0.38], shade(s.belly, -0.08), hd);              // heavy lower jaw
  m.limb([L * 0.53, by - H * 0.14, H * 0.36], [L * 0.53, by - H * 0.14, -H * 0.36], H * 0.1, H * 0.1, shade(s.belly, -0.2), { ...hd, caps: false }); // the long mouth line
  for (const side of [1, -1]) {
    const z = side * H * 0.15;
    m.ell([L * 0.7, by + H * 0.22, z], [H * 0.09, H * 0.08, H * 0.1], face, hd);                              // nostril bumps
    m.ell([L * 0.74, by + H * 0.27, z], [H * 0.035, H * 0.025, H * 0.045], '#2a1c1c', { ...hd, lo: true });
    m.ell([L * 0.47, by + H * 0.4, side * H * 0.22], [H * 0.1, H * 0.09, H * 0.09], face, hd);                // eye turrets
    m.ell([L * 0.5, by + H * 0.42, side * H * 0.27], [H * 0.055, H * 0.05, H * 0.035], pink, { ...hd, lo: true });
    m.ell([L * 0.51, by + H * 0.43, side * H * 0.29], [H * 0.03, H * 0.03, H * 0.02], '#140c0a', { ...hd, lo: true });
    m.ell([L * 0.39, by + H * 0.48, side * H * 0.2], [H * 0.05, H * 0.08, H * 0.04], shade(s.color, -0.2), { ...hd, rot: [side * -0.4, 0, 0.3] }); // little ears
    m.ell([L * 0.72, by - H * 0.12, side * H * 0.34], [H * 0.035, H * 0.08, H * 0.03], '#f0e8d8', { ...hd, lo: true }); // a hint of tusk at the lip
  }
  const lc = u => tmp.copy(grey).lerp(pink, 0.25), r0 = H * 0.28, r1 = H * 0.24;
  stumpLegs(m, [[L * 0.2, H * 0.34, by - H * 0.1, r0, r1, lc], [L * 0.2, -H * 0.34, by - H * 0.1, r0, r1, lc],
    [-L * 0.3, H * 0.36, by - H * 0.05, r0 * 1.1, r1, lc], [-L * 0.3, -H * 0.36, by - H * 0.05, r0 * 1.1, r1, lc]], shade(s.color, -0.25));
  const tb = [-L * 0.49, by + H * 0.2, 0];
  m.ell([-L * 0.53, by + H * 0.02, 0], [H * 0.05, H * 0.16, H * 0.08], s.color, { part: P.TAIL, pivot: tb, rot: [0, 0, -0.3] }); // short flattened tail
}

// Nile monitor: a long, low lizard on sprawling legs, with a snaky neck, a narrow pointed head,
// a flicking forked tongue and a thick tail as long as the rest of it. Dark olive with pale
// yellow bands and spots.
function monitor(m, s) {
  const S = s.size, cy = S * 0.13;
  const skin = u => {
    const band = Math.sin(u.x * 13) > 0.82 && u.y > -0.3;
    const spot = u.y > 0.1 && hash3(Math.round(u.x * 34), Math.round(u.y * 9), Math.round(u.z * 9)) > 0.86;
    return u.y < -0.5 ? col(s.belly) : band || spot ? col(shade(s.belly, -0.1)) : col(s.color);
  };
  loftBody(m, { x0: -S * 0.3, x1: S * 0.28, cy0: cy, cy1: cy + S * 0.005, ry0: S * 0.075, ry1: S * 0.08, rz0: S * 0.1, rz1: S * 0.1, fine: true }, skin);
  const neck = [S * 0.24, cy + S * 0.01, 0], hd = { part: P.HEAD, pivot: neck };
  m.limb(neck, [S * 0.4, cy + S * 0.04, 0], S * 0.065, S * 0.05, skin, hd);                  // long neck
  m.ell([S * 0.46, cy + S * 0.045, 0], [S * 0.08, S * 0.04, S * 0.045], skin, hd);           // head
  m.ell([S * 0.54, cy + S * 0.035, 0], [S * 0.045, S * 0.025, S * 0.028], s.color, hd);      // pointed snout
  eyes(m, [S * 0.46, cy + S * 0.045, 0], S * 0.03, S * 0.02, S * 0.037, S * 0.011, P.HEAD, neck, '#c8a030');
  for (const side of [1, -1]) m.limb([S * 0.585, cy + S * 0.03, 0], [S * 0.64, cy + S * 0.03, side * S * 0.012], S * 0.005, S * 0.003, '#8a3a4a', { ...hd, caps: false }); // forked tongue
  // tail: thick at the base, tapering, as long again as the body
  const tb = [-S * 0.28, cy, 0];
  m.limb(tb, [-S * 0.62, cy - S * 0.03, 0], S * 0.07, S * 0.04, skin, { part: P.TAIL, pivot: tb });
  m.limb([-S * 0.62, cy - S * 0.03, 0], [-S * 0.95, cy - S * 0.06, 0], S * 0.04, S * 0.01, skin, { part: P.TAIL, pivot: tb, caps: false });
  // legs splay out sideways from the body, elbows up, feet flat with claws
  const legs = [[S * 0.17, 1, P.LEG_FL], [S * 0.17, -1, P.LEG_FR], [-S * 0.2, 1, P.LEG_BL], [-S * 0.2, -1, P.LEG_BR]];
  for (const [x, side, part] of legs) {
    const hip = [x, cy, side * S * 0.07], knee = [x + S * 0.02, cy + S * 0.02, side * S * 0.17], foot = [x + S * 0.04, S * 0.01, side * S * 0.2], o = { part, pivot: hip };
    m.limb(hip, knee, S * 0.035, S * 0.028, skin, o);
    m.limb(knee, foot, S * 0.028, S * 0.02, s.color, o);
    for (const t of [-1, 0, 1]) m.limb(foot, [foot[0] + S * 0.04, S * 0.004, foot[2] + t * S * 0.02], S * 0.008, S * 0.003, '#2a2418', { ...o, caps: false });
  }
}

// Dung beetle: a glossy black scarab, head down and walking backwards, its long hind legs up on
// the ball of dung it's rolling. Shovel-edged head, spiny digging forelegs, a seam down the wing cases.
function beetle(m, s) {
  const S = s.size * 1.6, c = col(s.color), hi = col('#5a5a4c');
  const tilt = -0.32; // nose down, rear up against the ball
  const R = (x, y) => [x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt) + S * 0.34];
  const at = (x, y, z) => { const [a, b] = R(x, y); return [a, b, z]; };
  const shell = u => {
    const k = smooth(0.1, 0.9, u.y) * 0.6 + (Math.abs(Math.sin(u.z * 9)) < 0.18 ? -0.25 : 0); // sheen on top, faint grooves
    const t = tmp.copy(c).lerp(hi, Math.max(0, k));
    return Math.abs(u.z) < 0.05 && u.y > 0 ? t.multiplyScalar(0.5) : t;                           // the seam between the wing cases
  };
  const rot = [0, 0, tilt];
  m.ell(at(-S * 0.1, S * 0.08, 0), [S * 0.36, S * 0.22, S * 0.32], shell, { rot });                  // wing cases
  m.ell(at(S * 0.26, S * 0.06, 0), [S * 0.17, S * 0.17, S * 0.29], u => tmp.copy(c).lerp(hi, smooth(0.2, 1, u.y) * 0.7), { rot }); // pronotum
  const hd = { part: P.HEAD, pivot: at(S * 0.38, S * 0.05, 0) };
  m.ell(at(S * 0.48, -S * 0.02, 0), [S * 0.15, S * 0.06, S * 0.27], shade(s.color, 0.1), { ...hd, rot });  // the flat, shovel-like head
  for (const z of [-0.18, -0.07, 0.07, 0.18]) m.ell(at(S * 0.62, -S * 0.04, S * z), [S * 0.045, S * 0.025, S * 0.04], s.color, { ...hd, lo: true }); // toothed front edge
  for (const side of [1, -1]) m.ell(at(S * 0.5, S * 0.02, side * S * 0.24), [S * 0.03, S * 0.03, S * 0.02], '#3a2e20', { ...hd, lo: true }); // eyes
  // six legs in two tripods, so they alternate the way a beetle walks
  const legs = [
    [S * 0.3, 1, P.LEG_FL, [S * 0.62, -S * 0.2, S * 0.42], [S * 0.72, -S * 0.34, S * 0.36]],   // front: short, flattened, digging
    [S * 0.05, -1, P.LEG_FL, [S * 0.1, -S * 0.2, -S * 0.55], [S * 0.0, -S * 0.34, -S * 0.72]],   // middle: splayed out
    [-S * 0.28, 1, P.LEG_FL, [-S * 0.55, S * 0.15, S * 0.5], [-S * 0.72, S * 0.32, S * 0.34]],   // hind: long, reaching up onto the ball
    [S * 0.3, -1, P.LEG_FR, [S * 0.62, -S * 0.2, -S * 0.42], [S * 0.72, -S * 0.34, -S * 0.36]],
    [S * 0.05, 1, P.LEG_FR, [S * 0.1, -S * 0.2, S * 0.55], [S * 0.0, -S * 0.34, S * 0.72]],
    [-S * 0.28, -1, P.LEG_FR, [-S * 0.55, S * 0.15, -S * 0.5], [-S * 0.72, S * 0.32, -S * 0.34]],
  ];
  for (const [x, side, part, knee, foot] of legs) {
    const hip = at(x, -S * 0.08, side * S * 0.2), k = at(...knee), f = at(...foot), o = { part, pivot: hip };
    m.limb(hip, k, S * 0.04, S * 0.035, s.color, o);
    m.limb(k, f, S * 0.035, S * 0.018, s.color, { ...o, caps: false });
    if (x > S * 0.2) for (const t of [0.4, 0.7]) { const p = k.map((v, n) => v + (f[n] - v) * t); m.limb(p, [p[0] + S * 0.06, p[1] - S * 0.02, p[2]], S * 0.012, S * 0.004, s.color, { ...o, caps: false }); } // spines on the forelegs
  }
  // the ball: rough, lumpy dung with bits of dry grass stuck in it
  const bc = [-S * 1.12, S * 0.62, 0], br = S * 0.6;
  m.add(SPH_HI, place(bc, [0, 0, 0], [br, br * 0.97, br]), u => tmp.copy(col('#6a4e30')).lerp(col('#8a6a42'), hash3(Math.round(u.x * 6), Math.round(u.y * 6), Math.round(u.z * 6))).multiplyScalar(0.8 + hash3(Math.round(u.x * 13), Math.round(u.y * 13), Math.round(u.z * 13)) * 0.35));
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4, b = (k % 3 - 1) * 0.7, d = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)];
    const p = bc.map((v, n) => v + d[n] * br * 0.96);
    m.limb(p, [p[0] + d[2] * S * 0.22, p[1] + d[0] * S * 0.12, p[2] - d[0] * S * 0.22], S * 0.018, S * 0.012, '#c8b27a', { caps: false });
  }
}

// ---------------------------------------------------------------- species -> model + motion
// motion: leg swing (radians), body bob (px), tail sway, wing beat rate, swim/slither wave.
export function buildSpecies(def) {
  const s = def.sprite, m = new Model();
  const mo = { leg: 0.55, bob: 0, tail: 0.25, flap: 1.6, wave: 0, waveK: 0, waveHead: 0, waveLen: 1, sink: 0, len: s.len || s.size };
  switch (s.kind) {
    case 'squirrel': squirrel(m, s); mo.leg = 0.45; mo.bob = 1.1; mo.sink = 3; break;
    case 'rodent': vole(m, s); mo.leg = 0.6; mo.bob = 0.5; mo.sink = 2.5; break;
    case 'rabbit': rabbit(m, s); mo.leg = 0.35; mo.bob = 2.6; mo.sink = 3.5; break;
    case 'bear': bear(m, s); mo.leg = 0.38; mo.bob = 0.6; mo.sink = s.leg + s.h * 0.45; break;
    case 'capybara': capybara(m, s); mo.leg = 0.45; mo.bob = 0.4; mo.sink = s.len * 0.3; break;
    case 'tapir': tapir(m, s); mo.leg = 0.45; mo.bob = 0.3; mo.sink = s.leg + s.h * 0.4; break;
    case 'armadillo': armadillo(m, s); mo.leg = 0.7; mo.bob = 0.3; mo.sink = s.len * 0.2; break;
    case 'monkey': monkey(m, s); mo.leg = 0.6; mo.bob = 0.6; mo.tail = 0.15; break;
    case 'sloth': sloth(m, s); mo.leg = 0.12; mo.tail = 0; break;
    case 'caiman': caiman(m, s); mo.leg = 0.4; mo.tail = 0.35; mo.wave = s.len * 0.025; mo.waveK = 6 / s.len; mo.waveHead = s.len * 0.1; mo.waveLen = s.len * 0.7; mo.sink = s.len * 0.09; break;
    case 'dolphin': dolphin(m, s); mo.tail = 0.3; mo.wave = s.size * 0.03; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.2; mo.waveLen = s.size * 0.8; mo.sink = s.size * 0.1; break;
    case 'deer': case 'canine': case 'feline': case 'raccoon': case 'otter': case 'beaver':
    case 'peccary': case 'agouti': case 'anteater':
    case 'zebra': case 'wildebeest': case 'gazelle': case 'impala': case 'buffalo': case 'warthog': case 'hyena': case 'rhino': case 'giraffe': case 'elephant': {
      const o = MAMMALS[s.kind](s);
      quadruped(m, s, o);
      mo.bob = o.H * (s.kind === 'rabbit' ? 0.35 : s.kind === 'rodent' || s.kind === 'squirrel' ? 0.12 : 0.04);
      mo.leg = s.kind === 'elephant' || s.kind === 'rhino' ? 0.3 : s.kind === 'giraffe' ? 0.38 : 0.55;
      mo.sink = o.leg + o.H * 0.45;
      break;
    }
    case 'songbird': case 'hummer': case 'woodpecker': case 'heron': case 'duck': case 'raptor': case 'owl': case 'toucan': case 'macaw': case 'ostrich': case 'hornbill': case 'vulture': case 'secretary': case 'crane':
      bird(m, s);
      mo.flap = s.kind === 'hummer' ? 7 : s.kind === 'heron' || s.kind === 'raptor' || s.kind === 'owl' || s.kind === 'macaw' || s.kind === 'vulture' || s.kind === 'crane' || s.kind === 'secretary' ? 0.9 : 2;
      mo.leg = 0.5; mo.tail = 0.1;
      mo.sink = s.kind === 'duck' ? s.size * 0.24 : 0;
      break;
    case 'bat': bat(m, s); mo.flap = 2.6; break;
    case 'beetle': beetle(m, s); mo.leg = 0.7; mo.tail = 0; break;
    case 'monitor': monitor(m, s); mo.leg = 0.55; mo.wave = s.size * 0.04; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.3; mo.waveLen = s.size * 1.2; mo.sink = s.size * 0.1; break;
    case 'hippo': hippo(m, s); mo.leg = 0.28; mo.bob = 0.3; mo.tail = 0.5; mo.sink = s.leg + s.h * 0.55; break;
    case 'frog': frog(m, s); mo.leg = 0.3; mo.bob = s.size * 0.5; mo.sink = s.size * 0.3; break;
    case 'newt': newt(m, s); mo.leg = 0.5; mo.wave = s.size * 0.05; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.4; mo.waveLen = s.size * 1.2; mo.sink = s.size * 0.12; break;
    case 'turtle': turtle(m, s); mo.leg = 0.35; mo.sink = s.size * 0.2; break;
    case 'snake': snake(m, s); mo.wave = s.size * 0.13; mo.waveK = 5.2 / (s.size * 2.4); mo.waveHead = s.size * 1.3; mo.waveLen = s.size * 2.4; mo.sink = s.size * 0.05; break;
    case 'person': person(m, s.look); mo.leg = 0.5; mo.bob = 0.5; mo.len = 8; break;
    case 'fish': fish(m, s); mo.wave = s.size * 0.07; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.25; mo.waveLen = s.size * 0.9; mo.sink = s.size * 0.2; mo.tail = 0.5; break;
    default: m.ell([0, 4, 0], [4, 4, 4], s.color || '#888');
  }
  return { geo: m.build(), motion: mo };
}

// ---------------------------------------------------------------- material with the animation shader
export function faunaMaterial(motion) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const u = {
    uLeg: { value: motion.leg }, uBob: { value: motion.bob }, uTail: { value: motion.tail }, uFlap: { value: motion.flap },
    uWave: { value: motion.wave }, uWaveK: { value: motion.waveK }, uWaveHead: { value: motion.waveHead }, uWaveLen: { value: motion.waveLen },
  };
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = `
      attribute float aPart; attribute vec3 aPivot; attribute vec3 aExt; attribute vec3 aExtN; attribute vec4 aAnim;
      uniform float uLeg, uBob, uTail, uFlap, uWave, uWaveK, uWaveHead, uWaveLen;
      vec3 rotX(vec3 p, vec3 o, float a) { vec3 q = p - o; float c = cos(a), s = sin(a); return o + vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c); }
      vec3 rotY(vec3 p, vec3 o, float a) { vec3 q = p - o; float c = cos(a), s = sin(a); return o + vec3(q.x * c + q.z * s, q.y, -q.x * s + q.z * c); }
      vec3 rotZ(vec3 p, vec3 o, float a) { vec3 q = p - o; float c = cos(a), s = sin(a); return o + vec3(q.x * c - q.y * s, q.x * s + q.y * c, q.z); }
    ` + shader.vertexShader
      .replace('#include <beginnormal_vertex>', `
        bool isWing = aPart > 5.5 && aPart < 7.5;
        vec3 objectNormal = isWing ? normalize(mix(normal, aExtN, aAnim.z)) : normal;
      `)
      .replace('#include <begin_vertex>', `
        float ph = aAnim.x, gait = aAnim.y, fly = aAnim.z, graze = aAnim.w;
        vec3 transformed = position;
        if (isWing) {
          transformed = mix(position, aExt, fly);
          float side = aPart < 6.5 ? 1.0 : -1.0;
          transformed = rotX(transformed, aPivot, -side * fly * sin(ph * uFlap) * 0.75);
        } else if (aPart > 0.5 && aPart < 4.5) {
          float off = (aPart < 1.5 || aPart > 3.5) ? 0.0 : 3.14159;
          // walking legs swing; in flight they tuck back under the tail
          transformed = rotZ(transformed, aPivot, sin(ph + off) * uLeg * gait * (1.0 - fly) - fly * 1.35);
        } else if (aPart > 4.5 && aPart < 5.5) {
          transformed = rotY(transformed, aPivot, sin(ph * 0.5 + 1.3) * uTail * (0.35 + gait));
        } else if (aPart > 7.5) {
          transformed = rotZ(transformed, aPivot, -graze * 0.9);
        }
        transformed.y += abs(sin(ph)) * uBob * gait * (1.0 - fly);
        if (uWave > 0.0) {
          float t = clamp((uWaveHead - transformed.x) / uWaveLen, 0.0, 1.0);
          transformed.z += sin(transformed.x * uWaveK - ph * 1.4) * uWave * mix(0.25, 1.0, t) * (0.35 + gait);
        }
      `);
  };
  mat.customProgramCacheKey = () => 'fauna';
  return mat;
}

// ---------------------------------------------------------------- instanced pools
class SpeciesMesh {
  constructor(scene, def) {
    const { geo, motion } = buildSpecies(def);
    this.geo = geo; this.motion = motion; this.scene = scene;
    this.mat = withClouds(faunaMaterial(motion)); // the field-guide portraits use it bare
    this.cap = 0; this.count = 0; this.mesh = null;
    this.grow(16);
  }
  grow(cap) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.dispose(); }
    this.cap = cap;
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.anim.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aAnim', this.anim);
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.scene.add(this.mesh);
  }
}

// Visitors use the same instanced models, one pool per look.
export const PERSON_LOOKS = Array.from({ length: 8 }, (_, look) => ({ key: 'person' + look, sprite: { kind: 'person', look } }));

export class Fauna {
  constructor(scene) {
    this.scene = scene;
    this.species = new Map();
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3();
    this.yAxis = new THREE.Vector3(0, 1, 0);
  }
  pool(def) {
    let p = this.species.get(def.key);
    if (!p) { p = new SpeciesMesh(this.scene, def); this.species.set(def.key, p); }
    return p;
  }
  motion(def) { return this.pool(def).motion; }
  begin() { for (const p of this.species.values()) p.count = 0; }
  // One animal this frame. scale converts model pixels to scene units.
  add(def, x, y, z, yaw, scale, phase, gait, fly, graze) {
    const p = this.pool(def);
    if (p.count >= p.cap) {
      // carry over what this frame has already written, then grow
      const oldM = p.mesh.instanceMatrix.array.slice(0, p.count * 16), oldA = p.anim.array.slice(0, p.count * 4), n = p.count;
      p.grow(p.cap * 2);
      p.mesh.instanceMatrix.array.set(oldM); p.anim.array.set(oldA); p.count = n;
    }
    const k = p.count++;
    this.q.setFromAxisAngle(this.yAxis, yaw);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(scale, scale, scale));
    p.mesh.setMatrixAt(k, this.m);
    const a = p.anim.array;
    a[k * 4] = phase; a[k * 4 + 1] = gait; a[k * 4 + 2] = fly; a[k * 4 + 3] = graze;
  }
  end() {
    for (const p of this.species.values()) {
      p.mesh.count = p.count;
      if (p.count) { p.mesh.instanceMatrix.needsUpdate = true; p.anim.needsUpdate = true; }
    }
  }
  clear() { this.begin(); this.end(); }
}
