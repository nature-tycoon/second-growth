// Coral growth forms and reef shell geometry.
import * as THREE from 'three';
import { mulberry32 } from '../../rng.js';
import { merge, rod, shadeVerts, soft, twoSided } from './primitives.js';

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
