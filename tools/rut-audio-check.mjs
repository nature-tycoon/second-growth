// Checks the rut sounds: the recorded clips are present, small and credited, and the seeded elk
// rut drives them (bugles heard, clashes on the drawn impact).
// Run: node tools/rut-audio-check.mjs    Listen: http://localhost:8347/tools/rut-audio-review.html
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { RUT_SOUNDS, SOUND_CREDITS, RACK_PITCH, soundFile } from '../js/audio/sounds.js';
import { mapCatalog } from '../js/biome.js';
import { Game } from '../js/game.js';
import { T, DAYS_PER_YEAR, DAYS_PER_MONTH } from '../js/config.js';
import { ANIMAL, ANIMALS, isMaleVariant } from '../js/data/animals.js';
import { bugles } from '../js/sim/animal-life.js';
import { boutCycle, CRASH } from '../js/render3d/bout-clock.js';
import { rutSounds } from '../js/audio/rut-events.js';
import { mulberry32 } from '../js/rng.js';
import { Music } from '../js/audio/music.js';
import { FIELD_RECORDINGS } from '../js/audio/recordings.js';

const root = new URL('../', import.meta.url);
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }

check('Every rut sound is a small AAC file in assets/sounds, and every file there is used', () => {
  const names = new Set(Object.values(RUT_SOUNDS).flat());
  for (const name of names) {
    const file = new URL(soundFile(name), root), head = readFileSync(file).subarray(4, 8).toString('latin1');
    assert.equal(head, 'ftyp', `${name} is an MPEG-4 audio file`);
    assert.ok(statSync(file).size < 120_000, `${name} stays small`);
  }
  const used = new Set([...names, ...Object.values(FIELD_RECORDINGS).flatMap(d => d.clips)]);
  for (const f of readdirSync(new URL('assets/sounds/', root)).filter(f => f.endsWith('.m4a'))) assert.ok(used.has(f.replace(/\.m4a$/, '')), `${f} is listed in the sound catalogs`);
});
check('The recordings are credited with their licence and source', () => {
  assert.ok(SOUND_CREDITS.length >= 2 && SOUND_CREDITS.every(c => c.by && c.license && /^https:/.test(c.source)));
  const readme = readFileSync(new URL('README.md', root), 'utf8') + readFileSync(new URL('assets/sounds/LICENSES.md', root), 'utf8');
  for (const c of SOUND_CREDITS) assert.ok(readme.includes(c.source), `README credits ${c.what}`);
});
check('Every antlered species has a rack pitch', () => {
  for (const d of ANIMALS) if (d.sprite.male?.antlers) assert.ok(RACK_PITCH[d.sprite.male.antlers], d.sprite.male.antlers);
});

// ---------------------------------------------------------------- the rut, heard
function setup(seed = 44) {
  Math.random = mulberry32(seed);
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw'); g.day = 7 * DAYS_PER_MONTH + 5; // (October: the rut)
  const wl = g.wildlife, w = g.world;
  wl.agents = []; wl.flyovers = []; wl.passageWait = 1e6; wl.recount();
  w.terrain.fill(T.SOIL); w.struct.fill(-1); w.tree.fill(0); w.shrub.fill(0); w.feature.fill(0); w.fire.fill(0); w.distWater.fill(99);
  wl.suit.forEach(s => s.fill(1));
  return g;
}
function spawn(g, male, x, y) {
  const def = ANIMAL.elk;
  for (let k = 0; k < 100; k++) {
    const a = g.wildlife.spawn(def, Math.floor(x), Math.floor(y), { silent: true, age: 4 * DAYS_PER_YEAR });
    Object.assign(a, { x, y, wait: 0, thirst: 0 });
    if (isMaleVariant(def, a) === male) return a;
    g.wildlife.remove(a);
  }
  throw new Error('no elk of that sex');
}
check('In the rut, elk bugles and bouts reach the soundscape: bugles, answers, clashes on the drawn impact', () => {
  const g = setup(), heard = [];
  spawn(g, true, 40.5, 30.5); spawn(g, true, 47.5, 31.5); spawn(g, true, 34.5, 36.5);
  for (const [x, y] of [[41, 33], [43, 29], [38, 31], [44, 34], [39, 28]]) spawn(g, false, x + 0.5, y + 0.5);
  g.wildlife.recount?.();
  const music = { ctx: {}, warmRut() {}, rut: (kind, o) => heard.push({ kind, ...o, t: time }) };
  const renderer = { target: { x: 41, z: 31 }, right: () => ({ x: 1, z: 0 }), vw: 960, ppu: 30 };
  bugles.length = 0;
  let time = 0, bouts = 0;
  for (let i = 0; i < 20 * 120; i++) { // two game minutes, one frame per 50 ms of game time
    g.wildlife.update(0.05); time += 1 / 60;
    rutSounds(g, renderer, music, time);
    if (g.wildlife.agents.some(a => a.state === 'spar' && !a.sparLight)) bouts++;
  }
  const kinds = k => heard.filter(h => h.kind === k);
  assert.ok(kinds('bugle').length + kinds('answer').length > 0, `bugles heard: ${heard.map(h => h.kind).join(',')}`);
  assert.ok(bouts > 0, 'the bulls fought');
  assert.ok(kinds('clash').length > 0, 'antler clashes heard');
  for (const c of heard) assert.ok(c.far >= 0 && c.far <= 1 && Math.abs(c.pan) <= 0.85, 'placed within hearing');
  assert.ok(bugles.length === 0, 'bugle queue drained');
  console.log(`     ${kinds('bugle').length} bugles, ${kinds('answer').length} answers, ${kinds('clash').length} clashes, ${kinds('rattle').length} rattles over ${(time).toFixed(0)} s`);
});
check('Clashes land in the drawn impact jolt, one per crash cycle', () => {
  let lo = 0;
  const heard = [], music = { ctx: {}, warmRut() {}, rut: (kind) => heard.push({ kind, c: boutCycle(lo, time) }) };
  const a = { id: 10, sp: ANIMAL.elk.index, state: 'spar', sparWith: 11, sparAt: [10, 10], x: 10, y: 10, sparLight: false };
  const o = { id: 11, sp: ANIMAL.elk.index, state: 'spar', sparWith: 10, sparAt: [11, 10], x: 11, y: 10, sparLight: false };
  const def = ANIMAL.elk; let male = 0;
  while (!isMaleVariant(def, { ...a, id: male, age: 9e9 }) || !isMaleVariant(def, { ...o, id: male + 1, age: 9e9 })) male++;
  a.id = lo = male; o.id = male + 1; a.sparWith = o.id; o.sparWith = a.id; a.age = o.age = 9e9;
  const game = { catalog: mapCatalog('pnw'), wildlife: { agents: [a, o], ids: new Map([[a.id, a], [o.id, o]]) } };
  const renderer = { target: { x: 10, z: 10 }, right: () => ({ x: 1, z: 0 }), vw: 960, ppu: 30 };
  let time = 0;
  for (let i = 0; i < 60 * 26; i++) { time += 1 / 60; rutSounds(game, renderer, music, time); }
  const clashes = heard.filter(h => h.kind === 'clash');
  assert.ok(clashes.length >= 9 && clashes.length <= 10, `${clashes.length} clashes in 26 s of 2.6 s cycles`);
  for (const h of clashes) assert.ok(h.c >= CRASH[0] && h.c < CRASH[1], `clash at cycle ${h.c.toFixed(3)}`);
});
check('Off-screen bulls call throughout the rut using audio time, with no overlapping recordings', () => {
  const g = setup(55), a = spawn(g, true, 110, 80), b = spawn(g, true, 100, 70);
  const heard = [], music = new Music();
  const node = () => ({ gain: { value: 0 }, playbackRate: { value: 1 }, connect() { return this; } });
  music.ctx = { state: 'running', currentTime: 0, createGain: node, createBufferSource() {
    const src = node(); src.start = () => heard.push({ t: music.ctx.currentTime, duration: src.buffer.duration / src.playbackRate.value }); return src;
  } };
  music.callGain = node();
  music.warmRut = () => {};
  music.voice = (pan, far) => { assert.ok(far <= 0.65 && far > 0, 'distant bulls remain audible'); assert.ok(Math.abs(pan) <= 0.85); return node(); };
  music.trackSource = () => {};
  for (const name of RUT_SOUNDS.bugle) music.rutClips.set(name, { duration: 4 });
  const renderer = { target: { x: 0, z: 0 }, right: () => ({ x: 1, z: 0 }), vw: 960, ppu: 30 };
  bugles.length = 0;
  for (let frame = 0; frame < 120 * 20; frame++) {
    music.ctx.currentTime = frame / 20;
    rutSounds(g, renderer, music, frame * 100); // wildly faster simulation/renderer clock
  }
  assert.ok(heard.length >= 8 && heard.length <= 15, `${heard.length} spaced calls in two real minutes`);
  for (let i = 1; i < heard.length; i++) assert.ok(heard[i].t > heard[i - 1].t + heard[i - 1].duration, 'calls do not overlap');
  assert.ok(music.rutBulls.has(a.id) && music.rutBulls.has(b.id), 'rival bulls take turns');
  const n = heard.length;
  g.day = 0; // March, outside the rut
  for (let k = 0; k < 30; k++) { music.ctx.currentTime++; rutSounds(g, renderer, music, k); }
  assert.equal(heard.length, n, 'no ambient bugles outside the rut');
  g.day = 7 * DAYS_PER_MONTH;
  music.muted = true;
  for (let k = 0; k < 30; k++) { music.ctx.currentTime++; rutSounds(g, renderer, music, k); }
  assert.equal(heard.length, n, 'mute silences rut calls');
  music.muted = false; music.natureOn = false;
  for (let k = 0; k < 30; k++) { music.ctx.currentTime++; rutSounds(g, renderer, music, k); }
  assert.equal(heard.length, n, 'nature toggle silences rut calls');
  music.natureOn = true;
  a.leaving = b.leaving = true;
  for (let k = 0; k < 30; k++) { music.ctx.currentTime++; rutSounds(g, renderer, music, k); }
  assert.equal(heard.length, n, 'no phantom bugles after bulls leave');
});
check('A lone bull calls without a harem, but females and calves do not', () => {
  const g = setup(66), a = spawn(g, true, 110, 80), heard = [];
  const music = { ctx: { currentTime: 0, state: 'running' }, warmRut() {}, rut: (kind, opts) => { heard.push({kind, ...opts}); return true; } };
  const renderer = { target: { x: -100, z: -100 }, right: () => ({x:1,z:0}), vw:960, ppu:30 };
  bugles.length = 0;
  for (let k = 0; k < 40; k++) { music.ctx.currentTime = k; rutSounds(g, renderer, music, k); }
  assert.ok(heard.length >= 3, 'lone bull fills quiet stretches across the map');
  a.age = 0;
  spawn(g, false, 90, 70);
  const n = heard.length;
  for (let k = 40; k < 80; k++) { music.ctx.currentTime = k; rutSounds(g, renderer, music, k); }
  assert.equal(heard.length, n, 'calves and cows do not bugle');
});
console.log(`${checks} rut audio checks passed`);
