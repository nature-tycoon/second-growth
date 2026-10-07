// Botanical geometry, shared habitat patterns, and planted-community regressions.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const G = await import('../js/render3d/geometry.js');
const Botanical = await import('../js/render3d/botanical.js');
import { Game } from '../js/game.js';
import { PLANTS, PLANT } from '../js/data/plants.js';
import { TOOLS } from '../js/tools.js';
import { flowerForm } from '../js/plant-patterns.js';
import { mulberry32 } from '../js/rng.js';
import { T } from '../js/config.js';
let checks = 0, flowers = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
function valid(geo, label) {
  for (const attr of ['position','normal','color']) {
    assert.ok(geo.attributes[attr]?.count > 0, label+'/'+attr);
    assert.equal(geo.attributes[attr].count, geo.attributes.position.count, label+'/'+attr+'/length');
    assert.ok(geo.attributes[attr].array.every(Number.isFinite), label+'/'+attr+'/finite');
  }
  geo.computeBoundingBox(); assert.ok(geo.boundingBox.max.y >= geo.boundingBox.min.y);
}
check('Flowering groundcovers have distinct botanical heads, valid stems and light models on all maps', () => {
  for (const map of ['pnw','atlanta','amazon','serengeti','chinandega','sumatra','reef']) {
    const g = new Game(); g.newGame(1987,'free','standard',map);
    for (const p of PLANTS.filter(p => p && p.layer === 0 && flowerForm(p))) {
      const form = flowerForm(p), hi = Botanical.wildflowerParts(form,117,p.look.flower), lo = Botanical.wildflowerParts(form,117,p.look.flower,true);
      for (const key of ['foliage','blossom','seed']) {
        valid(hi[key],map+'/'+p.key+'/'+key); valid(lo[key],map+'/'+p.key+'/'+key+'/fast');
        assert.ok(lo[key].attributes.position.count <= hi[key].attributes.position.count);
        assert.ok(hi[key].attributes.position.count / 3 < 1200, p.key+' geometry budget');
      }
      assert.ok(hi.blossom.boundingBox.min.y > 0, p.key+' flowers above soil');
      assert.ok(hi.blossom.boundingBox.min.y <= hi.foliage.boundingBox.max.y + .04, p.key+' heads meet their stems');
      flowers++; for (const geo of [...Object.values(hi),...Object.values(lo)]) geo.dispose();
    }
  }
});
check('All tree shapes retain finite geometry and bounded close/distant model costs', () => {
  for (const [name,shape] of Object.entries(G.TREE_SHAPES)) {
    const hi = G.treeParts(shape,503), lo = G.treeParts(shape,503,1);
    if (shape.kind === 'conifer') {
      hi.crown.computeBoundingBox(); lo.crown.computeBoundingBox();
      assert.ok(lo.crown.attributes.position.count < hi.crown.attributes.position.count,name+' simpler distant foliage');
      assert.ok(hi.crown.boundingBox.max.y < shape.height*1.15,name+' bounded leader height');
      assert.ok(lo.crown.boundingBox.max.x-lo.crown.boundingBox.min.x > shape.radius,name+' readable distant crown');
    }
    for (const key of ['crown','trunk']) {
      valid(hi[key],name+'/'+key); valid(lo[key],name+'/'+key+'/fast');
      assert.ok(hi[key].attributes.position.count / 3 < 12000, name+' close model budget');
      assert.ok(lo[key].attributes.position.count / 3 < 6000, name+' distant model budget');
      hi[key].dispose(); lo[key].dispose();
    }
  }
});
check('Red oat grass stands taller than short grazing grass in both detail levels', () => {
  for (const lo of [false,true]) {
    const tall = G.tuft('savannagrass',127,lo), short = G.tuft('grass',127,lo), heads = Botanical.grassHeads('savannagrass',127,lo);
    for (const geo of [tall,short,heads]) { valid(geo,'grass'); }
    assert.ok(tall.boundingBox.max.y > short.boundingBox.max.y * 2.5);
    assert.ok(heads.boundingBox.max.y > tall.boundingBox.max.y);
    for (const geo of [tall,short,heads]) geo.dispose();
  }
});
check('Seed mixes produce connected drifts while retaining all suitable species and normal density', () => {
  const g = new Game(); g.newGame(1987,'free','standard','atlanta');
  const w = g.world, rng = mulberry32(321), counts = new Map(); let total = 0, matching = 0, edges = 0;
  for (let y = 15; y < 55; y++) for (let x = 20; x < 60; x++) {
    const i = w.idx(x,y); w.clearPlants(i); w.struct[i] = -1; w.feature[i] = 0; w.terrain[i] = T.SOIL;
    w.soil[i] = .8; w.moist[i] = .4; w.canopy[i] = w.nbCanopy[i] = 0;
    TOOLS.mix_pollinator.apply(g,i,rng);
    if (w.ground[i]) { counts.set(w.ground[i],(counts.get(w.ground[i]) || 0)+1); total++; }
  }
  for (let y = 15; y < 54; y++) for (let x = 20; x < 59; x++) {
    const i = w.idx(x,y);
    for (const j of [i+1,i+w.w]) if (w.ground[i] && w.ground[j]) { edges++; if (w.ground[i] === w.ground[j]) matching++; }
  }
  const shuffled = [...counts.values()].reduce((sum,n) => sum + (n / total) ** 2,0);
  assert.ok(matching / edges > shuffled * 1.5, 'more same-species neighbours than a random mix with identical composition');
  assert.equal(counts.size,9); assert.ok(total / 1600 > .75 && total / 1600 < .85);
  assert.ok([...counts.values()].every(n => n > 60), 'no suitable species disappears');
});
check('Single-species tools remain predictable and unsuitable planting still fails', () => {
  const g = new Game(); g.newGame(1987,'free','standard','atlanta'); const w = g.world, i = w.idx(35,35);
  w.clearPlants(i); w.struct[i] = -1; w.feature[i] = 0; w.terrain[i] = T.SOIL; w.soil[i] = .8;
  w.moist[i] = .4; w.canopy[i] = w.nbCanopy[i] = 0;
  assert.equal(TOOLS.plant_coneflower.apply(g,i,()=>0),true); assert.equal(w.ground[i],PLANT.coneflower.id);
  w.clearPlants(i); w.terrain[i] = T.ROAD;
  assert.equal(TOOLS.mix_pollinator.apply(g,i,()=>0),'unsuitable'); assert.equal(w.ground[i],0);
});
console.log(`${checks} vegetation checks passed; ${flowers} regional flowering groundcovers audited.`);
