// Exact appearance and integrated renderer checks; optional local GPU measurements.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot } from './browser-session.mjs';

let browser;
const software = !!process.env.CI, out = join(projectRoot, 'tools/release-output');
await mkdir(out, { recursive: true });
const report = { comparisons: [], gameplay: [], benchmark: null };
try {
  for (const map of ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'reef', 'sumatra']) {
    browser = await openBrowser({ label: 'plant-render-' + map, software });
    try {
      await browser.navigate('/tools/plant-view-review.html?render-audit&map=' + map);
      await browser.waitFor('!!window.plantRenderChecks?.done || !!window.plantViewChecks?.error', 'Vertex/shadow audit: ' + map, 240000);
      const result = await browser.evaluate('window.plantRenderChecks || window.plantViewChecks');
      if (result.error) throw new Error(result.error);
      assert.equal(result.passed.length, 1); assert.ok(result.metrics.length >= 25);
      report.comparisons.push(...result.metrics); browser.assertHealthy();
      console.log('PASS ' + result.passed[0]);
    } finally { await browser.close(); browser = null; }
  }
  browser = await openBrowser({ label: 'plant-render-game', software });
  const { evaluate } = browser;
  if (process.argv.includes('--bench')) {
    await browser.navigate('/tools/plant-view-review.html');
    await browser.waitFor('typeof window.runPlantRenderBenchmark === "function"', 'Drawing benchmark did not load');
    await evaluate('void window.runPlantRenderBenchmark()');
    await browser.waitFor('window.plantRenderBenchmark?.done', 'Drawing benchmark timed out', 240000);
    report.benchmark = await evaluate('window.plantRenderBenchmark');
    if (report.benchmark.error) throw new Error(report.benchmark.error);
    console.log(JSON.stringify(report.benchmark)); browser.assertHealthy();
  }
  await evaluate(`localStorage.setItem('second-growth-settings', JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'fast',qualityChosen:true,fps:'60',shadows:true,dayCycle:false,v:2})); sessionStorage.setItem('second-growth-pending', JSON.stringify({map:'pnw',mode:'free',difficulty:'standard'}));`);
  await browser.navigate('/');
  await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Actual game did not boot');
  const integrated = await evaluate(`(async()=>{
    const {game,ui,renderer:r}=window.secondGrowth;if(ui.modalOpen)ui.closeModal();game.speed=0;
    const {settings}=await import('/js/settings.js'),{editPlants}=await import('/tools/plant-performance-fixtures.mjs');
    const ctx=r.gl.getContext(),result=[];
    const pixels=()=>{const data=new Uint8Array(ctx.drawingBufferWidth*ctx.drawingBufferHeight*4);ctx.readPixels(0,0,ctx.drawingBufferWidth,ctx.drawingBufferHeight,ctx.RGBA,ctx.UNSIGNED_BYTE,data);return data;};
    for(const quality of ['fast','high']) {
      r.applySettings({...settings,quality,qualityChosen:true,shadows:true,dayCycle:false});r.autoRes=false;
      for(const zoom of [.5,1,2.3]) {
        r.zoom=zoom;r.centerOn(40,32);r.draw(game,ui.state,0);r.panBy(80,40);r.draw(game,ui.state,0);
        r.flora.setOptimizations({indexedGeometry:false,cullShadows:false});r.shadowState=null;r.draw(game,ui.state,0);const a=pixels();
        r.flora.setOptimizations({indexedGeometry:true,cullShadows:true});r.shadowState=null;r.draw(game,ui.state,0);const b=pixels();
        let changed=0,max=0;for(let i=0;i<a.length;i+=4){let d=0;for(let j=0;j<4;j++)d=Math.max(d,Math.abs(a[i+j]-b[i+j]));if(d>1)changed++;max=Math.max(max,d);}
        if(changed>8||max>32)throw new Error('Actual game '+quality+'/'+zoom+': '+changed+' pixels changed, max '+max);
        result.push({quality,zoom,changed,max});
      }
    }
    editPlants(game);r.editDirty=true;r.draw(game,ui.state,0);
    r.flora.setFade(true);r.draw(game,ui.state,0);r.flora.setFade(false);r.draw(game,ui.state,0);
    r.applySettings({...settings,shadows:false});r.draw(game,ui.state,0);r.applySettings({...settings,shadows:true});r.draw(game,ui.state,0);
    if(!r.capture(game,ui.state))throw new Error('Photo capture failed');
    if(ctx.isContextLost()||ctx.getError()!==ctx.NO_ERROR)throw new Error('Actual game WebGL error');
    return result;
  })()`);
  browser.assertHealthy(); report.integrated = integrated;
  console.log('PASS Actual game appearance, settings, zoom/pan, edits, transparency, shadows off/on and photo capture');
  if (process.argv.includes('--bench')) {
    for (const config of [{ map: 'pnw', scene: 'forest' }, { map: 'serengeti', scene: 'herd' }, { map: 'pnw', scene: 'planting' }]) {
      const row = { ...config, before: [], after: [] };
      for (let round = 0; round < 2; round++) for (const enabled of round % 2 ? [true, false] : [false, true]) {
        const measurement = await evaluate(`(async()=>{const {measureGameplay}=await import('/tools/gameplay-benchmark.mjs');return measureGameplay(${JSON.stringify({ ...config, optimizations: { indexedGeometry: enabled, cullShadows: enabled } })});})()`);
        row[enabled ? 'after' : 'before'].push(measurement); browser.assertHealthy();
      }
      report.gameplay.push(row); console.log(JSON.stringify(row));
    }
    await browser.send('Page.captureScreenshot', { format: 'png' }).then(r => writeFile(join(out, 'plant-render-game.png'), Buffer.from(r.data, 'base64')));
  }
  console.log(`${report.comparisons.length} plant geometry/shadow pixel comparisons passed.`);
} finally {
  await browser?.close();
  await writeFile(join(out, process.argv.includes('--bench') ? 'plant-render-benchmark.json' : 'plant-render.json'), JSON.stringify(report, null, 2));
}
