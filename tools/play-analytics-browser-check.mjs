// Verify the "why do players stop" events (docs/posthog-player-perf.md) in the real game, without
// transmitting anything: game_loaded, panel_closed, objective_done, quest_help, warning_shown,
// species_lost, species_discovered's species, and the session details on game_left.
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
    // leaving
    ui.analytics.session.leftAt=-Infinity; window.dispatchEvent(new Event('pagehide'));
    const left=find('game_left').at(-1);
    return {loaded, closed, objective, help, warns:warns.length, warnText:warns[0]?.props.text, lost, found, lostKey:g.catalog.animals[k].key, left:left?.props};
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
  b.assertHealthy();
  // persists across a reload, cleared by ?tester=off
  await b.navigate('/?ph');
  await b.waitFor('!!window.secondGrowth', 'Game boot (reload)');
  assert.equal(await b.evaluate('window.registered.tester'), 'tester', 'tester role persists across a reload');
  await b.navigate('/?ph&tester=off');
  await b.waitFor('!!window.secondGrowth', 'Game boot (tester off)');
  assert.deepEqual(await b.evaluate('[window.registered.tester ?? null, localStorage.getItem("second-growth-tester")]'), [null, null], '?tester=off clears the tag');
  console.log('PASS tester tag (stored, registered, persists, off), loading_left on a mid-load hide, first_animal_seen;');
  console.log('PASS game_loaded, panel_closed, objective_done, quest_help, warning_shown (deduplicated), species_lost, species_discovered and game_left session details');
} finally { await b.close(); }
