// Large-herbivore pressure (decision 0033): where the big plant-eaters spend their days, in kg of live
// animal per hectare, split by how they feed. Grazers crop the sward, browsers pick young trees and
// shrubs by taste, and elephants push over and strip young trees. sim/grazing.js turns this into what
// happens to each plant; the per-tile sward use of decision 0011 (w.grazed) stays alongside it.
//
// The field is a coarse grid (CELL × CELL tiles) holding a running average of the last month or two,
// so it follows the herds as they move but doesn't flicker day to day. One pass over the animals a day.
import { referenceFor, TILE_HA } from '../data/eco-reference.js';
import { isMaleVariant } from '../data/animals.js';
import { isWater, lifeAge, DAYS_PER_YEAR } from '../config.js';
import { inRut } from './cervid-groups.js';
import { removeTree } from './plants.js';

export const CELL = 4;
const MEMORY = 45; // days the running average remembers
const CELL_HA = CELL * CELL * TILE_HA;
const YOUNG = 0.35; // a calf or fawn weighs about this share of an adult
// The share of an intact ecosystem's herbivore biomass in each guild: about half grazing, half browsing
// (mixed feeders count on both sides), and elephants about a quarter of an intact savanna's.
const GUILD_SHARE = { graze: 0.5, browse: 0.5, heavy: 0.25 };
const KERNEL = [1, 2, 1]; // (each animal's day is spread over its cell and the cells around it)

function newField(w, ref) {
  const cw = Math.ceil(w.w / CELL), ch = Math.ceil(w.h / CELL), n = cw * ch;
  return { cw, ch, ref, warm: false, hasHeavy: false, graze: new Float32Array(n), browse: new Float32Array(n), heavy: new Float32Array(n),
    day: [new Float32Array(n), new Float32Array(n), new Float32Array(n)] };
}

// Once a day: add up where every large herbivore is, and fold it into the running average.
export function herbivoryDay(game) {
  const w = game.world, range = referenceFor(game.map).herbivores;
  if (!range || game.catalog.definition.look.underwater) { w.herbivory = null; return; }
  const ref = (range[0] + range[1]) / 2;
  let f = w.herbivory;
  if (!f || f.cw !== Math.ceil(w.w / CELL) || f.ch !== Math.ceil(w.h / CELL)) f = w.herbivory = newField(w, ref);
  f.ref = ref;
  const [dg, db, dh] = f.day, { cw, ch } = f;
  dg.fill(0); db.fill(0); dh.fill(0);
  for (const a of game.wildlife.agents) {
    if (a.leaving || a.state === 'dormant') continue;
    const def = game.catalog.animals[a.sp], h = def.behavior.herbivore;
    if (!h) continue;
    const cx = Math.floor(a.x / CELL), cy = Math.floor(a.y / CELL);
    if (cx < 0 || cy < 0 || cx >= cw || cy >= ch) continue;
    const kg = h.kg * (a.juvenile || lifeAge(a) < def.mature * DAYS_PER_YEAR ? YOUNG : 1) / CELL_HA;
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && y >= 0 && x < cw && y < ch) sum += KERNEL[dx + 1] * KERNEL[dy + 1];
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= cw || y >= ch) continue;
      const j = y * cw + x, m = kg * KERNEL[dx + 1] * KERNEL[dy + 1] / sum;
      dg[j] += m * (1 - h.browse); db[j] += m * h.browse;
      if (h.breaks) dh[j] += m;
    }
  }
  // (a new or loaded farm starts from today's animals instead of an empty field)
  const k = f.warm ? 1 / MEMORY : 1;
  let hasHeavy = false;
  for (let j = 0; j < f.graze.length; j++) {
    f.graze[j] += (dg[j] - f.graze[j]) * k; f.browse[j] += (db[j] - f.browse[j]) * k; f.heavy[j] += (dh[j] - f.heavy[j]) * k;
    if (f.heavy[j] < 0.01) f.heavy[j] = 0; else hasHeavy = true;
  }
  f.warm = true; f.hasHeavy = hasHeavy; // (no elephants on the farm: elephantFelled skips every tree)
}

// kg/ha of one guild ('graze', 'browse' or 'heavy') at tile i, blended between cell centres.
export function herbivoreKg(w, i, guild) {
  const f = w.herbivory;
  if (!f) return 0;
  const a = f[guild], fx = (i % w.w + 0.5) / CELL - 0.5, fy = ((i / w.w | 0) + 0.5) / CELL - 0.5;
  const x0 = Math.max(0, Math.floor(fx)), y0 = Math.max(0, Math.floor(fy));
  const x1 = Math.min(f.cw - 1, x0 + 1), y1 = Math.min(f.ch - 1, y0 + 1);
  const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
  const top = a[y0 * f.cw + x0] * (1 - tx) + a[y0 * f.cw + x1] * tx;
  const bottom = a[y1 * f.cw + x0] * (1 - tx) + a[y1 * f.cw + x1] * tx;
  return top * (1 - ty) + bottom * ty;
}

// How hard a guild presses on plants at tile i, 0..1: 0.63 where the guild stands at its share of the
// map's intact biomass, nearly full at three times it. One curve for every map, measured against the
// herbivores that biome's plants live with.
export function herbivoreIndex(w, i, guild) {
  const f = w.herbivory;
  if (!f) return 0;
  const kg = herbivoreKg(w, i, guild);
  return kg > 0 ? 1 - Math.exp(-kg / (f.ref * GUILD_SHARE[guild])) : 0;
}

// Farm-wide kg/ha by guild, for the Ecosystem Report and the tools.
export function herbivoreTotals(w) {
  const f = w.herbivory, out = { graze: 0, browse: 0, heavy: 0, total: 0 };
  if (!f) return out;
  for (const g of ['graze', 'browse', 'heavy']) { let s = 0; for (const v of f[g]) s += v; out[g] = s * CELL_HA / (w.n * TILE_HA); }
  out.total = out.graze + out.browse;
  return out;
}

// Antlered males fray saplings when they strip their velvet and in the rut, aromatic conifers most.
const RUB = { lo: 0.08, hi: 0.5, hit: 0.07 };
export function rubSapling(game, a, def, x, y) {
  const h = def.behavior.herbivore, rng = game.rng, w = game.world;
  if (!h?.rubs || !inRut(game) || !isMaleVariant(def, a) || rng() > 0.15) return;
  const dx = Math.floor(rng() * 3) - 1, dy = Math.floor(rng() * 3) - 1;
  if (!w.inb(x + dx, y + dy)) return;
  const i = w.idx(x + dx, y + dy), p = game.catalog.plants[w.tree[i]];
  if (!p || w.treeG[i] < RUB.lo || w.treeG[i] >= RUB.hi || isWater(w.terrain[i]) || (!p.conifer && rng() < 0.5)) return;
  if ((w.treeG[i] -= RUB.hit) <= 0.02) removeTree(w, i, 'browse', rng, { deadwood: false });
  game.stats.saplingsRubbed = (game.stats.saplingsRubbed || 0) + 1;
}
