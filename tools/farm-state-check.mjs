import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { BIOME_LIST, setBiome } from '../js/biome.js';
import { DIFFICULTY, DAYS_PER_MONTH } from '../js/config.js';
import { createFarmState } from '../js/farm-state.js';

let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }
const g = new Game();

check('Fresh farms receive independent nested state and difficulty defaults', () => {
  const a = createFarmState(), b = createFarmState();
  a.flags.old = true; a.stats.used.raise = 1; a.ledger.in.reward = 10; a.history.push({ day: 0 });
  assert.deepEqual(b.flags, {}); assert.deepEqual(b.stats.used, {});
  assert.deepEqual(b.ledger.in, {}); assert.deepEqual(b.history, []);
  for (const difficulty of Object.keys(DIFFICULTY)) assert.equal(createFarmState({ difficulty }).money, DIFFICULTY[difficulty].startMoney);
});

check('Restart replaces farm state and retains session preferences and listeners', () => {
  g.newGame(1987, 'free', 'standard', 'pnw');
  const callback = () => false; let notices = 0;
  g.canPlayMoment = callback; g.autosave = false; g.on('notify', () => notices++);
  g.cache.nativePlants = 26; g.cache.hunts = { old: true }; g.lastGrant = 900;
  g.weatherDays = 7; g.flags.old = true; g.stats.used.raise = 10;
  g.newGame(2, 'free', 'standard', 'pnw');
  assert.equal(g.cache.nativePlants, undefined); assert.equal(g.cache.hunts, undefined);
  assert.equal(g.lastGrant, 0); assert.equal(g.weatherDays, 0);
  assert.equal(g.flags.old, undefined); assert.deepEqual(g.stats.used, {});
  assert.equal(g.canPlayMoment, callback); assert.equal(g.autosave, false);
  g.notify('New farm'); assert.equal(notices, 1);
});

for (const map of BIOME_LIST) check(`${map.id}: restore binds the owning map and fills older optional fields`, () => {
  g.newGame(1987, 'free', 'challenging', map.id);
  g.day = 42; g.money = 12345;
  const data = g.saveData();
  for (const key of ['mode', 'campaign', 'difficulty', 'weather', 'weatherDays', 'snow', 'ledger', 'lastLedger', 'lastGrant', 'cache']) delete data[key];
  delete data.stats.used;
  data.speed = 0;
  g.newGame(2, 'free', 'standard', map.id === 'pnw' ? 'reef' : 'pnw');
  assert.equal(g.restoreSave(data), true);
  assert.equal(g.mapDefinition.id, map.id); assert.equal(g.map, map.id);
  assert.equal(g.day, 42); assert.equal(g.money, 12345); assert.equal(g.speed, 1);
  assert.equal(g.mode, 'free'); assert.equal(g.difficulty, 'standard');
  assert.equal(g.weather, 'clear'); assert.equal(g.weatherDays, 0);
  assert.deepEqual(g.stats.used, {}); assert.deepEqual(g.ledger, { in: {}, out: {} });
});

check('Season names and fire scheduling use the owning farm configuration', () => {
  g.newGame(1987, 'free', 'standard', 'pnw');
  const definition = g.mapDefinition;
  g.day = definition.climate.fireMonths[0] * DAYS_PER_MONTH;
  const season = g.seasonName();
  g.events.updateFire = () => {}; g.events.updateFlood = () => {}; g.events.fuelLoad = () => 1;
  let fires = 0; g.events.ignite = () => { fires++; };
  g.dryStreak = 6; g.rng = () => 0;
  setBiome('reef');
  assert.equal(g.mapDefinition, definition); assert.equal(g.seasonName(), season);
  g.events.daily(); assert.equal(fires, 1);
  setBiome('pnw');
});

check('Visitor donations use the owning farm value after another registry is selected', () => {
  g.newGame(1987, 'free', 'standard', 'pnw');
  const visitors = g.visitors;
  visitors.facilities = () => ({ parking: 1, center: 1, blinds: 0, boardwalk: 0 });
  visitors.network = () => { visitors.net = new Array(110).fill(g.world.idx(10, 10)); };
  visitors.scenery = () => ({ scenic: 1, invasive: 0 });
  const month = () => { visitors.rep = 0; visitors.seen = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); return visitors.monthEnd().income; };
  const before = month(); assert.ok(before > 0);
  setBiome('amazon'); assert.equal(month(), before);
  setBiome('pnw');
});

console.log(`${checks} farm ownership and initialization checks passed.`);
