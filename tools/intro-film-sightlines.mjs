// The intro film's shot list, checked before anything is staged (film rework F2). Reads the plan
// (tools/intro-film-plan.mjs) and the start game's real land (the film studio's `forest` layer in
// headless Chrome: terrain mesh, trunks as flora drew them, logs, bushes), and for every planned shot:
//   - sight lines from the camera to each subject's head and body, every 0.1 s, through trunks, logs,
//     the drawn terrain and bushes (tools/intro-film-probe.mjs's blocker, the same test the motion
//     check uses on the filmed frames)
//   - the subject in the frame (16:9 at the shot's lens) and the camera clear of trunks
//   - the animals' speeds in real seconds against the motion check's limits, the cougar never ahead
//     of the doe, every animal within 9 tiles of the farm (f1.md: further out it is drawn sunk)
//   - the camera's speed and pan rate
// It also writes the land round the film for the top-down map (tools/film-shots.html):
// tools/intro-film-map.json, with these results in it. No images, nothing drawn on the GPU.
// (Not named *-check.mjs: it needs a GPU browser, and those join the headless PR suite.)
//
//   nice -n 15 node tools/intro-film-sightlines.mjs     probe the land, check, write the map data (~5 s)
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SHOTS, ANIMALS, POSES, SLOWMO, TILE_M, realAt, filmAt, partsOf, cameraAt, animalAt } from './intro-film-plan.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const OUT = root + 'tools/intro-film-map.json';
const STEP = .1; // film seconds between samples
const ASPECT = 16 / 9;
// real speed limits, m/s, by pose (the motion check's: tools/intro-film-motion.mjs SPEED)
const LIMIT = { browse: 1.8, alert: 1.8, run: 13, leap: 13, crouch: 1, creep: 1, rush: 18, pounce: 18, stand: 1.5, graze: 1.5, walk: 1.5 };
const SPRINT_SECONDS = 5, FARM_REACH = 9;
const CAM = { speed: 15, turn: 40 }; // m/s, °/s (motion check limits)

// ------------------------------------------------------------------ the samples to test
const samples = [];
for (const shot of SHOTS) {
  if (!shot.camera || shot.camera.map || !shot.subjects) continue;
  for (let t = shot.from; t <= shot.to + 1e-6; t += STEP) {
    const cam = cameraAt(shot, t), real = realAt(t);
    for (const name of shot.subjects) { const p = partsOf(name, real); samples.push({ shot: shot.n, t: +t.toFixed(2), name, cam, head: p.head, body: p.body, pose: p.pose }); }
  }
}

// ------------------------------------------------------------------ the land, and the sight lines
let land, lines;
const { openBrowser } = await import('./browser-session.mjs');
const b = await openBrowser({ label: 'intro-film-sightlines', software: false, width: 640, height: 360 });
try {
  await b.navigate('/tools/intro-film.html?layer=forest');
  await b.waitFor('window.introFilm?.ready', 'Intro film forest layer', 600000);
  const error = await b.evaluate('window.introFilm.error'); if (error) throw Error(error);
  const res = await b.evaluate(`(async () => {
    const g = introFilm.game, r = introFilm.renderer, w = g.world;
    const P = await import('/tools/intro-film-probe.mjs');
    const { isFall } = await import('/js/maps/landform.js');
    const { F, T } = await import('/js/config.js');
    const box = { x0: 30, x1: 96, z0: -14, z1: 46 };
    const ground = P.meshGround(r), ob = P.obstacles(r, g, box);
    const samples = ${JSON.stringify(samples)};
    const at = ([x, y, up]) => ({ x, y: ground(x, y) + up, z: y });
    const lines = samples.map(s => {
      const o = at(s.cam.pos);
      const near = ob.trunks.reduce((m, t) => Math.min(m, Math.hypot(o.x - t.x, o.z - t.z) - t.r), 9);
      return { head: P.blocker(o, at(s.head), ob, ground), body: P.blocker(o, at(s.body), ob, ground), camGround: +(ground(s.cam.pos[0], s.cam.pos[1])).toFixed(3),
        headY: +(ground(s.head[0], s.head[1]) + s.head[2]).toFixed(3), bodyY: +(ground(s.body[0], s.body[1]) + s.body[2]).toFixed(3), lookY: +(ground(s.cam.look[0], s.cam.look[1]) + s.cam.look[2]).toFixed(3), trunkGap: +near.toFixed(3) };
    });
    // the land for the map: tile by tile (height, terrain, fence, falls, shrubs and ground cover), trunks, logs
    const B = g.border, names = g.catalog.plants, nm = id => id ? (names[id]?.key || null) : null;
    const tiles = [];
    for (let y = box.z0; y < box.z1; y++) for (let x = box.x0; x < box.x1; x++) {
      const inside = w.inb(x, y), i = inside ? w.idx(x, y) : -1, bi = inside ? -1 : B.bi(x, y);
      const terrain = inside ? w.terrain[i] : bi >= 0 ? B.terrain[bi] : -1;
      tiles.push([x, y, +r.heightAtScene(x + .5, y + .5).toFixed(2), terrain, inside && w.feature[i] === F.FENCE ? 1 : 0, inside && isFall(w, i) ? 1 : 0,
        nm(inside ? w.shrub[i] : bi >= 0 ? B.shrub[bi] : 0)]);
    }
    const land = { box, w: w.w, h: w.h, start: r.startView, tiles,
      trunks: ob.trunks.map(t => [+t.x.toFixed(2), +t.z.toFixed(2), +t.r.toFixed(3)]),
      logs: ob.logs.map(l => [+l.cx.toFixed(2), +l.cz.toFixed(2), +l.dx.toFixed(3), +l.dz.toFixed(3)]) };
    return { lines, land };
  })()`, 300000);
  b.assertHealthy();
  lines = res.lines; land = res.land;
} finally { await b.close(); }

// ------------------------------------------------------------------ judging
const deg = r => r * 180 / Math.PI;
const report = { shots: {}, animals: {}, failures: [], notes: [] };
const fail = msg => report.failures.push(msg);
// frame position of a point for a camera (pos and look in scene coordinates)
function project(pos, look, fov, p) {
  const f = [look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]], fl = Math.hypot(...f); f.forEach((v, i) => f[i] = v / fl);
  let rx = -f[2], rz = f[0]; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
  const ux = -rz * f[1], uy = rz * f[0] - rx * f[2], uz = rx * f[1];
  const d = [p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]], depth = d[0] * f[0] + d[1] * f[1] + d[2] * f[2], k = Math.tan(fov * Math.PI / 360);
  return { x: (d[0] * rx + d[2] * rz) / depth / k / ASPECT, y: (d[0] * ux + d[1] * uy + d[2] * uz) / depth / k, depth };
}
samples.forEach((s, i) => {
  const L = lines[i], sc = ([x, y], up) => [x, up, y];
  const pos = sc(s.cam.pos, L.camGround + s.cam.pos[2]), look = sc(s.cam.look, L.lookY);
  s.headFrame = project(pos, look, s.cam.fov, sc(s.head, L.headY));
  s.bodyFrame = project(pos, look, s.cam.fov, sc(s.body, L.bodyY));
  s.dist = Math.hypot(s.head[0] - s.cam.pos[0], s.head[1] - s.cam.pos[1]);
  Object.assign(s, L);
});
const inFrame = f => f.depth > 0 && Math.abs(f.x) <= .95 && Math.abs(f.y) <= .95;
for (const shot of SHOTS) {
  const out = report.shots[shot.n] = { title: shot.title, from: shot.from, to: shot.to, subjects: {} };
  const ss = samples.filter(s => s.shot === shot.n);
  for (const name of shot.subjects || []) {
    const mine = ss.filter(s => s.name === name);
    if (!mine.length) continue;
    const share = k => mine.filter(s => s[k]).length / mine.length;
    const by = {}; mine.forEach(s => { if (s.head) by[s.head] = (by[s.head] || 0) + 1; });
    const frame = mine.filter(s => inFrame(s.headFrame) || inFrame(s.bodyFrame)).length / mine.length;
    const r = out.subjects[name] = {
      samples: mine.length, headBlocked: +share('head').toFixed(3), bodyBlocked: +share('body').toFixed(3), blockers: by,
      inFrame: +frame.toFixed(3), distance: [+Math.min(...mine.map(s => s.dist)).toFixed(2), +Math.max(...mine.map(s => s.dist)).toFixed(2)],
      headHeightInFrame: +Math.max(...mine.map(s => Math.abs(s.headFrame.y))).toFixed(2),
    };
    const key = name === shot.subjects[0];
    const when = k => { const ts = mine.filter(s => s[k]).map(s => s.t); return ts.length ? ` at ${ts[0]}–${ts[ts.length - 1]} s` : ''; };
    if (r.headBlocked > 0) fail(`shot ${shot.n} ${shot.title}: ${name}'s head blocked ${Math.round(r.headBlocked * 100)}% (${Object.keys(by).join(', ')})${when('head')}`);
    if (!key && r.bodyBlocked > 0) report.notes.push(`shot ${shot.n} ${shot.title}: ${name}'s body glimpsed past a trunk ${Math.round(r.bodyBlocked * 100)}%${when('body')} (its head stays clear)`);
    if (key && r.bodyBlocked > 0) fail(`shot ${shot.n} ${shot.title}: ${name}'s body blocked ${Math.round(r.bodyBlocked * 100)}%${when('body')}`);
    if (r.inFrame < (key ? .9 : .5)) fail(`shot ${shot.n} ${shot.title}: ${name} in frame ${Math.round(r.inFrame * 100)}%`);
  }
  // the camera: clear of trunks, its speed and pan (eye-level shots)
  if (shot.camera && !shot.camera.map) {
    const cams = [];
    for (let t = shot.from; t <= shot.to + 1e-6; t += 1 / 30) cams.push(cameraAt(shot, t));
    let speed = 0, turn = 0;
    for (let i = 1; i < cams.length; i++) {
      const a = cams[i - 1], c = cams[i];
      speed = Math.max(speed, Math.hypot(c.pos[0] - a.pos[0], c.pos[1] - a.pos[1], (c.pos[2] - a.pos[2])) * TILE_M * 30);
      const h0 = Math.atan2(a.look[1] - a.pos[1], a.look[0] - a.pos[0]), h1 = Math.atan2(c.look[1] - c.pos[1], c.look[0] - c.pos[0]);
      turn = Math.max(turn, Math.abs(deg(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)))) * 30);
    }
    const gap = Math.min(...ss.map(s => s.trunkGap));
    Object.assign(out, { cameraSpeed: +speed.toFixed(2), panRate: +turn.toFixed(1), trunkGap: ss.length ? +gap.toFixed(2) : null });
    if (speed > CAM.speed) fail(`shot ${shot.n}: camera ${speed.toFixed(1)} m/s`);
    if (turn > CAM.turn) fail(`shot ${shot.n}: pans ${turn.toFixed(0)}°/s`);
    if (ss.length && gap < .12) fail(`shot ${shot.n}: camera ${gap.toFixed(2)} from a trunk`);
  }
}
// the animals: speeds (real), sprint time, reach beyond the farm, the cougar never ahead of the doe
for (const [name, A] of Object.entries(ANIMALS)) {
  const m = A.marks, legs = [];
  let sprint = 0;
  for (let i = 1; i < m.length; i++) {
    const dt = m[i][0] - m[i - 1][0], d = Math.hypot(m[i][1] - m[i - 1][1], m[i][2] - m[i - 1][2]), v = d / Math.max(1e-6, dt) * TILE_M;
    const pose = m[i - 1][3], lim = LIMIT[pose] ?? 13;
    legs.push({ from: m[i - 1][0], to: m[i][0], pose, speed: +v.toFixed(2), limit: lim });
    if (v > lim + 1e-6) fail(`${name} ${pose} ${v.toFixed(1)} m/s between ${m[i - 1][0]} and ${m[i][0]} s (limit ${lim})`);
    if (v > 10) sprint += dt;
  }
  const reach = Math.max(...m.map(k => Math.max(-k[1], -k[2], k[1] - (land.w - 1), k[2] - (land.h - 1))));
  report.animals[name] = { legs, sprintSeconds: +sprint.toFixed(2), beyondFarm: +reach.toFixed(2) };
  if (A.species === 'cougar' && sprint > SPRINT_SECONDS) fail(`${name} sprints ${sprint.toFixed(1)} s`);
  if (reach > FARM_REACH) fail(`${name} ${reach.toFixed(1)} tiles beyond the farm`);
}
{
  // ahead: the cougar's distance along the doe's path, against the doe's, while it chases
  const doe = ANIMALS.doe.marks, along = (x, y) => {
    let best = Infinity, s = 0, at = 0;
    for (let i = 1; i < doe.length; i++) {
      const [ax, ay] = [doe[i - 1][1], doe[i - 1][2]], [bx, by] = [doe[i][1], doe[i][2]], L = Math.hypot(bx - ax, by - ay);
      if (L < 1e-6) continue;
      const u = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (L * L))), d = Math.hypot(ax + (bx - ax) * u - x, ay + (by - ay) * u - y);
      if (d < best) { best = d; at = s + u * L; }
      s += L;
    }
    return at;
  };
  let ahead = -Infinity, when = null, gap = Infinity;
  for (let r = 17; r <= 20.4; r += .02) {
    const d = animalAt('doe', r), c = animalAt('cougar', r), a = along(c.x, c.y) - along(d.x, d.y);
    if (a > ahead) { ahead = a; when = r; }
    gap = Math.min(gap, Math.hypot(d.x - c.x, d.y - c.y));
  }
  report.chase = { cougarAheadMax: +ahead.toFixed(2), at: +when.toFixed(2), closest: +gap.toFixed(2), closestM: +(gap * TILE_M).toFixed(1) };
  if (ahead > .1) fail(`cougar ${ahead.toFixed(2)} tiles ahead of the doe at ${when.toFixed(2)} s`);
}
report.slowmo = SLOWMO;
report.made = new Date().toLocaleDateString('en-CA'); // (local date, YYYY-MM-DD)

await writeFile(OUT, JSON.stringify({ land, report }));
// ------------------------------------------------------------------ print
console.log('shot  subject   head blocked  body blocked  in frame  distance (tiles)  camera m/s  pan °/s');
for (const [n, s] of Object.entries(report.shots)) for (const [name, r] of Object.entries(s.subjects))
  console.log(`${String(n).padEnd(5)} ${name.padEnd(9)} ${(Math.round(r.headBlocked * 100) + '%').padEnd(13)} ${(Math.round(r.bodyBlocked * 100) + '%').padEnd(13)} ${(Math.round(r.inFrame * 100) + '%').padEnd(9)} ${r.distance.join('–').padEnd(17)} ${String(s.cameraSpeed ?? '-').padEnd(11)} ${s.panRate ?? '-'}`);
console.log('chase:', JSON.stringify(report.chase), ' cougar sprint', report.animals.cougar.sprintSeconds, 's');
for (const [n, a] of Object.entries(report.animals)) console.log(n, 'fastest', Math.max(...a.legs.map(l => l.speed)), 'm/s; beyond farm', a.beyondFarm);
if (report.notes.length) console.log('\n  ' + report.notes.join('\n  '));
if (report.failures.length) { console.log('\nFAIL\n  ' + report.failures.join('\n  ')); process.exitCode = 1; }
else console.log('\nAll planned sight lines clear.');
