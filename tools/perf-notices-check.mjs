// js/ui/perf-notices.js: the two notices about the player's computer, each said once ever.
// - Software drawing (SwiftShader, llvmpipe, Microsoft Basic Render Driver): said 4 s after the farm
//   shows, with the steps for this browser, and a software_render_notice event; never for a real chip,
//   never while the farm is hidden, never twice.
// - On battery: under 20 fps on Fast for two minutes of play in a row, said once with battery_hint;
//   not when plugged in or unknown, not on Sharp, not paused, not for a shorter or broken spell.
// Driven with a fake clock, no browser needed.
import assert from 'node:assert/strict';
import { PerfNotices, softwareRenderer, browserKind, softwareText } from '../js/ui/perf-notices.js';

let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const EDGE = CHROME + ' Edg/131.0.0.0', FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; rv:133.0) Gecko/20100101 Firefox/133.0';
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
// (real names from PostHog perf_sample.gpu)
const BASIC = 'ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0)';
const SWIFT = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 16.0.0) (0x0000C0DE)), SwiftShader driver)';
const INTEL = 'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)';

function notices(opts = {}) {
  const said = [], events = [], state = { battery: true, shown: true, playing: true, ...opts.state };
  const settings = { quality: 'fast', softwareHintAt: 0, batteryHintAt: 0, ...opts.settings };
  let saves = 0;
  const n = new PerfNotices({
    settings, save: () => saves++, track: (e, p) => events.push({ e, ...p }), notify: (text, extra) => said.push({ text, ...extra }),
    gpu: opts.gpu ?? INTEL, ua: opts.ua ?? CHROME,
    onBattery: () => state.battery, shown: () => state.shown, playing: () => state.playing,
  });
  return { n, said, events, settings, state, saves: () => saves };
}
let clock = 0;
function run(t, seconds, frameMs) { for (const end = clock + seconds * 1000; clock < end; clock += frameMs) t.n.frame(clock); }

check('software renderer names are recognised, real chips are not', () => {
  for (const name of [BASIC, SWIFT, 'Google SwiftShader', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'ANGLE (Mesa, llvmpipe (LLVM 17.0.6 256 bits), OpenGL 4.5)'])
    assert.ok(softwareRenderer(name), name);
  for (const name of [INTEL, 'Apple GPU', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2)', 'Adreno (TM) 610', null, ''])
    assert.ok(!softwareRenderer(name), String(name));
});
check('each browser gets its own steps', () => {
  assert.deepEqual([CHROME, EDGE, FIREFOX, SAFARI].map(browserKind), ['chrome', 'edge', 'firefox', 'other']);
  assert.match(softwareText(CHROME), /Chrome: Settings, System/);
  assert.match(softwareText(EDGE), /Edge: Settings, System and performance/);
  assert.match(softwareText(FIREFOX), /hardware acceleration when available/);
  assert.match(softwareText(SAFARI), /browser's settings/);
});
check('software drawing: said once, 4 s after the farm shows, with an event', () => {
  const t = notices({ gpu: BASIC, ua: EDGE, state: { battery: false } });
  run(t, 3.5, 250);
  assert.equal(t.said.length, 0, 'not straight away');
  run(t, 1, 250);
  assert.equal(t.said.length, 1); assert.match(t.said[0].text, /without your graphics chip/); assert.match(t.said[0].text, /Edge/);
  assert.ok(t.settings.softwareHintAt > 0 && t.saves() === 1);
  assert.deepEqual(t.events, [{ e: 'software_render_notice', gpu: BASIC, browser: 'edge' }]);
  run(t, 60, 250);
  assert.equal(t.said.length, 1, 'once');
});
check('software drawing: not while the farm is hidden (loading, intro film), and never if said before', () => {
  const t = notices({ gpu: SWIFT, state: { shown: false } });
  run(t, 30, 250);
  assert.equal(t.said.length, 0);
  t.state.shown = true; run(t, 5, 250);
  assert.equal(t.said.length, 1);
  const before = notices({ gpu: SWIFT, settings: { softwareHintAt: 123 } });
  run(before, 30, 250);
  assert.equal(before.said.length, 0);
});
check('a real graphics chip gets no software notice', () => {
  const t = notices({ state: { battery: false } });
  run(t, 30, 33);
  assert.equal(t.said.length, 0);
});
check('on battery, Fast, under 20 fps for two minutes: one plain hint with an event, never again', () => {
  const t = notices();
  run(t, 115, 1000 / 12);
  assert.equal(t.said.length, 0, 'not before two minutes');
  run(t, 10, 1000 / 12);
  assert.equal(t.said.length, 1); assert.match(t.said[0].text, /on battery\. Plugging in will make it smoother/);
  assert.equal(t.events[0].e, 'battery_hint'); assert.ok(t.events[0].fps < 20);
  assert.ok(t.settings.batteryHintAt > 0);
  run(t, 300, 1000 / 12);
  assert.equal(t.said.length, 1, 'once');
});
check('battery hint: not when plugged in or unknown, not on Sharp, not while paused', () => {
  for (const state of [{ battery: false }, { battery: null }, { playing: false }]) {
    const t = notices({ state }); run(t, 200, 1000 / 12); assert.equal(t.said.length, 0, JSON.stringify(state));
  }
  const sharp = notices({ settings: { quality: 'high' } }); run(sharp, 200, 1000 / 12); assert.equal(sharp.said.length, 0);
});
check('battery hint: a smooth spell, plugging in or the tab hidden starts the two minutes over', () => {
  const t = notices();
  run(t, 100, 1000 / 12); run(t, 6, 1000 / 30); run(t, 100, 1000 / 12);
  assert.equal(t.said.length, 0, 'smooth spell');
  run(t, 30, 1000 / 12); // (now two minutes in a row)
  assert.equal(t.said.length, 1);
  const u = notices();
  run(u, 100, 1000 / 12); u.state.battery = false; run(u, 3, 1000 / 12); u.state.battery = true; run(u, 100, 1000 / 12);
  assert.equal(u.said.length, 0, 'plugged in for a moment');
  const h = notices();
  run(h, 100, 1000 / 12); clock += 20000; run(h, 100, 1000 / 12);
  assert.equal(h.said.length, 0, 'tab hidden');
});
check('battery hint: a slow 20+ fps laptop on battery is fine', () => {
  const t = notices(); run(t, 300, 1000 / 24); assert.equal(t.said.length, 0);
});

console.log(`perf-notices-check: ${checks} checks passed`);
