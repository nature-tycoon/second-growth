// Daily plant life: growth, decline, natural seeding, competition, succession, soil building.

import { T, F, isWater, clamp } from '../config.js';
import { layerLight } from './environment.js';
import { stressYoungPlant } from './ecological-pressure.js';
import { grazedRecruitOdds, grazedSeedlingLost, grazedGrowth, overgrazedLoss } from './grazing.js';

const rangeFit = (v, lo, hi, soft) => v < lo ? Math.max(0, 1 - (lo - v) / soft) : v > hi ? Math.max(0, 1 - (v - hi) / soft) : 1;

export function terrainFit(w, i, p) {
  const t = w.terrain[i];
  if (w.struct[i] >= 0) return 0;
  if (w.feature[i] === F.FENCE && p.layer === 2 && !p.fencePost) return 0; // (living-fence trees grow right in the fence line)
  if (w.feature[i] === F.CULVERT || w.feature[i] === F.DAM) return 0;
  switch (t) {
    case T.RIVER: case T.CREEK: case T.ROAD: case T.TRAIL: return 0;
    case T.POND: {
      if (!p.aquatic) return 0;
      if (p.floating) return 1; // floating foliage belongs on still water, not only muddy banks
      // Emergent reeds occupy the shallow shore, not the whole pond interior.
      const x = i % w.w, y = (i / w.w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (w.inb(x + dx, y + dy)) {
          const t = w.terrain[w.idx(x + dx, y + dy)];
          if (!isWater(t) || t === T.MARSH || t === T.MUD) return 1;
        }
      }
      return 0;
    }
    // Marsh stays open wetland except for explicitly flood-adapted forest specialists;
    // and only a thin scatter of wet-tolerant shrubs, so they can't smother the sedges and rushes
    // (mangroves and peat-swamp specialists are trees that stand in flooded ground)
    case T.MARSH: return p.mangrove || p.swampTree ? 1 : p.aquatic ? 1 : !p.wetOK || p.layer === 2 ? 0 : p.layer === 1 ? 0.45 : 0.8;
    default: {
      const own = w.catalog.definition.terrainFit?.(w, i, p); // a map with ground of its own (the reef: sand, rubble, reef stars)
      if (own != null) return own;
      if (p.aquatic) return t === T.MUD ? 0.8 : 0;
      if (p.mangrove) return t === T.MUD ? 1 : 0.15; // mangroves need their feet in salty mud
      switch (t) {
        // (on crusted hardpan only the pioneers take, rooting in its cracks; everything else needs
        // the crust broken first by loosening the soil or digging half-moon pits)
        case T.GRAVEL: return p.gravelOK ? 0.7 : w.catalog.definition.hardpan ? (p.crustOK ? 0.6 : 0.12) : 0.3;
        case T.FIELD: return 0.85;
        case T.PASTURE: return p.layer === 0 ? 0.55 : 0.75; // old sod competes with seedlings
        case T.MUD: return p.moist[1] >= 0.8 ? 1 : 0.6;
        default: return 1;
      }
    }
  }
}

// light: the light the plant gets, by default its layer's (a sapling waiting under a tree reads the shrub layer's)
export function plantSuit(w, i, p, light) {
  if (p.dune && w.distWater[i] < 4) return 0; // (dune plants stay back from the waves)
  const tf = terrainFit(w, i, p);
  if (!tf) return 0;
  light ??= layerLight(w, i, p.layer);
  const soil = w.soil[i];
  const soilFit = soil >= p.soil ? 1 : Math.max(0, 1 - (p.soil - soil) * (p.soilK ?? 3.5)); // soilK: how sharply poor soil holds a plant back
  let s = tf * rangeFit(w.moist[i], p.moist[0], p.moist[1], 0.18) * rangeFit(light, p.light[0], p.light[1], 0.25) * soilFit;
  if (p.nurse && (w.feature[i] === F.LOG || w.distLog[i] <= 1)) s = Math.min(1, s + 0.3);
  // pioneers of poor ground (dropseed) lose out to better grasses once the soil has recovered
  if (p.pioneer && soil > p.pioneer) s *= Math.max(0.35, 1 - (soil - p.pioneer) * 2.5);
  return s;
}

// Explain the limiting factor for a plant on a tile (for the inspector).
export function plantLimits(w, i, p) {
  const out = [];
  if (!terrainFit(w, i, p)) return [w.waterDepth?.[i] > .04 ? 'standing water: use wetland plants here' : 'cannot grow on this ground'];
  const light = layerLight(w, i, p.layer);
  if (light < p.light[0] - 0.05) out.push('too shady');
  if (light > p.light[1] + 0.05) out.push('too sunny');
  const m = w.moist[i];
  if (m < p.moist[0] - 0.05) out.push('too dry');
  if (m > p.moist[1] + 0.05) out.push('too wet');
  if (w.soil[i] < p.soil - 0.03) out.push('soil too poor');
  const why = w.catalog.definition.groundNote?.(w, i, p); if (why) out.push(why); // (the reef: why coral won't settle on loose rubble or sand)
  if (w.catalog.definition.hardpan && w.terrain[i] === T.GRAVEL && !p.gravelOK && !p.crustOK) out.push(w.catalog.definition.text.hardpanLimit || 'crusted hardpan: loosen it or dig half-moon pits first');
  return out;
}

const layerArrays = (w, layer) =>
  layer === 0 ? [w.ground, w.groundG] : layer === 1 ? [w.shrub, w.shrubG] : [w.tree, w.treeG];

// Recruitment settings (0013 §3), from map data: definition.recruitment: { cndd, understory }.
const CNDD = 0.3; // default strength of conspecific negative density dependence
const UNDER_MAX = 0.25, UNDER_GROW = 0.1; // an understory sapling's cap, and its growth against the open
const UNDER_DEATH = 0.02, UNDER_SHADE_DEATH = 0.25, UNDER_POOR_DEATH = 0.3; // per year

// Janzen–Connell: seed and seedlings die near adults of their own species (pathogens, seed
// predators and herbivores gather there). Returns the share of adult trees (treeG > 0.5) in the
// 5×5 around tile i, the tile's own tree included, that are species id.
function conspecificShare(w, i, id) {
  const W = w.w, x = i % W, y = (i / W) | 0, ids = w.tree, gs = w.treeG;
  let n = 0, same = 0;
  for (let yy = Math.max(0, y - 2); yy <= Math.min(w.h - 1, y + 2); yy++) {
    for (let xx = Math.max(0, x - 2), j = yy * W + xx, end = yy * W + Math.min(W - 1, x + 2); j <= end; j++) {
      if (ids[j] && gs[j] > 0.5) { n++; if (ids[j] === id) same++; }
    }
  }
  return n ? same / n : 0;
}

// A natural seed lands on tile i (player planting doesn't come through here). Returns true if it
// establishes. A tree seed landing under a living tree can only wait in the understory slot.
export function trySeed(w, p, i, rng) {
  const def = w.catalog.definition;
  const [ids, gs] = layerArrays(w, p.layer);
  const cur = ids[i];
  if (cur === p.id) return false;
  // One canopy tree per tile: a seed cannot remove a living tree, its age or its wood. Under an
  // established tree, a sapling that can take the shade there waits for it to die (advance
  // regeneration, 0013 §3): the shade-tolerant cedar and hemlock almost anywhere, fir only under
  // a thin canopy, alder and cottonwood hardly ever. Under a young tree the seed just fails.
  let under = false;
  if (cur && p.layer === 2 && (!def.look.underwater || p.cay)) {
    if (def.recruitment?.understory === false || w.treeG[i] <= ESTABLISHED_TREE || w.understory[i] === p.id) return false;
    under = true;
  }
  const underLight = under ? layerLight(w, i, 1) : 0;
  if (under && underLight < p.light[0]) return false;
  // Sparse species recruit into gaps, counting juveniles too so a batch of settlers can't
  // fill one patch. This only limits natural recruitment; adults and player planting keep
  // their usual suitability. Wider dispersal lets larvae reach gaps beyond their parent.
  if (p.seedSpacing) {
    const r = p.seedSpacing, x = i % w.w, y = (i / w.w) | 0;
    for (let yy = Math.max(0, y - r); yy <= Math.min(w.h - 1, y + r); yy++) {
      for (let xx = Math.max(0, x - r); xx <= Math.min(w.w - 1, x + r); xx++) {
        if (ids[yy * w.w + xx] === p.id) return false;
      }
    }
  }
  const s = under ? plantSuit(w, i, p, underLight) : plantSuit(w, i, p);
  if (s < 0.3) return false;
  // a healthy native seed bank in the soil stands in the way of invasive seedlings
  if (p.invasive && w.seedbank && w.seedbank[i] && w.bankStrength > 0 && rng() < w.bankStrength * 0.85) return false;
  // On maps where natives hold their ground (the suburb), an established native garden is a closed
  // community: invasive seed rarely finds a gap in it.
  if (w.catalog.definition.nativesHold && p.invasive) {
    const est = (id, g) => id && g > 0.45 && !w.catalog.plants[id].invasive && !w.catalog.plants[id].exotic;
    if ((est(w.ground[i], w.groundG[i]) || est(w.shrub[i], w.shrubG[i]) || est(w.tree[i], w.treeG[i])) && rng() > 0.03) return false;
  }
  if (under) {
    // it takes the slot from a weaker or less shade-tolerant sapling waiting there
    const uc = w.understory[i];
    if (uc) {
      const up = w.catalog.plants[uc];
      if (!(p.light[0] < up.light[0] - 0.05 || s > plantSuit(w, i, up, underLight) + 0.15)) return false;
    }
  } else if (cur) {
    const cp = w.catalog.plants[cur];
    const cs = plantSuit(w, i, cp);
    // Struggling residents get replaced by better-suited newcomers; invasives push harder.
    const push = p.compete * (p.invasive && !cp.invasive ? 1 : 0.4);
    if (!((cs < 0.3 && s > cs + 0.2) || (s > cs + 0.1 && rng() < push * (cp.invasive ? 0.2 : 1) * 0.5))) return false;
  }
  // Managed gardens and grazing paddocks keep their native meadow gaps: trees and shrubs
  // grow where planted, or on bare and neglected ground. A map can limit this to its paddocks.
  const holdsMeadow = typeof w.catalog.definition.meadowsHold === 'function' ? w.catalog.definition.meadowsHold(w, i) : w.catalog.definition.meadowsHold;
  if (holdsMeadow && p.layer > 0 && w.ground[i] && w.groundG[i] > 0.35 && !w.catalog.plants[w.ground[i]].invasive && (!p.invasive || rng() < (w.catalog.definition.nativesHold ? 0.97 : 0.85))) return false;
  // A thick sward of established groundcover is hard for woody seedlings to break through.
  let odds = s;
  const open = w.catalog.definition.savanna && w.distWater[i] > 3; // savanna, away from the riverine strip
  if (p.layer > 0 && w.ground[i] && w.groundG[i] > 0.6) {
    const gp = w.catalog.plants[w.ground[i]];
    if (gp.look.type === 'grass' || gp.look.type === 'sedge' || gp.look.type === 'tallgrass') odds *= open ? 0.1 : 0.3;
    else if (gp.smother) odds *= gp.smother; // (a creeper that blankets the ground, like Sumatra's Chinese violet)
  }
  odds *= grazedRecruitOdds(w, i, p); // and herds crop or tread most of what comes up where they feed
  if (p.invasive) odds *= w.invasiveOdds; // (Relaxed: fewer invasive seedlings take, wherever the seed came from)
  // On the savanna the roots of a grown tree take all the water around it, so native seedlings
  // only come up in the gaps and the trees stay scattered (invasive mesquite still makes thickets).
  if (open && p.layer === 2 && !p.invasive && (under || crowded(w, i, 1, 'tree', 2))) return false;
  // and thornbush stays in clumps and patches rather than closing over the grass
  if (open && p.layer === 1 && !p.invasive && crowded(w, i, 1, 'shrub')) return false;
  // fewer of a tree's seedlings survive among its own kind (checked last: it's the costly part)
  if (p.layer === 2) {
    const k = p.cndd ?? def.recruitment?.cndd ?? CNDD;
    if (k > 0) odds *= 1 - k * conspecificShare(w, i, p.id);
  }
  if (rng() > odds) return false;
  if (under) { w.understory[i] = p.id; w.understoryG[i] = 0.04; return true; }
  ids[i] = p.id; gs[i] = 0.04;
  if (p.layer === 2) w.treeAge[i] = 0;
  return true;
}

// On the savanna a young shrub or tree in thick grass loses the dry-season fight for water:
// grass roots get to it first. Most seedlings die unless fire, grazing or a gap opens the sward.
const GRASS_LOOK = { grass: 1, tallgrass: 1, sedge: 1 };
function droughtKills(w, i, g, gf, rng) {
  if (!w.catalog.definition.savanna || gf >= 0.6 || g >= 0.45 || w.distWater[i] <= 3) return false;
  const gi = w.ground[i];
  return !!gi && w.groundG[i] > 0.6 && GRASS_LOOK[w.catalog.plants[gi].look.type] && rng() < 0.012;
}

// A tree's yearly death hazard (0013 §2): flat background mortality, a steep rise with old age, and
// stress on a poor site or in shade it can't take. Returns { h, age }, where age is the part of h
// counted as death by age (background and senescence); the rest is stress. The day's chance is h/120.
// Map data can scale the new terms (definition.mortality: { background, senescence, stress, suppression }).
const MORT = { background: 0.4, senesceFrom: 0.7, senesce: 0.05, stress: 0.03, stressSuit: 0.6, poorSite: 0.2, suppress: 0.03 };
const hz = { h: 0, age: 0 };
export function treeHazard(w, i, p, s, g, ageY, m) {
  const a = (ageY / p.life - MORT.senesceFrom) / (1 - MORT.senesceFrom);
  hz.age = (p.mortality ?? clamp(MORT.background / p.life, 0.002, 0.02)) * (m.background ?? 1)
    + (a > 0 ? MORT.senesce * a * a * a * (m.senescence ?? 1) : 0);
  let stress = 0;
  if (s < MORT.stressSuit) stress += MORT.stress * (1 - s / MORT.stressSuit) * (m.stress ?? 1);
  // a grown tree on a site gone bad (too wet, too dry, too shady) dies within a few years; a young
  // one shrinks away instead (the growth step above). Every map has this, as before the hazard.
  if (s < 0.3 && g >= 0.5) stress += MORT.poorSite * (0.3 - s) / 0.3;
  // suppression: a tree still below the canopy, shaded by its neighbours more than it can take
  if (p.light[0] > 0 && g < 0.95) {
    const short = p.light[0] - layerLight(w, i, 2);
    if (short > 0) stress += MORT.suppress * Math.min(1, short / p.light[0]) * Math.min(1, (0.95 - g) / 0.45) * (m.suppression ?? 1);
  }
  hz.h = hz.age + stress;
  return hz;
}

// A sapling waiting under the tile's tree: it grows very slowly, held at UNDER_MAX until the tree
// above it dies (removeTree releases it), and dies now and then, sooner in shade it can't take or on
// a poor site. Browsers nip it through the same rules as any seedling (0011), which under a canopy
// are mostly off.
function understoryDay(w, i, gf, rng) {
  const p = w.catalog.plants[w.understory[i]], L = layerLight(w, i, 1);
  const s = plantSuit(w, i, p, L);
  let g = w.understoryG[i];
  if (s >= 0.3 && g < UNDER_MAX) g = Math.min(UNDER_MAX, g + p.grow * gf * (s - 0.3) / 0.7 * 1.4 * UNDER_GROW * grazedGrowth(w, i, p, g));
  const short = p.light[0] - L;
  const h = UNDER_DEATH + (short > 0 ? UNDER_SHADE_DEATH * Math.min(1, short / p.light[0]) : 0) + (s < 0.3 ? UNDER_POOR_DEATH : 0);
  if (rng() * 120 < h || grazedSeedlingLost(w, i, p, g, rng)) { w.understory[i] = 0; w.understoryG[i] = 0; }
  else w.understoryG[i] = g;
}

// The understory sapling on tile i dies with whatever killed it (fire, a flood, the player clearing the tile).
export function clearUnderstory(w, i) { w.understory[i] = 0; w.understoryG[i] = 0; }

// Grown plants of a layer on the tiles around (at least `need` of them, within r tiles).
function crowded(w, i, need, layer = 'tree', r = 1) {
  const W = w.w, x = i % W, y = (i / W) | 0, ids = w[layer], gs = w[layer + 'G'];
  let n = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (!dx && !dy) continue;
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= W || yy >= w.h) continue;
    const j = yy * W + xx;
    if (ids[j] && gs[j] > 0.5 && ++n >= need) return true;
  }
  return false;
}

function disperse(w, p, x, y, rng, radiusBoost) {
  const r = p.radius + radiusBoost;
  // Most groundcover seed lands near its parent, growing a drift outwards. A few seeds
  // still reach the full dispersal radius; animal-carried and woody seed keep their range.
  const offset = () => { const u = rng() * 2 - 1; return Math.round(r * (p.layer === 0 && !p.aquatic ? Math.sign(u) * Math.pow(Math.abs(u), 1.6) : u)); };
  const dx = offset(), dy = offset();
  if (!dx && !dy) return;
  const xx = x + dx, yy = y + dy;
  if (!w.inb(xx, yy)) return;
  trySeed(w, p, w.idx(xx, yy), rng);
}

export function updatePlants(game) {
  const w = game.world, rng = game.rng, m = game.month;
  const ecology = !!game.diff?.ecology;
  const gf = game.catalog.definition.climate.growth[m], sf = game.catalog.definition.climate.spread[m];
  const W = w.w;
  const frugivores = game.frugivoreCount || 0;
  // trees that depend on one animal to carry their seed (a Brazil nut needs agoutis to bury its nuts)
  const disperserMult = [];
  for (const p of game.catalog.plants) if (p && p.disperser) {
    const a = game.wildlife?.state && game.catalog.animal[p.disperser];
    disperserMult[p.id] = a && game.wildlife.state[a.index].pop > 0 ? 1.6 : 0.12;
  }
  const birdBoost = frugivores > 0 ? 1 : 0;
  const soilRate = 0.00012;
  // The seed bank: every tile remembers the last native groundcover that grew well on it. When
  // the land is healthy (plenty of native cover), those buried seeds come back up on bare or
  // burned ground and slowly crowd out invasive weeds, instead of the weeds taking the gaps.
  const bank = game.catalog.definition.seedbank ? (w.seedbank || (w.seedbank = new Uint16Array(w.n))) : null;
  const nativeFrac = w.stats?.land ? w.stats.native / w.stats.land : 0;
  w.bankStrength = bank ? clamp((nativeFrac - 0.3) / 0.35, 0, 1) : 0;
  const bankK = w.bankStrength;
  w.invasiveOdds = Math.min(1, game.diff?.invasives ?? 1);
  const mort = game.catalog.definition.mortality || {};

  for (let i = 0; i < w.n; i++) {
    const x = i % W, y = (i / W) | 0;
    let cover = 0;

    // ---- groundcover
    let id = w.ground[i];
    if (id) {
      const p = game.catalog.plants[id];
      const s = plantSuit(w, i, p);
      let g = w.groundG[i];
      if (s >= 0.3) g += p.grow * gf * (s - 0.3) / 0.7 * 1.4;
      else g -= p.grow * 0.5 * (0.3 - s) / 0.3 * (gf > 0.1 ? 1 : 0.3);
      if (!p.aquatic && g > 0.15) g = Math.max(0.15, g - overgrazedLoss(w, i)); // a crowded herd crops it short
      if (g <= 0) { w.ground[i] = 0; w.groundG[i] = 0; }
      else {
        g = Math.min(1, g); w.groundG[i] = g; cover += g;
        if (g > 0.6 && rng() < p.spread * sf * (0.4 + s * 0.6)) disperse(w, p, x, y, rng, 0);
        if (p.nfix) w.soil[i] += 0.0005 * g;
        if (bank && !p.invasive && !p.weedy && g > 0.6) bank[i] = id;
        // an invasive on native seed bank, in a healthy ecosystem, is slowly shaded out by natives
        else if (bank && p.invasive && bank[i] && bankK > 0 && gf > 0.5 && rng() < 0.006 * bankK) {
          const np = game.catalog.plants[bank[i]];
          if (plantSuit(w, i, np) > 0.3) { w.ground[i] = np.id; w.groundG[i] = 0.2; }
        }
      }
    } else if (bank && bank[i] && bankK > 0 && gf > 0.5 && rng() < 0.03 * bankK) {
      // bare ground with native seed in it: they sprout once the rains come
      const np = game.catalog.plants[bank[i]];
      if (w.terrain[i] !== T.ROAD && w.terrain[i] !== T.TRAIL && plantSuit(w, i, np) > 0.3) { w.ground[i] = np.id; w.groundG[i] = 0.06; }
    }

    // ---- shrubs
    id = w.shrub[i];
    if (id) {
      const p = game.catalog.plants[id];
      const s = plantSuit(w, i, p);
      let g = w.shrubG[i];
      if (s >= 0.3) g += p.grow * gf * (s - 0.3) / 0.7 * 1.4 * grazedGrowth(w, i, p, g);
      else if (g < 0.9) g -= p.grow * 0.5 * (0.3 - s) / 0.3 * (gf > 0.1 ? 1 : 0.3);
      else if (rng() < 0.004 * (0.3 - s) / 0.3) g = 0; // shaded out
      if (droughtKills(w, i, g, gf, rng) || grazedSeedlingLost(w, i, p, g, rng)) g = 0;
      // weedy bushes on healthy grassland lose out over the years (a thick native sward, hotter
      // grass fires and browsing all work against them)
      else if (bank && p.invasive && bank[i] && bankK > 0 && w.ground[i] && !game.catalog.plants[w.ground[i]].invasive && w.groundG[i] > 0.5 && rng() < 0.0025 * bankK) g = 0;
      if (ecology && g > 0) g = stressYoungPlant(game, i, p, g);
      if (g <= 0) { w.shrub[i] = 0; w.shrubG[i] = 0; }
      else {
        g = Math.min(1, g); w.shrubG[i] = g; cover += g;
        if (g > 0.6) {
          const berry = !!p.look.fruit;
          const boost = berry ? birdBoost * 3 : 0;
          if (rng() < p.spread * sf * (berry && frugivores ? 1.5 : 1)) disperse(w, p, x, y, rng, boost);
          // blackberry also creeps by rooting canes
          if (p.birdSpread && rng() < 0.006 * sf) disperse(w, p, x, y, rng, -1);
        }
        if (p.nfix) w.soil[i] += 0.0005 * g;
      }
    }

    // ---- trees
    id = w.tree[i];
    if (id) {
      const p = game.catalog.plants[id];
      const s = plantSuit(w, i, p);
      let g = w.treeG[i];
      w.treeAge[i] += 1;
      let dies = null, lost = 'stress'; // dies: the cause of a death that leaves deadwood; lost: why g fell to 0
      if (g < 0.95) {
        if (s >= 0.3) g += p.grow * gf * (s - 0.3) / 0.7 * 1.4 * grazedGrowth(w, i, p, g);
        else if (g < 0.5) g -= p.grow * 0.5 * (0.3 - s) / 0.3 * (gf > 0.1 ? 1 : 0.3);
      } else if (s >= 0.3) g = Math.min(1, g + p.grow * gf * 0.5);
      // Sustained inundation, rather than the day a dam is built, creates snags.
      if (w.waterWetDays?.[i] >= 30 && w.waterDepth[i] > .15 && !p.wetOK) dies = 'flood';
      const haz = treeHazard(w, i, p, s, g, w.treeAge[i] / 120, mort), r = rng() * 120;
      if (r < haz.h) dies ||= r < haz.age ? 'age' : 'stress';
      else if (droughtKills(w, i, g, gf, rng)) { g = 0; lost = 'drought'; }
      else if (grazedSeedlingLost(w, i, p, g, rng)) { g = 0; lost = 'browse'; }
      else if (bank && p.invasive && bank[i] && bankK > 0 && w.ground[i] && !game.catalog.plants[w.ground[i]].invasive && w.groundG[i] > 0.5 && rng() < 0.0012 * bankK) g = 0;
      // savanna: in the dry months, trees packed into a thicket run short of water and some die back
      else if (game.catalog.definition.savanna && gf < 0.6 && !p.invasive && w.distWater[i] > 3 && rng() < 0.006 && crowded(w, i, 3)) dies = 'drought';
      if (ecology && !dies && g > 0) g = stressYoungPlant(game, i, p, g);
      if (g <= 0) removeTree(w, i, lost, rng, { deadwood: false });
      else if (dies) removeTree(w, i, dies, rng);
      else {
        g = Math.min(1, g); w.treeG[i] = g; cover += g * 1.5;
        if (g > 0.75 && rng() < p.spread * sf * (disperserMult[p.id] ?? 1)) disperse(w, p, x, y, rng, 0);
        if (p.nfix) {
          w.soil[i] += 0.0007 * g;
          if (x > 0) w.soil[i - 1] += 0.0002 * g;
          if (x < W - 1) w.soil[i + 1] += 0.0002 * g;
          if (y > 0) w.soil[i - W] += 0.0002 * g;
          if (y < w.h - 1) w.soil[i + W] += 0.0002 * g;
        }
      }
      if (w.understory[i]) understoryDay(w, i, gf, rng);
    }

    // ---- features age and rot
    const f = w.feature[i];
    if (f === F.SNAG || f === F.LOG || f === F.BRUSH || f === F.DAM || f === F.STUMP) {
      w.featureAge[i] += 1;
      const ay = w.featureAge[i] / 120;
      // On the savanna, dead wood doesn't last: the yearly fires, termites and elephants bring a
      // standing dead tree down within a couple of years and clear the log away soon after.
      const sav = game.catalog.definition.savanna;
      if (f === F.SNAG && ay > (sav ? 2 : 8) && rng() < (sav ? 0.01 : 0.002)) { w.feature[i] = F.LOG; w.featureAge[i] = 0; }
      else if (f === F.LOG) { w.soil[i] += 0.0004; if (ay > (sav ? 4 : 25) && rng() < (sav ? 0.01 : 0.002)) { w.feature[i] = 0; w.featureAge[i] = 0; } }
      else if (f === F.BRUSH && ay > 6 && rng() < 0.003) { w.feature[i] = 0; w.soil[i] += 0.05; }
      else if (f === F.STUMP && ay > 2 && rng() < 0.004) { w.feature[i] = 0; w.featureAge[i] = 0; w.soil[i] += 0.04; }
    }

    // ---- soil slowly heals under living cover, faster in the growing season
    w.soil[i] = clamp(w.soil[i] + soilRate * cover * (0.3 + gf), 0, 1);
    if (ecology && w.mulchDays?.[i] > 0) w.mulchDays[i]--;
  }
}

// Why a tree died (docs/decisions/0013-succession-dynamics.md): 'age' (background and old-age
// mortality), 'stress' (a poor site, shade or competition), 'fire', 'wind', 'drought', 'pathogen',
// 'flood', 'browse' (and trampling), 'beaver' or 'player'.
const SNAG_ODDS = { fire: 0.7, wind: 0.15 }; // a fire kills trees standing; a storm throws them down
// Deaths that take the understory sapling with the tree: fire burns it (thin bark, low down),
// standing water drowns it, and the player removing a tree means to clear the tile.
const KILLS_UNDERSTORY = { fire: 1, flood: 1, player: 1 };
export const ESTABLISHED_TREE = 0.35; // a tree this grown counts as established (the succession check's "tree")

// The one way a living tree leaves its tile. A big tree leaves a snag (standing) or a log (fallen):
// snagOdds sets which, by cause unless given. minG: how grown it must be to leave either (a fire
// burns smaller trees up entirely). deadwood: false leaves nothing at all, not even the map's
// deadTree remains (saplings trampled or burned, player removal that leaves its own stump).
// Deaths are counted by cause in w.treeDeaths (every tree) and w.treeDeathsEst (established
// ones); both restart at load, and are for diagnostics and the succession check.
export function removeTree(w, i, cause, rng, { snagOdds = SNAG_ODDS[cause] ?? 0.7, minG = 0.6, deadwood = true } = {}) {
  const g = w.treeG[i];
  const all = w.treeDeaths, est = w.treeDeathsEst;
  all[cause] = (all[cause] || 0) + 1;
  if (g > ESTABLISHED_TREE) est[cause] = (est[cause] || 0) + 1;
  w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0;
  // advance regeneration (0013 §3): a sapling waiting underneath takes the slot at its own size,
  // a head start no new seed can match
  const u = w.understory[i];
  if (u) {
    if (!KILLS_UNDERSTORY[cause]) {
      w.tree[i] = u; w.treeG[i] = Math.max(0.04, w.understoryG[i]);
      const k = w.catalog.plants[u].key; w.understoryReleased[k] = (w.understoryReleased[k] || 0) + 1;
    }
    w.understory[i] = 0; w.understoryG[i] = 0;
  }
  if (!deadwood) return;
  if (w.catalog.definition.savanna) snagOdds *= 0.35; // (on the savanna a dead tree mostly falls: fire, termites and elephants)
  if (w.catalog.definition.deadTree) { w.catalog.definition.deadTree(w, i); return; } // (the reef: dead coral breaks down into rubble, not snags and logs)
  if (g > minG && !w.feature[i]) {
    w.feature[i] = rng() < snagOdds ? F.SNAG : F.LOG;
    w.featureAge[i] = 0;
  }
}

// Seeds drifting in from outside the property: forest to the north and east,
// wind-blown cottonwood and fireweed, invasives from neighbouring farms to the west,
// and whatever the winter floods leave along the river.

export function seedRain(game) {
  const w = game.world, rng = game.rng, m = game.month;
  const sf = game.catalog.definition.climate.spread[m];
  const tries = 3;
  for (let k = 0; k < tries; k++) {
    if (rng() > 0.5 * sf) continue;
    const edge = ['N', 'E', 'W', 'S'][Math.floor(rng() * 4)];
    const src = game.catalog.definition.seedRain[edge];
    if (!src || !src.length) continue;
    const key = src[Math.floor(rng() * src.length)];
    const p = game.catalog.plant[key];
    const depth = Math.floor(rng() * rng() * (p.radius + 4)) ;
    let x, y;
    if (edge === 'N') { x = Math.floor(rng() * w.w); y = depth; }
    else if (edge === 'E') { x = w.w - 1 - depth; y = Math.floor(rng() * w.h); }
    else if (edge === 'W') { x = depth; y = Math.floor(rng() * w.h); }
    else { x = Math.floor(rng() * w.w); y = w.h - 5 - depth - Math.floor(rng() * 3); }
    if (!w.inb(x, y)) continue;
    // on Challenging the neighbours' invasive seeds press in harder (Relaxed's lighter touch is
    // w.invasiveOdds in trySeed, which covers seed from plants already on the land too)
    const inv = p.invasive ? (game.diff?.invasives ?? 1) : 1;
    trySeed(w, p, w.idx(x, y), rng);
    if (inv > 1 && rng() < inv - 1) trySeed(w, p, w.idx(x, y), rng);
  }
  // Birds carry berry seeds from far away once they are visiting.
  if (game.frugivoreCount > 0 && rng() < 0.08 * sf) {
    const opts = game.catalog.definition.berrySeeds;
    const p = game.catalog.plant[opts[Math.floor(rng() * opts.length)]];
    const i = Math.floor(rng() * w.n);
    trySeed(w, p, i, rng);
  }
  // Wind-carried seeds can land anywhere.
  if (rng() < 0.05 * sf) {
    const p = game.catalog.plant[game.catalog.definition.windSeeds[Math.floor(rng() * game.catalog.definition.windSeeds.length)]];
    trySeed(w, p, Math.floor(rng() * w.n), rng);
  }
}

// Roots loosen compacted ground. Where native plants have taken hold on an old plowed field or
// pasture sod (deep-rooted wildflowers, bunchgrasses, legumes, then shrubs and trees), their roots
// open channels that worms and soil life follow, and over a few years the hardpan breaks up on its
// own, the way farmers use deep-rooted cover crops. It takes a patch of them, not one plant, and it
// doesn't happen where herds trample the ground every day. Checked every few days: most of a field in about five years.
const rooted = (w, i) => {
  const gp = w.catalog.plants[w.ground[i]], sp = w.catalog.plants[w.shrub[i]], tp = w.catalog.plants[w.tree[i]];
  const ok = p => p && !p.invasive && !p.exotic && !p.sod && !p.weedy;
  return (ok(gp) && w.groundG[i] >= 0.5) || (ok(sp) && w.shrubG[i] >= 0.4) || (ok(tp) && w.treeG[i] >= 0.35);
};
export function rootsLoosen(game) {
  const w = game.world, W = w.w, rng = game.rng;
  for (let i = 0; i < w.n; i++) {
    const t = w.terrain[i];
    if (t !== T.FIELD && t !== T.PASTURE && !(game.catalog.definition.hardpan && t === T.GRAVEL)) continue; // (and crusted hardpan)
    if (t === T.PASTURE && game.catalog.definition.sandBed) continue; // (the reef's sand is meant to be sand)
    if ((w.trod && w.trod[i] > 0.1) || !rooted(w, i) || rng() > 0.008) continue;
    const x = i % W, y = (i / W) | 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && w.inb(x + dx, y + dy) && rooted(w, i + dy * W + dx)) n++;
    if (n < 5) continue;
    w.terrain[i] = T.SOIL;
    w.soil[i] = Math.min(1, w.soil[i] + 0.04);
    game.stats.rootLoosened = (game.stats.rootLoosened || 0) + 1;
  }
}
