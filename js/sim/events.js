// Natural disturbance: summer wildfires and winter floods.

import { T, F, isWater, clamp } from '../config.js';
import { PLANTS, PLANT } from '../data/plants.js';
import { ANIMALS } from '../data/animals.js';
import { killTree, trySeed } from './plants.js';

// Shrubs that resprout from their roots after a fire.
const RESPROUT = new Set(['salmonberry', 'snowberry', 'rose', 'oceanspray', 'willow', 'dogwood',
  'oregongrape', 'salal', 'vinemaple', 'elderberry', 'blackberry']);
// Chance a mature tree survives a ground fire. Thick-barked Douglas-fir and oak shrug it off.
const TREE_SURVIVAL = { fir: 0.9, oak: 0.85, maple: 0.5, cottonwood: 0.5, ash: 0.5, alder: 0.4, cedar: 0.4, hemlock: 0.3 };
const GRASSY = { grass: 1, tallgrass: 1, sedge: 0.5, forb: 0.6, tallforb: 0.7 };
const FLOOD_SEEDS = ['willow', 'cottonwood', 'sedge', 'canarygrass', 'alder'];

export class Events {
  constructor(game) {
    this.game = game;
    this.fireTiles = 0; this.floodTiles = 0;
    this.burned = 0; this.lastFire = -999; this.lastFlood = -999;
    this.fireStart = null; this.floodStart = null;
  }

  // How readily a tile burns right now (0..~1.5).
  fuel(w, i) {
    const t = w.terrain[i];
    if (isWater(t) || t === T.ROAD || t === T.TRAIL || t === T.GRAVEL || t === T.MUD || w.struct[i] >= 0 || w.flood[i]) return 0;
    let f = t === T.PASTURE ? 0.35 : 0;
    const g = w.ground[i], s = w.shrub[i], tr = w.tree[i];
    if (g) { const p = PLANTS[g]; f += w.groundG[i] * (GRASSY[p.look.type] ?? 0.2) * (p.invasive ? 1.1 : 0.7); }
    if (s) { const p = PLANTS[s]; f += w.shrubG[i] * (p.key === 'broom' ? 1.6 : p.key === 'blackberry' ? 1.2 : 0.6); }
    if (tr) f += w.treeG[i] < 0.6 ? 0.5 * w.treeG[i] : 0.2;
    const ft = w.feature[i];
    if (ft === F.SNAG || ft === F.LOG || ft === F.BRUSH) f += 0.4;
    const dryness = clamp((0.62 - w.moist[i]) / 0.4, 0, 1);
    return f * dryness;
  }

  fuelLoad() {
    const w = this.game.world, rng = this.game.rng;
    let s = 0;
    for (let k = 0; k < 300; k++) s += this.fuel(w, Math.floor(rng() * w.n));
    return s / 300;
  }

  daily() {
    const g = this.game, rng = g.rng, m = g.month;
    this.updateFire();
    this.updateFlood();
    const w = g.world;
    for (let i = 0; i < w.n; i++) if (w.scorch[i] > 0) w.scorch[i] -= 1;

    // Late-summer droughts bring fire; visitors add a little risk.
    if (!this.fireTiles && m >= 4 && m <= 6 && g.dryStreak >= 6 && g.day - this.lastFire > 60) {
      const p = 0.012 * (0.4 + this.fuelLoad() * 1.5) * (1 + g.visitors.traffic * 0.8);
      if (rng() < p) this.ignite();
    }
    // Long winter rains swell the river.
    if (!this.floodTiles && (m >= 8 || m === 0) && g.rainStreak >= 3 && g.day - this.lastFlood > 45 && rng() < 0.09) {
      this.startFlood(0.7 + rng() * 1.1);
    }
  }

  // ------------------------------------------------------------ fire
  ignite(at = null) {
    const g = this.game, w = g.world, rng = g.rng;
    let best = at, bf = 0.25;
    if (best == null) {
      for (let k = 0; k < 60; k++) {
        const i = Math.floor(rng() * w.n);
        let f = this.fuel(w, i);
        if (w.distTrail[i] <= 2) f *= 1 + g.visitors.traffic;
        if (f > bf) { bf = f; best = i; }
      }
    }
    if (best == null) return false;
    this.burned = 0;
    this.lastFire = g.day;
    this.burnTile(best);
    this.fireStart = best;
    const x = best % w.w, y = (best / w.w) | 0;
    const cause = g.visitors.traffic > 0.2 && w.distTrail[best] <= 2 ? 'A stray campfire spark' : 'A dry lightning strike';
    g.notify(`Wildfire! ${cause} started a fire in the dry grass. It will spread through dry fuel until rain comes. Send a fire crew (Remove tab) or let it burn: fire renews meadows but kills young forest.`, 'fire', { x: x + 0.5, y: y + 0.5 });
    g.emit('event', 'fire');
    return true;
  }

  burnTile(i) {
    const g = this.game, w = g.world, rng = g.rng;
    w.fire[i] = 2 + Math.floor(rng() * 2);
    w.scorch[i] = 160;
    this.burned++;
    const gi = w.ground[i];
    if (gi) {
      if (PLANTS[gi].invasive) w.groundG[i] *= 0.4;
      else w.groundG[i] = Math.min(w.groundG[i], 0.25);
    }
    const si = w.shrub[i];
    if (si) {
      if (RESPROUT.has(PLANTS[si].key) && w.shrubG[i] > 0.3) w.shrubG[i] = 0.12;
      else { w.shrub[i] = 0; w.shrubG[i] = 0; }
    }
    const ti = w.tree[i];
    if (ti) {
      const p = PLANTS[ti];
      if (w.treeG[i] < 0.5) { w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0; }
      else if (rng() > (TREE_SURVIVAL[p.key] ?? 0.4) * w.treeG[i]) killTree(w, i, rng);
    }
    const f = w.feature[i];
    if (f === F.BRUSH || f === F.FENCE || f === F.NESTBOX || f === F.BLIND || (f === F.LOG && rng() < 0.5)) w.feature[i] = 0;
    w.soil[i] = Math.min(1, w.soil[i] + 0.03);
    // wildlife caught in the flames
    const wl = g.wildlife;
    for (const map of wl.suit) map[i] = 0;
    const x = i % w.w, y = (i / w.w) | 0;
    for (const a of wl.agents.slice()) {
      if (a.leaving || a.move === 'fly' || a.move === 'swim') continue;
      if (Math.floor(a.x) !== x || Math.floor(a.y) !== y) continue;
      const def = ANIMALS[a.sp];
      if (def.speed < 0.7 && rng() < 0.4) wl.remove(a, 'fire');
      else { a.state = 'idle'; a.wait = 0; }
    }
  }

  updateFire() {
    const g = this.game, w = g.world, rng = g.rng;
    let count = 0;
    const next = [];
    const raining = g.weather === 'rain' || g.weather === 'snow';
    for (let i = 0; i < w.n; i++) {
      if (!w.fire[i]) continue;
      if (raining) { w.fire[i] = 0; continue; }
      count++;
      w.fire[i]--;
      const x = i % w.w, y = (i / w.w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy;
        if (!w.inb(xx, yy)) continue;
        const j = w.idx(xx, yy);
        if (w.fire[j] || w.scorch[j] > 60) continue;
        // fire runs uphill faster
        const up = clamp(1 + (w.tileH(xx, yy) - w.tileH(x, y)) * 0.6, 0.6, 1.8);
        if (rng() < 0.42 * this.fuel(w, j) * up * (dx && dy ? 0.7 : 1)) next.push(j);
      }
    }
    for (const j of next) if (!w.fire[j]) this.burnTile(j);
    const was = this.fireTiles;
    this.fireTiles = count + next.length;
    if (was && !this.fireTiles) {
      g.notify(raining
        ? `Rain has put out the fire after ${this.burned} tiles burned. Watch camas, lupine and fireweed come back strong in the ash.`
        : `The fire burned itself out after ${this.burned} tiles. Burned meadows green up fast; young forest will take years.`, 'info');
      w.hydroDirty = true;
      g.emit('event', 'fire-out');
    }
  }

  extinguish(i) {
    const w = this.game.world;
    if (!w.fire[i]) return false;
    w.fire[i] = 0;
    return true;
  }

  // ------------------------------------------------------------ flood
  startFlood(intensity) {
    const g = this.game, w = g.world, rng = g.rng;
    let wetland = 0;
    for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.MARSH || w.terrain[i] === T.POND) wetland++;
    wetland += g.wildlife.dams * 8;
    const sponge = clamp(wetland / 380, 0, 0.6);
    const eff = intensity * (1 - sponge);
    // Floodwater reaches land that sits only a little above its nearest river or creek
    // ("height above nearest drainage"): wide on the river's floodplain, narrow along creeks.
    const srcH = new Float32Array(w.n).fill(NaN), srcRiver = new Uint8Array(w.n), dist = new Uint8Array(w.n).fill(255);
    const q = [];
    for (let i = 0; i < w.n; i++) {
      const t = w.terrain[i];
      if (t === T.RIVER || (t === T.CREEK && w.connected[i])) {
        srcH[i] = w.tileH(i % w.w, (i / w.w) | 0); srcRiver[i] = t === T.RIVER ? 1 : 0; dist[i] = 0; q.push(i);
      }
    }
    let flooded = 0;
    const days = 4 + Math.round(intensity * 4);
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const x = i % w.w, y = (i / w.w) | 0;
      const reach = srcRiver[i] ? 9 : 3;
      if (dist[i] >= reach) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (!w.inb(xx, yy)) continue;
        const j = w.idx(xx, yy);
        if (dist[j] !== 255 || w.struct[j] >= 0) continue;
        dist[j] = dist[i] + 1; srcH[j] = srcH[i]; srcRiver[j] = srcRiver[i];
        const above = w.tileH(xx, yy) - srcH[j];
        const limit = eff * (srcRiver[j] ? 1.1 : 0.45);
        if (above > limit) continue;
        if (!isWater(w.terrain[j]) && !w.flood[j]) { w.flood[j] = days; flooded++; }
        q.push(j);
      }
    }
    this.lastFlood = g.day;
    if (!flooded) return;
    this.floodTiles = flooded;
    // big floods can blow out beaver dams
    let broke = 0;
    for (let i = 0; i < w.n; i++) if (w.feature[i] === F.DAM && rng() < 0.12 * intensity) { w.feature[i] = 0; broke++; }
    if (broke) { g.wildlife.dams = Math.max(0, g.wildlife.dams - broke); w.hydroDirty = true; }
    const soak = Math.round(sponge * 100);
    const first = [...Array(w.n).keys()].find(i => w.flood[i]);
    g.notify(`Winter flood! After days of rain the river spilled over ${flooded} tiles of low ground.` +
      (soak >= 10 ? ` Your wetlands soaked up about ${soak}% of it.` : ' More marshes and ponds would soak some of it up.') +
      (broke ? ` The high water broke ${broke} beaver dam${broke > 1 ? 's' : ''}.` : ''), 'flood',
      first != null ? { x: (first % w.w) + 0.5, y: ((first / w.w) | 0) + 0.5 } : null);
    g.emit('event', 'flood');
  }

  updateFlood() {
    if (!this.floodTiles) return;
    const g = this.game, w = g.world, rng = g.rng;
    let count = 0;
    for (let i = 0; i < w.n; i++) {
      if (!w.flood[i]) continue;
      count++;
      const gi = w.ground[i], si = w.shrub[i], ti = w.tree[i];
      if (gi) { const p = PLANTS[gi]; if (!p.wetOK && !p.aquatic) { w.groundG[i] -= 0.05; if (w.groundG[i] <= 0) { w.ground[i] = 0; w.groundG[i] = 0; } } }
      if (si && !PLANTS[si].wetOK && w.shrubG[i] < 0.35) { w.shrub[i] = 0; w.shrubG[i] = 0; }
      if (ti && !PLANTS[ti].wetOK && PLANTS[ti].moist[1] < 0.95 && w.treeG[i] < 0.3) { w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0; }
      w.flood[i]--;
      if (!w.flood[i]) {
        // receding water leaves fresh silt and a scatter of floodplain seeds
        w.soil[i] = Math.min(1, w.soil[i] + 0.04);
        if (rng() < 0.12) trySeed(w, PLANT[FLOOD_SEEDS[Math.floor(rng() * FLOOD_SEEDS.length)]], i, rng);
      }
    }
    const was = this.floodTiles;
    this.floodTiles = count;
    if (was && !count) {
      g.notify('The floodwaters have gone down, leaving fresh silt. Willow and cottonwood seeds love it (and so does reed canarygrass).', 'info');
      g.emit('event', 'flood-out');
    }
  }

  serialize() { return { lastFire: this.lastFire, lastFlood: this.lastFlood, fireTiles: this.fireTiles, floodTiles: this.floodTiles, burned: this.burned }; }
  load(d) { if (d) Object.assign(this, d); }
}
