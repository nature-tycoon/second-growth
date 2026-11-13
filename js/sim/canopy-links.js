// Which neighbouring crowns a climbing primate can cross between up in the trees (decision 0041).
// The simulation moves climbers tile to tile; the drawing then has to find a real limb-to-limb
// crossing between the two trees (render3d/canopy-motion.js crownRoute). Before this, any two
// wooded tiles counted as joined, so a monkey's simulated self walked on across gaps its drawn
// body could not cross, and the drawing stalled, fell behind and snapped.
//
// Each tree's crown is estimated from the same plain data flora.js draws it from: the trunk
// spot, the shape's crown radius and height, growth, the per-tile size variation and grove form.
// The limits were fitted to what crownRoute actually manages (tools/monkey-movement-measure.mjs
// and decision 0041): walker monkeys always find a way (a leap to the far trunk at worst), a
// siamang can't leap up to a crown topping its own by more than about 1.5 body lengths, and an
// orangutan only crosses where the two crowns interlace by a body length or more.
import { hash2 } from '../rng.js';
import { groveForm } from '../render3d/groves.js';
import { TREE_SHAPES } from '../render3d/geometry/tree-shapes.js';
import { statureShape } from '../render3d/tree-stature.js';
import { trunkSpot } from './ground-obstacles.js';
import { bodyLength } from './climb-pace.js';
import { climbStyle } from '../data/animal-kinds.js';

// A tree's crown: its trunk spot, how far its limbs reach sideways, and its height.
const crowns = new Map(); // (by tile: recomputed when the tree or its growth changes)
export function crownOf(w, i) {
  const id = w.tree[i], g = w.treeG[i], kept = crowns.get(i);
  if (kept && kept.w === w && kept.id === id && kept.g === g) return kept;
  const p = w.catalog.plants[id], base = p && TREE_SHAPES[p.look.type];
  if (!base) return null;
  const x = i % w.w, y = (i / w.w) | 0, shape = statureShape(p, base);
  const [cx, cz] = trunkSpot(w, x, y, p, false);
  const sc = (0.2 + 0.8 * g) * (0.78 + hash2(x, y, 9) * 0.42) * (p.look.scale ?? 1), grove = groveForm(x, y, g, shape);
  const top = (shape.height + (shape.lift || 0)) * sc * grove.height;
  const reach = (base.rx ?? base.radius ?? .45) * sc * grove.width * TIP_REACH;
  const crown = { w, id, g, x: cx, z: cz, reach, top };
  crowns.set(i, crown);
  return crown;
}
// (limb tips reach about this share of the crown's drawn radius: calibrated against crownRoute
// with tools/monkey-movement-measure.mjs)
const TIP_REACH = .8;

// What a primate's crossing between neighbouring crowns needs, in body lengths: `overlap`, how far
// the two crowns' limbs must interlace (a negative overlap is a gap it can leap); `rise`, how much
// higher the far crown's top may stand; `ground`, whether it climbs down and walks a gap it can't
// cross up there (orangutans do; siamangs almost never leave the trees). Null for climbers that
// always find a way.
export function crossingLimits(def) {
  const climb = climbStyle(def);
  if (climb === 'clamber') return { overlap: 1, rise: 1.5, ground: true };
  if (climb === 'swing') return { overlap: -4, rise: 1.5 };
  return null;
}

// Can a climber of this species cross from tree tile i to tree tile j through the crowns?
export function crownsJoin(w, i, j, def) {
  const limits = crossingLimits(def);
  if (!limits) return true;
  const a = crownOf(w, i), b = crownOf(w, j);
  if (!a || !b) return true; // (a snag or a shape without limbs: the climb is on the trunk)
  const size = bodyLength(def), overlap = a.reach + b.reach - Math.hypot(b.x - a.x, b.z - a.z);
  return overlap >= limits.overlap * size && b.top - a.top <= limits.rise * size;
}

// Along a path: an orangutan whose next tile is a crown it can't reach climbs down, walks the gap
// on the ground (a.move 'ground', drawn there as climbers.js's foragers are), and climbs the far
// tree when it gets there (a.gapTo).
export function crossGap(wl, a, def, next) {
  const w = wl.game.world, x = Math.floor(a.x), y = Math.floor(a.y), here = w.inb(x, y) ? w.idx(x, y) : -1;
  if (a.gapTo != null) {
    if (here === a.gapTo || next < 0 && w.tree[here] && w.treeG[here] > 0.45) { a.move = 'tree'; a.gapTo = null; }
    return;
  }
  if (here < 0 || next < 0 || next === here || !crossingLimits(def)?.ground || crownsJoin(w, here, next, def)) return;
  a.move = 'ground'; a.gapTo = next;
}
