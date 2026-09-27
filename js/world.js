// The map: typed arrays per tile, plus generation of the starting farm and the
// decorative surroundings (forest to the north and east, river to the south, road west).

import { MAP_W, MAP_H, BORDER, T, F, isWater, clamp } from './config.js';
import { PLANT } from './data/plants.js';
import { mulberry32, hash2, valueNoise } from './rng.js';

export const STRUCTURES = {
  // farm buildings can be torn down, and rebuilt later (bats, owls and swallows roost in them)
  house:   { name: 'Farmhouse', w: 3, h: 2, removeCost: 4000, salvage: 0, build: 9000 },
  barn:    { name: 'Barn', w: 4, h: 3, removeCost: 5000, salvage: 1500, build: 7000 },
  silo:    { name: 'Silo', w: 2, h: 2, removeCost: 2500, salvage: 800, build: 3500 },
  shed:    { name: 'Equipment shed', w: 2, h: 2, removeCost: 1200, salvage: 300, build: 2200 },
  tractor: { name: 'Abandoned tractor', w: 1, h: 1, removeCost: 300, salvage: 900 },
  // visitor facilities the player can build
  parking: { name: 'Trailhead parking', w: 2, h: 2, removeCost: 300, salvage: 0, build: 3500, visitor: true },
  center:  { name: 'Visitor center', w: 3, h: 2, removeCost: 1000, salvage: 0, build: 12000, visitor: true },
};

// The river's northern edge, shared by the map and the decorative surroundings.
export const riverRow = x => MAP_H - 6 + Math.round(valueNoise(x, 0, 13, 3) * 2.4 - 1.2);

export class World {
  constructor(w = MAP_W, h = MAP_H) {
    this.w = w; this.h = h; const n = this.n = w * h;
    const u8 = () => new Uint8Array(n), f32 = () => new Float32Array(n);
    this.terrain = u8(); this.baseMoist = f32(); this.moist = f32(); this.soil = f32();
    this.ground = u8(); this.groundG = f32();
    this.shrub = u8(); this.shrubG = f32();
    this.tree = u8(); this.treeG = f32(); this.treeAge = f32();
    this.feature = u8(); this.featureAge = f32();
    this.struct = new Int16Array(n).fill(-1);
    this.structures = [];
    this.variant = u8();
    // derived
    this.canopy = f32(); this.nbCanopy = f32(); this.habitat = u8(); this.connected = u8();
    this.distWater = u8(); this.distPond = u8(); this.distCover = u8(); this.distForest = u8();
    this.distPerch = u8(); this.distSnag = u8(); this.distLog = u8(); this.distWoody = u8();
    this.distNest = u8(); this.distRocks = u8();
    this.nectar = f32(); this.berries = f32(); this.graze = f32(); this.browse = f32();
    this.insects = f32(); this.waterQ = f32(); this.conifer = u8();
    // terrain height at tile corners, covering the surroundings too
    this.VW = w + BORDER * 2 + 1; this.VH = h + BORDER * 2 + 1;
    this.vh = new Float32Array(this.VW * this.VH);
    this.elevMoist = f32();
    // events and visitors
    this.flood = u8(); this.fire = u8(); this.scorch = f32();
    this.distTrail = u8(); this.disturb = f32();
    this.hydroDirty = true;
    this.heightDirty = true; this.hv = (this.hv || 0) + 1;
    this.renderDirty = true;
    this.stats = {};
  }
  idx(x, y) { return y * this.w + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  // ---- heights (x, y are corner coordinates; the map's corners run 0..w, 0..h)
  vi(x, y) {
    const vx = clamp(x + BORDER, 0, this.VW - 1), vy = clamp(y + BORDER, 0, this.VH - 1);
    return vy * this.VW + vx;
  }
  vert(x, y) { return this.vh[this.vi(x, y)]; }
  setVert(x, y, h) { this.vh[this.vi(x, y)] = h; }
  corners(x, y) { return [this.vert(x, y), this.vert(x + 1, y), this.vert(x + 1, y + 1), this.vert(x, y + 1)]; }
  tileH(x, y) { const c = this.corners(x, y); return (c[0] + c[1] + c[2] + c[3]) / 4; }
  heightAt(fx, fy) {
    const x = Math.floor(fx), y = Math.floor(fy), tx = fx - x, ty = fy - y;
    const a = this.vert(x, y), b = this.vert(x + 1, y), c = this.vert(x, y + 1), d = this.vert(x + 1, y + 1);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
  // Lower a tile so water sits in it. Only ever lowers.
  carve(x, y, depth) {
    // measure from the highest corner, so digging next to existing water doesn't compound
    const c = this.corners(x, y);
    const target = Math.max(...c) - depth - 0.15;
    for (const [dx, dy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) this.setVert(x + dx, y + dy, Math.min(this.vert(x + dx, y + dy), target));
    this.heightDirty = true; this.hv = (this.hv || 0) + 1;
  }
  // Bring a filled-in tile back up to the level of the land around it.
  raiseToSurroundings(x, y) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (!this.inb(xx, yy) || isWater(this.terrain[this.idx(xx, yy)])) continue;
      s += this.tileH(xx, yy); n++;
    }
    if (!n) return;
    const target = s / n;
    for (const [dx, dy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) this.setVert(x + dx, y + dy, Math.max(this.vert(x + dx, y + dy), target));
    this.heightDirty = true; this.hv = (this.hv || 0) + 1;
  }
  shiftTile(x, y, amt) {
    for (const [dx, dy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) this.setVert(x + dx, y + dy, clamp(this.vert(x + dx, y + dy) + amt / 2, -1.5, 14));
    this.heightDirty = true; this.hv = (this.hv || 0) + 1;
  }
  flattenRect(x, y, wd, hd) {
    let s = 0, n = 0;
    for (let yy = y; yy <= y + hd; yy++) for (let xx = x; xx <= x + wd; xx++) { s += this.vert(xx, yy); n++; }
    const m = s / n;
    for (let yy = y; yy <= y + hd; yy++) for (let xx = x; xx <= x + wd; xx++) this.setVert(xx, yy, m);
    this.heightDirty = true; this.hv = (this.hv || 0) + 1;
  }

  clearPlants(i) {
    this.ground[i] = 0; this.groundG[i] = 0;
    this.shrub[i] = 0; this.shrubG[i] = 0;
    this.tree[i] = 0; this.treeG[i] = 0; this.treeAge[i] = 0;
  }

  addStructure(type, x, y) {
    const d = STRUCTURES[type];
    const s = { type, x, y, w: d.w, h: d.h };
    const k = this.structures.length;
    this.structures.push(s);
    for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
      const i = this.idx(xx, yy);
      this.struct[i] = k; this.clearPlants(i); this.feature[i] = 0;
    }
    this.flattenRect(x, y, d.w, d.h);
    return s;
  }

  removeStructure(k) {
    const s = this.structures[k];
    if (!s) return;
    for (let yy = s.y; yy < s.y + s.h; yy++) for (let xx = s.x; xx < s.x + s.w; xx++) {
      const i = this.idx(xx, yy);
      this.struct[i] = -1; this.terrain[i] = T.SOIL;
    }
    this.structures[k] = null;
  }

  setPlant(i, p, g = 0.08, age = 0) {
    if (p.layer === 0) { this.ground[i] = p.id; this.groundG[i] = g; }
    else if (p.layer === 1) { this.shrub[i] = p.id; this.shrubG[i] = g; }
    else { this.tree[i] = p.id; this.treeG[i] = g; this.treeAge[i] = age; }
  }
}

// ---------------------------------------------------------------- Farm generation

export function generateFarm(seed = 1987) {
  const w = new World();
  const rng = mulberry32(seed);
  const W = w.w, Hh = w.h;
  const riverTop = riverRow;

  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    w.variant[i] = Math.floor(hash2(x, y, 7) * 4);
    w.terrain[i] = T.PASTURE;
    w.soil[i] = 0.26 + valueNoise(x, y, 10, 11) * 0.08;
    w.baseMoist[i] = 0.16 + 0.12 * (y / Hh) + valueNoise(x, y, 12, 5) * 0.12;
    const rt = riverTop(x);
    if (y >= rt) w.terrain[i] = T.RIVER;
    else if (y === rt - 1 && valueNoise(x, 1, 7, 9) > 0.55) w.terrain[i] = T.GRAVEL;
    else if (y >= rt - 6) { w.soil[i] = 0.4; w.baseMoist[i] += 0.08; }
  }

  const rect = (x0, y0, x1, y1, fn) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (w.inb(x, y)) fn(w.idx(x, y), x, y);
  };

  // Plowed fields
  const FIELDS = [[6, 40, 45, 67], [60, 52, 114, 76], [76, 4, 114, 22]];
  const field = i => { w.terrain[i] = T.FIELD; w.soil[i] = 0.1 + rng() * 0.05; };
  for (const [x0, y0, x1, y1] of FIELDS) rect(x0, y0, x1, y1, field);

  // Farmstead yard
  rect(15, 14, 40, 33, (i, x, y) => {
    if (valueNoise(x, y, 3, 21) > 0.3) w.terrain[i] = T.GRAVEL;
    w.soil[i] = 0.18;
  });

  // Roads: county access from the west to the farmstead lane, and the river road.
  rect(0, 27, 64, 27, i => { w.terrain[i] = T.ROAD; });
  rect(0, 75, 58, 75, i => { w.terrain[i] = T.ROAD; });
  rect(56, 74, 60, 76, i => { if (w.terrain[i] !== T.ROAD) w.terrain[i] = T.GRAVEL; });

  // The drainage ditch: a straightened creek, runs from a spring in the north to the river.
  const ditch = [];
  for (let y = 1; y <= 45; y++) ditch.push([69, y]);
  for (let x = 68; x >= 54; x--) ditch.push([x, 45]);
  for (let y = 46; y < Hh; y++) ditch.push([54, y]);
  for (const [x, y] of ditch) {
    const i = w.idx(x, y);
    if (w.terrain[i] === T.RIVER) break;
    w.terrain[i] = T.CREEK;
  }
  // Culvert where the river road crosses the ditch: blocks fish passage.
  w.feature[w.idx(54, 75)] = F.CULVERT;

  // Muddy stock pond
  const pcx = 93, pcy = 37;
  rect(84, 30, 102, 45, (i, x, y) => {
    const d = ((x - pcx) / 5.2) ** 2 + ((y - pcy) / 3.4) ** 2;
    if (d <= 1) w.terrain[i] = T.POND;
    else if (d <= 1.8) w.terrain[i] = T.MUD;
  });

  // Structures
  w.addStructure('house', 18, 18);
  w.addStructure('barn', 27, 16);
  w.addStructure('silo', 33, 17);
  w.addStructure('shed', 19, 29);
  w.addStructure('tractor', 32, 30);
  w.addStructure('tractor', 87, 66);

  // Fences
  const fence = (x, y, gap = 0) => {
    if (!w.inb(x, y)) return;
    const i = w.idx(x, y);
    const t = w.terrain[i];
    if (t === T.CREEK || t === T.RIVER || t === T.ROAD || t === T.POND || w.struct[i] >= 0) return;
    if (gap && rng() < gap) return;
    w.feature[i] = F.FENCE;
  };
  for (let x = 0; x < W; x++) fence(x, 0);
  for (let y = 0; y < Hh - 9; y++) fence(W - 1, y);
  for (let y = 0; y < Hh - 9; y++) fence(0, y);
  const fenceRect = (x0, y0, x1, y1, gap) => {
    for (let x = x0; x <= x1; x++) { fence(x, y0, gap); fence(x, y1, gap); }
    for (let y = y0; y <= y1; y++) { fence(x0, y, gap); fence(x1, y, gap); }
  };
  fenceRect(4, 38, 47, 69, 0.12);
  fenceRect(81, 27, 106, 47, 0.15);
  fenceRect(74, 2, 116, 24, 0.2);

  // Remnant trees
  const plant = (key, x, y, g = 1, ageYears = 30) => {
    const i = w.idx(x, y);
    if (w.struct[i] >= 0) return;
    w.setPlant(i, PLANT[key], g, ageYears * 120);
    w.soil[i] = Math.max(w.soil[i], 0.45);
  };
  plant('maple', 25, 24, 1, 70);
  plant('fir', 13, 16, 1, 60);
  plant('fir', 12, 22, 1, 45);
  plant('fir', 16, 12, 1, 50);
  plant('oak', 49, 10, 1, 120);
  plant('oak', 44, 14, 0.8, 60);
  plant('cottonwood', 87, 81, 1, 30);
  plant('cottonwood', 99, 82, 1, 25);
  plant('cottonwood', 104, 81, 0.8, 18);
  w.feature[w.idx(73, 79)] = F.SNAG;

  // Invasives along fences, ditch banks and waste corners
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    const t = w.terrain[i];
    if (t === T.CREEK || t === T.RIVER || t === T.POND || t === T.ROAD || w.struct[i] >= 0) continue;
    let nearDitch = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (w.inb(xx, yy) && w.terrain[w.idx(xx, yy)] === T.CREEK) nearDitch = true;
    }
    if (nearDitch) {
      if (rng() < 0.6) w.setPlant(i, PLANT.canarygrass, 0.7 + rng() * 0.3);
      if (rng() < 0.28) w.setPlant(i, PLANT.blackberry, 0.6 + rng() * 0.4);
    }
    if (w.feature[i] === F.FENCE && x > 0 && y > 0 && x < W - 1 && rng() < 0.3) w.setPlant(i, PLANT.blackberry, 0.5 + rng() * 0.5);
    if (t === T.MUD && rng() < 0.35) w.setPlant(i, PLANT.canarygrass, 0.6);
    const riverBank = y >= riverTop(x) - 4;
    if (riverBank && t !== T.GRAVEL && rng() < 0.35) w.setPlant(i, PLANT.canarygrass, 0.8);
    if (riverBank && rng() < 0.12) w.setPlant(i, PLANT.blackberry, 0.8);
  }
  // Blackberry thickets by the river road and the barn, broom on the dry hill.
  const blob = (cx, cy, rx, ry, key, dens) => {
    rect(cx - rx, cy - ry, cx + rx, cy + ry, (i, x, y) => {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      const t = w.terrain[i];
      if (d < 1 && rng() < dens * (1.2 - d) && w.struct[i] < 0 && t !== T.ROAD && t !== T.CREEK && t !== T.RIVER && t !== T.POND)
        w.setPlant(i, PLANT[key], 0.6 + rng() * 0.4);
    });
  };
  blob(10, 79, 7, 3, 'blackberry', 0.9);
  blob(39, 35, 4, 3, 'blackberry', 0.8);
  blob(58, 10, 7, 6, 'broom', 0.8);
  blob(108, 49, 4, 3, 'blackberry', 0.8);

  // A few native survivors hanging on: a scrappy alder woodlot, willows by the river, a hedgerow.
  blob(60, 34, 4, 3, 'alder', 0.55);
  blob(60, 34, 5, 4, 'salmonberry', 0.35);
  blob(70, 82, 4, 2, 'willow', 0.5);
  blob(6, 30, 3, 3, 'snowberry', 0.5);
  for (let x = 48; x <= 58; x++) if (rng() < 0.45) plant('rose', x, 50, 0.9, 5);

  generateHeights(w, FIELDS);
  for (const st of w.structures) if (st) w.flattenRect(st.x, st.y, st.w, st.h);
  w.hydroDirty = true;
  return w;
}

// Terrain of any tile, including the decorative surroundings.
export function extTerrain(w, x, y) {
  if (w.inb(x, y)) return w.terrain[w.idx(x, y)];
  if (y >= w.h + 3) return y === w.h + 3 ? T.GRAVEL : T.PASTURE;
  if (y >= riverRow(x)) return T.RIVER;
  return T.DUFF;
}

// A valley sloping from the foothills in the north down to the river, with rolling
// pasture, fields the old farmers leveled, and water sitting in its own hollows.
export function generateHeights(w, fields) {
  const B = BORDER;
  const inField = (x, y) => fields.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 + 1 && y >= y0 && y <= y1 + 1);
  for (let y = -B; y <= w.h + B; y++) for (let x = -B; x <= w.w + B; x++) {
    const t = clamp((w.h - 4 - y) / (w.h - 4), 0, 1.4);
    let h = 5.2 * Math.pow(t, 1.15);
    if (y < 0) h += -y * 0.3;
    if (x > w.w) h += (x - w.w) * 0.1;
    if (y > w.h + 3) h = 0.2 + (y - w.h - 3) * 0.3;
    const n = (valueNoise(x + 50, y + 50, 16, 31) - 0.5) * 2.4 + (valueNoise(x + 50, y + 50, 6, 37) - 0.5) * 0.6;
    const nearRiver = clamp((riverRow(x) - 1 - y) / 9, 0, 1);
    h += n * (inField(x, y) ? 0.25 : 1) * (y > w.h + 3 ? 0.5 : nearRiver);
    w.setVert(x, y, h);
  }
  // water tiles sit below their banks
  const pondCorners = [];
  for (let y = -B; y < w.h + B; y++) for (let x = -B; x < w.w + B; x++) {
    const t = extTerrain(w, x, y);
    if (t === T.RIVER) for (const [dx, dy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) w.setVert(x + dx, y + dy, -0.7);
    else if (t === T.CREEK) w.carve(x, y, 0.45);
    else if (t === T.MARSH) w.carve(x, y, 0.2);
    else if (t === T.POND) pondCorners.push([x, y]);
  }
  if (pondCorners.length) {
    let lo = Infinity;
    for (const [x, y] of pondCorners) lo = Math.min(lo, ...w.corners(x, y));
    for (const [x, y] of pondCorners) for (const [dx, dy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) w.setVert(x + dx, y + dy, lo - 0.5);
  }
  w.heightDirty = true;
}

// ---------------------------------------------------------------- Surroundings (render only)

// Hollis farm surroundings: conifer forest north and east, fields and blackberry west, the river south.
export function pnwBorderCell(x, y, r, r2, world) {
  let t = T.DUFF, tree = 0, g = 0, shrub = 0, ground = 0;
  const rt = riverRow(x);
  if (y >= world.h + 3) {
    // far bank of the river
    t = y === world.h + 3 ? T.GRAVEL : T.PASTURE;
    if (y > world.h + 3 && r < 0.45) { tree = r2 < 0.6 ? PLANT.cottonwood.id : PLANT.alder.id; g = 0.8 + r2 * 0.2; }
    if (y > world.h + 3 && r > 0.6) shrub = PLANT.willow.id;
  } else if (y >= rt) {
    t = T.RIVER;
  } else if (x < 0) {
    if (x === -2) t = T.ROAD;
    else if (x === -1) { t = T.PASTURE; if (r < 0.3) shrub = PLANT.blackberry.id; }
    else if (y < 0) { t = T.DUFF; tree = PLANT.fir.id; g = 0.7 + r2 * 0.3; if (r < 0.2) tree = 0; }
    else { t = T.FIELD; if (x === -3 && r < 0.5) shrub = PLANT.blackberry.id; }
  } else if (y < 0) {
    t = T.DUFF;
    if (r < 0.82) {
      const s = r2 < 0.45 ? 'fir' : r2 < 0.75 ? 'hemlock' : r2 < 0.9 ? 'cedar' : 'maple';
      tree = PLANT[s].id; g = 0.75 + hash2(x, y, 45) * 0.25;
    } else shrub = r2 < 0.5 ? PLANT.vinemaple.id : PLANT.salal.id;
    ground = PLANT.swordfern.id;
  } else if (x >= world.w) {
    t = T.DUFF;
    if (r < 0.72) {
      const s = r2 < 0.35 ? 'alder' : r2 < 0.55 ? 'maple' : r2 < 0.85 ? 'fir' : 'cedar';
      tree = PLANT[s].id; g = 0.7 + hash2(x, y, 45) * 0.3;
    } else shrub = r2 < 0.5 ? PLANT.salmonberry.id : PLANT.snowberry.id;
    ground = PLANT.swordfern.id;
  }
  return { t, tree, g, shrub, ground };
}

// The land around the property: forest, neighbours' fields, the river and its far bank.
// Each map supplies cell(x, y, r, r2, world) describing one outside tile.
export class Border {
  constructor(world, cell = pnwBorderCell) {
    this.world = world;
    const B = BORDER, W = world.w + B * 2, Hh = world.h + B * 2;
    this.W = W; this.H = Hh;
    this.terrain = new Uint8Array(W * Hh);
    this.tree = new Uint8Array(W * Hh); this.treeG = new Float32Array(W * Hh);
    this.shrub = new Uint8Array(W * Hh); this.ground = new Uint8Array(W * Hh);
    for (let by = 0; by < Hh; by++) for (let bx = 0; bx < W; bx++) {
      const x = bx - B, y = by - B;
      if (world.inb(x, y)) continue;
      const i = by * W + bx;
      const c = cell(x, y, hash2(x, y, 41), hash2(x, y, 43), world);
      this.terrain[i] = c.t; this.tree[i] = c.tree || 0; this.treeG[i] = c.g || 0; this.shrub[i] = c.shrub || 0; this.ground[i] = c.ground || 0;
    }
  }
  bi(x, y) {
    const bx = x + BORDER, by = y + BORDER;
    if (bx < 0 || by < 0 || bx >= this.W || by >= this.H) return -1;
    return by * this.W + bx;
  }
}
