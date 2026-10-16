// Startup races and task boundaries without a browser or audio device.
// node tools/audio-startup-check.mjs
import assert from 'node:assert/strict';
import { Music } from '../js/audio/music.js';
import { makeRainBuffer, prepareRainBuffer } from '../js/audio/rain.js';
import { mulberry32 } from '../js/rng.js';

let task = 0, contexts = 0, downloads = 0, allowed = true;
const timers = new Set(), events = new Map();
const original = Object.fromEntries(['window', 'document', 'Audio', 'setTimeout', 'setInterval', 'fetch'].map(k => [k, globalThis[k]]));
const random = Math.random;
const parameter = () => ({ value: 0, setTargetAtTime(v) { this.value = v; }, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
const node = () => ({ gain: parameter(), threshold: parameter(), ratio: parameter(), frequency: parameter(), Q: parameter(), connect() { return this; }, disconnect() {}, start() {}, stop() {} });
class Context {
  constructor() { contexts++; this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 1000; this.destination = node(); this.wired = []; this.buffers = 0; }
  resume() { if (!allowed) return Promise.reject(new Error('autoplay blocked')); this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  createGain() { return node(); }
  createDynamicsCompressor() { return node(); }
  createMediaElementSource() { this.wired.push(task); return node(); }
  createBiquadFilter() { return node(); }
  createBufferSource() { return node(); }
  createBuffer(channels, length, sampleRate) {
    this.buffers++;
    const data = new Float32Array(length);
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: () => data };
  }
}
class Media {
  constructor() { this.paused = true; this.plays = 0; }
  addEventListener() {}
  play() { this.plays++; if (!allowed) return Promise.reject(new Error('autoplay blocked')); this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
const land = { map: 'pnw', present: [], callPresent: [], month: 0, tod: 0.3, night: 0, dawn: 0, dusk: 0, health: 0, bare: 0, canopy: 0, water: 0, wet: 0, creek: 0, river: 0, shore: 0 };
try {
  globalThis.window = { AudioContext: Context };
  globalThis.document = { hidden: false, addEventListener(name, fn) { events.set(name, fn); } };
  globalThis.Audio = Media;
  globalThis.setTimeout = (fn, ms) => original.setTimeout(() => { task++; fn(); }, ms);
  globalThis.setInterval = fn => { timers.add(fn); return fn; };
  globalThis.fetch = async () => { downloads++; throw new Error('offline'); };

  const m = new Music(); m.setLand(land);
  const preparation = m.prepare();
  assert.equal(m.prepare(), preparation, 'preparation is shared');
  assert.equal(m.ready, false);
  assert.equal(m.ctx.wired.length, 0, 'wiring is deferred');
  assert.equal(m.current, null);
  m.set({ muted: true, musicVol: 0.2 });
  const before = task;
  const started = m.start(); m.start();
  assert.equal(task, before, 'gesture only unlocks the browser');
  assert.equal(m.ctx.buffers, 0, 'gesture does not build rain');
  assert.equal(m.ctx.wired.length, 0, 'early gesture does not force synchronous wiring');
  assert.deepEqual(m.decks.map(d => d.el.plays), [1, 1], 'overlapping starts share deck unlocking');
  assert.equal(m.rut('bugle'), false, 'rut calls wait for graph readiness');
  await started;
  assert.equal(contexts, 1);
  assert.equal(new Set(m.ctx.wired).size, 2, 'decks are wired in separate tasks');
  assert.equal(timers.size, 2, 'repeated starts install one pair of timers');
  assert.equal(downloads, 0, 'preparation and muted startup do not download recordings');
  assert.equal(m.current, null, 'mute during preparation prevents a music stream');
  assert.equal(m.musicGain.gain.value, 0);
  assert.equal(m.natureGain.gain.value, 0);
  m.set({ muted: false, nature: false });
  assert.ok(m.current && !m.current.el.paused, 'music begins with the latest settings');
  m.set({ music: false });
  assert.ok(m.decks.every(d => d.el.paused));
  m.setScene('rain', 0); m.set({ nature: true });
  assert.equal(m.ctx.buffers, 0, 'rain allocation also yields before doing work');
  const loading = m.rainLoading;
  m.set({ muted: true });
  await loading;
  assert.ok(m.rainClip.duration >= 59.9);
  assert.equal(m.fieldBeds.has('rain'), false, 'mute during rain preparation prevents playback');
  m.setScene('clear', 0); m.set({ muted: false });
  assert.equal(m.fieldBeds.has('rain'), false, 'stale rain does not play in clear weather');
  m.setScene('rain', 0); await m.rainLoading;
  assert.equal(m.rainLoading, loading, 'rain generation is shared and cached');
  assert.equal(m.fieldBeds.get('rain').buffer, m.rainClip);
  document.hidden = true; events.get('visibilitychange')();
  assert.equal(m.ctx.state, 'suspended');
  document.hidden = false; events.get('visibilitychange')();
  assert.equal(m.ctx.state, 'running', 'visibility recovery resumes the device');
  m.ctx.state = 'interrupted'; m.start();
  assert.equal(m.ctx.state, 'running', 'a gesture retries an interrupted device');

  allowed = false;
  const navigation = new Music(); navigation.set({ music: false, nature: false });
  await navigation.start();
  assert.equal(navigation.ready, true, 'blocked autoplay does not block setup');
  assert.equal(navigation.ctx.state, 'suspended');
  allowed = true; navigation.set({ music: true }); navigation.start();
  await Promise.resolve();
  assert.equal(navigation.ctx.state, 'running');
  assert.equal(navigation.current.el.paused, false, 'ordinary next gesture retries blocked navigation');

  const quiet = new Music();
  await quiet.prepare();
  assert.equal(quiet.started, false);
  assert.ok(quiet.decks.every(d => d.el.plays === 0), 'preparation alone never starts media');
  window.AudioContext = class { constructor() { throw new Error('device unavailable'); } };
  const unavailable = new Music();
  await unavailable.start();
  assert.equal(unavailable.ctx, null, 'unavailable audio does not fail game startup');
  window.AudioContext = Context;
  await unavailable.start();
  assert.equal(unavailable.ready, true, 'a later gesture retries device creation');
  delete window.AudioContext;
  await new Music().start();
  window.AudioContext = Context;

  const ctx = new Context();
  Math.random = mulberry32(771);
  const sync = makeRainBuffer(ctx);
  Math.random = mulberry32(771);
  const asyncRain = await prepareRainBuffer(ctx);
  assert.deepEqual(asyncRain.getChannelData(0), sync.getChannelData(0), 'incremental rain preserves the exact seamless waveform');
  console.log('Audio startup: staged wiring, early/repeated gestures, mute races, lazy rain, navigation autoplay retry and device recovery passed.');
} finally {
  Object.assign(globalThis, original);
  Math.random = random;
}
