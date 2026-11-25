// Stranded fish (decision 0034). A river fish that breathes air (trait breathesAir: snakeheads,
// African catfish) left in a puddle too small for it wriggles over a tile or two of wet ground to
// the nearest water big enough, as real ones do between pools, mostly at night and in the rain.
// It never crosses dry land. Other fish stay in their pool, and die off as it dries.
//
// Found 2026-11-25 (ideas phone-creeks-fish s12): on Sumatra seed 37, nine snakeheads were left
// in a one-tile marsh puddle the dry season had cut off, a pond one tile away across wet peat;
// they piled up there for good (river-fish-pile-probe 50 per 1000).
//
// The crossing is an ordinary walk (state 'walk', path [the tile it heads for]) with `a.wriggle`
// set: riverFishStep lets it onto wet ground, steering doesn't snap it back to the pool behind it,
// and the drawing lays it on the ground, wriggling (actors-swim.js).
import { T, isWater } from '../config.js';
import { trait } from '../data/animal-kinds.js';
import { swimDepth, fishDepth } from './waterline.js';
import { runDepth } from './swim-routes.js';
import { passable } from './animal-terrain.js';

const SMALL = 2;       // (a component with this many tiles deep enough at their centre, or fewer, is a puddle)
const REACH = 3;       // (how far it looks for water, in tiles)
const OVER = 2.2;      // (the most ground it crosses, in tiles)
const STEP = 0.08;
export const WET_MOIST = 0.75;
export const WRIGGLE_PACE = 0.35; // (of its swimming speed, out of the water)
const KEEP_DAYS = 2;   // (a crossing broken off, by a hunter say, is taken up again for this long)

// Ground a fish can wriggle over: in or beside water, mud, or soil soaked wet (a peat swamp's floor).
export function wetGround(w, fx, fy) {
  const x = Math.floor(fx), y = Math.floor(fy);
  if (!w.inb(x, y)) return false;
  const i = w.idx(x, y), t = w.terrain[i];
  if (w.struct[i] >= 0 || w.fire?.[i]) return false;
  if (isWater(t) || t === T.MUD) return true;
  return t !== T.ROAD && t !== T.GRAVEL && t !== T.TRAIL && w.moist[i] >= WET_MOIST;
}

export const breathesAir = def => !!trait(def, 'breathesAir');

// The drawn sun's night (game.todU: 0 dawn, 0.86 sunset; asleep in primate-behavior.js), or rain.
// Headless there is no sun, and it may go any time.
const wriggleTime = game => game.todU == null || game.weather === 'rain' || game.todU > 0.86 && game.todU < 0.975;

// Out of the water it can swim in: on the ground, crossing.
export const outOfWater = (w, a, def) => runDepth(w, a.x, a.y) < fishDepth(def);

// Whether a straight wriggle from (x0, y0) to (x1, y1) keeps to wet ground or water, with no more
// than OVER of it out of the water.
function wetLine(w, x0, y0, x1, y1, need) {
  const L = Math.hypot(x1 - x0, y1 - y0), k = Math.max(1, Math.ceil(L / STEP));
  let over = 0;
  for (let s = 1; s <= k; s++) {
    const x = x0 + (x1 - x0) * s / k, y = y0 + (y1 - y0) * s / k;
    if (runDepth(w, x, y) >= need) continue;
    if (!wetGround(w, x, y) || (over += L / k) > OVER) return false;
  }
  return true;
}

const deepAt = (w, i, need) => swimDepth(w, i % w.w + 0.5, (i / w.w | 0) + 0.5) >= need;

// Whether the water a fish would reach from tile j holds more than a puddle (more than SMALL tiles
// deep enough), by the same swim test its routes use.
function bigWater(w, a, j, need, swim) {
  const seen = new Set([j]), q = [j];
  let deep = 0;
  for (let h = 0; h < q.length && q.length < 60; h++) {
    const i = q[h];
    if (deepAt(w, i, need) && ++deep > SMALL) return true;
    const x = i % w.w, y = i / w.w | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || !w.inb(x + dx, y + dy)) continue;
      const k = w.idx(x + dx, y + dy);
      if (!seen.has(k) && passable(w, k, a) && swim(i, k)) { seen.add(k); q.push(k); }
    }
  }
  return false;
}

// chooseTarget's choice for a stranded air-breather: `comp` holds the tiles (bfs[0..n)) its search
// reached through water it can swim, `inComp(i)` whether a tile is one of them. True when it sets
// off over the ground.
export function wriggleOut(wl, a, def, bfs, n, inComp, swim) {
  const game = wl.game, w = game.world;
  if (!breathesAir(def) || a.leaving || def.reef || a.noWriggle === game.day || !swim) return false;
  const need = fishDepth(def);
  let deep = 0;
  for (let k = 0; k < n; k++) if (deepAt(w, bfs[k], need) && ++deep > SMALL) return false;
  if (!wriggleTime(game)) return false;
  const x0 = Math.floor(a.x), y0 = Math.floor(a.y);
  let best = -1, bd = Infinity;
  for (let dy = -REACH; dy <= REACH; dy++) for (let dx = -REACH; dx <= REACH; dx++) {
    const x = x0 + dx, y = y0 + dy;
    if (!w.inb(x, y)) continue;
    const j = w.idx(x, y), d = Math.hypot(x + 0.5 - a.x, y + 0.5 - a.y);
    if (d >= bd || inComp(j) || !passable(w, j, a) || !deepAt(w, j, need)) continue;
    if (!wetLine(w, a.x, a.y, x + 0.5, y + 0.5, need) || !bigWater(w, a, j, need, swim)) continue;
    best = j; bd = d;
  }
  if (best < 0) { a.noWriggle = game.day; return false; }
  a.wriggle = { to: best, day: game.day };
  a.path = [best]; a.restSpot = null; a.moveProgress = null; a.state = 'walk';
  return true;
}

// At the start of a choice: a crossing broken off on the ground goes on (true), else it is over.
export function wriggleOn(wl, a, def) {
  if (!a.wriggle) return false;
  const w = wl.game.world, j = a.wriggle.to;
  if (wl.game.day - a.wriggle.day <= KEEP_DAYS && outOfWater(w, a, def) && wetLine(w, a.x, a.y, j % w.w + 0.5, (j / w.w | 0) + 0.5, fishDepth(def))) {
    a.path = [j]; a.restSpot = null; a.moveProgress = null; a.state = 'walk';
    return true;
  }
  // (held up on the way, or out of time: to the nearest water it can wriggle to, the puddle it
  // came from too, rather than be put back in the water in one jump by steering.js)
  if (outOfWater(w, a, def)) {
    const need = fishDepth(def), x0 = Math.floor(a.x), y0 = Math.floor(a.y);
    let best = -1, bd = Infinity;
    for (let dy = -REACH; dy <= REACH; dy++) for (let dx = -REACH; dx <= REACH; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (!w.inb(x, y)) continue;
      const i = w.idx(x, y), d = Math.hypot(x + 0.5 - a.x, y + 0.5 - a.y);
      if (d < bd && i !== j && passable(w, i, a) && deepAt(w, i, need) && wetLine(w, a.x, a.y, x + 0.5, y + 0.5, need)) { best = i; bd = d; }
    }
    if (best >= 0 && wl.game.day - a.wriggle.day <= KEEP_DAYS * 2) {
      a.wriggle = { to: best, day: a.wriggle.day };
      a.path = [best]; a.restSpot = null; a.moveProgress = null; a.state = 'walk';
      return true;
    }
  }
  a.wriggle = null;
  return false;
}

// Daily: a fish that doesn't breathe air, left in water shallower than it needs with no deep water
// within reach today (chooseTarget's a.noDeep), dies as the pool dries; an air-breather only once
// its spot holds no water at all. True when it died.
export const STRAND_DEATH = 0.25;
export function strandedDies(wl, a, def) {
  if (a.move !== 'swim' || def.reef || a.leaving || a.wriggle || a.noDeep == null || wl.game.day - a.noDeep > 1) return false;
  const w = wl.game.world, d = runDepth(w, a.x, a.y); // (the water it can swim in, a creek's riffle too: 0034)
  if (breathesAir(def) ? d >= 0.01 : d >= fishDepth(def)) return false;
  return wl.game.rng() < STRAND_DEATH;
}
