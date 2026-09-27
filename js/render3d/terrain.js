// The ground: a heightmap mesh textured with the tile art, a water surface, flood water,
// diorama edges around the whole valley, the property line, and tile overlays.

import * as THREE from 'three';
import { T, BORDER, LEVEL, isWater, clamp } from '../config.js';
import { PLANTS, plantPhase } from '../data/plants.js';
import { extTerrain } from '../world.js';
import * as S from '../render/sprites.js';
import { hash2 } from '../rng.js';

const ATLAS_TYPES = [T.PASTURE, T.FIELD, T.SOIL, T.GRAVEL, T.MUD, T.ROAD, T.DUFF, T.TRAIL, S.TURF, S.BED];
const CELL = 64, GUT = 4, SLOT = CELL + GUT * 2, COLS = 28;
const PASTURE_RGB = ['#a2b56a', '#abb26c', '#a9a46c', '#8c976a'];

const lin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Soft, tileable noise used to vary the ground's color across the valley.
function noiseTexture() {
  const N = 128, G = 8, c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
  const grid = [];
  for (let k = 0; k < G * G; k++) grid.push(hash2(k % G, Math.floor(k / G), 77));
  const at = (x, y) => grid[((y + G) % G) * G + ((x + G) % G)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / N * G, fy = y / N * G, x0 = Math.floor(fx), y0 = Math.floor(fy);
    let tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = at(x0, y0), b = at(x0 + 1, y0), cc = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    const v = (a + (b - a) * tx) * (1 - ty) + (cc + (d - cc) * tx) * ty;
    const o = (y * N + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(v * 255); img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Break up the tile grid: modulate the ground by large, soft world-space noise.
function groundDetail(mat, noise) {
  mat.onBeforeCompile = shader => {
    shader.uniforms.uNoise = { value: noise };
    shader.vertexShader = 'varying vec2 vWorldXZ;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = 'uniform sampler2D uNoise;\nvarying vec2 vWorldXZ;\n' + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float gn1 = texture2D(uNoise, vWorldXZ * 0.035).r;
      float gn2 = texture2D(uNoise, vWorldXZ * 0.16 + 0.37).r;
      diffuseColor.rgb *= 0.84 + 0.24 * gn1 + 0.12 * (gn2 - 0.5);`);
  };
  mat.customProgramCacheKey = () => 'ground';
  return mat;
}

// Gentle waves: the surface bobs and its normals ripple so highlights move.
function waves(mat, time, amp) {
  mat.onBeforeCompile = shader => {
    shader.uniforms.uTime = time;
    const wave = `
      float wa = uTime * 1.3 + position.x * 2.1 + position.z * 1.7;
      float wb = uTime * 0.9 - position.x * 1.3 + position.z * 2.6;
      float wc = uTime * 1.7 + position.x * 3.7 - position.z * 0.9;`;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader
      .replace('#include <beginnormal_vertex>', `${wave}
      float wdx = (cos(wa) * 2.1 * 0.012 - cos(wb) * 1.3 * 0.008 + cos(wc) * 3.7 * 0.004) * ${amp.toFixed(2)};
      float wdz = (cos(wa) * 1.7 * 0.012 + cos(wb) * 2.6 * 0.008 - cos(wc) * 0.9 * 0.004) * ${amp.toFixed(2)};
      vec3 objectNormal = normalize(vec3(-wdx * 6.0, 1.0, -wdz * 6.0));
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3(tangent.xyz);
      #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.y += (sin(wa) * 0.012 + sin(wb) * 0.008 + sin(wc) * 0.004) * ${amp.toFixed(2)};`);
  };
  mat.customProgramCacheKey = () => 'waves' + amp;
  return mat;
}

export function buildAtlas() {
  const W = 2048, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const uv = {};
  let k = 0;
  for (const t of ATLAS_TYPES) for (let season = 0; season < 4; season++) for (let v = 0; v < 4; v++) {
    const sx = (k % COLS) * SLOT, sy = Math.floor(k / COLS) * SLOT;
    const img = S.terrainSprite(t, season, v);
    ctx.drawImage(img, sx + GUT, sy + GUT);
    // copy edges into the gutter so mipmaps don't bleed between tiles
    ctx.drawImage(img, 0, 0, 1, CELL, sx, sy + GUT, GUT, CELL);
    ctx.drawImage(img, CELL - 1, 0, 1, CELL, sx + GUT + CELL, sy + GUT, GUT, CELL);
    ctx.drawImage(c, sx, sy + GUT, SLOT, 1, sx, sy, SLOT, GUT);
    ctx.drawImage(c, sx, sy + GUT + CELL - 1, SLOT, 1, sx, sy + GUT + CELL, SLOT, GUT);
    uv[`${t}|${season}|${v}`] = [(sx + GUT + 0.5) / W, 1 - (sy + GUT + 0.5) / H, (sx + GUT + CELL - 0.5) / W, 1 - (sy + GUT + CELL - 0.5) / H];
    k++;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, uv };
}

// Tint for groundcover: a meadow's color comes from what's growing in it.
function turfColor(p, month, season) {
  const phase = plantPhase(p, month);
  let base = mixRgb(hexRgb(PASTURE_RGB[season]), hexRgb(p.look.leaf), 0.55);
  if (p.look.type === 'tallgrass' || p.look.type === 'grass') {
    if (phase === 'late' || phase === 'fall') base = mixRgb(base, hexRgb(p.look.dry || '#c9b77e'), 0.45);
    if (phase === 'winter') base = mixRgb(base, [0.62, 0.58, 0.44], 0.4);
  }
  if (phase === 'spring') base = mixRgb(base, [0.72, 0.84, 0.48], 0.3);
  // pull every meadow toward one shared color so mixed stands don't look like a quilt
  base = mixRgb(base, hexRgb(PASTURE_RGB[season]), 0.25);
  // divide out the turf texture's own brightness
  return [base[0] / 0.86, base[1] / 0.88, base[2] / 0.8];
}

// How far water fills each kind of basin above its lowest corner, in height levels.
const FILL = { [T.POND]: 0.4, [T.CREEK]: 0.32, [T.RIVER]: 0.35, [T.MARSH]: 0.16 };

// Height of the water surface on a tile, in scene units (null on dry land).
export function waterSurfaceY(w, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  if (!w.inb(xi, yi)) return null;
  const t = w.terrain[w.idx(xi, yi)];
  if (!isWater(t)) return null;
  return (Math.min(...w.corners(xi, yi)) + FILL[t]) * LEVEL;
}

export class Terrain {
  constructor(scene, atlas) {
    this.scene = scene;
    this.atlas = atlas;
    this.time = { value: 0 };
    this.material = groundDetail(new THREE.MeshLambertMaterial({ map: atlas.tex, vertexColors: true }), noiseTexture());
    this.waterMat = waves(new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 1, shininess: 140, specular: 0xb4ccd8, depthWrite: false }), this.time, 1);
    this.floodMat = waves(new THREE.MeshPhongMaterial({ color: 0x8a9a86, transparent: true, opacity: 0.72, shininess: 60, specular: 0x556677, depthWrite: false }), this.time, 0.6);
    this.skirtMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.overlayMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.previewMat = this.overlayMat.clone();
  }

  // (Re)build everything for a world.
  setWorld(world, border) {
    this.world = world; this.border = border;
    this.X0 = -BORDER; this.Y0 = -BORDER;
    this.TW = world.w + BORDER * 2; this.TH = world.h + BORDER * 2;
    const n = this.TW * this.TH;
    for (const m of [this.mesh, this.water, this.flood, this.skirt, this.line, this.overlay, this.preview]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 18), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 18), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 18), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 12), 2));
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
    this.tint = new Float32Array(n * 3);
    this.water = null; this.flood = null; this.overlay = null; this.preview = null;
    this.updateHeights();
  }

  h(x, y) { return this.world.vert(x, y) * LEVEL; }

  terrainAt(x, y) {
    const w = this.world;
    if (w.inb(x, y)) return w.terrain[w.idx(x, y)];
    const bi = this.border.bi(x, y);
    return bi < 0 ? extTerrain(w, x, y) : this.border.terrain[bi];
  }

  updateHeights() {
    const w = this.world, g = this.mesh.geometry;
    const pos = g.attributes.position.array, nor = g.attributes.normal.array;
    const vn = (x, y) => {
      const dx = (this.h(x + 1, y) - this.h(x - 1, y)) / 2, dy = (this.h(x, y + 1) - this.h(x, y - 1)) / 2;
      const l = Math.hypot(dx, 1, dy);
      return [-dx / l, 1 / l, -dy / l];
    };
    let o = 0;
    for (let ty = 0; ty < this.TH; ty++) for (let tx = 0; tx < this.TW; tx++) {
      const x = tx + this.X0, y = ty + this.Y0;
      const A = [x, y], B = [x + 1, y], C = [x + 1, y + 1], D = [x, y + 1];
      for (const [vx, vy] of [A, C, B, A, D, C]) {
        pos[o] = vx; pos[o + 1] = this.h(vx, vy); pos[o + 2] = vy;
        const nn = vn(vx, vy);
        nor[o] = nn[0]; nor[o + 1] = nn[1]; nor[o + 2] = nn[2];
        o += 3;
      }
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.computeBoundingSphere();
    this.hv = w.hv;
    this.buildSkirt();
    this.buildLine();
    this.buildWater();
    if (this.overlay) { this.scene.remove(this.overlay); this.overlay.geometry.dispose(); this.overlay = null; }
  }

  // Textures and colors: what's on each tile this season.
  updateSurface(game) {
    const w = this.world, B = this.border, g = this.mesh.geometry;
    const uv = g.attributes.uv.array, col = g.attributes.color.array;
    const month = game.month, season = game.season;
    const tint = this.tint;
    const turfCache = new Map();
    for (let ty = 0; ty < this.TH; ty++) for (let tx = 0; tx < this.TW; tx++) {
      const x = tx + this.X0, y = ty + this.Y0, k = ty * this.TW + tx;
      const inside = w.inb(x, y);
      const i = inside ? w.idx(x, y) : -1;
      const bi = inside ? -1 : B.bi(x, y);
      const t = inside ? w.terrain[i] : (bi >= 0 ? B.terrain[bi] : extTerrain(w, x, y));
      const v = inside ? w.variant[i] : ((x * 7 + y * 13) & 3);
      let tex = t, c = [1, 1, 1];
      if (t === T.MARSH) { tex = S.TURF; c = [0.52, 0.58, 0.42]; }
      else if (isWater(t)) { tex = S.BED; c = [0.7, 0.66, 0.58]; }
      else {
        const canopy = inside ? w.canopy[i] : 0;
        const gid = inside ? w.ground[i] : (bi >= 0 ? B.ground[bi] : 0);
        const gg = inside ? w.groundG[i] : 1;
        // grassland of any kind shares one texture, tinted by what grows there
        const pasture = hexRgb(PASTURE_RGB[season]).map((v, q) => v / [0.86, 0.88, 0.8][q]);
        if (tex === T.PASTURE) { tex = S.TURF; c = pasture; }
        else if (tex === T.SOIL) { tex = S.TURF; c = [0.8, 0.66, 0.5]; }
        else if (tex === T.MUD) { tex = S.TURF; c = [0.62, 0.54, 0.42]; }
        if (gid && gg > 0.12 && t !== T.TRAIL) {
          const p = PLANTS[gid];
          if (p.look.type === 'fern' || p.look.type === 'skunk') tex = T.DUFF;
          else if (tex !== T.DUFF) {
            let tc = turfCache.get(gid);
            if (!tc) { tc = turfColor(p, month, season); turfCache.set(gid, tc); }
            const f = clamp((gg - 0.12) * 2, 0, 1);
            if (tex === S.TURF) c = mixRgb(pasture, tc, f);
            else if (gg > 0.35) { tex = S.TURF; c = mixRgb(pasture, tc, f); }
            else c = mixRgb([1, 1, 1], [0.85, 1, 0.8], f);
          }
        }
        // under a closing canopy the ground fades into shaded forest floor
        if (canopy > 0.3 && t !== T.ROAD && t !== T.GRAVEL && t !== T.TRAIL) {
          if (canopy > 0.6 && (tex === T.FIELD || tex === T.SOIL)) tex = S.TURF;
          c = mixRgb(c, [0.5, 0.45, 0.33], clamp((canopy - 0.3) * 1.2, 0, 0.7));
        }
        if (inside && w.scorch[i] > 0) { const f = clamp(w.scorch[i] / 160, 0, 1) * 0.7; c = mixRgb(c, [0.22, 0.2, 0.18], f); }
      }
      const b = 0.95 + hash2(x, y, 5) * 0.1;
      const dim = inside ? 1 : 0.8;
      tint[k * 3] = lin(c[0] * b * dim); tint[k * 3 + 1] = lin(c[1] * b * dim); tint[k * 3 + 2] = lin(c[2] * b * dim);
      // UVs, rotated per tile so repeats don't line up
      const r = this.atlas.uv[`${tex}|${season}|${v}`] || this.atlas.uv[`${T.PASTURE}|${season}|0`];
      const corners = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
      const rot = v & 3;
      const cA = corners[rot % 4], cB = corners[(rot + 1) % 4], cC = corners[(rot + 2) % 4], cD = corners[(rot + 3) % 4];
      const o = k * 12;
      const put = (j, q) => { uv[o + j * 2] = q[0]; uv[o + j * 2 + 1] = q[1]; };
      put(0, cA); put(1, cC); put(2, cB); put(3, cA); put(4, cD); put(5, cC);
    }
    // blend colors at shared corners so neighbouring tiles fade into each other
    const TW = this.TW, TH = this.TH;
    const corner = (cx, cy, out) => {
      let r = 0, gg = 0, bb = 0, n = 0;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const tx = cx + dx, ty = cy + dy;
        if (tx < 0 || ty < 0 || tx >= TW || ty >= TH) continue;
        const k = ty * TW + tx;
        r += tint[k * 3]; gg += tint[k * 3 + 1]; bb += tint[k * 3 + 2]; n++;
      }
      out[0] = r / n; out[1] = gg / n; out[2] = bb / n;
    };
    const cA = [0, 0, 0], cB = [0, 0, 0], cC = [0, 0, 0], cD = [0, 0, 0];
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      const k = ty * TW + tx;
      corner(tx, ty, cA); corner(tx + 1, ty, cB); corner(tx + 1, ty + 1, cC); corner(tx, ty + 1, cD);
      // keep a little of the tile's own color so edges stay readable
      const own = [tint[k * 3], tint[k * 3 + 1], tint[k * 3 + 2]];
      const o = k * 18;
      const put = (j, q) => { col[o + j * 3] = q[0] * 0.8 + own[0] * 0.2; col[o + j * 3 + 1] = q[1] * 0.8 + own[1] * 0.2; col[o + j * 3 + 2] = q[2] * 0.8 + own[2] * 0.2; };
      put(0, cA); put(1, cC); put(2, cB); put(3, cA); put(4, cD); put(5, cC);
    }
    g.attributes.uv.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }

  quadMesh(tiles, lift, material, colorFn, alpha = false) {
    const n = tiles.length;
    const pos = new Float32Array(n * 18), col = new Float32Array(n * 6 * (alpha ? 4 : 3)), nor = new Float32Array(n * 18);
    let o = 0, oc = 0;
    const cs = alpha ? 4 : 3;
    for (const [x, y, hTop] of tiles) {
      const c0 = colorFn(x, y);
      const c = [lin(c0[0]), lin(c0[1]), lin(c0[2]), c0[3]];
      for (const [vx, vy] of [[x, y], [x + 1, y + 1], [x + 1, y], [x, y], [x, y + 1], [x + 1, y + 1]]) {
        pos[o] = vx; pos[o + 1] = (hTop != null ? hTop : this.h(vx, vy)) + lift; pos[o + 2] = vy;
        nor[o + 1] = 1;
        o += 3;
        for (let q = 0; q < cs; q++) col[oc + q] = c[q];
        oc += cs;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, cs));
    return new THREE.Mesh(g, material);
  }

  // Water lies level in its basin and spills a tile onto the banks; wherever the ground rises
  // above it, the ground hides it. So shorelines follow the land's contours instead of tile edges.
  buildWater() {
    if (this.water) { this.scene.remove(this.water); this.water.geometry.dispose(); }
    const w = this.world, TW = this.TW, TH = this.TH, X0 = this.X0, Y0 = this.Y0;
    const COL = { [T.POND]: [0.3, 0.56, 0.66, 0.82], [T.CREEK]: [0.38, 0.63, 0.7, 0.78], [T.RIVER]: [0.28, 0.52, 0.63, 0.86], [T.MARSH]: [0.46, 0.62, 0.52, 0.55] };
    const level = new Float32Array(TW * TH).fill(NaN), kind = new Uint8Array(TW * TH), wet = new Uint8Array(TW * TH);
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      const t = this.terrainAt(tx + X0, ty + Y0);
      if (!isWater(t)) continue;
      const k = ty * TW + tx;
      level[k] = Math.min(...w.corners(tx + X0, ty + Y0)) + FILL[t]; kind[k] = t; wet[k] = 1;
    }
    // one ring of bank tiles carries the neighbouring water level
    const ring = [];
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      const k = ty * TW + tx;
      if (wet[k]) continue;
      let L = -Infinity, kd = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = tx + dx, yy = ty + dy;
        if (xx < 0 || yy < 0 || xx >= TW || yy >= TH) continue;
        const j = yy * TW + xx;
        if (wet[j] && level[j] > L) { L = level[j]; kd = kind[j]; }
      }
      if (L > -Infinity && Math.min(...w.corners(tx + X0, ty + Y0)) < L) ring.push([k, L, kd]);
    }
    for (const [k, L, kd] of ring) { level[k] = L; kind[k] = kd; }
    const vLevel = (vx, vy) => {
      let L = -Infinity;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const tx = vx - X0 + dx, ty = vy - Y0 + dy;
        if (tx < 0 || ty < 0 || tx >= TW || ty >= TH) continue;
        const l = level[ty * TW + tx];
        if (l === l && l > L) L = l;
      }
      return L;
    };
    // fully clear at the outer edge of the bank ring, so shallows fade out instead of ending in a line
    const vWet = (vx, vy) => {
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const tx = vx - X0 + dx, ty = vy - Y0 + dy;
        if (tx >= 0 && ty >= 0 && tx < TW && ty < TH && wet[ty * TW + tx]) return true;
      }
      return false;
    };
    const tiles = [];
    for (let k = 0; k < TW * TH; k++) if (level[k] === level[k]) tiles.push(k);
    const pos = new Float32Array(tiles.length * 18), col = new Float32Array(tiles.length * 24), nor = new Float32Array(tiles.length * 18);
    let o = 0, oc = 0;
    for (const k of tiles) {
      const x = (k % TW) + X0, y = Math.floor(k / TW) + Y0;
      const c = COL[kind[k]];
      for (const [vx, vy] of [[x, y], [x + 1, y + 1], [x + 1, y], [x, y], [x, y + 1], [x + 1, y + 1]]) {
        pos[o] = vx; pos[o + 1] = vLevel(vx, vy) * LEVEL; pos[o + 2] = vy; nor[o + 1] = 1; o += 3;
        col[oc] = lin(c[0]); col[oc + 1] = lin(c[1]); col[oc + 2] = lin(c[2]); col[oc + 3] = vWet(vx, vy) ? c[3] : 0; oc += 4;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    this.water = new THREE.Mesh(g, this.waterMat);
    this.water.renderOrder = 2;
    this.scene.add(this.water);
  }

  buildFlood() {
    const w = this.world;
    if (this.flood) { this.scene.remove(this.flood); this.flood.geometry.dispose(); this.flood = null; }
    const tiles = [];
    for (let i = 0; i < w.n; i++) if (w.flood[i]) {
      const x = i % w.w, y = (i / w.w) | 0;
      tiles.push([x, y]);
    }
    if (!tiles.length) return;
    this.flood = this.quadMesh(tiles, 0.09, this.floodMat, () => [1, 1, 1]);
    this.flood.renderOrder = 3;
    this.scene.add(this.flood);
  }

  // Soil walls around the whole valley, like a diorama.
  buildSkirt() {
    if (this.skirt) { this.scene.remove(this.skirt); this.skirt.geometry.dispose(); }
    const base = -3 * LEVEL;
    const pos = [], col = [];
    const L = c => c.map(lin);
    const grass = L([0.42, 0.5, 0.28]), soil = L([0.46, 0.34, 0.22]), deep = L([0.26, 0.2, 0.16]), blue = L([0.2, 0.4, 0.5]);
    const seg = (x1, y1, x2, y2, water) => {
      const h1 = this.h(x1, y1), h2 = this.h(x2, y2);
      const lip = water ? 0.35 : 0.08;
      const bands = [[0, lip, water ? blue : grass, soil], [lip, null, soil, deep]];
      for (const [a, b, c1, c2] of bands) {
        const t1 = h1 - a, t2 = h2 - a;
        const b1 = b == null ? base : h1 - b, b2 = b == null ? base : h2 - b;
        pos.push(x1, t1, y1, x2, t2, y2, x2, b2, y2, x1, t1, y1, x2, b2, y2, x1, b1, y1);
        col.push(...c1, ...c1, ...c2, ...c1, ...c2, ...c2);
      }
    };
    const x0 = this.X0, y0 = this.Y0, x1 = this.X0 + this.TW, y1 = this.Y0 + this.TH;
    for (let x = x0; x < x1; x++) { seg(x, y0, x + 1, y0, isWater(this.terrainAt(x, y0))); seg(x, y1, x + 1, y1, isWater(this.terrainAt(x, y1 - 1))); }
    for (let y = y0; y < y1; y++) { seg(x0, y, x0, y + 1, isWater(this.terrainAt(x0, y))); seg(x1, y, x1, y + 1, isWater(this.terrainAt(x1 - 1, y))); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.skirt = new THREE.Mesh(g, this.skirtMat);
    this.scene.add(this.skirt);
  }

  buildLine() {
    if (this.line) { this.scene.remove(this.line); this.line.geometry.dispose(); }
    const w = this.world, pts = [];
    const add = (x, y) => pts.push(new THREE.Vector3(x, Math.max(this.h(x, y), -0.2) + 0.05, y));
    for (let x = 0; x <= w.w; x++) add(x, 0);
    for (let y = 1; y <= w.h; y++) add(w.w, y);
    for (let x = w.w - 1; x >= 0; x--) add(x, w.h);
    for (let y = w.h - 1; y >= 0; y--) add(0, y);
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    this.line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xfff2cc, dashSize: 0.45, gapSize: 0.3, transparent: true, opacity: 0.8 }));
    this.line.computeLineDistances();
    this.scene.add(this.line);
  }

  // Colored tile overlay for the whole map (colors: Float32Array of rgba per map tile).
  setOverlay(colors) {
    const w = this.world;
    if (!colors) { if (this.overlay) this.overlay.visible = false; return; }
    if (!this.overlay) {
      const tiles = [];
      for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) tiles.push([x, y]);
      this.overlay = this.quadMesh(tiles, 0.03, this.overlayMat, () => [0, 0, 0, 0], true);
      this.overlay.renderOrder = 4;
      this.scene.add(this.overlay);
    }
    this.overlay.visible = true;
    const col = this.overlay.geometry.attributes.color.array;
    for (let i = 0; i < w.n; i++) {
      const r = lin(colors[i * 4]), g = lin(colors[i * 4 + 1]), b = lin(colors[i * 4 + 2]), a = colors[i * 4 + 3];
      for (let v = 0; v < 6; v++) { const o = (i * 6 + v) * 4; col[o] = r; col[o + 1] = g; col[o + 2] = b; col[o + 3] = a; }
    }
    this.overlay.geometry.attributes.color.needsUpdate = true;
  }

  setPreview(list) {
    if (this.preview) { this.scene.remove(this.preview); this.preview.geometry.dispose(); this.preview = null; }
    if (!list || !list.length) return;
    const w = this.world;
    this.preview = this.quadMesh(list.map(p => [p.i % w.w, (p.i / w.w) | 0]), 0.045, this.previewMat, (x, y) => list.find(p => p.i === w.idx(x, y)).rgba, true);
    this.preview.renderOrder = 5;
    this.scene.add(this.preview);
  }
}
