// Shared terrain rules for movement, landing, hunting, herds and diagnostics.
// Keep map exceptions here so new behaviors use the same boundaries.
import { T, F, isWater } from '../config.js';
import { ANIMAL } from '../data/animals.js';
import { biome } from '../biome.js';

export const WADERS = new Set(['heron', 'crane']);
export const shallows = (w, i) => { const t = w.terrain[i]; return t === T.MARSH || t === T.CREEK || t === T.MUD || (w.distWater[i] === 1 && !isWater(t)); };

// Flight can cross any terrain; landing needs land, a perch, or suitable water.
export function canLand(w, i, def) {
  if (def.move !== 'fly' || !isWater(w.terrain[i])) return true;
  const kind = def.sprite.kind;
  if (kind === 'duck' || kind === 'booby' || def.group === 'Seabirds') return true;
  if (WADERS.has(kind)) return shallows(w, i);
  return !!(w.tree[i] && w.treeG[i] > 0.5);
}

export function passable(w, i, a) {
  const move = a.move;
  if (move === 'fly') return true;
  // tree dwellers (monkeys, sloths) travel through connected canopy only
  if (move === 'tree') return !!(w.tree[i] && w.treeG[i] > 0.45) || w.feature[i] === F.SNAG;
  if (w.struct[i] >= 0) return false;
  if (biome.dryLand && ANIMAL[a.key]?.reef && biome.dryLand(w, i)) return false; // (reef animals stay in the sea, off the cay)
  const t = w.terrain[i];
  if (move === 'swim') return isWater(t) && w.feature[i] !== F.CULVERT;
  if (move === 'semi') return true;
  if (t === T.POND || t === T.RIVER) return false;
  if (w.feature[i] === F.FENCE && ANIMAL[a.key]?.fenced) return false; // big grazers can't cross fences
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
