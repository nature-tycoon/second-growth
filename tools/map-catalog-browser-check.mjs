// Real canvas caches and the production UI must read their farm, not the selected map.
import assert from 'node:assert/strict';
import { openBrowser } from './browser-session.mjs';

const browser = await openBrowser({ label: 'map-catalog' });
try {
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('second-growth-settings', JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'fast',shadows:false,fps:'30',v:2}));
    sessionStorage.setItem('second-growth-pending', JSON.stringify({map:'pnw',mode:'free',difficulty:'standard'}));
  ` });
  await browser.navigate('/');
  await browser.waitFor('!!window.secondGrowth && document.getElementById("loading-screen").classList.contains("done")', 'Game boot');
  const passed = await browser.evaluate(`(async () => {
    const {game,ui,renderer}=window.secondGrowth;
    const {Game}=await import('/js/game.js');
    const {setBiome,mapCatalog}=await import('/js/biome.js');
    const {T}=await import('/js/config.js');
    const sprites=await import('/js/render/sprites.js');
    const {animalThumb,plantThumb}=await import('/js/ui/thumbnails.js');
    if(ui.modalOpen) ui.closeModal(); game.speed=0; game.autosave=false;
    const pnw=game.catalog, before=animalThumb('raccoon',pnw), plant=pnw.plants.find(p=>p?.native && p.layer===0);
    const plantBefore=plantThumb(plant.key,pnw), gravel=sprites.terrainSprite(T.GRAVEL,0,0,pnw);
    const reef=new Game(); reef.newGame(42,'free','standard','reef'); reef.speed=0;
    const sand=sprites.terrainSprite(T.GRAVEL,0,0,mapCatalog('chinandega'));
    if(gravel===sand || gravel.toDataURL()===sand.toDataURL()) throw Error('Terrain atlas cache mixed regional substrates');
    if(sprites.terrainSprite(T.GRAVEL,0,0,pnw)!==gravel) throw Error('Selected map replaced a retained sprite');
    const coastal=mapCatalog('chinandega'), regional=animalThumb('raccoon',coastal);
    if(before===regional || animalThumb('raccoon',pnw)!==before) throw Error('Regional raccoon portraits share a cache entry');
    if(plantThumb(plant.key,pnw)!==plantBefore) throw Error('Selected map changed plant thumbnails');
    const terrain=renderer.terrain;
    terrain.updateSurface(game);
    const colours=[...terrain.mesh.geometry.attributes.color.array];
    const poses=()=>game.wildlife.agents.map(a=>{const p=renderer.actors.pose.get(a.id);return [a.id,p?.center?.toArray()];});
    renderer.draw(game,ui.state,0); const beforePoses=JSON.stringify(poses());
    setBiome('sumatra'); terrain.updateSurface(game); renderer.draw(game,ui.state,0); ui.refreshTop(true); ui.openCategory('plants'); ui.renderToolPanel();
    if(!terrain.mesh.geometry.attributes.color.array.every((v,i)=>v===colours[i])) throw Error('Selected map recoloured the live farm');
    if(JSON.stringify(poses())!==beforePoses) throw Error('Selected map changed animal drawing positions');
    if(document.getElementById('stat-visitors').hidden) throw Error('Another map hid this farm’s visitor counter');
    if(!ui.toolsFor('plants').every(t=>pnw.tools[t.key]===t)) throw Error('Toolbar reads another map’s tools');
    return ['Real canvas sprite and portrait caches retain each map’s artwork', 'Production renderer and toolbar retain the live farm after another map is selected'];
  })()`);
  assert.equal(passed.length, 2);
  for (const name of passed) console.log('PASS ' + name);
  browser.assertHealthy();
} finally { await browser.close(); }
