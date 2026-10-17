// Controlled resource landscape: ordinary decisions, family behavior and real traffic.
// TRAIL_BASELINE=1 TRAIL_ROOT=/old/checkout observes the old behavior with the same
// movement-to-wear recorder, so concentration is compared at the same visibility threshold.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { recordTrailStep,trailPorts,TRAIL_THRESHOLD } from '../js/sim/animal-trails.js';
import { createTrailFixture } from './animal-trails-fixtures.mjs';
import { T,DAYS_PER_YEAR } from '../js/config.js';
const root=process.env.TRAIL_ROOT;
const {Game}=await import(root?pathToFileURL(root+'/js/game.js').href:'../js/game.js');
const cases=[['pnw','elk'],['amazon','peccary'],['serengeti','buffalo'],['atlanta','deer'],['chinandega','cattle'],['sumatra','sambar']];
const rows=[];
for(const seed of [1987,91])for(const [map,key] of cases){
 const {g,animals}=createTrailFixture(Game,map,key,seed),wl=g.wildlife,w=g.world,d=g.catalog.animal[key];
 const memories=new Set(),trips=new Set();let maxDistance=0;
 for(let day=0;day<100;day++){
  wl.daily();for(let k=0;k<20;k++){
   const before=process.env.TRAIL_BASELINE?animals.map(a=>[a.x,a.y]):null;
   wl.update(.05);
   for(let n=0;n<animals.length;n++){
    const a=animals[n];if(before)recordTrailStep(wl,a,d,...before[n]);
    assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.y));
    maxDistance=Math.max(maxDistance,Math.hypot(a.x-40,a.y-40));
    if(a.range){memories.add(a.range.feed+':'+a.range.rest);if(a.range.goal)trips.add(a.id+':'+a.range.next);}
   }
  }g.day++;
  if(day===49)wl.load(JSON.parse(JSON.stringify(wl.serialize())));
  // Keep observing the current agents after restore, including family identifiers.
  if(day===49)animals.splice(0,animals.length,...wl.agents);
 }
 const edges=[...(w.trailE||[]),...(w.trailS||[])].filter(v=>v>0).sort((a,b)=>b-a);
 const sum=edges.reduce((a,b)=>a+b,0),visible=edges.filter(v=>v>TRAIL_THRESHOLD).length;
 const topShare=edges.slice(0,60).reduce((a,b)=>a+b,0)/Math.max(sum,.001);
 const row={map,key,seed,memories:memories.size,repeatTripKinds:trips.size,edges:edges.length,visible,top60Share:+topShare.toFixed(3),maxDistance:+maxDistance.toFixed(1)};rows.push(row);console.log(JSON.stringify(row));
 if(!process.env.TRAIL_BASELINE&&!process.env.TRAIL_AUDIT){assert.ok(memories.size&&trips.size,`${map}: repeated resource trips occur`);assert.ok(visible>5,`${map}: recurring traffic makes visible trails`);}
 if(process.env.TRAIL_SAVE && map==='pnw' && seed===1987)await writeFile(process.env.TRAIL_SAVE,JSON.stringify(g.saveData(),(key,value)=>value instanceof Uint8Array?Buffer.from(value).toString('base64'):value));
}
console.log(process.env.TRAIL_BASELINE?'BASELINE movement concentration observed':'PASS resource travel, visible repeated traffic and mid-run saves on six land maps and two seeds');
