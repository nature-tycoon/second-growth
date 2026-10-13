// Visitor and snorkeler models.
import { P, eyes, grad, shade } from './model-core.js';

// ---------------------------------------------------------------- visitors
// Same palettes as the old 2D visitor sprites, so the eight looks carry over.
const SHIRTS = ['#c8583a', '#3a6a9a', '#e0b030', '#5a8a4a', '#8a4a8a', '#d88a6a', '#2a4a3a', '#b0302a'];
const PANTS = ['#3a3a4a', '#5a4a3a', '#2a3a5a', '#6a6a5a'];
const SKIN = ['#f0c8a0', '#d8a878', '#a87850', '#7a5030'];
const HAIR = ['#3a2a1a', '#8a6a3a', '#1a1a1a', '#c8a060'];
const FINS = ['#f0c020', '#2a7ad8', '#e8506a', '#2ab0a0'];

// snork: a snorkeler on the reef: no hat or boots, but a mask, a snorkel and a pair of bright fins
function person(m, look, snork = false) {
  const shirt = SHIRTS[look % SHIRTS.length], pants = PANTS[look % PANTS.length], skin = SKIN[(look >> 1) % SKIN.length];
  const shirtC = grad(shirt, shade(shirt, -0.18), 0, 0.6);
  // legs and boots (they swing from the hip)
  for (const side of [1, -1]) {
    const hip = [0, 15.5, side * 1.9], part = side > 0 ? P.LEG_FL : P.LEG_FR;
    m.limb(hip, [0.2, 2.2, side * 1.95], 1.75, 1.35, side > 0 ? pants : shade(pants, -0.08), { part, pivot: hip });
    if (snork) m.ell([0.2, -1.6, side * 1.95], [0.45, 3.6, 1.7], FINS[look % FINS.length], { part, pivot: hip }); // a fin, flat to the water
    else m.ell([0.9, 1.1, side * 1.95], [2.1, 1.15, 1.35], '#3a2e26', { part, pivot: hip, lo: true });
  }
  m.ell([0, 16, 0], [2.7, 2.4, 3.6], pants);
  // torso, a little broader at the shoulders
  m.ell([0, 20.8, 0], [2.8, 5.6, 3.9], shirtC);
  m.ell([0, 24, 0], [2.6, 2.4, 4.4], shirtC);
  if (look % 3 === 0 && !snork) { // daypack
    m.ell([-3.3, 21.5, 0], [1.9, 3.8, 3.1], shade(shirt, -0.4));
    for (const side of [1, -1]) m.limb([1.2, 25.3, side * 2.4], [1.4, 19, side * 2.9], 0.45, 0.45, shade(shirt, -0.5), { caps: false });
  }
  // arms swing opposite the legs: the left arm moves with the right leg
  for (const side of [1, -1]) {
    const sh = [0, 24.6, side * 4.3], part = side > 0 ? P.LEG_BL : P.LEG_BR;
    m.limb(sh, [0.4, 17.4, side * 4.9], 1.25, 1.05, shirtC, { part, pivot: sh });
    m.ell([0.5, 16.6, side * 5], [1.05, 1.15, 1.0], skin, { part, pivot: sh, lo: true });
  }
  // head, hair or a sun hat
  const hp = [0.3, 30, 0], hd = { part: P.HEAD, pivot: [0, 26.5, 0] };
  m.limb([0, 26, 0], [0.1, 28, 0], 1.3, 1.25, skin, { ...hd, caps: false });
  m.ell(hp, [3.1, 3.4, 3], skin, hd);
  eyes(m, hp, 2.8, 0.4, 1.1, 0.42, P.HEAD, hd.pivot);
  if (snork) {
    // mask over the eyes, its strap round the head, and the snorkel curving up past one ear
    m.ell([hp[0] + 2.3, hp[1] + 0.5, 0], [1.3, 1.3, 2.7], '#2a3e4c', hd);
    m.ell([hp[0], hp[1] + 0.5, 0], [3.2, 0.6, 3.15], '#1e1e22', hd);
    m.limb([hp[0] + 2.4, hp[1] - 1.6, 2.2], [hp[0] + 0.6, hp[1] + 1.5, 3.0], 0.45, 0.45, '#f0c020', { ...hd, caps: false });
    m.limb([hp[0] + 0.6, hp[1] + 1.5, 3.0], [hp[0] - 0.6, hp[1] + 4.8, 2.6], 0.45, 0.4, '#f0c020', hd);
    const hair = HAIR[look % 4];
    m.ell([-0.5, 31.1, 0], [3.35, 2.6, 3.25], hair, hd);
  } else if (look % 2) {
    const hat = look % 4 === 1 ? '#6a5a3a' : '#3a5a3a';
    m.ell([0.2, 32.3, 0], [5.2, 0.55, 5.2], hat, hd);
    m.ell([0, 33.4, 0], [3.1, 1.9, 3.1], shade(hat, 0.08), hd);
  } else {
    const hair = HAIR[look % 4];
    m.ell([-0.5, 31.1, 0], [3.35, 2.6, 3.25], hair, hd);
    m.ell([-1.6, 29.4, 0], [2.1, 2.8, 3.05], hair, hd);
  }
}

export { person };
