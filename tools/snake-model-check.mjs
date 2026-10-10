// Snake anatomy, surface integrity and animation regressions.
// Run: node tools/snake-model-check.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const { loadAnimals, ANIMALS } = await import('../js/data/animals.js');
const { buildSpecies, faunaMaterial } = await import('../js/render3d/fauna.js');
const { Box3, Color, Vector3 } = await import('three');
let checks = 0;
const models = new Map();
function check(name, test) { test(); checks++; console.log(`PASS ${name}`); }
function bodyComponent(geo) {
  const n = geo.attributes.position.count, parent = Int32Array.from({ length: n }, (_, i) => i), idx = geo.index.array;
  const root = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let k = 0; k < idx.length; k += 3) { parent[root(idx[k + 1])] = root(idx[k]); parent[root(idx[k + 2])] = root(idx[k]); }
  const groups = new Map();
  for (let k = 0; k < n; k++) { const r = root(k); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(k); }
  return [...groups.values()].sort((a, b) => b.length - a.length)[0];
}
for (const map of ['pnw', 'atlanta', 'amazon', 'chinandega', 'sumatra']) {
  loadAnimals((await import(`../js/data/animals-${map}.js`)).default);
  for (const def of ANIMALS) if (def.sprite.kind === 'snake') {
    const model = buildSpecies(def); model.geo.computeBoundingBox();
    models.set(def.key, { ...model, def, body: bodyComponent(model.geo) });
  }
}
check('All five regional snakes have finite geometry within the mesh budget', () => {
  assert.equal(models.size, 5);
  for (const [key, { geo, def }] of models) {
    for (const attr of Object.values(geo.attributes)) assert.ok([...attr.array].every(Number.isFinite), `${key}: finite attributes`);
    assert.ok(geo.index.count / 3 < 12000 && geo.attributes.position.count < 7000, `${key}: mesh budget`);
    const size = geo.boundingBox.getSize(new Vector3()), S = def.sprite.size;
    assert.ok(size.x > S * 2.3 && size.x < S * 2.9, `${key}: long body and tapered tail`);
    assert.ok(geo.boundingBox.min.y >= 0 && geo.boundingBox.min.y < S * .015, `${key}: rests on the ground`);
    assert.ok(size.y < S * .25, `${key}: low profile`);
  }
});
check('The head, neck, torso and tail form one closed, connected skin', () => {
  for (const [key, { geo, body, def }] of models) {
    const p = geo.attributes.position, idx = geo.index.array, members = new Set(body), verts = new Map(), welded = new Map(), edges = new Map();
    let triangles = 0;
    for (const i of body) {
      const key = [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v / (def.sprite.size * 1e-5))).join(',');
      if (!verts.has(key)) verts.set(key, verts.size);
      welded.set(i, verts.get(key));
    }
    for (let k = 0; k < idx.length; k += 3) if (members.has(idx[k])) {
      triangles++;
      const tri = [welded.get(idx[k]), welded.get(idx[k + 1]), welded.get(idx[k + 2])];
      if (new Set(tri).size < 3) continue;
      for (let j = 0; j < 3; j++) { const a = tri[j], b = tri[(j + 1) % 3], edge = `${Math.min(a, b)},${Math.max(a, b)}`; edges.set(edge, (edges.get(edge) || 0) + 1); }
    }
    assert.ok(triangles / (idx.length / 3) > .9, `${key}: a continuous skin carries most of the model`);
    assert.ok([...edges.values()].every(n => n === 2), `${key}: no open seams at the head, belly or tail`);
  }
});
check('The skin faces outward on both the back and flattened belly', () => {
  for (const [key, { geo, body, def }] of models) {
    const p = geo.attributes.position, n = geo.attributes.normal, S = def.sprite.size;
    const middle = body.filter(i => Math.abs(p.getX(i)) < S * .10), ys = middle.map(i => p.getY(i));
    const low = Math.min(...ys), high = Math.max(...ys);
    for (const i of middle) {
      if (p.getY(i) > high - S * .003) assert.ok(n.getY(i) > .6, `${key}: outward back normal`);
      if (p.getY(i) < low + S * .001) assert.ok(n.getY(i) < -.6, `${key}: outward belly normal`);
    }
  }
});
check('Anacondas are stockier than land snakes and pythons have a longer silhouette', () => {
  const normalizedHeight = key => { const m = models.get(key); return m.geo.boundingBox.max.y / m.def.sprite.size; };
  assert.ok(normalizedHeight('anaconda') > normalizedHeight('gartersnake') * 2);
  assert.ok(normalizedHeight('boa') > normalizedHeight('ratsnake') * 1.3);
  const py = models.get('python'), boa = models.get('boa');
  assert.ok(py.geo.boundingBox.getSize(new Vector3()).x > boa.geo.boundingBox.getSize(new Vector3()).x * 1.06);
});
check('Garter snakes retain three continuous yellow stripes through the curved body', () => {
  const { geo, body, def } = models.get('gartersnake'), p = geo.attributes.position, c = geo.attributes.color, S = def.sprite.size;
  const yellow = i => c.getX(i) > .35 && c.getY(i) > .25 && c.getZ(i) < .15;
  for (let x = -.6; x < .55; x += .12) {
    const ids = body.filter(i => Math.abs(p.getX(i) / S - x) < .035), zs = ids.map(i => p.getZ(i)), ys = ids.map(i => p.getY(i));
    const center = (Math.min(...zs) + Math.max(...zs)) / 2, top = Math.max(...ys);
    assert.ok(ids.some(i => yellow(i) && p.getY(i) > top - S * .005), 'unbroken dorsal stripe');
    for (const side of [-1, 1]) assert.ok(ids.some(i => yellow(i) && side * (p.getZ(i) - center) > S * .025), 'unbroken flank stripe');
  }
});
check('Every snake has distinct high-contrast markings, attached eyes and a forked tongue', () => {
  const signatures = new Set();
  for (const [key, { geo, body, def }] of models) {
    const p = geo.attributes.position, c = geo.attributes.color, parts = geo.attributes.aPart, S = def.sprite.size;
    const colors = new Set(body.map(i => [c.getX(i), c.getY(i), c.getZ(i)].map(v => v.toFixed(2)).join(',')));
    assert.ok(colors.size > 12, `${key}: readable patterned skin`);
    signatures.add([...colors].sort().join('|'));
    const tongue = new Box3();
    for (let i = 0; i < p.count; i++) if (parts.getX(i) === 9) tongue.expandByPoint(new Vector3().fromBufferAttribute(p, i));
    assert.ok(!tongue.isEmpty() && tongue.min.z < -S * .01 && tongue.max.z > S * .01, `${key}: both tongue tips`);
    const face = body.filter(i => p.getX(i) > S * .98 && p.getX(i) < S * 1.14);
    assert.ok(face.length > 30, `${key}: skull is part of the skin`);
    const iris = new Color(def.sprite.heavy || def.sprite.saddles || def.sprite.reticulated ? '#b5a054' : '#94885e');
    const skin = new Set(body);
    for (const side of [-1, 1]) {
      const eye = new Box3();
      for (let i = 0; i < p.count; i++) if (!skin.has(i) && side * p.getZ(i) > 0 &&
        Math.abs(c.getX(i) - iris.r) + Math.abs(c.getY(i) - iris.g) + Math.abs(c.getZ(i) - iris.b) < 1e-5)
        eye.expandByPoint(new Vector3().fromBufferAttribute(p, i));
      assert.ok(!eye.isEmpty(), `${key}: eye on each side of the head`);
      const center = eye.getCenter(new Vector3()), v = new Vector3();
      assert.ok(body.some(i => v.fromBufferAttribute(p, i).distanceTo(center) < S * .022), `${key}: eye touches the curved skull`);
    }
  }
  assert.equal(signatures.size, 5);
});
check('Slithering grows toward the tail; resting motion is subtle and tongue flicks reach the shader', () => {
  for (const [key, { motion }] of models) {
    assert.ok(motion.waveMin <= .15 && motion.waveRest < .03 && motion.wavePow < 1, `${key}: quiet head/resting pose`);
    assert.equal(motion.bob, 0); assert.equal(motion.tongue, 1);
    const material = faunaMaterial(motion), shader = { uniforms: {}, vertexShader: '' }; material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.uWaveRest.value, motion.waveRest); assert.equal(shader.uniforms.uTongue.value, 1); material.dispose();
  }
  const material = faunaMaterial({ wave: 0 }), shader = { uniforms: {}, vertexShader: '' }; material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uWaveRest.value, .35); assert.equal(shader.uniforms.uTongue.value, 0); material.dispose();
});
for (const { geo } of models.values()) geo.dispose();
console.log(`${checks} snake model checks passed.`);
