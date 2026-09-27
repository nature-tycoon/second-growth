// Daily plant life: growth, decline, natural seeding, competition, succession, soil building.

import { T, F, GROWTH_BY_MONTH, SPREAD_BY_MONTH, clamp } from '../config.js';
import { PLANTS, PLANT } from '../data/plants.js';
import { layerLight } from './environment.js';

const rangeFit = (v, lo, hi, soft) => v < lo ? Math.max(0, 1 - (lo - v) / soft) : v > hi ? Math.max(0, 1 - (v - hi) / soft) : 1;

export function terrainFit(w, i, p) {
  const t = w.terrain[i];
  if (w.struct[i] >= 0) return 0;
  if (w.feature[i] === F.FENCE && p.layer === 2) return 0;
  if (w.feature[i] === F.CULVERT || w.feature[i] === F.DAM) return 0;
  switch (t) {
    case T.RIVER: case T.POND: case T.CREEK: case T.ROAD: case T.TRAIL: return 0;
    case T.MARSH: return p.aquatic ? 1 : p.wetOK ? 0.8 : 0;
    default:
      if (p.aquatic) return t === T.MUD ? 0.8 : 0;
      switch (t) {
        case T.GRAVEL: return p.key === 'willow' || p.key === 'cottonwood' || p.key === 'alder' ? 0.7 : 0.3;
        case T.FIELD: return 0.85;
        case T.PASTURE: return p.layer === 0 ? 0.55 : 0.75; // old sod competes with seedlings
        case T.MUD: return p.moist[1] >= 0.8 ? 1 : 0.6;
        default: return 1;
      }
  }
}

export function plantSuit(w, i, p) {
  const tf = terrainFit(w, i, p);
  if (!tf) return 0;
  const light = layerLight(w, i, p.layer);
  const soil = w.soil[i];
  const soilFit = soil >= p.soil ? 1 : Math.max(0, 1 - (p.soil - soil) * 3.5);
  let s = tf * rangeFit(w.moist[i], p.moist[0], p.moist[1], 0.18) * rangeFit(light, p.light[0], p.light[1], 0.25) * soilFit;
  if (p.nurse && (w.feature[i] === F.LOG || w.distLog[i] <= 1)) s = Math.min(1, s + 0.3);
  return s;
}

// Explain the limiting factor for a plant on a tile (for the inspector).
export function plantLimits(w, i, p) {
  const out = [];
  if (!terrainFit(w, i, p)) return ['cannot grow on this ground'];
  const light = layerLight(w, i, p.layer);
  if (light < p.light[0] - 0.05) out.push('too shady');
  if (light > p.light[1] + 0.05) out.push('too sunny');
  const m = w.moist[i];
  if (m < p.moist[0] - 0.05) out.push('too dry');
  if (m > p.moist[1] + 0.05) out.push('too wet');
  if (w.soil[i] < p.soil - 0.03) out.push('soil too poor');
  return out;
}

const layerArrays = (w, layer) =>
  layer === 0 ? [w.ground, w.groundG] : layer === 1 ? [w.shrub, w.shrubG] : [w.tree, w.treeG];

// A seed lands on tile i. Returns true if it establishes.
export function trySeed(w, p, i, rng) {
  const [ids, gs] = layerArrays(w, p.layer);
  const cur = ids[i];
  if (cur === p.id) return false;
  const s = plantSuit(w, i, p);
  if (s < 0.3) return false;
  if (cur) {
    const cp = PLANTS[cur];
    const cs = plantSuit(w, i, cp);
    // Struggling residents get replaced by better-suited newcomers; invasives push harder.
    const push = p.compete * (p.invasive && !cp.invasive ? 1 : 0.4);
    if (!((cs < 0.3 && s > cs + 0.2) || (s > cs + 0.1 && rng() < push * (cp.invasive ? 0.2 : 1) * 0.5))) return false;
  }
  // A thick sward of established groundcover is hard for woody seedlings to break through.
  let odds = s;
  if (p.layer > 0 && w.ground[i] && w.groundG[i] > 0.6) {
    const gp = PLANTS[w.ground[i]];
    if (gp.look.type === 'grass' || gp.look.type === 'sedge' || gp.look.type === 'tallgrass') odds *= 0.3;
  }
  if (rng() > odds) return false;
  ids[i] = p.id; gs[i] = 0.04;
  if (p.layer === 2) w.treeAge[i] = 0;
  return true;
}

function disperse(w, p, x, y, rng, radiusBoost) {
  const r = p.radius + radiusBoost;
  const dx = Math.round((rng() * 2 - 1) * r), dy = Math.round((rng() * 2 - 1) * r);
  if (!dx && !dy) return;
  const xx = x + dx, yy = y + dy;
  if (!w.inb(xx, yy)) return;
  trySeed(w, p, w.idx(xx, yy), rng);
}

export function updatePlants(game) {
  const w = game.world, rng = game.rng, m = game.month;
  const gf = GROWTH_BY_MONTH[m], sf = SPREAD_BY_MONTH[m];
  const W = w.w;
  const frugivores = game.frugivoreCount || 0;
  const birdBoost = frugivores > 0 ? 1 : 0;
  const soilRate = 0.00012;

  for (let i = 0; i < w.n; i++) {
    const x = i % W, y = (i / W) | 0;
    let cover = 0;

    // ---- groundcover
    let id = w.ground[i];
    if (id) {
      const p = PLANTS[id];
      const s = plantSuit(w, i, p);
      let g = w.groundG[i];
      if (s >= 0.3) g += p.grow * gf * (s - 0.3) / 0.7 * 1.4;
      else g -= p.grow * 0.5 * (0.3 - s) / 0.3 * (gf > 0.1 ? 1 : 0.3);
      if (g <= 0) { w.ground[i] = 0; w.groundG[i] = 0; }
      else {
        g = Math.min(1, g); w.groundG[i] = g; cover += g;
        if (g > 0.6 && rng() < p.spread * sf * (0.4 + s * 0.6)) disperse(w, p, x, y, rng, 0);
        if (p.nfix) w.soil[i] += 0.0005 * g;
      }
    }

    // ---- shrubs
    id = w.shrub[i];
    if (id) {
      const p = PLANTS[id];
      const s = plantSuit(w, i, p);
      let g = w.shrubG[i];
      if (s >= 0.3) g += p.grow * gf * (s - 0.3) / 0.7 * 1.4;
      else if (g < 0.9) g -= p.grow * 0.5 * (0.3 - s) / 0.3 * (gf > 0.1 ? 1 : 0.3);
      else if (rng() < 0.004 * (0.3 - s) / 0.3) g = 0; // shaded out
      if (g <= 0) { w.shrub[i] = 0; w.shrubG[i] = 0; }
      else {
        g = Math.min(1, g); w.shrubG[i] = g; cover += g;
        if (g > 0.6) {
          const berry = !!p.look.fruit;
          const boost = berry ? birdBoost * 3 : 0;
          if (rng() < p.spread * sf * (berry && frugivores ? 1.5 : 1)) disperse(w, p, x, y, rng, boost);
          // blackberry also creeps by rooting canes
          if (p.key === 'blackberry' && rng() < 0.006 * sf) disperse(w, p, x, y, rng, -1);
        }
        if (p.nfix) w.soil[i] += 0.0005 * g;
      }
    }

    // ---- trees
    id = w.tree[i];
    if (id) {
      const p = PLANTS[id];
      const s = plantSuit(w, i, p);
      let g = w.treeG[i];
      w.treeAge[i] += 1;
      const ageY = w.treeAge[i] / 120;
      let dies = false;
      if (g < 0.95) {
        if (s >= 0.3) g += p.grow * gf * (s - 0.3) / 0.7 * 1.4;
        else if (g < 0.5) g -= p.grow * 0.5 * (0.3 - s) / 0.3 * (gf > 0.1 ? 1 : 0.3);
        else if (rng() < 0.002 * (0.3 - s) / 0.3) dies = true;
      } else if (s >= 0.3) g = Math.min(1, g + p.grow * gf * 0.5);
      else if (rng() < 0.0015 * (0.3 - s) / 0.3) dies = true;
      if (ageY > p.life && rng() < 0.004) dies = true;
      if (g <= 0) { w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0; }
      else if (dies) killTree(w, i, rng);
      else {
        g = Math.min(1, g); w.treeG[i] = g; cover += g * 1.5;
        if (g > 0.75 && rng() < p.spread * sf) disperse(w, p, x, y, rng, 0);
        if (p.nfix) {
          w.soil[i] += 0.0007 * g;
          if (x > 0) w.soil[i - 1] += 0.0002 * g;
          if (x < W - 1) w.soil[i + 1] += 0.0002 * g;
          if (y > 0) w.soil[i - W] += 0.0002 * g;
          if (y < w.h - 1) w.soil[i + W] += 0.0002 * g;
        }
      }
    }

    // ---- features age and rot
    const f = w.feature[i];
    if (f === F.SNAG || f === F.LOG || f === F.BRUSH || f === F.DAM) {
      w.featureAge[i] += 1;
      const ay = w.featureAge[i] / 120;
      if (f === F.SNAG && ay > 8 && rng() < 0.002) { w.feature[i] = F.LOG; w.featureAge[i] = 0; }
      else if (f === F.LOG) { w.soil[i] += 0.0004; if (ay > 25 && rng() < 0.002) { w.feature[i] = 0; w.featureAge[i] = 0; } }
      else if (f === F.BRUSH && ay > 6 && rng() < 0.003) { w.feature[i] = 0; w.soil[i] += 0.05; }
    }

    // ---- soil slowly heals under living cover, faster in the growing season
    w.soil[i] = clamp(w.soil[i] + soilRate * cover * (0.3 + gf), 0, 1);
  }
}

// A big tree that dies leaves a snag (standing) or a log (fallen); snagOdds sets which.
export function killTree(w, i, rng, snagOdds = 0.7) {
  const big = w.treeG[i] > 0.6;
  w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0;
  if (big && !w.feature[i]) {
    w.feature[i] = rng() < snagOdds ? F.SNAG : F.LOG;
    w.featureAge[i] = 0;
  }
}

// Seeds drifting in from outside the property: forest to the north and east,
// wind-blown cottonwood and fireweed, invasives from neighbouring farms to the west,
// and whatever the winter floods leave along the river.
const RAIN = {
  N: ['fir', 'hemlock', 'cedar', 'alder', 'swordfern', 'salal', 'vinemaple', 'salmonberry'],
  E: ['alder', 'maple', 'fir', 'salmonberry', 'snowberry', 'swordfern', 'elderberry'],
  W: ['blackberry', 'blackberry', 'broom', 'canarygrass'],
  S: ['willow', 'cottonwood', 'alder', 'canarygrass', 'dogwood', 'sedge'],
};

export function seedRain(game) {
  const w = game.world, rng = game.rng, m = game.month;
  const sf = SPREAD_BY_MONTH[m];
  const tries = 3;
  for (let k = 0; k < tries; k++) {
    if (rng() > 0.5 * sf) continue;
    const edge = ['N', 'E', 'W', 'S'][Math.floor(rng() * 4)];
    const key = RAIN[edge][Math.floor(rng() * RAIN[edge].length)];
    const p = PLANT[key];
    const depth = Math.floor(rng() * rng() * (p.radius + 4)) ;
    let x, y;
    if (edge === 'N') { x = Math.floor(rng() * w.w); y = depth; }
    else if (edge === 'E') { x = w.w - 1 - depth; y = Math.floor(rng() * w.h); }
    else if (edge === 'W') { x = depth; y = Math.floor(rng() * w.h); }
    else { x = Math.floor(rng() * w.w); y = w.h - 5 - depth - Math.floor(rng() * 3); }
    if (!w.inb(x, y)) continue;
    // difficulty sets how hard the neighbours' invasive seeds press in
    const inv = p.invasive ? (game.diff?.invasives ?? 1) : 1;
    if (inv < 1 && rng() > inv) continue;
    trySeed(w, p, w.idx(x, y), rng);
    if (inv > 1 && rng() < inv - 1) trySeed(w, p, w.idx(x, y), rng);
  }
  // Birds carry berry seeds from far away once they are visiting.
  if (game.frugivoreCount > 0 && rng() < 0.08 * sf) {
    const opts = ['salmonberry', 'elderberry', 'snowberry', 'rose', 'salal', 'oregongrape', 'blackberry'];
    const p = PLANT[opts[Math.floor(rng() * opts.length)]];
    const i = Math.floor(rng() * w.n);
    trySeed(w, p, i, rng);
  }
  // Wind-carried seeds can land anywhere.
  if (rng() < 0.05 * sf) {
    const p = rng() < 0.5 ? PLANT.fireweed : PLANT.cottonwood;
    trySeed(w, p, Math.floor(rng() * w.n), rng);
  }
}
