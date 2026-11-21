// First gameplay slice: weather-fed standing water and terrain-shaped beaver pools.
// Small reservoirs use the same two ground triangles as Terrain. This deliberately
// keeps the creek/river boundary flow and regional floods in their existing systems.
import { T, F, isWater } from '../config.js';

import { WATER_FILL } from './waterline.js';
import { valueNoise } from '../rng.js';
import { isFall } from '../maps/landform.js';
export { WATER_FILL };
const neighbours = (w, i) => {
  const x = i % w.w, y = Math.floor(i / w.w), out = [];
  if (x) out.push(i - 1); if (x + 1 < w.w) out.push(i + 1);
  if (y) out.push(i - w.w); if (y + 1 < w.h) out.push(i + w.w);
  return out;
};

// Clip a triangle at a horizontal waterline; integrate depth over its wet polygon.
// Returns volume per unit tile area, without assuming that the whole tile is wet.
export function tileWaterVolume(c, level) {
  let volume = 0;
  const points = [[0, 0, c[0]], [1, 0, c[1]], [1, 1, c[2]], [0, 1, c[3]]];
  for (const tri of [[0, 2, 1], [0, 3, 2]]) {
    const input = tri.map(k => points[k]), poly = [];
    for (let k = 0; k < 3; k++) {
      const a = input[k], b = input[(k + 1) % 3], wa = a[2] < level, wb = b[2] < level;
      if (wa) poly.push(a);
      if (wa !== wb) {
        const t = (level - a[2]) / (b[2] - a[2]);
        poly.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), level]);
      }
    }
    for (let k = 1; k + 1 < poly.length; k++) {
      const [a, b, d] = [poly[0], poly[k], poly[k + 1]];
      const area = Math.abs((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])) / 2;
      volume += area * (level - (a[2] + b[2] + d[2]) / 3);
    }
  }
  return Math.max(0, volume);
}
export function groundCentre(c) { return (c[0] + c[2]) / 2; }

// On for Hollis Farm (decision 0034). ?water=0 in the address switches it off to compare with the
// old fixed ponds and marks-based beaver flooding; tests can set waterModel.enabled.
export const waterModel = {
  enabled: typeof location === 'undefined' || new URLSearchParams(location.search).get('water') !== '0',
};
export const waterModelOn = map => waterModel.enabled && map === 'pnw';

// A beaver dam: about 1.1 m of water above the creek bed (a level is 2.4 m; real dams are mostly
// under 1.5 m), lowered where the valley is flat enough that a pond would spread past DAM_CELLS
// tiles (0.4 ha at 8 m tiles: a large beaver pond). Open water where it stands deeper than
// POND_DEPTH (about 0.6 m), marsh in the shallows round it.
export const DAM_HEAD = .6, DAM_CELLS = 60, POND_DEPTH = .25, DAM_POND_DEPTH = .15, WET_DEPTH = .04;
// A dam runs bank to bank along its line, up to DAM_SPAN tiles (64 m: most beaver dams are 5-30 m,
// a few over 100), and its pond stands SPILL_MARGIN under the lowest bank the water would get
// round it at (its shown level rounds to 0.02, so it never stands over that bank).
export const DAM_SPAN = 8, SPILL_MARGIN = .01;
// A dam grows (b.rise, 0 new to 1 full): a colony throws up a low dam that backs the creek up
// DAM_START over its own water (about 30 cm: just enough to still it into a pond), and raises it
// toward its full crest a step at a time through the building months (wildlife-beavers.js damDay):
// about half way the first season, full the next, so the pond deepens and spreads over its first
// two years. (A colony mostly lasts a few years before the willow runs out: at a third of this,
// its pond was rarely more than marsh, and beavers fell off in the soak.)
// A flood that breaches a tended dam knocks it down DAM_BREACH; they raise it again.
export const DAM_START = .13, DAM_RAISE = .15, DAM_BREACH = .2;
// A beaver pond raises the water table round it: land beside its water, up to FRINGE_REACH tiles out
// and up to about FRINGE over the pond's usual level, is saturated marsh, a sedge margin that
// follows the lie of the land. How far it reaches varies slowly along the shore (old channels and
// hummocks the land's heights don't have), so it pushes out in bays and pulls in at spits rather
// than lying in a band. Since terrain relief (0044) cut the Hollis ditch into a smooth swale, a
// dam's water alone filled only its channel.
export const FRINGE = .2, FRINGE_REACH = 4;

export class HollisWater {
  constructor(w, saved = null) {
    this.w = w; this.basins = []; this.hv = -1; this.near = null;
    this.base = w.terrain.slice(); this.published = w.terrain.slice();
    this.wetDays = new Uint16Array(w.n);
    w.waterLevel = new Float32Array(w.n).fill(NaN);
    w.waterDepth = new Float32Array(w.n);
    w.waterManaged = new Uint8Array(w.n);
    w.waterOwner = new Int32Array(w.n).fill(-1);
    w.waterWetDays = this.wetDays;
    this.pending = [];
    if (saved) {
      if (saved.v !== 1 || saved.base?.length !== w.n || saved.wetDays?.length !== w.n || !Array.isArray(saved.basins)) throw new Error('Invalid saved water');
      if (saved.base.some(v => !Number.isInteger(v) || v < 0 || v > T.TRAIL) || saved.wetDays.some(v => !Number.isInteger(v) || v < 0 || v > 65535)) throw new Error('Invalid saved water terrain');
      this.base.set(saved.base); this.wetDays.set(saved.wetDays);
      for (const b of saved.basins) {
        if (!['pond', 'dam', 'receding'].includes(b.kind) || !Number.isInteger(b.site) || b.site < 0 || b.site >= w.n || !Number.isFinite(b.volume) || b.volume < 0 || !Number.isFinite(b.crest) || !Array.isArray(b.axis) || b.axis.length !== 2 || !b.axis.every(Number.isFinite) || Math.abs(b.axis[0]) + Math.abs(b.axis[1]) !== 1 || (b.shown != null && !Number.isFinite(b.shown)) || (b.rise != null && !(b.rise >= 0 && b.rise <= 1))) throw new Error('Invalid saved reservoir');
      }
      this.pending = saved.basins;
    }
    this.sync();
  }
  corners(i) { return this.w.corners(i % this.w.w, Math.floor(i / this.w.w)); }
  nominal(i) { return Math.min(...this.corners(i)) + (WATER_FILL[this.base[i]] || 0); }
  sill(a, b) {
    const w = this.w, x = a % w.w, y = Math.floor(a / w.w);
    if (b === a + 1) return Math.min(w.vert(x + 1, y), w.vert(x + 1, y + 1));
    if (b === a - 1) return Math.min(w.vert(x, y), w.vert(x, y + 1));
    if (b > a) return Math.min(w.vert(x, y + 1), w.vert(x + 1, y + 1));
    return Math.min(w.vert(x, y), w.vert(x + 1, y));
  }
  // Each creek tile's distance down the creek to the river (-1 off it), kept until the creek changes.
  creekDist() {
    const w = this.w, key = this.base.reduce((h, t, i) => t === T.CREEK || t === T.RIVER ? Math.imul(h ^ (i * 3 + t), 16777619) >>> 0 : h, 2166136261);
    if (this.dist?.key === key) return this.dist.d;
    const d = new Int32Array(w.n).fill(-1), next = new Int32Array(w.n).fill(-1), q = [];
    for (let i = 0; i < w.n; i++) if (this.base[i] === T.RIVER) { d[i] = 0; q.push(i); }
    for (let k = 0; k < q.length; k++) for (const j of neighbours(w, q[k])) if (d[j] < 0 && this.base[j] === T.CREEK) { d[j] = d[q[k]] + 1; next[j] = q[k]; q.push(j); }
    this.dist = { key, d, next }; // (next: the tile below it on its way down to the river)
    return d;
  }
  // Is creek tile j, across the dam line, the creek above the dam come back round a meander? Its
  // way down runs back over the line into the pond (a tributary joining below the dam never does).
  meanders(j, side) {
    const next = this.dist.next;
    for (let k = next[j], n = 0; k >= 0 && n < 4096; k = next[k], n++) if (side(k) <= 0) return true;
    return false;
  }
  downstream(site) {
    // Hydraulic passage ignores the fish-blocking culvert. River distance also
    // follows the farm's right-angle ditch where elevation alone is ambiguous.
    const w = this.w, d = this.creekDist();
    const candidates = neighbours(w, site).filter(j => this.base[j] === T.CREEK || this.base[j] === T.RIVER);
    candidates.sort((a, b) => (d[a] < 0 ? 1e6 + this.nominal(a) : d[a]) - (d[b] < 0 ? 1e6 + this.nominal(b) : d[b]));
    const j = candidates[0];
    return j == null ? [0, 1] : [j % w.w - site % w.w, Math.floor(j / w.w) - Math.floor(site / w.w)];
  }
  footprint(core, crest, kind, site, axis, occupied) {
    const w = this.w, reach = new Map(), q = [];
    let spill = crest;
    const ownCore = new Set(core);
    const sx = site % w.w, sy = Math.floor(site / w.w);
    for (const i of core) { reach.set(i, Math.min(...this.corners(i))); q.push(i); }
    // Minimum waterline needed to get here over shared edges. A low hollow on
    // the far side of a ridge only fills after the water reaches that ridge.
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      if (kind === 'pond' && (i % w.w === 0 || i % w.w === w.w - 1 || i < w.w || i >= w.n - w.w)) spill = Math.min(spill, reach.get(i));
      for (const j of neighbours(w, i)) {
        const t = this.base[j];
        if (kind === 'pond' && (t === T.CREEK || t === T.RIVER)) spill = Math.min(spill, Math.max(reach.get(i), this.sill(i, j)));
        if (this.walled(j, ownCore, site, occupied)) continue;
        if (kind !== 'pond' && ((j % w.w - sx) * axis[0] + (Math.floor(j / w.w) - sy) * axis[1]) > 0) continue;
        // Pond catchments don't dam the creek beside them.
        if (kind === 'pond' && t === T.CREEK) continue;
        const required = Math.max(reach.get(i), this.sill(i, j), Math.min(...this.corners(j)));
        if (required >= crest || required >= (reach.get(j) ?? Infinity)) continue;
        reach.set(j, required); q.push(j);
      }
    }
    return { cells: [...reach].map(([i, threshold]) => ({ i, threshold, c: this.corners(i) })), spill };
  }
  // Ground water can't stand on: another pond or marsh, another basin, a building, a road, a trail,
  // the river, a culvert, another dam.
  walled(j, ownCore, site, occupied) {
    const w = this.w, t = this.base[j];
    return ((t === T.POND || t === T.MARSH) && !ownCore.has(j)) || occupied[j] || w.struct[j] >= 0 || t === T.ROAD || t === T.TRAIL || t === T.RIVER || w.feature[j] === F.CULVERT || (w.feature[j] === F.DAM && j !== site);
  }
  // Where the water behind a dam at `site` first gets past the dam line under `level`: the lowest
  // level at which it crosses from the pond's side (dot(axis) <= 0) into a tile downstream of the
  // line (or reaches the river), other than over a dam edge in `blocked`, and that edge. Null if it
  // stays in under `level`. (The same fill as footprint, without its half-plane: the dam line is
  // only as long as the dam, and the water goes round its ends wherever the bank is lower.)
  leak(site, axis, level, blocked, occupied) {
    const w = this.w, n = w.n, sx = site % w.w, sy = Math.floor(site / w.w), own = new Set([site]);
    const side = j => (j % w.w - sx) * axis[0] + (Math.floor(j / w.w) - sy) * axis[1];
    const reach = new Map([[site, Math.min(...this.corners(site))]]), q = [site], dist = this.creekDist();
    let best = null;
    for (let k = 0; k < q.length; k++) {
      const i = q[k], r = reach.get(i);
      for (const j of neighbours(w, i)) {
        const required = Math.max(r, this.sill(i, j));
        if (this.base[j] === T.RIVER) { if (required < level && (!best || required < best.level)) best = { level: required, a: i, b: j }; continue; }
        if (this.walled(j, own, site, occupied)) continue;
        if (side(j) > 0) {
          // (a meander bringing the creek above the dam back across the line is the pond's own
          // water, held by the half-plane as in footprint, not a way round the dam)
          if (this.base[j] === T.CREEK && (dist[j] >= 0 ? this.meanders(j, side) : this.nominal(j) > this.nominal(site))) continue;
          if (!blocked.has(i * n + j) && required < level && (!best || required < best.level)) best = { level: required, a: i, b: j };
          continue;
        }
        const need = Math.max(required, Math.min(...this.corners(j)));
        if (need >= level || need >= (reach.get(j) ?? Infinity)) continue;
        reach.set(j, need); q.push(j);
      }
    }
    return best;
  }
  // The line a dam at `site` runs along at `level`: from the creek bank to bank, like a real dam.
  // Beavers build where they hear water running out, so it starts across the channel and grows
  // along the dam line wherever water would get round its end, until it meets ground above the
  // water (keyed into the banks) or reaches DAM_SPAN tiles. Returns its edges [pond tile, tile
  // below the dam] and `spill`, the lowest level the water still gets round it at: the pond can
  // rise to its crest or that bank, whichever is lower.
  damLine(site, axis, level, occupied) {
    const w = this.w, n = w.n, x = site % w.w + axis[0], y = Math.floor(site / w.w) + axis[1];
    const edges = [], blocked = new Set(), across = [];
    const perp = (i) => (i % w.w - site % w.w) * axis[1] - (Math.floor(i / w.w) - Math.floor(site / w.w)) * axis[0];
    if (w.inb(x, y)) { const b = w.idx(x, y); edges.push([site, b]); blocked.add(site * n + b); across.push(0); }
    let lk = this.leak(site, axis, level, blocked, occupied);
    while (lk && edges.length < DAM_SPAN && this.base[lk.b] !== T.RIVER) {
      // (only a leak at the dam's end: one round a far side of the pond is a bank too low to dam)
      const p = perp(lk.a);
      if (!across.some(q => Math.abs(q - p) === 1)) break;
      edges.push([lk.a, lk.b]); blocked.add(lk.a * n + lk.b); across.push(p);
      lk = this.leak(site, axis, level, blocked, occupied);
    }
    return { edges, spill: lk ? lk.level : Infinity };
  }
  // Tiles a dam's water at `level` actually stands on (shallower than WET_DEPTH doesn't count).
  damWet(cells, level) { return cells.filter(v => tileWaterVolume(v.c, level) > .002 && level - groundCentre(v.c) > WET_DEPTH).length; }
  // The crest a new dam holds its water at: DAM_HEAD over the bed, or less if the pond would spread
  // over more than DAM_CELLS tiles. Null where even a low dam would spread wider than that: a
  // stretch of creek with flat ground level with its bed, which beavers don't dam (it once flooded
  // 1,300 tiles, an eighth of Hollis Farm).
  // The water also stops at the lowest bank the dam can't reach past (damLine): a dam on a low
  // bank holds a lower pond.
  damCrest(site, axis, occupied) {
    // (leaks are plugged lowest first, so the line at the highest head gives the bank for every head)
    const bed = Math.min(...this.corners(site)), bank = this.damLine(site, axis, bed + DAM_HEAD, occupied).spill - SPILL_MARGIN;
    for (let head = DAM_HEAD; head > .15 - 1e-9; head -= .05) {
      const crest = Math.min(bed + head, bank);
      if (crest < bed + .15 - 1e-9) return null;
      const cells = this.footprint([site], crest, 'dam', site, axis, occupied).cells;
      // (and not over a waterfall: the pond would stand flat up its face. Beavers dam slow water)
      if (this.damWet(cells, crest) <= DAM_CELLS && !cells.some(v => crest - this.nominal(v.i) > .12 && isFall(this.w, v.i))) return crest;
    }
    return null;
  }
  // The tiles a dam's water stands on at `crest` (the drowned channel, and land under WET_DEPTH or more).
  damWetCells(cells, crest) {
    return cells.filter(v => this.base[v.i] === T.CREEK ? crest - this.nominal(v.i) > .12 : tileWaterVolume(v.c, crest) > .002 && crest - groundCentre(v.c) > WET_DEPTH).map(v => v.i);
  }
  // The saturated land round a dam's water (FRINGE): on the pond's side of the dam, not under
  // another basin, a road, a trail or a building.
  fringe(wet, crest, site, axis, occupied) {
    const w = this.w, own = new Set(wet), out = [], sx = site % w.w, sy = Math.floor(site / w.w);
    let edge = wet;
    for (let step = 0; step < FRINGE_REACH; step++) {
      const next = [];
      for (const i of edge) for (const j of neighbours(w, i)) {
        const t = this.base[j];
        if (own.has(j) || occupied[j] || isWater(t) || t === T.MUD || t === T.ROAD || t === T.TRAIL || w.struct[j] >= 0 || w.feature[j] === F.DAM || w.feature[j] === F.CULVERT) continue;
        if (((j % w.w - sx) * axis[0] + (Math.floor(j / w.w) - sy) * axis[1]) > 0) continue;
        // (0.2-1.4 times FRINGE over the water, and the further out the higher it has to lie)
        const x = j % w.w, y = Math.floor(j / w.w), reach = FRINGE * (0.2 + 1.2 * valueNoise(x, y, 4, 517)) * (1 - step / (FRINGE_REACH + 1));
        if (groundCentre(this.corners(j)) > crest + reach) continue;
        own.add(j); out.push(j); next.push(j);
      }
      edge = next;
    }
    return out;
  }
  // How big a pond a dam at `site` would hold back: { wet, open } tiles at its full level.
  damPotential(site) {
    const occupied = new Uint8Array(this.w.n);
    for (const b of this.basins) for (const v of b.cells) occupied[v.i] = 1;
    occupied[site] = 0;
    const axis = this.downstream(site), crest = this.damCrest(site, axis, occupied);
    let wet = 0, open = 0;
    if (crest == null) return { wet, open };
    for (const v of this.footprint([site], crest, 'dam', site, axis, occupied).cells) {
      const depth = crest - groundCentre(v.c);
      if (this.base[v.i] === T.CREEK) { if (crest - this.nominal(v.i) > .12) { wet++; open++; } continue; }
      if (tileWaterVolume(v.c, crest) <= .002 || depth <= WET_DEPTH) continue;
      wet++; if (depth > DAM_POND_DEPTH) open++;
    }
    const cells = this.footprint([site], crest, 'dam', site, axis, occupied).cells;
    wet += this.fringe(this.damWetCells(cells, crest), crest, site, axis, occupied).length; // (its marsh margin)
    return { wet, open };
  }
  // The water a pond dug up to a creek or the river is joined to: the lowest level of those beside it
  // whose water reaches over the shared edge, or null for a pond on its own. (The creek's level is
  // fixed for now: when creeks run low in a dry summer, this is where a joined pond learns of it)
  feedLevel(core) {
    let feed = Infinity;
    for (const i of core) for (const j of neighbours(this.w, i)) {
      const t = this.base[j];
      if ((t === T.CREEK || t === T.RIVER) && this.sill(i, j) < this.nominal(j) - .02) feed = Math.min(feed, this.nominal(j));
    }
    return feed < Infinity ? feed : null;
  }
  makeBasin(kind, site, core, previous, occupied) {
    const axis = previous?.axis || this.downstream(site);
    const initial = kind === 'pond' ? Math.min(...core.map(i => this.nominal(i))) : this.nominal(site);
    let crest = kind === 'pond' ? initial + .18 : (kind === 'dam' ? previous?.top : null) ?? previous?.crest ?? this.damCrest(site, axis, occupied);
    const top = kind === 'dam' ? crest : null; // (the crest it was built to: saved, so a bank raised again lets the pond back up)
    // (how far the beavers have raised it: a new dam starts low; one from an older save is full)
    // (a draining pool's basin is no dam: one built across it starts low too)
    const rise = kind === 'dam' ? (previous?.kind === 'dam' ? previous.rise ?? 1 : 0) : null, low = this.nominal(site) + DAM_START;
    const built = top != null ? Math.min(top, low + rise * Math.max(0, top - low)) : null;
    if (built != null) crest = built;
    // (a standing dam's pond is rechecked against its banks on every rebuild: ground lowered
    // beside it, or a save from before dams spanned the creek, lets it out to the lowest bank)
    let line = null;
    if (kind === 'dam' && crest != null) { line = this.damLine(site, axis, crest, occupied); crest = Math.min(crest, line.spill - SPILL_MARGIN); }
    let footprint = crest == null ? null : this.footprint(core, crest, kind, site, axis, occupied);
    if (kind !== 'pond' && (!footprint || this.damWet(footprint.cells, crest) > DAM_CELLS)) {
      // (a dam's crest is set when it is built, but the ground round it changes: a marsh dries, a
      // road or another pond goes. Lower it again rather than let the pond spread over the farm.
      // A dam on flat ground, from an old save, holds a low pool cut off at DAM_CELLS tiles)
      crest = this.damCrest(site, axis, occupied);
      let low = crest ?? Math.min(...this.corners(site)) + .15;
      if (built != null) low = Math.min(low, built); // (never higher than the beavers have built it)
      if (kind === 'dam') { line = this.damLine(site, axis, low, occupied); low = Math.min(low, line.spill - SPILL_MARGIN); }
      footprint = this.footprint(core, low, kind, site, axis, occupied);
      if (crest == null) {
        footprint.cells.sort((a, b) => a.threshold - b.threshold);
        let wet = 0, keep = 0;
        for (const v of footprint.cells) { if (tileWaterVolume(v.c, low) > .002 && low - groundCentre(v.c) > WET_DEPTH && ++wet > DAM_CELLS) break; keep++; }
        footprint.cells.length = keep;
      }
      crest = low;
    }
    // A pond dug up to a creek or the river (an oxbow, a backwater) shares its water: it stands at the
    // creek's level, full while the creek runs, and drops only when the creek does. Only a pond on its
    // own is a vernal pool, filled by rain and drawn down in summer. (Rain on it runs on down the creek)
    const feed = kind === 'pond' ? this.feedLevel(core) : null;
    if (feed != null) {
      crest = Math.max(feed, Math.min(...core.map(i => Math.min(...this.corners(i)))) + .01);
      footprint = this.footprint(core, crest, kind, site, axis, occupied);
      // (the water stays in the pond and its bank, not out along the creek's lower banks downstream)
      const own = new Set(core);
      footprint.cells = footprint.cells.filter(v => own.has(v.i) || neighbours(this.w, v.i).some(j => own.has(j)));
    } else if (kind === 'pond' && footprint.spill < crest) {
      // (never below its own dug water level: a freshly dug pond or marsh on a slope still holds
      // the water it was dug for, rather than spilling away to mud the moment it's made)
      crest = Math.max(Math.min(...core.map(i => Math.min(...this.corners(i)))), footprint.spill - .001, initial);
      footprint = this.footprint(core, crest, kind, site, axis, occupied);
      // (held above its spill, the water stays in the pond and its bank, rather than running out
      // along a low creek bank beside it: one dug next to a creek once flooded 700 tiles)
      if (crest > footprint.spill) {
        const own = new Set(core);
        footprint.cells = footprint.cells.filter(v => own.has(v.i) || neighbours(this.w, v.i).some(j => own.has(j)));
      }
    }
    const cells = footprint.cells;
    const lo = Math.min(...cells.map(v => Math.min(...v.c))), steps = 64;
    const table = new Float64Array(steps + 1);
    const volumeAt = level => cells.reduce((s, v) => s + (v.threshold <= level ? tileWaterVolume(v.c, level) : 0), 0);
    for (let k = 0; k <= steps; k++) table[k] = volumeAt(lo + (crest - lo) * k / steps);
    const capacity = table[steps];
    // A pond's deepest part outlasts a dry summer: evaporation and seepage only draw it down to a
    // quarter of its usual water (groundwater keeps a dug pond from drying out completely).
    // (a joined pond's floor is its creek's level: the creek tops it up as fast as it dries)
    const floor = feed != null ? capacity : kind === 'pond' ? Math.min(capacity, volumeAt(initial) * .25) : 0;
    // (usual: the level its tiles are classed by. A pond's draws down in summer, but a tile that is
    // pond at its usual level stays pond while it holds any water, rather than turning to marsh)
    const b = { kind, site, core, crest, axis, cells, lo, table, capacity, floor, usual: feed ?? (kind === 'pond' ? initial : crest), shown: previous?.shown,
      volume: Math.max(floor, Math.min(capacity, previous?.volume ?? volumeAt(initial))), input: 0, loss: 0, overflow: 0, feed };
    for (const v of cells) occupied[v.i] = 1;
    if (kind === 'dam') { b.dam = line?.edges ?? []; if (top != null && top > crest) b.top = top; b.rise = rise; } // (the dam's edges, bank to bank: drawn, not saved)
    // (spilling over its crest, drawn, see step: kept through a rebuild while it stands near the crest)
    b.full = b.volume >= capacity - 1e-6 || (!!previous?.full && this.level(b) >= crest - .03);
    if (kind === 'dam') { b.fringe = this.fringe(this.damWetCells(cells, crest), crest, site, axis, occupied); for (const i of b.fringe) occupied[i] = 1; }
    return b;
  }
  sync() {
    const w = this.w; let dirty = this.hv !== w.hv || this.regrown;
    this.regrown = false;
    // (a broken dam's pool that has run dry goes, so its creek is free for a new dam)
    if (this.basins.some(b => b.kind === 'receding' && b.volume <= .001)) dirty = true;
    // (only a change in or beside the water, or a pond dug or filled, rebuilds the basins: pasture
    // turning to soil across the farm leaves them as they are)
    for (let i = 0; i < w.n; i++) {
      if (w.terrain[i] === this.published[i]) continue;
      if (!dirty && (this.near?.[i] || w.terrain[i] === T.POND || this.base[i] === T.POND)) dirty = true;
      this.base[i] = w.terrain[i];
    }
    const dams = [];
    for (let i = 0; i < w.n; i++) if (w.feature[i] === F.DAM) dams.push(i);
    const signature = dams.join(',');
    if (signature !== this.damSignature) dirty = true;
    if (dirty) {
      const old = [...this.pending, ...this.basins], occupied = new Uint8Array(w.n), seen = new Uint8Array(w.n), next = [];
      for (let i = 0; i < w.n; i++) {
        // (open water only: a marsh is saturated ground that follows its own slope, so dug marsh
        // keeps its shallow water tile by tile instead of draining to one level across a hillside)
        if (seen[i] || this.base[i] !== T.POND) continue;
        const core = [i]; seen[i] = 1;
        for (let k = 0; k < core.length; k++) for (const j of neighbours(w, core[k])) if (!seen[j] && this.base[j] === T.POND) { seen[j] = 1; core.push(j); }
        const matches = old.filter(b => b.kind === 'pond' && (core.includes(b.site) || b.core?.some(j => core.includes(j))));
        const previous = matches.length ? { ...matches[0], volume: matches.reduce((n, b) => n + b.volume * (b.core ? b.core.filter(j => core.includes(j)).length / b.core.length : 1), 0) } : null;
        next.push(this.makeBasin('pond', i, core, previous, occupied));
      }
      for (const site of dams) next.push(this.makeBasin('dam', site, [site], old.find(b => b.kind !== 'pond' && b.site === site), occupied));
      for (const b of old) if (b.kind !== 'pond' && !dams.includes(b.site) && b.volume > .001 && this.base[b.site] === T.CREEK) next.push(this.makeBasin('receding', b.site, [b.site], b, occupied));
      this.basins = next; this.pending = []; this.hv = w.hv; this.damSignature = signature;
      this.near = new Uint8Array(w.n); // (the basins' tiles and those beside them)
      for (const b of next) for (const v of b.cells) { this.near[v.i] = 1; for (const j of neighbours(w, v.i)) this.near[j] = 1; }
    }
    this.publish();
  }
  level(b) {
    if (b.volume <= 0 || b.capacity <= 0) return b.lo;
    let low = 0, high = b.table.length - 1;
    while (high - low > 1) { const k = (low + high) >> 1; if (b.table[k] <= b.volume) low = k; else high = k; }
    const fraction = (b.volume - b.table[low]) / Math.max(1e-12, b.table[high] - b.table[low]);
    return b.lo + (b.crest - b.lo) * (low + fraction) / (b.table.length - 1);
  }
  step(game) {
    this.sync();
    if (game.wildlife) game.wildlife.dams = this.basins.filter(b => b.kind === 'dam').length;
    const rain = game.weather === 'rain' ? .04 : 0;
    const summer = game.month >= 3 && game.month <= 5;
    const melt = game.weather !== 'snow' ? (game.snow || 0) * .012 : 0;
    for (const b of this.basins) {
      const level = this.level(b);
      const wetArea = b.cells.reduce((n, v) => n + (v.threshold <= level && tileWaterVolume(v.c, level) > .002 ? 1 : 0), 0);
      const inflow = b.kind === 'dam' ? (summer ? .75 : 1.8) + rain * 12 : 0;
      // Small catchment allowance, not a full landscape runoff simulation. (None for a broken dam's
      // pool: the creek runs out through the breach. With it, rain held it at a third full for good.)
      b.input = b.kind === 'receding' ? 0 : (rain + melt) * b.core.length * 1.35 + inflow;
      if (b.feed != null) b.input += Math.max(0, b.floor - b.volume); // (the creek keeps a joined pond full)
      const shade = b.core.reduce((s, i) => s + this.w.canopy[i], 0) / b.core.length;
      const evap = (summer ? .014 : .005) * (1 - shade * .4);
      const seep = b.kind === 'receding' ? .12 * b.volume : b.kind === 'dam' ? .018 * b.volume : .002 * wetArea;
      b.loss = Math.max(0, Math.min(b.volume + b.input - (b.floor || 0), evap * wetArea + seep));
      const available = b.volume + b.input - b.loss;
      b.overflow = Math.max(0, available - b.capacity);
      b.volume = Math.max(0, Math.min(b.capacity, available));
      // (full and spilling over its crest, for the drawn spill: until it has dropped a little, so
      // a dry day doesn't take the spill away and a shower bring it back)
      if (b.volume >= b.capacity - 1e-6) b.full = true; else if (this.level(b) < b.crest - .03) b.full = false;
    }
    this.publish();
    for (let i = 0; i < this.w.n; i++) this.wetDays[i] = this.w.waterDepth[i] > .04 ? Math.min(65535, this.wetDays[i] + 1) : Math.max(0, this.wetDays[i] - 2);
  }
  publish() {
    const w = this.w, last = w.terrain.slice();
    w.waterLevel.fill(NaN); w.waterDepth.fill(0); w.waterManaged.fill(0); w.waterOwner.fill(-1);
    w.terrain.set(this.base);
    for (let k = 0; k < this.basins.length; k++) {
      // (the level shown, in sim and drawing alike, moves only once the water has risen or fallen
      // 0.04 levels (10 cm): a shower or a dry day doesn't rebuild the drawn water)
      const b = this.basins[k], raw = this.level(b);
      if (b.shown == null || Math.abs(raw - b.shown) >= .04 || raw <= b.lo + 1e-6) b.shown = Math.round(raw * 50) / 50;
      const L = b.shown;
      for (const v of b.cells) {
        const i = v.i, t = this.base[i];
        if (w.waterOwner[i] >= 0) continue;
        w.waterOwner[i] = k; w.waterManaged[i] = 1;
        const volume = v.threshold <= L ? tileWaterVolume(v.c, L) : 0;
        const depth = Math.max(0, L - groundCentre(v.c));
        if (volume > .002) w.waterLevel[i] = L;
        w.waterDepth[i] = volume > .002 ? depth : 0;
        if (t === T.CREEK) {
          w.waterLevel[i] = Math.max(Number.isFinite(w.waterLevel[i]) ? L : -Infinity, this.nominal(i));
          w.waterDepth[i] = Math.max(0, w.waterLevel[i] - groundCentre(v.c));
          // (the channel behind a dam, drowned a good way over its usual flow, is the pond's deep
          // middle: still water, not creek. Its base stays creek, so it runs again once the dam goes)
          const raised = L - this.nominal(i);
          if (b.kind !== 'pond' && raised > (last[i] === T.POND ? .06 : .12)) w.terrain[i] = T.POND;
          continue;
        }
        // A tile's kind of water comes from how deep it stands at the basin's usual level, not
        // today's: a pond drawing down in a dry summer keeps its pond tiles while they hold water,
        // and only the margins it leaves dry turn to mud (with a little slack, so a shoreline tile
        // doesn't flicker between mud and water with every shower).
        const usual = b.usual - groundCentre(v.c), was = last[i], open = b.kind === 'pond' ? POND_DEPTH : DAM_POND_DEPTH;
        const wetNow = volume > .002 && depth > (was === T.MUD || !isWater(was) ? WET_DEPTH + .03 : WET_DEPTH - .02);
        if (wetNow) w.terrain[i] = t === T.MARSH ? T.MARSH : usual > open + .03 || (was === T.POND && usual > open - .03) ? T.POND : T.MARSH;
        else if (t === T.POND) w.terrain[i] = b.feed != null ? T.MARSH : T.MUD; // (beside the creek, its seep keeps a dry edge marshy)
        // (a dug marsh stays marsh, saturated and sedgy, through a dry spell)
      }
      for (const i of b.fringe || []) if (w.waterOwner[i] < 0) { w.waterOwner[i] = k; w.waterManaged[i] = 1; w.terrain[i] = T.MARSH; } // (the pond's marsh margin: saturated, no water of its own drawn, so the pond's edge keeps its level)
    }
    w.damEdges = this.basins.flatMap(b => b.dam || []); // (for the drawn water: not past a dam)
    // (full dams spilling over their crest, for the drawn spill: terrain.js)
    w.damSpills = this.basins.filter(b => b.kind === 'dam' && b.full && b.dam?.length).map(b => ({ site: b.site, crest: b.crest, axis: b.axis, edges: b.dam }));
    this.published.set(w.terrain);
    if (last.some((t, i) => t !== w.terrain[i])) { w.hydroDirty = true; w.renderDirty = true; }
  }
  note(i) {
    const k = this.w.waterOwner[i]; if (k < 0) return null;
    const b = this.basins[k], wet = this.w.waterDepth[i] > .04;
    if (b.kind === 'receding') return 'The dam is gone. The pool is draining and its wet banks are gradually reappearing.';
    if (b.kind === 'dam') return wet ? 'A beaver dam holds creek water against this low ground. Wetland plants can settle here; prolonged flooding can turn trees into snags.' : 'This ground is in the beaver pool’s reach. It floods when the water behind the dam rises high enough.';
    if (b.feed != null) return 'This pond is joined to the creek and shares its water: it stays full while the creek runs and drops only if the creek does.';
    return wet ? 'Rain and snowmelt refill this basin. Its shallows recede during dry weather; streamside shade slows evaporation.' : 'The basin has drawn down to mud. Autumn rain can fill it again; deeper hollows hold water longer.';
  }
  restoreEdit(saved, back) {
    // Undo only the reservoirs and underlying tiles touched by the stroke.
    const unaffected = this.basins.filter(b => !b.cells.some(v => back.has(v.i)));
    const affected = saved.basins.filter(b => back.has(b.site) || this.basins.some(now => now.site === b.site && now.cells.some(v => back.has(v.i))));
    for (const i of back) { this.base[i] = saved.base[i]; this.published[i] = this.w.terrain[i]; this.wetDays[i] = saved.wetDays[i]; }
    this.pending = [...unaffected, ...affected]; this.basins = []; this.hv = -1;
  }
  // Beavers raise the dam at `site` by `by` of its height, toward its full crest. True if it rose
  // (the basins rebuild on the next sync: the pond's room grows, and it fills from the creek).
  raiseDam(site, by) {
    const b = this.basins.find(b => b.kind === 'dam' && b.site === site);
    if (!b || (b.rise ?? 1) >= 1) return false;
    b.rise = Math.min(1, b.rise + by); this.regrown = true;
    return true;
  }
  // A flood breaches a tended dam: its pond drops, and it stands DAM_BREACH lower until rebuilt.
  breachDam(site) {
    const b = this.basins.find(b => b.kind === 'dam' && b.site === site);
    if (!b) return;
    b.volume *= 0.3; b.rise = Math.max(0, (b.rise ?? 1) - DAM_BREACH); this.regrown = true;
  }
  serialize() {
    this.sync();
    return { v: 1, base: Array.from(this.base), wetDays: Array.from(this.wetDays), basins: this.basins.map(({ kind, site, crest, top, axis, volume, shown, rise }) => ({ kind, site, crest: top ?? crest, axis, volume, ...(Number.isFinite(shown) ? { shown } : {}), ...(rise != null && rise < 1 ? { rise } : {}) })) };
  }
}
