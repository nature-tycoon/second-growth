// Creeks drawn as a smooth ribbon (decision 0055): node tools/creek-ribbon-check.mjs [maps] [--report]
// The drawn outline is worked out as the drawing does it: the water sheet a tile (terrain.js buildWater,
// as in water-shape-check), the ground hiding it where it rises over it, and the ribbon's edge
// (creekRibbon) ending it, on the mesh's own triangles. On every map with creeks:
// - as generated, its creeks' outline is no more jagged than without the ribbon (and under the shore
//   ceiling water-shape-check holds the whole map to);
// - a tight S dug with brush 1 through ToolActions (where the creek tool has room): the share of its
//   outline turning over 60° within a tile is under S_CEILING (before the ribbon: pnw 12.9%, amazon
//   10.2%, serengeti 13.1%, batch phone-creeks-fish s2), no deep dug bed is left out of the ribbon (a
//   dry pit beside the water), its head still narrows into its end but keeps its water, and the field takes under
//   FIELD_MS to work out (it runs on every water rebuild).
import assert from 'node:assert/strict';

const { Game } = await import('../js/game.js');
const { BIOME_LIST } = await import('../js/biome.js');
const { ToolActions } = await import('../js/tool-actions.js');
const { T, isWater } = await import('../js/config.js');
const { tileWaterLevel } = await import('../js/sim/waterline.js');
const { creekRibbon, RIBBON_DEEP_HEAD } = await import('../js/render3d/creek-ribbon.js');

const args = process.argv.slice(2), report = args.includes('--report');
const maps = args.find(a => !a.startsWith('--'))?.split(',') ?? BIOME_LIST.map(b => b.id);
let checks = 0, failed = 0;
const check = (name, fn) => { try { fn(); checks++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } };

const S_CEILING = 0.04;      // (the maps' own shores run 1-8%: water-shape-check SHORE_CEILING)
const PIT_MAX = 0.01;        // (share of a dug S's bed, 0.12 or more under the water, left outside the ribbon)
const HEAD_MAX = 0.85;       // (as water-shape-check: a square stub reads about 0.75 or more)
const HEAD_WET_MIN = 0.25;   // (not cut back to a dry stub; a shallow head draws about a third of its tile, its deep bed held by the pit case)
const FIELD_MS = 40;         // (creekRibbon on a whole map; measured 2026-11-24 well under this)
const SHORE_CEILING = { pnw: 0.02, amazon: 0.04, serengeti: 0.04, atlanta: 0.06, chinandega: 0.09, sumatra: 0.04, reef: 0 };

// The drawn water's depth at each corner (water-shape-check drawnWater): each water tile's level, carried
// one ring onto the banks, each corner taking the highest level touching it, clamped to the ground at
// the ring's outer edge. depth(vx, vy) = level - ground (over 0 is wet); level[k] NaN off the sheet.
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
  return { level, depth: (vx, vy) => lv(vx, vy) - w.vert(vx, vy) };
}

// The drawn outline's segments in a box: on each of a tile's two triangles (A C B, A D C, as the mesh),
// subdivided SUB times a side, where the water shader's edge crosses zero: min(depth, ribbon edge) (ribbon null: the ground's alone).
const SUB = 4;
function outline(w, dw, rib, box) {
  const W = w.w, segs = [], VW = W + 1;
  const parts = (vx, vy) => { const d = dw.depth(vx, vy); return [d, rib ? rib.edge(vy * VW + vx, d) : Infinity]; };
  for (let y = Math.max(0, box[1]); y < Math.min(w.h, box[3]); y++) for (let x = Math.max(0, box[0]); x < Math.min(W, box[2]); x++) {
    if (dw.level[y * W + x] !== dw.level[y * W + x]) continue;
    const A = [x, y], B = [x + 1, y], C = [x + 1, y + 1], D = [x, y + 1];
    for (const tri of [[A, C, B], [A, D, C]]) {
      const pv = tri.map(p => parts(p[0], p[1]));
      if (pv.some(v => !Number.isFinite(v[0]))) continue;
      // a point by barycentric (i, j) of SUB: its position and value (min of the two interpolated fields)
      const at = (i, j) => {
        const a = (SUB - i - j) / SUB, b = i / SUB, c = j / SUB;
        const p = [tri[0][0] * a + tri[1][0] * b + tri[2][0] * c, tri[0][1] * a + tri[1][1] * b + tri[2][1] * c];
        const d = pv[0][0] * a + pv[1][0] * b + pv[2][0] * c, r = pv[0][1] === Infinity ? Infinity : pv[0][1] * a + pv[1][1] * b + pv[2][1] * c;
        return [p, Math.min(d, r)];
      };
      const small = [];
      for (let i = 0; i < SUB; i++) for (let j = 0; j < SUB - i; j++) {
        small.push([at(i, j), at(i + 1, j), at(i, j + 1)]);
        if (i + j < SUB - 1) small.push([at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
      }
      for (const s of small) {
        const pts = [];
        for (let e = 0; e < 3; e++) {
          const [p, a] = s[e], [q, b] = s[(e + 1) % 3];
          if ((a > 0) !== (b > 0)) {
            // (always from the lower-keyed end, so a point on a shared edge comes out the same both times)
            const [P, Q, va, vb] = p[0] < q[0] || (p[0] === q[0] && p[1] < q[1]) ? [p, q, a, b] : [q, p, b, a];
            const t = va / (va - vb); pts.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
          }
        }
        if (pts.length === 2) segs.push(pts);
      }
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
// [sharp, samples]: points every quarter tile along the outline turning over 60° between one-tile chords
function turns(segs) {
  let sharp = 0, n = 0;
  for (const line of chains(segs)) {
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
const share = ([s, n]) => n ? s / n : 0;
const pct = v => (v * 100).toFixed(1) + '%';
// Is the drawn water over point (px, py)? (the mesh's two triangles a tile, split (0,0) to (1,1))
function wetAt(w, dw, rib) {
  const VW = w.w + 1;
  return (px, py) => {
    const x = Math.floor(px), y = Math.floor(py);
    if (!w.inb(x, y) || dw.level[y * w.w + x] !== dw.level[y * w.w + x]) return false;
    const u = px - x, v = py - y;
    const lerp = f => { const a = f(x, y), b = f(x + 1, y), c = f(x + 1, y + 1), d = f(x, y + 1); return u >= v ? a + (b - a) * u + (c - b) * v : a + (c - d) * u + (d - a) * v; };
    const d = lerp(dw.depth);
    if (!(d > 0)) return false;
    return !rib || lerp((vx, vy) => rib.edge(vy * VW + vx, dw.depth(vx, vy))) > 0;
  };
}

for (const map of maps) {
  const g = new Game();
  g.newGame(1987, 'free', 'standard', map);
  g.autosave = false;
  const w = g.world;
  if (!w.terrain.some(t => t === T.CREEK)) { console.log(`  ${map}: no creeks`); continue; }
  const t0 = performance.now(); let rib = creekRibbon(w); const ms = performance.now() - t0;
  let dw = drawnWater(w);
  const all = [0, 0, w.w, w.h];
  const before = turns(outline(w, dw, null, all)), after = turns(outline(w, dw, rib, all));
  if (report) console.log(`  ${map}: whole map's waterline sharp ${pct(share(before))} -> ${pct(share(after))} (${after[1]} samples); field ${ms.toFixed(1)} ms`);
  check(`${map}: as generated, the ribbon leaves the waterline no more jagged, under its ceiling`, () => {
    assert.ok(share(after) <= Math.max(share(before) + 0.002, 0), `${pct(share(before))} -> ${pct(share(after))}`);
    assert.ok(share(after) <= SHORE_CEILING[map], `${pct(share(after))} over ${pct(SHORE_CEILING[map])}`);
  });
  check(`${map}: the ribbon field takes under ${FIELD_MS} ms`, () => assert.ok(ms < FIELD_MS, `${ms.toFixed(1)} ms`));

  // a tight S dug with brush 1, out from a straight reach of creek into open land beside it
  if (!g.catalog.tools.creek || g.catalog.definition.hideTools?.includes('creek')) continue;
  g.money = 1e7;
  const actions = new ToolActions(g, { refreshEnvironment: false });
  const canEdit = i => !g.mapDefinition.canEdit || g.mapDefinition.canEdit(g, i);
  const open = (x, y) => w.inb(x, y) && !isWater(w.terrain[w.idx(x, y)]) && w.struct[w.idx(x, y)] < 0 && w.terrain[w.idx(x, y)] !== T.ROAD && canEdit(w.idx(x, y));
  const creekAt = (x, y) => w.inb(x, y) && w.terrain[w.idx(x, y)] === T.CREEK;
  let site = null;
  for (let i = 0; i < w.n && !site; i++) {
    if (w.terrain[i] !== T.CREEK) continue;
    const cx = i % w.w, cy = (i / w.w) | 0;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => creekAt(cx + a, cy + b)).length < 2) continue;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      let ok = true;
      for (let dy = 0; dy < 9 && ok; dy++) for (let dx = 1; dx <= 26 && ok; dx++) ok = open(cx + sx * dx, cy + sy * dy);
      if (ok) { site = { cx, cy, sx, sy }; break; }
    }
  }
  if (!site) { console.log(`  ${map}: no 26x9 patch of open land beside a creek; no S dug here`); continue; }
  const { cx, cy, sx, sy } = site;
  const s = actions.begin('creek');
  for (let d = 0; d <= 24; d += 0.5) actions.paint(s, Math.round(cx + sx * d), Math.round(cy + sy * 2.5 * (1 - Math.cos(d / 12 * 2 * Math.PI))), 0);
  actions.end(s);
  const dug = new Set(s.changed);
  check(`${map}: the S is dug (brush 1)`, () => assert.ok(dug.size >= 20, `dug only ${dug.size} tiles`));
  rib = creekRibbon(w); dw = drawnWater(w);
  const xs = [...dug].map(i => i % w.w), ys = [...dug].map(i => (i / w.w) | 0);
  const box = [Math.min(...xs) - 2, Math.min(...ys) - 2, Math.max(...xs) + 3, Math.max(...ys) + 3];
  // (only the S: not the creek it leaves from)
  const near = (px, py) => [...dug].some(i => Math.abs(i % w.w + 0.5 - px) < 2.5 && Math.abs(((i / w.w) | 0) + 0.5 - py) < 2.5) && Math.abs(px - (cx + 0.5)) > 2.5;
  const only = segs => segs.filter(sg => near((sg[0][0] + sg[1][0]) / 2, (sg[0][1] + sg[1][1]) / 2));
  const sBefore = turns(only(outline(w, dw, null, box))), sAfter = turns(only(outline(w, dw, rib, box)));
  if (report) console.log(`  ${map}: dug S's waterline sharp ${pct(share(sBefore))} -> ${pct(share(sAfter))} (${sAfter[1]} samples)`);
  check(`${map}: a tight S dug with brush 1 draws smooth (no tile steps)`, () => {
    assert.ok(sAfter[1] > 40, `only ${sAfter[1]} outline samples`);
    assert.ok(share(sAfter) <= S_CEILING, `${pct(share(sAfter))} of its outline turns over 60° within a tile (before the ribbon ${pct(share(sBefore))})`);
  });
  check(`${map}: the ribbon leaves none of the S's deep bed dry beside it`, () => {
    let deep = 0, out = 0;
    const wet = wetAt(w, dw, rib), N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    // (a head's last tiles narrow into its end by design, 0054: only their deepest bed, over
    // RIBBON_DEEP_HEAD, must stay wet there)
    const heads = [...dug].filter(i => N4.filter(([dx, dy]) => isWater(w.terrain[w.idx(i % w.w + dx, ((i / w.w) | 0) + dy)])).length === 1);
    const byHead = i => heads.some(h => Math.hypot(h % w.w - i % w.w, ((h / w.w) | 0) - ((i / w.w) | 0)) < 2.5);
    for (const i of dug) {
      const x = i % w.w, y = (i / w.w) | 0, deepest = byHead(i) ? RIBBON_DEEP_HEAD + 0.02 : 0.12;
      for (let a = 0.05; a < 1; a += 0.1) for (let b = 0.05; b < 1; b += 0.1) {
        const px = x + a, py = y + b, u = a, v = b;
        const f = (vx, vy) => dw.depth(vx, vy);
        const d = u >= v ? f(x, y) + (f(x + 1, y) - f(x, y)) * u + (f(x + 1, y + 1) - f(x + 1, y)) * v : f(x, y) + (f(x + 1, y + 1) - f(x, y + 1)) * u + (f(x, y + 1) - f(x, y)) * v;
        if (d < deepest) continue;
        deep++;
        if (!wet(px, py)) out++;
      }
    }
    if (report) console.log(`  ${map}: ${out} of ${deep} deep bed points outside the ribbon`);
    assert.ok(deep > 0 && out / deep <= PIT_MAX, `${out} of ${deep} deep bed points outside the ribbon`);
  });
  check(`${map}: the S's head still narrows into its end`, () => {
    const wet = wetAt(w, dw, rib), wet0 = wetAt(w, dw, null), N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const ends = [...dug].filter(i => { const x = i % w.w, y = (i / w.w) | 0; return N4.filter(([dx, dy]) => isWater(w.terrain[w.idx(x + dx, y + dy)])).length === 1; });
    assert.ok(ends.length >= 1, 'no head');
    for (const i of ends) {
      const x = i % w.w, y = (i / w.w) | 0, n = N4.find(([dx, dy]) => isWater(w.terrain[w.idx(x + dx, y + dy)]));
      const ax = -n[0], ay = -n[1], ex = x + 0.5 + ax * 0.5, ey = y + 0.5 + ay * 0.5;
      const width = (f, sd) => { let k = 0; for (let j = -30; j <= 30; j++) if (f(ex + ax * sd - ay * j / 20, ey + ay * sd + ax * j / 20)) k++; return k / 20; };
      const r = width(wet, -0.5) / width(wet, -3), r0 = width(wet0, -0.5) / width(wet0, -3);
      if (report) console.log(`  ${map}: head ${x},${y} width ratio ${r0.toFixed(2)} -> ${r.toFixed(2)}`);
      // (a head dug across a steep slope can spread wider than its creek on the bed's low side, ribbon or not)
      assert.ok(r <= Math.max(HEAD_MAX, r0), `head ${x},${y}: ${r.toFixed(2)} of the width three tiles back (${r0.toFixed(2)} without the ribbon)`);
      // (and the end tile keeps its water: at least HEAD_WET_MIN of it drawn wet, not cut back to a dry stub)
      let k = 0; for (let a = 0.05; a < 1; a += 0.1) for (let b = 0.05; b < 1; b += 0.1) if (wet(x + a, y + b)) k++;
      if (report) console.log(`  ${map}: head ${x},${y} drawn wet ${k}% of its tile`);
      assert.ok(k / 100 >= HEAD_WET_MIN, `head ${x},${y}: only ${k}% of its tile drawn wet`);
    }
  });
}

console.log(`\n${checks} passed, ${failed} failed`);
if (failed) process.exit(1);
