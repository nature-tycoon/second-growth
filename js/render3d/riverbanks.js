// Small visual shoreline details. They never create ecological plants or habitat features.
import * as THREE from 'three';
import { T, LEVEL } from '../config.js';
import { hash2, valueNoise } from '../rng.js';
import { plantPhase } from '../data/plants.js';
import { prep, merge } from './geometry/primitives.js';
import { tuft } from './geometry/groundcover.js';
import { withClouds } from './atmosphere.js';
import { withSnowTops } from './snow.js';
import { paletteLeafColor } from './palettes.js';

// Match the two triangles used by the ground and water, rather than bilinear heightAt.
export function surfaceHeight(at, x, z) {
  const xx = Math.floor(x), zz = Math.floor(z), u = x - xx, v = z - zz;
  const a = at(xx, zz), b = at(xx + 1, zz), c = at(xx + 1, zz + 1), d = at(xx, zz + 1);
  return u >= v ? a + (b - a) * u + (c - b) * v : a + (c - d) * u + (d - a) * v;
}

export function bankAllowed(world, border, terrainAt, x, z) {
  const t = terrainAt(x, z);
  if (t === T.ROAD || t === T.TRAIL || t === T.FIELD) return false;
  if (world.inb(x, z)) {
    const i = world.idx(x, z);
    if (world.struct[i] >= 0 || world.feature[i]) return false;
  }
  return true;
}

export function bankDetails(world, border, cells, waterAt, terrainAt, underwater = false, month = 2) {
  const out = { stones: [], grasses: [], wood: [] };
  if (underwater) return out;
  for (const [x, z] of cells) cellDetails(world, border, x, z, waterAt, terrainAt, month, out);
  return out;
}

// One bank tile's stones, sedge and driftwood, added to out. It reads the water and the ground at its own
// corners and the tiles round it, their terrain, buildings and features, its own planting and the trees
// round it (Riverbanks.refresh fingerprints all but the water and the ground).
export function cellDetails(world, border, x, z, waterAt, terrainAt, month, out) {
  const groundAt = (x, z) => surfaceHeight((xx, zz) => world.vert(xx, zz) * LEVEL, x, z);
  {
    if (!bankAllowed(world, border, terrainAt, x, z)) return;
    // a marsh is a sheet of sedge and mud, not a gravel bar: no stones or driftwood in it or on its edge
    const marshy = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => terrainAt(x + dx, z + dz) === T.MARSH);
    const i = world.inb(x, z) ? world.idx(x, z) : -1, bi = i < 0 ? border.bi(x, z) : -1;
    const source = i < 0 ? border : world, index = i < 0 ? bi : i;
    const gp = index >= 0 && world.catalog.plants[source.ground[index]];
    const wetPlant = gp && ['sedge', 'tule', 'cattail', 'papyrus'].includes(gp.look.type);
    const phase = gp ? plantPhase(gp, month) : '';
    const grassColor = gp && paletteLeafColor(gp, phase, world.catalog.definition.id);
    const plantGrowth = i < 0 ? 1 : world.groundG[i];
    const patch = valueNoise(x + 47, z + 113, 3.8, 371);
    for (let k = 0; k < 10; k++) {
      const px = x + .04 + hash2(x, z, 372 + k * 2) * .92;
      const pz = z + .04 + hash2(x, z, 373 + k * 2) * .92;
      const water = waterAt(px, pz);
      if (!Number.isFinite(water)) continue;
      const ground = groundAt(px, pz), rise = ground - water;
      if (rise < -.055 || rise > .17) continue;
      const r = hash2(x, z, 401 + k), angle = hash2(x, z, 421 + k) * Math.PI * 2;
      // Gravel collects in patches, with a few larger stones defining the bank.
      // (fewer stones, big enough to read at the usual zoom)
      if (!marshy && r < .03 + patch * .14 && rise < .12) {
        const size = .05 + hash2(x, z, 441 + k) * .06;
        out.stones.push({ x: px, y: ground + size * .2, z: pz, size, angle,
          tone: .46 + hash2(x, z, 461 + k) * .2, wet: rise < .018 });
      }
      // Extend only actual wetland groundcover along its bank, rather than inventing reed habitat.
      if (wetPlant && plantGrowth > .25 && rise > -.015 && rise < .15 && k < 3 && r > .35) {
        out.grasses.push({ x: px, y: Math.max(ground, water) + .005, z: pz, angle,
          size: (.45 + hash2(x, z, 481 + k) * .3) * plantGrowth, color: grassColor });
      }
    }
    // Short washed-up branches, sparse and restricted to wooded banks.
    if (marshy || hash2(x, z, 503) > .045) return;
    let wooded = false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, zz = z + dz, inside = world.inb(xx, zz);
      const j = inside ? world.idx(xx, zz) : border.bi(xx, zz), s = inside ? world : border;
      if (j >= 0 && s.tree[j] && (s.treeG[j] || (inside ? 0 : .9)) > .55) wooded = true;
    }
    if (!wooded) return;
    const px = x + .5, pz = z + .5, water = waterAt(px, pz), ground = groundAt(px, pz);
    if (!Number.isFinite(water) || ground - water < -.015 || ground - water > .14) return;
    const angle = hash2(x, z, 504) * Math.PI * 2, length = .35 + hash2(x, z, 505) * .38;
    const dx = Math.cos(angle) * length / 2, dz = Math.sin(angle) * length / 2;
    const ends = [[px - dx, pz - dz], [px + dx, pz + dz]];
    if (ends.some(([xx, zz]) => !bankAllowed(world, border, terrainAt, Math.floor(xx), Math.floor(zz))
      || !Number.isFinite(waterAt(xx, zz)) || groundAt(xx, zz) - waterAt(xx, zz) < -.03)) return;
    const slope = groundAt(...ends[1]) - groundAt(...ends[0]);
    if (Math.abs(slope) > .12) return;
    out.wood.push({ x: px, y: (groundAt(...ends[0]) + groundAt(...ends[1])) / 2 + .02,
      z: pz, angle, length, slope });
  }
}

// (a float's bits, for the per-cell fingerprints: Riverbanks.refresh)
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);

function driftwoodGeometry() {
  const log = prep(new THREE.CylinderGeometry(.028, .038, 1, 6)).rotateZ(Math.PI / 2);
  const tip = prep(new THREE.CylinderGeometry(.009, .017, .25, 4))
    .rotateZ(-.7).translate(-.15, .07, .02);
  const cap = prep(new THREE.CircleGeometry(.03, 6), '#baa07b')
    .rotateY(Math.PI / 2).translate(.501, 0, 0);
  const parts = [log, tip, cap], g = merge(parts);
  for (const p of parts) p.dispose();
  return g;
}

export class Riverbanks {
  constructor(scene) {
    this.scene = scene; this.meshes = []; this.key = null; this.version = 0; // (bumped when the stones and branches change: their shadows need redrawing)
    this.geometries = [prep(new THREE.IcosahedronGeometry(1, 0)), tuft('sedge', 379, true), driftwoodGeometry()];
    this.materials = this.geometries.map((_, k) => withClouds(withSnowTops(
      new THREE.MeshLambertMaterial({ vertexColors: true, side: k === 1 ? THREE.DoubleSide : THREE.FrontSide }), k === 1 ? 1.2 : .8)));
  }
  // redo: null to scatter every cell again (a whole water build); else which cells the water or ground
  // changed under (a patch, water-build.js), the others kept unless what they read changed
  bind(world, border, cells, waterAt, terrainAt, underwater, redo = null) {
    if (world !== this.world) this.memo = null;
    this.world = world; this.border = border; this.cells = cells;
    this.waterAt = waterAt; this.terrainAt = terrainAt; this.underwater = underwater;
    this.redo = redo || (() => true); this.key = null; this.refresh(); this.redo = null;
  }
  // Each cell's details, kept from the last scatter where neither its water nor what it reads changed.
  scatter(month) {
    const out = { stones: [], grasses: [], wood: [] }, memo = new Map(), was = this.memo;
    if (!this.underwater) for (let c = 0; c < this.cells.length; c++) {
      const [x, z] = this.cells[c], id = (z + 1024) * 4096 + x + 1024, h = this.cellH[c];
      let m = was?.get(id);
      if (!m || m.h !== h || this.redo?.(x, z)) {
        m = { h, d: { stones: [], grasses: [], wood: [] } };
        cellDetails(this.world, this.border, x, z, this.waterAt, this.terrainAt, month, m.d);
      }
      memo.set(id, m);
      for (const p of m.d.stones) out.stones.push(p);
      for (const p of m.d.grasses) out.grasses.push(p);
      for (const p of m.d.wood) out.wood.push(p);
    }
    this.memo = memo;
    return out;
  }
  refresh(month = this.month ?? 2) {
    this.version++;
    this.month = month;
    // Only the bank tiles' planting and feature changes require re-scattering.
    // (checked on every ground repaint, so it allocates nothing per tile)
    // Each cell's own fingerprint takes the same values unrounded (cellH): a cell is scattered again only
    // where what it reads changed (scatter), so it's what scattering every cell would give.
    let key = 2166136261 ^ month, h = 0;
    const mix = n => { key = Math.imul(key ^ n, 16777619) >>> 0; h = Math.imul(h ^ n, 16777619) >>> 0; };
    const mixH = n => { h = Math.imul(h ^ n, 16777619) >>> 0; };
    const mixR = (v, k) => { key = Math.imul(key ^ Math.round(v * 16), 16777619) >>> 0; F64[0] = v; mixH(U32[0]); mixH(U32[1]); };
    const cells = this.cells || [];
    if (!this.cellH || this.cellH.length < cells.length) this.cellH = new Uint32Array(cells.length + 256);
    const H = this.cellH, world = this.world, border = this.border;
    for (let c = 0; c < cells.length; c++) {
      const [x, z] = cells[c];
      h = 2166136261 ^ month;
      const inside = world.inb(x, z), i = inside ? world.idx(x, z) : border.bi(x, z);
      const source = inside ? world : border;
      if (i < 0) { H[c] = 0; continue; }
      mix(this.terrainAt(x, z)); mix(inside ? world.feature[i] : 0); mix(inside ? world.struct[i] : -1);
      mix(source.ground[i]); if (inside) mixR(world.groundG[i]); else mix(16);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, zz = z + dz, within = world.inb(xx, zz);
        const j = within ? world.idx(xx, zz) : border.bi(xx, zz), s = within ? world : border;
        if (j >= 0) {
          mix(s.tree[j]); mixR(s.treeG[j]); mix(this.terrainAt(xx, zz));
          mix(within ? world.feature[j] : 0); mix(within ? world.struct[j] : -1);
        }
      }
      H[c] = h;
    }
    if (key === this.key) return;
    this.key = key;
    this.details = this.scatter(month);
    this.clear();
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scale = new THREE.Vector3();
    const color = new THREE.Color(), direction = new THREE.Vector3(), axis = new THREE.Vector3(1, 0, 0);
    for (const [k, list] of [this.details.stones, this.details.grasses, this.details.wood].entries()) {
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(this.geometries[k], this.materials[k], list.length);
      mesh.castShadow = k !== 1; mesh.receiveShadow = true;
      // Put alternating samples first so reducing count keeps detail along the whole shoreline.
      const order = list.filter((_, j) => j % 2 === 0).concat(list.filter((_, j) => j % 2 === 1));
      for (const [j, p] of order.entries()) {
        pos.set(p.x, p.y, p.z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.angle);
        if (k === 0) {
          scale.set(p.size * 1.3, p.size * .55, p.size);
          const t = p.tone * (p.wet ? .76 : 1);
          color.setRGB(t, t * .96, t * .88, THREE.SRGBColorSpace);
        } else if (k === 1) { scale.setScalar(p.size); color.setRGB(...p.color, THREE.SRGBColorSpace); }
        else {
          scale.set(p.length, 1, 1);
          direction.set(Math.cos(p.angle), p.slope / p.length, Math.sin(p.angle)).normalize();
          q.setFromUnitVectors(axis, direction); color.set('#8e795d');
        }
        matrix.compose(pos, q, scale); mesh.setMatrixAt(j, matrix); mesh.setColorAt(j, color);
      }
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere(); this.scene.add(mesh); this.meshes.push(mesh);
    }
    this.setFast(this.fast);
  }
  setFast(on) {
    this.version++;
    this.fast = on;
    // Halve gravel and grass on phones; preserve the sparse driftwood.
    for (const mesh of this.meshes) mesh.count = on && mesh.geometry !== this.geometries[2]
      ? Math.ceil(mesh.instanceMatrix.count / 2) : mesh.instanceMatrix.count;
  }
  clear() {
    for (const mesh of this.meshes) { this.scene.remove(mesh); mesh.dispose(); }
    this.meshes.length = 0;
  }
  dispose() {
    this.clear();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
