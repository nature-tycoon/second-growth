// The intro film's shot list (film rework F2: docs/ideas/2026-11-21-first-minutes/film-shots.md).
// One source for the written shot list, the top-down map (tools/film-shots.html) and the sight-line
// check (tools/intro-film-sightlines.mjs). F3 stages the film from it.
//
// Units: tiles (8 m each on the PNW farm, decision 0021). x runs east, y runs south: the farm's north
// fence is row 0 (drawn at y 0.5), the old forest is y < 0, the creek runs south down x 69 and drops
// at the waterfall (tile 69, 6). Heights ("up") are scene units above the drawn ground.
//
// Two clocks. Shots are in FILM seconds (what Cole sees). The animals' marks are in REAL seconds (the
// story's clock): they differ only in the slow motion, SLOWMO, where film runs at half speed. Speeds
// are judged in real seconds, so the slow motion never hides a too-fast run.

export const FPS = 30;
export let SECONDS = 35.4; // (33 approved; 35.4 with the sweep to the start view; TRIMS below take it to 31.3)
export const TILE_M = 8;
// [from, to, rate] in film seconds: 1.5 s of film at half speed round the cougar's pounce
export const SLOWMO = [[17.75, 19.25, .5]];

// [film second, seconds]: a cut where the story jumps ahead (TRIMS below, kind 'skip')
export const SKIPS = [];
// film seconds <-> real seconds
export function realAt(t) {
  let r = t;
  for (const [a, b, rate] of SLOWMO) { if (t > b) r -= (b - a) * (1 - rate); else if (t > a) r -= (t - a) * (1 - rate); }
  for (const [at, s] of SKIPS) if (t >= at) r += s;
  return r;
}
// (the first film second showing real second r: realAt never runs backward)
export function filmAt(r) {
  let lo = -1, hi = SECONDS + 5;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (realAt(m) < r) lo = m; else hi = m; }
  return +hi.toFixed(4);
}

// How each animal stands, for the sight lines: head and body heights above the ground (scene units,
// read from the first cut's probe: a doe stood 0.59 tall, a crouched cougar 0.43; the buck that replaced her is drawn about 12% bigger, his rack above that), and how far the
// head sits ahead of the body's middle. These are approximate: F3's motion check measures the real pose.
export const POSES = {
  browse: { head: .25, body: .34, fwd: .22 },   // buck, head down in the salmonberry
  alert: { head: .58, body: .34, fwd: .19 },   // buck, head up, ears turning
  run: { head: .50, body: .34, fwd: .22 },      // buck galloping
  leap: { head: .80, body: .62, fwd: .22 },     // buck over the fence (the arc's top)
  crouch: { head: .24, body: .17, fwd: .22 },  // cougar, eyes and shoulders above the ferns
  creep: { head: .26, body: .19, fwd: .22 },   // cougar, belly low, one paw at a time
  rush: { head: .34, body: .24, fwd: .24 },    // cougar sprinting
  pounce: { head: .5, body: .42, fwd: .24 },   // cougar in the air
  stand: { head: .38, body: .25, fwd: .22 },   // cougar standing, watching
  graze: { head: .22, body: .28, fwd: .25 },   // elk, head down
  walk: { head: .43, body: .28, fwd: .25 },    // elk walking
};

// Each animal's path: [real seconds, x, y, pose, what it does (plain words, for the map and list),
// optional point it faces from this mark while standing]. Between marks it moves in a straight line
// at constant speed, which is what the speed check reads. face: where it looks before it first moves.
export const ANIMALS = {
  buck: {
    species: 'deer', farm: 'start', label: 'Buck', face: [70.5, -4.6],
    marks: [
      [0, 69.5, -5.0, 'browse', 'browses salmonberry in the creek opening, facing east-south-east'],
      [15.9, 69.5, -5.0, 'browse', ''],
      [16.0, 69.5, -5.0, 'alert', 'head snaps up, ears forward'],
      [17.0, 69.5, -5.0, 'run', 'springs away from the cougar'],
      [17.79, 69.65, -4.43, 'run', 'up to a full gallop (12 m/s)'],
      [18.08, 69.75, -4.0, 'run', ''],
      [18.75, 69.8, -3.0, 'run', 'the cougar lands a body length behind him'],
      [19.44, 70.1, -2.0, 'run', ''],
      [20.37, 70.95, -0.9, 'run', 'out between the last trees'],
      [20.89, 71.08, -0.12, 'leap', 'takes off'], // (F3: 1 m earlier than F2's 71.1, 0.0 at 20.97 s: a hollow along the fence line sank his hooves 0.036 as he gathered; the arc still tops out over the fence)
      [21.66, 71.25, 1.1, 'run', 'lands in the field'],
      [22.62, 71.6, 2.5, 'run', ''],
      [24.41, 72.15, 5.1, 'run', 'past the waterfall on the far bank'],
      [26.4, 72.9, 7.9, 'run', 'slowing to bounds'],
      [29.4, 73.4, 10.6, 'run', 'gone down the field'],
    ],
  },
  cougar: {
    species: 'cougar', farm: 'start', label: 'Cougar', face: [69.5, -5.0],
    marks: [
      [0, 67.95, -5.6, 'crouch', 'lies low in the sword ferns, 13 m from the buck, still'],
      [9.8, 67.95, -5.6, 'creep', 'starts to creep'],
      [12.8, 68.14, -5.53, 'creep', 'freezes (buck flicks an ear)'],
      [13.6, 68.14, -5.53, 'creep', 'creeps on'],
      [15.9, 68.37, -5.44, 'creep', 'freezes as the buck looks up, 9 m away'],
      [17.0, 68.37, -5.44, 'rush', 'rushes'],
      [17.57, 68.75, -4.95, 'rush', ''],
      [17.84, 68.98, -4.78, 'pounce', 'pounces (slow motion)'],
      // (Cole, rough cut: "too close together, intersecting": it springs and lands well behind him, 3 m
      // between their bodies at the landing and never under 1.5 m, and runs on a little slower; F2 had it
      // spring at 69.12, -4.62 and land at 69.8, -3.8, a body's length from his middle)
      [18.39, 69.6, -4.35, 'rush', 'lands behind him: missed'],
      [18.9, 69.86, -3.45, 'rush', 'runs on'],
      [19.5, 70.02, -2.62, 'rush', 'slows'],
      [20.6, 70.2, -1.05, 'stand', 'pulls up at the last trees', [71.6, 2.5]],
      [24, 70.2, -1.05, 'stand', 'stands and watches the buck go; tail flicks', [72.6, 6.5]],
      [32, 70.2, -1.05, 'stand', '', [72.6, 6.5]],
    ],
  },
  // the restored farm, 30 years on: elk grazing in the meadow below the start view, at a slow walk
  elk1: { species: 'elk', farm: 'restored', label: 'Elk', marks: [[31, 48.2, 31.4, 'graze', 'grazes'], [35, 48.55, 31.55, 'graze', '']] },
  elk2: { species: 'elk', farm: 'restored', label: 'Elk', marks: [[31, 50.3, 33.1, 'walk', 'walks slowly'], [35, 50.9, 33.0, 'walk', '']] },
  elk3: { species: 'elk', farm: 'restored', label: 'Elk', marks: [[31, 46.9, 33.0, 'graze', 'grazes'], [35, 47.1, 33.3, 'graze', '']] },
};

// The shots, in film seconds. camera.pos and camera.look are [x, y, up]; `to` and `lookTo` are where
// they end (moved smoothly over the shot); `follow` makes the look track animals (weights). fov is the
// vertical field of view in degrees: the eye's own is 50; long lens about 7–10.
export const SHOTS = [
  {
    n: 0, from: 0, to: 1.5, title: 'Black', farm: 'start',
    see: 'Black. Sound first.',
    sound: 'creek and wind fade up; a raven far off',
  },
  {
    n: 1, layer: 'opening', from: 1.5, to: 5.5, fadeIn: 1, title: 'The opening', farm: 'start', subjects: ['buck'], hide: ['cougar'],
    // (Cole, 2026-11-23: the cougar showed in the first shot, frozen and awkward; it's left out of it, first seen in shot 3)
    see: 'Misty old forest, morning sun through the gap where the creek runs out of the trees. A buck browses in the salmonberry, side-on, head down.',
    camera: { move: 'very slow push in', lens: 'wide', fov: 46, pos: [69.35, -0.75, .4], to: [69.31, -1.35, .4], look: [68.95, -5.2, .26] },
    where: 'At the forest edge, in the creek\'s opening, looking north up it',
    animals: 'Buck browses. Cougar lies still.',
    sound: 'creek, wind in the firs, a Pacific wren',
  },
  {
    n: 2, layer: 'ears', from: 5.5, to: 8.5, title: 'His ears', farm: 'start', subjects: ['buck'],
    see: 'Close on the buck\'s head and ears as he chews: one ear turns back, then the other. He doesn\'t look up.',
    camera: { move: 'still', lens: 'long', fov: 5.5, pos: [72.55, -1.86, .3], look: ['buck', 'head'] },
    where: 'Low, 34 m off to the south-east, between the alders',
    animals: 'Buck chews, ears flick.',
    sound: 'close: his chewing, a twig; the creek behind',
  },
  {
    n: 3, layer: 'eyes', from: 8.5, to: 12, title: 'The cougar', farm: 'start', subjects: ['cougar'],
    see: 'Long lens, low among the ferns: two eyes and the shoulders of a cougar, flat to the ground, fixed on the buck. At 9.8 s it starts to creep.',
    camera: { move: 'still', lens: 'long', fov: 5.5, pos: [71.35, -3.04, .25], look: ['cougar', 'head'] },
    where: 'Low at the forest edge, 30 m south-east of the cougar, so it looks almost toward us',
    animals: 'Cougar still, then begins to creep (under 1 m/s).',
    sound: 'the forest goes quiet; wind only',
  },
  {
    n: 4, layer: 'stalk', from: 12, to: 15.5, title: 'The stalk', farm: 'start', subjects: ['cougar', 'buck'],
    see: 'Both in one frame from the side: the cougar at left creeps a paw at a time toward the buck at right, freezes when his ear flicks, creeps on. He keeps browsing.',
    camera: { move: 'still', lens: 'medium-long', fov: 22, pos: [68.75, -1.25, .32], look: [68.95, -5.15, .24], clearShrubs: .3 },
    // (Cole, rough cut: "remove the bush from in front of the cougar": shrubs on the line are cleared to 0.3 tiles short of it, ferns kept)
    // (F3: 0.4 tiles further up the opening than F2's 68.75, -0.85: there a trunk hid the crouched cougar's body half the shot, as drawn)
    where: 'At the forest edge, 35 m south, between the two',
    animals: 'Cougar creeps from 13 m to 9 m. Buck browses.',
    sound: 'wind; one soft crack under a paw at 15.8 s',
  },
  {
    n: 5, layer: 'headup', from: 15.5, to: 17.35, title: 'Head up', farm: 'start', subjects: ['buck'],
    see: 'Back to the close on the buck: his head snaps up, ears forward, frozen.',
    camera: { move: 'still', lens: 'long', fov: 11, pos: [72.55, -1.86, .3], look: [69.66, -4.94, .5] },
    // (F3: 9.5°, not 8°: as drawn, the doe's whirl at 16.7 s crossed the 8° frame at 0.78 widths a second, limit 0.7;
    // 11° for the buck, drawn about 12% bigger: he crossed the 9.5° frame at 0.76)
    where: 'As shot 2',
    animals: 'Buck head up at 16.0 s, still.',
    sound: 'silence but the creek',
  },
  {
    n: 6, layer: 'burst', from: 17.35, to: 20.6, title: 'The burst', farm: 'start', subjects: ['buck', 'cougar'],
    see: 'Wider: he springs away down the opening toward us, the cougar explodes out of the ferns behind him. The pounce in slow motion (17.75–19.25 s, half speed): it lands a body length short. Back to full speed, he veers right past us and out of frame; the cougar runs on.',
    camera: { move: 'still, panning gently with the buck', lens: 'normal', fov: 40, pos: [69.15, -0.2, .62], look: { follow: { buck: .6, cougar: .4 } }, lookUp: .3 },
    // (fov 40, not 38: with the cougar further back, the buck passing the camera crossed the 38° frame at
    // 0.70 widths a second, the limit)
    // (Cole, rough cut: "too low, shows too much ground": the camera stands at 0.62, not 0.36, and aims 0.3 above the pair, so they run in the frame's lower half with the forest above: ground 56% of the frame to 35–48%)
    where: 'In the creek opening at the forest edge, low',
    animals: 'Buck gallops 12 m/s. Cougar sprints 16 m/s, pounces, misses.',
    sound: 'crash of ferns, hooves; the slow motion\'s sound drops to a low hush',
  },
  {
    n: 7, layer: 'fence', from: 20.6, to: 24, title: 'Over the fence', farm: 'start', subjects: ['buck', 'cougar'],
    see: 'The open field from beside the waterfall: the forest edge and the old fence behind. The buck bursts out of the trees, clears the fence and bounds down the far bank of the creek, past the falls. The cougar arrives at the last trees and stops.',
    camera: { move: 'still', lens: 'normal', fov: 44, pos: [63.9, 5.9, .45], look: [70.8, 2.5, .3] },
    where: 'In the field west of the creek, below the falls, looking north-east',
    animals: 'Buck leaps the fence (20.9–21.7 s real). Cougar pulls up at the edge.',
    sound: 'the waterfall swells; hooves on grass',
  },
  {
    n: 8, layer: 'watch', from: 24, to: 26.8, title: 'It watches', farm: 'start', subjects: ['cougar'],
    see: 'Long lens on the cougar at the edge of the trees: it stands, tail tip flicking, head turning slowly to follow the buck. It does not step out into the open.',
    camera: { move: 'still', lens: 'long', fov: 9, pos: [70.66, 4.0, .4], look: ['cougar', 'head', 'stand'] },
    where: 'On the creek\'s east bank above the falls, 39 m south',
    animals: 'Cougar stands, tail flicks, watches.',
    sound: 'waterfall; a crow calls',
  },
  {
    n: 9, layer: 'rise', from: 26.8, to: 30, title: 'The rise', farm: 'start',
    see: 'From beside the falls the camera rises slowly and turns west over the bare farm: the fence, the straightened creek, the bare field. The cougar a speck at the forest edge.',
    // (Cole, rough cut: "pull out all the way to the view of what it looks like when the game starts, one
    // sweep": from beside the falls the camera pulls back and up in one move, on both farms, to the game's
    // start view, framed as the map view frames it; cameraAt's sweep)
    camera: { move: 'one sweep up and back to the start view', lens: 'normal, narrowing', fov: 40, pos: [69.2, 9.2, .5], look: [70.2, -1.0, .3], sweep: { fov: 20, until: 33.8 } },
    where: 'Starts at the foot of the falls, ends about 20 m up, a little south',
    animals: 'Cougar still at the edge.',
    sound: 'waterfall fades, wind',
  },
  {
    n: 10, layer: 'rise30', from: 29.2, to: 35, fadeIn: .8, title: '30 years on', farm: 'restored', subjects: ['elk1', 'elk2', 'elk3'],
    see: 'Dissolve, mid-sweep, to the same farm 30 years on: old forest closed in, the creek free and winding, no fence. The sweep carries on up and back over the whole farm to the view the game starts on, elk grazing in the meadow.',
    camera: { move: 'the same sweep, on the restored farm', lens: 'normal, narrowing', of: 9 },
    where: 'Up and back from the falls to the start view',
    animals: 'Three elk graze and walk at 0.8 m/s or less.',
    sound: 'meadowlark, wind in grass',
  },
  {
    n: 11, layer: 'start', from: 33.8, to: 35.4, fadeIn: 1.2, title: 'Today', farm: 'start',
    see: 'The rewind: the restored farm dissolves back to today\'s bare farm at the same view, which is exactly the first-visit start view. The film ends here and the game begins.',
    camera: { move: 'still', lens: 'map', map: { from: { x: 44, y: 38, zoom: .62 }, to: { x: 44, y: 38, zoom: .62 }, az: Math.PI / 4 } },
    where: 'The first-visit start view (assets/intro/intro-film.json lastFrame: x 44, y 38, zoom 0.62, az 45°, afternoon)',
    animals: 'The farm\'s own starting animals.',
    sound: 'a robin; wind',
  },
];

// ------------------------------------------------------------------ Cole's rough-cut notes (2026-11-22)
// Also in the numbers above: the opening's push goes twice as far ("pan up a little too slow"), the
// burst's camera stands higher and aims above the pair (lookUp: "too low, shows too much ground"), the
// stalk clears the bush in front of the cougar (clearShrubs), the cougar lands well behind the buck, and
// the rise is one sweep to the start view on both farms (camera.sweep), its shots and the elk later.
// Trims, applied here to the numbers above so they stay as approved: [film second, seconds cut, kind].
//   story: both clocks lose the seconds (before the slow motion only: nothing happens in them)
//   film:  only the film's later shots move up; the story runs on across the cut, so later shots show
//          it a little earlier (the restored farm's elk move up with their shots)
//   skip:  the film's later shots move up and the story jumps ahead across the cut (SKIPS, realAt)
export const TRIMS = [
  [.8, .7, 'story'],    // a shorter black opening
  [14, 1.5, 'skip'],    // (Cole, 2nd notes) the stalk cuts as the cougar creeps on again, straight to the
                        // buck half a second before his head comes up: the story jumps 1.5 s (F3's first
                        // trim instead shortened the cougar's freeze, which hurried its creep into a rush)
  [24.9, 1.4, 'film'],  // the cougar watches 1.4 s, not 2.8 s
  [12, .5, 'skip'],     // (Cole, 2026-11-23: "shorten the stalk just a little") the stalk opens half a
                        // second further into the cougar's creep: a jump at the cut from its eyes, not a
                        // faster creep; 1.5 s of stalk, not 2.0
];
{
  const less = (t, at, cut) => t > at ? t - Math.min(cut, t - at) : t;
  for (const [at, cut, kind] of [...TRIMS].sort((a, b) => b[0] - a[0])) {
    const f = t => less(t, at, cut);
    for (const s of SHOTS) {
      s.from = f(s.from); s.to = f(s.to);
      const c = s.camera; if (!c) continue;
      if (c.until != null) c.until = f(c.until);
      if (c.sweep) c.sweep.until = f(c.sweep.until);
      if (c.rise) c.rise.until = f(c.rise.until);
      if (c.glide) { c.glide.from = f(c.glide.from); c.glide.until = f(c.glide.until); }
    }
    for (const w of SLOWMO) { w[0] = f(w[0]); w[1] = f(w[1]); }
    for (const A of Object.values(ANIMALS)) if (kind === 'story' || kind === 'film' && A.farm === 'restored') for (const m of A.marks) m[0] = f(m[0]);
    for (const k of SKIPS) k[0] = f(k[0]);
    if (kind === 'skip') SKIPS.push([at, cut]);
    SECONDS = +(SECONDS - cut).toFixed(3);
  }
  for (const s of SHOTS) { s.from = +s.from.toFixed(3); s.to = +s.to.toFixed(3); }
}


// ------------------------------------------------------------------ motion (F3: the film stages from this)
const clamp01 = u => Math.min(1, Math.max(0, u));
const lerp = (a, b, u) => a + (b - a) * u;
const mix = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
// Each animal's path is a Catmull-Rom curve through its marks' places, so corners round off. Its
// distance along the curve over time is the marks' straight-line schedule smoothed by a Gaussian of
// EASE seconds, so starts, stops and changes of pace ease in over about 2 × EASE either side, and its
// speed never goes over the fastest stretch's own average. It passes each mark close to the mark's
// time (exactly, where the pace doesn't change). Jumps (pose leap or pounce) are set by distance:
// take-off and landing are the marks' places.
export const EASE = .15;
const LEAPS = { leap: .75, pounce: .5 }; // arc height in body lengths (the drawing's hunt.leap.arc)
// fastest speed (m/s) each slow pose may be drawn at; faster, the animal takes the gait of the nearest
// stretch whose gait is that fast (a buck springing off from browsing gallops, a cougar easing into its
// rush from the creep rushes, one pulling up runs until it stands)
const TOP = { browse: 1, alert: 1, crouch: .8, creep: .95, stand: 1, graze: 1.5, walk: 1.8 };
const tracks = new Map();
function track(name) {
  let T = tracks.get(name); if (T) return T;
  const m = ANIMALS[name].marks, pts = [], ptOf = [];
  for (const k of m) { const q = pts.at(-1); if (!q || Math.hypot(k[1] - q[0], k[2] - q[1]) > 1e-4) pts.push([k[1], k[2]]); ptOf.push(pts.length - 1); }
  const cr = (p0, p1, p2, p3, t) => .5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
  const path = [pts[0].slice()], s = [0], sAt = [0];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(8, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / .01));
    for (let k = 1; k <= n; k++) {
      const p = [cr(a[0], b[0], c[0], d[0], k / n), cr(a[1], b[1], c[1], d[1], k / n)], q = path.at(-1);
      s.push(s.at(-1) + Math.hypot(p[0] - q[0], p[1] - q[1])); path.push(p);
    }
    sAt.push(s.at(-1));
  }
  const markS = ptOf.map(k => sAt[k]);
  // the schedule on a fine clock, then smoothed
  const dt = 1 / 240, t0 = m[0][0] - 4 * EASE, n = Math.ceil((m.at(-1)[0] + 4 * EASE - t0) / dt) + 1;
  const raw = new Float64Array(n), dist = new Float64Array(n);
  for (let i = 0, j = 0; i < n; i++) {
    const t = t0 + i * dt;
    while (j < m.length - 2 && t > m[j + 1][0]) j++;
    raw[i] = m.length < 2 ? 0 : lerp(markS[j], markS[j + 1], clamp01((t - m[j][0]) / Math.max(1e-6, m[j + 1][0] - m[j][0])));
  }
  const R = Math.ceil(3 * EASE / dt), w = []; let sum = 0;
  for (let k = -R; k <= R; k++) { const v = Math.exp(-.5 * (k * dt / EASE) ** 2); w.push(v); sum += v; }
  for (let i = 0; i < n; i++) { let v = 0; for (let k = -R; k <= R; k++) v += w[k + R] * raw[Math.min(n - 1, Math.max(0, i + k))]; dist[i] = v / sum; }
  // the stretches between marks: moving or not, and their pose
  const legs = m.slice(0, -1).map((k, i) => ({ from: k[0], to: m[i + 1][0], pose: k[3], moving: markS[i + 1] - markS[i] > 1e-4, s0: markS[i], s1: markS[i + 1] }));
  T = { m, path, s, markS, t0, dt, dist, legs };
  tracks.set(name, T);
  return T;
}
function pointAt(T, d) {
  const { path, s } = T;
  d = Math.min(s.at(-1), Math.max(0, d));
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) { const k = (lo + hi) >> 1; if (s[k] <= d) lo = k; else hi = k; }
  const u = s[hi] > s[lo] ? (d - s[lo]) / (s[hi] - s[lo]) : 0;
  return [lerp(path[lo][0], path[hi][0], u), lerp(path[lo][1], path[hi][1], u)];
}
// Where an animal is at a real time: { x, y, pose, heading, speed (tiles a real second), leap (0..1
// through a jump, else null), arc }. heading: radians, atan2(dy, dx).
export function animalAt(name, real) {
  const A = ANIMALS[name], T = track(name), m = T.m;
  const g = Math.min(T.dist.length - 1.001, Math.max(0, (real - T.t0) / T.dt)), i = Math.floor(g), f = g - i;
  const d = lerp(T.dist[i], T.dist[i + 1], f), speed = (T.dist[i + 1] - T.dist[i]) / T.dt;
  const [x, y] = pointAt(T, d);
  // which stretch by the clock
  let k = 0; while (k < T.legs.length - 1 && real > T.legs[k].to) k++;
  let pose = real >= m.at(-1)[0] ? m.at(-1)[3] : T.legs[k].pose;
  // a jump, by distance
  let leap = null, arc = 0;
  for (const L of T.legs) if (LEAPS[L.pose] && d > L.s0 && d < L.s1) { leap = (d - L.s0) / (L.s1 - L.s0); arc = LEAPS[L.pose]; pose = L.pose; }
  if (!leap && TOP[pose] != null && speed * TILE_M > TOP[pose]) {
    let best = null, bd = Infinity;
    for (const L of T.legs) if (L.moving && !(TOP[L.pose] <= speed * TILE_M)) { const gap = real < L.from ? L.from - real : real > L.to ? real - L.to : 0; if (gap < bd) { bd = gap; best = L; } }
    if (best) pose = LEAPS[best.pose] ? 'run' : best.pose;
  }
  // heading: the way the path runs, and standing, toward the mark's own face point (turning to the
  // next one), else its `face` point until it has first moved, then the way it last moved. It turns
  // from the one to the other as it gathers or loses pace (over its first 1.2 m/s), so a start from a
  // stand is a turn, not a snap.
  const pa = pointAt(T, d - .04), pb = pointAt(T, d + .04), run = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
  const toward = q => Math.atan2(q[1] - y, q[0] - x), a = m[k], b = m[Math.min(m.length - 1, k + 1)];
  const u = clamp01((real - a[0]) / Math.max(1e-6, b[0] - a[0]));
  let still;
  if (a[5]) { const h0 = toward(a[5]), h1 = b[5] ? toward(b[5]) : h0; still = h0 + Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)) * u; }
  else if (d > 1e-3) { const p = pointAt(T, d - .08); still = Math.atan2(y - p[1], x - p[0]); }
  else still = A.face ? toward(A.face) : run;
  const wv = clamp01(speed / .15), w = wv * wv * (3 - 2 * wv);
  const heading = still + Math.atan2(Math.sin(run - still), Math.cos(run - still)) * w;
  return { x, y, pose, heading, speed, leap, arc };
}
// The animal's head and body points: [x, y, up] (up above the ground)
export function partsOf(name, real, pose) {
  const p = animalAt(name, real), P = POSES[pose || p.pose], c = Math.cos(p.heading), s = Math.sin(p.heading);
  return { ...p, head: [p.x + c * P.fwd, p.y + s * P.fwd, P.head], body: [p.x, p.y, P.body] };
}

// The camera of an eye-level shot at film time t: { pos: [x, y, up], look: [x, y, up], fov }. With
// ground(x, y) (the drawn ground), `up` comes back as a height in the scene instead (abs: true), and a
// moving camera's height is eased between its keys' heights, so it doesn't ride every bump.
// Moves ease in and out (quintic: speed and acceleration start and end at zero) over the shot, or to
// camera.until when the move runs on under a dissolve. A look that follows animals is smoothed over
// LOOK_EASE seconds (Gaussian), so the camera never chases an animal frame by frame.
export const LOOK_EASE = .45;
const ease = u => { u = clamp01(u); return u * u * u * (u * (u * 6 - 15) + 10); };
function lookAt(c, t, ground) {
  const abs = p => ground ? [p[0], p[1], ground(p[0], p[1]) + p[2]] : p;
  const real = realAt(t);
  if (Array.isArray(c.look) && typeof c.look[0] === 'string') return abs(partsOf(c.look[0], real, c.look[2])[c.look[1]]);
  let x = 0, y = 0, up = 0;
  for (const [name, w] of Object.entries(c.look.follow)) { const b = abs(partsOf(name, real).body); x += b[0] * w; y += b[1] * w; up += b[2] * w; }
  return [x, y, up];
}
// The start view as the map frames it (Renderer.resetView on PNW, az 45°): the ground point at its
// middle, the way the map camera looks (x, y, up; it is orthographic), and the height of ground it
// frames (scene units). The film passes the renderer's own; these are for the map page.
export const START_VIEW = { target: [44, 38, .82], dir: [-.5862, -.5862, -.5592], height: 25.245 };
// One sweep (camera.sweep): from its start (pos, look) up and back to the start view, framing the same
// ground at fov sweep.fov. Its distance to what it looks at grows evenly in proportion (eased), so the
// land slides by at a steady rate however high it is; the point it looks at moves across in step with
// the distance, and it turns and narrows its lens on the same ease. end: START_VIEW's shape.
function sweepAt(shot, t, ground, end) {
  const c = shot.camera, S = c.sweep, E = end || START_VIEW;
  const at = p => ground ? [p[0], p[1], ground(p[0], p[1]) + p[2]] : p;
  const P0 = at(c.pos), L0 = at(c.look), s = ease((t - shot.from) / (S.until - shot.from));
  const v0 = L0.map((v, i) => v - P0[i]), d0 = Math.hypot(...v0);
  const yaw0 = Math.atan2(v0[1], v0[0]), pitch0 = Math.asin(v0[2] / d0);
  const yaw1 = Math.atan2(E.dir[1], E.dir[0]), pitch1 = Math.asin(E.dir[2] / Math.hypot(...E.dir));
  const d1 = E.height / 2 / Math.tan(S.fov * Math.PI / 360);
  const d = Math.exp(lerp(Math.log(d0), Math.log(d1), s)), w = (d - d0) / (d1 - d0);
  const look = mix(L0, E.target, w), yaw = yaw0 + Math.atan2(Math.sin(yaw1 - yaw0), Math.cos(yaw1 - yaw0)) * s, pitch = lerp(pitch0, pitch1, s);
  const dir = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
  return { pos: look.map((v, i) => v - dir[i] * d), look, fov: lerp(c.fov, S.fov, s), abs: !!ground, dist: d, sweep: s, w };
}
export function cameraAt(shot, t, ground = null, endView = null) {
  if (shot.camera?.of != null) return cameraAt(SHOTS.find(s => s.n === shot.camera.of), t, ground, endView);
  const c = shot.camera; if (!c || c.map) return null;
  if (c.sweep) return sweepAt(shot, t, ground, endView);
  const end = c.until ?? shot.to, e = ease((t - shot.from) / (end - shot.from));
  const at = p => ground ? [p[0], p[1], ground(p[0], p[1]) + p[2]] : p;
  const pos = c.to ? mix(at(c.pos), at(c.to), e) : at(c.pos);
  let look;
  if (Array.isArray(c.look) && typeof c.look[0] !== 'string') look = c.lookTo ? mix(at(c.look), at(c.lookTo), e) : at(c.look);
  else {
    // smoothed over the shot (held at its ends): a Gaussian over samples on a fixed clock, so the
    // weights slide smoothly with t (samples taken at offsets from t would each cross every step in
    // the target, a pose's height say, one at a time, and the turn would shudder)
    let sum = 0; look = [0, 0, 0];
    const G = 1 / 120;
    for (let k = Math.ceil((t - 4 * LOOK_EASE) / G); k <= Math.floor((t + 4 * LOOK_EASE) / G); k++) {
      const w = Math.exp(-.5 * ((k * G - t) / LOOK_EASE) ** 2), q = lookAt(c, Math.min(end, Math.max(shot.from, k * G)), ground);
      look = look.map((v, j) => v + q[j] * w); sum += w;
    }
    look = look.map(v => v / sum);
  }
  if (c.lookUp) look = [look[0], look[1], look[2] + c.lookUp]; // (aimed above its subject)
  return { pos, look, fov: c.fov, abs: !!ground };
}
// The map view of a map shot at film time t: { x, y, zoom, az } (end: the start view, when given)
export function mapAt(shot, t, end = null) {
  const c = shot.camera, M = c.map, to = end || M.to, from = c.glide?.from ?? shot.from;
  const e = ease((t - from) / ((c.glide?.until ?? shot.to) - from));
  return { x: lerp(M.from.x, to.x, e), y: lerp(M.from.y, to.y, e), zoom: Math.exp(lerp(Math.log(M.from.zoom), Math.log(to.zoom), e)), az: M.az };
}
