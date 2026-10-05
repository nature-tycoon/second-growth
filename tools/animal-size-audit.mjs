// Audit the actual adult display bounds, including visibility tuning and adult male variants.
// Run: node tools/animal-size-audit.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const { loadAnimals, ANIMALS } = await import('../js/data/animals.js');
const { buildSpecies } = await import('../js/render3d/fauna.js');
const { adultAnimalScale, ANIMAL_MODEL_UNIT } = await import('../js/render3d/animal-scale.js');
const maps = ['pnw', 'atlanta', 'amazon', 'reef', 'sumatra', 'chinandega', 'serengeti'], rows = [];
for (const map of maps) {
  loadAnimals((await import(`../js/data/animals-${map}.js`)).default);
  for (const def of ANIMALS) for (const male of [false, ...(def.sprite.male ? [true] : [])]) {
    const sprite = male ? { ...def.sprite, ...def.sprite.male } : def.sprite;
    const { geo } = buildSpecies({ ...def, sprite });
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    const flyMin = [...min], flyMax = [...max], p = geo.attributes.position, part = geo.attributes.aPart, ext = geo.attributes.aExt;
    for (const [name, a] of Object.entries(geo.attributes)) for (const v of a.array) assert(Number.isFinite(v), `${map}/${def.key}/${name} must be finite`);
    for (const i of geo.index.array) assert(i < p.count, `${map}/${def.key}: invalid vertex index`);
    for (let i = 0; i < p.count; i++) for (let k = 0; k < 3; k++) {
      const v = p.array[i * 3 + k], fly = part.getX(i) >= 5 && part.getX(i) <= 7 ? ext.array[i * 3 + k] : v;
      min[k] = Math.min(min[k], v); max[k] = Math.max(max[k], v);
      flyMin[k] = Math.min(flyMin[k], fly); flyMax[k] = Math.max(flyMax[k], fly);
    }
    const sc = adultAnimalScale(sprite), dims = max.map((v, k) => v - min[k]);
    assert(sc > 0 && Number.isFinite(sc), `${map}/${def.key}: invalid display scale`);
    rows.push({ map, key: def.key, variant: male ? 'male' : 'default', name: def.name, sci: def.sci, kind: sprite.kind,
      scale: sprite.scale ?? 1, show: sprite.show ?? 1, model: dims, world: dims.map(v => v * sc),
      spread: flyMax.map((v, k) => (v - flyMin[k]) * sc), sprite });
    geo.dispose();
  }
}
const at = (map, key) => rows.find(r => r.map === map && r.key === key && r.variant === 'default');
const height = (map, key) => at(map, key).world[1], length = (map, key) => at(map, key).world[0];
// Relative-size regressions for the outliers found during the audit, rather than exact tuning values.
assert(height('serengeti', 'giraffe') > height('serengeti', 'elephant'));
assert(height('serengeti', 'elephant') > height('serengeti', 'ostrich'));
assert(height('serengeti', 'ostrich') > height('serengeti', 'secretary'));
assert(height('serengeti', 'secretary') > height('serengeti', 'crane'));
assert(height('serengeti', 'crane') < height('serengeti', 'zebra') * 0.85);
assert(length('serengeti', 'lion') > length('serengeti', 'cheetah') * 1.1);
assert(length('sumatra', 'clouded') < length('sumatra', 'tiger') * 0.75);
assert(height('sumatra', 'sambar') < height('sumatra', 'gajah'));
assert(height('pnw', 'heron') < height('pnw', 'deer'));
assert(Math.abs(height('pnw', 'heron') - height('atlanta', 'heron')) < 1e-6);
assert(length('reef', 'dugong') > length('reef', 'shark'));
assert(at('reef', 'manta').world[2] > at('reef', 'greenturtle').world[2]);
assert(adultAnimalScale({ scale: 0.7, show: 3 }, false) === ANIMAL_MODEL_UNIT * 0.7, 'Disabling visibility boosts must retain proportion tuning');
const baselineURL = new URL('./map-audit-output/animal-size-audit-before.json', import.meta.url);
let changes = [];
if (fs.existsSync(baselineURL)) {
  const before = JSON.parse(fs.readFileSync(baselineURL, 'utf8'));
  for (const row of rows.filter(r => r.variant === 'default')) {
    const old = before.find(r => r.map === row.map && r.key === row.key);
    if (!old) continue;
    assert(row.show === old.show, `${row.map}/${row.key}: preserve existing display/visibility tuning`);
    const ratio = adultAnimalScale(row.sprite) / adultAnimalScale(old.sprite);
    if (Math.abs(ratio - 1) > 1e-6) changes.push({ map: row.map, key: row.key, name: row.name, factor: ratio, before: old.world, after: row.world });
  }
}
const output = new URL('./map-audit-output/animal-size-audit.json', import.meta.url);
fs.mkdirSync(new URL('./map-audit-output/', import.meta.url), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ rows, changes }, null, 2));
console.log(`${rows.length} models and adult variants; ${new Set(rows.map(r => r.sci)).size} distinct species; ${maps.length} maps. Geometry, relative-size, and visibility-preservation checks passed.`);
for (const c of changes) console.log(`${c.map}/${c.key}: ${Math.round((c.factor - 1) * 100)}% · height ${c.before[1].toFixed(2)} → ${c.after[1].toFixed(2)} tiles`);
