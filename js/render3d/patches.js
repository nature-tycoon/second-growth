// Meadow patches: real grassland isn't one even colour. Over a few tiles it's lusher and deeper
// green in one place, drier and more golden in another, thicker here and thinner there. One
// smooth pattern, shared by the ground tint (terrain.js) and the tufts growing on it (flora.js)
// so the two always agree. Worked out when plants are placed, never per frame.
import { valueNoise } from '../rng.js';

// lush: 0 (thin, dry) .. 1 (thick, deep green); warm: -1 (cooler green) .. 1 (golden)
export function meadowPatch(x, y) {
  const lush = valueNoise(x + 311, y + 177, 6, 91) * 0.65 + valueNoise(x + 53, y + 29, 2.3, 92) * 0.35;
  const warm = (valueNoise(x + 731, y + 419, 9, 93) - 0.5) * 2;
  return { lush, warm };
}

// shift a colour by the patch it's in
export function patchColor(c, pt, amount = 1) {
  const b = 1 + (0.5 - pt.lush) * 0.24 * amount;                  // thin, dry patches paler; lush ones deeper
  const gold = Math.max(0, pt.warm) * 0.3 * amount * (1.2 - pt.lush), cool = Math.max(0, -pt.warm) * 0.14 * amount;
  return [
    (c[0] * (1 - gold) + 0.78 * gold) * b * (1 - cool * 0.4),
    (c[1] * (1 - gold) + 0.68 * gold) * b,
    (c[2] * (1 - gold) + 0.36 * gold) * b * (1 + cool * 0.3),
  ];
}
