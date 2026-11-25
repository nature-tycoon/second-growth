// How often the sun's shadow map is redrawn through one drawn day, with the camera still (fps-plan.md, session 8):
// the sun's own motion, not panning. Prints redraws a second in each part of the day.
//   node tools/shadow-redraw-probe.mjs [map=pnw] [quality=high] [speed=1]
import { openBrowser } from './browser-session.mjs';
const [map = 'pnw', quality = 'high', speed = '1'] = process.argv.slice(2);
const browser = await openBrowser({ label: 'shadow-redraw-probe', software: false, width: 1440, height: 900, pixelRatio: 2 });
try {
  await browser.evaluate(`localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:${JSON.stringify(quality)},qualityChosen:true,fps:'60',shadows:true,dayCycle:true,wind:true,weather:true,fastHintAt:1,v:2}));sessionStorage.setItem('second-growth-pending',JSON.stringify({map:${JSON.stringify(map)},mode:'free',difficulty:'standard'}));`);
  await browser.navigate('/');
  await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game did not boot');
  const rows = await browser.evaluate(`(async()=>{
    const {game,renderer:R,ui}=window.secondGrowth; if (ui.modalOpen) ui.closeModal();
    game.speed=${Number(speed)}; R.autoRes=false; R.setTimeOfDay(0); await new Promise(r=>setTimeout(r,1000));
    const out=[], t0=performance.now(); let last=R.todU, n=R.shadowRedraws||0, at=performance.now();
    // (one drawn day, in two-second steps; stops after 8 minutes)
    while(performance.now()-t0<480000){
      await new Promise(r=>setTimeout(r,2000));
      const now=performance.now(), m=R.shadowRedraws||0;
      out.push({u:+last.toFixed(3), perS:+((m-n)*1000/(now-at)).toFixed(1), sun:+R.sun.intensity.toFixed(2)});
      n=m; at=now; if(R.todU<last) break; last=R.todU;
    }
    return out;})()`, 600000);
  const parts = [['dawn', 0, .1], ['day', .1, .75], ['dusk', .75, .87], ['night', .87, 1]];
  for (const [name, a, b] of parts) {
    const r = rows.filter(x => x.u >= a && x.u < b); if (!r.length) continue;
    console.log(`${name}: ${(r.reduce((t, x) => t + x.perS, 0) / r.length).toFixed(1)} redraws/s (max ${Math.max(...r.map(x => x.perS))}), sun ${Math.min(...r.map(x => x.sun))}-${Math.max(...r.map(x => x.sun))}, ${r.length * 2} s`);
  }
} finally { await browser.close(); }
