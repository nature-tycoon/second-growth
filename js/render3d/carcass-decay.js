// How a kill breaks down on screen. The hunter's meal and each scavenger's share strip it, and
// time rots it: the torso's flesh draws back onto the spine, belly first, baring the ribcage, then
// the legs, head and tail wither onto their bones. The skeleton slumps into a scattered pile, and
// the bones go one by one, the skull and pelvis last. Drawing only: the carcass itself is
// sim/animal-life.js (startFeed, feedAt) and its timer sim/animals.js. The flesh is pulled in the
// animal shader (decay() in animals/animal-material.js); the bones are drawn here, one skeleton
// per species, fitted to its model.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { clamp } from '../config.js';
import { mulberry32 } from '../rng.js';
import { prep, rod, soft } from './geometry/primitives.js';

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
// (picked as they look on screen; vertex colours multiply in linear light)
const linear = c => c.map(v => v ** 2.2);

// eaten: the share of the meat gone to the hunter (its first 30%, over its own feed) and the
// scavengers (the next 50%, a meal at a time). The rest of the stages run on the carcass's age
// (u, 0 at the kill to 1 when it's removed):
//   strip: how far the torso's flesh has drawn back (eaten, then rot takes the rest by u 0.5)
//   wither: legs, head and tail shrinking onto their bones (u 0.35-0.65)
//   settle, scatter: the skeleton slumping flat and spreading into a pile (u 0.55-0.95)
//   gone: the bones disappearing, each at its own point (u 0.68-1)
// dry: the meat and coat drying out (u 0.15-0.55). bone: the bones' colour multiplier (linear).
export function carcassDecay(c) {
  const max = c.max > 0 ? c.max : 1, u = clamp((max - c.t) / max, 0, 1);
  // (nothing hunted an animal that died of age, hunger or sickness: its body starts whole)
  const hunter = c.feed > 0 ? clamp((max - c.t) / c.feed, 0, 1) : c.by == null ? 0 : 1;
  const shared = c.meals0 > 0 ? 1 - clamp(c.meals, 0, c.meals0) / c.meals0 : 0;
  const eaten = 0.3 * hunter + 0.5 * shared;
  const strip = 1 - (1 - eaten) * (1 - smooth(0.04, 0.5, u));
  const wither = smooth(0.35, 0.65, u);
  // (the coat dulling and the meat going from red to dark brown are the shader's, from dry)
  const dry = smooth(0.15, 0.55, u);
  // (bones show bloody when first bared, and bleach pale as the weeks pass)
  const bleach = smooth(0.3, 0.8, u);
  const bone = linear([mix(0.92, 0.97, bleach), mix(0.74, 0.94, bleach), mix(0.68, 0.86, bleach)]);
  return {
    u, eaten, strip, wither, dry, bone,
    settle: smooth(0.55, 0.75, u), scatter: smooth(0.55, 0.95, u), gone: smooth(0.68, 1, u),
    body: wither < 1, bones: strip > 0.25,
  };
}

// The body plan a skeleton is fitted to, measured from a species' model (model units, x forward,
// y up): the torso's spine and belly heights and half-width between the shoulders and hips; each
// leg traced from its hip through its knee and hock to its foot; the tail traced from its root to
// its tip; and the skull (see skullFit). Legs or a tail a model doesn't have are null.
export function carcassAnatomy(geo, motion = null) {
  const pos = geo.attributes.position, part = geo.attributes.aPart, piv = geo.attributes.aPivot;
  const ranges = geo.userData.hard || [], isHard = i => ranges.some(([a, b]) => i >= a && i < b);
  const hips = [null, null, null, null], legPts = [[], [], [], []], body = [], head = [], tailPts = [];
  let neck = null, tailRoot = null;
  for (let i = 0; i < pos.count; i++) {
    const k = Math.round(part.getX(i)), v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (k === 0) body.push(v.x, v.y, v.z);
    else if (k >= 1 && k <= 4) { hips[k - 1] ||= new THREE.Vector3(piv.getX(i), piv.getY(i), piv.getZ(i)); legPts[k - 1].push(v); }
    else if (k === 5) { tailRoot ||= new THREE.Vector3(piv.getX(i), piv.getY(i), piv.getZ(i)); tailPts.push(v); }
    else if (k === 8 && !isHard(i)) { neck ||= new THREE.Vector3(piv.getX(i), piv.getY(i), piv.getZ(i)); head.push(v); }
  }
  const xs = [];
  for (let i = 0; i < body.length; i += 3) xs.push(body[i]);
  xs.sort((a, b) => a - b);
  const x0 = xs[Math.floor(xs.length * 0.04)] ?? -1, x1 = xs[Math.floor(xs.length * 0.96)] ?? 1;
  const legX = hips.filter(Boolean).map(h => h.x);
  const front = legX.length ? Math.max(...legX) : mix(x0, x1, 0.75), back = legX.length ? Math.min(...legX) : mix(x0, x1, 0.25);
  let top = -Infinity, bottom = Infinity, wide = 0;
  for (let i = 0; i < body.length; i += 3) {
    if (body[i] < back || body[i] > front) continue;
    top = Math.max(top, body[i + 1]); bottom = Math.min(bottom, body[i + 1]); wide = Math.max(wide, Math.abs(body[i + 2]));
  }
  if (!Number.isFinite(top)) { top = 1; bottom = 0; wide = 0.5; }
  const H = top - bottom;
  // each leg: the middle of the leg at two thirds and a third of the way down (the knee or elbow,
  // and the hock or wrist), so the bones follow its bends
  const legs = hips.map((h, k) => {
    const pts = legPts[k];
    if (!h || !pts.length) return null;
    const foot = pts.reduce((a, b) => b.y < a.y ? b : a).clone(); foot.y = Math.max(foot.y, H * 0.05);
    const band = y => { const near = pts.filter(p => Math.abs(p.y - y) < (h.y - foot.y) * 0.07); if (!near.length) return null; const c = new THREE.Vector3(); for (const p of near) c.add(p); return c.divideScalar(near.length); };
    const knee = band(mix(foot.y, h.y, 0.66)) || h.clone().lerp(foot, 0.34), hock = band(mix(foot.y, h.y, 0.3)) || h.clone().lerp(foot, 0.7);
    return [h.clone(), knee, hock, foot];
  });
  // the tail: the middle of the tail in six steps out from its root
  let tail = null;
  if (tailRoot && tailPts.length > 8) {
    const far = Math.max(...tailPts.map(p => p.distanceTo(tailRoot)));
    tail = [tailRoot.clone()];
    for (let k = 1; k <= 6; k++) {
      const near = tailPts.filter(p => Math.abs(p.distanceTo(tailRoot) - far * k / 6.5) < far / 13);
      if (!near.length) continue;
      const c = new THREE.Vector3(); for (const p of near) c.add(p); c.divideScalar(near.length);
      tail.push(c);
    }
    if (tail.length < 3) tail = null;
  }
  neck ||= new THREE.Vector3(x1, top - H * 0.1, 0);
  return { x0, x1, front, back, spineY: top - H * 0.1, bellyY: bottom + H * 0.08, W: wide * 0.86, hips, legs, feet: legs.map(l => l?.[3] || null), tail, neck,
    ...skullFit(head, neck, motion, H, x1 - x0), hard: hardParts(geo) };
}

// The skull, in two measured parts so each species keeps its own face: the cranium behind the
// eyes, as wide as the eyes are apart, and the muzzle from the eyes to the snout tip (a cat's is
// short, a crocodile's long). The snout tip is the head's foremost point near eye level, so an
// elephant's or a tapir's trunk and a rhino's horn don't count. Models with no eye position
// (motion.eyeSpot) fall back to the head's own proportions.
//   base: on the skull's axis below the eyes; dir: along the muzzle; up: across it, upward
//   muzzle, cranium: lengths in front of and behind base; wide, tall: the cranium's half-sizes
function skullFit(head, neck, motion, H, L) {
  const pct = (list, f, fallback) => list.length ? [...list].sort((a, b) => a - b)[Math.floor(list.length * f)] : fallback;
  const spot = motion?.eyeSpot || motion?.eye, eye = spot ? new THREE.Vector3(spot[0], spot[1], 0) : null;
  const pool = eye ? head.filter(p => p.y > eye.y - H * 0.45 && p.y < eye.y + H * 0.3 && p.x > eye.x) : head;
  let snout = pool.length ? pool.reduce((a, b) => b.x > a.x ? b : a).clone() : neck.clone().add(new THREE.Vector3(H * 0.6, 0, 0));
  snout.z = 0;
  let wide, tall, base, dir, up = new THREE.Vector3();
  const place = () => { base = eye.clone().addScaledVector(up.set(0, 1, 0), -0.35 * tall); dir = snout.clone().sub(base).normalize(); up.set(-dir.y, dir.x, 0); base = eye.clone().addScaledVector(up, -0.35 * tall); };
  if (eye && snout.x > eye.x) {
    // as wide as the eyes are apart, or as most of the head beside them where that's wider (a
    // crocodile's eyes sit close together on a broad, flat head; a cat's face forward)
    const eyeWide = Math.abs(spot[2]) / 0.8, beside = head.filter(p => Math.abs(p.x - eye.x) < eyeWide * 0.6).map(p => Math.abs(p.z));
    wide = clamp(Math.max(eyeWide, pct(beside, 0.7, 0) * 0.9), H * 0.08, H * 0.7); tall = wide;
    place();
    // as deep as most of the head around the eyes, from the axis
    const hs = head.filter(p => { const d = p.clone().sub(base).dot(dir); return d > -1.3 * wide && d < 0.3 * wide; }).map(p => Math.abs(p.clone().sub(base).dot(up)));
    tall = clamp(pct(hs, 0.7, wide), wide * 0.5, wide * 1.25);
    place();
  } else {
    const mid = head.length ? new THREE.Vector3(pct(head.map(p => p.x), 0.5), pct(head.map(p => p.y), 0.5), 0) : neck.clone().lerp(snout, 0.7);
    dir = snout.clone().sub(mid); if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    const len = clamp(dir.length() * 2, H * 0.55, H * 0.85); dir.normalize(); up.set(-dir.y, dir.x, 0);
    wide = len * 0.21; tall = len * 0.2;
    base = snout.clone().addScaledVector(dir, -len * 0.67);
  }
  const muzzle = clamp(snout.clone().sub(base).dot(dir), wide * 0.4, L * 0.9), cranium = 1.15 * wide; // (a gharial's snout is longer than its chest)
  // the muzzle's own width and depth at stations along it (most of the head there), so a
  // gharial's snout stays thin and a hippo's broad
  const profile = MUZZLE.map(([u]) => {
    const near = head.map(p => p.clone().sub(base)).filter(q => Math.abs(q.dot(dir) - u * muzzle) < muzzle * 0.08 + wide * 0.05);
    return near.length ? { w: pct(near.map(q => Math.abs(q.z)), 0.7), t: pct(near.map(q => Math.abs(q.dot(up))), 0.7) } : null;
  });
  // (a station with no vertices, along a plain tube, takes after the stations either side of it)
  profile.forEach((p, k) => {
    if (p) return;
    const prev = profile.slice(0, k).reverse().find(Boolean), next = profile.slice(k + 1).find(Boolean);
    profile[k] = prev && next ? { w: Math.min(prev.w, next.w), t: Math.min(prev.t, next.t) } : prev || next || { w: wide, t: tall };
  });
  const skull = { base, dir, up, muzzle, cranium, wide, tall, profile, len: muzzle + cranium, back: base.clone().addScaledVector(dir, -cranium) };
  return { snout, skull };
}

// The model's horns, antlers and tusks (the vertex ranges animals/model-core.js tags as hard), as
// their own triangles with their own colours, or null if it has none.
function hardParts(geo) {
  const ranges = geo.userData.hard;
  if (!ranges?.length) return null;
  const pos = geo.attributes.position, nor = geo.attributes.normal, col = geo.attributes.color, idx = geo.index;
  const P = [], N = [], C = [], hard = i => ranges.some(([a, b]) => i >= a && i < b);
  const tris = idx ? idx.count : pos.count, at = k => idx ? idx.getX(k) : k;
  for (let k = 0; k + 2 < tris; k += 3) {
    if (!hard(at(k))) continue;
    for (let j = 0; j < 3; j++) {
      const i = at(k + j);
      P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); N.push(nor.getX(i), nor.getY(i), nor.getZ(i)); C.push(col.getX(i), col.getY(i), col.getZ(i));
    }
  }
  if (!P.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}

// A species pool's anatomy, measured the first time one of its kind is drawn as a carcass and
// handed to its shader for pulling the flesh onto the bones.
export function fitCarcass(pool) {
  if (pool.anatomy) return pool.anatomy;
  const a = pool.anatomy = carcassAnatomy(pool.geo, pool.motion), u = pool.mat.userData.carcass;
  u.uTorso.value.set(a.spineY, a.bellyY); u.uNeck.value.copy(a.neck); u.uSnout.value.copy(a.snout);
  a.hips.forEach((hip, k) => { u.uHips.value[k].copy(hip || a.neck); u.uFeet.value[k].copy(a.feet[k] || hip || a.neck); });
  return a;
}

// A tube through elliptical cross-sections [x, y, ry, rz] along x, closed at both ends.
function loft(sections, seg = 10) {
  const pos = [], idx = [];
  for (const [x, y, ry, rz] of sections) for (let k = 0; k < seg; k++) {
    const a = k / seg * Math.PI * 2;
    pos.push(x, y + Math.sin(a) * ry, Math.cos(a) * rz);
  }
  for (let j = 0; j + 1 < sections.length; j++) for (let k = 0; k < seg; k++) {
    const a = j * seg + k, b = j * seg + (k + 1) % seg, c = a + seg, d = b + seg;
    idx.push(a, c, b, b, c, d);
  }
  for (const [j, flip] of [[0, true], [sections.length - 1, false]]) { // (end caps)
    const centre = pos.length / 3, [x, y] = sections[j];
    pos.push(x, y, 0);
    for (let k = 0; k < seg; k++) { const a = j * seg + k, b = j * seg + (k + 1) % seg; idx.push(...(flip ? [centre, b, a] : [centre, a, b])); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}
const DARK = 0x3a2c22; // (the hollows: eye sockets, nasal opening, hip sockets)

// The muzzle's stations: [along it, centre height, depth, width], the last three as shares of the
// cranium's half-sizes, before narrowing to the head's measured muzzle.
const MUZZLE = [[0.12, 0, 0.7, 0.68], [0.35, -0.08, 0.55, 0.5], [0.65, -0.15, 0.45, 0.4], [0.9, -0.2, 0.38, 0.34], [1, -0.22, 0.2, 0.22]];

// A skull in its own frame: x along the muzzle with the eyes at 0, the cranium behind (to
// -cranium) and the muzzle in front (to muzzle), y up, z across. wide and tall are the cranium's
// half-sizes; the muzzle tapers from about two thirds of them to a blunt tip, never wider or
// deeper than the head's own muzzle (profile).
function skullParts({ muzzle: M, cranium: C, wide: w, tall: t, profile }) {
  const parts = [], m = Math.min(w, t);
  const mz = MUZZLE.map(([u, y, ry, rz], k) => [u * M, y * t, Math.min(ry * t, (profile?.[k]?.t ?? t) * 0.85), Math.min(rz * w, (profile?.[k]?.w ?? w) * 0.85)]);
  const at = u => { // (the muzzle's section at a share of its length)
    let k = 0; while (k < mz.length - 2 && u * M > mz[k + 1][0]) k++;
    const [a, b] = [mz[k], mz[k + 1]], f = clamp((u * M - a[0]) / (b[0] - a[0] || 1), 0, 1);
    return { y: mix(a[1], b[1], f), ry: mix(a[2], b[2], f), rz: mix(a[3], b[3], f) };
  };
  // cranium, then the muzzle (the upper jaw)
  parts.push(soft(loft([[-C, 0.1 * t, 0.32 * t, 0.32 * w], [-0.9 * C, 0.12 * t, 0.72 * t, 0.72 * w], [-0.6 * C, 0.12 * t, t, w], [-0.25 * C, 0.1 * t, 0.95 * t, 0.95 * w], ...mz], 12)));
  const R = Math.min(w * (M < 1.3 * C ? 0.36 : 0.3), 0.5 * t); // (eye sockets: bigger in a short face, as a cat's)
  for (const side of [1, -1]) {
    // eye socket: a dark hollow ringed by a bony rim
    const eye = [0, 0.35 * t, side * 0.74 * w];
    parts.push(soft(new THREE.SphereGeometry(1, 8, 6), { color: DARK, transform: g => { g.scale(R, R * 0.9, R * 0.5); g.translate(...eye); } }));
    parts.push(soft(new THREE.TorusGeometry(R * 1.1, R * 0.25, 5, 12), { transform: g => { g.rotateY(side * 0.3); g.translate(eye[0], eye[1], eye[2] + side * R * 0.15); } }));
    // cheekbone (zygomatic arch), bowed out below the eye and back toward the ear
    const arch = [[0.12 * M, -0.25 * t, side * 0.66 * w], [-0.3 * C, -0.3 * t, side * 1.02 * w], [-0.75 * C, -0.15 * t, side * 0.85 * w]];
    parts.push(rod(arch[0], arch[1], 0.1 * m, 0.1 * m, 5), rod(arch[1], arch[2], 0.1 * m, 0.09 * m, 5));
    // lower jaw: up from its angle to the joint below the ear, and forward to the chin
    const joint = [-0.7 * C, -0.3 * t, side * 0.62 * w], angle = [-0.6 * C, -1.05 * t, side * 0.58 * w];
    parts.push(soft(new THREE.SphereGeometry(1, 8, 6), { transform: g => { g.scale(0.28 * C, 0.4 * t, 0.06 * w); g.translate(-0.62 * C, -0.65 * t, side * 0.6 * w); } }));
    parts.push(rod(joint, angle, 0.1 * m, 0.12 * m, 5));
    // (the jaw runs just under the muzzle, as wide and as thick as it allows)
    const jawAt = u => { const q = at(u); return [u * M, q.y - q.ry * 1.25, side * q.rz * 0.75]; }, jr = u => Math.min(0.13 * m, at(u).ry * 0.35);
    const jaw = [angle, jawAt(0.3), jawAt(0.7), jawAt(0.97)];
    for (let j = 0; j < 3; j++) parts.push(rod(jaw[j], jaw[j + 1], jr([0.15, 0.3, 0.7][j]), jr([0.3, 0.7, 0.97][j]), 5));
    // teeth along the upper jaw (a long jaw has more)
    const n = clamp(Math.round(M / (0.3 * w)), 4, 14);
    for (let k = 0; k < n; k++) {
      const u = mix(0.15, 0.85, k / (n - 1)), q = at(u);
      parts.push(soft(new THREE.IcosahedronGeometry(Math.min(0.07 * m, q.rz * 0.25), 0), { transform: g => g.translate(u * M, q.y - q.ry * 0.95, side * q.rz * 0.7) }));
    }
    // the knuckles the skull sits on the spine by
    parts.push(soft(new THREE.IcosahedronGeometry(0.14 * m, 0), { transform: g => g.translate(-C, -0.15 * t, side * 0.2 * w) }));
  }
  const tip = mz[mz.length - 1];
  parts.push(soft(new THREE.SphereGeometry(1, 8, 6), { color: DARK, transform: g => { g.scale(0.03 * M + 0.02 * w, tip[2] * 0.6, tip[3] * 0.65); g.translate(0.99 * M, tip[1], 0); } })); // (nasal opening)
  return parts;
}

// A lofted blade from p to q: thin across one way (y), wide the other (z), its wide side turned
// toward up. sections: [t along it, thin half-size, wide half-size], in torso depths H.
function bladeH(p, q, sections, up, H) {
  const d = q.clone().sub(p), len = d.length(); d.normalize();
  const wideAxis = up.clone().addScaledVector(d, -up.dot(d)).normalize(), thin = new THREE.Vector3().crossVectors(wideAxis, d);
  const g = loft(sections.map(([t, ry, rz]) => [t * len, 0, ry * H, rz * H]), 12);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(d, thin, wideAxis).setPosition(p));
  return soft(g);
}

// Each hip bone either side of the sacrum: the ilium a flat blade flaring forward and up toward
// the spine, the hip socket where the leg meets it, and the ischium and pubis behind and below
// it closing a loop around the obturator hole. a: anatomy, socket: where the leg's hip is.
function pelvisParts(a, H, L) {
  const parts = [], blade = (p, q, sections, up) => bladeH(p, q, sections, up, H);
  const tail = a.back - L * 0.1, sacrumY = a.spineY - H * 0.02;
  // sacrum: the fused vertebrae between the hip bones, a broad wedge on the spine
  parts.push(blade(new THREE.Vector3(a.back + L * 0.14, sacrumY, 0), new THREE.Vector3(tail, sacrumY, 0),
    [[0, 0.04, 0.05], [0.15, 0.06, 0.14], [0.45, 0.055, 0.11], [0.8, 0.04, 0.06], [1, 0.03, 0.03]], new THREE.Vector3(0, 0, 1)));
  for (let k = 0; k < 4; k++) parts.push(soft(new THREE.IcosahedronGeometry(H * 0.035, 0), { transform: g => { g.scale(1, 1.6, 0.6); g.translate(mix(a.back + L * 0.1, tail + L * 0.03, k / 3), sacrumY + H * 0.08, 0); } }));
  const legs = [a.hips[2], a.hips[3]].filter(Boolean);
  for (const side of [1, -1]) {
    const hip = legs.find(v => Math.sign(v.z || side) === side);
    const socket = new THREE.Vector3(hip ? hip.x : a.back, (hip ? hip.y : a.bellyY) + H * 0.12, side * Math.min(Math.abs(hip?.z ?? a.W * 0.5), a.W * 0.62));
    // ilium: from the socket forward and up to its broad wing beside the sacrum
    const wing = new THREE.Vector3(a.back + L * 0.22, a.spineY - H * 0.12, side * a.W * 0.62);
    parts.push(blade(socket, wing, [[0, 0.05, 0.05], [0.25, 0.035, 0.06], [0.55, 0.028, 0.12], [0.85, 0.028, 0.19], [0.97, 0.025, 0.14], [1, 0.02, 0.05]], new THREE.Vector3(0, 0.6, side)));
    // hip socket: a dark cup with a raised rim, facing out
    parts.push(soft(new THREE.SphereGeometry(1, 8, 6), { color: DARK, transform: g => { g.scale(H * 0.06, H * 0.06, H * 0.03); g.translate(socket.x, socket.y, socket.z + side * H * 0.03); } }));
    parts.push(soft(new THREE.TorusGeometry(H * 0.07, H * 0.025, 5, 12), { transform: g => g.translate(socket.x, socket.y, socket.z + side * H * 0.035) }));
    // ischium back to its knobbed tuberosity, and the pubis down to the midline; joined below,
    // they frame the obturator hole
    const tuber = new THREE.Vector3(a.back - L * 0.12, socket.y - H * 0.04, side * a.W * 0.42);
    const pubis = new THREE.Vector3(a.back - L * 0.02, socket.y - H * 0.2, side * a.W * 0.06);
    const floor = new THREE.Vector3(a.back - L * 0.09, socket.y - H * 0.2, side * a.W * 0.06);
    parts.push(blade(socket, tuber, [[0, 0.045, 0.05], [0.5, 0.03, 0.05], [1, 0.045, 0.06]], new THREE.Vector3(0, 1, 0)));
    parts.push(soft(new THREE.SphereGeometry(1, 8, 6), { transform: g => { g.scale(H * 0.07, H * 0.06, H * 0.045); g.translate(tuber.x, tuber.y, tuber.z); } }));
    parts.push(rod(socket.toArray(), pubis.toArray(), H * 0.035, H * 0.03, 5), rod(pubis.toArray(), floor.toArray(), H * 0.04, H * 0.04, 5), rod(floor.toArray(), tuber.toArray(), H * 0.035, H * 0.04, 5));
  }
  return parts;
}

// The skeleton, in the same model space as the body, as pieces that each carry their centre,
// a scatter direction (along the ground once it's on its side) and a point in [0, 1] at which
// they disappear. aBone: (disappear at, radius, whether it shows only once its limb withers,
// kind: 0 spine, 1 rib, 2 pelvis, 3 leg or shoulder blade, 4 neck, 5 skull, 6 horns, antlers and
// tusks, which keep their own colour and go with the skull, 7 tail).
export function remainsGeometry(a, seed = 1) {
  const r = mulberry32(seed), H = a.spineY - a.bellyY, L = a.x1 - a.x0, pieces = [];
  // (like: another piece this one is attached to, sharing its centre, scatter and radius)
  const piece = (parts, gone, late, kind, like = null) => {
    const g = mergeGeometries(parts.map(p => { const q = prep(p); q.userData = {}; return q; }));
    g.computeBoundingBox();
    const ang = r() * Math.PI * 2, far = (0.08 + r() * 0.25) * L, n = g.attributes.position.count;
    const c = like?.c || g.boundingBox.getCenter(new THREE.Vector3()), rad = like?.rad ?? g.boundingBox.getSize(new THREE.Vector3()).length() * 0.18;
    const scatter = like?.scatter || [Math.cos(ang) * far, Math.sin(ang) * far, 0];
    const fill = (size, v) => { const arr = new Float32Array(n * size); for (let i = 0; i < n; i++) arr.set(v, i * size); return new THREE.BufferAttribute(arr, size); };
    g.setAttribute('aCenter', fill(3, [c.x, c.y, c.z]));
    g.setAttribute('aScatter', fill(3, scatter));
    g.setAttribute('aBone', fill(4, [gone, rad, late, kind]));
    pieces.push(g);
    return { c, rad, scatter };
  };
  const knob = (p, s) => soft(new THREE.IcosahedronGeometry(s, 0), { transform: g => g.translate(...p) });
  // spine: tail base to the shoulders, in segments with a knob for each vertebra
  const rs = H * 0.055, segs = 5;
  for (let k = 0; k < segs; k++) {
    const xa = mix(a.x0 + L * 0.04, a.front + L * 0.06, k / segs), xb = mix(a.x0 + L * 0.04, a.front + L * 0.06, (k + 1) / segs), parts = [rod([xa, a.spineY, 0], [xb, a.spineY, 0], rs, rs, 5)];
    for (let j = 0; j < 3; j++) parts.push(knob([mix(xa, xb, (j + 0.5) / 3), a.spineY + rs * 0.6, 0], rs * 1.25));
    piece(parts, 0.35 + r() * 0.5, 0, 0);
  }
  // ribs: from the spine, out and down around the flank toward the breastbone, sloping back;
  // the front ribs longest, the floating ribs at the back short
  const n = 9, span = a.front - a.back, rr = H * 0.028;
  for (let k = 0; k < n; k++) for (const side of [1, -1]) {
    const t = k / (n - 1), x = a.front + span * 0.02 - t * span * 0.62, reach = Math.PI * mix(0.92, 0.55, t * t), pts = [];
    for (let j = 0; j <= 6; j++) {
      const s = j / 6 * reach, down = (1 - Math.cos(s)) / 2;
      pts.push([x - down * span * 0.12, a.spineY - down * H * 0.9, side * Math.sin(s) * a.W * 0.92]);
    }
    const parts = [];
    for (let j = 0; j < 6; j++) parts.push(rod(pts[j], pts[j + 1], rr, rr * 0.9, 4));
    piece(parts, 0.08 + r() * 0.62, 0, 1);
  }
  // pelvis
  piece(pelvisParts(a, H, L), 0.9 + r() * 0.06, 0, 2);
  // legs: hip or shoulder through the knee and hock (or elbow and wrist) to the foot, as the
  // model's own leg bends, in two pieces
  a.legs.forEach((leg, k) => {
    if (!leg) return;
    const [h, knee, hock, foot] = leg, lr = H * 0.045;
    piece([rod(h.toArray(), knee.toArray(), lr, lr * 0.85, 5), knob(knee.toArray(), lr * 1.3)], 0.2 + r() * 0.6, 1, 3);
    piece([rod(knee.toArray(), hock.toArray(), lr * 0.8, lr * 0.7, 5), knob(hock.toArray(), lr * 1.1), rod(hock.toArray(), foot.toArray(), lr * 0.65, lr * 0.6, 5),
      soft(new THREE.SphereGeometry(1, 8, 6), { transform: g => { g.scale(lr * 1.6, lr * 0.9, lr * 1.2); g.translate(foot.x + lr * 0.4, foot.y, foot.z); } })], 0.15 + r() * 0.6, 1, 3);
    // the shoulder blade: a flat blade against the ribs, from the shoulder joint up and back
    // toward the spine
    if (k < 2) {
      const side = Math.sign(h.z) || (k === 0 ? 1 : -1), top = new THREE.Vector3(h.x - (a.front - a.back) * 0.16, a.spineY - H * 0.14, side * a.W * 0.72);
      piece([bladeH(new THREE.Vector3(h.x, h.y, side * Math.min(Math.abs(h.z), a.W * 0.75)), top, [[0, 0.05, 0.07], [0.3, 0.03, 0.09], [0.7, 0.025, 0.17], [0.95, 0.025, 0.16], [1, 0.02, 0.06]], new THREE.Vector3(1, 0, 0), H)],
        0.25 + r() * 0.55, 1, 3);
    }
  });
  // tail: tapering vertebrae along the model's tail
  if (a.tail) {
    const pts = [new THREE.Vector3(a.x0 + L * 0.04, a.spineY, 0), ...a.tail], parts = [];
    for (let j = 0; j + 1 < pts.length; j++) {
      const r0 = rs * mix(0.9, 0.3, j / (pts.length - 1)), r1 = rs * mix(0.9, 0.3, (j + 1) / (pts.length - 1));
      parts.push(rod(pts[j].toArray(), pts[j + 1].toArray(), r0, r1, 5), knob(pts[j + 1].toArray(), r1 * 1.3));
    }
    piece(parts, 0.2 + r() * 0.5, 0, 7);
  }
  // neck, from the shoulders to the back of the skull
  const sk = a.skull;
  piece([rod([a.front + L * 0.06, a.spineY, 0], a.neck.toArray(), rs, rs, 5), rod(a.neck.toArray(), sk.back.toArray(), rs * 0.9, rs * 0.8, 5)], 0.3 + r() * 0.5, 1, 4);
  // skull, along the muzzle with the eyes at its frame's origin
  const frame = new THREE.Matrix4().makeBasis(sk.dir, sk.up, new THREE.Vector3(0, 0, 1)).setPosition(sk.base);
  const skull = piece(skullParts(sk).map(g => g.applyMatrix4(frame)), 0.97, 1, 5);
  // the horns, antlers and tusks just as the model wears them, so the remains stay recognisable
  if (a.hard) piece([a.hard.clone()], 0.97, 1, 6, skull);
  const g = mergeGeometries(pieces);
  const col = g.attributes.color;
  const kind = g.attributes.aBone;
  for (let i = 0; i < col.count; i++) if (kind.getW(i) < 5.5) col.setXYZ(i, col.getX(i) * 0.91, col.getY(i) * 0.88, col.getZ(i) * 0.8); // (bone, and its dark hollows)
  g.userData.ao = true;
  return g;
}

// The bones of every kill on screen, one instanced mesh per species. Each instance takes the
// carcass's own matrix (on its side, as the body), and its state: aState (gone, scatter, settle,
// wither) and aGround (where the ground is along the model's z, which points down or up on its side).
function remainsMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute vec3 aCenter; attribute vec3 aScatter; attribute vec4 aBone; attribute vec4 aState; attribute float aGround;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', `
        // each bone shrinks away at its own point; leg bones and the skull wait until their flesh withers
        float show = clamp((aBone.x - aState.x) * 12.0, 0.0, 1.0) * (aBone.z > 0.5 ? smoothstep(0.1, 0.45, aState.w) : 1.0);
        vec3 centre = aCenter + aScatter * aState.y;
        centre.z = mix(centre.z, aGround - sign(aGround) * aBone.y, aState.z); // (slumped onto the ground)
        vec3 off = position - aCenter;
        if (aBone.w > 0.5 && aBone.w < 1.5) off.z *= mix(1.0, 0.35, aState.z); // (ribs fall flat)
        vec3 transformed = centre + off * show;
      `)
      // (horn, antler and tusk keep their own colours rather than the bones' bloody-to-bleached tint)
      .replace('#include <color_vertex>', '#include <color_vertex>\n        if (aBone.w > 5.5) vColor.rgb = color.rgb;');
  };
  mat.customProgramCacheKey = () => 'carcass-remains';
  return mat;
}

export class Remains {
  constructor(scene) {
    this.scene = scene;
    this.mat = remainsMaterial();
    this.pools = new Map();
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.qr = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.c = new THREE.Color();
    this.yAxis = new THREE.Vector3(0, 1, 0); this.xAxis = new THREE.Vector3(1, 0, 0);
  }
  pool(key, anatomy) {
    let p = this.pools.get(key);
    if (!p) { p = { geo: remainsGeometry(anatomy, [...key].reduce((h, ch) => h * 31 + ch.charCodeAt(0) | 0, 7)), cap: 0, count: 0, mesh: null }; this.grow(p, 8); this.pools.set(key, p); }
    return p;
  }
  grow(p, cap) {
    const old = p.mesh, n = p.count;
    p.cap = cap;
    const state = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4), ground = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    state.setUsage(THREE.DynamicDrawUsage); ground.setUsage(THREE.DynamicDrawUsage);
    if (old) { state.array.set(p.state.array.subarray(0, n * 4)); ground.array.set(p.ground.array.subarray(0, n)); }
    p.state = state; p.ground = ground;
    p.geo.setAttribute('aState', state); p.geo.setAttribute('aGround', ground);
    p.mesh = new THREE.InstancedMesh(p.geo, this.mat, cap);
    p.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    p.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    p.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    p.mesh.frustumCulled = false; p.mesh.count = 0; p.mesh.visible = false;
    if (old) {
      p.mesh.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, n * 16));
      p.mesh.instanceColor.array.set(old.instanceColor.array.subarray(0, n * 3));
      this.scene.remove(old); old.dispose();
    }
    this.scene.add(p.mesh);
  }
  begin() { for (const p of this.pools.values()) p.count = 0; }
  // One kill's bones: key and anatomy from its species pool, placed as Fauna.add places the body
  // (yaw, then rolled onto its side), lift the body's height above the ground, d from carcassDecay.
  add(key, anatomy, x, y, z, yaw, roll, scale, lift, d) {
    const p = this.pool(key, anatomy);
    if (p.count >= p.cap) this.grow(p, p.cap * 2);
    const k = p.count++;
    this.q.setFromAxisAngle(this.yAxis, yaw).multiply(this.qr.setFromAxisAngle(this.xAxis, roll));
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(scale, scale, scale));
    p.mesh.setMatrixAt(k, this.m);
    p.mesh.setColorAt(k, this.c.setRGB(...d.bone));
    p.state.setXYZW(k, d.gone, d.scatter, d.settle, d.wither);
    // (rolled a quarter turn about x, the model's z points down (roll > 0) or up: the ground is
    // lift below the origin, in model units)
    p.ground.setX(k, Math.sign(roll) * lift / scale);
  }
  end() {
    for (const p of this.pools.values()) {
      const n = p.count;
      p.mesh.count = n; p.mesh.visible = n > 0;
      if (!n) continue;
      for (const a of [p.mesh.instanceMatrix, p.mesh.instanceColor, p.state, p.ground]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
    }
  }
}
