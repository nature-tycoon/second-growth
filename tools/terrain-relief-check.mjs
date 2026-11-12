// Terrain relief per map (0044): each new map's height range and slopes sit in the band its real
// landscape has, and the land drains: every corner has a way down to water or the map's edge
// that never climbs, and every creek bed has one too.
//   node tools/terrain-relief-check.mjs            (all maps)
//   node tools/terrain-relief-check.mjs pnw,amazon
const root = new URL('../js/', import.meta.url).href;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { setBiome, mapCatalog, BIOMES } = await import(root + 'biome.js');
const { isWater, T } = await import(root + 'config.js');

const M_PER_LEVEL = 2.4, TILE_M = 8;
// range: metres between the 5th and 95th percentile of land height; median and p90: grade in %;
// steep: share of land over 15%. Chinandega (a volcano's foot) and the reef (seabed) aren't banded.
// flats: the highest the land 8 tiles from the river may stand (90th percentile, levels), for maps
// whose river floods its flats.
const BANDS = {
  pnw: { range: [25, 45], median: [3, 8], p90: [10, 20], steep: [0.04, 0.16] }, // Cascade foothills
  atlanta: { range: [16, 30], median: [4, 9], p90: [8, 16], steep: [0, 0.12] }, // Piedmont ridge and ravine
  amazon: { range: [9, 20], median: [1, 4], p90: [8, 16], steep: [0, 0.11], flats: 1 }, // várzea and terra firme
  serengeti: { range: [4, 12], median: [0.5, 2.5], p90: [4, 10], steep: [0, 0.08] }, // plains, korongos, kopjes
  sumatra: { range: [13, 26], median: [2.5, 6], p90: [10, 18], steep: [0, 0.14] }, // low hills and flat peat
};
const maps = (process.argv[2] || Object.keys(BIOMES).join(',')).split(',');
let failed = 0;
const fail = (map, msg) => { failed++; console.log(`FAIL ${map}: ${msg}`); };

for (const map of maps) {
  setBiome(map);
  const catalog = mapCatalog(map), w = catalog.definition.generate(1987, catalog);
  const grades = [], hs = [];
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
    if (isWater(w.terrain[w.idx(x, y)])) continue;
    hs.push(w.tileH(x, y));
    const c = w.corners(x, y), gx = ((c[1] + c[2]) - (c[0] + c[3])) / 2, gy = ((c[2] + c[3]) - (c[0] + c[1])) / 2;
    grades.push(Math.hypot(gx, gy) * M_PER_LEVEL / TILE_M * 100);
  }
  grades.sort((a, b) => a - b); hs.sort((a, b) => a - b);
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  const range = (q(hs, 0.95) - q(hs, 0.05)) * M_PER_LEVEL, median = q(grades, 0.5), p90 = q(grades, 0.9);
  const steep = grades.filter(g => g > 15).length / grades.length;
  const flatHs = [];
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
    const t = w.terrain[w.idx(x, y)];
    if (isWater(t)) continue;
    let r = 0; while (r < 9 && y + r < w.h && w.terrain[w.idx(x, y + r)] !== T.RIVER) r++;
    if (r <= 8 && y + r < w.h) flatHs.push(w.tileH(x, y));
  }
  flatHs.sort((a, b) => a - b);
  const flats = flatHs.length ? q(flatHs, 0.9) : 0;

  // drainage: how deep water would stand at each corner before it spilled out to water that
  // collects (river, pond, marsh) or the map's edge (a priority flood). Land away from water should
  // hold none; a creek bed may hold a pool, but not a long stretch of still water.
  const VW = w.w + 1, VH = w.h + 1, vh = new Float32Array(VW * VH), spill = new Float32Array(VW * VH).fill(Infinity), heap = [];
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) vh[y * VW + x] = w.vert(x, y);
  const touches = (x, y, kinds) => [[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) => w.inb(x + dx, y + dy) && kinds.includes(w.terrain[w.idx(x + dx, y + dy)]));
  const push = (v, s) => { spill[v] = s; heap.push(v); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (spill[heap[p]] <= s) break; heap[k] = heap[p]; k = p; } heap[k] = v; };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = -1, ms = spill[last];
        if (l < heap.length && spill[heap[l]] < ms) { m = l; ms = spill[heap[l]]; }
        if (r < heap.length && spill[heap[r]] < ms) m = r;
        if (m < 0) break;
        heap[k] = heap[m]; k = m;
      }
      heap[k] = last;
    }
    return top;
  };
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) if (x === 0 || y === 0 || x === w.w || y === w.h || touches(x, y, [T.RIVER, T.POND, T.MARSH])) push(y * VW + x, vh[y * VW + x]);
  const done = new Uint8Array(VW * VH);
  while (heap.length) {
    const v = pop();
    if (done[v]) continue;
    done[v] = 1;
    const x = v % VW, y = (v / VW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy, u = yy * VW + xx;
      if (xx < 0 || yy < 0 || xx >= VW || yy >= VH || done[u]) continue;
      const s = Math.max(vh[u], spill[v]);
      if (s < spill[u]) push(u, s);
    }
  }
  const WATER = [T.RIVER, T.POND, T.MARSH, T.CREEK];
  let hollow = 0, deepest = 0, creekStuck = 0, creeks = 0;
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const v = y * VW + x, depth = spill[v] - vh[v];
    if (touches(x, y, WATER) || w.struct[w.idx(Math.min(x, w.w - 1), Math.min(y, w.h - 1))] >= 0) continue;
    if (depth > 0.05) { hollow++; deepest = Math.max(deepest, depth); }
  }
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
    if (w.terrain[w.idx(x, y)] !== T.CREEK) continue;
    creeks++;
    const bed = Math.min(...[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].map(([a, b]) => spill[b * VW + a] - vh[b * VW + a]));
    if (bed > 0.3) creekStuck++;
  }
  console.log(`${map.padEnd(10)} land ${range.toFixed(0)} m (5-95%), grade median ${median.toFixed(1)}% p90 ${p90.toFixed(1)}%, over 15% ${(steep * 100).toFixed(1)}%, river flats ${flats.toFixed(2)} lv; ` +
    `land corners in hollows ${hollow} (deepest ${(deepest * M_PER_LEVEL).toFixed(1)} m), creek tiles in still water over 0.7 m ${creekStuck} of ${creeks}`);
  const band = BANDS[map];
  if (!band) continue;
  const inBand = (v, [a, b], what) => { if (v < a || v > b) fail(map, `${what} ${v.toFixed(2)} outside ${a}..${b}`); };
  inBand(range, band.range, 'height range (m)');
  inBand(median, band.median, 'median grade (%)');
  inBand(p90, band.p90, '90th percentile grade (%)');
  inBand(steep, band.steep, 'share over 15%');
  if (band.flats != null && flats > band.flats) fail(map, `river flats stand ${flats.toFixed(2)} levels high, over ${band.flats}`);
  if (hollow) fail(map, `${hollow} land corners sit in closed hollows`);
  if (creekStuck) fail(map, `${creekStuck} creek tiles sit in still water`);
}
if (failed) { console.log(`${failed} terrain relief checks failed.`); process.exit(1); }
console.log('PASS Terrain relief and drainage');
