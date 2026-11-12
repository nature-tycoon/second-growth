// The first two minutes for a brand-new player (docs/posthog-review-2026-11.md, player fix 1): no
// saved farm means no mode choice, straight into Free Play with a tip; one stroke of seed meets the
// first goal within a few game days; its follow-up offers the story once. A player with a saved farm
// still gets the chooser. FIRST_MINUTES_SHOTS=<dir> also saves screenshots of the sown strip.
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
        start:window.events.find(e=>e.event==='game_start')?.props, tip:toasts.some(t=>/^Try it: open Plant/.test(t)) };
    })()`);
    assert.equal(start.mode, 'free', 'a first visit plays Free Play');
    assert.equal(start.modal, false, 'no panel stands between a first visit and the farm');
    assert.equal(start.choosing, false);
    assert.ok(start.speed > 0, 'the farm is running');
    assert.equal(start.start?.first_visit, true, 'game_start marks the first visit');
    assert.ok(start.tip, 'a first visit gets a tip on what to try');

    // one stroke of meadow mix across a field, then a few game days
    const sown = await b.evaluate(`(async()=>{
      const {game:g,ui,renderer}=window.secondGrowth;
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
    // the follow-up, with the one-time story offer
    await b.waitFor(`[...document.querySelectorAll('#toasts .toast-act')].some(x=>x.textContent==='Story mode')`, 'story offer', 20000);
    if (shots) {
      const shot = await b.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(`${shots}/offer-${width}x${height}.png`, Buffer.from(shot.data, 'base64'));
    }
    const offer = await b.evaluate(`(()=>{
      document.querySelector('#toasts .toast-act').click();
      return { offered:window.events.some(e=>e.event==='story_offered'), taken:window.events.some(e=>e.event==='story_offer_taken'),
        chooser:document.querySelector('.modal-head h2')?.textContent, stored:localStorage.getItem('sg-story-offered') };
    })()`);
    assert.ok(offer.offered && offer.taken, 'story_offered and story_offer_taken are tracked');
    assert.equal(offer.chooser, 'How do you want to play?', 'Story mode opens the chooser');
    assert.equal(offer.stored, '1', 'the story is offered once per device');
    await b.evaluate(`window.secondGrowth.ui.closeModal()`);

    // the same browser again, with this farm saved: the chooser, with Continue
    await b.evaluate(`window.secondGrowth.game.save()`);
    await b.navigate('/?ph');
    await b.waitFor(booted, 'Game boot (returning)');
    const back = await b.evaluate(`(()=>({ modal:document.querySelector('.modal-head h2')?.textContent,
      resume:!!document.querySelector('[data-a=resume]'), start:window.events.some(e=>e.event==='game_start') }))()`);
    assert.equal(back.modal, 'How do you want to play?', 'a returning player gets the chooser');
    assert.equal(back.start, false, 'nothing starts before a returning player chooses');
    b.assertHealthy();
    console.log(`PASS ${width}x${height}: first visit in Free Play with a tip, first goal in ${sown.days} day(s) after one stroke, story offered once, returning player gets the chooser`);
  } finally { await b.close(); }
}
