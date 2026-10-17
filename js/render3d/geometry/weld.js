// mergeVertices from three.js, with the same result, but hashed with numbers rather than one
// string per vertex: welding the procedural plant and animal parts was a large share of start-up.
import { mergeVertices } from 'three/addons/BufferGeometryUtils.js';

export function weldVertices(geometry, tolerance = 1e-4) {
  const names = Object.keys(geometry.attributes), attrs = names.map(n => geometry.attributes[n]);
  // (anything unusual goes the original way)
  if (Object.keys(geometry.morphAttributes).length || attrs.some(a => a.isInterleavedBufferAttribute || a.normalized || !(a.array instanceof Float32Array))) return mergeVertices(geometry, tolerance);
  tolerance = Math.max(tolerance, Number.EPSILON);
  const multiplier = Math.pow(10, Math.log10(1 / tolerance)), additive = tolerance * 0.5 * multiplier;
  const index = geometry.getIndex(), count = index ? index.count : geometry.attributes.position.count;
  const sizes = attrs.map(a => a.itemSize), width = sizes.reduce((n, s) => n + s, 0);
  const keys = new Float64Array(count * width), out = attrs.map(a => new Float32Array(a.count * a.itemSize)), indices = [];
  let mask = 1; while (mask < count * 2) mask <<= 1;
  const table = new Int32Array(mask).fill(-1); mask--;
  let next = 0;
  for (let i = 0; i < count; i++) {
    const v = index ? index.getX(i) : i, o = next * width;
    let h = 0x811c9dc5, c = 0;
    for (let a = 0; a < attrs.length; a++) {
      const arr = attrs[a].array, s = sizes[a];
      for (let j = 0; j < s; j++) { const k = Math.trunc(arr[v * s + j] * multiplier + additive); keys[o + c++] = k; h = Math.imul(h ^ (k | 0), 0x01000193); }
    }
    let slot = (h ^ (h >>> 15)) & mask, id = -1;
    while (table[slot] !== -1) {
      const t = table[slot], to = t * width; let same = true;
      for (let j = 0; j < width; j++) { const x = keys[to + j], y = keys[o + j]; if (x !== y && (x === x || y === y)) { same = false; break; } }
      if (same) { id = t; break; }
      slot = (slot + 1) & mask;
    }
    if (id === -1) {
      id = next++; table[slot] = id;
      for (let a = 0; a < attrs.length; a++) { const arr = attrs[a].array, s = sizes[a], dst = out[a]; for (let j = 0; j < s; j++) dst[id * s + j] = arr[v * s + j]; }
    }
    indices.push(id);
  }
  // clone everything but the vertex data, which is replaced anyway (copying it cost as much as the weld)
  const { attributes, index: oldIndex } = geometry;
  geometry.attributes = {}; geometry.index = null;
  let result;
  try { result = geometry.clone(); } finally { geometry.attributes = attributes; geometry.index = oldIndex; }
  for (let a = 0; a < attrs.length; a++) result.setAttribute(names[a], new attrs[a].constructor(out[a].slice(0, next * sizes[a]), sizes[a], false));
  result.setIndex(indices);
  return result;
}
