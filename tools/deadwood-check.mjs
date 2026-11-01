// Deadwood (docs/decisions/0028-succession-dynamics.md §5, sim/plants.js): snags and logs rot at a
// pace set by their wood and the ground, pass through decay classes, act as nurse logs, come down in
// storms and fires, feed insects, and save what they were.
//   node tools/deadwood-check.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { World } = await import('../js/world.js');
const { setBiome } = await import('../js/biome.js');
const { PLANT } = await import('../js/data/plants.js');
const { updatePlants, removeTree, trySeed, plantSuit, woodDecay, moistDecay, decayRate, rottenLog, nurseBonus, DECAY } = await import('../js/sim/plants.js');
const { classifyAndResources, updateCanopy } = await import('../js/sim/environment.js');
const { windstorm } = await import('../js/sim/disturbance.js');
const { assertMapDefinition } = await import('../js/data/contracts.js');
const { TOOLS } = await import('../js/tools.js');
const { mulberry32 } = await import('../js/rng.js');
const { T, F } = await import('../js/config.js');
const { default: pnw } = await import('../js/maps/pnw.js');

let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const near = (a, b) => Math.abs(a - b) < 1e-9;

function plot(map = 'pnw', moist = 0.5, size = 9) {
  setBiome(map);
  const w = new World(size, size);
  w.terrain.fill(T.SOIL); w.moist.fill(moist); w.baseMoist.fill(moist); w.soil.fill(0.6); w.distWater.fill(10); w.distLog.fill(255);
  return { world: w, catalog: w.catalog, month: 4, rng: () => 1, diff: {}, flags: {}, stats: {} };
}
// A grown tree of `key` on tile i dies of old age and leaves a log (or a snag).
function deadTree(w, i, key, snag = false) {
  w.setPlant(i, PLANT[key], 1, 120 * 80);
  removeTree(w, i, 'age', () => 0.5, { snagOdds: snag ? 1 : 0 });
  assert.equal(w.feature[i], snag ? F.SNAG : F.LOG); assert.equal(w.deadwoodId[i], PLANT[key].id, 'it remembers what it was');
}
// Days until the snag or log on tile i changes class (or goes), with the daily rolls always passing.
function daysTo(g, i, done) { let d = 0; while (!done() && d < 120 * 400) { updatePlants(g); d++; } return d; }

check('Wood decay comes from traits unless a plant overrides it', () => {
  setBiome('pnw');
  assert.equal(woodDecay(PLANT.maple), 1, 'a hardwood');
  assert.ok(near(woodDecay(PLANT.fir), 0.6), 'a conifer rots slower');
  assert.ok(near(woodDecay(PLANT.cedar), 0.35), 'redcedar heartwood rots slowest of all (override)');
  assert.ok(near(woodDecay(PLANT.hemlock), 0.85), 'hemlock wood is not durable (override)');
  assert.equal(woodDecay(null), 1, 'player and map deadwood: a typical hardwood');
  assert.equal(woodDecay({ ...PLANT.maple, decay: 2 }), 2);
});

check('Ground water sets the pace: dry slow, damp fast up to a limit, waterlogged slowest', () => {
  const w = plot().world, i = 0;
  const at = m => (w.moist[i] = m, moistDecay(w, i));
  assert.ok(near(at(0.5), 1), 'typical forest floor');
  assert.ok(at(0.2) < at(0.4) && at(0.4) < at(0.6), 'wetter rots faster');
  assert.equal(at(0.7), at(0.95), 'up to a limit');
  const dry = at(0.2); w.moist[i] = 0.7;
  for (const t of [T.POND, T.MARSH, T.MUD]) { w.terrain[i] = t; assert.ok(moistDecay(w, i) < dry, 'waterlogged: short of air'); }
  w.terrain[i] = T.SOIL; w.waterDepth = new Float32Array(w.n); w.waterDepth[i] = 0.3; assert.ok(moistDecay(w, i) < 0.5, 'standing water');
});

check('A log goes sound, rotten, then gone, at its own pace, feeding the soil as it rots', () => {
  const run = (key, moist) => {
    const g = plot('pnw', moist), w = g.world, i = w.idx(4, 4);
    deadTree(w, i, key); g.rng = () => 0; // (every roll passes: the classes run on rot alone)
    const soil0 = w.soil[i];
    const rotten = daysTo(g, i, () => rottenLog(w, i));
    const gone = rotten + daysTo(g, i, () => !w.feature[i]);
    assert.equal(w.deadwoodId[i], 0, 'cleared with the log');
    return { rotten, gone, soil: w.soil[i] - soil0 };
  };
  const maple = run('maple', 0.5), fir = run('fir', 0.5), dryFir = run('fir', 0.3), cedar = run('cedar', 0.5);
  assert.ok(Math.abs(maple.rotten - DECAY.rotten * 120) <= 1 && Math.abs(maple.gone - DECAY.gone * 120) <= 2, `maple on damp ground is the reference: ${maple.rotten}, ${maple.gone}`);
  assert.ok(fir.gone > maple.gone * 1.5 && dryFir.gone > fir.gone && cedar.gone > fir.gone, `${maple.gone} < fir ${fir.gone} < dry fir ${dryFir.gone}; cedar ${cedar.gone}`);
  assert.ok(maple.soil > 0.3 && Math.abs(fir.soil - maple.soil) < 0.05, `the same wood goes back into the soil however fast: ${maple.soil.toFixed(3)}, ${fir.soil.toFixed(3)}`);
});

check('A snag stands its time, then falls as a sound log that keeps its species', () => {
  const g = plot(), w = g.world, i = w.idx(4, 4);
  deadTree(w, i, 'fir', true); g.rng = () => 0;
  const d = daysTo(g, i, () => w.feature[i] === F.LOG);
  assert.ok(Math.abs(d - DECAY.snagFall * 120 / 0.6) <= 2, `a fir snag on damp ground stands ${(d / 120).toFixed(1)} years`);
  assert.equal(w.featureAge[i], 0, 'a sound log'); assert.equal(w.deadwoodId[i], PLANT.fir.id);
});

check('The savanna keeps its quick timers, and the reef its rubble', () => {
  const g = plot('serengeti', 0.3), w = g.world, i = w.idx(4, 4);
  const key = Object.values(PLANT).find(p => p && p.layer === 2 && !p.invasive).key;
  w.setPlant(i, PLANT[key], 1, 120 * 20); removeTree(w, i, 'age', () => 0, { snagOdds: 10 }); // (×0.35 on the savanna)
  assert.equal(w.feature[i], F.SNAG); g.rng = () => 0;
  assert.equal(daysTo(g, i, () => w.feature[i] === F.LOG), 2 * 120 + 1, 'down after two years, as before');
  assert.equal(daysTo(g, i, () => !w.feature[i]), 4 * 120 + 1, 'gone after four');
  const r = plot('reef', 1), rw = r.world, j = rw.idx(4, 4);
  const coral = Object.values(PLANT).find(p => p && p.layer === 2);
  rw.setPlant(j, coral, 1, 120 * 20); removeTree(rw, j, 'stress', () => 0);
  assert.equal(rw.feature[j], 0, 'dead coral leaves rubble, not a log'); assert.equal(rw.deadwoodId[j], 0);
});

check('Nurse logs: hemlock and redcedar take best on a rotten log, then a sound one or beside one', () => {
  const g = plot('pnw', 0.5), w = g.world, i = w.idx(4, 4), p = PLANT.hemlock;
  assert.ok(PLANT.cedar.nurse && p.nurse && !PLANT.fir.nurse);
  w.shrub.fill(0); w.ground.fill(0);
  const bare = plantSuit(w, i, p);
  w.distLog[i] = 1; const beside = plantSuit(w, i, p);
  deadTree(w, i, 'fir'); w.distLog[i] = 0; const sound = plantSuit(w, i, p);
  w.featureAge[i] = DECAY.rotten * 120; const rotten = plantSuit(w, i, p);
  assert.ok(nurseBonus(w, i) > 0.3 && bare < beside && beside <= sound && sound < rotten, `${bare} < ${beside} <= ${sound} < ${rotten}`);
  assert.equal(plantSuit(w, i, PLANT.fir), plantSuit(w, w.idx(1, 1), PLANT.fir), 'no bonus for other trees');
});

check('A nurse-log seedling up on a rotten log clears a thick sward, and waits in the understory there', () => {
  const g = plot('pnw', 0.55), w = g.world, i = w.idx(4, 4), grass = Object.values(PLANT).find(p => p && p.layer === 0 && p.look.type === 'grass');
  for (let j = 0; j < w.n; j++) { w.ground[j] = grass.id; w.groundG[j] = 0.9; }
  const p = PLANT.hemlock;
  deadTree(w, i, 'fir'); w.distLog[i] = 0;
  // odds at the final roll: a draw just under the suitability passes on bare ground; the sward cuts it to 0.3 of that
  const s = plantSuit(w, i, p);
  w.featureAge[i] = 0; assert.equal(trySeed(w, p, i, () => plantSuit(w, i, p) * 0.5), false, 'a sound log: the sward holds it back');
  w.featureAge[i] = DECAY.rotten * 120; assert.equal(trySeed(w, p, i, () => s * 0.5), true, 'a rotten log: above the grass');
  // under a tree growing out of the rotten log
  w.tree[i] = 0; for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) w.setPlant(w.idx(x, y), PLANT.maple, 1, 30 * 120);
  updateCanopy(w, 4);
  assert.equal(trySeed(w, p, i, () => 0), true); assert.equal(w.understory[i], p.id);
});

check('Wind and fire bring snags down as sound logs; a fire leaves the trees it just killed standing', () => {
  const g = plot('pnw', 0.6, 15), w = g.world; Object.assign(g, { rng: mulberry32(3), diff: { disasters: 1 }, day: 1, month: 9 });
  for (let i = 0; i < w.n; i++) w.setPlant(i, PLANT.fir, 1, 120 * 80);
  const s = w.idx(2, 2); removeTree(w, s, 'age', () => 0, { snagOdds: 1 }); w.featureAge[s] = 500;
  windstorm(g, { name: 'A test gale', months: [9], perYear: 1, patch: [225, 225], severity: 1 });
  assert.equal(w.feature[s], F.LOG); assert.equal(w.featureAge[s], 0); assert.equal(w.deadwoodId[s], PLANT.fir.id);
  // fire
  const game = new Game(); game.newGame(1987, 'free', 'standard', 'pnw');
  const fw = game.world, ev = game.events, idx = [...fw.tree.keys()].filter(j => !fw.feature[j] && fw.terrain[j] === T.SOIL).slice(0, 400);
  for (const j of idx) { fw.feature[j] = F.SNAG; fw.deadwoodId[j] = PLANT.fir.id; fw.featureAge[j] = 0; }
  game.rng = () => 0; for (const j of idx.slice(0, 200)) ev.burnFeaturesAndWildlife(j);
  assert.ok(idx.slice(0, 200).every(j => fw.feature[j] === F.SNAG), 'fresh snags stand');
  for (const j of idx.slice(200)) fw.featureAge[j] = DECAY.snagFall * 120 + 1;
  for (const j of idx.slice(200)) ev.burnFeaturesAndWildlife(j);
  assert.ok(idx.slice(200).every(j => fw.feature[j] === F.LOG && fw.featureAge[j] === 0 && fw.deadwoodId[j] === PLANT.fir.id), 'old snags burn through and fall');
});

check('Insects: a rotten log feeds more of them than a sound one; logs still count for shelter', () => {
  const g = plot(), w = g.world, a = w.idx(2, 2), b = w.idx(6, 6);
  deadTree(w, a, 'maple'); deadTree(w, b, 'maple'); w.featureAge[b] = DECAY.rotten * 120;
  classifyAndResources(w, 4);
  assert.ok(w.insects[b] > w.insects[a] && w.insects[a] > 0, `${w.insects[a]} < ${w.insects[b]}`);
  assert.equal(w.stats.logs, 2, 'both are logs');
});

check('Player-placed deadwood is unknown wood; what a log was saves and loads, and older saves load as unknown', () => {
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw');
  const w = g.world, i = w.tree.findIndex((id, j) => id && w.treeG[j] > 0.7 && !w.feature[j]);
  removeTree(w, i, 'age', () => 0, { snagOdds: 0 }); const was = w.deadwoodId[i]; assert.ok(was);
  const j = w.feature.findIndex((f, k) => !f && !w.tree[k] && w.struct[k] < 0 && (w.terrain[k] === T.FIELD || w.terrain[k] === T.PASTURE)); assert.ok(j >= 0);
  w.deadwoodId[j] = was; assert.equal(TOOLS.log.apply(g, j), true); assert.equal(w.deadwoodId[j], 0, 'a placed log');
  const data = g.saveData(), restored = new Game();
  assert.equal(restored.restoreSave(structuredClone(data)), true);
  assert.equal(restored.world.deadwoodId[i], was); assert.equal(restored.world.feature[i], F.LOG);
  delete data.world.arrays.deadwoodId;
  const old = new Game(); assert.equal(old.restoreSave(data), true);
  assert.equal(old.world.deadwoodId.length, old.world.n); assert.equal(old.world.deadwoodId.some(Boolean), false);
  assert.ok(near(decayRate(old.world, i), moistDecay(old.world, i)), 'rots as a typical hardwood');
});

check('The data contract checks deadwood settings', () => {
  assert.doesNotThrow(() => assertMapDefinition({ ...pnw, deadwood: { decay: 1.5 } }));
  assert.throws(() => assertMapDefinition({ ...pnw, deadwood: { decay: 0 } }));
  assert.throws(() => assertMapDefinition({ ...pnw, deadwood: { rate: 1 } }));
});

console.log(`${checks} deadwood checks passed.`);
