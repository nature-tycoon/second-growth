// River fish below a waterfall and at a marsh (decisions 0034, 0050): node tools/fish-falls-marsh-check.mjs
// - Below PNW's fall: coastal cutthroat started in the plunge pool and along the creek below spread
//   down and up the reaches; a few hold in the pool, not all. Before 2026-11-23 the steep reach below
//   the pool read as dry ground at every tile (each tile's own flat sheet, swimDepth), longer than the
//   hop, so the pool was sealed off: fish in it never left, and a fish whose reachable pools were all
//   among its last four places held there for good. Fish move through a creek's riffles by runDepth
//   (swim-routes.js), the drawn sheet; they still rest in pools.
// - Same with creeks dug beside the pool and the reach below (an edited map), and the fall stays a
//   barrier (waterfall-check).
// - A shallow marsh dug beside the creek: no fish queue at its edge (time there as with no marsh);
//   a pond dug there instead: fish swim in.
import assert from 'node:assert/strict';
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { T, F: FE } = await import('../js/config.js');
const { TOOLS } = await import('../js/tools.js');
const { fallTiles } = await import('../js/maps/landform.js');
const { mulberry32 } = await import('../js/rng.js');
const { swimDepth } = await import('../js/sim/waterline.js');
const { swimRoute } = await import('../js/sim/swim-routes.js');

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
function setup(dig = [], tool = 'creek') {
  Math.random = mulberry32(3);
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw', 1); g.autosave = false; g.speed = 0;
  const w = g.world, wl = g.wildlife, F = fallTiles(w)[0], fx = F % w.w, fy = (F / w.w) | 0;
  for (const [x, y] of dig.map(f => f(fx, fy))) TOOLS[tool].apply(g, w.idx(x, y));
  for (let i = 0; i < w.n; i++) if (w.feature[i] === FE.CULVERT) w.feature[i] = 0;
  g.refreshEnvironment();
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability();
  return { g, w, wl, fx, fy, def: g.catalog.animal.cutthroat };
}
// (fish swim the creek a game day a second, as tools/river-fish-spread-probe.mjs)
function swim(s, days, each) {
  const fish = () => s.wl.agents.filter(a => a.sp === s.def.index);
  for (let d = 0; d < days; d++) { for (let k = 0; k < 20; k++) { s.wl.update(0.05); for (const a of fish()) each(a); } s.g.day++; s.wl.daily(); }
  return fish();
}
const deepBelow = (s, rows) => { const out = []; for (let y = s.fy + rows[0]; y <= s.fy + rows[1]; y++) for (let x = s.fx - 1; x <= s.fx + 1; x++) if (s.w.terrain[s.w.idx(x, y)] === T.CREEK && swimDepth(s.w, x + 0.5, y + 0.5) >= 0.07) out.push(s.w.idx(x, y)); return out; };

function spread(label, dig) {
  const s = setup(dig), { w, wl, fx, fy, def } = s;
  // 4 in the pool, 8 along the creek below
  const pool = deepBelow(s, [1, 3]), below = deepBelow(s, [7, 38]), rng = mulberry32(4);
  for (let k = 0; k < 12; k++) { const t = k < 4 ? pool : below, i = t[Math.floor(rng() * t.length)]; wl.spawn(def, i % w.w, (i / w.w) | 0, { silent: true }).fromPool = k < 4; }
  const range = new Map(); let n = 0, near = 0;
  const fish = swim(s, 150, a => { n++; if (Math.hypot(a.x - fx - 0.5, a.y - fy - 0.5) < 3.5) near++; const r = range.get(a) || [1e9, -1e9]; r[0] = Math.min(r[0], a.y - fy); r[1] = Math.max(r[1], a.y - fy); range.set(a, r); });
  const pooled = fish.filter(a => a.fromPool), left = pooled.filter(a => range.get(a)[1] > 8).length;
  const reached = fish.filter(a => !a.fromPool && range.get(a)[0] < 4).length;
  console.log(`  ${label}: ${(near / n * 100).toFixed(0)}% of fish time within 3.5 tiles of the fall; ${left}/${pooled.length} pool fish went down the reach, ${reached}/${fish.length - pooled.length} from below came up to the pool`);
  return { near: near / n, left, pooled: pooled.length, reached, s };
}

check('Below the fall on a fresh map: pool fish go down the creek, and the reach is open both ways up to the pool', () => {
  const r = spread('fresh');
  assert.ok(r.near < 0.1, `${(r.near * 100).toFixed(0)}% of the time by the fall`);
  assert.ok(r.left >= r.pooled - 1, 'pool fish leave the pool');
  // the steep reach below the pool is open both ways
  const { w, fx, fy, def } = r.s, can = swimRoute(r.s.wl, { move: 'swim', x: fx + 0.5, y: fy + 2.5 }, def);
  for (let y = fy + 2; y < fy + 9; y++) { assert.ok(can(w.idx(fx, y), w.idx(fx, y + 1)), `down from row ${y - fy}`); assert.ok(can(w.idx(fx, y + 1), w.idx(fx, y)), `up to row ${y - fy}`); }
  assert.equal(can(w.idx(fx, fy + 1), w.idx(fx, fy - 1)) || can(w.idx(fx, fy), w.idx(fx, fy - 1)), false, 'still no way up the fall');
});

check('With creeks dug beside the pool and the reach below, the fish still spread', () => {
  const dig = []; for (let k = 1; k <= 10; k++) { dig.push((fx, fy) => [fx - 1, fy + k]); dig.push((fx, fy) => [fx + 1, fy + k]); }
  const r = spread('dug beside', dig);
  assert.ok(r.near < 0.25, `${(r.near * 100).toFixed(0)}% of the time by the fall`);
  assert.ok(r.left >= r.pooled - 1, 'pool fish leave the pool');
});

function atMarsh(tool) {
  const box = []; for (let dy = 16; dy < 20; dy++) for (let dx = 1; dx <= 5; dx++) box.push((fx, fy) => [fx + dx, fy + dy]);
  const s = tool ? setup(box, tool) : setup(), { w, wl, fx, fy, def } = s, Y0 = fy + 16;
  const inBox = (x, y) => x >= fx + 1 && x <= fx + 5 && y >= Y0 && y < Y0 + 4;
  const edge = a => { const X = Math.floor(a.x), Y = Math.floor(a.y); if (inBox(X, Y)) return false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBox(X + dx, Y + dy)) return true; return false; };
  const t = deepBelow(s, [8, 37]).filter(i => i % w.w === fx), rng = mulberry32(4);
  for (let k = 0; k < 12; k++) { const i = t[Math.floor(rng() * t.length)]; wl.spawn(def, i % w.w, (i / w.w) | 0, { silent: true }); }
  let n = 0, at = 0, inside = 0, held = 0;
  swim(s, 120, a => { n++; if (edge(a)) at++; if (inBox(Math.floor(a.x), Math.floor(a.y))) inside++; if (a.swimHeld) held++; });
  return { at: at / n, inside: inside / n, held: held / n };
}
check('A shallow marsh beside the creek: fish turn away, never queue at its edge; a pond: they swim in', () => {
  const none = atMarsh(null), marsh = atMarsh('marsh'), pond = atMarsh('pond');
  console.log(`  time at the edge: no marsh ${(none.at * 100).toFixed(1)}%, marsh ${(marsh.at * 100).toFixed(1)}% (held ${(marsh.held * 100).toFixed(1)}%), pond ${(pond.at * 100).toFixed(1)}%, in the pond ${(pond.inside * 100).toFixed(0)}%`);
  assert.ok(marsh.at < none.at * 1.3 + 0.01, 'no queue at the marsh');
  assert.ok(marsh.held < 0.005, 'not held by its shallows');
  assert.ok(pond.inside > 0.1, 'fish go into the pond');
});
console.log(`${checks} checks passed`);
