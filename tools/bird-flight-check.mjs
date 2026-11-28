// node tools/bird-flight-check.mjs [--report]
// How birds fly, as drawn (actors-fly.js flightPose; decisions 0012, 0039). A mixed community on
// pnw and atlanta runs through game.update's wildlife step and the real Actors at 20 frames a second.
//   landing   through the last 0.3 tiles down to where it settles, a bird's wings are open and
//             beating (the wing clock moving), its body pitched up: it flares, it doesn't drop
//             (before 2026-11-27 the wings were open in 1 to 13% of those frames)
//   prey      never legs reaching forward while it holds its catch (0012: drawn in the talons)
//   cruise    no flare in a cruise: a bird flying to a goal still far off, or a hawk on its soar
//   bank      a soarer leans into its circle (SOAR_BANK, its circle's way round); every flier's
//             roll changes smoothly (its second difference a frame) and stays within its style's limit
//   styles    by trait flightStyle: 'bound' birds fold their wings for part of each flight and dip;
//             'steady' birds never fold, dip or hold their wings still; 'soar' birds glide on still
//             wings part of the way; a passing swallow flock ('swoop') banks harder than geese
//   paused    a frame with no time passing leaves the roll and the wings as they were (no NaN)
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { passable, canLand } from '../js/sim/animal-terrain.js';
import { trait } from '../js/data/animal-kinds.js';
import { PASSAGE_SPECIES } from '../js/data/bird-passage.js';
import { spawnPassage } from '../js/sim/bird-passage.js';
const THREE = await import('three');
const { Actors } = await import('../js/render3d/actors.js');
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.document ||= { createElement: () => ({ getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };
const report = process.argv.includes('--report');
const DT = 0.05;
let failed = false;
const fail = msg => { console.log('  FAIL ' + msg); failed = true; };
const q = (v, f) => (v.sort((x, y) => x - y), v[Math.floor(v.length * f)] || 0);

function populate(g) {
  const wl = g.wildlife, w = g.world;
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability();
  for (const d of g.catalog.animals) {
    if (d.move !== 'fly' || d.reef || ['bee', 'butterfly', 'bat'].includes(d.sprite.kind)) continue;
    const suit = wl.suit[d.index], good = [];
    for (let j = 0; j < w.n; j++) if (suit[j] > 0.3 && passable(w, j, d) && canLand(w, j, d) && !w.fire[j]) good.push(j);
    for (let k = 0; k < 6 && good.length; k++) { const j = good[Math.floor(Math.random() * good.length)]; wl.spawn(d, j % w.w, j / w.w | 0, { silent: true }).wait = Math.random(); }
  }
}

for (const map of ['pnw', 'atlanta']) {
  Math.random = mulberry32(11);
  const g = restoredGame(map, 11), wl = g.wildlife;
  populate(g);
  const actors = new Actors(new THREE.Scene());
  const prev = new Map(), open = new Map(), landings = [], styles = {}, jolts = [];
  let preyReach = 0, cruiseFlare = 0, soarWrong = 0, soarFrames = 0, overMax = 0, t = 0;
  for (let f = 0; f < 2000; f++) {
    if (f % 20 === 0) { g.day++; wl.daily(); }
    wl.update(0.036);
    actors.update(g, new THREE.Vector3(1, 0, 0), (t += DT));
    if (f === 1000) {
      // (paused: the same time again, so the frame's dt is 0)
      const before = new Map([...actors.pose].map(([id, st]) => [id, [st.bank, st.wing]]));
      actors.update(g, new THREE.Vector3(1, 0, 0), t);
      for (const [id, st] of actors.pose) {
        const b = before.get(id);
        if (!b || st.wing == null) continue;
        if (!Number.isFinite(st.bank) || st.bank !== b[0] || st.wing !== b[1]) { fail(`${map}: a paused frame moved bird ${id}'s roll or wings (${b} -> ${st.bank}, ${st.wing})`); break; }
      }
    }
    if (f < 40) continue;
    for (const a of wl.agents) {
      const def = g.catalog.animals[a.sp], st = actors.pose.get(a.id);
      if (!st || st.visible === false || st.wing == null) continue;
      const p = prev.get(a.id), style = trait(def, 'flightStyle') || 'steady';
      const S = styles[style] ||= { frames: 0, fold: 0, still: 0, dip: 0 };
      // (half a second after setting off, a flare from a landing it just broke off has faded)
      const since = p && p.state === a.state ? p.since + 1 : 0;
      const cruising = since > 10 && a.state === 'fly' && a.tx != null && Math.hypot(a.tx - a.x, a.ty - a.y) > 3;
      if ((cruising || since > 10 && a.bird?.kind === 'soar' && a.bird.carcass == null) && st.flare > 0.05) { cruiseFlare++; if (process.env.DEBUG && cruiseFlare < 15) console.log('flare', def.key, a.state, a.bird?.kind, st.flare.toFixed(2), (st.birdY - st.restY).toFixed(2), (st.birdVy||0).toFixed(2), a.flying, p?.state); }
      if (a.bird?.kind === 'soar' && st.fly > 0.95 && p?.soar) { soarFrames++; if (Math.sign(st.bank) !== a.bird.dir || Math.abs(st.bank) < 0.25) soarWrong++; }
      if (a.prey && st.drawFly > 1) preyReach++;
      if (st.fly > 0.95 && a.flying) {
        if (p?.air) jolts.push(Math.abs(st.bank - 2 * p.bank + p.bank2));
        if (Math.abs(st.bank) > 0.86) overMax++;
        if (cruising) {
          S.frames++; if (st.drawFly < 0.5) S.fold++; if (p && Math.abs(st.wing - p.wing) < 0.02) S.still++;
          S.dip = Math.max(S.dip, Math.abs(st.undul || 0));
        }
      }
      if (p && p.state === 'fly' && a.state !== 'fly' && !open.has(a.id)) open.set(a.id, []);
      const L = open.get(a.id);
      if (L) {
        L.push({ y: st.y, fly: st.drawFly, wing: st.wing, pitch: st.flarePitch || 0 });
        if (L.length > 120 || L.length > 5 && Math.abs(st.birdVy || 0) < 1e-3) { open.delete(a.id); landings.push(L); }
      }
      prev.set(a.id, { since, state: a.state, wing: st.wing, soar: a.bird?.kind === 'soar', air: st.fly > 0.95 && a.flying, bank: st.bank, bank2: p?.bank ?? st.bank });
    }
  }
  // landings: the last 0.3 tiles down
  let n = 0, open3 = 0, moving = 0, frames = 0, pitched = 0;
  for (const L of landings) {
    const end = L[L.length - 1].y, last = L.filter(r => r.y - end > 0.02 && r.y - end < 0.3);
    if (last.length < 2 || L[0].y - end < 0.3) continue;
    n++; frames += last.length; open3 += last.filter(r => r.fly > 0.8).length;
    for (let i = 1; i < last.length; i++) if (last[i].wing !== last[i - 1].wing) moving++;
    if (Math.max(...L.map(r => r.pitch)) > 0.35) pitched++;
  }
  const openShare = open3 / frames, moveShare = moving / Math.max(1, frames - n), pitchShare = pitched / n, jolt = q(jolts, 0.99);
  console.log(`${map}: ${n} landings: wings open ${(openShare * 100).toFixed(0)}% and beating ${(moveShare * 100).toFixed(0)}% of the last 0.3 tiles, pitched up in ${(pitchShare * 100).toFixed(0)}%; ` +
    `cruise flares ${cruiseFlare}; soarers banked wrong ${soarWrong}/${soarFrames}; roll jolt 99% ${jolt.toFixed(4)}, over the limit ${overMax}`);
  if (report) for (const [k, S] of Object.entries(styles)) console.log(`  ${k.padEnd(7)} cruise frames ${S.frames}: wings folded ${(S.fold / S.frames * 100).toFixed(0)}%, still ${(S.still / S.frames * 100).toFixed(0)}%, dip ${S.dip.toFixed(3)}`);
  if (n < 50) fail(`${map}: only ${n} landings seen`);
  if (openShare < 0.85) fail(`${map}: wings open in only ${(openShare * 100).toFixed(0)}% of the last 0.3 tiles of a landing (85%)`);
  if (moveShare < 0.85) fail(`${map}: wings beating in only ${(moveShare * 100).toFixed(0)}% of the last 0.3 tiles of a landing (85%)`);
  if (pitchShare < 0.8) fail(`${map}: only ${(pitchShare * 100).toFixed(0)}% of landings flare nose up (80%)`);
  if (preyReach) fail(`${map}: ${preyReach} frames of a bird reaching its legs out with its catch in them`);
  if (cruiseFlare) fail(`${map}: ${cruiseFlare} frames of a flare in cruising flight or on the soar`);
  if (soarWrong > soarFrames * 0.02) fail(`${map}: soarers banked out of their circle ${soarWrong}/${soarFrames} frames`);
  if (jolt > 0.04) fail(`${map}: roll jolt ${jolt.toFixed(4)} (over 0.04)`);
  if (overMax) fail(`${map}: roll over the steepest bank ${overMax} frames`);
  const B = styles.bound, St = styles.steady, So = styles.soar;
  if (!(B?.frames > 200 && B.fold / B.frames > 0.08 && B.dip > 0.02)) fail(`${map}: bounding birds don't fold and dip`);
  if (!(St?.frames > 200 && St.fold === 0 && St.dip === 0 && St.still / St.frames < 0.01)) fail(`${map}: steady fliers fold, dip or hold still`);
  if (!(So?.frames > 200 && So.still / So.frames > 0.12)) fail(`${map}: soaring kinds never glide on still wings`);
}

// A passing swallow flock weaves and banks steeply; geese fly straight and steady.
{
  Math.random = mulberry32(5);
  const g = restoredGame('pnw', 5), wl = g.wildlife;
  wl.agents = []; wl.flyovers = []; wl.passageWait = 1e6;
  const actors = new Actors(new THREE.Scene());
  const maxBank = {};
  for (const key of ['barn_swallow', 'canada_goose']) {
    spawnPassage(wl, PASSAGE_SPECIES[key], { x: 50, y: 50, n: 5 });
    let t = 0;
    for (let f = 0; f < 300; f++) {
      wl.update(0.036);
      actors.update(g, new THREE.Vector3(1, 0, 0), (t += DT));
      for (const a of wl.flyovers ?? []) { const st = actors.pose.get(a.id); if (st && a.passageDef?.key === key) maxBank[key] = Math.max(maxBank[key] || 0, Math.abs(st.bank || 0)); }
    }
    wl.flyovers = [];
  }
  console.log(`passing flocks: steepest bank, swallows ${(maxBank.barn_swallow || 0).toFixed(2)}, geese ${(maxBank.canada_goose || 0).toFixed(2)}`);
  if (!((maxBank.barn_swallow || 0) > 0.3 && (maxBank.barn_swallow || 0) > 2 * (maxBank.canada_goose || 0))) fail('passing swallows don\'t bank harder than geese');
}

if (failed) process.exit(1);
console.log('bird-flight-check: PASS');
