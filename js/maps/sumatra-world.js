// Kebun Tualang: an oil palm estate cut out of the lowland rainforest on the edge of the Leuser
// Ecosystem in North Sumatra about twenty-five years ago. Palms in rows from fence to fence, an
// estate road grid, a stream planted right up to its banks, and in the south a peat swamp that
// was drained with straight canals so palms could grow on it. A fire got into the dry peat in a
// haze year and left a scar of alang-alang. Only a steep ravine in the north-east was never
// planted, and one old tualang tree was spared for its honey.

import { World, riverRow, generateHeights } from '../world.js';
import { T, F } from '../config.js';
import { PLANT } from '../data/plants.js';
import { mulberry32, hash2, valueNoise } from '../rng.js';

// The edge of the peat: north of it is mineral soil on the low hills, south of it deep peat.
export const peatTop = x => 52 + Math.round(Math.sin(x / 13) * 2.5 + Math.sin(x / 5 + 1) * 0.8);
let peatMask = null;
export const isPeat = (w, i) => {
  if (!peatMask || peatMask.length !== w.n) {
    peatMask = new Uint8Array(w.n);
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) peatMask[y * w.w + x] = y >= peatTop(x) && y < riverRow(x, w.h) ? 1 : 0;
  }
  return peatMask[i] === 1;
};
// The drainage canals: one collector across the peat on each side of the estate road, and
// straight ditches from it down to the river.
export const COLLECTOR_Y = 57;
export const CANAL_X = [9, 21, 33, 45, 70, 94, 106];
export const ROAD_X = [38, 82];          // the estate's north–south roads
export const MAIN_ROAD_Y = 28;           // the main road in from the village
// the stream, meandering down from the hills (it keeps its old bed through the peat)
export const streamX = y => Math.round(60 + Math.sin(y / 10) * 5 + Math.sin(y / 23 + 2) * 3);

export function generateEstate(seed = 2024) {
  const w = new World();
  const rng = mulberry32(seed);
  const W = w.w, Hh = w.h;
  const rect = (x0, y0, x1, y1, fn) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (w.inb(x, y)) fn(w.idx(x, y), x, y);
  };
  const open = i => { const t = w.terrain[i]; return t !== T.CREEK && t !== T.RIVER && t !== T.POND && t !== T.ROAD && t !== T.MARSH && w.struct[i] < 0; };
  const set = (i, key, g, years = 0) => w.setPlant(i, PLANT[key], g, years * 120);
  const water = (i, t) => { w.terrain[i] = t; w.clearPlants(i); w.feature[i] = 0; };

  // Base: weeded plantation ground on leached red soil in the north, drained peat in the south.
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    w.variant[i] = Math.floor(hash2(x, y, 7) * 4);
    w.terrain[i] = T.PASTURE;
    w.soil[i] = 0.15 + valueNoise(x, y, 10, 11) * 0.08;
    w.baseMoist[i] = 0.34 + 0.08 * (y / Hh) + valueNoise(x, y, 12, 5) * 0.1;
    const rt = riverRow(x);
    if (y >= rt) w.terrain[i] = T.RIVER;
    else if (y === rt - 1 && valueNoise(x, 1, 7, 9) > 0.62) w.terrain[i] = T.MUD;   // muddy peat banks
    else if (y >= peatTop(x)) { w.soil[i] = 0.3 + valueNoise(x, y, 8, 13) * 0.06; w.baseMoist[i] = 0.24 + valueNoise(x, y, 9, 17) * 0.06; } // drained peat: dry on top
  }

  // Estate roads: the main road in from the village, two field roads north–south (the eastern one
  // runs on down through the peat to the old fruit-boat landing on the river).
  rect(0, MAIN_ROAD_Y, W - 1, MAIN_ROAD_Y, i => { w.terrain[i] = T.ROAD; });
  for (const rx of ROAD_X) rect(rx, 2, rx, rx === 82 ? riverRow(rx) - 1 : peatTop(rx) - 1, i => { w.terrain[i] = T.ROAD; });
  rect(80, riverRow(82) - 2, 85, riverRow(82) - 1, i => { if (w.terrain[i] !== T.ROAD && w.terrain[i] !== T.RIVER) w.terrain[i] = T.GRAVEL; });
  rect(39, peatTop(38) - 1, 81, peatTop(38) - 1, i => { w.terrain[i] = T.ROAD; }); // the peat-edge road

  // The stream: down from the hills, under the main road (through a culvert), and across the peat.
  for (let y = 0; y < Hh; y++) {
    const x = streamX(y), i = w.idx(x, y);
    if (w.terrain[i] === T.RIVER) break;
    const nx = streamX(y + 1);
    for (let xx = Math.min(x, nx); xx <= Math.max(x, nx); xx++) { const j = w.idx(xx, y); if (w.terrain[j] !== T.RIVER) water(j, T.CREEK); }
  }
  w.feature[w.idx(streamX(MAIN_ROAD_Y), MAIN_ROAD_Y)] = F.CULVERT;
  w.terrain[w.idx(streamX(MAIN_ROAD_Y), MAIN_ROAD_Y)] = T.CREEK;
  // (the peat-edge road crosses it on a culvert too, but that one is just a log bridge: fish pass)

  // The canals: a collector along the top of the peat on each side of the road, and straight ditches
  // from it to the river. They are what keeps the peat dry.
  for (let x = 6; x <= W - 6; x++) if (x < ROAD_X[1] - 1 || x > ROAD_X[1] + 1) water(w.idx(x, COLLECTOR_Y), T.CREEK);
  for (const cx of CANAL_X) for (let y = COLLECTOR_Y; y < riverRow(cx); y++) water(w.idx(cx, y), T.CREEK);

  // Estate office, fertiliser store, water tower, the loading ramp by the road and an old fruit truck.
  rect(4, 17, 31, 27, (i, x, y) => { if (valueNoise(x, y, 3, 21) > 0.4) w.terrain[i] = T.SOIL; w.soil[i] = 0.1; });
  w.addStructure('house', 8, 20);
  w.addStructure('barn', 15, 18);
  w.addStructure('silo', 23, 20);
  w.addStructure('shed', 27, 24);
  w.addStructure('tractor', 33, 30);
  w.addStructure('tractor', 84, 70);

  // The north-east ravine: too steep to plant, so a scrap of the old forest is still there.
  const ravine = (x, y) => {
    const cx = 104 + Math.sin(y / 5) * 2, d = Math.abs(x - cx);
    return y < 20 && d < 9 - y * 0.25 && x > 92;
  };
  // The burn scar: a fire got into the dry peat in the 2015 haze and killed the palms.
  const scar = (x, y) => ((x - 26) / 10) ** 2 + ((y - 70) / 6) ** 2 + (valueNoise(x, y, 4, 61) - 0.5) * 0.6 < 1;
  // An old lake on the peat that the canals never quite drained.
  const LAKE = [100, 72];
  rect(LAKE[0] - 9, LAKE[1] - 6, LAKE[0] + 9, LAKE[1] + 6, (i, x, y) => {
    const d = ((x - LAKE[0]) / 6) ** 2 + ((y - LAKE[1]) / 3.6) ** 2 + (valueNoise(x, y, 3, 71) - 0.5) * 0.4;
    if (w.terrain[i] === T.CREEK || w.terrain[i] === T.RIVER || w.terrain[i] === T.ROAD) return;
    if (d <= 1) water(i, T.POND);
    else if (d <= 1.9) { water(i, T.MARSH); if (rng() < 0.5) set(i, rng() < 0.6 ? 'purun' : 'lotus', 0.7); }
  });

  // The palms: triangular rows three tiles apart, across everything that could be planted. Most
  // went in twenty-five years ago; the east block was replanted ten years ago.
  for (let r = 0; ; r++) {
    const y = 1 + r * 3;
    if (y >= Hh) break;
    for (let x = 1 + (r % 2 ? 2 : 0); x < W - 1; x += 3) {
      if (!w.inb(x, y) || y >= riverRow(x) - 1) continue;
      const i = w.idx(x, y);
      if (!open(i) || w.terrain[i] === T.SOIL || ravine(x, y) || scar(x, y)) continue;
      if (Math.abs(x - LAKE[0]) < 11 && Math.abs(y - LAKE[1]) < 7) continue;
      if (rng() < 0.04) continue; // (a gap where a palm died)
      const young = x > ROAD_X[1] && y < peatTop(x);
      set(i, 'oilpalm', young ? 0.82 + rng() * 0.08 : 1, young ? 10 : 24 + Math.floor(rng() * 3));
    }
  }
  // Weeds carpet the ground between the rows; mile-a-minute along the edges and roads.
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    if (!open(i) || w.terrain[i] === T.SOIL || w.terrain[i] === T.GRAVEL || ravine(x, y)) continue;
    if (scar(x, y)) {
      set(i, rng() < 0.75 ? 'alang' : 'resam', 0.75 + rng() * 0.25);
      if (rng() < 0.12) set(i, 'chromolaena', 0.6 + rng() * 0.3, 3);
      else if (rng() < 0.05) set(i, 'acacia', 0.5 + rng() * 0.3, 6);
      continue;
    }
    const edge = Math.min(Math.abs(y - MAIN_ROAD_Y), ...ROAD_X.map(rx => Math.abs(x - rx)), x, W - 1 - x, y) <= 1;
    const r = rng();
    if (edge && r < 0.6) set(i, 'mikania', 0.6 + rng() * 0.4);
    else if (y >= peatTop(x) && r < 0.18) set(i, 'resam', 0.5 + rng() * 0.4);
    else if (r < 0.82) set(i, 'asystasia', 0.5 + rng() * 0.45);
    if (edge && rng() < 0.12) set(i, 'clidemia', 0.6 + rng() * 0.3, 3);
  }
  // pruned fronds stacked between the rows in the older blocks
  for (let r = 0; r * 3 + 2 < Hh; r += 2) {
    const y = r * 3 + 2;
    for (let x = 2; x < W - 2; x += 3) {
      if (!w.inb(x, y) || !(x < ROAD_X[1]) || rng() < 0.55) continue;
      const i = w.idx(x, y);
      if (open(i) && !w.tree[i] && !w.feature[i] && w.terrain[i] === T.PASTURE && !scar(x, y) && !ravine(x, y)) { w.feature[i] = F.BRUSH; w.featureAge[i] = rng() * 360; }
    }
  }
  // dead palms standing in the burn scar
  for (let y = 60; y < 80; y++) for (let x = 14; x < 40; x++) {
    const i = w.idx(x, y);
    if (scar(x, y) && open(i) && !w.tree[i] && (y - 1) % 3 === 0 && (x % 3 === 1 || x % 3 === 0) && rng() < 0.3) { w.feature[i] = rng() < 0.7 ? F.SNAG : F.LOG; w.featureAge[i] = 1200; }
  }

  // The ravine forest.
  rect(92, 0, W - 1, 20, (i, x, y) => {
    if (!ravine(x, y) || !open(i)) return;
    w.clearPlants(i); w.terrain[i] = T.DUFF; w.soil[i] = 0.5; w.baseMoist[i] += 0.08;
    const r = rng();
    if (r < 0.62) {
      const s = rng();
      set(i, s < 0.18 ? 'meranti' : s < 0.3 ? 'keruing' : s < 0.45 ? 'fig' : s < 0.6 ? 'terap' : s < 0.7 ? 'durian' : 'macaranga', 0.85 + rng() * 0.15, 30 + rng() * 40);
    }
    if (rng() < 0.45) set(i, rng() < 0.5 ? 'rattan' : rng() < 0.6 ? 'ginger' : 'ixora', 0.7 + rng() * 0.3);
    if (rng() < 0.5) set(i, 'kelakai', 0.7);
    if (x > 101 && x < 106 && y > 3 && y < 8 && rng() < 0.2) set(i, 'titan', 0.9, 8);
  });
  // The old tualang, spared for its honey, and a fig the birds planted beside it.
  { const i = w.idx(52, 41); w.clearPlants(i); w.terrain[i] = T.DUFF; set(i, 'tualang', 1, 90); w.soil[i] = 0.4;
    const j = w.idx(54, 43); if (open(j)) { w.clearPlants(j); set(j, 'fig', 0.9, 30); } }
  // A few native survivors along the river bank, and swamp palms round the lake.
  for (let x = 2; x < W - 2; x++) {
    const y = riverRow(x) - 2 - Math.floor(rng() * 2), i = w.idx(x, y);
    if (w.inb(x, y) && open(i) && !w.tree[i] && rng() < 0.14) set(i, rng() < 0.5 ? 'nibung' : 'macaranga', 0.8, 8);
    else if (w.inb(x, y) && open(i) && rng() < 0.12) set(i, 'pandan', 0.7, 4);
  }
  for (const [x, y] of [[92, 70], [108, 73], [96, 76], [104, 67], [94, 66]]) { const i = w.idx(x, y); if (open(i) && !w.tree[i]) set(i, 'nibung', 0.9, 20); }

  // The elephant fence: an electric fence along the north and east boundary, to keep the herds
  // that used to walk through here out of the palms.
  for (let x = 0; x < W; x++) { const i = w.idx(x, 0); if (open(i)) w.feature[i] = F.FENCE; }
  for (let y = 0; y < peatTop(W - 1); y++) { const i = w.idx(W - 1, y); if (open(i)) w.feature[i] = F.FENCE; }

  // the peat lies flat and low; the hills behind roll
  generateHeights(w, [[0, 48, W - 1, Hh - 1]]);
  for (const st of w.structures) if (st) w.flattenRect(st.x, st.y, st.w, st.h);
  w.hydroDirty = true;
  return w;
}

// The land around the estate: the Leuser rainforest north and east (peat swamp forest in the
// south-east), the village's smallholder palms west, and the river south with swamp forest on
// the far bank.
export function sumatraBorderCell(x, y, r, r2, world) {
  const P = k => PLANT[k].id;
  const rt = riverRow(x);
  if (y >= world.h + 3) {
    const tree = r < 0.6 ? P(r2 < 0.35 ? 'jelutong' : r2 < 0.6 ? 'nibung' : r2 < 0.8 ? 'fig' : 'macaranga') : 0;
    return { t: y === world.h + 3 ? T.MUD : T.DUFF, tree, g: 0.8 + r2 * 0.2, shrub: r > 0.65 ? P('pandan') : 0, ground: r > 0.4 ? P('kelakai') : 0 };
  }
  if (y >= rt) return { t: T.RIVER };
  if (x < 0 && y >= 0) {
    // the village's smallholdings: more oil palm, in rows
    if (x === -2) return { t: T.ROAD };
    const palm = (y % 3 === 1) && ((x + (Math.floor(y / 3) % 2 ? 2 : 0)) % 3 === 0);
    return { t: T.PASTURE, ground: P('asystasia'), tree: palm ? P('oilpalm') : 0, g: 0.95, shrub: x === -1 && r < 0.25 ? P('clidemia') : 0 };
  }
  // peat swamp forest beside the estate's peat, rainforest everywhere else
  if (x >= world.w && y >= peatTop(world.w - 1)) {
    const s = r2 < 0.35 ? 'jelutong' : r2 < 0.55 ? 'nibung' : r2 < 0.75 ? 'fig' : r2 < 0.9 ? 'meranti' : 'macaranga';
    return { t: T.DUFF, tree: r < 0.82 ? P(s) : 0, g: 0.8 + hash2(x, y, 45) * 0.2, shrub: r > 0.6 ? P('pandan') : 0, ground: P(r < 0.6 ? 'kelakai' : 'nepenthes') };
  }
  const s = r2 < 0.2 ? 'meranti' : r2 < 0.34 ? 'keruing' : r2 < 0.46 ? 'fig' : r2 < 0.56 ? 'durian' : r2 < 0.64 ? 'tualang' : r2 < 0.8 ? 'terap' : 'macaranga';
  return { t: T.DUFF, tree: r < 0.86 ? P(s) : 0, g: 0.8 + hash2(x, y, 45) * 0.2,
    shrub: r < 0.42 ? P(r2 < 0.4 ? 'rattan' : r2 < 0.7 ? 'ginger' : 'ixora') : 0, ground: hash2(x, y, 77) < 0.01 ? P('titan') : r < 0.5 ? P('kelakai') : 0 };
}
