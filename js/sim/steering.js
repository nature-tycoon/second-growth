// The last word on where a ground animal stands and which way it faces, each step (decision 0025).
// Behaviours say where to go and what to look at; walking, chases, play, bouts and flight each
// steer round neighbours and wood as they move (animal-walking.js, stepToward, fleeUpdate,
// ground-obstacles.js); then spacing shoves the crowd apart (animal-positioning.js). Each of those
// can turn or nudge an animal after another one has placed it, so this pass runs once after all of
// them and settles what must hold whatever they did:
//   - what it acts on, it faces: a drinker the water it is drinking, rivals in a bout each other;
//   - its body (rump to chest, and a rack of antlers) is out of any trunk, even after turning on the spot;
//   - a land walker doesn't stop on water: it may wade across a creek or a marsh, not stand in one.
import { isWater } from '../config.js';
import { facePoint } from './animal-positioning.js';
import { settleBody, groundWalker } from './ground-obstacles.js';
import { underWater } from './waterline.js';

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
  for (let k = 0; k < 48; k++) { // (every 7.5°)
    const ang = k * Math.PI / 24, c = Math.cos(ang), s = Math.sin(ang);
    const off = prefer == null ? 0 : Math.abs(wrap(ang - prefer)), bias = off * 0.2;
    if (bias >= score) continue;
    for (let d = 0.04; d < reach && d + bias < score; d += 0.04) {
      const px = x + c * d, py = y + s * d;
      if (!w.inb(Math.floor(px), Math.floor(py))) break;
      if (underWater(w, px, py)) { score = d + bias; best = [px, py, c, s]; break; }
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
const wrap = d => d - Math.round(d / (Math.PI * 2)) * Math.PI * 2;

// A drinker's head goes to the water nearest where it actually stands, square on to the bank it
// chose where that is about as near (`toward`: the bank's water, a point straight out from the bank).
export function aimDrink(w, a, toward) {
  const prefer = toward ? Math.atan2(toward[1] - a.y, toward[0] - a.x) : a.orientation ?? null;
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
