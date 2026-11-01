// The Ecosystem Report (decision 0031) in a real browser: every tab opens on every map, at phone
// landscape and desktop sizes, with nothing wider than the dialog. Screenshots go to the temp
// folder. Run: nice -n 15 node tools/eco-report-browser-check.mjs [--shots]
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openBrowser, pause } from './browser-session.mjs';

const shots = process.argv.includes('--shots');
const browser = await openBrowser({ label: 'eco-report' });
const { send, evaluate, sessionId } = browser;
let failures = 0;
try {
  await browser.navigate('/');
  await evaluate(`localStorage.setItem('second-growth-settings', JSON.stringify({ analytics: false, music: false, nature: false, quality: 'fast', shadows: false, v: 2 }))`);
  await send('Page.reload', {}, sessionId);
  await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game did not boot');
  // (let the field-guide portraits finish warming for the first map before switching maps under them)
  await pause(8000);
  // A farm with a few years of history, so the trend lines have something to draw
  await evaluate(`window.ecoFarm = map => {
    const { game, renderer, ui } = window.secondGrowth;
    ui.closeModal?.(true); game.newGame(1987, 'free', 'standard', map); game.speed = 0; game.autosave = false;
    renderer.setWorld(game);
    for (let k = 0; k < 30; k++) { const prev = game.month; game.day += 10 - (game.day % 10); game.monthlyTick(prev); }
    return true;
  }`);
  // Open each tab and measure: the dialog fits the screen, and nothing in it is wider than it is
  await evaluate(`window.ecoTabs = () => {
    const { ui } = window.secondGrowth, out = [];
    ui.reportView = 'overview'; ui.openReport('overview');
    const tabs = [...document.querySelectorAll('.er-tabs button')].map(b => b.dataset.go);
    for (const t of tabs) {
      document.querySelector('.er-tabs [data-go="' + t + '"]').click();
      const m = document.querySelector('.er-modal'), body = m.querySelector('.modal-body'), r = m.getBoundingClientRect();
      const text = m.querySelector('.er-view').textContent;
      out.push({ tab: t, fits: r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
        overflow: body.scrollWidth > body.clientWidth + 1, nan: /NaN|undefined|Infinity/.test(text), empty: text.trim().length < 20 });
    }
    return out;
  }`);
  const sizes = [['phone', 812, 375, true], ['phone-wide', 844, 390, true], ['desktop', 1280, 800, false]];
  for (const map of ['pnw', 'serengeti', 'amazon', 'sumatra', 'atlanta', 'chinandega', 'reef']) {
    await evaluate(`window.ecoFarm(${JSON.stringify(map)})`);
    for (const [name, width, height, mobile] of sizes) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }, sessionId);
      await pause(150);
      const res = await evaluate('window.ecoTabs()');
      for (const r of res) if (!r.fits || r.overflow || r.nan || r.empty) { failures++; console.log(`FAIL ${map} ${name} ${r.tab}`, JSON.stringify(r)); }
      if (shots && (map === 'pnw' || map === 'reef')) for (const tab of ['overview', map === 'reef' ? 'coral' : 'carbon', 'foodweb', 'badges']) {
        await evaluate(`(document.querySelector('.er-tabs [data-go="${tab}"]').click(), true)`);
        await pause(80);
        const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
        const file = join(tmpdir(), `eco-report-${map}-${name}-${tab}.png`);
        await writeFile(file, Buffer.from(data, 'base64'));
      }
      console.log(`${failures ? '...' : 'PASS'} ${map} ${name}: ${res.length} tabs`);
    }
  }
  if (browser.errors.length) { failures++; console.log('Page errors:', browser.errors.slice(0, 5).join('\n\n')); }
  if (shots) console.log('Screenshots in', tmpdir());
} finally { await browser.close(); }
if (failures) { console.log(`${failures} failures`); process.exit(1); }
console.log('Ecosystem Report fits and fills every tab on every map');
