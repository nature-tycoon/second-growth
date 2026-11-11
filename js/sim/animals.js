// Wildlife: individual animals wander their habitat, breed when there's room,
// die when there isn't, hunt, migrate in from the surroundings, and (beavers) re-engineer the land.


import { clamp } from '../config.js';
import { AnimalSpacing } from './animal-positioning.js';
import { fleeUpdate, updateVigilance, playUpdate, sparUpdate, arrive, fleeFire } from './animal-life.js';
import { birdArrive, birdUpdate, carryUpdate } from './bird-behavior.js';
import { fishUpdate, fishing, fishFed } from './fishing.js';
import { cervidNeedsRejoin } from './cervid-groups.js';
import { primateUpdate } from './primate-behavior.js';
import { forageArrive, forageUpdate } from './animal-foraging.js';
import { travelSpeed } from './climb-pace.js';
import { hoverStep } from './animal-territory.js';
import { updateDormancy } from './animal-dormancy.js';
import { settle, aimDrink } from './steering.js';
import { recordTrailStep, rangePaces } from './animal-trails.js';
import { updatePassage } from './bird-passage.js';
import { passable, canLand, WADERS, shallows } from './animal-terrain.js';
import { simRandom, useSimRandom } from './sim-random.js';
import { WildlifePopulation } from './wildlife-population.js';
import { WildlifeSalmon } from './wildlife-salmon.js';
import { WildlifeBeavers } from './wildlife-beavers.js';
import { WildlifeIntent } from './wildlife-intent.js';
import { WildlifeWater } from './wildlife-water.js';
import { WildlifeMove } from './wildlife-move.js';
import { Animal, standable } from './wildlife-shared.js';
export { passable, canLand } from './animal-terrain.js';
export { inRiver } from './wildlife-shared.js';
export { SALMON_RUN_MONTH, SALMON_MIN_HABITAT } from './wildlife-salmon.js';
export { migrationFenceCount, arrivalFinding } from './wildlife-population.js';

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

// Wildlife's methods by concern, in decision 0025's order: intent (wildlife-intent.js, with water
// trips in wildlife-water.js), steer and move (wildlife-move.js), then spacing and settle in update
// above; numbers, the salmon run and beavers apart. Each part is a class whose methods are copied
// onto Wildlife, so every caller still says wl.stepToward(...), wl.chooseTarget(...).
for (const part of [WildlifePopulation, WildlifeSalmon, WildlifeBeavers, WildlifeIntent, WildlifeWater, WildlifeMove]) {
  for (const [name, d] of Object.entries(Object.getOwnPropertyDescriptors(part.prototype))) if (name !== 'constructor') Object.defineProperty(Wildlife.prototype, name, d);
}
