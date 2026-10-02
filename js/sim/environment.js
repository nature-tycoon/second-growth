// Derived environment fields: water, moisture, canopy, distances, habitat classes, food.

import { T, F, H, isWater, clamp } from '../config.js';
import { biome } from '../biome.js';
import { PLANTS, isBlooming, isFruiting } from '../data/plants.js';

const FAR = 255;
let queue = null;

// Multi-source BFS distance (4-neighbour), capped. `isSource(i)` marks distance 0.
function distanceField(w, out, isSource, cap = 20) {
  const n = w.n, W = w.w, Hh = w.h;
  if (!queue || queue.length < n) queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) {
    if (isSource(i)) { out[i] = 0; queue[tail++] = i; } else out[i] = FAR;
  }
  while (head < tail) {
    const i = queue[head++];
    const d = out[i] + 1;
    if (d > cap) continue;
    const x = i % W, y = (i / W) | 0;
    if (x > 0 && out[i - 1] > d) { out[i - 1] = d; queue[tail++] = i - 1; }
    if (x < W - 1 && out[i + 1] > d) { out[i + 1] = d; queue[tail++] = i + 1; }
    if (y > 0 && out[i - W] > d) { out[i - W] = d; queue[tail++] = i - W; }
    if (y < Hh - 1 && out[i + W] > d) { out[i + W] = d; queue[tail++] = i + W; }
  }
}

export function updateHydrology(w) {
  const t = w.terrain;
  distanceField(w, w.distWater, i => isWater(t[i]));
  distanceField(w, w.distPond, i => t[i] === T.POND || t[i] === T.MARSH);
  // Fish passage: 8-connected water reachable from the river, culverts block.
  const W = w.w, Hh = w.h, c = w.connected;
  c.fill(0);
  if (!queue || queue.length < w.n) queue = new Int32Array(w.n);
  let head = 0, tail = 0;
  for (let i = 0; i < w.n; i++) if (t[i] === T.RIVER) { c[i] = 1; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++];
    const x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= Hh) continue;
      const j = yy * W + xx;
      if (c[j] || !isWater(t[j]) || w.feature[j] === F.CULVERT) continue;
      c[j] = 1; queue[tail++] = j;
    }
  }
  w.hydroDirty = false;
}

let ownCover = null;

export function updateCanopy(w) {
  const W = w.w, Hh = w.h;
  if (!ownCover || ownCover.length < w.n) ownCover = new Float32Array(w.n);
  const own = ownCover;
  for (let i = 0; i < w.n; i++) {
    const id = w.tree[i];
    own[i] = id ? Math.min(1, w.treeG[i] * 1.15) * (PLANTS[id].conifer ? 1 : 0.85) : 0;
  }
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    let s = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= Hh) continue;
      s += own[yy * W + xx]; c++;
    }
    const i = y * W + x;
    const nb = c ? s / c : 0;
    w.canopy[i] = Math.min(1, own[i] * 0.75 + nb * 0.45);
    w.nbCanopy[i] = nb;
  }
}

export function updateMoisture(w, month) {
  const off = biome.climate.moist[month];
  for (let i = 0; i < w.n; i++) {
    const t = w.terrain[i];
    if (isWater(t)) { w.moist[i] = t === T.MARSH ? 0.97 : 1; continue; }
    const d = w.distWater[i];
    let m = w.baseMoist[i] + 0.55 * Math.exp(-d / 2.1) + off + w.canopy[i] * 0.06 + w.elevMoist[i];
    if (t === T.MUD) m += 0.22;
    if (w.flood[i]) m += 0.4;
    if (w.feature[i] === F.LOG) m += 0.05;
    w.moist[i] = clamp(m, 0, 0.99);
  }
}

// Light reaching a plant layer on a tile (0..1).
export function layerLight(w, i, layer) {
  if (layer === 0) {
    let shade = w.canopy[i] * 0.9;
    const s = w.shrub[i];
    if (s) shade += w.shrubG[i] * (PLANTS[s].look.type === 'bramble' ? 0.85 : 0.45);
    return clamp(1 - shade, 0, 1);
  }
  if (layer === 1) return clamp(1 - w.canopy[i] * 0.85, 0, 1);
  return clamp(1 - w.nbCanopy[i] * 0.75, 0, 1);
}

export function updateDistances(w) {
  const tr = w.tree, tg = w.treeG, sh = w.shrub, sg = w.shrubG, f = w.feature;
  distanceField(w, w.distCover, i => (sh[i] && sg[i] > 0.4) || (tr[i] && tg[i] > 0.3) || f[i] === F.BRUSH);
  distanceField(w, w.distForest, i => tr[i] && tg[i] > 0.45);
  distanceField(w, w.distPerch, i => (tr[i] && tg[i] > 0.7) || f[i] === F.SNAG || f[i] === F.FENCE || f[i] === F.NESTBOX);
  distanceField(w, w.distSnag, i => f[i] === F.SNAG);
  distanceField(w, w.distLog, i => f[i] === F.LOG);
  distanceField(w, w.distNest, i => f[i] === F.NESTBOX || f[i] === F.SNAG);
  distanceField(w, w.distRocks, i => f[i] === F.ROCKS || f[i] === F.BRUSH);
  distanceField(w, w.distWoody, i => (sh[i] && PLANTS[sh[i]].beaverFood && sg[i] > 0.3) || (tr[i] && PLANTS[tr[i]].beaverFood && tg[i] > 0.2));
}

const GRASSY = { grass: 1, sedge: 0.7, tallgrass: 0.4, tallforb: 0.2, forb: 0.3 };

export function classifyAndResources(w, month) {
  const n = w.n, W = w.w;
  const season = Math.floor(month / 3);
  const insectSeason = [0.8, 1, 0.6, 0.15][season];
  const st = { native: 0, land: 0, invasive: 0, farm: 0, meadow: 0, forest: 0, mature: 0, berry: 0,
    bigTrees: 0, water: 0, counts: new Array(13).fill(0), snags: 0, nestboxes: 0, logs: 0, matureConifer: 0,
    shadedCreek: 0, creek: 0 };
  for (let i = 0; i < n; i++) {
    const t = w.terrain[i];
    const g = w.ground[i], s = w.shrub[i], tr = w.tree[i];
    const gp = g ? PLANTS[g] : null, sp = s ? PLANTS[s] : null, tp = tr ? PLANTS[tr] : null;
    const gG = w.groundG[i], sG = w.shrubG[i], tG = w.treeG[i];
    const f = w.feature[i];
    if (f === F.SNAG) st.snags++;
    else if (f === F.NESTBOX) st.nestboxes++;
    else if (f === F.LOG) st.logs++;

    // habitat class
    let h;
    if (t === T.RIVER) h = H.RIVER;
    else if (t === T.CREEK) h = H.CREEK;
    else if (t === T.POND) h = H.POND;
    else if (t === T.MARSH) h = H.MARSH;
    else if (w.struct[i] >= 0 || t === T.ROAD || t === T.TRAIL) h = H.DEVELOPED;
    else {
      // invasive trees (mesquite, leucaena) make weed thickets, not woodland
      const inv = (tp && tp.invasive ? tG : 0) + (sp && sp.invasive ? sG : 0) + (gp && gp.invasive && !gp.sod ? gG * 0.8 : 0);
      const nearW = w.distWater[i] <= 2;
      // (exotic: a non-native ornamental, like lawn, boxwood or crepe myrtle, that isn't habitat)
      if (inv > 0.5 && !(tp && !tp.invasive && tG > 0.6)) h = H.INVASIVE;
      else if (tp && !tp.exotic && tG >= 0.35) {
        const matureAge = tp.matureAge ?? (tp.conifer ? 12 : 18);
        const mature = tG >= 0.98 && w.treeAge[i] >= matureAge * 120;
        if (nearW && !tp.conifer && !mature) h = H.RIPARIAN;
        else h = mature ? H.MATURE_FOREST : H.YOUNG_FOREST;
      } else if (sp && !sp.invasive && !sp.exotic && sG >= 0.4) h = nearW ? H.RIPARIAN : H.SHRUB;
      else if (gp && !gp.invasive && !gp.weedy && gG >= 0.35) h = H.MEADOW; // weedy: a native that marks overgrazing, not grassland
      else if (t === T.FIELD || t === T.PASTURE) h = H.FARM;
      else h = H.BARE;
    }
    w.habitat[i] = h;
    st.counts[h]++;

    const land = !isWater(t) && h !== H.DEVELOPED;
    if (land) {
      st.land++;
      if ((gp && !gp.invasive && !gp.exotic && gG > 0.3) || (sp && !sp.invasive && !sp.exotic && sG > 0.3) || (tp && !tp.exotic && tG > 0.3)) st.native++;
      if (h === H.INVASIVE || (sp && sp.invasive && sG > 0.3) || (gp && gp.invasive && gG > 0.4)) st.invasive++;
    }
    if (h === H.FARM) st.farm++;
    if (h === H.MEADOW) st.meadow++;
    if (h === H.YOUNG_FOREST || h === H.MATURE_FOREST) st.forest++;
    if (h === H.MATURE_FOREST) { st.mature++; if (tp.conifer) st.matureConifer++; }
    if (tp && tG >= 0.95 && w.treeAge[i] > 15 * 120) st.bigTrees++;
    if (isWater(t) && t !== T.RIVER) st.water++;

    // food & resources
    let nectar = 0, berries = 0, graze = 0, browse = 0;
    if (gp) {
      if (isBlooming(gp, month)) nectar += gG * 0.8 * (gp.invasive || gp.exotic ? 0.3 : 1);
      graze += (GRASSY[gp.look.type] || 0) * gG * (gp.invasive ? 0.5 : 1);
      if (gp.look.type === 'forb' || gp.look.type === 'tallforb') browse += gG * 0.25;
    } else if (t === T.PASTURE) graze += 0.3;
    if (sp) {
      if (isBlooming(sp, month)) nectar += sG * (sp.invasive || sp.exotic ? 0.3 : 1);
      if (isFruiting(sp, month)) berries += sG;
      browse += sG * sp.browse;
      if (sp.look.fruit && sG > 0.5 && !sp.invasive) st.berry++;
      if (sp.invasive && sp.look.fruit && sG > 0.5) st.berry += 0.3;
    }
    if (tp) {
      if (tG < 0.6) browse += tG * (tp.browse || 0.3);
      if (tp.mast && (month === 6 || month === 7)) berries += tp.mast * tG;
      if (tp.nectar && tp.nectar.months.includes(month)) nectar += tp.nectar.amount * tG;
    }
    w.nectar[i] = Math.min(1, nectar);
    w.berries[i] = Math.min(1, berries);
    w.graze[i] = Math.min(1, graze);
    w.browse[i] = Math.min(1, browse);
    w.conifer[i] = tp && tp.conifer && tG > 0.5 ? 1 : 0;

    let ins = 0;
    if (gp && !gp.invasive && !gp.exotic) ins += 0.2 * gG;
    if (sp && !sp.invasive && !sp.exotic) ins += 0.2 * sG;
    if (tp && tp.caterpillars) ins += 0.3 * tG; // oaks and cherries: the caterpillars songbirds feed their young
    ins += nectar * 0.5;
    if (t === T.MARSH || t === T.POND) ins += 0.45;
    else if (w.distWater[i] <= 1) ins += 0.2;
    if (f === F.LOG || f === F.SNAG || f === F.STUMP) ins += 0.2;
    w.insects[i] = Math.min(1, ins * insectSeason);
  }

  // Water quality from streamside shade and vegetation.
  const Hh = w.h;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const t = w.terrain[i];
    if (!isWater(t)) { w.waterQ[i] = 0; continue; }
    let shade = 0, veg = 0, inv = 0, cnt = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= Hh) continue;
      const j = yy * W + xx;
      if (isWater(w.terrain[j]) && w.terrain[j] !== T.MARSH) continue;
      cnt++;
      if ((w.tree[j] && w.treeG[j] > 0.4) || (w.shrub[j] && w.shrubG[j] > 0.5 && !PLANTS[w.shrub[j]].invasive)) shade++;
      const gj = w.ground[j];
      if (gj && !PLANTS[gj].invasive) veg++;
      if ((gj && PLANTS[gj].invasive) || (w.shrub[j] && PLANTS[w.shrub[j]].invasive)) inv++;
    }
    const own = w.ground[i] && PLANTS[w.ground[i]].aquatic ? 0.15 : 0;
    const q = cnt ? 0.25 + 0.5 * shade / cnt + 0.25 * veg / cnt - 0.15 * inv / cnt : 0.35;
    w.waterQ[i] = clamp(q + own, 0, 1);
    if (t === T.CREEK) { st.creek++; if (cnt && shade / cnt >= 0.35) st.shadedCreek++; }
  }
  // smooth one pass so pond interiors inherit edge quality
  for (let i = 0; i < n; i++) {
    const t = w.terrain[i];
    if (!isWater(t)) continue;
    const x = i % W, y = (i / W) | 0;
    let s = 0, c = 0;
    if (x > 0 && isWater(w.terrain[i - 1])) { s += w.waterQ[i - 1]; c++; }
    if (x < W - 1 && isWater(w.terrain[i + 1])) { s += w.waterQ[i + 1]; c++; }
    if (y > 0 && isWater(w.terrain[i - W])) { s += w.waterQ[i - W]; c++; }
    if (y < Hh - 1 && isWater(w.terrain[i + W])) { s += w.waterQ[i + W]; c++; }
    if (c) w.waterQ[i] = Math.max(w.waterQ[i], (s / c) * 0.9);
    if (t === T.RIVER) w.waterQ[i] = Math.max(w.waterQ[i], 0.55);
  }
  biome.stats?.(w, st, month); // anything a map counts for itself
  w.stats = st;
  return st;
}

// Hollows collect water, ridges and the high ground drain dry.
export function updateElevation(w) {
  const W = w.w, Hh = w.h, R = 4;
  const th = new Float32Array(w.n);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) th[y * W + x] = w.tileH(x, y);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
      const xx = clamp(x + dx, 0, W - 1), yy = clamp(y + dy, 0, Hh - 1);
      s += th[yy * W + xx]; n++;
    }
    const i = y * W + x;
    const rel = s / n - th[i];
    w.elevMoist[i] = clamp(rel * 0.12, -0.1, 0.14) - clamp((th[i] - 2.5) * 0.02, 0, 0.08);
  }
  w.heightDirty = false;
}

// How much people on the trails bother wildlife nearby (0..1).
export function updateDisturbance(w, traffic) {
  const t = w.terrain, f = w.feature;
  distanceField(w, w.distTrail, i => t[i] === T.TRAIL || f[i] === F.BOARDWALK || (w.marks[i] & 1) || (w.struct[i] >= 0 && w.structures[w.struct[i]]?.visitor), 8);
  const base = 0.08 + 0.92 * clamp(traffic, 0, 1);
  for (let i = 0; i < w.n; i++) {
    const d = w.distTrail[i];
    let v = d > 5 ? 0 : base * (1 - d / 6);
    // screening vegetation softens it
    if (w.canopy[i] > 0.5 || (w.shrub[i] && w.shrubG[i] > 0.6)) v *= 0.7;
    w.disturb[i] = v;
  }
  // people who stay quiet in a viewing blind barely register
  for (let i = 0; i < w.n; i++) {
    if (f[i] !== F.BLIND) continue;
    const x = i % w.w, y = (i / w.w) | 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (w.inb(x + dx, y + dy)) w.disturb[w.idx(x + dx, y + dy)] *= 0.5;
    }
  }
}

export function updateEnvironment(w, month, traffic = 0) {
  if (w.heightDirty) updateElevation(w);
  if (w.hydroDirty) updateHydrology(w);
  updateDisturbance(w, traffic);
  updateCanopy(w);
  updateMoisture(w, month);
  updateDistances(w);
  return classifyAndResources(w, month);
}
