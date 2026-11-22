// The intro film's script (tools/film-intro.mjs films it, tools/intro-film.mjs stages it), derived
// from the approved shot list, tools/intro-film-plan.mjs (F2; docs/ideas/2026-11-21-first-minutes/
// film-shots.md), so the map, the checks and the film are one thing. PNW, seed 1987, 30 fps.
//
// The film is made of layers: one per shot (shot 10 has two: the rise on the restored farm, then the
// map view). Each layer is one camera on one of two farms, rendered as its own frames; the assembly
// lays them over each other. A later layer is drawn over an earlier one, faded in over [from, from +
// fade] (fade 0: a cut). Times are seconds of the film.
//   start game: the farm exactly as a first visit opens it (the fence, the bare field)
//   restored game: the same farm 30 years on (release-fixtures' restored PNW, fence and culvert gone)
import { FPS, SECONDS, SHOTS, ANIMALS, SLOWMO, filmAt } from './intro-film-plan.mjs';
export { FPS, SECONDS, SLOWMO };

export const LAYERS = [];
SHOTS.forEach((s, i) => {
  if (!s.camera) return;
  const c = s.camera, next = SHOTS[i + 1];
  const nextIn = next ? next.from + (next.fadeIn || 0) : SECONDS; // (a layer runs on until the next has faded in)
  // (a sweep frames the farm, not an animal: its animals are cast and checked, none is its key subject)
  const swept = !!(c.sweep || c.of != null && SHOTS.find(x => x.n === c.of)?.camera.sweep);
  const base = { game: s.farm, shot: s.n, title: s.title, subjects: swept ? [] : s.subjects || [] };
  if (c.rise) LAYERS.push({ ...base, subjects: [], name: c.rise.layer, from: s.from, to: c.rise.until, fade: s.fadeIn || 0, cameraOf: c.rise.of }); // (the rise frames the farm, not the elk)
  const from = c.glide?.from ?? s.from;
  const of = c.of != null ? SHOTS.find(x => x.n === c.of) : null;
  // (sweep: the camera's speed is judged against its distance from what it looks at: intro-film-motion.mjs)
  LAYERS.push({ ...base, name: s.layer, from, to: +Math.min(SECONDS, Math.max(s.to, nextIn)).toFixed(3), fade: c.glide ? c.glide.fade : s.fadeIn || 0, fromBlack: s.n === 1,
    ...(of ? { cameraOf: of.n } : {}), sweep: !!(c.sweep || of?.camera.sweep) });
});
// time of day through each layer (scene.js TOD: 0 dawn, .07 early morning sun, .45 the game's start):
// today's farm in the morning haze (the "mist", f2.md 4), 30 years on a little later, the last shot
// the game's own afternoon
const tod = (L, t) => L.name === 'start' ? .45 : L.game === 'restored' ? .13 + .03 * t / SECONDS : .07 + .015 * t / 30;
export const TIME_OF_DAY = Object.fromEntries(LAYERS.map(L => [L.name, [tod(L, L.from), tod(L, L.to)]]));
// the beats (seconds of the film), from the animals' marks
const markOf = (name, pose) => ANIMALS[name].marks.find(m => m[3] === pose)?.[0];
export const BEATS = {
  headUp: filmAt(markOf('doe', 'alert')),     // the doe lifts her head
  bolt: filmAt(markOf('doe', 'run')),         // she springs away
  breakCover: filmAt(markOf('cougar', 'rush')), // the cougar rushes
  pounce: filmAt(markOf('cougar', 'pounce')),  // its leap (slow motion)
  fence: filmAt(markOf('doe', 'leap')),       // she clears the fence
};

// For the motion check (tools/intro-film-motion.mjs): each layer's subjects, the animals whose head
// and body must be in sight (the first is the key one), the predator whose entrance is checked (shown
// before it attacks, never popping up mid-shot, never ahead of its prey), and the slow motion,
// [from, to, rate] in film seconds, which scales measured speeds back up. Jumps are declared by the
// plan (pose leap or pounce: a.hunt.leap) and allowed off the ground.
export const SUBJECTS = Object.fromEntries(LAYERS.filter(L => L.subjects.length).map(L => [L.name, L.subjects]));
export const PREDATOR = { name: 'cougar', prey: 'doe', attacks: BEATS.breakCover };

// The sound: real recordings from assets/sounds (decision 0002; credits in their provenance,
// field-sources.json), placed and faded on the film's clock. No raven in the library yet: a
// Steller's jay calls instead (s8.md). gain is linear; ramps are [time, gain] points.
export const SOUND = [
  { file: 'field-bed-stream-1', at: 0, loop: true, ramp: [[0, 0], [1.2, .55], [3, .42], [6, .2], [12, .2], [20, .28], [22, .7], [30, .6], [33, .32], [37, .3], [40, .3]] },
  { file: 'field-bed-wind-1', at: 0, loop: true, ramp: [[0, 0], [2, .32], [12, .3], [14, .45], [22, .3], [31, .42], [36, .3], [40, .26]] },
  { file: 'field-stellers-jay-1', at: 1.1, gain: .5 },
  { file: 'field-pacific-wren-1', at: 4.2, gain: .32 },
  { file: 'field-swainsons-thrush-1', at: 7.4, gain: .28 },
  { file: 'field-meadowlark-1', at: 31.5, gain: .3 },
  { file: 'field-swainsons-thrush-2', at: 34.0, gain: .24 },
  { file: 'field-robin-1', at: 38.3, gain: .22 },
];
