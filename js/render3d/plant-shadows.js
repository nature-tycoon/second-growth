// Cull against the sun's shadow camera, not the player's camera: a tree outside
// the view can still shade the visible ground. Keep the existing caster shapes.
import * as THREE from 'three';
import { PlantBatch, shadowOnly } from './plant-view.js';

export class PlantShadows {
  constructor(scene, enabled = true) {
    this.scene = scene; this.enabled = enabled; this.version = 0; this.floraVersion = -1;
    this.frustum = new THREE.Frustum(); this.matrix = new THREE.Matrix4(); this.hasFrustum = false;
    this.states = new Map(); this.groups = new Map(); this.batches = new Map(); this.bounds = new WeakMap();
    this.stats = { candidates: 0, instances: 0, batches: 0, updates: 0 };
  }
  setEnabled(enabled, flora) {
    if (this.enabled === enabled) return;
    this.enabled = enabled; this.version++; this.floraVersion = -1; this.hasFrustum = false;
    this.states.clear(); this.groups.clear();
    for (const pool of flora.pools.values()) for (const source of pool.subs.values()) {
      source.packedShadows = false; source.useProxy();
    }
    for (const batch of this.batches.values()) if (batch.mesh) batch.mesh.visible = false;
    this.stats.candidates = this.stats.instances = this.stats.batches = 0;
  }
  boundsFor(source, geometry) {
    const attribute = source.mesh.instanceMatrix, old = this.bounds.get(source);
    if (old?.attribute === attribute && old.version === attribute.version && old.count === source.n && old.geometry === geometry) return old;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const { center, radius } = geometry.boundingSphere, m = attribute.array, data = new Float64Array(source.n * 4);
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let k = 0; k < source.n; k++) {
      const i = k * 16, b = k * 4;
      data[b] = m[i] * center.x + m[i + 4] * center.y + m[i + 8] * center.z + m[i + 12];
      data[b + 1] = m[i + 1] * center.x + m[i + 5] * center.y + m[i + 9] * center.z + m[i + 13];
      data[b + 2] = m[i + 2] * center.x + m[i + 6] * center.y + m[i + 10] * center.z + m[i + 14];
      const scale = Math.max(Math.hypot(m[i], m[i + 1], m[i + 2]), Math.hypot(m[i + 4], m[i + 5], m[i + 6]), Math.hypot(m[i + 8], m[i + 9], m[i + 10]));
      // The existing depth material doesn't deform these casters with wind.
      const r = data[b + 3] = radius * scale + 0.0001 * Math.max(1, radius * scale);
      minX = Math.min(minX, data[b] - r); maxX = Math.max(maxX, data[b] + r);
      minY = Math.min(minY, data[b + 1] - r); maxY = Math.max(maxY, data[b + 1] + r);
      minZ = Math.min(minZ, data[b + 2] - r); maxZ = Math.max(maxZ, data[b + 2] + r);
    }
    const region = new THREE.Sphere(new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2), Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2);
    const record = { attribute, version: attribute.version, count: source.n, geometry, data, region };
    this.bounds.set(source, record); return record;
  }
  visible(data, b) {
    for (const plane of this.frustum.planes) {
      const n = plane.normal;
      if (n.x * data[b] + n.y * data[b + 1] + n.z * data[b + 2] + plane.constant < -data[b + 3]) return false;
    }
    return true;
  }
  sync(flora, version, force = false) {
    if (!this.enabled || (!force && version === this.floraVersion)) return;
    this.floraVersion = version;
    const next = new Map(), groups = new Map(); let changed = false;
    const stats = this.stats; stats.candidates = stats.instances = stats.batches = 0;
    for (const pool of flora.pools.values()) for (const source of pool.subs.values()) {
      const mesh = source.mesh;
      if (!mesh) continue;
      // Custom depth/alpha materials keep their original drawing path.
      const proxy = source.standIn();
      const packed = !!(proxy || (!source.mat.map && !source.mat.alphaMap && !source.mat.alphaTest && source.mat.side === THREE.FrontSide && source.mat.shadowSide == null && !mesh.customDepthMaterial));
      // (the visible batch's shadow mirror depends on which path casts, so it is told directly)
      if (source.packedShadows !== packed) source.onChange?.();
      source.packedShadows = packed; source.useProxy();
      if (packed && source.viewShadow) source.viewShadow.visible = false;
      if (!source.castsShadow || !mesh.visible || (!proxy && !source.mat.visible) || !source.n || !this.hasFrustum) continue;
      const geometry = source.shadowGeometry(), attribute = mesh.instanceMatrix, old = this.states.get(source);
      stats.candidates += source.n;
      let state;
      if (!force && old?.geometry === geometry && old.attribute === attribute && old.attributeVersion === attribute.version && old.count === source.n && old.packed === packed) state = old;
      else {
        state = old || { indices: [], matrices: new Float32Array(0), revision: 0 };
        const previousCount = state.indices.length, previousGeometry = state.geometry, previousPacked = state.packed;
        const indices = state.indices, bounds = this.boundsFor(source, geometry), original = attribute.array;
        indices.length = 0; let different = false;
        if (!packed || this.frustum.intersectsSphere(bounds.region)) for (let k = 0; k < source.n; k++) if (!packed || this.visible(bounds.data, k * 4)) {
          const at = indices.length * 16; indices.push(k);
          if (at + 16 > state.matrices.length) {
            const grown = new Float32Array(Math.max(64, Math.ceil((at + 16) * 1.5)));
            grown.set(state.matrices); state.matrices = grown;
          }
          for (let j = 0; j < 16; j++) {
            const v = original[k * 16 + j];
            if (v !== state.matrices[at + j]) different = true;
            state.matrices[at + j] = v;
          }
        }
        if (indices.length || previousCount) {
          different ||= !old || previousGeometry !== geometry || previousPacked !== packed || previousCount !== indices.length || !packed;
        }
        if (different) { changed = true; state.revision++; }
        Object.assign(state, { geometry, attribute, attributeVersion: attribute.version, count: source.n, packed });
      }
      next.set(source, state); stats.instances += state.indices.length;
      if (packed && state.indices.length) {
        let group = groups.get(pool); if (!group) groups.set(pool, group = []);
        group.push({ source, state });
      }
    }
    for (const [source, old] of this.states) if (!next.has(source) && old.indices.length) changed = true;
    this.states = next; this.groups = groups; stats.batches = groups.size;
    if (changed) this.version++;
  }
  update(flora, light, camera, version) {
    if (!this.enabled) return;
    light.updateWorldMatrix(true, false); light.target.updateWorldMatrix(true, false);
    light.shadow.updateMatrices(light, camera);
    const c = light.shadow.camera;
    this.matrix.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix); this.hasFrustum = true;
    this.sync(flora, version, true); this.stats.updates++;
    for (const batch of this.batches.values()) if (batch.mesh) batch.mesh.visible = false;
    for (const [pool, entries] of this.groups) {
      let batch = this.batches.get(pool);
      if (!batch) this.batches.set(pool, batch = new PlantBatch(this.scene, true));
      const geometry = flora.geometryIndex.get(entries[0].state.geometry);
      if (batch.mesh?.geometry === geometry && batch.shadowSources?.length === entries.length && entries.every((e, i) => batch.shadowSources[i] === e.source && batch.shadowStates[i] === e.state && batch.shadowRevisions[i] === e.state.revision)) {
        batch.mesh.visible = batch.count > 0; continue;
      }
      batch.count = 0;
      const sources = entries.map(e => e.source);
      for (let s = 0; s < entries.length; s++) for (const index of entries[s].state.indices) {
        batch.indices[batch.count * 2] = s; batch.indices[batch.count * 2 + 1] = index; batch.count++;
      }
      batch.write(sources, geometry, shadowOnly, false);
      batch.shadowSources = sources; batch.shadowStates = entries.map(e => e.state); batch.shadowRevisions = entries.map(e => e.state.revision);
    }
  }
  dispose() { for (const batch of this.batches.values()) batch.dispose(); this.batches.clear(); this.states.clear(); this.groups.clear(); }
}
