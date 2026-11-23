// The first 30 seconds of a first visit, as a new player gets them: loading time by step, then
// every frame for 30 s after the loading screen goes, in windows (0-5, 5-10, 10-20, 20-30 s:
// frame rate, slowest gaps, long frames), the slowest frames with where they went, and the long
// tasks outside frames (idle warm-ups, timers). The analytics' "10 s" frame sample is mostly the
// 0-10 s window here.
//   node tools/first-seconds-profile.mjs [map=pnw] [quality=fast] [runs=2] [cpuSlowdown=1]
// FS_SOFTWARE=1 draws with SwiftShader (a slow GPU stand-in, no parallel shader compile);
// cpuSlowdown uses Chrome's CPU throttling (a CPU stress test, not an older laptop: decision 0004).
// FS_PROFILE=1 records a CPU profile from 'Welcoming the wild' to 30 s after Ready and prints the
// top functions by self time in loading and in the first 10 s. FS_ROOT=<checkout> measures another
// copy, FS_OUT=<file> saves the rows. Each run is a fresh browser profile (a cold shader cache, as
// a first visit has). 1366x768 at one pixel a point, the commonest weak-laptop screen. Run under
// nice -n 15.
import { openBrowser, pause } from './browser-session.mjs';
import { writeFile } from 'node:fs/promises';

const [map = 'pnw', quality = 'fast', runsArg = '2', slowArg = '1'] = process.argv.slice(2);
const runs = Number(runsArg), slowdown = Number(slowArg), software = !!process.env.FS_SOFTWARE, profiling = !!process.env.FS_PROFILE;
const SECONDS = Number(process.env.FS_SECONDS || 30);
const probe = `
  const F = window.__fs = { marks: [], frames: [], long: [] };
  const mark = l => F.marks.push([l, performance.now()]);
  document.addEventListener('DOMContentLoaded', () => {
    mark('dom');
    const s = document.getElementById('loading-status'), l = document.getElementById('loading-screen');
    new MutationObserver(() => mark(s.textContent)).observe(s, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => { if (l.classList.contains('done')) mark('done'); }).observe(l, { attributes: true });
  });
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) F.long.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  // every animation frame's gap, and each game frame's work by part (main.js's frame loop)
  let last = null;
  const raf = t => { if (last != null) F.frames.push({ t, gap: t - last }); last = t; if (!F.stop) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  let sg;
  Object.defineProperty(window, 'secondGrowth', { configurable: true, get: () => sg, set(v) {
    sg = v; const r = v.renderer, rec = r.recordCpuFrame;
    F.work = [];
    r.recordCpuFrame = function (s) { if (!F.stop) F.work.push({ t: performance.now(), work: s.work, sim: s.timings.simulation, render: s.timings.render, ui: s.timings.interface, ph: F.ph ? { ...F.ph } : null }); if (F.ph) for (const k in F.ph) delete F.ph[k]; return rec.call(this, s); };
    // where each frame went (PerformancePhases' parts, installed as soon as the game exists)
    import('/js/performance.js').then(({ PerformancePhases }) => { const p = new PerformancePhases(v.game, r); F.ph = p.times; });
  } });
`;

const browser = await openBrowser({ label: 'first-seconds', ...(process.env.FS_ROOT ? { root: process.env.FS_ROOT } : {}), software, width: 1366, height: 768, pixelRatio: 1 });
const rows = [];
const f1 = n => n == null ? '-' : (+n).toFixed(1), f0 = n => n == null ? '-' : Math.round(n);
function selfTimes(profile, from, to) {
  const { nodes, samples, timeDeltas, startTime } = profile, byId = new Map(nodes.map(n => [n.id, n])), self = new Map();
  let t = startTime;
  for (let i = 0; i < samples.length; i++) {
    t += timeDeltas[i]; const ms = (timeDeltas[i + 1] ?? 0) / 1000, now = t / 1000;
    if (now < from || now > to) continue;
    const n = byId.get(samples[i]), cf = n.callFrame, key = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + ms);
  }
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, 14);
}
// Who called the slowest native functions (WebGL waits, reads): the nearest game function up the stack
function callers(profile, from, to, names) {
  const { nodes, samples, timeDeltas, startTime } = profile, byId = new Map(nodes.map(n => [n.id, n])), parent = new Map(), out = new Map();
  for (const n of nodes) for (const c of n.children || []) parent.set(c, n.id);
  let t = startTime;
  for (let i = 0; i < samples.length; i++) {
    t += timeDeltas[i]; const ms = (timeDeltas[i + 1] ?? 0) / 1000, now = t / 1000;
    if (now < from || now > to) continue;
    let n = byId.get(samples[i]); if (!names.includes(n.callFrame.functionName)) continue;
    const chain = [];
    for (let id = parent.get(n.id); id != null && chain.length < 3; id = parent.get(id)) { const cf = byId.get(id).callFrame; if (cf.url.includes('/js/')) chain.push(`${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-1)[0]}:${cf.lineNumber + 1}`); }
    const key = n.callFrame.functionName + ' <- ' + chain.join(' <- ');
    out.set(key, (out.get(key) || 0) + ms);
  }
  return [...out].sort((a, b) => b[1] - a[1]).slice(0, 6);
}
try {
  await browser.send('Page.enable');
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: probe });
  const gpu = await browser.evaluate(`(()=>{const c=document.createElement('canvas').getContext('webgl2');const e=c&&c.getExtension('WEBGL_debug_renderer_info');return e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):'?'})()`);
  console.log(`${map} ${quality}, ${software ? 'SwiftShader' : 'hardware GPU'} (${gpu}), CPU x${slowdown}, 1366x768`);
  for (let run = 0; run < runs; run++) {
    // a first visit: no saved farm, Detail chosen (so the chip check doesn't change it)
    await browser.evaluate(`localStorage.clear();sessionStorage.clear();localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:${JSON.stringify(quality)},qualityChosen:true,fps:'60',v:2}));`);
    if (slowdown > 1) await browser.send('Emulation.setCPUThrottlingRate', { rate: slowdown });
    if (profiling) { await browser.send('Profiler.enable'); await browser.send('Profiler.setSamplingInterval', { interval: 500 }); await browser.send('Profiler.start'); }
    await browser.navigate('/index.html?fs=' + run);
    await browser.waitFor(`window.__fs?.marks.some(m => m[0] === 'Ready')`, 'loading to finish', 300000);
    await pause(SECONDS * 1000 + 500);
    const r = await browser.evaluate(`(()=>{ const F = window.__fs; F.stop = true;
      const ready = F.marks.find(m => m[0] === 'Ready')[1], g = window.secondGrowth;
      return { marks: F.marks, ready, frames: F.frames.filter(f => f.t > ready), work: F.work.filter(f => f.t > ready), long: F.long.filter(l => l[0] > ready),
        rendererFps: null, quality: g.renderer.quality, dpr: g.renderer.dpr, buffer: [g.renderer.gl.domElement.width, g.renderer.gl.domElement.height],
        programs: g.renderer.gl.info.programs.length, day: g.game.day, animals: g.game.wildlife.agents.length }; })()`, 60000);
    let profile = null, stopAt = 0;
    if (profiling) { stopAt = await browser.evaluate('performance.now()'); ({ profile } = await browser.send('Profiler.stop')); }
    if (slowdown > 1) await browser.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const steps = []; let prev = 0;
    for (const [label, t] of r.marks) { steps.push([label, Math.round(t), Math.round(t - prev)]); prev = t; }
    const windows = [[0, 5], [5, 10], [10, 20], [20, 30]].filter(([a]) => a < SECONDS).map(([a, b]) => {
      const fr = r.frames.filter(f => f.t - r.ready >= a * 1000 && f.t - r.ready < b * 1000), gaps = fr.map(f => f.gap).sort((x, y) => x - y);
      const span = fr.reduce((s, f) => s + f.gap, 0);
      const wk = r.work.filter(f => f.t - r.ready >= a * 1000 && f.t - r.ready < b * 1000);
      return { from: a, to: b, fps: span ? fr.length * 1000 / span : null, p50: gaps[Math.floor(gaps.length / 2)], p95: gaps[Math.floor(gaps.length * .95)], max: gaps.at(-1),
        over50: gaps.filter(g => g > 50).length, over100: gaps.filter(g => g > 100).length,
        work: wk.length ? wk.reduce((s, f) => s + f.work, 0) / wk.length : null,
        longOutside: r.long.filter(l => l[0] - r.ready >= a * 1000 && l[0] - r.ready < b * 1000).reduce((s, l) => s + l[1], 0) };
    });
    const slow = [...r.work].sort((a, b) => b.work - a.work).slice(0, 8).map(f => ({ at: +((f.t - r.ready) / 1000).toFixed(2), work: +f.work.toFixed(0), sim: +f.sim.toFixed(0), render: +f.render.toFixed(0), ui: +f.ui.toFixed(0), ph: Object.fromEntries(Object.entries(f.ph || {}).filter(([, v]) => v >= 2).map(([k, v]) => [k, +v.toFixed(0)])) }));
    // long tasks that weren't a game frame (idle warm-ups, timers): a long task with no frame work inside it
    const outside = r.long.filter(([s, d]) => !r.work.some(f => f.t >= s && f.t <= s + d + 1)).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([s, d]) => [+((s - r.ready) / 1000).toFixed(2), Math.round(d)]);
    const row = { map, quality, software, slowdown, run, gpu, loadMs: Math.round(r.ready), steps, windows, slow, outside, dpr: r.dpr, buffer: r.buffer, programs: r.programs, day: r.day, animals: r.animals };
    rows.push(row);
    console.log(`\nrun ${run}: Ready at ${f0(r.ready)} ms (buffer ${r.buffer.join('x')}, dpr ${r.dpr}, ${r.programs} programs, day ${r.day})`);
    for (const [label, t, d] of steps) console.log(`  ${String(t).padStart(6)} ms  +${String(d).padStart(5)}  ${label}`);
    console.log('  window    fps   p50   p95    max  >50ms >100ms  work/frame  long-tasks-outside-frames');
    for (const w of windows) console.log(`  ${String(w.from).padStart(2)}-${String(w.to).padEnd(3)}s ${f1(w.fps).padStart(5)} ${f0(w.p50).toString().padStart(5)} ${f0(w.p95).toString().padStart(5)} ${f0(w.max).toString().padStart(6)} ${String(w.over50).padStart(6)} ${String(w.over100).padStart(6)}  ${f1(w.work).padStart(9)}  ${f0(w.longOutside)} ms`);
    console.log('  slowest frames (s after Ready: work ms, sim/render/ui, parts):');
    for (const s of slow) console.log(`    ${s.at.toFixed(2).padStart(6)}  ${String(s.work).padStart(4)}  ${s.sim}/${s.render}/${s.ui}  ${JSON.stringify(s.ph)}`);
    if (outside.length) console.log(`  long tasks outside frames (s, ms): ${outside.map(o => o.join(':')).join('  ')}`);
    if (profile) {
      const welcome = r.marks.find(m => m[0] === 'Welcoming the wild')?.[1] ?? 0;
      const nav = profile.endTime / 1000 - stopAt; // the page's time 0 on the profile's clock (to within a few ms)
      for (const [label, a, b] of [['loading (Welcoming the wild to Ready)', welcome, r.ready], ['first 10 s', r.ready, r.ready + 10000], ['10-30 s', r.ready + 10000, r.ready + 30000]]) {
        console.log(`  top self time, ${label}:`);
        for (const [k, ms] of selfTimes(profile, nav + a, nav + b)) console.log(`    ${f0(ms).toString().padStart(6)} ms  ${k}`);
        for (const [k, ms] of callers(profile, nav + a, nav + b, ['getProgramInfoLog', 'getShaderInfoLog', 'getParameter', 'getProgramParameter', 'getImageData', 'getUniformLocation', 'trim', 'readPixels'])) if (ms > 50) console.log(`      ${f0(ms).toString().padStart(6)} ms  ${k}`);
      }
    }
    await pause(500);
  }
  browser.assertHealthy();
} finally { await browser.close(); }
if (process.env.FS_OUT) await writeFile(process.env.FS_OUT, JSON.stringify(rows, null, 1));
