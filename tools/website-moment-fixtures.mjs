// Review-only encounter setup using production behavior and keystone moment triggers.
// These are staged studies, never represented as unassisted campaign captures.
import {isMaleVariant} from '../js/data/animals.js';
import {riverRow} from '../js/world.js';
import {isWater,T} from '../js/config.js';
import {greet} from '../js/sim/animal-life.js';
import {foodAt,forageChoose,cleanerChoose} from '../js/sim/animal-foraging.js';
import {fruitAt,primateChoose,primateUpdate} from '../js/sim/primate-behavior.js';
import {momentsUpdate,momentScene} from '../js/sim/moments.js';
export function websiteMoment(g,pose){
  const w=g.world,wl=g.wildlife,events=[];
  g.flags.moments={};g.flags.lastMomentDay=-1e9;g.on('moment',event=>events.push(event));
  const rig=fn=>{const before=Math.random;Math.random=()=>0;try{return fn();}finally{Math.random=before;}};
  function find(predicate,cx,cy){
    let tile=-1,best=Infinity;
    for(let i=0;i<w.n;i++){if(!predicate(i))continue;const d=(i%w.w-cx)**2+(Math.floor(i/w.w)-cy)**2;if(d<best){best=d;tile=i;}}
    if(tile<0)throw Error('No suitable moment resource for '+g.map);return tile;
  }
  const at=(key,i,habitat='land')=>pose(key,i%w.w,Math.floor(i/w.w),habitat);
  let key,focus=null,frame,description;
  if(g.map==='pnw'){
    key='elkRut';while(g.month!==7)g.day++;
    const def=g.catalog.animal.elk;
    const elk=(x,y,male)=>{while(isMaleVariant(def,{id:wl.nextId,age:600})!==male)wl.nextId++;const a=pose('elk',x,y);a.age=600;return a;};
    const a=elk(61,58,true),b=elk(63,58,true),cow=elk(61,61,false);cow.haremOf=a.id;
    if(!rig(()=>greet(wl,a,def)))throw Error('Elk study could not begin a real bout');
    for(let n=0;n<100&&(a.sparPath?.length||b.sparPath?.length||Math.hypot(a.x-a.sparAt[0],a.y-a.sparAt[1])>.04||Math.hypot(b.x-b.sparAt[0],b.y-b.sparAt[1])>.04);n++)wl.update(.05);
    momentsUpdate(g);frame=[(a.x+b.x)/2,(a.y+b.y)/2,7.2];
    description='Two adult Roosevelt elk during the antler-contact beat of the autumn rut. The bout is initialized through the production social behavior.';
  }
  if(g.map==='amazon'||g.map==='sumatra'){
    key=g.map==='amazon'?'howler':'orangutans';const species=g.map==='amazon'?'howler':'orangutan';
    let tile=-1;
    for(let month=0;month<12&&tile<0;month++){
      while(g.month!==month)g.day++;
      try{tile=find(i=>!!w.tree[i]&&fruitAt(g,i),g.map==='amazon'?54:61,g.map==='amazon'?47:39);}catch{}
    }
    if(tile<0)throw Error('No mature fruit resource for canopy moment');
    focus=at(species,tile,'tree');const def=g.catalog.animal[species];
    for(let n=0;n<40&&!focus.fruitMeal;n++){focus.fruitAfter=0;primateChoose(wl,focus,def);}
    if(!focus.fruitMeal)throw Error('Canopy study lacks an actual fruit meal');
    primateUpdate(wl,focus,def,.9);momentsUpdate(g);
    frame=[focus.x,focus.y,g.map==='sumatra'?14:16];
    description='A feeding pause on a mature seasonal fruit tree. Production primate feeding and the live canopy moment supply the pose; the selected-animal canopy reveal keeps the subject visible.';
  }
  if(g.map==='serengeti'){
    key='elephant';const def=g.catalog.animal.elephant;
    const tile=find(i=>!w.tree[i]&&!!w.shrub[i]&&foodAt(wl,def,i)==='browse',49,42);
    focus=at('elephant',tile);pose('elephant',Math.floor(focus.x)+2,Math.floor(focus.y)+1);
    const calf=pose('elephant',Math.floor(focus.x)+1,Math.floor(focus.y)+3);calf.juvenile=true;calf.age=90;
    if(!rig(()=>forageChoose(wl,focus,def))||focus.state!=='forage')throw Error('Elephant study lacks a browse meal');
    momentsUpdate(g);frame=[focus.x+.8,focus.y+.8,5.6];
    description='An African elephant browsing native shrubs with another adult and a calf nearby. The production forage and family-moment conditions are active.';
  }
  if(g.map==='atlanta'){
    key='monarchs';while(g.month!==6)g.day++;
    const plants=['milkweed','goldenrod','aster'].map(k=>g.catalog.plant[k]).filter(Boolean);
    if(!plants.length)throw Error('Missing native monarch garden plants');
    for(let y=21;y<=25;y++)for(let x=18;x<=23;x++){const i=w.idx(x,y);if(w.struct[i]<0&&w.terrain[i]!==T.ROAD){w.ground[i]=0;w.tree[i]=0;w.shrub[i]=0;w.setPlant(i,plants[(x+y)%plants.length],1);}}
    g.refreshEnvironment();
    for(let n=0;n<12;n++){const a=pose('monarch',19+n%4,22+Math.floor(n/4));a.age=36;a.flying=true;a.alt=.15+(n%3)*.12;a.phase=n*.7;a.orientation=n*1.2;}
    g.mapDefinition.daily(g);
    // The map's migration wave marks ordinary agents as passing without a
    // bird-passage trajectory. Normalize only that flag for this frozen study.
    for(const a of wl.agents)if(a.passing&&!a.passage)a.passing=false;
    frame=[21,24,10];
    description='A monarch stopover above a staged native flower garden. The map’s actual monarch moment adds the passing migration butterflies.';
  }
  if(g.map==='chinandega'){
    key='hatchlings';while(g.month!==5)g.day++;
    const y=riverRow(29,w.h)-2;
    g.flags.nests=[[29.5,y+.5],[30.5,y+.5]];g.flags.nestDay=g.day-20;g.flags.moments.arribada=0;
    g.mapDefinition.daily(g);for(let n=0;n<8;n++)wl.update(.05);
    frame=[30,y+.6,11];
    description='Olive ridley hatchlings at the beach edge. The map’s production nest-hatching event creates the juveniles and their route toward the sea; nest positions and age are staged.';
  }
  if(g.map==='reef'){
    key='manta';wl.computeSuitability();
    const def=g.catalog.animal.cleaner;
    const tile=find(i=>wl.suit[def.index][i]>.2&&w.tileH(i%w.w,Math.floor(i/w.w))<5&&i%w.w<w.w-1&&!w.tree[i+1]&&!w.shrub[i+1],55,61);
    focus=pose('manta',tile%w.w+1,Math.floor(tile/w.w),'reef');
    const cleaner=at('cleaner',tile,'reef');
    Object.assign(cleaner,{x:tile%w.w+.5,y:Math.floor(tile/w.w)+.5,tx:tile%w.w+.5,ty:Math.floor(tile/w.w)+.5});
    if(!rig(()=>cleanerChoose(wl,cleaner,def)))throw Error('Reef study lacks a cleaning encounter');
    momentsUpdate(g);
    pose('shark',Math.floor(focus.x),Math.floor(focus.y)-1,'reef',1.2);
    pose('parrotfish',Math.floor(focus.x)-1,Math.floor(focus.y)+1,'reef',-.6);
    frame=[focus.x,focus.y,5.8];
    description='A manta at a coral-head cleaning station with a cleaner wrasse. The production cleaner-choice behavior establishes the paired encounter and triggers its live keystone moment. A whitetip reef shark and a parrotfish are posed nearby at normal model scale.';
  }
  const event=events.find(event=>event.key===key);
  if(!event)throw Error('Keystone study did not trigger '+key);
  const scene=momentScene(g,event);
  if(scene?.agent)focus=scene.agent;
  if(g.map==='pnw'&&scene?.stage!=='antlers')throw Error('Elk are not in the antler-contact beat');
  g.selectedAgent=focus;wl.recount();g.speed=0;
  return {key,title:event.title,description,day:g.day,date:g.dateString(),stage:scene?.stage||key,event,focus,frame};
}
