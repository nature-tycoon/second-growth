// Enkare: a communal grazing range on the western edge of the Serengeti, Tanzania. Decades of
// more cattle, goats and sheep than the land could feed have stripped the grass, crusted the
// soil into bare hardpan and cut gullies down to the river. Famine weed and prickly pear fill
// the gaps, mesquite has run wild from the old tree nursery, and the migration's route through
// is blocked by fences. A few granite kopjes, where the herds couldn't reach, still hold a scrap
// of the old bush; lone umbrella thorns and a pair of ancient baobabs survived the axe.

import { World, riverRow, generateHeights } from '../world.js';
import { T, F } from '../config.js';
import { PLANT } from '../data/plants.js';
import { mulberry32, hash2, valueNoise } from '../rng.js';

// granite outcrops: [x, y, radius]
export const KOPJES = [[96, 22, 6], [38, 60, 5], [104, 64, 4.5]];

export function generateRange(seed = 2024) {
  const w = new World();
  const rng = mulberry32(seed);
  const W = w.w, Hh = w.h;
  const rect = (x0, y0, x1, y1, fn) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (w.inb(x, y)) fn(w.idx(x, y), x, y);
  };
  const open = i => { const t = w.terrain[i]; return t !== T.CREEK && t !== T.RIVER && t !== T.POND && t !== T.ROAD && t !== T.MARSH && w.struct[i] < 0; };
  const set = (i, key, g, years = 0) => w.setPlant(i, PLANT[key], g, years * 120);
  const onKopje = (x, y) => KOPJES.some(([kx, ky, r]) => Math.hypot(x - kx, y - ky) < r);

  // Base: overgrazed rangeland on thin, worn-out soil, a little damper toward the river.
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    w.variant[i] = Math.floor(hash2(x, y, 7) * 4);
    w.terrain[i] = T.PASTURE;
    w.soil[i] = 0.03 + valueNoise(x, y, 10, 11) * 0.06;
    w.baseMoist[i] = 0.16 + 0.14 * (y / Hh) + valueNoise(x, y, 12, 5) * 0.1;
    const rt = riverRow(x);
    if (y >= rt) w.terrain[i] = T.RIVER;
    else if (y === rt - 1 && valueNoise(x, 1, 7, 9) > 0.45) w.terrain[i] = T.GRAVEL;     // sandbanks
    else if (y >= rt - 4) { w.soil[i] = 0.2; w.baseMoist[i] += 0.12; }
    // bare, crusted hardpan where the grass has gone for good
    else if (valueNoise(x, y, 9, 41) + valueNoise(x, y, 4, 43) * 0.25 > 0.5) w.terrain[i] = T.GRAVEL;
  }

  // What's left of the grass: wiry dropseed and grazed-down star grass, with gaps of bare ground,
  // and the weeds of overgrazing moving in.
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    const t = w.terrain[i];
    if (t !== T.PASTURE && t !== T.GRAVEL) continue;
    const r = rng();
    // grazed to the roots: tufts too thin to count as grassland
    if (t === T.GRAVEL) { if (r < 0.08) set(i, 'sporobolus', 0.12 + rng() * 0.15); continue; }
    if (r < 0.28) set(i, 'sporobolus', 0.12 + rng() * 0.18);
    else if (r < 0.4) set(i, 'stargrass', 0.1 + rng() * 0.18);
    else if (r < 0.5) set(i, 'sodomapple', 0.5 + rng() * 0.4);
  }
  const blob = (cx, cy, rx, ry, key, dens, g = 0.7, years = 0) => {
    rect(Math.floor(cx - rx), Math.floor(cy - ry), Math.ceil(cx + rx), Math.ceil(cy + ry), (i, x, y) => {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d < 1 && rng() < dens * (1.2 - d) && open(i)) set(i, key, g + rng() * (1 - g), years);
    });
  };
  // famine weed spreading from the trampled ground around the bomas and the track
  for (const [cx, cy, rx, ry] of [[30, 30, 14, 10], [72, 42, 12, 9], [14, 52, 9, 7], [58, 22, 11, 6], [92, 50, 9, 7], [50, 66, 10, 6], [108, 30, 7, 8]]) blob(cx, cy, rx, ry, 'parthenium', 0.85, 0.6);

  // The village edge: the ranger post, the cattle boma and its water tank on bare, stamped earth.
  rect(14, 12, 38, 30, (i, x, y) => { if (valueNoise(x, y, 3, 21) > 0.3) { w.terrain[i] = T.SOIL; w.clearPlants(i); } w.soil[i] = 0.05; });
  w.addStructure('house', 18, 15);
  w.addStructure('barn', 26, 15);
  w.addStructure('silo', 33, 17);
  w.addStructure('shed', 20, 25);
  w.addStructure('tractor', 31, 26);
  // a second boma out on the range
  rect(64, 34, 80, 46, (i, x, y) => { if (valueNoise(x, y, 3, 22) > 0.45) { w.terrain[i] = T.SOIL; w.clearPlants(i); } });
  w.addStructure('barn', 70, 38);
  // prickly pear planted as a hedge round the bomas, and gone wild
  for (const [cx, cy] of [[26, 22], [72, 40]]) rect(cx - 9, cy - 8, cx + 9, cy + 8, (i, x, y) => {
    const e = Math.abs(Math.max(Math.abs(x - cx) / 9, Math.abs(y - cy) / 8) - 1);
    if (e < 0.14 && open(i) && rng() < 0.7) set(i, 'pricklypear', 0.6 + rng() * 0.4);
  });
  blob(46, 18, 6, 4, 'pricklypear', 0.4, 0.5);
  // mesquite, planted in the 1990s to "stop the desert", now a thicket by the track
  blob(44, 30, 7, 5, 'mesquite', 0.75, 0.6, 12);
  blob(10, 36, 5, 4, 'mesquite', 0.6, 0.6, 9);
  blob(84, 30, 4, 3, 'mesquite', 0.5, 0.5, 6);

  // Tracks: in from the village to the west, and down to the river ford.
  rect(0, 21, 40, 21, i => { w.terrain[i] = T.ROAD; w.clearPlants(i); });
  rect(40, 21, 40, riverRow(40) - 1, i => { w.terrain[i] = T.ROAD; w.clearPlants(i); });

  // The lugga: a sand river running down from the park to the main river, dry most of the year
  // except for its pools, its banks trampled and cut back by gullies.
  const luggaX = y => Math.round(80 + Math.sin(y / 11) * 7 + Math.sin(y / 27 + 2) * 4);
  for (let y = 0; y < Hh; y++) {
    const x = luggaX(y), i = w.idx(x, y);
    if (w.terrain[i] === T.RIVER) break;
    w.terrain[i] = T.CREEK; w.clearPlants(i);
    const nx = luggaX(y + 1);
    for (let xx = Math.min(x, nx); xx <= Math.max(x, nx); xx++) { const j = w.idx(xx, y); if (w.terrain[j] !== T.RIVER) { w.terrain[j] = T.CREEK; w.clearPlants(j); } }
    for (const dx of [-1, 1]) {
      const j = w.idx(x + dx, y);
      if (w.inb(x + dx, y) && open(j) && rng() < 0.55) { w.terrain[j] = rng() < 0.6 ? T.GRAVEL : T.MUD; w.clearPlants(j); }
    }
    if (rng() < 0.12) blob(x + (rng() < 0.5 ? -2 : 2), y, 1.6, 1.6, 'lantana', 0.8, 0.6); // lantana on the banks
  }
  // the road dam: a culvert where the herders' track crossed the lugga
  rect(60, 60, luggaX(60) + 6, 60, i => { if (w.terrain[i] !== T.CREEK && w.terrain[i] !== T.RIVER) { w.terrain[i] = T.ROAD; w.clearPlants(i); } });
  w.feature[w.idx(luggaX(60), 60)] = F.CULVERT;

  // Gullies: erosion scars running downhill (south) from the trampled ground to the river.
  for (const [gx, gy, len] of [[30, 34, 40], [58, 30, 44], [100, 34, 38], [14, 44, 34]]) {
    let x = gx;
    for (let y = gy; y < gy + len && y < riverRow(Math.round(x)) - 1; y++) {
      x += (valueNoise(x, y, 5, 71) - 0.5) * 1.6;
      const xi = Math.round(x), i = w.idx(xi, y);
      if (!w.inb(xi, y) || !open(i)) continue;
      w.terrain[i] = T.MUD; w.clearPlants(i); w.soil[i] = 0.02;
      const j = w.idx(xi + 1, y);
      if (w.inb(xi + 1, y) && open(j) && rng() < 0.5) { w.terrain[j] = T.GRAVEL; w.clearPlants(j); }
    }
  }

  // The charco: a stock dam scooped out for the cattle, a trampled muddy ring around it.
  const [pcx, pcy] = [58, 52];
  rect(pcx - 8, pcy - 6, pcx + 8, pcy + 6, (i, x, y) => {
    const d = ((x - pcx) / 5.5) ** 2 + ((y - pcy) / 3.5) ** 2;
    if (d <= 1) { w.terrain[i] = T.POND; w.clearPlants(i); }
    else if (d <= 2 && open(i)) { w.terrain[i] = T.MUD; w.clearPlants(i); }
  });
  // a papyrus swamp in an old river meander, the one wet refuge left
  rect(10, 76, 30, 84, (i, x, y) => {
    const d = ((x - 20) / 8) ** 2 + ((y - 80) / 2.4) ** 2;
    if (d <= 1 && w.terrain[i] !== T.RIVER) { w.terrain[i] = T.MARSH; w.clearPlants(i); if (rng() < 0.55) set(i, rng() < 0.75 ? 'papyrus' : 'bluelily', 0.7); }
  });

  // Kopjes: granite outcrops the cattle couldn't graze, with the old bush hanging on in the cracks.
  rect(0, 0, W - 1, Hh - 1, (i, x, y) => {
    if (!onKopje(x, y) || !open(i)) return;
    w.terrain[i] = T.GRAVEL; w.clearPlants(i); w.soil[i] = 0.25;
    const r = rng();
    if (r < 0.45) w.feature[i] = F.ROCKS;
    if (rng() < 0.3) set(i, rng() < 0.5 ? 'croton' : 'aloe', 0.8);
    if (rng() < 0.12) set(i, 'euphorbia', 0.9, 30);
    else if (rng() < 0.08) set(i, 'commiphora', 0.85, 20);
    if (rng() < 0.3) set(i, rng() < 0.6 ? 'redoat' : 'fireball', 0.7);
  });

  // Fences: the boundary wire that cut the migration route, and thorn fences round the bomas.
  const fence = (x, y, gap = 0) => {
    if (!w.inb(x, y)) return;
    const i = w.idx(x, y);
    if (!open(i) || w.feature[i] === F.CULVERT || onKopje(x, y)) return;
    if (gap && rng() < gap) return;
    w.feature[i] = F.FENCE;
  };
  for (let x = 0; x < W; x++) fence(x, 0);
  for (let y = 0; y < Hh - 9; y++) fence(W - 1, y);
  const fenceRect = (x0, y0, x1, y1, gap) => {
    for (let x = x0; x <= x1; x++) { fence(x, y0, gap); fence(x, y1, gap); }
    for (let y = y0; y <= y1; y++) { fence(x0, y, gap); fence(x1, y, gap); }
  };
  fenceRect(12, 10, 40, 32, 0.15);
  fenceRect(62, 32, 82, 48, 0.2);

  // The survivors: lone umbrella thorns, two ancient baobabs, desert dates, and old logs.
  for (const [x, y] of [[50, 40], [66, 60], [88, 12], [22, 56], [112, 40], [48, 70], [8, 18], [100, 78]]) {
    const i = w.idx(x, y);
    if (!open(i)) continue;
    set(i, 'umbrella', 1, 60); w.soil[i] = 0.3;
  }
  for (const [x, y] of [[62, 14], [30, 72]]) { const i = w.idx(x, y); if (open(i)) { set(i, 'baobab', 1, 400); w.soil[i] = 0.3; } }
  for (const [x, y] of [[16, 66], [92, 44], [74, 70]]) { const i = w.idx(x, y); if (open(i)) set(i, 'balanites', 0.9, 30); }
  for (let k = 0; k < 12; k++) {
    const x = 4 + Math.floor(rng() * (W - 8)), y = 4 + Math.floor(rng() * (Hh - 16)), i = w.idx(x, y);
    if (!open(i) || w.tree[i] || w.feature[i]) continue;
    w.feature[i] = rng() < 0.3 ? F.SNAG : F.LOG;
  }
  // a thin, cut-over fringe of riverine trees on the bank
  for (let x = 0; x < W; x++) {
    const y = riverRow(x) - 2 - Math.floor(rng() * 3), i = w.idx(x, y);
    if (w.inb(x, y) && open(i) && rng() < 0.14) set(i, rng() < 0.55 ? 'fevertree' : rng() < 0.6 ? 'sycamorefig' : 'sausage', 0.8, 12);
  }

  generateHeights(w, []);
  // raise the kopjes: smooth granite domes
  for (const [kx, ky, r] of KOPJES) for (let y = Math.floor(ky - r - 1); y <= Math.ceil(ky + r + 1); y++) for (let x = Math.floor(kx - r - 1); x <= Math.ceil(kx + r + 1); x++) {
    const d = Math.hypot(x - kx, y - ky) / (r + 0.8);
    if (d < 1) w.setVert(x, y, w.vert(x, y) + 2.4 * (1 - d * d) * (0.85 + hash2(x, y, 13) * 0.3));
  }
  for (const st of w.structures) if (st) w.flattenRect(st.x, st.y, st.w, st.h);
  w.heightDirty = true;
  w.hydroDirty = true;
  return w;
}

// The land around Enkare: the national park north, the neighbours' overgrazed range east,
// village farms west, and the river south with gallery forest on the far bank.
export function serengetiBorderCell(x, y, r, r2, world) {
  const P = k => PLANT[k].id;
  const rt = riverRow(x);
  if (y >= world.h + 3) {
    const tree = r < 0.45 ? P(r2 < 0.45 ? 'fevertree' : r2 < 0.7 ? 'sycamorefig' : r2 < 0.85 ? 'sausage' : 'balanites') : 0;
    return { t: y === world.h + 3 ? T.GRAVEL : T.PASTURE, tree, g: 0.8 + r2 * 0.2, shrub: r > 0.75 ? P('croton') : 0, ground: r > 0.4 ? P(r2 < 0.3 ? 'papyrus' : 'redoat') : 0 };
  }
  if (y >= rt) return { t: T.RIVER };
  if (x < 0 && y >= 0) {
    // village farmland
    if (x === -2) return { t: T.ROAD };
    return { t: T.FIELD, ground: hash2(x, y, 71) < 0.3 ? P('parthenium') : 0, g: 0.8, shrub: x === -1 && r < 0.25 ? P('pricklypear') : 0 };
  }
  if (x >= world.w && y >= 0) {
    // the neighbours' range: grazed as hard as this one was
    const g = r < 0.4 ? 'sporobolus' : r < 0.55 ? 'parthenium' : r < 0.62 ? 'sodomapple' : 0;
    return { t: r2 < 0.3 ? T.GRAVEL : T.PASTURE, ground: g ? P(g) : 0, g: 0.6, shrub: r2 > 0.93 ? P('pricklypear') : 0, tree: hash2(x, y, 73) < 0.02 ? P('umbrella') : 0 };
  }
  // the national park: tall red oat grass and scattered acacia
  const tree = r < 0.14 ? P(r2 < 0.65 ? 'umbrella' : r2 < 0.85 ? 'balanites' : 'commiphora') : 0;
  return { t: T.PASTURE, tree, g: 0.8 + hash2(x, y, 45) * 0.2, shrub: r > 0.9 ? P(r2 < 0.5 ? 'whistling' : 'croton') : 0,
    ground: P(r2 < 0.55 ? 'redoat' : r2 < 0.8 ? 'finger' : 'stargrass') };
}
