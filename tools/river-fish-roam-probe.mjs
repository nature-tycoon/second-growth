// node tools/river-fish-roam-probe.mjs [maps...]
// Whether river fish (move 'swim', not reef) get anywhere: each map's fish swim for 8 game days
// (about 11 minutes of play at normal speed) and, in each 2-day window, a fish whose positions
// all fit in a box under 1.5 tiles across counts as stuck. Prints, per species, the share of
// fish-windows stuck, the median distance covered in a window, and the state stuck fish were in.
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { passable } from '../js/sim/animal-terrain.js';
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const maps = process.argv.slice(2).length ? process.argv.slice(2) : ['pnw', 'atlanta'];
const DT = 0.036, WINDOW = 2, DAYS = 8;
for (const map of maps) {
  Math.random = mulberry32(3);
  const g = restoredGame(map, 3), wl = g.wildlife, cat = g.catalog;
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability();
  const w = g.world, rng = mulberry32(4);
  for (const d of cat.animals) {
    if (d.move !== 'swim' || d.reef) continue;
    const good = []; for (let j = 0; j < w.n; j++) if (wl.suit[d.index][j] > 0.2 && passable(w, j, d)) good.push(j);
    for (let k = 0; k < 10 && good.length; k++) { const j = good[Math.floor(rng() * good.length)]; wl.spawn(d, j % w.w, j / w.w | 0, { silent: true }); }
  }
  const box = new Map(), by = {};
  const steps = Math.round(DAYS / DT), per = Math.round(WINDOW / DT);
  for (let s = 0; s < steps; s++) {
    if (s % 28 === 27) { g.day++; wl.daily(); }
    wl.update(DT);
    for (const a of wl.agents) {
      const def = cat.animals[a.sp];
      if (def.move !== 'swim' || def.reef) continue;
      let b = box.get(a.id);
      if (!b) box.set(a.id, b = { x0: a.x, x1: a.x, y0: a.y, y1: a.y, path: 0, px: a.x, py: a.y, states: {} });
      b.x0 = Math.min(b.x0, a.x); b.x1 = Math.max(b.x1, a.x); b.y0 = Math.min(b.y0, a.y); b.y1 = Math.max(b.y1, a.y);
      b.path += Math.hypot(a.x - b.px, a.y - b.py); b.px = a.x; b.py = a.y;
      b.states[a.state] = (b.states[a.state] || 0) + 1;
    }
    if (s % per === per - 1) {
      for (const a of wl.agents) {
        const b = box.get(a.id); if (!b) continue;
        const e = by[a.key] ||= { n: 0, stuck: 0, paths: [], why: {} };
        e.n++; e.paths.push(b.path);
        if (Math.max(b.x1 - b.x0, b.y1 - b.y0) < 1.5) {
          e.stuck++;
          const top = Object.entries(b.states).sort((x, y) => y[1] - x[1])[0][0];
          e.why[top] = (e.why[top] || 0) + 1;
        }
      }
      box.clear();
    }
  }
  console.log(map);
  for (const [k, e] of Object.entries(by)) {
    e.paths.sort((x, y) => x - y);
    console.log(`  ${k.padEnd(11)} ${e.n} fish-windows, stuck ${(100 * e.stuck / e.n).toFixed(0)}%, median ${e.paths[e.paths.length >> 1].toFixed(1)} tiles a window; stuck in ${JSON.stringify(e.why)}`);
  }
}
