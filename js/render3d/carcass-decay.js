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
// y up): the torso's spine and belly heights and half-width between the shoulders and hips, each
// leg's hip and foot, and the neck pivot to the snout tip. Legs a model doesn't have are null.
export function carcassAnatomy(geo, motion = null) {
  const pos = geo.attributes.position, part = geo.attributes.aPart, piv = geo.attributes.aPivot;
  const hips = [null, null, null, null], feet = [null, null, null, null], body = [];
  let neck = null, snout = null;
  for (let i = 0; i < pos.count; i++) {
    const k = Math.round(part.getX(i)), x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (k === 0) body.push(x, y, z);
    else if (k >= 1 && k <= 4) {
      hips[k - 1] ||= new THREE.Vector3(piv.getX(i), piv.getY(i), piv.getZ(i));
      if (!feet[k - 1] || y < feet[k - 1].y) feet[k - 1] = new THREE.Vector3(x, y, z);
    } else if (k === 8) {
      neck ||= new THREE.Vector3(piv.getX(i), piv.getY(i), piv.getZ(i));
      if (!snout || x > snout.x) snout = new THREE.Vector3(x, y, 0);
    }
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
  for (const f of feet) if (f) f.y = Math.max(f.y, H * 0.05);
  neck ||= new THREE.Vector3(x1, top - H * 0.1, 0); snout ||= neck.clone().add(new THREE.Vector3(H * 0.6, 0, 0));
  // the skull: along the head itself (not the neck, which can be long), from the middle of the
  // head near the snout tip (medians, so ears, horns and antlers don't pull it) to the tip; as
  // wide and deep as most of the head there
  const pct = (list, f, fallback) => list.length ? list.sort((a, b) => a - b)[Math.floor(list.length * f)] : fallback;
  const R = Math.min(snout.distanceTo(neck) * 0.55, H * 0.8), near = [], v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    if (Math.round(part.getX(i)) !== 8) continue;
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (v.distanceTo(snout) < R) near.push(v.clone());
  }
  const mid = near.length ? new THREE.Vector3(pct(near.map(p => p.x), 0.5), pct(near.map(p => p.y), 0.5), 0) : neck.clone().lerp(snout, 0.7);
  const dir = snout.clone().sub(mid); if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
  const skullLen = clamp(dir.length() * 2, H * 0.55, H * 0.85); dir.normalize(); // (a skull is about as long as the chest is deep)
  const ws = [], hs = [];
  for (const p of near) {
    v.copy(p).sub(snout);
    const along = -v.dot(dir);
    if (along < 0 || along > skullLen) continue;
    ws.push(Math.abs(v.z)); hs.push(Math.abs(v.addScaledVector(dir, along).y));
  }
  const skull = { len: skullLen, dir, back: snout.clone().addScaledVector(dir, -skullLen), wide: clamp(pct(ws, 0.7, skullLen * 0.2), skullLen * 0.17, skullLen * 0.3), tall: clamp(pct(hs, 0.7, skullLen * 0.2), skullLen * 0.17, skullLen * 0.3) };
  // Where the model has eyes (motion.eye, for eye-shine), the skull is anchored to them and the
  // snout tip instead, so its sockets sit where the eyes were and the horns, antlers and tusks
  // (copied from the model's own head) grow from it. In skullParts' frame the eye is at
  // (0.33, 0.07 h) and the tip at (1, -0.035 h), in skull lengths.
  if (motion?.eye) {
    const eye = new THREE.Vector3(motion.eye[0], motion.eye[1], 0), v = snout.clone().sub(eye);
    if (v.x > 0) {
      let S = skull.len, h = 1;
      for (let k = 0; k < 3; k++) { S = v.length() / Math.hypot(0.67, 0.105 * h); h = clamp(skull.tall / (0.2 * S), 0.85, 1.5); }
      S = clamp(S, H * 0.3, H * 1.2);
      const th = Math.atan2(v.y, v.x) - Math.atan2(-0.105 * h, 0.67), d = new THREE.Vector3(Math.cos(th), Math.sin(th), 0), up = new THREE.Vector3(-d.y, d.x, 0);
      skull.len = S; skull.dir = d; skull.tall = 0.2 * S * h;
      skull.back = eye.clone().addScaledVector(d, -0.33 * S).addScaledVector(up, -0.07 * S * h);
      skull.wide = clamp(Math.abs(motion.eye[2]) * 0.21 / 0.165, S * 0.12, S * 0.32);
    }
  }
  return { x0, x1, front, back, spineY: top - H * 0.1, bellyY: bottom + H * 0.08, W: wide * 0.86, hips, feet, neck, snout, skull, hard: hardParts(geo) };
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

// A realistic skull in its own frame: x from the back of the skull (0) to the snout tip (len), y
// up, z across; wide and tall are its half-width and half-depth at the cranium.
function skullParts(len, wide, tall) {
  const S = len, w = wide / (S * 0.21), h = tall / (S * 0.2), parts = [];
  const sec = (t, y, ry, rz) => [t * S, y * S * h, ry * S * h, rz * S * w];
  // cranium behind the eyes, narrowing past them into a long muzzle (upper jaw)
  parts.push(soft(loft([sec(0, 0.03, 0.08, 0.08), sec(0.05, 0.04, 0.16, 0.16), sec(0.15, 0.04, 0.2, 0.21), sec(0.27, 0.035, 0.19, 0.2),
    sec(0.38, 0.02, 0.14, 0.14), sec(0.5, 0, 0.115, 0.105), sec(0.7, -0.02, 0.1, 0.09), sec(0.88, -0.03, 0.085, 0.08), sec(0.96, -0.035, 0.075, 0.072), sec(1, -0.035, 0.045, 0.05)], 12)));
  for (const side of [1, -1]) {
    // eye socket: a dark hollow ringed by a bony rim, high on the side just in front of the cranium
    const eye = [0.33 * S, 0.07 * S * h, side * 0.165 * S * w];
    parts.push(soft(new THREE.SphereGeometry(1, 8, 6), { color: DARK, transform: g => { g.scale(0.06 * S, 0.055 * S * h, 0.035 * S * w); g.translate(...eye); } }));
    parts.push(soft(new THREE.TorusGeometry(0.068 * S, 0.016 * S, 5, 12), { transform: g => { g.scale(1, h, 1); g.rotateY(side * 0.35); g.translate(eye[0], eye[1], eye[2] + side * 0.012 * S); } }));
    // cheekbone (zygomatic arch), bowed out below the eye and back to the ear
    parts.push(rod([0.36 * S, -0.03 * S * h, side * 0.16 * S * w], [0.24 * S, -0.04 * S * h, side * 0.22 * S * w], 0.02 * S, 0.02 * S, 5));
    parts.push(rod([0.24 * S, -0.04 * S * h, side * 0.22 * S * w], [0.1 * S, -0.01 * S * h, side * 0.19 * S * w], 0.02 * S, 0.018 * S, 5));
    // lower jaw: up from its angle to the joint below the ear, and forward to the chin
    const joint = [0.11 * S, -0.04 * S * h, side * 0.125 * S * w], angle = [0.15 * S, -0.21 * S * h, side * 0.12 * S * w];
    parts.push(soft(new THREE.SphereGeometry(1, 8, 6), { transform: g => { g.scale(0.065 * S, 0.09 * S * h, 0.014 * S); g.rotateZ(-0.25); g.translate(0.14 * S, -0.13 * S * h, side * 0.122 * S * w); } }));
    parts.push(rod(joint, angle, 0.022 * S, 0.026 * S, 5));
    const jaw = [angle, [0.42 * S, -0.16 * S * h, side * 0.085 * S * w], [0.74 * S, -0.12 * S * h, side * 0.05 * S * w], [0.96 * S, -0.09 * S * h, side * 0.018 * S * w]];
    for (let j = 0; j < 3; j++) parts.push(rod(jaw[j], jaw[j + 1], 0.028 * S * (1 - j * 0.15), 0.024 * S * (1 - j * 0.15), 5));
    // cheek teeth along the upper jaw
    for (let k = 0; k < 5; k++) parts.push(soft(new THREE.IcosahedronGeometry(0.018 * S, 0), { transform: g => g.translate((0.46 + k * 0.055) * S, (-0.105 + k * 0.006) * S * h, side * (0.075 - k * 0.004) * S * w) }));
    // the knuckles the skull sits on the spine by
    parts.push(soft(new THREE.IcosahedronGeometry(0.03 * S, 0), { transform: g => g.translate(0.005 * S, -0.03 * S * h, side * 0.04 * S * w) }));
  }
  parts.push(soft(new THREE.SphereGeometry(1, 8, 6), { color: DARK, transform: g => { g.scale(0.02 * S, 0.032 * S * h, 0.035 * S * w); g.translate(0.99 * S, -0.03 * S * h, 0); } })); // (nasal opening)
  return parts;
}

// Each hip bone either side of the sacrum: the ilium a flat blade flaring forward and up toward
// the spine, the hip socket where the leg meets it, and the ischium and pubis behind and below
// it closing a loop around the obturator hole. a: anatomy, socket: where the leg's hip is.
function pelvisParts(a, H, L) {
  const parts = [], basis = new THREE.Matrix4();
  // a lofted blade from p to q: thin across one way (y), wide the other (z), turned so its flat
  // faces out and up
  const blade = (p, q, sections, up) => {
    const d = q.clone().sub(p), len = d.length(); d.normalize();
    const wideAxis = up.clone().addScaledVector(d, -up.dot(d)).normalize(), thin = new THREE.Vector3().crossVectors(wideAxis, d);
    basis.makeBasis(d, thin, wideAxis).setPosition(p);
    const g = loft(sections.map(([t, ry, rz]) => [t * len, 0, ry * H, rz * H]), 12);
    g.applyMatrix4(basis);
    return soft(g);
  };
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
// kind: 0 spine, 1 rib, 2 pelvis, 3 leg, 4 neck, 5 skull, 6 horns, antlers and tusks, which keep
// their own colour and go with the skull).
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
  // legs: shoulder or hip to foot, with a joint halfway
  a.hips.forEach((h, k) => {
    const f = a.feet[k];
    if (!h || !f) return;
    const m = h.clone().lerp(f, 0.5), lr = H * 0.045;
    piece([rod(h.toArray(), m.toArray(), lr, lr * 0.8, 5), knob(m.toArray(), lr * 1.4)], 0.2 + r() * 0.6, 1, 3);
    piece([rod(m.toArray(), f.toArray(), lr * 0.8, lr * 0.7, 5), knob(f.toArray(), lr * 1.2)], 0.15 + r() * 0.6, 1, 3);
  });
  // neck, from the shoulders to the back of the skull
  const dir = a.skull.dir, S = a.skull.len, back = a.skull.back;
  piece([rod([a.front + L * 0.06, a.spineY, 0], a.neck.toArray(), rs, rs, 5), rod(a.neck.toArray(), back.toArray(), rs * 0.9, rs * 0.8, 5)], 0.3 + r() * 0.5, 1, 4);
  // skull, laid along the head from the back of the skull to the snout tip
  const frame = new THREE.Matrix4().compose(back, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir), new THREE.Vector3(1, 1, 1));
  const skull = piece(skullParts(S, a.skull.wide, a.skull.tall).map(g => g.applyMatrix4(frame)), 0.97, 1, 5);
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
