// Plan a website clip before filming it: runs a clip's setup from website-video-clips.mjs headless and
// prints what its animals do every half second of the finished clip, stepped exactly as
// website-video.mjs films it (the clip's pace, 30 fps, after its preroll), so a staged hunt can be
// checked to stalk, charge and catch inside the clip before anything is rendered.
//   node tools/website-clip-lab.mjs <clip-id> [seconds]     (SEED=n tries another run seed: wildRng.setState)
// A clip's setup can return `watch: [agents]` to list more than its focus animal.
import { releaseGame } from './release-fixtures.mjs';
import { posing } from './website-moment-fixtures.mjs';
import { CLIPS } from './website-video-clips.mjs';
import { SPEEDS, ANIMAL_SPEEDS } from '../js/config.js';
import { momentsUpdate } from '../js/sim/moments.js';

globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const [id, secs] = process.argv.slice(2);
const clip = CLIPS.find(c => c.id === id);
if (!clip) throw Error('Clips: ' + CLIPS.map(c => c.id).join(' '));
const { game: g } = releaseGame(clip.map, 'forest'), wl = g.wildlife;
if (process.env.SEED) g.wildRng.setState(+process.env.SEED);
const kills = [];
const onPredation = g.onPredation.bind(g);
g.onPredation = (p, b) => { kills.push(`${g.catalog.animals[p.sp].key}#${p.id} took ${g.catalog.animals[b.sp].key}#${b.id}`); return onPredation(p, b); };
const shot = clip.setup(g, posing(g, []), wl);
wl.recount();
g.speed = clip.pace; wl.lifePace = SPEEDS[clip.pace] / ANIMAL_SPEEDS[clip.pace];
const watch = shot.watch || [shot.focus];
const describe = a => {
  if (!wl.agents.includes(a)) return `#${a.id} gone`;
  const h = a.hunt, prey = a.state === 'hunt' && wl.agents.find(o => o.id === a.target);
  return `${g.catalog.animals[a.sp].key}#${a.id} ${a.state}${h ? '/' + h.phase + (h.leap ? '+leap' : '') : ''}${a.carry ? '/carry:' + a.carry.phase : ''}${a.bird ? '/' + a.bird.kind : ''}` +
    ` (${a.x.toFixed(1)},${a.y.toFixed(1)}${a.alt ? ' alt ' + a.alt.toFixed(2) : ''})${prey ? ' d=' + Math.hypot(prey.x - a.x, prey.y - a.y).toFixed(1) : ''}`;
};
const seconds = +(secs || clip.seconds), dt = 1 / 30, pre = Math.round((clip.preroll || 0) * 30);
console.log(`${clip.id} (${clip.map})${clip.preroll ? `, from ${clip.preroll} s in` : ''}`);
for (let i = -pre; i <= seconds * 30; i++) {
  if (i !== -pre) {
    let days = dt * ANIMAL_SPEEDS[clip.pace];
    while (days > 0) { const d = Math.min(days, 0.05); wl.update(d); g.visitors.update(d); g.mapDefinition.update?.(g, d); days -= d; }
    momentsUpdate(g);
  }
  if (i >= 0 && i % 15 === 0) console.log(`${(i / 30).toFixed(1).padStart(5)}s  ${watch.map(describe).join(' | ')}${wl.carcasses.length ? `  [carcass meals ${wl.carcasses.map(c => c.meals).join(',')}]` : ''}${kills.length ? '  ' + kills.join('; ') : ''}`);
}
