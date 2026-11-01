// node tools/flight-canopy-check.mjs [maps] [--report]
// Flying birds and bats clear the treetops (decision 0024 made trees taller than ordinary flight).
// A mixed community flies about a restored map for a while, drawn by the real Actors, and every
// sample of a flier over trees is compared with the top of the crown under it. Fliers on their way
// down (a stoop, the last tile before landing, the end of a vulture's spiral) may go below.
// Fails if more than 1% of the other samples are inside a crown.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { passable, canLand } from '../js/sim/animal-terrain.js';
import { canopyTop, descending } from '../js/render3d/flight-clearance.js';
const THREE = await import('three');
const { Actors } = await import('../js/render3d/actors.js');
const args = process.argv.slice(2), report = args.includes('--report');
const maps = (args.find(a => !a.startsWith('--')) || 'pnw,atlanta,amazon,sumatra').split(',');
let failed = false;
for (const map of maps) {
  Math.random = mulberry32(7);
  const g = restoredGame(map, 7), wl = g.wildlife, w = g.world;
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability();
  for (const d of g.catalog.animals) {
    if (d.move !== 'fly' || d.reef) continue;
    const suit = wl.suit[d.index], good = [];
    for (let j = 0; j < w.n; j++) if (suit[j] > 0.3 && passable(w, j, d) && canLand(w, j, d) && !w.fire[j]) good.push(j);
    for (let k = 0; k < Math.min(d.max, 6) && good.length; k++) { const j = good[Math.floor(Math.random() * good.length)]; const a = wl.spawn(d, j % w.w, j / w.w | 0, { silent: true }); a.wait = Math.random(); }
  }
  const actors = new Actors(new THREE.Scene()), right = new THREE.Vector3(1, 0, 0);
  actors.nightOut = 1; // (bats out too)
  let over = 0, inside = 0, worst = 0, t = 0;
  const bad = new Map();
  for (let k = 0; k < 1200; k++) {
    if (k % 20 === 0) { g.day++; wl.daily(); }
    wl.update(0.05);
    actors.update(g, right, (t += 0.05));
    if (k < 40) continue; // (the easing settles first)
    for (const a of wl.agents) {
      const def = g.catalog.animals[a.sp], st = actors.pose.get(a.id);
      if (def.move !== 'fly' || !st || !(a.flying || a.alt > 0.05 || def.sprite.kind === 'bat') || descending(a, def) || st.fly < 0.95) continue; // (taking off, it climbs out of its own tree; the drawing reads st.fly a frame earlier)
      const top = canopyTop(w, g.catalog.plants, a.x, a.y, 0, 0, 0);
      if (top === -Infinity) continue;
      over++;
      const under = top - st.y;
      if (under > 0.05) { inside++; worst = Math.max(worst, under); bad.set(def.key, (bad.get(def.key) || 0) + 1); }
    }
  }
  const pct = over ? 100 * inside / over : 0;
  console.log(`${map}: ${over} samples of fliers over trees, ${inside} inside a crown (${pct.toFixed(2)}%), deepest ${worst.toFixed(2)} tiles${bad.size ? ' ' + JSON.stringify(Object.fromEntries(bad)) : ''}`);
  if (!report && (over < 200 || pct > 1)) { failed = true; console.log(`FAIL ${map}`); }
}
assert.ok(!failed, 'fliers must clear the canopy');
console.log('PASS flight over the canopy');
