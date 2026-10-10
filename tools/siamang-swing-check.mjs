import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { siamangSwing } = await import('../js/render3d/siamang-swing.js');
const { canopyFixture } = await import('./canopy-support-fixture.mjs');
const { buildSpecies, faunaMaterial } = await import('../js/render3d/fauna.js');
const { ANIMAL } = await import('../js/data/animals.js');
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
    if(gait===0||eat>=.1){assert.equal(prev.left,0);assert.equal(prev.right,0);assert.deepEqual(prev.grip,[.14,1.38,.02]);}
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
  const other=buildSpecies(ANIMAL.orangutan);assert.equal(other.geo.attributes.aSwing,undefined);
  const shader={uniforms:{},vertexShader:'#include <beginnormal_vertex>\n#include <begin_vertex>'},mat=faunaMaterial(motion);mat.onBeforeCompile(shader);
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
console.log(`${checks} siamang swing checks passed.`);
