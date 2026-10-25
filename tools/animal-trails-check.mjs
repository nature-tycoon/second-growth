import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { BIOME_LIST } from '../js/biome.js';
import { T,F,DAYS_PER_YEAR } from '../js/config.js';
import { mulberry32 } from '../js/rng.js';
import { trailProfile } from '../js/data/animal-trails.js';
import { shapeCourse } from '../js/sim/animal-course.js';
import { recordTrailStep, decayTrails, trailPorts, trailMask, preferTrailPath, rangeChoose, trailNode, followLeaderTrip } from '../js/sim/animal-trails.js';
let checks=0;
const check=(name,fn)=>{fn();checks++;console.log('PASS '+name)};
function setup(map='pnw') {
 Math.random=mulberry32(1987);const g=new Game();g.newGame(1987,'free','standard',map);g.day=20;
 const w=g.world,wl=g.wildlife;wl.agents=[];wl.flyovers=[];wl.recount();wl.passageWait=1e6;
 w.terrain.fill(T.SOIL);w.struct.fill(-1);w.fire.fill(0);w.flood.fill(0);w.feature.fill(0);w.tree.fill(0);w.shrub.fill(0);w.ground.fill(0);w.distWater.fill(99);w.vh.fill(1);
 wl.suit.forEach(a=>a.fill(1));return g;
}
function spawn(g,key='deer',x=40.5,y=30.5){const d=g.catalog.animal[key];const a=g.wildlife.spawn(d,x|0,y|0,{silent:true,age:d.mature*DAYS_PER_YEAR+10});Object.assign(a,{x,y,state:'idle',wait:99,hunger:0,thirst:0});return a;}
function stamp(g,a,x0,y0,x1,y1){a.age+=2;a.x=x1;a.y=y1;recordTrailStep(g.wildlife,a,g.catalog.animals[a.sp],x0,y0);}
// (wear like a journey: only journeys draw a trail, and it takes about 20 of them to show)
function line(g,a,n=60){const state=a.state;a.state='leave';for(let k=0;k<n;k++){for(let x=30;x<50;x++)stamp(g,a,x+.5,30.5,x+1.5,30.5);}a.state=state;}
function walk(g,a,dest,dt=.05){assert.ok(g.wildlife.pathTo(a,j=>j===dest,1800));for(let k=0;k<2500&&a.state==='walk';k++)g.wildlife.update(dt);assert.equal(a.state,'idle');}
function food(g,x,y){const p=g.catalog.plants.find(p=>p&&p.layer===0&&!p.invasive&&['grass','tallgrass','sedge'].includes(p.look.type));assert.ok(p);const j=g.world.idx(x,y);g.world.ground[j]=p.id;g.world.groundG[j]=1;return j;}
check('All map entries restrict trail making to suitable large land mammals',()=>{
 let entries=0,selected=0;for(const b of BIOME_LIST){const g=setup(b.id);for(const d of g.catalog.animals){entries++;const p=trailProfile(d);if(p){selected++;assert.ok(!d.reef);assert.ok(d.move==='ground'||d.key==='tapir');assert.ok(p.wear>0&&p.wear<.06);}}
 if(b.id==='reef')assert.ok(g.catalog.animals.every(d=>!trailProfile(d)));}
 assert.ok(entries>=200,'every map roster checked');assert.ok(selected>20);
});
check('Stationary grazing, dormant animals, spacing and pause cannot wear a trail',()=>{
 const g=setup(),a=spawn(g);for(let k=0;k<20;k++)g.wildlife.daily();assert.ok(!g.world.trailE||!g.world.trailE.some(Boolean));
 g.wildlife.update(0);assert.ok(!g.world.trailE);
 a.state='dormant';stamp(g,a,40.5,30.5,41.5,30.5);assert.ok(!g.world.trailE);
});
check('Actual walking paints connected edges, independent of simulation step size',()=>{
 const totals=[];for(const dt of [.02,.05]){const g=setup(),a=spawn(g,'deer',30.5,30.5),w=g.world;walk(g,a,w.idx(45,30),dt);
 const worn=[...w.trailE,...w.trailS].filter(Boolean);assert.ok(worn.length>=14);assert.ok(worn.every(v=>v<.16),'one pass stays invisible');totals.push(worn.reduce((a,b)=>a+b,0)); /* (a journey meanders, so it crosses some north-south edges too) */}
 assert.ok(Math.abs(totals[0]-totals[1])<.04);
});
check('Repeated traffic becomes a narrow continuous track while a one-off crossing stays invisible',()=>{
 const g=setup(),a=spawn(g),w=g.world;stamp(g,a,30.5,30.5,31.5,30.5);
 assert.deepEqual(trailPorts(w,w.idx(30,30)),[0,0,0,0]);line(g,a);
 const j=w.idx(40,30),ports=trailPorts(w,j);assert.ok(ports[0]>.5&&ports[2]>.5);
 assert.equal(ports[1],0);assert.equal(ports[3],0);assert.ok(trailMask(w,j,.5,.5)>.5);assert.equal(trailMask(w,j,.5,.9),0);
 assert.equal(trailPorts(w,j)[0],trailPorts(w,j+1)[2]);
});
check('Only journeys draw a trail; shuffling about wears no visible track however often it is repeated',()=>{
 const g=setup(),a=spawn(g),w=g.world;
 for(let k=0;k<200;k++)for(let x=30;x<50;x++)stamp(g,a,x+.5,30.5,x+1.5,30.5);
 assert.ok(!w.trailDensity||w.trailDensity.every(v=>v===0),'no drawn wear from steps that are not a journey');
 assert.ok(w.trailE.some(Boolean),'they still count as crossings for route choice and compaction');
 line(g,a,8);assert.equal(trailMask(w,w.idx(40,30),.5,.5),0,'a few journeys stay invisible');
 line(g,a,40);assert.ok(trailMask(w,w.idx(40,30),.5,.5)>0,'a few dozen show');
});
check('Years of journeys along one corridor wear one narrow trail, not a band as wide as the lines they walk',()=>{
 // (walkers never retrace exactly the same line: each of these passes is up to 0.3 tile to the side)
 const g=setup(),a=spawn(g),w=g.world;a.state='walk';a.path=[w.idx(50,30)];a.course={path:a.path,pts:new Float32Array(2)};
 for(let k=0;k<600;k++){const y=30.5+((k*0.618)%1-.5)*.6;for(let x=30;x<50;x++)stamp(g,a,x+.5,y,x+1.5,y);}
 let width=0;for(let y=29;y<32;y+=1/32)if(trailMask(w,w.idx(40,y|0),.5,y-(y|0))>0)width+=1/32;
 assert.ok(width>.1&&width<=.5,`drawn ${width.toFixed(2)} tile wide`);
 assert.ok(w.trailDensity.reduce((m,v)=>Math.max(m,v),0)<=.4+1e-6,'heavy use is capped, so an abandoned trail fades within a few years');
});
check('Continuous density shares exact tile seams and remains stable while paused',()=>{
 const g=setup(),a=spawn(g),w=g.world;line(g,a);const j=w.idx(40,30),node=trailNode(w,j);
 assert.ok(node.every(v=>v>.25&&v<.75));
 const left=trailMask(w,j,1,.5),right=trailMask(w,j+1,0,.5);assert.ok(left>.5);assert.ok(Math.abs(left-right)<.001);
 const saved=w.trailDensity.slice();g.wildlife.update(0);assert.deepEqual(w.trailDensity,saved);
});
check('Legacy stationary wear, water, visitor paths, roads, structures and reef wildlife produce no game trails',()=>{
 const g=setup(),a=spawn(g),w=g.world;w.trod=new Float32Array(w.n).fill(1);assert.deepEqual(trailPorts(w,w.idx(40,30)),[0,0,0,0]);
 for(const type of ['water','flood','road','trail','structure','fence']){const j=w.idx(40,30);w.terrain[j]=T.SOIL;w.flood[j]=0;w.struct[j]=-1;w.feature[j]=0;
 if(type==='water')w.terrain[j]=T.POND;if(type==='road')w.terrain[j]=T.ROAD;if(type==='trail')w.terrain[j]=T.TRAIL;if(type==='flood')w.flood[j]=1;if(type==='structure')w.struct[j]=0;if(type==='fence')w.feature[j]=F.FENCE;
 stamp(g,a,40.5,30.5,41.5,30.5);assert.equal(w.trailE?.[j]||0,0,type);}
 const r=setup('reef'),fish=spawn(r,'tang');stamp(r,fish,40.5,30.5,41.5,30.5);assert.ok(!r.world.trailE);
});
check('Unused trails fade and terrain destruction breaks connections',()=>{
 const g=setup(),a=spawn(g),w=g.world;line(g,a);const j=w.idx(40,30),before=w.trailE[j];
 decayTrails(w);assert.ok(w.trailE[j]<before);w.terrain[j+1]=T.POND;decayTrails(w);assert.equal(w.trailE[j],0);assert.equal(trailPorts(w,j)[0],0);
 for(let k=0;k<2400;k++)decayTrails(w);assert.ok(!trailPorts(w,w.idx(35,30)).some(Boolean)); // (0.17%/day: years to fade)
});
check('Route reuse prefers a useful worn corridor without chasing distant trails or bypassing barriers',()=>{
 const g=setup(),a=spawn(g,'deer',30.5,30.5),w=g.world,wl=g.wildlife,d=g.catalog.animal.deer;
 const original=Array.from({length:12},(_,k)=>w.idx(42-k,30));
 w.trailE=new Float32Array(w.n);w.trailS=new Float32Array(w.n);
 for(let x=30;x<42;x++)w.trailE[w.idx(x,31)]=1;w.trailS[w.idx(30,30)]=w.trailS[w.idx(42,30)]=1;
 let path=preferTrailPath(wl,a,d,original);assert.equal(path[0],original[0]);assert.ok(path.some(j=>(j/w.w|0)===31));assert.ok(path.length<=17);
 w.struct[w.idx(36,31)]=0;path=preferTrailPath(wl,a,d,original);assert.ok(!path.includes(w.idx(36,31)));
 w.fire[w.idx(35,31)]=3;path=preferTrailPath(wl,a,d,original);assert.ok(!path.includes(w.idx(35,31)));
 assert.ok(path.every(j=>Math.abs((j/w.w|0)-30)<3));
});
check('Local resource ranges remember actual feeding and resting habitat, then abandon destroyed sites',()=>{
 const g=setup(),a=spawn(g),w=g.world,d=g.catalog.animal.deer;
 for(let x=49;x<=53;x++)for(let y=29;y<=32;y++)food(g,x,y);
 rangeChoose(g.wildlife,a,d);assert.ok(a.range);const first={...a.range};
 assert.ok(w.ground[first.feed]);a.age=a.range.after+.1;assert.equal(rangeChoose(g.wildlife,a,d),true);assert.equal(a.path[0],first.feed);
 const course=a.range.route.slice(),dx=first.feed%w.w-40,dy=(first.feed/w.w|0)-30;
 // (the bends come from the land as it walks the course: see animal-course.js and animal-course-check)
 shapeCourse(g.wildlife,a,d);const pts=a.course.pts;let off=0;
 for(let k=0;k<pts.length;k+=2)if(!Number.isNaN(pts[k]))off=Math.max(off,Math.abs((pts[k]-40.5)*dy-(pts[k+1]-30.5)*dx)/Math.hypot(dx,dy));
 assert.ok(off>.25,'learned travel bends through the range');
 a.state='idle';a.path=null;a.x=first.feed%w.w+.5;a.y=(first.feed/w.w|0)+.5;a.age+=1;
 rangeChoose(g.wildlife,a,d);assert.equal(a.range.next,'rest');assert.equal(a.range.feed,first.feed);
 a.age=a.range.after+.1;rangeChoose(g.wildlife,a,d);assert.ok(a.path.every(j=>course.includes(j)),'return trip reuses the learned course');
 // (a feeding ground is judged when it is time to go back to it: heading for cover, it keeps its range)
 w.ground.fill(0);a.rangeAfter=a.age+100;rangeChoose(g.wildlife,a,d);assert.ok(a.range,'heading back to cover');
 const rest=a.range.rest;Object.assign(a,{state:'idle',path:null,x:rest%w.w+.5,y:(rest/w.w|0)+.5});rangeChoose(g.wildlife,a,d);assert.equal(a.range,null,'gives up a feeding ground with nothing left');
});
check('A grazed-out feeding ground moves on along the meadow, keeping the bed in cover',()=>{
 const g=setup(),a=spawn(g),w=g.world,d=g.catalog.animal.deer;
 for(let x=46;x<=56;x++)for(let y=28;y<=33;y++)food(g,x,y);
 rangeChoose(g.wildlife,a,d);const first={...a.range};
 Object.assign(a,{state:'idle',path:null,x:first.rest%w.w+.5,y:(first.rest/w.w|0)+.5});a.range.next='feed';a.age=a.range.after+.1;
 w.grazed=w.grazed||new Float32Array(w.n);w.grazed[first.feed]=.9;a.rangeAfter=0;rangeChoose(g.wildlife,a,d);
 assert.equal(a.range.rest,first.rest,'keeps its bed');assert.notEqual(a.range.feed,first.feed,'feeds somewhere fresh');
 assert.ok(Math.hypot(a.range.feed%w.w-first.feed%w.w,(a.range.feed/w.w|0)-(first.feed/w.w|0))<6,'further along the same meadow');
});
check('A family member that falls behind follows its leader single file along the leader\'s route',()=>{
 const g=setup(),wl=g.wildlife,w=g.world,d=g.catalog.animal.deer,lead=spawn(g),b=spawn(g,'deer',37.5,30.5);
 for(let x=49;x<=53;x++)for(let y=29;y<=32;y++)food(g,x,y);
 rangeChoose(wl,lead,d);lead.age=lead.range.after+.1;rangeChoose(wl,lead,d);assert.equal(lead.state,'walk');
 lead.x+=3;assert.equal(followLeaderTrip(wl,b,lead),true);assert.ok(b.follow&&b.state==='walk');
 assert.ok(b.path.every(j=>lead.range.route.includes(j)||Math.hypot(j%w.w-b.x,(j/w.w|0)-b.y)<7),'on the leader\'s route (after joining it)');
 assert.notEqual(b.path[0],lead.range.goal,'stops short of the leader\'s spot');
 const near=spawn(g,'deer',lead.x+1,lead.y);assert.equal(followLeaderTrip(wl,near,lead),false,'one close by keeps its place in the group');
});
check('Families, young and migrants keep their existing movement priorities',()=>{
 const g=setup(),a=spawn(g),d=g.catalog.animal.deer;
 for(const field of ['juvenile','fromFire','leaving','follow']){a[field]=true;assert.equal(rangeChoose(g.wildlife,a,d),false);a[field]=false;}
 a.mom=123;assert.equal(rangeChoose(g.wildlife,a,d),false);a.mom=null;
 const s=setup('serengeti'),z=spawn(s,'zebra');assert.equal(trailProfile(s.catalog.animal.zebra).range,false);assert.equal(rangeChoose(s.wildlife,z,s.catalog.animal.zebra),false);
});
check('New saves and undo copy resource memories and edge wear; legacy/short fields still load',()=>{
 const g=setup(),a=spawn(g),w=g.world;line(g,a);a.range={feed:w.idx(50,30),rest:w.idx(40,30),next:'feed',after:a.age+1,goal:null,route:[w.idx(40,30),w.idx(41,30)]};
 const animals=g.wildlife.serialize();assert.notEqual(animals.agents[0].range,a.range);assert.notEqual(animals.agents[0].range.route,a.range.route);const routeStart=a.range.route[0];animals.agents[0].range.route[0]++;assert.equal(a.range.route[0],routeStart);animals.agents[0].range.feed++;assert.notEqual(animals.agents[0].range.feed,a.range.feed);
 const save=g.saveData(),at=w.idx(40,30),wear=w.trailE[at];assert.ok(g.restoreSave(save));assert.equal(g.world.trailE[at],wear);
 g.world.trailE[at]=0;assert.ok(g.restoreSave(save));assert.equal(g.world.trailE[at],wear);
 const old=g.saveData();delete old.world.arrays.trailE;delete old.world.arrays.trailS;delete old.wildlife.agents[0].range;
 assert.ok(g.restoreSave(old));const b=g.wildlife.agents[0];stamp(g,b,40.5,30.5,41.5,30.5);assert.equal(g.world.trailE.length,g.world.n);
});
console.log(`${checks} game trail checks passed.`);
