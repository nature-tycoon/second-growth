// node tools/far-vegetation-review.mjs [maps=sumatra,pnw,serengeti] [qualities=high,fast]
// Before/after screenshots of the far vegetation rule (decision 0022): each view drawn with the far
// models switched off (before: the distant models at every zoom, what a computer that kept up
// used to see) and on (after), in the same frozen scene. Writes tools/release-output/far-vegetation/
// and its index for tools/far-vegetation-review.html (open http://localhost:8347/tools/far-vegetation-review.html).
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot, pause } from './browser-session.mjs';

const [maps = 'sumatra,pnw,serengeti', qualities = 'high,fast'] = process.argv.slice(2);
// (play zoom, just past each Detail level's switch, and the zoomed-out view play-profile measures)
const VIEWS = { high: [['play zoom', 0.62], ['just past the switch', 0.34], ['zoomed out', 0.25]], fast: [['play zoom', 0.62], ['just past the switch', 0.48], ['zoomed out', 0.25]] };
const out = join(projectRoot, 'tools/release-output/far-vegetation');
await mkdir(out, { recursive: true });
const browser = await openBrowser({ label: 'far-vegetation', software: false, width: 1440, height: 900, pixelRatio: 2 });
const shots = [];
try {
  for (const quality of qualities.split(',')) for (const map of maps.split(',')) {
    await browser.evaluate(`localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:${JSON.stringify(quality)},qualityChosen:true,fps:'60',shadows:true,dayCycle:false,wind:false,v:2}));sessionStorage.setItem('second-growth-pending',JSON.stringify({map:${JSON.stringify(map)},mode:'free',difficulty:'standard'}));`);
    await browser.navigate('/');
    await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game did not boot');
    const center = await browser.evaluate(`(async()=>{
      const {game,ui}=window.secondGrowth;
      const {releaseGame}=await import('/tools/release-fixtures.mjs');
      const fx=releaseGame(${JSON.stringify(map)},'forest');
      if(!game.restoreSave(fx.game.saveData())) throw new Error('Restore failed');
      for (const f of ['tree','treeG','shrub','ground']) game.border[f].set(fx.game.border[f]);
      if (ui.modalOpen) ui.closeModal(); ui.afterNewGame(); ui.refreshTop(true);
      game.speed=0; return fx.center;})()`, 600000);
    for (const [view, zoom] of VIEWS[quality]) {
      for (const [when, far] of [['before', false], ['after', true]]) {
        const s = await browser.evaluate(`(async()=>{
          const {renderer:R}=window.secondGrowth;
          R.autoRes=false; R.setRes(1); R.zoom=${zoom}; R.zoomGoal=null; R.centerOn(${center.join(',')}); R.updateCamera();
          R.flora.setFar(${far});
          await new Promise(r=>setTimeout(r,${shots.length ? 1500 : 4000}));
          R.perfSample(true); await new Promise(r=>setTimeout(r,600)); const s=R.perfSample(false);
          return {triangles:s.triangles, farModels:s.far_models, lod:R.flora.view[0]};})()`, 60000);
        await pause(100);
        const { data } = await browser.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
        const file = `${map}-${quality}-${zoom}-${when}.jpg`;
        await writeFile(join(out, file), Buffer.from(data, 'base64'));
        shots.push({ map, quality, view, zoom, when, file, ...s });
        console.log(`${map} ${quality} ${view} (zoom ${zoom}) ${when}: ${(s.triangles / 1e6).toFixed(2)}M triangles, far models ${s.farModels ? 'drawn' : 'not drawn'}`);
      }
    }
    browser.assertHealthy();
  }
} finally {
  await browser.close();
  await writeFile(join(out, 'index.json'), JSON.stringify(shots, null, 2));
}
