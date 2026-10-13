// Verify the real perf_sample payload without transmitting any analytics.
import assert from 'node:assert/strict';
import { openBrowser } from './browser-session.mjs';
const b = await openBrowser({ label: 'perf-analytics', width: 960, height: 600 });
try {
  await b.send('Page.enable');
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*posthog.com*'] });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('second-growth-settings',JSON.stringify({analytics:true,autosave:false,music:false,nature:false,quality:'fast',qualityChosen:true,dayCycle:false,v:2}));
    sessionStorage.setItem('second-growth-pending',JSON.stringify({map:'pnw',mode:'free',difficulty:'standard'}));
    sessionStorage.setItem('sg-rec-canvas','0');
    window.perfEvents=[];window.perfIntervals=[];
    window.posthog={__SV:1,init(){},register(){},capture(event,props){window.perfEvents.push({event,props});}};
    const interval=window.setInterval;
    window.setInterval=(fn,ms,...args)=>{if(ms===1000)window.perfIntervals.push(()=>fn(...args));return interval(fn,ms,...args);};
  ` });
  for (const diagnostic of [false, true]) {
    await b.navigate('/?ph' + (diagnostic ? '&perf=1' : ''));
    await b.waitFor('Array.isArray(window.perfIntervals)', 'Local analytics stub initializes', 10000);
    await b.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game boot');
    b.assertHealthy();
    await b.evaluate('window.secondGrowth.game.speed=0');
    await b.waitFor('window.secondGrowth.renderer.cpuPerf.frames >= 10', 'Normal frames collect CPU times');
    const result = await b.evaluate(`(()=>{
      const {renderer:r,ui,diagnostics}=window.secondGrowth;
      ui.session.active=29;ui.session.lastInput=performance.now();
      const frames=r.cpuPerf.frames;
      for(const run of window.perfIntervals)run();
      const event=window.perfEvents.find(e=>e.event==='perf_sample');
      return {event,frames,remaining:r.cpuPerf.frames,overlay:!!document.getElementById('performance-overlay'),probes:!!diagnostics?.phases};
    })()`);
    assert.ok(result.event, 'existing perf_sample event is sent');
    assert.equal(result.event.props.cpu_frames, result.frames); assert.equal(result.remaining, 0, 'event starts a new CPU window');
    assert.equal(result.event.props.active_minutes, .5, 'same first-event cadence');
    for (const stage of ['simulation', 'render', 'interface']) {
      for (const field of [`cpu_${stage}_ms`, `cpu_${stage}_p95_ms`]) {
        assert.ok(Number.isFinite(result.event.props[field]) && result.event.props[field] >= 0, `${field} is numeric`);
      }
    }
    for (const field of ['fps', 'slow_frames_pct', 'draw_calls', 'triangles']) assert.ok(field in result.event.props, `${field} remains in the event`);
    assert.equal(result.overlay, diagnostic); assert.equal(result.probes, diagnostic, 'deeper probes stay opt-in');
    b.assertHealthy();
    console.log(`PASS perf_sample CPU means/p95, count, reset and unchanged cadence ${diagnostic ? 'with' : 'without'} ?perf=1`);
  }
} finally { await b.close(); }
