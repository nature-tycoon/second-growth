// Herbivore pressure (decision 0033): the kg/ha field adds up to the animals on the farm, browsers pick
// young trees by taste, thorns and thickets shelter saplings, elephants fell young trees, males rub
// saplings only in the rut, and every large herbivore and map has the data it needs.
//   node tools/herbivore-pressure-check.mjs
const root = new URL('../js/', import.meta.url).href;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import(root + 'game.js');
const { herbivoryDay, herbivoreKg, herbivoreTotals, herbivoreIndex, rubSapling, CELL } = await import(root + 'sim/herbivory.js');
const { browsePressure, grazedGrowth, grazedRecruitOdds, elephantFelled } = await import(root + 'sim/grazing.js');
const { REFERENCE, TILE_HA } = await import(root + 'data/eco-reference.js');
const { DAYS_PER_YEAR, T, F } = await import(root + 'config.js');

let failed = 0;
const check = (ok, what, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? ` (${detail})` : ''}`); if (!ok) failed++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// ---- data: every large plant-eater has a body mass, and every land map an intact biomass range
for (const map of ['pnw', 'serengeti', 'atlanta', 'amazon', 'sumatra', 'chinandega']) {
  const g = new Game(); g.newGame(1, 'free', 'standard', map);
  const big = g.catalog.animals.filter(d => !d.reef && d.move !== 'fly' && d.behavior.forage.some(f => f === 'grass' || f === 'browse') && (d.sprite.len || 0) >= 20);
  const missing = big.filter(d => !d.behavior.herbivore).map(d => d.key);
  check(!missing.length, `${map}: every large grazer and browser has kg`, missing.join(', '));
  const r = REFERENCE[map].herbivores;
  check(Array.isArray(r) && r[0] > 0 && r[1] > r[0], `${map}: intact herbivore biomass range`, String(r));
}

// ---- the field: kg/ha follows the animals and adds up to them
const g = new Game(); g.newGame(7, 'free', 'standard', 'pnw');
const w = g.world, cat = g.catalog, elk = cat.animal.elk, deer = cat.animal.deer;
const adult = def => def.mature * DAYS_PER_YEAR * 2;
const agents = [];
for (let k = 0; k < 6; k++) agents.push({ sp: elk.index, x: 30.5 + k * 0.3, y: 40.5, age: adult(elk), state: 'idle' });
for (let k = 0; k < 4; k++) agents.push({ sp: deer.index, x: 90.5, y: 20.5 + k * 0.3, age: adult(deer), state: 'idle' });
agents.push({ sp: deer.index, x: 90.5, y: 21.5, age: 1, state: 'idle' }); // (a fawn)
agents.push({ sp: elk.index, x: 60.5, y: 60.5, age: adult(elk), state: 'idle', leaving: true }); // (passing through, doesn't count)
const fake = { world: w, map: 'pnw', catalog: cat, rng: () => 0, month: 0, stats: {}, wildlife: { agents } };
w.herbivory = null;
herbivoryDay(fake);
const totals = herbivoreTotals(w), farmHa = w.n * TILE_HA;
const kgElk = 6 * 300, kgDeer = 4 * 55 + 55 * 0.35;
const eb = elk.behavior.herbivore.browse, db = deer.behavior.herbivore.browse;
check(near(totals.graze, (kgElk * (1 - eb) + kgDeer * (1 - db)) / farmHa, 0.01), 'grazer kg/ha adds up to the animals', `${totals.graze.toFixed(2)} kg/ha`);
check(near(totals.browse, (kgElk * eb + kgDeer * db) / farmHa, 0.01), 'browser kg/ha adds up to the animals', `${totals.browse.toFixed(2)} kg/ha`);
const at = (x, y, guild) => herbivoreKg(w, w.idx(x, y), guild);
check(at(31, 40, 'graze') > 10 * at(90, 80, 'graze') && at(31, 40, 'graze') > 50, 'pressure lands where the elk are, not across the farm', `${at(31, 40, 'graze').toFixed(0)} vs ${at(90, 80, 'graze').toFixed(1)} kg/ha`);
check(at(90, 21, 'browse') > at(31, 40, 'browse') * 0.2 && at(90, 21, 'browse') > at(60, 60, 'browse'), 'deer browse lands where the deer are');
// a running average: a day with no animals takes away only a share of it
const before = at(31, 40, 'graze');
fake.wildlife.agents = [];
herbivoryDay(fake);
const after = at(31, 40, 'graze');
check(after < before && after > before * 0.9, 'the field remembers the last month or two', `${before.toFixed(1)} -> ${after.toFixed(1)}`);
check(CELL >= 2 && w.herbivory.graze.length <= Math.ceil(w.n / (CELL * CELL)) + w.w, 'the field is a coarse grid');

// ---- browsing picks by taste
const flat = (kgBrowse, kgHeavy = 0) => { const f = w.herbivory; f.browse.fill(kgBrowse); f.graze.fill(0); f.heavy.fill(kgHeavy); };
const open = w.idx(100, 70);
w.feature[open] = 0; w.shrub[open] = 0; w.shrubG[open] = 0; w.terrain[open] = T.MEADOW ?? w.terrain[open];
flat(70);
const P = cat.plant, bp = k => browsePressure(w, open, P[k], 0.05);
check(bp('cedar') > bp('fir') && bp('fir') > bp('alder') && bp('alder') > bp('hemlock'), 'PNW: redcedar > Douglas-fir > alder > hemlock', ['cedar', 'fir', 'alder', 'hemlock'].map(k => `${k} ${bp(k).toFixed(2)}`).join(', '));
check(grazedGrowth(w, open, P.cedar, 0.05) < grazedGrowth(w, open, P.hemlock, 0.05), 'browsed redcedar grows slower than hemlock');
check(grazedGrowth(w, open, P.alder, 0.05) > grazedGrowth(w, open, P.fir, 0.05), 'a resprouting alder keeps more of its growth than Douglas-fir');
check(grazedGrowth(w, open, P.cedar, 0.05) < 0.1, 'a favourite that does not resprout is held in the browse trap', grazedGrowth(w, open, P.cedar, 0.05).toFixed(2));
check(grazedRecruitOdds(w, open, P.cedar) < grazedRecruitOdds(w, open, P.alder), 'fewer redcedar seedlings get away than alder');
check(browsePressure(w, open, P.fir, 0.6) === 0, "a tree above browsers' reach is out of it");
flat(0);
check(bp('cedar') === 0 && grazedGrowth(w, open, P.cedar, 0.05) >= 0.999, 'no browsers, no browsing');
flat(70);
w.shrub[open] = P.rose.id; w.shrubG[open] = 0.8;
const sheltered = bp('cedar');
w.shrub[open] = 0; w.shrubG[open] = 0;
check(sheltered < bp('cedar') * 0.5, 'a sapling inside a wild rose is sheltered from most browsing', `${sheltered.toFixed(2)} vs ${bp('cedar').toFixed(2)}`);
w.feature[open] = F.BRUSH;
check(bp('cedar') < 0.2 * herbivoreIndex(w, open, 'browse'), 'a brush pile shelters it too');
w.feature[open] = 0;

// thorns: the Serengeti's acacias take less of it than an unarmed tree of the same taste
const sg = new Game(); sg.newGame(7, 'free', 'standard', 'serengeti');
const sw = sg.world, sp = sg.catalog.plant, si = sw.idx(60, 45);
herbivoryDay({ world: sw, map: 'serengeti', catalog: sg.catalog, wildlife: { agents: [] } });
sw.herbivory.browse.fill(150); sw.herbivory.heavy.fill(0); sw.shrub[si] = 0; sw.feature[si] = 0;
check(browsePressure(sw, si, sp.umbrella, 0.05) < browsePressure(sw, si, sp.commiphora, 0.05) * 0.7, 'thorny umbrella thorn is browsed less than corkwood', `${browsePressure(sw, si, sp.umbrella, 0.05).toFixed(2)} vs ${browsePressure(sw, si, sp.commiphora, 0.05).toFixed(2)}`);
check(browsePressure(sw, si, sp.euphorbia, 0.05) < 0.05, 'the toxic candelabra tree is left alone');
// elephants: with them, young trees come down; without, never
let felled = 0, rolls = 0;
const roll = () => (rolls++ * 0.618034) % 1;
sw.herbivory.heavy.fill(150); sw.herbivory.hasHeavy = true;
for (let k = 0; k < 2000; k++) if (elephantFelled(sw, si, sp.umbrella, 0.3, roll)) felled++;
check(felled > 0 && felled < 40, 'elephants push over a young tree now and then', `${felled} in 2000 days`);
sw.herbivory.heavy.fill(0);
let none = 0;
for (let k = 0; k < 2000; k++) if (elephantFelled(sw, si, sp.umbrella, 0.3, roll)) none++;
check(none === 0, 'no elephants, no felling');

// ---- rubbing: antlered males fray saplings in the rut only
const ri = w.idx(50, 50);
const bull = { sp: elk.index, x: 50.5, y: 50.5, age: adult(elk) * 3, state: 'idle', id: 0 };
let maleId = 0;
while (!(((maleId * 7919) % 100) / 100 < (elk.sprite.maleShare ?? 0.5))) maleId++;
bull.id = maleId;
const rubs = month => {
  let hits = 0;
  for (let k = 0; k < 400; k++) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = w.idx(50 + dx, 50 + dy); w.tree[j] = P.fir.id; w.treeG[j] = 0.3; w.terrain[j] = T.MEADOW ?? w.terrain[j]; }
    const game = { world: w, catalog: cat, month, rng: Math.random, stats: {} };
    rubSapling(game, bull, elk, 50, 50);
    hits += game.stats.saplingsRubbed || 0;
  }
  return hits;
};
check(rubs(7) > 20, 'a bull elk rubs saplings in the rut', `${rubs(7)} of 400 days`);
check(rubs(2) === 0, 'and not in spring');

console.log(failed ? `${failed} herbivore pressure checks failed.` : 'All herbivore pressure checks passed.');
process.exit(failed ? 1 : 0);
