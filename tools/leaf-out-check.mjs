// Gradual leaf-out and leaf fall, drawing only (plantPhaseOn in js/data/plants.js, the day's
// redraw in js/render3d/flora-changes.js): plants don't all change on the first of the month.
// node tools/leaf-out-check.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const root = new URL('../js/', import.meta.url).href;
const { Game } = await import(root + 'game.js');
const { plantPhaseOn, plantPhase, DAY_PHASED } = await import(root + 'data/plants.js');
const { FloraChanges } = await import(root + 'render3d/flora-changes.js');
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
const g = new Game(); g.newGame(1987, undefined, undefined, 'pnw', 7);
const w = g.world, P = g.catalog.plants;
const leafy = []; // [plant, x, y] for every deciduous tree and bush on the farm
for (let i = 0; i < w.n; i++) for (const id of [w.tree[i], w.shrub[i]]) if (id && DAY_PHASED(P[id]) && P[id].layer > 0 && !P[id].look.bloom?.includes(0)) leafy.push([P[id], i % w.w, (i / w.w) | 0]);
const leafed = (p, x, y, d) => ['spring', 'green'].includes(plantPhaseOn(p, 120 + d, x, y)); // (bloom and fruit go by the month, a few days either way)
const outDay = (p, x, y) => { for (let d = -20; d < 40; d++) if (leafed(p, x, y, d)) return d; return 99; };

check('spring leaf-out spreads over two to four weeks, not one day', () => {
  assert.ok(leafy.length > 20, `${leafy.length} deciduous plants`);
  const days = leafy.map(([p, x, y]) => outDay(p, x, y)).filter(d => d < 99).sort((a, b) => a - b);
  const q = f => days[Math.floor(f * (days.length - 1))];
  const spread = q(0.9) - q(0.1);
  assert.ok(spread >= 5 && spread <= 20, `10%..90% leafed out over ${spread} days (${q(0.1)}..${q(0.9)}); a month is 10`);
});

check('bushes leaf out first, oaks last; the same plant is the same every year', () => {
  const med = pick => { const d = leafy.filter(pick).map(([p, x, y]) => outDay(p, x, y)).filter(d => d < 99).sort((a, b) => a - b); return d[d.length >> 1]; };
  const bushes = med(([p]) => p.layer === 1), trees = med(([p]) => p.layer === 2 && !p.leafOut);
  assert.ok(bushes < trees, `bushes ${bushes}, trees ${trees}`);
  const oak = P.find(p => p?.key === 'oak');
  const oakDay = [...Array(40)].map((_, k) => outDay(oak, k, 7)).sort((a, b) => a - b)[20];
  assert.ok(oakDay >= trees + 4, `oaks ${oakDay} vs other trees ${trees}`);
  const [p, x, y] = leafy[0];
  assert.equal(plantPhaseOn(p, 125, x, y), plantPhaseOn(p, 125 + 120 * 3, x, y));
});

check('autumn colour and leaf fall spread too; evergreen and tropical plants keep the month', () => {
  const fallen = leafy.map(([p, x, y]) => { for (let d = 70; d < 110; d++) if (plantPhaseOn(p, d, x, y) === 'winter') return d; return 110; }).sort((a, b) => a - b);
  assert.ok(fallen[Math.floor(fallen.length * 0.9)] - fallen[Math.floor(fallen.length * 0.1)] >= 4, 'leaf fall over days');
  const fir = P.find(p => p?.key === 'fir');
  for (let d = 0; d < 120; d += 7) assert.equal(plantPhaseOn(fir, d, 3, 3), plantPhase(fir, Math.floor(d / 10)));
});

check('the plant drawing redraws only the tiles that turned, a few a day in spring and none mid-summer', () => {
  const fc = new FloraChanges(24), count = r => r?.tiles ? r.tiles.reduce((a, b) => a + b, 0) : -1;
  g.day = 120 + 3; fc.remember(g, false); g.day++;
  const spring = count(fc.find(g, false));
  g.day = 120 + 54; fc.remember(g, false); g.day++;
  const summer = count(fc.find(g, false));
  assert.ok(spring > 20, `${spring} tiles redrawn on a spring day`);
  assert.ok(summer >= 0 && summer < spring / 4, `${summer} tiles on a summer day`);
});
console.log(`leaf-out-check: ${checks} passed`);
