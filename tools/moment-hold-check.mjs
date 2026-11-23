// Keystone moments wait after a time-lapse (ui/timelapse.js MOMENT_HOLD_MS, ui/ui.js canPlayMoment):
// none plays while it runs or during the hold after; a moment that fires meanwhile queues, then plays.
//   node tools/moment-hold-check.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const root = new URL('../js/', import.meta.url).href;
const { Game } = await import(root + 'game.js');
const { moment, momentsDaily, MOMENT_GAP, MOMENT_HOLD_MS } = await import(root + 'sim/moments.js');
assert.ok(MOMENT_HOLD_MS >= 60e3 && MOMENT_HOLD_MS <= 180e3, 'a minute or two');

const g = new Game(); g.newGame(1987, 'free', 'standard', 'pnw', 5);
// the same predicate ui.js installs, over a stand-in ui
const ui = { moment: null, modalOpen: false, photo: null, timelapse: { on: true }, momentHoldUntil: 0, momentEnded: undefined };
g.canPlayMoment = () => !ui.moment && !ui.modalOpen && !ui.photo && !ui.timelapse?.on && performance.now() >= (ui.momentHoldUntil ?? 0) && performance.now() - (ui.momentEnded ?? -1e9) >= 25000;
const played = []; g.on('moment', m => played.push(m.key));
const key = Object.keys(g.catalog.definition.moments || {})[0] || 'lionHunt';
moment(g, key, { x: 10, y: 10 });
assert.equal(played.length, 0, 'not during the time-lapse'); assert.equal(g.flags.momentQueue?.length, 1, 'queued, not dropped');
ui.timelapse.on = false; ui.momentHoldUntil = performance.now() + MOMENT_HOLD_MS; g.day += MOMENT_GAP + 1; momentsDaily(g);
assert.equal(played.length, 0, 'not during the hold');
ui.momentHoldUntil = performance.now() - 1; momentsDaily(g);
assert.deepEqual(played, [key], 'plays after the hold');
console.log('moment-hold-check ok');
