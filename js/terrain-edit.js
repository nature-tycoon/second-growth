// One edit path for the player's height changes (decision 0048, phase 2). Map generation shapes the
// land with its own passes (world.js, maps/landform.js); after that, every tool that moves ground
// (dig pond, marsh or creek, Raise and Lower ground, Fill & grade, a building put up) goes through
// terrainEdit, which owns the corner rules. Heights are in levels (2.4 m) on tile corners, and a
// corner is shared by up to four tiles, so an edit on one tile moves part of its neighbours.
//
// Each corner has an owner, read from the tiles round it other than the ones the edit is shaping:
// a building, a channel (a creek or the river), a body (a pond or a marsh), or the land. An edit moves
// land corners freely. It never moves a building's corners, nor another water body's, with two
// exceptions: water dug up to other water joins it (`join`: the corners they share may come down to
// that water's bed, never below, so its level stays; a pond may sit up to CHANNEL_STEP under a creek's
// bed where they join), and filling part of a pond or marsh (`shore`) may raise the shore corners it
// shares with the rest of it, as tipped earth slumps into the water's edge.

import { forgetSwimRoutes } from './sim/swim-routes.js';
import { T, isWater, clamp } from './config.js';
import { WATER_FILL } from './sim/waterline.js';
import { CHANNEL_STEP, CHANNEL_CUT } from './maps/landform.js';

export const LAND = 0, BODY = 1, CHANNEL = 2, BUILDING = 3;
const C4 = [[0, 0], [1, 0], [1, 1], [0, 1]]; // (a tile's corners)
const ROUND = [[0, 0], [-1, 0], [0, -1], [-1, -1]]; // (the tiles round a corner)
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const xy = (w, i) => [i % w.w, (i / w.w) | 0];
const bedOf = (w, x, y) => Math.min(...w.corners(x, y));

// Who owns corner (vx, vy), leaving out the tiles the edit is shaping (`self(i)`): a building beats a
// channel, which beats a body, which beats the land.
export function cornerOwner(w, vx, vy, self) {
  let own = LAND;
  for (const [ox, oy] of ROUND) {
    const tx = vx + ox, ty = vy + oy;
    if (!w.inb(tx, ty)) continue;
    const j = w.idx(tx, ty);
    if (self(j)) continue;
    if (w.struct[j] >= 0) return BUILDING;
    const t = w.terrain[j];
    if (t === T.CREEK || t === T.RIVER) own = CHANNEL;
    else if (own === LAND && isWater(t)) own = BODY;
  }
  return own;
}

// How low a joining edit may take a corner shared with other water: that water's bed (its lowest
// corner, which sets its level), or for a pond joining a creek or the river, CHANNEL_STEP under it.
function joinFloor(w, vx, vy, self, join) {
  let f = -Infinity;
  for (const [ox, oy] of ROUND) {
    const tx = vx + ox, ty = vy + oy;
    if (!w.inb(tx, ty) || self(w.idx(tx, ty))) continue;
    const t = w.terrain[w.idx(tx, ty)];
    if (isWater(t)) f = Math.max(f, bedOf(w, tx, ty) - (join === 'pond' && (t === T.CREEK || t === T.RIVER) ? CHANNEL_STEP : 0));
  }
  return f;
}

/** The one edit path. `tiles`: the tile indices this edit shapes. `want(vx, vy, h)`: the height it
 * would give corner (vx, vy), now h. `self(i)`: tiles counted as the edit's own when reading owners
 * (default: `tiles`). Returns whether any corner moved. */
export function terrainEdit(w, tiles, want, { self = null, join = null, shore = false } = {}) {
  forgetSwimRoutes(w); // (fish routes are worked out afresh over the new ground: swim-routes.js)
  if (!self) { const s = new Set(tiles); self = j => s.has(j); }
  // (every corner is decided from the heights before the edit, then written: a bed lowered by one
  // corner must not lower the floor the next corner is held to)
  const seen = new Set(), out = [];
  for (const i of tiles) {
    const [x, y] = xy(w, i);
    for (const [dx, dy] of C4) {
      const vx = x + dx, vy = y + dy, key = vy * (w.w + 1) + vx;
      if (seen.has(key)) continue;
      seen.add(key);
      const h = w.vert(vx, vy);
      let v = want(vx, vy, h);
      if (v === h || !Number.isFinite(v)) continue;
      const owner = cornerOwner(w, vx, vy, self);
      if (owner === BUILDING) continue;
      if (owner !== LAND) {
        if (join && v < h) v = Math.min(h, Math.max(v, joinFloor(w, vx, vy, self, join)));
        else if (!(shore && owner === BODY && v > h)) continue;
      }
      if (v !== h) out.push(vx, vy, v);
    }
  }
  for (let k = 0; k < out.length; k += 3) w.setVert(out[k], out[k + 1], out[k + 2]);
  const moved = out.length > 0;
  if (moved) { w.heightDirty = true; w.hv = (w.hv || 0) + 1; }
  return moved;
}

// ---------------------------------------------------------------- the tools' edits

// Raise or Lower ground: the tile's corners go up or down by half of `amt` (40 levels: above the
// highest hill any map has, 0044). Beside water or a building only the land corners move. On water,
// the tiles of the same kind round it are its own body (a pond deepened moves that pond's corners),
// but never another kind of water's. (The tools refuse the river and creeks.)
export function shiftGround(w, i, amt) {
  const t = w.terrain[i], self = isWater(t) ? j => j === i || w.terrain[j] === t : j => j === i;
  return terrainEdit(w, [i], (vx, vy, h) => clamp(h + amt / 2, -1.5, 40), { self });
}

// How deep each kind of water is dug, under the tile's highest corner (less a 0.15 lip).
export const DIG_DEPTH = { [T.POND]: 0.6, [T.MARSH]: 0.2, [T.CREEK]: 0.4 };

// Dig tile i (already given its water kind) down so water sits in it, then a pond is levelled as one
// body and a creek graded toward the water it joins. Measured from the tile's highest corner, so
// digging next to existing water doesn't compound. Only ever lowers the dug tile.
export function digWater(w, i) {
  const [x, y] = xy(w, i), kind = w.terrain[i];
  const target = Math.max(...w.corners(x, y)) - DIG_DEPTH[kind] - 0.15;
  terrainEdit(w, [i], (vx, vy, h) => Math.min(h, target), { join: true });
  if (kind === T.POND) levelPond(w, i);
  // (a dug creek is graded toward the water it joins, so its fish can swim it both ways: 0048)
  if (kind === T.CREEK) { w.dugBed[i] = Math.max(...w.corners(x, y)); gradeDugCreek(w, x, y, w.dugBed); }
}

// A dug pond is one body of water with one surface, so its whole floor goes down to its lowest
// point, and a low bank round it stands above its water, as the map's own ponds have (0044).
// Dug into a slope without this, the uphill tiles stood above the water and were mud at once.
function levelPond(w, start) {
  const pond = [start], own = new Set(pond);
  for (let k = 0; k < pond.length; k++) {
    const [px, py] = xy(w, pond[k]);
    for (const [dx, dy] of N4) {
      const j = w.idx(px + dx, py + dy);
      if (w.inb(px + dx, py + dy) && !own.has(j) && w.terrain[j] === T.POND) { own.add(j); pond.push(j); }
    }
  }
  let lo = Infinity;
  for (const i of pond) lo = Math.min(lo, bedOf(w, ...xy(w, i)));
  // (a pond dug up to a creek or the river is joined to it, an oxbow or a backwater: its floor goes a
  // pond's depth under that water, so it holds the creek's level rather than standing above or below it)
  for (const i of pond) {
    const [px, py] = xy(w, i);
    for (const [dx, dy] of N4) {
      if (!w.inb(px + dx, py + dy)) continue;
      const t = w.terrain[w.idx(px + dx, py + dy)];
      if (t === T.CREEK || t === T.RIVER) lo = Math.min(lo, bedOf(w, px + dx, py + dy) + WATER_FILL[t] - WATER_FILL[T.POND]);
    }
  }
  // (the floor: joined to a creek or the river, at most CHANNEL_STEP under that channel's bed, so the
  // creek keeps its level and gains no step its fish can't swim: down a steep creek the pond's upstream
  // edge stands on the creek's higher bed and the pond joins it at its low end)
  const self = j => own.has(j);
  terrainEdit(w, pond, (vx, vy, h) => Math.min(h, lo), { self, join: 'pond' });
  // (the bank: the land round it comes up to stand above its water; the corners it shares with the
  // pond, other water or a building stay, by the owner rules)
  const bank = lo + WATER_FILL[T.POND] + 0.15, ring = new Set();
  for (const i of pond) {
    const [px, py] = xy(w, i);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!w.inb(px + dx, py + dy)) continue;
      const j = w.idx(px + dx, py + dy);
      if (!own.has(j) && !isWater(w.terrain[j]) && w.struct[j] < 0) ring.add(j);
    }
  }
  terrainEdit(w, [...ring], (vx, vy, h) => Math.max(h, bank));
}

// A creek the player digs (decision 0048): each tile cut from its own highest corner left a creek dug
// across a slope as a staircase of flat pools and dry chutes over a metre high, and salmon in it could
// never reach the creek it joined. This grades the dug creek tiles 4-connected to (x, y) (`dugBed`: NaN
// off them, else the floor the dig gave each, its highest corner) so that each dug tile's floor stands
// within CHANNEL_STEP of every corner it shares with the water it joins (a creek, the river, a pond or a
// marsh) and of every dug tile it shares a corner with: then each tile's water covers its whole bed.
// Floors go at most CHANNEL_CUT under the dig's floor and never over it, and no corner of other water
// moves. A dug creek joined to no other water (yet) is left as it is: it's graded when it's joined.
export function gradeDugCreek(w, x, y, dugBed) {
  const dug = i => w.terrain[i] === T.CREEK && Number.isFinite(dugBed[i]);
  const start = w.idx(x, y);
  if (!dug(start)) return false;
  const top = i => Math.max(...w.corners(...xy(w, i)));
  const comp = [start], b = new Map([[start, top(start)]]);
  let joined = false;
  for (let k = 0; k < comp.length; k++) {
    const [cx, cy] = xy(w, comp[k]);
    for (const [dx, dy] of N4) {
      if (!w.inb(cx + dx, cy + dy)) continue;
      const j = w.idx(cx + dx, cy + dy);
      if (dug(j)) { if (!b.has(j)) { b.set(j, top(j)); comp.push(j); } }
      else if (isWater(w.terrain[j])) joined = true;
    }
  }
  if (!joined) return false;
  const water = o => o === CHANNEL || o === BODY;
  // (each floor within CHANNEL_STEP of the other water's corners it shares, then of each dug tile it
  // shares a corner with: a shortest-path relaxation, as each lowered tile may lower those above it.
  // First down (the floor comes down to the water it joins), then up (a floor cut deeper than the
  // water beside it comes back up), each within its bounds)
  const was = new Map(b), lo = i => dugBed[i] - CHANNEL_CUT, hi = i => Math.max(dugBed[i], was.get(i));
  for (const sign of [1, -1]) {
    for (const i of comp) {
      const [cx, cy] = xy(w, i);
      for (const [dx, dy] of C4) if (water(cornerOwner(w, cx + dx, cy + dy, dug))) {
        const bound = w.vert(cx + dx, cy + dy) + sign * CHANNEL_STEP;
        b.set(i, sign > 0 ? Math.max(lo(i), Math.min(b.get(i), bound)) : Math.min(hi(i), Math.max(b.get(i), bound)));
      }
    }
    const q = comp.slice();
    for (let k = 0; k < q.length; k++) {
      const [cx, cy] = xy(w, q[k]), bound = b.get(q[k]) + sign * CHANNEL_STEP;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = w.inb(cx + dx, cy + dy) ? w.idx(cx + dx, cy + dy) : -1;
        if (!b.has(j)) continue;
        const v = sign > 0 ? Math.max(lo(j), Math.min(b.get(j), bound)) : Math.min(hi(j), Math.max(b.get(j), bound));
        if (Math.abs(v - b.get(j)) > 1e-6) { b.set(j, v); q.push(j); }
      }
    }
  }
  // (a corner takes the lowest floor of the dug tiles round it; the other water's corners stay put)
  const corner = new Map();
  for (const i of comp) {
    const [cx, cy] = xy(w, i);
    for (const [dx, dy] of C4) {
      const key = (cy + dy) * (w.w + 1) + cx + dx;
      corner.set(key, Math.min(corner.get(key) ?? Infinity, b.get(i)));
    }
  }
  return terrainEdit(w, comp, (vx, vy, h) => {
    const v = corner.get(vy * (w.w + 1) + vx);
    return Math.abs(v - h) > 1e-6 ? v : h;
  }, { self: dug });
}

// Fill & grade: one level across a stroke. How far (in levels) a land tile may sit from the stroke's
// level and still be graded to it: 1.5 levels (3.6 m) over the tile's 8 m is the steepest cut bank
// or fill slope a grader leaves; past that the pad simply stops where the ground gets too steep.
export const GRADE_REACH = 1.5;
// (a tile whose corners all stand this near the level is left as it is, so grading ground that is
// already level, or has the 0.02 lean fillPits leaves, moves and charges nothing)
const GRADE_SLACK = 0.03;

// The level a Fill & grade stroke starting on tile (x, y) grades to: that tile's own height, or, on
// water being filled, the land round it (as before) but never under the water's surface plus a bank
// (0.15), so the filled ground stands dry rather than being flooded again by the water beside it.
export function gradeLevel(w, x, y) {
  const i = w.idx(x, y), t = w.terrain[i];
  if (!isWater(t)) return w.tileH(x, y);
  let s = 0, n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || !w.inb(x + dx, y + dy) || isWater(w.terrain[w.idx(x + dx, y + dy)])) continue;
    s += w.tileH(x + dx, y + dy); n++;
  }
  const c = w.corners(x, y), surface = Math.min(...c) + (WATER_FILL[t] ?? 0.3) + 0.15;
  return Math.max(n ? s / n : Math.max(...c), surface);
}

// Set tile (x, y)'s corners to `level`, so the ground there is perfectly flat; the tiles round it
// that aren't graded take the slope between (a one-tile cut bank or fill slope). Filling part of a
// pond or marsh (`filling`) may raise the corners it shares with the rest of it: held, a filled shore
// tile sloped down under the water and the water model called it marsh. Returns whether any corner moved.
export function gradeTile(w, x, y, level, filling = false) {
  if (C4.every(([dx, dy]) => Math.abs(w.vert(x + dx, y + dy) - level) <= GRADE_SLACK)) return false;
  return terrainEdit(w, [w.idx(x, y)], () => level, { shore: filling });
}

// A building put up by the player stands on level ground: its footprint goes to the mean of its
// corners (as the map's own buildings, flattenRect), except corners it shares with water or another
// building.
export function levelBuilding(w, s) {
  const tiles = [];
  let sum = 0, n = 0;
  for (let y = s.y; y <= s.y + s.h; y++) for (let x = s.x; x <= s.x + s.w; x++) { sum += w.vert(x, y); n++; }
  for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) tiles.push(w.idx(x, y));
  return terrainEdit(w, tiles, () => sum / n);
}
