// Audit the latest polish pass without changing unrelated species or display scales.
// Run: node tools/animal-polish-check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import { isPolishModel } from './animal-polish-targets.mjs';
register('./three-loader.mjs', import.meta.url);
const { loadAnimals, ANIMALS } = await import('../js/data/animals.js');
const { buildSpecies } = await import('../js/render3d/fauna.js');
const { Box3, Vector3, Color } = await import('three');
const directory = new URL('./map-audit-output/', import.meta.url);
const baselinePath = new URL('polish-budget-before.json', directory);
const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : [];
const rows = [];
function bounds(geo, part, filter = () => true) {
  const box = new Box3(), p = geo.attributes.position, parts = geo.attributes.aPart;
  for (let i = 0; i < p.count; i++) if (parts.getX(i) === part && filter(p.getX(i), p.getY(i), p.getZ(i))) box.expandByPoint(new Vector3().fromBufferAttribute(p, i));
  assert(!box.isEmpty(), `Animation part ${part} is present`);
  return box;
}
for (const map of ['pnw', 'atlanta', 'amazon', 'reef', 'sumatra', 'chinandega', 'serengeti']) {
  loadAnimals((await import(`../js/data/animals-${map}.js`)).default);
  for (const def of ANIMALS) for (const male of [false, ...(def.sprite.male ? [true] : [])]) {
    const sprite = male ? { ...def.sprite, ...def.sprite.male } : def.sprite;
    const { geo, motion } = buildSpecies({ ...def, sprite }), triangles = geo.index.count / 3;
    const before = baseline.find(row => row.map === map && row.key === def.key && row.male === male);
    if (!isPolishModel(sprite)) {
      if (before) assert.equal(triangles, before.triangles, `${map}/${def.key}: preserve geometry outside this pass`);
      geo.dispose(); continue;
    }
    assert(triangles < 25000, `${map}/${def.key}: mesh budget`);
    assert(motion.leg <= 0.42, `${map}/${def.key}: controlled walking swing`);
    bounds(geo, 8); bounds(geo, 5);
    for (const part of [1, 2, 3, 4]) {
      const foot = bounds(geo, part);
      assert(foot.min.y > -0.2 && foot.min.y < 0.03, `${map}/${def.key}: feet reach the ground without deeply penetrating it`);
    }
    if (sprite.kind === 'otter') {
      const body = bounds(geo, 0).getSize(new Vector3()), tail = bounds(geo, 5).getSize(new Vector3());
      assert(body.x / body.y > 3.5, 'Otters have a long, low torso');
      assert(tail.z > tail.y * 1.15, 'Otter tails are flattened across the swimming plane');
    }
    if (sprite.kind === 'giraffe') {
      const by = sprite.leg + sprite.h * 0.5;
      const low = bounds(geo, 8, (x, y) => y > by + sprite.h * 0.8 && y < by + sprite.h * 1.0).getSize(new Vector3());
      const high = bounds(geo, 8, (x, y) => y > by + sprite.h * 2.0 && y < by + sprite.h * 2.2).getSize(new Vector3());
      assert(low.z > high.z * 1.2, 'Giraffe neck tapers toward the skull');
    }
    if (sprite.kind === 'rhino') {
      const wanted = new Color('#3d3933'), c = geo.attributes.color, parts = geo.attributes.aPart, p = geo.attributes.position, piv = geo.attributes.aPivot;
      for (const part of [1, 2, 3, 4]) {
        let center = false, left = false, right = false;
        for (let i = 0; i < c.count; i++) if (parts.getX(i) === part && Math.abs(c.getX(i) - wanted.r) < 1e-6 && Math.abs(c.getY(i) - wanted.g) < 1e-6 && Math.abs(c.getZ(i) - wanted.b) < 1e-6) {
          const z = p.getZ(i) - piv.getZ(i), r = sprite.h * 0.13;
          if (Math.abs(z) < r * 0.1) center = true;
          if (z < -r * 0.6) left = true;
          if (z > r * 0.6) right = true;
        }
        assert(center && left && right, 'Each rhino foot has center and side toenails on its animated leg');
      }
    }
    rows.push({ map, key: def.key, triangles, before: before?.triangles });
    geo.dispose();
  }
}
assert.equal(rows.length, 11, 'All regional appearances in the five requested groups are covered');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(new URL('animal-polish-budget.json', directory), JSON.stringify(rows, null, 2));
console.log(`${rows.length} polished appearances passed mesh budgets, ground contact, tapered-neck and swimming-tail checks${baseline.length ? '; other species retained their mesh budgets' : ''}.`);
