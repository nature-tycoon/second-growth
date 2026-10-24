// Bird body plans, feathers, wings and species markings.
import * as THREE from 'three';
import { P, col, eyes, flat, grad, pixelCoat, place, sculpt, shade, smooth, solid, tmp, tube } from './model-core.js';

// ---------------------------------------------------------------- birds
const BIRDS = {
  songbird: s => ({ legH: 0.2, tilt: 0.35, span: 0.62, chord: 0.24, beak: 0.16, beakColor: s.bill || '#3a3028', legColor: '#6a5a4a', tail: s.cocked ? -1.1 : 0.25 }),
  hummer: s => ({ legH: 0.1, tilt: 0.2, span: 0.7, chord: 0.2, beak: 0.44, beakColor: '#1e1a18', legColor: '#1e1a18', tail: 0.2, beakR: 0.03 }),
  woodpecker: s => ({ legH: 0.14, tilt: 0.75, span: 0.62, chord: 0.26, beak: 0.26, beakColor: '#2a2622', legColor: '#4a4440', tail: 0.5 }),
  heron: s => ({ legH: 1.05, tilt: 0.3, span: 0.9, chord: 0.3, beak: s.stork ? 0.38 : 0.42, beakR: s.stork ? 0.05 : null, beakColor: s.bill || '#e0b030', legColor: s.stork ? '#c0543e' : '#b8a060', tail: 0.2, neck: true, head: 0.13 }), // (stork: a stouter, straight bill)
  duck: s => ({ legH: 0.08, tilt: 0.05, span: s.goose ? 0.95 : 0.6, chord: 0.24, head: s.goose ? 0.14 : s.woodduck || s.mallard ? 0.17 : 0.19, headLong: s.woodduck || s.mallard ? 1.18 : 1.05, beak: s.goose ? 0.14 : 0.2, beakColor: s.bill || '#d8a030', legColor: s.goose ? '#33322c' : '#e08a30', tail: -0.4, duck: true }),
  raptor: s => ({ legH: 0.16, tilt: 0.52, span: 0.95, chord: 0.3, beak: 0.14, beakColor: s.bill || '#e0b030', legColor: '#e0b030', tail: 0.35, hook: true, head: 0.155, brow: true, cere: '#e8c040' }), // (brow: the bony ridge over a hawk's eye that gives it its glare)
  vulture: s => ({ legH: 0.2, tilt: 0.3, span: 0.95, chord: 0.34, beak: 0.13, beakColor: s.bill || '#2a2a2a', legColor: '#5a5650', tail: 0.2, hook: true, head: 0.12, vulture: true }),
  secretary: s => ({ legH: 1.05, tilt: 0.18, span: 1.0, chord: 0.3, beak: 0.09, beakColor: '#8a8a88', legColor: '#e2c49a', tail: 0.1, hook: true, neck: true, head: 0.13, secretary: true }),
  crane: s => ({ legH: 0.95, tilt: 0.22, span: 1.0, chord: 0.32, beak: 0.15, beakColor: '#2a2a2a', legColor: '#3a3a3a', tail: 0.2, neck: true, head: 0.13 }),
  hornbill: s => ({ legH: s.perch ? 0.13 : 0.44, tilt: s.casque ? 0.3 : 0.22, span: 0.8, chord: 0.3, beak: 0, beakColor: '#1c1a18', legColor: '#2a2624', tail: s.casque ? 0.75 : 0.3, head: 0.16, hornbill: true }),
  toucan: s => ({ legH: 0.18, tilt: 0.45, span: 0.55, chord: 0.26, beak: 0, beakColor: s.bill, legColor: '#4a6aa0', tail: 0.4, head: 0.2, toucan: true }),
  macaw: s => ({ legH: 0.14, tilt: 0.55, span: 0.95, chord: 0.28, beak: 0.13, beakColor: '#e8e2d4', legColor: '#5a5048', tail: 0.45, hook: true, head: 0.21, macaw: true }),
  ostrich: s => ({ legH: 1.15, tilt: 0.05, span: 0.45, chord: 0.3, beak: 0.1, beakColor: '#c8a088', legColor: '#d0a898', tail: -0.6, neck: true, tall: true, head: 0.09, fluffy: true }),
  // brown booby: a sleek seabird with a long, pointed dagger of a bill, resting on the water between dives
  booby: s => ({ legH: 0.06, tilt: 0.12, span: 1.05, chord: 0.22, beak: 0.3, beakR: 0.065, beakColor: s.bill || '#e0c860', legColor: '#e0c860', tail: 0.35, swimmer: true, head: 0.145, headLong: 1.2, taper: true, long: 1.05, gape: true, up: 0.48 }),
  owl: s => ({ legH: 0.12, tilt: 1.3, span: 0.85, chord: 0.3, beak: 0.08, beakColor: '#3a3028', legColor: '#8a7a5a', tail: 1.2, owl: true, head: 0.22 }),
};

const WING_KIND = { vulture: 'fingered', secretary: 'fingered', crane: 'fingered', hornbill: 'fingered', ostrich: 'round', songbird: 'round', woodpecker: 'round', owl: 'round', toucan: 'round', hummer: 'pointed', duck: 'pointed', booby: 'pointed', macaw: 'pointed', heron: 'fingered', raptor: 'fingered' };

// Family proportions keep the silhouette recognisable before colours and markings are added.
const BIRD_BODY = {
  songbird: [0.38, 0.25, 0.23], hummer: [0.34, 0.2, 0.18], woodpecker: [0.43, 0.23, 0.21],
  heron: [0.44, 0.22, 0.22], duck: [0.46, 0.24, 0.28], booby: [0.5, 0.22, 0.22],
  raptor: [0.49, 0.26, 0.23], vulture: [0.46, 0.27, 0.26], owl: [0.37, 0.3, 0.28],
  macaw: [0.41, 0.26, 0.23], toucan: [0.4, 0.27, 0.24], hornbill: [0.46, 0.26, 0.25],
  secretary: [0.44, 0.25, 0.23], crane: [0.46, 0.24, 0.24], ostrich: [0.5, 0.32, 0.3],
};
// A bird's body (see bird()): rounder than SPH, as its outline is the whole bird. Its own finer
// sphere for the close-up model, as Model.finer only knows the shared ones.
const BODY = new THREE.SphereGeometry(1, 16, 11), BODY_CLOSE = new THREE.SphereGeometry(1, 26, 17);
// A closed, slightly arched feather with a broad shaft and softly rounded end. Shared by tails;
// unlike an ellipsoid it stays broad along its length instead of swelling into a leaf at the middle.
function tailFeather() {
  const rows = 20, across = 3, pos = [], idx = [];
  for (const face of [0.5, -0.5]) for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const half = t <= 0.78 ? 0.24 + 0.26 * smooth(0, 0.65, t) : Math.max(0.005, 0.5 * Math.sqrt(Math.max(0, 1 - ((t - 0.78) / 0.22) ** 2)));
    for (let j = 0; j <= across; j++) pos.push(-t, face + 0.2 * Math.sin(t * Math.PI), (j / across * 2 - 1) * half);
  }
  const faceCount = (rows + 1) * (across + 1);
  for (let face = 0; face < 2; face++) for (let i = 0; i < rows; i++) for (let j = 0; j < across; j++) {
    const a = face * faceCount + i * (across + 1) + j, b = a + across + 1;
    if (face === 0) idx.push(a, a + 1, b, b, a + 1, b + 1);
    else idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // Close the thin edges, with shared vertices for a gently rounded rim.
  for (let i = 0; i < rows; i++) for (const j of [0, across]) {
    const a = i * (across + 1) + j, b = a + across + 1;
    if (j === 0) idx.push(a, b, a + faceCount, b, b + faceCount, a + faceCount);
    else idx.push(a, a + faceCount, b, b, a + faceCount, b + faceCount);
  }
  for (const i of [0, rows]) for (let j = 0; j < across; j++) {
    const a = i * (across + 1) + j;
    if (i === 0) idx.push(a, a + faceCount, a + 1, a + 1, a + faceCount, a + 1 + faceCount);
    else idx.push(a, a + 1, a + faceCount, a + 1, a + 1 + faceCount, a + faceCount);
  }
  // Length runs toward -x, so reverse the grid's winding to point each face outward.
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Interior rows preserve bands, bars, and coloured tips when painting the feathers.
const TAIL_FEATHER = tailFeather();
// Motmot central feathers: a narrow bare shaft ending in a broad racket.
const RACKET_FEATHER = flat(sh => {
  sh.moveTo(0, -0.15); sh.lineTo(-0.3, -0.12); sh.lineTo(-0.72, -0.035);
  sh.quadraticCurveTo(-0.76, -0.48, -0.88, -0.5); sh.quadraticCurveTo(-1, -0.48, -1, 0);
  sh.quadraticCurveTo(-1, 0.48, -0.88, 0.5); sh.quadraticCurveTo(-0.76, 0.48, -0.72, 0.035);
  sh.lineTo(-0.3, 0.12); sh.lineTo(0, 0.15); sh.closePath();
}, 'xz', 4);
const TAIL_PROFILE = {
  songbird: [0.43, 0.15, 0.25, 0.06], hummer: [0.3, 0.11, 0.18, 0.04],
  woodpecker: [0.46, 0.13, 0.2, 0.18], heron: [0.27, 0.12, 0.2, 0.08],
  duck: [0.3, 0.15, 0.23, 0.12], booby: [0.52, 0.13, 0.23, 0.28],
  raptor: [0.42, 0.21, 0.34, 0.04], vulture: [0.38, 0.18, 0.31, 0.08],
  owl: [0.26, 0.15, 0.24, 0.04], macaw: [0.98, 0.1, 0.18, 0.42],
  toucan: [0.43, 0.17, 0.25, 0.03], hornbill: [0.62, 0.18, 0.27, 0.04],
  secretary: [0.35, 0.15, 0.23, 0.05], crane: [0.25, 0.16, 0.24, 0.06],
  ostrich: [0.28, 0.24, 0.3, 0.12],
};
// base: the rump, where the feather roots are buried beneath the rump coverts
function birdTail(m, s, o, base) {
  const S = s.size, c = Math.cos(o.tilt), sn = Math.sin(o.tilt);
  let [length, width, flightWidth, graduation] = TAIL_PROFILE[s.kind];
  if (s.shortTail) { length = 0.36; width = 0.15; flightWidth = 0.24; graduation = 0; }
  if (s.tailTip) length = 0.66;
  if (s.cocked) length = 0.3;
  length = s.tailLength ?? length;
  width = s.tailWidth ?? width;
  flightWidth = s.tailFan ?? flightWidth;
  graduation = s.tailGraduation ?? graduation;
  const angle = s.cocked ? -1.05 : o.owl ? 1.15 : o.duck ? -0.08 : o.tall ? -0.35 : 0.12 + o.tilt * 0.45;
  const paint = u => {
    const t = -u.x;
    if (s.tailTip && t > 0.78) return col(s.tailTip);
    if (o.macaw && !s.shortTail && t > 0.56) return col(s.wingtip || s.tail || s.color);
    if (s.tailBand && t > 0.48 && t < 0.7) return col(s.tailBand);
    if (s.barred && Math.sin(t * 26) > 0.45) return col(s.breast);
    if (s.tailBars && Math.sin(t * 26) > 0.45) return col(s.tailBars);
    return col(s.tail || s.color);
  };
  // (plain bars across the tail, a barred owl's or a hawk's, drawn per pixel: coatBars)
  const barColor = s.barred ? s.breast : s.tailBars, bars = barColor && !s.tailTip && !s.tailBand && !s.centralTailTip && !o.macaw;
  for (let f = -3; f <= 3; f++) {
    const edge = Math.abs(f) / 3, L = S * length * (s.forkTail ? 0.42 + 0.58 * edge : 1 - graduation * edge);
    const root = [base[0], base[1] + S * (0.008 - edge * 0.004), f * S * 0.013];
    const fan = (w, pitch) => place(root, [0, Math.atan2(f / 3 * S * w, L), pitch], [L, S * 0.013, S * (width * 0.78)]);
    const feather = bars ? pixelCoat('bars', solid(shade(s.tail || s.color, edge * -0.055)), [0, -26, 0, 0.45, 1, -9], barColor)
      : u => shade(s.centralTailTip && Math.abs(f) <= 1 && -u.x > 0.82 ? s.centralTailTip : paint(u), edge * -0.055);
    m.add(TAIL_FEATHER, fan(width * 0.65, angle), feather, {
      part: P.TAIL, pivot: base, ext: fan(flightWidth, angle * 0.45),
    });
  }
  if (s.tailRackets) for (const side of [-1, 1]) {
    const root = [base[0], base[1], side * S * 0.025];
    const pose = pitch => place(root, [0, side * 0.06, pitch], [S * 0.95, S * 0.012, S * 0.095]);
    m.add(RACKET_FEATHER, pose(angle), u => -u.x > 0.9 ? col('#182a30') : col(s.tailTip || s.tail),
      { part: P.TAIL, pivot: base, ext: pose(angle * 0.45) });
  }
  // The secretarybird's two long central streamers extend beyond the compact fan.
  if (o.secretary) for (const side of [-1, 1]) {
    const root = [base[0], base[1], side * S * 0.025];
    m.add(TAIL_FEATHER, place(root, [0, side * 0.045, 0.22], [S * 0.95, S * 0.012, S * 0.05]),
      u => -u.x > 0.72 ? col('#1a1a1a') : col(s.color), { part: P.TAIL, pivot: base });
  }
  m.ell([base[0] + S * 0.035 * c, base[1] + S * 0.035 * sn, 0], [S * 0.13, S * 0.06, S * Math.min(width * 0.65, 0.1)],
    s.tail || s.color, { rot: [0, 0, o.tilt] });
}

function bird(m, s) {
  const S = s.size, o = BIRDS[s.kind](s), bodyBase = grad(s.color, s.breast || s.color, -0.15, 0.4);
  const detailedDuck = !!(s.woodduck || s.mallard);
  const by = o.legH * S + S * 0.26;
  // Plumage drawn per pixel (barred, mottled, a drake's blocks): a barred owl's bars and streaks
  // (coatBarred); a hen's small dark feather centres (coatMottled); a wood duck drake's chestnut
  // breast freckled in cream and a mallard drake's brown breast and black stern (coatDuck: the vertex
  // colours keep the blocks well inside their edges, which the shader draws)
  // (bib: a sharp line between a dark back and chest and a white belly, as on a booby)
  const blocks = (front, back, frontColor, backColor) => u => u.x > front + 0.2 ? col(frontColor) : u.x < back - 0.2 ? col(backColor) : bodyBase(u);
  const black = col('#282b24');
  const body = s.barred ? pixelCoat('barred', bodyBase, [], s.color)
    : s.mottled ? pixelCoat('mottled', bodyBase, [0], s.color)
    : s.fancy ? pixelCoat('duck', blocks(0.25, -9, '#794c3b'), [0.25, 24, 0.77, -9], '#efddbd', '#794c3b')
    : s.mallard ? pixelCoat('duck', blocks(0.5, -0.68, s.breast, black), [0.5, 1, 1, -0.68, black.r, black.g, black.b], s.breast, s.breast)
    : s.bib ? u => (u.y > -0.1 || u.x > 0.62 ? col(s.color) : col(s.breast)) : grad(s.color, s.breast || s.color, -0.15, 0.4);
  const bodyR = BIRD_BODY[s.kind].map(r => r * S);
  // One streamlined body rather than a ball: a full, deep breast, a straight back, and a belly that
  // sweeps up to the vent so the rear narrows into the tail. The front half keeps the old ellipsoid,
  // so chest bands, bibs and flank patches still sit on it.
  const ct = Math.cos(o.tilt), st = Math.sin(o.tilt), stretch = o.owl ? 0.04 : 0.14;
  const bodyAt = (x, y, z) => [x * ct - y * st, by + x * st + y * ct, z];
  sculpt(m, d => {
    const back = Math.max(0, -d.x), slim = 1 - 0.3 * back * back;
    const y = d.y * bodyR[1] * slim * (d.y < 0 ? 1 - 0.25 * back : 0.94) + bodyR[1] * 0.1 * back * back;
    return bodyAt(d.x * bodyR[0] * (1 + stretch * back), y, d.z * bodyR[2] * slim);
  }, body, {}, m.close ? BODY_CLOSE : BODY);
  // Rufous hummingbird hens have cinnamon flanks beneath a green back.
  if (s.flanks) for (const side of [-1, 1]) m.ell([-S * 0.04, by - S * 0.07, side * bodyR[2] * 0.82], [S * 0.2, S * 0.11, S * 0.06], s.flanks, { rot: [0, 0, o.tilt] });
  if (s.band) m.ell([S * 0.12, by - S * 0.02, 0], [S * 0.12, S * 0.22, S * 0.235], s.band, { rot: [0, 0, o.tilt] });
  if (s.vee) m.ell([S * 0.22, by + S * 0.02, 0], [S * 0.06, S * 0.16, S * 0.2], '#1e1a18', { rot: [0, 0, o.tilt + 0.3] });
  if (s.spots) for (let k = 0; k < 7; k++) m.ell([S * (0.1 + (k % 3) * 0.06), by - S * (0.04 + (k % 4) * 0.035), (k % 2 ? 1 : -1) * S * (0.14 + (k % 3) * 0.03)], [S * 0.03, S * 0.03, S * 0.03], '#4a3a28', { lo: true });

  // head (with a long S-neck for the heron)
  const hr = S * (o.head ?? 0.19);
  let hp;
  if (o.owl) hp = [S * 0.1, by + S * 0.33, 0];
  else if (o.tall) hp = [S * 0.45, by + S * 1.0, 0];
  else if (o.vulture) hp = [S * 0.62, by + S * 0.13, 0];
  else if (o.neck) hp = [S * 0.5, by + S * 0.6, 0];
  else if (s.kind === 'booby') hp = [S * 0.48, by + S * 0.2, 0];
  else if (o.duck) hp = [S * (s.goose ? 0.66 : 0.38), by + S * (s.goose ? 0.48 : s.woodduck || s.mallard ? 0.4 : 0.28), 0];
  else hp = [S * 0.34 + Math.sin(o.tilt) * S * 0.02, by + S * 0.2 + Math.sin(o.tilt) * S * 0.12, 0];
  // (a short-necked bird's head bends from the root of its neck, deep in the chest, so the neck
  // stays inside the back when it pecks)
  const shortNeck = !o.owl && !o.tall && !o.neck && !o.vulture && !o.duck, neckRoot = bodyAt(bodyR[0] * 0.3, bodyR[1] * 0.12, 0);
  const neckBase = shortNeck ? neckRoot : [S * 0.25, by + S * 0.1, 0], hd = { part: P.HEAD, pivot: neckBase, fine: detailedDuck };
  // a short, thick neck rooted broad in the chest and narrowing to the head's own width, so the
  // breast, nape and head make one outline instead of a ball sitting on a ball
  if (shortNeck) {
    const n0 = neckRoot, n2 = [hp[0] - hr * 0.3, hp[1] - hr * 0.15, 0];
    const n1 = [n0[0] * 0.45 + n2[0] * 0.55, n0[1] * 0.4 + n2[1] * 0.6, 0];
    const nc = col(s.kind === 'woodpecker' ? s.color : s.head), top = col(s.color), under = col(s.breast || s.color); // (a woodpecker's "head" colour is its crest)
    const paint = u => tmp.copy(under).lerp(top, smooth(-0.4, 0.4, u.y)).lerp(nc, smooth(-0.3, 0.6, u.x));
    const w = Math.min(bodyR[1] * 0.7, hr * 1.25), z = Math.min(bodyR[2] * 0.75, hr * 1.2);
    tube(m, [n0, n1, n2], [[w, z], [w * 0.55 + hr * 0.4, z * 0.55 + hr * 0.38], [hr * 0.86, hr * 0.84]], paint, { ...hd, seg: 9, sub: 2, capRings: 1 });
  }
  if (o.vulture) {
    // white-backed vulture: a long, bare grey neck hanging forward out of a thick white ruff
    tube(m, [[S * 0.3, by + S * 0.12, 0], [S * 0.47, by + S * 0.19, 0], [hp[0] - hr * 0.5, hp[1], 0]], [S * 0.07, S * 0.05, S * 0.042], s.head, { ...hd, seg: 8, sub: 3, capRings: 1 });
    m.ell([S * 0.4, by + S * 0.15, 0], [S * 0.085, S * 0.11, S * 0.14], s.darkRuff ? s.color : '#f2eee6', { ...hd, rot: [0, 0, -0.6] });
  }
  if (o.tall) {
    // ostrich: a bare pinkish neck rising straight up out of the black plumes
    m.limb([S * 0.3, by + S * 0.08, 0], [S * 0.4, by + S * 0.5, 0], S * 0.07, S * 0.05, s.head, hd);
    m.limb([S * 0.4, by + S * 0.5, 0], [hp[0] - hr * 0.5, hp[1] - hr * 0.3, 0], S * 0.05, S * 0.04, s.head, hd);
  } else if (o.neck) {
    tube(m, [[S * 0.3, by + S * 0.08, 0], [S * 0.39, by + S * 0.28, 0], [S * 0.41, by + S * 0.46, 0], [hp[0] - hr * 0.4, hp[1] - hr * 0.2, 0]], [S * 0.09, S * 0.075, S * 0.061, S * 0.06], s.breast, hd);
  }
  // a duck's neck swells into its breast rather than rising like a stalk
  const duckNeck = [S * 0.36, by + S * 0.24, 0], neckR = S * (detailedDuck ? 0.1 : 0.12);
  if (o.duck) tube(m, [bodyAt(bodyR[0] * 0.45, bodyR[1] * 0.25, 0), duckNeck, hp], [[S * 0.17, S * 0.17], [neckR, neckR * 0.95], [hr * 0.7, hr * 0.7]],
    u => tmp.copy(col(s.breast || s.color)).lerp(col(s.head), smooth(-0.6, 0.1, u.x)), { ...hd, seg: detailedDuck ? 16 : 10, sub: 3, capRings: 1 });
  if (s.collar) { // (the mallard drake's white ring, a band round the neck where it leaves the breast)
    const d = [hp[0] - duckNeck[0], hp[1] - duckNeck[1]], k = S * 0.012 / Math.hypot(d[0], d[1]);
    m.limb([duckNeck[0] - d[0] * k, duckNeck[1] - d[1] * k, 0], [duckNeck[0] + d[0] * k, duckNeck[1] + d[1] * k, 0], neckR * 1.08, neckR * 1.06, '#f4efde', { ...hd, caps: false, seg: 16 });
  }
  const pecker = s.kind === 'woodpecker';
  // (a cardinal's mask is painted on the head itself: dark round the bill, back through the lores to
  // the eye and down over the chin, so the eye sits in it instead of a dark disc reading as the eye)
  const headC = pecker ? s.color : s.head;
  const mask = u => Math.max(smooth(0.1, 0.24, u.x) * (1 - smooth(0.4, 0.52, u.y)), smooth(-0.35, -0.55, u.y) * smooth(-0.05, 0.2, u.x));
  m.ell(hp, [hr * (o.headLong || 1.05), hr * (o.brow ? 0.9 : 1), hr * (o.owl ? 1.1 : 0.95)],
    s.mask ? u => tmp.copy(col(headC)).lerp(col(s.face), mask(u)) : headC, s.mask ? { ...hd, fine: true } : hd);
  if (o.brow) for (const side of [1, -1]) m.ell([hp[0] + hr * 0.5, hp[1] + hr * 0.42, side * hr * 0.6], [hr * 0.48, hr * 0.17, hr * 0.26], shade(s.head, -0.12), { ...hd, rot: [side * 0.25, 0, -0.12], lo: true });
  if (s.goose) for (const side of [-1, 1]) m.ell([hp[0] + hr * 0.12, hp[1] - hr * 0.25, side * hr * 0.9], [hr * 0.72, hr * 0.4, hr * 0.12], '#eeeade', hd);
  if (o.taper) m.ell([hp[0] + hr * 0.75, hp[1] - hr * 0.12, 0], [hr * 0.7, hr * 0.62, hr * 0.62], s.head, hd); // (a streamlined face sloping into the bill, as on a booby)
  if (pecker) {
    // pileated: a flaming red crest, and a white stripe from the bill down the neck
    m.limb([hp[0] + hr * 0.1, hp[1] + hr * 0.6, 0], [hp[0] - hr * 1.1, hp[1] + hr * 1.05, 0], hr * 0.55, hr * 0.12, s.head, hd);
    m.ell([hp[0] + hr * 0.2, hp[1] + hr * 0.75, 0], [hr * 0.6, hr * 0.35, hr * 0.5], s.head, hd);
    for (const side of [1, -1]) m.ell([hp[0] + hr * 0.1, hp[1] - hr * 0.25, side * hr * 0.72], [hr * 0.85, hr * 0.14, hr * 0.28], '#f2f0ea', hd);
  }
  if (o.owl) {
    // great horned: feather "horns", a tawny facial disc and yellow eyes
    if (s.barn) {
      // barn owl: no ear tufts; a flat white heart-shaped face rimmed in buff, and dark eyes
      m.ell([hp[0] + hr * 0.5, hp[1] - hr * 0.05, 0], [hr * 0.5, hr * 0.92, hr * 0.98], shade(s.color, 0.2), hd);
      for (const side of [1, -1]) m.ell([hp[0] + hr * 0.68, hp[1] - hr * 0.08, side * hr * 0.36], [hr * 0.3, hr * 0.72, hr * 0.48], s.breast, hd);
      m.ell([hp[0] + hr * 0.95, hp[1] - hr * 0.1, 0], [hr * 0.16, hr * 0.5, hr * 0.12], shade(s.breast, -0.12), { ...hd, lo: true }); // the ridge down the middle
      eyes(m, hp, hr * 0.93, hr * 0.12, hr * 0.33, hr * 0.12, P.HEAD, neckBase, '#120c08');
    } else if (s.barred) {
      m.ell([hp[0] + hr * 0.48, hp[1], 0], [hr * 0.56, hr * 0.9, hr * 1.02], shade(s.color, -0.2), hd);
      for (const side of [-1, 1]) m.ell([hp[0] + hr * 0.65, hp[1], side * hr * 0.39], [hr * 0.4, hr * 0.75, hr * 0.52], s.breast, hd);
      eyes(m, hp, hr * 0.97, hr * 0.1, hr * 0.4, hr * 0.13, P.HEAD, neckBase, '#17120f');
    } else {
      for (const side of [1, -1]) m.limb([hp[0] - hr * 0.1, hp[1] + hr * 0.75, side * hr * 0.45], [hp[0] - hr * 0.35, hp[1] + hr * 1.45, side * hr * 0.62], hr * 0.22, hr * 0.04, s.color, hd);
      for (const side of [1, -1]) m.ell([hp[0] + hr * 0.62, hp[1], side * hr * 0.42], [hr * 0.25, hr * 0.52, hr * 0.45], s.breast, hd);
      eyes(m, hp, hr * 0.85, hr * 0.08, hr * 0.4, hr * 0.17, P.HEAD, neckBase, '#e8c030');
      eyes(m, hp, hr * 0.97, hr * 0.08, hr * 0.4, hr * 0.09, P.HEAD, neckBase);
    }
  } else if (s.woodduck) {
    // Wood duck: eyes set flush in the face, not bulging. Each piece is a flat disc laid along the
    // head's surface (x, y: where on the face, in head radii; out: how far it sits above the skin).
    // The hen's dark eye has a thin white ring that trails back into a teardrop; the drake's red
    // eye has a black pupil, his white lines are the crest's.
    const ax = hr * o.headLong, az = hr * 0.95;
    const onFace = (x, y, side, out, r, color, o2 = {}) => {
      const z = az * Math.sqrt(Math.max(0, 1 - (x * hr / ax) ** 2 - y * y));
      const n = [x * hr / (ax * ax), y / hr, z / (az * az)], k = Math.hypot(...n);
      if (o2.gloss) m.eyeSpot ||= [hp[0] + x * hr, hp[1] + y * hr, z]; // (as eyes() marks it)
      m.ell([hp[0] + x * hr + n[0] / k * out, hp[1] + y * hr + n[1] / k * out, side * (z + n[2] / k * out)], r, color,
        { ...hd, ...o2, rot: [-side * Math.atan2(n[1], n[2]), side * Math.asin(n[0] / k), 0] });
    };
    for (const side of [-1, 1]) {
      if (s.eyePatch) {
        onFace(0.41, 0.25, side, -hr * 0.03, [hr * 0.19, hr * 0.18, hr * 0.07], '#e4dfd3');
        onFace(0.22, 0.25, side, -hr * 0.03, [hr * 0.26, hr * 0.13, hr * 0.07], '#e4dfd3');
        onFace(0.02, 0.27, side, -hr * 0.03, [hr * 0.2, hr * 0.065, hr * 0.07], '#e4dfd3');
        onFace(0.44, 0.25, side, hr * 0.01, [hr * 0.125, hr * 0.125, hr * 0.06], '#1e1c19', { gloss: 2 });
      } else {
        onFace(0.47, 0.24, side, 0, [hr * 0.17, hr * 0.17, hr * 0.07], s.eye, { gloss: 2 });
        onFace(0.47, 0.24, side, hr * 0.035, [hr * 0.085, hr * 0.085, hr * 0.06], '#120d0b', { gloss: 2 });
      }
    }
  } else if (s.eye) {
    // coloured eyes (the hoatzin's red eye in a patch of bare blue skin)
    if (s.face) for (const side of [1, -1]) m.ell([hp[0] + hr * 0.4, hp[1] + hr * 0.2, side * hr * 0.72], [hr * 0.38, hr * 0.3, hr * 0.2], s.face, hd);
    eyes(m, hp, hr * 0.47, hr * 0.24, hr * 0.84, Math.max(0.55, hr * 0.19), P.HEAD, neckBase, s.eye);
    eyes(m, hp, hr * 0.52, hr * 0.24, hr * 0.9, Math.max(0.3, hr * 0.09), P.HEAD, neckBase);
  } else {
    // bare facial skin (secretarybird's orange, crowned crane's white cheek)
    if (s.face && !s.mask) for (const side of [1, -1]) m.ell([hp[0] + hr * 0.35, hp[1] + hr * 0.05, side * hr * 0.7], [hr * 0.5, hr * 0.4, hr * 0.3], s.face, hd);
    if (s.ring) eyes(m, hp, hr * 0.42, hr * 0.25, hr * 0.72, Math.max(0.52, hr * 0.2), P.HEAD, neckBase, s.ring); // a thin pale eye-ring
    eyes(m, hp, hr * 0.45, hr * 0.25, s.ring ? hr * 0.8 : hr * 0.78, s.mask ? hr * 0.14 : Math.max(0.45, hr * 0.17), P.HEAD, neckBase); // (a cardinal's eye is small for its big head)
  }
  if (s.quills) for (let k = 0; k < 6; k++) { // secretarybird: long black quills hanging off the back of the head
    const z = (k % 2 ? 1 : -1) * hr * 0.15 * (1 + (k >> 1));
    m.limb([hp[0] - hr * 0.5, hp[1] + hr * 0.3, z * 0.5], [hp[0] - hr * (2 + (k % 3) * 0.4), hp[1] + hr * (0.4 - (k % 3) * 0.5), z], hr * 0.1, hr * 0.05, '#141414', { ...hd, caps: false });
  }
  if (s.crown) for (let k = 0; k < 9; k++) { // crowned crane: a fan of golden bristles
    const a = -0.9 + k * 0.22;
    m.limb([hp[0] - hr * 0.1, hp[1] + hr * 0.7, 0], [hp[0] - hr * 0.1 - Math.sin(a) * hr * 1.4, hp[1] + hr * 0.7 + Math.cos(a) * hr * 1.3, (k % 2 ? 1 : -1) * hr * 0.3], hr * 0.08, hr * 0.03, s.crown, { ...hd, caps: false });
  }
  if (s.wattle && !o.toucan && !o.hornbill) m.ell([hp[0] + hr * 0.45, hp[1] - hr * 0.95, 0], [hr * 0.22, hr * 0.38, hr * 0.14], s.wattle, hd); // crowned crane's red throat wattle
  if (s.gorget) m.ell([hp[0] + hr * 0.4, hp[1] - hr * 0.5, 0], [hr * 0.62, hr * 0.5, hr * 0.78], s.gorget, hd); // a hummingbird's shining throat
  if (s.nape) m.ell([hp[0] - hr * 0.45, hp[1] + hr * 0.05, 0], [hr * 0.6, hr * 0.62, hr * 0.85], s.nape, hd);  // the lora's yellow nape
  if (s.cap) m.ell([hp[0] + hr * 0.15, hp[1] + hr * 0.5, 0], [hr * 0.8, hr * 0.55, hr * 0.85], s.cap, hd); // (the noddy's white cap)
  if (s.velvet) m.ell([hp[0] + hr * 0.55, hp[1] + hr * 0.45, 0], [hr * 0.45, hr * 0.35, hr * 0.5], s.velvet, hd); // black velvet forehead
  if (o.fluffy) m.ell([-S * 0.08, by + S * 0.04, 0], [S * 0.46, S * 0.33, S * 0.36], s.color); // plumes bulk out the body
  if (s.crest === 'double') {
    // harpy: a split crest of grey plumes that fans up when it's alert
    for (const side of [1, -1]) m.limb([hp[0] - hr * 0.3, hp[1] + hr * 0.7, side * hr * 0.2], [hp[0] - hr * 0.9, hp[1] + hr * 1.55, side * hr * 0.55], hr * 0.28, hr * 0.06, shade(s.head, -0.35), hd);
  } else if (s.crest === 'spiky') {
    // hoatzin: a ragged fan of stiff rufous spikes
    for (let k = 0; k < 7; k++) {
      const a = -0.25 + k * 0.28, z = (k % 2 ? 1 : -1) * hr * 0.08 * (k % 3);
      m.limb([hp[0] - hr * 0.1, hp[1] + hr * 0.75, z], [hp[0] - hr * 0.1 - Math.sin(a) * hr * 1.25, hp[1] + hr * 0.75 + Math.cos(a) * hr * 1.1, z * 2], hr * 0.1, hr * 0.03, s.crestColor || s.head, { ...hd, caps: false });
    }
  } else if (s.crest) m.limb([hp[0] - hr * 0.2, hp[1] + hr * 0.7, 0], [hp[0] - hr * 1.2, hp[1] + hr * 1.3, 0], hr * 0.35, hr * 0.05, s.head, hd);
  if (s.fancy) {
    tube(m, [[hp[0] - hr * 0.1, hp[1] + hr * 0.62, 0], [hp[0] - hr * 0.8, hp[1] + hr * 0.5, 0], [hp[0] - hr * 1.55, hp[1] + hr * 0.06, 0]], [[hr * 0.3, hr * 0.65], [hr * 0.24, hr * 0.48], [hr * 0.07, hr * 0.08]], s.head, hd);
    for (const side of [-1, 1]) {
      tube(m, [[hp[0] + hr * 0.58, hp[1] - hr * 0.35, side * hr * 0.8], [hp[0] - hr * 0.08, hp[1] - hr * 0.63, side * hr * 0.72], [hp[0] - hr * 0.98, hp[1] - hr * 0.26, side * hr * 0.43]], [hr * 0.075, hr * 0.08, hr * 0.04], '#f6f0db', hd);
      tube(m, [[hp[0] + hr * 0.15, hp[1] + hr * 0.56, side * hr * 0.78], [hp[0] - hr * 0.65, hp[1] + hr * 0.42, side * hr * 0.7], [hp[0] - hr * 1.42, hp[1] + hr * 0.07, side * hr * 0.15]], [hr * 0.055, hr * 0.055, hr * 0.025], '#f6f0db', hd);
    }
  } else if (s.woodduck) {
    tube(m, [[hp[0] - hr * 0.15, hp[1] + hr * 0.62, 0], [hp[0] - hr * 0.7, hp[1] + hr * 0.4, 0], [hp[0] - hr * 1.12, hp[1] + hr * 0.05, 0]], [[hr * 0.22, hr * 0.5], [hr * 0.16, hr * 0.35], [hr * 0.03, hr * 0.05]], s.head, hd);
  }
  if (s.faceStripe) for (const side of [-1, 1]) {
    tube(m, [[hp[0] + hr * 0.78, hp[1] + hr * 0.23, side * hr * 0.6], [hp[0] + hr * 0.32, hp[1] + hr * 0.25, side * hr * 0.88], [hp[0] - hr * 0.62, hp[1] + hr * 0.1, side * hr * 0.7]], [hr * 0.05, hr * 0.07, hr * 0.035], '#54432e', hd);
  }
  const bb = [hp[0] + hr * 0.85, hp[1] - hr * (o.duck ? 0.25 : 0.1), 0], bl = S * o.beak;
  if (o.toucan) {
    // the toco's huge bill: two flat-sided mandibles, deepest where they leave the face, tapering
    // to a down-curved tip; orange with a deeper ridge, a thin black ring at the base and a big
    // black spot at the tip. A white throat bib beneath, bare orange skin round a blue eye-ring.
    const L = S * 0.62, at = (x, y) => [bb[0] + L * x, bb[1] + hr * y, 0], base = bb[0] + hr * 0.1;
    const upper = (u, p) => p.x < base ? col('#141210') : u.x > 0.44 + 0.08 * u.y * u.y ? col('#141210') : u.y > 0.72 ? col(shade(s.bill, -0.12)) : u.y < -0.4 ? col(shade(s.bill, 0.12)) : col(s.bill);
    const lower = (u, p) => p.x < base ? col('#141210') : u.x > 0.7 ? col('#141210') : col(s.bill);
    tube(m, [at(-0.22, 0.12), at(0.3, 0.02), at(0.66, -0.2), at(1, -0.62)], [[hr * 0.5, hr * 0.34], [hr * 0.4, hr * 0.25], [hr * 0.25, hr * 0.16], [hr * 0.04, hr * 0.03]], upper, { ...hd, sub: 6, seg: 12, capRings: 2 });
    tube(m, [at(-0.2, -0.32), at(0.35, -0.36), at(0.82, -0.56)], [[hr * 0.24, hr * 0.3], [hr * 0.16, hr * 0.2], [hr * 0.04, hr * 0.04]], lower, { ...hd, sub: 6, seg: 12, capRings: 2 });
    m.ell([hp[0] + hr * 0.3, hp[1] - hr * 0.8, 0], [hr * 0.7, hr * 0.7, hr * 0.8], s.breast, hd);
    for (const side of [1, -1]) {
      m.ell([hp[0] + hr * 0.45, hp[1] + hr * 0.22, side * hr * 0.68], [hr * 0.42, hr * 0.34, hr * 0.12], s.wattle || '#f0a030', { ...hd, lo: true });
      if (!s.wattle) m.ell([hp[0] + hr * 0.45, hp[1] + hr * 0.25, side * hr * 0.72], [hr * 0.29, hr * 0.29, hr * 0.12], '#3a8ae0', { ...hd, lo: true });
    }
    if (s.wattle) m.ell([hp[0] + hr * 0.4, hp[1] - hr * 0.95, 0], [hr * 0.55, hr * 0.5, hr * 0.5], s.wattle, hd); // ground hornbill's red throat
  } else if (o.hornbill && s.casque) {
    // rhinoceros hornbill: a long, down-curved ivory bill, yellower at the base, topped by a great
    // orange-red casque that rides along the bill and sweeps up and back at the front like a horn
    const at = (x, y) => [bb[0] + S * x, bb[1] + S * y, 0];
    const bill = (u, p) => tmp.copy(col('#e8a838')).lerp(col(s.bill), smooth(bb[0], bb[0] + S * 0.18, p.x));
    const casque = (u, p) => tmp.copy(col('#f0b838')).lerp(col(s.casque), smooth(bb[1] + S * 0.03, bb[1] + S * 0.13, p.y));
    const bp = [at(-0.02, 0), at(0.18, -0.045), at(0.32, -0.13), at(0.42, -0.25)], br = [0.065, 0.045, 0.026, 0.006];
    for (let k = 1; k < 4; k++) m.limb(bp[k - 1], bp[k], S * br[k - 1], S * br[k], bill, { ...hd, caps: k < 3 });
    m.ell(at(0.08, 0.035), [S * 0.13, S * 0.045, S * 0.03], casque, hd);
    const cp = [at(0.0, 0.05), at(0.15, 0.055), at(0.24, 0.1), at(0.235, 0.18), at(0.17, 0.235)], cr = [0.045, 0.042, 0.034, 0.022, 0.008];
    for (let k = 1; k < 5; k++) m.limb(cp[k - 1], cp[k], S * cr[k - 1], S * cr[k], casque, { ...hd, caps: k < 4 });
  } else if (o.hornbill) {
    // southern ground hornbill: a heavy, down-curved black bill with a low casque on top, and a
    // big bare red throat pouch below it
    const t0 = bb, t1 = [bb[0] + S * 0.17, bb[1] - S * 0.04, 0], t2 = [bb[0] + S * 0.3, bb[1] - S * 0.14, 0];
    m.limb(t0, t1, S * 0.06, S * 0.042, o.beakColor, hd); m.limb(t1, t2, S * 0.042, S * 0.008, o.beakColor, { ...hd, caps: false });
    m.limb([bb[0], bb[1] - S * 0.035, 0], [bb[0] + S * 0.2, bb[1] - S * 0.1, 0], S * 0.035, S * 0.01, shade(o.beakColor, 0.08), { ...hd, caps: false }); // lower mandible
    m.ell([bb[0] + S * 0.05, bb[1] + S * 0.045, 0], [S * 0.085, S * 0.03, S * 0.028], o.beakColor, hd); // casque
    m.ell([hp[0] + hr * 0.35, hp[1] - hr * 1.05, 0], [hr * 0.75, hr * 0.7, hr * 0.62], s.wattle, hd);    // throat pouch
    m.ell([hp[0] + hr * 0.1, hp[1] - hr * 0.55, 0], [hr * 0.6, hr * 0.45, hr * 0.8], s.wattle, hd);
  } else if (s.spoonbill) {
    m.ell([bb[0] + bl * 0.36, bb[1], 0], [bl * 0.48, hr * 0.13, hr * 0.18], '#a2a48b', hd);
    m.ell([bb[0] + bl * 0.86, bb[1] - hr * 0.025, 0], [bl * 0.24, hr * 0.12, hr * 0.44], '#92977f', hd);
  } else if (o.duck) {
    m.ell([bb[0] + bl * 0.45, bb[1], 0], [bl * 0.6, hr * 0.18, hr * 0.42], s.fancy ? u => u.x > 0.65 ? col('#241a19') : u.y > 0.3 ? col('#e5cbaa') : col('#b94c44') : s.mallard && s.mottled ? u => u.y > 0.35 ? col('#594632') : col(o.beakColor) : o.beakColor, hd);
    if (detailedDuck) for (const side of [-1, 1]) {
      m.ell([bb[0] + bl * 0.38, bb[1] + hr * 0.14, side * hr * 0.19], [S * 0.026, S * 0.008, S * 0.012], '#332d24', hd);
      tube(m, [[bb[0], bb[1] - hr * 0.025, side * hr * 0.3], [bb[0] + bl * 0.48, bb[1] - hr * 0.04, side * hr * 0.39], [bb[0] + bl * 0.93, bb[1] - hr * 0.015, side * hr * 0.2]], [S * 0.004, S * 0.005, S * 0.002], '#44362a', { ...hd, sub: 2, seg: 4 });
    }
  }
  else {
    if (o.macaw) {
      // bare white face and a deep, hooked two-tone bill
      if (s.faceSkin !== null) for (const side of [1, -1]) m.ell([hp[0] + hr * 0.45, hp[1] - hr * 0.05, side * hr * 0.7], [hr * 0.5, hr * 0.45, hr * 0.2], s.faceSkin || '#f4f0ea', hd);
      m.ell([bb[0] + S * 0.03, bb[1] - S * 0.03, 0], [S * 0.07, S * 0.08, S * 0.06], '#2a2420', { ...hd, lo: true });
    }
    const b0 = [bb[0] - hr * 0.12, bb[1], 0], r0 = o.beakR != null ? S * o.beakR : Math.max(S * 0.04, hr * 0.32);
    const bm = [bb[0] + bl * 0.55, bb[1] - (o.hook ? bl * 0.08 : bl * 0.03), 0], b1 = [bb[0] + bl, bb[1] - (o.hook ? bl * 0.35 : bl * 0.1), 0];
    if (o.hook) {
      // a deep bill whose upper half arches over and drops into a sharp downward hook, with a bare
      // waxy cere at its base on a hawk or an eagle
      const bill = o.cere ? u => u.x < -0.45 ? col(o.cere) : col(o.beakColor) : o.beakColor;
      tube(m, [b0, [bb[0] + bl * 0.45, bb[1] + r0 * 0.05, 0], [bb[0] + bl * 0.88, bb[1] - bl * 0.16, 0], [bb[0] + bl * 0.94, bb[1] - bl * 0.42, 0]],
        [[r0, r0 * 0.78], [r0 * 0.78, r0 * 0.52], [r0 * 0.42, r0 * 0.3], [S * 0.006, S * 0.006]], bill, { ...hd, seg: 8, sub: 3, capRings: 1 });
      m.limb([b0[0], b0[1] - r0 * 0.45, 0], [bb[0] + bl * 0.55, bb[1] - r0 * 0.75, 0], r0 * 0.6, S * 0.008, o.beakColor, { ...hd, caps: false }); // lower mandible
    } else {
      m.limb(b0, bm, r0, r0 * 0.55, o.beakColor, { ...hd, caps: false });
      m.limb(bm, b1, r0 * 0.55, S * 0.006, o.beakColor, { ...hd, caps: false });
    }
    if (o.gape) m.limb([b0[0] + hr * 0.05, b0[1] - r0 * 0.15, 0], [bm[0] + bl * 0.2, bm[1] - r0 * 0.12, 0], r0 * 1.02, r0 * 0.5, shade(o.beakColor, -0.35), { ...hd, caps: false }); // the line of the gape
  }

  birdTail(m, s, o, bodyAt(-bodyR[0] * 0.8 * (1 + stretch * 0.8), S * 0.02 + bodyR[1] * 0.064, 0));
  if (s.curlTail) for (const side of [-1, 1]) {
    const base = [-S * 0.48, by + S * 0.06, side * S * 0.025];
    tube(m, [base, [-S * 0.59, by + S * 0.09, base[2]], [-S * 0.6, by + S * 0.16, base[2]], [-S * 0.54, by + S * 0.17, base[2]]], [S * 0.012, S * 0.011, S * 0.009, S * 0.004], '#252a24', { part: P.TAIL, pivot: base });
  }
  // a coloured patch under the tail (a bulbul's red vent, a rhinoceros hornbill's white one)
  const vent = s.vent || (o.hornbill && s.casque ? s.tail : null);
  if (vent) m.ell([-S * 0.2, by - S * 0.14, 0], [S * 0.17, S * 0.1, S * 0.13], vent, { rot: [0, 0, o.tilt] });

  // legs
  if (!o.duck && !o.swimmer) for (const side of [1, -1]) {
    const hip = [S * 0.02, by - S * 0.12, side * S * (o.tall ? 0.13 : 0.07)];
    const lp = { part: side > 0 ? P.LEG_FL : P.LEG_FR, pivot: hip }, thick = s.bigFeet ? 1.9 : o.tall ? 1.8 : o.hornbill ? 1.5 : 1;
    m.limb(hip, [S * 0.04, S * 0.02, side * S * (o.tall ? 0.11 : 0.08)], S * (o.legH > 0.5 ? 0.028 : 0.035) * thick, S * 0.022 * thick, o.legColor, lp);
    if (o.tall) { // an ostrich's bare, muscular thighs, and its big two-toed feet
      m.limb([S * 0.0, by - S * 0.05, side * S * 0.14], [S * 0.06, by - S * 0.55, side * S * 0.12], S * 0.1, S * 0.05, o.legColor, lp);
      m.ell([S * 0.1, S * 0.025, side * S * 0.11], [S * 0.09, S * 0.03, S * 0.045], shade(o.legColor, -0.15), { ...lp, lo: true });
    }
    if (o.secretary) m.limb(hip, [S * 0.03, by - S * 0.62, side * S * 0.08], S * 0.075, S * 0.05, '#1a1a1a', lp); // feathered black thighs
    if (!o.tall && !s.bigFeet) {
      const z = side * S * 0.08, foot = [S * 0.04, S * 0.02, z];
      const grip = o.macaw || pecker || o.toucan;
      for (const t of [-1, 0, 1]) {
        const back = grip && t === -1, dx = back ? -0.065 : 0.075;
        m.limb(foot, [foot[0] + S * dx, S * 0.009, z + t * S * 0.032], S * 0.01, S * 0.005, o.legColor, { ...lp, caps: false });
      }
      m.limb(foot, [foot[0] - S * 0.05, S * 0.012, z + S * 0.017], S * 0.009, S * 0.004, o.legColor, { ...lp, caps: false });
    }
    if (s.bigFeet) for (const t of [-1, 0, 1]) m.limb([S * 0.04, S * 0.02, side * S * 0.08], [S * (0.04 + 0.07 * (t === 0 ? 1 : 0.6)), S * 0.005, side * S * 0.08 + t * S * 0.04], S * 0.02, S * 0.01, '#2a2420', { ...lp, caps: false });
  }

  if (o.duck || o.swimmer) for (const side of [-1, 1]) {
    const hip = [-S * 0.08, by - S * 0.14, side * S * 0.12], lp = { part: side > 0 ? P.LEG_FL : P.LEG_FR, pivot: hip };
    const foot = [-S * 0.04, S * 0.025, side * S * 0.14];
    m.limb(hip, foot, S * 0.025, S * 0.018, o.legColor, lp);
    m.add(TAIL_FEATHER, place([foot[0] + S * 0.08, foot[1], foot[2]], [0, 0, 0], [S * 0.13, S * 0.014, S * 0.1]), o.legColor, lp);
  }

  // wings
  // coverts in the body colour, darker flight feathers along the trailing edge and out to the tip
  const covert = col(o.owl ? s.color : shade(s.color, 0.04)), flight = col(s.flight || shade(s.color, o.owl ? -0.15 : -0.4));
  const spec = s.speculum ? col(s.speculum) : null;
  const plain = u => {
    const a = Math.abs(u.z), x = u.x, back = x < -0.08 + a * 0.12; // the flight-feather zone
    if (s.wing) return a > 0.62 || x < -0.12 ? col(s.wingtip) : x < 0.14 ? col(s.wing) : col(s.color); // scarlet macaw: red, yellow band, blue
    if (spec && back && a > 0.18 && a < 0.5) return (s.woodduck || s.mallard) && (x < -0.35 || x > -0.14 + a * 0.12) ? col('#eae5d8') : spec; // white-edged speculum on both sexes
    if (back || a > 0.72) return flight;
    if (s.mottled) return covert;
    return x > 0.36 && a < 0.5 ? col(shade(s.color, 0.1)) : covert;                                // pale leading edge
  };
  // (a barred owl's bars across the whole wing, a hen's mottled coverts: per pixel, coatBars and coatMottled)
  const wc = s.barred ? pixelCoat('bars', solid(covert), [2, 25, 0, 0.3, 1, -9], shade(s.breast, -0.12)) : s.mottled ? pixelCoat('mottled', plain, [1], s.color) : plain;
  const shape = s.wingShape || WING_KIND[s.kind] || 'round';
  // the body's half-width a given distance forward of the wing's fold point (see the body above),
  // so the folded wing lies on the shoulder and tapers in over the rump, the tips crossing above the tail
  const wrapR = lx => {
    const x = lx - S * 0.02, a0 = x / bodyR[0], a = a0 < 0 ? x / (bodyR[0] * (1 + stretch * Math.min(1, -a0))) : a0, back = Math.max(0, -a);
    return bodyR[2] * 1.04 * Math.max(o.owl ? 0.7 : 0.5, (1 - 0.3 * back * back) * Math.sqrt(Math.max(0, 1 - Math.min(1, a * a))));
  };
  for (const side of [1, -1]) {
    // folded, a wing starts at the shoulder and reaches about to the tail tip, however long it is spread
    // (an owl's end at its tail, not below it)
    const L = Math.min(1.2 * o.span, o.owl ? 0.75 : s.kind === 'booby' ? 0.92 : o.long || 1.0), foldLen = L / (1.2 * o.span);
    m.wing(side, [S * 0.1, by + S * 0.1, side * S * 0.14], S * o.span, S * o.chord * (shape === 'fingered' ? 1.15 : 1), S * 0.02, wc, [-S * 0.02, by, 0], shape, wrapR, o.tilt * 0.8, foldLen, S * Math.min(o.span * 0.5 * foldLen, 0.3), o.up ?? 0.55); // (resting, folded wings ride up over the back)
    if (detailedDuck) {
      // Shingled scapular feathers follow the folded flank and spread with the wing.
      const pivot = [S * 0.1, by + S * 0.1, side * S * 0.14], part = side > 0 ? P.WING_L : P.WING_R;
      for (let f = 0; f < 7; f++) {
        const t = f / 6, root = [S * (0.22 - t * 0.44), by + S * (0.16 - t * 0.03), side * S * (0.2 + Math.sin(t * Math.PI) * 0.035)];
        const paint = u => shade(s.color, -u.x > 0.7 ? -0.22 : 0.08 + f % 2 * 0.035);
        const folded = place(root, [side * 0.16, side * 0.12, 0.14], [S * 0.22, S * 0.008, S * 0.1]);
        const spread = place([S * (0.09 - t * 0.03), by + S * 0.1, side * S * (0.15 + t * 0.42)], [0, side * 0.38, 0], [S * 0.2, S * 0.008, S * 0.1]);
        m.add(TAIL_FEATHER, folded, paint, { part, pivot, ext: spread });
      }
    }
  }
}

export { BIRDS, bird };
