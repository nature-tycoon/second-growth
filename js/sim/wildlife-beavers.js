// Beavers re-engineer the land (part of the Wildlife class, sim/animals.js): dams, the pools
// behind them, and the creek reopening when a dam is let go (beaver-ponds.js has the site rules).

import { T, F, isWater, DAYS_PER_MONTH } from '../config.js';
import { removeTree } from './plants.js';
import { moment } from './moments.js';
import { damSiteOK, beaverFood, FOOD_MIN, drainToMeadow, meadowTile } from './beaver-ponds.js';
import { hashJitter } from './wildlife-shared.js';
import { DAM_RAISE } from './hollis-water.js';

// Beavers raise their dams mostly from early summer to the freeze-up (months from March: June to
// November), a step on the first day of each of those months while the colony tends it.
const RAISE_MONTHS = [3, 4, 5, 6, 7, 8];

// world.marks bits under a beaver pool (1, 2, 4 and 8 are taken by trails, reef stars, canal blocks and shade cloth; 64 is PLACED)
const POOL_CREEK = 16, POOL_LAND = 32;

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

export class WildlifeBeavers {
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

  // (rise: how far up it is built; a colony starts it low and raises it over the years. Checks
  // pass 1 to stand up a full dam at once)
  buildDam(site, rise = 0) {
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
    if (rise > 0 && this.game.water?.raiseDam(site, rise)) this.game.water.sync();
    this.fellAtDam(site);
    this.dams++;
    w.hydroDirty = true; w.renderDirty = true;
    this.game.flags.beaverDam = true;
    moment(this.game, 'dam', { x: x + 0.5, y: y + 0.5 });
    this.game.notify(this.game.water ? 'Beavers built a dam! A pond is filling behind it, with marsh round its edges. The trees it drowns will stand as snags for herons and woodpeckers.' : 'Beavers built a dam! The creek is backing up into a brand-new wetland, and the drowned trees will become snags.', 'good', { x: x + 0.5, y: y + 0.5 });
  }

  // The woody plants on the banks where the dam's ends land (the dry tiles either side of its
  // mounds): beavers cut them for the dam, and cut the regrowth each time they raise it, so no tree
  // stands through a mound. (Those in the pond drown anyway. Water model only: the line is the water's.)
  fellAtDam(site) {
    const w = this.game.world, rng = this.game.rng, b = this.game.water?.basins.find(b => b.kind === 'dam' && b.site === site);
    let felled = false;
    const P = w.catalog.plants;
    for (const e of b?.dam || []) for (const j of e) {
      const t = w.terrain[j];
      if (t === T.POND || t === T.CREEK || t === T.RIVER) continue; // (marsh margin is bank)
      // (the sapling waiting under a tree goes first, or it would take the tree's place through the mound)
      if (w.understory?.[j]) { w.understory[j] = 0; w.understoryG[j] = 0; felled = true; }
      // (a big tree they can't use comes down as a log along the bank; the rest go into the dam)
      if (w.tree[j]) { removeTree(w, j, 'beaver', rng, w.treeG[j] >= .75 && !P[w.tree[j]].beaverFood ? { snagOdds: 0 } : { deadwood: false }); felled = true; }
      // (willow and the like cut back to resprout, as they browse it; other shrubs cleared)
      if (w.shrub[j] && P[w.shrub[j]].beaverFood) { if (w.shrubG[j] > .15) { w.shrubG[j] = .15; felled = true; } }
      else if (w.shrub[j]) { w.shrub[j] = 0; w.shrubG[j] = 0; felled = true; }
    }
    if (felled) w.renderDirty = true;
  }

  // Daily: a dam is only as good as the beavers keeping it up. One no beaver has tended for
  // half a year starts to leak and, usually within the year after, washes out.
  damDay() {
    const w = this.game.world, rng = this.game.rng, keepers = this.agents.filter(a => this.game.catalog.animals[a.sp].damBuilder && !a.leaving);
    let dams = 0;
    const raising = this.game.water && this.game.day % DAYS_PER_MONTH === 0 && RAISE_MONTHS.includes(this.game.month), raised = [];
    for (let i = 0; i < w.n; i++) {
      if (w.feature[i] !== F.DAM || (w.marks[i] & 4)) continue; // (canal blocks are people's work)
      const x = i % w.w + 0.5, y = (i / w.w | 0) + 0.5;
      // (featureAge: days since tended. A colony keeps its dam up while there is food round it;
      // once the willow and alder are eaten out it moves on, and the dam is left to go)
      if (this.game.day % 30 === 0 || !this.damFood.has(i)) this.damFood.set(i, beaverFood(w, i));
      if (this.damFood.get(i) >= FOOD_MIN && keepers.some(a => a.home?.center === i || Math.abs(a.x - x) < 8 && Math.abs(a.y - y) < 8)) {
        w.featureAge[i] = 0; // (its colony's lodge is here: home-range.js)
        if (raising && this.game.water.raiseDam(i, DAM_RAISE)) raised.push(i); // (a tended dam goes up a step)
      }
      else if (w.featureAge[i] > 60 && rng() < 1 / 120) { this.breakDam(i); this.game.notify('An abandoned beaver dam has washed out. The pond is draining, and its bed will grow into a wet beaver meadow of sedge, willow and standing dead trees.', 'info', { x, y }); continue; }
      dams++;
    }
    if (raised.length) { this.game.water.sync(); for (const i of raised) this.fellAtDam(i); }
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
}
