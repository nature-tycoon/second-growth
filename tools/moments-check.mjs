// node tools/moments-check.mjs
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { ANIMAL, isMaleVariant } from '../js/data/animals.js';
import { T, DAYS_PER_YEAR } from '../js/config.js';
import { arrivalMoment, moment, momentFree, momentsDaily, momentsUpdate, momentScene } from '../js/sim/moments.js';
import { greet, startFeed, scavenge } from '../js/sim/animal-life.js';
import { mulberry32 } from '../js/rng.js';
import { biome } from '../js/biome.js';
import { PLANT } from '../js/data/plants.js';

Math.random = mulberry32(402);
const g = new Game(), events = [];
g.on('moment', m => events.push(m));
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function reset(map = 'pnw') {
  g.newGame(402, 'free', 'standard', map);
  g.wildlife.agents = []; g.wildlife.carcasses = []; g.wildlife.recount();
  g.canPlayMoment = undefined; events.length = 0;
  const w = g.world;
  for (let y = 25; y < 40; y++) for (let x = 30; x < 60; x++) {
    const i = w.idx(x, y); w.terrain[i] = T.SOIL; w.struct[i] = -1; w.feature[i] = 0; w.tree[i] = 0; w.fire[i] = 0;
  }
}
function spawn(key, x = 40.5, y = 30.5) {
  const a = g.wildlife.spawn(ANIMAL[key], x, y, { silent: true });
  a.x = x; a.y = y; a.age = Math.max(a.age, (ANIMAL[key].mature + 1) * DAYS_PER_YEAR); a.juvenile = false;
  return a;
}
function male(key) {
  for (let i = 0; i < 200; i++) { const a = spawn(key); if (isMaleVariant(ANIMAL[key], a)) return a; g.wildlife.remove(a); }
  throw new Error('No male variant');
}
function rig(fn) { const r = Math.random; Math.random = () => 0; try { return fn(); } finally { Math.random = r; } }

check('Animal intros wait for real behavior, even after the old arrival timeout', () => {
  for (const [map, key, species] of [['amazon', 'jaguar', 'jaguar'], ['amazon', 'howler', 'howler'], ['sumatra', 'orangutans', 'orangutan'], ['sumatra', 'harimau', 'tiger'], ['chinandega', 'congos', 'congo'], ['reef', 'manta', 'manta']]) {
    reset(map); const a = spawn(species);
    assert.equal(arrivalMoment(g, key, ANIMAL[species]), false);
    g.day += 100; momentsUpdate(g);
    assert.equal(events.length, 0, `${key}: idle arrival must not play`);
    if (['jaguar', 'harimau'].includes(key)) { const p = spawn(map === 'amazon' ? 'capybara' : 'sambar'); a.state = 'hunt'; a.target = p.id; }
    else if (key === 'manta') { const cleaner = spawn('cleaner'); a.state = cleaner.state = 'forage'; a.forage = { food: 'cleaned', partner: cleaner.id }; cleaner.forage = { food: 'cleaning', partner: a.id }; }
    else { a.state = 'primate'; a.fruitMeal = { i: 0 }; }
    momentsUpdate(g); assert.equal(events.length, 1, `${key}: actual behavior plays`); assert.equal(events[0].key, key);
    momentsUpdate(g); assert.equal(events.length, 1, 'once per farm');
  }
});
check('An elephant moment needs browsing and a nearby family member', () => {
  for (const [map, species] of [['serengeti', 'elephant'], ['sumatra', 'gajah']]) {
    reset(map); const a = spawn(species); a.state = 'forage'; a.forage = { food: 'browse' };
    momentsUpdate(g); assert.equal(events.length, 0);
    const b = spawn(species, 55.5); momentsUpdate(g); assert.equal(events.length, 0);
    b.x = 43; momentsUpdate(g); assert.equal(events.length, 1); assert.equal(events[0].key, species);
    assert.equal(momentScene(g, events[0]).stage, 'browse');
  }
});
check('A humphead moment waits for an actual crown-of-thorns feeding event', () => {
  reset('reef'); const a = spawn('humphead'), w = g.world;
  momentsUpdate(g); assert.equal(events.length, 0, 'arrival alone is not a moment');
  // a starfish a few tiles off: the wrasse swims over to it and eats it
  const i = w.idx(45, 32);
  w.tree[i] = PLANT.boulder.id; w.treeG[i] = 1;
  w.shrub[i] = PLANT.cots.id; w.shrubG[i] = 1;
  a.forageAfter = 0; a.wait = 0;
  let fed = false;
  for (let t = 0; t < 4000 && w.shrub[i]; t++) {
    g.wildlife.update(0.05); momentsUpdate(g);
    fed ||= a.state === 'forage' && a.forage?.food === 'starfish' && a.forage.i === i;
  }
  assert.ok(fed, 'the wrasse seeks the starfish out and feeds on it');
  assert.equal(events[0]?.key, 'humphead'); assert.equal(events[0].id, a.id); assert.equal(events[0].tile, i);
  assert.equal(w.shrub[i], 0, 'the starfish is eaten');
  assert.equal(momentScene(g, events[0]).caption, 'One fewer starfish');
});
check('Elk rut follows a real bout, antler contact and the losing bull’s retreat', () => {
  reset(); while (g.month !== 7) g.day++;
  const a = male('elk'), b = male('elk'), cow = spawn('elk');
  a.x = 39.5; b.x = 40.8; a.y = b.y = 30.5; a.wait = b.wait = 99;
  cow.haremOf = a.id;
  assert.equal(rig(() => greet(g.wildlife, a, ANIMAL.elk)), true);
  momentsUpdate(g); assert.equal(events[0].key, 'elkRut'); const m = events[0];
  let contact = false, retreat = false;
  for (let i = 0; i < 200 && a.state === 'spar'; i++) {
    g.wildlife.update(0.05);
    const scene = momentScene(g, m);
    contact ||= scene.stage === 'antlers'; retreat ||= scene.stage === 'retreat';
  }
  assert.ok(contact, 'camera beat observes antler contact'); assert.ok(retreat, 'camera beat observes actual retreat');
  momentsUpdate(g); assert.equal(events.length, 1);
});
check('Elk sparring outside autumn and fights without a harem are not rut moments', () => {
  reset(); const a = male('elk'), b = male('elk'); a.state = b.state = 'spar'; a.sparWith = b.id;
  const cow = spawn('elk'); cow.haremOf = a.id;
  momentsUpdate(g); assert.equal(events.length, 0);
  while (g.month !== 7) g.day++;
  a.sparLight = true; momentsUpdate(g); assert.equal(events.length, 0);
  a.sparLight = false; cow.haremOf = null; momentsUpdate(g); assert.equal(events.length, 0);
});
function sharkHunt() {
  reset('reef'); const shark = spawn('blacktip'), prey = spawn('longtom', 42.5);
  shark.state = 'hunt'; shark.target = prey.id; shark.hunt = { phase: 'approach' };
  momentsUpdate(g); assert.equal(events[0]?.key, 'sharkHunt'); return { shark, prey, m: events[0] };
}
check('A shark moment needs a blacktip actually hunting a longtom', () => {
  reset('reef'); const shark = spawn('blacktip'), chromis = spawn('chromis', 42.5);
  momentsUpdate(g); assert.equal(events.length, 0, 'a shark on the flats alone is not a moment');
  shark.state = 'hunt'; shark.target = chromis.id; shark.hunt = { phase: 'rush' };
  momentsUpdate(g); assert.equal(events.length, 0, 'other prey is not this moment');
  const longtom = spawn('longtom', 41.5); shark.target = longtom.id;
  momentsUpdate(g); assert.equal(events[0]?.key, 'sharkHunt'); assert.equal(events[0].prey, longtom.id);
  momentsUpdate(g); assert.equal(events.length, 1, 'once per farm');
});
check('Shark camera follows the patrol, the longtom during the chase, and the real outcome', () => {
  let { shark, prey, m } = sharkHunt();
  assert.equal(momentScene(g, m).stage, 'patrol');
  shark.hunt.phase = 'rush'; const chase = momentScene(g, m);
  assert.equal(chase.stage, 'chase'); assert.equal(chase.agent, prey, 'the camera watches the skipping longtom');
  g.wildlife.remove(prey, 'predation'); startFeed(g.wildlife, shark, ANIMAL.blacktip, prey);
  assert.equal(momentScene(g, m).stage, 'catch'); assert.equal(g.wildlife.carcasses.length, 0, 'a longtom is eaten on the spot');
  ({ shark, prey, m } = sharkHunt());
  shark.state = 'idle'; assert.equal(momentScene(g, m).stage, 'escape');
  shark.state = 'hunt'; shark.target = prey.id; assert.equal(momentScene(g, m).stage, 'escape', 'a later pursuit does not restart this encounter');
});
check('The retired dugong moment never plays, even from an old save\u2019s queue', () => {
  reset('reef'); const a = spawn('dugong'); a.state = 'forage'; a.forage = { food: 'seagrass' };
  g.day += 100; momentsUpdate(g); assert.equal(events.length, 0);
  g.flags.momentQueue = [{ key: 'dugong', x: 40, y: 30 }]; g.flags.lastMomentDay = g.day - 30;
  momentsDaily(g); assert.equal(events.length, 0); assert.equal(g.flags.momentQueue.length, 0);
});
function hunt() {
  reset('serengeti'); const lion = spawn('lion'), prey = spawn('wildebeest', 42);
  lion.state = 'hunt'; lion.target = prey.id; lion.hunt = { phase: 'creep' };
  momentsUpdate(g); assert.equal(events[0].key, 'lionHunt'); return { lion, prey, m: events[0] };
}
check('Lion camera follows stalk, chase, a real kill and both actual scavenger meals', () => {
  const { lion, prey, m } = hunt(); const wl = g.wildlife;
  assert.equal(momentScene(g, m).stage, 'stalk'); lion.hunt.phase = 'rush'; assert.equal(momentScene(g, m).stage, 'chase');
  wl.remove(prey, 'predation'); startFeed(wl, lion, ANIMAL.lion, prey);
  assert.equal(momentScene(g, m).stage, 'kill'); const c = wl.carcasses[0], meals = c.meals;
  assert.ok(meals >= 2);
  for (const [key, stage] of [['hyena', 'scavengers'], ['vulture', 'foodweb']]) {
    const visitor = spawn(key, c.x + 0.3, c.y); visitor.hunger = 40;
    assert.equal(rig(() => scavenge(wl, visitor, ANIMAL[key])), true);
    assert.equal(momentScene(g, m).stage, stage);
    visitor.state = 'idle'; // the two meals need not overlap in time
  }
  assert.equal(c.meals, meals - 2, 'the cinematic adds no food');
  const snapshot = JSON.stringify(wl.carcasses), rng = g.rng.state();
  momentScene(g, m); momentScene(g, m);
  assert.equal(JSON.stringify(wl.carcasses), snapshot); assert.equal(g.rng.state(), rng);
  c.t = 0; assert.equal(momentScene(g, m).stage, 'after');
});
check('An escape, a different target, or a different predator’s kill never invents a lion meal', () => {
  const { lion, prey, m } = hunt();
  lion.state = 'idle'; assert.equal(momentScene(g, m).stage, 'escape');
  lion.state = 'hunt'; lion.target = prey.id; assert.equal(momentScene(g, m).stage, 'escape', 'a later pursuit does not restart this encounter');
  lion.target = spawn('wildebeest', 44).id; assert.equal(momentScene(g, m).stage, 'escape');
  const hyena = spawn('hyena'); g.wildlife.remove(prey, 'predation'); startFeed(g.wildlife, hyena, ANIMAL.hyena, prey);
  assert.equal(momentScene(g, { ...m, finishedScene: null }).stage, 'after'); assert.equal(g.wildlife.carcasses.length, 1);
});
check('Live moments wait for a free view and the game gap without queuing stale encounters', () => {
  reset('serengeti'); const a = spawn('lion'), prey = spawn('wildebeest'); a.state = 'hunt'; a.target = prey.id;
  g.canPlayMoment = () => false; momentsUpdate(g); assert.equal(events.length, 0); assert.equal(g.flags.moments?.lionHunt, undefined);
  assert.equal(moment(g, 'lionHunt', a, { live: true }), false);
  g.canPlayMoment = () => true; moment(g, 'crossing', a); assert.equal(momentFree(g), false);
  momentsUpdate(g); assert.equal(events.length, 1);
  g.day += 20; momentsUpdate(g); assert.equal(events[1].key, 'lionHunt');
  const saved = g.saveData(); assert.equal(saved.flags.moments.lionHunt, g.day);
  g.restoreSave(saved); momentsUpdate(g); assert.equal(events.length, 2, 'save/load preserves completion');
});
check('Durable landscape moments still queue, and wait for the UI before playing', () => {
  reset(); const at = { x: 40, y: 30 };
  moment(g, 'salmon', at); moment(g, 'dam', at); assert.equal(g.flags.momentQueue.length, 1);
  g.day += 20; g.canPlayMoment = () => false; momentsDaily(g); assert.equal(events.length, 1);
  g.canPlayMoment = () => true; momentsDaily(g); assert.equal(events[1].key, 'dam');
  assert.equal(g.flags.momentQueue.length, 0);
});
console.log(`${checks} keystone checks passed.`);
