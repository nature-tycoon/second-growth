// Integration soak through real maps, suitability and ordinary animal decisions.
import assert from 'node:assert/strict';
import { BIOME_LIST } from '../js/biome.js';
import { restoredGame } from './map-audit-fixtures.mjs';
import { hasTerritory } from '../js/sim/animal-territory.js';
import { passable, canLand } from '../js/sim/animal-terrain.js';
import { mulberry32 } from '../js/rng.js';
for (const seed of [1987, 91]) for (const map of BIOME_LIST) {
  Math.random = mulberry32(seed);
  const g = restoredGame(map.id, seed), wl = g.wildlife, w = g.world;
  g.day = 20; wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6;
  wl.computeSuitability();
  const observed = new Set(), owners = new Set(), markers = new Set(), configured = [];
  for (const d of g.catalog.animals) {
    if (!d.behavior.territory) continue;
    configured.push(d.key);
    let spot = -1, best = 0.2;
    for (let j = 0; j < w.n; j++) if (wl.suit[d.index][j] > best && passable(w, j, d) && canLand(w, j, d) && !w.fire[j]) { best = wl.suit[d.index][j]; spot = j; }
    assert.ok(spot >= 0, `${map.id}/${d.key}: suitable habitat exists`);
    for (let k = 0; k < 4; k++) {
      const a = wl.spawn(d, spot % w.w, spot / w.w | 0, { silent: true });
      a.wait = 0; a.hunger = 0; a.thirst = 0;
    }
  }
  for (let k = 0; k < 800; k++) {
    wl.update(0.05);
    for (const a of wl.agents) {
      assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
      const d = g.catalog.animals[a.sp];
      if (a.territory && hasTerritory(wl, a, d)) {
        observed.add(d.key); owners.add(a.id);
        assert.ok(!w.fire[a.territory.home]);
        if (a.territory.mode === 'mark' || a.territory.mode === 'display') markers.add(a.id);
      }
    }
  }
  assert.deepEqual([...observed].sort(), configured.sort(), `${map.id}: ordinary decisions activate each selected species`);
  assert.ok(markers.size, `${map.id}: at least one territorial pause/display`);
  const before = wl.agents.length;
  wl.load(JSON.parse(JSON.stringify(wl.serialize()))); wl.update(0.05);
  assert.equal(wl.agents.length, before);
  console.log(JSON.stringify({ map: map.id, seed, species: [...observed], residentsObserved: owners.size, displaysObserved: markers.size, days: 40 }));
}
console.log('PASS territorial decisions, resident displays and save/load on seven maps and two seeds');
