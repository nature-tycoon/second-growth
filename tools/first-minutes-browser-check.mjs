// The first two minutes for a brand-new player (docs/posthog-review-2026-11.md, player fix 1): no
// saved farm means no mode choice, straight into Free Play with a tip; one stroke of seed meets the
// first goal within a few game days; its follow-up offers the story once, but only once the player
// pauses or goes idle, and taking it starts Chapter 1 on the same farm without a reload. The opening
// minutes hold back what the simulation announces on its own (alarms, a stack of good news), and a
// refused building says where it fits. The opening (session 3): the view starts at the boundary fence
// with deer waiting beyond it, one click tears the fence out and they walk onto the field within
// ~10 s, one button follows one at eye level (session 4), then one click pulls the road culvert,
// and only then the planting tip. A hawk and a party of crows are in that first picture (session 5). After the first planting, "Watch 10 years" runs the farm at top
// speed over what was planted and stops on its own, on any key, or when money runs low (session 4). A player with a saved farm still gets the chooser. FIRST_MINUTES_SHOTS=<dir> also saves screenshots of the sown strip.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { openBrowser } from './browser-session.mjs';

const shots = process.env.FIRST_MINUTES_SHOTS;
const settings = `localStorage.setItem('second-growth-settings',JSON.stringify({analytics:true,autosave:false,music:false,nature:false,quality:'fast',qualityChosen:true,dayCycle:false,v:2}));
  window.events=[]; window.posthog={__SV:1,init(){},register(){},capture(event,props){window.events.push({event,props});}};`;
const booted = '!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))';

for (const [width, height] of [[812, 375], [1280, 800]]) {
  const b = await openBrowser({ label: 'first-minutes', width, height });
  try {
    await b.send('Page.enable');
    await b.send('Network.enable');
    await b.send('Network.setBlockedURLs', { urls: ['*posthog.com*'] });
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: settings });
    await b.navigate('/?ph');
    await b.waitFor(booted, 'Game boot');
    b.assertHealthy();
    const start = await b.evaluate(`(()=>{
      const {game:g,ui}=window.secondGrowth, toasts=[...document.querySelectorAll('#toasts .toast-text')].map(t=>t.textContent);
      return { mode:g.mode, speed:g.speed, modal:!!ui.modalOpen, choosing:document.body.classList.contains('choosing-map'),
        start:window.events.find(e=>e.event==='game_start')?.props, tip:toasts.some(t=>/^Try it: open Plant/.test(t)),
        prompt:[...document.querySelectorAll('#toasts .toast-act')].some(x=>/^Tear out the fence/.test(x.textContent)),
        waiting:g.wildlife.agents.filter(a=>a.key==='deer'&&a.gate&&!a.gate.entering&&a.leaving&&a.y<0).length, stage:g.flags.opening?.stage, money:g.money };
    })()`);
    assert.equal(start.mode, 'free', 'a first visit plays Free Play');
    assert.equal(start.modal, false, 'no panel stands between a first visit and the farm');
    assert.equal(start.choosing, false);
    assert.ok(start.speed > 0, 'the farm is running');
    assert.equal(start.start?.first_visit, true, 'game_start marks the first visit');
    assert.equal(start.stage, 'fence', 'a first visit opens on the fence');
    assert.ok(start.waiting >= 1, `deer wait beyond the boundary fence (${start.waiting})`);
    assert.ok(start.prompt, 'the one prompt: tear out the fence');
    assert.equal(start.tip, false, 'the planting tip waits for the opening');
    await b.waitFor('!window.secondGrowth.renderer.fly', 'the glide up to the fence', 30000);
    if (shots) { await mkdir(shots, { recursive: true }); await writeFile(`${shots}/fence-${width}x${height}.png`, Buffer.from((await b.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); }
    const view = await b.evaluate(`(()=>{
      const {game:g,renderer:R}=window.secondGrowth, d=g.wildlife.agents.filter(a=>a.key==='deer'&&a.gate);
      const p=d.map(a=>R.project(a.x,R.heightAtScene(a.x,a.y),a.y)).filter(Boolean);
      return { tz:R.target.z, onScreen:p.filter(q=>q.x>0&&q.y>0&&q.x<R.vw&&q.y<R.vh).length, n:d.length };
    })()`);
    // (session 5: the farm's common animals come into the same picture while the prompt is up, the
    // hawk overhead and crows on the field; the page counts what it has shown)
    await b.evaluate(`(()=>{ const {game:g,renderer:R}=window.secondGrowth; window.seen5={hawk:0,crow:0};
      const tick=()=>{ for (const k of ['hawk','crow']) { const n=g.wildlife.agents.filter(a=>a.key===k&&!a.leaving).map(a=>R.project(a.x,R.heightAtScene(a.x,a.y)+(a.flying?(a.flightY||3):0),a.y)).filter(q=>q&&q.x>0&&q.y>0&&q.x<R.vw&&q.y<R.vh).length; window.seen5[k]=Math.max(window.seen5[k],n); } };
      tick(); window.seen5.timer=setInterval(tick,250); })()`);
    try { await b.waitFor('window.seen5.hawk>=1&&window.seen5.crow>=2', 'hawk and crows in the opening picture', 30000); }
    finally { await b.evaluate('clearInterval(window.seen5.timer)'); }
    assert.ok(view.tz < 10, `the view is at the north fence (target y ${view.tz.toFixed(1)})`);
    assert.ok(view.onScreen >= 1, `the waiting deer are in the picture (${view.onScreen} of ${view.n})`);

    // one click: the fence comes out, the deer walk onto the field within about 10 s
    const t0 = Date.now(), day0 = await b.evaluate(`window.secondGrowth.game.day`);
    await b.evaluate(`[...document.querySelectorAll('#toasts .toast-act')].find(x=>/^Tear out the fence/.test(x.textContent)).click()`);
    // (wait on the game's clock: 10 s of play is 7.2 game days; the wall clock only bounds a stuck game)
    try { await b.waitFor(`window.secondGrowth.game.wildlife.agents.some(a=>a.key==='deer'&&!a.leaving&&!a.gate&&a.y>2) || window.secondGrowth.game.day>=${day0}+7.2`, 'a deer on the field', 120000);
      assert.ok(await b.evaluate(`window.secondGrowth.game.wildlife.agents.some(a=>a.key==='deer'&&!a.leaving&&!a.gate&&a.y>2)`), 'a deer on the field within 10 s of play'); }
    catch (e) { console.log(await b.evaluate(`JSON.stringify({day:window.secondGrowth.game.day,speed:window.secondGrowth.game.speed,fence:window.secondGrowth.game.world.feature[window.secondGrowth.game.flags.opening.x],deer:window.secondGrowth.game.wildlife.agents.filter(a=>a.key==='deer').map(a=>[a.x.toFixed(1),a.y.toFixed(1),a.state,a.leaving,a.gate])})`)); throw e; }
    // (in game time at normal speed, 0.72 days a second: headless Chrome draws a few frames a second
    // and a frame moves the game 0.1 s at most, so the clock on the wall runs slower than a player's)
    const inSec = (Date.now() - t0) / 1000, gameSec = (await b.evaluate(`window.secondGrowth.game.day`) - day0) / 0.72;
    assert.ok(gameSec <= 10, `deer on the field ${gameSec.toFixed(1)} s of play (${inSec.toFixed(1)} s on the wall) after the click`);
    if (shots) await writeFile(`${shots}/deer-in-${width}x${height}.png`, Buffer.from((await b.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    const fenceEv = await b.evaluate(`window.events.find(e=>e.event==='farm_opened'&&e.props.how==='fence')?.props`);
    assert.ok(fenceEv && Number.isFinite(fenceEv.seconds) && fenceEv.prompted, 'farm_opened { how: fence, seconds } is sent');
    // one button follows a deer at eye level (once per first visit); the culvert prompt waits for it
    await b.waitFor(`[...document.querySelectorAll('#toasts .toast-act')].some(x=>/^Follow a/.test(x.textContent))`, 'follow-a-deer offer', 20000);
    assert.equal(await b.evaluate(`[...document.querySelectorAll('#toasts .toast-act')].some(x=>/^Pull it out/.test(x.textContent))`), false, 'the culvert prompt waits for the follow offer');
    await b.evaluate(`[...document.querySelectorAll('#toasts .toast-act')].find(x=>/^Follow a/.test(x.textContent)).click()`);
    await new Promise(r => setTimeout(r, 1500));
    const follow = await b.evaluate(`(()=>{ const {ui,renderer:R}=window.secondGrowth;
      return { on:ui.watch.on, eye:ui.watch.eyeLevel, agent:R.eyeAgent?.key, locked:ui.watch.locked?.key,
        ev:window.events.find(e=>e.event==='watch_mode')?.props?.from,
        culvert:[...document.querySelectorAll('#toasts .toast-act')].some(x=>/^Pull it out/.test(x.textContent)) }; })()`);
    assert.ok(follow.on && follow.eye, 'Follow starts watch mode at eye level');
    assert.equal(follow.agent, 'deer', 'the eye rides with a deer');
    assert.equal(follow.locked, 'deer', 'locked onto it');
    assert.equal(follow.ev, 'follow_deer', 'watch_mode { from: follow_deer } is sent');
    assert.equal(follow.culvert, false, 'no culvert prompt while following');
    await b.evaluate(`window.secondGrowth.ui.watch.stop()`);
    assert.equal(await b.evaluate(`window.secondGrowth.ui.watch.eyeLevel`), false, 'the eye setting goes back after');
    // then the culvert, one short prompt
    await b.waitFor(`[...document.querySelectorAll('#toasts .toast-act')].some(x=>/^Pull it out/.test(x.textContent))`, 'culvert prompt', 20000);
    await b.evaluate(`[...document.querySelectorAll('#toasts .toast-act')].find(x=>/^Pull it out/.test(x.textContent)).click()`);
    await b.waitFor(`window.events.some(e=>e.event==='farm_opened'&&e.props.how==='culvert')`, 'culvert pulled', 8000);
    await b.waitFor(`[...document.querySelectorAll('#toasts .toast-text')].some(t=>/^Try it: open Plant/.test(t.textContent))`, 'the planting tip after the opening', 8000);
    const after = await b.evaluate(`(()=>{ const g=window.secondGrowth.game; let c=0; for(let i=0;i<g.world.n;i++) if(g.world.feature[i]===7) c++; return { money:g.money, culverts:c, stage:g.flags.opening?.stage }; })()`);
    assert.equal(after.culverts, 0, 'the culvert is out');
    assert.equal(after.stage, 'done');
    assert.ok(after.money >= 20000, `plenty left for planting ($${Math.round(after.money)} of $${Math.round(start.money)})`);
    await b.evaluate(`document.querySelectorAll('#toasts .toast').forEach(t=>t.remove())`);

    // quiet opening minutes: what the simulation says on its own stays in the journal
    const quiet = await b.evaluate(`(()=>{
      const {game:g,ui}=window.secondGrowth, shown=()=>[...document.querySelectorAll('#toasts .toast-text')].map(t=>t.textContent);
      g.inSim=true;
      g.notify('QFlood: the river spilled over','flood'); g.notify('QWarn: invasives are spreading','warn'); g.notify('QFire: wildfire','fire');
      g.notify('QFound A arrived','discover'); g.notify('QFound B arrived','discover');
      g.notify('QFence: deer tried to wander in, but the old boundary fence stopped them','warn',null,{keep:true});
      g.inSim=false;
      g.notify('QReply: not enough money','warn'); // (a reply to the player: shown)
      const t=shown(), j=ui.journal.map(n=>n.text);
      return { alarm:t.some(x=>/^Q(Flood|Warn|Fire)/.test(x)), found:t.filter(x=>/^QFound/.test(x)).length,
        fence:t.some(x=>/^QFence/.test(x)), reply:t.some(x=>/^QReply/.test(x)), journal:j.filter(x=>/^Q/.test(x)).length, held:ui.quiet?.held };
    })()`);
    assert.equal(quiet.alarm, false, 'no alarm notices pop up in a first visit\'s opening minutes');
    assert.ok(quiet.found <= 1, `good news comes one at a time (${quiet.found} shown)`);
    assert.ok(quiet.fence && quiet.reply, 'the fence note and replies to the player still show');
    assert.equal(quiet.journal, 7, 'every held notice is still in the journal');
    await b.evaluate(`document.querySelectorAll('#toasts .toast').forEach(t=>t.remove())`);

    // a refused visitor center says where it fits
    const refused = await b.evaluate(`(async()=>{
      const {game:g,ui}=window.secondGrowth, w=g.world, money=g.money, {T}=await import('/js/config.js'); g.money=1e6;
      // dry open ground with no road within three tiles: the center can't go here
      let at=-1;
      for(let i=0;i<w.n&&at<0;i++){ const x=i%w.w,y=(i/w.w)|0; if(x<4||y<4||x>w.w-6||y>w.h-6||w.terrain[i]===T.ROAD||w.struct[i]>=0||(g.mapDefinition.canEdit&&!g.mapDefinition.canEdit(g,i))) continue;
        let road=false; for(let yy=y-3;yy<=y+4;yy++) for(let xx=x-3;xx<=x+4;xx++) if(w.terrain[w.idx(xx,yy)]===T.ROAD) road=true;
        if(!road) at=i; }
      const s=ui.actions.begin('build_center'); ui.actions.applyTiles(s,[at]); ui.actions.end(s);
      g.money=money;
      const t=[...document.querySelectorAll('#toasts .toast')].find(x=>/visitor center/i.test(x.textContent));
      return { text:t?.textContent||'', clickable:!!t?.classList.contains('clickable'), built:s.count };
    })()`);
    assert.equal(refused.built, 0, 'the center is refused away from roads');
    assert.match(refused.text, /It fits about \d+ tiles to the|Lay a Gravel road/, `a refused building says where it can go: ${refused.text}`);
    if (/It fits/.test(refused.text)) assert.ok(refused.clickable, 'the refusal note looks there when clicked');
    await b.evaluate(`document.querySelectorAll('#toasts .toast').forEach(t=>t.remove())`);

    // one stroke of meadow mix across a field, then a few game days
    const sown = await b.evaluate(`(async()=>{
      const {game:g,ui,renderer}=window.secondGrowth;
      ui.lastInput=performance.now(); // (the player just painted: the opening's minutes left the idle clock wound on)
      const s=ui.actions.begin('mix_meadow'); for(let x=10;x<=30;x++) ui.actions.paint(s,x,50,s.tool.size); ui.actions.end(s);
      renderer.centerOn(20,50); renderer.zoom=2.2;
      const d0=g.day; g.speed=1;
      while(!g.goalsDone.sprout && g.day<d0+5) await new Promise(r=>setTimeout(r,200));
      return { planted:g.stats.planted, days:g.day-d0, done:!!g.goalsDone.sprout,
        toast:[...document.querySelectorAll('#toasts .toast-text')].some(t=>/First sprouts/.test(t.textContent)) };
    })()`, 60000);
    assert.ok(sown.planted >= 10, `one stroke plants 10 (planted ${sown.planted})`);
    assert.ok(sown.done && sown.days <= 2, `the first goal lands within two game days (${sown.days})`);
    assert.ok(sown.toast, 'the goal shows as a toast');
    if (shots) {
      await mkdir(shots, { recursive: true });
      await new Promise(r => setTimeout(r, 1500));
      const shot = await b.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(`${shots}/sown-${width}x${height}.png`, Buffer.from(shot.data, 'base64'));
    }
    // "Watch 10 years": offered once after the first planting; top speed, panels away, over the planting
    await b.waitFor(`[...document.querySelectorAll('#toasts .toast-act')].some(x=>/^Watch 10 years/.test(x.textContent))`, 'time-lapse offer', 30000);
    assert.ok(await b.evaluate(`window.events.some(e=>e.event==='timelapse_offered')`), 'timelapse_offered is sent');
    await b.evaluate(`[...document.querySelectorAll('#toasts .toast-act')].find(x=>/^Watch 10 years/.test(x.textContent)).click()`);
    const lapseDay0 = await b.evaluate(`window.secondGrowth.game.day`);
    await new Promise(r => setTimeout(r, 4000));
    const lapse = await b.evaluate(`(()=>{ const {game:g,ui,renderer:R}=window.secondGrowth;
      return { on:ui.timelapse.on, watch:ui.watch.on, cls:ui.watch.el.classList.contains('lapse'), speed:g.speed, day:g.day,
        bar:getComputedStyle(ui.watch.el.querySelector('.w-bar')).display, hint:ui.watch.el.querySelector('.w-lapse').textContent,
        x:R.target.x, z:R.target.z, ev:window.events.find(e=>e.event==='timelapse_started')?.props,
        story:[...document.querySelectorAll('#toasts .toast-act')].some(x=>x.textContent==='Story mode') }; })()`);
    assert.ok(lapse.on && lapse.watch && lapse.cls, 'the time-lapse runs in watch mode');
    assert.equal(lapse.speed, 3, 'at the top speed');
    assert.ok(lapse.day > lapseDay0, 'the days go by');
    assert.equal(lapse.bar, 'none', 'no controls: it ends on a click');
    assert.match(lapse.hint, /^Year \d+ of 10/, 'the years so far show');
    assert.ok(Math.abs(lapse.x - 20) < 16 && Math.abs(lapse.z - 50.5) < 16, `the camera is over the planting (${lapse.x.toFixed(1)}, ${lapse.z.toFixed(1)})`);
    assert.equal(lapse.ev?.from, 'offer', 'timelapse_started { from: offer }');
    assert.equal(lapse.story, false, 'no Story offer during the time-lapse');
    if (shots) await writeFile(`${shots}/lapse-${width}x${height}.png`, Buffer.from((await b.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await b.evaluate(`(()=>{ const t=window.secondGrowth.ui.timelapse; t.day0=window.secondGrowth.game.day-1200; })()`); // (ten years, without the wait)
    await b.waitFor(`!window.secondGrowth.ui.timelapse.on`, 'the time-lapse ends on its own', 10000);
    const lapsed = await b.evaluate(`(()=>{ const {game:g,ui}=window.secondGrowth;
      return { watch:ui.watch.on, speed:g.speed, ev:window.events.find(e=>e.event==='timelapse_watched')?.props,
        line:[...document.querySelectorAll('#toasts .toast-text')].map(t=>t.textContent).find(t=>/ on: /.test(t)) }; })()`);
    assert.equal(lapsed.watch, false, 'back to the usual view');
    assert.equal(lapsed.speed, 1, 'back to normal speed');
    assert.equal(lapsed.ev?.ended, 'done', 'timelapse_watched { ended: done }');
    assert.ok(Number.isFinite(lapsed.ev?.seconds), 'timelapse_watched carries seconds');
    assert.ok(lapsed.line, 'one line on what changed');
    console.log(`  time-lapse: ${lapsed.line}`);

    // the follow-up, then the one-time story offer: never while the player is busy, only on a pause
    // (the phone size) or after a while without input (the desktop size, the idle clock wound on)
    await b.waitFor(`window.secondGrowth.ui.storyPending`, 'story offer queued after the goal', 20000);
    const busy = await b.evaluate(`(async()=>{
      for(let k=0;k<6;k++){ window.dispatchEvent(new PointerEvent('pointerdown')); await new Promise(r=>setTimeout(r,500)); }
      return [...document.querySelectorAll('#toasts .toast-act')].some(x=>x.textContent==='Story mode');
    })()`);
    assert.equal(busy, false, 'no Story offer while the player is busy');
    if (width < 1000) await b.evaluate(`window.secondGrowth.ui.setSpeed(0)`);
    else await b.evaluate(`window.secondGrowth.ui.lastInput -= 30000`);
    await b.waitFor(`[...document.querySelectorAll('#toasts .toast-act')].some(x=>x.textContent==='Story mode')`, 'story offer', 5000);
    if (shots) {
      const shot = await b.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(`${shots}/offer-${width}x${height}.png`, Buffer.from(shot.data, 'base64'));
    }
    const offer = await b.evaluate(`(()=>{
      const g=window.secondGrowth.game, planted=g.stats.planted, day=g.day;
      [...document.querySelectorAll('#toasts .toast-act')].find(x=>x.textContent==='Story mode').click();
      return { offered:window.events.find(e=>e.event==='story_offered')?.props, taken:window.events.some(e=>e.event==='story_offer_taken'),
        panel:document.querySelector('.modal-head h2')?.textContent, stored:localStorage.getItem('sg-story-offered'),
        mode:g.mode, kept:g.stats.planted===planted && g.day>=day, restarted:window.events.some(e=>e.event==='game_restart'||e.event==='map_switch') };
    })()`);
    assert.ok(offer.offered && offer.taken, 'story_offered and story_offer_taken are tracked');
    assert.equal(offer.offered.from, width < 1000 ? 'pause' : 'idle', 'the offer came on a pause or when idle');
    assert.equal(offer.mode, 'campaign', 'Story mode starts the campaign');
    assert.match(offer.panel || '', /^Chapter 1:/, 'Story mode opens Chapter 1 at once');
    assert.ok(offer.kept && !offer.restarted, 'the same farm carries on: no new farm, no reload');
    assert.equal(offer.stored, '1', 'the story is offered once per device');
    await b.evaluate(`window.secondGrowth.ui.closeModal()`);

    // the time-lapse from the menu (no offer): any key ends it; money running low ends it and pauses
    const ends = await b.evaluate(`(async()=>{
      const {game:g,ui}=window.secondGrowth, wait=ms=>new Promise(r=>setTimeout(r,ms)), last=()=>window.events.filter(e=>e.event==='timelapse_watched').at(-1)?.props;
      ui.timelapse.start('menu'); await wait(900);
      const on=ui.timelapse.on; window.dispatchEvent(new KeyboardEvent('keydown',{key:'x'})); await wait(100);
      const key={ on, ended:last()?.ended, off:!ui.timelapse.on&&!ui.watch.on };
      const m=g.money; ui.timelapse.start('menu'); await wait(300); g.money=500;
      for(let k=0;k<40&&ui.timelapse.on;k++) await wait(100);
      const low={ ended:last()?.ended, speed:g.speed, from:last()?.from }; g.money=m; ui.setSpeed(1);
      return { key, low };
    })()`, 30000);
    assert.ok(ends.key.on && ends.key.off && ends.key.ended === 'input', `a key ends the time-lapse (${JSON.stringify(ends.key)})`);
    assert.equal(ends.low.ended, 'money', 'money running low stops it');
    assert.equal(ends.low.speed, 0, 'and pauses so the player can act');
    assert.equal(ends.low.from, 'menu');

    // the same browser again, with this farm saved: the chooser, with Continue
    await b.evaluate(`window.secondGrowth.game.save()`);
    await b.navigate('/?ph');
    await b.waitFor(booted, 'Game boot (returning)');
    const back = await b.evaluate(`(()=>({ modal:document.querySelector('.modal-head h2')?.textContent,
      resume:!!document.querySelector('[data-a=resume]'), start:window.events.some(e=>e.event==='game_start') }))()`);
    assert.equal(back.modal, 'How do you want to play?', 'a returning player gets the chooser');
    assert.equal(back.start, false, 'nothing starts before a returning player chooses');
    b.assertHealthy();
    console.log(`PASS ${width}x${height}: first visit in Free Play with a tip, first goal in ${sown.days} day(s) after one stroke, alarms held (${quiet.held}), refusal says where, followed a deer at eye level, watched the time-lapse (ends on its own, on a key, on low money), story offered on ${offer.offered.from} and taken in place, returning player gets the chooser`);
  } finally { await b.close(); }
}
