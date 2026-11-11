// Wildlife: individual animals wander their habitat, breed when there's room,
// die when there isn't, hunt, migrate in from the surroundings, and (beavers) re-engineer the land.


import { T, F, isWater, clamp, DAYS_PER_YEAR, lifeAge } from '../config.js';
import { many, cap, preyFor, preyPer, isMale, isMaleVariant } from '../data/animals.js';
import { removeTree } from './plants.js';
import { moment, momentFree } from './moments.js';
import { browseSapling, predationCatchChance, preyCover, hungryPredator, foodDeparture } from './ecological-pressure.js';
import { AnimalSpacing, animalRadius, facePoint, shoreSpot } from './animal-positioning.js';
import { huntStyle, stalkCoverAt, canHuntPrey, canStartHunt, beginHunt, endHunt, huntStep, pressOn, letGo, catchOdds, startFeed, leaveBody, missed, fleeUpdate, updateVigilance, playUpdate, sparUpdate, watch, prowl, scavenge, play, greet, harem, haremDay, arrive, fleeFire, socialHold, restless } from './animal-life.js';
import { birdChoose, birdArrive, birdUpdate, carryCatch, carryUpdate } from './bird-behavior.js';
import { climberChoose, climberArrive, fullTrees } from './climbers.js';
import { fishChoose, fishArrive, fishUpdate, fishStrike, fishing, fishFed, isFish } from './fishing.js';
import { cervidLeader, keepCervidGroup, followCervid, inRut, cervidNeedsRejoin } from './cervid-groups.js';
import { primateChoose, primateArrive, primateUpdate } from './primate-behavior.js';
import { forageChoose, forageArrive, forageUpdate } from './animal-foraging.js';
import { travelSpeed } from './climb-pace.js';
import { territorialChoose, hasTerritory, hoverStep } from './animal-territory.js';
import { updateDormancy, shelteredDormant } from './animal-dormancy.js';
import { smoothWalk, smoothWalker } from './animal-walking.js';
import { clearSpot, resolveStep, steerAround } from './ground-obstacles.js';
import { settle, aimDrink, landWalker, turnRate, reefStep } from './steering.js';
import { grazeDay, decayGrazing } from './grazing.js';
import { herbivoryDay, rubSapling } from './herbivory.js';
import { decayTrails, recordTrailStep, preferTrailPath, rangeChoose, rangePaces, followLeaderTrip } from './animal-trails.js';
import { shapeCourse, pathPoint } from './animal-course.js';
import { swimDepth, deepWaterNear, fishDepth } from './waterline.js';
import { trait } from '../data/animal-kinds.js';
import { wallowVisit } from './wallows.js';
import { damSiteOK, beaverFood, FOOD_MIN, drainToMeadow, meadowTile } from './beaver-ponds.js';
import { ensureHome, homeChoose, homeFalloff, walkToWater, drinkEvery, homeEligible, waterReach } from './home-range.js';
import { markRisk, safety, decayRisk } from './predation-risk.js';
import { dormancySeason } from '../data/animal-dormancy.js';
import { huntHunger } from '../data/animal-activity.js';
import { updatePassage } from './bird-passage.js';
import { passable, canLand, WADERS, shallows, reefMoveSafe } from './animal-terrain.js';
import { simRandom, useSimRandom } from './sim-random.js';
// Retain the existing public imports used by tools and older feature modules.
export { passable, canLand } from './animal-terrain.js';


let stamp = null, parent = null, bfsQ = null, depth = null, stampN = 1;

// Animals that swim in open water move in any direction, diagonals too (river fish, and everything on the reef).
const swimmer = (a, catalog) => a.move === 'swim' || !!catalog.animals[a.sp]?.reef;
// ...but only between two open sides: a diagonal step past a bank corner would cut across land.
const cutsCorner = (W, x, y, dx, dy, ok) => dx && dy && !(ok(y * W + x + dx) && ok((y + dy) * W + x));

export const SALMON_RUN_MONTH = 7;
export const SALMON_MIN_HABITAT = 15;
const SALMON_REACH = 2.2; // (tiles: how far a bear on the bank can lunge into the creek)
export const migrationFenceCount = w => {
  let count = 0;
  for (let x = 0; x < w.w; x++) if (w.feature[w.idx(x, 0)] === F.FENCE) count++;
  return count;
};
export function arrivalFinding(def, st) {
  if (st.pop > 0 || st.discovered || def.quick) return 1;
  const ramp = def.season ? def.season.length / 12 : 1;
  return clamp(((st.ready || 0) - 3 * ramp) / (16 * ramp), 0, 1);
}

// Young born here that leave home once independent to find a patch of their own: the walkers and
// waders that don't live in herds (herds and deer families keep their young with them).
const disperses = def => !def.herd && !def.familyHerd && !def.patrol && !def.reef && (def.move === 'ground' || def.move === 'semi');
// how old (in days) a youngster is when it goes its own way
const independentAge = def => (WITH_MOM[def.key] ? Math.min(WITH_MOM[def.key], def.mature || 1) : (def.mature || 1) * 0.5) * DAYS_PER_YEAR;
// How far (in tiles) an animal that lives alone keeps from others of its kind; 0 for herds and groups.
const territory = def => def.herd || def.familyHerd || def.patrol || def.reef ? 0 : clamp(Math.sqrt(def.hr) * 0.6, 1, 3);

// Habitat quality controls where animals settle, not whether a walker can cross dry ground.
// Swimmers and climbers still need water and canopy; semi-aquatic animals keep wet corridors.
const travelCorridor = (w, a, def, map, j) => !w.fire[j] && passable(w, j, a) &&
  (map[j] > 0.04 || (a.move !== 'ground' && isWater(w.terrain[j])) ||
    (a.move === 'ground' && !def.reef && !isWater(w.terrain[j])));

// Every animal carries the same fields, declared here in one order (unused ones stay undefined).
// Behaviours add their own state as they go, and without this nearly every animal ended up with
// a different object layout, so the JavaScript engine fell back to slow lookups for every field
// read in the movement loop. A field not listed still works, it is only slower to reach.
class Animal {
  id; sp; key; move; x; y; tx; ty; path; state; wait; age; heading; phase; hunger; flying; alt;
  leaving; spawner; juvenile; moveProgress; bird; birdGoal; birdGround; fruitGoal;
  drinkAt; fruitMeal; run; rutActive; haremCenter; haremAngle; satelliteSlot; waterTrip; restSpot;
  follow; wade; forageGoal; fromFire; avoidSide; drinkT; forage; recent; forageAfter; bankGoal;
  pushX; pushY; course; thirst; trip; greet; socialWith; socialUntil; localGoal; greetT; goal;
  birdAlertCheck; sparPath; sparT; sparLight; sparWith; sparAt; play; target; perchedAt; spd;
  swimT; threat; fleeOff; fx; fy; fleeT; fleeSpeed; fleeDelay; fleeSide; fleeAge; alertT; assist; hunt;
  woodLost; squeeze; trampled; dodge; dodgeOff;
  foragedAt; huntTime; playT; playN; nestSite; stoop; slot; disperse; alertUntil; carcass; feedAt;
  feedT; fruitAfter; socialCooldown; familySettled; familyRetryUntil; bachelorSlot; herdOf; mom;
  momSlot; familyFailures; patrolDir; haremOf; pace; sparStyle; sparHeading; sparLoser; rutCooldown;
  leaveWait; landed; haremSlot; haremHome; passing; nestUntil; bugleT; visit; fishFed; crossRest;
  familyBlockedBy; familyBlockedUntil; soaring; territory; territoryAfter; dormancy; dormancyAfter; range; rangeAfter; trailEdge; trailEdgeAge; walkOn;
  carry; prey; fishing; clingSide; fruitFed; ateFruitAt; climb; cache; home; homeAfter; drinkFrom; fleeHd; jink; sparSince; settleKey; huntCool; huntCoolUntil; searchImage; headUp; headUpKey; detour;
}
// (undefined fields are left out of saves and undo snapshots, as before)
const saved = a => { for (const k in a) if (a[k] === undefined) delete a[k]; return a; };
// Which way an animal faces is one field, `heading` (radians; decision 0025). Saves before
// 2026-11 kept it in up to four: `hd` (a swimmer's heading, which it was drawn with when set),
// `orientation` (everyone else's), `facing` (left or right, from the 2D drawing) and
// `walkHeading`; and `heading` was then a patrolling otter's or dolphin's direction, now `patrolDir`.
function oldFacing(o) {
  const { hd, orientation, facing, walkHeading, ...a } = o;
  if (Array.isArray(a.heading)) { a.patrolDir = a.heading; a.heading = undefined; }
  if (!Number.isFinite(a.heading)) a.heading = [hd, orientation, walkHeading].find(Number.isFinite) ?? (facing < 0 ? Math.PI : 0);
  if (a.hunt && 'hd' in a.hunt) { const { hd: line, ...hunt } = a.hunt; a.hunt = { ...hunt, line }; }
  return a;
}

// Young that stay close beside their mother, and for how many years (never past adulthood):
// bear cubs for a year and a half, fawns and calves through their first year, elephant calves for years.
// (Rodents, rabbits and birds raise their young in a nest or burrow instead.)
// Where an animal can be: where it can walk, and for the migration also the river it swims at the
// crossing (so swimmers can sidestep a crocodile or each other instead of jamming in a line).
function standable(w, i, a) {
  return passable(w, i, a) || (!!w.catalog.animals[a.sp]?.crossing && w.terrain[i] === T.RIVER);
}

// An animal standing (or swimming) in a river tile.
export function inRiver(wl, a) {
  const w = wl.game.world, x = Math.floor(a.x), y = Math.floor(a.y);
  return w.inb(x, y) && w.terrain[w.idx(x, y)] === T.RIVER;
}

// A migrant swimming the river at the crossing while the migration is coming over.
function inCrossing(wl, b) {
  const c = wl.crossingAt, w = wl.game.world;
  if (!c || !(wl.game.day < c.until) || !wl.game.catalog.animals[b.sp].crossing) return false;
  const x = Math.floor(b.x), y = Math.floor(b.y);
  return w.inb(x, y) && w.terrain[w.idx(x, y)] === T.RIVER;
}

const WITH_MOM = {
  deer: 0.8, elk: 1, bear: 1.5, cougar: 1.2, bobcat: 0.7, raccoon: 0.6, coyote: 0.5, beaver: 1.5, otter: 0.8,
  wildebeest: 0.8, zebra: 1, gazelle: 0.5, impala: 0.5, topi: 0.5, hartebeest: 0.5, giraffe: 1.2, elephant: 3, buffalo: 1, warthog: 0.5, rhino: 2,
  hippo: 1.5, lion: 1.5, cheetah: 1.5, leopard: 1.5, hyena: 1, ostrich: 0.6,
  jaguar: 1.5, ocelot: 1, peccary: 0.5, tapir: 1, capybara: 0.5, anteater: 0.8, giantotter: 0.8,
};

export class Wildlife {
  constructor(game) {
    this.game = game;
    this.agents = [];
    this.flyovers = [];
    this.passageWait = 8 + simRandom() * 10;
    this.spacing = new AnimalSpacing();
    this.carcasses = []; // kills being eaten (drawn, and visited by scavengers; not saved)
    this.nextId = 1;
    this.state = game.catalog.animals.map(() => ({ pop: 0, K: 0, suitSum: 0, discovered: false, lastYear: 0, blockedNotified: false, births: 0 }));
    this.suit = game.catalog.animals.map(() => new Float32Array(game.world.n));
    this.salmon = { fry: {}, spawners: 0, juveniles: 0, everSpawned: false };
    this.dams = 0;
    this.damFood = new Map(); // (beaver food round each dam, by tile: looked at monthly)
    this.g = { fishIndex: 0, frogIndex: 0, snagCount: 0, nestboxCount: 0, structureCount: 0, berryTiles: 0,
      forestTiles: 0, matureTiles: 0, meadowTiles: 0, bigTrees: 0, cleanWater: 0, salmonBonus: 0 };
  }

  // -------------------------------------------------------------- population bookkeeping
  get agents() { return this._agents; }
  set agents(agents) {
    this._agents = agents;
    this.vigilanceWait = 0; this.predatorAgents = null;
    this.ids ||= new Map();
    this.reindexAgents();
    this.spacingDirty = true;
  }
  reindexAgents() {
    this.ids.clear();
    for (const a of this.agents) this.ids.set(a.id, a);
  }
  get viewAgents() { return this.agents.concat(this.flyovers); }
  findAgent(id) { return this.agents.find(a => a.id === id) || this.flyovers.find(a => a.id === id); }
  hasAgent(a) { return this.agents.includes(a) || this.flyovers.includes(a); }
  count(key) {
    const k = this.game.catalog.animal[key].index;
    let c = 0;
    for (const a of this.agents) if (a.sp === k && !a.leaving) c++;
    return c;
  }

  recount() {
    this.reindexAgents();
    for (const s of this.state) s.pop = 0;
    for (const a of this.agents) if (!a.leaving) this.state[a.sp].pop++;
    let f = 0;
    for (const a of this.game.catalog.animals) if (a.frugivore) f += this.state[a.index].pop;
    this.game.frugivoreCount = f;
  }

  updateGlobals() {
    const w = this.game.world, st = w.stats || {};
    const g = this.g;
    let conWater = 0, isoWater = 0;
    for (let i = 0; i < w.n; i++) {
      if (!isWater(w.terrain[i]) || w.terrain[i] === T.RIVER) continue;
      if (w.waterQ[i] > 0.45) { if (w.connected[i]) conWater++; else isoWater++; }
    }
    // food for fish-eaters and frog-eaters: whatever swims or croaks on this map
    let fish = 0, frogs = 0;
    for (const a of this.game.catalog.animals) {
      const p = this.state[a.index].pop;
      if (a.move === 'swim' && !a.notPrey) fish += a.special === 'salmon' ? p * 0.5 : p;
      if (a.sprite.kind === 'frog') frogs += p * 0.5;
    }
    g.fishIndex = fish + this.salmon.juveniles * 0.2 + conWater / 12 + isoWater / 30;
    g.cleanWater = conWater; // clean ponds, creeks and marsh linked to the river
    g.frogIndex = frogs;
    g.snagCount = st.snags || 0;
    g.nestboxCount = st.nestboxes || 0;
    // roosts: old farm buildings (lofts, attics, silos), not parking lots or visitor centers
    g.structureCount = w.structures.filter(s => s && this.game.catalog.structures[s.type]?.roost).length;
    g.berryTiles = st.berry || 0;
    g.forestTiles = st.forest || 0;
    g.matureTiles = st.mature || 0;
    g.meadowTiles = st.meadow || 0;
    g.bigTrees = st.bigTrees || 0;
    g.stats = st; // (map-specific counts, e.g. the suburb's canopy network)
    const m = this.game.month;
    g.salmonBonus = (m >= 7 && m <= 9) ? Math.min(0.6, this.salmon.spawners / 10) : this.salmon.everSpawned ? 0.1 : 0;
  }

  computeSuitability() { for (const _ of this.suitabilityWork()); }

  // computeSuitability in parts, a few species at a time (see Game.dayWork).
  *suitabilityWork() {
    const w = this.game.world;
    this.updateGlobals();
    // What every species' loop asks of a tile besides its own suitability, read once rather than
    // once per species: 1 burning, 2 flooded, 4 river, 8 creek.
    const n = w.n, tile = this.tileFlags?.length === n ? this.tileFlags : (this.tileFlags = new Uint8Array(n));
    for (let i = 0; i < n; i++) {
      const t = w.terrain[i];
      tile[i] = (w.fire[i] ? 1 : w.flood[i] ? 2 : 0) | (t === T.RIVER ? 4 : t === T.CREEK ? 8 : 0);
    }
    const disturb = w.disturb;
    for (const def of this.game.catalog.animals) {
      const map = this.suit[def.index];
      let sum = 0, calmSum = 0, rawSum = 0, salmonHabitat = 0;
      // The river is the neighbours' habitat: animals pass through it, but it counts little toward what lives here.
      const shy = def.shy, onLand = def.move === 'ground', salmon = def.special === 'salmon';
      for (let i = 0; i < n; i++) {
        const raw = def.suit(w, i), f = tile[i];
        let calm = raw;
        let s = raw * (1 - shy * disturb[i]);
        if (f & 1) { s = 0; calm = 0; }
        else if (f & 2 && onLand) { s *= 0.15; calm *= 0.15; }
        map[i] = s;
        const weight = f & 4 ? 0.12 : 1;
        sum += s * weight; calmSum += calm * weight; rawSum += raw * weight;
        if (salmon && s > 0.25 && f & 8) salmonHabitat++;
      }
      const st = this.state[def.index];
      st.suitSum = sum;
      st.baseK = sum / def.hr;
      st.calmK = calmSum / def.hr;
      st.rawK = rawSum / def.hr;
      st.resourceFactor = clamp(def.req(this.g), 0, 1.5);
      let K = st.baseK * st.resourceFactor;
      st.habitatK = K;
      st.preyK = null; st.hostK = null;
      // species it lives off without hunting (vultures follow the herds, dung beetles their dung)
      if (def.needs) {
        let host = 0;
        for (const hk of def.needs) if (this.game.catalog.animal[hk]) host += this.state[this.game.catalog.animal[hk].index].pop;
        st.hostK = host / def.needsPer;
        K = Math.min(K, st.hostK);
      }
      // The spawning run uses qualifying creek tiles, rather than the ordinary capacity rule.
      if (def.special === 'salmon') { st.salmonHabitat = salmonHabitat; K = salmonHabitat / def.hr; }
      st.K = Math.min(def.max, K);
      if (def.index % 6 === 5) yield;
    }
    this.sharePrey();
  }

  // Hunters share their prey (decision 0037). Each prey animal is split between the hunting species
  // that eat it, rather than counted whole by every one of them: lions, hyenas, cheetahs and
  // leopards had each counted the same gazelle, so there was one hunter for every six prey.
  // A hunter's own share is in proportion to how many prey it would need to fill the room its
  // habitat gives it; the others' claims are what they eat now, their numbers here (up to that
  // room). A hunter that isn't here eats nothing: counting the room of absent ones, the bass's
  // room for ten (fifty bluegill, where there were fifteen) left Atlanta's otters half an otter's
  // worth of the creek, so they could never arrive.
  sharePrey() {
    const game = this.game, cat = game.catalog, hunters = [], claim = new Float64Array(cat.animals.length);
    for (const def of cat.animals) {
      const diet = preyFor(def, game);
      if (!diet) continue;
      const st = this.state[def.index], per = preyPer(def, game);
      const want = Math.min(def.max, st.K) * per; // (st.K is still its habitat and hosts here)
      const eats = Math.min(want, st.pop * per);
      hunters.push({ def, st, diet, per, want, eats });
      for (const pk of diet) if (cat.animal[pk]) claim[cat.animal[pk].index] += eats;
    }
    for (const h of hunters) {
      let prey = 0;
      for (const pk of h.diet) {
        const p = cat.animal[pk], all = p ? claim[p.index] - h.eats + h.want : 0;
        if (all > 0) prey += this.state[p.index].pop * h.want / all;
      }
      h.st.preyK = prey / h.per;
      h.st.K = Math.min(h.st.K, h.st.preyK);
    }
  }

  // -------------------------------------------------------------- spawning
  spawn(def, x, y, opts = {}) {
    const id = this.nextId++, [ox, oy] = spotIn({ id }, x * 977 + y, true); // (not all on one point: a litter, a flock released together)
    const a = Object.assign(new Animal(), {
      id, sp: def.index, key: def.key, move: def.move,
      x: x + 0.5 + ox, y: y + 0.5 + oy, tx: x + 0.5, ty: y + 0.5, path: null,
      state: 'idle', wait: simRandom() * 2, age: opts.age ?? def.mature * DAYS_PER_YEAR * (1 + simRandom() * 2),
      // (a draw once spent on a left/right `facing` for the 2D drawing, kept so seeded runs keep their animals)
      phase: (simRandom(), simRandom() * 10), hunger: simRandom() * 3,
      flying: false, alt: 0, leaving: false, spawner: !!opts.spawner, juvenile: !!opts.juvenile,
    });
    a.heading = a.phase * Math.PI / 5; // an initial direction without another random draw
    if (opts.flyIn) { a.flying = true; a.alt = 1; a.state = 'fly'; a.tx = x + 0.5; a.ty = y + 0.5; a.x = opts.fromX; a.y = opts.fromY; }
    this.agents.push(a);
    this.ids?.set(id, a);
    this.spacingDirty = true;
    const st = this.state[def.index];
    st.pop++;
    if (!st.discovered && !opts.silent) {
      st.discovered = true;
      this.game.onDiscover(def, a);
    } else if (!st.discovered) st.discovered = true;
    return a;
  }

  remove(a, cause) {
    this.spacingDirty = true;
    const k = this.agents.indexOf(a);
    if (k >= 0) this.agents.splice(k, 1);
    this.ids?.delete(a.id);
    if (!a.leaving) this.state[a.sp].pop = Math.max(0, this.state[a.sp].pop - 1);
    if (this.game.selectedAgent === a) this.game.selectedAgent = null;
    if (cause === 'predation' || cause === 'starved') this.game.stats.deaths = (this.game.stats.deaths || 0) + 1;
  }

  randomPassableNear(def, x, y, r) {
    const w = this.game.world;
    for (let k = 0; k < 20; k++) {
      const xx = Math.round(x + (simRandom() * 2 - 1) * r), yy = Math.round(y + (simRandom() * 2 - 1) * r);
      if (!w.inb(xx, yy)) continue;
      const i = w.idx(xx, yy);
      if (passable(w, i, def) && canLand(w, i, def) && (def.move !== 'swim' || isWater(w.terrain[i]))) return [xx, yy];
    }
    return null;
  }

  // Try to bring a group of this species in from one of its source edges.
  recruitmentRoom(def) {
    if (!def.strictMax) return Infinity;
    // Count departing animals too: they still occupy the diorama until they leave.
    const present = this.agents.filter(a => a.sp === def.index).length;
    return Math.max(0, Math.min(def.max, Math.ceil(this.state[def.index].K)) - present);
  }

  immigrate(def, n, returning = false) {
    n = Math.min(n, this.recruitmentRoom(def));
    if (n <= 0) return 0;
    if (def.crossing) return this.crossRiver(def, n);
    const w = this.game.world, rng = this.game.rng;
    const edge = def.sources[Math.floor(rng() * def.sources.length)];
    let placed = 0, blocked = false;
    for (let tries = 0; tries < 16 && placed < n; tries++) {
      let x, y;
      if (edge === 'N') { x = Math.floor(rng() * w.w); y = 0; }
      else if (edge === 'S') { x = Math.floor(rng() * w.w); y = w.h - 1; }
      else if (edge === 'E') { x = w.w - 1; y = Math.floor(rng() * (w.h - 6)); }
      else { x = 0; y = Math.floor(rng() * (w.h - 6)); }
      if (def.move === 'fly') {
        // fly in from beyond the edge toward good habitat
        const t = this.bestTileSample(def, x, y, 16, 20);
        const fx = edge === 'W' ? -3 : edge === 'E' ? w.w + 3 : x;
        const fy = edge === 'N' ? -3 : edge === 'S' ? w.h + 3 : y;
        this.spawn(def, t[0], t[1], { flyIn: true, fromX: fx, fromY: fy });
        placed++;
        continue;
      }
      if (edge === 'S' || def.move === 'swim') {
        // arrive via the river
        let found = -1;
        for (let k = 0; k < 30; k++) {
          const xx = Math.floor(rng() * w.w);
          for (let yy = w.h - 1; yy > w.h - 6; yy--) {
            const i = w.idx(xx, yy);
            if (w.terrain[i] === T.RIVER) { found = i; break; }
          }
          if (found >= 0) break;
        }
        if (found < 0) continue;
        x = found % w.w; y = (found / w.w) | 0;
        if (def.move === 'ground') {
          // walk up from the riverbank
          while (y > 0 && !passable(w, w.idx(x, y), def)) y--;
        }
      }
      const i = w.idx(x, y);
      if (!passable(w, i, def)) {
        if (w.feature[i] === F.FENCE) blocked = true;
        continue;
      }
      const c = this.spawn(def, x, y);
      c.wait = 0;
      placed++;
    }
    if (!placed && blocked && !this.state[def.index].blockedNotified) {
      this.state[def.index].blockedNotified = true;
      const dir = { N: 'north', E: 'east', W: 'west', S: 'south' }[edge];
      this.game.notify(`${cap(many(def))} tried to wander in from the ${dir}, but the old boundary fence stopped them. Tearing out fences opens a wildlife corridor.`, 'warn');
    }
    return placed;
  }

  // The migration: the herd comes over the river from the far bank at the crossing in the middle
  // of the map, swimming in a long column, and climbs out onto the plains. They're only passing
  // through on their way north to the park, so while the north fence cuts that route, they don't come.
  crossRiver(def, n) {
    const w = this.game.world, rng = this.game.rng, st = this.state[def.index];
    const fence = migrationFenceCount(w);
    if (fence > 4) {
      if (!st.blockedNotified) {
        st.blockedNotified = true;
        this.game.notify(`${cap(many(def))} came to the river crossing, but turned back: the fence along the north edge cuts the migration route through to the park. Tear it out and the herds can pass through.`, 'warn');
      }
      return 0;
    }
    const cx = Math.round(w.w * (def.crossing.x ?? 0.5));
    let bank = w.h - 1;
    while (bank > 0 && isWater(w.terrain[w.idx(cx, bank)])) bank--;
    // (the crocodiles know; a big enough herd is the keystone moment once it's swimming, see momentsUpdate)
    this.crossingAt = { x: cx, bank, until: this.game.day + 12, moment: n >= 6 || !!this.crossingAt?.moment && this.game.day < this.crossingAt.until };
    const lag = rng() * 4; // groups that arrive the same month string out along the crossing
    for (let k = 0; k < n; k++) {
      // a loose crowd: bunched in the middle, stragglers out to the sides and well behind
      const spread = (rng() + rng() + rng() - 1.5) * 5.5;
      const x = clamp(cx + Math.round(spread), 0, w.w - 1);
      const a = this.spawn(def, x, w.h - 1);
      // (start on the grass past the far bank, which the surroundings draw from w.h + 3, so the
      // whole column wades in: starting closer put the front of it mid-river from the start)
      a.x = x + 0.1 + rng() * 0.8; a.y = w.h + 4 + lag + rng() * 4 + k * 0.12;
      a.pace = 0.8 + rng() * 0.45;
      const path = [];
      for (let y = Math.max(0, bank - 3 - Math.floor(rng() * 3)); y <= w.h - 1; y++) path.push(w.idx(x, y));
      a.path = path; a.state = 'walk'; a.wait = 0; a.landed = true;
    }
    return n;
  }

  // Count occupied and committed destinations once per decision. A bounded stencil avoids
  // scanning the population for every tile in a long roaming search. Include airborne arrivals.
  destinationUse(sp, except = null) {
    const w = this.game.world, use = new Map(), keep = Math.max(1, territory(this.game.catalog.animals[sp]));
    const r = Math.ceil(keep);
    for (const o of this.agents) {
      if (o === except || o.sp !== sp || o.leaving) continue;
      const dest = o.state === 'walk' && o.path?.length ? o.path[0] : null;
      const x = dest != null ? dest % w.w : Math.floor(o.state === 'fly' ? o.tx : o.x);
      const y = dest != null ? (dest / w.w | 0) : Math.floor(o.state === 'fly' ? o.ty : o.y);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (!w.inb(x + dx, y + dy)) continue;
        const weight = 1 - Math.hypot(dx, dy) / (keep + 0.5);
        if (weight <= 0) continue;
        const j = w.idx(x + dx, y + dy); use.set(j, (use.get(j) || 0) + weight);
      }
    }
    return use;
  }

  bestTileSample(def, x, y, r, n, a = null) {
    const w = this.game.world, map = this.suit[def.index], use = this.destinationUse(def.index, a);
    let best = [clamp(x, 0, w.w - 1), clamp(y, 0, w.h - 1)], bs = -1;
    for (let k = 0; k < n; k++) {
      const xx = Math.round(x + (simRandom() * 2 - 1) * r), yy = Math.round(y + (simRandom() * 2 - 1) * r);
      if (!w.inb(xx, yy)) continue;
      if (!canLand(w, w.idx(xx, yy), def)) continue;
      const s = map[w.idx(xx, yy)] * (0.6 + 0.4 * simRandom()) / (1 + 1.5 * (use.get(w.idx(xx, yy)) || 0));
      if (s > bs) { bs = s; best = [xx, yy]; }
    }
    // Sampling can miss a narrow bank. Find the nearest landing tile only in that case.
    best = best.map(Math.floor);
    if (!canLand(w, w.idx(...best), def)) {
      let nearest = best, distance = Infinity;
      for (let i = 0; i < w.n; i++) {
        if (!canLand(w, i, def)) continue;
        const xx = i % w.w, yy = (i / w.w) | 0;
        const d = (xx - best[0]) ** 2 + (yy - best[1]) ** 2;
        if (d < distance) { distance = d; nearest = [xx, yy]; }
      }
      return nearest;
    }
    return best;
  }

  // -------------------------------------------------------------- monthly population dynamics
  monthly() { for (const _ of this.monthlyWork()); }

  *monthlyWork() {
    const game = this.game, rng = game.rng, m = game.month;
    this.recount();
    yield* this.suitabilityWork();

    // migrants coming and going this month, announced together below
    const left = [], back = [];
    for (const def of this.game.catalog.animals) {
      const st = this.state[def.index];
      if (def.special === 'salmon') { this.salmonMonth(def, st); continue; }
      const inSeason = !def.season || def.season.includes(m);
      const mine = this.agents.filter(a => a.sp === def.index && !a.leaving);
      let pop = mine.length;
      const K = st.K;

      if (!inSeason) {
        if (pop > 0) {
          st.lastYear = pop;
          for (const a of mine) this.leave(a);
          // announce a species' departure the first time; after that it's routine
          game.flags.leftSeen ||= {};
          if (!game.flags.leftSeen[def.key]) { game.flags.leftSeen[def.key] = true; left.push(`${pop} ${pop === 1 ? def.name.toLowerCase() : many(def)}`); }
        }
        continue;
      }

      // returning migrants remember the place
      if (def.season && m === def.season[0] && st.lastYear > 0 && pop === 0) {
        const n = Math.max(1, Math.min(st.lastYear, Math.ceil(K)));
        let placed = 0;
        for (let k = 0; k < n; k++) placed += this.immigrate(def, 1, true);
        if (placed) back.push({ text: `${placed} ${placed === 1 ? def.name.toLowerCase() : many(def)}`, a: this.agents[this.agents.length - 1] });
        st.lastYear = 0;
        pop += placed;
      }

      // births
      if (def.breed.includes(m) && pop >= 2 && pop < K) {
        const adults = mine.filter(a => a.state !== 'dormant' && lifeAge(a) >= def.mature * DAYS_PER_YEAR && !hungryPredator(game, a, def));
        // (the young follow a female: in family herds the adults without the male look, otherwise any
        // female adult, or any adult at all if there are no females)
        const females = def.familyHerd ? null : adults.filter(a => !isMale(def, a));
        const mothers = def.familyHerd ? adults.filter(a => !isMaleVariant(def, a)) : females.length ? females : adults;
        const pairs = def.familyHerd ? (adults.length > mothers.length ? mothers.length : 0) : Math.floor(adults.length / 2);
        for (let p = 0; p < pairs && pop < K * 1.15; p++) {
          if (rng() > 0.75 * (1 - pop / Math.max(K, 1))) continue;
          const parentA = def.familyHerd ? mothers.splice(Math.floor(rng() * mothers.length), 1)[0] : mothers[Math.floor(rng() * mothers.length)];
          const n = def.litter[0] + Math.floor(rng() * (def.litter[1] - def.litter[0] + 1));
          for (let k = 0; k < n && this.recruitmentRoom(def) > 0; k++) {
            const pos = this.randomPassableNear(def, parentA.x - 0.5, parentA.y - 0.5, 1) || [Math.floor(parentA.x), Math.floor(parentA.y)];
            const young = this.spawn(def, pos[0], pos[1], { age: 0 });
            if (WITH_MOM[def.key]) young.mom = parentA.id;
            if (disperses(def)) young.disperse = true; // (once independent it leaves home: see disperse())
            pop++; st.births++;
          }
          if (st.births === n) game.notify(`${cap(many(def))} have raised young here for the first time!`, 'good', parentA);
        }
      }

      // deaths and departures
      const over = pop > K * 1.1 ? (pop - K) / pop : 0;
      for (const a of mine) {
        const dormant = shelteredDormant(this, a, def);
        if (!dormant && hungryPredator(game, a, def) && rng() < 0.2) {
          this.leave(a); foodDeparture(game, a); pop--; continue;
        }
        let p = 1 / (def.life * 12);
        // Sheltered winter residents use reduced reserves rather than being forced
        // out by seasonal food scarcity. Natural/age mortality still applies.
        if (!dormant && over) p += 0.3 * over;
        if (!dormant && K < 0.5) p += 0.12;
        if (lifeAge(a) > def.life * DAYS_PER_YEAR * 1.3) p += 0.35;
        if (rng() < p) {
          // most "deaths" when habitat is poor are really animals moving on
          if (!dormant && (K < def.minK || rng() < 0.4)) this.leave(a);
          else { leaveBody(this, a); this.remove(a, 'natural'); } // (old age, hunger, sickness: the body stays)
          pop--;
        }
      }

      // immigration: a species has to find new habitat first, so the odds build up over the months
      // it stays good (and a returning migrant population always knows the way)
      st.ready = K >= def.minK ? (st.ready || 0) + 1 : 0;
      if (K >= def.minK && pop < K && !dormancySeason(game, def)) {
        // seasonal visitors only count their months here, so they catch on proportionally faster
        // (quick: butterflies, bees and hummingbirds find a new garden within weeks, not seasons)
        const finding = arrivalFinding(def, { ...st, pop });
        const chance = def.mig * (pop === 0 ? 1 : 0.35) * clamp((K - pop) / K + 0.2, 0, 1) * game.diff.arrivals * finding;
        if (rng() < chance) {
          const n = def.groupSize[0] + Math.floor(rng() * (def.groupSize[1] - def.groupSize[0] + 1));
          this.immigrate(def, n);
        }
      }
    }
    // one message for the whole seasonal movement, with the explanation only the first time
    const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0];
    if (back.length) {
      game.notify(`Migrants are back for the season: ${list(back.map(b => b.text))}.`, 'good', back[0].a);
    }
    if (left.length) {
      const first = !game.flags.migrantsExplained;
      game.flags.migrantsExplained = true;
      const lt = this.game.catalog.definition.text?.migrantsLeave; // (a map where migrants leave at a different time of year, like the reef's winter mantas)
      game.notify(lt ? `${lt[0]}: ${list(left)}.${first ? ' ' + lt[1] : ''}` : `Heading south for the winter: ${list(left)}.${first ? ' They remember good habitat and come back in spring if it is still here.' : ''}`, 'info');
    }
    this.recount();
  }

  salmonMonth(def, st) {
    const game = this.game, rng = game.rng, m = game.month, w = game.world;
    const S = this.salmon;
    const map = this.suit[def.index];
    let habitat = 0, rearing = 0;
    for (let i = 0; i < w.n; i++) {
      if (map[i] > 0.25 && w.terrain[i] === T.CREEK) habitat++;
      if (w.connected[i] && (w.terrain[i] === T.POND || w.terrain[i] === T.MARSH)) rearing++;
    }
    st.K = Math.min(def.max, habitat / def.hr);
    const year = game.year;
    if (m === SALMON_RUN_MONTH && habitat >= SALMON_MIN_HABITAT) {
      // a bigger run than the bare minimum, so a few lost to bears still leaves plenty to spawn
      const returns = Math.round((S.fry[year - 3] || 0) * 0.05);
      const strays = Math.floor(rng() * 5) + 5;
      const n = Math.min(def.max, Math.max(1, Math.min(Math.ceil(st.K * 1.5), strays + returns)));
      let placed = 0;
      for (let k = 0; k < n; k++) placed += this.immigrateSalmon(def);
      if (placed) {
        S.spawners = placed;
        this.startSalmonRun();
        game.notify(returns > 0
          ? `The coho are home! ${placed} salmon are running up the creek, including fish born here.`
          : `Coho salmon are running up the creek! ${placed} spawner${placed > 1 ? 's' : ''} found the open passage.`, 'good', this.agents[this.agents.length - 1]);
        if (!S.everSpawned) { S.everSpawned = true; game.flags.salmonSpawned = true; }
      }
    }
    if (m === 9) {
      // spawned-out salmon die and feed the streamside forest
      const spawners = this.agents.filter(a => a.sp === def.index && a.spawner);
      for (const a of spawners) {
        const x = Math.floor(a.x), y = Math.floor(a.y);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (w.inb(x + dx, y + dy)) { const i = w.idx(x + dx, y + dy); w.soil[i] = Math.min(1, w.soil[i] + 0.03); }
        }
        this.remove(a, 'natural');
      }
      if (spawners.length) {
        const fry = Math.round(spawners.length * 25 * clamp(0.3 + rearing / 40, 0.3, 1.6));
        S.fry[year] = fry;
        game.notify(`The salmon have spawned and died, feeding the soil. About ${fry} eggs are buried in the creek gravel.`, 'info');
      }
      S.spawners = 0;
    }
    if (m === 1) {
      const fry = S.fry[year - 1] || 0;
      const n = Math.min(12, Math.ceil(fry / 25));
      let placed = 0;
      if (n > 0) {
        const tiles = [];
        for (let i = 0; i < w.n; i++) if (w.connected[i] && (w.terrain[i] === T.CREEK || w.terrain[i] === T.POND) && map[i] > 0.1) tiles.push(i);
        for (let k = 0; k < n && tiles.length; k++) {
          const i = tiles[Math.floor(rng() * tiles.length)];
          this.spawn(def, i % w.w, (i / w.w) | 0, { juvenile: true, age: 0, silent: true });
          placed++;
        }
        S.juveniles = placed;
        if (placed) game.notify(`Young coho have hatched in the creek. They'll rear here for a year before heading to sea.`, 'good');
      }
    }
    if (m === 4) {
      for (const a of this.agents.filter(a => a.sp === def.index && a.juvenile)) this.leave(a);
      S.juveniles = 0;
    }
  }

  // The run is on: bears come down to the creek to fish. If none live here, a couple wander in
  // from the hills for the season and go again when the salmon are spent.
  startSalmonRun() {
    const game = this.game, w = game.world, bear = this.game.catalog.animal.bear;
    this.salmonRun = { from: game.day, until: game.day + 22, shown: false };
    if (!bear) return;
    const fish = this.agents.filter(a => this.game.catalog.animals[a.sp].special === 'salmon');
    const f = fish[fish.length - 1], mouth = f && (this.creekMouth(f) || [f.x, f.y - 6]);
    const have = this.agents.filter(a => a.sp === bear.index && !a.leaving).length;
    for (let k = have; k < 2 && f; k++) {
      // arrive out of cover a little way up the creek from its mouth, so they're soon on the bank
      const ang = -Math.PI / 2 + (simRandom() - 0.5) * 2, r = 4 + simRandom() * 3;
      const pos = this.randomPassableNear(bear, clamp(Math.round(mouth[0] + Math.cos(ang) * r), 1, w.w - 2), clamp(Math.round(mouth[1] + Math.sin(ang) * r), 1, w.h - 8), 4);
      if (!pos) continue;
      const b = this.spawn(bear, pos[0], pos[1], { silent: true });
      b.visit = true;
    }
  }

  // A bear at the salmon run: go to the bank nearest a running fish, stand and watch the water,
  // and swipe at any salmon that comes within reach. A caught fish is eaten there on the bank,
  // and a fed bear rests a while before fishing again, so the bears take some of the run, not all.
  // Outside a run (run false) a bear now and then does the same for a trout in a creek close by
  // (its fishing profile, fishing.js: only fish it can see, and less often).
  fishSalmon(a, run = true) {
    const w = this.game.world, def = this.game.catalog.animals[a.sp], p = fishing(def, this.game);
    const fish = this.agents.filter(o => !o.leaving && (run ? this.game.catalog.animals[o.sp].special === 'salmon'
      : isFish(this.game.catalog.animals[o.sp]) && p && Math.hypot(o.x - a.x, o.y - a.y) < p.reach && this.inCreek(o)));
    if (!fish.length) return false;
    // (a fish in the creek, or near a river bank, is within reach; one out in the deep river isn't)
    const reachable = o => { const i = w.inb(Math.floor(o.x), Math.floor(o.y)) ? w.idx(Math.floor(o.x), Math.floor(o.y)) : -1;
      return i >= 0 && (w.terrain[i] === T.CREEK || this.nearBank(o.x, o.y)); };
    let f = null, bd = Infinity;
    for (const o of fish) { const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2 + (reachable(o) ? 0 : 400); if (d < bd) { bd = d; f = o; } }
    bd = (f.x - a.x) ** 2 + (f.y - a.y) ** 2;
    const x0 = Math.floor(a.x), y0 = Math.floor(a.y);
    if (w.inb(x0, y0) && w.distWater[w.idx(x0, y0)] <= 1 && bd < 16) {
      facePoint(a, f.x, f.y);
      if (bd < SALMON_REACH * SALMON_REACH) {
        // the swipe
        if ((this.game.diff.ecology ? this.game.rng() : simRandom()) < predationCatchChance(this.game, f, def, 0.22)) {
          if (this.game.diff.ecology) a.hunger = 0;
          this.game.onPredation(a, f);
          const fx = f.x, fy = f.y;
          a.prey = { id: f.id, sp: f.sp, age: f.age, juvenile: !!f.juvenile, fish: true }; // (drawn in front of it on the bank)
          this.remove(f, 'predation');
          a.state = 'feed'; a.feedAt = [fx, fy]; a.feedT = 1.5 + simRandom(); a.drinkT = 0; a.drinkAt = null;
          a.wait = 0; a.fishFed = a.age + (run || !p ? 6 + simRandom() * 3 : p.every[0] + simRandom() * (p.every[1] - p.every[0])); // (full for a few days)
          return true;
        }
        a.wait = 0.6 + simRandom() * 0.6; a.drinkT = 0.5; a.drinkAt = [f.x, f.y]; // missed: head down, eyes on the water
        return true;
      }
      // a few steps along the bank to get within reach of it
      const near = (x, y) => Math.hypot(x + 0.5 - f.x, y + 0.5 - f.y);
      if (this.pathTo(a, (j, x, y) => w.distWater[j] === 1 && near(x, y) < SALMON_REACH, 300, near)) return true;
      // watching: short waits, so a fish swimming past doesn't go unnoticed
      a.wait = 0.8 + simRandom() * 0.8; a.drinkT = 0.6 + simRandom() * 0.4; a.drinkAt = [f.x, f.y];
      return true;
    }
    // walk (at a purposeful trot) to the bank beside it; if no bank is in reach, wait where the
    // creek meets the river, which every salmon has to swim past
    const near = (x, y) => Math.hypot(x + 0.5 - f.x, y + 0.5 - f.y);
    let ok = this.pathTo(a, (j, x, y) => w.distWater[j] === 1 && near(x, y) < SALMON_REACH, 4000, near);
    const mouth = run && !ok && this.creekMouth(f);
    if (mouth) { const m = (x, y) => Math.hypot(x + 0.5 - mouth[0], y + 0.5 - mouth[1]); ok = this.pathTo(a, (j, x, y) => w.distWater[j] === 1 && m(x, y) < 2.5, 4000, m); }
    if (ok) a.run = 1.4;
    return ok;
  }
  inCreek(o) {
    const w = this.game.world, x = Math.floor(o.x), y = Math.floor(o.y);
    return w.inb(x, y) && (w.terrain[w.idx(x, y)] === T.CREEK || this.nearBank(o.x, o.y));
  }
  nearBank(x, y) {
    const w = this.game.world;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = Math.floor(x) + dx, yy = Math.floor(y) + dy;
      if (w.inb(xx, yy) && w.distWater[w.idx(xx, yy)] === 1) return true;
    }
    return false;
  }
  // the creek tile at a river mouth nearest a fish
  creekMouth(f) {
    const w = this.game.world;
    let best = null, bd = Infinity;
    for (let i = 0; i < w.n; i++) {
      if (w.terrain[i] !== T.CREEK) continue;
      const x = i % w.w, y = (i / w.w) | 0;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.inb(x + dx, y + dy) && w.terrain[w.idx(x + dx, y + dy)] === T.RIVER)) continue;
      const d = (x + 0.5 - f.x) ** 2 + (y + 0.5 - f.y) ** 2;
      if (d < bd) { bd = d; best = [x + 0.5, y + 0.5]; }
    }
    return best;
  }

  immigrateSalmon(def) {
    const w = this.game.world;
    const opts = [], mouths = [];
    for (let i = 0; i < w.n; i++) {
      if (w.terrain[i] !== T.RIVER || !w.connected[i]) continue;
      const x = i % w.w, y = (i / w.w) | 0;
      // most arrive at a connected creek mouth, ready to turn up it; a few further along the river
      if ([[0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => w.inb(x + dx, y + dy) && w.terrain[w.idx(x + dx, y + dy)] === T.CREEK && w.connected[w.idx(x + dx, y + dy)])) mouths.push(i);
      else if (y > w.h - 6 && simRandom() < 0.1) opts.push(i);
    }
    const pick = mouths.length && (!opts.length || simRandom() < 0.8) ? mouths : opts;
    if (!pick.length) return 0;
    const i = pick[Math.floor(simRandom() * pick.length)];
    const a = this.spawn(def, i % w.w, (i / w.w) | 0, { spawner: true });
    a.wait = 0;
    return 1;
  }

  leave(a) {
    if (a.leaving) return;
    a.bird = null; a.birdGoal = null; a.birdGround = false;
    a.socialWith = null; a.socialUntil = 0; a.greet = null;
    a.leaving = true;
    this.state[a.sp].pop = Math.max(0, this.state[a.sp].pop - 1);
    const def = this.game.catalog.animals[a.sp], w = this.game.world;
    const edge = def.sources[Math.floor(simRandom() * def.sources.length)];
    if (a.move === 'swim' || (edge === 'S' && a.move !== 'fly')) { a.tx = a.x; a.ty = w.h + 2; }
    else if (edge === 'N') { a.tx = a.x + (def.herd ? (simRandom() - 0.5) * 10 : 0); a.ty = -3; }
    else if (edge === 'S') { a.tx = a.x; a.ty = w.h + 3; }
    else if (edge === 'E') { a.tx = w.w + 3; a.ty = a.y; }
    else { a.tx = -3; a.ty = a.y; }
    a.state = 'leave'; a.path = null;
    for (const o of this.agents) if (o.mom === a.id && !o.leaving) { this.leave(o); o.tx = a.tx + (simRandom() - 0.5); o.ty = a.ty + (simRandom() - 0.5); }
    if (def.herd) { // a herd moves off in dribs and drabs (not one in the water, though), the young and the old dropping back
      const years = lifeAge(a) / DAYS_PER_YEAR, prime = years >= (def.mature || 0) && !(def.life && years > def.life * 0.7);
      a.leaveWait = inRiver(this, a) ? 0 : simRandom() * 6; a.pace = (prime ? 0.9 : 0.65) + simRandom() * 0.4;
    }
    if (a.move === 'fly') { a.flying = true; }
    this.leaveRoute(a);
  }

  // Walkers head off the map round ponds and buildings rather than straight through them. Rivers
  // they still swim (the way out may lie across one, as the migration's does), and fences they
  // still cross on the way out, as before.
  leaveRoute(a) {
    const w = this.game.world, x0 = Math.floor(a.x), y0 = Math.floor(a.y);
    const def = this.game.catalog.animals[a.sp], reef = !!def.reef;
    if ((a.move !== 'ground' && !reef) || !w.inb(x0, y0)) return;
    const out = a.ty < 0 ? (x, y) => y === 0 : a.ty > w.h ? (x, y) => y === w.h - 1 : a.tx > w.w ? (x) => x === w.w - 1 : (x) => x === 0;
    if (out(x0, y0)) return;
    // The migration wades straight through a pond, as it swims the river, and takes a path only
    // round a building in its way: routing a herd round a pond sent it up the two columns beside
    // the pond in two straight files.
    const wades = !!def.crossing;
    const pass = reef ? (w, j) => passable(w, j, a) : (w, j) => w.struct[j] < 0 && (wades || w.terrain[j] !== T.POND);
    if (wades) {
      const ex = clamp(a.tx, 0, w.w - 0.01), ey = clamp(a.ty, 0, w.h - 0.01), n = Math.ceil(Math.hypot(ex - a.x, ey - a.y) / 0.4);
      let clear = true;
      for (let k = 1; k <= n && clear; k++) clear = pass(w, w.idx(Math.floor(a.x + (ex - a.x) * k / n), Math.floor(a.y + (ey - a.y) * k / n)), a);
      if (clear) { a.path = null; a.state = 'leave'; return; }
    }
    const ok = this.pathTo(a, (j, x, y) => out(x, y), w.n, (x, y) => Math.hypot(x + 0.5 - a.tx, y + 0.5 - a.ty), null, pass);
    a.state = 'leave';
    if (!ok) a.path = null;
  }

  // Repair an old stranded position, or a new obstruction under an animal. Preserve
  // its identity and population count, and discard the route that put it on land.
  recoverReef(a) {
    const w = this.game.world;
    let best = -1, distance = Infinity;
    for (let j = 0; j < w.n; j++) {
      const d = (j % w.w + 0.5 - a.x) ** 2 + ((j / w.w | 0) + 0.5 - a.y) ** 2;
      if (d < distance && passable(w, j, a)) { best = j; distance = d; }
    }
    if (best < 0) return false;
    a.x = best % w.w + 0.5; a.y = (best / w.w | 0) + 0.5;
    a.path = null; a.spd = 0; a.swimT = 0;
    a.forage = null; a.forageGoal = null; endHunt(a);
    a.state = a.leaving ? 'leave' : 'idle'; a.wait = 0;
    if (a.leaving) this.leaveRoute(a);
    return true;
  }

  // -------------------------------------------------------------- daily behaviour
  daily() {
    decayRisk(this);
    const game = this.game, w = game.world, rng = game.rng, ecology = !!game.diff.ecology;
    // Repeated crossings wear trails during movement; unused routes recover daily.
    decayTrails(w);
    decayGrazing(w);
    herbivoryDay(game); // (where the big herbivores spent the day, in kg/ha: 0033)
    for (let i = 0; i < w.n; i++) {
      if (ecology && w.browseDamage?.[i] > 0) w.browseDamage[i] = w.browseDamage[i] < 0.001 ? 0 : w.browseDamage[i] * 0.94;
    }
    haremDay(this);
    this.damDay();
    for (const a of this.agents.slice()) {
      if (a.leaving) continue;
      const def = this.game.catalog.animals[a.sp];
      const x = Math.floor(a.x), y = Math.floor(a.y);
      if (!w.inb(x, y)) continue;
      const i = w.idx(x, y);
      a.hunger += shelteredDormant(this, a, def) ? def.behavior.dormancy.rate : 1;
      if (a.state === 'dormant') continue;
      grazeDay(game, def, x, y);
      rubSapling(game, a, def, x, y);
      // A family that has settled into a feed-and-rest range moves on to another patch about once
      // a year, so elk that came in from the north find the meadows further south (see 0003).
      if (a.range && def.familyHerd && a.state === 'idle' && !a.juvenile && !(inRut(game) && isMaleVariant(def, a)) && this.herdLeader(a) === a && rng() < 1 / 120) {
        const range = a.range; a.range = null;
        if (!this.roam(a, def)) a.range = range;
      }

      const diet = preyFor(def, game);
      if (diet && canStartHunt(a) && a.hunger > huntHunger(def) && rng() < 0.4) this.startHunt(a, def, diet);

      wallowVisit(this.game, a, def, i); // (the heavy herbivores' wallows: wallows.js)
      if (def.damBuilder) this.beaverDay(a, x, y, i);
      else if (def.browseRate && a.state === 'idle') {
        const s = w.shrub[i];
        if (s && !this.game.catalog.plants[s].invasive && w.shrubG[i] > 0.3) w.shrubG[i] -= def.browseRate;
        // (a sapling set in the fence line is out of reach, behind the wire)
        if (ecology) browseSapling(game, a, def);
        else if (w.tree[i] && w.treeG[i] < 0.4 && w.feature[i] !== F.FENCE) w.treeG[i] = Math.max(0.05, w.treeG[i] - 0.01);
      }
    }
  }

  // At watch pace the animals' clock runs ahead of the calendar (lifePace: calendar days per animal
  // day). A hunt tried at any moment, rather than once a day, passes only that share of the time,
  // so a hungry hunter that misses doesn't get several more tries a day and eat its prey out.
  paced() { return !(this.lifePace < 1) || simRandom() < this.lifePace; }

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

  beaverDay(a, x, y, i) {
    const w = this.game.world, rng = this.game.rng;
    // chew woody plants
    if (rng() < 0.2) {
      for (let k = 0; k < 8; k++) {
        const xx = x + Math.round((rng() * 2 - 1) * 3), yy = y + Math.round((rng() * 2 - 1) * 3);
        if (!w.inb(xx, yy)) continue;
        const j = w.idx(xx, yy);
        const s = w.shrub[j], t = w.tree[j];
        if (s && this.game.catalog.plants[s].beaverFood && w.shrubG[j] > 0.35) { w.shrubG[j] = 0.15; break; } // coppiced, will resprout
        if (t && this.game.catalog.plants[t].beaverFood && w.treeG[j] > 0.25) {
          if (w.treeG[j] < 0.75) removeTree(w, j, 'beaver', rng, { deadwood: false });
          else if (rng() < 0.25) removeTree(w, j, 'beaver', rng);
          break;
        }
      }
    }
    // build a dam: where the creek will back up into a pond worth having, with room from the
    // other ponds and food to keep a colony (beaver-ponds.js)
    const pop = this.state[a.sp].pop;
    if (pop >= 2 && rng() < 0.06 && this.dams < Math.floor(pop / 2) + 1 && w.distWoody[i] <= 4) {
      let site = -1;
      for (let dy = -1; dy <= 1 && site < 0; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (w.inb(xx, yy) && damSiteOK(this.game, w.idx(xx, yy))) { site = w.idx(xx, yy); break; }
      }
      if (site >= 0) this.buildDam(site);
    }
  }

  damNear(i, r) {
    const w = this.game.world, x = i % w.w, y = (i / w.w) | 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (w.inb(x + dx, y + dy) && w.feature[w.idx(x + dx, y + dy)] === F.DAM) return true;
    }
    return false;
  }

  buildDam(site) {
    const w = this.game.world, rng = this.game.rng;
    const x = site % w.w, y = (site / w.w) | 0;
    w.feature[site] = F.DAM; w.featureAge[site] = 0;
    if (!this.game.water) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const xx = x + dx, yy = y + dy;
      if (!w.inb(xx, yy)) continue;
      const j = w.idx(xx, yy);
      if (j === site) continue;
      const d = Math.hypot(dx, dy) + hashJitter(xx, yy);
      const t = w.terrain[j];
      if (w.struct[j] >= 0 || t === T.ROAD || t === T.RIVER || w.feature[j] === F.CULVERT) continue;
      // (marks remember what the pool drowned, so it can drain back if the dam goes)
      if (d <= 2.2) {
        if (t === T.CREEK) { w.terrain[j] = T.POND; w.marks[j] |= POOL_CREEK; }
        else if (t !== T.POND) { floodTile(w, j, T.MARSH, rng); w.marks[j] |= POOL_LAND; }
      } else if (d <= 3.4) {
        if (!isWater(t)) { floodTile(w, j, rng() < 0.5 ? T.MARSH : T.MUD, rng); w.marks[j] |= POOL_LAND; }
      }
    }
    this.game.water?.sync();
    this.dams++;
    w.hydroDirty = true; w.renderDirty = true;
    this.game.flags.beaverDam = true;
    moment(this.game, 'dam', { x: x + 0.5, y: y + 0.5 });
    this.game.notify(this.game.water ? 'Beavers built a dam! A pond is filling behind it, with marsh round its edges. The trees it drowns will stand as snags for herons and woodpeckers.' : 'Beavers built a dam! The creek is backing up into a brand-new wetland, and the drowned trees will become snags.', 'good', { x: x + 0.5, y: y + 0.5 });
  }

  // Daily: a dam is only as good as the beavers keeping it up. One no beaver has tended for
  // half a year starts to leak and, usually within the year after, washes out.
  damDay() {
    const w = this.game.world, rng = this.game.rng, keepers = this.agents.filter(a => this.game.catalog.animals[a.sp].damBuilder && !a.leaving);
    let dams = 0;
    for (let i = 0; i < w.n; i++) {
      if (w.feature[i] !== F.DAM || (w.marks[i] & 4)) continue; // (canal blocks are people's work)
      const x = i % w.w + 0.5, y = (i / w.w | 0) + 0.5;
      // (featureAge: days since tended. A colony keeps its dam up while there is food round it;
      // once the willow and alder are eaten out it moves on, and the dam is left to go)
      if (this.game.day % 30 === 0 || !this.damFood.has(i)) this.damFood.set(i, beaverFood(w, i));
      if (this.damFood.get(i) >= FOOD_MIN && keepers.some(a => Math.abs(a.x - x) < 8 && Math.abs(a.y - y) < 8)) w.featureAge[i] = 0;
      else if (w.featureAge[i] > 60 && rng() < 1 / 120) { this.breakDam(i); this.game.notify('An abandoned beaver dam has washed out. The pond is draining, and its bed will grow into a wet beaver meadow of sedge, willow and standing dead trees.', 'info', { x, y }); continue; }
      dams++;
    }
    if (!this.game.water) this.dams = dams; // (also puts the count right after an undo)
  }

  // A dam goes (washed out, abandoned or pulled apart): its pond drains back to creek, and
  // the ground it flooded is left as damp, rich soil or marsh (a beaver meadow).
  breakDam(site) {
    const w = this.game.world, x0 = site % w.w, y0 = (site / w.w) | 0;
    drainToMeadow(this.game, site); // (before the dam goes: what its pond covered becomes beaver meadow)
    w.feature[site] = 0; w.featureAge[site] = 0; this.damFood.delete(site);
    this.dams = Math.max(0, this.dams - 1);
    if (!this.game.water) {
      let marked = false;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = x0 + dx, y = y0 + dy;
        if (!w.inb(x, y)) continue;
        const j = w.idx(x, y);
        if (w.marks[j] & POOL_CREEK) { if (w.terrain[j] === T.POND) w.terrain[j] = T.CREEK; marked = true; }
        // (the flooded ground is left as beaver meadow, which dries back over the years)
        if ((w.marks[j] & POOL_LAND) && (w.terrain[j] === T.MUD || w.terrain[j] === T.MARSH)) meadowTile(w, j, w.terrain[j] === T.MARSH);
        w.marks[j] &= ~(POOL_CREEK | POOL_LAND);
      }
      if (!marked) this.reopenCreek(site); // (a dam from an older save: no record of the old channel)
    }
    this.game.water?.sync();
    w.hydroDirty = true; w.renderDirty = true;
  }

  // Cut the creek back through an old dam's pond: from the dam to the creek where it leaves the
  // pool on each side, by the shortest way across the pond.
  reopenCreek(site) {
    const w = this.game.world, x0 = site % w.w, y0 = (site / w.w) | 0, parent = new Map([[site, -1]]), q = [site], ends = [];
    while (q.length) {
      const i = q.shift(), x = i % w.w, y = (i / w.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (!w.inb(xx, yy) || Math.abs(xx - x0) > 5 || Math.abs(yy - y0) > 5) continue;
        const j = w.idx(xx, yy);
        if (parent.has(j)) continue;
        if (w.terrain[j] === T.CREEK || w.terrain[j] === T.RIVER) { parent.set(j, i); ends.push(j); }
        else if (w.terrain[j] === T.POND) { parent.set(j, i); q.push(j); }
      }
    }
    if (!ends.length) return;
    // the two creek ends furthest apart: upstream and downstream
    const at = j => [j % w.w, (j / w.w) | 0], far = (a, b) => Math.hypot(at(a)[0] - at(b)[0], at(a)[1] - at(b)[1]);
    let best = [ends[0], ends[0]], bd = -1;
    for (const a of ends) for (const b of ends) if (far(a, b) > bd) { bd = far(a, b); best = [a, b]; }
    for (const e of new Set(best)) for (let j = parent.get(e); j > -1 && j !== site; j = parent.get(j)) w.terrain[j] = T.CREEK;
  }

  // -------------------------------------------------------------- per-frame movement
  update(dt) {
    if (!(dt > 0)) return;
    if (this.game.wildRng) useSimRandom(this.game.wildRng); // (this game's stream, when a check runs several)
    updatePassage(this, dt);
    const w = this.game.world;
    this.spacing.rebuild(w, this.agents); this.spacingDirty = false;
    // Spawn, removal, load and undo maintain the ID map. Movement changes the
    // existing agents in place, so their lookups remain current without a rebuild.
    // (a fire is noticed within a few hours of game time)
    if ((this.fireCheck = (this.fireCheck || 0) - dt) <= 0) { this.fireCheck = 0.2; fleeFire(this); }
    const rangePace = rangePaces(this);
    for (let k = this.agents.length - 1; k >= 0; k--) {
      const a = this.agents[k];
      if (!a) continue;
      const def = this.game.catalog.animals[a.sp];
      if (def.reef && w.inb(Math.floor(a.x), Math.floor(a.y)) &&
        !passable(w, w.idx(Math.floor(a.x), Math.floor(a.y)), a) && !this.recoverReef(a)) continue;
      const trailX = a.x, trailY = a.y;
      if (a.state !== 'walk') a.walkOn = undefined;
      a.age += dt;
      if (this.lifePace < 1) a.lag = (a.lag || 0) + dt * (1 - this.lifePace); // (see lifeAge)
      if (updateDormancy(this, a, def)) continue;
      // (a fish beats its tail faster the faster it swims, and only sculls gently while it hovers)
      a.phase += dt * (def.reef ? 2.5 + 5 * Math.min(1.6, (a.spd || 0) / def.speed) : 6 * clamp(a.run || 1, 0.45, 2.6)) * (def.sprite.beat ?? 1); // (beat: a big, slow swimmer's tail; a.run: legs going faster at a sprint, slower at a creep)
      if (this.drinks(def)) a.thirst = (a.thirst || 0) + dt;
      if (a.alertT > 0) a.alertT -= dt;
      if (a.sparT > 0 && a.state !== 'spar') a.sparT -= dt;
      if (a.greetT > 0) a.greetT -= dt;
      if (a.bugleT > 0) a.bugleT -= dt;
      if (a.drinkT < 0) a.drinkT = 0; // (older saves: a timer left just below zero read as still drinking)
      if (a.drinkT > 0) {
        a.drinkT -= dt;
        if (a.drinkT <= 0) { a.drinkT = 0; a.drinkAt = null; } // (exactly 0: elsewhere a non-zero timer means drinking)
        else if (this.drinks(def) && !a.drinkAt) {
          // Older saves can contain a head-down pose with no direction (even a calf on dry
          // ground). Repair it on the next simulation step rather than waiting for another trip.
          const bank = this.bankSpot(a);
          if (bank) aimDrink(w, a, bank.water);
          else a.drinkT = 0;
        }
      }
      const sp = travelSpeed(def) * dt * (a.follow ? 1.3 : a.wade ? 0.3 : rangePace.get(a.id) || 1); // herd members trot to keep up; waders step slowly
      if (a.state !== 'hunt' && a.state !== 'flee' && a.state !== 'play' && a.state !== 'walk' && a.run) a.run = null;
      if (a.dash && a.state !== 'walk') a.dash = null; // (a longtom's dash ends with its escape swim)
      switch (a.state) {
        case 'idle':
          a.wait -= dt;
          if (def.familyHerd && !a.drinkT && a.socialWith == null && !(a.greetT > 0) && cervidNeedsRejoin(this, a, def)) a.wait = 0;
          if (a.hover) hoverStep(this, a, def, dt); // (a clownfish about its anemone: animal-territory.js)
          else if (def.reef && a.spd > 0.001) this.glide(a, dt); // (a fish coasts to a stop, it doesn't brake)
          // Repair saved landings and terrain edits without settling into open water.
          if (a.move === 'fly' && w.inb(Math.floor(a.x), Math.floor(a.y)) &&
            !canLand(w, w.idx(Math.floor(a.x), Math.floor(a.y)), def)) {
            a.flying = true; a.alt = Math.max(0.1, a.alt);
            if (a.wait <= 0) this.chooseTarget(a, def);
            break;
          }
          if (a.move === 'fly' && a.alt > 0) a.alt = Math.max(0, a.alt - dt * 3); // settle to the ground (or a branch) after landing
          if (a.wait <= 0) this.chooseTarget(a, def);
          break;
        case 'walk':
          this.walkStep(a, def, sp, dt);
          break;
        case 'approach':
          if (a.move === 'fly') a.alt = Math.max(0, a.alt - dt * 3);
          if (!a.localGoal || !(this.heldBank(a) || this.bankSpot(a)) || this.stepToward(a, ...a.localGoal, sp)) {
            a.localGoal = null; a.state = 'idle'; a.wait = 0;
          }
          break;
        case 'fly':
          a.alt = a.alt > 1 ? Math.max(1, a.alt - dt * 0.6) : Math.min(1, a.alt + dt * 3); // (gliding down from a soar)
          if (this.stepToward(a, a.tx, a.ty, sp)) {
            a.state = 'idle'; a.flying = false;
            const i = w.inb(Math.floor(a.x), Math.floor(a.y)) ? w.idx(Math.floor(a.x), Math.floor(a.y)) : -1;
            if (i >= 0 && !canLand(w, i, def)) { a.flying = true; a.wait = 0; break; }
            // a wader settles in (one come to fish starts soon: fishing.js)
            a.wait = WADERS.has(def.sprite.kind) && i >= 0 && shallows(w, i) ? (fishing(def, this.game) && !fishFed(a) ? 0.5 + simRandom() : 4 + simRandom() * 6) : 0.5 + simRandom() * 3;
            arrive(this, a);
            birdArrive(this, a);
            forageArrive(this, a);
          }
          break;
        case 'hunt':
          this.huntUpdate(a, def, sp, dt);
          break;
        case 'carry':
          carryUpdate(this, a, def, dt, sp);
          break;
        case 'fish':
          fishUpdate(this, a, def, dt, sp);
          break;
        case 'forage':
          forageUpdate(this, a, def, dt);
          break;
        case 'primate':
          primateUpdate(this, a, def, dt);
          break;
        case 'bird':
          birdUpdate(this, a, def, dt);
          break;
        case 'flee':
          fleeUpdate(this, a, def, dt);
          break;
        case 'play':
          playUpdate(this, a, def, sp);
          break;
        case 'spar':
          sparUpdate(this, a, def, sp, dt);
          break;
        case 'feed':
          a.feedT -= dt;
          if (a.move === 'fly') { a.alt = Math.max(0, a.alt - dt * 3); a.flying = false; }
          // (hunger counts from the end of the meal: a long meal doesn't use up the time it lasts)
          if (a.feedT <= 0) { // then a rest
            if (a.carcass != null && a.move === 'fly') a.birdGround = false; // (up off the ground where it ate: feedAt)
            a.state = 'idle'; a.wait = 1 + simRandom() * 2; a.feedAt = null; a.carcass = null; a.prey = null; a.hunger = 0;
          }
          break;
        case 'leave':
          if (a.leaveWait > 0) { a.leaveWait -= dt; break; }
          if (a.move === 'fly') a.alt = Math.min(1, a.alt + dt * 3);
          if (a.path?.length) { // (round the ponds first: see leaveRoute)
            const j = a.path[a.path.length - 1];
            if (def.reef && !passable(w, j, a)) { this.leaveRoute(a); break; }
            if (this.stepToward(a, (j % w.w) + 0.5, ((j / w.w) | 0) + 0.5, sp * 1.2 * (a.pace || 1))) a.path.pop();
            break;
          }
          if (this.stepToward(a, a.tx, a.ty, sp * (a.move === 'tree' ? 1 : 1.2) * (a.pace || 1)) || a.x < -2 || a.y < -2 || a.x > w.w + 2 || a.y > w.h + 2) this.remove(a, 'left');
          break;
      }
      recordTrailStep(this, a, def, trailX, trailY);
    }
    for (let k = this.carcasses.length - 1; k >= 0; k--) if ((this.carcasses[k].t -= dt) <= 0) this.carcasses.splice(k, 1);
    updateVigilance(this, dt);
    this.spacing.rebuild(w, this.agents); this.spacingDirty = false;
    this.spacing.separate(dt, standable);
    settle(this); // (what it acts on, it faces; out of the wood; off the water: steering.js)
    // Measure progress after spacing: movement can appear successful and then be
    // completely undone by a neighbour pushing the animal back in the same frame.
    for (const a of this.agents) this.checkMovementProgress(a, dt);
  }

  // One step along a walk's path (state 'walk'): to the next waypoint, round anyone in the way.
  walkStep(a, def, sp, dt) {
    const w = this.game.world;
    if (!a.path || !a.path.length) { a.state = 'idle'; a.run = null; a.wait = a.move === 'swim' && !def.reef ? 0.1 + simRandom() * 0.3 : def.patrol ? 0.2 + simRandom() * 0.8 : def.familyHerd && a.follow ? 0.25 : def.familyHerd && !a.greet && !a.follow ? (inRut(this.game) && isMaleVariant(def, a) && def.sprite.male?.antlers ? 0.5 + simRandom() * 1.5 : 3 + simRandom() * 4) : 0.5 + simRandom() * 3; arrive(this, a); birdArrive(this, a); primateArrive(this, a); forageArrive(this, a); fishArrive(this, a); climberArrive(this, a); return; }
    if (smoothWalker(def) && a.course?.path !== a.path) shapeCourse(this, a, def); // (a journey walks a curve: see animal-course.js)
    const j = a.path[a.path.length - 1];
    if (def.reef) { if (this.swimToward(a, j, sp * (a.pace || 1) * (a.dash || a.run || 1), dt) && (a.path.pop(), !a.path.length)) a.dash = null; return; }
    // each animal keeps to its own line through a tile and stops at its own spot in the last
    // one, so two walking the same way don't trace one track, and a group doesn't pile onto
    // a single point (a journey steers for where its course crosses the tile)
    let [ox, oy] = smoothWalker(def) ? pathPoint(w, a, a.path.length - 1).map((v, n) => v - (n ? (j / w.w | 0) : j % w.w) - 0.5) : spotIn(a, j, a.path.length === 1);
    // (a river fish's waypoint is in water deep enough to swim in, not up the bank's shallows)
    if (a.move === 'swim' && !def.reef && swimDepth(w, j % w.w + 0.5 + ox, (j / w.w | 0) + 0.5 + oy) < fishDepth(def)) {
      const p = deepWaterNear(w, j % w.w + 0.5 + ox, (j / w.w | 0) + 0.5 + oy, 0.9, fishDepth(def));
      if (p) { ox = p[0] - (j % w.w) - 0.5; oy = p[1] - (j / w.w | 0) - 0.5; }
    }
    if (a.path.length === 1 && a.restSpot?.[0] !== j) {
      const bank = !a.dormancy && this.drinks(def) && a.thirst > drinkEvery(this, a, def) * 0.5 ? this.bankSpot(a, j) : null;
      const drink = bank && bank.crowd < 0.08;
      a.restSpot = [j, ...(a.dormancy ? [j % w.w + 0.5, (j / w.w | 0) + 0.5] : drink ? [bank.x, bank.y] : this.spacing.restSpot(a, j, ox, oy))];
      // (on a low bank the dry spot can be a tile or two back from the water, off the tile
      // it walked to: remember it, or on arrival it doesn't know it's at the water and sets
      // off for the bank again, pacing back and forth without ever drinking)
      if (drink) a.bankGoal = bank;
    }
    // (a spot picked by tile can fall on a trunk: aim beside it, see ground-obstacles.js)
    const [tx, ty] = clearSpot(w, a, def, a.path.length === 1 ? a.restSpot[1] : (j % w.w) + 0.5 + ox,
      a.path.length === 1 ? a.restSpot[2] : ((j / w.w) | 0) + 0.5 + oy);
    const wading = def.crossing && w.terrain[j] === T.RIVER; // swimming the river is slow going
    // A waypoint isn't a pin that every animal must stand on. Step past occupied
    // transit points, or finish beside an occupied destination when already clear.
    const remaining = Math.hypot(a.x - tx, a.y - ty);
    if ((!smoothWalker(def) && a.path.length > 1 && remaining < 0.35 && w.idx(Math.floor(a.x), Math.floor(a.y)) === j) ||
      // (someone stands on this waypoint: on to the next, rather than braking behind them: 0025)
      (a.path.length > 1 && remaining < 0.6 && this.spacing.crowd(a, tx, ty) > 0.08) ||
      (a.path.length === 1 && remaining < 0.9 && this.spacing.crowd(a, tx, ty) > 0.08 &&
      this.spacing.crowd(a, a.x, a.y) < 0.04) ||
      // (its spot's been taken and it's getting no closer edging round the others: stop short)
      (a.path.length === 1 && remaining < 1.5 && a.moveProgress?.stalled > 0.3 && this.spacing.crowd(a, tx, ty) > 0.08) ||
      // (a herd member keeping up only needs to be near the others: held up near the end by a
      // trunk or a herd mate, it stops there instead of pressing on the spot for seconds)
      (a.follow && a.path.length === 1 && remaining < 2.5 && a.moveProgress?.stalled > 0.4)) {
      a.path.pop(); return;
    }
    const pace = (wading ? sp * 0.55 : sp) * (a.pace || 1) * (a.run || 1); // (a.run: a startled animal dashing for cover)
    // curve round anyone in the way rather than walking into them (not on a dash for cover)
    const round = a.run ? null : this.spacing.steer(a, tx, ty, standable);
    if (smoothWalker(def)) { if (smoothWalk(this, a, def, tx, ty, pace, dt, round)) a.path.pop(); }
    else if (round) { this.stepToward(a, round[0], round[1], pace * round[2]); if (Math.hypot(a.x - tx, a.y - ty) <= pace) a.path.pop(); }
    else if (this.stepToward(a, tx, ty, pace)) a.path.pop();
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

  checkMovementProgress(a, dt) {
    if (((a.state !== 'walk' || !a.path?.length) && a.state !== 'approach') || this.game.catalog.animals[a.sp].reef) {
      a.moveProgress = null;
      return;
    }
    const w = this.game.world, j = a.state === 'walk' ? a.path[a.path.length - 1] : -1;
    let tx = a.localGoal?.[0], ty = a.localGoal?.[1];
    if (j >= 0) {
      const [ox, oy] = smoothWalker(this.game.catalog.animals[a.sp]) ? pathPoint(w, a, a.path.length - 1).map((v, n) => v - (n ? (j / w.w | 0) : j % w.w) - 0.5) : spotIn(a, j, a.path.length === 1);
      const rest = a.path.length === 1 && a.restSpot?.[0] === j;
      tx = rest ? a.restSpot[1] : j % w.w + 0.5 + ox;
      ty = rest ? a.restSpot[2] : (j / w.w | 0) + 0.5 + oy;
    }
    if (tx == null || ty == null) { a.moveProgress = null; return; }
    [tx, ty] = clearSpot(w, a, this.game.catalog.animals[a.sp], tx, ty); // (where the walk aims: beside a trunk, not on it)
    const distance = Math.hypot(a.x - tx, a.y - ty), p = a.moveProgress;
    if (!p || p.j !== j || p.tx !== tx || p.ty !== ty) {
      a.moveProgress = { j, tx, ty, best: distance, stalled: 0 };
      return;
    }
    if (distance < p.best - 0.04) { p.best = distance; p.stalled = 0; }
    else p.stalled += dt;
    if (p.stalled >= 3) this.recoverMovement(a);
  }

  recoverMovement(a) {
    const w = this.game.world, approaching = a.state === 'approach';
    if (this.game.catalog.animals[a.sp].crossing && inRiver(this, a)) { // (a swimmer jammed in the river: on for the far bank)
      const y0 = Math.floor(a.y);
      if (this.pathTo(a, (j, x, y) => y < y0 - 2 - (a.id % 3) && passable(w, j, a), 4000, null, null, standable)) { a.landed = true; a.moveProgress = null; return; }
    }
    const dest = approaching ? w.idx(Math.floor(a.localGoal[0]), Math.floor(a.localGoal[1])) : a.path[0];
    const tx = dest % w.w + 0.5, ty = (dest / w.w | 0) + 0.5;
    const wasFollowing = a.follow, inTransit = !approaching && a.path.length > 1;
    a.moveProgress = null; a.restSpot = null; a.localGoal = null;
    // A fixed herd slot can be occupied by another animal for years. Let the
    // next herd decision choose a new slot instead of returning to that jam.
    if (wasFollowing) { a.slot = null; a.bachelorSlot = null; a.momSlot = null; }
    const spots = new Map();
    const freeSpot = j => {
      if (!spots.has(j)) {
        if (approaching) spots.set(j, this.bankSpot(a, j));
        else {
          const [ox, oy] = spotIn(a, j, true);
          const [x, y] = this.spacing.restSpot(a, j, ox, oy);
          spots.set(j, { x, y, crowd: this.spacing.crowd(a, x, y) });
        }
      }
      return spots.get(j);
    };
    const goal = (j, x, y) => Math.hypot(x + 0.5 - tx, y + 0.5 - ty) < 4 &&
      (freeSpot(j)?.crowd ?? Infinity) < 0.04;
    // First try walking around occupied transit tiles. If packed in on every
    // side, allow an escape through the crowd; the progress timer still bounds it.
    const clear = j => {
      const [ox, oy] = spotIn(a, j, false);
      return this.spacing.crowd(a, j % w.w + 0.5 + ox, (j / w.w | 0) + 0.5 + oy) < 0.08;
    };
    if (this.pathTo(a, goal, 900, null, clear) || this.pathTo(a, goal, 900)) {
      const j = a.path[0], spot = freeSpot(j);
      a.restSpot = [j, spot.x, spot.y];
      return;
    }
    // Long trips can extend beyond this local search. Step into nearby room,
    // then resume the original journey rather than forgetting the destination.
    if (inTransit && this.pathTo(a, (j, x, y) => Math.hypot(x + 0.5 - a.x, y + 0.5 - a.y) < 4 &&
      freeSpot(j).crowd < 0.04, 300)) {
      const j = a.path[0], spot = freeSpot(j);
      a.restSpot = [j, spot.x, spot.y];
      if (!wasFollowing) a.trip = dest;
      return;
    }
    // No reachable space right now. Rest briefly and make a fresh decision;
    // never leave a failed route running forever or teleport across a barrier.
    a.path = null; a.trip = null; a.follow = false;
    a.state = 'idle'; a.wait = 0.5 + (a.id % 7) * 0.15;
  }

  // Swimming on the reef: a fish doesn't walk from tile centre to tile centre. It holds a heading
  // and turns it gradually toward the next point on its path (each a little off the tile's
  // centre, so a school doesn't line up), speeds up and slows down smoothly, and rounds the
  // corners instead of stopping at them. Returns true once it's close enough to move on.
  swimToward(a, j, sp, dt) {
    const w = this.game.world, last = a.path.length === 1;
    const h1 = hashJitter(j % w.w + a.id * 7, ((j / w.w) | 0) + a.id * 3), h2 = hashJitter(((j / w.w) | 0) - a.id * 5, j % w.w + a.id);
    const tx = (j % w.w) + 0.5 + h1 * 0.7, ty = ((j / w.w) | 0) + 0.5 + h2 * 0.7;
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    // turn toward the point, no faster than a fish can (bigger fish turn wider: turnRate), and up
    // to three times as fast when it has barely any way on, as when it hovers (hoverStep)
    let turn = Math.atan2(dy, dx) - a.heading;
    turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
    const still = 1 - Math.min(1, (a.spd || 0) * dt / Math.max(sp, 1e-6));
    const rate = turnRate(this.game.catalog.animals[a.sp]) * (1 + 2 * still) * dt;
    a.heading += clamp(turn, -rate, rate);
    // ease up to cruising speed, ease off when the point is behind it or it's nearly there
    // (a.spd is in tiles a day, so the motion is the same at any frame rate)
    const want = sp / Math.max(dt, 1e-6) * (0.35 + 0.65 * Math.max(0, Math.cos(turn))) * (last ? clamp(d / 0.9, 0.25, 1) : 1);
    a.spd = (a.spd || 0) + (want - (a.spd || 0)) * Math.min(1, dt * 3);
    // (rounding a corner mustn't carry it up the beach: if it would, it stops, and so turns on the
    // spot toward the point rather than facing it in one step)
    if (!reefStep(w, a, a.spd * dt)) a.spd = 0;
    a.swimT = (a.swimT || 0) + dt;
    if (d < (last ? 0.25 : 0.55) || a.swimT > 4) { a.swimT = 0; return true; } // (or gives up on a point it keeps circling)
    return false;
  }
  glide(a, dt) {
    if (!reefStep(this.game.world, a, a.spd * dt)) a.spd = 0;
    a.spd *= Math.exp(-dt * 2.5);
  }

  stepToward(a, tx, ty, sp) {
    const def = this.game.catalog.animals[a.sp];
    [tx, ty] = clearSpot(this.game.world, a, def, tx, ty);
    let dx = tx - a.x, dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    // A reef fish never slides sideways at a target (hunting, leaving): it turns its nose toward
    // it, no faster than a fish can, and swims along its heading, easing off in a tight turn.
    if (this.game.catalog.animals[a.sp].reef && d > sp && sp > 0) {
      let turn = Math.atan2(dy, dx) - a.heading;
      turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
      const rate = sp * 3.5; // (a turning circle: so much turn for each tile it swims)
      a.heading += clamp(turn, -rate, rate);
      const step = sp * Math.max(0.25, Math.cos(turn));
      reefStep(this.game.world, a, step);
      return Math.hypot(tx - a.x, ty - a.y) <= sp;
    }
    // (curve round a trunk or log ahead rather than walking into it)
    if (d > 0.02 && sp > 0) { const h = steerAround(this.game.world, a, def, Math.atan2(dy, dx), Math.min(d, 1.6)); dx = Math.cos(h) * d; dy = Math.sin(h) * d; }
    const was = a.heading;
    if (d > 0.02 && sp > 0) facePoint(a, a.x + dx, a.y + dy);
    const step = Math.min(d, sp);
    let nx = d ? a.x + dx / d * step : a.x, ny = d ? a.y + dy / d * step : a.y;
    if (this.game.catalog.animals[a.sp].reef && !reefMoveSafe(this.game.world, a, nx, ny)) return false;
    // (a river fish keeps to water it can swim in: it may only move into the shallows to get out of
    // them, and across water as shallow as where it is: a catfish crossing a level marsh to a pool)
    if (a.move === 'swim' && !def.reef && d > 0) {
      const w = this.game.world, here = swimDepth(w, a.x, a.y), need = fishDepth(def), swims = (x, y) => { const t = swimDepth(w, x, y); return t >= need || t > here || here < need && t >= here; };
      if (!swims(nx, ny)) {
        // it follows the channel round a shallow bar: the nearest heading either side that keeps to
        // swimmable water. Held up half a day all the same (a creek running downhill is a staircase
        // of pools, shallow at each lip: swimDepth), it hops the lip to the first swimmable water
        // within a third of a tile ahead, as trout and salmon leap a riffle; it never rests in the
        // shallows, where steering.js would put it back in the pool behind. Without this, fish
        // pressed against one lip for years and the ones behind piled up at it.
        const h0 = Math.atan2(dy, dx), ux = Math.cos(h0), uy = Math.sin(h0);
        let found = false;
        if (a.moveProgress?.stalled > 0.5) for (let t = step; !found && t <= Math.max(step, 0.35); t += 0.05) {
          if (swimDepth(w, a.x + ux * t, a.y + uy * t) >= need) { nx = a.x + ux * t; ny = a.y + uy * t; found = true; }
        }
        // (the side it went round last time first: trying left then right afresh each step, a fish
        // along a lip went left one step and right the next, its heading flipping half round a frame)
        const side = a.detour || 1;
        for (let k = 0; !found && k < 6; k++) {
          const s = k & 1 ? -side : side, turn = (k >> 1) * 0.5 + 0.5, x = a.x + Math.cos(h0 + s * turn) * step, y = a.y + Math.sin(h0 + s * turn) * step;
          if (swims(x, y)) { nx = x; ny = y; found = true; a.detour = s; }
        }
        if (!found) { a.heading = was; return false; } // (no way round: it stays as it was, not nosing at the bank)
        facePoint(a, nx, ny); // (nose first round the bar: facing the target, it slid sideways along the bank)
      }
    }
    if (a.move !== 'fly' && !swimmer(a, this.game.catalog) && !a.leaving) {
      const w = this.game.world, x0 = Math.floor(a.x), y0 = Math.floor(a.y);
      // (an animal stranded where it can't stand, say in a pond, may still move about its own tile
      // and step out of it: otherwise every step lands in the same tile and it freezes there)
      // (and the migration swims the river at the crossing, walking in from beyond the map's edge)
      const crosser = !!this.game.catalog.animals[a.sp].crossing;
      const can = (xx, yy) => !w.inb(xx, yy) ? crosser && !w.inb(x0, y0) : passable(w, w.idx(xx, yy), a) || (crosser && w.terrain[w.idx(xx, yy)] === T.RIVER);
      const safe = (x, y) => {
        const xx = Math.floor(x), yy = Math.floor(y);
        return (can(xx, yy) || (xx === x0 && yy === y0)) && (xx === x0 || yy === y0 || can(xx, y0) && can(x0, yy));
      };
      if (!safe(nx, ny)) {
        // Tile offsets and spacing can turn an orthogonal route into a diagonal
        // corner cut. Slide along its open side; never step into the obstruction.
        if (Math.abs(dx) > 0.001 && safe(nx, a.y)) a.x = nx;
        else if (Math.abs(dy) > 0.001 && safe(a.x, ny)) a.y = ny;
        return false;
      }
    }
    const fromX = a.x, fromY = a.y;
    a.x = nx; a.y = ny;
    resolveStep(this, a, def, fromX, fromY);
    return d <= sp;
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
    if (a.flying || !shallows(w, w.idx(x0, y0))) return !!fisher && !fishFed(a) && this.toShallows(a, def);
    const hungry = !!fisher && !fishFed(a);
    if (simRandom() < (hungry ? 0.8 : 0.55)) {
      // (a hungry heron stands and strikes every day or so; a fed one stands longer, and strikes
      // only when it is hungry again: fishing.js)
      a.wait = hungry ? 0.8 + simRandom() * 1.2 : 3 + simRandom() * 6;
      if (simRandom() < (fisher ? 0.7 : 0.45) && (hungry || !fisher)) {
        a.drinkT = 1 + simRandom(); // head down: a strike at a fish or frog
        const bank = this.bankSpot(a);
        if (bank) { a.drinkAt = bank.water; facePoint(a, ...bank.water); }
        // (at the water beside it, or at its feet where it stands in the marsh or the creek)
        const at = bank ? bank.water : isWater(w.terrain[w.idx(x0, y0)]) ? [a.x + Math.cos(a.heading) * 0.35, a.y + Math.sin(a.heading) * 0.35] : null;
        if (fisher && at && fishStrike(this, a, def, at[0], at[1], fisher)) { a.drinkT = 0; a.drinkAt = null; a.wait = 0; }
      }
      return true;
    }
    const ok = this.pathTo(a, (j, x, y) => shallows(w, j) && Math.hypot(x - x0, y - y0) >= 1.5 && simRandom() < 0.35, 90);
    if (ok) { a.wade = true; a.alt = 0; }
    return ok;
  }

  // Shallows beside water that holds fish, within a short flight.
  toShallows(a, def) {
    const w = this.game.world, x0 = Math.floor(a.x), y0 = Math.floor(a.y);
    let best = -1, bd = Infinity;
    for (let k = 0; k < 50; k++) {
      const x = x0 + Math.round((simRandom() * 2 - 1) * 10), y = y0 + Math.round((simRandom() * 2 - 1) * 10);
      if (!w.inb(x, y)) continue;
      const j = w.idx(x, y);
      if (!shallows(w, j) || !canLand(w, j, def) || w.fire[j] || !(w.waterQ[j] > 0.3 || w.distWater[j] <= 1)) continue;
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

  // -------------------------------------------------------------- introductions
  canIntroduce(def, x, y) {
    const w = this.game.world;
    if (!w.inb(x, y)) return 'Off the property.';
    const i = w.idx(x, y);
    if (!passable(w, i, def) || !canLand(w, i, def) || (def.move === 'swim' && !isWater(w.terrain[i]))) return def.move === 'swim' ? 'Fish need to be released into water.' : 'They can\'t be released here.';
    this.computeSuitability();
    const st = this.state[def.index];
    if (st.K < def.minK * 0.8) return `There isn't enough habitat yet (room for ${st.K.toFixed(1)}; needs ${def.minK}). ${def.hint}`;
    return null;
  }

  introduce(def, x, y) {
    const n = Math.max(def.groupSize[1], 2);
    const out = [];
    for (let k = 0; k < n; k++) {
      const pos = k === 0 ? [x, y] : (this.randomPassableNear(def, x, y, 1) || [x, y]);
      out.push(this.spawn(def, pos[0], pos[1], { silent: true }));
    }
    return out;
  }

  // -------------------------------------------------------------- persistence
  serialize() {
    return {
      agents: this.agents.map(({ moveProgress, pushX, pushY, course, woodLost, squeeze, trampled, dodge, dodgeOff, fleeHd, jink, settleKey, headUp, headUpKey, detour, ...a }) => saved({ ...a, territory: a.territory ? { ...a.territory } : a.territory, dormancy: a.dormancy ? { ...a.dormancy } : a.dormancy, range: a.range ? { ...a.range, route: a.range.route?.slice() } : a.range, home: a.home ? { ...a.home, waterRoute: a.home.waterRoute?.slice() } : a.home, path: null })),
      nextId: this.nextId,
      state: this.state.map(s => ({ discovered: s.discovered, lastYear: s.lastYear, blockedNotified: s.blockedNotified, births: s.births })),
      salmon: this.salmon, dams: this.dams,
    };
  }
  load(d) {
    this.spacingDirty = true;
    this.risk = null; // (a few weeks' memory of danger, not saved)
    this.carcasses = [];
    this.flyovers = []; this.passageWait = 8 + simRandom() * 10;
    this.agents = d.agents.map(oldFacing).map(a => Object.assign(new Animal(), a, { territory: a.territory ? { ...a.territory } : undefined, dormancy: a.dormancy ? { ...a.dormancy } : undefined, range: a.range ? { ...a.range, route: a.range.route?.slice() } : undefined, home: a.home ? { ...a.home, waterRoute: a.home.waterRoute?.slice() } : undefined, moveProgress: null, fruitGoal: null, forageGoal: null, forage: null, state: a.state === 'walk' || a.state === 'forage' ? 'idle' : a.state, greet: null, socialWith: null, socialUntil: 0,
      wait: a.state === 'idle' ? Math.max(0.5, a.drinkT || 0) : 0.5,
      passing: undefined })); // (only flyovers pass over; older saves have monarchs marked so by mistake, which broke drawing)
    this.nextId = d.nextId;
    d.state.forEach((s, k) => { if (this.state[k]) Object.assign(this.state[k], s); });
    this.salmon = d.salmon; this.dams = d.dams;
    this.recount();
  }
}

// Where in tile j this animal walks: a small sideways offset of its own on the way through, and
// a spot of its own anywhere in the tile when it's the last one (same tile, same spot, so it
// doesn't shuffle about while standing).
function spotIn(a, j, last) {
  if (!last) return [hashJitter(a.id, 3.7) * 0.4, hashJitter(a.id, 9.1) * 0.4];
  return [hashJitter(j + a.id * 13, a.id) * 0.9, hashJitter(a.id * 7, j - a.id) * 0.9];
}

// world.marks bits under a beaver pool (1, 2, 4 and 8 are taken by trails, reef stars, canal blocks and shade cloth; 64 is PLACED)
const POOL_CREEK = 16, POOL_LAND = 32;
function hashJitter(x, y) {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (h - Math.floor(h)) * 0.8 - 0.4;
}

function floodTile(w, j, terrain, rng) {
  w.terrain[j] = terrain;
  if (w.feature[j] === F.FENCE || w.feature[j] === F.ROCKS || w.feature[j] === F.BRUSH) w.feature[j] = 0;
  if (w.tree[j]) {
    const p = w.catalog.plants[w.tree[j]];
    if (!(p.wetOK && terrain !== T.MARSH)) removeTree(w, j, 'flood', rng);
  }
  if (w.shrub[j] && !w.catalog.plants[w.shrub[j]].wetOK) { w.shrub[j] = 0; w.shrubG[j] = 0; }
  if (w.ground[j] && terrain === T.MARSH && !w.catalog.plants[w.ground[j]].wetOK && !w.catalog.plants[w.ground[j]].aquatic) { w.ground[j] = 0; w.groundG[j] = 0; }
  w.soil[j] = Math.max(w.soil[j], 0.35);
}
