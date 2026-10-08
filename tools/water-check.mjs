// Water depth, shared flow, bends and rebuilding regressions.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Terrain } = await import('../js/render3d/terrain.js');
import { Game } from '../js/game.js';
import { T, F, LEVEL } from '../js/config.js';
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
// Terrain's only DOM dependency here creates a noise texture; no rendering or canvas art.
globalThis.document = { createElement: () => ({
  getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} })
}) };
const atlas = { tex: null, uv: {}, slot: {} };
for (let season = 0; season < 4; season++) {
  atlas.uv[T.PASTURE + '|' + season + '|0'] = [0, 0, 1, 1];
  atlas.slot[T.PASTURE + '|' + season + '|0'] = 0;
}
function make(map = 'pnw') {
  const game = new Game(); game.newGame(1987, 'free', 'standard', map);
  const scene = new THREE.Scene(), terrain = new Terrain(scene, atlas);
  terrain.setWorld(game.world, game.border); terrain.updateSurface(game);
  return { game, scene, terrain };
}
function dispose(t) {
  t.banks.dispose();
  for (const m of [t.mesh,t.water,t.flood,t.skirt,t.line,t.overlay,t.preview]) m?.geometry.dispose();
  for (const m of [t.material,t.waterMat,t.floodMat,t.skirtMat,t.overlayMat,t.previewMat]) m.dispose();
  t.noise.dispose();t.tiles.tex.value.dispose();t.tiles.tint.value.dispose();
}
check('Signed depth follows the rendered bed, and shared vertices have seamless flow', () => {
  for (const map of ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'sumatra', 'reef']) {
    const { game, terrain: t } = make(map), w = game.world;
    const a = t.water.geometry.attributes, seen = new Map();
    let positive = 0, negative = 0;
    for (const key of ['position', 'color', 'aDepth', 'aFlow', 'aBend']) assert.ok(a[key].array.every(Number.isFinite), map + ' ' + key);
    for (let i = 0; i < a.position.count; i++) {
      const x = a.position.getX(i), y = a.position.getY(i), z = a.position.getZ(i), depth = a.aDepth.getX(i);
      assert.ok(Math.abs(depth - (y / LEVEL - w.vert(x, z))) < 0.00001, map + ' signed depth');
      if (depth > 0) positive++; if (depth < 0) negative++;
      const sample = [a.aFlow.getX(i), a.aFlow.getY(i), a.aBend.getX(i)];
      assert.ok(sample[2] >= 0 && sample[2] <= 1);
      const key = x + ',' + z;
      if (seen.has(key)) assert.deepEqual(sample, seen.get(key), map + ' shared corner'); else seen.set(key, sample);
    }
    if (map !== 'reef') assert.ok(positive > 0 && negative > 0, map + ' water and bank depths');
    const mesh = t.water; t.refreshWater(); assert.equal(t.water, mesh, 'no per-frame rebuild');
    t.setFast(true); assert.equal(t.water, mesh, 'Fast keeps water details');
    dispose(t);
  }
});
check('A flat L-shaped creek flows along both arms and puts ripples at its bend; ponds stay still', () => {
  const {game, terrain:t} = make(), w=game.world;
  w.terrain.fill(T.PASTURE); game.border.terrain.fill(T.PASTURE); w.vh.fill(0);
  for (let y=20;y<=30;y++) w.terrain[w.idx(30,y)]=T.CREEK;
  for (let x=30;x<=40;x++) w.terrain[w.idx(x,30)]=T.CREEK;
  for (let y=50;y<=53;y++) for(let x=50;x<=53;x++) w.terrain[w.idx(x,y)]=T.POND;
  w.hv++; t.updateHeights();
  const a=t.water.geometry.attributes;
  const at=(x,z)=>{for(let i=0;i<a.position.count;i++)if(a.position.getX(i)===x&&a.position.getZ(i)===z)return [a.aFlow.getX(i),a.aFlow.getY(i),a.aBend.getX(i)];throw Error('Missing vertex');};
  const vertical=at(30,24),horizontal=at(36,30),bend=at(30,30),pond=at(51,51);
  assert.ok(Math.abs(vertical[1])>.6 && Math.abs(vertical[0])<.01);
  assert.ok(Math.abs(horizontal[0])>.6 && Math.abs(horizontal[1])<.01);
  assert.ok(bend[2]>.1 && vertical[2]===0 && horizontal[2]===0);
  assert.deepEqual(pond,[0,0,0]);
  dispose(t);
});
check('Digging and filling water refresh the depth/flow buffers without changing simulation data', () => {
  const {game,terrain:t}=make(),w=game.world, i=w.idx(15,15);
  const rng=game.rng.state();w.terrain[i]=T.POND;w.carve(15,15,.7);
  const state=Object.fromEntries(['terrain','vh','ground','waterQ','connected'].map(key=>[key,w[key].slice()]));
  const old=t.water.geometry;t.updateHeights();assert.notEqual(t.water.geometry,old);
  const saved=t.water.geometry.attributes.aDepth.array.slice();t.buildWater();assert.deepEqual(t.water.geometry.attributes.aDepth.array,saved);
  for(const [key,value] of Object.entries(state))assert.deepEqual(w[key],value,key+' unchanged');
  assert.equal(game.rng.state(),rng);
  w.terrain[i]=T.PASTURE;t.refreshWater();assert.ok(t.water.geometry.attributes.aDepth.array.every(Number.isFinite));
  dispose(t);
});
console.log(checks + ' water checks passed.');
