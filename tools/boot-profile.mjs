// Times each loading-screen stage and profiles the boot's main-thread work.
//   node tools/boot-profile.mjs [cpuSlowdown=4] [runs=2]
// Uses the hardware GPU (a software renderer would distort the first-frame cost) and an
// isolated profile. CPU throttling stresses the processor side only; it is not an older laptop.
import { openBrowser, pause } from './browser-session.mjs';
import { writeFile } from 'node:fs/promises';

const slowdown = Number(process.argv[2] || 4), runs = Number(process.argv[3] || 2);
const profileOut = process.env.BOOT_PROFILE_OUT;
const browser = await openBrowser({ label: 'boot-profile', ...(process.env.BOOT_ROOT ? { root: process.env.BOOT_ROOT } : {}), software: false, width: 1280, height: 800 });
try {
  await browser.send('Network.enable');
  await browser.send('Network.setCacheDisabled', { cacheDisabled: false });
  await browser.send('Page.enable');
  // Record when each loading stage label appears, and when the first frame is drawn.
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__boot = [];
    document.addEventListener('DOMContentLoaded', () => {
      window.__boot.push(['dom', performance.now()]);
      const s = document.getElementById('loading-status'), l = document.getElementById('loading-screen');
      new MutationObserver(() => window.__boot.push([s.textContent, performance.now()])).observe(s, { childList: true, characterData: true, subtree: true });
      new MutationObserver(() => { if (l.classList.contains('done')) window.__boot.push(['done', performance.now()]); }).observe(l, { attributes: true });
    });` });
  const results = [];
  for (let run = 0; run < runs; run++) {
    await browser.send('Emulation.setCPUThrottlingRate', { rate: slowdown });
    if (profileOut && run === runs - 1) { await browser.send('Profiler.enable'); await browser.send('Profiler.setSamplingInterval', { interval: 200 }); await browser.send('Profiler.start'); }
    await browser.navigate('/index.html?boot=' + run);
    await browser.waitFor(`window.__boot?.some(e => e[0] === 'done')`, 'loading screen to finish', 180000);
    if (profileOut && run === runs - 1) { const { profile } = await browser.send('Profiler.stop'); await writeFile(profileOut, JSON.stringify(profile)); }
    await browser.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const boot = await browser.evaluate(`window.__boot`);
    const res = await browser.evaluate(`performance.getEntriesByType('resource').length`);
    results.push(boot); console.log(`run ${run} (${res} resources)`);
    let prev = 0; for (const [label, t] of boot) { console.log(`  ${t.toFixed(0).padStart(6)} ms  +${(t - prev).toFixed(0).padStart(5)}  ${label}`); prev = t; }
    await pause(500);
  }
  browser.assertHealthy();
} finally { await browser.close(); }
