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
export const SECONDS = 33;
export const TILE_M = 8;
// [from, to, rate] in film seconds: 1.5 s of film at half speed round the cougar's pounce
export const SLOWMO = [[17.75, 19.25, .5]];

// film seconds <-> real seconds
export function realAt(t) {
  let r = t;
  for (const [a, b, rate] of SLOWMO) { if (t > b) r -= (b - a) * (1 - rate); else if (t > a) r -= (t - a) * (1 - rate); }
  return r;
}
export function filmAt(r) {
  let t = r;
  for (const [a, b, rate] of SLOWMO) { const ra = realAt(a), rb = realAt(b); if (r > rb) t += (b - a) * (1 - rate); else if (r > ra) t += (r - ra) * (1 / rate - 1); }
  return t;
}

// How each animal stands, for the sight lines: head and body heights above the ground (scene units,
// read from the first cut's probe: a doe stands 0.59 tall, a crouched cougar 0.43), and how far the
// head sits ahead of the body's middle. These are approximate: F3's motion check measures the real pose.
export const POSES = {
  browse: { head: .22, body: .30, fwd: .2 },   // doe, head down in the salmonberry
  alert: { head: .52, body: .30, fwd: .17 },   // doe, head up, ears turning
  run: { head: .45, body: .30, fwd: .2 },      // doe galloping
  leap: { head: .75, body: .58, fwd: .2 },     // doe over the fence (the arc's top)
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
  doe: {
    species: 'deer', farm: 'start', label: 'Doe', face: [70.5, -4.6],
    marks: [
      [0, 69.5, -5.0, 'browse', 'browses salmonberry in the creek opening, facing east-south-east'],
      [15.9, 69.5, -5.0, 'browse', ''],
      [16.0, 69.5, -5.0, 'alert', 'head snaps up, ears forward'],
      [17.0, 69.5, -5.0, 'run', 'springs away from the cougar'],
      [17.79, 69.65, -4.43, 'run', 'up to a full gallop (12 m/s)'],
      [18.08, 69.75, -4.0, 'run', ''],
      [18.75, 69.8, -3.0, 'run', 'the cougar lands a body length behind her'],
      [19.44, 70.1, -2.0, 'run', ''],
      [20.37, 70.95, -0.9, 'run', 'out between the last trees'],
      [20.97, 71.1, 0.0, 'leap', 'takes off'],
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
      [0, 67.95, -5.6, 'crouch', 'lies low in the sword ferns, 13 m from the doe, still'],
      [9.8, 67.95, -5.6, 'creep', 'starts to creep'],
      [12.8, 68.14, -5.53, 'creep', 'freezes (doe flicks an ear)'],
      [13.6, 68.14, -5.53, 'creep', 'creeps on'],
      [15.9, 68.37, -5.44, 'creep', 'freezes as the doe looks up, 9 m away'],
      [17.0, 68.37, -5.44, 'rush', 'rushes'],
      [17.57, 68.75, -4.95, 'rush', ''],
      [17.84, 69.12, -4.62, 'pounce', 'pounces (slow motion)'],
      [18.39, 69.8, -3.8, 'rush', 'lands behind her: missed'],
      [18.9, 69.95, -3.0, 'rush', 'runs on'],
      [19.5, 70.1, -2.2, 'rush', 'slows'],
      [20.4, 70.2, -1.05, 'stand', 'pulls up at the last trees', [71.6, 2.5]],
      [24, 70.2, -1.05, 'stand', 'stands and watches the doe go; tail flicks', [72.6, 6.5]],
      [32, 70.2, -1.05, 'stand', '', [72.6, 6.5]],
    ],
  },
  // the restored farm, 30 years on: elk grazing in the meadow below the start view, at a slow walk
  elk1: { species: 'elk', farm: 'restored', label: 'Elk', marks: [[29, 48.2, 31.4, 'graze', 'grazes'], [33, 48.55, 31.55, 'graze', '']] },
  elk2: { species: 'elk', farm: 'restored', label: 'Elk', marks: [[29, 50.3, 33.1, 'walk', 'walks slowly'], [33, 50.9, 33.0, 'walk', '']] },
  elk3: { species: 'elk', farm: 'restored', label: 'Elk', marks: [[29, 46.9, 33.0, 'graze', 'grazes'], [33, 47.1, 33.3, 'graze', '']] },
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
    n: 1, from: 1.5, to: 5.5, fadeIn: 1, title: 'The opening', farm: 'start', subjects: ['doe', 'cougar'],
    see: 'Misty old forest, morning sun through the gap where the creek runs out of the trees. A doe browses in the salmonberry, side-on, head down. Low in the sword ferns at the left of the frame, too small to notice, the cougar is already there.',
    camera: { move: 'very slow push in', lens: 'wide', fov: 46, pos: [69.35, -0.75, .4], to: [69.33, -1.05, .4], look: [68.95, -5.2, .26] },
    where: 'At the forest edge, in the creek\'s opening, looking north up it',
    animals: 'Doe browses. Cougar lies still.',
    sound: 'creek, wind in the firs, a Pacific wren',
  },
  {
    n: 2, from: 5.5, to: 8.5, title: 'Her ears', farm: 'start', subjects: ['doe'],
    see: 'Close on the doe\'s head and ears as she chews: one ear turns back, then the other. She doesn\'t look up.',
    camera: { move: 'still', lens: 'long', fov: 5.5, pos: [72.55, -1.86, .3], look: ['doe', 'head'] },
    where: 'Low, 34 m off to the south-east, between the alders',
    animals: 'Doe chews, ears flick.',
    sound: 'close: her chewing, a twig; the creek behind',
  },
  {
    n: 3, from: 8.5, to: 12, title: 'The cougar', farm: 'start', subjects: ['cougar'],
    see: 'Long lens, low among the ferns: two eyes and the shoulders of a cougar, flat to the ground, fixed on the doe. It was there in the first shot. At 9.8 s it starts to creep.',
    camera: { move: 'still', lens: 'long', fov: 5.5, pos: [71.35, -3.04, .25], look: ['cougar', 'head'] },
    where: 'Low at the forest edge, 30 m south-east of the cougar, so it looks almost toward us',
    animals: 'Cougar still, then begins to creep (under 1 m/s).',
    sound: 'the forest goes quiet; wind only',
  },
  {
    n: 4, from: 12, to: 15.5, title: 'The stalk', farm: 'start', subjects: ['cougar', 'doe'],
    see: 'Both in one frame from the side: the cougar at left creeps a paw at a time toward the doe at right, freezes when her ear flicks, creeps on. She keeps browsing.',
    camera: { move: 'still', lens: 'medium-long', fov: 22, pos: [68.75, -0.85, .32], look: [68.95, -5.15, .24] },
    where: 'At the forest edge, 35 m south, between the two',
    animals: 'Cougar creeps from 13 m to 9 m. Doe browses.',
    sound: 'wind; one soft crack under a paw at 15.8 s',
  },
  {
    n: 5, from: 15.5, to: 17.35, title: 'Head up', farm: 'start', subjects: ['doe'],
    see: 'Back to the close on the doe: her head snaps up, ears forward, frozen.',
    camera: { move: 'still', lens: 'long', fov: 8, pos: [72.55, -1.86, .3], look: [69.66, -4.94, .5] },
    where: 'As shot 2',
    animals: 'Doe head up at 16.0 s, still.',
    sound: 'silence but the creek',
  },
  {
    n: 6, from: 17.35, to: 20.6, title: 'The burst', farm: 'start', subjects: ['doe', 'cougar'],
    see: 'Wider: she springs away down the opening toward us, the cougar explodes out of the ferns behind her. The pounce in slow motion (17.75–19.25 s, half speed): it lands a body length short. Back to full speed, she veers right past us and out of frame; the cougar runs on.',
    camera: { move: 'still, panning gently with the doe', lens: 'normal', fov: 38, pos: [69.15, -0.2, .36], look: { follow: { doe: .6, cougar: .4 } } },
    where: 'In the creek opening at the forest edge, low',
    animals: 'Doe gallops 12 m/s. Cougar sprints 16 m/s, pounces, misses.',
    sound: 'crash of ferns, hooves; the slow motion\'s sound drops to a low hush',
  },
  {
    n: 7, from: 20.6, to: 24, title: 'Over the fence', farm: 'start', subjects: ['doe', 'cougar'],
    see: 'The open field from beside the waterfall: the forest edge and the old fence behind. The doe bursts out of the trees, clears the fence and bounds down the far bank of the creek, past the falls. The cougar arrives at the last trees and stops.',
    camera: { move: 'still', lens: 'normal', fov: 44, pos: [63.9, 5.9, .45], look: [70.8, 2.5, .3] },
    where: 'In the field west of the creek, below the falls, looking north-east',
    animals: 'Doe leaps the fence (20.9–21.7 s real). Cougar pulls up at the edge.',
    sound: 'the waterfall swells; hooves on grass',
  },
  {
    n: 8, from: 24, to: 26.8, title: 'It watches', farm: 'start', subjects: ['cougar'],
    see: 'Long lens on the cougar at the edge of the trees: it stands, tail tip flicking, head turning slowly to follow the doe. It does not step out into the open.',
    camera: { move: 'still', lens: 'long', fov: 9, pos: [70.66, 4.0, .4], look: ['cougar', 'head', 'stand'] },
    where: 'On the creek\'s east bank above the falls, 39 m south',
    animals: 'Cougar stands, tail flicks, watches.',
    sound: 'waterfall; a crow calls',
  },
  {
    n: 9, from: 26.8, to: 30, title: 'The rise', farm: 'start',
    see: 'From beside the falls the camera rises slowly and turns west over the bare farm: the fence, the straightened creek, the bare field. The cougar a speck at the forest edge.',
    camera: { move: 'smooth rise and turn', lens: 'normal', fov: 40, pos: [69.2, 9.2, .5], to: [70.0, 11.5, 3.0], look: [70.2, -1.0, .3], lookTo: [64, 2, 0] },
    where: 'Starts at the foot of the falls, ends about 20 m up, a little south',
    animals: 'Cougar still at the edge.',
    sound: 'waterfall fades, wind',
  },
  {
    n: 10, from: 29.2, to: 32.2, fadeIn: .8, title: '30 years on', farm: 'restored', subjects: ['elk1', 'elk2', 'elk3'],
    see: 'Dissolve, mid-rise, to the same farm 30 years on: old forest closed in, the creek free and winding, no fence. The usual high view glides gently to where the game starts: elk grazing in the meadow.',
    camera: { move: 'slow glide (map view)', lens: 'map', map: { from: { x: 60, y: 21, zoom: .9 }, to: { x: 44, y: 38, zoom: .62 }, az: Math.PI / 4 } },
    where: 'The game\'s own map view',
    animals: 'Three elk graze and walk at 0.8 m/s or less.',
    sound: 'meadowlark, wind in grass',
  },
  {
    n: 11, from: 31.6, to: 33, fadeIn: 1.2, title: 'Today', farm: 'start',
    see: 'The rewind: the restored farm dissolves back to today\'s bare farm at the same view, which is exactly the first-visit start view. The film ends here and the game begins.',
    camera: { move: 'still', lens: 'map', map: { from: { x: 44, y: 38, zoom: .62 }, to: { x: 44, y: 38, zoom: .62 }, az: Math.PI / 4 } },
    where: 'The first-visit start view (assets/intro/intro-film.json lastFrame: x 44, y 38, zoom 0.62, az 45°, afternoon)',
    animals: 'The farm\'s own starting animals.',
    sound: 'a robin; wind',
  },
];

// Where an animal is at a real time: { x, y, pose, heading } (heading: radians, atan2(dy, dx))
export function animalAt(name, real) {
  const A = ANIMALS[name], m = A.marks;
  if (real <= m[0][0]) return at(0, 0);
  for (let i = 0; i < m.length - 1; i++) if (real <= m[i + 1][0]) return at(i, (real - m[i][0]) / Math.max(1e-6, m[i + 1][0] - m[i][0]));
  return at(m.length - 2, 1);
  function at(i, u) {
    const a = m[i], b = m[Math.min(m.length - 1, i + 1)];
    const x = a[1] + (b[1] - a[1]) * u, y = a[2] + (b[2] - a[2]) * u;
    const moving = Math.hypot(b[1] - a[1], b[2] - a[2]) > 1e-3;
    let heading;
    if (moving) heading = Math.atan2(b[2] - a[2], b[1] - a[1]);
    else {
      // standing: toward the mark's own face point (turning to the next one), else its `face` point
      // until it has first moved, then the way it last moved
      const toward = f => Math.atan2(f[1] - y, f[0] - x);
      if (a[5]) { const h0 = toward(a[5]), h1 = b[5] ? toward(b[5]) : h0; heading = h0 + Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)) * u; }
      else {
        let k = i; while (k > 0 && Math.hypot(m[k][1] - m[k - 1][1], m[k][2] - m[k - 1][2]) < 1e-3) k--;
        heading = k > 0 ? Math.atan2(m[k][2] - m[k - 1][2], m[k][1] - m[k - 1][1]) : A.face ? toward(A.face) : 0;
      }
    }
    return { x, y, pose: u < 1 ? a[3] : b[3], heading };
  }
}
// The animal's head and body points: [x, y, up] (up above the ground)
export function partsOf(name, real, pose) {
  const p = animalAt(name, real), P = POSES[pose || p.pose], c = Math.cos(p.heading), s = Math.sin(p.heading);
  return { ...p, head: [p.x + c * P.fwd, p.y + s * P.fwd, P.head], body: [p.x, p.y, P.body] };
}
// The camera of an eye-level shot at film time t: { pos: [x, y, up], look: [x, y, up], fov }
const smooth = u => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const mix = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
export function cameraAt(shot, t) {
  const c = shot.camera; if (!c || c.map) return null;
  const u = smooth((t - shot.from) / (shot.to - shot.from)), real = realAt(t);
  const pos = c.to ? mix(c.pos, c.to, u) : c.pos;
  let look;
  if (Array.isArray(c.look) && typeof c.look[0] === 'string') look = partsOf(c.look[0], real, c.look[2])[c.look[1]];
  else if (c.look.follow) {
    let x = 0, y = 0, up = 0;
    for (const [name, w] of Object.entries(c.look.follow)) { const b = partsOf(name, real).body; x += b[0] * w; y += b[1] * w; up += b[2] * w; }
    look = [x, y, up];
  } else look = c.lookTo ? mix(c.look, c.lookTo, u) : c.look;
  return { pos, look, fov: c.fov };
}
