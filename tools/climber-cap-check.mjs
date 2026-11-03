// node tools/climber-cap-check.mjs
// Climbers share out the trees and gray squirrels come down to the ground (decision 0030). Cole
// asked to limit how many squirrels are in one tree on the Atlanta map and to make sure squirrels
// can go to the ground. Squirrels per tree are counted on animals at rest in a tree (one running
// through on its way elsewhere doesn't count).
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Actors } = await import('../js/render3d/actors.js');
import { Game } from '../js/game.js';
import { BIOME_LIST, mapCatalog } from '../js/biome.js';
import { T, LEVEL } from '../js/config.js';
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { passable } from '../js/sim/animal-terrain.js';
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
Math.random = mulberry32(23);
const tileOf = (w, a) => w.idx(Math.floor(a.x), Math.floor(a.y));
// The most of one kind at rest up in one tree.
function mostInATree(g, key) {
  const w = g.world, sp = g.catalog.animal[key].index, per = new Map();
  for (const a of g.wildlife.agents) if (a.sp === sp && a.move === 'tree' && a.state !== 'walk' && !a.leaving && w.tree[tileOf(w, a)]) per.set(tileOf(w, a), (per.get(tileOf(w, a)) || 0) + 1);
  return Math.max(0, ...per.values());
}
function grove(key, n = 6) {
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'atlanta'); g.speed = 0;
  const w = g.world, wl = g.wildlife;
  for (const prop of ['ground', 'shrub', 'tree', 'feature']) w[prop].fill(0);
  w.vh.fill(0); w.struct.fill(-1); w.terrain.fill(T.SOIL); w.fire.fill(0);
  wl.agents = []; wl.flyovers = []; wl.passageWait = 1e6; g.visitors.agents = []; g.residents = []; wl.recount();
  const oak = g.catalog.plants.find(p => p?.key === 'whiteoak');
  for (let y = 29; y < 32; y++) for (let x = 39; x < 42; x++) w.setPlant(w.idx(x, y), oak, 1);
  wl.suit.forEach(s => s.fill(0)); for (let y = 29; y < 32; y++) for (let x = 39; x < 42; x++) wl.suit[g.catalog.animal[key].index][w.idx(x, y)] = 1;
  const out = [];
  for (let k = 0; k < n; k++) { const a = wl.spawn(g.catalog.animal[key], 40, 30, { silent: true, age: 400 }); Object.assign(a, { x: 40.3 + k * 0.07, y: 30.5, wait: Math.random(), juvenile: false }); out.push(a); }
  return { g, out };
}

check('Every climber on every map takes at most two of its kind to a tree; only gray squirrels go down', () => {
  for (const b of BIOME_LIST) for (const d of mapCatalog(b.id).animals) {
    if (d.move !== 'tree') { assert.equal(d.behavior.climb, null, `${b.id}/${d.key}`); continue; }
    assert.equal(d.behavior.climb.cap, 2, `${b.id}/${d.key}`);
    assert.equal(d.behavior.climb.ground > 0, d.key === 'graysquirrel', `${b.id}/${d.key}`);
  }
});
check('Six flying squirrels put in one tree of a nine-tree grove spread out, two to a tree', () => {
  const { g } = grove('flyingsquirrel');
  assert.equal(mostInATree(g, 'flyingsquirrel'), 6);
  for (let k = 0; k < 400; k++) g.wildlife.update(0.05);
  // (a third can stop in a full tree for a moment before it moves on)
  let worst = 0, over = 0;
  for (let k = 0; k < 400; k++) { g.wildlife.update(0.05); const m = mostInATree(g, 'flyingsquirrel'); worst = Math.max(worst, m); over += m > 2; }
  assert.ok(worst <= 3 && over < 40, `two to a tree, a third only briefly (most ${worst}, over two in ${over}/400 samples)`);
});
check('Gray squirrels spend part of their time on the ground, drawn there, and in the trees, drawn up in them', () => {
  const { g, out } = grove('graysquirrel', 4), w = g.world;
  const actors = new Actors(new THREE.Scene()), right = new THREE.Vector3(1, 0, 0);
  let ground = 0, n = 0, drawnLow = 0, drawnHigh = 0, buried = 0;
  for (let k = 0; k < 2400; k++) {
    g.wildlife.update(0.05);
    if (k % 4) continue;
    actors.update(g, right, k * 0.05);
    for (const a of out) {
      n++;
      const st = actors.pose.get(a.id), floor = w.heightAt(a.x, a.y) * LEVEL;
      if (a.move === 'ground') { ground++; if (a.cache === 'bury') buried++; if (st && a.state === 'idle' && st.y - floor < 0.1) drawnLow++; }
      else if (st && a.state === 'idle' && w.tree[tileOf(w, a)] && st.y - floor > 0.5) drawnHigh++;
    }
  }
  const share = ground / n;
  assert.ok(share > 0.15 && share < 0.7, `on the ground ${Math.round(100 * share)}% of the time`);
  assert.ok(drawnLow > 20 && drawnHigh > 20, `drawn on the ground (${drawnLow}) and up in the trees (${drawnHigh})`);
  assert.ok(buried > 0, 'buries nuts');
});
check('A gray squirrel on the ground makes for a tree when a fox comes near', () => {
  const { g, out: [a] } = grove('graysquirrel', 1), w = g.world;
  Object.assign(a, { x: 44.5, y: 30.5, move: 'ground', state: 'idle', wait: 0 });
  const fox = g.wildlife.spawn(g.catalog.animals.find(d => d.sprite.kind === 'canine'), 47, 30, { silent: true });
  Object.assign(fox, { x: 47.5, y: 30.5, wait: 99, state: 'idle' });
  for (let k = 0; k < 600 && a.move !== 'tree'; k++) { g.wildlife.update(0.05); fox.wait = 99; }
  assert.equal(a.move, 'tree'); assert.ok(w.tree[tileOf(w, a)], 'up a tree');
});
check('Atlanta community: never more than two gray squirrels at rest in a tree; flying squirrels rarely, where the grove is full', () => {
  for (const seed of [7, 11, 23]) {
    Math.random = mulberry32(seed);
    const g = restoredGame('atlanta', seed), wl = g.wildlife, w = g.world;
    wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability();
    for (const key of ['graysquirrel', 'flyingsquirrel']) {
      const d = g.catalog.animal[key], good = [];
      for (let j = 0; j < w.n; j++) if (wl.suit[d.index][j] > 0.3 && passable(w, j, d)) good.push(j);
      const K = Math.max(2, Math.round(wl.state[d.index].K || 0)); // (as many as the map holds of them)
      for (let k = 0; k < Math.min(20, K); k++) { const j = good[Math.floor(Math.random() * good.length)]; wl.spawn(d, j % w.w, j / w.w | 0, { silent: true }).wait = Math.random(); }
    }
    let gray = 0, flyOver = 0, samples = 0;
    for (let k = 0; k < 1600; k++) {
      if (k % 20 === 0) { g.day++; wl.daily(); }
      wl.update(0.05);
      if (k < 200 || k % 5) continue;
      gray = Math.max(gray, mostInATree(g, 'graysquirrel'));
      flyOver += mostInATree(g, 'flyingsquirrel') > 2; samples++;
    }
    console.log(`  seed ${seed} (${wl.agents.length} squirrels): gray squirrels at most ${gray} in a tree; flying squirrels over two in some tree ${Math.round(100 * flyOver / samples)}% of the time`);
    assert.ok(gray <= 2, `seed ${seed}: gray ${gray}`);
    assert.ok(flyOver / samples < 0.35, `seed ${seed}: flying squirrels over the cap ${flyOver}/${samples}`);
  }
});
console.log(`${checks} climber checks passed.`);
