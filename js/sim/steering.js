// The last word on where a ground animal stands and which way it faces, each step (decision 0025).
// Behaviours say where to go and what to look at; walking, chases, play, bouts and flight each
// steer round neighbours and wood as they move (animal-walking.js, stepToward, fleeUpdate,
// ground-obstacles.js); then spacing shoves the crowd apart (animal-positioning.js). Each of those
// can turn or nudge an animal after another one has placed it, so this pass runs once after all of
// them and settles what must hold whatever they did:
//   - what it acts on, it faces: a drinker the water it is drinking, rivals in a bout each other;
//   - its body (rump to chest, and a rack of antlers) is out of any trunk, even after turning on the spot;
//   - a land walker doesn't stop on water: it may wade across a creek or a marsh, not stand in one;
//   - an idle grazer with its back to the water keeps its head up (`a.headUp`), since head down
//     there it looks as if it is drinking backwards.
import { isWater, clamp } from '../config.js';
import { facePoint, animalRadius } from './animal-positioning.js';
import { settleBody, groundWalker } from './ground-obstacles.js';
import { wetTest, swimDepth, deepWaterNear, fishDepth, upstreamAt } from './waterline.js';
import { reefMoveSafe } from './animal-terrain.js';
import { trait } from '../data/animal-kinds.js';

// How fast an animal swings its body round as it goes about its day, in radians a game day: the
// rate a walk (animal-walking.js), a reef swim (swimToward) and a hover (hoverStep) turn at. A
// species can set its own (`turn` in its data); otherwise bigger bodies turn wider. Purposeful
// turns keep their own pace on top: flight (FLEE_TURN), a chase (the hunt style's `turn`), and
// the reef's turning circle as it steps (stepToward). `a.heading` is the one way it faces.
export function turnRate(def) {
  if (def.turn != null) return def.turn;
  const s = def.sprite;
  if (def.reef || def.move === 'swim') return (s.size || 0) > 25 ? 2.2 : 3.4;
  return clamp(5 - (s.len || s.size || 20) * 0.045, 2.4, 4.5);
}

// The one way a reef animal moves, as resolveStep is a walker's: `dist` tiles along its heading,
// unless that would take it out of the water it can swim in (up the beach, or across a dry
// corner); then it stays put. Swimming (swimToward), coasting (glide), hovering (hoverStep) and a
// chase or a departure (stepToward) all go through it. Returns whether it moved.
export function reefStep(w, a, dist) {
  const nx = a.x + Math.cos(a.heading) * dist, ny = a.y + Math.sin(a.heading) * dist;
  if (!reefMoveSafe(w, a, nx, ny)) return false;
  a.x = nx; a.y = ny;
  return true;
}

// Walks on land, wades at most: the animals that must not stop on a water tile (not swimmers,
// semi-aquatic animals, fliers, the reef, nor a migrant swimming the river at the crossing).
export const landWalker = (def, a) => a.move === 'ground' && !def.reef && !a.leaving;

// Where to put its head to drink from (x, y), within `reach`, as [x, y], or null: the drawn water,
// not the tile grid (a carved creek's water reaches part-way up its bank tiles, and at a bend the
// nearest water can lie off to one side of the bank tile's edge). Of each direction's nearest water
// it takes the closest, preferring `prefer` (an angle: square on to the bank) unless water to one
// side is clearly nearer, since a drawn waterline runs a little crooked across a bank tile.
// (The point returned is on along that line into the water tile itself, where there is one within
// a tile: the same way to face, and a drinker's water is a water tile, as everything else expects.)
export function nearestWater(w, x, y, reach = 2, prefer = null) {
  let best = null, score = Infinity;
  const underWater = wetTest(w);
  for (let k = 0; k < 48; k++) { // (every 7.5°)
    const ang = k * Math.PI / 24, c = Math.cos(ang), s = Math.sin(ang);
    const off = prefer == null ? 0 : Math.abs(wrap(ang - prefer)), bias = off * 0.2;
    if (bias >= score) continue;
    for (let d = 0.04; d < reach && d + bias < score; d += 0.04) {
      const px = x + c * d, py = y + s * d;
      if (!w.inb(Math.floor(px), Math.floor(py))) break;
      if (underWater(px, py)) { score = d + bias; best = [px, py, c, s]; break; }
    }
  }
  if (!best) return null;
  const [px, py, c, s] = best;
  for (let d = 0; d <= 1; d += 0.05) {
    const qx = px + c * d, qy = py + s * d;
    if (w.inb(Math.floor(qx), Math.floor(qy)) && isWater(w.terrain[w.idx(Math.floor(qx), Math.floor(qy))])) return [qx + c * 0.05, qy + s * 0.05];
  }
  return [px, py];
}
// Is there drawn water behind it (within about 30° of straight back), nearer than its body length?
// Only looked at again once it has moved or turned noticeably: a neighbour's nudges don't count.
function backToWater(w, wl, a) {
  const h = a.heading ?? 0;
  const key = Math.round(a.x * 20) * 7919 + Math.round(a.y * 20) * 104729 + Math.round(h * 10);
  if (a.headUpKey === key) return;
  a.headUpKey = key; a.headUp = false;
  const L = animalRadius(a, wl.game.catalog) / 0.65 + 0.1, step = Math.min(0.1, L / 6); // (finer for a small body)
  const underWater = wetTest(w);
  for (let k = -2; k <= 2; k++) {
    const ang = h + Math.PI + k * 0.26, c = Math.cos(ang), s = Math.sin(ang);
    // (from half a step back: water lapping at its heels, under its rump, was missed)
    for (let d = step / 2; d <= L; d += step) if (underWater(a.x + c * d, a.y + s * d)) { a.headUp = true; return; }
  }
}
const wrap = d => d - Math.round(d / (Math.PI * 2)) * Math.PI * 2;

// A drinker's head goes to the water nearest where it actually stands, square on to the bank it
// chose where that is about as near (`toward`: the bank's water, a point straight out from the bank).
export function aimDrink(w, a, toward) {
  const prefer = toward ? Math.atan2(toward[1] - a.y, toward[0] - a.x) : a.heading ?? null;
  const at = nearestWater(w, a.x, a.y, 1.5, prefer) || toward;
  a.drinkAt = at; a.drinkFrom = [a.x, a.y];
  if (at) facePoint(a, at[0], at[1]);
}

export function settle(wl) {
  const w = wl.game.world, catalog = wl.game.catalog;
  for (const a of wl.agents) {
    if (a.state === 'dormant') continue;
    const def = catalog.animals[a.sp];
    // (shoved along the bank by the others drinking: the water nearest it now)
    if (a.drinkT > 0 && a.drinkAt) {
      if (a.drinkFrom && Math.hypot(a.x - a.drinkFrom[0], a.y - a.drinkFrom[1]) > 0.1 && !a.flying) aimDrink(w, a, a.drinkAt);
      else facePoint(a, ...a.drinkAt);
    }
    if (a.state === 'idle' && !(a.drinkT > 0) && def.move === 'ground' && trait(def, 'idleEat') === 'graze') backToWater(w, wl, a);
    else if (a.headUpKey != null) { a.headUp = false; a.headUpKey = null; } // (looked at afresh next time it stands idle)
    // (a river fish nudged into the shallows, by its neighbours or the water drawing down: back to
    // where it can swim, the same depth its drawing uses)
    if (a.move === 'swim' && !def.reef && !a.leaving && swimDepth(w, a.x, a.y) < fishDepth(def)) {
      const p = deepWaterNear(w, a.x, a.y, 1.2, fishDepth(def));
      if (p) { a.x = p[0]; a.y = p[1]; }
      continue;
    }
    // (a river fish at rest in a creek holds station nose into the current, as trout do: upstreamAt)
    if (a.move === 'swim' && !def.reef && a.state === 'idle') {
      const up = upstreamAt(w, a.x, a.y);
      if (up) facePoint(a, a.x + up[0], a.y + up[1]);
      continue;
    }
    if (!groundWalker(def, a)) continue;
    const still = a.state === 'idle' || a.state === 'feed' || a.state === 'forage';
    // (a squeeze through a cramped stand lasts while it walks: stopped half inside a trunk, it was
    // left there, so a deer could stand in a tree for good)
    if (still) { a.squeeze = 0; settleBody(wl, a, def); }
    if (still && landWalker(def, a)) {
      const x = Math.floor(a.x), y = Math.floor(a.y);
      // (stopped on a water tile: walk off to the nearest dry ground, before anything else)
      if (w.inb(x, y) && isWater(w.terrain[w.idx(x, y)]) && !(def.crossing && wl.crossingAt)) wl.pathTo(a, j => !isWater(w.terrain[j]), 80);
    }
  }
}
