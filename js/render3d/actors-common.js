// What every drawn animal goes through in Actors.update (actors.js), whatever its mode: the
// set-up (cull, pose record, scale, its record `c` that the per-mode drawers in actors-ground.js,
// -climb, -fly, -swim and -reef read and write), the one turn (0025), and the final instance.
import * as THREE from 'three';
import { LEVEL, isWater, T, F as FEAT, clamp, lifeAge } from '../config.js';
import { drawDef, animalDef } from '../data/animals.js';
import { trait } from '../data/animal-kinds.js';
import { roostingNow } from '../data/animal-activity.js';
import { treeHeight } from './tree-stature.js';
import { adultAnimalScale } from './animal-scale.js';
import { waterSurfaceY } from './terrain.js';
import { siamangSwing } from './siamang-swing.js';
import { canopyTile } from './canopy-support.js';
import { isCanopyWalker } from './canopy-walker-profile.js';
import { animalViewRadius } from './actor-view.js';

export const PX = 1 / 50; // sprite pixels to scene units
const SOAR_BANK = 0.35; // a circling hawk leans into its turn
// Every drawn animal and visitor turns through turnToward, and only once a frame (0025): kinds
// differ in what they turn toward (the simulation's `a.heading`, the bark a woodpecker clings to,
// a starfish being eaten, the branch a climber is on) and how fast (TURN), never in how. A drawn
// yaw is minus the simulation's heading (x east, z south). `ease` is per frame ease k (about 6 a
// second); `max` caps the radians it turns this frame.
export const TURN = { body: 1.6, cling: 3, canopy: 1.2, ape: 0.7, snap: Infinity }; // (ape: an orangutan's long body swings round slowly)
export function turnToward(st, target, ease, k, max = Infinity) {
  let d = target - st.yaw; d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
  st.yaw += clamp(d * Math.min(1, k * ease), -max, max);
}

// Where a salmon is in its leap (0..1 across the arc), or -1 when it's swimming. Each fish leaps
// on its own clock, every three seconds or so.
export function salmonLeap(a, time) {
  const period = 2.4 + (a.id % 7) * 0.35, dur = 0.95;
  const t = (time + a.id * 1.37) % period;
  return t < dur ? t / dur : -1;
}

// A raptor's or owl's catch (sim/bird-behavior.js carryCatch): hanging limp below its feet in
// flight (a fish carried level, back up) and lying under its feet while it eats.
const CARRY_FORWARD = 0.18;
function drawCatch(F, game, a, def, st, sc) {
  const pdef0 = game.catalog.animals[a.prey.sp];
  if (!pdef0) return;
  const pdef = drawDef(pdef0, a.prey, game.month);
  const ageF = pdef.mature > 0 ? clamp(0.55 + 0.45 * (a.prey.age || 0) / (pdef.mature * 120), 0.55, 1) : 1;
  const len = s => s.sprite.len || s.sprite.size || 10;
  // (never drawn longer than the bird that holds it: the display boost that makes a vole readable
  // on the ground would otherwise hand a hawk a vole its own size)
  let psc = adultAnimalScale(pdef.sprite) * (a.prey.juvenile ? pdef.sprite.juv ?? 0.5 : 1) * ageF;
  psc = Math.min(psc, len(def) * sc * 0.85 / len(pdef));
  const lie = (pdef.sprite.h || 10) * psc * 0.32, fx = Math.cos(st.yaw), fz = -Math.sin(st.yaw);
  const aloft = a.state === 'carry' && a.carry?.phase !== 'mantle';
  if (aloft) {
    const f = len(def) * sc * CARRY_FORWARD * 0.5, y = st.center.y - st.h * 0.35 - (a.prey.fish ? (pdef.sprite.h || 8) * psc * 0.6 : lie * 1.4); // (in the feet, tucked under the body)
    F.add(pdef, st.x + fx * f, y, st.z + fz * f, st.yaw, psc, 0, 0, 0, 0.6, 0, a.prey.fish ? 0 : Math.PI / 2);
  } else {
    const f = len(def) * sc * CARRY_FORWARD;
    F.add(pdef, st.x + fx * f, st.y + lie, st.z + fz * f, st.yaw + 0.5, psc, 0, 0, 0, 0.6, 0, Math.PI / 2);
  }
}

// One animal's set-up for this frame: null when it isn't drawn (dormant, roosting, out of view).
// Its record `c` carries the frame's values, what's known of it, and what the drawers work out on
// the way (its height y, where it's drawn ax/az, its pose); fr is the frame (Actors.update).
export function beginAnimal(A, fr, a) {
  const { game, w, F, k, frameDt, time, seen } = fr;
  // Dormant residents are sheltered inside dens/roosts, not walking models.
  if (a.state === 'dormant') return null;
  let def = drawDef(animalDef(a, game.catalog), a, game.month); // Adult sex traits and seasonal plumage.
  if (roostingNow(a, def, A.nightOut)) return null; // (a bat by day: in its roost until dusk)
  if (isCanopyWalker(def)) {
    let walker = A.walkerModels.get(def);
    if (!walker) {
      walker = { ...def, key: A.canopyWalkerMotion ? def.key : `${def.key}:legacy-motion`, sprite: { ...def.sprite, canopyWalkerMotion: A.canopyWalkerMotion } };
      A.walkerModels.set(def, walker);
    }
    def = walker;
  }
  seen.add(a.id);
  let st = A.pose.get(a.id);
  const xi = Math.floor(a.x), yi = Math.floor(a.y);
  const inside = w.inb(xi, yi);
  const i = inside ? w.idx(xi, yi) : -1;
  const canopyKey = def.move === 'tree' ? canopyTile(w, game.border, xi, yi) : i;
  const t = inside ? w.terrain[i] : T.RIVER;
  const onWater = isWater(t) && t !== T.MARSH;
  const flying = (def.move === 'fly' && (a.flying || a.alt > 0.05)) || !!trait(def, 'alwaysFlying'); // (a manta "flies" through the water)
  const ground = w.heightAt(clamp(a.x, -9, w.w + 9), clamp(a.y, -9, w.h + 9)) * LEVEL;
  const seaY = game.catalog.definition.look.underwater ? game.catalog.definition.look.underwater.level * LEVEL : null;
  // A located animal must acquire a fresh pose even before the camera has
  // reached it. Otherwise an offscreen canopy animal can never be followed.
  if (A.view.enabled && a !== A.followAgent) {
    let low = ground, high = ground;
    if (onWater || def.move === 'swim' || def.move === 'fly' && isWater(t)) {
      const surface = waterSurfaceY(w, a.x, a.y) ?? ground;
      low = Math.min(low, surface); high = Math.max(high, surface + 0.3); // leaping salmon
    }
    if (seaY != null) { low = Math.min(low, seaY); high = Math.max(high, seaY + (def.sprite.escape === 'skip' ? 0.5 : 0)); }
    if (flying && !def.reef) high = Math.max(high, ground, seaY ?? ground, a.flightY ?? -Infinity) + 4.2; // (over the tallest crowns too: flight-clearance.js)
    else if (inside && (def.move === 'fly' || def.move === 'tree')) {
      if (w.tree[i]) {
        const p = game.catalog.plants[w.tree[i]];
        high += treeHeight(p) * w.treeG[i];
      } else if (w.feature[i] === FEAT.SNAG) high += 0.9;
    }
    if (!inside && def.move === 'tree') {
      const site = A.flora?.treeSites.get(canopyKey);
      if (site) {
        if (!site.geo.boundingBox) site.geo.computeBoundingBox();
        high = Math.max(high, site.transform[1] + site.geo.boundingBox.max.y * site.transform[4]);
      }
    }
    const travellingHold = def.move === 'tree' && st?.branchPoint && st.visible !== false &&
      A.view.visible(st.x, st.y, st.y + st.h, st.z, animalViewRadius(def));
    if (!travellingHold && !A.view.visible(a.x, low, high, a.y, animalViewRadius(def))) {
      if (st) st.visible = false;
      return null;
    }
  }
  A.visibleWildlife.push(a);
  const returning = st?.visible === false;
  if (!st) { st = { yaw: -(a.heading ?? 0), gait: 0, fly: 0, graze: 0, px: a.x, py: a.y, x: a.x, y: 0, z: a.y, h: 0.2 }; A.pose.set(a.id, st); }
  if (returning) {
    // Resume from the current simulation state, not the position/turn/depth last drawn
    // minutes ago. The edge margin gives normal animation blending room to resume.
    st.yaw = -(a.heading ?? 0);
    st.px = a.x; st.py = a.y; st.depth = null; st.bend = 0; st.t = time;
    st.gait = game.speed > 0 && a.state !== 'idle' ? 1 : 0;
    st.fly = flying ? 1 : 0; st.graze = 0;
    st.rippled = a.drinkT > 0; st.leaping = salmonLeap(a, time) >= 0;
  }
  st.visible = true;
  const ageF = def.mature > 0 ? clamp(0.55 + 0.45 * lifeAge(a) / (def.mature * 120), 0.55, 1) : 1;
  const sc = adultAnimalScale(def.sprite) * (a.juvenile ? def.sprite.juv ?? 0.5 : 1) * ageF; // (scale: relative proportions; show: display boost; juv: how small the young are)
  const mo = F.motion(def);
  const surf = onWater || def.move === 'swim' || def.move === 'fly' && isWater(t) ? waterSurfaceY(w, a.x, a.y) : null;
  // Flyers descend relative to the visible surface, even above a deeply carved basin.
  const y = def.move === 'fly' ? Math.max(ground, surf ?? ground) : ground;
  return {
    game, w, F, k, frameDt, time, chased: fr.chased, hunters: fr.hunters, canopySites: fr.canopySites, bridges: fr.bridges, shadow: fr.shadow,
    a, def, st, xi, yi, inside, i, canopyKey, t, onWater, flying, ground, seaY, returning, sc, mo, surf, y,
    perchSite: null, // (the tree a perched bird sits in, when its limbs are known)
    cling: null, // (a woodpecker on a trunk: where on it, and facing it: trunkCling)
    snagTop: null, // (the snag a perched bird sits on top of: its middle)
    swimming: false, // (a land animal out of its depth, paddling with its head out)
    // (worked out on the way: the turn, gait and pose, then where it's drawn)
    dx: 0, dz: 0, yaw0: 0, gait0: 0, moving: false, munch: -1, heading: null, body: null,
    walker: false, bathing: false, preening: false, fight: null, bugling: false,
    ax: 0, az: 0, hunt: null, poseFly: null, posePitch: 0, poseRoll: 0,
    branchPitch: 0, branchRoll: 0, branchYaw: 0, eating: false, eatPose: 0, phase: 0, grips: null,
  };
}

// Which crown a climber or percher is in: it keeps the tree it's in until it's clearly into
// the next one, so an animal nudged back and forth across the line between two trees of
// different heights doesn't bob up and down between them.
export function crownTile(A, c) {
  const { def, st, a, w, returning, canopyKey, i } = c;
  if (def.move === 'tree' && A.flora) {
    const old = A.flora.treeSites.get(st.ctile), cell = old?.cell;
    if (cell && !returning && Math.max(cell[0] - a.x, a.x - cell[0] - 1, cell[1] - a.y, a.y - cell[1] - 1) < .25) return st.ctile;
    return (st.ctile = canopyKey);
  }
  if (st.ctile != null && st.ctile !== i && !returning && st.ctile < w.n) {
    const ox = st.ctile % w.w, oy = (st.ctile / w.w) | 0;
    if (Math.max(ox - a.x, a.x - ox - 1, oy - a.y, a.y - oy - 1) < 0.25 && (w.tree[st.ctile] || w.feature[st.ctile] === FEAT.SNAG)) return st.ctile;
  }
  return (st.ctile = i);
}

// face the way it's moving: the one turn
export function turnBody(c) {
  const { a, st, k, flying, cling, munch, returning } = c;
  const dx = a.x - st.px, dz = a.y - st.py, yaw0 = st.yaw, gait0 = st.gait;
  const moving = a.state !== 'idle' && (dx * dx + dz * dz > 1e-7 || flying);
  // The one turn: to the simulation's heading, which wins over small spacing corrections (they
  // mustn't turn a resting animal sideways; a drinker's heading is the water), or to the bark it
  // clings to, or the starfish it eats. Climbers on a branch and an orangutan on the ground
  // re-take this turn below with their own target and pace.
  const heading = a.heading;
  const body = cling ? { target: cling.yaw, ease: TURN.cling }
    : munch >= 0 && st.munch > 0.01 && !returning ? { target: Math.atan2(-(st.munchAt[2] - a.y), st.munchAt[0] - a.x), ease: TURN.body }
    : heading != null ? { target: -heading, ease: TURN.body }
    : dx * dx + dz * dz > 1e-6 ? { target: Math.atan2(-dz, dx), ease: TURN.body } : null;
  if (body) turnToward(st, body.target, body.ease, k);
  c.dx = dx; c.dz = dz; c.yaw0 = yaw0; c.gait0 = gait0; c.moving = moving; c.heading = heading; c.body = body;
}

// The animation clock it's drawn with: a climber's own, a swimmer's tail beat, a walker's legs.
export function bodyPhase(c) {
  const { a, st, mo, sc, dx, dz, walker, eating } = c;
  const phase = mo.primate === 2 || st.branch && (mo.primate || mo.canopyFeet) ? st.branchPhase || 0 : mo.swims ? st.swimPhase : walker && st.legPhase != null ? st.legPhase : a.phase * Math.PI;
  if (eating) st.graze = 0;
  // A crawling snake's bends advance by the distance it covers, so they stay put on the ground
  // (one full bend per body length; see uSlither in animals/animal-material.js, which reads it from the fly slot).
  if (mo.slither) st.slither = ((st.slither ?? a.id * 2.3) + Math.min(0.5, Math.hypot(dx, dz)) / (mo.slither.len * sc) * Math.PI * 2) % (Math.PI * 2);
  c.phase = phase;
}

// The instance itself, what the camera, the lens and the marker read from its pose, its catch
// and its shadow.
export function finishAnimal(A, c) {
  const { game, F, k, a, def, st, sc, mo, surf, ground, flying, swimming, ax, az, y, phase, grips, eatPose, poseFly, posePitch, poseRoll, branchPitch, branchRoll, branchYaw, fight, bugling, bathing, shadow } = c;
  F.add(def, ax, y, az, st.yaw + branchYaw, sc, phase, st.gait, mo.primate ? eatPose : mo.slither ? st.slither : poseFly ?? st.fly, mo.primate === 2 ? 0 : mo.bend ? st.bend : st.graze, branchPitch + posePitch + (st.pitch || 0) + (fight?.pitch || 0) + (st.bugle = (st.bugle || 0) + ((bugling ? 0.14 : 0) - (st.bugle || 0)) * k), branchRoll + poseRoll + (fight?.roll || (bathing ? Math.sin(a.phase * 2.1) * 0.12 : (st.bank = (st.bank || 0) + ((a.bird?.kind === 'soar' ? a.bird.dir * SOAR_BANK : 0) - (st.bank || 0)) * k))), grips, a === A.followAgent || a === game.selectedAgent);
  st.sc = sc; st.eye = mo.eye; st.eyePivot = mo.eyePivot; st.bob = Math.abs(Math.sin(phase)) * (mo.bob || 0) * st.gait * (1 - st.fly);
  // (the marker lies on the ground under a flyer, at the surface under a swimmer, else at its feet)
  st.base = flying && !def.reef ? Math.max(ground, surf ?? ground) : def.move === 'swim' && surf != null ? surf : y;
  st.foot = (def.sprite.len || def.sprite.size || 10) * sc;
  st.x = ax; st.y = y; st.z = az; st.h = (def.sprite.h ? def.sprite.h + (def.sprite.leg || 0) : (def.sprite.size || def.sprite.len || 10) * 0.6) * sc;
  st.tall = F.height(def) * sc; // (the model's real height, for eye level)
  st.center ||= new THREE.Vector3();
  st.center.copy(mo.center); st.center.y += st.bob;
  if (mo.primate === 3) {
    const swing = siamangSwing(phase, st.gait, eatPose);
    st.center.sub(A.swingGrip.set(...swing.grip).multiplyScalar(mo.len)).applyAxisAngle(A.swingAxis, swing.sway).add(A.swingBase.set(.14, 1.38, .02).multiplyScalar(mo.len));
  }
  st.center.applyMatrix4(F.m); // same heading, pitch, scale and height as the instance
  st.revealBounds = mo.revealBounds; // (the body's box, for the tracking lens: see focus.js)
  if (st.revealBounds) { st.revealMatrix ||= new THREE.Matrix4(); st.revealMatrix.copy(F.m); }
  // (after the reads of F.m above, which must still hold this animal's own instance)
  if (a.prey && (a.state === 'carry' || a.state === 'feed')) drawCatch(F, game, a, def, st, sc);
  if (!st.branch && def.move !== 'swim' && !swimming && !(surf != null && trait(def, 'floats'))) {
    // (a shaped shadow fades and softens a little the higher the animal is above the ground)
    const shape = (def.reef || def.move === 'fly') && A.silhouettes.shape(F, def, def.reef ? 0.5 : 0);
    if (shape) A.silhouettes.add(shape, a.x, ground, a.y, st.yaw, sc * (1 + Math.min(1, Math.max(0, y - ground) * 0.06)), st.fly, Math.sin(phase * (mo.flap || 1)), clamp(1.1 - (y - ground) * 0.22, 0.4, 1));
    else shadow(a.x, ground, a.y, (def.sprite.len || def.sprite.size || 10) * sc * (0.4 / 0.62) * (flying || def.reef ? 0.7 : 1));
  }
}
