// Big floods trim tight creek bends (decision 0054, ideas batch creeks-fps session 6).
//
// Real creeks lose a tight bend mostly in a flood: high water runs straight across the inside of the
// bend (a chute cut-off) and the old loop is left as a wet hollow, an oxbow, that silts up to marsh.
// Since 0054 the map's own creeks and the creek tool never bend tighter than COURSE_TURN, so what this
// finds is a creek from an old save (PNW's old square-cornered ditch) or one a player's edits left
// sharp (a creek filled back to a corner). Rare and small: only a big flood, only land it rises over
// (after the wetlands' share, as Events.reachFrom), at most one bend a flood and a few tiles of it, so a farm changes over years, never per frame.
//
// It never cuts where anything people or beavers built stands near (a dam or its pond, a culvert, a
// road, a trail, a building, a boardwalk, gravel), a waterfall, a Fill & grade pad (a perfectly level
// tile), nor ground the map locks. The new channel is dug through the one edit path (digWater, 0048),
// graded toward the creek it joins so fish still swim it both ways; the old loop keeps its bed and
// becomes marsh. Saved as any edit is (terrain and heights); loading marks the new channel as dug
// creek (game.js), as it is while playing.
import { T, F, isWater } from '../config.js';
import { sharpBends, bendCutoff } from '../maps/water-shape.js';
import { isFall } from '../maps/landform.js';
import { digWater, shapeShoreNear, trialEdit } from '../terrain-edit.js';
import { removeTree } from './plants.js';
import { FISH_DEPTH } from './waterline.js';
import { swimsBetween, forgetSwimRoutes } from './swim-routes.js';

export const BIG_FLOOD = 1.3;   // (flood strength runs 0.7..1.8: about the top half)
export const CUT_CHANCE = 0.5;  // (for a bend it may cut: about one in four years where PNW floods most winters)
const CLEAR = 3;                // (tiles kept between a cut and anything built, a dam's pond or a fall)
const RISE = 0.45;              // (how far over a creek's water a flood of strength 1 reaches: Events.reachFrom)
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// May a flood of this strength cut through here? `add` the land the new channel takes, `seg` every
// tile of the reach.
function cuttable(game, add, seg, intensity) {
  const w = game.world, map = game.mapDefinition;
  // (the land it cuts is floodplain: no higher over the creek beside it than this flood rises over a
  // creek, measured as Events.reachFrom does, tile height over the nearest creek tile's. Not the
  // flood's own marks: those spread only from creeks open to the river's fish, and a creek above a
  // culvert floods as well)
  const creek = seg.filter(i => w.terrain[i] === T.CREEK);
  const over = i => {
    const x = i % w.w, y = (i / w.w) | 0;
    let d = Infinity, h = -Infinity;
    for (const j of creek) {
      const dj = Math.max(Math.abs(j % w.w - x), Math.abs(((j / w.w) | 0) - y)), hj = w.tileH(j % w.w, (j / w.w) | 0);
      if (dj < d) { d = dj; h = hj; } else if (dj === d) h = Math.max(h, hj);
    }
    return w.tileH(x, y) - h;
  };
  for (const i of add) {
    const t = w.terrain[i], x = i % w.w, y = (i / w.w) | 0, c = w.corners(x, y);
    if (isWater(t) || t === T.ROAD || t === T.TRAIL || t === T.GRAVEL || t === T.MUD) return false;
    if (w.struct[i] >= 0 || w.feature[i] || (map.canEdit && !map.canEdit(game, i))) return false;
    if (c.every(h => Math.abs(h - c[0]) < 1e-6)) return false; // (a graded pad: level to the millimetre)
    if (over(i) > RISE * intensity) return false;
  }
  // (nothing built, no beaver pond and no fall within CLEAR tiles; a river beside the reach is fine)
  const near = new Set();
  for (const i of [...add, ...seg]) {
    const x = i % w.w, y = (i / w.w) | 0;
    for (let dy = -CLEAR; dy <= CLEAR; dy++) for (let dx = -CLEAR; dx <= CLEAR; dx++) if (w.inb(x + dx, y + dy)) near.add(w.idx(x + dx, y + dy));
  }
  for (const j of near) {
    const f = w.feature[j], t = w.terrain[j];
    if (f === F.DAM || f === F.CULVERT || f === F.BOARDWALK || w.struct[j] >= 0 || t === T.ROAD) return false;
    if (w.waterManaged?.[j] || t === T.POND || (t === T.CREEK && isFall(w, j))) return false;
  }
  // (the loop's ends stay joined to the creek: it isn't cut where the reach runs off the map)
  return seg.every(i => { const x = i % w.w, y = (i / w.w) | 0; return N4.every(([dx, dy]) => w.inb(x + dx, y + dy)); });
}

// The ground and water of a cut: the new channel dug through the one edit path, graded toward the
// creek it joins (only its own tiles: a player's dug creek it joins keeps its bed), the old loop
// marsh on its old bed, the shores near it shaped again. No plants or animals: see applyCutoff.
function carve(w, { add, loop }) {
  const real = w.dugBed;
  w.dugBed = new Float32Array(w.n).fill(NaN); // (graded on its own: gradeDugCreek reaches every dug tile joined to it)
  try {
    for (const i of add) { w.terrain[i] = T.CREEK; digWater(w, i); } // (in order down the course)
    for (const i of add) real[i] = w.dugBed[i];
  } finally { w.dugBed = real; }
  for (const i of loop) { w.terrain[i] = T.MARSH; real[i] = NaN; } // (its bed stays: a wet hollow, the oxbow)
  shapeShoreNear(w, [...add, ...loop]);
}

// Fish still swim the whole reach both ways after it, by the test their routes use (swim-routes.js):
// tile to tile down the course, the creek above the cut to the creek below.
function swimmable(w, course) {
  for (let k = 0; k + 1 < course.length; k++) if (!swimsBetween(w, course[k], course[k + 1], FISH_DEPTH)) return false;
  return true;
}

// Try the cut and put everything back: does the reach come out swimmable? (A steep reach, or land too
// high for grading to bring the channel down to the creek, doesn't.)
function trial(w, cut) {
  return trialEdit(w, () => { carve(w, cut); return swimmable(w, cut.course); });
}

// The bends a flood of this strength (after the wetlands' share) may cut: [{ bend, add, loop, course }], the sharpest first, one
// per bend (sharpBends names each tile of a corner; the sharpest of a cluster stands for it).
export function cutoffCandidates(game, intensity = 1.8) {
  const w = game.world, out = [], taken = [];
  for (const b of sharpBends(w).sort((a, c) => c.turn - a.turn || a.y - c.y || a.x - c.x)) {
    if (taken.some(t => Math.abs(t.x - b.x) <= 3 && Math.abs(t.y - b.y) <= 3)) continue;
    taken.push(b);
    const cut = bendCutoff(w, b);
    if (cut && cuttable(game, cut.add, cut.course.concat(cut.loop), intensity) && trial(w, cut)) out.push({ bend: b, ...cut });
  }
  return out;
}

// Called as a flood comes up (Events.finishFlood). Returns the cut made, or null. Every test comes
// before the run's random stream is drawn, and it's drawn only when there is a bend to cut, so a farm
// without one floods exactly as before.
// `sponge` is the wetlands' share of it (Events.sponge): the land it reaches is judged after that.
export function floodCutoff(game, intensity, sponge = 0) {
  if (intensity < BIG_FLOOD) return null;
  const cands = cutoffCandidates(game, intensity * (1 - sponge));
  if (!cands.length || game.rng() >= CUT_CHANCE) return null;
  applyCutoff(game, cands[0]);
  return cands[0];
}

// Cut the new channel and leave the old loop as marsh, with the plants that can't stand in water gone.
export function applyCutoff(game, cut) {
  const w = game.world, P = game.catalog.plants;
  for (const i of cut.add) {
    w.clearPlants(i, 'flood');
    w.feature[i] = 0;
    w.soil[i] = Math.max(w.soil[i], 0.3);
    w.flood[i] = 0; // (the creek's own now: no silt or seed left on it as the flood goes down)
  }
  for (const i of cut.loop) { // (as the Shallow marsh tool clears a tile)
    if (w.shrub[i] && !P[w.shrub[i]]?.wetOK) { w.shrub[i] = 0; w.shrubG[i] = 0; }
    if (w.ground[i] && !P[w.ground[i]]?.wetOK && !P[w.ground[i]]?.aquatic) { w.ground[i] = 0; w.groundG[i] = 0; }
    if (w.tree[i] && !P[w.tree[i]]?.mangrove && !P[w.tree[i]]?.swampTree) removeTree(w, i, 'flood', null, { deadwood: false });
  }
  carve(w, cut);
  forgetSwimRoutes(w);
  w.hydroDirty = true; w.renderDirty = true;
  game.refreshEnvironment();
}
