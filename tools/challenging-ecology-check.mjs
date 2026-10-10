// node tools/challenging-ecology-check.mjs
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { T, F } from '../js/config.js';
import { ANIMAL, ANIMALS, preyFor } from '../js/data/animals.js';
import { PLANT, PLANTS } from '../js/data/plants.js';
import { browseSapling, establishmentStress, stressYoungPlant, predationCatchChance, hungryPredator, pressureTileNotes, MULCH_DAYS, CHALLENGE_TOOL_ADVICE } from '../js/sim/ecological-pressure.js';
import { updatePlants } from '../js/sim/plants.js';
import { wildlifeDiagnostics } from '../js/sim/wildlife-diagnostics.js';
import { TOOLS } from '../js/tools.js';
import { Undo } from '../js/undo.js';
import { mulberry32 } from '../js/rng.js';
import { tr } from '../js/i18n.js';
import '../js/lang/es.js';

const g = new Game();
let checks = 0;
function check(name, fn) {
  const result = fn(), done = () => { checks++; console.log(`PASS ${name}`); };
  if (result?.then) return result.then(done);
  done();
}
function reset(mode = 'challenging', map = 'pnw') {
  g.newGame(1987, 'free', mode, map);
  g.wildlife.agents = []; g.wildlife.recount();
}
function tile(x = 30, y = 30, terrain = T.SOIL) {
  const w = g.world, i = w.idx(x, y);
  for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (w.inb(xx, yy)) {
    const j = w.idx(xx, yy); w.clearPlants(j); w.feature[j] = 0; w.struct[j] = -1; w.terrain[j] = terrain;
  }
  w.moist[i] = w.baseMoist[i] = 0.55; w.soil[i] = 0.8;
  w.canopy[i] = w.nbCanopy[i] = 0; w.distWater[i] = 10;
  w.distLog[i] = w.distWoody[i] = w.distRocks[i] = 100;
  return i;
}
function sapling(i, size = 0.08) { g.world.setPlant(i, PLANT.fir, size); }
function browser(x = 30.5, y = 30.5) { return { sp: ANIMAL.deer.index, x, y, state: 'idle', hunger: 0 }; }
function pondPair() {
  const w = g.world, i = tile(30, 30, T.POND);
  for (let yy = 29; yy <= 31; yy++) for (let xx = 29; xx <= 31; xx++) w.distWater[w.idx(xx, yy)] = 0;
  const fish = g.wildlife.spawn(ANIMAL.cutthroat, 30, 30, { silent: true });
  const otter = g.wildlife.spawn(ANIMAL.otter, 30, 30, { silent: true });
  fish.x = 30.7; fish.y = 30.5; otter.x = 30.5; otter.y = 30.5;
  fish.state = 'idle'; fish.wait = 100;
  g.wildlife.startHunt(otter, ANIMAL.otter);
  return { i, fish, otter };
}
function huntPair(predKey, preyKey, terrain = T.SOIL) {
  const w = g.world, i = tile(30, 30, terrain), def = ANIMAL[predKey];
  for (let yy = 29; yy <= 31; yy++) for (let xx = 29; xx <= 31; xx++) w.distWater[w.idx(xx, yy)] = 0;
  const prey = g.wildlife.spawn(ANIMAL[preyKey], 30, 30, { silent: true });
  const predator = g.wildlife.spawn(def, 30, 30, { silent: true });
  prey.x = 30.7; prey.y = 30.5; prey.state = 'idle'; prey.wait = 100;
  predator.x = 30.5; predator.y = 30.5; predator.hunger = 12;
  g.wildlife.startHunt(predator, def);
  return { i, prey, predator };
}

check('All seven maps have valid prey lists and finite Challenging capacities', () => {
  for (const map of ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'reef', 'sumatra']) {
    reset('challenging', map);
    for (const def of ANIMALS) {
      assert.ok(Number.isFinite(g.wildlife.state[def.index].K), `${map}/${def.key}`);
      for (const key of preyFor(def, g) || []) assert.ok(ANIMAL[key], `${map}/${def.key}/${key}`);
      if (def.challengePrey) assert.ok(def.challengePrey.every(k => ['fish', 'frog'].includes(ANIMAL[k].sprite.kind)));
      assert.doesNotThrow(() => wildlifeDiagnostics(g, def));
    }
  }
});
check('Relaxed and Standard skip new pressures without consuming randomness', () => {
  for (const mode of ['relaxed', 'standard']) {
    reset(mode); const i = tile(); sapling(i); g.world.moist[i] = 0;
    g.rng = () => { throw Error('Inactive pressure consumed RNG'); };
    assert.equal(browseSapling(g, browser(), ANIMAL.deer), false);
    assert.equal(stressYoungPlant(g, i, PLANT.fir, 0.08), 0.08);
    assert.equal(preyFor(ANIMAL.otter, g), null);
    assert.equal(predationCatchChance(g, { sp: ANIMAL.cutthroat.index, x: 30, y: 30 }), 0.45);
    assert.deepEqual(pressureTileNotes(g, i), []);
    assert.equal(g.world.browseDamage, undefined);
    assert.equal(g.world.mulchDays, undefined);
  }
});
check('Repeated browsing kills a young tree and records the loss', () => {
  reset(); const i = tile(); sapling(i); g.rng = () => 0;
  for (let day = 0; day < 4; day++) browseSapling(g, browser(), ANIMAL.deer);
  assert.equal(g.world.tree[i], 0); assert.equal(g.world.treeG[i], 0); assert.equal(g.world.treeAge[i], 0);
  assert.equal(g.stats.saplingsLost, 1); assert.ok(g.world.browseDamage[i] > 0);
});
check('Brush shelter preserves a sapling under the same repeated browsing', () => {
  reset(); const i = tile(); sapling(i); g.world.feature[i + 1] = F.BRUSH; g.rng = () => 0;
  for (let day = 0; day < 4; day++) browseSapling(g, browser(), ANIMAL.deer);
  assert.equal(g.world.tree[i], PLANT.fir.id); assert.ok(g.world.treeG[i] > 0.06);
  assert.ok(pressureTileNotes(g, i).some(s => s.includes('Nearby brush')));
});
check('Browsers reach adjacent seedlings but respect fences, water, structures and maturity', () => {
  reset(); const i = tile(); sapling(i + 1); g.rng = () => 0;
  assert.equal(browseSapling(g, browser(), ANIMAL.deer), true);
  for (const barrier of ['fence', 'water', 'structure', 'mature']) {
    tile(); sapling(i + 1);
    if (barrier === 'fence') g.world.feature[i + 1] = F.FENCE;
    if (barrier === 'water') g.world.terrain[i + 1] = T.POND;
    if (barrier === 'structure') g.world.struct[i + 1] = 0;
    if (barrier === 'mature') g.world.treeG[i + 1] = 0.7;
    assert.equal(browseSapling(g, browser(), ANIMAL.deer), false, barrier);
  }
});
check('Browser neighborhoods never wrap around map edges', () => {
  reset(); const w = g.world; const i = tile(0, 30); tile(w.w - 1, 29); sapling(i - 1); g.rng = () => 0;
  assert.equal(browseSapling(g, browser(0.5, 30.5), ANIMAL.deer), false);
});
check('The daily wildlife loop applies lethal browsing only in Challenging', () => {
  for (const mode of ['relaxed', 'standard', 'challenging']) {
    reset(mode); const i = tile(); sapling(i, 0.02);
    g.wildlife.agents.push(browser()); g.rng = () => 0;
    g.wildlife.daily();
    if (mode === 'challenging') assert.equal(g.world.tree[i], 0);
    else { assert.equal(g.world.tree[i], PLANT.fir.id); assert.ok(g.world.treeG[i] >= 0.049); }
  }
});
check('Grass intensifies dry-site stress; mulch reduces it; mature and wet-site plants escape it', () => {
  reset(); const i = tile(), w = g.world; w.moist[i] = PLANT.fir.moist[0] - 0.05;
  const bare = establishmentStress(w, i, PLANT.fir, 0.1);
  const grass = PLANTS.find(p => p?.layer === 0 && p.look.type === 'grass'); w.setPlant(i, grass, 1);
  const grassy = establishmentStress(w, i, PLANT.fir, 0.1); assert.ok(grassy > bare && bare > 0);
  w.mulchDays = new Uint16Array(w.n); w.mulchDays[i] = 120;
  assert.ok(establishmentStress(w, i, PLANT.fir, 0.1) < bare);
  assert.equal(establishmentStress(w, i, PLANT.fir, 0.7), 0);
  assert.equal(establishmentStress(w, i, grass, 0.1), 0);
  w.moist[i] = 0.8; assert.equal(establishmentStress(w, i, PLANT.fir, 0.1), 0);
  g.day = 100; w.moist[i] = 0; assert.equal(stressYoungPlant(g, i, PLANT.fir, 0.1), 0.1); // dormant winter
});
check('Mulching lets a tree establish where additional drought would otherwise kill it', () => {
  reset(); const i = tile(30, 30), j = tile(35, 30), w = g.world;
  const grass = PLANTS.find(p => p?.layer === 0 && p.look.type === 'grass');
  for (const k of [i, j]) { sapling(k, 0.08); w.setPlant(k, grass, 1); w.moist[k] = PLANT.fir.moist[0]; }
  assert.equal(TOOLS.mulch.apply(g, j), true); g.rng = () => 0.99;
  for (let day = 0; day < 120; day++) updatePlants(g);
  assert.equal(w.tree[i], 0); assert.equal(w.tree[j], PLANT.fir.id);
  assert.ok(w.treeG[j] > 0.08); assert.equal(w.mulchDays[j], 0);
  assert.ok(g.stats.establishmentLosses >= 1);
});
check('Mulch renews expiring protection without degrading fertile soil; ordinary modes retain original rules', () => {
  reset(); const i = tile(); g.world.soil[i] = 0.95;
  assert.equal(TOOLS.mulch.apply(g, i), true); assert.ok(g.world.soil[i] >= 0.949);
  assert.equal(TOOLS.mulch.apply(g, i), null);
  g.world.mulchDays[i] = 20; assert.equal(TOOLS.mulch.apply(g, i), true); assert.equal(g.world.mulchDays[i], MULCH_DAYS);
  for (const mode of ['relaxed', 'standard']) { reset(mode); const j = tile(); assert.equal(TOOLS.mulch.apply(g, j), null); }
});
check('Otters catch actual pond fish on contact and lower prey-limited capacity', () => {
  reset(); const { fish, otter } = pondPair(); g.rng = () => 0.2;
  g.wildlife.computeSuitability(); const before = g.wildlife.state[ANIMAL.otter.index].preyK;
  assert.equal(otter.state, 'hunt'); g.wildlife.update(0.05);
  assert.ok(!g.wildlife.agents.includes(fish)); assert.equal(g.wildlife.state[ANIMAL.cutthroat.index].pop, 0);
  g.wildlife.computeSuitability(); assert.ok(g.wildlife.state[ANIMAL.otter.index].preyK < before);
});
check('Hungry otters start hunting from the daily simulation only in Challenging', () => {
  reset(); const { otter } = pondPair(); otter.state = 'idle'; otter.hunger = 8; g.rng = () => 0;
  g.wildlife.daily(); assert.equal(otter.state, 'hunt');
  g.difficulty = 'standard'; otter.state = 'idle'; g.wildlife.daily(); assert.equal(otter.state, 'idle');
});
check('Fish cover prevents a catch that succeeds in exposed water with the same random draw', () => {
  reset(); const { i, fish } = pondPair(); g.world.distLog[i] = 0; g.world.distWoody[i] = 0;
  g.world.terrain[i] = T.MARSH; assert.ok(predationCatchChance(g, fish) < 0.2);
  g.rng = () => 0.2; g.wildlife.update(0.05); assert.ok(g.wildlife.agents.includes(fish));
});
check('Hunting neither removes remote fish nor continues new fish hunts after switching to Standard', () => {
  reset(); const { fish, otter } = pondPair(); fish.x = 35.5; otter.huntTime = 3; g.rng = () => 0;
  g.wildlife.update(0.01); assert.ok(g.wildlife.agents.includes(fish));
  g.difficulty = 'standard'; fish.x = otter.x; fish.y = otter.y; g.wildlife.update(0.05);
  assert.equal(otter.state, 'idle'); assert.ok(g.wildlife.agents.includes(fish));
  reset('standard', 'amazon'); assert.deepEqual(preyFor(ANIMAL.giantotter, g), ANIMAL.giantotter.prey);
});
check('Predators respect dry terrain between aquatic prey', () => {
  reset(); const { fish, otter } = pondPair(); const w = g.world;
  fish.x = 34.5; otter.x = 31.9; w.terrain[w.idx(32, 30)] = T.SOIL; w.distWater[w.idx(32, 30)] = 10;
  g.wildlife.update(0.05); assert.equal(otter.state, 'idle'); assert.ok(g.wildlife.agents.includes(fish));
});
check('Reef fish shelter in coral and seagrass; marine life avoids terrestrial establishment stress', () => {
  reset('challenging', 'reef'); const i = tile(), w = g.world;
  const def = ANIMALS.find(d => d.sprite.kind === 'fish'), fish = { sp: def.index, x: 30.5, y: 30.5 };
  const exposed = predationCatchChance(g, fish); w.nbCanopy[i] = 0.8; w.setPlant(i, PLANT.zostera, 1);
  assert.ok(predationCatchChance(g, fish) < exposed);
  w.moist[i] = 0; assert.equal(stressYoungPlant(g, i, PLANT.staghorn, 0.08), 0.08);
  const predator = ANIMALS.find(d => d.prey?.some(k => ANIMAL[k].sprite.kind === 'fish'));
  assert.match(wildlifeDiagnostics(g, predator).rows.find(r => r.key === 'predation').text, /Coral structure and seagrass/);
});
check('Every registered predator-prey relationship catches a real animal across all seven maps', () => {
  let relationships = 0;
  for (const map of ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'reef', 'sumatra']) {
    reset('challenging', map);
    for (const def of ANIMALS) for (const key of preyFor(def, g) || []) {
      g.wildlife.agents = []; g.wildlife.recount();
      const { prey, predator } = huntPair(def.key, key, def.move === 'swim' ? T.POND : T.SOIL);
      g.rng = () => 0; const catches = g.stats.predations || 0;
      assert.equal(predator.state, 'hunt', `${map}/${def.key}/${key}`);
      g.wildlife.update(0.05);
      assert.ok(!g.wildlife.agents.includes(prey), `${map}/${def.key}/${key}`);
      assert.equal(g.stats.predations, catches + 1);
      assert.equal(g.wildlife.state[ANIMAL[key].index].pop, 0); assert.equal(predator.hunger, 0);
      relationships++;
    }
  }
  assert.ok(relationships >= 80); console.log(`  Verified ${relationships} predator-prey relationships.`);
});
check('Brush shelters rabbits from bobcats, while the same exposed rabbit is caught', () => {
  reset(); let pair = huntPair('bobcat', 'rabbit'); g.rng = () => 0.35;
  g.wildlife.update(0.05); assert.ok(!g.wildlife.agents.includes(pair.prey));
  reset(); pair = huntPair('bobcat', 'rabbit'); g.world.feature[pair.i + 1] = F.BRUSH; g.rng = () => 0.35;
  g.wildlife.update(0.05); assert.ok(g.wildlife.agents.includes(pair.prey));
  assert.equal(pair.predator.hunger, 12); assert.equal(pair.prey.state, 'walk');
});
check('Cover helps land prey against raptors and snakes, but a small refuge cannot hide a buffalo', () => {
  reset(); const { i, prey } = huntPair('hawk', 'vole'), w = g.world;
  const exposed = predationCatchChance(g, prey, ANIMAL.hawk);
  w.distLog[i] = 0; assert.ok(predationCatchChance(g, prey, ANIMAL.hawk) < exposed);
  w.distLog[i] = 100; w.canopy[i] = 0.8; assert.ok(predationCatchChance(g, prey, ANIMAL.hawk) < exposed);
  reset('challenging', 'atlanta'); const snake = huntPair('ratsnake', 'chipmunk');
  const noRocks = predationCatchChance(g, snake.prey, ANIMAL.ratsnake); g.world.distRocks[snake.i] = 0;
  assert.ok(predationCatchChance(g, snake.prey, ANIMAL.ratsnake) < noRocks);
  reset('challenging', 'serengeti'); const lion = huntPair('lion', 'buffalo');
  const open = predationCatchChance(g, lion.prey, ANIMAL.lion); g.world.feature[lion.i + 1] = F.BRUSH;
  assert.equal(predationCatchChance(g, lion.prey, ANIMAL.lion), open);
  const shrub = PLANTS.find(p => p?.layer === 1); g.world.setPlant(lion.i, shrub, 1);
  assert.ok(predationCatchChance(g, lion.prey, ANIMAL.lion) < open);
});
check('A missed land hunt leaves Challenging predators hungry and gives prey an escape route', () => {
  for (const mode of ['relaxed', 'standard', 'challenging']) {
    reset(mode); const { prey, predator } = huntPair('coyote', 'rabbit');
    const random = Math.random; Math.random = g.rng = () => 0.99;
    try { g.wildlife.update(0.05); } finally { Math.random = random; }
    assert.ok(g.wildlife.agents.includes(prey));
    if (mode === 'challenging') {
      assert.equal(predator.hunger, 12); assert.equal(prey.state, 'walk');
      const initial = Math.hypot(prey.x - predator.x, prey.y - predator.y);
      g.wildlife.update(0.1); assert.ok(Math.hypot(prey.x - predator.x, prey.y - predator.y) > initial);
    } else {
      // Standard keeps its hunger rule; the surviving prey still bolts away from the predator.
      assert.equal(predator.hunger, 0); assert.equal(prey.state, 'flee');
      const initial = Math.hypot(prey.x - predator.x, prey.y - predator.y);
      g.wildlife.update(0.1); assert.ok(Math.hypot(prey.x - predator.x, prey.y - predator.y) > initial);
    }
  }
});
check('Fleeing fish cannot escape a pond across dry land', () => {
  reset(); const { i, fish } = pondPair(), w = g.world;
  for (let yy = 29; yy <= 31; yy++) for (let xx = 29; xx <= 31; xx++) w.terrain[w.idx(xx, yy)] = T.SOIL;
  w.terrain[i] = T.POND; g.rng = () => 0.99; g.wildlife.update(0.05);
  assert.ok(g.wildlife.agents.includes(fish)); assert.equal(fish.state, 'idle'); assert.equal(fish.path, null);
});
check('Hungry adult predators skip breeding and can leave despite otherwise abundant habitat', () => {
  function month(mode, hunger, age = 600) {
    reset(mode, 'serengeti'); g.day = 30; // Lion breeding month.
    const lions = [0, 1].map(() => g.wildlife.spawn(ANIMAL.lion, 30, 30, { silent: true, age }));
    lions.forEach(a => { a.hunger = hunger; });
    // Isolate food stress from habitat, prey capacity, and new arrivals.
    g.wildlife.computeSuitability = () => { for (const d of ANIMALS) g.wildlife.state[d.index].K = d.key === 'lion' ? 8 : 0; };
    g.wildlife.immigrate = () => 0; g.rng = () => 0.01; g.wildlife.monthly();
    return { births: g.wildlife.state[ANIMAL.lion.index].births, departing: lions.filter(a => a.leaving).length, foodDepartures: g.stats.foodDepartures || 0 };
  }
  const hungry = month('challenging', 40), fed = month('challenging', 0), standard = month('standard', 40);
  assert.equal(hungry.births, 0); assert.equal(hungry.departing, 2); assert.equal(hungry.foodDepartures, 2);
  assert.ok(fed.births > 0); assert.equal(fed.foodDepartures, 0);
  assert.ok(standard.births > 0); assert.equal(standard.foodDepartures, 0);
  const young = month('challenging', 40, 0);
  assert.equal(young.births, 0); assert.equal(young.foodDepartures, 0); assert.equal(young.departing, 0);
  assert.equal(hungryPredator(g, { sp: ANIMAL.lion.index, age: 0, hunger: 40 }), false);
});
check('Terrestrial predators and their prey both get actionable diagnostics, including hunger', () => {
  reset(); const { prey, predator } = huntPair('bobcat', 'rabbit'); predator.hunger = 40;
  const d = wildlifeDiagnostics(g, ANIMAL.bobcat);
  assert.ok(d.rows.some(r => r.key === 'predation')); assert.ok(d.rows.some(r => r.key === 'hunger'));
  assert.ok(wildlifeDiagnostics(g, ANIMAL.rabbit).rows.some(r => r.key === 'hunted'));
  const before = JSON.stringify({ agents: g.wildlife.agents, stats: g.stats, flags: g.flags });
  g.rng = () => { throw Error('Diagnostics consumed RNG'); }; wildlifeDiagnostics(g, ANIMAL.bobcat);
  assert.equal(JSON.stringify({ agents: g.wildlife.agents, stats: g.stats, flags: g.flags }), before);
  for (const r of d.rows.filter(r => ['predation', 'hunger'].includes(r.key))) {
    assert.notEqual(tr(r.title, 'es'), r.title); assert.notEqual(tr(r.text, 'es'), r.text);
  }
  assert.ok(g.wildlife.agents.includes(prey));
});
await check('New pressure state survives save/load and older saves still load', async () => {
  reset(); const i = tile(); sapling(i); g.rng = () => 0;
  browseSapling(g, browser(), ANIMAL.deer); TOOLS.mulch.apply(g, i); g.rng = mulberry32(7);
  const hunter = g.wildlife.spawn(ANIMAL.bobcat, 30, 30, { silent: true }); hunter.hunger = 42;
  const memory = new Map(); globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  const damage = g.world.browseDamage[i]; assert.equal(await g.save(), true); assert.equal(await g.load('pnw'), true);
  assert.equal(g.world.mulchDays[i], MULCH_DAYS); assert.equal(g.world.browseDamage[i], damage);
  assert.ok(hungryPredator(g, g.wildlife.agents.find(a => a.id === hunter.id)));
  assert.equal(g.stats.saplingsBrowsed, 1); assert.ok(g.flags.ecologyNotices.browse != null);
  const key = Game.saveKey('pnw'), old = JSON.parse(memory.get(key));
  delete old.world.arrays.mulchDays; delete old.world.arrays.browseDamage; memory.set(key, JSON.stringify(old));
  assert.equal(await g.load('pnw'), true); assert.equal(g.world.mulchDays, undefined); assert.equal(g.world.browseDamage, undefined);
});
check('Undo refunds mulch and restores both initial and renewed protection', () => {
  reset(); const i = tile(), undo = new Undo(g), tool = TOOLS.mulch, money = g.money;
  function stroke() { undo.begin(tool); undo.touch(i); assert.equal(tool.apply(g, i), true); g.spend(tool.cost, tool.cat); undo.end({ count: 1, cost: tool.cost }); }
  stroke(); assert.equal(g.world.mulchDays[i], MULCH_DAYS); undo.undo(); assert.equal(g.world.mulchDays[i], 0); assert.equal(g.money, money);
  g.world.mulchDays[i] = 20; stroke(); undo.undo(); assert.equal(g.world.mulchDays[i], 20); assert.equal(g.money, money);
});
check('Challenging diagnostics and mulch countdown retain Spanish support', () => {
  reset('challenging', 'chinandega');
  for (const def of ANIMALS) for (const r of wildlifeDiagnostics(g, def).rows.filter(r => ['browsing', 'predation', 'hunted'].includes(r.key))) {
    assert.notEqual(tr(r.title, 'es'), r.title); assert.notEqual(tr(r.text, 'es'), r.text);
  }
  assert.notEqual(tr('Mulch establishment protection: 45 days remaining.', 'es'), 'Mulch establishment protection: 45 days remaining.');
  for (const advice of Object.values(CHALLENGE_TOOL_ADVICE)) assert.notEqual(tr(advice, 'es'), advice);
});
console.log(`${checks} Challenging ecology checks passed.`);
