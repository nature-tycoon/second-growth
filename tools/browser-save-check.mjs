// Real IndexedDB checks with an isolated Chrome profile: node tools/browser-save-check.mjs
// Requires Google Chrome; set CHROME_PATH for another Chromium installation.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'second-growth-save-check-'));
const chromePath = process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root)) throw new Error('Invalid path');
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const debug = await new Promise((resolve, reject) => {
    let log = ''; const timeout = setTimeout(() => reject(new Error('Chrome did not start')), 15000);
    chrome.on('error', reject); chrome.on('exit', code => reject(new Error(`Chrome exited ${code}`)));
    chrome.stderr.on('data', data => { log += data; const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
  });
  socket = new WebSocket(debug);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let next = 0; const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data), request = pending.get(message.id);
    if (!request) return; pending.delete(message.id); clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++next, timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 60000);
    pending.set(id, { resolve, reject, timeout }); socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: origin + '/tools/browser-save-check.html' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
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
    await new Promise(resolve => setTimeout(resolve, 300)); delete document.hidden;
    if (game.saveStatus.day !== 88) throw new Error('Hidden-tab save failed');
    game.day = 89; window.dispatchEvent(new Event('pagehide'));
    await new Promise(resolve => setTimeout(resolve, 300));
    if (game.saveStatus.day !== 89) throw new Error('Pagehide save failed');
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
  socket?.close(); chrome.kill('SIGTERM'); server.close();
  await new Promise(resolve => { if (chrome.exitCode != null) resolve(); else { chrome.once('exit', resolve); setTimeout(resolve, 3000); } });
  await rm(profile, { recursive: true, force: true });
}
