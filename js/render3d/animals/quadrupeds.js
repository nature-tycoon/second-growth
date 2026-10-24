// Quadruped proportions and specialist big-mammal model builders.
import { P, SPH, SPH_XL, cells, cloudCoat, col, ellHi, felineSpots, flat, grad, hash3, jaguarCoat, locks, onProfile, pixelCoat, place, sculpt, shade, smooth, solid, tmp, tube } from './model-core.js';

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
        m.limb([hp[0] + H * 0.46, hp[1] - H * 0.3, side * H * 0.11], [hp[0] + H * 0.5, hp[1] - H * 0.18, side * H * 0.16], H * 0.026, H * 0.007, '#ece4d0', { ...hd, caps: false, hard: true }); // tusks
      }
      // bristles carry on over the crown and nape
      for (let k = 0; k < 4; k++) m.limb([hp[0] - hr[0] * (0.2 + k * 0.35), hp[1] + hr[1] * 0.7, 0], [hp[0] - hr[0] * (0.45 + k * 0.35), hp[1] + hr[1] * 0.7 + H * 0.16, 0], H * 0.06, H * 0.012, dk, { ...hd, caps: false, seg: 5 });
    },
    tail: (m, b) => { const base = [-L * 0.45, b.by + H * 0.2, 0]; m.limb(base, [-L * 0.52, b.by - H * 0.3, 0], H * 0.035, H * 0.025, s.color, { part: P.TAIL, pivot: base }); m.ell([-L * 0.525, b.by - H * 0.4, 0], [H * 0.05, H * 0.12, H * 0.05], dk, { part: P.TAIL, pivot: base, lo: true }); },
  };
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
    m.ell(HX(28.55, 21.95, side * 2.35), R(0.5, 0.33, 0.3), '#e0a632', { ...hd, lo: true, gloss: 2, rot: [0, side * -0.5, 0.15] }); // amber eye
    m.ell(HX(28.8, 21.95, side * 2.36), R(0.18, 0.22, 0.16), '#120c08', { ...hd, lo: true, gloss: 2 });   // pupil
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
    m.ell(HX(24.4, 34.5, side * 5.15), R(0.5, 0.42, 0.32), '#1a120c', { ...hd, lo: true, gloss: 2 });
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
      tube(m, [HX(23.4, 31.6, side * 2.7), X(28.0 + dx, 25.0, side * 3.9), X(31.6 + dx, 22.0, side * 4.4), X(36.0 + dx, 22.6, side * 4.0)], [1.15, 1.05, 0.8, 0.36].map(r => r * k), ivory, { ...hd, seg: 10, sub: 5, capRings: 2, hard: true });
    } else m.ell(HX(26.7, 27.6, side * 2.6), R(0.6, 0.42, 0.42), ivory, { ...hd, lo: true, hard: true });
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
  tube(m, [X(23.0, 14.0), X(23.7, 16.4), X(23.5, 18.3), X(22.7, 19.7)], [1.9, 1.25, 0.65, 0.18].map(r => r * k), u => tmp.copy(horn).lerp(col('#4a3e34'), smooth(0.4, -0.8, u.x) * 0.6), { ...hd, seg: 10, sub: 4, capRings: 2, hard: true });
  m.ell(X(20.0, 16.9), [1.4 * k, 0.95 * k, 1.1 * k], horn, { ...hd, rot: [0, 0, -0.3], hard: true });
  // small eyes in wrinkles
  for (const side of [1, -1]) {
    m.ell(X(19.8, 14.3, side * 2.75), [0.8 * k, 0.6 * k, 0.4 * k], shade(s.color, -0.4), { ...hd, lo: true });
    m.ell(X(19.95, 14.3, side * 2.92), [0.4 * k, 0.36 * k, 0.3 * k], '#120c08', { ...hd, lo: true, gloss: 2 });
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

// Compact facial and foot shapes for the river mammals. Every detail shares the
// existing head or leg pivot, so it remains attached during movement and swimming.
function riverMammalFace(m, s, hp, hr, H, hd, raccoon = false) {
  const tip = raccoon ? [hp[0] + H * 0.475, hp[1] - H * 0.06, 0]
    : [hp[0] + hr[0] * 0.78 + H * 0.245, hp[1] - hr[1] * 0.26, 0];
  if (raccoon) {
    // One tapered snout: separate pale jaw/cheek blobs made a protruding lip.
    tube(m, [[hp[0] + H * 0.1, hp[1] - H * 0.015, 0], [hp[0] + H * 0.3, hp[1] - H * 0.045, 0], [hp[0] + H * 0.44, hp[1] - H * 0.06, 0]],
      [[H * 0.21, H * 0.2], [H * 0.13, H * 0.11], [H * 0.055, H * 0.05]], u => col(u.y > 0.25 ? shade(s.belly, -0.08) : s.belly), { ...hd, sub: 8, seg: 16 });
    m.ell(tip, [H * 0.045, H * 0.04, H * 0.053], '#241b17', hd);
  } else {
    m.ell(tip, [H * 0.043, H * 0.028, H * 0.062], '#241b17', hd);
    m.ell([tip[0] - H * 0.07, tip[1] - H * 0.065, 0], [H * 0.13, H * 0.026, H * 0.11], s.belly, hd);
  }
  for (const side of [-1, 1]) {
    if (raccoon) tube(m, [[hp[0] + H * 0.3, hp[1] - H * 0.12, side * H * 0.105], [hp[0] + H * 0.42, hp[1] - H * 0.1, side * H * 0.055]], [H * 0.0025, H * 0.001], '#4b4237', { ...hd, sub: 3, seg: 4 });
    else m.ell([tip[0] - H * 0.065, tip[1] - H * 0.018, side * H * 0.068], [H * 0.075, H * 0.035, H * 0.055], s.belly, hd);
    for (let i = 0; i < 3; i++) {
      const root = [tip[0] - H * (0.08 + i * 0.025), tip[1] - H * 0.015, side * H * (raccoon ? 0.075 + i * 0.015 : 0.11)];
      tube(m, [root, [root[0] - H * 0.06, root[1] + H * (0.025 - i * 0.02), side * H * 0.23], [root[0] - H * 0.15, root[1] + H * (0.05 - i * 0.045), side * H * 0.36]], [H * 0.0035, H * 0.0025, H * 0.0008], '#c7bca7', { ...hd, sub: 2, seg: 4 });
    }
    const ear = [hp[0] - hr[0] * 0.38, hp[1] + hr[1] * 0.88, side * hr[2] * 0.7];
    m.ell(ear, [H * 0.07, H * (raccoon ? 0.115 : 0.065), H * 0.045], s.color, hd);
    m.ell([ear[0] + H * 0.045, ear[1], ear[2]], [H * 0.026, H * (raccoon ? 0.075 : 0.04), H * 0.029], raccoon ? s.belly : shade(s.color, -0.22), { ...hd, fine: false });
  }
}

function riverMammalFoot(m, foot, r, o, color, webbed = false) {
  m.ell([foot[0] + r * 0.55, r * 0.62, foot[2]], [r * 1.4, r * 0.62, r * 1.25], color, o);
  for (let toe = -2; toe <= 2; toe++) {
    const reach = 1.4 - Math.abs(toe) * 0.15;
    m.ell([foot[0] + r * reach, r * 0.37, foot[2] + toe * r * 0.43], [r * (webbed ? 0.72 : 0.67), r * 0.37, r * 0.24], color, { ...o, lo: true });
    if (!webbed) m.ell([foot[0] + r * (reach + 0.51), r * 0.31, foot[2] + toe * r * 0.43], [r * 0.2, r * 0.12, r * 0.1], '#b3a18a', { ...o, lo: true });
  }
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
    // Jaguars carry their bulk in the chest and thighs, with tapered wrists and compact paws,
    // but stay compact: a tucked belly, a body no deeper than the legs are long, a broad (not huge) head.
    // Lionesses keep lion proportions and a tail tuft without inheriting a jaguar's stocky build.
    const lion = !!(s.lion || s.mane), k = s.stocky && !lion ? 1 : 0;
    const L = s.len, H = s.h * (1 + k * 0.02), leg = s.leg * (lion ? 0.95 : k ? 0.92 : 0.85), by = leg + H * 0.5;
    const hs = lion ? (s.mane ? 1.1 : 1) : 1 + k * 0.08;
    // (The Sumatran tiger, stripes, has a builder of its own: see tiger.)
    // Sunda clouded leopard (clouds): long and low, dark-rimmed cloud blotches, a huge thick ringed tail.
    // Leopard cat (spotted): small, tawny with solid black spots and dark lines over the head.
    const dk = col(s.dark), base = grad(s.color, s.belly || s.color, -0.3, 0.5);
    const coat = s.clouds ? b => cloudCoat(b, s.dark, H * 0.42) : k ? () => jaguarCoat(s, H, by) : null;
    const legColor = s.clouds ? (u, p) => { const [gap, id] = cells(p, H * 0.16); return gap > 0.36 && id > 0.25 ? dk : col(shade(s.color, -0.05)); }
      : s.spotted ? (u, p) => (hash3(Math.round(p.x * 1.4), Math.round(p.y * 1.4), Math.round(p.z * 1.4)) > 0.78 ? dk : col(shade(s.color, 0.05)))
      : k ? felineSpots(s, H) : null;
    const ring = (w, f) => (u, p) => (Math.sin(p.x * 2 * Math.PI / (H * w)) > 0.35 ? tmp.copy(col(s.color)).lerp(dk, f) : col(s.color));
    return {
      H, leg, wide: lion && !s.mane ? 0.94 : k ? 0.9 : 1, chest: 1 - k * 0.03,
      shoulder: lion ? 0.09 : k ? 0.07 : 0.04, haunch: lion ? 0.94 : k ? 0.9 : 1, sag: lion ? 0.01 : k ? -0.02 : 0.04,
      legR0: H * (lion ? (s.mane ? 0.19 : 0.18) : k ? 0.205 : s.cheetah ? 0.16 : 0.22),
      legR1: H * (lion ? 0.085 : k ? 0.09 : s.cheetah ? 0.09 : 0.14),
      neckR: H * (lion ? 0.25 : 0.3 - k * 0.02), spots: s.bobtail ? shade(s.color, -0.45) : null, dots: s.cheetah ? [s.dark, 9, 0.2] : s.spotted ? [s.dark, 11, 0.21] : null, rosettes: s.rosettes,
      coat, legColor, fine: s.clouds ? 2 : lion, detail: !!(lion || k), legRings: legColor ? 8 : undefined,
      paws: true, toes: true, smoothLegs: true, // soft, articulated paws
      head: [L * 0.5, by + H * (lion ? 0.3 : 0.38 - k * 0.1)], headR: [H * (lion ? 0.34 : 0.36) * hs, H * (lion ? 0.31 : 0.33) * hs, H * (lion ? 0.32 : 0.34) * hs], snout: H * 0.15 * hs,
      nose: lion || k ? false : undefined, eyeR: lion ? H * 0.038 : undefined,
      ears: lion ? 'none' : s.bobtail ? 'point' : 'round', ear: H * (s.bobtail ? 0.2 : k ? 0.18 : s.rosettes || s.cheetah ? 0.27 : s.clouds ? 0.22 : 0.24), earOut: 0.2, earBack: 0.1, earW: s.bobtail ? 0.55 : 0.45, tufts: s.bobtail, muzzle: grad(s.color, s.belly, 0.1, 0.4),
      earColor: null,
      headPaint: s.clouds ? (u, p) => { const [gap, id] = cells(p, H * 0.1); return gap > 0.4 && id > 0.3 && u.y > -0.3 ? dk : base(u); } : k ? felineSpots(s, H, undefined, H * 0.09)
        : s.rosettes || s.cheetah || s.spotted ? felineSpots(s, H, base, H * 0.07) : null, // (small solid spots on the head)
      extra: (m, b) => {
        // Rounded scapulae and haunches meet the upper limbs inside the coat.
        for (const side of [-1, 1]) {
          m.ell([L * 0.24, b.by - H * 0.1, side * H * (lion || k ? 0.18 : 0.23)], [H * 0.25, H * 0.36, H * 0.19], b.coat, { fine: !!(lion || k) });
          m.ell([-L * 0.25, b.by - H * 0.13, side * H * (lion || k ? 0.19 : 0.23)], [H * 0.31, H * 0.35, H * 0.2], b.coat, { fine: !!(lion || k) });
        }
      },
      face: (m, hp, hr, hd) => {
        if (k) m.ell([hp[0] + hr[0] * 0.78 + H * 0.15 * hs * 1.18, hp[1] - hr[1] * 0.17, 0], [H * 0.045, H * 0.035, H * 0.075], '#34251d', hd);
        if (lion || k) for (const side of [-1, 1]) {
          // Set the eye into a narrow lid, with a little light on the lower rim.
          m.ell([hp[0] + hr[0] * 0.4, hp[1] + hr[1] * 0.17, side * hr[2] * 0.8], [H * 0.095, H * 0.023, H * 0.035], s.belly, hd);
          for (let row = 0; row < 3; row++) {
            const x = hp[0] + hr[0] * (0.83 + row * 0.12), y = hp[1] - hr[1] * (0.34 + row % 2 * 0.12), z = side * hr[2] * 0.5;
            m.ell([x, y, z], [H * 0.017, H * 0.013, H * 0.015], '#443428', { ...hd, fine: false, lo: true });
            tube(m, [[x, y, z], [x - H * 0.035, y + H * 0.01, z + side * H * 0.08], [x - H * (0.12 + row * 0.025), y + H * (0.025 - row * 0.025), z + side * H * (0.19 + row * 0.025)]], [H * 0.004, H * 0.003, H * 0.001], '#d5c7aa', { ...hd, sub: 2, seg: 4 });
          }
        }
        if (lion) {
          // A low brow and a broad, flat nose on a short, deep muzzle.
          for (const side of [-1, 1]) {
            m.ell([hp[0] + hr[0] * 0.37, hp[1] + hr[1] * 0.5, side * hr[2] * 0.74], [H * 0.12, H * 0.022, H * 0.07], s.color, { ...hd, rot: [0, 0, -0.16] });
            m.ell([hp[0] - hr[0] * 0.3, hp[1] + hr[1] * 0.86, side * hr[2] * 0.83], [H * 0.065, H * 0.09, H * 0.075], shade(s.mane || s.color, -0.25), hd);
            m.ell([hp[0] - hr[0] * 0.2, hp[1] + hr[1] * 0.87, side * hr[2] * 0.84], [H * 0.04, H * 0.065, H * 0.055], s.color, hd);
          }
          const noseX = hp[0] + hr[0] * 0.78 + H * 0.15 * hs * 1.18;
          m.ell([noseX, hp[1] - hr[1] * 0.17, 0], [H * 0.045, H * 0.04, H * 0.078], '#34251d', hd);
          m.limb([noseX, hp[1] - hr[1] * 0.28, 0], [noseX - H * 0.025, hp[1] - hr[1] * 0.49, 0], H * 0.013, H * 0.01, '#34251d', { ...hd, caps: false });
        }
        if (lion || k) for (const side of [-1, 1]) tube(m, [[hp[0] + hr[0] * 0.72, hp[1] - hr[1] * 0.58, side * hr[2] * 0.37], [hp[0] + hr[0] * 1.1, hp[1] - hr[1] * 0.57, side * hr[2] * 0.34]], [H * 0.01, H * 0.007], '#443428', { ...hd, sub: 3, seg: 5 });
        for (const side of [-1, 1]) m.ell([hp[0] + hr[0] * 0.9, hp[1] - hr[1] * 0.3, side * hr[2] * 0.24], [hr[0] * 0.33, hr[1] * 0.24, hr[2] * 0.34], s.belly || s.color, hd);
        m.ell([hp[0] + hr[0] * 0.7, hp[1] - hr[1] * 0.65, 0], [hr[0] * 0.4, hr[1] * 0.14, hr[2] * 0.39], s.belly || s.color, hd);
        const markings = s.spotted ? (m, hp, hr, hd) => {
          // two dark lines running back over the crown from between the eyes, white streaks beside them
          for (const z of [-0.18, 0.18]) m.limb([hp[0] + hr[0] * 0.55, hp[1] + hr[1] * 0.62, z * hr[2]], [hp[0] - hr[0] * 0.75, hp[1] + hr[1] * 0.72, z * hr[2] * 1.6], hr[1] * 0.07, hr[1] * 0.07, s.dark, hd);
          for (const side of [1, -1]) m.limb([hp[0] + hr[0] * 0.75, hp[1] + hr[1] * 0.45, side * hr[2] * 0.42], [hp[0] + hr[0] * 0.2, hp[1] + hr[1] * 0.85, side * hr[2] * 0.42], hr[1] * 0.06, hr[1] * 0.05, s.belly, hd);
        } : s.mane ? (m, hp, hr, hd) => {
          // One swept ruff, with a scalloped fringe and a longer dark throat/chest.
          // Deform the surface rather than stacking spherical tufts around the face.
          const ruff = SPH_XL.clone(), positions = ruff.attributes.position;
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
    const L = s.len, H = L * 0.4, leg = L * 0.2, by = leg + H * 0.5;
    return {
      H, leg, detail: true, fine: true, smoothLegs: true, legSeg: 12, wide: 1.05, legR0: H * 0.18, legR1: H * 0.095, legColor: s.dark, neckR: H * 0.25, hip: 0.12, haunch: 1.08,
      coat: base => (u, p) => tmp.copy(base(u)).multiplyScalar(0.94 + hash3(Math.round(p.x / H * 24), Math.round(p.y / H * 22), Math.round(p.z / H * 22)) * 0.12),
      legMotion: 0.42, bobMotion: 0.025,
      foot: (m, foot, r, o) => riverMammalFoot(m, foot, r, o, s.dark),
      head: [L * 0.49, by + H * 0.23], headR: [H * 0.32, H * 0.27, H * 0.29], snout: H * 0.23, noMuzzle: true, nose: false,
      headPaint: u => Math.abs(u.z) > 0.45 && ((u.x - 0.38) / 0.65) ** 2 + ((u.y - 0.23) / 0.37) ** 2 < 1 ? col(s.dark) : col(u.y > 0.48 ? s.color : s.belly),
      ears: 'none', eyeR: H * 0.037, eyeOut: 0.89,
      face: (m, hp, hr, hd) => riverMammalFace(m, s, hp, hr, H, hd, true),
      tail: (m, b) => {
        const base = [-L * 0.4, b.by + H * 0.05, 0];
        tube(m, [base, [-L * 0.57, b.by - H * 0.12, 0], [-L * 0.76, b.by - H * 0.37, 0], [-L * 0.9, b.by - H * 0.4, 0]], [H * 0.17, H * 0.19, H * 0.14, H * 0.045], u => Math.sin((u.x + 1) * Math.PI * 2.5) > 0 ? col(s.dark) : col(s.belly), { part: P.TAIL, pivot: base, sub: 8, seg: 14 });
      },
    };
  },
  otter: s => {
    const L = s.len, H = L * 0.24, leg = L * 0.105, by = leg + H * 0.5;
    return {
      H, leg, detail: true, fine: true, smoothLegs: true, legSeg: 12, wide: 1.12, legR0: H * 0.18, legR1: H * 0.12, neckR: H * 0.27, sag: 0.015,
      legMotion: 0.4, bobMotion: 0.018,
      foot: (m, foot, r, o) => riverMammalFoot(m, foot, r, o, shade(s.color, -0.18), true),
      head: [L * 0.48, by + H * 0.12], headR: [H * 0.34, H * 0.27, H * 0.31], snout: H * 0.18, muzzle: shade(s.belly, 0.1), nose: false,
      ears: 'none', eyeR: H * 0.036, eyeOut: 0.87,
      // Giant otters retain their individual creamy throat patch.
      face: (m, hp, hr, hd) => {
        riverMammalFace(m, s, hp, hr, H, hd);
        if (s.throat) m.ell([hp[0] + hr[0] * 0.1, hp[1] - hr[1] * 0.75, 0], [hr[0] * 0.75, hr[1] * 0.32, hr[2] * 0.8], s.throat, hd);
      },
      tail: (m, b) => {
        const base = [-L * 0.4, b.by - H * 0.06, 0];
        tube(m, [base, [-L * 0.57, b.by - H * 0.12, 0], [-L * 0.77, b.by - H * 0.24, 0], [-L * 0.97, b.by - H * 0.23, 0]], [[H * 0.22, H * 0.28], [H * 0.13, H * 0.2], [H * 0.07, H * 0.12], [H * 0.018, H * 0.025]], s.color, { part: P.TAIL, pivot: base, sub: 8, seg: 14 });
      },
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
    // (bands round the body, bending into chevrons over the rump; pale belly below: coatZebra)
    const stripes = () => pixelCoat('zebra', () => light, [-0.7], dark, belly);
    const legC = u => (Math.sin(u.y * 9) > 0.2 ? dark : light);
    return {
      H, leg, detail: true, fine: 2, smoothLegs: true, legSeg: 14, legR0: H * 0.14, legR1: H * 0.065, shoulder: 0.08, chest: 0.97,
      legMotion: 0.36, bobMotion: 0.022,
      neckPath: [[L * 0.28, by + H * 0.15, 0], [L * 0.4, by + H * 0.48, 0], [L * 0.52, by + H * 0.67, 0]], neckRadii: [[H * 0.28, H * 0.21], [H * 0.23, H * 0.17], [H * 0.17, H * 0.13]], neckSub: 8,
      foot: (m, foot, r, o) => m.ell([foot[0] + r * 0.25, r * 0.68, foot[2]], [r * 1.15, r * 0.68, r * 1.0], '#141414', o),
      coat: stripes, legColor: legC, headColor: null,
      head: [L * 0.55, by + H * 0.72], headR: [H * 0.24, H * 0.2, H * 0.17], snout: H * 0.04, muzzle: light, nose: false,
      ears: 'none', eyeR: H * 0.035,
      face: (m, hp, hr, hd) => {
        tube(m, [[L * 0.25, by + H * 0.52, 0], [L * 0.34, by + H * 0.7, 0], [hp[0] - hr[0] * 0.6, hp[1] + hr[1] * 0.86, 0]], [[H * 0.06, H * 0.023], [H * 0.09, H * 0.03], [H * 0.04, H * 0.023]], u => Math.sin(u.x * 22) > 0 ? dark : light, { ...hd, sub: 10, seg: 8 });
        for (const side of [-1, 1]) {
          const ear = [hp[0] - H * 0.08, hp[1] + H * 0.26, side * H * 0.14];
          m.ell(ear, [H * 0.065, H * 0.17, H * 0.05], s.color, { ...hd, rot: [side * 0.28, 0, -0.1] });
          m.ell([ear[0] + H * 0.04, ear[1], ear[2]], [H * 0.02, H * 0.115, H * 0.035], s.dark, { ...hd, fine: false, rot: [side * 0.28, 0, -0.1] });
        }
        // a long horse face angled down, thin stripes across the bridge, ending in a soft dark muzzle
        const a = -0.62, c = Math.cos(a), sn = Math.sin(a), at = d => [hp[0] + c * d, hp[1] + sn * d, 0];
        m.ell(at(H * 0.24), [H * 0.3, H * 0.15, H * 0.13], u => (u.x < 0.55 && Math.sin(u.x * 13) > 0.35 ? dark : light), { ...hd, rot: [0, 0, a] });
        const nose = col('#3a2e2a'), soft = u => tmp.copy(light).lerp(nose, smooth(-0.6, 0.3, u.x)); // fading from white into the dark nose
        m.ell(at(H * 0.45), [H * 0.13, H * 0.125, H * 0.115], soft, { ...hd, rot: [0, 0, a] });
        const tip = at(H * 0.55);
        for (const side of [1, -1]) { // dark eyes set into the side of the head
          m.ell([hp[0] + hr[0] * 0.35, hp[1] + hr[1] * 0.15, side * hr[2] * 0.92], [H * 0.04, H * 0.04, H * 0.025], '#15110e', { ...hd, lo: true, gloss: 2 });
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
      H, leg, detail: true, fine: true, smoothLegs: true, legSeg: 14, splitHoof: true, hip: -0.16, shoulder: 0.24, chest: 1.14, haunch: 0.8, legR0: H * 0.145, legR1: H * 0.055, hoof: '#141414', neckR: H * 0.26,
      legMotion: 0.36, bobMotion: 0.022,
      legColor: u => tmp.copy(col(s.color)).lerp(dark, smooth(0.6, 0.1, u.y) * 0.6),
      coat: base => u => (u.x > -0.05 && u.y > -0.55 && Math.sin(u.x * 26 + u.y * 2) > 0.45 ? col(shade(s.color, -0.28)) : base(u)), // the brindled bands
      head: [L * 0.57, by + H * 0.22], headR: [H * 0.24, H * 0.24, H * 0.19], snout: H * 0.04, muzzle: s.dark, nose: false,
      ears: 'none', eyeR: H * 0.033,
      antlers: (m, hp, hr, hd) => {
        for (const side of [1, -1]) {
          const b0 = [hp[0] - hr[0] * 0.2, hp[1] + hr[1] * 0.75, side * hr[2] * 0.5], b1 = [b0[0] - H * 0.02, b0[1] - H * 0.03, side * H * 0.42];
          const b2 = [b1[0] + H * 0.03, b1[1] + H * 0.18, side * H * 0.44], b3 = [b2[0] - H * 0.03, b2[1] + H * 0.1, side * H * 0.32];
          tube(m, [b0, b1, b2, b3], [H * 0.065, H * 0.046, H * 0.028, H * 0.002], u => tmp.copy(col('#4a4640')).lerp(col('#2a2826'), (u.x + 1) * 0.5), { ...hd, sub: 8, seg: 12 });
        }
      },
      face: (m, hp, hr, hd) => {
        for (const side of [-1, 1]) {
          const ear = [hp[0] - H * 0.05, hp[1] + H * 0.1, side * H * 0.25];
          m.ell(ear, [H * 0.065, H * 0.145, H * 0.055], s.color, { ...hd, rot: [side * 1.05, 0, -0.12] });
          m.ell([ear[0] + H * 0.042, ear[1], ear[2]], [H * 0.022, H * 0.09, H * 0.04], s.dark, { ...hd, fine: false, rot: [side * 1.05, 0, -0.12] });
        }
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
        tube(m, [[hp[0] - H * 0.03, hp[1] - H * 0.18, 0], [hp[0] - H * 0.06, hp[1] - H * 0.42, 0], [hp[0] - H * 0.12, hp[1] - H * 0.66, 0]], [[H * 0.1, H * 0.08], [H * 0.09, H * 0.055], [H * 0.025, H * 0.02]], s.dark, { ...hd, sub: 7, seg: 10 });
        tube(m, [[L * 0.2, by + H * 0.61, 0], [L * 0.37, by + H * 0.62, 0], [hp[0] - H * 0.12, hp[1] + H * 0.19, 0]], [[H * 0.065, H * 0.026], [H * 0.075, H * 0.034], [H * 0.045, H * 0.023]], s.dark, { ...hd, sub: 9, seg: 8 });
      },
      tail: (m, b) => {
        const base = [-L * 0.46, b.by + H * 0.08, 0];
        m.limb(base, [-L * 0.52, b.by - H * 0.3, 0], H * 0.04, H * 0.035, s.color, { part: P.TAIL, pivot: base });
        m.limb([-L * 0.52, b.by - H * 0.3, 0], [-L * 0.53, b.by - H * 0.75, 0], H * 0.06, H * 0.03, s.dark, { part: P.TAIL, pivot: base }); // long black switch
      },
    };
  },
  // Alcelaphine antelopes: sloping back, long face and short recurved horns.
  antelope: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5, kongoni = !!s.hartebeest;
    return {
      H, leg, fine: true, splitHoof: true, wide: 0.8, hip: -0.08, shoulder: kongoni ? 0.23 : 0.14,
      chest: 1.05, neckR: H * 0.23, legR0: H * 0.13, legR1: H * 0.055,
      legColor: kongoni ? s.color : s.dark, hoof: '#211c18',
      coat: base => (u, p) => !kongoni && Math.abs(p.z) > H * 0.23 &&
        (Math.abs(p.x - L * 0.28) < L * 0.13 || Math.abs(p.x + L * 0.3) < L * 0.11) ? col(s.dark) : base(u),
      head: [L * 0.54, by + H * (kongoni ? 0.94 : 0.8)],
      headR: [H * (kongoni ? 0.36 : 0.29), H * 0.23, H * 0.17], snout: H * (kongoni ? 0.43 : 0.32),
      ears: 'point', ear: H * 0.34, earW: 0.35, earOut: 0.5, earBack: 0.15,
      headColor: kongoni ? s.color : s.dark,
      antlers: (m, hp, hr, hd) => {
        for (const side of [-1, 1]) {
          const pts = [[hp[0] - H * 0.13, hp[1] + hr[1] * 0.8, side * H * 0.1],
            [hp[0] - H * 0.2, hp[1] + H * 0.49, side * H * (kongoni ? 0.24 : 0.17)],
            [hp[0] - H * (kongoni ? 0.12 : 0.3), hp[1] + H * 0.68, side * H * 0.23],
            [hp[0] - H * (kongoni ? 0.36 : 0.39), hp[1] + H * (kongoni ? 0.76 : 0.69), side * H * 0.21]];
          tube(m, pts, [H * 0.055, H * 0.047, H * 0.03, H * 0.004],
            (u, p) => Math.sin(p.y / H * 70) > 0.2 ? col('#584b3d') : col('#30291f'), { ...hd, sub: 3, seg: 7 });
        }
      },
      tail: (m, b) => {
        const pivot = [-L * 0.44, b.by + H * 0.05, 0];
        m.limb(pivot, [-L * 0.52, b.by - H * 0.55, 0], H * 0.035, H * 0.025, s.color, { part: P.TAIL, pivot });
        m.ell([-L * 0.52, b.by - H * 0.58, 0], [H * 0.055, H * 0.12, H * 0.06], s.dark, { part: P.TAIL, pivot });
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
      H, leg, detail: true, fine: true, splitHoof: true, legR0: H * 0.12, legR1: H * 0.055, legColor: shade(s.color, -0.05), hoof: '#1a1612', neckR: H * (s.neckWidth ?? 0.19),
      coat: base => u => (u.y < -0.55 ? col(s.belly) : u.y < -0.2 ? col(shade(s.color, 0.2)) : base(u)),
      head: [L * 0.53, by + H * 0.85], headR: [H * 0.27, H * 0.2, H * 0.17], snout: H * 0.26,
      ears: 'none', nose: false, eyeR: H * 0.037,
      face: (m, hp, hr, hd) => {
        for (const side of [-1, 1]) {
          const ear = [hp[0] - H * 0.08, hp[1] + H * 0.27, side * H * 0.21], rot = [side * 0.64, 0, 0.12];
          m.ell(ear, [H * 0.075, H * 0.23, H * 0.065], u => u.y > 0.7 ? col(s.dark) : col(s.color), { ...hd, rot });
          m.ell([ear[0] + H * 0.055, ear[1], ear[2]], [H * 0.028, H * 0.17, H * 0.048], s.belly, { ...hd, rot });
          m.ell([hp[0] + hr[0] * 0.42, hp[1] + hr[1] * 0.19, side * hr[2] * 0.73], [H * 0.064, H * 0.042, H * 0.025], shade(s.color, 0.3), hd);
          tube(m, [[hp[0] + H * 0.16, hp[1] - H * 0.08, side * H * 0.115], [hp[0] + H * 0.35, hp[1] - H * 0.13, side * H * 0.08], [hp[0] + H * 0.49, hp[1] - H * 0.12, side * H * 0.065]], [H * 0.008, H * 0.009, H * 0.004], s.dark, { ...hd, sub: 3, seg: 5 });
        }
        m.ell([hp[0] + H * 0.29, hp[1] - H * 0.14, 0], [H * 0.19, H * 0.038, H * 0.09], s.belly, hd);
        m.ell([hp[0] + hr[0] * 0.78 + H * 0.26 * 1.18, hp[1] - hr[1] * 0.2, 0], [H * 0.038, H * 0.027, H * 0.055], s.dark, hd);
      },
      antlers: s.lyre ? (m, hp, hr, hd) => {
        for (const side of [1, -1]) {
          const pts = [[hp[0] - hr[0] * 0.2, hp[1] + hr[1] * 0.8, side * hr[2] * 0.55], [hp[0] - H * 0.25, hp[1] + H * 0.38, side * H * 0.28], [hp[0] - H * 0.3, hp[1] + H * 0.7, side * H * 0.32], [hp[0] - H * 0.18, hp[1] + H * 0.94, side * H * 0.22], [hp[0] - H * 0.03, hp[1] + H * 1.08, side * H * 0.16]];
          tube(m, pts, [H * 0.052, H * 0.047, H * 0.034, H * 0.018, H * 0.003], (u, p) => Math.sin((p.y - hp[1]) / H * 85) > 0.3 ? col('#40362c') : col('#25211c'), { ...hd, sub: 8, seg: 10 });
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
          m.limb([sn[0] + H * 0.2, sn[1] - H * 0.04, side * H * 0.12], [sn[0] + H * 0.24, sn[1] + H * 0.26, side * H * 0.3], H * 0.04, H * 0.012, '#ece4d0', { ...hd, caps: false, hard: true }); // tusks
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
  // Black rhino: a broad shoulder saddle, tapered pillar legs and a browsing lip.
  // The hairy Sumatran rhino keeps its separate builder.
  rhino: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    const hide = base => (u, p) => tmp.copy(base(u)).multiplyScalar(0.97 + Math.sin(p.x / H * 34 + Math.sin(p.y / H * 12)) * 0.025);
    return {
      H, leg, detail: true, fine: true, wide: 1.2, hip: 0.03, shoulder: 0.11, chest: 1.07, shoulderBulk: 0.13, haunch: 0.96,
      legR0: H * 0.22, legR1: H * 0.13, straight: true, smoothLegs: true, legSeg: 14, coat: hide, legMotion: 0.23, bobMotion: 0.018,
      neckPath: [[L * 0.25, by + H * 0.07, 0], [L * 0.39, by + H * 0.06, 0], [L * 0.5, by - H * 0.08, 0]], neckRadii: [H * 0.38, H * 0.32, H * 0.22],
      head: [L * 0.53, by - H * 0.12], headR: [H * 0.39, H * 0.26, H * 0.24], snout: H * 0.3, muzzle: shade(s.color, -0.04), nose: false, eyeR: H * 0.03, ears: 'none',
      foot: (m, foot, r, o) => {
        m.ell([foot[0] + r * 0.12, r * 0.73, foot[2]], [r * 1.18, r * 0.73, r * 1.12], s.color, o);
        for (const toe of [-1, 0, 1]) m.ell([foot[0] + r * (toe === 0 ? 1 : 0.68), r * 0.32, foot[2] + toe * r * 0.68], [r * 0.45, r * 0.32, r * 0.4], '#3d3933', o);
      },
      face: (m, hp, hr, hd, sn) => {
        tube(m, [[sn[0] + H * 0.18, sn[1] + H * 0.13, 0], [sn[0] + H * 0.22, sn[1] + H * 0.33, 0], [sn[0] + H * 0.31, sn[1] + H * 0.61, 0]], [H * 0.11, H * 0.071, H * 0.003], '#8a8478', { ...hd, sub: 8, seg: 14, hard: true });
        tube(m, [[sn[0] - H * 0.1, sn[1] + H * 0.21, 0], [sn[0] - H * 0.08, sn[1] + H * 0.34, 0], [sn[0] - H * 0.04, sn[1] + H * 0.46, 0]], [H * 0.08, H * 0.048, H * 0.002], '#8a8478', { ...hd, sub: 6, seg: 12, hard: true });
        m.ell([sn[0] + H * 0.3, sn[1] - H * 0.01, 0], [H * 0.105, H * 0.065, H * 0.09], s.color, { ...hd, rot: [0, 0, 0.3] });
        for (const side of [-1, 1]) {
          const ear = [hp[0] - hr[0] * 0.55, hp[1] + hr[1] * 0.88, side * hr[2] * 0.7];
          m.ell(ear, [H * 0.085, H * 0.16, H * 0.065], s.color, { ...hd, rot: [side * 0.4, 0, -0.18] });
          m.ell([ear[0] + H * 0.053, ear[1], ear[2]], [H * 0.028, H * 0.11, H * 0.046], shade(s.color, -0.24), { ...hd, fine: false, rot: [side * 0.4, 0, -0.18] });
          m.ell([sn[0] + H * 0.24, sn[1] + H * 0.07, side * H * 0.12], [H * 0.042, H * 0.019, H * 0.025], '#302d28', { ...hd, fine: false });
          tube(m, [[sn[0] + H * 0.03, sn[1] - H * 0.07, side * H * 0.13], [sn[0] + H * 0.24, sn[1] - H * 0.065, side * H * 0.09]], [H * 0.009, H * 0.004], shade(s.color, -0.3), { ...hd, sub: 3, seg: 5 });
        }
      },
      tail: (m, b) => {
        const base = [-L * 0.45, b.by + H * 0.14, 0];
        tube(m, [base, [-L * 0.52, b.by - H * 0.08, 0], [-L * 0.52, b.by - H * 0.29, 0]], [H * 0.04, H * 0.029, H * 0.014], s.color, { part: P.TAIL, pivot: base, sub: 6 });
        m.ell([-L * 0.52, b.by - H * 0.31, 0], [H * 0.028, H * 0.06, H * 0.028], s.dark, { part: P.TAIL, pivot: base, lo: true });
      },
    };
  },
  giraffe: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    // (patches warm to dark, between pale lanes, above the lower legs: coatGiraffe)
    const patch = () => pixelCoat('giraffe', () => col(s.belly), [leg, H], s.dark, s.color);
    const neck = [[L * 0.27, by + H * 0.17, 0], [L * 0.46, by + H * 0.88, 0], [L * 0.64, by + H * 1.9, 0], [L * 0.76, by + H * 2.66, 0]];
    return {
      H, leg, detail: true, fine: 2, smoothLegs: true, legSeg: 14, splitHoof: true, hip: -0.14, shoulder: 0.2, chest: 1.1, haunch: 0.88, legR0: H * 0.15, legR1: H * 0.066, hoof: '#2a211a',
      legMotion: 0.28, bobMotion: 0.018,
      legColor: patch(), coat: patch, // (the lower legs are pale)
      neckPath: neck, neckRadii: [[H * 0.35, H * 0.29], [H * 0.28, H * 0.22], [H * 0.205, H * 0.16], [H * 0.16, H * 0.13]], neckSeg: 20, neckSub: 9,
      head: [L * 0.8, by + H * 2.7], headR: [H * 0.29, H * 0.18, H * 0.17], snout: H * 0.24, muzzle: shade(s.belly, -0.08), nose: false, eyeR: H * 0.031, ears: 'none',
      antlers: (m, hp, hr, hd) => {
        for (const side of [-1, 1]) {
          const base = [hp[0] - hr[0] * 0.3, hp[1] + hr[1] * 0.8, side * hr[2] * 0.45];
          tube(m, [base, [base[0] - H * 0.025, base[1] + H * 0.12, base[2]], [base[0] - H * 0.04, base[1] + H * 0.23, base[2]]], [H * 0.045, H * 0.035, H * 0.03], s.color, { ...hd, sub: 4, seg: 10 });
          m.ell([base[0] - H * 0.04, base[1] + H * 0.24, base[2]], [H * 0.045, H * 0.043, H * 0.043], '#2a2018', { ...hd, fine: false });
        }
      },
      face: (m, hp, hr, hd, sn) => {
        // A thin mane follows the curved rear edge of the neck instead of a rod.
        tube(m, neck.map((p, i) => [p[0] - H * [0.26, 0.23, 0.18, 0.14][i], p[1] + H * 0.06, 0]), [[H * 0.06, H * 0.024], [H * 0.07, H * 0.025], [H * 0.055, H * 0.023], [H * 0.025, H * 0.018]], s.dark, { ...hd, sub: 9, seg: 8 });
        for (const side of [-1, 1]) {
          const ear = [hp[0] - H * 0.12, hp[1] + H * 0.15, side * H * 0.27];
          m.ell(ear, [H * 0.1, H * 0.19, H * 0.07], s.belly, { ...hd, rot: [side * 0.95, 0, -0.28] });
          m.ell([ear[0] + H * 0.062, ear[1], ear[2]], [H * 0.025, H * 0.13, H * 0.045], shade(s.color, -0.1), { ...hd, fine: false, rot: [side * 0.95, 0, -0.28] });
          m.ell([sn[0] + H * 0.235, sn[1] + H * 0.027, side * H * 0.07], [H * 0.034, H * 0.013, H * 0.021], '#443428', { ...hd, fine: false });
          tube(m, [[sn[0] + H * 0.04, sn[1] - H * 0.06, side * H * 0.09], [sn[0] + H * 0.25, sn[1] - H * 0.035, side * H * 0.055]], [H * 0.008, H * 0.004], '#443428', { ...hd, sub: 3, seg: 5 });
        }
      },
      tail: (m, b) => {
        const base = [-L * 0.46, b.by, 0];
        tube(m, [base, [-L * 0.51, b.by - H * 0.42, 0], [-L * 0.53, b.by - H * 0.9, 0]], [H * 0.035, H * 0.025, H * 0.018], s.color, { part: P.TAIL, pivot: base, sub: 6 });
        m.ell([-L * 0.53, b.by - H * 1.0, 0], [H * 0.05, H * 0.14, H * 0.045], '#1e1612', { part: P.TAIL, pivot: base });
      },
    };
  },
  // African elephant. The Asian elephant keeps its sculpted, separate builder.
  elephant: s => {
    const L = s.len, H = s.h, leg = s.leg, by = leg + H * 0.5;
    const hide = base => (u, p) => tmp.copy(base(u)).multiplyScalar(0.96 + 0.035 * Math.sin(p.x / H * 35 + Math.sin(p.y / H * 18)));
    return {
      H, leg, detail: true, fine: true, wide: 1.16, hip: 0.06, shoulder: 0.14, chest: 1.07, sag: 0.095,
      legR0: H * 0.22, legR1: H * 0.16, straight: true, smoothLegs: true, legSeg: 16, coat: hide, legMotion: 0.22, bobMotion: 0.015,
      neckPath: [[L * 0.29, by + H * 0.16, 0], [L * 0.4, by + H * 0.24, 0], [L * 0.5, by + H * 0.26, 0]], neckRadii: [H * 0.36, H * 0.33, H * 0.3],
      head: [L * 0.51, by + H * 0.25], headR: [H * 0.36, H * 0.4, H * 0.32], snout: H * 0.1, noMuzzle: true, nose: false, eyeR: H * 0.025, ears: 'none',
      foot: (m, foot, r, o) => {
        m.ell([foot[0] + r * 0.08, r * 0.85, foot[2]], [r * 1.08, r * 0.85, r * 1.08], s.color, o);
        for (const toe of [-1, 0, 1]) m.ell([foot[0] + r * (toe === 0 ? 1.0 : 0.8), r * 0.34, foot[2] + toe * r * 0.58], [r * 0.16, r * 0.19, r * 0.2], '#8b857b', o);
      },
      face: (m, hp, hr, hd) => {
        // The broad trunk root grows out of the forehead; the tip has two fingers.
        const t0 = [hp[0] + hr[0] * 0.69, hp[1] - hr[1] * 0.12, 0], t1 = [t0[0] + H * 0.16, t0[1] - H * 0.42, 0], t2 = [t1[0] + H * 0.015, t1[1] - H * 0.46, 0], t3 = [t2[0] + H * 0.08, t2[1] - H * 0.28, 0], tip = [t3[0] + H * 0.06, t3[1] + H * 0.065, 0];
        tube(m, [t0, t1, t2, t3, tip], [H * 0.19, H * 0.13, H * 0.085, H * 0.048, H * 0.035], hide(solid(s.color)), { ...hd, sub: 9, seg: 20 });
        for (const dy of [-1, 1]) m.ell([tip[0] + H * 0.025, tip[1] + dy * H * 0.026, 0], [H * 0.035, H * 0.015, H * 0.025], s.color, { ...hd, fine: false });
        for (const side of [-1, 1]) {
          tube(m, [[hp[0] + hr[0] * 0.48, hp[1] - hr[1] * 0.43, side * hr[2] * 0.48], [hp[0] + hr[0] * 0.99, hp[1] - hr[1] * 0.78, side * hr[2] * 0.65], [hp[0] + hr[0] * 1.4, hp[1] - hr[1] * 0.67, side * hr[2] * 0.73]], [H * 0.055, H * 0.036, H * 0.003], '#ece4d0', { ...hd, sub: 9, seg: 12, hard: true });
          // A cupped fan with a thin rim, rather than a perfectly flat plate.
          const ear = flat(sh => {
            sh.moveTo(0.4, 0.75); sh.quadraticCurveTo(-0.15, 1.15, -0.68, 0.85);
            sh.quadraticCurveTo(-1.0, 0.4, -0.8, -0.3); sh.quadraticCurveTo(-0.55, -1.07, -0.1, -1.0);
            sh.quadraticCurveTo(0.4, -0.75, 0.47, -0.2); sh.quadraticCurveTo(0.53, 0.32, 0.4, 0.75);
          }, 'xy', 16), ep = ear.attributes.position;
          for (let i = 0; i < ep.count; i++) {
            const x = ep.getX(i), y = ep.getY(i), z = ep.getZ(i);
            ep.setZ(i, z * 0.035 + 0.12 * (1 - y * y) * (0.5 - x));
          }
          ear.computeVertexNormals();
          m.add(ear, place([hp[0] - hr[0] * 0.5, hp[1] - H * 0.025, side * H * 0.36], [side * 0.15, side * -0.35, 0], [H * 0.48, H * 0.48, H * 0.48]), hide(solid(shade(s.color, 0.055))), hd); ear.dispose();
          tube(m, [[hp[0] - hr[0] * 0.5, hp[1] + H * 0.29, side * H * 0.3], [hp[0] - H * 0.27, hp[1] + H * 0.1, side * H * 0.43], [hp[0] - H * 0.31, hp[1] - H * 0.18, side * H * 0.44]], [H * 0.014, H * 0.01, H * 0.005], shade(s.color, -0.17), { ...hd, sub: 4, seg: 5 });
          m.ell([hp[0] + hr[0] * 0.35, hp[1] + hr[1] * 0.21, side * hr[2] * 0.83], [H * 0.068, H * 0.019, H * 0.023], shade(s.color, -0.1), { ...hd, fine: false });
        }
      },
      tail: (m, b) => {
        const base = [-L * 0.46, b.by + H * 0.2, 0];
        tube(m, [base, [-L * 0.5, b.by - H * 0.12, 0], [-L * 0.51, b.by - H * 0.5, 0]], [H * 0.035, H * 0.026, H * 0.016], s.color, { part: P.TAIL, pivot: base, sub: 6 });
        m.ell([-L * 0.51, b.by - H * 0.55, 0], [H * 0.035, H * 0.085, H * 0.03], s.dark, { part: P.TAIL, pivot: base });
      },
    };
  },
};

export { MAMMALS, sumatranElephant, sumatranRhino, tiger };
