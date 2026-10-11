// Compare plant pixels in isolated Chrome: node tools/plant-view-browser-check.mjs [--bench]
// Requires Google Chrome; set CHROME_PATH for another Chromium installation.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'second-growth-plant-check-'));
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
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
  const { targetId } = await send('Target.createTarget', { url: origin + '/tools/plant-view-review.html?audit' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  let shown = 0, result;
  for (let i = 0; i < 1800; i++) {
    result = await evaluate('window.plantViewChecks');
    for (const name of (result?.passed || []).slice(shown)) console.log('PASS ' + name);
    shown = result?.passed?.length || 0;
    if (result?.done) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!result?.done) throw new Error('Rendering checks timed out');
  if (result.error) throw new Error(result.error);
  console.log(JSON.stringify({ comparisons: result.metrics.length, examples: result.metrics.filter(r => r.label.includes('zoom0.8/angle0.79')) }));
  if (process.argv.includes('--bench')) {
    await evaluate('void window.runPlantViewBenchmark()');
    let bench;
    for (let i = 0; i < 1800; i++) {
      bench = await evaluate('window.plantViewBenchmark');
      if (bench?.done) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!bench?.done || bench.error) throw new Error(bench?.error || 'Benchmark timed out');
    console.log(JSON.stringify(bench));
  }
  // Boot the actual game as well: exercise the integrated renderer, settings,
  // camera motion, editing, see-through trees and photo capture in a fresh profile.
  await evaluate("localStorage.setItem('second-growth-settings', JSON.stringify({analytics:false,music:false,nature:false,quality:'fast',fps:'30',v:2}))");
  await send('Page.navigate', {url:origin+'/'}, sessionId);
  for(let i=0;i<300;i++) { if(await evaluate('!!window.secondGrowth')) break; await new Promise(resolve=>setTimeout(resolve,100)); }
  if(!await evaluate('!!window.secondGrowth')) throw new Error('Actual game did not boot');
  await evaluate(`(async()=>{
    const {game,ui,renderer}=window.secondGrowth; ui.closeModal(); game.speed=0;
    const {settings}=await import('/js/settings.js'); const {editPlants}=await import('/tools/plant-performance-fixtures.mjs');
    const results=[];
    for(const quality of ['fast','high']) {
      renderer.applySettings({...settings,quality});
      for(const zoom of [.5,1,2.3]) {renderer.zoom=zoom;renderer.centerOn(40,32);renderer.draw(game,ui.state,0);renderer.panBy(80,40);renderer.draw(game,ui.state,0);results.push({quality,zoom,instances:renderer.flora.plantView.stats.visible});}
    }
    editPlants(game);renderer.editDirty=true;renderer.draw(game,ui.state,0);
    renderer.flora.setFade(true);renderer.draw(game,ui.state,0);renderer.flora.setFade(false);renderer.draw(game,ui.state,0);
    const image=renderer.capture(game,ui.state);if(!image)throw new Error('Photo capture failed');
    const gl=renderer.gl.getContext();const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error('WebGL error '+error);
    return results;
  })()`);
  console.log('PASS Actual game boots, pans, changes zoom/detail, edits plants, fades trees and captures a photo without WebGL errors');
} catch (error) {
  console.error(error); process.exitCode = 1;
} finally {
  socket?.close();
  if (chrome.exitCode === null && chrome.signalCode === null) {
    const stopped = new Promise(resolve => chrome.once('exit', resolve)); chrome.kill(); await stopped;
  }
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
