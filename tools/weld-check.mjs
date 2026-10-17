// weldVertices must give exactly what three.js mergeVertices gives.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { mergeVertices } = await import('three/addons/BufferGeometryUtils.js');
const { weldVertices } = await import('../js/render3d/geometry/weld.js');
function same(a, b, label) {
  assert.deepEqual(Object.keys(b.attributes), Object.keys(a.attributes), label);
  for (const n of Object.keys(a.attributes)) { assert.deepEqual(Array.from(b.attributes[n].array), Array.from(a.attributes[n].array), label + ' ' + n); assert.equal(b.attributes[n].constructor, a.attributes[n].constructor); }
  assert.deepEqual(Array.from(b.index.array), Array.from(a.index.array), label + ' index'); assert.equal(b.index.array.constructor, a.index.array.constructor);
}
const shapes = { sphere: new THREE.SphereGeometry(1, 24, 16), ico: new THREE.IcosahedronGeometry(1, 3), cyl: new THREE.CylinderGeometry(.3, .5, 2, 9, 3), box: new THREE.BoxGeometry(1, 2, 3, 2, 2, 2), cone: new THREE.ConeGeometry(1, 2, 7), dodeca: new THREE.DodecahedronGeometry(.8, 1) };
let n = 0;
for (const [name, base] of Object.entries(shapes)) for (const tol of [1e-4, 1e-3, 1e-6]) {
  for (const variant of ['indexed', 'flat', 'posOnly', 'colored']) {
    let g = base.clone();
    if (variant !== 'indexed' && g.index) g = g.toNonIndexed();
    if (variant === 'posOnly') { g.deleteAttribute('uv'); g.deleteAttribute('normal'); }
    if (variant === 'colored') g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: g.attributes.position.count * 3 }, (_, i) => (i % 7) / 7), 3));
    g.translate(.123456, -3.3, 7.77); g.scale(1.7, .9, 2.1);
    same(mergeVertices(g, tol), weldVertices(g, tol), `${name}/${variant}/${tol}`); n++;
  }
}
console.log(`PASS ${n} weld comparisons match three.js mergeVertices exactly.`);
