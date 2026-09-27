// Fazenda Esperança: a cattle ranch cut out of the rainforest in southern Pará about thirty
// years ago. Signal-grass pasture from fence to fence, a trampled stream dammed into a cattle
// pond, lone Brazil nut trees the law wouldn't let them cut, and a ragged scrap of the legal
// forest reserve in the north-east corner, still touching the real rainforest beyond.

import { World, riverRow, generateHeights } from '../world.js';
import { T, F } from '../config.js';
import { PLANT } from '../data/plants.js';
import { mulberry32, hash2, valueNoise } from '../rng.js';

export function generateRanch(seed = 2024) {
  const w = new World();
  const rng = mulberry32(seed);
  const W = w.w, Hh = w.h;

  const rect = (x0, y0, x1, y1, fn) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (w.inb(x, y)) fn(w.idx(x, y), x, y);
  };
  const open = i => { const t = w.terrain[i]; return t !== T.CREEK && t !== T.RIVER && t !== T.POND && t !== T.ROAD && t !== T.MARSH && w.struct[i] < 0; };
  const set = (i, key, g, years = 0) => w.setPlant(i, PLANT[key], g, years * 120);

  // Base: compacted pasture on poor red soil, wetter toward the river.
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    w.variant[i] = Math.floor(hash2(x, y, 7) * 4);
    w.terrain[i] = T.PASTURE;
    w.soil[i] = 0.14 + valueNoise(x, y, 10, 11) * 0.08;
    w.baseMoist[i] = 0.3 + 0.14 * (y / Hh) + valueNoise(x, y, 12, 5) * 0.12;
    const rt = riverRow(x);
    if (y >= rt) w.terrain[i] = T.RIVER;
    else if (y === rt - 1 && valueNoise(x, 1, 7, 9) > 0.5) w.terrain[i] = T.GRAVEL;   // sandbars
    else if (y >= rt - 5) { w.soil[i] = 0.3; w.baseMoist[i] += 0.1; }
  }

  // The legal reserve: a degraded forest remnant in the north-east, ragged at its edge.
  // (logged over and burned at the edges: mostly young pioneers, with a few old giants left)
  const inReserve = (x, y) => x + (valueNoise(x, y, 9, 61) - 0.5) * 9 > 94 + y * 0.45 && y < 24 + (valueNoise(x, y, 8, 63) - 0.5) * 7;
  rect(80, 0, W - 1, 32, (i, x, y) => {
    if (!inReserve(x, y)) return;
    w.terrain[i] = T.DUFF; w.soil[i] = 0.38 + rng() * 0.1; w.baseMoist[i] += 0.06;
    const r = rng();
    const tree = r < 0.4 ? 'cecropia' : r < 0.66 ? 'inga' : r < 0.72 ? 'fig' : r < 0.76 ? 'mahogany' : r < 0.79 ? 'brazilnut' : r < 0.81 ? 'kapok' : r < 0.84 ? 'ipe' : null;
    const old = tree === 'fig' || tree === 'mahogany' || tree === 'brazilnut' || tree === 'kapok' || tree === 'ipe';
    if (tree) set(i, tree, 0.7 + rng() * 0.3, old ? 40 + rng() * 60 : 5 + rng() * 8);
    const s = rng();
    if (s < 0.3) set(i, 'heliconia', 0.7 + rng() * 0.3);
    else if (s < 0.5) set(i, 'piper', 0.7);
    else if (s < 0.62) set(i, 'psychotria', 0.7);
    if (rng() < 0.5) set(i, rng() < 0.5 ? 'adiantum' : 'calathea', 0.6 + rng() * 0.3);
  });

  // Everything else was pasture: signal grass nearly everywhere, head-high guinea grass in places.
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    if (w.terrain[i] !== T.PASTURE) continue;
    set(i, 'brachiaria', 0.75 + rng() * 0.25);
  }
  const blob = (cx, cy, rx, ry, key, dens, g = 0.7, years = 0) => {
    rect(cx - rx, cy - ry, cx + rx, cy + ry, (i, x, y) => {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d < 1 && rng() < dens * (1.2 - d) && open(i)) set(i, key, g + rng() * (1 - g), years);
    });
  };
  blob(10, 76, 8, 5, 'guinea', 0.9);
  blob(72, 62, 9, 6, 'guinea', 0.85);
  blob(104, 50, 7, 5, 'guinea', 0.8);

  // Ranch headquarters on a gravel yard, with the cattle-fodder leucaena gone wild beside it.
  rect(15, 14, 38, 32, (i, x, y) => { if (valueNoise(x, y, 3, 21) > 0.35) { w.terrain[i] = T.SOIL; w.clearPlants(i); } w.soil[i] = 0.12; }); // trampled red earth
  w.addStructure('house', 18, 18);
  w.addStructure('barn', 26, 16);
  w.addStructure('silo', 33, 18);
  w.addStructure('shed', 20, 27);
  w.addStructure('tractor', 31, 28);
  w.addStructure('tractor', 76, 58);
  blob(40, 34, 5, 4, 'leucaena', 0.7, 0.6, 6);
  blob(8, 22, 4, 3, 'leucaena', 0.6, 0.6, 5);

  // Dirt roads: in from the neighbour's ranch to the yard, and along the river to the old port.
  rect(0, 24, 42, 24, i => { w.terrain[i] = T.ROAD; w.clearPlants(i); });
  rect(0, 76, 64, 76, i => { w.terrain[i] = T.ROAD; w.clearPlants(i); });
  rect(58, 75, 63, 77, i => { if (w.terrain[i] !== T.ROAD) { w.terrain[i] = T.GRAVEL; w.clearPlants(i); } });

  // The igarapé: a stream meandering down from the forest to the river, its banks trampled bare.
  const creekX = y => Math.round(52 + Math.sin(y / 9) * 6 + Math.sin(y / 23 + 1) * 4);
  for (let y = 0; y < Hh; y++) {
    const x = creekX(y), i = w.idx(x, y);
    if (w.terrain[i] === T.RIVER) break;
    w.terrain[i] = T.CREEK; w.clearPlants(i);
    // bridge the meander so the channel stays connected
    const nx = creekX(y + 1);
    for (let xx = Math.min(x, nx); xx <= Math.max(x, nx); xx++) { const j = w.idx(xx, y); if (w.terrain[j] !== T.RIVER) { w.terrain[j] = T.CREEK; w.clearPlants(j); } }
    for (const dx of [-1, 1]) {
      const j = w.idx(x + dx, y);
      if (w.inb(x + dx, y) && w.terrain[j] === T.PASTURE && rng() < 0.45) { w.terrain[j] = T.MUD; w.clearPlants(j); }
    }
  }
  // the road culvert: fish can't get up the stream past it
  w.feature[w.idx(creekX(76), 76)] = F.CULVERT;
  // the cattle pond (açude): the stream dammed into a muddy watering hole
  const pcx = creekX(40), pcy = 40;
  rect(pcx - 9, pcy - 6, pcx + 9, pcy + 6, (i, x, y) => {
    const d = ((x - pcx) / 6.5) ** 2 + ((y - pcy) / 4) ** 2;
    if (d <= 1) { w.terrain[i] = T.POND; w.clearPlants(i); }
    else if (d <= 1.9 && w.terrain[i] === T.PASTURE) { w.terrain[i] = T.MUD; w.clearPlants(i); }
  });
  // an old oxbow lagoon cut off on the floodplain, with a few surviving palms
  rect(88, 76, 104, 82, (i, x, y) => {
    const d = ((x - 96) / 6) ** 2 + ((y - 79) / 2.2) ** 2;
    if (d <= 1 && w.terrain[i] !== T.RIVER) { w.terrain[i] = T.MARSH; w.clearPlants(i); if (rng() < 0.4) set(i, rng() < 0.6 ? 'cyperus' : 'waterlily', 0.6); }
  });
  for (const [x, y] of [[88, 79], [104, 80], [92, 82], [100, 76]]) if (w.inb(x, y) && open(w.idx(x, y))) set(w.idx(x, y), 'acai', 0.9, 15);

  // Barbed wire: the boundary and the paddocks.
  const fence = (x, y, gap = 0) => {
    if (!w.inb(x, y)) return;
    const i = w.idx(x, y);
    if (!open(i) || w.feature[i] === F.CULVERT) return;
    if (gap && rng() < gap) return;
    w.feature[i] = F.FENCE;
  };
  for (let x = 0; x < W; x++) fence(x, 0);
  for (let y = 0; y < Hh - 9; y++) { fence(W - 1, y); fence(0, y); }
  const fenceRect = (x0, y0, x1, y1, gap) => {
    for (let x = x0; x <= x1; x++) { fence(x, y0, gap); fence(x, y1, gap); }
    for (let y = y0; y <= y1; y++) { fence(x0, y, gap); fence(x1, y, gap); }
  };
  fenceRect(4, 36, 44, 70, 0.1);
  fenceRect(62, 36, 114, 72, 0.12);
  for (let y = 0; y <= 36; y++) fence(78, y, 0.08); // the line that was supposed to keep cattle out of the reserve

  // Lone Brazil nut trees left standing in the pasture, and the burnt wreckage of the clearing.
  for (const [x, y] of [[40, 50], [66, 54], [82, 46], [12, 58], [96, 62], [60, 16], [28, 62], [110, 70]]) {
    const i = w.idx(x, y);
    if (!open(i)) continue;
    set(i, 'brazilnut', 1, 90);
    w.soil[i] = 0.4;
  }
  for (let k = 0; k < 14; k++) {
    const x = 4 + Math.floor(rng() * (W - 8)), y = 4 + Math.floor(rng() * (Hh - 16)), i = w.idx(x, y);
    if (!open(i) || w.tree[i] || w.feature[i]) continue;
    w.feature[i] = rng() < 0.35 ? F.SNAG : F.LOG;
  }
  // a few native survivors on the riverbank
  for (let x = 66; x < W; x++) {
    const y = riverRow(x) - 2 - Math.floor(rng() * 3), i = w.idx(x, y);
    if (w.inb(x, y) && open(i) && rng() < 0.18) set(i, rng() < 0.6 ? 'cecropia' : 'inga', 0.8, 6);
  }

  generateHeights(w, []);
  for (const st of w.structures) if (st) w.flattenRect(st.x, st.y, st.w, st.h);
  w.hydroDirty = true;
  return w;
}

// The land around the ranch: rainforest north and east, a neighbour's pasture west,
// the river south with flooded forest on the far bank.
export function amazonBorderCell(x, y, r, r2, world) {
  const P = k => PLANT[k].id;
  const rt = riverRow(x);
  if (y >= world.h + 3) {
    const tree = r < 0.55 ? P(r2 < 0.35 ? 'acai' : r2 < 0.55 ? 'cecropia' : r2 < 0.75 ? 'kapok' : r2 < 0.9 ? 'buriti' : 'fig') : 0;
    return { t: y === world.h + 3 ? T.GRAVEL : T.DUFF, tree, g: 0.8 + r2 * 0.2, shrub: r > 0.7 ? P('heliconia') : 0, ground: r > 0.5 ? P('cyperus') : 0 };
  }
  if (y >= rt) return { t: T.RIVER };
  if (x < 0 && y >= 0) {
    // the neighbour's ranch: still pasture, a lone castanheira here and there
    if (x === -2) return { t: T.ROAD };
    const lone = hash2(x, y, 71) < 0.015;
    return { t: T.PASTURE, ground: P('brachiaria'), tree: lone ? P('brazilnut') : 0, g: 0.9, shrub: x === -1 && r < 0.2 ? P('leucaena') : 0 };
  }
  // the rainforest
  const s = r2 < 0.2 ? 'brazilnut' : r2 < 0.34 ? 'kapok' : r2 < 0.5 ? 'mahogany' : r2 < 0.64 ? 'fig' : r2 < 0.76 ? 'ipe' : r2 < 0.88 ? 'inga' : 'cecropia';
  return { t: T.DUFF, tree: r < 0.85 ? P(s) : 0, g: 0.8 + hash2(x, y, 45) * 0.2,
    shrub: r < 0.4 ? P(r2 < 0.5 ? 'heliconia' : 'psychotria') : 0, ground: P(r < 0.5 ? 'adiantum' : 'calathea') };
}
