// Farm snapshots for analytics: the whole map as a short string, so we can see what players
// actually built (farms.html draws them). One letter per habitat, with trails, boardwalks and
// fences marked on top, run-length encoded: "d34" is 34 tiles of native meadow in a row.
// A typical farm comes to a few kilobytes.

import { H, T, F } from './config.js';
import { ANIMALS } from './data/animals.js';

export const SNAP_VERSION = 1;
// codes 0-12 are the habitat classes (config.js H); then what the player laid down
export const SNAP_TRAIL = 13, SNAP_BOARDWALK = 14, SNAP_FENCE = 15;
const LETTERS = 'abcdefghijklmnop';

export function encodeGrid(w) {
  let out = '', prev = -1, run = 0;
  const flush = () => { if (run) out += LETTERS[prev] + (run > 1 ? run : ''); };
  for (let i = 0; i < w.n; i++) {
    const f = w.feature[i];
    let c = w.habitat[i];
    if (f === F.FENCE) c = SNAP_FENCE;
    else if (f === F.BOARDWALK || f === F.BLIND) c = SNAP_BOARDWALK;
    else if (w.terrain[i] === T.TRAIL) c = SNAP_TRAIL;
    if (c === prev) run++;
    else { flush(); prev = c; run = 1; }
  }
  flush();
  return out;
}

export function farmSnapshot(g) {
  const w = g.world, pops = {};
  for (const def of ANIMALS) { const p = g.wildlife.state[def.index].pop; if (p > 0) pops[def.key] = p; }
  const counts = {};
  for (const [k, v] of Object.entries(H)) counts[k.toLowerCase()] = w.stats.counts?.[v] || 0;
  return {
    snap_version: SNAP_VERSION, width: w.w, height: w.h, grid: encodeGrid(w),
    game_year: g.year, game_month: g.month, day: g.day,
    score: Math.round(g.cache.score?.total ?? 0), money: Math.round(g.money),
    visitors_total: g.visitors.total, rating: +(g.visitors.rating || 0).toFixed(1),
    populations: pops, habitats: counts, tools_used: { ...(g.stats.used || {}) },
    trees_planted: g.stats.treesPlanted || 0, planted: g.stats.planted || 0,
    goals_done: Object.keys(g.goalsDone || {}).length,
  };
}
