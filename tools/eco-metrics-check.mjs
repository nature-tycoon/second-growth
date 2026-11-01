// The Ecosystem Report's metrics (decision 0031) on every map: finite, in range, stable across a
// save and reload, a baseline for older saves, badges, blue carbon, and a carbon scale that
// matches the published stand figures. Run: node tools/eco-metrics-check.mjs
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { BIOME_LIST } from '../js/biome.js';
import { T } from '../js/config.js';
import { ecoMetrics, ecoState, badgeList } from '../js/sim/eco-metrics.js';
import { REFERENCE, CARBON_FRACTION, TILE_HA } from '../js/data/eco-reference.js';
import { VITAL_NAMES, TIER_NAMES } from '../js/sim/eco-metrics.js';
import { tr } from '../js/i18n.js';
import '../js/lang/es.js';
import { readFileSync } from 'node:fs';

let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }
const g = new Game();
const finite = (v, path) => {
  if (typeof v === 'number') assert.ok(Number.isFinite(v), `${path} is ${v}`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) finite(x, `${path}.${k}`);
};
const nextMonth = () => { const prev = g.month; g.day += 10 - (g.day % 10); g.monthlyTick(prev); };

for (const map of BIOME_LIST) {
  check(`${map.id}: metrics are finite, in range, and have a reference`, () => {
    g.newGame(1987, 'free', 'standard', map.id);
    g.autosave = false;
    assert.ok(REFERENCE[map.id], 'the map has a reference ecosystem');
    const m = g.cache.eco;
    finite({ carbon: m.carbon, vitals: m.vitals.map(v => v.score), overall: m.overall, fw: m.foodWeb.score }, map.id);
    assert.equal(m.vitals.length, 6);
    for (const v of m.vitals) assert.ok(v.score >= 0 && v.score <= 1, `${v.key} = ${v.score}`);
    assert.ok(m.stage >= 0 && m.stage <= 4);
    assert.ok(m.vitals.some(v => v.key === m.weakest));
    if (!m.reference.reef) assert.ok(m.carbon.soil > 0 && m.carbon.total > 0, 'land holds carbon');
    const start = ecoState(g).start;
    assert.equal(start.day, 0); assert.equal(start.carbon, Math.round(m.carbon.total * 10) / 10);
    assert.equal(badgeList(g).length, 24);
  });

  check(`${map.id}: a month adds a history entry, and the numbers survive a save and reload`, () => {
    nextMonth(); nextMonth();
    const h = g.history.at(-1);
    assert.ok(Number.isFinite(h.c) && h.v.length === 6, 'history keeps carbon and the vital signs');
    // (water quality is derived state a reload recomputes, so compare against the same refresh)
    g.refreshEnvironment(); g.updateScore();
    const before = ecoMetrics(g), eco = structuredClone(ecoState(g));
    const data = structuredClone(g.saveData());
    g.newGame(2, 'free', 'standard', map.id === 'pnw' ? 'reef' : 'pnw');
    assert.equal(g.restoreSave(data), true);
    const after = g.cache.eco;
    assert.ok(Math.abs(after.carbon.total - before.carbon.total) < 1e-6, `carbon ${before.carbon.total} -> ${after.carbon.total}`);
    assert.deepEqual(after.vitals.map(v => v.score), before.vitals.map(v => v.score));
    assert.deepEqual(ecoState(g), eco);
  });

  check(`${map.id}: an older save without the report gets today's baseline`, () => {
    const data = structuredClone(g.saveData());
    delete data.stats.eco; data.day = 365;
    assert.equal(g.restoreSave(data), true);
    assert.equal(ecoState(g).start.day, 365);
  });
}

check('Carbon at the reference: a full mature stand holds the published figure', () => {
  for (const map of ['pnw', 'amazon', 'serengeti']) {
    g.newGame(1987, 'free', 'standard', map);
    const w = g.world, ref = REFERENCE[map];
    // every land tile a reference-height native tree, grown and old
    const tree = w.catalog.plants.find(p => p && p.layer === 2 && !p.invasive && !p.exotic && p.heightM);
    let tiles = 0;
    for (let i = 0; i < w.n; i++) if (w.terrain[i] !== T.RIVER && w.terrain[i] !== T.CREEK && w.terrain[i] !== T.POND && w.terrain[i] !== T.MARSH) {
      w.tree[i] = tree.id; w.treeG[i] = 1; w.treeAge[i] = 500 * 120; tiles++;
    }
    const m = ecoMetrics(g);
    const perHa = m.carbon.trees / (tiles * TILE_HA), size = Math.min(1.6, Math.max(0.3, tree.heightM / ref.href));
    assert.ok(Math.abs(perHa - ref.agb * CARBON_FRACTION * size) < 0.01, `${map}: ${perHa.toFixed(1)} t C/ha`);
  }
});

check('Badges: met on day one is the starting point; new ones are announced once', () => {
  g.newGame(1987, 'free', 'standard', 'pnw');
  const eco = ecoState(g), notes = [];
  for (const [k, d] of Object.entries(eco.badges)) assert.equal(d, -1, `${k} marked as met at the start`);
  g.on('notify', n => notes.push(n.text));
  g.cache.score.total = 95; eco.streak = 5;
  g.updateScore = () => g.cache.score; // (hold the score up for this month)
  nextMonth();
  delete g.updateScore;
  for (const k of ['health-gold', 'streak-gold']) assert.ok(eco.badges[k] > 0, k);
  assert.equal(notes.filter(t => t.startsWith('Badge earned: Health, gold')).length, 1);
  const n = notes.length; nextMonth();
  assert.equal(notes.filter(t => t.startsWith('Badge earned')).length, notes.slice(0, n).filter(t => t.startsWith('Badge earned')).length, 'no badge twice');
});

check('Blue carbon: seagrass mud buries carbon month by month on the reef', () => {
  g.newGame(1987, 'free', 'standard', 'reef');
  const w = g.world, sg = w.catalog.plant.halophila.id;
  for (let i = 0; i < 400; i++) if (w.terrain[i] === T.PASTURE || !w.ground[i]) { w.ground[i] = sg; w.groundG[i] = 1; }
  const b0 = ecoState(g).blue;
  nextMonth();
  assert.ok(ecoState(g).blue > b0);
  assert.ok(ecoMetrics(g).carbon.trees >= 0 && ecoMetrics(g).carbon.soil === 0, 'corals and seabed are not counted');
});

check('Spanish: every report string a land map shows is translated (Chinandega plays in Spanish)', () => {
  const src = readFileSync(new URL('../js/ui/eco-report.js', import.meta.url), 'utf8'), unq = s => s.replace(/\\'/g, "'");
  const literals = [...src.matchAll(/tr\('((?:[^'\\]|\\.)*)'\)/g)].map(m => unq(m[1]));
  const tables = [...src.matchAll(/^const (DESC|PART_NAMES|HINTS|GROUP_NAMES) = \{([\s\S]*?)\n\};/gm)].flatMap(m => [...m[2].matchAll(/: '((?:[^'\\]|\\.)*)'/g)].map(x => unq(x[1])));
  // (the reef's own signs only appear on the reef, which is English only)
  const reefOnly = /coral|reef|seagrass|algae|starfish|Blue carbon|sponge|lagoon|shade cloth/i;
  const all = [...literals, ...tables, ...Object.values(VITAL_NAMES), ...Object.values(TIER_NAMES), REFERENCE.chinandega.name, ...REFERENCE.chinandega.stages];
  const missing = all.filter(s => !reefOnly.test(s) && tr(s, 'es') === s);
  assert.deepEqual(missing, []);
  assert.ok(tr('Badge earned: Water, gold. See your collection in the Ecosystem Report.', 'es').startsWith('Ganaste una insignia: Agua, oro.'));
});

console.log(`\n${checks} checks passed`);
