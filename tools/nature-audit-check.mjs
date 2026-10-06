// node tools/nature-audit-check.mjs
import assert from 'node:assert/strict';
import { BIOMES, biome } from '../js/biome.js';
import { Game } from '../js/game.js';
import { ANIMALS } from '../js/data/animals.js';
import { T, H } from '../js/config.js';
import { SOUNDSCAPES, BIRD_PHRASES, natureMix, natureCallRates } from '../js/audio/nature.js';
import { sampleSoundLand } from '../js/audio/land.js';
import { Music } from '../js/audio/music.js';

let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const land = (map, extra = {}) => ({ map, month: 0, tod: 0.35, present: [], species: 12, bare: 0.3, health: 0.8, canopy: 0.7, water: 0.8, creek: 0.6, river: 0.4, shore: 0, wet: 0.5, night: 0, dawn: 0, dusk: 0, dry: false, ...extra });
const voices = (L, weather = 'clear', season = 0) => natureCallRates(L, weather, season).map(c => c.voice);
const g = new Game();
check('All seven maps have valid native voices across 448 season/weather/time combinations', () => {
  assert.deepEqual(Object.keys(SOUNDSCAPES).sort(), Object.keys(BIOMES).sort());
  for (const map of Object.keys(BIOMES)) {
    g.newGame(1987, 'free', 'standard', map);
    const keys = ANIMALS.map(d => d.key), P = SOUNDSCAPES[map];
    for (const [key, style] of Object.entries(P.birds)) { assert(keys.includes(key), `${map}/${key}`); assert(BIRD_PHRASES[style]); }
    for (const [key, voice] of P.calls) { assert(keys.includes(key), `${map}/${key}`); assert.equal(typeof Music.prototype[voice], 'function', voice); }
    for (let season = 0; season < 4; season++) for (const weather of ['clear', 'cloud', 'rain', 'snow']) for (const time of [{}, { dawn: 1, tod: 0 }, { dusk: 1, tod: 0.845 }, { night: 1, tod: 0.91 }]) {
      const L = land(map, { present: keys, month: season * 3, ...time }), mix = natureMix(L, weather, season);
      for (const [name, value] of Object.entries(mix)) assert(Number.isFinite(value) && value >= 0 && value < 3, `${map}/${season}/${weather}/${name}: ${value}`);
      for (const { voice, rate } of natureCallRates(L, weather, season)) assert(Number.isFinite(rate) && rate > 0 && typeof Music.prototype[voice] === 'function');
    }
    const sampled = sampleSoundLand(g, { target: { x: 60, z: 45 } }, biome, ANIMALS);
    for (const [key, value] of Object.entries(sampled)) if (typeof value === 'number') assert(Number.isFinite(value), `${map}/${key}`);
  }
});
check('Reef has surf and underwater texture, with no freshwater, frogs or terrestrial insects', () => {
  const L = land('reef', { night: 1, present: ['booby', 'noddy'] }), mix = natureMix(L, 'clear', 3);
  assert.equal(mix.creek, 0); assert.equal(mix.river, 0); assert.equal(mix.bugs, 0); assert.equal(mix.leaves, 0);
  assert(mix.surf > 0 && mix.reef > 0);
  assert.deepEqual(voices(L), ['reefSnap']);
  assert.deepEqual(Object.keys(SOUNDSCAPES.reef.birds).sort(), ['booby', 'noddy']);
});
check('Tropical rainy/fruit seasons keep daytime birds and Sumatra insects', () => {
  for (const map of ['amazon', 'serengeti', 'chinandega', 'sumatra']) assert(natureMix(land(map), 'clear', 3).birds > 0.3, map);
  assert(natureMix(land('sumatra'), 'clear', 3).bugs > 0);
  assert(natureMix(land('pnw'), 'clear', 3).birds < natureMix(land('pnw'), 'clear', 0).birds);
});
check('Frogs require the right species, habitat, calendar and time of day', () => {
  assert(!voices(land('chinandega', { night: 1 })).some(v => /frog/i.test(v)));
  assert(!voices(land('serengeti', { night: 1 })).some(v => /frog/i.test(v)));
  assert(!voices(land('pnw', { night: 1 })).includes('frog'));
  assert(voices(land('pnw', { night: 1, present: ['treefrog'] })).includes('frog'));
  assert(!voices(land('pnw', { night: 1, wet: 0, present: ['treefrog'] })).includes('frog'));
  assert(!voices(land('pnw', { night: 1, month: 6, present: ['treefrog'] }), 'clear', 2).includes('frog'));
  assert(voices(land('atlanta', { night: 1, present: ['peeper'] })).includes('peeper'));
  assert(!voices(land('atlanta', { night: 1, month: 4, present: ['peeper'] }), 'clear', 1).includes('peeper'));
  assert(voices(land('amazon', { present: ['dartfrog'], wet: 0 })).includes('dartfrog'));
  assert(!voices(land('amazon', { present: ['dartfrog'], night: 1 })).includes('dartfrog'));
});
check('Each owl and primate keeps its map and activity', () => {
  assert(voices(land('pnw', { night: 1, present: ['owl'] })).includes('owl'));
  assert(voices(land('atlanta', { night: 1, present: ['owl'] })).includes('barredOwl'));
  assert(!voices(land('atlanta', { night: 1, present: ['owl'] })).includes('owl'));
  assert(voices(land('sumatra', { night: 1, present: ['barnowl'] })).includes('barnOwl'));
  assert(voices(land('sumatra', { dawn: 1, present: ['siamang'] })).includes('siamang'));
  assert(!voices(land('sumatra', { night: 1, tod: 0.91, present: ['siamang'] })).includes('siamang'));
  assert(voices(land('chinandega', { dawn: 1, present: ['congo'] })).includes('howler'));
});
check('Ponds and distant water do not invent a creek; snow does not hiss like rain', () => {
  const L = land('pnw', { water: 1, creek: 0, river: 0 });
  assert.equal(natureMix(L, 'clear', 0).creek, 0); assert.equal(natureMix(L, 'clear', 0).river, 0);
  assert.equal(natureMix(L, 'snow', 3).rain, 0); assert.equal(natureMix(L, 'snow', 3).bugs, 0);
  assert.equal(natureMix(L, 'snow', 3).birds, 0); assert.deepEqual(voices(L, 'snow', 3), []);
  assert(natureMix(L, 'rain', 0).rain > 0);
});
check('Dawn chorus, quiet nights, richer cover and dry-season stream attenuation', () => {
  assert(natureMix(land('pnw', { dawn: 1 }), 'clear', 0).birds > natureMix(land('pnw'), 'clear', 0).birds);
  assert.equal(natureMix(land('pnw', { night: 1 }), 'clear', 0).birds, 0);
  assert(natureMix(land('sumatra', { health: 1 }), 'clear', 0).bugs > natureMix(land('sumatra', { health: 0 }), 'clear', 0).bugs);
  assert.equal(natureMix(land('sumatra', { canopy: 0 }), 'clear', 0).leaves, 0);
  assert(natureMix(land('chinandega', { dry: true }), 'clear', 0).creek < natureMix(land('chinandega'), 'clear', 1).creek);
});
check('Calm wind stays in the background and trees shelter the listener', () => {
  for (const map of Object.keys(SOUNDSCAPES)) {
    const exposed = natureMix(land(map, { bare: 1, canopy: 0, shore: 1 }), 'clear', 0);
    const sheltered = natureMix(land(map, { bare: 0, canopy: 1, shore: 0 }), 'clear', 0);
    const rainy = natureMix(land(map, { bare: 1, canopy: 0, shore: 1 }), 'rain', 0);
    assert(exposed.wind <= 0.015, `${map}: calm wind is too loud`);
    assert(sheltered.wind < exposed.wind, `${map}: shelter should soften wind`);
    assert(rainy.wind > exposed.wind, `${map}: weather should affect wind`);
    assert(sheltered.leaves <= 0.003, `${map}: calm canopy rustle should be soft`);
  }
});
check('Camera sampling follows local cover and excludes remote/departing animals', () => {
  g.newGame(1987, 'free', 'standard', 'pnw'); const w = g.world;
  w.terrain.fill(T.PASTURE); w.habitat.fill(H.BARE); w.canopy.fill(0); w.distWater.fill(30);
  for (let y = 12; y <= 36; y++) for (let x = 12; x <= 36; x++) { const i = w.idx(x, y); w.habitat[i] = H.MATURE_FOREST; w.canopy[i] = 1; }
  w.terrain[w.idx(24, 24)] = T.CREEK;
  const robin = ANIMALS.find(d => d.key === 'robin').index;
  g.wildlife.agents = [{ sp: robin, x: 24, y: 24, leaving: false }, { sp: robin, x: 90, y: 70, leaving: true }];
  const a = sampleSoundLand(g, { target: { x: 24, z: 24 } }, biome, ANIMALS), b = sampleSoundLand(g, { target: { x: 90, z: 70 } }, biome, ANIMALS);
  assert.equal(a.canopy, 1); assert.equal(a.bare, 0); assert.equal(a.creek, 1); assert.deepEqual(a.present, ['robin']);
  assert.equal(b.canopy, 0); assert.equal(b.bare, 1); assert.equal(b.creek, 0); assert.deepEqual(b.present, []);
  w.terrain[w.idx(24, 24)] = T.PASTURE; w.terrain[w.idx(25, 24)] = T.CREEK;
  w.habitat[w.idx(25, 25)] = H.POND;
  const smallWater = sampleSoundLand(g, { target: { x: 24, z: 24 } }, biome, ANIMALS);
  assert(smallWater.creek > 0.9, 'Narrow streams between old sample points are audible');
  assert(smallWater.wet > 0.5, 'A tiny nearby frog pond does not vanish into the area average');
  for (const target of [{ x: -10, z: -10 }, { x: 130, z: 100 }]) assert(Number.isFinite(sampleSoundLand(g, { target }, biome, ANIMALS).wet));
});
check('Audio unlock preserves the scene provided before startup', () => {
  const m = new Music(); m.setScene('rain', 3); m.setLand(land('sumatra'));
  assert.equal(m.weather, 'rain'); assert.equal(m.season, 3); assert.equal(m.land.map, 'sumatra');
  assert(natureMix(m.land, m.weather, m.season).rain > 0);
  assert.equal(new Music().birdLife(), 0);
});
check('Cattle and predators carry farther without inventing absent animals', () => {
  for (const [map, key, distance] of [['chinandega', 'cattle', 38], ['serengeti', 'lion', 50], ['serengeti', 'hyena', 50]]) {
    g.newGame(1987, 'free', 'standard', map);
    const sp = ANIMALS.find(d => d.key === key).index;
    g.wildlife.agents = [{ sp, x: 20 + distance, y: 20, leaving: false }];
    const sample = () => sampleSoundLand(g, { target: { x: 20, z: 20 } }, biome, ANIMALS);
    assert(!sample().present.includes(key)); assert(sample().callPresent.includes(key));
    g.wildlife.agents[0].leaving = true; assert(!sample().callPresent.includes(key));
    g.wildlife.agents[0].leaving = false; g.wildlife.agents[0].x = 110; assert(!sample().callPresent.includes(key));
  }
});
check('Prominent calls happen promptly even when random chance would never fire', () => {
  const random = Math.random; Math.random = () => 0.999;
  try {
    for (const [map, key, voice, time] of [['chinandega', 'cattle', 'moo', {}], ['serengeti', 'lion', 'lion', { night: 1 }], ['serengeti', 'hyena', 'hyena', { night: 1 }]]) {
      const m = new Music(); m.ctx = { currentTime: 0 }; m.land = land(map, { present: [key], ...time });
      let played = 0; m[voice] = () => played++;
      for (let tick = 0; tick <= 16; tick++) { m.ctx.currentTime = tick / 4; m.calls(0.25); }
      assert.equal(played, 1, `${voice} should play within four seconds`);
      for (let tick = 17; tick <= 40; tick++) { m.ctx.currentTime = tick / 4; m.calls(0.25); }
      assert.equal(played, 1, `${voice} should leave a quiet gap`);
      m.land.present = []; m.calls(0.25); assert(!m.callDue.has(voice));
      m.land.present = [key]; m.land.night = key === 'cattle' ? 1 : 0; m.land.dusk = 0;
      m.ctx.currentTime = 100; m.calls(0.25); assert.equal(played, 1, 'Wrong time of day must stay quiet');
    }
    const m = new Music(); m.ctx = { currentTime: 0 }; m.land = land('serengeti', { night: 1, present: ['lion', 'hyena'] });
    const starts = []; m.lion = () => starts.push(['lion', m.ctx.currentTime]); m.hyena = () => starts.push(['hyena', m.ctx.currentTime]);
    for (let tick = 0; tick <= 48; tick++) { m.ctx.currentTime = tick / 4; m.calls(0.25); }
    assert.deepEqual(starts.map(c => c[0]), ['hyena', 'lion']); assert(starts[1][1] - starts[0][1] >= 5, 'Featured calls should not mask each other');
  } finally { Math.random = random; }
});
console.log(`${checks} nature audio checks passed.`);
