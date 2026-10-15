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
// Only the moment of crossing a gap the leap can't clear uses the classic release and catch;
// walking up to it and climbing on afterwards (a caught trunk included) keep the walker rig.
const maximumClassic=.35;
// Steep climbing alternates the feet (a straight trunk is no fork), and a steep trunk is backed down head up.
const maximumPairedClimb=.25,minimumHeadUpDescent=.7;
try {
 for(const speed of [1,2]) {
  const {game}=performanceFixture('amazon','high');
  // Keep the complete ecosystem simulation; render the audited species only.
  Object.defineProperty(game.wildlife,'viewAgents',{get(){return this.agents.filter(a=>game.catalog.animals[a.sp]?.key==='howler');}});
  const scene=new THREE.Scene(),flora=new Flora(scene);flora.rebuild(game,true);
  const actors=new Actors(scene,flora),right=new THREE.Vector3(1,0,0);
  let time=1;actors.update(game,right,time);game.speed=speed;
  const crossings=new Map();let moving=0,classic=0,rearSteps=0,rearPaired=0,descent=0,headUp=0;const last=new Map();
  for(let frame=0;frame<seconds*fps;frame++) {
   game.day+=SPEEDS[speed]/fps;game.wildlife.update(SPEEDS[speed]/fps);time+=1/fps;
   actors.update(game,right,time);
   for(const a of game.wildlife.agents) {
    if(game.catalog.animals[a.sp]?.key!=='howler')continue;
    const st=actors.pose.get(a.id),route=st?.branchRoute || st?.howlerJump?.route;
    if(st?.branchRoute){moving++;if(st.walkerClassicTransfer)classic++;}
    if(st?.branchPoint&&st.gripFeet&&st.canopyQuaternion){const prev=last.get(a.id);last.set(a.id,st.branchPoint.clone());
     const d=prev&&st.branchPoint.clone().sub(prev),l=d?.length();
     if(l>1e-4&&!st.howlerJump&&!st.walkerClassicTransfer&&Math.abs(d.y)/l>.7){
      const swing=st.gripFeet.map(f=>!!f.from);if(swing[2]||swing[3]){rearSteps++;if(swing[2]&&swing[3])rearPaired++;}
      if(d.y<0){descent++;if(new THREE.Vector3(1,0,0).applyQuaternion(st.canopyQuaternion).y>.2)headUp++;}}}
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
  console.log(JSON.stringify({speed,crossings:crossings.size,branches:branch.length,flight,clear:branch.filter(s=>s.clear).length,prepare:branch.filter(s=>s.prepare).length,trunkReach:[...crossings.values()].filter(s=>s.trunk&&s.reach).length,classicShare:+(classic/Math.max(1,moving)).toFixed(2),pairedClimb:+(rearPaired/Math.max(1,rearSteps)).toFixed(2),headUpDescent:+(headUp/Math.max(1,descent)).toFixed(2)}));
  if(!process.argv.includes('--audit')) {
   assert.ok(branch.length>=20,'grown Amazon exercises multiple non-trunk crossings');
   assert.ok(flight>=10 && flight/branch.length>=minimumShare,'at least 40% of all real non-trunk crossings show arms-out flight');
   assert.ok(rearSteps>200 && rearPaired/rearSteps<=maximumPairedClimb,`steep climbing alternates the feet (${rearPaired} of ${rearSteps} rear steps paired)`);
   assert.ok(descent>200 && headUp/descent>=minimumHeadUpDescent,`steep trunks are backed down head up (${headUp} of ${descent} frames)`);
   assert.ok(moving>1000 && classic/moving<=maximumClassic,`moving howlers keep the walker rig outside unleapable gaps (classic ${classic} of ${moving} frames)`);
  }
  assert.ok([...crossings.values()].some(s=>s.trunk&&s.reach),'grown forest exercises arms-out trunk catches');
  if(process.argv.includes('--audit'))console.log(JSON.stringify(branch.filter(s=>s.prepare&&!s.flight)));
  actors.clear();
 }
} finally {Math.random=random;}
