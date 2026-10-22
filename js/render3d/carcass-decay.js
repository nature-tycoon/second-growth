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
// dry: the meat and coat drying out (u 0.15-0.55). tint and bone: vertex-colour multipliers for the
// coat and the bones (linear).
export function carcassDecay(c) {
  const max = c.max > 0 ? c.max : 1, u = clamp((max - c.t) / max, 0, 1);
  const hunter = c.feed > 0 ? clamp((max - c.t) / c.feed, 0, 1) : 1;
  const shared = c.meals0 > 0 ? 1 - clamp(c.meals, 0, c.meals0) / c.meals0 : 0;
  const eaten = 0.3 * hunter + 0.5 * shared;
  const strip = 1 - (1 - eaten) * (1 - smooth(0.04, 0.5, u));
  const wither = smooth(0.35, 0.65, u);
  // (the coat dulls and darkens as it dries; the meat's colour, red to dark brown, is the shader's)
  const dry = smooth(0.15, 0.55, u);
  const tint = linear([mix(1, 0.55, dry), mix(1, 0.5, dry), mix(1, 0.44, dry)]);
  // (bones show bloody when first bared, and bleach pale as the weeks pass)
  const bleach = smooth(0.3, 0.8, u);
  const bone = linear([mix(0.92, 0.97, bleach), mix(0.74, 0.94, bleach), mix(0.68, 0.86, bleach)]);
  return {
    u, eaten, strip, wither, dry, tint, bone,
    settle: smooth(0.55, 0.75, u), scatter: smooth(0.55, 0.95, u), gone: smooth(0.68, 1, u),
    body: wither < 1, bones: strip > 0.25,
  };
}

// The body plan a skeleton is fitted to, measured from a species' model (model units, x forward,
// y up): the torso's spine and belly heights and half-width between the shoulders and hips, each
// leg's hip and foot, and the neck pivot to the snout tip. Legs a model doesn't have are null.
export function carcassAnatomy(geo) {
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
  return { x0, x1, front, back, spineY: top - H * 0.1, bellyY: bottom + H * 0.08, W: wide * 0.86, hips, feet, neck, snout };
}

// The skeleton, in the same model space as the body, as pieces that each carry their centre,
// a scatter direction (along the ground once it's on its side) and a point in [0, 1] at which
// they disappear. aBone: (disappear at, radius, whether it shows only once its limb withers,
// kind: 0 spine, 1 rib, 2 pelvis, 3 leg, 4 neck, 5 skull).
export function remainsGeometry(a, seed = 1) {
  const r = mulberry32(seed), H = a.spineY - a.bellyY, L = a.x1 - a.x0, pieces = [];
  const piece = (parts, gone, late, kind) => {
    const g = mergeGeometries(parts.map(p => { const q = prep(p); q.userData = {}; return q; }));
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3()), rad = g.boundingBox.getSize(new THREE.Vector3()).length() * 0.18;
    const ang = r() * Math.PI * 2, far = (0.08 + r() * 0.25) * L, n = g.attributes.position.count;
    const fill = (size, v) => { const arr = new Float32Array(n * size); for (let i = 0; i < n; i++) arr.set(v, i * size); return new THREE.BufferAttribute(arr, size); };
    g.setAttribute('aCenter', fill(3, [c.x, c.y, c.z]));
    g.setAttribute('aScatter', fill(3, [Math.cos(ang) * far, Math.sin(ang) * far, 0]));
    g.setAttribute('aBone', fill(4, [gone, rad, late, kind]));
    pieces.push(g);
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
  piece([-1, 1].map(side => soft(new THREE.IcosahedronGeometry(H * 0.15, 1), { transform: g => { g.scale(1.7, 1, 0.45); g.translate(a.back - L * 0.02, a.spineY - H * 0.22, side * a.W * 0.4); } }))
    .concat([rod([a.back - L * 0.1, a.spineY - H * 0.15, 0], [a.back + L * 0.05, a.spineY - H * 0.15, 0], rs * 1.2, rs * 1.2, 5)]), 0.9 + r() * 0.06, 0, 2);
  // legs: shoulder or hip to foot, with a joint halfway
  a.hips.forEach((h, k) => {
    const f = a.feet[k];
    if (!h || !f) return;
    const m = h.clone().lerp(f, 0.5), lr = H * 0.045;
    piece([rod(h.toArray(), m.toArray(), lr, lr * 0.8, 5), knob(m.toArray(), lr * 1.4)], 0.2 + r() * 0.6, 1, 3);
    piece([rod(m.toArray(), f.toArray(), lr * 0.8, lr * 0.7, 5), knob(f.toArray(), lr * 1.2)], 0.15 + r() * 0.6, 1, 3);
  });
  // neck, from the shoulders to the back of the skull
  const dir = a.snout.clone().sub(a.neck), reach = dir.length(); dir.normalize();
  const skullLen = Math.min(reach * 0.6, H * 1.1), back = a.snout.clone().addScaledVector(dir, -skullLen);
  piece([rod([a.front + L * 0.06, a.spineY, 0], a.neck.toArray(), rs, rs, 5), rod(a.neck.toArray(), back.toArray(), rs * 0.9, rs * 0.8, 5)], 0.3 + r() * 0.5, 1, 4);
  // skull: a cranium and a narrower muzzle along the head
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  const at = t => back.clone().addScaledVector(dir, skullLen * t);
  piece([
    soft(new THREE.IcosahedronGeometry(1, 1), { transform: g => { g.scale(skullLen * 0.3, skullLen * 0.22, skullLen * 0.2); g.applyQuaternion(q); g.translate(...at(0.28).toArray()); } }),
    soft(new THREE.IcosahedronGeometry(1, 1), { transform: g => { g.scale(skullLen * 0.38, skullLen * 0.12, skullLen * 0.12); g.applyQuaternion(q); g.translate(...at(0.66).toArray()); } }),
  ], 0.97, 1, 5);
  const g = mergeGeometries(pieces);
  const col = g.attributes.color;
  for (let i = 0; i < col.count; i++) col.setXYZ(i, 0.91, 0.88, 0.8); // (bone)
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
        off.z *= mix(1.0, 0.35, aState.z); // (ribs fall flat)
        vec3 transformed = centre + off * show;
      `);
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
