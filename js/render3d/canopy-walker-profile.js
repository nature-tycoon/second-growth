import { climbStyle } from '../data/animal-kinds.js';
// Four-limbed branch walkers share contact timing, but keep their own anatomy.
export function isCanopyWalker(def) {
  return def.move === 'tree' && climbStyle(def) === 'walk';
}

export function canopyWalkerBends(length, height) {
  const armHeight = (height + .06) / .51, legHeight = height / .45;
  return [[.13, .26 * armHeight, .11], [.13, .26 * armHeight, -.11],
    [-.1, .235 * legHeight, .105], [-.1, .235 * legHeight, -.105]]
    .map(point => point.map(value => value * length));
}
