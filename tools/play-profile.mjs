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
// PLAY_GPU_SPLIT=1 breaks each view's GPU time down (fps-plan.md, session 8): with the players' default wind and
// weather on and the resolution held, it times the view as it is and with shadows off, the shadow map never
// redrawn, cloud shadows off, the other ground (light on Sharp, full on Fast) and 70% resolution, two rounds,
// and prints each one's GPU ms against the view as it is. PLAY_NO_AA=1 makes the page's WebGL contexts
// without antialiasing (run once with and once without to compare; it needs a fresh page, so it's a run of its own;
// PLAY_GPU_SPLIT=base times only the view as is, timer and synced, for that A/B).
// Uses the hardware GPU at 1440x900, DPR 2 (a Retina laptop);
// GPU time comes from the game's own timer queries. Writes tools/release-output/play-profile.json.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot } from './browser-session.mjs';

const [maps = 'serengeti,sumatra,amazon,pnw', quality = 'high', years = '3'] = process.argv.slice(2);
const VIEWS = [['play', 1, .7], ['wide', 1, .25], ['top speed', 3, .7], ['close', 1, 2], ['closest', 1, 4.5], ['zoom sweep', 1, .7]]
  .filter(([view]) => process.env.PLAY_VIEWS ? process.env.PLAY_VIEWS.split(',').includes(view) : view !== 'closest' && view !== 'zoom sweep');
const SPLIT = ['1', 'base'].includes(process.env.PLAY_GPU_SPLIT); // ('base': only the view as is, for an A/B between runs)
// (each variant: what to change, then how to put it back; R is the renderer)
const VARIANTS = process.env.PLAY_GPU_SPLIT === 'base' ? [] : [
  ['no shadows', 'R.sun.castShadow=false', 'R.sun.castShadow=true'],
  ['shadows frozen', 'R.shadowsStale=()=>false', 'delete R.shadowsStale'],
  // (synced draws come too fast for the sun or the half-second floor to redraw the shadow map: this one
  // redraws it every frame, so its synced time less 'as is' is the cost of one redraw)
  ['shadow map every frame', 'R.shadowsStale=()=>true', 'delete R.shadowsStale'],
  ['no cloud shadows', 'R.cloudsOn=false', 'R.cloudsOn=!R.light'],
  ['other ground', 'R.terrain.setFast(!R.light)', 'R.terrain.setFast(R.light)'],
  ['70% resolution', 'R.setRes(.7)', 'R.setRes(1)'],
  // (the timer's floor: what it reads with nothing in the scene drawn, the passes' fixed cost and its own overhead)
  ['nothing drawn', 'R.hidden=R.scene.children.filter(o=>o.visible); for(const o of R.hidden) o.visible=false', 'for(const o of R.hidden) o.visible=true; R.hidden=null'],
];
const FARM = process.env.PLAY_FARM ? JSON.stringify('/' + process.env.PLAY_FARM.replace(/^\/+/, '')) : null;
const browser = await openBrowser({ label: 'play-profile', ...(process.env.PLAY_ROOT ? { root: process.env.PLAY_ROOT } : {}), software: false, width: 1440, height: 900, pixelRatio: 2 });
// (antialiasing is chosen when the WebGL context is made, so it's turned off before the page's code runs)
if (process.env.PLAY_NO_AA === '1') await browser.send('Page.enable').then(() => browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `{
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) { return get.call(this, type, /webgl/.test(type) ? { ...attrs, antialias: false } : attrs); };
}` }));
const rows = [];
try {
  for (const map of maps.split(',')) {
    await browser.evaluate(`localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:${JSON.stringify(quality)},qualityChosen:true,fastHintAt:1,fps:'60',shadows:true,dayCycle:true,v:2${SPLIT ? ',wind:true,weather:true' : ''}}));sessionStorage.setItem('second-growth-pending',JSON.stringify({map:${JSON.stringify(map)},mode:'free',difficulty:'standard'}));`);
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
        ${SPLIT ? 'R.autoRes=false; R.setRes(1);' : ''}
        await new Promise(r=>setTimeout(r,3000));
        const split={};
        ${SPLIT ? `const variants=[['as is',()=>{},()=>{}],${VARIANTS.map(([n, on, off]) => `[${JSON.stringify(n)},()=>{${on}},()=>{${off}}]`).join(',')}];
        for(let round=0;round<2;round++) for(const [name,on,off] of variants){
          on(); await new Promise(r=>setTimeout(r,1000)); R.perfSample(true);
          await new Promise(r=>setTimeout(r,4000)); const s=R.perfSample(false); off();
          (split[name] ||= {timer:[]}).timer.push({gpu:s.gpu_frame_ms, draw:s.cpu_render_ms, fps:s.fps, redraws:s.shadow_redraws/Math.max(.1,s.sample_s)});
        }
        // Synced: each draw waits for the chip to finish (read back by one pixel), so its time is the processor's
        // drawing plus the chip's whole frame (the Mac's timer query read 3-9 ms with nothing drawn). The chip's
        // clock wanders, so the variants take turns in short bursts, many times over, and each keeps its median.
        const gl=R.gl.getContext(), px=new Uint8Array(4);
        const burst=(n,out)=>{for(let i=0;i<n;i++){const t=performance.now(); R.draw(game,ui.state,0); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px); if(out&&i>=2) out.push(performance.now()-t);}};
        for(const [,on,off] of variants){on(); burst(4); off();} // (every variant's shaders built first)
        for(let round=0;round<14;round++){ for(const [name,on,off] of variants){on(); burst(8,split[name].sync ||= []); off();} await new Promise(r=>setTimeout(r,50)); }
        R.perfSample(true);` : ''}
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
          split:Object.fromEntries(Object.entries(split).map(([k,v])=>{const m=f=>+(v.timer.reduce((t,x)=>t+(x[f]??NaN),0)/v.timer.length).toFixed(1), q=[...v.sync].sort((a,b)=>a-b);
            return [k,{gpu:m('gpu'),draw:m('draw'),fps:m('fps'),redraws:m('redraws'),sync:+q[q.length>>1].toFixed(2),syncP25:+q[q.length>>2].toFixed(2),syncN:q.length}];})),
          antialias:R.gl.getContext().getContextAttributes().antialias, animals:game.wildlife.agents.length, closeUp:[...R.actors.fauna.species.values()].reduce((n,p)=>n+(p.close?.count||0),0), carcasses:(game.wildlife.carcasses||[]).length, day:game.day};})()`, SPLIT ? 600000 : 120000);
      browser.assertHealthy();
      rows.push({ map, view, speed, zoom, ...row });
      const p = row.phasesPerFrameMs;
      console.log(`${map} ${view}: ${row.fps} fps | sim ${row.simulationMs} ms, drawing ${row.drawingCpuMs} ms (plants ${p.plants ?? 0}, plant culling ${((p.visibility ?? 0) + (p.shadowSelection ?? 0)).toFixed(2)}, animals ${p.actors ?? 0}), GPU ${row.gpuMs} ms | slowest ${row.slowestFrameMs} ms, frame p95 ${row.frameP95Ms} ms, longest gap ${row.longestGapMs} ms (${row.gapsOver50} over 50) | plants ${row.plantVisible}/${row.plantInstances} drawn | ${(row.triangles / 1e6).toFixed(1)}M triangles, ${row.animals} animals${row.closeUp ? ` (${row.closeUp} drawn close up)` : ''}`);
      if (SPLIT) {
        const base = row.split['as is'];
        const d = (v, f) => `${v[f] - base[f] >= 0 ? '+' : ''}${(v[f] - base[f]).toFixed(1)}`;
        console.log(`   GPU split, timer ms / synced ms: as is ${base.gpu} / ${base.sync} (${base.redraws} shadow redraws/s); ` + Object.entries(row.split).filter(([k]) => k !== 'as is').map(([k, v]) => `${k} ${d(v, 'gpu')} / ${d(v, 'sync')}`).join(', '));
      }
    }
  }
} finally {
  await browser.close();
  const out = join(projectRoot, 'tools/release-output'); await mkdir(out, { recursive: true });
  await writeFile(join(out, 'play-profile.json'), JSON.stringify({ maps, quality, years, rows }, null, 2));
}
