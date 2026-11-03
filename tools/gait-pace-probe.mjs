// node tools/gait-pace-probe.mjs [maps...]
// How far ground walkers actually move for each step of their leg clock (a.phase), as a fraction
// of their unhindered walking pace: the ratio the drawing uses to slow the stride (actors.js,
// strideFollowsGround). STATE=1 splits it by state. Per species: the median ratio while walking, and the share of walking
// steps it falls below 0.35 (held up by a trunk, a neighbour or its own herd).
import { restoredGame } from './map-audit-fixtures.mjs';
import { populate } from './animal-steering-check.mjs';
import { mulberry32 } from '../js/rng.js';
import { groundPace } from '../js/render3d/stride.js';

globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const maps = process.argv.slice(2).length ? process.argv.slice(2) : ['pnw', 'serengeti'];
for (const map of maps) {
  Math.random = mulberry32(7);
  const g = restoredGame(map, 7), wl = g.wildlife, cat = g.catalog;
  g.day = 70; populate(g, mulberry32(8));
  const last = new Map(), by = {};
  for (let s = 0; s < 400; s++) {
    wl.update(0.02);
    for (const a of wl.agents) {
      const def = cat.animals[a.sp], p = last.get(a.id);
      last.set(a.id, [a.x, a.y, a.phase]);
      if (!p || a.state === 'idle' || def.move !== 'ground' || def.reef) continue;
      const r = groundPace(def, Math.hypot(a.x - p[0], a.y - p[1]), a.phase - p[2]);
      if (r == null) continue;
      (by[process.env.STATE ? `${a.key}/${a.state}${a.follow ? "+follow" : ""}${a.moveProgress?.stalled > 0.3 ? "+stalled" : ""}` : a.key] ||= []).push(r);
    }
  }
  console.log(map);
  for (const [k, rs] of Object.entries(by).sort()) {
    rs.sort((x, y) => x - y);
    console.log(`  ${k.padEnd(14)} n=${String(rs.length).padStart(5)} median ${rs[rs.length >> 1].toFixed(2)}  stalled ${(100 * rs.filter(r => r < 0.35).length / rs.length).toFixed(0)}%`);
  }
}
