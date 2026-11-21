// The migration's route across the range (idea batch cinema-creeks s8, decision 0052).
// The Great Migration runs a broad seasonal loop: the southern plains in the rains, west and north
// as they dry, and back south with the short rains. On this range it shows as the herds swimming
// the river in the south and working their way north to the park through the dry season. Within
// that loop the real herds follow green grass and water, so the exact line and timing differ from
// year to year with the rain, fire and grazing. Here:
//  - the herds cross the river where the grass beyond the bank is greenest (`crossingColumn`);
//  - a herd leader's next patch is weighted by how green it is and how far along the season's
//    northward drift it lies (`stepWeight` in its short walks about, `routeWeight` in roam());
//  - its herd stand on the green grass about their places (`GRAZE_GREEN`, keepWithHerd);
//  - a herd moves on sooner when the grass around it is eaten or dried out (`grassGone`).
// No new saved state: everything is read from the land and the calendar.
import { clamp, isWater } from '../config.js';
import { simRandom } from './sim-random.js';
import { passable } from './animal-terrain.js';

const GRASS = new Set(['grass', 'tallgrass', 'sedge']);
export const GRAZE_GREEN = 0.25; // (green enough for a migrating herd member to stand and graze on)

// How green and edible the grass on a tile is, 0..1: grown grass, less what the herds have
// cropped, greener where the ground holds water (low ground and banks stay green into the dry
// season), and greenest where it is coming back a month or more after a fire (the green flush).
export function greenness(w, i) {
  const p = w.catalog.plants[w.ground[i]];
  if (!p || !GRASS.has(p.look.type) || w.fire[i]) return 0;
  const fresh = 1 - 0.7 * Math.min(1, w.grazed?.[i] || 0);
  const wet = clamp(0.25 + 1.5 * w.moist[i], 0.15, 1);
  const s = w.scorch?.[i] || 0; // (days left of a burn's mark: 160 just after a wildfire, 130 a controlled burn)
  const flush = s > 0 && s < 125 ? 1.3 : 1;
  return clamp(w.groundG[i] * fresh * wet * flush, 0, 1);
}

// The row the season's drift has reached: just north of the river when the herds arrive, the
// park's edge by the end of their season here. (Rows run 0 at the north edge to h-1 at the river.)
export function driftRow(game, def) {
  const s = def.season, k = s ? s.indexOf(game.month) : -1;
  const h = game.world.h;
  if (k < 0) return h * 0.5;
  const t = (k + (game.dayOfMonth - 1) / 10) / s.length;
  return (h - 10) + (6 - (h - 10)) * t;
}

// How much a migrating leader wants tile i as its next patch, on top of its habitat: green grass
// first, then the season's drift north (soft: a broad band, so the greenest grass decides the line).
export function routeWeight(game, def, i, row = driftRow(game, def)) {
  const w = game.world, y = (i / w.w) | 0, band = (y - row) / (w.h * 0.3);
  const g = 0.1 + greenness(w, i);
  return g * g * Math.exp(-band * band);
}

// The same for the next few steps of a migrating leader's walk about (most of its route is made
// of these, not of long trips): green grass, and a pull north while the herd is behind the season's
// drift. Ahead of it, a herd lingers on good grass rather than turning back south.
export function stepWeight(game, def, i, row, y0, R) {
  const w = game.world, y = (i / w.w) | 0;
  const behind = clamp((y0 - row) / 8, 0, 1);
  const g = 0.1 + greenness(w, i);
  return g * g * Math.exp(1.5 * behind * (y0 - y) / R);
}

// A herd member's grazing spot: the nearest green passable tile within 1.8 tiles of its place in the
// herd ({ i, here: it is standing on it }), or null when there is none (bare ground, dry season):
// then it keeps to its place as before. A direct look at the dozen tiles, no search.
export function greenSpot(w, a, tx, ty) {
  const ax = Math.floor(a.x), ay = Math.floor(a.y);
  const here = w.inb(ax, ay) && Math.hypot(ax + 0.5 - tx, ay + 0.5 - ty) < 1.8 ? w.idx(ax, ay) : -1;
  if (here >= 0 && greenness(w, here) > GRAZE_GREEN) return { i: here, here: true };
  // (the nearest green tile, not the greenest: a grazing step, not a hop about the place)
  let best = -1, bd = Infinity;
  for (let y = Math.floor(ty - 1.8); y <= Math.floor(ty + 1.8); y++) for (let x = Math.floor(tx - 1.8); x <= Math.floor(tx + 1.8); x++) {
    if (!w.inb(x, y) || Math.hypot(x + 0.5 - tx, y + 0.5 - ty) >= 1.8) continue;
    const j = w.idx(x, y), d = Math.hypot(x + 0.5 - a.x, y + 0.5 - a.y);
    if (d < bd && greenness(w, j) > GRAZE_GREEN && passable(w, j, a)) { bd = d; best = j; }
  }
  return best >= 0 ? { i: best, here: false } : null;
}

// The grass about a herd is eaten or dried out: it moves on sooner (a 7x7 sample, every other tile).
export function grassGone(w, x, y) {
  let s = 0, n = 0;
  for (let dy = -3; dy <= 3; dy += 2) for (let dx = -3; dx <= 3; dx += 2) {
    if (!w.inb(x + dx, y + dy)) continue;
    s += greenness(w, w.idx(x + dx, y + dy)); n++;
  }
  return n ? s / n < 0.15 : false;
}

// Where the herds swim the river this year: the stretch of the middle of the range with the
// greenest grass beyond the far bank, with some chance in it (the herds don't survey every reach).
// (movement's random stream, not the game's: the weather and arrivals keep their own sequence)
export function crossingColumn(game, def) {
  const w = game.world, mid = def.crossing.x ?? 0.5;
  const x0 = Math.round(w.w * (mid - 0.2)), x1 = Math.round(w.w * (mid + 0.2));
  let best = Math.round(w.w * mid), bs = -1;
  for (let x = x0; x <= x1; x += 2) {
    if (!isWater(w.terrain[w.idx(x, w.h - 1)])) continue; // (the river has to be there to swim)
    let bank = w.h - 1;
    while (bank > 0 && isWater(w.terrain[w.idx(x, bank)])) bank--;
    if (w.h - 1 - bank > 10) continue; // (a creek or pond joined to the river: the herds would swim up it)
    let s = 0, n = 0;
    for (let y = bank - 16; y <= bank - 2; y += 2) for (let dx = -5; dx <= 5; dx += 2) {
      if (!w.inb(x + dx, y)) continue;
      s += greenness(w, w.idx(x + dx, y)); n++;
    }
    const sc = (0.05 + (n ? s / n : 0)) ** 2 * (0.6 + 0.8 * simRandom());
    if (sc > bs) { bs = sc; best = x; }
  }
  return best;
}
