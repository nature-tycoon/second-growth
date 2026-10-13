// Real behavior outcomes and interruption boundaries for the cross-map guild audit.
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { ANIMAL, ANIMALS, isMale } from '../js/data/animals.js';
import { PLANT, PLANTS } from '../js/data/plants.js';
import { T, H, F, DAYS_PER_YEAR } from '../js/config.js';
import { forageChoose, forageUpdate, foodAt, cleanerChoose } from '../js/sim/animal-foraging.js';
import { greet, arrive, missed, beginHunt, huntStyle, fleeFire } from '../js/sim/animal-life.js';
import { passable } from '../js/sim/animal-terrain.js';
const g = new Game(); let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
function reset(map='pnw', difficulty='standard') {
  g.newGame(1987,'free',difficulty,map);
  const wl=g.wildlife,w=g.world;wl.agents=[];wl.ids.clear();wl.recount();
  w.terrain.fill(T.SOIL);w.feature.fill(0);w.struct.fill(-1);w.fire.fill(0);
  w.tree.fill(0);w.treeG.fill(0);w.shrub.fill(0);w.shrubG.fill(0);w.ground.fill(0);w.groundG.fill(0);
  w.insects.fill(0);w.nectar.fill(0);w.habitat.fill(H.BARE);
  return {wl,w,i:w.idx(40,30)};
}
function spawn(key,x=40,y=30) {const a=g.wildlife.spawn(ANIMAL[key],x,y,{silent:true,age:5*DAYS_PER_YEAR});a.x=x+.5;a.y=y+.5;a.hunger=12;a.wait=99;return a;}
function rig(fn) {const original=Math.random;Math.random=()=>0;try{return fn();}finally{Math.random=original;}}
function male(key,sex=true) {for(let n=0;n<300;n++){const a=spawn(key);if(isMale(ANIMAL[key],a)===sex)return a;g.wildlife.remove(a);}throw Error('sex');}
check('All 200 regional species have bounded shared profiles and valid food webs',()=>{
  let count=0;
  for(const map of ['pnw','amazon','serengeti','atlanta','chinandega','reef','sumatra']) {
    reset(map);for(const d of ANIMALS){assert(Array.isArray(d.behavior.forage));assert(d.behavior.partners<=3);for(const k of d.prey||[])assert(ANIMAL[k]);count++;}
  }
  assert.equal(count,200);
});
check('Eating differs by habitat across every map and never creates additional animals',()=>{
  for(const [map,key,food] of [['pnw','rabbit','grass'],['atlanta','anole','insects'],['amazon','anteater','insects'],['serengeti','topi','grass'],['chinandega','iguana','browse'],['reef','greenturtle','seagrass'],['sumatra','pangolin','insects']]) {
    const {wl,w,i}=reset(map);const a=spawn(key),d=ANIMAL[key];
    if(food==='insects')w.insects[i]=.8;
    if(food==='grass'||food==='seagrass') {const p=PLANTS.find(p=>p&&p.layer===0&&(food==='seagrass'?['seagrass','spoongrass'].includes(p.look.type):['grass','tallgrass','sedge'].includes(p.look.type)));assert(p);w.ground[i]=p.id;w.groundG[i]=.9;}
    if(food==='browse'){const p=PLANTS.find(p=>p&&p.layer===1&&!p.invasive);w.shrub[i]=p.id;w.shrubG[i]=.9;}
    assert.equal(rig(()=>forageChoose(wl,a,d)),true,`${map}/${key}`);assert.equal(a.state,'forage');assert.equal(a.forage.food,food);
    forageUpdate(wl,a,d,4);assert.equal(a.hunger,0);assert.equal(a.state,'idle');assert.equal(wl.agents.length,1);
    if(food==='seagrass')assert(w.groundG[i]<.9&&w.groundG[i]>=.25);
  }
});
check('Foragers abandon removed food and never eat from a remote remembered tile',()=>{
  const {wl,w,i}=reset('sumatra');const a=spawn('pangolin');w.insects[i]=1;
  rig(()=>forageChoose(wl,a,ANIMAL.pangolin));w.insects[i]=0;
  forageUpdate(wl,a,ANIMAL.pangolin,.1);assert.equal(a.state,'idle');assert.equal(a.hunger,12);
  w.insects[i]=1;a.forageAfter=0;rig(()=>forageChoose(wl,a,ANIMAL.pangolin));a.x+=1;
  forageUpdate(wl,a,ANIMAL.pangolin,4);assert.equal(a.hunger,12);
});
check('Food searches respect fences and remain in the local habitat patch',()=>{
  const {wl,w,i}=reset('serengeti'),a=spawn('topi'),p=PLANTS.find(p=>p&&p.layer===0&&p.look.type==='grass');
  assert(p);w.ground[i+2]=p.id;w.groundG[i+2]=.9;
  for(let y=0;y<w.h;y++)w.feature[w.idx(41,y)]=F.FENCE;
  assert.equal(rig(()=>forageChoose(wl,a,ANIMAL.topi)),false);
  w.feature[i+1]=0;a.forageAfter=0;assert(rig(()=>forageChoose(wl,a,ANIMAL.topi)));
  assert.equal(a.state,'walk');assert.equal(a.forageGoal,i+2);assert(a.path.every(j=>passable(w,j,a)));
});
check('Canopy leaf specialists feed on leaves outside the fruit season',()=>{
  for(const [map,key] of [['amazon','howler'],['amazon','sloth'],['chinandega','congo'],['sumatra','langur']]) {
    const {wl,w,i}=reset(map),a=spawn(key),p=PLANTS.find(p=>p&&p.layer===2&&!p.invasive&&!p.look.fruit);
    assert(p);w.tree[i]=p.id;w.treeG[i]=.9;
    assert.equal(foodAt(wl,ANIMAL[key],i),'leaves');assert(rig(()=>forageChoose(wl,a,ANIMAL[key])));
    forageUpdate(wl,a,ANIMAL[key],4);assert.equal(a.hunger,0);assert.equal(w.treeG[i],Math.fround(.9));
  }
});
check('Insect bats and fruit bats retain distinct food choices; nectar feeders stay airborne',()=>{
  for(const [map,key,food] of [['pnw','bat','insects'],['chinandega','bat','fruit'],['atlanta','hummingbird','nectar']]) {
    const {wl,w,i}=reset(map),a=spawn(key),d=ANIMAL[key];
    w.insects[i]=1;w.nectar[i]=1;
    if(food==='fruit'){const p=PLANTS.find(p=>p&&p.layer===2&&p.look.fruit);assert(p);g.day=p.look.fruit[0]*10;w.tree[i]=p.id;w.treeG[i]=.9;}
    assert(rig(()=>forageChoose(wl,a,d)));assert.equal(a.forage.food,food);if(food!=='fruit')assert.equal(a.flying,true);
  }
});
check('Terrestrial predators cannot catch airborne prey in any difficulty',()=>{
  for(const diff of ['relaxed','standard','challenging']) {
    const {wl}=reset('pnw',diff),p=spawn('bobcat'),b=spawn('rabbit',41,30);b.flying=true;b.alt=1;
    assert.equal(wl.startHunt(p,ANIMAL.bobcat),false);b.flying=false;b.alt=0;assert.equal(wl.startHunt(p,ANIMAL.bobcat),true);
  }
});
check('Waders stalk on foot and strike nearby shoreline fish; raptors still dive',()=>{
  const {wl,w,i}=reset('atlanta','challenging'),a=spawn('heron'),b=spawn('bluegill',41,30);
  w.terrain[i+1]=T.POND;w.distWater.fill(1);assert.equal(huntStyle(ANIMAL.heron).grounded,true);
  assert(wl.startHunt(a,ANIMAL.heron));assert.equal(a.flying,false);
  const rng=g.rng;g.rng=()=>0;try{rig(()=>wl.update(.05));}finally{g.rng=rng;}assert(!wl.agents.includes(b));assert.equal(a.state,'feed');assert.equal(a.alt,0);
  reset('pnw');assert.equal(huntStyle(ANIMAL.hawk).circle,true);
});
check('Grounded hunting cannot chase a fish across a deep-water barrier',()=>{
  const {wl,w}=reset('atlanta','challenging'),a=spawn('heron'),b=spawn('bluegill',45,30);
  w.terrain.fill(T.POND);w.terrain[w.idx(40,30)]=T.SOIL;assert.equal(wl.startHunt(a,ANIMAL.heron),false);
});
check('Coyote hunts recruit at most one companion, with bounded larger packs',()=>{
  for(const [map,key,preyKey,limit] of [['pnw','coyote','rabbit',1],['serengeti','lion','gazelle',3]]) {
    const {wl}=reset(map),a=spawn(key),b=spawn(preyKey,44,30);
    for(let n=0;n<7;n++)spawn(key,40,31);a.huntTime=5;beginHunt(wl,a,ANIMAL[key],b);
    assert.equal(wl.agents.filter(o=>o.assist).length,limit);
  }
});
check('Reef and freshwater fish escape failed catches without crossing dry land',()=>{
  for(const [map,key,pred] of [['reef','chromis','trout'],['atlanta','bluegill','bass']]) {
    const {wl,w}=reset(map),a=spawn(key,41,30),p=spawn(pred);
    w.terrain.fill(map==='reef'?T.CREEK:T.POND);if(map==='reef')w.vh.fill(-2);
    w.terrain[w.idx(42,30)]=T.SOIL;if(map==='reef')w._shore=new Uint8Array(w.n);if(map==='reef')w._shore[w.idx(42,30)]=1;
    rig(()=>missed(wl,a,p));assert.equal(a.state,'walk');assert(a.path?.length);assert(passable(w,a.path[0],ANIMAL[key]));assert.notEqual(a.path[0],w.idx(42,30));
  }
});
check('Male topi lock horns; giraffe males neck side by side; females never enter male bouts',()=>{
  for(const [key,style] of [['topi','horns'],['giraffe','necking']]) {
    const {wl}=reset('serengeti'),a=male(key),b=male(key);a.x=40;b.x=41.1;a.y=b.y=30.5;
    assert(rig(()=>greet(wl,a,ANIMAL[key])));arrive(wl,a);
    assert.equal(a.state,'spar');assert.equal(a.sparStyle,style);assert.equal(b.sparStyle,style);
    if(style==='necking')assert.equal(a.sparHeading,b.sparHeading);
    reset('serengeti');const f=male(key,false),other=male(key,false);f.x=40;other.x=41.1;f.y=other.y=30.5;
    rig(()=>greet(g.wildlife,f,ANIMAL[key]));arrive(g.wildlife,f);assert.notEqual(f.state,'spar');
  }
  reset('serengeti');assert.equal(ANIMAL.zebra.behavior.combat,null);assert.equal(ANIMAL.elephant.behavior.combat,null);
});
check('Cleaner meals require a client and an established station; client hunger stays unchanged',()=>{
  const {wl,w,i}=reset('reef'),a=spawn('cleaner'),client=spawn('trout',41,30);w.vh.fill(-2);
  w.tree[i]=PLANT.boulder.id;w.treeG[i]=.9;w.treeAge[i]=5000;wl.suit[a.sp][i]=1;
  assert(rig(()=>cleanerChoose(wl,a,ANIMAL.cleaner)));assert.equal(client.state,'forage');assert.equal(client.forage.food,'cleaned');
  forageUpdate(wl,a,ANIMAL.cleaner,4);forageUpdate(wl,client,ANIMAL.trout,4);
  assert.equal(a.hunger,0);assert.equal(client.hunger,12);assert.equal(wl.agents.length,2);
  a.forageAfter=0;wl.remove(client);assert.equal(rig(()=>cleanerChoose(wl,a,ANIMAL.cleaner)),false);
});
check('Fire interrupts feeding and feeding progress is inert while the game is paused',()=>{
  const {wl,w,i}=reset('sumatra'),a=spawn('pangolin');w.insects[i]=1;rig(()=>forageChoose(wl,a,ANIMAL.pangolin));
  const left=a.forage.left;wl.update(0);assert.equal(a.forage.left,left);
  w.fire[i]=1;rig(()=>fleeFire(wl,a,ANIMAL.pangolin));assert.notEqual(a.state,'forage');assert.equal(a.forage,null);
});
check('Saving during a meal restores animal identities and revalidates transient food goals',()=>{
  const {wl,w,i}=reset('sumatra'),a=spawn('pangolin');w.insects[i]=1;rig(()=>forageChoose(wl,a,ANIMAL.pangolin));
  const data=g.saveData(),restored=new Game();assert(restored.restoreSave(data));const b=restored.wildlife.agents.find(b=>b.id===a.id);
  assert.equal(b.key,'pangolin');assert.equal(b.state,'idle');assert.equal(b.forage,null);assert.equal(b.hunger,12);
});
console.log(`${checks} researched wildlife behavior checks passed.`);
