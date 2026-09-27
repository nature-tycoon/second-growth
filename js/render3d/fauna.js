// Wildlife as small, soft 3D models. Each species is built once from smooth primitives
// (bodies, limbs, heads, wings) with baked vertex colours, then drawn as one instanced mesh.
// A vertex shader animates legs, wings, tails, heads and swimming, driven by a per-animal
// attribute, so hundreds of animals cost one draw call per species.
//
// Models are built in "sprite pixel" units (the same numbers as the 2D field-guide art):
// +x is forward, +y is up, the feet stand on y = 0.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/BufferGeometryUtils.js';

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
const hash3 = (x, y, z) => { const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return h - Math.floor(h); };

// ---------------------------------------------------------------- geometry builder
const SPH = new THREE.SphereGeometry(1, 12, 9);
const SPH_LO = new THREE.SphereGeometry(1, 7, 5);
const SPH_HI = new THREE.SphereGeometry(1, 24, 16); // for bodies that carry fine markings

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
function cyl(r0, r1, seg = 7) {
  const k = r0.toFixed(3) + '|' + r1.toFixed(3) + '|' + seg;
  let g = cylCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(r1, r0, 1, seg, 1, true).translate(0, 0.5, 0); cylCache.set(k, g); }
  return g;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Q = new THREE.Quaternion(), E = new THREE.Euler(), UP = V(0, 1, 0);
const place = (pos, rot, scl) => new THREE.Matrix4().compose(V(...pos), Q.setFromEuler(E.set(rot[0], rot[1], rot[2])).clone(), V(...scl));

class Model {
  constructor() { this.parts = []; }
  // geo: a unit primitive; m: where it goes; paint(unitPos, worldPos) -> colour.
  // ext: a second placement (wings spread out), blended in by the shader when flying.
  add(geo, m, paint, { part = P.BODY, pivot = null, ext = null } = {}) {
    const unit = geo.clone();
    if (unit.attributes.uv) unit.deleteAttribute('uv');
    const g = unit.clone().applyMatrix4(m);
    const n = g.attributes.position.count;
    const color = new Float32Array(n * 3), u = new THREE.Vector3(), p = new THREE.Vector3();
    const fn = typeof paint === 'function' ? paint : solid(paint);
    for (let i = 0; i < n; i++) {
      u.fromBufferAttribute(unit.attributes.position, i);
      p.fromBufferAttribute(g.attributes.position, i);
      const c = fn(u, p);
      color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
    const pv = pivot || [0, 0, 0], piv = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { piv[i * 3] = pv[0]; piv[i * 3 + 1] = pv[1]; piv[i * 3 + 2] = pv[2]; }
    g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
    const e = ext ? unit.clone().applyMatrix4(ext) : g;
    g.setAttribute('aExt', e.attributes.position.clone());
    g.setAttribute('aExtN', e.attributes.normal.clone());
    this.parts.push(g);
  }
  ell(pos, r, paint, o = {}) { this.add(o.lo ? SPH_LO : SPH, place(pos, o.rot || [0, 0, 0], r), paint, o); }
  // A tapered limb from p0 (radius r0) to p1 (radius r1), with rounded ends.
  limb(p0, p1, r0, r1, paint, o = {}) {
    const a = V(...p0), d = V(...p1).sub(a), len = d.length() || 1e-3;
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    this.add(cyl(r0, r1, o.seg), new THREE.Matrix4().compose(a, q, V(1, len, 1)), paint, o);
    if (o.caps !== false) {
      this.add(SPH_LO, place(p0, [0, 0, 0], [r0, r0, r0]), paint, o);
      this.add(SPH_LO, place(p1, [0, 0, 0], [r1, r1, r1]), paint, o);
    }
  }
  // A wing: spread sideways from the shoulder when flying, laid back along the flank when not.
  wing(side, pivot, span, chord, thick, paint, fold) {
    const ext = place([pivot[0] - chord * 0.25, pivot[1], pivot[2] + side * span * 0.95], [0, 0, 0], [chord, thick, span]);
    // Folded, the same ellipse stands on edge against the flank: its span runs back along the body
    // (tip toward the tail), its chord becomes the wing's height and its thickness points sideways.
    // (upper side of the wing faces outward, so the darker top colour shows)
    const folded = new THREE.Matrix4().makeBasis(V(0, -1, 0), V(0, 0, side), V(-side, 0, 0))
      .premultiply(new THREE.Matrix4().makeRotationZ(0.16))
      .multiply(new THREE.Matrix4().makeScale(chord * 0.5, thick, span * 0.58))
      .setPosition(V(...fold));
    this.add(SPH, folded, paint, { part: side > 0 ? P.WING_L : P.WING_R, pivot, ext });
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

function quadruped(m, s, o) {
  const L = s.len, H = o.H, leg = o.leg, W = o.wide ?? 1;
  const by = leg + H * 0.5;
  const coat = grad(s.color, s.belly || s.color, -0.3, 0.5);
  m.ell([0, by, 0], [L * 0.34, H * 0.46, H * 0.38 * W], coat);
  m.ell([L * 0.19, by + H * (o.shoulder ?? 0.04), 0], [L * 0.24, H * 0.5 * (o.chest ?? 1), H * 0.4 * W], coat);
  m.ell([-L * 0.21, by + H * (o.hip ?? 0.02), 0], [L * 0.24, H * 0.5 * (o.haunch ?? 1), H * 0.42 * W], coat);
  if (o.extra) o.extra(m, { L, H, leg, by, W, coat });

  // legs: upper and lower segment, swinging from the hip
  const lc = o.legColor || shade(s.color, -0.2);
  const spots = [[L * 0.26, 1, P.LEG_FL], [L * 0.26, -1, P.LEG_FR], [-L * 0.25, 1, P.LEG_BL], [-L * 0.25, -1, P.LEG_BR]];
  for (const [x, side, part] of spots) {
    const z = side * H * 0.24 * W, hip = [x, by - H * 0.05, z];
    const r0 = o.legR0, r1 = o.legR1, knee = [x + (part >= P.LEG_BL ? -r0 * 0.5 : r0 * 0.2), leg * 0.5, z];
    m.limb(hip, knee, r0, (r0 + r1) * 0.55, lc, { part, pivot: hip });
    m.limb(knee, [x, r1, z], (r0 + r1) * 0.55, r1, lc, { part, pivot: hip });
    if (o.hoof) m.ell([x + r1 * 0.2, r1 * 0.75, z], [r1 * 1.3, r1 * 0.85, r1 * 1.15], o.hoof, { part, pivot: hip, lo: true });
  }

  // head and neck, which dip together when grazing
  const neck = [L * 0.3, by + H * 0.12, 0];
  const hp = o.head, hr = o.headR;
  const hc = o.headColor ? grad(o.headColor, s.belly || o.headColor, -0.4, 0.5) : coat;
  const hd = { part: P.HEAD, pivot: neck };
  if (o.neckR) m.limb(neck, [hp[0] - hr[0] * 0.3, hp[1] - hr[1] * 0.2, 0], o.neckR, o.neckR * 0.8, o.neckColor ? solid(o.neckColor) : hc, hd);
  m.ell(hp, hr, hc, hd);
  const sn = [hp[0] + hr[0] * 0.78, hp[1] - hr[1] * 0.28, 0];
  m.ell([sn[0] + o.snout * 0.3, sn[1], 0], [o.snout, hr[1] * 0.55, hr[2] * 0.58], o.muzzle || hc, hd);
  m.ell([sn[0] + o.snout * 1.22, sn[1] + hr[1] * 0.1, 0], [hr[1] * 0.2, hr[1] * 0.17, hr[1] * 0.22], '#1c1714', { ...hd, lo: true });
  eyes(m, hp, hr[0] * 0.42, hr[1] * 0.28, hr[2] * 0.78, Math.max(0.55, H * 0.045), P.HEAD, neck);
  if (o.mask) m.ell([hp[0] + hr[0] * 0.4, hp[1] + hr[1] * 0.2, 0], [hr[0] * 0.35, hr[1] * 0.3, hr[2] * 1.02], s.dark, hd);
  const ec = o.earColor || shade(s.color, -0.1);
  for (const side of [1, -1]) {
    const base = [hp[0] - hr[0] * 0.2, hp[1] + hr[1] * 0.75, side * hr[2] * 0.55];
    if (o.ears === 'round') m.ell([base[0], base[1] + o.ear * 0.3, base[2]], [o.ear * 0.45, o.ear * 0.55, o.ear * 0.25], ec, hd);
    else {
      const tip = [base[0] - o.ear * (o.earBack ?? 0.25), base[1] + o.ear, base[2] + side * o.ear * (o.earOut ?? 0.35)];
      m.limb(base, tip, o.ear * (o.earW ?? 0.32), o.ear * 0.06, ec, hd);
      if (o.tufts) m.limb(tip, [tip[0], tip[1] + o.ear * 0.35, tip[2]], o.ear * 0.08, o.ear * 0.02, s.dark, { ...hd, caps: false });
    }
  }
  if (o.antlers) o.antlers(m, hp, hr, hd);
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
      H, leg, legR0: H * 0.15, legR1: H * 0.08, neckR: H * 0.26, legColor: shade(s.color, -0.12),
      head: [L * 0.52, by + H * 0.5], headR: [H * 0.34, H * 0.3, H * 0.27], snout: H * 0.36,
      ears: 'point', ear: H * 0.38, earOut: 0.15, earBack: 0.05, muzzle: grad(s.color, s.belly, -0.1, 0.4),
      tail: (m, b) => {
        m.ell([-L * 0.58, b.by - H * 0.1, 0], [L * 0.24, H * 0.2, H * 0.2], grad(s.color, s.belly), { part: P.TAIL, pivot: [-L * 0.42, b.by + H * 0.15, 0], rot: [0, 0, 0.75] });
        m.ell([-L * 0.72, b.by - H * 0.42, 0], [H * 0.17, H * 0.14, H * 0.14], s.dark, { part: P.TAIL, pivot: [-L * 0.42, b.by + H * 0.15, 0], lo: true });
      },
    };
  },
  feline: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    return {
      H, leg, legR0: H * 0.18, legR1: H * 0.1, neckR: H * 0.28,
      head: [L * 0.5, by + H * 0.38], headR: [H * 0.34, H * 0.32, H * 0.32], snout: H * 0.15,
      ears: 'point', ear: H * 0.26, earOut: 0.2, earBack: 0.1, earW: 0.45, tufts: s.bobtail, muzzle: grad(s.color, s.belly, 0.1, 0.4),
      tail: (m, b) => {
        const base = [-L * 0.42, b.by + H * 0.15, 0], o = { part: P.TAIL, pivot: base };
        if (s.bobtail) { m.ell([-L * 0.47, b.by + H * 0.22, 0], [H * 0.2, H * 0.12, H * 0.12], s.color, { ...o, rot: [0, 0, 0.5] }); return; }
        const p1 = [-L * 0.7, b.by - H * 0.35, 0], p2 = [-L * 0.95, b.by - H * 0.2, 0];
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
    const L = s.len, H = L * 0.42, leg = L * 0.3, by = leg + H * 0.5;
    return {
      H, leg, wide: 1.05, legR0: H * 0.17, legR1: H * 0.1, legColor: s.dark, neckR: H * 0.3, hip: 0.1,
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
};

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
  raptor: s => ({ legH: 0.16, tilt: 0.45, span: 0.95, chord: 0.3, beak: 0.14, beakColor: '#e0b030', legColor: '#e0b030', tail: 0.35, hook: true }),
  owl: s => ({ legH: 0.12, tilt: 1.25, span: 0.85, chord: 0.3, beak: 0.08, beakColor: '#8a7a5a', legColor: '#8a7a5a', tail: 1.2, owl: true, head: 0.28 }),
};

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
  if (o.owl) hp = [S * 0.12, by + S * 0.36, 0];
  else if (o.neck) hp = [S * 0.5, by + S * 0.6, 0];
  else if (o.duck) hp = [S * 0.38, by + S * 0.28, 0];
  else hp = [S * 0.34 + Math.sin(o.tilt) * S * 0.02, by + S * 0.2 + Math.sin(o.tilt) * S * 0.12, 0];
  const neckBase = [S * 0.25, by + S * 0.1, 0], hd = { part: P.HEAD, pivot: neckBase };
  if (o.neck) {
    m.limb([S * 0.3, by + S * 0.08, 0], [S * 0.42, by + S * 0.32, 0], S * 0.09, S * 0.07, s.breast, hd);
    m.limb([S * 0.42, by + S * 0.32, 0], [hp[0] - hr * 0.5, hp[1] - hr * 0.2, 0], S * 0.07, S * 0.06, s.breast, hd);
  }
  if (o.duck) m.limb([S * 0.3, by + S * 0.08, 0], hp, S * 0.12, S * 0.11, s.head, hd);
  m.ell(hp, [hr * 1.05, hr, hr * (o.owl ? 1.1 : 0.95)], s.head, hd);
  if (o.owl) {
    for (const side of [1, -1]) m.ell([hp[0] + hr * 0.62, hp[1], side * hr * 0.42], [hr * 0.25, hr * 0.52, hr * 0.45], s.breast, hd);
    eyes(m, hp, hr * 0.85, hr * 0.08, hr * 0.4, hr * 0.17, P.HEAD, neckBase, '#e8c030');
    eyes(m, hp, hr * 0.97, hr * 0.08, hr * 0.4, hr * 0.09, P.HEAD, neckBase);
  } else eyes(m, hp, hr * 0.45, hr * 0.25, hr * 0.78, Math.max(0.45, hr * 0.17), P.HEAD, neckBase);
  if (s.crest) m.limb([hp[0] - hr * 0.2, hp[1] + hr * 0.7, 0], [hp[0] - hr * 1.2, hp[1] + hr * 1.3, 0], hr * 0.35, hr * 0.05, s.head, hd);
  if (s.fancy) m.limb([hp[0] - hr * 0.3, hp[1] + hr * 0.5, 0], [hp[0] - hr * 1.5, hp[1] + hr * 0.1, 0], hr * 0.45, hr * 0.12, s.head, hd);
  const bb = [hp[0] + hr * 0.85, hp[1] - hr * (o.duck ? 0.25 : 0.1), 0], bl = S * o.beak;
  if (o.duck) m.ell([bb[0] + bl * 0.45, bb[1], 0], [bl * 0.6, hr * 0.18, hr * 0.42], o.beakColor, hd);
  else {
    m.limb(bb, [bb[0] + bl, bb[1] - (o.hook ? bl * 0.35 : bl * 0.05), 0], S * (o.beakR ?? 0.06), S * 0.01, o.beakColor, { ...hd, caps: false });
    if (o.hook) m.ell(bb, [S * 0.06, S * 0.06, S * 0.06], o.beakColor, { ...hd, lo: true });
  }

  // tail
  const tb = [-S * 0.3, by - S * 0.02, 0];
  m.ell([-S * 0.52, by - S * 0.08 + Math.sin(-o.tail * 0.3) * S * 0.2, 0], [S * 0.3, S * 0.035, S * 0.13], s.tail || s.color, { rot: [0, 0, o.tail * 0.6 + 0.15], part: P.TAIL, pivot: tb });

  // legs
  if (!o.duck) for (const side of [1, -1]) {
    const hip = [S * 0.02, by - S * 0.12, side * S * 0.07];
    m.limb(hip, [S * 0.04, S * 0.02, side * S * 0.08], S * (o.legH > 0.5 ? 0.028 : 0.035), S * 0.022, o.legColor, { part: side > 0 ? P.LEG_FL : P.LEG_FR, pivot: hip });
  }

  // wings
  const wc = grad(s.color, shade(s.color, 0.25), 0, 0.5);
  for (const side of [1, -1]) {
    m.wing(side, [S * 0.1, by + S * 0.1, side * S * 0.14], S * o.span, S * o.chord, S * 0.035, wc, [-S * 0.1, by + S * 0.05, side * S * 0.2]);
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
function frog(m, s) {
  const S = s.size, skin = grad(s.color, shade(s.color, 0.35), -0.1, 0.35), leg = s.dark && s.dark !== '#2a4a1e' ? s.dark : shade(s.color, -0.15);
  m.ell([0, S * 0.3, 0], [S * 0.42, S * 0.26, S * 0.36], skin, { rot: [0, 0, 0.25] });
  m.ell([S * 0.3, S * 0.38, 0], [S * 0.26, S * 0.2, S * 0.3], skin);
  for (const side of [1, -1]) {
    m.ell([S * 0.38, S * 0.56, side * S * 0.16], [S * 0.1, S * 0.1, S * 0.1], skin, { lo: true });
    m.ell([S * 0.45, S * 0.58, side * S * 0.18], [S * 0.05, S * 0.06, S * 0.05], '#141210', { lo: true });
    if (s.kind === 'frog' && s.dark === '#2a4a1e') m.ell([S * 0.3, S * 0.44, side * S * 0.25], [S * 0.18, S * 0.035, S * 0.05], s.dark, { lo: true });
    m.ell([-S * 0.2, S * 0.2, side * S * 0.32], [S * 0.3, S * 0.13, S * 0.12], leg, { rot: [0, side * 0.35, 0.2], part: side > 0 ? P.LEG_BL : P.LEG_BR, pivot: [-S * 0.1, S * 0.25, side * S * 0.25] });
    m.ell([-S * 0.05, S * 0.05, side * S * 0.4], [S * 0.22, S * 0.05, S * 0.1], leg, { lo: true, part: side > 0 ? P.LEG_BL : P.LEG_BR, pivot: [-S * 0.1, S * 0.25, side * S * 0.25] });
    m.limb([S * 0.3, S * 0.25, side * S * 0.2], [S * 0.4, S * 0.03, side * S * 0.28], S * 0.06, S * 0.05, leg, { part: side > 0 ? P.LEG_FL : P.LEG_FR, pivot: [S * 0.3, S * 0.25, side * S * 0.2] });
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
  m.ell([0, S * 0.24, 0], [S * 0.46, S * 0.24, S * 0.38], shell);
  m.ell([0, S * 0.13, 0], [S * 0.47, S * 0.05, S * 0.39], shade(s.dark, -0.2));
  const skin = shade(s.dark, 0.1);
  m.ell([S * 0.52, S * 0.2, 0], [S * 0.16, S * 0.12, S * 0.12], skin, { part: P.HEAD, pivot: [S * 0.4, S * 0.18, 0] });
  eyes(m, [S * 0.52, S * 0.2, 0], S * 0.08, S * 0.04, S * 0.09, S * 0.025, P.HEAD, [S * 0.4, S * 0.18, 0]);
  const legs = [[S * 0.28, 1, P.LEG_FL], [S * 0.28, -1, P.LEG_FR], [-S * 0.28, 1, P.LEG_BL], [-S * 0.28, -1, P.LEG_BR]];
  for (const [x, side, part] of legs) { const hip = [x, S * 0.15, side * S * 0.28]; m.limb(hip, [x, S * 0.04, side * S * 0.4], S * 0.08, S * 0.07, skin, { part, pivot: hip }); }
  m.limb([-S * 0.42, S * 0.16, 0], [-S * 0.58, S * 0.08, 0], S * 0.05, S * 0.015, skin, { part: P.TAIL, pivot: [-S * 0.42, S * 0.16, 0] });
}

function snake(m, s) {
  const S = s.size, Ls = S * 2.4, N = 12, cy = S * 0.08;
  // Limbs run tail-ward along -x, so in their own space +x is the snake's back and z its sides.
  const paint = (u, p) => {
    const r = Math.hypot(u.x, u.z) || 1, up = u.x / r, sd = Math.abs(u.z) / r;
    if (up > 0.93) return col(s.stripe);
    if (sd > 0.9 && up > -0.3 && up < 0.3) return hash3(Math.round(p.x / (S * 0.09)), 0, 0) > 0.55 ? col(s.side) : shade(s.stripe, -0.25);
    return up < -0.6 ? shade(s.color, 0.45) : col(s.color);
  };
  const headPaint = u => u.y > 0.6 ? col(s.color) : u.y < -0.3 ? shade(s.color, 0.4) : col(s.color);
  let prev = null;
  for (let k = 0; k <= N; k++) {
    const t = k / N, x = Ls * 0.45 - t * Ls, r = S * 0.08 * (t < 0.1 ? 0.85 + t : t > 0.6 ? 1 - (t - 0.6) * 2.1 : 1);
    const pt = [x, cy * Math.max(0.5, r / (S * 0.08)), 0];
    if (prev) m.limb(prev.p, pt, prev.r, Math.max(r, S * 0.012), paint, { caps: k === N, seg: 14 });
    prev = { p: pt, r: Math.max(r, S * 0.012) };
  }
  m.ell([Ls * 0.5, cy, 0], [S * 0.13, S * 0.075, S * 0.095], headPaint);
  eyes(m, [Ls * 0.5, cy, 0], S * 0.06, S * 0.03, S * 0.07, S * 0.02, P.BODY, null);
}

// Trout and salmon: a torpedo body narrowing to the tail, a forked tail fin, dorsal, adipose,
// anal and pectoral fins, and markings painted over a fine mesh.
function fish(m, s) {
  const S = s.size, cy = S * 0.2, coho = !!s.head;
  const back = coho ? '#2f4a38' : '#66784a', flank = coho ? '#c5403a' : '#c6bd86', belly = coho ? '#9a6a60' : '#ece6d2';
  const spotAt = (u, dens) => hash3(u.x * 37.1, u.y * 53.7, u.z * 29.3) > dens; // single-vertex freckles
  const body = u => {
    const t = (1 - u.x) / 2; // 0 at the nose, 1 at the tail
    let c = u.y > 0.25 ? tmp.copy(col(back)).lerp(col(flank), smooth(0.55, 0.25, u.y)) : tmp.copy(col(flank)).lerp(col(belly), smooth(-0.25, -0.6, u.y));
    if (coho && t < 0.3) c = tmp.copy(col(back)).lerp(col(belly), smooth(0.1, -0.5, u.y));
    const dens = coho ? 0.95 : 0.96 - t * 0.1; // cutthroat spots gather toward the tail
    if (u.y > -0.35 && spotAt(u, dens)) return col(s.spots);
    return c;
  };
  m.add(SPH_HI, place([0, cy, 0], [0, 0, 0], [S * 0.44, S * 0.15, S * 0.085]), body);
  // head, slightly pointed, with the cutthroat's red slash under the jaw
  const head = u => {
    if (s.throat && u.y < -0.35 && u.x > -0.2) return col(s.throat);
    return coho ? tmp.copy(col(back)).lerp(col(belly), smooth(0.2, -0.6, u.y)) : tmp.copy(col(back)).lerp(col(belly), smooth(0.35, -0.55, u.y));
  };
  m.ell([S * 0.3, cy - S * 0.005, 0], [S * 0.17, S * 0.115, S * 0.075], head);
  m.ell([S * 0.43, cy - S * 0.03, 0], [S * 0.06, S * 0.035, S * 0.05], coho ? '#3a3a30' : shade(back, 0.2)); // snout / kype
  for (const side of [1, -1]) {
    m.ell([S * 0.36, cy + S * 0.025, side * S * 0.058], [S * 0.03, S * 0.03, S * 0.012], '#e8d890', { lo: true });
    m.ell([S * 0.365, cy + S * 0.025, side * S * 0.066], [S * 0.017, S * 0.017, S * 0.008], '#111010', { lo: true });
    m.ell([S * 0.2, cy - S * 0.07, side * S * 0.075], [S * 0.07, S * 0.012, S * 0.03], shade(flank, -0.1), { rot: [side * 0.5, 0.3 * side, -0.4] }); // pectoral
  }
  // narrow tail stock, then the forked tail that sweeps side to side
  const tailC = shade(coho ? back : '#7a8452', -0.05);
  m.ell([-S * 0.38, cy, 0], [S * 0.16, S * 0.075, S * 0.045], body);
  const tail = { part: P.TAIL, pivot: [-S * 0.46, cy, 0] };
  m.add(flat(sh => { sh.moveTo(0, 0.2); sh.quadraticCurveTo(-0.6, 0.5, -1, 0.7); sh.quadraticCurveTo(-0.72, 0.2, -0.75, 0); sh.quadraticCurveTo(-0.72, -0.2, -1, -0.7); sh.quadraticCurveTo(-0.6, -0.5, 0, -0.2); sh.lineTo(0, 0.2); }),
    place([-S * 0.5, cy, 0], [0, 0, 0], [S * 0.2, S * 0.2, S * 0.012]), tailC, tail);
  // dorsal, adipose and anal fins
  const fin = flat(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.2, 0.9, -0.2, 1); sh.quadraticCurveTo(-0.3, 0.4, -0.5, 0); sh.lineTo(0.5, 0); });
  m.add(fin, place([S * 0.02, cy + S * 0.12, 0], [0, 0, 0], [S * 0.13, S * 0.1, S * 0.01]), tailC);
  m.ell([-S * 0.3, cy + S * 0.075, 0], [S * 0.035, S * 0.025, S * 0.008], tailC, { lo: true });
  m.add(fin, place([-S * 0.22, cy - S * 0.11, 0], [Math.PI, 0, 0], [S * 0.09, S * 0.07, S * 0.01]), shade(flank, -0.15));
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

// ---------------------------------------------------------------- species -> model + motion
// motion: leg swing (radians), body bob (px), tail sway, wing beat rate, swim/slither wave.
export function buildSpecies(def) {
  const s = def.sprite, m = new Model();
  const mo = { leg: 0.55, bob: 0, tail: 0.25, flap: 1.6, wave: 0, waveK: 0, waveHead: 0, waveLen: 1, sink: 0, len: s.len || s.size };
  switch (s.kind) {
    case 'squirrel': squirrel(m, s); mo.leg = 0.45; mo.bob = 1.1; mo.sink = 3; break;
    case 'rabbit': rabbit(m, s); mo.leg = 0.35; mo.bob = 2.6; mo.sink = 3.5; break;
    case 'bear': bear(m, s); mo.leg = 0.38; mo.bob = 0.6; mo.sink = s.leg + s.h * 0.45; break;
    case 'deer': case 'canine': case 'feline': case 'raccoon': case 'otter': case 'beaver': case 'rodent': {
      const o = MAMMALS[s.kind](s);
      quadruped(m, s, o);
      mo.bob = o.H * (s.kind === 'rabbit' ? 0.35 : s.kind === 'rodent' || s.kind === 'squirrel' ? 0.12 : 0.04);
      mo.leg = s.kind === 'bear' ? 0.4 : s.kind === 'rabbit' ? 0.35 : 0.55;
      mo.sink = o.leg + o.H * 0.45;
      break;
    }
    case 'songbird': case 'hummer': case 'woodpecker': case 'heron': case 'duck': case 'raptor': case 'owl':
      bird(m, s);
      mo.flap = s.kind === 'hummer' ? 7 : s.kind === 'heron' || s.kind === 'raptor' || s.kind === 'owl' ? 0.9 : 2;
      mo.leg = 0.5; mo.tail = 0.1;
      mo.sink = s.kind === 'duck' ? s.size * 0.24 : 0;
      break;
    case 'bat': bat(m, s); mo.flap = 2.6; break;
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
    this.mat = faunaMaterial(motion);
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
