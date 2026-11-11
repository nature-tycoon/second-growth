// node tools/sim-worker-spike.mjs [map=sumatra] [years=3]
// Feasibility spike for decision 0041 (simulation in a Web Worker). Design evidence only: the game
// does not use any of this. On an organically grown game (release fixture 'forest', `years` of
// wildlife arriving and breeding, as play-profile), it measures:
//   1. the simulation's own cost per frame (game.update) at normal and top speed: the most a worker can hide
//   2. what drawing reads: every agent, game and world field Actors.update touches over CENSUS frames
//      (through Proxies), and any field it writes back into simulation state
//   3. a per-frame snapshot packed from those fields into transferable typed arrays: bytes and pack time
//   4. the post itself: a real worker_threads Worker echoing the snapshot back with transfer (the
//      same V8 serializer the browser's postMessage uses), round trip and receive cost
//   4b. unpacking it on the drawing side into one mirror object per animal (the main thread's cost)
//   5. the per-day world change: which world arrays change each game day and by how many tiles,
//      the diff cost and the bytes to send them, against posting whole arrays
//   6. the world change between frames inside a day (animals wearing trails, grazing, fire): what
//      would have to go every frame rather than once a day
// SPIKE_FRAMES (default 600) frames per timing, CENSUS (default 900) census frames.
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { releaseGame } from './release-fixtures.mjs';
import { WORLD_ARRAYS, EXTRA_ARRAYS } from '../js/data/world-schema.js';
const THREE = await import('three');
const { Actors } = await import('../js/render3d/actors.js');
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };

const [map = 'sumatra', years = '3'] = process.argv.slice(2);
const FRAMES = +(process.env.SPIKE_FRAMES || 600), CENSUS = +(process.env.CENSUS || 900);
const ms = v => +v.toFixed(3);
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const stats = arr => ({ mean: ms(arr.reduce((s, v) => s + v, 0) / arr.length), p50: ms(q(arr, .5)), p95: ms(q(arr, .95)), max: ms(Math.max(...arr)) });

// ---------------------------------------------------------------- grow the game
let t0 = performance.now();
const { game: g } = releaseGame(map, 'forest');
g.speed = 0;
for (let d = 0; d < +years * 120; d++) { g.dailyTick(); for (let k = 0; k < 10; k++) g.wildlife.update(.1); }
const grown = { ms: Math.round(performance.now() - t0), day: g.day, agents: g.wildlife.agents.length, flyovers: g.wildlife.flyovers.length, visitors: g.visitors.agents.length, tiles: g.world.n };
console.log('grown', grown);

// ---------------------------------------------------------------- 1. simulation cost per frame
function simCost(speed, frames) {
  g.speed = speed; const out = [];
  for (let f = 0; f < frames; f++) { const a = performance.now(); g.update(1 / 60); out.push(performance.now() - a); }
  g.speed = 0; return stats(out);
}
const sim = { normal: simCost(1, FRAMES), fast: simCost(2, FRAMES), top: simCost(3, FRAMES) };
console.log('sim ms/frame', sim);

// ---------------------------------------------------------------- 2. what drawing reads
const actors = new Actors(new THREE.Scene()), right = new THREE.Vector3(1, 0, 0);
const agentReads = new Map(), agentWrites = new Map(), gameReads = new Set(), worldReads = new Set(), wildlifeReads = new Set();
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
function watch(o, path, depth) {
  if (!o || typeof o !== 'object' || ArrayBuffer.isView(o)) return o;
  return new Proxy(o, {
    get(t, k, r) {
      const v = Reflect.get(t, k, t);
      if (typeof k === 'symbol' || typeof v === 'function') return typeof v === 'function' ? v.bind(t) : v;
      const name = path ? `${path}.${Array.isArray(t) ? '[]' : k}` : k;
      bump(agentReads, name);
      return depth > 0 ? watch(v, name, depth - 1) : v;
    },
    set(t, k, v) { bump(agentWrites, path ? `${path}.${k}` : k); t[k] = v; return true; },
  });
}
const realWl = g.wildlife, realWorld = g.world;
const wlProxy = new Proxy(realWl, { get(t, k) {
  if (k === 'agents') { wildlifeReads.add(k); return t.agents.map(a => watch(a, '', 2)); }
  if (k === 'viewAgents') { wildlifeReads.add(k); return t.viewAgents.map(a => watch(a, '', 2)); }
  const v = t[k]; if (typeof k === 'string') wildlifeReads.add(k); return typeof v === 'function' ? v.bind(t) : v;
} });
const worldProxy = new Proxy(realWorld, { get(t, k) { const v = t[k]; if (typeof k === 'string') worldReads.add(k); return typeof v === 'function' ? v.bind(t) : v; } });
const gameProxy = new Proxy(g, { get(t, k) {
  if (typeof k === 'string') gameReads.add(k);
  if (k === 'wildlife') return wlProxy; if (k === 'world') return worldProxy;
  const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
} });
g.speed = 1;
let time = 0;
for (let f = 0; f < CENSUS; f++) { g.update(1 / 60); time += 1 / 60; actors.update(gameProxy, right, time); }
g.speed = 0;
const reads = [...agentReads].sort((a, b) => b[1] - a[1]);
const topLevel = [...new Set(reads.map(([k]) => k.split('.')[0]))];
console.log('agent fields drawing reads', topLevel.length, topLevel.join(' '));
console.log('nested', reads.filter(([k]) => k.includes('.')).map(([k]) => k).join(' '));
console.log('agent fields drawing WRITES', [...agentWrites].map(([k, n]) => `${k}(${n})`).join(' ') || 'none');
console.log('game reads', [...gameReads].join(' '));
console.log('world reads', [...worldReads].join(' '));
console.log('wildlife reads', [...wildlifeReads].join(' '));

// ---------------------------------------------------------------- 3. pack a per-frame snapshot
// Numbers and booleans go in a Float32 stride; strings in a Uint8 code each (tables sent when they
// grow); objects the drawing reads into (hunt, carry...) as a small sparse list, structured-cloned.
const sample = [...g.wildlife.viewAgents];
const kinds = {};
for (const k of topLevel) {
  for (const a of sample) {
    const v = a[k]; if (v == null) continue;
    const t = typeof v === 'number' || typeof v === 'boolean' ? 'num' : typeof v === 'string' ? 'str' : 'obj';
    kinds[k] = kinds[k] && kinds[k] !== t ? 'obj' : t;
  }
  kinds[k] ||= 'num';
}
const NUM = topLevel.filter(k => kinds[k] === 'num'), STR = topLevel.filter(k => kinds[k] === 'str'), OBJ = topLevel.filter(k => kinds[k] === 'obj');
const nested = k => reads.filter(([n]) => n.startsWith(k + '.')).map(([n]) => n.slice(k.length + 1).split('.')[0]).filter(n => n !== '[]');
const codes = new Map(); const code = s => { let c = codes.get(s); if (c == null) codes.set(s, c = codes.size + 1); return c; };
function pack(agents) {
  const n = agents.length, f = new Float32Array(n * NUM.length), s = new Uint8Array(n * STR.length), extras = [];
  for (let i = 0; i < n; i++) {
    const a = agents[i];
    for (let j = 0; j < NUM.length; j++) { const v = a[NUM[j]]; f[i * NUM.length + j] = v == null ? NaN : +v; }
    for (let j = 0; j < STR.length; j++) { const v = a[STR[j]]; s[i * STR.length + j] = v == null ? 0 : code(v); }
    for (const k of OBJ) {
      const v = a[k]; if (v == null) continue;
      const keys = nested(k);
      // (only what the drawing reads from it; an id stands in for another animal)
      extras.push(i, k, keys.length && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(keys.map(n => [n, typeof v[n] === 'object' && v[n]?.id != null ? v[n].id : v[n]])) : (v?.id ?? (Array.isArray(v) ? v.length : 1)));
    }
  }
  return { f, s, extras, n };
}
console.log(`snapshot: ${NUM.length} numeric, ${STR.length} text, ${OBJ.length} object fields (${OBJ.join(' ')})`);
g.speed = 1;
const packMs = [], bytes = [], naiveMs = [];
const snaps = [];
for (let f = 0; f < FRAMES; f++) {
  g.update(1 / 60);
  const agents = g.wildlife.viewAgents;
  let a = performance.now(); const snap = pack(agents); packMs.push(performance.now() - a);
  bytes.push(snap.f.byteLength + snap.s.byteLength + JSON.stringify(snap.extras).length);
  if (f % 60 === 0) { a = performance.now(); try { structuredClone(agents.map(x => ({ ...x }))); } catch { /* functions/cycles */ } naiveMs.push(performance.now() - a); }
  if (f < 120) snaps.push(snap);
}
g.speed = 0;
const snapshot = { agents: g.wildlife.viewAgents.length, bytes: stats(bytes), packMs: stats(packMs), naiveCloneAllFieldsMs: stats(naiveMs) };
console.log('snapshot', snapshot);

// ---------------------------------------------------------------- 4. post to a worker and back
const worker = new Worker(`const { parentPort } = require('node:worker_threads');
parentPort.on('message', m => parentPort.postMessage(m, [m.f.buffer, m.s.buffer]));`, { eval: true });
await new Promise(r => worker.once('online', r));
const rtt = [], sendMs = [];
for (let k = 0; k < FRAMES; k++) {
  const src = snaps[k % snaps.length], m = { f: src.f.slice(), s: src.s.slice(), extras: src.extras, n: src.n };
  const a = performance.now();
  const back = new Promise(r => worker.once('message', r));
  worker.postMessage(m, [m.f.buffer, m.s.buffer]);
  sendMs.push(performance.now() - a);
  await back;
  rtt.push(performance.now() - a);
}
await worker.terminate();
const post = { sendMs: stats(sendMs), roundTripMs: stats(rtt) };
console.log('post', post);

// ---------------------------------------------------------------- 4b. unpack into mirrors
const mirrors = new Map(), unpackMs = [];
const NUMI = NUM.indexOf('id');
for (let k = 0; k < FRAMES; k++) {
  const { f, s, extras, n } = snaps[k % snaps.length], a = performance.now();
  for (let i = 0; i < n; i++) {
    const id = f[i * NUM.length + NUMI];
    let m = mirrors.get(id); if (!m) mirrors.set(id, m = {});
    for (let j = 0; j < NUM.length; j++) { const v = f[i * NUM.length + j]; m[NUM[j]] = v !== v ? undefined : v; }
    for (let j = 0; j < STR.length; j++) m[STR[j]] = s[i * STR.length + j];
  }
  for (let e = 0; e < extras.length; e += 3) mirrors.get(f[extras[e] * NUM.length + NUMI])[extras[e + 1]] = extras[e + 2];
  unpackMs.push(performance.now() - a);
}
const unpack = { ms: stats(unpackMs) };
console.log('unpack', unpack);

// ---------------------------------------------------------------- 5. what changes in the world each day
// (saved arrays and the ones updateEnvironment derives from them: distWater, habitat, nectar, canopy...)
const saved = new Set([...WORLD_ARRAYS, ...Object.keys(EXTRA_ARRAYS)]);
const names = Object.keys(g.world).filter(k => ArrayBuffer.isView(g.world[k]));
const worldBytes = names.reduce((s, k) => s + g.world[k].byteLength, 0);
const prev = Object.fromEntries(names.map(k => [k, g.world[k].slice()]));
const perArray = Object.fromEntries(names.map(k => [k, []]));
const dayBytes = [], diffMs = [], wholeBytes = [];
for (let d = 0; d < 60; d++) {
  g.dailyTick();
  const a = performance.now();
  let b = 0, whole = 0;
  for (const k of names) {
    const cur = g.world[k], old = prev[k];
    let c = 0;
    if (cur.length !== old.length) { c = cur.length; prev[k] = cur.slice(); }
    else for (let i = 0; i < cur.length; i++) if (cur[i] !== old[i] && !(cur[i] !== cur[i] && old[i] !== old[i])) { c++; old[i] = cur[i]; }
    perArray[k].push(c);
    // (a changed tile costs its index and value; past a quarter of the array, the whole array is cheaper)
    if (c) { b += Math.min(c * (4 + cur.BYTES_PER_ELEMENT), cur.byteLength); whole += cur.byteLength; }
  }
  diffMs.push(performance.now() - a); dayBytes.push(b); wholeBytes.push(whole);
}
const changed = Object.entries(perArray).map(([k, v]) => [k, Math.round(v.reduce((s, x) => s + x, 0) / v.length)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
const derivedBytes = names.filter(k => !saved.has(k)).reduce((s, k) => s + g.world[k].byteLength, 0);
const daily = { worldBytes, derivedBytes, tiles: g.world.n, diffMs: stats(diffMs), deltaBytes: stats(dayBytes), changedArraysWholeBytes: stats(wholeBytes), meanTilesChanged: Object.fromEntries(changed) };
console.log('daily', daily);
// ---------------------------------------------------------------- 6. inside a day, frame to frame
const within = Object.fromEntries(names.map(k => [k, 0])), frameBytes = [];
for (const k of names) prev[k] = g.world[k].slice();
g.speed = 1;
let frames = 0;
for (let f = 0; f < FRAMES; f++) {
  const day = g.day, run = g.dayRun;
  g.update(1 / 60);
  let b = 0;
  for (const k of names) {
    const cur = g.world[k], old = prev[k];
    if (cur.length !== old.length) { prev[k] = cur.slice(); continue; }
    let c = 0;
    for (let i = 0; i < cur.length; i++) if (cur[i] !== old[i] && !(cur[i] !== cur[i] && old[i] !== old[i])) { c++; old[i] = cur[i]; }
    // (only frames with no day's work in them: those are what a per-day message wouldn't cover)
    if (g.day === day && !run && !g.dayRun) { within[k] += c; b += c * (4 + cur.BYTES_PER_ELEMENT); }
  }
  if (g.day === day && !run && !g.dayRun) { frames++; frameBytes.push(b); }
}
g.speed = 0;
const inDay = { frames, perFrameBytes: stats(frameBytes), tilesPerFrame: Object.fromEntries(Object.entries(within).filter(([, v]) => v).map(([k, v]) => [k, +(v / frames).toFixed(1)])) };
console.log('inside a day', inDay);
console.log(JSON.stringify({ map, years: +years, grown, sim, census: { agentFields: topLevel, writes: Object.fromEntries(agentWrites), game: [...gameReads], world: [...worldReads] }, snapshot, post, unpack, daily, inDay }));
