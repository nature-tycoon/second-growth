// Adult appearances must remain stable, with bare-headed juveniles and distinct adult geometry.
// Run: node tools/animal-variant-check.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const { loadAnimals, ANIMAL, drawDef, isMaleVariant } = await import('../js/data/animals.js');
const { buildSpecies } = await import('../js/render3d/fauna.js');
const { Box3, Vector3, Color } = await import('three');
const targets = { serengeti: ['lion', 'impala'], pnw: ['deer', 'elk', 'woodduck', 'mallard'], atlanta: ['deer', 'woodduck'], chinandega: ['deer'], sumatra: ['sambar'] };
function bounds(model, part) {
  const box = new Box3(), p = model.geo.attributes.position, parts = model.geo.attributes.aPart;
  for (let i = 0; i < p.count; i++) if (parts.getX(i) === part) box.expandByPoint(new Vector3().fromBufferAttribute(p, i));
  assert(!box.isEmpty());
  return box;
}
function colorCount(model, part, hex) {
  const expected = new Color(hex), c = model.geo.attributes.color, parts = model.geo.attributes.aPart;
  let count = 0;
  for (let i = 0; i < c.count; i++) if (parts.getX(i) === part && Math.abs(c.getX(i) - expected.r) < 1e-6 && Math.abs(c.getY(i) - expected.g) < 1e-6 && Math.abs(c.getZ(i) - expected.b) < 1e-6) count++;
  return count;
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
      assert(!young.sprite.antlers && !young.sprite.mane && !young.sprite.lyre && !young.sprite.fancy && !young.sprite.collar);
    }
    const baseModel = buildSpecies(def), maleModel = buildSpecies(male);
    for (const model of [baseModel, maleModel]) for (const attr of Object.values(model.geo.attributes)) {
      assert([...attr.array].every(Number.isFinite), `${map}/${key}: finite model attributes`);
    }
    const baseHead = bounds(baseModel, 8), maleHead = bounds(maleModel, 8);
    const baseBody = bounds(baseModel, 0).getSize(new Vector3()), maleBody = bounds(maleModel, 0).getSize(new Vector3());
    if (def.sprite.kind === 'duck') {
      assert(colorCount(maleModel, 8, male.sprite.head) > 20, `${map}/${key}: drake has its green head`);
      assert.equal(colorCount(baseModel, 8, male.sprite.head), 0, `${map}/${key}: hen lacks drake plumage`);
      for (const model of [baseModel, maleModel]) for (const part of [6,7]) assert(colorCount(model, part, def.sprite.speculum) > 0, `${map}/${key}: both wings retain their coloured speculum`);
      const colors = baseModel.geo.attributes.color, parts = baseModel.geo.attributes.aPart, mottled = new Set();
      for (let i = 0; i < colors.count; i++) if (parts.getX(i) === 0) mottled.add([colors.getX(i), colors.getY(i), colors.getZ(i)].map(c => c.toFixed(3)).join(','));
      assert(mottled.size > 50, `${map}/${key}: hen has mottled feather colours`);
      if (key === 'woodduck') {
        assert(colorCount(baseModel, 8, '#f0ece3') > 20, 'Wood duck hen has a white eye patch');
        assert.equal(colorCount(maleModel, 8, '#f0ece3'), 0, 'Wood duck drake uses stripes instead of the hen eye patch');
        assert(maleHead.min.x < baseHead.min.x - def.sprite.size * 0.02, 'Wood duck drake has a longer swept crest');
        assert(colorCount(maleModel, 8, male.sprite.eye) > 0, 'Wood duck drake has red eyes');
      } else {
        assert(colorCount(maleModel, 8, '#f4efde') > 20, 'Mallard drake has a white neck collar');
        assert.equal(colorCount(baseModel, 8, '#f4efde'), 0, 'Mallard hen has no drake collar');
        assert(colorCount(maleModel, 5, '#252a24') > 0, 'Mallard drake has curled dark tail feathers');
      }
    } else if (key === 'impala') {
      assert(maleBody.x > baseBody.x && maleBody.z > baseBody.z, 'Impala ram is slightly larger');
      const bare = buildSpecies({ ...male, sprite: { ...male.sprite, lyre: false } });
      const bareHead = bounds(bare, 8);
      assert(maleHead.max.y > bareHead.max.y + male.sprite.h * 0.5, 'Impala ram horns rise above the ears');
      assert(maleHead.min.z < bareHead.min.z && maleHead.max.z > bareHead.max.z, 'Impala has horns on both sides');
      assert(Math.abs(maleHead.min.z + maleHead.max.z) < male.sprite.h * 0.002, 'Impala horns form a symmetric lyre');
      assert.equal(colorCount(baseModel, 8, '#25211c'), 0, 'Impala female has no horn geometry');
      bare.geo.dispose();
    } else if (key === 'lion') {
      assert(maleBody.x > baseBody.x && maleBody.z > baseBody.z, `${map}/${key}: males are visibly larger`);
      assert(maleHead.getSize(new Vector3()).z > baseHead.getSize(new Vector3()).z * 1.4, 'The male mane widens the head silhouette');
      const coat = new Color(male.sprite.color), maneVertices = [];
      const p = maleModel.geo.attributes.position, c = maleModel.geo.attributes.color, parts = maleModel.geo.attributes.aPart;
      // The warm brown mane differs from the neutral dark mouth/whisker markings.
      for (let i = 0; i < p.count; i++) if (parts.getX(i) === 8 && c.getX(i) > 0.05 && c.getX(i) > c.getY(i) * 2 && c.getX(i) < coat.r * 0.7 && c.getY(i) < coat.g * 0.8) maneVertices.push(p.getX(i));
      assert(maneVertices.length > 100, 'The male has a substantial dark mane');
      assert(Math.max(...maneVertices) < male.sprite.len * 0.5 + male.sprite.h * 0.2, 'The mane frames the back of the head without covering the face');
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
      assert(maleBody.x > baseBody.x && maleBody.z > baseBody.z, `${map}/${key}: males are visibly larger`);
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
console.log(`${checked} adult splits passed: stable identity, juvenile exclusions, paired horns/antlers, duck plumage, and valid geometry.`);
