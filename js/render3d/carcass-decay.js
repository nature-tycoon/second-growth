// How a kill breaks down on screen: the hunter's meal and each scavenger's share strip it, time
// rots it, and what's left flattens into a hide with the ribcage showing through, bleaching as it
// goes, over a dark stain where it lay. Drawing only: the carcass itself is sim/animal-life.js
// (startFeed, feedAt) and its timer sim/animals.js.
import * as THREE from 'three';
import { clamp } from '../config.js';
import { merge, prep, rod, shadeVerts, soft } from './geometry/primitives.js';

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
// (picked as they look on screen; vertex colours multiply in linear light)
const linear = c => c.map(v => v ** 2.2);

// eaten: the share of the meat gone to the hunter (its first 30%, over its own feed) and the
// scavengers (the next 50%, a meal at a time). rot: decay, slow at first and then fast.
// flesh: what's left of the body (1 whole, 0 hide and bones). sink: the very end, settling into
// the ground. tint and bone: vertex-colour multipliers for the body and the bones (linear).
export function carcassDecay(c) {
  const max = c.max > 0 ? c.max : 1, elapsed = clamp(max - c.t, 0, max);
  const hunter = c.feed > 0 ? clamp(elapsed / c.feed, 0, 1) : 1;
  const shared = c.meals0 > 0 ? 1 - clamp(c.meals, 0, c.meals0) / c.meals0 : 0;
  const eaten = 0.3 * hunter + 0.5 * shared;
  const rot = smooth(0.08, 0.8, elapsed / max);
  const flesh = (1 - eaten) * (1 - rot);
  const sink = 1 - clamp(c.t / (max * 0.12), 0, 1);
  // (opened up: dark red where it's been eaten; then grey-brown and dull as it rots)
  const red = eaten * (1 - rot) * 0.9, dull = rot;
  const tint = linear([
    mix(mix(1, 0.62, red), 0.4, dull),
    mix(mix(1, 0.3, red), 0.35, dull),
    mix(mix(1, 0.27, red), 0.28, dull),
  ]);
  // (bones show bloody when first bared, and bleach pale as the weeks pass)
  const bleach = smooth(0.3, 0.9, elapsed / max);
  const bone = linear([mix(0.78, 1, bleach), mix(0.5, 0.98, bleach), mix(0.44, 0.9, bleach)]);
  return { eaten, rot, flesh, sink, tint, bone, bones: flesh < 0.5 }; // (drawn inside the body before they show)
}

// A ribcage lying on its side, with the spine, a skull and the long leg bones: x is head to tail
// (head forward at +x, as the animal models are), y up and z across. Unit length and depth: each
// instance is scaled to the carcass's length and body depth.
export function remainsGeometry() {
  const parts = [];
  parts.push(rod([-0.42, 0.06, -0.26], [0.3, 0.06, -0.26], 0.035, 0.03, 5)); // spine, on the ground
  for (let k = 0; k < 8; k++) {
    // each rib arches up from the spine and down to the breastbone side (longest mid-chest)
    const x = 0.22 - k * 0.07, r = 0.24 * (0.7 + 0.3 * Math.sin((k + 1) / 9 * Math.PI)), h = r * 1.4;
    const pts = [];
    for (let j = 0; j <= 4; j++) { const a = j / 4 * Math.PI; pts.push([x - j * 0.012, 0.04 + Math.sin(a) * h, -0.26 + (1 - Math.cos(a)) * r]); }
    for (let j = 0; j < 4; j++) parts.push(rod(pts[j], pts[j + 1], 0.016, 0.014, 4));
  }
  parts.push(soft(new THREE.IcosahedronGeometry(0.1, 1), { transform: g => { g.scale(1.5, 0.8, 0.85); g.translate(0.46, 0.08, -0.12); } })); // skull
  parts.push(soft(new THREE.IcosahedronGeometry(0.08, 0), { transform: g => { g.scale(1, 0.7, 1.2); g.translate(-0.42, 0.07, -0.18); } })); // pelvis
  for (const [x, dz, a] of [[0.18, 0.1, 0.5], [0.12, 0.06, 0.25], [-0.36, 0.08, -0.35], [-0.42, 0.12, -0.15]]) // legs, splayed
    parts.push(rod([x, 0.04, -0.1 + dz], [x + Math.sin(a) * 0.32, 0.04, -0.1 + dz + Math.cos(a) * 0.4], 0.022, 0.018, 4));
  const g = merge(parts.map(p => prep(p)));
  shadeVerts(g, (x, y) => { const v = 0.8 + 0.2 * clamp(y / 0.3, 0, 1); return [0.91 * v, 0.88 * v, 0.8 * v]; }); // (bone, darker where it touches the ground)
  g.userData.ao = true;
  return g;
}

export class Remains {
  constructor(scene) {
    this.scene = scene;
    this.geo = remainsGeometry();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); // (mirrored for a kill on its other side)
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.c = new THREE.Color();
    this.yAxis = new THREE.Vector3(0, 1, 0);
    this.cap = 0; this.count = 0; this.mesh = null;
    this.grow(16);
  }
  grow(cap) {
    const old = this.mesh;
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.visible = false;
    if (old) {
      this.mesh.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, this.count * 16));
      this.mesh.instanceColor.array.set(old.instanceColor.array.subarray(0, this.count * 3));
      this.scene.remove(old); old.dispose();
    }
    this.scene.add(this.mesh);
  }
  begin() { this.count = 0; }
  // len and depth in scene units; yaw as for the animal it was, side which way it fell
  add(x, y, z, yaw, len, depth, side, color) {
    if (this.count >= this.cap) this.grow(this.cap * 2);
    const k = this.count++;
    this.q.setFromAxisAngle(this.yAxis, yaw);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(len, depth, depth * side));
    this.mesh.setMatrixAt(k, this.m);
    this.mesh.setColorAt(k, this.c.setRGB(...color));
  }
  end() {
    const n = this.count;
    this.mesh.count = n; this.mesh.visible = n > 0;
    if (!n) return;
    for (const a of [this.mesh.instanceMatrix, this.mesh.instanceColor]) {
      const size = a.itemSize;
      a.clearUpdateRanges(); a.addUpdateRange(0, n * size); a.needsUpdate = true;
    }
  }
}
