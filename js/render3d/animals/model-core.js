// Shared animal geometry primitives, paints, body parts and sculpting helpers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { weldVertices as mergeVertices } from '../geometry/weld.js';

// Body parts the shader knows how to move.
const P = { BODY: 0, LEG_FL: 1, LEG_FR: 2, LEG_BL: 3, LEG_BR: 4, TAIL: 5, WING_L: 6, WING_R: 7, HEAD: 8, TONGUE: 9, FRUIT: 10, SPINE: 11 };
// (SPINE: a snake's body, whose every vertex carries its ring's point on the spine as its pivot)

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
const SPH_XL = new THREE.SphereGeometry(1, 56, 36); // (a tiger's ruff)
const SCALE = new THREE.SphereGeometry(1, 6, 3); // one of a pangolin's hundreds of plates (kept light)
// The close-up model (see Model.close) swaps these spheres for finer ones and gives limbs, tubes
// and lofts CLOSE times the segments, so outlines stay round when an animal fills the screen. (The
// pangolin's plates are fine enough already.)
const FINER = new Map([[SPH, new THREE.SphereGeometry(1, 20, 14)], [SPH_LO, new THREE.SphereGeometry(1, 12, 8)], [SPH_HI, new THREE.SphereGeometry(1, 36, 24)]]);
const CLOSE = 1.6;

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
//   manta: a ray's pectoral fin, in body lengths, from the midline (root deep inside the body) to the tip;
//     an edge function's third value thins the fin toward its tip
const WING_CACHE = new Map();
const PLANFORM = {
  round: t => [0.5 + 0.1 * Math.sin(Math.PI * t) - 0.55 * t ** 4, -0.5 + 0.34 * t * t - 0.05 * Math.abs(Math.sin(Math.PI * t * 7))],
  pointed: t => [0.5 - 0.1 * t - 0.55 * t * t + 0.035 * t ** 8, -0.5 + 0.1 * t + 0.25 * t * t - 0.035 * t ** 8 - 0.03 * Math.abs(Math.sin(Math.PI * t * 5)) * (1 - t)],
  fingered: t => [0.5 + 0.05 * Math.sin(Math.PI * t), -0.5 + 0.22 * t * t - 0.04 * Math.abs(Math.sin(Math.PI * t * 6))],
  manta: t => [0.22 - 0.375 * t ** 1.6, -0.22 + 0.06 * t + 0.04 * Math.sin(Math.PI * t), 1 - 0.75 * t],
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
        const t = t0 + (t1 - t0) * i / N, [le, te, thick = 1] = edge(t);
        for (let j = 0; j <= M; j++) pos.push(te + (le - te) * j / M, face * thick, side * t);
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
  // close: build the close-up model, same shapes in finer segments (see FINER)
  constructor(close = false) { this.parts = []; this.hard = false; this.coats = []; this.close = close; }
  seg(n) { return this.close ? Math.round(n * CLOSE) : n; }
  finer(geo) { return this.close ? FINER.get(geo) ?? geo : geo; }
  // geo: a unit primitive; m: where it goes; paint(unitPos, worldPos) -> colour.
  // ext: a second placement (wings spread out), blended in by the shader when flying.
  // paintGeo: optional geometry whose positions are handed to paint() instead of geo's own
  // extSrc: optional geometry the ext placement is applied to, when geo itself was pre-shaped
  // hard: horn, antler or tusk, which a kill's skeleton keeps (also everything added while
  // this.hard is set; see build)
  // gloss: 1 a slight shine (a wet nose, hooves; horns, antlers and tusks have it anyway), 2 an eye
  add(geo, m, paint, { part = P.BODY, pivot = null, ext = null, paintGeo = null, extSrc = null, hard = false, gloss = 0 } = {}) {
    if (!paintGeo && !extSrc) geo = this.finer(geo); // (a paint or pose geometry must keep its vertices)
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
    // (a coat the shader marks per pixel: the paint coordinate, and which of the model's coats)
    if (fn.coat) {
      // (fn.coatFade(u, p): 1 where the markings show, 0 where the vertex colour shows alone)
      const slot = this.coatSlot(fn.coat), coat = new Float32Array(n * 4), fade = fn.coatFade;
      for (let i = 0; i < n; i++) { coat[i * 4] = paintPos.getX(i); coat[i * 4 + 1] = paintPos.getY(i); coat[i * 4 + 2] = paintPos.getZ(i); coat[i * 4 + 3] = fade ? slot - 0.45 * (1 - fade(u.fromBufferAttribute(paintPos, i), p.fromBufferAttribute(g.attributes.position, i))) : slot; }
      g.setAttribute('aCoat', new THREE.BufferAttribute(coat, 4));
    }
    g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
    const pv = pivot || [0, 0, 0], piv = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { piv[i * 3] = pv[0]; piv[i * 3 + 1] = pv[1]; piv[i * 3 + 2] = pv[2]; }
    g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
    const e = ext ? (extSrc || unit).clone().applyMatrix4(ext) : g;
    g.setAttribute('aExt', e.attributes.position.clone());
    g.setAttribute('aExtN', e.attributes.normal.clone());
    if (hard || this.hard) g.userData = { ...g.userData, hard: true }; // (a clone shares its source's userData)
    if (gloss) g.userData = { ...g.userData, gloss };
    this.parts.push(g);
  }
  ell(pos, r, paint, o = {}) { this.add(o.fine ? SPH_HI : o.lo ? SPH_LO : SPH, place(pos, o.rot || [0, 0, 0], r), paint, o); }
  // A tapered limb from p0 (radius r0) to p1 (radius r1), with rounded ends.
  limb(p0, p1, r0, r1, paint, o = {}) {
    const a = V(...p0), d = V(...p1).sub(a), len = d.length() || 1e-3;
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    this.add(cyl(r0, r1, this.seg(o.seg ?? 7), o.rings), new THREE.Matrix4().compose(a, q, V(1, len, 1)), paint, o);
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
  // R may be a function of the distance forward of the fold point, giving the body's radius there,
  // so a folded wing hugs a body that narrows toward the tail instead of standing off it.
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
        const along = span * 1.2 * foldLen * t, lx = front - along, Rx = typeof R === 'function' ? R(lx) : R * (1 - 0.3 * t * t), th = up + wrap / Rx;
        const r = Rx + y * thick * (coverts ? 0.8 : 1.2) + chord * 0.01 + lift;
        // Retain the body wrap and upright-body tilt, so the new layers don't stand off the flank.
        const ly = r * Math.sin(th) - along * 0.06, c = Math.cos(tilt), sn = Math.sin(tilt);
        p.setXYZ(i, fold[0] + lx * c - ly * sn, fold[1] + lx * sn + ly * c, side * r * Math.cos(th));
      }
      g.computeVertexNormals();
      this.add(g, new THREE.Matrix4(), paint, { part: side > 0 ? P.WING_L : P.WING_R, pivot, ext, extSrc: unit, paintGeo });
      g.dispose(); unit.dispose(); paintGeo.dispose();
    }
  }
  // One of the model's per-pixel coats (see pixelCoat), numbered from 1; the same markings share one.
  coatSlot(coat) {
    const key = JSON.stringify([coat.kind, coat.params, coat.dark.getHex(), coat.mid.getHex()]);
    let k = this.coats.findIndex(c => c.key === key);
    if (k < 0) { k = this.coats.length; this.coats.push({ ...coat, key }); }
    return k + 1;
  }
  build() {
    // (unmarked parts of a marked model carry slot 0, so every part has the same attributes)
    if (this.coats.length) for (const p of this.parts) if (!p.attributes.aCoat) p.setAttribute('aCoat', new THREE.BufferAttribute(new Float32Array(p.attributes.position.count * 4), 4));
    const g = mergeGeometries(this.parts);
    g.userData.coats = this.coats;
    g.computeBoundingSphere();
    // the vertex ranges of the horns, antlers and tusks (render3d/carcass-decay.js keeps them on
    // the skeleton, so a kill stays recognisable)
    // and of everything with a shine (animals/animal-surface.js)
    let offset = 0; g.userData.hard = []; g.userData.gloss = [];
    for (const p of this.parts) {
      const n = p.attributes.position.count;
      if (p.userData.hard) g.userData.hard.push([offset, offset + n]);
      if (p.userData.hard || p.userData.gloss) g.userData.gloss.push([offset, offset + n, p.userData.gloss || 1]);
      offset += n;
    }
    return g;
  }
}

// ---------------------------------------------------------------- mammals
function eyes(m, at, rx, ry, rz, r, part, pivot, color = '#15110e') {
  m.eyeSpot ||= [at[0] + rx, at[1] + ry, rz]; // (where the eyes are, for fitting a kill's skull; eyeAt is for eye-shine)
  const first = m.parts.length;
  for (const side of [1, -1]) m.ell([at[0] + rx, at[1] + ry, side * rz], [r, r, r], color, { lo: true, part, pivot, gloss: 2 });
  for (let i = first; i < m.parts.length; i++) m.parts[i].userData.eye = true; // (not solid body for branch clearance)
}

// A mammal's ear (pinna), shared by every species that has one: a thin leaf of skin rolled into a
// funnel at its root and opening out toward the tip, its hollow facing forward and a little out,
// furred on the back and paler inside, with a rounded rim (no cones or blobs).
//   base: the root (sunk a little into the head), tip: where the ear ends; width: across at its
//   widest. o.shape: 'point' (deer, dogs, cats with tall ears), 'round' (bears, rodents, cats),
//   'leaf' (long and broad: zebras, wildebeest, rabbits). o.face: the way the hollow opens before
//   it's squared to the ear's length (default forward, turned out by o.out, 0..1). o.cup: how deep
//   the hollow is. o.inner: the inside's colour; o.tip and o.tipAt: a darker tip from that share of
//   the length up; o.rim: the edge's colour; o.spot: a spot behind. o.part and o.pivot: the head's (pass the head's options).
const EAR_SHAPE = {
  point: v => Math.pow(1 - v, 0.75) * (0.7 + 1.3 * Math.sqrt(v)) / 1.08,
  round: v => Math.sqrt(Math.max(0, 1 - ((v - 0.4) / 0.6) ** 2)) * (0.85 + 0.15 * v) / 0.95,
  leaf: v => Math.pow(1 - v, 0.55) * (0.65 + 1.1 * Math.sqrt(v)) / 1.12,
};
function pinna(m, base, tip, width, color, o = {}) {
  const Y = V(...tip).sub(V(...base)), len = Y.length();
  Y.normalize();
  const out = o.out ?? 0.3, side = Math.sign(base[2]) || 1;
  const Z = o.face ? V(...o.face) : V(1 - out, 0, side * out);
  Z.addScaledVector(Y, -Z.dot(Y)).normalize();
  const X = Y.clone().cross(Z), shape = EAR_SHAPE[o.shape] || EAR_SHAPE.point;
  const W = width / 2, cup = o.cup ?? 0.55, thick = o.thick ?? 0.07, bend = o.bend ?? 0.08;
  const N = m.seg(8), A = m.seg(12), pos = [], u = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const v = i / N, w = W * Math.max(0.03, shape(v)), at = -0.12 + 1.12 * v; // (from a little inside the head)
    const deep = cup * (1 - 0.55 * v), t = len * thick * (1 - 0.6 * v);
    for (let j = 0; j <= A; j++) {
      const a = j / A * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      // across: the leaf's width; forward: the hollow (edges curl forward round a recessed middle),
      // with the skin's thickness either side of it, and the whole ear bowing back a little
      const x = w * c, z = deep * w * (c * c - 1) + t * sn - bend * len * v * v, y = len * at;
      pos.push(base[0] + X.x * x + Y.x * y + Z.x * z, base[1] + X.y * x + Y.y * y + Z.y * z, base[2] + X.z * x + Y.z * y + Z.z * z);
      u.push(c, v, sn);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < A; j++) { const a = i * (A + 1) + j, b = a + A + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  const unitG = new THREE.BufferGeometry(); unitG.setAttribute('position', new THREE.Float32BufferAttribute(u, 3));
  const outer = col(color), inner = o.inner ? col(o.inner) : outer.clone().lerp(col('#ecdccd'), 0.6), tipC = o.tip ? col(o.tip) : null, rim = o.rim ? col(o.rim) : null, spot = o.spot ? col(o.spot) : null;
  const k = new THREE.Color();
  const paint = uu => {
    // inside: the front face, fading to the outer colour toward the rim
    k.copy(outer).lerp(inner, smooth(0.15, 0.6, uu.z) * smooth(0.95, 0.6, Math.abs(uu.x)) * smooth(1, 0.75, uu.y));
    if (rim) k.lerp(rim, smooth(0.8, 0.97, Math.abs(uu.x)));
    if (spot && uu.z < -0.2 && uu.x * uu.x + ((uu.y - 0.5) / 0.6) ** 2 < 0.2) k.copy(spot); // (a tiger's white spot behind)
    if (tipC) k.lerp(tipC, smooth((o.tipAt ?? 0.75) - 0.05, (o.tipAt ?? 0.75) + 0.05, uu.y));
    return k;
  };
  m.add(g, new THREE.Matrix4(), paint, { part: o.part, pivot: o.pivot, paintGeo: unitG });
}

// The same ear placed like an upright oval of radii r turned by rot (how the older hand-placed ears
// were laid out): r[1] is half its length, and its thinner other radius the way the hollow opens.
function pinnaAt(m, at, r, rot, color, o = {}) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), Y = V(0, 1, 0).applyQuaternion(q);
  const face = (r[0] <= r[2] ? V(1, 0, 0) : V(0, 0, Math.sign(at[2]) || 1)).applyQuaternion(q);
  const base = [at[0] - Y.x * r[1] * 0.85, at[1] - Y.y * r[1] * 0.85, at[2] - Y.z * r[1] * 0.85];
  pinna(m, base, [at[0] + Y.x * r[1], at[1] + Y.y * r[1], at[2] + Y.z * r[1]], 2.1 * Math.max(r[0], r[2]), color, { face: face.toArray(), ...o });
}

// One smooth body: a tube along x whose oval cross-section swells from haunch to chest and
// rounds off at both ends (no seams between separate blobs). Paint gets (ny, x, side) in
// unit-like coordinates, so countershading and spots work as they do on a sphere.
// tuck: how far the belly line rises toward the hind legs (a waist, as on a deer or a dog, rather
// than a sausage); keel: how far the chest drops between the forelegs. Both shape only the
// underside, so the back keeps its line.
function loftBody(m, { x0, x1, cy0, cy1, ry0, ry1, rz0, rz1, sag = 0, shoulderBulk = 0, fine = false, tuck = 0, keel = 0 }, paint, o = {}) {
  const R = m.seg(fine === 3 ? 128 : fine === 2 ? 84 : fine ? 56 : 22), A = m.seg(fine === 3 ? 88 : fine === 2 ? 60 : fine ? 36 : 14), pos = [], idx = [], u = [];
  for (let i = 0; i <= R; i++) {
    const t = i / R, x = x0 + (x1 - x0) * t;
    const w = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 2.6))); // rounded, blunt ends
    const e = t * t * (3 - 2 * t);
    const bulk = shoulderBulk * Math.exp(-(((t - 0.73) / 0.18) ** 2));
    const ry = (ry0 + (ry1 - ry0) * e) * w * (1 + bulk), rz = (rz0 + (rz1 - rz0) * e) * w * (1 + bulk * 0.5), cy = cy0 + (cy1 - cy0) * e - sag * Math.sin(t * Math.PI);
    const waist = tuck * Math.exp(-(((t - 0.36) / 0.17) ** 2)), under = 1 - waist + keel * Math.exp(-(((t - 0.7) / 0.14) ** 2));
    for (let j = 0; j <= A; j++) {
      const a = j / A * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), k = smooth(0.15, -0.55, c); // (0 on the back, 1 under the belly)
      pos.push(x, cy + c * ry * (1 + (under - 1) * k), sn * rz * (1 - waist * 0.3 * k));
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
  const sub = m.seg(o.sub ?? 4), A = m.seg(o.seg ?? 10), n = pts.length;
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
  const first = m.parts.length;
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
  for (let i = first; i < m.parts.length; i++) m.parts[i].userData.canopyFur = true;
}

// Jaguar and ocelot rosettes: broken dark rings with a warmer centre, laid on a jittered grid
// over the coat (u is the unit-sphere-like coordinate every body part is painted with).
// chains: the ocelot's markings stretch into long open blotches running along the body
// (roughly square cells round the body's axis at height by, body length L and depth H; chains:
// longer cells, so the rings stretch into open blotches along the body; drawn per pixel: coatRosettes)
function rosettes(base, dark, belly, chains, { L, H, by }) {
  return pixelCoat('rosettes', grad(base, belly, -0.3, 0.5), [by, H * 0.53, L * (chains ? 0.15 : 0.1), chains ? 2.2 : 1.6, 0.15], dark, shade(base, -0.18));
}

// Jaguar rosettes use one coat coordinate system across the torso and shoulder muscles.
// Jittered, wavy rings and occasional central dots avoid a repeated checkerboard pattern.
// (laid out in model space round the body's axis at height by; drawn per pixel: coatJaguar)
function jaguarCoat(s, H, by) {
  const base = grad(s.color, s.belly, -0.3, 0.5);
  return pixelCoat('jaguar', (u, p) => base({ y: (p.y - by) / (H * 0.55) }), [by, H * 0.55, H * 0.34, 1.55], s.dark, shade(s.color, -0.12));
}

// Small solid spots scattered over a part (a jaguar's legs and head): coatSpots. size: the cell.
function felineSpots(s, H, base = solid(s.color), size = H * 0.15) {
  return pixelCoat('spots', base, [size], s.dark);
}

// Solid round spots on a jittered grid round the body's axis (cheetah, hyena); cells along half
// the body, size the spot radius in cell units: coatDots
function dots(base, dark, cells, size, { L, H, by }) {
  return pixelCoat('dots', base, [by, H * 0.53, L * 0.46 / cells, cells * 0.32, size], dark);
}

// Clouded leopard: big irregular "cloud" blotches in world space, each with a black rim and a
// fill a little darker than the coat, separated by lanes of the paler ground colour: coatClouds
function cloudCoat(base, dark, size) {
  return pixelCoat('clouds', base, [size], dark);
}

// A coat whose markings the shader draws per pixel (COAT_GLSL in animal-material.js), so their
// edges stay sharp however close the camera is and the mesh needn't be fine enough to carry them.
// The vertices take base's colour (the unmarked coat, with its countershading) and carry the
// paint coordinate; kind names the shader's pattern, params its numbers (up to four), dark and
// mid the marks' colours.
// legs: false leaves the markings off a quadruped's legs (a band along the flank, not round each leg).
function pixelCoat(kind, base, params, dark, mid = dark, { legs = true } = {}) {
  const paint = (u, p) => base(u, p);
  paint.coat = { kind, params, dark: col(dark).clone(), mid: col(mid).clone(), legs };
  return paint;
}

// A mammal's head in one smooth piece: the skull (an oval of radii hr about hp) flowing into a
// tapered muzzle (snout long, from sn; 0 for none), with the bridge of the nose running down from the
// forehead, a brow over the eyes, cheeks below them and a jaw line running back from the chin. The
// skull keeps the old oval's surface round the eyes and between the ears, so eyes, ears, antlers and
// a species' own face pieces sit where they did. Paint gets u as on a sphere (u.x from the back of
// the skull to the nose, u.y up); the muzzle takes the muzzle paint, blended in from the skull's.
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k / 4; };
function headLoft(m, hp, hr, snout, sn, paint, muzzlePaint, o, hd) {
  const [hx, hy] = hp, [rx, ry, rz] = hr;
  // the muzzle: an oval a little narrower toward the nose; the jaw line runs from under the ear to the chin
  // (a long muzzle narrows to the nose; a cat's short one stays blunt)
  const mx = sn[0] + snout * 0.3, my = sn[1], mry = ry * 0.55, mrz = rz * 0.58, taper = smooth(0.55, 1.1, snout / ry);
  const x0 = hx - rx, x1 = snout ? Math.max(hx + rx, mx + snout) : hx + rx;
  const oval = (cx, cy, a, b, c, x) => { const q = 1 - ((x - cx) / a) ** 2, s = Math.sign(q) * Math.sqrt(Math.abs(q)); return [cy + b * s, cy - b * s, c * s]; };
  const jaw = [hx - rx * 0.35, hy - ry * 0.9], chin = [mx + snout * 0.25, my - mry * 0.93];
  const brow = o.brow ?? 0.08, cheek = o.cheeks ?? 0.08, ex = hx + rx * 0.42;
  const R = m.seg(o.detail ? 30 : 18), A = m.seg(o.detail ? 24 : 14), pos = [], idx = [], u = [];
  for (let i = 0; i <= R; i++) {
    const s = i / R, x = x0 + (x1 - x0) * (1 - Math.cos(Math.PI * s)) / 2; // (rings closer together at the ends, where it rounds off)
    const sk = oval(hx, hy, rx, ry, rz, x);
    let [top, bot, w] = sk;
    if (snout) {
      const t = Math.min(1, Math.max(0, (x - mx) / snout)), mz = oval(mx, my, snout, mry * (1 - 0.12 * t * taper), mrz * (1 - 0.25 * t * taper), x);
      top = smax(top, mz[0], ry * 0.55); // (the forehead runs down into the bridge of the nose)
      bot = -smax(-bot, -mz[1], ry * 0.3);
      w = smax(w, mz[2], rz * 0.35);
      if (x > jaw[0] && x < chin[0]) bot = Math.min(bot, jaw[1] + (chin[1] - jaw[1]) * (x - jaw[0]) / (chin[0] - jaw[0]));
    }
    if (i === 0 || i === R) { top = bot = (top + bot) / 2; w = 0; }
    const cy = (top + bot) / 2, h = Math.max(0, (top - bot) / 2); w = Math.max(0, w);
    // a little squarer than an oval in the muzzle (its sides and the line of the lips)
    const n = 2 + 0.6 * smooth(hx + rx * 0.4, hx + rx * 0.9, x);
    const fb = brow * Math.exp(-(((x - ex) / (rx * 0.28)) ** 2)), fc = cheek * Math.exp(-(((x - hx - rx * 0.15) / (rx * 0.42)) ** 2));
    const ux = 2 * (x - x0) / (x1 - x0) - 1, ur = Math.sqrt(Math.max(0, 1 - ux * ux));
    for (let j = 0; j <= A; j++) {
      const a = j / A * Math.PI * 2, c = Math.cos(a), sn2 = Math.sin(a);
      const e = (v) => Math.sign(v) * Math.abs(v) ** (2 / n);
      // the brow stands out over the eyes (up and out, on the upper side), the cheeks below and behind them
      const ang = Math.abs(Math.atan2(sn2, c)); // 0 on top, pi underneath
      const out = fb * Math.exp(-(((ang - 0.8) / 0.38) ** 2)) * ry + fc * Math.exp(-(((ang - 1.95) / 0.45) ** 2)) * rz;
      pos.push(x, cy + e(c) * h + c * out, e(sn2) * w + sn2 * out);
      u.push(ux, c * ur, sn2 * ur);
    }
  }
  for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) { const a = i * (A + 1) + j, b = a + A + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // (each ring's first and last points are one point down the middle of the face: share their normal, or the seam shows)
  const nm = g.attributes.normal, v = V(0, 0, 0);
  for (let i = 0; i <= R; i++) { const a = i * (A + 1), b = a + A; v.set(nm.getX(a) + nm.getX(b), nm.getY(a) + nm.getY(b), nm.getZ(a) + nm.getZ(b)).normalize(); nm.setXYZ(a, v.x, v.y, v.z); nm.setXYZ(b, v.x, v.y, v.z); }
  const unitG = new THREE.BufferGeometry(); unitG.setAttribute('position', new THREE.Float32BufferAttribute(u, 3));
  // the muzzle's colour comes in where the muzzle leaves the skull (a per-pixel coat keeps its markings over both)
  let fn = typeof paint === 'function' ? paint : solid(paint);
  if (snout && muzzlePaint) {
    const head = fn, mz = typeof muzzlePaint === 'function' ? muzzlePaint : solid(muzzlePaint), a = new THREE.Color(), x0m = hx + rx * 0.55, x1m = hx + rx * 0.9;
    const blend = (uu, p) => { const k = smooth(x0m, x1m, p.x); if (k <= 0) return head(uu, p); a.copy(head(uu, p)); return k >= 1 ? mz(uu, p) : a.lerp(mz(uu, p), k); };
    const pc = head.coat;
    if (pc) { fn = pixelCoat(pc.kind, blend, pc.params, pc.dark, pc.mid); fn.coatFade = (uu, p) => 1 - smooth(x0m, x1m, p.x); } // (no spots on the muzzle)
    else fn = blend;
  }
  m.add(g, new THREE.Matrix4(), fn, { ...hd, paintGeo: unitG });
}

function quadruped(m, s, o) {
  const L = s.len, H = o.H, leg = o.leg, W = o.wide ?? 1;
  const by = leg + H * 0.5;
  const base = grad(s.color, s.belly || s.color, -0.3, 0.5);
  // spotted coats (bobcat): small dark rosettes on the back and flanks
  const coat = o.coat ? o.coat(base) : o.dots ? dots(base, o.dots[0], o.dots[1], o.dots[2], { L, H, by }) : o.rosettes ? rosettes(s.color, s.dark, s.belly, s.chains, { L, H, by })
    : o.spots ? (u => (u.y > -0.35 && hash3(Math.round(u.x * 16), Math.round(u.y * 8), Math.round(u.z * 8)) > 0.7 ? col(o.spots) : base(u))) : base;
  loftBody(m, {
    x0: -L * 0.47, x1: L * 0.45,
    cy0: by + H * (o.hip ?? 0.02), cy1: by + H * (o.shoulder ?? 0.04),
    ry0: H * 0.52 * (o.haunch ?? 1), ry1: H * 0.54 * (o.chest ?? 1),
    rz0: H * 0.42 * W, rz1: H * 0.41 * W, sag: H * (o.sag ?? 0.04), shoulderBulk: o.shoulderBulk ?? 0, fine: coat.coat ? o.coatFine ?? 1 : o.fine && !o.detail ? 2 : o.fine || false, // (a per-pixel coat needs only a smooth outline; coatFine: false keeps a small animal's plain one)
    tuck: o.tuck ?? 0.4, keel: o.keel ?? 0.1,
  }, coat);
  if (o.extra) o.extra(m, { L, H, leg, by, W, coat });
  // legs: upper and lower segment, swinging from the hip
  const lc = o.legColor || shade(s.color, -0.2);
  // The upper leg wears the coat of the flank it leaves (never the pale belly below it), shading
  // into the leg's own colour toward the knee. A per-pixel coat (spots, rosettes) is drawn from
  // the model's position, so its markings run on down the leg over the blended colour; a leg with
  // markings of its own keeps them.
  const flank = V(0, 0, 0), upper = new THREE.Color(), lower = new THREE.Color(), knee = Math.min(leg * 0.72, by - H * 0.3);
  const legPaint = c => {
    if (c && c.coat) return c;
    const blend = (u, p) => {
      const k = smooth(by - H * 0.4, knee, p.y);
      if (k >= 1) return typeof c === 'function' ? c(u, p) : col(c);
      flank.set(Math.max(-1, Math.min(1, p.x / (L * 0.46))), Math.max(-0.05, Math.min(1, (p.y - by) / (H * 0.53))), Math.max(-1, Math.min(1, p.z / (H * 0.42 * W))));
      upper.copy(coat(flank, p)); lower.copy(typeof c === 'function' ? c(u, p) : col(c));
      return upper.lerp(lower, k);
    };
    const pc = coat.coat;
    return pc && pc.legs ? pixelCoat(pc.kind, blend, pc.params, pc.dark, pc.mid) : blend;
  };
  // (one smooth tube per leg, bending at the joints, rather than straight pieces with a ball at each)
  const smoothLegs = o.smoothLegs ?? true;
  const spots = [[L * 0.26, 1, P.LEG_FL], [L * 0.26, -1, P.LEG_FR], [-L * 0.25, 1, P.LEG_BL], [-L * 0.25, -1, P.LEG_BR]];
  for (const [x, side, part] of spots) {
    // set in far enough that even thick upper legs stay inside the body's outline
    const z = side * Math.min(H * 0.24, H * 0.42 - o.legR0) * W, hip = [x, by - H * 0.05, z];
    const r0 = o.legR0, r1 = o.legR1, rm = (r0 + r1) * 0.55, hind = part >= P.LEG_BL;
    const c = part < P.LEG_BL && o.frontLeg ? o.frontLeg : lc, lo = { part, pivot: hip, rings: o.legRings, seg: o.legSeg };
    let foot = [x, r1, z];
    // The leg starts as the thigh (or shoulder): wide from front to back where it leaves the body,
    // narrowing to the knee, so it grows out of the body instead of hanging under it like a post.
    // (Felines shape their own scapulae and haunches; pillar legs are thick enough.)
    // Only long legs show a thigh: on a short-legged animal (raccoon, otter, beaver) the thigh is
    // inside the body, and widening the leg just makes it fat. lk: 0 for legs half the body's
    // depth or shorter, 1 for legs as long as it is deep (deer, antelope, coyote).
    const thigh = o.muscles !== false && !o.straight, lk = smooth(0.5, 0.95, leg / H);
    const rx = r0 + (Math.max(r0 * (hind ? 1.3 : 1.1), H * (hind ? 0.22 : 0.17)) - r0) * lk, rz = Math.max(r0, Math.min(r0 * (1 + 0.1 * lk), H * 0.42 * W - Math.abs(z) * 0.8));
    if (o.straight) { // pillar legs (elephant, rhino)
      const knee = [x + (hind ? -r0 * 0.5 : r0 * 0.2), leg * 0.5, z];
      if (o.legFlare) {
        // (one column flaring a little into a broad round foot, flat underneath on the ground,
        // with no ankle and no separate foot: an elephant's)
        // The knee sits straight over the foot and the leg never narrows below it, so there's no
        // waist or overhang (a bend there folds the thick tube into a crease).
        foot = [x, r1 * 0.4, z];
        tube(m, [hip, [x, leg * 0.5, z], [x, r1 * 1.3, z], foot], [r0, r1 * 1.08, r1 * 1.08, r1 * o.legFlare], c, { ...lo, sub: 6, capLen: 0.36 });
      } else if (smoothLegs) tube(m, [hip, knee, foot], [r0, rm, r1], c, lo);
      else { m.limb(hip, knee, r0, rm, c, lo); m.limb(knee, foot, rm, r1, c, lo); }
    } else if (hind) {
      // thigh forward to the stifle, shin back to the hock, then a straight cannon to the foot
      const b = Math.min(r0 * 0.9, leg * 0.14), stifle = [x + b * 0.55, leg * 0.66, z], hock = [x - b, leg * 0.3, z];
      foot = [x - b * 0.55, r1, z];
      if (thigh) {
        // The back of the thigh (the hamstring) runs from the point of the buttock down to the hock,
        // so the rump slopes into the leg: the thigh's top reaches back to the rump, its front
        // edge staying where it was.
        // On a long leg the stifle (the true knee) sits up at the belly line, as on a deer, so what
        // shows below the body is the shin sloping back to the hock, not a knee jutting forward.
        // (The middle point lies on the line to the stifle, so the curve can't overshoot.)
        const front = x + rx, back = Math.max(-L * 0.41, front - H * 0.9), tr = rx + ((front - back) / 2 - rx) * lk;
        const knee = [x + b * (0.55 - 0.25 * lk), leg * (0.66 + 0.24 * lk), z];
        const top = [front - tr, by - H * 0.02 * lk + (hip[1] - by) * (1 - lk), z], mid = [(top[0] + knee[0]) / 2, (top[1] + knee[1]) / 2, z], mr = (tr + r0) / 2;
        tube(m, [top, mid, knee, hock, foot], [[tr, rz], [mr, rz * 0.92], [r0 * 0.85, r0 * 0.75], r1 * 1.05, r1], legPaint(c), { ...lo, up: [1, 0, 0] });
      }
      else if (smoothLegs) tube(m, [hip, stifle, hock, foot], [r0, r0 * 0.72, r1 * 1.05, r1], c, lo);
      else { m.limb(hip, stifle, r0, r0 * 0.75, c, lo); m.limb(stifle, hock, r0 * 0.7, r1 * 1.05, c, lo); m.limb(hock, foot, r1 * 1.05, r1, c, lo); }
    } else {
      // upper arm back to the elbow, forearm down to a slightly forward wrist
      const b = Math.min(r0 * 0.9, leg * 0.14), elbow = [x - b * 0.35, leg * 0.62, z], wrist = [x + b * 0.15, leg * 0.26, z];
      foot = [x + b * 0.1, r1, z];
      if (thigh) {
        // (the elbow, too, sits up against the chest on a long leg, the forearm running straight down)
        const el = [elbow[0], leg * (0.62 + 0.2 * lk), z], mid = [(hip[0] + el[0]) / 2, (hip[1] + el[1]) / 2, z];
        tube(m, [hip, mid, el, wrist, foot], [[rx, rz], [(rx + rm) / 2, rz * 0.92], [rm * 1.05, rm], r1 * 1.08, r1], legPaint(c), { ...lo, up: [1, 0, 0] });
      }
      else if (smoothLegs) tube(m, [hip, elbow, wrist, foot], [r0, rm, r1 * 1.08, r1], c, lo);
      else { m.limb(hip, elbow, r0, rm, c, lo); m.limb(elbow, wrist, rm, r1 * 1.08, c, lo); m.limb(wrist, foot, r1 * 1.08, r1, c, lo); }
    }
    if (o.nails) for (const t of [-1, 0, 1]) m.ell([foot[0] + r1 * 0.91, r1 * 0.5, z + t * r1 * 0.57], [r1 * 0.22, r1 * 0.26, r1 * 0.23], '#a89e8d', lo);
    if (o.foot) o.foot(m, foot, r1, lo, hind);
    else if (o.hoof && o.splitHoof) for (const toe of [-1, 1]) m.ell([foot[0] + r1 * 0.2, r1 * 0.75, z + toe * r1 * 0.52], [r1 * 1.25, r1 * 0.85, r1 * 0.48], o.hoof, { part, pivot: hip, gloss: 1 });
    else if (o.hoof) m.ell([foot[0] + r1 * 0.2, r1 * 0.75, z], [r1 * 1.3, r1 * 0.85, r1 * 1.15], o.hoof, { part, pivot: hip, lo: true, gloss: 1 });
    else if (o.paws && (o.toes || smoothLegs)) {
      m.ell([foot[0] + r1 * 0.45, r1 * 0.63, z], [r1 * 1.35, r1 * 0.62, r1 * 1.1], c, { part, pivot: hip, fine: o.detail });
      if (o.toes) for (const t of [-1, 0, 1]) m.ell([foot[0] + r1 * 1.15, r1 * 0.48, z + t * r1 * 0.52], [r1 * 0.42, r1 * 0.38, r1 * 0.32], c, { part, pivot: hip });
    }
    else if (o.paws) m.ell([foot[0] + r1 * 0.4, r1 * 0.72, z], [r1 * 1.4, r1 * 0.75, r1 * 1.12], c, { part, pivot: hip, lo: true });
  }

  // head and neck, which dip together when grazing
  const neck = [L * 0.3, by + H * 0.12, 0];
  const hp = o.head, hr = o.headR;
  const hc = o.headPaint || (o.headColor ? grad(o.headColor, s.belly || o.headColor, -0.4, 0.5) : coat);
  const hd = { part: P.HEAD, pivot: neck, fine: o.detail };
  const nc = o.neckColor ? solid(o.neckColor) : hc;
  if (o.neckPath) tube(m, o.neckPath, o.neckRadii, nc, { ...hd, seg: o.neckSeg ?? 16, sub: o.neckSub ?? 6 });
  else if (o.neckR) {
    // rooted low and back in the chest, deep and flattened from side to side where it leaves the
    // shoulders, narrowing up to the head (a straight pipe of one width read as a head on a stick)
    const end = [hp[0] - hr[0] * 0.3, hp[1] - hr[1] * 0.2, 0], r = o.neckR, root = [neck[0] - r * 0.5, Math.min(neck[1], end[1]) - r * 0.35, 0];
    const mid = [(root[0] + end[0]) / 2 + r * 0.1, (root[1] + end[1]) / 2 + r * 0.12, 0];
    tube(m, [root, mid, end], [[r * 1.45, r * 1.12], [r * 1.05, r * 0.9], [r * 0.85, r * 0.78]], nc, { ...hd, seg: o.neckSeg ?? (o.detail ? 14 : 10), sub: 3, capRings: 2 });
  }
  const sn = [hp[0] + hr[0] * 0.78, hp[1] - hr[1] * 0.28, 0];
  if (o.roundHead) { // (a ball for the skull and another for the muzzle, for a species the shaped head doesn't suit)
    m.ell(hp, hr, hc, hd);
    if (!o.noMuzzle) m.ell([sn[0] + o.snout * 0.3, sn[1], 0], [o.snout, hr[1] * 0.55, hr[2] * 0.58], o.muzzle || hc, hd);
  } else headLoft(m, hp, hr, o.noMuzzle ? 0 : o.snout, sn, hc, o.muzzle, o, hd);
  if (o.nose !== false) m.ell([sn[0] + o.snout * 1.22, sn[1] + hr[1] * 0.1, 0], [hr[1] * 0.2, hr[1] * 0.17, hr[1] * 0.22], '#1c1714', { ...hd, lo: true, gloss: 1 });
  eyes(m, hp, hr[0] * 0.42, hr[1] * 0.28, hr[2] * (o.eyeOut ?? 0.78), o.eyeR ?? Math.max(0.55, H * 0.045), P.HEAD, neck);
  m.eyeAt = [hp[0] + hr[0] * 0.42, hp[1] + hr[1] * 0.28, hr[2] * (o.eyeOut ?? 0.78)]; m.eyePivot = neck; // for eye-shine at night: forward, up, apart
  if (o.mask) m.ell([hp[0] + hr[0] * 0.4, hp[1] + hr[1] * 0.2, 0], [hr[0] * 0.35, hr[1] * 0.3, hr[2] * 1.02], s.dark, hd);
  const ec = o.earColor || shade(s.color, -0.1);
  for (const side of [1, -1]) {
    const base = [hp[0] - hr[0] * 0.2, hp[1] + hr[1] * 0.75, side * hr[2] * 0.55];
    if (o.ears === 'none') continue;
    // (earShape, earInner, earTip, earTipAt, earRim and earCup fine-tune the shared pinna)
    const look = { ...hd, inner: o.earInner, tip: o.earTip, tipAt: o.earTipAt, rim: o.earRim, cup: o.earCup };
    if (o.ears === 'round') {
      const tip = [base[0] - o.ear * 0.12, base[1] + o.ear * 0.85, base[2] + side * o.ear * 0.3];
      pinna(m, base, tip, o.ear * 0.95, ec, { ...look, shape: o.earShape ?? 'round', cup: o.earCup ?? 0.4, out: 0.35 });
    } else {
      const tip = [base[0] - o.ear * (o.earBack ?? 0.25), base[1] + o.ear, base[2] + side * o.ear * (o.earOut ?? 0.35)];
      pinna(m, base, tip, o.ear * (o.earW ?? 0.32) * 2.2, ec, { ...look, shape: o.earShape ?? 'point' });
      if (o.tufts) m.limb(tip, [tip[0], tip[1] + o.ear * 0.35, tip[2]], o.ear * 0.05, o.ear * 0.01, s.dark, { ...hd, caps: false }); // (a lynx's tuft of hair)
    }
  }
  if (o.antlers) { m.hard = true; o.antlers(m, hp, hr, hd); m.hard = false; } // (antlers, horns, ossicones)
  if (o.face) o.face(m, hp, hr, hd, sn);
  if (o.tail) o.tail(m, { L, H, leg, by, W, coat, part: P.TAIL });
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
  geo = m.finer(geo);
  let unit = sculptBase.get(geo);
  if (!unit) { unit = geo.clone(); unit.deleteAttribute('uv'); unit.deleteAttribute('normal'); unit = mergeVertices(unit); sculptBase.set(geo, unit); }
  const g = unit.clone(), p = g.attributes.position, d = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { d.fromBufferAttribute(unit.attributes.position, i); const q = fn(d); p.setXYZ(i, q[0], q[1], q[2]); }
  g.computeVertexNormals();
  m.add(g, new THREE.Matrix4(), paint, { ...o, paintGeo: unit });
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

export { Model, P, SCALE, SPH, SPH_HI, SPH_XL, cells, cloudCoat, pixelCoat, col, cyl, ellHi, eyes, felineSpots, flat, grad, hash3, jaguarCoat, locks, loftBody, onProfile, pinna, pinnaAt, place, quadruped, sculpt, shade, smooth, solid, stumpLegs, tmp, tube, wingShape };
