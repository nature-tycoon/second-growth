// Winter shelter, reduced activity and emergence. Movement stays in the simulation.
import { huntHunger } from '../data/animal-activity.js';
import { T, F, isWater } from '../config.js';
import { preyFor } from '../data/animals.js';
import { dormancySeason } from '../data/animal-dormancy.js';
import { passable } from './animal-terrain.js';
const tileDistance = (w, a, j) => Math.hypot(a.x - (j % w.w + 0.5), a.y - ((j / w.w | 0) + 0.5));
function burningNear(w, j) {
  const x = j % w.w, y = j / w.w | 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
    if (w.inb(x + dx, y + dy) && w.fire[w.idx(x + dx, y + dy)]) return true;
  return false;
}
export function winterShelter(wl, a, def, j) {
  const w = wl.game.world, p = def.behavior?.dormancy;
  if (!p || !Number.isInteger(j) || j < 0 || j >= w.n || w.fire[j] || !passable(w, j, a)) return false;
  // Bears den alone or with dependent young; chipmunks use individual burrows.
  // Bats and garter snakes may share winter sites. Pending routes reserve a site.
  if (p.solitary && wl.agents.some(b => b !== a && b.key === def.key && !b.leaving && b.dormancy?.site === j &&
    !(a.mom != null && (a.mom === b.id || a.mom === b.mom) || b.mom === a.id))) return false;
  const feature = w.feature[j], t = w.terrain[j];
  const oldTree = w.tree[j] && w.treeG[j] > 0.75;
  if (p.shelter === 'roost') {
    // Existing buildings, mature-tree cavities, snags and crevices stand in for
    // insulated roosts. A summer nest/bat box alone is not a winter hibernaculum.
    return !isWater(t) && !!(w.struct[j] >= 0 || feature === F.SNAG || feature === F.ROCKS || oldTree && w.treeAge[j] >= 600);
  }
  if (w.struct[j] >= 0 || feature === F.FENCE || t === T.ROAD || t === T.GRAVEL) return false;
  if (p.shelter === 'pond' && t === T.POND) return w.distLog[j] <= 1 || w.nbCanopy[j] > 0.2;
  if (isWater(t)) return false;
  const covered = feature === F.LOG || feature === F.ROCKS || feature === F.BRUSH || oldTree || w.shrub[j] && w.shrubG[j] > 0.5;
  return !!covered && (p.shelter !== 'pond' || w.distWater[j] <= 4);
}
export function shelteredDormant(wl, a, def = wl.game.catalog.animals[a.sp]) {
  return a.state === 'dormant' && dormancySeason(wl.game, def) && winterShelter(wl, a, def, a.dormancy?.site) &&
    tileDistance(wl.game.world, a, a.dormancy.site) < 1.2 && !burningNear(wl.game.world, a.dormancy.site);
}
export function wakeDormant(a, rest = 2) {
  if (a.state === 'dormant') { a.state = a.leaving ? 'leave' : 'idle'; a.wait = 0; }
  a.dormancy = null;
  a.dormancyAfter = Math.max(a.dormancyAfter || 0, a.age + rest);
}
function clearActivities(a) {
  a.path = null; a.trip = null; a.run = null; a.follow = false; a.flying = false; a.alt = 0;
  a.drinkT = 0; a.drinkAt = null; a.localGoal = null; a.bankGoal = null;
  a.bird = null; a.birdGoal = null; a.birdGround = false; a.forage = null; a.forageGoal = null;
  a.fruitMeal = null; a.fruitGoal = null; a.greet = null; a.goal = null; a.target = null;
  a.hunt = null; a.assist = false; a.feedAt = null; a.carcass = null; a.restSpot = null;
  a.threat = null; a.moveProgress = null;
}
function danger(wl, a, def) {
  for (const b of wl.agents) {
    if (b === a || b.leaving || b.state === 'dormant' || b.state === 'feed') continue;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 6 && preyFor(wl.game.catalog.animals[b.sp], wl.game)?.includes(def.key)) return true;
  }
  return false;
}
function route(wl, a, def, site) {
  const w = wl.game.world;
  if (a.move === 'fly') {
    a.tx = site % w.w + 0.5; a.ty = (site / w.w | 0) + 0.5;
    a.state = 'fly'; a.flying = true; a.path = null; return true;
  }
  return wl.pathTo(a, j => j === site, 900, null, j => !w.fire[j]);
}
function enter(wl, a, def, site) {
  clearActivities(a);
  const p = def.behavior.dormancy;
  a.dormancy = { site, kind: p.kind, arouse: a.age + p.interval + (a.id % 3) * 0.5 };
  a.state = 'dormant'; a.wait = 0;
}
export function updateDormancy(wl, a, def) {
  const w = wl.game.world, p = def.behavior?.dormancy;
  if (!p || !dormancySeason(wl.game, def) || a.leaving) {
    if (a.dormancy || a.state === 'dormant') wakeDormant(a);
    return false;
  }
  if (a.state === 'dormant') {
    const mother = a.mom != null ? wl.ids.get(a.mom) : null;
    if (!shelteredDormant(wl, a, def) || mother && mother.state !== 'dormant' && !mother.dormancy) { wakeDormant(a); return false; }
    // Brief surface activity on a clear, snow-free interval. The game has no
    // temperature simulation: this is a seasonal approximation, not thermometry.
    if (a.age >= a.dormancy.arouse && wl.game.weather === 'clear' && !(wl.game.snow > 0.15)) {
      wakeDormant(a, p.kind === 'torpor' ? 1 : 0.6); return false;
    }
    return true;
  }
  if (a.fromFire || a.state === 'flee' || a.state === 'hunt' || a.state === 'feed' || a.state === 'play' || a.state === 'spar') {
    if (a.dormancy) wakeDormant(a);
    return false;
  }
  if (a.dormancy) {
    const site = a.dormancy.site;
    if (!winterShelter(wl, a, def, site) || burningNear(w, site)) { wakeDormant(a, 3); return false; }
    if (a.state === 'idle') {
      if (danger(wl, a, def)) { wakeDormant(a); return false; }
      if (tileDistance(w, a, site) < 0.9) { enter(wl, a, def, site); return true; }
      if (!route(wl, a, def, site)) wakeDormant(a, 5);
    }
    return false;
  }
  if (a.age < (a.dormancyAfter || 0) || a.state !== 'idle' || a.drinkT > 0 || a.socialWith != null ||
    a.greet != null || a.alertT > 0 || preyFor(def, wl.game) && a.hunger >= huntHunger(def)) return false;
  a.dormancyAfter = a.age + 5;
  const x0 = Math.floor(a.x), y0 = Math.floor(a.y);
  if (!w.inb(x0, y0) || danger(wl, a, def)) return false;
  let site = -1;
  const mother = a.mom != null ? wl.ids.get(a.mom) : null;
  if (mother) {
    if (!mother.dormancy || !winterShelter(wl, a, def, mother.dormancy.site)) return false;
    site = mother.dormancy.site;
  } else {
    const here = w.idx(x0, y0);
    if (winterShelter(wl, a, def, here) && !burningNear(w, here)) site = here;
    else if (a.move === 'fly') {
      let nearest = Infinity;
      for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) {
        if (!w.inb(x0 + dx, y0 + dy) || dx * dx + dy * dy >= nearest) continue;
        const j = w.idx(x0 + dx, y0 + dy);
        if (winterShelter(wl, a, def, j) && !burningNear(w, j)) { site = j; nearest = dx * dx + dy * dy; }
      }
    } else if (wl.pathTo(a, j => winterShelter(wl, a, def, j) && !burningNear(w, j), 600, null, j => !w.fire[j])) site = a.path[0];
  }
  if (site < 0) return false;
  const path = a.path, state = a.state;
  clearActivities(a); a.path = path; a.state = state;
  if (tileDistance(w, a, site) < 0.9) { enter(wl, a, def, site); return true; }
  if (mother || a.move === 'fly') { if (!route(wl, a, def, site)) return false; }
  a.trip = null; a.restSpot = null; a.dormancy = { site, kind: p.kind };
  return false;
}
