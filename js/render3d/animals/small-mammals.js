// Rodents, squirrels, rabbits and bears.
import * as THREE from 'three';
import { P, SPH_HI, col, grad, hash3, pinna, pinnaAt, pixelCoat, place, sculpt, shade, smooth, tmp } from './model-core.js';

// A vole is a furry egg with a blunt nose: tiny feet, ears tucked in the fur, a short tail.
// A chipmunk (stripes) is the same egg, perkier: head up, bold back stripes, a striped face
// and a flat, furry tail held up behind it.
function vole(m, s) {
  const chip = !!s.stripes, dark = col(shade(s.color, -0.55)), pale = col(shade(s.belly, 0.35));
  const base = grad(s.color, s.belly, -0.35, 0.5);
  // stripes run nose to tail along the back: dark, pale, dark either side of a dark centre line
  // (drawn per pixel, coatLines: angles round from the spine, and half widths)
  const fur = chip ? pixelCoat('lines', base, [0, 0.12, 0.49, 0.07, 0.8, 0.06, 0.65, 0.09], dark, pale) : base;
  m.ell([-0.4, 2.9, 0], [4.4, 2.8, 2.7], fur, chip ? { rot: [0, 0, 0.12] } : {});
  const hd = { part: P.HEAD, pivot: [2.2, 3, 0] }, hp = chip ? [3.7, 3.9, 0] : [3.6, 3.1, 0];
  const face = chip ? u => (Math.abs(u.z) > 0.55 && Math.abs(u.y - 0.12) < 0.1 ? dark : Math.abs(u.z) > 0.5 && Math.abs(u.y + 0.12) < 0.1 ? pale : base(u)) : base;
  m.ell(hp, [2.3, 2.1, 2.1], face, hd);
  const sn = [hp[0] + 1.7, hp[1] - 0.3, 0];
  m.ell(sn, [0.9, 0.85, 0.95], shade(s.belly, 0.1), hd);
  m.ell([sn[0] + 0.8, sn[1] + 0.15, 0], [0.3, 0.26, 0.3], '#3a2420', { ...hd, lo: true });
  for (const side of [1, -1]) {
    m.ell([hp[0] + 0.75, hp[1] + 0.6, side * 1.78], [0.42, 0.42, 0.24], '#120e0c', { ...hd, lo: true, gloss: 2 }); // (on the head's surface, half out)
    m.ell([hp[0] + 0.88, hp[1] + 0.74, side * 1.98], [0.12, 0.12, 0.08], '#f4f0ea', { ...hd, lo: true }); // a catchlight
    m.ell([hp[0] - 0.5, hp[1] + 1.6, side * 1.15], [0.6, 0.66, 0.3], shade(s.color, 0.12), { ...hd, rot: [side * -0.35, 0, 0] });
    m.ell([hp[0] - 0.42, hp[1] + 1.6, side * 1.22], [0.4, 0.46, 0.2], '#c8a090', { ...hd, lo: true, rot: [side * -0.35, 0, 0] });
    for (const [x, part] of [[2.3, side > 0 ? P.LEG_FL : P.LEG_FR], [-2.5, side > 0 ? P.LEG_BL : P.LEG_BR]]) {
      const hip = [x, 1.4, side * 1.6];
      // small pink-grey feet tucked under the fur
      m.ell([x + 0.4, 0.62, side * 1.35], [0.65, 0.34, 0.42], shade(s.color, -0.25), { part, pivot: hip, lo: true });
    }
  }
  const tb = { part: P.TAIL, pivot: [-4.4, 2.4, 0] };
  if (chip) {
    // flat and furry, raised behind
    m.limb([-4.3, 2.8, 0], [-6.6, 3.9, 0], 0.8, 0.85, shade(s.color, -0.15), tb);
    m.limb([-6.6, 3.9, 0], [-8.2, 5.4, 0], 0.85, 0.5, shade(s.color, -0.3), tb);
  } else m.limb([-4.5, 2.4, 0], [-7.8, 1.3, 0], 0.32, 0.14, shade(s.color, 0.15), tb);
}

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
    m.ell([4.55, 6.25, side * 1.26], [0.36, 0.36, 0.14], '#15110e', { ...hd, lo: true, gloss: 2 });
    pinnaAt(m, [3.4, 7.3, side * 0.85], [0.28, 0.85, 0.45], [side * -0.25, 0, 0.1], s.color, hd);
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
    m.ell([5.05, 7.75, side * 1.5], [0.55, 0.58, 0.3], '#15110e', { ...hd, lo: true, gloss: 2 });
    m.ell([5.25, 7.95, side * 1.68], [0.14, 0.14, 0.08], '#ffffff', { ...hd, lo: true });
    // leaf-shaped ears laid back, darker at the tips
    pinnaAt(m, [3.4, 10.0, side * 0.95], [0.36, 2.45, 0.85], [side * -0.18, 0, 0.55], shade(s.color, 0.05), { ...hd, shape: 'leaf', cup: 0.45, tip: shade(s.color, -0.3), tipAt: 0.85 });
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

// American black bear: a heavy rolling bulk, rump-high, with a tan muzzle.
// Sun bear (chest): the smallest bear, sleek and short-haired, with a level back, a short pale
// muzzle, small round ears, long curved claws and a pale crescent blaze on the chest.
function bear(m, s) {
  // lift the near-black coat a little so the form reads: glossy on top, deep underneath
  // (tinted by the sprite's coat colour relative to the black bear's, so other bears keep the shading)
  const ref = col('#1f1a17'), c0 = col(s.color || '#1f1a17'), tint = new THREE.Color(c0.r / ref.r, c0.g / ref.g, c0.b / ref.b);
  const L = s.len, H = s.h, by = s.leg + H * 0.5, k = H / 22, sun = !!s.chest; // k: offsets tuned on the black bear's size
  const top = col('#3b2f28').clone().multiply(tint), bot = col('#120e0c').clone().multiply(tint);
  const fur = grad(top, bot, -0.1, 0.65);
  const coat = fur;
  if (sun) { // (finer meshes, so the sleek coat shades smoothly)
    m.add(SPH_HI, place([0, by + 1 * k, 0], [0, 0, 0], [L * 0.4, H * 0.5, H * 0.45]), coat);
    // the blaze: a pale U on the front of the chest, its curve below the chin and its arms reaching up
    // either side of the throat. Only where the chest faces forward (u is the sphere's own normal),
    // so from the side it shows as a pale edge at the front of the chest, not a patch on the shoulder.
    const yc = by + H * 0.1, blaze = (u, p) => {
      const d = Math.hypot(p.z / (H * 0.29), (p.y - yc) / (H * 0.44));
      return u.x > 0.5 && d > 0.7 && d < 1.0 && p.y < yc + H * 0.1 ? tmp.copy(col(s.chest)).multiplyScalar(0.9 + hash3(Math.round(p.y * 2), Math.round(p.z * 2), 3) * 0.15) : fur(u);
    };
    m.add(SPH_HI, place([L * 0.2, by + 1.2 * k, 0], [0, 0, 0], [L * 0.24, H * 0.52, H * 0.47]), blaze);
    m.ell([-L * 0.22, by + 1.2 * k, 0], [L * 0.25, H * 0.52, H * 0.48], coat);
  } else {
    // one smooth bulk from rump to chest (overlapping blobs read as humps): the back runs gently
    // down from a high rump to the withers, with no shoulder hump (that is a grizzly's), and both
    // ends round off blunt. (d.x runs tail to chest; pushed outward, so the barrel stays full)
    sculpt(m, d => {
      const t = Math.sign(d.x) * Math.abs(d.x) ** 0.55, f = smooth(-0.7, 0.8, t);
      const ry = H * (0.55 - 0.05 * f), cy = by + (2.2 - 1.2 * f) * k, rz = H * (0.47 + 0.02 * Math.exp(-t * t * 4));
      return [-L * 0.02 + t * L * 0.47, cy + d.y * ry, d.z * rz];
    }, coat);
  }
  const hs = sun ? 1.18 : 1; // a sun bear's head is big for its body
  const neck = [L * 0.3, by + 1.5 * k, 0], hd = { part: P.HEAD, pivot: neck }, hp = [L * 0.51 + (sun ? H * 0.04 : 0), by - 0.4 * k + (sun ? H * 0.12 : 0), 0];
  m.limb(neck, [hp[0] - 3 * k, hp[1], 0], H * 0.33, H * 0.28, coat, hd);
  const hr = [H * 0.29 * hs, H * 0.26 * hs, H * 0.26 * hs * (sun ? 1.08 : 1)];
  m.ell(hp, hr, coat, hd);
  // an ear rooted in the skull: its root starts a share (sink) of the way in from the head's surface,
  // phi up from the side of the head, so the whole mouth of the funnel stays under the fur, and it
  // leans out from upright by lean (len and width in shares of the height)
  const ear = (side, phi, sink, lean, len, width, color, o) => {
    const d = 1 - sink, base = [hp[0] - H * 0.05, hp[1] + hr[1] * Math.sin(phi) * d, side * hr[2] * Math.cos(phi) * d];
    pinna(m, base, [base[0] - H * 0.02, base[1] + H * len * Math.cos(lean), base[2] + side * H * len * Math.sin(lean)], H * width, color, { ...hd, shape: 'round', cup: 0.35, ...o });
  };
  if (sun) {
    // short, broad pale muzzle with a dark nose, and pale-rimmed small round ears
    m.ell([hp[0] + H * 0.27 * hs, hp[1] - H * 0.09 * hs, 0], [H * 0.17, H * 0.13, H * 0.15], s.muzzle, hd);
    m.ell([hp[0] + H * 0.42 * hs, hp[1] - H * 0.05 * hs, 0], [H * 0.06, H * 0.055, H * 0.075], '#0c0a09', { ...hd, lo: true });
    for (const side of [1, -1]) {
      ear(side, 0.8, 0.1, 0.45, 0.13, 0.14, s.color, { rim: s.muzzle }); // (small, set low and wide on the broad skull)
      m.ell([hp[0] + H * 0.14 * hs, hp[1] + H * 0.07 * hs, side * H * 0.23 * hs], [H * 0.035, H * 0.035, H * 0.02], '#3a2a1e', { ...hd, lo: true, gloss: 2 });
      m.eyeSpot = [hp[0] + H * 0.14 * hs, hp[1] + H * 0.07 * hs, H * 0.23 * hs]; // (eyes)
    }
  } else {
    m.ell([hp[0] + H * 0.26, hp[1] - H * 0.08, 0], [H * 0.2, H * 0.13, H * 0.13], s.muzzle, hd);
    m.ell([hp[0] + H * 0.44, hp[1] - H * 0.05, 0], [H * 0.055, H * 0.05, H * 0.07], '#0c0a09', { ...hd, lo: true });
    for (const side of [1, -1]) {
      ear(side, 0.9, 0.16, 0.15, 0.22, 0.18, '#2e2520');
      m.ell([hp[0] + H * 0.1, hp[1] + H * 0.07, side * H * 0.226], [H * 0.04, H * 0.04, H * 0.024], '#2a1c12', { ...hd, lo: true, gloss: 2 }); // (on the head's surface)
      m.eyeSpot = [hp[0] + H * 0.1, hp[1] + H * 0.07, H * 0.226]; // (eyes)
    }
  }
  for (const [x, side, part, top] of [[L * 0.24, 1, P.LEG_FL, by - 2 * k], [L * 0.24, -1, P.LEG_FR, by - 2 * k], [-L * 0.24, 1, P.LEG_BL, by], [-L * 0.24, -1, P.LEG_BR, by]]) {
    const z = side * H * (sun ? 0.25 : 0.23), hip = [x, top, z], o = { part, pivot: hip };
    // heavy thigh (the black bear's kept inside the rump's curve, so it fills out the haunch rather than bulging off it)
    if (part >= P.LEG_BL) m.ell(sun ? [x - 1 * k, by - 2 * k, z * 1.05] : [x, by - 1.5 * k, z * 1.05], sun ? [H * 0.3, H * 0.4, H * 0.2] : [H * 0.27, H * 0.38, H * 0.2], coat, o);
    m.limb(hip, [x + 0.6 * k, 3 * k, z], H * 0.25, H * 0.17, coat, o);
    paw(m, [x + 1.6 * k, 1.6 * k, z], [H * 0.21, H * 0.09, H * 0.17], '#0e0b09', o);
    // long, curved pale claws, longest on the front feet
    if (sun) for (const t of [-1, 0, 1]) {
      const cl = part < P.LEG_BL ? H * 0.16 : H * 0.09, c0 = [x + 1.6 * k + H * 0.17, 1.6 * k, z + t * H * 0.08];
      m.limb(c0, [c0[0] + cl * 0.7, c0[1] - cl * 0.25, c0[2]], H * 0.025, H * 0.02, '#cdbb9a', { ...o, caps: false });
      m.limb([c0[0] + cl * 0.7, c0[1] - cl * 0.25, c0[2]], [c0[0] + cl, 0.1, c0[2]], H * 0.02, H * 0.008, '#cdbb9a', { ...o, caps: false });
    }
  }
  m.ell([-L * 0.46, by + 3.5 * k, 0], [1.3 * k, 1.2 * k, 1.2 * k], coat, { part: P.TAIL, pivot: [-L * 0.44, by + 3 * k, 0], lo: true });
}

export { bear, rabbit, squirrel, vole };
