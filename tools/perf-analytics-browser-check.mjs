// Verify the real perf_sample payload without transmitting any analytics.
import assert from 'node:assert/strict';
import { openBrowser } from './browser-session.mjs';
const b = await openBrowser({ label: 'perf-analytics', width: 960, height: 600 });
try {
  await b.send('Page.enable');
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*posthog.com*', '*t.secondgrowth.earth*'] });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('second-growth-settings',JSON.stringify({analytics:true,autosave:false,music:false,nature:false,quality:'fast',qualityChosen:true,dayCycle:false,v:2}));
    sessionStorage.setItem('second-growth-pending',JSON.stringify({map:'pnw',mode:'free',difficulty:'standard'}));
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
    for (const stage of ['simulation', 'render', 'interface', 'submit']) {
      for (const field of [`cpu_${stage}_ms`, `cpu_${stage}_p95_ms`]) {
        assert.ok(Number.isFinite(result.event.props[field]) && result.event.props[field] >= 0, `${field} is numeric`);
      }
    }
    for (const field of ['fps', 'slow_frames_pct', 'draw_calls', 'triangles']) assert.ok(field in result.event.props, `${field} remains in the event`);
    // (the slower frames' work, and the sample's length so shadow_redraws reads as a rate)
    for (const field of ['work_p75_ms', 'sample_s']) assert.ok(Number.isFinite(result.event.props[field]) && result.event.props[field] >= 0, `${field} is numeric`);
    // the frame cap and battery state, so a capped 29 fps doesn't read as slow; the release stays 'dev' locally
    assert.ok([30, 60].includes(result.event.props.target_fps), 'target_fps is the frame cap');
    assert.ok([true, false, null].includes(result.event.props.on_battery), 'on_battery is known or null');
    // the render stage part by part (performance-review-2026-11-26.md), and the screen's refresh as measured
    const P = result.event.props, parts = ['camera', 'ground', 'plants', 'overlay', 'impostors', 'animals', 'plant_view', 'shadows', 'effects', 'other'];
    for (const k of parts) for (const field of [`draw_${k}_ms`, `draw_${k}_p95_ms`]) assert.ok(Number.isFinite(P[field]) && P[field] >= 0, `${field} is numeric`);
    const sum = parts.reduce((a, k) => a + P[`draw_${k}_ms`], 0) + P.cpu_submit_ms;
    assert.ok(sum <= P.cpu_render_ms * 1.1 + 0.6 && sum >= P.cpu_render_ms * 0.6 - 0.6, `the parts add up to about the render stage (${sum.toFixed(1)} of ${P.cpu_render_ms} ms)`);
    assert.ok(P.refresh_hz === null || (P.refresh_hz >= 20 && P.refresh_hz <= 500), `refresh_hz is measured (${P.refresh_hz})`);
    console.log(`  render ${P.cpu_render_ms} ms = ${parts.map(k => `${k} ${P[`draw_${k}_ms`]}`).join(', ')}, submit ${P.cpu_submit_ms}; refresh ${P.refresh_hz} Hz`);
    assert.equal(result.event.props.renderer_revision, 'dev', 'renderer_revision is the release, stamped only at deploy');
    assert.equal(result.overlay, diagnostic); assert.equal(result.probes, diagnostic, 'deeper probes stay opt-in');
    b.assertHealthy();
    console.log(`PASS perf_sample CPU means/p95, count, reset and unchanged cadence ${diagnostic ? 'with' : 'without'} ?perf=1`);
  }
} finally { await b.close(); }
