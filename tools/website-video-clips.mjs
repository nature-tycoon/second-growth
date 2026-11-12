// The website's video loops (tools/capture-site-video.mjs records them): each a staged study in a
// seeded restored map, filmed through the production renderer and simulation at a fixed timestep.
//
// A clip:
//   map, seconds (the finished clip), loop ('none': a <video loop> restarts with a cut; 'crossfade':
//     the last second dissolves into the first, only for a camera that holds still or comes back to
//     where it started (a closed path), or the dissolve shows two views of the land at once).
//     Cole's call (12 Nov): the camera keeps moving one way, drifting along or turning round its
//     subject, never there and back, so most clips loop with a cut
//   time: time of day, 0..1 (scene.js TOD: .35 midday, .76 late afternoon, .8 golden hour)
//   pace: game speed index for the animals (config.js ANIMAL_SPEEDS: 1 normal, 4 watch pace). The
//     calendar is held: no new day, so no daily plant redraw lands mid-shot
//   keyEvery: seconds between keyframes (short for a clip a page will scrub)
//   vertical: also film a 1080×1920 (9:16) version, for Shorts
//   setup(g, pose, wl): poses the scene, returns { focus, shots, description }
//   shots: what the camera does, one after another in the rendered time (which includes the
//     crossfade's extra second at the start):
//     { until, camera: 'map', keys: [{ x, y, zoom, az }], ease } the usual (overhead) view, gliding
//       through the keys (Catmull-Rom, evenly spaced in time); ease 'linear' (steady) or 'inout'.
//       A key { focus: true, zoom, az } sits on the focus animal wherever it has got to.
//       A two-key path with ease 'linear' moves at one steady speed (a drift, a slow turn).
//       closed: true goes round the keys and back to the first once per clip.seconds (a full turn
//       round a subject, say), so a crossfade loop only blends the animals
//     { until, camera: 'eye', dissolve } eye level behind the focus animal (render3d/eye-camera.js),
//       dissolving in from the last frame of the shot before over `dissolve` seconds
import { websiteMoment } from './website-moment-fixtures.mjs';

const Q = Math.PI / 4;

// The restored Hollis creek, as in the header still: the near bank thinned so the animals read,
// and Hollis's large animals at the water. They are released (no wait), so they get on with their
// own lives: grazing, drinking, walking on.
function hollisCreek(g, pose) {
  const w = g.world;
  for (let y = 54; y <= 61; y++) for (let x = 55; x <= 57; x++) { const i = w.idx(x, y); w.tree[i] = 0; w.treeG[i] = 0; }
  const animals = [
    pose('elk', 59, 55, 'land', -.65), pose('elk', 60, 57, 'land', -.2), pose('elk', 61, 59, 'land', .3),
    pose('deer', 58, 59, 'land', .5), pose('beaver', 55, 59, 'land', .3), pose('heron', 54, 57, 'shallows', -.5),
    pose('woodduck', 54, 55, 'water', .4), pose('woodduck', 54, 60, 'water', -.2),
  ];
  animals.forEach((a, n) => { a.wait = .05 + n * .03; });
  g.wildlife.recount();
  return animals;
}

export const CLIPS = [
  {
    id: 'hollis-creek-flyover', title: 'Hollis creek flyover', map: 'pnw', seconds: 10, loop: 'none', time: .79, pace: 4, vertical: true,
    kind: 'staged restored habitat study',
    setup(g, pose) {
      const animals = hollisCreek(g, pose);
      return {
        focus: animals[0],
        description: 'A steady drift up the restored Hollis creek at golden hour, at watch pace: Roosevelt elk, a black-tailed deer, a beaver, a great blue heron and wood ducks posed at the water, then left to their own behaviour.',
        // up the creek past the elk's bank at one steady speed, the view turning a little as it goes
        shots: [{ until: Infinity, camera: 'map', ease: 'linear', keys: [
          { x: 56.4, y: 62, zoom: 3.1, az: Q - .06 }, { x: 57.6, y: 53, zoom: 3.1, az: Q + .06 },
        ] }],
      };
    },
  },
  {
    id: 'map-to-forest-floor', title: 'From the map to the forest floor', map: 'pnw', seconds: 12, loop: 'none', time: .79, pace: 4, keyEvery: .5,
    kind: 'staged restored habitat study',
    setup(g, pose) {
      const animals = hollisCreek(g, pose), elk = animals[1];
      // it sets off up the bank, by the game's own pathfinding, so eye level has somewhere to go
      const [gx, gy] = [64, 49];
      if (!g.wildlife.pathTo(elk, (i, x, y) => x === gx && y === gy, 600, (x, y) => Math.hypot(x - gx, y - gy))) throw Error('The elk has no way up the bank');
      return {
        focus: elk,
        description: 'The overhead view of restored Hollis pushes in on a Roosevelt elk at the creek, then dissolves to eye level behind it as it walks up the bank (sent there through the game\'s pathfinding). Both are the game\'s own cameras (the usual view, then watch mode\'s eye level).',
        shots: [
          { until: 6, camera: 'map', ease: 'inout', keys: [
            // (straight in to the elk, no waypoint between: one bent the glide sideways and back)
            { x: 53, y: 51.5, zoom: .6, az: Q }, { focus: true, zoom: 3.6, az: Q + .2 },
          ] },
          { until: Infinity, camera: 'eye', dissolve: .8 },
        ],
      };
    },
  },
  {
    id: 'moment-elk-rut', title: 'Keystone moment: the elk rut', map: 'pnw', seconds: 8, loop: 'none', time: .8, pace: 4,
    kind: 'staged keystone moment study',
    setup(g, pose) {
      const m = websiteMoment(g, pose), [x, y, zoom] = m.frame;
      return {
        focus: m.focus, moment: m,
        description: m.description + ' The camera turns steadily round them while the bout plays out at watch pace.',
        shots: [{ until: Infinity, camera: 'map', ease: 'linear', keys: [
          { x, y, zoom, az: Q - .35 }, { x, y, zoom, az: Q + .35 },
        ] }],
      };
    },
  },
  {
    id: 'moment-hatchlings', title: 'Keystone moment: hatchlings run for the sea', map: 'chinandega', seconds: 8, loop: 'none', time: .6, pace: 4,
    kind: 'staged keystone moment study',
    setup(g, pose) {
      const m = websiteMoment(g, pose), [x, y, zoom] = m.frame;
      // (the moment has no one animal: the camera follows the hatchling nearest the middle)
      const runner = g.wildlife.agents.filter(a => a.juvenile).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
      if (!runner) throw Error('No hatchlings on the beach');
      return {
        focus: runner, moment: m,
        description: m.description + ' The camera follows them down the beach at watch pace.',
        shots: [{ until: Infinity, camera: 'map', ease: 'linear', keys: [
          { x, y, zoom: zoom * .85, az: Q - .1 }, { focus: true, zoom: zoom * .85, az: Q + .1 },
        ] }],
      };
    },
  },
];
