// Wildlife: individual animals wander their habitat, breed when there's room,
// die when there isn't, hunt, migrate in from the surroundings, and (beavers) re-engineer the land.

import { T, F, isWater, clamp, DAYS_PER_YEAR } from '../config.js';
import { ANIMALS, ANIMAL, many, cap } from '../data/animals.js';
import { PLANTS } from '../data/plants.js';
import { killTree } from './plants.js';

// Species that eat fruit and spread seeds.
const FRUGIVORES = ['robin', 'thrush', 'jay', 'bear'];
const BIG = { deer: 1, elk: 1 }; // blocked by fences

let stamp = null, parent = null, bfsQ = null, stampN = 1;

export function passable(w, i, a) {
  const move = a.move;
  if (move === 'fly') return true;
  if (w.struct[i] >= 0) return false;
  const t = w.terrain[i];
  if (move === 'swim') return isWater(t) && w.feature[i] !== F.CULVERT;
  if (move === 'semi') return true;
  if (t === T.POND || t === T.RIVER) return false;
  if (w.feature[i] === F.FENCE && BIG[a.key]) return false;
  return true;
}

export class Wildlife {
  constructor(game) {
    this.game = game;
    this.agents = [];
    this.nextId = 1;
    this.state = ANIMALS.map(() => ({ pop: 0, K: 0, suitSum: 0, discovered: false, lastYear: 0, blockedNotified: false, births: 0 }));
    this.suit = ANIMALS.map(() => new Float32Array(game.world.n));
    this.salmon = { fry: {}, spawners: 0, juveniles: 0, everSpawned: false };
    this.dams = 0;
    this.g = { fishIndex: 0, frogIndex: 0, snagCount: 0, nestboxCount: 0, structureCount: 0, berryTiles: 0,
      forestTiles: 0, meadowTiles: 0, bigTrees: 0, salmonBonus: 0 };
  }

  // -------------------------------------------------------------- population bookkeeping
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
    for (const k of FRUGIVORES) f += this.state[ANIMAL[k].index].pop;
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
    const S = key => this.state[ANIMAL[key].index].pop;
    g.fishIndex = S('cutthroat') + S('coho') * 0.5 + this.salmon.juveniles * 0.2 + conWater / 12 + isoWater / 30;
    g.frogIndex = S('treefrog') * 0.5 + S('redlegged') * 0.5;
    g.snagCount = st.snags || 0;
    g.nestboxCount = st.nestboxes || 0;
    g.structureCount = w.structures.filter(Boolean).length;
    g.berryTiles = st.berry || 0;
    g.forestTiles = st.forest || 0;
    g.meadowTiles = st.meadow || 0;
    g.bigTrees = st.bigTrees || 0;
    const m = this.game.month;
    g.salmonBonus = (m >= 7 && m <= 9) ? Math.min(0.6, this.salmon.spawners / 10) : this.salmon.everSpawned ? 0.1 : 0;
  }

  computeSuitability() {
    const w = this.game.world;
    this.updateGlobals();
    for (const def of ANIMALS) {
      const map = this.suit[def.index];
      let sum = 0;
      // The river is the neighbours' habitat: animals pass through it, but it counts little toward what lives here.
      const shy = def.shy, onLand = def.move === 'ground';
      for (let i = 0; i < w.n; i++) {
        let s = def.suit(w, i) * (1 - shy * w.disturb[i]);
        if (w.fire[i]) s = 0;
        else if (w.flood[i] && onLand) s *= 0.15;
        map[i] = s;
        sum += w.terrain[i] === T.RIVER ? s * 0.12 : s;
      }
      const st = this.state[def.index];
      st.suitSum = sum;
      let K = sum / def.hr * clamp(def.req(this.g), 0, 1.5);
      st.habitatK = K;
      if (def.prey) {
        let prey = 0;
        for (const pk of def.prey) prey += this.state[ANIMAL[pk].index].pop;
        st.preyK = prey / def.preyPer;
        K = Math.min(K, st.preyK);
      }
      st.K = Math.min(def.max, K);
    }
  }

  // -------------------------------------------------------------- spawning
  spawn(def, x, y, opts = {}) {
    const a = {
      id: this.nextId++, sp: def.index, key: def.key, move: def.move,
      x: x + 0.5, y: y + 0.5, tx: x + 0.5, ty: y + 0.5, path: null,
      state: 'idle', wait: Math.random() * 2, age: opts.age ?? def.mature * DAYS_PER_YEAR * (1 + Math.random() * 2),
      facing: Math.random() < 0.5 ? -1 : 1, phase: Math.random() * 10, hunger: Math.random() * 3,
      flying: false, alt: 0, leaving: false, spawner: !!opts.spawner, juvenile: !!opts.juvenile,
    };
    if (opts.flyIn) { a.flying = true; a.alt = 1; a.state = 'fly'; a.tx = x + 0.5; a.ty = y + 0.5; a.x = opts.fromX; a.y = opts.fromY; }
    this.agents.push(a);
    const st = this.state[def.index];
    st.pop++;
    if (!st.discovered && !opts.silent) {
      st.discovered = true;
      this.game.onDiscover(def, a);
    } else if (!st.discovered) st.discovered = true;
    return a;
  }

  remove(a, cause) {
    const k = this.agents.indexOf(a);
    if (k >= 0) this.agents.splice(k, 1);
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
      if (passable(w, i, def) && (def.move !== 'swim' || isWater(w.terrain[i]))) return [xx, yy];
    }
    return null;
  }

  // Try to bring a group of this species in from one of its source edges.
  immigrate(def, n, returning = false) {
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

  bestTileSample(def, x, y, r, n) {
    const w = this.game.world, map = this.suit[def.index];
    let best = [clamp(x, 0, w.w - 1), clamp(y, 0, w.h - 1)], bs = -1;
    for (let k = 0; k < n; k++) {
      const xx = Math.round(x + (Math.random() * 2 - 1) * r), yy = Math.round(y + (Math.random() * 2 - 1) * r);
      if (!w.inb(xx, yy)) continue;
      const s = map[w.idx(xx, yy)] * (0.6 + 0.4 * Math.random());
      if (s > bs) { bs = s; best = [xx, yy]; }
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
        const adults = mine.filter(a => a.age >= def.mature * DAYS_PER_YEAR);
        const pairs = Math.floor(adults.length / 2);
        for (let p = 0; p < pairs && pop < K * 1.15; p++) {
          if (rng() > 0.75 * (1 - pop / Math.max(K, 1))) continue;
          const parentA = adults[Math.floor(rng() * adults.length)];
          const n = def.litter[0] + Math.floor(rng() * (def.litter[1] - def.litter[0] + 1));
          for (let k = 0; k < n; k++) {
            const pos = this.randomPassableNear(def, parentA.x - 0.5, parentA.y - 0.5, 1) || [Math.floor(parentA.x), Math.floor(parentA.y)];
            this.spawn(def, pos[0], pos[1], { age: 0 });
            pop++; st.births++;
          }
          if (st.births === n) game.notify(`${cap(many(def))} have raised young here for the first time!`, 'good', parentA);
        }
      }

      // deaths and departures
      const over = pop > K * 1.1 ? (pop - K) / pop : 0;
      for (const a of mine) {
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

      // immigration
      if (K >= def.minK && pop < K) {
        const chance = def.mig * (pop === 0 ? 1 : 0.35) * clamp((K - pop) / K + 0.2, 0, 1);
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
      game.notify(`Heading south for the winter: ${list(left)}.${first ? ' They remember good habitat and come back in spring if it is still here.' : ''}`, 'info');
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
    if (m === 7 && habitat >= 15) {
      const returns = Math.round((S.fry[year - 3] || 0) * 0.025);
      const strays = Math.floor(rng() * 3) + 1;
      const n = Math.min(def.max, Math.max(1, Math.min(Math.ceil(st.K), strays + returns)));
      let placed = 0;
      for (let k = 0; k < n; k++) placed += this.immigrateSalmon(def);
      if (placed) {
        S.spawners = placed;
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
    a.leaving = true;
    this.state[a.sp].pop = Math.max(0, this.state[a.sp].pop - 1);
    const def = ANIMALS[a.sp], w = this.game.world;
    const edge = def.sources[Math.floor(Math.random() * def.sources.length)];
    if (a.move === 'swim' || (edge === 'S' && a.move !== 'fly')) { a.tx = a.x; a.ty = w.h + 2; }
    else if (edge === 'N') { a.tx = a.x; a.ty = -3; }
    else if (edge === 'S') { a.tx = a.x; a.ty = w.h + 3; }
    else if (edge === 'E') { a.tx = w.w + 3; a.ty = a.y; }
    else { a.tx = -3; a.ty = a.y; }
    a.state = 'leave'; a.path = null;
    if (a.move === 'fly') { a.flying = true; }
  }

  // -------------------------------------------------------------- daily behaviour
  daily() {
    const game = this.game, w = game.world, rng = game.rng;
    for (const a of this.agents.slice()) {
      if (a.leaving) continue;
      const def = ANIMALS[a.sp];
      const x = Math.floor(a.x), y = Math.floor(a.y);
      if (!w.inb(x, y)) continue;
      const i = w.idx(x, y);
      a.hunger += 1;

      if (def.prey && a.state !== 'hunt' && a.hunger > 7 && rng() < 0.4) this.startHunt(a, def);

      if (a.key === 'beaver') this.beaverDay(a, x, y, i);
      else if ((a.key === 'deer' || a.key === 'elk') && a.state === 'idle') {
        const s = w.shrub[i];
        if (s && !PLANTS[s].invasive && w.shrubG[i] > 0.3) w.shrubG[i] -= a.key === 'elk' ? 0.02 : 0.012;
        if (w.tree[i] && w.treeG[i] < 0.4) w.treeG[i] = Math.max(0.05, w.treeG[i] - 0.01);
      }
    }
  }

  startHunt(a, def) {
    let best = null, bd = 12 * 12;
    const preySet = new Set(def.prey.map(k => ANIMAL[k].index));
    for (const b of this.agents) {
      if (!preySet.has(b.sp) || b.leaving) continue;
      const d = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    if (best) { a.state = 'hunt'; a.target = best.id; a.huntTime = 3; a.path = null; if (a.move === 'fly') a.flying = true; }
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
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
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
    this.dams++;
    w.hydroDirty = true; w.renderDirty = true;
    this.game.flags.beaverDam = true;
    this.game.notify('Beavers built a dam! The creek is backing up into a brand-new wetland, and the drowned trees will become snags.', 'good', { x: x + 0.5, y: y + 0.5 });
  }

  // -------------------------------------------------------------- per-frame movement
  update(dt) {
    const w = this.game.world;
    for (let k = this.agents.length - 1; k >= 0; k--) {
      const a = this.agents[k];
      if (!a) continue;
      const def = ANIMALS[a.sp];
      a.age += dt;
      a.phase += dt * 6;
      const sp = def.speed * dt;
      switch (a.state) {
        case 'idle':
          a.wait -= dt;
          if (a.move === 'fly' && a.flying) a.alt = Math.max(0, a.alt - dt * 3);
          if (a.wait <= 0) this.chooseTarget(a, def);
          break;
        case 'walk': {
          if (!a.path || !a.path.length) { a.state = 'idle'; a.wait = 0.5 + Math.random() * 3; break; }
          const j = a.path[a.path.length - 1];
          const tx = (j % w.w) + 0.5, ty = ((j / w.w) | 0) + 0.5;
          if (this.stepToward(a, tx, ty, sp)) a.path.pop();
          break;
        }
        case 'fly':
          a.alt = Math.min(1, a.alt + dt * 3);
          if (this.stepToward(a, a.tx, a.ty, sp)) { a.state = 'idle'; a.wait = 0.5 + Math.random() * 3; a.flying = false; }
          break;
        case 'hunt': {
          a.huntTime -= dt;
          const b = this.agents.find(o => o.id === a.target);
          if (!b || b.leaving || a.huntTime <= 0) { a.state = 'idle'; a.wait = 1; break; }
          if (a.move === 'fly') a.alt = Math.min(1, a.alt + dt * 2);
          const nx = a.x + Math.sign(b.x - a.x) * 0.3, ny = a.y + Math.sign(b.y - a.y) * 0.3;
          if (a.move !== 'fly' && w.inb(Math.floor(nx), Math.floor(ny)) && !passable(w, w.idx(Math.floor(nx), Math.floor(ny)), def)) {
            a.state = 'idle'; a.wait = 1; break;
          }
          if (this.stepToward(a, b.x, b.y, sp * 1.6) || (b.x - a.x) ** 2 + (b.y - a.y) ** 2 < 0.25) {
            a.state = 'idle'; a.wait = 1.5; a.hunger = 0;
            if (Math.random() < 0.45) {
              this.game.onPredation(a, b);
              this.remove(b, 'predation');
            }
            if (a.move === 'fly') a.flying = false;
          }
          break;
        }
        case 'leave':
          if (a.move === 'fly') a.alt = Math.min(1, a.alt + dt * 3);
          if (this.stepToward(a, a.tx, a.ty, sp * 1.2) || a.x < -2 || a.y < -2 || a.x > w.w + 2 || a.y > w.h + 2) this.remove(a, 'left');
          break;
      }
    }
  }

  stepToward(a, tx, ty, sp) {
    const dx = tx - a.x, dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.02) a.facing = dx > 0 ? 1 : -1;
    if (d <= sp) { a.x = tx; a.y = ty; return true; }
    a.x += dx / d * sp; a.y += dy / d * sp;
    return false;
  }

  chooseTarget(a, def) {
    const w = this.game.world;
    const map = this.suit[a.sp];
    if (a.move === 'fly') {
      const r = Math.min(14, 4 + Math.sqrt(def.hr) * 0.8);
      const [x, y] = this.bestTileSample(def, a.x, a.y, r, 10);
      a.tx = x + 0.3 + Math.random() * 0.4; a.ty = y + 0.3 + Math.random() * 0.4;
      a.state = 'fly'; a.flying = true;
      return;
    }
    const x0 = Math.floor(a.x), y0 = Math.floor(a.y);
    if (!w.inb(x0, y0)) { a.x = clamp(a.x, 0.5, w.w - 0.5); a.y = clamp(a.y, 0.5, w.h - 0.5); a.wait = 1; return; }
    const start = w.idx(x0, y0);
    const R = Math.min(12, 3 + Math.sqrt(def.hr) * 0.9);
    const n = w.n;
    if (!stamp || stamp.length < n) { stamp = new Int32Array(n); parent = new Int32Array(n); bfsQ = new Int32Array(n); }
    stampN++;
    let head = 0, tail = 0;
    bfsQ[tail++] = start; stamp[start] = stampN; parent[start] = -1;
    let best = start, bs = map[start] * 0.8;
    const W = w.w;
    const diag = a.move === 'swim';
    while (head < tail && tail < 380) {
      const i = bfsQ[head++];
      const x = i % W, y = (i / W) | 0;
      if (Math.abs(x - x0) > R || Math.abs(y - y0) > R) continue;
      const s = map[i] * (0.55 + 0.45 * Math.random());
      if (s > bs) { bs = s; best = i; }
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
    if (best === start) { a.wait = 1 + Math.random() * 3; return; }
    const path = [];
    for (let i = best; i !== start && i >= 0; i = parent[i]) path.push(i);
    a.path = path; a.state = 'walk';
  }

  // -------------------------------------------------------------- introductions
  canIntroduce(def, x, y) {
    const w = this.game.world;
    if (!w.inb(x, y)) return 'Off the property.';
    const i = w.idx(x, y);
    if (!passable(w, i, def) || (def.move === 'swim' && !isWater(w.terrain[i]))) return def.move === 'swim' ? 'Fish need to be released into water.' : 'They can\'t be released here.';
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
      agents: this.agents.map(a => ({ ...a, path: null })),
      nextId: this.nextId,
      state: this.state.map(s => ({ discovered: s.discovered, lastYear: s.lastYear, blockedNotified: s.blockedNotified, births: s.births })),
      salmon: this.salmon, dams: this.dams,
    };
  }
  load(d) {
    this.agents = d.agents.map(a => ({ ...a, state: a.state === 'walk' ? 'idle' : a.state, wait: 0.5 }));
    this.nextId = d.nextId;
    d.state.forEach((s, k) => { if (this.state[k]) Object.assign(this.state[k], s); });
    this.salmon = d.salmon; this.dams = d.dams;
    this.recount();
  }
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
