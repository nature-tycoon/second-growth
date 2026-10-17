// Bats and insect models.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { weldVertices as mergeVertices } from '../geometry/weld.js';
import { P, SPH_HI, col, eyes, flat, grad, hash3, place, shade, smooth, tmp } from './model-core.js';

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

export { bat, bee, beetle, butterfly };
