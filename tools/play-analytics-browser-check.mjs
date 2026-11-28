// Verify the "why do players stop" events (docs/posthog-player-perf.md) in the real game, without
// transmitting anything: game_loaded, panel_closed, objective_done, quest_help, warning_shown,
// species_lost, species_discovered's species, and the session details on game_left; the drop-off
// events (docs/posthog-events.md): play_milestone, opening_prompt, a closed fence prompt as
// opening_step skipped, page_crashed from a breadcrumb a dead page left, and game_left's where-fields.
import assert from 'node:assert/strict';
import { openBrowser } from './browser-session.mjs';
const b = await openBrowser({ label: 'play-analytics', width: 960, height: 600 });
try {
  await b.send('Page.enable');
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*posthog.com*', '*t.secondgrowth.earth*'] });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('second-growth-settings',JSON.stringify({analytics:true,autosave:false,music:false,nature:false,quality:'fast',qualityChosen:true,dayCycle:false,v:2}));
    sessionStorage.setItem('second-growth-pending',JSON.stringify({map:'pnw',mode:'campaign',difficulty:'standard'}));
    window.events=[];
    // (a page that died: its breadcrumb, left for the next start, when the check asks for one)
    if(sessionStorage.getItem('test-crash')){sessionStorage.removeItem('test-crash');localStorage.setItem('second-growth-crumb',JSON.stringify({stage:'Catching the light',map:'reef',at:Date.now()-60e3,t0:Date.now()-90e3}));}
    window.registered={};window.posthog={__SV:1,init(){},register(p){Object.assign(window.registered,p);},capture(event,props){window.events.push({event,props});}};
    // a tab hidden while the game is still loading
    new MutationObserver(()=>{if(!window.hid&&document.getElementById('loading-status')?.textContent==='Growing the landscape'){window.hid=true;Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{value:false,configurable:true});}}).observe(document,{subtree:true,childList:true,characterData:true});
  ` });
  await b.navigate('/?ph&tester=tester');
  await b.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game boot');
  b.assertHealthy();
  // the tester tag, loading_left and first_animal_seen
  const tag = await b.evaluate(`(async()=>{
    const {game:g,renderer:R,ui}=window.secondGrowth, A=await import('/js/analytics.js');
    const out={registered:window.registered.tester, stored:localStorage.getItem('second-growth-tester'), url:location.search, hid:!!window.hid,
      left:window.events.filter(x=>x.event==='loading_left'), gameLeftEarly:window.events.filter(x=>x.event==='game_left').length};
    // first_animal_seen: not on a returning visit; on a first visit, a large animal inside the picture
    const big=g.wildlife.viewAgents.find(a=>g.catalog.animals[a.sp]?.kg>=10&&!g.catalog.animals[a.sp].domestic);
    if(big){
      const pose=R.actors.pose, keep=pose.get(big.id), project=R.project;
      pose.set(big.id,{visible:true,center:{x:0,y:0,z:0}}); R.project=()=>({x:5,y:5});
      ui.analytics.watchFirstAnimal(); out.beforeFirst=window.events.filter(x=>x.event==='first_animal_seen').length;
      A.loadState.firstVisit=true; ui.analytics.watchFirstAnimal();
      out.animal=window.events.find(x=>x.event==='first_animal_seen'); out.bigKey=g.catalog.animals[big.sp].key;
      if(keep) pose.set(big.id,keep); else pose.delete(big.id); R.project=project;
    }
    return out;
  })()`);
  assert.equal(tag.registered, 'tester', 'tester role is registered as a super property'); assert.equal(tag.stored, 'tester', 'tester role is stored');
  assert.ok(!/tester=/.test(tag.url), 'tester param removed from the address');
  assert.ok(tag.hid && tag.left.length === 1 && tag.left[0].props.stage === 'Growing the landscape', 'loading_left fires when the tab is hidden during loading');
  assert.equal(tag.gameLeftEarly, 0, 'no game_left while still loading');
  if (tag.bigKey) { assert.equal(tag.beforeFirst, 0, 'no first_animal_seen on a returning visit'); assert.equal(tag.animal?.props.species, tag.bigKey, 'first_animal_seen names the species'); assert.ok(tag.animal.props.seconds > 0); }
  const r = await b.evaluate(`(async()=>{
    const {game:g,ui}=window.secondGrowth, find=e=>window.events.filter(x=>x.event===e);
    const loaded=find('game_loaded')[0];
    // a panel read and closed
    ui.modal('Test panel','<p>x</p>'); await new Promise(r=>setTimeout(r,1100)); ui.closeModal();
    const closed=find('panel_closed').find(e=>e.props.panel==='Test panel');
    // a chapter objective met: the first Hollis objective is sowing 10 tiles of meadow mix
    if (ui.modalOpen) ui.closeModal();
    (g.stats.used||={}).mix_meadow=20; ui.renderQuest(true);
    const objective=find('objective_done')[0];
    // the quest tracker's help button
    ui.questOpen=true; ui.renderQuest(true); document.querySelector('#quest .q-help')?.click();
    const help=find('quest_help')[0];
    // a warning, twice with different numbers: one event
    g.notify('Invasives cover 12% of the land.','warn'); g.notify('Invasives cover 14% of the land.','warn');
    const warns=find('warning_shown');
    // a species the farm had, gone by the month's end
    const k=g.wildlife.state.findIndex((s,i)=>!g.catalog.animals[i]?.domestic);
    g.wildlife.state[k].pop=3; g.emit('month',{}); g.wildlife.state[k].pop=0; g.emit('month',{});
    const lost=find('species_lost')[0];
    g.emit('discover', g.catalog.animals[k]);
    const found=find('species_discovered').at(-1);
    // the opening's prompts: shown once each, × on the fence prompt is opening_step skipped
    const op=ui.opening, keepFlags=g.flags.opening; op.t0=performance.now();
    op.shown('fence'); op.shown('fence'); op.shown('meadow');
    g.flags.opening={stage:'fence'}; op.skipped('fence'); op.skipped('culvert'); g.flags.opening=keepFlags;
    const prompts=find('opening_prompt').map(e=>e.props.step), skips=find('opening_step').filter(e=>e.props.how==='skipped').map(e=>e.props.step);
    // play_milestone at one active minute
    const S=ui.analytics.session; S.active=59; S.lastInput=performance.now();
    await new Promise(r=>setTimeout(r,1300));
    const mile=find('play_milestone')[0];
    // leaving
    ui.analytics.session.leftAt=-Infinity; window.dispatchEvent(new Event('pagehide'));
    const left=find('game_left').at(-1);
    return {prompts, skips, mile:mile?.props, loaded, closed, objective, help, warns:warns.length, warnText:warns[0]?.props.text, lost, found, lostKey:g.catalog.animals[k].key, left:left?.props};
  })()`);
  assert.ok(r.loaded && r.loaded.props.load_ms > 0 && r.loaded.props.steps.Ready === r.loaded.props.load_ms, 'game_loaded carries load_ms and its steps');
  assert.ok(r.closed && r.closed.props.seconds >= 1, 'panel_closed carries how long the panel was open');
  assert.equal(r.objective?.props.chapter_key, 'fields'); assert.equal(r.objective?.props.objective, 1, 'objective_done names the chapter step');
  assert.equal(r.help?.props.chapter_key, 'fields', 'quest_help names the chapter');
  assert.equal(r.warns, 1, 'one warning_shown per wording'); assert.match(r.warnText, /Invasives cover #% of the land/);
  assert.equal(r.lost?.props.species, r.lostKey, 'species_lost names the species');
  assert.equal(r.found?.props.species, r.lostKey, 'species_discovered names the species, not the count');
  const L = r.left;
  for (const f of ['tools_session', 'fails_money_session', 'fails_unsuitable_session', 'rewards_session', 'species_lost_session', 'warnings_session', 'paused_seconds', 'fast_seconds', 'last_month_net', 'zoom', 'objectives_done', 'objectives'])
    assert.ok(Number.isFinite(L?.[f]), `game_left.${f} is numeric`);
  assert.ok(L.rewards_session >= 1 && Number.isFinite(L.seconds_since_reward), 'game_left counts rewards and the time since the last');
  assert.ok(typeof L.next_objective === 'string', 'game_left names the next campaign objective');
  assert.equal(typeof r.loaded.props.first_visit, 'boolean', 'game_loaded says whether it is a first visit');
  assert.deepEqual(r.prompts, ['fence', 'meadow'], 'opening_prompt once per step');
  assert.deepEqual(r.skips, ['fence'], 'a closed fence prompt is opening_step skipped, only while that is the stage');
  const M = r.mile;
  assert.ok(M && M.minutes === 1 && M.map === 'pnw' && Number.isFinite(M.tools_session), 'play_milestone at one active minute, with map and tools');
  for (const f of ['first_visit', 'opening_stage', 'last_tool', 'last_panel', 'fps_band', 'quality']) {
    assert.ok(f in M, `play_milestone.${f}`); assert.ok(f in L, `game_left.${f}`);
  }
  assert.equal(L.last_panel, 'Test panel', 'game_left names the last panel opened, even once closed');
  assert.ok(L.fps_band == null || /^(under_15|15_25|25_40|40_up)$/.test(L.fps_band), 'fps_band is a band');
  b.assertHealthy();
  // persists across a reload, cleared by ?tester=off; a page that died is page_crashed on the next start
  await b.evaluate(`sessionStorage.setItem('test-crash','1')`);
  await b.navigate('/?ph');
  await b.waitFor('!!window.secondGrowth', 'Game boot (reload)');
  assert.equal(await b.evaluate('window.registered.tester'), 'tester', 'tester role persists across a reload');
  const crash = await b.evaluate(`window.events.filter(x=>x.event==='page_crashed').map(x=>x.props)`);
  assert.equal(crash.length, 1, 'page_crashed once from a dead page\'s breadcrumb');
  assert.equal(crash[0].stage, 'Catching the light'); assert.equal(crash[0].map, 'reef'); assert.equal(crash[0].seconds, 30);
  await b.navigate('/?ph&tester=off');
  await b.waitFor('!!window.secondGrowth', 'Game boot (tester off)');
  assert.equal(await b.evaluate(`window.events.filter(x=>x.event==='page_crashed').length`), 0, 'a page that closed normally leaves no page_crashed');
  assert.deepEqual(await b.evaluate('[window.registered.tester ?? null, localStorage.getItem("second-growth-tester")]'), [null, null], '?tester=off clears the tag');
  console.log('PASS tester tag (stored, registered, persists, off), loading_left on a mid-load hide, first_animal_seen;');
  console.log('PASS game_loaded, panel_closed, objective_done, quest_help, warning_shown (deduplicated), species_lost, species_discovered and game_left session details;');
  console.log('PASS play_milestone, opening_prompt, fence prompt skipped, page_crashed (and none after a normal close), game_left where-fields');
} finally { await b.close(); }
