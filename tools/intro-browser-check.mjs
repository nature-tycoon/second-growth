// The first-visit intro film in the game (js/ui/intro.js, docs/ideas/2026-11-21-first-minutes/s9.md):
// a first visit plays it over the loading screen with the game paused underneath, and when it ends
// fades into the farm at the film's last camera, with one line, then the fence prompt; a second visit
// doesn't play it, and its start menu (Continue, New farm, Watch intro, Settings) replays it over the
// paused farm (Esc skips); a skip (a tap) lands in the farm; the menu's "Watch intro" replays it (Skip);
// a film that can't load is dropped without a word; on an upright phone it plays and the turn prompt
// follows; a big screen gets the 1080p, and a missing 1080p falls back to the 720p. Checks run under webdriver, where the film is off unless the address asks (?intro=1).
// The film is played at 8x speed so a run takes minutes, not hours (the check's server answers no
// byte ranges, so it can't seek).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openBrowser, pause } from './browser-session.mjs';

const film = JSON.parse(await readFile(new URL('../assets/intro/intro-film.json', import.meta.url), 'utf8'));
const cam = film.lastFrame.camera;
const settings = autosave => `localStorage.setItem('second-growth-settings',JSON.stringify({analytics:true,autosave:${autosave},music:false,nature:false,quality:'fast',qualityChosen:true,dayCycle:false,v:2}));
  window.events=[]; window.posthog={__SV:1,init(){},register(){},capture(event,props){window.events.push({event,props});}};`;
const booted = '!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))';
const ev = name => `window.events.filter(e=>e.event===${JSON.stringify(name)}).map(e=>e.props)`;
const fast = `(()=>{const v=document.querySelector('#intro video'); if (v) v.playbackRate=8; return !!v;})()`;
const fencePrompt = `[...document.querySelectorAll('#toasts .toast-act')].some(x=>/^Tear out the fence/.test(x.textContent))`;

async function open(label, { width = 960, height = 600, autosave = false, block = null } = {}) {
  const b = await openBrowser({ label, width, height });
  await b.send('Page.enable');
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*posthog.com*', ...(block ? [block] : [])] });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: settings(autosave) });
  return b;
}
const key = (b, k, code) => b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: 27 }).then(() => b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: 27 }));

// 1. A first visit: the film plays, the farm waits paused under it, then the farm at the film's camera
{
  const b = await open('intro-first', { autosave: true });
  try {
    await b.navigate('/?ph&intro=1');
    await b.waitFor(`!!document.querySelector('#intro.playing')`, 'the film starts playing', 60000);
    const started = await b.evaluate(ev('intro_started'));
    assert.equal(started.length, 1, 'intro_started once'); assert.equal(started[0].first, true);
    assert.deepEqual([started[0].size, started[0].played], [720, 720], 'a 960×600 window gets the 720p');
    assert.equal(await b.evaluate(`localStorage.getItem('second-growth-intro-seen')`), '1', 'the film is marked seen on this device');
    await b.waitFor(booted, 'the game loads under the film');
    const under = await b.evaluate(`(()=>{const {game:g}=window.secondGrowth; return {speed:g.speed, stage:g.flags.opening?.stage??null, film:!!document.querySelector('#intro.playing'), toasts:[...document.querySelectorAll('#toasts .toast-act')].length};})()`);
    assert.equal(under.film, true, 'the film is still up once the game has loaded (the game waits for it)');
    assert.equal(under.speed, 0, 'the farm is paused under the film');
    assert.equal(under.stage, null, 'the opening waits for the film');
    assert.equal(under.toasts, 0, 'no prompt under the film');
    await b.evaluate(fast);
    await b.waitFor(`!document.getElementById('intro')`, 'the film ends and fades into the farm', 90000);
    assert.equal((await b.evaluate(ev('intro_finished'))).length, 1, 'intro_finished');
    assert.equal((await b.evaluate(ev('intro_skipped'))).length, 0, 'not skipped');
    await b.waitFor(`!!document.querySelector('.intro-line')`, 'the line over the farm', 10000);
    const live = await b.evaluate(`(()=>{const r=window.secondGrowth.renderer,f=r.fly;return {x:f?f.x0:r.target.x,y:f?f.z0:r.target.z,zoom:f?f.zoom0:r.zoom,az:r.az,line:document.querySelector('.intro-line')?.textContent||''};})()`);
    for (const k of ['x', 'y', 'zoom', 'az']) assert.ok(Math.abs(live[k] - cam[k]) < 1e-3, `the farm opens at the film's last camera: ${k} ${live[k]} vs ${cam[k]}`);
    assert.match(live.line, /Bring it back/, 'one line over the farm');
    await b.waitFor(fencePrompt, 'then the fence prompt', 30000);
    assert.ok(await b.evaluate('window.secondGrowth.game.speed > 0'), 'the farm is running');
    assert.equal(await b.evaluate(`window.secondGrowth.game.flags.opening?.stage`), 'fence', 'the opening runs as usual');
    await b.evaluate('window.secondGrowth.game.save()');
    await pause(500);
    b.assertHealthy();

    // 2. A second visit (a saved farm): no film; the short start menu, whose "Watch intro" replays it
    await b.navigate('/?ph&intro=1');
    await b.waitFor(`${booted} && !!document.querySelector('.start-menu')`, 'second visit: the start menu', 120000);
    assert.equal(await b.evaluate(`!!document.getElementById('intro')`), false, 'a second visit does not play the film');
    const menu = await b.evaluate(`[...document.querySelectorAll('.start-menu button')].map(x=>x.dataset.a)`);
    assert.deepEqual(menu, ['resume', 'new', 'intro', 'settings'], 'the start menu: Continue, New farm, Watch intro, Settings');
    await b.evaluate(`document.querySelector('.start-menu [data-a=intro]').click()`);
    await b.waitFor(`!!document.querySelector('#intro.playing')`, 'Watch intro plays the film', 30000);
    assert.equal(await b.evaluate('window.secondGrowth.game.speed'), 0, 'the farm stays paused under a replay');
    await pause(400);
    await key(b, 'Escape', 'Escape');
    await b.waitFor(`!document.getElementById('intro') && !!document.querySelector('.start-menu')`, 'Esc skips back to the start menu', 15000);
    const sk = await b.evaluate(ev('intro_skipped'));
    assert.equal(sk.length, 1, 'intro_skipped'); assert.equal(sk[0].first, false); assert.ok(Number.isFinite(sk[0].second));
    assert.equal(await b.evaluate('window.secondGrowth.game.speed'), 0, 'still paused at the start menu: nothing chosen yet');
    // Settings from the start menu comes back to it (closing it must not start an unchosen farm)
    await b.evaluate(`document.querySelector('.start-menu [data-a=settings]').click()`);
    await b.evaluate(`document.querySelector('.settings-modal [data-a=done]').click()`);
    assert.ok(await b.evaluate(`!!document.querySelector('.start-menu') && window.secondGrowth.game.speed===0`), 'Settings returns to the start menu');
    await b.evaluate(`document.querySelector('.start-menu [data-a=resume]').click()`);
    await b.waitFor(`!document.querySelector('.startup-selector') && window.secondGrowth.game.speed>0 && window.secondGrowth.game.loaded`, 'Continue opens the saved farm', 30000);
    b.assertHealthy();
  } finally { await b.close(); }
}

// 3. Skip with a tap: lands in the farm (the line, then the fence prompt); then the menu's Watch intro
{
  const b = await open('intro-skip');
  try {
    await b.navigate('/?ph&intro=1');
    await b.waitFor(`!!document.querySelector('#intro.playing')`, 'the film starts playing', 60000);
    await pause(800);
    await b.evaluate(`document.getElementById('intro').click()`);
    const sk = await b.evaluate(ev('intro_skipped'));
    assert.equal(sk.length, 1, 'a tap skips'); assert.equal(sk[0].first, true); assert.ok(sk[0].second >= 0, `skipped at ${sk[0].second} s`);
    await b.waitFor(booted + ` && !document.getElementById('intro')`, 'the farm after a skip');
    await b.waitFor(fencePrompt, 'the fence prompt after a skip', 30000);
    assert.equal(await b.evaluate(`window.secondGrowth.game.flags.opening?.stage`), 'fence');
    assert.equal((await b.evaluate(ev('intro_finished'))).length, 0);
    // the menu's "Watch intro": the farm pauses under it, Skip gives it back as it was
    const speed = await b.evaluate('window.secondGrowth.game.speed');
    await b.evaluate(`window.secondGrowth.ui.openMenu(); document.querySelector('[data-a=intro]').click()`);
    await b.waitFor(`!!document.querySelector('#intro.playing')`, 'the menu replays the film', 30000);
    assert.equal(await b.evaluate('window.secondGrowth.game.speed'), 0, 'the farm pauses under the replay');
    await b.evaluate(`document.querySelector('.intro-skip').click()`);
    await b.waitFor(`!document.getElementById('intro')`, 'Skip ends the replay', 15000);
    assert.equal(await b.evaluate('window.secondGrowth.game.speed'), speed, 'the farm runs again at its speed');
    assert.equal((await b.evaluate(ev('intro_replay'))).at(-1)?.from, 'menu');
    b.assertHealthy();
  } finally { await b.close(); }
}

// 4. A film that can't load: the farm opens as it would without it, without a word
{
  const b = await open('intro-blocked', { block: '*intro-film*' });
  try {
    await b.navigate('/?ph&intro=1');
    await b.waitFor(booted, 'the game loads');
    await b.waitFor(`!document.getElementById('intro')`, 'the missing film is dropped', 15000);
    await b.waitFor(fencePrompt, 'the fence prompt as usual', 30000);
    assert.equal((await b.evaluate(ev('intro_started'))).length, 0, 'no intro_started for a film that never played');
    b.assertHealthy();
  } finally { await b.close(); }
}

// 4b. A big screen gets the 1080p (js/ui/intro.js filmSize); with the 1080p missing it plays the 720p
{
  const b = await open('intro-1080', { width: 1600, height: 900 });
  try {
    await b.navigate('/?ph&intro=1');
    await b.waitFor(`!!document.querySelector('#intro.playing')`, 'the film starts playing on a big screen', 60000);
    const src = await b.evaluate(`document.querySelector('#intro video').currentSrc`);
    assert.match(src, /intro-film-1080\.(webm|mp4)$/, `a 1600×900 window plays the 1080p (${src})`);
    const started = (await b.evaluate(ev('intro_started')))[0];
    assert.deepEqual([started.size, started.played], [1080, 1080], 'intro_started says the 1080p was chosen and played');
    // the choice itself, case by case: phones and small windows, slow or Save-Data connections get the 720p
    const sizes = await b.evaluate(`import('/js/ui/intro.js').then(({filmSize:f})=>{const c=(t,s=false)=>({effectiveType:t,saveData:s});return [
      f({width:1600,height:900,dpr:1,connection:c('4g')}), f({width:1440,height:900,dpr:2,connection:undefined}), f({width:1920,height:1080,dpr:1,connection:c(undefined)}),
      f({width:1366,height:768,dpr:1,connection:c('4g')}), f({width:960,height:600,dpr:2,connection:c('4g')}), f({width:844,height:390,dpr:3,connection:c('4g')}),
      f({width:390,height:844,dpr:3,connection:c('4g')}), f({width:1920,height:1080,dpr:2,connection:c('3g')}), f({width:1920,height:1080,dpr:2,connection:c('4g',true)})];})`);
    assert.deepEqual(sizes, [1080, 1080, 1080, 720, 1080, 720, 720, 720, 720], 'filmSize: big screens on good connections only');
    await b.evaluate(`document.querySelector('.intro-skip').click()`);
    await b.waitFor(booted + ` && !document.getElementById('intro')`, 'the farm after a skip');
    b.assertHealthy();
  } finally { await b.close(); }
}
{
  const b = await open('intro-1080-missing', { width: 1600, height: 900, block: '*intro-film-1080*' });
  try {
    await b.navigate('/?ph&intro=1');
    await b.waitFor(`!!document.querySelector('#intro.playing')`, 'with the 1080p missing, the 720p plays', 60000);
    const src = await b.evaluate(`document.querySelector('#intro video').currentSrc`);
    assert.match(src, /intro-film\.(webm|mp4)$/, `the 720p (${src})`);
    const started = (await b.evaluate(ev('intro_started')))[0];
    assert.deepEqual([started.size, started.played], [1080, 720], 'chose the 1080p, played the 720p');
    await b.waitFor(booted, 'the game loads');
    await b.evaluate(fast);
    await b.waitFor(`!document.getElementById('intro')`, 'the 720p plays to the end and fades into the farm', 90000);
    assert.equal((await b.evaluate(ev('intro_finished'))).length, 1, 'intro_finished');
    b.assertHealthy();
  } finally { await b.close(); }
}

// 5. An upright phone: the film plays upright (letterboxed), then the turn prompt over the farm
{
  const b = await open('intro-upright', { width: 390, height: 844 });
  try {
    await b.navigate('/?ph&intro=1');
    await b.waitFor(`!!document.querySelector('#intro.playing')`, 'the film plays upright', 60000);
    const fit = await b.evaluate(`(()=>{const v=document.querySelector('#intro video'),r=document.getElementById('intro').getBoundingClientRect(),h=document.getElementById('rotate-hint');return {fit:getComputedStyle(v).objectFit,w:r.width,h:r.height,over:+getComputedStyle(document.getElementById('intro')).zIndex>+getComputedStyle(h).zIndex};})()`);
    assert.equal(fit.fit, 'contain', 'upright, the whole film shows');
    assert.ok(fit.over && fit.w === 390 && fit.h === 844, 'the film covers the screen, over the turn prompt');
    await b.waitFor(booted, 'the game loads');
    await b.evaluate(fast);
    await b.waitFor(`!document.getElementById('intro')`, 'the film ends', 90000);
    assert.equal(await b.evaluate(`getComputedStyle(document.getElementById('rotate-hint')).display`), 'flex', 'then: turn your phone');
    b.assertHealthy();
  } finally { await b.close(); }
}

console.log('intro: a first visit plays the film and lands in the farm at its camera; the 1080p on big screens with the 720p as its fallback; skip, Esc, Watch intro and a missing film all land right; a second visit gets the start menu, not the film');
