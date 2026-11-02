// Which ground repaints are whole-map ones in a new game, and why (a probe for the 2026-11 lag review).
import { openBrowser } from './browser-session.mjs';
const maps = (process.argv[2] || 'serengeti,chinandega').split(',');
const browser = await openBrowser({ label: 'terrain-spike', software: false, width: 1440, height: 900, pixelRatio: 2 });
try {
  for (const map of maps) {
    await browser.evaluate(`localStorage.clear();localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'high',qualityChosen:true,fps:'60',shadows:true,dayCycle:true,v:2}));sessionStorage.setItem('second-growth-pending',JSON.stringify({map:${JSON.stringify(map)},mode:'free',difficulty:'standard'}));`);
    await browser.navigate('/');
    await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game did not boot');
    const r = await browser.evaluate(`(async()=>{
      const {game,renderer:R,ui}=window.secondGrowth; if (ui.modalOpen) ui.closeModal(); game.speed=2;
      const T=R.terrain, orig=T.updateSurface, uh=T.updateHeights, log=[]; let lastHv=T.hv;
      T.updateHeights=function(...a){ log.push({heights:true, day:game.day}); return uh.apply(this,a); };
      T.updateSurface=function(g,area){ const t=performance.now(); const r=orig.call(this,g,area); const ms=performance.now()-t; if(ms>8||!area) log.push({ms:+ms.toFixed(1), area:!!area, painted:this.lastPaint, day:game.day, month:game.month, hvChanged:lastHv!==T.hv}); lastHv=T.hv; return r; };
      await new Promise(r=>setTimeout(r,20000));
      T.updateSurface=orig; T.updateHeights=uh; return log;})()`, 120000);
    console.log(map, JSON.stringify(r));
  }
} finally { await browser.close(); }
