import assert from 'node:assert/strict';
import { register } from 'node:module';register('./three-loader.mjs',import.meta.url);
const THREE=await import('three');
const {Terrain}=await import('../js/render3d/terrain.js');
const {Flora}=await import('../js/render3d/flora.js');
import { Game } from '../js/game.js';
import { TRAIL_RESOLUTION as R } from '../js/data/animal-trails.js';
import { T } from '../js/config.js';
import { mulberry32 } from '../js/rng.js';
import { plantFixture } from './plant-performance-fixtures.mjs';
globalThis.document={createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})})};
const atlas={tex:null,uv:{},slot:{}};for(let season=0;season<4;season++)for(const t of Object.values(T)){atlas.uv[t+'|'+season+'|0']=[0,0,.1,.1];atlas.slot[t+'|'+season+'|0']=t%16;}
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS '+name)};
function wear(w){w.trailE=new Float32Array(w.n);w.trailS=new Float32Array(w.n);w.trod=new Float32Array(w.n);w.trailDensity=new Float32Array(w.n*R*R);for(let x=27;x<=54;x++){const j=w.idx(x,40);w.terrain[j]=T.SOIL;w.struct[j]=-1;w.flood[j]=0;w.feature[j]=0;w.trailE[j]=.9;w.trod[j]=.9;for(let sy=1;sy<=2;sy++)for(let sx=0;sx<R;sx++)w.trailDensity[(40*R+sy)*w.w*R+x*R+sx]=.9;}}
check('Partial and banded surface paints update trail texture identically to a full paint',()=>{
 const g=new Game();g.newGame(1987);const w=g.world,t=new Terrain(new THREE.Scene(),atlas);t.setWorld(w,g.border);t.updateSurface(g);wear(w);
 t.updateSurface(g,{x0:26,y0:39,x1:56,y1:41});const patch=t.trailData.slice();t.updateSurface(g);assert.deepEqual(t.trailData,patch);
 g.day++;for(const band of t.dayBands(g))t.updateSurface(g,band);const banded=t.trailData.slice();t.updateSurface(g);assert.deepEqual(t.trailData,banded);
 const k=((40-t.Y0)*R+1)*t.TW*R+(40-t.X0)*R;assert.ok(t.trailData[k]>200);assert.ok(t.trailData[k+2]>200);assert.equal(t.trailData[k-t.TW*R],0);
});
check('Terrain changes remove trail visuals immediately and the shader supports Fast and snow',()=>{
 const g=new Game();g.newGame(1987);const w=g.world,t=new Terrain(new THREE.Scene(),atlas);wear(w);t.setWorld(w,g.border);t.updateSurface(g);
 const k=((40-t.Y0)*R+1)*t.TW*R+(40-t.X0)*R;w.terrain[w.idx(40,40)]=T.POND;t.updateSurface(g,{x0:40,y0:40,x1:40,y1:40});assert.deepEqual([...t.trailData.slice(k,k+4)],[0,0,0,0]);
 const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <color_fragment>'};t.material.onBeforeCompile(shader);
 assert.ok(shader.fragmentShader.includes('gameTrail(gp)'));assert.ok(shader.fragmentShader.indexOf('gameTrail(gp)')<shader.fragmentShader.indexOf('if (uSnow > 0.01)'));assert.equal(shader.uniforms.uTrailDensity,t.tiles.density);
 t.setFast(true);assert.equal(t.material.defines.GROUND_FAST,1);
});
check('Plant openings follow the narrow track and incremental replay matches a full rebuild',()=>{
 Math.random=mulberry32(1987);const g=plantFixture('pnw'),w=g.world;
 const p=g.catalog.plants.find(p=>p&&p.layer===0&&p.look.type==='grass');
 for(let y=38;y<=42;y++)for(let x=27;x<=54;x++){const j=w.idx(x,y);w.terrain[j]=T.SOIL;w.tree[j]=0;w.shrub[j]=0;w.ground[j]=p.id;w.groundG[j]=1;w.feature[j]=0;w.struct[j]=-1;}
 const a=new Flora(new THREE.Scene()),b=new Flora(new THREE.Scene());a.rebuild(g,true);
 const before=[...a.pools.values()].reduce((n,p)=>n+[...p.subs.values()].reduce((sum,s)=>sum+s.n,0),0);wear(w);a.rebuild(g,false);b.rebuild(g,true);
 let after=0;for(const [key,pool] of a.pools)for(const [region,sub]of pool.subs){const other=b.pools.get(key)?.subs.get(region);assert.equal(sub.n,other?.n||0);for(let k=0;k<sub.n;k++){assert.deepEqual([...sub.m[k]],[...other.m[k]]);assert.deepEqual(sub.c[k],other.c[k]);}after+=sub.n;}
 assert.ok(after<before,`trail clears groundcover (${before} -> ${after})`);
});
console.log(`${checks} trail rendering checks passed.`);
