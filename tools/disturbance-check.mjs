// Patch disturbance (docs/decisions/0028-succession-dynamics.md §4, sim/disturbance.js): windstorms,
// drought and root rot kill through removeTree, follow the map's data and the campaign's gate, and save.
//   node tools/disturbance-check.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { World } = await import('../js/world.js');
const { setBiome } = await import('../js/biome.js');
const { PLANT } = await import('../js/data/plants.js');
const { treeHazard, removeTree } = await import('../js/sim/plants.js');
const { windfirm, windKillChance, windstorm, droughtLevel, rotMonth } = await import('../js/sim/disturbance.js');
const { assertMapDefinition } = await import('../js/data/contracts.js');
const { mulberry32 } = await import('../js/rng.js');
const { F, DAYS_PER_MONTH } = await import('../js/config.js');
const { default: pnw } = await import('../js/maps/pnw.js');

let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }

// A small closed forest of one species, every tree grown.
function forest(key = 'fir', size = 15, moist = 0.6) {
  setBiome('pnw');
  const w = new World(size, size);
  w.moist.fill(moist); w.soil.fill(0.8);
  for (let i = 0; i < w.n; i++) w.setPlant(i, PLANT[key], 1, 120 * 80);
  return { world: w, catalog: w.catalog, rng: mulberry32(7), diff: { disasters: 1 }, stats: {}, flags: {}, day: 1, month: 9, dryStreak: 0 };
}

check('Windfirmness comes from traits unless a plant overrides it', () => {
  setBiome('pnw');
  assert.equal(windfirm(PLANT.maple), 0.5, 'a broadleaf of ordinary ground');
  assert.ok(Math.abs(windfirm({ ...PLANT.fir, windfirm: undefined }) - 0.45) < 1e-9, 'a conifer catches more wind; a long-lived one roots deeper');
  assert.equal(windfirm(PLANT.fir), 0.6, 'unless its data says otherwise (Douglas-fir, deep-rooted, 0027)');
  assert.ok(Math.abs(windfirm(PLANT.cedar) - 0.35) < 1e-9, 'a conifer of wet ground less still (redcedar, set in its data since 0027 widened its moisture range)');
  assert.ok(Math.abs(windfirm(PLANT.alder) - 0.5) < 1e-9);
  assert.ok(Math.abs(windfirm(PLANT.oak) - 0.6) < 1e-9, 'long-lived, deep-rooted oak more');
  assert.equal(windfirm({ ...PLANT.fir, windfirm: 0.9 }), 0.9, 'override');
});

check('A storm throws big trees at gap edges and on wet ground, and leaves saplings standing', () => {
  const g = forest(), w = g.world, mid = w.idx(7, 7), p = PLANT.fir;
  const inside = windKillChance(w, mid, p, 0.6);
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0]]) removeTree(w, w.idx(7 + dx, 7 + dy), 'player', g.rng, { deadwood: false });
  const edge = windKillChance(w, mid, p, 0.6);
  assert.ok(edge > inside * 1.5, `edge ${edge} > inside ${inside}`);
  const wet = (w.moist[mid] = 0.9, windKillChance(w, mid, p, 0.6));
  assert.ok(wet > edge, 'saturated soil');
  w.treeG[mid] = 0.25; assert.equal(windKillChance(w, mid, p, 1), 0, 'a sapling bends');
});

check('A windstorm kills through removeTree as wind, releases waiting saplings and brings snags down', () => {
  const g = forest(), w = g.world;
  for (let i = 0; i < w.n; i += 3) { w.understory[i] = PLANT.hemlock.id; w.understoryG[i] = 0.2; }
  removeTree(w, w.idx(2, 2), 'player', g.rng, { deadwood: false }); w.feature[w.idx(2, 2)] = F.SNAG;
  const r = windstorm(g, { name: 'A test gale', months: [9], perYear: 1, patch: [225, 225], severity: 1 });
  assert.ok(r.killed > 20, `killed ${r.killed}`);
  assert.equal(w.treeDeaths.wind, r.killed, 'counted as wind');
  assert.equal(w.treeDeathsEst.wind, r.established);
  assert.ok((r.released.hemlock || 0) > 0 && w.understoryReleased.hemlock === r.released.hemlock, 'released hemlock reported');
  let logs = 0, hemlock = 0;
  for (let i = 0; i < w.n; i++) { if (w.feature[i] === F.LOG) logs++; if (w.tree[i] === PLANT.hemlock.id) hemlock++; if (w.understory[i]) assert.ok(w.tree[i], 'no understory without a tree'); }
  assert.ok(logs >= r.established * 0.6, 'wind leaves mostly logs');
  assert.equal(hemlock, r.released.hemlock, 'released saplings hold the tiles');
  assert.equal(w.feature[w.idx(2, 2)], F.LOG, 'the snag fell (severity 1)');
  // the same seed gives the same storm
  const a = forest(), b = forest();
  const ra = windstorm(a, { patch: [40, 40], severity: 0.6 }), rb = windstorm(b, { patch: [40, 40], severity: 0.6 });
  assert.deepEqual(ra, rb); assert.deepEqual(a.world.tree, b.world.tree);
});

check('Drought raises the hazard only for trees near the dry end of their range, after the threshold', () => {
  const g = forest('fir', 5, 0.15), w = g.world, i = w.idx(2, 2), p = PLANT.fir; // fir: moist [0.1, 0.75]
  const cfg = { threshold: 36, span: 10, severity: 1 };
  g.dryStreak = 30; assert.equal(droughtLevel(g, cfg), 0);
  g.dryStreak = 41; assert.equal(droughtLevel(g, cfg), 0.5);
  g.dryStreak = 60; assert.equal(droughtLevel(g, cfg), 1);
  g.diff.disasters = 0.5; assert.equal(droughtLevel(g, cfg), 0.5, 'scaled by disasters');
  assert.equal(droughtLevel(g, undefined), 0, 'no regime, no drought');
  const base = treeHazard(w, i, p, 1, 1, 50, {}).h;
  w.drought = 1;
  const dry = treeHazard(w, i, p, 1, 1, 50, {});
  assert.ok(dry.drought > 0.5 && Math.abs(dry.h - base - dry.drought) < 1e-9, 'at the dry end');
  w.moist[i] = 0.5;
  assert.equal(treeHazard(w, i, p, 1, 1, 50, {}).drought, 0, 'in the middle of its range');
});

check('Root rot spreads only through its host, kills grown hosts as pathogen, and fades without one', () => {
  const g = forest('fir', 11), w = g.world, cfg = { host: ['fir'], perYear: 0, spread: 12, kill: 0 };
  for (let x = 0; x < 11; x++) for (let y = 6; y < 11; y++) w.setPlant(w.idx(x, y), PLANT.maple, 1, 120 * 80); // a maple stand to the south
  w.rot[w.idx(5, 2)] = 255;
  for (let k = 0; k < 40; k++) rotMonth(g, cfg);
  let firRot = 0, mapleRot = 0;
  for (let i = 0; i < w.n; i++) if (w.rot[i]) { if (w.tree[i] === PLANT.fir.id) firRot++; else mapleRot++; }
  assert.ok(firRot > 20, `spread through the firs (${firRot})`);
  assert.equal(mapleRot, 0, 'never into maple');
  cfg.kill = 12; // (a grown host dies within the month)
  const r = rotMonth(g, cfg);
  assert.ok(r.killed > 0 && w.treeDeaths.pathogen === r.killed, 'killed as pathogen');
  const i = w.idx(5, 2); if (w.tree[i]) removeTree(w, i, 'player', g.rng, { deadwood: false }); w.rot[i] = 10; cfg.kill = 0; cfg.spread = 0;
  for (let k = 0; k < 10; k++) rotMonth(g, cfg);
  assert.equal(w.rot[i], 0, 'fades from dead roots');
  // it fades even under a grown host: every patch heals in the end
  w.setPlant(i, PLANT.fir, 0.9, 120 * 80); w.rot[i] = 2;
  rotMonth(g, cfg); rotMonth(g, cfg); assert.equal(w.rot[i], 0, 'a grown host does not keep it alive');
});

check('Root rot saves and loads, and older saves load with none', () => {
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw');
  const i = g.world.tree.findIndex((id, j) => id && g.world.treeG[j] > 0.5);
  g.world.rot[i] = 200;
  const data = g.saveData(), restored = new Game();
  assert.equal(restored.restoreSave(structuredClone(data)), true);
  assert.equal(restored.world.rot[i], 200);
  delete data.world.arrays.rot;
  const old = new Game(); assert.equal(old.restoreSave(data), true);
  assert.equal(old.world.rot.length, old.world.n); assert.equal(old.world.rot.some(Boolean), false);
});

check('Storms wait for the campaign chapter that brings disasters, and run from the start in free play', () => {
  const storms = (mode) => {
    const g = new Game(); g.newGame(1987, mode, 'standard', 'pnw');
    g.day = DAYS_PER_MONTH * 9 + 1; assert.equal(g.month, 9); g.rng = () => 0; // (a storm every day it may)
    for (let k = 0; k < 3; k++) g.events.daily();
    return g.stats.storms || 0;
  };
  assert.equal(storms('campaign'), 0, 'campaign, chapter 1');
  assert.ok(storms('free') > 0, 'free play');
});

check('The data contract checks disturbance regimes', () => {
  assert.doesNotThrow(() => assertMapDefinition(pnw));
  const bad = d => assert.throws(() => assertMapDefinition({ ...pnw, disturbance: d }));
  bad({ storm: [] });
  bad({ storms: [{ name: 'x', months: [13], perYear: 1, patch: [1, 2], severity: 0.5 }] });
  bad({ storms: [{ name: 'x', months: [1], perYear: 1, patch: [5, 2], severity: 0.5 }] });
  bad({ storms: [{ name: 'x', months: [1], perYear: 1, patch: [1, 2], severity: 2 }] });
  bad({ drought: { span: 3 } });
  bad({ pathogen: { host: ['fir'], perYear: 0.1, spread: 0.1 } }); // (no news or note)
});

console.log(`${checks} disturbance checks passed.`);
