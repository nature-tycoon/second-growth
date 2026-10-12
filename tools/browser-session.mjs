// Shared isolated browser for release checks. Never uses a player's browser profile.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.m4a': 'audio/mp4' };
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function openBrowser({ label = 'release', root = projectRoot, software = true, width = 960, height = 600, pixelRatio = 1 } = {}) {
  if (typeof WebSocket !== 'function') throw new Error('Browser checks require Node 22 or newer.');
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      const rel = relative(root, path);
      if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Invalid path');
      const data = await readFile(path);
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let profile, chrome, socket, closing, sequence = 0;
  const pending = new Map(), errors = [];
  const signals = { SIGINT: () => { void close().finally(() => process.exit(130)); }, SIGTERM: () => { void close().finally(() => process.exit(143)); } };
  function close() { return closing ||= cleanup(); }
  async function cleanup() {
    for (const [signal, listener] of Object.entries(signals)) process.removeListener(signal, listener);
    for (const request of pending.values()) clearTimeout(request.timeout);
    pending.clear(); socket?.close();
    if (chrome?.pid && chrome.exitCode === null && chrome.signalCode === null) {
      const stopped = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill('SIGTERM');
      const timeout = setTimeout(() => chrome.kill('SIGKILL'), 3000);
      await stopped; clearTimeout(timeout);
    }
    await new Promise(resolve => server.close(resolve));
    if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  for (const [signal, listener] of Object.entries(signals)) process.once(signal, listener);
  try {
    profile = await mkdtemp(join(tmpdir(), `second-growth-${label}-`));
    const executable = process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
    chrome = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--force-device-scale-factor=1', ...(software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    const debug = await new Promise((resolve, reject) => {
      let log = '';
      const timeout = setTimeout(() => reject(new Error('Chrome did not start within 15 seconds. Set CHROME_PATH to a Chromium executable.')), 15000);
      const fail = error => { clearTimeout(timeout); reject(error); };
      chrome.once('error', fail); chrome.once('exit', code => fail(new Error(`Chrome exited ${code}: ${log.slice(-500)}`)));
      chrome.stderr.on('data', data => { log += data; const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    });
    socket = new WebSocket(debug);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data), request = pending.get(message.id);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(a => a.value || a.description || '').join(' '));
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
      if (!request) return;
      pending.delete(message.id); clearTimeout(request.timeout);
      if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
    };
    const request = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence, timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 120000);
      pending.set(id, { resolve, reject, timeout }); socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const { targetId } = await request('Target.createTarget', { url: origin + '/assets/logo.svg' });
    const { sessionId } = await request('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params = {}, session = sessionId) => request(method, params, session);
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.bringToFront');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: pixelRatio, mobile: false });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expression, message = expression, timeoutMs = 120000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(100); }
      throw new Error(`Timed out: ${message}`);
    };
    return { origin, sessionId, send, evaluate, waitFor, errors, close,
      async navigate(path) { errors.length = 0; await send('Page.navigate', { url: origin + path }); },
      assertHealthy() { if (errors.length) throw new Error('Browser errors:\n' + errors.join('\n')); },
    };
  } catch (error) { await close(); throw error; }
}
