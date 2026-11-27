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
    ...(of ? { cameraOf: of.n } : {}), sweep: !!(c.sweep || of?.camera.sweep), frameHead: !!c.frameHead });
});
// time of day through each layer (scene.js TOD: 0 dawn, .07 early morning sun, .45 the game's start):
// today's farm in the morning haze (the "mist", f2.md 4), 30 years on a little later, the last shot
// the game's own afternoon
const tod = (L, t) => L.name === 'start' ? .45 : L.game === 'restored' ? .13 + .03 * t / SECONDS : .07 + .015 * t / 30;
export const TIME_OF_DAY = Object.fromEntries(LAYERS.map(L => [L.name, [tod(L, L.from), tod(L, L.to)]]));
// the beats (seconds of the film), from the animals' marks
const markOf = (name, pose) => ANIMALS[name].marks.find(m => m[3] === pose)?.[0];
export const BEATS = {
  headUp: filmAt(markOf('buck', 'alert')),     // the buck lifts his head
  bolt: filmAt(markOf('buck', 'run')),         // he springs away
  breakCover: filmAt(markOf('cougar', 'rush')), // the cougar rushes
  pounce: filmAt(markOf('cougar', 'pounce')),  // its leap (slow motion)
  fence: filmAt(markOf('buck', 'leap')),       // he clears the fence
};

// For the motion check (tools/intro-film-motion.mjs): each layer's subjects, the animals whose head
// and body must be in sight (the first is the key one), the predator whose entrance is checked (shown
// before it attacks, never popping up mid-shot, never ahead of its prey), and the slow motion,
// [from, to, rate] in film seconds, which scales measured speeds back up. Jumps are declared by the
// plan (pose leap or pounce: a.hunt.leap) and allowed off the ground.
export const SUBJECTS = Object.fromEntries(LAYERS.filter(L => L.subjects.length).map(L => [L.name, L.subjects]));
export const PREDATOR = { name: 'cougar', prey: 'buck', attacks: BEATS.breakCover };

// The sound: real recordings from assets/sounds (decision 0002; credits in their provenance,
// field-sources.json), placed and faded on the film's clock (31.3 s; F3 retimed it to the restaged cut, and everything after 11.3 s moved 0.5 s earlier when the stalk was shortened, 2026-11-23). No raven in the library yet: a
// Steller's jay calls instead (s8.md). gain is linear; ramps are [time, gain] points.
export const SOUND = [
  // the creek under it all: up out of the black, low in the forest, swelling at the falls, fading as the eye climbs
  { file: 'field-bed-stream-1', at: 0, loop: true, ramp: [[0, 0], [1, .5], [2.6, .42], [4.8, .22], [11.3, .18], [12.8, .26], [14.65, .3], [17.9, .55], [19, .7], [22.7, .62], [25.5, .35], [31.3, .3]] },
  // wind in the firs; it carries the shots where the forest goes quiet (the cougar's eyes, the stalk)
  { file: 'field-bed-wind-1', at: 0, loop: true, ramp: [[0, 0], [1.6, .32], [7.8, .3], [8.5, .42], [12.8, .36], [14.65, .3], [22.7, .32], [25.5, .42], [31.3, .28]] },
  { file: 'field-raven-1', at: .1, gain: .35 },           // far off in the black: a common raven (NPS, Yellowstone)
  { file: 'field-pacific-wren-1', at: 2.6, gain: .3 },    // the opening and his ears; done before the cougar's eyes (7.8 s), when the forest goes quiet
  // (the clips are levelled to about -23 dB; their gains set each within 3 dB of the creek and waterfall
  // under it, the far hooves within 8: at a third of that they were lost in the water, measured on the mix)
  { file: 'field-twig-snap-1', at: 12.65, gain: .6 },    // under the cougar's paw as it creeps on: the snap lands at the cut, half a second before his head comes up
  { file: 'field-hooves-1', at: 14.2, gain: .7 },        // his spring and gallop toward us (muffled by the slow motion's hush)
  { file: 'field-hooves-2', at: 19.5, gain: .5 },          // landing past the fence and bounding away down the far bank, 70 m off
  { file: 'field-american-crow-1', at: 21.4, gain: 1 },  // while the cougar watches
  { file: 'field-meadowlark-1', at: 25.5, gain: .3 },       // 30 years on, the meadow
  { file: 'field-swainsons-thrush-2', at: 27.1, gain: .2 },
  { file: 'field-robin-1', at: 29.5, gain: .22 },           // today, the farm the game opens on
];
// In the slow motion the sound drops to a low hush (Cole, f2.md 6): low-passed and quieter, not silent.
export const HUSH = { cutoff: 380, gain: .55, ease: .2 };
