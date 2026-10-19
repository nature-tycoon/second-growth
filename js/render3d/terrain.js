// The ground: a heightmap mesh textured with the tile art, a water surface, flood water,
// diorama edges around the whole valley, the property line, and tile overlays.

import * as THREE from 'three';
import { T, BORDER, LEVEL, isWater, clamp } from '../config.js';
import { plantPhase } from '../data/plants.js';
import { extTerrain } from '../world.js';
import * as S from '../render/sprites.js';
import { withClouds } from './atmosphere.js';
import { hash2 } from '../rng.js';
export { buildAtlas } from './terrain-atlas.js';
import { noiseTexture, groundDetail, waves, waterLook } from './terrain-materials.js';
import { trailSurface } from '../sim/animal-trails.js';
import { TRAIL_RESOLUTION } from '../data/animal-trails.js';
import { meadowPatch, patchColor } from './patches.js';
import { Riverbanks, bankAllowed, surfaceHeight } from './riverbanks.js';
import { PALETTES, paletteLeafColor, pastureColor } from './palettes.js';
import { WATER_FILL } from '../sim/waterline.js';

// Grass, soil and water colours come from the world’s map catalog.

const lin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// A ground tile's two triangles: its corners in drawing order (A C B, A D C), as offsets into
// the corner cycle A B C D, and scratch space for the corner vertex indices (repainting runs
// over every tile, so it allocates nothing per tile).
const TRI_CORNER = [0, 2, 1, 0, 3, 2], TRI_VERTS = new Int32Array(6);

// Tint for groundcover: a meadow's color comes from what's growing in it.
function turfColor(p, month, season, catalog) {
  const pasture = pastureColor(catalog.definition.id, season, catalog.definition.look.pasture[season]);
  // The ground and blades share the same seasonal palette, with quieter ground contrast.
  if (!PALETTES[catalog.definition.id]) {
    // Preserve reef substrate colouring, where the registry includes corals and animals.
    const phase = plantPhase(p, month);
    let base = mixRgb(pasture, hexRgb(p.look.leaf), .55);
    if (p.look.type === 'tallgrass' || p.look.type === 'grass') {
      if (phase === 'late' || phase === 'fall') base = mixRgb(base, hexRgb(p.look.dry || '#c9b77e'), .3);
      if (phase === 'winter') base = mixRgb(base, [.62, .58, .44], .4);
    }
    if (phase === 'spring') base = mixRgb(base, [.72, .84, .48], .3);
    base = mixRgb(base, pasture, .25);
    return base.map((v, k) => v / [.86, .88, .8][k]);
  }
  const base = mixRgb(pasture, paletteLeafColor(p, plantPhase(p, month), catalog.definition.id), .42);
  // divide out the turf texture's own brightness
  return [base[0] / 0.86, base[1] / 0.88, base[2] / 0.8];
}

// How far water fills each kind of basin above its lowest corner, in height levels.
const FILL = WATER_FILL;

// Height of the water surface on a tile, in scene units (null on dry land).
export function waterSurfaceY(w, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  if (!w.inb(xi, yi)) return null;
  const i = w.idx(xi, yi), t = w.terrain[i];
  if (w.waterManaged?.[i]) {
    const level = w.waterLevel[i];
    if (!Number.isFinite(level)) return null;
    const bed = surfaceHeight((xx, yy) => w.vert(xx, yy), x, y);
    return level > bed ? level * LEVEL : null;
  }
  if (!isWater(t)) return null;
  return (Math.min(...w.corners(xi, yi)) + FILL[t]) * LEVEL;
}

export class Terrain {
  constructor(scene, atlas) {
    this.scene = scene;
    this.atlas = atlas;
    this.time = { value: 0 };
    // which texture each tile shows, for the ground shader: slot, rotation, crisp-edged or not
    this.noise = noiseTexture();
    this.tiles = { density: { value: null }, trailVisible: { value: 1 }, soil: { value: new THREE.Color() }, tint: { value: null }, tex: { value: null }, origin: { value: new THREE.Vector2() }, size: { value: new THREE.Vector2(1, 1) }, wet: { value: 0 }, hRange: { value: new THREE.Vector2(0, 1) } };
    this.material = withClouds(groundDetail(new THREE.MeshLambertMaterial({ map: atlas.tex, vertexColors: true }), this.noise, this.tiles));
    this.rain = { value: 0 }; this.sky = { value: new THREE.Color(0.8, 0.86, 0.9) };
    this.waterMat = withClouds(waterLook(waves(new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 1, shininess: 140, specular: 0xb4ccd8, depthWrite: false }), this.time, 1), this.time, this.noise, this.rain, this.sky));
    // floodwater uses the same living water as ponds and rivers (silty, running downhill: see buildFlood)
    this.floodMat = withClouds(waterLook(waves(new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 1, shininess: 110, specular: 0x9aaab0, depthWrite: false }), this.time, 0.45), this.time, this.noise, this.rain, this.sky));
    this.skirtMat = withClouds(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.overlayMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.previewMat = this.overlayMat.clone();
    this.banks = new Riverbanks(scene);
    this.bankTerrainAt = (x, y) => this.terrainAt(x, y);
  }

  // The Fast graphics setting draws the ground with one texture pick per pixel instead of two.
  setFast(on) {
    this.banks.setFast(on);
    const d = this.material.defines || (this.material.defines = {});
    if (!!d.GROUND_FAST === on) return;
    if (on) d.GROUND_FAST = 1; else delete d.GROUND_FAST;
    this.material.needsUpdate = true;
  }

  // (Re)build everything for a world.
  setWorld(world, border) {
    this.catalog = world.catalog;
    this.world = world; this.border = border; this.snowT = null;
    this.X0 = -BORDER; this.Y0 = -BORDER;
    this.TW = world.w + BORDER * 2; this.TH = world.h + BORDER * 2;
    const n = this.TW * this.TH;
    for (const m of [this.mesh, this.water, this.flood, this.skirt, this.line, this.overlay, this.preview]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 18), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 18), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 18), 3));
    g.setAttribute('aSnow', new THREE.BufferAttribute(new Float32Array(n * 6), 1));
    g.setAttribute('aShore', new THREE.BufferAttribute(new Float32Array(n * 12), 2));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 12), 2));
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
    this.tint = new Float32Array(n * 3);
    this.tileData = new Uint8Array(n * 4);
    this.tiles.tex.value?.dispose();
    const dt = new THREE.DataTexture(this.tileData, this.TW, this.TH, THREE.RGBAFormat, THREE.UnsignedByteType);
    dt.magFilter = dt.minFilter = THREE.NearestFilter; dt.generateMipmaps = false; dt.flipY = false; dt.needsUpdate = true;
    this.tiles.tex.value = dt;
    this.tintData = new Uint8Array(n * 4);
    this.tiles.tint.value?.dispose();
    const tt = new THREE.DataTexture(this.tintData, this.TW, this.TH, THREE.RGBAFormat, THREE.UnsignedByteType);
    tt.magFilter = tt.minFilter = THREE.LinearFilter; tt.generateMipmaps = false; tt.flipY = false; tt.needsUpdate = true;
    this.tiles.tint.value = tt;
    const R = TRAIL_RESOLUTION;
    this.trailData = new Uint8Array(n * R * R);
    this.tiles.density.value?.dispose();
    const trails = new THREE.DataTexture(this.trailData, this.TW * R, this.TH * R, THREE.RedFormat, THREE.UnsignedByteType);
    trails.magFilter = trails.minFilter = THREE.LinearFilter; trails.generateMipmaps = false; trails.flipY = false; trails.unpackAlignment = 1; trails.needsUpdate = true;
    this.tiles.density.value = trails;
    this.tiles.soil.value.fromArray(world.catalog.definition.look.soil).convertSRGBToLinear().multiplyScalar(0.72);
    this.tiles.origin.value.set(this.X0, this.Y0); this.tiles.size.value.set(this.TW, this.TH);
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
    // the map's own height range, for shading hollows and rises (5th to 95th percentile, so one
    // tall peak or a deep river doesn't flatten everything else)
    { const hs = []; for (let y = 0; y <= w.h; y += 2) for (let x = 0; x <= w.w; x += 2) hs.push(this.h(x, y)); hs.sort((a, b) => a - b);
      this.tiles.hRange.value.set(hs[Math.floor(hs.length * 0.05)], hs[Math.floor(hs.length * 0.95)] + 0.01); }
    this.hv = w.hv;
    this.buildSkirt();
    this.buildLine();
    this.buildWater();
    if (this.overlay) { this.scene.remove(this.overlay); this.overlay.geometry.dispose(); this.overlay = null; }
  }

  // Textures and colors: what's on each tile this season.
  // With `area` ({ x0, y0, x1, y1 }, world tiles, inclusive) only that patch is repainted and sent
  // to the graphics chip, for brush strokes: a whole-map repaint uploads about 3 MB, several
  // times a second while painting, which older built-in graphics can't keep up with. Anything
  // that changes the whole map (a new month, reshaped land, another world) repaints everything.
  updateSurface(game, area = null) {
    const w = this.world, B = this.border, g = this.mesh.geometry;
    const uv = g.attributes.uv.array, col = g.attributes.color.array;
    const month = game.month, season = game.season;
    const tint = this.tint;
    const TW = this.TW, TH = this.TH, VW = TW + 1;
    // how readily each tile holds snow: open high ground most, under trees less, water not at all
    const snowT = this.snowT || (this.snowT = new Float32Array(this.TW * this.TH));
    // a patch: its tiles plus two around them (shade and canopy reach that far), and a ring
    // more for the shared corners that blend them into their neighbours
    let span = null;
    if (area && this.paintedSeason === season && this.paintedMonth === month && this.topHv === this.hv && this.top && this.vCol) {
      const m = 2, tx0 = Math.max(0, area.x0 - this.X0 - m), ty0 = Math.max(0, area.y0 - this.Y0 - m);
      const tx1 = Math.min(TW - 1, area.x1 - this.X0 + m), ty1 = Math.min(TH - 1, area.y1 - this.Y0 + m);
      // (a big patch costs about as much as the whole map, so just do that)
      if (tx1 >= tx0 && ty1 >= ty0 && (tx1 - tx0 + 1) * (ty1 - ty0 + 1) < TW * TH * 0.35) span = { tx0, ty0, tx1, ty1 };
    }
    const T0 = span ? span : { tx0: 0, ty0: 0, tx1: TW - 1, ty1: TH - 1 };
    const C0 = span ? { cx0: T0.tx0, cy0: T0.ty0, cx1: T0.tx1 + 1, cy1: T0.ty1 + 1 } : { cx0: 0, cy0: 0, cx1: TW, cy1: TH };
    const R0 = span ? { tx0: Math.max(0, T0.tx0 - 1), ty0: Math.max(0, T0.ty0 - 1), tx1: Math.min(TW - 1, T0.tx1 + 1), ty1: Math.min(TH - 1, T0.ty1 + 1) } : T0;
    if (!span) { this.refreshWaterQuality(); this.paintedSeason = season; this.paintedMonth = month; }
    this.lastPaint = span ? (R0.tx1 - R0.tx0 + 1) * (R0.ty1 - R0.ty0 + 1) : TW * TH;
    // each tile's highest corner, kept until the land is reshaped
    if (this.topHv !== this.hv || !this.top) {
      const top = this.top = new Float32Array(this.TW * this.TH);
      let lo = Infinity, hi = -Infinity;
      for (let ty = 0; ty < this.TH; ty++) for (let tx = 0; tx < this.TW; tx++) {
        const x = tx + this.X0, y = ty + this.Y0;
        const h = Math.max(w.vert(x, y), w.vert(x + 1, y), w.vert(x + 1, y + 1), w.vert(x, y + 1));
        top[ty * this.TW + tx] = h; if (h < lo) lo = h; if (h > hi) hi = h;
      }
      this.topLo = lo; this.topHi = hi; this.topHv = this.hv;
    }
    const top = this.top, hLo = this.topLo, hHi = this.topHi;
    const turfCache = new Map(), atlasKeys = new Map();
    // grassland of any kind shares one texture, tinted by what grows there
    const pasture = pastureColor(game.catalog.definition.id, season, game.catalog.definition.look.pasture[season]).map((v, q) => v / [0.86, 0.88, 0.8][q]);
    for (let ty = T0.ty0; ty <= T0.ty1; ty++) for (let tx = T0.tx0; tx <= T0.tx1; tx++) {
      const x = tx + this.X0, y = ty + this.Y0, k = ty * this.TW + tx;
      const inside = w.inb(x, y);
      const i = inside ? w.idx(x, y) : -1;
      const bi = inside ? -1 : B.bi(x, y);
      const t = inside ? w.terrain[i] : (bi >= 0 ? B.terrain[bi] : extTerrain(w, x, y));
      const v = inside ? w.variant[i] : ((x * 7 + y * 13) & 3);
      let tex = t, c = [1, 1, 1];
      if (t === T.MARSH) { tex = S.TURF; c = [0.52, 0.58, 0.42]; }
      else if (t === T.TRAIL && game.catalog.definition.sandBed) { tex = S.TURF; c = pastureColor(game.catalog.definition.id, season, game.catalog.definition.look.pasture[season]).map(v => v * 1.04); } // (a snorkel trail is just marked with buoys over the sand)
      // pond beds share the marsh's soft texture (just darker), so the two blend at their edges
      else if (t === T.POND) { tex = S.TURF; c = [0.4, 0.44, 0.34]; }
      else if (isWater(t)) { tex = S.BED; c = [0.7, 0.66, 0.58]; }
      else {
        const canopy = inside ? w.canopy[i] : 0;
        const gid = inside ? w.ground[i] : (bi >= 0 ? B.ground[bi] : 0);
        const gg = inside ? w.groundG[i] : 1;
        if (tex === T.PASTURE) { tex = S.TURF; c = pasture; }
        else if (tex === T.SOIL) { tex = S.TURF; c = game.catalog.definition.look.soil; }
        else if (tex === T.MUD) { tex = S.TURF; c = game.catalog.definition.look.mud; }
        if (gid && gg > 0.12 && t !== T.TRAIL) {
          const p = game.catalog.plants[gid];
          if (p.look.type === 'fern' || p.look.type === 'skunk') tex = T.DUFF;
          else if (tex !== T.DUFF) {
            let tc = turfCache.get(gid);
            if (!tc) { tc = turfColor(p, month, season, game.catalog); turfCache.set(gid, tc); }
            const f = clamp((gg - 0.12) * 2, 0, 1);
            if (p.layer === 0 && !p.aquatic) tc = patchColor(tc, meadowPatch(x + 0.5, y + 0.5), 1); // (the same patches as the tufts on it)
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
        // a little soft shade where trunks and shrubs meet the ground, so they sit in the land
        const tid2 = inside ? w.tree[i] : (bi >= 0 ? B.tree[bi] : 0), sid2 = inside ? w.shrub[i] : (bi >= 0 ? B.shrub[bi] : 0);
        const tg = inside ? w.treeG[i] : 0.9, sg = inside ? w.shrubG[i] : 0.9;
        if (tid2 && tg > 0.25) c = c.map(q => q * (1 - 0.14 * Math.min(1, tg)));
        else if (sid2 && sg > 0.3) c = c.map(q => q * (1 - 0.08 * Math.min(1, sg)));
        // ground the player can't work yet (the suburb's other yards) is washed out toward grey
        if (inside && game.catalog.definition.locked?.(game, i)) { const l = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) * 1.08; c = mixRgb(c, [l, l, l * 0.96], 0.55); }
        if (inside && (w.marks[i] & 1)) c = mixRgb(c, [1, 1, 0.96], 0.24); // (a snorkel trail: just a faint line on the seabed under the buoys)
        if (inside && game.catalog.definition.look.groundTint) c = game.catalog.definition.look.groundTint(w, i, c) || c; // (Sumatra: dark peat showing through)
        if (inside && w.scorch[i] > 0) { const f = clamp(w.scorch[i] / 160, 0, 1) * 0.7; c = mixRgb(c, [0.22, 0.2, 0.18], f); }
      }
      {
        const canopyS = inside ? w.canopy[i] : (bi >= 0 && B.tree?.[bi] ? 0.7 : 0.2);
        const elev = (top[k] - hLo) / Math.max(0.01, hHi - hLo);
        snowT[k] = isWater(t) ? 0 : (1 - canopyS * 0.55) * (0.75 + elev * 0.55);
      }
      // a map can colour the land beyond its edge itself (Chinandega's volcano: ash, not grass)
      const own = !inside && !isWater(t) ? game.catalog.definition.look.borderTint?.(x, y, c) : null;
      if (own) c = own;
      const b = 0.95 + hash2(x, y, 5) * 0.1;
      const dim = inside || own ? 1 : 0.8;
      tint[k * 3] = lin(c[0] * b * dim); tint[k * 3 + 1] = lin(c[1] * b * dim); tint[k * 3 + 2] = lin(c[2] * b * dim);
      // UVs, rotated per tile so repeats don't line up
      const ak = tex * 64 + v; // (season is fixed for the whole pass)
      let at = atlasKeys.get(ak);
      if (!at) {
        const key = this.atlas.uv[`${tex}|${season}|${v}`] ? `${tex}|${season}|${v}` : `${T.PASTURE}|${season}|0`;
        at = { r: this.atlas.uv[key], slot: this.atlas.slot[key] };
        atlasKeys.set(ak, at);
      }
      const r = at.r;
      const td = this.tileData, crisp = t === T.ROAD || t === T.TRAIL || t === T.FIELD;
      td[k * 4] = at.slot; td[k * 4 + 1] = t === T.FIELD ? 0 : (v & 3) * 64; // plowed furrows all run the same way
      td[k * 4 + 2] = crisp ? 0 : 255; td[k * 4 + 3] = inside && trailSurface(w, i) ? 255 : 0;
      // (corners 0-3 of the atlas cell are (r0,r1) (r2,r1) (r2,r3) (r0,r3); the tile's six vertices
      // take corners A C B A D C, rotated by the variant)
      const rot = v & 3, o = k * 12;
      for (let j = 0; j < 6; j++) {
        const q = (rot + TRI_CORNER[j]) & 3;
        uv[o + j * 2] = q === 0 || q === 3 ? r[0] : r[2]; uv[o + j * 2 + 1] = q < 2 ? r[1] : r[3];
      }
    }
    // blend colors at shared corners so neighbouring tiles fade into each other: each corner
    // averages the (up to four) tiles that meet there, worked out once for the whole map
    const vc = this.vCol && this.vCol.length === VW * (TH + 1) * 3 ? this.vCol : (this.vCol = new Float32Array(VW * (TH + 1) * 3));
    const vs = this.vSnow && this.vSnow.length === VW * (TH + 1) ? this.vSnow : (this.vSnow = new Float32Array(VW * (TH + 1)));
    for (let cy = C0.cy0; cy <= C0.cy1; cy++) for (let cx = C0.cx0; cx <= C0.cx1; cx++) {
      let r = 0, gg = 0, bb = 0, n = 0, sv = 0, dry = true;
      for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
        const tx = cx + dx, ty = cy + dy;
        if (tx < 0 || ty < 0 || tx >= TW || ty >= TH) continue;
        const k = ty * TW + tx;
        r += tint[k * 3]; gg += tint[k * 3 + 1]; bb += tint[k * 3 + 2]; n++;
        sv += snowT[k]; if (snowT[k] === 0) dry = false;
      }
      const o = (cy * VW + cx) * 3;
      vc[o] = r / n; vc[o + 1] = gg / n; vc[o + 2] = bb / n;
      vs[cy * VW + cx] = dry ? sv / n : sv / n * 0.5; // (snow thins out where it meets water)
    }
    const sa = g.attributes.aSnow.array, shore = g.attributes.aShore.array;
    for (let ty = R0.ty0; ty <= R0.ty1; ty++) for (let tx = R0.tx0; tx <= R0.tx1; tx++) {
      const k = ty * TW + tx;
      const a = ty * VW + tx, b = a + 1, c = a + VW + 1, d = a + VW;
      // keep a little of the tile's own color so edges stay readable
      const r0 = tint[k * 3], g0 = tint[k * 3 + 1], b0 = tint[k * 3 + 2];
      // crisp surfaces (a one-tile driveway, a trail) keep their own colour instead of taking on the lawn's
      const crisp = this.tileData[k * 4 + 2] === 0;
      const o = k * 18;
      const corner = TRI_VERTS; corner[0] = corner[3] = a; corner[1] = corner[5] = c; corner[2] = b; corner[4] = d;
      for (let j = 0; j < 6; j++) {
        const v = corner[j] * 3, at = o + j * 3;
        if (crisp) { col[at] = r0; col[at + 1] = g0; col[at + 2] = b0; continue; }
        col[at] = vc[v] * 0.92 + r0 * 0.08; col[at + 1] = vc[v + 1] * 0.92 + g0 * 0.08; col[at + 2] = vc[v + 2] * 0.92 + b0 * 0.08;
      }
      // snow affinity, blended at corners like the colours so its edges fade too
      const so = k * 6;
      sa[so] = vs[a]; sa[so + 1] = vs[c]; sa[so + 2] = vs[b]; sa[so + 3] = vs[a]; sa[so + 4] = vs[d]; sa[so + 5] = vs[c];
      const eligible = !game.catalog.definition.look.underwater && bankAllowed(w, B, this.bankTerrainAt, tx + this.X0, ty + this.Y0);
      for (let j = 0; j < 6; j++) {
        const v = corner[j];
        shore[k * 12 + j * 2] = eligible ? this.shoreVertices[v * 2] : 0;
        shore[k * 12 + j * 2 + 1] = eligible ? this.shoreVertices[v * 2 + 1] : 0;
      }
    }
    this.banks.refresh(game.month);
    { const td = this.tintData, enc = v => Math.round(Math.sqrt(clamp(v / 1.5, 0, 1)) * 255);
      for (let ty = T0.ty0; ty <= T0.ty1; ty++) for (let tx = T0.tx0; tx <= T0.tx1; tx++) {
        const k = ty * TW + tx;
        td[k * 4] = enc(tint[k * 3]); td[k * 4 + 1] = enc(tint[k * 3 + 1]); td[k * 4 + 2] = enc(tint[k * 3 + 2]); td[k * 4 + 3] = 255;
      } }
    const R = TRAIL_RESOLUTION, width = TW * R, sourceWidth = w.w * R;
    for (let ty = T0.ty0; ty <= T0.ty1; ty++) for (let tx = T0.tx0; tx <= T0.tx1; tx++) {
      const x = tx + this.X0, y = ty + this.Y0, eligible = w.inb(x, y) && trailSurface(w, w.idx(x, y));
      for (let dy = 0; dy < R; dy++) for (let dx = 0; dx < R; dx++) {
        const target = (ty * R + dy) * width + tx * R + dx;
        const source = (y * R + dy) * sourceWidth + x * R + dx;
        this.trailData[target] = eligible ? Math.round(Math.min(1, w.trailDensity?.[source] || 0) * 255) : 0;
      }
    }
    this.tiles.density.value.needsUpdate = true;
    // (the tile textures are small, 70 KB each, so they always go up whole)
    this.tiles.tex.value.needsUpdate = true; this.tiles.tint.value.needsUpdate = true;
    // send up only the rows the patch covers (tiles are stored row by row)
    const k0 = R0.ty0 * TW + R0.tx0, k1 = R0.ty1 * TW + R0.tx1 + 1;
    for (const [name, per] of [['color', 18], ['aSnow', 6], ['aShore', 12], ['uv', 12]]) {
      const attr = g.attributes[name];
      attr.clearUpdateRanges();
      if (span) attr.addUpdateRange(k0 * per, (k1 - k0) * per);
      attr.needsUpdate = true;
    }
  }

  // A new day's repaint as bands of rows, for the renderer to paint one a frame: a whole-map
  // repaint is a noticeable pause on older laptops, and a day's growth barely changes a band
  // before the next one follows. Each band is a patch repaint working from today's month and
  // season, so once all are done the ground matches a whole-map repaint exactly; a new month or
  // season goes in bands too (the change sweeps across the land over a few frames). null when
  // it must all go at once: reshaped land, or nothing painted yet in this world.
  dayBands(game, count = 4) {
    if (this.topHv !== this.hv || !this.top || !this.vCol) return null;
    this.refreshWaterQuality(); // (otherwise only a whole-map repaint refreshes these)
    this.paintedSeason = game.season; this.paintedMonth = game.month;
    const rows = Math.ceil(this.TH / count), bands = [];
    for (let ty = 0; ty < this.TH; ty += rows) {
      bands.push({ x0: this.X0, y0: this.Y0 + ty, x1: this.X0 + this.TW - 1, y1: this.Y0 + Math.min(this.TH, ty + rows) - 1 });
    }
    return bands;
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
  // The water and flood meshes only change when the water does (dug ponds, a beaver dam, a flood,
  // reshaped ground), so each new day checks a cheap fingerprint before rebuilding them.
  waterKey() {
    const w = this.world, t = w.terrain;
    let h = (w.hv | 0) >>> 0;
    for (let i = 0; i < w.n; i++) {
      if (isWater(t[i])) h = Math.imul(h ^ (i * 16 + t[i]), 16777619) >>> 0;
      if (w.waterManaged?.[i] && Number.isFinite(w.waterLevel[i])) h = Math.imul(h ^ (i * 113 + Math.round(w.waterLevel[i] * 100)), 16777619) >>> 0;
    }
    return h;
  }
  floodKey() {
    const w = this.world, f = w.flood;
    let h = 2166136261;
    for (let i = 0; i < w.n; i++) if (f[i]) h = Math.imul(h ^ i, 16777619) >>> 0;
    return h;
  }
  refreshWater() { if (this.waterKey() !== this.waterK) this.buildWater(); }
  refreshFlood() { if (this.floodKey() !== this.floodK) this.buildFlood(); }

  buildWater() {
    this.waterK = this.waterKey();
    if (this.water) { this.scene.remove(this.water); this.water.geometry.dispose(); }
    const w = this.world, TW = this.TW, TH = this.TH, X0 = this.X0, Y0 = this.Y0;
    const wc = this.catalog.definition.look.water;
    const COL = { [T.POND]: wc.pond, [T.CREEK]: wc.creek, [T.RIVER]: wc.river, [T.MARSH]: wc.marsh };
    const level = new Float32Array(TW * TH).fill(NaN), kind = new Uint8Array(TW * TH), wet = new Uint8Array(TW * TH);
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      const x = tx + X0, y = ty + Y0, t = this.terrainAt(x, y);
      const i = w.inb(x, y) ? w.idx(x, y) : -1, k = ty * TW + tx;
      if (i >= 0 && w.waterManaged?.[i]) {
        if (!Number.isFinite(w.waterLevel[i])) continue;
        level[k] = w.waterLevel[i]; kind[k] = isWater(t) ? t : T.MARSH; wet[k] = 1;
      } else {
        if (!isWater(t)) continue;
        level[k] = Math.min(...w.corners(x, y)) + FILL[t]; kind[k] = t; wet[k] = 1;
      }
    }
    // Ponds and marshes that touch are one body of standing water: give it one surface, so a
    // deeper pond reads as darker water under a continuous sheet instead of a sunken square.
    // (Capped a little above its lowest tile so water never climbs a slope.)
    const managed = k => { const x = k % TW + X0, y = Math.floor(k / TW) + Y0; return w.inb(x, y) && !!w.waterManaged?.[w.idx(x, y)]; };
    const body = new Int32Array(TW * TH).fill(-1);
    for (let k0 = 0; k0 < TW * TH; k0++) {
      if (managed(k0) || !wet[k0] || body[k0] >= 0 || (kind[k0] !== T.POND && kind[k0] !== T.MARSH)) continue;
      const q = [k0]; body[k0] = k0;
      let lo = Infinity, hi = -Infinity;
      for (let h = 0; h < q.length; h++) {
        const k = q[h], tx = k % TW, ty = (k / TW) | 0;
        lo = Math.min(lo, level[k]); hi = Math.max(hi, level[k]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = tx + dx, yy = ty + dy;
          if (xx < 0 || yy < 0 || xx >= TW || yy >= TH) continue;
          const j = yy * TW + xx;
          if (!managed(j) && wet[j] && body[j] < 0 && (kind[j] === T.POND || kind[j] === T.MARSH)) { body[j] = k0; q.push(j); }
        }
      }
      const L = Math.min(hi, lo + 0.3);
      for (const k of q) level[k] = Math.max(level[k], L);
    }
    // one ring of bank tiles carries the neighbouring water level
    const ring = [];
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      const k = ty * TW + tx;
      if (wet[k] || managed(k)) continue;
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
    const shoreVertices = this.shoreVertices = new Float32Array((TW + 1) * (TH + 1) * 2);
    for (let vy = 0; vy <= TH; vy++) for (let vx = 0; vx <= TW; vx++) {
      const L = vLevel(vx + X0, vy + Y0), k = (vy * (TW + 1) + vx) * 2;
      if (Number.isFinite(L)) { shoreVertices[k] = L * LEVEL; shoreVertices[k + 1] = 1; }
    }
    // Only scatter where all four corners share a water sheet. This avoids stray objects
    // on the outer ring where the water mesh ends and its opacity falls to zero.
    const cells = [];
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      if (Number.isFinite(level[ty * TW + tx])) cells.push([tx + X0, ty + Y0]);
    }
    const waterAt = (x, z) => {
      const xx = Math.floor(x), zz = Math.floor(z);
      if ([vLevel(xx, zz), vLevel(xx + 1, zz), vLevel(xx + 1, zz + 1), vLevel(xx, zz + 1)].some(v => !Number.isFinite(v))) return NaN;
      const k = (zz - Y0) * TW + xx - X0;
      return managed(k) && Number.isFinite(level[k]) ? level[k] * LEVEL : surfaceHeight(vLevel, x, z) * LEVEL;
    };
    this.waterAt = waterAt; // (the drawn surface at a point, NaN off the water: animals swim by it)
    this.banks.bind(w, this.border, cells, waterAt, this.bankTerrainAt, !!this.catalog.definition.look.underwater);
    // blend the water's colour across tile corners, so pond, marsh and creek shade into each other
    const vColor = (vx, vy) => {
      const out = [0, 0, 0, 0]; let n = 0;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const tx = vx - X0 + dx, ty = vy - Y0 + dy;
        if (tx < 0 || ty < 0 || tx >= TW || ty >= TH) continue;
        const k = ty * TW + tx;
        if (level[k] !== level[k]) continue;
        const c = COL[kind[k]];
        for (let e = 0; e < 4; e++) out[e] += c[e];
        n++;
      }
      return n ? out.map(v => v / n) : COL[T.POND];
    };
    const tiles = [];
    for (let k = 0; k < TW * TH; k++) if (level[k] === level[k]) tiles.push(k);
    const pos = new Float32Array(tiles.length * 18), col = new Float32Array(tiles.length * 24), nor = new Float32Array(tiles.length * 18);
    const dep = new Float32Array(tiles.length * 6), flow = new Float32Array(tiles.length * 12), bend = new Float32Array(tiles.length * 6);
    const moving = k => kind[k] === T.CREEK || kind[k] === T.RIVER;
    const wetAt = (tx, ty) => tx >= 0 && ty >= 0 && tx < TW && ty < TH && wet[ty * TW + tx] && moving(ty * TW + tx);
    const tileFlow = new Float32Array(TW * TH * 2), tileBend = new Float32Array(TW * TH);
    // Which way the water runs: downstream along the channel network, so a creek flows into the
    // river it joins and the river runs on past the mouth (no eddy at the confluence). Each
    // connected stretch of creek and river drains out of the side of the view where its bed is
    // lowest; the distance back from that exit, through the channel, gives every tile a
    // downstream direction, which is then smoothed so bends and junctions turn gradually.
    {
      const dist = new Int32Array(TW * TH).fill(-1), comp = new Int32Array(TW * TH).fill(-1);
      const bedOf = k => Math.min(...w.corners((k % TW) + X0, Math.floor(k / TW) + Y0));
      const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const k0 of tiles) {
        if (!moving(k0) || comp[k0] >= 0) continue;
        const members = [k0]; comp[k0] = k0;
        for (let h = 0; h < members.length; h++) {
          const k = members[h], tx = k % TW, ty = (k / TW) | 0;
          for (const [dx, dy] of N4) if (wetAt(tx + dx, ty + dy)) { const n = (ty + dy) * TW + tx + dx; if (comp[n] < 0) { comp[n] = k0; members.push(n); } }
        }
        // the exit: the view's edge where this stretch's bed is lowest (or its lowest tile)
        const side = k => { const tx = k % TW, ty = (k / TW) | 0; return tx === 0 ? 0 : tx === TW - 1 ? 1 : ty === 0 ? 2 : ty === TH - 1 ? 3 : -1; };
        let exitSide = -1, low = Infinity, lowest = members[0];
        for (const k of members) { const b = bedOf(k); if (b < bedOf(lowest)) lowest = k; if (side(k) >= 0 && b < low) { low = b; exitSide = side(k); } }
        const q = exitSide >= 0 ? members.filter(k => side(k) === exitSide) : [lowest];
        for (const k of q) dist[k] = 0;
        for (let h = 0; h < q.length; h++) {
          const k = q[h], tx = k % TW, ty = (k / TW) | 0;
          for (const [dx, dy] of N4) if (wetAt(tx + dx, ty + dy)) { const n = (ty + dy) * TW + tx + dx; if (dist[n] < 0) { dist[n] = dist[k] + 1; q.push(n); } }
        }
      }
      // downhill in that distance field, over all eight neighbours
      let fl = new Float32Array(TW * TH * 2);
      for (const k of tiles) {
        if (!moving(k) || dist[k] < 0) continue;
        const tx = k % TW, ty = (k / TW) | 0;
        let fx = 0, fy = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || !wetAt(tx + dx, ty + dy)) continue;
          const n = (ty + dy) * TW + tx + dx, drop = dist[k] - dist[n];
          if (dist[n] < 0 || !drop) continue;
          const l = Math.hypot(dx, dy); fx += dx / l * drop / l; fy += dy / l * drop / l;
        }
        if (!dist[k]) { // (at the exit itself: straight out of the view)
          const e = (tx === 0 ? [-1, 0] : tx === TW - 1 ? [1, 0] : ty === 0 ? [0, -1] : ty === TH - 1 ? [0, 1] : [0, 0]);
          fx += e[0]; fy += e[1];
        }
        const l = Math.hypot(fx, fy) || 1; fl[k * 2] = fx / l; fl[k * 2 + 1] = fy / l;
      }
      // smooth along the channel so the current turns gradually at bends and mouths
      for (let pass = 0; pass < 3; pass++) {
        const nx = new Float32Array(fl.length);
        for (const k of tiles) {
          if (!moving(k) || !wet[k]) continue;
          const tx = k % TW, ty = (k / TW) | 0;
          let fx = fl[k * 2] * 2, fy = fl[k * 2 + 1] * 2;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && wetAt(tx + dx, ty + dy)) {
            const n = (ty + dy) * TW + tx + dx; fx += fl[n * 2]; fy += fl[n * 2 + 1];
          }
          const l = Math.hypot(fx, fy) || 1; nx[k * 2] = fx / l; nx[k * 2 + 1] = fy / l;
        }
        fl = nx;
      }
      for (const k of tiles) {
        if (!moving(k)) continue;
        const tx = k % TW, ty = (k / TW) | 0, speed = kind[k] === T.CREEK ? 0.7 : 1;
        let fx = fl[k * 2], fy = fl[k * 2 + 1];
        if (!wet[k]) { // (the bank ring: carries on the current of the water beside it)
          fx = fy = 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (wetAt(tx + dx, ty + dy)) { const n = (ty + dy) * TW + tx + dx; fx += fl[n * 2]; fy += fl[n * 2 + 1]; }
          const l = Math.hypot(fx, fy) || 1; fx /= l; fy /= l;
        }
        tileFlow[k * 2] = fx * speed; tileFlow[k * 2 + 1] = fy * speed;
        const h = Number(wetAt(tx - 1, ty)) + Number(wetAt(tx + 1, ty));
        const v = Number(wetAt(tx, ty - 1)) + Number(wetAt(tx, ty + 1));
        tileBend[k] = h && v && h + v <= 3 ? 1 : 0;
      }
    }
    // Shared corner samples avoid visible seams in flow and bend highlights.
    const vertexFlow = new Float32Array((TW + 1) * (TH + 1) * 3);
    for (let vy = 0; vy <= TH; vy++) for (let vx = 0; vx <= TW; vx++) {
      let fx = 0, fy = 0, b = 0, n = 0;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const tx = vx + dx, ty = vy + dy;
        if (tx < 0 || ty < 0 || tx >= TW || ty >= TH) continue;
        const k = ty * TW + tx;
        if (!Number.isFinite(level[k])) continue;
        fx += tileFlow[k * 2]; fy += tileFlow[k * 2 + 1]; b += tileBend[k]; n++;
      }
      const vi = (vy * (TW + 1) + vx) * 3;
      if (n) { vertexFlow[vi] = fx / n; vertexFlow[vi + 1] = fy / n; vertexFlow[vi + 2] = b / n; }
    }
    let o = 0, oc = 0, od = 0;
    for (const k of tiles) {
      const x = (k % TW) + X0, y = Math.floor(k / TW) + Y0;
      for (const [vx, vy] of [[x, y], [x + 1, y + 1], [x + 1, y], [x, y], [x, y + 1], [x + 1, y + 1]]) {
        const c = vColor(vx, vy), lv = managed(k) ? level[k] : vLevel(vx, vy);
        pos[o] = vx; pos[o + 1] = lv * LEVEL; pos[o + 2] = vy; nor[o + 1] = 1; o += 3;
        dep[od] = lv - w.vert(vx, vy);
        const vi = ((vy - Y0) * (TW + 1) + vx - X0) * 3;
        flow[od * 2] = vertexFlow[vi]; flow[od * 2 + 1] = vertexFlow[vi + 1]; bend[od] = vertexFlow[vi + 2]; od++;
        col[oc] = lin(c[0]); col[oc + 1] = lin(c[1]); col[oc + 2] = lin(c[2]); col[oc + 3] = vWet(vx, vy) ? c[3] : 0; oc += 4;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
    g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
    g.setAttribute('aBend', new THREE.BufferAttribute(bend, 1));
    g.setAttribute('aQual', new THREE.BufferAttribute(new Float32Array(od), 1));
    this.water = new THREE.Mesh(g, this.waterMat);
    this.water.renderOrder = 2;
    this.scene.add(this.water);
    this.refreshWaterQuality();
  }

  // How clean the water is at each corner: the simulation's water quality on the tiles around it.
  // Water beyond the property runs moderately clean; the reef's sea is always clear.
  refreshWaterQuality() {
    const a = this.water?.geometry.attributes.aQual;
    if (!a) return;
    const w = this.world, p = this.water.geometry.attributes.position, sea = !!this.catalog.definition.look.underwater;
    for (let v = 0; v < a.count; v++) {
      const vx = Math.round(p.getX(v)), vy = Math.round(p.getZ(v));
      let s = 0, n = 0;
      for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
        const x = vx + dx, y = vy + dy;
        if (!isWater(this.terrainAt(x, y))) continue;
        s += sea ? 1 : w.inb(x, y) ? w.waterQ[w.idx(x, y)] : 0.6; n++;
      }
      a.array[v] = n ? s / n : 0.6;
    }
    a.needsUpdate = true;
  }

  // Floodwater: a shallow, silty sheet over the flooded land in the living-water look. It follows
  // the ground rather than lying level (a flood spreads over the floodplain's slopes), a little
  // deeper where it covers a whole stretch, and dips under the ground at its edges so the
  // waterline follows the land's contours with foam where it meets it, instead of tile squares.
  // It runs downhill, carrying the drifting silt and streaks of the water shader with it.
  buildFlood() {
    this.floodK = this.floodKey();
    const w = this.world;
    if (this.flood) { this.scene.remove(this.flood); this.flood.geometry.dispose(); this.flood = null; }
    const tiles = [];
    for (let i = 0; i < w.n; i++) if (w.flood[i]) tiles.push(i);
    if (!tiles.length) return;
    // how much of the land around a corner is under water (flooded, or the river it rose from)
    const wetTile = (x, y) => w.inb(x, y) && (w.flood[w.idx(x, y)] > 0 || isWater(w.terrain[w.idx(x, y)]));
    const cover = (vx, vy) => Number(wetTile(vx - 1, vy - 1)) + Number(wetTile(vx, vy - 1)) + Number(wetTile(vx - 1, vy)) + Number(wetTile(vx, vy));
    // where it meets the river or creek it rose from, it shades into that water instead of ending in a line
    const wc = this.catalog.definition.look.water, COL = { [T.POND]: wc.pond, [T.CREEK]: wc.creek, [T.RIVER]: wc.river, [T.MARSH]: wc.marsh };
    const beside = (vx, vy) => {
      let n = 0; const c = [0, 0, 0];
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const x = vx + dx, y = vy + dy;
        if (!w.inb(x, y) || !isWater(w.terrain[w.idx(x, y)])) continue;
        const k = COL[w.terrain[w.idx(x, y)]]; c[0] += k[0]; c[1] += k[1]; c[2] += k[2]; n++;
      }
      return n ? { n, c: c.map(e => e / n) } : null;
    };
    const DEPTH = [-0.08, -0.06, 0.05, 0.13, 0.2]; // (in height levels, by how many of the four tiles are wet)
    const vert = (x, y) => w.vert(clamp(x, 0, w.w), clamp(y, 0, w.h));
    const muddy = this.catalog.definition.look.flood || [0.46, 0.41, 0.28, 0.9];
    const n = tiles.length * 6;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 4);
    const dep = new Float32Array(n), flow = new Float32Array(n * 2), bend = new Float32Array(n), qual = new Float32Array(n).fill(0.12);
    let v = 0;
    for (const i of tiles) {
      const x = i % w.w, y = (i / w.w) | 0;
      for (const [vx, vy] of [[x, y], [x + 1, y + 1], [x + 1, y], [x, y], [x, y + 1], [x + 1, y + 1]]) {
        const c = cover(vx, vy), d = DEPTH[c], g = w.vert(vx, vy);
        pos[v * 3] = vx; pos[v * 3 + 1] = (g + d) * LEVEL; pos[v * 3 + 2] = vy; nor[v * 3 + 1] = 1;
        dep[v] = d;
        // downhill, quicker on steeper ground
        let fx = vert(vx - 1, vy) - vert(vx + 1, vy), fy = vert(vx, vy - 1) - vert(vx, vy + 1);
        const l = Math.hypot(fx, fy);
        if (l > 1e-4) { const sp = clamp(l * 2.5, 0.2, 0.8) / l; fx *= sp; fy *= sp; } else fx = fy = 0;
        flow[v * 2] = fx; flow[v * 2 + 1] = fy;
        const near = beside(vx, vy), m = near ? near.n / c : 0, rgb = near ? muddy.map((e, k) => e + (near.c[k] - e) * m) : muddy;
        if (near) qual[v] = 0.12 + 0.5 * m;
        col[v * 4] = lin(rgb[0]); col[v * 4 + 1] = lin(rgb[1]); col[v * 4 + 2] = lin(rgb[2]); col[v * 4 + 3] = c >= 2 ? muddy[3] : 0;
        v++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geo.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
    geo.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
    geo.setAttribute('aBend', new THREE.BufferAttribute(bend, 1));
    geo.setAttribute('aQual', new THREE.BufferAttribute(qual, 1));
    this.flood = new THREE.Mesh(geo, this.floodMat);
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
    if (this.line) { this.scene.remove(this.line); this.line.geometry.dispose(); this.line.material.dispose(); }
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
