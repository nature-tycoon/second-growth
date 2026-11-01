// Daily plant life: growth, decline, natural seeding, competition, succession, soil building.

import { T, F, PLACED, isWater, clamp } from '../config.js';
import { layerLight } from './environment.js';
import { stressYoungPlant } from './ecological-pressure.js';
import { grazedRecruitOdds, grazedSeedlingLost, grazedGrowth, overgrazedLoss, grazedForbEdge, elephantFelled, trampledSeedling } from './grazing.js';
import { plantAffinity } from '../plant-patterns.js';

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
  if (p.nurse) s = Math.min(1, s + nurseBonus(w, i)); // (nurse logs, 0028 §5)
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

// Recruitment settings (0028 §3), from map data: definition.recruitment: { cndd, understory }.
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

// (w.seedLog, when a diagnostic sets it, hears why each seed failed: tools/plant-establishment.mjs)
const no = (w, p, i, why) => { w.seedLog?.(p, i, why); return false; };

// A natural seed lands on tile i (player planting doesn't come through here). Returns true if it
// establishes. A tree seed landing under a living tree can only wait in the understory slot.
export function trySeed(w, p, i, rng) {
  const def = w.catalog.definition;
  const [ids, gs] = layerArrays(w, p.layer);
  const cur = ids[i];
  if (cur === p.id) return no(w, p, i, 'same');
  // One canopy tree per tile: a seed cannot remove a living tree, its age or its wood. Under an
  // established tree, a sapling that can take the shade there waits for it to die (advance
  // regeneration, 0028 §3): the shade-tolerant cedar and hemlock almost anywhere, fir only under
  // a thin canopy, alder and cottonwood hardly ever. Under a young tree the seed just fails.
  let under = false;
  if (cur && p.layer === 2 && (!def.look.underwater || p.cay)) {
    if (def.recruitment?.understory === false || w.treeG[i] <= ESTABLISHED_TREE || w.understory[i] === p.id) return no(w, p, i, 'occupied');
    under = true;
  }
  const underLight = under ? layerLight(w, i, 1) : 0;
  if (under && underLight < p.light[0]) return no(w, p, i, 'unsuited');
  // Sparse species recruit into gaps, counting juveniles too so a batch of settlers can't
  // fill one patch. This only limits natural recruitment; adults and player planting keep
  // their usual suitability. Wider dispersal lets larvae reach gaps beyond their parent.
  if (p.seedSpacing) {
    const r = p.seedSpacing, x = i % w.w, y = (i / w.w) | 0;
    for (let yy = Math.max(0, y - r); yy <= Math.min(w.h - 1, y + r); yy++) {
      for (let xx = Math.max(0, x - r); xx <= Math.min(w.w - 1, x + r); xx++) {
        if (ids[yy * w.w + xx] === p.id) return no(w, p, i, 'spacing');
      }
    }
  }
  const s = under ? plantSuit(w, i, p, underLight) : plantSuit(w, i, p);
  if (s < 0.3) return no(w, p, i, 'unsuited');
  // a healthy native seed bank in the soil stands in the way of invasive seedlings
  if (p.invasive && w.seedbank && w.seedbank[i] && w.bankStrength > 0 && rng() < w.bankStrength * 0.85) return no(w, p, i, 'seedbank');
  // On maps where natives hold their ground (the suburb), an established native garden is a closed
  // community: invasive seed rarely finds a gap in it.
  if (w.catalog.definition.nativesHold && p.invasive) {
    const est = (id, g) => id && g > 0.45 && !w.catalog.plants[id].invasive && !w.catalog.plants[id].exotic;
    if ((est(w.ground[i], w.groundG[i]) || est(w.shrub[i], w.shrubG[i]) || est(w.tree[i], w.treeG[i])) && rng() > 0.03) return no(w, p, i, 'natives');
  }
  if (under) {
    // it takes the slot from a weaker or less shade-tolerant sapling waiting there
    const uc = w.understory[i];
    if (uc) {
      const up = w.catalog.plants[uc];
      if (!(p.light[0] < up.light[0] - 0.05 || s > plantSuit(w, i, up, underLight) + 0.15)) return no(w, p, i, 'occupied');
    }
  } else if (cur) {
    const cp = w.catalog.plants[cur];
    const cs = plantSuit(w, i, cp);
    // Struggling residents get replaced by better-suited newcomers; invasives push harder.
    const push = p.compete * (p.invasive && !cp.invasive ? 1 : 0.4);
    // On equally good ground a long-lived native slowly takes over from a short-lived one (annual
    // weeds and pioneer legumes give way to bunchgrasses and perennials): succession in the sward.
    const outlives = !p.invasive && !cp.invasive && !cp.exotic && s >= cs && p.life >= cp.life * 2;
    // (and where grazers keep the grass short, a wildflower gets in as if it were better suited: 0033)
    if (!((cs < 0.3 && s > cs + 0.2) || ((s > cs + 0.1 || outlives || grazedForbEdge(w, i, p, cp)) && rng() < push * (cp.invasive ? 0.2 : 1) * (s > cs + 0.1 || !outlives ? 0.5 : OUTLIVE)))) return no(w, p, i, 'resident');
  }
  // Managed gardens and grazing paddocks keep their native meadow gaps: trees and shrubs
  // grow where planted, or on bare and neglected ground. A map can limit this to its paddocks.
  // (Only a sunny meadow is held open: ferns and woodland flowers under a fallen tree are forest floor.)
  const holdsMeadow = typeof w.catalog.definition.meadowsHold === 'function' ? w.catalog.definition.meadowsHold(w, i) : w.catalog.definition.meadowsHold;
  if (holdsMeadow && p.layer > 0 && w.ground[i] && w.groundG[i] > 0.35 && w.catalog.plants[w.ground[i]].light[0] >= MEADOW_LIGHT && !w.catalog.plants[w.ground[i]].invasive && (!p.invasive || rng() < (w.catalog.definition.nativesHold ? 0.97 : 0.85))) return no(w, p, i, 'meadow');
  // A thick sward of established groundcover is hard for woody seedlings to break through (a
  // nurse-log seedling up on a rotten log is above it).
  let odds = s;
  const open = w.catalog.definition.savanna && w.distWater[i] > 3; // savanna, away from the riverine strip
  if (p.layer > 0 && w.ground[i] && w.groundG[i] > 0.6 && !(p.nurse && rottenLog(w, i))) {
    const gp = w.catalog.plants[w.ground[i]];
    if (gp.look.type === 'grass' || gp.look.type === 'sedge' || gp.look.type === 'tallgrass') odds *= open ? 0.1 : 0.3;
    else if (gp.smother) odds *= gp.smother; // (a creeper that blankets the ground, like Sumatra's Chinese violet)
  }
  odds *= grazedRecruitOdds(w, i, p); // and herds crop or tread most of what comes up where they feed
  if (p.invasive) odds *= w.invasiveOdds; // (Relaxed: fewer invasive seedlings take, wherever the seed came from)
  // On the savanna the roots of a grown tree take all the water around it, so native seedlings
  // only come up in the gaps and the trees stay scattered (invasive mesquite still makes thickets).
  if (open && p.layer === 2 && !p.invasive && (under || crowded(w, i, 1, 'tree', 2))) return no(w, p, i, 'crowded');
  // and thornbush stays in clumps and patches rather than closing over the grass
  if (open && p.layer === 1 && !p.invasive && crowded(w, i, 1, 'shrub')) return no(w, p, i, 'crowded');
  // fewer of a tree's seedlings survive among its own kind (checked last: it's the costly part)
  if (p.layer === 2) {
    const k = p.cndd ?? def.recruitment?.cndd ?? CNDD;
    if (k > 0) odds *= 1 - k * conspecificShare(w, i, p.id);
  }
  // Each species keeps to its own patches and drifts (the same noise seed mixes use), so wild
  // plants grow as a mosaic of clumps rather than an even carpet of whatever arrived first.
  // (Invasives keep their even, smothering spread, which the difficulty setting tunes.)
  if (!p.invasive) odds *= patchOdds(p, i % w.w, (i / w.w) | 0);
  if (rng() > odds) return no(w, p, i, 'odds');
  w.seedLog?.(p, i, under ? 'waits' : null);
  if (under) { w.understory[i] = p.id; w.understoryG[i] = 0.04; return true; }
  ids[i] = p.id; gs[i] = 0.04;
  if (p.layer === 2) w.treeAge[i] = 0;
  return true;
}

// How much of a natural recruit's chance survives on tile (x, y) for its species' patches (0027).
export const patchOdds = (p, x, y) => Math.min(1, Math.max(0.08, Math.sqrt(plantAffinity(p, x, y))));
const MEADOW_LIGHT = 0.3; // a groundcover needing at least this much sun is a meadow plant
const OUTLIVE = 0.25; // how hard a long-lived native presses on a short-lived one (vs 0.5 for a better-suited one)
const CANOPY_G = 0.6; // a tree this grown has its crown up in the canopy, in the sun
const TUSSOCK_LIFE = 10; // groundcovers living this long or longer age and break up, opening a gap
const SCORCH = 0.012; // daily die-back of a shade plant stranded in full sun

// On the savanna a young shrub or tree in thick grass loses the dry-season fight for water:
// grass roots get to it first. Most seedlings die unless fire, grazing or a gap opens the sward.
const GRASS_LOOK = { grass: 1, tallgrass: 1, sedge: 1 };
function droughtKills(w, i, g, gf, rng) {
  if (!w.catalog.definition.savanna || gf >= 0.6 || g >= 0.45 || w.distWater[i] <= 3) return false;
  const gi = w.ground[i];
  return !!gi && w.groundG[i] > 0.6 && GRASS_LOOK[w.catalog.plants[gi].look.type] && rng() < 0.012;
}

// A tree's yearly death hazard (0028 §2): flat background mortality, a steep rise with old age, and
// stress on a poor site or in shade it can't take. Returns { h, age }, where age is the part of h
// counted as death by age (background and senescence) and drought the part counted as drought; the
// rest is stress. The day's chance is h/120.
// Map data can scale the new terms (definition.mortality: { background, senescence, stress, suppression }).
// Drought (0028 §4): in a dry spell (w.drought, set daily by sim/disturbance.js from the map's
// regime), a tree within DRY_BAND of the dry end of its moisture range dies at up to MORT.drought a
// year, scaled by how deep the spell is. Wetter or drier ground (w.moist) changes who it reaches.
const MORT = { background: 0.4, senesceFrom: 0.7, senesce: 0.05, stress: 0.03, stressSuit: 0.6, poorSite: 0.2, suppress: 0.03, drought: 1 };
const DRY_BAND = 0.15;
const hz = { h: 0, age: 0, drought: 0 };
// Background plus senescence, a year. updatePlants also uses it for the ceiling it rolls against first.
function ageHazard(p, ageY, m) {
  const a = (ageY / p.life - MORT.senesceFrom) / (1 - MORT.senesceFrom);
  return (p.mortality ?? clamp(MORT.background / p.life, 0.002, 0.02)) * (m.background ?? 1)
    + (a > 0 ? MORT.senesce * a * a * a * (m.senescence ?? 1) : 0);
}
const woodK = []; // woodDecay by plant id (0: deadwood with no species), filled each day by updatePlants
export function treeHazard(w, i, p, s, g, ageY, m) {
  hz.age = ageHazard(p, ageY, m);
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
  hz.drought = w.drought ? MORT.drought * w.drought * clamp(1 - (w.moist[i] - p.moist[0]) / DRY_BAND, 0, 1) : 0;
  hz.h = hz.age + hz.drought + stress;
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
  // (up on a rotten log, a nurse-log sapling is out of reach of the soil fungi: half the background death)
  const h = UNDER_DEATH * (p.nurse && rottenLog(w, i) ? 0.5 : 1) + (short > 0 ? UNDER_SHADE_DEATH * Math.min(1, short / p.light[0]) : 0) + (s < 0.3 ? UNDER_POOR_DEATH : 0);
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

// ---- Long-distance dispersal (0028 §6). Most of a tree's seed lands within p.radius of it, but a
// small share is carried far: wind lifts a winged seed over the canopy, a bird or bat flies off with
// a fruit and drops the seed where it next perches, an agouti buries a nut across the clearing. Real
// seed shadows look like this, a peak under the parent and a long thin tail, and the tail is how a
// species reaches a gap that none of its own trees stand beside. farSeed(p) is the share that goes
// far: p.farSeed if set, else from how the seed travels:
//   fruit (p.look.fruit), carried by birds and bats: FAR.fruit while frugivores visit, FAR.dropped if none
//   one animal (p.disperser): FAR.cached while it lives here, none without it
//   anything else is wind-borne: FAR.wind × radius/4 (a long radius stands for a light, winged seed)
// A far seed lands r/u away (u uniform in (0,1], a Pareto tail of exponent 1): half of them within
// 2r, one in ten beyond 10r, in any direction; off the map is lost. Shrubs and groundcover keep their
// near spread: their long-distance seed already comes in as the map's berrySeeds and windSeeds.
const FAR = { wind: 0.02, fruit: 0.05, dropped: 0.005, cached: 0.01 };
export function farSeed(p, frugivores, disperserHere) {
  if (p.layer !== 2) return 0;
  if (p.farSeed != null) return p.farSeed;
  if (p.look?.fruit) return frugivores > 0 ? FAR.fruit : FAR.dropped;
  if (p.disperser) return disperserHere ? FAR.cached : 0;
  return FAR.wind * p.radius / 4;
}

function disperse(w, p, x, y, rng, radiusBoost, far = 0) {
  const r = p.radius + radiusBoost;
  let dx, dy;
  if (far > 0 && rng() < far) {
    const d = r / (1 - rng()), a = rng() * 2 * Math.PI;
    dx = Math.round(d * Math.cos(a)); dy = Math.round(d * Math.sin(a));
  } else {
    // Most groundcover seed lands near its parent, growing a drift outwards. A few seeds
    // still reach the full dispersal radius; animal-carried and woody seed keep their range.
    const offset = () => { const u = rng() * 2 - 1; return Math.round(r * (p.layer === 0 && !p.aquatic ? Math.sign(u) * Math.pow(Math.abs(u), 1.6) : u)); };
    dx = offset(); dy = offset();
  }
  if (!dx && !dy) return;
  const xx = x + dx, yy = y + dy;
  if (!w.inb(xx, yy)) return;
  trySeed(w, p, w.idx(xx, yy), rng);
}

export function updatePlants(game) {
  const w = game.world, rng = game.rng, m = game.month;
  w.seedFrom = 'parent';
  const tussocks = !game.catalog.definition.look.underwater; // (the reef's seagrass comes and goes its own way)
  const ecology = !!game.diff?.ecology;
  const gf = game.catalog.definition.climate.growth[m], sf = game.catalog.definition.climate.spread[m];
  const W = w.w;
  const frugivores = game.frugivoreCount || 0;
  // trees that depend on one animal to carry their seed (a Brazil nut needs agoutis to bury its nuts):
  // with it they spread like any tree, without it hardly at all. (It was 1.6 with the animal, which
  // made the Brazil nut, durian and balanites out-seed every other long-lived tree; 0028 phase 6.)
  const disperserMult = [], far = [];
  for (const p of game.catalog.plants) if (p && p.layer === 2) {
    let here = false;
    if (p.disperser) {
      const a = game.wildlife?.state && game.catalog.animal[p.disperser];
      here = !!a && game.wildlife.state[a.index].pop > 0;
      disperserMult[p.id] = here ? 1 : 0.12;
    }
    far[p.id] = farSeed(p, frugivores, here); // (the share of its seed carried far, §6)
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
  const sav = game.catalog.definition.savanna, deadK = game.catalog.definition.deadwood?.decay ?? 1;
  // A tree dies on well under 1% of days, so the full hazard is only worked out when the day's
  // roll falls under a ceiling that can't be lower than it: the exact age term plus the most the
  // stress and drought terms can add (treeHazard). Same deaths, same rolls, a fraction of the work.
  // (+1e-9: the terms' own rounding, e.g. poorSite·(0.3 − s)/0.3, can land a hair above poorSite)
  const hazCap = MORT.stress * (mort.stress ?? 1) + MORT.poorSite + MORT.suppress * (mort.suppression ?? 1) + 1e-9;
  const droughtCap = w.drought ? MORT.drought * w.drought : 0;
  const plants = game.catalog.plants;
  for (let k = 0; k < plants.length; k++) woodK[k] = woodDecay(plants[k]);

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
      // (a shade plant left in full sun, like sword fern after a clearcut, scorches within a summer
      // however slowly it grows)
      else g -= (layerLight(w, i, 0) > p.light[1] + 0.15 ? Math.max(p.grow, SCORCH) : p.grow) * 0.5 * (0.3 - s) / 0.3 * (gf > 0.1 ? 1 : 0.3);
      if (!p.aquatic && g > 0.15) g = Math.max(0.15, g - overgrazedLoss(w, i)); // a crowded herd crops it short
      // Old bunchgrass tussocks and clumps die back and leave a gap, where the quick-seeding
      // wildflowers get back in until the grasses outlive them again (see trySeed), so a meadow
      // stays a shifting mix instead of ending as one grass. Lawn and ornamentals are kept up.
      if (tussocks && p.life >= TUSSOCK_LIFE && g > 0.6 && !p.sod && !p.exotic && rng() < 1 / (p.life * 120)) g = 0;
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
      if (droughtKills(w, i, g, gf, rng) || grazedSeedlingLost(w, i, p, g, rng) || trampledSeedling(w, i, p, g, rng)) g = 0;
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
      let g = w.treeG[i];
      // Light only matters to a young tree. A grown one has its crown up in the canopy, so neither
      // its neighbours' shade nor full sun holds it back: a shade-intolerant Douglas-fir can't start
      // under a closed forest, and a hemlock seldom in an open field, but grown ones are fine
      // (treeHazard's suppression still weighs the saplings below the canopy).
      const s = plantSuit(w, i, p, g >= CANOPY_G ? p.light[1] : undefined);
      w.treeAge[i] += 1;
      let dies = null, lost = 'stress'; // dies: the cause of a death that leaves deadwood; lost: why g fell to 0
      if (g < 0.95) {
        if (s >= 0.3) g += p.grow * gf * (s - 0.3) / 0.7 * 1.4 * grazedGrowth(w, i, p, g);
        else if (g < 0.5) g -= p.grow * 0.5 * (0.3 - s) / 0.3 * (gf > 0.1 ? 1 : 0.3);
      } else if (s >= 0.3) g = Math.min(1, g + p.grow * gf * 0.5);
      // Sustained inundation, rather than the day a dam is built, creates snags.
      if (w.waterWetDays?.[i] >= 30 && w.waterDepth[i] > .15 && !p.wetOK) dies = 'flood';
      const ageY = w.treeAge[i] / 120, r = rng() * 120;
      const haz = r < ageHazard(p, ageY, mort) + droughtCap + hazCap ? treeHazard(w, i, p, s, g, ageY, mort) : null;
      if (haz && r < haz.h) dies ||= r < haz.age ? 'age' : r < haz.age + haz.drought ? 'drought' : 'stress';
      else if (droughtKills(w, i, g, gf, rng)) { g = 0; lost = 'drought'; }
      else if (grazedSeedlingLost(w, i, p, g, rng) || trampledSeedling(w, i, p, g, rng)) { g = 0; lost = 'browse'; }
      else if (elephantFelled(w, i, p, g, rng)) { if (g < 0.7) { g = 0; lost = 'browse'; } else dies = 'browse'; } // (pushed over or ring-barked: 0033)
      else if (bank && p.invasive && bank[i] && bankK > 0 && w.ground[i] && !game.catalog.plants[w.ground[i]].invasive && w.groundG[i] > 0.5 && rng() < 0.0012 * bankK) g = 0;
      // savanna: in the dry months, trees packed into a thicket run short of water and some die back
      else if (game.catalog.definition.savanna && gf < 0.6 && !p.invasive && w.distWater[i] > 3 && rng() < 0.006 && crowded(w, i, 3)) dies = 'drought';
      if (ecology && !dies && g > 0) g = stressYoungPlant(game, i, p, g);
      if (g <= 0) removeTree(w, i, lost, rng, { deadwood: false });
      else if (dies) removeTree(w, i, dies, rng);
      else {
        g = Math.min(1, g); w.treeG[i] = g; cover += g * 1.5;
        if (g > 0.75 && rng() < p.spread * sf * (disperserMult[p.id] ?? 1)) disperse(w, p, x, y, rng, 0, far[p.id]);
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
    if (f === F.SNAG || f === F.LOG) {
      // On the savanna, dead wood doesn't last: the yearly fires, termites and elephants bring a
      // standing dead tree down within a couple of years and clear the log away soon after.
      if (sav) {
        const ay = ++w.featureAge[i] / 120;
        if (f === F.SNAG && ay > 2 && rng() < 0.01) fellSnag(w, i);
        else if (f === F.LOG) { w.soil[i] += 0.0004; if (ay > 4 && rng() < 0.01) clearDeadwood(w, i); }
      } else {
        // elsewhere it rots at the pace its wood and the ground allow (0028 §5)
        const r = woodK[w.deadwoodId[i]] * moistDecay(w, i) * deadK; // (decayRate, with the wood looked up once a day)
        const ay = (w.featureAge[i] += r) / 120;
        if (f === F.SNAG) { if (ay > DECAY.snagFall && rng() < DECAY.roll * r) fellSnag(w, i); }
        else {
          w.soil[i] += 0.0004 * r; // (what the log was made of goes back into the ground as it rots)
          if (ay > DECAY.gone && rng() < DECAY.roll * r) clearDeadwood(w, i);
        }
      }
    } else if (f === F.BRUSH || f === F.DAM || f === F.STUMP) {
      w.featureAge[i] += 1;
      const ay = w.featureAge[i] / 120;
      if (f === F.BRUSH && ay > 6 && rng() < 0.003) { w.feature[i] = 0; w.soil[i] += 0.05; }
      else if (f === F.STUMP && ay > 2 && rng() < 0.004) { w.feature[i] = 0; w.featureAge[i] = 0; w.soil[i] += 0.04; }
    }

    // ---- soil slowly heals under living cover, faster in the growing season
    w.soil[i] = clamp(w.soil[i] + soilRate * cover * (0.3 + gf), 0, 1);
    if (ecology && w.mulchDays?.[i] > 0) w.mulchDays[i]--;
  }
}

// Why a tree died (docs/decisions/0028-succession-dynamics.md): 'age' (background and old-age
// mortality), 'stress' (a poor site, shade or competition), 'fire', 'wind', 'drought', 'pathogen',
// 'flood', 'browse' (and trampling), 'beaver' or 'player'.
// a fire kills trees standing; a storm throws them down; root rot leaves some standing, but most
// tip over green, their rotted roots giving way
const SNAG_ODDS = { fire: 0.7, wind: 0.15, pathogen: 0.4 };
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
  const g = w.treeG[i], dead = w.tree[i];
  const all = w.treeDeaths, est = w.treeDeathsEst;
  all[cause] = (all[cause] || 0) + 1;
  if (g > ESTABLISHED_TREE) est[cause] = (est[cause] || 0) + 1;
  w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0;
  // advance regeneration (0028 §3): a sapling waiting underneath takes the slot at its own size,
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
    w.featureAge[i] = 0; w.deadwoodId[i] = dead; // (what it was sets how fast it rots, §5)
    w.marks[i] &= ~PLACED; // (nature's deadwood: Demolish leaves it)
  }
}

// ---- Deadwood (0028 §5). A dead tree goes snag → sound log → rotten log → gone. For a snag or log,
// featureAge is how far it has rotted, in days at the reference pace (a hardwood on damp ground):
// it gains decayRate a day, not 1. Each class lasts a fixed amount of rot, so a fir log on dry
// ground stays a sound log for decades and a maple log in a wet hollow is soft within ten years.
// The savanna keeps its own quick timers (fire, termites, elephants), and the reef its rubble.
// Reference years: a snag can fall after snagFall, then with odds roll × rate a day; a log is
// rotten from `rotten`, and goes after `gone` the same way.
export const DECAY = { snagFall: 8, rotten: 12, gone: 25, roll: 0.002 };

// How fast this species' dead wood rots against a typical hardwood (1). p.decay overrides it.
// Conifers rot slower: resin and heartwood extractives hold the fungi off. (Real ratios are larger:
// a Douglas-fir log lasts several times as long as a maple's. The game keeps deadwood within a
// few decades so a forest's logs turn over in a player's lifetime.)
export function woodDecay(p) {
  if (!p) return 1; // (deadwood the player or the map put down: nothing says what it was)
  return p.decay ?? (p.conifer ? 0.6 : 1);
}

// How the ground's water sets the pace: fungi need damp wood, so dry ground rots it slowly and
// moist ground fast, up to a limit; wood lying in standing water, a marsh or mud is short of air
// and barely rots (waterlogged logs last for centuries). 1 at moisture 0.5, typical forest floor.
export function moistDecay(w, i) {
  const t = w.terrain[i];
  if (isWater(t) || t === T.MUD || w.waterDepth?.[i] > 0.15) return 0.35;
  return 0.3 + clamp((w.moist[i] - 0.15) / 0.5, 0, 1);
}

// The day's rot for the snag or log on tile i, in reference days. mapK: the map's deadwood.decay
// (warm, humid tropics rot wood faster).
export function decayRate(w, i, mapK = w.catalog.definition.deadwood?.decay ?? 1) {
  return woodDecay(w.catalog.plants[w.deadwoodId[i]]) * moistDecay(w, i) * mapK;
}

// A log far enough gone to be soft, crumbling wood: a seedbed for nurse-log trees, and more
// insects and grubs in it.
export const rottenLog = (w, i) => w.feature[i] === F.LOG && w.featureAge[i] >= DECAY.rotten * 120;

// A snag comes down (its time, a storm, a fire burning through its base) as a sound log, and keeps
// what species it was.
export function fellSnag(w, i) { w.feature[i] = F.LOG; w.featureAge[i] = 0; }

// The last of a log rots away (or burns).
export function clearDeadwood(w, i) { w.feature[i] = 0; w.featureAge[i] = 0; w.deadwoodId[i] = 0; }

// The suitability bonus a nurse-log plant (p.nurse: hemlock, redcedar, huckleberry) gets on tile i.
// Their seedlings take best on a rotten log: raised above the moss and litter, out of reach of the
// soil fungi that kill seedlings on the ground, on wood that holds water through the summer. A sound
// log, still barked and hard, helps less, and so does the damp, sheltered ground beside one.
export function nurseBonus(w, i) {
  if (w.feature[i] === F.LOG) return w.featureAge[i] >= DECAY.rotten * 120 ? NURSE.rotten : NURSE.sound;
  return w.distLog[i] <= 1 ? NURSE.near : 0;
}
const NURSE = { rotten: 0.4, sound: 0.15, near: 0.15 };

// Where a seed from beyond an edge lands, or -1 off the map. How far in: tree seed falls off with
// distance from the edge but has no hard limit (0028 §6), s·(1/u − 1), a decaying tail with the same
// median depth s as the old near band, so one seed in five gets past 4s and one in sixteen past
// 15s. Seed from a whole stand along the edge has a fatter tail than a single tree's. Shrub and
// groundcover seed stays in the near band.
function edgeTile(w, p, edge, rng) {
  const s = (p.radius + 4) / 4;
  const depth = Math.floor(p.layer === 2 ? Math.min(w.w + w.h, s * (1 / (1 - rng()) - 1)) : rng() * rng() * (p.radius + 4));
  let x, y;
  if (edge === 'N') { x = Math.floor(rng() * w.w); y = depth; }
  else if (edge === 'E') { x = w.w - 1 - depth; y = Math.floor(rng() * w.h); }
  else if (edge === 'W') { x = depth; y = Math.floor(rng() * w.h); }
  else { x = Math.floor(rng() * w.w); y = w.h - 5 - depth - Math.floor(rng() * 3); }
  return w.inb(x, y) ? w.idx(x, y) : -1;
}
// The native trees listed for an edge, as plants (repeats kept, as weights); built once per catalog.
const FOREST = new WeakMap();
export function forestTrees(catalog, edge) {
  let t = FOREST.get(catalog);
  if (!t) { t = {}; FOREST.set(catalog, t); }
  return t[edge] ||= (catalog.definition.seedRain[edge] || []).map(k => catalog.plant[k]).filter(p => p.layer === 2 && p.native && !p.invasive);
}

// Seeds drifting in from outside the property: forest to the north and east,
// wind-blown cottonwood and fireweed, invasives from neighbouring farms to the west,
// and whatever the winter floods leave along the river.

export function seedRain(game) {
  const w = game.world, rng = game.rng, m = game.month, def = game.catalog.definition;
  const sf = def.climate.spread[m];
  const tries = 3;
  for (let k = 0; k < tries; k++) {
    if (rng() > 0.5 * sf) continue;
    const edge = ['N', 'E', 'W', 'S'][Math.floor(rng() * 4)];
    const src = def.seedRain[edge];
    if (!src || !src.length) continue;
    const key = src[Math.floor(rng() * src.length)];
    const p = game.catalog.plant[key];
    const i = edgeTile(w, p, edge, rng);
    if (i < 0) continue;
    // on Challenging the neighbours' invasive seeds press in harder (Relaxed's lighter touch is
    // w.invasiveOdds in trySeed, which covers seed from plants already on the land too)
    const inv = p.invasive ? (game.diff?.invasives ?? 1) : 1;
    w.seedFrom = 'edge';
    trySeed(w, p, i, rng);
    if (inv > 1 && rng() < inv - 1) trySeed(w, p, i, rng);
  }
  // A forest beyond an edge (map data forestRain: { edge: seeds per edge tile a day }) rains the
  // seed of its native trees in along the whole edge, far more than the few tries above: a stand
  // of grown trees drops seed by the million, and the wind and birds carry some of it well inside
  // (0028 §6). The trees are the edge's native ones in seedRain; the neighbours' invasive trees are
  // garden and hedgerow trees, not a stand, and keep to the tries above.
  const forest = def.forestRain;
  if (forest) for (const edge in forest) {
    const trees = forestTrees(game.catalog, edge);
    if (!trees.length) continue;
    const len = edge === 'N' || edge === 'S' ? w.w : w.h;
    for (let n = len * forest[edge] * sf; n > 0; n--) {
      if (n < 1 && rng() >= n) break;
      const p = trees[Math.floor(rng() * trees.length)];
      const i = edgeTile(w, p, edge, rng);
      w.seedFrom = 'forest';
      if (i >= 0) trySeed(w, p, i, rng);
    }
  }
  // Birds carry berry seeds from far away once they are visiting.
  if (game.frugivoreCount > 0 && rng() < 0.08 * sf) {
    const opts = game.catalog.definition.berrySeeds;
    const p = game.catalog.plant[opts[Math.floor(rng() * opts.length)]];
    const i = Math.floor(rng() * w.n);
    w.seedFrom = 'bird';
    trySeed(w, p, i, rng);
  }
  // Wind-carried seeds can land anywhere.
  if (rng() < 0.05 * sf) {
    const p = game.catalog.plant[game.catalog.definition.windSeeds[Math.floor(rng() * game.catalog.definition.windSeeds.length)]];
    w.seedFrom = 'wind';
    trySeed(w, p, Math.floor(rng() * w.n), rng);
  }
  regionalRain(game, sf);
}

// How a species' seed travels from the wild land around the farm (p.seedTravel overrides it):
// fluff and winged seed ride the wind, fruit rides birds and monkeys, wetland seed floats along
// the water, and heavy nuts and bulbs only move when an animal carries them.
export function seedTravel(p) {
  return p.seedTravel || (p.aquatic || p.mangrove || (p.wetOK && p.moist[0] >= 0.6) ? 'water'
    : p.look.fruit || p.look.berry || p.fruitFood ? 'bird' : p.mast || p.disperser ? 'animal' : 'wind');
}
const TRAVEL = { wind: 1, bird: 0.8, water: 1, animal: 0.25, none: 0 };
const REGIONAL_TRIES = 4; // seeds a day at the height of the seeding season, before travel odds
const POOLS = new WeakMap();

// Regional seed rain (0027): every native of the surrounding country reaches the farm now and then,
// the way an abandoned field fills with species from the woods, wetlands and prairie remnants
// around it. A seed lands on a random tile (water-carried seed on a bank or in the shallows) and
// only takes where the ground suits it, so what comes up follows the habitat. The edge lists and
// forest rain above are the bulk; this is the trickle that lets the rarer natives turn up at all,
// shrubs, wildflowers and wetland plants as well as trees. A map sets `regionalRain` to scale it.
function regionalRain(game, sf) {
  const w = game.world, rng = game.rng, cat = game.catalog, rate = cat.definition.regionalRain ?? 1;
  if (!rate) return;
  let pool = POOLS.get(cat);
  if (!pool) POOLS.set(cat, pool = cat.plants.filter(p => p && p.native !== false && !p.invasive && !p.exotic));
  for (let k = 0; k < REGIONAL_TRIES; k++) {
    if (rng() > 0.5 * sf * rate) continue;
    const p = pool[Math.floor(rng() * pool.length)];
    const travel = seedTravel(p);
    if (rng() > TRAVEL[travel]) continue;
    let i = Math.floor(rng() * w.n);
    if (travel === 'water') for (let t = 0; t < 16 && w.distWater[i] > 1; t++) i = Math.floor(rng() * w.n);
    w.seedFrom = 'region';
    trySeed(w, p, i, rng);
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
