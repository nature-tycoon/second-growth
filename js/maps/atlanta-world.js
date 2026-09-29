// Magnolia Ridge: a 2006 subdivision in Gwinnett County, outside Atlanta, on what was oak-hickory
// forest running down to the Yellow River. The builder clear-cut the ridge, scraped off the topsoil,
// and laid out two streets of identical houses on identical lots: a Bradford pear and a boxwood
// out front, a fenced square of Bermuda grass out back. What's left of the woods is a privet-choked
// strip along the river and the power-line easement along the ridge.
// The homes, the clubhouse and the streets stay: people live here. A smaller map than the others
// (72 x 60), so the gardens and their pollinators are close up.

import { World, riverRow, generateHeights } from '../world.js';
import { T, F } from '../config.js';
import { PLANT } from '../data/plants.js';
import { mulberry32, hash2, valueNoise } from '../rng.js';

export const SIZE = [72, 60];
export const STREET_ROWS = [14, 38];
// Hollins Creek: down the middle from the ridge woods to the river, under both streets
export const creekX = y => Math.round(35 + Math.sin(y / 6.5) * 2.2 + Math.sin(y / 15 + 1.3) * 1.4);
export const ACCESS_X = 2;        // the drive from the lower street down to the clubhouse
// lot rows: y0..y1, the house's top row, and the fenced backyard rows
export const LOT_ROWS = [
  { y0: 3, y1: 13, house: 9, back: [3, 8] },
  { y0: 16, y1: 26, house: 19, back: [21, 26] },
  { y0: 27, y1: 37, house: 33, back: [27, 32] },
  { y0: 40, y1: 48, house: 43, back: [45, 48] },
];
export const LOT_W = 6;
export const LOT_X = [5, 11, 17, 23, 41, 47, 53, 59];
// every lot on the map, in a fixed order (ids are saved, so this order never changes)
export const LOTS = [];
LOT_ROWS.forEach((row, r) => LOT_X.forEach((x0, c) => {
  const backAbove = row.back[1] < row.house;
  LOTS.push({ id: LOTS.length, row: r, col: c, x0, x1: x0 + LOT_W - 1, y0: row.y0, y1: row.y1, house: row.house, back: row.back,
    turn: !backAbove, street: backAbove ? row.y1 + 1 : row.y0 - 1 });
}));
// the lot a tile belongs to (-1: common ground, streets, the river)
export function lotAt(x, y) {
  for (const l of LOTS) if (x >= l.x0 && x <= l.x1 && y >= l.y0 && y <= l.y1) return l.id;
  return -1;
}
// The player's own house, where the game starts: the middle of the second row, facing the upper street.
export const HOME_LOT = LOTS.find(l => l.row === 1 && l.col === 2).id;

export function generateSubdivision(seed = 2006) {
  const w = new World(SIZE[0], SIZE[1]);
  const rng = mulberry32(seed);
  const W = w.w, Hh = w.h;
  const inb = (x, y) => w.inb(x, y);
  const rect = (x0, y0, x1, y1, fn) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inb(x, y)) fn(w.idx(x, y), x, y); };
  const set = (i, key, g, years = 0) => w.setPlant(i, PLANT[key], g, years * 120);
  const road = i => { w.terrain[i] = T.ROAD; w.clearPlants(i); w.feature[i] = 0; };
  const isLawn = i => w.terrain[i] === T.PASTURE && w.struct[i] < 0;
  const rr = x => riverRow(x, Hh);

  // Base: graded, compacted red clay under sod. The topsoil went with the trees.
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    w.variant[i] = Math.floor(hash2(x, y, 7) * 4);
    w.terrain[i] = T.PASTURE;
    w.soil[i] = 0.05 + valueNoise(x, y, 10, 11) * 0.05;
    w.baseMoist[i] = 0.3 + 0.18 * (y / Hh) + valueNoise(x, y, 12, 5) * 0.08;
    if (y >= rr(x)) { w.terrain[i] = T.RIVER; continue; }
    set(i, 'turf', 0.85 + rng() * 0.15);
  }

  // Streets, and the drive down to the clubhouse.
  for (const sy of STREET_ROWS) rect(0, sy, W - 1, sy + 1, road);
  rect(ACCESS_X, STREET_ROWS[1] + 2, ACCESS_X + 1, 49, road);

  // Lots: the same house on every one. The driveway runs from the garage door (on the right, or
  // on the left for houses turned to face the street above) to the street; a boxwood by the front
  // door; a Bradford pear by the curb; a privacy fence round the back.
  const fence = (x, y) => { if (!inb(x, y)) return; const i = w.idx(x, y); if (isLawn(i)) w.feature[i] = F.FENCE; };
  for (const l of LOTS) {
    const hx = l.x0 + 1;
    const home = w.addStructure('home', hx, l.house);
    if (l.turn) home.turn = true;
    const gx = l.turn ? hx : hx + 2;                         // the tile in front of the garage door
    const frontY = l.turn ? l.house - 1 : l.house + 2;        // the row just in front of the house
    if (l.turn) rect(gx, l.street + 1, gx, l.house - 1, road); else rect(gx, l.house + 2, gx, l.street - 1, road);
    const bush = l.turn ? hx + 2 : hx;                        // beside the front door, away from the drive
    { const i = w.idx(bush, frontY); if (isLawn(i)) set(i, rng() < 0.15 ? 'nandina' : 'boxwood', 0.8 + rng() * 0.2, 12); }
    const curbY = l.turn ? l.street + 1 : l.street - 1;
    { const i = w.idx(l.turn ? hx + 2 : hx, curbY); if (isLawn(i)) set(i, 'callery', 0.75 + rng() * 0.2, 14); }
    if (rng() < 0.35) { const i = w.idx(l.turn ? l.x0 + 5 : l.x0, curbY); if (isLawn(i)) set(i, 'crepemyrtle', 0.7 + rng() * 0.2, 10); }
    const [by0, by1] = l.back, rear = l.turn ? by1 : by0;
    for (let y = by0; y <= by1; y++) { fence(l.x0, y); fence(l.x0 + LOT_W, y); }
    // (back-to-back yards share one fence: the row below leaves its back fence to the row above)
    const shared = !l.turn && LOTS.some(o => o.turn && o.col === l.col && o.back[1] === l.back[0] - 1);
    if (!shared) for (let x = l.x0; x <= l.x0 + LOT_W; x++) fence(x, rear);
    // the odd survivor, or something the owners planted
    const r = rng();
    const bx = l.x0 + 2 + Math.floor(rng() * 3), byy = by0 + 1 + Math.floor(rng() * Math.max(1, by1 - by0 - 1));
    const bi = w.idx(bx, byy);
    if (isLawn(bi) && !w.feature[bi] && l.id !== HOME_LOT) {
      if (r < 0.12) set(bi, 'loblolly', 0.9, 25);
      else if (r < 0.2) set(bi, 'sweetgum', 0.8, 18);
      else if (r < 0.26) set(bi, 'redmaple', 0.75, 12);
      else if (r < 0.34) set(bi, 'crepemyrtle', 0.7, 10);
      else if (r < 0.4) set(bi, 'callery', 0.7, 10);
    }
    // a privet or nandina hedge gone wild along some back fences, English ivy in others
    if (rng() < 0.22 || l.id === HOME_LOT) for (let x = l.x0 + 1; x < l.x0 + LOT_W; x++) { const i = w.idx(x, l.turn ? rear - 1 : rear + 1); if (isLawn(i) && rng() < 0.8) set(i, rng() < 0.7 ? 'privet' : 'nandina', 0.6 + rng() * 0.3, 6); }
    if (rng() < 0.12) rect(l.x0 + 1, by0, l.x0 + LOT_W - 1, by1, i => { if (isLawn(i) && !w.feature[i] && rng() < 0.45) set(i, 'ivy', 0.6 + rng() * 0.3); });
  }

  // The power-line easement along the ridge: mown, with kudzu coming over the woods' edge.
  const blob = (cx, cy, rx, ry, key, dens, g = 0.7, years = 0) => rect(Math.floor(cx - rx), Math.floor(cy - ry), Math.ceil(cx + rx), Math.ceil(cy + ry), (i, x, y) => {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (d < 1 && rng() < dens * (1.2 - d) && isLawn(i) && !w.feature[i]) set(i, key, g + rng() * (1 - g), years);
  });
  for (const [cx, rx] of [[9, 7], [44, 5], [64, 7]]) blob(cx, 0.5, rx, 2.2, 'kudzu', 0.9, 0.7);

  // The south end: the HOA clubhouse and pool, and the fenced stormwater pond.
  w.addStructure('clubhouse', 8, 50);
  w.addStructure('pool', 13, 50);
  rect(ACCESS_X, 49, 17, 49, road);                        // the clubhouse parking
  const [pcx, pcy, prx, pry] = [48, 51.5, 7, 1.7];
  rect(pcx - prx - 3, pcy - pry - 3, pcx + prx + 3, pcy + pry + 3, (i, x, y) => {
    if (y < 49) return;
    const d = ((x - pcx) / prx) ** 2 + ((y - pcy) / pry) ** 2;
    if (d <= 1) { w.terrain[i] = T.POND; w.clearPlants(i); }
    else if (d <= 1.9 && w.terrain[i] === T.PASTURE) { w.terrain[i] = T.GRAVEL; w.clearPlants(i); }  // riprap slopes
  });
  for (let a = 0; a < Math.PI * 2; a += 0.02) { const x = Math.round(pcx + Math.cos(a) * (prx + 2.4)), y = Math.round(pcy + Math.sin(a) * (pry + 1.4)); if (y >= 49) fence(x, y); }
  for (let y = Math.ceil(pcy + pry); y < Hh; y++) { const i = w.idx(pcx, y); if (w.terrain[i] === T.RIVER) break; w.terrain[i] = T.CREEK; w.clearPlants(i); w.feature[i] = 0; }
  // the county's required stream buffer: a strip of woods along the river, swallowed by privet
  for (let x = 0; x < W; x++) {
    const rt = rr(x);
    for (let y = Math.max(50, rt - 4); y < rt; y++) {
      const i = w.idx(x, y);
      if (!inb(x, y) || !isLawn(i) || w.feature[i]) continue;
      if (rng() < 0.75) set(i, 'privet', 0.7 + rng() * 0.3, 10);
      if (rng() < 0.5) set(i, rng() < 0.6 ? 'ivy' : 'honeysuckle', 0.7);
      else w.ground[i] = 0;
      if (rng() < 0.2) set(i, rng() < 0.4 ? 'sycamore' : rng() < 0.6 ? 'riverbirch' : rng() < 0.7 ? 'redmaple' : 'callery', 0.8 + rng() * 0.2, 20);
    }
  }
  for (let k = 0; k < 5; k++) { const x = 4 + Math.floor(rng() * (W - 8)), y = rr(x) - 1 - Math.floor(rng() * 2), i = w.idx(x, y); if (inb(x, y) && isLawn(i) && !w.tree[i] && !w.feature[i]) w.feature[i] = rng() < 0.4 ? F.SNAG : F.LOG; }

  // Hollins Creek: it runs through the middle of the subdivision in a straightened, mown ditch,
  // under both streets on little bridges, past the pond and out to the river. A few old
  // sycamores and red maples hang on along the banks, with privet moving in.
  for (let y = 0; y < Hh; y++) {
    const x = creekX(y), nx = creekX(y + 1);
    if (!inb(x, y) || w.terrain[w.idx(x, y)] === T.RIVER) break;
    for (let xx = Math.min(x, nx); xx <= Math.max(x, nx); xx++) {
      const i = w.idx(xx, y);
      if (w.terrain[i] === T.RIVER) continue;
      const street = w.terrain[i] === T.ROAD;
      w.terrain[i] = T.CREEK; w.clearPlants(i); w.feature[i] = street ? F.BOARDWALK : 0;
    }
    for (const dx of [-2, -1, 1, 2]) {
      const bx = x + dx, i = w.idx(bx, y);
      if (!inb(bx, y) || !isLawn(i) || w.feature[i]) continue;
      if (Math.abs(dx) === 1 && rng() < 0.35) { w.terrain[i] = T.MUD; w.clearPlants(i); continue; }   // eroded banks
      if (rng() < 0.12) set(i, rng() < 0.4 ? 'sycamore' : rng() < 0.7 ? 'redmaple' : 'riverbirch', 0.85 + rng() * 0.15, 25);
      else if (rng() < 0.2) set(i, 'privet', 0.6 + rng() * 0.3, 6);
    }
  }

  // each street bridge spans the same columns in both lanes, so there's no gap in the deck
  for (const sy of STREET_ROWS) {
    const xs = [];
    for (let x = 0; x < W; x++) if (w.terrain[w.idx(x, sy)] === T.CREEK || w.terrain[w.idx(x, sy + 1)] === T.CREEK) xs.push(x);
    for (const x of xs) for (const y of [sy, sy + 1]) { const i = w.idx(x, y); w.terrain[i] = T.CREEK; w.clearPlants(i); w.feature[i] = F.BOARDWALK; }
  }

  generateHeights(w, []);
  for (const st of w.structures) if (st) w.flattenRect(st.x, st.y, st.w, st.h);
  w.heightDirty = true;
  w.hydroDirty = true;
  return w;
}

// Around Magnolia Ridge: the last oak-hickory woods on the ridge to the north, the four-lane
// road and another subdivision to the west, more subdivision to the east, and the Yellow River's
// wooded floodplain across the water to the south.
export function atlantaBorderCell(x, y, r, r2, world) {
  const P = k => PLANT[k].id;
  const rt = riverRow(x, world.h);
  if (y >= world.h + 3) {
    const tree = r < 0.6 ? P(r2 < 0.35 ? 'sycamore' : r2 < 0.6 ? 'riverbirch' : r2 < 0.85 ? 'redmaple' : 'sweetgum') : 0;
    return { t: T.PASTURE, tree, g: 0.8 + r2 * 0.2, shrub: r > 0.55 ? P(r2 < 0.5 ? 'privet' : 'elderberry') : 0, ground: P(r2 < 0.4 ? 'sedge' : 'fern') };
  }
  if (y >= rt) return { t: T.RIVER };
  if (y < 0) {
    const tree = r < 0.62 ? P(r2 < 0.35 ? 'whiteoak' : r2 < 0.55 ? 'tulippoplar' : r2 < 0.72 ? 'loblolly' : r2 < 0.86 ? 'sweetgum' : 'dogwood') : 0;
    return { t: T.PASTURE, tree, g: 0.85 + hash2(x, y, 45) * 0.15, shrub: r > 0.8 ? P(r2 < 0.5 ? 'azalea' : 'hydrangea') : 0, ground: P(r2 < 0.5 ? 'fern' : 'phlox') };
  }
  // the streets carry on into the neighbouring subdivisions, with the four-lane road to the west
  if (STREET_ROWS.some(sy => y === sy || y === sy + 1)) return { t: T.ROAD };
  if (x < 0 && (x === -2 || x === -3 || x === -4)) return { t: T.ROAD };
  const tree = hash2(x, y, 73) < 0.07 ? P(hash2(x, y, 74) < 0.6 ? 'callery' : hash2(x, y, 74) < 0.8 ? 'crepemyrtle' : 'loblolly') : 0;
  return { t: T.PASTURE, ground: P('turf'), g: 0.9, tree, shrub: hash2(x, y, 77) < 0.05 ? P('boxwood') : 0 };
}
