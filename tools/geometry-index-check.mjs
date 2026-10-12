import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { GeometryIndex } = await import('../js/render3d/geometry-index.js');
const { Flora } = await import('../js/render3d/flora.js');
import { plantFixture, MAPS } from './plant-performance-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
Math.random = mulberry32(1987);
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
function exact(original, indexed) {
  assert.equal(indexed.index?.count ?? indexed.attributes.position.count, original.index?.count ?? original.attributes.position.count);
  for (const [name, a] of Object.entries(original.attributes)) {
    const b = indexed.attributes[name], x = new Uint32Array(a.array.buffer, a.array.byteOffset, a.array.length), y = new Uint32Array(b.array.buffer, b.array.byteOffset, b.array.length);
    assert.equal(b.normalized, a.normalized); assert.equal(b.itemSize, a.itemSize);
    for (let i = 0; i < (original.index?.count ?? a.count); i++) {
      const before = original.index?.getX(i) ?? i, after = indexed.index?.getX(i) ?? i;
      for (let j = 0; j < a.itemSize; j++) assert.equal(y[after * a.itemSize + j], x[before * a.itemSize + j], name + '/' + i + '/' + j);
    }
  }
}
check('Exact indexing preserves triangle order, every attribute bit, groups and draw ranges', () => {
  const g = new THREE.BoxGeometry().toNonIndexed(); g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(.7), 3));
  g.setAttribute('aSnowHeight', new THREE.Float32BufferAttribute(Array.from({ length: g.attributes.position.count }, (_, i) => g.attributes.position.getY(i) + .5), 1));
  g.setDrawRange(3, 12); const cache = new GeometryIndex(), indexed = cache.get(g);
  assert.notEqual(indexed, g); assert.ok(indexed.attributes.position.count < g.attributes.position.count); exact(g, indexed);
  assert.deepEqual(indexed.groups, g.groups); assert.deepEqual(indexed.drawRange, g.drawRange); assert.equal(g.index, null);
  assert.equal(cache.get(g), indexed); cache.dispose();
});
check('Coincident positions with different normals, colours or snow data remain separate', () => {
  const g = new THREE.BoxGeometry().toNonIndexed(), p = g.attributes.position;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(p.count * 3).fill(.8), 3));
  g.attributes.color.setX(0, .81); g.setAttribute('aSnowHeight', new THREE.Float32BufferAttribute(Array.from({ length: p.count }, (_, i) => i === 1 ? .1 : 0), 1));
  const cache = new GeometryIndex(); exact(g, cache.get(g)); cache.dispose();
});
check('Unsupported or unprofitable geometry retains its original drawing data', () => {
  const cache = new GeometryIndex(), indexed = new THREE.BoxGeometry(); assert.equal(cache.get(indexed), indexed);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0], 3)); assert.equal(cache.get(g), g);
  g.morphAttributes.position = [g.attributes.position.clone()]; assert.equal(cache.get(g), g); cache.dispose();
});
check('Changed attributes invalidate the copy, and source disposal releases cached geometry', () => {
  const g = new THREE.BoxGeometry().toNonIndexed(), cache = new GeometryIndex(), first = cache.get(g); let freed = 0;
  first.addEventListener('dispose', () => freed++); g.attributes.position.setX(0, 1); g.attributes.position.needsUpdate = true;
  const second = cache.get(g); assert.notEqual(first, second); assert.equal(freed, 1); exact(g, second);
  second.addEventListener('dispose', () => freed++); g.dispose(); assert.equal(freed, 2); assert.equal(cache.stats.geometries, 0); assert.equal(cache.stats.sharedBytes, 0);
});
for (const map of MAPS) check(map + ': all plant detail levels preserve geometry, snow data and canopy models', () => {
  const game = plantFixture(map), flora = new Flora(new THREE.Scene()); flora.rebuild(game, true);
  const cache = flora.geometryIndex, seen = new Set(); let reduced = 0;
  for (const pool of flora.pools.values()) for (const source of pool.subs.values()) for (const geometry of [source.geo, source.geoLo, source.geoMid, source.shadowGeo]) {
    if (!geometry || seen.has(geometry)) continue; seen.add(geometry); const indexed = cache.get(geometry); exact(geometry, indexed); if (indexed !== geometry) reduced++;
  }
  assert.ok(reduced > 10); assert.ok(cache.stats.sharedBytes < cache.stats.sourceBytes * .65);
  for (const site of flora.treeSites.values()) assert.equal(site.geo.index, null, 'climbing still uses the procedural triangle list');
  cache.dispose();
});
console.log(`${checks} exact geometry checks passed.`);
