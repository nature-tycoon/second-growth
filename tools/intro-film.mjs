// Intro film studio (tools/film-intro.mjs drives it; the script is intro-film-shots.mjs).
//
//   intro-film.html?layer=<name>   films one layer: the production renderer and models, a frame at a
//                                  time on a fixed 30 fps clock, each frame handed back as a JPEG
//   intro-film.html?assemble=1     lays the layers' frames over each other, mixes the sound from the
//                                  game's recordings and encodes MP4 (H.264 + AAC) and WebM (VP9 + Opus)
//
// Staging (allowed in a film, never in play: decision 0001): in the start game the deer and the cougar
// are posed and moved along planned paths, and drawn by the game's own walker drawing (stride, gallop,
// head, crouch, the pounce arc for the deer's leap over the fence). In the restored game the elk are
// posed and then live by the simulation.
import { Renderer } from '../js/render3d/scene.js';
import { Game } from '../js/game.js';
import { SPEEDS, ANIMAL_SPEEDS } from '../js/config.js';
import { mulberry32 } from '../js/rng.js';
import { isMaleVariant } from '../js/data/animals.js';
import { PLANT } from '../js/data/plants.js';
import { isWater } from '../js/config.js';
import { travelSpeed } from '../js/sim/climb-pace.js';
import { releaseGame } from './release-fixtures.mjs';
import { posing } from './website-moment-fixtures.mjs';
import { muxMp4, muxWebm } from './video-mux.mjs';
import { FPS, SECONDS, LAYERS, TIME_OF_DAY, BEATS, SOUND } from './intro-film-shots.mjs';
import { makeProbe } from './intro-film-probe.mjs';

const DAY_CYCLE = 360; // scene.js: seconds in the renderer's day (todClock)
const RUN_SEED = 20261121; // the start game's run seed (weather, starting animals); the land is seed 1987
const params = new URLSearchParams(location.search);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
window.introFilm = { ready: false };

// ------------------------------------------------------------------ paths through the trees
// A path: points every few hundredths of a tile with their arc length, so a position can be read
// at any distance along it.
function polyline(points) {
  const out = [];
  const cr = (p0, p1, p2, p3, t) => .5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)], b = points[i], c = points[i + 1], d = points[Math.min(points.length - 1, i + 2)];
    const n = Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / .05);
    for (let k = 0; k < n; k++) out.push([cr(a[0], b[0], c[0], d[0], k / n), cr(a[1], b[1], c[1], d[1], k / n)]);
  }
  out.push(points[points.length - 1].slice());
  return out;
}
// Push a path clear of trunks (each { x, z, r }) by `room`, then smooth it, a few times over: the
// deer threads between the trunks rather than through them. The ends stay put.
function clearOfTrunks(path, trunks, room, rounds = 40) {
  for (let r = 0; r < rounds; r++) {
    for (let i = 1; i < path.length - 1; i++) {
      const p = path[i];
      for (const t of trunks) {
        const dx = p[0] - t.x, dz = p[1] - t.z, d = Math.hypot(dx, dz), need = room + t.r;
        if (d < need && d > 1e-6) { p[0] += dx / d * (need - d) * .6; p[1] += dz / d * (need - d) * .6; }
      }
    }
    const copy = path.map(p => p.slice());
    for (let i = 1; i < path.length - 1; i++) for (const k of [0, 1]) path[i][k] = (copy[i - 1][k] + 2 * copy[i][k] + copy[i + 1][k]) / 4;
  }
  return path;
}
function measure(path) {
  const s = [0];
  for (let i = 1; i < path.length; i++) s.push(s[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  return { path, s, length: s[s.length - 1] };
}
// where along it at distance d, and which way it runs there (over the next third of a tile, so a
// point nudged round a trunk doesn't swing the heading)
function along(P, d) {
  const at = d => {
    const { path, s } = P;
    d = Math.max(0, Math.min(P.length, d));
    let lo = 0, hi = s.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= d) lo = m; else hi = m; }
    const u = s[hi] > s[lo] ? (d - s[lo]) / (s[hi] - s[lo]) : 0;
    return [lerp(path[lo][0], path[hi][0], u), lerp(path[lo][1], path[hi][1], u)];
  };
  const p = at(d), a = at(d - .15), b = at(d + .35);
  return { x: p[0], y: p[1], heading: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
// A camera spot near `want` (tiles) with a clear line to `at`: not in a trunk, and no trunk across
// the sight line (the old forest has a tree on nearly every tile). Tries nearby spots, nearest first.
function clearView(trunks, want, at, room = .45) {
  const blocked = (x, y) => trunks.some(t => {
    if (Math.hypot(x - t.x, y - t.z) < room + t.r) return true;
    const dx = at[0] - x, dy = at[1] - y, L = Math.hypot(dx, dy), u = ((t.x - x) * dx + (t.z - y) * dy) / (L * L);
    if (u < 0 || u > 1 - .35 / L) return false;
    return Math.hypot(x + dx * u - t.x, y + dy * u - t.z) < t.r + .16;
  });
  for (let ring = 0; ring <= 24; ring++) for (let k = 0; k < Math.max(1, ring * 6); k++) {
    const a = k / Math.max(1, ring * 6) * Math.PI * 2, x = want[0] + Math.cos(a) * ring * .08, y = want[1] + Math.sin(a) * ring * .08;
    if (!blocked(x, y)) return [x, y];
  }
  return want;
}
const nearest = (P, x, y) => { let best = 0, bd = Infinity; P.path.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = i; } }); return P.s[best]; };
// Distance along a path at each frame: speed v (tiles a second) reached over `accel` seconds from
// `start`, and if `stop` (a distance) is given, slowing to a stand there.
function schedule(length, start, v, accel, stop = null) {
  const out = new Map();
  let d = 0, speed = 0;
  for (let f = Math.floor(start * FPS); f <= SECONDS * FPS; f++) {
    out.set(f, d);
    const t = f / FPS;
    let goal = t < start ? 0 : v * smooth(start, start + accel, t + 1 / FPS);
    if (stop != null) goal = Math.min(goal, Math.sqrt(2 * (v * v / 2.4) * Math.max(0, stop - d)));
    speed = goal; d = Math.min(stop ?? length, d + speed / FPS);
  }
  return f => out.get(f) ?? 0;
}

// ------------------------------------------------------------------ the two farms
function startGame() {
  Math.random = mulberry32(RUN_SEED);
  const g = new Game();
  g.newGame(1987, 'free', 'standard', 'pnw', RUN_SEED); // (a first visit's farm: main.js generates seed 1987)
  g.weather = 'clear'; g.snow = 0;
  return g;
}
function restoredFarm(pose) {
  const { game: g } = releaseGame('pnw', 'forest'); // (restoredGame: native forest, fence and culvert gone, creek free)
  while (g.month !== 3) g.day++; // June: the meadow green, the maples and alders in full leaf
  g.weather = 'clear'; g.snow = 0;
  return g;
}

function renderer(g) {
  const r = new Renderer(document.getElementById('view'), { catalog: g.catalog, preserveDrawingBuffer: true });
  // The look most players get: Balanced (computers with a stronger chip run High, weak ones and phones
  // Fast), shadows on, no weather.
  r.applySettings({ quality: 'balanced', qualityChosen: true, shadows: true, wind: true, dayCycle: true, weather: false });
  r.autoRes = false;
  r.drawFX = () => r.ux.clearRect(0, 0, r.ui.width, r.ui.height);
  // The first visit's start view exactly as the game takes it: main.js calls resetView() on the new
  // renderer before its first draw, so before it has a world (on PNW, with no startView, that is the
  // fallback middle, not the map-size one: s8.md). The last frame must be this view.
  r.resetView();
  r.startView = { x: r.target.x, y: r.target.z, zoom: r.zoom, az: r.az };
  return r;
}
// The eye at a point, looking at another: watch mode's eye-level view (sky, haze, close-up models),
// placed by the film rather than riding behind an animal.
// fov: the vertical field of view in degrees (the eye's own is 50; less is a longer lens).
function eyeAt(r, pos, look, fov = 50) {
  r.eyeAgent = null; r.followAgent = null; r.eyeWalk = true;
  r.eye.agentId = 'walk';
  r.eye.walk = function (move, L, aspect) {
    this.under = false;
    this.pos.set(pos.x, pos.y, pos.z); this.look.set(look.x, look.y, look.z);
    this.forward.set(look.x - pos.x, 0, look.z - pos.z).normalize();
    this.apply(aspect);
    if (Math.abs(this.camera.fov - fov) > 1e-4) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  };
}
// The top of the falls (tile 69,6): the eye stands over the plunge pool just below the lip, at the
// lip's height, looking up the creek to the forest edge, so the water runs toward it and drops away
// under the frame. Both farms use it: the restored farm's rise starts from the same view.
const FC = [69.55, 7.7], LIP = [69.5, 5.3], EYE_UP = .55;
const fallsFov = t => lerp(50, 30, smooth(25.6, 28.6, t));
function mapAt(r, x, y, zoom, az) {
  r.eyeWalk = false; r.setEyeLevel(null);
  r.zoom = zoom; r.az = r.azTarget = az; r.centerOn(x, y);
}

// ------------------------------------------------------------------ one layer
async function filmLayer(name) {
  const L = LAYERS.find(l => l.name === name);
  if (!L) throw Error('Unknown layer ' + name);
  const placed = [];
  let g, r, stage = () => {}, camera, simulate = null;
  // the animals the motion check follows (tools/intro-film-motion.mjs), and the ground it
  // gathers trunks, logs and bushes from
  let cast = {}, box = { x0: 38, x1: 90, z0: -16, z1: 30 };
  const ground = (x, y) => r.heightAtScene(x, y);
  const p3 = (x, y, up) => ({ x, y: ground(x, y) + up, z: y });

  if (L.game === 'start') {
    g = startGame();
    r = renderer(g);
    const W = g.wildlife;
    // Settle the whole land once from the forest, so the trunks' places (flora.treeSites) are known
    mapAt(r, 60, -4, 1.2, Math.PI / 4);
    settle(r, g);
    const trunks = [...r.flora.treeSites.values()].map(s => ({ x: s.transform[0], z: s.transform[2], r: .1 + .12 * Math.min(1.5, s.transform[3] || 1) }))
      .filter(t => t.z < 8 && t.x > 38 && t.x < 90);

    // ---- the chase: the deer's line through the old forest, out over the fence, away down the field
    const deerLine = measure(clearOfTrunks(polyline([
      [48.3, -8.6], [50.5, -9.8], [53.8, -7.6], [57.2, -9.0], [60.6, -6.6], [63.8, -7.4], [66.6, -4.6], [69.4, -2.6],
      [71.0, -.6], [71.4, 1.6], [71.9, 4.2], [72.8, 7.6], [75.2, 12.2], [78.6, 17.6], [81, 22],
    ]), trunks.filter(t => t.z < -.8), .34));
    const deerAt = schedule(deerLine.length, BEATS.bolt, 3.25, .45);
    // (the leap: over the fence along row 0, from where the line leaves the trees to the field)
    const leapFrom = nearest(deerLine, 70.95, -.9), leapTo = leapFrom + 1.9;
    let fenceT = null;
    for (let f = BEATS.bolt * FPS; f < SECONDS * FPS; f++) if (deerAt(f) >= leapFrom) { fenceT = f / FPS; break; }
    BEATS.fence = fenceT;
    // The cougar: from its cover onto the deer's line a little behind it, and along it to the last
    // trees, where it slows to a stand (the edge: E)
    const cover = [51.7, -10.7], E = [70.35, -1.75];
    const joinAt = 5.2, edgeAt = nearest(deerLine, 69.2, -2.7);
    const catLine = measure(clearOfTrunks(polyline([cover, ...deerLine.path.filter((_, i) => deerLine.s[i] >= joinAt && deerLine.s[i] <= edgeAt).filter((_, i) => i % 6 === 0), E]),
      trunks.filter(t => t.z < -1.2), .3));
    const catAt = schedule(catLine.length, BEATS.breakCover, 2.65, .5, catLine.length);
    let catStop = null; for (let f = Math.ceil(BEATS.breakCover * FPS); f < SECONDS * FPS; f++) if (catAt(f) >= catLine.length - .06) { catStop = f / FPS; break; }

    // a doe (no antlers in March) and an adult cougar
    const doe = g.catalog.animal.deer, cat = g.catalog.animal.cougar;
    while (isMaleVariant(doe, { id: W.nextId, age: 600 })) W.nextId++;
    const deer = W.spawn(doe, 48, -9, { silent: true, age: 600 });
    const cougar = W.spawn(cat, 51, -11, { silent: true, age: 700 });
    const browseTile = (() => { const w = g.world; for (let i = 0; i < w.n; i++) if (w.shrub[i] && w.shrubG[i] > .4) return i; return 0; })();
    for (const a of [deer, cougar]) Object.assign(a, { wait: 1e9, hunger: 0, thirst: 0, path: null });
    cast = { deer, cougar };
    const last = new Map();
    const place = (a, def, x, y, heading) => {
      const p = last.get(a.id), moved = p ? Math.hypot(x - p.x, y - p.y) : 0;
      // (the legs keep the game's own pace for the ground covered: stride.js groundPace = 1)
      a.phase += moved * 6 * (def.sprite.beat ?? 1) / Math.max(.05, travelSpeed(def));
      a.x = a.tx = x; a.y = a.ty = y; if (heading != null) a.heading = heading;
      last.set(a.id, { x, y });
    };
    stage = f => {
      const t = f / FPS;
      // the deer: browsing ferns, head up at headUp, then away
      if (t < BEATS.bolt) {
        place(deer, doe, 48.3, -8.6, along(deerLine, .9).heading);
        if (t < BEATS.headUp) Object.assign(deer, { state: 'forage', forage: { food: 'forb', i: browseTile }, alertT: 0, run: 1 });
        else Object.assign(deer, { state: 'idle', forage: null, alertT: 99, run: 1 });
      } else {
        const d = deerAt(f), p = along(deerLine, d);
        place(deer, doe, p.x, p.y, p.heading);
        const u = (d - leapFrom) / (leapTo - leapFrom);
        if (u > 0 && u < 1) Object.assign(deer, { state: 'hunt', hunt: { leap: { u, arc: .75 } }, run: 2.6 });
        else Object.assign(deer, { state: 'flee', hunt: null, forage: null, alertT: 99, run: 2.6 });
      }
      // the cougar: low in cover, then the rush, then a stand at the last trees, watching
      const c = catAt(f), q = along(catLine, c);
      const toward = Math.atan2(-8.6 - cover[1], 48.3 - cover[0]);
      if (t < BEATS.breakCover) { place(cougar, cat, cover[0], cover[1], toward); Object.assign(cougar, { state: 'hunt', hunt: { phase: 'creep' }, run: .5 }); }
      else if (c < catLine.length - .06) {
        place(cougar, cat, q.x, q.y, q.heading);
        Object.assign(cougar, { state: 'hunt', hunt: { phase: t < BEATS.breakCover + .7 ? 'creep' : 'rush' }, run: 2.4, alertT: 0 });
      } else {
        // (watching the deer go: it turns its head and shoulders after it, slowly)
        const dp = along(deerLine, deerAt(f)), look = Math.atan2(dp.y - E[1], dp.x - E[0]);
        const h = cougar.heading + Math.atan2(Math.sin(look - cougar.heading), Math.cos(look - cougar.heading)) * .04;
        place(cougar, cat, E[0], E[1], h); Object.assign(cougar, { state: 'idle', hunt: null, alertT: 99, run: 1 });
      }
    };

    // ---- the cameras
    const fallsLook = [E[0] + .3, E[1] + .2];
    const eye = { pos: null, look: null };
    // the forest shot: from the south of the browsing deer, a slow push in, the sight line clear of trunks
    // (the sight line runs to the deer's head, a little ahead of its middle along the way it faces)
    const deerSpot = [48.3, -8.6], h0 = along(deerLine, .9).heading, head = [deerSpot[0] + Math.cos(h0) * .3, deerSpot[1] + Math.sin(h0) * .3];
    const c0 = clearView(trunks, [47.85, -6.2], head), c1 = clearView(trunks, [lerp(c0[0], head[0], .18), lerp(c0[1], head[1], .18)], head);
    if (name === 'forest') camera = f => {
      const t = f / FPS, u = smooth(L.from, L.to, t);
      eyeAt(r, p3(lerp(c0[0], c1[0], u), lerp(c0[1], c1[1], u), .46), p3(lerp(deerSpot[0], head[0], .5), lerp(deerSpot[1], head[1], .5), .34 + .1 * smooth(BEATS.headUp - .4, BEATS.headUp + .8, t)));
    };
    if (name === 'chase') {
      // the forest shot's last framing, then riding alongside the chase on its right (south) side
      const start = { pos: p3(c1[0], c1[1], .46), look: p3(lerp(deerSpot[0], head[0], .5), lerp(deerSpot[1], head[1], .5), .44) };
      let pos = { ...start.pos }, look = { ...start.look };
      camera = f => {
        const t = f / FPS, dt = 1 / FPS, k = smooth(BEATS.bolt, BEATS.bolt + 1.2, t);
        const dp = along(deerLine, deerAt(f)), cp = along(catLine, catAt(f));
        const dx = Math.cos(dp.heading), dy = Math.sin(dp.heading);
        const lx = lerp(cp.x, dp.x, .62), ly = lerp(cp.y, dp.y, .62);
        const [gx, gy] = clearView(trunks, [dp.x - dx * .9 - dy * 1.45, dp.y - dy * .9 + dx * 1.45], [lx, ly], .4);
        const kp = 1 - Math.exp(-dt * 2.2 * k), kl = 1 - Math.exp(-dt * 3.5 * k);
        pos.x += (gx - pos.x) * kp; pos.z += (gy - pos.z) * kp; pos.y = ground(pos.x, pos.z) + .5;
        look.x += (lx - look.x) * kl; look.z += (ly - look.z) * kl; look.y = ground(look.x, look.z) + .38;
        eyeAt(r, pos, look);
      };
    }
    if (name === 'falls') {
      let look = null;
      camera = f => {
        const t = f / FPS, dt = 1 / FPS;
        const dp = along(deerLine, deerAt(f)), cp = along(catLine, catAt(f));
        // (between the two while the deer is near, then settling on the cougar at the edge: the
        // last framing is fixed, so the restored farm's rise starts from exactly this view)
        const near = Math.min(1, 9 / Math.max(1, Math.hypot(dp.x - FC[0], dp.y - FC[1]) + Math.hypot(dp.x - cp.x, dp.y - cp.y) * .3));
        const gx = lerp(lerp(cp.x, dp.x, .45 * near + .1), fallsLook[0], smooth(26.5, 29.2, t));
        const gy = lerp(lerp(cp.y, dp.y, .45 * near + .1), fallsLook[1], smooth(26.5, 29.2, t));
        if (!look) look = { x: 70.8, z: -.6 };
        const kl = 1 - Math.exp(-dt * 2.4);
        look.x += (gx - look.x) * kl; look.z += (gy - look.z) * kl;
        if (t >= 29.2) { look.x = fallsLook[0]; look.z = fallsLook[1]; }
        eyeAt(r, { x: FC[0], y: ground(LIP[0], LIP[1]) + EYE_UP, z: FC[1] }, { x: look.x, y: ground(look.x, look.z) + .45, z: look.z }, fallsFov(t));
      };
    }
    if (name === 'start') {
      // The first visit's start view, exactly (Renderer.resetView), with the farm's own animals
      // living, and the posed pair gone
      W.remove(deer, 'film'); W.remove(cougar, 'film'); cast = {};
      stage = () => {};
      simulate = film => { let days = film * ANIMAL_SPEEDS[1]; while (days > 0) { const d = Math.min(days, .05); g.wildlife.update(d); g.visitors.update(d); days -= d; } };
      g.speed = 1; g.wildlife.lifePace = SPEEDS[1] / ANIMAL_SPEEDS[1];
      camera = () => { const v = r.startView; mapAt(r, v.x, v.y, v.zoom, v.az); };
    }
    window.introFilm.paths = { deer: deerLine.length, cougar: catLine.length, fence: fenceT, catStop, forestCamera: [c0, c1], trunks: trunks.length, hash: deerLine.path.reduce((h, p) => (h * 31 + Math.round(p[0] * 100) + Math.round(p[1] * 100) * 7) % 1e9, 7) };
    g.speed = 1; // (the walker drawing strides only while the game runs; nothing here steps the simulation but `start`)
  } else {
    g = restoredFarm();
    const pose = posing(g, placed);
    // Clear the crowns round the falls camera and between it and the edge, as staging (the eye would
    // stand inside a tree): the rise starts from the falls view
    const w = g.world;
    for (let y = 5; y <= 11; y++) for (let x = 66; x <= 73; x++) { const i = w.idx(x, y); if (!isWater(w.terrain[i])) { w.tree[i] = 0; w.treeG[i] = 0; w.shrub[i] = 0; } }
    // Thirty years on, the woods north and east have closed in (the fixture's restored farm plants them
    // thinly, as a map-audit reference): conifers on about half the open tiles there, staging only
    const rnd = mulberry32(1987), conifers = ['fir', 'fir', 'cedar', 'hemlock'].map(k => PLANT[k]);
    for (let i = 0; i < w.n; i++) {
      const x = i % w.w, y = (i / w.w) | 0;
      if (!(y < 28 || x > 72) || w.tree[i] || isWater(w.terrain[i]) || w.struct[i] >= 0 || w.feature[i] || (x >= 66 && x <= 73 && y >= 5 && y <= 11)) continue;
      if (rnd() < .5) { const p = conifers[Math.floor(rnd() * conifers.length)]; w.setPlant(i, p, .75 + rnd() * .25); w.treeAge[i] = (p.matureAge ?? 20) * 120; }
    }
    // Roosevelt elk in the meadow below the start view's middle, then left to live (watch pace off:
    // normal pace, so they graze rather than hurry); a black-tailed doe and fawn by the forest
    const herd = [pose('elk', 49, 31, 'land', -.4), pose('elk', 50, 33, 'land', .3), pose('elk', 47, 32, 'land', -1.2), pose('elk', 52, 31, 'land', .9), pose('elk', 48, 34, 'land', 2.2),
      pose('deer', 42, 36, 'land', .2)];
    herd.forEach((a, n) => { a.wait = .05 + n * .04; });
    cast = Object.fromEntries(herd.map((a, n) => [n < 5 ? 'elk' + (n + 1) : 'deer', a])); box = { x0: 36, x1: 80, z0: -4, z1: 40 };
    g.wildlife.recount();
    r = renderer(g); r.setWorld(g);
    g.speed = 1; g.wildlife.lifePace = SPEEDS[1] / ANIMAL_SPEEDS[1];
    simulate = film => { let days = film * ANIMAL_SPEEDS[1]; while (days > 0) { const d = Math.min(days, .05); g.wildlife.update(d); g.visitors.update(d); days -= d; } };
    const fallsLook = [70.65, -1.55];
    if (name === 'rise') camera = f => {
      const t = f / FPS, u = smooth(L.from, L.to, t), v = smooth(L.from + .3, L.to, t);
      // from the falls view up and back, turning to look north-west and down like the usual view (34°)
      const h0 = Math.atan2(fallsLook[1] - FC[1], fallsLook[0] - FC[0]), h1 = Math.atan2(-1, -1);
      const yaw = h0 + Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)) * v;
      const pitch = lerp(Math.atan2(ground(fallsLook[0], fallsLook[1]) + .45 - ground(LIP[0], LIP[1]) - EYE_UP, Math.hypot(fallsLook[0] - FC[0], fallsLook[1] - FC[1])), -34 * Math.PI / 180, v);
      const x = lerp(FC[0], 73, u), y = lerp(FC[1], 14.5, u), base = ground(LIP[0], LIP[1]) + EYE_UP;
      const pos = { x, y: base + lerp(0, 9, u * u * (3 - 2 * u)), z: y }, c = Math.cos(pitch);
      eyeAt(r, pos, { x: pos.x + Math.cos(yaw) * c * 5, y: pos.y + Math.sin(pitch) * 5, z: pos.z + Math.sin(yaw) * c * 5 }, lerp(fallsFov(L.from), 50, smooth(L.from, L.from + 1.6, t)));
    };
    if (name === 'overview') {
      const end = r.startView;
      camera = f => {
        const t = f / FPS, u = smooth(L.from, 36.6, t), e = u; // (eased in and out, then held)
        mapAt(r, lerp(62.5, end.x, e), lerp(5.5, end.y, e), Math.exp(lerp(Math.log(1.35), Math.log(end.zoom), e)), end.az);
      };
    }
  }
  const tod = TIME_OF_DAY[name];
  const first = Math.round(L.from * FPS), lastFrame = Math.min(SECONDS * FPS - 1, Math.round(L.to * FPS) - 1);
  // the restored farm's animals live from 30 s (the rise), so the overview finds them where the rise left them
  const simFrom = Math.round(30 * FPS);
  if (simulate) {
    const from = L.game === 'restored' ? simFrom : first;
    for (let f = from; f < first; f++) simulate(1 / FPS);
  }
  stage(first); camera(first);
  settle(r, g);
  let clock = 1e6;
  // One frame staged and drawn. Frames must come in order (the cameras ease from the last frame).
  // step: film frames this many apart (a rough cut at 10 fps films every third), the world's clock
  // and the simulation still run through the frames skipped.
  let at = first;
  function advance(f) {
    for (; at <= f; at++) {
      const t = at / FPS;
      if (at > first && simulate) simulate(1 / FPS);
      stage(at); camera(at);
      r.todClock = lerp(tod[0], tod[1], (t - L.from) / (L.to - L.from)) * DAY_CYCLE;
      clock += 1000 / FPS; r.diagnosticTime = clock;
      if (at < f) { const draw = r.gl.render; r.gl.render = () => {}; r.draw(g, ui, at > first ? 1 / FPS : 0); r.gl.render = draw; continue; } // (posed, not drawn)
      r.draw(g, ui, at > first ? 1 / FPS : 0);
    }
  }
  async function frame(f) {
    advance(f); r.gl.getContext().finish();
    return jpeg(compose(r), .93);
  }
  // The probe (intro-film-probe.mjs): the frame staged and posed by the game's drawing, nothing drawn
  // on the GPU, and the camera, animals and sight lines read back
  let reader = null;
  function probe(f) {
    if (!reader) { r.gl.render = () => {}; reader = makeProbe(r, g, cast, box); }
    advance(f);
    return reader(f / FPS);
  }
  const info = () => ({
    target: { x: r.target.x, y: r.target.y, z: r.target.z }, zoom: r.zoom, az: r.az, eye: r.eyeOn ? { pos: r.eye.pos.toArray(), look: r.eye.look.toArray() } : null,
    timeOfDay: r.todClock / DAY_CYCLE, width: r.gl.domElement.width, height: r.gl.domElement.height, ppu: r.ppu,
  });
  return { first, last: lastFrame, frame, probe, info, game: g, renderer: r };
}

const ui = { clean: true, overlay: 'none' };
function settle(r, g) {
  let clock = 0;
  for (let n = 0; n < 240 && (n < 8 || r.floraPending || r.flora.waitingRegions?.size); n++) { clock += 500; r.diagnosticTime = clock; r.draw(g, ui, 0); }
}
// The page backdrop past the map's edge, as photo mode paints it (Renderer.capture)
function compose(r) {
  const c = r.gl.domElement, W = c.width, H = c.height;
  const out = compose.canvas ||= new OffscreenCanvas(W, H), ctx = out.getContext('2d');
  const bg = ctx.createRadialGradient(W / 2, H * .35, 0, W / 2, H * .35, Math.hypot(W, H) * .6);
  bg.addColorStop(0, '#56715a'); bg.addColorStop(.55, '#34493a'); bg.addColorStop(1, '#1f2c24');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.drawImage(c, 0, 0);
  return out;
}
async function jpeg(canvas, quality, width = canvas.width) {
  let source = canvas;
  if (width !== canvas.width) { source = new OffscreenCanvas(width, Math.round(canvas.height * width / canvas.width)); source.getContext('2d').drawImage(canvas, 0, 0, source.width, source.height); }
  return new Uint8Array(await (await source.convertToBlob({ type: 'image/jpeg', quality })).arrayBuffer());
}
function base64(b) { let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(s); }

// ------------------------------------------------------------------ assembly
// Every frame of the film from the layers' JPEGs (/dist/intro-film/frames/<layer>/<frame>.jpg),
// scaled to width × height; the sound mixed from the recordings; both encoded and muxed.
// A rough cut (film-intro.mjs --rough): every `step`th frame from its own folder, MP4 only, no sound.
// Either way a contact sheet: a frame each whole second in one row, thumbWidth wide each (the
// review page, tools/film-review.html, shows it under the player).
async function assemble({ width, height, mp4Bitrate, webmBitrate, audioBitrate = 96000, frames = SECONDS * FPS, samples = [], step = 1, dir = '/dist/intro-film/frames/', sound = true, webm: withWebm = true, thumbWidth = 160 }) {
  const fps = FPS / step;
  const sheet = new OffscreenCanvas(thumbWidth * SECONDS, Math.round(thumbWidth * height / width)), sheetCtx = sheet.getContext('2d');
  const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const load = async (layer, f) => {
    const res = await fetch(`${dir}${layer}/${String(f).padStart(4, '0')}.jpg`);
    if (!res.ok) throw Error(`Missing frame ${layer} ${f}: film that layer first`);
    return createImageBitmap(await res.blob());
  };
  const chunks = { mp4: [], webm: [] }; let description = null, failed = null;
  const encoder = (key, config) => {
    const e = new VideoEncoder({ output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
      chunks[key].push({ data, timestamp: chunk.timestamp, key: chunk.type === 'key' });
      if (key === 'mp4' && meta?.decoderConfig?.description) description = new Uint8Array(ArrayBuffer.isView(meta.decoderConfig.description) ? meta.decoderConfig.description.buffer : meta.decoderConfig.description);
    }, error: e => { failed = e; } });
    e.configure({ width, height, framerate: fps, bitrateMode: 'variable', latencyMode: 'quality', ...config }); return e;
  };
  const big = width * height > 921600;
  const codecs = { mp4: big ? 'avc1.640028' : 'avc1.64001f', webm: big ? 'vp09.00.40.08' : 'vp09.00.31.08' };
  const mp4 = encoder('mp4', { codec: codecs.mp4, bitrate: mp4Bitrate, avc: { format: 'avc' } });
  // (VP9 in variable mode overshot a low target by half again and more: constant holds it)
  const webm = withWebm ? encoder('webm', { codec: codecs.webm, bitrate: webmBitrate, bitrateMode: 'constant' }) : null;
  const encoders = [mp4, webm].filter(Boolean);
  const sampled = {};
  for (let f = 0; f < frames; f += step) {
    if (failed) throw failed;
    const t = f / FPS;
    ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
    for (const L of LAYERS) {
      if (t < L.from || t >= L.to) continue;
      const a = L.fade ? smooth(L.from, L.from + L.fade, t + .5 / FPS) : 1;
      if (a <= 0) continue;
      const img = await load(L.name, f);
      ctx.globalAlpha = a; ctx.drawImage(img, 0, 0, width, height); img.close();
    }
    ctx.globalAlpha = 1;
    const frame = new VideoFrame(canvas, { timestamp: Math.round(f / step * 1e6 / fps), duration: Math.round(1e6 / fps) });
    for (const e of encoders) e.encode(frame, { keyFrame: f % (2 * FPS) === 0 });
    frame.close();
    if (samples.includes(f)) sampled[f] = base64(await jpeg(canvas, .9));
    if (f % FPS === 0) sheetCtx.drawImage(canvas, f / FPS * thumbWidth, 0, thumbWidth, sheet.height);
    while (encoders.some(e => e.encodeQueueSize > 3)) await new Promise(done => setTimeout(done, 5));
  }
  for (const e of encoders) { await e.flush(); e.close(); }
  if (failed) throw failed;
  const files = { contact: await jpeg(sheet, .8) };
  let audio = null;
  if (sound) {
    const mix = await mixSound();
    const aac = await encodeAudio(mix, 'mp4a.40.2', audioBitrate), opus = await encodeAudio(mix, 'opus', audioBitrate);
    files.mp4 = muxMp4({ width, height, fps, description, chunks: chunks.mp4, audio: { ...aac, frame: 1024, bitrate: audioBitrate } });
    if (webm) files.webm = muxWebm({ width, height, fps, chunks: chunks.webm, audio: { ...opus, frame: 960 } });
    audio = { aacPackets: aac.chunks.length, opusPackets: opus.chunks.length, peak: mix.peak };
  } else {
    files.mp4 = muxMp4({ width, height, fps, description, chunks: chunks.mp4 });
    if (webm) files.webm = muxWebm({ width, height, fps, chunks: chunks.webm });
  }
  window.introFilm.files = files;
  return { width, height, fps, codecs, sizes: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.length])), audio, samples: sampled };
}

// The mix: each recording decoded, placed and faded on the film's clock (SOUND), summed, and held
// under full scale by a gentle compressor.
async function mixSound() {
  const rate = 48000, ctx = new OfflineAudioContext(2, rate * SECONDS, rate);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = .01; comp.release.value = .3;
  const master = ctx.createGain(); master.gain.value = .9;
  comp.connect(master); master.connect(ctx.destination);
  for (const s of SOUND) {
    const res = await fetch(`/assets/sounds/${s.file}.m4a`);
    if (!res.ok) { if (s.optional) continue; throw Error('Missing recording ' + s.file); }
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = !!s.loop;
    const gain = ctx.createGain();
    if (s.ramp) { gain.gain.setValueAtTime(s.ramp[0][1], s.ramp[0][0]); for (const [t, v] of s.ramp.slice(1)) gain.gain.linearRampToValueAtTime(v, t); }
    else gain.gain.value = s.gain;
    src.connect(gain); gain.connect(comp); src.start(s.at);
  }
  const out = await ctx.startRendering();
  let peak = 0; for (let c = 0; c < 2; c++) for (const v of out.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  out.peak = +peak.toFixed(3);
  return out;
}
async function encodeAudio(buffer, codec, bitrate) {
  const chunks = []; let description = null, failed = null;
  const enc = new AudioEncoder({ output: (chunk, meta) => {
    const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); chunks.push({ data, timestamp: chunk.timestamp });
    if (meta?.decoderConfig?.description) description = new Uint8Array(ArrayBuffer.isView(meta.decoderConfig.description) ? meta.decoderConfig.description.buffer.slice(0) : meta.decoderConfig.description);
  }, error: e => { failed = e; } });
  const sampleRate = buffer.sampleRate, channels = buffer.numberOfChannels;
  enc.configure({ codec, sampleRate, numberOfChannels: channels, bitrate });
  const step = 4800;
  for (let at = 0; at < buffer.length; at += step) {
    const n = Math.min(step, buffer.length - at), planar = new Float32Array(n * channels);
    for (let c = 0; c < channels; c++) planar.set(buffer.getChannelData(c).subarray(at, at + n), c * n);
    enc.encode(new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: channels, timestamp: Math.round(at * 1e6 / sampleRate), data: planar }));
  }
  await enc.flush(); enc.close();
  if (failed) throw failed;
  // (Opus in WebM needs an OpusHead; Chrome's encoder may not hand one over: the standard 19 bytes)
  if (codec === 'opus' && !description) {
    description = new Uint8Array(19); const v = new DataView(description.buffer);
    description.set([79, 112, 117, 115, 72, 101, 97, 100]); v.setUint8(8, 1); v.setUint8(9, channels); v.setUint16(10, 312, true); v.setUint32(12, sampleRate, true);
  }
  if (!description) throw Error('The ' + codec + ' encoder gave no description');
  return { sampleRate, channels, description, chunks };
}

try {
  if (params.get('assemble')) {
    window.introFilm = { ready: true, assemble, slice: (name, start, length) => base64(window.introFilm.files[name].subarray(start, start + length)) };
  } else {
    const layer = await filmLayer(params.get('layer'));
    window.introFilm = { ready: true, layer: params.get('layer'), first: layer.first, last: layer.last, paths: window.introFilm.paths || null, beats: BEATS,
      frame: async f => base64(await layer.frame(f)), info: layer.info, game: layer.game, renderer: layer.renderer,
      probe: (from, to) => { const out = []; for (let f = from; f <= to; f++) out.push(layer.probe(f)); return out; } };
  }
} catch (error) { window.introFilm = { ready: true, error: error.stack || String(error) }; throw error; }
