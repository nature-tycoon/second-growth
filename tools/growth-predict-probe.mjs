// How often a plant's drawn growth would have to be re-sent if the GPU extrapolated it from the
// growth and daily rate sent last time (decision 0046: measured, declined): per day, the tiles whose growth changed
// (today's redraw), the tiles a linear prediction misses by more than eps, and the regions each touches.
//   node tools/growth-predict-probe.mjs [maps] [days=90] [eps=0.002,0.005]
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { releaseGame } = await import('./release-fixtures.mjs');
const { floraChunkKey } = await import('../js/render3d/flora-changes.js');
const maps = (process.argv[2] || 'pnw,sumatra,serengeti,amazon').split(','), days = +(process.argv[3] || 90);
const epss = (process.argv[4] || '0.002,0.005').split(',').map(Number);
const LAYERS = [['ground', 'groundG'], ['shrub', 'shrubG'], ['tree', 'treeG']];
for (const map of maps) {
  const { game: g } = releaseGame(map, 'forest'), w = g.world;
  for (let d = 0; d < 240; d++) { g.dailyTick(); for (let k = 0; k < 10; k++) g.wildlife.update(.1); } // (two years grown)
  const prev = LAYERS.map(([, f]) => w[f].slice()), ids = LAYERS.map(([f]) => w[f].slice());
  const sent = epss.map(() => LAYERS.map(([, f]) => ({ g0: w[f].slice(), rate: new Float32Array(w.n), d0: new Int32Array(w.n) })));
  let resentDay = 0, lastMonth = g.month, why = {}; const daily = [];
  let changed = 0, changedR = 0, growing = 0; const resent = epss.map(() => 0), resentR = epss.map(() => 0);
  for (let d = 1; d <= days; d++) {
    g.dailyTick(); for (let k = 0; k < 10; k++) g.wildlife.update(.1);
    const month = g.month !== lastMonth; lastMonth = g.month;
    const rc = new Set(), rr = epss.map(() => new Set());
    for (let i = 0; i < w.n; i++) {
      const x = i % w.w, y = (i / w.w) | 0, key = floraChunkKey(x, y, 24);
      let ch = false; const miss = epss.map(() => false);
      LAYERS.forEach(([f, gf], L) => {
        const now = w[gf][i], was = prev[L][i], id = w[f][i], idWas = ids[L][i];
        if (now !== was || id !== idWas) ch = true;
        if (id && now > 0 && now < 1) growing++;
        epss.forEach((e, k) => {
          const s = sent[k][L], pred = Math.min(1, s.g0[i] + s.rate[i] * (d - s.d0[i]));
          if (id !== idWas || Math.abs(pred - now) > e) { miss[k] = true; if (k === epss.length - 1) { const c = (month ? 'month ' : '') + f + (id !== idWas ? ' id' : now < was ? ' shrank' : now - was > 1.5 * s.rate[i] ? ' faster' : ' slower'); why[c] = (why[c] || 0) + 1; } s.g0[i] = now; s.rate[i] = id === idWas ? Math.max(0, now - was) : 0; s.d0[i] = d; }
        });
        prev[L][i] = now; ids[L][i] = id;
      });
      if (ch) { changed++; rc.add(key); }
      epss.forEach((e, k) => { if (miss[k]) { if (k === epss.length - 1) resentDay++; resent[k]++; rr[k].add(key); } });
    }
    daily.push((month ? 'M' : '') + rr[epss.length - 1].size + '/' + resentDay); resentDay = 0;
    changedR += rc.size; epss.forEach((e, k) => resentR[k] += rr[k].size);
  }
  console.log(`${map}: ${(growing / days).toFixed(0)} growing plants; per day today ${(changed / days).toFixed(0)} tiles in ${(changedR / days).toFixed(1)} regions | `
    + epss.map((e, k) => `eps ${e}: ${(resent[k] / days).toFixed(0)} tiles in ${(resentR[k] / days).toFixed(1)} regions`).join(' | '));
  if (process.env.WHY) { console.log(Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / days).toFixed(0)}`).join(', ')); console.log('regions/tiles per day:', daily.join(' ')); }
}
