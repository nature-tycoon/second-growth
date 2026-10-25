// node tools/trail-width-report.mjs [map] [years] [seed] [out.ppm]   (SPECIES=elephant,giraffe stocks only those)
// How wide the drawn game trails grow on a stocked map, and which species wear them. A report, not
// a check (decision 0010): runs the daily tick and wildlife for some game years, then measures the
// drawn trail field. "Wide" is drawn wear with drawn wear half a tile away on both sides, across
// either axis: a band rather than a path. Optionally writes the field as a PPM image.
import { writeFileSync } from 'node:fs';
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { passable, canLand } from '../js/sim/animal-terrain.js';
import { trailMask, TRAIL_THRESHOLD } from '../js/sim/animal-trails.js';
import { TRAIL_RESOLUTION as R } from '../js/data/animal-trails.js';
import { DAYS_PER_YEAR } from '../js/config.js';
const map = process.argv[2] || 'serengeti', years = +(process.argv[3] || 5), seed = +(process.argv[4] || 7), out = process.argv[5];
const only = process.env.SPECIES?.split(',');
Math.random = mulberry32(seed);
const g = restoredGame(map, seed), wl = g.wildlife, w = g.world;
wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability();
for (const d of g.catalog.animals) {
  if (d.move !== 'ground' || only && !only.includes(d.key)) continue;
  const suit = wl.suit[d.index], good = [];
  for (let j = 0; j < w.n; j++) if (suit[j] > 0.3 && passable(w, j, d) && canLand(w, j, d) && !w.fire[j]) good.push(j);
  if (!good.length) continue;
  for (let k = 0; k < d.max; k++) { const j = good[Math.floor(Math.random() * good.length)]; const a = wl.spawn(d, j % w.w, j / w.w | 0, { silent: true }); a.wait = Math.random(); }
}
const walked = new Map(), last = new Map(), tileWalk = new Map();
for (let day = 0; day < years * DAYS_PER_YEAR; day++) {
  g.dailyTick();
  for (let k = 0; k < 20; k++) {
    for (const a of wl.agents) last.set(a, [a.x, a.y]);
    wl.update(0.05);
    for (const a of wl.agents) {
      const p = last.get(a), leave = a.state === 'leave';
      if (!p || !(leave || a.state === 'walk' && a.course?.pts && a.course.path === a.path)) continue;
      const d = Math.hypot(a.x - p[0], a.y - p[1]); if (d >= 2 || !w.inb(a.x | 0, a.y | 0)) continue;
      const key = a.key + (leave ? '(leaving)' : ''); walked.set(key, (walked.get(key) || 0) + d);
      if (!tileWalk.has(key)) tileWalk.set(key, new Float32Array(w.n));
      tileWalk.get(key)[(a.y | 0) * w.w + (a.x | 0)] += d;
    }
  }
}
const W = w.w * R, H = w.h * R, drawn = new Float32Array(W * H);
for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
  const x = (px + 0.5) / R, y = (py + 0.5) / R, j = (y | 0) * w.w + (x | 0);
  drawn[py * W + px] = trailMask(w, j, x - (x | 0), y - (y | 0));
}
// (a tile counts as migration ground when herds leaving the map walk a fifth or more of its journeys)
const leaving = new Float32Array(w.n), all = new Float32Array(w.n);
for (const [k, t] of tileWalk) for (let j = 0; j < w.n; j++) { all[j] += t[j]; if (k.endsWith('(leaving)')) leaving[j] += t[j]; }
let n = 0, wide = 0, rn = 0, rwide = 0;
const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H ? drawn[y * W + x] : 0;
for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
  if (!(drawn[py * W + px] > 0)) continue; n++;
  const j = (py / R | 0) * w.w + (px / R | 0), resident = leaving[j] < all[j] * 0.2, band = at(px - 2, py) > 0 && at(px + 2, py) > 0 && at(px, py - 2) > 0 && at(px, py + 2) > 0;
  if (band) wide++;
  if (resident) { rn++; if (band) rwide++; }
}
const dens = w.trailDensity; let sat = 0; for (let i = 0; i < dens.length; i++) if (dens[i] > 0.5) sat++;
console.log(`${map} ${years}y seed ${seed}: drawn ${(100 * n / (W * H)).toFixed(2)}% of map, wide ${(100 * wide / Math.max(1, n)).toFixed(1)}% of drawn (away from the migration: ${(100 * rwide / Math.max(1, rn)).toFixed(1)}% of ${(100 * rn / (W * H)).toFixed(2)}% drawn), wear>0.5 ${sat} samples`);
// which kinds walk the ground under the wide stretches
const under = new Map();
for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
  if (!(drawn[py * W + px] > 0 && at(px - 2, py) > 0 && at(px + 2, py) > 0 && at(px, py - 2) > 0 && at(px, py + 2) > 0)) continue;
  const j = (py / R | 0) * w.w + (px / R | 0);
  for (const [k, t] of tileWalk) under.set(k, (under.get(k) || 0) + t[j]);
}
const tot = [...under.values()].reduce((s, v) => s + v, 0) || 1;
console.log('journeys over wide stretches:', [...under].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${Math.round(100 * v / tot)}%`).join(', '));
console.log('journey tiles walked:', [...walked].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', '));
if (out) {
  const img = Buffer.alloc(W * H * 3);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const j = (py / R | 0) * w.w + (px / R | 0), i = (py * W + px) * 3, v = drawn[py * W + px];
    const water = w.distWater[j] === 0;
    img[i] = water ? 60 : 200 - v * 140; img[i + 1] = water ? 110 : 200 - v * 150; img[i + 2] = water ? 200 : 170 - v * 150;
    if (!v && dens[py * W + px] > TRAIL_THRESHOLD * 0.3) img[i + 1] = 170;
  }
  writeFileSync(out, Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), img]));
}
