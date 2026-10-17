// Fresh regional studies and an actual same-save restoration sequence for review.
// Run under nice -n 15. No simulation code, player saves or deployed files are changed.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Game} from '../js/game.js';
import {ToolActions} from '../js/tool-actions.js';
import {T,F,isWater} from '../js/config.js';
import {mulberry32} from '../js/rng.js';
import {openBrowser,projectRoot} from './browser-session.mjs';
const out=fileURLToPath(new URL('../website/review-media/',import.meta.url));
const sources=fileURLToPath(new URL('../dist/website-capture-source/',import.meta.url));
await mkdir(out,{recursive:true});await mkdir(sources,{recursive:true});
const mapNames=['pnw','amazon','serengeti','atlanta','chinandega','reef','sumatra'];
const selected=process.argv.find(a=>a.startsWith('--maps='))?.slice(7).split(',');
if(selected?.some(map=>!mapNames.includes(map)))throw Error('Unknown map in --maps');
const moments=process.argv.includes('--moments');
if(moments&&!selected)throw Error('Generate the baseline set first, then use --maps=... with --moments.');
const previous=selected?JSON.parse(await readFile(out+'content-provenance.json','utf8')):null;
let sequence=previous?.sequence;
const captures=[],actionsLog=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
if(!selected){
  const g=new Game();Math.random=mulberry32(20261017);g.newGame(1987,'free','standard','pnw');
  for(let n=0;n<20;n++)g.dailyTick();
  const w=g.world,actions=new ToolActions(g,{refreshEnvironment:false});
  const metrics=()=>({day:g.day,date:g.dateString(),culvert:!!w.feature[w.idx(54,75)],planted:g.stats.planted,trees:g.stats.treesPlanted||0,fishAccess:w.connected[w.idx(54,70)]});
  const stages={};
  async function saveStage(stage){const save=JSON.stringify(g.saveData(),(key,value)=>value instanceof Uint8Array?Buffer.from(value).toString('base64'):value);await writeFile(sources+'creek-'+stage+'.json',save);stages[stage]={...metrics(),saveSha256:hash(save)};}
  await saveStage('before');
  const tiles=[];for(let y=62;y<=83;y++)for(let x=48;x<=61;x++)if(w.inb(x,y))tiles.push(w.idx(x,y));
  const bank=tiles.filter(i=>!isWater(w.terrain[i])&&w.terrain[i]!==T.ROAD&&w.struct[i]<0);
  const use=(key,ids)=>{const stroke=actions.apply(key,ids,{random:g.rng});if(!stroke)throw Error('Unavailable restoration tool '+key);actionsLog.push({tool:key,count:stroke.count,cost:stroke.cost});};
  use('demolish',[w.idx(54,75)]);use('pull',bank);use('rip',bank);use('mulch',bank);
  const streamside=bank.filter(i=>Math.abs(i%w.w-54)<=3);
  use('mix_riparian',streamside);
  use('mix_pioneer',bank.filter(i=>(i%w.w)%3===0&&Math.floor(i/w.w)%3===0));
  use('mix_meadow',bank);g.refreshEnvironment();await saveStage('planted');
  for(let day=0;day<240;day++){
    g.dailyTick();for(let k=0;k<10;k++)g.wildlife.update(.1);
    if((day+1)%60===0)console.log('Creek sequence advanced '+(day+1)+' days.');
  }
  await saveStage('later');
  if(w.feature[w.idx(54,75)]===F.CULVERT||!actionsLog.some(a=>a.tool==='mix_pioneer'&&a.count))throw Error('Restoration capture lacks its intervention');
  console.log('Same-save creek sequence prepared.',JSON.stringify(stages));
  sequence={seed:1987,difficulty:'standard',initialDay:20,elapsedDays:240,daysPerYear:120,actions:actionsLog,stages,sourceSaves:'dist/website-capture-source/ (local, excluded from website)'};
}
const browser=await openBrowser({label:'site-content',width:1800,height:1200});
async function save(file,data,meta){const bytes=Buffer.from(data.split(',')[1],'base64');await writeFile(out+file,bytes);captures.push({file,width:1800,height:1200,sha256:hash(bytes),...meta});console.log('Captured '+file);}
async function ready(path){await browser.navigate(path);await browser.waitFor('window.websiteScene?.ready','Fresh habitat scene');const error=await browser.evaluate('window.websiteScene.error');if(error)throw Error(error);}
try{
  for(const stage of selected?[]:['before','planted','later']){
    await ready('/tools/website-scenes.html?stage='+stage);
    await save('creek-'+stage+'.jpg',await browser.evaluate('websiteScene.capture()'),{map:'pnw',kind:'same-save sequence',stage,frame:await browser.evaluate('websiteScene.frame'),...sequence.stages[stage]});
  }
  for(const map of selected||mapNames){
    await ready('/tools/website-scenes.html?map='+map+(moments?'&moments=1':''));
    const meta={map,kind:moments?'staged keystone moment study':'staged restored habitat study',day:await browser.evaluate('websiteScene.game.day'),date:await browser.evaluate('websiteScene.game.dateString()'),seed:1987,frame:await browser.evaluate('websiteScene.frame'),posedSpecies:await browser.evaluate('websiteScene.placed'),moment:await browser.evaluate('websiteScene.moment')};
    await save('landscape-'+map+'.jpg',await browser.evaluate('websiteScene.capture()'),meta);
    if(map==='pnw'&&!moments){
      await save('detail-woodland.jpg',await browser.evaluate('websiteScene.capture([79,24,3.8])'),{map,kind:'staged vegetation study',frame:[79,24,3.8]});
      await save('detail-heron.jpg',await browser.evaluate('websiteScene.capture([54,57,6.5])'),{map,kind:'staged wildlife habitat study',frame:[54,57,6.5],posedSpecies:meta.posedSpecies});
    }
    if(map==='reef'&&!moments)await save('detail-coral.jpg',await browser.evaluate('websiteScene.capture([55,61,5.5])'),{map,kind:'staged coral habitat study',frame:[55,61,5.5],posedSpecies:meta.posedSpecies});
    browser.assertHealthy();
  }
}finally{
  await browser.close();
  await writeFile(out+'content-provenance.json',JSON.stringify({sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:projectRoot,encoding:'utf8'}).trim(),capturedAt:new Date().toISOString(),method:'Production renderer and models; captures with moment metadata are staged encounters using production keystone triggers and behavior poses, tightly framed with selected-animal canopy reveal. Regional/detail images are seeded restored fixtures with posed wildlife; PNW foreground bank thinned for visibility. Creek images use one evolving game save and ToolActions, followed by 240 daily ticks with wildlife movement, without editing plant maturity or habitat rules.',sequence,captures:[...(previous?.captures||[]).filter(old=>!captures.some(fresh=>fresh.file===old.file)),...captures]},null,2)+'\n');
}
console.log('Completed '+captures.length+' new captures with provenance.');
