// node tools/pounce-gate-check.mjs
// A pounce springs out of speed (decision 0026, huntStep and startLeap in sim/animal-life.js): a
// cat rushing in slowly from a creep runs on before it leaps, one already close still pounces, and
// no leap goes over twice the pace it springs from. A jaguar that crept up close used to leap at
// once at 3.6 times its walking pace, one frame to the next (motion sweep simJump, 2026-11-24).
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { populate } from './animal-steering-check.mjs';
import { huntStep, huntStyle } from '../js/sim/animal-life.js';
import { passable } from '../js/sim/animal-terrain.js';

globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
Math.random = mulberry32(1987);
const g = restoredGame('amazon', 1987), wl = g.wildlife, w = g.world, cat = g.catalog;
populate(g, mulberry32(1988));
const jag = wl.agents.find(a => cat.animals[a.sp].key === 'jaguar'), prey = wl.agents.find(a => cat.animals[a.sp].key === 'agouti');
if (!jag || !prey) throw new Error('no jaguar or agouti on the Amazon fixture');
const def = cat.animals[jag.sp], S = huntStyle(def), P = S.pounce, fails = [];
// an open dry spot with room east of it
let spot = null;
for (let y = 4; y < w.h - 4 && !spot; y++) for (let x = 4; x < w.w - 6 && !spot; x++)
  if ([0, 1, 2].every(k => passable(w, w.idx(x + k, y), def))) spot = [x + 0.5, y + 0.5];
const trial = (d, v) => {
  Object.assign(jag, { x: spot[0], y: spot[1], heading: 0, state: 'hunt', target: prey.id, huntTime: 5 });
  Object.assign(prey, { x: spot[0] + d, y: spot[1], state: 'idle', alertT: 0, jink: null });
  jag.hunt = { phase: 'rush', v, line: 0, stamina: S.stamina, best: d, since: 0, d0: d, t: 3 };
  huntStep(wl, jag, def, prey, def.speed * 0.002);
  return jag.hunt?.leap;
};
const gate = S.sprint * P.fast / 2;
if (trial(1.2, 0.6)) fails.push(`a rush at ${0.6} (gate ${gate.toFixed(2)}) 1.2 tiles off leapt; it should run on first`);
const L = trial(1.2, gate + 0.1);
if (!L) fails.push(`a rush at full speed 1.2 tiles off didn't leap`);
else if (L.len / L.T > 2 * def.speed * (gate + 0.1) + 1e-6) fails.push(`a full-speed leap ran ${(L.len / L.T / def.speed).toFixed(2)} times its pace`);
const C = trial(0.8, 0.6);
if (!C) fails.push('a slow rush 0.8 tiles off didn\'t pounce');
else {
  if (C.len / C.T > 2 * def.speed * 1 + 1e-6) fails.push(`a leap from a creep ran ${(C.len / C.T / def.speed).toFixed(2)} times its pace (limit 2)`);
  if (!(C.arc < P.arc)) fails.push(`a slow, close leap kept the full arc ${C.arc} (it would hang in the air)`);
}
for (const f of fails) console.log(`FAIL ${f}`);
console.log(fails.length ? `${fails.length} failed` : `pounce gate ok (gate ${gate.toFixed(2)}, close leap ${(C.len / C.T / def.speed).toFixed(2)}x pace, arc ${C.arc.toFixed(2)} of ${P.arc})`);
if (fails.length) process.exitCode = 1;
