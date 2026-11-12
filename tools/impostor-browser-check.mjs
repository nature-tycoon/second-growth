// node tools/impostor-browser-check.mjs [--shots]
// Far crowns as baked cards (decision 0042) in the real game: zoomed out, crowns draw their cards
// (with the quarter-size atlas at a device pixel ratio of 1, the full one on Retina), cutting
// triangles; a camera turn, snow and a lost and restored graphics context draw without errors,
// and after the restore every card is baked again. --shots saves the turn and snow frames to
// tools/release-output/impostors/ for a look.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot, pause } from './browser-session.mjs';

const software = !!process.env.CI, shots = process.argv.includes('--shots');
const out = join(projectRoot, 'tools/release-output/impostors');
if (shots) await mkdir(out, { recursive: true });
const fail = msg => { throw new Error(msg); };
let checks = 0;

for (const [map, pixelRatio, cell] of [['sumatra', 1, 64], ['amazon', 2, 128]]) {
  const browser = await openBrowser({ label: 'impostors-' + map, software, width: 1200, height: 750, pixelRatio });
  const shot = async name => {
    if (!shots) return;
    const { data } = await browser.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    await writeFile(join(out, `${map}-${name}.jpg`), Buffer.from(data, 'base64'));
  };
  try {
    await browser.evaluate(`localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'high',qualityChosen:true,fps:'60',shadows:true,dayCycle:false,wind:false,v:2}));sessionStorage.setItem('second-growth-pending',JSON.stringify({map:${JSON.stringify(map)},mode:'free',difficulty:'standard'}));`);
    await browser.navigate('/');
    await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game did not boot', 240000);
    const center = await browser.evaluate(`(async()=>{
      const {game,ui,renderer:R}=window.secondGrowth;
      const {releaseGame}=await import('/tools/release-fixtures.mjs');
      const fx=releaseGame(${JSON.stringify(map)},'forest');
      if(!game.restoreSave(fx.game.saveData())) throw new Error('Restore failed');
      for (const f of ['tree','treeG','shrub','ground']) game.border[f].set(fx.game.border[f]);
      if (ui.modalOpen) ui.closeModal(); ui.afterNewGame(); ui.refreshTop(true);
      game.speed=0; R.autoRes=false; R.setRes(1); R.zoom=0.25; R.zoomGoal=null; R.centerOn(...fx.center); R.updateCamera();
      return fx.center;})()`, 600000);
    const state = `(()=>{
      const R=window.secondGrowth.renderer, F=R.flora, I=F.impostors;
      let crowns=0, cards=0;
      for (const [key,pool] of F.pools) if (key.startsWith('crown:')) for (const p of pool.subs.values()) if (p.n) { crowns++; if (p.mesh.material===p.geoCard?.userData.material) cards++; }
      return {cell:I.cell, models:I.slots.size, ready:[...I.slots.values()].every(s=>s.card.userData.ready), baked:I.stats.baked, full:I.stats.full, crowns, cards, lod:F.view[0]};})()`;
    // (one frame's count: the fewest of several, since a frame that also redraws the shadow map,
    // where crowns cast through their far models, counts those too; with software graphics on CI
    // that redraw often fell in the sampled frame)
    const triangles = `(async()=>{const R=window.secondGrowth.renderer; await new Promise(r=>setTimeout(r,1200)); let fewest=Infinity;
      for(let i=0;i<8;i++){ await new Promise(r=>setTimeout(r,${software ? 900 : 300})); fewest=Math.min(fewest,R.perfSample(false).triangles); } return fewest;})()`;
    await pause(software ? 8000 : 4000);
    const s = await browser.evaluate(state);
    if (s.lod !== 3) fail(`${map}: not at the far level (${s.lod})`);
    if (s.cell !== cell) fail(`${map}: ${s.cell}-pixel pictures at a device pixel ratio of ${pixelRatio}, expected ${cell}`);
    if (!s.models || !s.ready || s.full) fail(`${map}: ${JSON.stringify(s)}`);
    if (s.cards !== s.crowns) fail(`${map}: ${s.cards} of ${s.crowns} crown regions draw their cards`);
    const withCards = await browser.evaluate(triangles);
    await browser.evaluate('window.secondGrowth.renderer.flora.setImpostors(false)');
    const without = await browser.evaluate(triangles);
    await browser.evaluate('window.secondGrowth.renderer.flora.setImpostors(true)');
    if (!(withCards < without * 0.95)) fail(`${map}: ${withCards} triangles with cards, ${without} without`);
    console.log(`PASS ${map}: ${s.models} crown models baked (${cell}-px pictures), every crown a card, ${(without / 1e6).toFixed(2)}M -> ${(withCards / 1e6).toFixed(2)}M triangles`);
    checks++;

    await shot('turn-0');
    await browser.evaluate('window.secondGrowth.renderer.rotate(1)');
    for (let k = 1; k <= 4; k++) { await pause(70); await shot('turn-' + k); }
    await pause(1500); await shot('turn-done');
    await browser.evaluate('window.secondGrowth.game.snow=1');
    await pause(4000); await shot('snow');
    await browser.evaluate('window.secondGrowth.game.snow=0');
    browser.assertHealthy();
    console.log(`PASS ${map}: a camera turn and snow draw without errors`);
    checks++;

    const before = (await browser.evaluate(state)).baked;
    await browser.evaluate(`(()=>{const gl=window.secondGrowth.renderer.gl.getContext(); window.__lose=gl.getExtension('WEBGL_lose_context'); window.__lose.loseContext();})()`);
    await pause(1000);
    await browser.evaluate('window.__lose.restoreContext()');
    await pause(software ? 10000 : 4000);
    const after = await browser.evaluate(state);
    if (after.baked !== before + after.models || !after.ready || after.cards !== after.crowns) fail(`${map}: after a lost context ${JSON.stringify(after)} (baked before ${before})`);
    await shot('restored');
    browser.assertHealthy();
    console.log(`PASS ${map}: after a lost graphics context all ${after.models} crown models are baked again and drawn`);
    checks++;
  } finally { await browser.close(); }
}
console.log(`${checks} impostor browser checks passed`);
