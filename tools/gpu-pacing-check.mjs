// The 3D draw's pacing on the graphics chip (js/render3d/gpu-pacing.js, decision 0059): at most two
// frames queued, one after a press, fences that never finish (DEAD_MS)
// turn pacing off rather than holding the game to a few frames a second, and no fences means no pacing.
import assert from 'node:assert/strict';
import { GpuPacing, DEAD_MS } from '../js/render3d/gpu-pacing.js';

function fakeGl({ never = false } = {}) {
  const gl = { SIGNALED: 1, SYNC_STATUS: 2, SYNC_GPU_COMMANDS_COMPLETE: 3, live: new Set(), made: 0 };
  gl.fenceSync = () => { const s = { done: false }; gl.live.add(s); gl.made++; return s; };
  gl.getSyncParameter = s => (!never && s.done ? gl.SIGNALED : 0);
  gl.deleteSync = s => gl.live.delete(s);
  gl.finishAll = () => { for (const s of gl.live) s.done = true; };
  return gl;
}
let t = 0;
const clock = () => t;
{
  const gl = fakeGl(), P = new GpuPacing(gl, clock);
  assert.equal(P.behind(), false);
  P.fence(); assert.equal(P.behind(), false, 'one queued: draw');
  assert.equal(P.behind(1), true, 'after a press, one queued is too many');
  P.fence(); assert.equal(P.behind(), true, 'two queued: wait');
  gl.finishAll(); assert.equal(P.behind(1), false, 'all done: draw'); assert.equal(gl.live.size, 0, 'finished fences are freed');
  P.fence(); P.fence(); t += 1500;
  assert.equal(P.behind(), true, 'a slow chip is waited for'); assert.equal(P.off, false, 'a slow fence is not a broken browser');
  t += DEAD_MS; assert.equal(P.behind(), false, 'a fence never done lets go'); assert.equal(P.off, true, 'and pacing is off');
}
{
  // a very slow chip (3 fps: every frame over MAX_WAIT_MS) keeps its pacing, since its fences do finish
  t = 0; const gl = fakeGl(), P = new GpuPacing(gl, clock);
  for (let f = 0; f < 60; f++) { t += 330; if (!P.behind()) P.fence(); if (f % 2) gl.finishAll(); }
  assert.equal(P.off, false, 'slow but working fences keep pacing on');
  P.fence(); P.fence(); assert.equal(P.behind(1), true, 'and a press still waits for the queue');
}
{
  // fences that never say done: pacing turns itself off, and the game draws every frame from then on
  t = 0; const gl = fakeGl({ never: true }), P = new GpuPacing(gl, clock);
  for (let f = 0; f * 16 <= DEAD_MS + 100; f++) { t += 16; if (!P.behind()) P.fence(); }
  assert.equal(P.off, true, 'off after DEAD_MS');
  let draws = 0;
  for (let f = 0; f < 100; f++) { t += 16; if (!P.behind()) { draws++; P.fence(); } }
  assert.equal(draws, 100, 'and every frame draws from then on');
  assert.equal(gl.live.size, 0);
}
{
  const P = new GpuPacing({}, clock); P.fence();
  assert.equal(P.behind(1), false, 'WebGL1, no fences: never behind');
}
{
  // a chip that finishes each frame within the next: two in flight never holds a draw back
  t = 0; const gl = fakeGl(), P = new GpuPacing(gl, clock); let draws = 0;
  for (let f = 0; f < 100; f++) { t += 16; if (!P.behind()) { draws++; P.fence(); } gl.finishAll(); }
  assert.equal(draws, 100);
}
console.log('gpu-pacing-check passed');
