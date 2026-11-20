// Frame cost in an organically grown game, through the real frame loop: a restored farm whose
// wildlife arrives and breeds for a few years, then a normal view, a wide view, top speed and a
// close-up (and, named in PLAY_VIEWS, the game's closest zoom). Prints simulation vs drawing
// (processor) vs GPU time and where the drawing time goes.
//   node tools/play-profile.mjs [maps=serengeti,sumatra,amazon,pnw] [quality=high] [years=3]
// PLAY_ROOT=<checkout> measures another checkout (an A/B; its ecology diverges, so compare
// phases rather than single numbers). PLAY_VIEWS="top speed" (comma-separated) runs only those views.
// PLAY_SETUP=<js> runs in the page before the views, with the renderer as R (e.g. "R.autoRes=false;R.setRes(1)"
// to hold the resolution, so the automatic resolution can't change what an A/B draws). PLAY_FARM=<path under the
// checkout> loads that farm file (.sgfarm, e.g. an old forest grown headless) instead of growing the fixture's farm, and
// 'zoom sweep' (in PLAY_VIEWS) wheels the view in and out between the widest and closest zoom while sampling.
// Uses the hardware GPU at 1440x900, DPR 2 (a Retina laptop);
// GPU time comes from the game's own timer queries. Writes tools/release-output/play-profile.json.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot } from './browser-session.mjs';

const [maps = 'serengeti,sumatra,amazon,pnw', quality = 'high', years = '3'] = process.argv.slice(2);
const VIEWS = [['play', 1, .7], ['wide', 1, .25], ['top speed', 3, .7], ['close', 1, 2], ['closest', 1, 4.5], ['zoom sweep', 1, .7]]
  .filter(([view]) => process.env.PLAY_VIEWS ? process.env.PLAY_VIEWS.split(',').includes(view) : view !== 'closest' && view !== 'zoom sweep');
const FARM = process.env.PLAY_FARM ? JSON.stringify('/' + process.env.PLAY_FARM.replace(/^\/+/, '')) : null;
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
      const farm=${FARM};
      if(farm){const {decodeFarm}=await import('/js/share-file.js'); if(!game.restoreSave(await decodeFarm(new Uint8Array(await (await fetch(farm)).arrayBuffer())))) throw new Error('Restore failed');}
      else if(!game.restoreSave(fx.game.saveData())) throw new Error('Restore failed');
      if(!farm) for (const f of ['tree','treeG','shrub','ground']) game.border[f].set(fx.game.border[f]);
      if (ui.modalOpen) ui.closeModal(); ui.afterNewGame(); ui.refreshTop(true);
      game.speed=0;
      if(!farm) for(let d=0;d<${Number(years)}*120;d++){game.dailyTick(); for(let k=0;k<10;k++) game.wildlife.update(.1);}
      return fx.center;})()`, 600000);
    for (const [view, speed, zoom] of VIEWS) {
      const row = await browser.evaluate(`(async()=>{
        const {game,renderer:R,ui}=window.secondGrowth;
        const {PerformancePhases}=await import('/js/performance.js');
        ${process.env.PLAY_SETUP || ''};
        game.speed=${speed}; R.zoom=${zoom}; R.zoomGoal=null; R.centerOn(${center.join(',')}); R.updateCamera();
        await new Promise(r=>setTimeout(r,3000));
        const probes=new PerformancePhases(game,R), total={}, frames=[], frame=ui.frame;
        ui.frame=function(...a){const r=frame.apply(this,a); let sum=0; for(const k in probes.times){total[k]=(total[k]||0)+probes.times[k]; sum+=probes.times[k];} frames.push(sum); probes.reset(); return r;};
        // (real frame intervals, for the stutter a phase total misses; the sweep wheels 1.4x every quarter second)
        const gaps=[]; let last=performance.now(), live=true;
        const tick=t=>{gaps.push(t-last); last=t; if(live) requestAnimationFrame(tick);}; requestAnimationFrame(tick);
        let dir=1; const sweep=${JSON.stringify(view)}==='zoom sweep'&&setInterval(()=>{
          const z=R.zoomGoal??R.zoom; if(z>=4.4) dir=-1; else if(z<=.21) dir=1;
          R.zoomAt(innerWidth/2,innerHeight/2,dir>0?1.4:1/1.4,true);},250);
        R.perfSample(true);
        await new Promise(r=>setTimeout(r,8000));
        live=false; if(sweep) clearInterval(sweep);
        ui.frame=frame; probes.dispose();
        gaps.sort((a,b)=>a-b);
        const s=R.perfSample(false), n=frames.length; frames.sort((a,b)=>a-b);
        return {fps:s.fps, simulationMs:s.cpu_simulation_ms, simulationP95Ms:s.cpu_simulation_p95_ms, drawingCpuMs:s.cpu_render_ms, drawingCpuP95Ms:s.cpu_render_p95_ms,
          gpuMs:s.gpu_frame_ms, gpuP95Ms:s.gpu_frame_p95_ms, slowestFrameMs:+frames[n-1].toFixed(1),
          frameP95Ms:+gaps[Math.floor(gaps.length*.95)].toFixed(1), longestGapMs:+gaps[gaps.length-1].toFixed(1), gapsOver50:gaps.filter(g=>g>50).length,
          plantInstances:R.flora.plantView.stats.candidates, plantVisible:R.flora.plantView.stats.visible,
          phasesPerFrameMs:Object.fromEntries(Object.entries(total).map(([k,v])=>[k,+(v/n).toFixed(2)])),
          triangles:s.triangles, drawCalls:s.draw_calls, pixelRatio:s.pixel_ratio, quality:s.quality, farModels:s.far_models,
          animals:game.wildlife.agents.length, closeUp:[...R.actors.fauna.species.values()].reduce((n,p)=>n+(p.close?.count||0),0), carcasses:(game.wildlife.carcasses||[]).length, day:game.day};})()`, 120000);
      browser.assertHealthy();
      rows.push({ map, view, speed, zoom, ...row });
      const p = row.phasesPerFrameMs;
      console.log(`${map} ${view}: ${row.fps} fps | sim ${row.simulationMs} ms, drawing ${row.drawingCpuMs} ms (plants ${p.plants ?? 0}, plant culling ${((p.visibility ?? 0) + (p.shadowSelection ?? 0)).toFixed(2)}, animals ${p.actors ?? 0}), GPU ${row.gpuMs} ms | slowest ${row.slowestFrameMs} ms, frame p95 ${row.frameP95Ms} ms, longest gap ${row.longestGapMs} ms (${row.gapsOver50} over 50) | plants ${row.plantVisible}/${row.plantInstances} drawn | ${(row.triangles / 1e6).toFixed(1)}M triangles, ${row.animals} animals${row.closeUp ? ` (${row.closeUp} drawn close up)` : ''}`);
    }
  }
} finally {
  await browser.close();
  const out = join(projectRoot, 'tools/release-output'); await mkdir(out, { recursive: true });
  await writeFile(join(out, 'play-profile.json'), JSON.stringify({ maps, quality, years, rows }, null, 2));
}
