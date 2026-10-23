// node tools/activity-check.mjs
// Hunters' needs compete for their time (decision 0014): a fed predator lies up, a fed red-tail
// soars, hunger counts from the end of a meal, prey bolts from a rush rather than from a hunter
// merely in view, a fleeing animal speeds up and then tires, and game trails last a season.
import assert from 'node:assert/strict';
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { passable, canLand } from '../js/sim/animal-terrain.js';
import { prowl, watch, fleeUpdate, bolt } from '../js/sim/animal-life.js';
import { huntHunger } from '../js/data/animal-activity.js';
import { TRAIL_FADE } from '../js/sim/animal-trails.js';

let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function scene(map, seed = 7) {
  Math.random = mulberry32(seed);
  const g = restoredGame(map, seed), wl = g.wildlife, w = g.world;
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability();
  const habitat = d => { const s = wl.suit[d.index], out = []; for (let j = 0; j < w.n; j++) if (s[j] > 0.3 && passable(w, j, d) && canLand(w, j, d) && !w.fire[j]) out.push(j); return out; };
  const put = (d, j) => { const a = wl.spawn(d, j % w.w, j / w.w | 0, { silent: true }); a.wait = Math.random(); a.thirst = 0; return a; };
  const step = (n, each) => { for (let k = 0; k < n; k++) { if (k % 20 === 0) { g.day++; wl.daily(); } wl.update(0.05); each?.(k); } };
  return { g, wl, w, habitat, put, step };
}

check('a fed big cat lies up, and a hungry one hunts prey in reach', () => {
  const { g, wl, habitat, put } = scene('serengeti'), lion = g.catalog.animal.lion, gnu = g.catalog.animal.wildebeest;
  const j = habitat(lion)[0], a = put(lion, j);
  let lay = 0;
  for (let k = 0; k < 200; k++) { a.state = 'idle'; a.hunger = Math.random() * lion.behavior.activity.digest; a.wait = 0; if (prowl(wl, a, lion) && a.state === 'idle' && a.wait >= 1.5) lay++; }
  assert.equal(lay, 200, 'just after a meal it always lies up');
  let rest = 0;
  for (let k = 0; k < 400; k++) { a.state = 'idle'; a.hunger = 2 + Math.random() * 3.9; a.wait = 0; if (prowl(wl, a, lion) && a.state === 'idle' && a.wait > 0) rest++; }
  assert.ok(rest / 400 > 0.7, `fed lion rests ${(100 * rest / 400).toFixed(0)}% of decisions`);
  const b = put(gnu, j); b.x = a.x + 4; b.y = a.y; b.state = 'idle'; b.wait = 5;
  a.state = 'idle'; a.hunger = huntHunger(lion) + 1;
  assert.ok(prowl(wl, a, lion) && a.state === 'hunt' && a.target === b.id, 'a hungry lion starts a hunt on prey four tiles off');
});

check('a hawk soars at least a fifth of its time in a PNW community', () => {
  const { g, wl, habitat, put, step } = scene('pnw');
  for (const key of ['hawk', 'vole', 'rabbit', 'gartersnake', 'deer', 'robin']) {
    const d = g.catalog.animal[key], good = habitat(d);
    for (let k = 0; k < Math.min(d.max, 10); k++) put(d, good[Math.floor(Math.random() * good.length)]);
  }
  const hawk = g.catalog.animal.hawk.index;
  let n = 0, soar = 0;
  step(1200, k => { if (k < 100) return; for (const a of wl.agents) if (a.sp === hawk && !a.leaving) { n++; if (a.bird?.kind === 'soar') soar++; } });
  assert.ok(soar / n >= 0.2, `hawks soared ${(100 * soar / n).toFixed(0)}%`);
});

check('hunger counts from the end of a meal', () => {
  const { g, wl, habitat, put } = scene('pnw'), d = g.catalog.animal.cougar, a = put(d, habitat(d)[0]);
  a.state = 'feed'; a.feedT = 0.04; a.hunger = 3; a.feedAt = [a.x, a.y];
  wl.update(0.05);
  assert.equal(a.state, 'idle'); assert.equal(a.hunger, 0);
});

check('prey watches a stalking hunter and bolts when the rush starts', () => {
  const { g, wl, habitat, put } = scene('serengeti'), lion = g.catalog.animal.lion, gnu = g.catalog.animal.wildebeest;
  const j = habitat(gnu)[0], b = put(gnu, j), a = put(lion, j);
  a.x = b.x + 4.5; a.y = b.y; b.state = 'idle'; b.wait = 3;
  a.state = 'hunt'; a.target = b.id; a.hunt = { phase: 'approach' }; a.huntTime = 5;
  assert.equal(watch(wl, b, gnu, true, [a]), false, 'a hunter approaching 4.5 tiles off is not yet an attack');
  assert.notEqual(b.state, 'flee');
  a.hunt.phase = 'rush';
  assert.ok(watch(wl, b, gnu, true, [a]) && b.state === 'flee', 'the rush sends it running');
});

check('a fleeing animal speeds up over half a day, then tires on a long run', () => {
  const { g, wl, habitat, put } = scene('serengeti'), lion = g.catalog.animal.lion, gnu = g.catalog.animal.wildebeest;
  const j = habitat(gnu)[0], b = put(gnu, j), a = put(lion, j);
  a.x = b.x - 2; a.y = b.y; a.state = 'hunt'; a.target = b.id; a.hunt = { phase: 'rush' };
  bolt(wl, b, a, gnu.speed * 1.9, 10, 0);
  const pace = () => { const x = b.x, y = b.y; a.x = b.x - 2; a.y = b.y; fleeUpdate(wl, b, gnu, 0.05); return Math.hypot(b.x - x, b.y - y) / 0.05; };
  const first = pace();
  let mid = 0; for (let t = 0.05; t < 1; t += 0.05) mid = pace();
  let late = 0; for (let t = 1; t < 3.5; t += 0.05) late = pace();
  assert.equal(b.state, 'flee', 'still running');
  assert.ok(first < gnu.speed * 1.3, `starts near a walk (${first.toFixed(2)})`);
  assert.ok(mid > gnu.speed * 1.8, `full escape pace by half a day (${mid.toFixed(2)})`);
  assert.ok(late < gnu.speed * 1.4, `tired after a long run (${late.toFixed(2)})`);
});

check('unused game trails fade by about half in 140 days', () => {
  assert.ok(Math.abs(TRAIL_FADE ** 140 - 0.5) < 0.05);
});

console.log(`activity-check: ${checks} checks passed`);
