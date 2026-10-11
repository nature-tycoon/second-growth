// Compare plant pixels in isolated Chrome: node tools/plant-view-browser-check.mjs [--bench]
import { openBrowser } from './browser-session.mjs';

// Keep the original local GPU path; CI uses deterministic software graphics.
const software = !!process.env.CI;
let browser;
try {
  const metrics = [];
  // A fresh renderer/process per map bounds GPU and model-buffer memory. Keep
  // every angle/detail/edit assertion, rather than relaxing expensive maps.
  for (const map of ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'reef', 'sumatra']) {
    browser = await openBrowser({ label: 'plant-' + map, software });
    try {
      await browser.navigate('/tools/plant-view-review.html?audit&map=' + map);
      await browser.waitFor('!!window.plantViewChecks?.done', 'Plant rendering audit timed out: ' + map, 240000);
      const result = await browser.evaluate('window.plantViewChecks');
      if (result.error) throw new Error(result.error);
      if (result.metrics.length !== 8 || result.passed.length !== 1) throw new Error('Incomplete plant audit: ' + map);
      for (const name of result.passed) console.log('PASS ' + name);
      metrics.push(...result.metrics);
    } finally { await browser.close(); browser = null; }
  }
  console.log(JSON.stringify({ comparisons: metrics.length, examples: metrics.filter(r => r.label.includes('zoom0.8/angle0.79')) }));
  browser = await openBrowser({ label: 'plant-game', software });
  const { send, evaluate, origin, sessionId } = browser;
  if (process.argv.includes('--bench')) {
    await browser.navigate('/tools/plant-view-review.html');
    await browser.waitFor('typeof window.runPlantViewBenchmark === \"function\"', 'Benchmark did not load');
    await evaluate('void window.runPlantViewBenchmark()');
    let bench;
    for (let i = 0; i < 1800; i++) {
      bench = await evaluate('window.plantViewBenchmark');
      if (bench?.done) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!bench?.done || bench.error) throw new Error(bench?.error || 'Benchmark timed out');
    console.log(JSON.stringify(bench));
  }
  // Boot the actual game as well: exercise the integrated renderer, settings,
  // camera motion, editing, see-through trees and photo capture in a fresh profile.
  await evaluate("localStorage.setItem('second-growth-settings', JSON.stringify({analytics:false,music:false,nature:false,quality:'fast',fps:'30',v:2}))");
  await send('Page.navigate', {url:origin+'/'}, sessionId);
  for(let i=0;i<300;i++) { if(await evaluate('!!window.secondGrowth')) break; await new Promise(resolve=>setTimeout(resolve,100)); }
  if(!await evaluate('!!window.secondGrowth')) throw new Error('Actual game did not boot');
  await evaluate(`(async()=>{
    const {game,ui,renderer}=window.secondGrowth; ui.closeModal(); game.speed=0;
    const {settings}=await import('/js/settings.js'); const {editPlants}=await import('/tools/plant-performance-fixtures.mjs');
    const results=[];
    for(const quality of ['fast','high']) {
      renderer.applySettings({...settings,quality});
      for(const zoom of [.5,1,2.3]) {renderer.zoom=zoom;renderer.centerOn(40,32);renderer.draw(game,ui.state,0);renderer.panBy(80,40);renderer.draw(game,ui.state,0);results.push({quality,zoom,instances:renderer.flora.plantView.stats.visible});}
    }
    editPlants(game);renderer.editDirty=true;renderer.draw(game,ui.state,0);
    renderer.flora.setFade(true);renderer.draw(game,ui.state,0);renderer.flora.setFade(false);renderer.draw(game,ui.state,0);
    const image=renderer.capture(game,ui.state);if(!image)throw new Error('Photo capture failed');
    const gl=renderer.gl.getContext();const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error('WebGL error '+error);
    return results;
  })()`);
  console.log('PASS Actual game boots, pans, changes zoom/detail, edits plants, fades trees and captures a photo without WebGL errors');
} finally {
  await browser?.close();
}
