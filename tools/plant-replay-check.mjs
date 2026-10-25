// node tools/plant-replay-check.mjs
// A brush stroke rebuilds its plant region, but only the tiles near the change are worked out
// again; the rest repeat what they drew last time. The result must always equal a complete
// rebuild, including shade changes without any plant edits and deferred water changes.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Flora } = await import('../js/render3d/flora.js');
import { plantFixture, editPlants, growPlants } from './plant-performance-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { F } from '../js/config.js';
import { TRAIL_RESOLUTION } from '../js/data/animal-trails.js';

Math.random = mulberry32(1987);
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
// every plant part in every region, in drawing order
function same(a, b, label) {
  for (const key of new Set([...a.pools.keys(), ...b.pools.keys()])) {
    const pa = a.pools.get(key), pb = b.pools.get(key);
    for (const k of new Set([...(pa?.subs.keys() || []), ...(pb?.subs.keys() || [])])) {
      const x = pa?.subs.get(k), y = pb?.subs.get(k);
      assert.equal(x?.n || 0, y?.n || 0, `${label}: ${key} count`);
      for (let n = 0; n < (x?.n || 0); n++) {
        assert.deepEqual([...x.m[n]], [...y.m[n]], `${label}: ${key} placement`);
        assert.deepEqual(x.c[n], y.c[n], `${label}: ${key} colour`);
      }
    }
  }
  assert.deepEqual([...a.treeSites.keys()].sort((p, q) => p - q), [...b.treeSites.keys()].sort((p, q) => p - q), `${label}: climbable trees`);
  for (const [i, s] of a.treeSites) assert.deepEqual(s.transform, b.treeSites.get(i).transform, `${label}: tree ${i}`);
}
const make = () => { const f = new Flora(new THREE.Scene()); f.setZoom(0.8); return f; };

for (const map of ['pnw', 'sumatra', 'chinandega']) check(`${map}: a brush stroke works out only the tiles near it, and matches a complete rebuild`, () => {
  const g = plantFixture(map), w = g.world, a = make(), b = make();
  a.rebuild(g, true);
  for (let n = 0; n < 6; n++) {
    const i = w.idx(30 + n, 40);
    w.feature[i] = w.feature[i] === F.LOG ? 0 : F.LOG;
    a.rebuild(g); b.rebuild(g, true);
    assert.ok(a.lastRebuild.worked <= 25 * 2, `${a.lastRebuild.worked} tiles worked out for one tile`);
    assert.ok(a.lastRebuild.tiles > a.lastRebuild.worked * 20, 'the rest of the region repeated');
    same(a, b, `${map} stroke ${n}`);
  }
});

check('Shade changes refresh idle regions without waiting for another plant edit', () => {
  const g = plantFixture('pnw'), w = g.world, a = make(), b = make(), before = make();
  a.rebuild(g, true); before.rebuild(g, true);
  // a grown tree's tile in the same region as a later edit, but out of the edit's reach
  let i = -1;
  for (let y = 40; y < 80 && i < 0; y++) for (let x = 40; x < 80 && i < 0; x++) {
    const j = w.idx(x, y);
    if (w.tree[j] && w.treeG[j] > 0.6) i = j;
  }
  assert.ok(i >= 0, 'a grown tree to shade');
  w.canopy[i] = w.canopy[i] > 0.5 ? 0.1 : 0.95;
  a.rebuild(g); assert.ok(a.lastRebuild.regions > 0);
  b.rebuild(g, true);
  assert.throws(() => same(before, b, 'shade'), undefined, 'the shade change is drawn');
  same(a, b, 'shade-only change');
  editPlants(g, 34, 34); a.rebuild(g); b.rebuild(g, true);
  same(a, b, 'idle shade change');
});

check('Regions spread over several calls keep the tiles that changed meanwhile', () => {
  const g = plantFixture('sumatra'), a = make(), b = make();
  a.rebuild(g, true);
  editPlants(g, 20, 20); editPlants(g, 70, 60);
  assert.equal(a.rebuild(g, false, 1), true, 'regions left waiting');
  editPlants(g, 35, 35);
  while (a.rebuild(g, false, 1));
  b.rebuild(g, true);
  same(a, b, 'budgeted');
});

check('Climbers get a fresh tree site each rebuild, as from a complete rebuild', () => {
  const g = plantFixture('sumatra'), w = g.world, a = make();
  a.rebuild(g, true);
  const before = new Map(a.treeSites);
  const i = w.idx(30, 40); w.feature[i] = w.feature[i] === F.LOG ? 0 : F.LOG;
  a.rebuild(g);
  let replaced = 0;
  for (const [t, s] of a.treeSites) if (before.has(t) && before.get(t) !== s) { replaced++; assert.deepEqual(s.transform, before.get(t).transform); }
  assert.ok(replaced > 0);
});

check('Trail wear opens the grass at the next day, not every step; faint wear never redraws', () => {
  const g = plantFixture('pnw'), w = g.world, a = make(), b = make(), R = TRAIL_RESOLUTION;
  w.trailDensity ||= new Float32Array(w.n * R * R);
  a.rebuild(g, true); a.rebuild(g);
  const drawn = f => { let n = 0; for (const p of f.pools.values()) for (const s of p.subs.values()) n += s.n || 0; return n; }, before = drawn(a);
  const wear = (x, y, v) => { for (let dy = 0; dy < R; dy++) for (let dx = 0; dx < R; dx++) w.trailDensity[(y * R + dy) * w.w * R + x * R + dx] = v; };
  for (let x = 20; x < 60; x++) wear(x, 30, 0.08); // (below where any plant gives way)
  g.day++;
  a.rebuild(g, false, 1);
  assert.equal(a.lastRebuild.regions, 0, 'faint wear redraws no region');
  for (let x = 20; x < 60; x++) wear(x, 30, 0.6);
  assert.equal(a.rebuild(g, false, 1), false); assert.equal(a.lastRebuild.regions, 0, 'same day: worn trail waits');
  g.day++;
  while (a.rebuild(g, false, 1));
  b.rebuild(g, true);
  same(a, b, 'next day');
  assert.ok(drawn(a) < before, 'the worn trail opened the grass');
});
check('Growth and shade redraw just their own tiles, except across the wood-edge and closed-canopy lines', () => {
  for (const map of ['pnw', 'sumatra']) {
    const g = plantFixture(map), w = g.world, a = make(), b = make();
    a.rebuild(g, true); a.rebuild(g);
    for (let n = 0; n < 3; n++) growPlants(g);
    // (trees across the 0.45 a wood's edge echoes, shrubs across 0.3, shade across 0.5, both ways)
    let crossed = 0;
    for (let i = 0; i < w.n && crossed < 40; i += 37) {
      if (w.tree[i]) { w.treeG[i] = w.treeG[i] > 0.45 ? 0.44 : 0.46; crossed++; }
      if (w.shrub[i]) w.shrubG[i] = w.shrubG[i] > 0.3 ? 0.29 : 0.31;
      w.canopy[i] = w.canopy[i] > 0.5 ? 0.49 : 0.51;
    }
    assert.ok(crossed > 10);
    while (a.rebuild(g, false, 1));
    b.rebuild(g, true);
    same(a, b, map + ' growth');
  }
});
console.log(`${checks} plant replay checks passed`);
