// node tools/far-model-check.mjs
// On a computer the game has found too slow, trees and shrubs switch to far models with the whole
// valley in view (see far-models.js): a fraction of the triangles, much the same look. Older
// built-in graphics drew a grown forest at a few frames a second before this. A computer that
// keeps up never sees them.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Flora } = await import('../js/render3d/flora.js');
const { farHull, farTrunk } = await import('../js/render3d/far-models.js');
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
const tris = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
const floras = new Map();
function grown(map) {
  if (!floras.has(map)) {
    Math.random = mulberry32(1987);
    const game = restoredGame(map, 1987), flora = new Flora(new THREE.Scene());
    flora.setFar(true); flora.setZoom(0.25); flora.rebuild(game, true);
    floras.set(map, flora);
  }
  return floras.get(map);
}
const sources = flora => [...flora.pools].flatMap(([key, pool]) => [...pool.subs.values()].filter(p => p.n).map(p => [key, p]));

for (const [map, most] of [['pnw', 0.45], ['sumatra', 0.6], ['amazon', 0.45], ['chinandega', 0.45]]) check(`${map}: zoomed out, the plants cost under ${most * 100}% of the distant models' triangles`, () => {
  let far = 0, lo = 0, shadow = 0, shadowLo = 0;
  for (const [, p] of sources(grown(map))) {
    if (p.kind === 'grass') continue; // (grass isn't drawn this far out)
    assert.equal(p.lod, 3);
    far += p.n * tris(p.geoFor(3)); lo += p.n * tris(p.geoLo);
    if (p.castsShadow) { shadow += p.n * tris(p.shadowGeometry()); shadowLo += p.n * tris(p.shadowGeo && p.lod !== 1 ? p.geoLo : p.geoLo); }
  }
  console.log(`  ${map}: ${(lo / 1e6).toFixed(2)}M -> ${(far / 1e6).toFixed(2)}M triangles, shadows ${(shadowLo / 1e6).toFixed(2)}M -> ${(shadow / 1e6).toFixed(2)}M`);
  assert.ok(far < lo * most, `${far} of ${lo}`);
  assert.ok(shadow < shadowLo * most, `shadows ${shadow} of ${shadowLo}`);
});

check('Far models keep the distant model\'s colours and snow, and stay within its size', () => {
  let n = 0;
  for (const map of ['pnw', 'sumatra', 'amazon', 'chinandega']) for (const [key, p] of sources(grown(map))) {
    if (p.geoFar === p.geoLo || !/^(crown|trunk|shrub):/.test(key)) continue; // (made by far-models.js)
    n++;
    for (const [name, a] of Object.entries(p.geoLo.attributes)) {
      assert.equal(p.geoFar.attributes[name]?.itemSize, a.itemSize, `${key}: ${name}`);
      const v = p.geoFar.attributes[name].array;
      assert.ok(v.every(Number.isFinite), `${key}: ${name} values`);
    }
    p.geoLo.computeBoundingBox(); p.geoFar.computeBoundingBox();
    const lo = p.geoLo.boundingBox, far = p.geoFar.boundingBox, size = lo.getSize(new THREE.Vector3());
    for (const q of ['x', 'y', 'z']) {
      assert.ok(far.min[q] >= lo.min[q] - size[q] * 0.35 && far.max[q] <= lo.max[q] + size[q] * 0.35, `${key}: ${q} extent`);
    }
    // (faces turned outward, away from the middle of their own clump or ring stack, so the far
    // model is lit from outside like the distant one)
    const pos = p.geoFar.attributes.position, idx = p.geoFar.index.array, parent = Int32Array.from({ length: pos.count }, (_, i) => i);
    const root = x => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
    for (let f = 0; f < idx.length; f += 3) for (const k of [1, 2]) parent[root(idx[f + k])] = root(idx[f]);
    const mid = new Map();
    for (let i = 0; i < pos.count; i++) { const m = mid.get(root(i)) || [0, 0, 0, 0]; m[0] += pos.getX(i); m[1] += pos.getY(i); m[2] += pos.getZ(i); m[3]++; mid.set(root(i), m); }
    let outward = 0;
    const v = i => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    for (let f = 0; f < idx.length; f += 3) {
      const A = v(idx[f]), B = v(idx[f + 1]), C = v(idx[f + 2]), m = mid.get(root(idx[f]));
      const normal = B.clone().sub(A).cross(C.clone().sub(A)), centre = A.clone().add(B).add(C).divideScalar(3);
      if (normal.dot(centre.sub(new THREE.Vector3(m[0] / m[3], m[1] / m[3], m[2] / m[3]))) > 0) outward++;
    }
    assert.ok(outward >= idx.length / 3 * 0.95, `${key}: ${outward} of ${idx.length / 3} faces face out`);
  }
  assert.ok(n > 20, `${n} far models checked`);
});

check('A conifer stays a spire, and palms keep their distant fronds', () => {
  const flora = grown('pnw'), fir = flora.pools.get([...flora.pools.keys()].find(k => k.startsWith('crown:fir:')));
  const g = [...fir.subs.values()][0].geoFar, p = g.attributes.position;
  g.computeBoundingBox();
  const { min, max } = g.boundingBox, H = max.y - min.y, cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2;
  let low = 0, high = 0;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i) - cx, p.getZ(i) - cz), u = (p.getY(i) - min.y) / H;
    if (u < 0.3) low = Math.max(low, r); else if (u > 0.7 && u < 0.95) high = Math.max(high, r);
  }
  assert.ok(high < low * 0.6, `top ${high} vs bottom ${low}`);
  const palms = [...grown('sumatra').pools].filter(([k]) => /^crown:(oilpalm|palm):/.test(k));
  assert.ok(palms.length);
  for (const [key, pool] of palms) for (const p of pool.subs.values()) assert.equal(p.geoFar, p.geoLo, key);
});

check('Far models only once allowed, then only with the valley in view (sooner on Fast)', () => {
  const flora = grown('pnw'), crown = () => sources(flora).find(([k]) => k.startsWith('crown:'))[1];
  flora.setFar(false);
  for (const [light, zoom] of [[false, 0.2], [true, 0.3]]) { flora.setLight(light); flora.setZoom(zoom); assert.equal(crown().lod, 1, 'not allowed: the distant model'); }
  flora.setFar(true);
  for (const [light, zoom, lod] of [[false, 0.3, 3], [false, 0.4, 1], [false, 0.8, 2], [true, 0.45, 3], [true, 0.6, 1]]) {
    flora.setLight(light); flora.setZoom(zoom);
    assert.equal(crown().lod, lod, `${light ? 'fast' : 'high'} at ${zoom}`);
    if (lod === 3) assert.equal(crown().shadowGeometry(), crown().geoFar, 'far trees cast the far model\'s shadow');
  }
  flora.setLight(false); flora.setZoom(0.25);
});

check('A bare winter tree keeps its main limbs in place, at a fraction of the triangles', () => {
  const flora = grown('chinandega'), [key, p] = sources(flora).find(([k]) => k.startsWith('bare:'));
  assert.ok(tris(p.geoFar) < tris(p.geo) * 0.25 && tris(p.geoLo) < tris(p.geo) * 0.7, `${key}: ${tris(p.geo)} / ${tris(p.geoLo)} / ${tris(p.geoFar)}`);
  for (const g of [p.geo, p.geoLo, p.geoFar]) g.computeBoundingBox();
  const full = p.geo.boundingBox.getSize(new THREE.Vector3()), far = p.geoFar.boundingBox.getSize(new THREE.Vector3());
  assert.ok(far.y > full.y * 0.75 && far.x > full.x * 0.6, `${key}: the far tree spans the full one`);
});

check('Far models are built from any distant model without failing', () => {
  const box = new THREE.BoxGeometry(1, 2, 1).toNonIndexed(); box.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(box.attributes.position.count * 3).fill(0.5), 3));
  assert.equal(farHull(box), null, 'a single piece has no clumps');
  assert.ok(tris(farHull(box, { rings: true })) <= 48);
  assert.ok(tris(farTrunk(box)) === 10);
});

console.log(`${checks} far model checks passed`);
