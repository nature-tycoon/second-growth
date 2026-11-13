// Wildlife's numbers (part of the Wildlife class, sim/animals.js): habitat suitability and room
// (K), births, deaths and arrivals each month, animals leaving the map, the daily tick, and
// releases by the player.

import { T, F, isWater, clamp, DAYS_PER_YEAR, lifeAge } from '../config.js';
import { many, cap, preyFor, preyPer, isMale, isMaleVariant } from '../data/animals.js';
import { browseSapling, hungryPredator, foodDeparture } from './ecological-pressure.js';
import { canStartHunt, leaveBody, haremDay } from './animal-life.js';
import { inRut } from './cervid-groups.js';
import { shelteredDormant } from './animal-dormancy.js';
import { grazeDay, decayGrazing } from './grazing.js';
import { herbivoryDay, rubSapling } from './herbivory.js';
import { decayTrails } from './animal-trails.js';
import { wallowVisit } from './wallows.js';
import { decayRisk } from './predation-risk.js';
import { dormancySeason } from '../data/animal-dormancy.js';
import { huntHunger } from '../data/animal-activity.js';
import { passable, canLand } from './animal-terrain.js';
import { simRandom } from './sim-random.js';
import { territory, Animal, inRiver, spotIn, WITH_MOM } from './wildlife-shared.js';

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

export class WildlifePopulation {
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
}
