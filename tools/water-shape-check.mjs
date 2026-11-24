// Creeks bend in curves and shores follow smooth lines (decision 0054): node tools/water-shape-check.mjs [maps]
// - Every map as generated: no creek turns sharper than COURSE_TURN (sharpBends; a junction is not a
//   bend), and the drawn waterline (ground meets water on the mesh's own triangles, as the drawing
//   does) turns sharply at no more than its ceiling of points. Before 0054 the PNW ditch turned 90°
//   twice and 4-12% of every map's waterline turned over 60° within a tile, on the tiles' stair-steps.
// - The player's edits, through ToolActions as the game does them: a creek stroke with a right-angle
//   corner and a zigzag, filling a tile of it, a pond dug as a staircase of brush dabs, Lower ground
//   beside a creek. After them no creek turns sharper than the limit, the shore round the new pond is
//   as smooth as the ceiling, no land corner beside the water sits under it, and shaping the shores
//   never moved a water tile's level.
import assert from 'node:assert/strict';
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { BIOME_LIST } = await import('../js/biome.js');
const { ToolActions } = await import('../js/tool-actions.js');
const { T, F, isWater } = await import('../js/config.js');
const { tileWaterLevel } = await import('../js/sim/waterline.js');
const { sharpBends, COURSE_TURN, outsideCreek, pendingCourse } = await import('../js/maps/water-shape.js');
const { BORDER } = await import('../js/config.js');
const { waitAtFence } = await import('../js/sim/fence-gate.js');
const { shapeShoreNear } = await import('../js/terrain-edit.js');
const { mulberry32 } = await import('../js/rng.js');

let checks = 0, failed = 0;
const check = (name, fn) => { try { fn(); checks++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } };
const maps = process.argv[2] ? process.argv[2].split(',') : BIOME_LIST.map(b => b.id);
let dugOn = 0;

// Share of the waterline (sampled every quarter tile) turning more than 60° between the one-tile
// chords either side, a ceiling a little over what 0054 measured (2026-11-22: pnw 1.2%, amazon 3.5%,
// serengeti 3.6%, atlanta 5.1%, chinandega 8.0%, sumatra 3.4%). Before it: pnw 7%, amazon 12%,
// serengeti 13%, atlanta 8%, chinandega 9%, sumatra 4%. What's left is mostly where it should be
// sharp or is held: creek mouths and heads, bridges and culverts, and creek banks, which aren't raised
// (a beaver pond spreads over the floodplain). Chinandega's crater lake and lagoon don't drain (0044).
const SHORE_CEILING = { pnw: 0.02, amazon: 0.04, serengeti: 0.04, atlanta: 0.06, chinandega: 0.09, sumatra: 0.04, reef: 0 };
const DUG_POND_CEILING = 0.1; // (a small pond: its few bends weigh more)

// The drawn waterline as segments, worked out as the drawing does (terrain.js buildWater): each water
// tile's level (the Hollis model's where it runs), carried one ring onto the banks, each corner taking
// the highest level touching it, and the ground hiding the water where it rises above it.
function drawnWater(w) {
  const W = w.w, H = w.h, level = new Float64Array(W * H).fill(NaN), wet = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const l = tileWaterLevel(w, i); if (l != null) { level[i] = l; wet[i] = 1; } }
  const ring = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (wet[k]) continue;
    let L = -Infinity;
    for (const diag of [0, 1]) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((dx && dy ? 1 : 0) !== diag || !(dx || dy)) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (wet[j] && level[j] > L) L = level[j];
      }
      if (L > -Infinity) break;
    }
    if (L > -Infinity && Math.min(...w.corners(x, y)) < L) ring.push([k, L]);
  }
  for (const [k, L] of ring) level[k] = L;
  const R4 = [[-1, -1], [0, -1], [-1, 0], [0, 0]];
  const vWet = (vx, vy) => R4.some(([dx, dy]) => { const x = vx + dx, y = vy + dy; return x >= 0 && y >= 0 && x < W && y < H && wet[y * W + x]; });
  const lv = (vx, vy) => {
    let L = -Infinity;
    for (const [dx, dy] of R4) { const x = vx + dx, y = vy + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; const l = level[y * W + x]; if (l === l && l > L) L = l; }
    return L > -Infinity && !vWet(vx, vy) ? Math.min(L, w.vert(vx, vy)) : L;
  };
  // (ground over the drawn water at a corner: under 0 is wet)
  return { level, f: (vx, vy) => w.vert(vx, vy) - lv(vx, vy) };
}
function waterline(w, box = [0, 0, w.w, w.h]) {
  const W = w.w, H = w.h, { level, f } = drawnWater(w), segs = [];
  for (let y = Math.max(0, box[1]); y < Math.min(H, box[3]); y++) for (let x = Math.max(0, box[0]); x < Math.min(W, box[2]); x++) {
    if (level[y * W + x] !== level[y * W + x]) continue;
    const A = [x, y], B = [x + 1, y], C = [x + 1, y + 1], D = [x, y + 1];
    for (const tri of [[A, C, B], [A, D, C]]) {
      const fv = tri.map(p => f(p[0], p[1]));
      if (fv.some(v => !Number.isFinite(v))) continue;
      const pts = [];
      for (let e = 0; e < 3; e++) {
        const a = fv[e], b = fv[(e + 1) % 3];
        if ((a < 0) !== (b < 0)) { const t = a / (a - b), p = tri[e], q = tri[(e + 1) % 3]; pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
      }
      if (pts.length === 2) segs.push(pts);
    }
  }
  return segs;
}
function chains(segs) {
  const key = p => p[0].toFixed(4) + ',' + p[1].toFixed(4), adj = new Map();
  segs.forEach((s, k) => { for (const p of s) { const kk = key(p); if (!adj.has(kk)) adj.set(kk, []); adj.get(kk).push(k); } });
  const used = new Uint8Array(segs.length), out = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const line = [segs[s0][0], segs[s0][1]];
    for (const fwd of [true, false]) for (;;) {
      const end = fwd ? line.at(-1) : line[0], nxt = (adj.get(key(end)) || []).find(k => !used[k]);
      if (nxt == null) break;
      used[nxt] = 1;
      const s = segs[nxt], p = key(s[0]) === key(end) ? s[1] : s[0];
      fwd ? line.push(p) : line.unshift(p);
    }
    out.push(line);
  }
  return out;
}
// [sharp, samples]: points every `step` along each line turning over 60° between chords of `s`
function shoreTurns(w, box) {
  let sharp = 0, n = 0;
  for (const line of chains(waterline(w, box))) {
    const cum = [0];
    for (let k = 1; k < line.length; k++) cum.push(cum[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
    const L = cum.at(-1), closed = Math.hypot(line[0][0] - line.at(-1)[0], line[0][1] - line.at(-1)[1]) < 1e-6;
    const at = d => {
      if (closed) d = ((d % L) + L) % L; else if (d < 0 || d > L) return null;
      let k = 1; while (k < cum.length - 1 && cum[k] < d) k++;
      const t = (d - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1);
      return [line[k - 1][0] + (line[k][0] - line[k - 1][0]) * t, line[k - 1][1] + (line[k][1] - line[k - 1][1]) * t];
    };
    for (let d = 0; d <= L; d += 0.25) {
      const p = at(d), a = at(d - 1), b = at(d + 1);
      if (!a || !b) continue;
      const ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1], nu = Math.hypot(ux, uy), nv = Math.hypot(vx, vy);
      if (nu < 0.5 || nv < 0.5) continue;
      n++;
      if (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / nu / nv))) > Math.PI / 3) sharp++;
    }
  }
  return [sharp, n];
}
// Is the drawn water over point (px, py)? (the mesh's two triangles a tile, split (0,0) to (1,1))
function wetAt(w, dw = drawnWater(w)) {
  const { level, f } = dw;
  return (px, py) => {
    const x = Math.floor(px), y = Math.floor(py);
    if (!w.inb(x, y) || !(level[y * w.w + x] === level[y * w.w + x])) return false;
    const u = px - x, v = py - y, a = f(x, y), b = f(x + 1, y), c = f(x + 1, y + 1), d = f(x, y + 1);
    if (![a, b, c, d].every(Number.isFinite)) return false;
    return (u >= v ? a + (b - a) * u + (c - b) * v : a + (c - d) * u + (d - a) * v) < 0;
  };
}
// Creek heads (a creek tile with water on one side only, two tiles or more inside the map: 0054) and
// how much the drawn water narrows into each: its width across the creek at the end tile's middle
// over its width three tiles back. A square stub reads about 0.75 (the bank ring's water runs full
// width to a cut mid-tile); tapered, about 0.5. Only ends whose water stops within the tile beyond.
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function headNarrowing(w, only = null) {
  const wet = wetAt(w), out = [];
  for (let i = 0; i < w.n; i++) {
    const x = i % w.w, y = (i / w.w) | 0;
    if (w.terrain[i] !== T.CREEK || x < 2 || y < 2 || x >= w.w - 2 || y >= w.h - 2 || (only && !only(i))) continue;
    const n = N4.filter(([dx, dy]) => isWater(w.terrain[w.idx(x + dx, y + dy)]));
    if (n.length !== 1) continue;
    const ax = -n[0][0], ay = -n[0][1], cx = x + 0.5 + ax * 0.5, cy = y + 0.5 + ay * 0.5;
    const width = s => { let k = 0; for (let j = -30; j <= 30; j++) if (wet(cx + ax * s - ay * j / 20, cy + ay * s + ax * j / 20)) k++; return k / 20; };
    const back = width(-3);
    if (back > 0.5 && width(0.25) === 0) out.push({ x, y, r: width(-0.5) / back });
  }
  return out;
}
const HEAD_MEDIAN = 0.55, HEAD_MAX = 0.85; // (2026-11-23, the 7 heads here: median 0.60 -> 0.50, worst 1.13 -> 0.77)
const heads = [];
const fmtBends = b => b.slice(0, 6).map(t => `${t.x},${t.y} ${t.turn.toFixed(0)}°`).join('; ');

for (const map of maps) {
  const g = new Game();
  g.newGame(1987, 'free', 'standard', map);
  g.autosave = false;
  const w = g.world;
  check(`${map}: no creek as generated turns sharper than ${COURSE_TURN}° over three tiles`, () => {
    const b = sharpBends(w);
    assert.equal(b.length, 0, fmtBends(b));
  });
  check(`${map}: the waterline as generated follows smooth lines`, () => {
    const [sharp, n] = shoreTurns(w);
    console.log(`  ${map}: waterline turning over 60° within a tile ${sharp} of ${n} (${(100 * sharp / Math.max(1, n)).toFixed(1)}%)`);
    assert.ok(sharp <= SHORE_CEILING[map] * n, `${sharp} of ${n}, ceiling ${SHORE_CEILING[map]}`);
  });
  heads.push(...headNarrowing(w).map(h => ({ ...h, map })));
  // The starting creek runs on beyond the north fence (drawing only, outsideCreek, 2026-11-22): at
  // its full width by the fence, out to the border's far edge, its bed falling toward the farm, and
  // carving it again (every load) moves nothing. Maps without one (the reef) have no northCreek.
  const course = g.catalog.definition.northCreek;
  if (course) check(`${map}: the starting creek runs on beyond the north fence, downhill to it`, () => {
    const B = g.border, wetB = (x, y) => B.terrain[B.bi(x, y)] === T.CREEK;
    for (let x = 0; x < w.w; x++) if (w.terrain[w.idx(x, 0)] === T.CREEK && Math.abs(x - course(0)) <= 2) assert.ok(wetB(x, -1), `row 0's creek at x ${x} stops at the fence`);
    for (let y = -BORDER; y < 0; y++) assert.ok(wetB(course(y), y), `no creek beyond the fence on row ${y}`);
    for (let vy = -1; vy >= -BORDER; vy--) assert.ok(w.vert(course(vy), vy) > w.vert(course(vy + 1), vy + 1), `the bed doesn't fall toward the farm at row ${vy}`);
    const vh = w.vh.slice();
    assert.equal(outsideCreek(w, B, course, BORDER, g.catalog.definition.northCreekKeep), 0, 'the land falls northward faster than the bed');
    assert.ok(vh.every((v, i) => v === w.vh[i]), 'carving it again moved the land');
  });
  // (deer waiting at the fence by it stand on a bank, not its bed: offCreek in fence-gate.js)
  const deer = g.catalog.animals.find(d => d.move === 'ground' && d.fenced);
  if (course && deer) check(`${map}: animals waiting at the fence beside the creek stand on its banks`, () => {
    const B = g.border;
    for (const at of [course(-1) - 1, course(-1), course(-2)]) {
      for (const a of waitAtFence(g.wildlife, deer, 4, 'N', at)) {
        assert.notEqual(B.terrain[B.bi(Math.floor(a.x), Math.floor(a.y))], T.CREEK, `${deer.key} waiting at ${a.x.toFixed(2)}, ${a.y.toFixed(2)} stands in the creek`);
        g.wildlife.agents.splice(g.wildlife.agents.indexOf(a), 1);
      }
    }
  });
  // PNW's ditch comes in through its north fence (fencedCreek: no fence on the water): until the
  // opening tears the fence out, an arrival at the creek is held there like anywhere along it (0053; a
  // plain gap let elk walk in on 12 of 40 seeded arrivals, regression review 2026-11-23)
  if (map === 'pnw') check('pnw: the north fence holds arrivals at the creek too', () => {
    const elk = g.catalog.animal.elk, before = g.wildlife.agents.length;
    for (let x = 0; x < w.w; x++) if (w.terrain[w.idx(x, 0)] === T.CREEK) {
      assert.equal(g.wildlife.immigrate(elk, 1, false, { edge: 'N', at: x }), 0, `an elk walked in at ${x}, 0`);
    }
    for (const a of g.wildlife.agents.slice(before)) g.wildlife.agents.splice(g.wildlife.agents.indexOf(a), 1);
  });
  if (!g.catalog.tools.creek || g.catalog.definition.hideTools?.includes('creek')) continue;

  // somewhere to dig: a 12x15 patch of open land that can be edited, beside a creek
  g.money = 1e7;
  const actions = new ToolActions(g, { refreshEnvironment: false });
  const canEdit = i => !g.mapDefinition.canEdit || g.mapDefinition.canEdit(g, i);
  const open = (x, y) => w.inb(x, y) && !isWater(w.terrain[w.idx(x, y)]) && w.struct[w.idx(x, y)] < 0 && w.terrain[w.idx(x, y)] !== T.ROAD && canEdit(w.idx(x, y));
  let site = null;
  for (let i = 0; i < w.n && !site; i++) {
    if (w.terrain[i] !== T.CREEK) continue;
    const cx = i % w.w, cy = (i / w.w) | 0;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      let ok = true;
      for (let dy = 0; dy < 15 && ok; dy++) for (let dx = 1; dx <= 12 && ok; dx++) ok = open(cx + sx * dx, cy + sy * dy);
      if (ok) { site = { cx, cy, sx, sy }; break; }
    }
  }
  // (the suburb has none: streets every few rows and houses down to the creek; its edits are those
  // of every other map)
  if (!site) { console.log(`  ${map}: no 12x15 patch of open land beside a creek; edits not scripted here`); continue; }
  dugOn++;
  const { cx, cy: y0, sx, sy } = site, X = dx => cx + sx * dx, Y = dy => y0 + sy * dy;
  const stroke = (key, pts, r = 0) => { const s = actions.begin(key); for (const [x, y] of pts) actions.paint(s, x, y, r); actions.end(s); return s; };
  const line = (x0, y0, x1, y1) => { const out = []; const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let k = 0; k <= n; k++) out.push([Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n)]); return out; };
  const levels = () => { const m = new Map(); for (let i = 0; i < w.n; i++) { const l = tileWaterLevel(w, i); if (l != null) m.set(i, l); } return m; };

  // a creek dug out from the creek, turning a right angle, then a zigzag
  const corner = [...line(X(0), Y(0), X(6), Y(0)), ...line(X(6), Y(1), X(6), Y(7))];
  check(`${map}: a creek stroke with a right-angle corner digs a curve`, () => {
    const s = stroke('creek', corner);
    assert.ok(s.count >= 10, `dug only ${s.count} tiles`);
    const b = sharpBends(w);
    assert.equal(b.length, 0, fmtBends(b));
  });
  check(`${map}: a zigzag creek stroke digs no sharp bend`, () => {
    const zig = [];
    for (let k = 0; k < 3; k++) zig.push(...line(X(8 + (k % 2) * 3), Y(k * 3), X(8 + ((k + 1) % 2) * 3), Y(k * 3 + 3)));
    stroke('creek', zig);
    const b = sharpBends(w);
    assert.equal(b.length, 0, fmtBends(b));
  });
  heads.push(...headNarrowing(w, i => Number.isFinite(w.dugBed[i])).map(h => ({ ...h, map, dug: true })));
  check(`${map}: filling a tile of a dug creek leaves no sharp bend`, () => {
    const dug = []; for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.CREEK && Number.isFinite(w.dugBed[i])) dug.push(i);
    const mid = dug[dug.length >> 1];
    stroke('fill', [[mid % w.w, (mid / w.w) | 0]]);
    const b = sharpBends(w);
    assert.equal(b.length, 0, fmtBends(b));
  });
  // a pond dug as a staircase of brush dabs, away from the creek
  check(`${map}: a pond dug in steps gets a smooth shore`, () => {
    stroke('pond', [[X(2), Y(10)], [X(3), Y(11)], [X(4), Y(12)]], 1);
    const box = [Math.min(X(0), X(7)), Math.min(Y(8), Y(14)), Math.max(X(0), X(7)) + 1, Math.max(Y(8), Y(14)) + 1]; // (the pond alone: a creek's end is a hairpin of shore)
    const [sharp, n] = shoreTurns(w, box);
    console.log(`  ${map}: dug pond's waterline turning over 60° within a tile ${sharp} of ${n}`);
    assert.ok(n > 20, 'no shore round the pond');
    assert.ok(sharp <= DUG_POND_CEILING * n, `${sharp} of ${n} points turn over 60°`);
  });
  check(`${map}: Lower ground beside the creek leaves no land under its water`, () => {
    stroke('lower', [[X(1), Y(1)], [X(2), Y(1)]]);
    let under = 0;
    for (let vy = Math.min(Y(-2), Y(4)); vy <= Math.max(Y(-2), Y(4)); vy++) for (let vx = Math.min(X(-1), X(4)); vx <= Math.max(X(-1), X(4)); vx++) {
      const round = [[0, 0], [-1, 0], [0, -1], [-1, -1]].map(([ox, oy]) => [vx + ox, vy + oy]).filter(([x, y]) => w.inb(x, y));
      if (round.length < 4 || round.some(([x, y]) => isWater(w.terrain[w.idx(x, y)]) || w.struct[w.idx(x, y)] >= 0)) continue;
      let L = -Infinity;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) for (const [x, y] of [[0, 0], [-1, 0], [0, -1], [-1, -1]].map(([ox, oy]) => [vx + dx + ox, vy + dy + oy])) {
        if (!w.inb(x, y)) continue;
        const l = tileWaterLevel(w, w.idx(x, y));
        if (l != null) L = Math.max(L, l);
      }
      if (L > -Infinity && w.vert(vx, vy) < L) under++;
    }
    assert.equal(under, 0, `${under} land corners beside the creek under its water`);
  });
  check(`${map}: shaping the shores never moves a water tile's level`, () => {
    const before = levels(), all = [];
    for (let i = 0; i < w.n; i++) all.push(i);
    shapeShoreNear(w, all);
    const after = levels();
    let moved = 0;
    for (const [i, l] of before) if (Math.abs((after.get(i) ?? NaN) - l) > 1e-6) moved++;
    assert.equal(moved, 0, `${moved} water tiles changed level`);
  });
  // the stroke shows under the brush at once (2026-11-23, batch phone-creeks-fish s2): the head runs
  // a few tiles behind, so after every sample the brush's tile is dug or on the path shown ahead of it
  check(`${map}: a creek stroke shows under the brush after every sample`, () => {
    const s = actions.begin('creek'), path = [...line(X(1), Y(13), X(9), Y(13)), ...line(X(8), Y(13), X(5), Y(13))]; // (out, then doubling back)
    for (const [x, y] of path) {
      actions.paint(s, x, y);
      const shown = new Set([...s.changed, ...pendingCourse(s.course).map(([a, b]) => w.idx(a, b))]);
      assert.ok(shown.has(w.idx(x, y)), `brush at ${x},${y} shows nothing under it`);
    }
    actions.end(s);
  });
}
// Creek heads narrow into their end, generated (Chinandega's, Sumatra's canal ends) and dug, rather
// than stopping square mid-tile (HEAD_WET, byHead in shoreHeights, 2026-11-23)
if (heads.length) check(`creek heads narrow into their end (${heads.length} heads)`, () => {
  const r = heads.map(h => h.r).sort((a, b) => a - b), med = r[r.length >> 1], worst = heads.reduce((a, b) => b.r > a.r ? b : a);
  console.log(`  end tile's width over the creek's three tiles back: median ${med.toFixed(2)}, worst ${worst.r.toFixed(2)} (${worst.map} ${worst.x},${worst.y})`);
  assert.ok(med <= HEAD_MEDIAN, `median ${med.toFixed(2)} over ${HEAD_MEDIAN}`);
  assert.ok(worst.r <= HEAD_MAX, `${worst.map} ${worst.x},${worst.y}: ${worst.r.toFixed(2)} over ${HEAD_MAX}`);
});

// Beaver ponds (the Hollis model, PNW) are drawn as one flat sheet over the sloping land, so their shore
// follows the ground's contour, not the tiles: smooth as they grow, with no shore pass of their own
// (one measured worse: 13 sharp samples in 1,070 before it, 27 after, batch creeks-fps-2 s3). And a
// pond that drains leaves its creek as it was: no ground moved, no sharp bend, the same shore.
if (maps.includes('pnw')) check('pnw: beaver ponds have smooth shores, and a drained one leaves its creek as it was', () => {
  let sharp = 0, n = 0;
  const random = Math.random;
  try { for (const xy of [[60, 45], [54, 51], [54, 72], [69, 43]]) {
    Math.random = mulberry32(1987);
    const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw'); g.autosave = false;
    const w = g.world, site = w.idx(...xy), box = [xy[0] - 10, xy[1] - 10, xy[0] + 11, xy[1] + 11];
    const before = shoreTurns(w, box), vh = w.vh.slice();
    g.wildlife.buildDam(site, 1);
    g.weather = 'rain'; for (let k = 0; k < 40; k++) g.water.step(g); g.weather = 'clear';
    const b = g.water.basins.find(b => b.kind === 'dam' && b.site === site);
    assert.ok(b && b.cells.length >= 8, `no pond at ${xy}`);
    const [s1, n1] = shoreTurns(w, box); sharp += s1; n += n1;
    g.wildlife.breakDam(site);
    for (let d = 0; d < 400 && g.water.basins.some(b => b.site === site); d++) g.water.step(g);
    assert.ok(!g.water.basins.some(b => b.site === site), `the pool at ${xy} never drained`);
    for (let k = 0; k < 3; k++) g.water.step(g);
    assert.ok(w.vh.every((v, k) => v === vh[k]), `the ground moved at ${xy}`);
    assert.deepEqual(shoreTurns(w, box), before, `the creek's shore at ${xy} isn't as it was`);
    assert.equal(sharpBends(w).length, 0, `a sharp bend after the pond at ${xy}`);
  } } finally { Math.random = random; }
  console.log(`  beaver ponds' waterline turning over 60° within a tile ${sharp} of ${n}`);
  assert.ok(sharp <= SHORE_CEILING.pnw * n, `${sharp} of ${n}, ceiling ${SHORE_CEILING.pnw}`);
});

if (!process.argv[2]) check('the edits were scripted on at least four maps', () => assert.ok(dugOn >= 4, `only ${dugOn}`));
console.log(failed ? `${failed} of ${checks + failed} water shape checks failed.` : `All ${checks} water shape checks passed.`);
if (failed) process.exit(1);
