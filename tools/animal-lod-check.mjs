// node tools/animal-lod-check.mjs
// Distant animal models: same parts, outline and colors as the detailed models, used only when
// an animal is small on screen, and never for the selected or followed animal.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Actors } = await import('../js/render3d/actors.js');
const { buildSpecies, Fauna } = await import('../js/render3d/fauna.js');
const { FAR_CELLS, FAR_PIXELS, simplifyAnimal, triangleCount } = await import('../js/render3d/animals/animal-lod.js');
const { Game } = await import('../js/game.js');
const { ANIMAL, ANIMALS, loadAnimals, drawDef } = await import('../js/data/animals.js');
const { T, DAYS_PER_YEAR } = await import('../js/config.js');
const { mulberry32 } = await import('../js/rng.js');

let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
const MAPS = ['pnw', 'atlanta', 'amazon', 'chinandega', 'sumatra', 'serengeti', 'reef'];

// Per part: bounds, and the surface's area-weighted mean color (what a small animal reads as).
function partStats(geo) {
  const pos = geo.attributes.position, part = geo.attributes.aPart, color = geo.attributes.color, out = new Map();
  const get = id => { let s = out.get(id); if (!s) out.set(id, s = { box: new THREE.Box3(), color: [0, 0, 0], area: 0 }); return s; };
  for (let i = 0; i < pos.count; i++) get(part.getX(i)).box.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, i));
  const idx = geo.index.array, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    const [i, j, k] = [idx[t], idx[t + 1], idx[t + 2]], s = get(part.getX(i));
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, j); c.fromBufferAttribute(pos, k);
    const area = b.sub(a).cross(c.sub(a)).length() / 2;
    for (let n = 0; n < 3; n++) s.color[n] += area * (color.array[i * 3 + n] + color.array[j * 3 + n] + color.array[k * 3 + n]) / 3;
    s.area += area;
  }
  for (const s of out.values()) s.color = s.color.map(v => v / (s.area || 1));
  return out;
}

await check('Every species keeps its parts, outline, colors and shader attributes in its distant model', async () => {
  let worst = 0, worstColor = 0, before = 0, after = 0, models = 0;
  for (const map of MAPS) {
    loadAnimals(((await import(`../js/data/animals-${map}.js`))).default);
    for (const base of ANIMALS) for (const def of new Set([base, drawDef(base, { id: 1, age: 1e9, male: true }), drawDef(base, { id: 1, age: 1e9 }, 0)])) {
      const { geo, motion } = buildSpecies(def), copy = geo.attributes.position.array.slice();
      const far = simplifyAnimal(geo, motion.len);
      assert.deepEqual(geo.attributes.position.array, copy, `${map}/${def.key}: detailed geometry untouched`);
      assert.deepEqual(Object.keys(far.attributes), Object.keys(geo.attributes), `${map}/${def.key}: same attributes`);
      for (const [name, a] of Object.entries(geo.attributes)) assert.equal(far.attributes[name].itemSize, a.itemSize);
      const near = partStats(geo), simple = partStats(far), cell = motion.len / FAR_CELLS;
      assert.deepEqual([...simple.keys()].sort(), [...near.keys()].sort(), `${map}/${def.key}: every animated part remains`);
      for (const [id, s] of near) {
        const f = simple.get(id);
        const drift = Math.max(...['x', 'y', 'z'].flatMap(k => [Math.abs(s.box.min[k] - f.box.min[k]), Math.abs(s.box.max[k] - f.box.max[k])]));
        worst = Math.max(worst, drift / cell);
        assert.ok(drift <= cell * 1.01, `${map}/${def.key} part ${id}: outline moves ${(drift / cell).toFixed(2)} cells`);
        const shift = Math.max(...f.color.map((v, j) => Math.abs(v - s.color[j])));
        // (a small patterned part, such as a snake's head, is a few pixels across when distant)
        const large = Math.max(...s.box.getSize(new THREE.Vector3()).toArray()) > motion.len / 4;
        if (large) worstColor = Math.max(worstColor, shift);
        assert.ok(shift < (large ? 0.06 : 0.2), `${map}/${def.key} part ${id}: overall color shifts ${shift.toFixed(3)}`);
      }
      before += triangleCount(geo); after += triangleCount(far); models++;
      geo.dispose(); far.dispose();
    }
  }
  console.log(`  ${models} models: ${before} → ${after} triangles (${Math.round(100 - after / before * 100)}% fewer); worst outline drift ${worst.toFixed(2)} of one ${FAR_CELLS}th of body length, worst color shift on a large part ${worstColor.toFixed(3)}`);
});

// The animal-stress fixture: 512 idle wildebeest, zebra and gazelle on flat Serengeti ground.
Math.random = mulberry32(20261017);
const g = new Game(); g.newGame(1987, 'free', 'standard', 'serengeti');
g.wildlife.agents = []; g.wildlife.recount(); g.visitors.agents = []; g.residents = [];
{ const w = g.world; w.vh.fill(0); w.tree.fill(0); w.ground.fill(0); w.shrub.fill(0); w.terrain.fill(T.SOIL); w.feature.fill(0); w.struct.fill(-1); }
const herd = [ANIMAL.wildebeest, ANIMAL.zebra, ANIMAL.gazelle];
for (let k = 0; k < 512; k++) {
  const def = herd[k % 3], x = 34 + (k % 32) * 1.0, y = 34 + Math.floor(k / 32) * 1.4;
  const a = g.wildlife.spawn(def, x, y, { silent: true, juvenile: k % 7 === 0, age: k % 7 === 0 ? 10 : def.mature * DAYS_PER_YEAR + 1 });
  Object.assign(a, { x, y, tx: x, ty: y, wait: 1000, orientation: -.35, phase: k });
}
const right = new THREE.Vector3(1, 0, 0), VW = 1280, VH = 800, camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -300, 300);
function aim(zoom, x = 50, z = 45) {
  const ppu = 46 * zoom, hw = VW / 2 / ppu, hh = VH / 2 / ppu, el = 34 * Math.PI / 180, az = Math.PI / 4, target = new THREE.Vector3(x, 0, z);
  Object.assign(camera, { left: -hw, right: hw, top: hh, bottom: -hh });
  camera.position.copy(target).add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(120));
  camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
const actors = new Actors(new THREE.Scene());
function submitted(farModels, zoom, time = 1) {
  actors.fauna.farModels = farModels; aim(zoom); actors.update(g, right, time, camera, VH);
  let triangles = 0, instances = 0, far = 0;
  for (const p of actors.fauna.species.values()) for (const m of p.far ? [p, p.far] : [p]) {
    if (!m.mesh.visible) continue;
    assert.equal(m.mesh.count, m.count);
    triangles += m.count * triangleCount(m.mesh.geometry); instances += m.count; if (m !== p) far += m.count;
  }
  return { triangles, instances, far };
}

await check('The 512-animal herd submits at least half fewer animal triangles in the wide view', () => {
  for (const zoom of [0.65, 0.3]) {
    const full = submitted(false, zoom), lod = submitted(true, zoom);
    assert.equal(full.far, 0);
    assert.equal(lod.instances, full.instances, 'every animal is still drawn');
    assert.ok(lod.instances >= 500, `wide view shows the herd (${lod.instances})`);
    assert.ok(lod.triangles <= full.triangles * 0.5, `${lod.triangles} of ${full.triangles}`);
    console.log(`  zoom ${zoom}: ${full.instances} animals, ${(full.triangles / 1e6).toFixed(2)}M → ${(lod.triangles / 1e6).toFixed(2)}M triangles (${Math.round(100 - lod.triangles / full.triangles * 100)}% fewer)`);
  }
});

await check('Close up, animals keep their detailed models', () => {
  const full = submitted(false, 4.5), lod = submitted(true, 4.5);
  assert.equal(lod.instances, full.instances);
  // An animal uses the distant model only below FAR_PIXELS of body length on screen.
  for (const p of actors.fauna.species.values()) if (p.far?.count) {
    for (let k = 0; k < p.far.count; k++) {
      const m = new THREE.Matrix4(); p.far.mesh.getMatrixAt(k, m);
      const scale = new THREE.Vector3().setFromMatrixScale(m).x;
      assert.ok(p.motion.len * scale * 46 * 4.5 < FAR_PIXELS);
    }
  }
  const adults = actors.visibleWildlife.filter(a => !a.juvenile).length; assert.ok(adults > 0);
  assert.ok(lod.instances - lod.far >= adults, 'every adult is detailed at full zoom');
});

await check('The selected and followed animals stay detailed in the wide view', () => {
  const [selected, followed] = g.wildlife.agents.filter(a => !a.juvenile);
  g.selectedAgent = selected; actors.followAgent = followed;
  submitted(true, 0.3);
  for (const a of [selected, followed]) {
    const p = actors.fauna.species.get(actors.fauna.modelKey(drawDef(g.catalog.animals[a.sp], a, g.month)));
    const st = actors.pose.get(a.id), m = new THREE.Matrix4(), found = [];
    for (let k = 0; k < p.count; k++) { p.mesh.getMatrixAt(k, m); found.push(m.elements[12] === st.x && m.elements[14] === st.z); }
    assert.ok(found.includes(true), `${a.sp} drawn by the detailed pool`);
  }
  g.selectedAgent = null; actors.followAgent = null;
});

await check('Distant instances carry the same transforms and animation data as detailed ones', () => {
  const near = new Map(), far = new Map();
  for (const [farModels, out] of [[false, near], [true, far]]) {
    submitted(farModels, 0.65, 2);
    for (const p of actors.fauna.species.values()) for (const m of p.far ? [p, p.far] : [p])
      for (let k = 0; k < m.count; k++) {
        const key = m.mesh.instanceMatrix.array.slice(k * 16 + 12, k * 16 + 15).join(',');
        out.set(key, [...m.mesh.instanceMatrix.array.slice(k * 16, k * 16 + 16), ...m.anim.array.slice(k * 4, k * 4 + 4)]);
      }
  }
  assert.equal(far.size, near.size);
  for (const [key, values] of near) assert.deepEqual(far.get(key), values);
});

await check('Without a camera, or with the switch off, every animal is detailed', () => {
  actors.fauna.farModels = true; actors.update(g, right, 3);
  for (const p of actors.fauna.species.values()) assert.ok(!p.far?.count);
  const off = submitted(false, 0.3);
  assert.equal(off.far, 0);
  for (const p of actors.fauna.species.values()) if (p.far) assert.equal(p.far.mesh.visible, false);
});

await check('Distant pools upload only active ranges and carry canopy grips', async () => {
  loadAnimals(((await import('../js/data/animals-amazon.js'))).default);
  const def = ANIMALS.find(d => d.move === 'tree' && buildSpecies(d).motion.canopyFeet);
  assert.ok(def, 'a canopy climber with grips');
  const fauna = new Fauna(new THREE.Scene()), grips = [1, 2, 3, 4].map(n => new THREE.Vector3(n, n + .5, -n));
  fauna.begin(0.01);
  for (let k = 0; k < 20; k++) fauna.add(def, k, 0, 0, 0, 0.02, 0, 0, 0, 0, 0, 0, grips);
  fauna.end();
  const p = fauna.species.get(fauna.modelKey(def));
  assert.equal(p.count, 0); assert.equal(p.mesh.visible, false); assert.equal(p.far.count, 20);
  assert.ok(p.far.cap >= 20 && p.far.grips?.length === 3);
  assert.deepEqual([...p.far.grips[0].array.slice(0, 4)], [1, 1.5, -1, 2]);
  assert.deepEqual(p.far.mesh.instanceMatrix.updateRanges, [{ start: 0, count: 320 }]);
  assert.equal(p.far.mat, p.mat, 'one material and shader per species');
  assert.equal(p.far.motion, p.motion, 'same motion and support data');
  fauna.begin(0.01); fauna.add(def, 0, 0, 0, 0, 0.02, 0, 0, 0, 0); fauna.end();
  assert.deepEqual(p.far.mesh.instanceMatrix.updateRanges, [{ start: 0, count: 16 }]);
});

console.log(`${checks} animal LOD checks passed.`);
