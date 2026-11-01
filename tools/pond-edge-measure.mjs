// Measures the drawn waterline: detached slivers and jagged edges (report: "pieces of pond separated
// from the main pond", "edges too jagged"). Rasterizes the water mesh the way the water shader
// shows it (depth > 0, faded by the rounded waterline and the bank ring's alpha) on a fine grid.
//   node tools/pond-edge-measure.mjs [maps] [--dig]
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Terrain } = await import('../js/render3d/terrain.js');
const { Game } = await import('../js/game.js');
const { createTools } = await import('../js/tools.js');
const { T, isWater } = await import('../js/config.js');
globalThis.document = { createElement: () => ({ getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };
const atlas = { tex: null, uv: {}, slot: {} };
for (let s = 0; s < 4; s++) { atlas.uv[T.PASTURE + '|' + s + '|0'] = [0, 0, 1, 1]; atlas.slot[T.PASTURE + '|' + s + '|0'] = 0; }
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function measure(game, terrain, R = 8) {
  const w = game.world, a = terrain.water.geometry.attributes, P = a.position, D = a.aDepth, RD = a.aRound, C = a.color;
  const X0 = terrain.X0, Y0 = terrain.Y0, GW = terrain.TW * R, GH = terrain.TH * R, vis = new Uint8Array(GW * GH);
  for (let f = 0; f < P.count; f += 3) {
    const xs = [P.getX(f), P.getX(f + 1), P.getX(f + 2)], zs = [P.getZ(f), P.getZ(f + 1), P.getZ(f + 2)];
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const det = (zs[1] - zs[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (zs[0] - zs[2]);
    for (let gz = Math.floor((minZ - Y0) * R); gz < (maxZ - Y0) * R; gz++) for (let gx = Math.floor((minX - X0) * R); gx < (maxX - X0) * R; gx++) {
      const px = X0 + (gx + 0.5) / R, pz = Y0 + (gz + 0.5) / R;
      const l0 = ((zs[1] - zs[2]) * (px - xs[2]) + (xs[2] - xs[1]) * (pz - zs[2])) / det, l1 = ((zs[2] - zs[0]) * (px - xs[2]) + (xs[0] - xs[2]) * (pz - zs[2])) / det, l2 = 1 - l0 - l1;
      if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
      const m = A => l0 * A.getX(f) + l1 * A.getX(f + 1) + l2 * A.getX(f + 2);
      const d = m(D); if (d <= 0) continue;
      let alpha = l0 * C.getW(f) + l1 * C.getW(f + 1) + l2 * C.getW(f + 2);
      const sd = Math.max(Math.min(d, m(RD)), d - 0.07);
      if (sd < d - 0.001) alpha *= ss(-0.005, 0.035, sd);
      if (alpha > 0.3 && gx >= 0 && gz >= 0 && gx < GW && gz < GH) vis[gz * GW + gx] = 1;
    }
  }
  // components (4-connected) and whether each touches a simulated water tile's middle
  // the simulated bodies of standing or running water (4-connected water tiles)
  const body = new Int32Array(w.n).fill(-1);
  for (let i0 = 0; i0 < w.n; i0++) {
    if (body[i0] >= 0 || !isWater(w.terrain[i0])) continue;
    const q = [i0]; body[i0] = i0;
    for (let h = 0; h < q.length; h++) { const i = q[h], x = i % w.w, y = (i / w.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.inb(x + dx, y + dy)) { const j = w.idx(x + dx, y + dy); if (body[j] < 0 && isWater(w.terrain[j])) { body[j] = i0; q.push(j); } } }
  }
  const pieces = new Map(); // body -> visible components overlapping it
  const comp = new Int32Array(GW * GH).fill(-1), out = [];
  for (let s = 0; s < GW * GH; s++) {
    if (!vis[s] || comp[s] >= 0) continue;
    const q = [s]; comp[s] = s; let core = false;
    for (let h = 0; h < q.length; h++) {
      const k = q[h], gx = k % GW, gz = (k / GW) | 0, tx = X0 + Math.floor(gx / R), ty = Y0 + Math.floor(gz / R);
      if (w.inb(tx, ty) && isWater(w.terrain[w.idx(tx, ty)]) || !w.inb(tx, ty)) core = true;
      if (w.inb(tx, ty) && body[w.idx(tx, ty)] >= 0) { const b = body[w.idx(tx, ty)]; if (!pieces.has(b)) pieces.set(b, new Map()); const m = pieces.get(b); m.set(s, (m.get(s) || 0) + 1); }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = gx + dx, zz = gz + dz; if (xx < 0 || zz < 0 || xx >= GW || zz >= GH) continue;
        const j = zz * GW + xx; if (vis[j] && comp[j] < 0) { comp[j] = s; q.push(j); }
      }
    }
    out.push({ area: q.length / (R * R), core, at: [X0 + (s % GW) / R, Y0 + ((s / GW) | 0) / R] });
  }
  // jaggedness: boundary length against a boundary of the same mask smoothed over ~half a tile
  let edge = 0, sedge = 0; const blur = new Float32Array(GW * GH), r = Math.round(R / 2);
  for (let gz = 0; gz < GH; gz++) for (let gx = 0; gx < GW; gx++) {
    let s = 0, n = 0; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const xx = gx + dx, zz = gz + dz; if (xx >= 0 && zz >= 0 && xx < GW && zz < GH) { s += vis[zz * GW + xx]; n++; } }
    blur[gz * GW + gx] = s / n;
  }
  for (let gz = 0; gz + 1 < GH; gz++) for (let gx = 0; gx + 1 < GW; gx++) {
    const k = gz * GW + gx;
    edge += (vis[k] !== vis[k + 1]) + (vis[k] !== vis[k + GW]);
    sedge += ((blur[k] > .5) !== (blur[k + 1] > .5)) + ((blur[k] > .5) !== (blur[k + GW] > .5));
  }
  // a body drawn in more than one piece: count its pieces beyond the biggest
  let split = 0, splitArea = 0; const splitAt = [];
  for (const [b, m] of pieces) { const areas = [...m.values()].sort((p, q) => q - p); if (areas.length > 1) { split += areas.length - 1; splitArea += areas.slice(1).reduce((s, v) => s + v, 0) / (R * R); if (splitAt.length < 6) splitAt.push(b % w.w + ',' + ((b / w.w) | 0)); } }
  // water tiles that show no water at all
  let blank = 0; for (let i = 0; i < w.n; i++) if (isWater(w.terrain[i]) && body[i] >= 0) { const x = i % w.w - X0, y = ((i / w.w) | 0) - Y0; let any = 0; for (let v = 0; v < R && !any; v++) for (let u = 0; u < R; u++) if (vis[(y * R + v) * GW + x * R + u]) { any = 1; break; } if (!any) blank++; }
  const detached = out.filter(c => !c.core), slivers = out.filter(c => c.core && c.area < 0.15);
  return { comps: out.length, detached: detached.length, detachedArea: detached.reduce((s, c) => s + c.area, 0), detachedAt: detached.slice(0, 6).map(c => c.at.map(v => v.toFixed(1)).join(',')), slivers: slivers.length, split, splitArea: +splitArea.toFixed(2), splitAt, blank, jagged: edge / Math.max(1, sedge) };
}
export function makeView(game) {
  const scene = new THREE.Scene(), terrain = new Terrain(scene, atlas);
  terrain.setWorld(game.world, game.border); terrain.updateSurface(game);
  return terrain;
}
export function digPonds(game, seed = 11, n = 30) {
  const w = game.world, dig = createTools(game.catalog).pond.apply;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let s = 0; s < n; s++) {
    const cx = 8 + Math.floor(rnd() * (w.w - 16)), cy = 8 + Math.floor(rnd() * (w.h - 16)), r = 1.2 + rnd() * 2.5, cells = [];
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (Math.hypot(dx + (rnd() - .5) * .8, dy + (rnd() - .5) * .8) <= r) cells.push(w.idx(cx + dx, cy + dy));
    if (!cells.some(i => isWater(w.terrain[i]) || w.struct[i] >= 0)) for (const i of cells) dig(game, i);
  }
  w.hv++;
}
if (process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  const maps = (process.argv.slice(2).find(s => !s.startsWith('--')) || 'pnw,serengeti,amazon,chinandega,sumatra,atlanta').split(',');
  for (const map of maps) {
    const game = new Game(); game.newGame(1987, 'free', 'standard', map);
    if (process.argv.includes('--dig')) digPonds(game);
    const t = makeView(game); if (process.argv.includes('--dig')) t.updateHeights();
    const m = measure(game, t);
    console.log(map.padEnd(11), JSON.stringify(m));
  }
}
// Scenarios: painted marsh blobs, and beaver dams on every stretch of creek.
export function paintMarsh(game, seed = 5, n = 25) {
  const w = game.world, paint = createTools(game.catalog).marsh.apply;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let s = 0; s < n; s++) {
    const cx = 8 + Math.floor(rnd() * (w.w - 16)), cy = 8 + Math.floor(rnd() * (w.h - 16)), r = 1.2 + rnd() * 2.5, cells = [];
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (Math.hypot(dx, dy) <= r) cells.push(w.idx(cx + dx, cy + dy));
    if (!cells.some(i => isWater(w.terrain[i]) || w.struct[i] >= 0)) for (const i of cells) paint(game, i);
  }
  w.hv++;
}
export function damCreeks(game, gap = 9) {
  const w = game.world; let n = 0;
  for (let i = 0; i < w.n; i++) if (w.terrain[i] === T.CREEK && w.feature[i] === 0 && !game.wildlife.damNear(i, gap)) { game.wildlife.buildDam(i); n++; }
  w.hv++; return n;
}
if (process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href && process.argv.includes('--scenarios')) {
  const summer = game => { game.wildlife.buildDam(game.world.idx(54, 46)); game.weather = 'rain'; for (let k = 0; k < 30; k++) game.water?.step(game); game.weather = 'clear'; game.day = 50; for (let k = 0; k < 60; k++) game.water?.step(game); };
  for (const [name, fn] of [['marsh', paintMarsh], ['dams', damCreeks], ['dam pond in late summer', summer]]) {
    const game = new Game(); game.newGame(1987, 'free', 'standard', 'pnw'); fn(game);
    const t = makeView(game); console.log('pnw ' + name, JSON.stringify(measure(game, t)));
  }
}
