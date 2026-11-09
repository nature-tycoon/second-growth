// node tools/motion-sweep-check.mjs [--report] [maps...]
// Visible movement glitches, every species on every map, through the real frame loop: a restored
// landscape (map-audit-fixtures) peopled with every species (animal-steering-check's `populate`,
// plus the swimmers it leaves out), then game.update and Actors.update once a frame at normal
// speed. Per species, per 1000 drawn animal-frames:
//   simJump   the simulated position moving further in one frame than its speed allows
//   drawJump  the drawn position doing the same (what the player sees pop)
//   snap      the drawn heading turning more than SNAP in one frame (the eased turn can't)
//   wobble    the drawn heading swinging one way then straight back, both over WOBBLE a frame
//   spin      the drawn heading turning more than a full circle within a second
//   glide     a ground walker's body moving at over half its walking pace with its legs still
//   treadmill a ground walker striding (gait up) while its body covers under a tenth of its pace
//   trunk     a ground walker's body inside wood (ground-obstacles.js inWood, the 0025 capsule)
//   wet       a land walker (move 'ground') standing still on a water tile
//   stall     moving (walk, flee, approach, play) yet no further than STALL_R from where it was
//             STALL_DAYS ago
// A count breaks its limit (LIMITS, per 1000) for a species on a map when it is at least MIN_EVENTS
// frames and over the rate, both seeds together. The limits were set on 2026-11-09 from seeds 1987,
// 91, 7 and 42, with room. Glitches that are clearly real are matched by KNOWN (by what they are,
// not by species, so another seed showing the same bug still passes) and listed in the report
// instead of loosening a limit for them. A fix should make its KNOWN line go quiet; then delete it.
// It catches past glitches: on the commit before 0025 (a1fc92c^) 25 limits break, land walkers
// standing in water (elephant, topi, gajah, deer) and bodies in trunks on every map (giraffe 152,
// Sumatran rhino 252 per 1000, with the looser keep-out of the time); before the trunk steering of
// 334e28b, opossums treadmill (30 per 1000).
// --report prints without failing. SEEDS=1987,91 DAYS=6 game days per map and seed, FPS=60,
// DETAIL=1 the species/state behind each count. Not covered: climbers and perched birds are drawn
// without the plant models (no Flora headless), so their branch and perch positions are not tested.
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
import { pathToFileURL } from 'node:url';
import { BIOME_LIST } from '../js/biome.js';
import { restoredGame } from './map-audit-fixtures.mjs';
import { populate } from './animal-steering-check.mjs';
import { mulberry32 } from '../js/rng.js';
import { T, F, isWater, SPEEDS } from '../js/config.js';
import { passable, canLand } from '../js/sim/animal-terrain.js';
import { groundWalker, inWood } from '../js/sim/ground-obstacles.js';
import { travelSpeed } from '../js/sim/climb-pace.js';
const THREE = await import('three');
const { Actors } = await import('../js/render3d/actors.js');

globalThis.localStorage ||= { getItem() { return null; }, setItem() {}, removeItem() {} };
const args = process.argv.slice(2), strict = !args.includes('--report');
const maps = args.filter(s => !s.startsWith('--'));
const DAYS = +(process.env.DAYS || 6), SEEDS = (process.env.SEEDS || '1987,91').split(',').map(Number), FPS = +(process.env.FPS || 60), WARM = 0.25;
const SNAP = 0.6, WOBBLE = 0.08, STALL_R = 0.15, STALL_DAYS = 0.5, SUSTAIN = 10;
const MOVING = new Set(['walk', 'flee', 'approach', 'play']);
const wrap = d => d - Math.round(d / (Math.PI * 2)) * Math.PI * 2;
const COUNTS = ['simJump', 'drawJump', 'snap', 'wobble', 'spin', 'glide', 'treadmill', 'trunk', 'wet', 'stall'];
const PER_WALKER = new Set(['glide', 'treadmill', 'trunk']); // (per 1000 ground-walker frames)
export const LIMITS = { simJump: 6, drawJump: 6, snap: 4, wobble: 4, spin: 2, glide: 2, treadmill: 2, trunk: 10, wet: 0, stall: 160 };
const MIN_EVENTS = 3;
const deadwoodNear = (w, a) => {
  for (let y = Math.floor(a.y) - 1; y <= Math.floor(a.y) + 1; y++) for (let x = Math.floor(a.x) - 1; x <= Math.floor(a.x) + 1; x++)
    if (w.inb(x, y) && (w.feature[w.idx(x, y)] === F.SNAG || w.feature[w.idx(x, y)] === F.LOG)) return true;
  return false;
};
// Real glitches found by this sweep on 2026-11-09 (game code unchanged here; each is a follow-up).
export const KNOWN = [
  { count: 'stall', name: 'river and estuary swimmers frozen mid-route (walk, moveProgress.stalled climbing for days; game-placed snappers too)', test: (a, def) => def.move === 'swim' && !def.reef },
  { count: 'spin', name: 'fleeing prey turn a full circle within a second (flight turning at FLEE_TURN the whole time)', test: a => a.state === 'flee' },
  { count: 'wobble', name: 'river dolphin heading shivers frame to frame while swimming', test: a => a.key === 'dolphin' },
  { count: 'trunk', name: 'pythons inside wood, idle and fleeing (twice the rate before the wave2 snakes)', test: a => a.key === 'python' },
  { count: 'trunk', name: 'animals standing inside a snag or log (settle never pushes out one that has not moved)', test: (a, def, w) => !MOVING.has(a.state) && deadwoodNear(w, a) },
];

// The swimmers and reef animals `populate` leaves out, a few of each where they live.
function addSwimmers(g, rng) {
  const wl = g.wildlife, w = g.world;
  for (const d of g.catalog.animals) {
    if (!(d.reef || d.move === 'swim')) continue;
    const suit = wl.suit[d.index], good = [];
    for (let j = 0; j < w.n; j++) if (suit[j] > 0.3 && passable(w, j, d) && canLand(w, j, d)) good.push(j);
    for (let k = 0; k < Math.min(d.max, 4) && good.length; k++) {
      const j = good[Math.floor(rng() * good.length)];
      wl.spawn(d, j % w.w, j / w.w | 0, { silent: true });
    }
  }
}

// onHit(count, animal, { game, pose, last, frame }) is called for each count (for probes).
export function sweep(map, { seed = SEEDS[0], days = DAYS, fps = FPS, onHit } = {}) {
  Math.random = mulberry32(seed);
  const rng = mulberry32(seed + 1);
  const g = restoredGame(map, seed), wl = g.wildlife, w = g.world, cat = g.catalog;
  populate(g, rng); addSwimmers(g, rng);
  g.speed = 1;
  const actors = new Actors(new THREE.Scene()), right = new THREE.Vector3(1, 0, 0), drawRandom = mulberry32(seed + 2);
  const frameDays = SPEEDS[1] / fps, frames = Math.round((days + WARM) / frameDays), warm = Math.round(WARM / frameDays);
  const by = {}, why = {}, known = {}, last = new Map();
  const row = key => by[key] ||= Object.fromEntries([['frames', 0], ['walkerFrames', 0], ...COUNTS.map(k => [k, 0])]);
  const hit = (r, k, a, extra = '') => {
    const def = cat.animals[a.sp], kn = KNOWN.find(c => c.count === k && c.test(a, def, w));
    if (kn) ((known[kn.name] ||= {})[a.key] = (known[kn.name][a.key] || 0) + 1); else r[k]++;
    onHit?.(k, a, { game: g, pose: actors.pose.get(a.id), last: last.get(a.id), frame, known: kn });
    if (process.env.DETAIL) { const n = `${kn ? 'known ' : ''}${k} ${a.key}/${a.state}${extra}`; why[n] = (why[n] || 0) + 1; }
  };
  let frame = 0;
  for (let f = 0; f < frames; f++, frame = f) {
    const t = f / fps;
    g.update(1 / fps);
    // (the drawing draws on its own random stream: three.js takes Math.random for each new model's
    // geometry, so otherwise which maps ran before would change this one's animals)
    const sim = Math.random; Math.random = drawRandom;
    actors.update(g, right, t);
    Math.random = sim;
    const seen = new Set();
    for (const a of wl.viewAgents) {
      const st = actors.pose.get(a.id);
      if (!st || st.visible === false || a.state === 'dormant') continue;
      seen.add(a.id);
      const def = cat.animals[a.sp], p = last.get(a.id);
      const now = { f, sx: a.x, sy: a.y, dx: st.x, dz: st.z, yaw: st.yaw, run: a.run || 1, state: a.state, phase: a.phase,
        turns: p && p.f === f - 1 ? p.turns : [], dyaw: 0, anchor: p?.anchor, gait: st.gait };
      last.set(a.id, now);
      if (!p || p.f !== f - 1 || f < warm) { now.anchor = null; continue; }
      const r = row(a.key); r.frames++;
      // (how far it may go in a frame: its everyday pace times the faster of this frame's and the last's gait, with room to spare)
      const pace = Math.max(0.05, travelSpeed(def), def.speed || 0);
      const allow = pace * Math.max(1, now.run, p.run) * frameDays * 2.5 + 0.01;
      const sd = Math.hypot(a.x - p.sx, a.y - p.sy), dd = Math.hypot(st.x - p.dx, st.z - p.dz);
      if (sd > allow && sd > 0.05) hit(r, 'simJump', a, ` ${(sd / allow).toFixed(0)}x`);
      if (dd > allow && dd > 0.05) hit(r, 'drawJump', a, ` ${(dd / allow).toFixed(0)}x`);
      const dy = wrap(st.yaw - p.yaw); now.dyaw = dy;
      if (Math.abs(dy) > SNAP) hit(r, 'snap', a);
      if (Math.abs(dy) > WOBBLE && Math.abs(p.dyaw) > WOBBLE && Math.sign(dy) !== Math.sign(p.dyaw)) hit(r, 'wobble', a);
      now.turns = [...now.turns.slice(-(fps - 1)), dy];
      if (Math.abs(now.turns.reduce((s, v) => s + v, 0)) > Math.PI * 2) hit(r, 'spin', a);
      const walking = groundWalker(def, a) && !def.reef;
      if (walking) {
        r.walkerFrames++;
        const ground = dd / (travelSpeed(def) * frameDays);
        // (held for SUSTAIN frames: the gait blends over a few frames as it sets off or stops. A
        // pounce, hunt.leap, is drawn in the air with its legs stretched out, not sliding)
        now.glide = ground > 0.5 && st.gait < 0.15 && !a.hunt?.leap ? (p.glide || 0) + 1 : 0;
        now.tread = ground < 0.1 && st.gait > 0.6 && a.phase > p.phase ? (p.tread || 0) + 1 : 0;
        if (now.glide > SUSTAIN) hit(r, 'glide', a, ` gait ${st.gait.toFixed(2)}`);
        if (now.tread > SUSTAIN) hit(r, 'treadmill', a);
        if (inWood(w, a, def, a.x, a.y, a.hd ?? a.orientation)) hit(r, 'trunk', a);
      }
      const xx = Math.floor(a.x), yy = Math.floor(a.y), tt = w.inb(xx, yy) ? w.terrain[w.idx(xx, yy)] : null;
      if (def.move === 'ground' && !a.flying && !(a.alt > 0.05) && !a.passing && tt != null && isWater(tt) && !(def.crossing && tt === T.RIVER) && !MOVING.has(a.state) && a.state !== 'hunt') hit(r, 'wet', a, ` ${tt}`);
      if (MOVING.has(a.state) && a.state === p.state && !a.passing) {
        // (a slow walker, a sloth or a sea cucumber, needs longer to cover STALL_R)
        const window = Math.max(STALL_DAYS, 4 * STALL_R / (travelSpeed(def) * (a.run || 1)));
        if (!now.anchor || Math.hypot(a.x - now.anchor[0], a.y - now.anchor[1]) > STALL_R) now.anchor = [a.x, a.y, f];
        else if ((f - now.anchor[2]) * frameDays > window) hit(r, 'stall', a, ` follow=${!!a.follow} path=${a.path?.length ?? '-'} stalled=${(a.moveProgress?.stalled ?? 0) > 0.3} sp=${travelSpeed(def).toFixed(1)}`);
      } else now.anchor = null;
    }
    for (const id of last.keys()) if (!seen.has(id)) last.delete(id);
  }
  return { map, seed, by, why, known };
}

// Both seeds together, per species, and what breaks a limit.
export function tally(runs) {
  const by = {}, known = {};
  for (const r of runs) {
    for (const [key, c] of Object.entries(r.by)) { const t = by[key] ||= {}; for (const [k, v] of Object.entries(c)) t[k] = (t[k] || 0) + v; }
    for (const [name, sp] of Object.entries(r.known)) for (const [key, n] of Object.entries(sp)) (known[name] ||= {})[key] = (known[name][key] || 0) + n;
  }
  const rate = (c, k) => 1000 * c[k] / ((PER_WALKER.has(k) ? c.walkerFrames : c.frames) || 1);
  const broken = [];
  for (const [key, c] of Object.entries(by)) for (const k of COUNTS) if (c[k] >= Math.min(MIN_EVENTS, LIMITS[k] ? MIN_EVENTS : 1) && rate(c, k) > LIMITS[k]) broken.push(`${key} ${k} ${rate(c, k).toFixed(1)} per 1000 (limit ${LIMITS[k]}, ${c[k]} frames)`);
  return { by, known, rate, broken };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t0 = performance.now(), failed = [];
  for (const biome of BIOME_LIST) {
    if (maps.length && !maps.includes(biome.id)) continue;
    const t1 = performance.now(), runs = SEEDS.map(seed => sweep(biome.id, { seed }));
    const { by, known, rate, broken } = tally(runs);
    console.log(`\n${biome.id}: ${DAYS} days x seeds ${SEEDS.join(', ')} (${((performance.now() - t1) / 1000).toFixed(1)} s), per 1000 frames`);
    const cell = v => String(v).padStart(10);
    console.log('species'.padEnd(16) + 'frames'.padStart(7) + COUNTS.map(cell).join(''));
    console.log('limit'.padEnd(16) + ''.padStart(7) + COUNTS.map(k => cell(LIMITS[k])).join(''));
    for (const [key, c] of Object.entries(by).sort()) {
      if (!COUNTS.some(k => c[k])) continue;
      console.log(key.padEnd(16) + String(c.frames).padStart(7) + COUNTS.map(k => cell(c[k] ? rate(c, k).toFixed(1) + (broken.some(b => b.startsWith(`${key} ${k} `)) ? '!' : '') : '·')).join(''));
    }
    console.log(`(${Object.keys(by).length} species drawn; those with nothing counted are left out)`);
    for (const [name, sp] of Object.entries(known)) console.log(`known: ${name}: ${Object.entries(sp).map(([k, n]) => `${k} ${n}`).join(', ')} frames`);
    if (process.env.DETAIL) for (const run of runs) for (const [k, n] of Object.entries(run.why).sort((p, q) => q[1] - p[1]).slice(0, 30)) console.log(`  ${run.seed} ${String(n).padStart(6)} ${k}`);
    for (const b of broken) { console.log(`FAIL ${biome.id}: ${b}`); failed.push(`${biome.id} ${b}`); }
  }
  console.log(`\n${failed.length ? `${failed.length} limits broken` : 'All within limits'} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  if (strict && failed.length) process.exitCode = 1;
}
