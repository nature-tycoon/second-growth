// Trips to water (part of the Wildlife class, sim/animals.js): who drinks, a spot on the bank,
// waterholes, wading and fishing in the shallows, crocodiles lurking.

import { T, isWater } from '../config.js';
import { preyFor } from '../data/animals.js';
import { facePoint, shoreSpot } from './animal-positioning.js';
import { restless } from './animal-life.js';
import { fishStrike, fishing, fishFed } from './fishing.js';
import { aimDrink } from './steering.js';
import { walkToWater, drinkEvery, homeEligible, waterReach } from './home-range.js';
import { passable, canLand, shallowsFor } from './animal-terrain.js';
import { simRandom } from './sim-random.js';
import { inCrossing } from './wildlife-shared.js';
import { trait } from '../data/animal-kinds.js';
import { isFall } from '../maps/landform.js';

// A creek wader (fastWater) walks only in the creek and along its edge.
const creekSide = (w, j) => w.terrain[j] === T.CREEK || w.distWater[j] <= 1 && !isWater(w.terrain[j]);
// Every point of the straight line from (x0, y0) to (x1, y1) is over water or the bank beside it:
// a dipper's flight follows the creek and never cuts across land.
function overWater(w, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.4);
  for (let s = 1; s < n; s++) {
    const x = Math.floor(x0 + (x1 - x0) * s / n), y = Math.floor(y0 + (y1 - y0) * s / n);
    if (!w.inb(x, y)) return false;
    const j = w.idx(x, y);
    if (!isWater(w.terrain[j]) && w.distWater[j] > 1) return false;
  }
  return true;
}
// The nest of a creek bird in the nesting months: the nearest fall within reach of its home (it
// nests on the wet rock beside or behind the curtain), else none (a bank or a bridge anywhere along
// its reach does). Read from the land each time, nothing saved.
function creekNest(wl, a) {
  const w = wl.game.world, c = a.home?.center;
  const cx = c != null ? c % w.w : Math.floor(a.x), cy = c != null ? (c / w.w) | 0 : Math.floor(a.y);
  let best = -1, bd = 11 * 11;
  for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
    const x = cx + dx, y = cy + dy;
    if (!w.inb(x, y) || dx * dx + dy * dy >= bd) continue;
    const j = w.idx(x, y);
    if (w.terrain[j] === T.CREEK && isFall(w, j)) { bd = dx * dx + dy * dy; best = j; }
  }
  return best;
}

export class WildlifeWater {
  // -------------------------------------------------------------- herds and waterholes
  // Who walks to water to drink: on the savanna everything that isn't a fish or a beetle; on the
  // other maps the land mammals (and the cattle). Birds, reptiles and insects there drink where they are.
  drinks(def) {
    if (def.move === 'swim' || def.noDrink || def.reef || this.game.catalog.definition.look?.underwater) return false;
    // (voles, rats, chipmunks and squirrels get their water from food and dew: no treks to the creek)
    if (def.sprite.kind === 'rodent' || def.sprite.kind === 'squirrel') return false;
    if (this.game.catalog.definition.waterholes) return true;
    return (def.group === 'Mammals' || def.herd) && (def.move === 'ground' || (def.move === 'semi' && !def.patrol));
  }

  bankSpot(a, j = null) {
    const w = this.game.world;
    if (this.spacing.w !== w || this.spacingDirty) {
      this.spacing.rebuild(w, this.agents); this.spacingDirty = false;
    }
    if (j == null) {
      if (!w.inb(Math.floor(a.x), Math.floor(a.y))) return null;
      j = w.idx(Math.floor(a.x), Math.floor(a.y));
    }
    return shoreSpot(w, a, j, this.spacing, passable);
  }

  // The bank spot an animal is heading for, while its water is still there.
  heldBank(a) {
    const b = a.bankGoal, w = this.game.world;
    if (!b) return null;
    const x = Math.floor(b.water[0]), y = Math.floor(b.water[1]);
    if (!w.inb(x, y) || !isWater(w.terrain[w.idx(x, y)])) { a.bankGoal = null; return null; }
    return b;
  }

  // Every few days, animals walk (or fly) to the nearest water to drink, then stand with their
  // heads down at the edge for a while. Returns true if that's what it's doing now.
  waterhole(a, def) {
    if (def.move === 'swim' || def.noDrink) return false;
    const w = this.game.world, x0 = Math.floor(a.x), y0 = Math.floor(a.y);
    if (!w.inb(x0, y0)) return false;
    const here = w.idx(x0, y0), every = drinkEvery(this, a, def);
    // (a low bank's dry spot can lie a tile back from the water: keep heading for the one chosen)
    const held = this.heldBank(a) && Math.hypot(a.x - a.bankGoal.x, a.y - a.bankGoal.y) < 1.5 ? a.bankGoal : null;
    const bank = held || this.bankSpot(a, here);
    if (!held) a.bankGoal = null;
    if (bank && bank.crowd < 0.08 && a.thirst > every * 0.5) {
      if (Math.hypot(a.x - bank.x, a.y - bank.y) > 0.09) {
        a.localGoal = [bank.x, bank.y]; a.state = 'approach'; a.flying = false; a.bankGoal = bank; a.waterTrip = true;
        return true;
      }
      a.bankGoal = null;
      aimDrink(w, a, bank.water); // (its head to the nearest water from where it stands: steering.js)
      if (a.home) a.home.back = true; // and afterwards back home the way it came
      a.waterTrip = false; a.thirst = 0; a.drinkT = restless(this, def, a) ? 0.6 + simRandom() * 0.6 : def.familyHerd ? 0.8 + simRandom() * 0.8 : 2 + simRandom() * 3; a.wait = a.drinkT; a.flying = false; a.alt = 0; // (deer and elk drink and move on)
      return true;
    }
    if (a.thirst < every || a.juvenile && def.herd) return false;
    if (def.herd && this.herdLeader(a) !== a) return false; // the herd goes when its leader does
    if (a.move === 'fly') {
      let best = -1, bd = 1e9;
      for (let k = 0; k < 120; k++) {
        const xx = x0 + Math.round((simRandom() * 2 - 1) * 30), yy = y0 + Math.round((simRandom() * 2 - 1) * 30);
        if (!w.inb(xx, yy)) continue;
        const j = w.idx(xx, yy);
        if (w.distWater[j] !== 1 || !this.bankSpot(a, j)) continue;
        const d = Math.hypot(xx - x0, yy - y0);
        if (d < bd) { bd = d; best = j; }
      }
      if (best < 0) { a.thirst = 0; return false; }
      const spot = this.bankSpot(a, best);
      a.tx = spot.x; a.ty = spot.y; a.state = 'fly'; a.flying = true; a.waterTrip = true;
      return true;
    }
    // A resident drinks at its own home's water, if any is within reach; otherwise it gets by on
    // food and dew, and sips when its wandering passes water. Others look within the same reach.
    if (a.home && a.haremOf == null) return walkToWater(this, a, def); // (a cow in a harem drinks where her bull does)
    if (homeEligible(this, def) && !def.herd && !def.familyHerd && a.mom == null && !a.leaving) return false; // still settling
    const reach = waterReach(def);
    const goal = this.pathTo(a, j => w.distWater[j] <= 1 && (this.bankSpot(a, j)?.crowd ?? Infinity) < 0.08, Math.ceil(Math.PI * reach * reach));
    if (!goal) { a.thirst = 0; return false; } // no water it can reach: it gets by on dew and green grass
    a.waterTrip = true;
    return true;
  }

  // A heron or crane standing in the shallows: mostly it stays put, now and then stabbing at a fish,
  // or it wades a few steps to another spot. Only once in a while does it take off.
  wade(a) {
    const w = this.game.world, x0 = Math.floor(a.x), y0 = Math.floor(a.y);
    const def = this.game.catalog.animals[a.sp], fisher = fishing(def, this.game);
    if (!w.inb(x0, y0)) return false;
    // a hungry heron that fishes flies down to the shallows to fish (fishing.js)
    if (a.flying || !shallowsFor(w, w.idx(x0, y0), def)) return !!fisher && !fishFed(a) && this.toShallows(a, def);
    const hungry = !!fisher && !fishFed(a), brisk = trait(def, 'fastWater');
    if (simRandom() < (hungry ? 0.8 : 0.55)) {
      // (a hungry heron stands and strikes every day or so; a fed one stands longer, and strikes
      // only when it is hungry again: fishing.js. A dipper feeds all day, a short stand and under.)
      a.wait = hungry ? 0.8 + simRandom() * 1.2 : brisk ? 1.5 + simRandom() * 2.5 : 3 + simRandom() * 6;
      if (simRandom() < (fisher ? 0.7 : brisk ? 0.7 : 0.45) && (hungry || !fisher)) {
        a.drinkT = 1 + simRandom(); // head down: a strike at a fish or frog
        const bank = this.bankSpot(a);
        if (bank) { a.drinkAt = bank.water; facePoint(a, ...bank.water); }
        // (at the water beside it, or at its feet where it stands in the marsh or the creek)
        const at = bank ? bank.water : isWater(w.terrain[w.idx(x0, y0)]) ? [a.x + Math.cos(a.heading) * 0.35, a.y + Math.sin(a.heading) * 0.35] : null;
        if (fisher && at && fishStrike(this, a, def, at[0], at[1], fisher)) { a.drinkT = 0; a.drinkAt = null; a.wait = 0; }
      }
      return true;
    }
    const ok = this.pathTo(a, (j, x, y) => shallowsFor(w, j, def) && Math.hypot(x - x0, y - y0) >= 1.5 && simRandom() < 0.35, 90,
      null, null, trait(def, 'fastWater') ? creekSide : passable);
    if (ok) { a.wade = true; a.alt = 0; }
    return ok;
  }

  // A dipper (fastWater) on its creek: mostly it stands on a splash rock bobbing, or walks into the
  // riffle and dips under to pick larvae off the stones (wade); now and then it flies low and
  // straight along the creek to another rock a few tiles off, never over land. In the nesting
  // months it keeps close to its nest, at the nearest fall where there is one. Off the creek (just
  // arrived) it flies to the nearest good stretch.
  alongCreek(a, def) {
    const w = this.game.world, x0 = Math.floor(a.x), y0 = Math.floor(a.y);
    if (!w.inb(x0, y0)) return false;
    const map = this.suit[a.sp], onCreek = !a.flying && shallowsFor(w, w.idx(x0, y0), def);
    if (onCreek && simRandom() < 0.7 && this.wade(a)) return true;
    const nest = def.breed.includes(this.game.month) && !a.juvenile ? creekNest(this, a) : -1;
    const h = a.home, R = onCreek ? 8 : 14;
    let best = -1, bs = -Infinity;
    for (let k = 0; k < 40; k++) {
      const x = x0 + Math.round((simRandom() * 2 - 1) * R), y = y0 + Math.round((simRandom() * 2 - 1) * R);
      if (!w.inb(x, y)) continue;
      const j = w.idx(x, y), d = Math.hypot(x - x0, y - y0);
      if (!shallowsFor(w, j, def) || !canLand(w, j, def) || map[j] <= 0.05 || w.fire[j]) continue;
      if (onCreek && (d < 2 || !overWater(w, a.x, a.y, x + 0.5, y + 0.5))) continue;
      let s = map[j] + simRandom() * 0.5 - (onCreek ? 0 : d * 0.1);
      if (h) s -= Math.max(0, Math.hypot(x - h.center % w.w, y - ((h.center / w.w) | 0)) - h.r) * 0.2;
      if (nest >= 0) s -= Math.hypot(x - nest % w.w, y - ((nest / w.w) | 0)) * 0.15;
      if (s > bs) { bs = s; best = j; }
    }
    if (best < 0 && !onCreek && !(this.state[a.sp].K < 0.05)) {
      // (none in sight: the nearest good stretch anywhere, as a newcomer follows the valley down to
      // its creek; skipped when the map holds none, so a dipper whose creek has gone isn't rescanning)
      let bd = Infinity;
      for (let j = 0; j < w.n; j++) {
        if (map[j] <= 0.05 || !shallowsFor(w, j, def) || w.fire[j]) continue;
        const d = Math.hypot(j % w.w - x0, (j / w.w | 0) - y0);
        if (d < bd) { bd = d; best = j; }
      }
    }
    if (best < 0) {
      if (!onCreek) return false;
      a.wait = 1 + simRandom() * 2; // (nowhere along the water to go: it stays on its rock)
      return true;
    }
    a.tx = best % w.w + 0.3 + simRandom() * 0.4; a.ty = (best / w.w | 0) + 0.3 + simRandom() * 0.4;
    a.state = 'fly'; a.flying = true; a.path = null; a.bird = null; a.birdGoal = null; a.wade = false;
    return true;
  }

  // Shallows beside water that holds fish, within a short flight.
  toShallows(a, def) {
    const w = this.game.world, x0 = Math.floor(a.x), y0 = Math.floor(a.y);
    let best = -1, bd = Infinity;
    for (let k = 0; k < 50; k++) {
      const x = x0 + Math.round((simRandom() * 2 - 1) * 10), y = y0 + Math.round((simRandom() * 2 - 1) * 10);
      if (!w.inb(x, y)) continue;
      const j = w.idx(x, y);
      if (!shallowsFor(w, j, def) || !canLand(w, j, def) || w.fire[j] || !(w.waterQ[j] > 0.3 || w.distWater[j] <= 1)) continue;
      const d = Math.hypot(x - x0, y - y0);
      if (d < bd) { bd = d; best = j; }
    }
    if (best < 0) return false;
    a.tx = best % w.w + 0.5; a.ty = (best / w.w | 0) + 0.5; a.state = 'fly'; a.flying = true; a.path = null; a.bird = null; a.birdGoal = null;
    return true;
  }

  // Crocodiles gather in the river at the crossing while the migration is swimming over: head
  // there, then lie in wait and take swimmers that come within reach, hungry or not. After a
  // kill each one rests a couple of days before striking again, so a crossing costs the herds a
  // handful of animals per crocodile rather than one, without emptying the column.
  lurk(a) {
    const w = this.game.world, cx = this.crossingAt.x, def = this.game.catalog.animals[a.sp];
    const at = (x, y) => Math.abs(x - cx) <= 5 && w.inb(x, y) && w.terrain[w.idx(x, y)] === T.RIVER && y < w.h - 1;
    if (at(Math.floor(a.x), Math.floor(a.y))) {
      const diet = preyFor(def, this.game);
      if (diet && !(this.game.day < (a.crossRest ?? -1)) && this.paced() && this.startHunt(a, def, diet, 4, b => inCrossing(this, b))) return true;
      a.wait = 1 + simRandom() * 3; a.trip = null; return true;
    }
    a.trip = null;
    return this.pathTo(a, (j, x, y) => at(x, y), 14000);
  }
}
