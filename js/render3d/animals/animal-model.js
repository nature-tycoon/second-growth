// Species-to-model dispatch, movement metadata and model-space poses.
import * as THREE from 'three';
import { Model, P, quadruped, smooth } from './model-core.js';
import { bear, rabbit, squirrel, vole } from './small-mammals.js';
import { armadillo, capybara, hippo, tapir } from './large-mammals.js';
import { monkey, orangutan, pangolin, siamang, sloth } from './canopy-mammals.js';
import { butterflyfish, caiman, dolphin, dugong, fish, frog, idol, monitor, newt, ray, seaCucumber, seaTurtle, seaUrchin, shark, snake, turtle } from './aquatic-reptiles.js';
import { MAMMALS, sumatranElephant, sumatranRhino, tiger } from './quadrupeds.js';
import { BIRDS, bird } from './birds.js';
import { bat, bee, beetle, butterfly } from './winged-animals.js';
import { person } from './people.js';
import { howlerRig } from '../howler-motion.js';
import { canopyWalkerBends, isCanopyWalker } from '../canopy-walker-profile.js';

// Returns static geometry and movement metadata. The caller owns the returned geometry.
export function buildSpecies(def) {
  const s = { ...def.sprite, canopyWalkerMotion: isCanopyWalker(def) && def.sprite.canopyWalkerMotion !== false }, m = new Model();
  const mo = { leg: 0.55, bob: 0, tail: 0.25, flap: 1.6, wave: 0, waveK: 0, waveHead: 0, waveLen: 1, sink: 0, len: s.len || s.size };
  switch (s.kind) {
    case 'squirrel': squirrel(m, s); mo.leg = 0.45; mo.bob = 1.1; mo.sink = 3; break;
    case 'rodent': vole(m, s); mo.leg = 0.6; mo.bob = 0.5; mo.sink = 2.5; break;
    case 'rabbit': rabbit(m, s); mo.leg = 0.35; mo.bob = 2.6; mo.sink = 3.5; break;
    case 'bear': bear(m, s); mo.leg = 0.38; mo.bob = 0.6; mo.sink = s.leg + s.h * 0.45; break;
    case 'capybara': capybara(m, s); mo.leg = 0.45; mo.bob = 0.4; mo.sink = s.len * 0.3; break;
    case 'tapir': tapir(m, s); mo.leg = 0.45; mo.bob = 0.3; mo.sink = s.leg + s.h * 0.4; break;
    case 'armadillo': armadillo(m, s); mo.leg = 0.7; mo.bob = 0.3; mo.sink = s.len * 0.2; break;
    case 'monkey': if (s.ape) { siamang(m, s); mo.leg = 0.45; mo.bob = 0.4; mo.tail = 0; mo.head = 0.45; } else { monkey(m, s, def.move === 'tree'); mo.leg = 0.6; mo.bob = 0.6; mo.tail = 0.15; } break;
    case 'orangutan': orangutan(m, s); mo.leg = 0.3; mo.bob = 0; mo.tail = 0; mo.head = 0.45; mo.sink = s.len * 0.4; break;
    case 'pangolin': pangolin(m, s); mo.leg = 0.5; mo.bob = 0.25; mo.tail = 0.12; mo.sink = s.len * 0.22; break;
    case 'sloth': sloth(m, s); mo.leg = 0.12; mo.tail = 0; mo.canopyHanging = true; break;
    case 'caiman': caiman(m, s); mo.leg = 0.4; mo.tail = 0.35; mo.wave = s.len * 0.025; mo.waveK = 6 / s.len; mo.waveHead = s.len * 0.1; mo.waveLen = s.len * 0.7; mo.sink = s.len * 0.09; break;
    case 'ray': ray(m, s); mo.flap = 0.9; mo.tail = 0.3; mo.leg = 0; break;
    case 'dolphin': dolphin(m, s); mo.verticalWave = 1; mo.tail = 0.12; mo.wave = s.size * 0.03; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.2; mo.waveLen = s.size * 0.8; mo.sink = s.size * 0.1; break;
    case 'deer': case 'canine': case 'feline': case 'raccoon': case 'otter': case 'beaver':
    case 'peccary': case 'agouti': case 'anteater':
    case 'antelope': case 'zebra': case 'wildebeest': case 'gazelle': case 'impala': case 'buffalo': case 'warthog': case 'hyena': case 'rhino': case 'giraffe': case 'elephant': {
      // Sumatra's tiger, elephant and rhino have builders of their own
      const own = s.kind === 'feline' && s.stripes ? tiger : s.kind === 'elephant' && s.asian ? sumatranElephant : s.kind === 'rhino' && s.hairy ? sumatranRhino : null;
      if (own) { Object.assign(mo, own(m, s)); break; }
      const o = MAMMALS[s.kind](s);
      quadruped(m, s, o);
      mo.bob = o.H * (o.bobMotion ?? (s.kind === 'rabbit' ? 0.35 : s.kind === 'rodent' || s.kind === 'squirrel' ? 0.12 : 0.04));
      mo.leg = o.legMotion ?? (s.kind === 'elephant' || s.kind === 'rhino' ? 0.3 : s.kind === 'giraffe' ? 0.38 : 0.55);
      mo.sink = o.leg + o.H * 0.45;
      break;
    }
    case 'songbird': case 'hummer': case 'woodpecker': case 'heron': case 'duck': case 'booby': case 'raptor': case 'owl': case 'toucan': case 'macaw': case 'ostrich': case 'hornbill': case 'vulture': case 'secretary': case 'crane':
      bird(m, s);
      mo.flap = s.kind === 'hummer' ? 7 : s.kind === 'booby' ? 1.25 : s.kind === 'heron' || s.kind === 'raptor' || s.kind === 'owl' || s.kind === 'macaw' || s.kind === 'vulture' || s.kind === 'crane' || s.kind === 'secretary' ? 0.9 : 2;
      mo.leg = 0.5; mo.tail = s.cocked ? 0.13 : 0.065; mo.bird = 1; mo.billSweep = !!s.spoonbill;
      mo.wingSpan = s.size * BIRDS[s.kind](s).span * 1.7;
      mo.sink = s.kind === 'duck' || s.kind === 'booby' ? s.size * 0.24 : 0;
      // Wading can cover the lower legs, while the belly stays above the surface.
      if (s.kind === 'heron' || s.kind === 'crane') mo.wadeDepth = BIRDS[s.kind](s).legH * s.size * 0.55;
      break;
    case 'bat': bat(m, s); mo.flap = 2.6; break;
    case 'butterfly': butterfly(m, s); mo.flap = 1.7; mo.leg = 0; mo.tail = 0; break;
    case 'bee': bee(m, s); mo.flap = 9; mo.leg = 0.2; mo.tail = 0; break;
    case 'seacucumber': seaCucumber(m, s); mo.leg = 0; mo.tail = 0; break;
    case 'urchin': seaUrchin(m, s); mo.leg = 0; mo.tail = 0; break;
    case 'beetle': beetle(m, s); mo.leg = 0.7; mo.tail = 0; break;
    case 'monitor': monitor(m, s); mo.leg = 0.55; mo.wave = s.size * 0.04; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.3; mo.waveLen = s.size * 1.2; mo.sink = s.size * 0.1; break;
    case 'hippo': hippo(m, s); mo.leg = 0.28; mo.bob = 0.3; mo.tail = 0.5; mo.sink = s.leg + s.h * 0.55; break;
    case 'frog': frog(m, s); mo.leg = 0.3; mo.bob = s.size * 0.5; mo.sink = s.size * 0.3; break;
    case 'newt': newt(m, s); mo.leg = 0.5; mo.wave = s.size * 0.05; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.4; mo.waveLen = s.size * 1.2; mo.sink = s.size * 0.12; break;
    case 'turtle': if (s.sea) { seaTurtle(m, s); mo.leg = 0.55; mo.bob = 0; } else turtle(m, s); mo.leg ??= 0.35; mo.sink = s.size * 0.2; break;
    case 'dugong': dugong(m, s); mo.leg = 0.32; mo.tail = 0; break; // (the flukes beat up and down: see dugong)
    // (a snake's S-curve rides back along its body as it crawls; see uSlither in the shader)
    case 'snake': mo.slither = snake(m, s); mo.tongue = 1; mo.sink = s.size * (s.heavy ? .095 : .045); break;
    case 'person': person(m, s.look, !!s.snorkel); mo.leg = 0.5; mo.bob = 0.5; mo.len = 8; break;
    case 'butterflyfish': butterflyfish(m, s); mo.wave = s.size * 0.04; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.1; mo.waveLen = s.size * 0.6; mo.sink = s.size * 0.32; mo.tail = 0.5; break;
    // (a shark swims with its whole back half: about one wave along the body, the head almost
    // still and the sweep growing toward the tail, which rides the same wave rather than flicking
    // on its own; and it curves into a C as it turns: see bend in actors.js)
    case 'shark': shark(m, s); mo.wave = s.size * 0.085; mo.waveK = 6.28 / (s.size * 1.05); mo.waveHead = s.size * 0.42; mo.waveLen = s.size * 1.1; mo.waveMin = 0.04; mo.wavePow = 1.8; mo.bend = s.size * 0.22; mo.sink = s.size * 0.16; mo.tail = 0; break;
    case 'idol': idol(m, s); mo.wave = s.size * 0.04; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.1; mo.waveLen = s.size * 0.6; mo.sink = s.size * 0.32; mo.tail = 0.5; break;
    case 'fish': fish(m, s); mo.wave = s.size * 0.07; mo.waveK = 3 / s.size; mo.waveHead = s.size * 0.25; mo.waveLen = s.size * 0.9; mo.sink = s.size * 0.2; mo.tail = 0.5; break;
    default: m.ell([0, 4, 0], [4, 4, 4], s.color || '#888');
  }
  mo.eye = m.eyeAt || null; mo.eyePivot = m.eyePivot || [0, 0, 0]; // where the eyes are, in model units (for eye-shine)
  if (['monkey', 'orangutan'].includes(s.kind)) {
    mo.primate = s.kind === 'orangutan' ? 2 : s.ape ? 3 : 1;
    mo.bob = 0; mo.len = s.len;
    const hand = s.kind === 'orangutan' ? [.3, .06, .14] : s.ape ? [.6, 1.02, -.1] : [.32, .03, def.move === 'tree' ? .04 : .12];
    m.ell(hand.map((v, i) => (v + (i === 0 ? .035 : 0)) * s.len), [s.len * .045, s.len * .045, s.len * .045], '#d9a342', { part: P.FRUIT, pivot: hand.map(v => v * s.len), lo: true });
  }
  const geo = m.build();
  if (mo.primate) feedingPose(geo, s, def.move === 'tree');
  if (s.ape) swingPoses(geo, s.len);
  geo.computeBoundingBox();
  if (def.move === 'tree') {
    // Tails and orangutan hair can hang below the grips. Use actual toes for
    // orangutans, the high hand for a gibbon, and limb bounds for other climbers.
    const p = geo.attributes.position, parts = geo.attributes.aPart;
    let foot = Infinity;
    for (let i = 0; i < p.count; i++) if (parts.getX(i) >= 1 && parts.getX(i) <= 4) foot = Math.min(foot, p.getY(i));
    mo.supportY = s.ape ? s.len * 1.38 : s.kind === 'orangutan' ? -s.len * .015 : s.kind === 'sloth' ? s.len * .98 : Number.isFinite(foot) ? foot : 0;
  }
  if (s.ape) { mo.gripX = s.len * .14; mo.gripZ = s.len * .02; }
  if (def.move === 'tree' && mo.primate === 1) {
    mo.canopyFeet = [[.32, 0, .04], [.32, 0, -.04], [-.2, 0, .04], [-.2, 0, -.04]].map(p => new THREE.Vector3(...p).multiplyScalar(s.len));
    const height = s.long ? .62 : .45;
    mo.canopyJoints = [[.22, height + .06, .1], [.22, height + .06, -.1], [-.26, height, .1], [-.26, height, -.1]].map(p => new THREE.Vector3(...p).multiplyScalar(s.len));
    mo.canopyWalkerMotion = s.canopyWalkerMotion;
    mo.canopyReachScale = height / .45;
    mo.canopyTurnLead = s.long ? 1.35 : .85;
    if (mo.canopyWalkerMotion) howlerRig(mo);
  }
  if (def.move === 'tree' && mo.primate === 2) {
    // Actual curled finger/toe contacts, and the shoulders/hips above them.
    // The clamber is supported by these contacts instead of a sliding cycle.
    const bulk = s.flanged ? 1.15 : 1;
    mo.canopyFeet = [[.32, -.005, .14], [.32, -.005, -.14], [-.125, -.015, .12], [-.125, -.015, -.12]].map(p => new THREE.Vector3(...p).multiplyScalar(s.len));
    mo.canopyJoints = [[.07, .56, .13 * bulk], [.07, .56, -.13 * bulk], [-.07, .27, .08 * bulk], [-.07, .27, -.08 * bulk]].map(p => new THREE.Vector3(...p).multiplyScalar(s.len));
    mo.canopyFootReach = [.36, .36, .18, .18];
    mo.canopyPitchLimit = 1.25;
  }
  if (def.move === 'tree' && mo.canopyHanging) {
    mo.canopyFeet = [[.4, .98, .02], [.4, .98, -.02], [-.44, .98, .02], [-.44, .98, -.02]].map(p => new THREE.Vector3(...p).multiplyScalar(s.len));
    mo.canopyJoints = [[.18, .56, .12], [.18, .56, -.12], [-.26, .56, .12], [-.26, .56, -.12]].map(p => new THREE.Vector3(...p).multiplyScalar(s.len));
  }
  // A shared anchor for locating, picking and highlighting the visible model,
  // including models that hang below their origin or have an offset body.
  mo.center = geo.boundingBox.getCenter(new THREE.Vector3());
  mo.revealBounds = geo.boundingBox.clone();
  if (mo.primate || mo.canopyHanging) {
    // Deduplicate the actual body surface for clearance at crowded woody forks.
    // Hands, feet, fruit and the tail are allowed to touch their support.
    const cells = new Map(), cell = s.len * .001; let offset = 0;
    geo.userData.canopyCore = [];
    for (const part of m.parts) {
      const p = part.attributes.position, id = part.attributes.aPart.getX(0);
      if (!part.userData.canopyFur && (id === P.BODY || id === P.HEAD)) {
        geo.userData.canopyCore.push([offset, offset + p.count]);
        for (let i = 0; i < p.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(p, i), key = [v.x, v.y, v.z].map(n => Math.round(n / cell)).join(':');
          if (!cells.has(key)) cells.set(key, v);
        }
      }
      offset += p.count;
    }
    mo.canopyBody = [...cells.values()];
    mo.canopyBounds = new THREE.Box3().setFromPoints(mo.canopyBody);
  }
  return { geo, motion: mo };
}

// Fold the feeding arm at its elbow into a hand-to-mouth pose. The second
// position/normal attributes are already shared by the fauna shader for wing poses.
function feedingPose(geo, s, onBranches) {
  const L = s.len, ape = !!s.ape, orang = s.kind === 'orangutan', by = s.long ? .62 : .45;
  const shoulder = orang ? [.07, .56, .13 * (s.flanged ? 1.15 : 1)] : ape ? [.04, .84, -.1] : [.22, by + .06, .1];
  const elbow = orang ? [.19, .31, .15] : ape ? [.32, .8, -.18] : s.canopyWalkerMotion ? canopyWalkerBends(1,by)[0] : [.26, by * .5, .12];
  const hand = orang ? [.3, .06, .14] : ape ? [.6, 1.02, -.1] : [.32, .03, onBranches ? .04 : .12];
  const target = orang ? [.32, .615, .09] : ape ? [.28, .95, -.08] : [s.shortTail ? .59 : .55, by + .19, .08];
  poseArm(geo, P.LEG_FL, L, shoulder, elbow, hand, target, 'aExt', 'aExtN', ape ? 0 : 1, s.canopyWalkerMotion);
  const pos = geo.attributes.position, ext = geo.attributes.aExt, part = geo.attributes.aPart;
  for (let i = 0; i < pos.count; i++) if (part.getX(i) === P.FRUIT) {
    // Keep the fruit just beyond the fingers instead of rotating it inside the face.
    ext.setXYZ(i, pos.getX(i) + (target[0] - hand[0]) * L, pos.getY(i) + (target[1] - hand[1]) * L, pos.getZ(i) + (target[2] - hand[2]) * L);
  }
}

function swingPoses(geo, L) {
  // Only gibbons need these extra static attributes; instance data stays unchanged.
  geo.setAttribute('aSwing', geo.attributes.position.clone());
  geo.setAttribute('aSwingN', geo.attributes.normal.clone());
  poseArm(geo, P.LEG_FL, L, [.04, .84, -.1], [.32, .8, -.18], [.6, 1.02, -.1], [.14, 1.355, -.02], 'aSwing', 'aSwingN', 0);
  poseArm(geo, P.LEG_FR, L, [.05, .84, .1], [.13, 1.1, .12], [.14, 1.355, .02], [.53, 1.02, .1], 'aSwing', 'aSwingN', 1);
}

// Two-bone elbow bend baked into an alternate pose, including matching normals.
function poseArm(geo, id, L, shoulder, elbow, hand, target, positions, normals, axis, rigid = false) {
  const a = Math.hypot(elbow[0] - shoulder[0], elbow[1] - shoulder[1]), b = Math.hypot(hand[0] - elbow[0], hand[1] - elbow[1]);
  const dx = target[0] - shoulder[0], dy = target[1] - shoulder[1], d = Math.min(a + b - .001, Math.max(Math.abs(a - b) + .001, Math.hypot(dx, dy)));
  const angle = Math.atan2(dy, dx) - Math.acos(THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  const e = [shoulder[0] + a * Math.cos(angle), shoulder[1] + a * Math.sin(angle)];
  const upper = angle - Math.atan2(elbow[1] - shoulder[1], elbow[0] - shoulder[0]);
  const lower = Math.atan2(target[1] - e[1], target[0] - e[0]) - Math.atan2(hand[1] - elbow[1], hand[0] - elbow[0]);
  const pos = geo.attributes.position, ext = geo.attributes[positions], normal = geo.attributes.normal, extN = geo.attributes[normals], part = geo.attributes.aPart;
  for (let i = 0; i < pos.count; i++) {
    if (part.getX(i) !== id) continue;
    const x = pos.getX(i) / L, y = pos.getY(i) / L, z = pos.getZ(i) / L;
    let t = smooth(elbow[axis] - .03, elbow[axis] + .03, axis === 0 ? x : y);
    if (hand[axis] < shoulder[axis]) t = 1 - t;
    if(rigid) {
      const pivot=geo.attributes.aPivot;
      t=Math.hypot(pivot.getX(i)/L-elbow[0],pivot.getY(i)/L-elbow[1],pivot.getZ(i)/L-elbow[2])<.001?1:0;
    }
    const transform = (ox, oy, tx, ty, angle) => [tx + (x - ox) * Math.cos(angle) - (y - oy) * Math.sin(angle), ty + (x - ox) * Math.sin(angle) + (y - oy) * Math.cos(angle)];
    const u = transform(shoulder[0], shoulder[1], shoulder[0], shoulder[1], upper), v = transform(elbow[0], elbow[1], e[0], e[1], lower);
    const reach = Math.min(1, Math.hypot(x - shoulder[0], y - shoulder[1]) / Math.hypot(hand[0] - shoulder[0], hand[1] - shoulder[1]));
    ext.setXYZ(i, (u[0] * (1 - t) + v[0] * t) * L, (u[1] * (1 - t) + v[1] * t) * L, (z + (target[2] - hand[2]) * reach) * L);
    const turn = upper * (1 - t) + lower * t, nx = normal.getX(i), ny = normal.getY(i);
    extN.setXYZ(i, nx * Math.cos(turn) - ny * Math.sin(turn), nx * Math.sin(turn) + ny * Math.cos(turn), normal.getZ(i));
  }
}
