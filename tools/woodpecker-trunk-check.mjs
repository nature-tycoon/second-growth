// node tools/woodpecker-trunk-check.mjs
// Woodpeckers work tree trunks (decision 0030): Cole asked to see the pileated woodpecker peck
// trees on the Atlanta and PNW maps. They cling upright to the bark of a big tree, low on it and
// under its crown (heights read through treeLevel, decision 0024), facing it, head hammering,
// and the drum recording comes from one that is on a trunk.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Flora } = await import('../js/render3d/flora.js');
const { Actors } = await import('../js/render3d/actors.js');
import { Game } from '../js/game.js';
import { T, LEVEL } from '../js/config.js';
import { birdProfile, birdChoose } from '../js/sim/bird-behavior.js';
import { treeTrunk } from '../js/sim/ground-obstacles.js';
import { mulberry32 } from '../js/rng.js';
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
Math.random = mulberry32(1987);
function grove(map, treeKey) {
  const g = new Game(); g.newGame(1987, 'free', 'standard', map); g.speed = 0;
  const w = g.world, wl = g.wildlife;
  for (const prop of ['ground', 'shrub', 'tree', 'feature']) w[prop].fill(0);
  for (const prop of ['ground', 'shrub', 'tree']) g.border[prop].fill(0);
  w.vh.fill(0); w.struct.fill(-1); w.terrain.fill(T.SOIL); w.fire.fill(0);
  wl.agents = []; wl.flyovers = []; wl.passageWait = 1e6; g.visitors.agents = []; g.residents = []; wl.recount();
  const tree = g.catalog.plants.find(p => p?.key === treeKey);
  for (let y = 28; y < 36; y += 2) for (let x = 36; x < 46; x += 2) w.setPlant(w.idx(x, y), tree, 1);
  wl.suit.forEach(s => s.fill(1));
  return g;
}
for (const [map, tree] of [['pnw', 'fir'], ['atlanta', 'whiteoak']]) {
  check(`${map}: a pileated woodpecker spends much of its time working trunks in a stand of big trees`, () => {
    const g = grove(map, tree), wl = g.wildlife, W = g.catalog.animal.woodpecker;
    assert.equal(birdProfile(W, g.catalog).trunk, true);
    const a = wl.spawn(W, 40, 30, { silent: true }); Object.assign(a, { x: 40.5, y: 30.5, wait: 0 });
    let on = 0, n = 0, rose = false, last = null;
    for (let k = 0; k < 1600; k++) {
      wl.update(0.05);
      if (a.bird?.kind === 'trunk') { on++; if (last === a.bird && a.bird.h > (a.bird.h0 ??= a.bird.h) + 0.01) rose = true; last = a.bird; }
      n++;
    }
    assert.ok(on / n > 0.25, `on a trunk ${Math.round(100 * on / n)}% of the time`);
    assert.ok(rose, 'it hitches up the trunk as it works');
  });
  check(`${map}: drawn upright on the bark, under the crown, facing the trunk`, () => {
    const g = grove(map, tree), wl = g.wildlife, w = g.world, W = g.catalog.animal.woodpecker;
    const scene = new THREE.Scene(), flora = new Flora(scene); flora.rebuild(g, true);
    const actors = new Actors(scene, flora), right = new THREE.Vector3(1, 0, 0);
    const i = w.idx(40, 30), t = treeTrunk(w, 40, 30), site = flora.treeSites.get(i);
    const a = wl.spawn(W, 40, 30, { silent: true });
    for (const [h, side] of [[0.1, 0], [0.3, 2], [0.42, 4]]) {
      Object.assign(a, { x: 40.5, y: 30.5, state: 'bird', flying: false, alt: 0, wait: 99, bird: { kind: 'trunk', t: 99, h, side }, hd: Math.atan2(-Math.sin(side), -Math.cos(side)) });
      for (let f = 0; f < 90; f++) actors.update(g, right, f / 30 + h);
      const st = actors.pose.get(a.id), d = Math.hypot(st.x - t[0], st.z - t[1]);
      const ground = w.heightAt(t[0], t[1]) * LEVEL;
      site.crown.geo.computeBoundingBox();
      const crownLow = site.transform[1] + site.crown.geo.boundingBox.min.y * site.transform[4];
      assert.ok(d > t[2] * 0.5 && d < t[2] + 0.12, `${map} h ${h}: against the bark (${d.toFixed(3)} from the middle, trunk ${t[2].toFixed(3)})`);
      assert.ok(st.y > ground + 0.1 && st.y < crownLow, `${map} h ${h}: on the trunk under the crown (${(st.y - ground).toFixed(2)} up, crown from ${(crownLow - ground).toFixed(2)})`);
      assert.ok(st.pitch > 1, 'upright');
      const facing = [Math.cos(st.yaw), -Math.sin(st.yaw)], toTrunk = [(t[0] - st.x) / d, (t[1] - st.z) / d];
      assert.ok(facing[0] * toTrunk[0] + facing[1] * toTrunk[1] > 0.9, 'facing the trunk');
    }
    const peck = new Set(); for (let f = 0; f < 60; f++) { actors.update(g, right, 10 + f / 60); peck.add(Math.round(actors.pose.get(a.id).graze * 10)); }
    assert.ok(peck.size > 1, 'the head moves as it pecks');
  });
}
console.log(`${checks} woodpecker trunk checks passed.`);
