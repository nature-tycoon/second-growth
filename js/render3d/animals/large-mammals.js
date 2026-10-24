// Capybaras, tapirs, armadillos and hippos.
import { P, SPH_HI, col, eyes, grad, hash3, loftBody, pinnaAt, pixelCoat, place, sculpt, shade, smooth, stumpLegs, tmp } from './model-core.js';

// Capybara: a barrel with its rump higher than its shoulders, no neck to speak of, and a huge
// blunt, boxy head with the eyes, ears and nostrils all set high (so it can swim almost hidden).
function capybara(m, s) {
  const L = s.len, H = L * 0.5, leg = L * 0.17, by = leg + H * 0.5;
  const fur = u => tmp.copy(col(s.color)).lerp(col(s.belly), smooth(-0.1, -0.75, u.y))
    .multiplyScalar(0.9 + hash3(Math.round(u.x * 22), Math.round(u.y * 10), Math.round(u.z * 10)) * 0.16);
  loftBody(m, { x0: -L * 0.46, x1: L * 0.3, cy0: by + H * 0.1, cy1: by, ry0: H * 0.56, ry1: H * 0.48, rz0: H * 0.46, rz1: H * 0.42, sag: H * 0.03 }, fur);
  const neck = [L * 0.24, by + H * 0.05, 0], hd = { part: P.HEAD, pivot: neck };
  const face = grad(shade(s.color, -0.05), s.belly, -0.2, 0.5);
  // the head: one long, deep box with rounded edges, carried nose down. Square in profile, with a
  // flat, broad front (the upper lip overhangs the chin a little) and the cheeks deepest at the back.
  // (local x runs from the back of the skull, -a, to the nose, +a; y up; z to the side)
  const a = H * 0.5, b = H * 0.3, tilt = -0.28, hc = [L * 0.4, by + H * 0.06], cs = Math.cos(tilt), sn = Math.sin(tilt);
  const box = d => {
    const x = a * Math.sign(d.x) * Math.abs(d.x) ** 0.4, t = (x / a + 1) / 2;
    let y = b * Math.sign(d.y) * Math.abs(d.y) ** 0.6 * (d.y < 0 ? 1.15 - 0.3 * t : 1 - 0.08 * t);
    const z = H * (0.28 - 0.04 * t) * Math.sign(d.z) * Math.abs(d.z) ** 0.6;
    return [x + (y < 0 ? y * 0.15 * t : 0), y, z];
  };
  const at = ([x, y, z]) => [hc[0] + x * cs - y * sn, hc[1] + x * sn + y * cs, z];
  const dir = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };
  const nose = col(shade(s.color, -0.3)).clone(); // (the dark, broad nose pad is painted on the flat front, flush)
  sculpt(m, d => at(box(d)), (d, p) => face(d).lerp(nose, smooth(0.72, 0.9, d.x) * smooth(-0.35, 0.05, d.y)), hd);
  for (const side of [1, -1]) {
    m.ell(at([a * 0.93, b * 0.5, side * H * 0.09]), [H * 0.03, H * 0.028, H * 0.045], '#1a120c', { ...hd, lo: true, rot: [0, 0, tilt] }); // nostrils high on the front
    const eye = at(box(dir(-0.22, 0.6, side * 0.78)).map(v => v * 0.97));
    m.ell(eye, [H * 0.042, H * 0.04, H * 0.03], '#140e0a', { ...hd, lo: true, gloss: 2 }); // small eyes, high and back
    m.eyeSpot = [eye[0], eye[1], Math.abs(eye[2])];
    const ear = at([-a * 0.82, b * 0.92, side * H * 0.15]);
    pinnaAt(m, ear, [H * 0.045, H * 0.075, H * 0.07], [side * -0.3, 0, 0.2], shade(s.color, -0.3), { ...hd, shape: 'round', cup: 0.35, inner: '#9a6a62' }); // little round ears, high and far back
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
    m.ell([hp[0] + H * 0.08, hp[1] + H * 0.06, side * H * 0.17], [H * 0.04, H * 0.04, H * 0.03], '#0e0c0a', { ...hd, lo: true, gloss: 2 });
    m.eyeSpot = [hp[0] + H * 0.08, hp[1] + H * 0.06, H * 0.17]; // (eyes)
    pinnaAt(m, [hp[0] - H * 0.14, hp[1] + H * 0.3, side * H * 0.14], [H * 0.04, H * 0.13, H * 0.09], [side * -0.35, 0, 0.3], shade(s.color, -0.1), { ...hd, shape: 'round', rim: s.rim, tip: s.rim, tipAt: 0.9 });
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
  // mottled plates fore and aft, with the flexible bands across the middle drawn per pixel (coatRings)
  const shell = pixelCoat('rings', u => u.x > -0.35 && u.x < 0.3 ? col(s.color) : tmp.copy(col(s.color)).multiplyScalar(0.85 + hash3(Math.round(u.x * 12), Math.round(u.y * 8), Math.round(u.z * 8)) * 0.25),
    [16.55, 0.09, 0, 0.325, 0.65, 2, -2, 0], shade(s.color, -0.35));
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
    m.ell([L * 0.51, by + H * 0.43, side * H * 0.29], [H * 0.03, H * 0.03, H * 0.02], '#140c0a', { ...hd, lo: true, gloss: 2 });
    m.eyeAt = [L * 0.51, by + H * 0.43, H * 0.29]; m.eyePivot = neck;
    pinnaAt(m, [L * 0.39, by + H * 0.48, side * H * 0.2], [H * 0.04, H * 0.08, H * 0.05], [side * -0.4, 0, 0.3], shade(s.color, -0.2), { ...hd, shape: 'round', cup: 0.35 }); // little ears
    m.ell([L * 0.72, by - H * 0.12, side * H * 0.34], [H * 0.035, H * 0.08, H * 0.03], '#f0e8d8', { ...hd, lo: true }); // a hint of tusk at the lip
  }
  const lc = u => tmp.copy(grey).lerp(pink, 0.25), r0 = H * 0.28, r1 = H * 0.24;
  stumpLegs(m, [[L * 0.2, H * 0.34, by - H * 0.1, r0, r1, lc], [L * 0.2, -H * 0.34, by - H * 0.1, r0, r1, lc],
    [-L * 0.3, H * 0.36, by - H * 0.05, r0 * 1.1, r1, lc], [-L * 0.3, -H * 0.36, by - H * 0.05, r0 * 1.1, r1, lc]], shade(s.color, -0.25));
  const tb = [-L * 0.49, by + H * 0.2, 0];
  m.ell([-L * 0.53, by + H * 0.02, 0], [H * 0.05, H * 0.16, H * 0.08], s.color, { part: P.TAIL, pivot: tb, rot: [0, 0, -0.3] }); // short flattened tail
}

export { armadillo, capybara, hippo, tapir };
