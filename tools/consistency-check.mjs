// Cross-map contracts: exercise interacting systems, not just individual helpers.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
register('./three-loader.mjs', import.meta.url);
const { Game, WORLD_ARRAYS } = await import('../js/game.js');
const { BIOME_LIST } = await import('../js/biome.js');
const { ANIMALS, ANIMAL, drawDef, isMaleVariant, preyFor } = await import('../js/data/animals.js');
const { PLANTS, PLANT, MIXES } = await import('../js/data/plants.js');
const { TOOLS } = await import('../js/tools.js');
const { ToolActions } = await import('../js/tool-actions.js');
const { Undo } = await import('../js/undo.js');
const { mulberry32 } = await import('../js/rng.js');
const { T, DAYS_PER_YEAR } = await import('../js/config.js');
const { passable, canLand } = await import('../js/sim/animal-terrain.js');
const { buildSpecies } = await import('../js/render3d/fauna.js');
const { PALETTES } = await import('../js/render3d/palettes.js');

const models = [], g = new Game();
function validState(label) {
  const w = g.world;
  for (const key of ['money', 'day', 'snow']) assert.ok(Number.isFinite(g[key]), `${label}: finite ${key}`);
  for (const key of [...WORLD_ARRAYS, 'canopy', 'nbCanopy']) {
    assert.ok(w[key].every(Number.isFinite), `${label}: finite ${key}`);
    // The vertex grid includes decorative land beyond the playable property.
    assert.equal(w[key].length, key === 'vh' ? w.VW * w.VH : w.n, `${label}: ${key} dimensions`);
  }
  for (const key of ['ground', 'shrub', 'tree']) for (const id of w[key]) assert.ok(!id || PLANTS[id], `${label}: known ${key} species`);
  const ids = new Set();
  for (const a of g.wildlife.agents) {
    assert.ok(!ids.has(a.id), `${label}: unique animal IDs`); ids.add(a.id);
    assert.equal(g.wildlife.ids.get(a.id), a, `${label}: current identity index`);
    assert.equal(ANIMALS[a.sp]?.key, a.key, `${label}: correct animal registry`);
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.age), `${label}: finite animal state`);
  }
  g.wildlife.recount();
  for (const def of ANIMALS) {
    const s = g.wildlife.state[def.index];
    assert.equal(s.pop, g.wildlife.agents.filter(a => a.sp === def.index && !a.leaving).length, `${label}: population bookkeeping`);
    assert.ok(Number.isFinite(s.K) && s.K >= 0, `${label}: finite capacity`);
  }
}

for (const map of BIOME_LIST.map(b => b.id)) {
  const mapDef = BIOME_LIST.find(b => b.id === map);
  for (const difficulty of ['relaxed', 'standard', 'challenging']) {
    // Independent reproducible stream for behavior without altering the game's ecology stream.
    Math.random = mulberry32(20261011);
    g.newGame(1987, 'free', difficulty, map);
    for (const def of ANIMALS) for (const key of preyFor(def, g) || []) assert.ok(ANIMAL[key], `${map}: valid food web`);
    for (const p of PLANTS.filter(p => p && p.native && !p.invasive && !p.exotic)) assert.ok(TOOLS['plant_' + p.key], `${map}/${p.key}: every native plant has a shared planting tool`);
    for (const mix of MIXES) for (const key of mix.species) assert.ok(PLANT[key], `${map}/${mix.key}: native map registry`);
    // Landscape work must refund and restore correctly before daily ecology and persistence.
    const i = g.world.terrain.findIndex((t, i) => t !== T.RIVER && g.world.struct[i] < 0);
    const undo = new Undo(g), tool = TOOLS.raise, height = g.world.vh.slice(), money = g.money;
    const actions = new ToolActions(g, { undo });
    const stroke = actions.apply(tool, [i], { random: g.rng });
    assert.equal(stroke.count, 1, `${map}: shared terrain edit`);
    assert.ok(undo.undo());
    assert.deepEqual(g.world.vh, height, `${map}: undo restores height grid`); assert.equal(g.money, money, `${map}: undo refunds work`);
    // Cross month and season boundaries with all daily systems enabled.
    for (const day of [8, 38, 68, 98]) {
      g.day = day;
      for (let n = 0; n < 4; n++) { g.dailyTick(); for (let k = 0; k < 5; k++) g.wildlife.update(.05); }
      validState(`${map}/${difficulty}/day${g.day}`);
    }
    const save = g.saveData(), species = g.wildlife.agents.map(a => [a.id, a.key]);
    const rng = g.rng.state(), balance = g.money;
    // A different map changes global registries; restoring must fully rebind this farm.
    g.newGame(2, 'free', 'standard', map === 'pnw' ? 'reef' : 'pnw');
    assert.equal(g.restoreSave(save), true, `${map}: restore after another map`);
    assert.equal(g.map, map); assert.equal(g.difficulty, difficulty); assert.equal(g.rng.state(), rng); assert.equal(g.money, balance);
    assert.deepEqual(g.wildlife.agents.map(a => [a.id, a.key]), species);
    g.dailyTick(); g.wildlife.update(.05); validState(`${map}/${difficulty}/restored`);
    console.log(`PASS ${map}/${difficulty}: edit + undo, seasonal dynamics, populations, map switch + save/load`);
  }
  assert.ok(mapDef.look.underwater || PALETTES[map], `${map}: shared regional art palette`);
  for (const light of mapDef.look.light) for (const key of ['sunI', 'hemiI']) assert.ok(Number.isFinite(light[key]) && light[key] > 0, `${map}: readable shared lighting`);
  for (const def of ANIMALS) {
    assert.ok(def.speed > 0 && def.hr > 0 && def.max > 0, `${map}/${def.key}: valid gameplay units`);
    const adult = { id: 1, age: Math.max(1, def.mature * DAYS_PER_YEAR + 1), juvenile: false };
    const appearances = [def];
    if (def.sprite.male) {
      while (!isMaleVariant(def, adult)) adult.id++;
      appearances.push(drawDef(def, adult));
      assert.equal(drawDef(def, { ...adult, juvenile: true }), def, `${map}: young use the shared base appearance`);
    }
    for (const appearance of appearances) {
      const { geo } = buildSpecies(appearance);
      for (const attribute of Object.values(geo.attributes)) assert.ok(attribute.array.every(Number.isFinite), `${map}/${appearance.key}: finite geometry`);
      assert.ok(geo.index.count % 3 === 0 && geo.index.count > 0);
      assert.ok(geo.index.array.every(i => i < geo.attributes.position.count));
      geo.computeBoundingBox(); assert.ok(!geo.boundingBox.isEmpty());
      models.push({ map, species: appearance.key, triangles: geo.index.count / 3 });
      geo.dispose();
    }
    // All movement styles can evaluate the same boundaries, including flying and reef species.
    for (const i of [0, g.world.n - 1, g.world.idx(30, 30)]) {
      assert.equal(typeof passable(g.world, i, def), 'boolean');
      assert.equal(typeof canLand(g.world, i, def), 'boolean');
    }
  }
}
await mkdir(new URL('./release-output/', import.meta.url), { recursive: true });
await writeFile(new URL('./release-output/models.json', import.meta.url), JSON.stringify(models, null, 2));
console.log(`${models.length} regional animal appearances share valid geometry, movement contracts and art settings.`);
