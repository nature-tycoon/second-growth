// Stranded air-breathing fish wriggle to the next water (decision 0034, js/sim/fish-wriggle.js):
// node tools/fish-wriggle-check.mjs (headless, about 20 s)
// - A snakehead (breathesAir) put in a one-tile marsh puddle on fresh Sumatra (104,68: the puddle
//   nine of them piled up in for good on seed 37, 2026-11-25) wriggles over the wet peat to the pond
//   beside it: every step on wet ground or in water it can swim, no step longer than its pace
//   allows (no jump back into the water), and it ends in water deep enough for it with the
//   crossing over.
// - A two-tile puddle three tiles of peat from a pond: with the peat made dry pasture it stays in its
//   puddle; left wet, it sets off.
// - It sets off at night or in the rain by the drawn sun (game.todU), never on a dry midday.
// - A mahseer (no breathesAir) in the same puddle never leaves it over the ground.
// - A fish without the trait, shallower than it needs with no deep water in reach (a.noDeep), dies
//   off as the pool dries (strandedDies); an air-breather in the same water doesn't.
import assert from 'node:assert/strict';
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { fishDepth, swimDepth } from '../js/sim/waterline.js';
import { runDepth, forgetSwimRoutes } from '../js/sim/swim-routes.js';
import { wetGround, strandedDies } from '../js/sim/fish-wriggle.js';
import { T } from '../js/config.js';
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
const PX = 104, PY = 68;

function puddle(key, at = [PX, PY], dry) {
  Math.random = mulberry32(1987);
  const g = restoredGame('sumatra', 1987), wl = g.wildlife, w = g.world, cat = g.catalog;
  const a = wl.agents.find(o => o.key === key) || wl.spawn(Object.values(cat.animals).find(d => d.key === key), at[0], at[1]);
  wl.agents = [a]; wl.ids = new Map([[a.id, a]]); // (just this fish: nothing hunting it, nobody in the way)
  const def = cat.animals[a.sp];
  if (dry) for (const [x0, x1, y0, y1] of dry) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = w.idx(x, y);
    if (swimDepth(w, x + 0.5, y + 0.5) < fishDepth(def)) { w.terrain[i] = T.PASTURE; w.moist[i] = 0.2; }
  }
  forgetSwimRoutes(w);
  Object.assign(a, { x: at[0] + 0.5, y: at[1] + 0.5, state: 'idle', path: null, wait: 0, wriggle: null, noWriggle: null, restSpot: null, moveProgress: null, dormancy: null });
  return { g, wl, w, a, def };
}

check('a snakehead stranded in a one-tile puddle wriggles over wet ground to the pond', () => {
  const { wl, w, a, def } = puddle('snakehead');
  const need = fishDepth(def);
  assert.ok(runDepth(w, a.x, a.y) >= need, 'the fixture puddle holds water for it (map changed?)');
  let crossed = false, maxStep = 0, t = 0;
  for (; t < 30; t += 0.05) {
    const x = a.x, y = a.y;
    wl.update(0.05);
    maxStep = Math.max(maxStep, Math.hypot(a.x - x, a.y - y));
    if (a.wriggle) crossed = true;
    assert.ok(runDepth(w, a.x, a.y) >= need || wetGround(w, a.x, a.y), `it stepped onto dry land at ${a.x.toFixed(2)},${a.y.toFixed(2)}`);
    if (crossed && !a.wriggle && runDepth(w, a.x, a.y) >= need) break;
  }
  assert.ok(crossed, 'it never set off over the ground');
  assert.ok(t < 30, `it never reached water: at ${a.x.toFixed(2)},${a.y.toFixed(2)}, wriggle ${JSON.stringify(a.wriggle)}`);
  assert.ok(Math.hypot(a.x - PX - 0.5, a.y - PY - 0.5) > 0.7, 'it ended back in its own puddle');
  assert.ok(maxStep < def.speed * 0.05 * 1.8 + 0.02, `a step of ${maxStep.toFixed(3)} tiles: a jump, not a wriggle`);
  console.log(`  reached the water in ${t.toFixed(2)} days, longest step ${maxStep.toFixed(3)}`);
});

// (a two-tile puddle, 92,72-73, three tiles of peat marsh from a pond, 95,72: dry pasture between)
check('with dry land between it and the pond it stays in its puddle', () => {
  const at = [92, 72], { wl, w, a, def } = puddle('snakehead', at, [[93, 94, 68, 77], [88, 91, 68, 77], [92, 92, 68, 71], [92, 92, 74, 77]]);
  for (let t = 0; t < 10; t += 0.05) {
    wl.update(0.05);
    assert.ok(!a.wriggle, `it set off over dry land for ${a.wriggle && [a.wriggle.to % w.w, a.wriggle.to / w.w | 0]}`);
    assert.ok(runDepth(w, a.x, a.y) >= fishDepth(def) || wetGround(w, a.x, a.y), 'it left the water');
  }
  assert.ok(Math.abs(a.x - 92.5) < 0.6 && a.y > 71.9 && a.y < 74.1, `it left its puddle: ${a.x.toFixed(2)},${a.y.toFixed(2)}`);
});

check('and with the peat left wet, the same puddle it wriggles out of', () => {
  const { wl, a } = puddle('snakehead', [92, 72]);
  let crossed = false;
  for (let t = 0; t < 10 && !crossed; t += 0.05) { wl.update(0.05); crossed = !!a.wriggle; }
  assert.ok(crossed, 'it never set off: the dry case above proves nothing');
});

check('by the drawn sun it sets off at night or in rain, not on a dry midday', () => {
  const started = (todU, weather) => {
    const { g, wl, a } = puddle('snakehead');
    g.todU = todU; g.weather = weather;
    for (let t = 0; t < 3; t += 0.05) { wl.update(0.05); if (a.wriggle) return true; }
    return false;
  };
  assert.equal(started(0.42, 'clear'), false, 'it set off at noon in dry weather');
  assert.equal(started(0.42, 'rain'), true, 'it stayed put at noon in the rain');
  assert.equal(started(0.9, 'clear'), true, 'it stayed put at night');
});

check('a fish that does not breathe air never crosses the ground', () => {
  const { wl, a } = puddle('mahseer');
  for (let t = 0; t < 10; t += 0.05) { wl.update(0.05); assert.ok(!a.wriggle, 'a mahseer set off over the ground'); }
});

check('stranded in water too shallow with none deep in reach, a fish without the trait dies off', () => {
  const { g, wl, w } = puddle('mahseer');
  const cat = g.catalog, fish = ['mahseer', 'snakehead'].map(k => Object.values(cat.animals).find(d => d.key === k));
  // a spot with a little water, shallower than either needs
  let spot = null;
  for (let i = 0; i < w.n && !spot; i++) {
    const x = i % w.w + 0.5, y = (i / w.w | 0) + 0.5, d = runDepth(w, x, y);
    if (d > 0.02 && d < Math.min(...fish.map(fishDepth))) spot = [x, y];
  }
  assert.ok(spot, 'no shallow water on the map (map changed?)');
  const died = fish.map(def => {
    const a = { move: 'swim', x: spot[0], y: spot[1], noDeep: g.day, leaving: false };
    let n = 0;
    for (let k = 0; k < 200; k++) if (strandedDies(wl, a, def)) n++;
    return n;
  });
  assert.ok(died[0] > 20 && died[0] < 90, `a mahseer died on ${died[0]} of 200 days`);
  assert.equal(died[1], 0, 'a snakehead died with water still round it');
  const fresh = { move: 'swim', x: spot[0], y: spot[1], noDeep: g.day - 5, leaving: false };
  assert.ok(!Array.from({ length: 50 }).some(() => strandedDies(wl, fresh, fish[0])), 'a fish died with deep water within reach today');
});

console.log(`fish-wriggle-check: ${checks} checks passed`);
