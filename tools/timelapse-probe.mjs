// The first visit's guided planting (strokes along each step's line) and time-lapse in real Chrome (GPU on), measured: how long the
// lapse takes, its frame rate, game days a second, and how fast the ground moves across the screen
// (against the film's map-pan limit, 0.35 widths a second, and its 40°/s turn limit), with an optional
// CPU slowdown. Not a pass/fail check: numbers for docs/ideas/2026-11-21-first-minutes/timelapse-2.md.
//   nice -n 15 node tools/timelapse-probe.mjs [cpu=1] [width=1280] [height=800]   (LAPSE_SHOT=<file.jpg>: one picture mid-lapse)
import { openBrowser } from './browser-session.mjs';

const [cpu = 1, width = 1280, height = 800] = process.argv.slice(2).map(Number);
const settings = `localStorage.setItem('second-growth-settings',JSON.stringify({analytics:true,autosave:false,music:false,nature:false,quality:'fast',qualityChosen:true,dayCycle:false,v:2}));
  window.events=[]; window.posthog={__SV:1,init(){},register(){},capture(event,props){window.events.push({event,props});}};`;
const booted = '!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))';
const click = re => `(()=>{ const b=[...document.querySelectorAll('#toasts .toast-act')].find(x=>${re}.test(x.textContent)); if(b) b.click(); return !!b; })()`;
const has = re => `[...document.querySelectorAll('#toasts .toast-act')].some(x=>${re}.test(x.textContent))`;
const b = await openBrowser({ label: 'timelapse-probe', width, height, software: false });
try {
  await b.send('Page.enable');
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*posthog.com*'] });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: settings });
  await b.navigate('/?ph');
  await b.waitFor(booted, 'Game boot', 120000);
  await b.waitFor(has('/^Tear out the fence/'), 'fence prompt', 30000);
  await b.evaluate(click('/^Tear out the fence/'));
  await b.waitFor(has('/^Pull it out/'), 'culvert prompt', 90000);
  await b.evaluate(click('/^Pull it out/'));
  const steps = {};
  await b.waitFor(has('/^Pull out the/'), 'pull prompt', 20000);
  await new Promise(r => setTimeout(r, 1500));
  steps.pull = await b.evaluate(`(()=>{ const g=window.secondGrowth.game, m=g.money; ${click('/^Pull out the/')}; return { cost: Math.round(m-g.money), money: Math.round(g.money) }; })()`);
  // the trees and the meadow: strokes along the guide's line until each step is done (first-minutes-browser-check drives real drags)
  for (const k of ['trees', 'meadow']) {
    await b.waitFor(`window.secondGrowth.ui.state.guide?.step==='${k}'`, k + ' step', 20000);
    await new Promise(r => setTimeout(r, 1500));
    steps[k] = await b.evaluate(`(()=>{ const {game:g,ui}=window.secondGrowth, m=g.money; let n=0;
      while (ui.state.guide?.step==='${k}' && n<20) { const G=ui.state.guide, s=ui.actions.begin(ui.state.tool); for (const p of G.path.slice((n*8)%G.path.length, (n*8)%G.path.length+8)) ui.actions.paint(s, Math.floor(p.x), Math.floor(p.y), s.tool.size); ui.actions.end(s); n++; }
      return { strokes: n, cost: Math.round(m-g.money), money: Math.round(g.money) }; })()`);
  }
  if (cpu > 1) await b.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  // per-frame samples from the page while the lapse runs
  await b.evaluate(`(()=>{ const {game:g,ui,renderer:R}=window.secondGrowth; const S=window.lapseS={f:[],start:0,end:0,ending:0};
    const loop=t=>{ const tl=ui.timelapse;
      if (tl.on && !S.start) { S.start=t; S.day0=g.day; }
      if (S.start && !S.end) {
        const pts=[]; const c={x:R.target.x,z:R.target.z};
        for (const [dx,dz] of [[-8,0],[8,0],[0,-8],[0,8],[0,0]]) { const p=R.project(c.x+dx,R.heightAtScene(c.x+dx,c.z+dz),c.z+dz); pts.push(p?[p.x,p.y]:null); }
        S.f.push({t, day:g.day, az:R.az, x:R.target.x, z:R.target.z, vw:R.vw, pts, lapse:!!g.lapse, ending:!!tl.ending, budget:g.lapse?.budget, goal:g.lapse?.goal, hidden:R.actors.hidden});
        if (tl.ending && !S.ending) S.ending=t;
        if (!tl.on) S.end=t;
      }
      if (!S.end) requestAnimationFrame(loop);
    }; requestAnimationFrame(loop); })()`);
  if (process.env.LAPSE_SHOT) { // (one small picture, mid-lapse)
    await b.waitFor(`window.secondGrowth.game.day - (window.lapseS.day0 ?? 1e9) > 700`, 'mid-lapse', 120000);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(process.env.LAPSE_SHOT, Buffer.from((await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 60 })).data, 'base64'));
  }
  await b.waitFor(`window.lapseS.end>0`, 'the lapse to end', 240000);
  const r = await b.evaluate(`(()=>{ const S=window.lapseS, F=S.f.filter(f=>f.lapse), g=window.secondGrowth.game;
    const iv=F.slice(1).map((f,i)=>f.t-F[i].t).sort((a,b)=>a-b), q=p=>iv[Math.floor(p*(iv.length-1))];
    // the ground's screen speed (widths a second) of the points ±8 tiles from the look point, after the glide in (3 s)
    let pan=0, turn=0; for (let i=1;i<F.length;i++){ const a=F[i-1], c=F[i], dt=(c.t-a.t)/1000; if (c.t-F[0].t<3200||dt<=0) continue;
      for (let k=0;k<5;k++){ const p=a.pts[k], q2=c.pts[k]; if(p&&q2) pan=Math.max(pan, Math.hypot(q2[0]-p[0],q2[1]-p[1])/c.vw/dt); }
      turn=Math.max(turn, Math.abs(c.az-a.az)*180/Math.PI/dt); }
    const secs=(F.at(-1).t-F[0].t)/1000;
    return { lapseSeconds:+secs.toFixed(1), days:F.at(-1).day-F[0].day, daysPerS:+((F.at(-1).day-F[0].day)/secs).toFixed(1), frames:F.length, fps:+(F.length/secs).toFixed(1),
      medianMs:+q(0.5).toFixed(1), p90Ms:+q(0.9).toFixed(1), worstMs:+iv.at(-1).toFixed(1), over50:iv.filter(x=>x>50).length,
      panWps:+pan.toFixed(3), turnDegS:+turn.toFixed(1), budget:F.at(-1).budget, goal:F.at(-1).goal, hidden:F.every(f=>f.hidden),
      newcomerSeconds: S.ending ? +((S.end-S.ending)/1000).toFixed(1) : 0,
      watched: window.events.find(e=>e.event==='timelapse_watched')?.props, started: window.events.find(e=>e.event==='timelapse_started')?.props,
      stepsEv: window.events.filter(e=>e.event==='opening_step').map(e=>e.props),
      line:[...document.querySelectorAll('#toasts .toast-text')].map(t=>t.textContent).find(t=>/ on: /.test(t)) }; })()`);
  console.log(JSON.stringify({ cpu, width, height, steps, ...r }, null, 1));
} finally { await b.close(); }
