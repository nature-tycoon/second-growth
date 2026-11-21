// Natural waterfalls (landform.js creekFalls; ideas batch cinema-creeks, session 6):
//   node tools/waterfall-check.mjs
// - PNW's ditch drops over one fall in its steep foothill reach; maps without such a reach get none.
// - The plunge pool below holds water at its tail-out: its level stands over its way out downstream,
//   under every bank round it (it never floods), and the creek below it stands lower still.
// - The pool holds its level through a year of weather, a save and load, and Raise, Lower and
//   Fill & grade beside the fall and the pool (they never move a creek's corners: 0048).
// - A river fish can't swim up the fall (no species leaps one); a beaver pond never drowns it.
// - Drawn: a rock ledge, falling water off it (sheet, foam, mist), and the sheet at the fall's foot at
//   the pool's level.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.document = { createElement: () => ({ getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };
const THREE = await import('three');
const { Terrain } = await import('../js/render3d/terrain.js');
const { fallLook, FALL_ICE } = await import('../js/render3d/terrain-materials.js');
const { snow } = await import('../js/render3d/snow.js');
const { Game } = await import('../js/game.js');
const { BIOME_LIST } = await import('../js/biome.js');
const { ToolActions } = await import('../js/tool-actions.js');
const { compactSave } = await import('../js/saves.js');
const { T, LEVEL, isWater } = await import('../js/config.js');
const { fallTiles, isFall } = await import('../js/maps/landform.js');
const { tileWaterLevel } = await import('../js/sim/waterline.js');
const { swimRoute } = await import('../js/sim/swim-routes.js');

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
const farm = (map = 'pnw') => { const g = new Game(); g.newGame(1987, 'free', 'standard', map); g.autosave = false; return g; };
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const xy = (w, i) => [i % w.w, (i / w.w) | 0];

// the fall's pool: the creek tile below it (its lowest corner shared with the fall's foot), and the
// tile below that
function pool(w, f) {
  const [x, y] = xy(w, f), c = w.corners(x, y), lo = Math.min(...c);
  for (const [dx, dy] of N4) {
    if (!w.inb(x + dx, y + dy)) continue;
    const p = w.idx(x + dx, y + dy);
    if (w.terrain[p] !== T.CREEK || isFall(w, p) || Math.min(...w.corners(x + dx, y + dy)) > lo + 1e-6) continue;
    const below = w.idx(x + 2 * dx, y + 2 * dy);
    return { p, below, dx, dy };
  }
  return null;
}
// the lowest way out of the pool other than down the creek: the lowest corner it shares with land
function lowestBank(w, p) {
  const [x, y] = xy(w, p);
  let lo = Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || !w.inb(x + dx, y + dy) || isWater(w.terrain[w.idx(x + dx, y + dy)])) continue;
    const c = w.corners(x + dx, y + dy);
    lo = Math.min(lo, Math.max(...c)); // (the bank tile's own high side: the water would have to rise over it)
  }
  return lo;
}

const made = {};
check('Falls only where a creek runs down a steep reach, on maps whose region has them (PNW)', () => {
  for (const { id } of BIOME_LIST) {
    const g = farm(id), falls = fallTiles(g.world);
    made[id] = falls.map(i => xy(g.world, i));
    if (id === 'pnw') assert.ok(falls.length >= 1, 'PNW has a fall');
    else assert.equal(falls.length, 0, `${id}: no fall`);
  }
  console.log('  falls:', JSON.stringify(made));
});

const g = farm(), w = g.world, [F] = fallTiles(w), P = pool(w, F);
const [fx, fy] = xy(w, F), drop = Math.max(...w.corners(fx, fy)) - Math.min(...w.corners(fx, fy));
const level = (gg = g) => tileWaterLevel(gg.world, P.p);

check('The fall drops 4-6 m in one tile over a plunge pool that holds water at its tail-out and never floods', () => {
  assert.ok(P, 'a pool below the fall');
  assert.ok(drop * 2.4 >= 4 && drop * 2.4 <= 6.5, `drop ${(drop * 2.4).toFixed(1)} m`);
  const [px, py] = xy(w, P.p), c = w.corners(px, py), bed = Math.min(...c), L = level();
  const tail = Math.min(...c.filter((_, k) => k)), sill = g.water.sill(P.p, P.below); // (its way out downstream)
  assert.ok(L > sill + 0.05, `pool ${L.toFixed(2)} stands over its tail-out ${sill.toFixed(2)}`);
  assert.ok(L - bed >= 0.25, `pool ${((L - bed) * 2.4).toFixed(2)} m deep`);
  assert.ok(L < lowestBank(w, P.p) - 0.05, `pool ${L.toFixed(2)} under its lowest bank ${lowestBank(w, P.p).toFixed(2)}`);
  assert.ok(tileWaterLevel(w, P.below) < L, 'the creek below stands lower');
  assert.ok(tileWaterLevel(w, F) <= L + 1e-6, "the fall's own water is the pool's");
  void tail;
});

check('The pool holds its level through a year of weather and a save and load', () => {
  const L0 = level();
  for (let d = 0; d < 365; d++) { g.weather = d % 40 < 6 ? 'rain' : d % 90 < 30 ? 'sun' : 'cloudy'; g.water.step(g); }
  assert.ok(Math.abs(level() - L0) < 1e-6, `after a year ${level().toFixed(3)} vs ${L0.toFixed(3)}`);
  const r = new Game(); assert.ok(r.restoreSave(compactSave(g.saveData())));
  assert.ok(isFall(r.world, F), 'still a fall after loading');
  assert.ok(Math.abs(level(r) - L0) < 1e-6, 'same pool level after loading');
});

check('Raise, Lower and Fill & grade beside the fall and the pool leave both as they were', () => {
  const fresh = g.saveData(), L0 = level();
  const beside = [];
  for (const t of [F, P.p]) { const [x, y] = xy(w, t); for (const [dx, dy] of N4) if (w.inb(x + dx, y + dy) && !isWater(w.terrain[w.idx(x + dx, y + dy)])) beside.push(w.idx(x + dx, y + dy)); }
  let tried = 0;
  for (const key of ['raise', 'lower', 'fill']) for (const i of beside) {
    assert.ok(g.restoreSave(structuredClone(fresh)));
    const s = new ToolActions(g).apply(key, [i]);
    if (!s?.count) continue;
    tried++;
    g.water.sync();
    assert.ok(isFall(g.world, F), `${key} at ${xy(w, i)}: still a fall`);
    assert.ok(Math.abs(level() - L0) < 1e-6, `${key} at ${xy(w, i)}: pool ${level().toFixed(3)} vs ${L0.toFixed(3)}`);
  }
  assert.ok(tried >= 4, `${tried} edits tried`);
  assert.ok(g.restoreSave(structuredClone(fresh)));
});

check('A pond dug beside the pool joins it without draining it or flooding past its banks', () => {
  const fresh = g.saveData(), L0 = level();
  const [px, py] = xy(w, P.p);
  for (const sd of [-1, 1]) {
    assert.ok(g.restoreSave(structuredClone(fresh)));
    const i = w.idx(px + P.dy * sd, py - P.dx * sd);
    const s = new ToolActions(g).apply('pond', [i]);
    if (!s?.count) continue;
    g.water.sync();
    const L = level();
    console.log(`  pond dug at ${xy(w, i)}: pool ${L0.toFixed(2)} -> ${L.toFixed(2)}, fall ${isFall(g.world, F) ? 'kept' : 'gone'}`);
    assert.ok(L > L0 - 0.21, 'the pool keeps most of its water');
    assert.ok(L < lowestBank(g.world, P.p) + 1e-6, 'and stands under its banks');
  }
  assert.ok(g.restoreSave(structuredClone(fresh)));
});

check('A river fish cannot swim up the fall', () => {
  const def = g.catalog.animals.find(d => d && d.move === 'swim' && !d.reef);
  const [px, py] = xy(w, P.p), above = w.idx(fx - P.dx, fy - P.dy), a = { move: 'swim', x: px + 0.5, y: py + 0.5 };
  const can = swimRoute(g.wildlife, a, def);
  assert.ok(can, 'a route test for a river fish');
  assert.equal(can(F, above), false, 'over the lip');
  // nor by any way round: no route from the pool reaches the creek above the fall
  const seen = new Set([P.p]), q = [P.p];
  for (let k = 0; k < q.length; k++) {
    const [x, y] = xy(w, q[k]);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || !w.inb(x + dx, y + dy)) continue;
      const j = w.idx(x + dx, y + dy);
      if (!seen.has(j) && isWater(w.terrain[j]) && can(q[k], j)) { seen.add(j); q.push(j); }
    }
  }
  assert.ok(!seen.has(above), `reached the creek above the fall (${q.length} tiles reached)`);
});

check('A beaver dam below the fall never drowns it', () => {
  for (let k = 1; k <= 4; k++) {
    const [px, py] = xy(w, P.p), site = w.idx(px + P.dx * (k - 1), py + P.dy * (k - 1));
    if (w.terrain[site] !== T.CREEK) continue;
    const occupied = new Uint8Array(w.n), axis = g.water.downstream(site), crest = g.water.damCrest(site, axis, occupied);
    if (crest == null) continue;
    assert.ok(crest - g.water.nominal(F) <= 0.12 + 1e-9, `dam ${k - 1} below the pool: crest ${crest.toFixed(2)} over the fall's foot ${g.water.nominal(F).toFixed(2)}`);
  }
});

check('Drawn: a rock ledge and falling water off it (sheet, foam, mist), its foot at the pool', () => {
  const atlas = { tex: null, uv: {}, slot: {} };
  for (let s = 0; s < 4; s++) { atlas.uv[T.PASTURE + '|' + s + '|0'] = [0, 0, 1, 1]; atlas.slot[T.PASTURE + '|' + s + '|0'] = 0; }
  const t = new Terrain(new THREE.Scene(), atlas); t.setWorld(w, g.border); t.updateSurface(g);
  assert.ok(t.falls, 'falling water drawn');
  // (one mesh: the sheet (aFall.w 0), the foam where it lands (1), mist puffs (2))
  const p = t.falls.geometry.attributes.position, kind = k => t.falls.geometry.attributes.aFall.getW(k);
  const ix = t.falls.geometry.index.array, v3 = k => new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k));
  let top = -Infinity, bot = Infinity, sheetTris = 0, foam = 0, mist = 0;
  for (let k = 0; k < p.count; k++) if (kind(k) === 0) { top = Math.max(top, p.getY(k)); bot = Math.min(bot, p.getY(k)); } else if (kind(k) === 1) foam++; else mist++;
  assert.ok(foam >= 12 && mist >= 4, `foam ${foam} and mist ${mist} corners`);
  // (the sheet faces up and downstream: each triangle's normal)
  const down = new THREE.Vector3(P.dx, 0, P.dy).normalize().add(new THREE.Vector3(0, 1, 0));
  for (let k = 0; k < ix.length; k += 3) {
    if (kind(ix[k]) !== 0) continue;
    sheetTris++;
    const a = v3(ix[k]), n = v3(ix[k + 1]).sub(a).cross(v3(ix[k + 2]).sub(a));
    assert.ok(n.dot(down) > 0, `sheet triangle ${k / 3} faces away`);
  }
  assert.ok(sheetTris >= 40 && sheetTris <= 200, `${sheetTris} sheet triangles`);
  // the rock ledge it pours off: its top just under the lip's water, never over the sheet
  assert.ok(t.fallRock, 'a rock ledge drawn');
  const rp = t.fallRock.geometry.attributes.position;
  let rTop = -Infinity; for (let k = 0; k < rp.count; k++) rTop = Math.max(rTop, rp.getY(k));
  assert.ok(rTop < top && rTop > top - 0.1, `rock top ${rTop.toFixed(3)} under the sheet's ${top.toFixed(3)}`);
  assert.ok(t.fallRock.geometry.index.count / 3 <= 400, 'a small rock mesh');
  // (winter ice: the rock says where spray wets it, the wet face behind the water most, the dry tops none)
  const iceA = t.fallRock.geometry.attributes.aIce;
  assert.ok(iceA && iceA.count === rp.count && iceA.array.every(v => v >= 0 && v <= 1) && iceA.array.includes(1) && iceA.array.includes(0), 'rock ice where the spray wets it');
  const fs = { uniforms: {}, vertexShader: '#include <begin_vertex>\n#include <project_vertex>', fragmentShader: '#include <color_fragment>' };
  fallLook(new THREE.MeshLambertMaterial(), { value: 0 }, null, { value: 800 }).onBeforeCompile(fs);
  assert.ok(fs.uniforms.uSnow === snow.uSnow && fs.fragmentShader.includes(FALL_ICE), 'the falling water freezes with the snowpack');
  // (every layer on the rock and the water (clouds, snow tops, ice) declares each uniform once: a repeat fails to compile)
  for (const mat of [t.rockMat, t.fallMat]) {
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>\n#include <worldpos_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <fog_fragment>' };
    mat.onBeforeCompile(sh, {});
    for (const src of [sh.vertexShader, sh.fragmentShader]) {
      const decl = src.match(/^\s*(uniform|varying|attribute)\s+\w+\s+\w+;/gm) || [], seen = new Set();
      for (const d of decl.map(x => x.trim())) { assert.ok(!seen.has(d), `${d} declared twice`); seen.add(d); }
    }
  }
  // (its wings stand at most a low outcrop over the bank beside the fall, never a slab out of it)
  const groundY = (x, z) => { const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0, v = (a, b) => w.vert(a, b); return ((v(x0, z0) * (1 - fx) + v(x0 + 1, z0) * fx) * (1 - fz) + (v(x0, z0 + 1) * (1 - fx) + v(x0 + 1, z0 + 1) * fx) * fz) * LEVEL; };
  for (let k = 0; k < rp.count; k++) {
    const x = rp.getX(k), z = rp.getZ(k);
    if (isWater(w.terrain[w.idx(Math.floor(x), Math.floor(z))])) continue;
    assert.ok(rp.getY(k) - groundY(x, z) < 0.065, `rock ${(rp.getY(k) - groundY(x, z)).toFixed(3)} over the bank at ${x.toFixed(2)},${z.toFixed(2)}`);
  }
  assert.ok((top - bot) / LEVEL > drop * 0.8, `curtain ${((top - bot) / LEVEL).toFixed(2)} of ${drop.toFixed(2)}`);
  assert.ok(Math.abs(bot / LEVEL - 0.02 / LEVEL - level()) < 0.05, `curtain foot ${(bot / LEVEL).toFixed(2)} at pool ${level().toFixed(2)}`);
  const [px, py] = xy(w, P.p);
  const foot = t.waterAt(px + 0.5, py + 0.5) / LEVEL;
  assert.ok(Math.abs(foot - level()) < 0.05, `drawn pool ${foot.toFixed(2)} vs ${level().toFixed(2)}`);
  const wh = t.water.geometry.attributes.aWhite;
  let white = 0; for (let k = 0; k < wh.count; k++) if (wh.getX(k) > 0.9) white++;
  assert.ok(white >= 6, `${white} white corners at the fall`);
  // (no other map draws a curtain, and a steep reach without a fall stays clear)
  for (const { id } of BIOME_LIST) {
    if (id === 'pnw') continue;
    const a = farm(id), ta = new Terrain(new THREE.Scene(), atlas); ta.setWorld(a.world, a.border); ta.updateSurface(a);
    assert.ok(!ta.falls && !ta.fallRock, `no falling water or ledge on ${id}`);
    assert.ok(ta.water.geometry.attributes.aWhite.array.every(v => v === 0), `no white water on ${id}`);
  }
});

console.log(checks + ' waterfall checks passed.');
