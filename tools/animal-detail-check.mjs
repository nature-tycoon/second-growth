// Keep the richer models within a deliberate mesh budget and preserve small anatomy details.
// Run: node tools/animal-detail-check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import { isPolishModel } from './animal-polish-targets.mjs';
register('./three-loader.mjs', import.meta.url);
const { loadAnimals, ANIMALS } = await import('../js/data/animals.js');
const { buildSpecies } = await import('../js/render3d/fauna.js');
const { Color } = await import('three');
const targets = new Set(['lion', 'jaguar', 'woodduck', 'mallard', 'impala']);
const baselinePath = new URL('./map-audit-output/detail-budget-before.json', import.meta.url);
const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : [];
const rows = [];
function coloredVertices(geo, part, hex) {
  const wanted = new Color(hex), c = geo.attributes.color, parts = geo.attributes.aPart, indices = [];
  for (let i = 0; i < c.count; i++) if (parts.getX(i) === part && Math.abs(c.getX(i) - wanted.r) < 1e-6 && Math.abs(c.getY(i) - wanted.g) < 1e-6 && Math.abs(c.getZ(i) - wanted.b) < 1e-6) indices.push(i);
  return indices;
}
for (const map of ['pnw', 'atlanta', 'amazon', 'reef', 'sumatra', 'chinandega', 'serengeti']) {
  loadAnimals((await import(`../js/data/animals-${map}.js`)).default);
  for (const def of ANIMALS) for (const male of [false, ...(def.sprite.male ? [true] : [])]) {
    const sprite = male ? { ...def.sprite, ...def.sprite.male } : def.sprite;
    const { geo } = buildSpecies({ ...def, sprite }), triangles = geo.index.count / 3;
    const before = baseline.find(r => r.map === map && r.key === def.key && r.male === male);
    if (!targets.has(def.key)) {
      if (before && !isPolishModel(sprite) && sprite.kind !== 'snake') assert.equal(triangles, before.triangles, `${map}/${def.key}: preserve models outside the detail pass`);
    } else {
      const limit = sprite.kind === 'duck' ? 22000 : def.key === 'impala' ? 18000 : def.key === 'jaguar' ? 45000 : 32000;
      assert(triangles < limit, `${map}/${def.key}: ${triangles} triangles exceeds the ${limit} budget`);
      if (before) assert(triangles > before.triangles, `${map}/${def.key}: detailed model adds geometry`);
      if (def.key === 'impala') for (const part of [1, 2, 3, 4]) {
        const toes = coloredVertices(geo, part, '#1a1612'), p = geo.attributes.position, pivot = geo.attributes.aPivot;
        assert(toes.length > 100, 'Each impala foot has two modeled hoof halves');
        let left = 0, right = 0;
        for (const i of toes) {
          const offset = p.getZ(i) - pivot.getZ(i);
          assert(Math.abs(offset) > sprite.h * 0.055 * 0.02, 'The cloven hoof retains its central gap');
          if (offset < 0) left++; else right++;
        }
        assert(left > 0 && right > 0, 'Both hoof halves are present');
      }
      if (def.key === 'lion' || def.key === 'jaguar') {
        const whiskers = coloredVertices(geo, 8, '#d5c7aa'), p = geo.attributes.position;
        assert(whiskers.length > 100, 'Whiskers belong to the animated head');
        const z = whiskers.map(i => p.getZ(i));
        assert(Math.max(...z) - Math.min(...z) > sprite.h * 0.7, 'Whiskers spread on both sides of the muzzle');
      }
      rows.push({ map, key: def.key, male, before: before?.triangles, triangles, limit });
    }
    geo.dispose();
  }
}
const output = new URL('./map-audit-output/', import.meta.url);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(new URL('animal-detail-budget.json', output), JSON.stringify(rows, null, 2));
console.log(`${rows.length} detailed models passed mesh budgets, split-hoof and whisker checks${baseline.length ? ', and unchanged geometry outside the detail and polish passes' : ''}.`);
