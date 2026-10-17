// Plant instance buffers, detail levels, chunk replay and shadow proxies.
import * as THREE from 'three';
import { floraChunkKey } from './flora-changes.js';
import { shadowOnly, skipMainDraw } from './plant-view.js';

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();

// Colors below are written in sRGB; three.js works in linear light.
const lin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

// A growable InstancedMesh.
// Shadow stand-ins: drawn into the sun's shadow map, but write nothing to the view itself.
// (three.js picks shadow casters by the view camera's layers, so they stay on the default layer.)
// Bumped whenever any plant mesh changes (built, moved, swapped for another level of detail),
// so the renderer knows its reused shadow map is out of date (see Renderer.shadowsStale).
export const floraVersion = { n: 0 };

// lod: 0 close, 1 distant, 2 in-between (geoMid, where a plant has one), 3 far (geoFar, with the
// whole valley in view: see far-models.js; pools without one keep the distant model). shadowGeo: a simpler
// model that casts this pool's shadow in its place (soft shadows look the same from the
// distant tree model, at a fraction of the cost).
export class PlantPool {
  constructor(scene, geo, mat, { shadow = true, receive = false, geoLo = null, geoMid = null, geoFar = null, shadowGeo = null, kind = 'plant', geometryIndex = null } = {}) {
    this.scene = scene; this.geo = geo; this.geoLo = geoLo || geo; this.geoMid = geoMid || geo; this.geoFar = geoFar || this.geoLo; this.shadowGeo = shadowGeo;
    this.mat = mat; this.shadow = shadow; this.receive = receive;
    this.kind = kind; this.lod = 0;
    this.geometryIndex = geometryIndex; this.castsShadow = shadow; this.packedShadows = false;
    this.cap = 0; this.mesh = null; this.proxy = null; this.n = 0;
    this.m = []; this.c = [];
  }
  geoFor(lod) { return lod === 1 ? this.geoLo : lod === 2 ? this.geoMid : lod === 3 ? this.geoFar : this.geo; }
  renderGeo(geometry) { return this.geometryIndex?.get(geometry) || geometry; }
  // the stand-in only casts while the view shows a more detailed model than it
  standIn() { return !!this.shadowGeo && (this.lod === 0 || this.lod === 2); }
  shadowGeometry() { return this.standIn() ? this.shadowGeo : this.geoFor(this.lod); }
  // The stand-in casts the shadow only while the view shows a more detailed model than it; when
  // the distant or far model is on show anyway, that casts its own shadow and the stand-in rests.
  useProxy() {
    if (!this.mesh) return;
    const stand = !!(this.proxy && this.standIn() && this.castsShadow);
    if (this.proxy) this.proxy.visible = stand && this.mesh.visible && !this.packedShadows;
    this.mesh.castShadow = this.castsShadow && !stand && !this.packedShadows;
  }
  begin() { this.n = 0; }
  add(x, y, z, sx, sy, sz, rotY, color, rotX = 0, rotZ = 0) {
    tmpP.set(x, y, z); tmpS.set(sx, sy, sz); tmpE.set(rotX, rotY, rotZ); tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpP, tmpQ, tmpS);
    const k = this.n++;
    if (k >= this.m.length) { this.m.push(new Float32Array(16)); this.c.push([1, 1, 1]); }
    tmpM.toArray(this.m[k]);
    const c = this.c[k]; c[0] = lin(color[0]); c[1] = lin(color[1]); c[2] = lin(color[2]);
  }
  // an instance exactly as recorded from add (16 matrix numbers, then 3 colour numbers)
  addRaw(v, o) {
    const k = this.n++;
    if (k >= this.m.length) { this.m.push(new Float32Array(16)); this.c.push([1, 1, 1]); }
    const m = this.m[k], c = this.c[k];
    for (let j = 0; j < 16; j++) m[j] = v[o + j];
    c[0] = v[o + 16]; c[1] = v[o + 17]; c[2] = v[o + 18];
  }
  // Returns false, touching nothing, when the instances are exactly those already drawn: a
  // region is rebuilt for a change in one corner, and most of its buffers come out the same.
  // (An upload would also make the visible and shadow batches and the shadow map redo theirs.)
  end() {
    if (!this.mesh ? this.n === 0 : this.n === this.mesh.count && this.n <= this.cap && this.unchanged()) return false;
    floraVersion.n++;
    this.onChange?.();
    if (this.n > this.cap) {
      this.dispose();
      this.cap = Math.max(16, Math.ceil(this.n * 1.5));
      this.mesh = new THREE.InstancedMesh(this.renderGeo(this.geoFor(this.lod)), this.mat, this.cap);
      this.mesh.castShadow = this.shadow && !this.shadowGeo; this.mesh.receiveShadow = this.receive;
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
      this.scene.add(this.mesh);
      if (this.shadow && this.shadowGeo) {
        const p = this.proxy = skipMainDraw(new THREE.InstancedMesh(this.renderGeo(this.shadowGeo), shadowOnly, this.cap));
        p.instanceMatrix = this.mesh.instanceMatrix; // (the same trees, in the same places)
        p.castShadow = true;
        this.scene.add(p);
      }
    }
    if (!this.mesh) return;
    this.mesh.visible = this.n > 0;
    const ma = this.mesh.instanceMatrix.array, ca = this.mesh.instanceColor.array;
    for (let k = 0; k < this.n; k++) { ma.set(this.m[k], k * 16); ca[k * 3] = this.c[k][0]; ca[k * 3 + 1] = this.c[k][1]; ca[k * 3 + 2] = this.c[k][2]; }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    // lets three.js skip this chunk when it's off screen
    if (this.n) { this.mesh.computeBoundingSphere(); this.mesh.boundingSphere.radius += 3; }
    if (this.proxy) { this.proxy.count = this.n; if (this.n) this.proxy.boundingSphere = this.mesh.boundingSphere.clone(); this.useProxy(); }
    return true;
  }
  unchanged() {
    const ma = this.mesh.instanceMatrix.array, ca = this.mesh.instanceColor.array, f = Math.fround;
    for (let k = 0; k < this.n; k++) {
      const m = this.m[k], c = this.c[k], o = k * 16;
      for (let j = 0; j < 16; j++) if (ma[o + j] !== m[j]) return false;
      if (ca[k * 3] !== f(c[0]) || ca[k * 3 + 1] !== f(c[1]) || ca[k * 3 + 2] !== f(c[2])) return false;
    }
    return true;
  }
  dispose() {
    floraVersion.n++;
    this.onChange?.();
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.dispose(); }
    if (this.proxy) { this.scene.remove(this.proxy); this.proxy.dispose(); this.proxy = null; }
    if (this.viewShadow) { this.scene.remove(this.viewShadow); this.viewShadow.dispose(); this.viewShadow = null; }
  }
  setView(lod, grass, shrubShadow, grassLod = lod) {
    if (this.kind === 'grass') lod = grassLod;
    floraVersion.n++;
    this.onChange?.();
    this.lod = lod;
    if (!this.mesh) return;
    this.mesh.geometry = this.renderGeo(this.geoFor(lod));
    if (this.proxy) this.proxy.geometry = this.renderGeo(this.shadowGeo);
    if (this.kind === 'grass') this.mesh.visible = grass && this.n > 0;
    this.castsShadow = this.shadow && (this.kind !== 'shrub' || shrubShadow);
    this.useProxy(); // flower heads and fruit on a bush never cast shadows
  }
}

// Splits instances into map chunks so off-screen plants aren't drawn.
export class ChunkedPlantPool {
  /**
   * @param {function(): PlantPool} make Builds a source buffer for one chunk.
   * @param {{incremental: boolean, activeChunk: number, chunkSize: number,
   *   rec?: {n: number, pools: ChunkedPlantPool[], vals: Float32Array}|null}} placement
   * Live placement/replay state; the pool does not read a farm or species catalog.
   */
  constructor(make, placement) { this.make = make; this.placement = placement; this.subs = new Map(); this.view = [0, true, true, 0]; this.revision = 0; }
  setView(...v) { this.view = v; for (const p of this.subs.values()) p.setView(...v); }
  begin(dirty) { for (const [k, p] of this.subs) if (!dirty || dirty.has(k)) p.begin(); }
  add(x, y, z, ...rest) {
    // Keep a source tile's flowers, fruit and connecting features together when rebuilding
    // selected regions, even when a piece extends past a region's boundary.
    const k = this.placement.incremental ? this.placement.activeChunk : floraChunkKey(x, z, this.placement.chunkSize);
    const p = this.sub(k);
    p.add(x, y, z, ...rest);
    // (kept for the tile, so the next rebuild of its region can reuse it: see Flora.rebuild)
    const rec = this.placement.rec;
    if (rec) {
      // (written over the tile's last record in place: no new arrays each rebuild)
      const m = p.m[p.n - 1], c = p.c[p.n - 1], v = rec.vals, o = rec.n * 19;
      rec.pools[rec.n++] = this;
      for (let j = 0; j < 16; j++) v[o + j] = m[j];
      v[o + 16] = c[0]; v[o + 17] = c[1]; v[o + 18] = c[2];
    }
  }
  sub(k) {
    let p = this.subs.get(k);
    if (!p) {
      p = this.make(); p.lod = p.kind === 'grass' ? this.view[3] : this.view[0];
      // Keep model invalidation local; separate canopy scaffolds still use the global shadow
      // revision without forcing every ordinary plant model to repack its visible instances.
      p.onChange = () => { this.revision++; };
      this.subs.set(k, p); this.revision++;
    }
    return p;
  }
  replay(v, o) { this.sub(this.placement.activeChunk).addRaw(v, o); }
  end(dirty) { for (const [k, p] of this.subs) if ((!dirty || dirty.has(k)) && p.end()) p.setView(...this.view); }
}
