// node tools/thunder-check.mjs
// Thunder follows each lightning strike: later, softer and more muffled the farther the bolt, a far
// rumble for a flash in the clouds, through the real Music path, and never when muted or calm.
import assert from 'node:assert/strict';
import { Music } from '../js/audio/music.js';
import { thunderSounds } from '../js/audio/thunder.js';
import { THUNDER, THUNDER_RECORDINGS } from '../js/audio/sounds.js';
import { FIELD_RECORDINGS } from '../js/audio/recordings.js';

for (const id of THUNDER_RECORDINGS) assert.ok(FIELD_RECORDINGS[id], `${id}: a credited recording`);
const clipsOf = new Set(THUNDER_RECORDINGS.flatMap(id => FIELD_RECORDINGS[id].clips));
for (const n of [...THUNDER.near, ...THUNDER.far]) assert.ok(clipsOf.has(n), `${n}: registered`);

// a Music with a fake audio graph that records what each thunderclap was
const m = new Music(), played = [], nodes = [];
const node = extra => { const n = { connect(o) { return o; }, disconnect() { this.off = true; }, ...extra }; nodes.push(n); return n; };
m.ctx = {
  currentTime: 100, state: 'running',
  createGain: () => node({ gain: { value: 1 } }), createBiquadFilter: () => node({ frequency: { value: 0 } }), createStereoPanner: () => node({ pan: { value: 0 } }),
  createBufferSource() { const s = node({ playbackRate: { value: 1 } }); s.start = t => played.push({ s, t, at: t - 100, clip: s.buffer.name, nodes: nodes.slice(-4) }); s.stop = () => {}; return s; },
};
m.callGain = node(); m.started = true;
const requested = [];
m.loadField = id => { requested.push(id); return Promise.resolve(); };
for (const n of clipsOf) m.fieldClips.set(n, { name: n, duration: 9 });

const renderer = { lightning: { strikes: [], storm: true }, eyeOn: false, target: { x: 50, z: 50 }, right: () => ({ x: 1, z: 0 }), vw: 1200, ppu: 20 };
const strike = (...s) => { renderer.lightning.strikes.push(...s); played.length = 0; thunderSounds(renderer, m); return played.splice(0); };
const lowpass = p => p.nodes.find(n => n.frequency).frequency.value, level = p => p.nodes.find(n => n.gain).gain.value, pan = p => p.nodes.find(n => n.pan)?.pan.value;

// a near bolt to the right cracks soon after the flash; a far one to the left rumbles later, muffled
const [near] = strike({ x: 58, z: 50 });
assert.ok(THUNDER.near.includes(near.clip), 'a near bolt cracks');
assert.ok(near.at > 0.2 && near.at < 1.2, `near thunder follows quickly (${near.at.toFixed(2)} s)`);
assert.ok(pan(near) > 0, 'a bolt to the right sounds on the right');
near.s.onended();
const [far] = strike({ x: 0, z: 50 });
assert.ok(THUNDER.far.includes(far.clip), 'a far bolt rumbles');
assert.ok(far.at > near.at + 2, 'far thunder comes later');
assert.ok(lowpass(far) < lowpass(near) / 3 && level(far) < level(near), 'far thunder is muffled and softer');
assert.ok(pan(far) < 0, 'a bolt to the left sounds on the left');
assert.deepEqual([...new Set(requested)].sort(), [...THUNDER_RECORDINGS].sort(), 'clips are asked for on a storm day');
far.s.onended();
assert.equal(m.thundering, 0, 'finished thunder is counted off');
assert.ok(far.nodes.every(n => n.off), 'finished thunder releases its nodes');

// a flash inside the clouds rumbles in from far off
const [cloud] = strike({});
assert.ok(THUNDER.far.includes(cloud.clip) && cloud.at >= 2.5, 'a cloud flash rumbles from afar');
cloud.s.onended();

// at most two rolls at once; nothing when muted, nature sounds off, suspended, or with no storm
assert.equal(strike({ x: 52, z: 50 }, { x: 53, z: 50 }, { x: 54, z: 50 }).length, 2, 'two rolls at once at most');
m.thundering = 0;
m.muted = true; assert.equal(strike({ x: 52, z: 50 }).length, 0, 'muted'); m.muted = false;
m.natureOn = false; assert.equal(strike({ x: 52, z: 50 }).length, 0, 'nature sounds off'); m.natureOn = true;
m.ctx.state = 'suspended'; assert.equal(strike({ x: 52, z: 50 }).length, 0, 'suspended'); m.ctx.state = 'running';
renderer.lightning.storm = false; assert.equal(strike({ x: 52, z: 50 }).length, 0, 'no storm, no thunder');
assert.equal(renderer.lightning.strikes.length, 0, 'strikes are drained even when nothing plays');
renderer.lightning.storm = true;

// clips still loading: no thunder, and no stale strike replayed later
m.fieldClips.clear();
assert.equal(strike({ x: 52, z: 50 }).length, 0, 'loading');
for (const n of clipsOf) m.fieldClips.set(n, { name: n, duration: 9 });
assert.equal(strike().length, 0, 'a strike missed while loading is not replayed');

// at eye level the listener is the eye, and its right is the way it looks, turned
Object.assign(renderer, { eyeOn: true, eye: { pos: { x: 10, z: 10 }, forward: { x: 1, z: 0 } } });
const [ahead] = strike({ x: 14, z: 13 }); // (forward +x: right is +z)
assert.ok(THUNDER.near.includes(ahead.clip) && pan(ahead) > 0 && ahead.at < 0.8, 'eye level hears from the eye');
console.log('Thunder checks passed: distance delay, muffling and pan, cloud flashes, overlap cap, mute, storm and loading.');
