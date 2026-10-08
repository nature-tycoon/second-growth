// Instanced plants and small features, rebuilt from the world arrays as things grow.

import * as THREE from 'three';
import { T, F, LEVEL, BORDER, isWater, clamp } from '../config.js';
import { PLANTS, plantPhase } from '../data/plants.js';
import { hash2 } from '../rng.js';
import * as G from './geometry.js';
import * as Botanical from './botanical.js';
import { flowerForm, grassForm } from '../plant-patterns.js';
import { withFocusFade } from './focus.js';
import { withSnowTops, snowCrown } from './snow.js';
import { withClouds } from './atmosphere.js';
import { waterSurfaceY } from './terrain.js';
import { biome } from '../biome.js';
import { meadowPatch, patchColor } from './patches.js';
import { FloraChanges, floraChunkKey } from './flora-changes.js';
import { groveForm } from './groves.js';
import { paletteLeafColor } from './palettes.js';

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
class ChunkedPool {
  constructor(make, flora) { this.make = make; this.flora = flora; this.subs = new Map(); this.view = [0, true, true, 0]; }
  setView(...v) { this.view = v; for (const p of this.subs.values()) p.setView(...v); }
  begin(dirty) { for (const [k, p] of this.subs) if (!dirty || dirty.has(k)) p.begin(); }
  add(x, y, z, ...rest) {
    // Keep a source tile's flowers, fruit and connecting features together when rebuilding
    // selected regions, even when a piece extends past a region's boundary.
    const k = this.flora.incremental ? this.flora.activeChunk : floraChunkKey(x, z, this.flora.chunkSize);
    let p = this.subs.get(k);
    if (!p) { p = this.make(); p.lod = p.kind === 'grass' ? this.view[3] : this.view[0]; this.subs.set(k, p); }
    p.add(x, y, z, ...rest);
  }
  end(dirty) { for (const [k, p] of this.subs) if (!dirty || dirty.has(k)) { p.end(); p.setView(...this.view); } }
}

// Foliage sways in the wind: displacement grows with height above each plant's base.
const gust = { value: 1 }; // how hard it's blowing (storms push everything further)
export const windGust = gust;
// Leaf light: light wraps a little way round a leafy mass (so the shaded side falls off softly
// instead of going dark), and leaves with a low sun behind them glow where it shines through.
// A few extra operations per pixel; nothing else changes.
const LEAF_LIGHT = THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
  '\tfloat dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tvec3 irradiance = dotNL * directLight.color;',
  `\tfloat nl = dot( geometryNormal, directLight.direction );
\tfloat dotNL = saturate( ( nl + LEAF_WRAP ) / ( 1.0 + LEAF_WRAP ) );
\tvec3 irradiance = dotNL * directLight.color;
\tfloat back = pow( saturate( dot( geometryViewDir, - directLight.direction ) ), 2.0 ) * saturate( 0.55 - nl * 0.45 );
\tirradiance += back * LEAF_GLOW * directLight.color * vec3( 1.0, 0.93, 0.62 );`);
if (LEAF_LIGHT === THREE.ShaderChunk.lights_lambert_pars_fragment) console.warn('leaf light: three.js lighting code changed, leaves use plain lighting');

function windy(mat, amount, wind, bothSidesLit = false, wrap = 0.3, glow = 0.55) {
  mat.onBeforeCompile = shader => {
    shader.fragmentShader = `#define LEAF_WRAP ${wrap.toFixed(2)}\n#define LEAF_GLOW ${glow.toFixed(2)}\n` + shader.fragmentShader.replace('#include <lights_lambert_pars_fragment>', LEAF_LIGHT);
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
  mat.customProgramCacheKey = () => 'wind' + amount + (bothSidesLit ? 'b' : '') + ':leaf' + wrap + glow;
  return mat;
}

const rgb = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const vary = (c, x, y, salt, amt = 0.08) => { const f = 1 + (hash2(x, y, salt) - 0.5) * amt * 2; return [c[0] * f, c[1] * f, c[2] * f]; };

export function leafColor(p, phase) {
  return paletteLeafColor(p, phase, biome.id);
}

const STEM = { dogwood: '#b0302a', willow: '#c8923a' };
const SPADIX = '#e4d48c'; // (a corpse flower's spadix, unless its look gives a head colour)
const BLEACHED = [0.95, 0.94, 0.9]; // coral that has lost its algae: the white skeleton shows through
// shrub looks with a geometry of their own; everything else is a generic leafy mound
export const SHRUB_SHAPES = ['bramble', 'willow', 'broom', 'salal', 'holly', 'vinemaple', 'heliconia', 'bamboo', 'aloe', 'cactus',
  'rattan', 'pandan', 'ginger', // (Sumatra)
  'softcoral', 'seafan', 'anemone', 'clam', 'starfish', 'sponge', 'mushroom', 'seastar']; // (the last row: the reef)

export class Flora {
  constructor(scene, { chunkSize = 48, incremental = true } = {}) {
    this.scene = scene;
    this.chunkSize = chunkSize; this.incremental = incremental;
    this.changes = new FloraChanges(chunkSize);
    this.wind = { value: 0 };
    // everything that can hide an animal dissolves around the selected one (see focus.js)
    // ...and everything catches snow on top in winter (see snow.js)
    this.foliage = withClouds(withSnowTops(withFocusFade(windy(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.012, this.wind)), 0.95, { crown: true }));
    this.shrubs = withClouds(withSnowTops(withFocusFade(windy(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.12, this.wind, false, 0.38, 0.6)), 0.85));
    this.grass = withClouds(withSnowTops(withFocusFade(windy(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 1.4, this.wind, true, 0.5, 0.7)), 1.3));
    this.tallGrass = withClouds(withSnowTops(withFocusFade(windy(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0.4, this.wind, true, 0.5, 0.7)), 1.3));
    this.bark = withClouds(withSnowTops(withFocusFade(new THREE.MeshLambertMaterial({ vertexColors: true })), 1));
    this.small = withClouds(withSnowTops(withFocusFade(new THREE.MeshLambertMaterial({ vertexColors: true })), 1));
    this.pools = new Map();
    this.geos = new Map();
    this.view = [0, true, true, 0];
  }

  geo(key, build) {
    let g = this.geos.get(key);
    if (!g) {
      g = build();
      // baked shading (see geometry.js): leafy masses darker inside, grass at its foot, the rest where it meets the ground
      if (g?.isBufferGeometry) G.bakeAO(g, key.startsWith('tuft') ? 'blade' : key.startsWith('shrub') ? 'crown' : 'base');
      this.geos.set(key, g);
    }
    return g;
  }
  pool(key, build, mat, opts = {}, buildLo = null) {
    let p = this.pools.get(key);
    if (!p) {
      const geo = this.geo(key, build);
      const geoLo = buildLo ? this.geo(key + ':lo', buildLo) : geo;
      p = new ChunkedPool(() => new Pool(this.scene, geo, mat, { ...opts, geoLo }), this);
      p.setView(...this.view);
      this.pools.set(key, p);
    }
    return p;
  }

  // Points on a shrub's outer, upper surface, lifted clear of the leaves so heads sit on them rather
  // than in them. A shrub is several lumpy masses: only the points on the outermost shell count,
  // the farthest from the centre in their own direction, not those tucked between two masses.
  shrubSpots(key) {
    let spots = this.geos.get(key + ':spots');
    if (!spots) {
      const g = this.geos.get(key), p = g.attributes.position, nor = g.attributes.normal;
      let top = 0;
      for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
      const cy = top * 0.35, bin = (x, y, z) => Math.floor((Math.atan2(z, x) / Math.PI + 1) * 6) % 12 * 4 + Math.min(3, Math.max(0, Math.floor(Math.atan2(y - cy, Math.hypot(x, z)) / (Math.PI / 2) * 4)));
      const far = new Float32Array(48), cand = [];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        if (y < top * 0.4 || nor.getY(i) < -0.1) continue;
        const d = Math.hypot(x, y - cy, z), b = bin(x, y, z);
        far[b] = Math.max(far[b], d); cand.push([x, y, z, d, b, i]);
      }
      spots = [];
      for (const [x, y, z, d, b, i] of cand) if (d > far[b] * 0.93) {
        const lift = 0.035;
        spots.push([x + nor.getX(i) * lift, y + Math.max(0.3, nor.getY(i)) * lift, z + nor.getZ(i) * lift]);
      }
      if (!spots.length) spots.push([0, top, 0]);
      this.geos.set(key + ':spots', spots);
    }
    return spots;
  }

  // Simpler models when zoomed out; grass blades vanish once they'd be too small to see.
  // [lod for trees and shrubs, grass visible, shrub shadows, lod for grass]
  // Grass is by far the most instances, so it switches to its light version well before close-up.
  // The Fast graphics setting (the default on phones) keeps the simple models until you're
  // zoomed right in, hides grass blades sooner, drops shrub shadows, and draws half the tufts.
  setZoom(zoom, force = false) {
    this.zoom = zoom;
    const v = this.light
      ? [zoom < 1.4 ? 1 : 0, zoom > 0.5, false, zoom < 1.8 ? 1 : 0]
      : [zoom < 0.5 ? 1 : 0, zoom > 0.34, zoom > 0.7, zoom < 1.1 ? 1 : 0];
    if (!force && this.view && v.every((x, k) => x === this.view[k])) return;
    this.view = v;
    for (const p of this.pools.values()) p.setView(...v);
  }

  // returns true when the plants need rebuilding to match
  setLight(on) {
    on = !!on;
    if (on === !!this.light) return false;
    this.light = on;
    this.setZoom(this.zoom ?? 1, true);
    this.setLightingDepth(this.lightingDepth !== false);
    return true;
  }

  // Crowns and trunks catch neighbouring branch shadows in the full landscape lighting.
  setLightingDepth(on) {
    this.lightingDepth = on;
    const receive = on && !this.light && !biome.look.underwater;
    for (const [key, pool] of this.pools) if (key.startsWith('crown:') || key.startsWith('trunk:')) {
      for (const p of pool.subs.values()) {
        p.receive = receive;
        if (p.mesh) p.mesh.receiveShadow = receive;
      }
    }
  }

  setFade(on) {
    for (const m of [this.foliage, this.shrubs, this.bark]) { m.transparent = on; m.opacity = on ? 0.28 : 1; m.depthWrite = !on; m.needsUpdate = true; }
  }

  // Rebuild changed source regions. World, season, height and graphics changes rebuild fully.
  rebuild(game, force = false) {
    const w = game.world, B = game.border, month = game.month;
    const dirty = this.incremental && !force ? this.changes.find(game, this.light) : null;
    this.lastRebuild = { full: !dirty, tiles: 0, regions: dirty?.size ?? null };
    if (dirty && !dirty.size) return;
    for (const p of this.pools.values()) p.begin(dirty);
    const dots = this.pool('dot', () => G.blob(0xffffff), this.small, { shadow: false });
    const x0 = -BORDER, y0 = -BORDER, x1 = w.w + BORDER, y1 = w.h + BORDER;
    const hAt = (x, y) => w.heightAt(x, y) * LEVEL;
    const seaY = biome.look.underwater ? biome.look.underwater.level * LEVEL : null;

    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      this.activeChunk = floraChunkKey(x, y, this.chunkSize);
      if (dirty && !dirty.has(this.activeChunk)) continue;
      this.lastRebuild.tiles++;
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
        const form = flowerForm(p), drawType = grassForm(p);
        const tall = ['savannagrass', 'dropseed', 'papyrus'].includes(drawType);
        const grassy = type === 'grass' || type === 'tallgrass' || type === 'sedge';
        // (lush: on maps whose wildflower gardens are the payoff, a mature bed is drawn thick and full)
        const lush = biome.look.lush && (type === 'forb' || type === 'tallforb') && g >= 0.3;
        const titan = type === 'titan'; // (one to a tile, a little tree of a leaf, so drawn with the shrubs)
        const n0 = titan ? 1 : lush ? (g < 0.65 ? 4 : 6) : g < 0.3 ? 2 : g < 0.65 ? (grassy ? 4 : 3) : (type === 'fern' || type === 'skunk' || type === 'tallforb' ? 3 : grassy ? 7 : 4); // a healthy sward fills its tile
        // meadow patches: thicker, taller and deeper green in some places, thinner and more golden in others
        const pt = meadowPatch(x + 0.5, y + 0.5), aquaticT = type === 'lily' || type === 'cattail' || type === 'tule';
        const n = Math.max(1, Math.round((aquaticT ? n0 : n0 * (0.6 + pt.lush * 0.8)) * (this.light ? 0.5 : 1)));
        const phase = plantPhase(p, month);
        const col = aquaticT ? leafColor(p, phase) : patchColor(leafColor(p, phase), pt);
        // grasses grow in clumps: one or two centres per tile that the tufts gather round
        const clumps = grassy || form && !p.aquatic ? 1 + (hash2(x, y, 17) < 0.5 ? 1 : 0) : 0;
        const tseed = 100 + v * 17 + (form || drawType).length;
        const bloomT = titan && phase === 'bloom' ? 'titanbloom' : type; // (in its rare flowering, the corpse flower is a spathe instead of a leaf)
        let botanical;
        if (form) {
          const key = `botanical:${form}:${p.look.flower}:${v}`;
          botanical = this.geos.get(key);
          if (!botanical) {
            botanical = Botanical.wildflowerParts(form, tseed, p.look.flower);
            botanical.lo = Botanical.wildflowerParts(form, tseed, p.look.flower, true);
            this.geos.set(key, botanical);
          }
        }
        const flowerLeaves = form && (type === 'forb' || type === 'tallforb');
        const mat = tall ? this.tallGrass : this.grass;
        const pool = titan ? this.pool(`tuft:${bloomT}:${v}`, () => G.tuft(bloomT, tseed), this.shrubs, { kind: 'shrub' }, () => G.tuft(bloomT, tseed, true))
          : flowerLeaves ? this.pool(`tuft:flower:${form}:${v}`, () => botanical.foliage, mat, { shadow: false, kind: 'grass' }, () => botanical.lo.foliage)
          : form ? this.pool(`tuft:flower:${type}:${form}:${v}`, () => G.merge([G.tuft(drawType,tseed),botanical.foliage]), mat, { shadow: false, kind: 'grass' }, () => G.merge([G.tuft(drawType,tseed,true),botanical.lo.foliage]))
          : this.pool(`tuft:${drawType}:${v}`, () => G.tuft(drawType, tseed), mat, { shadow: false, kind: 'grass' }, () => G.tuft(drawType, tseed, true));
        const blossoms = form && phase === 'bloom' ? this.pool(`flower:${form}:${p.look.flower}:${v}`, () => botanical.blossom, this.grass, { shadow: false, kind: 'grass' }, () => botanical.lo.blossom) : null;
        const seedHeads = flowerLeaves && (phase === 'late' || phase === 'fall' || phase === 'winter') ? this.pool(`seed:${form}:${v}`, () => botanical.seed, this.grass, { shadow: false, kind: 'grass' }, () => botanical.lo.seed) : null;
        const grassHeads = tall && g > 0.55 ? this.pool(`grasshead:${drawType}:${v}`, () => Botanical.grassHeads(drawType, tseed), mat, { shadow: false, kind: 'grass' }, () => Botanical.grassHeads(drawType, tseed, true)) : null;
        // parts in a colour of their own: the pitchers (always), the spadix (in flower)
        const acc = type === 'pitcher' ? this.pool(`tuft:acc:pitcher:${v}`, () => G.accent('pitcher', tseed), this.grass, { shadow: false, kind: 'grass' }, () => G.accent('pitcher', tseed, true))
          : bloomT === 'titanbloom' ? this.pool(`tuft:acc:titanbloom:${v}`, () => G.accent('titanbloom', tseed), this.shrubs, { kind: 'shrub' }, () => G.accent('titanbloom', tseed, true)) : null;
        const accCol = type === 'pitcher' ? rgb(p.look.flower || '#a8442e') : rgb(p.look.head || SPADIX);
        for (let k = 0; k < n; k++) {
          let px = x + 0.08 + hash2(x, y, 20 + k) * 0.84, pz = y + 0.08 + hash2(x, y, 40 + k) * 0.84;
          if (titan) { px = x + 0.3 + hash2(x, y, 20) * 0.4; pz = y + 0.3 + hash2(x, y, 40) * 0.4; }
          if (clumps && k % 3 !== 2) { // two in three tufts close in round a clump; the rest scatter between
            const c = k % clumps, cxp = x + 0.2 + hash2(x, y, 14 + c) * 0.6, czp = y + 0.2 + hash2(x, y, 15 + c) * 0.6, a = hash2(x, y, 21 + k) * 6.28, r = Math.sqrt(hash2(x, y, 41 + k)) * 0.2;
            px = cxp + Math.cos(a) * r; pz = czp + Math.sin(a) * r;
          }
          const sc = (0.35 + 0.6 * g) * (0.85 + hash2(x, y, 60 + k) * 0.3) * (lush ? 1.12 : 1) * (aquaticT ? 1 : 0.88 + pt.lush * 0.26);
          // lily pads float on the water surface instead of sitting on the pond bed
          const py = type === 'lily' && inside && isWater(w.terrain[i]) ? (waterSurfaceY(w, px, pz) ?? hAt(px, pz)) + 0.01 : hAt(px, pz);
          const turn = hash2(x, y, 80 + k) * 6.28;
          pool.add(px, py, pz, sc, sc, sc, turn, bloomT === 'titanbloom' ? rgb(p.look.flower || '#6a1a2a').map(c => c * dim) : vary(col.map(c => c * dim), x, y, k));
          if (blossoms) blossoms.add(px, py, pz, sc, sc, sc, turn, vary([dim, dim, dim], x, y, k, 0.035));
          if (seedHeads && k % 2 === 0) seedHeads.add(px, py, pz, sc, sc, sc, turn, [dim, dim, dim]);
          if (grassHeads && (drawType === 'papyrus' || k % 2 === 0)) grassHeads.add(px, py, pz, sc, sc, sc, turn, [dim, dim, dim]);
          if (acc) acc.add(px, py, pz, sc, sc, sc, turn, vary(accCol.map(c => c * dim), x, y, 70 + k));
          // flowers, seed heads and spathes
          if (phase === 'bloom' && p.look.flower && !acc && !titan && !form) {
            const fc = rgb(p.look.flower);
            if (type === 'tallforb') for (let f = 0; f < 3; f++) dots.add(px, py + (0.22 + f * 0.04) * sc, pz, 0.8, 1.3, 0.8, 0, fc);
            else if (type === 'skunk') dots.add(px, py + 0.12, pz, 1.6, 2.6, 1.6, 0, fc);
            else for (let f = 0; f < (lush ? 4 : 3); f++) { const ds = lush ? 1.15 : 0.9; dots.add(px + (hash2(x, y, 90 + k * 3 + f) - 0.5) * 0.14, py + 0.14 * sc + f * 0.02, pz + (hash2(x, y, 95 + k * 3 + f) - 0.5) * 0.14, ds, ds, ds, 0, fc); }
          }
          // (lush: the gardens are left standing through fall and winter: dark cones and pale plumes, silvered by frost)
          if (lush && !form && (phase === 'fall' || phase === 'winter') && p.look.flower && k % 2 === 0) {
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
        let sx = x + 0.5 + (hash2(x, y, 3) - 0.5) * 0.4, sz = y + 0.5 + (hash2(x, y, 4) - 0.5) * 0.4;
        // a blue sea star sharing a tile with a coral lies on the sand beside it, at the far side
        // of the tile from the coral, rather than in the same spot with its arms poking through
        if (p.look.type === 'seastar' && tid) {
          const ox = hash2(x, y, 3) - 0.5, oz = hash2(x, y, 4) - 0.5; // (where the coral stands: see trees below)
          sx = x + 0.5 - Math.sign(ox || 1) * 0.34; sz = y + 0.5 - Math.sign(oz || 1) * 0.34;
        }
        let sy = hAt(sx, sz);
        if (p.look.climbs && tid) { // (a crown-of-thorns starfish sits up on top of the coral it's eating)
          const tp = PLANTS[tid], tg = inside ? w.treeG[i] : 0.9, tsc = (0.2 + 0.8 * tg) * (0.78 + hash2(x, y, 9) * 0.42) * (tp.look.scale ?? 1);
          sx = x + 0.5 + (hash2(x, y, 3) - 0.5) * 0.45; sz = y + 0.5 + (hash2(x, y, 4) - 0.5) * 0.45;
          sy = hAt(sx, sz) + (G.TREE_SHAPES[tp.look.type]?.height || 0.4) * tsc * 0.85;
        }
        const sc = (0.32 + 0.6 * g) * (p.look.small ? 0.8 : 1) * (p.look.scale ?? 1) * (0.8 + hash2(x, y, 6) * 0.35); // (look.scale: a plant drawn bigger or smaller than its shape's usual size)
        const rot = hash2(x, y, 7) * 6.28;
        if (p.look.deciduous && phase === 'winter') {
          const stem = rgb(STEM[p.key] || '#7a6a52');
          this.pool(`twig:${v}`, () => G.twigs(300 + v), this.bark).add(sx, sy, sz, sc, sc * (p.key === 'willow' ? 1.6 : 1), sc, rot, stem.map(c => c * dim));
        } else {
          const type = p.look.type;
          const shape = SHRUB_SHAPES.includes(type) ? type : 'shrub';
          let col = vary(leafColor(p, phase).map(c => c * dim), x, y, 8, 0.045);
          if (inside && w.bleach && p.bleach && w.bleach[i] > 0) col = mixc(col, BLEACHED, w.bleach[i]);
          const sseed = 200 + v * 31 + shape.length;
          this.pool(`shrub:${shape}:${v}`, () => G.shrub(shape, sseed), this.shrubs, { kind: 'shrub' }, () => G.shrub(shape, sseed, 1)).add(sx, sy, sz, sc, sc, sc, rot, col);
          // a giant clam's shells are pale and chalky, whatever colour its mantle is
          if (shape === 'clam') this.pool(`clamshell:${v}`, () => G.clamShell(sseed), this.shrubs, { kind: 'shrub' }).add(sx, sy, sz, sc, sc, sc, rot, vary([0.86, 0.84, 0.76].map(c => c * dim), x, y, 10, 0.05));
          // torch ginger's flowers are torches on stalks of their own, and pandan's fruit hangs under its tufts, not dots among the leaves
          const accCol = shape === 'ginger' && phase === 'bloom' ? p.look.flower : shape === 'pandan' && phase === 'fruit' ? p.look.berry : null;
          if (accCol && g > 0.3) this.pool(`shrub:acc:${shape}:${v}`, () => G.accent(shape, sseed), this.shrubs, { kind: 'shrub' }, () => G.accent(shape, sseed, 1)).add(sx, sy, sz, sc, sc, sc, rot, vary(rgb(accCol).map(c => c * dim), x, y, 9, 0.06));
          const dotCol = accCol ? null : phase === 'bloom' && p.look.flower ? rgb(p.look.flower) : phase === 'fruit' && p.look.berry ? rgb(p.look.berry) : null;
          if (dotCol && g > 0.3) {
            const n = 4 + Math.round(g * 5);
            const flowering = phase === 'bloom', fruiting = !flowering;
            const flowerShape = p.key === 'buttonbush' ? 'puff' : p.key === 'hydrangea' || p.look.plume ? 'plume'
              : p.key === 'elderberry' || p.key === 'lantana' || p.key === 'oceanspray' ? 'umbel'
              : p.key === 'salal' ? 'bells'
              : p.key === 'broom' || p.key === 'oregongrape' || p.key === 'aloe' || p.key === 'sweetspire' ? 'spike' : 'star';
            const headShape = flowering ? flowerShape : p.key === 'piper' ? 'catkin' : null; // (spiked pepper's fruit is a curved spike, not a berry)
            const heads = headShape ? this.pool(`shrubflower:${headShape}:${flowering ? p.look.flower : p.look.berry}`, () => Botanical.blossomHead(headShape, flowering ? p.look.flower : p.look.berry), this.grass, { shadow: false, kind: 'shrub' }, () => Botanical.blossomHead(headShape, flowering ? p.look.flower : p.look.berry, true)) : null;
            // flowers and fruit sit on the bush's own outer surface, wherever its leaves actually are
            const spots = this.shrubSpots(`shrub:${shape}:${v}`);
            const cr = Math.cos(rot), sr = Math.sin(rot);
            for (let k = 0; k < n; k++) {
              const [ox, oy, oz] = spots[Math.floor(hash2(x, y, 110 + k) * spots.length)];
              const wx = ox * cr + oz * sr, wz = -ox * sr + oz * cr, fx = sx + wx * sc, fy = sy + oy * sc, fz = sz + wz * sc;
              // (a bell spray arches along the bush's surface, not out into the air; its spray points 0.6 rad round in its own frame)
              const yaw = headShape === 'bells' ? 0.6 - Math.atan2(wz, wx) - (hash2(x, y, 130 + k) < 0.5 ? 1.4 : -1.4) : hash2(x, y, 130 + k) * 6.28;
              if (heads) heads.add(fx, fy, fz, sc, sc, sc, yaw, [dim, dim, dim]);
              else dots.add(fx, fy, fz, 1, 1, 1, 0, dotCol);
            }
          }
        }
      }

      // ---- trees
      if (tid) {
        const p = PLANTS[tid];
        const g = inside ? w.treeG[i] : (B.treeG[bi] || 0.9);
        const baseShape = G.TREE_SHAPES[p.look.type];
        const habit = ['oak', 'whiteoak', 'willowoak', 'guanacaste', 'genizaro'].includes(p.key) ? 'spread'
          : ['cottonwood', 'tulippoplar', 'sweetgum', 'blackcherry', 'magnolia'].includes(p.key) ? 'spire'
          : p.key === 'dogwood' && p.layer === 2 ? 'layered'
          : ['redbud', 'riverbirch', 'vinemaple'].includes(p.key) ? 'vase' : baseShape.habit;
        const shapeDef = habit === baseShape.habit ? baseShape : { ...baseShape, habit };
        const phase = p.conifer ? 'green' : plantPhase(p, month);
        const tx = x + 0.5 + (hash2(x, y, 3) - 0.5) * 0.45, tz = y + 0.5 + (hash2(x, y, 4) - 0.5) * 0.45;
        const ty = hAt(tx, tz) - 0.02;
        const sc = (0.2 + 0.8 * g) * (0.78 + hash2(x, y, 9) * 0.42) * (p.look.scale ?? 1);
        const grove = groveForm(x, y, g, shapeDef);
        const sx = sc * grove.width, sy = sc * grove.height, sz = sc * grove.width;
        const rot = hash2(x, y, 10) * 6.28;
        // Fruit and blossom follow the same stretched scaffold as the crown.
        const onTree = (lx, ly, lz) => [tx + Math.cos(rot) * lx * sx + Math.sin(rot) * lz * sz,
          ty + ly * sy, tz - Math.sin(rot) * lx * sx + Math.cos(rot) * lz * sz];
        const bark = rgb(p.look.bark).map(c => c * dim);
        const key = `${p.look.type}:${p.key}:${v}`;
        const build = (lod = 0) => G.treeParts(shapeDef, 500 + v * 13 + p.id, lod);
        if (!p.conifer && phase === 'winter') {
          this.pool(`bare:${key}`, () => G.bareTree(shapeDef, 700 + v), this.bark).add(tx, ty, tz, sx, sy, sz, rot, bark);
        } else {
          let shape = this.geos.get(`treeparts:${key}`);
          if (!shape) {
            shape = build(); shape.lo = build(1);
            snowCrown(shape.crown); snowCrown(shape.lo.crown);
            this.geos.set(`treeparts:${key}`, shape);
          }
          if (!this.pools.has(`crown:${key}`)) {
            const receive = () => this.lightingDepth !== false && !this.light && !biome.look.underwater;
            const crown = new ChunkedPool(() => new Pool(this.scene, shape.crown, this.foliage, { geoLo: shape.lo.crown, receive: receive() }), this);
            const trunkP = new ChunkedPool(() => new Pool(this.scene, shape.trunk, this.bark, { geoLo: shape.lo.trunk, receive: receive() }), this);
            crown.setView(...this.view); trunkP.setView(...this.view);
            this.pools.set(`crown:${key}`, crown); this.pools.set(`trunk:${key}`, trunkP);
          }
          let leaf = leafColor(p, phase);
          if (phase === 'fall') leaf = mixc(leaf, rgb(p.look.leaf), hash2(x, y, 11) * 0.35);
          if (inside && w.bleach && w.bleach[i] > 0) leaf = mixc(leaf, BLEACHED, w.bleach[i]); // (a coral bleaching in a marine heatwave)
          this.pools.get(`crown:${key}`).add(tx, ty, tz, sx, sy, sz, rot, vary(leaf.map(c => c * dim * grove.tint), x, y, 12, 0.045));
          this.pools.get(`trunk:${key}`).add(tx, ty, tz, sx, sy, sz, rot, bark);
          if (phase === 'bloom' && ['dogwood', 'magnolia', 'ipe', 'redbud'].includes(p.key) && shapeDef.rx && g > 0.45) {
            const form = p.key === 'magnolia' ? 'waterlily' : p.key === 'ipe' ? 'trumpet' : 'star';
            const flowers = this.pool(`treeflower:${form}:${p.look.flower}`, () => Botanical.blossomHead(form, p.look.flower), this.grass,
              { shadow: false }, () => Botanical.blossomHead(form, p.look.flower, true));
            for (let k = 0; k < 12; k++) {
              const a = k * 2.4, d = shapeDef.rx * (0.5 + hash2(x, y, k + 121) * 0.36);
              const fy = shapeDef.height - shapeDef.ry * (0.6 + hash2(x, y, k + 133) * 0.65);
              const size = sc * (p.key === 'magnolia' ? 1.3 : 0.85);
              flowers.add(...onTree(Math.cos(a) * d, fy, Math.sin(a) * d), size, size, size, rot + a, [dim, dim, dim]);
            }
          }
          // trees with a fruit part of their own (the oil palm's bunches) show it, in the berry colour, once old enough to bear
          if (shape.fruit && phase === 'fruit' && p.look.berry && g > 0.45) {
            if (!this.pools.has(`fruit:${key}`)) {
              const fp = new ChunkedPool(() => new Pool(this.scene, shape.fruit, this.bark, { geoLo: shape.lo.fruit }), this);
              fp.setView(...this.view); this.pools.set(`fruit:${key}`, fp);
            }
            this.pools.get(`fruit:${key}`).add(tx, ty, tz, sx, sy, sz, rot, vary(rgb(p.look.berry).map(c => c * dim), x, y, 14, 0.08));
          }
          // fruit trees (durian, rambutan, mangosteen...) hang their fruit round the outside of the crown in season
          if (p.look.hangFruit && phase === 'fruit' && p.look.berry && g > 0.6 && shapeDef.rx) {
            // (on the surface of the crown, around its middle, where the camera can see them)
            const fc = rgb(p.look.berry).map(c => c * dim), fs = (p.look.fruitSize || 1.3) * 1.3, ry = shapeDef.ry ?? 0.4;
            const fy = shapeDef.height - ry * 1.1, rr = shapeDef.rx * 0.78 + Math.min(shapeDef.rx, ry) * 0.5;
            for (let k = 0; k < 9; k++) {
              const a = k * 2.4 + hash2(x + k, y, 15), d = rr * (0.92 + hash2(x, y + k, 16) * 0.12);
              dots.add(...onTree(Math.cos(a) * d, fy + (hash2(x + k, y + k, 17) - 0.5) * 0.25, Math.sin(a) * d), fs, fs * 1.15, fs, rot + a, fc);
            }
          }
        }
      }

      if (!inside) continue;

      // a snorkel trail on the reef is marked out with a line of orange buoys at the surface
      if (seaY != null && (w.marks[i] & 1) && hAt(x + 0.5, y + 0.5) < seaY) {
        if ((x * 3 + y * 5) % 3 === 0) {
          dots.add(x + 0.5, seaY + 0.005, y + 0.5, 2.3, 1.5, 2.3, 0, [0.98, 0.5, 0.16]);
          dots.add(x + 0.5, seaY + 0.05, y + 0.5, 0.5, 1.6, 0.5, 0, [0.95, 0.95, 0.92]); // its little pole
        }
        // ...strung together with a floating rope
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
          if (!w.inb(x + dx, y + dy) || !(w.marks[w.idx(x + dx, y + dy)] & 1)) continue;
          if (dx && dy && ((w.marks[w.idx(x + dx, y)] & 1) || (w.marks[w.idx(x, y + dy)] & 1))) continue; // (no rope across a corner already roped)
          const len = Math.hypot(dx, dy);
          dots.add(x + 0.5 + dx / 2, seaY + 0.008, y + 0.5 + dy / 2, len / 0.07, 0.22, 0.22, -Math.atan2(dy, dx), [0.95, 0.9, 0.7]);
        }
      }

      // shade cloth strung just under the surface over the reef in a heatwave
      if (seaY != null && (w.marks[i] & 8)) this.pool('shadecloth', () => G.shadeCloth(), this.small, { shadow: true }).add(x + 0.5, seaY - 0.035, y + 0.5, 1, 1, 1, 0, [0.12, 0.17, 0.15]);

      // reef stars laid over the rubble: bare sand-coated steel at first, then, as the coral tied
      // onto them grows, crusted over with pink coralline algae and settling into the rubble,
      // until the coral has grown over them altogether
      // (and a bare one crusts over with the coralline algae spreading across its rubble, low and pink)
      const crust = Math.max(w.tree[i] ? clamp(w.treeG[i] / 0.45, 0, 1) : 0, w.ground[i] && PLANTS[w.ground[i]].crustOK ? w.groundG[i] * 0.85 : 0);
      if ((w.marks[i] & 2) && crust < 1) {
        const rx = x + 0.5, rz = y + 0.5, s = 0.85 * (1 - 0.3 * crust);
        this.pool('reefstar', () => G.reefStar(77), this.small).add(rx, hAt(rx, rz) - 0.01 - 0.035 * crust, rz, s, s * (1 - 0.5 * crust), s, hash2(x, y, 19) * 1.05,
          mixc([0.84, 0.78, 0.64], [0.6, 0.47, 0.5], Math.min(1, crust * 1.4)).map(c => c * dim));
      }

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
          if (f === F.DAM && (w.marks[i] & 4)) this.pool('canalblock', () => G.canalBlock(985), this.bark).add(cx, w.tileH(x, y) * LEVEL, cz, 1, 1, 1, vertical ? 0 : Math.PI / 2, [1, 1, 1]); // (a canal block across a drainage canal)
          else if (f === F.DAM) this.pool('dam', () => G.dam(980), this.bark).add(cx, w.tileH(x, y) * LEVEL + 0.03, cz, 1, 1, 1, vertical ? 0 : Math.PI / 2, [1, 1, 1]);
          else this.pool('culvert', () => G.culvert(), this.small).add(cx, surf, cz, 1, 1, 1, vertical ? 0 : Math.PI / 2, [1, 1, 1]);
          break;
        }
      }
    }
    for (const p of this.pools.values()) p.end(dirty);
    if (this.incremental) this.changes.remember(game, this.light);
  }
}
