import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { siamangSwing } = await import('../js/render3d/siamang-swing.js');
const { canopyFixture } = await import('./canopy-support-fixture.mjs');
const { buildSpecies, faunaMaterial } = await import('../js/render3d/fauna.js');
const { ANIMAL, drawDef } = await import('../js/data/animals.js');
const { PLANT } = await import('../js/data/plants.js');
const { Flora } = await import('../js/render3d/flora.js');
const { Actors } = await import('../js/render3d/actors.js');
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS ${name}`);}
check('Both hands take turns supporting the body, with overlapping catches before release',()=>{
  let left=0,right=0,both=0;
  for(let i=0;i<2000;i++){
    const s=siamangSwing(i/2000*Math.PI*2,1);
    assert.ok(s.left>1-1e-8||s.right<1e-8,'at least one hand is gripping');
    if(s.right>0)assert.equal(s.left,1,'left catches before right releases');
    if(s.left<1)assert.equal(s.right,0,'right catches before left releases');
    if(s.support===1){left++;assert.equal(s.left,1);assert.ok(Math.abs(s.grip[1]-1.38)<1e-8);}
    if(s.support===0){right++;assert.equal(s.right,0);assert.ok(Math.abs(s.grip[1]-1.38)<1e-8);}
    if(s.left===1&&s.right===0)both++;
  }
  assert.ok(left>200&&right>200&&both>100);
});
check('Handover anchors and body sway remain continuous across complete cycles, slowing and feeding',()=>{
  for(const gait of [0,.08,.2,.5,1])for(const eat of [0,.04,.2,1]){
    let prev=siamangSwing(-.001,gait,eat);
    for(let i=0;i<2000;i++){
      const pose=siamangSwing(i/1000*Math.PI*2,gait,eat);
      assert.ok(Math.hypot(...pose.grip.map((v,k)=>v-prev.grip[k]))<.025,'no handover jump');
      assert.ok(Math.abs(pose.sway-prev.sway)<.005);prev=pose;
    }
    if(eat>=.1){assert.equal(prev.left,0);assert.equal(prev.right,0);assert.deepEqual(prev.grip,[.14,1.38,.02]);}
  }
});
check('Slowing to rest preserves the planted hand instead of pulling the torso sideways',()=>{
  for(const phase of [Math.PI*.55,Math.PI,Math.PI*1.4]){
    const hold=siamangSwing(phase,1);
    for(const gait of [1,.7,.3,.2,.1,0]){
      const pose=siamangSwing(phase,gait);
      assert.ok(Math.hypot(...pose.grip.map((v,k)=>v-hold.grip[k]))<1e-8,'the supporting hand stays attached while the free arm relaxes');
      if(pose.support>0)assert.equal(pose.left,1,'the receiving hand remains extended through the handover');
    }
  }
});
check('Both articulated arms have climbing poses; feeding has its own pose and other species stay light',()=>{
  canopyFixture('sumatra','siamang');const {geo,motion}=buildSpecies(ANIMAL.siamang),p=geo.attributes.position,s=geo.attributes.aSwing,e=geo.attributes.aExt,part=geo.attributes.aPart;
  const moved={1:0,2:0};
  for(let i=0;i<p.count;i++){
    for(const attr of [s,geo.attributes.aSwingN])for(const v of [attr.getX(i),attr.getY(i),attr.getZ(i)])assert.ok(Number.isFinite(v));
    if(part.getX(i)===1||part.getX(i)===2)if(Math.abs(s.getY(i)-p.getY(i))>.1)moved[part.getX(i)]++;
  }
  assert.ok(moved[1]>100&&moved[2]>100);
  assert.ok(s.array.some((v,i)=>Math.abs(v-e.array[i])>.1),'swing and eating poses differ');
  const other=buildSpecies(ANIMAL.orangutan);assert.equal(other.geo.attributes.aSwing, undefined, 'orangutans retain their normal clambering pose');
  const shader={uniforms:{},vertexShader:'#include <beginnormal_vertex>\n#include <begin_vertex>',fragmentShader:''},mat=faunaMaterial(motion);mat.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('siamangHold'));assert.ok(shader.vertexShader.includes('aSwingN'));
  other.geo.dispose();geo.dispose();mat.dispose();
});
check('Picking follows the swinging body and pause freezes the same supporting hand',()=>{
  const {game,a}=canopyFixture('sumatra','siamang'),scene=new THREE.Scene(),flora=new Flora(scene);flora.rebuild(game,true);
  const actors=new Actors(scene,flora),right=new THREE.Vector3(1,0,0);actors.update(game,right,1);
  const st=actors.pose.get(a.id),mo=actors.fauna.motion(ANIMAL.siamang);st.gait=1;st.branchPhase=Math.PI/2;
  actors.update(game,right,1.01);
  const swing=siamangSwing(st.branchPhase,st.gait),expected=mo.center.clone().sub(new THREE.Vector3(...swing.grip).multiplyScalar(mo.len)).applyAxisAngle(new THREE.Vector3(0,0,1),swing.sway).add(new THREE.Vector3(.14,1.38,.02).multiplyScalar(mo.len)).applyMatrix4(actors.fauna.m);
  assert.ok(st.center.distanceTo(expected)<1e-7);
  const before=st.center.clone(),phase=st.branchPhase;
  for(let i=0;i<30;i++)actors.update(game,right,1.02+i/60);
  assert.equal(st.branchPhase,phase);assert.ok(st.center.distanceTo(before)<1e-8);
});

// Exercise the complete renderer: analytic swing continuity alone missed holds
// flipping between the sides of a limb and catch-up outrunning the arm cadence.
for (const tree of ['meranti','fig']) for (const fps of [15,60]) for (const speed of [1,2,3]) for (const mode of ['crown','fork']) check(`Siamang ${tree} ${mode} stays committed and smooth at ${fps} fps, speed ${speed}`,()=>{
  const {game,a}=canopyFixture('sumatra','siamang');
  for(const x of [40,41])game.world.setPlant(game.world.idx(x,32),PLANT[tree],1);
  a.state='walk';
  const scene=new THREE.Scene(),flora=new Flora(scene);flora.rebuild(game,true);
  const actors=new Actors(scene,flora),right=new THREE.Vector3(1,0,0),site=flora.treeSites.get(game.world.idx(40,32));site.prepare();
  const other=site.branches.findIndex((b,i)=>i>0&&b.from.distanceTo(site.branches[0].from)<.001);
  assert.ok(other>0);let target=0;
  if(mode==='fork')site.anchor=(x,z,p,reach,hanging,body)=>site.endpoint(target,1,{reach,hanging,body});
  actors.update(game,right,1);game.speed=speed;
  const st=actors.pose.get(a.id),pool=actors.fauna.pool(drawDef(ANIMAL.siamang,a)),bodyLength=pool.motion.len*st.sc;
  let point=st.branchPoint.clone(),center=st.center.clone(),rotation=st.canopyQuaternion.clone(),last=new THREE.Vector3();
  let reversals=0,finished=0,paused=false,maxGait=0;
  const duration=mode==='fork'?95:35;
  for(let frame=1;frame<=fps*duration;frame++){
    const time=1+frame/fps;
    target=time<20||time>=45?0:other;
    if(mode==='crown')a.x=Math.min(41.65,a.x+.24/fps);
    const journey=st.branchRoute,cursor=journey?.cursor,phase=st.branchPhase;
    actors.update(game,right,time);
    const delta=st.branchPoint.clone().sub(point),turn=st.canopyQuaternion.angleTo(rotation);
    assert.ok(delta.length()<=bodyLength*1.6*2.8/(Math.PI*2)/fps+1e-7,'catch-up cannot outrun the supporting-arm cycle');
    assert.ok(st.center.distanceTo(center)<=bodyLength*4/fps+1e-7,`body handovers and stopping stay smooth: ${st.center.distanceTo(center)/bodyLength*fps} body lengths/sec`);
    assert.ok(turn<=1.5/fps+1e-6,'forks cannot cause sudden torso turns');
    assert.ok(st.branchPhase>=phase&&st.branchPhase-phase<=2.8/fps+1e-8,'swing phase stays continuous');
    assert.ok(Math.abs(pool.anim.getX(0)-st.branchPhase)<1e-5,'drawn arms follow the accepted route progress');
    assert.ok(!st.canopyForce,'normal travel never forces through wood after a stall');
    if(journey===st.branchRoute&&journey)assert.ok(journey.cursor>=cursor,'an accepted bark waypoint cannot be replayed');
    if(journey&&!st.branchRoute)finished++;
    if(delta.length()>.0001){if(last.length()>.0001&&delta.clone().normalize().dot(last.clone().normalize())<-.2)reversals++;last.copy(delta);}
    maxGait=Math.max(maxGait,st.gait);
    if(st.branchRoute&&!paused){
      const hold=st.branchPoint.clone(),q=st.canopyQuaternion.clone(),c=st.center.clone(),gait=st.gait,swingPhase=st.branchPhase;
      game.speed=0;actors.update(game,right,time);
      assert.ok(st.branchPoint.equals(hold)&&st.center.distanceTo(c)<1e-8);
      assert.equal(st.branchPhase,swingPhase);assert.equal(st.gait,gait);
      assert.ok(st.canopyQuaternion.angleTo(q)<1e-7);
      game.speed=speed;paused=true;
    }
    point.copy(st.branchPoint);center.copy(st.center);rotation.copy(st.canopyQuaternion);
  }
  assert.ok(finished>=(mode==='crown'?1:2),'committed handovers finish');
  assert.equal(Boolean(st.branchRoute),false,'last route finishes');
  assert.ok(reversals<=(mode==='crown'?1:8),`unnecessary path reversals: ${reversals}`);
  assert.ok(maxGait>.9,'fast game speed still shows a full swing cycle');
  assert.ok(st.gait<.001,'limbs settle after arrival');
  point.copy(st.branchPoint);center.copy(st.center);rotation.copy(st.canopyQuaternion);
  for(let frame=1;frame<=fps;frame++)actors.update(game,right,duration+1+frame/fps);
  assert.ok(st.branchPoint.equals(point)&&st.center.distanceTo(center)<1e-7,'rest keeps the same hold');
  assert.ok(st.canopyQuaternion.angleTo(rotation)<1e-7,'rest cannot hunt for a different orientation');
  actors.clear();
});

console.log(`${checks} siamang swing checks passed.`);
