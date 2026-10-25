// node tools/tree-stature-review.mjs [maps=pnw,atlanta,amazon,sumatra,chinandega,serengeti]
// Before/after screenshots of tree heights (decision 0024): each view drawn with every tree at its
// shape's own height (before) and at its species' height (after, render3d/tree-stature.js), in the
// same frozen forest with the map's biggest ground animals standing at its edge. Writes
// tools/release-output/tree-stature/ and its index for tools/tree-stature-review.html
// (open http://localhost:8347/tools/tree-stature-review.html).
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot, pause } from './browser-session.mjs';

const [maps = 'pnw,atlanta,amazon,sumatra,chinandega,serengeti'] = process.argv.slice(2);
const ANIMALS = { pnw: ['elk', 'deer'], atlanta: ['deer'], amazon: ['jaguar', 'peccary'], sumatra: ['gajah', 'sambar'], chinandega: ['deer', 'cattle'], serengeti: ['giraffe', 'elephant'] };
const VIEWS = [['play zoom', 0.9], ['close', 1.9], ['eye level', null]];
const out = join(projectRoot, 'tools/release-output/tree-stature');
await mkdir(out, { recursive: true });
const browser = await openBrowser({ label: 'tree-stature', software: false, width: 1440, height: 900, pixelRatio: 1 });
const shots = [];
try {
  for (const map of maps.split(',')) {
    await browser.evaluate(`localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'high',qualityChosen:true,fps:'60',shadows:true,dayCycle:false,wind:false,v:2}));sessionStorage.setItem('second-growth-pending',JSON.stringify({map:${JSON.stringify(map)},mode:'free',difficulty:'standard'}));`);
    await browser.navigate('/');
    await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game did not boot');
    // The forest fixture, with the map's biggest ground animals (cows and bulls) on open ground at
    // the edge of its trees, nearest the middle of the view.
    const center = await browser.evaluate(`(async()=>{
      const {game,ui}=window.secondGrowth;
      const {releaseGame}=await import('/tools/release-fixtures.mjs');
      const {ANIMAL,isMaleVariant}=await import('/js/data/animals.js');
      const {DAYS_PER_YEAR}=await import('/js/config.js');
      const fx=releaseGame(${JSON.stringify(map)},'forest');
      if(!game.restoreSave(fx.game.saveData())) throw new Error('Restore failed');
      for (const f of ['tree','treeG','shrub','ground']) game.border[f].set(fx.game.border[f]);
      if (ui.modalOpen) ui.closeModal(); ui.afterNewGame(); ui.refreshTop(true);
      game.speed=0;
      const w=game.world, [cx,cy]=fx.center, spots=[];
      for (let y=1;y<w.h-1;y++) for (let x=1;x<w.w-1;x++) {
        const i=w.idx(x,y); if (w.tree[i]||w.struct[i]>=0) continue;
        let n=0; for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const j=w.idx(x+dx,y+dy); if (w.tree[j]&&w.treeG[j]>0.8) n++; }
        if (n>=2) spots.push([Math.hypot(x-cx,y-cy),x,y]);
      }
      spots.sort((a,b)=>a[0]-b[0]);
      game.wildlife.agents=[]; const placed=[];
      for (const [k,key] of ${JSON.stringify(ANIMALS)}[${JSON.stringify(map)}].entries()) for (const male of [false,true]) {
        const def=ANIMAL[key]; if (!def || male && !def.sprite.male) continue;
        const s=spots.find(s=>placed.every(p=>Math.hypot(p[0]-s[1],p[1]-s[2])>2.5)); if (!s) break;
        while (isMaleVariant(def,{id:game.wildlife.nextId,age:def.mature*DAYS_PER_YEAR+1})!==male) game.wildlife.nextId++;
        const x=s[1]+0.5, y=s[2]+0.5, a=game.wildlife.spawn(def,x,y,{silent:true,age:def.mature*DAYS_PER_YEAR+1});
        Object.assign(a,{x,y,tx:x,ty:y,wait:1e6,orientation:-.35,hunger:0,phase:0,thirst:0}); placed.push([x,y]);
      }
      game.wildlife.recount(); game.refreshEnvironment();
      return placed.length ? [placed.reduce((s,p)=>s+p[0],0)/placed.length, placed.reduce((s,p)=>s+p[1],0)/placed.length] : fx.center;})()`, 600000);
    for (const [view, zoom] of VIEWS) {
      for (const [when, on] of [['before', false], ['after', true]]) {
        const s = await browser.evaluate(`(async()=>{
          const {game,renderer:R}=window.secondGrowth;
          const {setStature}=await import('/js/render3d/tree-stature.js');
          setStature(${on}); R.flora.rebuild(game,true);
          R.autoRes=false; R.setRes(1);
          if (${zoom === null}) { R.zoom=1.6; R.centerOn(${center.join(',')}); R.updateCamera(); R.setEyeLevel(game.wildlife.agents[0]); }
          else { R.setEyeLevel(null); R.zoom=${zoom}; R.zoomGoal=null; R.centerOn(${center.join(',')}); R.updateCamera(); }
          await new Promise(r=>setTimeout(r,${shots.length ? 2500 : 5000}));
          R.perfSample(true); await new Promise(r=>setTimeout(r,600)); const s=R.perfSample(false);
          return {triangles:s.triangles};})()`, 120000);
        await pause(100);
        const { data } = await browser.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
        const file = `${map}-${view.replace(' ', '-')}-${when}.jpg`;
        await writeFile(join(out, file), Buffer.from(data, 'base64'));
        shots.push({ map, view, when, file, ...s });
        console.log(`${map} ${view} ${when}: ${(s.triangles / 1e6).toFixed(2)}M triangles`);
      }
    }
    browser.assertHealthy();
  }
} finally {
  await browser.close();
  await writeFile(join(out, 'index.json'), JSON.stringify(shots, null, 2));
}
