// Crease shading and shine, measured once per model and carried in the length of each vertex
// normal (the shader normalizes normals anyway, and canopy climbers have no vertex attribute to
// spare): length = occlusion + 2 * shine, occlusion in (0, 1], shine 0 (fur, skin), 1 (horn,
// hoof, a wet nose) or 2 (an eye). The fauna shader (animal-material.js) decodes it.
import * as THREE from 'three';

const WINGS = [5.5, 7.5]; // (part ids: see P in model-core.js. Folded wings lie on the flank and spread in flight, so they neither shade nor are shaded)
const MIN_LIGHT = 0.3; // (how dark the deepest crease gets: the share of sky light it still sees)

// How much of the sky each vertex sees past the model's other surfaces nearby: under the belly,
// inside the legs, where legs and neck meet the body, around the eyes and in the ears. Each
// surface patch shades a vertex by the solid angle it covers (its area seen at its distance,
// facing the vertex), counted out to radius, a fraction of the model's size, so it finds creases
// rather than darkening whole sides. Patches are pooled into small cells first, so a finely
// painted coat costs no more than a plain one.
export function bakeSurface(geo, { reach = 0.09, gloss = [] } = {}) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, part = geo.attributes.aPart, n = pos.count;
  const index = geo.index ? geo.index.array : Uint32Array.from({ length: n }, (_, i) => i);
  if (!geo.boundingBox) geo.computeBoundingBox();
  const size = geo.boundingBox.getSize(new THREE.Vector3()), R = reach * Math.max(size.x, size.y, size.z), cell = R / 3;
  // (grid cells as one number: a model spans well under 1024 cells each way)
  const key = (x, y, z, size) => (Math.floor(x / size) + 1024) * 4194304 + (Math.floor(y / size) + 1024) * 2048 + Math.floor(z / size) + 1024;
  const wing = i => { const p = part ? part.getX(i) : 0; return p > WINGS[0] && p < WINGS[1]; };
  // each vertex's share of the surface
  const area = new Float32Array(n), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < index.length; t += 3) {
    const i = index[t], j = index[t + 1], k = index[t + 2];
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, j).sub(a); c.fromBufferAttribute(pos, k).sub(a);
    const s = b.cross(c).length() / 6;
    area[i] += s; area[j] += s; area[k] += s;
  }
  // pool the surface into cells: total area and its centre
  const pool = new Map();
  for (let i = 0; i < n; i++) {
    if (wing(i) || !area[i]) continue;
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = key(x, y, z, cell);
    let e = pool.get(k);
    if (!e) pool.set(k, e = [0, 0, 0, 0]);
    e[0] += area[i]; e[1] += x * area[i]; e[2] += y * area[i]; e[3] += z * area[i];
  }
  // and file the cells by radius, for the search
  const grid = new Map(), cells = [...pool.values()];
  for (const e of cells) {
    e[1] /= e[0]; e[2] /= e[0]; e[3] /= e[0];
    const k = key(e[1], e[2], e[3], R);
    let list = grid.get(k);
    if (!list) grid.set(k, list = []);
    list.push(e);
  }
  // (vertices in one cell search the same patches: gather them once, as one flat list per cell)
  const near = new Map(), nearby = home => {
    let list = near.get(home);
    if (list) return list;
    const found = [];
    for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) for (let w = -1; w <= 1; w++) {
      const cellList = grid.get(home + u * 4194304 + v * 2048 + w);
      if (cellList) for (const e of cellList) found.push(e[0], e[1], e[2], e[3]);
    }
    near.set(home, list = Float32Array.from(found));
    return list;
  };
  const light = new Float32Array(n).fill(1), R2 = R * R, near2 = (cell * 0.5) ** 2;
  for (let i = 0; i < n; i++) {
    if (wing(i)) continue;
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nl = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)) || 1, nx = nor.getX(i) / nl, ny = nor.getY(i) / nl, nz = nor.getZ(i) / nl;
    const list = nearby(key(x, y, z, R));
    let shade = 0;
    for (let k = 0; k < list.length; k += 4) {
      const dx = list[k + 1] - x, dy = list[k + 2] - y, dz = list[k + 3] - z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > R2 || d2 < near2) continue;
      const d = Math.sqrt(d2), facing = (dx * nx + dy * ny + dz * nz) / d;
      if (facing <= 0.05) continue; // (behind or beside the surface: its own curve, not a crease)
      // (the patch's solid angle, fading out toward the radius so the search edge doesn't show)
      shade += facing * list[k] / (Math.PI * d2 + list[k]) * (1 - d / R);
    }
    light[i] = Math.max(MIN_LIGHT, 1 - shade * 1.4);
  }
  const shine = new Uint8Array(n);
  for (const [from, to, level] of gloss) shine.fill(level, from, to);
  for (let i = 0; i < n; i++) {
    const nl = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)) || 1, f = (light[i] + 2 * shine[i]) / nl;
    nor.setXYZ(i, nor.getX(i) * f, nor.getY(i) * f, nor.getZ(i) * f);
  }
  nor.needsUpdate = true;
  return geo;
}

// The occlusion alone (for checks and tools), 1 where nothing was baked.
export const surfaceLight = (geo, i) => {
  const nor = geo.attributes.normal, l = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i));
  return l - 2 * Math.floor(l * 0.5);
};
export const surfaceShine = (geo, i) => {
  const nor = geo.attributes.normal;
  return Math.floor(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)) * 0.5);
};
