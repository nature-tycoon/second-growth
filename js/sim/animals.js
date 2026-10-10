// Wildlife: individual animals wander their habitat, breed when there's room,
// die when there isn't, hunt, migrate in from the surroundings, and (beavers) re-engineer the land.

import { STRUCTURES } from '../world.js';
import { T, F, isWater, clamp, DAYS_PER_YEAR } from '../config.js';
import { ANIMALS, ANIMAL, many, cap, preyFor, preyPer, isMaleVariant } from '../data/animals.js';
import { PLANTS } from '../data/plants.js';
import { killTree } from './plants.js';
import { biome } from '../biome.js';
import { moment, momentFree } from './moments.js';
import { browseSapling, predationCatchChance, preyCover, hungryPredator, foodDeparture } from './ecological-pressure.js';
import { AnimalSpacing, facePoint, shoreSpot } from './animal-positioning.js';
import { canStartHunt, beginHunt, endHunt, huntStep, startFeed, missed, fleeUpdate, playUpdate, sparUpdate, watch, prowl, scavenge, play, greet, harem, haremDay, arrive, fleeFire, socialHold } from './animal-life.js';
import { birdChoose, birdArrive, birdUpdate } from './bird-behavior.js';
import { cervidLeader, keepCervidGroup, followCervid, inRut, cervidNeedsRejoin } from './cervid-groups.js';
import { updatePassage } from './bird-passage.js';


let stamp = null, parent = null, bfsQ = null, depth = null, stampN = 1;

// Herons and cranes spend most of their time on foot in the shallows, not in the air.
const WADERS = new Set(['heron', 'crane']);
// Animals that swim in open water move in any direction, diagonals too (river fish, and everything on the reef).
const swimmer = a => a.move === 'swim' || !!ANIMALS[a.sp]?.reef;
const shallows = (w, i) => { const t = w.terrain[i]; return t === T.MARSH || t === T.CREEK || t === T.MUD || (w.distWater[i] === 1 && !isWater(t)); };

// Flight can cross any terrain; landing needs land, a perch, or suitable water.
export function canLand(w, i, def) {
  if (def.move !== 'fly' || !isWater(w.terrain[i])) return true;
  const kind = def.sprite.kind;
  if (kind === 'duck' || kind === 'booby' || def.group === 'Seabirds') return true;
  if (WADERS.has(kind)) return shallows(w, i);
  return !!(w.tree[i] && w.treeG[i] > 0.5);
}

export const SALMON_RUN_MONTH = 7;
export const SALMON_MIN_HABITAT = 15;
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

export function passable(w, i, a) {
  const move = a.move;
  if (move === 'fly') return true;
  // tree dwellers (monkeys, sloths) travel through connected canopy only
  if (move === 'tree') return !!(w.tree[i] && w.treeG[i] > 0.45) || w.feature[i] === F.SNAG;
  if (w.struct[i] >= 0) return false;
  if (biome.dryLand && ANIMAL[a.key]?.reef && biome.dryLand(w, i)) return false; // (reef animals stay in the sea, off the cay)
  const t = w.terrain[i];
  if (move === 'swim') return isWater(t) && w.feature[i] !== F.CULVERT;
  if (move === 'semi') return true;
  if (t === T.POND || t === T.RIVER) return false;
  if (w.feature[i] === F.FENCE && ANIMAL[a.key]?.fenced) return false; // big grazers can't cross fences
  return true;
}

// Young that stay close beside their mother, and for how many years (never past adulthood):
// bear cubs for a year and a half, fawns and calves through their first year, elephant calves for years.
// (Rodents, rabbits and birds raise their young in a nest or burrow instead.)
const WITH_MOM = {
  deer: 0.8, elk: 1, bear: 1.5, cougar: 1.2, bobcat: 0.7, raccoon: 0.6, coyote: 0.5, beaver: 1.5, otter: 0.8,
  wildebeest: 0.8, zebra: 1, gazelle: 0.5, impala: 0.5, giraffe: 1.2, elephant: 3, buffalo: 1, warthog: 0.5, rhino: 2,
  hippo: 1.5, lion: 1.5, cheetah: 1.5, leopard: 1.5, hyena: 1, ostrich: 0.6,
  jaguar: 1.5, ocelot: 1, peccary: 0.5, tapir: 1, capybara: 0.5, anteater: 0.8, giantotter: 0.8,
};

export class Wildlife {
  constructor(game) {
    this.game = game;
    this.agents = [];
    this.flyovers = [];
    this.passageWait = 8 + Math.random() * 10;
    this.spacing = new AnimalSpacing();
    this.carcasses = []; // kills being eaten (drawn, and visited by scavengers; not saved)
    this.nextId = 1;
    this.state = ANIMALS.map(() => ({ pop: 0, K: 0, suitSum: 0, discovered: false, lastYear: 0, blockedNotified: false, births: 0 }));
    this.suit = ANIMALS.map(() => new Float32Array(game.world.n));
    this.salmon = { fry: {}, spawners: 0, juveniles: 0, everSpawned: false };
    this.dams = 0;
    this.g = { fishIndex: 0, frogIndex: 0, snagCount: 0, nestboxCount: 0, structureCount: 0, berryTiles: 0,
      forestTiles: 0, matureTiles: 0, meadowTiles: 0, bigTrees: 0, cleanWater: 0, salmonBonus: 0 };
  }

  // -------------------------------------------------------------- population bookkeeping
  get viewAgents() { return this.agents.concat(this.flyovers); }
  findAgent(id) { return this.agents.find(a => a.id === id) || this.flyovers.find(a => a.id === id); }
  hasAgent(a) { return this.agents.includes(a) || this.flyovers.includes(a); }
  count(key) {
    const k = ANIMAL[key].index;
    let c = 0;
    for (const a of this.agents) if (a.sp === k && !a.leaving) c++;
    return c;
  }

  recount() {
    for (const s of this.state) s.pop = 0;
    for (const a of this.agents) if (!a.leaving) this.state[a.sp].pop++;
    let f = 0;
    for (const a of ANIMALS) if (a.frugivore) f += this.state[a.index].pop;
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
    for (const a of ANIMALS) {
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
    g.structureCount = w.structures.filter(s => s && STRUCTURES[s.type]?.roost).length;
    g.berryTiles = st.berry || 0;
    g.forestTiles = st.forest || 0;
    g.matureTiles = st.mature || 0;
    g.meadowTiles = st.meadow || 0;
    g.bigTrees = st.bigTrees || 0;
    g.stats = st; // (map-specific counts, e.g. the suburb's canopy network)
    const m = this.game.month;
    g.salmonBonus = (m >= 7 && m <= 9) ? Math.min(0.6, this.salmon.spawners / 10) : this.salmon.everSpawned ? 0.1 : 0;
  }

  computeSuitability() {
    const w = this.game.world;
    this.updateGlobals();
    for (const def of ANIMALS) {
      const map = this.suit[def.index];
      let sum = 0, calmSum = 0, rawSum = 0, salmonHabitat = 0;
      // The river is the neighbours' habitat: animals pass through it, but it counts little toward what lives here.
      const shy = def.shy, onLand = def.move === 'ground';
      for (let i = 0; i < w.n; i++) {
        const raw = def.suit(w, i);
        let calm = raw;
        let s = raw * (1 - shy * w.disturb[i]);
        if (w.fire[i]) s = 0;
        else if (w.flood[i] && onLand) s *= 0.15;
        if (w.fire[i]) calm = 0;
        else if (w.flood[i] && onLand) calm *= 0.15;
        map[i] = s;
        const weight = w.terrain[i] === T.RIVER ? 0.12 : 1;
        sum += s * weight; calmSum += calm * weight; rawSum += raw * weight;
        if (def.special === 'salmon' && s > 0.25 && w.terrain[i] === T.CREEK) salmonHabitat++;
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
      const diet = preyFor(def, this.game);
      if (diet) {
        let prey = 0;
        for (const pk of diet) if (ANIMAL[pk]) prey += this.state[ANIMAL[pk].index].pop;
        st.preyK = prey / preyPer(def, this.game);
        K = Math.min(K, st.preyK);
      }
      // species it lives off without hunting (vultures follow the herds, dung beetles their dung)
      if (def.needs) {
        let host = 0;
        for (const hk of def.needs) if (ANIMAL[hk]) host += this.state[ANIMAL[hk].index].pop;
        st.hostK = host / def.needsPer;
        K = Math.min(K, st.hostK);
      }
      // The spawning run uses qualifying creek tiles, rather than the ordinary capacity rule.
      if (def.special === 'salmon') { st.salmonHabitat = salmonHabitat; K = salmonHabitat / def.hr; }
      st.K = Math.min(def.max, K);
    }
  }

  // -------------------------------------------------------------- spawning
  spawn(def, x, y, opts = {}) {
    const id = this.nextId++, [ox, oy] = spotIn({ id }, x * 977 + y, true); // (not all on one point: a litter, a flock released together)
    const a = {
      id, sp: def.index, key: def.key, move: def.move,
      x: x + 0.5 + ox, y: y + 0.5 + oy, tx: x + 0.5, ty: y + 0.5, path: null,
      state: 'idle', wait: Math.random() * 2, age: opts.age ?? def.mature * DAYS_PER_YEAR * (1 + Math.random() * 2),
      facing: Math.random() < 0.5 ? -1 : 1, phase: Math.random() * 10, hunger: Math.random() * 3,
      flying: false, alt: 0, leaving: false, spawner: !!opts.spawner, juvenile: !!opts.juvenile,
    };
    a.orientation = a.phase * Math.PI / 5; // an initial direction without another random draw
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
      const xx = Math.round(x + (Math.random() * 2 - 1) * r), yy = Math.round(y + (Math.random() * 2 - 1) * r);
      if (!w.inb(xx, yy)) continue;
      const i = w.idx(xx, yy);
      if (passable(w, i, def) && canLand(w, i, def) && (def.move !== 'swim' || isWater(w.terrain[i]))) return [xx, yy];
    }
    return null;
  }

  // Try to bring a group of this species in from one of its source edges.
  immigrate(def, n, returning = false) {
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
    this.crossingAt = { x: cx, until: this.game.day + 12 }; // the crocodiles know
    const lag = rng() * 4; // groups that arrive the same month string out along the crossing
    for (let k = 0; k < n; k++) {
      // a loose crowd: bunched in the middle, stragglers out to the sides and well behind
      const spread = (rng() + rng() + rng() - 1.5) * 5.5;
      const x = clamp(cx + Math.round(spread), 0, w.w - 1);
      const a = this.spawn(def, x, w.h - 1);
      a.x = x + 0.1 + rng() * 0.8; a.y = w.h + 1 + lag + rng() * 7 + k * 0.18;
      a.pace = 0.8 + rng() * 0.45;
      const path = [];
      for (let y = Math.max(0, bank - 3 - Math.floor(rng() * 3)); y <= w.h - 1; y++) path.push(w.idx(x, y));
      a.path = path; a.state = 'walk'; a.wait = 0; a.landed = true;
    }
    if (n >= 6 && momentFree(this.game)) moment(this.game, 'crossing', { x: cx + 0.5, y: bank + 2.5 });
    return n;
  }

  bestTileSample(def, x, y, r, n) {
    const w = this.game.world, map = this.suit[def.index];
    let best = [clamp(x, 0, w.w - 1), clamp(y, 0, w.h - 1)], bs = -1;
    for (let k = 0; k < n; k++) {
      const xx = Math.round(x + (Math.random() * 2 - 1) * r), yy = Math.round(y + (Math.random() * 2 - 1) * r);
      if (!w.inb(xx, yy)) continue;
      if (!canLand(w, w.idx(xx, yy), def)) continue;
      const s = map[w.idx(xx, yy)] * (0.6 + 0.4 * Math.random());
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
  monthly() {
    const game = this.game, rng = game.rng, m = game.month;
    this.recount();
    this.computeSuitability();

    // migrants coming and going this month, announced together below
    const left = [], back = [];
    for (const def of ANIMALS) {
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
        const adults = mine.filter(a => a.age >= def.mature * DAYS_PER_YEAR && !hungryPredator(game, a, def));
        const mothers = def.familyHerd ? adults.filter(a => !isMaleVariant(def, a)) : adults;
        const pairs = def.familyHerd ? (adults.length > mothers.length ? mothers.length : 0) : Math.floor(adults.length / 2);
        for (let p = 0; p < pairs && pop < K * 1.15; p++) {
          if (rng() > 0.75 * (1 - pop / Math.max(K, 1))) continue;
          const parentA = def.familyHerd ? mothers.splice(Math.floor(rng() * mothers.length), 1)[0] : mothers[Math.floor(rng() * mothers.length)];
          const n = def.litter[0] + Math.floor(rng() * (def.litter[1] - def.litter[0] + 1));
          for (let k = 0; k < n; k++) {
            const pos = this.randomPassableNear(def, parentA.x - 0.5, parentA.y - 0.5, 1) || [Math.floor(parentA.x), Math.floor(parentA.y)];
            const young = this.spawn(def, pos[0], pos[1], { age: 0 });
            if (WITH_MOM[def.key]) young.mom = parentA.id;
            pop++; st.births++;
          }
          if (st.births === n) game.notify(`${cap(many(def))} have raised young here for the first time!`, 'good', parentA);
        }
      }

      // deaths and departures
      const over = pop > K * 1.1 ? (pop - K) / pop : 0;
      for (const a of mine) {
        if (hungryPredator(game, a, def) && rng() < 0.2) {
          this.leave(a); foodDeparture(game, a); pop--; continue;
        }
        let p = 1 / (def.life * 12);
        if (over) p += 0.3 * over;
        if (K < 0.5) p += 0.12;
        if (a.age > def.life * DAYS_PER_YEAR * 1.3) p += 0.35;
        if (rng() < p) {
          // most "deaths" when habitat is poor are really animals moving on
          if (K < def.minK || rng() < 0.4) this.leave(a);
          else this.remove(a, 'natural');
          pop--;
        }
      }

      // immigration: a species has to find new habitat first, so the odds build up over the months
      // it stays good (and a returning migrant population always knows the way)
      st.ready = K >= def.minK ? (st.ready || 0) + 1 : 0;
      if (K >= def.minK && pop < K) {
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
      const lt = biome.text?.migrantsLeave; // (a map where migrants leave at a different time of year, like the reef's winter mantas)
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
      const returns = Math.round((S.fry[year - 3] || 0) * 0.025);
      const strays = Math.floor(rng() * 3) + 1;
      const n = Math.min(def.max, Math.max(1, Math.min(Math.ceil(st.K), strays + returns)));
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
    const game = this.game, w = game.world, bear = ANIMAL.bear;
    this.salmonRun = { from: game.day, until: game.day + 22, shown: false };
    if (!bear) return;
    const fish = this.agents.filter(a => ANIMALS[a.sp].special === 'salmon');
    const f = fish[fish.length - 1];
    const have = this.agents.filter(a => a.sp === bear.index && !a.leaving).length;
    for (let k = have; k < 2 && f; k++) {
      // arrive out of cover a little way from the creek, so they're soon on the bank
      const ang = Math.random() * Math.PI * 2, r = 9 + Math.random() * 5;
      const pos = this.randomPassableNear(bear, clamp(Math.round(f.x + Math.cos(ang) * r), 1, w.w - 2), clamp(Math.round(f.y - 8 + Math.sin(ang) * r), 1, w.h - 8), 4);
      if (!pos) continue;
      const b = this.spawn(bear, pos[0], pos[1], { silent: true });
      b.visit = true;
    }
  }

  // A bear at the salmon run: go to the bank nearest a running fish, stand and watch the water,
  // and now and then snatch one.
  fishSalmon(a) {
    const w = this.game.world;
    const fish = this.agents.filter(o => ANIMALS[o.sp].special === 'salmon' && !o.leaving);
    if (!fish.length) return false;
    let f = fish[0], bd = Infinity;
    for (const o of fish) { const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2; if (d < bd) { bd = d; f = o; } }
    const x0 = Math.floor(a.x), y0 = Math.floor(a.y);
    if (w.inb(x0, y0) && w.distWater[w.idx(x0, y0)] <= 1 && bd < 16) {
      a.wait = 2.5 + Math.random() * 4; a.drinkT = 1.2 + Math.random(); // head down over the water
      a.drinkAt = [f.x, f.y]; facePoint(a, f.x, f.y);
      if (this.salmonRun && !this.salmonRun.shown && this.game.day - this.salmonRun.from >= 1 && momentFree(this.game)) { this.salmonRun.shown = moment(this.game, 'salmon', a) || true; }
      if ((this.game.diff.ecology ? this.game.rng() : Math.random()) < predationCatchChance(this.game, f, ANIMALS[a.sp], 0.08) && bd < 4) {
        if (this.game.diff.ecology) a.hunger = 0;
        this.game.onPredation(a, f); this.remove(f, 'predation');
      }
      return true;
    }
    return this.pathTo(a, (j, x, y) => w.distWater[j] === 1 && (x - f.x) ** 2 + (y - f.y) ** 2 < 6, 4000);
  }

  immigrateSalmon(def) {
    const w = this.game.world;
    const opts = [];
    for (let x = 0; x < w.w; x++) for (let y = w.h - 1; y > w.h - 6; y--) {
      const i = w.idx(x, y);
      if (w.terrain[i] === T.RIVER && w.connected[i]) {
        // prefer river tiles close to a connected creek mouth
        if (y > 0 && w.terrain[i - w.w] === T.CREEK) opts.push(i, i, i, i);
        else if (Math.random() < 0.1) opts.push(i);
      }
    }
    if (!opts.length) return 0;
    const i = opts[Math.floor(Math.random() * opts.length)];
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
    const def = ANIMALS[a.sp], w = this.game.world;
    const edge = def.sources[Math.floor(Math.random() * def.sources.length)];
    if (a.move === 'swim' || (edge === 'S' && a.move !== 'fly')) { a.tx = a.x; a.ty = w.h + 2; }
    else if (edge === 'N') { a.tx = a.x + (def.herd ? (Math.random() - 0.5) * 10 : 0); a.ty = -3; }
    else if (edge === 'S') { a.tx = a.x; a.ty = w.h + 3; }
    else if (edge === 'E') { a.tx = w.w + 3; a.ty = a.y; }
    else { a.tx = -3; a.ty = a.y; }
    a.state = 'leave'; a.path = null;
    for (const o of this.agents) if (o.mom === a.id && !o.leaving) { this.leave(o); o.tx = a.tx + (Math.random() - 0.5); o.ty = a.ty + (Math.random() - 0.5); }
    if (def.herd) { a.leaveWait = Math.random() * 6; a.pace = 0.75 + Math.random() * 0.5; } // a herd moves off in dribs and drabs
    if (a.move === 'fly') { a.flying = true; }
  }

  // -------------------------------------------------------------- daily behaviour
  daily() {
    const game = this.game, w = game.world, rng = game.rng, ecology = !!game.diff.ecology;
    // trodden ground: where the big grazers walk day after day, a trail wears into the land
    // (how worn each tile is, fading slowly when they stop coming; drawn by the terrain)
    const trod = w.trod || (w.trod = new Float32Array(w.n));
    for (let i = 0; i < w.n; i++) {
      if (trod[i] > 0) trod[i] = trod[i] < 0.01 ? 0 : trod[i] * 0.985;
      if (ecology && w.browseDamage?.[i] > 0) w.browseDamage[i] = w.browseDamage[i] < 0.001 ? 0 : w.browseDamage[i] * 0.94;
    }
    this.ids = new Map(this.agents.map(a => [a.id, a]));
    haremDay(this);
    for (const a of this.agents.slice()) {
      if (a.leaving) continue;
      const def = ANIMALS[a.sp];
      const x = Math.floor(a.x), y = Math.floor(a.y);
      if (!w.inb(x, y)) continue;
      const i = w.idx(x, y);
      a.hunger += 1;

      const diet = preyFor(def, game);
      if (diet && canStartHunt(a) && a.hunger > 7 && rng() < 0.4) this.startHunt(a, def, diet);

      if (def.damBuilder) this.beaverDay(a, x, y, i);
      else if (def.browseRate && a.state === 'idle') {
        const s = w.shrub[i];
        if (s && !PLANTS[s].invasive && w.shrubG[i] > 0.3) w.shrubG[i] -= def.browseRate;
        // (a sapling set in the fence line is out of reach, behind the wire)
        if (ecology) browseSapling(game, a, def);
        else if (w.tree[i] && w.treeG[i] < 0.4 && w.feature[i] !== F.FENCE) w.treeG[i] = Math.max(0.05, w.treeG[i] - 0.01);
      }
      // On the savanna the herds nibble and trample woody seedlings wherever they feed, which
      // (with fire) is what keeps the plains open grassland instead of thornbush.
      if (biome.savanna && def.move === 'ground' && !def.prey && (def.sprite.len || 0) >= 20) this.trample(w, x, y, rng);
      if (def.move === 'ground' && !def.prey && (def.sprite.len || 0) >= 24) trod[i] = Math.min(1, trod[i] + 0.05);
    }
  }

  trample(w, x, y, rng) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!w.inb(x + dx, y + dy) || rng() > 0.3) continue;
      const j = w.idx(x + dx, y + dy);
      if (w.tree[j] && w.treeG[j] < 0.3 && (w.treeG[j] -= 0.08) <= 0) { w.tree[j] = 0; w.treeG[j] = 0; w.treeAge[j] = 0; }
      if (w.shrub[j] && w.shrubG[j] < 0.3 && (w.shrubG[j] -= 0.08) <= 0) { w.shrub[j] = 0; w.shrubG[j] = 0; }
    }
  }

  startHunt(a, def, diet = preyFor(def, this.game)) {
    if (!canStartHunt(a)) return;
    let best = null, bd = 12 * 12;
    const preySet = new Set(diet.map(k => ANIMAL[k].index));
    for (const b of this.agents) {
      if (!preySet.has(b.sp) || b.leaving) continue;
      if (this.game.diff.ecology && def.move !== 'fly' && (b.flying || b.alt > 0.2)) continue;
      const d = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    if (best) {
      a.bird = null; a.birdGoal = null; a.birdGround = false;
      a.state = 'hunt'; a.target = best.id; a.huntTime = 5; a.path = null; a.assist = false; a.drinkT = 0; a.drinkAt = null;
      if (a.move === 'fly') a.flying = true;
      beginHunt(this, a, def, best);
    }
  }

  evadeHunt(a, predator) {
    const w = this.game.world, def = ANIMALS[a.sp], pd = ANIMALS[predator.sp];
    const x = Math.floor(a.x), y = Math.floor(a.y);
    const distance = (a.x - predator.x) ** 2 + (a.y - predator.y) ** 2;
    let best = -1, score = -Infinity;
    // Only evaluate neighbouring tiles after a failed catch: no extra pathfinding
    // or searches in the ordinary per-frame movement loop.
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || !w.inb(x + dx, y + dy)) continue;
      const j = w.idx(x + dx, y + dy);
      if (!passable(w, j, def) || !canLand(w, j, def)) continue;
      if (dx && dy && def.move !== 'fly' && (!w.inb(x + dx, y) || !w.inb(x, y + dy) || !passable(w, w.idx(x + dx, y), def) || !passable(w, w.idx(x, y + dy), def))) continue;
      const d = (x + dx + 0.5 - predator.x) ** 2 + (y + dy + 0.5 - predator.y) ** 2;
      if (d <= distance) continue;
      const s = d + preyCover(w, { sp: a.sp, x: x + dx, y: y + dy }, pd) * 2;
      if (s > score) { best = j; score = s; }
    }
    if (best < 0) return;
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
        if (s && PLANTS[s].beaverFood && w.shrubG[j] > 0.35) { w.shrubG[j] = 0.15; break; } // coppiced, will resprout
        if (t && PLANTS[t].beaverFood && w.treeG[j] > 0.25) {
          if (w.treeG[j] < 0.75) { w.tree[j] = 0; w.treeG[j] = 0; w.treeAge[j] = 0; }
          else if (rng() < 0.25) killTree(w, j, rng);
          break;
        }
      }
    }
    // build a dam
    const pop = this.state[a.sp].pop;
    if (pop >= 2 && rng() < 0.06 && this.dams < Math.floor(pop / 2) + 1 && w.distWoody[i] <= 4) {
      let site = -1;
      for (let dy = -1; dy <= 1 && site < 0; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (w.inb(xx, yy) && w.terrain[w.idx(xx, yy)] === T.CREEK && w.feature[w.idx(xx, yy)] === 0) { site = w.idx(xx, yy); break; }
      }
      if (site >= 0 && !this.damNear(site, 7)) this.buildDam(site);
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
      if (d <= 2.2) {
        if (t === T.CREEK || t === T.POND) w.terrain[j] = T.POND;
        else if (t !== T.POND) floodTile(w, j, T.MARSH, rng);
      } else if (d <= 3.4) {
        if (!isWater(t)) floodTile(w, j, rng() < 0.5 ? T.MARSH : T.MUD, rng);
      }
    }
    this.game.water?.sync();
    this.dams++;
    w.hydroDirty = true; w.renderDirty = true;
    this.game.flags.beaverDam = true;
    moment(this.game, 'dam', { x: x + 0.5, y: y + 0.5 });
    this.game.notify(this.game.water ? 'Beavers built a dam! Creek water will gather behind it, filling the low ground uphill. Watch its banks become wetland.' : 'Beavers built a dam! The creek is backing up into a brand-new wetland, and the drowned trees will become snags.', 'good', { x: x + 0.5, y: y + 0.5 });
  }

  // -------------------------------------------------------------- per-frame movement
  update(dt) {
    if (!(dt > 0)) return;
    updatePassage(this, dt);
    const w = this.game.world;
    this.spacing.rebuild(w, this.agents); this.spacingDirty = false;
    this.ids = new Map(this.agents.map(a => [a.id, a])); // (hunters, chasers and the chased look each other up every step)
    // (a fire is noticed within a few hours of game time)
    if ((this.fireCheck = (this.fireCheck || 0) - dt) <= 0) { this.fireCheck = 0.2; fleeFire(this); }
    for (let k = this.agents.length - 1; k >= 0; k--) {
      const a = this.agents[k];
      if (!a) continue;
      const def = ANIMALS[a.sp];
      a.age += dt;
      // (a fish beats its tail faster the faster it swims, and only sculls gently while it hovers)
      a.phase += dt * (def.reef ? 2.5 + 5 * Math.min(1.6, (a.spd || 0) / def.speed) : 6 * clamp(a.run || 1, 0.45, 2.6)) * (def.sprite.beat ?? 1); // (beat: a big, slow swimmer's tail; a.run: legs going faster at a sprint, slower at a creep)
      if (this.drinks(def)) a.thirst = (a.thirst || 0) + dt;
      if (a.alertT > 0) a.alertT -= dt;
      if (a.sparT > 0 && a.state !== 'spar') a.sparT -= dt;
      if (a.greetT > 0) a.greetT -= dt;
      if (a.bugleT > 0) a.bugleT -= dt;
      if (a.drinkT > 0) {
        a.drinkT -= dt;
        if (a.drinkT <= 0) a.drinkAt = null;
        else if (this.drinks(def) && !a.drinkAt) {
          // Older saves can contain a head-down pose with no direction (even a calf on dry
          // ground). Repair it on the next simulation step rather than waiting for another trip.
          const bank = this.bankSpot(a);
          if (bank) { a.drinkAt = bank.water; facePoint(a, ...bank.water); }
          else a.drinkT = 0;
        }
      }
      const sp = def.speed * dt * (a.follow ? 1.3 : a.wade ? 0.3 : 1); // herd members trot to keep up; waders step slowly
      if (a.state !== 'hunt' && a.state !== 'flee' && a.state !== 'play' && a.state !== 'walk' && a.run) a.run = null;
      switch (a.state) {
        case 'idle':
          a.wait -= dt;
          if (def.familyHerd && !a.drinkT && a.socialWith == null && !(a.greetT > 0) && cervidNeedsRejoin(this, a, def)) a.wait = 0;
          if (def.reef && a.spd > 0.001) this.glide(a, dt); // (a fish coasts to a stop, it doesn't brake)
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
        case 'walk': {
          if (!a.path || !a.path.length) { a.state = 'idle'; a.run = null; a.wait = def.patrol ? 0.2 + Math.random() * 0.8 : def.familyHerd && a.follow ? 0.25 : def.familyHerd && !a.greet && !a.follow ? 3 + Math.random() * 4 : 0.5 + Math.random() * 3; arrive(this, a); birdArrive(this, a); break; }
          const j = a.path[a.path.length - 1];
          if (def.reef) { if (this.swimToward(a, j, sp * (a.pace || 1), dt)) a.path.pop(); break; }
          // each animal keeps to its own line through a tile and stops at its own spot in the last
          // one, so two walking the same way don't trace one track, and a group doesn't pile onto
          // a single point
          const [ox, oy] = spotIn(a, j, a.path.length === 1);
          if (a.path.length === 1 && a.restSpot?.[0] !== j) {
            const bank = this.drinks(def) && a.thirst > (def.drinkEvery ?? 5 + a.id % 5) * 0.5 ? this.bankSpot(a, j) : null;
            a.restSpot = [j, ...(bank && bank.crowd < 0.08 ? [bank.x, bank.y] : this.spacing.restSpot(a, j, ox, oy))];
          }
          const tx = a.path.length === 1 ? a.restSpot[1] : (j % w.w) + 0.5 + ox;
          const ty = a.path.length === 1 ? a.restSpot[2] : ((j / w.w) | 0) + 0.5 + oy;
          const wading = def.crossing && w.terrain[j] === T.RIVER; // swimming the river is slow going
          // A waypoint isn't a pin that every animal must stand on. Step past occupied
          // transit points, or finish beside an occupied destination when already clear.
          const remaining = Math.hypot(a.x - tx, a.y - ty);
          if ((a.path.length > 1 && remaining < 0.35 && w.idx(Math.floor(a.x), Math.floor(a.y)) === j) ||
            (a.path.length === 1 && remaining < 0.9 && this.spacing.crowd(a, tx, ty) > 0.08 &&
            this.spacing.crowd(a, a.x, a.y) < 0.04)) {
            a.path.pop(); break;
          }
          if (this.stepToward(a, tx, ty, (wading ? sp * 0.55 : sp) * (a.pace || 1) * (a.run || 1))) a.path.pop(); // (a.run: a startled animal dashing for cover)
          break;
        }
        case 'approach':
          if (a.move === 'fly') a.alt = Math.max(0, a.alt - dt * 3);
          if (!a.localGoal || !(this.heldBank(a) || this.bankSpot(a)) || this.stepToward(a, ...a.localGoal, sp)) {
            a.localGoal = null; a.state = 'idle'; a.wait = 0;
          }
          break;
        case 'fly':
          a.alt = Math.min(1, a.alt + dt * 3);
          if (this.stepToward(a, a.tx, a.ty, sp)) {
            a.state = 'idle'; a.flying = false;
            const i = w.inb(Math.floor(a.x), Math.floor(a.y)) ? w.idx(Math.floor(a.x), Math.floor(a.y)) : -1;
            if (i >= 0 && !canLand(w, i, def)) { a.flying = true; a.wait = 0; break; }
            a.wait = WADERS.has(def.sprite.kind) && i >= 0 && shallows(w, i) ? 4 + Math.random() * 6 : 0.5 + Math.random() * 3; // a wader settles in
            arrive(this, a);
            birdArrive(this, a);
          }
          break;
        case 'hunt': {
          // A difficulty change also stops hunts that only exist in Challenging.
          if (!preyFor(def, this.game)) { a.state = 'idle'; a.wait = 1; a.flying = false; endHunt(a); break; }
          a.huntTime -= dt;
          const b = this.ids.get(a.target);
          if (!b || b.leaving || a.huntTime <= 0) {
            a.state = 'idle'; a.wait = 1; endHunt(a);
            if (this.game.diff.ecology && a.move === 'fly') a.flying = false;
            break;
          }
          if (this.game.diff.ecology && a.move !== 'fly' && (b.flying || b.alt > 0.2)) { a.state = 'idle'; a.wait = 1; endHunt(a); break; }
          if (a.move === 'fly') a.alt = Math.min(1, a.alt + dt * 2);
          const nx = a.x + Math.sign(b.x - a.x) * 0.3, ny = a.y + Math.sign(b.y - a.y) * 0.3;
          if (a.move !== 'fly' && w.inb(Math.floor(nx), Math.floor(ny))) {
            const j = w.idx(Math.floor(nx), Math.floor(ny));
            // water hunters (caiman, anaconda, giant otter) strike from the water's edge, not across the fields
            if (!passable(w, j, def) || (a.move === 'semi' && w.distWater[j] > 2)) { a.state = 'idle'; a.wait = 1; endHunt(a); break; }
          }
          // approach, stalk or circle, then rush (animal-life.js); the catch is decided on contact
          const reached = huntStep(this, a, def, b, sp);
          if (a.state !== 'hunt' || !reached) break;
          a.state = 'idle'; a.wait = 1.5;
          if (a.assist) { endHunt(a); if (a.move === 'fly') a.flying = false; break; } // (the pack's flankers leave the kill to the one in front)
          endHunt(a);
          if (!this.game.diff.ecology) a.hunger = 0;
          if ((this.game.diff.ecology ? this.game.rng() : Math.random()) < predationCatchChance(this.game, b, def)) {
            a.hunger = 0;
            this.game.onPredation(a, b);
            this.remove(b, 'predation');
            startFeed(this, a, def, b);
          } else {
            if (this.game.diff.ecology) this.evadeHunt(b, a);
            missed(this, b, a);
          }
          if (a.move === 'fly' && a.state !== 'feed') a.flying = false;
          break;
        }
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
          if (a.feedT <= 0) { a.state = 'idle'; a.wait = 1 + Math.random() * 2; a.feedAt = null; a.carcass = null; } // then a rest
          break;
        case 'leave':
          if (a.leaveWait > 0) { a.leaveWait -= dt; break; }
          if (a.move === 'fly') a.alt = Math.min(1, a.alt + dt * 3);
          if (this.stepToward(a, a.tx, a.ty, sp * 1.2 * (a.pace || 1)) || a.x < -2 || a.y < -2 || a.x > w.w + 2 || a.y > w.h + 2) this.remove(a, 'left');
          break;
      }
    }
    for (let k = this.carcasses.length - 1; k >= 0; k--) if ((this.carcasses[k].t -= dt) <= 0) this.carcasses.splice(k, 1);
    this.spacing.rebuild(w, this.agents); this.spacingDirty = false;
    this.spacing.separate(dt, passable);
    // Measure progress after spacing: movement can appear successful and then be
    // completely undone by a neighbour pushing the animal back in the same frame.
    for (const a of this.agents) this.checkMovementProgress(a, dt);
  }

  checkMovementProgress(a, dt) {
    if (((a.state !== 'walk' || !a.path?.length) && a.state !== 'approach') || ANIMALS[a.sp].reef) {
      a.moveProgress = null;
      return;
    }
    const w = this.game.world, j = a.state === 'walk' ? a.path[a.path.length - 1] : -1;
    let tx = a.localGoal?.[0], ty = a.localGoal?.[1];
    if (j >= 0) {
      const [ox, oy] = spotIn(a, j, a.path.length === 1);
      const rest = a.path.length === 1 && a.restSpot?.[0] === j;
      tx = rest ? a.restSpot[1] : j % w.w + 0.5 + ox;
      ty = rest ? a.restSpot[2] : (j / w.w | 0) + 0.5 + oy;
    }
    if (tx == null || ty == null) { a.moveProgress = null; return; }
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
    const dest = approaching ? w.idx(Math.floor(a.localGoal[0]), Math.floor(a.localGoal[1])) : a.path[0];
    const tx = dest % w.w + 0.5, ty = (dest / w.w | 0) + 0.5;
    const wasFollowing = a.follow, inTransit = !approaching && a.path.length > 1;
    a.moveProgress = null; a.restSpot = null; a.localGoal = null;
    // A fixed herd slot can be occupied by another animal for years. Let the
    // next herd decision choose a new slot instead of returning to that jam.
    if (wasFollowing) { a.slot = null; a.momSlot = null; }
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
    if (a.hd == null) a.hd = Math.atan2(dy, dx);
    // turn toward the point, no faster than a fish can (bigger fish turn wider)
    let turn = Math.atan2(dy, dx) - a.hd;
    turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
    const rate = (ANIMALS[a.sp].sprite.size > 25 ? 2.2 : 3.4) * dt;
    a.hd += clamp(turn, -rate, rate);
    // ease up to cruising speed, ease off when the point is behind it or it's nearly there
    // (a.spd is in tiles a day, so the motion is the same at any frame rate)
    const want = sp / Math.max(dt, 1e-6) * (0.35 + 0.65 * Math.max(0, Math.cos(turn))) * (last ? clamp(d / 0.9, 0.25, 1) : 1);
    a.spd = (a.spd || 0) + (want - (a.spd || 0)) * Math.min(1, dt * 3);
    const nx = a.x + Math.cos(a.hd) * a.spd * dt, ny = a.y + Math.sin(a.hd) * a.spd * dt;
    // (rounding a corner mustn't carry it up the beach: if it would, it turns straight for the point)
    if (w.inb(Math.floor(nx), Math.floor(ny)) && !passable(w, w.idx(Math.floor(nx), Math.floor(ny)), a) && w.inb(Math.floor(a.x), Math.floor(a.y)) && passable(w, w.idx(Math.floor(a.x), Math.floor(a.y)), a)) a.hd = Math.atan2(dy, dx);
    else { a.x = nx; a.y = ny; }
    if (Math.abs(Math.cos(a.hd)) > 0.1) a.facing = Math.cos(a.hd) > 0 ? 1 : -1;
    a.swimT = (a.swimT || 0) + dt;
    if (d < (last ? 0.25 : 0.55) || a.swimT > 4) { a.swimT = 0; return true; } // (or gives up on a point it keeps circling)
    return false;
  }
  glide(a, dt) {
    const sx = Math.cos(a.hd || 0) * a.spd * dt, sy = Math.sin(a.hd || 0) * a.spd * dt;
    a.x += sx; a.y += sy;
    a.spd *= Math.exp(-dt * 2.5);
    const w = this.game.world, x = Math.floor(a.x), y = Math.floor(a.y);
    if (!w.inb(x, y) || !passable(w, w.idx(x, y), a)) { a.x -= sx; a.y -= sy; a.spd = 0; } // (not up onto the beach)
  }

  stepToward(a, tx, ty, sp) {
    const dx = tx - a.x, dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    // A reef fish never slides sideways at a target (hunting, leaving): it turns its nose toward
    // it, no faster than a fish can, and swims along its heading, easing off in a tight turn.
    if (a.hd != null && ANIMALS[a.sp].reef && d > sp && sp > 0) {
      let turn = Math.atan2(dy, dx) - a.hd;
      turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
      const rate = sp * 3.5;
      a.hd += clamp(turn, -rate, rate);
      const step = sp * Math.max(0.25, Math.cos(turn));
      const nx = a.x + Math.cos(a.hd) * step, ny = a.y + Math.sin(a.hd) * step, w = this.game.world;
      if (!w.inb(Math.floor(nx), Math.floor(ny)) || passable(w, w.idx(Math.floor(nx), Math.floor(ny)), a)) { a.x = nx; a.y = ny; }
      a.orientation = a.hd;
      if (Math.abs(Math.cos(a.hd)) > 0.1) a.facing = Math.cos(a.hd) > 0 ? 1 : -1;
      return Math.hypot(tx - a.x, ty - a.y) <= sp;
    }
    if (d > 0.02 && sp > 0) facePoint(a, tx, ty);
    if (Math.abs(dx) > 0.02) a.facing = dx > 0 ? 1 : -1;
    const step = Math.min(d, sp), nx = d ? a.x + dx / d * step : a.x, ny = d ? a.y + dy / d * step : a.y;
    if (a.move !== 'fly' && !swimmer(a) && !a.leaving) {
      const w = this.game.world, x0 = Math.floor(a.x), y0 = Math.floor(a.y);
      const safe = (x, y) => {
        const xx = Math.floor(x), yy = Math.floor(y);
        return w.inb(xx, yy) && passable(w, w.idx(xx, yy), a) &&
          (xx === x0 || yy === y0 || passable(w, w.idx(xx, y0), a) && passable(w, w.idx(x0, yy), a));
      };
      if (!safe(nx, ny)) {
        // Tile offsets and spacing can turn an orthogonal route into a diagonal
        // corner cut. Slide along its open side; never step into the obstruction.
        if (Math.abs(dx) > 0.001 && safe(nx, a.y)) a.x = nx;
        else if (Math.abs(dy) > 0.001 && safe(a.x, ny)) a.y = ny;
        return false;
      }
    }
    a.x = nx; a.y = ny;
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
  // and climbers only travel along a corridor, an unbroken run of tiles they can live in (or water,
  // for animals that swim), so a caiman follows the river to a marsh but won't trek across pasture.
  // Flyers just fly there. Returns true if a trip was set up.
  roam(a, def, resume = null) {
    const w = this.game.world, map = this.suit[a.sp], W = w.w, n = w.n;
    const x0 = clamp(Math.floor(a.x), 0, W - 1), y0 = clamp(Math.floor(a.y), 0, w.h - 1), start = w.idx(x0, y0);
    if (a.move === 'fly') {
      let best = -1, bs = 0;
      for (let k = 0; k < 60; k++) {
        const j = Math.floor(Math.random() * n), x = j % W, y = (j / W) | 0;
        if (Math.hypot(x - x0, y - y0) < 14 || map[j] < 0.25 || !canLand(w, j, def)) continue;
        const sc = map[j] * (0.6 + 0.4 * Math.random()) * (w.terrain[j] === T.RIVER ? 0.5 : 1);
        if (sc > bs) { bs = sc; best = j; }
      }
      if (best < 0) return false;
      a.tx = (best % W) + 0.3 + Math.random() * 0.4; a.ty = ((best / W) | 0) + 0.3 + Math.random() * 0.4;
      a.state = 'fly'; a.flying = true;
      return true;
    }
    if (!stamp || stamp.length < n) { stamp = new Int32Array(n); parent = new Int32Array(n); bfsQ = new Int32Array(n); }
    if (!depth || depth.length < n) depth = new Int16Array(n);
    const wet = a.move !== 'ground';
    const corridor = j => passable(w, j, a) && (map[j] > 0.04 || (wet && isWater(w.terrain[j])));
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
      if (depth[i] >= 12 && map[i] > 0.3) { const wgt = map[i] * map[i] * (w.terrain[i] === T.RIVER && !def.patrol ? 0.25 : 1); seen += wgt; if (Math.random() * seen < wgt) pick = i; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!swimmer(a) && dx && dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= w.h) continue;
        const j = yy * W + xx;
        if (stamp[j] === stampN || !corridor(j)) continue;
        stamp[j] = stampN; parent[j] = i; depth[j] = Math.min(32000, depth[i] + 1); bfsQ[tail++] = j;
      }
    }
    if (pick < 0) { a.trip = null; return false; }
    const path = [];
    for (let i = pick; i !== start && i >= 0; i = parent[i]) path.push(i);
    a.path = path; a.state = 'walk';
    a.trip = pick; // remembered, so a hunt along the way doesn't make it forget where it was going
    return true;
  }

  chooseTarget(a, def) {
    a.restSpot = null;
    a.drinkAt = null; a.waterTrip = false;
    a.run = null;
    a.bird = null; a.birdGoal = null; a.birdGround = false;
    const w = this.game.world;
    const map = this.suit[a.sp];
    // a predator close by comes before anything else
    if (!a.leaving && watch(this, a, def)) return;
    if (!a.leaving && socialHold(this, a, def)) return;
    // A newly formed family supersedes an old independent roaming trip.
    if (def.familyHerd && a.trip != null && (this.herdLeader(a) !== a || inRut(this.game) && isMaleVariant(def, a))) a.trip = null;
    // on a trip: carry on to the destination (a hunt or a rest may have interrupted it)
    if (a.trip != null) {
      const tx = (a.trip % w.w) + 0.5, ty = ((a.trip / w.w) | 0) + 0.5;
      if (Math.hypot(a.x - tx, a.y - ty) < 2) a.trip = null;
      else if (this.roam(a, def, a.trip)) return;
    }
    a.follow = false; a.wade = false;
    // the young play-chase each other, and otherwise stay close to their mother until they're old
    // enough to go their own way
    if (!a.leaving && play(this, a, def)) return;
    if (a.mom != null && !a.leaving && this.keepWithMom(a, def)) return;
    // just climbed out of the river: the herd heads inland to find grass
    if (a.landed) {
      a.landed = false;
      const w = this.game.world, map = this.suit[a.sp], y0 = Math.floor(a.y);
      if (!def.herd || this.herdLeader(a) === a) {
        if (this.pathTo(a, (j, x, y) => y < y0 - 14 - (a.id % 9) && map[j] > 0.2, 12000)) { a.trip = null; return; }
      }
    }
    if (a.move === 'fly' && WADERS.has(def.sprite.kind) && !a.flying && !a.leaving && Math.random() < 0.65 && this.wade(a)) return;
    if (this.salmonRun && def === ANIMAL.bear && !a.leaving) {
      if (this.game.day < this.salmonRun.until) { if (this.fishSalmon(a)) return; }
      else if (a.visit) { this.leave(a); return; }
    }
    if (def.ambush && this.crossingAt && this.game.day < this.crossingAt.until && this.lurk(a)) return;
    if (!a.leaving && scavenge(this, a, def)) return; // a fresh kill nearby
    if (!a.leaving && prowl(this, a, def)) return;    // predators: lie up after a meal, go looking when hungry
    if (!a.leaving && harem(this, a, def)) return;    // elk in the rut: bulls gather and guard harems
    if (this.drinks(def) && !a.leaving && this.waterhole(a, def)) return;
    if (!a.leaving && birdChoose(this, a, def)) return;
    if (!a.leaving && greet(this, a, def)) return;    // say hello to a neighbour (or spar with a rival)
    // herd animals stay together: one leads, the rest keep their place around it
    if (def.herd && !a.leaving && this.keepWithHerd(a, def)) return;
    // herd leaders keep their distance from the next herd of their kind, so herds spread out
    if (def.herdMax && !a.leaving && !a.juvenile && this.herdLeader(a) === a && Math.random() < 0.5) {
      const leaders = this.agents.filter(o => o !== a && o.sp === a.sp && !o.leaving && this.herdLeader(o) === o);
      if (leaders.some(o => (o.x - a.x) ** 2 + (o.y - a.y) ** 2 < 144)) {
        const map = this.suit[a.sp];
        // walk to the nearest decent ground well away from every other herd of this kind
        if (this.pathTo(a, (j, x, y) => map[j] > 0.08 && leaders.every(o => (o.x - x) ** 2 + (o.y - y) ** 2 > 196), 9000)) { a.trip = null; return; }
      }
    }
    // now and then, head off along a corridor to another patch of habitat
    if (!a.leaving && !a.juvenile && !(def.familyHerd && inRut(this.game) && isMaleVariant(def, a)) && Math.random() < this.roamChance(def, a) && this.roam(a, def)) return;
    if (a.move === 'fly') {
      const r = Math.min(14, 4 + Math.sqrt(def.hr) * 0.8);
      let [x, y] = this.bestTileSample(def, a.x, a.y, r, 10);
      if (WADERS.has(def.sprite.kind)) { // waders come down in the shallows when there are any nearby
        for (let k = 0; k < 40; k++) {
          const xx = Math.round(a.x + (Math.random() * 2 - 1) * r), yy = Math.round(a.y + (Math.random() * 2 - 1) * r);
          if (w.inb(xx, yy) && shallows(w, w.idx(xx, yy)) && map[w.idx(xx, yy)] > 0.15) { x = xx; y = yy; break; }
        }
      }
      a.tx = x + 0.3 + Math.random() * 0.4; a.ty = y + 0.3 + Math.random() * 0.4;
      a.state = 'fly'; a.flying = true;
      return;
    }
    const x0 = Math.floor(a.x), y0 = Math.floor(a.y);
    if (!w.inb(x0, y0)) { a.x = clamp(a.x, 0.5, w.w - 0.5); a.y = clamp(a.y, 0.5, w.h - 0.5); a.wait = 1; return; }
    const start = w.idx(x0, y0);
    // others of its kind nearby, counted by the tile they're on or heading for: a spot that's
    // already taken is worth less, so they spread out over the habitat instead of crowding together
    const crowd = new Map();
    for (const o of this.agents) {
      if (o === a || o.sp !== a.sp || o.leaving || Math.abs(o.x - a.x) > 14 || Math.abs(o.y - a.y) > 14) continue;
      const j = o.state === 'walk' && o.path?.length ? o.path[0] : w.idx(clamp(Math.floor(o.x), 0, w.w - 1), clamp(Math.floor(o.y), 0, w.h - 1));
      crowd.set(j, (crowd.get(j) || 0) + 1);
    }
    // and the last few places it went: with only two good spots around (two lone trees in a
    // pasture) it would otherwise shuttle between them in a straight line, back and forth
    if (def.familyHerd && map[start] > 0.15 && Math.random() < 0.6) { a.wait = 3 + Math.random() * 4; return; }
    const recent = a.recent || (a.recent = []);
    const worth = i => 1 / (1 + 1.5 * (crowd.get(i) || 0)) * (recent.includes(i) ? 0.3 : 1);
    // Patrollers (river dolphins, giant otters) cruise long stretches of water instead of
    // milling about one spot: they hold a heading, favour water well ahead of them, and turn
    // around at dead ends, following the channel toward its farthest reach.
    const patrol = !!def.patrol;
    if (patrol && !a.heading) { const ang = Math.random() * Math.PI * 2; a.heading = [Math.cos(ang), Math.sin(ang)]; }
    const R = patrol ? 16 : Math.min(12, 3 + Math.sqrt(def.hr) * 0.9);
    const n = w.n;
    if (!stamp || stamp.length < n) { stamp = new Int32Array(n); parent = new Int32Array(n); bfsQ = new Int32Array(n); }
    stampN++;
    let head = 0, tail = 0;
    bfsQ[tail++] = start; stamp[start] = stampN; parent[start] = -1;
    let best = start, bs = patrol ? 0 : map[start] * 0.8 * worth(start), far = -1, farD = 0;
    const W = w.w, cap = patrol ? 1200 : 380;
    const diag = swimmer(a);
    const ahead = i => (((i % W) - x0) * a.heading[0] + (((i / W) | 0) - y0) * a.heading[1]) / R;
    let poke = -1, pokeN = 0; // a random nearby spot it could live on, for a short wander
    while (head < tail && tail < cap) {
      const i = bfsQ[head++];
      const x = i % W, y = (i / W) | 0;
      if (Math.abs(x - x0) > R || Math.abs(y - y0) > R) continue;
      let s = map[i] * (0.45 + 0.55 * Math.random()) * (patrol || i === start ? 1 : worth(i));
      if (patrol) {
        const d2 = (x - x0) ** 2 + (y - y0) ** 2;
        if (map[i] > 0.15 && d2 > farD) { farD = d2; far = i; }
        const f = ahead(i);
        s *= f > 0 ? 0.3 + f : 0.03;
      }
      if (s > bs) { bs = s; best = i; }
      if (i !== start && map[i] > 0.01 && Math.abs(x - x0) + Math.abs(y - y0) <= 4 && !recent.includes(i) && Math.random() * ++pokeN < 1) poke = i;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!diag && dx && dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= w.h) continue;
        const j = yy * W + xx;
        if (stamp[j] === stampN || !passable(w, j, a)) continue;
        stamp[j] = stampN; parent[j] = i; bfsQ[tail++] = j;
      }
    }
    // nothing better around: now and then it potters off a few steps anyway (foraging, sniffing
    // about), rather than standing on one tile or shuttling between the same two
    if (!patrol && best === start && poke >= 0 && Math.random() < 0.5) best = poke;
    if (patrol) {
      // blocked (a bank or the end of the channel): turn toward the farthest open water instead
      if (best === start || ahead(best) < 0.35) {
        if (far >= 0) { const dx = (far % W) - x0, dy = ((far / W) | 0) - y0, l = Math.hypot(dx, dy) || 1; a.heading = [dx / l, dy / l]; }
        else a.heading = [-a.heading[0], -a.heading[1]];
      } else {
        // drift the heading a little so they also nose into creek mouths and side channels
        const t = (Math.random() - 0.5) * 0.5, c = Math.cos(t), sn = Math.sin(t);
        a.heading = [a.heading[0] * c - a.heading[1] * sn, a.heading[0] * sn + a.heading[1] * c];
      }
    }
    if (best === start) { a.wait = 1 + Math.random() * 3; return; }
    const path = [];
    for (let i = best; i !== start && i >= 0; i = parent[i]) path.push(i);
    a.path = path; a.state = 'walk';
    recent.push(start); if (recent.length > (def.familyHerd ? 12 : 4)) recent.shift();
  }

  // -------------------------------------------------------------- herds and waterholes
  // Who walks to water to drink: on the savanna everything that isn't a fish or a beetle; on the
  // other maps the land mammals (and the cattle). Birds, reptiles and insects there drink where they are.
  drinks(def) {
    if (def.move === 'swim' || def.noDrink || def.reef || biome.look?.underwater) return false;
    if (biome.waterholes) return true;
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
    const here = w.idx(x0, y0), every = def.drinkEvery ?? 5 + (a.id % 5);
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
      a.drinkAt = bank.water; facePoint(a, ...bank.water);
      a.waterTrip = false; a.thirst = 0; a.drinkT = 2 + Math.random() * 3; a.wait = a.drinkT; a.flying = false; a.alt = 0;
      return true;
    }
    if (a.thirst < every || a.juvenile && def.herd) return false;
    if (def.herd && this.herdLeader(a) !== a) return false; // the herd goes when its leader does
    if (a.move === 'fly') {
      let best = -1, bd = 1e9;
      for (let k = 0; k < 120; k++) {
        const xx = x0 + Math.round((Math.random() * 2 - 1) * 30), yy = y0 + Math.round((Math.random() * 2 - 1) * 30);
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
    const goal = this.pathTo(a, j => w.distWater[j] <= 1 && (this.bankSpot(a, j)?.crowd ?? Infinity) < 0.08, 5000);
    if (!goal) { a.thirst = 0; return false; } // no water it can reach: it gets by on dew and green grass
    a.waterTrip = true;
    return true;
  }

  // A heron or crane standing in the shallows: mostly it stays put, now and then stabbing at a fish,
  // or it wades a few steps to another spot. Only once in a while does it take off.
  wade(a) {
    const w = this.game.world, x0 = Math.floor(a.x), y0 = Math.floor(a.y);
    if (!w.inb(x0, y0) || !shallows(w, w.idx(x0, y0))) return false;
    if (Math.random() < 0.55) {
      a.wait = 3 + Math.random() * 6;
      if (Math.random() < 0.45) {
        a.drinkT = 1 + Math.random(); // head down: a strike at a fish or frog
        const bank = this.bankSpot(a);
        if (bank) { a.drinkAt = bank.water; facePoint(a, ...bank.water); }
      }
      return true;
    }
    const ok = this.pathTo(a, (j, x, y) => shallows(w, j) && Math.hypot(x - x0, y - y0) >= 1.5 && Math.random() < 0.35, 90);
    if (ok) { a.wade = true; a.alt = 0; }
    return ok;
  }

  // Crocodiles gather in the river at the crossing while the migration is swimming over: head
  // there, then lie in wait (hunting is the usual daily check, and swimmers are easy to reach).
  lurk(a) {
    const w = this.game.world, cx = this.crossingAt.x;
    const at = (x, y) => Math.abs(x - cx) <= 5 && w.inb(x, y) && w.terrain[w.idx(x, y)] === T.RIVER && y < w.h - 1;
    if (at(Math.floor(a.x), Math.floor(a.y))) { a.wait = 1 + Math.random() * 3; a.trip = null; return true; }
    a.trip = null;
    return this.pathTo(a, (j, x, y) => at(x, y), 14000);
  }

  // The herd's leader: the longest-standing member within reach (lowest id). Herds that drift far
  // apart split, each with its own leader.
  herdLeader(a) {
    if (ANIMALS[a.sp].familyHerd) return cervidLeader(this, a);
    const max = ANIMALS[a.sp].herdMax;
    if (max) {
      const same = this.agents.filter(o => o.sp === a.sp && !o.leaving).sort((p, q) => p.id - q.id);
      const r = same.indexOf(a);
      return r < 0 ? a : same[Math.floor(r / max) * max];
    }
    let lead = a;
    for (const o of this.agents) if (o.sp === a.sp && o.id < lead.id && !o.leaving && Math.abs(o.x - a.x) + Math.abs(o.y - a.y) < 40) lead = o;
    return lead;
  }

  // Tag along a step behind mum, trotting to catch up when she moves off.
  keepWithMom(a, def) {
    const years = WITH_MOM[def.key];
    if (!years || a.age > Math.min(years, def.mature || years) * DAYS_PER_YEAR) { a.mom = null; return false; }
    const mom = this.agents.find(o => o.id === a.mom);
    if (!mom || def.familyHerd && isMaleVariant(def, mom)) { a.mom = null; return false; } // on its own now
    if (this.drinks(def) && mom.drinkT > 0 && this.waterhole(a, def)) return true;
    if (!a.momSlot) { const ang = Math.random() * Math.PI * 2, r = 0.45 + Math.random() * 0.4; a.momSlot = [Math.cos(ang) * r, Math.sin(ang) * r]; }
    // head for where she's going, not where she was, so the young keep pace instead of trailing
    if (def.familyHerd) return followCervid(this, a, [mom.x, mom.y], 'momSlot', 0.9);
    const w = this.game.world, dest = mom.state === 'walk' && mom.path?.length ? mom.path[mom.path.length - 1] : -1;
    const mx = dest >= 0 ? (dest % w.w) + 0.5 : mom.x, my = dest >= 0 ? ((dest / w.w) | 0) + 0.5 : mom.y;
    const tx = mx + a.momSlot[0], ty = my + a.momSlot[1], d = Math.hypot(a.x - tx, a.y - ty);
    a.trip = null;
    const settle = () => { a.wait = dest >= 0 ? 0.15 : 0.2 + Math.random() * 0.6; return true; };
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
    if (!a.slot) { const ang = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * (def.herdR ?? 2.5); a.slot = [Math.cos(ang) * r, Math.sin(ang) * r]; }
    const tx = lead.x + a.slot[0], ty = lead.y + a.slot[1];
    if (Math.hypot(a.x - tx, a.y - ty) < 1.2) { a.wait = 0.4 + Math.random() * 1.5; a.trip = null; return true; }
    a.trip = null;
    if (this.pathTo(a, (j, x, y) => Math.hypot(x + 0.5 - tx, y + 0.5 - ty) < 1, 900, (x, y) => Math.hypot(x + 0.5 - tx, y + 0.5 - ty))) { a.follow = true; return true; }
    return false;
  }

  // Breadth-first walk to the nearest tile passing goal(j, x, y); if none turns up within `cap`
  // tiles and a distance function is given, head for the searched tile closest to the target.
  // Recovery can additionally avoid occupied tiles, without changing ordinary habitat paths.
  // Sets up the path and returns true if the animal is now walking.
  pathTo(a, goal, cap, dist = null, canVisit = null) {
    const w = this.game.world, W = w.w, n = w.n;
    const x0 = Math.floor(a.x), y0 = Math.floor(a.y), start = w.idx(x0, y0);
    if (!stamp || stamp.length < n) { stamp = new Int32Array(n); parent = new Int32Array(n); bfsQ = new Int32Array(n); }
    stampN++;
    let head = 0, tail = 0, found = -1, near = -1, nd = dist ? dist(x0, y0) : 1e9;
    bfsQ[tail++] = start; stamp[start] = stampN; parent[start] = -1;
    const diag = swimmer(a);
    while (head < tail && tail < cap) {
      const i = bfsQ[head++], x = i % W, y = (i / W) | 0;
      if (i !== start && goal(i, x, y)) { found = i; break; }
      if (dist) { const d = dist(x, y); if (d < nd) { nd = d; near = i; } }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!diag && dx && dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= w.h) continue;
        const j = yy * W + xx;
        if (stamp[j] === stampN || !passable(w, j, a) || (canVisit && !canVisit(j))) continue;
        stamp[j] = stampN; parent[j] = i; bfsQ[tail++] = j;
      }
    }
    const dest = found >= 0 ? found : near;
    if (dest < 0 || dest === start) return false;
    const path = [];
    for (let i = dest; i !== start && i >= 0; i = parent[i]) path.push(i);
    a.path = path; a.state = 'walk';
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
      agents: this.agents.map(({ moveProgress, pushX, pushY, ...a }) => ({ ...a, path: null })),
      nextId: this.nextId,
      state: this.state.map(s => ({ discovered: s.discovered, lastYear: s.lastYear, blockedNotified: s.blockedNotified, births: s.births })),
      salmon: this.salmon, dams: this.dams,
    };
  }
  load(d) {
    this.spacingDirty = true;
    this.carcasses = [];
    this.flyovers = []; this.passageWait = 8 + Math.random() * 10;
    this.agents = d.agents.map(a => ({ ...a, moveProgress: null, state: a.state === 'walk' ? 'idle' : a.state, greet: null, socialWith: null, socialUntil: 0,
      wait: a.state === 'idle' ? Math.max(0.5, a.drinkT || 0) : 0.5 }));
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

function hashJitter(x, y) {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (h - Math.floor(h)) * 0.8 - 0.4;
}

function floodTile(w, j, terrain, rng) {
  w.terrain[j] = terrain;
  if (w.feature[j] === F.FENCE || w.feature[j] === F.ROCKS || w.feature[j] === F.BRUSH) w.feature[j] = 0;
  if (w.tree[j]) {
    const p = PLANTS[w.tree[j]];
    if (!(p.wetOK && terrain !== T.MARSH)) killTree(w, j, rng);
  }
  if (w.shrub[j] && !PLANTS[w.shrub[j]].wetOK) { w.shrub[j] = 0; w.shrubG[j] = 0; }
  if (w.ground[j] && terrain === T.MARSH && !PLANTS[w.ground[j]].wetOK && !PLANTS[w.ground[j]].aquatic) { w.ground[j] = 0; w.groundG[j] = 0; }
  w.soil[j] = Math.max(w.soil[j], 0.35);
}
