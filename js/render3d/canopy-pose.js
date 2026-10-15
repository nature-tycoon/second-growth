import * as THREE from 'three';
import { siamangSwing } from './siamang-swing.js';
import { howlerSupportedTurn, howlerTurnVelocity, settleHowlerTurnVelocity, howlerNewContactsFit } from './howler-motion.js';
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
export function readableCanopyPose(q, hanging = false, pitchLimit = 1.25) {
  // A brachiating gibbon can lean around its supporting hand at a fork.
  // Quadrupedal monkeys instead keep their feet underneath their bodies.
  if (hanging) return true;
  poseAngles.setFromQuaternion(q, 'YZX');
  return Math.abs(poseAngles.x) <= .3 && Math.abs(poseAngles.z) <= pitchLimit;
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
  let yaw = st.yaw;
  if (mo.primate === 2 && motion?.heading?.lengthSq() > 1e-8) {
    // The body already turns at a bounded rate below. Aim directly along the
    // wood so a second yaw easing does not prolong a backward climb.
    yaw = Math.atan2(-motion.heading.z, motion.heading.x) + (st.canopyReverse ? Math.PI : 0);
  }
  if (mo.canopyWalkerMotion && motion?.journey && motion.heading.lengthSq()>1e-8) {
    yaw=Math.atan2(-motion.heading.z,motion.heading.x);
    pitch=THREE.MathUtils.clamp(Math.atan2(motion.heading.y,Math.hypot(motion.heading.x,motion.heading.z)),-1.2,1.2);
  }
  canopyRotation(yaw, pitch, 0, preferred);
  if (!mo.canopyBody?.length) return { roll: 0, pitch, yaw: 0 };
  support.set(mo.gripX || 0, mo.supportY || 0, mo.gripZ || 0);
  const swing = mo.primate === 3 ? siamangSwing(st.branchPhase, gait, eating) : null;
  let outline = st.canopyOutline?.model === mo && st.canopyOutline.scale === st.sc ? st.canopyOutline.points : null;
  const fresh = !outline;
  if (fresh) {
    outline = mo.canopyBody.map(v => v.clone());
    st.canopyOutline = { model: mo, scale: st.sc, points: outline, bounds: new THREE.Box3() };
  }
  if (fresh || swing || mo.canopyWalkerMotion) for (let i = 0; i < outline.length; i++) {
    const q = outline[i].copy(mo.canopyBody[i]);
    if (swing) q.sub(p.set(...swing.grip).multiplyScalar(mo.len)).applyAxisAngle(side, swing.sway)
      .add(p.set(.14, 1.38, .02).multiplyScalar(mo.len));
    if(mo.canopyWalkerMotion && st.howlerBody)q.add(st.howlerBody);
    q.sub(support).multiplyScalar(st.sc);
  }
  if (fresh || swing || mo.canopyWalkerMotion) {
    st.canopyOutline.bounds.setFromPoints(outline);
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
  if (mo.canopyFeet && mo.primate !== 2 && !mo.canopyHanging && wood.some(b => {
    if (b.dir.y < .95) return false;
    const along = near.copy(st.branchPoint).sub(b.to).dot(b.dir);
    near.addScaledVector(b.dir, -along);
    return Math.abs(along) < .004 && near.length() < b.r1;
  })) canopyRotation(st.yaw, 0, 0, preferred);
  const bodyClear = (q, point = st.branchPoint) => {
    // During a leap the body clears wood above the straight transfer line.
    // Keep branchPoint on that line for route progress and landing contacts.
    const lifted = point === st.branchPoint && (st.canopyLeap || mo.primate === 1 && motion?.transfer)
      ? point.clone().add(new THREE.Vector3(0, motion?.lift || 0, 0)) : point;
    return outlineFitsWood(outline, st.canopyOutline.bounds, lifted, q, wood, margin);
  };
  const clear = (q, point = st.branchPoint) => bodyClear(q, point) &&
    (!mo.canopyWalkerMotion || howlerSupportedTurn(st, mo, point, q, (!!motion?.journey || st.howlerForkTurn),wood));
  const finishingTurn = mo.canopyWalkerMotion && before.distanceTo(st.branch.point)<.004;
  const jumping = mo.canopyWalkerMotion && (!!st.howlerJump || st.canopyLeap?.t>0&&st.canopyLeap.t<1);
  // Finish along the receiving wood's validated frame. The final tiny bark
  // correction is a positioning adjustment, not a new travel-facing goal.
  const receiving=finishingTurn || st.branchRoute && st.branchRoute.cursor>=st.branchRoute.points.length-2 &&
    st.branchPoint.distanceTo(st.branch.point)<mo.len*st.sc*.5;
  if(mo.canopyWalkerMotion && !jumping) {
    if(st.howlerForkTurn && st.branch.point.canopyPose && readableCanopyPose(st.branch.point.canopyPose,false,mo.canopyPitchLimit) &&
      receiving) {
      st.howlerFinalPose={site:st.branch.site,index:st.branch.index,point:st.branch.point.clone(),pose:st.branch.point.canopyPose.clone()};
    }
    const final=st.howlerFinalPose;
    if(final && final.site===st.branch.site && final.index===st.branch.index && final.point.distanceTo(st.branch.point)<.004 &&
      receiving)preferred.copy(final.pose);
  }
  if(jumping && motion?.pose && (st.howlerJump?.phase==='prepare' ? bodyClear(motion.pose) : clear(motion.pose)))preferred.copy(motion.pose);
  if (mo.canopyHanging && motion?.pose && clear(motion.pose)) preferred.copy(motion.pose);
  const trunkCatch = mo.primate === 1 && motion?.pose && (motion.journey?.trunkTransfer || mo.canopyWalkerMotion && st.branch?.trunk != null);
  if ((trunkCatch || mo.primate === 2) && motion?.pose && (mo.canopyWalkerMotion ? bodyClear(motion.pose) : clear(motion.pose))) preferred.copy(motion.pose);
  const current = st.canopyQuaternion;
  const route = st.branchRoute;
  let ahead = st.branchPoint;
  if (route) {
    let span = 0, last = st.branchPoint;
    for (let i = route.cursor; i < route.points.length; i++) {
      const distance = last.distanceTo(route.points[i]);
      if ((mo.canopyHanging || mo.primate === 2 || mo.canopyWalkerMotion) && span + distance >= mo.len * st.sc * .15) {
        ahead = last.clone().lerp(route.points[i], (mo.len * st.sc * .15 - span) / distance); break;
      }
      ahead = route.points[i]; span += last.distanceTo(ahead); last = ahead;
      if (span >= mo.len * st.sc * (mo.canopyHanging ? .15 : .5)) break;
    }
  }
  let goal = null, score = Infinity;
  const consider = q => {
    if (!readableCanopyPose(q, mo.primate === 3, mo.canopyPitchLimit)) return;
    poseAngles.setFromQuaternion(q, 'YZX');
    // Give an orangutan's travel heading priority over its old safe facing.
    const finalFork=mo.canopyWalkerMotion&&st.howlerForkTurn&&finishingTurn&&!jumping;
    const cost = (current ? current.angleTo(q) ** 2 : 0) + preferred.angleTo(q) ** 2 * (mo.primate === 2 || finalFork ? 4 : 1) + 4 * poseAngles.x ** 2
      + (current && (mo.canopyFeet || mo.primate === 2) && st.canopyGoal && !finalFork ? .5 * st.canopyGoal.angleTo(q) ** 2 : 0);
    if (cost >= score || !bodyClear(q, ahead)) return;
    goal ||= new THREE.Quaternion(); goal.copy(q); score = cost;
  };
  if (ahead.canopyPose) consider(ahead.canopyPose);
  if (st.branch?.point.canopyPose) consider(st.branch.point.canopyPose);
  // During the crouch, aim at the departure heading even if that complete
  // turn needs new grips. Each incremental turn below still validates bark
  // clearance and contact reach; rejecting the distant goal freezes the yaw.
  if(st.howlerJump?.phase==='prepare' && motion?.pose)goal=motion.pose.clone();
  else if ((jumping || mo.canopyHanging || trunkCatch || mo.primate === 2) && motion?.pose && clear(motion.pose)) goal = motion.pose.clone();
  else if ((mo.canopyWalkerMotion ? bodyClear(preferred) : clear(preferred)) && bodyClear(preferred, ahead)) goal = preferred.clone();
  else if (current && clear(current) && bodyClear(current, ahead) && (!(mo.canopyFeet || mo.primate === 2) || current.angleTo(preferred) < .2)) goal = current.clone();
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
      consider(canopyRotation(yaw + turn, lean, roll, rotation));
    }
  }
  // Hold a safe orangutan pose through small changes in the fork normal.
  // Repeatedly chasing those corrections makes its long torso wobble.
  if (mo.primate === 2 && !motion?.pose && goal && st.canopyGoal && goal.angleTo(st.canopyGoal) < .25 &&
      clear(st.canopyGoal) && bodyClear(st.canopyGoal, ahead)) goal.copy(st.canopyGoal);
  if (goal) { st.canopyGoal ||= new THREE.Quaternion(); st.canopyGoal.copy(goal); }
  next.copy(current || goal || preferred);
  const transferPace = !mo.canopyWalkerMotion && mo.primate === 1 && motion?.journey?.trunkTransfer ? Math.max(1, motion.animationSpeed || 1) : 1;
  const turnRate = mo.canopyWalkerMotion && st.howlerForkTurn && !jumping ? finishingTurn ? 8 : 2.6 : mo.primate === 2 ? 1 : (st.canopyLeap && trunkCatch ? 2.4 : 1.5) * transferPace;
  if (current && goal) {
    const limit = Math.max(0, Math.min(.1, dt)) * (mo.primate === 2 ? Math.min(turnRate, current.angleTo(goal) * 4) : turnRate);
    if (mo.canopyWalkerMotion && st.howlerForkTurn && !jumping)next.copy(howlerTurnVelocity(st,current,goal,Math.max(0,Math.min(.1,dt)),turnRate));
    else if (mo.primate === 3 || mo.canopyHanging) next.rotateTowards(goal, limit);
    else uprightTurn(current, goal, limit, next);
  }
  if(mo.canopyWalkerMotion && !jumping) {
    // A changed goal can leave residual angular velocity pointing past the
    // upright limits. Apply them before validating contacts, even in recovery.
    angles.setFromQuaternion(next,'YZX');
    canopyRotation(angles.y,THREE.MathUtils.clamp(angles.z,-(mo.canopyPitchLimit || 1.25),mo.canopyPitchLimit || 1.25),
      THREE.MathUtils.clamp(angles.x,-.3,.3),next);
  }
  // If the direct turn is blocked, take a small safe turn about one axis
  // while shortening the step. This avoids freezing at a valid bark hold just
  // because the shortest quaternion turn cuts through a neighbouring limb.
  // In a tight crossing, stepping and turning can both be blocked at once.
  // After a brief stall, finish the step through a few millimetres of bark
  // rather than hold the animal frozen at the same spot indefinitely.
  const step = Math.max(0, Math.min(.1, dt));
  // Lag alone must not send a monkey through the bark during a turn. Keep
  // its short stall recovery; orangutans always wait for a clear body pose.
  // The howler study keeps clear of wood unless a fork handover has stalled
  // outright; then it may pass through a little bark rather than freeze.
  if (mo.canopyWalkerMotion && st.howlerForkTurn && !jumping && st.howlerGripStall > .4 && !(st.canopyForce > 0)) st.canopyForce = .4;
  const forced = mo.canopyWalkerMotion ? st.howlerForkTurn && !jumping && st.canopyForce > 0
    : mo.primate !== 2 && (st.canopyForce > 0 || (mo.primate !== 1 && st.canopyLag > 1.8));
  if (forced) st.canopyForce -= step;
  if (mo.canopyWalkerMotion) st.howlerTurnBlocked = current &&
    (!howlerSupportedTurn(st, mo, st.branchPoint, next, (!!motion?.journey || st.howlerForkTurn),wood) || finishingTurn && !bodyClear(next));
  const recoveryFit=(q,point)=>forced || st.howlerGripStall>.5 ? howlerNewContactsFit(st,mo,point,q) : howlerSupportedTurn(st,mo,point,q,true,wood);
  if (current && (!forced || mo.canopyWalkerMotion && !recoveryFit(next,st.branchPoint)) && !clear(next)) {
    const requested = st.branchPoint.clone(), smoothFork=mo.canopyWalkerMotion && st.howlerForkTurn && !jumping;
    const proposed=next.clone(),limit = smoothFork ? current.angleTo(next) : step * turnRate;
    const safe=(q,point)=>forced&&mo.canopyWalkerMotion ? recoveryFit(q,point) : clear(q,point);
    const stepPoint = fraction => {
      if (!motion || motion.trace.length < 2) return hold.copy(before).lerp(requested, fraction);
      let remaining = motion.travelled * fraction;
      for (let i = 1; i < motion.trace.length; i++) {
        const a = motion.trace[i - 1].point, b = motion.trace[i].point, span = a.distanceTo(b);
        if (span > remaining) return hold.copy(a).lerp(b, remaining / span);
        remaining -= span;
      }
      return hold.copy(requested);
    };
    const choices = [next.clone(), current.clone()];
    if(smoothFork) {
      for(const fraction of [.25,.5,.75])choices.push(current.clone().slerp(next,fraction));
      // Tight grips can permit less than a quarter of the proposed turn.
      // Find that supported increment instead of repeatedly holding still.
      let low=0,high=1;
      if(st.howlerGripStall>.4)for(let i=0;i<10;i++) {
        const t=(low+high)/2,q=current.clone().slerp(proposed,t);
        if(safe(q,before))low=t;else high=t;
      }
      if(st.howlerGripStall>.4 && low>1e-5)choices.push(current.clone().slerp(proposed,low));
    }
    for (const axis of [up, forward, side]) for (const sign of [1, -1])
      choices.push(current.clone().multiply(localTurn.setFromAxisAngle(axis, sign * limit)));
    let best = -Infinity, fraction = 0;
    next.copy(current);
    for (const q of choices) {
      if (!readableCanopyPose(q, mo.primate === 3, mo.canopyPitchLimit) || !safe(q, before)) continue;
      let low = 0, high = 1;
      if (safe(q, requested)) low = 1;
      else for (let i = 0; i < 8; i++) {
        const t = (low + high) / 2; stepPoint(t);
        if (safe(q, hold)) low = t; else high = t;
      }
      const target = goal || preferred;
      const progress=current.angleTo(target)-q.angleTo(target);
      const continuity=smoothFork ? q.angleTo(proposed)/Math.max(limit,1e-6)*.2 : 0;
      const value = mo.canopyWalkerMotion && st.howlerForkTurn ? low + progress*30-continuity : low*20+progress;
      if (value > best) { best = value; fraction = low; next.copy(q); }
    }
    st.branchPoint.copy(stepPoint(fraction));
    if (motion) motion.acceptedDistance = motion.travelled * fraction;
    const stuck = fraction < 1e-3 && next.angleTo(current) < 1e-6 && requested.distanceToSquared(before) > 1e-12;
    st.canopyStall = stuck ? (st.canopyStall || 0) + step : 0;
    if (!mo.canopyWalkerMotion && mo.primate !== 2 && st.canopyStall > .3) { st.canopyStall = 0; st.canopyForce = .5; }
  } else st.canopyStall = 0;
  if (mo.canopyWalkerMotion) st.howlerTurnMoved = current && current.angleTo(next)>1e-4;
  if(mo.canopyWalkerMotion && current && st.howlerForkTurn && !jumping)settleHowlerTurnVelocity(st,current,next,Math.max(0,Math.min(.1,dt)));
  st.canopyQuaternion ||= new THREE.Quaternion(); st.canopyQuaternion.copy(next);
  angles.setFromQuaternion(next, 'YZX');
  let offset = angles.y - st.yaw; offset -= Math.round(offset / (2 * Math.PI)) * 2 * Math.PI;
  return { roll: angles.x, pitch: angles.z, yaw: offset };
}
