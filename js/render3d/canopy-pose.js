import * as THREE from 'three';
import { siamangSwing } from './siamang-swing.js';
import { orangutanHold, orangutanSwing } from './orangutan-swing.js';
import { woodDistance, woodNormal, woodFrame, outlineFitsWood } from './wood-clearance.js';

const up = new THREE.Vector3(0, 1, 0), forward = new THREE.Vector3(1, 0, 0), side = new THREE.Vector3(0, 0, 1);
const yawQ = new THREE.Quaternion(), pitchQ = new THREE.Quaternion(), rollQ = new THREE.Quaternion();
const frameQ = new THREE.Quaternion(), localTurn = new THREE.Quaternion(), rotation = new THREE.Quaternion(), preferred = new THREE.Quaternion(), next = new THREE.Quaternion();
const support = new THREE.Vector3(), p = new THREE.Vector3(), near = new THREE.Vector3(), hold = new THREE.Vector3();
const frameY = new THREE.Vector3(), angles = new THREE.Euler(0, 0, 0, 'YZX');
const poseAngles = new THREE.Euler(0, 0, 0, 'YZX');
const turnAngles = new THREE.Euler(0, 0, 0, 'YZX');

// Feet stay above a limb; a hanging ape keeps its torso below its hands.
// Finding a collision-free sideways pose is not a readable climbing animation.
export function readableCanopyPose(q, hanging = false) {
  // A brachiating gibbon can lean around its supporting hand at a fork.
  // Quadrupedal monkeys instead keep their feet underneath their bodies.
  if (hanging) return true;
  poseAngles.setFromQuaternion(q, 'YZX');
  return Math.abs(poseAngles.x) <= .3 && Math.abs(poseAngles.z) <= 1.25;
}

export function canopyRotation(yaw, pitch, roll, target) {
  return target.copy(yawQ.setFromAxisAngle(up, yaw)).multiply(pitchQ.setFromAxisAngle(side, pitch)).multiply(rollQ.setFromAxisAngle(forward, roll));
}

export function interpolateCanopyPose(current, goal, fraction, target) {
  poseAngles.setFromQuaternion(current, 'YZX'); turnAngles.setFromQuaternion(goal, 'YZX');
  let yaw = turnAngles.y - poseAngles.y;
  yaw -= Math.round(yaw / (2 * Math.PI)) * 2 * Math.PI;
  return canopyRotation(poseAngles.y + yaw * fraction,
    poseAngles.z + (turnAngles.z - poseAngles.z) * fraction,
    poseAngles.x + (turnAngles.x - poseAngles.x) * fraction, target);
}

function uprightTurn(current, goal, limit, target) {
  // Quaternion interpolation between opposite uphill headings can bank a
  // quadruped sideways even when both endpoint poses have zero roll. Turn
  // around world-up while independently easing its slope and small lean.
  poseAngles.setFromQuaternion(current, 'YZX'); turnAngles.setFromQuaternion(goal, 'YZX');
  let yaw = turnAngles.y - poseAngles.y;
  yaw -= Math.round(yaw / (2 * Math.PI)) * 2 * Math.PI;
  const pitch = turnAngles.z - poseAngles.z, roll = turnAngles.x - poseAngles.x;
  const fraction = Math.min(1, limit / Math.max(1e-9, Math.abs(yaw) + Math.abs(pitch) + Math.abs(roll)));
  return canopyRotation(poseAngles.y + yaw * fraction, poseAngles.z + pitch * fraction, poseAngles.x + roll * fraction, target);
}

// Choose the nearest upright pose, then turn toward it at a limited rate.
// A crowded fork can slow a step while the animal changes its grip; it must
// never force an instant barrel roll to make a body fit between the limbs.
export function canopyLean(st, mo, sites, pitch, gait, eating = 0, dt = 1 / 60, before = st.branchPoint, motion = null) {
  canopyRotation(st.yaw, pitch, 0, preferred);
  if (!mo.canopyBody?.length) return { roll: 0, pitch, yaw: 0 };
  orangutanHold(st, mo, support);
  const swing = mo.primate === 3 ? siamangSwing(st.branchPhase, gait, eating) : null;
  let outline = st.canopyOutline?.model === mo && st.canopyOutline.scale === st.sc ? st.canopyOutline.points : null;
  const fresh = !outline;
  if (fresh) {
    outline = mo.canopyBody.map(v => v.clone());
    st.canopyOutline = { model: mo, scale: st.sc, points: outline, bounds: new THREE.Box3() };
  }
  const changedHold = mo.primate === 2 && !st.canopyOutline.support?.equals(support);
  if (fresh || swing || changedHold) for (let i = 0; i < outline.length; i++) {
    const q = outline[i].copy(mo.canopyBody[i]);
    if (swing) q.sub(p.set(...swing.grip).multiplyScalar(mo.len)).applyAxisAngle(side, swing.sway)
      .add(p.set(.14, 1.38, .02).multiplyScalar(mo.len));
    q.sub(support).multiplyScalar(st.sc);
  }
  if (fresh || swing || changedHold) {
    st.canopyOutline.bounds.setFromPoints(outline);
    st.canopyOutline.support ||= new THREE.Vector3(); st.canopyOutline.support.copy(support);
  }
  const margin = mo.len * st.sc * .008;
  let extent = margin;
  for (const v of outline) extent = Math.max(extent, v.length() + margin);
  const wood = [];
  for (const site of sites) if (site) {
    site.prepare();
    for (const b of site.wood) {
      const t = THREE.MathUtils.clamp(near.copy(st.branchPoint).sub(b.from).dot(b.dir) / b.length, 0, 1);
      near.copy(b.from).lerp(b.to, t);
      if (st.branchPoint.distanceToSquared(near) < (extent + Math.max(b.r0, b.r1)) ** 2) wood.push(b);
    }
  }
  if (mo.canopyFeet && !mo.canopyHanging && wood.some(b => {
    if (b.dir.y < .95) return false;
    const along = near.copy(st.branchPoint).sub(b.to).dot(b.dir);
    near.addScaledVector(b.dir, -along);
    return Math.abs(along) < .004 && near.length() < b.r1;
  })) canopyRotation(st.yaw, 0, 0, preferred);
  const clear = (q, point = st.branchPoint) => {
    // During a leap the body clears wood above the straight transfer line.
    // Keep branchPoint on that line for route progress and landing contacts.
    let lifted = st.canopyLeap && point === st.branchPoint ? point.clone().add(new THREE.Vector3(0, motion?.lift || 0, 0)) : point;
    if (mo.primate === 2 && st.orangutanSwing) {
      const swing = orangutanSwing(st.branchRoute, point);
      const origin = swing ? new THREE.Vector3(...swing.grip).multiplyScalar(mo.len) : new THREE.Vector3(0, mo.supportY, 0);
      lifted = point.clone().add(origin.sub(support).multiplyScalar(-st.sc).applyQuaternion(q));
    }
    return outlineFitsWood(outline, st.canopyOutline.bounds, lifted, q, wood, margin);
  };
  if (mo.canopyHanging && motion?.pose && clear(motion.pose)) preferred.copy(motion.pose);
  if (st.orangutanSwing && motion?.pose && clear(motion.pose)) preferred.copy(motion.pose);
  const current = st.canopyQuaternion;
  const route = st.branchRoute;
  let ahead = st.branchPoint;
  if (route) {
    let span = 0, last = st.branchPoint;
    for (let i = route.cursor; i < route.points.length; i++) {
      const distance = last.distanceTo(route.points[i]);
      if ((mo.canopyHanging || mo.primate === 2) && span + distance >= mo.len * st.sc * .15) {
        ahead = last.clone().lerp(route.points[i], (mo.len * st.sc * .15 - span) / distance); break;
      }
      ahead = route.points[i]; span += last.distanceTo(ahead); last = ahead;
      if (span >= mo.len * st.sc * (mo.canopyHanging ? .15 : .5)) break;
    }
  }
  let goal = null, score = Infinity;
  const consider = q => {
    if (!readableCanopyPose(q, mo.primate === 3)) return;
    poseAngles.setFromQuaternion(q, 'YZX');
    const cost = (current ? current.angleTo(q) ** 2 : 0) + preferred.angleTo(q) ** 2 + 4 * poseAngles.x ** 2
      + (current && (mo.canopyFeet || mo.primate === 2) && st.canopyGoal ? .5 * st.canopyGoal.angleTo(q) ** 2 : 0);
    if (cost >= score || !clear(q, ahead)) return;
    goal ||= new THREE.Quaternion(); goal.copy(q); score = cost;
  };
  if (ahead.canopyPose) consider(ahead.canopyPose);
  if (st.branch?.point.canopyPose) consider(st.branch.point.canopyPose);
  if ((mo.canopyHanging || st.orangutanSwing) && motion?.pose && clear(motion.pose)) goal = motion.pose.clone();
  else if (clear(preferred) && clear(preferred, ahead)) goal = preferred.clone();
  else if (current && clear(current) && clear(current, ahead) && (!(mo.canopyFeet || mo.primate === 2) || current.angleTo(preferred) < .2)) goal = current.clone();
  else {
    if (current && clear(current)) consider(current);
    if (current && (mo.canopyFeet || mo.primate === 2) && st.canopyGoal) consider(st.canopyGoal);
    for (const contact of new Set([st.branchPoint, ahead])) for (const b of [...wood].sort((a, b) => Math.abs(woodDistance(contact, a)) - Math.abs(woodDistance(contact, b))).slice(0, 3)) {
      const t = THREE.MathUtils.clamp(near.copy(contact).sub(b.from).dot(b.dir) / b.length, 0, 1);
      near.copy(b.from).lerp(b.to, t);
      woodNormal(contact, b, frameY);
      if (frameY.lengthSq() < .5) continue;
      for (const sign of [1, -1]) {
        woodFrame(b, frameY, mo.primate === 3 || mo.canopyHanging, sign, frameQ);
        for (const turn of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2])
          consider(rotation.copy(frameQ).multiply(localTurn.setFromAxisAngle(up, turn)));
      }
    }
    const leans = mo.primate === 3 ? [pitch, 0, .6, -.6, 1.2, -1.2, 1.55, -1.55] : [pitch, 0, .4, -.4, .8, -.8, 1.2, -1.2];
    const rolls = mo.primate === 3 ? [0, .35, -.35, .7, -.7, 1.05, -1.05] : [0, .15, -.15, .3, -.3];
    for (const turn of [0, .7, -.7, 1.4, -1.4, Math.PI]) for (const lean of leans) for (const roll of rolls) {
      consider(canopyRotation(st.yaw + turn, lean, roll, rotation));
    }
  }
  // Hold a safe orangutan pose through small changes in the fork normal.
  // Repeatedly chasing those corrections makes its long torso wobble.
  if (mo.primate === 2 && !st.orangutanSwing && goal && st.canopyGoal && goal.angleTo(st.canopyGoal) < .25 &&
      clear(st.canopyGoal) && clear(st.canopyGoal, ahead)) goal.copy(st.canopyGoal);
  if (goal) { st.canopyGoal ||= new THREE.Quaternion(); st.canopyGoal.copy(goal); }
  next.copy(current || goal || preferred);
  const transitioning = mo.primate === 2 && st.orangutanSwing && (st.orangutanSwing.t < .35 || st.orangutanSwing.t >= .65);
  const turnRate = mo.primate === 2 ? transitioning ? 2.4 : 1 : 1.5;
  if (current && goal) {
    const limit = Math.max(0, Math.min(.1, dt)) * (mo.primate === 2 ? Math.min(turnRate, current.angleTo(goal) * (transitioning ? 8 : 4)) : turnRate);
    if (mo.primate === 3 || mo.canopyHanging) next.rotateTowards(goal, limit);
    else uprightTurn(current, goal, limit, next);
  }
  // If the direct turn is blocked, take a small safe turn about one axis
  // while shortening the step. This avoids freezing at a valid bark hold just
  // because the shortest quaternion turn cuts through a neighbouring limb.
  // In a tight crossing, stepping and turning can both be blocked at once.
  // After a brief stall, finish the step through a few millimetres of bark
  // rather than hold the animal frozen at the same spot indefinitely.
  const step = Math.max(0, Math.min(.1, dt));
  // A body well behind its simulation position also keeps moving: a brief brush
  // with bark is less visible than the reset jump that a growing lag ends in.
  const forced = st.canopyForce > 0 || st.canopyLag > 1.8;
  if (forced) st.canopyForce -= step;
  if (current && !forced && !clear(next)) {
    const requested = st.branchPoint.clone(), limit = step * turnRate;
    const stepPoint = fraction => {
      if (!motion?.trace.length) return hold.copy(before).lerp(requested, fraction);
      let remaining = motion.travelled * fraction;
      for (let i = 1; i < motion.trace.length; i++) {
        const a = motion.trace[i - 1].point, b = motion.trace[i].point, span = a.distanceTo(b);
        if (span > remaining) return hold.copy(a).lerp(b, remaining / span);
        remaining -= span;
      }
      return hold.copy(requested);
    };
    const choices = [next.clone(), current.clone()];
    for (const axis of [up, forward, side]) for (const sign of [1, -1])
      choices.push(current.clone().multiply(localTurn.setFromAxisAngle(axis, sign * limit)));
    let best = -Infinity, fraction = 0;
    next.copy(current);
    for (const q of choices) {
      if (!readableCanopyPose(q, mo.primate === 3) || !clear(q, before)) continue;
      let low = 0, high = 1;
      if (clear(q, requested)) low = 1;
      else for (let i = 0; i < 8; i++) {
        const t = (low + high) / 2; stepPoint(t);
        if (clear(q, hold)) low = t; else high = t;
      }
      const target = goal || preferred;
      const value = low * 20 + current.angleTo(target) - q.angleTo(target);
      if (value > best) { best = value; fraction = low; next.copy(q); }
    }
    st.branchPoint.copy(stepPoint(fraction));
    if (motion) motion.acceptedDistance = motion.travelled * fraction;
    const stuck = fraction < 1e-3 && next.angleTo(current) < 1e-6 && requested.distanceToSquared(before) > 1e-12;
    st.canopyStall = stuck ? (st.canopyStall || 0) + step : 0;
    if (st.canopyStall > .3) { st.canopyStall = 0; st.canopyForce = .5; }
  } else st.canopyStall = 0;
  st.canopyQuaternion ||= new THREE.Quaternion(); st.canopyQuaternion.copy(next);
  angles.setFromQuaternion(next, 'YZX');
  let yaw = angles.y - st.yaw; yaw -= Math.round(yaw / (2 * Math.PI)) * 2 * Math.PI;
  return { roll: angles.x, pitch: angles.z, yaw };
}
