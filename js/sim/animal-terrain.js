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
