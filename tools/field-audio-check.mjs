// node tools/field-audio-check.mjs
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { FIELD_RECORDINGS, MAP_RECORDINGS, RECORDED_BEDS } from '../js/audio/recordings.js';
import { SOUNDSCAPES } from '../js/audio/nature.js';
import { SOUND_CREDITS, soundFile } from '../js/audio/sounds.js';
import { Music } from '../js/audio/music.js';
import { makeRainBuffer } from '../js/audio/rain.js';

const sources = JSON.parse(readFileSync(new URL('../assets/sounds/field-sources.json', import.meta.url)));
const audit = JSON.parse(readFileSync(new URL('./audio-voice-audit.json', import.meta.url)));
let total = 0, clips = 0;
for (const [id, def] of Object.entries(FIELD_RECORDINGS)) {
  assert.ok(def.by && def.source.startsWith('https://'), `${id}: creator and source`);
  assert.ok(/^(Public domain|CC0|CC BY(?:-SA)? [\d.]+)$/.test(def.license), `${id}: reusable license`);
  assert.ok(SOUND_CREDITS.some(c => c.source === def.source), `${id}: in-game credit`);
  const source = sources[id];
  assert.match(source.sha256, /^[a-f0-9]{64}$/);
  assert.ok(source.modified.includes('source license'));
  for (const name of def.clips) {
    const file = new URL(soundFile(name));
    assert.equal(readFileSync(file).subarray(4, 8).toString(), 'ftyp', `${name}: AAC container`);
    const bytes = statSync(file).size;
    assert.ok(bytes < (id.startsWith('bed-') ? 280_000 : 150_000), `${name}: compact`);
    assert.equal(bytes, source.clips.find(c => c.name === name).bytes);
    total += bytes; clips++;
  }
}
assert.ok(total < 6_000_000, `sound pack budget: ${total}`);
for (const [map, P] of Object.entries(SOUNDSCAPES)) {
  assert.ok(Object.values(MAP_RECORDINGS[map]).some(kind => Object.keys(kind).length), `${map}: real wildlife recordings`);
  for (const [kind, entries] of Object.entries(MAP_RECORDINGS[map])) for (const [key, id] of Object.entries(entries)) {
    assert.ok(FIELD_RECORDINGS[id]);
    assert.equal(audit[map][kind][key].recording, id, `${map}/${key}: audited`);
  }
  for (const key of Object.keys(P.birds)) assert.ok(audit[map].birds[key]);
  for (const [, voice] of P.calls) assert.ok(audit[map].calls[voice]);
}
for (const id of Object.values(RECORDED_BEDS)) assert.ok(FIELD_RECORDINGS[id], `${id}: recorded ambience`);
assert.ok(!RECORDED_BEDS.rain && !FIELD_RECORDINGS['bed-rain'], 'short patterned rain recording is retired');

// Synthetic rain must not have the old excerpt's short repeating signature or swells.
const rainContext = { sampleRate: 32000, createBuffer(channels, length, rate) {
  const data = new Float32Array(length);
  return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: () => data };
} };
const rain = makeRainBuffer(rainContext), data = rain.getChannelData(0), levels = [];
assert.ok(rain.duration >= 59.9, 'rain has a minute-long buffer');
for (let second = 0; second < 60; second++) {
  let sum = 0; for (let i = second * rain.sampleRate; i < (second + 1) * rain.sampleRate; i++) sum += data[i] ** 2;
  levels.push(Math.sqrt(sum / rain.sampleRate));
}
assert.ok(Math.max(...levels) / Math.min(...levels) < 1.08, 'steady rain level without modulation');
for (const seconds of [1, 2, 4, 5, 8]) {
  const lag = seconds * rain.sampleRate; let product = 0, energy = 0;
  for (let i = lag; i < data.length; i += 17) { product += data[i] * data[i - lag]; energy += data[i] ** 2; }
  assert.ok(Math.abs(product / energy) < 0.03, `rain does not repeat every ${seconds} seconds`);
}

// Verify the real playback path, not an oscillator substitute, and source cleanup.
const m = new Music(), nodes = [];
const node = () => { const n = { connect() { return this; }, disconnect() { this.disconnected = true; }, gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } }; nodes.push(n); return n; };
let started;
m.ctx = { currentTime: 10, state: 'running', createGain: node, createBufferSource() { const n = node(); n.start = (...args) => { started = { source: n, args }; }; return n; } };
m.callGain = node(); m.voice = () => { const n = node(); n._voice = { count: 0, nodes: [n] }; return n; };
m.land = { map: 'serengeti', present: ['lion'], callPresent: ['lion'], night: 1, dusk: 0, wet: 0, water: 0, dawn: 0, canopy: 0, tod: 0.9, month: 0 };
const lion = FIELD_RECORDINGS[MAP_RECORDINGS.serengeti.calls.lion];
for (const clip of lion.clips) m.fieldClips.set(clip, { duration: 9 });
assert.equal(m.lion(), 9);
assert.deepEqual(started.args, [10, 0, 9]);
assert.equal(started.source.playbackRate, undefined, 'recorded voice keeps its natural pitch');
assert.equal(m.activeSources.size, 1);
started.source.onended(); assert.equal(m.activeSources.size, 0);
assert.ok(nodes.slice(1).every(n => n.disconnected), 'all per-call audio nodes released');
m.muted = true; assert.equal(m.lion(), 0);
m.muted = false; m.natureOn = false; assert.equal(m.lion(), 0);
m.natureOn = true; m.ctx.state = 'suspended'; assert.equal(m.lion(), 0);
m.ctx.state = 'running'; m.land.map = 'pnw'; assert.equal(m.lion(), 0, 'wrong map cannot borrow a lion');

// Missing clips do not consume a prominent-call slot, and failed loads back off.
const originalFetch = globalThis.fetch;
try {
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('offline'); };
  m.land.map = 'serengeti'; m.fieldClips.clear();
  assert.equal(m.lion(), 0);
  await Promise.all([...m.fieldLoads.values()]);
  assert.equal(requests, lion.clips.length);
  await m.loadField(MAP_RECORDINGS.serengeti.calls.lion);
  assert.equal(requests, lion.clips.length, 'failed requests wait 30 audio seconds');
  m.ctx.currentTime += 31;
  await m.loadField(MAP_RECORDINGS.serengeti.calls.lion);
  assert.equal(requests, lion.clips.length * 2);
  m.callDue.set('lion', 0); m.calls(0.25);
  assert.equal(m.foregroundUntil, 0, 'loading does not reserve a silent foreground slot');
  assert.equal(m.callDue.get('lion'), 0, 'first roar stays due until ready');
} finally { globalThis.fetch = originalFetch; }
console.log(`${Object.keys(FIELD_RECORDINGS).length} recording sources, ${clips} clips, ${(total / 1e6).toFixed(2)} MB: licenses, all maps, playback, cleanup, mute and retry checks passed.`);
