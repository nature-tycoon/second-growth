// Shared terrain rules for movement, landing, hunting, herds and diagnostics.
// Keep map exceptions here so new behaviors use the same boundaries.
import { T, F, isWater } from '../config.js';
import { trait } from '../data/animal-kinds.js';

// Birds that stand and feed in the shallows (trait wades: herons, cranes, dippers).
export const wader = def => !!trait(def, 'wades');
// Every point of the straight line from (x0, y0) to (x1, y1) is over water or the bank beside it:
// a dipper's flight follows the creek and never cuts across land.
export function overWater(w, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.4);
  for (let s = 1; s < n; s++) {
    const x = Math.floor(x0 + (x1 - x0) * s / n), y = Math.floor(y0 + (y1 - y0) * s / n);
    if (!w.inb(x, y)) return false;
    const j = w.idx(x, y);
    if (!isWater(w.terrain[j]) && w.distWater[j] > 1) return false;
  }
  return true;
}

// Small land animals that keep out of the water altogether (0025): a vole or a rabbit doesn't wade
// a marsh or a creek. Bigger ones may wade across, but don't stop in it (steering.js). The kinds
// are drawn kinds, not species: raccoons, coatis and civets forage in the shallows and are left out.
const DRY_FOOTED = new Set(['rodent', 'rabbit', 'squirrel', 'agouti', 'armadillo', 'turtle', 'beetle', 'pangolin', 'monitor']);
const dryFooted = d => !!d && !d.reef && DRY_FOOTED.has(d.sprite.kind); // (a sea turtle is drawn as a turtle too)
export const shallows = (w, i) => { const t = w.terrain[i]; return t === T.MARSH || t === T.CREEK || t === T.MUD || (w.distWater[i] === 1 && !isWater(t)); };
// The shallows this wader stands in: a dipper (fastWater) only the creek itself, its riffles and
// splash rocks, never a pond's or a marsh's edge.
export const shallowsFor = (w, i, def) => trait(def, 'fastWater') ? w.terrain[i] === T.CREEK : shallows(w, i);

// Flight can cross any terrain; landing needs land, a perch, or suitable water.
export function canLand(w, i, def) {
  if (def.move !== 'fly') return true;
  // (a dipper comes down only on its creek or the rocks of its bank: never a field, never a pond)
  if (trait(def, 'fastWater')) return w.terrain[i] === T.CREEK || w.distWater[i] <= 1 && !isWater(w.terrain[i]);
  if (!isWater(w.terrain[i])) return true;
  const kind = def.sprite.kind;
  if (kind === 'duck' || kind === 'booby' || def.group === 'Seabirds') return true;
  if (wader(def)) return shallowsFor(w, i, def);
  return !!(w.tree[i] && w.treeG[i] > 0.5);
}

export function passable(w, i, a) {
  const move = a.move;
  if (move === 'fly') return true;
  // tree dwellers (monkeys, sloths) travel through connected canopy only
  if (move === 'tree') return !!(w.tree[i] && w.treeG[i] > 0.45) || w.feature[i] === F.SNAG;
  if (w.struct[i] >= 0) return false;
  if (w.catalog.definition.dryLand && w.catalog.animal[a.key]?.reef && w.catalog.definition.dryLand(w, i)) return false; // (reef animals stay in the sea, off the cay)
  const t = w.terrain[i];
  if (move === 'swim') return isWater(t) && w.feature[i] !== F.CULVERT;
  if (move === 'semi') return true;
  if (t === T.POND || t === T.RIVER) return false;
  if ((t === T.MARSH || t === T.CREEK) && dryFooted(w.catalog.animal[a.key])) return false;
  if (w.feature[i] === F.FENCE && w.catalog.animal[a.key]?.fenced) return false; // big grazers can't cross fences
  return true;
}

// Swimming arcs and momentum must obey the same shore boundary as route finding.
// Check the swept segment, including the two sides of a diagonal tile crossing.
export function reefMoveSafe(w, a, nx, ny) {
  const steps = Math.max(1, Math.ceil(Math.hypot(nx - a.x, ny - a.y) / 0.2));
  const open = (x, y) => w.inb(x, y) ? passable(w, w.idx(x, y), a) : !!a.leaving;
  let x0 = Math.floor(a.x), y0 = Math.floor(a.y);
  for (let k = 1; k <= steps; k++) {
    const x = Math.floor(a.x + (nx - a.x) * k / steps), y = Math.floor(a.y + (ny - a.y) * k / steps);
    if (!open(x, y) || x !== x0 && y !== y0 && (!open(x, y0) || !open(x0, y))) return false;
    x0 = x; y0 = y;
  }
  return true;
}
