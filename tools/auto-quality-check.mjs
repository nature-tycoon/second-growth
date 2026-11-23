// Renderer.autoQuality, the game's own Detail steps (docs/ideas/2026-11-22-creeks-fps/fps-plan.md):
// a frame rate held to 30 steps up when the frame's work leaves half the frame free, never without
// a GPU timer or with heavy work; 1x screens go Fast -> Sharp, 2x screens Fast -> Balanced; a step up
// that proves too much is undone and not tried again for a day; a slow computer drops to Fast.
// Driven on a stub with a fake clock, so no WebGL is needed.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const { Renderer } = await import('../js/render3d/scene.js');

let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }

let clock = 0;
performance.now = () => clock;

function renderer({ quality = 'fast', cap = 30, gpuTimer = true, dpr = 1 } = {}) {
  globalThis.window = { devicePixelRatio: dpr };
  const r = Object.create(Renderer.prototype);
  Object.assign(r, {
    quality, qualityChosen: false, resScale: 1, shadowsDropped: false, qualityAt: 0, upFailedAt: 0,
    frameCap: () => ({ target_fps: cap }),
    gpuTimer: { ext: gpuTimer ? {} : null, recent: [] },
    moves: [],
  });
  r.onQuality = (to, fps, reason, measured) => { r.moves.push({ from: r.quality, to, fps, reason, ...measured }); r.quality = to; };
  return r;
}
// plays `seconds` of frames `frameMs` apart, each with `work` ms of processor work and (every 15th
// frame, as GpuTimer samples) `gpu` ms of GPU time
function play(r, seconds, { frameMs = 1000 / 30, work = 6, gpu = 6 } = {}) {
  const game = { speed: 1 };
  for (let t = 0, n = 0; t < seconds * 1000; t += frameMs, n++) {
    clock += frameMs;
    r.autoQuality(game);
    r.qWork?.push(work);
    if (n % 15 === 0) r.gpuTimer.recent.push(gpu);
  }
}

check('held to 30 with light work on a 1x screen: Fast steps straight up to Sharp', () => {
  const r = renderer();
  play(r, 90, { work: 8, gpu: 9 });
  assert.equal(r.moves.length, 1);
  assert.deepEqual([r.moves[0].from, r.moves[0].to, r.moves[0].reason, r.moves[0].capped], ['fast', 'high', 'room', true]);
  assert.ok(r.moves[0].work_ms <= 16 && r.moves[0].gpu_ms <= 16);
});
check('held to 30 on a 2x screen: Fast steps up to Balanced first', () => {
  const r = renderer({ dpr: 2 });
  play(r, 90, { work: 8, gpu: 9 });
  assert.deepEqual(r.moves.map(m => m.to), ['balanced']);
});
check('held to 30 without a GPU timer (Safari): stays put', () => {
  const r = renderer({ gpuTimer: false });
  play(r, 180, { work: 5, gpu: 5 });
  assert.equal(r.moves.length, 0);
});
check('held to 30 with heavy work: stays put', () => {
  const r = renderer();
  play(r, 180, { work: 20, gpu: 9 });
  play(r, 180, { work: 8, gpu: 20 });
  assert.equal(r.moves.length, 0);
});
check('not held to 30 and running at 30: stays put (the 50 fps rule)', () => {
  const r = renderer({ cap: 60 });
  play(r, 180, { work: 8, gpu: 9 });
  assert.equal(r.moves.length, 0);
});
check('free to run 60 and holding it: steps up as before', () => {
  const r = renderer({ cap: 60 });
  play(r, 90, { frameMs: 1000 / 60, work: 5, gpu: 5 });
  assert.deepEqual(r.moves.map(m => [m.to, m.reason]), [['high', 'room']]);
});
check('a step up that proves too much is undone, and not tried again for a day', () => {
  const r = renderer();
  play(r, 90, { work: 8, gpu: 9 });
  assert.equal(r.quality, 'high');
  play(r, 30, { frameMs: 1000 / 15, work: 40, gpu: 40 });
  assert.deepEqual(r.moves.map(m => [m.to, m.reason]), [['high', 'room'], ['fast', 'undo']]);
  r.upFailedAt = Date.now(); // (as ui.js records it)
  play(r, 300, { work: 8, gpu: 9 });
  assert.equal(r.moves.length, 2);
});
check('a slow computer on Sharp drops to Fast', () => {
  const r = renderer({ quality: 'high', cap: 60 });
  play(r, 40, { frameMs: 1000 / 15, work: 40, gpu: 40 });
  assert.deepEqual(r.moves.map(m => [m.to, m.reason]), [['fast', 'slow']]);
});
check('a Detail level the player chose is never changed', () => {
  const r = renderer();
  r.qualityChosen = true;
  play(r, 120, { work: 8, gpu: 9 });
  assert.equal(r.moves.length, 0);
});
// (item 6: a player who chose Sharp or Balanced and runs under 20 for a minute is told once that Fast is smoother)
function chosen(quality, opts) {
  const r = renderer({ quality, cap: 60, ...opts });
  r.qualityChosen = true; r.hints = [];
  r.onSlowChosen = (fps, measured) => r.hints.push({ fps, ...measured });
  return r;
}
const slow = { frameMs: 1000 / 15, work: 40, gpu: 40 };
check('chose Sharp and runs under 20 for a minute: one hint, Detail unchanged, never again', () => {
  const r = chosen('high');
  play(r, 80, slow);
  assert.equal(r.hints.length, 1); assert.equal(r.moves.length, 0); assert.equal(r.quality, 'high');
  assert.ok(r.hints[0].fps < 20 && r.hints[0].work_ms >= 16);
  play(r, 300, slow);
  assert.equal(r.hints.length, 1, 'said once');
});
check('chose Sharp, under 20 for less than a minute, or broken by a smooth spell: no hint', () => {
  const r = chosen('high');
  play(r, 60, slow);
  play(r, 6, { frameMs: 1000 / 40 });
  play(r, 50, slow);
  assert.equal(r.hints.length, 0);
});
check('chose Sharp, slow for 50 s, then switches to Balanced: Balanced gets its own minute', () => {
  const r = chosen('high');
  play(r, 58, slow);
  r.chosenSlow = 0; r.quality = 'balanced'; // (as applySettings does for a new level)
  play(r, 15, slow);
  assert.equal(r.hints.length, 0);
});
check('chose Fast, or already told in an earlier session: no hint', () => {
  const fast = chosen('fast'); play(fast, 120, slow); assert.equal(fast.hints.length, 0);
  const told = chosen('high'); told.slowHinted = true; play(told, 120, slow); assert.equal(told.hints.length, 0);
});

console.log(`auto-quality-check: ${checks} checks passed`);
