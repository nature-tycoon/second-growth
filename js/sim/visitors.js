// Visitors: people drive in to a trailhead, walk the trails, and pay to see a wild place.
// More wildlife and scenery means a better rating and more visitors, but crowds on the
// trails push shy animals away.

import { T, F, H, clamp, money } from '../config.js';
import { STRUCTURES } from '../world.js';

const SEASON_DEMAND = [0.7, 0.9, 1.1, 1.3, 1.5, 1.4, 1.1, 1.0, 0.5, 0.35, 0.35, 0.5];
const NATIVE_HABITATS = new Set([H.MEADOW, H.SHRUB, H.YOUNG_FOREST, H.MATURE_FOREST, H.RIPARIAN, H.MARSH, H.POND, H.CREEK]);

export class Visitors {
  constructor(game) {
    this.game = game;
    this.agents = [];
    this.nextId = 1;
    this.monthly = 0; this.total = 0; this.rating = 0; this.rep = 0;
    this.income = 0; this.upkeep = 0; this.traffic = 0;
    this.seen = new Set(); this.seenLast = [];
    this.net = []; this.netSet = new Set();
    this.welcomed = false;
  }

  facilities() {
    const w = this.game.world;
    let parking = 0, center = 0;
    for (const s of w.structures) if (s) { if (s.type === 'parking') parking++; else if (s.type === 'center') center++; }
    let blinds = 0, boardwalk = 0;
    for (let i = 0; i < w.n; i++) { if (w.feature[i] === F.BLIND) blinds++; else if (w.feature[i] === F.BOARDWALK) boardwalk++; }
    return { parking, center, blinds, boardwalk };
  }

  isPath(i) {
    const w = this.game.world;
    return (w.terrain[i] === T.TRAIL || w.feature[i] === F.BOARDWALK) && !w.flood[i] && !w.fire[i];
  }

  // Trail tiles reachable on foot from a trailhead parking lot.
  network() {
    const w = this.game.world;
    const seen = new Set(), q = [];
    for (const s of w.structures) {
      if (!s || !STRUCTURES[s.type].visitor) continue;
      // people will cross a couple of tiles of grass from the lot to the trail
      for (let y = s.y - 2; y <= s.y + s.h + 1; y++) for (let x = s.x - 2; x <= s.x + s.w + 1; x++) {
        if (!w.inb(x, y)) continue;
        const i = w.idx(x, y);
        if (this.isPath(i) && !seen.has(i)) { seen.add(i); q.push(i); }
      }
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % w.w, y = (i / w.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!w.inb(x + dx, y + dy)) continue;
        const j = w.idx(x + dx, y + dy);
        if (!seen.has(j) && this.isPath(j)) { seen.add(j); q.push(j); }
      }
    }
    this.net = q; this.netSet = seen;
    return q;
  }

  daily() {
    const g = this.game, w = g.world;
    this.network();
    // what can be seen from the trails today
    for (const a of g.wildlife.agents) {
      if (a.leaving) continue;
      const x = Math.floor(a.x), y = Math.floor(a.y);
      if (!w.inb(x, y)) continue;
      if (w.distTrail[w.idx(x, y)] <= 3) this.seen.add(a.sp);
    }
    // a few walkers on screen, roughly in proportion to the month's visitors
    const want = this.net.length >= 4 ? Math.min(26, Math.round(this.monthly / 20)) : 0;
    if (this.agents.length < want && g.rng() < 0.6) this.spawnWalker();
    while (this.agents.length > want + 4) this.agents.shift();
  }

  spawnWalker() {
    const w = this.game.world;
    const heads = [];
    for (const s of w.structures) {
      if (!s || !STRUCTURES[s.type].visitor) continue;
      for (let y = s.y - 2; y <= s.y + s.h + 1; y++) for (let x = s.x - 2; x <= s.x + s.w + 1; x++) {
        if (w.inb(x, y) && this.netSet.has(w.idx(x, y))) heads.push(w.idx(x, y));
      }
    }
    if (!heads.length) return;
    const i = heads[Math.floor(Math.random() * heads.length)];
    this.agents.push({
      id: this.nextId++, x: (i % w.w) + 0.5, y: ((i / w.w) | 0) + 0.5, cur: i, prev: -1, next: -1,
      look: Math.floor(Math.random() * 8), life: 25 + Math.random() * 50, phase: Math.random() * 10, facing: 1, pause: 0,
    });
  }

  update(dt) {
    const w = this.game.world;
    for (let k = this.agents.length - 1; k >= 0; k--) {
      const a = this.agents[k];
      a.phase += dt * 6;
      if (a.pause > 0) { a.pause -= dt; continue; }
      if (a.next < 0) {
        const x = a.cur % w.w, y = (a.cur / w.w) | 0;
        const opts = [];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!w.inb(x + dx, y + dy)) continue;
          const j = w.idx(x + dx, y + dy);
          if (this.netSet.has(j) && j !== a.prev) opts.push(j);
        }
        if (!opts.length && a.prev >= 0 && this.netSet.has(a.prev)) opts.push(a.prev);
        if (!opts.length || a.life <= 0) { this.agents.splice(k, 1); continue; }
        a.next = opts[Math.floor(Math.random() * opts.length)];
        // people stop to look at things
        if (Math.random() < 0.08) a.pause = 0.5 + Math.random() * 2;
      }
      const tx = (a.next % w.w) + 0.5, ty = ((a.next / w.w) | 0) + 0.5;
      const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy), sp = 1.3 * dt;
      if (d <= sp) { a.x = tx; a.y = ty; a.prev = a.cur; a.cur = a.next; a.next = -1; a.life -= 1; }
      else { a.x += dx / d * sp; a.y += dy / d * sp; }
      a.dx = dx; a.dy = dy;
    }
  }

  // Scenery along the trails: variety of native habitat, water, old trees and flowers.
  scenery() {
    const w = this.game.world, net = this.net;
    if (!net.length) return { scenic: 0, invasive: 0 };
    let sum = 0, inv = 0, n = 0;
    const step = Math.max(1, Math.floor(net.length / 120));
    for (let k = 0; k < net.length; k += step) {
      const i = net[k], x = i % w.w, y = (i / w.w) | 0;
      const habs = new Set();
      let water = 0, old = 0, flowers = 0, bad = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (!w.inb(x + dx, y + dy)) continue;
        const j = w.idx(x + dx, y + dy);
        const h = w.habitat[j];
        if (NATIVE_HABITATS.has(h)) habs.add(h);
        if (h === H.POND || h === H.MARSH || h === H.CREEK || h === H.RIVER) water = 1;
        if (h === H.MATURE_FOREST) old = 1;
        flowers = Math.max(flowers, w.nectar[j]);
        if (h === H.INVASIVE || h === H.FARM) bad++;
      }
      sum += Math.min(1, habs.size / 5) * 0.45 + water * 0.2 + old * 0.2 + flowers * 0.15;
      inv += bad / 49;
      n++;
    }
    return { scenic: sum / n, invasive: inv / n };
  }

  monthEnd() {
    const g = this.game;
    const fac = this.facilities();
    this.network();
    const len = this.net.length;
    const { scenic, invasive } = this.scenery();
    const species = this.seen.size;
    this.seenLast = [...this.seen];
    this.seen.clear();
    const lengthScore = clamp(len / 110, 0, 1);
    const open = fac.parking > 0 && len >= 4;
    this.rating = open ? clamp(0.5 + species * 0.26 + scenic * 2.0 + lengthScore * 0.6 + Math.min(0.5, fac.blinds * 0.12) + (fac.center ? 0.4 : 0) - invasive * 1.2, 0, 5) : 0;
    this.rep += (this.rating - this.rep) * (this.rep ? 0.3 : 0.6);
    const demand = open ? (40 + 360 * Math.pow(this.rep / 5, 1.3)) * SEASON_DEMAND[g.month] * (0.4 + 0.6 * lengthScore) : 0;
    const capacity = fac.parking * 220 + fac.center * 380;
    this.monthly = Math.round(Math.min(capacity, demand));
    this.total += this.monthly;
    const perVisitor = 3 + (fac.center ? 4 : 0) + this.rep * 0.6;
    this.income = Math.round(this.monthly * perVisitor);
    this.upkeep = Math.round(len * 0.4 + fac.boardwalk * 1.5 + fac.center * 120 + fac.parking * 30);
    this.traffic = clamp(this.monthly / 320, 0, 1);
    g.earn(this.income);
    g.money -= this.upkeep;
    g.stats.visitorIncome = (g.stats.visitorIncome || 0) + this.income;
    let trailTiles = 0;
    for (let i = 0; i < g.world.n; i++) if (g.world.terrain[i] === T.TRAIL) trailTiles++;
    if (fac.parking && trailTiles >= 4 && len < 4 && !this.warnedGap) {
      this.warnedGap = true;
      g.notify('No one can reach your trail: it isn\'t connected to the trailhead parking. Extend it to within two tiles of the lot.', 'warn');
    }
    if (this.monthly > 0 && !this.welcomed) {
      this.welcomed = true;
      g.notify(`Your first visitors! ${this.monthly} people walked the trails this month and left ${money(this.income)} in donations. More wildlife and scenery near the trails means more visitors.`, 'good');
    }
    return { visitors: this.monthly, income: this.income, upkeep: this.upkeep };
  }

  serialize() {
    return { monthly: this.monthly, total: this.total, rating: this.rating, rep: this.rep, income: this.income, upkeep: this.upkeep, traffic: this.traffic, welcomed: this.welcomed, seenLast: this.seenLast };
  }
  load(d) { if (d) Object.assign(this, d); }
}
