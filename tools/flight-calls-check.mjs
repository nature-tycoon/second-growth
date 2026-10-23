// node tools/flight-calls-check.mjs
// Geese honk as a passing flock crosses, ducks call only on the wing, and calls take turns.
import assert from 'node:assert/strict';
import { FLIGHT_CALLS, flightCalls } from '../js/audio/flight-calls.js';
import { FIELD_RECORDINGS } from '../js/audio/recordings.js';
import { SOUND_CREDITS } from '../js/audio/sounds.js';
import { PASSAGE_SPECIES } from '../js/data/bird-passage.js';
import { readFileSync, readdirSync } from 'node:fs';

const data = new URL('../js/data/', import.meta.url);
const species = readdirSync(data).filter(f => f.startsWith('animals-')).map(f => readFileSync(new URL(f, data), 'utf8')).join('\n');
for (const [key, call] of Object.entries(FLIGHT_CALLS)) {
  assert.ok(PASSAGE_SPECIES[key] || species.includes(`key: '${key}'`), `${key}: a species in the game`);
  for (const id of call.ids) {
    assert.ok(FIELD_RECORDINGS[id], `${id}: registered recording`);
    assert.ok(SOUND_CREDITS.some(c => c.source === FIELD_RECORDINGS[id].source), `${id}: credited`);
  }
}

const animals = [{ key: 'mallard' }, { key: 'woodduck' }, { key: 'elk' }];
const setup = () => {
  const plays = [];
  const music = { ctx: { state: 'running', currentTime: 0 }, natureOn: true, muted: false, foregroundUntil: 0,
    playField(id, opts) { plays.push({ id, ...opts }); return opts.length ?? 2.5; } };
  const game = { catalog: { animals }, wildlife: { agents: [], flyovers: [] } };
  const renderer = { target: { x: 50, z: 50 }, right: () => ({ x: 1, z: 0 }), vw: 1200, ppu: 20 };
  const run = (seconds, step = 0.1) => { for (let t = 0; t < seconds; t += step) { music.ctx.currentTime += step; flightCalls(game, renderer, music); } };
  return { plays, music, game, run };
};

{ // a flock off to the right honks, panned right, in short excerpts; it falls silent once gone
  const { plays, game, run } = setup();
  for (let k = 0; k < 7; k++) game.wildlife.flyovers.push({ key: 'canada_goose', flock: 3, x: 70 + k, y: 50 });
  run(30);
  assert.ok(plays.length >= 4, `flock honks repeatedly (${plays.length})`);
  assert.ok(plays.every(p => FLIGHT_CALLS.canada_goose.ids.includes(p.id) && p.pan > 0 && p.anywhere && p.length <= 6));
  game.wildlife.flyovers.length = 0; const before = plays.length; run(10);
  assert.equal(plays.length, before, 'no honks after the flock has left');
  game.wildlife.flyovers.push({ key: 'canada_goose', flock: 4, x: 200, y: 50 }); run(10);
  assert.equal(plays.length, before, 'a flock out of earshot is silent');
}
{ // ducks call only in the air; an elk overhead (or anything unmapped) never does
  const { plays, game, run } = setup();
  game.wildlife.agents.push({ id: 1, sp: 0, x: 52, y: 50, flying: false, alt: 0 }, { id: 2, sp: 1, x: 48, y: 50, flying: false, alt: 0 },
    { id: 3, sp: 2, x: 50, y: 50, flying: true, alt: 1 });
  run(20);
  assert.equal(plays.length, 0, 'ducks on the water stay quiet');
  game.wildlife.agents[0].flying = true; game.wildlife.agents[0].alt = 1; run(20);
  assert.ok(plays.length >= 1 && plays.every(p => p.id === 'mallard'), 'a flying mallard quacks');
  game.wildlife.agents[1].flying = true; game.wildlife.agents[1].alt = 1; plays.length = 0; run(40);
  assert.ok(plays.some(p => p.id === 'wood-duck'), 'a flying wood duck squeals');
}
{ // one flight call at a time, and none while muted, nature is off, or a lion roars
  const { plays, music, game, run } = setup();
  for (let k = 0; k < 4; k++) game.wildlife.flyovers.push({ key: 'canada_goose', flock: k, x: 50 + k, y: 50 });
  let busy = 0;
  music.playField = (id, o) => { assert.ok(music.ctx.currentTime >= busy, 'calls never overlap'); busy = music.ctx.currentTime + o.length; plays.push(id); return o.length; };
  run(30); assert.ok(plays.length >= 4);
  const n = plays.length;
  music.muted = true; run(10); music.muted = false;
  music.natureOn = false; run(10); music.natureOn = true;
  music.foregroundUntil = music.ctx.currentTime + 10; run(9.5);
  assert.equal(plays.length, n, 'quiet when muted, nature off, or during a prominent call');
}
{ // a clip still loading leaves the call due rather than skipping it
  const { plays, music, game, run } = setup();
  game.wildlife.agents.push({ id: 1, sp: 0, x: 50, y: 50, flying: true, alt: 1 });
  let ready = false; music.playField = (id, o) => { if (!ready) return 0; plays.push(id); return 2.5; };
  run(3); ready = true; music.ctx.currentTime += 0.1; flightCalls(game, { target: { x: 50, z: 50 }, right: () => ({ x: 1, z: 0 }), vw: 1200, ppu: 20 }, music);
  assert.equal(plays.length, 1, 'plays the moment the clip is ready');
}
console.log('flight calls: geese honk over passing flocks, ducks call on the wing, calls take turns and respect mute');
