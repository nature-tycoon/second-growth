// The first two minutes for a brand-new player (docs/posthog-review-2026-11.md, player fix 1): no
// saved farm means no mode choice, straight into Free Play with a tip; one stroke of seed meets the
// first goal within a few game days; its follow-up offers the story once, but only once the player
// pauses or goes idle, and taking it starts Chapter 1 on the same farm without a reload. The opening
// minutes hold back what the simulation announces on its own (alarms, a stack of good news), and a
// refused building says where it fits. The opening (session 3): the view starts at the boundary fence
// with deer waiting beyond it, one click tears the fence out and they walk onto the field within
// ~10 s, one button follows one at eye level (session 4), then one click pulls the road culvert,
// then the guided planting (timelapse-2): blackberry out by one button, then real drags (touch at phone
// size, the mouse on desktop) along the glowing creek bank and meadow patch until each count is met,
// with the drag hint after 20 s stuck, and a few seconds later the time-lapse plays on its own: past the top speed on
// its own clock, no animals drawn, the camera over the planting, then a newcomer at normal speed and
// one line (from the menu it ends on any key, or when money runs low: session 4). A hawk and a party
// of crows are in that first picture (session 5). A player with a saved farm gets the short start menu (session 9). FIRST_MINUTES_SHOTS=<dir> also saves screenshots of the sown strip.
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
    await b.send('Network.setBlockedURLs', { urls: ['*posthog.com*', '*t.secondgrowth.earth*'] });
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
    // then the guided planting (timelapse-2): three short prompts, each one button with a result at once
    const act = re => `(()=>{ const b=[...document.querySelectorAll('#toasts .toast-act')].find(x=>${re}.test(x.textContent)); b.click(); return true; })()`;
    await b.waitFor(`[...document.querySelectorAll('#toasts .toast-act')].some(x=>/^Pull out the blackberry/.test(x.textContent))`, 'the blackberry prompt after the culvert', 15000);
    const inv = `(()=>{ const g=window.secondGrowth.game, w=g.world, P=g.catalog.plants; let n=0; for(let i=0;i<w.n;i++) if(w.shrub[i]&&P[w.shrub[i]].invasive) n++; return n; })()`;
    const inv0 = await b.evaluate(inv);
    await b.evaluate(act('/^Pull out the blackberry/'));
    const inv1 = await b.evaluate(inv);
    assert.ok(inv0 > 50 && inv1 === 0, `one click pulls every invasive shrub on the farm (${inv0} → ${inv1})`);
    // the trees and the meadow are the player's own strokes (Cole, 2026-11-22): the mix in hand, the
    // ground to plant glowing, a count toward done; real drags here, a finger at phone size, the mouse on desktop
    const touch = width < 1000;
    const guideNow = `(()=>{ const {ui}=window.secondGrowth, G=ui.state.guide; return G ? { step:G.step, need:G.need, got:G.got, n:G.list.length, tool:ui.state.tool,
      panel:!document.getElementById('toolpanel').classList.contains('hidden'), text:ui.opening.prompt?.querySelector('.toast-text')?.textContent||'',
      button:!!ui.opening.prompt?.querySelector('.toast-act') } : null; })()`;
    // one stroke along the visible part of the guide's line, as a finger or the mouse does it
    let lastPts = 0;
    const dragAlong = async () => {
      const pts = await b.evaluate(`(()=>{ const {ui,renderer:R}=window.secondGrowth, G=ui.state.guide; if(!G) return [];
        const cv=R.canvas, rc=cv.getBoundingClientRect();
        return G.path.map(p=>{ const q=R.project(p.x,R.heightAtScene(p.x,p.y),p.y); const x=rc.left+q.x*rc.width/R.vw, y=rc.top+q.y*rc.height/R.vh;
          const el=document.elementFromPoint(x,y); return el&&(el===cv||cv.contains(el)) && x>8 && y>8 && x<innerWidth-8 && y<innerHeight-8 ? {x,y} : null; }).filter(Boolean); })()`);
      lastPts = pts.length;
      if (pts.length < 2) return false;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      if (touch) {
        await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0].x, y: pts[0].y }] });
        await wait(180); // (a finger waits a moment before painting, in case a second one comes for the camera)
        for (const p of pts.slice(1)) { await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] }); await wait(30); }
        await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0].x, y: pts[0].y });
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0].x, y: pts[0].y, button: 'left', buttons: 1, clickCount: 1 });
        for (const p of pts.slice(1)) { await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 1 }); await wait(30); }
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts.at(-1).x, y: pts.at(-1).y, button: 'left', buttons: 0, clickCount: 1 });
      }
      await wait(300);
      return true;
    };
    const plantStep = async (step, tool) => {
      await b.waitFor(`window.secondGrowth.ui.state.guide?.step==='${step}' && !window.secondGrowth.renderer.fly`, `the ${step} step`, 15000);
      const g0 = await b.evaluate(guideNow);
      assert.equal(g0.tool, tool, `the ${step} step puts ${tool} in hand`);
      assert.ok(touch || g0.panel, 'with the Plant panel open');
      assert.ok(g0.n >= 30 && g0.need > 0 && /0 of \d+/.test(g0.text), `the ground to plant glows, with a count (${g0.n} tiles, "${g0.text.slice(-12)}")`);
      assert.equal(g0.button, false, 'no button plants it for the player');
      let strokes = 0;
      while (strokes < 12 && await b.evaluate(`window.secondGrowth.ui.state.guide?.step==='${step}'`)) { assert.ok(await dragAlong(), `the ${step} line is on screen to drag along`); strokes++; }
      assert.equal(await b.evaluate(`window.secondGrowth.ui.state.guide?.step==='${step}'`), false, `${strokes} strokes finish the ${step} step (${JSON.stringify(await b.evaluate(guideNow))}, last stroke over ${lastPts} points)`);
      return strokes;
    };
    const treeStrokes = await plantStep('trees', 'mix_pioneer');
    // stuck in the meadow step: after 20 s without a stroke, a finger shows the drag
    await b.waitFor(`window.secondGrowth.ui.state.guide?.step==='meadow'`, 'the meadow step', 15000);
    const hint = await b.evaluate(`(async()=>{ const G=window.secondGrowth.ui.state.guide; const before=G.hint; G.last-=21000; await new Promise(r=>setTimeout(r,300)); return { before, after:G.hint }; })()`);
    assert.ok(!hint.before && hint.after, 'after 20 s without a stroke, the drag hint shows');
    const d0 = await b.evaluate(`window.secondGrowth.game.day`);
    await b.evaluate(`(()=>{ const g=window.secondGrowth.game; window.sprout=null; const d0=g.day; const t=setInterval(()=>{ if(g.goalsDone.sprout){ window.sprout=g.day-d0; clearInterval(t); } },20); })()`);
    const meadowStrokes = await plantStep('meadow', 'mix_meadow');
    console.log(`  guided planting: ${treeStrokes} strokes of trees, ${meadowStrokes} of meadow (${touch ? 'touch' : 'mouse'}), from day ${d0}`);
    const steps = await b.evaluate(`window.events.filter(e=>e.event==='opening_step').map(e=>e.props.step+':'+e.props.how).join(' ')`);
    assert.equal(steps, 'pull:button trees:drag meadow:drag', 'opening_step for each step');
    const after = await b.evaluate(`(()=>{ const g=window.secondGrowth.game; let c=0; for(let i=0;i<g.world.n;i++) if(g.world.feature[i]===7) c++; return { money:g.money, culverts:c, stage:g.flags.opening?.stage, tip:[...document.querySelectorAll('#toasts .toast-text')].some(t=>/^Try it: open Plant/.test(t.textContent)) }; })()`);
    assert.equal(after.culverts, 0, 'the culvert is out');
    assert.equal(after.stage, 'done');
    assert.equal(after.tip, false, 'no planting tip: the guided steps were the planting');
    assert.ok(after.money >= 15000, `plenty left after the opening and its planting ($${Math.round(after.money)} of $${Math.round(start.money)})`);

    // the time-lapse plays on its own a few seconds later: past the top speed, panels and animals away, over the planting
    await b.waitFor(`window.secondGrowth.ui.timelapse.on`, 'the time-lapse starts on its own', 15000);
    const sown = { days: await b.evaluate(`window.sprout`) };
    assert.ok(sown.days != null && sown.days <= 2, `the first goal lands within two game days of sowing (${sown.days})`);
    const lapseDay0 = await b.evaluate(`window.secondGrowth.game.day`);
    await new Promise(r => setTimeout(r, 4000));
    const lapse = await b.evaluate(`(()=>{ const {game:g,ui,renderer:R}=window.secondGrowth;
      return { on:ui.timelapse.on, watch:ui.watch.on, cls:ui.watch.el.classList.contains('lapse'), clock:!!g.lapse, hidden:R.actors.hidden, day:g.day,
        bar:getComputedStyle(ui.watch.el.querySelector('.w-bar')).display, hint:ui.watch.el.querySelector('.w-lapse').textContent,
        x:R.target.x, z:R.target.z, site:ui.opening.site, follow:!!ui.follow, ev:window.events.find(e=>e.event==='timelapse_started')?.props,
        story:[...document.querySelectorAll('#toasts .toast-act')].some(x=>x.textContent==='Story mode') }; })()`);
    assert.ok(lapse.on && lapse.watch && lapse.cls && lapse.clock, 'the time-lapse runs in watch mode on its own clock');
    assert.ok(lapse.hidden, 'no animals drawn while it runs');
    assert.equal(lapse.follow, false, 'the camera follows no animal');
    assert.ok(lapse.day > lapseDay0, 'the days go by');
    assert.equal(lapse.bar, 'none', 'no controls: it ends on a click');
    assert.match(lapse.hint, /^Year \d+ of 10/, 'the years so far show');
    assert.ok(Math.abs(lapse.x - lapse.site.x) < 16 && Math.abs(lapse.z - lapse.site.y) < 16, `the camera is over the planting (${lapse.x.toFixed(1)}, ${lapse.z.toFixed(1)})`);
    assert.equal(lapse.ev?.from, 'auto', 'timelapse_started { from: auto }');
    assert.equal(lapse.story, false, 'no Story offer during the time-lapse');
    console.log(`  time-lapse pace: ${((lapse.day - lapseDay0) / 4).toFixed(0)} game days a second`);
    if (shots) await writeFile(`${shots}/lapse-${width}x${height}.png`, Buffer.from((await b.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await b.evaluate(`(()=>{ const t=window.secondGrowth.ui.timelapse; t.day0=window.secondGrowth.game.day-1200; })()`); // (ten years, without the wait)
    await b.waitFor(`window.secondGrowth.ui.timelapse.ending || !window.secondGrowth.ui.timelapse.on`, 'the ten years are up', 10000);
    const beat = await b.evaluate(`(()=>{ const {game:g,ui,renderer:R}=window.secondGrowth;
      return { ending:!!ui.timelapse.ending, hidden:R.actors.hidden, speed:g.speed, clock:!!g.lapse, agent:ui.watch.shot?.agent?.key || null }; })()`);
    assert.equal(beat.clock, false, 'the lapse clock stops at the end');
    assert.equal(beat.hidden, false, 'the animals are drawn again');
    if (beat.ending) { assert.equal(beat.speed, 1, 'a newcomer is shown at normal speed'); assert.ok(beat.agent, 'on one animal'); }
    await b.waitFor(`!window.secondGrowth.ui.timelapse.on`, 'the time-lapse hands back control', 12000);
    const lapsed = await b.evaluate(`(()=>{ const {game:g,ui}=window.secondGrowth;
      return { watch:ui.watch.on, speed:g.speed, ev:window.events.find(e=>e.event==='timelapse_watched')?.props,
        line:[...document.querySelectorAll('#toasts .toast-text')].map(t=>t.textContent).find(t=>/ on: /.test(t)) }; })()`);
    assert.equal(lapsed.watch, false, 'back to the usual view');
    assert.equal(lapsed.speed, 1, 'back to normal speed');
    assert.equal(lapsed.ev?.ended, 'done', 'timelapse_watched { ended: done }');
    assert.ok(Number.isFinite(lapsed.ev?.seconds) && Number.isFinite(lapsed.ev?.days_per_s), 'timelapse_watched carries seconds and days_per_s');
    assert.ok(lapsed.line, 'one line on what changed');
    console.log(`  time-lapse: ${beat.agent ? `newcomer ${beat.agent}; ` : ''}${lapsed.line}`);

    // control back: the next goal stands out a few seconds with what helps, no modal, nothing to press;
    // the simulation's routine news waits in the journal meanwhile (other-places.md)
    const spot = await b.evaluate(`(()=>{ const {game:g,ui}=window.secondGrowth, q=document.getElementById('quest'), r=q.getBoundingClientRect();
      const res={ on:ui.goalSpotOn(), cls:q.classList.contains('spot'), shown:!q.classList.contains('hidden') && r.width>0,
        inView:r.left>=-1 && r.right<=innerWidth+1 && r.top>=-1 && r.bottom<=innerHeight+1, step:q.querySelector('.q-head b')?.textContent,
        helps:q.querySelector('.q-spot .q-desc')?.textContent||'', prog:q.querySelector('.q-spot small')?.textContent||'',
        modal:!!document.querySelector('#modal-root .modal-back'), ev:window.events.find(e=>e.event==='goal_spotlight')?.props };
      g.inSim=true; g.notify('QSpot news','discover'); g.inSim=false;
      res.held=![...document.querySelectorAll('#toasts .toast-text')].some(t=>t.textContent==='QSpot news') && ui.journal.some(n=>n.text==='QSpot news');
      ui.goalSpot=performance.now()-1; ui.renderQuest(true); res.after=q.classList.contains('spot') || !!q.querySelector('.q-spot');
      ui.journal=ui.journal.filter(n=>n.text!=='QSpot news');
      return res; })()`);
    assert.ok(spot.on && spot.cls && spot.shown && spot.inView, `after the time-lapse the next goal stands out, on screen (${JSON.stringify(spot)})`);
    assert.ok(spot.helps.length > 10 && spot.prog, 'with its one line of what helps and where it stands');
    assert.equal(spot.modal, false, 'no modal after the time-lapse');
    assert.equal(spot.ev?.next && spot.ev.map, 'pnw', 'goal_spotlight { map, next } sent');
    assert.ok(spot.held, 'routine news waits in the journal while it stands out');
    assert.equal(spot.after, false, 'it folds back on its own');
    console.log(`  next goal after the lapse: ${spot.step} (${spot.helps.slice(0, 60)}…)`);
    await b.evaluate(`document.querySelectorAll('#toasts .toast').forEach(t=>t.remove())`);

    // quiet opening minutes: what the simulation says on its own stays in the journal
    const quiet = await b.evaluate(`(()=>{
      const {game:g,ui}=window.secondGrowth, shown=()=>[...document.querySelectorAll('#toasts .toast-text')].map(t=>t.textContent);
      g.inSim=true;
      g.notify('QFlood: the river spilled over','flood'); g.notify('QWarn: invasives are spreading','warn'); g.notify('QFire: wildfire','fire');
      g.notify('QFound A arrived','discover'); g.notify('QFound B arrived','discover');
      g.inSim=false;
      g.notify('QReply: not enough money','warn'); // (a reply to the player: shown)
      const t=shown(), j=ui.journal.map(n=>n.text);
      return { alarm:t.some(x=>/^Q(Flood|Warn|Fire)/.test(x)), found:t.filter(x=>/^QFound/.test(x)).length,
        reply:t.some(x=>/^QReply/.test(x)), journal:j.filter(x=>/^Q/.test(x)).length, held:ui.quiet?.held };
    })()`);
    assert.equal(quiet.alarm, false, 'no alarm notices pop up in a first visit\'s opening minutes');
    assert.ok(quiet.found <= 1, `good news comes one at a time (${quiet.found} shown)`);
    assert.ok(quiet.reply, 'replies to the player still show');
    assert.equal(quiet.journal, 6, 'every held notice is still in the journal');
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


    // the next goal is on screen once the first is done: on PNW the chain toward the cougar the intro
    // film shows, its next step named, and opened, every step with what it still needs
    const tracker = await b.evaluate(`(async()=>{ const {ui}=window.secondGrowth, q=document.getElementById('quest');
      ui.questOpen=false; ui.renderQuest(true); const r=q.getBoundingClientRect();
      const head={ shown:!q.classList.contains('hidden') && r.width>0, label:q.querySelector('.q-ch')?.textContent, step:q.querySelector('.q-head b')?.textContent,
        inView:r.left>=-1 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1 };
      q.querySelector('.q-head').click(); await new Promise(r=>setTimeout(r,50));
      const rows=[...q.querySelectorAll('.q-goal')].map(x=>x.textContent), more=!!q.querySelector('.q-more'), b2=q.getBoundingClientRect();
      const opened=window.events.some(e=>e.event==='goal_tracker_opened');
      q.querySelector('.q-head').click();
      return { ...head, rows, more, opened, openBottom:b2.bottom<=innerHeight+1 }; })()`);
    assert.ok(tracker.shown && tracker.inView, 'the goal tracker shows once the first goal is done, inside the screen');
    assert.equal(tracker.label, 'Toward the cougar', 'it is the long goal toward the cougar');
    assert.match(tracker.step, /^(Deer on the field|An owl hunts the meadow|Elk come down to the creek|The cougar returns)$/, 'it names the next step');
    assert.equal(tracker.rows.length, 4, 'opened, it lists the four steps');
    assert.ok(tracker.rows.at(-1).includes('cover'), 'each step says what helps');
    assert.ok(tracker.more && tracker.opened && tracker.openBottom, 'all goals one tap away, goal_tracker_opened sent, the list fits on screen');
    if (shots) {
      await b.evaluate(`(()=>{ const {ui}=window.secondGrowth; ui.questOpen=true; ui.renderQuest(true); })()`);
      await writeFile(`${shots}/tracker-${width}x${height}.png`, Buffer.from((await b.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      await b.evaluate(`(()=>{ const {ui}=window.secondGrowth; ui.questOpen=false; ui.renderQuest(true); })()`);
    }
    console.log(`  goal tracker: ${tracker.label} > ${tracker.step}`);

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

    // Other places to restore: in the Menu once the farm has had a year (after the lapse, ten), a card
    // per other map with its picture, name, line and Start; the list fits and scrolls; Start goes
    // through the usual map switch (stubbed here: it reloads). Then the once-per-device note at a new year.
    const places = await b.evaluate(`(async()=>{ const {game:g,ui}=window.secondGrowth, wait=ms=>new Promise(r=>setTimeout(r,ms));
      ui.openMenu(); const entry=document.querySelector('#modal-root [data-a=places]');
      const res={ entry:!!entry, shown:window.events.find(e=>e.event==='other_places_shown')?.props };
      entry?.click(); await wait(50);
      const m=document.querySelector('#modal-root .other-places'), body=m?.querySelector('.modal-body'), box=m?.getBoundingClientRect();
      const cards=[...(m?.querySelectorAll('.op-card')||[])];
      res.title=m?.querySelector('.modal-head h2')?.textContent; res.keep=m?.querySelector('.op-keep')?.textContent||'';
      res.cards=cards.map(c=>({ img:!!c.querySelector('img')?.getAttribute('src'), name:c.querySelector('b')?.textContent, line:c.querySelector('.bl')?.textContent||'', go:c.querySelector('[data-go]')?.textContent }));
      res.fits=!!box && box.top>=-1 && box.bottom<=innerHeight+1 && box.left>=-1 && box.right<=innerWidth+1;
      res.scrolls=!!body && (body.scrollHeight<=body.clientHeight+1 || getComputedStyle(body).overflowY==='auto');
      if (body) { body.scrollTop=body.scrollHeight; await wait(30); const last=cards.at(-1).querySelector('[data-go]').getBoundingClientRect(); res.lastReach=last.bottom<=innerHeight+1 && last.top>=0; }
      res.opened=window.events.find(e=>e.event==='other_places_opened')?.props;
      const sw=ui.switchMap; let asked=null; ui.switchMap=p=>{ asked=p; };
      m.querySelector('[data-go]').click(); await wait(30); ui.switchMap=sw;
      res.asked=asked; res.started=window.events.find(e=>e.event==='other_place_started')?.props; res.closed=!document.querySelector('#modal-root .modal-back');
      // the note: due at a new year's turn played through, calm (no quiet minutes, Story offer a while ago)
      ui.quiet=null; ui.storyPending=false; ui.storyOfferedAt=performance.now()-61000; ui.goalSpot=0;
      Object.defineProperty(g,'month',{value:0,configurable:true}); g.emit('month',{grant:0}); delete g.month;
      const note=[...document.querySelectorAll('#toasts .toast')].find(t=>/other places need restoring too/.test(t.textContent));
      res.note=note?.querySelector('.toast-text')?.textContent; res.noteAct=note?.querySelector('.toast-act')?.textContent; res.noteSeen=localStorage.getItem('sg-other-places-note');
      res.noteShown=window.events.some(e=>e.event==='other_places_shown'&&e.props.where==='note');
      Object.defineProperty(g,'month',{value:0,configurable:true}); g.emit('month',{grant:0}); delete g.month;
      res.notes=[...document.querySelectorAll('#toasts .toast')].filter(t=>/other places need restoring too/.test(t.textContent)).length;
      ui.storyPending=true; ui.maybeOfferStory(); res.storyNext=[...document.querySelectorAll('#toasts .toast-act')].some(x=>x.textContent==='Story mode'); ui.storyPending=false;
      return res; })()`);
    assert.ok(places.entry && places.shown?.where === 'menu', 'the Menu lists Other places to restore after the lapse; other_places_shown { where: menu }');
    assert.equal(places.title, 'Other places to restore');
    assert.match(places.keep, /stays saved/, 'it says the farm on screen stays saved');
    assert.equal(places.cards.length, 6, 'the six other maps');
    assert.ok(places.cards.every(c => c.img && c.name && c.line.length > 30 && /Start here|Continue there/.test(c.go)), 'each has a picture, its name, its line and a Start button');
    assert.ok(places.fits && places.scrolls && places.lastReach, `the list fits the screen and scrolls to the last card (${JSON.stringify({ fits: places.fits, scrolls: places.scrolls, last: places.lastReach })})`);
    assert.equal(places.opened?.from, 'menu', 'other_places_opened { from: menu }');
    assert.ok(places.asked && places.asked.map && places.asked.map !== 'pnw' && (places.asked.resume || places.asked.mode === 'free'), `Start goes through the map switch (${JSON.stringify(places.asked)})`);
    assert.equal(places.started?.map, places.asked?.map, 'other_place_started { map }');
    assert.ok(places.closed, 'the panel closes on Start');
    assert.match(places.note || '', /^Six other places need restoring too: Menu → Other places\.$/, 'the note at the new year');
    assert.ok(places.noteAct && places.noteSeen === '1' && places.noteShown, 'a See them button, once per device, other_places_shown { where: note }');
    assert.equal(places.notes, 1, 'only once');
    assert.equal(places.storyNext, false, 'the Story offer never comes next to it');
    if (shots) {
      await b.evaluate(`(()=>{ window.secondGrowth.ui.openMenu(); document.querySelector('#modal-root [data-a=places]').click(); })()`);
      await writeFile(`${shots}/other-places-${width}x${height}.png`, Buffer.from((await b.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    }
    await b.evaluate(`(()=>{ window.secondGrowth.ui.closeModal(); document.querySelectorAll('#toasts .toast').forEach(t=>t.remove()); })()`);
    console.log(`  other places: ${places.cards.map(c => c.name).join(', ')}`);

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

    // the same browser again, with this farm saved: the start menu (Continue, New farm, Watch intro, Settings; session 9)
    await b.evaluate(`window.secondGrowth.game.save()`);
    await b.navigate('/?ph');
    await b.waitFor(booted, 'Game boot (returning)');
    const back = await b.evaluate(`(()=>({ modal:document.querySelector('.modal-head h2')?.textContent,
      resume:!!document.querySelector('[data-a=resume]'), start:window.events.some(e=>e.event==='game_start') }))()`);
    assert.equal(back.modal, 'Welcome back', 'a returning player gets the start menu');
    assert.equal(await b.evaluate(`!!document.getElementById('intro')`), false, 'and no intro film');
    assert.equal(back.start, false, 'nothing starts before a returning player chooses');
    b.assertHealthy();
    console.log(`PASS ${width}x${height}: first visit in Free Play with a tip, guided planting (blackberry out, creek trees and meadow dragged), first goal in ${sown.days} day(s), alarms held (${quiet.held}), refusal says where, followed a deer at eye level, time-lapse on its own (newcomer, line; from the menu ends on a key, on low money), story offered on ${offer.offered.from} and taken in place, returning player gets the start menu`);
  } finally { await b.close(); }
}
