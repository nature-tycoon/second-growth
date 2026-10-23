// Production UI, shaders and rendered behavior states in an isolated browser profile.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { openBrowser } from './browser-session.mjs';
const browser = await openBrowser({ label: 'animal-behavior', width: 960, height: 600 });
try {
  await browser.navigate('/');
  await browser.evaluate(`localStorage.setItem('second-growth-settings', JSON.stringify({ quality: 'fast', qualityChosen: true, shadows: false, autosave: false, music: false, nature: false, analytics: false })); sessionStorage.setItem('second-growth-pending', JSON.stringify({map:'pnw',mode:'free',difficulty:'standard'}));`);
  await browser.navigate('/');
  await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game not ready');
  const rows = await browser.evaluate(`(async () => {
    const { game, renderer, ui } = window.secondGrowth;
    const { ANIMAL, isMale } = await import('/js/data/animals.js');
    const { PLANTS, PLANT } = await import('/js/data/plants.js');
    const { T, H } = await import('/js/config.js');
    const { forageChoose, cleanerChoose } = await import('/js/sim/animal-foraging.js');
    const { greet, arrive } = await import('/js/sim/animal-life.js');
    const { buildSpecies, faunaMaterial } = await import('/js/render3d/fauna.js');
    await import('/js/lang/es.js');
    const { initLang, tr } = await import('/js/i18n.js');
    const results=[];
    if (ui.modalOpen) ui.closeModal();
    for (const [map,key,food,status] of [['pnw','rabbit','grass','Grazing'],['amazon','howler','leaves','Eating canopy leaves'],['serengeti','topi','grass','Grazing'],['atlanta','anole','insects','Catching insects'],['chinandega','iguana','browse','Browsing leaves'],['reef','greenturtle','seagrass','Grazing seagrass'],['sumatra','pangolin','insects','Catching insects']]) {
      game.newGame(1987,'free','standard',map);game.speed=0;game.autosave=false;
      const wl=game.wildlife,w=game.world;wl.agents=[];wl.ids.clear();wl.recount();
      const i=w.idx(40,30);w.terrain[i]=map==='reef'?T.CREEK:T.SOIL;w.struct[i]=-1;w.fire[i]=0;
      w.tree[i]=0;w.shrub[i]=0;w.ground[i]=0;w.feature[i]=0;
      if(map==='reef'){w.vh.fill(-2);w._shore=new Uint8Array(w.n);}
      if(food==='insects')w.insects[i]=1;
      if(food==='grass'||food==='seagrass'){const p=PLANTS.find(p=>p&&p.layer===0&&(food==='seagrass'?['seagrass','spoongrass'].includes(p.look.type):['grass','tallgrass','sedge'].includes(p.look.type)));w.ground[i]=p.id;w.groundG[i]=.9;}
      if(food==='browse'){const p=PLANTS.find(p=>p&&p.layer===1&&!p.invasive);w.shrub[i]=p.id;w.shrubG[i]=.9;}
      if(food==='leaves'){const p=PLANTS.find(p=>p&&p.layer===2&&!p.invasive);w.tree[i]=p.id;w.treeG[i]=.9;}
      const a=wl.spawn(ANIMAL[key],40,30,{silent:true,age:600});a.x=40.5;a.y=30.5;
      const random=Math.random;Math.random=()=>0;try{if(!forageChoose(wl,a,ANIMAL[key]))throw Error(map+' failed to forage');}finally{Math.random=random;}
      renderer.setWorld(game);renderer.centerOn(40.5,30.5);renderer.zoom=3;renderer.updateCamera();renderer.draw(game,ui.state,0);
      const html=ui.agentHTML(a),pose=renderer.actors.pose.get(a.id);
      if(!html.includes(status)||!pose?.visible||![pose.x,pose.y,pose.z].every(Number.isFinite))throw Error(map+' missing rendered foraging/status');
      localStorage.setItem('second-growth-lang','es');initLang('chinandega');
      if(tr(status)===status)throw Error('Missing Spanish behavior label: '+status);
      initLang('pnw');
      if(renderer.gl.getContext().getError()!==0)throw Error(map+' WebGL error');
      results.push({map,key,status});
    }
    game.newGame(1987,'free','standard','chinandega');game.speed=0;
    const spoon=buildSpecies(ANIMAL.spoonbill),egret=buildSpecies(ANIMAL.egret);
    const sm=faunaMaterial(spoon.motion),em=faunaMaterial(egret.motion),shader={uniforms:{},vertexShader:'',fragmentShader:''};
    sm.onBeforeCompile(shader);
    if(!shader.vertexShader.includes('float sweep')||sm.customProgramCacheKey()===em.customProgramCacheKey())throw Error('Spoonbill sweep/cache missing');
    spoon.geo.dispose();egret.geo.dispose();sm.dispose();em.dispose();
    // Compile the feeding sweep through the actual renderer, not just the source hook.
    const w=game.world;game.wildlife.agents=[];game.wildlife.ids.clear();w.terrain[w.idx(40,30)]=T.MARSH;w.struct[w.idx(40,30)]=-1;
    const bird=game.wildlife.spawn(ANIMAL.spoonbill,40,30,{silent:true});bird.drinkT=3;bird.drinkAt=[41,30];bird.wait=99;
    renderer.setWorld(game);renderer.centerOn(40.5,30.5);renderer.updateCamera();renderer.draw(game,ui.state,0);
    if(renderer.gl.getContext().getError()!==0)throw Error('Spoonbill shader failed');
    results.push({map:'chinandega',key:'spoonbill',status:'Bill sweep shader compiled'});
    return results;
  })()`, 180000);
  assert.equal(rows.length, 8); browser.assertHealthy();
  await mkdir(new URL('./release-output/', import.meta.url), { recursive: true });
  await writeFile(new URL('./release-output/animal-behavior-browser.json', import.meta.url), JSON.stringify(rows,null,2));
  for(const row of rows)console.log(`PASS ${row.map}/${row.key}: ${row.status}`);
  console.log('Behavior status, Spanish labels and production shaders passed on all seven maps.');
} finally { await browser.close(); }
