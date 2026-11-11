// Intent, the first step of decision 0025's order (part of the Wildlife class, sim/animals.js):
// what an animal does next and where it goes (chooseTarget, roam, disperse, herds and young),
// hunts and escapes, and the breadth-first route there (pathTo). Moving along it: wildlife-move.js.

import { T, isWater, clamp, DAYS_PER_YEAR, lifeAge } from '../config.js';
import { cap, preyFor, isMaleVariant } from '../data/animals.js';
import { predationCatchChance, preyCover } from './ecological-pressure.js';
import { animalRadius } from './animal-positioning.js';
import { huntStyle, stalkCoverAt, canHuntPrey, canStartHunt, beginHunt, endHunt, huntStep, pressOn, letGo, catchOdds, startFeed, missed, watch, prowl, scavenge, play, greet, harem, socialHold } from './animal-life.js';
import { birdChoose, carryCatch } from './bird-behavior.js';
import { climberChoose, fullTrees } from './climbers.js';
import { fishChoose, fishing, fishFed } from './fishing.js';
import { cervidLeader, keepCervidGroup, followCervid, inRut } from './cervid-groups.js';
import { primateChoose } from './primate-behavior.js';
import { forageChoose } from './animal-foraging.js';
import { territorialChoose, hasTerritory } from './animal-territory.js';
import { settle, landWalker } from './steering.js';
import { preferTrailPath, rangeChoose, followLeaderTrip } from './animal-trails.js';
import { swimDepth, fishDepth } from './waterline.js';
import { trait } from '../data/animal-kinds.js';
import { ensureHome, homeChoose, homeFalloff } from './home-range.js';
import { markRisk, safety } from './predation-risk.js';
import { passable, canLand, WADERS, shallows } from './animal-terrain.js';
import { simRandom } from './sim-random.js';
import { swimmer, territory, standable, inRiver, inCrossing, WITH_MOM } from './wildlife-shared.js';

let stamp = null, parent = null, bfsQ = null, depth = null, stampN = 1;

// ...but only between two open sides: a diagonal step past a bank corner would cut across land.
const cutsCorner = (W, x, y, dx, dy, ok) => dx && dy && !(ok(y * W + x + dx) && ok((y + dy) * W + x));

// how old (in days) a youngster is when it goes its own way
const independentAge = def => (WITH_MOM[def.key] ? Math.min(WITH_MOM[def.key], def.mature || 1) : (def.mature || 1) * 0.5) * DAYS_PER_YEAR;

// Habitat quality controls where animals settle, not whether a walker can cross dry ground.
// Swimmers and climbers still need water and canopy; semi-aquatic animals keep wet corridors.
const travelCorridor = (w, a, def, map, j) => !w.fire[j] && passable(w, j, a) &&
  (map[j] > 0.04 || (a.move !== 'ground' && isWater(w.terrain[j])) ||
    (a.move === 'ground' && !def.reef && !isWater(w.terrain[j])));

export class WildlifeIntent {
  startHunt(a, def, diet = preyFor(def, this.game), reach = 12, only = null) {
    if (!canStartHunt(a) || !diet) return false;
    reach = Math.min(reach, huntStyle(def).reach ?? reach); // (a snake strikes only at prey close by)
    let best = null, bd = reach * reach;
    const preySet = new Set(diet.map(k => this.game.catalog.animal[k].index));
    const stalker = a.move !== 'fly' && huntStyle(def).closeIn > 0;
    for (const b of this.agents) {
      if (!preySet.has(b.sp) || b.leaving || (only && !only(b))) continue;
      if (!canHuntPrey(this, a, def, b) || this.huntBlocked(a, def, b)) continue;
      // (one it just let go counts as twice as far for a few days: it goes after another if there is one, decision 0026)
      let d = ((b.x - a.x) ** 2 + (b.y - a.y) ** 2) * (b.id === a.huntCool && a.age < a.huntCoolUntil ? 4 : 1);
      // A cat that stalks needs cover to get close: prey out on open short grass counts as up to
      // twice as far, so it hunts where the grass, brush or trees let it creep in (decision 0037).
      if (stalker && d < bd) d *= (2 - stalkCoverAt(this.game.world, a, b)) ** 2;
      // A hunter keeps an eye out for the kind of prey it last caught (a search image), so prey that
      // has become rare here is passed over for the common kind: other kinds count as 1.5× as far.
      if (a.searchImage != null && b.sp !== a.searchImage && diet.length > 1) d *= 2.25;
      if (d < bd) { bd = d; best = b; }
    }
    if (best) {
      if (a.territory) { a.territory.goal = null; a.territory.mode = 'away'; }
      a.bird = null; a.birdGoal = null; a.birdGround = false;
      a.state = 'hunt'; a.target = best.id; a.huntTime = 5; a.path = null; a.assist = false; a.drinkT = 0; a.drinkAt = null;
      const perched = a.move === 'fly' && !a.flying;
      if (a.move === 'fly') { a.flying = !huntStyle(def).grounded; if (!a.flying) a.alt = 0; }
      a.forage = null; a.forageGoal = null;
      beginHunt(this, a, def, best);
      if (perched) a.hunt.perch = true; // (a raptor watching from a perch drops straight on its prey)
      // (a second try at prey it just let go starts with a stalk or an approach, not a sprint from standing: decision 0026)
      if (best.id === a.huntCool && a.age < a.huntCoolUntil && a.move !== 'fly') a.hunt.again = 0.6;
    }
    return !!best;
  }

  // The way to this prey is shut: the next step toward it is ground the hunter can't cross, or (for
  // water hunters: caiman, anaconda, giant otter, which strike from the water's edge) too far from water.
  huntBlocked(a, def, b) {
    if (a.move === 'fly') return false;
    const w = this.game.world, x = Math.floor(a.x + Math.sign(b.x - a.x) * 0.3), y = Math.floor(a.y + Math.sign(b.y - a.y) * 0.3);
    if (!w.inb(x, y)) return false;
    const j = w.idx(x, y);
    // (snakes that hunt on land, the boa and rat and garter snakes, aren't held to the water)
    return !passable(w, j, def) || (a.move === 'semi' && def.behavior.activity?.atWater !== false && w.distWater[j] > 2);
  }

  // A surface fish (a longtom) runs from a charging hunter: straight away from it along the
  // surface for a good distance, as fast as it can (the renderer draws the leaps it makes as it goes).
  fleeAlong(a, predator, { dash, tiles }) {
    const w = this.game.world, def = this.game.catalog.animals[a.sp];
    let dx = a.x - predator.x, dy = a.y - predator.y;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const path = [];
    for (let k = 1; k <= tiles * 2 && path.length < tiles; k++) {
      const x = Math.floor(a.x + dx * k * 0.5), y = Math.floor(a.y + dy * k * 0.5);
      if (!w.inb(x, y)) break;
      const j = w.idx(x, y);
      if (j === path[path.length - 1]) continue;
      if (!passable(w, j, def) || !canLand(w, j, def)) break;
      path.push(j);
    }
    if (!path.length) { this.evadeHunt(a, predator); a.run = 1.7; return; }
    a.follow = false; a.state = 'walk'; a.path = path.reverse(); a.dash = dash; a.swimT = 0; // (walk paths are followed from the end)
  }

  evadeHunt(a, predator) {
    const w = this.game.world, def = this.game.catalog.animals[a.sp], pd = this.game.catalog.animals[predator.sp];
    const x = Math.floor(a.x), y = Math.floor(a.y);
    const distance = (a.x - predator.x) ** 2 + (a.y - predator.y) ** 2;
    let best = -1, score = -Infinity;
    // Only evaluate neighbouring tiles after a failed catch: no extra pathfinding
    // or searches in the ordinary per-frame movement loop.
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || !w.inb(x + dx, y + dy)) continue;
      const j = w.idx(x + dx, y + dy);
      if (w.fire[j] || !passable(w, j, def) || !canLand(w, j, def)) continue;
      if (dx && dy && def.move !== 'fly' && (!w.inb(x + dx, y) || !w.inb(x, y + dy) || !passable(w, w.idx(x + dx, y), def) || !passable(w, w.idx(x, y + dy), def))) continue;
      const d = (x + dx + 0.5 - predator.x) ** 2 + (y + dy + 0.5 - predator.y) ** 2;
      if (d <= distance) continue;
      const s = d + preyCover(w, { sp: a.sp, x: x + dx, y: y + dy }, pd) * 2;
      if (s > score) { best = j; score = s; }
    }
    if (best < 0) return;
    a.threat = predator.id;
    a.follow = false;
    if (def.move === 'fly') { a.state = 'fly'; a.flying = true; a.tx = best % w.w + 0.5; a.ty = (best / w.w | 0) + 0.5; }
    else { a.state = 'walk'; a.path = [best]; }
  }

  // One step of a hunt (state 'hunt'): on after the prey, and the catch or the miss on contact.
  huntUpdate(a, def, sp, dt) {
    // A difficulty change also stops hunts that only exist in Challenging.
    if (!preyFor(def, this.game)) { a.state = 'idle'; a.wait = 1; a.flying = false; endHunt(a); return; }
    a.huntTime -= dt;
    const b = this.ids.get(a.target);
    if (!b || b.leaving || a.huntTime <= 0) {
      a.state = 'idle'; a.wait = 1; endHunt(a);
      if (this.game.diff.ecology && a.move === 'fly') a.flying = false;
      return;
    }
    if (!canHuntPrey(this, a, def, b)) { a.state = 'idle'; a.wait = 1; endHunt(a); return; }
    if (a.move === 'fly' && !huntStyle(def).grounded && a.alt < 1) a.alt = Math.min(1, a.alt + dt * 2); // (a soaring hawk starts from higher up)
    // (the way is shut, say the prey has taken to the water: it lets it go, easing off if running)
    if (a.hunt?.phase !== 'ease' && this.huntBlocked(a, def, b)) { letGo(this, a, def, b, sp); return; }
    // approach, stalk or circle, then rush (animal-life.js); the catch is decided on contact
    const reached = huntStep(this, a, def, b, sp);
    if (a.state !== 'hunt' || !reached) return;
    if (a.assist) { a.state = 'idle'; a.wait = 1.5; endHunt(a); if (a.move === 'fly') a.flying = false; return; } // (the pack's flankers leave the kill to the one in front)
    // Only an actual catch or carcass meal satisfies hunger.
    // (a swimmer in the crossing can't run or turn: the crocodiles' best chance all year)
    const swimmer = def.ambush && inCrossing(this, b);
    if ((this.game.diff.ecology ? this.game.rng() : simRandom()) < predationCatchChance(this.game, b, def, swimmer ? 0.7 : catchOdds(this.game.catalog.animals[b.sp]))) {
      a.state = 'idle'; a.wait = 1.5; endHunt(a);
      a.hunger = 0;
      if (swimmer) a.crossRest = this.game.day + 2;
      this.game.onPredation(a, b);
      markRisk(this, b.sp, b.x, b.y, 1); // its kind will remember this place
      this.remove(b, 'predation');
      if (!carryCatch(this, a, def, b)) startFeed(this, a, def, b);
    } else {
      if (this.game.diff.ecology) this.evadeHunt(b, a);
      missed(this, b, a);
      // the prey jinks free, and the hunter runs on after it while it has the wind, or lets it
      // go, easing off (decision 0026)
      if (pressOn(this, a, def) || (letGo(this, a, def, b, sp), a.state === 'hunt')) return;
    }
    if (a.move === 'fly' && a.state !== 'feed' && a.state !== 'carry') a.flying = false;
  }

  // How often a decision becomes a trip to another patch of habitat: wide-ranging species roam more.
  // Animals out in the river (the neighbours' water) look for a home on the farm more often.
  roamChance(def, a) {
    const w = this.game.world, i = w.inb(Math.floor(a.x), Math.floor(a.y)) ? w.idx(Math.floor(a.x), Math.floor(a.y)) : -1;
    const inRiver = i >= 0 && w.terrain[i] === T.RIVER && !def.patrol;
    return (0.04 + Math.min(0.06, def.hr / 1000)) * (inRiver ? 3 : 1) * (def.crossing ? 2.5 : 1); // the migrants keep moving across the plains
  }

  // Roaming: set off for another patch of good habitat somewhere else on the map. Walkers, swimmers
  // and climbers use physically traversable corridors. Walkers can cross open ground
  // between habitat patches without treating the crossing as habitat.
  // Flyers just fly there. Returns true if a trip was set up.
  roam(a, def, resume = null) {
    const w = this.game.world, map = this.suit[a.sp], W = w.w, n = w.n;
    const x0 = clamp(Math.floor(a.x), 0, W - 1), y0 = clamp(Math.floor(a.y), 0, w.h - 1), start = w.idx(x0, y0);
    const use = resume == null ? this.destinationUse(a.sp, a) : null;
    const room = j => 1 / (1 + 1.5 * (use?.get(j) || 0));
    if (a.move === 'fly') {
      let best = -1, bs = 0;
      for (let k = 0; k < 60; k++) {
        const j = Math.floor(simRandom() * n), x = j % W, y = (j / W) | 0;
        if (Math.hypot(x - x0, y - y0) < 14 || map[j] < 0.25 || w.fire[j] || !canLand(w, j, def)) continue;
        const sc = map[j] * room(j) * (0.6 + 0.4 * simRandom()) * (w.terrain[j] === T.RIVER ? 0.5 : 1);
        if (sc > bs) { bs = sc; best = j; }
      }
      if (best < 0) return false;
      a.tx = (best % W) + 0.3 + simRandom() * 0.4; a.ty = ((best / W) | 0) + 0.3 + simRandom() * 0.4;
      a.state = 'fly'; a.flying = true;
      return true;
    }
    if (!stamp || stamp.length < n) { stamp = new Int32Array(n); parent = new Int32Array(n); bfsQ = new Int32Array(n); }
    if (!depth || depth.length < n) depth = new Int16Array(n);
    // (overland, a route keeps off the property's outermost ring: otherwise ties in the search
    // send it along the boundary, its wear makes a trail there, and the herds keep to the edge)
    const ring = j => { const x = j % W, y = (j / W) | 0; return x === 0 || y === 0 || x === W - 1 || y === w.h - 1; };
    const corridor = j => travelCorridor(w, a, def, map, j) && (a.leaving || a.move !== 'ground' || !ring(j));
    stampN++;
    let head = 0, tail = 0, pick = -1, seen = 0;
    const dest = resume ?? -1;
    bfsQ[tail++] = start; stamp[start] = stampN; parent[start] = -1; depth[start] = 0;
    while (head < tail) {
      const i = bfsQ[head++], x = i % W, y = (i / W) | 0;
      if (dest >= 0) { if (i === dest) { pick = i; break; } }
      else
      // a far, good tile: keep one at random, weighted toward the best habitat (reservoir sampling)
      // (the river is mostly a corridor: a place to pass through rather than settle)
      if (depth[i] >= 12 && map[i] > 0.3 && !(landWalker(def, a) && isWater(w.terrain[i]))) { const wgt = map[i] * map[i] * room(i) * (w.terrain[i] === T.RIVER && !def.patrol ? 0.25 : 1); seen += wgt; if (simRandom() * seen < wgt) pick = i; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!swimmer(a, this.game.catalog) && dx && dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= w.h) continue;
        const j = yy * W + xx;
        if (stamp[j] === stampN || !corridor(j) || cutsCorner(W, x, y, dx, dy, corridor)) continue;
        stamp[j] = stampN; parent[j] = i; depth[j] = Math.min(32000, depth[i] + 1); bfsQ[tail++] = j;
      }
    }
    if (pick < 0) { a.trip = null; return false; }
    const path = [];
    for (let i = pick; i !== start && i >= 0; i = parent[i]) path.push(i);
    a.path = preferTrailPath(this, a, def, path, corridor); a.state = 'walk';
    a.trip = pick; // remembered, so a hunt along the way doesn't make it forget where it was going
    if (resume == null) a.home = null; // moving on: it settles a new home where it arrives
    return true;
  }

  // Natal dispersal: a youngster leaves where it was born for a patch of good habitat of its own,
  // a little way off and with as few of its kind about as it can find. Without it every litter
  // stays piled up around the nest. Walks there along a corridor of habitat, like roam().
  disperse(a, def) {
    const w = this.game.world, map = this.suit[a.sp], W = w.w, n = w.n;
    const x0 = clamp(Math.floor(a.x), 0, W - 1), y0 = clamp(Math.floor(a.y), 0, w.h - 1), start = w.idx(x0, y0);
    if (!stamp || stamp.length < n) { stamp = new Int32Array(n); parent = new Int32Array(n); bfsQ = new Int32Array(n); }
    if (!depth || depth.length < n) depth = new Int16Array(n);
    const keep = Math.max(2, territory(def) * 1.5);
    const minD = Math.round(clamp(2 + Math.sqrt(def.hr) * 1.2, 4, 12)), maxD = minD * 3;
    const kin = this.agents.filter(o => o !== a && o.sp === a.sp && !o.leaving && Math.abs(o.x - a.x) < maxD + keep && Math.abs(o.y - a.y) < maxD + keep);
    const corridor = j => travelCorridor(w, a, def, map, j);
    stampN++;
    let head = 0, tail = 0, pick = -1, bs = 0;
    bfsQ[tail++] = start; stamp[start] = stampN; parent[start] = -1; depth[start] = 0;
    while (head < tail && tail < 6000) {
      const i = bfsQ[head++], x = i % W, y = (i / W) | 0;
      // (a sample of the far, good tiles is enough to find an empty one)
      if (depth[i] >= minD && map[i] > 0.25 && simRandom() < 0.3) {
        let others = 0;
        for (const o of kin) { const d = Math.hypot(o.x - x - 0.5, o.y - y - 0.5); if (d < keep) others += 1 - d / keep; }
        const sc = map[i] * (0.6 + 0.4 * simRandom()) / (1 + 3 * others);
        if (sc > bs) { bs = sc; pick = i; }
      }
      if (depth[i] >= maxD) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!swimmer(a, this.game.catalog) && dx && dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= w.h) continue;
        const j = yy * W + xx;
        if (stamp[j] === stampN || !corridor(j) || cutsCorner(W, x, y, dx, dy, corridor)) continue;
        stamp[j] = stampN; parent[j] = i; depth[j] = depth[i] + 1; bfsQ[tail++] = j;
      }
    }
    if (pick < 0) return false;
    const path = [];
    for (let i = pick; i !== start && i >= 0; i = parent[i]) path.push(i);
    a.path = path; a.state = 'walk'; a.trip = pick; a.home = null;
    return true;
  }

  chooseTarget(a, def) {
    a.restSpot = null;
    a.drinkAt = null; a.waterTrip = false;
    a.run = null;
    a.bird = null; a.birdGoal = null; a.birdGround = false;
    a.fruitMeal = null; a.fruitGoal = null;
    const w = this.game.world;
    const map = this.suit[a.sp];
    // a migrant left treading water in the river (a crocodile, a scare): swim on to the far bank
    // (before anything else: in the water there's no stopping to stare at a crocodile)
    if (def.crossing && !a.leaving && inRiver(this, a)) {
      const y0 = Math.floor(a.y);
      if (this.pathTo(a, (j, x, y) => y < y0 - 2 - (a.id % 3) && passable(w, j, a), 4000, null, null, standable)) { a.landed = true; a.trip = null; return; }
    }
    // a predator close by comes before anything else (on land)
    if (!a.leaving && watch(this, a, def)) return;
    if (!a.leaving && socialHold(this, a, def)) return;
    if (climberChoose(this, a, def)) return; // climbers: room in the tree, and squirrels down to the ground (climbers.js)
    // A newly formed family supersedes an old independent roaming trip.
    if (def.herd && a.trip != null && (this.herdLeader(a) !== a || def.familyHerd && inRut(this.game) && isMaleVariant(def, a))) a.trip = null;
    // on a trip: carry on to the destination (a hunt or a rest may have interrupted it)
    if (a.trip != null && hasTerritory(this, a, def)) a.trip = null;
    if (a.trip != null) {
      const tx = (a.trip % w.w) + 0.5, ty = ((a.trip / w.w) | 0) + 0.5;
      if (Math.hypot(a.x - tx, a.y - ty) < 2) a.trip = null;
      else if (this.roam(a, def, a.trip)) return;
    }
    a.follow = false; a.wade = false;
    ensureHome(this, a, def);
    // the young play-chase each other, and otherwise stay close to their mother until they're old
    // enough to go their own way
    if (!a.leaving && play(this, a, def)) return;
    if (a.mom != null && !a.leaving && this.keepWithMom(a, def)) return;
    if (a.disperse && !a.leaving && a.mom == null && lifeAge(a) >= independentAge(def)) { a.disperse = false; if (this.disperse(a, def)) return; }
    // just climbed out of the river: the herd heads inland to find grass
    if (a.landed) {
      a.landed = false;
      const w = this.game.world, map = this.suit[a.sp], y0 = Math.floor(a.y);
      if (!def.herd || this.herdLeader(a) === a) {
        if (this.pathTo(a, (j, x, y) => y < y0 - 14 - (a.id % 9) && map[j] > 0.2, 12000)) { a.trip = null; return; }
      }
    }
    if (a.move === 'fly' && WADERS.has(def.sprite.kind) && !a.leaving) {
      // (a hungry heron that fishes goes fishing at most decisions: fishing.js)
      const hungry = !!fishing(def, this.game) && !fishFed(a);
      if ((!a.flying || hungry) && simRandom() < (hungry ? 0.9 : 0.65) && this.wade(a)) return;
    }
    if (this.salmonRun && def === this.game.catalog.animal.bear && !a.leaving) {
      if (this.game.day < this.salmonRun.until) { if (!(a.fishFed > a.age) && this.fishSalmon(a)) return; }
      else if (a.visit) { this.leave(a); return; }
    }
    { // (a bear between runs: a trout in a creek close by, now and then)
      const fp = !a.leaving && fishing(def, this.game);
      // (once on the bank watching a fish, it keeps at it)
      const atBank = w.inb(Math.floor(a.x), Math.floor(a.y)) && w.distWater[w.idx(Math.floor(a.x), Math.floor(a.y))] <= 1;
      if (fp?.style === 'swipe' && !fishFed(a) && !(this.salmonRun && this.game.day < this.salmonRun.until) && (atBank || simRandom() < fp.chance) && this.fishSalmon(a, false)) return;
    }
    if (def.ambush && this.crossingAt && this.game.day < this.crossingAt.until && this.lurk(a)) return;
    if (!a.leaving && scavenge(this, a, def)) return; // a fresh kill nearby
    if (!a.leaving && prowl(this, a, def)) return;    // predators: lie up after a meal, go looking when hungry
    if (!a.leaving && fishChoose(this, a, def)) return; // kingfishers, eagles and otters go fishing (fishing.js)
    if (!a.leaving && harem(this, a, def)) return;    // elk in the rut: bulls gather and guard harems
    if (this.drinks(def) && !a.leaving && this.waterhole(a, def)) return;
    if (!a.leaving && homeChoose(this, a, def)) return; // back from the water, a hunt or a scare
    if (!a.leaving && forageChoose(this, a, def)) return;
    if (!a.leaving && territorialChoose(this, a, def)) return;
    if (!a.leaving && birdChoose(this, a, def)) return;
    if (!a.leaving && primateChoose(this, a, def)) return;
    if (!a.leaving && greet(this, a, def)) return;    // say hello to a neighbour (or spar with a rival)
    // herd animals stay together: one leads, the rest keep their place around it
    if (def.herd && !a.leaving && this.keepWithHerd(a, def)) return;
    // herd leaders keep their distance from the next herd of their kind, so herds spread out
    // (a leader with a home already settled away from the other herds' homes)
    if (def.herdMax && !a.leaving && !a.juvenile && !a.home && this.herdLeader(a) === a && simRandom() < 0.5) {
      const leaders = this.agents.filter(o => o !== a && o.sp === a.sp && !o.leaving && this.herdLeader(o) === o);
      if (leaders.some(o => (o.x - a.x) ** 2 + (o.y - a.y) ** 2 < 144)) {
        const map = this.suit[a.sp];
        // walk to the nearest decent ground well away from every other herd of this kind
        if (this.pathTo(a, (j, x, y) => map[j] > 0.08 && leaders.every(o => (o.x - x) ** 2 + (o.y - y) ** 2 > 196), 9000)) { a.trip = null; return; }
      }
    }
    if (!a.leaving && rangeChoose(this, a, def)) return;
    // now and then, head off along a corridor to another patch of habitat
    if (!a.leaving && !a.juvenile && !a.range && !hasTerritory(this, a, def) && !(def.familyHerd && inRut(this.game) && isMaleVariant(def, a)) && simRandom() < this.roamChance(def, a) * (a.home ? 0.15 : 1) && this.roam(a, def)) return;
    if (a.move === 'fly') {
      const r = Math.min(14, 4 + Math.sqrt(def.hr) * 0.8);
      let [x, y] = this.bestTileSample(def, a.x, a.y, r, 10, a);
      if (WADERS.has(def.sprite.kind)) { // waders come down in the shallows when there are any nearby
        for (let k = 0; k < 40; k++) {
          const xx = Math.round(a.x + (simRandom() * 2 - 1) * r), yy = Math.round(a.y + (simRandom() * 2 - 1) * r);
          if (w.inb(xx, yy) && shallows(w, w.idx(xx, yy)) && map[w.idx(xx, yy)] > 0.15) { x = xx; y = yy; break; }
        }
      }
      a.tx = x + 0.3 + simRandom() * 0.4; a.ty = y + 0.3 + simRandom() * 0.4;
      a.state = 'fly'; a.flying = true;
      return;
    }
    const x0 = Math.floor(a.x), y0 = Math.floor(a.y);
    if (!w.inb(x0, y0)) { a.x = clamp(a.x, 0.5, w.w - 0.5); a.y = clamp(a.y, 0.5, w.h - 0.5); a.wait = 1; return; }
    const start = w.idx(x0, y0);
    // others of its kind nearby, counted by the tile they're on or heading for: a spot that's
    // already taken is worth less, so they spread out over the habitat instead of crowding together
    // Animals that live alone also keep a little way from the neighbours, not just off their tile:
    // each settles into its own patch rather than the lot knotting together where the food is.
    const crowd = new Map(), near = [], keep = territory(def);
    for (const o of this.agents) {
      if (o === a || o.sp !== a.sp || o.leaving || Math.abs(o.x - a.x) > 14 || Math.abs(o.y - a.y) > 14) continue;
      const j = o.state === 'walk' && o.path?.length ? o.path[0] : w.idx(clamp(Math.floor(o.x), 0, w.w - 1), clamp(Math.floor(o.y), 0, w.h - 1));
      crowd.set(j, (crowd.get(j) || 0) + 1);
      if (keep) near.push(j);
    }
    const nearby = i => {
      let n = crowd.get(i) || 0;
      if (keep) for (const j of near) {
        const d = Math.hypot((j % w.w) - (i % w.w), ((j / w.w) | 0) - ((i / w.w) | 0));
        if (d > 0 && d < keep) n += 1 - d / keep;
      }
      return n;
    };
    // and the last few places it went: with only two good spots around (two lone trees in a
    // pasture) it would otherwise shuttle between them in a straight line, back and forth
    if (def.familyHerd && map[start] > 0.15 && simRandom() < 0.6) { a.wait = 3 + simRandom() * 4; return; }
    const recent = a.recent || (a.recent = []);
    const worth = i => 1 / (1 + 1.5 * nearby(i)) * (recent.includes(i) ? 0.3 : 1);
    // Patrollers (river dolphins, giant otters) cruise long stretches of water instead of
    // milling about one spot: they hold a heading, favour water well ahead of them, and turn
    // around at dead ends, following the channel toward its farthest reach.
    const patrol = !!def.patrol;
    if (patrol && !a.patrolDir) { const ang = simRandom() * Math.PI * 2; a.patrolDir = [Math.cos(ang), Math.sin(ang)]; }
    const R = patrol ? 16 : Math.min(12, 3 + Math.sqrt(def.hr) * 0.9);
    const n = w.n;
    if (!stamp || stamp.length < n) { stamp = new Int32Array(n); parent = new Int32Array(n); bfsQ = new Int32Array(n); }
    stampN++;
    let head = 0, tail = 0;
    bfsQ[tail++] = start; stamp[start] = stampN; parent[start] = -1;
    // (a fish that keeps to water deeper than FISH_DEPTH, the catfish lying on the bed, only stops
    // in a tile deep enough for it: it leaves a pool drying down to the shallows, or never goes in)
    const need = a.move === 'swim' && !def.reef && trait(def, 'fishDepth') ? fishDepth(def) : 0;
    const deep = i => !need || swimDepth(w, i % w.w + 0.5, (i / w.w | 0) + 0.5) >= need;
    let best = start, bs = patrol || !deep(start) ? 0 : map[start] * 0.8 * worth(start), far = -1, farD = 0;
    const W = w.w, cap = patrol ? 1200 : 380;
    const diag = swimmer(a, this.game.catalog);
    const ahead = i => (((i % W) - x0) * a.patrolDir[0] + (((i / W) | 0) - y0) * a.patrolDir[1]) / R;
    let poke = -1, pokeN = 0; // a random nearby spot it could live on, for a short wander
    while (head < tail && tail < cap) {
      const i = bfsQ[head++];
      const x = i % W, y = (i / W) | 0;
      if (Math.abs(x - x0) > R || Math.abs(y - y0) > R) continue;
      let s = map[i] * (0.45 + 0.55 * simRandom()) * (patrol || i === start ? 1 : worth(i));
      if (landWalker(def, a) && isWater(w.terrain[i])) s = 0; // (a land walker doesn't stop in the water)
      if (need && !deep(i)) s = 0;
      if (patrol) {
        const d2 = (x - x0) ** 2 + (y - y0) ** 2;
        if (map[i] > 0.15 && d2 > farD) { farD = d2; far = i; }
        const f = ahead(i);
        s *= f > 0 ? 0.3 + f : 0.03;
      }
      // Established resource ranges limit aimless drift between purposeful trips.
      if (a.home) s *= homeFalloff(w, a, i);
      s *= safety(this, a.sp, i);
      if (a.range) { const r = a.range, near = Math.min(Math.hypot(x-r.feed%W,y-(r.feed/W|0)),Math.hypot(x-r.rest%W,y-(r.rest/W|0))); s /= 1 + Math.max(0,near-4)*.7; }
      if (s > bs) { bs = s; best = i; }
      if (i !== start && map[i] > 0.01 && deep(i) && Math.abs(x - x0) + Math.abs(y - y0) <= 4 && !recent.includes(i) && simRandom() * ++pokeN < 1) poke = i;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!diag && dx && dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= w.h) continue;
        const j = yy * W + xx;
        if (stamp[j] === stampN || !passable(w, j, a) || cutsCorner(W, x, y, dx, dy, k => passable(w, k, a))) continue;
        stamp[j] = stampN; parent[j] = i; bfsQ[tail++] = j;
      }
    }
    // nothing better around: now and then it potters off a few steps anyway (foraging, sniffing
    // about), rather than standing on one tile or shuttling between the same two
    // (a river fish always does: it holds in the current a while, then noses on, rather than
    // hanging in one spot for days)
    const riverFish = a.move === 'swim' && !def.reef;
    // (and stranded in a marsh or a pool too shallow for it, with nowhere deep enough near: it swims
    // off along the channels to the nearest water that is)
    if (need && best === start && !deep(start) && this.pathTo(a, deep, 4000)) { recent.push(start); if (recent.length > 4) recent.shift(); return; }
    if (!patrol && best === start && poke >= 0 && (riverFish || simRandom() < 0.5)) best = poke;
    if (patrol) {
      // blocked (a bank or the end of the channel): turn toward the farthest open water instead
      if (best === start || ahead(best) < 0.35) {
        if (far >= 0) { const dx = (far % W) - x0, dy = ((far / W) | 0) - y0, l = Math.hypot(dx, dy) || 1; a.patrolDir = [dx / l, dy / l]; }
        else a.patrolDir = [-a.patrolDir[0], -a.patrolDir[1]];
      } else {
        // drift the heading a little so they also nose into creek mouths and side channels
        const t = (simRandom() - 0.5) * 0.5, c = Math.cos(t), sn = Math.sin(t);
        a.patrolDir = [a.patrolDir[0] * c - a.patrolDir[1] * sn, a.patrolDir[0] * sn + a.patrolDir[1] * c];
      }
    }
    if (best === start) { a.wait = riverFish ? 0.15 + simRandom() * 0.35 : 1 + simRandom() * 3; return; }
    const path = [];
    for (let i = best; i !== start && i >= 0; i = parent[i]) path.push(i);
    a.path = path; a.state = 'walk';
    recent.push(start); if (recent.length > (def.familyHerd ? 12 : 4)) recent.shift();
  }

  // The herd's leader: the longest-standing member within reach (lowest id). Herds that drift far
  // apart split, each with its own leader.
  herdLeader(a) {
    if (this.game.catalog.animals[a.sp].familyHerd) return cervidLeader(this, a);
    const max = this.game.catalog.animals[a.sp].herdMax || Infinity;
    const valid = o => o && o.sp === a.sp && !o.leaving && o.id <= a.id &&
      Math.hypot(o.x - a.x, o.y - a.y) < 40;
    const counts = new Map();
    if (Number.isFinite(max)) for (const b of this.agents) {
      if (b.sp === a.sp && !b.leaving && b.herdOf != null) counts.set(b.herdOf, (counts.get(b.herdOf) || 0) + 1);
    }
    const old = this.ids.get(a.herdOf);
    // Keep a living, nearby leader across births/departures instead of reshuffling by array rank.
    if (valid(old) && old.id < a.id && old.herdOf == null && (counts.get(old.id) || 0) < max) return old;
    a.herdOf = null;
    let lead = a;
    for (const o of this.agents) {
      if (!valid(o) || o.id >= lead.id || o.herdOf != null) continue;
      if (1 + (counts.get(o.id) || 0) < max) lead = o;
    }
    if (lead !== a) a.herdOf = lead.id;
    return lead;
  }

  // Tag along a step behind mum, trotting to catch up when she moves off.
  keepWithMom(a, def) {
    const years = WITH_MOM[def.key];
    if (!years || lifeAge(a) > Math.min(years, def.mature || years) * DAYS_PER_YEAR) { a.mom = null; return false; }
    const mom = this.agents.find(o => o.id === a.mom);
    if (!mom || def.familyHerd && isMaleVariant(def, mom)) { a.mom = null; return false; } // on its own now
    if (this.drinks(def) && mom.drinkT > 0 && this.waterhole(a, def)) return true;
    if (!a.momSlot) { const ang = simRandom() * Math.PI * 2, r = 0.45 + simRandom() * 0.4; a.momSlot = [Math.cos(ang) * r, Math.sin(ang) * r]; }
    // head for where she's going, not where she was, so the young keep pace instead of trailing
    if (def.familyHerd) return followCervid(this, a, [mom.x, mom.y], 'momSlot', 0.9);
    const w = this.game.world, dest = mom.state === 'walk' && mom.path?.length ? mom.path[mom.path.length - 1] : -1;
    const mx = dest >= 0 ? (dest % w.w) + 0.5 : mom.x, my = dest >= 0 ? ((dest / w.w) | 0) + 0.5 : mom.y;
    const tx = mx + a.momSlot[0], ty = my + a.momSlot[1], d = Math.hypot(a.x - tx, a.y - ty);
    a.trip = null;
    const settle = () => { a.wait = dest >= 0 ? 0.15 : 0.2 + simRandom() * 0.6; return true; };
    if (d < 0.9) return settle();
    if (this.pathTo(a, (j, x, y) => Math.hypot(x + 0.5 - tx, y + 0.5 - ty) < 0.9, 700, (x, y) => Math.hypot(x + 0.5 - tx, y + 0.5 - ty))) { a.follow = true; return true; }
    return d < 1.8 ? settle() : false; // already as close as the tiles allow
  }

  keepWithHerd(a, def) {
    if (def.familyHerd) return keepCervidGroup(this, a, def);
    const lead = this.herdLeader(a);
    if (lead === a) return false; // the leader grazes and roams as usual, and the herd follows
    // the leader is drinking: crowd down to the water beside it
    if (lead.drinkT > 0 && a.thirst > 1) {
      const w = this.game.world;
      if (this.pathTo(a, (j, x, y) => w.distWater[j] <= 1 && Math.abs(x - lead.x) + Math.abs(y - lead.y) < 7 &&
        (this.bankSpot(a, j)?.crowd ?? Infinity) < 0.08, 900)) { a.follow = true; a.trip = null; return true; }
    }
    if (followLeaderTrip(this, a, lead)) return true; // (single file behind the leader on its trip)
    // Large herds need more area than a small family. Retain each slot as the herd grows,
    // but let old saves expand slots that are now inside an overcrowded formation.
    let members = 1;
    for (const o of this.agents) if (o.sp === a.sp && !o.leaving && o.herdOf === lead.id) members++;
    const radius = Math.max(def.herdR ?? 2.5, animalRadius(a, this.game.catalog) * Math.sqrt(members) * 2);
    if (!a.slot || members > 8 && Math.hypot(...a.slot) < radius * 0.5) {
      const ang = simRandom() * Math.PI * 2, r = 0.8 + radius * Math.sqrt(0.25 + simRandom() * 0.75);
      a.slot = [Math.cos(ang) * r, Math.sin(ang) * r];
    }
    const tx = lead.x + a.slot[0], ty = lead.y + a.slot[1];
    if (Math.hypot(a.x - tx, a.y - ty) < 1.2) { a.wait = 0.4 + simRandom() * 1.5; a.trip = null; return true; }
    a.trip = null;
    if (this.pathTo(a, (j, x, y) => Math.hypot(x + 0.5 - tx, y + 0.5 - ty) < 1, 900, (x, y) => Math.hypot(x + 0.5 - tx, y + 0.5 - ty))) { a.follow = true; return true; }
    return false;
  }

  // Breadth-first walk to the nearest tile passing goal(j, x, y); if none turns up within `cap`
  // tiles and a distance function is given, head for the searched tile closest to the target.
  // Recovery can additionally avoid occupied tiles, without changing ordinary habitat paths.
  // Sets up the path and returns true if the animal is now walking.
  pathTo(a, goal, cap, dist = null, canVisit = null, canPass = passable) {
    const w = this.game.world, W = w.w, n = w.n;
    const x0 = Math.floor(a.x), y0 = Math.floor(a.y), start = w.idx(x0, y0);
    if (!stamp || stamp.length < n) { stamp = new Int32Array(n); parent = new Int32Array(n); bfsQ = new Int32Array(n); }
    stampN++;
    let head = 0, tail = 0, found = -1, near = -1, nd = dist ? dist(x0, y0) : 1e9;
    bfsQ[tail++] = start; stamp[start] = stampN; parent[start] = -1;
    const diag = swimmer(a, this.game.catalog);
    // (a land walker may wade across a creek or a marsh on the way, but no walk of its ends in one: 0025)
    const dry = landWalker(this.game.catalog.animals[a.sp], a), wet = i => dry && isWater(w.terrain[i]);
    // (nor does a climber's end in a tree that already holds as many of its kind as it takes: climbers.js)
    const full = fullTrees(this, a), ends = i => !wet(i) && !full?.has(i);
    while (head < tail && tail < cap) {
      const i = bfsQ[head++], x = i % W, y = (i / W) | 0;
      if (i !== start && ends(i) && goal(i, x, y)) { found = i; break; }
      if (dist && ends(i)) { const d = dist(x, y); if (d < nd) { nd = d; near = i; } }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!diag && dx && dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= w.h) continue;
        const j = yy * W + xx;
        if (stamp[j] === stampN || !canPass(w, j, a) || (canVisit && !canVisit(j)) || cutsCorner(W, x, y, dx, dy, k => canPass(w, k, a))) continue;
        stamp[j] = stampN; parent[j] = i; bfsQ[tail++] = j;
      }
    }
    const dest = found >= 0 ? found : near;
    if (dest < 0 || dest === start) return false;
    const path = [];
    for (let i = dest; i !== start && i >= 0; i = parent[i]) path.push(i);
    a.path = dist ? path : preferTrailPath(this, a, this.game.catalog.animals[a.sp], path, canVisit, canPass); a.state = 'walk';
    return true;
  }
}
