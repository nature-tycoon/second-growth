// Climbers (move 'tree': squirrels, monkeys, sloths) share out the trees, and some come down to
// the ground (decision 0030). The species data is behavior.climb (js/data/animal-behavior.js):
// cap: at most this many of a kind in one tree; ground: the chance, at a decision, that one goes
//   down to forage and bury nuts on the ground under the trees (gray squirrels).
// While down, the animal moves as a ground animal (a.move 'ground'), and is drawn on the ground;
// it goes back up the nearest tree with room, at once if a predator is about.
import { F, isWater } from '../config.js';
import { passable } from './animal-terrain.js';
import { facePoint } from './animal-positioning.js';
import { isPrimate } from './primate-behavior.js';
import { simRandom } from './sim-random.js';

const tileOf = (w, a) => { const x = Math.floor(a.x), y = Math.floor(a.y); return w.inb(x, y) ? w.idx(x, y) : -1; };
export const climbing = (def, a) => def.move === 'tree' && a.move === 'tree';
export const downBelow = (def, a) => def.move === 'tree' && a.move === 'ground';
// How many of its kind are up in tree tile i (besides `but`).
function inTree(wl, sp, i, but) {
  const w = wl.game.world;
  let n = 0;
  for (const o of wl.agents) if (o !== but && o.sp === sp && o.move === 'tree' && !o.leaving && o.state !== 'dormant' && tileOf(w, o) === i) n++;
  return n;
}
const treeTile = (w, i) => !!(w.tree[i] && w.treeG[i] > 0.45) || w.feature[i] === F.SNAG;
// The trees a climber may not end a walk in: those already holding `cap` of its kind (up in
// them, besides itself). Null for everything else.
export function fullTrees(wl, a) {
  const def = wl.game.catalog.animals[a.sp], c = def.behavior?.climb;
  if (!c || a.move !== 'tree') return null;
  const w = wl.game.world, count = new Map();
  for (const o of wl.agents) {
    if (o === a || o.sp !== a.sp || o.move !== 'tree' || o.leaving || o.state === 'dormant' || o.mom === a.id || a.mom === o.id) continue;
    const i = tileOf(w, o);
    if (i >= 0) count.set(i, (count.get(i) || 0) + 1);
  }
  const full = new Set();
  for (const [i, n] of count) if (n >= c.cap) full.add(i);
  return full;
}
// A predator near enough that a squirrel on the ground makes for a tree: one that hunts it here,
// or any cat, dog, fox, hawk, owl or snake (as small birds take alarm: bird-behavior.js).
const HUNTERS = new Set(['feline', 'canine', 'raptor', 'owl', 'snake']);
function danger(wl, a, r = 6) {
  const g = wl.game;
  for (const o of wl.agents) {
    if (o === a || o.leaving || Math.abs(o.x - a.x) > r || Math.abs(o.y - a.y) > r) continue;
    const pd = g.catalog.animals[o.sp];
    if (((pd.prey || pd.challengePrey)?.includes(g.catalog.animals[a.sp].key) || HUNTERS.has(pd.sprite.kind)) && Math.hypot(o.x - a.x, o.y - a.y) < r) return true;
  }
  return false;
}
// Up the nearest tree with room for one more of its kind.
function climbUp(wl, a, def, cap) {
  const w = wl.game.world, x0 = a.x, y0 = a.y, near = (x, y) => Math.hypot(x + 0.5 - x0, y + 0.5 - y0);
  a.move = 'ground'; // (it runs over the ground to the trunk)
  if (wl.pathTo(a, (j, x, y) => treeTile(w, j) && !w.fire[j] && inTree(wl, a.sp, j, a) < cap, 900, near)) { a.climb = 'up'; a.run = danger(wl, a) ? 1.6 : null; return true; }
  return false;
}

// At a decision: a climber in a tree that holds too many of its kind moves on to one with room
// (the latest to arrive go: lower ids were there first); a ground climber goes down now and then;
// one on the ground forages a little more or goes back up.
export function climberChoose(wl, a, def) {
  const c = def.behavior?.climb;
  if (!c || a.leaving || a.state === 'dormant') return false;
  const w = wl.game.world, i = tileOf(w, a);
  if (i < 0) return false;
  a.cache = null;
  if (downBelow(def, a)) {
    if (!danger(wl, a) && simRandom() < 0.45 && groundHop(wl, a, 2)) return true;
    if (climbUp(wl, a, def, c.cap)) return true;
    // (nowhere to climb: stay on the ground and forage on)
    return groundHop(wl, a, 3);
  }
  if (!climbing(def, a)) return false;
  // Crowded: is it one of the first `cap` here? (a mother's young don't count against her)
  if (treeTile(w, i)) {
    let before = 0;
    for (const o of wl.agents) if (o !== a && o.sp === a.sp && o.move === 'tree' && !o.leaving && o.state !== 'dormant' && o.mom !== a.id && a.mom !== o.id && o.id < a.id && tileOf(w, o) === i) before++;
    if (before >= c.cap) {
      const x0 = a.x, y0 = a.y, near = (x, y) => Math.hypot(x + 0.5 - x0, y + 0.5 - y0);
      if (wl.pathTo(a, (j, x, y) => j !== i && inTree(wl, a.sp, j, a) < c.cap, 600, near)) return true;
      // no room anywhere along the branches: over the ground to the next tree with room (a flying
      // squirrel would glide; monkeys keep to their troop's canopy routes: primate-behavior.js)
      if (!isPrimate(def) && climbUp(wl, a, def, c.cap)) return true;
    }
  }
  if (c.ground && simRandom() < c.ground && !danger(wl, a) && goDown(wl, a)) return true;
  return false;
}
// Down the trunk to forage on the ground close by.
function goDown(wl, a) {
  a.move = 'ground';
  if (groundHop(wl, a, 3)) return true;
  a.move = 'tree';
  return false;
}
// A short run over the ground to the next spot to forage or bury a nut.
function groundHop(wl, a, r) {
  const w = wl.game.world, x0 = Math.floor(a.x), y0 = Math.floor(a.y);
  for (let k = 0; k < 12; k++) {
    const x = x0 + Math.round((simRandom() * 2 - 1) * r), y = y0 + Math.round((simRandom() * 2 - 1) * r);
    if (!w.inb(x, y) || x === x0 && y === y0) continue;
    const j = w.idx(x, y);
    if (isWater(w.terrain[j]) || w.fire[j] || !passable(w, j, a)) continue;
    if (wl.pathTo(a, k2 => k2 === j, 60)) { a.climb = 'forage'; return true; }
  }
  return false;
}
// At the end of a run: up in the tree, or a pause to forage or bury a nut on the ground.
export function climberArrive(wl, a) {
  if (!a.climb) return;
  const def = wl.game.catalog.animals[a.sp], w = wl.game.world, i = tileOf(w, a), kind = a.climb;
  a.climb = null;
  if (kind === 'up') {
    if (i >= 0 && treeTile(w, i)) { a.move = 'tree'; a.gapTo = null; a.wait = 0.5 + simRandom(); a.cache = null; }
    return;
  }
  if (!downBelow(def, a)) return;
  // nose down: digging up something to eat, or burying a nut for the winter (more in the fall)
  a.cache = simRandom() < ([6, 7, 8].includes(wl.game.month) ? 0.6 : 0.25) ? 'bury' : 'dig';
  a.wait = 1 + simRandom() * 1.5;
  facePoint(a, a.x + Math.cos(a.heading ?? 0), a.y + Math.sin(a.heading ?? 0));
}
