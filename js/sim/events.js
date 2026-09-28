// Natural disturbance: summer wildfires and winter floods.

import { T, F, isWater, clamp, DAYS_PER_YEAR } from '../config.js';
import { PLANTS, PLANT } from '../data/plants.js';
import { ANIMALS } from '../data/animals.js';
import { killTree, trySeed } from './plants.js';
import { disturbanceOn } from './campaign.js';
import { biome } from '../biome.js';

const GRASSY = { grass: 1, tallgrass: 1, sedge: 0.5, forb: 0.6, tallforb: 0.7 };
const SEVERE_GAP = 4 * DAYS_PER_YEAR; // at most one crown fire every few years

export class Events {
  constructor(game) {
    this.game = game;
    this.fireTiles = 0; this.floodTiles = 0;
    this.burned = 0; this.lastFire = -999; this.lastFlood = -999;
    this.fireStart = null; this.floodStart = null;
    // A rare crown fire: hot enough to carry through the canopy. Heat fades over a couple of weeks.
    this.severe = false; this.heat = 0; this.lastSevere = -999; this.severeTiles = [];
  }

  // How readily a tile burns right now (0..~1.5).
  fuel(w, i) {
    const t = w.terrain[i];
    if (isWater(t) || t === T.ROAD || t === T.TRAIL || t === T.GRAVEL || t === T.MUD || w.struct[i] >= 0 || w.flood[i]) return 0;
    let f = t === T.PASTURE ? 0.35 : 0;
    const g = w.ground[i], s = w.shrub[i], tr = w.tree[i];
    if (g) { const p = PLANTS[g]; f += w.groundG[i] * (GRASSY[p.look.type] ?? 0.2) * (p.invasive ? 1.1 : 0.7); }
    if (s) { const p = PLANTS[s]; f += w.shrubG[i] * (p.fuel ?? 0.6); }
    const hot = this.severe && this.heat > 0.3;
    // in a crown fire the canopy itself burns, not just what's under it
    if (tr) f += w.treeG[i] < 0.6 ? 0.5 * w.treeG[i] : hot ? 0.9 * this.heat : 0.2;
    const ft = w.feature[i];
    if (ft === F.SNAG || ft === F.LOG || ft === F.BRUSH) f += 0.4;
    const dryness = hot ? clamp((0.85 - w.moist[i]) / 0.45, 0, 1) : clamp((0.62 - w.moist[i]) / 0.4, 0, 1);
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

    // In the campaign, fires and floods start in the chapter that teaches them.
    if (!disturbanceOn(g)) return;
    // Late-summer droughts bring fire; visitors add a little risk.
    // (fireRate / fireGap: savannas burn far more often, every dry season, than forests do)
    const cl = biome.climate;
    if (!this.fireTiles && cl.fireMonths.includes(m) && g.dryStreak >= 6 && g.day - this.lastFire > (cl.fireGap ?? 60)) {
      const p = 0.012 * (cl.fireRate ?? 1) * (0.4 + this.fuelLoad() * 1.5) * (1 + g.visitors.traffic * 0.8) * g.diff.disasters;
      if (rng() < p) {
        // Once in a long while a deep drought and a heat wave line up and the fire goes into the crowns.
        const severe = cl.crownFires !== false && g.dryStreak >= 8 && g.day - this.lastSevere > SEVERE_GAP && rng() < 0.3;
        this.ignite(null, severe);
      }
    }
    if (this.severe) this.heat *= 0.93;
    // Long winter rains swell the river.
    if (!this.floodTiles && biome.climate.floodMonths.includes(m) && g.rainStreak >= 3 && g.day - this.lastFlood > 45 && rng() < 0.09 * g.diff.disasters) {
      this.startFlood(0.7 + rng() * 1.1);
    }
  }

  // ------------------------------------------------------------ fire
  ignite(at = null, severe = false) {
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
    this.severe = severe; this.heat = severe ? 1 : 0; this.severeTiles = [];
    if (severe) this.lastSevere = g.day;
    this.burnTile(best);
    this.fireStart = best;
    const x = best % w.w, y = (best / w.w) | 0;
    // each map names its own causes: [natural, visitors] and optionally a neighbour's burn
    const causes = biome.climate.fireCause;
    const cause = g.visitors.traffic > 0.2 && w.distTrail[best] <= 2 ? causes[1] : (causes[2] && g.rng() < 0.6 ? causes[2] : causes[0]);
    g.notify(severe
      ? `Crown fire! ${cause} in a heat wave has started a fire hot enough to climb into the treetops. It can burn through forest, leaving standing snags, and meadows will take over the burn. Fire crews can hold the edges.`
      : `Wildfire! ${cause} started a fire in the dry grass. It will spread through dry fuel until rain comes. Send a fire crew (Remove tab) or let it burn: fire renews meadows but kills young forest.`, 'fire', { x: x + 0.5, y: y + 0.5 });
    g.emit('event', 'fire');
    return true;
  }

  burnTile(i) {
    const g = this.game, w = g.world, rng = g.rng;
    w.fire[i] = 2 + Math.floor(rng() * 2);
    w.scorch[i] = 160;
    this.burned++;
    if (this.severe && this.heat > 0.3 && (w.tree[i] || w.shrub[i])) return this.crownBurn(i);
    const gi = w.ground[i];
    if (gi) {
      const bank = w.seedbank?.[i];
      // fire clears the weeds and the native seed bank germinates in the ash (on healthy land)
      if (PLANTS[gi].invasive && bank && Math.random() < (w.bankStrength || 0)) { w.ground[i] = bank; w.groundG[i] = 0.12; }
      else if (PLANTS[gi].invasive) w.groundG[i] *= 0.4;
      else w.groundG[i] = Math.min(w.groundG[i], 0.25);
    }
    const si = w.shrub[i];
    if (si) {
      if (PLANTS[si].resprout && w.shrubG[i] > 0.3) w.shrubG[i] = 0.12;
      else { w.shrub[i] = 0; w.shrubG[i] = 0; }
    }
    const ti = w.tree[i];
    if (ti) {
      const p = PLANTS[ti];
      if (w.treeG[i] < 0.5) { w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0; }
      else if (rng() > (p.fireSurvival ?? 0.4) * w.treeG[i]) killTree(w, i, rng);
    }
    this.burnFeaturesAndWildlife(i);
  }

  // A stand-replacing burn: the canopy dies standing, the understory and duff burn off,
  // and the tile is left open for fireweed and grasses.
  crownBurn(i) {
    const w = this.game.world, rng = this.game.rng;
    w.ground[i] = 0; w.groundG[i] = 0;
    const si = w.shrub[i];
    if (si && PLANTS[si].resprout && w.shrubG[i] > 0.5 && rng() < 0.3) w.shrubG[i] = 0.08;
    else { w.shrub[i] = 0; w.shrubG[i] = 0; }
    const ti = w.tree[i];
    if (ti) {
      const p = PLANTS[ti];
      if (w.treeG[i] < 0.5) { w.tree[i] = 0; w.treeG[i] = 0; w.treeAge[i] = 0; }
      // even thick-barked firs rarely survive a crown fire
      else if (rng() > (p.fireSurvival ?? 0.4) * 0.2) killTree(w, i, rng, 0.9);
    }
    this.severeTiles.push(i);
    this.burnFeaturesAndWildlife(i);
  }

  burnFeaturesAndWildlife(i) {
    const g = this.game, w = g.world, rng = g.rng;
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
        if (rng() < (this.severe ? 0.42 + 0.12 * this.heat : 0.42) * (biome.climate.fireSpread ?? 1) * this.fuel(w, j) * up * (dx && dy ? 0.7 : 1)) next.push(j);
      }
    }
    for (const j of next) if (!w.fire[j]) this.burnTile(j);
    const was = this.fireTiles;
    this.fireTiles = count + next.length;
    if (was && !this.fireTiles && this.severe) {
      const n = this.reseedBurn();
      g.notify(`The crown fire is out after ${this.burned} tiles burned. ${n.snags} standing snags are left where the forest was. ` +
        biome.text.crownOut, 'info');
      this.severe = false; this.heat = 0;
      w.hydroDirty = true;
      g.emit('event', 'fire-out');
    } else if (was && !this.fireTiles) {
      g.notify(raining
        ? `Rain has put out the fire after ${this.burned} tiles burned. ${biome.text.fireOutRain}`
        : `The fire burned itself out after ${this.burned} tiles. ${biome.text.fireOut}`, 'info');
      w.hydroDirty = true;
      g.emit('event', 'fire-out');
    }
  }

  // After a crown fire: the canopy is gone, so light pours in and pioneers seed the burn.
  reseedBurn() {
    const g = this.game, w = g.world, rng = g.rng;
    g.refreshEnvironment();
    let snags = 0;
    for (const i of this.severeTiles) {
      if (w.feature[i] === F.SNAG) snags++;
      if (w.ground[i] || w.tree[i] || isWater(w.terrain[i])) continue;
      if (rng() < 0.65) trySeed(w, PLANT[biome.burnSeeds[Math.floor(rng() * biome.burnSeeds.length)]], i, rng);
    }
    this.severeTiles = [];
    return { snags };
  }

  extinguish(i) {
    const w = this.game.world;
    if (!w.fire[i]) return false;
    w.fire[i] = 0;
    return true;
  }

  // ------------------------------------------------------------ flood
  // How much of a flood the farm's wetlands soak up (0..0.6).
  sponge() {
    const g = this.game, w = g.world;
    let wetland = 0;
    for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.MARSH || w.terrain[i] === T.POND) wetland++;
    wetland += g.wildlife.dams * 8;
    return clamp(wetland / 380, 0, 0.6);
  }

  // Dry land a flood of this strength would reach (1 = underwater), after the wetlands' share.
  floodReach(intensity) {
    const w = this.game.world, out = new Uint8Array(w.n);
    const eff = intensity * (1 - this.sponge());
    this.reachFrom(eff, (j) => { if (!isWater(w.terrain[j])) out[j] = 1; });
    return out;
  }

  // For the Flood risk overlay: 2 = floods most winters, 1 = only in a big flood, 0 = safe.
  floodRisk() {
    const common = this.floodReach(1.0), big = this.floodReach(1.8), out = new Uint8Array(common.length);
    for (let i = 0; i < out.length; i++) out[i] = common[i] ? 2 : big[i] ? 1 : 0;
    return out;
  }

  startFlood(intensity) {
    const g = this.game, w = g.world, rng = g.rng;
    const sponge = this.sponge();
    const eff = intensity * (1 - sponge);
    const days = 4 + Math.round(intensity * 4);
    let flooded = 0;
    this.reachFrom(eff, j => { if (!isWater(w.terrain[j]) && !w.flood[j]) { w.flood[j] = days; flooded++; } });
    this.finishFlood(intensity, sponge, flooded);
  }

  // Walk out from the river and connected creeks over land that sits only a little above them
  // ("height above nearest drainage"): wide on the river's floodplain, narrow along creeks.
  reachFrom(eff, visit) {
    const w = this.game.world;
    const srcH = new Float32Array(w.n).fill(NaN), srcRiver = new Uint8Array(w.n), dist = new Uint8Array(w.n).fill(255);
    const q = [];
    for (let i = 0; i < w.n; i++) {
      const t = w.terrain[i];
      if (t === T.RIVER || (t === T.CREEK && w.connected[i])) {
        srcH[i] = w.tileH(i % w.w, (i / w.w) | 0); srcRiver[i] = t === T.RIVER ? 1 : 0; dist[i] = 0; q.push(i);
      }
    }
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
        visit(j);
        q.push(j);
      }
    }
  }

  finishFlood(intensity, sponge, flooded) {
    const g = this.game, w = g.world, rng = g.rng;
    this.lastFlood = g.day;
    if (!flooded) return;
    this.floodTiles = flooded;
    // big floods can blow out beaver dams
    let broke = 0;
    for (let i = 0; i < w.n; i++) if (w.feature[i] === F.DAM && rng() < 0.12 * intensity) { w.feature[i] = 0; broke++; }
    if (broke) { g.wildlife.dams = Math.max(0, g.wildlife.dams - broke); w.hydroDirty = true; }
    const soak = Math.round(sponge * 100);
    // point the notice at the middle of the flooded ground
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < w.n; i++) if (w.flood[i]) { sx += i % w.w; sy += (i / w.w) | 0; n++; }
    g.notify(`${biome.text.flood} After days of rain the river spilled over ${flooded} tiles of low ground.` +
      (soak >= 10 ? ` Your wetlands soaked up about ${soak}% of it.` : ' More marshes and ponds would soak some of it up.') +
      (broke ? ` The high water broke ${broke} beaver dam${broke > 1 ? 's' : ''}.` : ''), 'flood',
      n ? { x: sx / n + 0.5, y: sy / n + 0.5 } : null);
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
        if (rng() < 0.12) trySeed(w, PLANT[biome.floodSeeds[Math.floor(rng() * biome.floodSeeds.length)]], i, rng);
      }
    }
    const was = this.floodTiles;
    this.floodTiles = count;
    if (was && !count) {
      if (!g.flags.floodExplained) g.notify(`The floodwaters have gone down, leaving fresh silt. ${biome.text.floodOut}`, 'info');
      g.flags.floodExplained = true;
      g.emit('event', 'flood-out');
    }
  }

  serialize() {
    return { lastFire: this.lastFire, lastFlood: this.lastFlood, fireTiles: this.fireTiles, floodTiles: this.floodTiles, burned: this.burned,
      severe: this.severe, heat: this.heat, lastSevere: this.lastSevere, severeTiles: this.severeTiles };
  }
  load(d) { if (d) Object.assign(this, d); }
}
