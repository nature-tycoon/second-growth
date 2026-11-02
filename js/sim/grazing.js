// Grazing pressure: where herbivores spend their days, they crop the sward and nip off the
// woody seedlings that come up in it, so grassland they use stays open. Pressure follows the
// animals themselves, so it rises and falls with the herd, shifts when predators make a place
// risky, and fades from ground they abandon. Planted nursery stock is tall enough to escape it.
// Browsing by taste, trampling and elephants (decision 0033) read the kg/ha field in sim/herbivory.js.
import { T, F, isWater } from '../config.js';
import { brushProtection } from './ecological-pressure.js';
import { herbivoreIndex, herbivoreKg } from './herbivory.js';
import { rottenLog, trySeed } from './plants.js';

const DECAY = 0.985; // per day: ground a herd stops using recovers within a year or two
const INTAKE = 0.8; // a deer-sized animal's day of feeding, spread over its feeding range
const SEEDLING = 0.1; // woody seedlings below this are inside the sward; planted stock starts at 0.1
const OVERGRAZED = 0.75; // only a crowded herd crops grass faster than it regrows

// Body weight relative to a deer: a rabbit counts for about a quarter, an elk or elephant for two.
export function grazerWeight(def) {
  if (def.move !== 'ground' || def.reef || !def.behavior.forage.some(f => f === 'grass' || f === 'browse')) return 0;
  const len = def.sprite.len;
  return len ? Math.min(2, Math.max(0.05, (len / 34) ** 2)) : 0;
}

// One animal's day of feeding, shared out over the ground within its daily range, in proportion
// to how much it likes being there and how much grass or browse there is to eat. More animals
// means more pressure on the same ground; animals pushed off by predators feed somewhere else.
let kernel = new Float32Array(0), pods = new Float32Array(0);
const seedsInDung = (w, j) => w.groundG[j] > 0.6 && w.catalog.plants[w.ground[j]].graze > 0; // (grown, grazed grass)
const podsUnder = (w, j) => w.tree[j] && w.treeG[j] > 0.75 && w.catalog.plants[w.tree[j]].pods; // (a grown tree dropping pods)
const POD_SHARE = 0.5; // how often the day's dung carries pods against grass seed, where both are on offer
export function grazeDay(game, def, x, y) {
  const strength = game.catalog.definition.grazing ?? 1, weight = grazerWeight(def);
  const suit = game.wildlife.suit?.[def.index];
  if (!strength || !weight || !suit || game.catalog.definition.look.underwater) return;
  const w = game.world, grazed = w.grazed ||= new Float32Array(w.n);
  const grass = def.behavior.forage.includes('grass'), browse = def.behavior.forage.includes('browse');
  const R = Math.round(Math.min(8, Math.max(2, Math.sqrt(def.hr || 4)))), side = 2 * R + 1;
  if (kernel.length < side * side) { kernel = new Float32Array(side * side); pods = new Float32Array(side * side); }
  let total = 0, seedTotal = 0, podTotal = 0;
  const dung = game.catalog.definition.dungSeed ?? 0; // (seeds a grazer's dung plants a day, at the height of the seeding season)
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const k = (dy + R) * side + dx + R, xx = x + dx, yy = y + dy;
    kernel[k] = 0; pods[k] = 0;
    if (!w.inb(xx, yy)) continue;
    const j = w.idx(xx, yy);
    const near = 1 - Math.hypot(dx, dy) / (R + 1.5);
    if (dung && podsUnder(w, j) && suit[j] > 0) podTotal += pods[k] = suit[j] * near; // (fallen pods under the tree)
    const food = Math.max(grass ? w.graze[j] : 0, browse ? w.browse[j] : 0);
    if (food <= 0 || suit[j] <= 0) continue;
    total += kernel[k] = suit[j] * food * (1 - grazed[j]) * near; // (fresh grass first)
    if (dung && grass && seedsInDung(w, j)) seedTotal += kernel[k];
  }
  // Herds spread seed in their dung (endozoochory). Wildebeest, zebra and gazelles pass the small
  // seed of the grasses they eat, still viable, across their range (Janzen 1984, "foliage is the
  // fruit"; Bodmer & Ward 2006): it's how grass gets back onto bare ground far from any tussock.
  // Impala, giraffe, elephants and cattle eat the fallen pods of acacias, desert date and mesquite,
  // and the hard seeds pass through and germinate better for it (Miller 1994, J. Arid Environ.;
  // Shiferaw et al. 2004 for mesquite): the main way acacias reach open grassland away from their
  // parents. A seed is from a plant it ate, picked in proportion to how much it ate where, and lands
  // somewhere in the day's range; it takes only where trySeed lets it. Only maps crossed by big
  // herds set map.dungSeed (the Serengeti); on a farm with a few deer it's a trickle beside the
  // plants' own spread, and leaving it out keeps those maps as they were (decision 0036).
  const rng = game.rng;
  if ((seedTotal > 0 || podTotal > 0) && rng() < dung * Math.min(1, weight) * game.catalog.definition.climate.spread[game.month]) {
    const usePods = podTotal > 0 && (seedTotal <= 0 || rng() < POD_SHARE);
    const field = usePods ? pods : kernel;
    let r = rng() * (usePods ? podTotal : seedTotal), from = 0;
    for (let dy = -R; dy <= R && !from; dy++) for (let dx = -R; dx <= R; dx++) {
      const k = field[(dy + R) * side + dx + R];
      if (k <= 0) continue;
      const j = w.idx(x + dx, y + dy);
      if (usePods ? podsUnder(w, j) && (r -= k) <= 0 : seedsInDung(w, j) && (r -= k) <= 0) { from = usePods ? w.tree[j] : w.ground[j]; break; }
    }
    const tx = x + Math.round((rng() * 2 - 1) * R), ty = y + Math.round((rng() * 2 - 1) * R);
    if (from && w.inb(tx, ty)) { w.seedFrom = 'dung'; trySeed(w, game.catalog.plants[from], w.idx(tx, ty), rng); }
  }
  if (total <= 0) return;
  const share = INTAKE * weight * strength / total;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const k = kernel[(dy + R) * side + dx + R];
    if (k > 0) { const j = w.idx(x + dx, y + dy); grazed[j] += k * share * (1 - grazed[j]); }
  }
}

export function decayGrazing(w) {
  const grazed = w.grazed;
  if (!grazed) return;
  for (let i = 0; i < w.n; i++) if (grazed[i] > 0) grazed[i] = grazed[i] < 0.002 ? 0 : grazed[i] * DECAY;
}

// How hard grazing presses on woody seedlings on tile i, 0..1. Full in an open sward of grass and herbs;
// fading out under and beside trees, weaker on bare ground, by the water's edge (where willows and
// alders still take) and behind brush or a fence line.
export function seedlingPressure(w, i) {
  const g = w.grazed?.[i];
  if (!g) return 0;
  const gp = w.catalog.plants[w.ground[i]];
  let k = gp ? (!gp.aquatic && w.groundG[i] > 0.35 ? 1 : 0.5) : w.terrain[i] === T.PASTURE ? 1 : 0.5; // (old pasture sod is a sward too)
  k *= 1 - Math.min(1, (w.nbCanopy?.[i] || 0) * 2); // (in the open: among trees, the forest still fills its gaps)
  if (w.distWater[i] <= 1) k *= 0.4;
  if (w.feature[i] === F.FENCE || w.feature[i] === F.BRUSH || brushProtection(w, i)) k *= 0.15;
  return Math.min(1, g * k);
}

// Browsing (decision 0033): how hard browsers press on a woody plant still within their reach on tile i,
// 0..1. It follows the browsers' kg/ha (sim/herbivory.js) into forest gaps and the understory too, and
// it picks by taste: a favourite (p.browse near 1) takes the full pressure, an avoided one hardly any.
// Thorns take most of the bite out of it, and a sapling growing up inside a bramble, rose or thornbush
// is out of reach of most of it, which is how browsed land grows groves out of thickets.
const REACH = 0.45; // above this a tree's leader is out of a deer's reach
const ARMED = 0.45; // share of the pressure a thorny plant still takes
const UNDER_CANOPY = 0.35; // share under a grown tree, where there's little browse to draw them
export function palatability(p) { return p.layer === 2 ? p.browse || 0.3 : p.browse; }
export function browsePressure(w, i, p, g) {
  if (g >= REACH || !w.herbivory || p.layer === 0 || p.aquatic || p.mangrove) return 0;
  const taste = palatability(p) * (p.thorny ? ARMED : 1);
  if (taste <= 0) return 0;
  const e = herbivoreIndex(w, i, 'browse');
  if (e < 0.01) return 0;
  // (under a grown tree there's little to eat, so browsers feed mostly in the gaps and at the edges)
  return e * taste * browseShelter(w, i, p) * (w.treeG[i] >= 0.6 ? UNDER_CANOPY : 1);
}
const SIDES = [[-1, 0], [1, 0], [0, -1], [0, 1]];
function browseShelter(w, i, p) {
  if (w.feature[i] === F.FENCE || w.feature[i] === F.BRUSH || brushProtection(w, i)) return 0.15;
  if (p.layer !== 2) return 1;
  if (p.nurse && rottenLog(w, i)) return 0.4; // (up on a nurse log, as hemlock and redcedar come up among Olympic elk)
  const sp = w.catalog.plants[w.shrub[i]];
  if (sp?.thorny && w.shrubG[i] > 0.4) return 0.3; // (inside the thicket)
  const x = i % w.w, y = i / w.w | 0;
  for (const [dx, dy] of SIDES) {
    if (!w.inb(x + dx, y + dy)) continue;
    const j = w.idx(x + dx, y + dy);
    if (w.catalog.plants[w.shrub[j]]?.thorny && w.shrubG[j] > 0.5) return 0.65; // (at its edge)
  }
  return 1;
}

// Elephants push over young trees and strip the bark off grown ones (decision 0033). The day's odds
// that the tree on tile i comes down: up to about 30% a year for a young tree where elephants spend a
// lot of time, 2% a year for a grown one they like.
export function elephantFelled(w, i, p, g, rng) {
  if (!w.herbivory?.hasHeavy || g < SEEDLING || p.aquatic || p.mangrove) return false;
  const e = herbivoreIndex(w, i, 'heavy');
  if (e < 0.02) return false;
  const taste = 0.5 + 0.5 * palatability(p);
  return rng() < e * taste * (g < 0.7 ? 0.003 : 0.02 * palatability(p) / 120);
}

// A woody seed landing in grazed grass or within browsers' reach: the odds it gets away before something
// eats or treads on it. Treading isn't picky (invasives too, but thorny ones less); browsing is.
export function grazedRecruitOdds(w, i, p) {
  if (p.layer === 0 || p.aquatic || p.mangrove || isWater(w.terrain[i])) return 1;
  const sward = Math.max(0, 1 - 3 * seedlingPressure(w, i) * swardShare(p));
  return sward * (1 - 0.8 * browsePressure(w, i, p, 0));
}

// Invasive seedlings were left out of the sward rule (0011); under 0033 they're trodden like any other,
// though a thorny or unpalatable one less.
const swardShare = p => !p.invasive ? 1 : (p.thorny ? 0.5 : 1) * (0.5 + 0.5 * palatability(p));

// A wild woody seedling still down in the grass is nipped off or trampled now and then, and one in
// browsers' reach is eaten back until it dies, unless it grows back from the root.
export function grazedSeedlingLost(w, i, p, g, rng) {
  if (p.aquatic || p.mangrove) return false;
  if (g < SEEDLING) {
    const k = seedlingPressure(w, i) * swardShare(p);
    if (k > 0.05 && rng() < k * 0.25) return true;
  }
  const b = browsePressure(w, i, p, g);
  return b > 0 && rng() < b * (g < SEEDLING ? 0.02 : 0.004) * (p.resprout ? 0.5 : 1);
}

// Young shrubs and saplings in grazed grass have their shoots eaten back as fast as they grow
// under heavy use, and browsers hold palatable saplings down in their reach (a resprouter keeps more).
// Returns the share of the day's growth they keep.
export function grazedGrowth(w, i, p, g) {
  if (g >= REACH || p.aquatic || p.mangrove) return 1;
  const sward = g >= 0.4 ? 1 : Math.max(0, 1 - 2 * seedlingPressure(w, i) * swardShare(p));
  // (a browse trap: past about half pressure a sapling that doesn't resprout is eaten back as fast
  // as it grows, so it only gets away where browsers seldom come, in a thicket or a quiet patch)
  const b = browsePressure(w, i, p, g);
  return sward * (p.resprout ? Math.max(0.1, 1 - 1.2 * b) : Math.max(0, 1 - 1.8 * b));
}

// Big herds tread down woody seedlings wherever they spend their days, whatever they eat (decision
// 0033; this was a savanna-only rule before). Full where the herds stand at three times the land's
// intact biomass, a little under trees, less for thorny seedlings.
export function trampledSeedling(w, i, p, g, rng) {
  if (g >= 0.3 || !w.herbivory || p.aquatic || p.mangrove || isWater(w.terrain[i])) return false;
  const kg = herbivoreKg(w, i, 'graze') + herbivoreKg(w, i, 'browse');
  if (kg <= 0) return false;
  const e = 1 - Math.exp(-kg / (3 * w.herbivory.ref));
  return rng() < e * TRAMPLE * (p.thorny ? 0.6 : 1) * (1 - 0.7 * Math.min(1, w.nbCanopy?.[i] || 0));
}
const TRAMPLE = 0.004; // a day, at full: about a third of small seedlings a year

// Where grazers keep the sward short, wildflowers get in among the grasses (decision 0033).
export function grazedForbEdge(w, i, p, cp) {
  return p.layer === 0 && !p.invasive && w.grazed?.[i] > 0.3 && SWARD[cp.look.type] && FORB[p.look.type];
}
const SWARD = { grass: 1, tallgrass: 1, sedge: 1 }, FORB = { forb: 1, tallforb: 1 };

// Grass cropped faster than it can regrow: only where a crowded herd keeps coming back.
export function overgrazedLoss(w, i) {
  const g = w.grazed?.[i];
  return g > OVERGRAZED ? (g - OVERGRAZED) * 0.04 : 0;
}
