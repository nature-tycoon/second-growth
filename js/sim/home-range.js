// Home ranges: each resident land mammal settles a home of its own and remembers the nearest
// water it can reach from there. Settling weighs habitat against the homes its own kind already
// hold, so a population spreads over its habitat, and each animal's "nearest water" starts from
// its own home rather than from wherever it happens to stand. Water trips follow a remembered
// route, so repeated trips wear a trail. Decision 0013.
import { clamp } from '../config.js';
import { hash2 } from '../rng.js';
import { passable } from './animal-terrain.js';
import { travelSpeed } from './climb-pace.js';
import { followRoute, preferTrailPath } from './animal-trails.js';
import { hasTerritory } from './animal-territory.js';

// Residents: land mammals that walk to water. Migrants keep migrating; river patrollers keep patrolling.
export function homeEligible(wl, def) {
  return wl.drinks(def) && (def.move === 'ground' || def.move === 'semi') && !def.crossing && !def.patrol && !def.reef;
}
// Game-scale radius in tiles (a tile is about 8 m on the PNW farm): a rabbit about 5, a deer about 7,
// a cougar or bear 16, the largest that fits the farm.
export const homeRadius = def => clamp(2 + Math.sqrt(def.hr) * 0.7, 4, 16);
// How far it will walk for a drink grows faster than its home core: big animals range widely,
// and a bear's or cougar's real range covers the whole farm and more.
export const waterReach = def => clamp(Math.sqrt(def.hr) * 2, 6, 40) * (def.behavior.water?.reach ?? 1);
const at = (w, j) => [j % w.w + 0.5, (j / w.w | 0) + 0.5];
const dist = (w, i, j) => Math.hypot(i % w.w - j % w.w, (i / w.w | 0) - (j / w.w | 0));

// Who holds a home: an independent adult, or the leader of its herd/family. Followers go where
// their leader goes; the young stay with their mother.
function holder(wl, a, def) {
  if (a.leaving || a.juvenile || a.mom != null || a.visit || a.trip != null) return false;
  if ((def.herd || def.familyHerd) && wl.herdLeader(a) !== a) return false;
  return homeEligible(wl, def);
}

// Keep a valid home, settling one when there is none. Returns the home, or null.
export function ensureHome(wl, a, def) {
  if (!holder(wl, a, def)) { if (a.home && a.trip == null && !a.leaving && !a.visit) a.home = null; return null; }
  const w = wl.game.world, map = wl.suit[a.sp];
  let h = a.home;
  const ok = j => Number.isInteger(j) && j >= 0 && j < w.n && !w.fire[j] && passable(w, j, a) && map[j] > 0.1;
  // An established feed-and-rest range (deer, elk, large grazers) or a defended territory is its home.
  const r = homeRadius(def);
  let center = -1, radius = r;
  if (a.range && ok(a.range.rest)) { center = a.range.rest; radius = Math.max(r, dist(w, a.range.feed, a.range.rest) + 3); }
  else if (hasTerritory(wl, a, def)) center = a.territory.home;
  if (center >= 0) {
    if (!h || h.center !== center) { h = a.home = { center, r: radius, water: null, waterRoute: null, back: false }; }
    else h.r = radius;
    return h;
  }
  if (h && ok(h.center)) return h;
  if (a.age < (a.homeAfter || 0)) return (a.home = null);
  a.homeAfter = a.age + 5;
  const j = settle(wl, a, def, r);
  a.home = j < 0 ? null : { center: j, r, water: null, waterRoute: null, back: false };
  return a.home;
}

// Choose a home center within a bounded search: good habitat around it, little overlap with
// the homes its own kind already hold, and not far from where it is now.
let seen = null, queue = null, stampN = 0;
function settle(wl, a, def, r) {
  const w = wl.game.world, map = wl.suit[a.sp], W = w.w;
  const x0 = Math.floor(a.x), y0 = Math.floor(a.y);
  if (!w.inb(x0, y0)) return -1;
  if (!seen || seen.length < w.n) { seen = new Int32Array(w.n); queue = new Int32Array(w.n); }
  const box = Math.ceil(r * 3 + 6), homes = [];
  for (const o of wl.agents) {
    if (o === a || o.sp !== a.sp || o.leaving || !o.home) continue;
    const [cx, cy] = at(w, o.home.center);
    if (Math.abs(cx - x0) < box + 2 * r && Math.abs(cy - y0) < box + 2 * r) homes.push(cx, cy, o.home.r);
  }
  const core = (x, y) => { // habitat across the core of a home, not just its central tile
    let s = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = Math.round(x + dx * r * 0.5), yy = Math.round(y + dy * r * 0.5);
      if (w.inb(xx, yy)) s += map[w.idx(xx, yy)];
    }
    return s / 5;
  };
  const start = w.idx(x0, y0); stampN++;
  let head = 0, tail = 0, best = -1, bs = 0;
  queue[tail++] = start; seen[start] = stampN;
  while (head < tail && tail < 2500) {
    const i = queue[head++], x = i % W, y = (i / W) | 0;
    if (map[i] > 0.25) {
      let overlap = 0;
      for (let k = 0; k < homes.length; k += 3) {
        const d = Math.hypot(homes[k] - x - 0.5, homes[k + 1] - y - 0.5), reach = r + homes[k + 2];
        if (d < reach) overlap += 1 - d / reach;
      }
      const d = Math.hypot(x - x0, y - y0);
      const sc = core(x, y) / (1 + 2 * overlap) / (1 + 0.04 * d) * (0.85 + 0.3 * hash2(i, a.id, 1301));
      if (sc > bs) { bs = sc; best = i; }
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (!w.inb(xx, yy) || Math.abs(xx - x0) > box || Math.abs(yy - y0) > box) continue;
      const j = w.idx(xx, yy);
      if (seen[j] === stampN || w.fire[j] || !passable(w, j, a)) continue;
      seen[j] = stampN; queue[tail++] = j;
    }
  }
  return best;
}

// The home's drinking place: the nearest bank reachable from the home's center within the
// species' reach, or -1 when there is none (rechecked now and then: the player may dig a pond).
const bankOk = (wl, a, j) => j >= 0 && wl.game.world.distWater[j] <= 1 && passable(wl.game.world, j, a) && !!wl.bankSpot(a, j);
export function homeWater(wl, a, def) {
  const h = a.home, w = wl.game.world;
  if (!h) return -1;
  if (h.water != null && h.water >= 0 && !(w.distWater[h.water] <= 1 && passable(w, h.water, a))) h.water = null;
  if (h.water === -1 && a.age >= (h.waterCheck || 0)) h.water = null;
  if (h.water != null) return h.water;
  h.waterRoute = null;
  const reach = waterReach(def), W = w.w, c = h.center, cx = c % W, cy = (c / W) | 0;
  if (!seen || seen.length < w.n) { seen = new Int32Array(w.n); queue = new Int32Array(w.n); }
  stampN++;
  let head = 0, tail = 0, found = -1;
  queue[tail++] = c; seen[c] = stampN;
  while (head < tail) {
    const i = queue[head++], x = i % W, y = (i / W) | 0;
    if (bankOk(wl, a, i)) { found = i; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (!w.inb(xx, yy) || Math.hypot(xx - cx, yy - cy) > reach) continue;
      const j = w.idx(xx, yy);
      if (seen[j] === stampN || w.fire[j] || !passable(w, j, a)) continue;
      seen[j] = stampN; queue[tail++] = j;
    }
  }
  h.water = found;
  if (found < 0) h.waterCheck = a.age + 20;
  return found;
}

// How long between drinks: a water trip (there and back, plus the drink) may take only the
// species' share of the animal's time. Far water means rarer, not endless, trips.
export function drinkEvery(wl, a, def) {
  const base = def.drinkEvery ?? 5 + (a.id % 5), h = a.home, w = wl.game.world;
  const drink = def.familyHerd ? 1.2 : 3.5, share = def.behavior.water?.share ?? 0.08;
  if (def.move === 'fly') return Math.max(base, drink / share); // (a flight to water is quick; the drink is what takes time)
  if (!h || homeWater(wl, a, def) < 0) return base;
  const travel = dist(w, h.center, h.water) / Math.max(0.2, travelSpeed(def));
  return Math.max(base, (2 * travel + drink) / share);
}

// Walk to the home's drinking place along its remembered route. Returns true if walking (or
// waiting a turn at a busy bank), false if there is no water within reach.
export function walkToWater(wl, a, def) {
  const water = homeWater(wl, a, def), h = a.home, w = wl.game.world;
  if (water < 0) return false;
  const [wx, wy] = at(w, water), visit = j => !w.fire[j];
  if (Math.hypot(a.x - wx, a.y - wy) < 3) {
    // At its drinking place but the spot is taken: a free spot along the same stretch, or wait a turn.
    if (wl.pathTo(a, j => dist(w, j, water) <= 3 && w.distWater[j] <= 1 && (wl.bankSpot(a, j)?.crowd ?? Infinity) < 0.08, 120, null, visit)) { a.waterTrip = true; return true; }
    a.wait = 0.5 + Math.random(); return true;
  }
  if (followRoute(wl, a, h.waterRoute, true, Math.max(6, h.r))) { a.waterTrip = true; return true; }
  // Learn the route from the home's center, so later trips from anywhere in the home join it.
  const [cx, cy] = at(w, h.center), probe = { ...a, x: cx, y: cy, path: null };
  if (wl.pathTo(probe, j => j === water, 4000, null, visit)) {
    probe.path = preferTrailPath(wl, probe, def, probe.path, visit, passable, true);
    h.waterRoute = [h.center, ...probe.path.slice().reverse()];
    if (followRoute(wl, a, h.waterRoute, true, Math.max(6, h.r))) { a.waterTrip = true; return true; }
  }
  if (wl.pathTo(a, j => j === water, 4000, null, visit)) { a.waterTrip = true; return true; }
  h.water = -1; h.waterCheck = a.age + 20; // cut off since it was chosen
  return false;
}

// Head home: back from the water along the same route, or back from wherever a hunt, a scare
// or a chase took it. Returns true if it set off.
export function homeChoose(wl, a, def) {
  const h = a.home, w = wl.game.world;
  // (in the rut a bull's harem, not his home, decides where he and his cows go)
  if (!h || a.leaving || a.follow || a.drinkT || a.rutActive || a.haremOf != null) return false;
  const [cx, cy] = at(w, h.center), d = Math.hypot(a.x - cx, a.y - cy), back = h.back;
  h.back = false;
  if (back ? d < h.r * 0.6 : d < h.r * 1.5) return false;
  if (back && followRoute(wl, a, h.waterRoute, false, 4)) { a.trip = null; return true; }
  const goal = Math.max(1.5, h.r * 0.6);
  if (wl.pathTo(a, (j, x, y) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < goal, 4000)) { a.trip = null; return true; }
  a.home = null; a.homeAfter = a.age + 5; // cut off from home: settle somewhere it can reach
  return false;
}

// Local wandering keeps mostly within the home.
export function homeFalloff(w, a, i) {
  const h = a.home;
  if (!h || a.rutActive || a.haremOf != null) return 1;
  const d = dist(w, i, h.center);
  return d <= h.r ? 1 : 1 / (1 + (d - h.r) * 0.7);
}
