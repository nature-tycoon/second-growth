// Sweep real fork handovers across canopy trees. Reports stalls, paired
// swings, dropped steps and slow turns for the howler prototype.
//   node tools/howler-fork-sweep.mjs [--tree=fig] [--limit=3] [--fps=60] [--speed=1] [--current] [--assert]
// --assert rejects immediate re-steps, final turns taking 2 s or more, unfinished
// crossings and freezes over 0.6 s.
import { register } from 'node:module';register('./three-loader.mjs',import.meta.url);
const THREE=await import('three');
const { canopyFixture } = await import('./canopy-support-fixture.mjs');
const { Flora } = await import('../js/render3d/flora.js');
const { Actors } = await import('../js/render3d/actors.js');
const { PLANT } = await import('../js/data/plants.js');
const args=process.argv.slice(2),arg=(k,d)=>args.find(a=>a.startsWith(`--${k}=`))?.split('=')[1]??d;
const fps=Number(arg('fps',60)),speed=Number(arg('speed',1)),limit=Number(arg('limit',3));
const animal=arg('animal','howler'),map=arg('map',animal==='langur'?'sumatra':['congo','capuchin'].includes(animal)?'chinandega':'amazon');
canopyFixture(map,animal); // registers this species' native tree set
const trees=arg('tree')?arg('tree').split(','):Object.keys(PLANT).filter(k=>PLANT[k].layer===2);
if(args.includes('--list')){console.log(trees.join(' '));process.exit(0);}
const results=[];
for(const key of trees)for(const growth of [1,.7]){
  const probe=canopyFixture(map,animal);probe.game.world.setPlant(probe.game.world.idx(40,32),PLANT[key],growth);
  const pf=new Flora(new THREE.Scene());pf.rebuild(probe.game,true);const ps=pf.treeSites.get(probe.game.world.idx(40,32));
  if(!ps)continue;ps.prepare();
  const pairs=[];
  ps.branches.forEach((b,i)=>ps.branches.forEach((c,j)=>{if(i<j&&b.from.distanceTo(c.from)<.001&&b.length>.15&&c.length>.15)pairs.push([i,j]);}));
  for(const [from,to] of pairs.slice(0,limit))for(const [p,q] of [[from,to],[to,from]]){
    const {game,a}=canopyFixture(map,animal);game.world.setPlant(game.world.idx(40,32),PLANT[key],growth);
    a.x=40.5;a.y=32.5;a.state='walk';
    const flora=new Flora(new THREE.Scene());flora.rebuild(game,true);
    const actors=new Actors(new THREE.Scene(),flora,{canopyWalkerMotion:!args.includes('--current')}),site=flora.treeSites.get(game.world.idx(40,32));site.prepare();
    let time=1;
    site.anchor=(x,z,previous,reach,hanging,body)=>site.endpoint(time>=1.1?q:p,1,{reach,hanging,body});
    actors.update(game,new THREE.Vector3(1,0,0),time);game.speed=speed;
    const st=actors.pose.get(a.id);
    let arrival=0,turned=0,still=0,maxStill=0,paired=0,shortened=0,placements=0,resteps=0;
    const caughtAt=[-Infinity,-Infinity,-Infinity,-Infinity];
    const starts=new Set();
    for(let f=1;f<=fps*12;f++){
      time+=1/fps;const before=st.branchPoint.clone(),pose=st.canopyQuaternion.clone(),catches=st.gripFeet.map(g=>g.catches||0);
      actors.update(game,new THREE.Vector3(1,0,0),time);
      const moved=st.branchPoint.distanceTo(before)>1e-5||st.canopyQuaternion.angleTo(pose)>1e-4;
      const swinging=st.gripFeet.some(g=>g.from);
      if(!arrival&&!moved||arrival&&!st.howlerResting&&!moved&&!args.includes('--current')){still+=1/fps;maxStill=Math.max(maxStill,still);}else still=0;
      if(st.gripFeet[0].from&&st.gripFeet[1].from||st.gripFeet[2].from&&st.gripFeet[3].from)paired++;
      st.gripFeet.forEach((g,i)=>{
        if((g.catches||0)>catches[i])caughtAt[i]=time;
        if(g.from&&!starts.has(i)){starts.add(i);placements++;if(time-caughtAt[i]<=1/fps+1e-6)resteps++;}
        if(!g.from&&starts.has(i)){starts.delete(i);if(g.free)shortened++;}
      });
      if(time>1.3&&!arrival&&!st.branchRoute&&st.branchPoint.distanceTo(st.branch.point)<.004){arrival=time-1;a.state='idle';}
      if(arrival&&!turned&&(args.includes('--current')||st.howlerResting&&!swinging)){turned=time-1;break;}
    }
    results.push({animal,tree:key,growth,from:p,to:q,angle:+site.branches[p].dir.angleTo(site.branches[q].dir).toFixed(2),
      arrival:+arrival.toFixed(2),turned:+turned.toFixed(2),finalTurn:+(turned-arrival).toFixed(2),maxStill:+maxStill.toFixed(2),paired,placements,shortened,resteps});
    actors.clear();
    if(args.includes('--verbose'))console.error(JSON.stringify(results.at(-1)));
  }
}
const bad=r=>!r.turned||r.maxStill>.6||r.finalTurn>=2||r.resteps>0;
console.table(results.map(r=>({...r,flag:bad(r)?'!!':''})));
console.log(`${results.filter(bad).length}/${results.length} forks struggle (fps ${fps}, speed ${speed}); paired-swing frames ${results.reduce((s,r)=>s+r.paired,0)}; placements ${results.reduce((s,r)=>s+r.placements,0)}`);
if(args.includes('--assert')){
  const stuck=results.filter(bad);
  if(stuck.length){console.error('FAIL stuck forks:',JSON.stringify(stuck));process.exit(1);}
  console.log(`PASS ${results.length} fork crossings: no immediate re-steps, final turns under 2 s, no freezes over 0.6 s`);
}
