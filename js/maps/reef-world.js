// Kalinda Reef: a patch of the southern Great Barrier Reef off a small sand cay. Two summers of
// marine heatwaves bleached most of its branching coral, and the dead thickets have collapsed into
// loose rubble that rolls in every swell, so young corals can't settle on it. Turf algae has
// grown over the rubble, a crown-of-thorns outbreak is eating into the coral that's left, and the
// old boat mooring off the cay has dragged a scar of broken coral across the lagoon. What survived:
// a few big old boulder and brain corals, the sea fans on the reef slope, and scattered patches of
// staghorn and table coral where the water stayed coolest.
//
// The seabed is ordinary "land" to the simulation (sand, rubble, stabilised rubble); the map's look
// lays the sea over it. Heights are in levels (0.3 scene units each): the sea surface is at SEA.

import { World } from '../world.js';
import { T, BORDER } from '../config.js';
import { PLANT } from '../data/plants.js';
import { mulberry32, hash2, valueNoise } from '../rng.js';

export const SEA = 6;
// the sand cay: centre and radii (in tiles); the research station sits on it
export const CAY = { x: 26, y: 9, rx: 12, ry: 6.5 };
export const onCay = (x, y, pad = 0) => ((x - CAY.x) / (CAY.rx + pad)) ** 2 + ((y - CAY.y) / (CAY.ry + pad)) ** 2 < 1;

// seabed height (levels) anywhere, including beyond the edge of the map
export function reefHeight(x, y, W, H) {
  const n = (valueNoise(x + 40, y + 40, 9, 61) - 0.5) * 0.7 + (valueNoise(x + 40, y + 40, 3, 63) - 0.5) * 0.25;
  // the lagoon behind the cay is a little deeper; the reef flat is the shallowest; past the crest the slope drops away
  const v = y / H;
  let h = v < 0.42 ? 1.3 + v * 1.6 : v < 0.78 ? 2.0 + (v - 0.42) * 2.2 : 2.8 - (v - 0.78) * 30;
  if (y > H) h = Math.min(h, 2.8 - (0.22) * 30 - (y - H) * 0.6); // (on into deep blue water beyond the map)
  h += n;
  // the cay: a low white sand island rising out of the lagoon
  const d = Math.hypot((x - CAY.x) / (CAY.rx + 3), (y - CAY.y) / (CAY.ry + 3));
  if (d < 1) h = Math.max(h, SEA + 2.2 - d * d * 5.6);
  // the lagoon's coral heads ("bommies")
  for (const [bx, by, r] of BOMMIES) { const e = Math.hypot(x - bx, y - by) / r; if (e < 1) h += 0.9 * (1 - e * e); }
  return h;
}
const BOMMIES = [[62, 22, 3.5], [90, 30, 3], [44, 32, 2.5], [104, 16, 3]];

export function generateReef(seed = 2026) {
  const w = new World();
  const rng = mulberry32(seed);
  const W = w.w, Hh = w.h;
  const set = (i, key, g, years = 0) => w.setPlant(i, PLANT[key], g, years * 120);
  const blob = (cx, cy, rx, ry, fn) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (!w.inb(x, y)) continue;
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d < 1) fn(w.idx(x, y), x, y, d);
    }
  };

  // heights first: what's under water, and how deep, decides everything else
  for (let y = -BORDER; y <= Hh + BORDER; y++) for (let x = -BORDER; x <= W + BORDER; x++) w.setVert(x, y, reefHeight(x, y, W, Hh));
  const dry = (x, y) => w.tileH(x, y) > SEA - 0.2;

  // Base: lagoon sand in the north, dead-coral rubble over most of the reef flat, and sand
  // channels running down through it.
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    w.variant[i] = Math.floor(hash2(x, y, 7) * 4);
    w.baseMoist[i] = 0.6;
    const v = y / Hh, chan = valueNoise(x, y * 0.4, 7, 15) > 0.62;
    if (dry(x, y)) { w.terrain[i] = T.PASTURE; w.soil[i] = 0.2; continue; } // the cay's sand
    if (v < 0.4 || chan) { w.terrain[i] = T.PASTURE; w.soil[i] = 0.1 + valueNoise(x, y, 8, 3) * 0.05; }
    else { w.terrain[i] = T.GRAVEL; w.soil[i] = 0.03 + valueNoise(x, y, 10, 11) * 0.03; }
  }

  // thin seagrass on the lagoon sand, grazed down and patchy
  for (let y = 0; y < Hh * 0.42; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    if (w.terrain[i] !== T.PASTURE || dry(x, y)) continue;
    if (valueNoise(x, y, 11, 21) > 0.58 && rng() < 0.55) set(i, rng() < 0.7 ? 'halophila' : 'zostera', 0.2 + rng() * 0.25);
  }
  // turf algae over most of the rubble
  for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.GRAVEL && rng() < 0.62) set(i, 'turf', 0.5 + rng() * 0.4);
  // a little pink coralline algae hanging on
  for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.GRAVEL && !w.ground[i] && rng() < 0.12) set(i, 'cca', 0.3 + rng() * 0.3);

  // The survivors. Old boulder and brain corals, centuries old, on the bommies and the reef flat;
  // patches of staghorn and table coral where the water stayed coolest, down toward the crest;
  // sea fans and soft corals on the slope.
  for (const [bx, by, r] of BOMMIES) blob(bx, by, r, r, (i, x, y, d) => {
    w.terrain[i] = T.SOIL; w.soil[i] = 0.25; w.ground[i] = 0;
    if (d < 0.35 && rng() < 0.8) set(i, rng() < 0.6 ? 'boulder' : 'brain', 0.9 + rng() * 0.1, 80 + rng() * 200);
    else if (rng() < 0.4) set(i, rng() < 0.5 ? 'softcoral' : 'sponge', 0.6 + rng() * 0.3);
  });
  for (const [cx, cy, rx, ry, dens] of [[18, 56, 7, 4, 0.55], [52, 62, 5, 3, 0.5], [86, 66, 8, 4, 0.6], [108, 52, 4, 3, 0.45], [34, 72, 6, 3, 0.65]]) blob(cx, cy, rx, ry, (i, x, y, d) => {
    w.terrain[i] = T.SOIL; w.soil[i] = 0.2 + rng() * 0.08;
    if (w.ground[i] === PLANT.turf.id) set(i, 'cca', 0.5);
    if (rng() < dens * (1.1 - d)) set(i, rng() < 0.65 ? 'staghorn' : 'tablecoral', 0.6 + rng() * 0.4, 3 + rng() * 5);
    else if (rng() < 0.15) set(i, 'brain', 0.7 + rng() * 0.3, 20);
  });
  for (let k = 0; k < 26; k++) { // lone old massive corals scattered over the flat
    const x = 4 + Math.floor(rng() * (W - 8)), y = Math.floor(Hh * 0.45 + rng() * Hh * 0.4), i = w.idx(x, y);
    w.terrain[i] = T.SOIL; w.soil[i] = 0.22; set(i, rng() < 0.55 ? 'boulder' : 'brain', 0.85 + rng() * 0.15, 40 + rng() * 150);
  }
  for (let x = 0; x < W; x++) for (let y = Math.floor(Hh * 0.8); y < Hh; y++) { // the slope: sea fans and soft corals in the current
    const i = w.idx(x, y);
    if (rng() < 0.08) set(i, rng() < 0.55 ? 'seafan' : 'softcoral', 0.6 + rng() * 0.4);
  }
  // anemones with nobody home yet (clownfish will find them)
  for (const [x, y] of [[20, 58], [86, 64], [36, 71], [60, 23]]) { const i = w.idx(x, y); w.terrain[i] = T.SOIL; set(i, 'anemone', 0.9); }

  // blue sea stars scattered over the sand and rubble
  for (let i = 0; i < w.n; i++) if (!w.shrub[i] && !w.tree[i] && w.terrain[i] !== T.SOIL && rng() < 0.012 && w.tileH(i % W, (i / W) | 0) < SEA - 0.5) set(i, 'linckia', 0.6 + rng() * 0.4);

  // the crown-of-thorns outbreak, eating its way into the eastern coral
  blob(90, 66, 6, 4, i => { if (w.tree[i] && rng() < 0.45) set(i, 'cots', 0.5 + rng() * 0.4); });
  blob(104, 54, 3, 3, i => { if (rng() < 0.3) set(i, 'cots', 0.4 + rng() * 0.4); });

  // the old mooring's anchor scar: a trench of smashed coral across the lagoon off the cay
  for (let k = 0; k < 40; k++) {
    const x = Math.round(38 + k * 0.9), y = Math.round(16 + k * 0.45 + Math.sin(k / 4) * 1.5);
    for (const dx of [0, 1]) { if (!w.inb(x + dx, y)) continue; const i = w.idx(x + dx, y); w.terrain[i] = T.GRAVEL; w.clearPlants(i); w.soil[i] = 0.02; }
  }

  // The research station, dive shed and boat landing on the cay.
  w.addStructure('house', 22, 7);
  w.addStructure('shed', 28, 8);
  w.addStructure('silo', 19, 10);
  w.addStructure('parking', 31, 11); // the boat landing, where snorkelers come ashore
  for (const st of w.structures) if (st) w.flattenRect(st.x, st.y, st.w, st.h);
  w.heightDirty = true;
  w.hydroDirty = true;
  return w;
}

// Beyond the map: more reef to the east and west (some of it in better shape), the lagoon to the
// north, and the reef slope falling into deep blue water to the south.
export function reefBorderCell(x, y, r, r2, world) {
  const P = k => PLANT[k].id, H = world.h;
  if (onCay(x, y)) return { t: T.PASTURE };
  if (y >= H) return { t: T.PASTURE, shrub: y < H + 4 && r < 0.12 ? P(r2 < 0.5 ? 'seafan' : 'softcoral') : 0 };
  if (y < H * 0.4) return { t: T.PASTURE, ground: r < 0.4 ? P(r2 < 0.6 ? 'halophila' : 'zostera') : 0 };
  const coral = r < 0.4;
  return { t: coral ? T.SOIL : T.GRAVEL, tree: coral ? P(r2 < 0.45 ? 'staghorn' : r2 < 0.7 ? 'tablecoral' : r2 < 0.85 ? 'brain' : 'boulder') : 0, g: 0.7 + r2 * 0.3,
    ground: coral ? P('cca') : r2 < 0.5 ? P('turf') : 0, shrub: !coral && r > 0.85 ? P('softcoral') : 0 };
}
