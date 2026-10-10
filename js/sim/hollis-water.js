// First gameplay slice: weather-fed standing water and terrain-shaped beaver pools.
// Small reservoirs use the same two ground triangles as Terrain. This deliberately
// keeps the creek/river boundary flow and regional floods in their existing systems.
import { T, F } from '../config.js';

import { WATER_FILL } from './waterline.js';
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

// OFF until it's ready for play. When off, Hollis keeps its original fixed ponds and the old beaver
// dam flooding, and nothing about this model reaches saves. Tests switch it on with
// waterModel.enabled = true; a browser can try it with ?water=1 in the address.
export const waterModel = {
  enabled: typeof location !== 'undefined' && new URLSearchParams(location.search).get('water') === '1',
};
export const waterModelOn = map => waterModel.enabled && map === 'pnw';

export class HollisWater {
  constructor(w, saved = null) {
    this.w = w; this.basins = []; this.hv = -1;
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
        if (!['pond', 'dam', 'receding'].includes(b.kind) || !Number.isInteger(b.site) || b.site < 0 || b.site >= w.n || !Number.isFinite(b.volume) || b.volume < 0 || !Number.isFinite(b.crest) || !Array.isArray(b.axis) || b.axis.length !== 2 || !b.axis.every(Number.isFinite) || Math.abs(b.axis[0]) + Math.abs(b.axis[1]) !== 1) throw new Error('Invalid saved reservoir');
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
  downstream(site) {
    // Hydraulic passage ignores the fish-blocking culvert. River distance also
    // follows the farm's right-angle ditch where elevation alone is ambiguous.
    const w = this.w, d = new Int32Array(w.n).fill(-1), q = [];
    for (let i = 0; i < w.n; i++) if (this.base[i] === T.RIVER) { d[i] = 0; q.push(i); }
    for (let k = 0; k < q.length; k++) for (const j of neighbours(w, q[k])) if (d[j] < 0 && this.base[j] === T.CREEK) { d[j] = d[q[k]] + 1; q.push(j); }
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
        if (((t === T.POND || t === T.MARSH) && !ownCore.has(j)) || occupied[j] || w.struct[j] >= 0 || t === T.ROAD || t === T.TRAIL || t === T.RIVER || w.feature[j] === F.CULVERT || (w.feature[j] === F.DAM && j !== site)) continue;
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
  makeBasin(kind, site, core, previous, occupied) {
    const axis = previous?.axis || this.downstream(site);
    const initial = kind === 'pond' ? Math.min(...core.map(i => this.nominal(i))) : this.nominal(site);
    let crest = kind === 'pond' ? initial + .18 : previous?.crest ?? Math.min(...this.corners(site)) + .95;
    let footprint = this.footprint(core, crest, kind, site, axis, occupied);
    if (kind === 'pond' && footprint.spill < crest) {
      // (never below its own dug water level: a freshly dug pond or marsh on a slope still holds
      // the water it was dug for, rather than spilling away to mud the moment it's made)
      crest = Math.max(Math.min(...core.map(i => Math.min(...this.corners(i)))), footprint.spill - .001, initial);
      footprint = this.footprint(core, crest, kind, site, axis, occupied);
    }
    const cells = footprint.cells;
    const lo = Math.min(...cells.map(v => Math.min(...v.c))), steps = 64;
    const table = new Float64Array(steps + 1);
    const volumeAt = level => cells.reduce((s, v) => s + (v.threshold <= level ? tileWaterVolume(v.c, level) : 0), 0);
    for (let k = 0; k <= steps; k++) table[k] = volumeAt(lo + (crest - lo) * k / steps);
    const capacity = table[steps];
    // A pond's deepest part outlasts a dry summer: evaporation and seepage only draw it down to a
    // quarter of its usual water (groundwater keeps a dug pond from drying out completely).
    const floor = kind === 'pond' ? Math.min(capacity, volumeAt(initial) * .25) : 0;
    const b = { kind, site, core, crest, axis, cells, lo, table, capacity, floor,
      volume: Math.min(capacity, previous?.volume ?? volumeAt(initial)), input: 0, loss: 0, overflow: 0 };
    for (const v of cells) occupied[v.i] = 1;
    return b;
  }
  sync() {
    const w = this.w; let dirty = this.hv !== w.hv;
    for (let i = 0; i < w.n; i++) {
      if (w.terrain[i] !== this.published[i]) { this.base[i] = w.terrain[i]; dirty = true; }
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
      // Small catchment allowance, not a full landscape runoff simulation.
      b.input = (rain + melt) * b.core.length * 1.35 + inflow;
      const shade = b.core.reduce((s, i) => s + this.w.canopy[i], 0) / b.core.length;
      const evap = (summer ? .014 : .005) * (1 - shade * .4);
      const seep = b.kind === 'receding' ? .12 * b.volume : b.kind === 'dam' ? .018 * b.volume : .002 * wetArea;
      b.loss = Math.max(0, Math.min(b.volume + b.input - (b.floor || 0), evap * wetArea + seep));
      const available = b.volume + b.input - b.loss;
      b.overflow = Math.max(0, available - b.capacity);
      b.volume = Math.max(0, Math.min(b.capacity, available));
    }
    this.publish();
    for (let i = 0; i < this.w.n; i++) this.wetDays[i] = this.w.waterDepth[i] > .04 ? Math.min(65535, this.wetDays[i] + 1) : Math.max(0, this.wetDays[i] - 2);
  }
  publish() {
    const w = this.w, last = w.terrain.slice();
    w.waterLevel.fill(NaN); w.waterDepth.fill(0); w.waterManaged.fill(0); w.waterOwner.fill(-1);
    w.terrain.set(this.base);
    for (let k = 0; k < this.basins.length; k++) {
      const b = this.basins[k], L = Math.round(this.level(b) * 100) / 100;
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
        } else if (depth > .04 && volume > .002) w.terrain[i] = depth > .28 && t !== T.MARSH ? T.POND : T.MARSH;
        // (a dug marsh stays marsh, saturated and sedgy, through a dry spell; a pond's shallows
        // dry to mud at the edges while its deeper middle still holds water)
        else if (t === T.POND) w.terrain[i] = volume > .002 ? T.MARSH : T.MUD;
      }
    }
    this.published.set(w.terrain);
    if (last.some((t, i) => t !== w.terrain[i])) { w.hydroDirty = true; w.renderDirty = true; }
  }
  note(i) {
    const k = this.w.waterOwner[i]; if (k < 0) return null;
    const b = this.basins[k], wet = this.w.waterDepth[i] > .04;
    if (b.kind === 'receding') return 'The dam is gone. The pool is draining and its wet banks are gradually reappearing.';
    if (b.kind === 'dam') return wet ? 'A beaver dam holds creek water against this low ground. Wetland plants can settle here; prolonged flooding can turn trees into snags.' : 'This ground is in the beaver pool’s reach. It floods when the water behind the dam rises high enough.';
    return wet ? 'Rain and snowmelt refill this basin. Its shallows recede during dry weather; streamside shade slows evaporation.' : 'The basin has drawn down to mud. Autumn rain can fill it again; deeper hollows hold water longer.';
  }
  restoreEdit(saved, back) {
    // Undo only the reservoirs and underlying tiles touched by the stroke.
    const unaffected = this.basins.filter(b => !b.cells.some(v => back.has(v.i)));
    const affected = saved.basins.filter(b => back.has(b.site) || this.basins.some(now => now.site === b.site && now.cells.some(v => back.has(v.i))));
    for (const i of back) { this.base[i] = saved.base[i]; this.published[i] = this.w.terrain[i]; this.wetDays[i] = saved.wetDays[i]; }
    this.pending = [...unaffected, ...affected]; this.basins = []; this.hv = -1;
  }
  serialize() {
    this.sync();
    return { v: 1, base: Array.from(this.base), wetDays: Array.from(this.wetDays), basins: this.basins.map(({ kind, site, crest, axis, volume }) => ({ kind, site, crest, axis, volume })) };
  }
}
