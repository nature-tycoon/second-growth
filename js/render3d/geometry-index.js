// Drawing copies only: procedural geometry and canopy support keep their original
// triangle lists. Share a vertex only when every attribute has identical bits.
import * as THREE from 'three';

export class GeometryIndex {
  constructor(enabled = true) {
    this.enabled = enabled; this.cache = new WeakMap(); this.records = new Set();
    this.stats = { geometries: 0, sourceVertices: 0, sharedVertices: 0, sourceBytes: 0, sharedBytes: 0 };
  }
  get(source) {
    if (!this.enabled || source.index || Object.keys(source.morphAttributes).length) return source;
    const attributes = Object.entries(source.attributes);
    if (!source.attributes.position || attributes.some(([, a]) => a.isInterleavedBufferAttribute || !(a.array instanceof Float32Array) || a.count !== source.attributes.position.count)) return source;
    const old = this.cache.get(source);
    if (old && old.attributes.length === attributes.length && attributes.every(([name, a], i) => {
      const b = old.attributes[i];
      return name === b.name && a === b.attribute && a.array === b.array && a.version === b.version && a.itemSize === b.itemSize && a.normalized === b.normalized;
    })) return old.geometry;
    if (old) this.release(old);

    const count = source.attributes.position.count, words = attributes.map(([, a]) => new Uint32Array(a.array.buffer, a.array.byteOffset, a.array.length));
    const ids = new Map(), first = [], indices = new Array(count);
    for (let i = 0; i < count; i++) {
      let key = '';
      for (let a = 0; a < attributes.length; a++) {
        const size = attributes[a][1].itemSize;
        for (let j = 0; j < size; j++) key += words[a][i * size + j] + ',';
        key += '|';
      }
      let id = ids.get(key);
      if (id === undefined) { id = first.length; ids.set(key, id); first.push(i); }
      indices[i] = id;
    }
    const sourceBytes = attributes.reduce((n, [, a]) => n + a.array.byteLength, 0);
    const sharedBytes = first.length * attributes.reduce((n, [, a]) => n + a.itemSize * 4, 0) + count * (first.length > 65535 ? 4 : 2);
    let geometry = source;
    // A mesh without enough repeated vertices keeps its original buffer.
    if (sharedBytes < sourceBytes) {
      geometry = source.clone();
      for (let a = 0; a < attributes.length; a++) {
        const [name, attribute] = attributes[a], size = attribute.itemSize;
        const data = new Float32Array(first.length * size), bits = new Uint32Array(data.buffer);
        for (let k = 0; k < first.length; k++) for (let j = 0; j < size; j++) bits[k * size + j] = words[a][first[k] * size + j];
        geometry.setAttribute(name, new THREE.BufferAttribute(data, size, attribute.normalized).setUsage(attribute.usage));
      }
      geometry.setIndex(indices);
    }
    const record = { source, geometry, attributes: attributes.map(([name, a]) => ({ name, attribute: a, array: a.array, version: a.version, itemSize: a.itemSize, normalized: a.normalized })),
      sourceVertices: count, sharedVertices: geometry === source ? count : first.length, sourceBytes, sharedBytes: geometry === source ? sourceBytes : sharedBytes };
    record.onDispose = () => this.release(record);
    source.addEventListener('dispose', record.onDispose);
    this.cache.set(source, record); this.records.add(record); this.stats.geometries++;
    for (const key of ['sourceVertices', 'sharedVertices', 'sourceBytes', 'sharedBytes']) this.stats[key] += record[key];
    return geometry;
  }
  release(record) {
    if (!this.records.delete(record)) return;
    record.source.removeEventListener('dispose', record.onDispose); this.cache.delete(record.source);
    if (record.geometry !== record.source) record.geometry.dispose();
    this.stats.geometries--;
    for (const key of ['sourceVertices', 'sharedVertices', 'sourceBytes', 'sharedBytes']) this.stats[key] -= record[key];
  }
  dispose() { for (const record of [...this.records]) this.release(record); }
}
