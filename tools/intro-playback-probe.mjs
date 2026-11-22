// How smoothly the first-visit intro film plays while the game loads underneath
// (docs/ideas/2026-11-21-first-minutes/film-playback.md). A first visit in headless Chrome on this
// computer's graphics chip, through tools/serve.py (byte ranges, like GitHub Pages), under each
// condition: the film's waiting/stalled events and what the loader was doing at each, frames dropped
// (getVideoPlaybackQuality) and hitches between presented frames (requestVideoFrameCallback), and
// long tasks on the main thread, by loading step.
//
//   nice -n 15 node tools/intro-playback-probe.mjs [conditions] [--size=1440x900] [--dpr=1] [--json]
//   conditions: comma list of fast, cpu4, 4g, 4g-cpu4, 3g (default: all)
//
// A probe, not a check: numbers vary run to run (other work on the Mac), so compare runs side by side.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { openBrowser, pause, projectRoot } from './browser-session.mjs';

const args = process.argv.slice(2);
const flag = (name, def) => (args.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || def;
const [width, height] = flag('size', '1440x900').split('x').map(Number);
const pixelRatio = Number(flag('dpr', '1'));
// Network presets: Chrome DevTools' "Fast 4G" and "Slow 3G" (kbit/s down, up, round trip ms).
const NET = { '4g': [9000, 1500, 60], '3g': [400, 400, 400] };
const CONDITIONS = {
  fast: {}, cpu4: { cpu: 4 }, '4g': { net: '4g' }, '4g-cpu4': { net: '4g', cpu: 4 }, '3g': { net: '3g' },
};
const wanted = (args.find(a => !a.startsWith('--')) || Object.keys(CONDITIONS).join(',')).split(',');

const freePort = () => new Promise(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

// In the page from its first line: the loading steps as they change, long tasks, and the film's events.
const INSTRUMENT = `(() => {
  const P = window.__ip = { stages: [], lt: [], ev: [], gaps: [], frames: 0, quality: null, last: null };
  const now = () => Math.round(performance.now());
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  const stageNow = () => P.stages.length ? P.stages[P.stages.length - 1][1] : 'page';
  let hooked = null;
  const hook = v => {
    hooked = v;
    const buf = () => { const b = v.buffered; return b.length ? Math.round(b.end(b.length - 1) * 10) / 10 : 0; };
    const q = () => { const x = v.getVideoPlaybackQuality?.(); if (x && x.totalVideoFrames >= (P.quality?.total || 0)) P.quality = { total: x.totalVideoFrames, dropped: x.droppedVideoFrames }; };
    for (const type of ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'play', 'playing', 'waiting', 'stalled', 'pause', 'ended', 'error', 'emptied']) {
      v.addEventListener(type, () => { q(); if (type === 'play' || type === 'playing') P.last = null; P.ev.push({ type, at: now(), t: Math.round(v.currentTime * 100) / 100, rs: v.readyState, buf: buf(), stage: stageNow(), src: (v.currentSrc || '').split('/').pop() }); });
    }
    const tick = (n, meta) => {
      P.frames++; q();
      if (P.last && !v.paused) { const gap = n - P.last.n, media = meta.mediaTime - P.last.media; if (gap > 100) P.gaps.push({ at: Math.round(n), ms: Math.round(gap), media: Math.round(media * 1000), stage: stageNow() }); }
      P.last = { n, media: meta.mediaTime };
      if (hooked === v) v.requestVideoFrameCallback(tick);
    };
    v.requestVideoFrameCallback?.(tick);
  };
  new MutationObserver(() => {
    const v = document.querySelector('#intro video'); if (v && v !== hooked) hook(v);
    const s = document.getElementById('loading-status')?.textContent;
    if (s && s !== stageNow()) P.stages.push([now(), s]);
    if (s === 'Ready' && !P.ready) P.ready = now();
    if (hooked && !document.getElementById('intro') && !P.gone) P.gone = now();
  }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
})();`;
const SETTINGS = `localStorage.setItem('second-growth-settings',JSON.stringify({analytics:true,autosave:false,music:false,nature:false,qualityChosen:false,dayCycle:false,v:2}));
  window.events=[]; window.posthog={__SV:1,init(){},register(){},capture(event,props){window.events.push({event,props});}};`;

async function run(name, cond, base) {
  const b = await openBrowser({ label: `intro-playback-${name}`, width, height, pixelRatio, software: false });
  try {
    await b.send('Page.enable'); await b.send('Network.enable');
    await b.send('Network.setBlockedURLs', { urls: ['*posthog.com*'] });
    await b.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (cond.net) { const [down, up, rtt] = NET[cond.net]; await b.send('Network.emulateNetworkConditions', { offline: false, latency: rtt, downloadThroughput: down * 125, uploadThroughput: up * 125 }); }
    if (cond.cpu) await b.send('Emulation.setCPUThrottlingRate', { rate: cond.cpu });
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: SETTINGS + INSTRUMENT });
    const t0 = Date.now();
    // the network as Chrome sees it: the film's requests (bytes over time) and what else is loading meanwhile
    const reqs = new Map(), net = { film: [], other: [] };
    b.on(({ method, params: p }) => {
      const at = Date.now() - t0;
      if (method === 'Network.requestWillBeSent') reqs.set(p.requestId, { url: p.request.url.split('/').pop().split('?')[0], film: /intro-film/.test(p.request.url), range: p.request.headers.Range || '', sent: at, bytes: 0 });
      const r = reqs.get(p?.requestId); if (!r) return;
      if (method === 'Network.responseReceived') { r.status = p.response.status; r.first = at; }
      if (method === 'Network.dataReceived') { r.bytes += p.encodedDataLength || p.dataLength; r.last = at; }
      if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') { r.done = at; r.failed = method === 'Network.loadingFailed' ? p.errorText : undefined; }
    });
    await b.send('Page.navigate', { url: `${base}/?intro=1` });
    // until the film has gone (finished, skipped or dropped) and the game is ready, or 4 minutes
    while (Date.now() - t0 < 240000) {
      await pause(1000);
      const s = await b.evaluate('window.__ip ? { gone: window.__ip.gone, ready: window.__ip.ready, intro: !!document.getElementById("intro") } : null').catch(() => null);
      if (s?.ready && !s.intro) break;
    }
    await pause(500);
    const all = [...reqs.values()], film = all.filter(r => r.film);
    const filmFrom = film[0]?.sent ?? Infinity;
    net.film = film.map(r => ({ url: r.url, range: r.range, sent: r.sent, first: r.first, done: r.done, kb: Math.round(r.bytes / 1024), status: r.status, failed: r.failed }));
    net.inflightAtFilm = all.filter(r => !r.film && r.sent <= filmFrom && (r.done ?? Infinity) > filmFrom).length;
    net.otherKBwhileFilm = Math.round(all.filter(r => !r.film && (r.done ?? Infinity) > filmFrom).reduce((s, r) => s + r.bytes, 0) / 1024);
    const page = await b.evaluate(`(() => { const P = window.__ip; const ev = n => (window.events || []).filter(e => e.event === n).map(e => e.props);
      const res = performance.getEntriesByType('resource'); const kb = f => Math.round(res.filter(f).reduce((s, r) => s + (r.transferSize || 0), 0) / 1024);
      return { ...P, started: ev('intro_started'), finished: ev('intro_finished').length, skipped: ev('intro_skipped').length, loaded: ev('game_loaded')[0]?.load_ms,
        gameKB: kb(r => !/intro-film/.test(r.name)), quality: P.quality };
    })()`);
    return { ...page, net };
  } finally { await b.close(); }
}

// Long tasks by loading step (the step showing when each began).
function byStage(r) {
  const out = {};
  for (const [at, ms] of r.lt) {
    let s = 'page'; for (const [t, name] of r.stages) if (t <= at) s = name;
    (out[s] ||= { n: 0, ms: 0, max: 0 }); out[s].n++; out[s].ms += ms; out[s].max = Math.max(out[s].max, ms);
  }
  return out;
}

function summary(name, r) {
  const first = r.ev.find(e => e.type === 'playing');
  const playStart = first?.at;
  const during = r.lt.filter(([at]) => playStart && at >= playStart && (!r.gone || at <= r.gone));
  const waits = r.ev.filter(e => e.type === 'waiting' && playStart && e.at > playStart);
  const stalls = r.ev.filter(e => e.type === 'stalled');
  const ended = r.ev.find(e => e.type === 'ended');
  const q = r.quality || { total: 0, dropped: 0 };
  return {
    condition: name, film: first?.src || '(never played)', startS: playStart ? +(playStart / 1000).toFixed(1) : null,
    readyS: r.ready ? +(r.ready / 1000).toFixed(1) : null,
    how: !first ? 'not played' : ended ? 'finished' : 'dropped mid-film',
    waiting: waits.length, waitAt: waits.map(w => `${w.t}s film (${w.stage})`).join('; '), stalled: stalls.length,
    frames: q.total, dropped: q.dropped, droppedPct: q.total ? +(100 * q.dropped / q.total).toFixed(1) : null,
    hitches: r.gaps.length, worstHitchMs: r.gaps.reduce((m, g) => Math.max(m, g.ms), 0),
    hitchSteps: [...new Set(r.gaps.map(g => g.stage))].join('; '),
    longTasksDuringFilm: during.length, longestMs: during.reduce((m, [, ms]) => Math.max(m, ms), 0),
    endedS: ended ? +(ended.at / 1000).toFixed(1) : null, gameKB: r.gameKB,
  };
}

const port = await freePort();
const server = spawn('python3', ['tools/serve.py', String(port)], { cwd: projectRoot, stdio: 'ignore' });
await pause(800);
const base = `http://127.0.0.1:${port}`;
const rows = [];
try {
  for (const name of wanted) {
    if (!CONDITIONS[name]) { console.error(`unknown condition ${name}`); continue; }
    const r = await run(name, CONDITIONS[name], base);
    const row = summary(name, r); rows.push(row);
    if (args.includes('--json')) console.log(JSON.stringify({ row, net: r.net, stages: r.stages, longTasks: byStage(r), gaps: r.gaps, events: r.ev }, null, 1));
    else { console.log(JSON.stringify(row)); console.log('  network:', JSON.stringify(r.net)); console.log('  long tasks by step:', JSON.stringify(byStage(r))); console.log('  hitches:', JSON.stringify(r.gaps.slice(0, 12))); }
  }
} finally { server.kill(); }
