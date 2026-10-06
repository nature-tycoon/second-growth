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
const SCALE = new THREE.SphereGeometry(1, 6, 3); // one of a pangolin's hundreds of plates (kept light)

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
  pointed: t => [0.5 - 0.1 * t - 0.55 * t * t + 0.035 * t ** 8, -0.5 + 0.1 * t + 0.25 * t * t - 0.035 * t ** 8 - 0.03 * Math.abs(Math.sin(Math.PI * t * 5)) * (1 - t)],
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
  // front: how far forward of the fold point the folded wing begins (the shoulder)
  // up: how high round the body the folded wing sits (radians up from the flank's midline)
  wing(side, pivot, span, chord, thick, paint, fold, kind = 'round', R = chord, tilt = 0, foldLen = 1, front = span * 0.5 * foldLen, up = 0.3) {
    // A thin flight-feather layer, with a shorter, softly raised covert layer over its shoulder.
    // Both stay in the same animated part, preserving the species' spread-wing silhouette.
    for (const coverts of [false, true]) {
      const shape = coverts ? 'round' : kind, source = wingShape(shape, side);
      const unit = source.clone(), paintGeo = source.clone(), paintPos = paintGeo.attributes.position;
      const spreadPos = unit.attributes.position;
      for (let i = 0; i < spreadPos.count; i++) {
        const x = spreadPos.getX(i), y = spreadPos.getY(i), t = Math.abs(spreadPos.getZ(i));
        if (coverts) {
          const dome = Math.sin(Math.PI * t) * Math.max(0, 1 - 4 * x * x);
          spreadPos.setXYZ(i, x * 0.7 + 0.12, y * 0.65 + 0.9 + dome * 0.5, side * t * 0.66);
          paintPos.setXYZ(i, x * 0.7 + 0.12, y, side * t * 0.66);
        }
      }
      unit.computeVertexNormals();
      const ext = place([pivot[0] - chord * 0.25, pivot[1], pivot[2]], [0, 0, 0], [chord * 1.9, thick, span * 1.7]);
      const g = source.clone(), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), t0 = Math.abs(p.getZ(i));
        const [leading, trailing] = (PLANFORM[shape] || PLANFORM.round)(t0);
        let across = Math.max(0, Math.min(1, (x - trailing) / Math.max(0.001, leading - trailing))) - 0.5;
        let t = coverts ? t0 * 0.66 : t0;
        // Fold spread primaries over one another, keeping their old compact reach.
        if (!coverts && kind === 'fingered' && t > 0.56) {
          across *= 1 - smooth(0.56, 0.64, t) * 0.85;
          t = 0.56 + (t - 0.56) * 0.55;
        }
        // The folded outline is independent of the spread planform: broad near the shoulder,
        // tapering all the way to the tailward tip, instead of a narrow neck and blunt paddle.
        const taper = 0.045 + 0.955 * Math.pow(1 - (coverts ? t : t0), kind === 'pointed' ? 0.85 : 0.65);
        const shoulder = 0.8 + 0.2 * Math.sin(Math.PI * Math.min(1, t / 0.3));
        const width = chord * 0.95 * taper * shoulder;
        const edge = coverts ? 1 - smooth(0.65, 1, t0) : 1;
        const wrap = width * (coverts ? 0.2 + across * 0.72 * edge : across);
        const lift = coverts ? thick * (0.9 + Math.sin(Math.PI * t0) * (1 - 4 * across * across) * 0.6) : 0;
        const along = span * 1.2 * foldLen * t, th = up + wrap / R;
        const r = R * (1 - 0.3 * t * t) + y * thick * (coverts ? 0.8 : 1.2) + chord * 0.01 + lift;
        // Retain the body wrap and upright-body tilt, so the new layers don't stand off the flank.
        const lx = front - along, ly = r * Math.sin(th) - along * 0.06, c = Math.cos(tilt), sn = Math.sin(tilt);
        p.setXYZ(i, fold[0] + lx * c - ly * sn, fold[1] + lx * sn + ly * c, side * r * Math.cos(th));
      }
      g.computeVertexNormals();
      this.add(g, new THREE.Matrix4(), paint, { part: side > 0 ? P.WING_L : P.WING_R, pivot, ext, extSrc: unit, paintGeo });
      g.dispose(); unit.dispose(); paintGeo.dispose();
    }
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

// One smooth tube through a run of points (Catmull-Rom, so elbows and curls bend rather than
// kink), with a radius at each point (a number, or [across "up", across the side] for an oval),
// closed off with rounded ends. up: the direction the oval's first radius (and paint's u.y) faces
// at the start. Paint gets (u, p): u.x runs -1..1 along the tube, u.y/u.z round it.
function tube(m, pts, rad, paint, o = {}) {
  const sub = o.sub ?? 4, A = o.seg ?? 10, n = pts.length;
  const R = rad.map(r => (Array.isArray(r) ? r : [r, r]));
  const at = (i, k) => pts[Math.max(0, Math.min(n - 1, i))][k];
  const S = [], SR = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < sub; j++) {
    const t = j / sub, t2 = t * t, t3 = t2 * t;
    S.push([0, 1, 2].map(k => 0.5 * (2 * at(i, k) + (at(i + 1, k) - at(i - 1, k)) * t + (2 * at(i - 1, k) - 5 * at(i, k) + 4 * at(i + 1, k) - at(i + 2, k)) * t2 + (3 * at(i, k) - at(i - 1, k) - 3 * at(i + 1, k) + at(i + 2, k)) * t3)));
    const e = t * t * (3 - 2 * t);
    SR.push([R[i][0] + (R[i + 1][0] - R[i][0]) * e, R[i][1] + (R[i + 1][1] - R[i][1]) * e]);
  }
  S.push(pts[n - 1].slice()); SR.push(R[n - 1]);
  // tangents and a twist-free frame carried along the tube
  const T = S.map((p, i) => { const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)]; return V(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(); });
  let N = V(...(o.up || [0, 1, 0]));
  const frames = T.map(t => { N = N.clone().addScaledVector(t, -N.dot(t)); if (N.lengthSq() < 1e-8) N = Math.abs(t.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0); N.normalize(); return [N.clone(), t.clone().cross(N).normalize()]; });
  // rings, with a rounded cap of a few rings at each end
  const rings = [], cap = o.capRings ?? 3;
  const ring = (c, [nn, bb], ra, rb, tt) => rings.push({ c, nn, bb, ra, rb, tt });
  for (let k = cap; k >= 1; k--) { const ph = (k / cap) * Math.PI / 2, r = SR[0], c = V(...S[0]).addScaledVector(T[0], -Math.sin(ph) * Math.min(r[0], r[1]) * (o.capLen ?? 1)); ring(c, frames[0], r[0] * Math.cos(ph), r[1] * Math.cos(ph), 0); }
  S.forEach((p, i) => ring(V(...p), frames[i], SR[i][0], SR[i][1], i / (S.length - 1)));
  const L = S.length - 1;
  for (let k = 1; k <= cap; k++) { const ph = (k / cap) * Math.PI / 2, r = SR[L], c = V(...S[L]).addScaledVector(T[L], Math.sin(ph) * Math.min(r[0], r[1]) * (o.capLen ?? 1)); ring(c, frames[L], r[0] * Math.cos(ph), r[1] * Math.cos(ph), 1); }
  const pos = [], u = [], idx = [];
  for (const r of rings) for (let j = 0; j <= A; j++) {
    const a = j / A * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    pos.push(r.c.x + r.nn.x * ca * r.ra + r.bb.x * sa * r.rb, r.c.y + r.nn.y * ca * r.ra + r.bb.y * sa * r.rb, r.c.z + r.nn.z * ca * r.ra + r.bb.z * sa * r.rb);
    u.push(2 * r.tt - 1, ca, sa);
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < A; j++) { const a = i * (A + 1) + j, b = a + A + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const unitG = new THREE.BufferGeometry(); unitG.setAttribute('position', new THREE.Float32BufferAttribute(u, 3));
  m.add(g, new THREE.Matrix4(), paint, { ...o, paintGeo: unitG });
}

// Long hair hanging off a limb or a flank: thin tapering locks falling from points along a line
// (a to b), each a little different in length and lean. down: [dx, dy, dz] per unit of length.
function locks(m, a, b, count, len, r, paint, o = {}, seed = 1, down = [0, -1, 0]) {
  for (let k = 0; k < count; k++) {
    const j = hash3(k, seed, 3.1), j2 = hash3(seed, k, 7.7), t = Math.min(1, Math.max(0, (k + 0.2 + j2 * 0.6) / count));
    const p0 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    // each lock falls in two lengths, kinking a little at the middle, thick at the root so
    // neighbours run together into a ragged curtain rather than a row of spikes
    const l = len * (0.6 + j * 0.8), sx = (j2 - 0.5) * len * 0.35, sz = (j - 0.5) * len * 0.3;
    const p1 = [p0[0] + down[0] * l * 0.5 + sx * 0.6, p0[1] + down[1] * l * 0.5, p0[2] + down[2] * l * 0.5 + sz * 0.4];
    const p2 = [p0[0] + down[0] * l + sx, p0[1] + down[1] * l, p0[2] + down[2] * l + sz];
    const rr = r * (0.9 + j2 * 0.5);
    m.limb(p0, p1, rr, rr * 0.62, paint, { ...o, caps: false, seg: 5 });
    m.limb(p1, p2, rr * 0.62, rr * 0.1, paint, { ...o, caps: false, seg: 5 });
  }
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

// Clouded leopard: big irregular "cloud" blotches in world space, each with a black rim and a
// fill a little darker than the coat, separated by lanes of the paler ground colour.
function cloudCoat(base, dark, size) {
  const d = col(dark);
  return (u, p) => {
    const [gap, id] = cells(p, size);
    if (u.y < -0.6) return gap > 0.42 && id > 0.4 ? d : base(u); // a few spots on the pale belly
    if (id < 0.12 || gap < 0.08) return base(u);
    if (gap < 0.2 + id * 0.08) return d;
    return tmp.copy(base(u)).multiplyScalar(0.6 + id * 0.15);
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
    rz0: H * 0.42 * W, rz1: H * 0.41 * W, sag: H * (o.sag ?? 0.04), fine: o.rosettes || o.dots || o.fine ? 2 : false,
  }, coat);
  if (o.extra) o.extra(m, { L, H, leg, by, W, coat });

  // legs: upper and lower segment, swinging from the hip
  const lc = o.legColor || shade(s.color, -0.2);
  const spots = [[L * 0.26, 1, P.LEG_FL], [L * 0.26, -1, P.LEG_FR], [-L * 0.25, 1, P.LEG_BL], [-L * 0.25, -1, P.LEG_BR]];
  for (const [x, side, part] of spots) {
    // set in far enough that even thick upper legs stay inside the body's outline
    const z = side * Math.min(H * 0.24, H * 0.42 - o.legR0) * W, hip = [x, by - H * 0.05, z];
    const r0 = o.legR0, r1 = o.legR1, rm = (r0 + r1) * 0.55, hind = part >= P.LEG_BL;
    const c = part < P.LEG_BL && o.frontLeg ? o.frontLeg : lc, lo = { part, pivot: hip, rings: o.legRings };
    let foot = [x, r1, z];
    if (o.straight) { // pillar legs (elephant, rhino)
      const knee = [x + (hind ? -r0 * 0.5 : r0 * 0.2), leg * 0.5, z];
      if (o.smoothLegs) tube(m, [hip, knee, foot], [r0, rm, r1], c, lo);
      else { m.limb(hip, knee, r0, rm, c, lo); m.limb(knee, foot, rm, r1, c, lo); }
    } else if (hind) {
      // thigh forward to the stifle, shin back to the hock, then a straight cannon to the foot
      const b = Math.min(r0 * 0.9, leg * 0.14), stifle = [x + b * 0.55, leg * 0.66, z], hock = [x - b, leg * 0.3, z];
      foot = [x - b * 0.55, r1, z];
      if (o.smoothLegs) tube(m, [hip, stifle, hock, foot], [r0, r0 * 0.72, r1 * 1.05, r1], c, lo);
      else { m.limb(hip, stifle, r0, r0 * 0.75, c, lo); m.limb(stifle, hock, r0 * 0.7, r1 * 1.05, c, lo); m.limb(hock, foot, r1 * 1.05, r1, c, lo); }
    } else {
      // upper arm back to the elbow, forearm down to a slightly forward wrist
      const b = Math.min(r0 * 0.9, leg * 0.14), elbow = [x - b * 0.35, leg * 0.62, z], wrist = [x + b * 0.15, leg * 0.26, z];
      foot = [x + b * 0.1, r1, z];
      if (o.smoothLegs) tube(m, [hip, elbow, wrist, foot], [r0, rm, r1 * 1.08, r1], c, lo);
      else { m.limb(hip, elbow, r0, rm, c, lo); m.limb(elbow, wrist, rm, r1 * 1.08, c, lo); m.limb(wrist, foot, r1 * 1.08, r1, c, lo); }
    }
    if (o.nails) for (const t of [-1, 0, 1]) m.ell([foot[0] + r1 * 0.91, r1 * 0.5, z + t * r1 * 0.57], [r1 * 0.22, r1 * 0.26, r1 * 0.23], '#a89e8d', lo);
    if (o.hoof) m.ell([foot[0] + r1 * 0.2, r1 * 0.75, z], [r1 * 1.3, r1 * 0.85, r1 * 1.15], o.hoof, { part, pivot: hip, lo: true });
    else if (o.paws && (o.toes || o.smoothLegs)) {
      m.ell([foot[0] + r1 * 0.45, r1 * 0.63, z], [r1 * 1.35, r1 * 0.62, r1 * 1.1], c, { part, pivot: hip });
      if (o.toes) for (const t of [-1, 0, 1]) m.ell([foot[0] + r1 * 1.15, r1 * 0.48, z + t * r1 * 0.52], [r1 * 0.42, r1 * 0.38, r1 * 0.32], c, { part, pivot: hip });
    }
    else if (o.paws) m.ell([foot[0] + r1 * 0.4, r1 * 0.72, z], [r1 * 1.4, r1 * 0.75, r1 * 1.12], c, { part, pivot: hip, lo: true });
  }

  // head and neck, which dip together when grazing
  const neck = [L * 0.3, by + H * 0.12, 0];
  const hp = o.head, hr = o.headR;
  const hc = o.headPaint || (o.headColor ? grad(o.headColor, s.belly || o.headColor, -0.4, 0.5) : coat);
  const hd = { part: P.HEAD, pivot: neck };
  if (o.neckR) m.limb(neck, [hp[0] - hr[0] * 0.3, hp[1] - hr[1] * 0.2, 0], o.neckR, o.neckR * 0.8, o.neckColor ? solid(o.neckColor) : hc, { ...hd, seg: o.neckSeg, rings: o.neckRings });
  m.ell(hp, hr, hc, hd);
  const sn = [hp[0] + hr[0] * 0.78, hp[1] - hr[1] * 0.28, 0];
  m.ell([sn[0] + o.snout * 0.3, sn[1], 0], [o.snout, hr[1] * 0.55, hr[2] * 0.58], o.muzzle || hc, hd);
  if (o.nose !== false) m.ell([sn[0] + o.snout * 1.22, sn[1] + hr[1] * 0.1, 0], [hr[1] * 0.2, hr[1] * 0.17, hr[1] * 0.22], '#1c1714', { ...hd, lo: true });
  eyes(m, hp, hr[0] * 0.42, hr[1] * 0.28, hr[2] * 0.78, o.eyeR ?? Math.max(0.55, H * 0.045), P.HEAD, neck);
  m.eyeAt = [hp[0] + hr[0] * 0.42, hp[1] + hr[1] * 0.28, hr[2] * 0.78]; m.eyePivot = neck; // for eye-shine at night: forward, up, apart
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

// Common palm civet: long, low and slim on short dark legs, grizzled grey-brown with faint rows of
// dark spots and stripes down the back and flanks, a dark mask with white patches above and below
// the eyes, and a long plain dark tail carried low.
function longSnoutedMammal(s) {
  const L = s.len, coati = !!s.coati, H = L * (coati ? 0.37 : 0.4), leg = L * (coati ? 0.23 : 0.18), by = leg + H * 0.5;
  const pale = coati ? s.belly : '#e4ddd0';
  return {
    H, leg, wide: 0.9, hip: 0.08, haunch: 1.07, legR0: H * 0.17, legR1: H * 0.085,
    smoothLegs: true, paws: true, legColor: coati ? s.dark : '#ad8e82', neckR: H * 0.24,
    head: [L * 0.49, by + H * 0.16], headR: [H * 0.32, H * 0.26, H * 0.26],
    headColor: coati ? s.color : pale, muzzle: pale, snout: H * 0.19, nose: false,
    ears: 'round', ear: H * (coati ? 0.22 : 0.32), earColor: coati ? s.dark : '#3b302e', eyeR: H * 0.055,
    face: (m, hp, hr, hd) => {
      const tip = [hp[0] + H * (coati ? 0.65 : 0.59), hp[1] - H * (coati ? 0.22 : 0.12), 0];
      tube(m, [[hp[0] + hr[0] * 0.55, hp[1] - H * 0.04, 0], [hp[0] + H * 0.4, hp[1] - H * 0.08, 0], tip],
        [[H * 0.15, H * 0.16], [H * 0.09, H * 0.09], [H * 0.04, H * 0.04]], pale, hd);
      m.ell(tip, [H * 0.048, H * 0.038, H * 0.055], coati ? '#241c17' : '#bf8b85', hd);
      if (coati) for (const side of [-1, 1]) m.ell([hp[0] + H * 0.09, hp[1] - H * 0.03, side * H * 0.23], [H * 0.15, H * 0.045, H * 0.035], pale, hd);
    },
    tail: (m, b) => {
      const base = [-L * 0.42, b.by + H * 0.1, 0], o = { part: P.TAIL, pivot: base, sub: 6, seg: 12 };
      if (coati) tube(m, [base, [-L * 0.59, b.by + H * 0.42, 0], [-L * 0.68, b.by + H * 1.02, 0], [-L * 0.83, b.by + H * 1.26, 0]],
        [H * 0.12, H * 0.11, H * 0.085, H * 0.05], (u, p) => Math.sin(p.y / H * 20) > 0.35 ? col(s.dark) : col(s.color), o);
      else tube(m, [base, [-L * 0.59, b.by - H * 0.28, 0], [-L * 0.78, b.by - H * 0.42, 0], [-L * 0.98, b.by - H * 0.18, 0]],
        [H * 0.065, H * 0.05, H * 0.032, H * 0.012], '#bd9a90', o);
    },
  };
}

function civet(s) {
  const L = s.len, H = L * 0.3, leg = L * 0.15, by = leg + H * 0.5, dk = col(s.dark);
  return {
    H, leg, wide: 0.92, hip: 0.04, shoulder: 0.0, chest: 0.95, legR0: H * 0.19, legR1: H * 0.09, legColor: s.dark, neckR: H * 0.3, paws: true, fine: true,
    coat: base => u => {
      const c = tmp.copy(base(u)).multiplyScalar(0.9 + hash3(Math.round(u.x * 26), Math.round(u.y * 12), Math.round(u.z * 12)) * 0.16);
      const a = Math.abs(Math.atan2(u.z, u.y));
      if (u.x > -0.85 && u.x < 0.75) {
        if (a < 0.1 || Math.abs(a - 0.42) < 0.07) return c.lerp(dk, 0.55);                                      // dorsal stripes
        for (const r of [0.85, 1.2, 1.55]) { const q = u.x * 13 + r * 1.7, i = Math.floor(q); if (Math.abs(a - r - (hash3(i, r, 1) - 0.5) * 0.12) < 0.1 && Math.abs(q - i - 0.5) < 0.28 && hash3(i, r, 4) > 0.2) return c.lerp(dk, 0.42); } // rows of smudgy spots
      }
      return c;
    },
    head: [L * 0.5, by + H * 0.22], headR: [H * 0.4, H * 0.34, H * 0.34], snout: H * 0.42, muzzle: shade(s.dark, 0.1), mask: true,
    ears: 'point', ear: H * 0.26, earOut: 0.3, earW: 0.5, earBack: 0.15, earColor: s.dark,
    face: (m, hp, hr, hd) => {
      for (const side of [1, -1]) {
        m.ell([hp[0] + hr[0] * 0.5, hp[1] - hr[1] * 0.1, side * hr[2] * 0.72], [hr[0] * 0.3, hr[1] * 0.16, hr[2] * 0.2], s.belly, { ...hd, lo: true }); // under the eye
        m.ell([hp[0] + hr[0] * 0.45, hp[1] + hr[1] * 0.58, side * hr[2] * 0.4], [hr[0] * 0.22, hr[1] * 0.12, hr[2] * 0.2], s.belly, { ...hd, lo: true }); // over the eye
      }
    },
    tail: (m, b) => {
      const base = [-L * 0.42, b.by, 0], o = { part: P.TAIL, pivot: base };
      const p1 = [-L * 0.72, b.by - H * 0.42, 0], p2 = [-L * 1.05, b.by - H * 0.62, 0], p3 = [-L * 1.32, b.by - H * 0.45, 0];
      tube(m, [base, p1, p2, p3], [H * 0.17, H * 0.15, H * 0.12, H * 0.07], u => tmp.copy(dk).multiplyScalar(1.1 + u.y * 0.25), { ...o, seg: 8, sub: 3 });
    },
  };
}

// Banded wild boar (beard): a wedge of a pig, massive and high in the shoulder and slim behind, with
// a crest of long dark bristles down the spine, a long straight wedge of a head ending in the disc
// of the snout, small upturned tusks, small upright ears, the pale band (beard) running back along
// the cheek from the corner of the mouth, short slim legs and a straight tail with a tuft.
function beardedPig(s, L, H, leg, by) {
  const dk = col(shade(s.color, -0.4));
  const bristle = base => (u, p) => tmp.copy(base(u)).multiplyScalar(0.78 + hash3(Math.round(p.x * 1.6), Math.round(p.y * 0.8), Math.round(p.z * 1.6)) * 0.4);
  return {
    H, leg, wide: 0.86, hip: -0.06, shoulder: 0.2, chest: 1.14, haunch: 0.8, legR0: H * 0.15, legR1: H * 0.065, legColor: shade(s.color, -0.35), hoof: '#141110', neckR: H * 0.36, coat: bristle, fine: true,
    head: [L * 0.47, by - H * 0.02], headR: [H * 0.34, H * 0.32, H * 0.26], snout: H * 0.08, muzzle: shade(s.color, -0.1), nose: false,
    ears: 'point', ear: H * 0.24, earOut: 0.3, earW: 0.45, earBack: 0.3, earColor: shade(s.color, -0.3),
    extra: (m, b) => {
      // the crest of long bristles standing along the spine, longest over the shoulders
      for (let k = 0; k < 24; k++) {
        const t = k / 23, x = L * (0.36 - 0.52 * t), top = b.by + H * (0.62 - 0.22 * t * t), h = H * (0.17 - 0.1 * t) * (0.7 + hash3(k, 4, 1) * 0.6);
        m.limb([x, top - H * 0.1, (hash3(k, 3, 3) - 0.5) * H * 0.08], [x - H * 0.12, top + h, (hash3(k, 2, 2) - 0.5) * H * 0.1], H * 0.05, H * 0.008, dk, { caps: false, seg: 4 });
      }
    },
    face: (m, hp, hr, hd) => {
      // the long, straight wedge of the snout, deeper than it is wide, sloping down to the disc
      const f0 = [hp[0] + hr[0] * 0.3, hp[1] - hr[1] * 0.1, 0], tip = [hp[0] + H * 0.7, hp[1] - H * 0.32, 0];
      const snout = u => tmp.copy(col(shade(s.color, -0.05))).lerp(dk, smooth(0.2, 0.9, u.x) * 0.5).multiplyScalar(0.85 + hash3(Math.round(u.x * 9), Math.round(u.y * 3), Math.round(u.z * 3)) * 0.25);
      tube(m, [f0, [(f0[0] + tip[0]) / 2, (f0[1] + tip[1]) / 2 + H * 0.02, 0], tip], [[H * 0.28, H * 0.22], [H * 0.2, H * 0.155], [H * 0.135, H * 0.115]], snout, { ...hd, seg: 10, sub: 3, capRings: 1, capLen: 0.3 });
      const a = Math.atan2(tip[1] - f0[1], tip[0] - f0[0]);
      m.ell([tip[0] + H * 0.01, tip[1], 0], [H * 0.03, H * 0.13, H * 0.12], '#5a4440', { ...hd, rot: [0, 0, a + Math.PI / 2 - 0.1] }); // the disc of the nose
      for (const side of [1, -1]) {
        m.ell([tip[0] + H * 0.035, tip[1] + H * 0.02, side * H * 0.04], [H * 0.012, H * 0.025, H * 0.018], '#1a1210', { ...hd, lo: true }); // nostrils
        // the pale band from the corner of the mouth back along the cheek
        const band = tmp.copy(col(s.color)).lerp(col(s.beard), 0.75).clone();
        m.ell([hp[0] + H * 0.18, hp[1] - H * 0.2, side * H * 0.19], [H * 0.3, H * 0.045, H * 0.03], band, { ...hd, rot: [0, side * 0.35, a * 0.4] });
        m.limb([hp[0] + H * 0.46, hp[1] - H * 0.3, side * H * 0.11], [hp[0] + H * 0.5, hp[1] - H * 0.18, side * H * 0.16], H * 0.026, H * 0.007, '#ece4d0', { ...hd, caps: false }); // tusks
      }
      // bristles carry on over the crown and nape
      for (let k = 0; k < 4; k++) m.limb([hp[0] - hr[0] * (0.2 + k * 0.35), hp[1] + hr[1] * 0.7, 0], [hp[0] - hr[0] * (0.45 + k * 0.35), hp[1] + hr[1] * 0.7 + H * 0.16, 0], H * 0.06, H * 0.012, dk, { ...hd, caps: false, seg: 5 });
    },
    tail: (m, b) => { const base = [-L * 0.45, b.by + H * 0.2, 0]; m.limb(base, [-L * 0.52, b.by - H * 0.3, 0], H * 0.035, H * 0.025, s.color, { part: P.TAIL, pivot: base }); m.ell([-L * 0.525, b.by - H * 0.4, 0], [H * 0.05, H * 0.12, H * 0.05], dk, { part: P.TAIL, pivot: base, lo: true }); },
  };
}

// ---------------------------------------------------------------- Sumatra's big three
// The tiger, elephant and rhino are built here part by part (not from the generic quadruped), in
// "sprite pixels" scaled from the sprite's len. Each returns its motion settings.
const ellHi = (m, pos, r, paint, o = {}) => m.add(SPH_HI, place(pos, o.rot || [0, 0, 0], r), paint, o);
// Linear lookup into a body profile [[x, cy, ry, rz]...] (for laying folds and hair on its surface)
function profileAt(B, x) {
  if (x <= B[0][0]) return B[0].slice(1);
  for (let k = 1; k < B.length; k++) if (x <= B[k][0]) { const a = B[k - 1], b = B[k], t = (x - a[0]) / (b[0] - a[0]); return [1, 2, 3].map(n => a[n] + (b[n] - a[n]) * t); }
  return B[B.length - 1].slice(1);
}
// A point on that body's surface: th is the angle round from the spine (0) toward side +z (pi/2)
function onProfile(B, x, th, lift = 1) { const [cy, ry, rz] = profileAt(B, x); return [x, cy + Math.cos(th) * ry * lift, Math.sin(th) * rz * lift]; }
// One smooth closed surface shaped by a function of direction (a sculpted sphere): fn(d) returns the
// point for unit direction d. Paint gets (d, p). The sphere's seam is welded so it shades smoothly.
const sculptBase = new Map();
function sculpt(m, fn, paint, o = {}, geo = SPH_HI) {
  let unit = sculptBase.get(geo);
  if (!unit) { unit = geo.clone(); unit.deleteAttribute('uv'); unit.deleteAttribute('normal'); unit = mergeVertices(unit); sculptBase.set(geo, unit); }
  const g = unit.clone(), p = g.attributes.position, d = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { d.fromBufferAttribute(unit.attributes.position, i); const q = fn(d); p.setXYZ(i, q[0], q[1], q[2]); }
  g.computeVertexNormals();
  m.add(g, new THREE.Matrix4(), paint, { ...o, paintGeo: unit });
}

// Sumatran tiger: a long, low, heavy cat. A deep chest and shoulder blades that roll as it prowls,
// thick forelegs on big paws, a broad head framed by a ruff of white cheek fur, white brow spots and
// muzzle, small round ears black behind with a white spot, and a long thick tail carried in a low
// curve, ringed black to a black tip. Narrow, wavy black stripes (many doubled into loops) on deep
// rust-orange, fading to white under the belly and inside the legs.
function tiger(m, s) {
  const k = s.len / 46, X = (x, y, z = 0) => [x * k, y * k, z * k];
  const orange = col(s.color), rust = col(shade(s.color, -0.22)), white = col(s.belly), black = col(s.dark);
  const pale = tmp.copy(orange).lerp(white, 0.42).clone(), cream = tmp.copy(orange).lerp(white, 0.7).clone();
  // body, neck, shoulder blades and thighs share one stripe field laid out in model space
  const sp = 2.1;
  const coat = (u, p) => {
    const x = p.x / k, a = Math.atan2(Math.abs(p.z / k) * 1.12, p.y / k - 20); // 0 along the spine, pi under the belly
    const c = tmp.copy(rust).lerp(orange, smooth(0.05, 0.85, a)).lerp(pale, smooth(1.5, 1.95, a)).lerp(white, smooth(1.95, 2.3, a));
    if (a < 0.14) c.lerp(black, 0.35); // the stripes run together along the spine
    const ph = x / sp + 0.45 * Math.sin(a * 1.7 + x * 0.19) + 0.1 * Math.sin(a * 5.1 + x * 0.7);
    const i = Math.floor(ph), f = ph - i - 0.5, g = hash3(i, 7, 1);
    const taper = 1 - smooth(1.2 + g * 0.6, 2.45 + g * 0.3, a);
    if (taper <= 0 || (a > 0.7 && hash3(i, Math.floor(a * 1.3 + g * 5), 4) < 0.1)) return c; // (a few broken off)
    const w = 0.19 * (0.75 + g * 0.5) * (0.4 + 0.6 * taper);
    if (g > 0.58) { // doubled: splitting below the spine into a pair that closes again in a loop
      const gap = 0.15 * smooth(0.45, 0.9, a) * (1 - smooth(1.5, 2.1, a));
      return Math.abs(Math.abs(f) - gap) < w * (gap > 0.05 ? 0.55 : 1) ? black : c;
    }
    return Math.abs(f) < w ? black : c;
  };
  // legs: orange outside with dark bars, white on the inside, paler toward the paws
  const legC = zl => (u, p) => {
    const y = p.y / k, inner = smooth(-0.6, -1.8, Math.abs(p.z / k) - zl) * smooth(3, 9, y);
    const c = tmp.copy(orange).lerp(pale, smooth(7, 2, y) * 0.6).lerp(white, inner * 0.85);
    if (y > 4.5 && inner < 0.45) {
      const ph = y / 2.1 + Math.sin(p.x / k * 0.9) * 0.3 + p.x / k * 0.12, i = Math.floor(ph), f = ph - i - 0.5;
      if (Math.abs(f) < 0.14 * (0.7 + hash3(i, zl, 3) * 0.6) * smooth(4.5, 8, y) && hash3(i, Math.floor(p.x / k * 0.5), 5) > 0.2) return black;
    }
    return c;
  };
  const pawC = cream;

  // the body: haunch, a tucked-up loin, the deep chest, the shoulders
  const B = [[-20.5, 21.6, 4.7, 4.3], [-16, 21.3, 6.7, 5.5], [-8, 21.3, 5.8, 5.0], [2, 20.4, 7.4, 5.8], [10.5, 19.9, 8.0, 5.9], [16, 19.9, 6.8, 5.2], [19.5, 20.3, 4.8, 4.2]];
  tube(m, B.map(b => X(b[0], b[1])), B.map(b => [b[2] * k, b[3] * k]), coat, { seg: 28, sub: 12, capRings: 4 });

  for (const side of [1, -1]) {
    // forelegs: the shoulder blade (it rolls with the stride), a thick upper arm back to the elbow,
    // a heavy straight forearm, a big round paw
    const zf = 3.5, fo = { part: side > 0 ? P.LEG_FL : P.LEG_FR, pivot: X(12.6, 19.5, side * zf) };
    m.ell(X(11.6, 24.0, side * 3.3), [2.6 * k, 4.4 * k, 1.9 * k], coat, { ...fo, rot: [0, 0, 0.35] });
    const F = [[12.4, 23, 3.3], [14.3, 17, 3.55], [11.6, 11.3, 2.95], [12.6, 5, 2.2], [13.4, 2.0, 2.0]];
    tube(m, F.map(q => X(q[0], q[1], side * zf)), F.map(q => q[2] * k), legC(zf), { ...fo, seg: 12, sub: 6, capRings: 3 });
    m.ell(X(14.8, 1.3, side * zf), [2.75 * k, 1.3 * k, 2.2 * k], pawC, { ...fo, lo: true });
    for (const t of [-1.15, 0, 1.15]) m.ell(X(16.65 - Math.abs(t) * 0.4, 1.0, side * zf + t), [0.85 * k, 0.78 * k, 0.72 * k], pawC, { ...fo, lo: true });
    // hind legs: the big muscled thigh, the stifle forward, a long shin back to the hock, then the paw
    const zh = 3.7, ho = { part: side > 0 ? P.LEG_BL : P.LEG_BR, pivot: X(-15.2, 21, side * zh) };
    ellHi(m, X(-14.0, 19.4, side * 3.3), [4.2 * k, 5.2 * k, 2.1 * k], coat, { ...ho, rot: [0, 0, -0.3] });
    const Hh = [[-15.4, 24, 3.6], [-11.8, 14.2, 3.2], [-16.4, 6.8, 1.9], [-17.1, 4.4, 1.75], [-15.9, 2.0, 1.8]];
    tube(m, Hh.map(q => X(q[0], q[1], side * zh)), Hh.map(q => q[2] * k), legC(zh), { ...ho, seg: 12, sub: 6, capRings: 3 });
    m.ell(X(-14.6, 1.25, side * zh), [2.4 * k, 1.2 * k, 1.95 * k], pawC, { ...ho, lo: true });
    for (const t of [-1.0, 0, 1.0]) m.ell(X(-13.0 - Math.abs(t) * 0.35, 0.95, side * zh + t), [0.75 * k, 0.72 * k, 0.65 * k], pawC, { ...ho, lo: true });
  }

  // head and neck, carried low and forward (they dip together to drink). The head is big and
  // broad: G scales it about the back of the skull.
  const neck = X(15, 22), hd = { part: P.HEAD, pivot: neck }, G = 1.16;
  const HX = (x, y, z = 0) => X(22 + (x - 22) * G, 21.4 + (y - 21.4) * G, z * G), R = (a, b, c) => [a * k * G, b * k * G, c * k * G];
  tube(m, [X(14, 21.6), X(19, 21.7), X(23, 21.3)], [[6.3 * k, 5.0 * k], [5.7 * k, 4.9 * k], [4.9 * k, 4.7 * k]], coat, { ...hd, seg: 24, sub: 6, capRings: 2 });
  const hx = 25.2, hy = 21.4;
  const headC = (u, p) => {
    const qx = (p.x / k - 22) / G + 22 - hx, qy = (p.y / k - 21.4) / G, az = Math.abs(p.z / k) / G;
    if (qy < -2.3 && qx > -2.2) return white;                                         // chin and throat
    if (az > 2.4 && qy < 0.3 && qx > -2.6) return Math.sin((qx * 0.75 - qy * 1.1) * 1.9 + 0.6) > 0.42 && qx < 2.6 && qy > -2.2 ? black : qy > -0.2 && qx > 1 ? orange : white; // cheeks, boldly striped
    if (qy > 1.0 && qx > -1.6 && qy < 4.4 && az > 0.3 && Math.sin(qy * 3.4 + az * 1.3 - qx * 0.45) > 0.72) return black; // forehead marks
    if (qx < -1.2 && Math.sin(qx * 2.9 + az * 0.9 + Math.sin(qy) * 0.6) > 0.78) return black;   // stripes down the nape
    return tmp.copy(orange).lerp(rust, smooth(1, 4, qy) * 0.4);
  };
  ellHi(m, HX(hx, hy + 0.2), R(4.6, 3.9, 4.3), headC, { ...hd, rot: [Math.PI / 2, 0, 0] });        // the broad skull
  // the muzzle: broad and deep, orange over the bridge and white below and in front
  const muz = (u, p) => { const qy = (p.y / k - 21.4) / G, qx = (p.x / k - 22) / G + 22; return (qy < -1.0 && qx > 28.4) || (qy < -0.5 && qx > 30.2) ? white : headC(u, p); };
  ellHi(m, HX(29.0, 19.9), R(2.8, 2.1, 2.3), muz, { ...hd, rot: [0, 0, -0.1] });
  m.ell(HX(28.6, 21.0), R(2.9, 1.45, 2.0), headC, { ...hd, rot: [0, 0, -0.22] });       // bridge of the nose
  const ruff = (u, p) => (hash3(Math.round(p.x / k * 1.6), Math.round(p.y / k * 1.6), 3) > 0.72 ? black : white);
  for (const side of [1, -1]) {
    // the ruff: white cheek fur standing out wide and back past the jaw, framing the face
    ellHi(m, HX(26.0, 19.8, side * 2.7), R(3.1, 2.2, 1.95), headC, { ...hd, rot: [0, side * 0.35, 0] });
    m.ell(HX(23.7, 19.3, side * 3.8), R(2.3, 2.5, 0.95), headC, { ...hd, rot: [0, side * 0.9, -0.3] });
    for (let j = 0; j < 7; j++) {
      const t = j / 6, b0 = HX(24.2 - t * 2.2, 17.9 + t * 3.3, side * (4.1 + Math.sin(t * Math.PI) * 0.7));
      m.limb(b0, [b0[0] - 1.6 * k * G, b0[1] - (0.9 - t * 0.6) * k * G, b0[2] + side * 0.8 * k * G], 0.7 * k, 0.12 * k, ruff, { ...hd, seg: 5, caps: false });
    }
    m.ell(HX(30.55, 19.0, side * 1.15), R(1.25, 1.1, 1.3), (u, p) => (u.z * side > 0.25 && u.y > -0.3 && hash3(Math.round(p.x / k * 3), Math.round(p.y / k * 3), 1) > 0.7 ? black : white), hd); // whisker pads
    m.ell(HX(27.9, 22.85, side * 2.15), R(0.95, 0.42, 0.8), white, { ...hd, lo: true });     // white spot over the eye
    m.ell(HX(28.35, 21.95, side * 2.25), R(0.72, 0.46, 0.42), black, { ...hd, lo: true, rot: [0, side * -0.5, 0.15] }); // dark rim of the eye
    m.ell(HX(28.55, 21.95, side * 2.35), R(0.5, 0.33, 0.3), '#e0a632', { ...hd, lo: true, rot: [0, side * -0.5, 0.15] }); // amber eye
    m.ell(HX(28.8, 21.95, side * 2.36), R(0.18, 0.22, 0.16), '#120c08', { ...hd, lo: true });   // pupil
    // small round ears set wide: black behind with a white spot, pale fur inside
    m.add(SPH, place(HX(23.2, 24.5, side * 3.4), [side * -0.25, side * 0.25, 0], R(0.45, 1.2, 1.2)), u => (u.x < -0.1 ? ((u.y - 0.05) ** 2 + u.z * u.z < 0.2 ? white : black) : (u.y * u.y + u.z * u.z > 0.72 ? black : cream)), hd);
  }
  m.ell(HX(31.6, 20.0), R(0.6, 0.65, 0.98), '#c27a6a', { ...hd, lo: true });              // pink nose
  for (const side of [1, -1]) m.ell(HX(31.95, 19.8, side * 0.45), R(0.22, 0.2, 0.28), '#2a1612', { ...hd, lo: true });
  m.ell(HX(29.3, 17.75), R(1.45, 0.8, 1.2), white, hd);                                   // chin
  for (const side of [1, -1]) m.limb(HX(31.2, 18.0), HX(29.4, 17.9, side * 1.5), 0.16 * k, 0.12 * k, black, { ...hd, caps: false, seg: 4 }); // the line of the mouth
  m.eyeAt = HX(28.7, 21.95, 2.4); m.eyePivot = neck;

  // the long, thick tail: down from the rump in a low curve, the end lifting; ringed, black-tipped
  const T = [[-20.5, 24.4], [-25, 19.6], [-28.2, 13.4], [-31.2, 8.4], [-35.2, 5.8], [-39.4, 6.6], [-42.2, 9.4]];
  const tailC = u => {
    const t = (u.x + 1) / 2;
    if (t > 0.9) return black;
    const f = t * 10.5 - Math.floor(t * 10.5);
    if (t > 0.18 && Math.abs(f - 0.5) < 0.15 + t * 0.1 && (t > 0.48 || u.y > -0.35)) return black;
    return tmp.copy(orange).lerp(white, smooth(-0.3, -0.8, u.y) * 0.6);
  };
  tube(m, T.map(q => X(q[0], q[1])), [1.85, 1.7, 1.6, 1.5, 1.45, 1.4, 1.3].map(r => r * k), tailC, { part: P.TAIL, pivot: X(-20.5, 23.5), seg: 10, sub: 6, capRings: 3 });
  return { leg: 0.42, bob: 0.35 * k, tail: 0.16, head: 0.5, sink: 24 * k };
}

// Sumatran elephant (an Asian elephant): the head is the highest point, two domes with a dent
// between; the back is arched highest in the middle and slopes away to the rump; small rounded ears
// lie flat against the head with the top edge folded over; the trunk hangs and curls forward at the
// tip, which has one finger. Pillar legs with toenails, wrinkled grey hide freckled pink on the ears,
// the base of the trunk and the forehead, and a tail with a tuft of black hair.
// Cows have only tiny tushes; bulls (tusker) have long ivory tusks, a bigger head, a heavier build.
function sumatranElephant(m, s) {
  const tk = !!s.tusker, k = s.len / 40, X = (x, y, z = 0) => [x * k, y * k, z * k];
  const hs = tk ? 1.16 : 1.06, W = tk ? 1.05 : 1;
  const HX = (x, y, z = 0) => X(20 + (x - 20) * hs, 36 + (y - 36) * hs, z * hs), R = (a, b, c) => [a * k * hs, b * k * hs, c * k * hs];
  const grey = col(s.color), dk = col(s.dark), belly = col(s.belly), pink = col('#c4a296'), nail = col('#d6cdbd'), dust = col('#8c7e6c');
  const n3 = (p, f) => hash3(Math.round(p.x / k * f), Math.round(p.y / k * f), Math.round(p.z / k * f));
  const freckle = (c, p, amt) => (amt > 0 && n3(p, 2.6) > 1 - amt ? c.lerp(pink, 0.4 + n3(p, 3.7) * 0.3) : c);
  // wrinkled hide: mottled, with fine creases running down the flanks
  const hide = (u, p) => {
    const c = tmp.copy(grey).lerp(belly, smooth(0.1, -0.7, u.y) * 0.8).multiplyScalar(0.88 + n3(p, 0.8) * 0.16);
    const f = p.x / k * 0.55 + Math.sin(p.y / k * 0.7 + p.z / k * 0.3) * 0.3;
    if (Math.abs(u.z) > 0.35 && f - Math.floor(f) < 0.12) c.multiplyScalar(0.84);
    return c;
  };
  const face = (u, p) => freckle(hide(u, p), p, smooth(31, 37, p.y / k) * smooth(22.5, 26, p.x / k) * 0.16); // freckled on the brow
  const legC = (u, p) => {
    const y = p.y / k, c = tmp.copy(grey).multiplyScalar(0.9 + n3(p, 0.9) * 0.12);
    const f = y * 0.62 + Math.sin(p.x / k * 1.3 + p.z / k * 1.1) * 0.35;
    if (y < 24 && f - Math.floor(f) < 0.17) c.multiplyScalar(0.8);
    return c.lerp(dust, smooth(8, 1, y) * 0.4);
  };

  // the barrel: deep, the back arched highest in the middle and sloping away to the rump
  const B = [[-18.5, 30.2, 6.6, 6.2], [-14.5, 30.8, 9.8, 8.8], [-6.5, 31.4, 11.6, 10.0], [2, 31.2, 11.2, 10.2], [10, 31.4, 10.2, 9.6], [15.5, 32.6, 8.0, 7.6]];
  tube(m, B.map(b => X(b[0], b[1])), B.map(b => [b[2] * k * W, b[3] * k * W]), hide, { seg: 32, sub: 10, capRings: 4 });

  // pillar legs growing out of heavy shoulders and thighs, the hind ones a little bent at the
  // knee, round feet with toenails
  for (const [x, side, part, zz] of [[12.4, 1, P.LEG_FL, 4.6], [12.4, -1, P.LEG_FR, 4.6], [-15.2, 1, P.LEG_BL, 4.4], [-15.2, -1, P.LEG_BR, 4.4]]) {
    const z = side * zz * W, hind = part >= P.LEG_BL, o = { part, pivot: X(x, 29, z) };
    // (the upper leg is broad front to back and flatter across, flowing up into the body)
    const pts = hind ? [[x + 0.6, 30], [x + 0.6, 25], [x + 0.9, 18], [x - 0.2, 11], [x, 5.5], [x + 0.2, 1.5]] : [[x, 31], [x + 0.2, 24], [x, 17], [x - 0.1, 11], [x, 5.5], [x + 0.3, 1.5]];
    const rr = hind ? [[6.2, 4.8], [6.2, 4.8], [4.8, 4.5], 3.8, 3.6, 3.95] : [[6.0, 4.6], [5.6, 4.5], [4.5, 4.3], 3.9, 3.75, 4.1];
    tube(m, pts.map(q => X(q[0], q[1], z)), rr.map(r => (Array.isArray(r) ? [r[0] * k * W, r[1] * k * W] : r * k * W)), legC, { ...o, seg: 16, sub: 7, capRings: 3, capLen: 0.35 });
    const rf = rr[5] * W;
    for (const t of hind ? [-0.5, 0, 0.5] : [-0.78, -0.26, 0.26, 0.78]) m.ell(X(x + 0.3 + Math.cos(t) * rf * 0.93, 0.95, z + Math.sin(t) * rf * 0.93), [0.6 * k, 0.7 * k, 0.75 * k], nail, { ...o, lo: true });
  }

  // head and neck (they dip a little together): a big head, the highest point of the animal
  const neck = X(14, 33), hd = { part: P.HEAD, pivot: neck };
  tube(m, [X(12, 33), HX(19.5, 36.5)], [[9.0 * k * W, 7.6 * k * W], [7.6 * k * hs, 6.6 * k * hs]], hide, { ...hd, seg: 24, sub: 4, capRings: 2 });
  // the head in one piece: twin domes on top with a dent between, a broad flat brow in front
  // running down to the trunk, heavy cheeks below
  sculpt(m, d => {
    let x = d.x * (d.x > 0 ? 5.7 : 6.6), y = d.y * 8.0, z = d.z * 6.0;
    const top = smooth(0.15, 0.85, d.y);
    y += top * (1.4 * Math.exp(-((Math.abs(d.z) - 0.4) ** 2) / 0.09) - 0.9 * Math.exp(-d.z * d.z / 0.012) - 0.3); // the domes and the dent
    z *= 1 + top * 0.22;
    x -= smooth(0.3, 0.9, d.y) * smooth(-0.2, 0.6, d.x) * 1.2;   // the brow slopes back up to them
    z *= 1 + smooth(0.1, -0.6, d.y) * 0.12;                         // the cheeks fill out below
    x += smooth(0, -0.7, d.y) * smooth(0, 0.7, d.x) * 1.0;         // and the face runs down and forward to the trunk
    return HX(21.4 + x, 36.6 + y, z);
  }, face, hd);
  m.ell(HX(25.8, 26.6), R(1.9, 1.5, 1.7), u => tmp.copy(col('#8a7874')).multiplyScalar(0.9 + u.y * 0.1), hd); // the pointed lower lip
  // small eyes in wrinkled lids
  for (const side of [1, -1]) {
    m.ell(HX(24.2, 34.5, side * 4.95), R(1.05, 0.85, 0.5), shade(s.color, -0.3), { ...hd, lo: true });
    m.ell(HX(24.4, 34.5, side * 5.15), R(0.5, 0.42, 0.32), '#1a120c', { ...hd, lo: true });
  }
  m.eyeAt = HX(24.4, 34.5, 5.2); m.eyePivot = neck;
  // ears: rounded, smaller than an African's, laid flat back against the side of the head and neck,
  // the top edge folded over, freckled pink round the edge
  for (const side of [1, -1]) {
    const ear = (u, p) => { const c = tmp.copy(grey).multiplyScalar(0.9 + n3(p, 1.1) * 0.1); return freckle(c, p, Math.hypot(u.x, u.y) > 0.7 ? 0.28 : 0); };
    const ry = side * 0.3, ez = 7.3;
    ellHi(m, HX(16.9, 35.4, side * ez), R(5.1, 5.3, 0.7), ear, { ...hd, rot: [side * 0.06, ry, 0.1] });
    ellHi(m, HX(17.9, 30.0, side * (ez - 0.3)), R(3.0, 3.8, 0.62), ear, { ...hd, rot: [side * 0.04, ry, -0.3] });
    tube(m, [HX(13.4, 36.6, side * (ez + 0.9)), HX(15.6, 40.2, side * (ez + 0.6)), HX(19.3, 40.6, side * (ez - 0.4)), HX(21.3, 38.4, side * (ez - 1.1))], [0.8, 0.85, 0.8, 0.6].map(r => r * k * hs),
      (u, p) => freckle(tmp.copy(grey).multiplyScalar(0.95), p, 0.3), { ...hd, seg: 8, sub: 3, capRings: 2 }); // the folded top edge
  }
  // the trunk: hanging from the face and curling forward at the tip, ringed with creases, pink-
  // freckled at the base; one "finger" on the upper lip of the tip
  const dx = (hs - 1) * 8;
  const TR = [[25.4, 33.6], [28.2, 26.6], [29.0, 18.5], [28.4, 11.0], [28.6, 5.6], [30.1, 3.0], [31.7, 3.7]];
  const trunk = (u, p) => {
    const t = (u.x + 1) / 2, c = tmp.copy(grey).multiplyScalar(0.9 + n3(p, 1.2) * 0.12);
    if ((t * 30) % 1 < 0.22 && t > 0.1) c.multiplyScalar(0.8);
    return freckle(c, p, (1 - smooth(0.05, 0.3, t)) * 0.3);
  };
  tube(m, TR.map(q => X(q[0] + dx * (1 + smooth(30, 10, q[1]) * 0.4), q[1])), [3.5, 3.0, 2.4, 1.95, 1.6, 1.35, 1.15].map(r => r * k * (0.94 + hs * 0.06)), trunk, { ...hd, seg: 14, sub: 8, capRings: 3, capLen: 0.6 });
  const tx = 31.7 + dx * 1.4;
  m.limb(X(tx + 0.1, 4.6), X(tx + 1.2, 5.4), 0.48 * k, 0.2 * k, grey, { ...hd, seg: 6 });                       // the finger
  m.ell(X(tx + 0.7, 4.0), [0.25 * k, 0.55 * k, 0.6 * k], '#2a2422', { ...hd, lo: true, rot: [0, 0, -0.4] });     // nostrils at the tip
  // tusks: a bull's long ivory curving forward and a little up; a cow's tushes barely show
  const ivory = u => tmp.copy(col('#e8dcc0')).lerp(col('#f6f0e2'), smooth(-0.5, 0.9, u.x));
  for (const side of [1, -1]) {
    if (tk) {
      tube(m, [HX(23.4, 31.6, side * 2.7), X(28.0 + dx, 25.0, side * 3.9), X(31.6 + dx, 22.0, side * 4.4), X(36.0 + dx, 22.6, side * 4.0)], [1.15, 1.05, 0.8, 0.36].map(r => r * k), ivory, { ...hd, seg: 10, sub: 5, capRings: 2 });
    } else m.ell(HX(26.7, 27.6, side * 2.6), R(0.6, 0.42, 0.42), ivory, { ...hd, lo: true });
  }
  // a few bristles on the crown
  for (let j = 0; j < 6; j++) { const z = (j - 2.5) * 1.3, x = 20.6 - (j % 3) * 1.4; m.limb(HX(x, 44.9 - Math.abs(z) * 0.3, z), HX(x - 0.3, 45.6 - Math.abs(z) * 0.3, z * 1.1), 0.1 * k, 0.04 * k, dk, { ...hd, caps: false, seg: 3 }); }

  // tail: hanging down the back of the rump to the hocks, a flat tuft of black hair at the end
  const tb = X(-21, 34.5), to = { part: P.TAIL, pivot: tb };
  tube(m, [X(-21.5, 35), X(-24.8, 30.5), X(-26.0, 23), X(-26.2, 17.5)], [0.95, 0.75, 0.55, 0.45].map(r => r * k), hide, { ...to, seg: 8, sub: 3, capRings: 2 });
  for (let j = 0; j < 7; j++) { const zz = (j - 3) * 0.22; m.limb(X(-26.2, 18.6, zz), X(-26.2 + (hash3(j, 2, 1) - 0.5) * 0.6, 13.6 - hash3(j, 1, 2) * 1.2, zz * 2.2), 0.24 * k, 0.07 * k, dk, { ...to, caps: false, seg: 4 }); }
  return { leg: 0.28, bob: 0.6 * k, tail: 0.3, head: 0.35, sink: 36 * k };
}

// Sumatran rhino: the smallest and hairiest rhino. Compact and round, with a big head carried low,
// a pointed prehensile upper lip, two horns (a short front one and a stub behind), small eyes,
// ears with a hairy fringe, deep folds of skin behind the shoulders and in front of the hips,
// short sturdy legs on three-toed feet; reddish-brown hide with coarse, sparse hair, longest along
// the back, and legs and belly dark with mud from the daily wallow.
function sumatranRhino(m, s) {
  const k = s.len / 30, X = (x, y, z = 0) => [x * k, y * k, z * k];
  const red = tmp.copy(col(s.color)).lerp(col('#a8724e'), 0.45).clone(), dk = col(s.dark), belly = col(s.belly), mud = col('#352820'), horn = col('#2c2420'), nail = col('#40342a');
  const rusty = col(shade(s.color, 0.12)), n3 = (p, f) => hash3(Math.round(p.x / k * f), Math.round(p.y / k * f), Math.round(p.z / k * f));
  // a slight hump over the shoulders, a dip behind, the round rump
  const B = [[-14, 16.4, 5.0, 4.6], [-10.5, 17.2, 7.0, 6.4], [-3, 16.2, 7.4, 7.0], [4, 16.6, 7.8, 6.8], [9, 16.0, 6.6, 5.6], [12.5, 15.2, 4.8, 4.2]];
  // hide: reddish brown, streaky with coarse hair, dark in the folds, mud splashed up from below
  const skin = (u, p) => {
    const x = p.x / k, y = p.y / k;
    const c = tmp.copy(red).lerp(belly, smooth(-0.2, -0.9, u.y) * 0.4).multiplyScalar(0.86 + hash3(Math.round(x * 2.4), Math.round(y * 0.9), Math.round(p.z / k * 2.4)) * 0.32);
    if (y < 21.5 && (Math.abs(x - (1.4 + (24 - y) * 0.2)) < 0.4 || Math.abs(x - (-7.0 - (24 - y) * 0.12)) < 0.36)) c.lerp(dk, 0.7); // the folds
    return c.lerp(mud, smooth(9.6 + n3(p, 0.9) * 2.2, 7.6, y) * 0.85);
  };
  tube(m, B.map(b => X(b[0], b[1])), B.map(b => [b[2] * k, b[3] * k]), skin, { seg: 30, sub: 10, capRings: 4 });
  // the skin folds stand proud down the flanks: one behind the shoulders running down toward the
  // forelegs, one in front of the hips
  for (const side of [1, -1]) {
    for (const [x0, x1, t0, t1] of [[1.9, 4.0, 0.62, 2.45], [-7.6, -8.6, 0.6, 2.3]]) {
      const pts = [];
      for (let j = 0; j <= 5; j++) { const t = j / 5, th = t0 + t * (t1 - t0); pts.push(X(...onProfile(B, x0 + (x1 - x0) * t * t, side * th, 1.02))); }
      tube(m, pts, pts.map((_, j) => (0.42 - j * 0.03) * k), skin, { seg: 6, sub: 3, capRings: 2 });
    }
  }
  // coarse, sparse hair: longest along the back, where it falls down the sides
  const ginger = col('#b47a4a'), hairC = (u, p) => tmp.copy(red).lerp(ginger, 0.35 + hash3(Math.round(p.x / k * 3), 4, Math.round(p.z / k * 3)) * 0.55).multiplyScalar(1.12).lerp(mud, smooth(11, 8, p.y / k) * 0.7);
  for (let j = 0; j < 120; j++) {
    const x = -13.4 + hash3(j, 1, 7) * 25.5, th = (hash3(j, 2, 7) - 0.5) * 2 * (0.15 + 1.85 * hash3(j, 3, 7) ** 1.5);
    const b = onProfile(B, x, th, 0.96), ny = Math.cos(th), nz = Math.sin(th), back = Math.abs(th) < 0.75;
    const l = (back ? 3.3 : 2.0) * (0.65 + hash3(j, 4, 7) * 0.7);
    // (lying close along the hide, falling down the sides, lifting a little off it)
    // (each strand lifts off the hide, then droops)
    const d = [-0.3 + (hash3(j, 5, 7) - 0.5) * 0.5, ny * 0.6 - 0.45, nz * 0.95], mid = [b[0] + d[0] * l * 0.5, b[1] + d[1] * l * 0.5, b[2] + d[2] * l * 0.5];
    m.limb(X(...b), X(...mid), (back ? 0.42 : 0.32) * k, 0.22 * k, hairC, { caps: false, seg: 4 });
    m.limb(X(...mid), X(mid[0] + d[0] * l * 0.4, mid[1] - l * 0.5, mid[2] + d[2] * l * 0.3), 0.2 * k, 0.04 * k, hairC, { caps: false, seg: 4 });
  }

  // legs: short and sturdy, the thighs and shoulders heavy, three toes on each round foot, muddy
  const legC = (u, p) => {
    const y = p.y / k, c = tmp.copy(red).multiplyScalar(0.78 + hash3(Math.round(p.x / k * 2.4), Math.round(y * 0.9), Math.round(p.z / k * 2.4)) * 0.3);
    return c.lerp(mud, smooth(9.5 + n3(p, 0.8) * 2.5, 6.5, y) * 0.92);
  };
  for (const [x, side, part, zz] of [[6.2, 1, P.LEG_FL, 3.7], [6.2, -1, P.LEG_FR, 3.7], [-10.3, 1, P.LEG_BL, 3.9], [-10.3, -1, P.LEG_BR, 3.9]]) {
    const z = side * zz, hind = part >= P.LEG_BL, o = { part, pivot: X(x, 16.5, z) };
    const pts = hind ? [[x + 0.3, 15], [x + 0.6, 13], [x + 1.3, 10.2], [x - 0.3, 5.2], [x + 0.2, 1.6]] : [[x, 14.5], [x - 0.1, 13], [x + 0.4, 10], [x + 0.3, 5], [x + 0.5, 1.6]];
    const rr = hind ? [[3.6, 2.2], [3.9, 2.8], [3.3, 2.95], 2.45, 2.7] : [[3.3, 2.1], [3.6, 2.7], [3.0, 2.85], 2.5, 2.75];
    tube(m, pts.map(q => X(q[0], q[1], z)), rr.map(r => (Array.isArray(r) ? [r[0] * k, r[1] * k] : r * k)), legC, { ...o, seg: 14, sub: 6, capRings: 3, capLen: 0.4 });
    // three blunt toes, each a broad lobe merged into the front of the round foot
    for (const t of [-0.75, 0, 0.75]) m.ell(X(x + 0.5 + Math.cos(t) * 2.0, 0.75, z + Math.sin(t) * 2.0), [(t ? 1.0 : 1.15) * k, 0.75 * k, (t ? 0.85 : 0.95) * k], nail, { ...o, lo: true, rot: [0, -t, 0] });
  }

  // the head, big and carried low: one long tapering piece angled down to the nose
  const neck = X(10, 16.4), hd = { part: P.HEAD, pivot: neck };
  tube(m, [X(8.5, 16.6), X(14.5, 15.2)], [[5.9 * k, 5.2 * k], [4.6 * k, 4.0 * k]], skin, { ...hd, seg: 22, sub: 4, capRings: 2 });
  // a fold of skin round the neck
  for (const side of [1, -1]) { const pts = []; for (let j = 0; j <= 5; j++) { const th = 0.5 + j / 5 * 2.0; pts.push(X(11.6 + j * 0.15, 15.9 + Math.cos(th) * 5.1, side * Math.sin(th) * 4.45)); } tube(m, pts, pts.map(() => 0.38 * k), skin, { ...hd, seg: 6, sub: 3, capRings: 2 }); }
  const head = (u, p) => tmp.copy(red).multiplyScalar(0.78 + hash3(Math.round(p.x / k * 2.6), Math.round(p.y / k * 2.6), Math.round(p.z / k * 2.6)) * 0.26).lerp(mud, smooth(10.5, 8, p.y / k) * 0.6);
  const ca = Math.cos(-0.33), sa = Math.sin(-0.33), HP = (lx, ly, lz) => X(17.6 + lx * ca - ly * sa, 14.4 + lx * sa + ly * ca, lz);
  sculpt(m, d => {
    const t = d.x, ry = 3.9 * (1 - 0.32 * smooth(-0.2, 1, t)), rz = 3.4 * (1 - 0.3 * smooth(-0.2, 1, t));
    return HP(t * (t > 0 ? 7.4 : 4.4), d.y * ry, d.z * rz);
  }, head, hd);
  m.ell(X(21.0, 10.5), [3.4 * k, 1.6 * k, 2.2 * k], head, { ...hd, rot: [0, 0, -0.2] });        // jaw
  m.ell(X(23.6, 9.6), [1.2 * k, 0.8 * k, 1.1 * k], shade(s.color, -0.35), hd);                   // lower lip
  m.ell(X(24.4, 10.4), [1.45 * k, 1.15 * k, 1.15 * k], shade(s.color, -0.25), hd);               // the pointed, grasping upper lip
  m.limb(X(25.0, 10.1), X(25.9, 9.0), 0.75 * k, 0.25 * k, shade(s.color, -0.3), { ...hd, seg: 6 });
  for (const side of [1, -1]) m.ell(X(24.35, 11.7, side * 0.85), [0.35 * k, 0.42 * k, 0.28 * k], '#140e0a', { ...hd, lo: true }); // nostrils
  // horns: a short front horn on the nose, a stub behind it
  tube(m, [X(23.0, 14.0), X(23.7, 16.4), X(23.5, 18.3), X(22.7, 19.7)], [1.9, 1.25, 0.65, 0.18].map(r => r * k), u => tmp.copy(horn).lerp(col('#4a3e34'), smooth(0.4, -0.8, u.x) * 0.6), { ...hd, seg: 10, sub: 4, capRings: 2 });
  m.ell(X(20.0, 16.9), [1.4 * k, 0.95 * k, 1.1 * k], horn, { ...hd, rot: [0, 0, -0.3] });
  // small eyes in wrinkles
  for (const side of [1, -1]) {
    m.ell(X(19.8, 14.3, side * 2.75), [0.8 * k, 0.6 * k, 0.4 * k], shade(s.color, -0.4), { ...hd, lo: true });
    m.ell(X(19.95, 14.3, side * 2.92), [0.4 * k, 0.36 * k, 0.3 * k], '#120c08', { ...hd, lo: true });
  }
  m.eyeAt = X(20, 14.3, 3.0); m.eyePivot = neck;
  // ears: upright and rounded, fringed with long dark hair
  for (const side of [1, -1]) {
    const b0 = [15.4, 17.6, side * 2.3], tip = [14.7, 21.5, side * 3.4];
    m.limb(X(...b0), X(...tip), 1.3 * k, 0.6 * k, head, hd);
    m.ell(X(15.25, 19.8, side * 2.95), [0.35 * k, 1.4 * k, 0.7 * k], shade(s.color, -0.45), { ...hd, lo: true, rot: [side * -0.25, 0, 0.18] }); // the dark inside
    for (let j = 0; j < 5; j++) { // the fringe: long hair off the rim and the tip, falling outward
      const t = 0.55 + j / 4 * 0.45, f = j % 2 ? 1 : -1, p0 = [b0[0] + (tip[0] - b0[0]) * t + f * 0.5 * (1 - t), b0[1] + (tip[1] - b0[1]) * t, b0[2] + (tip[2] - b0[2]) * t];
      m.limb(X(...p0), X(p0[0] + f * 0.4 - 0.5, p0[1] + 0.2 + (t - 0.6) * 1.2, p0[2] + side * 1.3), 0.3 * k, 0.06 * k, hairC, { ...hd, caps: false, seg: 4 });
    }
  }
  // tail: short and thin, with a dark tuft
  const tb = X(-14.2, 19.5), to = { part: P.TAIL, pivot: tb };
  tube(m, [X(-14.6, 20.6), X(-16.6, 16.8), X(-17.0, 12.6)], [0.7, 0.5, 0.4].map(r => r * k), skin, { ...to, seg: 8, sub: 3, capRings: 2 });
  for (let j = 0; j < 6; j++) m.limb(X(-17, 13.4, (j - 2.5) * 0.18), X(-17 + (hash3(j, 3, 3) - 0.5) * 0.8, 10.6 - hash3(j, 4, 3), (j - 2.5) * 0.35), 0.22 * k, 0.06 * k, dk, { ...to, caps: false, seg: 4 });
  return { leg: 0.34, bob: 0.35 * k, tail: 0.3, head: 0.55, sink: 20 * k };
}

// Lesser mouse-deer (kanchil): a tiny hoofed animal the size of a rabbit, hunched with its rump
// higher than its shoulders, on legs as thin as pencils; a small pointed head with big dark eyes and
// rounded ears, orange-brown above and white below, and the white-and-brown stripes running down
// its throat from the chin.
function mouseDeer(s) {
  const L = s.len, H = L * 0.42, leg = L * 0.34, by = leg + H * 0.5, white = col(s.belly), brown = col(shade(s.color, -0.2));
  const back = grad(shade(s.color, -0.12), s.belly, -0.35, 0.4);
  // (the throat stripes, laid out in world space so they run on from the chin down the neck)
  const nx = L * 0.3, ny = by + H * 0.05, hx = L * 0.5, hy = by + H * 0.45;
  const throat = base => (u, p) => {
    if (p.x < nx - H * 0.1) return base(u);
    const t = Math.min(1, Math.max(0, (p.x - nx) / (hx - nx))), under = p.y < ny + (hy - ny) * t - H * 0.12;
    if (!under) return base(u);
    const az = Math.abs(p.z);
    return az < H * 0.05 ? white : az < H * 0.1 ? brown : az < H * 0.17 ? white : base(u);
  };
  return {
    H, leg, wide: 0.86, hip: 0.26, shoulder: -0.05, haunch: 1.12, chest: 0.82, sag: -0.08, legR0: H * 0.12, legR1: H * 0.035, legColor: shade(s.color, -0.15), hoof: '#1e1612', neckR: H * 0.2,
    coat: () => throat(back), headPaint: throat(u => (u.y < -0.35 ? white : back(u))),
    head: [L * 0.49, by + H * 0.42], headR: [H * 0.3, H * 0.21, H * 0.19], snout: H * 0.26, muzzle: shade(s.color, -0.25), eyeR: H * 0.06,
    ears: 'point', ear: H * 0.2, earW: 0.55, earOut: 0.45, earBack: 0.3, earColor: shade(s.color, -0.25),
    tail: (m, b) => m.ell([-L * 0.47, b.by + H * 0.12, 0], [H * 0.09, H * 0.16, H * 0.07], u => (u.x > 0.1 ? white : col(s.color)), { part: P.TAIL, pivot: [-L * 0.45, b.by + H * 0.2, 0], rot: [0, 0, -0.5] }),
  };
}

const MAMMALS = {
  deer: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    return {
      H, leg, legR0: H * 0.12, legR1: H * 0.055, hoof: '#2a211a', neckR: H * (s.neckWidth ?? 0.17), neckColor: s.neck,
      head: [L * 0.5, by + H * 0.95], headR: [H * 0.3, H * 0.24, H * 0.21], snout: H * 0.28,
      ears: 'point', ear: H * 0.34, earOut: 0.8, earBack: 0.1, earW: 0.3, headColor: s.neck ? s.neck : null,
      extra: s.rump ? (m, b) => m.ell([-L * 0.33, b.by + H * 0.08, 0], [L * 0.12, H * 0.34, H * 0.36], s.rump) : null,
      tail: (m, b) => m.ell([-L * 0.45, b.by + H * 0.28, 0], [H * 0.12, H * 0.2, H * 0.1], s.rump || shade(s.belly, 0.4), { part: P.TAIL, pivot: [-L * 0.42, b.by + H * 0.35, 0], rot: [0, 0, -0.5] }),
      antlers: s.antlers ? (m, hp, hr, hd) => {
        for (const side of [1, -1]) {
          const z = side * hr[2] * 0.5, base = [hp[0] - hr[0] * 0.3, hp[1] + hr[1] * 0.7, z];
          const r = H * 0.05, bone = '#cdb994', tip = '#efe6d0';
          const point = (x, y, spread) => [base[0] + H * x, base[1] + H * y, z + side * H * spread];
          const branch = (a, b, thick = 0.7) => m.limb(a, b, r * thick, r * 0.16, tip, { ...hd, caps: false });
          if (s.antlers === 'mule') {
            // Black-tailed bucks: the rack forks, rather than having tines along one beam.
            const stem = point(-0.12, 0.35, 0.2);
            m.limb(base, stem, r, r * 0.8, bone, hd);
            for (const x of [-0.38, 0.18]) {
              const fork = point(x, 0.7, 0.4);
              m.limb(stem, fork, r * 0.8, r * 0.5, bone, hd);
              branch(fork, point(x - 0.17, 1.03, 0.48));
              branch(fork, point(x + 0.15, 1.0, 0.58));
            }
            continue;
          }
          if (s.antlers === 'whitetail' || s.antlers === 'sambar') {
            // White-tailed racks curl forward; sambar stags have a simple three-point rack.
            const white = s.antlers === 'whitetail';
            const beam = white ? [point(-0.15, 0.3, 0.25), point(-0.12, 0.56, 0.48), point(0.22, 0.65, 0.55), point(0.52, 0.56, 0.42)]
              : [point(-0.14, 0.35, 0.18), point(-0.33, 0.72, 0.3), point(-0.48, 1.02, 0.34)];
            let prev = base;
            beam.forEach((pt, n) => { m.limb(prev, pt, r * (1 - n * 0.18), r * (0.8 - n * 0.18), bone, hd); prev = pt; });
            branch(beam[0], point(0.23, 0.55, 0.18));
            if (white) for (const n of [1, 2]) branch(beam[n], [beam[n][0], beam[n][1] + H * 0.4, beam[n][2] + side * H * 0.05]);
            else branch(beam[1], point(-0.08, 1.0, 0.42));
            continue;
          }
          const beam = [[base[0] - H * 0.12, base[1] + H * 0.35, z + side * H * 0.22], [base[0] - H * 0.38, base[1] + H * 0.7, z + side * H * 0.42],
            [base[0] - H * 0.66, base[1] + H * 0.95, z + side * H * 0.5], [base[0] - H * 0.9, base[1] + H * 1.05, z + side * H * 0.42]];
          let prev = base;
          beam.forEach((pt, n) => { m.limb(prev, pt, r * (1 - n * 0.12), r * (0.9 - n * 0.14), n === 3 ? tip : bone, hd); prev = pt; });
          // brow tine forward, then upswept tines along the beam
          m.limb(beam[0], [beam[0][0] + H * 0.32, beam[0][1] + H * 0.1, beam[0][2] + side * H * 0.05], r * 0.7, r * 0.2, tip, { ...hd, caps: false });
          for (const n of [1, 2, ...(s.antlers === 'elk' ? [3] : [])]) m.limb(beam[n], [beam[n][0] + H * 0.08, beam[n][1] + H * 0.36, beam[n][2] + side * H * 0.04], r * 0.65, r * 0.18, tip, { ...hd, caps: false });
        }
      } : null,
    };
  },
  canine: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    // a gray fox: grizzled grey above, rust along the neck and flanks, a white throat, big ears,
    // and a bushy tail with a black stripe down the top and a black tip
    const fox = !!s.fox, rust = col(s.dark), black = col('#1e1a18'), white = col(s.belly);
    const grizzle = c => u => tmp.copy(c(u)).multiplyScalar(0.9 + hash3(Math.round(u.x * 20), Math.round(u.y * 10), Math.round(u.z * 10)) * 0.16);
    return {
      H, leg, legR0: H * 0.18, legR1: H * 0.1, neckR: H * 0.28, legColor: fox ? shade(s.dark, -0.1) : shade(s.color, -0.12), paws: true,
      coat: fox ? b => grizzle(u => u.y < -0.3 && u.y > -0.62 ? rust : b(u)) : null,
      head: [L * 0.52, by + H * 0.5], headR: [H * 0.34, H * 0.3, H * 0.27], snout: H * (fox ? 0.32 : 0.36),
      ears: 'point', ear: H * (fox ? 0.46 : 0.38), earW: fox ? 0.38 : 0.32, earOut: 0.15, earBack: 0.05, muzzle: grad(s.color, s.belly, -0.1, 0.4),
      face: fox ? (m, hp, hr, hd) => {
        m.ell([hp[0] + hr[0] * 0.35, hp[1] - hr[1] * 0.55, 0], [hr[0] * 0.55, hr[1] * 0.45, hr[2] * 0.75], s.belly, hd); // white throat
        for (const side of [1, -1]) m.ell([hp[0] + hr[0] * 0.95, hp[1] - hr[1] * 0.2, side * hr[2] * 0.42], [hr[0] * 0.3, hr[1] * 0.1, hr[2] * 0.12], black, { ...hd, lo: true }); // dark muzzle line
      } : null,
      tail: (m, b) => {
        const o = { part: P.TAIL, pivot: [-L * 0.42, b.by + H * 0.15, 0] };
        if (fox) {
          const brush = u => u.x < -0.75 ? black : u.y > 0.55 ? black : u.y < -0.4 ? rust : grad(s.color, s.belly)(u);
          m.ell([-L * 0.62, b.by - H * 0.02, 0], [L * 0.28, H * 0.26, H * 0.26], grizzle(brush), { ...o, rot: [0, 0, 0.5] });
          return;
        }
        m.ell([-L * 0.58, b.by - H * 0.1, 0], [L * 0.24, H * 0.2, H * 0.2], grad(s.color, s.belly), { ...o, rot: [0, 0, 0.75] });
        m.ell([-L * 0.72, b.by - H * 0.42, 0], [H * 0.17, H * 0.14, H * 0.14], s.dark, { ...o, lo: true });
      },
    };
  },
  feline: s => {
    // Jaguars carry their bulk in the chest and thighs, with tapered wrists and compact paws.
    // Lionesses keep lion proportions and a tail tuft without inheriting a jaguar's stocky build.
    const lion = !!(s.lion || s.mane), k = s.stocky && !lion ? 1 : 0;
    const L = s.len, H = s.h * (1 + k * 0.08), leg = s.leg * (lion ? 0.95 : 0.85), by = leg + H * 0.5;
    const hs = lion ? (s.mane ? 1.1 : 1) : 1 + k * 0.18;
    // (The Sumatran tiger, stripes, has a builder of its own: see tiger.)
    // Sunda clouded leopard (clouds): long and low, dark-rimmed cloud blotches, a huge thick ringed tail.
    // Leopard cat (spotted): small, tawny with solid black spots and dark lines over the head.
    const dk = col(s.dark), base = grad(s.color, s.belly || s.color, -0.3, 0.5);
    const coat = s.clouds ? b => cloudCoat(b, s.dark, H * 0.42) : null;
    const legColor = s.clouds ? (u, p) => { const [gap, id] = cells(p, H * 0.16); return gap > 0.36 && id > 0.25 ? dk : col(shade(s.color, -0.05)); }
      : s.spotted ? (u, p) => (hash3(Math.round(p.x * 1.4), Math.round(p.y * 1.4), Math.round(p.z * 1.4)) > 0.78 ? dk : col(shade(s.color, 0.05)))
      : k ? (u, p) => { const [gap, id] = cells(p, H * 0.18); return gap > 0.43 && id > 0.25 ? dk : col(s.color); } : null;
    const ring = (w, f) => (u, p) => (Math.sin(p.x * 2 * Math.PI / (H * w)) > 0.35 ? tmp.copy(col(s.color)).lerp(dk, f) : col(s.color));
    return {
      H, leg, wide: lion && !s.mane ? 0.94 : 1, chest: 1 + k * 0.07,
      shoulder: lion ? 0.09 : 0.04, haunch: lion ? 0.94 : 1, sag: lion ? 0.01 : 0.04,
      legR0: H * (lion ? (s.mane ? 0.19 : 0.18) : k ? 0.205 : s.cheetah ? 0.16 : 0.22),
      legR1: H * (lion ? 0.085 : k ? 0.09 : s.cheetah ? 0.09 : 0.14),
      neckR: H * (lion ? 0.25 : 0.3 + k * 0.04), spots: s.bobtail ? shade(s.color, -0.45) : null, dots: s.cheetah ? [s.dark, 9, 0.2] : s.spotted ? [s.dark, 11, 0.21] : null, rosettes: s.rosettes,
      coat, legColor, fine: s.clouds, legRings: legColor ? 8 : undefined,
      paws: true, toes: true, smoothLegs: true, // soft, articulated paws
      head: [L * 0.5, by + H * (lion ? 0.3 : 0.38 - k * 0.1)], headR: [H * (lion ? 0.4 : 0.36) * hs, H * (lion ? 0.29 : 0.33) * hs, H * (lion ? 0.3 : 0.34) * hs], snout: H * (lion ? 0.19 : 0.15) * hs,
      nose: lion ? false : undefined, eyeR: lion ? H * 0.038 : undefined,
      ears: lion ? 'none' : s.bobtail ? 'point' : 'round', ear: H * (s.bobtail ? 0.2 : k ? 0.18 : s.rosettes || s.cheetah ? 0.27 : s.clouds ? 0.22 : 0.24), earOut: 0.2, earBack: 0.1, earW: s.bobtail ? 0.55 : 0.45, tufts: s.bobtail, muzzle: grad(s.color, s.belly, 0.1, 0.4),
      earColor: null,
      headPaint: s.clouds ? (u, p) => { const [gap, id] = cells(p, H * 0.1); return gap > 0.4 && id > 0.3 && u.y > -0.3 ? dk : base(u); } : null,
      extra: (m, b) => {
        // Rounded scapulae and haunches meet the upper limbs inside the coat.
        for (const side of [-1, 1]) {
          m.ell([L * 0.24, b.by - H * 0.1, side * H * (lion || k ? 0.18 : 0.23)], [H * 0.25, H * 0.36, H * 0.19], b.coat);
          m.ell([-L * 0.25, b.by - H * 0.13, side * H * (lion || k ? 0.19 : 0.23)], [H * 0.31, H * 0.35, H * 0.2], b.coat);
        }
      },
      face: (m, hp, hr, hd) => {
        if (lion) {
          // A low brow and a broad, flat nose keep the longer muzzle feline.
          for (const side of [-1, 1]) {
            m.ell([hp[0] + hr[0] * 0.37, hp[1] + hr[1] * 0.5, side * hr[2] * 0.74], [H * 0.12, H * 0.022, H * 0.07], s.color, { ...hd, rot: [0, 0, -0.16] });
            m.ell([hp[0] - hr[0] * 0.3, hp[1] + hr[1] * 0.86, side * hr[2] * 0.83], [H * 0.065, H * 0.09, H * 0.075], shade(s.mane || s.color, -0.25), hd);
            m.ell([hp[0] - hr[0] * 0.2, hp[1] + hr[1] * 0.87, side * hr[2] * 0.84], [H * 0.04, H * 0.065, H * 0.055], s.color, hd);
          }
          const noseX = hp[0] + hr[0] * 0.78 + H * 0.19 * hs * 1.18;
          m.ell([noseX, hp[1] - hr[1] * 0.17, 0], [H * 0.045, H * 0.04, H * 0.078], '#34251d', hd);
          m.limb([noseX, hp[1] - hr[1] * 0.28, 0], [noseX - H * 0.025, hp[1] - hr[1] * 0.49, 0], H * 0.013, H * 0.01, '#34251d', { ...hd, caps: false });
        }
        for (const side of [-1, 1]) m.ell([hp[0] + hr[0] * 0.9, hp[1] - hr[1] * 0.3, side * hr[2] * 0.24], [hr[0] * 0.33, hr[1] * 0.24, hr[2] * 0.34], s.belly || s.color, hd);
        m.ell([hp[0] + hr[0] * 0.7, hp[1] - hr[1] * 0.65, 0], [hr[0] * 0.4, hr[1] * 0.14, hr[2] * 0.39], s.belly || s.color, hd);
        const markings = s.spotted ? (m, hp, hr, hd) => {
          // two dark lines running back over the crown from between the eyes, white streaks beside them
          for (const z of [-0.18, 0.18]) m.limb([hp[0] + hr[0] * 0.55, hp[1] + hr[1] * 0.62, z * hr[2]], [hp[0] - hr[0] * 0.75, hp[1] + hr[1] * 0.72, z * hr[2] * 1.6], hr[1] * 0.07, hr[1] * 0.07, s.dark, hd);
          for (const side of [1, -1]) m.limb([hp[0] + hr[0] * 0.75, hp[1] + hr[1] * 0.45, side * hr[2] * 0.42], [hp[0] + hr[0] * 0.2, hp[1] + hr[1] * 0.85, side * hr[2] * 0.42], hr[1] * 0.06, hr[1] * 0.05, s.belly, hd);
        } : s.mane ? (m, hp, hr, hd) => {
          // One swept ruff, with a scalloped fringe and a longer dark throat/chest.
          // Deform the surface rather than stacking spherical tufts around the face.
          const ruff = SPH_HI.clone(), positions = ruff.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
            const angle = Math.atan2(z, y), fringe = 1 + 0.075 * Math.sin(angle * 11 + x * 5) + 0.035 * Math.cos(angle * 17 - x * 3);
            const rear = 1 - smooth(-0.9, 0.35, x), beard = Math.max(0, -y);
            positions.setXYZ(i, x - rear * 0.28 - beard * 0.12, y * fringe - rear * 0.25 - beard * 0.22, z * fringe * (1 - rear * 0.18));
          }
          ruff.computeVertexNormals();
          const mane = u => {
            const edge = smooth(-0.3, 0.8, u.x) * smooth(-0.8, 0.4, u.y);
            return tmp.copy(col(s.mane)).lerp(col(s.color), edge * 0.48).multiplyScalar(0.88 + 0.1 * Math.sin(Math.atan2(u.z, u.y) * 11 + u.x * 5));
          };
          m.add(ruff, place([hp[0] - H * 0.5, hp[1] - H * 0.04, 0], [0, 0, 0], [H * 0.65, H * 0.49, H * 0.5]), mane, hd);
          ruff.dispose();
          for (const side of [-1, 1]) {
            locks(m, [hp[0] - H * 0.88, hp[1] - H * 0.1, side * H * 0.34], [hp[0] - H * 0.3, hp[1] - H * 0.28, side * H * 0.4], 10, H * 0.25, H * 0.065, shade(s.mane, 0.03), hd, 7, [-0.35, -1, side * 0.12]);
            locks(m, [hp[0] - H * 0.68, hp[1] - H * 0.49, side * H * 0.14], [hp[0] - H * 0.31, hp[1] - H * 0.42, side * H * 0.18], 6, H * 0.24, H * 0.07, shade(s.mane, -0.15), hd, 11, [-0.25, -1, 0]);
          }
        } : s.cheetah ? (m, hp, hr, hd) => {
          // cheetah: black "tear" lines from the eyes to the mouth
          for (const side of [1, -1]) m.limb([hp[0] + hr[0] * 0.5, hp[1] + hr[1] * 0.1, side * hr[2] * 0.62], [hp[0] + hr[0] * 0.95, hp[1] - hr[1] * 0.45, side * hr[2] * 0.42], hr[1] * 0.06, hr[1] * 0.05, s.dark, { ...hd, caps: false });
        } : null;
        if (markings) markings(m, hp, hr, hd);
      },
      tail: (m, b) => {
        const base = [-L * 0.42, b.by + H * 0.15, 0], o = { part: P.TAIL, pivot: base };
        if (s.bobtail) { m.ell([-L * 0.47, b.by + H * 0.22, 0], [H * 0.2, H * 0.12, H * 0.12], s.color, { ...o, rot: [0, 0, 0.5] }); return; }
        const tl = s.clouds ? 1.45 : s.spotted ? 0.85 : s.stocky ? 0.72 : 1;
        const r = H * (s.clouds ? 0.18 : lion ? 0.065 : 0.105);
        const end = [-L * (0.42 + 0.53 * tl), b.by - H * (s.clouds ? 0.32 : 0.2), 0];
        const paint = s.clouds ? ring(0.55, 0.85) : s.spotted || s.cheetah ? ring(0.4, 0.65) : s.color;
        tube(m, [base, [-L * (0.42 + 0.15 * tl), b.by - H * 0.08, 0],
          [-L * (0.42 + 0.32 * tl), b.by - H * 0.35, 0],
          [-L * (0.42 + 0.45 * tl), b.by - H * 0.36, 0], end],
          [r, r * 0.98, r * 0.9, r * 0.8, r * 0.65], paint, { ...o, sub: 5, seg: 12 });
        if (lion) m.ell(end, [r * 1.9, r * 1.05, r * 1.15], s.dark, { ...o, rot: [0, 0, 0.35] });

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
    if (s.civet) return civet(s);
    if (s.opossum || s.coati) return longSnoutedMammal(s);
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
        // the furred root of the tail, running down from the rump to the paddle (without it the
        // paddle floated free below and behind the body)
        tube(m, [base, [-L * 0.46, b.by - H * 0.42, 0], [-L * 0.5, H * 0.28, 0]], [H * 0.17, H * 0.13, H * 0.09], shade(s.color, -0.15), { part: P.TAIL, pivot: base, seg: 8, sub: 2, capRings: 2 });
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
    if (s.beard) return beardedPig(s, L, H, leg, by);
    return {
      H, leg, hip: -0.02, shoulder: 0.12, chest: 1.08, haunch: 0.92, legR0: H * 0.14, legR1: H * 0.07, legColor: shade(s.color, -0.3), hoof: '#1a1614', neckR: H * 0.36,
      coat: base => u => {
        const cx = u.x - 0.46 - u.y * 0.12; // a thin band slanting back from the throat over the shoulders
        if (s.collar && Math.abs(cx) < 0.045 && u.y > -0.55) return col(s.collar);
        const c = base(u); return tmp.copy(c).multiplyScalar(0.85 + hash3(Math.round(u.x * 24), Math.round(u.y * 10), Math.round(u.z * 10)) * 0.3);
      },
      head: [L * 0.5, by - H * 0.02], headR: [H * 0.34, H * 0.26, H * 0.23], snout: H * 0.26, muzzle: shade(s.color, -0.1), nose: false,
      face: (m, hp, hr, hd, sn) => m.ell([sn[0] + H * 0.34, sn[1], 0], [H * 0.035, H * 0.1, H * 0.1], '#5a4440', hd),
      ears: 'point', ear: H * 0.22, earOut: 0.35, earW: 0.45,
    };
  },
  // Agouti: a big-eyed rodent up on thin legs, rump high and rounded, no visible tail.
  agouti: s => {
    if (s.mousedeer) return mouseDeer(s);
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
      head: [L * 0.55, by + H * 0.72], headR: [H * 0.24, H * 0.2, H * 0.17], snout: H * 0.04, muzzle: light, nose: false,
      ears: 'point', ear: H * 0.27, earOut: 0.3, earBack: 0.1, earW: 0.3, earColor: s.color,
      face: (m, hp, hr, hd) => {
        m.limb([L * 0.3, by + H * 0.52, 0], [hp[0] - hr[0] * 0.6, hp[1] + hr[1] * 0.9, 0], H * 0.07, H * 0.05, u => (Math.sin(u.y * 8) > 0 ? dark : light), hd); // the mane
        // a long horse face angled down, thin stripes across the bridge, ending in a soft dark muzzle
        const a = -0.62, c = Math.cos(a), sn = Math.sin(a), at = d => [hp[0] + c * d, hp[1] + sn * d, 0];
        m.ell(at(H * 0.24), [H * 0.3, H * 0.15, H * 0.13], u => (u.x < 0.55 && Math.sin(u.x * 13) > 0.35 ? dark : light), { ...hd, rot: [0, 0, a] });
        const nose = col('#3a2e2a'), soft = u => tmp.copy(light).lerp(nose, smooth(-0.6, 0.3, u.x)); // fading from white into the dark nose
        m.ell(at(H * 0.45), [H * 0.13, H * 0.125, H * 0.115], soft, { ...hd, rot: [0, 0, a] });
        const tip = at(H * 0.55);
        for (const side of [1, -1]) { // dark eyes set into the side of the head
          m.ell([hp[0] + hr[0] * 0.35, hp[1] + hr[1] * 0.15, side * hr[2] * 0.92], [H * 0.04, H * 0.04, H * 0.025], '#15110e', { ...hd, lo: true });
          m.ell([hp[0] + hr[0] * 0.42, hp[1] + hr[1] * 0.25, side * hr[2] * 1.02], [H * 0.012, H * 0.012, H * 0.008], '#f4f2ea', { ...hd, lo: true });
        }
        for (const side of [1, -1]) m.ell([tip[0], tip[1] + H * 0.01, side * H * 0.045], [H * 0.015, H * 0.022, H * 0.02], '#141010', { ...hd, lo: true });
      },
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
        const a = Math.atan2(f1[1] - f0[1], f1[0] - f0[0]), len = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]);
        const at = d => [f0[0] + Math.cos(a) * d, f0[1] + Math.sin(a) * d, 0], faceC = tmp.copy(col(s.color)).lerp(dark, 0.55).clone();
        // one long, deep face overlapping the skull, darkening toward the front, with a slightly wider
        // nose filling out its end (flush with it, not a knob on the tip)
        m.ell(at(len * 0.4), [len * 0.7, H * 0.2, H * 0.165], u => tmp.copy(faceC).lerp(dark, smooth(0.3, 0.85, u.x)), { ...hd, rot: [0, 0, a] });
        m.ell(at(len * 0.88), [H * 0.14, H * 0.165, H * 0.175], dark, { ...hd, rot: [0, 0, a] });
        const tip = at(len * 0.88 + H * 0.13);
        for (const side of [1, -1]) m.ell([tip[0], tip[1] + H * 0.01, side * H * 0.06], [H * 0.018, H * 0.026, H * 0.024], '#0a0a0a', { ...hd, lo: true }); // nostrils
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
  // (The Sumatran rhino, hairy, has a builder of its own: see sumatranRhino.)
  rhino: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    const hide = base => u => tmp.copy(base(u)).multiplyScalar(0.92 + hash3(Math.round(u.x * 14), Math.round(u.y * 7), Math.round(u.z * 7)) * 0.12);
    return {
      H, leg, wide: 1.15, hip: 0.06, shoulder: 0.1, chest: 1.05, legR0: H * 0.2, legR1: H * 0.15, hoof: '#2a2826', straight: true, neckR: H * 0.36, coat: hide,
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
  // (The Sumatran elephant, asian, has a builder of its own: see sumatranElephant.)
  elephant: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    const hide = base => u => tmp.copy(base(u)).multiplyScalar(0.94 + hash3(Math.round(u.x * 18), Math.round(u.y * 9), Math.round(u.z * 9)) * 0.1);
    return {
      H, leg, wide: 1.12, hip: 0.02, shoulder: 0.1, chest: 1.05, legR0: H * 0.18, legR1: H * 0.16, paws: true, nails: true, straight: true, smoothLegs: true, neckR: H * 0.4, coat: hide,
      head: [L * 0.5, by + H * 0.25], headR: [H * 0.38, H * 0.4, H * 0.34], snout: H * 0.1, nose: false,
      ears: 'none',
      face: (m, hp, hr, hd) => {
        // A continuous taper hangs from the forehead and curls forward at the tip.
        const t0 = [hp[0] + hr[0] * 0.75, hp[1] - hr[1] * 0.2, 0], t1 = [t0[0] + H * 0.14, t0[1] - H * 0.5, 0], t2 = [t1[0] + H * 0.02, t1[1] - H * 0.45, 0], t3 = [t2[0] + H * 0.1, t2[1] - H * 0.2, 0];
        tube(m, [t0, t1, t2, t3, [t3[0] + H * 0.055, t3[1] + H * 0.075, 0]], [H * 0.15, H * 0.1, H * 0.07, H * 0.045, H * 0.025], hide(solid(s.color)), { ...hd, sub: 6, seg: 16 });
        for (const side of [1, -1]) {
          tube(m, [[hp[0] + hr[0] * 0.55, hp[1] - hr[1] * 0.45, side * hr[2] * 0.4], [hp[0] + hr[0] * 1.0, hp[1] - hr[1] * 0.9, side * hr[2] * 0.55], [hp[0] + hr[0] * 1.38, hp[1] - hr[1] * 0.78, side * hr[2] * 0.65]], [H * 0.05, H * 0.035, H * 0.005], '#ece4d0', hd); // curved tusks
          const ear = flat(sh => {
            sh.moveTo(0.55, 0.72); sh.quadraticCurveTo(-0.15, 1.2, -0.68, 0.85);
            sh.quadraticCurveTo(-1.02, 0.4, -0.76, -0.35); sh.quadraticCurveTo(-0.35, -1.12, 0.03, -1.02);
            sh.quadraticCurveTo(0.55, -0.6, 0.6, 0.2); sh.lineTo(0.55, 0.72);
          });
          m.add(ear, place([hp[0] - hr[0] * 0.28, hp[1], side * hr[2] * 1.05], [side * 0.25, side * -0.35, 0], [hr[0], hr[1], H * 0.07]),
            u => tmp.copy(col(s.color)).multiplyScalar(0.88 + 0.12 * smooth(-0.6, 0.4, u.x)), hd);
          m.limb([hp[0] - hr[0] * 0.15, hp[1] + hr[1] * 0.6, side * hr[2] * 1.08], [hp[0] - hr[0] * 0.05, hp[1] - hr[1] * 0.1, side * hr[2] * 1.09], H * 0.022, H * 0.012, shade(s.color, -0.1), hd); // ear fold
        }
      },
      tail: (m, b) => { const base = [-L * 0.46, b.by + H * 0.2, 0]; m.limb(base, [-L * 0.5, b.by - H * 0.45, 0], H * 0.03, H * 0.025, s.color, { part: P.TAIL, pivot: base }); m.ell([-L * 0.5, b.by - H * 0.5, 0], [H * 0.04, H * 0.08, H * 0.04], s.dark, { part: P.TAIL, pivot: base, lo: true }); },
    };
  },
};

// A vole is a furry egg with a blunt nose: tiny feet, ears tucked in the fur, a short tail.
// A chipmunk (stripes) is the same egg, perkier: head up, bold back stripes, a striped face
// and a flat, furry tail held up behind it.
function vole(m, s) {
  const chip = !!s.stripes, dark = col(shade(s.color, -0.55)), pale = col(shade(s.belly, 0.35));
  const base = grad(s.color, s.belly, -0.35, 0.5);
  // stripes run nose to tail along the back: dark, pale, dark either side of a dark centre line
  const fur = chip ? u => {
    if (u.y < -0.1) return base(u);
    const a = Math.abs(Math.atan2(u.z, u.y)), back = u.x > -0.85 && u.x < 0.7;
    if (back && a < 0.12) return dark;
    if (back && a > 0.42 && a < 0.56) return dark;
    if (back && a > 0.56 && a < 0.74) return pale;
    if (back && a > 0.74 && a < 0.86) return dark;
    return base(u);
  } : base;
  m.ell([-0.4, 2.9, 0], [4.4, 2.8, 2.7], fur, chip ? { rot: [0, 0, 0.12] } : {});
  const hd = { part: P.HEAD, pivot: [2.2, 3, 0] }, hp = chip ? [3.7, 3.9, 0] : [3.6, 3.1, 0];
  const face = chip ? u => (Math.abs(u.z) > 0.55 && Math.abs(u.y - 0.12) < 0.1 ? dark : Math.abs(u.z) > 0.5 && Math.abs(u.y + 0.12) < 0.1 ? pale : base(u)) : base;
  m.ell(hp, [2.3, 2.1, 2.1], face, hd);
  const sn = [hp[0] + 1.7, hp[1] - 0.3, 0];
  m.ell(sn, [0.9, 0.85, 0.95], shade(s.belly, 0.1), hd);
  m.ell([sn[0] + 0.8, sn[1] + 0.15, 0], [0.3, 0.26, 0.3], '#3a2420', { ...hd, lo: true });
  for (const side of [1, -1]) {
    m.ell([hp[0] + 0.75, hp[1] + 0.6, side * 1.38], [0.4, 0.4, 0.22], '#120e0c', { ...hd, lo: true });
    m.ell([hp[0] + 0.85, hp[1] + 0.72, side * 1.5], [0.12, 0.12, 0.08], '#f4f0ea', { ...hd, lo: true }); // a catchlight
    m.ell([hp[0] - 0.5, hp[1] + 1.6, side * 1.15], [0.6, 0.66, 0.3], shade(s.color, 0.12), { ...hd, rot: [side * -0.35, 0, 0] });
    m.ell([hp[0] - 0.42, hp[1] + 1.6, side * 1.22], [0.4, 0.46, 0.2], '#c8a090', { ...hd, lo: true, rot: [side * -0.35, 0, 0] });
    for (const [x, part] of [[2.3, side > 0 ? P.LEG_FL : P.LEG_FR], [-2.5, side > 0 ? P.LEG_BL : P.LEG_BR]]) {
      const hip = [x, 1.4, side * 1.6];
      // small pink-grey feet tucked under the fur
      m.ell([x + 0.4, 0.62, side * 1.35], [0.65, 0.34, 0.42], shade(s.color, -0.25), { part, pivot: hip, lo: true });
    }
  }
  const tb = { part: P.TAIL, pivot: [-4.4, 2.4, 0] };
  if (chip) {
    // flat and furry, raised behind
    m.limb([-4.3, 2.8, 0], [-6.6, 3.9, 0], 0.8, 0.85, shade(s.color, -0.15), tb);
    m.limb([-6.6, 3.9, 0], [-8.2, 5.4, 0], 0.85, 0.5, shade(s.color, -0.3), tb);
  } else m.limb([-4.5, 2.4, 0], [-7.8, 1.3, 0], 0.32, 0.14, shade(s.color, 0.15), tb);
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

// American black bear: a heavy rolling bulk, rump-high, with a tan muzzle.
// Sun bear (chest): the smallest bear, sleek and short-haired, with a level back, a short pale
// muzzle, small round ears, long curved claws and a pale crescent blaze on the chest.
function bear(m, s) {
  // lift the near-black coat a little so the form reads: glossy on top, deep underneath
  // (tinted by the sprite's coat colour relative to the black bear's, so other bears keep the shading)
  const ref = col('#1f1a17'), c0 = col(s.color || '#1f1a17'), tint = new THREE.Color(c0.r / ref.r, c0.g / ref.g, c0.b / ref.b);
  const L = s.len, H = s.h, by = s.leg + H * 0.5, k = H / 22, sun = !!s.chest; // k: offsets tuned on the black bear's size
  const top = col('#3b2f28').clone().multiply(tint), bot = col('#120e0c').clone().multiply(tint);
  const fur = grad(top, bot, -0.1, 0.65);
  const coat = fur;
  if (sun) { // (finer meshes, so the sleek coat shades smoothly)
    m.add(SPH_HI, place([0, by + 1 * k, 0], [0, 0, 0], [L * 0.4, H * 0.5, H * 0.45]), coat);
    // the blaze: a pale U on the front of the chest, its curve below the chin and its arms reaching up
    // either side of the throat. Only where the chest faces forward (u is the sphere's own normal),
    // so from the side it shows as a pale edge at the front of the chest, not a patch on the shoulder.
    const yc = by + H * 0.1, blaze = (u, p) => {
      const d = Math.hypot(p.z / (H * 0.29), (p.y - yc) / (H * 0.44));
      return u.x > 0.5 && d > 0.7 && d < 1.0 && p.y < yc + H * 0.1 ? tmp.copy(col(s.chest)).multiplyScalar(0.9 + hash3(Math.round(p.y * 2), Math.round(p.z * 2), 3) * 0.15) : fur(u);
    };
    m.add(SPH_HI, place([L * 0.2, by + 1.2 * k, 0], [0, 0, 0], [L * 0.24, H * 0.52, H * 0.47]), blaze);
  } else {
    m.ell([0, by + 1 * k, 0], [L * 0.4, H * 0.5, H * 0.45], coat);
    m.ell([L * 0.2, by + 1.2 * k, 0], [L * 0.24, H * 0.52, H * 0.47], coat);
  }
  m.ell([-L * 0.22, by + (sun ? 1.2 : 2.4) * k, 0], [L * 0.25, H * 0.52, H * 0.48], coat); // black bears stand rump-high
  const hs = sun ? 1.18 : 1; // a sun bear's head is big for its body
  const neck = [L * 0.3, by + 1.5 * k, 0], hd = { part: P.HEAD, pivot: neck }, hp = [L * 0.51 + (sun ? H * 0.04 : 0), by - 0.4 * k + (sun ? H * 0.12 : 0), 0];
  m.limb(neck, [hp[0] - 3 * k, hp[1], 0], H * 0.33, H * 0.28, coat, hd);
  m.ell(hp, [H * 0.29 * hs, H * 0.26 * hs, H * 0.26 * hs * (sun ? 1.08 : 1)], coat, hd);
  if (sun) {
    // short, broad pale muzzle with a dark nose, and pale-rimmed small round ears
    m.ell([hp[0] + H * 0.27 * hs, hp[1] - H * 0.09 * hs, 0], [H * 0.17, H * 0.13, H * 0.15], s.muzzle, hd);
    m.ell([hp[0] + H * 0.42 * hs, hp[1] - H * 0.05 * hs, 0], [H * 0.06, H * 0.055, H * 0.075], '#0c0a09', { ...hd, lo: true });
    for (const side of [1, -1]) {
      m.ell([hp[0] - H * 0.04, hp[1] + H * 0.27 * hs, side * H * 0.22 * hs], [H * 0.075, H * 0.075, H * 0.04], coat, hd);
      m.ell([hp[0] + H * 0.14 * hs, hp[1] + H * 0.07 * hs, side * H * 0.23 * hs], [H * 0.035, H * 0.035, H * 0.02], '#3a2a1e', { ...hd, lo: true });
    }
  } else {
    m.ell([hp[0] + H * 0.26, hp[1] - H * 0.08, 0], [H * 0.2, H * 0.13, H * 0.13], s.muzzle, hd);
    m.ell([hp[0] + H * 0.44, hp[1] - H * 0.05, 0], [H * 0.055, H * 0.05, H * 0.07], '#0c0a09', { ...hd, lo: true });
    for (const side of [1, -1]) {
      m.ell([hp[0] - H * 0.06, hp[1] + H * 0.24, side * H * 0.17], [H * 0.09, H * 0.1, H * 0.05], '#2e2520', hd);
      m.ell([hp[0] + H * 0.1, hp[1] + H * 0.07, side * H * 0.19], [H * 0.035, H * 0.035, H * 0.02], '#d8c8a8', { ...hd, lo: true });
    }
  }
  for (const [x, side, part, top] of [[L * 0.24, 1, P.LEG_FL, by - 2 * k], [L * 0.24, -1, P.LEG_FR, by - 2 * k], [-L * 0.24, 1, P.LEG_BL, by], [-L * 0.24, -1, P.LEG_BR, by]]) {
    const z = side * H * 0.25, hip = [x, top, z], o = { part, pivot: hip };
    if (part >= P.LEG_BL) m.ell([x - 1 * k, by - 2 * k, z * 1.05], [H * 0.3, H * 0.4, H * 0.2], coat, o); // heavy thigh
    m.limb(hip, [x + 0.6 * k, 3 * k, z], H * 0.25, H * 0.17, coat, o);
    paw(m, [x + 1.6 * k, 1.6 * k, z], [H * 0.21, H * 0.09, H * 0.17], '#0e0b09', o);
    // long, curved pale claws, longest on the front feet
    if (sun) for (const t of [-1, 0, 1]) {
      const cl = part < P.LEG_BL ? H * 0.16 : H * 0.09, c0 = [x + 1.6 * k + H * 0.17, 1.6 * k, z + t * H * 0.08];
      m.limb(c0, [c0[0] + cl * 0.7, c0[1] - cl * 0.25, c0[2]], H * 0.025, H * 0.02, '#cdbb9a', { ...o, caps: false });
      m.limb([c0[0] + cl * 0.7, c0[1] - cl * 0.25, c0[2]], [c0[0] + cl, 0.1, c0[2]], H * 0.02, H * 0.008, '#cdbb9a', { ...o, caps: false });
    }
  }
  m.ell([-L * 0.46, by + 3.5 * k, 0], [1.3 * k, 1.2 * k, 1.2 * k], coat, { part: P.TAIL, pivot: [-L * 0.44, by + 3 * k, 0], lo: true });
}

// ---------------------------------------------------------------- birds
const BIRDS = {
  songbird: s => ({ legH: 0.2, tilt: 0.35, span: 0.62, chord: 0.24, beak: 0.16, beakColor: s.bill || '#3a3028', legColor: '#6a5a4a', tail: s.cocked ? -1.1 : 0.25 }),
  hummer: s => ({ legH: 0.1, tilt: 0.2, span: 0.7, chord: 0.2, beak: 0.44, beakColor: '#1e1a18', legColor: '#1e1a18', tail: 0.2, beakR: 0.03 }),
  woodpecker: s => ({ legH: 0.14, tilt: 0.75, span: 0.62, chord: 0.26, beak: 0.26, beakColor: '#2a2622', legColor: '#4a4440', tail: 0.5 }),
  heron: s => ({ legH: 1.05, tilt: 0.3, span: 0.9, chord: 0.3, beak: s.stork ? 0.38 : 0.42, beakR: s.stork ? 0.05 : null, beakColor: s.bill || '#e0b030', legColor: s.stork ? '#c0543e' : '#b8a060', tail: 0.2, neck: true, head: 0.13 }), // (stork: a stouter, straight bill)
  duck: s => ({ legH: 0.08, tilt: 0.05, span: 0.6, chord: 0.24, beak: 0.2, beakColor: '#d8a030', legColor: '#e08a30', tail: -0.4, duck: true }),
  raptor: s => ({ legH: 0.16, tilt: 0.45, span: 0.95, chord: 0.3, beak: 0.14, beakColor: s.bill || '#e0b030', legColor: '#e0b030', tail: 0.35, hook: true }),
  vulture: s => ({ legH: 0.2, tilt: 0.3, span: 0.95, chord: 0.34, beak: 0.13, beakColor: s.bill || '#2a2a2a', legColor: '#5a5650', tail: 0.2, hook: true, head: 0.12, vulture: true }),
  secretary: s => ({ legH: 1.05, tilt: 0.18, span: 1.0, chord: 0.3, beak: 0.09, beakColor: '#8a8a88', legColor: '#e2c49a', tail: 0.1, hook: true, neck: true, head: 0.13, secretary: true }),
  crane: s => ({ legH: 0.95, tilt: 0.22, span: 1.0, chord: 0.32, beak: 0.15, beakColor: '#2a2a2a', legColor: '#3a3a3a', tail: 0.2, neck: true, head: 0.13 }),
  hornbill: s => ({ legH: s.perch ? 0.13 : 0.44, tilt: s.casque ? 0.3 : 0.22, span: 0.8, chord: 0.3, beak: 0, beakColor: '#1c1a18', legColor: '#2a2624', tail: s.casque ? 0.75 : 0.3, head: 0.16, hornbill: true }),
  toucan: s => ({ legH: 0.18, tilt: 0.45, span: 0.55, chord: 0.26, beak: 0, beakColor: s.bill, legColor: '#4a6aa0', tail: 0.4, head: 0.2, toucan: true }),
  macaw: s => ({ legH: 0.14, tilt: 0.55, span: 0.95, chord: 0.28, beak: 0.13, beakColor: '#e8e2d4', legColor: '#5a5048', tail: 0.45, hook: true, head: 0.21, macaw: true }),
  ostrich: s => ({ legH: 1.15, tilt: 0.05, span: 0.45, chord: 0.3, beak: 0.1, beakColor: '#c8a088', legColor: '#d0a898', tail: -0.6, neck: true, tall: true, head: 0.09, fluffy: true }),
  // brown booby: a sleek seabird with a long, pointed dagger of a bill, resting on the water between dives
  booby: s => ({ legH: 0.06, tilt: 0.12, span: 1.05, chord: 0.22, beak: 0.3, beakR: 0.065, beakColor: s.bill || '#e0c860', legColor: '#e0c860', tail: 0.35, swimmer: true, head: 0.145, headLong: 1.2, taper: true, long: 1.05, gape: true, up: 0.48 }),
  owl: s => ({ legH: 0.12, tilt: 1.3, span: 0.85, chord: 0.3, beak: 0.08, beakColor: '#3a3028', legColor: '#8a7a5a', tail: 1.2, owl: true, head: 0.22 }),
};

const WING_KIND = { vulture: 'fingered', secretary: 'fingered', crane: 'fingered', hornbill: 'fingered', ostrich: 'round', songbird: 'round', woodpecker: 'round', owl: 'round', toucan: 'round', hummer: 'pointed', duck: 'pointed', booby: 'pointed', macaw: 'pointed', heron: 'fingered', raptor: 'fingered' };

// Family proportions keep the silhouette recognisable before colours and markings are added.
const BIRD_BODY = {
  songbird: [0.38, 0.25, 0.23], hummer: [0.34, 0.2, 0.18], woodpecker: [0.43, 0.23, 0.21],
  heron: [0.44, 0.22, 0.22], duck: [0.46, 0.24, 0.28], booby: [0.5, 0.22, 0.22],
  raptor: [0.41, 0.29, 0.26], vulture: [0.46, 0.27, 0.26], owl: [0.37, 0.3, 0.28],
  macaw: [0.41, 0.26, 0.23], toucan: [0.4, 0.27, 0.24], hornbill: [0.46, 0.26, 0.25],
  secretary: [0.44, 0.25, 0.23], crane: [0.46, 0.24, 0.24], ostrich: [0.5, 0.32, 0.3],
};
// A closed, slightly arched feather with a broad shaft and softly rounded end. Shared by tails;
// unlike an ellipsoid it stays broad along its length instead of swelling into a leaf at the middle.
function tailFeather() {
  const rows = 20, across = 3, pos = [], idx = [];
  for (const face of [0.5, -0.5]) for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const half = t <= 0.78 ? 0.24 + 0.26 * smooth(0, 0.65, t) : Math.max(0.005, 0.5 * Math.sqrt(Math.max(0, 1 - ((t - 0.78) / 0.22) ** 2)));
    for (let j = 0; j <= across; j++) pos.push(-t, face + 0.2 * Math.sin(t * Math.PI), (j / across * 2 - 1) * half);
  }
  const faceCount = (rows + 1) * (across + 1);
  for (let face = 0; face < 2; face++) for (let i = 0; i < rows; i++) for (let j = 0; j < across; j++) {
    const a = face * faceCount + i * (across + 1) + j, b = a + across + 1;
    if (face === 0) idx.push(a, a + 1, b, b, a + 1, b + 1);
    else idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // Close the thin edges, with shared vertices for a gently rounded rim.
  for (let i = 0; i < rows; i++) for (const j of [0, across]) {
    const a = i * (across + 1) + j, b = a + across + 1;
    if (j === 0) idx.push(a, b, a + faceCount, b, b + faceCount, a + faceCount);
    else idx.push(a, a + faceCount, b, b, a + faceCount, b + faceCount);
  }
  for (const i of [0, rows]) for (let j = 0; j < across; j++) {
    const a = i * (across + 1) + j;
    if (i === 0) idx.push(a, a + faceCount, a + 1, a + 1, a + faceCount, a + 1 + faceCount);
    else idx.push(a, a + 1, a + faceCount, a + 1, a + 1 + faceCount, a + faceCount);
  }
  // Length runs toward -x, so reverse the grid's winding to point each face outward.
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Interior rows preserve bands, bars, and coloured tips when painting the feathers.
const TAIL_FEATHER = tailFeather();
// Motmot central feathers: a narrow bare shaft ending in a broad racket.
const RACKET_FEATHER = flat(sh => {
  sh.moveTo(0, -0.15); sh.lineTo(-0.3, -0.12); sh.lineTo(-0.72, -0.035);
  sh.quadraticCurveTo(-0.76, -0.48, -0.88, -0.5); sh.quadraticCurveTo(-1, -0.48, -1, 0);
  sh.quadraticCurveTo(-1, 0.48, -0.88, 0.5); sh.quadraticCurveTo(-0.76, 0.48, -0.72, 0.035);
  sh.lineTo(-0.3, 0.12); sh.lineTo(0, 0.15); sh.closePath();
}, 'xz', 4);
const TAIL_PROFILE = {
  songbird: [0.43, 0.15, 0.25, 0.06], hummer: [0.3, 0.11, 0.18, 0.04],
  woodpecker: [0.46, 0.13, 0.2, 0.18], heron: [0.27, 0.12, 0.2, 0.08],
  duck: [0.3, 0.15, 0.23, 0.12], booby: [0.52, 0.13, 0.23, 0.28],
  raptor: [0.42, 0.21, 0.34, 0.04], vulture: [0.38, 0.18, 0.31, 0.08],
  owl: [0.26, 0.15, 0.24, 0.04], macaw: [0.98, 0.1, 0.18, 0.42],
  toucan: [0.43, 0.17, 0.25, 0.03], hornbill: [0.62, 0.18, 0.27, 0.04],
  secretary: [0.35, 0.15, 0.23, 0.05], crane: [0.25, 0.16, 0.24, 0.06],
  ostrich: [0.28, 0.24, 0.3, 0.12],
};
function birdTail(m, s, o, by, bodyR) {
  const S = s.size, c = Math.cos(o.tilt), sn = Math.sin(o.tilt);
  // The base follows the tilted rump, with the feather roots buried beneath rump coverts.
  const base = [-bodyR[0] * 0.76 * c - S * 0.025 * sn, by - bodyR[0] * 0.76 * sn + S * 0.025 * c, 0];
  let [length, width, flightWidth, graduation] = TAIL_PROFILE[s.kind];
  if (s.shortTail) { length = 0.36; width = 0.15; flightWidth = 0.24; graduation = 0; }
  if (s.tailTip) length = 0.66;
  if (s.cocked) length = 0.3;
  length = s.tailLength ?? length;
  width = s.tailWidth ?? width;
  flightWidth = s.tailFan ?? flightWidth;
  graduation = s.tailGraduation ?? graduation;
  const angle = s.cocked ? -1.05 : o.owl ? 1.15 : o.duck ? -0.08 : o.tall ? -0.35 : 0.12 + o.tilt * 0.45;
  const paint = u => {
    const t = -u.x;
    if (s.tailTip && t > 0.78) return col(s.tailTip);
    if (o.macaw && !s.shortTail && t > 0.56) return col(s.wingtip || s.tail || s.color);
    if (s.tailBand && t > 0.48 && t < 0.7) return col(s.tailBand);
    if (s.barred && Math.sin(t * 26) > 0.45) return col(s.breast);
    if (s.tailBars && Math.sin(t * 26) > 0.45) return col(s.tailBars);
    return col(s.tail || s.color);
  };
  for (let f = -3; f <= 3; f++) {
    const edge = Math.abs(f) / 3, L = S * length * (1 - graduation * edge);
    const root = [base[0], base[1] + S * (0.008 - edge * 0.004), f * S * 0.013];
    const fan = (w, pitch) => place(root, [0, Math.atan2(f / 3 * S * w, L), pitch], [L, S * 0.013, S * (width * 0.78)]);
    m.add(TAIL_FEATHER, fan(width * 0.65, angle), u => shade(s.centralTailTip && Math.abs(f) <= 1 && -u.x > 0.82 ? s.centralTailTip : paint(u), edge * -0.055), {
      part: P.TAIL, pivot: base, ext: fan(flightWidth, angle * 0.45),
    });
  }
  if (s.tailRackets) for (const side of [-1, 1]) {
    const root = [base[0], base[1], side * S * 0.025];
    const pose = pitch => place(root, [0, side * 0.06, pitch], [S * 0.95, S * 0.012, S * 0.095]);
    m.add(RACKET_FEATHER, pose(angle), u => -u.x > 0.9 ? col('#182a30') : col(s.tailTip || s.tail),
      { part: P.TAIL, pivot: base, ext: pose(angle * 0.45) });
  }
  // The secretarybird's two long central streamers extend beyond the compact fan.
  if (o.secretary) for (const side of [-1, 1]) {
    const root = [base[0], base[1], side * S * 0.025];
    m.add(TAIL_FEATHER, place(root, [0, side * 0.045, 0.22], [S * 0.95, S * 0.012, S * 0.05]),
      u => -u.x > 0.72 ? col('#1a1a1a') : col(s.color), { part: P.TAIL, pivot: base });
  }
  m.ell([base[0] + S * 0.035 * c, base[1] + S * 0.035 * sn, 0], [S * 0.13, S * 0.065, S * width * 0.65],
    s.tail || s.color, { rot: [0, 0, o.tilt] });
}

function bird(m, s) {
  const S = s.size, o = BIRDS[s.kind](s), bodyBase = grad(s.color, s.breast || s.color, -0.15, 0.4);
  const by = o.legH * S + S * 0.26;
  // (bib: a sharp line between a dark back and chest and a white belly, as on a booby)
  const body = s.barred ? u => {
    const bars = u.y > -0.12 ? Math.sin(u.y * 24) : Math.sin(u.z * 25);
    return u.x > 0.05 && u.y < 0.35 && bars > 0.35 ? col(s.color) : bodyBase(u);
  } : s.fancy ? u => u.x > 0.25 ? (hash3(Math.round(u.x * 24), Math.round(u.y * 24), Math.round(u.z * 24)) > 0.77 ? col('#efddbd') : col('#794c3b')) : bodyBase(u) : s.bib ? u => (u.y > -0.1 || u.x > 0.62 ? col(s.color) : col(s.breast)) : grad(s.color, s.breast || s.color, -0.15, 0.4);
  const bodyR = BIRD_BODY[s.kind].map(r => r * S);
  m.add(s.barred || s.fancy ? SPH_XL : SPH, place([0, by, 0], [0, 0, o.tilt], bodyR), body);
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
  else if (s.kind === 'booby') hp = [S * 0.48, by + S * 0.2, 0];
  else if (o.duck) hp = [S * 0.38, by + S * 0.28, 0];
  else hp = [S * 0.34 + Math.sin(o.tilt) * S * 0.02, by + S * 0.2 + Math.sin(o.tilt) * S * 0.12, 0];
  const neckBase = [S * 0.25, by + S * 0.1, 0], hd = { part: P.HEAD, pivot: neckBase };
  // a short, thick neck, so the head grows smoothly out of the body instead of sitting on it like a ball
  if (!o.owl && !o.tall && !o.neck && !o.vulture && !o.duck) {
    const n0 = [S * (s.kind === 'booby' ? 0.3 : 0.2), by + S * 0.05, 0], n1 = [hp[0] - hr * 0.35, hp[1] - hr * 0.25, 0];
    const nc = s.kind === 'woodpecker' ? s.color : s.head; // (a woodpecker's "head" colour is its crest)
    m.limb(n0, n1, S * 0.17, hr * 0.84, grad(nc, s.breast || s.color, 0.1, 0.5), { ...hd, caps: false });
  }
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
    tube(m, [[S * 0.3, by + S * 0.08, 0], [S * 0.39, by + S * 0.28, 0], [S * 0.41, by + S * 0.46, 0], [hp[0] - hr * 0.4, hp[1] - hr * 0.2, 0]], [S * 0.09, S * 0.075, S * 0.061, S * 0.06], s.breast, hd);
  }
  if (o.duck) m.limb([S * 0.3, by + S * 0.08, 0], hp, S * 0.12, S * 0.11, s.head, hd);
  const pecker = s.kind === 'woodpecker';
  m.ell(hp, [hr * (o.headLong || 1.05), hr, hr * (o.owl ? 1.1 : 0.95)], pecker ? s.color : s.head, hd);
  if (o.taper) m.ell([hp[0] + hr * 0.75, hp[1] - hr * 0.12, 0], [hr * 0.7, hr * 0.62, hr * 0.62], s.head, hd); // (a streamlined face sloping into the bill, as on a booby)
  if (pecker) {
    // pileated: a flaming red crest, and a white stripe from the bill down the neck
    m.limb([hp[0] + hr * 0.1, hp[1] + hr * 0.6, 0], [hp[0] - hr * 1.1, hp[1] + hr * 1.05, 0], hr * 0.55, hr * 0.12, s.head, hd);
    m.ell([hp[0] + hr * 0.2, hp[1] + hr * 0.75, 0], [hr * 0.6, hr * 0.35, hr * 0.5], s.head, hd);
    for (const side of [1, -1]) m.ell([hp[0] + hr * 0.1, hp[1] - hr * 0.25, side * hr * 0.72], [hr * 0.85, hr * 0.14, hr * 0.28], '#f2f0ea', hd);
  }
  if (o.owl) {
    // great horned: feather "horns", a tawny facial disc and yellow eyes
    if (s.barn) {
      // barn owl: no ear tufts; a flat white heart-shaped face rimmed in buff, and dark eyes
      m.ell([hp[0] + hr * 0.5, hp[1] - hr * 0.05, 0], [hr * 0.5, hr * 0.92, hr * 0.98], shade(s.color, 0.2), hd);
      for (const side of [1, -1]) m.ell([hp[0] + hr * 0.68, hp[1] - hr * 0.08, side * hr * 0.36], [hr * 0.3, hr * 0.72, hr * 0.48], s.breast, hd);
      m.ell([hp[0] + hr * 0.95, hp[1] - hr * 0.1, 0], [hr * 0.16, hr * 0.5, hr * 0.12], shade(s.breast, -0.12), { ...hd, lo: true }); // the ridge down the middle
      eyes(m, hp, hr * 0.93, hr * 0.12, hr * 0.33, hr * 0.12, P.HEAD, neckBase, '#120c08');
    } else if (s.barred) {
      m.ell([hp[0] + hr * 0.48, hp[1], 0], [hr * 0.56, hr * 0.9, hr * 1.02], shade(s.color, -0.2), hd);
      for (const side of [-1, 1]) m.ell([hp[0] + hr * 0.65, hp[1], side * hr * 0.39], [hr * 0.4, hr * 0.75, hr * 0.52], s.breast, hd);
      eyes(m, hp, hr * 0.97, hr * 0.1, hr * 0.4, hr * 0.13, P.HEAD, neckBase, '#17120f');
    } else {
      for (const side of [1, -1]) m.limb([hp[0] - hr * 0.1, hp[1] + hr * 0.75, side * hr * 0.45], [hp[0] - hr * 0.35, hp[1] + hr * 1.45, side * hr * 0.62], hr * 0.22, hr * 0.04, s.color, hd);
      for (const side of [1, -1]) m.ell([hp[0] + hr * 0.62, hp[1], side * hr * 0.42], [hr * 0.25, hr * 0.52, hr * 0.45], s.breast, hd);
      eyes(m, hp, hr * 0.85, hr * 0.08, hr * 0.4, hr * 0.17, P.HEAD, neckBase, '#e8c030');
      eyes(m, hp, hr * 0.97, hr * 0.08, hr * 0.4, hr * 0.09, P.HEAD, neckBase);
    }
  } else if (s.eye) {
    // coloured eyes (the hoatzin's red eye in a patch of bare blue skin)
    if (s.face) for (const side of [1, -1]) m.ell([hp[0] + hr * 0.4, hp[1] + hr * 0.2, side * hr * 0.72], [hr * 0.38, hr * 0.3, hr * 0.2], s.face, hd);
    eyes(m, hp, hr * 0.47, hr * 0.24, hr * 0.84, Math.max(0.55, hr * 0.19), P.HEAD, neckBase, s.eye);
    eyes(m, hp, hr * 0.52, hr * 0.24, hr * 0.9, Math.max(0.3, hr * 0.09), P.HEAD, neckBase);
  } else {
    // bare facial skin (secretarybird's orange, crowned crane's white cheek)
    if (s.face) for (const side of [1, -1]) m.ell([hp[0] + hr * 0.35, hp[1] + hr * 0.05, side * hr * 0.7], [hr * 0.5, hr * 0.4, hr * 0.3], s.face, hd);
    if (s.ring) eyes(m, hp, hr * 0.42, hr * 0.25, hr * 0.72, Math.max(0.52, hr * 0.2), P.HEAD, neckBase, s.ring); // a thin pale eye-ring
    eyes(m, hp, hr * 0.45, hr * 0.25, s.ring ? hr * 0.8 : hr * 0.78, Math.max(0.45, hr * 0.17), P.HEAD, neckBase);
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
  if (s.gorget) m.ell([hp[0] + hr * 0.4, hp[1] - hr * 0.5, 0], [hr * 0.62, hr * 0.5, hr * 0.78], s.gorget, hd); // a hummingbird's shining throat
  if (s.nape) m.ell([hp[0] - hr * 0.45, hp[1] + hr * 0.05, 0], [hr * 0.6, hr * 0.62, hr * 0.85], s.nape, hd);  // the lora's yellow nape
  if (s.cap) m.ell([hp[0] + hr * 0.15, hp[1] + hr * 0.5, 0], [hr * 0.8, hr * 0.55, hr * 0.85], s.cap, hd); // (the noddy's white cap)
  if (s.velvet) m.ell([hp[0] + hr * 0.55, hp[1] + hr * 0.45, 0], [hr * 0.45, hr * 0.35, hr * 0.5], s.velvet, hd); // black velvet forehead
  if (o.fluffy) m.ell([-S * 0.08, by + S * 0.04, 0], [S * 0.46, S * 0.33, S * 0.36], s.color); // plumes bulk out the body
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
  if (s.fancy) {
    tube(m, [[hp[0] - hr * 0.1, hp[1] + hr * 0.62, 0], [hp[0] - hr * 0.8, hp[1] + hr * 0.5, 0], [hp[0] - hr * 1.55, hp[1] + hr * 0.06, 0]], [[hr * 0.3, hr * 0.65], [hr * 0.24, hr * 0.48], [hr * 0.07, hr * 0.08]], s.head, hd);
    for (const side of [-1, 1]) {
      tube(m, [[hp[0] + hr * 0.58, hp[1] - hr * 0.35, side * hr * 0.8], [hp[0] - hr * 0.08, hp[1] - hr * 0.63, side * hr * 0.72], [hp[0] - hr * 0.98, hp[1] - hr * 0.26, side * hr * 0.43]], [hr * 0.075, hr * 0.08, hr * 0.04], '#f6f0db', hd);
      tube(m, [[hp[0] + hr * 0.15, hp[1] + hr * 0.56, side * hr * 0.78], [hp[0] - hr * 0.65, hp[1] + hr * 0.42, side * hr * 0.7], [hp[0] - hr * 1.42, hp[1] + hr * 0.07, side * hr * 0.15]], [hr * 0.055, hr * 0.055, hr * 0.025], '#f6f0db', hd);
    }
  }
  const bb = [hp[0] + hr * 0.85, hp[1] - hr * (o.duck ? 0.25 : 0.1), 0], bl = S * o.beak;
  if (o.toucan) {
    // the toco's huge orange bill, with a black tip and a white throat bib beneath
    const bill = u => u.x > 0.72 ? col('#141210') : u.x > 0.2 && u.y > 0.55 ? col(shade(s.bill, 0.2)) : col(s.bill);
    m.ell([bb[0] + S * 0.25, bb[1] - S * 0.02, 0], [S * 0.3, hr * 0.6, hr * 0.42], bill, { ...hd, rot: [0, 0, -0.12] });
    m.ell([hp[0] + hr * 0.3, hp[1] - hr * 0.8, 0], [hr * 0.7, hr * 0.7, hr * 0.8], s.breast, hd);
    for (const side of [1, -1]) m.ell([hp[0] + hr * 0.45, hp[1] + hr * 0.25, side * hr * 0.72], [hr * 0.3, hr * 0.3, hr * 0.12], s.wattle || '#3a8ae0', { ...hd, lo: true });
    if (s.wattle) m.ell([hp[0] + hr * 0.4, hp[1] - hr * 0.95, 0], [hr * 0.55, hr * 0.5, hr * 0.5], s.wattle, hd); // ground hornbill's red throat
  } else if (o.hornbill && s.casque) {
    // rhinoceros hornbill: a long, down-curved ivory bill, yellower at the base, topped by a great
    // orange-red casque that rides along the bill and sweeps up and back at the front like a horn
    const at = (x, y) => [bb[0] + S * x, bb[1] + S * y, 0];
    const bill = (u, p) => tmp.copy(col('#e8a838')).lerp(col(s.bill), smooth(bb[0], bb[0] + S * 0.18, p.x));
    const casque = (u, p) => tmp.copy(col('#f0b838')).lerp(col(s.casque), smooth(bb[1] + S * 0.03, bb[1] + S * 0.13, p.y));
    const bp = [at(-0.02, 0), at(0.18, -0.045), at(0.32, -0.13), at(0.42, -0.25)], br = [0.065, 0.045, 0.026, 0.006];
    for (let k = 1; k < 4; k++) m.limb(bp[k - 1], bp[k], S * br[k - 1], S * br[k], bill, { ...hd, caps: k < 3 });
    m.ell(at(0.08, 0.035), [S * 0.13, S * 0.045, S * 0.03], casque, hd);
    const cp = [at(0.0, 0.05), at(0.15, 0.055), at(0.24, 0.1), at(0.235, 0.18), at(0.17, 0.235)], cr = [0.045, 0.042, 0.034, 0.022, 0.008];
    for (let k = 1; k < 5; k++) m.limb(cp[k - 1], cp[k], S * cr[k - 1], S * cr[k], casque, { ...hd, caps: k < 4 });
  } else if (o.hornbill) {
    // southern ground hornbill: a heavy, down-curved black bill with a low casque on top, and a
    // big bare red throat pouch below it
    const t0 = bb, t1 = [bb[0] + S * 0.17, bb[1] - S * 0.04, 0], t2 = [bb[0] + S * 0.3, bb[1] - S * 0.14, 0];
    m.limb(t0, t1, S * 0.06, S * 0.042, o.beakColor, hd); m.limb(t1, t2, S * 0.042, S * 0.008, o.beakColor, { ...hd, caps: false });
    m.limb([bb[0], bb[1] - S * 0.035, 0], [bb[0] + S * 0.2, bb[1] - S * 0.1, 0], S * 0.035, S * 0.01, shade(o.beakColor, 0.08), { ...hd, caps: false }); // lower mandible
    m.ell([bb[0] + S * 0.05, bb[1] + S * 0.045, 0], [S * 0.085, S * 0.03, S * 0.028], o.beakColor, hd); // casque
    m.ell([hp[0] + hr * 0.35, hp[1] - hr * 1.05, 0], [hr * 0.75, hr * 0.7, hr * 0.62], s.wattle, hd);    // throat pouch
    m.ell([hp[0] + hr * 0.1, hp[1] - hr * 0.55, 0], [hr * 0.6, hr * 0.45, hr * 0.8], s.wattle, hd);
  } else if (s.spoonbill) {
    m.ell([bb[0] + bl * 0.36, bb[1], 0], [bl * 0.48, hr * 0.13, hr * 0.18], '#a2a48b', hd);
    m.ell([bb[0] + bl * 0.86, bb[1] - hr * 0.025, 0], [bl * 0.24, hr * 0.12, hr * 0.44], '#92977f', hd);
  } else if (o.duck) m.ell([bb[0] + bl * 0.45, bb[1], 0], [bl * 0.6, hr * 0.18, hr * 0.42], s.fancy ? u => u.x > 0.65 ? col('#241a19') : u.y > 0.3 ? col('#e5cbaa') : col('#b94c44') : o.beakColor, hd);
  else {
    if (o.macaw) {
      // bare white face and a deep, hooked two-tone bill
      if (s.faceSkin !== null) for (const side of [1, -1]) m.ell([hp[0] + hr * 0.45, hp[1] - hr * 0.05, side * hr * 0.7], [hr * 0.5, hr * 0.45, hr * 0.2], s.faceSkin || '#f4f0ea', hd);
      m.ell([bb[0] + S * 0.03, bb[1] - S * 0.03, 0], [S * 0.07, S * 0.08, S * 0.06], '#2a2420', { ...hd, lo: true });
    }
    const b0 = [bb[0] - hr * 0.12, bb[1], 0], r0 = o.beakR != null ? S * o.beakR : Math.max(S * 0.04, hr * 0.32);
    const bm = [bb[0] + bl * 0.55, bb[1] - (o.hook ? bl * 0.08 : bl * 0.03), 0], b1 = [bb[0] + bl, bb[1] - (o.hook ? bl * 0.35 : bl * 0.1), 0];
    m.limb(b0, bm, r0, r0 * 0.55, o.beakColor, { ...hd, caps: false });
    m.limb(bm, b1, r0 * 0.55, S * 0.006, o.beakColor, { ...hd, caps: false });
    if (o.gape) m.limb([b0[0] + hr * 0.05, b0[1] - r0 * 0.15, 0], [bm[0] + bl * 0.2, bm[1] - r0 * 0.12, 0], r0 * 1.02, r0 * 0.5, shade(o.beakColor, -0.35), { ...hd, caps: false }); // the line of the gape
    if (o.hook) m.ell(bb, [S * 0.06, S * 0.06, S * 0.06], o.beakColor, { ...hd, lo: true });
  }

  birdTail(m, s, o, by, bodyR);
  // a coloured patch under the tail (a bulbul's red vent, a rhinoceros hornbill's white one)
  const vent = s.vent || (o.hornbill && s.casque ? s.tail : null);
  if (vent) m.ell([-S * 0.2, by - S * 0.14, 0], [S * 0.17, S * 0.1, S * 0.13], vent, { rot: [0, 0, o.tilt] });

  // legs
  if (!o.duck && !o.swimmer) for (const side of [1, -1]) {
    const hip = [S * 0.02, by - S * 0.12, side * S * (o.tall ? 0.13 : 0.07)];
    const lp = { part: side > 0 ? P.LEG_FL : P.LEG_FR, pivot: hip }, thick = s.bigFeet ? 1.9 : o.tall ? 1.8 : o.hornbill ? 1.5 : 1;
    m.limb(hip, [S * 0.04, S * 0.02, side * S * (o.tall ? 0.11 : 0.08)], S * (o.legH > 0.5 ? 0.028 : 0.035) * thick, S * 0.022 * thick, o.legColor, lp);
    if (o.tall) { // an ostrich's bare, muscular thighs, and its big two-toed feet
      m.limb([S * 0.0, by - S * 0.05, side * S * 0.14], [S * 0.06, by - S * 0.55, side * S * 0.12], S * 0.1, S * 0.05, o.legColor, lp);
      m.ell([S * 0.1, S * 0.025, side * S * 0.11], [S * 0.09, S * 0.03, S * 0.045], shade(o.legColor, -0.15), { ...lp, lo: true });
    }
    if (o.secretary) m.limb(hip, [S * 0.03, by - S * 0.62, side * S * 0.08], S * 0.075, S * 0.05, '#1a1a1a', lp); // feathered black thighs
    if (!o.tall && !s.bigFeet) {
      const z = side * S * 0.08, foot = [S * 0.04, S * 0.02, z];
      const grip = o.macaw || pecker || o.toucan;
      for (const t of [-1, 0, 1]) {
        const back = grip && t === -1, dx = back ? -0.065 : 0.075;
        m.limb(foot, [foot[0] + S * dx, S * 0.009, z + t * S * 0.032], S * 0.01, S * 0.005, o.legColor, { ...lp, caps: false });
      }
      m.limb(foot, [foot[0] - S * 0.05, S * 0.012, z + S * 0.017], S * 0.009, S * 0.004, o.legColor, { ...lp, caps: false });
    }
    if (s.bigFeet) for (const t of [-1, 0, 1]) m.limb([S * 0.04, S * 0.02, side * S * 0.08], [S * (0.04 + 0.07 * (t === 0 ? 1 : 0.6)), S * 0.005, side * S * 0.08 + t * S * 0.04], S * 0.02, S * 0.01, '#2a2420', { ...lp, caps: false });
  }

  if (o.duck || o.swimmer) for (const side of [-1, 1]) {
    const hip = [-S * 0.08, by - S * 0.14, side * S * 0.12], lp = { part: side > 0 ? P.LEG_FL : P.LEG_FR, pivot: hip };
    const foot = [-S * 0.04, S * 0.025, side * S * 0.14];
    m.limb(hip, foot, S * 0.025, S * 0.018, o.legColor, lp);
    m.add(TAIL_FEATHER, place([foot[0] + S * 0.08, foot[1], foot[2]], [0, 0, 0], [S * 0.13, S * 0.014, S * 0.1]), o.legColor, lp);
  }

  // wings
  // coverts in the body colour, darker flight feathers along the trailing edge and out to the tip
  const covert = col(o.owl ? s.color : shade(s.color, 0.1)), flight = col(s.flight || shade(s.color, o.owl ? -0.15 : -0.4));
  const spec = s.speculum ? col(s.speculum) : null;
  const wc = u => {
    const a = Math.abs(u.z), x = u.x, back = x < -0.08 + a * 0.12; // the flight-feather zone
    if (s.barred) return Math.sin(a * 25) > 0.3 ? col(shade(s.breast, -0.12)) : covert;
    if (s.wing) return a > 0.62 || x < -0.12 ? col(s.wingtip) : x < 0.14 ? col(s.wing) : col(s.color); // scarlet macaw: red, yellow band, blue
    if (spec && back && a > 0.18 && a < 0.5) return spec;                                        // a duck's speculum
    if (back || a > 0.72) return flight;
    return x > 0.36 && a < 0.5 ? col(shade(s.color, 0.2)) : covert;                                // pale leading edge
  };
  const shape = s.wingShape || WING_KIND[s.kind] || 'round';
  for (const side of [1, -1]) {
    // folded, a wing starts at the shoulder and reaches about to the tail tip, however long it is spread
    // (an owl's end at its tail, not below it)
    const L = Math.min(1.2 * o.span, o.owl ? 0.75 : s.kind === 'booby' ? 0.92 : o.long || 1.0), foldLen = L / (1.2 * o.span);
    m.wing(side, [S * 0.1, by + S * 0.1, side * S * 0.14], S * o.span, S * o.chord * (shape === 'fingered' ? 1.15 : 1), S * 0.02, wc, [-S * 0.02, by, 0], shape, bodyR[2] * 1.04, o.tilt * 0.8, foldLen, S * Math.min(o.span * 0.5 * foldLen, 0.3), o.up ?? 0.55); // (resting, folded wings ride up over the back)
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
  const S = s.size, by = S * 0.32, fox = s.batType === 'fox', fruit = s.batType === 'fruit';
  // a furry, slightly paler body and face, so the bat reads against its own dark wings
  const furC = shade(s.color, 0.04), fur = grad(furC, shade(s.color, 0.12), -0.2, 0.5), dark = shade(s.color, -0.35);
  m.ell([0, by, 0], [S * 0.25, S * 0.17, S * 0.16], fur);
  m.ell([S * 0.12, by + S * 0.02, 0], [S * 0.15, S * 0.16, S * 0.16], fur);
  const hp = [S * 0.3, by + S * 0.06, 0], neck = [S * 0.15, by, 0], hd = { part: P.HEAD, pivot: neck };
  m.ell(hp, [S * 0.13, S * 0.12, S * 0.12], fur, hd);
  m.ell([hp[0] + S * (fox ? 0.13 : 0.1), hp[1] - S * 0.02, 0], [S * (fox ? 0.1 : 0.05), S * 0.04, S * 0.045], fur, hd);
  m.ell([hp[0] + S * (fox ? 0.22 : 0.14), hp[1] - S * 0.015, 0], [S * 0.023, S * 0.018, S * 0.027], dark, hd);
  if (fox) m.ell([S * 0.13, by + S * 0.03, 0], [S * 0.14, S * 0.17, S * 0.165], '#9b633b');
  if (fruit) m.limb([hp[0] + S * 0.13, hp[1] + S * 0.01, 0], [hp[0] + S * 0.14, hp[1] + S * 0.07, 0], S * 0.028, S * 0.008, dark, hd);
  for (const side of [1, -1]) {
    // big rounded ears, pinker inside
    const e0 = [hp[0] - S * 0.01, hp[1] + S * 0.08, side * S * 0.06], e1 = [hp[0] - S * 0.04, hp[1] + S * (fox ? 0.17 : fruit ? 0.19 : 0.24), side * S * 0.12];
    m.limb(e0, e1, S * 0.06, S * 0.02, dark, hd);
    m.ell([e0[0] + S * 0.02, e0[1] + S * 0.07, e0[2] + side * S * 0.025], [S * 0.025, S * 0.06, S * 0.02], '#b88878', { ...hd, lo: true });
  }
  eyes(m, hp, S * 0.085, S * 0.035, S * 0.075, S * 0.026, P.HEAD, neck);
  // tail membrane between the legs
  if (!fox) m.add(flat(sh => { sh.moveTo(0, -0.5); sh.lineTo(0, 0.5); sh.quadraticCurveTo(-0.9, 0.2, -1, 0); sh.quadraticCurveTo(-0.9, -0.2, 0, -0.5); }, 'xz'),
    place([-S * 0.18, by - S * 0.02, 0], [0, 0, 0.15], [S * (fruit ? 0.14 : 0.28), S * 0.012, S * (fruit ? 0.18 : 0.28)]), shade(s.color, -0.15), { part: P.TAIL, pivot: [-S * 0.18, by, 0] });
  // wings: a membrane a little lighter than the darker arm and finger bones laid over it
  const mem = shade(s.color, 0.1);
  for (const side of [1, -1]) {
    const pivot = [S * 0.1, by + S * 0.06, side * S * 0.1], o = { part: side > 0 ? P.WING_L : P.WING_R, pivot };
    const ext = place(pivot, [0, 0, 0], [S * 0.62, S * 0.012, S * 0.95]);
    const folded = place([pivot[0] - S * 0.1, pivot[1] + S * 0.06, side * S * 0.15], [side * Math.PI * 0.43, side * 0.12, 0], [S * 0.38, S * 0.012, S * 0.25]);
    m.add(batWing(side), folded, mem, { ...o, ext });
    const thick = place([0, 0, 0], [0, 0, 0], [1, 2.2, 1]); // the bones stand a little proud of both faces
    m.add(batBones(side), folded.clone().multiply(thick), dark, { ...o, ext: ext.clone().multiply(thick) });
  }
}
// Forearm and finger bones as thin strips in the wing's own flat coordinates.
function batBones(side) {
  const strip = (a, b, w) => flat(sh => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), nx = -dy / l * w, ny = dx / l * w;
    sh.moveTo(a[0] + nx, side * (a[1] + ny)); sh.lineTo(b[0] + nx * 0.4, side * (b[1] + ny * 0.4));
    sh.lineTo(b[0] - nx * 0.4, side * (b[1] - ny * 0.4)); sh.lineTo(a[0] - nx, side * (a[1] - ny));
  }, 'xz', 1);
  return mergeGeometries([strip([0.34, 0.02], BAT_WRIST, 0.03), ...BAT_FINGERS.map(f => strip(BAT_WRIST, f, 0.017))]);
}

// Butterfly: a slim dark body with clubbed antennae and big painted wings, held together
// straight up over the back when it's perched and opened flat for the flutter of flight.
// The wing is one outline (forewing and hindwing) in its own flat coordinates: x runs forward,
// y out from the body. Its edge is sampled once so the paint can measure how far each point is
// from the margin, which is where both species carry their bold borders and rows of spots.
const quad = (p0, c, p1, n, out) => { for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]); } };
function wingEdge(tails) {
  const e = [[0.14, 0]];
  quad([0.14, 0], [0.5, 0.3], [0.62, 0.96], 14, e);      // leading edge to the forewing tip
  quad([0.62, 0.96], [0.36, 0.94], [0.04, 0.6], 12, e);  // forewing outer edge
  quad([0.04, 0.6], [0.0, 0.86], [-0.34, 0.74], 12, e);  // hindwing
  if (tails) { e.push([-0.66, 0.56], [-0.46, 0.42]); }
  quad(e[e.length - 1], [-0.44, 0.22], [-0.16, 0], 10, e);
  return e;
}
// distance from (x, y) to the wing's outer margin (not the side along the body), and how far along it
function marginDist(edge, x, y) {
  let best = 9, at = 0, run = 0;
  for (let k = 1; k < edge.length; k++) {
    const [ax, ay] = edge[k - 1], [bx, by] = edge[k], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (L * L)));
    const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
    if (ay > 0.02 || by > 0.02) if (d < best) { best = d; at = run + L * t; }
    run += L;
  }
  return [best, at];
}
// The wing as a fine grid of triangles inside the outline (colour is painted per vertex, so the
// veins, spots and bars need vertices to land on).
const inWing = (edge, x, y) => { let c = false; for (let k = 0, j = edge.length - 1; k < edge.length; j = k++) { const [ax, ay] = edge[k], [bx, by] = edge[j]; if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c; } return c; };
const wingCache = new Map();
function butterflyWing(side, tails) {
  const key = side + ':' + !!tails;
  if (wingCache.has(key)) return wingCache.get(key);
  const edge = wingEdge(tails), NX = 44, NY = 32, x0 = -0.7, x1 = 0.66, y1 = 1.0;
  const pos = [];
  const P2 = (i, j) => [x0 + (x1 - x0) * i / NX, y1 * j / NY];
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
    const a = P2(i, j), b = P2(i + 1, j), c = P2(i + 1, j + 1), d = P2(i, j + 1);
    for (const tri of [[a, b, c], [a, c, d]]) {
      const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      if (!inWing(edge, cx, cy)) continue;
      // a thin slab (scaled flat later): the top faces up, the bottom faces down
      const p = tri.map(([x, y]) => [x, y * side]);
      const ny = (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]);
      const up = ny > 0 ? p : [p[0], p[2], p[1]];
      for (const [x, z] of up) pos.push(x, 0.5, z);
      for (const [x, z] of [up[0], up[2], up[1]]) pos.push(x, -0.5, z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const out = mergeVertices(g); // indexed, like every other part, so the model's parts merge
  out.computeVertexNormals();
  wingCache.set(key, out);
  return out;
}
function butterfly(m, s) {
  const S = s.size, by = S * 0.32, tiger = !!s.tails;
  const black = col(s.vein || '#1a1410'), white = col('#f6f2e6');
  m.ell([0, by, 0], [S * 0.3, S * 0.05, S * 0.05], u => (!tiger && !s.birdwing && Math.sin(u.x * 30) > 0.7 && u.y > -0.2 ? white : black));   // body, dotted white on a monarch
  const neck = [S * 0.24, by, 0], hp = [S * 0.3, by + S * 0.01, 0], hd = { part: P.HEAD, pivot: neck };
  m.ell(hp, [S * 0.06, S * 0.055, S * 0.055], s.birdwing ? '#c8281e' : black, hd); // (a birdwing's head is red)
  if (s.birdwing) m.ell([S * 0.2, by + S * 0.01, 0], [S * 0.05, S * 0.055, S * 0.055], '#c8281e', hd); // and its collar
  for (const side of [1, -1]) {
    const tip = [hp[0] + S * 0.3, hp[1] + S * 0.2, side * S * 0.12];
    m.limb(hp, tip, S * 0.008, S * 0.008, black, { ...hd, caps: false });
    m.ell(tip, [S * 0.02, S * 0.02, S * 0.02], black, { ...hd, lo: true });
  }
  const edge = wingEdge(tiger);
  let paint;
  if (s.birdwing) {
    // Rajah Brooke's birdwing: velvet black, with a row of bright green tooth-shaped bands across the
    // forewing (each pointing out between two veins), a green band along the hindwing, and white
    // edging in the gaps of the hindwing's margin.
    const green = col(s.spots), green2 = col(shade(s.spots, -0.25)), velvet = col('#121412');
    paint = u => {
      const x = u.x, y = Math.abs(u.z), [d] = marginDist(edge, x, y);
      if (d < 0.05) return velvet;
      const r = Math.hypot(x + 0.08, y), a = Math.atan2(y, x + 0.08) * 6.2, f = a - Math.floor(a);
      if (x > 0.05) { // the forewing's teeth, tapering outward
        const k = (r - 0.4) / 0.36;
        if (k > 0 && k < 1 && Math.abs(f - 0.5) < 0.36 * (1 - k * 0.85)) return tmp.copy(green).lerp(green2, k * 0.6);
        return velvet;
      }
      if (r > 0.2 && r < 0.44 && y > 0.16 && Math.abs(f - 0.5) < 0.38) return tmp.copy(green2).lerp(green, smooth(0.18, 0.48, r)); // hindwing band
      return velvet;
    };
  } else if (!tiger) {
    // Monarch: burnt orange, deeper on the forewing; black veins fanning from the body; a thick
    // black border with a double row of white spots; the forewing tip black with pale spots.
    const fore = col('#e06a12'), hind = col('#ee8a24');
    paint = u => {
      const x = u.x, y = Math.abs(u.z), [d, t] = marginDist(edge, x, y);
      if (d < 0.105) {
        const row = d < 0.052 ? 0.028 : 0.074, spot = Math.abs(d - row) < 0.012 && Math.abs(((t * (d < 0.052 ? 16 : 11)) % 1) - 0.5) < 0.11;
        return spot ? white : black;
      }
      if (x > 0.34 && y > 0.66) {                                                   // the black wingtip, with its spots
        const sp = Math.hypot(((x - 0.36) * 11) % 1 - 0.5, ((y - 0.66) * 9) % 1 - 0.5) < 0.16;
        return sp ? (x > 0.48 ? white : col('#f2b25a')) : black;
      }
      if (y < 0.05) return black;                                                   // dark where it meets the body
      const a = Math.atan2(y, x + 0.08) * 5.5;                                      // veins
      if (Math.abs(a - Math.round(a)) < 0.06 + 0.02 * (1 - y)) return black;
      if (x > -0.02 && x < 0.1 && y > 0.25 && y < 0.62) return black;               // the vein between fore- and hindwing
      return tmp.copy(x > 0.04 ? fore : hind).multiplyScalar(0.92 + 0.12 * y);
    };
  } else {
    // Tiger swallowtail: lemon yellow with four black bars across the forewing, a black band along
    // the body, a black border of yellow crescents, and blue scales with an orange spot by the tail.
    const yel = col('#f4cc2c'), pale = col('#f8dc5a'), blue = col('#3a64d0'), orange = col('#ec7e22');
    paint = u => {
      const x = u.x, y = Math.abs(u.z), [d, t] = marginDist(edge, x, y);
      if (x < -0.44 && y < 0.6) return black;                                        // the tails
      if (d < 0.12) {
        if (x < 0.02 && d > 0.05 && d < 0.1) { const k = (t * 12) % 1; if (x < -0.18 && k < 0.45) return blue; }
        const crescent = d > 0.02 && d < 0.055 && Math.abs(((t * 22) % 1) - 0.5) < 0.22;
        return crescent ? yel : black;
      }
      if (x < -0.26 && y > 0.38 && y < 0.52) return orange;                          // the eyespot above the tail
      if (y < 0.1) return black;                                                     // the band along the body
      if (x > 0.06 && [0.54, 0.42, 0.29, 0.16].some(b => Math.abs(x - b + y * 0.08) < 0.035)) return black; // tiger bars
      if (x <= 0.06 && x > -0.04 && y > 0.2) return black;                           // the long bar into the hindwing
      return y > 0.5 ? pale : yel;
    };
  }
  for (const side of [1, -1]) {
    const pivot = [S * 0.04, by + S * 0.02, side * S * 0.03];
    const ext = place(pivot, [0, 0, 0], [S * 0.95, S * 0.01, S * 0.95]);
    const folded = place([pivot[0], pivot[1] + S * 0.02, pivot[2]], [-side * Math.PI * 0.47, 0, 0], [S * 0.9, S * 0.01, S * 0.9]);
    m.add(butterflyWing(side, tiger), folded, paint, { part: side > 0 ? P.WING_L : P.WING_R, pivot, ext });
  }
}

// Bumblebee: fuzzy yellow-and-black body, dark head, small smoky wings that blur in flight.
function bee(m, s) {
  const S = s.size * 1.2, by = S * 0.36;
  const yel = col(s.color), blk = col(s.dark || '#1a1612');
  m.ell([S * 0.12, by, 0], [S * 0.2, S * 0.19, S * 0.19], u => (u.y > -0.2 ? yel : blk));            // thorax, yellow on top
  m.ell([-S * 0.2, by - S * 0.02, 0], [S * 0.26, S * 0.2, S * 0.2], u => (u.x > 0.1 || (u.x < -0.3 && u.x > -0.65) ? blk : yel)); // striped abdomen
  const neck = [S * 0.28, by, 0], hd = { part: P.HEAD, pivot: neck };
  m.ell([S * 0.36, by - S * 0.02, 0], [S * 0.11, S * 0.12, S * 0.13], blk, hd);
  for (const side of [1, -1]) m.limb([S * 0.44, by + S * 0.04, side * S * 0.05], [S * 0.6, by + S * 0.18, side * S * 0.1], S * 0.012, S * 0.01, blk, { ...hd, caps: false });
  for (const side of [1, -1]) for (const k of [0, 1, 2]) {
    const x = S * (0.2 - k * 0.14);
    m.limb([x, by - S * 0.12, side * S * 0.1], [x - S * 0.04, S * 0.02, side * S * 0.2], S * 0.02, S * 0.014, blk, { part: P.LEG_FL + k % 2, pivot: [x, by, 0] });
  }
  const wing = col('#d8dee2');
  for (const side of [1, -1]) {
    const pivot = [S * 0.14, by + S * 0.16, side * S * 0.06];
    const ext = place(pivot, [0, 0.35 * side, 0], [S * 0.5, S * 0.01, S * 0.55]);
    const folded = place([pivot[0] - S * 0.12, pivot[1] + S * 0.02, pivot[2]], [0, 0.9 * side, 0], [S * 0.5, S * 0.01, S * 0.3]);
    m.add(flat(sh => { sh.moveTo(0, 0); sh.quadraticCurveTo(0.35, side * 0.5, 0, side * 1); sh.quadraticCurveTo(-0.45, side * 0.55, 0, 0); }, 'xz'),
      folded, wing, { part: side > 0 ? P.WING_L : P.WING_R, pivot, ext });
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

// Sea turtle: a low, streamlined, heart-shaped shell of big scutes on a pale yellow plastron, a
// rounded head with a short beak and big eyes, long flippers swept back like wings in front and
// small paddle-shaped ones behind. Skin in a mosaic of dark scales edged in cream. (hawk: the
// hawksbill's narrow, hooked beak and its amber tortoiseshell.)
function seaTurtle(m, s) {
  const S = s.size, top = col(s.color), seam = col(shade(s.color, -0.45)), streak = col(s.streak || shade(s.color, 0.32));
  const shell = (u, p) => {
    const [gap, id] = cells({ x: p.x * 0.9, y: p.y * 3, z: p.z }, S * 0.2);
    if (gap < 0.1) return seam;
    // fine streaks radiating across each scute, warmer and lighter toward its back edge
    const ray = hash3(Math.round(Math.atan2(p.z, p.x) * 18), id * 7, 2);
    return tmp.copy(top).lerp(streak, ray > 0.62 ? 0.5 : 0.12 + id * 0.18);
  };
  m.add(SPH_XL, place([-S * 0.02, S * 0.2, 0], [0, 0, 0], [S * (s.ridley ? 0.44 : 0.47), S * (s.ridley ? 0.11 : 0.13), S * (s.ridley ? 0.39 : 0.37)]), shell);
  m.ell([S * 0.0, S * 0.15, 0], [S * 0.49, S * 0.035, S * 0.385], shade(s.color, -0.2)); // the marginal scutes along the rim
  m.ell([S * 0.02, S * 0.12, 0], [S * 0.42, S * 0.05, S * 0.31], s.plastron || '#e8d49a');  // pale belly plates
  // skin: dark scales, each edged in cream
  const edge = col(s.skinEdge || (s.ridley ? shade(s.dark, 0.12) : '#c8b88a')), dk = col(s.dark);
  const scales = (u, p) => { const [gap] = cells(p, S * 0.05); return gap < 0.07 ? edge : dk; };
  const hp = [S * 0.56, S * 0.18, 0], neck = [S * 0.4, S * 0.17, 0], hd = { part: P.HEAD, pivot: neck };
  m.limb(neck, [hp[0] - S * 0.06, hp[1], 0], S * 0.085, S * 0.09, scales, hd);
  m.ell(hp, [S * 0.13, S * 0.1, S * 0.1], scales, hd);
  m.ell([hp[0] + S * 0.1, hp[1] - S * 0.03, 0], [S * 0.06, S * 0.045, S * 0.05], s.hawk ? '#3a2e24' : shade(s.dark, -0.3), hd); // beak
  if (s.hawk) m.limb([hp[0] + S * 0.12, hp[1] - S * 0.02, 0], [hp[0] + S * 0.17, hp[1] - S * 0.06, 0], S * 0.02, S * 0.006, '#3a2e24', { ...hd, caps: false });
  eyes(m, hp, S * 0.06, S * 0.03, S * 0.085, S * 0.03, P.HEAD, neck);
  for (const side of [1, -1]) m.ell([hp[0] + S * 0.08, hp[1] + S * 0.04, side * S * 0.105], [S * 0.008, S * 0.008, S * 0.006], '#f4f2ea', { ...hd, lo: true }); // a catchlight
  // flippers (they sweep with the walk cycle: a slow rowing stroke)
  for (const side of [1, -1]) {
    const fp = side > 0 ? P.LEG_FL : P.LEG_FR, hip = [S * 0.26, S * 0.15, side * S * 0.28];
    // a broad, flat paddle, swept back to a pointed tip like a wing
    const front = flat(sh => { sh.moveTo(0.18, 0); sh.quadraticCurveTo(0.3, 0.55 * side, -0.4, 1.0 * side); sh.quadraticCurveTo(-0.12, 0.45 * side, -0.2, 0); sh.lineTo(0.18, 0); }, 'xz');
    m.add(front, place(hip, [0, 0, 0], [S * 0.42, S * 0.035, S * 0.5]), u => (Math.abs(u.z) > 0.82 ? edge : dk), { part: fp, pivot: hip });
    const bp = side > 0 ? P.LEG_BL : P.LEG_BR, rh = [-S * 0.32, S * 0.15, side * S * 0.22];
    const rear = flat(sh => { sh.moveTo(0.1, 0); sh.quadraticCurveTo(0.05, 0.6 * side, -0.3, 0.75 * side); sh.quadraticCurveTo(-0.25, 0.3 * side, -0.2, 0); sh.lineTo(0.1, 0); }, 'xz');
    m.add(rear, place(rh, [0, 0, 0], [S * 0.3, S * 0.03, S * 0.26]), dk, { part: bp, pivot: rh });
  }
  m.limb([-S * 0.42, S * 0.16, 0], [-S * 0.52, S * 0.14, 0], S * 0.03, S * 0.01, scales, { part: P.TAIL, pivot: [-S * 0.42, S * 0.16, 0] });
}

// Dugong: a long, plump grey sea cow with a broad, down-turned bristly muzzle for grazing
// seagrass, little paddle flippers and a whale-like fluked tail. The body is one smooth skin from
// the muzzle to the root of the flukes (no neck: the head just narrows out of the body), and the
// flukes beat up and down, like a whale's, not side to side like a fish's tail.
function dugong(m, s) {
  const S = s.size, cy = S * 0.16, top = col(s.color), belly = col(s.belly || shade(s.color, 0.25)), dk = col(shade(s.color, -0.12));
  const skin = u => (u.y > 0.1 ? tmp.copy(belly).lerp(top, smooth(0.1, 0.6, u.y)) : tmp.copy(belly).lerp(top, 0.25 * smooth(-0.6, 0.1, u.y)));
  // side and top profile from the tail stock (x/S, half-height, half-width, centre line), smoothed
  // through with a Catmull-Rom curve; the last few close the muzzle off round, not to a point
  const K = [[-0.53, 0.022, 0.03, 0.01], [-0.42, 0.04, 0.045, 0.012], [-0.27, 0.085, 0.095, 0.006], [-0.06, 0.128, 0.142, 0], [0.12, 0.128, 0.138, 0],
    [0.27, 0.098, 0.1, -0.008], [0.36, 0.08, 0.084, -0.022], [0.43, 0.062, 0.072, -0.042], [0.465, 0.042, 0.055, -0.052], [0.483, 0.02, 0.03, -0.056], [0.488, 0, 0, -0.057]];
  const cr = (t, c) => {
    const f = t * (K.length - 1), i = Math.min(K.length - 2, Math.floor(f)), u = f - i;
    const p0 = K[Math.max(0, i - 1)][c], p1 = K[i][c], p2 = K[i + 1][c], p3 = K[Math.min(K.length - 1, i + 2)][c];
    return 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
  };
  {
    const R = 64, A = 28, pos = [], uv = [], idx = [];
    for (let i = 0; i <= R; i++) {
      const t = i / R, x = cr(t, 0) * S, ry = Math.max(0, cr(t, 1)) * S, rz = Math.max(0, cr(t, 2)) * S, c = cy + cr(t, 3) * S;
      for (let j = 0; j <= A; j++) {
        const a = j / A * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        pos.push(x, c + ca * ry * (ca < 0 ? 0.92 : 1), sa * rz); // (a little flatter underneath)
        uv.push(2 * t - 1, ca, sa);
      }
    }
    for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) { const a = i * (A + 1) + j, b = a + A + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const unitG = new THREE.BufferGeometry(); unitG.setAttribute('position', new THREE.Float32BufferAttribute(uv, 3));
    m.add(g, new THREE.Matrix4(), skin, { paintGeo: unitG });
  }
  // the muzzle: a broad, flat, bristly disc on the front of the face, turned down to the grass
  m.ell([S * 0.452, cy - S * 0.07, 0], [S * 0.05, S * 0.032, S * 0.07], shade(s.belly || s.color, 0.06), { rot: [0, 0, -1.0] });
  m.ell([S * 0.462, cy - S * 0.085, 0], [S * 0.036, S * 0.014, S * 0.055], shade(s.color, -0.25), { rot: [0, 0, -1.0], lo: true }); // (the darker bristle pad)
  for (const side of [1, -1]) m.ell([S * 0.45, cy - S * 0.008, side * S * 0.022], [S * 0.012, S * 0.006, S * 0.008], '#2a2622', { lo: true }); // nostrils, on top
  eyes(m, [S * 0.36, cy, 0], 0, S * 0.012, S * 0.08, S * 0.011, P.BODY, null);
  // flippers: short paddles just behind the head, angled down and back (it steers with them)
  for (const side of [1, -1]) {
    m.limb([S * 0.2, cy - S * 0.05, side * S * 0.08], [S * 0.14, cy - S * 0.1, side * S * 0.16], S * 0.035, S * 0.02, dk, { seg: 10 });
    m.ell([S * 0.12, cy - S * 0.105, side * S * 0.18], [S * 0.06, S * 0.012, S * 0.04], dk, { rot: [side * 0.35, side * 0.6, 0] });
  }
  // the flukes: broad, swept-back crescents with pointed tips and a notch in the middle, growing
  // straight out of the tail stock (and beating up and down from its root as it swims)
  const tail = { part: P.LEG_BL, pivot: [-S * 0.5, cy + S * 0.01, 0] };
  m.add(flat(sh => {
    sh.moveTo(0.16, 0.0); sh.quadraticCurveTo(0.02, 0.32, -0.42, 1.0); sh.quadraticCurveTo(-0.36, 0.55, -0.62, 0.42);
    sh.quadraticCurveTo(-0.5, 0.12, -0.56, 0.0); sh.quadraticCurveTo(-0.5, -0.12, -0.62, -0.42); sh.quadraticCurveTo(-0.36, -0.55, -0.42, -1.0);
    sh.quadraticCurveTo(0.02, -0.32, 0.16, 0.0);
  }, 'xz', 10), place([-S * 0.5, cy + S * 0.01, 0], [0, 0, 0], [S * 0.21, S * 0.022, S * 0.2]), u => (u.y > 0 ? top : dk), tail);
  // (rounded off where the flukes meet the tail stock)
  m.ell([-S * 0.5, cy + S * 0.01, 0], [S * 0.04, S * 0.018, S * 0.035], top, tail);
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
  } else if (s.sea) m.ell([0, S * 0.22, 0], [S * 0.48, S * 0.15, S * 0.4], shell); // a sea turtle's low, streamlined shell
  else m.ell([0, S * 0.24, 0], [S * 0.46, S * 0.24, S * 0.38], shell);
  m.ell([0, S * 0.13, 0], [S * 0.47, S * 0.05, S * 0.39], shade(s.dark, -0.2));
  const skin = shade(s.dark, 0.1);
  m.ell([S * 0.52, S * 0.2, 0], [S * 0.16, S * 0.12, S * 0.12], skin, { part: P.HEAD, pivot: [S * 0.4, S * 0.18, 0] });
  eyes(m, [S * 0.52, S * 0.2, 0], S * 0.08, S * 0.04, S * 0.09, S * 0.025, P.HEAD, [S * 0.4, S * 0.18, 0]);
  if (s.spots) for (const [x, y, z] of [[0.58, 0.28, 0], [0.5, 0.29, 0.06], [0.5, 0.29, -0.06], [0.6, 0.22, 0.08], [0.6, 0.22, -0.08]])
    m.ell([S * x, S * y, S * z], [S * 0.035, S * 0.02, S * 0.03], s.spots, { part: P.HEAD, pivot: [S * 0.4, S * 0.18, 0], lo: true }); // yellow-spotted river turtle
  const legs = [[S * 0.28, 1, P.LEG_FL], [S * 0.28, -1, P.LEG_FR], [-S * 0.28, 1, P.LEG_BL], [-S * 0.28, -1, P.LEG_BR]];
  if (s.sea) for (const [x, side, part] of legs) {
    // flippers: long, curved paddles in front for flying through the water, short rudders behind
    const front = part < P.LEG_BL, hip = [x, S * 0.16, side * S * 0.3];
    if (front) m.ell([x - S * 0.04, S * 0.15, side * S * 0.56], [S * 0.075, S * 0.02, S * 0.3], skin, { part, pivot: hip, rot: [0, side * -0.65, 0] }); // long and narrow, swept back like a wing
    else m.ell([x - S * 0.1, S * 0.14, side * S * 0.36], [S * 0.07, S * 0.018, S * 0.1], skin, { part, pivot: hip, rot: [0, side * 0.5, 0] });
  }
  else for (const [x, side, part] of legs) { const hip = [x, S * 0.15, side * S * 0.28]; m.limb(hip, [x, S * 0.04, side * S * 0.4], S * 0.08, S * 0.07, skin, { part, pivot: hip }); }
  m.limb([-S * 0.42, S * 0.16, 0], [-S * 0.58, S * 0.08, 0], S * 0.05, S * 0.015, skin, { part: P.TAIL, pivot: [-S * 0.42, S * 0.16, 0] });
}

// Snakes share a continuous S-curve with a gradual taper. Radial paint keeps dorsal stripes,
// constrictor saddles and python networks aligned as the body bends.
function snake(m, s) {
  const S = s.size, Ls = S * 2.2, N = 24, cy = S * (s.heavy ? 0.11 : 0.08);
  const paint = (u, p) => {
    if (u.y < -0.5) return col(s.belly || shade(s.color, 0.4));
    if (s.reticulated) {
      const a = Math.atan2(u.z, u.y), q = p.x / (S * 0.13);
      const net = Math.abs(Math.sin(q + a * 2.4) * Math.sin(q - a * 2.4));
      return net < 0.16 ? col(s.side || '#302b20') : net < 0.3 ? col(s.stripe || '#d5c58d') : col(s.color);
    }
    if (s.saddles) {
      const q = p.x / (S * 0.14), d = Math.abs(Math.sin(q));
      return u.y > 0.25 && d < 0.48 ? col(s.blotches) : Math.abs(u.z) > 0.5 && d > 0.8 ? col(s.side) : col(s.color);
    }
    if (s.mottled) return Math.sin(p.x / (S * 0.13) + u.z * 2) > 0.25 && u.y > -0.25 ? col(s.stripe) : col(s.color);
    if (s.blotches) {
      const q = p.x / (S * 0.16), dx = (q - Math.floor(q) - 0.5) / 0.32, a = Math.atan2(u.z, u.y);
      const da = Math.min(Math.abs(a - 0.78), Math.abs(a + 0.78)) / 0.5;
      return dx * dx + da * da < 1 ? col(s.blotches) : col(s.color);
    }
    if (u.y > 0.92 && s.stripe) return col(s.stripe);
    if (Math.abs(u.z) > 0.86 && Math.abs(u.y) < 0.35 && s.side) return Math.sin(p.x / (S * 0.055)) > 0 ? col(s.side) : col(s.stripe || s.color);
    return col(s.color);
  };
  const pts = [], rad = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N, r = S * (s.heavy ? 0.13 : 0.1) * (t < 0.08 ? 0.75 + t * 3.125 : t > 0.64 ? 1 - smooth(0.64, 1, t) * 0.965 : 1);
    pts.push([Ls * (0.45 - t), cy * (0.55 + r / S * 4.5), Math.sin(t * Math.PI * 1.7 + 0.3) * S * 0.4 * (0.45 + t * 0.55)]);
    rad.push([r * 0.82, r]);
  }
  tube(m, pts, rad, paint, { seg: 24, sub: 4 });
  const hp = [Ls * 0.49, pts[0][1], pts[0][2]], broad = s.heavy || s.reticulated;
  m.ell(hp, [S * 0.13, S * 0.06, S * (broad ? 0.115 : 0.085)], u => u.y < -0.3 ? col(s.belly || shade(s.color, 0.4)) : col(s.color));
  eyes(m, hp, S * 0.05, S * 0.025, S * (broad ? 0.09 : 0.065), S * 0.018, P.BODY, null);

}

// Fish share one body plan, varied per species:
//   deep: a tall body (piranha, and very tall for the round little bluegill)
//   short / long: body length (bluegill short; catfish long and eel-like)
//   spiny: a long spiny-rayed dorsal instead of a trout's small one and adipose (bass, sunfish, snook, snapper)
//   stripe: a dark line along the side (snook's thin lateral line; bass's broad blotchy band)
//   bars: faint vertical bars (bluegill); ear: the dark gill-cover flap; jaw: a big mouth line back under the eye
//   catfish: a broad flat head with barbels, long low fins and a rounded tail
function fish(m, s) {
  const S = s.size, cy = S * 0.2, coho = !!s.head, cat = !!s.catfish, D = (s.deep === 2 ? 2.2 : s.deep ? 1.7 : 1) * (cat ? 0.85 : 1);
  const X = s.short ? 0.78 : s.long ? 1.18 : 1, bx = S * 0.44 * X;
  const back = s.back || (coho ? '#2f4a38' : '#66784a'), flank = s.flank || (coho ? '#c5403a' : '#c6bd86'), belly = s.belly || (coho ? '#9a6a60' : '#ece6d2');
  const red = col('#b8322a'), dk = col(s.stripeColor || shade(back, -0.45));
  // round spots scattered on a jittered grid over the body; dens (0..1) thins them out
  const spotAt = (u, dens) => {
    const gx = u.x * 13, ga = Math.atan2(u.z, u.y) * 3.2, ix = Math.floor(gx), ia = Math.floor(ga);
    if (hash3(ix, ia, 7) < (dens - 0.86) * 7) return false;
    const cx = ix + 0.5 + (hash3(ix, ia, 1) - 0.5) * 0.5, ca = ia + 0.5 + (hash3(ix, ia, 2) - 0.5) * 0.5;
    return Math.hypot(gx - cx, (ga - ca) * 0.8) < 0.2;
  };
  const body = u => {
    const t = (1 - u.x) / 2; // 0 at the nose, 1 at the tail
    let c = u.y > 0.25 ? tmp.copy(col(back)).lerp(col(flank), smooth(0.55, 0.25, u.y)) : tmp.copy(col(flank)).lerp(col(belly), smooth(-0.25, -0.6, u.y));
    if (coho && t < 0.3) c = tmp.copy(col(back)).lerp(col(belly), smooth(0.1, -0.5, u.y));
    if (s.rear) c = tmp.copy(c).lerp(col(s.rear), smooth(0.3, 0.95, t)); // (the cleaner wrasse: pale in front, blue behind)
    if (s.scales && u.y > -0.6) { // big scales edged in a second colour (the parrotfish's pink-rimmed mosaic)
      const sx = u.x * 16, sa = Math.atan2(u.z, u.y) * 7 + Math.floor(sx) * 0.5; // (offset rows, like real scales)
      const fx = sx - Math.floor(sx), fa = sa - Math.floor(sa), d = Math.hypot(fx - 0.5, (fa - 0.5) * 0.9);
      if (d > 0.42) c = tmp.copy(c).lerp(col(s.scales), 0.55);
    }
    if (s.tailRed && u.y < 0.35) c = tmp.copy(c).lerp(red, smooth(0.45, 0.9, t) * 0.85); // arapaima's red-edged rear scales
    if (s.bars && u.y > -0.35 && Math.sin(u.x * 15) > 0.45) c = tmp.copy(c).lerp(dk, 0.32);
    if (s.bands) for (const b of [0.2, 0.5, 0.86]) { // a clownfish's three white bands, edged in black
      const d = Math.abs(t - b), w = b > 0.8 ? 0.035 : 0.055;
      if (d < w) return col(s.bands);
      if (d < w + 0.02) return col('#141210');
    }
    if (s.eyeBar && Math.abs(t - 0.13) < 0.035 && u.y > -0.5) return col(s.eyeBar);
    if (s.blackBands) for (const [a, b] of s.blackBands) if (t > a && t < b) return col(s.bandColor || '#141210'); // (the Moorish idol's two broad black bands)
    if (s.lines && u.y > -0.3 && Math.abs(Math.sin(u.x * 30 + Math.atan2(u.z, u.y) * 2)) > 0.92 && t < 0.35) return col(s.lines); // (the humphead's squiggly face markings)
    if (s.palette) { // the blue tang's dark "palette": a band from the eye to the tail along the upper flank, with a blue window in it
      const ang = Math.abs(Math.atan2(u.z, u.y));
      if (t > 0.16 && t < 0.92 && ang > 0.55 && ang < 1.6 - (t - 0.16) * 0.7 && !(t > 0.38 && t < 0.7 && ang < 1.05)) return col(s.palette);
    }
    if (s.shark && u.y < -0.2) c = tmp.copy(c).lerp(col(belly), smooth(-0.2, -0.5, u.y)); // pale underneath
    if (s.stripe && t > 0.12) {
      const w = s.stripe === 'band' ? 0.12 + 0.06 * Math.sin(u.x * 19) * Math.sin(u.x * 7 + 1) // bass: a ragged band of blotches
        : s.stripe === 'cleaner' ? 0.04 + t * 0.17 : 0.045; // (the cleaner wrasse's stripe widens toward the tail)
      if (Math.abs(u.y - 0.04) < w) return dk;
    }
    if (s.grid && u.y > -0.75) { // the hawkfish's red checks: lines along the body crossed by lines around it
      const gx = u.x * 9, ga = Math.atan2(u.z, u.y) * 2.6;
      if (gx - Math.floor(gx) < 0.2 || ga - Math.floor(ga) < 0.2) return col(s.grid);
    }
    const dens = coho ? 0.95 : 0.96 - t * 0.1; // cutthroat spots gather toward the tail
    if (s.spots && u.y > -0.35 && spotAt(u, dens)) return col(s.spots);
    return c;
  };
  // one smooth body from the tail stock to the snout (no seam where a head would join): a thin
  // stock swelling to the deepest point, then easing down to the nose, blunt on the deep fish
  const x0 = -bx - S * 0.06, x1 = bx * 1.1, tm = s.deep ? 0.5 : 0.55, ryM = S * 0.15 * D, rzM = S * (cat ? 0.1 : 0.085);
  const nosePow = s.deep || cat ? 0.5 : s.shark ? 0.85 : 0.62;
  const prof = x => {
    const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    const k = t < tm ? 0.42 + 0.58 * smooth(0, tm, t) : Math.pow(Math.max(0, 1 - ((t - tm) / (1 - tm)) ** 2), nosePow);
    const kz = t < tm ? 0.5 + 0.5 * smooth(0, tm, t) : Math.pow(Math.max(0, 1 - ((t - tm) / (1 - tm)) ** 2), cat ? 0.35 : nosePow);
    const end = Math.sqrt(Math.min(1, t / 0.03)); // closed off just inside the tail fin
    return { t, ry: ryM * k * end, rz: rzM * kz * end, cy: cy - S * 0.03 * smooth(0.7, 1, t) };
  };
  {
    const R = 56, A = 28, pos = [], idx = [], uv = [];
    for (let i = 0; i <= R; i++) {
      const x = x0 + (x1 - x0) * i / R, { t, ry, rz, cy: c } = prof(x);
      for (let j = 0; j <= A; j++) {
        const a = j / A * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        pos.push(x, c + ca * Math.max(ry, S * 0.002), sa * Math.max(rz, S * 0.002));
        uv.push(2 * t - 1, ca, sa);
      }
    }
    for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) { const a = i * (A + 1) + j, b = a + A + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const unitG = new THREE.BufferGeometry(); unitG.setAttribute('position', new THREE.Float32BufferAttribute(uv, 3));
    const paint = u => {
      if (s.throat && u.y < -0.35 && u.x > 0.55 && u.x < 0.9) return col(s.throat); // the cutthroat's red slash under the jaw
      if (coho && u.x > 0.82) return tmp.copy(col('#3a3a30')).lerp(col(belly), smooth(0.2, -0.6, u.y)); // dark kype
      return body(u);
    };
    m.add(g, new THREE.Matrix4(), paint, { paintGeo: unitG });
  }
  // a point on the body's surface at x, a fraction dy of the half-height above the midline
  const surf = (x, dy, side, out = 1) => { const p = prof(x); return [x, p.cy + p.ry * dy, side * p.rz * Math.sqrt(Math.max(0, 1 - dy * dy)) * out]; };
  const nose = [x1, prof(x1 - S * 0.01).cy, 0];
  if (s.whiskers) for (const side of [1, -1]) for (const [dy, dz, l] of [[0, 0.05, 1.3], [-0.05, 0.12, 1], [-0.03, 0.08, 0.8]]) // catfish barbels
    m.limb([nose[0] - S * 0.02, nose[1] - S * 0.01, side * S * 0.04], [nose[0] + S * 0.05 * l, nose[1] - S * (0.07 + dy) * l, side * S * dz * 2 * l], S * 0.012, S * 0.004, back, { caps: false });
  if (s.snout) m.limb([x1 - S * 0.04, nose[1] - S * 0.004, 0], [x1 + S * 0.13, nose[1] - S * 0.012, 0], S * 0.032, S * 0.014, shade(s.flank || '#ffffff', -0.04)); // (the hawkfish's long snout)
  const ex = x1 - S * (s.deep ? 0.11 : 0.1);
  { // the gape across the front of the snout, closing off the two mouth lines
    const g = prof(x1 - S * 0.012);
    m.ell([x1 - S * 0.008, g.cy - g.ry * 0.3, 0], [S * 0.014, S * 0.014, g.rz * 1.04], '#3a2e28', { lo: true });
  }
  for (const side of [1, -1]) {
    // a big round eye with a gold rim and a catchlight, set into the side of the head
    const e = surf(ex, cat ? 0.45 : 0.3, side, 0.92);
    m.ell(e, [S * 0.036, S * 0.036, S * 0.016], s.eye || '#e8d890', { lo: true });
    m.ell([e[0] + S * 0.003, e[1], e[2] + side * S * 0.01], [S * 0.022, S * 0.022, S * 0.009], '#111010', { lo: true });
    m.ell([e[0] + S * 0.01, e[1] + S * 0.01, e[2] + side * S * 0.016], [S * 0.007, S * 0.007, S * 0.004], '#f4f2ea', { lo: true });
    if (s.ear) m.ell(surf(ex - S * 0.1, 0.12, side, 0.97), [S * 0.04, S * 0.035, S * 0.012], s.ear, { lo: true }); // the bluegill's dark "ear"
    // the mouth: a line curving back from the tip of the snout (a long one on bass and snook),
    // a soft darker shade of the face rather than black, over a pale lower lip
    const ml = s.jaw ? x1 - ex + S * 0.02 : cat ? S * 0.09 : S * 0.065, mc = col('#2a1e1a').clone().lerp(col(flank), 0.45);
    let prev = surf(x1 - S * 0.012, -0.28, side, 1.04);
    for (let k = 1; k <= 3; k++) {
      const pt = surf(x1 - S * 0.012 - ml * k / 3, [-0.34, -0.36, -0.29][k - 1], side, 1.04); // dipping, then turning up at the corner
      m.limb(prev, pt, S * 0.01, S * (k === 3 ? 0.005 : 0.009), mc, { caps: k === 3 });
      if (k < 3) { const lo = (p, f) => [p[0], p[1] - S * 0.016, p[2] * f]; m.limb(lo(prev, 0.97), lo(pt, 0.97), S * 0.009, S * 0.008, shade(belly, 0.15), { caps: false }); } // a pale lower lip
      prev = pt;
    }
    const pe = surf(ex - S * 0.12, -0.45, side, 1);
    m.ell([pe[0] - S * 0.03, pe[1], pe[2] + side * S * 0.01], [S * 0.07, S * 0.012, S * 0.03], shade(flank, -0.1), { rot: [side * 0.5, 0.3 * side, -0.4] }); // pectoral
  }
  // the tail that sweeps side to side: forked, or rounded on a catfish
  const tailC = s.tailRed ? '#9a2a22' : s.finColor || shade(s.back || (coho ? back : '#7a8452'), -0.05), tailCol = s.tailColor || tailC;
  const tail = { part: P.TAIL, pivot: [-bx - S * 0.02, cy, 0] };
  const tailShape = s.shark ? sh => { sh.moveTo(0, 0.18); sh.quadraticCurveTo(-0.55, 0.55, -1.15, 1.05); sh.quadraticCurveTo(-0.8, 0.3, -0.62, 0); sh.quadraticCurveTo(-0.7, -0.25, -0.75, -0.5); sh.quadraticCurveTo(-0.4, -0.25, 0, -0.16); sh.lineTo(0, 0.18); }
    : cat ? sh => { sh.moveTo(0, 0.25); sh.quadraticCurveTo(-0.7, 0.6, -0.95, 0); sh.quadraticCurveTo(-0.7, -0.6, 0, -0.25); sh.lineTo(0, 0.25); }
    : s.tailShape === 'round' ? sh => { sh.moveTo(0, 0.2); sh.quadraticCurveTo(-0.95, 0.8, -0.95, 0); sh.quadraticCurveTo(-0.95, -0.8, 0, -0.2); sh.lineTo(0, 0.2); }
    : s.tailShape === 'truncate' ? sh => { sh.moveTo(0, 0.2); sh.lineTo(-0.8, 0.62); sh.quadraticCurveTo(-0.86, 0, -0.8, -0.62); sh.lineTo(0, -0.2); sh.lineTo(0, 0.2); }
    : s.tailShape === 'lunate' ? sh => { sh.moveTo(0, 0.15); sh.quadraticCurveTo(-0.5, 0.4, -1.05, 1.0); sh.quadraticCurveTo(-0.62, 0.25, -0.58, 0); sh.quadraticCurveTo(-0.62, -0.25, -1.05, -1.0); sh.quadraticCurveTo(-0.5, -0.4, 0, -0.15); sh.lineTo(0, 0.15); }
    : sh => { sh.moveTo(0, 0.2); sh.quadraticCurveTo(-0.6, 0.5, -1, 0.7); sh.quadraticCurveTo(-0.72, 0.2, -0.75, 0); sh.quadraticCurveTo(-0.72, -0.2, -1, -0.7); sh.quadraticCurveTo(-0.6, -0.5, 0, -0.2); sh.lineTo(0, 0.2); };
  const tailH = S * 0.2 * (s.deep === 2 ? 1.2 : 1);
  m.add(flat(tailShape), place([-bx - S * 0.06, cy, 0], [0, 0, 0], [S * 0.2, tailH, S * 0.013]), tailCol, tail);
  if (s.finEdge) m.add(flat(tailShape), place([-bx - S * 0.05, cy, 0], [0, 0, 0], [S * 0.23, tailH * 1.14, S * 0.009]), s.finEdge, tail); // a dark rim round it
  const fin = flat(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.2, 0.9, -0.2, 1); sh.quadraticCurveTo(-0.3, 0.4, -0.5, 0); sh.lineTo(0.5, 0); });
  if (cat) {
    // long, low dorsal and anal fins running almost to the tail
    const ribbon = flat(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.45, 1, 0.2, 1); sh.lineTo(-0.45, 1); sh.quadraticCurveTo(-0.5, 0.6, -0.5, 0); sh.lineTo(0.5, 0); });
    m.add(ribbon, place([-S * 0.12, cy + S * 0.1, 0], [0, 0, 0], [bx * 1.25, S * 0.07, S * 0.01]), tailC);
    m.add(ribbon, place([-S * 0.2, cy - S * 0.09, 0], [Math.PI, 0, 0], [bx * 0.95, S * 0.06, S * 0.01]), tailC);
  }
  if (s.beak) { // a parrotfish's beak: two plates of fused teeth at the tip of the snout
    const bp = prof(x1 - S * 0.02);
    m.ell([x1 - S * 0.012, bp.cy + S * 0.012, 0], [S * 0.028, S * 0.016, S * 0.03], s.beak);
    m.ell([x1 - S * 0.016, bp.cy - S * 0.014, 0], [S * 0.024, S * 0.014, S * 0.026], s.beak);
  }
  if (s.hump) { // the humphead wrasse's bulging forehead and thick lips
    const hx = x1 - S * 0.17, hp = prof(hx);
    m.ell([hx, hp.cy + hp.ry * 0.72, 0], [S * 0.13, S * 0.11, hp.rz * 0.9], col(back));
    m.ell([x1 - S * 0.02, prof(x1 - S * 0.02).cy - S * 0.015, 0], [S * 0.03, S * 0.025, S * 0.04], shade(belly, -0.1));
  }
  if (s.streamer) { // a long white streamer trailing back from the Moorish idol's dorsal fin
    let prev = [S * 0.04, cy + S * 0.14 * D, 0];
    for (let k = 1; k <= 6; k++) { // rising from the fin, then arching back and drooping, like a pennant
      const t = k / 6, pt = [S * (0.04 - t * 0.55), cy + S * (0.14 + Math.sin(t * Math.PI * 0.8) * 0.13) * D, 0];
      m.limb(prev, pt, S * (0.016 - t * 0.01), S * (0.016 - t * 0.012), '#f4f2ea', { caps: k === 6 }); prev = pt;
    }
  }
  if (cat) { /* (its long fins are drawn above) */ } else if (s.shark) {
    // a tall, swept dorsal and big stiff pectorals, white-tipped, and a tail with a long upper lobe
    const tipped = (base, tip) => u => (u.y > 0.62 ? col(tip) : col(base));
    const dorsal = flat(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.25, 0.7, -0.1, 1); sh.quadraticCurveTo(-0.15, 0.45, -0.5, 0); sh.lineTo(0.5, 0); });
    m.add(dorsal, place([S * 0.02, cy + S * 0.12, 0], [0, 0, 0], [S * 0.18, S * 0.17, S * 0.012]), tipped(tailC, s.finTip || '#f4f4f0'));
    m.add(fin, place([-bx * 0.62, cy + S * 0.08, 0], [0, 0, 0], [S * 0.07, S * 0.06, S * 0.01]), tipped(tailC, s.finTip || '#f4f4f0'));
    for (const side of [1, -1]) m.add(dorsal, place([S * 0.12, cy - S * 0.07, side * S * 0.07], [side * 1.25, 0, -0.35], [S * 0.16, S * 0.13, S * 0.012]), tailC);
  } else if (s.spiny) {
    // a long dorsal: spiny in front, softer behind
    const spines = flat(sh => { sh.moveTo(0.5, 0); for (let k = 0; k <= 8; k++) { const x = 0.45 - k * 0.11; sh.lineTo(x + 0.04, 0.45 + 0.5 * Math.sin((k + 1) / 10 * Math.PI) ** 0.6); sh.lineTo(x - 0.03, 0.4 + 0.3 * Math.sin((k + 1) / 10 * Math.PI)); } sh.quadraticCurveTo(-0.5, 0.5, -0.55, 0); sh.lineTo(0.5, 0); }, 'xy', 3);
    m.add(spines, place([-S * 0.04 * X, cy + S * 0.12 * D * 0.92, 0], [0, 0, 0], [bx * 0.95, S * 0.12, S * 0.012]), tailC);
    if (s.finEdge) m.add(spines, place([-S * 0.04 * X, cy + S * 0.12 * D * 0.92 - S * 0.006, 0], [0, 0, 0], [bx * 1.0, S * 0.135, S * 0.008]), s.finEdge);
    if (s.longAnal) { // a long, low anal fin, mirroring the dorsal
      const ribbon = flat(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.35, 1, 0.1, 1); sh.lineTo(-0.4, 1); sh.quadraticCurveTo(-0.5, 0.6, -0.5, 0); sh.lineTo(0.5, 0); });
      m.add(ribbon, place([-bx * 0.42, cy - S * 0.12 * D * 0.86, 0], [Math.PI, 0, 0], [bx * 0.85, S * 0.09, S * 0.011]), s.analColor || tailC);
    } else m.add(fin, place([-bx * 0.5, cy - S * 0.11 * D * 0.9, 0], [Math.PI, 0, 0], [S * 0.11, S * 0.08, S * 0.01]), shade(flank, -0.15));
  } else if (s.rearFins) {
    // the arapaima's dorsal and anal fins sit far back, just in front of the tail, like a paddle
    const ribbon = flat(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.3, 0.9, 0.0, 1); sh.quadraticCurveTo(-0.45, 0.9, -0.5, 0); sh.lineTo(0.5, 0); });
    m.add(ribbon, place([-bx * 0.72, cy + S * 0.08, 0], [0, 0, 0], [bx * 0.5, S * 0.09, S * 0.011]), tailC);
    m.add(ribbon, place([-bx * 0.72, cy - S * 0.08, 0], [Math.PI, 0, 0], [bx * 0.5, S * 0.08, S * 0.011]), tailC);
  } else {
    // dorsal, adipose and anal fins
    m.add(fin, place([S * 0.02, cy + S * 0.12 * D, 0], [0, 0, 0], [S * 0.13, S * 0.1, S * 0.01]), tailC);
    m.ell([-bx * 0.68, cy + S * 0.075, 0], [S * 0.035, S * 0.025, S * 0.008], tailC, { lo: true });
    m.add(fin, place([-bx * 0.5, cy - S * 0.11 * D, 0], [Math.PI, 0, 0], [S * 0.09, S * 0.07, S * 0.01]), shade(flank, -0.15));
  }
}

// A smooth fish body lofted along x: deepest at tm (0 = tail end, 1 = snout), easing off to a thin
// tail stock behind and a snout in front (powF: how pointed, drop: how far the snout dips). Paint
// gets (u, p): u.x runs -1 tail .. 1 nose, u.y is up (+1) to down (-1) round the body; p is the
// position itself.
function finBody(m, { x0, x1, tm, cy, ry, rz, ryEnd = 0.1, rzEnd = 0.25, powF = 1.2, powB = 1.4, drop = 0, wide = 1 }, paint) {
  const R = 52, A = 24, pos = [], uv = [], idx = [];
  for (let i = 0; i <= R; i++) {
    const t = i / R, x = x0 + (x1 - x0) * t, d = Math.abs(t - tm) / (t < tm ? tm : 1 - tm);
    const k = Math.pow(Math.max(0, 1 - Math.pow(d, t > tm ? powF : powB)), 0.85);
    // (the tail end stays open into the tail stock, at ryEnd; the snout closes off in a rounded tip)
    const front = t > tm, yy = ry * (front ? k : ryEnd + (1 - ryEnd) * k), zz = rz * (front ? Math.pow(Math.max(0, 1 - Math.pow(d, powF)), 0.6) : rzEnd + (1 - rzEnd) * Math.pow(Math.max(0, 1 - d * d), 0.5)) * (front ? 1 + (wide - 1) * d : 1);
    const c = cy - drop * (t > tm ? smooth(0.3, 1, d) : 0);
    for (let j = 0; j <= A; j++) { const a = j / A * Math.PI * 2; pos.push(x, c + Math.cos(a) * yy, Math.sin(a) * zz); uv.push(2 * t - 1, Math.cos(a), Math.sin(a)); }
  }
  for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) { const a = i * (A + 1) + j, b = a + A + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const unitG = new THREE.BufferGeometry(); unitG.setAttribute('position', new THREE.Float32BufferAttribute(uv, 3));
  m.add(g, new THREE.Matrix4(), paint, { paintGeo: unitG });
}

// Threadfin butterflyfish: a round, flat disc, white with fine dark lines running diagonally up
// the front of the flank and down across the back, a black bar through the eye, the rear of the
// body and the fins bright yellow, a black eyespot near the back of the dorsal fin with a thread
// trailing from it, and a short, pointed snout for picking at coral.
function butterflyfish(m, s) {
  const S = s.size, cy = S * 0.32;
  const white = col('#f6f4ee'), yellow = col('#f2c430'), black = col('#18161a'), line = col('#7a7268');
  const coat = (u, p) => {
    const bx = p.x / S, by = (p.y - cy) / S;
    if (bx > 0.19 && bx < 0.255 && by > -0.2) return black;                  // the bar through the eye
    if (bx < -0.19 + by * 0.25) return yellow;                               // the yellow back end
    if (bx < 0.19) {
      // chevrons: lines slanting up and back on the front of the flank, down and back behind
      const q = by > 0.02 - bx * 0.3 ? bx + by * 1.1 : bx - by * 1.1;
      if (Math.abs(Math.sin(q * 32)) > 0.8) return line;
    }
    return white;
  };
  finBody(m, { x0: -S * 0.36, x1: S * 0.36, tm: 0.47, cy, ry: S * 0.28, rz: S * 0.05, ryEnd: 0.12, powF: 1.05, drop: S * 0.04 }, coat);
  m.ell([S * 0.36, cy - S * 0.04, 0], [S * 0.01, S * 0.012, S * 0.012], '#3a2e2a', { lo: true }); // a tiny mouth
  for (const side of [1, -1]) {
    m.ell([S * 0.22, cy + S * 0.05, side * S * 0.042], [S * 0.03, S * 0.03, S * 0.01], '#c8b880', { lo: true });
    m.ell([S * 0.222, cy + S * 0.05, side * S * 0.048], [S * 0.019, S * 0.019, S * 0.007], '#101010', { lo: true });
    m.ell([S * 0.228, cy + S * 0.058, side * S * 0.052], [S * 0.006, S * 0.006, S * 0.003], '#f4f2ea', { lo: true });
    m.ell([S * 0.08, cy - S * 0.04, side * S * 0.046], [S * 0.05, S * 0.02, S * 0.008], '#f4e4a0', { rot: [0, 0, -0.3] }); // pectoral fin
  }
  const fin = (draw, color, thick) => m.add(flat(draw, 'xy', 10), place([0, cy, 0], [0, 0, 0], [S, S, S * thick]), color);
  // a long dorsal from the forehead to the tail stock: white in front, yellow behind, with the black spot
  fin(sh => { sh.moveTo(0.14, 0.2); sh.quadraticCurveTo(0.02, 0.36, -0.16, 0.36); sh.quadraticCurveTo(-0.3, 0.34, -0.32, 0.14); sh.lineTo(-0.1, 0.24); sh.lineTo(0.14, 0.2); }, yellow, 0.009);
  fin(sh => { sh.moveTo(0.14, 0.2); sh.quadraticCurveTo(0.06, 0.32, -0.04, 0.34); sh.lineTo(-0.04, 0.26); sh.lineTo(0.14, 0.2); }, white, 0.012);
  for (const side of [1, -1]) {
    m.ell([-S * 0.22, cy + S * 0.27, side * S * 0.006], [S * 0.02, S * 0.02, S * 0.003], '#141210', { lo: true }); // the eyespot
    m.ell([-S * 0.22, cy + S * 0.27, side * S * 0.004], [S * 0.028, S * 0.028, S * 0.003], '#f6f2e6', { lo: true });
  }
  let prev = [-S * 0.24, cy + S * 0.34, 0]; // the thread
  for (let k = 1; k <= 4; k++) { const t = k / 4, pt = [-S * (0.24 + t * 0.2), cy + S * (0.34 - t * t * 0.08), 0]; m.limb(prev, pt, S * 0.008, S * 0.006, yellow, { caps: k === 4, part: P.TAIL, pivot: [0, cy, 0] }); prev = pt; }
  fin(sh => { sh.moveTo(0.1, -0.2); sh.quadraticCurveTo(-0.04, -0.34, -0.2, -0.3); sh.quadraticCurveTo(-0.3, -0.24, -0.3, -0.12); sh.lineTo(0.1, -0.2); }, yellow, 0.009);
  // a short, square-ended tail, yellow with a clear edge
  const tail = { part: P.TAIL, pivot: [-S * 0.35, cy, 0] };
  m.add(flat(sh => { sh.moveTo(0, 0.07); sh.lineTo(-0.13, 0.13); sh.quadraticCurveTo(-0.15, 0, -0.13, -0.13); sh.lineTo(0, -0.07); sh.lineTo(0, 0.07); }), place([-S * 0.35, cy, 0], [0, 0, 0], [S, S, S * 0.009]), yellow, tail);
}

// Whitetip reef shark: a long, slim torpedo, grey above and pale below, with a blunt, flattened
// snout, catlike eyes, five gill slits, a tall swept first dorsal fin and the upper lobe of the
// tail tipped bright white, broad pectoral fins, and a tail whose upper lobe is much the longer.
function shark(m, s) {
  const S = s.size, cy = S * 0.16, top = col(s.back || '#7a8088'), mid = col(s.flank || '#949aa2'), belly = col(s.belly || '#e4e6e8'), tip = col('#f6f6f2');
  const skin = u => (u.y > 0.15 ? tmp.copy(mid).lerp(top, smooth(0.15, 0.7, u.y)) : tmp.copy(belly).lerp(mid, smooth(-0.55, 0.05, u.y)));
  finBody(m, { x0: -S * 0.44, x1: S * 0.5, tm: 0.42, cy, ry: S * 0.1, rz: S * 0.1, ryEnd: 0.18, rzEnd: 0.3, powF: 2.2, powB: 1.6, wide: 1.1 }, skin); // (a broad head and a blunt, rounded snout)
  // eyes, gill slits, and a mouth tucked under the snout
  m.ell([S * 0.38, cy - S * 0.045, 0], [S * 0.035, S * 0.006, S * 0.04], '#8a8e94', { lo: true });
  for (const side of [1, -1]) {
    m.ell([S * 0.37, cy + S * 0.02, side * S * 0.055], [S * 0.016, S * 0.011, S * 0.007], '#1a1c20', { lo: true });
    m.ell([S * 0.375, cy + S * 0.024, side * S * 0.058], [S * 0.005, S * 0.004, S * 0.002], '#d8dad8', { lo: true });
    for (let k = 0; k < 5; k++) { const x = S * (0.25 - k * 0.022), z = side * S * 0.088; m.limb([x, cy + S * 0.035, z], [x - S * 0.008, cy - S * 0.035, z], S * 0.004, S * 0.004, '#4a5058', { caps: false }); }
  }
  const fin = (draw, at, scale, color, rot = [0, 0, 0], o = {}) => m.add(flat(draw, 'xy', 8), place(at, rot, scale), color, o);
  // first dorsal: tall and swept back, its tip white
  fin(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.2, 0.55, -0.15, 1); sh.quadraticCurveTo(-0.15, 0.4, -0.5, 0); sh.lineTo(0.5, 0); }, [S * 0.04, cy + S * 0.085, 0], [S * 0.2, S * 0.16, S * 0.012], top);
  fin(sh => { sh.moveTo(0.04, 0.72); sh.quadraticCurveTo(-0.08, 0.86, -0.15, 1); sh.quadraticCurveTo(-0.15, 0.82, -0.18, 0.72); sh.lineTo(0.04, 0.72); }, [S * 0.04, cy + S * 0.085, 0], [S * 0.2, S * 0.16, S * 0.016], tip);
  fin(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.1, 0.6, -0.2, 1); sh.quadraticCurveTo(-0.2, 0.4, -0.5, 0); sh.lineTo(0.5, 0); }, [-S * 0.27, cy + S * 0.05, 0], [S * 0.07, S * 0.05, S * 0.01], top); // second dorsal
  fin(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.1, -0.6, -0.2, -1); sh.quadraticCurveTo(-0.2, -0.4, -0.5, 0); sh.lineTo(0.5, 0); }, [-S * 0.26, cy - S * 0.05, 0], [S * 0.06, S * 0.045, S * 0.01], mid); // anal
  // pectoral fins: broad, swept back and angled down
  for (const side of [1, -1]) {
    const pec = flat(sh => { sh.moveTo(0.3, 0); sh.quadraticCurveTo(0.1, 0.6 * side, -0.45, 1 * side); sh.quadraticCurveTo(-0.15, 0.4 * side, -0.2, 0); sh.lineTo(0.3, 0); }, 'xz', 8);
    m.add(pec, place([S * 0.2, cy - S * 0.06, side * S * 0.07], [side * 0.35, 0, 0], [S * 0.2, S * 0.012, S * 0.16]), u => (u.y > 0 ? top : belly));
    m.add(pec, place([-S * 0.12, cy - S * 0.06, side * S * 0.04], [side * 0.3, 0, 0], [S * 0.08, S * 0.01, S * 0.06]), mid); // pelvic
  }
  // the tail: the body itself carries on, tapering and bending up into the long upper lobe (white
  // at the tip), with a narrow fin along its underside and a small lower lobe; not a flat paddle
  const tail = { part: P.TAIL, pivot: [-S * 0.42, cy, 0] };
  const spine = [[-0.42, 0], [-0.5, 0.035], [-0.58, 0.08], [-0.66, 0.13], [-0.72, 0.17]];
  for (let k = 1; k < spine.length; k++) {
    const [x0, y0] = spine[k - 1], [x1, y1] = spine[k], r0 = S * (0.034 - (k - 1) * 0.007), r1 = S * Math.max(0.005, 0.034 - k * 0.007);
    m.limb([S * x0, cy + S * y0, 0], [S * x1, cy + S * y1, 0], r0, r1, k === spine.length - 1 ? tip : top, { ...tail, caps: k === spine.length - 1 });
  }
  m.add(flat(sh => { sh.moveTo(-0.44, 0.0); sh.lineTo(-0.66, 0.125); sh.quadraticCurveTo(-0.645, 0.09, -0.6, 0.075); sh.quadraticCurveTo(-0.56, 0.04, -0.52, -0.005); sh.lineTo(-0.44, 0.0); }, 'xy', 6),
    place([0, cy, 0], [0, 0, 0], [S, S, S * 0.012]), top, tail);
  m.add(flat(sh => { sh.moveTo(-0.43, -0.015); sh.quadraticCurveTo(-0.5, -0.05, -0.57, -0.11); sh.quadraticCurveTo(-0.55, -0.05, -0.53, -0.01); sh.lineTo(-0.43, -0.015); }, 'xy', 6),
    place([0, cy, 0], [0, 0, 0], [S, S, S * 0.012]), top, tail); // the small lower lobe
}

// Moorish idol: a tall, flat disc of a fish, white and yellow with two broad black bands (the
// first through the eye), a long tube of a snout with an orange saddle on it, a towering dorsal fin
// that sweeps back into a long white streamer, a tall swept-back anal fin, and a black tail with a
// white edge. Seen side-on it's almost a triangle.
function idol(m, s) {
  const S = s.size, cy = S * 0.32;
  const white = col('#f6f3ea'), yellow = col('#f2c838'), black = col('#16151a'), orange = col('#e8862e');
  const coat = (u, p) => {
    const bx = p.x / S, by = (p.y - cy) / S;
    if (bx > 0.25 && bx < 0.32 && by > -0.01 + (bx - 0.25) * 0.6 && Math.abs(u.z) < 0.75) return orange; // the orange saddle across the top of the snout
    if (bx > 0.07 && bx < 0.21) return black;                         // the band through the eye
    if (bx > -0.27 && bx < -0.12) return black;                       // the band at the back
    if (bx <= -0.27) return yellow;                                   // the tail stock
    if (bx <= 0.07 && bx >= -0.12) return by < -0.06 - (bx + 0.12) * 0.5 ? yellow : white; // white, with yellow low at the back
    return white;                                                     // the face and snout
  };
  // body: one tall, thin, diamond-shaped disc (deepest just behind the eye), narrowing to the tail
  // stock behind, and in front sloping steeply down into a short, slightly down-turned snout
  {
    const R = 48, A = 24, x0 = -S * 0.36, x1 = S * 0.38, tm = 0.55, pos = [], idx = [];
    for (let i = 0; i <= R; i++) {
      const t = i / R, x = x0 + (x1 - x0) * t, d = Math.abs(t - tm) / (t < tm ? tm : 1 - tm);
      const front = t > tm ? smooth(0.3, 1, d) : 0; // (the forehead drops away toward the snout)
      const ry = S * (0.035 + 0.28 * Math.pow(Math.max(0, 1 - Math.pow(d, t > tm ? 1.1 : 1.4)), 0.85)), rz = S * (0.014 + 0.045 * Math.pow(Math.max(0, 1 - d * d), 0.5));
      const c = cy - S * 0.07 * front;
      for (let j = 0; j <= A; j++) { const a = j / A * Math.PI * 2; pos.push(x, c + Math.cos(a) * ry, Math.sin(a) * Math.max(rz, S * 0.018)); }
    }
    for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) { const a = i * (A + 1) + j, b = a + A + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    m.add(g, new THREE.Matrix4(), coat);
  }
  m.ell([S * 0.38, cy - S * 0.07, 0], [S * 0.012, S * 0.016, S * 0.018], '#3a2e2a', { lo: true }); // a tiny mouth
  // eyes in the black band, with a pale ring so they still show
  for (const side of [1, -1]) {
    m.ell([S * 0.17, cy + S * 0.06, side * S * 0.05], [S * 0.035, S * 0.035, S * 0.012], '#c8b880', { lo: true });
    m.ell([S * 0.172, cy + S * 0.06, side * S * 0.058], [S * 0.022, S * 0.022, S * 0.008], '#101010', { lo: true });
    m.ell([S * 0.18, cy + S * 0.07, side * S * 0.063], [S * 0.007, S * 0.007, S * 0.004], '#f4f2ea', { lo: true });
    m.ell([S * 0.06, cy - S * 0.03, side * S * 0.056], [S * 0.06, S * 0.025, S * 0.01], '#f4dc80', { rot: [0, 0, -0.3] }); // pectoral fin
  }
  // fins: flat, curved shapes, each in parts so the black band runs on into them
  const fin = (draw, color, thick) => m.add(flat(draw, 'xy', 10), place([0, cy, 0], [0, 0, 0], [S, S, S * thick]), color);
  // the dorsal: a sickle swept well back, black at its leading edge, white, with a yellow trailing edge
  const tipD = [-0.12, 0.56];
  fin(sh => { sh.moveTo(0.17, 0.17); sh.quadraticCurveTo(0.12, 0.44, tipD[0], tipD[1]); sh.quadraticCurveTo(0.02, 0.36, 0.07, 0.24); sh.lineTo(0.17, 0.17); }, black, 0.012);
  fin(sh => { sh.moveTo(0.07, 0.24); sh.quadraticCurveTo(0.02, 0.36, tipD[0], tipD[1]); sh.quadraticCurveTo(-0.1, 0.32, -0.2, 0.17); sh.lineTo(0.07, 0.24); }, white, 0.011);
  fin(sh => { sh.moveTo(-0.2, 0.17); sh.quadraticCurveTo(-0.1, 0.32, tipD[0], tipD[1]); sh.quadraticCurveTo(-0.15, 0.32, -0.25, 0.14); sh.lineTo(-0.2, 0.17); }, yellow, 0.009);
  // ...drawn out into a white streamer trailing back over the tail
  let prev = [S * tipD[0], cy + S * tipD[1], 0];
  for (let k = 1; k <= 8; k++) {
    const t = k / 8, pt = [S * (tipD[0] - t * 0.5), cy + S * (tipD[1] + Math.sin(t * Math.PI * 0.6) * 0.03 - t * t * 0.18), 0];
    m.limb(prev, pt, S * (0.014 - t * 0.008), S * (0.014 - t * 0.01), '#f8f6f0', { caps: k === 8, part: P.TAIL, pivot: [0, cy, 0] }); prev = pt;
  }
  // the anal fin: the dorsal's mirror below, swept back
  const tipA = [-0.14, -0.47];
  fin(sh => { sh.moveTo(0.14, -0.17); sh.quadraticCurveTo(0.08, -0.38, tipA[0], tipA[1]); sh.quadraticCurveTo(0.0, -0.32, 0.05, -0.23); sh.lineTo(0.14, -0.17); }, black, 0.012);
  fin(sh => { sh.moveTo(0.05, -0.23); sh.quadraticCurveTo(0.0, -0.32, tipA[0], tipA[1]); sh.quadraticCurveTo(-0.12, -0.28, -0.22, -0.14); sh.lineTo(0.05, -0.23); }, white, 0.011);
  for (const side of [1, -1]) m.limb([S * 0.1, cy - S * 0.22, side * S * 0.025], [S * 0.02, cy - S * 0.34, side * S * 0.04], S * 0.025, S * 0.008, black); // pelvic fins, swept back
  // the tail: a black fan with a white trailing edge
  const tail = { part: P.TAIL, pivot: [-S * 0.34, cy, 0] };
  m.add(flat(sh => { sh.moveTo(0, 0.12); sh.lineTo(-0.2, 0.2); sh.quadraticCurveTo(-0.17, 0, -0.2, -0.2); sh.lineTo(0, -0.12); sh.lineTo(0, 0.12); }), place([-S * 0.34, cy, 0], [0, 0, 0], [S, S, S * 0.008]), white, tail);
  m.add(flat(sh => { sh.moveTo(0, 0.1); sh.lineTo(-0.16, 0.16); sh.quadraticCurveTo(-0.13, 0, -0.16, -0.16); sh.lineTo(0, -0.1); sh.lineTo(0, 0.1); }), place([-S * 0.34, cy, 0], [0, 0, 0], [S, S, S * 0.013]), black, tail);
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
// Malayan tapir (saddle): black, with a clean-edged white saddle wrapped round the back half of the
// body from behind the shoulders to the rump; no mane.
function tapir(m, s) {
  const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
  const hide = grad(shade(s.color, 0.08), s.belly, -0.2, 0.5);
  const white = s.saddle ? grad(s.saddle, shade(s.saddle, -0.12), -0.1, 0.6) : null;
  // the saddle's front edge stands just behind the shoulders, leaning back a little toward the belly
  const body = s.saddle ? (u, p) => (p.x < L * 0.1 - (by + H * 0.3 - p.y) * 0.18 ? white(u) : hide(u)) : hide;
  loftBody(m, { x0: -L * 0.47, x1: L * 0.32, cy0: by + H * 0.08, cy1: by - H * 0.02, ry0: H * 0.6, ry1: H * 0.44, rz0: H * 0.48, rz1: H * 0.35, sag: H * 0.05, fine: !!s.saddle }, body);
  const neck = [L * 0.28, by + H * 0.06, 0], hd = { part: P.HEAD, pivot: neck };
  const hp = [L * 0.48, by - H * 0.08, 0];
  m.limb(neck, [hp[0] - H * 0.12, hp[1] + H * 0.04, 0], H * 0.32, H * 0.25, hide, hd);
  m.ell(hp, [H * 0.36, H * 0.25, H * 0.2], hide, { ...hd, rot: [0, 0, -0.3] });
  // the trunk: tapering and curling down, pale at the lip
  const t0 = [hp[0] + H * 0.3, hp[1] - H * 0.12, 0], t1 = [t0[0] + H * 0.2, t0[1] - H * 0.1, 0], t2 = [t1[0] + H * 0.06, t1[1] - H * 0.16, 0];
  m.limb(t0, t1, H * 0.1, H * 0.075, shade(s.color, 0.05), hd);
  m.limb(t1, t2, H * 0.075, H * 0.05, shade(s.color, 0.1), hd);
  m.ell([hp[0] + H * 0.18, hp[1] - H * 0.2, 0], [H * 0.16, H * 0.07, H * 0.13], shade(s.belly, 0.25), hd); // pale lips and chin
  if (!s.saddle) m.limb([hp[0] - H * 0.05, hp[1] + H * 0.2, 0], [neck[0] - H * 0.15, neck[1] + H * 0.34, 0], H * 0.07, H * 0.05, shade(s.color, -0.3), hd); // mane
  for (const side of [1, -1]) {
    m.ell([hp[0] + H * 0.08, hp[1] + H * 0.06, side * H * 0.17], [H * 0.04, H * 0.04, H * 0.03], '#0e0c0a', { ...hd, lo: true });
    const ear = u => u.y > 0.5 || Math.abs(u.x) > 0.75 ? col(s.rim) : col(shade(s.color, -0.1));
    m.ell([hp[0] - H * 0.14, hp[1] + H * 0.3, side * H * 0.14], [H * 0.09, H * 0.13, H * 0.04], ear, { ...hd, rot: [side * -0.35, 0, 0.3] });
  }
  const lc = shade(s.color, -0.1), r0 = H * 0.19, r1 = H * 0.13;
  stumpLegs(m, [[L * 0.22, H * 0.2, by - H * 0.05, r0, r1, lc], [L * 0.22, -H * 0.2, by - H * 0.05, r0, r1, lc],
    [-L * 0.28, H * 0.24, by, r0 * 1.25, r1, lc], [-L * 0.28, -H * 0.24, by, r0 * 1.25, r1, lc]], '#1a1614');
  m.ell([-L * 0.48, by + H * 0.2, 0], [H * 0.07, H * 0.09, H * 0.06], s.saddle || s.color, { part: P.TAIL, pivot: [-L * 0.46, by + H * 0.2, 0], lo: true });
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

// Sumatran orangutan, clambering over the top of the canopy: no branch of its own (it's drawn on
// the crown of its tree), so it holds a pose that reads anywhere in the foliage. Leaning forward,
// one very long arm reaches far ahead and down to the leaves and the other out to the side, the
// hands hooked into the foliage at the crown's surface; short legs splay out behind, bent at the
// knee, with hand-like feet gripping. Long, ragged rust-orange hair hangs in locks off the arms,
// thighs and flanks. A high domed crown, a small dark bare face with a pale muzzle, and no tail.
// As it moves the arms reach and the legs step, swinging from the shoulders and hips; the head
// dips from the neck.
// Flanged males (flanged) are bigger and heavier, with the famous face: broad, flat cheek pads
// covered in fine pale hair framing it like a dish, a big pendulous throat sac, a long ginger beard
// and moustache, and much longer hair, hanging in capes from the arms.
function orangutan(m, s) {
  const L = s.len, fl = !!s.flanged, U = (x, y, z = 0) => [x * L, y * L, z * L];
  const B = fl ? 1.15 : 1, HL = fl ? 1.75 : 1; // bulk, length of the hair
  const dark = col(s.face), rust = col(s.color), deep = col(s.belly), ginger = col(shade(s.color, 0.22));
  // long hair: streaky, hanging straight down (so the streaks run up and down), darker underneath
  const hair = (u, p) => tmp.copy(rust).lerp(deep, smooth(0.42, 0.05, p.y / L) * 0.6)
    .multiplyScalar(0.74 + hash3(Math.round(p.x * 1.4), Math.round(p.y * 0.25), Math.round(p.z * 1.4)) * 0.4);
  const lock = (u, p) => tmp.copy(rust).lerp(deep, 0.15 + hash3(Math.round(p.x * 3), 2, Math.round(p.z * 3)) * 0.6).lerp(ginger, hash3(Math.round(p.z * 3), 5, Math.round(p.x * 3)) > 0.8 ? 0.4 : 0);
  const skin = col(shade(s.face, -0.1)), pale = tmp.copy(dark).lerp(col('#e0b49a'), 0.72).clone();

  // the body: pot-bellied, leaning forward over the crown
  const T = [U(-0.1, 0.21), U(-0.07, 0.33), U(0.0, 0.46), U(0.08, 0.57)];
  tube(m, T, [[0.1, 0.11], [0.15, 0.16], [0.145, 0.165], [0.1, 0.15]].map(r => [r[0] * L * B, r[1] * L * B]), hair, { up: [1, 0, 0], seg: 16, sub: 4 });
  // locks hanging off the flanks, back and belly
  for (let k = 0; k < 13; k++) {
    const a = Math.PI * 2 * (k + 0.3) / 13, t = 0.35 + (k % 3) * 0.2, c = [T[1][0] + (T[2][0] - T[1][0]) * t, T[1][1] + (T[2][1] - T[1][1]) * t];
    const x = c[0] / L + Math.cos(a) * 0.14 * B, z = Math.sin(a) * 0.155 * B;
    locks(m, U(x, c[1] / L + 0.03, z), U(x * 1.02, c[1] / L - 0.05, z * 1.05), 2, L * 0.17 * (fl ? 1.4 : 1), L * 0.04, lock, {}, k + 1);
  }
  // arms: long, one reaching far ahead and down, the other out to the side; hands hooked into
  // the leaves, fingers curled down into them
  const arms = [[1, P.LEG_FL, U(0.07, 0.56, 0.13 * B), U(0.27, 0.42, 0.3), U(0.45, 0.15, 0.3), U(0.5, 0.06, 0.3)],
    [-1, P.LEG_FR, U(0.04, 0.56, -0.13 * B), U(0.12, 0.38, -0.36), U(0.13, 0.15, -0.44), U(0.14, 0.06, -0.46)]];
  for (const [side, part, sh, el, wr, hand] of arms) {
    const o = { part, pivot: sh };
    tube(m, [sh, el, wr], [0.075 * B, 0.06 * B, 0.044].map(r => r * L), hair, { ...o, seg: 10, sub: 5 });
    m.limb(wr, hand, L * 0.042, L * 0.046, skin, { ...o, seg: 8 });                                            // the hand
    const dir = [hand[0] - wr[0], 0, hand[2] - wr[2]], dl = Math.hypot(dir[0], dir[2]) || 1;
    for (const f of [-1, 0, 1]) { // long fingers hooked down into the foliage
      const b0 = [hand[0] + f * L * 0.026 * dir[2] / dl, hand[1], hand[2] - f * L * 0.026 * dir[0] / dl];
      m.limb(b0, [b0[0] + dir[0] / dl * L * 0.04, b0[1] - L * 0.055, b0[2] + dir[2] / dl * L * 0.04], L * 0.016, L * 0.011, skin, { ...o, seg: 5 });
    }
    // long hair hanging off the underside of each arm (on a flanged male, a cape of it)
    for (const dz of [L * 0.03, -L * 0.03]) {
      locks(m, [sh[0], sh[1] - L * 0.045, sh[2] + dz], [el[0], el[1] - L * 0.04, el[2] + dz], fl ? 8 : 6, L * 0.16 * HL, L * 0.036 * (fl ? 1.25 : 1), lock, o, side * 3 + dz);
      locks(m, [el[0], el[1] - L * 0.035, el[2] + dz], [wr[0] + (el[0] - wr[0]) * 0.25, wr[1] + (el[1] - wr[1]) * 0.25 - L * 0.03, wr[2] + (el[2] - wr[2]) * 0.25 + dz], fl ? 7 : 5, L * 0.17 * HL, L * 0.032 * (fl ? 1.2 : 1), lock, o, side * 5 + dz);
    }
  }
  // legs: short, splayed out behind and bent at the knee, the hand-like feet gripping
  for (const [side, part, kn, an] of [[1, P.LEG_BL, U(0.06, 0.2, 0.25), U(-0.05, 0.07, 0.28)], [-1, P.LEG_BR, U(-0.14, 0.19, -0.23), U(-0.3, 0.08, -0.21)]]) {
    const hip = U(-0.07, 0.27, side * 0.08 * B), o = { part, pivot: hip };
    tube(m, [hip, kn, an], [0.072 * B, 0.056 * B, 0.042].map(r => r * L), hair, { ...o, seg: 10, sub: 3 });
    const fwd = side > 0 ? [0.6, 0, 0.8] : [-0.8, 0, -0.2];
    m.ell([an[0] + fwd[0] * L * 0.035, an[1] - L * 0.035, an[2] + fwd[2] * L * 0.035], [L * 0.06, L * 0.026, L * 0.04], skin, { ...o, lo: true, rot: [0, Math.atan2(-fwd[2], fwd[0]), 0] }); // the foot
    for (const f of [-1, 1]) { const b0 = [an[0] + fwd[0] * L * 0.07 - fwd[2] * f * L * 0.018, an[1] - L * 0.035, an[2] + fwd[2] * L * 0.07 + fwd[0] * f * L * 0.018]; m.limb(b0, [b0[0] + fwd[0] * L * 0.02, b0[1] - L * 0.04, b0[2] + fwd[2] * L * 0.02], L * 0.015, L * 0.01, skin, { ...o, seg: 5 }); } // toes curled down
    locks(m, [hip[0] + L * 0.01, hip[1] - L * 0.03, hip[2]], [kn[0], kn[1] - L * 0.03, kn[2]], fl ? 6 : 5, L * 0.12 * (fl ? 1.4 : 1), L * 0.036, lock, o, side * 7);
  }
  // head: a short thick neck, a high domed crown, the small dark face with a pale muzzle
  const HS = fl ? 1.12 : 1, neck = U(0.09, 0.59), hd = { part: P.HEAD, pivot: neck }, hp = U(0.16, 0.7);
  const F = (x, y, z = 0) => [hp[0] + x * L * HS, hp[1] + y * L * HS, z * L * HS], R = (a, b, c) => [a * L * HS, b * L * HS, c * L * HS];
  tube(m, [neck, F(-0.01, -0.02)], [L * 0.085 * B, L * 0.075 * HS], hair, { ...hd, seg: 10, sub: 2, capRings: 2 });
  m.ell(F(-0.015, 0.03), R(0.1, fl ? 0.11 : 0.12, 0.098), hair, hd);                       // crown
  m.ell(F(0.055, -0.012), fl ? R(0.072, 0.1, 0.085) : R(0.07, 0.092, 0.08), skin, hd);       // bare face
  m.ell(F(0.1, -0.058), R(0.052, 0.046, 0.06), pale, hd);                                   // pale muzzle
  m.ell(F(0.135, -0.068), R(0.012, 0.006, 0.035), shade(s.face, 0.1), { ...hd, lo: true }); // mouth line
  m.ell(F(0.1, 0.022), R(0.03, 0.016, 0.06), shade(s.face, 0.06), { ...hd, lo: true });     // brow
  for (const side of [1, -1]) {
    m.ell(F(0.108, 0.003, side * 0.026), R(0.011, 0.011, 0.011), '#140a06', { ...hd, lo: true }); // close-set eyes
    m.ell(F(0.135, -0.035, side * 0.011), R(0.006, 0.005, 0.006), '#1a120e', { ...hd, lo: true }); // nostrils
    if (!fl) m.ell(F(-0.005, 0, side * 0.09), R(0.016, 0.022, 0.01), skin, { ...hd, lo: true });  // small ears
  }
  m.eyeAt = F(0.11, 0.003, 0.026); m.eyePivot = neck;
  if (!fl) { locks(m, F(0.08, -0.08, -0.04), F(0.08, -0.08, 0.04), 3, L * 0.06, L * 0.025, lock, hd, 9); return; } // a ginger beard
  // the flanged male: fleshy cheek pads curving forward round the face like a shallow dish, dark
  // skin fringed with fine pale ginger hair at the rim; a big throat sac hanging onto the chest; a
  // long ginger beard and moustache
  const fringe = (u, p) => tmp.copy(col('#b8875a')).lerp(col('#dcc0a0'), hash3(Math.round(p.x * 6), Math.round(p.y * 6), Math.round(p.z * 6)) * 0.8);
  for (const side of [1, -1]) {
    const th = side * 0.5, c = Math.cos(th), sn = Math.sin(th), at = (lx, ly, lz) => F(0.07 + lx * c + lz * sn, -0.01 + ly, side * 0.098 + (-lx * sn + lz * c));
    const pad = (u, p) => tmp.copy(skin).lerp(col('#7a6658'), smooth(-0.2, 0.7, u.z * side) * 0.6).lerp(col('#b88a60'), smooth(0.72, 0.97, Math.hypot(u.y, u.z)) * 0.7).multiplyScalar(0.92 + hash3(Math.round(p.x * 4), Math.round(p.y * 4), Math.round(p.z * 4)) * 0.12);
    m.add(SPH_HI, place(at(0, 0, 0), [0, th, 0], R(0.034, 0.105, 0.062)), pad, hd);
    // the fringe of fine hair round the rim: a soft roll of it
    const rim = []; for (let j = 0; j <= 8; j++) { const a = -1.45 + j / 8 * 2.9; rim.push(at(-0.014, 0.1 * Math.sin(a), side * 0.058 * Math.cos(a))); }
    tube(m, rim, rim.map((_, j) => L * (0.012 + 0.008 * Math.sin(j / 8 * Math.PI))), fringe, { ...hd, seg: 6, sub: 3, capRings: 2 });
  }
  const sac = (u, p) => tmp.copy(deep).lerp(rust, smooth(-0.4, 0.6, u.y) * 0.5).multiplyScalar(0.78 + hash3(Math.round(p.x * 1.4), Math.round(p.y * 0.4), Math.round(p.z * 1.4)) * 0.32);
  m.add(SPH_HI, place(F(0.035, -0.19), [0, 0, 0.25], R(0.12, 0.14, 0.13)), sac, hd);        // the throat sac
  const beard = (u, p) => tmp.copy(col('#b0602c')).lerp(col('#d89a5c'), hash3(Math.round(p.x * 3), 1, Math.round(p.z * 3)) * 0.8);
  locks(m, F(0.12, -0.1, -0.06), F(0.12, -0.1, 0.06), 10, L * 0.21, L * 0.015, beard, hd, 11, [0.3, -1, 0]); // long beard
  for (const side of [1, -1]) m.limb(F(0.138, -0.05, side * 0.008), F(0.128, -0.1, side * 0.055), L * 0.012, L * 0.006, beard, { ...hd, seg: 5 }); // moustache
}

// Sunda pangolin: an arched body and a long, thick, tapering tail, all armoured in big overlapping
// scales like a pine cone; a small pointed head, short legs, and big curved claws on the forefeet.
function pangolin(m, s) {
  const L = s.len;
  // the spine from nose to tail tip: [x, y, half-height, half-width]
  const SP = [[0.64, 0.13, 0.02, 0.02], [0.52, 0.18, 0.08, 0.075], [0.38, 0.24, 0.12, 0.11], [0.22, 0.31, 0.18, 0.17], [0.0, 0.37, 0.21, 0.19],
    [-0.22, 0.33, 0.19, 0.18], [-0.42, 0.23, 0.13, 0.14], [-0.72, 0.13, 0.085, 0.1], [-1.0, 0.07, 0.045, 0.055], [-1.18, 0.045, 0.015, 0.02]].map(r => r.map(v => v * L));
  const at = x => {
    for (let k = 1; k < SP.length; k++) if (x >= SP[k][0]) { const a = SP[k - 1], b = SP[k], t = (x - b[0]) / (a[0] - b[0]); return b.map((v, n) => v + (a[n] - v) * t); }
    return SP[SP.length - 1];
  };
  const skin = col(shade(s.belly, -0.3)), belly = col(s.belly), sc = col(s.color);
  // the soft body underneath, pale on the belly and the bare pointed face
  for (let x = SP[0][0]; x > SP[SP.length - 1][0]; x -= L * 0.06) {
    const [, y, ry, rz] = at(x), part = x < -L * 0.4 ? { part: P.TAIL, pivot: [-L * 0.4, L * 0.2, 0] } : x > L * 0.36 ? { part: P.HEAD, pivot: [L * 0.36, L * 0.22, 0] } : {};
    m.ell([x, y, 0], [L * 0.07, ry * 0.97, rz * 0.97], u => (x > L * 0.38 ? skin : u.y < -0.25 ? belly : tmp.copy(sc).multiplyScalar(0.55)), { ...part, lo: true });
  }
  // scales: staggered rings of raised, overlapping plates, their free rear edges lifted and catching the light
  let row = 0;
  for (let x = L * 0.47; x > SP[SP.length - 1][0] + L * 0.04; row++) {
    const [, y, ry, rz] = at(x), ahead = at(x + L * 0.02), slope = Math.atan2(ahead[1] - y, L * 0.02);
    const head = x > L * 0.36, tail = x < -L * 0.4, r = Math.max(ry, rz);
    const w = Math.max(L * 0.045, r * 0.62), range = head ? 1.15 : tail ? 2.5 : 2.05, n = Math.max(3, Math.round(2 * range * r / (w * 0.85)));
    const o = tail ? { part: P.TAIL, pivot: [-L * 0.4, L * 0.2, 0] } : head ? { part: P.HEAD, pivot: [L * 0.36, L * 0.22, 0] } : {};
    for (let j = 0; j < n; j++) {
      const th = -range + (2 * range) * (j + (row % 2 ? 0.75 : 0.25)) / n, tint = 0.8 + hash3(row, j, 9) * 0.3;
      const c = [x, y + Math.cos(th) * ry * 0.92, Math.sin(th) * rz * 0.92];
      m.add(SCALE, place(c, [th, 0, slope - 0.22], [w * 0.72, w * 0.16, w * 0.56]), u => tmp.copy(sc).multiplyScalar(tint * (0.62 + 0.5 * smooth(0.5, -0.9, u.x)) * (u.y > 0 ? 1 : 0.7)), o);
    }
    x -= w * 0.62;
  }
  const hd = { part: P.HEAD, pivot: [L * 0.36, L * 0.22, 0] };
  eyes(m, [L * 0.5, L * 0.18, 0], 0, L * 0.015, L * 0.055, L * 0.012, P.HEAD, hd.pivot);
  m.ell([L * 0.625, L * 0.115, 0], [L * 0.015, L * 0.014, L * 0.016], '#2a1a16', { ...hd, lo: true }); // nose
  // legs: short and stout; long, curved claws on the forefeet, folded under as it walks on its knuckles
  const claw = '#d8c8a4', leg = shade(s.color, -0.2);
  for (const [x, side, part] of [[L * 0.22, 1, P.LEG_FL], [L * 0.22, -1, P.LEG_FR], [-L * 0.22, 1, P.LEG_BL], [-L * 0.22, -1, P.LEG_BR]]) {
    const hip = [x, L * 0.22, side * L * 0.1], foot = [x + L * 0.03, L * 0.035, side * L * 0.12], o = { part, pivot: hip }, front = part < P.LEG_BL;
    m.limb(hip, foot, L * (front ? 0.05 : 0.06), L * 0.04, leg, o);
    m.ell([foot[0] + L * 0.02, L * 0.03, foot[2]], [L * 0.055, L * 0.03, L * 0.045], skin, { ...o, lo: true });
    for (const t of [-1, 0, 1]) {
      const c0 = [foot[0] + L * 0.05, L * 0.04, foot[2] + t * L * 0.022], cl = front ? L * 0.07 : L * 0.035;
      m.limb(c0, [c0[0] + cl * 0.7, c0[1] + cl * 0.2, c0[2]], L * 0.011, L * 0.008, claw, { ...o, caps: false });
      m.limb([c0[0] + cl * 0.7, c0[1] + cl * 0.2, c0[2]], [c0[0] + cl, L * 0.006, c0[2]], L * 0.008, L * 0.003, claw, { ...o, caps: false });
    }
  }
}

// Siamang (a gibbon), brachiating: it swings hand over hand under its own branch, one very long
// arm straight up and hooked over it, the other flung out ahead for the next hold (that one swings
// as it travels), legs drawn up beneath a slim body. All shaggy black, with a small round head
// and the big bare grey throat sac blown up under the chin.
function siamang(m, s) {
  const L = s.len, bY = L * 1.38, black = col(s.color), sacC = col(s.sac);
  const fur = (u, p) => tmp.copy(black).multiplyScalar(1 + hash3(Math.round(p.x * 2), Math.round(p.y * 0.6), Math.round(p.z * 2)) * 0.9);
  const skin = col(shade(s.color, 0.08));
  const bark = (u, p) => tmp.copy(col('#5e4630')).multiplyScalar(0.8 + hash3(Math.round(p.x * 1.2), 1, Math.round(u.y * 3)) * 0.35);
  tube(m, [[-L * 0.55, bY + L * 0.02, 0], [L * 0.1, bY, 0], [L * 0.75, bY + L * 0.05, L * 0.02]], [L * 0.04, L * 0.036, L * 0.028], bark, { seg: 8, sub: 3, capRings: 2 });
  for (const [x, z, a] of [[0.7, 0.06, 0.5], [0.78, -0.05, -0.5], [-0.5, 0.05, 2.6]])
    m.ell([L * x, bY + L * 0.05, L * z], [L * 0.08, L * 0.012, L * 0.03], '#4a7a32', { rot: [0.3, a, 0.25] });
  // a slim body hanging straight down from the high arm
  tube(m, [[L * 0.0, L * 0.42, 0], [L * 0.01, L * 0.58, 0], [L * 0.03, L * 0.76, 0], [L * 0.05, L * 0.88, 0]],
    [[L * 0.085, L * 0.09], [L * 0.11, L * 0.115], [L * 0.105, L * 0.13], [L * 0.07, L * 0.11]], fur, { up: [1, 0, 0], seg: 12, sub: 3 });
  // the high arm, hooked over the branch (it holds still)
  const grip = { part: P.TAIL, pivot: [0, L * 0.84, 0] }, sh1 = [L * 0.05, L * 0.84, L * 0.1], hand = [L * 0.14, bY - L * 0.025, L * 0.02];
  tube(m, [sh1, [L * 0.13, L * 1.1, L * 0.12], hand], [L * 0.055, L * 0.042, L * 0.034], fur, { ...grip, seg: 8, sub: 4 });
  m.ell([hand[0], hand[1], hand[2]], [L * 0.04, L * 0.045, L * 0.035], skin, { ...grip, lo: true });
  m.ell([hand[0] + L * 0.02, bY + L * 0.035, hand[2] * 0.4], [L * 0.05, L * 0.02, L * 0.035], skin, { ...grip, lo: true }); // hooked fingers
  // the free arm, reaching far out ahead for the next hold
  const sh2 = [L * 0.04, L * 0.84, -L * 0.1], fl = { part: P.LEG_FL, pivot: sh2 }, h2 = [L * 0.6, L * 1.02, -L * 0.1];
  tube(m, [sh2, [L * 0.32, L * 0.8, -L * 0.18], h2], [L * 0.055, L * 0.042, L * 0.032], fur, { ...fl, seg: 8, sub: 4 });
  m.ell(h2, [L * 0.05, L * 0.03, L * 0.03], skin, { ...fl, lo: true, rot: [0, 0, 0.6] });
  m.limb([h2[0] + L * 0.03, h2[1] + L * 0.02, h2[2]], [h2[0] + L * 0.05, h2[1] + L * 0.05, h2[2]], L * 0.014, L * 0.01, skin, { ...fl, seg: 6 }); // fingers curled to catch
  // shaggy hair off the arms
  locks(m, [sh1[0], sh1[1] + L * 0.02, sh1[2] + L * 0.03], [L * 0.13, L * 1.05, L * 0.16], 4, L * 0.06, L * 0.022, fur, grip, 2, [-0.6, -0.8, 0.2]);
  locks(m, [sh2[0] + L * 0.04, sh2[1] - L * 0.03, sh2[2]], [L * 0.32, L * 0.8, -L * 0.17], 4, L * 0.045, L * 0.03, fur, fl, 4);
  // head: small and round, a black face, the throat sac below
  const neck = [L * 0.05, L * 0.86, 0], hd = { part: P.HEAD, pivot: neck }, hp = [L * 0.1, L * 1.0, 0], hr = L * 0.085;
  tube(m, [neck, [L * 0.08, L * 0.95, 0]], [L * 0.06, L * 0.055], fur, { ...hd, seg: 8, sub: 2, capRings: 2 });
  m.ell(hp, [hr, hr * 1.02, hr * 0.95], fur, hd);
  m.ell([hp[0] + hr * 0.5, hp[1] - hr * 0.08, 0], [hr * 0.58, hr * 0.7, hr * 0.72], '#1e1a18', hd);   // bare face
  m.ell([hp[0] + hr * 0.85, hp[1] - hr * 0.4, 0], [hr * 0.35, hr * 0.3, hr * 0.42], '#2a2522', hd);   // muzzle
  m.ell([hp[0] + hr * 0.8, hp[1] + hr * 0.3, 0], [hr * 0.26, hr * 0.14, hr * 0.66], '#262120', { ...hd, lo: true }); // brow
  eyes(m, hp, hr * 0.92, hr * 0.12, hr * 0.3, hr * 0.12, P.HEAD, neck, '#3a2414');
  m.eyeAt = [hp[0] + hr * 0.92, hp[1] + hr * 0.12, hr * 0.3]; m.eyePivot = neck;
  // the throat sac: bare, grey-pink, blown up as big as the head
  m.ell([hp[0] + hr * 0.45, hp[1] - hr * 1.2, 0], [hr * 0.85, hr * 0.8, hr * 0.92], u => tmp.copy(sacC).multiplyScalar(0.62).lerp(col(s.sac), smooth(-0.3, 0.8, u.x * 0.6 + u.y * 0.5) * 0.8).lerp(col('#b08880'), 0.15), hd);
  // legs drawn up under it, knees forward, long hand-like feet
  for (const side of [1, -1]) {
    const hip = [L * 0.0, L * 0.45, side * L * 0.06], kn = [L * 0.17, L * 0.38, side * L * 0.1], an = [L * 0.08, L * 0.24, side * L * 0.09];
    const o = { part: side > 0 ? P.LEG_BL : P.LEG_BR, pivot: hip };
    tube(m, [hip, kn, an], [L * 0.055, L * 0.042, L * 0.032], fur, { ...o, seg: 8, sub: 3 });
    m.ell([an[0] + L * 0.04, an[1] - L * 0.02, an[2]], [L * 0.055, L * 0.022, L * 0.03], skin, { ...o, lo: true, rot: [0, 0, 0.3] });
  }
}

// Monkeys walk the branches on all fours with the prehensile tail curled up behind.
// Red-handed howler: black with rusty hands, feet and tail tip, and a bearded throat.
// Spider monkey: pot-bellied and long in every limb, with a pale ring round the face.
// Thomas's langur (crest): grey above and white below, a tall pointed black crest on the crown, a
// black bare face in a ring of white fur, and a long tail that hangs down behind instead of curling.
// Southern pig-tailed macaque (shortTail): sturdy and brown, a dark cap on the crown, a bare
// pinkish-brown face with a long muzzle, and a short, thin tail carried in an arch like a pig's.
// (The siamang and other apes (ape) have their own builder: see siamang.)
// The head sits on a short neck growing out of the shoulders, which is where it dips from.
function monkey(m, s) {
  const L = s.len, long = !!s.long, mac = !!s.shortTail, lang = !!s.crest, legL = L * (long ? 0.62 : 0.45), by = legL;
  const limbC = shade(s.color, -0.05), hands = s.hands || (mac ? shade(s.face || s.color, -0.25) : limbC);
  const g0 = grad(s.color, s.belly, -0.2, 0.5);
  // the macaque's coat is grizzled, darker down the middle of the back
  const fur = mac ? u => tmp.copy(g0(u)).lerp(col(shade(s.color, -0.35)), u.y > 0.8 && u.x > -0.7 ? 0.5 : 0).multiplyScalar(0.9 + hash3(Math.round(u.x * 20), Math.round(u.y * 8), Math.round(u.z * 8)) * 0.18) : g0;
  loftBody(m, { x0: -L * 0.34, x1: L * 0.3, cy0: by + L * 0.02, cy1: by + L * 0.1, ry0: L * 0.17, ry1: L * 0.16, rz0: L * 0.14, rz1: L * 0.13, sag: L * (long ? 0.03 : 0.01), fine: mac }, fur);
  const hr = L * (mac ? 0.12 : 0.13), hp = mac ? [L * 0.45, by + L * 0.21, 0] : [L * 0.44, by + L * 0.24, 0];
  const neck = [L * 0.2, by + L * 0.1, 0], hd = { part: P.HEAD, pivot: neck };
  tube(m, [neck, [hp[0] - hr * 0.5, hp[1] - hr * 0.3, 0]], [L * 0.095, hr * 0.68], fur, { ...hd, seg: 10, sub: 2, capRings: 2 }); // the neck
  if (mac) {
    const face = col(s.face), cap = shade(s.color, -0.45);
    m.ell(hp, [hr * 0.95, hr * 0.9, hr * 0.88], fur, hd);
    m.ell([hp[0] - hr * 0.12, hp[1] + hr * 0.5, 0], [hr * 0.78, hr * 0.42, hr * 0.74], cap, hd);                         // dark cap
    m.ell([hp[0] + hr * 0.5, hp[1] - hr * 0.1, 0], [hr * 0.55, hr * 0.72, hr * 0.66], face, hd);                          // bare face
    m.ell([hp[0] + hr * 0.9, hp[1] - hr * 0.45, 0], [hr * 0.55, hr * 0.36, hr * 0.42], shade(s.face, 0.06), { ...hd, rot: [0, 0, -0.25] }); // the long muzzle
    m.ell([hp[0] + hr * 1.38, hp[1] - hr * 0.5, 0], [hr * 0.1, hr * 0.14, hr * 0.24], shade(s.face, -0.3), { ...hd, lo: true }); // nose
    m.ell([hp[0] + hr * 1.12, hp[1] - hr * 0.72, 0], [hr * 0.3, hr * 0.05, hr * 0.32], shade(s.face, -0.4), { ...hd, lo: true }); // mouth
    m.ell([hp[0] + hr * 0.82, hp[1] + hr * 0.24, 0], [hr * 0.26, hr * 0.13, hr * 0.62], shade(s.face, -0.22), hd);         // brow ridge
    for (const side of [1, -1]) {
      m.ell([hp[0] + hr * 0.95, hp[1] + hr * 0.05, side * hr * 0.25], [hr * 0.1, hr * 0.1, hr * 0.08], '#6a4418', { ...hd, lo: true });
      m.ell([hp[0] + hr * 1.02, hp[1] + hr * 0.05, side * hr * 0.25], [hr * 0.05, hr * 0.06, hr * 0.05], '#140c08', { ...hd, lo: true });
      m.ell([hp[0] - hr * 0.05, hp[1] + hr * 0.08, side * hr * 0.86], [hr * 0.16, hr * 0.22, hr * 0.08], shade(s.face, -0.12), { ...hd, lo: true }); // ears
      m.ell([hp[0] + hr * 0.2, hp[1] - hr * 0.35, side * hr * 0.58], [hr * 0.4, hr * 0.32, hr * 0.3], s.belly, hd);        // pale cheek fur
    }
    m.eyeAt = [hp[0] + hr * 1.0, hp[1] + hr * 0.05, hr * 0.25]; m.eyePivot = neck;
  } else if (lang) {
    m.ell(hp, [hr, hr * 0.95, hr * 0.9], fur, hd);
    m.ell([hp[0] + hr * 0.42, hp[1] - hr * 0.08, 0], [hr * 0.6, hr * 0.84, hr * 0.8], s.face, hd);                        // ring of white fur
    m.ell([hp[0] + hr * 0.72, hp[1] - hr * 0.05, 0], [hr * 0.38, hr * 0.56, hr * 0.5], '#262220', hd);                   // black bare face
    m.ell([hp[0] + hr * 0.98, hp[1] - hr * 0.32, 0], [hr * 0.24, hr * 0.24, hr * 0.32], '#302a28', hd);                  // short muzzle
    m.ell([hp[0] + hr * 0.55, hp[1] + hr * 0.5, 0], [hr * 0.4, hr * 0.16, hr * 0.62], s.crest, hd);                     // dark brow band
    eyes(m, hp, hr * 1.0, hr * 0.1, hr * 0.2, hr * 0.09, P.HEAD, neck, '#7a4a18');
    m.eyeAt = [hp[0] + hr * 1.0, hp[1] + hr * 0.1, hr * 0.2]; m.eyePivot = neck;
    // a tall, pointed crest of hair standing straight up off the crown
    m.limb([hp[0] - hr * 0.1, hp[1] + hr * 0.55, 0], [hp[0] - hr * 0.3, hp[1] + hr * 1.75, 0], hr * 0.42, hr * 0.04, s.crest, hd);
    m.ell([hp[0] - hr * 0.12, hp[1] + hr * 0.75, 0], [hr * 0.45, hr * 0.4, hr * 0.32], s.crest, hd);
  } else {
    m.ell(hp, [hr, hr * 0.95, hr * 0.9], fur, hd);
    if (s.face) m.ell([hp[0] + hr * 0.55, hp[1], 0], [hr * 0.55, hr * 0.75, hr * 0.7], s.face, hd);
    m.ell([hp[0] + hr * 0.85, hp[1] - hr * 0.2, 0], [hr * 0.35, hr * 0.4, hr * 0.5], shade(s.face || s.color, -0.35), hd); // muzzle
    if (!long) m.ell([hp[0] + hr * 0.3, hp[1] - hr * 0.85, 0], [hr * 0.6, hr * 0.6, hr * 0.62], shade(s.color, 0.08), hd); // howler's beard
    eyes(m, hp, hr * 0.78, hr * 0.15, hr * 0.35, hr * 0.12, P.HEAD, neck, '#3a2210');
  }
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
  if (s.shortTail) {
    // a short, thin tail arching up and over like a pig's
    const to = { part: P.TAIL, pivot: [-L * 0.32, by + L * 0.08, 0] }, a = [-L * 0.33, by + L * 0.1, 0], b = [-L * 0.42, by + L * 0.24, 0], c = [-L * 0.5, by + L * 0.22, 0], d = [-L * 0.54, by + L * 0.12, 0];
    m.limb(a, b, L * 0.03, L * 0.025, limbC, to); m.limb(b, c, L * 0.025, L * 0.02, limbC, to); m.limb(c, d, L * 0.02, L * 0.014, limbC, to);
    return;
  }
  if (s.crest) {
    // a langur's long tail hangs down behind in a loose curve, the tip trailing back
    const to = { part: P.TAIL, pivot: [-L * 0.3, by + L * 0.05, 0] }, n = 10;
    let prev = [-L * 0.32, by + L * 0.04, 0];
    for (let k = 1; k <= n; k++) {
      const t = k / n, p = [-L * 0.32 - L * 0.22 * t - L * 0.5 * t * t, by + L * 0.04 - by * 0.8 * Math.sin(t * Math.PI * 0.6) / Math.sin(Math.PI * 0.6), 0];
      m.limb(prev, p, L * 0.04 * (1 - (k - 1) / n * 0.4), L * 0.04 * (1 - k / n * 0.4), limbC, to); prev = p;
    }
    return;
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
// False gharial (gharial): a very long, slender, even snout, and dark crossbands over the back and tail.
function caiman(m, s) {
  const L = s.len, cy = L * 0.07, gh = !!s.gharial;
  const hide0 = u => {
    if (u.y < -0.35) return col(s.belly);
    const scute = Math.abs(Math.sin(u.x * 30)) < 0.3 || Math.abs(Math.sin(Math.atan2(u.z, u.y) * 6)) < 0.25;
    return scute ? col(shade(s.color, -0.3)) : tmp.copy(col(s.color)).lerp(col(s.belly), smooth(0.1, -0.35, u.y) * 0.6);
  };
  // (crossbands in world space, so they run on across the body and tail; only on the upper side)
  const band = col(shade(s.color, -0.5));
  const hide = gh ? (u, p) => (p.x < L * 0.2 && p.y > cy - L * 0.02 && Math.sin(p.x * 2 * Math.PI / (L * 0.075)) > 0.45 ? tmp.copy(hide0(u)).lerp(band, 0.75) : hide0(u)) : hide0;
  loftBody(m, { x0: -L * 0.3, x1: L * 0.24, cy0: cy, cy1: cy, ry0: L * 0.075, ry1: L * 0.08, rz0: L * 0.11, rz1: L * 0.13, fine: true }, hide);
  const neck = [L * 0.22, cy, 0], hd = { part: P.HEAD, pivot: neck };
  const head = u => u.y < -0.3 ? col(s.belly) : col(shade(s.color, 0.05));
  m.ell([L * 0.3, cy + L * 0.005, 0], [L * 0.1, L * 0.05, L * 0.085], head, hd);
  if (gh) {
    // a long, slim, flattened snout of even width, a little spatulate at the tip
    m.ell([L * 0.37, cy, 0], [L * 0.06, L * 0.028, L * 0.045], head, hd);
    m.add(cyl(1, 1, 10), place([L * 0.38, cy - L * 0.004, 0], [0, 0, -Math.PI / 2], [L * 0.016, L * 0.4, L * 0.024]), head, hd);
    m.ell([L * 0.78, cy - L * 0.004, 0], [L * 0.03, L * 0.017, L * 0.03], head, hd);
    m.ell([L * 0.8, cy + L * 0.01, 0], [L * 0.012, L * 0.006, L * 0.014], shade(s.color, -0.3), { ...hd, lo: true }); // nostrils
  } else {
    m.ell([L * 0.44, cy - L * 0.005, 0], [L * 0.11, L * 0.03, L * 0.055], head, hd);
    m.ell([L * 0.38, cy + L * 0.03, 0], [L * 0.03, L * 0.008, L * 0.045], shade(s.color, -0.25), hd); // the "spectacles" ridge
  }
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
  const back = col(shade(s.color, -0.12)), belly = col(s.belly);
  const skin = u => tmp.copy(back).lerp(belly, smooth(0.35, -0.5, u.y));
  // Axial rings let the throat and jaw follow their own smooth outline. A tube's
  // tilted frames pinched the underside where the melon dropped into the beak.
  // x, upper surface, lower surface, half-width, all in body-length units.
  const profile = [[-0.485, 0.14, 0.14, 0], [-0.46, 0.155, 0.125, 0.023],
    [-0.34, 0.187, 0.097, 0.05], [-0.15, 0.236, 0.036, 0.09], [0.1, 0.25, 0.01, 0.11],
    [0.25, 0.243, 0.026, 0.095], [0.32, 0.242, 0.034, 0.084], [0.36, 0.21, 0.038, 0.062],
    [0.4, 0.143, 0.043, 0.036], [0.445, 0.11, 0.047, 0.028], [0.52, 0.097, 0.054, 0.023],
    [0.605, 0.087, 0.06, 0.015], [0.634, 0.074, 0.074, 0]];
  // Monotone cubic slopes prevent a jaw ring from overshooting either surface.
  const slopes = profile.map((row, i) => [0, ...[1, 2, 3].map(c => {
    const a = profile[Math.max(0, i - 1)], b = profile[Math.min(profile.length - 1, i + 1)];
    if (i === 0 || i === profile.length - 1) return (b[c] - a[c]) / (b[0] - a[0]);
    const h0 = row[0] - a[0], h1 = b[0] - row[0], d0 = (row[c] - a[c]) / h0, d1 = (b[c] - row[c]) / h1;
    if (d0 * d1 <= 0) return 0;
    const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / d0 + w1 / d1);
  })]);
  const pos = [], unit = [], idx = [], A = 32, sub = 8;
  const ring = (x, top, bottom, width) => {
    for (let j = 0; j <= A; j++) {
      const a = j / A * Math.PI * 2, up = Math.cos(a), side = Math.sin(a);
      pos.push(L * x, L * ((top + bottom) * 0.5 + up * (top - bottom) * 0.5), L * side * width);
      unit.push(x, up, side);
    }
  };
  for (let i = 0; i < profile.length - 1; i++) {
    const p0 = profile[i], p1 = profile[i + 1], h = p1[0] - p0[0];
    for (let j = 0; j < sub; j++) {
      const t = j / sub, t2 = t * t, t3 = t2 * t;
      const values = [1, 2, 3].map(c => (2 * t3 - 3 * t2 + 1) * p0[c] + (t3 - 2 * t2 + t) * h * slopes[i][c]
        + (-2 * t3 + 3 * t2) * p1[c] + (t3 - t2) * h * slopes[i + 1][c]);
      ring(p0[0] + h * t, ...values);
    }
  }
  ring(...profile[profile.length - 1]);
  const R = (profile.length - 1) * sub;
  for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) {
    const a = i * (A + 1) + j, b = a + A + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry(), paintGeo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  paintGeo.setAttribute('position', new THREE.Float32BufferAttribute(unit, 3));
  m.add(geo, new THREE.Matrix4(), skin, { paintGeo });
  // Keep eyes with the continuous torso so head dips cannot split the skin.
  const hd = { part: P.BODY, pivot: [L * 0.22, cy, 0] };
  eyes(m, [L * 0.335, cy, 0], L * 0.014, -L * 0.005, L * 0.067, L * 0.008, P.BODY, hd.pivot);
  m.add(flat(sh => { sh.moveTo(0.6, 0); sh.quadraticCurveTo(0, 0.5, -0.6, 0.15); sh.lineTo(-0.6, 0); sh.lineTo(0.6, 0); }),
    place([-L * 0.05, cy + L * 0.1, 0], [0, 0, 0], [L * 0.16, L * 0.08, L * 0.01]), shade(s.color, -0.1)); // low dorsal ridge
  for (const side of [1, -1]) m.ell([L * 0.14, cy - L * 0.07, side * L * 0.12], [L * 0.08, L * 0.012, L * 0.045], shade(s.color, -0.05), { rot: [side * 0.35, side * 0.4, -0.2] });
  const fluke = flat(sh => { sh.moveTo(0, 0.08); sh.quadraticCurveTo(-0.4, 0.4, -0.8, 1); sh.quadraticCurveTo(-0.7, 0.4, -1, 0); sh.quadraticCurveTo(-0.7, -0.4, -0.8, -1); sh.quadraticCurveTo(-0.4, -0.4, 0, -0.08); sh.lineTo(0, 0.08); }, 'xz');
  m.add(fluke, place([-L * 0.44, cy + L * 0.01, 0], [0, 0, 0], [L * 0.14, L * 0.012, L * 0.14]), shade(s.color, -0.12), { part: P.TAIL, pivot: [-L * 0.44, cy, 0] });
}

// Manta ray: a broad, flat diamond of a body, black above and white below, flying through the
// water on long triangular wings, with the two curled lobes either side of its wide mouth.
function ray(m, s) {
  const S = s.size, cy = S * 0.14, back = col(s.color), belly = col(s.belly || '#f0f0ec');
  const skin = u => (u.y < -0.1 ? belly : back);
  m.ell([0, cy, 0], [S * 0.26, S * 0.06, S * 0.2], skin);
  m.ell([S * 0.2, cy - S * 0.005, 0], [S * 0.1, S * 0.045, S * 0.12], skin);
  for (const side of [1, -1]) {
    // cephalic lobes, curled down beside the mouth
    m.limb([S * 0.26, cy, side * S * 0.08], [S * 0.36, cy - S * 0.02, side * S * 0.09], S * 0.025, S * 0.015, back, { part: P.HEAD, pivot: [S * 0.2, cy, 0] });
    m.ell([S * 0.27, cy + S * 0.02, side * S * 0.115], [S * 0.016, S * 0.016, S * 0.01], '#141210', { lo: true }); // eyes
    // a wing: swept back from the body to a pointed tip; it beats up and down in "flight"
    const pivot = [0, cy, side * S * 0.16], part = side > 0 ? P.WING_L : P.WING_R;
    const wing = flat(sh => { sh.moveTo(0.3, 0); sh.quadraticCurveTo(0.05, 0.5 * side, -0.25, 1 * side); sh.quadraticCurveTo(-0.2, 0.45 * side, -0.32, 0); sh.lineTo(0.3, 0); }, 'xz');
    const at = place(pivot, [0, 0, 0], [S * 0.62, S * 0.03, S * 0.5]);
    m.add(wing, at, u => (u.y < 0 ? belly : back), { part, pivot, ext: at });
  }
  m.limb([-S * 0.24, cy, 0], [-S * 0.62, cy + S * 0.01, 0], S * 0.02, S * 0.006, back, { part: P.TAIL, pivot: [-S * 0.24, cy, 0] });
}

// ---------------------------------------------------------------- visitors
// Same palettes as the old 2D visitor sprites, so the eight looks carry over.
const SHIRTS = ['#c8583a', '#3a6a9a', '#e0b030', '#5a8a4a', '#8a4a8a', '#d88a6a', '#2a4a3a', '#b0302a'];
const PANTS = ['#3a3a4a', '#5a4a3a', '#2a3a5a', '#6a6a5a'];
const SKIN = ['#f0c8a0', '#d8a878', '#a87850', '#7a5030'];
const HAIR = ['#3a2a1a', '#8a6a3a', '#1a1a1a', '#c8a060'];
const FINS = ['#f0c020', '#2a7ad8', '#e8506a', '#2ab0a0'];

// snork: a snorkeler on the reef: no hat or boots, but a mask, a snorkel and a pair of bright fins
function person(m, look, snork = false) {
  const shirt = SHIRTS[look % SHIRTS.length], pants = PANTS[look % PANTS.length], skin = SKIN[(look >> 1) % SKIN.length];
  const shirtC = grad(shirt, shade(shirt, -0.18), 0, 0.6);
  // legs and boots (they swing from the hip)
  for (const side of [1, -1]) {
    const hip = [0, 15.5, side * 1.9], part = side > 0 ? P.LEG_FL : P.LEG_FR;
    m.limb(hip, [0.2, 2.2, side * 1.95], 1.75, 1.35, side > 0 ? pants : shade(pants, -0.08), { part, pivot: hip });
    if (snork) m.ell([0.2, -1.6, side * 1.95], [0.45, 3.6, 1.7], FINS[look % FINS.length], { part, pivot: hip }); // a fin, flat to the water
    else m.ell([0.9, 1.1, side * 1.95], [2.1, 1.15, 1.35], '#3a2e26', { part, pivot: hip, lo: true });
  }
  m.ell([0, 16, 0], [2.7, 2.4, 3.6], pants);
  // torso, a little broader at the shoulders
  m.ell([0, 20.8, 0], [2.8, 5.6, 3.9], shirtC);
  m.ell([0, 24, 0], [2.6, 2.4, 4.4], shirtC);
  if (look % 3 === 0 && !snork) { // daypack
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
  if (snork) {
    // mask over the eyes, its strap round the head, and the snorkel curving up past one ear
    m.ell([hp[0] + 2.3, hp[1] + 0.5, 0], [1.3, 1.3, 2.7], '#2a3e4c', hd);
    m.ell([hp[0], hp[1] + 0.5, 0], [3.2, 0.6, 3.15], '#1e1e22', hd);
    m.limb([hp[0] + 2.4, hp[1] - 1.6, 2.2], [hp[0] + 0.6, hp[1] + 1.5, 3.0], 0.45, 0.45, '#f0c020', { ...hd, caps: false });
    m.limb([hp[0] + 0.6, hp[1] + 1.5, 3.0], [hp[0] - 0.6, hp[1] + 4.8, 2.6], 0.45, 0.4, '#f0c020', hd);
    const hair = HAIR[look % 4];
    m.ell([-0.5, 31.1, 0], [3.35, 2.6, 3.25], hair, hd);
  } else if (look % 2) {
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
    m.eyeAt = [L * 0.51, by + H * 0.43, H * 0.29]; m.eyePivot = neck;
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
  const S = s.size, cy = S * 0.13, iguana = s.lizard === 'iguana', anole = s.lizard === 'anole', spiny = iguana || s.lizard === 'ctenosaur';
  const skin = u => {
    const band = Math.sin(u.x * 13) > 0.82 && u.y > -0.3;
    const spot = u.y > 0.1 && hash3(Math.round(u.x * 34), Math.round(u.y * 9), Math.round(u.z * 9)) > 0.86;
    return u.y < -0.5 ? col(s.belly) : band || spot ? col(shade(s.belly, -0.1)) : col(s.color);
  };
  loftBody(m, { x0: -S * 0.3, x1: S * 0.28, cy0: cy, cy1: cy + S * 0.005, ry0: S * 0.075, ry1: S * 0.08, rz0: S * 0.1, rz1: S * 0.1, fine: true }, skin);
  const neck = [S * 0.24, cy + S * 0.01, 0], hd = { part: P.HEAD, pivot: neck };
  tube(m, [neck, [S * 0.33, cy + S * 0.025, 0], [S * 0.42, cy + S * 0.04, 0]], [S * 0.065, S * 0.058, S * 0.045], skin, hd);                  // long neck
  m.ell([S * 0.46, cy + S * 0.045, 0], [S * (iguana ? 0.09 : 0.08), S * (iguana ? 0.062 : 0.04), S * (iguana ? 0.062 : 0.045)], skin, hd);           // head
  m.ell([S * 0.54, cy + S * 0.035, 0], [S * 0.045, S * 0.025, S * 0.028], s.color, hd);      // pointed snout
  eyes(m, [S * 0.46, cy + S * 0.045, 0], S * 0.03, S * 0.02, S * 0.037, S * 0.011, P.HEAD, neck, '#c8a030');
  if (!s.lizard) for (const side of [1, -1]) m.limb([S * 0.585, cy + S * 0.03, 0], [S * 0.64, cy + S * 0.03, side * S * 0.012], S * 0.005, S * 0.003, '#8a3a4a', { ...hd, caps: false }); // forked tongue
  // tail: thick at the base, tapering, as long again as the body
  const tb = [-S * 0.28, cy, 0];
  tube(m, [tb, [-S * 0.43, cy - S * 0.006, S * 0.01], [-S * 0.62, cy - S * 0.026, S * 0.035], [-S * 0.81, cy - S * 0.047, S * 0.02], [-S * 0.95, cy - S * 0.06, 0]],
    [S * 0.07, S * 0.057, S * 0.038, S * 0.018, S * 0.004], skin, { part: P.TAIL, pivot: tb, seg: 14, sub: 5 });
  if (iguana || anole) {
    const dewlap = flat(sh => { sh.moveTo(0, 0); sh.quadraticCurveTo(-0.05, -0.2, -0.25, -0.17); sh.quadraticCurveTo(-0.32, -0.07, -0.32, 0); sh.lineTo(0, 0); });
    m.add(dewlap, place([S * 0.47, cy + S * 0.025, 0], [0, 0, 0], [S * (anole ? 0.55 : 0.8), S * (anole ? 0.55 : 0.8), S * 0.012]), anole ? '#bb5c68' : shade(s.belly, -0.08), hd);
    if (iguana) for (const side of [-1, 1]) m.ell([S * 0.435, cy + S * 0.022, side * S * 0.062], [S * 0.025, S * 0.027, S * 0.007], shade(s.belly, 0.1), hd);
  }
  if (spiny) for (let k = 0; k < 13; k++) {
    const x = S * (0.23 - k * 0.068), tail = x < -S * 0.28, h = S * (iguana ? 0.04 : 0.025) * (1 - k / 18);
    m.limb([x, cy + (tail ? S * (0.045 - (-x / S - 0.28) * 0.1) : S * 0.074), 0], [x - S * 0.012, cy + (tail ? S * (0.045 - (-x / S - 0.28) * 0.1) : S * 0.074) + h, 0], S * 0.012, S * 0.001, s.dark || shade(s.color, -0.3), tail ? { part: P.TAIL, pivot: tb } : {});
  }
  // legs splay out sideways from the body, elbows up, feet flat with claws
  const legs = [[S * 0.17, 1, P.LEG_FL], [S * 0.17, -1, P.LEG_FR], [-S * 0.2, 1, P.LEG_BL], [-S * 0.2, -1, P.LEG_BR]];
  for (const [x, side, part] of legs) {
    const hip = [x, cy, side * S * 0.07], knee = [x + S * 0.02, cy + S * 0.02, side * S * 0.17], foot = [x + S * 0.04, S * 0.01, side * S * 0.2], o = { part, pivot: hip };
    tube(m, [hip, knee, foot], [S * 0.035, S * 0.028, S * 0.018], skin, o);
    for (const t of [-2, -1, 0, 1, 2]) m.limb(foot, [foot[0] + S * (0.045 - Math.abs(t) * 0.006), S * 0.004, foot[2] + t * S * 0.014], S * 0.006, S * 0.002, '#2a2418', { ...o, caps: false });
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
// Species whose sprite shares a builder kind with a different-looking animal, recognised by key until
// their sprites carry the flag themselves (mousedeer: the agouti kind; birdwing: the butterfly kind;
// barn: an owl without the great horned owl's ear tufts).
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
    case 'monkey': if (s.ape) { siamang(m, s); mo.leg = 0.45; mo.bob = 0.4; mo.tail = 0; mo.head = 0.45; } else { monkey(m, s); mo.leg = 0.6; mo.bob = 0.6; mo.tail = 0.15; } break;
    case 'orangutan': orangutan(m, s); mo.leg = 0.3; mo.bob = 0.3; mo.tail = 0; mo.head = 0.45; mo.sink = s.len * 0.4; break;
    case 'pangolin': pangolin(m, s); mo.leg = 0.5; mo.bob = 0.25; mo.tail = 0.12; mo.sink = s.len * 0.22; break;
    case 'sloth': sloth(m, s); mo.leg = 0.12; mo.tail = 0; break;
    case 'caiman': caiman(m, s); mo.leg = 0.4; mo.tail = 0.35; mo.wave = s.len * 0.025; mo.waveK = 6 / s.len; mo.waveHead = s.len * 0.1; mo.waveLen = s.len * 0.7; mo.sink = s.len * 0.09; break;
    case 'ray': ray(m, s); mo.flap = 0.9; mo.tail = 0.3; mo.leg = 0; break;
    case 'dolphin': dolphin(m, s); mo.verticalWave = 1; mo.tail = 0.12; mo.wave = s.size * 0.03; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.2; mo.waveLen = s.size * 0.8; mo.sink = s.size * 0.1; break;
    case 'deer': case 'canine': case 'feline': case 'raccoon': case 'otter': case 'beaver':
    case 'peccary': case 'agouti': case 'anteater':
    case 'zebra': case 'wildebeest': case 'gazelle': case 'impala': case 'buffalo': case 'warthog': case 'hyena': case 'rhino': case 'giraffe': case 'elephant': {
      // Sumatra's tiger, elephant and rhino have builders of their own
      const own = s.kind === 'feline' && s.stripes ? tiger : s.kind === 'elephant' && s.asian ? sumatranElephant : s.kind === 'rhino' && s.hairy ? sumatranRhino : null;
      if (own) { Object.assign(mo, own(m, s)); break; }
      const o = MAMMALS[s.kind](s);
      quadruped(m, s, o);
      mo.bob = o.H * (s.kind === 'rabbit' ? 0.35 : s.kind === 'rodent' || s.kind === 'squirrel' ? 0.12 : 0.04);
      mo.leg = s.kind === 'elephant' || s.kind === 'rhino' ? 0.3 : s.kind === 'giraffe' ? 0.38 : 0.55;
      mo.sink = o.leg + o.H * 0.45;
      break;
    }
    case 'songbird': case 'hummer': case 'woodpecker': case 'heron': case 'duck': case 'booby': case 'raptor': case 'owl': case 'toucan': case 'macaw': case 'ostrich': case 'hornbill': case 'vulture': case 'secretary': case 'crane':
      bird(m, s);
      mo.flap = s.kind === 'hummer' ? 7 : s.kind === 'booby' ? 1.25 : s.kind === 'heron' || s.kind === 'raptor' || s.kind === 'owl' || s.kind === 'macaw' || s.kind === 'vulture' || s.kind === 'crane' || s.kind === 'secretary' ? 0.9 : 2;
      mo.leg = 0.5; mo.tail = s.cocked ? 0.13 : 0.065; mo.bird = 1;
      mo.wingSpan = s.size * BIRDS[s.kind](s).span * 1.7;
      mo.sink = s.kind === 'duck' || s.kind === 'booby' ? s.size * 0.24 : 0;
      break;
    case 'bat': bat(m, s); mo.flap = 2.6; break;
    case 'butterfly': butterfly(m, s); mo.flap = 1.7; mo.leg = 0; mo.tail = 0; break;
    case 'bee': bee(m, s); mo.flap = 9; mo.leg = 0.2; mo.tail = 0; break;
    case 'beetle': beetle(m, s); mo.leg = 0.7; mo.tail = 0; break;
    case 'monitor': monitor(m, s); mo.leg = 0.55; mo.wave = s.size * 0.04; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.3; mo.waveLen = s.size * 1.2; mo.sink = s.size * 0.1; break;
    case 'hippo': hippo(m, s); mo.leg = 0.28; mo.bob = 0.3; mo.tail = 0.5; mo.sink = s.leg + s.h * 0.55; break;
    case 'frog': frog(m, s); mo.leg = 0.3; mo.bob = s.size * 0.5; mo.sink = s.size * 0.3; break;
    case 'newt': newt(m, s); mo.leg = 0.5; mo.wave = s.size * 0.05; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.4; mo.waveLen = s.size * 1.2; mo.sink = s.size * 0.12; break;
    case 'turtle': if (s.sea) { seaTurtle(m, s); mo.leg = 0.55; mo.bob = 0; } else turtle(m, s); mo.leg ??= 0.35; mo.sink = s.size * 0.2; break;
    case 'dugong': dugong(m, s); mo.leg = 0.32; mo.tail = 0; break; // (the flukes beat up and down: see dugong)
    case 'snake': snake(m, s); mo.wave = s.size * 0.13; mo.waveK = 5.2 / (s.size * 2.4); mo.waveHead = s.size * 1.3; mo.waveLen = s.size * 2.4; mo.sink = s.size * 0.05; break;
    case 'person': person(m, s.look, !!s.snorkel); mo.leg = 0.5; mo.bob = 0.5; mo.len = 8; break;
    case 'butterflyfish': butterflyfish(m, s); mo.wave = s.size * 0.04; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.1; mo.waveLen = s.size * 0.6; mo.sink = s.size * 0.32; mo.tail = 0.5; break;
    // (a shark swims with its whole back half: about one wave along the body, the head almost
    // still and the sweep growing toward the tail, which rides the same wave rather than flicking
    // on its own; and it curves into a C as it turns: see bend in actors.js)
    case 'shark': shark(m, s); mo.wave = s.size * 0.085; mo.waveK = 6.28 / (s.size * 1.05); mo.waveHead = s.size * 0.42; mo.waveLen = s.size * 1.1; mo.waveMin = 0.04; mo.wavePow = 1.8; mo.bend = s.size * 0.22; mo.sink = s.size * 0.16; mo.tail = 0; break;
    case 'idol': idol(m, s); mo.wave = s.size * 0.04; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.1; mo.waveLen = s.size * 0.6; mo.sink = s.size * 0.32; mo.tail = 0.5; break;
    case 'fish': fish(m, s); mo.wave = s.size * 0.07; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.25; mo.waveLen = s.size * 0.9; mo.sink = s.size * 0.2; mo.tail = 0.5; break;
    default: m.ell([0, 4, 0], [4, 4, 4], s.color || '#888');
  }
  mo.eye = m.eyeAt || null; mo.eyePivot = m.eyePivot || [0, 0, 0]; // where the eyes are, in model units (for eye-shine)
  return { geo: m.build(), motion: mo };
}

// ---------------------------------------------------------------- material with the animation shader
export function faunaMaterial(motion) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const u = {
    uBird: { value: motion.bird ?? 0 }, uWingSpan: { value: motion.wingSpan ?? 1 },
    uLeg: { value: motion.leg }, uBob: { value: motion.bob }, uTail: { value: motion.tail }, uFlap: { value: motion.flap },
    uHead: { value: motion.head ?? 0.9 }, uWave: { value: motion.wave }, uWaveK: { value: motion.waveK }, uWaveHead: { value: motion.waveHead }, uWaveLen: { value: motion.waveLen },
    uVerticalWave: { value: motion.verticalWave ?? 0 }, uWaveMin: { value: motion.waveMin ?? 0.25 }, uWavePow: { value: motion.wavePow ?? 1 }, uBend: { value: motion.bend ?? 0 },
  };
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = `
      attribute float aPart; attribute vec3 aPivot; attribute vec3 aExt; attribute vec3 aExtN; attribute vec4 aAnim;
      uniform float uLeg, uBob, uTail, uFlap, uHead, uWave, uWaveK, uWaveHead, uWaveLen, uWaveMin, uWavePow, uVerticalWave, uBend, uBird, uWingSpan;
      vec3 rotX(vec3 p, vec3 o, float a) { vec3 q = p - o; float c = cos(a), s = sin(a); return o + vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c); }
      vec3 rotY(vec3 p, vec3 o, float a) { vec3 q = p - o; float c = cos(a), s = sin(a); return o + vec3(q.x * c + q.z * s, q.y, -q.x * s + q.z * c); }
      vec3 rotZ(vec3 p, vec3 o, float a) { vec3 q = p - o; float c = cos(a), s = sin(a); return o + vec3(q.x * c - q.y * s, q.x * s + q.y * c, q.z); }
      // Rotate lighting normals alongside each rigid part. Birds also flex the outer wing and
      // interpolate a compact resting tail into a modest flight fan; other fauna keep their poses.
      void animatePart(inout vec3 p, inout vec3 n) {
        float ph = aAnim.x, gait = aAnim.y, fly = aAnim.z;
        vec3 zero = vec3(0.0);
        bool wing = aPart > 5.5 && aPart < 7.5;
        bool tail = aPart > 4.5 && aPart < 5.5;
        if (wing || (tail && uBird > 0.5)) {
          p = mix(position, aExt, fly);
          n = normalize(mix(normal, aExtN, fly));
        }
        if (wing) {
          float side = aPart < 6.5 ? 1.0 : -1.0;
          float tip = smoothstep(0.58, 1.0, abs(aExt.z - aPivot.z) / uWingSpan);
          float flex = -side * uBird * fly * tip * sin(ph * uFlap - 0.65) * 0.22;
          vec3 wrist = aPivot + vec3(0.0, 0.0, side * uWingSpan * 0.58);
          p = rotX(p, wrist, flex); n = rotX(n, zero, flex);
          float beat = -side * fly * sin(ph * uFlap) * 0.75;
          p = rotX(p, aPivot, beat); n = rotX(n, zero, beat);
        } else if (aPart > 0.5 && aPart < 4.5) {
          float off = (aPart < 1.5 || aPart > 3.5) ? 0.0 : 3.14159;
          float swing = sin(ph + off) * uLeg * gait * (1.0 - fly) - fly * 1.35;
          p = rotZ(p, aPivot, swing); n = rotZ(n, zero, swing);
        } else if (tail) {
          float sway = sin(ph * 0.5 + 1.3) * uTail * (0.35 + gait);
          if (uVerticalWave > 0.5) { p = rotZ(p, aPivot, sway); n = rotZ(n, zero, sway); }
          else { p = rotY(p, aPivot, sway); n = rotY(n, zero, sway); }
          float pitch = uBird * fly * sin(ph * uFlap - 0.4) * 0.045;
          p = rotZ(p, aPivot, pitch); n = rotZ(n, zero, pitch);
        } else if (aPart > 7.5) {
          p = rotZ(p, aPivot, -aAnim.w * uHead); n = rotZ(n, zero, -aAnim.w * uHead);
        }
      }
    ` + shader.vertexShader
      .replace('#include <beginnormal_vertex>', `
        vec3 objectNormal = normal;
        vec3 faunaPosition = position;
        animatePart(faunaPosition, objectNormal);
      `)
      .replace('#include <begin_vertex>', `
        float ph = aAnim.x, gait = aAnim.y, fly = aAnim.z, graze = aAnim.w;
        vec3 transformed = faunaPosition;
        transformed.y += abs(sin(ph)) * uBob * gait * (1.0 - fly);
        if (uWave > 0.0) {
          float t = clamp((uWaveHead - transformed.x) / uWaveLen, 0.0, 1.0);
          float wave = sin(transformed.x * uWaveK - ph * 1.4) * uWave * mix(uWaveMin, 1.0, pow(t, uWavePow)) * (0.35 + gait);
          transformed.y += wave * uVerticalWave;
          transformed.z += wave * (1.0 - uVerticalWave);
          // a swimmer turning curves its body into the turn (the anim's last slot carries how hard)
          if (uBend > 0.0) transformed.z += graze * uBend * t * t;
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
export const SNORKEL_LOOKS = Array.from({ length: 8 }, (_, look) => ({ key: 'snorkel' + look, sprite: { kind: 'person', look, snorkel: true } }));

export class Fauna {
  constructor(scene) {
    this.scene = scene;
    this.species = new Map();
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3();
    this.yAxis = new THREE.Vector3(0, 1, 0); this.zAxis = new THREE.Vector3(0, 0, 1); this.qp = new THREE.Quaternion();
  }
  pool(def) {
    let p = this.species.get(def.key);
    if (!p) { p = new SpeciesMesh(this.scene, def); this.species.set(def.key, p); }
    return p;
  }
  motion(def) { return this.pool(def).motion; }
  begin() { for (const p of this.species.values()) p.count = 0; }
  // One animal this frame. scale converts model pixels to scene units.
  add(def, x, y, z, yaw, scale, phase, gait, fly, graze, pitch = 0) {
    const p = this.pool(def);
    if (p.count >= p.cap) {
      // carry over what this frame has already written, then grow
      const oldM = p.mesh.instanceMatrix.array.slice(0, p.count * 16), oldA = p.anim.array.slice(0, p.count * 4), n = p.count;
      p.grow(p.cap * 2);
      p.mesh.instanceMatrix.array.set(oldM); p.anim.array.set(oldA); p.count = n;
    }
    const k = p.count++;
    this.q.setFromAxisAngle(this.yAxis, yaw);
    if (pitch) this.q.multiply(this.qp.setFromAxisAngle(this.zAxis, pitch)); // nose up or down (a leaping fish)
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(scale, scale, scale));
    p.mesh.setMatrixAt(k, this.m);
    const a = p.anim.array;
    a[k * 4] = phase; a[k * 4 + 1] = gait; a[k * 4 + 2] = fly; a[k * 4 + 3] = graze;
  }
  end() {
    for (const p of this.species.values()) {
      p.mesh.count = p.count;
      p.mesh.visible = p.count > 0;
      if (p.count) {
        p.mesh.instanceMatrix.clearUpdateRanges(); p.mesh.instanceMatrix.addUpdateRange(0, p.count * 16);
        p.anim.clearUpdateRanges(); p.anim.addUpdateRange(0, p.count * 4);
        p.mesh.instanceMatrix.needsUpdate = true; p.anim.needsUpdate = true;
      }
    }
  }
  clear() { this.begin(); this.end(); }
}
