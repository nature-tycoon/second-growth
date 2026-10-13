// Shrub and understory model builders.
import * as THREE from 'three';
import { mulberry32 } from '../../rng.js';
import { at, frond, merge, prep, ribbon, rod, shadeVerts, sheet, soft, speck, strap, twoSided, volumeNormals } from './primitives.js';

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

// lod: 0 close, 1 distant, 2 in-between (play zoom): the close model's shape and branches, with
// plainer leaf clumps, which are most of a shrub's triangles. Shapes without leaf clumps come out
// the same as the close model.
export function shrub(type, seed, lod = 0) {
  const r = mulberry32(seed);
  const parts = [];
  const mid = lod === 2;
  if (mid) lod = 0;
  let cy = 0.2;
  const blob = (x, y, z, s, sy = 0.85, shade = 1) => {
    const g = soft(new THREE.IcosahedronGeometry(s * (lod ? 1.15 : mid ? 1.06 : 1), lod || mid ? 0 : 1), { seed: seed + parts.length * 3, lump: s * 0.3, transform: gg => { gg.scale(1, sy, 1); gg.translate(x, y, z); } });
    shadeVerts(g, (xx, yy) => shade * (0.8 + Math.min(0.3, (yy - y + s) / (2 * s) * 0.3)));
    parts.push(g);
  };
  // woody stems, darkened to read as bark under the leaf colour the instance carries
  const stem = (p, q, r0, r1, sides = lod || mid ? 3 : 4) => parts.push(shadeVerts(rod(p, q, r0, r1, sides), () => [0.62, 0.5, 0.42]));
  switch (type) {
    case 'bramble':
      cy = 0.16;
      for (let k = 0; k < 10; k++) { const a = r() * 6.28, d = r() * 0.3; blob(Math.cos(a) * d, 0.1 + r() * 0.12, Math.sin(a) * d, 0.15 + r() * 0.07, 0.68, 0.8 + r() * 0.2); }
      for (let k = 0; k < (lod ? 0 : 6); k++) { // (the thin arching canes are too fine to see on the simple model)
        const c = prep(new THREE.TorusGeometry(0.19 + r() * 0.1, 0.009, mid ? 3 : 4, mid ? 7 : 12, Math.PI), 0xb07070);
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

export { gingerStalks, pandanBranches };
