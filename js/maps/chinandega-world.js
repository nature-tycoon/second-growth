// Finca El Guanacaste: 180 acres on the coastal plain of Chinandega, in northwest Nicaragua, between
// the San Cristóbal volcano and the Pacific. The dry forest here was cleared for cotton in the
// 1950s, then planted to sugarcane. Now the land runs from the burned-over foothills in the north,
// through big blocks of cane cut by haul roads and a quebrada (a seasonal stream), down to a beach
// and the mangroves of the estuary, where shrimp ponds have been dug into the mangrove swamp.

import { World, riverRow, generateHeights } from '../world.js';
import { T, F } from '../config.js';
import { PLANT } from '../data/plants.js';
import { mulberry32, hash2, valueNoise } from '../rng.js';

// the quebrada, down the map from the foothills to the estuary
export const quebradaX = y => Math.round(40 + Math.sin(y / 9) * 4 + Math.sin(y / 23 + 1.2) * 3);
export const ESTUARY_X = 58;    // east of this, the coast is mangrove and estuary; west of it, beach
export const HAUL_ROADS = [30, 52];

export function generateFinca(seed = 1972) {
  const w = new World();
  const rng = mulberry32(seed);
  const W = w.w, Hh = w.h;
  const inb = (x, y) => w.inb(x, y);
  const rect = (x0, y0, x1, y1, fn) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inb(x, y)) fn(w.idx(x, y), x, y); };
  const set = (i, key, g, years = 0) => w.setPlant(i, PLANT[key], g, years * 120);
  const open = i => { const t = w.terrain[i]; return t !== T.CREEK && t !== T.RIVER && t !== T.POND && t !== T.ROAD && t !== T.MARSH && w.struct[i] < 0; };
  const road = i => { w.terrain[i] = T.ROAD; w.clearPlants(i); w.feature[i] = 0; };
  const rr = x => riverRow(x);
  const coast = (x, y) => y >= rr(x) - (x < ESTUARY_X ? 5 : 26 - Math.round(valueNoise(x, 3, 8, 5) * 5)); // the coastal strip

  // Base: old cotton ground, worn thin and dry, grown up in jaragua; damper toward the coast.
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    w.variant[i] = Math.floor(hash2(x, y, 7) * 4);
    w.terrain[i] = T.PASTURE;
    w.soil[i] = 0.05 + valueNoise(x, y, 10, 11) * 0.07;
    w.baseMoist[i] = 0.2 + 0.25 * (y / Hh) + valueNoise(x, y, 12, 5) * 0.1;
    if (y >= rr(x)) { w.terrain[i] = T.RIVER; continue; }
    const r = rng();
    if (r < 0.62) set(i, 'jaragua', 0.6 + rng() * 0.4);
    else if (r < 0.74) set(i, 'guinea', 0.5 + rng() * 0.4);
    else if (r < 0.8) set(i, 'paspalum', 0.3 + rng() * 0.3);
  }

  // The cane: big rectangular blocks from the foothills to the coast, cut by haul roads.
  const blocks = [[4, 14, 34, 28], [46, 14, 82, 28], [88, 12, 116, 28], [4, 33, 34, 50], [46, 33, 76, 50], [82, 33, 116, 50], [4, 55, 30, 62], [66, 55, 100, 58]];
  for (const [x0, y0, x1, y1] of blocks) rect(x0, y0, x1, y1, (i, x, y) => {
    if (coast(x, y) || !open(i)) return;
    w.terrain[i] = T.FIELD; w.clearPlants(i); w.soil[i] = 0.04;
    set(i, 'cane', 0.8 + rng() * 0.2);
  });
  for (const ry of HAUL_ROADS) rect(0, ry, W - 1, ry, road);
  rect(86, 0, 86, HAUL_ROADS[1], road);            // the road up to the foothills
  rect(0, 11, 86, 11, road);                       // along the top of the cane

  // The cooperative's buildings by the haul road, and a cane cart.
  rect(88, 31, 104, 36, (i, x, y) => { if (valueNoise(x, y, 3, 21) > 0.3 && open(i)) { w.terrain[i] = T.SOIL; w.clearPlants(i); } });
  w.addStructure('house', 90, 32);
  w.addStructure('barn', 95, 32);
  w.addStructure('silo', 101, 32);
  w.addStructure('tractor', 99, 36);

  // The quebrada: a seasonal stream from the volcano, straightened along the cane and bare to its
  // banks, with a culvert where the lower haul road crosses it. A few old figs still stand on it.
  for (let y = 0; y < Hh; y++) {
    const x = quebradaX(y), nx = quebradaX(y + 1);
    if (!inb(x, y) || w.terrain[w.idx(x, y)] === T.RIVER) break;
    for (let xx = Math.min(x, nx); xx <= Math.max(x, nx); xx++) { const i = w.idx(xx, y); if (w.terrain[i] !== T.RIVER) { w.terrain[i] = T.CREEK; w.clearPlants(i); w.feature[i] = 0; } }
    for (const dx of [-2, -1, 1, 2]) {
      const i = w.idx(x + dx, y);
      if (!inb(x + dx, y) || !open(i)) continue;
      if (w.terrain[i] === T.FIELD) { w.terrain[i] = T.PASTURE; w.clearPlants(i); set(i, 'guinea', 0.7); }
      if (Math.abs(dx) === 1 && rng() < 0.3) { w.terrain[i] = T.MUD; w.clearPlants(i); }
      else if (rng() < 0.05) set(i, 'chilamate', 0.9, 40);
      else if (rng() < 0.08) set(i, 'castor', 0.7);
    }
  }
  w.feature[w.idx(quebradaX(HAUL_ROADS[1]), HAUL_ROADS[1])] = F.CULVERT;

  // The foothills: burned-over pasture with the last patches of dry forest in the ravines, lone
  // guanacastes and ceibas left for shade, and neem spreading from the old farmhouse.
  const blob = (cx, cy, rx, ry, key, dens, g = 0.7, years = 0) => rect(Math.floor(cx - rx), Math.floor(cy - ry), Math.ceil(cx + rx), Math.ceil(cy + ry), (i, x, y) => {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (d < 1 && rng() < dens * (1.2 - d) && open(i)) set(i, key, g + rng() * (1 - g), years);
  });
  for (const [cx, cy, rx, ry] of [[14, 3, 9, 4], [60, 2, 7, 3], [104, 4, 10, 5]]) {
    blob(cx, cy, rx, ry, 'guacimo', 0.35, 0.7, 12);
    blob(cx, cy, rx, ry, 'jinocuabo', 0.18, 0.7, 20);
    blob(cx, cy, rx * 0.7, ry * 0.7, 'madrono', 0.15, 0.8, 40);
    blob(cx, cy, rx * 0.6, ry * 0.6, 'cortes', 0.1, 0.8, 30);
    blob(cx, cy, rx, ry, 'lantana', 0.2, 0.6);
  }
  blob(76, 6, 5, 3, 'neem', 0.6, 0.6, 8);
  blob(30, 7, 4, 2, 'neem', 0.4, 0.6, 6);
  for (const [x, y, k] of [[8, 40, 'guanacaste'], [70, 42, 'guanacaste'], [26, 20, 'genizaro'], [110, 22, 'ceiba'], [52, 8, 'ceiba'], [62, 38, 'genizaro']]) {
    const i = w.idx(x, y); w.clearPlants(i); w.terrain[i] = T.PASTURE; set(i, k, 1, 80); w.soil[i] = 0.3;
  }
  // an old living fence of madero negro along the upper road, mostly cut out
  for (let x = 2; x < 84; x += 1) { const i = w.idx(x, 12); if (open(i) && rng() < 0.18) set(i, 'madero', 0.8, 10); }

  // The coast. West of the estuary mouth: the beach, backed by scrub and castor. East of it: what's
  // left of the mangroves, cut through by shrimp ponds and their mud dikes, and tidal channels.
  for (let x = 0; x < W; x++) {
    const rt = rr(x);
    for (let y = 0; y < rt; y++) {
      if (!coast(x, y)) continue;
      const i = w.idx(x, y);
      if (!open(i)) continue;
      w.clearPlants(i); w.feature[i] = 0;
      if (x < ESTUARY_X) {
        if (y >= rt - 3) { w.terrain[i] = T.GRAVEL; w.soil[i] = 0.02; if (rng() < 0.03) set(i, 'pescaprae', 0.5); }   // beach sand
        else { w.terrain[i] = T.PASTURE; if (rng() < 0.4) set(i, rng() < 0.5 ? 'guinea' : 'jaragua', 0.7); if (rng() < 0.1) set(i, 'castor', 0.7); if (rng() < 0.04) set(i, 'seagrape', 0.8, 10); }
      } else {
        w.terrain[i] = T.MARSH; w.soil[i] = 0.3; w.baseMoist[i] = 0.95;
        if (rng() < 0.3) set(i, 'leatherfern', 0.7);
      }
    }
  }
  // shrimp ponds, dug into the mangroves: rectangles of standing water inside mud dikes
  const ponds = [[62, 70, 71, 76], [74, 70, 83, 76], [86, 68, 95, 75], [98, 68, 108, 75], [66, 60, 75, 66], [80, 61, 90, 66]];
  for (const [x0, y0, x1, y1] of ponds) rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1, (i, x, y) => {
    if (w.terrain[i] === T.RIVER || w.struct[i] >= 0) return;
    const edge = x < x0 || x > x1 || y < y0 || y > y1;
    w.clearPlants(i); w.feature[i] = 0;
    w.terrain[i] = edge ? T.MUD : T.POND; w.soil[i] = edge ? 0.15 : 0.3;
  });
  // the surviving mangroves: patches along the channels and the estuary shore
  for (let x = ESTUARY_X; x < W; x++) for (let y = 50; y < rr(x); y++) {
    const i = w.idx(x, y);
    if (w.terrain[i] !== T.MARSH) continue;
    const nearSea = rr(x) - y <= 3, patch = valueNoise(x, y, 7, 61) > 0.55;
    if ((nearSea || patch) && rng() < 0.55) set(i, rng() < 0.6 ? 'redmangrove' : rng() < 0.5 ? 'blackmangrove' : 'whitemangrove', 0.7 + rng() * 0.3, 20);
  }
  // tidal channels winding through the mangroves to the estuary
  for (const x0 of [64, 97, 113]) {
    let x = x0;
    for (let y = 52; y < Hh; y++) {
      x += Math.round((valueNoise(x, y, 5, 81) - 0.5) * 2);
      const i = w.idx(x, y);
      if (!inb(x, y) || w.terrain[i] === T.RIVER) break;
      if (w.terrain[i] === T.MARSH || w.terrain[i] === T.PASTURE || w.terrain[i] === T.MUD) { w.terrain[i] = T.CREEK; w.clearPlants(i); }
    }
  }
  // the beach track, and a couple of snags and logs
  rect(10, rr(10) - 5, ESTUARY_X - 4, rr(10) - 5, i => { if (open(i) && w.terrain[i] !== T.GRAVEL) road(i); });
  rect(20, HAUL_ROADS[1] + 1, 20, rr(20) - 6, road);
  for (let k = 0; k < 8; k++) { const x = 4 + Math.floor(rng() * (W - 8)), y = 2 + Math.floor(rng() * 60), i = w.idx(x, y); if (inb(x, y) && open(i) && !w.tree[i] && w.terrain[i] !== T.FIELD) w.feature[i] = rng() < 0.5 ? F.SNAG : F.LOG; }

  generateHeights(w, blocks);
  // the land climbs toward San Cristóbal in the north
  for (let y = -14; y <= 16; y++) for (let x = -14; x <= W + 14; x++) w.setVert(x, y, w.vert(x, y) + Math.max(0, (16 - y) / 16) ** 1.6 * 3.2);
  for (const st of w.structures) if (st) w.flattenRect(st.x, st.y, st.w, st.h);
  w.heightDirty = true;
  w.hydroDirty = true;
  return w;
}

// Around the finca: the forested slopes of San Cristóbal to the north, more cane to the west and
// east, and across the estuary a sandbar beach with the Pacific beyond.
export function chinandegaBorderCell(x, y, r, r2, world) {
  const P = k => PLANT[k].id;
  const rt = riverRow(x);
  if (y >= world.h + 3) return { t: T.GRAVEL, shrub: r < 0.12 ? P('seagrape') : 0, g: 0.9, ground: r2 < 0.25 ? P('pescaprae') : 0 };
  if (y >= rt) return { t: T.RIVER };
  if (y < 0) {
    const tree = r < 0.55 ? P(r2 < 0.25 ? 'guanacaste' : r2 < 0.45 ? 'guacimo' : r2 < 0.6 ? 'madrono' : r2 < 0.72 ? 'ceiba' : r2 < 0.86 ? 'jinocuabo' : 'cortes') : 0;
    return { t: T.PASTURE, tree, g: 0.85 + hash2(x, y, 45) * 0.15, shrub: r > 0.75 ? P(r2 < 0.5 ? 'lantana' : 'hamelia') : 0, ground: P(r2 < 0.5 ? 'jaragua' : 'paspalum') };
  }
  if (x >= world.w && y > rt - 24) {
    const tree = r < 0.6 ? P(r2 < 0.6 ? 'redmangrove' : r2 < 0.8 ? 'blackmangrove' : 'whitemangrove') : 0;
    return { t: T.MARSH, tree, g: 0.8 + r2 * 0.2 };
  }
  if (Math.abs(y - 30) < 1 || Math.abs(y - 52) < 1) return { t: T.ROAD };
  return { t: T.FIELD, ground: P('cane'), g: 0.9, tree: hash2(x, y, 73) < 0.01 ? P('guanacaste') : 0 };
}
