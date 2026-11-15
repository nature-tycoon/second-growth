// Visible fruit meals use the same mature, seasonal fruit that already supports
// wildlife and reduces the harvest. They don't create a second fruit economy.
import { isFruiting } from '../data/plants.js';
import { watch } from './animal-life.js';
import { trait } from '../data/animal-kinds.js';

export const isPrimate = def => ['monkey', 'orangutan'].includes(def?.sprite.kind);
export function fruitAt(game, i, plant = null) {
  const w = game.world, p = game.catalog.plants[w.tree[i]];
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
  // Let a climb end in a settled pause instead of immediately picking a new
  // direction. Threats still interrupt idle animals through the usual watch.
  if (a.state === 'idle' && isPrimate(wl.game.catalog.animals[a.sp]) && !a.leaving && !a.fromFire && !a.drinkT)
    a.wait = Math.max(a.wait || 0, 3 + wl.game.rng() * 4);
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
    a.hunger = 0; a.fruitMeal = null; a.state = 'idle'; a.wait = 1 + wl.game.rng();
    a.fruitAfter = a.age + 6 + wl.game.rng() * 6;
  }
}

// The rest budget (decision 0049). A primate rests its species' share of the day (`restShare`,
// from field studies), most of it through the midday heat, and sleeps at night. The simulation has
// no clock of its own, so the time of day is the drawn sun's (game.todU, set by the renderer; 0 is
// dawn, about 0.42 noon, 0.86 sunset); headless, with no sun, the share is flat. A balance of rest
// owed (target share of the time since the last decision, less the time it sat idle: a pause after
// a climb is rest too) decides, so the share holds however long the walks and meals in between run. It is asked only between walks,
// after meals had their chance, so a monkey never stops mid-route and still eats as often as it
// finds food; a climber rests up in a crown, never on the ground under it.
const NOON = 0.42, DAYLIGHT = 0.86, DAWN_END = 0.975, MIDDAY = 0.6, OWED_MAX = 30;
export const asleep = wl => wl.game.todU > DAYLIGHT && wl.game.todU < DAWN_END;
export function restTarget(share, u) {
  if (u == null) return share;
  if (u > DAYLIGHT && u < DAWN_END) return 1; // asleep
  // (a cosine over the daylight hours: mean `share`, highest at noon, lowest at dawn and dusk)
  return Math.min(0.95, share * (1 + MIDDAY * Math.cos(2 * Math.PI * (u - NOON) / DAYLIGHT)));
}
export function primateRest(wl, a, def) {
  const share = isPrimate(def) && trait(def, 'restShare');
  if (!share || a.leaving || a.fromFire || a.drinkT) return false;
  const now = a.age, target = restTarget(share, wl.game.todU), el = now - (a.restAt ?? now);
  // (one just arrived starts part way through its day: some of a troop owe a rest already)
  if (a.restAt == null) a.restBal = (wl.game.rng() - 0.5) * 10 * share;
  a.restBal = Math.max(-OWED_MAX, Math.min(OWED_MAX, a.restBal + target * el - (a.stillT || 0)));
  a.restAt = now; a.stillT = 0; a.restUntil = 0;
  if (target < 1 && a.restBal <= 0) return false;
  const w = wl.game.world, x = Math.floor(a.x), y = Math.floor(a.y);
  if (!w.inb(x, y) || w.fire[w.idx(x, y)] || def.move === 'tree' && (a.move === 'ground' || !w.tree[w.idx(x, y)])) return false;
  // a bout of a few days (about 6 to 13 seconds at normal speed), long enough to read as a rest
  const bout = 4 + wl.game.rng() * 5;
  a.state = 'idle'; a.path = null; a.wait = bout; a.restUntil = now + bout;
  return true;
}
