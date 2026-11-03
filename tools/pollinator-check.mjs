// The bees and butterflies at the flowers (render3d/pollinators.js): each map's list resolves to
// insect models that build, at the wildlife's scale. Run: node tools/pollinator-check.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const { loadAnimals, ANIMAL } = await import('../js/data/animals.js');
const { buildSpecies } = await import('../js/render3d/fauna.js');
const { adultAnimalScale } = await import('../js/render3d/animal-scale.js');
let n = 0;
for (const map of ['pnw', 'atlanta', 'amazon', 'reef', 'sumatra', 'chinandega', 'serengeti']) {
  const def = (await import(`../js/maps/${map}.js`)).default;
  loadAnimals((await import(`../js/data/animals-${map}.js`)).default);
  const list = def.look.ambience?.pollinators || [];
  if (map === 'reef') { assert.equal(list.length, 0, 'no bees under the sea'); continue; }
  assert.ok(list.some(e => (e.sprite || ANIMAL[e.animal]?.sprite)?.kind === 'bee'), `${map}: a bee`);
  assert.ok(list.some(e => (e.sprite || ANIMAL[e.animal]?.sprite)?.kind === 'butterfly'), `${map}: a butterfly`);
  for (const e of list) {
    const sprite = e.animal ? ANIMAL[e.animal]?.sprite : e.sprite;
    assert.ok(sprite, `${map}: ${e.animal} is one of the map's animals`);
    assert.ok(['bee', 'butterfly'].includes(sprite.kind), `${map}: insects only`);
    const { geo } = buildSpecies({ key: 'p', sprite });
    geo.computeBoundingBox();
    const span = Math.max(geo.boundingBox.max.x - geo.boundingBox.min.x, geo.boundingBox.max.z - geo.boundingBox.min.z) * adultAnimalScale(sprite);
    assert.ok(span > 0.03 && span < 0.25, `${map}: ${sprite.kind} ${span.toFixed(3)} tiles across`);
    geo.dispose(); n++;
  }
}
console.log(`${n} pollinators on 6 maps build at the wildlife's scale.`);
