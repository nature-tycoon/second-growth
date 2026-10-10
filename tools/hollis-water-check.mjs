// Production reservoir integration: node tools/hollis-water-check.mjs
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { World } from '../js/world.js';
import { HollisWater, tileWaterVolume, waterModel } from '../js/sim/hollis-water.js';
waterModel.enabled = true; // (the model is off in play until it's ready)
import { T, F } from '../js/config.js';
import { PLANT } from '../js/data/plants.js';
import { updatePlants, plantLimits } from '../js/sim/plants.js';
import { TOOLS } from '../js/tools.js';
import { Undo } from '../js/undo.js';
import { compactSave, saveChecksum, intact } from '../js/saves.js';
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const farm = () => { const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw'); g.autosave = false; return g; };
const rain = g => { g.weather = 'rain'; g.water.step(g); };
check('Triangle storage integrates only the submerged ground', () => {
  assert.equal(tileWaterVolume([0,0,0,0], .4), .4);
  assert.equal(tileWaterVolume([1,1,1,1], .4), 0);
  assert.ok(Math.abs(tileWaterVolume([0,1,1,0], .5) - .125) < 1e-12);
  assert.ok(Math.abs(tileWaterVolume([0,1,1,0], 2) - 1.5) < 1e-12);
});
check('Stock pond refills, overflows at its outlet, and draws down in summer', () => {
  const g = farm(), b = g.water.basins[0], initial = b.volume;
  assert.ok(b.cells.length < 150, 'pond retains its local basin');
  for(let k=0;k<20;k++) rain(g);
  assert.ok(b.volume > initial); assert.equal(b.volume,b.capacity); assert.ok(b.overflow > 0);
  const before=b.volume; g.day=50; g.weather='clear';
  for(let k=0;k<60;k++)g.water.step(g);
  assert.ok(b.volume < before*.4);
  assert.ok(b.cells.some(v=>g.world.terrain[v.i]===T.MUD), 'its shallow edges dry to mud');
  assert.ok(b.volume >= b.floor - 1e-9 && b.core.some(i=>g.world.terrain[i]===T.POND||g.world.terrain[i]===T.MARSH), 'its deep middle keeps water');
  for(let k=0;k<20;k++)rain(g);
  assert.ok(b.core.some(i=>g.world.terrain[i]===T.POND));
});
check('A dam fills connected uphill low ground without a circle or immediate clearing', () => {
  const g=farm(),w=g.world,site=w.idx(54,58),trees=w.tree.slice(),heights=w.vh.slice();
  g.wildlife.buildDam(site); const b=g.water.basins.find(b=>b.kind==='dam');
  assert.deepEqual(w.tree,trees);assert.deepEqual(w.vh,heights);
  assert.deepEqual(b.axis,[0,1]); const initial=b.volume;
  for(let k=0;k<10;k++)rain(g);
  assert.ok(b.volume>initial);assert.ok(b.cells.some(v=>g.water.base[v.i]!==T.CREEK&&w.waterDepth[v.i]>.04));
  assert.ok(b.cells.every(v=>Math.floor(v.i/w.w)<=58));
  for(const v of b.cells)assert.ok(v.threshold<=b.crest);
});
check('The reservoir budget has bounded loss and overflow', () => {
  const g=farm();g.wildlife.buildDam(g.world.idx(54,58));
  for(let k=0;k<80;k++){
    g.day=k;g.weather=k%7<3?'rain':'clear';
    const before=g.water.basins.map(b=>b.volume);g.water.step(g);
    g.water.basins.forEach((b,i)=>{assert.ok(b.volume>=0&&b.volume<=b.capacity);assert.ok(Math.abs(before[i]+b.input-b.loss-b.overflow-b.volume)<1e-10);});
  }
});
check('A removed dam drains gradually and returns its underlying terrain', () => {
  const g=farm(),w=g.world,site=w.idx(54,58);g.wildlife.buildDam(site);
  for(let k=0;k<8;k++)rain(g);
  const volume=g.water.basins.find(b=>b.kind==='dam').volume;
  w.feature[site]=0;g.refreshEnvironment();
  const b=g.water.basins.find(b=>b.kind==='receding');assert.equal(b.volume,volume);
  g.weather='clear';for(let k=0;k<80;k++)g.water.step(g);
  assert.ok(b.volume<volume*.01);
  for(const v of b.cells)if(g.water.base[v.i]!==T.CREEK)assert.equal(w.terrain[v.i],g.water.base[v.i]);
});
check('An isolated hollow behind a high sill stays dry', () => {
  const w=new World(9,9);w.vh.fill(3);w.terrain.fill(T.PASTURE);
  w.terrain[w.idx(4,4)]=T.POND;
  for(const [x,y]of[[4,4],[5,4],[4,5],[5,5]])w.setVert(x,y,0);
  for(const [x,y]of[[1,1],[2,1],[1,2],[2,2]])w.setVert(x,y,-1);
  const h=new HollisWater(w);assert.equal(w.waterManaged[w.idx(1,1)],0);
  assert.ok(h.basins[0].cells.every(v=>v.i!==w.idx(1,1)));
});
check('Terrain tools rebuild basin storage, and undo restores the basin', () => {
  const g=farm(),w=g.world,i=w.idx(93,37),undo=new Undo(g),tool=TOOLS.fill;
  const base=g.water.base.slice(),volume=g.water.basins[0].volume;
  undo.begin(tool);undo.touch(i);assert.equal(tool.apply(g,i),true);g.spend(tool.cost,tool.cat);g.refreshEnvironment();undo.end({count:1,cost:tool.cost});
  assert.equal(g.water.base[i],T.SOIL);
  assert.ok(undo.undo());assert.deepEqual(g.water.base,base);assert.ok(Math.abs(g.water.basins[0].volume-volume)<1e-10);
  const v=w.hv;assert.equal(TOOLS.lower.apply(g,w.idx(92,34)),true);g.refreshEnvironment();assert.ok(w.hv>v);assert.equal(g.water.hv,w.hv);
});
check('Splitting or joining a pond does not duplicate its stored water', () => {
  const g=farm(),w=g.world,b=g.water.basins[0],before=b.volume;
  const strip=b.core.filter(i=>i%w.w===93);
  for(const i of strip)assert.equal(TOOLS.fill.apply(g,i),true);
  g.refreshEnvironment();const split=g.water.basins.filter(b=>b.kind==='pond');assert.equal(split.length,2);
  assert.ok(split.reduce((n,b)=>n+b.volume,0)<=before+1e-10);
  const sum=split.reduce((n,b)=>n+b.volume,0);
  for(const i of strip)assert.equal(TOOLS.pond.apply(g,i),true);
  g.refreshEnvironment();assert.equal(g.water.basins.filter(b=>b.kind==='pond').length,1);
  assert.ok(g.water.basins[0].volume<=sum+1e-10);
});
check('Standing water affects plant diagnostics and only sustained flooding makes snags', () => {
  const g=farm(),w=g.world;g.wildlife.buildDam(w.idx(54,58));for(let k=0;k<8;k++)rain(g);g.refreshEnvironment();
  const b=g.water.basins.find(b=>b.kind==='dam'),i=b.cells.find(v=>g.water.base[v.i]!==T.CREEK&&w.waterDepth[v.i]>.15)?.i;
  assert.ok(i!=null);w.setPlant(i,PLANT.fir,1,1200);
  assert.ok(plantLimits(w,i,PLANT.fir).some(s=>s.includes('standing water')));
  assert.ok(w.moist[i]>.85);w.waterWetDays[i]=0;updatePlants(g);assert.equal(w.tree[i],PLANT.fir.id);
  w.waterWetDays[i]=30;updatePlants(g);assert.equal(w.tree[i],0);assert.equal(w.feature[i],F.SNAG);
});
check('Binary and legacy saves preserve water, wet days, and future evolution', () => {
  const g=farm();g.wildlife.buildDam(g.world.idx(54,58));for(let k=0;k<5;k++)rain(g);
  const saved=g.saveData(), checksum=saveChecksum(saved);assert.ok(intact({data:saved,checksum}));
  const r=new Game();assert.equal(r.restoreSave(compactSave(saved)),true);assert.deepEqual(r.water.serialize(),g.water.serialize());
  rain(g);rain(r);assert.deepEqual(r.water.serialize(),g.water.serialize());
  const legacy=structuredClone(saved);delete legacy.world.water;const l=new Game();assert.ok(l.restoreSave(legacy));assert.ok(l.water);assert.ok(l.water.basins.length>=2);
  const bad=structuredClone(saved);bad.world.water.basins[0].volume=-1;assert.throws(()=>new Game().restoreSave(bad),/reservoir/);
});
check('Reservoirs are exclusive to Hollis; all other maps keep their terrain and save schema', () => {
  for(const map of ['amazon','serengeti','atlanta','chinandega','sumatra','reef']){
    const g=new Game();g.newGame(1987,'free','standard',map);assert.equal(g.water,null);assert.equal(g.world.waterLevel,undefined);assert.equal(g.saveData().world.water,undefined);
  }
});
check('Switched off, Hollis plays as before and saves made under the model load back to their ground', () => {
  const g=farm(),w=g.world;g.weather='clear';g.day=50;for(let k=0;k<60;k++)g.water.step(g);
  const base=g.water.base.slice(),data=g.saveData();assert.ok(data.world.water);
  assert.ok(base.some((t,i)=>t!==w.terrain[i]),'the summer drawdown changed the published terrain');
  waterModel.enabled=false;
  try{
    const off=new Game();off.newGame(1987,'free','standard','pnw');assert.equal(off.water,null);assert.equal(off.world.waterLevel,undefined);assert.equal(off.saveData().world.water,undefined);
    const back=new Game();assert.ok(back.restoreSave(structuredClone(data)));assert.equal(back.water,null);
    assert.ok(Array.from(back.world.terrain).every((t,i)=>t===base[i]),'ponds and wetlands return to their underlying ground');
  }finally{waterModel.enabled=true;}
});
const g=farm();g.wildlife.buildDam(g.world.idx(54,58));const start=performance.now();for(let k=0;k<120;k++)g.water.step(g);
console.log(`${checks} Hollis water checks passed. Water-only 120-day benchmark: ${(performance.now()-start).toFixed(1)} ms.`);
