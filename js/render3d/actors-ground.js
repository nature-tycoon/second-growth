// Drawing walkers (part of Actors.update, actors.js): a land animal wading or swimming out of its
// depth, its stride and gait (birds' wings blend here too), where its head is (grazing, drinking,
// stalking, a bout, a bird's head), and a hunter's crouch, pounce, lunge and stumble.
import { trait } from '../data/animal-kinds.js';
import { strideFollowsGround } from './stride.js';
import { mealHead, nibbles, fruitHead } from './eating-pose.js';
import { waterSurfaceY } from './terrain.js';

// A land animal wades while its head is clear of the water. Where the water is deeper than
// that it swims, body under and head out, instead of walking along the bottom. (The drawn
// water also reaches onto the bank, and managed water covers land tiles.)
export function wadeOrSwim(A, c) {
  const { w, a, mo, sc, surf, ground } = c;
  const drawn = A.terrain?.waterAt?.(a.x, a.y);
  const level = Number.isFinite(drawn) ? drawn : surf ?? waterSurfaceY(w, a.x, a.y) ?? -Infinity;
  const swimY = level - mo.eye[1] * sc * 0.85;
  if (swimY > ground) { c.y = swimY; c.swimming = true; }
}

// a longer stride at a sprint, a shorter one at a creep, and blend between standing, walking and flying
export function gait(c) {
  const { game, a, def, st, mo, k, time, flying, swimming, dx, dz, moving, returning } = c;
  st.t = time;
  st.px = a.x; st.py = a.y;
  // (standing but nudged over by a neighbour: a little shuffle of the feet, not a glide)
  const shuffle = !moving && !flying && a.state === 'idle' && dx * dx + dz * dz > 1e-8;
  // (and the legs keep pace with the ground it covers: held up by a trunk or the one in front,
  // it shortens its step and slows its legs instead of striding on the spot: stride.js)
  const walker = !flying && !mo.primate && !mo.swims && !swimming && !def.reef && (def.move === 'ground' || def.move === 'semi');
  const clock = returning ? 0 : a.phase - (st.legClock ?? a.phase);
  st.legClock = a.phase;
  const stride = walker && game.speed > 0 ? strideFollowsGround(st, def, Math.sqrt(dx * dx + dz * dz), clock, k) : null;
  if (walker) st.legPhase = (st.legPhase ?? a.phase * Math.PI) + Math.max(0, Math.min(3, clock)) * Math.PI * (moving && stride ? stride.rate : 1);
  st.gait += ((moving ? Math.min(1.35, 0.55 + 0.45 * (a.run || 1)) * (stride ? Math.max(0.3, stride.width) : 1) : shuffle ? 0.35 : 0) - st.gait) * k;
  const bathing = a.bird?.kind === 'bathe', preening = a.bird?.kind === 'preen';
  const birdWings = bathing ? 0.16 + Math.abs(Math.sin(a.phase * 1.7)) * 0.2 : preening ? 0.08 : 0;
  st.fly += ((flying ? 1 : birdWings) - st.fly) * k * 1.5;
  c.walker = walker; c.bathing = bathing; c.preening = preening;
}

// heads down to graze, and for everyone drinking at the water's edge or feeding at a kill;
// low while stalking, sniffing at a neighbour or locking horns, up when something's wrong
export function headPose(A, c) {
  const { game, w, a, def, st, mo, sc, k, time, swimming, heading, moving, bathing, preening } = c;
  let { y } = c;
  const aligned = heading == null || Math.cos(st.yaw + heading) > 0.95;
  const stalking = a.state === 'hunt' && a.hunt?.phase === 'creep';
  const fight = A.bout(game, a, st, time);
  const bugling = a.bugleT > 0 && !moving; // (a bull elk throws his head back to bugle)
  const birdHead = a.bird?.kind === 'fruit' ? fruitHead(def, a, time) : a.bird?.kind === 'forage' ? (Math.sin(a.phase * 1.8) > 0.25 ? 1 : -0.1)
    : bathing ? 0.5 + Math.sin(a.phase * 2.1) * 0.35 : preening ? 0.35 + Math.sin(a.phase * 0.8) * 0.3 : a.bird?.kind === 'nest' ? 0.45 : null;
  const meal = mealHead(a, w, time); // (the eating styles: eating-pose.js)
  const head = swimming ? 0 : a.cache && a.move === 'ground' && !moving ? (Math.sin(time * 7 + a.id) > -0.3 ? 1 : 0.5) : fight ? fight.head : bugling ? -0.75 : meal != null ? meal : stalking ? 0.45 : a.greetT > 0 ? 0.35 : a.alertT > 0 ? -0.3 : birdHead != null ? birdHead
    : !moving && (a.drinkT > 0 ? aligned : ((trait(def, 'idleEat') === 'graze' || nibbles(def, a)) && !a.headUp && Math.sin(time * 0.35 + a.id * 1.7) > 0.1)) ? 1 : 0;
  st.graze += (head - st.graze) * k * (head < 0 ? 1.2 : fight ? 3 : 0.5);
  if (fight) st.gait += (fight.gait - st.gait) * k;
  // stalking cats sink low to the ground
  st.crouch = (st.crouch || 0) + ((stalking && !swimming ? 1 : 0) - (st.crouch || 0)) * k;
  if (st.crouch > 0.01) y -= st.crouch * (def.sprite.leg || def.sprite.h || 8) * sc * 0.3;
  c.y = y; c.fight = fight; c.bugling = bugling;
}

// A pounce (startLeap in sim/animal-life.js): up on its arc, the body stretched out, forelegs
// reaching for the prey and hind legs trailing, nose up as it springs and down as it lands.
// A dog or hyena closing to grab drives its head and forequarters in (hunt.lunge); a hunter
// that came down short stumbles (stumblePose).
export function huntPose(c) {
  const { a, st, mo, sc, k, walker, fight } = c;
  let { y, posePitch, poseFly } = c;
  let ax = a.x + (fight?.dx || 0), az = a.y + (fight?.dz || 0);
  const hunt = a.state === 'hunt' ? a.hunt : null, leap = walker && hunt?.leap;
  st.leapU = leap ? leap.u : -1; // (scene.js puffs dust where it springs and lands)
  if (leap) {
    const u = leap.u;
    y += 4 * u * (1 - u) * leap.arc * mo.len * sc;
    posePitch = (0.5 - u) * Math.min(0.7, 0.15 + leap.arc * 1.2);
    poseFly = -(0.55 + 0.45 * Math.sin(Math.PI * u));
    st.gait = 0.1;
  }
  st.lunge = (st.lunge || 0) + ((hunt?.lunge || 0) - (st.lunge || 0)) * Math.min(1, k * 3);
  if (st.lunge > 0.01) {
    const reach = st.lunge * mo.len * sc * 0.12;
    ax += Math.cos(st.yaw) * reach; az -= Math.sin(st.yaw) * reach;
    posePitch -= 0.12 * st.lunge; st.graze = Math.max(st.graze, 0.35 * st.lunge);
  }
  c.y = y; c.ax = ax; c.az = az; c.hunt = hunt; c.posePitch = posePitch; c.poseFly = poseFly;
}

export function stumblePose(c) {
  const { a, hunt } = c;
  if (hunt?.stumble > 0) { const f = hunt.stumble / 0.3; c.posePitch -= 0.25 * f; c.poseRoll = 0.14 * f * (a.id % 2 ? 1 : -1); }
}
