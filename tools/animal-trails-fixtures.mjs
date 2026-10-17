import { mulberry32 } from '../js/rng.js';
import { T,DAYS_PER_YEAR } from '../js/config.js';
export function createTrailFixture(Game,map='pnw',key='elk',seed=1987){
 Math.random=mulberry32(seed);const g=new Game();g.newGame(seed,'free','standard',map);g.day=20;
 const wl=g.wildlife,w=g.world,d=g.catalog.animal[key];wl.agents=[];wl.flyovers=[];wl.recount();wl.passageWait=1e6;
 w.terrain.fill(T.PASTURE);w.feature.fill(0);w.struct.fill(-1);w.fire.fill(0);w.flood.fill(0);w.tree.fill(0);w.shrub.fill(0);w.ground.fill(0);w.vh.fill(1);w.distWater.fill(99);
 wl.suit.forEach(s=>s.fill(.01));
 const grass=g.catalog.plants.find(p=>p&&p.layer===0&&!p.invasive&&['grass','tallgrass','sedge'].includes(p.look.type));
 const tree=g.catalog.plants.find(p=>p&&p.layer===2&&!p.invasive);
 for(let y=32;y<=46;y++)for(let x=30;x<=62;x++){
  const j=w.idx(x,y);wl.suit[d.index][j]=x<42?.65:1;
  if(x>=48){w.ground[j]=grass.id;w.groundG[j]=1;}
  if(x<39&&tree){w.tree[j]=tree.id;w.treeG[j]=.9;}
 }
 const animals=[];for(let n=0;n<8;n++){const a=wl.spawn(d,35+n%4,37+(n/4|0),{silent:true,age:d.mature*DAYS_PER_YEAR+200});a.wait=0;a.hunger=0;a.thirst=0;animals.push(a);}
 return {g,animals};
}
export function runTrailDays(g,days=100){
 for(let day=0;day<days;day++){g.wildlife.daily();for(let k=0;k<20;k++)g.wildlife.update(.05);g.day++;if(day===49)g.wildlife.load(JSON.parse(JSON.stringify(g.wildlife.serialize())));}
 return g;
}
