// Interaction to Next Paint, per interaction, in a grown game through the real frame loop.
// Clicks and keys are sent as real (trusted) input through the DevTools protocol, so the browser's own
// Event Timing measures each one the way a player's INP is measured: from the input to the next paint.
// For each interaction it prints the p75 and worst of several tries, split into input delay (waiting for
// the frame in progress), processing (our handlers) and presentation (handlers to the paint: the next
// frame's work), and names the scripts that ran in the long animation frames it overlapped.
//   nice -n 15 node tools/inp-probe.mjs [map=pnw] [quality=fast] [years=2] [tries=5]
// INP_SOFT=1 draws with the software renderer, so frames run long as on a weak laptop (the GPU's work lands
// on the processor: a stress test for how waiting on a frame adds up, not an HD 520). INP_CPU=4 slows the processor 4x (a stress test, not a weak laptop's chip). INP_ONLY="goals,brush" runs only those interactions. INP_ROOT=<checkout> measures another checkout.
// Writes tools/release-output/inp-probe.json.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot, pause } from './browser-session.mjs';

const [map = 'pnw', quality = 'fast', years = '2', triesArg = '5'] = process.argv.slice(2);
const TRIES = Number(triesArg);
const b = await openBrowser({ label: 'inp-probe', ...(process.env.INP_ROOT ? { root: process.env.INP_ROOT } : {}), software: process.env.INP_SOFT === '1', width: Number(process.env.INP_W) || 1440, height: Number(process.env.INP_H) || 900, pixelRatio: 1 });
const SETTLE = process.env.INP_SOFT === '1' ? 2500 : 900; // (ms after an interaction for its paint to land)

const center = sel => b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); return r.width&&r.height?[r.x+r.width/2,r.y+r.height/2]:null;})()`);
async function clickAt([x, y]) {
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
async function click(sel) { const c = await center(sel); if (!c) throw new Error('not on screen: ' + sel); await clickAt(c); }
const KEYS = { ' ': ['Space', 32], Escape: ['Escape', 27], c: ['KeyC', 67], t: ['KeyT', 84], g: ['KeyG', 71], 1: ['Digit1', 49], 3: ['Digit3', 51] };
async function key(k) {
  const [code, vk] = KEYS[k];
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text: k.length === 1 ? k : undefined });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
}
const canvasMid = () => b.evaluate('(()=>{const r=document.querySelector("canvas").getBoundingClientRect(); return [r.x+r.width*.55,r.y+r.height*.55];})()');
const closeAll = async () => { await b.evaluate('(()=>{const u=window.secondGrowth.ui; if(u.timelapse?.on) u.timelapse.stop?.(); if(u.watch?.on) u.watch.stop?.(); if(u.modalOpen) u.closeModal();})()'); await pause(400); };

// [name, setup (not measured), the interaction, tidy-up (not measured)]
const INTERACTIONS = [
  ['speed 3', async () => click('#speed [data-speed="1"]'), () => click('#speed [data-speed="3"]'), () => click('#speed [data-speed="1"]')],
  ['pause key', null, () => key(' '), () => key(' ')],
  ['goals', null, () => click('#btn-goals'), closeAll],
  ['close panel', () => click('#btn-goals'), () => key('Escape'), closeAll],
  ['journal', null, () => click('#btn-journal'), closeAll],
  ['menu', null, () => click('#btn-menu'), closeAll],
  ['settings', null, () => click('#btn-settings'), closeAll],
  ['field guide', null, () => click('#stat-species'), closeAll],
  ['report', null, () => click('#stat-score'), closeAll],
  ['trees', null, () => click('#btn-trees'), () => click('#btn-trees')],
  ['tool category', () => b.evaluate('window.secondGrowth.ui.openCategory("inspect")'), () => click('#toolbar [data-cat]:not([data-cat=inspect])'), null],
  ['brush', async () => { await click('#toolbar [data-cat]:not([data-cat=inspect])'); await pause(300); }, async () => clickAt(await canvasMid()), () => b.evaluate('window.secondGrowth.ui.undoLast?.()')],
  ['inspect click', () => b.evaluate('window.secondGrowth.ui.openCategory("inspect")'), async () => clickAt(await canvasMid()), () => b.evaluate('window.secondGrowth.ui.closeInfo?.()')],
  ['watch', null, () => click('#view-ctrls [data-v=watch]'), closeAll],
  ['time-lapse', () => click('#btn-menu').then(() => pause(400)), () => click('[data-a=lapse]'), closeAll],
].filter(([n]) => !process.env.INP_ONLY || process.env.INP_ONLY.split(',').includes(n));

const p = (xs, q) => { const s = [...xs].sort((a, c) => a - c); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const rows = [];
try {
  await b.send('Page.enable');
  await b.evaluate(`localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:${JSON.stringify(quality)},qualityChosen:true,fastHintAt:1,shadows:true,dayCycle:true,v:2}));sessionStorage.setItem('second-growth-pending',JSON.stringify({map:${JSON.stringify(map)},mode:'free',difficulty:'standard'}));`);
  await b.navigate(process.env.INP_PACING ? '/?pacing=' + process.env.INP_PACING : '/'); // (INP_PACING=1 or 0: the draw-pacing A/B, main.js)
  await b.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game did not boot');
  const gpu = await b.evaluate('window.secondGrowth.renderer.gpuName()');
  await b.evaluate(`(async()=>{
    const {game,ui}=window.secondGrowth;
    const {releaseGame}=await import('/tools/release-fixtures.mjs');
    const fx=releaseGame(${JSON.stringify(map)},'forest');
    if(!game.restoreSave(fx.game.saveData())) throw new Error('Restore failed');
    for (const f of ['tree','treeG','shrub','ground']) game.border[f].set(fx.game.border[f]);
    if (ui.modalOpen) ui.closeModal(); ui.afterNewGame(); ui.refreshTop(true);
    game.speed=0;
    for(let d=0;d<${Number(years)}*120;d++){game.dailyTick(); for(let k=0;k<10;k++) game.wildlife.update(.1);}
    if (ui.modalOpen) ui.closeModal();
    ui.setSpeed(1);
    window.__inp={events:[],loafs:[]};
    new PerformanceObserver(l=>{for(const e of l.getEntries()) if(e.interactionId) window.__inp.events.push({name:e.name,id:e.interactionId,start:e.startTime,dur:e.duration,ps:e.processingStart,pe:e.processingEnd});}).observe({type:'event',durationThreshold:16,buffered:false});
    try{new PerformanceObserver(l=>{for(const e of l.getEntries()) window.__inp.loafs.push({start:e.startTime,dur:e.duration,render:e.renderStart,layout:e.styleAndLayoutStart,block:e.blockingDuration,scripts:e.scripts.map(s=>({inv:s.invoker,type:s.invokerType,dur:Math.round(s.duration),fn:s.sourceFunctionName,src:(s.sourceURL||'').split('/').pop()+':'+s.sourceCharPosition,layout:Math.round(s.forcedStyleAndLayoutDuration)}))});}).observe({type:'long-animation-frame',buffered:false});}catch(e){}
  })()`, 900000);
  if (process.env.INP_CPU) await b.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.INP_CPU) });
  await pause(4000);
  await pause(Number(process.env.INP_WAIT || 0) * 1000); // (INP_WAIT=40: past the first minute's warm-ups)
  await b.evaluate('window.secondGrowth.renderer.perfSample?.()'); await pause(5000);
  const frame = await b.evaluate('(()=>{const R=window.secondGrowth.renderer,p=R.perfSample?.()||{}; return {pacing:R.pacing?(R.pacing.off?"off":"on"):"none", waited:p.draws_waited_pct, fps:p.fps, slow:p.slow_frames_pct, sim_p95:p.cpu_simulation_p95_ms, render_p95:p.cpu_render_p95_ms, sim:p.cpu_simulation_ms, render:p.cpu_render_ms};})()');
  if (process.env.INP_FPS) { // (just the drawn frame rate over 15 s at speed 1, for a before/after of what the fence costs)
    const fps = await b.evaluate('(async()=>{const P=window.secondGrowth.renderer.perf; const f0=P.frames,t0=performance.now(); await new Promise(r=>setTimeout(r,15000)); return +((P.frames-f0)*1000/(performance.now()-t0)).toFixed(2);})()', 60000);
    console.log(`drawn fps over 15 s: ${fps}`); process.exitCode = 0;
    INTERACTIONS.length = 0;
  }
  console.log(`${map} ${quality} ${years}y, ${TRIES} tries, CPU x${process.env.INP_CPU || 1}, GPU ${gpu}`);
  console.log(`frames: ${frame.fps} fps, ${frame.slow}% slow, draw pacing ${frame.pacing} (${frame.waited ?? '-'}% of frames waited); CPU ms simulation ${frame.sim} (p95 ${frame.sim_p95}), drawing ${frame.render} (p95 ${frame.render_p95}). Players' p75 of p95: simulation 16, drawing 38 (perf_sample, Nov 2026)`);
  for (const [name, setup, act, tidy] of INTERACTIONS) {
    const tries = [];
    for (let t = 0; t < TRIES; t++) {
      try {
        if (setup) await setup();
        await pause(700);
        const t0 = await b.evaluate('(window.__inp.events.length=0, window.__inp.loafs.length=0, performance.now())');
        await act();
        await pause(SETTLE);
        const got = await b.evaluate('window.__inp');
        // one interaction can be several events (pointerdown, pointerup, click): the slowest is its latency
        const ev = got.events.filter(e => e.start >= t0 - 5);
        if (!ev.length) { tries.push({ dur: 16, delay: 0, proc: 0, pres: 0, loafs: [] }); }
        else {
          const w = ev.reduce((a, e) => e.dur > a.dur ? e : a);
          const procAll = ev.filter(e => e.id === w.id).reduce((s, e) => s + (e.pe - e.ps), 0);
          const end = w.start + w.dur;
          const loafs = got.loafs.filter(l => l.start < end && l.start + l.dur > w.start);
          tries.push({ dur: w.dur, ev: w.name, delay: w.ps - w.start, proc: procAll, pres: end - Math.max(...ev.filter(e => e.id === w.id).map(e => e.pe)), loafs });
        }
        if (tidy) await tidy();
      } catch (error) { tries.push({ error: error.message }); if (tidy) await tidy().catch(() => {}); }
    }
    const ok = tries.filter(t => !t.error);
    if (!ok.length) { console.log(`${name.padEnd(14)} failed: ${tries[0].error}`); rows.push({ name, error: tries[0].error }); continue; }
    const at = q => p(ok.map(t => t.dur), q);
    const med = k => Math.round(p(ok.map(t => t[k]), .5));
    // scripts in the overlapping long frames, summed over the tries, biggest first
    const scripts = new Map();
    for (const t of ok) for (const l of t.loafs) for (const s of l.scripts) { const k = `${s.type} ${s.inv} ${s.fn || ''} ${s.src}`; scripts.set(k, (scripts.get(k) || 0) + s.dur); }
    const top = [...scripts].sort((a, c) => c[1] - a[1]).slice(0, 4).map(([k, v]) => `${Math.round(v / ok.length)}ms ${k}`);
    const row = { name, p75: Math.round(at(.75)), worst: Math.round(at(1)), delay: med('delay'), proc: med('proc'), pres: med('pres'), top };
    rows.push(row);
    console.log(`${name.padEnd(14)} p75 ${String(row.p75).padStart(4)} ms  worst ${String(row.worst).padStart(4)}  (delay ${row.delay} · handlers ${row.proc} · to paint ${row.pres})`);
    for (const s of top) console.log('      ' + s);
  }
  b.assertHealthy();
  await mkdir(join(projectRoot, 'tools/release-output'), { recursive: true });
  await writeFile(join(projectRoot, 'tools/release-output/inp-probe.json'), JSON.stringify({ map, quality, years, gpu, frame, rows }, null, 1));
} finally { await b.close(); }
