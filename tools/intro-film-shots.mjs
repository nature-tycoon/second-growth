// The intro film's script (tools/film-intro.mjs films it, tools/intro-film.mjs stages it): what
// is on screen when, and the sound under it. 40 seconds at 30 fps, PNW, seed 1987.
//
// The film is made of layers. Each layer is one camera on one of two farms, rendered as its own
// frames; the assembly lays them over each other with these fades. A later layer is drawn over an
// earlier one, faded in over [in, in + fade] (fade 0: a cut). Times are seconds of the film.
//
//   start game (the farm exactly as a first visit opens it, the fence and the bare field):
//     forest   eye level in the old forest north of the farm, morning; a black-tailed deer browses,
//              lifts its head
//     chase    the deer bolts; the cougar breaks from cover low behind it, weaving through trunks
//     falls    the top of the waterfall at the farm's north edge: the deer clears the fence and bounds
//              out over the field; the cougar stops at the last trees and watches
//     start    the first visit's own start view (Renderer.resetView), afternoon: the film's last frame
//   restored game (the same farm 30 years on: release-fixtures' restored PNW, fence and culvert gone):
//     rise     from the falls the eye climbs and turns to the start view's heading
//     overview the usual view over the restored farm, elk in the meadow, gliding to the start view
// The rewind is the overview dissolving into `start` at the same camera.
export const FPS = 30;
export const SECONDS = 40;
export const LAYERS = [
  { name: 'forest', game: 'start', from: 2.6, to: 12, fade: 1, fromBlack: true },
  { name: 'chase', game: 'start', from: 12, to: 22, fade: 0 },
  { name: 'falls', game: 'start', from: 22, to: 31, fade: 0 },
  { name: 'rise', game: 'restored', from: 30, to: 34, fade: 1 },
  { name: 'overview', game: 'restored', from: 33, to: 38.4, fade: 1 },
  { name: 'start', game: 'start', from: 37, to: SECONDS, fade: 1.4 },
];
// time of day through each layer (scene.js TOD: 0 dawn, .07 early morning sun, .45 the game's start)
export const TIME_OF_DAY = { forest: [.07, .075], chase: [.075, .08], falls: [.08, .085], rise: [.13, .14], overview: [.14, .16], start: [.45, .45] };
// the beats (seconds of the film)
export const BEATS = {
  headUp: 9.2,      // the deer lifts its head
  bolt: 12,         // it bolts
  breakCover: 12.35, // the cougar breaks from cover
  fence: null,      // when the deer clears the fence (set by the staging from its path)
};

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
