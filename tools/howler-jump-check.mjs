import assert from 'node:assert/strict';
import { register } from 'node:module';register('./three-loader.mjs',import.meta.url);
const THREE=await import('three');
const {howlerJumpFixture}=await import('./howler-jump-fixture.mjs');
const {HOWLER_CROUCH,HOWLER_PUSH,HOWLER_LANDING,howlerJumpGate}=await import('../js/render3d/howler-jump.js');
const {bodyFitsWood,woodDistance}=await import('../js/render3d/wood-clearance.js');
const {howlerJoint}=await import('../js/render3d/howler-motion.js');

// A moving fourth limb must not veto three genuine bark contacts. Exercise
// either hand and either rear foot as that moving limb, plus insufficient
// support and a backwards departure heading.
for(const moving of [0,1,2,3]) {
 const route={gap:1,points:[new THREE.Vector3(),new THREE.Vector3(.5,0,0)],walkerJumpClear:true};
 const st={canopyQuaternion:new THREE.Quaternion(),howlerBody:new THREE.Vector3(),
  gripFeet:[0,1,2,3].map(i=>({free:false,from:i===moving?new THREE.Vector3():null}))};
 howlerJumpGate(st,route,HOWLER_CROUCH);
 assert.equal(st.howlerJump.phase,'push','three planted contacts start a push while the fourth repositions');
 assert.equal(st.howlerJump.pushContacts[moving],false,'the moving limb is not treated as a planted push contact');
}
for(const backwards of [false,true]) {
 const route={gap:1,points:[new THREE.Vector3(),new THREE.Vector3(.5,0,0)],walkerJumpClear:true};
 const st={canopyQuaternion:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),backwards?Math.PI:0),howlerBody:new THREE.Vector3(),
  gripFeet:[0,1,2,3].map(i=>({free:!backwards&&i<2,from:null}))};
 howlerJumpGate(st,route,HOWLER_CROUCH);
 assert.equal(st.howlerJump.phase,'prepare','insufficient support or backward facing stays in preparation');
 howlerJumpGate(st,route,1.5);
 assert.equal(st.howlerJump,null,'an unusable launch falls back without waiting indefinitely');
}
{
 const route={gap:1,points:[new THREE.Vector3(),new THREE.Vector3(.5,0,0)],walkerJumpClear:true};
 const st={howlerJump:{route,phase:'flight',elapsed:0,duration:.5,from:route.points[0],to:route.points[1]}};
 howlerJumpGate(st,route,1.5);
 assert.equal(st.howlerJump,null,'a blocked airborne torso cannot remain in flight indefinitely');
 assert.equal(route.walkerJumpClear,false,'blocked flight returns to the existing transfer from its accepted position');
}

const animal=process.argv.find(a=>a.startsWith('--animal='))?.split('=')[1] || 'howler',map=animal==='langur'?'sumatra':['congo','capuchin'].includes(animal)?'chinandega':'amazon';
let cases=0;
for(const drop of [0,.15])for(const fps of [15,60])for(const speed of [1,3]){
 const v=howlerJumpFixture(new THREE.Scene(),true,drop,map,animal),{game,a,actors,sites}=v;

 const st=actors.pose.get(a.id),mo=[...actors.fauna.species.values()][0].motion;
 game.speed=speed;a.x=41.4;
 let time=1,phase=null,started=0,preparation=0,push=0,flight=0,landing=0,done=false,crouch=0,impact=0,airFrames=0,firstHand=0,firstFoot=0;
 let minArm=1,legSplit=0,pairedSwing=false,pushFeet=null,crouchExtension=0,pushExtension=0,pushHeight=0,pushForward=0,pushRise=0,previousBody=null,launchDirection=null,arcHeight=0,horizontalGap=0;
 const rearExtension=()=>[2,3].reduce((sum,i)=>sum+mo.canopyFeet[i].clone().add(st.gripOffsets[i]).distanceTo(mo.canopyJoints[i])/(mo.howlerLengths[i][0]+mo.howlerLengths[i][1]),0)/2;
 const seen=new Set(),paused=new Set(),wood=sites.flatMap(s=>{s.prepare();return s.wood;});
 for(let f=0;f<fps*15;f++){
  time+=1/fps;actors.update(game,new THREE.Vector3(1,0,0),time);
  const j=st.howlerJump,next=j?.phase || null;
  if(next!==phase){
   if(phase==='prepare')preparation=time-started;
   if(phase==='push')push=time-started;
   if(phase==='flight')flight=time-started;
   if(phase==='landing')landing=time-started;
   phase=next;started=time-(next==='prepare'?1/fps:0);if(next)seen.add(next);
  }
  if(next==='prepare'){
   crouch=Math.max(crouch,-st.howlerBody.y/mo.len);
   assert.equal(st.canopyLeap,null,'preparation remains on the departure bark');
   assert.ok(st.gripFeet.some(f=>!f.free&&!f.from),'push-off has real support');
   crouchExtension=rearExtension();
  }
  if(next==='push'){
   pushFeet ||= st.gripFeet.slice(2).map(f=>f.point.clone());
   assert.equal(st.canopyLeap,null,'rear toes remain on the departure branch during extension');
   assert.ok(st.gripFeet.slice(0,2).every(f=>f.free&&!f.site),'hands release before the thrust');
   st.gripFeet.slice(2).forEach((foot,i)=>{
    assert.ok(!foot.free&&!foot.from,'both rear legs drive the jump');
    assert.ok(foot.point.distanceTo(pushFeet[i])<1e-8,'rear toes stay fixed during the push');
   });
   pushExtension=Math.max(pushExtension,rearExtension());pushHeight=Math.max(pushHeight,st.howlerBody.y/mo.len);
   pushForward=Math.max(pushForward,(st.howlerBody.x-j.pushFrom.x)/mo.len);
   pushRise=Math.max(pushRise,(st.howlerBody.y-j.pushFrom.y)/mo.len);
  }
  if(next==='flight' && st.canopyLeap?.t>0){
   const reachFraction=i=>mo.canopyFeet[i].clone().add(st.gripOffsets[i]).distanceTo(mo.canopyJoints[i])/(mo.howlerLengths[i][0]+mo.howlerLengths[i][1]);
   minArm=Math.min(minArm,reachFraction(0),reachFraction(1));
   const left=mo.canopyFeet[2].clone().add(st.gripOffsets[2]),right=mo.canopyFeet[3].clone().add(st.gripOffsets[3]);right.z*=-1;
   legSplit=Math.max(legSplit,left.distanceTo(right)/mo.len);
  }
  if(next==='flight' && st.canopyLeap?.t>0){airFrames++;assert.ok(st.gripFeet.every(f=>f.free&&!f.site),'contacts release in flight');}
  if(next==='landing'){impact=Math.max(impact,-st.howlerBody.y/mo.len);if(!firstHand&&st.gripFeet.slice(0,2).some(f=>!f.free&&!f.from))firstHand=time;if(!firstFoot&&st.gripFeet.slice(2).some(f=>!f.free&&!f.from))firstFoot=time;}
  for(let i=0;i<4;i++){
   const target=mo.canopyFeet[i].clone().add(st.gripOffsets[i]),joint=howlerJoint(mo.howlerRoots[i],mo.howlerBends[i],mo.howlerTips[i],target);
   assert.ok(joint.tip.distanceTo(target)<.002,'airborne and landing limbs remain within the joint rig');
   const foot=st.gripFeet[i];
   if(!foot.free&&!foot.from)assert.ok(Math.min(...foot.site.wood.map(b=>Math.abs(woodDistance(foot.point,b))))<.003,'landing contacts touch actual bark');
   if(next==='push'&&i>=2){
    const pool=[...actors.fauna.species.values()].find(p=>p.motion===mo),matrix=new THREE.Matrix4();pool.mesh.getMatrixAt(0,matrix);
    assert.ok(joint.tip.clone().applyMatrix4(matrix).distanceTo(foot.point)<5e-6,'rendered rear toes remain on bark throughout knee extension');
   }
  }
  const body=st.branchPoint.clone().add(st.howlerBody.clone().multiplyScalar(st.sc).applyQuaternion(st.canopyQuaternion));body.y+=st.canopyLeap?.lift || 0;
  if(next==='flight'&&st.canopyLeap){
   horizontalGap=Math.hypot(j.to.x-j.from.x,j.to.z-j.from.z);
   arcHeight=Math.max(arcHeight,body.y-THREE.MathUtils.lerp(j.from.y,j.to.y,st.canopyLeap.t));
   if(!launchDirection&&previousBody)launchDirection=body.clone().sub(previousBody);
  }
  previousBody=body.clone();
  assert.ok(bodyFitsWood({motion:mo,scale:st.sc},body,st.canopyQuaternion,wood),'crouch, flight and impact keep the torso clear of wood');
  if(next && !paused.has(next) && j.elapsed>.05){
   const center=st.center.clone(),q=st.canopyQuaternion.clone(),elapsed=j.elapsed,feet=st.gripFeet.map(f=>f.point.clone());
   game.speed=0;time+=.3;actors.update(game,new THREE.Vector3(1,0,0),time);
   assert.ok(center.distanceTo(st.center)<1e-8&&q.angleTo(st.canopyQuaternion)<1e-7,'pause freezes the jump pose');
   assert.equal(j.elapsed,elapsed);feet.forEach((p,i)=>assert.ok(p.distanceTo(st.gripFeet[i].point)<1e-8,'pause freezes each jumping limb'));
   game.speed=speed;paused.add(next);
   // Exclude the intentional pause from the choreography duration.
   started+=.3;
  }
  if(seen.has('landing')&&!j&&(st.gripFeet[0].from&&st.gripFeet[1].from||st.gripFeet[2].from&&st.gripFeet[3].from))pairedSwing=true;
  if(seen.has('landing')&&!j&&!st.branchRoute&&st.branchPoint.distanceTo(st.branch.point)<.004){done=true;break;}
 }
 console.log(`PASS ${animal}, ${drop?'descending':'level'} jump, ${fps}fps, speed ${speed}: ${(preparation*1000).toFixed(0)} ms preparation, ${(push*1000).toFixed(0)} ms push, ${(flight*1000).toFixed(0)} ms flight, ${(landing*1000).toFixed(0)} ms landing`);
 assert.ok(done,'jump catches the receiving tree and resumes branch travel');
 assert.deepEqual([...seen],['prepare','push','flight','landing']);
 assert.ok(preparation>=HOWLER_CROUCH-1/fps,'fast game speeds preserve preparation');
 assert.ok(landing>=HOWLER_LANDING-1/fps,'fast game speeds preserve impact absorption');
 assert.ok(push>=HOWLER_PUSH&&push<.3,'the rear-leg thrust is short and visible');
 assert.ok(pushExtension>crouchExtension+.15&&pushExtension>.95,`knees straighten into a nearly extended launch stance (${crouchExtension.toFixed(3)} to ${pushExtension.toFixed(3)})`);
 assert.ok(pushHeight>.025,'hips rise from the crouch before takeoff');
 assert.ok(pushForward>pushRise&&pushForward>.1,'the planted-leg thrust drives the hips predominantly forward');
 assert.ok(arcHeight<horizontalGap*.2,'the rendered body follows a shallow arc across this short gap');
 if(!drop)assert.ok(launchDirection.y>0&&launchDirection.y<Math.hypot(launchDirection.x,launchDirection.z)*.75,'takeoff moves up and forward with a predominantly horizontal velocity');
 assert.ok(airFrames>=3&&flight<1.2,'flight stays readable without a slow float');
 assert.ok(crouch>.04&&impact>.035,'the crouch and landing compression are visibly distinct');
 assert.ok(firstHand>0&&firstFoot>firstHand+.035,'hands catch before the rear feet');
 assert.equal(paused.size,4,'all phases support pausing');
 assert.ok(minArm>.95,`arms stay outstretched through the flight (${minArm.toFixed(3)} of full reach)`);
 assert.ok(legSplit>.04,'the two legs move separately in the air rather than as mirror images');
 assert.ok(!pairedSwing,'walking on after the landing steps one hand and one foot at a time');
 actors.clear();cases++;
}
console.log(`${cases} ${animal} jump scenarios passed.`);
