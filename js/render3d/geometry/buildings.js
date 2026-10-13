// Farm buildings, visitor facilities, jetty and boat models.
import * as THREE from 'three';
import { at, bakeAO, merge, prep, soft } from './primitives.js';

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

// Where the dive boat lies alongside the cay's jetty, from the jetty structure's centre (tiles).
export const JETTY_BOAT = { x: 0.82, z: 4.45 };

// The dive boat that brings the snorkelers out: a white monohull about the length of two and a
// half tiles, built around its waterline (y = 0), bow toward +z. A deep-V hull with a flared bow
// and a sheer that rises toward it, a navy boot stripe and dark antifouling below the waterline,
// a wheelhouse with a raked, tinted windscreen, a blue bimini over the open dive deck at the back
// with racks of yellow tanks either side, twin outboards on the transom above a swim platform and
// ladder, a bow rail, and white fenders hung over the side toward the jetty.
export function diveBoat(bollardY = 0.45) { // (bollardY: how far the jetty's bollards stand above the sea)
  const parts = [], L = 2.3, B = 0.64, z0 = -L / 2, z1 = L / 2;
  const S = 22, C = 14; // stations along the hull, points around each half section
  // at a station t (0 stern .. 1 bow): half beam, sheer height, keel depth
  const beam = t => (B / 2) * (t < 0.55 ? 0.9 + 0.1 * Math.sin(t / 0.55 * Math.PI / 2) : Math.pow(Math.max(0, 1 - Math.pow((t - 0.55) / 0.45, 2.2)), 0.62));
  const sheer = t => 0.17 + 0.1 * Math.pow(t, 2.2);
  const keel = t => -0.13 * (t < 0.7 ? 0.62 + 0.38 * Math.sin(Math.min(1, t / 0.55) * Math.PI / 2) : Math.max(0, 1 - Math.pow((t - 0.7) / 0.3, 1.6))); // (the forefoot sweeps up into the stem)
  // a section from the keel up to the sheer: the V bottom flattens out at a chine, then the
  // topsides rise with a little flare (u: 0 keel .. 1 sheer)
  const sect = (t, u) => {
    const b = beam(t), sh = sheer(t), k = keel(t);
    if (u < 0.5) { const v = u / 0.5; return [b * 0.86 * v, k + (k * -0.72) * Math.pow(v, 1.35)]; } // bottom: keel to chine
    const v = (u - 0.5) / 0.5, chineY = k * 0.28;
    return [b * (0.86 + 0.14 * Math.sin(v * Math.PI / 2)), chineY + (sh - chineY) * v];
  };
  const pos = [], col = [];
  const paint = y => (y > 0.035 ? [0.95, 0.95, 0.93] : y > -0.005 ? [0.12, 0.2, 0.38] : [0.42, 0.13, 0.12]); // white, boot stripe, antifouling
  const tri = (a, b, c, ca, cb, cc) => { pos.push(...a, ...b, ...c); col.push(...ca, ...cb, ...cc); };
  const quad = (a, b, c, d, f) => { tri(a, b, c, f(a[1]), f(b[1]), f(c[1])); tri(a, c, d, f(a[1]), f(c[1]), f(d[1])); };
  const P = (t, u, side) => { const [x, y] = sect(t, u); return [side * x, y, z0 + t * L]; };
  for (let i = 0; i < S; i++) for (let j = 0; j < C; j++) for (const side of [1, -1]) {
    const t0 = i / S, t1 = (i + 1) / S, u0 = j / C, u1 = (j + 1) / C;
    const a = P(t0, u0, side), b = P(t1, u0, side), c = P(t1, u1, side), d = P(t0, u1, side);
    // the sheer stripe: a navy line just under the gunwale
    const f = y => (y > sheer((t0 + t1) / 2) - 0.045 && y < sheer((t0 + t1) / 2) - 0.022 ? [0.16, 0.3, 0.55] : paint(y));
    side > 0 ? quad(a, d, c, b, f) : quad(a, b, c, d, f); // (wound so the faces point outward)
  }
  // the transom: the flat stern, filled in from the keel up
  for (let j = 0; j < C; j++) for (const side of [1, -1]) {
    const a = P(0, j / C, side), b = P(0, (j + 1) / C, side), c = [0, (sheer(0) + keel(0)) / 2, z0];
    side > 0 ? tri(a, c, b, paint(a[1]), paint(c[1]), paint(b[1])) : tri(a, b, c, paint(a[1]), paint(b[1]), paint(c[1]));
  }
  // the deck, a little below the gunwale: pale grey non-skid
  const deckY = t => sheer(t) - 0.035;
  for (let i = 0; i < S; i++) {
    const t0 = i / S, t1 = (i + 1) / S, w0 = beam(t0) * 0.92, w1 = beam(t1) * 0.92, za = z0 + t0 * L, zb = z0 + t1 * L, g = [0.8, 0.8, 0.78];
    tri([-w0, deckY(t0), za], [-w1, deckY(t1), zb], [w1, deckY(t1), zb], g, g, g);
    tri([-w0, deckY(t0), za], [w1, deckY(t1), zb], [w0, deckY(t0), za], g, g, g);
  }
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    parts.push(g);
  }
  const dy = z => deckY((z - z0) / L);
  // gunwale cap: a thin teak rail along the top of each side
  for (let i = 0; i < S; i++) for (const side of [1, -1]) {
    const t0 = i / S, t1 = (i + 1) / S, a = [side * beam(t0), sheer(t0), z0 + t0 * L], b = [side * beam(t1), sheer(t1), z0 + t1 * L];
    const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const r = prep(new THREE.BoxGeometry(0.035, 0.018, len + 0.01), 0x8a6a48);
    r.rotateY(Math.atan2(dx, dz)); at(r, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.006, (a[2] + b[2]) / 2); parts.push(r);
  }
  // the wheelhouse: raked windscreen at the front, tinted windows all round, a white roof
  {
    const zA = -0.12, zB = 0.42, H = 0.27, Wd = 0.44, y0 = dy(0.15);
    const sideShape = sh => { sh.moveTo(zA, 0); sh.lineTo(zB, 0); sh.lineTo(zB - 0.1, H); sh.lineTo(zA, H); sh.lineTo(zA, 0); };
    const body = new THREE.Shape(); sideShape(body);
    const cab = prep(new THREE.ExtrudeGeometry(body, { depth: Wd, bevelEnabled: false }), 0xf4f4f0);
    cab.rotateY(-Math.PI / 2); at(cab, Wd / 2, y0, 0); parts.push(cab);
    const win = new THREE.Shape(); win.moveTo(zA + 0.04, H * 0.5); win.lineTo(zB - 0.05, H * 0.5); win.lineTo(zB - 0.1 + 0.012, H - 0.03); win.lineTo(zA + 0.04, H - 0.03); win.lineTo(zA + 0.04, H * 0.5);
    const glass = prep(new THREE.ExtrudeGeometry(win, { depth: Wd + 0.012, bevelEnabled: false }), 0x1e2c38);
    glass.rotateY(-Math.PI / 2); at(glass, (Wd + 0.012) / 2, y0, 0); parts.push(glass);
    // the windscreen itself, across the raked front
    const ws = prep(new THREE.BoxGeometry(Wd - 0.06, 0.13, 0.01), 0x26384a); ws.rotateX(-Math.atan2(0.1, H)); at(ws, 0, y0 + H * 0.74, zB - 0.075); parts.push(ws);
    parts.push(box(Wd + 0.08, 0.025, zB - zA + 0.02, 0xf8f8f4, 0, y0 + H, (zA + zB) / 2 - 0.04)); // roof, overhanging
    parts.push(box(0.03, 0.16, 0.03, 0xd8d8d8, 0, y0 + H + 0.025, 0.05)); // mast
    parts.push(box(0.14, 0.015, 0.015, 0xd8d8d8, 0, y0 + H + 0.15, 0.05)); // and its spreader
    const dome = prep(new THREE.SphereGeometry(0.04, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xf4f4f0); at(dome, 0.12, y0 + H + 0.025, -0.02); parts.push(dome); // radar
    parts.push(box(0.02, 0.025, 0.02, 0xd84a2a, -0.13, y0 + H + 0.025, 0.12)); // a port running light on the roof
  }
  // the open dive deck at the back: benches along each side with yellow tanks racked upright on
  // them, and a blue bimini on stainless poles over it all
  {
    const za = -1.0, zb = -0.2, yd = dy(-0.6);
    for (const side of [1, -1]) {
      const x = side * (B / 2 - 0.09);
      parts.push(box(0.1, 0.06, zb - za, 0x9aa0a6, x, yd, (za + zb) / 2)); // bench
      for (let k = 0; k < 6; k++) {
        const tank = prep(new THREE.CylinderGeometry(0.024, 0.024, 0.13, 8), 0xe8c020); at(tank, x + side * 0.015, yd + 0.06 + 0.065, za + 0.07 + k * 0.13); parts.push(tank);
        const valve = prep(new THREE.CylinderGeometry(0.008, 0.008, 0.025, 6), 0x3a3a3c); at(valve, x + side * 0.015, yd + 0.06 + 0.14, za + 0.07 + k * 0.13); parts.push(valve);
      }
    }
    const bimY = yd + 0.36, poles = [[-1, za + 0.05], [1, za + 0.05], [-1, zb - 0.02], [1, zb - 0.02]];
    for (const [side, z] of poles) parts.push(box(0.018, bimY - yd, 0.018, 0xd8dcdc, side * (B / 2 - 0.05), yd, z));
    const top = prep(new THREE.BoxGeometry(B - 0.02, 0.022, zb - za + 0.12), 0x1f5fa8); at(top, 0, bimY + 0.01, (za + zb) / 2); parts.push(top);
    for (const side of [1, -1]) { const v = prep(new THREE.BoxGeometry(0.012, 0.05, zb - za + 0.12), 0x1a5098); at(v, side * (B / 2 - 0.01), bimY - 0.012, (za + zb) / 2); parts.push(v); } // its valance
  }
  // the stern: a swim platform, a ladder down into the water, and twin outboards
  parts.push(box(B * 0.84, 0.03, 0.14, 0xb8b4aa, 0, 0.03, z0 - 0.065));
  for (const x of [-0.07, 0.07]) parts.push(box(0.012, 0.3, 0.012, 0xd8dcdc, x, -0.2, z0 - 0.13));
  for (let k = 0; k < 3; k++) parts.push(box(0.15, 0.01, 0.025, 0xd8dcdc, 0, -0.16 + k * 0.08, z0 - 0.13));
  for (const x of [-0.16, 0.16]) {
    const cowl = soft(new THREE.BoxGeometry(0.1, 0.14, 0.12, 2, 2, 2), { color: 0x3a3e44, transform: g => { g.translate(x, 0.24, z0 - 0.06); } });
    parts.push(cowl);
    parts.push(box(0.035, 0.24, 0.05, 0x2e3236, x, -0.06, z0 - 0.06)); // the leg down into the water
    parts.push(box(0.012, 0.045, 0.012, 0xe8e8e4, x, 0.31, z0 - 0.03)); // (a white stripe on the cowl)
  }
  // a bow rail on stanchions round the foredeck
  for (let k = 0; k <= 7; k++) for (const side of [1, -1]) {
    const t = 0.6 + k * 0.05, x = side * beam(t) * 0.9, z = z0 + t * L, y = deckY(t);
    if (k < 7 || side > 0) parts.push(box(0.012, 0.11, 0.012, 0xd8dcdc, x, y, z));
    if (k < 7) {
      const t2 = t + 0.05, x2 = side * beam(t2) * 0.9, z2 = z0 + t2 * L, y2 = deckY(t2);
      const r = prep(new THREE.BoxGeometry(0.01, 0.01, Math.hypot(x2 - x, z2 - z) + 0.01), 0xd8dcdc);
      r.rotateY(Math.atan2(x2 - x, z2 - z)); at(r, (x + x2) / 2, (y + y2) / 2 + 0.11, (z + z2) / 2); parts.push(r);
    }
  }
  // fenders over the jetty side (-x), and mooring lines from bow and stern cleats to the jetty's bollards
  for (const z of [-0.55, 0.05, 0.6]) {
    const f = prep(new THREE.CylinderGeometry(0.03, 0.03, 0.13, 8), 0xf2f2ee); at(f, -beam((z - z0) / L) - 0.028, 0.07, z); parts.push(f);
  }
  for (const [zb, zj] of [[z0 + 0.12, -1.05], [z1 - 0.3, 0.95]]) {
    const a = [-beam((zb - z0) / L) * 0.8, dy(zb) + 0.02, zb], b = [0.36 - JETTY_BOAT.x, bollardY, zj]; // (the jetty's bollards, in the boat's frame)
    const dx = b[0] - a[0], dyy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dyy, dz);
    const line = prep(new THREE.CylinderGeometry(0.006, 0.006, len, 4), 0xe8dcc0);
    line.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dyy, dz).normalize())));
    at(line, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); parts.push(line);
  }
  return merge(parts);
}

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
    case 'home': {
      // the builder's two-story plan, the same on every lot: beige siding, a two-car garage,
      // a gable roof in grey shingle, and a little brick-front stoop
      const H = 1.45, bw = w * 0.9, bd = d * 0.78, fz = bd / 2 + 0.01;
      parts.push(box(bw, H, bd, 0xd9ccb2));
      parts.push(at(gableRoof(bw, bd, 0.62, 0x54565a), 0, H, 0));
      parts.push(box(bw + 0.02, 0.05, bd + 0.02, 0xf2eee6, 0, H * 0.5, 0));                 // band between the floors
      parts.push(box(1.1, 0.62, 0.02, 0xf2f0ea, bw / 2 - 0.62, 0, fz));                      // garage door
      for (let k = 1; k < 4; k++) parts.push(box(1.1, 0.012, 0.025, 0xc8c4bc, bw / 2 - 0.62, k * 0.15, fz + 0.005));
      parts.push(box(0.42, 0.06, 0.3, 0x9a4a38, -0.25, 0, fz + 0.14));                       // brick stoop
      parts.push(box(0.2, 0.46, 0.02, 0x3a4a5a, -0.25, 0.04, fz));                           // front door
      for (const x of [-0.95, -0.25, 0.45]) parts.push(box(0.26, 0.28, 0.02, 0x4a5a6a, x, H * 0.62, fz)); // upstairs windows
      parts.push(box(0.3, 0.28, 0.02, 0x4a5a6a, -0.95, 0.18, fz));
      for (const x of [-1.1, -0.8]) parts.push(box(0.03, 0.3, 0.025, 0x3a3e44, x, 0.17, fz + 0.005)); // shutters
      break;
    }
    case 'clubhouse': {
      const H = 1.1;
      parts.push(box(w * 0.88, H, d * 0.7, 0xe8e2d4));
      parts.push(at(gableRoof(w * 0.88, d * 0.7, 0.55, 0x4a5058), 0, H, 0));
      const fz = d * 0.35 + 0.01;
      for (const x of [-1.2, -0.4, 0.4, 1.2]) parts.push(box(0.08, H * 0.9, 0.08, 0xf6f4ee, x, 0, fz + 0.3)); // porch columns
      parts.push(box(w * 0.8, 0.05, 0.36, 0xf6f4ee, 0, H * 0.9, fz + 0.18));
      parts.push(box(0.4, 0.6, 0.02, 0x3a4a5a, 0, 0, fz));
      for (const x of [-1.0, 1.0]) parts.push(box(0.4, 0.4, 0.02, 0x4a5a6a, x, 0.35, fz));
      break;
    }
    case 'pool': {
      parts.push(box(w * 0.95, 0.08, d * 0.9, 0xd8d4ca));                                    // concrete deck
      parts.push(box(w * 0.72, 0.03, d * 0.6, 0x4ab0d0, 0, 0.08, 0));                       // the water
      for (const [x, z] of [[-1.25, 0.8], [-0.7, 0.8], [0.9, -0.8]]) parts.push(box(0.4, 0.05, 0.16, 0xf0f0ea, x, 0.1, z)); // loungers
      parts.push(box(0.03, 0.4, 0.03, 0x8a8a8a, 1.3, 0.08, 0.8));                            // umbrella pole
      parts.push(at(prep(new THREE.ConeGeometry(0.35, 0.14, 8), 0x2a6a9a), 1.3, 0.55, 0.8));
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
    case 'jetty': {
      // the cay's boat landing: a plank jetty on posts running out over the lagoon, and the dive
      // boat that brings the snorkelers tied up alongside
      // (it runs on out past the beach to water deep enough for the boat)
      const N = 29, len = N * 0.22;
      for (let k = 0; k < N; k++) parts.push(box(0.9, 0.04, 0.2, k % 2 ? 0x9a8460 : 0x8a7454, 0, 0.1, -0.6 + k * 0.22));
      for (const x of [-0.42, 0.42]) parts.push(box(0.05, 0.06, len, 0x6a5a44, x, 0.04, -0.7 + len / 2)); // stringers under the planks
      for (let k = 0; k < 8; k++) for (const x of [-0.42, 0.42]) parts.push(box(0.08, 2.4, 0.08, 0x5e4f3c, x, -2.3, -0.5 + k * 0.85));
      parts.push(box(0.04, 0.04, len - 1.9, 0x7a6a50, -0.45, 0.32, -0.7 + (len - 1.9) / 2)); // handrail on the far side all the way;
      parts.push(box(0.04, 0.04, 2.6, 0x7a6a50, 0.45, 0.32, 0.6)); // the near side stays open where the boat ties up
      for (let k = 0; k < 9; k++) parts.push(box(0.04, 0.2, 0.04, 0x7a6a50, -0.45, 0.14, -0.6 + k * 0.6));
      for (let k = 0; k < 4; k++) parts.push(box(0.04, 0.2, 0.04, 0x7a6a50, 0.45, 0.14, -0.6 + k * 0.6));
      // (the dive boat tied up alongside is its own model, floating on the sea: see diveBoat)
      // a bollard at each end of the boat's berth, for its mooring lines
      for (const z of [JETTY_BOAT.z - 1.05, JETTY_BOAT.z + 0.95]) parts.push(box(0.08, 0.1, 0.08, 0x3a3a3c, 0.36, 0.14, z));
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
  return bakeAO(merge(parts), 'base');
}
