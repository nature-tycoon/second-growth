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
//   preroll: seconds the scene runs before filming starts (a staged hunt's slow approach), a frame at a time
//   vertical: also film a 1080×1920 (9:16) version, for Shorts (and the phone hero)
//   frame: [width, height] of a wide clip's window (default 1920×1080)
//   scale, bitrate { mp4, webm }, budget: for a clip shown full screen, film at a higher pixel ratio
//     (4/3: 2560×1440, the same view) with more bits and a bigger file cap (bytes; website-check
//     allows 10 MB only for the hero and descent). The defaults: 1920×1080, 2.9 and 2.3 Mbit/s, 4.6 MB
//   setup(g, pose, wl): poses the scene, returns { focus, shots, description }
//   shots: what the camera does, one after another in the rendered time (which includes the
//     crossfade's extra second at the start):
//     { until, camera: 'map', keys: [{ x, y, zoom, az }], ease } the usual (overhead) view, gliding
//       through the keys (Catmull-Rom, evenly spaced in time); ease 'linear' (steady) or 'inout'.
//       A key { focus: true, zoom, az } sits on the focus animal wherever it has got to.
//       A two-key path with ease 'linear' moves at one steady speed (a drift, a slow turn).
//       closed: true goes round the keys and back to the first once per clip.seconds (a full turn
//       round a subject, say), so a crossfade loop only blends the animals
//     { until, camera: 'follow', zoom: [from, to], az: [from, to] } the game's own follow camera on the focus
//       animal (its drawn body, height and all: a bird over the crowns stays in frame), zooming and turning steadily
//     { until, camera: 'eye', dissolve } eye level behind the focus animal (render3d/eye-camera.js),
//       dissolving in from the last frame of the shot before over `dissolve` seconds
import { websiteMoment } from './website-moment-fixtures.mjs';
import { startFeed } from '../js/sim/animal-life.js';

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

// A staged hunt: hungry hunters posed near their prey, and the hunt begun through the game's own
// startHunt (prey limited to `diet`). Everything after that, the stalk, rush, leap and catch or miss,
// is the simulation's. Returns the hunter.
function huntFrom(g, wl, hunter, diet) {
  const def = g.catalog.animals[hunter.sp];
  hunter.hunger = 30; hunter.wait = 0;
  if (!wl.startHunt(hunter, def, diet, 14)) throw Error(`The ${def.key} found no ${diet.join(' or ')} to hunt`);
  return hunter;
}
// A staged kill: the catch as the game makes one (wildlife-intent.js after a successful roll), the
// prey removed and the hunter left feeding at its carcass. Only the roll itself is skipped.
function killFor(g, wl, hunter, prey) {
  hunter.hunger = 0; hunter.wait = 0;
  g.onPredation(hunter, prey); wl.remove(prey, 'predation');
  startFeed(wl, hunter, g.catalog.animals[hunter.sp], prey);
}
// The keystone reel's clips play in a grid, never more than about 430 px wide, so they are filmed in a
// 1600×900 frame (the smallest website-check allows; the renderer never draws below a pixel ratio of 1,
// so it is a smaller window, not a smaller scale: the animals as big, a little less ground round them)
// with the bits per pixel of 1920×1080 at 3.9 Mbit/s. The default 2.9 Mbit/s at 1920 smeared fur,
// feathers and grass; this keeps the detail at about two thirds of the bytes.
const REEL = { frame: [1600, 900], bitrate: { mp4: 2.7e6, webm: 2.15e6 }, budget: 4.6e6 };
// Release posed animals to get on with their own lives, a moment apart.
const release = (animals, from = .05) => animals.forEach((a, n) => { a.wait = from + n * .04; });

export const CLIPS = [
  {
    id: 'hollis-creek-flyover', title: 'Hollis creek flyover', map: 'pnw', seconds: 10, loop: 'none', time: .79, pace: 4, vertical: true,
    // (the hero, full screen: 2560×1440 at 7 Mbit/s keeps about 87% of the rendered detail, against 77% at 1920×1080 and 2.9)
    scale: 4 / 3, bitrate: { mp4: 7e6, webm: 5.5e6 }, budget: 9.4e6,
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
    // (pinned full screen while it scrubs. Its fast push-in is the hardest footage to encode: at 2.9 Mbit/s
    // it kept half the rendered detail. A keyframe every second instead of every half made no visible difference)
    scale: 4 / 3, bitrate: { mp4: 6e6, webm: 4.2e6 }, budget: 9.4e6,
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
    id: 'moment-elk-rut', title: 'Keystone moment: the elk rut', map: 'pnw', seconds: 8, loop: 'none', time: .8, pace: 4, ...REEL,
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
    id: 'hunt-lions', title: 'Lions stalk wildebeest', map: 'serengeti', seconds: 9, preroll: 8.5, loop: 'none', time: .74, pace: 4, ...REEL,
    kind: 'staged hunt study',
    setup(g, pose, wl) {
      const herd = [[50, 40], [52, 41], [52, 39], [51, 43], [54, 42]].map(([x, y]) => pose('wildebeest', x, y, 'land', 2.8));
      release(herd);
      const lion = pose('lion', 44, 41, 'land', 0), mate = pose('lion', 44, 44, 'land', .2);
      mate.hunger = 30; huntFrom(g, wl, lion, ['wildebeest']);
      g.selectedAgent = mate; // (the tracking lens shows it through leaves and cover, as in play: 0040)
      return {
        focus: mate, watch: [lion, mate, herd[0], herd[1]],
        description: 'Two hungry lions posed downwind of a grazing wildebeest herd on restored grassland; the hunt is begun through the game\'s own startHunt and the stalk, rush and outcome are the simulation\'s.',
        shots: [{ until: Infinity, camera: 'map', ease: 'linear', keys: [
          { focus: true, zoom: 7, az: Q - .25 }, { focus: true, zoom: 7.6, az: Q + .15 },
        ] }],
      };
    },
  },
  {
    id: 'vultures-descend', title: 'Vultures circle down to a kill', map: 'serengeti', seconds: 9, preroll: 2, loop: 'none', time: .62, pace: 4, ...REEL,
    kind: 'staged scavenging study',
    setup(g, pose, wl) {
      const lion = pose('lion', 60, 30, 'land', 1.2), mate = pose('lion', 61, 32, 'land', 2.4), prey = pose('buffalo', 61, 30, 'land', .4);
      killFor(g, wl, lion, prey);
      mate.wait = .1; // (already fed: it lies up by the kill)
      const vultures = [[55, 26], [57, 24], [66, 27]].map(([x, y], n) => {
        const v = pose('vulture', x, y, 'land', n);
        Object.assign(v, { flying: true, alt: 1.2 + n * .1, hunger: 30, wait: .05 + n * .05 });
        return v;
      });
      g.selectedAgent = lion; // (the tracking lens shows it through leaves and cover, as in play: 0040)
      return {
        focus: lion, watch: [lion, mate, ...vultures],
        description: 'A pride\'s fresh buffalo kill (the catch staged through the game\'s own catch path) with hungry vultures soaring nearby; they find the carcass and spiral down to it by the game\'s scavenging behaviour.',
        shots: [{ until: Infinity, camera: 'map', ease: 'linear', keys: [
          { x: 60.5, y: 30.5, zoom: 5.6, az: Q - .3 }, { x: 61, y: 30.8, zoom: 6.6, az: Q + .3 },
        ] }],
      };
    },
  },
  {
    id: 'hunt-blacktip', title: 'A blacktip shark chases longtom', map: 'reef', seconds: 8, loop: 'none', time: .45, pace: 4, ...REEL,
    kind: 'staged hunt study',
    setup(g, pose, wl) {
      const school = [[62, 56], [63, 57], [63, 55], [64, 56]].map(([x, y], n) => pose('longtom', x, y, 'reef', 3 + n * .2));
      release(school);
      const shark = pose('blacktip', 56, 56, 'reef', 0);
      huntFrom(g, wl, shark, ['longtom']);
      g.selectedAgent = shark; // (the tracking lens shows it through leaves and cover, as in play: 0040)
      return {
        focus: shark, watch: [shark, ...school.slice(0, 3)],
        description: 'A hungry blacktip reef shark posed a few tiles from a school of longtom over the reef; the hunt is begun through the game\'s own startHunt, and the chase, the longtom\'s skipping escape across the surface and the outcome are the simulation\'s.',
        shots: [{ until: Infinity, camera: 'map', ease: 'linear', keys: [
          { focus: true, zoom: 9, az: Q - .2 }, { focus: true, zoom: 9.6, az: Q + .2 },
        ] }],
      };
    },
  },
  {
    id: 'hunt-hawk', title: 'A red-tailed hawk takes a chipmunk', map: 'atlanta', seconds: 8, loop: 'none', time: .5, pace: 4, ...REEL,
    kind: 'staged hunt study',
    setup(g, pose, wl) {
      g.wildRng.setState(1); // (run seed 1: in this run the first stoop connects; in many it misses)
      const chipmunks = [[34, 26], [36, 27]].map(([x, y], n) => pose('chipmunk', x, y, 'land', n * 2));
      release(chipmunks);
      const hawk = pose('hawk', 30, 23, 'land', 0);
      Object.assign(hawk, { flying: true, alt: 1.1 });
      huntFrom(g, wl, hawk, ['chipmunk']);
      g.selectedAgent = hawk; // (the tracking lens shows it through leaves and cover, as in play: 0040)
      return {
        focus: hawk, watch: [hawk, ...chipmunks],
        description: 'A hungry red-tailed hawk posed on the wing over backyards near two foraging chipmunks (run seed 1); the hunt is begun through the game\'s own startHunt, and the circling, the stoop, the catch roll and carrying the catch to a perch are the simulation\'s.',
        shots: [{ until: Infinity, camera: 'follow', zoom: [7.4, 8.2], az: [Q - .25, Q + .2] }],
      };
    },
  },
  {
    id: 'moment-hatchlings', title: 'Keystone moment: hatchlings run for the sea', map: 'chinandega', seconds: 8, loop: 'none', time: .6, pace: 4, ...REEL,
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
