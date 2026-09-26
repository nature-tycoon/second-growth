// Instanced plants and small features, rebuilt from the world arrays as things grow.

import * as THREE from 'three';
import { T, F, LEVEL, isWater, clamp } from '../config.js';
import { PLANTS, plantPhase } from '../data/plants.js';
import { hash2 } from '../rng.js';
import * as G from './geometry.js';

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

// Colors below are written in sRGB; three.js works in linear light.
const lin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

// A growable InstancedMesh.
class Pool {
  constructor(scene, geo, mat, { shadow = true, receive = false } = {}) {
    this.scene = scene; this.geo = geo; this.mat = mat; this.shadow = shadow; this.receive = receive;
    this.cap = 0; this.mesh = null; this.n = 0;
    this.m = []; this.c = [];
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
  end() {
    if (this.n > this.cap) {
      if (this.mesh) { this.scene.remove(this.mesh); this.mesh.dispose(); }
      this.cap = Math.max(16, Math.ceil(this.n * 1.5));
      this.mesh = new THREE.InstancedMesh(this.geo, this.mat, this.cap);
      this.mesh.castShadow = this.shadow; this.mesh.receiveShadow = this.receive;
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
      this.mesh.frustumCulled = false;
      this.scene.add(this.mesh);
    }
    if (!this.mesh) return;
    const ma = this.mesh.instanceMatrix.array, ca = this.mesh.instanceColor.array;
    for (let k = 0; k < this.n; k++) { ma.set(this.m[k], k * 16); ca[k * 3] = this.c[k][0]; ca[k * 3 + 1] = this.c[k][1]; ca[k * 3 + 2] = this.c[k][2]; }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() { if (this.mesh) { this.scene.remove(this.mesh); this.mesh.dispose(); } }
}

const rgb = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const vary = (c, x, y, salt, amt = 0.08) => { const f = 1 + (hash2(x, y, salt) - 0.5) * amt * 2; return [c[0] * f, c[1] * f, c[2] * f]; };

function leafColor(p, phase) {
  const lk = p.look;
  let c = rgb(lk.leaf);
  if (phase === 'spring') c = mixc(c, [0.72, 0.86, 0.45], 0.4);
  else if (phase === 'late') c = mixc(c, lk.dry ? rgb(lk.dry) : [0.45, 0.5, 0.25], lk.dry ? 0.35 : 0.12);
  else if (phase === 'fall') c = lk.fall ? (p.layer === 0 ? mixc(rgb(lk.fall), [0.55, 0.45, 0.3], 0.5) : rgb(lk.fall)) : lk.dry ? mixc(c, rgb(lk.dry), 0.7) : mixc(c, [0.6, 0.54, 0.28], 0.4);
  else if (phase === 'winter') c = lk.dry ? mixc(rgb(lk.dry), [0.55, 0.48, 0.35], 0.3) : mixc(c, [0.42, 0.42, 0.3], p.layer === 0 && lk.type !== 'fern' && lk.type !== 'sedge' ? 0.5 : 0.12);
  return c;
}

const STEM = { dogwood: '#b0302a', willow: '#c8923a' };

export class Flora {
  constructor(scene) {
    this.scene = scene;
    this.foliage = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.bark = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.small = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.pools = new Map();
    this.geos = new Map();
  }

  geo(key, build) {
    let g = this.geos.get(key);
    if (!g) { g = build(); this.geos.set(key, g); }
    return g;
  }
  pool(key, build, mat, opts) {
    let p = this.pools.get(key);
    if (!p) { p = new Pool(this.scene, this.geo(key, build), mat, opts); this.pools.set(key, p); }
    return p;
  }

  setFade(on) {
    for (const m of [this.foliage, this.bark]) { m.transparent = on; m.opacity = on ? 0.28 : 1; m.depthWrite = !on; m.needsUpdate = true; }
  }

  // ------------------------------------------------------------ rebuild everything from the world
  rebuild(game) {
    const w = game.world, B = game.border, month = game.month;
    for (const p of this.pools.values()) p.begin();
    const dots = this.pool('dot', () => G.blob(0xffffff), this.small, { shadow: false });
    const x0 = -10, y0 = -10, x1 = w.w + 10, y1 = w.h + 10;
    const hAt = (x, y) => w.heightAt(x, y) * LEVEL;

    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const inside = w.inb(x, y);
      const i = inside ? w.idx(x, y) : -1;
      const bi = inside ? -1 : B.bi(x, y);
      if (!inside && bi < 0) continue;
      const v = (inside ? w.variant[i] : (x * 7 + y * 13)) & 1;
      const tid = inside ? w.tree[i] : B.tree[bi];
      const sid = inside ? w.shrub[i] : B.shrub[bi];
      const gid = inside ? w.ground[i] : B.ground[bi];
      const dim = inside ? 1 : 0.82;

      // ---- groundcover tufts
      if (gid) {
        const p = PLANTS[gid];
        const g = inside ? w.groundG[i] : 1;
        const type = p.look.type;
        const n = g < 0.3 ? 1 : g < 0.65 ? 2 : (type === 'fern' || type === 'skunk' || type === 'tallforb' ? 2 : 4);
        const phase = plantPhase(p, month);
        const col = leafColor(p, phase);
        const pool = this.pool(`tuft:${type}:${v}`, () => G.tuft(type, 100 + v * 17 + type.length), this.small, { shadow: false });
        for (let k = 0; k < n; k++) {
          const px = x + 0.18 + hash2(x, y, 20 + k) * 0.64, pz = y + 0.18 + hash2(x, y, 40 + k) * 0.64;
          const sc = (0.55 + 0.45 * g) * (0.8 + hash2(x, y, 60 + k) * 0.4);
          const py = hAt(px, pz);
          pool.add(px, py, pz, sc, sc, sc, hash2(x, y, 80 + k) * 6.28, vary(col.map(c => c * dim), x, y, k));
          // flowers, seed heads and spathes
          if (phase === 'bloom' && p.look.flower) {
            const fc = rgb(p.look.flower);
            if (type === 'tallforb') for (let f = 0; f < 3; f++) dots.add(px, py + (0.22 + f * 0.04) * sc, pz, 0.8, 1.3, 0.8, 0, fc);
            else if (type === 'skunk') dots.add(px, py + 0.12, pz, 1.6, 2.6, 1.6, 0, fc);
            else for (let f = 0; f < 3; f++) dots.add(px + (hash2(x, y, 90 + k * 3 + f) - 0.5) * 0.12, py + 0.14 * sc + f * 0.02, pz + (hash2(x, y, 95 + k * 3 + f) - 0.5) * 0.12, 0.9, 0.9, 0.9, 0, fc);
          }
          if (type === 'cattail' && phase !== 'spring' && k % 2 === 0) dots.add(px, py + 0.5 * sc, pz, 0.9, 2.8, 0.9, 0, rgb(p.look.head));
        }
      }

      // ---- shrubs
      if (sid) {
        const p = PLANTS[sid];
        const g = inside ? w.shrubG[i] : 1;
        const phase = plantPhase(p, month);
        const sx = x + 0.5 + (hash2(x, y, 3) - 0.5) * 0.25, sz = y + 0.5 + (hash2(x, y, 4) - 0.5) * 0.25;
        const sy = hAt(sx, sz);
        const sc = (0.35 + 0.65 * g) * (p.look.small ? 0.8 : 1) * (0.9 + hash2(x, y, 6) * 0.2);
        const rot = hash2(x, y, 7) * 6.28;
        if (p.look.deciduous && phase === 'winter') {
          const stem = rgb(STEM[p.key] || '#7a6a52');
          this.pool(`twig:${v}`, () => G.twigs(300 + v), this.bark).add(sx, sy, sz, sc, sc * (p.key === 'willow' ? 1.6 : 1), sc, rot, stem.map(c => c * dim));
        } else {
          const type = p.look.type;
          const shape = ['bramble', 'willow', 'broom', 'salal', 'holly', 'vinemaple'].includes(type) ? type : 'shrub';
          const col = vary(leafColor(p, phase).map(c => c * dim), x, y, 8);
          this.pool(`shrub:${shape}:${v}`, () => G.shrub(shape, 200 + v * 31 + shape.length), this.foliage).add(sx, sy, sz, sc, sc, sc, rot, col);
          const dotCol = phase === 'bloom' && p.look.flower ? rgb(p.look.flower) : phase === 'fruit' && p.look.berry ? rgb(p.look.berry) : null;
          if (dotCol && g > 0.3) {
            const n = 4 + Math.round(g * 5);
            const R = (shape === 'bramble' ? 0.38 : 0.25) * sc, Hh = (shape === 'willow' ? 0.7 : 0.38) * sc;
            for (let k = 0; k < n; k++) {
              const a = hash2(x, y, 110 + k) * 6.28, d = 0.5 + hash2(x, y, 130 + k) * 0.5;
              dots.add(sx + Math.cos(a) * R * d, sy + Hh * (0.45 + hash2(x, y, 150 + k) * 0.55), sz + Math.sin(a) * R * d, 1, 1, 1, 0, dotCol);
            }
          }
        }
      }

      // ---- trees
      if (tid) {
        const p = PLANTS[tid];
        const g = inside ? w.treeG[i] : (B.treeG[bi] || 0.9);
        const shapeDef = G.TREE_SHAPES[p.look.type];
        const phase = p.conifer ? 'green' : plantPhase(p, month);
        const tx = x + 0.5 + (hash2(x, y, 3) - 0.5) * 0.3, tz = y + 0.5 + (hash2(x, y, 4) - 0.5) * 0.3;
        const ty = hAt(tx, tz) - 0.02;
        const sc = (0.22 + 0.78 * g) * (0.88 + hash2(x, y, 9) * 0.24);
        const rot = hash2(x, y, 10) * 6.28;
        const bark = rgb(p.look.bark).map(c => c * dim);
        const key = `${p.look.type}:${v}`;
        const build = () => shapeDef.kind === 'conifer' ? G.conifer(shapeDef, 500 + v * 13 + p.id) : G.broadleaf(shapeDef, 500 + v * 13 + p.id);
        if (!p.conifer && phase === 'winter') {
          this.pool(`bare:${key}`, () => G.bareTree(shapeDef, 700 + v), this.bark).add(tx, ty, tz, sc, sc, sc, rot, bark);
        } else {
          let shape = this.geos.get(`treeparts:${key}`);
          if (!shape) { shape = build(); this.geos.set(`treeparts:${key}`, shape); }
          if (!this.pools.has(`crown:${key}`)) {
            this.pools.set(`crown:${key}`, new Pool(this.scene, shape.crown, this.foliage));
            this.pools.set(`trunk:${key}`, new Pool(this.scene, shape.trunk, this.bark));
            this.pools.get(`crown:${key}`).begin(); this.pools.get(`trunk:${key}`).begin();
          }
          let leaf = leafColor(p, phase);
          if (phase === 'fall') leaf = mixc(leaf, rgb(p.look.leaf), hash2(x, y, 11) * 0.35);
          this.pools.get(`crown:${key}`).add(tx, ty, tz, sc, sc, sc, rot, vary(leaf.map(c => c * dim), x, y, 12, 0.1));
          this.pools.get(`trunk:${key}`).add(tx, ty, tz, sc, sc, sc, rot, bark);
        }
      }

      if (!inside) continue;

      // ---- features
      const f = w.feature[i];
      if (!f) continue;
      const cx = x + 0.5, cz = y + 0.5, cy = hAt(cx, cz);
      const rot = hash2(x, y, 13) * 6.28;
      switch (f) {
        case F.SNAG: this.pool(`snag:${v}`, () => G.snag(900 + v), this.bark).add(cx, cy - 0.02, cz, 1, 1, 1, rot, [0.62, 0.58, 0.52]); break;
        case F.LOG: this.pool('log', () => G.log(), this.bark).add(cx, isWater(w.terrain[i]) ? w.tileH(x, y) * LEVEL + 0.02 : cy, cz, 1, 1, 1, rot, [1, 1, 1]); break;
        case F.ROCKS: this.pool(`rocks:${v}`, () => G.rocks(950 + v), this.small).add(cx, cy, cz, 1, 1, 1, rot, [1, 1, 1]); break;
        case F.BRUSH: this.pool('brush', () => G.brushPile(970), this.bark).add(cx, cy, cz, 1, 1, 1, rot, [1, 1, 1]); break;
        case F.NESTBOX: this.pool('nestbox', () => G.nestbox(), this.bark).add(cx, cy, cz, 1, 1, 1, rot, [1, 1, 1]); break;
        case F.BLIND: this.pool('blind', () => G.blind(), this.bark).add(cx, cy, cz, 1, 1, 1, Math.round(rot / 1.57) * 1.57, [1, 1, 1]); break;
        case F.BOARDWALK: {
          const surf = w.tileH(x, y) * LEVEL + 0.05;
          const ns = (xx, yy) => w.inb(xx, yy) && (w.feature[w.idx(xx, yy)] === F.BOARDWALK || w.terrain[w.idx(xx, yy)] === T.TRAIL);
          const alongX = ns(x - 1, y) || ns(x + 1, y);
          this.pool('boardwalk', () => G.boardwalk(), this.bark, { shadow: true, receive: true }).add(cx, surf, cz, 1, 1, 1, alongX ? Math.PI / 2 : 0, [1, 1, 1]);
          break;
        }
        case F.FENCE: {
          this.pool('fencepost', () => G.fencePost(), this.bark).add(cx, cy, cz, 1, 1, 1, rot * 0.1, [1, 1, 1]);
          const rail = this.pool('fencerail', () => G.fenceRail(), this.bark);
          const broken = hash2(x, y, 55) < 0.15;
          if (x + 1 < w.w && w.feature[w.idx(x + 1, y)] === F.FENCE) {
            const dh = hAt(cx + 1, cz) - cy;
            rail.add(cx, cy, cz, Math.hypot(1, dh), broken ? 0.6 : 1, 1, 0, [1, 1, 1], 0, Math.atan2(dh, 1));
          }
          if (y + 1 < w.h && w.feature[w.idx(x, y + 1)] === F.FENCE) {
            const dh = hAt(cx, cz + 1) - cy;
            rail.add(cx, cy, cz, Math.hypot(1, dh), 1, 1, -Math.PI / 2, [0.92, 0.92, 0.92], 0, Math.atan2(dh, 1));
          }
          break;
        }
        case F.DAM: case F.CULVERT: {
          const wet = (xx, yy) => w.inb(xx, yy) && isWater(w.terrain[w.idx(xx, yy)]);
          const vertical = wet(x, y - 1) || wet(x, y + 1);
          const surf = Math.max(...w.corners(x, y)) * LEVEL;
          if (f === F.DAM) this.pool('dam', () => G.dam(980), this.bark).add(cx, w.tileH(x, y) * LEVEL + 0.03, cz, 1, 1, 1, vertical ? 0 : Math.PI / 2, [1, 1, 1]);
          else this.pool('culvert', () => G.culvert(), this.small).add(cx, surf, cz, 1, 1, 1, vertical ? 0 : Math.PI / 2, [1, 1, 1]);
          break;
        }
      }
    }
    for (const p of this.pools.values()) p.end();
  }
}
