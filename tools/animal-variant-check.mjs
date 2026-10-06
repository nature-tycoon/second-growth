// Adult appearances must remain stable, with bare-headed juveniles and distinct adult geometry.
// Run: node tools/animal-variant-check.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const { loadAnimals, ANIMAL, drawDef, isMaleVariant } = await import('../js/data/animals.js');
const { buildSpecies } = await import('../js/render3d/fauna.js');
const { Box3, Vector3 } = await import('three');
const targets = { serengeti: ['lion'], pnw: ['deer', 'elk'], atlanta: ['deer'], chinandega: ['deer'], sumatra: ['sambar'] };
function bounds(model, part) {
  const box = new Box3(), p = model.geo.attributes.position, parts = model.geo.attributes.aPart;
  for (let i = 0; i < p.count; i++) if (parts.getX(i) === part) box.expandByPoint(new Vector3().fromBufferAttribute(p, i));
  assert(!box.isEmpty());
  return box;
}
let checked = 0;
for (const [map, keys] of Object.entries(targets)) {
  loadAnimals((await import(`../js/data/animals-${map}.js`)).default);
  for (const key of keys) {
    const def = ANIMAL[key], adults = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, juvenile: false }));
    const males = adults.filter(a => isMaleVariant(def, a)), females = adults.filter(a => !isMaleVariant(def, a));
    assert(males.length > 0 && females.length > 0, `${map}/${key}: both adult appearances occur`);
    const male = drawDef(def, males[0]);
    assert.equal(drawDef(def, { ...males[0] }), male, 'An adult keeps the same cached variant after reloading its identity');
    assert.equal(drawDef(def, females[0]), def);
    for (const adult of adults) {
      const juvenile = { ...adult, juvenile: true };
      assert.equal(isMaleVariant(def, juvenile), false);
      const young = drawDef(def, juvenile);
      assert.equal(young, def, `${map}/${key}: all juveniles use the unadorned model`);
      assert(!young.sprite.antlers && !young.sprite.mane);
    }
    const baseModel = buildSpecies(def), maleModel = buildSpecies(male);
    for (const model of [baseModel, maleModel]) for (const attr of Object.values(model.geo.attributes)) {
      assert([...attr.array].every(Number.isFinite), `${map}/${key}: finite model attributes`);
    }
    const baseHead = bounds(baseModel, 8), maleHead = bounds(maleModel, 8);
    const baseBody = bounds(baseModel, 0).getSize(new Vector3()), maleBody = bounds(maleModel, 0).getSize(new Vector3());
    assert(maleBody.x > baseBody.x && maleBody.z > baseBody.z, `${map}/${key}: males are visibly larger`);
    if (key === 'lion') {
      assert(maleHead.getSize(new Vector3()).z > baseHead.getSize(new Vector3()).z * 1.4, 'The male mane widens the head silhouette');
      // Both sexes keep the dark tuft, including the maneless base model.
      for (const model of [baseModel, maleModel]) {
        const colors = model.geo.attributes.color, parts = model.geo.attributes.aPart;
        const body = model.geo.attributes.position, tail = bounds(model, 5);
        const tipColors = new Set();
        for (let i = 0; i < colors.count; i++) if (parts.getX(i) === 5 && body.getX(i) < tail.min.x + def.sprite.h * 0.25) {
          tipColors.add([colors.getX(i), colors.getY(i), colors.getZ(i)].map(c => c.toFixed(4)).join(','));
        }
        assert(tipColors.size > 1, 'The lion tail has a contrasting tuft');
      }
    } else {
      // Compare against the same male body without its antlers, isolating the rack from size changes.
      const bare = buildSpecies({ ...male, sprite: { ...male.sprite, antlers: false } });
      assert(maleHead.max.y > bounds(bare, 8).max.y + male.sprite.h * 0.35, `${map}/${key}: rack rises above the ears`);
      // Low-poly cylinders have slightly different extrema after mirrored rotations.
      assert(Math.abs(maleHead.min.z + maleHead.max.z) < male.sprite.h * 0.002, `${map}/${key}: both antlers form a symmetric rack`);
      assert(maleHead.min.z < bounds(bare, 8).min.z && maleHead.max.z > bounds(bare, 8).max.z, `${map}/${key}: antlers extend on both sides of the head`);
      bare.geo.dispose();
    }
    baseModel.geo.dispose(); maleModel.geo.dispose(); checked++;
  }
}
console.log(`${checked} lion/deer adult splits passed: stable identity, bare-headed juveniles, distinct silhouettes, and valid geometry.`);
