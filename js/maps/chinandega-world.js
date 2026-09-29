// Finca El Guanacaste: 180 acres on the lower slopes of the San Cristóbal volcano, in Chinandega,
// northwest Nicaragua, running down to the Pacific. The tropical dry forest was cleared for cotton
// in the 1950s and then turned into cattle pasture: paddocks of African jaragua grass behind barbed
// wire, burned every dry season, with a lone guanacaste left here and there for shade. From the
// steep, burned-over slopes in the north, a quebrada (a seasonal stream) runs through the paddocks
// to a long beach and the mangroves of the estuary, where shrimp ponds were dug into the swamp.

import { World, riverRow, generateHeights } from '../world.js';
import { T, F } from '../config.js';
import { PLANT } from '../data/plants.js';
import { mulberry32, hash2, valueNoise } from '../rng.js';

// the quebrada, down the map from the volcano to the estuary
export const quebradaX = y => Math.round(40 + Math.sin(y / 9) * 4 + Math.sin(y / 23 + 1.2) * 3);
export const ESTUARY_X = 58;    // east of this, the coast is mangrove and estuary; west of it, beach
export const SLOPE_Y = 30;      // north of this, the land climbs the volcano
export const BEACH = 7;         // how many rows of sand above the waterline
export const FARM_ROAD = 52;
// San Cristóbal itself: the summit sits just beyond the north edge, so the map shows its south
// half. A stratovolcano's flanks are concave, gentle at the foot and steepening toward a small
// crater, and bare: ash and cinders, with only grass on the lower slopes.
export const VOLCANO = { x: 60, y: -13, R: 24, H: 30, crater: 3.4, depth: 3 };
const coneR = (x, y) => Math.hypot((x - VOLCANO.x) * 0.95, y - VOLCANO.y);
// ribs and gullies down the flanks: 0 in a gully, 1 on a rib
const rib = (x, y) => { const a = Math.atan2(y - VOLCANO.y, x - VOLCANO.x); return 0.5 + 0.5 * Math.sin(a * 11 + Math.sin(a * 5) * 1.5); };
export function volcanoHeight(x, y) {
  const V = VOLCANO, r = coneR(x, y);
  if (r >= V.R) return 0;
  const f = r2 => V.H * (1 - r2 / V.R) ** 2.3;
  if (r < V.crater) return f(V.crater) - V.depth * (1 - (r / V.crater) ** 2);
  const gully = (rib(x, y) - 0.5) * 0.9 * Math.min(1, (r - V.crater) / 3) * Math.min(1, (V.R - r) / 6);
  return f(r) + gully;
}
// the colour of the cone: dark volcanic soil at the foot, grey-brown ash and cinders higher up,
// rust-red scoria at the rim and a dark crater, with the gullies in shadow
export function volcanoTint(x, y, c) {
  const V = VOLCANO, r = coneR(x, y), up = 1 - r / V.R;
  if (up <= 0.28) return null;
  if (r < V.crater) return [0.2, 0.17, 0.15];
  const lerp = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
  // dry grass thinning out at the foot, then bare ash
  const foot = lerp(c, [0.5, 0.47, 0.3], Math.min(1, (up - 0.28) / 0.04));
  let col = lerp(foot, [0.5, 0.46, 0.42], Math.min(1, (up - 0.3) / 0.35));
  if (up > 0.78) col = lerp(col, [0.58, 0.4, 0.3], Math.min(1, (up - 0.78) / 0.12));
  const g = rib(x, y), n = hash2(x, y, 17);
  return col.map(v => v * (0.78 + 0.22 * g) * (0.94 + n * 0.12));
}
// how far up the cone a spot is: 0 at the foot, 1 at the rim
export const volcanoUp = (x, y) => Math.max(0, 1 - coneR(x, y) / VOLCANO.R);

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
  const coast = (x, y) => y >= rr(x) - (x < ESTUARY_X ? BEACH + 3 : 26 - Math.round(valueNoise(x, 3, 8, 5) * 5));

  // Base: worn-out cattle pasture, jaragua and guinea grass, thin and dry, damper toward the coast.
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    w.variant[i] = Math.floor(hash2(x, y, 7) * 4);
    w.terrain[i] = T.PASTURE;
    // young volcanic ash soil: dark and naturally rich, richest up the slope; only the top layer is worn
    w.soil[i] = 0.3 + valueNoise(x, y, 10, 11) * 0.12 + (y < SLOPE_Y ? 0.1 : 0);
    w.baseMoist[i] = 0.2 + 0.25 * (y / Hh) + valueNoise(x, y, 12, 5) * 0.1;
    if (y >= rr(x)) { w.terrain[i] = T.RIVER; continue; }
    const r = rng();
    if (r < 0.6) set(i, 'jaragua', 0.5 + rng() * 0.5);
    else if (r < 0.75) set(i, 'guinea', 0.5 + rng() * 0.4);
    else if (r < 0.84) set(i, 'paspalum', 0.3 + rng() * 0.3);
    // grazed and burned bare on the steep slopes of the volcano
    if (y < SLOPE_Y && valueNoise(x, y, 7, 91) > 0.62) { w.terrain[i] = T.SOIL; w.clearPlants(i); w.soil[i] = 0.18; } // burned bare, but still volcanic soil
  }

  // Roads: the farm road across the lower paddocks, a track up the slope, and the lane to the beach.
  rect(0, FARM_ROAD, W - 1, FARM_ROAD, road);
  rect(86, 12, 86, FARM_ROAD, road);
  rect(20, FARM_ROAD + 1, 20, rr(20) - BEACH - 2, road);

  // The farmyard: the cooperative house, the corral and milking shed, a water tank, an ox cart.
  rect(88, 45, 106, 51, (i, x, y) => { if (valueNoise(x, y, 3, 21) > 0.3 && open(i)) { w.terrain[i] = T.SOIL; w.clearPlants(i); w.soil[i] = 0.15; } }); // trampled round the corral
  w.addStructure('house', 90, 46);
  w.addStructure('barn', 95, 46);
  w.addStructure('silo', 101, 46);
  w.addStructure('tractor', 99, 50);

  // Paddocks: barbed wire in a grid across the pasture, the way the cattle are rotated.
  const fence = (x, y) => { if (!inb(x, y)) return; const i = w.idx(x, y); if (open(i)) w.feature[i] = F.FENCE; };
  for (const fx of [24, 58, 100]) for (let y = SLOPE_Y - 6; y < FARM_ROAD; y++) if (rng() > 0.04) fence(fx, y);
  for (const fy of [SLOPE_Y - 6, 41]) for (let x = 2; x < W - 2; x++) if (rng() > 0.04) fence(x, fy);
  for (let x = 2; x < W - 2; x++) if (rng() > 0.05) fence(x, FARM_ROAD + 1);

  // The quebrada: a seasonal stream off the volcano, cut into a ravine up on the slope and bare to
  // its banks down in the pasture, with a culvert under the farm road. A few old figs remain.
  for (let y = 0; y < Hh; y++) {
    const x = quebradaX(y), nx = quebradaX(y + 1);
    if (!inb(x, y) || w.terrain[w.idx(x, y)] === T.RIVER) break;
    for (let xx = Math.min(x, nx); xx <= Math.max(x, nx); xx++) { const i = w.idx(xx, y); if (w.terrain[i] !== T.RIVER) { w.terrain[i] = T.CREEK; w.clearPlants(i); w.feature[i] = 0; } }
    for (const dx of [-2, -1, 1, 2]) {
      const i = w.idx(x + dx, y);
      if (!inb(x + dx, y) || !open(i)) continue;
      if (w.feature[i] === F.FENCE) w.feature[i] = 0;
      if (Math.abs(dx) === 1 && rng() < 0.3) { w.terrain[i] = T.MUD; w.clearPlants(i); }
      else if (rng() < (y < SLOPE_Y ? 0.25 : 0.05)) set(i, 'chilamate', 0.9, 40);      // the ravine keeps its figs
      else if (rng() < 0.08) set(i, 'castor', 0.7);
    }
  }
  w.feature[w.idx(quebradaX(FARM_ROAD), FARM_ROAD)] = F.CULVERT;

  // The volcano slopes: the last dry forest clings to the ravines and the steepest ground, with
  // neem spreading from an old homestead; lone guanacastes and genízaros shade the paddocks below.
  const blob = (cx, cy, rx, ry, key, dens, g = 0.7, years = 0) => rect(Math.floor(cx - rx), Math.floor(cy - ry), Math.ceil(cx + rx), Math.ceil(cy + ry), (i, x, y) => {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (d < 1 && rng() < dens * (1.2 - d) && open(i) && w.terrain[i] !== T.GRAVEL) set(i, key, g + rng() * (1 - g), years);
  });
  for (const [cx, cy, rx, ry] of [[12, 6, 10, 6], [40, 6, 7, 4], [106, 9, 11, 7], [82, 20, 6, 4]]) {
    blob(cx, cy, rx, ry, 'guacimo', 0.35, 0.7, 12);
    blob(cx, cy, rx, ry, 'jinocuabo', 0.2, 0.7, 20);
    blob(cx, cy, rx * 0.7, ry * 0.7, 'madrono', 0.16, 0.8, 40);
    blob(cx, cy, rx * 0.6, ry * 0.6, 'cortes', 0.12, 0.8, 30);
    blob(cx, cy, rx, ry, 'lantana', 0.2, 0.6);
  }
  blob(30, 16, 5, 3, 'neem', 0.6, 0.6, 8);
  blob(96, 30, 4, 3, 'neem', 0.5, 0.6, 6);
  for (const [x, y, k] of [[10, 38, 'guanacaste'], [70, 36, 'guanacaste'], [30, 46, 'genizaro'], [112, 36, 'ceiba'], [50, 24, 'ceiba'], [62, 46, 'genizaro'], [84, 40, 'guanacaste']]) {
    const i = w.idx(x, y); w.clearPlants(i); w.terrain[i] = T.PASTURE; w.feature[i] = 0; set(i, k, 1, 80); w.soil[i] = 0.3;
  }
  // an old living fence of madero negro along the lane, mostly cut out
  for (let y = FARM_ROAD + 1; y < rr(20) - BEACH - 2; y++) { const i = w.idx(21, y); if (open(i) && rng() < 0.3) set(i, 'madero', 0.8, 10); }

  // The coast. West of the estuary mouth: a long, deep beach backed by scrub and castor. East of it:
  // what's left of the mangroves, cut through by shrimp ponds and their mud dikes, and tidal channels.
  for (let x = 0; x < W; x++) {
    const rt = rr(x);
    for (let y = 0; y < rt; y++) {
      if (!coast(x, y)) continue;
      const i = w.idx(x, y);
      if (!open(i)) continue;
      w.clearPlants(i); w.feature[i] = 0;
      if (x < ESTUARY_X) {
        if (y >= rt - BEACH) { w.terrain[i] = T.GRAVEL; w.soil[i] = 0.02; if (y < rt - 4 && rng() < 0.04) set(i, 'pescaprae', 0.5); } // beach sand
        else { w.terrain[i] = T.PASTURE; if (rng() < 0.4) set(i, rng() < 0.5 ? 'guinea' : 'jaragua', 0.7); if (rng() < 0.1) set(i, 'castor', 0.7); if (rng() < 0.04) set(i, 'seagrape', 0.8, 10); }
      } else {
        w.terrain[i] = T.MARSH; w.soil[i] = 0.3; w.baseMoist[i] = 0.95;
        if (rng() < 0.3) set(i, 'leatherfern', 0.7);
      }
    }
  }
  const ponds = [[62, 70, 71, 76], [74, 70, 83, 76], [86, 68, 95, 75], [98, 68, 108, 75], [66, 60, 75, 66], [80, 61, 90, 66]];
  for (const [x0, y0, x1, y1] of ponds) rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1, (i, x, y) => {
    if (w.terrain[i] === T.RIVER || w.struct[i] >= 0) return;
    const edge = x < x0 || x > x1 || y < y0 || y > y1;
    w.clearPlants(i); w.feature[i] = 0;
    w.terrain[i] = edge ? T.MUD : T.POND; w.soil[i] = edge ? 0.15 : 0.3;
    if (edge) w.feature[i] = F.DIKE;
  });
  for (let x = ESTUARY_X; x < W; x++) for (let y = 50; y < rr(x); y++) {
    const i = w.idx(x, y);
    if (w.terrain[i] !== T.MARSH) continue;
    const nearSea = rr(x) - y <= 3, patch = valueNoise(x, y, 7, 61) > 0.55;
    if ((nearSea || patch) && rng() < 0.55) set(i, rng() < 0.6 ? 'redmangrove' : rng() < 0.5 ? 'blackmangrove' : 'whitemangrove', 0.7 + rng() * 0.3, 20);
  }
  for (const x0 of [64, 97, 113]) {
    let x = x0;
    for (let y = 52; y < Hh; y++) {
      x += Math.round((valueNoise(x, y, 5, 81) - 0.5) * 2);
      const i = w.idx(x, y);
      if (!inb(x, y) || w.terrain[i] === T.RIVER) break;
      if (w.terrain[i] === T.MARSH || w.terrain[i] === T.PASTURE || w.terrain[i] === T.MUD) { w.terrain[i] = T.CREEK; w.clearPlants(i); w.feature[i] = 0; }
    }
  }
  for (let k = 0; k < 8; k++) { const x = 4 + Math.floor(rng() * (W - 8)), y = 2 + Math.floor(rng() * 60), i = w.idx(x, y); if (inb(x, y) && open(i) && !w.tree[i] && !w.feature[i]) w.feature[i] = rng() < 0.5 ? F.SNAG : F.LOG; }

  generateHeights(w, []);
  // San Cristóbal: the land climbs steeply to the north, gently rolling in the paddocks below
  for (let y = -14; y <= SLOPE_Y + 4; y++) for (let x = -14; x <= W + 14; x++) {
    const u = Math.max(0, (SLOPE_Y + 4 - y) / (SLOPE_Y + 18));
    const ridge = 1 + 0.25 * Math.sin(x / 9 + 1) + (valueNoise(x + 40, y, 9, 97) - 0.5) * 0.5;
    w.setVert(x, y, w.vert(x, y) + u ** 1.7 * 5 * ridge + volcanoHeight(x, y));
  }
  for (const st of w.structures) if (st) w.flattenRect(st.x, st.y, st.w, st.h);
  w.heightDirty = true;
  w.hydroDirty = true;
  return w;
}

// Around the finca: the forested upper slopes of San Cristóbal to the north, the neighbours' cattle
// pasture to the west and east, and across the estuary a sandbar beach with the Pacific beyond.
export function chinandegaBorderCell(x, y, r, r2, world) {
  const P = k => PLANT[k].id;
  const rt = riverRow(x);
  if (y >= world.h + 3) return { t: T.GRAVEL, shrub: r < 0.12 ? P('seagrape') : 0, g: 0.9, ground: r2 < 0.25 ? P('pescaprae') : 0 };
  if (y >= rt) return { t: T.RIVER };
  if (y < 0 && volcanoUp(x, y) > 0.28) {
    // the cone: bare volcanic soil, a little grass low down, nothing growing near the top
    const up = volcanoUp(x, y);
    return { t: up > 0.9 ? T.MUD : T.SOIL, shrub: up < 0.36 && r > 0.9 ? P('lantana') : 0, g: 0.8 };
  }
  if (y < 0) {
    const tree = r < 0.5 ? P(r2 < 0.25 ? 'guanacaste' : r2 < 0.45 ? 'guacimo' : r2 < 0.6 ? 'madrono' : r2 < 0.72 ? 'ceiba' : r2 < 0.86 ? 'jinocuabo' : 'cortes') : 0;
    return { t: y < -8 && hash2(x, y, 5) < 0.5 ? T.SOIL : T.PASTURE, tree, g: 0.85 + hash2(x, y, 45) * 0.15, shrub: r > 0.75 ? P(r2 < 0.5 ? 'lantana' : 'hamelia') : 0, ground: P(r2 < 0.5 ? 'jaragua' : 'paspalum') };
  }
  if (x >= world.w && y > rt - 24) {
    const tree = r < 0.6 ? P(r2 < 0.6 ? 'redmangrove' : r2 < 0.8 ? 'blackmangrove' : 'whitemangrove') : 0;
    return { t: T.MARSH, tree, g: 0.8 + r2 * 0.2 };
  }
  if (Math.abs(y - FARM_ROAD) < 1) return { t: T.ROAD };
  return { t: T.PASTURE, ground: P(r < 0.6 ? 'jaragua' : 'guinea'), g: 0.9, tree: hash2(x, y, 73) < 0.012 ? P('guanacaste') : 0 };
}
