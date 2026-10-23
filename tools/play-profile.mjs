// Frame cost in an organically grown game, through the real frame loop: a restored farm whose
// wildlife arrives and breeds for a few years, then a normal view, a wide view, top speed and a
// close-up. Prints simulation vs drawing (processor) vs GPU time and where the drawing time goes.
//   node tools/play-profile.mjs [maps=serengeti,sumatra,amazon,pnw] [quality=high] [years=3]
// PLAY_ROOT=<checkout> measures another checkout (an A/B; its ecology diverges, so compare
// phases rather than single numbers). Uses the hardware GPU at 1440x900, DPR 2 (a Retina laptop);
// GPU time comes from the game's own timer queries. Writes tools/release-output/play-profile.json.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot } from './browser-session.mjs';

const [maps = 'serengeti,sumatra,amazon,pnw', quality = 'high', years = '3'] = process.argv.slice(2);
const VIEWS = [['play', 1, .7], ['wide', 1, .25], ['top speed', 3, .7], ['close', 1, 2]];
const browser = await openBrowser({ label: 'play-profile', ...(process.env.PLAY_ROOT ? { root: process.env.PLAY_ROOT } : {}), software: false, width: 1440, height: 900, pixelRatio: 2 });
const rows = [];
try {
  for (const map of maps.split(',')) {
    await browser.evaluate(`localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:${JSON.stringify(quality)},qualityChosen:true,fps:'60',shadows:true,dayCycle:true,v:2}));sessionStorage.setItem('second-growth-pending',JSON.stringify({map:${JSON.stringify(map)},mode:'free',difficulty:'standard'}));`);
    await browser.navigate('/');
    await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game did not boot');
    const gpu = await browser.evaluate('window.secondGrowth.renderer.gpuName()');
    if (/SwiftShader|llvmpipe|software/i.test(gpu || '')) throw new Error('Hardware graphics unavailable');
    // (the years pass headless, a day and ten wildlife steps at a time, as in balance-sim)
    const center = await browser.evaluate(`(async()=>{
      const {game,renderer,ui}=window.secondGrowth;
      const {releaseGame}=await import('/tools/release-fixtures.mjs');
      const fx=releaseGame(${JSON.stringify(map)},'forest');
      if(!game.restoreSave(fx.game.saveData())) throw new Error('Restore failed');
      for (const f of ['tree','treeG','shrub','ground']) game.border[f].set(fx.game.border[f]);
      if (ui.modalOpen) ui.closeModal(); ui.afterNewGame(); ui.refreshTop(true);
      game.speed=0;
      for(let d=0;d<${Number(years)}*120;d++){game.dailyTick(); for(let k=0;k<10;k++) game.wildlife.update(.1);}
      return fx.center;})()`, 600000);
    for (const [view, speed, zoom] of VIEWS) {
      const row = await browser.evaluate(`(async()=>{
        const {game,renderer:R,ui}=window.secondGrowth;
        const {PerformancePhases}=await import('/js/performance.js');
        game.speed=${speed}; R.zoom=${zoom}; R.zoomGoal=null; R.centerOn(${center.join(',')}); R.updateCamera();
        await new Promise(r=>setTimeout(r,3000));
        const probes=new PerformancePhases(game,R), total={}, frames=[], frame=ui.frame;
        ui.frame=function(...a){const r=frame.apply(this,a); let sum=0; for(const k in probes.times){total[k]=(total[k]||0)+probes.times[k]; sum+=probes.times[k];} frames.push(sum); probes.reset(); return r;};
        R.perfSample(true);
        await new Promise(r=>setTimeout(r,8000));
        ui.frame=frame; probes.dispose();
        const s=R.perfSample(false), n=frames.length; frames.sort((a,b)=>a-b);
        return {fps:s.fps, simulationMs:s.cpu_simulation_ms, simulationP95Ms:s.cpu_simulation_p95_ms, drawingCpuMs:s.cpu_render_ms, drawingCpuP95Ms:s.cpu_render_p95_ms,
          gpuMs:s.gpu_frame_ms, gpuP95Ms:s.gpu_frame_p95_ms, slowestFrameMs:+frames[n-1].toFixed(1),
          phasesPerFrameMs:Object.fromEntries(Object.entries(total).map(([k,v])=>[k,+(v/n).toFixed(2)])),
          triangles:s.triangles, drawCalls:s.draw_calls, pixelRatio:s.pixel_ratio, quality:s.quality, farModels:s.far_models,
          animals:game.wildlife.agents.length, carcasses:(game.wildlife.carcasses||[]).length, day:game.day};})()`, 120000);
      browser.assertHealthy();
      rows.push({ map, view, speed, zoom, ...row });
      const p = row.phasesPerFrameMs;
      console.log(`${map} ${view}: ${row.fps} fps | sim ${row.simulationMs} ms, drawing ${row.drawingCpuMs} ms (plants ${p.plants ?? 0}, animals ${p.actors ?? 0}), GPU ${row.gpuMs} ms | slowest ${row.slowestFrameMs} ms | ${(row.triangles / 1e6).toFixed(1)}M triangles, ${row.animals} animals`);
    }
  }
} finally {
  await browser.close();
  const out = join(projectRoot, 'tools/release-output'); await mkdir(out, { recursive: true });
  await writeFile(join(out, 'play-profile.json'), JSON.stringify({ maps, quality, years, rows }, null, 2));
}
