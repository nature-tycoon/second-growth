import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { T,F,DAYS_PER_YEAR } from '../js/config.js';
import { mulberry32 } from '../js/rng.js';
import { walkSegmentSafe } from '../js/sim/animal-walking.js';
import { trailMask, recordTrailStep } from '../js/sim/animal-trails.js';
import { TRAIL_RESOLUTION } from '../js/data/animal-trails.js';
const change=(a,b)=>Math.abs((a-b)-Math.round((a-b)/(2*Math.PI))*2*Math.PI);
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS '+name)};
function setup(){Math.random=mulberry32(44);const g=new Game();g.newGame(1987,'free','standard','pnw');g.day=20;
 const w=g.world,wl=g.wildlife;wl.agents=[];wl.flyovers=[];wl.recount();wl.passageWait=1e6;
 w.terrain.fill(T.SOIL);w.struct.fill(-1);w.feature.fill(0);w.fire.fill(0);w.flood.fill(0);w.tree.fill(0);w.shrub.fill(0);w.ground.fill(0);w.distWater.fill(99);wl.suit.forEach(s=>s.fill(1));
 const d=g.catalog.animal.deer,a=wl.spawn(d,30,30,{silent:true,age:3*DAYS_PER_YEAR});Object.assign(a,{x:30.5,y:30.5,state:'idle',wait:99,thirst:0,hunger:0,orientation:0,walkHeading:0});return{g,w,wl,a,d};}
function route(s,sx=1,sy=1){const {a,w}=s;a.x=30.5;a.y=30.5;a.orientation=sx>0?0:Math.PI;a.walkHeading=a.orientation;
 const forward=[];for(let k=1;k<=8;k++)forward.push(w.idx(30+sx*k,30));for(let k=1;k<=8;k++)forward.push(w.idx(30+sx*8,30+sy*k));a.path=forward.reverse();a.state='walk';a.restSpot=null;a.wait=0;return w.idx(30+sx*8,30+sy*8);}
function run(s,dt=.05,observe=()=>{}){for(let k=0;k<3000&&s.a.state==='walk';k++){s.wl.update(dt);observe();}assert.equal(s.a.state,'idle','walk finishes');}
check('Open turns are smooth actual motion in all four directions and across frame sizes',()=>{
 for(const sx of [-1,1])for(const sy of [-1,1])for(const dt of [.02,.05,.1]){
  const s=setup(),dest=route(s,sx,sy);let before=[s.a.x,s.a.y],heading=null,max=0,diagonal=0;
  run(s,dt,()=>{const dx=s.a.x-before[0],dy=s.a.y-before[1];if(Math.hypot(dx,dy)>.00001){const h=Math.atan2(dy,dx);if(heading!=null)max=Math.max(max,change(h,heading));heading=h;if(Math.abs(dx)>.005*dt&&Math.abs(dy)>.005*dt)diagonal++;}before=[s.a.x,s.a.y];});
  assert.ok(max<dt*5.1,`heading change ${max} / ${dt}`);assert.ok(diagonal>5,'rounds the corner while moving');
  assert.ok(Math.hypot(s.a.x-(dest%s.w.w+.5),s.a.y-((dest/s.w.w|0)+.5))<1);
 }
});
check('Sharp corridor constraints do not permit cutting a fence, building, pond or fire',()=>{
 for(const obstacle of ['fence','building','pond','fire']){
  const s=setup();route(s);const blocked=s.w.idx(37,31);
  if(obstacle==='fence')s.w.feature[blocked]=F.FENCE;if(obstacle==='building')s.w.struct[blocked]=0;if(obstacle==='pond')s.w.terrain[blocked]=T.POND;if(obstacle==='fire'){s.w.fire[blocked]=3;s.wl.fireCheck=1e6;}
  // One-tile passage forces the animal to turn inside the open corner.
  for(let y=29;y<=39;y++)s.w.struct[s.w.idx(39,y)]=0;
  run(s,.05,()=>{assert.notEqual(s.w.idx(Math.floor(s.a.x),Math.floor(s.a.y)),blocked);assert.ok(s.a.x<39);});
 }
});
check('Swept look-ahead rejects diagonal corner cuts, even when the endpoint is clear',()=>{
 const s=setup();s.a.x=37.8;s.a.y=30.8;s.w.feature[s.w.idx(37,31)]=F.FENCE;
 assert.equal(walkSegmentSafe(s.w,s.a,38.2,31.2),false);s.w.feature[s.w.idx(37,31)]=0;assert.equal(walkSegmentSafe(s.w,s.a,38.2,31.2),true);
});
check('Repeated tracks follow the rounded motion and do not draw an unused grid corner',()=>{
 // (an open L-shaped route is walked as a curve across the corner: sample where the animal actually went)
 const s=setup();let sample=null;
 for(let pass=0;pass<14;pass++){route(s);run(s,.05,()=>{if(s.a.x>35&&s.a.x<36)sample=[s.a.x,s.a.y];});}
 assert.ok(sample);const mask=(x,y)=>trailMask(s.w,s.w.idx(Math.floor(x),Math.floor(y)),x%1,y%1);
 const used=mask(...sample),unused=mask(38.5,30.5);assert.ok(used>.2,`used ${used}`);assert.ok(unused<used*.3,`unused corner ${unused} versus used ${used}`);
});
check('Legacy edge fields cannot invent a visible track; pause and standing leave no raster wear',()=>{
 const s=setup();s.w.trailE=new Float32Array(s.w.n).fill(1);assert.equal(trailMask(s.w,s.w.idx(30,30),.5,.5),0);
 s.wl.update(0);assert.equal(s.w.trailDensity,undefined);s.a.x=30.5;s.a.y=30.5;recordTrailStep(s.wl,s.a,s.d,30.5,30.5);assert.equal(s.w.trailDensity,undefined);
});
check('Continuous tracks save independently, restore at their higher resolution and support legacy saves',()=>{
 const s=setup();route(s);run(s);const save=s.g.saveData();assert.equal(save.world.arrays.trailDensity.n,s.w.n*TRAIL_RESOLUTION**2);
 assert.ok(s.g.restoreSave(save));assert.equal(s.g.world.trailDensity.length,s.w.n*TRAIL_RESOLUTION**2);
 const first=s.g.world.trailDensity.findIndex(v=>v>0),value=s.g.world.trailDensity[first];s.g.world.trailDensity[first]=0;assert.ok(s.g.restoreSave(save));assert.equal(s.g.world.trailDensity[first],value);
 const old=s.g.saveData();delete old.world.arrays.trailDensity;assert.ok(s.g.restoreSave(old));assert.equal(s.g.world.trailDensity,undefined);
});
console.log(`${checks} continuous ground movement checks passed.`);
