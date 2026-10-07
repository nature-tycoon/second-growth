// node tools/plant-performance-check.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Flora } = await import('../js/render3d/flora.js');
import { MAPS, plantFixture, editPlants, growPlants, restoreNativeTree } from './plant-performance-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { floraChunkKey } from '../js/render3d/flora-changes.js';
Math.random = mulberry32(1987);
let checks = 0;
const report = [];
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
function make(size, incremental) { const f = new Flora(new THREE.Scene(), { chunkSize:size, incremental }); f.setZoom(.8); return f; }
function same(a,b,label) {
  for (const key of new Set([...a.pools.keys(), ...b.pools.keys()])) {
    const pa=a.pools.get(key),pb=b.pools.get(key);
    for (const k of new Set([...(pa?.subs.keys()||[]),...(pb?.subs.keys()||[])])) {
      const x=pa?.subs.get(k),y=pb?.subs.get(k); assert.equal(x?.n||0,y?.n||0,label+'/'+key+'/'+k);
      if(!x?.n)continue;
      assert.deepEqual(x.mesh.instanceMatrix.array.slice(0,x.n*16),y.mesh.instanceMatrix.array.slice(0,y.n*16),label+'/'+key+'/matrices');
      assert.deepEqual(x.mesh.instanceColor.array.slice(0,x.n*3),y.mesh.instanceColor.array.slice(0,y.n*3),label+'/'+key+'/colours');
    }
  }
}
function dispose(f) {
  for(const p of f.pools.values())for(const s of p.subs.values())s.dispose();
  const geos = new Set();
  for(const value of f.geos.values())for(const part of [value,...Object.values(value),...Object.values(value.lo||{})])if(part?.isBufferGeometry)geos.add(part);
  for(const geo of geos)geo.dispose();
  for(const m of [f.foliage,f.shrubs,f.grass,f.tallGrass,f.bark,f.small])m.dispose();
}
check('The default game renderer uses 48-tile groups and updates only changed regions',()=>{
  const g=plantFixture('pnw'),f=new Flora(new THREE.Scene()),reference=make(48,true);
  assert.equal(f.chunkSize,48);assert.equal(f.incremental,true);f.setZoom(.8);
  f.rebuild(g);reference.rebuild(g,true);same(f,reference,'default initial');
  editPlants(g,35,35);f.rebuild(g);reference.rebuild(g,true);same(f,reference,'default edit');
  assert.equal(f.lastRebuild.full,false);assert.ok(f.lastRebuild.tiles<g.world.n);
  f.rebuild(g);assert.equal(f.lastRebuild.tiles,0);dispose(f);dispose(reference);
});
check('World swaps and restored worlds rebuild fully instead of reusing stale plant graphics',()=>{
  const g=plantFixture('pnw'),other=plantFixture('pnw'),f=new Flora(new THREE.Scene()),reference=make(48,true);
  f.setZoom(.8);f.rebuild(g);
  editPlants(other,61,61);f.rebuild(other);reference.rebuild(other,true);
  assert.equal(f.lastRebuild.full,true);same(f,reference,'swapped world');
  f.rebuild(g);reference.rebuild(g,true);assert.equal(f.lastRebuild.full,true);same(f,reference,'restored world');
  g.world.carve(35,35,.3);f.rebuild(g);assert.equal(f.lastRebuild.full,true);
  g.day=100;f.rebuild(g);assert.equal(f.lastRebuild.full,true);
  f.setLight(true);f.rebuild(g);assert.equal(f.lastRebuild.full,true);
  dispose(f);dispose(reference);
});
for(const size of [48,24]) for(const map of MAPS) check(map+' / '+size+': changed-region results match complete rebuilds',()=>{
  const g=plantFixture(map),a=make(size,true),b=make(size,true);
  const data=JSON.stringify(g.world.tree),rng=g.rng.state();a.rebuild(g);b.rebuild(g,true);same(a,b,'initial');
  assert.equal(JSON.stringify(g.world.tree),data);assert.equal(g.rng.state(),rng);
  const versions=[...a.pools.values()].flatMap(p=>[...p.subs.values()].filter(s=>s.mesh).map(s=>[s.mesh.instanceMatrix,s.mesh.instanceMatrix.version]));
  a.rebuild(g);assert.equal(a.lastRebuild.tiles,0);assert.ok(versions.every(([attr,v])=>attr.version===v));
  for(const [name,edit] of [
    ['local and neighbouring features',()=>editPlants(g)],
    ['new plant / pool',()=>restoreNativeTree(g,57,45)],
    ['plant removal',()=>g.world.clearPlants(g.world.idx(57,45))],
    ['surrounding forest',()=>{const i=g.border.bi(-1,20);g.border.treeG[i]=.25;g.border.tree[i]=g.world.tree.find(x=>x)||g.border.tree.find(x=>x);}],
    ['daily succession',()=>growPlants(g)],
    ['summer flowers and fruit',()=>g.day=50],
    ['autumn and seed heads',()=>g.day=80],
    ['winter bare branches',()=>g.day=100],
    ['spring leaves return',()=>g.day=0],
    ['digging and height changes',()=>g.world.carve(34,34,.4)],
    ['graphics setting',()=>{a.setLight(true);b.setLight(true);}],
  ]){edit();a.rebuild(g);b.rebuild(g,true);same(a,b,map+'/'+name);}
  dispose(a);dispose(b);
});
check('Local edits update neighbouring regions, leaving distant buffers untouched',()=>{
  const g=plantFixture('pnw'),f=make(24,true);f.rebuild(g);
  const distant=[...f.pools.values()].flatMap(p=>[...p.subs].filter(([k,s])=>k===floraChunkKey(100,70,24)&&s.mesh).map(([,s])=>[s.mesh.instanceMatrix,s.mesh.instanceMatrix.version]));
  editPlants(g,33,33);f.rebuild(g);assert.equal(f.lastRebuild.full,false);assert.ok(f.lastRebuild.tiles<g.world.n*.3);
  assert.ok(distant.length);assert.ok(distant.every(([a,v])=>a.version===v));dispose(f);
});
check('Alternative group sizes retain exactly the same number of plant parts',()=>{
  const g=plantFixture('pnw');let n=null;
  for(const size of [48,32,24,16,12]){const f=make(size,true);f.rebuild(g);const count=[...f.pools.values()].reduce((n,p)=>n+[...p.subs.values()].reduce((n,s)=>n+s.n,0),0);if(n==null)n=count;assert.equal(count,n);dispose(f);}
});
function median(a){a.sort((a,b)=>a-b);return a[Math.floor(a.length/2)];}
if(!process.argv.includes('--checks-only')) for(const map of ['pnw','amazon','serengeti']) {
  const g=plantFixture(map),variants=[make(48,false),make(48,true),make(32,true),make(24,true)];
  const times=variants.map(()=>({full:[],local:[],daily:[],unchanged:[]}));
  for(const f of variants){f.rebuild(g);f.rebuild(g,true);}
  for(let k=0;k<5;k++){
    const order=k%2?[0,1,2,3]:[3,2,1,0];
    for(const key of ['full','unchanged','local','daily']){
      if(key==='local')editPlants(g,k%2?35:61,k%2?35:61);
      if(key==='daily')growPlants(g);
      for(const n of order){const t=performance.now();variants[n].rebuild(g,key==='full');times[n][key].push(performance.now()-t);}
    }
  }
  for(let n=0;n<variants.length;n++){
    const f=variants[n],row={map,size:f.chunkSize,incremental:f.incremental,...Object.fromEntries(Object.entries(times[n]).map(([k,a])=>[k,median(a)]))};report.push(row);
    console.log(`${map}, ${row.size}${row.incremental?' local updates':' original'}: full ${row.full.toFixed(1)} ms; local ${row.local.toFixed(1)} ms; daily ${row.daily.toFixed(1)} ms; unchanged ${row.unchanged.toFixed(1)} ms.`);dispose(f);
  }
}
console.log(`${checks} plant performance checks passed.`);
if(report.length)console.log(JSON.stringify(report));
