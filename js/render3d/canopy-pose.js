import * as THREE from 'three';
import { siamangSwing } from './siamang-swing.js';
import { woodDistance, woodNormal, woodFrame, outlineFitsWood } from './wood-clearance.js';

const up = new THREE.Vector3(0, 1, 0), forward = new THREE.Vector3(1, 0, 0), side = new THREE.Vector3(0, 0, 1);
const yawQ = new THREE.Quaternion(), pitchQ = new THREE.Quaternion(), rollQ = new THREE.Quaternion();
const frameQ = new THREE.Quaternion(), localTurn = new THREE.Quaternion(), rotation = new THREE.Quaternion(), preferred = new THREE.Quaternion(), next = new THREE.Quaternion();
const support = new THREE.Vector3(), p = new THREE.Vector3(), near = new THREE.Vector3(), hold = new THREE.Vector3();
const frameY = new THREE.Vector3(), angles = new THREE.Euler(0, 0, 0, 'YZX');

export function canopyRotation(yaw, pitch, roll, target) {
  return target.copy(yawQ.setFromAxisAngle(up, yaw)).multiply(pitchQ.setFromAxisAngle(side, pitch)).multiply(rollQ.setFromAxisAngle(forward, roll));
}

// Choose the nearest upright pose, then turn toward it at a limited rate.
// A crowded fork can slow a step while the animal changes its grip; it must
// never force an instant barrel roll to make a body fit between the limbs.
export function canopyLean(st, mo, sites, pitch, gait, eating = 0, dt = 1 / 60, before = st.branchPoint) {
  canopyRotation(st.yaw, pitch, 0, preferred);
  if (!mo.canopyBody?.length) return { roll: 0, pitch, yaw: 0 };
  support.set(mo.gripX || 0, mo.supportY || 0, mo.gripZ || 0);
  const swing = mo.primate === 3 ? siamangSwing(st.branchPhase, gait, eating) : null;
  let outline = st.canopyOutline?.model === mo && st.canopyOutline.scale === st.sc ? st.canopyOutline.points : null;
  const fresh = !outline;
  if (fresh) {
    outline = mo.canopyBody.map(v => v.clone());
    st.canopyOutline = { model: mo, scale: st.sc, points: outline, bounds: new THREE.Box3() };
  }
  if (fresh || swing) for (let i = 0; i < outline.length; i++) {
    const q = outline[i].copy(mo.canopyBody[i]);
    if (swing) q.sub(p.set(...swing.grip).multiplyScalar(mo.len)).applyAxisAngle(side, swing.sway)
      .add(p.set(.14, 1.38, .02).multiplyScalar(mo.len));
    q.sub(support).multiplyScalar(st.sc);
  }
  if (fresh || swing) st.canopyOutline.bounds.setFromPoints(outline);
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
  const clear = (q, point = st.branchPoint) => outlineFitsWood(outline, st.canopyOutline.bounds, point, q, wood, margin);
  const current = st.canopyQuaternion;
  const route = st.branchRoute;
  let ahead = st.branchPoint;
  if (route) {
    let span = 0, last = st.branchPoint;
    for (let i = route.cursor; i < route.points.length; i++) {
      ahead = route.points[i]; span += last.distanceTo(ahead); last = ahead;
      if (span >= mo.len * st.sc * .5) break;
    }
  }
  let goal = null, score = Infinity;
  const consider = q => {
    const cost = (current ? current.angleTo(q) ** 2 : 0) + .15 * preferred.angleTo(q) ** 2;
    if (cost >= score || !clear(q, ahead)) return;
    goal ||= new THREE.Quaternion(); goal.copy(q); score = cost;
  };
  if (ahead.canopyPose) consider(ahead.canopyPose);
  if (st.branch?.point.canopyPose) consider(st.branch.point.canopyPose);
  if (clear(preferred) && clear(preferred, ahead)) goal = preferred.clone();
  else if (current && clear(current) && clear(current, ahead)) goal = current.clone();
  else {
    for (const contact of new Set([st.branchPoint, ahead])) for (const b of [...wood].sort((a, b) => Math.abs(woodDistance(contact, a)) - Math.abs(woodDistance(contact, b))).slice(0, 3)) {
      const t = THREE.MathUtils.clamp(near.copy(contact).sub(b.from).dot(b.dir) / b.length, 0, 1);
      near.copy(b.from).lerp(b.to, t);
      woodNormal(contact, b, frameY);
      if (frameY.lengthSq() < .5) continue;
      for (const sign of [1, -1]) {
        woodFrame(b, frameY, mo.primate === 3, sign, frameQ);
        for (const turn of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2])
          consider(rotation.copy(frameQ).multiply(localTurn.setFromAxisAngle(up, turn)));
      }
    }
    for (const turn of [0, .7, -.7, 1.4, -1.4, Math.PI]) for (const lean of [pitch, 0, .6, -.6, 1.2, -1.2, 1.55, -1.55]) for (const roll of [0, .35, -.35, .7, -.7, 1.05, -1.05]) {
      consider(canopyRotation(st.yaw + turn, lean, roll, rotation));
    }
  }
  next.copy(current || goal || preferred);
  if (current && goal) next.rotateTowards(goal, Math.max(0, Math.min(.1, dt)) * (mo.primate === 2 ? 1 : 1.5));
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
    const requested = st.branchPoint.clone(), limit = step * (mo.primate === 2 ? 1 : 1.5);
    const choices = [next.clone(), current.clone()];
    for (const axis of [up, forward, side]) for (const sign of [1, -1])
      choices.push(current.clone().multiply(localTurn.setFromAxisAngle(axis, sign * limit)));
    let best = -Infinity, fraction = 0;
    next.copy(current);
    for (const q of choices) {
      if (!clear(q, before)) continue;
      let low = 0, high = 1;
      if (clear(q, requested)) low = 1;
      else for (let i = 0; i < 8; i++) {
        const t = (low + high) / 2; hold.copy(before).lerp(requested, t);
        if (clear(q, hold)) low = t; else high = t;
      }
      const target = goal || preferred;
      const value = low * 20 + current.angleTo(target) - q.angleTo(target);
      if (value > best) { best = value; fraction = low; next.copy(q); }
    }
    st.branchPoint.copy(hold.copy(before).lerp(requested, fraction));
    const stuck = fraction < 1e-3 && next.angleTo(current) < 1e-6 && requested.distanceToSquared(before) > 1e-12;
    st.canopyStall = stuck ? (st.canopyStall || 0) + step : 0;
    if (st.canopyStall > .3) { st.canopyStall = 0; st.canopyForce = .5; }
  } else st.canopyStall = 0;
  st.canopyQuaternion ||= new THREE.Quaternion(); st.canopyQuaternion.copy(next);
  angles.setFromQuaternion(next, 'YZX');
  let yaw = angles.y - st.yaw; yaw -= Math.round(yaw / (2 * Math.PI)) * 2 * Math.PI;
  return { roll: angles.x, pitch: angles.z, yaw };
}
