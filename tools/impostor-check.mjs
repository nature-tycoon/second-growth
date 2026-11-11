// node tools/impostor-check.mjs
// Far crowns as baked cards (decision 0042, tree-impostors.js), without a GPU: each card covers
// its crown from every direction it's baked from, pages fill in turn and a crown past the last
// page keeps its far model, and a pool shows its card only at the far level, once baked and
// switched on, with the far model casting the shadow. Drawing is checked by
// impostor-browser-check.mjs.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { TreeImpostors, VIEW_TILT } = await import('../js/render3d/tree-impostors.js');
const { PlantPool } = await import('../js/render3d/plant-pools.js');
const { Flora } = await import('../js/render3d/flora.js');
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
const crown = (w, h) => new THREE.SphereGeometry(1, 12, 8).toNonIndexed().scale(w, h, w * 0.8).translate(0.3, 1.5, 0);

check('A card covers its crown from each baked direction, centred on the crown\'s middle', () => {
  const atlas = new TreeImpostors({ value: 0 }), geo = crown(1.2, 0.7), card = atlas.card('a', geo);
  const pos = card.attributes.position, [u0, u1] = [pos.getX(0), pos.getX(1)], [v0, v1] = [pos.getY(0), pos.getY(2)];
  const aCard = card.attributes.aCard, cy = aCard.getZ(0), depth = aCard.getW(0);
  assert.ok(Math.abs(cy - 1.5) < 1e-6, `middle ${cy}`);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, c = Math.cos(VIEW_TILT), s = Math.sin(VIEW_TILT);
    const r = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)), u = new THREE.Vector3(-Math.sin(a) * s, c, -Math.cos(a) * s), d = new THREE.Vector3(Math.sin(a) * c, s, Math.cos(a) * c);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).y -= cy;
      assert.ok(v.dot(r) >= u0 - 1e-6 && v.dot(r) <= u1 + 1e-6 && v.dot(u) >= v0 - 1e-6 && v.dot(u) <= v1 + 1e-6, `view ${k} vertex ${i} outside the card`);
      assert.ok(Math.abs(v.dot(d)) <= depth + 1e-6, 'depth range');
    }
  }
  assert.equal(card.index.count, 6);
  assert.equal(atlas.card('a', geo), card, 'the same crown model shares one card');
});

check('Pages fill in turn; past the last one a crown keeps its far model', () => {
  for (const opts of [{}, { cell: 64, size: 1024 }]) {
    const atlas = new TreeImpostors({ value: 0 }, { ...opts, pages: 2 }), geo = crown(1, 1);
    assert.equal(atlas.perPage, 32);
    const cards = Array.from({ length: 64 }, (_, i) => atlas.card('c' + i, geo));
    assert.ok(cards.every(Boolean));
    assert.equal(atlas.pages.length, 2);
    assert.equal(cards[31].userData.material, atlas.pages[0].material);
    assert.equal(cards[32].userData.material, atlas.pages[1].material);
    assert.notEqual(atlas.pages[0].material, atlas.pages[1].material);
    // (first crown of the second page in the first cell again)
    assert.deepEqual([...cards[32].attributes.aCard.array.slice(0, 2)], [0, 0]);
    assert.equal(atlas.card('c64', geo), null);
    assert.equal(atlas.stats.full, 1);
    assert.equal(atlas.queue.length, 64);
  }
  assert.ok(new TreeImpostors({ value: 0 }, { cell: 64, size: 1024 }).capacity >= 64, 'the small atlas holds as many crowns');
});

check('A pool shows its card only at the far level, baked and on; the far model casts its shadow', () => {
  const atlas = new TreeImpostors({ value: 0 }), geo = crown(1, 1), far = crown(0.9, 0.9), lo = crown(1, 1);
  const card = atlas.card('p', geo), mat = new THREE.MeshLambertMaterial();
  const pool = new PlantPool(new THREE.Scene(), geo, mat, { geoLo: lo, geoFar: far, shadowGeo: lo, geoCard: card, cardMat: card.userData.material });
  pool.begin(); pool.add(0, 0, 0, 1, 1, 1, 0, [1, 1, 1]); pool.end();
  pool.setView(3, true, true);
  assert.equal(pool.mesh.geometry, far, 'not yet baked: the far model');
  assert.equal(pool.mesh.material, mat);
  card.userData.ready = true; pool.setView(3, true, true);
  assert.equal(pool.mesh.geometry, card); assert.equal(pool.mesh.material, card.userData.material);
  assert.equal(pool.mesh.castShadow, false); assert.ok(pool.proxy.visible);
  assert.equal(pool.shadowGeometry(), far); assert.equal(pool.proxy.geometry, far);
  pool.setView(1, true, true);
  assert.equal(pool.mesh.geometry, lo); assert.equal(pool.mesh.material, mat); assert.equal(pool.mesh.castShadow, true);
  atlas.enabled = false; pool.setView(3, true, true);
  assert.equal(pool.mesh.geometry, far, 'switched off: the far model');
  pool.setView(2, true, true);
  assert.equal(pool.proxy.geometry, lo, 'the stand-in casts again at play zoom');
});

check('Sumatra and the Amazon: every tree crown gets a card, trunks and other plants none', () => {
  for (const map of ['sumatra', 'amazon']) {
    Math.random = mulberry32(1987);
    const game = restoredGame(map, 1987), flora = new Flora(new THREE.Scene(), { impostors: {} });
    flora.setZoom(0.25); flora.rebuild(game, true);
    let crowns = 0;
    for (const [key, pool] of flora.pools) for (const p of pool.subs.values()) {
      if (!p.n) continue;
      if (key.startsWith('crown:')) { crowns++; assert.ok(p.geoCard, key); } else assert.equal(p.geoCard, null, key);
    }
    const models = flora.impostors.slots.size;
    console.log(`  ${map}: ${models} crown models, ${flora.impostors.pages.length} page(s)`);
    assert.ok(crowns > 0 && models <= flora.impostors.capacity && !flora.impostors.stats.full);
  }
});

console.log(`${checks} impostor checks passed`);
