// Instanced plants and small features, rebuilt from the world arrays as things grow.

import * as THREE from 'three';
import { T, F, LEVEL, BORDER, isWater, clamp } from '../config.js';
import { PLANTS, plantPhase } from '../data/plants.js';
import { hash2 } from '../rng.js';
import * as G from './geometry.js';
import { withFocusFade } from './focus.js';
import { withSnowTops } from './snow.js';
import { withClouds } from './atmosphere.js';
import { waterSurfaceY } from './terrain.js';
import { biome } from '../biome.js';

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

// Colors below are written in sRGB; three.js works in linear light.
const lin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

// A growable InstancedMesh.
class Pool {
  constructor(scene, geo, mat, { shadow = true, receive = false, geoLo = null, kind = 'plant' } = {}) {
    this.scene = scene; this.geo = geo; this.geoLo = geoLo || geo; this.mat = mat; this.shadow = shadow; this.receive = receive;
    this.kind = kind; this.lod = 0;
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
      this.mesh = new THREE.InstancedMesh(this.lod ? this.geoLo : this.geo, this.mat, this.cap);
      this.mesh.castShadow = this.shadow; this.mesh.receiveShadow = this.receive;
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
      this.scene.add(this.mesh);
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
  }
  dispose() { if (this.mesh) { this.scene.remove(this.mesh); this.mesh.dispose(); } }
  setView(lod, grass, shrubShadow, grassLod = lod) {
    if (this.kind === 'grass') lod = grassLod;
    this.lod = lod;
    if (!this.mesh) return;
    this.mesh.geometry = lod ? this.geoLo : this.geo;
    if (this.kind === 'grass') this.mesh.visible = grass && this.n > 0;
    if (this.kind === 'shrub') this.mesh.castShadow = shrubShadow;
  }
}

// Splits instances into map chunks so off-screen plants aren't drawn.
const CHUNK = 48;
class ChunkedPool {
  constructor(make) { this.make = make; this.subs = new Map(); this.view = [0, true, true, 0]; }
  setView(...v) { this.view = v; for (const p of this.subs.values()) p.setView(...v); }
  begin() { for (const p of this.subs.values()) p.begin(); }
  add(x, y, z, ...rest) {
    const k = Math.floor((x + BORDER) / CHUNK) * 64 + Math.floor((z + BORDER) / CHUNK);
    let p = this.subs.get(k);
    if (!p) { p = this.make(); p.lod = p.kind === 'grass' ? this.view[3] : this.view[0]; this.subs.set(k, p); }
    p.add(x, y, z, ...rest);
  }
  end() { for (const p of this.subs.values()) { p.end(); p.setView(...this.view); } }
}

// Foliage sways in the wind: displacement grows with height above each plant's base.
const gust = { value: 1 }; // how hard it's blowing (storms push everything further)
export const windGust = gust;
function windy(mat, amount, wind, bothSidesLit = false) {
  mat.onBeforeCompile = shader => {
    // thin blades: light both faces as if they faced the sky, instead of darkening the back
    if (bothSidesLit) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
    shader.uniforms.uTime = wind;
    shader.uniforms.uWind = { value: amount };
    shader.uniforms.uGust = gust;
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\nuniform float uGust;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 wOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        vec3 wOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif
      float wPh = uTime * 1.1 + wOrigin.x * 0.35 + wOrigin.z * 0.27;
      float wS = (sin(wPh) * 0.6 + sin(wPh * 2.3 + wOrigin.x) * 0.25 + 0.2) * uGust
        + max(uGust - 1.0, 0.0) * 0.2 * sin(uTime * 2.2 + wOrigin.x * 0.9) * sin(uTime * 0.5 + wOrigin.z * 0.5); // gusts rolling through
      float wH = max(transformed.y, 0.0);
      transformed.x += wS * wH * wH * uWind;
      transformed.z += wS * 0.5 * wH * wH * uWind;`);
  };
  mat.customProgramCacheKey = () => 'wind' + amount + (bothSidesLit ? 'b' : '');
  return mat;
}

const rgb = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const vary = (c, x, y, salt, amt = 0.08) => { const f = 1 + (hash2(x, y, salt) - 0.5) * amt * 2; return [c[0] * f, c[1] * f, c[2] * f]; };

export function leafColor(p, phase) {
  const lk = p.look;
  // trees like the pink ipê turn their whole crown to flower
  if (phase === 'bloom' && lk.crownBloom) return rgb(lk.flower);
  // ...others are dusted with blossom (umbrella thorns cream, sausage trees wine-red)
  if (phase === 'bloom' && lk.bloomTint) return mixc(rgb(lk.leaf), rgb(lk.flower), lk.bloomTint);
  let c = rgb(lk.leaf);
  if (phase === 'spring') c = mixc(c, [0.72, 0.86, 0.45], 0.4);
  else if (phase === 'late') c = mixc(c, lk.dry ? rgb(lk.dry) : [0.45, 0.5, 0.25], lk.dry ? 0.35 : 0.12);
  else if (phase === 'fall') c = lk.fall ? (p.layer === 0 ? mixc(rgb(lk.fall), [0.55, 0.45, 0.3], 0.5) : rgb(lk.fall)) : lk.dry ? mixc(c, rgb(lk.dry), 0.7) : mixc(c, [0.6, 0.54, 0.28], 0.4);
  else if (phase === 'winter') c = lk.dry ? mixc(rgb(lk.dry), [0.55, 0.48, 0.35], 0.3) : mixc(c, [0.42, 0.42, 0.3], p.layer === 0 && lk.type !== 'fern' && lk.type !== 'sedge' ? 0.5 : 0.12);
  return c;
}

const STEM = { dogwood: '#b0302a', willow: '#c8923a' };
// shrub looks with a geometry of their own; everything else is a generic leafy mound
export const SHRUB_SHAPES = ['bramble', 'willow', 'broom', 'salal', 'holly', 'vinemaple', 'heliconia', 'bamboo', 'aloe', 'cactus'];

export class Flora {
  constructor(scene) {
    this.scene = scene;
    this.wind = { value: 0 };
    // everything that can hide an animal dissolves around the selected one (see focus.js)
    // ...and everything catches snow on top in winter (see snow.js)
    this.foliage = withClouds(withSnowTops(withFocusFade(windy(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.012, this.wind)), 0.95));
    this.shrubs = withClouds(withSnowTops(withFocusFade(windy(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.12, this.wind)), 0.85));
    this.grass = withClouds(withSnowTops(withFocusFade(windy(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 1.4, this.wind, true)), 1.3));
    this.bark = withClouds(withSnowTops(withFocusFade(new THREE.MeshLambertMaterial({ vertexColors: true })), 1));
    this.small = withClouds(withSnowTops(withFocusFade(new THREE.MeshLambertMaterial({ vertexColors: true })), 1));
    this.pools = new Map();
    this.geos = new Map();
    this.view = [0, true, true, 0];
  }

  geo(key, build) {
    let g = this.geos.get(key);
    if (!g) { g = build(); this.geos.set(key, g); }
    return g;
  }
  pool(key, build, mat, opts = {}, buildLo = null) {
    let p = this.pools.get(key);
    if (!p) {
      const geo = this.geo(key, build);
      const geoLo = buildLo ? this.geo(key + ':lo', buildLo) : geo;
      p = new ChunkedPool(() => new Pool(this.scene, geo, mat, { ...opts, geoLo }));
      p.setView(...this.view);
      this.pools.set(key, p);
    }
    return p;
  }

  // Simpler models when zoomed out; grass blades vanish once they'd be too small to see.
  // [lod for trees and shrubs, grass visible, shrub shadows, lod for grass]
  // Grass is by far the most instances, so it switches to its light version well before close-up.
  setZoom(zoom) {
    const v = [zoom < 0.5 ? 1 : 0, zoom > 0.34, zoom > 0.7, zoom < 1.1 ? 1 : 0];
    if (this.view && v.every((x, k) => x === this.view[k])) return;
    this.view = v;
    for (const p of this.pools.values()) p.setView(...v);
  }

  setFade(on) {
    for (const m of [this.foliage, this.shrubs, this.bark]) { m.transparent = on; m.opacity = on ? 0.28 : 1; m.depthWrite = !on; m.needsUpdate = true; }
  }

  // ------------------------------------------------------------ rebuild everything from the world
  rebuild(game) {
    const w = game.world, B = game.border, month = game.month;
    for (const p of this.pools.values()) p.begin();
    const dots = this.pool('dot', () => G.blob(0xffffff), this.small, { shadow: false });
    const x0 = -BORDER, y0 = -BORDER, x1 = w.w + BORDER, y1 = w.h + BORDER;
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
        const grassy = type === 'grass' || type === 'tallgrass' || type === 'sedge';
        // (lush: on maps whose wildflower gardens are the payoff, a mature bed is drawn thick and full)
        const lush = biome.look.lush && (type === 'forb' || type === 'tallforb') && g >= 0.3;
        const n = lush ? (g < 0.65 ? 6 : type === 'tallforb' ? 7 : 10) : g < 0.3 ? 2 : g < 0.65 ? (grassy ? 4 : 3) : (type === 'fern' || type === 'skunk' || type === 'tallforb' ? 3 : grassy ? 7 : 5); // a healthy sward fills its tile
        const phase = plantPhase(p, month);
        const col = leafColor(p, phase);
        const pool = this.pool(`tuft:${type}:${v}`, () => G.tuft(type, 100 + v * 17 + type.length), this.grass, { shadow: false, kind: 'grass' },
          () => G.tuft(type, 100 + v * 17 + type.length, true));
        for (let k = 0; k < n; k++) {
          const px = x + 0.08 + hash2(x, y, 20 + k) * 0.84, pz = y + 0.08 + hash2(x, y, 40 + k) * 0.84;
          const sc = (0.5 + 0.45 * g) * (0.7 + hash2(x, y, 60 + k) * 0.5) * (lush ? 1.12 : 1);
          // lily pads float on the water surface instead of sitting on the pond bed
          const py = type === 'lily' && inside && isWater(w.terrain[i]) ? (waterSurfaceY(w, px, pz) ?? hAt(px, pz)) + 0.01 : hAt(px, pz);
          pool.add(px, py, pz, sc, sc, sc, hash2(x, y, 80 + k) * 6.28, vary(col.map(c => c * dim), x, y, k));
          // flowers, seed heads and spathes
          if (phase === 'bloom' && p.look.flower) {
            const fc = rgb(p.look.flower);
            if (type === 'tallforb') for (let f = 0; f < 3; f++) dots.add(px, py + (0.22 + f * 0.04) * sc, pz, 0.8, 1.3, 0.8, 0, fc);
            else if (type === 'skunk') dots.add(px, py + 0.12, pz, 1.6, 2.6, 1.6, 0, fc);
            else for (let f = 0; f < (lush ? 4 : 3); f++) { const ds = lush ? 1.15 : 0.9; dots.add(px + (hash2(x, y, 90 + k * 3 + f) - 0.5) * 0.14, py + 0.14 * sc + f * 0.02, pz + (hash2(x, y, 95 + k * 3 + f) - 0.5) * 0.14, ds, ds, ds, 0, fc); }
          }
          // (lush: the gardens are left standing through fall and winter: dark cones and pale plumes, silvered by frost)
          if (lush && (phase === 'fall' || phase === 'winter') && p.look.flower && k % 2 === 0) {
            const plume = p.look.seed === 'plume', frost = phase === 'winter' ? 0.45 : 0;
            const sc0 = plume ? [0.86, 0.82, 0.7] : [0.24, 0.17, 0.12];
            const c = [sc0[0] + (0.9 - sc0[0]) * frost, sc0[1] + (0.92 - sc0[1]) * frost, sc0[2] + (0.95 - sc0[2]) * frost];
            if (plume) dots.add(px, py + 0.2 * sc, pz, 1.1, 2.2, 1.1, 0, c);
            else dots.add(px, py + 0.16 * sc, pz, 1.2, 1.2, 1.2, 0, c);
          }
          if (type === 'cattail' && phase !== 'spring' && k % 2 === 0) dots.add(px, py + 0.5 * sc, pz, 0.9, 2.8, 0.9, 0, rgb(p.look.head));
        }
      }

      // ---- shrubs
      if (sid) {
        const p = PLANTS[sid];
        const g = inside ? w.shrubG[i] : 1;
        const phase = plantPhase(p, month);
        const sx = x + 0.5 + (hash2(x, y, 3) - 0.5) * 0.4, sz = y + 0.5 + (hash2(x, y, 4) - 0.5) * 0.4;
        const sy = hAt(sx, sz);
        const sc = (0.32 + 0.6 * g) * (p.look.small ? 0.8 : 1) * (0.8 + hash2(x, y, 6) * 0.35);
        const rot = hash2(x, y, 7) * 6.28;
        if (p.look.deciduous && phase === 'winter') {
          const stem = rgb(STEM[p.key] || '#7a6a52');
          this.pool(`twig:${v}`, () => G.twigs(300 + v), this.bark).add(sx, sy, sz, sc, sc * (p.key === 'willow' ? 1.6 : 1), sc, rot, stem.map(c => c * dim));
        } else {
          const type = p.look.type;
          const shape = SHRUB_SHAPES.includes(type) ? type : 'shrub';
          const col = vary(leafColor(p, phase).map(c => c * dim), x, y, 8);
          this.pool(`shrub:${shape}:${v}`, () => G.shrub(shape, 200 + v * 31 + shape.length), this.shrubs, { kind: 'shrub' }, () => G.shrub(shape, 200 + v * 31 + shape.length, 1)).add(sx, sy, sz, sc, sc, sc, rot, col);
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
        const tx = x + 0.5 + (hash2(x, y, 3) - 0.5) * 0.45, tz = y + 0.5 + (hash2(x, y, 4) - 0.5) * 0.45;
        const ty = hAt(tx, tz) - 0.02;
        const sc = (0.2 + 0.8 * g) * (0.78 + hash2(x, y, 9) * 0.42);
        const rot = hash2(x, y, 10) * 6.28;
        const bark = rgb(p.look.bark).map(c => c * dim);
        const key = `${p.look.type}:${v}`;
        const build = (lod = 0) => G.treeParts(shapeDef, 500 + v * 13 + p.id, lod);
        if (!p.conifer && phase === 'winter') {
          this.pool(`bare:${key}`, () => G.bareTree(shapeDef, 700 + v), this.bark).add(tx, ty, tz, sc, sc, sc, rot, bark);
        } else {
          let shape = this.geos.get(`treeparts:${key}`);
          if (!shape) { shape = build(); shape.lo = build(1); this.geos.set(`treeparts:${key}`, shape); }
          if (!this.pools.has(`crown:${key}`)) {
            const crown = new ChunkedPool(() => new Pool(this.scene, shape.crown, this.foliage, { geoLo: shape.lo.crown }));
            const trunkP = new ChunkedPool(() => new Pool(this.scene, shape.trunk, this.bark, { geoLo: shape.lo.trunk }));
            crown.setView(...this.view); trunkP.setView(...this.view);
            this.pools.set(`crown:${key}`, crown); this.pools.set(`trunk:${key}`, trunkP);
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
        case F.STUMP: {
          const rot2 = Math.min(1, w.featureAge[i] / 360), s = 0.85 + hash2(x, y, 17) * 0.4;
          this.pool(`stump:${v}`, () => G.stump(990 + v), this.bark).add(cx, cy - 0.01, cz, s, s * (1 - 0.45 * rot2), s, rot, [1 - 0.35 * rot2, 1 - 0.38 * rot2, 1 - 0.4 * rot2]);
          break;
        }
        case F.ROCKS: this.pool(`rocks:${v}`, () => G.rocks(950 + v), this.small).add(cx, cy, cz, 1, 1, 1, rot, [1, 1, 1]); break;
        case F.BRUSH: this.pool('brush', () => G.brushPile(970), this.bark).add(cx, cy, cz, 1, 1, 1, rot, [1, 1, 1]); break;
        case F.NESTBOX: this.pool('nestbox', () => G.nestbox(), this.bark).add(cx, cy, cz, 1, 1, 1, rot, [1, 1, 1]); break;
        case F.BLIND: this.pool('blind', () => G.blind(), this.bark).add(cx, cy, cz, 1, 1, 1, Math.round(rot / 1.57) * 1.57, [1, 1, 1]); break;
        case F.BOARDWALK: {
          const surf = w.tileH(x, y) * LEVEL + 0.05;
          const ns = (xx, yy) => w.inb(xx, yy) && (w.feature[w.idx(xx, yy)] === F.BOARDWALK || w.terrain[w.idx(xx, yy)] === T.TRAIL || w.terrain[w.idx(xx, yy)] === T.ROAD); // (a street bridge runs with the street)
          const alongX = ns(x - 1, y) || ns(x + 1, y);
          this.pool('boardwalk', () => G.boardwalk(), this.bark, { shadow: true, receive: true }).add(cx, surf, cz, 1, 1, 1, alongX ? Math.PI / 2 : 0, [1, 1, 1]);
          break;
        }
        case F.FENCE: {
          const picket = !!biome.look.picket; // (the suburb's white picket fences)
          if (picket) this.pool('picketpost', () => G.picketPost(), this.bark).add(cx, cy, cz, 1, 1, 1, 0, [1, 1, 1]);
          else this.pool('fencepost', () => G.fencePost(), this.bark).add(cx, cy, cz, 1, 1, 1, rot * 0.1, [1, 1, 1]);
          const rail = picket ? this.pool('picketrail', () => G.picketRail(), this.bark) : this.pool('fencerail', () => G.fenceRail(), this.bark);
          const broken = !picket && hash2(x, y, 55) < 0.15;
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
