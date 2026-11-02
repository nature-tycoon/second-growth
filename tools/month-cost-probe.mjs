// What a month change costs in the browser: the monthly tick, its listeners, and the autosave's
// packing of the save (a probe for the 2026-11 lag review). node tools/month-cost-probe.mjs [maps]
import { openBrowser } from './browser-session.mjs';
const maps = (process.argv[2] || 'pnw,sumatra').split(',');
const browser = await openBrowser({ label: 'month-cost', ...(process.env.PLAY_ROOT ? { root: process.env.PLAY_ROOT } : {}), software: false, width: 1440, height: 900, pixelRatio: 2 });
try {
  for (const map of maps) {
    await browser.evaluate(`localStorage.clear();localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,music:false,nature:false,quality:'high',qualityChosen:true,fps:'60',shadows:true,dayCycle:true,v:2}));sessionStorage.setItem('second-growth-pending',JSON.stringify({map:${JSON.stringify(map)},mode:'free',difficulty:'standard'}));`);
    await browser.navigate('/');
    await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game did not boot');
    const r = await browser.evaluate(`(async()=>{
      const {game,ui}=window.secondGrowth; if (ui.modalOpen) ui.closeModal(); game.speed=0;
      const out={day:[],month:[],save:[],saveData:[],monthListeners:[]};
      for (let d=0; d<95; d++) {
        const was=game.month; let t=performance.now(); game.dailyTick(); const ms=performance.now()-t;
        (game.month!==was?out.month:out.day).push(ms);
        for (let k=0;k<20;k++) game.wildlife.update(0.05);
        await new Promise(r=>setTimeout(r,0));
      }
      for (let k=0;k<3;k++){ let t=performance.now(); game.saveData(); out.saveData.push(performance.now()-t); t=performance.now(); const p=game.save(); out.save.push(performance.now()-t); await p; }
      for (let k=0;k<3;k++){ const t=performance.now(); game.emit('month',{grant:0}); out.monthListeners.push(performance.now()-t); }
      const med=a=>{const s=[...a].sort((x,y)=>x-y);return +s[s.length>>1].toFixed(1)}, max=a=>+Math.max(...a).toFixed(1);
      return Object.fromEntries(Object.entries(out).map(([k,a])=>[k,{median:med(a),max:max(a),n:a.length}]));})()`, 300000);
    console.log(map, JSON.stringify(r));
  }
} finally { await browser.close(); }
