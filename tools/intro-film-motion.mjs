// The intro film's motion check: the staging run frame by frame headless with nothing drawn on the
// GPU (tools/intro-film-probe.mjs reads each frame), judged against real animals and a real camera,
// shot by shot. No video is rendered or looked at. One check per thing Cole saw in the first cut
// (docs/ideas/2026-11-21-first-minutes/f1.md):
//   1 subject   the key animal's head and body in sight: not behind a trunk, log, the land or a bush
//   2 speed     each animal's ground speed against real limits for its species and gait, measured
//               two ways (the sim's 8 m tiles, and body lengths a second at the drawn size), its leg
//               cycle, and how fast it crosses the frame at the shot's lens
//   3 ground    hooves on the drawn ground: not sunk into it, not floating, except in a leap
//   4 chase     the predator shown before it attacks, never popping up mid-shot in the open, never
//               ahead of its prey along the chase
//   5 camera    speed, acceleration, jerk, turn rate and its change, roll, and sudden swings of the
//               look point
// Prints a short table and exits non-zero when anything fails.
// (Not named *-check.mjs: those join the headless CI suite, and this needs a GPU browser and fails on
// the first cut by design. Once a re-staged film passes, it can join the browser suite.)
//
//   nice -n 15 node tools/intro-film-motion.mjs              probe every layer, then judge
//   nice -n 15 node tools/intro-film-motion.mjs --layers=chase,falls
//   node tools/intro-film-motion.mjs --cached                judge the last probe again (dist/intro-film/motion-probe.json)
//   ... --detail                                                   also print each failure's worst seconds
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LAYERS, FPS, SUBJECTS, PREDATOR, SLOWMO } from './intro-film-shots.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = name => process.argv.includes('--' + name);
const DUMP = root + 'dist/intro-film/motion-probe.json';

// ------------------------------------------------------------------ the limits, each with its reason
const TILE_M = 8; // a tile is about 8 m on the PNW farm (decision 0021: an elk walks about a tile a second at normal pace)
// Real body lengths (head and body, no tail), to read the drawn animal's speed in its own lengths a
// second, which is what the eye judges speed by on screen.
const BODY_M = { deer: 1.5, cougar: 1.5, elk: 2.3 };
// Top ground speed, m/s, per species and gait (gait from the animal's state: standing or browsing,
// stalking, fleeing, the predator's rush).
const SPEED = {
  deer: { stand: 1.8, walk: 1.8, gallop: 13 },  // black-tailed deer: walk ~1.5, trot ~4, gallop up to ~13 in bursts
  cougar: { stand: 1.5, stalk: 1, sprint: 18 },  // cougar: stalks under 1 m/s, sprints up to ~18 m/s for a few seconds
  elk: { stand: 1.8, walk: 1.8, gallop: 18 },    // elk: walk ~1.5, gallop up to ~18
};
const SPRINT_SECONDS = { cougar: 5 }; // cats sprint only briefly: seconds above 10 m/s in one rush
const STRIDE_HZ = { stand: 1.6, walk: 1.6, stalk: 1.2, gallop: 3.2, sprint: 3.4 }; // leg cycles a second: a walk ~1, a deer's gallop ~2.5–3, a cat's sprint ~3
const L = {
  blockedShare: .05,     // 1: at most 5% of a shot's frames with the key animal's head blocked (a glimpse through trunks is fine, a hidden head is not)
  blockedRun: .4,        // 1: and never blocked for more than 0.4 s at a time
  offFrameShare: .1,     // 1: the key animal in the frame at least 90% of its shot
  screenWidths: .7,      // 2: crosses at most 0.7 frame widths a second at the shot's lens (seen by a still camera): faster reads as frantic
  sink: .03,             // 3: hooves at most 0.03 scene units under the drawn ground (grass hides that much; ~5% of a deer's drawn height)
  float: .03,            // 3: ...and at most that far above it, except in a declared leap
  seenBefore: .8,        // 4: the predator in sight (in frame, unblocked) for at least 0.8 s before it attacks
  popEdge: .85,          // 4: a predator first seen mid-shot must come from behind cover or from the frame's edge (|x| over 0.85 of the half-width)
  ahead: .1,             // 4: the predator never more than 0.1 tiles ahead of its prey along the chase
  camSpeed: 15,          // 5: m/s, a tracking vehicle alongside a galloping deer
  camAccel: 8,           // 5: m/s², a smooth vehicle or gimbal
  camJerk: 60,           // 5: m/s³, no lurches
  turnRate: 40,          // 5: °/s, a quick but readable pan (a whip pan is a cut, not a move)
  turnAccel: 120,        // 5: °/s², pans ease in and out
  turnJerk: 1500,        // 5: °/s³, the look doesn't shudder (a look point chasing a moving animal frame by frame does)
  roll: .5,              // 5: °, the horizon stays level
  lookJump: .35,         // 5: tiles a frame the look point may move beyond its own trend (a sudden new target)
  mapPan: .35,           // 5: map view: at most 0.35 of the screen's width a second
};

// ------------------------------------------------------------------ probing (headless Chrome)
let probes;
if (flag('cached')) probes = JSON.parse(await readFile(DUMP, 'utf8'));
else {
  const layers = arg('layers')?.split(',') || LAYERS.map(l => l.name);
  const { openBrowser } = await import('./browser-session.mjs');
  const b = await openBrowser({ label: 'intro-film-motion', software: false, width: 1280, height: 720 });
  probes = {};
  try {
    await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    for (const name of layers) {
      const started = Date.now();
      await b.navigate('/tools/intro-film.html?layer=' + name);
      await b.waitFor('window.introFilm?.ready', 'Intro film layer ' + name, 600000);
      const error = await b.evaluate('window.introFilm.error'); if (error) throw Error(error);
      const { first, last } = await b.evaluate('({first:introFilm.first,last:introFilm.last})');
      const out = [];
      for (let f = first; f <= last; f += 30) out.push(...await b.evaluate(`introFilm.probe(${f},${Math.min(last, f + 29)})`, 300000));
      b.assertHealthy();
      probes[name] = out;
      console.log(`probed ${name}: ${out.length} frames in ${Math.round((Date.now() - started) / 1000)} s`);
    }
  } finally { await b.close(); }
  await mkdir(root + 'dist/intro-film', { recursive: true });
  const old = flag('layers') || arg('layers') ? JSON.parse(await readFile(DUMP, 'utf8').catch(() => '{}')) : {};
  await writeFile(DUMP, JSON.stringify({ ...old, ...probes }));
}

// ------------------------------------------------------------------ judging
const rate = t => SLOWMO.find(([a, b]) => t >= a && t < b)?.[2] ?? 1; // film seconds per real second in slow motion
// real seconds at film time t (speeds are judged on the story's clock; a difference straddling the slow
// motion's edge is measured over the real time it spans, not scaled by one end's rate)
const realT = t => { let r = t; for (const [a, b, k] of SLOWMO) r -= Math.max(0, Math.min(t, b) - a) * (1 - k); return r; };
const deg = r => r * 180 / Math.PI;
const rows = [], details = [];
const row = (check, shot, what, value, limit, pass, worst = null) => {
  rows.push({ check, shot, what, value, limit, pass });
  if (!pass && worst) details.push(`${check} ${shot} ${what}: ${worst}`);
};
const fmt = (v, d = 2) => v == null ? '-' : typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(d)) : String(v);
const sec = t => t.toFixed(2) + ' s';
const gaitOf = (sp, a) => a.leap ? (SPEED[sp]?.sprint ? 'sprint' : 'gallop') : a.state === 'flee' ? 'gallop' : a.state === 'hunt' ? (a.hunt === 'rush' ? 'sprint' : 'stalk') : a.state === 'forage' || a.state === 'idle' ? 'stand' : SPEED[sp]?.walk ? 'walk' : 'stand';
const kind = sp => sp.replace(/\d+$/, '');
const inFrame = s => s && s.front && Math.abs(s.x) <= 1 && Math.abs(s.y) <= 1;
const seen = a => a && inFrame(a.bodyScreen) && !a.bodyBlock;

// a perspective camera's view of a point: NDC x, y, from its position, look direction, fov, aspect
function project(cam, p) {
  const [cx, cy, cz] = cam.pos, [fx, fy, fz] = cam.dir;
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl; // right = forward × up
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy; // up = right × forward
  const dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz, depth = dx * fx + dy * fy + dz * fz;
  const t = Math.tan(cam.fov * Math.PI / 360);
  return { x: (dx * rx + dz * rz) / depth / t / cam.aspect, y: (dx * ux + dy * uy + dz * uz) / depth / t, depth };
}
// longest run of true, in seconds, and when it started
function longest(flags, frames) {
  let best = 0, at = null, run = 0;
  flags.forEach((f, i) => { run = f ? run + 1 : 0; if (run > best) { best = run; at = frames[i - run + 1].t; } });
  return { seconds: best / FPS, at };
}

for (const layer of LAYERS) {
  const frames = probes[layer.name];
  if (!frames?.length) continue;
  const shot = layer.name, dt = 1 / FPS;

  // ---- 1 subject in sight
  const subjects = SUBJECTS[shot] || [];
  for (const [n, name] of subjects.entries()) {
    const fr = frames.filter(f => f.animals[name]);
    if (!fr.length || !frames[0].eye) continue;
    const head = fr.map(f => !!f.animals[name].headBlock), body = fr.map(f => !!f.animals[name].bodyBlock);
    const off = fr.map(f => !inFrame(f.animals[name].headScreen) && !inFrame(f.animals[name].bodyScreen));
    const share = head.filter(Boolean).length / fr.length, run = longest(head, fr);
    const by = {}; fr.forEach(f => { const k = f.animals[name].headBlock; if (k) by[k] = (by[k] || 0) + 1; });
    const firstBlocked = fr.find(f => f.animals[name].headBlock);
    const key = n === 0;
    row('1 subject', shot, `${name} head blocked`, `${(share * 100).toFixed(0)}%${firstBlocked ? ' from ' + sec(firstBlocked.t) : ''}`, `≤${L.blockedShare * 100}%`, !key || share <= L.blockedShare,
      `by ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}; longest ${run.seconds.toFixed(2)} s from ${run.at != null ? sec(run.at) : '-'}`);
    row('1 subject', shot, `${name} head blocked, longest`, run.seconds.toFixed(2) + ' s', `≤${L.blockedRun} s`, !key || run.seconds <= L.blockedRun);
    row('1 subject', shot, `${name} body blocked`, `${(body.filter(Boolean).length / fr.length * 100).toFixed(0)}%`, `≤${L.blockedShare * 100}%`, !key || body.filter(Boolean).length / fr.length <= L.blockedShare);
    const offShare = off.filter(Boolean).length / fr.length;
    row('1 subject', shot, `${name} out of frame`, `${(offShare * 100).toFixed(0)}%`, `≤${L.offFrameShare * 100}%`, !key || offShare <= L.offFrameShare, `first out ${fr.find((f, i) => off[i]) ? sec(fr.find((f, i) => off[i]).t) : '-'}`);
  }

  // ---- 2 real speed, 3 on the ground (every cast animal drawn in the shot)
  const names = [...new Set(frames.flatMap(f => Object.keys(f.animals)))];
  for (const name of names) {
    const fr = frames.filter(f => f.animals[name]);
    if (fr.length < 3) continue;
    const A = fr.map(f => f.animals[name]), sp = A[0].kind || kind(name); // (the species' key: cast names are the plan's, doe, elk1)
    const body = BODY_M[sp] ?? 1.5;
    let worst = { over: 0 }, worstBody = { over: 0 }, worstStride = { over: 0 }, worstScreen = { v: 0 }, maxM = 0, maxBody = 0;
    let sprintRun = 0, sprintMax = 0;
    for (let i = 1; i < A.length - 1; i++) {
      const a = A[i], p = A[i - 1], q = A[i + 1], t = fr[i].t, slow = (realT(fr[i + 1].t) - realT(fr[i - 1].t)) / (fr[i + 1].t - fr[i - 1].t);
      if (fr[i + 1].t - fr[i - 1].t > 2.5 * dt) continue; // (a gap: not drawn for a while)
      const tiles = Math.hypot(q.x - p.x, q.z - p.z) / (2 * dt) / slow;
      const mps = tiles * TILE_M, bodyMps = tiles / Math.max(.05, a.len) * body;
      // (the fastest gait of this frame and its neighbours: a speed measured across a change of gait
      // is judged by the faster one)
      const limOf = x => SPEED[sp]?.[gaitOf(sp, x)] ?? SPEED[sp]?.gallop ?? 13;
      const near = [p, a, q].reduce((b, x) => limOf(x) > limOf(b) ? x : b), gait = gaitOf(sp, near), lim = limOf(near);
      maxM = Math.max(maxM, mps); maxBody = Math.max(maxBody, bodyMps);
      if (mps / lim > worst.over) worst = { over: mps / lim, mps, lim, gait, t };
      if (bodyMps / lim > worstBody.over) worstBody = { over: bodyMps / lim, bodyMps, lim, gait, t };
      sprintRun = Math.max(bodyMps, mps) > 10 ? sprintRun + dt : 0; sprintMax = Math.max(sprintMax, sprintRun);
      if (q.legPhase != null && p.legPhase != null) {
        const hz = (q.legPhase - p.legPhase) / (2 * Math.PI) / (2 * dt) / slow, lim2 = STRIDE_HZ[gait] ?? 3.2;
        if (hz / lim2 > worstStride.over) worstStride = { over: hz / lim2, hz, lim: lim2, gait, t };
      }
      // the frame a still camera sees: this frame's camera, where the animal is a frame later
      const cam = fr[i].cam;
      if (cam.fov && inFrame(a.bodyScreen)) {
        const s0 = project(cam, a.body), s1 = project(cam, q.body);
        if (s0.depth > 0 && s1.depth > 0) { const v = Math.abs(s1.x - s0.x) / 2 / dt / slow; if (v > worstScreen.v) worstScreen = { v, t }; }
      }
    }
    if (!frames[0].eye) continue; // (the map view shows the game at its own pace: only eye-level shots are judged on real speed)
    row('2 speed', shot, `${name} ground speed`, `${maxM.toFixed(1)} m/s`, `${worst.lim ?? '-'} (${worst.gait ?? '-'})`, worst.over <= 1,
      `${worst.mps?.toFixed(1)} m/s at ${worst.t != null ? sec(worst.t) : '-'} while ${worst.gait}, limit ${worst.lim}`);
    row('2 speed', shot, `${name} speed by body lengths`, `${maxBody.toFixed(1)} m/s`, `${worstBody.lim ?? '-'} (${worstBody.gait ?? '-'})`, worstBody.over <= 1,
      `${worstBody.bodyMps?.toFixed(1)} m/s-equivalent (${(worstBody.bodyMps / body).toFixed(1)} body lengths/s) at ${worstBody.t != null ? sec(worstBody.t) : '-'}`);
    if (SPRINT_SECONDS[sp]) row('2 speed', shot, `${name} sprint length`, sprintMax.toFixed(1) + ' s', `≤${SPRINT_SECONDS[sp]} s`, sprintMax <= SPRINT_SECONDS[sp]);
    if (worstStride.hz != null) row('2 speed', shot, `${name} leg cycle`, `${worstStride.hz.toFixed(1)} Hz`, `${worstStride.lim} (${worstStride.gait})`, worstStride.over <= 1, `at ${sec(worstStride.t)}`);
    if (worstScreen.v) row('2 speed', shot, `${name} across the frame`, `${worstScreen.v.toFixed(2)} w/s`, `≤${L.screenWidths}`, worstScreen.v <= L.screenWidths, `at ${sec(worstScreen.t)} (fov ${fr[0].cam.fov?.toFixed(0)}°)`);

    // 3 the ground: the highest ground under any hoof against the feet's level
    let sink = { v: 0 }, float = { v: 0 }, sinkFrames = 0, simGap = 0;
    for (let i = 0; i < A.length; i++) {
      const a = A[i]; if (!a.drawn || a.leap) continue;
      const hi = Math.max(...a.feet) - (a.crouch || 0); // (a stalking crouch is declared, like a leap: see the probe)
      if (hi > sink.v) sink = { v: hi, t: fr[i].t, feet: a.feet };
      if (hi > L.sink) sinkFrames++;
      if (-hi > float.v) float = { v: -hi, t: fr[i].t };
      simGap = Math.max(simGap, Math.abs(a.groundSim - a.y));
    }
    row('3 ground', shot, `${name} hooves sunk`, `${sink.v.toFixed(3)}${sinkFrames ? ` (${(sinkFrames / A.length * 100).toFixed(0)}%)` : ''}`, `≤${L.sink}`, sink.v <= L.sink,
      `deepest at ${sink.t != null ? sec(sink.t) : '-'}, feet ${JSON.stringify(sink.feet)} (front, front, back, back); feet level vs the sim's ground up to ${simGap.toFixed(3)}`);
    row('3 ground', shot, `${name} floating`, float.v.toFixed(3), `≤${L.float}`, float.v <= L.float, `at ${float.t != null ? sec(float.t) : '-'}`);
  }

  // ---- 4 chase continuity
  const P = PREDATOR, inShot = frames.filter(f => f.animals[P.name] && f.animals[P.prey]);
  if (inShot.length && frames[0].eye) {
    // shown before it attacks: across the film's shots, up to the attack
    if (shot === LAYERS.find(l => l.from <= P.attacks && l.to > P.attacks)?.name) {
      let shown = 0;
      for (const l of LAYERS) for (const f of probes[l.name] || []) if (f.t < P.attacks && f.t >= l.from && f.t < l.to && seen(f.animals[P.name])) shown += dt;
      row('4 chase', shot, `${P.name} seen before attack`, shown.toFixed(2) + ' s', `≥${L.seenBefore} s`, shown >= L.seenBefore, `attacks at ${sec(P.attacks)}`);
    }
    // pops up: first seen mid-shot, not from behind cover nor from the edge
    const pops = [];
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i].animals[P.name], p = frames[i - 1].animals[P.name];
      if (!a || !seen(a) || frames[i].t < layer.from + .2) continue;
      if (p && seen(p)) continue;
      const fromCover = p && inFrame(p.bodyScreen) && p.bodyBlock, fromEdge = Math.abs(a.bodyScreen.x) > L.popEdge || Math.abs(a.bodyScreen.y) > L.popEdge;
      if (!fromCover && !fromEdge) pops.push(`${sec(frames[i].t)} at x ${a.bodyScreen.x.toFixed(2)}${p ? (inFrame(p.bodyScreen) ? ' (in the open a frame before, not drawn)' : ' (out of frame a frame before)') : ''}`);
    }
    row('4 chase', shot, `${P.name} pops up mid-shot`, String(pops.length), '0', pops.length === 0, pops.slice(0, 3).join('; '));
    // never ahead of its prey along the chase (once it attacks)
    let ahead = { v: -Infinity }, aheadFrames = 0, n = 0;
    for (let i = 1; i < inShot.length; i++) {
      const f = inShot[i], d = f.animals[P.prey], c = f.animals[P.name], dp = inShot[i - 1].animals[P.prey];
      if (f.t < P.attacks) continue;
      const vx = d.x - dp.x, vz = d.z - dp.z, vl = Math.hypot(vx, vz);
      if (vl < 1e-4) continue;
      n++;
      const along = ((c.x - d.x) * vx + (c.z - d.z) * vz) / vl;
      if (along > ahead.v) ahead = { v: along, t: f.t };
      if (along > L.ahead) aheadFrames++;
    }
    if (n) row('4 chase', shot, `${P.name} ahead of ${P.prey}`, `${ahead.v.toFixed(2)} tiles${aheadFrames ? ` (${(aheadFrames / n * 100).toFixed(0)}%)` : ''}`, `≤${L.ahead}`, ahead.v <= L.ahead, `most at ${sec(ahead.t)}`);
  }

  // ---- 5 camera
  const C = frames.map(f => f.cam), eye = frames[0].eye;
  const pos = C.map(c => c.pos), dir = C.map(c => c.dir), look = C.map(c => c.look);
  const diff = (arr, k) => arr.slice(k).map((v, i) => v.map((x, j) => (x - arr[i][j]) / dt));
  const mag = v => Math.hypot(...v);
  const vel = diff(pos, 1), acc = diff(vel, 1), jerk = diff(acc, 1);
  const maxOf = (arr, f, off) => arr.reduce((b, v, i) => f(v) > b.v ? { v: f(v), t: frames[i + off].t } : b, { v: 0, t: null });
  // the look direction's yaw and pitch: turn rate (°/s), its change and its change's change
  const ang = dir.map(d => [Math.atan2(d[2], d[0]), Math.asin(Math.max(-1, Math.min(1, d[1])))]);
  const turn = ang.slice(1).map((a, i) => { let dy = a[0] - ang[i][0]; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); return [deg(dy) / dt * Math.cos(a[1]), deg(a[1] - ang[i][1]) / dt]; });
  const tAcc = diff(turn, 1), tJerk = diff(tAcc, 1);
  const roll = maxOf(C.map(c => [deg(c.roll)]), v => Math.abs(v[0]), 0);
  if (eye) {
    const sp = maxOf(vel, v => mag(v) * TILE_M, 1), ac = maxOf(acc, v => mag(v) * TILE_M, 2), je = maxOf(jerk, v => mag(v) * TILE_M, 3);
    row('5 camera', shot, 'speed', `${sp.v.toFixed(1)} m/s`, `≤${L.camSpeed}`, sp.v <= L.camSpeed, `at ${sp.t != null ? sec(sp.t) : '-'}`);
    row('5 camera', shot, 'acceleration', `${ac.v.toFixed(1)} m/s²`, `≤${L.camAccel}`, ac.v <= L.camAccel, `at ${ac.t != null ? sec(ac.t) : '-'}`);
    row('5 camera', shot, 'jerk', `${je.v.toFixed(0)} m/s³`, `≤${L.camJerk}`, je.v <= L.camJerk, `at ${je.t != null ? sec(je.t) : '-'}`);
  } else {
    // the map view: how fast the ground slides across the screen
    const pan = vel.reduce((b, v, i) => { const f = frames[i + 1], w = f.view.vw / f.view.ppu, s = Math.hypot(v[0], v[2]) / w; return s > b.v ? { v: s, t: f.t } : b; }, { v: 0, t: null });
    row('5 camera', shot, 'map pan', `${pan.v.toFixed(2)} w/s`, `≤${L.mapPan}`, pan.v <= L.mapPan, `at ${pan.t != null ? sec(pan.t) : '-'}`);
  }
  const tr = maxOf(turn, mag, 1), ta = maxOf(tAcc, mag, 2), tj = maxOf(tJerk, mag, 3);
  row('5 camera', shot, 'turn rate', `${tr.v.toFixed(0)} °/s`, `≤${L.turnRate}`, tr.v <= L.turnRate, `at ${tr.t != null ? sec(tr.t) : '-'}`);
  row('5 camera', shot, 'turn change', `${ta.v.toFixed(0)} °/s²`, `≤${L.turnAccel}`, ta.v <= L.turnAccel, `at ${ta.t != null ? sec(ta.t) : '-'}`);
  row('5 camera', shot, 'turn shudder', `${tj.v.toFixed(0)} °/s³`, `≤${L.turnJerk}`, tj.v <= L.turnJerk, `at ${tj.t != null ? sec(tj.t) : '-'}`);
  row('5 camera', shot, 'roll', `${roll.v.toFixed(2)}°`, `≤${L.roll}`, roll.v <= L.roll);
  if (eye) {
    // the look point against its own trend (a straight line through its last two places): a sudden new target
    let jump = { v: 0 }, jumps = 0;
    for (let i = 2; i < look.length; i++) {
      const pred = look[i - 1].map((x, j) => 2 * x - look[i - 2][j]), off = Math.hypot(look[i][0] - pred[0], look[i][2] - pred[2]);
      if (off > jump.v) jump = { v: off, t: frames[i].t };
      if (off > L.lookJump) jumps++;
    }
    row('5 camera', shot, 'look point jumps', `${jumps} (worst ${jump.v.toFixed(2)})`, `0 over ${L.lookJump}`, jumps === 0, `worst at ${jump.t != null ? sec(jump.t) : '-'}`);
  }
}

// ------------------------------------------------------------------ the table
const w = [10, 9, 30, 18, 16];
const line = r => [r.check.padEnd(w[0]), r.shot.padEnd(w[1]), r.what.padEnd(w[2]), String(r.value).padEnd(w[3]), String(r.limit).padEnd(w[4]), r.pass ? 'ok' : 'FAIL'].join(' ');
console.log(line({ check: 'check', shot: 'shot', what: 'measure', value: 'value', limit: 'limit', pass: true }).replace(/ok$/, 'result'));
for (const r of rows) console.log(line(r));
const failed = rows.filter(r => !r.pass);
const byCheck = [...new Set(rows.map(r => r.check))].map(c => `${c}: ${rows.filter(r => r.check === c && !r.pass).length ? 'FAIL' : 'ok'}`);
console.log('\n' + byCheck.join(' | '));
if (flag('detail') && details.length) console.log('\n' + details.join('\n'));
await mkdir(root + 'dist/intro-film', { recursive: true });
await writeFile(root + 'dist/intro-film/motion-report.json', JSON.stringify({ limits: L, speed: SPEED, rows, details }, null, 2) + '\n');
if (failed.length) { console.log(`\n${failed.length} of ${rows.length} measures failed (dist/intro-film/motion-report.json; --detail for when)`); process.exitCode = 1; }
else console.log(`\nall ${rows.length} measures pass`);
