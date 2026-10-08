// Visual proportions only; actual plant identity, growth and habitat stay in the world arrays.
import { hash2, valueNoise } from '../rng.js';
import { clamp } from '../config.js';

const WOODY = new Set(['conifer', 'broad', 'emergent', 'mangrove']);
export function groveForm(x, y, growth, shape) {
  // Retain specialist palms, banana, sculptural trees and reef proportions.
  if (!WOODY.has(shape.kind)) return { width: 1, height: 1, tint: 1 };
  const patch = valueNoise(x + 123, y + 87, 7, 241);
  const mature = clamp((growth - 0.35) / 0.5, 0, 1);
  // A restrained ten-percent spread on mature crowns, without widening young saplings.
  return {
    width: 1 + mature * 0.1,
    height: 1 + mature * (-0.2 + patch * 0.32 + (hash2(x, y, 242) - 0.5) * 0.24),
    tint: 1 + mature * (patch - 0.5) * 0.12,
  };
}
