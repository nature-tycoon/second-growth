// Species instance buffers, uploads and active draw counts.
import * as THREE from 'three';
import { withClouds } from '../atmosphere.js';
import { buildSpecies } from './animal-model.js';
import { faunaMaterial } from './animal-material.js';
import { FAR_PIXELS, simplifyAnimal } from './animal-lod.js';

// ---------------------------------------------------------------- instanced pools
class SpeciesMesh {
  constructor(scene, def, { geo, motion } = buildSpecies(def), mat = withClouds(faunaMaterial(motion))) {
    this.geo = geo; this.motion = motion; this.scene = scene;
    this.mat = mat; // (the field-guide portraits use faunaMaterial bare)
    this.cap = 0; this.count = 0; this.mesh = null; this.far = null;
    this.grow(16);
  }
  // The distant model, built the first time an animal of this kind is small on screen. It has
  // its own instance buffers but shares the material, motion and detailed source geometry.
  distant() {
    return this.far ||= new SpeciesMesh(this.scene, null, { geo: simplifyAnimal(this.geo, this.motion.len), motion: this.motion }, this.mat);
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
  // pixelsPerUnit: screen pixels per scene unit this frame (Infinity draws every animal in detail).
  begin(pixelsPerUnit = Infinity) {
    this.pixelsPerUnit = pixelsPerUnit;
    for (const p of this.species.values()) { p.count = 0; if (p.far) p.far.count = 0; }
  }
  // One animal this frame. scale converts model pixels to scene units. detail keeps the full
  // model whatever its size (the selected or followed animal).
  add(def, x, y, z, yaw, scale, phase, gait, fly, graze, pitch = 0, roll = 0, grips = null, detail = false) {
    const near = this.pool(def);
    const p = this.farModels && !detail && near.motion.len * scale * this.pixelsPerUnit < FAR_PIXELS ? near.distant() : near;
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
    a[k * 4] = phase; a[k * 4 + 1] = gait; a[k * 4 + 2] = fly; a[k * 4 + 3] = grips ? -1 : graze;
    if (p.grips) {
      // Four xyz offsets occupy three attributes, staying within WebGL's
      // minimum attribute budget. Primates do not use the grazing slot.
      const offsets = grips ? grips.flatMap(v => v.toArray()) : Array(12).fill(0);
      p.grips.forEach((attribute, i) => attribute.setXYZW(k, ...offsets.slice(i * 4, i * 4 + 4)));
    }
  }
  end() {
    for (const near of this.species.values()) for (const p of near.far ? [near, near.far] : [near]) {
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
