import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { canopyFixture } = await import('./canopy-support-fixture.mjs');
const { Flora } = await import('../js/render3d/flora.js');
const { Actors } = await import('../js/render3d/actors.js');
const { PLANT } = await import('../js/data/plants.js');
const { howlerJoint, HOWLER_PLACEMENT } = await import('../js/render3d/howler-motion.js');
const { bodyFitsWood, woodDistance } = await import('../js/render3d/wood-clearance.js');

const animal=process.argv.find(a=>a.startsWith('--animal='))?.split('=')[1] || 'howler',map=animal==='langur'?'sumatra':['congo','capuchin'].includes(animal)?'chinandega':'amazon';
const nativeTree=map==='amazon'?'fig':map==='sumatra'?'meranti':'guanacaste';
let cases = 0;
for (const route of (process.argv.includes('--trunk')?['trunk']:['branch','fork','trunk'])) for (const fps of [15, 60]) for (const speed of [1, 3]) {
  const { game, a } = canopyFixture(map, animal);
  for (const x of [40,41]) game.world.setPlant(game.world.idx(x,32),PLANT[nativeTree],1);
  if (route === 'trunk') { game.world.setPlant(game.world.idx(40,32),PLANT[map==='amazon'?'kapok':nativeTree],1);game.world.setPlant(game.world.idx(41,32),PLANT[nativeTree],.3); }
  a.x=40.5;a.y=32.5;a.state='walk';
  const scene=new THREE.Scene(),flora=new Flora(scene);flora.rebuild(game,true);
  const actors=new Actors(scene,flora,{canopyWalkerMotion:true}),site=flora.treeSites.get(game.world.idx(40,32));site.prepare();
  let time=1;
  const branch=site.branches.map((b,i)=>({b,i})).filter(({b})=>Math.abs(b.dir.y)<.65).sort((a,b)=>b.b.length-a.b.length)[0]?.i||0;
  const other=site.branches.findIndex((b,i)=>i>0&&b.from.distanceTo(site.branches[0].from)<.001);
  if(route!=='trunk')site.anchor=(x,z,previous,reach,hanging,body)=>site.endpoint(route==='branch'?branch:time>=1.1?other:0,route==='branch'&&time<1.1?0:1,{reach,hanging,body});
  if(route==='trunk'){
    const trunk=site.trunks.reduce((a,b)=>a.length>b.length?a:b);
    site.anchor=(x,z,previous,reach,hanging,body)=>{const point=trunk.from.clone().lerp(trunk.to,time<1.1?.75:.35);point.x+=Math.max(trunk.r0,trunk.r1)+.05;return site.trunkAnchors(point,{reach,hanging,body}).find(a=>site.trunks[a.trunk]===trunk);};
  }
  actors.update(game,new THREE.Vector3(1,0,0),time);game.speed=speed;
  const st=actors.pose.get(a.id),mo=[...actors.fauna.species.values()].find(p=>p.motion.canopyWalkerMotion).motion;
  let placements=0,complete=0,weight=0,travel=0,intersections=0,shortened=0,overlap=false;
  let unsupported=0, turnFrames=0, worst=4;
  let rootChanges=0,turnChanges=0,footChanges=0;
  const velocity=new THREE.Vector3(),angularVelocity=new THREE.Vector3();
  const footVelocity=Array.from({length:4},()=>new THREE.Vector3());
  let startupWeightStep=0;
  const starts=new Map(); let finished=false, finishTime=0, turnFinishTime=0;
  for(let frame=1;frame<=fps*45;frame++) {
    time+=1/fps;
    const oldPose=st.canopyQuaternion.clone();
    const previousWeight=st.howlerBody.clone();
    const previousFeet=st.gripFeet.map(f=>({planted:!f.free&&!f.from,point:f.point.clone(),placements:f.placements}));
    const before=st.branchPoint.clone(), wasCrossing=st.branchRoute?.cursor===st.branchRoute?.gap&&!!st.branchRoute;
    actors.update(game,new THREE.Vector3(1,0,0),time);
    if(route==='fork'&&fps===60&&time>1.1&&time<1.4)startupWeightStep=Math.max(startupWeightStep,st.howlerBody.distanceTo(previousWeight)/mo.len);
    if(route==='fork'&&fps===60&&speed===1){
      const v=st.branchPoint.clone().sub(before).multiplyScalar(fps),dq=oldPose.clone().invert().multiply(st.canopyQuaternion);
      if(dq.w<0)dq.set(-dq.x,-dq.y,-dq.z,-dq.w);
      const w=new THREE.Vector3(dq.x,dq.y,dq.z),length=w.length();
      w.multiplyScalar(length>1e-10?2*Math.atan2(length,dq.w)/length*fps:0);
      if(time>1.2){rootChanges+=v.distanceToSquared(velocity);turnChanges+=w.distanceToSquared(angularVelocity);}
      velocity.copy(v);angularVelocity.copy(w);
      for(let i=0;i<4;i++) {
        const speed=st.gripFeet[i].point.clone().sub(previousFeet[i].point).multiplyScalar(fps);
        if(time>1.2)footChanges+=speed.distanceToSquared(footVelocity[i]);
        footVelocity[i].copy(speed);
      }
    }
    if(st.canopyQuaternion.angleTo(oldPose)>1e-4){
      turnFrames++;const contacts=st.gripFeet.filter(f=>!f.from&&!f.free).length;worst=Math.min(worst,contacts);
      if(!st.gripFeet.slice(0,2).some(f=>!f.from&&!f.free)||!st.gripFeet.slice(2).some(f=>!f.from&&!f.free))unsupported++;
    }
    const swings=st.gripFeet.map((f,i)=>f.from?i:-1).filter(i=>i>=0);
    if(route==='fork')assert.ok(st.gripFeet.filter(f=>!f.free&&!f.from).length>=2,'every frame of the fork handover retains two planted bark contacts, including straight movement');
    assert.ok(swings.length<=2,'placements never lift all four limbs at once');
    if(swings.length===2){overlap=true;if(!st.howlerForkTurn)assert.ok((swings[0]<2)!==(swings[1]<2),'branch walking alternates hands rather than lifting both together');}
    travel+=st.branchPoint.distanceTo(before);weight=Math.max(weight,st.howlerBody.length()/mo.len);
    const crossing=st.branchRoute?.cursor===st.branchRoute?.gap&&!!st.branchRoute;
    if(!crossing&&!wasCrossing&&!st.canopyLeap)assert.ok(st.branchPoint.distanceTo(before)<=mo.len*st.sc*(st.howlerForkTurn?2:1.5)/fps+1e-6,'body pace stays within the readable step clock');
    for(let i=0;i<4;i++) {
      const foot=st.gripFeet[i];
      if(foot.from&&!starts.has(i)){placements++;starts.set(i,time);}
      if(!foot.from&&starts.has(i)){
        if(!foot.free){complete++;assert.ok(time-starts.get(i)+1/fps>=HOWLER_PLACEMENT-1e-6,'fast speed cannot skip the placement');}
        else shortened++;
        starts.delete(i);
      }
    }
    const pool=[...actors.fauna.species.values()].find(p=>p.motion===mo),matrix=new THREE.Matrix4();pool.mesh.getMatrixAt(0,matrix);
    for(let i=0;i<4;i++){
      const target=mo.canopyFeet[i].clone().add(st.gripOffsets[i]);
      const solved=howlerJoint(mo.howlerRoots[i],mo.howlerBends[i],mo.howlerTips[i],target);
      assert.ok(Math.abs(solved.root.distanceTo(solved.joint)-mo.howlerLengths[i][0])<1e-6,'upper bone preserves length');
      assert.ok(Math.abs(solved.joint.distanceTo(solved.tip)-mo.howlerLengths[i][1])<1e-6,'lower bone preserves length');
      if(!st.gripFeet[i].free&&!st.gripFeet[i].from){
        assert.ok(solved.tip.clone().applyMatrix4(matrix).distanceTo(st.gripFeet[i].point)<5e-6,'the rendered toes stay on the world-space bark grip');
        if(previousFeet[i].planted && previousFeet[i].placements===st.gripFeet[i].placements)assert.ok(previousFeet[i].point.distanceTo(st.gripFeet[i].point)<1e-8,'torso turns cannot drag a planted grip off the branch');
        assert.ok(target.distanceTo(solved.tip)<.002,'the solved hand or foot reaches its actual planted grip');
        assert.ok(Math.min(...st.gripFeet[i].site.wood.map(b=>Math.abs(woodDistance(st.gripFeet[i].point,b))))<.003,'planted grips touch actual bark');
      }
    }
    const wood=[...new Set([st.branchAt.site,st.branchRoute?.target.site,st.branchRoute?.fromSite])].filter(Boolean).flatMap(s=>s.wood);
    const weighted=st.branchPoint.clone().add(st.howlerBody.clone().multiplyScalar(st.sc).applyQuaternion(st.canopyQuaternion));
    if(st.canopyLeap)weighted.y+=st.canopyLeap.lift;
    if(!bodyFitsWood({motion:mo,scale:st.sc},weighted,st.canopyQuaternion,wood))intersections++;
    if(frame===fps*2){
      const body=st.howlerBody.clone(),point=st.branchPoint.clone(),phase=st.branchPhase,feet=st.gripFeet.map(f=>f.point.clone());
      game.speed=0;time+=.5;actors.update(game,new THREE.Vector3(1,0,0),time);
      assert.ok(st.howlerBody.equals(body)&&st.branchPoint.equals(point),'pause freezes the weight transfer and body');
      assert.equal(st.branchPhase,phase);feet.forEach((p,i)=>assert.ok(p.distanceTo(st.gripFeet[i].point)<1e-8,'pause freezes each contact'));
      game.speed=speed;
    }
    if(time>2&&!st.branchRoute&&st.branchPoint.distanceTo(st.branch.point)<.004){if(!finished)finishTime=time;finished=true;a.state='idle';}
    const facing=new THREE.Euler().setFromQuaternion(st.canopyQuaternion,'YZX').y;
    const yawError=Math.abs(Math.atan2(Math.sin(facing-st.yaw),Math.cos(facing-st.yaw)));
    if(finished && !turnFinishTime && st.howlerResting && !st.gripFeet.some(f=>f.from) && (route!=='branch'||yawError<.03))turnFinishTime=time;
  }
  if(turnFrames)assert.ok(worst>=2,'body turns retain at least two bark contacts');
  if(route==='branch')assert.equal(unsupported,0,'a turn along a branch retains front and rear support');
  complete=st.gripFeet.reduce((sum,f)=>sum+(f.catches||0),0);
  placements=st.gripFeet.reduce((sum,f)=>sum+(f.placements||0),0);
  assert.ok(placements>0&&complete>0&&weight>.005&&travel>.1,'the prototype actually steps and shifts its weight');
  assert.ok(finished,'the route must finish');
  if(route==='fork')assert.equal(shortened,0,'fork handovers complete each committed placement without dropping a contact out of reach');
  if(animal==='howler'&&route==='fork')assert.ok(placements<=48,'the fork handover avoids a flurry of tiny corrective placements');
  assert.ok(overlap,'placements overlap instead of stopping the torso for a four-part march');
  if(route==='trunk')assert.ok(st.gripFeet.every(f=>f.catches>0&&!f.free),'both hands and both feet catch bark during the trunk descent and settle on it');
  assert.ok(finishTime<(animal==='howler' ? (route==='trunk'?6:route==='fork'?5:3.5) : 3.5+travel/(mo.len*st.sc*.6)),'supported turns finish without stalls or slowing straight walking');
  assert.ok(weight<.05,'weight movement stays subtle');
  assert.equal(intersections,0,'weight shifts and route steps must keep the torso clear of actual wood');
  assert.ok(st.canopyQuaternion.angleTo(st.canopyGoal)<.015,'the turn must finish facing its goal before resting');
  assert.ok(turnFinishTime>0 && turnFinishTime<finishTime+7,'the complete turn must finish promptly after arrival');
  if(route==='fork')assert.ok(turnFinishTime<finishTime+2,'the fork turn progresses during the crossing rather than being postponed until arrival');
  if(animal==='howler'&&route==='fork'&&fps===60&&speed===1){
    // The previous supported crossing scored 2.15 for travel and 205.9 for
    // turning: repeated full-speed / stopped changes were visible as jerks.
    assert.ok(rootChanges<1.5&&turnChanges<60,'the real fork trajectory eases travel and turning rather than repeatedly snapping between moving and stopped');
    assert.ok(footChanges<25,'grip lift and longer-reach timing reduce abrupt changes in the rendered hand/foot motion');
  }
  if(route==='fork'&&fps===60)assert.ok(startupWeightStep<.008,'the opening frames do not pop into and out of a deep crouch');
  assert.ok(!st.gripFeet.some(f=>f.from),'rest finishes its final placement and stops seeking new grips');
  const rest=st.center.clone(),posture=st.howlerBody.clone();
  for(let f=1;f<=fps;f++)actors.update(game,new THREE.Vector3(1,0,0),time+f/fps);
  assert.ok(st.center.distanceTo(rest)<1e-5&&st.howlerBody.distanceTo(posture)<1e-7,'a settled rest stays still');
  console.log(`PASS ${animal}, ${route}, ${fps}fps, speed ${speed}: ${complete}/${placements} catches, ${shortened} released steps, ${(weight*100).toFixed(1)}% body-length shift, ${finishTime.toFixed(2)}s arrival, ${turnFinishTime.toFixed(2)}s complete turn, ${intersections} body intersections`);
  actors.clear();cases++;
}
// Verify a neutral target reproduces the built elbow/knee, and small target
// changes never flip the hinge plane. This exercises the close-up arm defect.
{
 const {game,a}=canopyFixture('amazon','howler'),scene=new THREE.Scene(),flora=new Flora(scene);flora.rebuild(game,true);
 const actors=new Actors(scene,flora,{canopyWalkerMotion:true});actors.update(game,new THREE.Vector3(1,0,0),1);
 const pool=[...actors.fauna.species.values()][0],mo=pool.motion;
 for(let i=0;i<4;i++){
  const root=mo.howlerRoots[i],bend=mo.howlerBends[i],tip=mo.howlerTips[i];
  assert.ok(howlerJoint(root,bend,tip,tip).joint.distanceTo(bend)<1e-6,'neutral IK preserves the modeled elbow');
  const parts=pool.geo.attributes.aPart,pivots=pool.geo.attributes.aPivot;
  let upper=0,lower=0;
  for(let v=0;v<parts.count;v++)if(parts.getX(v)===i+1){
   const pivot=new THREE.Vector3().fromBufferAttribute(pivots,v);
   if(pivot.distanceTo(bend)<1e-5)lower++;else {assert.ok(pivot.distanceTo(root)<1e-5);upper++;}
  }
  assert.ok(upper>0&&lower>0,'upper and lower segments carry distinct joint pivots');
  let previous;
  for(let n=0;n<=400;n++){
   const t=n/400*Math.PI*2,target=tip.clone().add(new THREE.Vector3(Math.sin(t)*.12,.04+Math.cos(t)*.03,Math.sin(t*2)*.03).multiplyScalar(mo.len));
   const joint=howlerJoint(root,bend,tip,target).joint;
   if(previous)assert.ok(joint.distanceTo(previous)<mo.len*.02,'small hand movements cannot flip an elbow');
   previous=joint;
  }
 }
 actors.clear();console.log('PASS joint pivots, neutral anatomy and continuous elbow/knee bends');
}
// The legacy comparison can explicitly disable the shared walker motion.
{
 const {game,a}=canopyFixture('amazon','howler'),scene=new THREE.Scene(),flora=new Flora(scene);flora.rebuild(game,true);
 const actors=new Actors(scene,flora,{canopyWalkerMotion:false});actors.update(game,new THREE.Vector3(1,0,0),1);
 assert.ok([...actors.fauna.species.values()].every(p=>!p.motion.canopyWalkerMotion),'the comparison can retain the old animation');actors.clear();
}
console.log(`${cases} howler prototype scenarios passed.`);
