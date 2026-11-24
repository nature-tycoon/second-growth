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
// - Drawn water runs downhill round the fall, on the fresh map and one with creeks and a pond dug beside
//   it: every corner's current (aFlow), the ripples and every wave the surface's shading is made of travel
//   downstream. The waves drifted one way over the whole map and the ripples against the current, so
//   PNW's creek looked to run upstream round its fall (Cole, 2026-11-23).
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.document = { createElement: () => ({ getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };
const THREE = await import('three');
const { Terrain } = await import('../js/render3d/terrain.js');
const { fallLook, FALL_ICE, WAVES } = await import('../js/render3d/terrain-materials.js');
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
    // (on the farm: beyond the north fence the starting creek comes down the hills as white cascade
    // water where it's steep, outsideCreek, 0054; the fence row's outer corners are shared with it)
    const wp = ta.water.geometry.attributes.position, onFarm = k => wp.getZ(k) > 0 && wp.getX(k) >= 0 && wp.getX(k) <= a.world.w && wp.getZ(k) <= a.world.h;
    assert.ok(ta.water.geometry.attributes.aWhite.array.every((v, k) => v === 0 || !onFarm(k)), `no white water on ${id}`);
  }
});

check('Drawn water runs downhill round the fall: its current, ripples and waves, fresh and with creeks dug beside it', () => {
  const atlas = { tex: null, uv: {}, slot: {} };
  for (let s = 0; s < 4; s++) { atlas.uv[T.PASTURE + '|' + s + '|0'] = [0, 0, 1, 1]; atlas.slot[T.PASTURE + '|' + s + '|0'] = 0; }
  // (the shader: the ripple noise is read at p - v t, which moves it along +v, downstream; the streaks,
  // wavelets and white water at p.x - t, along the current)
  const t0 = new Terrain(new THREE.Scene(), atlas), sh = { uniforms: {}, vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <normal_fragment_begin>\n#include <emissivemap_fragment>\n#include <color_fragment>' };
  t0.waterMat.onBeforeCompile(sh, {});
  const advect = [...sh.fragmentShader.matchAll(/([+-])\s*(vFlow|d)\s*\*\s*uTime/g)].map(m => m[1]);
  assert.ok(advect.length >= 4 && advect.every(x => x === '-'), `noise carried by the current: ${advect.join(' ')}`);
  const along = [...sh.fragmentShader.matchAll(/p\.x \* [\d.]+ ([+-]) uTime/g)].map(m => m[1]);
  assert.ok(along.length >= 3 && along.every(x => x === '-'), `streaks along the current: ${along.join(' ')}`);
  assert.ok(sh.vertexShader.includes('wp = mat2(m1, m2) * aCurrent') && !sh.vertexShader.includes('mat2 wj = mat2(1.0);\n      float'), 'waves laid along the current on moving water');
  // (the wave frame, as the vertex shader builds it: wj takes a velocity in wave coordinates onto the map)
  const S = Math.SQRT1_2, m1 = [-S, -S], m2 = [S, -S];
  const travel = (fx, fy) => {
    const l = Math.hypot(fx, fy), d = [fx / l, fy / l], p = [-d[1], d[0]];
    return WAVES.map(([sp, kx, kz]) => {
      const k2 = kx * kx + kz * kz, v = [-sp * kx / k2, -sp * kz / k2], a = m1[0] * v[0] + m1[1] * v[1], c = m2[0] * v[0] + m2[1] * v[1];
      return [a * d[0] + c * p[0], a * d[1] + c * p[1]];
    });
  };
  const fresh = farm(), [Fa] = fallTiles(fresh.world), [ax, ay] = xy(fresh.world, Fa), Pa = pool(fresh.world, Fa);
  // the edits, beside the fall: a creek alongside it, one joining below the pool and one above the lip,
  // a pond by the pool (across the creek: (-dy, dx))
  const cx = -Pa.dy, cy = Pa.dx, at = (s, c) => fresh.world.idx(ax + Pa.dx * s + cx * c, ay + Pa.dy * s + cy * c);
  const edits = [
    ['creek', [-3, -2, -1, 0, 1, 2, 3, 4].map(s => at(s, 1))],
    ['creek', [1, 2, 3, 4, 5, 6].map(c => at(4, -c))],
    ['creek', [1, 2, 3, 4, 5].map(c => at(-3, -c))],
    ['pond', [at(1, 3), at(1, 4), at(2, 3), at(2, 4)]],
  ];
  const edited = farm();
  for (const [key, tiles] of edits) new ToolActions(edited).apply(key, tiles);
  edited.refreshEnvironment();
  const dug = edits.flatMap(([, tiles]) => tiles).filter(i => isWater(edited.world.terrain[i])).length;
  assert.ok(dug >= 20, `${dug} tiles dug beside the fall`);
  for (const [name, gg] of [['fresh', fresh], ['edited', edited]]) {
    const ww = gg.world, t = new Terrain(new THREE.Scene(), atlas); t.setWorld(ww, gg.border); t.updateSurface(gg);
    const a = t.water.geometry.attributes, flowAt = new Map();
    for (let k = 0; k < a.position.count; k++) flowAt.set(a.position.getX(k) + ',' + a.position.getZ(k), [a.aFlow.getX(k), a.aFlow.getY(k)]);
    const moving = (x, y) => ww.inb(x, y) && (ww.terrain[ww.idx(x, y)] === T.CREEK || ww.terrain[ww.idx(x, y)] === T.RIVER);
    const bed = (x, y) => Math.min(...ww.corners(x, y));
    let tiles = 0, corners = 0, worst = 0;
    // downhill on each channel tile: toward the lower beds of the channel tiles beside it (none on level
    // water, a pool or a junction, nor on a dug bed's small humps under a creek that drains the other way
    // as a whole: a reach drops 0.6 a tile, a fall's gorge 0.18 or more)
    const down = new Map();
    for (let y = ay - 9; y <= ay + 9; y++) for (let x = ax - 9; x <= ax + 9; x++) {
      if (!moving(x, y)) continue;
      let rx = 0, ry = 0;
      for (const [dx, dy] of N4) if (moving(x + dx, y + dy)) { const d = bed(x, y) - bed(x + dx, y + dy); rx += dx * d; ry += dy * d; }
      const l = Math.hypot(rx, ry);
      if (l >= 0.1) { down.set(x + ',' + y, [rx / l, ry / l]); if (Math.abs(x - ax) <= 8 && Math.abs(y - ay) <= 8) tiles++; }
    }
    // ...and at each corner, the way the channel tiles round it run (as the drawing shares a corner's current)
    for (let y = ay - 8; y <= ay + 9; y++) for (let x = ax - 8; x <= ax + 9; x++) {
      let rx = 0, ry = 0;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const d = down.get((x + dx) + ',' + (y + dy)); if (d) { rx += d[0]; ry += d[1]; } }
      const f = flowAt.get(x + ',' + y);
      if (Math.hypot(rx, ry) < 0.5 || !f || Math.hypot(f[0], f[1]) < 0.01) continue;
      corners++;
      const off = Math.acos(Math.max(-1, Math.min(1, (f[0] * rx + f[1] * ry) / Math.hypot(...f) / Math.hypot(rx, ry)))) * 180 / Math.PI;
      worst = Math.max(worst, off);
      assert.ok(off < 60, `${name}: current at ${x},${y} runs ${off.toFixed(0)} degrees off downhill`);
      for (const v of travel(f[0], f[1])) assert.ok(v[0] * rx + v[1] * ry > 0, `${name}: a wave at ${x},${y} runs uphill (downhill ${rx.toFixed(2)},${ry.toFixed(2)}, current ${f.map(q => q.toFixed(2))}, ${off.toFixed(0)} off)`);
    }
    console.log(`  ${name}: ${tiles} sloping channel tiles round the fall, ${corners} corners, all downhill (current at most ${worst.toFixed(0)} degrees off)`);
    assert.ok(tiles >= 12 && corners >= tiles, `${name}: ${tiles} tiles, ${corners} corners measured`);
  }
});

console.log(checks + ' waterfall checks passed.');
