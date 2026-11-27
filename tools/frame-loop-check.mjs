// Regression checks for a permanent frozen view after an exception.
import assert from 'node:assert/strict';
import { createFrameLoop } from '../js/frame-loop.js';
let checks = 0;
function check(name, test) { test(); checks++; console.log(`PASS ${name}`); }
function loop(steps, onError = () => {}, fps = 60) {
  const queue = [];
  const frame = createFrameLoop({ steps, onError, targetFps: () => fps, now: 0, requestFrame: f => queue.push(f) });
  return { frame, queue, next(time) { assert.equal(queue.length, 1); queue.shift()(time); } };
}
check('A simulation exception leaves input, rendering and controls working on this and later frames', () => {
  let paused = false, frames = 0, inputs = 0, controls = 0, reports = 0;
  const l = loop([
    ['simulation', () => { if (!paused) throw new Error('failed daily tick'); }],
    ['input', () => inputs++], ['render', () => frames++], ['interface', () => controls++],
  ], (error, stage) => { assert.equal(error.message, 'failed daily tick'); assert.equal(stage, 'simulation'); paused = true; reports++; });
  l.frame(20); l.next(40); l.next(60);
  assert.deepEqual([frames, inputs, controls, reports], [3, 3, 3, 1]);
});
check('A one-off drawing error recovers on the next frame and does not freeze the interface', () => {
  let fail = true, frames = 0, controls = 0, errors = 0;
  const l = loop([['render', () => { if (fail) { fail = false; throw new Error('bad pose'); } frames++; }], ['interface', () => controls++]], (_, stage) => { assert.equal(stage, 'render'); errors++; });
  l.frame(20); l.next(40); l.next(60);
  assert.deepEqual([frames, controls, errors], [2, 3, 1]);
});
check('Persistent render failures still leave controls and future refreshes alive', () => {
  let controls = 0;
  const l = loop([['render', () => { throw new Error('persistent failure'); }], ['interface', () => controls++]]);
  l.frame(20); for (let n = 2; n <= 30; n++) l.next(n * 20);
  assert.equal(controls, 30); assert.equal(l.queue.length, 1);
});
check('Even a failed error reporter cannot permanently stop scheduling frames', () => {
  let fail = true, draws = 0;
  const l = loop([['render', () => { if (fail) throw new Error('draw'); draws++; }]], () => { throw new Error('report'); });
  assert.throws(() => l.frame(20), /report/); fail = false; l.next(40); assert.equal(draws, 1);
});
check('FPS throttling schedules exactly one refresh and background returns clamp elapsed time', () => {
  const times = [], l = loop([['render', dt => times.push(dt)]], undefined, 30);
  l.frame(10); assert.equal(times.length, 0); l.next(34); l.next(60000);
  assert.deepEqual(times, [.034, .1]); assert.equal(l.queue.length, 1);
});
// Pacing by the screen's refresh (performance-review-2026-11-26.md): 3 seconds of browser calls at
// `hz`, with an optional extra delay after each drawn frame (a long frame makes the next call late).
function rate(hz, fps, work = 0) {
  // counts drawn frames by their dt (each drawn frame passes its interval to the render step)
  const queue = [], gaps = [];
  let lastDraw = null;
  const frame = createFrameLoop({ steps: [['render', () => { gaps.push(now - (lastDraw ?? now)); lastDraw = now; }]], onError() {}, targetFps: () => fps, now: 0, requestFrame: f => queue.push(f) });
  const period = 1000 / hz;
  let now = period, k = 1;
  frame(now);
  for (;;) {
    // a drawn frame that took `work` ms makes the browser skip the refreshes it overran
    const drew = gaps.length && lastDraw === now;
    k += drew && work > 0 ? Math.max(1, Math.ceil(work / period)) : 1;
    now = k * period;
    if (now > 4000) break;
    queue.shift()(now);
  }
  const late = gaps.filter((_, i) => i > 0).slice(-120); // (after the refresh is learned)
  return { fps: 1000 / (late.reduce((a, b) => a + b, 0) / late.length), frame };
}
check('Pacing: 60 Hz draws 60 for a cap of 60 and 30 for 30', () => {
  assert.equal(Math.round(rate(60, 60).fps), 60); assert.equal(Math.round(rate(60, 30).fps), 30);
});
check('Pacing: a 75 Hz screen draws 75 for a cap of 60 (was 37.5) and 37.5 for 30 (was 25)', () => {
  assert.equal(Math.round(rate(75, 60).fps), 75); assert.equal(rate(75, 30).fps.toFixed(1), '37.5');
});
check('Pacing: other screens stay within 1.3x the cap and never far below it', () => {
  assert.equal(Math.round(rate(100, 30).fps), 33); assert.equal(Math.round(rate(100, 60).fps), 50, '100 Hz at 60: as before, not 100');
  assert.equal(Math.round(rate(120, 60).fps), 60); assert.equal(Math.round(rate(120, 30).fps), 30);
  assert.equal(Math.round(rate(144, 60).fps), 72); assert.equal(Math.round(rate(144, 30).fps), 36);
  assert.equal(Math.round(rate(90, 30).fps), 30); assert.equal(Math.round(rate(90, 60).fps), 45, '90 Hz at 60: as before, not 90');
  assert.equal(Math.round(rate(165, 30).fps), 33); assert.equal(Math.round(rate(165, 60).fps), 55);
});
check('Pacing: the screen\'s refresh is measured and reported', () => {
  const p = rate(75, 30).frame.pace();
  assert.equal(p.refreshHz, 75); assert.equal(p.every, 2); assert.equal(Math.round(p.intervalMs), 27);
});
check('Pacing: long frames on a 60 Hz screen held to 30 never draw faster than the cap, and keep drawing', () => {
  // 20 ms of work overruns one refresh, so every call comes 33 ms apart and the estimate drifts long
  const slow = rate(60, 30, 20);
  assert.ok(slow.fps <= 30.5 && slow.fps >= 29.5, `held to 30: ${slow.fps}`);
  const heavy = rate(60, 30, 45); // (over 33 ms: 20 fps, every call drawn)
  assert.equal(Math.round(heavy.fps), 20);
});
check('Pacing: a machine overrunning every refresh reports no refresh rather than its own frame rate as one', () => {
  // (60 Hz, cap 60, 20 ms frames: every gap is a drawn 33 ms frame, so the estimate is 33)
  const p = rate(60, 60, 20).frame.pace();
  assert.equal(p.refreshHz, null); assert.equal(Math.round(p.capMs), 17);
  assert.equal(rate(60, 30).frame.pace().refreshHz, 60, 'a 60 Hz screen held to 30 is still known');
});
check('Pacing: before the refresh is known the old rule holds (draw once the cap\'s interval less 3 ms has passed)', () => {
  const times = [], l = loop([['render', dt => times.push(dt)]], undefined, 30);
  l.frame(16); l.next(29); l.next(31);
  assert.deepEqual(times, [.031]);
});
console.log(`${checks} frame loop checks passed.`);
