// node tools/motion-smoothness-check.mjs [--report]
// Birds in level flight and reef fish swimming hold a steady line: altitude changes are smooth
// climbs and glides, not a bob over every bump of the ground or the reef. A mixed community is
// drawn by the real Actors at 20 frames a second and each animal's drawn height is traced:
//   step   the height change a frame (tiles), 99th percentile
//   jolt   the change in that climb rate frame to frame (tiles a frame), 99th percentile: what the
//          eye reads as jerky
//   bobs   quick up-and-downs per minute of travel: a turn from rising to sinking (or back) of
//          more than BOB tiles within a second of the last turn. A long swell over rolling ground
//          or a forest isn't one; a bounce over each crown or coral head is
// Ducks on the water float at the drawn surface (terrain.waterAt, the creek's own level), never
// under it, and the camera's eased height (followHeight) stays within a body length of the
// animal while smoothing its bumps away.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
import { restoredGame } from './map-audit-fixtures.mjs';
import { mulberry32 } from '../js/rng.js';
import { passable, canLand } from '../js/sim/animal-terrain.js';
import { descending } from '../js/render3d/flight-clearance.js';
const THREE = await import('three');
const { Actors } = await import('../js/render3d/actors.js');
const { Terrain } = await import('../js/render3d/terrain.js');
const { followHeight } = await import('../js/render3d/animal-camera.js');
const { T, LEVEL, isWater } = await import('../js/config.js');
globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.document ||= { createElement: () => ({ getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };
const report = process.argv.includes('--report');
const DT = 0.05, BOB = 0.03;
const atlas = { tex: null, uv: {}, slot: {} };
for (let s = 0; s < 4; s++) { atlas.uv[T.PASTURE + '|' + s + '|0'] = [0, 0, 1, 1]; atlas.slot[T.PASTURE + '|' + s + '|0'] = 0; }

function populate(g, pick, per = 6) {
  const wl = g.wildlife, w = g.world;
  wl.agents = []; wl.flyovers = []; wl.recount(); wl.passageWait = 1e6; wl.computeSuitability();
  for (const d of g.catalog.animals) {
    if (!pick(d)) continue;
    const suit = wl.suit[d.index], good = [];
    for (let j = 0; j < w.n; j++) if (suit[j] > 0.3 && passable(w, j, d) && (d.move !== 'fly' || canLand(w, j, d)) && !w.fire[j]) good.push(j);
    for (let k = 0; k < Math.min(d.max || per, per) && good.length; k++) { const j = good[Math.floor(Math.random() * good.length)]; wl.spawn(d, j % w.w, j / w.w | 0, { silent: true }).wait = Math.random(); }
  }
}
// Traces of each animal's drawn height while `keep` holds; broken where it doesn't.
function trace(g, actors, frames, keep, each) {
  const wl = g.wildlife, runs = new Map(), done = [];
  let t = 0;
  for (let k = 0; k < frames; k++) {
    if (k % 20 === 0) { g.day++; wl.daily(); }
    wl.update(0.036);
    actors.update(g, new THREE.Vector3(1, 0, 0), (t += DT));
    if (k < 40) continue;
    const seen = new Set();
    for (const a of wl.agents) {
      const def = g.catalog.animals[a.sp], st = actors.pose.get(a.id);
      each?.(a, def, st);
      if (!st || st.visible === false || !keep(a, def, st)) continue;
      seen.add(a.id);
      let r = runs.get(a.id);
      if (!r) runs.set(a.id, r = { ys: [], key: def.key });
      r.ys.push(st.y);
    }
    for (const [id, r] of runs) if (!seen.has(id)) { done.push(r); runs.delete(id); }
  }
  return done.concat([...runs.values()]).filter(r => r.ys.length > 10);
}
function stats(runs) {
  const steps = [], jolts = []; let bobs = 0, frames = 0;
  for (const { ys } of runs) {
    frames += ys.length;
    // (a turn counts once the height has come back BOB from the last high or low)
    let dir = 0, hi = ys[0], lo = ys[0], turn = -1e9;
    for (let i = 1; i < ys.length; i++) {
      steps.push(Math.abs(ys[i] - ys[i - 1]));
      if (i > 1) jolts.push(Math.abs(ys[i] - 2 * ys[i - 1] + ys[i - 2]));
      hi = Math.max(hi, ys[i]); lo = Math.min(lo, ys[i]);
      if (dir >= 0 && hi - ys[i] > BOB) { if (dir > 0 && i - turn < 1 / DT) bobs++; dir = -1; lo = hi = ys[i]; turn = i; }
      else if (dir <= 0 && ys[i] - lo > BOB) { if (dir < 0 && i - turn < 1 / DT) bobs++; dir = 1; lo = hi = ys[i]; turn = i; }
    }
  }
  const q = (v, f) => (v.sort((x, y) => x - y), v[Math.floor(v.length * f)] || 0);
  return { frames, step: q(steps, 0.99), jolt: q(jolts, 0.99), bobs: bobs / Math.max(1e-9, frames * DT / 60) };
}
const show = (name, s) => console.log(`${name}: ${s.frames} frames, step 99% ${s.step.toFixed(4)}, jolt 99% ${s.jolt.toFixed(4)}, bobs a minute ${s.bobs.toFixed(1)}`);
let failed = false;
const fail = msg => { console.log('  FAIL ' + msg); failed = true; };

// Birds in level flight: in the air, wings fully out, not stooping, landing or passing over.
for (const map of ['pnw', 'atlanta']) {
  Math.random = mulberry32(11);
  const g = restoredGame(map, 11);
  populate(g, d => d.move === 'fly' && !d.reef && d.sprite.kind !== 'bee' && d.sprite.kind !== 'butterfly');
  const actors = new Actors(new THREE.Scene());
  const runs = trace(g, actors, 1600, (a, def, st) => def.move === 'fly' && a.state === 'fly' && st.fly > 0.95 && !a.passing && !descending(a, def));
  const s = stats(runs);
  show(`${map} birds in level flight`, s);
  // (before 2026-11-11: pnw 7.3 quick bobs a minute, jolt 0.213; atlanta 10.5 and 0.098. Now the jolt is
  // the eased climb's own acceleration, CLIMB_ACCEL x a frame squared, 0.0225)
  if (s.bobs > 2) fail(`birds bob ${s.bobs.toFixed(1)} times a minute (over 2)`);
  if (s.jolt > 0.03) fail(`bird jolt ${s.jolt.toFixed(4)} (over 0.03)`);
}

// Reef fish swimming (not the bottom dwellers, not skipping out of the water).
{
  Math.random = mulberry32(11);
  const g = restoredGame('reef', 11);
  populate(g, d => d.reef && !d.benthic && d.sprite.escape !== 'skip');
  const actors = new Actors(new THREE.Scene());
  const runs = trace(g, actors, 1600, (a, def, st) => def.reef && !def.benthic && a.state !== 'idle' && !a.hover);
  const s = stats(runs);
  show('reef fish swimming', s);
  // (before: 3.1 bobs a minute, jolt 0.036, a grouper lifted 0.3 tiles in a frame over a coral head)
  if (s.bobs > 2.5) fail(`fish bob ${s.bobs.toFixed(1)} times a minute (over 2.5)`);
  if (s.jolt > 0.015) fail(`fish jolt ${s.jolt.toFixed(4)} (over 0.015)`);
  // the camera following them: eased, close behind, smoother still
  const cams = runs.map(r => {
    const c = { y: null, vy: 0 }, ys = [];
    let lag = 0;
    for (const y of r.ys) { followHeight(c, y, DT); ys.push(c.y); lag = Math.max(lag, Math.abs(c.y - y)); }
    return { ys, lag };
  });
  const c = stats(cams), lag = Math.max(...cams.map(x => x.lag));
  show('  camera following them', c);
  console.log(`  camera's furthest from the fish: ${lag.toFixed(3)} tiles`);
  if (c.jolt > s.jolt * 0.6 + 1e-4) fail('camera no smoother than the fish');
  if (lag > 0.25 + 1e-6) fail(`camera lags ${lag.toFixed(3)} tiles behind (over 0.25)`);
}

// Ducks float at the drawn water surface; on dry ground they stand on it.
{
  Math.random = mulberry32(11);
  const g = restoredGame('pnw', 11), w = g.world;
  const terrain = new Terrain(new THREE.Scene(), atlas);
  terrain.setWorld(w, g.border); terrain.updateSurface(g);
  populate(g, d => d.sprite.kind === 'duck', 10);
  const actors = new Actors(new THREE.Scene());
  actors.terrain = terrain;
  let on = 0, under = 0, creek = 0, worst = 0, dry = 0, sunk = 0;
  trace(g, actors, 1600, () => false, (a, def, st) => {
    if (def.sprite.kind !== 'duck' || !st || st.visible === false || a.flying || a.alt > 0.05 || st.fly > 0.3) return;
    const water = terrain.waterAt(a.x, a.y);
    const mo = actors.fauna.motion(def), sink = (mo.sink || 0) * st.sc;
    if (Number.isFinite(water) && water - sink > groundY(w, a)) {
      on++; if (w.terrain[w.idx(Math.floor(a.x), Math.floor(a.y))] === T.CREEK) creek++;
      const d = water - sink - st.y; // (how far its waterline sits under the surface)
      if (d > 0.02) { under++; worst = Math.max(worst, d); }
    } else if (!isWater(w.terrain[w.idx(Math.floor(a.x), Math.floor(a.y))])) {
      dry++; if (st.y < groundY(w, a) - 0.02) sunk++;
    }
  });
  console.log(`ducks: ${on} samples afloat (${creek} on creeks), ${under} under the surface (worst ${worst.toFixed(3)}); ${dry} on dry ground, ${sunk} sunk into it`);
  if (on < 50) fail('too few duck samples on the water');
  // (before: 486 of 7064, as deep as 0.09 tiles, floating at the tile's own level under the creek's)
  if (under > on * 0.01) fail(`${under} duck samples under the water's surface`);
  if (sunk) fail(`${sunk} duck samples sunk into the ground`);
}
function groundY(w, a) { return w.heightAt(a.x, a.y) * LEVEL; }
if (report) process.exit(0);
assert.ok(!failed, 'motion smoothness check failed');
console.log('motion smoothness check passed');
