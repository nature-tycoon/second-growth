import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { canopyFixture } = await import('./canopy-support-fixture.mjs');
const { PLANT, PLANTS } = await import('../js/data/plants.js');
const { ANIMAL, drawDef } = await import('../js/data/animals.js');
const { primateChoose, primateArrive, fruitAt } = await import('../js/sim/primate-behavior.js');
const { bolt } = await import('../js/sim/animal-life.js');
const { Flora } = await import('../js/render3d/flora.js');
const { Actors } = await import('../js/render3d/actors.js');
const { buildSpecies } = await import('../js/render3d/fauna.js');
let n = 0;
function check(name, fn) { fn(); console.log(`PASS ${name}`); n++; }
function fruitFixture(map='sumatra', key='orangutan') {
  const f = canopyFixture(map,key), w=f.game.world;
  const tree=PLANT.fig || PLANTS.find(p=>p?.layer===2&&p.look.fruit?.length);
  f.game.day=tree.look.fruit[0]*10;
  for(const x of [40,41])w.setPlant(w.idx(x,32),tree,1);
  f.game.rng=()=>.1; return f;
}
check('All primates take seasonal fruit meals and resume with a cooldown; other animals keep their behavior',()=>{
  for(const [map,key] of [['sumatra','orangutan'],['sumatra','siamang'],['sumatra','langur'],['sumatra','macaque'],['amazon','howler'],['amazon','spider'],['chinandega','congo'],['chinandega','capuchin']]) {
    const {game,a}=fruitFixture(map,key),wl=game.wildlife,def=ANIMAL[key];
    assert.ok(primateChoose(wl,a,def),key);assert.equal(a.state,'primate');assert.ok(a.fruitMeal);
    const before=[a.x,a.y],duration=a.fruitMeal.duration;
    for(let t=0;t<duration+.1;t+=.05)wl.update(.05);
    assert.equal(a.state,'idle');assert.equal(a.fruitMeal,null);assert.deepEqual([a.x,a.y],before);
    assert.equal(primateChoose(wl,a,def),false,'meal cooldown');
  }
  const {game,a}=fruitFixture('amazon','sloth');assert.equal(primateChoose(game.wildlife,a,ANIMAL.sloth),false);
});
check('Fruit is reached through connected canopy and never invented on young or out-of-season trees',()=>{
  const {game,a}=fruitFixture(),wl=game.wildlife,w=game.world,here=w.idx(40,32),next=w.idx(41,32),tree=PLANTS[w.tree[here]];
  w.treeG[here]=.5; assert.equal(fruitAt(game,here),false);
  assert.ok(primateChoose(wl,a,ANIMAL.orangutan));assert.equal(a.state,'walk');assert.equal(a.path[0],next);
  a.x=41.5;a.y=32.5;a.path=[];wl.update(.05);assert.equal(a.state,'primate');assert.equal(a.fruitMeal.i,next);
  const off=Array.from({length:12},(_,i)=>i).find(m=>!tree.look.fruit.includes(m));
  if(off!=null){game.day=off*10;wl.update(.05);assert.equal(a.state,'idle');assert.equal(a.fruitMeal,null);}
  w.clearPlants(next);a.x=40.5;a.y=32.5;a.fruitAfter=0;a.age+=20;assert.equal(primateChoose(wl,a,ANIMAL.orangutan),false);
});
check('Cutting, replacement, fire, threats and save/load never leave a stranded meal or fruit goal',()=>{
  for(const reason of ['cut','replace','fire','danger','load']) {
    const {game,a}=fruitFixture(),wl=game.wildlife,w=game.world,i=w.idx(40,32);
    primateChoose(wl,a,ANIMAL.orangutan);
    if(reason==='cut')w.clearPlants(i);
    if(reason==='replace')w.setPlant(i,PLANT.meranti,1);
    if(reason==='fire')w.fire[i]=1;
    if(reason==='danger')bolt(wl,a,{x:a.x-1,y:a.y},1,.8);
    if(reason==='load'){const save=wl.serialize();wl.load(JSON.parse(JSON.stringify(save)));assert.equal(wl.agents[0].state,'primate');w.clearPlants(i);}
    wl.update(.05);assert.equal(wl.agents[0].fruitMeal,null,reason);assert.notEqual(wl.agents[0].state,'primate',reason);
  }
  const {game,a}=fruitFixture();a.state='walk';a.fruitGoal={i:game.world.idx(41,32),plant:PLANT.fig.id};game.wildlife.load(game.wildlife.serialize());assert.equal(game.wildlife.agents[0].fruitGoal,null);
});
check('Branch changes route through shared forks, stay continuous, and freeze while paused',()=>{
  for(const key of ['orangutan','siamang','langur']){
    const {game,a}=fruitFixture('sumatra',key),scene=new THREE.Scene(),flora=new Flora(scene);flora.rebuild(game,true);
    const actors=new Actors(scene,flora),right=new THREE.Vector3(1,0,0);actors.update(game,right,1);game.speed=1;a.state='walk';
    const initial=actors.pose.get(a.id),site=initial.branch.site;site.graph();
    const b=site.branches.findIndex((b,i)=>i!==initial.branch.index&&b.length>.2);
    const route=site.route(initial.branch,site.endpoint(b,1));assert.ok(route.length>1,'shared fork route');
    let time=1,transfers=0;
    for(let k=0;k<480;k++){
      const st=actors.pose.get(a.id),before=st.branchPoint.clone(),yaw=st.yaw;a.x=Math.min(41.6,a.x+.004);time+=1/60;actors.update(game,right,time);
      assert.ok(st.branchPoint.distanceTo(before)<.07,'no teleport');
      let turn=st.yaw-yaw;turn-=Math.round(turn/(2*Math.PI))*2*Math.PI;assert.ok(Math.abs(turn)<.4,'smooth turns');
      if(st.branchRoute)transfers++;
    }
    assert.ok(transfers>0);const st=actors.pose.get(a.id),point=st.branchPoint.clone(),phase=st.branchPhase,gait=st.gait,yaw=st.yaw,pitch=st.branchPitch;game.speed=0;
    for(let k=0;k<20;k++)actors.update(game,right,time+k/60);
    assert.ok(st.branchPoint.distanceTo(point)<1e-8);assert.equal(st.branchPhase,phase);assert.equal(st.gait,gait);assert.equal(st.yaw,yaw);assert.equal(st.branchPitch,pitch);
    game.speed=1;a.state='idle';for(let k=0;k<1500;k++)actors.update(game,right,time+1+k/60);
    assert.equal(Boolean(st.branchRoute),false, `${key}: canopy transfer must finish`);assert.ok(st.branchPoint.distanceTo(st.branch.point)<1e-5);assert.ok(st.gait<.001,'resting limbs settle');
  }
});
check('Routine tree rebuilds preserve a climb in progress instead of snapping to a new hold',()=>{
  const {game,a}=fruitFixture(),scene=new THREE.Scene(),flora=new Flora(scene);flora.rebuild(game,true);
  const actors=new Actors(scene,flora),right=new THREE.Vector3(1,0,0);actors.update(game,right,1);game.speed=1;a.state='walk';
  let time=1;
  for(let i=0;i<180&&!actors.pose.get(a.id).branchRoute;i++){a.x+=.01;time+=1/60;actors.update(game,right,time);}
  const st=actors.pose.get(a.id);assert.ok(st.branchRoute);
  const route=st.branchRoute,point=st.branchPoint.clone(),phase=st.branchPhase;
  game.speed=0;game.world.treeG[game.world.idx(40,32)]=.995;flora.rebuild(game,true);actors.update(game,right,time+1/60);
  assert.ok(st.branchRoute===route);assert.equal(st.branchPhase,phase);assert.ok(st.branchPoint.distanceTo(point)<.035);
  assert.ok(st.branchRoute.fromSite===flora.treeSites.get(st.branchRoute.fromSite.tile));
});
check('Primate models have jointed feeding poses and real grip heights, including adult male orangutans',()=>{
  for(const key of ['orangutan','siamang','langur','macaque'])for(const male of [false,true]){
    const {game,a}=fruitFixture('sumatra',key);a.id=male?1:2;
    const def=drawDef(ANIMAL[key],a),{geo,motion}=buildSpecies(def),s=def.sprite;
    assert.ok(motion.primate);assert.equal(motion.bob,0);
    let fruit=0,changed=0;const p=geo.attributes.position,e=geo.attributes.aExt,part=geo.attributes.aPart;
    for(let i=0;i<p.count;i++){if(part.getX(i)===10)fruit++;if(part.getX(i)===1&&Math.abs(e.getY(i)-p.getY(i))>.01)changed++;for(const v of [e.getX(i),e.getY(i),e.getZ(i)])assert.ok(Number.isFinite(v));}
    assert.ok(fruit>0&&changed>0,key);
    if(s.ape)assert.equal(motion.supportY,s.len*1.38);
    if(s.kind==='orangutan')assert.equal(motion.supportY,-s.len*.015,'long hair must not lift the feet off the branch');
    geo.dispose();
  }
});
check('Climbers keep up with their simulation position at every game speed, without reset jumps on or off the trees',()=>{
  for(const [map,key,tree] of [['amazon','spider','fig'],['sumatra','siamang','meranti']]) for(const speed of [1,3]){
    const {game}=canopyFixture(map,key),w=game.world;game.wildlife.agents=[];
    for(let x=34;x<46;x++)for(let y=26;y<38;y++)if((x*7+y*3)%11)w.setPlant(w.idx(x,y),PLANT[tree],1);
    const ags=[0,1,2].map(n=>game.wildlife.spawn(ANIMAL[key],36+n*3,30+n*2,{silent:true,age:1200}));
    const scene=new THREE.Scene(),flora=new Flora(scene);flora.rebuild(game,true);
    const actors=new Actors(scene,flora),right=new THREE.Vector3(1,0,0);let time=1;actors.update(game,right,time);game.speed=speed;
    const last=new Map();let worst=0;
    for(let f=0;f<600;f++){
      const sim=new Map(ags.map(a=>[a.id,[a.x,a.y]]));
      game.update(1/60);time+=1/60;flora.rebuild(game);actors.update(game,right,time);
      for(const a of ags){const st=actors.pose.get(a.id);if(!st?.visible)continue;const q=last.get(a.id),s0=sim.get(a.id);last.set(a.id,[st.x,st.z]);
        if(q)worst=Math.max(worst,Math.hypot(st.x-q[0],st.z-q[1])-Math.hypot(a.x-s0[0],a.y-s0[1]));}
    }
    assert.ok(worst<(speed>1?.9:.3),`${key} at speed ${speed}: drawn body jumped ${worst.toFixed(2)} tiles beyond its own step`);
  }
});
console.log(`${n} primate behavior checks passed.`);
