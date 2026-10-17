// Exercise the real restored landscapes, catalogs and movement loop; no saves are read/written.
import assert from 'node:assert/strict';
import { BIOME_LIST } from '../js/biome.js';
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { passable, canLand } from '../js/sim/animal-terrain.js';
for (const seed of [1987, 91]) for (const biome of BIOME_LIST) {
  Math.random = mulberry32(seed);
  const g = restoredGame(biome.id, seed), wl = g.wildlife, w = g.world;
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6;
  wl.computeSuitability();
  let represented = 0;
  for (const d of g.catalog.animals) {
    const suit = wl.suit[d.index]; let best = -1, score = 0.15;
    for (let j = 0; j < w.n; j++) {
      if (suit[j] > score && !w.fire[j] && passable(w, j, d) && canLand(w, j, d)) { best = j; score = suit[j]; }
    }
    if (best < 0) continue;
    represented++;
    for (let k = 0; k < Math.min(d.max, d.herd ? 12 : 4); k++) {
      const a = wl.spawn(d, best % w.w, best / w.w | 0, { silent: true });
      a.wait = 0;
    }
  }
  const start = wl.agents.length;
  let stalled = 0;
  for (let k = 0; k < 400; k++) {
    wl.update(0.05);
    for (const a of wl.agents) {
      assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y), `${biome.id}/${a.key}: finite position`);
      if (a.leaving || a.move === 'fly') continue;
      assert.ok(w.inb(Math.floor(a.x), Math.floor(a.y)), `${biome.id}/${a.key}: inside map`);
      if (g.catalog.animals[a.sp].reef) assert.ok(passable(w, w.idx(Math.floor(a.x), Math.floor(a.y)), a), `${a.key}: stays in sea`);
    }
    if (k > 200) stalled += wl.agents.filter(a => a.state === 'walk' && a.moveProgress?.stalled > 3).length;
  }
  assert.equal(stalled, 0, `${biome.id}: prolonged stalled walking`);
  console.log(JSON.stringify({ map: biome.id, seed, represented, start, end: wl.agents.length, days: 20, prolongedStalls: stalled }));
}
console.log('PASS restored landscape movement on all seven maps and two seeds');
