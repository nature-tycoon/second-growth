// Water depth, shared flow, bends and rebuilding regressions.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Terrain, waterSurfaceY } = await import('../js/render3d/terrain.js');
import { Game } from '../js/game.js';
import { createTools } from '../js/tools.js';
import { waterModel } from '../js/sim/hollis-water.js';
import { T, F, LEVEL, isWater } from '../js/config.js';
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
// Terrain's only DOM dependency here creates a noise texture; no rendering or canvas art.
globalThis.document = { createElement: () => ({
  getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} })
}) };
const atlas = { tex: null, uv: {}, slot: {} };
for (let season = 0; season < 4; season++) {
  atlas.uv[T.PASTURE + '|' + season + '|0'] = [0, 0, 1, 1];
  atlas.slot[T.PASTURE + '|' + season + '|0'] = 0;
}
function make(map = 'pnw') {
  const game = new Game(); game.newGame(1987, 'free', 'standard', map);
  const scene = new THREE.Scene(), terrain = new Terrain(scene, atlas);
  terrain.setWorld(game.world, game.border); terrain.updateSurface(game);
  return { game, scene, terrain };
}
function dispose(t) {
  t.banks.dispose();
  for (const m of [t.mesh,t.water,t.flood,t.skirt,t.line,t.overlay,t.preview]) m?.geometry.dispose();
  for (const m of [t.material,t.waterMat,t.floodMat,t.skirtMat,t.overlayMat,t.previewMat]) m.dispose();
  t.noise.dispose();t.tiles.tex.value.dispose();t.tiles.tint.value.dispose();
}
check('Signed depth follows the rendered bed, and shared vertices have seamless flow', () => {
  for (const map of ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'sumatra', 'reef']) {
    const { game, terrain: t } = make(map), w = game.world;
    const a = t.water.geometry.attributes, seen = new Map();
    let positive = 0, negative = 0;
    for (const key of ['position', 'color', 'aDepth', 'aFlow', 'aCurrent', 'aBend']) assert.ok(a[key].array.every(Number.isFinite), map + ' ' + key);
    for (let i = 0; i < a.position.count; i++) {
      const x = a.position.getX(i), y = a.position.getY(i), z = a.position.getZ(i), depth = a.aDepth.getX(i);
      assert.ok(Math.abs(depth - (y / LEVEL - w.vert(x, z))) < 0.00001, map + ' signed depth');
      if (depth > 0) positive++; if (depth < 0) negative++;
      const sample = [a.aFlow.getX(i), a.aFlow.getY(i), a.aBend.getX(i)];
      assert.ok(sample[2] >= 0 && sample[2] <= 1);
      const key = x + ',' + z;
      if (seen.has(key)) assert.deepEqual(sample, seen.get(key), map + ' shared corner'); else seen.set(key, sample);
    }
    if (map !== 'reef') assert.ok(positive > 0 && negative > 0, map + ' water and bank depths');
    const mesh = t.water; t.refreshWater(); assert.equal(t.water, mesh, 'no per-frame rebuild');
    t.setFast(true); assert.equal(t.water, mesh, 'Fast keeps water details');
    dispose(t);
  }
});
check('River wavelets keep their spacing where the current turns round a headland', () => {
  // Across any tile the downstream and across coordinates change by about the tile's width.
  // Projecting the position onto the turning current instead changed them up to 15x as fast on
  // these maps, squeezing the wavelets into swirls beside jutting land.
  for (const map of ['serengeti', 'pnw', 'amazon']) {
    const { game, terrain: t } = make(map), a = t.water.geometry.attributes, worst = [0, 0];
    for (let i = 0; i < a.position.count; i += 3) {
      const v = [i, i + 1, i + 2];
      if (a.aDepth.getX(i) < 0.05 || v.some(j => Math.hypot(a.aFlow.getX(j), a.aFlow.getY(j)) < 0.01)) continue;
      for (const [c, get] of [[0, j => a.aCurrent.getX(j)], [1, j => a.aCurrent.getY(j)]])
        for (const [p, q] of [[0, 1], [1, 2], [0, 2]]) worst[c] = Math.max(worst[c], Math.abs(get(v[p]) - get(v[q])) / Math.SQRT2);
    }
    assert.ok(worst[0] < 1.5 && worst[1] < 1.5, map + ' coordinate change per tile ' + worst.map(x => x.toFixed(2)));
    dispose(t);
  }
});
check('A flat L-shaped creek flows along both arms and puts ripples at its bend; ponds stay still', () => {
  const {game, terrain:t} = make(), w=game.world;
  w.terrain.fill(T.PASTURE); game.border.terrain.fill(T.PASTURE); w.vh.fill(0);
  for (let y=20;y<=30;y++) w.terrain[w.idx(30,y)]=T.CREEK;
  for (let x=30;x<=40;x++) w.terrain[w.idx(x,30)]=T.CREEK;
  for (let y=50;y<=53;y++) for(let x=50;x<=53;x++) w.terrain[w.idx(x,y)]=T.POND;
  w.hv++; t.updateHeights();
  const a=t.water.geometry.attributes;
  const at=(x,z)=>{for(let i=0;i<a.position.count;i++)if(a.position.getX(i)===x&&a.position.getZ(i)===z)return [a.aFlow.getX(i),a.aFlow.getY(i),a.aBend.getX(i)];throw Error('Missing vertex');};
  const vertical=at(30,24),horizontal=at(36,30),bend=at(30,30),pond=at(51,51);
  assert.ok(Math.abs(vertical[1])>.6 && Math.abs(vertical[0])<.01);
  assert.ok(Math.abs(horizontal[0])>.6 && Math.abs(horizontal[1])<.01);
  assert.ok(bend[2]>.1 && vertical[2]===0 && horizontal[2]===0);
  assert.deepEqual(pond,[0,0,0]);
  dispose(t);
});
check('Digging and filling water refresh the depth/flow buffers without changing simulation data', () => {
  const {game,terrain:t}=make(),w=game.world, i=w.idx(15,15);
  const rng=game.rng.state();w.terrain[i]=T.POND;w.carve(15,15,.7);
  const state=Object.fromEntries(['terrain','vh','ground','waterQ','connected'].map(key=>[key,w[key].slice()]));
  const old=t.water.geometry;t.updateHeights();assert.notEqual(t.water.geometry,old);
  const saved=t.water.geometry.attributes.aDepth.array.slice();t.buildWater();assert.deepEqual(t.water.geometry.attributes.aDepth.array,saved);
  for(const [key,value] of Object.entries(state))assert.deepEqual(w[key],value,key+' unchanged');
  assert.equal(game.rng.state(),rng);
  w.terrain[i]=T.PASTURE;t.refreshWater();assert.ok(t.water.geometry.attributes.aDepth.array.every(Number.isFinite));
  dispose(t);
});
check('Gameplay water planes match actor samples and disappear from a dried pond bed', () => {
  waterModel.enabled = true; // (off in play until it's ready)
  const {game,terrain:t}=make(),w=game.world;
  game.wildlife.buildDam(w.idx(54,58));game.weather='rain';for(let k=0;k<10;k++)game.water.step(game);
  t.refreshWater();const b=game.water.basins.find(b=>b.kind==='dam');
  const i=b.cells.find(v=>game.water.base[v.i]!==T.CREEK&&w.waterDepth[v.i]>.15).i,x=i%w.w,z=Math.floor(i/w.w);
  assert.ok(Math.abs(waterSurfaceY(w,x+.5,z+.5)-w.waterLevel[i]*LEVEL)<1e-7);
  const p=t.water.geometry.attributes.position;
  let found=false;for(let k=0;k<p.count;k+=6)if(p.getX(k)===x&&p.getZ(k)===z){
    found=true;for(let v=k;v<k+6;v++)assert.ok(Math.abs(p.getY(v)-w.waterLevel[i]*LEVEL)<1e-7);
  }
  assert.ok(found);
  game.day=50;game.weather='clear';for(let k=0;k<60;k++)game.water.step(game);t.refreshWater();
  // (a pond keeps water in its deep middle through summer; its shallow edge dries out)
  const pondB=game.water.basins.find(b=>b.kind==='pond'),edge=pondB.cells.find(v=>!Number.isFinite(w.waterLevel[v.i]))?.i;
  assert.ok(edge!=null,'a drawn-down pond exposes some of its bed');
  const ex=edge%w.w,ez=Math.floor(edge/w.w);
  assert.equal(waterSurfaceY(w,ex+.5,ez+.5),null);
  const dry=t.water.geometry.attributes.position;
  for(let k=0;k<dry.count;k+=6)assert.ok(dry.getX(k)!==ex||dry.getZ(k)!==ez,'no phantom water on a dried basin');
  dispose(t);
});
check('Floodwater clouds out over the river it rose from instead of stopping at its tile edges', () => {
  for (const map of ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'sumatra']) {
    const { game, terrain: t } = make(map), w = game.world;
    game.events.startFlood(1.8);
    if (!game.events.floodTiles) { dispose(t); continue; }
    const t0 = performance.now(); t.refreshFlood(); const ms = performance.now() - t0;
    assert.ok(ms < 250, `${map}: flood mesh built in ${ms.toFixed(0)} ms`);
    const a = t.flood.geometry.attributes, s = t.shoreVertices;
    for (const key of ['position', 'color', 'aDepth', 'aFlow', 'aQual']) assert.ok(a[key].array.every(Number.isFinite), map + ' ' + key);
    const at = new Map(); let overWater = 0;
    for (let v = 0; v < a.position.count; v++) {
      const x = a.position.getX(v), z = a.position.getZ(v), y = a.position.getY(v), al = a.color.getW(v), key = x + ',' + z;
      // one value per corner, so neighbouring tiles share an edge with no step in height or opacity
      if (at.has(key)) assert.deepEqual(at.get(key), [y, al], `${map} corner ${key}`); else at.set(key, [y, al]);
      const k = ((z - t.Y0) * (t.TW + 1) + x - t.X0) * 2;
      if (s[k + 1]) assert.ok(y >= s[k] - 1e-6, `${map}: floodwater at ${key} sits on, not under, the river`);
      const water = [[-1, -1], [0, -1], [-1, 0], [0, 0]].every(([dx, dy]) => isWater(t.terrainAt(x + dx, z + dy)));
      if (water && al > 0) overWater++;
    }
    assert.ok(overWater > 0, `${map}: some silt reaches out over the river`);
    // at the far edge of its reach it has thinned to nothing
    for (const [key, [, al]] of at) {
      const [x, z] = key.split(',').map(Number);
      let near = Infinity;
      for (let y = z - 5; y <= z + 5; y++) for (let xx = x - 5; xx <= x + 5; xx++) if (w.inb(xx, y) && w.flood[w.idx(xx, y)]) near = Math.min(near, Math.hypot(xx + .5 - x, y + .5 - z));
      if (near >= 3.5) assert.equal(al, 0, `${map}: floodwater at ${key} fades out`);
    }
    dispose(t);
  }
});
check('Ponds dug on slopes never end in mid-air along a tile edge', () => {
  // (the water mesh's outer edges, where it stops, must sit on the ground, not above it)
  for (const map of ['pnw', 'serengeti', 'amazon', 'chinandega', 'sumatra']) {
    const { game, terrain: t } = make(map), w = game.world, dig = createTools(game.catalog).pond.apply;
    let seed = 7, dug = 0; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sites = [];
    for (let s = 0; s < 40; s++) {
      const x = 5 + Math.floor(rnd() * (w.w - 12)), y = 5 + Math.floor(rnd() * (w.h - 12)), sz = 1 + (s % 4);
      let ok = true; for (let dy = -2; dy < sz + 2; dy++) for (let dx = -2; dx < sz + 2; dx++) { const i = w.idx(x + dx, y + dy); if (isWater(w.terrain[i]) || w.struct[i] >= 0) ok = false; }
      if (!ok) continue;
      for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) dig(game, w.idx(x + dx, y + dy));
      sites.push([x - 3, y - 3, x + sz + 3, y + sz + 3]); dug++;
    }
    w.hv++; t.updateHeights();
    const a = t.water.geometry.attributes, edges = new Map(), key = i => a.position.getX(i) + ',' + a.position.getZ(i);
    for (let f = 0; f < a.position.count; f += 3) for (const [p, q] of [[f, f + 1], [f + 1, f + 2], [f + 2, f]]) {
      const k = [key(p), key(q)].sort().join('|'), e = edges.get(k); if (e) e.c++; else edges.set(k, { c: 1, p, q });
    }
    for (const e of edges.values()) {
      const x = a.position.getX(e.p), z = a.position.getZ(e.p);
      if (e.c > 1 || !sites.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)) continue;
      assert.ok(Math.min(a.aDepth.getX(e.p), a.aDepth.getX(e.q)) <= 0.03, `${map}: pond water stops above the ground at ${x},${z}`);
    }
    assert.ok(dug > 10, map + ' dug enough ponds');
    dispose(t);
  }
});
check('Rounding the waterline never hides deep water at a dug bank', () => {
  // (mirrors the water shader: shoreD = max(min(depth, rounded depth), depth - 0.05) fades the
  // water out below 0.02. Irregular, painted ponds; water deeper than 0.08 must always show)
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (const map of ['pnw', 'serengeti', 'chinandega']) {
    const { game, terrain: t } = make(map), w = game.world, dig = createTools(game.catalog).pond.apply;
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let s = 0; s < 30; s++) {
      const cx = 8 + Math.floor(rnd() * (w.w - 16)), cy = 8 + Math.floor(rnd() * (w.h - 16)), r = 1.2 + rnd() * 2, cells = [];
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (Math.hypot(dx + (rnd() - .5) * .8, dy + (rnd() - .5) * .8) <= r) cells.push(w.idx(cx + dx, cy + dy));
      if (!cells.some(i => isWater(w.terrain[i]) || w.struct[i] >= 0)) for (const i of cells) dig(game, i);
    }
    w.hv++; t.updateHeights();
    const a = t.water.geometry.attributes, D = a.aDepth, R = a.aRound;
    for (let f = 0; f < a.position.count; f += 3) for (let u = 0; u <= 6; u++) for (let v = 0; u + v <= 6; v++) {
      const b = [u / 6, v / 6, 1 - (u + v) / 6], m = A => b[0] * A.getX(f) + b[1] * A.getX(f + 1) + b[2] * A.getX(f + 2);
      const d = m(D), sd = Math.max(Math.min(d, m(R)), d - 0.05);
      if (d > 0.08) assert.ok(sd >= d - 0.001 || ss(0, 0.02, sd) > 0.5, `${map}: water ${d.toFixed(2)} deep hidden near ${a.position.getX(f)},${a.position.getZ(f)}`);
    }
    dispose(t);
  }
});
console.log(checks + ' water checks passed.');
