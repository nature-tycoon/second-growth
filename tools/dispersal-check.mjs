// Seed dispersal (docs/decisions/0017-succession-dynamics.md §6, sim/plants.js): a tree's seed
// mostly lands near it but a trait-derived share goes far, on a fat tail; seed from beyond the map
// edges falls off with depth instead of stopping at a band; a forest beyond an edge rains its native
// trees' seed in along the whole edge; and a rotten log carries fire less than a sound one.
//   node tools/dispersal-check.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { World } = await import('../js/world.js');
const { setBiome } = await import('../js/biome.js');
const { PLANT } = await import('../js/data/plants.js');
const { updatePlants, removeTree, seedRain, farSeed, forestTrees, DECAY } = await import('../js/sim/plants.js');
const { assertMapDefinition } = await import('../js/data/contracts.js');
const { mulberry32 } = await import('../js/rng.js');
const { T, F } = await import('../js/config.js');

let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const near = (a, b) => Math.abs(a - b) < 1e-9;

function plot(map, size) {
  setBiome(map);
  const w = new World(size, size);
  w.terrain.fill(T.SOIL); w.moist.fill(0.5); w.baseMoist.fill(0.5); w.soil.fill(0.6); w.distWater.fill(10); w.distLog.fill(255);
  return { world: w, catalog: w.catalog, month: 2, rng: mulberry32(7), diff: {}, flags: {}, stats: {}, frugivoreCount: 0 };
}
// Every tree on the plot other than tile `keep`: its distance from `from`, then it's cleared.
function harvest(g, keep, measure) {
  const w = g.world;
  for (let i = 0; i < w.n; i++) if (w.tree[i] && i !== keep) { measure(i); removeTree(w, i, 'player', g.rng, { deadwood: false }); }
}

check('The far share comes from how a tree spreads its seed, unless a plant overrides it', () => {
  setBiome('pnw');
  assert.ok(near(farSeed(PLANT.fir, 0, false), 0.025), 'winged seed, radius 5: 0.02 × 5/4');
  assert.ok(near(farSeed(PLANT.hemlock, 0, false), 0.02), 'winged seed, radius 4');
  assert.ok(farSeed(PLANT.cottonwood, 0, false) > farSeed(PLANT.maple, 0, false), 'cottonwood fluff goes further than a maple samara');
  assert.equal(farSeed(PLANT.salal, 5, false), 0, 'shrubs keep their near spread');
  assert.equal(farSeed(PLANT.swordfern, 5, false), 0, 'and groundcover');
  assert.equal(farSeed({ ...PLANT.fir, farSeed: 0.1 }, 0, false), 0.1, 'override');
  setBiome('amazon');
  assert.ok(farSeed(PLANT.inga, 3, false) > farSeed(PLANT.inga, 0, false), 'fruit goes far while birds and bats visit');
  assert.ok(farSeed(PLANT.inga, 0, false) > 0, 'and a little without them');
  assert.ok(farSeed(PLANT.brazilnut, 0, true) > 0, 'agoutis cache some Brazil nuts far off');
  assert.equal(farSeed(PLANT.brazilnut, 0, false), 0, 'and without agoutis none go far');
});

check('Most seed lands near the tree, a few go far, on a fat tail', () => {
  const g = plot('pnw', 101), w = g.world, c = 50 * 101 + 50, p = PLANT.maple;
  const spread = p.spread; p.spread = 1; // (one seeding a day, to count enough of them)
  const d = [];
  try {
    for (let day = 0; day < 4000; day++) {
      w.setPlant(c, p, 1, 120 * 40);
      updatePlants(g);
      harvest(g, c, i => d.push(Math.max(Math.abs(i % 101 - 50), Math.abs(((i / 101) | 0) - 50))));
    }
  } finally { p.spread = spread; }
  const beyond = k => d.filter(v => v > k).length / d.length;
  assert.ok(d.length > 1000, `enough recruits (${d.length})`);
  assert.ok(beyond(p.radius + 1) > 0.004 && beyond(p.radius + 1) < 0.03, `about the far share (${farSeed(p, 0, false)}) lands beyond the radius: ${beyond(p.radius + 1).toFixed(4)}`);
  assert.ok(d.some(v => v > 5 * p.radius), 'some reach several times the radius');
});

check('Seed from beyond an edge falls off with depth, with no hard band, for trees only', () => {
  const g = plot('pnw', 80), w = g.world, def = g.catalog.definition;
  const saved = { seedRain: def.seedRain, forestRain: def.forestRain };
  const rows = { tree: [], shrub: [] };
  try {
    def.seedRain = { N: ['maple', 'salal'] }; def.forestRain = undefined;
    for (let day = 0; day < 20000; day++) {
      seedRain(g);
      for (let i = 0; i < w.n; i++) {
        if (w.tree[i]) { rows.tree.push((i / 80) | 0); removeTree(w, i, 'player', g.rng, { deadwood: false }); }
        if (w.shrub[i]) { rows.shrub.push((i / 80) | 0); w.shrub[i] = 0; w.shrubG[i] = 0; }
      }
    }
  } finally { Object.assign(def, saved); }
  const deep = (a, k) => a.filter(v => v >= k).length / a.length;
  assert.ok(rows.tree.length > 50 && rows.shrub.length > 50, `enough of both (${rows.tree.length} trees, ${rows.shrub.length} shrubs)`);
  assert.ok(deep(rows.tree, 2) < 0.6, 'most tree seed lands near the edge');
  assert.ok(rows.tree.some(v => v >= 16), 'some lands well inside');
  assert.equal(deep(rows.shrub, PLANT.salal.radius + 4), 0, 'shrub seed stays in the near band');
});

check('A forest beyond an edge rains its native trees in along the edge; invasive trees and shrubs keep to the edge tries', () => {
  setBiome('atlanta');
  const atl = new World(4, 4).catalog;
  const n = forestTrees(atl, 'N').map(p => p.key);
  assert.ok(n.includes('whiteoak') && n.includes('redmaple'), 'native trees of the north woods');
  assert.ok(!n.includes('dogwood') || PLANT.dogwood.layer === 2, 'only trees');
  assert.ok(!forestTrees(atl, 'E').some(p => p.invasive), 'no callery pear: the neighbours\' yards are not a stand');
  const g = plot('pnw', 60), w = g.world, def = g.catalog.definition;
  const saved = { seedRain: def.seedRain, forestRain: def.forestRain };
  const count = rain => {
    def.seedRain = { N: ['hemlock', 'salal'] }; def.forestRain = rain;
    g.rng = mulberry32(3); let k = 0;
    for (let day = 0; day < 2000; day++) {
      seedRain(g);
      for (let i = 0; i < w.n; i++) if (w.tree[i]) { k++; removeTree(w, i, 'player', g.rng, { deadwood: false }); }
    }
    return k;
  };
  let without, withRain;
  try { without = count(undefined); withRain = count({ N: 0.01 }); } finally { Object.assign(def, saved); }
  assert.ok(withRain > 3 * without, `far more tree seed with the forest, even against an edge list of one tree (${withRain} against ${without})`);
  assert.doesNotThrow(() => assertMapDefinition({ ...def, forestRain: { N: 0.01, E: 0.02 } }, 'pnw'));
  assert.throws(() => assertMapDefinition({ ...def, forestRain: { X: 0.01 } }, 'pnw'), /forestRain/);
  assert.throws(() => assertMapDefinition({ ...def, forestRain: { N: 2 } }, 'pnw'), /forestRain/);
});

check('A rotten log carries fire less than a sound one; a snag as before', () => {
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw');
  const w = g.world;
  let i = 0; while (w.struct[i] >= 0) i++;
  w.terrain[i] = T.SOIL; w.flood[i] = 0; w.ground[i] = 0; w.shrub[i] = 0; w.moist[i] = 0.2;
  if (w.tree[i]) removeTree(w, i, 'player', g.rng, { deadwood: false });
  w.feature[i] = 0; const bare = g.events.fuel(w, i);
  w.feature[i] = F.LOG; w.featureAge[i] = 0; const sound = g.events.fuel(w, i);
  w.featureAge[i] = DECAY.rotten * 120; const rotten = g.events.fuel(w, i);
  w.feature[i] = F.SNAG; w.featureAge[i] = DECAY.rotten * 120; const snag = g.events.fuel(w, i);
  assert.ok(sound > rotten && rotten > bare, `sound ${sound.toFixed(2)} > rotten ${rotten.toFixed(2)} > bare ${bare.toFixed(2)}`);
  assert.ok(near(snag, sound), 'a snag is fuel whatever its rot');
});

console.log(`${checks} dispersal checks passed.`);
