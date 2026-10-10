// Visible fruit meals use the same mature, seasonal fruit that already supports
// wildlife and reduces the harvest. They don't create a second fruit economy.
import { PLANTS, isFruiting } from '../data/plants.js';
import { watch } from './animal-life.js';

export const isPrimate = def => ['monkey', 'orangutan'].includes(def?.sprite.kind);
export function fruitAt(game, i, plant = null) {
  const w = game.world, p = PLANTS[w.tree[i]];
  return !!(p && (!plant || p.id === plant) && w.treeG[i] > .65 && !w.fire[i] && isFruiting(p, game.month));
}
function meal(wl, a, i) {
  a.state = 'primate'; a.path = null; a.restSpot = null; a.fruitGoal = null;
  a.fruitMeal = { i, plant: wl.game.world.tree[i], elapsed: 0, duration: 3 + wl.game.rng() * 2 };
  a.run = null; a.drinkT = 0;
}
export function primateChoose(wl, a, def) {
  if (!isPrimate(def) || a.leaving || a.fromFire || a.age < (a.fruitAfter || 0)) return false;
  a.fruitGoal = null;
  // Leaf specialists still take occasional fruit; regular fruit eaters seek it more often.
  a.fruitAfter = a.age + 4 + wl.game.rng() * 5;
  if (wl.game.rng() > (def.frugivore || def.sprite.ape || def.sprite.kind === 'orangutan' ? .8 : .35)) return false;
  const w = wl.game.world, x = Math.floor(a.x), y = Math.floor(a.y);
  if (!w.inb(x, y)) return false;
  const i = w.idx(x, y);
  if (fruitAt(wl.game, i)) { meal(wl, a, i); return true; }
  // Bounded, reachable canopy search: never send a climber across empty ground.
  if (!wl.pathTo(a, j => fruitAt(wl.game, j), 180, null,
    j => Math.abs(j % w.w - x) <= 6 && Math.abs((j / w.w | 0) - y) <= 6 && !w.fire[j])) return false;
  const dest = a.path[0]; a.fruitGoal = { i: dest, plant: w.tree[dest] }; a.trip = null;
  return true;
}
export function primateArrive(wl, a) {
  const goal = a.fruitGoal; a.fruitGoal = null;
  if (!goal || a.state !== 'idle' || !fruitAt(wl.game, goal.i, goal.plant)) return;
  const w = wl.game.world;
  if (w.idx(Math.floor(a.x), Math.floor(a.y)) === goal.i) meal(wl, a, goal.i);
}
export function primateUpdate(wl, a, def, dt) {
  const meal = a.fruitMeal;
  if (watch(wl, a, def)) {
    a.fruitMeal = null;
    if (a.state === 'primate') { a.state = 'idle'; a.wait = Math.max(.5, a.alertT || 0); }
    return;
  }
  if (!meal || !fruitAt(wl.game, meal.i, meal.plant) || a.leaving || !isPrimate(def)) {
    a.fruitMeal = null; a.state = 'idle'; a.wait = .5; return;
  }
  meal.elapsed += dt;
  if (meal.elapsed >= meal.duration) {
    a.fruitMeal = null; a.state = 'idle'; a.wait = 1 + wl.game.rng();
    a.fruitAfter = a.age + 6 + wl.game.rng() * 6;
  }
}
