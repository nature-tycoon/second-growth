// dailyTick in the browser, after play-profile's game (a restored farm) has grown a few years: the
// review's finding 3 measure. node tools/daily-env-browser-probe.mjs [maps] [years=2] [days=60]
// PLAY_ROOT=<checkout> measures another checkout. Run it under nice -n 15.
import { openBrowser } from './browser-session.mjs';
const [maps = 'sumatra,amazon,serengeti', years = '2', days = '60'] = process.argv.slice(2);
const browser = await openBrowser({ label: 'daily-env', ...(process.env.PLAY_ROOT ? { root: process.env.PLAY_ROOT } : {}), software: false, width: 960, height: 600, pixelRatio: 1 });
try {
  for (const map of maps.split(',')) {
    await browser.evaluate(`localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'low',qualityChosen:true,fps:'30',shadows:false,dayCycle:true,v:2}));sessionStorage.setItem('second-growth-pending',JSON.stringify({map:${JSON.stringify(map)},mode:'free',difficulty:'standard'}));`);
    await browser.navigate('/');
    await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game did not boot');
    const r = await browser.evaluate(`(async()=>{
      const {game,ui}=window.secondGrowth;
      const {releaseGame}=await import('/tools/release-fixtures.mjs');
      const fx=releaseGame(${JSON.stringify(map)},'forest');
      if(!game.restoreSave(fx.game.saveData())) throw new Error('Restore failed');
      for (const f of ['tree','treeG','shrub','ground']) game.border[f].set(fx.game.border[f]);
      if (ui.modalOpen) ui.closeModal(); ui.afterNewGame(); game.speed=0;
      for(let d=0;d<${Number(years)}*120;d++){game.dailyTick(); for(let k=0;k<10;k++) game.wildlife.update(.1); if(d%20===0) await new Promise(r=>setTimeout(r,0));}
      const ms=[];
      for(let d=0;d<${Number(days)};d++){const t=performance.now(); game.dailyTick(); ms.push(performance.now()-t); for(let k=0;k<10;k++) game.wildlife.update(.1); await new Promise(r=>setTimeout(r,0));}
      ms.sort((a,b)=>a-b); return {median:+ms[ms.length>>1].toFixed(1), p90:+ms[Math.floor(ms.length*.9)].toFixed(1)};})()`, 900000);
    browser.assertHealthy?.();
    console.log(map, JSON.stringify(r));
  }
} finally { await browser.close(); }
