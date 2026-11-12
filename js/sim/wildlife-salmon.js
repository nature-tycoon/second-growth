// The salmon run (part of the Wildlife class, sim/animals.js): spawners up the creeks in late
// summer, bears fishing them from the bank, fry and returning adults.

import { T, clamp } from '../config.js';
import { predationCatchChance } from './ecological-pressure.js';
import { facePoint } from './animal-positioning.js';
import { fishing, isFish } from './fishing.js';
import { simRandom } from './sim-random.js';

export const SALMON_RUN_MONTH = 7;
export const SALMON_MIN_HABITAT = 15;
const SALMON_REACH = 2.2; // (tiles: how far a bear on the bank can lunge into the creek)

export class WildlifeSalmon {
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
}
