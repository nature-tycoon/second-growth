// The website's video loops (tools/capture-site-video.mjs records them): each a staged study in a
// seeded restored map, filmed through the production renderer and simulation at a fixed timestep.
//
// A clip:
//   map, seconds (the finished clip), loop ('crossfade': the last second dissolves into the first,
//     so a <video loop> has no jump; 'none' loops with a cut, for a clip to scrub or one whose
//     subject moves too far for a dissolve: two elk bulls half-faded over each other look broken)
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
//       closed: true goes round the keys and back to the first once per clip.seconds, steadily: a
//       crossfade loop then only blends the animals, never two different views of the land
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
    id: 'hollis-creek-flyover', title: 'Hollis creek flyover', map: 'pnw', seconds: 10, loop: 'crossfade', time: .79, pace: 4, vertical: true,
    kind: 'staged restored habitat study',
    setup(g, pose) {
      const animals = hollisCreek(g, pose);
      return {
        focus: animals[0],
        description: 'A slow drift over the restored Hollis creek at golden hour, at watch pace: Roosevelt elk, a black-tailed deer, a beaver, a great blue heron and wood ducks posed at the water, then left to their own behaviour.',
        // a slow drift round the elk's bank and back, the view swinging a little with it
        shots: [{ until: Infinity, camera: 'map', closed: true, keys: [
          { x: 56.6, y: 58.6, zoom: 3.1, az: Q - .1 }, { x: 57.6, y: 57.2, zoom: 3.25, az: Q }, { x: 58.4, y: 56.2, zoom: 3.1, az: Q + .1 }, { x: 57.4, y: 57.6, zoom: 2.95, az: Q },
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
            { x: 52, y: 52, zoom: .6, az: Q }, { x: 57, y: 56, zoom: 1.5, az: Q + .1 }, { focus: true, zoom: 3.6, az: Q + .2 },
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
        description: m.description + ' The camera circles slowly while the bout plays out at watch pace.',
        shots: [{ until: Infinity, camera: 'map', closed: true, keys: [
          { x, y, zoom: zoom * .94, az: Q - .3 }, { x, y, zoom, az: Q }, { x, y, zoom: zoom * 1.04, az: Q + .3 }, { x, y, zoom, az: Q },
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
        shots: [{ until: Infinity, camera: 'map', ease: 'inout', keys: [
          { x, y, zoom: zoom * .85, az: Q - .1 }, { focus: true, zoom: zoom * .9, az: Q + .1 },
        ] }],
      };
    },
  },
];
