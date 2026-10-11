// Real IndexedDB checks with an isolated Chrome profile: node tools/browser-save-check.mjs
import { openBrowser } from './browser-session.mjs';

const browser = await openBrowser({ label: 'save' });
const { send, evaluate, origin, sessionId } = browser;
try {
  await browser.navigate('/tools/browser-save-check.html');
  let result;
  for (let i = 0; i < 300; i++) {
    result = await evaluate('window.saveChecks');
    if (result?.done) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!result?.done) throw new Error('Browser checks did not finish');
  for (const name of result.passed) console.log(`PASS ${name}`);
  if (result.error) throw new Error(result.error);
  console.log(`${result.passed.length} real-browser save checks passed. Binary payload: ${(result.sizes.binaryBytes / result.sizes.legacyBytes * 100).toFixed(1)}% of previous JSON saves.`);

  // Also boot the actual game, save it, reload, and resume through its real UI.
  await evaluate(`localStorage.setItem('second-growth-settings', JSON.stringify({ analytics: false, music: false, nature: false, quality: 'fast', v: 2 }))`);
  await send('Page.navigate', { url: origin + '/' }, sessionId);
  for (let i = 0; i < 150; i++) {
    if (await evaluate('!!window.secondGrowth')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!await evaluate('!!window.secondGrowth')) throw new Error('Game boot failed: ' + await evaluate('document.body.innerText.slice(0, 1200)'));
  await evaluate(`(async () => {
    const { game, ui } = window.secondGrowth;
    ui.closeModal(); await ui.startMode('free', false); game.speed = 0; game.day = 42;
    if (!await game.save()) throw new Error('UI game save failed');
    if (document.getElementById('save-status').textContent !== 'Saved') throw new Error('Missing saved indicator');
  })()`);
  await send('Page.reload', {}, sessionId);
  for (let i = 0; i < 150; i++) {
    if (await evaluate('!!window.secondGrowth && !!document.querySelector("[data-a=continue]")')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await evaluate('document.querySelector("[data-a=continue]").click()');
  for (let i = 0; i < 100; i++) {
    if (await evaluate('window.secondGrowth.game.loaded')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const resumed = await evaluate('({ day: window.secondGrowth.game.day, loaded: window.secondGrowth.game.loaded, status: document.getElementById("save-status").textContent })');
  if (!resumed.loaded || resumed.day !== 42 || resumed.status !== 'Saved') throw new Error(`Resume UI failed: ${JSON.stringify(resumed)}`);
  console.log('PASS Actual game boots, shows Saved, survives reload and resumes through Continue');
  await evaluate(`(async () => {
    const { game, ui } = window.secondGrowth; game.speed = 0; game.autosave = false;
    for (const day of [50, 60, 70]) { game.day = day; await game.save(); }
    await ui.openSaveRecovery(); const buttons = document.querySelectorAll('[data-backup]');
    if (buttons.length !== 2) throw new Error('Missing backup recovery buttons');
    buttons[1].click(); buttons[1].click();
  })()`);
  for (let i = 0; i < 100; i++) {
    if (await evaluate('window.secondGrowth.game.day === 50 && window.secondGrowth.game.saveStatus.state === "saved"')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!await evaluate('window.secondGrowth.game.day === 50')) throw new Error('Backup recovery UI failed');
  console.log('PASS Earlier-save UI restores the selected backup');
  await evaluate(`(async () => {
    const { game, ui } = window.secondGrowth; const { saves } = await import('/js/saves.js');
    window.originalTransaction = saves.db.transaction;
    saves.db.transaction = function(...args) {
      const tx = window.originalTransaction.apply(this, args);
      if (args[1] === 'readwrite') queueMicrotask(() => tx.abort()); return tx;
    };
    ui.openMenu(); document.querySelector('[data-a=save]').click();
  })()`);
  for (let i = 0; i < 100; i++) {
    if (await evaluate('window.secondGrowth.game.saveStatus.state === "error"')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!await evaluate('document.getElementById("save-status").textContent === "Save failed" && !document.querySelector("[data-a=save]").disabled')) throw new Error('Save failure UI did not permit retry');
  await evaluate(`(async () => {
    const { saves } = await import('/js/saves.js'); saves.db.transaction = window.originalTransaction;
    document.querySelector('[data-a=save]').click();
  })()`);
  for (let i = 0; i < 100; i++) {
    if (await evaluate('window.secondGrowth.game.saveStatus.state === "saved" && !document.querySelector("[data-a=save]")')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!await evaluate('window.secondGrowth.game.saveStatus.state === "saved"')) throw new Error('Retry failed');
  console.log('PASS Failed manual saves show an error and retry successfully');
  await evaluate(`window.secondGrowth.game.day = 77; void window.secondGrowth.ui.switchMap({ map: 'amazon', mode: 'free', difficulty: 'standard' })`);
  for (let i = 0; i < 150; i++) {
    if (await evaluate('window.secondGrowth?.game.map === "amazon" && window.secondGrowth.game.saveReady')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!await evaluate('window.secondGrowth?.game.map === "amazon"')) throw new Error('Map switch failed');
  await evaluate(`void window.secondGrowth.ui.switchMap({ map: 'pnw', resume: true })`);
  for (let i = 0; i < 150; i++) {
    if (await evaluate('window.secondGrowth?.game.map === "pnw" && window.secondGrowth.game.loaded')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!await evaluate('window.secondGrowth.game.day === 77 && window.secondGrowth.game.loaded')) throw new Error('Switching maps lost progress');
  console.log('PASS Switching maps waits for the current save and returns to the correct farm');
  await evaluate(`(async () => {
    const { game } = window.secondGrowth; game.speed = 0; game.autosave = true; game.day = 88;
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // Wait for the database commit, rather than a fixed delay on a busy renderer.
    await new Promise((resolve, reject) => {
      const deadline = performance.now() + 15000;
      const poll = () => {
        if (game.saveStatus.state === 'error') return reject(new Error('Hidden-tab save failed'));
        if (game.saveStatus.state === 'saved' && game.saveStatus.day === 88) return resolve();
        if (performance.now() > deadline) return reject(new Error('Hidden-tab save timed out'));
        setTimeout(poll, 50);
      }; poll();
    });
    delete document.hidden;
    game.day = 89; window.dispatchEvent(new Event('pagehide'));
  })()`);
  await browser.waitFor('window.secondGrowth.game.saveStatus.state === \"saved\" && window.secondGrowth.game.saveStatus.day === 89', 'Pagehide save did not commit', 15000);
  await evaluate(`(async () => {
    const { saves } = await import('/js/saves.js');
    const records = await saves.candidates('pnw');
    if (records[0]?.data.day !== 89) throw new Error('Leaving the page did not persist its save');
  })()`);
  console.log('PASS Leaving a paused game saves its current progress');
  await evaluate(`window.secondGrowth.game.day = 90`);
  for (let i = 0; i < 350; i++) {
    if (await evaluate('window.secondGrowth.game.saveStatus.day === 90')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!await evaluate('window.secondGrowth.game.saveStatus.day === 90 && window.secondGrowth.game.speed === 0')) throw new Error('Wall-clock autosave failed on a paused game');
  console.log('PASS Wall-clock autosaves protect paused games between game months');
} finally {
  await browser.close();
}
