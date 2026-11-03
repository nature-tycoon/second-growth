// How long each animal kind's model takes to build the first time it's drawn, in a new game.
//   node tools/species-warm-probe.mjs [maps]
import { openBrowser } from './browser-session.mjs';
const maps = (process.argv[2] || 'sumatra,pnw').split(',');
const browser = await openBrowser({ label: 'species-warm', ...(process.env.PLAY_ROOT ? { root: process.env.PLAY_ROOT } : {}), software: false, width: 1440, height: 900, pixelRatio: 2 });
try {
  for (const map of maps) {
    await browser.evaluate(`localStorage.clear();localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'high',qualityChosen:true,fps:'60',shadows:true,dayCycle:true,v:2}));sessionStorage.setItem('second-growth-pending',JSON.stringify({map:${JSON.stringify(map)},mode:'free',difficulty:'standard'}));`);
    await browser.navigate('/');
    await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game did not boot');
    const r = await browser.evaluate(`(async()=>{
      const {game,renderer:R,ui}=window.secondGrowth; if (ui.modalOpen) ui.closeModal(); game.speed=0;
      await new Promise(r=>setTimeout(r,${Number(process.env.WARM_WAIT || 1500)}));
      const F=R.actors.fauna, gl=R.gl, out=[], have=new Set(F.species.keys());
      for (const def of game.catalog.animals) { if (!def || have.has(F.modelKey(def))) continue;
        const p0=gl.info.programs.length; let t=performance.now(); const p=F.pool(def); const build=performance.now()-t;
        t=performance.now(); p.distant(); const far=performance.now()-t;
        p.mesh.count=1; p.far.mesh.count=1; t=performance.now(); gl.render(R.scene,R.camera); gl.getContext().finish(); const draw=performance.now()-t; p.mesh.count=0; p.far.mesh.count=0;
        out.push({key:def.key, build:+build.toFixed(1), far:+far.toFixed(1), firstDraw:+draw.toFixed(1), newPrograms:gl.info.programs.length-p0});
      }
      let t=performance.now(); gl.render(R.scene,R.camera); gl.getContext().finish(); const plain=performance.now()-t;
      return {already:[...have], plainDraw:+plain.toFixed(1), out};})()`, 300000);
    const sum = k => r.out.reduce((t, o) => t + o[k], 0).toFixed(0);
    console.log(`${map}: ${r.out.length} kinds not yet built (already: ${r.already.length}); ordinary frame draw ${r.plainDraw} ms; total build ${sum('build')} ms, far ${sum('far')} ms, first draw ${sum('firstDraw')} ms, new shader programs ${sum('newPrograms')}`);
    for (const o of r.out.sort((a, b) => b.build + b.far + b.firstDraw - a.build - a.far - a.firstDraw).slice(0, 8)) console.log(`   ${o.key}: build ${o.build}, far ${o.far}, first draw ${o.firstDraw}, programs +${o.newPrograms}`);
  }
} finally { await browser.close(); }
