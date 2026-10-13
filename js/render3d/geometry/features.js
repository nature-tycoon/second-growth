// Habitat features, fences, water crossings and contact shadows.
import * as THREE from 'three';
import { mulberry32 } from '../../rng.js';
import { at, merge, prep, rod, shadeVerts, soft, wobble } from './primitives.js';

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
// The forest floor under a closed canopy (drawn only, no gameplay): a drift of fallen leaves, a
// dead branch and, in some, a little cluster of mushrooms. Low enough to sit under any animal.
export function floorLitter(seed) {
  const r = mulberry32(seed);
  const parts = [];
  const LEAF = [0x8a5a32, 0x9c6a3a, 0x6e4a2c, 0xa8803e, 0x5e5a30];
  for (let k = 0, n = 9 + Math.floor(r() * 5); k < n; k++) {
    const g = prep(new THREE.CircleGeometry(0.022 + r() * 0.018, 5), LEAF[Math.floor(r() * LEAF.length)]);
    g.rotateX(-Math.PI / 2 + (r() - 0.5) * 0.5); g.rotateY(r() * 6.28);
    const a = r() * 6.28, d = Math.sqrt(r()) * 0.2;
    at(g, Math.cos(a) * d, 0.006 + r() * 0.01, Math.sin(a) * d * 0.8); parts.push(g);
  }
  if (r() < 0.75) { // a dead branch, with a side twig
    const len = 0.28 + r() * 0.22, br = prep(new THREE.CylinderGeometry(0.011, 0.016, len, 4), 0x6a5038);
    br.rotateZ(Math.PI / 2); br.rotateY(r() * 6.28); at(br, (r() - 0.5) * 0.12, 0.014, (r() - 0.5) * 0.12); parts.push(br);
    const tw = prep(new THREE.CylinderGeometry(0.004, 0.007, len * 0.4, 3), 0x6a5038);
    tw.rotateZ(Math.PI / 2 - 0.6); tw.rotateY(r() * 6.28); at(tw, (r() - 0.5) * 0.1, 0.02, (r() - 0.5) * 0.1); parts.push(tw);
  }
  if (r() < 0.55) { // mushrooms
    const cap = r() < 0.5 ? 0xd8c8a8 : 0xb06a3a, bx = (r() - 0.5) * 0.24, bz = (r() - 0.5) * 0.24;
    for (let k = 0, n = 2 + Math.floor(r() * 3); k < n; k++) {
      const h = 0.025 + r() * 0.03, x = bx + (r() - 0.5) * 0.06, z = bz + (r() - 0.5) * 0.06;
      parts.push(at(prep(new THREE.CylinderGeometry(0.004, 0.005, h, 4), 0xeee4cc), x, h / 2, z));
      const c = prep(new THREE.SphereGeometry(0.012 + r() * 0.008, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), cap);
      c.scale(1, 0.6, 1); parts.push(at(c, x, h, z));
    }
  }
  if (r() < 0.5) { // a cushion of moss
    const m = prep(new THREE.SphereGeometry(0.05 + r() * 0.03, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0x5f7a32);
    m.scale(1.3, 0.35, 1); parts.push(at(m, (r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25));
  }
  return merge(parts);
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
