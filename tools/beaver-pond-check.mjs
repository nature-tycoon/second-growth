// Beaver ponds, beaver meadows and wallows (decision 0034): node tools/beaver-pond-check.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { T, F, isWater } = await import('../js/config.js');
const { DAM_CELLS, DAM_SPAN, FRINGE, groundCentre } = await import('../js/sim/hollis-water.js');
const { damSiteOK, meadowYear, migrateMarkedPools, SITE_WET, SITE_OPEN, DAM_GAP, PENDING_DEEP, MEADOW_YEARS } = await import('../js/sim/beaver-ponds.js');
const { wallowVisit, wallowDay, wallowCount, wallowGround, WALLOW_POOL, wallower } = await import('../js/sim/wallows.js');
const { updateHydrology } = await import('../js/sim/environment.js');
const { compactSave } = await import('../js/saves.js');
const { ensureHome } = await import('../js/sim/home-range.js');
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
check('A beaver pond has a marsh margin on the saturated ground round it, which stays marsh meadow when it drains', () => {
  // (since terrain relief, 0044, a dam's water alone filled only the ditch's channel)
  const g = farm(), w = g.world, site = w.idx(54, 71); g.wildlife.buildDam(site); fill(g);
  const k = g.water.basins.findIndex(b => b.kind === 'dam'), b = g.water.basins[k];
  const margin = b.fringe.filter(i => w.waterOwner[i] === k && w.terrain[i] === T.MARSH);
  assert.ok(margin.length >= 10, `a marsh margin of ${margin.length} tiles`);
  for (const i of margin) assert.ok(groundCentre(g.water.corners(i)) <= b.usual + FRINGE + 1e-9, 'only ground just above the water');
  g.wildlife.breakDam(site); g.weather = 'clear'; for (let d = 0; d < 80; d++) g.dailyTick();
  const kept = margin.filter(i => w.meadow[i] && w.terrain[i] === T.MARSH).length;
  assert.ok(kept >= margin.length * 0.8, `${kept} of ${margin.length} margin tiles are marsh meadow`);
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
check('A broken dam\'s pool drains away in the rain and frees its creek for a new dam', () => {
  // (rain once held it at a third full for good, so beavers could never mend the best site on the creek)
  const g = farm(), w = g.world, site = w.idx(...GOOD); willows(g); g.wildlife.buildDam(site); fill(g);
  g.wildlife.breakDam(site); g.water.sync();
  assert.ok(g.water.basins.some(b => b.kind === 'receding'), 'the pool drains over days, not at once');
  g.weather = 'rain'; for (let k = 0; k < 120; k++) g.water.step(g);
  assert.ok(!g.water.basins.some(b => b.kind === 'receding'), 'after a wet season it is gone');
  assert.ok(damSiteOK(g, site), 'beavers can build there again');
});
check('A flood breaches a tended dam, which the beavers mend; one they left washes out', () => {
  const g = farm(), w = g.world, site = w.idx(...GOOD); g.wildlife.buildDam(site); fill(g);
  const b = () => g.water.basins.find(b => b.kind === 'dam'), full = b().volume;
  g.rng = () => 0; // (the flood hits every dam)
  w.featureAge[site] = 0; g.events.finishFlood(1.5, 0, 50);
  assert.equal(w.feature[site], F.DAM, 'the tended dam stands'); assert.ok(b().volume < full * 0.5, 'its pond dropped');
  w.featureAge[site] = 200; g.events.finishFlood(1.5, 0, 50);
  assert.notEqual(w.feature[site], F.DAM, 'the abandoned one washed out');
});
check('A beaver colony lives at its dam', () => {
  const g = farm(), w = g.world, site = w.idx(...GOOD); willows(g); g.wildlife.buildDam(site); fill(g); g.refreshEnvironment(); g.wildlife.computeSuitability();
  const def = g.catalog.animals.find(d => d.damBuilder), a = g.wildlife.spawn(def, GOOD[0] + 6.5, GOOD[1] + 0.5, { silent: true });
  a.juvenile = false; a.home = null; a.homeAfter = 0;
  assert.equal(ensureHome(g.wildlife, a, def)?.center, site);
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
check('A dam spans the creek bank to bank and its pond stops at the lowest bank (cinema-creeks s5)', () => {
  // (a dam was one tile, its pond held along the whole dam line by an invisible wall: at 54,71 the
  // channel is 3 tiles wide and water stood beside the dam 0.3 levels over the ground below it)
  const sites = [[54, 71], [54, 46], ...Array.from({ length: 12 }, (_, k) => null)];
  const g0 = farm(), creek = []; for (let i = 0; i < g0.world.n; i += 11) if (g0.world.terrain[i] === T.CREEK) creek.push(i);
  let spans = 0, tested = 0;
  for (const s of [...sites.filter(Boolean).map(([x, y]) => g0.world.idx(x, y)), ...creek]) {
    const g = farm(), w = g.world; g.wildlife.buildDam(s); fill(g);
    const b = g.water.basins.find(b => b.kind === 'dam' && b.site === s); if (!b) continue;
    tested++;
    const L = g.water.level(b), n = w.n, blocked = new Set(b.dam.map(([a, c]) => a * n + c));
    assert.ok(L <= b.crest + 1e-9, 'never over the crest');
    // no way round the dam under its water (other basins as walls, as the rebuild has them)
    const occupied = new Uint8Array(n); for (const o of g.water.basins) if (o !== b) { for (const v of o.cells) occupied[v.i] = 1; for (const i of o.fringe || []) occupied[i] = 1; }
    const lk = g.water.leak(s, b.axis, b.crest, blocked, occupied);
    assert.equal(lk, null, `dam at ${s % w.w},${(s / w.w) | 0}: water gets round it at ${lk?.level?.toFixed(3)} under its crest ${b.crest.toFixed(3)}`);
    // the whole channel across: every creek tile along the dam line next to the site is dammed
    const [ax, ay] = b.axis;
    for (const dir of [1, -1]) for (let k = 1; ; k++) {
      const x = s % w.w + ay * dir * k, y = ((s / w.w) | 0) - ax * dir * k;
      if (!w.inb(x, y) || g.water.base[w.idx(x, y)] !== T.CREEK) break;
      assert.ok(b.dam.some(e => e[0] === w.idx(x, y)), `creek tile ${x},${y} beside the dam is dammed`);
    }
    if (b.dam.length > 1) spans++;
    // drawn water stops at the dam: none carried onto the dry ground just below it
    for (const [, c] of b.dam) if (!isWater(w.terrain[c])) assert.ok(w.damEdges.some(e => e[1] === c));
  }
  assert.ok(tested >= 8 && spans >= 2, `${tested} dams, ${spans} wider than a tile`);
  // the pond fills to its crest, and a save keeps the crest and the dam's line
  const g = farm(), w = g.world, site = w.idx(54, 71); g.wildlife.buildDam(site); fill(g, 40);
  const b = g.water.basins.find(b => b.kind === 'dam');
  assert.ok(g.water.level(b) >= b.crest - .03, `filled to ${g.water.level(b).toFixed(2)} of ${b.crest.toFixed(2)}`);
  assert.ok(b.dam.length >= 3, `dam ${b.dam.length} tiles across a 3-tile channel`);
  const r = new Game(); assert.ok(r.restoreSave(compactSave(g.saveData())));
  const rb = r.water.basins.find(b => b.kind === 'dam');
  assert.equal(rb.crest, b.crest); assert.deepEqual(rb.dam, b.dam);
  assert.ok(Math.abs(r.water.level(rb) - g.water.level(b)) < 1e-6, 'same level after loading');
  // a bank lowered beside the dam, wider than a dam reaches, lets the pond out to it; raised back,
  // the pond backs up again (lowered only one tile wide, the beavers carry the dam across it)
  const [ex] = b.dam.reduce((m, e) => Math.abs(e[0] % w.w - 54) > Math.abs(m[0] % w.w - 54) ? e : m), dir = ex % w.w > 54 ? 1 : -1;
  const vs = []; for (let k = 0; k <= DAM_SPAN + 2; k++) for (let y = 70; y <= 74; y++) vs.push([ex % w.w + (dir > 0) + dir * k, y]); // (corners, from the dam end's outer edge)
  const was = vs.map(([x, y]) => w.vert(x, y));
  for (const [x, y] of vs) w.setVert(x, y, Math.min(w.vert(x, y), b.crest - .2)); w.hv++; g.water.sync();
  const low = g.water.basins.find(b => b.kind === 'dam');
  assert.ok(low.crest < b.crest - .1, `bank lowered: crest ${low.crest.toFixed(2)} of ${b.crest.toFixed(2)}`);
  const r2 = new Game(); assert.ok(r2.restoreSave(compactSave(g.saveData())));
  vs.forEach(([x, y], k) => { w.setVert(x, y, was[k]); r2.world.setVert(x, y, was[k]); }); w.hv++; r2.world.hv++; g.water.sync(); r2.water.sync();
  assert.equal(g.water.basins.find(b => b.kind === 'dam').crest, b.crest, 'raised again, it holds its old crest');
  assert.equal(r2.water.basins.find(b => b.kind === 'dam').crest, b.crest, 'also after a save made while the bank was low');
});
console.log(checks + ' beaver pond and wallow checks passed.');
