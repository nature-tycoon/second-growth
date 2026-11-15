// One terrain edit path (decision 0048, phase 2): node tools/terrain-edit-check.mjs [maps]
// - Every land tool (Raise and Lower ground, Fill & grade, dig pond, marsh and creek) used on land
//   beside a creek, the river, a pond, a marsh or a building, on every map, moves no corner it doesn't
//   own: never a building's; for Raise, Lower and Fill never another water body's; digging may take
//   the corners it shares with other water down to that water's bed, never below (a pond joining a
//   creek or the river, CHANNEL_STEP below), and never raises them. Before phase 2, Raise and Lower
//   beside a creek moved the creek's corners, and digging or a pond's bank moved a building's.
// - Putting up a building beside water levels its footprint but leaves the water's corners.
// - No game code outside map generation writes heights except through js/terrain-edit.js.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Game } = await import('../js/game.js');
const { BIOME_LIST } = await import('../js/biome.js');
const { ToolActions } = await import('../js/tool-actions.js');
const { T, BORDER, isWater } = await import('../js/config.js');
const { CHANNEL_STEP } = await import('../js/maps/landform.js');

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
const maps = process.argv[2] ? process.argv[2].split(',') : BIOME_LIST.map(b => b.id);
const ROUND = [[0, 0], [-1, 0], [0, -1], [-1, -1]], N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const channel = t => t === T.CREEK || t === T.RIVER;

check('No game code outside map generation writes heights except through js/terrain-edit.js', () => {
  const root = new URL('../js/', import.meta.url), files = [];
  const walk = dir => { for (const e of readdirSync(new URL(dir, root), { withFileTypes: true })) e.isDirectory() ? walk(dir + e.name + '/') : e.name.endsWith('.js') && files.push(dir + e.name); };
  walk('');
  // (map generation: world.js and each map's *-world.js and landform.js; drawing reads heights only)
  const generation = f => f === 'world.js' || f === 'terrain-edit.js' || /^maps\/(landform|[a-z]+-world)\.js$/.test(f) || f.startsWith('render3d/');
  const writes = /setVert\(|\.carve\(|flattenRect\(|\bvh\[[^\]]+\]\s*[-+]?=[^=]|\bvh\.(set|fill)\(/;
  const bad = files.filter(f => !generation(f)).filter(f => readFileSync(new URL(f, root), 'utf8').split('\n').some(l => writes.test(l) && !/^\s*\/\//.test(l)));
  assert.deepEqual(bad, [], `height writes outside the edit path: ${bad.join(', ')}`);
});

for (const map of maps) {
  const g = new Game();
  g.newGame(1987, 'free', 'standard', map);
  g.autosave = false;
  const fresh = g.saveData();
  const canEdit = i => !g.mapDefinition.canEdit || g.mapDefinition.canEdit(g, i);
  // land tiles beside each kind of owner (up to 8 of each, spread over the map)
  const w0 = g.world, sites = { channel: [], body: [], building: [] };
  for (let i = 0; i < w0.n; i++) {
    const x = i % w0.w, y = (i / w0.w) | 0, t = w0.terrain[i];
    if (isWater(t) || w0.struct[i] >= 0 || w0.feature[i] || t === T.ROAD || !canEdit(i)) continue;
    for (const [dx, dy] of N8) {
      if (!w0.inb(x + dx, y + dy)) continue;
      const j = w0.idx(x + dx, y + dy), tj = w0.terrain[j];
      const kind = w0.struct[j] >= 0 ? 'building' : channel(tj) ? 'channel' : isWater(tj) ? 'body' : null;
      if (kind) { sites[kind].push(i); break; }
    }
  }
  const pick = a => a.filter((_, k) => k % Math.max(1, Math.floor(a.length / 8)) === 0).slice(0, 8);
  for (const kind of Object.keys(sites)) sites[kind] = pick(sites[kind]);

  for (const key of ['raise', 'lower', 'fill', 'pond', 'marsh', 'creek']) {
    if (!g.catalog.tools[key]) continue;
    check(`${map}: ${key} beside a creek, a pond or a building moves no corner it doesn't own`, () => {
      let tried = 0;
      for (const [kind, list] of Object.entries(sites)) for (const i of list) {
        assert.ok(g.restoreSave(structuredClone(fresh)));
        const w = g.world, before = w.vh.slice(), terrain = w.terrain.slice(), struct = w.struct.slice();
        const beds = new Map();
        const s = new ToolActions(g).apply(key, [i]);
        if (!s?.count) continue;
        tried++;
        // (a dug pond is levelled with the pond it joins: those tiles are its own)
        const own = new Set([i]), q = [i];
        for (let k = 0; key === 'pond' && k < q.length; k++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = q[k] % w.w + dx, yy = ((q[k] / w.w) | 0) + dy, j = w.idx(xx, yy);
          if (w.inb(xx, yy) && !own.has(j) && w.terrain[j] === T.POND) { own.add(j); q.push(j); }
        }
        for (let v = 0; v < before.length; v++) {
          if (w.vh[v] === before[v]) continue;
          const vx = v % w.VW - BORDER, vy = ((v / w.VW) | 0) - BORDER;
          for (const [ox, oy] of ROUND) {
            const tx = vx + ox, ty = vy + oy;
            if (!w.inb(tx, ty)) continue;
            const j = w.idx(tx, ty);
            if (own.has(j)) continue;
            const where = `${map} ${key} at (${i % w.w}, ${(i / w.w) | 0}) beside a ${kind}: corner (${vx}, ${vy})`;
            assert.ok(!(struct[j] >= 0), `${where} of a building moved ${before[v].toFixed(3)} -> ${w.vh[v].toFixed(3)}`);
            if (!isWater(terrain[j])) continue;
            const dig = key === 'pond' || key === 'marsh' || key === 'creek';
            assert.ok(dig, `${where} of other water moved ${before[v].toFixed(3)} -> ${w.vh[v].toFixed(3)}`);
            assert.ok(w.vh[v] < before[v], `${where} of other water was raised`);
            // (that water's bed before the edit: its lowest corner, read from the snapshot)
            if (!beds.has(j)) {
              let b = Infinity;
              for (const [dx, dy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) b = Math.min(b, before[w.vi(tx + dx, ty + dy)]);
              beds.set(j, b);
            }
            const floor = beds.get(j) - (key === 'pond' && channel(terrain[j]) ? CHANNEL_STEP : 0);
            assert.ok(w.vh[v] >= floor - 1e-6, `${where} went ${(floor - w.vh[v]).toFixed(3)} under the bed of the water beside it`);
          }
        }
      }
      assert.ok(tried > 0 || !Object.values(sites).some(l => l.length), `${map}: ${key} did nothing anywhere`);
    });
  }
}

check('pnw: a building put up beside a creek levels its footprint and leaves the creek', () => {
  const g = new Game();
  g.newGame(1987, 'free', 'standard', 'pnw');
  const w = g.world;
  const shed = w.catalog.structures.shed;
  // (a dry, open spot beside the creek: a shed is a roost, so it needs no road)
  let at = -1;
  for (let i = 0; i < w.n && at < 0; i++) {
    const x = i % w.w, y = (i / w.w) | 0;
    if (!w.inb(x + 2, y + 1) || x < 1) continue;
    let ok = true, creek = false;
    for (let yy = y; yy < y + shed.h; yy++) for (let xx = x; xx < x + shed.w; xx++) {
      const j = w.idx(xx, yy);
      if (isWater(w.terrain[j]) || w.terrain[j] === T.ROAD || w.terrain[j] === T.TRAIL || w.struct[j] >= 0 || w.feature[j] || w.tree[j]) ok = false;
    }
    for (let yy = y; yy < y + shed.h; yy++) if (w.terrain[w.idx(x - 1, yy)] === T.CREEK) creek = true;
    if (ok && creek) at = i;
  }
  assert.ok(at >= 0, 'no spot beside the creek');
  const x = at % w.w, y = (at / w.w) | 0, creekTiles = [w.idx(x - 1, y), w.idx(x - 1, y + 1)].filter(j => w.terrain[j] === T.CREEK);
  const creek = creekTiles.map(j => w.corners(j % w.w, (j / w.w) | 0));
  const s = new ToolActions(g).apply('build_shed', [at]);
  assert.equal(s.count, 1);
  assert.deepEqual(creekTiles.map(j => w.corners(j % w.w, (j / w.w) | 0)), creek, 'the shed moved the creek');
  const inner = w.vert(x + 1, y), far = w.vert(x + 2, y + 2);
  assert.ok(Math.abs(inner - far) < 1e-6, 'the footprint away from the creek is level');
});

console.log(`${checks} terrain edit checks passed.`);
