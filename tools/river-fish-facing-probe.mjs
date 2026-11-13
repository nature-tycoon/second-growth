// node tools/river-fish-facing-probe.mjs [maps...]   (SEEDS=1987,91,7,42 DAYS=12)
// River and estuary fish swimming sideways or backwards: motion-sweep-check's `sideways` count over
// more seeds and days, with what each one was doing (state, stalled, the water under it, the angle).
import { sweep } from './motion-sweep-check.mjs';
import { swimDepth } from '../js/sim/waterline.js';
const wrap = d => d - Math.round(d / (Math.PI * 2)) * Math.PI * 2;
const maps = process.argv.slice(2).length ? process.argv.slice(2) : ['pnw', 'atlanta', 'serengeti', 'amazon', 'chinandega', 'sumatra'];
const SEEDS = (process.env.SEEDS || '1987,91,7,42').split(',').map(Number), DAYS = +(process.env.DAYS || 12);
for (const map of maps) {
  const why = {}, frames = {};
  for (const seed of SEEDS) {
    const r = sweep(map, { seed, days: DAYS, onHit: (k, a, { game, pose }) => {
      if (k !== 'sideways') return;
      const d = swimDepth(game.world, a.x, a.y);
      const lag = Math.abs(wrap(-pose.yaw - a.heading)) > 0.5; // (the drawing still turning to the simulation's heading, or the simulation moving off its own heading)
      const n = `${a.key} ${a.state} ${lag ? 'drawing-lags' : 'sim-slides'} stalled=${(a.moveProgress?.stalled ?? 0) > 0.3} depth=${d < 0.07 ? 'shallow' : d < 0.15 ? 'mid' : 'deep'} leaving=${!!a.leaving}`;
      why[n] = (why[n] || 0) + 1;
    } });
    for (const [key, c] of Object.entries(r.by)) if (c.sideways != null) (frames[key] ||= [0, 0]), frames[key][0] += c.frames, frames[key][1] += c.sideways;
  }
  const fish = Object.entries(frames).filter(([, [f, s]]) => s);
  console.log(`${map}: ${fish.map(([k, [f, s]]) => `${k} ${(1000 * s / f).toFixed(1)}/1000 (${s} of ${f})`).join(', ') || 'no sideways fish'}`);
  for (const [n, c] of Object.entries(why).sort((p, q) => q[1] - p[1]).slice(0, 12)) console.log(`  ${String(c).padStart(5)} ${n}`);
}
