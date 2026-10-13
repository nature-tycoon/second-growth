// Exercise the real cinematic UI, including phone framing and dismiss/reset cleanup.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot, pause } from './browser-session.mjs';

const out = join(projectRoot, 'tools/release-output');
await mkdir(out, { recursive: true });
const b = await openBrowser({ label: 'moments', width: 960, height: 600 });
try {
  await b.evaluate(`localStorage.setItem('second-growth-settings', JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'fast',qualityChosen:true,dayCycle:false,v:2})); sessionStorage.setItem('second-growth-pending', JSON.stringify({map:'serengeti',mode:'free',difficulty:'standard'}));`);
  await b.navigate('/');
  await b.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game boot');
  await b.evaluate(`(async () => {
    const {game:g,ui}=window.secondGrowth; if(ui.modalOpen) ui.closeModal(); g.speed=0; g.autosave=false;
    const {ANIMAL}=await import('/js/data/animals.js');
    const {momentsUpdate,startFeed,scavenge}={...await import('/js/sim/moments.js'),...await import('/js/sim/animal-life.js')};
    g.wildlife.agents=[]; g.wildlife.carcasses=[]; g.wildlife.recount();
    const {T}=await import('/js/config.js');
    for(let y=27;y<36;y++) for(let x=37;x<47;x++) { const i=g.world.idx(x,y); g.world.terrain[i]=T.SOIL; g.world.struct[i]=-1; g.world.tree[i]=0; g.world.feature[i]=0; }
    const spawn=key=>{ const a=g.wildlife.spawn(ANIMAL[key],40,30,{silent:true}); a.x=40.5; a.y=30.5; return a; };
    const lion=spawn('lion'), prey=spawn('wildebeest'); prey.x=43;
    lion.state='hunt'; lion.target=prey.id; lion.hunt={phase:'creep'};
    window.momentTest={lion,prey,spawn,startFeed,scavenge,ANIMAL,momentsUpdate};
    g.selectedAgent=lion; g.speed=3; momentsUpdate(g); g.speed=0;
  })()`);
  await b.waitFor('document.querySelector("#moment.card") && window.secondGrowth.ui.moment?.stage === "stalk"', 'Stalk card');
  assert.equal(await b.evaluate('document.querySelector(".mo-beat").textContent'), 'The stalk');
  await b.evaluate(`window.momentTest.lion.hunt.phase='rush'`);
  await b.waitFor('window.secondGrowth.ui.moment.stage === "chase"', 'Chase beat');
  await b.evaluate(`{ const {game:g}=window.secondGrowth,{lion,prey,startFeed,ANIMAL}=window.momentTest; g.wildlife.remove(prey,'predation'); startFeed(g.wildlife,lion,ANIMAL.lion,prey); }`);
  await b.waitFor('window.secondGrowth.ui.moment.stage === "kill"', 'Carcass beat');
  await b.evaluate(`{ const {game:g}=window.secondGrowth,{spawn,scavenge,ANIMAL}=window.momentTest,c=g.wildlife.carcasses[0];
    const r=Math.random; Math.random=()=>0; try { for(const key of ['hyena','vulture']) { const a=spawn(key); a.x=c.x+.3; a.y=c.y; a.hunger=40; scavenge(g.wildlife,a,ANIMAL[key]); } } finally { Math.random=r; } }`);
  await b.waitFor('window.secondGrowth.ui.moment.stage === "foodweb"', 'Food web beat');
  assert.equal(await b.evaluate('window.secondGrowth.ui.follow === null && !!window.secondGrowth.renderer.focusTile'), true, 'Carcass stays in view');
  for (const [name, width, height] of [['desktop', 960, 600], ['phone', 390, 844], ['landscape', 844, 390]]) {
    await b.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await pause(1300);
    const bounds = await b.evaluate(`(() => { const card=document.querySelector('.mo-card').getBoundingClientRect(), button=document.querySelector('[data-a=go]').getBoundingClientRect(); return {left:card.left,right:card.right,top:card.top,bottom:card.bottom,buttonBottom:button.bottom,w:innerWidth,h:innerHeight}; })()`);
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.w + 1 && bounds.top >= 0 && bounds.bottom <= bounds.h, `${name}: card inside viewport`);
    assert.ok(bounds.buttonBottom <= bounds.bottom, `${name}: Continue accessible`);
    const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(out, `moment-${name}.png`), Buffer.from(data, 'base64'));
  }
  await b.evaluate(`document.querySelector('[data-a=go]').click()`);
  assert.equal(await b.evaluate('window.secondGrowth.game.speed'), 3, 'Original speed restored');
  assert.equal(await b.evaluate('!window.secondGrowth.ui.moment && !window.secondGrowth.ui.follow && !window.secondGrowth.renderer.focusTile && !window.secondGrowth.ui.state.clean && window.secondGrowth.game.selectedAgent === window.momentTest.lion'), true, 'Cinematic cleanup');
  await b.evaluate(`window.secondGrowth.game.speed=0`);
  await b.waitFor('!document.getElementById("moment")', 'Dismiss removes cinematic');
  await b.evaluate(`(async()=>{
    const {game:g,ui}=window.secondGrowth; ui.momentEnded=-1e9; g.flags.moments={}; g.flags.lastMomentDay=-1e9;
    const {lion,prey,momentsUpdate}=window.momentTest; g.wildlife.agents.push(prey); lion.state='hunt'; lion.target=prey.id;
    momentsUpdate(g); g.speed=0; g.newGame(99,'free','standard','serengeti'); g.speed=0;
  })()`);
  await pause(2800);
  await b.waitFor('!document.getElementById("moment") && !window.secondGrowth.ui.follow && !window.secondGrowth.ui.moment && !document.body.classList.contains("moment-on")', 'Reset cancels camera/story timers');
  b.assertHealthy();
  await b.evaluate(`sessionStorage.setItem('second-growth-pending',JSON.stringify({map:'pnw',mode:'free',difficulty:'standard'}))`);
  await b.navigate('/');
  await b.waitFor('window.secondGrowth?.game.map === "pnw" && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'PNW game boot');
  await b.evaluate(`(async()=>{
    const {game:g,ui}=window.secondGrowth;
    if(ui.modalOpen) ui.closeModal(); g.speed=0;
    const {ANIMAL,isMaleVariant}=await import('/js/data/animals.js'),{T}=await import('/js/config.js');
    const {greet}=await import('/js/sim/animal-life.js'),{momentsUpdate}=await import('/js/sim/moments.js');
    ui.momentEnded=-1e9; g.flags.moments={}; g.flags.lastMomentDay=-1e9;
    while(g.month!==7) g.day++;
    g.wildlife.agents=[]; g.wildlife.recount();
    for(let y=25;y<38;y++) for(let x=30;x<55;x++) { const i=g.world.idx(x,y); g.world.terrain[i]=T.SOIL; g.world.struct[i]=-1; g.world.tree[i]=0; g.world.feature[i]=0; g.world.fire[i]=0; }
    const bulls=[]; for(let i=0;bulls.length<2 && i<200;i++) { const a=g.wildlife.spawn(ANIMAL.elk,40,30,{silent:true}); a.age=600; a.juvenile=false; if(isMaleVariant(ANIMAL.elk,a)) bulls.push(a); else g.wildlife.remove(a); }
    const [a,b]=bulls; a.x=39.5; b.x=40.8; a.y=b.y=30.5; a.wait=b.wait=99;
    let cow; for(let i=0;i<200;i++) { cow=g.wildlife.spawn(ANIMAL.elk,40,32,{silent:true}); if(!isMaleVariant(ANIMAL.elk,cow)) break; g.wildlife.remove(cow); } cow.haremOf=a.id;
    const r=Math.random; Math.random=()=>0; try { greet(g.wildlife,a,ANIMAL.elk); } finally { Math.random=r; }
    momentsUpdate(g); g.speed=0;
    for(let i=0;i<50 && (a.sparPath?.length || Math.hypot(a.x-a.sparAt[0],a.y-a.sparAt[1])>.01 || Math.hypot(b.x-b.sparAt[0],b.y-b.sparAt[1])>.01);i++) g.wildlife.update(.05);
  })()`);
  await b.waitFor('window.secondGrowth.ui.moment?.stage === "antlers" && document.querySelector("#moment.card")', 'Elk antler beat');
  await pause(2500);
  assert.equal(await b.evaluate('!window.secondGrowth.ui.follow && !!window.secondGrowth.renderer.focusTile'), true, 'Both bulls framed together');
  const { data: elkImage } = await b.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(out, 'moment-elk.png'), Buffer.from(elkImage, 'base64'));
  await b.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await b.evaluate('!window.secondGrowth.ui.moment && window.secondGrowth.game.speed===0'), true, 'Escape restores pause');
  b.assertHealthy();
  console.log('PASS Live hunt/scavenger and elk beats, desktop/phone framing, speed restoration and reset cleanup');
} finally { await b.close(); }
