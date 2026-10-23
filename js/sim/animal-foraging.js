// Short meals at real habitat resources, with a bounded search through shared terrain policy.
// These use existing insect/nectar/vegetation indices; no new food or population economy.
import { preyFor } from '../data/animals.js';
import { isFruiting } from '../data/plants.js';
import { passable, canLand } from './animal-terrain.js';
import { watch } from './animal-life.js';

const grass = p => p && ['grass', 'tallgrass', 'sedge'].includes(p.look.type);
export function foodAt(wl, def, i) {
  const w = wl.game.world;
  if (i < 0 || i >= w.n || w.fire[i] || w.struct[i] >= 0 || !passable(w, i, def)) return null;
  const ground = wl.game.catalog.plants[w.ground[i]], shrub = wl.game.catalog.plants[w.shrub[i]], tree = wl.game.catalog.plants[w.tree[i]];
  for (const food of def.behavior.forage) {
    if (food === 'grass' && grass(ground) && w.groundG[i] > 0.25) return food;
    if (food === 'browse' && (shrub && !shrub.invasive && w.shrubG[i] > 0.3 || tree && !tree.invasive && w.treeG[i] > 0.6)) return food;
    if (food === 'leaves' && tree && !tree.invasive && w.treeG[i] > 0.65) return food;
    if (food === 'fruit' && (tree && w.treeG[i] > 0.65 && isFruiting(tree, wl.game.month) || shrub && w.shrubG[i] > 0.65 && isFruiting(shrub, wl.game.month))) return food;
    if (food === 'seeds' && (ground && !ground.invasive && w.groundG[i] > 0.6 || tree && (tree.conifer || tree.mast) && w.treeG[i] > 0.75)) return food;
    if (food === 'insects' && w.insects[i] > 0.2) return food;
    if (food === 'nectar' && w.nectar[i] > 0.12) return food;
    if (food === 'seagrass' && ['seagrass', 'spoongrass'].includes(ground?.look.type) && w.groundG[i] > 0.3) return food;
    if (food === 'sponge' && shrub?.key === 'sponge' && w.shrubG[i] > 0.35) return food;
    if (food === 'coral' && tree && !tree.cay && w.treeG[i] > 0.3) return food;
    if (food === 'starfish' && shrub?.key === 'cots' && w.shrubG[i] > 0.05) return food;
    if (food === 'algae' && ['turf', 'halimeda'].includes(ground?.key) && w.groundG[i] > 0.15) return food;
    if (food === 'sediment' && !tree && !shrub && wl.suit[def.index][i] > 0.1) return food;
    if (food === 'plankton' && wl.suit[def.index][i] > 0.15) return food;
    if (food === 'dung' && wl.agents.some(a => !a.leaving && def.needs?.includes(wl.game.catalog.animals[a.sp].key) && Math.hypot(a.x - (i % w.w + 0.5), a.y - ((i / w.w | 0) + 0.5)) < 3)) return food;
  }
  return null;
}
function beginMeal(wl, a, def, i) {
  const food = foodAt(wl, def, i);
  if (!food) return false;
  a.state = 'forage'; a.forage = { i, food, left: 1.5 + Math.random() * 2 };
  a.forageGoal = null; a.path = null; a.run = null; a.drinkT = 0; a.drinkAt = null;
  // Flying insectivores and nectar feeders stay on the wing; fruit bats settle at the tree.
  a.flying = def.move === 'fly' && ['insects', 'nectar', 'plankton'].includes(food);
  if (!a.flying) a.alt = 0;
  return true;
}
export function cleanerChoose(wl, a, def) {
  if (def.key !== 'cleaner' || a.leaving || a.age < (a.forageAfter || 0)) return false;
  const w = wl.game.world, x = Math.floor(a.x), y = Math.floor(a.y);
  if (!w.inb(x, y) || wl.suit[def.index][w.idx(x, y)] <= 0.15) return false;
  const client = wl.agents.find(b => b !== a && !b.leaving && b.state === 'idle' &&
    wl.game.catalog.animals[b.sp].reef && !wl.game.catalog.animals[b.sp].benthic && wl.game.catalog.animals[b.sp].key !== 'cleaner' &&
    Math.hypot(a.x - b.x, a.y - b.y) < 2);
  if (!client || Math.random() > 0.5) return false;
  const left = 2 + Math.random();
  for (const [b, partner, food] of [[a, client, 'cleaning'], [client, a, 'cleaned']]) {
    b.state = 'forage'; b.forage = { i: w.idx(x, y), food, partner: partner.id, left };
    b.path = null; b.forageGoal = null; b.run = null; b.wait = left;
  }
  return true;
}
export function forageChoose(wl, a, def) {
  if (cleanerChoose(wl, a, def)) return true;
  if (!def.behavior.forage.length || a.leaving || a.fromFire || a.drinkT || a.socialWith != null || a.age < (a.forageAfter || 0)) return false;
  // Carnivores must catch real prey; a modeled fish diet is never satisfied by an insect index.
  if (preyFor(def, wl.game)) return false;
  // Fruit primates already have meals, grip poses and harvest effects of their own.
  if (['monkey', 'orangutan'].includes(def.sprite.kind) && !def.behavior.forage.includes('leaves')) return false;
  a.forageAfter = a.age + 4 + Math.random() * 4;
  if (Math.random() > 0.65) return false;
  const w = wl.game.world, x = Math.floor(a.x), y = Math.floor(a.y);
  if (!w.inb(x, y)) return false;
  const i = w.idx(x, y);
  if (beginMeal(wl, a, def, i)) return true;
  // Stay close to the herd/canopy patch. Never search the whole property for a bite.
  // (A humphead wrasse cruises its stretch of reef looking for starfish, so it looks further.)
  const reach = def.behavior.forage.includes('starfish') ? 8 : 3;
  const good = j => !!foodAt(wl, def, j) && (def.move !== 'fly' || canLand(w, j, def));
  if (def.move === 'fly') {
    let target = -1, distance = Infinity;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (!w.inb(x + dx, y + dy)) continue;
      const j = w.idx(x + dx, y + dy), d = dx * dx + dy * dy;
      if (d < distance && good(j)) { target = j; distance = d; }
    }
    if (target < 0) return false;
    a.forageGoal = target; a.tx = target % w.w + 0.5; a.ty = (target / w.w | 0) + 0.5;
    a.state = 'fly'; a.flying = true; a.trip = null; return true;
  }
  if (!wl.pathTo(a, good, reach > 3 ? 300 : 48, null, j => Math.abs(j % w.w - x) <= reach && Math.abs((j / w.w | 0) - y) <= reach && !w.fire[j])) return false;
  a.forageGoal = a.path[0]; a.trip = null; return true;
}
export function forageArrive(wl, a) {
  const goal = a.forageGoal; a.forageGoal = null;
  if (goal == null || a.state !== 'idle' || a.leaving || a.fromFire) return;
  const w = wl.game.world, i = w.idx(Math.floor(a.x), Math.floor(a.y));
  if (i === goal) beginMeal(wl, a, wl.game.catalog.animals[a.sp], i);
}
export function forageUpdate(wl, a, def, dt) {
  const meal = a.forage;
  const partner = meal?.partner == null ? null : wl.ids.get(meal.partner);
  const cleaning = meal?.partner != null;
  const cleaningValid = partner && !partner.leaving && partner.state === 'forage' && partner.forage?.partner === a.id &&
    Math.hypot(a.x - partner.x, a.y - partner.y) < 2.5 &&
    foodAtStation(wl, a, partner, meal.i);
  const moved = meal && wl.game.world.idx(Math.floor(a.x), Math.floor(a.y)) !== meal.i;
  if (!meal || a.leaving || (cleaning ? !cleaningValid : moved || preyFor(def, wl.game) || foodAt(wl, def, meal.i) !== meal.food) || watch(wl, a, def)) {
    a.forage = null;
    if (a.state === 'forage') { a.state = 'idle'; a.wait = 0.5; }
    return;
  }
  meal.left -= dt;
  if (meal.left > 0) return;
  const w = wl.game.world;
  if (meal.food === 'seagrass') w.groundG[meal.i] = Math.max(0.25, w.groundG[meal.i] - (def.key === 'dugong' ? 0.018 : 0.01));
  if (meal.food === 'sponge') w.shrubG[meal.i] = Math.max(0.3, w.shrubG[meal.i] - 0.004);
  // A crown-of-thorns starfish is eaten outright: a small one in one meal, a big one in two.
  if (meal.food === 'starfish' && (w.shrubG[meal.i] -= 0.5) < 0.05) { w.shrub[meal.i] = 0; w.shrubG[meal.i] = 0; }
  // Insect/nectar stocks are derived habitat indices, not consumable population agents.
  // Cleaning is food for the wrasse, but it cannot satisfy a predator client's hunger.
  if (meal.food !== 'cleaned') a.hunger = 0;
  a.forage = null; a.state = 'idle'; a.wait = 1 + Math.random();
  // (while there are starfish about, the wrasse finishes one and goes on to the next)
  a.forageAfter = a.age + (meal.food === 'starfish' ? 0.5 + Math.random() : 6 + Math.random() * 6);
}
function foodAtStation(wl, a, partner, i) {
  const cleaner = wl.game.catalog.animals[a.sp].key === 'cleaner' ? a : partner;
  return wl.game.catalog.animals[cleaner.sp].key === 'cleaner' && wl.suit[cleaner.sp][i] > 0.15 &&
    wl.game.world.tree[i] && wl.game.world.treeG[i] > 0.3 && !wl.game.world.fire[i];
}
