// Grazing pressure: where herbivores spend their days, they crop the sward and nip off the
// woody seedlings that come up in it, so grassland they use stays open. Pressure follows the
// animals themselves, so it rises and falls with the herd, shifts when predators make a place
// risky, and fades from ground they abandon. Planted nursery stock is tall enough to escape it.
import { T, F, isWater } from '../config.js';
import { brushProtection } from './ecological-pressure.js';

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
let kernel = new Float32Array(0);
export function grazeDay(game, def, x, y) {
  const strength = game.catalog.definition.grazing ?? 1, weight = grazerWeight(def);
  const suit = game.wildlife.suit?.[def.index];
  if (!strength || !weight || !suit || game.catalog.definition.look.underwater) return;
  const w = game.world, grazed = w.grazed ||= new Float32Array(w.n);
  const grass = def.behavior.forage.includes('grass'), browse = def.behavior.forage.includes('browse');
  const R = Math.round(Math.min(8, Math.max(2, Math.sqrt(def.hr || 4)))), side = 2 * R + 1;
  if (kernel.length < side * side) kernel = new Float32Array(side * side);
  let total = 0;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const k = (dy + R) * side + dx + R, xx = x + dx, yy = y + dy;
    kernel[k] = 0;
    if (!w.inb(xx, yy)) continue;
    const j = w.idx(xx, yy);
    const food = Math.max(grass ? w.graze[j] : 0, browse ? w.browse[j] : 0);
    if (food <= 0 || suit[j] <= 0) continue;
    total += kernel[k] = suit[j] * food * (1 - grazed[j]) * (1 - Math.hypot(dx, dy) / (R + 1.5)); // (fresh grass first)
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

// A woody seed landing in grazed grass: the odds it gets away before something eats or treads on it.
export function grazedRecruitOdds(w, i, p) {
  if (p.layer === 0 || p.invasive || p.aquatic || p.mangrove || isWater(w.terrain[i])) return 1;
  return Math.max(0, 1 - 3 * seedlingPressure(w, i));
}

// A wild woody seedling still down in the grass is nipped off or trampled now and then.
export function grazedSeedlingLost(w, i, p, g, rng) {
  if (g >= SEEDLING || p.invasive || p.aquatic || p.mangrove) return false;
  const k = seedlingPressure(w, i);
  return k > 0.05 && rng() < k * 0.25;
}

// Young shrubs and saplings in grazed grass have their shoots eaten back as fast as they grow
// under heavy use. Returns the share of the day's growth they keep.
export function grazedGrowth(w, i, p, g) {
  if (g >= 0.4 || p.invasive || p.aquatic || p.mangrove) return 1;
  return Math.max(0, 1 - 2 * seedlingPressure(w, i));
}

// Grass cropped faster than it can regrow: only where a crowded herd keeps coming back.
export function overgrazedLoss(w, i) {
  const g = w.grazed?.[i];
  return g > OVERGRAZED ? (g - OVERGRAZED) * 0.04 : 0;
}
