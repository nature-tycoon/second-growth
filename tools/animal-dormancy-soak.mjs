// Two temperate maps through winter and spring, using real restored habitats,
// daily ecology, monthly population pressure, ordinary movement and midwinter saves.
import assert from 'node:assert/strict';
import { restoredGame } from './map-audit-fixtures.mjs';
import { winterShelter, shelteredDormant } from '../js/sim/animal-dormancy.js';
import { passable } from '../js/sim/animal-terrain.js';
import { mulberry32 } from '../js/rng.js';
for (const seed of [1987, 91]) for (const map of ['pnw', 'atlanta']) {
  Math.random = mulberry32(seed);
  const g = restoredGame(map, seed), wl = g.wildlife, w = g.world;
  g.day = 90; g.weather = 'snow'; g.snow = 0.5;
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability();
  const selected = g.catalog.animals.filter(d => d.behavior.dormancy), sleepers = new Set(), arousals = new Set();
  for (const d of selected) {
    const candidate = { ...d, key: d.key };
    let site = -1, best = -1;
    for (let j = 0; j < w.n; j++) if (winterShelter(wl, candidate, d, j) && wl.suit[d.index][j] > best) { site = j; best = wl.suit[d.index][j]; }
    assert.ok(site >= 0, `${map}/${d.key}: restored habitat provides winter shelter`);
    const x = site % w.w, y = site / w.w | 0;
    for (let n = 0; n < 2; n++) {
      const nearby = [[x+3,y],[x-3,y],[x,y+3],[x,y-3]].find(([xx,yy]) => w.inb(xx,yy) && passable(w,w.idx(xx,yy),candidate));
      const a = wl.spawn(d, ...(nearby || [x,y]), { silent: true });
      a.hunger = 0; a.thirst = 0; a.wait = 0;
    }
  }
  for (let day = 0; day < 40; day++) {
    // Weather approximation deliberately exercises both sustained sleep and warm arousals.
    g.weather = day < 10 ? 'snow' : 'clear'; g.snow = day < 10 ? 0.5 : 0;
    wl.daily();
    for (let k = 0; k < 20; k++) {
      wl.update(0.05);
      for (const a of wl.agents) {
        assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
        const d = g.catalog.animals[a.sp];
        if (a.state === 'dormant') { assert.ok(shelteredDormant(wl,a,d)); sleepers.add(d.key); }
        else if (sleepers.has(d.key) && g.month >= 9 && a.dormancyAfter > a.age) arousals.add(d.key);
      }
    }
    if (day === 14) wl.load(JSON.parse(JSON.stringify(wl.serialize())));
    g.day++;
    if (g.day % 10 === 0) wl.monthly();
    if (g.month === 0) { wl.update(0.05); assert.ok(wl.agents.every(a => a.state !== 'dormant'), 'spring emergence'); }
  }
  assert.deepEqual([...sleepers].sort(), selected.map(d => d.key).sort(), `${map}/${seed}: each selected species sheltered`);
  assert.ok(arousals.size, 'warm winter arousals observed');
  assert.ok(wl.agents.every(a => a.state !== 'dormant'));
  console.log(JSON.stringify({ map, seed, species: [...sleepers], winterArousals: [...arousals], residents: wl.agents.length, days: 40 }));
}
console.log('PASS winter/spring ecology and save/load on two temperate maps and two seeds');
