// Shoreline geometry, alignment, exclusions, graphics and editing regressions.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Terrain } = await import('../js/render3d/terrain.js');
const { surfaceHeight, bankAllowed } = await import('../js/render3d/riverbanks.js');
import { Game } from '../js/game.js';
import { T, F, LEVEL } from '../js/config.js';
import { PLANT } from '../js/data/plants.js';
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
check('Surface samples match each ground triangle, including the shared diagonal', () => {
  const heights = [[0,2],[4,1]], at = (x,z) => heights[z][x];
  assert.equal(surfaceHeight(at,.75,.25), 1.25);
  assert.equal(surfaceHeight(at,.25,.75), 2.25);
  assert.equal(surfaceHeight(at,.5,.5), .5);
});
check('Creek and river details sit on their contours, preserve world state and remain stable', () => {
  const { game, terrain: t } = make(), w = game.world;
  const saved = Object.fromEntries(['terrain','vh','ground','groundG','tree','treeG','feature'].map(k=>[k,w[k].slice()]));
  const rng = game.rng.state(), details = structuredClone(t.banks.details);
  assert.ok(details.stones.length > 100, 'readable gravel, rather than an empty scene');
  for (const p of [...details.stones,...details.grasses,...details.wood]) {
    assert.ok(Object.values(p).filter(v=>typeof v==='number').every(Number.isFinite));
    assert.ok(bankAllowed(w,game.border,t.bankTerrainAt,Math.floor(p.x),Math.floor(p.z)), 'no details on developed tiles');
    const water = t.banks.waterAt(p.x,p.z);
    const ground = surfaceHeight((x,z)=>w.vert(x,z)*LEVEL,p.x,p.z);
    assert.ok(Number.isFinite(water));
    assert.ok(ground - water >= -.0551 && ground - water <= .1701, 'restricted to the waterline');
  }
  const meshes = t.banks.meshes.slice();
  t.updateSurface(game);
  assert.deepEqual(t.banks.meshes,meshes,'unchanged banks reuse their GPU buffers');
  assert.deepEqual(t.banks.details,details);
  for (const [k,v] of Object.entries(saved)) assert.deepEqual(w[k],v,k+' unchanged');
  assert.equal(game.rng.state(),rng);
  dispose(t);
});
check('Roads, planted fields, trails, structures and features stay free of bank decoration', () => {
  const {game,terrain:t}=make(),w=game.world;
  const p=t.banks.details.stones.find(p=>w.inb(Math.floor(p.x),Math.floor(p.z)));
  const x=Math.floor(p.x),z=Math.floor(p.z),i=w.idx(x,z);
  assert.ok(i>=0);
  for(const type of [T.ROAD,T.FIELD,T.TRAIL]){
    w.terrain[i]=type;t.updateSurface(game);
    assert.ok(!t.banks.details.stones.some(p=>Math.floor(p.x)===x&&Math.floor(p.z)===z));
    const k=(z-t.Y0)*t.TW+x-t.X0;
    assert.ok(t.mesh.geometry.attributes.aShore.array.slice(k*12,k*12+12).every(v=>v===0));
  }
  w.terrain[i]=T.PASTURE;w.feature[i]=F.BOARDWALK;t.updateSurface(game);
  assert.ok(!bankAllowed(w,game.border,t.bankTerrainAt,x,z));
  w.feature[i]=0;w.struct[i]=0;t.updateSurface(game);
  assert.ok(!bankAllowed(w,game.border,t.bankTerrainAt,x,z));
  dispose(t);
});
check('Wetland grass accents require actual plants and refresh after removal', () => {
  const {game,terrain:t}=make(),w=game.world;
  const eligible=t.banks.details.stones.find(p=>p.y-t.banks.waterAt(p.x,p.z)>.025&&w.inb(Math.floor(p.x),Math.floor(p.z)));
  assert.ok(eligible);
  const x=Math.floor(eligible.x),z=Math.floor(eligible.z),i=w.idx(x,z);
  w.setPlant(i,PLANT.sedge,1);t.updateSurface(game);
  assert.ok(t.banks.details.grasses.some(p=>Math.floor(p.x)===x&&Math.floor(p.z)===z));
  w.ground[i]=0;t.updateSurface(game);
  assert.ok(!t.banks.details.grasses.some(p=>Math.floor(p.x)===x&&Math.floor(p.z)===z));
  dispose(t);
});
check('Re-carving the creek refreshes bank heights; Fast detail is distributed across the map', () => {
  const {game,terrain:t}=make(),w=game.world;
  const p=t.banks.details.stones.find(p=>w.inb(Math.floor(p.x),Math.floor(p.z)));
  w.carve(Math.floor(p.x),Math.floor(p.z),.7);
  t.updateHeights();t.updateSurface(game);
  for(const p of t.banks.details.stones){
    const h=surfaceHeight((x,z)=>w.vert(x,z)*LEVEL,p.x,p.z);
    assert.ok(Math.abs(p.y-h-p.size*.2)<1e-8);
  }
  for(const mesh of t.banks.meshes){
    assert.ok(mesh.instanceMatrix.array.every(Number.isFinite));
    assert.ok(mesh.instanceColor.array.every(Number.isFinite));
  }
  t.setFast(true);
  for(const mesh of t.banks.meshes){
    const n=mesh.instanceMatrix.count;
    assert.equal(mesh.count,mesh.geometry===t.banks.geometries[2]?n:Math.ceil(n/2));
    if(n>20){
      const zs=Array.from({length:mesh.count},(_,i)=>mesh.instanceMatrix.array[i*16+14]);
      const all=Array.from({length:n},(_,i)=>mesh.instanceMatrix.array[i*16+14]);
      assert.ok(Math.max(...zs)-Math.min(...zs)>(Math.max(...all)-Math.min(...all))*.8);
    }
  }
  t.setFast(false);
  assert.ok(t.banks.meshes.every(m=>m.count===m.instanceMatrix.count));
  dispose(t);
});
check('All inland maps produce finite banks; reef seabeds retain their existing appearance', () => {
  for(const map of ['pnw','amazon','serengeti','atlanta','chinandega','sumatra','reef']){
    const {terrain:t}=make(map);
    assert.ok(t.mesh.geometry.attributes.aShore.array.every(Number.isFinite),map);
    if(map==='reef'){
      assert.equal(t.banks.meshes.length,0);
      assert.ok(t.mesh.geometry.attributes.aShore.array.every(v=>v===0));
    }
    dispose(t);
  }
});
console.log(checks+' riverbank checks passed.');
