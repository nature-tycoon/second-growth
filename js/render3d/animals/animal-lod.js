// Distant animal models: a vertex-clustered copy of the detailed geometry, drawn only when the
// animal is small on screen. The detailed geometry stays the source for contact, canopy
// support, head reach and picking; this copy only changes what the GPU draws far away.
import * as THREE from 'three';

// Draw the distant model when the animal's body length covers fewer screen pixels than this.
// At the switch, one cluster cell (length / FAR_CELLS) is about one pixel: at 48 pixels zebra
// stripes visibly lost contrast.
export const FAR_PIXELS = 32;
export const FAR_CELLS = 32;
const NORMALS = new Set(['normal', 'aExtN', 'aSwingN']), TONES = 4;

// Each connected piece (a leg, a horn, an eye, the body's loft) clusters on its own grid,
// never coarser than a third of its thinnest extent, so thin parts keep their outline instead
// of collapsing. Vertices merge only within one piece, tone and animated part/pivot, so every
// shader attribute keeps its meaning: positions, colors and alternate poses are averaged.
export function simplifyAnimal(source, length, cells = FAR_CELLS) {
  const pos = source.attributes.position, count = pos.count;
  const index = source.index ? source.index.array : Uint32Array.from({ length: count }, (_, i) => i);
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const root = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let t = 0; t < index.length; t += 3) {
    const a = root(index[t]);
    parent[root(index[t + 1])] = a; parent[root(index[t + 2])] = a;
  }
  const box = new Map();
  for (let i = 0; i < count; i++) {
    const r = root(i), x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const b = box.get(r);
    if (!b) { box.set(r, [x, y, z, x, y, z]); continue; }
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.min(b[2], z);
    b[3] = Math.max(b[3], x); b[4] = Math.max(b[4], y); b[5] = Math.max(b[5], z);
  }
  const base = length / cells, cellOf = new Map();
  for (const [r, b] of box) {
    const sx = b[3] - b[0], sy = b[4] - b[1], sz = b[5] - b[2];
    cellOf.set(r, Math.min(base, Math.max(Math.min(sx, sy, sz) / 3, Math.max(sx, sy, sz) / 5)));
  }
  // Light and dark vertices never merge, so markings such as zebra stripes keep their contrast.
  const part = source.attributes.aPart, pivot = source.attributes.aPivot, color = source.attributes.color;
  const tone = i => color ? Math.round((color.getX(i) * .3 + color.getY(i) * .59 + color.getZ(i) * .11) * TONES) : 0;
  const keys = new Map(), cluster = new Int32Array(count), sizes = [];
  for (let i = 0; i < count; i++) {
    const r = root(i), cell = cellOf.get(r);
    const key = `${r}|${part ? part.getX(i) : 0}|${tone(i)}|${pivot ? pivot.getX(i) + ',' + pivot.getY(i) + ',' + pivot.getZ(i) : ''}|` +
      `${Math.floor(pos.getX(i) / cell)},${Math.floor(pos.getY(i) / cell)},${Math.floor(pos.getZ(i) / cell)}`;
    let id = keys.get(key);
    if (id == null) { id = sizes.length; keys.set(key, id); sizes.push(0); }
    cluster[i] = id; sizes[id]++;
  }
  const out = new THREE.BufferGeometry(), n = sizes.length;
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const size = attribute.itemSize, data = new Float32Array(n * size), src = attribute.array;
    for (let i = 0; i < count; i++) for (let j = 0; j < size; j++) data[cluster[i] * size + j] += src[i * size + j];
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < size; j++) data[k * size + j] /= sizes[k];
      if (NORMALS.has(name) && size === 3) {
        const l = Math.hypot(data[k * 3], data[k * 3 + 1], data[k * 3 + 2]) || 1;
        for (let j = 0; j < 3; j++) data[k * 3 + j] /= l;
      }
    }
    // (aPart and aPivot are constant within a cluster, so their averages are exact)
    out.setAttribute(name, new THREE.BufferAttribute(data, size, attribute.normalized));
  }
  const kept = [], seen = new Set();
  for (let t = 0; t < index.length; t += 3) {
    const a = cluster[index[t]], b = cluster[index[t + 1]], c = cluster[index[t + 2]];
    if (a === b || b === c || a === c) continue;
    // the same face with the same winding, starting from its lowest corner
    const key = a < b && a < c ? `${a},${b},${c}` : b < c ? `${b},${c},${a}` : `${c},${a},${b}`;
    if (seen.has(key)) continue;
    seen.add(key); kept.push(a, b, c);
  }
  out.setIndex(kept);
  out.boundingBox = source.boundingBox?.clone() ?? null;
  out.boundingSphere = source.boundingSphere?.clone() ?? null;
  return out;
}

export const triangleCount = geo => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
