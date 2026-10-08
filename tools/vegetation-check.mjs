// Botanical geometry, shared habitat patterns, and planted-community regressions.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const G = await import('../js/render3d/geometry.js');
const Botanical = await import('../js/render3d/botanical.js');
const { snowCrown } = await import('../js/render3d/snow.js');
import { Game } from '../js/game.js';
import { PLANTS, PLANT, plantPhase } from '../js/data/plants.js';
import { TOOLS } from '../js/tools.js';
import { flowerForm } from '../js/plant-patterns.js';
import { mulberry32 } from '../js/rng.js';
import { T } from '../js/config.js';
import { groveForm } from '../js/render3d/groves.js';
import { paletteLeafColor, colorRgb, pastureColor, PALETTES } from '../js/render3d/palettes.js';
let checks = 0, flowers = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
check('Regional palettes preserve species, seasonal contrast and natural bloom colours', () => {
  const signatures = new Set();
  for (const map of ['pnw','atlanta','amazon','serengeti','chinandega','sumatra','reef']) {
    const game = new Game(); game.newGame(1987, 'free', 'standard', map);
    const looks = PLANTS.filter(Boolean).map(p => structuredClone(p.look));
    const rng = game.rng.state();
    for (const p of PLANTS.filter(Boolean)) for (let month = 0; month < 12; month++) {
      const phase = plantPhase(p, month), c = paletteLeafColor(p, phase, map);
      assert.ok(c.every(v => Number.isFinite(v) && v >= 0 && v <= 1), map+'/'+p.key+'/'+month);
      assert.deepEqual(paletteLeafColor(p, phase, map), c, 'stable between rebuilds');
      if (p.look.crownBloom && phase === 'bloom') assert.deepEqual(c, colorRgb(p.look.flower), 'flowering crowns retain species colours');
      if (map === 'reef') assert.deepEqual(c, colorRgb(p.look.leaf), 'corals, mantles and seagrass retain their colours');
    }
    assert.deepEqual(PLANTS.filter(Boolean).map(p => p.look), looks, 'registry unchanged');
    assert.equal(game.rng.state(), rng, 'render colours do not consume simulation RNG');
    for (let season = 0; season < 4; season++) assert.ok(pastureColor(map, season, '#a2b56a').every(v => Number.isFinite(v) && v >= 0 && v <= 1));
    if (PALETTES[map]) signatures.add(JSON.stringify(paletteLeafColor({ layer: 2, look: { leaf: '#668844' } }, 'green', map)));
    if (map === 'pnw') {
      const fir = paletteLeafColor(PLANT.fir, 'green', map), alder = paletteLeafColor(PLANT.alder, 'green', map);
      const luminance = c => c[0]*.25 + c[1]*.6 + c[2]*.15;
      assert.ok(luminance(alder) - luminance(fir) > .1, 'readable deciduous / conifer contrast');
      const spring = paletteLeafColor(PLANT.maple, 'spring', map), fall = paletteLeafColor(PLANT.maple, 'fall', map);
      assert.ok(fall[0] - fall[1] > .1 && spring[1] - spring[0] > .1, 'amber autumn and green spring remain distinct');
    }
  }
  assert.equal(signatures.size, 6, 'each terrestrial region has a distinct colour identity');
});
function valid(geo, label) {
  for (const attr of ['position','normal','color']) {
    assert.ok(geo.attributes[attr]?.count > 0, label+'/'+attr);
    assert.equal(geo.attributes[attr].count, geo.attributes.position.count, label+'/'+attr+'/length');
    assert.ok(geo.attributes[attr].array.every(Number.isFinite), label+'/'+attr+'/finite');
  }
  geo.computeBoundingBox(); assert.ok(geo.boundingBox.max.y >= geo.boundingBox.min.y);
}
check('Stable woodland height variation preserves saplings and specialist forms', () => {
  const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw');
  const w = g.world, x = 40, y = 32;
  w.tree.fill(0); w.treeG.fill(0);
  w.setPlant(w.idx(x, y), PLANT.fir, 1);
  const isolated = groveForm(x, y, 1, G.TREE_SHAPES.fir);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    w.setPlant(w.idx(x + dx, y + dy), PLANT.fir, 1);
  }
  const before = w.tree.slice(), growth = w.treeG.slice(), rng = g.rng.state();
  assert.deepEqual(groveForm(x, y, 1, G.TREE_SHAPES.fir), isolated, 'neighbours do not stretch trees');
  assert.equal(isolated.width, 1.1, 'mature crowns are only ten percent wider');
  const unchanged = { width: 1, height: 1, tint: 1 };
  assert.deepEqual(groveForm(x, y, .2, G.TREE_SHAPES.fir), unchanged, 'saplings remain small');
  for (const shape of ['oilpalm','palm','banana','baobab','staghorn','tablecoral','brain']) {
    assert.deepEqual(groveForm(x, y, 1, G.TREE_SHAPES[shape]), unchanged, shape);
  }
  const heights = new Set();
  for (let yy = -8; yy < 8; yy++) for (let xx = -8; xx < 8; xx++) {
    const form = groveForm(xx, yy, 1, G.TREE_SHAPES.fir);
    assert.ok(Object.values(form).every(Number.isFinite), 'finite at map and border edges');
    assert.ok(form.height >= .68 && form.height <= 1.25);
    assert.equal(form.width, 1.1);
    heights.add(form.height.toFixed(2));
  }
  assert.ok(heights.size > 20, 'varied silhouettes rather than one repeated proportion');
  assert.deepEqual(w.tree, before); assert.deepEqual(w.treeG, growth); assert.equal(g.rng.state(), rng);
});
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
    }
    for (const crown of [hi.crown, lo.crown]) {
      const vertices = crown.attributes.position.array.slice();
      snowCrown(crown);
      const height = crown.attributes.aSnowHeight;
      assert.equal(height.count, crown.attributes.position.count, name+' snow heights cover every vertex');
      assert.ok(height.array.every(v => Number.isFinite(v) && v >= 0 && v <= 1), name+' bounded snow gradient');
      assert.equal(Math.min(...height.array), 0, name+' green crown base');
      assert.equal(Math.max(...height.array), 1, name+' snowy crown tip');
      assert.deepEqual(crown.attributes.position.array, vertices, name+' snow does not alter tree geometry');
    }
    for (const key of ['crown','trunk']) { hi[key].dispose(); lo[key].dispose(); }
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
