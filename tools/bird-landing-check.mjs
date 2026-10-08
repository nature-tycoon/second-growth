// node tools/bird-landing-check.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Actors } = await import('../js/render3d/actors.js');
const { waterSurfaceY } = await import('../js/render3d/terrain.js');
import { Game } from '../js/game.js';
import { ANIMAL, ANIMALS } from '../js/data/animals.js';
import { canLand, passable } from '../js/sim/animals.js';
import { T, LEVEL } from '../js/config.js';
import { biome } from '../js/biome.js';
import { mulberry32 } from '../js/rng.js';

Math.random = mulberry32(1987);
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function setup(map = 'pnw') {
  const g = new Game(); g.newGame(1987, 'free', 'standard', map);
  g.wildlife.agents = []; g.visitors.agents = []; g.residents = [];
  const w = g.world;
  w.terrain.fill(T.RIVER); w.tree.fill(0); w.treeG.fill(0); w.struct.fill(-1);
  w.vh.fill(-4); w.distWater.fill(0);
  // One narrow bank, easily missed by random sampling.
  for (let y = 0; y < w.h; y++) w.terrain[w.idx(25, y)] = T.SOIL;
  return g;
}
function spawn(g, key, x = 30, y = 30) {
  const a = g.wildlife.spawn(ANIMAL[key], x, y, { silent: true });
  a.wait = 10; a.x = x + 0.5; a.y = y + 0.5; return a;
}
const tile = (g, a) => g.world.idx(Math.floor(a.x), Math.floor(a.y));

check('Land birds can cross rivers but sample and roam toward valid landing tiles on all maps', () => {
  for (const map of ['pnw', 'atlanta', 'amazon', 'serengeti', 'chinandega', 'sumatra', 'reef']) {
    const g = setup(map), w = g.world;
    for (const def of ANIMALS.filter(d => d.move === 'fly')) {
      g.wildlife.suit[def.index].fill(1);
      const a = spawn(g, def.key);
      assert.equal(passable(w, tile(g, a), def), true);
      for (let k = 0; k < 12; k++) {
        const [x, y] = g.wildlife.bestTileSample(def, a.x, a.y, 14, 10);
        assert.ok(canLand(w, w.idx(x, y), def), `${map}/${def.key}: sampled landing`);
        if (g.wildlife.roam(a, def)) {
          assert.ok(canLand(w, w.idx(Math.floor(a.tx), Math.floor(a.ty)), def), `${map}/${def.key}: roaming landing`);
        }
      }
    }
  }
});
check('A missed bank is found even when every random sample is open water', () => {
  const g = setup(), def = ANIMAL.kingfisher;
  const [x, y] = g.wildlife.bestTileSample(def, 30, 30, 0, 10);
  assert.equal(x, 25); assert.equal(y, 30);
});
check('Ducks float, waders choose shallows, and water trees remain valid perches', () => {
  const g = setup(), w = g.world, i = w.idx(30, 30);
  assert.equal(canLand(w, i, ANIMAL.mallard), true);
  assert.equal(canLand(w, i, ANIMAL.heron), false);
  for (const t of [T.CREEK, T.MARSH]) {
    w.terrain[i] = t; assert.equal(canLand(w, i, ANIMAL.heron), true);
    assert.equal(canLand(w, i, ANIMAL.robin), false);
  }
  w.tree[i] = 1; w.treeG[i] = 1;
  assert.equal(canLand(w, i, ANIMAL.robin), true);
});
check('Legacy landings and destinations flooded during flight take off toward the bank', () => {
  const g = setup(), a = spawn(g, 'kingfisher');
  a.wait = 0; g.wildlife.load(g.wildlife.serialize());
  const restored = g.wildlife.agents[0]; restored.wait = 0;
  g.wildlife.update(0.05);
  assert.equal(restored.state, 'fly'); assert.equal(restored.flying, true);
  assert.equal(Math.floor(restored.tx), 25);
  restored.tx = restored.x; restored.ty = restored.y; restored.state = 'fly';
  g.wildlife.update(0.05);
  assert.equal(restored.flying, true); assert.equal(restored.wait, 0);
  g.wildlife.update(0.05);
  assert.equal(Math.floor(restored.tx), 25);
  for (let k = 0; k < 300 && restored.state === 'fly'; k++) g.wildlife.update(0.05);
  assert.equal(restored.state, 'idle'); assert.equal(restored.flying, false);
  assert.equal(Math.floor(restored.x), 25);
});
check('Bird bodies stay above water through landing, including deeply carved creeks and marshes', () => {
  for (const [map, key] of [['pnw', 'heron'], ['pnw', 'mallard'], ['pnw', 'kingfisher'], ['serengeti', 'crane']]) {
    const g = setup(map), w = g.world, a = spawn(g, key);
    const actors = new Actors(new THREE.Scene()), right = new THREE.Vector3(1, 0, 0);
    for (const t of [T.RIVER, T.POND, T.CREEK, T.MARSH]) {
      w.terrain[tile(g, a)] = t;
      const surface = waterSurfaceY(w, a.x, a.y);
      for (const altitude of [1, 0.2, 0.06, 0]) {
        a.alt = altitude; a.flying = altitude > 0;
        actors.update(g, right, altitude + 2);
        const pose = actors.pose.get(a.id);
        assert.ok(pose.center.y > surface, `${key}/${t}/${altitude}: body submerged`);
        if (a.flying) assert.ok(pose.y > surface, `${key}: flight is below the surface`);
        else if (key === 'kingfisher') assert.ok(pose.y >= surface, 'legacy land bird has submerged feet');
      }
    }
  }
});
check('Resting reef seabirds keep their bodies above sea level', () => {
  const g = setup('reef'), actors = new Actors(new THREE.Scene());
  const sea = biome.look.underwater.level * LEVEL;
  for (const key of ['booby', 'noddy']) {
    const a = spawn(g, key);
    actors.update(g, new THREE.Vector3(1, 0, 0), 1);
    const pose = actors.pose.get(a.id);
    assert.ok(pose.center.y > sea, `${key}: body below sea level`);
    if (key === 'noddy') assert.ok(Math.abs(pose.y - sea) < 0.01);
  }
});
console.log(`${checks} bird landing checks passed.`);
