// Exercise delayed visitors through normal movement, not teleporting them onto a kill.
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { T } from '../js/config.js';
import { startFeed, scavenge } from '../js/sim/animal-life.js';
import { mulberry32 } from '../js/rng.js';
const audit = process.argv.includes('--audit');
let fed = 0;
for (const [map, hunterKey, preyKey, visitorKey, distance] of [
  ['pnw', 'cougar', 'deer', 'raccoon', 21],
  ['pnw', 'cougar', 'deer', 'coyote', 21],
  ['serengeti', 'lion', 'buffalo', 'vulture', 38],
]) {
  Math.random = mulberry32(16203);
  const g = new Game(); g.newGame(1987, 'free', 'standard', map);
  const wl = g.wildlife, w = g.world;
  wl.agents = []; wl.recount(); wl.flyovers = []; wl.passageWait = 1e6;
  w.terrain.fill(T.SOIL); w.struct.fill(-1); w.feature.fill(0); w.fire.fill(0);
  w.tree.fill(0); w.shrub.fill(0); w.ground.fill(0); w.distWater.fill(99);
  wl.suit.forEach(s => s.fill(1));
  const hunter = wl.spawn(g.catalog.animal[hunterKey], 40, 30, { silent: true });
  const prey = wl.spawn(g.catalog.animal[preyKey], 40, 30, { silent: true });
  hunter.x = prey.x = 40.5; hunter.y = prey.y = 30.5; hunter.hunger = 0;
  wl.remove(prey, 'predation'); startFeed(wl, hunter, g.catalog.animal[hunterKey], prey);
  const carcass = wl.carcasses[0], life = carcass.t, meals = carcass.meals;
  // The hunter rests away from the route after its meal, without creating another kill.
  hunter.wait = 100;
  const visitor = wl.spawn(g.catalog.animal[visitorKey], 40 + distance, 30, { silent: true });
  visitor.x = 40.5 + distance; visitor.y = 30.5; visitor.hunger = 40; visitor.wait = 0;
  const random = Math.random; Math.random = () => 0.1;
  try { assert.ok(scavenge(wl, visitor, g.catalog.animal[visitorKey])); } finally { Math.random = random; }
  assert.equal(visitor.hunger, 40); assert.equal(carcass.meals, meals, 'no reservation consumes food');
  let arrival = null;
  for (let k = 0; k < 900; k++) {
    wl.update(0.05);
    if (visitor.state === 'feed' && visitor.carcass === carcass.id && visitor.hunger === 0) { arrival = (k + 1) * 0.05; break; }
    if (carcass.t <= 0) break;
  }
  const row = { map, visitor: visitorKey, distance, lifespan: +life.toFixed(2), fedAtDay: arrival == null ? null : +arrival.toFixed(2) };
  console.log(JSON.stringify(row));
  if (arrival != null) fed++;
  if (!audit) {
    assert.ok(arrival != null, `${visitorKey} reaches a carcass before it decays`);
    assert.equal(carcass.meals, meals - 1); assert.equal(wl.agents.length, 2, 'one kill feeds a visitor without another prey death');
  }
}
console.log(`${fed}/3 distant scavengers reached their meal`);
