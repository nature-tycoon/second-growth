// Primate, sloth and pangolin models.
import { canopyWalkerBends } from '../canopy-walker-profile.js';
import { P, SCALE, SPH_HI, col, eyes, grad, hash3, locks, loftBody, place, shade, smooth, tmp, tube } from './model-core.js';

// Sumatran orangutan, clambering over the top of the canopy: no branch of its own (it's drawn on
// an actual woody branch), with long forward arms, bent elbows and short tucked legs.
// Both hands and hand-like feet grip along the wood. Long, ragged rust-orange hair hangs in locks off the arms,
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
  // Long arms in a balanced climbing stance, with curled fingers gripping the wood.
  const arms = [[1, P.LEG_FL, U(0.07, 0.56, 0.13 * B), U(0.19, 0.31, 0.15), U(0.28, 0.13, 0.14), U(0.3, 0.06, 0.14)],
    [-1, P.LEG_FR, U(0.07, 0.56, -0.13 * B), U(0.19, 0.31, -0.15), U(0.28, 0.13, -0.14), U(0.3, 0.06, -0.14)]];
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
  // Short bent legs with both hand-like feet pointing along the branch.
  for (const [side, part, kn, an] of [[1, P.LEG_BL, U(-0.12, 0.16, 0.12), U(-0.18, 0.07, 0.12)], [-1, P.LEG_BR, U(-0.12, 0.16, -0.12), U(-0.18, 0.07, -0.12)]]) {
    const hip = U(-0.07, 0.27, side * 0.08 * B), o = { part, pivot: hip };
    tube(m, [hip, kn, an], [0.072 * B, 0.056 * B, 0.042].map(r => r * L), hair, { ...o, seg: 10, sub: 3 });
    const fwd = [1, 0, 0];
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

// Siamang (a gibbon), swinging below the real tree scaffold with alternating
// catches. Its resting pose grips with the right hand, freeing the left for fruit;
// both arms have a second climbing pose for the next handover. Legs tuck below. All shaggy black, with a small round head
// and the big bare grey throat sac blown up under the chin.
function siamang(m, s) {
  const L = s.len, bY = L * 1.38, black = col(s.color), sacC = col(s.sac);
  const fur = (u, p) => tmp.copy(black).multiplyScalar(1 + hash3(Math.round(p.x * 2), Math.round(p.y * 0.6), Math.round(p.z * 2)) * 0.9);
  const skin = col(shade(s.color, 0.08));
  // a slim body hanging straight down from the high arm
  tube(m, [[L * 0.0, L * 0.42, 0], [L * 0.01, L * 0.58, 0], [L * 0.03, L * 0.76, 0], [L * 0.05, L * 0.88, 0]],
    [[L * 0.085, L * 0.09], [L * 0.11, L * 0.115], [L * 0.105, L * 0.13], [L * 0.07, L * 0.11]], fur, { up: [1, 0, 0], seg: 12, sub: 3 });
  // Right hand supports the resting body; it releases after the left catches.
  const sh1 = [L * 0.05, L * 0.84, L * 0.1], grip = { part: P.LEG_FR, pivot: sh1 }, hand = [L * 0.14, bY - L * 0.025, L * 0.02];
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
function monkey(m, s, onBranches = false) {
  const L = s.len, long = !!s.long, mac = !!s.shortTail, lang = !!s.crest, legL = L * (long ? 0.62 : 0.45), by = legL;
  // A branch is held between the hands/feet. A broad ground-walking stance
  // leaves all four grips visibly floating beside a narrow canopy limb.
  const stance = onBranches ? .04 : .12;
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
  const bends = canopyWalkerBends(L, by / L);
  for (const side of [1, -1]) {
    const sh = [L * 0.22, by + L * 0.06, side * L * 0.1], fl = { part: side > 0 ? P.LEG_FL : P.LEG_FR, pivot: sh };
    const el = s.canopyWalkerMotion ? bends[side > 0 ? 0 : 1] : [L * 0.26, by * 0.5, side * L * 0.12];
    m.limb(sh, el, L * 0.065, L * 0.05, limbC, fl);
    const fore = s.canopyWalkerMotion ? { ...fl, pivot: el } : fl;
    m.limb(el, [L * 0.3, L * 0.04, side * L * stance], L * 0.05, L * 0.04, limbC, fore);
    m.ell([L * 0.32, L * 0.03, side * L * stance], [L * 0.06, L * 0.03, L * 0.045], hands, { ...fore, lo: true });
    const hip = [-L * 0.26, by, side * L * 0.1], hl = { part: side > 0 ? P.LEG_BL : P.LEG_BR, pivot: hip };
    const kn = s.canopyWalkerMotion ? bends[side > 0 ? 2 : 3] : [-L * 0.16, by * 0.52, side * L * 0.13];
    m.limb(hip, kn, L * 0.08, L * 0.055, limbC, hl);
    const shin = s.canopyWalkerMotion ? { ...hl, pivot: kn } : hl;
    m.limb(kn, [-L * 0.24, L * 0.04, side * L * stance], L * 0.055, L * 0.04, limbC, shin);
    m.ell([-L * 0.2, L * 0.03, side * L * stance], [L * 0.07, L * 0.03, L * 0.045], hands, { ...shin, lo: true });
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

export { monkey, orangutan, pangolin, siamang, sloth };
