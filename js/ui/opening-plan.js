// The opening's guided planting, planned (ui/opening.js asks; tools/opening-lapse-check.mjs runs the
// same plans headless): what each step would do on this farm, its tiles, tool, words and cost, or null
// where it doesn't apply. No DOM here, so a check in node runs the real plans.
//
//   'pull'   every invasive shrub (or tree) on the farm (PNW: Himalayan blackberry). All of them, not
//            just the creek's: in a seeded run, pulling only the banks let the stands left elsewhere
//            seed them again, and the banks' blackberry grew 51 → 129 tiles in ten years (all pulled: 0–4).
//   'trees'  the cheapest tree mix (PNW: pioneer trees, alder and cottonwood first) two tiles either
//            side of the whole creek.
//   'meadow' the first groundcover mix (PNW: upland meadow) on a 12 × 9 patch of open field beside the
//            planting, clear of the trees' band; the player can drag it on instead.
// A step that would leave under RESERVE is skipped. On PNW the three come to about $4,400 of the
// $30,000 start (after the fence and culvert, about $20,000 is left).

import { F, T, isWater } from '../config.js';
import { toolCost } from '../tools.js';

export const STEPS = ['pull', 'trees', 'meadow'];
const RESERVE = 5000;          // a guided step is skipped if it would leave less than this
const BANK = 2;                // trees go this many tiles either side of the creek

// The middle of the 16-tile square holding the most of these tiles (also the time-lapse's subject,
// ui/watch.js: a creek's whole length of planting doesn't fit in one picture).
export function densest(w, tiles) {
  if (!tiles?.length) return null;
  const C = 4, cw = Math.ceil(w.w / C), ch = Math.ceil(w.h / C), n = new Float32Array(cw * ch);
  for (const i of tiles) n[Math.floor(i / w.w / C) * cw + Math.floor(i % w.w / C)]++;
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y + 4 <= ch; y++) for (let x = 0; x + 4 <= cw; x++) {
    let s = 0;
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) s += n[(y + dy) * cw + x + dx];
    if (s > best) { best = s; bx = x; by = y; }
  }
  return { x: Math.min(w.w - 1, (bx + 2) * C), y: Math.min(w.h - 1, (by + 2) * C) };
}

const density = (g, mix) => g.catalog.mix?.[mix.key]?.density ?? 0.3;

// isOpen(key): whether the player has that tool (the campaign locks some). site: where the steps are
// looked at, once the first step has chosen it. touch: the words say "drag a finger".
export function stepPlan(g, k, isOpen = () => true, site = null, touch = false) {
  const w = g.world, P = g.catalog.plants, tools = g.catalog.tools;
  const creek = [];
  for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.CREEK) creek.push(i);
  const usable = i => Math.floor(i / w.w) >= 1 && w.feature[i] !== F.FENCE && w.struct[i] < 0 && !isWater(w.terrain[i]) && w.terrain[i] !== T.ROAD && (!g.mapDefinition.canEdit || g.mapDefinition.canEdit(g, i));
  const bank = r => {
    const out = new Set();
    for (const c of creek) {
      const cx = c % w.w, cy = Math.floor(c / w.w);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (!w.inb(cx + dx, cy + dy)) continue;
        const j = w.idx(cx + dx, cy + dy);
        if (usable(j)) out.add(j);
      }
    }
    return [...out];
  };
  const left = cost => g.sandbox || g.money - cost >= RESERVE;
  if (k === 'pull') {
    const tool = tools.pull, tiles = [], kinds = new Map();
    if (!tool || !creek.length || !isOpen('pull')) return null;
    for (let i = 0; i < w.n; i++) {
      const sh = w.shrub[i] && P[w.shrub[i]]?.invasive ? P[w.shrub[i]] : null, tr = w.tree[i] && P[w.tree[i]]?.invasive ? P[w.tree[i]] : null;
      if (!(sh || tr) || (g.mapDefinition.canEdit && !g.mapDefinition.canEdit(g, i))) continue; // (fence lines too: the 18 stands on PNW's fences alone brought it back over the whole farm, 271 → ~3,200 in ten years)
      tiles.push(i); const p = sh || tr; kinds.set(p, (kinds.get(p) || 0) + 1);
    }
    if (!tiles.length) return null;
    const near = new Set(bank(3));
    site = densest(w, tiles.filter(i => near.has(i))) || densest(w, tiles);
    const name = [...kinds].sort((a, b) => b[1] - a[1])[0][0].name;
    const cost = tiles.reduce((s, i) => s + Math.max(0, toolCost(g, tool, i)), 0);
    if (!left(cost)) return null;
    return { tool: 'pull', tiles, cost, site, label: `Pull out the ${name.replace(/^Himalayan /, '').toLowerCase()}`,
      text: `${name} has the creek banks, and birds spread its seeds. First, pull out every stand on the farm.` };
  }
  if (k === 'trees') {
    const mix = Object.values(tools).filter(t => t.cat === 'plants' && t.sub === 'mixes' && t.layer === 2 && isOpen(t.key)).sort((a, b) => a.cost - b.cost)[0];
    if (!mix || !creek.length) return null;
    const tiles = bank(BANK).filter(i => !w.tree[i]);
    if (!tiles.length) return null;
    site ||= densest(w, tiles);
    // (about what a stroke places: one tile in four or so, where they'll grow)
    const cost = Math.round(tiles.length * density(g, mix) * mix.cost * 0.92 / 50) * 50;
    if (!left(cost)) return null;
    return { tool: mix.key, tiles, cost, site, about: true, label: 'Plant trees along the creek',
      text: `The banks are bare. Trees along the creek shade the water and hold the banks: ${mix.name.toLowerCase()} go in first.` };
  }
  if (k === 'meadow') {
    const mix = Object.values(tools).find(t => t.cat === 'plants' && t.sub === 'mixes' && t.layer === 0 && isOpen(t.key));
    if (!mix) return null;
    const tiles = meadowPatch(w, usable, site);
    if (tiles.length < 20) return null;
    const cost = Math.round(tiles.length * density(g, mix) * mix.cost / 10) * 10;
    if (!left(cost)) return null;
    return { tool: mix.key, tiles, cost, site, about: true, select: true, label: 'Sow it here',
      text: `Last, a meadow beside them. The ${mix.name.toLowerCase()} is ready: ${touch ? 'drag a finger' : 'drag'} across the field to sow it.` };
  }
  return null;
}

// A 12 × 9 patch of open field near the site, clear of the creek's tree band, with the most open ground.
function meadowPatch(w, usable, site) {
  const s = site || { x: w.w / 2, y: w.h / 2 };
  const open = i => usable(i) && !w.tree[i] && !w.shrub[i] && !w.feature[i] && (w.terrain[i] === T.PASTURE || w.terrain[i] === T.FIELD || w.terrain[i] === T.SOIL);
  const nearCreek = (x, y) => {
    for (let dy = -BANK; dy <= BANK; dy++) for (let dx = -BANK; dx <= BANK; dx++) if (w.inb(x + dx, y + dy) && w.terrain[w.idx(x + dx, y + dy)] === T.CREEK) return true;
    return false;
  };
  let best = [], bs = -Infinity;
  for (let oy = -10; oy <= 10; oy += 2) for (let ox = -16; ox <= 16; ox += 2) {
    const x0 = Math.round(s.x + ox - 6), y0 = Math.round(s.y + oy - 4), tiles = [];
    for (let y = y0; y < y0 + 9; y++) for (let x = x0; x < x0 + 12; x++) if (w.inb(x, y) && open(w.idx(x, y)) && !nearCreek(x, y)) tiles.push(w.idx(x, y));
    const score = tiles.length - Math.hypot(ox, oy) * 0.5;
    if (score > bs) { bs = score; best = tiles; }
  }
  return best;
}
