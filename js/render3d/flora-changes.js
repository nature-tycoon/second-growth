// Compare the inputs used to draw plants, rather than coupling rendering to every tool and
// ecological system that can alter them. No hashes or quantization: small growth still shows.
import { BORDER } from '../config.js';

const FIELDS = ['ground', 'groundG', 'shrub', 'shrubG', 'tree', 'treeG', 'variant', 'feature', 'featureAge', 'marks', 'terrain', 'bleach', 'canopy'];
const BORDER_FIELDS = ['tree', 'treeG', 'shrub', 'ground'];
// Also read for plants under shade and beside water, but set by the simulation: they choose which
// tiles of a changing region are worked out afresh (see `tiles`), not which regions change.
// Canopy belongs in FIELDS: seasonal shade can change forest-floor geometry in a region
// whose plant identities and growth haven't changed.
const TILE_FIELDS = ['distWater', 'waterLevel', 'waterManaged'];
const differ = (a, b) => a !== b && !(a !== a && b !== b); // (two missing water levels are the same)
export const floraChunkKey = (x, y, size) => Math.floor((x + BORDER) / size) * 65536 + Math.floor((y + BORDER) / size);

export class FloraChanges {
  constructor(size) { this.size = size; this.saved = null; }
  find(game, light) {
    const s = this.saved, w = game.world, b = game.border;
    if (!s || s.world !== w || s.border !== b || s.light !== !!light) return null;
    // Heights affect interpolated plant positions, water levels and connecting rails. Keep
    // this uncommon operation conservative; graphics changes also rebuild fully.
    for (let i = 0; i < w.vh.length; i++) if (w.vh[i] !== s.height[i]) return null;
    const dirty = new Set();
    // A new season changes every region, but as regions rather than one complete rebuild, so the
    // renderer can spread it over a few frames (see Flora.rebuild's maxRegions)
    if (s.month !== game.month) {
      for (let y = -BORDER; y < w.h + BORDER; y += this.size) for (let x = -BORDER; x < w.w + BORDER; x += this.size) dirty.add(floraChunkKey(x, y, this.size));
      return dirty;
    }
    // `tiles`: within those regions, the tiles whose plants must be worked out again; the rest
    // are as they were drawn last time (see Flora.rebuild)
    const GW = w.w + BORDER * 2, GH = w.h + BORDER * 2, tiles = dirty.tiles = new Uint8Array(GW * GH);
    const touch = (x, y) => {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const gx = x + dx + BORDER, gy = y + dy + BORDER;
        if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) tiles[gy * GW + gx] = 1;
      }
    };
    const mark = (x, y) => {
      // Adjacent boardwalks, fences and snorkel ropes depend on their neighbours, and a wood's
      // edge fringe on trees up to two tiles away.
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) dirty.add(floraChunkKey(x + dx, y + dy, this.size));
      touch(x, y);
    };
    for (const f of FIELDS) {
      const a = w[f], old = s.inside[f];
      if (!a && !old) continue;
      if (a && old && a.length === old.length) { for (let i = 0; i < w.n; i++) if (a[i] !== old[i]) mark(i % w.w, Math.floor(i / w.w)); continue; } // (the usual case, without the per-tile checks)
      for (let i = 0; i < w.n; i++) if ((a?.[i] ?? 0) !== (old?.[i] ?? 0)) mark(i % w.w, Math.floor(i / w.w));
    }
    for (const f of BORDER_FIELDS) {
      const a = b[f], old = s.outside[f];
      for (let i = 0; i < a.length; i++) if (a[i] !== old[i]) mark(i % b.W - BORDER, Math.floor(i / b.W) - BORDER);
    }
    for (const f of TILE_FIELDS) {
      const a = w[f], old = s.inside[f];
      if (!a && !old) continue;
      if (!a || !old || a.length !== old.length) { dirty.tiles = null; break; } // (all afresh)
      for (let i = 0; i < w.n; i++) if (differ(a[i], old[i])) touch(i % w.w, Math.floor(i / w.w));
    }
    return dirty;
  }
  remember(game, light) {
    const w = game.world, b = game.border;
    const s = this.saved && this.saved.world === w && this.saved.border === b ? this.saved : {
      world: w, border: b, height: w.vh.slice(), inside: {}, outside: {}
    };
    s.month = game.month; s.light = !!light; s.height.set(w.vh);
    for (const [fields, source, target] of [[[...FIELDS, ...TILE_FIELDS], w, s.inside], [BORDER_FIELDS, b, s.outside]]) for (const f of fields) {
      const a = source[f];
      if (!a) { delete target[f]; continue; }
      if (!target[f] || target[f].length !== a.length) target[f] = a.slice();
      else target[f].set(a);
    }
    this.saved = s;
  }
}
