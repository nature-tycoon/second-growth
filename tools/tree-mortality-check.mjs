// Tree removal and the mortality hazard (docs/decisions/0013-succession-dynamics.md, phase 2).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../js/world.js';
import { setBiome } from '../js/biome.js';
import { PLANT } from '../js/data/plants.js';
import { removeTree, treeHazard, plantSuit } from '../js/sim/plants.js';
import { T, F } from '../js/config.js';
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
function fixture(map = 'pnw') {
  setBiome(map);
  const w = new World(9, 9);
  w.terrain.fill(T.SOIL); w.moist.fill(.6); w.baseMoist.fill(.6);
  w.soil.fill(.8); w.distWater.fill(10); w.distLog.fill(255);
  return w;
}
const grow = (w, i, key, g, ageY = 0) => { w.tree[i] = PLANT[key].id; w.treeG[i] = g; w.treeAge[i] = ageY * 120; };

check('removeTree clears the tile, counts the cause, and leaves deadwood by size and cause', () => {
  const w = fixture(), i = w.idx(4, 4), j = w.idx(2, 2), k = w.idx(6, 6);
  grow(w, i, 'fir', 1, 300); removeTree(w, i, 'wind', () => 0.5);
  assert.equal(w.tree[i], 0); assert.equal(w.treeG[i], 0); assert.equal(w.treeAge[i], 0);
  assert.equal(w.feature[i], F.LOG, 'a windthrown tree falls');
  grow(w, j, 'fir', 1, 300); removeTree(w, j, 'fire', () => 0.5);
  assert.equal(w.feature[j], F.SNAG, 'a burned tree stands');
  grow(w, k, 'fir', 0.3); removeTree(w, k, 'age', () => 0);
  assert.equal(w.feature[k], 0, 'a sapling leaves nothing');
  assert.deepEqual(w.treeDeaths, { wind: 1, fire: 1, age: 1 });
  assert.deepEqual(w.treeDeathsEst, { wind: 1, fire: 1 }, 'established trees counted apart');
});

check('deadwood: false leaves nothing, and the reef turns dead coral to rubble', () => {
  const w = fixture(), i = w.idx(4, 4);
  grow(w, i, 'fir', 1); removeTree(w, i, 'player', null, { deadwood: false });
  assert.equal(w.feature[i], 0); assert.equal(w.treeDeaths.player, 1);
  const r = fixture('reef'), c = r.idx(4, 4), key = r.catalog.plants.find(p => p?.layer === 2).key;
  r.terrain[c] = T.MUD; grow(r, c, key, 1); removeTree(r, c, 'wind', () => 0);
  assert.equal(r.feature[c], 0, 'no snags under water'); assert.equal(r.terrain[c], T.GRAVEL);
  setBiome('pnw');
});

check('Hazard: flat background, a steep rise past 0.7 of life, stress on a poor site', () => {
  const w = fixture(), i = w.idx(4, 4), fir = PLANT.fir;
  const at = (ageY, s = 1, g = 1) => treeHazard(w, i, fir, s, g, ageY, {}).h;
  assert.equal(at(50), 0.002, 'fir background is 0.8/life, clamped to 0.2%/yr');
  assert.equal(at(0.7 * fir.life), at(10));
  assert.ok(Math.abs(at(fir.life) - 0.052) < 1e-9, '~5%/yr at its life span');
  assert.ok(at(1.3 * fir.life) > 0.3, 'very old trees die within a few years');
  assert.ok(at(50, 0.1) > 0.15, 'a grown tree on a bad site dies within years');
  assert.ok(treeHazard(w, i, PLANT.alder, 1, 1, 1, {}).h <= 0.02 && treeHazard(w, i, PLANT.alder, 1, 1, 1, {}).h > at(50), 'short-lived trees die faster, capped at 2%/yr');
  assert.equal(treeHazard(w, i, fir, 1, 1, 50, { background: 0 }).h, 0, 'map data can turn a term off');
});

check('Suppression hits shade-intolerant trees below the canopy, not shade-tolerant ones or canopy trees', () => {
  const w = fixture(), i = w.idx(4, 4);
  w.nbCanopy.fill(1);
  const h = (key, g) => treeHazard(w, i, PLANT[key], 1, g, 10, {}).h - treeHazard(w, i, PLANT[key], 1, 1, 10, {}).h;
  assert.ok(h('fir', 0.4) > 0.01, 'a fir sapling under closed canopy');
  assert.ok(h('alder', 0.4) > h('fir', 0.4), 'alder worse off than fir');
  assert.equal(h('hemlock', 0.4), 0, 'hemlock waits in the shade');
  assert.equal(treeHazard(w, i, PLANT.fir, 1, 0.95, 10, {}).h, 0.002, 'a canopy fir is not suppressed');
});

check('Only removeTree clears a living tree (and World.clearPlants, for laying out a map)', () => {
  const root = fileURLToPath(new URL('../js/', import.meta.url)), hits = [];
  const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js') && !p.endsWith('-world.js')) scan(p); } };
  const scan = p => readFileSync(p, 'utf8').split('\n').forEach((line, n) => {
    if (/killTree\(|\.tree\[[^\]]+\] *= *0\b/.test(line)) hits.push(relative(root, p));
  });
  walk(root);
  assert.deepEqual(hits.sort(), ['sim/plants.js', 'world.js'], 'a tree is cleared outside removeTree');
});

console.log(`${checks} tree mortality checks passed.`);
