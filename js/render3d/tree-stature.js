// How tall a tree species is drawn, from its real mature height (decision 0024). Plain data and
// arithmetic, with no three.js, so the simulation can read it too (sim/bird-passage.js).
import { TREE_SHAPES } from './geometry/tree-shapes.js';

// Animals are drawn about 2.5x life size so they read from the farm view, so trees can't be true
// scale (a 60 m fir would be 7.5 tiles tall). Drawn height grows with the square root of real
// height instead: 10 m is 1.47 tiles, 60 m is 3.6. That leaves the giants (kapok, Brazil nut)
// about where they were drawn, puts a fir about five elk cows tall, and an acacia over a giraffe.
const TILES_AT_10M = 1.47;
export const statureTiles = metres => TILES_AT_10M * Math.sqrt(metres / 10);

let enabled = true;
// (off draws every tree at its shape's own height, as before 0024: for before/after reviews)
export function setStature(on) { enabled = !!on; }

// Height-only multiplier on a species' drawn tree. Never below 1, so a tree is never drawn
// shorter than its shape: a giraffe still browses under the umbrella thorns.
export function treeStature(p) {
  if (!enabled || !p.heightM) return 1;
  const shape = TREE_SHAPES[p.look.type];
  return shape ? Math.max(1, statureTiles(p.heightM) / (shape.height * (p.look.scale ?? 1))) : 1;
}

// The species' tree shape at its own height. The extra height is a longer trunk under a crown of
// the shape's own size and branching (lift: geometry/trees.js), so elk walk under the branches
// and the limbs climbers use keep their angles. A conifer puts half of it into a longer crown
// (its tiers spread over a taller height), or it reads as a short crown on a bare pole.
export function statureShape(p, shape) {
  const k = treeStature(p);
  if (k === 1) return shape;
  const rise = shape.height * (k - 1), grow = shape.kind === 'conifer' ? rise / 2 : 0;
  return { ...shape, height: shape.height + grow, lift: rise - grow };
}

// A mature tree's nominal height in tiles (multiply by growth for a younger one).
export const treeHeight = (p, fallback = 2) => (TREE_SHAPES[p.look.type]?.height || fallback) * (p.look.scale ?? 1) * treeStature(p);

// Tree geometry built taller (liftTree in geometry/trees.js) remembers its lift as
// userData.lift = { at, by }: points above `at` rose by `by`, the trunk below stretched. Code that
// picks a height as a fraction of a tree's height (the limbs climbers use, birds' perches) reads
// it through treeLevel, so it measures the crown as built and not the longer trunk.
export function liftY(geo, y) {
  const L = geo.userData.lift;
  return !L ? y : y <= L.at ? y * (L.at + L.by) / L.at : y + L.by;
}
function unliftY(geo, y) {
  const L = geo.userData.lift;
  return !L ? y : y <= L.at + L.by ? y * L.at / (L.at + L.by) : y - L.by;
}
// The height a fraction t of the way up a tree's geometry, from low (the ground) to its top,
// as the unlifted tree had it. (geo.boundingBox must be computed.)
export function treeLevel(geo, t, low = 0) {
  const base = unliftY(geo, low);
  return liftY(geo, base + (unliftY(geo, geo.boundingBox.max.y) - base) * t);
}
