// Wire tree guards (js/sim/tree-guard.js, ideas phone-creeks-fish s10), headless:
//   - planting a tree marks it PLANTED; the guard tool puts a guard on it, at its price, and an undo takes it off
//   - beavers chewing round a mixed stand cut unguarded trees and leave guarded ones, and the guards are
//     offered once, on the first planted tree they cut (flags.guardOffered, the 'guardOffer' event)
//   - browsers leave a guarded sapling alone: a hard-grazed sward (updatePlants), deer browse on the
//     ecology difficulty (browseSapling); rubSapling skips a guarded tree the same way (not run here: it needs the rut)
//   - the guard comes off by itself at GUARD_YEARS of the tree's age, and goes with its tree
//   - save/load keeps it, and a guard never outlives its tree on load
//   node tools/tree-guard-check.mjs
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const root = new URL('../js/', import.meta.url).href;
const { Game } = await import(root + 'game.js');
const { ToolActions } = await import(root + 'tool-actions.js');
const { Undo } = await import(root + 'undo.js');
const { DAYS_PER_YEAR } = await import(root + 'config.js');
const { plantSuit, updatePlants, removeTree } = await import(root + 'sim/plants.js');
const { browseSapling } = await import(root + 'sim/ecological-pressure.js');
const { PLANTED, GUARDED, GUARD_YEARS, GUARD_COST } = await import(root + 'sim/tree-guard.js');

const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw', 7);
const w = g.world, undo = new Undo(g), act = new ToolActions(g, { undo });
assert.ok(g.catalog.tools.guard, 'the guard tool is there on PNW');

// a stand of alder planted on open ground the player then guards every other tree of
const alder = g.catalog.plant.alder;
const open = [];
for (let i = 0; i < w.n && open.length < 400; i++) if (!w.tree[i] && w.struct[i] < 0 && !w.feature[i] && plantSuit(w, i, alder) > 0.5) open.push(i);
act.apply('plant_alder', open);
const stand = open.filter(i => w.tree[i]);
assert.ok(stand.length >= 60, `a stand to test on (${stand.length})`);
assert.ok(stand.every(i => w.guard[i] === PLANTED), 'a tree the player plants is marked PLANTED');
const caged = stand.filter((_, k) => k % 2 === 0), bare = stand.filter((_, k) => k % 2 === 1);
let money = g.money;
assert.equal(act.apply('guard', caged)?.count, caged.length, 'the guard tool guards each tree brushed');
assert.equal(Math.round(money - g.money), caged.length * GUARD_COST, `at $${GUARD_COST} a tree`);
assert.ok(caged.every(i => w.guard[i] === GUARDED) && bare.every(i => w.guard[i] === PLANTED), 'only the brushed ones');
assert.equal(act.apply('guard', caged)?.count ?? 0, 0, 'a guarded tree takes no second guard');
undo.undo(null);
assert.ok(caged.every(i => w.guard[i] === PLANTED), 'an undo takes the guards off again');
assert.ok(Math.abs(g.money - money) < 1, 'and gives the money back');
act.apply('guard', caged);

// beavers: a colony chewing round the stand for a long while, the trees grown into beaver size
const beaverIdx = g.catalog.animals.findIndex(d => d.key === 'beaver');
assert.ok(beaverIdx >= 0, 'PNW has beavers');
for (const i of stand) { w.treeG[i] = 0.5; w.treeAge[i] = DAYS_PER_YEAR; }
let offers = 0; g.on('guardOffer', () => offers++);
const W = g.wildlife;
for (let n = 0; n < 6000; n++) {
  const i = stand[n % stand.length], x = i % w.w, y = (i / w.w) | 0;
  W.beaverDay({ sp: beaverIdx, x: x + 0.5, y: y + 0.5 }, x, y, i);
  if (g.wildlife.dams) break;
}
const cut = bare.filter(i => !w.tree[i] || w.treeG[i] !== 0.5).length;
assert.ok(caged.every(i => w.tree[i] === alder.id && w.guard[i] === GUARDED), 'no guarded tree is cut by beavers');
assert.ok(cut >= bare.length * 0.5, `beavers cut most unguarded trees (${cut} of ${bare.length})`);
assert.equal(g.flags.guardOffered, true, 'the guards are offered once beavers cut a planted tree');
assert.equal(offers, 1, `offered once (${offers})`);
assert.ok(bare.every(i => w.tree[i] || !w.guard[i]), 'a cut tree takes its mark with it');
console.log(`  beavers: ${cut} of ${bare.length} unguarded trees cut, 0 of ${caged.length} guarded`);

// browsers: a hard-grazed sward over seedlings, every day for a year
const fresh = open.filter(i => !w.tree[i]).slice(0, 60);
act.apply('plant_alder', fresh);
const young = fresh.filter(i => w.tree[i]);
act.apply('guard', young.filter((_, k) => k % 2 === 0));
const yG = young.filter(i => w.guard[i] === GUARDED), yB = young.filter(i => w.guard[i] !== GUARDED);
assert.ok(yG.length >= 10 && yB.length >= 10, `seedlings to test on (${yG.length} guarded, ${yB.length} not)`);
const grazed = w.grazed ||= new Float32Array(w.n);
for (let d = 0; d < DAYS_PER_YEAR; d++) {
  for (const i of young) { grazed[i] = 1; if (w.tree[i]) w.treeG[i] = Math.min(w.treeG[i], 0.05); }
  updatePlants(g);
}
const sG = yG.filter(i => w.tree[i]).length, sB = yB.filter(i => w.tree[i]).length;
assert.ok(sG >= yG.length * 0.9, `guarded seedlings live through a year in a hard-grazed sward (${sG} of ${yG.length})`);
assert.ok(sB <= yB.length * 0.5, `unguarded ones mostly don't (${sB} of ${yB.length})`);
console.log(`  sward: ${sG}/${yG.length} guarded seedlings left after a year, ${sB}/${yB.length} unguarded`);

// deer browse on the ecology difficulty
const deer = g.catalog.animals.find(d => d.browseRate);
const saveDiff = g.difficulty; g.difficulty = 'challenging';
act.apply('plant_alder', open.filter(i => !w.tree[i]));
const one = yG.find(i => w.tree[i]), other = open.find(i => w.tree[i] && w.guard[i] === PLANTED && w.treeAge[i] === 0);
if (deer?.browseRate && one != null) {
  for (const i of [one, other]) w.treeG[i] = 0.3;
  for (let n = 0; n < 300; n++) browseSapling(g, { x: one % w.w + 0.5, y: ((one / w.w) | 0) + 0.5, state: 'idle' }, deer);
  assert.equal(w.treeG[one], Math.fround(0.3), 'deer on the ecology difficulty leave a guarded sapling alone');
  const b0 = g.stats.saplingsBrowsed || 0;
  for (let n = 0; n < 300; n++) browseSapling(g, { x: other % w.w + 0.5, y: ((other / w.w) | 0) + 0.5, state: 'idle' }, deer);
  assert.ok((g.stats.saplingsBrowsed || 0) > b0, 'and browse unguarded ones');
} else assert.fail('PNW has a browser with browseRate');
g.difficulty = saveDiff;

// the guard comes off with age, and goes with its tree
const old = caged[0], dying = caged[1];
w.treeAge[old] = GUARD_YEARS * DAYS_PER_YEAR - 1;
updatePlants(g);
assert.equal(w.guard[old], 0, `the guard comes off at ${GUARD_YEARS} years`);
assert.ok(w.tree[old], 'and the tree stays');
const planted = bare.find(i => w.tree[i]);
if (planted != null) { w.treeAge[planted] = GUARD_YEARS * DAYS_PER_YEAR + 5; updatePlants(g); assert.equal(w.guard[planted], PLANTED, 'an unguarded planted tree keeps its mark for the offer'); }
removeTree(w, dying, 'stress', g.rng, { deadwood: false });
assert.equal(w.guard[dying], 0, 'a guard goes with its tree');

// save and load
const keep = caged.filter(i => w.guard[i] === GUARDED);
const ghost = stand.find(i => !w.tree[i]);
const data = g.saveData();
const g2 = new Game(); g2.newGame(1987, 'free', 'standard', 'pnw', 7);
assert.notEqual(g2.restoreSave(structuredClone(data)), false, 'the save loads');
assert.ok(keep.length > 10 && keep.every(i => g2.world.guard[i] === GUARDED), `save/load keeps the guards (${keep.length})`);
assert.equal(g2.flags.guardOffered, true, 'and the offer, once made, stays made');
if (ghost != null) {
  const bad = structuredClone(data); g2.restoreSave(bad);
  g2.world.guard[ghost] = GUARDED; // (as if saved by a version with a plant this one no longer has)
  const d3 = g2.saveData(); const g3 = new Game(); g3.newGame(1987, 'free', 'standard', 'pnw', 7); g3.restoreSave(structuredClone(d3));
  assert.equal(g3.world.guard[ghost], 0, 'a guard on a tile with no tree is dropped on load');
}
// an older save without guards loads with none
const older = structuredClone(data); delete older.world.arrays.guard;
const g4 = new Game(); g4.newGame(1987, 'free', 'standard', 'pnw', 7);
assert.notEqual(g4.restoreSave(older), false, 'an older save loads');
assert.ok(g4.world.guard.every(v => v !== GUARDED), 'with no guards');

// the reef has no tree guards (its trees are corals)
const r = new Game(); r.newGame(1987, 'free', 'standard', 'reef', 7);
assert.ok(!r.catalog.tools.guard, 'no tree guard on the reef');

console.log(`PASS tree-guard: ${caged.length} guarded, beavers and browsers leave them, off at ${GUARD_YEARS} years, saved and loaded`);
