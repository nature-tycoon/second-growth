// Aquatic wildlife, reptiles and amphibians.
import * as THREE from 'three';
import { P, col, cyl, eyes, flat, grad, hash3, loftBody, pixelCoat, place, shade, smooth, solid, tmp, tube, wingShape } from './model-core.js';

// ---------------------------------------------------------------- herps and fish
// Frogs sit up on folded hind legs: thigh back, shin forward, long foot flat on the ground.
function frog(m, s) {
  const S = s.size, plain = grad(s.color, shade(s.color, 0.4), -0.15, 0.35);
  const skin = s.spotted ? pixelCoat('spots', plain, [S * 0.1], s.spotted) : plain; // (coatSpots)
  const leg = s.dark && s.dark !== '#2a4a1e' ? s.dark : shade(s.color, -0.1);
  m.ell([-S * 0.02, S * 0.3, 0], [S * 0.38, S * 0.24, S * 0.3], skin, { rot: [0, 0, 0.35] });
  m.ell([S * 0.28, S * 0.4, 0], [S * 0.22, S * 0.16, S * 0.26], skin, { rot: [0, 0, 0.15] });
  // tree frog's dark mask through the eye: a thin band just wider than the head, so it only
  // shows along the head's sides (a separate bar stood out from the cheeks like a mustache)
  if (s.dark === '#2a4a1e') m.ell([S * 0.268, S * 0.479, 0], [S * 0.17, S * 0.032, S * 0.242], s.dark, { rot: [0, 0, 0.15] });
  for (const side of [1, -1]) {
    // eyes on top, gold with a dark pupil
    m.ell([S * 0.33, S * 0.53, side * S * 0.14], [S * 0.075, S * 0.075, S * 0.075], skin, { lo: true });
    m.ell([S * 0.38, S * 0.55, side * S * 0.16], [S * 0.045, S * 0.05, S * 0.045], '#c8a040', { lo: true });
    m.ell([S * 0.405, S * 0.555, side * S * 0.165], [S * 0.022, S * 0.035, S * 0.022], '#141210', { lo: true, gloss: 2 });
    const hip = [-S * 0.15, S * 0.24, side * S * 0.2], hl = { part: side > 0 ? P.LEG_BL : P.LEG_BR, pivot: hip };
    m.ell([-S * 0.16, S * 0.2, side * S * 0.3], [S * 0.22, S * 0.1, S * 0.09], leg, { ...hl, rot: [0, side * 0.3, 0.45] });
    m.ell([-S * 0.02, S * 0.1, side * S * 0.36], [S * 0.18, S * 0.06, S * 0.07], leg, { ...hl, rot: [0, side * -0.25, -0.35] });
    m.ell([S * 0.02, S * 0.025, side * S * 0.38], [S * 0.2, S * 0.025, S * 0.07], leg, { ...hl, lo: true });
    const sh = [S * 0.25, S * 0.24, side * S * 0.18], fl = { part: side > 0 ? P.LEG_FL : P.LEG_FR, pivot: sh };
    m.limb(sh, [S * 0.34, S * 0.03, side * S * 0.24], S * 0.05, S * 0.04, leg, fl);
    m.ell([S * 0.38, S * 0.02, side * S * 0.25], [S * 0.06, S * 0.02, S * 0.05], leg, { ...fl, lo: true });
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

// Sea turtle: a low, streamlined, heart-shaped shell of big scutes on a pale yellow plastron, a
// rounded head with a short beak and big eyes, long flippers swept back like wings in front and
// small paddle-shaped ones behind. Skin in a mosaic of dark scales edged in cream. (hawk: the
// hawksbill's narrow, hooked beak and its amber tortoiseshell.)
function seaTurtle(m, s) {
  const S = s.size, seam = shade(s.color, -0.45), streak = s.streak || shade(s.color, 0.32);
  // big scutes with dark seams, fine streaks radiating across them (coatScutes, per pixel)
  const shell = pixelCoat('scutes', solid(s.color), [S * 0.2, S * 0.45, 0, 0.1, 0.18, 1, 0.12], seam, streak);
  m.ell([-S * 0.02, S * 0.2, 0], [S * (s.ridley ? 0.44 : 0.47), S * (s.ridley ? 0.11 : 0.13), S * (s.ridley ? 0.39 : 0.37)], shell, { fine: true });
  m.ell([S * 0.0, S * 0.15, 0], [S * 0.49, S * 0.035, S * 0.385], shade(s.color, -0.2)); // the marginal scutes along the rim
  m.ell([S * 0.02, S * 0.12, 0], [S * 0.42, S * 0.05, S * 0.31], s.plastron || '#e8d49a');  // pale belly plates
  // skin: dark scales, each edged in cream
  const edge = col(s.skinEdge || (s.ridley ? shade(s.dark, 0.12) : '#c8b88a')), dk = col(s.dark);
  const scales = pixelCoat('scutes', solid(dk), [S * 0.05, 0, 0, 0.07], edge); // (coatScutes)
  const hp = [S * 0.56, S * 0.18, 0], neck = [S * 0.4, S * 0.17, 0], hd = { part: P.HEAD, pivot: neck };
  m.limb(neck, [hp[0] - S * 0.06, hp[1], 0], S * 0.085, S * 0.09, scales, hd);
  m.ell(hp, [S * 0.13, S * 0.1, S * 0.1], scales, hd);
  m.ell([hp[0] + S * 0.1, hp[1] - S * 0.03, 0], [S * 0.06, S * 0.045, S * 0.05], s.hawk ? '#3a2e24' : shade(s.dark, -0.3), hd); // beak
  if (s.hawk) m.limb([hp[0] + S * 0.12, hp[1] - S * 0.02, 0], [hp[0] + S * 0.17, hp[1] - S * 0.06, 0], S * 0.02, S * 0.006, '#3a2e24', { ...hd, caps: false });
  eyes(m, hp, S * 0.06, S * 0.03, S * 0.085, S * 0.03, P.HEAD, neck);
  for (const side of [1, -1]) m.ell([hp[0] + S * 0.08, hp[1] + S * 0.04, side * S * 0.105], [S * 0.008, S * 0.008, S * 0.006], '#f4f2ea', { ...hd, lo: true }); // a catchlight
  // flippers (they sweep with the walk cycle: a slow rowing stroke)
  for (const side of [1, -1]) {
    const fp = side > 0 ? P.LEG_FL : P.LEG_FR, hip = [S * 0.26, S * 0.15, side * S * 0.28];
    // a broad, flat paddle, swept back to a pointed tip like a wing
    const front = flat(sh => { sh.moveTo(0.18, 0); sh.quadraticCurveTo(0.3, 0.55 * side, -0.4, 1.0 * side); sh.quadraticCurveTo(-0.12, 0.45 * side, -0.2, 0); sh.lineTo(0.18, 0); }, 'xz');
    m.add(front, place(hip, [0, 0, 0], [S * 0.42, S * 0.035, S * 0.5]), pixelCoat('scutes', u => (Math.abs(u.z) > 0.82 ? edge : dk), [S * 0.05, 0, 0, 0.07], edge), { part: fp, pivot: hip });
    const bp = side > 0 ? P.LEG_BL : P.LEG_BR, rh = [-S * 0.32, S * 0.15, side * S * 0.22];
    const rear = flat(sh => { sh.moveTo(0.1, 0); sh.quadraticCurveTo(0.05, 0.6 * side, -0.3, 0.75 * side); sh.quadraticCurveTo(-0.25, 0.3 * side, -0.2, 0); sh.lineTo(0.1, 0); }, 'xz');
    m.add(rear, place(rh, [0, 0, 0], [S * 0.3, S * 0.03, S * 0.26]), dk, { part: bp, pivot: rh });
  }
  m.limb([-S * 0.42, S * 0.16, 0], [-S * 0.52, S * 0.14, 0], S * 0.03, S * 0.01, scales, { part: P.TAIL, pivot: [-S * 0.42, S * 0.16, 0] });
}

// Dugong: a long, plump grey sea cow with a broad, down-turned bristly muzzle for grazing
// seagrass, little paddle flippers and a whale-like fluked tail. The body is one smooth skin from
// the muzzle to the root of the flukes (no neck: the head just narrows out of the body), and the
// flukes beat up and down, like a whale's, not side to side like a fish's tail.
function dugong(m, s) {
  const S = s.size, cy = S * 0.16, top = col(s.color), belly = col(s.belly || shade(s.color, 0.25)), dk = col(shade(s.color, -0.12));
  const skin = u => (u.y > 0.1 ? tmp.copy(belly).lerp(top, smooth(0.1, 0.6, u.y)) : tmp.copy(belly).lerp(top, 0.25 * smooth(-0.6, 0.1, u.y)));
  // side and top profile from the tail stock (x/S, half-height, half-width, centre line), smoothed
  // through with a Catmull-Rom curve; the last few close the muzzle off round, not to a point
  const K = [[-0.53, 0.022, 0.03, 0.01], [-0.42, 0.04, 0.045, 0.012], [-0.27, 0.085, 0.095, 0.006], [-0.06, 0.128, 0.142, 0], [0.12, 0.128, 0.138, 0],
    [0.27, 0.098, 0.1, -0.008], [0.36, 0.08, 0.084, -0.022], [0.43, 0.062, 0.072, -0.042], [0.465, 0.042, 0.055, -0.052], [0.483, 0.02, 0.03, -0.056], [0.488, 0, 0, -0.057]];
  const cr = (t, c) => {
    const f = t * (K.length - 1), i = Math.min(K.length - 2, Math.floor(f)), u = f - i;
    const p0 = K[Math.max(0, i - 1)][c], p1 = K[i][c], p2 = K[i + 1][c], p3 = K[Math.min(K.length - 1, i + 2)][c];
    return 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
  };
  {
    const R = 64, A = 28, pos = [], uv = [], idx = [];
    for (let i = 0; i <= R; i++) {
      const t = i / R, x = cr(t, 0) * S, ry = Math.max(0, cr(t, 1)) * S, rz = Math.max(0, cr(t, 2)) * S, c = cy + cr(t, 3) * S;
      for (let j = 0; j <= A; j++) {
        const a = j / A * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        pos.push(x, c + ca * ry * (ca < 0 ? 0.92 : 1), sa * rz); // (a little flatter underneath)
        uv.push(2 * t - 1, ca, sa);
      }
    }
    for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) { const a = i * (A + 1) + j, b = a + A + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const unitG = new THREE.BufferGeometry(); unitG.setAttribute('position', new THREE.Float32BufferAttribute(uv, 3));
    m.add(g, new THREE.Matrix4(), skin, { paintGeo: unitG });
  }
  // the muzzle: a broad, flat, bristly disc on the front of the face, turned down to the grass
  m.ell([S * 0.452, cy - S * 0.07, 0], [S * 0.05, S * 0.032, S * 0.07], shade(s.belly || s.color, 0.06), { rot: [0, 0, -1.0] });
  m.ell([S * 0.462, cy - S * 0.085, 0], [S * 0.036, S * 0.014, S * 0.055], shade(s.color, -0.25), { rot: [0, 0, -1.0], lo: true }); // (the darker bristle pad)
  for (const side of [1, -1]) m.ell([S * 0.45, cy - S * 0.008, side * S * 0.022], [S * 0.012, S * 0.006, S * 0.008], '#2a2622', { lo: true }); // nostrils, on top
  eyes(m, [S * 0.36, cy, 0], 0, S * 0.012, S * 0.08, S * 0.011, P.BODY, null);
  // flippers: short paddles just behind the head, angled down and back (it steers with them)
  for (const side of [1, -1]) {
    m.limb([S * 0.2, cy - S * 0.05, side * S * 0.08], [S * 0.14, cy - S * 0.1, side * S * 0.16], S * 0.035, S * 0.02, dk, { seg: 10 });
    m.ell([S * 0.12, cy - S * 0.105, side * S * 0.18], [S * 0.06, S * 0.012, S * 0.04], dk, { rot: [side * 0.35, side * 0.6, 0] });
  }
  // the flukes: broad, swept-back crescents with pointed tips and a notch in the middle, growing
  // straight out of the tail stock (and beating up and down from its root as it swims)
  const tail = { part: P.LEG_BL, pivot: [-S * 0.5, cy + S * 0.01, 0] };
  m.add(flat(sh => {
    sh.moveTo(0.16, 0.0); sh.quadraticCurveTo(0.02, 0.32, -0.42, 1.0); sh.quadraticCurveTo(-0.36, 0.55, -0.62, 0.42);
    sh.quadraticCurveTo(-0.5, 0.12, -0.56, 0.0); sh.quadraticCurveTo(-0.5, -0.12, -0.62, -0.42); sh.quadraticCurveTo(-0.36, -0.55, -0.42, -1.0);
    sh.quadraticCurveTo(0.02, -0.32, 0.16, 0.0);
  }, 'xz', 10), place([-S * 0.5, cy + S * 0.01, 0], [0, 0, 0], [S * 0.21, S * 0.022, S * 0.2]), u => (u.y > 0 ? top : dk), tail);
  // (rounded off where the flukes meet the tail stock)
  m.ell([-S * 0.5, cy + S * 0.01, 0], [S * 0.04, S * 0.018, S * 0.035], top, tail);
}

function turtle(m, s) {
  const S = s.size;
  // plates in shades between the shell's two colours, with darker seams (coatScutes, per pixel)
  const shell = pixelCoat('scutes', solid(s.color), [S * 0.22, S * 0.46, 0, 0.06, 0.7, 0, 0], shade(s.color, -0.45), s.dark);
  if (s.dome) {
    // leopard tortoise: a high dome of plates, each pale gold with a dark rim and dark flecks
    // radiating from its middle (coatScutes: each plate 85% to all of the vertex colour's tone)
    const gold = col(s.color), dk = col(s.dark);
    const plates = pixelCoat('scutes', u => tmp.copy(gold).multiplyScalar(1 + 0.15 * smooth(-0.2, 1, u.y)), [S * 0.26, S * 0.46, 0, 0.12, -0.15, 2, 0.15],
      tmp.copy(dk).lerp(gold, 0.2), shade(s.color, -1));
    m.ell([0, S * 0.3, 0], [S * 0.46, S * 0.36, S * 0.38], plates, { fine: true });
    m.ell([0, S * 0.14, 0], [S * 0.47, S * 0.05, S * 0.39], shade(s.color, -0.3)); // the rim of the shell
  } else if (s.sea) m.ell([0, S * 0.22, 0], [S * 0.48, S * 0.15, S * 0.4], shell); // a sea turtle's low, streamlined shell
  else m.ell([0, S * 0.24, 0], [S * 0.46, S * 0.24, S * 0.38], shell);
  m.ell([0, S * 0.13, 0], [S * 0.47, S * 0.05, S * 0.39], shade(s.dark, -0.2));
  const skin = shade(s.dark, 0.1);
  m.ell([S * 0.52, S * 0.2, 0], [S * 0.16, S * 0.12, S * 0.12], skin, { part: P.HEAD, pivot: [S * 0.4, S * 0.18, 0] });
  eyes(m, [S * 0.52, S * 0.2, 0], S * 0.08, S * 0.04, S * 0.09, S * 0.025, P.HEAD, [S * 0.4, S * 0.18, 0]);
  if (s.spots) for (const [x, y, z] of [[0.58, 0.28, 0], [0.5, 0.29, 0.06], [0.5, 0.29, -0.06], [0.6, 0.22, 0.08], [0.6, 0.22, -0.08]])
    m.ell([S * x, S * y, S * z], [S * 0.035, S * 0.02, S * 0.03], s.spots, { part: P.HEAD, pivot: [S * 0.4, S * 0.18, 0], lo: true }); // yellow-spotted river turtle
  const legs = [[S * 0.28, 1, P.LEG_FL], [S * 0.28, -1, P.LEG_FR], [-S * 0.28, 1, P.LEG_BL], [-S * 0.28, -1, P.LEG_BR]];
  if (s.sea) for (const [x, side, part] of legs) {
    // flippers: long, curved paddles in front for flying through the water, short rudders behind
    const front = part < P.LEG_BL, hip = [x, S * 0.16, side * S * 0.3];
    if (front) m.ell([x - S * 0.04, S * 0.15, side * S * 0.56], [S * 0.075, S * 0.02, S * 0.3], skin, { part, pivot: hip, rot: [0, side * -0.65, 0] }); // long and narrow, swept back like a wing
    else m.ell([x - S * 0.1, S * 0.14, side * S * 0.36], [S * 0.07, S * 0.018, S * 0.1], skin, { part, pivot: hip, rot: [0, side * 0.5, 0] });
  }
  else for (const [x, side, part] of legs) { const hip = [x, S * 0.15, side * S * 0.28]; m.limb(hip, [x, S * 0.04, side * S * 0.4], S * 0.08, S * 0.07, skin, { part, pivot: hip }); }
  m.limb([-S * 0.42, S * 0.16, 0], [-S * 0.58, S * 0.08, 0], S * 0.05, S * 0.015, skin, { part: P.TAIL, pivot: [-S * 0.42, S * 0.16, 0] });
}

// One closed surface from the blunt snout through the skull, neck, body and tail.
// Paint follows length and radial coordinates, so patterns stay on the back/flanks
// rather than drifting across the body when it curves. No separate head blob.
function snake(m, s) {
  const S = s.size, heavy = !!s.heavy, python = !!s.reticulated, boa = !!s.saddles, rat = !!s.mottled;
  const bulk = heavy ? .148 : boa ? .118 : python ? .102 : rat ? .075 : .060;
  const headW = heavy ? .088 : boa ? .096 : python ? .087 : rat ? .065 : .054;
  const headH = heavy ? .052 : boa || python ? .046 : .035;
  const length = python ? 2.6 : 2.4, noseX = length * .49, tailAt = heavy ? .86 : boa ? .79 : python ? .80 : .69;
  const curve = heavy ? .27 : python ? .35 : .38; // (the resting S: one full bend along the body)
  const back = col(s.color), belly = col(s.belly || shade(s.color, .42)), dark = col(s.side || s.stripe || '#29291f');
  const light = col(s.blotches || s.stripe || shade(s.color, .18));
  // [length fraction, half-width, half-height, height above the resting belly]
  const K = [[0, 0, 0, .020], [.007, headW * .48, headH * .65, .020],
    [.022, headW * .80, headH * .92, .022], [.045, headW, headH, .022],
    [.068, headW * .89, headH * .90, .020], [.095, bulk * .55, headH * .68, .013],
    [.15, bulk * .75, bulk * .58, .006], [.27, bulk, bulk * .77, .004],
    [.52, bulk * .97, bulk * .75, .004], [tailAt, bulk * .72, bulk * .55, .004],
    [(tailAt + 1) / 2, bulk * .28, bulk * .22, .004], [.985, .004, .003, .004], [1, 0, 0, .004]];
  const profile = t => {
    let k = 0; while (k < K.length - 2 && K[k + 1][0] < t) k++;
    const a = K[k], b = K[k + 1], f = smooth(a[0], b[0], t);
    const width = a[1] + (b[1] - a[1]) * f, height = a[2] + (b[2] - a[2]) * f;
    const lift = a[3] + (b[3] - a[3]) * f;
    const z = Math.sin(t * Math.PI * 2) * curve * smooth(.09, .22, t);
    return { x: (noseX - t * length) * S, y: (height * .74 + lift) * S, z: z * S, width: width * S, height: height * S };
  };
  const blotch = (t, angle, count, center, spread, offset = 0) => {
    const q = t * count + offset, cell = Math.floor(q), jitter = (hash3(cell, count, 3) - .5) * .14;
    const dx = (q - cell - .5 - jitter) / (.32 + hash3(cell, 5, count) * .08);
    return dx * dx + ((angle - center) / spread) ** 2;
  };
  const paint = u => {
    const t = (u.x + 1) / 2, angle = Math.atan2(u.z, u.y), a = Math.abs(angle);
    // Pale broad belly scutes, low contrast so they don't sparkle at map scale.
    if (u.y < -.58) return tmp.copy(belly).multiplyScalar(.95 + .05 * Math.abs(Math.sin(t * 220)));
    let color = back;
    if (t < .092) {
      if (!heavy && !python && !boa && !rat && a < .18) color = col(s.stripe);
      else if ((boa || python) && a < .13 && t > .018) color = dark;
      else if (a > .95 && a < 1.5 && t > .034) color = heavy ? col('#b8954c') : dark;
      return tmp.copy(color).lerp(belly, smooth(-.15, -.58, u.y) * .45);
    }
    if (s.reticulated) {
      const q = t * 15 + Math.sin(t * 31) * .13;
      const net = Math.min(Math.abs(Math.sin(Math.PI * (q + angle * 1.65))), Math.abs(Math.sin(Math.PI * (q - angle * 1.65))));
      color = net < .19 ? dark : net < .39 ? light : a > 1.1 && net > .67 ? belly : back;
    } else if (boa) {
      const q = t * 12, cell = Math.floor(q), dx = Math.abs(q - cell - .5);
      const saddle = dx / (.20 + .17 * smooth(.15, 1.2, a)) + (a / 1.65) ** 4;
      const side = blotch(t, a, 12, 1.78, .34, .5);
      color = saddle < 1 ? col(s.blotches) : saddle < 1.22 || side < 1 ? dark : back;
      if (t > .77 && saddle < 1) color = col('#794b35');
    } else if (rat) {
      const saddle = blotch(t, angle, 14, 0, 1.05), side = blotch(t, a, 14, 1.55, .35, .5);
      color = saddle < 1 || side < 1 ? col(s.stripe) : saddle < 1.3 || side < 1.3 ? dark : col(s.side);
    } else if (heavy) {
      const spot = Math.min(blotch(t, angle, 13, .72, .48), blotch(t, angle, 13, -.72, .48, .42));
      const eye = blotch(t, a, 13, 1.75, .27, .35);
      color = spot < 1 || eye > .48 && eye < 1.3 ? light : eye < .48 ? belly : back;
    } else {
      // Three uninterrupted yellow stripes, red flank patches and dark checks.
      const stripe = a < .17 || Math.abs(a - 1.82) < .13;
      const q = Math.floor(t * 40 + Math.floor(a * 4) * .5);
      color = stripe ? col(s.stripe) : a > .55 && a < 1.65 && q % 2 === 0 ? col(s.side) : back;
    }
    return tmp.copy(color).lerp(belly, smooth(-.20, -.58, u.y) * .45)
      .multiplyScalar(.97 + .03 * Math.cos(t * 260 + Math.floor(angle * 9) * Math.PI));
  };
  // (the shader draws the markings per pixel, coatSnake; the vertex colours are the same markings,
  // for when they are too small to draw)
  const skin = pixelCoat('snake', paint, [heavy ? 4 : rat ? 3 : boa ? 2 : python ? 1 : 0, belly.r, belly.g, belly.b, back.r, back.g, back.b],
    heavy ? '#b8954c' : dark, light);
  const R = 128, A = m.seg(24), pos = [], unit = [], idx = [];
  for (let i = 0; i <= R; i++) {
    const t = i / R, p = profile(t);
    // Align oval cross sections to the horizontal tangent; keep the belly flat.
    const ahead = profile(Math.max(0, t - .001)), behind = profile(Math.min(1, t + .001));
    const dx = ahead.x - behind.x, dz = ahead.z - behind.z, d = Math.hypot(dx, dz), nx = -dz / d, nz = dx / d;
    for (let j = 0; j <= A; j++) {
      const a = j / A * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      pos.push(p.x + nx * sa * p.width, p.y + ca * p.height * (ca < 0 ? .74 : 1), p.z + nz * sa * p.width);
      unit.push(2 * t - 1, ca, sa);
    }
  }
  for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) { const a = i * (A + 1) + j, b = a + A + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(), paintGeo = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  paintGeo.setAttribute('position', new THREE.Float32BufferAttribute(unit, 3));
  m.add(g, new THREE.Matrix4(), skin, { paintGeo, part: P.SPINE }); g.dispose(); paintGeo.dispose();
  const spine = m.parts[m.parts.length - 1].attributes.aPivot;
  for (let i = 0; i <= R; i++) { const c = profile(i / R); for (let j = 0; j <= A; j++) spine.setXYZ(i * (A + 1) + j, c.x, c.y, c.z); }
  // Lateral eyes for the land snakes; the anaconda's eyes sit higher on its head.
  const eyeT = .043, e = profile(eyeT), ey = heavy ? .70 : .35, er = S * (heavy ? .014 : .012);
  for (const side of [-1, 1]) {
    const eye = [e.x, e.y + e.height * ey, e.z + side * e.width * Math.sqrt(1 - ey * ey)];
    m.ell(eye, [er * 1.2, er, er * .72], heavy || python || boa ? '#b5a054' : '#94885e', { lo: true, gloss: 2 });
    m.ell([eye[0] + er * .12, eye[1] + er * .10, eye[2] + side * er * .50],
      [er * (boa || python ? .24 : .55), er * .66, er * .28], '#131410', { lo: true, gloss: 2 });
    m.ell([eye[0] + er * .27, eye[1] + er * .45, eye[2] + side * er * .63], [er * .20, er * .20, er * .16], '#e5dfc8', { lo: true });
    const n = profile(.017);
    m.ell([n.x, n.y + n.height * (heavy ? .85 : .5), side * n.width * (heavy ? .45 : .82)], [S * .006, S * .003, S * .004], '#24261b', { lo: true });
    const jaw = [.010, .026, .046, .067].map(t => { const p = profile(t); return [p.x, p.y - p.height * .24, p.z + side * p.width * .99]; });
    tube(m, jaw, jaw.map(() => S * .0018), '#423f2c', { seg: 5, sub: 2, capRings: 1 });
  }
  const tip = profile(.002), root = [noseX * S, tip.y - S * .005, 0], tongue = { part: P.TONGUE, pivot: root, seg: 5, caps: false };
  m.limb(root, [root[0] + S * .085, root[1], 0], S * .005, S * .003, '#493038', tongue);
  for (const side of [-1, 1]) m.limb([root[0] + S * .080, root[1], 0], [root[0] + S * .126, root[1] - S * .002, side * S * .019], S * .003, S * .001, '#493038', tongue);
  return { amp: curve * S, len: length * S, nose: noseX * S }; // the resting curve, for the crawl
}

// Fish share one body plan, varied per species:
//   deep: a tall body (piranha, and very tall for the round little bluegill)
//   short / long: body length (bluegill short; catfish long and eel-like)
//   spiny: a long spiny-rayed dorsal instead of a trout's small one and adipose (bass, sunfish, snook, snapper)
//   stripe: a dark line along the side (snook's thin lateral line; bass's broad blotchy band)
//   bars: faint vertical bars (bluegill); ear: the dark gill-cover flap; jaw: a big mouth line back under the eye
//   catfish: a broad flat head with barbels, long low fins and a rounded tail
function fish(m, s) {
  const S = s.size, cy = S * 0.2, coho = !!s.head, cat = !!s.catfish, D = (s.deep === 2 ? 2.2 : s.deep ? 1.7 : 1) * (cat ? 0.85 : 1);
  const X = s.needle ? 2 : s.short ? 0.78 : s.long ? 1.18 : 1, bx = S * 0.44 * X;
  const back = s.back || (coho ? '#2f4a38' : '#66784a'), flank = s.flank || (coho ? '#c5403a' : '#c6bd86'), belly = s.belly || (coho ? '#9a6a60' : '#ece6d2');
  const red = col('#b8322a'), dk = col(s.stripeColor || shade(back, -0.45));
  // the body's colours; its markings are drawn per pixel (coatFish, coatBars: see marks below)
  const body = u => {
    const t = (1 - u.x) / 2; // 0 at the nose, 1 at the tail
    let c = u.y > 0.25 ? tmp.copy(col(back)).lerp(col(flank), smooth(0.55, 0.25, u.y)) : tmp.copy(col(flank)).lerp(col(belly), smooth(-0.25, -0.6, u.y));
    if (coho && t < 0.3) c = tmp.copy(col(back)).lerp(col(belly), smooth(0.1, -0.5, u.y));
    if (s.rear) c = tmp.copy(c).lerp(col(s.rear), smooth(0.3, 0.95, t)); // (the cleaner wrasse: pale in front, blue behind)
    if (s.tailRed && u.y < 0.35) c = tmp.copy(c).lerp(red, smooth(0.45, 0.9, t) * 0.85); // arapaima's red-edged rear scales
    if (s.eyeBar && Math.abs(t - 0.13) < 0.035 && u.y > -0.5) return col(s.eyeBar);
    if (s.blackBands) for (const [a, b] of s.blackBands) if (t > a && t < b) return col(s.bandColor || '#141210'); // (the Moorish idol's two broad black bands)
    if (s.shark && u.y < -0.2) c = tmp.copy(c).lerp(col(belly), smooth(-0.2, -0.5, u.y)); // pale underneath
    return c;
  };
  // markings, per pixel: cutthroat spots gathering toward the tail (a coho's spread evenly), a
  // bluegill's flank bars, a clownfish's three white bands edged in black, the humphead's squiggly face
  // markings, the blue tang's dark "palette" (a band from the eye to the tail along the upper flank,
  // with a blue window in it), a bass's ragged band of blotches, a snook's line, the cleaner wrasse's
  // stripe widening toward the tail, the hawkfish's red checks, the parrotfish's pink-rimmed scales
  const marks = s.spots ? ['fish', [0, coho ? 1 : 0], s.spots] : s.bars ? ['bars', [0, 15, 0, 0.45, 0.32, -0.35], dk] : s.bands ? ['fish', [2], '#141210', s.bands]
    : s.lines ? ['fish', [3], s.lines] : s.palette ? ['fish', [4], s.palette] : s.stripe ? ['fish', [5, { band: 0, line: 1, cleaner: 2 }[s.stripe] ?? 1], dk]
    : s.grid ? ['fish', [6], s.grid] : s.scales ? ['fish', [7], s.scales] : null;
  // one smooth body from the tail stock to the snout (no seam where a head would join): a thin
  // stock swelling to the deepest point, then easing down to the nose, blunt on the deep fish
  const x0 = -bx - S * 0.06, x1 = bx * 1.1, tm = s.deep ? 0.5 : 0.55, ryM = S * 0.15 * D * (s.needle ? 0.55 : 1), rzM = S * (cat ? 0.1 : 0.085) * (s.needle ? 0.75 : 1);
  const nosePow = s.deep || cat ? 0.5 : s.shark ? 0.85 : 0.62;
  const prof = x => {
    const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    const k = t < tm ? 0.42 + 0.58 * smooth(0, tm, t) : Math.pow(Math.max(0, 1 - ((t - tm) / (1 - tm)) ** 2), nosePow);
    const kz = t < tm ? 0.5 + 0.5 * smooth(0, tm, t) : Math.pow(Math.max(0, 1 - ((t - tm) / (1 - tm)) ** 2), cat ? 0.35 : nosePow);
    const end = Math.sqrt(Math.min(1, t / 0.03)); // closed off just inside the tail fin
    return { t, ry: ryM * k * end, rz: rzM * kz * end, cy: cy - S * 0.03 * smooth(0.7, 1, t) };
  };
  { // (40 x 22 since the markings moved to the shader, which needs only a smooth outline; finer close up)
    const R = m.seg(40), A = m.seg(22), pos = [], idx = [], uv = [];
    for (let i = 0; i <= R; i++) {
      const x = x0 + (x1 - x0) * i / R, { t, ry, rz, cy: c } = prof(x);
      for (let j = 0; j <= A; j++) {
        const a = j / A * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        pos.push(x, c + ca * Math.max(ry, S * 0.002), sa * Math.max(rz, S * 0.002));
        uv.push(2 * t - 1, ca, sa);
      }
    }
    for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) { const a = i * (A + 1) + j, b = a + A + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const unitG = new THREE.BufferGeometry(); unitG.setAttribute('position', new THREE.Float32BufferAttribute(uv, 3));
    const plain = u => {
      if (s.throat && u.y < -0.35 && u.x > 0.55 && u.x < 0.9) return col(s.throat); // the cutthroat's red slash under the jaw
      if (coho && u.x > 0.82) return tmp.copy(col('#3a3a30')).lerp(col(belly), smooth(0.2, -0.6, u.y)); // dark kype
      return body(u);
    };
    m.add(g, new THREE.Matrix4(), marks ? pixelCoat(marks[0], plain, marks[1], marks[2], marks[3]) : plain, { paintGeo: unitG });
  }
  // a point on the body's surface at x, a fraction dy of the half-height above the midline
  const surf = (x, dy, side, out = 1) => { const p = prof(x); return [x, p.cy + p.ry * dy, side * p.rz * Math.sqrt(Math.max(0, 1 - dy * dy)) * out]; };
  const nose = [x1, prof(x1 - S * 0.01).cy, 0];
  if (s.whiskers) for (const side of [1, -1]) for (const [dy, dz, l] of [[0, 0.05, 1.3], [-0.05, 0.12, 1], [-0.03, 0.08, 0.8]]) // catfish barbels
    m.limb([nose[0] - S * 0.02, nose[1] - S * 0.01, side * S * 0.04], [nose[0] + S * 0.05 * l, nose[1] - S * (0.07 + dy) * l, side * S * dz * 2 * l], S * 0.012, S * 0.004, back, { caps: false });
  if (s.needle) { // a longtom's beak: two long, thin jaws full of needle teeth, the lower one a little longer
    m.limb([x1 - S * 0.03, nose[1] + S * 0.006, 0], [x1 + S * 0.42, nose[1] + S * 0.004, 0], S * 0.02, S * 0.006, shade(back, 0.05));
    m.limb([x1 - S * 0.03, nose[1] - S * 0.01, 0], [x1 + S * 0.47, nose[1] - S * 0.006, 0], S * 0.022, S * 0.006, shade(flank, -0.05));
  }
  if (s.snout) m.limb([x1 - S * 0.04, nose[1] - S * 0.004, 0], [x1 + S * 0.13, nose[1] - S * 0.012, 0], S * 0.032, S * 0.014, shade(s.flank || '#ffffff', -0.04)); // (the hawkfish's long snout)
  const ex = x1 - S * (s.deep ? 0.11 : 0.1);
  { // the gape across the front of the snout, closing off the two mouth lines
    const g = prof(x1 - S * 0.012);
    m.ell([x1 - S * 0.008, g.cy - g.ry * 0.3, 0], [S * 0.014, S * 0.014, g.rz * 1.04], '#3a2e28', { lo: true });
  }
  for (const side of [1, -1]) {
    // a big round eye with a gold rim and a catchlight, set into the side of the head
    const e = surf(ex, cat ? 0.45 : 0.3, side, 0.92);
    m.ell(e, [S * 0.036, S * 0.036, S * 0.016], s.eye || '#e8d890', { lo: true, gloss: 2 });
    m.ell([e[0] + S * 0.003, e[1], e[2] + side * S * 0.01], [S * 0.022, S * 0.022, S * 0.009], '#111010', { lo: true, gloss: 2 });
    m.ell([e[0] + S * 0.01, e[1] + S * 0.01, e[2] + side * S * 0.016], [S * 0.007, S * 0.007, S * 0.004], '#f4f2ea', { lo: true });
    if (s.ear) m.ell(surf(ex - S * 0.1, 0.12, side, 0.97), [S * 0.04, S * 0.035, S * 0.012], s.ear, { lo: true }); // the bluegill's dark "ear"
    // the mouth: a line curving back from the tip of the snout (a long one on bass and snook),
    // a soft darker shade of the face rather than black, over a pale lower lip
    const ml = s.jaw ? x1 - ex + S * 0.02 : cat ? S * 0.09 : S * 0.065, mc = col('#2a1e1a').clone().lerp(col(flank), 0.45);
    let prev = surf(x1 - S * 0.012, -0.28, side, 1.04);
    for (let k = 1; k <= 3; k++) {
      const pt = surf(x1 - S * 0.012 - ml * k / 3, [-0.34, -0.36, -0.29][k - 1], side, 1.04); // dipping, then turning up at the corner
      m.limb(prev, pt, S * 0.01, S * (k === 3 ? 0.005 : 0.009), mc, { caps: k === 3 });
      if (k < 3) { const lo = (p, f) => [p[0], p[1] - S * 0.016, p[2] * f]; m.limb(lo(prev, 0.97), lo(pt, 0.97), S * 0.009, S * 0.008, shade(belly, 0.15), { caps: false }); } // a pale lower lip
      prev = pt;
    }
    const pe = surf(ex - S * 0.12, -0.45, side, 1);
    m.ell([pe[0] - S * 0.03, pe[1], pe[2] + side * S * 0.01], [S * 0.07, S * 0.012, S * 0.03], shade(flank, -0.1), { rot: [side * 0.5, 0.3 * side, -0.4] }); // pectoral
  }
  // the tail that sweeps side to side: forked, or rounded on a catfish
  const tailC = s.tailRed ? '#9a2a22' : s.finColor || shade(s.back || (coho ? back : '#7a8452'), -0.05), tailCol = s.tailColor || tailC;
  const tail = { part: P.TAIL, pivot: [-bx - S * 0.02, cy, 0] };
  const tailShape = s.shark ? sh => { sh.moveTo(0, 0.18); sh.quadraticCurveTo(-0.55, 0.55, -1.15, 1.05); sh.quadraticCurveTo(-0.8, 0.3, -0.62, 0); sh.quadraticCurveTo(-0.7, -0.25, -0.75, -0.5); sh.quadraticCurveTo(-0.4, -0.25, 0, -0.16); sh.lineTo(0, 0.18); }
    : cat ? sh => { sh.moveTo(0, 0.25); sh.quadraticCurveTo(-0.7, 0.6, -0.95, 0); sh.quadraticCurveTo(-0.7, -0.6, 0, -0.25); sh.lineTo(0, 0.25); }
    : s.tailShape === 'round' ? sh => { sh.moveTo(0, 0.2); sh.quadraticCurveTo(-0.95, 0.8, -0.95, 0); sh.quadraticCurveTo(-0.95, -0.8, 0, -0.2); sh.lineTo(0, 0.2); }
    : s.tailShape === 'truncate' ? sh => { sh.moveTo(0, 0.2); sh.lineTo(-0.8, 0.62); sh.quadraticCurveTo(-0.86, 0, -0.8, -0.62); sh.lineTo(0, -0.2); sh.lineTo(0, 0.2); }
    : s.tailShape === 'lunate' ? sh => { sh.moveTo(0, 0.15); sh.quadraticCurveTo(-0.5, 0.4, -1.05, 1.0); sh.quadraticCurveTo(-0.62, 0.25, -0.58, 0); sh.quadraticCurveTo(-0.62, -0.25, -1.05, -1.0); sh.quadraticCurveTo(-0.5, -0.4, 0, -0.15); sh.lineTo(0, 0.15); }
    : sh => { sh.moveTo(0, 0.2); sh.quadraticCurveTo(-0.6, 0.5, -1, 0.7); sh.quadraticCurveTo(-0.72, 0.2, -0.75, 0); sh.quadraticCurveTo(-0.72, -0.2, -1, -0.7); sh.quadraticCurveTo(-0.6, -0.5, 0, -0.2); sh.lineTo(0, 0.2); };
  const tailH = S * 0.2 * (s.deep === 2 ? 1.2 : 1);
  m.add(flat(tailShape), place([-bx - S * 0.06, cy, 0], [0, 0, 0], [S * 0.2, tailH, S * 0.013]), tailCol, tail);
  if (s.finEdge) m.add(flat(tailShape), place([-bx - S * 0.05, cy, 0], [0, 0, 0], [S * 0.23, tailH * 1.14, S * 0.009]), s.finEdge, tail); // a dark rim round it
  const fin = flat(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.2, 0.9, -0.2, 1); sh.quadraticCurveTo(-0.3, 0.4, -0.5, 0); sh.lineTo(0.5, 0); });
  if (cat) {
    // long, low dorsal and anal fins running almost to the tail
    const ribbon = flat(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.45, 1, 0.2, 1); sh.lineTo(-0.45, 1); sh.quadraticCurveTo(-0.5, 0.6, -0.5, 0); sh.lineTo(0.5, 0); });
    m.add(ribbon, place([-S * 0.12, cy + S * 0.1, 0], [0, 0, 0], [bx * 1.25, S * 0.07, S * 0.01]), tailC);
    m.add(ribbon, place([-S * 0.2, cy - S * 0.09, 0], [Math.PI, 0, 0], [bx * 0.95, S * 0.06, S * 0.01]), tailC);
  }
  if (s.beak) { // a parrotfish's beak: two plates of fused teeth at the tip of the snout
    const bp = prof(x1 - S * 0.02);
    m.ell([x1 - S * 0.012, bp.cy + S * 0.012, 0], [S * 0.028, S * 0.016, S * 0.03], s.beak);
    m.ell([x1 - S * 0.016, bp.cy - S * 0.014, 0], [S * 0.024, S * 0.014, S * 0.026], s.beak);
  }
  if (s.hump) { // the humphead wrasse's bulging forehead and thick lips
    const hx = x1 - S * 0.17, hp = prof(hx);
    m.ell([hx, hp.cy + hp.ry * 0.72, 0], [S * 0.13, S * 0.11, hp.rz * 0.9], col(back));
    m.ell([x1 - S * 0.02, prof(x1 - S * 0.02).cy - S * 0.015, 0], [S * 0.03, S * 0.025, S * 0.04], shade(belly, -0.1));
  }
  if (s.streamer) { // a long white streamer trailing back from the Moorish idol's dorsal fin
    let prev = [S * 0.04, cy + S * 0.14 * D, 0];
    for (let k = 1; k <= 6; k++) { // rising from the fin, then arching back and drooping, like a pennant
      const t = k / 6, pt = [S * (0.04 - t * 0.55), cy + S * (0.14 + Math.sin(t * Math.PI * 0.8) * 0.13) * D, 0];
      m.limb(prev, pt, S * (0.016 - t * 0.01), S * (0.016 - t * 0.012), '#f4f2ea', { caps: k === 6 }); prev = pt;
    }
  }
  if (cat) { /* (its long fins are drawn above) */ } else if (s.shark) {
    // a tall, swept dorsal and big stiff pectorals, white-tipped, and a tail with a long upper lobe
    const tipped = (base, tip) => u => (u.y > 0.62 ? col(tip) : col(base));
    const dorsal = flat(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.25, 0.7, -0.1, 1); sh.quadraticCurveTo(-0.15, 0.45, -0.5, 0); sh.lineTo(0.5, 0); });
    m.add(dorsal, place([S * 0.02, cy + S * 0.12, 0], [0, 0, 0], [S * 0.18, S * 0.17, S * 0.012]), tipped(tailC, s.finTip || '#f4f4f0'));
    m.add(fin, place([-bx * 0.62, cy + S * 0.08, 0], [0, 0, 0], [S * 0.07, S * 0.06, S * 0.01]), tipped(tailC, s.finTip || '#f4f4f0'));
    for (const side of [1, -1]) m.add(dorsal, place([S * 0.12, cy - S * 0.07, side * S * 0.07], [side * 1.25, 0, -0.35], [S * 0.16, S * 0.13, S * 0.012]), tailC);
  } else if (s.spiny) {
    // a long dorsal: spiny in front, softer behind
    const spines = flat(sh => { sh.moveTo(0.5, 0); for (let k = 0; k <= 8; k++) { const x = 0.45 - k * 0.11; sh.lineTo(x + 0.04, 0.45 + 0.5 * Math.sin((k + 1) / 10 * Math.PI) ** 0.6); sh.lineTo(x - 0.03, 0.4 + 0.3 * Math.sin((k + 1) / 10 * Math.PI)); } sh.quadraticCurveTo(-0.5, 0.5, -0.55, 0); sh.lineTo(0.5, 0); }, 'xy', 3);
    m.add(spines, place([-S * 0.04 * X, cy + S * 0.12 * D * 0.92, 0], [0, 0, 0], [bx * 0.95, S * 0.12, S * 0.012]), tailC);
    if (s.finEdge) m.add(spines, place([-S * 0.04 * X, cy + S * 0.12 * D * 0.92 - S * 0.006, 0], [0, 0, 0], [bx * 1.0, S * 0.135, S * 0.008]), s.finEdge);
    if (s.longAnal) { // a long, low anal fin, mirroring the dorsal
      const ribbon = flat(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.35, 1, 0.1, 1); sh.lineTo(-0.4, 1); sh.quadraticCurveTo(-0.5, 0.6, -0.5, 0); sh.lineTo(0.5, 0); });
      m.add(ribbon, place([-bx * 0.42, cy - S * 0.12 * D * 0.86, 0], [Math.PI, 0, 0], [bx * 0.85, S * 0.09, S * 0.011]), s.analColor || tailC);
    } else m.add(fin, place([-bx * 0.5, cy - S * 0.11 * D * 0.9, 0], [Math.PI, 0, 0], [S * 0.11, S * 0.08, S * 0.01]), shade(flank, -0.15));
  } else if (s.rearFins || s.needle) {
    // the arapaima's (and a longtom's) dorsal and anal fins sit far back, just in front of the tail, like a paddle
    const ribbon = flat(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.3, 0.9, 0.0, 1); sh.quadraticCurveTo(-0.45, 0.9, -0.5, 0); sh.lineTo(0.5, 0); });
    const at = s.needle ? -bx * 0.84 : -bx * 0.72, len = bx * (s.needle ? 0.2 : 0.5), up = s.needle ? 0.045 : 0.08;
    m.add(ribbon, place([at, cy + S * up, 0], [0, 0, 0], [len, S * 0.09, S * 0.011]), tailC);
    m.add(ribbon, place([at, cy - S * up, 0], [Math.PI, 0, 0], [len, S * 0.08, S * 0.011]), tailC);
  } else {
    // dorsal, adipose and anal fins
    m.add(fin, place([S * 0.02, cy + S * 0.12 * D, 0], [0, 0, 0], [S * 0.13, S * 0.1, S * 0.01]), tailC);
    m.ell([-bx * 0.68, cy + S * 0.075, 0], [S * 0.035, S * 0.025, S * 0.008], tailC, { lo: true });
    m.add(fin, place([-bx * 0.5, cy - S * 0.11 * D, 0], [Math.PI, 0, 0], [S * 0.09, S * 0.07, S * 0.01]), shade(flank, -0.15));
  }
}

// A smooth fish body lofted along x: deepest at tm (0 = tail end, 1 = snout), easing off to a thin
// tail stock behind and a snout in front (powF: how pointed, drop: how far the snout dips). Paint
// gets (u, p): u.x runs -1 tail .. 1 nose, u.y is up (+1) to down (-1) round the body; p is the
// position itself.
function finBody(m, { x0, x1, tm, cy, ry, rz, ryEnd = 0.1, rzEnd = 0.25, powF = 1.2, powB = 1.4, drop = 0, wide = 1 }, paint) {
  const R = 52, A = 24, pos = [], uv = [], idx = [];
  for (let i = 0; i <= R; i++) {
    const t = i / R, x = x0 + (x1 - x0) * t, d = Math.abs(t - tm) / (t < tm ? tm : 1 - tm);
    const k = Math.pow(Math.max(0, 1 - Math.pow(d, t > tm ? powF : powB)), 0.85);
    // (the tail end stays open into the tail stock, at ryEnd; the snout closes off in a rounded tip)
    const front = t > tm, yy = ry * (front ? k : ryEnd + (1 - ryEnd) * k), zz = rz * (front ? Math.pow(Math.max(0, 1 - Math.pow(d, powF)), 0.6) : rzEnd + (1 - rzEnd) * Math.pow(Math.max(0, 1 - d * d), 0.5)) * (front ? 1 + (wide - 1) * d : 1);
    const c = cy - drop * (t > tm ? smooth(0.3, 1, d) : 0);
    for (let j = 0; j <= A; j++) { const a = j / A * Math.PI * 2; pos.push(x, c + Math.cos(a) * yy, Math.sin(a) * zz); uv.push(2 * t - 1, Math.cos(a), Math.sin(a)); }
  }
  for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) { const a = i * (A + 1) + j, b = a + A + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const unitG = new THREE.BufferGeometry(); unitG.setAttribute('position', new THREE.Float32BufferAttribute(uv, 3));
  m.add(g, new THREE.Matrix4(), paint, { paintGeo: unitG });
}

// Threadfin butterflyfish: a round, flat disc, white with fine dark lines running diagonally up
// the front of the flank and down across the back, a black bar through the eye, the rear of the
// body and the fins bright yellow, a black eyespot near the back of the dorsal fin with a thread
// trailing from it, and a short, pointed snout for picking at coral.
function butterflyfish(m, s) {
  const S = s.size, cy = S * 0.32;
  const white = col('#f6f4ee'), yellow = col('#f2c430'), black = col('#18161a'), line = col('#7a7268');
  const coat = (u, p) => {
    const bx = p.x / S, by = (p.y - cy) / S;
    if (bx > 0.19 && bx < 0.255 && by > -0.2) return black;                  // the bar through the eye
    if (bx < -0.19 + by * 0.25) return yellow;                               // the yellow back end
    if (bx < 0.19) {
      // chevrons: lines slanting up and back on the front of the flank, down and back behind
      const q = by > 0.02 - bx * 0.3 ? bx + by * 1.1 : bx - by * 1.1;
      if (Math.abs(Math.sin(q * 32)) > 0.8) return line;
    }
    return white;
  };
  // (the same, drawn per pixel: coatButterfly)
  finBody(m, { x0: -S * 0.36, x1: S * 0.36, tm: 0.47, cy, ry: S * 0.28, rz: S * 0.05, ryEnd: 0.12, powF: 1.05, drop: S * 0.04 },
    pixelCoat('butterfly', coat, [S, cy, white.r, white.g, white.b, yellow.r, yellow.g, yellow.b], black, line));
  m.ell([S * 0.36, cy - S * 0.04, 0], [S * 0.01, S * 0.012, S * 0.012], '#3a2e2a', { lo: true }); // a tiny mouth
  for (const side of [1, -1]) {
    m.ell([S * 0.22, cy + S * 0.05, side * S * 0.042], [S * 0.03, S * 0.03, S * 0.01], '#c8b880', { lo: true });
    m.ell([S * 0.222, cy + S * 0.05, side * S * 0.048], [S * 0.019, S * 0.019, S * 0.007], '#101010', { lo: true, gloss: 2 });
    m.ell([S * 0.228, cy + S * 0.058, side * S * 0.052], [S * 0.006, S * 0.006, S * 0.003], '#f4f2ea', { lo: true });
    m.ell([S * 0.08, cy - S * 0.04, side * S * 0.046], [S * 0.05, S * 0.02, S * 0.008], '#f4e4a0', { rot: [0, 0, -0.3] }); // pectoral fin
  }
  const fin = (draw, color, thick) => m.add(flat(draw, 'xy', 10), place([0, cy, 0], [0, 0, 0], [S, S, S * thick]), color);
  // a long dorsal from the forehead to the tail stock: white in front, yellow behind, with the black spot
  fin(sh => { sh.moveTo(0.14, 0.2); sh.quadraticCurveTo(0.02, 0.36, -0.16, 0.36); sh.quadraticCurveTo(-0.3, 0.34, -0.32, 0.14); sh.lineTo(-0.1, 0.24); sh.lineTo(0.14, 0.2); }, yellow, 0.009);
  fin(sh => { sh.moveTo(0.14, 0.2); sh.quadraticCurveTo(0.06, 0.32, -0.04, 0.34); sh.lineTo(-0.04, 0.26); sh.lineTo(0.14, 0.2); }, white, 0.012);
  for (const side of [1, -1]) {
    m.ell([-S * 0.22, cy + S * 0.27, side * S * 0.006], [S * 0.02, S * 0.02, S * 0.003], '#141210', { lo: true }); // the eyespot
    m.ell([-S * 0.22, cy + S * 0.27, side * S * 0.004], [S * 0.028, S * 0.028, S * 0.003], '#f6f2e6', { lo: true });
  }
  let prev = [-S * 0.24, cy + S * 0.34, 0]; // the thread
  for (let k = 1; k <= 4; k++) { const t = k / 4, pt = [-S * (0.24 + t * 0.2), cy + S * (0.34 - t * t * 0.08), 0]; m.limb(prev, pt, S * 0.008, S * 0.006, yellow, { caps: k === 4, part: P.TAIL, pivot: [0, cy, 0] }); prev = pt; }
  fin(sh => { sh.moveTo(0.1, -0.2); sh.quadraticCurveTo(-0.04, -0.34, -0.2, -0.3); sh.quadraticCurveTo(-0.3, -0.24, -0.3, -0.12); sh.lineTo(0.1, -0.2); }, yellow, 0.009);
  // a short, square-ended tail, yellow with a clear edge
  const tail = { part: P.TAIL, pivot: [-S * 0.35, cy, 0] };
  m.add(flat(sh => { sh.moveTo(0, 0.07); sh.lineTo(-0.13, 0.13); sh.quadraticCurveTo(-0.15, 0, -0.13, -0.13); sh.lineTo(0, -0.07); sh.lineTo(0, 0.07); }), place([-S * 0.35, cy, 0], [0, 0, 0], [S, S, S * 0.009]), yellow, tail);
}

// Whitetip reef shark: a long, slim torpedo, grey above and pale below, with a blunt, flattened
// snout, catlike eyes, five gill slits, a tall swept first dorsal fin and the upper lobe of the
// tail tipped bright white, broad pectoral fins, and a tail whose upper lobe is much the longer.
function shark(m, s) {
  const S = s.size, cy = S * 0.16, top = col(s.back || '#7a8088'), mid = col(s.flank || '#949aa2'), belly = col(s.belly || '#e4e6e8'), tip = col(s.finTip || '#f6f6f2');
  const plain = u => u.y > 0.15 ? tmp.copy(mid).lerp(top, smooth(0.15, 0.7, u.y)) : tmp.copy(belly).lerp(mid, smooth(-0.55, 0.05, u.y));
  // (a blacktip's pale band, reaching forward along the flank from the belly: coatFish, per pixel)
  const skin = s.flankBand ? pixelCoat('fish', plain, [8], belly) : plain;
  finBody(m, { x0: -S * 0.44, x1: S * 0.5, tm: 0.42, cy, ry: S * 0.1, rz: S * 0.1, ryEnd: 0.18, rzEnd: 0.3, powF: 2.2, powB: 1.6, wide: 1.1 }, skin); // (a broad head and a blunt, rounded snout)
  // eyes, gill slits, and a mouth tucked under the snout
  m.ell([S * 0.38, cy - S * 0.045, 0], [S * 0.035, S * 0.006, S * 0.04], '#8a8e94', { lo: true });
  for (const side of [1, -1]) {
    m.ell([S * 0.37, cy + S * 0.02, side * S * 0.055], [S * 0.016, S * 0.011, S * 0.007], '#1a1c20', { lo: true, gloss: 2 });
    m.ell([S * 0.375, cy + S * 0.024, side * S * 0.058], [S * 0.005, S * 0.004, S * 0.002], '#d8dad8', { lo: true });
    for (let k = 0; k < 5; k++) { const x = S * (0.25 - k * 0.022), z = side * S * 0.088; m.limb([x, cy + S * 0.035, z], [x - S * 0.008, cy - S * 0.035, z], S * 0.004, S * 0.004, '#4a5058', { caps: false }); }
  }
  const fin = (draw, at, scale, color, rot = [0, 0, 0], o = {}) => m.add(flat(draw, 'xy', 8), place(at, rot, scale), color, o);
  // first dorsal: tall and swept back, its tip white
  fin(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.2, 0.55, -0.15, 1); sh.quadraticCurveTo(-0.15, 0.4, -0.5, 0); sh.lineTo(0.5, 0); }, [S * 0.04, cy + S * 0.085, 0], [S * 0.2, S * 0.16, S * 0.012], top);
  fin(sh => { sh.moveTo(0.04, 0.72); sh.quadraticCurveTo(-0.08, 0.86, -0.15, 1); sh.quadraticCurveTo(-0.15, 0.82, -0.18, 0.72); sh.lineTo(0.04, 0.72); }, [S * 0.04, cy + S * 0.085, 0], [S * 0.2, S * 0.16, S * 0.016], tip);
  fin(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.1, 0.6, -0.2, 1); sh.quadraticCurveTo(-0.2, 0.4, -0.5, 0); sh.lineTo(0.5, 0); }, [-S * 0.27, cy + S * 0.05, 0], [S * 0.07, S * 0.05, S * 0.01], top); // second dorsal
  fin(sh => { sh.moveTo(0.5, 0); sh.quadraticCurveTo(0.1, -0.6, -0.2, -1); sh.quadraticCurveTo(-0.2, -0.4, -0.5, 0); sh.lineTo(0.5, 0); }, [-S * 0.26, cy - S * 0.05, 0], [S * 0.06, S * 0.045, S * 0.01], mid); // anal
  // pectoral fins: broad, swept back and angled down
  for (const side of [1, -1]) {
    const pec = flat(sh => { sh.moveTo(0.3, 0); sh.quadraticCurveTo(0.1, 0.6 * side, -0.45, 1 * side); sh.quadraticCurveTo(-0.15, 0.4 * side, -0.2, 0); sh.lineTo(0.3, 0); }, 'xz', 8);
    // (a blacktip's pectorals are dark at their outer ends: the shape's far edge, |z| near 1)
    m.add(pec, place([S * 0.2, cy - S * 0.06, side * S * 0.07], [side * 0.35, 0, 0], [S * 0.2, S * 0.012, S * 0.16]), u => (s.finTip && Math.abs(u.z) > 0.74 ? tip : u.y > 0 ? top : belly));
    m.add(pec, place([-S * 0.12, cy - S * 0.06, side * S * 0.04], [side * 0.3, 0, 0], [S * 0.08, S * 0.01, S * 0.06]), mid); // pelvic
  }
  // the tail: the body itself carries on, tapering and bending up into the long upper lobe (white
  // at the tip), with a narrow fin along its underside and a small lower lobe; not a flat paddle
  const tail = { part: P.TAIL, pivot: [-S * 0.42, cy, 0] };
  const spine = [[-0.42, 0], [-0.5, 0.035], [-0.58, 0.08], [-0.66, 0.13], [-0.72, 0.17]];
  for (let k = 1; k < spine.length; k++) {
    const [x0, y0] = spine[k - 1], [x1, y1] = spine[k], r0 = S * (0.034 - (k - 1) * 0.007), r1 = S * Math.max(0.005, 0.034 - k * 0.007);
    m.limb([S * x0, cy + S * y0, 0], [S * x1, cy + S * y1, 0], r0, r1, k === spine.length - 1 ? tip : top, { ...tail, caps: k === spine.length - 1 });
  }
  m.add(flat(sh => { sh.moveTo(-0.44, 0.0); sh.lineTo(-0.66, 0.125); sh.quadraticCurveTo(-0.645, 0.09, -0.6, 0.075); sh.quadraticCurveTo(-0.56, 0.04, -0.52, -0.005); sh.lineTo(-0.44, 0.0); }, 'xy', 6),
    place([0, cy, 0], [0, 0, 0], [S, S, S * 0.012]), top, tail);
  m.add(flat(sh => { sh.moveTo(-0.43, -0.015); sh.quadraticCurveTo(-0.5, -0.05, -0.57, -0.11); sh.quadraticCurveTo(-0.55, -0.05, -0.53, -0.01); sh.lineTo(-0.43, -0.015); }, 'xy', 6),
    place([0, cy, 0], [0, 0, 0], [S, S, S * 0.012]), top, tail); // the small lower lobe
  if (s.finTip) { // a blacktip's lower tail lobe is tipped too
    m.add(flat(sh => { sh.moveTo(-0.535, -0.075); sh.quadraticCurveTo(-0.55, -0.09, -0.57, -0.11); sh.quadraticCurveTo(-0.555, -0.08, -0.548, -0.06); sh.lineTo(-0.535, -0.075); }, 'xy', 4),
      place([0, cy, S * 0.001], [0, 0, 0], [S, S, S * 0.014]), tip, tail);
  }
}

// Moorish idol: a tall, flat disc of a fish, white and yellow with two broad black bands (the
// first through the eye), a long tube of a snout with an orange saddle on it, a towering dorsal fin
// that sweeps back into a long white streamer, a tall swept-back anal fin, and a black tail with a
// white edge. Seen side-on it's almost a triangle.
function idol(m, s) {
  const S = s.size, cy = S * 0.32;
  const white = col('#f6f3ea'), yellow = col('#f2c838'), black = col('#16151a'), orange = col('#e8862e');
  const coat = (u, p) => {
    const bx = p.x / S, by = (p.y - cy) / S;
    if (bx > 0.25 && bx < 0.32 && by > -0.01 + (bx - 0.25) * 0.6 && Math.abs(u.z) < 0.75) return orange; // the orange saddle across the top of the snout
    if (bx > 0.07 && bx < 0.21) return black;                         // the band through the eye
    if (bx > -0.27 && bx < -0.12) return black;                       // the band at the back
    if (bx <= -0.27) return yellow;                                   // the tail stock
    if (bx <= 0.07 && bx >= -0.12) return by < -0.06 - (bx + 0.12) * 0.5 ? yellow : white; // white, with yellow low at the back
    return white;                                                     // the face and snout
  };
  // body: one tall, thin, diamond-shaped disc (deepest just behind the eye), narrowing to the tail
  // stock behind, and in front sloping steeply down into a short, slightly down-turned snout
  {
    const R = 48, A = 24, x0 = -S * 0.36, x1 = S * 0.38, tm = 0.55, pos = [], idx = [];
    for (let i = 0; i <= R; i++) {
      const t = i / R, x = x0 + (x1 - x0) * t, d = Math.abs(t - tm) / (t < tm ? tm : 1 - tm);
      const front = t > tm ? smooth(0.3, 1, d) : 0; // (the forehead drops away toward the snout)
      const ry = S * (0.035 + 0.28 * Math.pow(Math.max(0, 1 - Math.pow(d, t > tm ? 1.1 : 1.4)), 0.85)), rz = S * (0.014 + 0.045 * Math.pow(Math.max(0, 1 - d * d), 0.5));
      const c = cy - S * 0.07 * front;
      for (let j = 0; j <= A; j++) { const a = j / A * Math.PI * 2; pos.push(x, c + Math.cos(a) * ry, Math.sin(a) * Math.max(rz, S * 0.018)); }
    }
    for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) { const a = i * (A + 1) + j, b = a + A + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    m.add(g, new THREE.Matrix4(), pixelCoat('idol', coat, [S, cy, white.r, white.g, white.b, orange.r, orange.g, orange.b], black, yellow)); // (the same, per pixel: coatIdol)
  }
  m.ell([S * 0.38, cy - S * 0.07, 0], [S * 0.012, S * 0.016, S * 0.018], '#3a2e2a', { lo: true }); // a tiny mouth
  // eyes in the black band, with a pale ring so they still show
  for (const side of [1, -1]) {
    m.ell([S * 0.17, cy + S * 0.06, side * S * 0.05], [S * 0.035, S * 0.035, S * 0.012], '#c8b880', { lo: true });
    m.ell([S * 0.172, cy + S * 0.06, side * S * 0.058], [S * 0.022, S * 0.022, S * 0.008], '#101010', { lo: true, gloss: 2 });
    m.ell([S * 0.18, cy + S * 0.07, side * S * 0.063], [S * 0.007, S * 0.007, S * 0.004], '#f4f2ea', { lo: true });
    m.ell([S * 0.06, cy - S * 0.03, side * S * 0.056], [S * 0.06, S * 0.025, S * 0.01], '#f4dc80', { rot: [0, 0, -0.3] }); // pectoral fin
  }
  // fins: flat, curved shapes, each in parts so the black band runs on into them
  const fin = (draw, color, thick) => m.add(flat(draw, 'xy', 10), place([0, cy, 0], [0, 0, 0], [S, S, S * thick]), color);
  // the dorsal: a sickle swept well back, black at its leading edge, white, with a yellow trailing edge
  const tipD = [-0.12, 0.56];
  fin(sh => { sh.moveTo(0.17, 0.17); sh.quadraticCurveTo(0.12, 0.44, tipD[0], tipD[1]); sh.quadraticCurveTo(0.02, 0.36, 0.07, 0.24); sh.lineTo(0.17, 0.17); }, black, 0.012);
  fin(sh => { sh.moveTo(0.07, 0.24); sh.quadraticCurveTo(0.02, 0.36, tipD[0], tipD[1]); sh.quadraticCurveTo(-0.1, 0.32, -0.2, 0.17); sh.lineTo(0.07, 0.24); }, white, 0.011);
  fin(sh => { sh.moveTo(-0.2, 0.17); sh.quadraticCurveTo(-0.1, 0.32, tipD[0], tipD[1]); sh.quadraticCurveTo(-0.15, 0.32, -0.25, 0.14); sh.lineTo(-0.2, 0.17); }, yellow, 0.009);
  // ...drawn out into a white streamer trailing back over the tail
  let prev = [S * tipD[0], cy + S * tipD[1], 0];
  for (let k = 1; k <= 8; k++) {
    const t = k / 8, pt = [S * (tipD[0] - t * 0.5), cy + S * (tipD[1] + Math.sin(t * Math.PI * 0.6) * 0.03 - t * t * 0.18), 0];
    m.limb(prev, pt, S * (0.014 - t * 0.008), S * (0.014 - t * 0.01), '#f8f6f0', { caps: k === 8, part: P.TAIL, pivot: [0, cy, 0] }); prev = pt;
  }
  // the anal fin: the dorsal's mirror below, swept back
  const tipA = [-0.14, -0.47];
  fin(sh => { sh.moveTo(0.14, -0.17); sh.quadraticCurveTo(0.08, -0.38, tipA[0], tipA[1]); sh.quadraticCurveTo(0.0, -0.32, 0.05, -0.23); sh.lineTo(0.14, -0.17); }, black, 0.012);
  fin(sh => { sh.moveTo(0.05, -0.23); sh.quadraticCurveTo(0.0, -0.32, tipA[0], tipA[1]); sh.quadraticCurveTo(-0.12, -0.28, -0.22, -0.14); sh.lineTo(0.05, -0.23); }, white, 0.011);
  for (const side of [1, -1]) m.limb([S * 0.1, cy - S * 0.22, side * S * 0.025], [S * 0.02, cy - S * 0.34, side * S * 0.04], S * 0.025, S * 0.008, black); // pelvic fins, swept back
  // the tail: a black fan with a white trailing edge
  const tail = { part: P.TAIL, pivot: [-S * 0.34, cy, 0] };
  m.add(flat(sh => { sh.moveTo(0, 0.12); sh.lineTo(-0.2, 0.2); sh.quadraticCurveTo(-0.17, 0, -0.2, -0.2); sh.lineTo(0, -0.12); sh.lineTo(0, 0.12); }), place([-S * 0.34, cy, 0], [0, 0, 0], [S, S, S * 0.008]), white, tail);
  m.add(flat(sh => { sh.moveTo(0, 0.1); sh.lineTo(-0.16, 0.16); sh.quadraticCurveTo(-0.13, 0, -0.16, -0.16); sh.lineTo(0, -0.1); sh.lineTo(0, 0.1); }), place([-S * 0.34, cy, 0], [0, 0, 0], [S, S, S * 0.013]), black, tail);
}

// Spectacled caiman: long and low, with an armoured back, a bony ridge between the eyes,
// splayed legs and a heavy tail that sweeps as it swims.
// False gharial (gharial): a very long, slender, even snout, and dark crossbands over the back and tail.
// Crocodiles (croc): a narrower, V-shaped snout than the caiman's, with the teeth showing.
function caiman(m, s) {
  const L = s.len, cy = L * 0.07, gh = !!s.gharial;
  // rows of scutes over a pale belly, and the gharial's dark crossbands (in model space, so they run
  // on across the body and tail; only on the upper side), drawn per pixel: coatCaiman
  const belly = col(s.belly), plain = u => u.y < -0.35 ? belly : tmp.copy(col(s.color)).lerp(belly, smooth(0.1, -0.35, u.y) * 0.6);
  const hide = (tail, base) => pixelCoat('caiman', base, [L, cy, gh ? 1 : 0, tail ? 1 : 0, belly.r, belly.g, belly.b], shade(s.color, -0.3), shade(s.color, -0.5));
  loftBody(m, { x0: -L * 0.3, x1: L * 0.24, cy0: cy, cy1: cy, ry0: L * 0.075, ry1: L * 0.08, rz0: L * 0.11, rz1: L * 0.13, fine: true }, hide(false, plain));
  const neck = [L * 0.22, cy, 0], hd = { part: P.HEAD, pivot: neck };
  // (pale below the jaw line; on the false gharial's thin snout only right underneath, since its
  // distant model squeezes the snout's top and underside to about the same size: animal-lod-check)
  const head = u => tmp.copy(col(s.color)).lerp(belly, (gh ? smooth(-0.3, -0.5, u.y) : smooth(-0.12, -0.3, u.y)) * 0.8);
  // The head is one surface from the neck to the tip of the snout: deep at the jaw muscles, then
  // tapering forward, flat on top and below but never a paddle. A caiman's snout is a broad U, a
  // crocodile's (croc) a narrower V with a little swelling near the tip, the false gharial's a long
  // slender rod off a broad skull, spatulate at the end.
  // [x, half-width, top above the axis, depth below it], in body lengths
  const croc = !!s.croc, K = gh
    ? [[0.19, 0.06, 0.035, 0.04], [0.25, 0.078, 0.05, 0.045], [0.31, 0.07, 0.045, 0.036], [0.36, 0.04, 0.029, 0.024], [0.42, 0.022, 0.019, 0.016],
      [0.6, 0.019, 0.016, 0.014], [0.76, 0.02, 0.016, 0.014], [0.8, 0.028, 0.02, 0.015], [0.82, 0.028, 0.021, 0.015]]
    : croc
      ? [[0.19, 0.06, 0.035, 0.04], [0.25, 0.082, 0.052, 0.046], [0.31, 0.072, 0.046, 0.038], [0.37, 0.054, 0.034, 0.03], [0.44, 0.037, 0.026, 0.024],
        [0.5, 0.029, 0.022, 0.02], [0.535, 0.031, 0.025, 0.019], [0.56, 0.029, 0.025, 0.018]]
      : [[0.19, 0.06, 0.035, 0.04], [0.25, 0.086, 0.052, 0.046], [0.31, 0.082, 0.048, 0.039], [0.38, 0.07, 0.034, 0.031], [0.45, 0.062, 0.027, 0.025],
        [0.51, 0.055, 0.025, 0.022], [0.55, 0.05, 0.026, 0.02]];
  const x0 = K[0][0], x1 = K[K.length - 1][0], tipR = croc || gh ? 0.03 : 0.05, mouth = -0.15; // (the jaw line, a little below the side)
  const prof = x => { // half-width, top, depth at x (a smooth curve through the keys, rounded off at both ends)
    let k = 0; while (k < K.length - 2 && K[k + 1][0] < x) k++;
    const a = K[k], b = K[k + 1], h = b[0] - a[0], t = Math.min(1, Math.max(0, (x - a[0]) / h));
    const slope = (i, c) => { const p = K[Math.max(0, i - 1)], q = K[Math.min(K.length - 1, i + 1)]; return (q[c] - p[c]) / (q[0] - p[0]) * h; };
    const v = [1, 2, 3].map(c => (2 * t ** 3 - 3 * t * t + 1) * a[c] + (t ** 3 - 2 * t * t + t) * slope(k, c) + (3 * t * t - 2 * t ** 3) * b[c] + (t ** 3 - t * t) * slope(k + 1, c));
    const q = Math.max((x - (x1 - tipR)) / tipR, ((x0 + 0.03) - x) / 0.03, 0), f = Math.sqrt(Math.max(0, 1 - q * q));
    return [v[0] * f, v[1] * Math.sqrt(f), v[2] * Math.sqrt(f)];
  };
  // a point on the head at x, round from the top (c = cos, sn = sin of the angle): squared-off,
  // flatter on top than below, pinched a little along the jaw line
  const at = (x, c, sn) => {
    const [w, top, low] = prof(x), sq = (v, p) => Math.sign(v) * Math.abs(v) ** p;
    const pinch = 1 - 0.07 * Math.exp(-(((c - mouth) / 0.1) ** 2));
    return [x * L, cy + (c > 0 ? top * sq(c, 0.6) : low * sq(c, 0.8)) * L, sq(sn, c > 0 ? 0.6 : 0.8) * w * pinch * L];
  };
  {
    const R = m.seg(gh ? 72 : 40), A = m.seg(22), pos = [], unit = [], idx = [];
    for (let i = 0; i <= R; i++) for (let j = 0; j <= A; j++) {
      const x = x0 + (x1 - x0) * i / R, a = j / A * Math.PI * 2;
      pos.push(...at(x, Math.cos(a), Math.sin(a))); unit.push(2 * i / R - 1, Math.cos(a), Math.sin(a));
    }
    for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) { const a = i * (A + 1) + j, b = a + A + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry(), paintGeo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    paintGeo.setAttribute('position', new THREE.Float32BufferAttribute(unit, 3));
    m.add(g, new THREE.Matrix4(), head, { ...hd, paintGeo }); g.dispose(); paintGeo.dispose();
  }
  const dark = shade(s.color, -0.3), ms = Math.sin(Math.acos(mouth)), eyeX = 0.3, eyeZ = gh ? 0.03 : 0.033;
  // the nostrils, raised on a knob at the tip of the snout
  const nx = x1 - (gh ? 0.022 : 0.02), nTop = prof(nx)[1];
  m.ell([nx * L, cy + nTop * L, 0], [L * 0.016, L * 0.008, L * 0.017], head, hd);
  for (const side of [1, -1]) m.ell([(nx + 0.003) * L, cy + (nTop + 0.007) * L, side * L * 0.006], [L * 0.004, L * 0.0015, L * 0.0025], dark, { ...hd, lo: true });
  if (!gh && !croc) m.ell([L * 0.335, cy + L * 0.043, 0], [L * 0.01, L * 0.005, L * 0.034], shade(s.color, -0.1), hd); // the "spectacles" ridge between the eyes
  for (const side of [1, -1]) {
    // the eyes, raised in bony turrets on top of the skull, looking out and up, with slit pupils
    m.ell([eyeX * L, cy + L * 0.042, side * eyeZ * L], [L * 0.026, L * 0.013, L * 0.017], head, hd);
    const eye = [(eyeX + 0.004) * L, cy + L * 0.053, side * (eyeZ + 0.004) * L];
    m.ell(eye, [L * 0.011, L * 0.009, L * 0.01], '#c8a030', { ...hd, lo: true, gloss: 2 });
    m.ell([eye[0] + L * 0.003, eye[1] + L * 0.003, eye[2] + side * L * 0.008], [L * 0.0016, L * 0.006, L * 0.002], '#15130c', { ...hd, lo: true, gloss: 2 });
    // the jaw line from the tip back under the eye, rising a little at the gape
    const jaw = [x1 - 0.012, x1 - 0.06, 0.42, 0.34, 0.28, 0.25].filter(x => x < x1 - 0.005).map((x, i, all) => {
      const p = at(x, mouth, side * ms); return [p[0], p[1] + (i === all.length - 1 ? L * 0.008 : 0), p[2] * 1.01];
    });
    jaw.sort((a, b) => b[0] - a[0]);
    tube(m, jaw, jaw.map(() => L * 0.0022), dark, { ...hd, seg: 5, sub: 3, capRings: 1 });
    // teeth along the upper jaw (more, and more of them showing, on the crocodiles and the gharial),
    // and a crocodile's big fourth lower tooth, standing up outside the upper jaw near the front
    const n = gh ? 12 : croc ? 8 : 5, from = x1 - 0.015, to = gh ? 0.36 : 0.36;
    for (let k = 0; k < n; k++) {
      const x = from - (from - to) * (k + 0.5) / n, p = at(x, mouth, side * ms), r = L * (gh ? 0.002 : 0.0028);
      m.limb([p[0], p[1] + r, p[2] * 1.02], [p[0], p[1] - L * (gh ? 0.008 : 0.009), p[2] * 1.04], r, r * 0.2, '#e4dcc0', { ...hd, seg: 4, caps: false });
    }
    if (croc) { const p = at(x1 - 0.05, mouth, side * ms); m.limb([p[0], p[1] - L * 0.004, p[2] * 1.03], [p[0], p[1] + L * 0.012, p[2] * 1.06], L * 0.0035, L * 0.0007, '#e4dcc0', { ...hd, seg: 4, caps: false }); }
  }
  m.eyeSpot = [(eyeX + 0.004) * L, cy + L * 0.053, (eyeZ + 0.004) * L]; // (eyes)
  // the tail starts well inside the haunches (where the body is still thick) so there's no pinch
  const base = [-L * 0.17, cy, 0], to = { part: P.TAIL, pivot: [-L * 0.24, cy, 0] };
  for (let k = 0; k < 7; k++) {
    const t0 = k / 7, t1 = (k + 1) / 7, p = t => [base[0] - L * 0.6 * t, cy - L * 0.012 * t, 0];
    const r = t => L * (0.074 - t * 0.064);
    m.limb(p(t0), p(t1), r(t0), r(t1), hide(true, solid(s.color)), { ...to, caps: k === 0 || k === 6 });
    if (t0 > 0.1) for (const side of [1, -1]) m.ell([p(t0 + 0.07)[0], cy + r(t0) * 0.92, side * L * 0.02 * (1 - t0 * 0.9)], [L * 0.016, L * 0.006, L * 0.007], shade(s.color, -0.25), { ...to, lo: true });
  }
  for (const [x, side, part] of [[L * 0.16, 1, P.LEG_FL], [L * 0.16, -1, P.LEG_FR], [-L * 0.2, 1, P.LEG_BL], [-L * 0.2, -1, P.LEG_BR]]) {
    const hip = [x, cy - L * 0.01, side * L * 0.09], el = [x + L * 0.02, cy - L * 0.02, side * L * 0.17];
    m.limb(hip, el, L * 0.035, L * 0.028, s.color, { part, pivot: hip });
    m.limb(el, [x + L * 0.05, L * 0.008, side * L * 0.19], L * 0.028, L * 0.022, s.color, { part, pivot: hip });
    m.ell([x + L * 0.07, L * 0.008, side * L * 0.19], [L * 0.03, L * 0.008, L * 0.025], s.color, { part, pivot: hip, lo: true });
  }
}

// Boto, the Amazon river dolphin: pink and flexible, with a long slender beak, a bulging
// melon, a low ridge instead of a tall dorsal fin, and broad paddle flippers.
function dolphin(m, s) {
  const L = s.len || s.size, cy = L * 0.13;
  const back = col(shade(s.color, -0.12)), belly = col(s.belly);
  const skin = u => tmp.copy(back).lerp(belly, smooth(0.35, -0.5, u.y));
  // Axial rings let the throat and jaw follow their own smooth outline. A tube's
  // tilted frames pinched the underside where the melon dropped into the beak.
  // x, upper surface, lower surface, half-width, all in body-length units.
  const profile = [[-0.485, 0.14, 0.14, 0], [-0.46, 0.155, 0.125, 0.023],
    [-0.34, 0.187, 0.097, 0.05], [-0.15, 0.236, 0.036, 0.09], [0.1, 0.25, 0.01, 0.11],
    [0.25, 0.243, 0.026, 0.095], [0.32, 0.242, 0.034, 0.084], [0.36, 0.21, 0.038, 0.062],
    [0.4, 0.143, 0.043, 0.036], [0.445, 0.11, 0.047, 0.028], [0.52, 0.097, 0.054, 0.023],
    [0.605, 0.087, 0.06, 0.015], [0.634, 0.074, 0.074, 0]];
  // Monotone cubic slopes prevent a jaw ring from overshooting either surface.
  const slopes = profile.map((row, i) => [0, ...[1, 2, 3].map(c => {
    const a = profile[Math.max(0, i - 1)], b = profile[Math.min(profile.length - 1, i + 1)];
    if (i === 0 || i === profile.length - 1) return (b[c] - a[c]) / (b[0] - a[0]);
    const h0 = row[0] - a[0], h1 = b[0] - row[0], d0 = (row[c] - a[c]) / h0, d1 = (b[c] - row[c]) / h1;
    if (d0 * d1 <= 0) return 0;
    const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / d0 + w1 / d1);
  })]);
  const pos = [], unit = [], idx = [], A = 32, sub = 8;
  const ring = (x, top, bottom, width) => {
    for (let j = 0; j <= A; j++) {
      const a = j / A * Math.PI * 2, up = Math.cos(a), side = Math.sin(a);
      pos.push(L * x, L * ((top + bottom) * 0.5 + up * (top - bottom) * 0.5), L * side * width);
      unit.push(x, up, side);
    }
  };
  for (let i = 0; i < profile.length - 1; i++) {
    const p0 = profile[i], p1 = profile[i + 1], h = p1[0] - p0[0];
    for (let j = 0; j < sub; j++) {
      const t = j / sub, t2 = t * t, t3 = t2 * t;
      const values = [1, 2, 3].map(c => (2 * t3 - 3 * t2 + 1) * p0[c] + (t3 - 2 * t2 + t) * h * slopes[i][c]
        + (-2 * t3 + 3 * t2) * p1[c] + (t3 - t2) * h * slopes[i + 1][c]);
      ring(p0[0] + h * t, ...values);
    }
  }
  ring(...profile[profile.length - 1]);
  const R = (profile.length - 1) * sub;
  for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) {
    const a = i * (A + 1) + j, b = a + A + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry(), paintGeo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  paintGeo.setAttribute('position', new THREE.Float32BufferAttribute(unit, 3));
  m.add(geo, new THREE.Matrix4(), skin, { paintGeo });
  // Keep eyes with the continuous torso so head dips cannot split the skin.
  const hd = { part: P.BODY, pivot: [L * 0.22, cy, 0] };
  eyes(m, [L * 0.335, cy, 0], L * 0.014, -L * 0.005, L * 0.067, L * 0.008, P.BODY, hd.pivot);
  m.add(flat(sh => { sh.moveTo(0.6, 0); sh.quadraticCurveTo(0, 0.5, -0.6, 0.15); sh.lineTo(-0.6, 0); sh.lineTo(0.6, 0); }),
    place([-L * 0.05, cy + L * 0.1, 0], [0, 0, 0], [L * 0.16, L * 0.08, L * 0.01]), shade(s.color, -0.1)); // low dorsal ridge
  for (const side of [1, -1]) m.ell([L * 0.14, cy - L * 0.07, side * L * 0.12], [L * 0.08, L * 0.012, L * 0.045], shade(s.color, -0.05), { rot: [side * 0.35, side * 0.4, -0.2] });
  const fluke = flat(sh => { sh.moveTo(0, 0.08); sh.quadraticCurveTo(-0.4, 0.4, -0.8, 1); sh.quadraticCurveTo(-0.7, 0.4, -1, 0); sh.quadraticCurveTo(-0.7, -0.4, -0.8, -1); sh.quadraticCurveTo(-0.4, -0.4, 0, -0.08); sh.lineTo(0, 0.08); }, 'xz');
  m.add(fluke, place([-L * 0.44, cy + L * 0.01, 0], [0, 0, 0], [L * 0.14, L * 0.012, L * 0.14]), shade(s.color, -0.12), { part: P.TAIL, pivot: [-L * 0.44, cy, 0] });
}

// Manta ray: a broad, flat diamond of a body, black above and white below, flying through the
// water on long triangular wings, with the two curled lobes either side of its wide mouth.
function ray(m, s) {
  const S = s.size, cy = S * 0.14, back = col(s.color), belly = col(s.belly || '#f0f0ec');
  const skin = u => (u.y < -0.1 ? belly : back);
  m.ell([0, cy, 0], [S * 0.26, S * 0.06, S * 0.2], skin);
  m.ell([S * 0.2, cy - S * 0.005, 0], [S * 0.1, S * 0.045, S * 0.12], skin);
  for (const side of [1, -1]) {
    // cephalic lobes, curled down beside the mouth
    m.limb([S * 0.26, cy, side * S * 0.08], [S * 0.36, cy - S * 0.02, side * S * 0.09], S * 0.025, S * 0.015, back, { part: P.HEAD, pivot: [S * 0.2, cy, 0] });
    m.ell([S * 0.27, cy + S * 0.02, side * S * 0.115], [S * 0.016, S * 0.016, S * 0.01], '#141210', { lo: true, gloss: 2 }); // eyes
    // a wing: one fin from the midline, swept back to a pointed tip and thinning as it goes; its root
    // lies inside the body, and it beats up and down in "flight" bending out from the body's edge
    // (motion.wingRoot), so no hinge or gap ever opens where it leaves the body
    const pivot = [0, cy, 0], part = side > 0 ? P.WING_L : P.WING_R;
    const at = place(pivot, [0, 0, 0], [S, S * 0.02, S * 0.66]);
    // (the grid's two layers face inward: the lower one is the surface seen from above)
    m.add(wingShape('manta', side), at, u => (u.y > 0 ? belly : back), { part, pivot, ext: at });
  }
  m.limb([-S * 0.24, cy, 0], [-S * 0.62, cy + S * 0.01, 0], S * 0.02, S * 0.006, back, { part: P.TAIL, pivot: [-S * 0.24, cy, 0] });
}

// Nile monitor: a long, low lizard on sprawling legs, with a snaky neck, a narrow pointed head,
// a flicking forked tongue and a thick tail as long as the rest of it. Dark olive with pale
// yellow bands and spots.
function monitor(m, s) {
  const S = s.size, cy = S * 0.13, iguana = s.lizard === 'iguana', anole = s.lizard === 'anole', spiny = iguana || s.lizard === 'ctenosaur';
  // (bands, spots and belly drawn per pixel, coatMonitor)
  const marks = bands => pixelCoat('monitor', solid(s.color), [S * 0.14, S * 0.03, bands ? 0 : 1], shade(s.belly, -0.1), s.belly), skin = marks(true);
  loftBody(m, { x0: -S * 0.3, x1: S * 0.28, cy0: cy, cy1: cy + S * 0.005, ry0: S * 0.075, ry1: S * 0.08, rz0: S * 0.1, rz1: S * 0.1 }, skin);
  const neck = [S * 0.24, cy + S * 0.01, 0], hd = { part: P.HEAD, pivot: neck };
  tube(m, [neck, [S * 0.33, cy + S * 0.025, 0], [S * 0.42, cy + S * 0.04, 0]], [S * 0.065, S * 0.058, S * 0.045], skin, hd);                  // long neck
  m.ell([S * 0.46, cy + S * 0.045, 0], [S * (iguana ? 0.09 : 0.08), S * (iguana ? 0.062 : 0.04), S * (iguana ? 0.062 : 0.045)], skin, hd);           // head
  m.ell([S * 0.54, cy + S * 0.035, 0], [S * 0.045, S * 0.025, S * 0.028], s.color, hd);      // pointed snout
  eyes(m, [S * 0.46, cy + S * 0.045, 0], S * 0.03, S * 0.02, S * (iguana ? 0.052 : 0.037), S * 0.011, P.HEAD, neck, '#c8a030'); // (on the head's surface: the iguana's is wider)
  if (!s.lizard) for (const side of [1, -1]) m.limb([S * 0.585, cy + S * 0.03, 0], [S * 0.64, cy + S * 0.03, side * S * 0.012], S * 0.005, S * 0.003, '#8a3a4a', { ...hd, caps: false }); // forked tongue
  // tail: thick at the base, tapering, as long again as the body
  const tb = [-S * 0.28, cy, 0];
  tube(m, [tb, [-S * 0.43, cy - S * 0.006, S * 0.01], [-S * 0.62, cy - S * 0.026, S * 0.035], [-S * 0.81, cy - S * 0.047, S * 0.02], [-S * 0.95, cy - S * 0.06, 0]],
    [S * 0.07, S * 0.057, S * 0.038, S * 0.018, S * 0.004], skin, { part: P.TAIL, pivot: tb, seg: 14, sub: 5 });
  if (iguana || anole) {
    const dewlap = flat(sh => { sh.moveTo(0, 0); sh.quadraticCurveTo(-0.05, -0.2, -0.25, -0.17); sh.quadraticCurveTo(-0.32, -0.07, -0.32, 0); sh.lineTo(0, 0); });
    m.add(dewlap, place([S * 0.47, cy + S * 0.025, 0], [0, 0, 0], [S * (anole ? 0.55 : 0.8), S * (anole ? 0.55 : 0.8), S * 0.012]), anole ? '#bb5c68' : shade(s.belly, -0.08), hd);
    if (iguana) for (const side of [-1, 1]) m.ell([S * 0.435, cy + S * 0.022, side * S * 0.062], [S * 0.025, S * 0.027, S * 0.007], shade(s.belly, 0.1), hd);
  }
  if (spiny) for (let k = 0; k < 13; k++) {
    const x = S * (0.23 - k * 0.068), tail = x < -S * 0.28, h = S * (iguana ? 0.04 : 0.025) * (1 - k / 18);
    m.limb([x, cy + (tail ? S * (0.045 - (-x / S - 0.28) * 0.1) : S * 0.074), 0], [x - S * 0.012, cy + (tail ? S * (0.045 - (-x / S - 0.28) * 0.1) : S * 0.074) + h, 0], S * 0.012, S * 0.001, s.dark || shade(s.color, -0.3), tail ? { part: P.TAIL, pivot: tb } : {});
  }
  // legs splay out sideways from the body, elbows up, feet flat with claws
  const legs = [[S * 0.17, 1, P.LEG_FL], [S * 0.17, -1, P.LEG_FR], [-S * 0.2, 1, P.LEG_BL], [-S * 0.2, -1, P.LEG_BR]];
  for (const [x, side, part] of legs) {
    const hip = [x, cy, side * S * 0.07], knee = [x + S * 0.02, cy + S * 0.02, side * S * 0.17], foot = [x + S * 0.04, S * 0.01, side * S * 0.2], o = { part, pivot: hip };
    tube(m, [hip, knee, foot], [S * 0.035, S * 0.028, S * 0.018], marks(false), o); // (spotted, but a band across a leg would ring it)
    for (const t of [-2, -1, 0, 1, 2]) m.limb(foot, [foot[0] + S * (0.045 - Math.abs(t) * 0.006), S * 0.004, foot[2] + t * S * 0.014], S * 0.006, S * 0.002, '#2a2418', { ...o, caps: false });
  }
}

// ---------------------------------------------------------------- species -> model + motion
// motion: leg swing (radians), body bob (px), tail sway, wing beat rate, swim/slither wave.
// Species whose sprite shares a builder kind with a different-looking animal, recognised by key until
// their sprites carry the flag themselves (mousedeer: the agouti kind; birdwing: the butterfly kind;
// barn: an owl without the great horned owl's ear tufts).
// Small bottom-dwelling reef animals, built with the same soft primitives as the fish.
function seaCucumber(m, s) {
  const S = s.size;
  loftBody(m, { x0: -S * 0.5, x1: S * 0.5, cy0: S * 0.12, cy1: S * 0.12,
    ry0: S * 0.12, ry1: S * 0.13, rz0: S * 0.14, rz1: S * 0.14 }, grad(s.color, s.belly));
  for (let row = 0; row < 3; row++) for (let j = 0; j < 9; j++) {
    const x = (j / 8 - 0.5) * S * 0.75, z = (row - 1) * S * 0.085;
    m.ell([x, S * (row === 1 ? 0.245 : 0.21), z], [S * 0.018, S * 0.024, S * 0.018], s.belly, { lo: true });
  }
  for (const side of [-1, 1]) for (let j = 0; j < 7; j++)
    m.ell([(j / 6 - 0.5) * S * 0.72, S * 0.035, side * S * 0.12], [S * 0.023, S * 0.035, S * 0.023], s.belly, { lo: true });
}
function seaUrchin(m, s) {
  const S = s.size, centre = [0, S * 0.24, 0];
  m.ell(centre, [S * 0.36, S * 0.24, S * 0.36], s.color);
  // Short, cream-tipped spines across a flattened dome; no fish fins or eyes.
  for (let row = 0; row < 5; row++) {
    const theta = (row + 0.4) / 5 * Math.PI * 0.52, n = row === 0 ? 8 : 16;
    for (let j = 0; j < n; j++) {
      const phi = (j + row * 0.5) / n * Math.PI * 2;
      const d = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
      const base = d.map((v, k) => centre[k] + v * S * (k === 1 ? 0.22 : 0.33));
      const tip = base.map((v, k) => v + d[k] * S * 0.15);
      m.limb(base, tip, S * 0.018, S * 0.003, j % 3 ? s.spine : '#b48874', { caps: false, seg: 5 });
    }
  }
  for (let j = 0; j < 3; j++) m.ell([(j - 1) * S * 0.13, S * 0.46, (j % 2 - 0.5) * S * 0.18],
    [S * 0.1, S * 0.02, S * 0.07], j === 1 ? '#65925d' : '#c6baa2', { lo: true });
}

export { butterflyfish, caiman, dolphin, dugong, fish, frog, idol, monitor, newt, ray, seaCucumber, seaTurtle, seaUrchin, shark, snake, turtle };
