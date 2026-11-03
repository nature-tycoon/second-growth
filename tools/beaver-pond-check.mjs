// Beaver ponds, beaver meadows and wallows (decision 0034): node tools/beaver-pond-check.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { T, F, isWater } = await import('../js/config.js');
const { DAM_CELLS } = await import('../js/sim/hollis-water.js');
const { damSiteOK, meadowYear, migrateMarkedPools, SITE_WET, SITE_OPEN, DAM_GAP, PENDING_DEEP, MEADOW_YEARS } = await import('../js/sim/beaver-ponds.js');
const { wallowVisit, wallowDay, wallowCount, wallowGround, WALLOW_POOL, wallower } = await import('../js/sim/wallows.js');
const { updateHydrology } = await import('../js/sim/environment.js');
const { compactSave } = await import('../js/saves.js');
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
const { PLANT } = await import('../js/data/plants.js');
const { mulberry32 } = await import('../js/rng.js');
const farm = (map = 'pnw') => { const g = new Game(); g.newGame(1987, 'free', 'standard', map); g.autosave = false; return g; };
// (willow along the creek, as a restored farm grows: beaver food)
const willows = g => { const w = g.world; for (let i = 0; i < w.n; i++) if (!isWater(w.terrain[i]) && !w.shrub[i] && !w.tree[i] && w.distWater[i] <= 3 && i % 3 === 0) w.setPlant(i, PLANT.willow, 0.8, 600); };
const fill = (g, days = 30) => { g.weather = 'rain'; for (let k = 0; k < days; k++) g.water.step(g); };
const pondTiles = (g, b) => b.cells.reduce((n, v) => n + (g.world.terrain[v.i] === T.POND ? 1 : 0), 0);
const wetTiles = (g, b) => b.cells.reduce((n, v) => n + (g.world.terrain[v.i] === T.POND || g.world.terrain[v.i] === T.MARSH ? 1 : 0), 0);
const GOOD = [54, 46]; // (a slow stretch of Hollis Farm's creek: a dam here makes a real pond)

check('A dam backs up a distinct pond: open water in the middle, marsh at the edge, never past DAM_CELLS', () => {
  const g = farm(), w = g.world; g.wildlife.buildDam(w.idx(...GOOD)); fill(g);
  const b = g.water.basins.find(b => b.kind === 'dam');
  const open = pondTiles(g, b), wet = wetTiles(g, b);
  assert.ok(open >= SITE_OPEN && open >= wet * 0.4, `open water ${open} of ${wet}`);
  assert.ok(wet >= SITE_WET && wet <= DAM_CELLS, `pond of ${wet} tiles`);
  assert.ok(b.crest - Math.min(...g.water.corners(b.site)) <= 0.6 + 1e-9, 'a dam stands at most about 1.4 m');
  // every dam anywhere on the creek stays within the size limit
  for (let i = 0; i < w.n; i += 7) if (w.terrain[i] === T.CREEK) {
    const h = farm(); h.wildlife.buildDam(i); fill(h, 20);
    const d = h.water.basins.find(b => b.kind === 'dam'); if (d) assert.ok(wetTiles(h, d) <= DAM_CELLS, `dam at ${i % w.w},${(i / w.w) | 0}: ${wetTiles(h, d)} tiles`);
  }
});
check('Beavers dam slow stretches with room and food, and leave flowing creek between ponds', () => {
  const g = farm(), w = g.world; willows(g);
  let ok = 0, steep = 0;
  for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.CREEK) { if (damSiteOK(g, i)) ok++; else if (g.water.damPotential(i).wet < SITE_WET) steep++; }
  assert.ok(ok > 0, 'somewhere to build'); assert.ok(steep > 0, 'steep riffles are passed over');
  g.wildlife.buildDam(w.idx(...GOOD)); fill(g, 10);
  for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.CREEK && damSiteOK(g, i)) {
    const x = i % w.w, y = (i / w.w) | 0;
    assert.ok(Math.max(Math.abs(x - GOOD[0]), Math.abs(y - GOOD[1])) > DAM_GAP, 'no dam crowding another');
    assert.ok(!(w.waterOwner[i] >= 0 && g.water.basins[w.waterOwner[i]].kind === 'dam'), 'no dam inside another pond');
  }
});
check('A drained beaver pond becomes meadow, and its marsh dries back over the decades', () => {
  const g = farm(), w = g.world, site = w.idx(...GOOD); g.wildlife.buildDam(site); fill(g);
  const was = w.terrain.slice();
  g.wildlife.breakDam(site);
  assert.ok(w.meadow.some(m => m === PENDING_DEEP), 'its open water waits to become meadow');
  g.weather = 'clear'; for (let k = 0; k < 80; k++) g.dailyTick();
  let marsh = 0, meadow = 0; for (let i = 0; i < w.n; i++) if (w.meadow[i]) { meadow++; if (w.terrain[i] === T.MARSH) marsh++; }
  assert.ok(meadow >= SITE_WET && marsh >= SITE_OPEN, `meadow ${meadow}, marsh ${marsh}`);
  for (let i = 0; i < w.n; i++) if (was[i] === T.CREEK && g.water.base[i] === T.CREEK) assert.equal(w.terrain[i], T.CREEK, 'the creek runs through again');
  // (its own random numbers: a few dozen tiles each drying at 5% a year; about 15% are left at 40)
  const m0 = marsh; g.rng = mulberry32(40);
  for (let y = 0; y < 40; y++) meadowYear(g);
  let left = 0; for (let i = 0; i < w.n; i++) if (w.meadow[i] && w.terrain[i] === T.MARSH) left++;
  assert.ok(left < m0 * 0.4, `marsh after 40 years: ${left} of ${m0}`);
  for (let y = 0; y < MEADOW_YEARS; y++) meadowYear(g);
  assert.ok(w.meadow.every(m => !m), 'after decades it is ordinary ground');
});
check('Old saves: beaver pools kept by marks go back to creek and meadow under the water model', () => {
  const g = farm(), w = g.world, i = w.idx(...GOOD), j = w.idx(GOOD[0] + 2, GOOD[1]);
  w.terrain[i] = T.POND; w.marks[i] |= 16; w.terrain[j] = T.MARSH; w.marks[j] |= 32;
  migrateMarkedPools(w);
  assert.equal(w.terrain[i], T.CREEK); assert.equal(w.terrain[j], T.MARSH); assert.ok(w.meadow[j] > 0);
  assert.equal(w.marks[i] & 48, 0); assert.equal(w.marks[j] & 48, 0);
});
check('Wallows: worn by the heavy herbivores, full in the rains, dry in the dry season, and pools for frogs', () => {
  const g = farm('serengeti'), w = g.world;
  const def = g.catalog.animals.find(d => d.key === 'buffalo'), a = g.wildlife.agents.find(a => a.sp === def.index) || g.wildlife.spawn(def, 60, 40, { silent: true });
  assert.ok(wallower(def) && !wallower(g.catalog.animals.find(d => d.key === 'hippo')), 'buffalo wallow; hippos live in the water');
  const i = [...Array(w.n).keys()].find(i => wallowGround(w, i)); a.juvenile = false;
  g.rng = () => 0; // (always tries)
  assert.ok(wallowVisit(g, a, def, i)); assert.ok(w.wallow[i] > 0);
  const toMonth = m => { while (g.month !== m) g.day++; };
  toMonth(3); g.weather = 'rain'; for (let k = 0; k < 5; k++) wallowDay(g);
  assert.ok(w.wallowWet[i] >= WALLOW_POOL, 'rain fills it'); assert.ok(w.wallowWet[i] <= w.wallow[i]);
  updateHydrology(w); assert.equal(w.distPond[i], 0, 'a wet wallow is a pool');
  const dry = g.mapDefinition.climate.rain.indexOf(Math.min(...g.mapDefinition.climate.rain));
  toMonth(dry); g.weather = 'clear'; for (let k = 0; k < 20; k++) wallowDay(g);
  assert.ok(w.wallowWet[i] < WALLOW_POOL, 'the dry season empties it');
  for (let k = 0; k < 3000 && w.wallow[i]; k++) { g.day++; g.weather = 'clear'; wallowDay(g); }
  assert.equal(w.wallow[i], 0, 'unused, it fills in');
  // never more than two per wallowing animal
  for (let k = 0; k < w.n; k++) if (wallowGround(w, k)) wallowVisit(g, a, def, k);
  const n = wallowCount(w).n, wallowers = g.wildlife.agents.filter(b => wallower(g.catalog.animals[b.sp])).length;
  assert.ok(n <= 2 * wallowers && n <= 40, `${n} wallows for ${wallowers} wallowers`);
});
check('Saves keep beaver meadows and wallows', () => {
  const g = farm(), w = g.world; w.meadow[100] = 7; w.wallow[200] = 90; w.wallowWet[200] = 40;
  const r = new Game(); assert.ok(r.restoreSave(compactSave(g.saveData())));
  assert.equal(r.world.meadow[100], 7); assert.equal(r.world.wallow[200], 90); assert.equal(r.world.wallowWet[200], 40);
});
console.log(checks + ' beaver pond and wallow checks passed.');
