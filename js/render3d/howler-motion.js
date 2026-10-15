// Shared branch-walker motion, developed in the howler study: articulated
// limbs, contact-driven weight shifts and a readable placement clock.
import * as THREE from 'three';
import { bodyFitsWood } from './wood-clearance.js';
import { howlerJumpBody } from './howler-jump.js';
import { canopyWalkerBends } from './canopy-walker-profile.js';
import { barkGrip } from './bark-grip.js';
import { howlerReachTarget } from './howler-contact.js';

export const HOWLER_PLACEMENT = .11, HOWLER_PLANTED = .09;
export function howlerTurnPose(current,goal,limit) {
  const from=new THREE.Euler().setFromQuaternion(current,'YZX'),to=new THREE.Euler().setFromQuaternion(goal,'YZX');
  const delta=new THREE.Vector3(to.x-from.x,Math.atan2(Math.sin(to.y-from.y),Math.cos(to.y-from.y)),to.z-from.z);
  const sum=Math.abs(delta.x)+Math.abs(delta.y)+Math.abs(delta.z);
  delta.multiplyScalar(Math.min(1,limit/Math.max(1e-9,sum)));
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(from.x+delta.x,from.y+delta.y,from.z+delta.z,'YZX'));
}
export function howlerNewContactsFit(st,mo,point,pose) {
  const inverse=pose.clone().invert(),origin=new THREE.Vector3(mo.gripX||0,mo.supportY||0,mo.gripZ||0);
  for(let i=0;i<4;i++) {
    const foot=st.gripFeet?.[i];if(!foot || foot.free || foot.from || !(foot.plantedFor<HOWLER_PLANTED) || !st.howlerForkTurn&&!foot.forkCatch)continue;
    const local=foot.point.clone().sub(point).applyQuaternion(inverse).divideScalar(st.sc).add(origin);
    if(st.howlerBody)local.sub(st.howlerBody);
    if(local.distanceTo(mo.canopyJoints[i])>mo.howlerLengths[i][0]+mo.howlerLengths[i][1]-.0001 || local.distanceTo(mo.canopyFeet[i])>(foot.reachRadius || mo.len*.55*(mo.canopyReachScale || 1)) || local.y < -mo.len*.14)return false;
  }
  return true;
}
// Ease angular velocity before contact/clearance validation. Feed the accepted
// turn back afterward, so a blocked grip cannot build up a burst of rotation.
export function howlerTurnVelocity(st, current, goal, dt, rate) {
  const from=new THREE.Euler().setFromQuaternion(current,'YZX'),to=new THREE.Euler().setFromQuaternion(goal,'YZX');
  const yaw=Math.atan2(Math.sin(to.y-from.y),Math.cos(to.y-from.y));
  const desired=new THREE.Vector3(to.x-from.x,yaw,to.z-from.z).multiplyScalar(st.branchRoute ? 9 : 12);
  const total=Math.abs(desired.x)+Math.abs(desired.y)+Math.abs(desired.z);
  if(total>rate)desired.multiplyScalar(rate/total);
  st.howlerTurnVelocity ||= new THREE.Vector3();
  st.howlerTurnVelocity.lerp(desired,1-Math.exp(-18*dt));
  const delta=st.howlerTurnVelocity.clone().multiplyScalar(dt),remaining=new THREE.Vector3(to.x-from.x,yaw,to.z-from.z);
  // Easing must stop at the chosen heading, without overshooting and then
  // adding another corrective turn after the destination has been reached.
  for(const axis of ['x','y','z'])if(delta[axis]*remaining[axis]>=0 && Math.abs(delta[axis])>Math.abs(remaining[axis]))delta[axis]=remaining[axis];
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(from.x+delta.x,from.y+delta.y,from.z+delta.z,'YZX'));
}

export function settleHowlerTurnVelocity(st, current, next, dt) {
  if(!dt)return;
  const from=new THREE.Euler().setFromQuaternion(current,'YZX'),to=new THREE.Euler().setFromQuaternion(next,'YZX');
  st.howlerTurnVelocity ||= new THREE.Vector3();
  st.howlerTurnVelocity.set(to.x-from.x,Math.atan2(Math.sin(to.y-from.y),Math.cos(to.y-from.y)),to.z-from.z).divideScalar(dt);
}
export function howlerRig(motion) {
  const L = motion.len;
  motion.howlerRoots = motion.canopyJoints.map(p => p.clone());
  motion.howlerBends = canopyWalkerBends(L, motion.canopyJoints[2].y / L).map(p => new THREE.Vector3(...p));
  motion.howlerTips = motion.canopyFeet.map(p => p.clone());
  motion.howlerLengths = motion.howlerRoots.map((root, i) => [root.distanceTo(motion.howlerBends[i]), motion.howlerBends[i].distanceTo(motion.howlerTips[i])]);
}

export function howlerWeight(st, motion, dt, speed, reset = false) {
  if (reset || !st.howlerBody) { st.howlerBody = new THREE.Vector3(); st.gripSwing = -1; st.howlerForkTurn = false;st.howlerFinalPose=null; }
  if (!speed || !st.howlerJump && st.howlerResting && !st.gripFeet?.some(f => f.from)) return st.howlerBody;
  // A subtle, continuous shift toward the supporting side, rather than a
  // separate preparation pose that stops the torso for every hand placement.
  const target = new THREE.Vector3();
  let contacts = 0;
  for (let i = 0; i < 4; i++) if (st.gripFeet?.[i] && !st.gripFeet[i].free && !st.gripFeet[i].from) {
    target.add(motion.canopyFeet[i]); contacts++;
  }
  if (contacts) target.divideScalar(contacts);
  target.x = THREE.MathUtils.clamp((target.x - motion.len * .06) * .12, -motion.len * .009, motion.len * .009);
  target.z = THREE.MathUtils.clamp(target.z * .2, -motion.len * .012, motion.len * .012);
  // Crouch slightly for a tight turn so the far-side foot can catch bark
  // before the torso rotates. Straight travel retains the smaller weight shift.
  const turning = st.howlerTurnBlocked || st.canopyGoal && st.canopyQuaternion && st.canopyGoal.angleTo(st.canopyQuaternion)>.15;
  target.y = -motion.len * (turning ? st.howlerForkTurn?.025:.045 : .008 * Math.min(1, st.gait || 0));
  if(st.howlerForkTurn && !st.branchRoute && st.branchPoint.distanceTo(st.branch.point)<.004)target.set(0,0,0);
  const jumping=howlerJumpBody(st,motion.len,motion.canopyReachScale || 1);if(jumping)target.copy(jumping);
  if(st.howlerJump?.phase==='push') {
    // Choreograph the short thrust directly; walking's weight smoothing would
    // absorb most of the extension before the rear feet leave the branch.
    const previous=st.howlerBody.clone(),inverse=st.canopyQuaternion.clone().invert();
    const origin=new THREE.Vector3(motion.gripX || 0,motion.supportY || 0,motion.gripZ || 0);
    const reachable=offset=>st.gripFeet.slice(2).every((f,k)=>{
      if(st.howlerJump.pushContacts?.[k+2]===false)return true;
      const local=f.point.clone().sub(st.branchPoint).applyQuaternion(inverse).divideScalar(st.sc).add(origin).sub(offset);
      return local.distanceTo(motion.canopyJoints[k+2])<=motion.howlerLengths[k+2][0]+motion.howlerLengths[k+2][1]-.0001;
    });
    let low=0,high=1;
    if(reachable(target))st.howlerBody.copy(target);
    else {
      for(let i=0;i<12;i++){const t=(low+high)/2;if(reachable(previous.clone().lerp(target,t)))low=t;else high=t;}
      st.howlerBody.copy(previous).lerp(target,low);
    }
  } else st.howlerBody.lerp(target, 1 - Math.exp(-16 * dt));
  return st.howlerBody;
}

export function limitHowlerWeight(st, motion, before, lift, previous, sites) {
  if (!st.canopyQuaternion) return;
  const wood = [...sites].filter(Boolean).flatMap(site => { site.prepare(); return site.wood; });
  const point = new THREE.Vector3(), requested = st.howlerBody.clone();
  // Weight shifts happen before torso validation. Keep a newly caught hold
  // reachable even when collision recovery is temporarily brushing bark.
  const contactPoint=before.clone();contactPoint.y+=lift;
  const contactsFit=offset=>{st.howlerBody.copy(offset);return howlerNewContactsFit(st,motion,contactPoint,st.canopyQuaternion);};
  if(previous && !contactsFit(requested) && contactsFit(previous)) {
    let low=0,high=1;
    for(let i=0;i<12;i++) {
      const t=(low+high)/2;
      if(contactsFit(previous.clone().lerp(requested,t)))low=t;else high=t;
    }
    requested.copy(previous.clone().lerp(requested,low));
  }
  st.howlerBody.copy(requested);
  const clear = offset => {
    if(!contactsFit(offset))return false;
    point.copy(offset).multiplyScalar(st.sc).applyQuaternion(st.canopyQuaternion).add(before); point.y += lift;
    if(!bodyFitsWood({ motion, scale: st.sc }, point, st.canopyQuaternion, wood))return false;
    if(st.howlerForkTurn && !st.howlerJump && st.gripFeet) {
      const inverse=st.canopyQuaternion.clone().invert(),origin=new THREE.Vector3(motion.gripX||0,motion.supportY||0,motion.gripZ||0);
      for(let i=0;i<4;i++) {
        const foot=st.gripFeet[i];if(foot.free || foot.from && st.howlerGripStall>.25)continue;
        const local=(foot.to || foot.point).clone().sub(point).applyQuaternion(inverse).divideScalar(st.sc).add(origin);
        if(local.distanceTo(motion.canopyJoints[i])>motion.howlerLengths[i][0]+motion.howlerLengths[i][1]-.0001 || local.distanceTo(motion.canopyFeet[i])>motion.len*.55*(motion.canopyReachScale || 1) || local.y < -motion.len*.14)return false;
      }
    }
    return true;
  };
  if (clear(requested)) return;
  const start = previous?.clone() || new THREE.Vector3();
  if (!clear(start)) { start.set(0,0,0); if (!clear(start)) {
    const fresh=st.gripFeet?.some(f=>!f.free&&!f.from&&f.plantedFor<HOWLER_PLANTED);
    st.howlerBody.copy(fresh?requested:previous || start); return;
  } }
  let low = 0, high = 1;
  for (let i=0;i<10;i++) {
    const t=(low+high)/2;st.howlerBody.copy(start).lerp(requested,t);
    if (clear(st.howlerBody)) low=t;else high=t;
  }
  st.howlerBody.copy(start).lerp(requested,low);
}

// A torso turn must remain within reach of the contacts that are carrying it.
// The next placement can move a limb; rotating the body cannot release it.
export function howlerSupportedTurn(st, mo, point, pose, fork = false, wood = null) {
  if(st.howlerJump?.phase==='flight' || st.canopyLeap?.t>0&&st.canopyLeap.t<1)return true;
  if(st.howlerJump?.phase==='landing' && !st.gripFeet?.some(f=>!f.free&&!f.from))return true;
  const planted = st.gripFeet?.map(f => !f.free && !f.from);
  if (!planted || !st.canopyQuaternion) return true;
  // Straight branch walking can release a trailing grip through the scheduler.
  // A fork handover also pins translation, so the body cannot outrun all its
  // contacts while holding the same orientation.
  if (!fork && st.canopyQuaternion.angleTo(pose)<1e-6)return howlerNewContactsFit(st,mo,point,pose);
  const relaxed = fork && !st.howlerJump && st.howlerGripStall > .25;
  const supported = st.howlerJump?.phase==='landing' ? planted.some(Boolean) : st.howlerJump?.phase==='push' ? planted.slice(2).some(Boolean)
    : fork ? planted.filter(Boolean).length>=2 : planted.slice(0,2).some(Boolean) && planted.slice(2).some(Boolean);
  if (!supported) return false;
  const inverse = pose.clone().invert();
  const origin = new THREE.Vector3(mo.gripX || 0, mo.supportY || 0, mo.gripZ || 0);
  // A rigid torso at a fork can reach a pose where every contact sits at full
  // stretch with no other bark in reach, so neither body nor limbs can move.
  // During recovery, older stretched grips may release. Newly caught grips
  // stay reachable, and an airborne reach can redirect to real nearby bark.
  // A deeper stall retains the prospective-contact escape for crowded forks.
  let holding = 0, catching = 0;
  for (let i=0;i<4;i++) {
    const foot = st.gripFeet?.[i];
    if (!foot || foot.free || foot.from && !fork) continue;
    const local = (foot.to || foot.point).clone().sub(point).applyQuaternion(inverse).divideScalar(st.sc).add(origin);
    if(st.howlerBody)local.sub(st.howlerBody);
    const reach = mo.howlerLengths[i][0]+mo.howlerLengths[i][1]-.0001;
    if(local.distanceTo(mo.canopyJoints[i])>reach || local.distanceTo(mo.canopyFeet[i])>(foot.reachRadius || mo.len*(fork?.55:.4)*(mo.canopyReachScale || 1)) || local.y < -mo.len*.14) {
      if(foot.from && relaxed && wood) {
        const translation=(st.howlerBody?.clone() || new THREE.Vector3()).sub(origin).multiplyScalar(st.sc).applyQuaternion(pose).add(point);
        const matrix=new THREE.Matrix4().compose(translation,pose,new THREE.Vector3(st.sc,st.sc,st.sc));
        if(!howlerReachTarget(mo,matrix,i,p=>barkGrip(p,wood),foot.to))return false;
        catching++;
      } else if (!relaxed || foot.from || foot.plantedFor<HOWLER_PLANTED) return false;
    }
    else if(!foot.from)holding++;
    else catching++;
  }
  return !relaxed || holding>=2 || st.howlerGripStall>.5 && holding+catching>=2;
}

// CPU counterpart for validation: preserve both bone lengths while aiming a
// hand/foot at a real grip. The elbow/knee keeps its original bending side.
export function howlerJoint(root, bend, tip, target, offset = new THREE.Vector3()) {
  const start = root.clone().add(offset), delta = target.clone().sub(start);
  const a = root.distanceTo(bend), b = bend.distanceTo(tip);
  const distance = THREE.MathUtils.clamp(delta.length(), Math.abs(a - b) + 1e-5, a + b - 1e-5);
  const direction = delta.lengthSq() > 1e-10 ? delta.normalize() : tip.clone().sub(root).normalize();
  const pole = bend.clone().sub(root), rest = tip.clone().sub(root).normalize();
  pole.addScaledVector(rest, -pole.dot(rest));
  pole.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(rest, direction));
  if (pole.lengthSq() < 1e-10) { pole.set(0, 0, root.z >= 0 ? 1 : -1); pole.addScaledVector(direction, -pole.dot(direction)); }
  pole.normalize();
  const along = (a * a + distance * distance - b * b) / (2 * distance);
  return { root: start, joint: start.clone().addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along))),
    tip: start.clone().addScaledVector(direction, distance) };
}

export const HOWLER_JOINT_GLSL = `
vec3 howlerRotate(vec3 v, vec3 from, vec3 to) {
  vec3 a = normalize(from), b = normalize(to), axis = cross(a, b);
  float c = clamp(dot(a, b), -1.0, 1.0), s = length(axis);
  if (s < .00001) {
    if (c > 0.0) return v;
    axis = normalize(cross(a, abs(a.x) < .8 ? vec3(1.,0.,0.) : vec3(0.,0.,1.)));
    return 2.0 * axis * dot(axis, v) - v;
  }
  axis /= s;
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}
void howlerLimb(inout vec3 p, inout vec3 n, vec3 grip) {
  int i = int(aPart) - 1;
  vec3 root = uHowlerRoots[i], bend = uHowlerBends[i], tip = uHowlerTips[i];
  vec3 start = root, target = tip + grip;
  vec3 direction = target - start;
  float a = length(bend-root), b = length(tip-bend);
  float d = clamp(length(direction), abs(a-b)+.00001, a+b-.00001);
  direction = length(direction) > .00001 ? normalize(direction) : normalize(tip-root);
  vec3 rest = normalize(tip-root), pole = bend-root;
  pole -= rest * dot(pole,rest); pole = howlerRotate(pole,rest,direction);
  if (length(pole) < .00001) { pole = vec3(0.,0.,root.z >= 0. ? 1. : -1.); pole -= direction * dot(pole,direction); }
  pole = normalize(pole);
  float along = (a*a+d*d-b*b)/(2.0*d);
  vec3 joint = start + direction*along + pole*sqrt(max(0.,a*a-along*along));
  vec3 end = start + direction*d;
  // The mesh supplies an explicit shoulder/hip or elbow/knee pivot for
  // each capsule. Rigid segments meet at the joint without vertex blending.
  float lower = distance(aPivot,bend) < uLength*.001 ? 1.0 : 0.0;
  vec3 upperP = start + howlerRotate(position-root,bend-root,joint-start);
  vec3 lowerP = joint + howlerRotate(position-bend,tip-bend,end-joint);
  vec3 upperN = howlerRotate(n,bend-root,joint-start), lowerN = howlerRotate(n,tip-bend,end-joint);
  p = mix(upperP,lowerP,lower); n = normalize(mix(upperN,lowerN,lower));
}
`;
