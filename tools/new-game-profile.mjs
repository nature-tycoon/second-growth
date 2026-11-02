// Frame cost in the first minutes of a brand-new game, through the real frame loop: each map is
// started fresh (as a player starts it), left at the camera it opens on, and played at normal and
// fast speed. Prints the average and the stutter: frames over 33 and 50 ms, the slowest frames and
// which part (simulation's daily tick, wildlife, plants, terrain, animals) each slowest frame went to.
//   node tools/new-game-profile.mjs [maps=serengeti,sumatra,amazon,pnw,atlanta,chinandega,reef] [quality=high] [seconds=15]
// NEWGAME_PROFILE=1 also records a CPU profile of each map at fast speed and prints the top functions by self time.
// PLAY_ROOT=<checkout> measures another checkout. Hardware GPU, 1440x900 at DPR 2 (a Retina laptop).
// Run under `nice -n 15`. Writes tools/release-output/new-game-profile.json.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot } from './browser-session.mjs';

const [maps = 'serengeti,sumatra,amazon,pnw,atlanta,chinandega,reef', quality = 'high', seconds = '15'] = process.argv.slice(2);
const SPEEDS = [['normal', 1], ['fast', 2]];
const browser = await openBrowser({ label: 'new-game-profile', ...(process.env.PLAY_ROOT ? { root: process.env.PLAY_ROOT } : {}), software: false, width: 1440, height: 900, pixelRatio: 2 });
const rows = [];
const fmt = n => n == null ? '-' : (+n).toFixed(1);
try {
  for (const map of maps.split(',')) {
    await browser.evaluate(`localStorage.clear();localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:${JSON.stringify(quality)},qualityChosen:true,fps:'60',shadows:true,dayCycle:true,v:2}));sessionStorage.setItem('second-growth-pending',JSON.stringify({map:${JSON.stringify(map)},mode:'free',difficulty:'standard'}));`);
    await browser.navigate('/');
    await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game did not boot');
    const gpu = await browser.evaluate('window.secondGrowth.renderer.gpuName()');
    if (/SwiftShader|llvmpipe|software/i.test(gpu || '')) throw new Error('Hardware graphics unavailable');
    for (const [label, speed] of SPEEDS) {
      const profile = process.env.NEWGAME_PROFILE && label === 'fast';
      if (profile) { await browser.send('Profiler.enable'); await browser.send('Profiler.setSamplingInterval', { interval: 200 }); }
      const row = await browser.evaluate(`(async()=>{
        const {game,renderer:R,ui}=window.secondGrowth;
        const {PerformancePhases}=await import('/js/performance.js');
        if (ui.modalOpen) ui.closeModal();
        game.speed=${speed};
        await new Promise(r=>setTimeout(r,3000));
        ${profile ? 'window.__profiling=true;' : ''}
        const probes=new PerformancePhases(game,R), frames=[], record=R.recordCpuFrame, day0=game.day;
        R.recordCpuFrame=function(s){ const phases={}; for(const k in probes.times) phases[k]=+probes.times[k].toFixed(1);
          frames.push({interval:s.interval, work:s.work, sim:s.timings.simulation, render:s.timings.render, ui:s.timings.interface, phases}); probes.reset(); return record.call(this,s); };
        R.perfSample(true);
        await new Promise(r=>setTimeout(r,${Number(seconds) * 1000}));
        R.recordCpuFrame=record; probes.dispose();
        const s=R.perfSample(false), n=frames.length, sum=k=>frames.reduce((t,f)=>t+(f[k]||0),0);
        const phaseTotal={}; for(const f of frames) for(const k in f.phases) phaseTotal[k]=(phaseTotal[k]||0)+f.phases[k];
        const slow=[...frames].sort((a,b)=>b.work-a.work).slice(0,6).map(f=>({work:+f.work.toFixed(1),interval:+f.interval.toFixed(1),sim:+f.sim.toFixed(1),render:+f.render.toFixed(1),ui:+f.ui.toFixed(1),phases:f.phases}));
        const works=frames.map(f=>f.work).sort((a,b)=>a-b);
        return {fps:s.fps, frames:n, days:game.day-day0, gpuMs:s.gpu_frame_ms, workMs:sum('work')/n, simMs:sum('sim')/n, renderMs:sum('render')/n, uiMs:sum('ui')/n,
          p95WorkMs:works[Math.floor(n*.95)], maxWorkMs:works[n-1],
          over33:frames.filter(f=>f.interval>34).length, work16:frames.filter(f=>f.work>16).length, work33:frames.filter(f=>f.work>33).length, over50:frames.filter(f=>f.interval>50).length, maxIntervalMs:Math.max(...frames.map(f=>f.interval)),
          phasesPerFrameMs:Object.fromEntries(Object.entries(phaseTotal).map(([k,v])=>[k,+(v/n).toFixed(2)])), slow,
          triangles:s.triangles, drawCalls:s.draw_calls, pixelRatio:s.pixel_ratio, quality:s.quality, animals:game.wildlife.agents.length, day:game.day};})()`, 120000 + Number(seconds) * 1000);
      if (profile) {
        // (the profile covers the next few seconds at fast speed)
        await browser.send('Profiler.start');
        await new Promise(r => setTimeout(r, 8000));
        const { profile: p } = await browser.send('Profiler.stop');
        const self = new Map(), byId = new Map(p.nodes.map(n => [n.id, n]));
        const dt = p.timeDeltas, counts = new Map();
        p.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i + 1] ?? 0)));
        for (const [id, us] of counts) { const f = byId.get(id).callFrame; const key = `${f.functionName || '(anon)'} ${f.url.replace(/.*\/js\//, '')}:${f.lineNumber + 1}`; self.set(key, (self.get(key) || 0) + us); }
        const total = [...self.values()].reduce((a, b) => a + b, 0);
        row.profileTop = [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, us]) => `${(100 * us / total).toFixed(1)}% ${k}`);
      }
      browser.assertHealthy();
      rows.push({ map, speed: label, ...row });
      const p = row.phasesPerFrameMs;
      console.log(`${map} ${label}: ${row.fps} fps, ${row.days} days | work ${fmt(row.workMs)} ms (sim ${fmt(row.simMs)}: daily ${fmt(p.daily)}, wildlife ${fmt(p.wildlife)} | draw ${fmt(row.renderMs)}: plants ${fmt(p.plants)}, terrain ${fmt(p.terrain)}, animals ${fmt(p.actors)} | ui ${fmt(row.uiMs)}) GPU ${fmt(row.gpuMs)} | p95 ${fmt(row.p95WorkMs)}, max ${fmt(row.maxWorkMs)} ms | frames >33 ms ${row.over33}, >50 ms ${row.over50} of ${row.frames}; work >16 ms ${row.work16}, >33 ms ${row.work33} | ${(row.triangles / 1e6).toFixed(1)}M tri, ${row.animals} animals`);
      for (const f of row.slow.slice(0, 3)) console.log(`   slow ${f.work} ms: sim ${f.sim} render ${f.render} ui ${f.ui} ${JSON.stringify(f.phases)}`);
      if (row.profileTop) for (const line of row.profileTop) console.log('   ' + line);
    }
  }
} finally {
  await browser.close();
  const out = join(projectRoot, 'tools/release-output'); await mkdir(out, { recursive: true });
  await writeFile(join(out, 'new-game-profile.json'), JSON.stringify({ maps, quality, seconds, rows }, null, 2));
}
