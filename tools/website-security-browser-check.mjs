// Exercise the policies in Chromium against the exact public package, without analytics traffic.
import assert from 'node:assert/strict';
import { buildWebsite } from './build-website.mjs';
import { openBrowser } from './browser-session.mjs';

const root = await buildWebsite();
const b = await openBrowser({ label: 'website-security', root, width: 1100, height: 720 });
const ev = async expression => {
  try { return await b.evaluate(expression, 20000); }
  catch (error) { throw new Error(`Browser step failed: ${expression.slice(0, 160)}`, { cause: error }); }
};
try {
  await b.send('Page.enable');
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*posthog.com*'] });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.policyViolations=[];
    document.addEventListener('securitypolicyviolation', e=>window.policyViolations.push({directive:e.effectiveDirective,uri:e.blockedURI}));
    requestAnimationFrame=f=>setTimeout(()=>f(performance.now()),250);cancelAnimationFrame=clearTimeout;
    localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,muted:true,music:false,nature:false,quality:'fast',qualityChosen:true,shadows:false,wind:false,weather:false,dayCycle:false,fps:'30',v:2}));
  ` });
  console.log('Checking homepage selectors, fonts and CSP');
  await b.navigate('/');
  await b.waitFor('!!document.querySelector(".map-choice")');
  await ev('document.fonts.ready.then(()=>true)');
  await ev('document.querySelectorAll(".map-choice")[2].click()');
  await ev('document.querySelector("#map-image").loading="eager";document.querySelector("#map-image").scrollIntoView();document.querySelector("#map-image").decode()');
  assert.equal(await ev('document.querySelectorAll(".map-choice[aria-pressed=true]").length'), 1);
  assert.equal(await ev('document.querySelector("meta[name=referrer]").content'), 'strict-origin-when-cross-origin');
  assert.deepEqual(await ev('window.policyViolations'), [], 'Homepage content and selectors comply');
  b.assertHealthy();
  console.log('Checking gallery CSP');
  await b.navigate('/visuals.html');
  await b.waitFor('!!document.querySelector(".capture-gallery img")');
  await ev('document.querySelector(".capture-gallery img").loading="eager";document.querySelector(".capture-gallery img").scrollIntoView();document.querySelector(".capture-gallery img").decode()');
  assert.deepEqual(await ev('window.policyViolations'), [], 'Gallery images comply');
  b.assertHealthy();

  console.log('Checking game startup and controls under CSP');
  // The isolated test server reads files directly; unlike Pages, it does not expand directory indexes.
  await b.navigate('/play/index.html');
  await b.waitFor('document.querySelector("#loading-tip")?.textContent.length>0', 'Hashed loading script runs');
  assert.ok(await ev('document.querySelector("#loading-tip").textContent.length>0'), 'Hashed loading script runs');
  await b.waitFor('!!document.querySelector("#loading-retry:not(.hidden)")||(!!window.secondGrowth&&!document.querySelector("#loading-screen:not(.done)"))', 'Game boots with CSP');
  assert.ok(await ev('!!window.secondGrowth&&!document.querySelector("#loading-retry:not(.hidden)")'), 'No game startup failure');
  assert.equal(await ev('!!document.querySelector("script[src*=posthog]")'), false, 'Opt-out keeps SDK absent');
  await ev('document.querySelector("[data-m=free]").click()');
  await b.waitFor('window.secondGrowth.game.saveReady&&!window.secondGrowth.ui.modalOpen');
  await ev('window.secondGrowth.ui.setSpeed(0);window.secondGrowth.ui.openCategory("plants")');
  await ev('document.querySelector(".tool-card img").decode()');
  await ev('window.secondGrowth.ui.openSettings("privacy")');
  assert.ok(await ev('document.querySelector("[data-s=analytics]")&&!document.querySelector("[data-s=analytics]").checked'));
  await ev('window.secondGrowth.ui.closeModal()');
  console.log('Checking saves, image exports, audio and fullscreen');
  assert.ok(await ev('(async()=>{const {game:g}=window.secondGrowth;const money=g.money;if(!await g.save())return false;g.money+=23;return await g.load()&&g.money===money})()'), 'Device-local save and load still work');
  assert.ok(await ev(`(async()=>{const {game:g,renderer:r,ui}=window.secondGrowth;const c=r.capture(g,ui.state);const image=new Image();image.src=c.toDataURL('image/png');await image.decode();return image.naturalWidth>0})()`), 'Canvas image/export sources work');
  assert.ok(await ev(`new Promise((resolve,reject)=>{window.testAudio=new Audio('assets/music/birds.m4a');testAudio.onloadedmetadata=()=>resolve(testAudio.duration>0);testAudio.onerror=()=>reject(Error('Local audio failed'));testAudio.load()})`), 'Local audio loads');
  const fullscreen = await b.send('Runtime.evaluate', { expression: 'document.documentElement.requestFullscreen()', userGesture: true, awaitPromise: true });
  assert.ok(!fullscreen.exceptionDetails, 'Fullscreen remains available');
  await ev('document.exitFullscreen()');
  assert.deepEqual(await ev('window.policyViolations'), [], 'Normal game paths produce no policy violations');
  b.assertHealthy();

  console.log('Checking blocked injection/network attempts and permitted optional SDK');
  // These attempts are intentionally blocked before any external network request.
  await ev(`(()=>{
    const script=document.createElement('script');script.textContent='window.unapprovedInlineRan=true';document.body.append(script);
    const remote=document.createElement('script');remote.src='https://example.invalid/blocked.js';document.body.append(remote);
    const button=document.createElement('button');button.setAttribute('onclick','window.unapprovedHandlerRan=true');document.body.append(button);button.click();
    void fetch('https://example.invalid/blocked').catch(()=>{});
    const frame=document.createElement('iframe');frame.src='https://example.invalid/';document.body.append(frame);
  })()`);
  await b.waitFor('window.policyViolations.length>=5', 'Policies reject unapproved resources');
  assert.equal(await ev('!!window.unapprovedInlineRan||!!window.unapprovedHandlerRan'), false);
  const violations = await ev('window.policyViolations.map(v=>v.directive)');
  for (const directive of ['script-src-elem', 'script-src-attr', 'connect-src', 'frame-src']) assert.ok(violations.includes(directive), directive);

  // The optional SDK's origin is permitted by CSP, but network-blocked in this test.
  const count = await ev('window.policyViolations.length');
  await ev(`(async()=>{history.replaceState(null,'','?ph');const a=await import('./js/analytics.js');a.setAnalyticsEnabled(true);a.setAnalyticsEnabled(false)})()`);
  await b.waitFor('!!document.querySelector("script[src*=posthog]")');
  assert.equal(await ev('window.policyViolations.length'), count, 'Optional SDK origin is allowed');
  console.log('PASS real CSP enforcement; homepage/gallery; game boot, inline hashes, UI styles, thumbnails, local saves, canvas export, audio, fullscreen, opt-out and optional SDK origin. External analytics blocked throughout.');
} catch (error) {
  console.error(JSON.stringify({ errors: b.errors, state: await ev(`({url:location.href,status:document.querySelector('#loading-status')?.textContent,violations:window.policyViolations,ready:document.readyState,scriptCount:document.scripts.length})`).catch(() => null) }, null, 2));
  throw error;
} finally { await b.close(); }
