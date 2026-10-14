// Keep the source regions for growth and shadows; pack only visible plants into
// one drawing batch per model. Visibility changes only with the camera or plants.
import * as THREE from 'three';

export const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

// Three.js calls onBeforeShadow separately from onBeforeRender. A zero instance
// count skips the main-camera draw entirely, while the shadow pass keeps every
// caster. Restore the count so bounds, later shadows and audits see the source.
export function skipMainDraw(mesh) {
  let count = 0;
  mesh.onBeforeRender = () => { count = mesh.count; mesh.count = 0; };
  mesh.onAfterRender = () => { mesh.count = count; };
  return mesh;
}

export class PlantBatch {
  constructor(scene, shadow = false) { this.scene = scene; this.shadow = shadow; this.mesh = null; this.capacity = 0; this.indices = []; this.count = 0; }
  write(sources, geometry, material, receiveShadow) {
    const count = this.count;
    if (count > this.capacity) {
      this.dispose();
      this.capacity = Math.max(16, Math.ceil(count * 1.5));
      this.mesh = new THREE.InstancedMesh(geometry, material, this.capacity);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (this.shadow) { this.mesh.castShadow = true; skipMainDraw(this.mesh); }
      else {
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3);
        this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      // Instances have already been tested against the camera. The source
      // meshes retain the conservative bounds used by the shadow camera.
      this.mesh.frustumCulled = false;
      this.scene.add(this.mesh);
    }
    const mesh = this.mesh;
    if (!mesh) return;
    mesh.geometry = geometry; mesh.material = material; mesh.receiveShadow = receiveShadow;
    mesh.count = count; mesh.visible = count > 0;
    const matrices = mesh.instanceMatrix.array, colors = mesh.instanceColor?.array;
    for (let k = 0; k < count; k++) {
      const source = this.indices[k * 2], index = this.indices[k * 2 + 1], original = sources[source].mesh;
      const m = original.instanceMatrix.array, c = original.instanceColor?.array;
      for (let j = 0; j < 16; j++) matrices[k * 16 + j] = m[index * 16 + j];
      if (colors) { colors[k * 3] = c[index * 3]; colors[k * 3 + 1] = c[index * 3 + 1]; colors[k * 3 + 2] = c[index * 3 + 2]; }
    }
    if (count) {
      mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
      if (colors) {
        mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, count * 3);
        mesh.instanceColor.needsUpdate = true;
      }
      if (this.shadow) mesh.computeBoundingSphere();
    }
  }
  sortBounds(sources) {
    // Main batches are already culled. Use the complete model's source bounds for draw
    // ordering: a moving padded subset must not reorder coplanar corals or ground details.
    this.sortBox ||= new THREE.Box3(); this.sourceBox ||= new THREE.Box3();
    this.sortBox.makeEmpty();
    for (const source of sources) {
      const sphere = source.mesh.boundingSphere;
      if (!source.n || !sphere) continue;
      this.sourceBox.min.copy(sphere.center).addScalar(-sphere.radius);
      this.sourceBox.max.copy(sphere.center).addScalar(sphere.radius);
      this.sortBox.union(this.sourceBox);
    }
    this.sortBox.getBoundingSphere(this.mesh.boundingSphere ||= new THREE.Sphere());
  }
  dispose() {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.dispose(); this.mesh = null; }
    this.capacity = 0;
  }
}

export class PlantView {
  constructor(scene, { panMargin = 0.04, incremental = true } = {}) {
    this.scene = scene; this.batches = new Map(); this.bounds = new WeakMap();
    this.frustum = new THREE.Frustum(); this.matrix = new THREE.Matrix4();
    this.previous = new Float64Array(16).fill(NaN); this.version = -1; this.enabled = false;
    this.panMargin = panMargin; this.cameraReady = false; this.orthographic = false;
    this.incremental = incremental; this.selections = new WeakMap();
    this.box = new THREE.Box3(); this.sphere = new THREE.Sphere();
    this.stats = { candidates: 0, visible: 0, batches: 0, updates: 0, packedUpdates: 0 };
  }
  configure({ panMargin = this.panMargin, incremental = this.incremental } = {}) {
    if (!Number.isFinite(panMargin) || panMargin < 0 || panMargin > 0.25) throw new Error('Invalid plant view margin');
    incremental = !!incremental;
    if (panMargin === this.panMargin && incremental === this.incremental) return;
    this.panMargin = panMargin; this.incremental = incremental; this.cameraReady = false;
  }
  covers(camera, elements) {
    if (!this.cameraReady || this.orthographic !== !!camera.isOrthographicCamera) return false;
    if (!this.panMargin || !camera.isOrthographicCamera) return elements.every((v, k) => v === this.previous[k]);
    // Orthographic pans change only the translation in clip space. Ignore numerical noise
    // from lookAt, but refresh immediately for zoom, rotation or changed clipping planes.
    for (let k = 0; k < 12; k++) if (Math.abs(elements[k] - this.previous[k]) > 1e-12) return false;
    for (let k = 12; k < 15; k++) if (Math.abs(elements[k] - this.previous[k]) > this.panMargin) return false;
    return elements[15] === this.previous[15];
  }
  boundsFor(pool) {
    const mesh = pool.mesh, attribute = mesh.instanceMatrix;
    const cached = this.bounds.get(pool);
    if (cached?.attribute === attribute && cached.version === attribute.version && cached.count === pool.n) return cached.data;
    // Enclose every detail level, so changing zoom cannot expose a clipped
    // branch. The existing region bounds allow three units for wind; retain
    // that same margin around each instance.
    this.box.makeEmpty();
    for (const geometry of new Set([pool.geo, pool.geoLo, pool.geoMid, pool.geoFar])) {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      this.box.union(geometry.boundingBox);
    }
    this.box.getBoundingSphere(this.sphere);
    const { x, y, z } = this.sphere.center, radius = this.sphere.radius;
    const data = new Float64Array(pool.n * 4), matrices = attribute.array;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let k = 0; k < pool.n; k++) {
      const m = k * 16, b = k * 4;
      data[b] = matrices[m] * x + matrices[m + 4] * y + matrices[m + 8] * z + matrices[m + 12];
      data[b + 1] = matrices[m + 1] * x + matrices[m + 5] * y + matrices[m + 9] * z + matrices[m + 13];
      data[b + 2] = matrices[m + 2] * x + matrices[m + 6] * y + matrices[m + 10] * z + matrices[m + 14];
      const scale = Math.max(Math.hypot(matrices[m], matrices[m + 1], matrices[m + 2]),
        Math.hypot(matrices[m + 4], matrices[m + 5], matrices[m + 6]), Math.hypot(matrices[m + 8], matrices[m + 9], matrices[m + 10]));
      data[b + 3] = radius * scale + 3;
      const r = data[b + 3];
      minX = Math.min(minX, data[b] - r); maxX = Math.max(maxX, data[b] + r);
      minY = Math.min(minY, data[b + 1] - r); maxY = Math.max(maxY, data[b + 1] + r);
      minZ = Math.min(minZ, data[b + 2] - r); maxZ = Math.max(maxZ, data[b + 2] + r);
    }
    this.box.min.set(minX, minY, minZ); this.box.max.set(maxX, maxY, maxZ);
    const region = this.box.getBoundingSphere(new THREE.Sphere());
    this.bounds.set(pool, { attribute, version: attribute.version, count: pool.n, data, region });
    return data;
  }
  visible(bounds, offset) {
    for (const plane of this.frustum.planes) {
      const n = plane.normal;
      if (n.x * bounds[offset] + n.y * bounds[offset + 1] + n.z * bounds[offset + 2] + plane.constant < -bounds[offset + 3]) return false;
    }
    return true;
  }
  detachSource(pool) {
    const mesh = pool.mesh;
    this.scene.remove(mesh);
    // A source using its own geometry as the shadow caster needs a separate
    // shadow mesh now. Detailed trees already have their simpler proxy.
    if (mesh.castShadow && !pool.viewShadow) {
      pool.viewShadow = skipMainDraw(new THREE.InstancedMesh(mesh.geometry, shadowOnly, pool.cap));
      pool.viewShadow.castShadow = true;
      this.scene.add(pool.viewShadow);
    }
    const shadow = pool.viewShadow;
    if (shadow) {
      shadow.geometry = mesh.geometry; shadow.instanceMatrix = mesh.instanceMatrix;
      shadow.count = pool.n; shadow.visible = mesh.visible && mesh.castShadow;
      shadow.boundingSphere = mesh.boundingSphere;
    }
  }
  restoreSource(pool) {
    if (pool.mesh && pool.mesh.parent !== this.scene) this.scene.add(pool.mesh);
    // Keep the mirror alive until the source itself is disposed: disposing an
    // InstancedMesh deletes its GPU instance buffer, which this mirror shares
    // with the source. Reusing it also avoids allocations on view transitions.
    if (pool.viewShadow) pool.viewShadow.visible = false;
  }
  update(flora, camera, version, enabled = true) {
    enabled = !!(enabled && camera);
    if (!enabled) {
      if (this.enabled) {
        for (const pool of flora.pools.values()) for (const source of pool.subs.values()) this.restoreSource(source);
        for (const batch of this.batches.values()) if (batch.mesh) batch.mesh.visible = false;
      }
      this.enabled = false; this.version = -1; this.cameraReady = false;
      return false;
    }
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const elements = this.matrix.elements;
    const covered = this.covers(camera, elements);
    if (this.enabled && version === this.version && covered) return false;
    this.enabled = true; this.version = version;
    if (!covered) {
      this.previous.set(elements); this.cameraReady = true; this.orthographic = !!camera.isOrthographicCamera;
      // Cull a slightly larger view; draw with the real camera. The extra instances are clipped
      // by the GPU, and buffers can be reused until a pan reaches this conservative margin.
      if (this.orthographic && this.panMargin) {
        const scale = 1 / (1 + this.panMargin);
        for (let column = 0; column < 16; column += 4) for (let row = 0; row < 3; row++) elements[column + row] *= scale;
      }
      this.frustum.setFromProjectionMatrix(this.matrix);
    }
    const stats = this.stats; stats.candidates = stats.visible = stats.batches = 0;
    let worked = false;
    for (const pool of flora.pools.values()) {
      let batch = this.batches.get(pool);
      if (!batch) { batch = new PlantBatch(this.scene); this.batches.set(pool, batch); }
      const cachedFirst = batch.first?.mesh;
      const revision = pool.revision ?? version;
      // A changed region affects only models with source buffers in that region. Uniform-only
      // animation and separate solid canopy scaffolds leave these buffers intact.
      if (this.incremental && covered && batch.revision === revision && batch.sourceCount === pool.subs.size &&
        batch.geometry === cachedFirst?.geometry && batch.material === cachedFirst?.material &&
        batch.transparent === cachedFirst?.material.transparent && batch.materialVisible === cachedFirst?.material.visible &&
        batch.receiveShadow === cachedFirst?.receiveShadow) {
        stats.candidates += batch.candidates; stats.visible += batch.count;
        if (batch.count) stats.batches++;
        continue;
      }
      worked = true;
      let needsPack = !this.incremental || !covered || batch.sourceCount !== pool.subs.size;
      batch.count = 0;
      const sources = [...pool.subs.values()].filter(p => p.mesh);
      const first = sources[0]?.mesh;
      needsPack ||= batch.geometry !== first?.geometry || batch.material !== first?.material ||
        batch.transparent !== first?.material.transparent || batch.receiveShadow !== first?.receiveShadow;
      // Transparent regions are depth-sorted independently. Retain their
      // original drawing order for see-through trees and contact shadows.
      const combine = first && !first.material.transparent;
      batch.candidates = 0;
      for (let s = 0; s < sources.length; s++) {
        const source = sources[s], mesh = source.mesh;
        if (!combine) { this.restoreSource(source); continue; }
        this.detachSource(source);
        if (mesh.visible && mesh.material.visible) batch.candidates += source.n;
        const attribute = mesh.instanceMatrix, color = mesh.instanceColor;
        let selected = this.selections.get(source);
        const wasVisible = selected?.indices.length > 0;
        const changed = !selected || selected.attribute !== attribute || selected.version !== attribute.version ||
          selected.count !== source.n || selected.visible !== mesh.visible || selected.materialVisible !== mesh.material.visible;
        const colorChanged = !selected || selected.color !== color || selected.colorVersion !== color?.version;
        if (!selected) { selected = { indices: [] }; this.selections.set(source, selected); }
        if (!this.incremental || !covered || changed) {
          selected.indices.length = 0;
          if (mesh.visible && mesh.material.visible && source.n) {
            const bounds = this.boundsFor(source);
            if (this.frustum.intersectsSphere(this.bounds.get(source).region)) {
              for (let k = 0; k < source.n; k++) if (this.visible(bounds, k * 4)) selected.indices.push(k);
            }
          }
          Object.assign(selected, { attribute, version: attribute.version, count: source.n,
            visible: mesh.visible, materialVisible: mesh.material.visible });
        }
        // A distant source can change while remaining outside the padded view. Retain the
        // model's packed buffer unless a previously or currently visible source changed.
        if ((changed || colorChanged) && (wasVisible || selected.indices.length)) needsPack = true;
        selected.color = color; selected.colorVersion = color?.version;
        for (const k of selected.indices) {
          batch.indices[batch.count * 2] = s; batch.indices[batch.count * 2 + 1] = k; batch.count++;
        }
      }
      if (first && needsPack) { batch.write(sources, first.geometry, first.material, first.receiveShadow); stats.packedUpdates++; }
      else if (!combine && batch.mesh) batch.mesh.visible = false;
      if (combine && batch.mesh) batch.sortBounds(sources);
      Object.assign(batch, { first: sources[0], revision, sourceCount: pool.subs.size, geometry: first?.geometry,
        material: first?.material, transparent: first?.material.transparent, materialVisible: first?.material.visible,
        receiveShadow: first?.receiveShadow });
      stats.candidates += batch.candidates;
      stats.visible += batch.count;
      if (batch.count) stats.batches++;
    }
    if (worked) stats.updates++;
    return worked;
  }
}
