// The shape of water on the land (decision 0054): creeks bend in curves, never at the tile grid's
// right angles, and every shore follows a smooth line rather than the tiles' stair-steps.
//
// Water is simulated per tile and the ground is a grid of tile corners, so on their own a creek's
// course turns 90° wherever its tiles do and a waterline runs along tile edges. Two rules fix that at
// the land, not in the drawing:
//
// 1. The course. A creek's course turns at most COURSE_TURN (degrees) between the COURSE_CHORD-tile
//    chords either side of any tile (allowing for the grid's jogs); creeks are laid and dug with a
//    COURSE_RADIUS-tile (32 m) bend radius. Map creeks are laid as a polyline with rounded corners (`smoothCourse`, `rasterCourse`); a creek the player digs
//    follows the stroke with a turn rate held to that radius (`steerCourse`). `sharpBends` finds the
//    places that break it (the check, and flood trimming in a later session, call it).
// 2. The shore. The land corners at the water's edge are set so the drawn waterline (where the
//    ground meets the water's surface, on the mesh's own triangles) follows a smoothed outline of the
//    water's tiles (`shapeShore`). It only lowers land corners (so it never dams or makes a hollow),
//    but lifts any that sit under the water to just above it (water stays in its tiles), and never
//    moves a water tile's corners, a building's, or anything beyond the first ring of land.

import { T, F, isWater } from '../config.js';
import { WATER_FILL } from '../sim/waterline.js';
import { isFall } from './landform.js';

export const COURSE_RADIUS = 4, COURSE_CHORD = 3;
// (a circular bend of radius R turns 2·asin(chord/2R) between two chords: 44° at the 4 tiles creeks are
// laid and dug to. The tiles add up to about 20° of their own (a curve rasterised onto the grid jogs),
// so the limit, 70°, is about a 2.6-tile radius as tiles; a right-angle corner on the grid reads 90°)
export const COURSE_TURN = 70;

// ---------------------------------------------------------------- the course

// A polyline (tile coordinates, [x, y] points; tile centres are at +0.5) with every corner replaced
// by a circular arc of `radius` tiles (smaller where the legs are too short for it). Returns a dense
// polyline, points about `step` apart along the arcs.
export function smoothCourse(points, radius = COURSE_RADIUS, step = 0.25) {
  if (points.length < 3) return points.map(p => [p[0], p[1]]);
  const out = [[points[0][0], points[0][1]]];
  for (let k = 1; k < points.length - 1; k++) {
    const a = points[k - 1], p = points[k], b = points[k + 1];
    const ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (!lu || !lv) continue;
    const dux = ux / lu, duy = uy / lu, dvx = vx / lv, dvy = vy / lv;
    const phi = Math.acos(Math.max(-1, Math.min(1, dux * dvx + duy * dvy)));
    if (phi < 1e-3) { out.push([p[0], p[1]]); continue; }
    // (each leg lends at most half of itself to the arcs at its two ends)
    const tan = Math.min(radius * Math.tan(phi / 2), lu / 2, lv / 2), r = tan / Math.tan(phi / 2);
    const s = [p[0] - dux * tan, p[1] - duy * tan];
    const side = Math.sign(dux * dvy - duy * dvx); // (+1 turning clockwise in screen space, y down)
    // centre: from the arc's start, a radius across to the inside of the turn
    const nx = -duy * side, ny = dux * side, ccx = s[0] + nx * r, ccy = s[1] + ny * r;
    const a0 = Math.atan2(s[1] - ccy, s[0] - ccx), n = Math.max(2, Math.ceil(phi * r / step));
    for (let j = 0; j <= n; j++) {
      const t = a0 + side * phi * j / n;
      out.push([ccx + Math.cos(t) * r, ccy + Math.sin(t) * r]);
    }
  }
  out.push([points.at(-1)[0], points.at(-1)[1]]);
  return out;
}

// The tiles a polyline passes over, in order and 4-connected (where it crosses a tile corner
// diagonally, the side tile nearer the line joins the two).
export function rasterCourse(line, step = 0.1) {
  const tiles = [];
  const push = (x, y) => { const l = tiles.at(-1); if (!l || l[0] !== x || l[1] !== y) tiles.push([x, y]); };
  for (let k = 0; k < line.length - 1; k++) {
    const [x0, y0] = line[k], [x1, y1] = line[k + 1], len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j <= n; j++) {
      const fx = x0 + (x1 - x0) * j / n, fy = y0 + (y1 - y0) * j / n, tx = Math.floor(fx), ty = Math.floor(fy);
      const l = tiles.at(-1);
      if (l && l[0] !== tx && l[1] !== ty) {
        // diagonal: the side tile whose centre is nearer this point
        const a = [tx, l[1]], b = [l[0], ty];
        const da = Math.hypot(a[0] + 0.5 - fx, a[1] + 0.5 - fy), db = Math.hypot(b[0] + 0.5 - fx, b[1] + 0.5 - fy);
        push(...(da <= db ? a : b));
      }
      push(tx, ty);
    }
  }
  return tiles;
}

// The turn (degrees) at each tile of a 4-connected course: the angle between the chord from
// `chord` tiles back to it and the chord from it to `chord` tiles on. [{ x, y, turn }]
export function courseTurns(tiles, chord = COURSE_CHORD) {
  const out = [];
  for (let k = chord; k < tiles.length - chord; k++) {
    const a = tiles[k - chord], p = tiles[k], b = tiles[k + chord];
    const ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (!lu || !lv) continue;
    out.push({ x: p[0], y: p[1], turn: Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / lu / lv))) * 180 / Math.PI });
  }
  return out;
}

// Each creek's courses, as tile chains from every source (a creek tile with no creek upstream of
// it) down to where it runs out (the river, a pond, a marsh or the map's edge), following the
// shortest way down through the creek's tiles. A chain stops where it reaches tiles an earlier,
// longer chain already took (a tributary's confluence is a junction, not a bend), keeping
// `chord` tiles of that chain so its last bend before the junction is still measured.
export function creekCourses(w, isCreek = i => w.terrain[i] === T.CREEK) {
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], dist = new Int32Array(w.n).fill(-1), q = [];
  for (let i = 0; i < w.n; i++) {
    if (!isCreek(i)) continue;
    const x = i % w.w, y = (i / w.w) | 0;
    let out = false;
    for (const [dx, dy] of N4) {
      const xx = x + dx, yy = y + dy;
      if (!w.inb(xx, yy)) { out = true; continue; }
      const j = w.idx(xx, yy);
      if (!isCreek(j) && isWater(w.terrain[j])) out = true;
    }
    if (out) { dist[i] = 0; q.push(i); }
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % w.w, y = (i / w.w) | 0;
    for (const [dx, dy] of N4) {
      const xx = x + dx, yy = y + dy;
      if (!w.inb(xx, yy)) continue;
      const j = w.idx(xx, yy);
      if (isCreek(j) && dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); }
    }
  }
  // (a creek tile with no way out, a stub dug on its own, has no course to measure)
  const down = i => {
    const x = i % w.w, y = (i / w.w) | 0;
    let best = -1;
    for (const [dx, dy] of N4) {
      const xx = x + dx, yy = y + dy;
      if (!w.inb(xx, yy)) continue;
      const j = w.idx(xx, yy);
      if (isCreek(j) && dist[j] === dist[i] - 1 && (best < 0 || j < best)) best = j;
    }
    return best;
  };
  const isSource = i => {
    if (dist[i] < 0) return false;
    const x = i % w.w, y = (i / w.w) | 0;
    for (const [dx, dy] of N4) {
      const xx = x + dx, yy = y + dy;
      if (w.inb(xx, yy) && isCreek(w.idx(xx, yy)) && dist[w.idx(xx, yy)] === dist[i] + 1) return false;
    }
    return true;
  };
  const sources = [];
  for (let i = 0; i < w.n; i++) if (isSource(i)) sources.push(i);
  sources.sort((a, b) => dist[b] - dist[a] || a - b); // (the longest first: the main stem)
  const taken = new Uint8Array(w.n), courses = [];
  for (const s of sources) {
    const chain = [];
    let i = s, extra = 0;
    while (i >= 0) {
      chain.push([i % w.w, (i / w.w) | 0]);
      if (taken[i]) { if (++extra > COURSE_CHORD) break; } else taken[i] = 1;
      i = dist[i] > 0 ? down(i) : -1;
    }
    if (chain.length > 1) courses.push(chain);
  }
  return courses;
}

// Every place on the map's creeks that turns sharper than the limit: [{ x, y, turn }]. Within two
// tiles of a junction (a creek tile with creek on three or four sides) a turn is where one creek
// joins another, not a bend in either: Sumatra's canal grid, a tributary dug into the creek.
export function sharpBends(w, limit = COURSE_TURN, isCreek = i => w.terrain[i] === T.CREEK) {
  const out = [], seen = new Set();
  const creekAt = (x, y) => w.inb(x, y) && isCreek(w.idx(x, y));
  const junction = (x, y) => creekAt(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => creekAt(x + dx, y + dy)).length >= 3;
  const nearJunction = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (junction(x + dx, y + dy)) return true; return false; };
  for (const c of creekCourses(w, isCreek)) for (const t of courseTurns(c)) {
    if (t.turn <= limit || nearJunction(t.x, t.y)) continue;
    const k = t.x + ',' + t.y;
    if (!seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out;
}

// A flood cutting across a tight bend (a chute cut-off): where the creek turns sharper than the limit
// at `bend` ({ x, y } from sharpBends), the course from `reach` tiles above it to `reach` tiles below is
// laid again as a rounded line (smoothCourse, rasterCourse), the shortest reach that comes out within
// the limit and small (CUT_ADD new tiles at most, CUT_LOOP left behind). Returns { add, loop, course }
// (tile indices: the land the new channel takes, in order down the creek; the old loop's creek tiles
// it leaves; the whole reach's tiles in order) or null. Changes nothing: the flood (sim/creek-cutoff.js)
// decides whether the land there may be cut and writes it through the one edit path (0048).
export const CUT_ADD = 8, CUT_LOOP = 10;
export function bendCutoff(w, bend, isCreek = i => w.terrain[i] === T.CREEK) {
  const at = w.idx(bend.x, bend.y), N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // (the chain that holds the bend furthest from its ends)
  let chain = null, k = -1, room = -1;
  for (const c of creekCourses(w, isCreek)) {
    const j = c.findIndex(([x, y]) => x === bend.x && y === bend.y);
    if (j >= 0 && Math.min(j, c.length - 1 - j) > room) { chain = c; k = j; room = Math.min(j, c.length - 1 - j); }
  }
  if (!chain) return null;
  for (let reach = Math.min(7, room); reach >= 4; reach--) {
    const seg = chain.slice(k - reach, k + reach + 1).map(([x, y]) => w.idx(x, y)), inSeg = new Set(seg);
    const pts = [chain[k - reach], chain[k], chain[k + reach]].map(([x, y]) => [x + 0.5, y + 0.5]);
    const course = rasterCourse(smoothCourse(pts, COURSE_RADIUS));
    if (course.some(([x, y]) => !w.inb(x, y))) continue;
    const line = course.map(([x, y]) => w.idx(x, y)), onLine = new Set(line);
    const add = line.filter(i => !isCreek(i)), loop = seg.filter(i => !onLine.has(i));
    if (!add.length || add.length > CUT_ADD || !loop.length || loop.length > CUT_LOOP) continue;
    // (it keeps to its own reach: the new channel touches no other creek, and no tributary joins the
    // old loop, which would be left with its water going nowhere)
    const other = i => { const x = i % w.w, y = (i / w.w) | 0; return N4.some(([dx, dy]) => w.inb(x + dx, y + dy) && isCreek(w.idx(x + dx, y + dy)) && !inSeg.has(w.idx(x + dx, y + dy))); };
    if (line.some(i => !inSeg.has(i) && isCreek(i)) || add.some(other) || loop.some(other)) continue;
    // (and the reach it leaves is within the limit, with the old loop gone)
    const cut = new Set(loop), next = i => (isCreek(i) && !cut.has(i)) || onLine.has(i);
    if (sharpBends(w, COURSE_TURN, next).some(b => Math.abs(b.x - bend.x) <= reach + 2 && Math.abs(b.y - bend.y) <= reach + 2)) continue;
    return { add, loop, course: line };
  }
  return null;
}

// A creek the player digs follows the stroke the way water would cut it. A head runs half a tile at a
// time toward the point on the stroke LOOK tiles ahead of it (so a corner in the stroke is cut round,
// starting before it), turning no tighter than COURSE_RADIUS. It lags that far behind the cursor;
// `finishCourse` runs it on to the end of the stroke. `head` is the stroke's state (null at the start);
// each returns { head, tiles } with the tiles it crossed, in order and 4-connected.
const LOOK = COURSE_RADIUS + 1, STEP = 0.5;
export function steerCourse(head, x, y, radius = COURSE_RADIUS, from = null) {
  const tx = x + 0.5, ty = y + 0.5;
  if (!head) return { head: { x: tx, y: ty, hx: from?.[0] ?? 0, hy: from?.[1] ?? 0, tile: [x, y], trail: [[tx, ty]], k: 0 }, tiles: [[x, y]] };
  head = { ...head, trail: head.trail.concat([[tx, ty]]) };
  const tiles = [];
  for (let guard = 0; guard < 400; guard++) {
    // the first point of the stroke at least LOOK tiles from the head
    while (head.k < head.trail.length && Math.hypot(head.trail[head.k][0] - head.x, head.trail[head.k][1] - head.y) < LOOK) head.k++;
    if (head.k >= head.trail.length) break; // (wait for the stroke to run on)
    if (!stepHead(head, head.trail[head.k], radius, tiles)) break;
  }
  return { head, tiles };
}
// Where a stroke starts at the end of a creek (on its last tile, or on land beside it and beside no
// other creek), the creek carries on from that end the way it was running: { at: [x, y] the end
// tile, heading: [dx, dy] }, else null (a stroke starting from the middle of a creek is a tributary
// joining it, which may leave at any angle).
export function creekEndHeading(w, x, y) {
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], creek = (a, b) => w.inb(a, b) && w.terrain[w.idx(a, b)] === T.CREEK;
  const nb = (a, b) => N4.filter(([dx, dy]) => creek(a + dx, b + dy));
  let ex = x, ey = y;
  if (!creek(x, y)) {
    const n = nb(x, y);
    if (n.length !== 1) return null;
    ex = x + n[0][0]; ey = y + n[0][1];
  }
  const n = nb(ex, ey).filter(([dx, dy]) => ex + dx !== x || ey + dy !== y);
  if (n.length !== 1) return null;
  return { at: [ex, ey], heading: [-n[0][0], -n[0][1]] };
}

export function finishCourse(head, radius = COURSE_RADIUS) {
  const tiles = [];
  if (!head) return { head, tiles };
  head = { ...head, ending: true };
  const end = head.trail.at(-1);
  for (let guard = 0; guard < 400; guard++) {
    if (Math.hypot(end[0] - head.x, end[1] - head.y) < STEP) break;
    if (!stepHead(head, end, radius, tiles)) break; // (an end behind it or inside its tightest turn: it stops short)
  }
  return { head, tiles };
}
// One half-tile step of the head toward point p, turning at most for a bend of `radius`. Returns
// false, without moving, when p lies behind the head (or, at the end, inside its tightest turn).
function stepHead(head, p, radius, tiles) {
  const dx = p[0] - head.x, dy = p[1] - head.y, d = Math.hypot(dx, dy);
  if (d < 1e-6) return false;
  let ux = dx / d, uy = dy / d;
  if ((head.hx || head.hy) && radius > 0) {
    const { hx, hy } = head, cross = hx * uy - hy * ux, dot = hx * ux + hy * uy;
    const side = cross >= 0 ? 1 : -1, cx = head.x - hy * side * radius, cy = head.y + hx * side * radius;
    if (dot < 0) return false;
    // (inside its tightest turn it can't reach p: still turns as hard as it may, and an end it
    // would only circle stops the creek where it is)
    if (head.ending && Math.hypot(p[0] - cx, p[1] - cy) < radius - 1e-6) return false;
    const turn = Math.max(-STEP / radius, Math.min(STEP / radius, Math.atan2(cross, dot)));
    ux = hx * Math.cos(turn) - hy * Math.sin(turn); uy = hx * Math.sin(turn) + hy * Math.cos(turn);
  }
  const len = Math.min(STEP, d);
  head.hx = ux; head.hy = uy; head.x += ux * len; head.y += uy * len;
  const nx = Math.floor(head.x), ny = Math.floor(head.y), t = head.tile;
  if (nx !== t[0] || ny !== t[1]) {
    if (nx !== t[0] && ny !== t[1]) {
      const a = [nx, t[1]], b = [t[0], ny];
      const da = Math.hypot(a[0] + 0.5 - head.x, a[1] + 0.5 - head.y), db = Math.hypot(b[0] + 0.5 - head.x, b[1] + 0.5 - head.y);
      tiles.push(da <= db ? a : b);
    }
    head.tile = [nx, ny];
    tiles.push(head.tile);
  }
  return true;
}

// ---------------------------------------------------------------- the shore

const SIGMA = 0.9, REACH = 3; // (the outline: the water's tiles blurred over about a tile)
const TAU_ = 0.35;            // (the shore stands where the blurred water falls to this; a straight
                              // creek one tile wide reads 0.38 at its banks, so it keeps its width; the
                              // outer corner of a diagonal's step reads 0.32, so it comes out of the water)
const T_MIN = 0.12;           // (nearest the waterline comes to a water corner, a tile edge's fraction)
const BANK = { [T.POND]: 0.15, [T.MARSH]: 0.15 }, BANK_MIN = 0.03; // (least height of a shaped land corner over the water)
const DRY = 0.3;              // (most a water tile's outer corner is lifted over the water)
const RAISE_ = 0.3;           // (most a land corner at the edge is raised, to steepen the bank where the
                              // outline hugs the water; more measured no smoother)

const ROUND = [[0, 0], [-1, 0], [0, -1], [-1, -1]];
const C4 = [[0, 0], [1, 0], [1, 1], [0, 1]];
// a corner's neighbours along the mesh's edges (its triangles split each tile corner (0,0) to (1,1))
const EDGES = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];

/** New heights for the corners at the water's edge, so the waterline follows a smooth outline of the
 * water's tiles (the tiles blurred, cut at TAU) instead of their stair-steps:
 * - a water tile's corner that sticks out past the outline (the outer corner of a step or a bend) is
 *   lifted just out of the water, so the shore cuts across that tile. Never a corner that is the only
 *   lowest of a water tile it touches (that sets the tile's water level), never one two water tiles
 *   share, never a river's or a waterfall's, and beds are never lowered;
 * - a land corner beside the water is lowered toward the water (never under it) where the outline
 *   runs out past it, as at the inside of a step or a bend; raised at most RAISE (70 cm) where the
 *   outline hugs the water, steepening the bank; and lifted if it stood under the water. Never raised
 *   where the land behind it would no longer drain (a hollow, 0044).
 * The water's level is its full one (a Hollis pond's at least, even drawn down in a dry summer).
 * `box` (optional [x0, y0, x1, y1], corners) limits it to an area. Returns a flat list
 * [vx, vy, h, ...] of the corners to move; the caller writes them (map generation directly, the
 * player's edits through terrainEdit). */
export function shoreHeights(w, box = null, opt = {}) {
  const W = w.w, H = w.h;
  const TAU = opt.tau ?? TAU_, RAISE = opt.raise ?? RAISE_;
  const X0 = Math.max(0, box ? box[0] : 0), Y0 = Math.max(0, box ? box[1] : 0), X1 = Math.min(W, box ? box[2] : W), Y1 = Math.min(H, box ? box[3] : H);
  if (X1 < X0 || Y1 < Y0) return [];
  const moved = new Map(), vert = (vx, vy) => moved.get(vy * (W + 1) + vx) ?? w.vert(vx, vy);
  const minOf = (x, y) => Math.min(...C4.map(([dx, dy]) => vert(x + dx, y + dy)));
  // the water's surface on each water tile (the Hollis model's where it runs)
  const levelOf = (x, y) => {
    if (!w.inb(x, y)) return null;
    const i = w.idx(x, y), t = w.terrain[i];
    if (!isWater(t)) return null;
    // (full: the Hollis model's level falls through a dry summer, and a bank set to that would flood
    // when the pond fills again)
    const full = minOf(x, y) + WATER_FILL[t];
    return w.waterManaged?.[i] && Number.isFinite(w.waterLevel?.[i]) ? Math.max(full, w.waterLevel[i]) : full;
  };
  // off the map the tiles carry on as the edge's (a creek running off the map isn't rounded off there)
  const wetTile = (x, y) => { const cx = Math.min(W - 1, Math.max(0, x)), cy = Math.min(H - 1, Math.max(0, y)); return isWater(w.terrain[w.idx(cx, cy)]); };
  const Sc = new Map(), S = (vx, vy) => {
    const key = vy * (W + 1) + vx;
    let v = Sc.get(key);
    if (v !== undefined) return v;
    let s = 0, g = 0;
    for (let ty = vy - REACH; ty < vy + REACH; ty++) for (let tx = vx - REACH; tx < vx + REACH; tx++) {
      const k = Math.exp(-((tx + 0.5 - vx) ** 2 + (ty + 0.5 - vy) ** 2) / (2 * SIGMA * SIGMA));
      g += k; if (wetTile(tx, ty)) s += k;
    }
    Sc.set(key, v = s / g);
    return v;
  };
  const tilesRound = (vx, vy) => ROUND.map(([ox, oy]) => [vx + ox, vy + oy]).filter(([x, y]) => w.inb(x, y));
  // (corners that stay: a building's, a road's (the culvert's crossing, a street's bridge), a dam's or
  // a boardwalk's, and those of tiles the caller holds, as a Fill & grade pad)
  const hold = opt.hold;
  const building = (vx, vy) => tilesRound(vx, vy).some(([x, y]) => {
    const i = w.idx(x, y);
    return w.struct[i] >= 0 || w.terrain[i] === T.ROAD || w.feature[i] === F.CULVERT || w.feature[i] === F.DAM || w.feature[i] === F.BOARDWALK || hold?.has(i);
  });
  // (only corners near the tiles the caller asks about: `near(vx, vy)`, default all)
  const near = opt.near || (() => true);
  // the water standing at a corner: the highest of the water tiles touching it, and its kind
  const cornerWater = (vx, vy) => {
    let L = -Infinity, kind = 0;
    for (const [x, y] of tilesRound(vx, vy)) { const l = levelOf(x, y); if (l != null && l > L) { L = l; kind = w.terrain[w.idx(x, y)]; } }
    return L > -Infinity ? { L, kind } : null;
  };
  const set = (vx, vy, h) => moved.set(vy * (W + 1) + vx, h);
  // Does every land corner round (vx, vy) that would stand lower than h have another way down?
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const drainsPast = (vx, vy, h) => N8.every(([dx, dy]) => {
    const nx = vx + dx, ny = vy + dy, hn = vert(nx, ny);
    if (hn >= h || cornerWater(nx, ny)) return true;
    return N8.some(([ex, ey]) => (nx + ex !== vx || ny + ey !== vy) && vert(nx + ex, ny + ey) < hn - 0.01);
  });

  // 1. water corners sticking out past the outline come up out of the water
  for (let vy = Y0; vy <= Y1; vy++) for (let vx = X0; vx <= X1; vx++) {
    const round = tilesRound(vx, vy);
    if (round.length < 4 || building(vx, vy)) continue; // (the map's edge: the water runs on off it)
    // (only the outer corner of a step or a bend: touched by one water tile. A corner two water
    // bodies share, a pond's edge where a creek feeds it, stays: 0048)
    const water = round.filter(([x, y]) => isWater(w.terrain[w.idx(x, y)]));
    if (water.length !== 1 || !near(vx, vy) || (opt.own && !opt.own.has(w.idx(...water[0])))) continue;
    const sc = S(vx, vy);
    if (sc >= TAU) continue;
    if (water.some(([x, y]) => { const i = w.idx(x, y); return w.terrain[i] === T.RIVER || isFall(w, i); })) continue;
    const cw = cornerWater(vx, vy), h0 = vert(vx, vy);
    if (!cw) continue;
    const h = cw.L + Math.min(DRY, BANK_MIN + (TAU - sc) * 2);
    if (h <= h0) continue;
    // (never the only lowest corner of a tile: that is what its water stands on)
    const sole = water.some(([x, y]) => {
      const lo = minOf(x, y);
      if (h0 > lo + 1e-6) return false;
      return C4.filter(([dx, dy]) => vert(x + dx, y + dy) <= lo + 1e-6).length < 2;
    });
    if (!sole) set(vx, vy, h);
  }

  // 2. land corners beside the water: where the outline crosses each edge to an underwater corner
  for (let vy = Y0; vy <= Y1; vy++) for (let vx = X0; vx <= X1; vx++) {
    const round = tilesRound(vx, vy);
    if (round.length < 4 || !near(vx, vy) || building(vx, vy) || round.some(([x, y]) => isWater(w.terrain[w.idx(x, y)]))) continue;
    const wet = [];
    let L = -Infinity, bank = BANK_MIN;
    for (const [dx, dy] of EDGES) {
      const ax = vx + dx, ay = vy + dy;
      if (ax < 0 || ay < 0 || ax > W || ay > H) continue;
      const cw = cornerWater(ax, ay);
      if (!cw) continue;
      wet.push([ax, ay]);
      if (cw.L > L) L = cw.L;
      bank = Math.max(bank, BANK[cw.kind] ?? BANK_MIN);
    }
    if (!wet.length) continue;
    const h0 = vert(vx, vy), sc = S(vx, vy);
    let sum = 0, n = 0;
    for (const [ax, ay] of wet) {
      const fa = vert(ax, ay) - L;
      if (fa >= 0) continue; // (out of the water: lifted above, or a steep creek's high side)
      const sa = S(ax, ay);
      const t = sa > sc ? Math.min(1, Math.max(T_MIN, (sa - TAU) / (sa - sc))) : T_MIN;
      sum += -fa * (1 / t - 1); n++;
    }
    let h = n ? L + Math.max(bank, sum / n) : Math.max(h0, L + bank);
    // (raised only by ponds and marsh: a creek's or the river's banks stay low, its floodplain is where
    // a beaver pond and a flood spread)
    h = Math.min(h, Math.max(h0 + (bank > BANK_MIN ? RAISE : 0), L + bank));
    // (raised only where the land behind it still drains another way: a bank raised across the
    // only way down for the ground behind it would close a hollow there, 0044)
    // (after the player's edit, land they lowered under the water still comes out of it: Lower dug
    // that hollow, and water standing in a square bay off the creek is what this pass is for)
    if (h > h0 && !(opt.edit && h0 < L) && !drainsPast(vx, vy, h)) h = h0;
    set(vx, vy, h);
  }
  const out = [];
  for (const [key, h] of moved) {
    const vx = key % (W + 1), vy = (key / (W + 1)) | 0;
    if (Math.abs(h - w.vert(vx, vy)) > 1e-6) out.push(vx, vy, h);
  }
  return out;
}

// Shape every shore on the map, while it's made (map generation writes heights directly: 0048).
export function shapeShore(w) {
  const out = shoreHeights(w);
  for (let k = 0; k < out.length; k += 3) w.setVert(out[k], out[k + 1], out[k + 2]);
  if (out.length) { w.heightDirty = true; w.hv = (w.hv || 0) + 1; }
  return out.length / 3;
}

// ---------------------------------------------------------------- beyond the north fence

// The starting creek carried on through the drawn land beyond the farm's north edge, so it's seen to
// come from somewhere (Cole, 2026-11-22). Drawing only: `course(y)` is the map's own creek line
// (`northCreek` in its definition) for y < 0; the tiles between course(y) and course(y + 1) become
// creek, as the map's own loops lay it. The bed is carved only at vertices north of row 0 (the
// farm's corners and the simulation never move), falling toward the farm at least BED_FALL a row,
// so the water runs downhill into it (0044). Its targets come from bank corners the carve never
// touches, so running it again (every load: an old save's border is carved the same) changes nothing.
// Returns the rows where the land falls northward faster than the bed could (0 on every map now).
// The bed sits in a shallow gorge: GORGE levels under the untouched banks (a tile beyond the creek's
// walls; deeper, 2-3 levels by the fence, stood as raw earth walls in the intro film), so the water
// runs down out of the trees in a channel instead of standing as a wide tilted sheet on the hillside (Cole, 2026-11-23: "too wide, irregular ... set down into a slight
// gorge"). The tile either side is its wall, its outer corners lowered WALL of the way down; no tree
// stands on the creek or its walls. keep(vx, vy): corners it leaves alone (PNW: the intro film's stage on
// its east bank, where the animals' hooves sank on the gorge's slopes).
const MIN_WIDE = 2, GORGE = 0.8, WALL = 0.5, BED_FALL = 0.02;
// The creek's tiles on row y < 0 beyond the fence, [lo, hi], as outsideCreek lays them: between
// course(y) and course(y + 1), and on the row by the fence as wide as the creek coming under it (a
// two-tile creek at row 0 doesn't narrow to one past the fence). Null where it isn't carried on.
export function northCreekSpan(w, course, y) {
  if (!course) return null;
  const c0 = course(0);
  if (w.terrain[w.idx(c0, 0)] !== T.CREEK) return null;
  const a = course(y), b = course(y + 1);
  let lo = Math.min(a, b), hi = Math.max(a, b);
  if (y === -1) {
    while (lo > 0 && w.terrain[w.idx(lo - 1, 0)] === T.CREEK && lo - 1 >= c0 - 2) lo--;
    for (let x = c0; x < w.w - 1 && x < c0 + 2 && w.terrain[w.idx(x + 1, 0)] === T.CREEK; x++) hi = Math.max(hi, x + 1);
  }
  // (never under MIN_WIDE tiles, widened on its west side: one tile wide in its gorge it drew as a
  // thread beside the farm's ditch, whose water spreads over its banks, Cole, 2026-11-23: "necks down
  // right as it meets the farm". West: away from PNW's film stage on its east bank)
  while (hi - lo + 1 < MIN_WIDE && lo > 0) lo--;
  return [lo, hi];
}
// The height of the land the gorge is cut into, at vertex row vy < 0 (min of the untouched corners
// either side, beyond the walls); null off the creek. The intro film stands its cameras on it.
export function northCreekBank(w, course, vy) {
  const s = northCreekSpan(w, course, vy - 1), t = northCreekSpan(w, course, Math.min(-1, vy));
  if (!s || !t) return null;
  const lo = Math.min(s[0], t[0]), hi = Math.max(s[1], t[1]) + 1;
  return { lo, hi, bank: Math.min(w.vert(lo - 2, vy), w.vert(hi + 2, vy)) };
}
export function outsideCreek(w, border, course, B, keep = null) {
  // (only where the creek still reaches the fence: an old PNW farm's ditch began a row in, at a spring,
  // and keeps it; a creek the player filled at the fence isn't carried on past it on the next load)
  if (!northCreekSpan(w, course, -1)) return 0;
  let uphill = 0, moved = false;
  const span = y => northCreekSpan(w, course, y);
  const clear = (x, y, wet) => {
    const bi = border.bi(x, y);
    if (bi < 0 || border.terrain[bi] === T.RIVER || border.terrain[bi] === T.ROAD) return;
    if (wet) { border.terrain[bi] = T.CREEK; border.shrub[bi] = border.ground[bi] = 0; }
    border.tree[bi] = 0; border.treeG[bi] = 0;
  };
  for (let y = -B; y < 0; y++) {
    const [lo, hi] = span(y);
    for (let x = lo - 1; x <= hi + 1; x++) clear(x, y, x >= lo && x <= hi);
  }
  const lower = (x, vy, h) => { if (w.vert(x, vy) > h + 1e-6) { w.setVert(x, vy, h); moved = true; } };
  const c0 = course(0);
  let prev = Math.min(w.vert(c0, 0), w.vert(c0 + 1, 0)); // (the creek's bed as it comes under the fence)
  for (let vy = -1; vy >= -B; vy--) {
    const { lo, hi, bank } = northCreekBank(w, course, vy);
    const bed = Math.max(bank - GORGE, prev + BED_FALL);
    if (bed > bank - 0.15) uphill++;
    for (let x = lo; x <= hi; x++) if (!keep?.(x, vy)) lower(x, vy, bed);
    for (const x of [lo - 1, hi + 1]) if (!keep?.(x, vy)) lower(x, vy, bed + (bank - bed) * WALL);
    prev = bed;
  }
  if (moved) { w.heightDirty = true; w.hv = (w.hv || 0) + 1; }
  return uphill;
}
