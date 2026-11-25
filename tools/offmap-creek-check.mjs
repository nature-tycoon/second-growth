// The creek beyond the north fence matches the farm's (decision 0054, batch phone-creeks-fish s9):
// node tools/offmap-creek-check.mjs [maps] [--report]
// Cole: the off-map creek drew about twice the farm creek's width, its banks in tile steps, its water
// standing above or sunk under its banks. On every map with one (northCreek), the water mesh is built
// headless (Terrain.buildWater) and sampled every eighth of a tile as the water shader draws it (the
// sheet over the ground, its edge where min(shore, ribbon) ends it):
// - its width (area over course length) beyond the fence is the farm creek's near the fence within WIDTH_TOL,
//   and just past the fence within FENCE_TOL (no neck or flare at the join);
// - its outline has no tile steps: under STEP_MAX of its points turn over 60° between one-tile chords;
// - its water sits on its banks: at its drawn edge the sheet is never more than FLOAT_MAX over the
//   ground, and inside its ribbon the ground stands over the water at under DRY_MAX of the samples;
// - no step in the sheet where it crosses the fence; deer waiting at the fence by it stand clear of it;
// - carving it again (every load) moves nothing.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Terrain } = await import('../js/render3d/terrain.js');
const { Game } = await import('../js/game.js');
const { BIOME_LIST } = await import('../js/biome.js');
const { T, BORDER, LEVEL } = await import('../js/config.js');
const { mulberry32 } = await import('../js/rng.js');
const { northCreekAt, outsideCreek } = await import('../js/maps/water-shape.js');
const { waitAtFence } = await import('../js/sim/fence-gate.js');
const { creekRibbon } = await import('../js/render3d/creek-ribbon.js');

globalThis.document = { createElement: () => ({
  getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} })
}) };
const atlas = { tex: null, uv: {}, slot: {} };
for (let season = 0; season < 4; season++) for (const t of Object.values(T)) { atlas.uv[t + '|' + season + '|0'] = [0, 0, 0.1, 0.1]; atlas.slot[t + '|' + season + '|0'] = 0; }

const WIDTH_TOL = 0.15;  // (Cole's ask: as wide as the farm creek it carries on; before s9 it ran +40% (pnw 1.41 vs 2.31) to +83%)
const FENCE_TOL = 0.25;  // (its first two rows past the fence, against the farm creek's width: the two ribbons meet there.
// Not against the farm's own last rows: PNW's row 0 has its west corner cut to draw two tiles wide, 0054, 1.67)
const STEP_MAX = 0.03;   // (the farm's whole-map shores run 1-8%, creek-ribbon-check; tile steps read 15-25%)
const FLOAT_MAX = 0.35;  // (height levels, 10 cm: the farm creek's own drawn edge runs 0.21-0.32 over its bank, its ribbon's RIBBON_DEEP guard)
const DRY_MAX = 0.015;   // (PNW bends round its film stage's uncut corners, pnwNorthKeep: a slight bank bulge there, 0.6%)
const JOIN_TURN = 45;    // (degrees between one-tile chords of its middle line through the fence, before -> after 2026-11-25:
// pnw 51 -> 37, chinandega 58 -> 44 (its farm creek zigzags to the fence), serengeti 33 -> 34, sumatra 34 -> 23, atlanta 28 -> 27,
// amazon 13 -> 9. PNW's is held by its farm creek's own tiles running due south to the fence and the film's stage, 0054)
const JOIN_MAX = 0.12;   // (height levels between the sheet either side of the fence)

const args = process.argv.slice(2), report = args.includes('--report');
const maps = args.find(a => !a.startsWith('--'))?.split(',') ?? BIOME_LIST.map(b => b.id);
let checks = 0, failed = 0;
const check = (name, fn) => { try { fn(); checks++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } };
const pct = v => (v * 100).toFixed(1) + '%';

// The drawn water at a point: the sheet's triangles, each corner's depth over the ground, the shader's
// edge (terrain-materials.js: shoreD = min(max(min(depth, round), depth - 0.07), ribbon)).
function sampler(mesh) {
  const g = mesh.geometry, P = g.attributes.position.array, D = g.attributes.aDepth.array, R = g.attributes.aRound.array, RB = g.attributes.aRibbon.array;
  const byTile = new Map();
  for (let t = 0; t < P.length / 9; t++) {
    const key = Math.min(P[t * 9], P[t * 9 + 3], P[t * 9 + 6]) + ',' + Math.min(P[t * 9 + 2], P[t * 9 + 5], P[t * 9 + 8]);
    if (!byTile.has(key)) byTile.set(key, []);
    byTile.get(key).push(t);
  }
  return (px, pz) => {
    for (const t of byTile.get(Math.floor(px) + ',' + Math.floor(pz)) || []) {
      const a = [P[t * 9], P[t * 9 + 2]], b = [P[t * 9 + 3], P[t * 9 + 5]], c = [P[t * 9 + 6], P[t * 9 + 8]];
      const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (pz - c[1])) / den, l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (pz - c[1])) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const f = (A, n = 1, o = 0) => A[t * 3 * n + o] * l1 + A[(t * 3 + 1) * n + o] * l2 + A[(t * 3 + 2) * n + o] * l3;
      const depth = f(D), shore = Math.min(Math.max(Math.min(depth, f(R)), depth - 0.07), f(RB));
      return { depth, level: f(P, 3, 1) / LEVEL, wet: depth > 0 && (shore >= depth - 0.001 || shore > 0.015) };
    }
    return null;
  };
}

const STEP = 1 / 8;
for (const map of maps) {
  Math.random = mulberry32(1987);
  const game = new Game(); game.newGame(1987, 'free', 'standard', map);
  const course = game.catalog.definition.northCreek, north = game.border.north;
  if (!course) { console.log(`  ${map}: no creek beyond the fence`); continue; }
  check(`${map}: the creek runs on beyond the fence`, () => assert.ok(north, 'outsideCreek laid no line'));
  if (!north) continue;
  const terrain = new Terrain(new THREE.Scene(), atlas);
  terrain.setWorld(game.world, game.border); terrain.updateSurface(game);
  const at = sampler(terrain.water), w = game.world;
  // each eighth-of-a-tile row across the creek: its wet run nearest the line (left, right edges)
  const centre = y => { let best = Infinity, cx = 0; for (let x = -20; x < w.w + 20; x += 0.25) { const d = northCreekAt(north, x, y).d; if (d < best) { best = d; cx = x; } } return cx; };
  const rowAt = (y, cx) => {
    let lo = null, hi = null;
    if (!at(cx, y)?.wet) return null;
    for (lo = cx; at(lo - STEP, y)?.wet && lo > cx - 6; lo -= STEP);
    for (hi = cx; at(hi + STEP, y)?.wet && hi < cx + 6; hi += STEP);
    return [lo - STEP / 2, hi + STEP / 2];
  };
  const runs = (y0, y1) => { const out = []; for (let y = y0 + STEP / 2; y < y1; y += STEP) { const cx = y < 0 ? centre(y) : course(Math.floor(y)) + 0.5; out.push([y, rowAt(y, cx)]); } return out; };
  // width: wet area over the length of the run's middle line
  const width = rs => {
    const ok = rs.filter(r => r[1]);
    let area = 0, len = 0;
    for (let k = 0; k < ok.length; k++) { area += (ok[k][1][1] - ok[k][1][0]) * STEP; if (k) len += Math.hypot((ok[k][1][0] + ok[k][1][1]) / 2 - (ok[k - 1][1][0] + ok[k - 1][1][1]) / 2, ok[k][0] - ok[k - 1][0]); }
    return len ? area / len : 0;
  };
  const farm = width(runs(1, 9)), off = width(runs(-12, -2)), nearIn = width(runs(0.5, 2.5)), nearOut = width(runs(-2.5, -0.5));
  if (report) console.log(`  ${map}: width farm ${farm.toFixed(2)}, beyond the fence ${off.toFixed(2)}, either side of it ${nearIn.toFixed(2)} / ${nearOut.toFixed(2)}`);
  check(`${map}: beyond the fence it's as wide as the farm creek (within ${pct(WIDTH_TOL)})`, () => {
    assert.ok(Math.abs(off / farm - 1) <= WIDTH_TOL, `farm ${farm.toFixed(2)}, beyond ${off.toFixed(2)}`);
    assert.ok(Math.abs(nearOut / farm - 1) <= FENCE_TOL, `just beyond the fence ${nearOut.toFixed(2)}, the farm creek ${farm.toFixed(2)}`);
  });
  // tile steps: each edge's points every eighth of a row, turning over 60° between one-tile chords
  const rs = runs(-13, 0).filter(r => r[1]);
  let sharp = 0, n = 0;
  for (const side of [0, 1]) {
    const pts = rs.map(([y, r]) => [r[side], y]), cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const along = d => { let k = 1; while (k < cum.length - 1 && cum[k] < d) k++; const t = (d - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1); return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t]; };
    for (let d = 1; d <= cum.at(-1) - 1; d += 0.25) {
      const a = along(d - 1), p = along(d), b = along(d + 1), u = [p[0] - a[0], p[1] - a[1]], v = [b[0] - p[0], b[1] - p[1]];
      n++;
      if (Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v)))) > Math.PI / 3) sharp++;
    }
  }
  if (report) console.log(`  ${map}: outline turning over 60° within a tile ${sharp} of ${n} (${pct(sharp / Math.max(1, n))})`);
  check(`${map}: its outline has no tile steps (under ${pct(STEP_MAX)} sharp)`, () => assert.ok(n > 40 && sharp <= STEP_MAX * n, `${sharp} of ${n}`));
  // through the fence: the drawn creek's middle line (its last farm row to 5 rows out; further in, the farm
  // creeks' own drawn zigzags turn up to 66°) turns gradually, never sharper than JOIN_TURN between
  // one-tile chords (Cole: "angular, meets the creek in an odd way", PNW 2026-11-25)
  {
    const mid = runs(-5, 1).filter(r => r[1]).map(([y, r]) => [(r[0] + r[1]) / 2, y]).reverse(), cum = [0];
    for (let k = 1; k < mid.length; k++) cum.push(cum[k - 1] + Math.hypot(mid[k][0] - mid[k - 1][0], mid[k][1] - mid[k - 1][1]));
    const along = d => { let k = 1; while (k < cum.length - 1 && cum[k] < d) k++; const t = (d - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1); return [mid[k - 1][0] + (mid[k][0] - mid[k - 1][0]) * t, mid[k - 1][1] + (mid[k][1] - mid[k - 1][1]) * t]; };
    let worst = 0, at0 = 0;
    for (let d = 1; d <= cum.at(-1) - 1; d += 0.25) {
      const a = along(d - 1), p = along(d), b = along(d + 1), u = [p[0] - a[0], p[1] - a[1]], v = [b[0] - p[0], b[1] - p[1]];
      const turn = Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v)))) * 180 / Math.PI;
      if (turn > worst) { worst = turn; at0 = p[1]; }
    }
    if (report) console.log(`  ${map}: through the fence its middle turns at most ${worst.toFixed(0)}° a tile (at row ${at0.toFixed(1)})`);
    check(`${map}: through the fence it bends gradually (under ${JOIN_TURN}° a tile)`, () => assert.ok(mid.length > 30 && worst <= JOIN_TURN, `${worst.toFixed(0)}° at row ${at0.toFixed(1)}`));
  }
  // on its banks: the depth at each drawn edge, and ground over the water inside the ribbon
  let float = 0, where = null, dry = 0, inside = 0, farmFloat = 0;
  for (const [y, r] of rs) for (const x of [r[0] + STEP / 2, r[1] - STEP / 2]) { const s = at(x, y); if (s && s.depth > float) { float = s.depth; where = [x, y]; } }
  for (const [y, r] of runs(1, 9).filter(r => r[1])) for (const x of [r[0] + STEP / 2, r[1] - STEP / 2]) farmFloat = Math.max(farmFloat, at(x, y)?.depth ?? 0);
  const xs = north.line.map(p => p[0]);
  for (let y = -13 + STEP / 2; y < -0.25; y += STEP) for (let x = Math.min(...xs) - 3; x < Math.max(...xs) + 3; x += STEP) {
    if (northCreekAt(north, x, y).d > north.half - 0.1) continue;
    inside++;
    const s = at(x, y);
    if (!s || s.depth <= 0) dry++;
  }
  if (report) console.log(`  ${map}: most over the ground at its edge ${float.toFixed(2)} levels (farm creek ${farmFloat.toFixed(2)}); ground over the water inside ${dry} of ${inside}`);
  check(`${map}: its water sits on its banks`, () => {
    assert.ok(float <= FLOAT_MAX, `${float.toFixed(2)} levels over the ground at (${where?.map(v => v.toFixed(2))})`);
    assert.ok(inside > 100 && dry <= DRY_MAX * inside, `ground over the water at ${dry} of ${inside}`);
  });
  check(`${map}: no step in its water at the fence`, () => {
    const c = (course(0) + 0.5 + centre(-0.03)) / 2, a = at(c, 0.03), b = at(c, -0.03);
    assert.ok(a && b && Math.abs(a.level - b.level) <= JOIN_MAX, `${a?.level.toFixed(2)} / ${b?.level.toFixed(2)}`);
  });
  // (deer waiting beyond the fence by it stand clear of its drawn water: offCreek, fence-gate.js)
  const deer = game.catalog.animals.find(d => d.move === 'ground' && d.fenced);
  if (deer) check(`${map}: animals waiting at the fence beside it stand clear of its water`, () => {
    for (const x of [course(-1) - 2, course(-1) - 1, course(-1), course(-1) + 1, course(-2)]) {
      for (const a of waitAtFence(game.wildlife, deer, 4, 'N', x)) {
        assert.ok(!at(a.x, a.y)?.wet && northCreekAt(north, a.x, a.y).d > north.half + 0.3, `${deer.key} waiting at ${a.x.toFixed(2)}, ${a.y.toFixed(2)} stands in its water`);
        game.wildlife.agents.splice(game.wildlife.agents.indexOf(a), 1);
      }
    }
  });
  // (without a creek beyond the fence, as in a dry summer, the farm's rows by the fence keep the farm's own
  // ribbon: before diff review 2026-11-25 they drew whole tiles of water there)
  check(`${map}: with none beyond the fence, the farm's ribbon draws its rows by the fence`, () => {
    const keepNorth = game.border.north;
    game.border.north = null; terrain.wc = null; terrain.updateHeights();
    try {
      const g = terrain.water.geometry, P = g.attributes.position.array, D = g.attributes.aDepth.array, RB = g.attributes.aRibbon.array, rib = creekRibbon(w);
      let n = 0;
      for (let v = 0; v < RB.length; v++) {
        const vx = P[v * 3], vy = P[v * 3 + 2];
        if (vy < 0 || vy > 3 || vx < 0 || vx > w.w) continue;
        n++;
        assert.ok(Math.abs(RB[v] - rib.edge(vy * (w.w + 1) + vx, D[v])) < 1e-4, `corner ${vx}, ${vy}: ${RB[v].toFixed(3)} vs the farm's ${rib.edge(vy * (w.w + 1) + vx, D[v]).toFixed(3)}`);
      }
      assert.ok(n > 10, `${n} corners`);
    } finally { game.border.north = keepNorth; terrain.wc = null; terrain.updateHeights(); }
  });
  check(`${map}: carving it again moves nothing`, () => {
    const vh = w.vh.slice();
    outsideCreek(w, game.border, course, BORDER, game.catalog.definition.northCreekKeep, game.catalog.definition.northCreekHalf);
    assert.ok(vh.every((v, i) => v === w.vh[i]), 'the land moved');
  });
}
console.log(`\n${checks} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
