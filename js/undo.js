// Undo: take back the last few things you did with a tool (a brush stroke, a building, a release).
//
// Before each stroke the world's tile arrays are copied. Undoing puts back only the tiles the
// stroke reached, with a three-tile margin for tools that change their neighbours (a pond's edges,
// a building's footprint), plus every tile of any building it put up or took down; so plants that
// grew elsewhere in the meantime stay as they are. The money comes back (or, for salvage, goes
// back), the books are corrected, and any animal the stroke released is taken away again.
// A stroke can be undone for a month of game time.
import { WORLD_ARRAYS, EXTRA_ARRAYS } from './game.js';

const KEEP = 15, MARGIN = 3, FOR_DAYS = 30;

export class Undo {
  constructor(game) { this.game = game; this.stack = []; this.cur = null; }

  begin(tool) {
    const g = this.game, w = g.world, arrays = {};
    for (const k of [...WORLD_ARRAYS, ...Object.keys(EXTRA_ARRAYS)]) if (w[k]) arrays[k] = w[k].slice();
    this.cur = { tool, world: w, arrays, structures: JSON.parse(JSON.stringify(w.structures || [])), day: g.day,
      nextId: g.wildlife.nextId, stats: { planted: g.stats.planted, dug: g.stats.dug, removed: g.stats.removed }, touched: new Set() };
  }
  touch(i) { this.cur?.touched.add(i); }
  end(stroke) {
    const c = this.cur; this.cur = null;
    if (!c || !stroke?.count) return;
    c.cost = stroke.cost; c.count = stroke.count;
    this.stack.push(c);
    if (this.stack.length > KEEP) this.stack.shift();
  }
  // the newest stroke that can still be undone (older ones, or ones on another farm, are dropped)
  get last() {
    const g = this.game;
    while (this.stack.length && (this.stack.at(-1).world !== g.world || g.day - this.stack.at(-1).day > FOR_DAYS)) this.stack.pop();
    return this.stack.at(-1) || null;
  }
  clear() { this.stack = []; this.cur = null; }

  // Take back the newest stroke. Returns what was undone (for the message), or null.
  undo(renderer) {
    const c = this.last;
    if (!c) return null;
    this.stack.pop();
    const g = this.game, w = g.world, W = w.w, H = w.h, A = c.arrays;
    // the tiles to put back
    const back = new Set();
    for (const i of c.touched) {
      const x = i % W, y = (i / W) | 0;
      for (let dy = -MARGIN; dy <= MARGIN; dy++) for (let dx = -MARGIN; dx <= MARGIN; dx++) if (w.inb(x + dx, y + dy)) back.add((y + dy) * W + x + dx);
    }
    for (let i = 0; i < w.n; i++) if (A.struct[i] !== w.struct[i]) back.add(i); // (a whole building, however far it reaches)
    for (const i of back) for (const k in A) if (k !== 'vh' && w[k] && A[k].length === w.n) w[k][i] = A[k][i];
    for (const k in A) if (w[k] && A[k].length !== w.n) w[k].set(A[k]); // (the height grid isn't one value a tile: put it all back)
    w.structures = c.structures;
    // the money and the books
    const t = c.tool;
    if (c.cost > 0) { g.money += c.cost; g.stats.spent -= c.cost; unbook(g, 'out', t.cat, c.cost); }
    else if (c.cost < 0) { g.money += c.cost; g.stats.earned += c.cost; unbook(g, 'in', 'salvage', -c.cost); }
    Object.assign(g.stats, c.stats);
    if (g.stats.used?.[t.key]) g.stats.used[t.key] = Math.max(0, g.stats.used[t.key] - c.count);
    // animals it let go
    if (t.cat === 'wildlife') { g.wildlife.agents = g.wildlife.agents.filter(a => a.id < c.nextId); g.wildlife.recount(); }
    // and let everything else catch up
    w.hv = (w.hv || 0) + 1; w.heightDirty = true; w.hydroDirty = true; w.renderDirty = true;
    g.refreshEnvironment();
    g.wildlife.computeSuitability();
    for (const i of back) renderer?.markTileDirty(i % W, (i / W) | 0);
    return { tool: t, count: c.count, cost: c.cost };
  }
}

function unbook(g, side, key, c) {
  // off the month it was booked in (this one, or the last if the month has turned since)...
  let left = c;
  for (const l of [g.ledger, g.lastLedger]) {
    if (left > 0 && l?.[side]?.[key]) { const take = Math.min(l[side][key], left); l[side][key] -= take; left -= take; if (!l[side][key]) delete l[side][key]; }
  }
  // ...and off the totals since the start
  const t = g.stats.ledger?.[side];
  if (t?.[key]) { t[key] = Math.max(0, t[key] - c); if (!t[key]) delete t[key]; }
}
