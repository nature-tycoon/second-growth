// Challenging-only pressures, using local habitat and the existing daily loop.
// Rates represent gameplay time and populations, not real-world measured rates.
import { T, F, isWater, clamp, DAYS_PER_YEAR } from '../config.js';
import { PLANTS } from '../data/plants.js';
import { ANIMALS, preyFor } from '../data/animals.js';
import { biome } from '../biome.js';

export const MULCH_DAYS = 120;
export const HUNGRY_DAYS = 30;
export const CHALLENGE_TOOL_ADVICE = {
  brush: 'In Challenging, brush piles shelter nearby saplings from browsing and small prey from predators. Protection reduces losses; it does not prevent them completely.',
  log: 'In Challenging, fallen logs shelter small land animals and give fish cover in or beside water. Marsh edges and woody banks also protect aquatic prey.',
  rocks: 'In Challenging, rock piles give small prey nearby hiding places, reducing successful catches by predators.',
  mulch: 'In Challenging, mulch protects young trees and shrubs from additional drought and grass competition for one game year. Renew it when the protection runs low.',
};

function notice(game, key, text, i) {
  const notices = game.flags.ecologyNotices ||= {};
  if (notices[key] != null && game.day - notices[key] < 60) return;
  notices[key] = game.day;
  game.notify(text, 'warn', { x: i % game.world.w + 0.5, y: (i / game.world.w | 0) + 0.5 });
}

export function brushProtection(w, i) {
  const x = i % w.w, y = i / w.w | 0;
  return [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => w.inb(x + dx, y + dy) && w.feature[w.idx(x + dx, y + dy)] === F.BRUSH);
}

export function browseSapling(game, a, def) {
  if (!game.diff.ecology || !def.browseRate || a.leaving || a.state !== 'idle' || biome.look.underwater) return false;
  const w = game.world, x = Math.floor(a.x), y = Math.floor(a.y);
  let target = -1, size = Infinity;
  // Feed on the current tile or one directly adjacent. Never browse through a
  // fence or across water/buildings; a planted fence-line tree stays protected.
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
    if (!w.inb(x + dx, y + dy)) continue;
    const i = w.idx(x + dx, y + dy), p = PLANTS[w.tree[i]];
    if (!p || isWater(w.terrain[i]) || w.struct[i] >= 0 || w.feature[i] === F.FENCE || w.treeG[i] >= 0.55) continue;
    if (w.treeG[i] < size) { target = i; size = w.treeG[i]; }
  }
  if (target < 0 || game.rng() >= 0.45) return false;
  const damage = 0.025 * clamp(def.browseRate / 0.012, 0.5, 2.5) * (brushProtection(w, target) ? 0.15 : 1);
  w.treeG[target] = Math.max(0, size - damage);
  const pressure = w.browseDamage ||= new Float32Array(w.n);
  pressure[target] = Math.min(1, pressure[target] + damage);
  game.stats.saplingsBrowsed = (game.stats.saplingsBrowsed || 0) + 1;
  if (w.treeG[target] <= 0) {
    w.tree[target] = 0; w.treeG[target] = 0; w.treeAge[target] = 0;
    game.stats.saplingsLost = (game.stats.saplingsLost || 0) + 1;
  }
  w.renderDirty = true;
  notice(game, 'browse', 'Browsers are damaging young trees. Brush piles shelter nearby saplings; establish protected patches before opening more wildlife corridors.', target);
  return true;
}

export function establishmentStress(w, i, p, growth) {
  if (growth >= 0.55 || p.layer === 0 || p.aquatic || p.mangrove || p.swampTree || p.cay || biome.look.underwater) return 0;
  const dry = clamp((p.moist[0] + 0.08 - w.moist[i]) / 0.2, 0, 1);
  if (!dry) return 0;
  const ground = PLANTS[w.ground[i]];
  const competition = ground && w.groundG[i] > 0.5 && (ground.sod || ground.invasive || ['grass', 'tallgrass', 'sedge'].includes(ground.look.type)) ? w.groundG[i] : 0;
  // Mulch buys an establishment window rather than permanently fixing a dry site.
  const mulched = w.mulchDays?.[i] > 0;
  return 0.003 * dry * (1 + competition * 1.5) * (mulched ? 0.15 : 1);
}

export function stressYoungPlant(game, i, p, growth) {
  if (!game.diff.ecology || biome.climate.growth[game.month] <= 0.2) return growth;
  const loss = establishmentStress(game.world, i, p, growth);
  if (!loss) return growth;
  const remaining = growth - loss;
  if (remaining <= 0) game.stats.establishmentLosses = (game.stats.establishmentLosses || 0) + 1;
  notice(game, 'establishment', 'Young woody plants are struggling with dry soil and competing groundcover. Clear grass before planting, mulch new planting patches, or plant in wetter sites and seasons.', i);
  return remaining;
}

const SMALL_PREY = new Set(['rodent', 'rabbit', 'squirrel', 'frog', 'newt', 'lizard', 'songbird', 'hummer', 'bat']);
export function preyCover(w, prey, predator) {
  const def = ANIMALS[prey.sp], x = Math.floor(prey.x), y = Math.floor(prey.y);
  if (!w.inb(x, y)) return 0;
  const i = w.idx(x, y);
  if (biome.look.underwater) return clamp(w.nbCanopy[i] * 0.65 + (['seagrass', 'spoongrass'].includes(PLANTS[w.ground[i]]?.look.type) ? w.groundG[i] * 0.35 : 0), 0, 0.9);
  if (def.move === 'swim') return clamp((w.distLog[i] <= 1 ? 0.65 : 0) + (w.terrain[i] === T.MARSH ? 0.3 : 0) + (w.distWoody[i] <= 1 || w.nbCanopy[i] > 0.3 ? 0.25 : 0), 0, 0.9);
  const small = SMALL_PREY.has(def.sprite.kind) || def.sprite.kind === 'snake' && def.sprite.size <= 20;
  const grass = PLANTS[w.ground[i]];
  const ground = grass && (grass.aquatic || ['grass', 'tallgrass', 'sedge', 'fern'].includes(grass.look.type)) ? w.groundG[i] : 0;
  const shrubs = w.shrub[i] ? w.shrubG[i] : 0;
  // A pile can hide a vole, not a buffalo. Vegetation still helps larger prey,
  // while canopy obstructs aerial hunters and shelters tree-dwelling prey.
  const refuge = small && (brushProtection(w, i) || w.distLog[i] <= 1 || w.distRocks[i] <= 1) ? 0.65 : 0;
  const canopy = predator?.move === 'fly' || def.move === 'tree' ? w.canopy[i] * 0.35 : 0;
  return clamp(refuge + shrubs * (small ? 0.45 : 0.3) + ground * (small ? 0.3 : 0.15) + canopy, 0, 0.9);
}

export function predationCatchChance(game, prey, predator, base = 0.45) {
  if (!game.diff.ecology) return base;
  // Exposed prey are easier to catch in Challenging; a refuge never guarantees
  // survival. This rule applies to every hunt, not just fish-eaters.
  return clamp(base * 1.2 * (1 - preyCover(game.world, prey, predator) * 0.7), 0, 1);
}

export function hungryPredator(game, a, def = ANIMALS[a.sp]) {
  return !!(game.diff.ecology && preyFor(def, game) && a.age >= def.mature * DAYS_PER_YEAR && a.hunger >= HUNGRY_DAYS);
}

export function foodDeparture(game, a) {
  game.stats.foodDepartures = (game.stats.foodDepartures || 0) + 1;
  const w = game.world, x = clamp(Math.floor(a.x), 0, w.w - 1), y = clamp(Math.floor(a.y), 0, w.h - 1);
  notice(game, 'predator-food', 'Hungry predators are moving on. Restore connected prey habitat and shelter so the food web can recover.', w.idx(x, y));
}

export function pressureTileNotes(game, i) {
  if (!game.diff.ecology) return [];
  const w = game.world, out = [];
  if (w.browseDamage?.[i] > 0.01) out.push('Recent browsing pressure: young trees here have lost growth to herbivores.');
  if (w.tree[i] && w.treeG[i] < 0.55 && brushProtection(w, i)) out.push('Nearby brush protects this sapling from most browsing damage.');
  if (w.mulchDays?.[i] > 0) out.push(`Mulch establishment protection: ${w.mulchDays[i]} days remaining.`);
  const vulnerable = [[w.shrub[i], w.shrubG[i]], [w.tree[i], w.treeG[i]]].some(([id, growth]) => id && establishmentStress(w, i, PLANTS[id], growth) > 0);
  if (vulnerable && biome.climate.growth[game.month] > 0.2) out.push('Young woody plants face additional dry-season establishment stress here. Mulch reduces this pressure.');
  return out;
}
