// Why a snake does or doesn't catch prey: one map's restored landscape run for some years, seeded,
// counting each snake's hunts started, hunts that ended in a catch, and the days it went hungry
// with no prey within striking reach (3.5 tiles) or with the way to it blocked.
//   node tools/snake-hunt-probe.mjs [map=amazon] [years=3]   (SEEDS=7,11,23)
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { preyFor } from '../js/data/animals.js';
import { huntHunger } from '../js/data/animal-activity.js';
import { canHuntPrey } from '../js/sim/animal-life.js';

globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const [map = 'amazon', years = 3] = process.argv.slice(2), seeds = (process.env.SEEDS || '7,11,23').split(',').map(Number);
for (const seed of seeds) {
  Math.random = mulberry32(seed);
  const g = restoredGame(map, seed), cat = g.catalog, wl = g.wildlife;
  const snakes = cat.animals.filter(d => d.sprite.kind === 'snake' && preyFor(d, g));
  const n = Object.fromEntries(snakes.map(d => [d.key, { snakeDays: 0, hungry: 0, noPrey: 0, blocked: 0, states: {}, starts: 0, kills: 0 }]));
  const on = g.onPredation.bind(g);
  g.onPredation = (p, b) => { const k = cat.animals[p.sp].key; if (n[k]) n[k].kills++; return on(p, b); };
  for (let d = 0; d < years * 120; d++) {
    const before = new Map(wl.agents.map(a => [a.id, a.state]));
    g.dailyTick();
    for (let k = 0; k < 10; k++) wl.update(0.1);
    for (const a of wl.agents) {
      const def = cat.animals[a.sp], c = n[def.key]; if (!c) continue;
      c.snakeDays++;
      if (a.state === 'hunt' && before.get(a.id) !== 'hunt') c.starts++;
      if (a.hunger <= huntHunger(def) || a.state === 'hunt') continue;
      c.hungry++; c.states[a.state] = (c.states[a.state] || 0) + 1;
      const prey = new Set(preyFor(def, g).map(k => cat.animal[k].index));
      const near = wl.agents.filter(b => prey.has(b.sp) && (b.x - a.x) ** 2 + (b.y - a.y) ** 2 < 3.5 ** 2 && canHuntPrey(wl, a, def, b));
      if (!near.length) c.noPrey++; else if (near.every(b => wl.huntBlocked(a, def, b))) c.blocked++;
    }
  }
  console.log(map, 'seed', seed, JSON.stringify(n));
}
