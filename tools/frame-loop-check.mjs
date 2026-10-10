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
console.log(`${checks} frame loop checks passed.`);
