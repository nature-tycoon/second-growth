// Actual phone UI checks in an isolated Chrome profile: node tools/animal-locate-browser-check.mjs
// Requires Google Chrome; set CHROME_PATH for another Chromium installation.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'second-growth-locate-check-'));
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
  const { targetId } = await send('Target.createTarget', { url: origin + '/'  });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Emulation.setDeviceMetricsOverride', { width: 667, height: 375, deviceScaleFactor: 1, mobile: true }, sessionId);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] }, sessionId);
  // Configure graphics before boot so a slow software renderer can test the real UI.
  await evaluate(`localStorage.setItem('second-growth-settings', JSON.stringify({ analytics: false, music: false, nature: false, quality: 'fast', shadows: false, v: 2 }))`);
  await send('Page.reload', {}, sessionId);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(expression, message) {
    for (let k = 0; k < 150; k++) { if (await evaluate(expression)) return; await pause(100); }
    throw new Error(message);
  }
  await waitFor('!!window.secondGrowth', 'Game did not boot');
  await evaluate(`window.checkLocate = async (map, key, flight = false) => {
    const { game, renderer: r, ui } = window.secondGrowth;
    const { ANIMAL } = await import('/js/data/animals.js');
    const { PLANTS } = await import('/js/data/plants.js');
    const { T } = await import('/js/config.js');
    ui.closeModal(); ui.closeInfo(); game.newGame(1987, 'free', 'standard', map); game.speed = 0;
    game.wildlife.agents = []; game.visitors.agents = []; game.residents = [];
    const a = game.wildlife.spawn(ANIMAL[key], 30, 30, { silent: true, age: 1000 });
    const i = game.world.idx(Math.floor(a.x), Math.floor(a.y));
    if (ANIMAL[key].move === 'tree') { const p = PLANTS.find(p => p?.layer === 2); game.world.tree[i] = p.id; game.world.treeG[i] = 1; }
    if (map === 'reef' || ANIMAL[key].move === 'swim') game.world.terrain[i] = T.CREEK;
    a.flying = flight; a.alt = flight ? 1 : 0; a.wait = 100;
    r.setWorld(game); r.centerOn(100, 80); ui.infoMin = false;
    ui.openGuide('animals', key);
    const button = document.querySelector('#g-find'); if (!button) throw new Error('Guide Locate missing');
    button.click(); window.located = a;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  };
  window.locateResult = () => {
    const { game, renderer: r, ui } = window.secondGrowth, a = window.located;
    const st = r.actors.pose.get(a.id), p = st?.center && r.project(st.center.x, st.center.y, st.center.z);
    const panel = document.getElementById('infopanel'), b = panel.getBoundingClientRect();
    return { name: (game.map + '/' + a.key), pose: !!st?.visible,
      centered: !!p && Math.abs(p.x - r.vw * r.frame.x) < 1 && Math.abs(p.y - r.vh * r.frame.y) < 1,
      clear: !!p && !(p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom),
      ring: !!st?.center && Math.hypot(r.actors.ring.position.x - st.center.x, r.actors.ring.position.z - st.center.z) < 0.001,
      follow: ui.follow === a && r.followAgent === a, collapsed: panel.classList.contains('min'),
      touch: matchMedia('(pointer: coarse)').matches, width: r.vw, height: r.vh };
  }`);
  for (const [width, height] of [[667, 375], [844, 390]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true }, sessionId);
    for (const [map, key, flight] of [['sumatra', 'orangutan', false], ['sumatra', 'hornbill', true], ['amazon', 'sloth', false], ['serengeti', 'giraffe', false], ['reef', 'shark', false]]) {
      await evaluate(`window.checkLocate(${JSON.stringify(map)}, ${JSON.stringify(key)}, ${flight})`);
      const result = await evaluate('window.locateResult()');
      if (!result.pose || !result.centered || !result.clear || !result.ring || !result.follow || !result.touch) throw new Error('Locate failed: ' + JSON.stringify(result));
      console.log(`PASS Guide Locate: ${map}/${key} at ${width}×${height}, body centred and unobscured`);
      if (key === 'orangutan') {
        const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
        const screenshotPath = join(tmpdir(), `second-growth-locate-${width}.png`);
        await writeFile(screenshotPath, Buffer.from(shot.data, 'base64')); console.log('Screenshot: ' + screenshotPath);
        if (width === 667) {
          await evaluate(`window.secondGrowth.ui.infoMin = true; window.secondGrowth.ui.renderInfo()`);
          await evaluate(`document.querySelector('#infopanel .minimize').click()`);
          if (await evaluate('document.getElementById("infopanel").classList.contains("min")')) throw new Error('Inspector cannot expand');
          await evaluate(`document.querySelector('#infopanel .minimize').click()`);
          if (!await evaluate('document.getElementById("infopanel").classList.contains("min")')) throw new Error('Inspector cannot collapse');
          console.log('PASS Compact inspector can be expanded and collapsed immediately');
        }
      }
      await evaluate(`window.located.x += 0.1; window.located.y += 0.1`);
      await waitFor('window.locateResult().centered', 'Follow lost moving animal');
      const afterMove = await evaluate('window.locateResult()'); if (!afterMove.ring) throw new Error('Ring lost moving animal');
    }
  }
  // A real touch drag must release Follow so the player's camera input wins.
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 250, y: 220 }] }, sessionId);
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 280, y: 245 }] }, sessionId);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
  await waitFor('!window.secondGrowth.ui.follow && !window.secondGrowth.renderer.followAgent', 'Touch drag failed to release Follow');
  console.log('PASS Touch camera movement releases Follow');
} finally {
  socket?.close(); chrome.kill('SIGTERM'); server.close();
  await new Promise(resolve => { if (chrome.exitCode != null) resolve(); else { chrome.once('exit', resolve); setTimeout(resolve, 3000); } });
  await rm(profile, { recursive: true, force: true });
}
