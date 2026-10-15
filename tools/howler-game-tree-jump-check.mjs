import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./three-loader.mjs',import.meta.url);
const THREE=await import('three');
const {performanceFixture}=await import('./performance-fixtures.mjs');
const {Flora}=await import('../js/render3d/flora.js');
const {Actors}=await import('../js/render3d/actors.js');
const {SPEEDS}=await import('../js/config.js');
const random=Math.random;
const fps=30,seconds=180;
// Crowded or unsupported launches may still use the clamber fallback. Require
// the leap to be a common real-tree behavior, not a single lucky pole-like gap.
const minimumShare=.4;
try {
 for(const speed of [1,2]) {
  const {game}=performanceFixture('amazon','high');
  // Keep the complete ecosystem simulation; render the audited species only.
  Object.defineProperty(game.wildlife,'viewAgents',{get(){return this.agents.filter(a=>game.catalog.animals[a.sp]?.key==='howler');}});
  const scene=new THREE.Scene(),flora=new Flora(scene);flora.rebuild(game,true);
  const actors=new Actors(scene,flora),right=new THREE.Vector3(1,0,0);
  let time=1;actors.update(game,right,time);game.speed=speed;
  const crossings=new Map();
  for(let frame=0;frame<seconds*fps;frame++) {
   game.day+=SPEEDS[speed]/fps;game.wildlife.update(SPEEDS[speed]/fps);time+=1/fps;
   actors.update(game,right,time);
   for(const a of game.wildlife.agents) {
    if(game.catalog.animals[a.sp]?.key!=='howler')continue;
    const st=actors.pose.get(a.id),route=st?.branchRoute || st?.howlerJump?.route;
    if(!route || route.gap<1)continue;
    let sample=crossings.get(route);
    if(!sample)crossings.set(route,sample={trunk:route.trunkTransfer,flight:false,prepare:false,clear:route.walkerJumpClear,ready:null,reach:false});
    if(st.howlerJump?.phase==='prepare'){const j=st.howlerJump,forward=new THREE.Vector3(1,0,0).applyQuaternion(st.canopyQuaternion),direction=j.to.clone().sub(j.from);forward.y=direction.y=0;sample.ready={facing:forward.normalize().dot(direction.normalize()),feet:st.gripFeet.map(f=>!f.free&&!f.from),wait:j.prepareWait};}
    const airborne=st.canopyLeap?.t>.1 && st.canopyLeap.t<.9;
    if(airborne) {
     const mo=st.branchAt.body.motion;
     assert.ok(st.gripFeet.every(f=>f.free&&!f.site),'real flight releases all bark contacts');
     const arms=[0,1].every(i=>mo.canopyFeet[i].clone().add(st.gripOffsets[i]).distanceTo(mo.canopyJoints[i])/(mo.howlerLengths[i][0]+mo.howlerLengths[i][1])>.95);
     if(sample.trunk) {assert.ok(arms,'trunk flight reaches with both arms');sample.reach=true;}
     if(st.howlerJump?.phase==='flight') {assert.ok(arms,'branch flight reaches with both arms');sample.flight=true;}
    }
    sample.prepare ||= st.howlerJump?.phase==='prepare';
   }
  }
  const branch=[...crossings.values()].filter(s=>!s.trunk),flight=branch.filter(s=>s.flight).length;
  console.log(JSON.stringify({speed,crossings:crossings.size,branches:branch.length,flight,clear:branch.filter(s=>s.clear).length,prepare:branch.filter(s=>s.prepare).length,trunkReach:[...crossings.values()].filter(s=>s.trunk&&s.reach).length}));
  if(!process.argv.includes('--audit')) {
   assert.ok(branch.length>=20,'grown Amazon exercises multiple non-trunk crossings');
   assert.ok(flight>=10 && flight/branch.length>=minimumShare,'at least 40% of all real non-trunk crossings show arms-out flight');
  }
  assert.ok([...crossings.values()].some(s=>s.trunk&&s.reach),'grown forest exercises arms-out trunk catches');
  if(process.argv.includes('--audit'))console.log(JSON.stringify(branch.filter(s=>s.prepare&&!s.flight)));
  actors.clear();
 }
} finally {Math.random=random;}
