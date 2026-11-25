// Beaver dams grow, fell the trees at their ends, spill when full, and are drawn the day after they
// are built (decision 0034; ideas batch waterfall-polish s4). node tools/beaver-dam-growth-check.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.document = { createElement: () => ({ getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };
const THREE = await import('three');
const { Game } = await import('../js/game.js');
const { Flora } = await import('../js/render3d/flora.js');
const { Terrain } = await import('../js/render3d/terrain.js');
const { T, F, LEVEL, DAYS_PER_YEAR } = await import('../js/config.js');
const { DAM_RAISE } = await import('../js/sim/hollis-water.js');
const { compactSave } = await import('../js/saves.js');
const { PLANT } = await import('../js/data/plants.js');
const { mulberry32 } = await import('../js/rng.js');
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
const farm = () => { Math.random = mulberry32(1987); const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw'); g.autosave = false; return g; };
const GOOD = [60, 45]; // (a slow stretch of Hollis Farm's creek: beaver-pond-check)
const damOf = (g, site) => g.water.basins.find(b => b.kind === 'dam' && b.site === site);
const pondTiles = (g, b) => b.cells.filter(v => g.world.terrain[v.i] === T.POND).length;
const rain = (g, days) => { g.weather = 'rain'; for (let k = 0; k < days; k++) g.water.step(g); g.weather = 'clear'; };
// (a colony at the dam, so damDay counts it tended; no rng in that, so the test doesn't rest on where a beaver wandered)
// (willow along the creek, as a restored farm grows: beaver food, so damDay's own food count keeps it tended)
const willows = g => { const w = g.world; for (let i = 0; i < w.n; i++) if (![T.POND, T.CREEK, T.RIVER, T.MARSH].includes(w.terrain[i]) && !w.shrub[i] && !w.tree[i] && w.distWater[i] <= 3 && i % 3 === 0) w.setPlant(i, PLANT.willow, 0.8, 600); };
const keepers = (g, site) => { willows(g); const w = g.world; g.wildlife.agents.push({ sp: g.catalog.animals.findIndex(a => a?.damBuilder), x: site % w.w + 0.5, y: ((site / w.w) | 0) + 0.5, home: { center: site } }); };

check('A new dam starts low and still makes a pond within a month; it is not full on day one', () => {
  const g = farm(), w = g.world, site = w.idx(...GOOD); g.wildlife.buildDam(site);
  const b = damOf(g, site);
  assert.equal(b.rise, 0); assert.ok(b.top > b.crest + 0.05, `starts under its full crest (${b.crest.toFixed(2)} of ${b.top?.toFixed(2)})`);
  assert.ok(!b.full, 'not spilling the day it is built');
  rain(g, 30);
  assert.ok(pondTiles(g, damOf(g, site)) >= 5, `a pond within a month: ${pondTiles(g, damOf(g, site))} tiles`);
});

check('Tended, it rises a step each building month to full height in its second building season, and its pond grows', () => {
  const g = farm(), w = g.world, site = w.idx(...GOOD); g.wildlife.buildDam(site); keepers(g, site);
  rain(g, 30); const small = pondTiles(g, damOf(g, site)), low = damOf(g, site).crest;
  let years = 0;
  for (let d = 0; d < 5 * DAYS_PER_YEAR && damOf(g, site).rise < 1; d++) {
    g.day++; g.wildlife.damDay(); g.water.step(g);
    years = d / DAYS_PER_YEAR;
  }
  const b = damOf(g, site);
  assert.equal(b.rise, 1, 'full height'); assert.ok(years >= 0.5 && years <= 2.5, `${years.toFixed(1)} years to full`);
  assert.ok(b.crest > low + 0.05 && b.top === undefined, 'at its full crest');
  rain(g, 30);
  assert.ok(pondTiles(g, b) > small, `the pond grew: ${small} -> ${pondTiles(g, damOf(g, site))} tiles`);
  assert.equal(w.feature[site], F.DAM);
  // an untended dam is not raised
  const h = farm(), s2 = h.world.idx(...GOOD); h.wildlife.buildDam(s2);
  for (let d = 0; d < DAYS_PER_YEAR; d++) { h.day++; h.wildlife.damDay(); if (h.world.feature[s2] !== F.DAM) break; }
  if (h.world.feature[s2] === F.DAM) assert.equal(damOf(h, s2).rise, 0, 'nobody tending it, nobody raising it');
});

check('A flood breach knocks it down, and a dam built over a draining pool starts low too', () => {
  const g = farm(), site = g.world.idx(...GOOD); g.wildlife.buildDam(site, 1); rain(g, 20);
  g.water.breachDam(site); g.water.sync();
  const b = damOf(g, site); assert.ok(b.rise < 1 && b.rise >= 0, `breached to ${b.rise}`);
  g.wildlife.breakDam(site); assert.ok(g.water.basins.some(b => b.kind === 'receding' && b.site === site), 'its pool is draining');
  g.wildlife.buildDam(site); assert.equal(damOf(g, site).rise, 0, 'a new dam over the old pool starts low');
});

check('Save/load keeps how far it is built; a save from before dams grew loads them full', () => {
  const g = farm(), w = g.world, site = w.idx(...GOOD); g.wildlife.buildDam(site); g.water.raiseDam(site, 3 * DAM_RAISE); g.water.sync(); rain(g, 20);
  const before = damOf(g, site), data = g.saveData();
  const r = new Game(); assert.ok(r.restoreSave(compactSave(data)));
  const after = damOf(r, site);
  assert.ok(Math.abs(after.rise - before.rise) < 1e-9, `rise ${before.rise} -> ${after.rise}`);
  assert.ok(Math.abs(after.crest - before.crest) < 1e-9 && Math.abs(after.top - before.top) < 1e-9, 'same crest, same full crest');
  // (an old save: no rise on its dams)
  const old = structuredClone(data), find = o => { if (o && typeof o === 'object') { if (Array.isArray(o.basins) && o.base) return o; for (const v of Object.values(o)) { const f = find(v); if (f) return f; } } return null; };
  const water = find(old); assert.ok(water, 'the save holds the water'); for (const b of water.basins) delete b.rise;
  const o = new Game(); assert.ok(o.restoreSave(compactSave(old)));
  assert.equal(damOf(o, site).rise, 1, 'an old dam loads at full height');
  assert.ok(Math.abs(damOf(o, site).crest - before.top) < 1e-9, 'at the crest it was built to');
});

check('Woody plants where the dam ends land on the banks are cut when it is built, saplings under them too', () => {
  const g = farm(), w = g.world, site = w.idx(54, 71), P = g.catalog.plants, id = k => P.find(p => p?.key === k).id;
  // (the dam's line found first, then the bank tiles under its ends planted)
  const probe = farm(); probe.wildlife.buildDam(site);
  const banks = [...new Set(damOf(probe, site).dam.flat())].filter(j => ![T.POND, T.CREEK, T.RIVER].includes(probe.world.terrain[j]));
  assert.ok(banks.length >= 2, `the dam reaches the banks: ${banks.length} tiles`);
  // an alder with a fir sapling waiting under it, a big old cedar, willow and salmonberry
  const [a, b] = banks;
  const put = (j, tree, g, shrub) => { w.tree[j] = id(tree); w.treeG[j] = g; w.shrub[j] = id(shrub); w.shrubG[j] = 0.8; w.feature[j] = 0; };
  put(a, 'alder', 0.6, 'salmonberry'); w.understory[a] = id('fir'); w.understoryG[a] = 0.3;
  put(b, 'cedar', 1.2, 'willow');
  assert.ok(w.tree[a] && w.tree[b] && w.shrub[a] && w.shrub[b], 'planted');
  g.wildlife.buildDam(site);
  for (const j of banks) assert.ok(!w.tree[j] && !w.understory[j], `tile ${j % w.w},${(j / w.w) | 0}: no tree through the mound`);
  assert.equal(w.shrub[a], 0, 'salmonberry cleared');
  assert.ok(w.shrub[b] === id('willow') && w.shrubG[b] <= 0.151, 'willow cut back to resprout');
  assert.equal(w.feature[b], F.LOG, 'the big cedar lies as a log');
});

check('Drawn: the mounds the day after it is built, lower than full, and the spill once it is full', () => {
  const g = farm(), w = g.world, site = w.idx(...GOOD), scene = new THREE.Scene(), flora = new Flora(scene, { catalog: g.catalog });
  flora.rebuild(g, true);
  const mounds = () => { const p = flora.pools.get('dam'); return p ? [...p.subs.values()].reduce((n, q) => n + q.n, 0) : 0; };
  const top = () => { const p = flora.pools.get('dam'), q = p && [...p.subs.values()].find(q => q.mesh?.count); if (!q) return NaN; const m = new THREE.Matrix4(), v = new THREE.Vector3(), r = new THREE.Quaternion(), sc = new THREE.Vector3(); let y = -Infinity; for (let k = 0; k < q.mesh.count; k++) { q.mesh.getMatrixAt(k, m); m.decompose(v, r, sc); y = Math.max(y, v.y + sc.y * 0.16); } return y; }; // (a mound's top: flora.js scales it (top - base) / 0.16)
  assert.equal(mounds(), 0, 'no dam yet');
  // built during a day's work, then the game runs on through the normal loop to the next day
  g.wildlife.buildDam(site);
  const day = g.day; g.speed = 3;
  for (let f = 0; f < 4000 && g.day < day + 1; f++) g.update(1 / 60);
  assert.ok(g.day >= day + 1, 'a day went by');
  let more = true; for (let k = 0; k < 400 && more; k++) more = flora.rebuild(g, false, 1);
  assert.ok(mounds() >= 1, 'the dam is drawn the next day');
  const lowBase = top();
  // raised to full: its mounds are drawn again, taller
  g.water.raiseDam(site, 1); g.water.sync(); g.day++; more = true; for (let k = 0; k < 400 && more; k++) more = flora.rebuild(g, false, 1);
  assert.ok(mounds() >= 1 && damOf(g, site).dam.length >= 1, 'still drawn');
  assert.ok(Number.isFinite(lowBase) && top() > lowBase + 0.02, `redrawn taller: ${lowBase.toFixed(3)} -> ${top().toFixed(3)}`);
  // the spill: a full dam's thin falling water over the channel (sheet and foam), on its own mesh, the sheet facing up and downstream
  rain(g, 30);
  const b = damOf(g, site); assert.ok(b.full, 'full'); assert.ok(w.damSpills?.some(d => d.site === site), 'published as spilling');
  const atlas = { tex: null, uv: {}, slot: {} };
  for (let s = 0; s < 4; s++) { atlas.uv[T.PASTURE + '|' + s + '|0'] = [0, 0, 1, 1]; atlas.slot[T.PASTURE + '|' + s + '|0'] = 0; }
  const t = new Terrain(new THREE.Scene(), atlas); t.setWorld(w, g.border); t.updateSurface(g);
  assert.ok(t.spills, 'a spill drawn'); const plain = farm(), tp = new Terrain(new THREE.Scene(), atlas); tp.setWorld(plain.world, plain.border); tp.updateSurface(plain);
  assert.equal(t.falls?.geometry.index.count ?? 0, tp.falls?.geometry.index.count ?? 0, 'the waterfalls\' mesh is as without the dam (the spill is its own)');
  const p = t.spills.geometry.attributes.position, fa = t.spills.geometry.attributes.aFall, ix = t.spills.geometry.index.array;
  const [ax, ay] = b.axis, down = new THREE.Vector3(ax, 0, ay).normalize().add(new THREE.Vector3(0, 1, 0)), v3 = k => new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k));
  for (let k = 0; k < ix.length; k += 3) { if (fa.getW(ix[k]) !== 0) continue; const a = v3(ix[k]), n = v3(ix[k + 1]).sub(a).cross(v3(ix[k + 2]).sub(a)); assert.ok(n.dot(down) > 0, `spill triangle ${k / 3} faces away`); }
  let hi = -Infinity, lo = Infinity; for (let k = 0; k < p.count; k++) { hi = Math.max(hi, p.getY(k)); lo = Math.min(lo, p.getY(k)); assert.ok(fa.getW(k) === 1 || fa.getZ(k) < 0.9, 'thinner than a fall'); assert.ok(fa.getW(k) < 1.5, 'no mist'); }
  const lip = (hi - 0.02) / LEVEL - 0.01; // (curtains ride 0.02 over their water; the lip 0.01 over the crest)
  assert.ok(Math.abs(lip - b.crest) < 0.02, `lip ${lip.toFixed(2)} at the crest ${b.crest.toFixed(2)}`);
  assert.ok(hi - lo > 0.05 * LEVEL, 'it falls');
  // a dam that isn't full draws none
  b.full = false; g.water.publish(); t.refreshWater();
  assert.ok(!t.spills, 'no spill once it drops');
});

// How often a spilling dam redraws the water: the fill flag must not flip day to day
check('A year with a full-height dam redraws its spill only a few times', () => {
  const g = farm(), site = g.world.idx(...GOOD); g.wildlife.buildDam(site, 1); keepers(g, site); rain(g, 20);
  let flips = 0, was = damOf(g, site).full;
  for (let d = 0; d < DAYS_PER_YEAR; d++) { g.day++; g.weather = d % 7 === 0 ? 'rain' : 'clear'; g.water.step(g); const now = damOf(g, site).full; if (now !== was) flips++; was = now; }
  console.log(`  spill on/off ${flips} times a year`);
  assert.ok(flips <= 6, `${flips} flips`);
});

console.log(`${checks} checks passed`);
