// Compare the inputs used to draw plants, rather than coupling rendering to every tool and
// ecological system that can alter them. No hashes or quantization: small growth still shows.
import { BORDER } from '../config.js';

const FIELDS = ['ground', 'groundG', 'shrub', 'shrubG', 'tree', 'treeG', 'variant', 'feature', 'featureAge', 'marks', 'terrain', 'bleach'];
const BORDER_FIELDS = ['tree', 'treeG', 'shrub', 'ground'];
export const floraChunkKey = (x, y, size) => Math.floor((x + BORDER) / size) * 65536 + Math.floor((y + BORDER) / size);

export class FloraChanges {
  constructor(size) { this.size = size; this.saved = null; }
  find(game, light) {
    const s = this.saved, w = game.world, b = game.border;
    if (!s || s.world !== w || s.border !== b || s.month !== game.month || s.light !== !!light) return null;
    // Heights affect interpolated plant positions, water levels and connecting rails. Keep
    // this uncommon operation conservative; season and graphics changes also rebuild fully.
    for (let i = 0; i < w.vh.length; i++) if (w.vh[i] !== s.height[i]) return null;
    const dirty = new Set();
    const mark = (x, y) => {
      // Adjacent boardwalks, fences and snorkel ropes depend on their neighbours.
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) dirty.add(floraChunkKey(x + dx, y + dy, this.size));
    };
    for (const f of FIELDS) {
      const a = w[f], old = s.inside[f];
      if (!a && !old) continue;
      for (let i = 0; i < w.n; i++) if ((a?.[i] ?? 0) !== (old?.[i] ?? 0)) mark(i % w.w, Math.floor(i / w.w));
    }
    for (const f of BORDER_FIELDS) {
      const a = b[f], old = s.outside[f];
      for (let i = 0; i < a.length; i++) if (a[i] !== old[i]) mark(i % b.W - BORDER, Math.floor(i / b.W) - BORDER);
    }
    return dirty;
  }
  remember(game, light) {
    const w = game.world, b = game.border;
    const s = this.saved && this.saved.world === w && this.saved.border === b ? this.saved : {
      world: w, border: b, height: w.vh.slice(), inside: {}, outside: {}
    };
    s.month = game.month; s.light = !!light; s.height.set(w.vh);
    for (const [fields, source, target] of [[FIELDS, w, s.inside], [BORDER_FIELDS, b, s.outside]]) for (const f of fields) {
      const a = source[f];
      if (!a) { delete target[f]; continue; }
      if (!target[f] || target[f].length !== a.length) target[f] = a.slice();
      else target[f].set(a);
    }
    this.saved = s;
  }
}
