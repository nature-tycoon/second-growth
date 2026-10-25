// Species instance buffers, uploads and active draw counts.
import * as THREE from 'three';
import { withClouds } from '../atmosphere.js';
import { buildSpecies } from './animal-model.js';
import { faunaMaterial } from './animal-material.js';
import { CLOSE_PIXELS, FAR_PIXELS, simplifyAnimal } from './animal-lod.js';

// ---------------------------------------------------------------- instanced pools
class SpeciesMesh {
  constructor(scene, def, { geo, motion } = buildSpecies(def), mat = withClouds(faunaMaterial(motion))) {
    this.geo = geo; this.motion = motion; this.scene = scene; this.def = def;
    this.mat = mat; // (the field-guide portraits use faunaMaterial bare)
    this.cap = 0; this.count = 0; this.mesh = null; this.far = null; this.close = null;
    this.grow(16);
  }
  // The distant model, built the first time an animal of this kind is small on screen. It has
  // its own instance buffers but shares the material, motion and detailed source geometry.
  distant() {
    return this.far ||= new SpeciesMesh(this.scene, null, { geo: simplifyAnimal(this.geo, this.motion.len), motion: this.motion }, this.mat);
  }
  // The close-up model, built in idle time once an animal of this kind is large on screen (see
  // Fauna.closeUp); like the distant model, it shares the material and motion.
  closeUp() {
    return this.close ||= new SpeciesMesh(this.scene, null, { geo: buildSpecies(this.def, { close: true }).geo, motion: this.motion }, this.mat);
  }
  grow(cap) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.dispose(); }
    this.cap = cap;
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.anim.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aAnim', this.anim);
    this.grips = this.motion.canopyFeet ? ['aGripA', 'aGripB', 'aGripC'].map(name => {
      const attribute = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      attribute.setUsage(THREE.DynamicDrawUsage); this.geo.setAttribute(name, attribute); return attribute;
    }) : null;
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.scene.add(this.mesh);
  }
}

// A kill's decay, carried in its animation phase (it never moves): below -100000, strip, wither and
// dry (0-1) in 64 steps each. The shader (animal-material.js) decodes it and reads the phase as 0.
// Live phases only grow from 0.
export function carcassPhase({ strip = 0, wither = 0, dry = 0 }) {
  const q = v => Math.round(Math.min(1, Math.max(0, v)) * 63);
  return -(100000 + q(strip) + q(wither) * 64 + q(dry) * 4096);
}

// Visitors use the same instanced models, one pool per look.
export const PERSON_LOOKS = Array.from({ length: 8 }, (_, look) => ({ key: 'person' + look, sprite: { kind: 'person', look } }));
export const SNORKEL_LOOKS = Array.from({ length: 8 }, (_, look) => ({ key: 'snorkel' + look, sprite: { kind: 'person', look, snorkel: true } }));

export class Fauna {
  constructor(scene) {
    this.scene = scene;
    this.species = new Map();
    // Rendering switch: draw simplified models for animals smaller than FAR_PIXELS on screen.
    // Ecology, poses, contact and picking never read it.
    this.farModels = true; this.pixelsPerUnit = Infinity;
    // and close-up models for animals larger than CLOSE_PIXELS, built one at a time when the page is idle
    this.closeModels = true; this.closeWanted = new Set(); this.closeBuilding = false;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3();
    this.yAxis = new THREE.Vector3(0, 1, 0); this.zAxis = new THREE.Vector3(0, 0, 1); this.xAxis = new THREE.Vector3(1, 0, 0); this.qp = new THREE.Quaternion();
  }
  pool(def) {
    const key = this.modelKey(def);
    let p = this.species.get(key);
    if (!p) { p = new SpeciesMesh(this.scene, def); this.species.set(key, p); }
    return p;
  }
  modelKey(def) { return `${def.mapId || 'shared'}:${def.key}`; }
  motion(def) { return this.pool(def).motion; }
  // How far forward of its origin the model reaches with its head fully lowered (antler or horn
  // tips, in model units): two rivals stand so these just interlock. Measured once per model.
  headReach(def) {
    const p = this.pool(def);
    if (p.reach == null) {
      const pos = p.geo.attributes.position, part = p.geo.attributes.aPart, piv = p.geo.attributes.aPivot;
      const ang = -(p.motion.head ?? 0.9), c = Math.cos(ang), s = Math.sin(ang);
      let reach = 0;
      for (let k = 0; k < pos.count; k++) {
        let x = pos.getX(k);
        if (part.getX(k) > 7.5) x = piv.getX(k) + (x - piv.getX(k)) * c - (pos.getY(k) - piv.getY(k)) * s;
        reach = Math.max(reach, x);
      }
      p.reach = reach;
    }
    return p.reach;
  }
  // How far forward of its origin the model's nose reaches, in model units (a wrasse feeding on
  // a starfish puts its mouth on it). Measured once per model.
  noseReach(def) {
    const p = this.pool(def);
    if (p.nose == null) {
      const pos = p.geo.attributes.position;
      let nose = 0;
      for (let k = 0; k < pos.count; k++) nose = Math.max(nose, pos.getX(k));
      p.nose = nose;
    }
    return p.nose;
  }
  // How tall the model stands, in model units (eye level steps back from a giraffe or an
  // elephant by it: the sprite's own numbers leave out a giraffe's neck). Measured once per model.
  height(def) {
    const p = this.pool(def);
    if (p.height == null) { p.geo.computeBoundingBox(); p.height = p.geo.boundingBox.max.y - p.geo.boundingBox.min.y; }
    return p.height;
  }
  // pixelsPerUnit: screen pixels per scene unit this frame (Infinity draws every animal in detail).
  // eye: { x, y, z, scale } for a perspective camera (see perspectiveScale), whose pixels per unit
  // fall off with each animal's distance.
  begin(pixelsPerUnit = Infinity, eye = null) {
    this.pixelsPerUnit = pixelsPerUnit; this.eye = eye;
    for (const p of this.species.values()) { p.count = 0; if (p.far) p.far.count = 0; if (p.close) p.close.count = 0; }
  }
  // The close-up model if it's ready; otherwise null, and it's built when the page is next idle
  // (one per idle moment: the finest take a few tens of milliseconds).
  closeUp(near) {
    if (near.close || !near.def) return near.close;
    this.closeWanted.add(near);
    if (!this.closeBuilding && typeof window !== 'undefined') {
      this.closeBuilding = true;
      const idle = window.requestIdleCallback ? f => window.requestIdleCallback(f, { timeout: 1000 }) : f => setTimeout(f, 50);
      const step = () => {
        const next = this.closeWanted.values().next().value;
        if (next) { this.closeWanted.delete(next); next.closeUp(); }
        if (this.closeWanted.size) idle(step); else this.closeBuilding = false;
      };
      idle(step);
    }
    return null;
  }
  // One animal this frame. scale converts model pixels to scene units. detail keeps the full
  // model whatever its size (the selected or followed animal). remains, for a kill:
  // { strip, wither, dry } (see carcassDecay in render3d/carcass-decay.js): its flesh drawn back onto
  // its bones, and its coat dulled as it dries.
  add(def, x, y, z, yaw, scale, phase, gait, fly, graze, pitch = 0, roll = 0, grips = null, detail = false, remains = null) {
    const near = this.pool(def);
    const e = this.eye, ppu = e ? e.scale / Math.max(0.05, Math.hypot(x - e.x, y - e.y, z - e.z)) : this.pixelsPerUnit;
    const pixels = near.motion.len * scale * ppu;
    const p = this.farModels && !detail && pixels < FAR_PIXELS ? near.distant()
      : this.closeModels && Number.isFinite(pixels) && pixels > CLOSE_PIXELS && this.closeUp(near) || near;
    if (p.count >= p.cap) {
      // carry over what this frame has already written, then grow
      const oldM = p.mesh.instanceMatrix.array.slice(0, p.count * 16), oldA = p.anim.array.slice(0, p.count * 4), n = p.count;
      const oldGrips = p.grips?.map(a => a.array.slice(0, n * 4));
      p.grow(p.cap * 2);
      p.mesh.instanceMatrix.array.set(oldM); p.anim.array.set(oldA); p.count = n;
      oldGrips?.forEach((a, i) => p.grips[i].array.set(a));
    }
    const k = p.count++;
    this.q.setFromAxisAngle(this.yAxis, yaw);
    if (pitch) this.q.multiply(this.qp.setFromAxisAngle(this.zAxis, pitch)); // nose up or down (a leaping fish)
    if (roll) this.q.multiply(this.qp.setFromAxisAngle(this.xAxis, roll)); // over on its side (a kill)
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(scale, scale, scale));
    p.mesh.setMatrixAt(k, this.m);
    const a = p.anim.array;
    a[k * 4] = remains ? carcassPhase(remains) : phase; a[k * 4 + 1] = gait; a[k * 4 + 2] = fly; a[k * 4 + 3] = grips ? -1 : graze;
    if (p.grips) {
      // Four xyz offsets occupy three attributes, staying within WebGL's
      // minimum attribute budget. Primates do not use the grazing slot.
      const offsets = grips ? grips.flatMap(v => v.toArray()) : Array(12).fill(0);
      p.grips.forEach((attribute, i) => attribute.setXYZW(k, ...offsets.slice(i * 4, i * 4 + 4)));
    }
  }
  end() {
    for (const near of this.species.values()) for (const p of [near, near.far, near.close]) {
      if (!p) continue;
      p.mesh.count = p.count;
      p.mesh.visible = p.count > 0;
      if (p.count) {
        p.mesh.instanceMatrix.clearUpdateRanges(); p.mesh.instanceMatrix.addUpdateRange(0, p.count * 16);
        p.anim.clearUpdateRanges(); p.anim.addUpdateRange(0, p.count * 4);
        p.mesh.instanceMatrix.needsUpdate = true; p.anim.needsUpdate = true;
        p.grips?.forEach(a => { a.clearUpdateRanges(); a.addUpdateRange(0, p.count * 4); a.needsUpdate = true; });
      }
    }
  }
  clear() { this.begin(); this.end(); }
}
