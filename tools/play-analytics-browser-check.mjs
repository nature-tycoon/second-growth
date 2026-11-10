// Verify the "why do players stop" events (docs/posthog-player-perf.md) in the real game, without
// transmitting anything: game_loaded, panel_closed, objective_done, quest_help, warning_shown,
// species_lost, species_discovered's species, and the session details on game_left.
import assert from 'node:assert/strict';
import { openBrowser } from './browser-session.mjs';
const b = await openBrowser({ label: 'play-analytics', width: 960, height: 600 });
try {
  await b.send('Page.enable');
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*posthog.com*'] });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('second-growth-settings',JSON.stringify({analytics:true,autosave:false,music:false,nature:false,quality:'fast',qualityChosen:true,dayCycle:false,v:2}));
    sessionStorage.setItem('second-growth-pending',JSON.stringify({map:'pnw',mode:'campaign',difficulty:'standard'}));
    window.events=[];
    window.posthog={__SV:1,init(){},register(){},capture(event,props){window.events.push({event,props});}};
  ` });
  await b.navigate('/?ph');
  await b.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game boot');
  b.assertHealthy();
  const r = await b.evaluate(`(async()=>{
    const {game:g,ui}=window.secondGrowth, find=e=>window.events.filter(x=>x.event===e);
    const loaded=find('game_loaded')[0];
    // a panel read and closed
    ui.modal('Test panel','<p>x</p>'); await new Promise(r=>setTimeout(r,1100)); ui.closeModal();
    const closed=find('panel_closed').find(e=>e.props.panel==='Test panel');
    // a chapter objective met: the first Hollis objective is "inspect a tile"
    if (ui.modalOpen) ui.closeModal();
    g.flags.inspected=true; ui.renderQuest(true);
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
  console.log('PASS game_loaded, panel_closed, objective_done, quest_help, warning_shown (deduplicated), species_lost, species_discovered and game_left session details');
} finally { await b.close(); }
