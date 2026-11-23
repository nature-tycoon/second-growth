// Screenshots of the game as a phone on its side sees it: headless Chrome emulating an iPhone
// (touch screen, so `pointer: coarse`; 3x pixels; iPhone Safari's user agent; the real GPU), going
// through the HUD and each panel. For checking layouts, not frame rates (the Mac's GPU is no phone's).
//   node tools/phone-review.mjs [sizes=844x390,667x375,750x340]
// 844x390 is an iPhone 14/15/16 on its side, 667x375 an iPhone SE, 750x340 a 6.1" iPhone with
// Safari's address bar showing; a taller-than-wide size (390x844) is the phone upright: the turn
// prompt, then the cramped fallback after "Play upright anyway". Each run starts as a first visit
// with the intro film (0-intro, tapped away: 0-after-intro), shows Other places to restore (6b, 6c) and ends on a returning player's start
// menu (8-start-menu). Writes tools/release-output/phone/<size>-<step>.png.
// For Safari itself (its bars, safe areas), open http://localhost:8347/ in the iOS Simulator
// (Xcode) and turn it sideways: see docs/phone-review-2026-11-14.md.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, pause, projectRoot } from './browser-session.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const sizes = (process.argv[2] || '844x390,667x375,750x340').split(',').map(s => s.split('x').map(Number));
const out = join(projectRoot, 'tools/release-output/phone');
await mkdir(out, { recursive: true });

for (const [width, height] of sizes) {
  const b = await openBrowser({ label: 'phone-review', software: false, width, height, pixelRatio: 3 });
  try {
    const upright = height > width;
    await b.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 3, mobile: true, screenOrientation: upright ? { type: 'portraitPrimary', angle: 0 } : { type: 'landscapePrimary', angle: 90 } });
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await b.send('Emulation.setUserAgentOverride', { userAgent: UA, platform: 'iPhone' });
    await b.evaluate(`localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,v:2}))`);
    const shot = async name => {
      await pause(900);
      const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(out, `${width}x${height}-${name}.png`), Buffer.from(data, 'base64'));
    };
    const booted = '!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))';
    await b.navigate('/?intro=1'); // (the intro film is off under automation unless asked: js/ui/intro.js)
    await b.waitFor('!!document.querySelector("#intro.playing")', 'The intro film did not play', 120000);
    await pause(4000); await shot('0-intro');
    await b.waitFor(booted, 'Game did not boot', 180000);
    await b.evaluate('document.getElementById("intro")?.click()'); // (a tap skips it)
    await b.waitFor('!document.getElementById("intro") && !!document.querySelector(".intro-line")', 'The film did not give way to the farm', 15000);
    await pause(300); await shot('0-after-intro');
    if (!await b.evaluate('matchMedia("(pointer: coarse)").matches')) throw new Error('Touch emulation did not take');
    const click = sel => b.evaluate(`document.querySelector(${JSON.stringify(sel)})?.click()`);
    const tap = async (x, y) => { for (const type of ['touchStart', 'touchEnd']) await b.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] }); };
    await pause(2500); await shot('1-hud');
    if (upright) { await click('#rotate-skip'); await shot('1-hud-upright'); }
    await click('#toolbar [data-cat=plants]'); await shot('2-plant');
    await click('#toolbar [data-cat=wildlife]'); await shot('3-wildlife');
    await click('#toolbar [data-cat=inspect]'); await pause(300); await tap(width * 0.4, height * 0.5); await shot('4-inspect');
    for (const [btn, name] of [['#btn-goals', '5-goals'], ['#btn-menu', '6-menu'], ['#btn-settings', '7-settings']]) {
      await click(btn); await shot(name); await b.evaluate('window.secondGrowth.ui.closeModal()');
    }
    // Other places to restore (the Menu lists it after the farm's first year; opened directly here), top and scrolled to the end
    await b.evaluate(`import('/js/ui/other-places.js').then(m => m.openOtherPlaces(window.secondGrowth.ui, 'review'))`); await shot('6b-other-places');
    await b.evaluate(`(() => { const body = document.querySelector('.other-places .modal-body'); if (body) body.scrollTop = body.scrollHeight; })()`); await shot('6c-other-places-end');
    await b.evaluate('window.secondGrowth.ui.closeModal()');
    // a returning player: the short start menu
    await b.evaluate('window.secondGrowth.game.save()');
    await b.navigate('/');
    await b.waitFor(`${booted} && !!document.querySelector('.start-menu')`, 'No start menu on a second visit', 180000);
    await shot('8-start-menu');
    b.assertHealthy();
    console.log(`${width}x${height}: ${out}/${width}x${height}-*.png`);
  } finally { await b.close(); }
}
