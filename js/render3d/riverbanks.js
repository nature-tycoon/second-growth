// Small visual shoreline details. They never create ecological plants or habitat features.
import * as THREE from 'three';
import { T, LEVEL } from '../config.js';
import { hash2, valueNoise } from '../rng.js';
import { PLANTS, plantPhase } from '../data/plants.js';
import { prep, merge, tuft } from './geometry.js';
import { withClouds } from './atmosphere.js';
import { withSnowTops } from './snow.js';
import { biome } from '../biome.js';
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
  const groundAt = (x, z) => surfaceHeight((xx, zz) => world.vert(xx, zz) * LEVEL, x, z);
  for (const [x, z] of cells) {
    if (!bankAllowed(world, border, terrainAt, x, z)) continue;
    // a marsh is a sheet of sedge and mud, not a gravel bar: no stones or driftwood in it or on its edge
    const marshy = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => terrainAt(x + dx, z + dz) === T.MARSH);
    const i = world.inb(x, z) ? world.idx(x, z) : -1, bi = i < 0 ? border.bi(x, z) : -1;
    const source = i < 0 ? border : world, index = i < 0 ? bi : i;
    const gp = index >= 0 && PLANTS[source.ground[index]];
    const wetPlant = gp && ['sedge', 'tule', 'cattail', 'papyrus'].includes(gp.look.type);
    const phase = gp ? plantPhase(gp, month) : '';
    const grassColor = gp && paletteLeafColor(gp, phase, biome.id);
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
    if (marshy || hash2(x, z, 503) > .045) continue;
    let wooded = false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, zz = z + dz, inside = world.inb(xx, zz);
      const j = inside ? world.idx(xx, zz) : border.bi(xx, zz), s = inside ? world : border;
      if (j >= 0 && s.tree[j] && (s.treeG[j] || (inside ? 0 : .9)) > .55) wooded = true;
    }
    if (!wooded) continue;
    const px = x + .5, pz = z + .5, water = waterAt(px, pz), ground = groundAt(px, pz);
    if (!Number.isFinite(water) || ground - water < -.015 || ground - water > .14) continue;
    const angle = hash2(x, z, 504) * Math.PI * 2, length = .35 + hash2(x, z, 505) * .38;
    const dx = Math.cos(angle) * length / 2, dz = Math.sin(angle) * length / 2;
    const ends = [[px - dx, pz - dz], [px + dx, pz + dz]];
    if (ends.some(([xx, zz]) => !bankAllowed(world, border, terrainAt, Math.floor(xx), Math.floor(zz))
      || !Number.isFinite(waterAt(xx, zz)) || groundAt(xx, zz) - waterAt(xx, zz) < -.03)) continue;
    const slope = groundAt(...ends[1]) - groundAt(...ends[0]);
    if (Math.abs(slope) > .12) continue;
    out.wood.push({ x: px, y: (groundAt(...ends[0]) + groundAt(...ends[1])) / 2 + .02,
      z: pz, angle, length, slope });
  }
  return out;
}

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
    this.scene = scene; this.meshes = []; this.key = null;
    this.geometries = [prep(new THREE.IcosahedronGeometry(1, 0)), tuft('sedge', 379, true), driftwoodGeometry()];
    this.materials = this.geometries.map((_, k) => withClouds(withSnowTops(
      new THREE.MeshLambertMaterial({ vertexColors: true, side: k === 1 ? THREE.DoubleSide : THREE.FrontSide }), k === 1 ? 1.2 : .8)));
  }
  bind(world, border, cells, waterAt, terrainAt, underwater) {
    this.world = world; this.border = border; this.cells = cells;
    this.waterAt = waterAt; this.terrainAt = terrainAt; this.underwater = underwater;
    this.key = null; this.refresh();
  }
  refresh(month = this.month ?? 2) {
    this.month = month;
    // Only the bank tiles' planting and feature changes require re-scattering.
    let key = 2166136261 ^ month;
    for (const [x, z] of this.cells || []) {
      const inside = this.world.inb(x, z), i = inside ? this.world.idx(x, z) : this.border.bi(x, z);
      const source = inside ? this.world : this.border;
      if (i < 0) continue;
      for (const n of [this.terrainAt(x, z), inside ? this.world.feature[i] : 0,
        inside ? this.world.struct[i] : -1, source.ground[i], inside ? Math.round(this.world.groundG[i] * 16) : 16]) {
        key = Math.imul(key ^ n, 16777619) >>> 0;
      }
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, zz = z + dz, within = this.world.inb(xx, zz);
        const j = within ? this.world.idx(xx, zz) : this.border.bi(xx, zz), s = within ? this.world : this.border;
        if (j >= 0) {
          for (const n of [s.tree[j], Math.round(s.treeG[j] * 16), this.terrainAt(xx, zz),
            within ? this.world.feature[j] : 0, within ? this.world.struct[j] : -1]) key = Math.imul(key ^ n, 16777619) >>> 0;
        }
      }
    }
    if (key === this.key) return;
    this.key = key;
    this.details = bankDetails(this.world, this.border, this.cells, this.waterAt, this.terrainAt, this.underwater, month);
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
