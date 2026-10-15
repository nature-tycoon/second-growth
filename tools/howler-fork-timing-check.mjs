import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./three-loader.mjs',import.meta.url);
const THREE=await import('three');
const {canopyFixture}=await import('./canopy-support-fixture.mjs');
const {Flora}=await import('../js/render3d/flora.js');
const {Actors}=await import('../js/render3d/actors.js');
const {PLANT}=await import('../js/data/plants.js');

// Compare the full catch/turn at the same fork, rather than counting the old
// howler as finished the instant its root reaches the destination.
for(const fps of [15,60]) {
  const finishes=[];
  for(const prototype of [false,true]) {
    const {game,a}=canopyFixture('amazon','howler');a.x=40.5;a.y=32.5;a.state='walk';
    for(const x of [40,41])game.world.setPlant(game.world.idx(x,32),PLANT.fig,1);
    const scene=new THREE.Scene(),flora=new Flora(scene);flora.rebuild(game,true);
    const actors=new Actors(scene,flora,{howlerPrototype:prototype}),site=flora.treeSites.get(game.world.idx(40,32));site.prepare();
    const other=site.branches.findIndex((b,i)=>i>0&&b.from.distanceTo(site.branches[0].from)<.001);
    let time=1;
    site.anchor=(x,z,previous,reach,hanging,body)=>site.endpoint(time>=1.1?other:0,1,{reach,hanging,body});
    const rounds=[];
    for(let round=0;round<2;round++) {
      time=1;game.speed=0;a.state='walk';actors.clear();actors.update(game,new THREE.Vector3(1,0,0),time);game.speed=1;
      const st=actors.pose.get(a.id);let reached=false,firstReach=0,finished=0,pauseDuration=0;
      for(let f=1;f<=fps*8;f++) {
        time+=1/fps;actors.update(game,new THREE.Vector3(1,0,0),time);
        if(prototype&&round===1&&!pauseDuration&&st.gripFeet.some(g=>!g.from&&!g.free&&g.plantedFor===0)) {
          const ages=st.gripFeet.map(g=>g.plantedFor),points=st.gripFeet.map(g=>g.point.clone()),q=st.canopyQuaternion.clone();
          game.speed=0;pauseDuration=.35;time+=pauseDuration;actors.update(game,new THREE.Vector3(1,0,0),time);
          assert.deepEqual(st.gripFeet.map(g=>g.plantedFor),ages,'pause does not consume the new grip settling interval');
          points.forEach((p,i)=>assert.ok(p.distanceTo(st.gripFeet[i].point)<1e-8,'a paused caught grip remains on its bark point'));
          assert.ok(q.angleTo(st.canopyQuaternion)<1e-7,'pause freezes the torso during a grip catch');game.speed=1;
        }
        if(time>1.1&&!firstReach&&st.gripFeet.some(f=>f.from))firstReach=time;
        if(time>1.1&&!st.branchRoute&&st.branchPoint.distanceTo(st.branch.point)<.004){reached=true;a.state='idle';}
        if(reached&&st.canopyQuaternion.angleTo(st.canopyGoal)<.015&&!st.gripFeet.some(f=>f.from)&&(!prototype||st.howlerResting)){finished=time-1.1-pauseDuration;break;}
      }
      assert.ok(finished>0,'the full crossing settles');
      if(prototype)assert.ok(firstReach-1.1<.1+1/fps,'grip preparation begins immediately instead of waiting for the body to hit its reach limit');
      if(prototype&&round===1)assert.equal(pauseDuration,.35,'the check exercises pausing on a newly caught grip');
      rounds.push(finished);
    }
    assert.ok(Math.abs(rounds[0]-rounds[1])<1/fps,'replay starts cleanly without stale movement state');
    finishes.push(rounds[0]);actors.clear();
  }
  assert.ok(finishes[1]<=finishes[0]+.45,'the supported prototype finishes close to the current howler at normal speed');
  console.log(`PASS ${fps}fps fork and replay: current ${finishes[0].toFixed(2)}s, prototype ${finishes[1].toFixed(2)}s through the complete catch/turn`);
}
