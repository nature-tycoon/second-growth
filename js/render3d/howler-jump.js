// Shared branch-jump choreography, timed in real seconds rather than game months.
import * as THREE from 'three';
import { howlerReachTarget } from './howler-contact.js';

export const HOWLER_CROUCH = .3, HOWLER_PUSH = .14, HOWLER_LANDING = .32;
const smooth = (t,a=0,b=1) => { t=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return t*t*(3-2*t); };

// A hand at nearly full reach from its shoulder: a straight arm pointing
// forward, raised by `pitch` radians and slightly spread to its own side.
function stretched(mo, i, reach, pitch, extra=0) {
  const side=i%2===0?1:-1, angle=pitch+extra;
  const direction=new THREE.Vector3(Math.cos(angle),Math.sin(angle),side*.14).normalize();
  return mo.canopyJoints[i].clone().addScaledVector(direction,reach*.985);
}

export function howlerArcHeight(from, to, size) {
  const horizontal=Math.hypot(to.x-from.x,to.z-from.z),drop=Math.max(0,from.y-to.y);
  // A shallow parabola above the line between holds gives a forward launch.
  // A lower receiving branch still needs a little upward departure velocity.
  return Math.min(.35,Math.max(size*.16,horizontal*.12,drop*.28));
}

export function howlerJumpGate(st, route, dt) {
  if(route.trunkTransfer || route.walkerReleaseLaunch || !route.walkerJumpClear)return null;
  if (route.gap<1 || route.points[route.gap-1].distanceTo(route.points[route.gap])<.025) return null;
  let jump=st.howlerJump;
  if (!jump || jump.route!==route) {
    const from=route.points[route.gap-1],to=route.points[route.gap];
    jump=st.howlerJump={route,from,to,phase:'prepare',elapsed:0,yaw:Math.atan2(-(to.z-from.z),to.x-from.x),
      duration:route.landingTrunk!=null?.9:THREE.MathUtils.clamp(.32+from.distanceTo(to)*.28,.35,.7)};
  }
  if(jump.phase==='prepare') {
    jump.elapsed=Math.min(HOWLER_CROUCH,jump.elapsed+dt);
    jump.prepareWait=(jump.prepareWait || 0)+dt;
    const facing=new THREE.Vector3(1,0,0).applyQuaternion(st.canopyQuaternion);
    const direction=jump.to.clone().sub(jump.from);facing.y=direction.y=0;
    const planted=st.gripFeet?.map(f=>!f.free&&!f.from);
    const ready=facing.normalize().dot(direction.normalize())>.85 &&
      planted?.filter(Boolean).length>=3 && planted.slice(2).some(Boolean);
    if(jump.elapsed>=HOWLER_CROUCH && ready){
      jump.phase='push';jump.elapsed=0;jump.pushFrom=st.howlerBody.clone();jump.pushContacts=planted;
    }
    if(jump.phase==='prepare' && jump.prepareWait>1.4) {
      // A narrow bark ledge may never admit three contacts. Keep the existing
      // supported release instead of waiting indefinitely for a false stance.
      route.walkerReleaseLaunch=true;route.walkerJumpClear=false;st.howlerJump=null;return 0;
    }
    return 0;
  }
  if(jump.phase==='push') {
    // Show the full extension with the rear toes still on bark. Release on
    // the following frame, when the ballistic path actually leaves the tree.
    if(jump.elapsed<HOWLER_PUSH){jump.elapsed=Math.min(HOWLER_PUSH,jump.elapsed+dt);return 0;}
    jump.launchBody=st.howlerBody.clone();jump.phase='flight';jump.elapsed=0;
  }
  if(jump.phase==='flight') {
    jump.elapsed+=dt;
    // The route gate uses a tucked silhouette; the live full torso can still
    // meet a neighbouring limb. Resume the higher transfer from the accepted
    // position if that arc cannot finish, rather than hang in flight forever.
    if(jump.elapsed>jump.duration*2+.4) {
      route.walkerReleaseLaunch=true;route.walkerJumpClear=false;st.howlerJump=null;return 0;
    }
    return jump.from.distanceTo(jump.to)*dt/jump.duration;
  }
  return 0;
}

export function howlerLandingGate(st, dt) {
  const jump=st.howlerJump;
  if(jump?.phase!=='landing')return false;
  jump.elapsed+=dt;
  if(jump.elapsed>=HOWLER_LANDING && st.gripFeet?.slice(0,2).some(f=>!f.free&&!f.from) && st.gripFeet.slice(2).some(f=>!f.free&&!f.from)) {
    st.howlerJump=null;st.howlerForkTurn=false;return false;
  }
  if(jump.elapsed>.8) {
    // A narrow landing can be supported by just one limb pair. Resume the
    // established clamber rather than demand four static catches forever.
    jump.route.walkerJumpClear=false;st.howlerJump=null;return false;
  }
  return true;
}

export function settleHowlerJump(st) {
  const jump=st.howlerJump;
  if(jump?.phase==='flight' && st.branchPoint.distanceTo(jump.to)<.0001 && jump.route.cursor>jump.route.gap) {
    jump.phase='landing';jump.elapsed=0;
  }
}

export function howlerJumpBody(st, length, reachScale=1) {
  const jump=st.howlerJump;if(!jump)return null;
  const t=jump.elapsed/HOWLER_CROUCH;
  if(jump.phase==='prepare')return new THREE.Vector3(-.025*smooth(t),-.1*smooth(t,0,.85),0).multiplyScalar(length*reachScale);
  if(jump.phase==='push')return jump.pushFrom.clone().lerp(new THREE.Vector3(.16,.055,0).multiplyScalar(length*reachScale),smooth(jump.elapsed/HOWLER_PUSH));
  if(jump.phase==='flight')return jump.launchBody.clone().multiplyScalar(1-smooth(st.canopyLeap?.t || 0,0,.25));
  if(jump.phase==='landing')return new THREE.Vector3(.015*Math.sin(Math.PI*Math.min(1,jump.elapsed/HOWLER_LANDING)),
    -.09*Math.sin(Math.PI*Math.min(1,jump.elapsed/HOWLER_LANDING)),0).multiplyScalar(length);
  return null;
}

export function howlerJumpPose(st) {
  const jump=st.howlerJump;if(!jump)return null;
  let pitch=0;
  if(jump.phase==='push')pitch=.03*smooth(jump.elapsed/HOWLER_PUSH);
  if(jump.phase==='flight')pitch=THREE.MathUtils.lerp(.08,-.1,smooth(st.canopyLeap?.t || 0,.3,.85));
  if(jump.phase==='landing')pitch=-.1*(1-smooth(jump.elapsed/HOWLER_LANDING));
  const pose=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,jump.yaw,pitch,'YZX'));
  if(jump.to.canopyPose && ['flight','landing'].includes(jump.phase)) {
    const angles=new THREE.Euler().setFromQuaternion(jump.to.canopyPose,'YZX');
    const difference=Math.atan2(Math.sin(angles.y-jump.yaw),Math.cos(angles.y-jump.yaw));
    if(Math.abs(difference)>Math.PI/2){angles.y+=Math.PI;angles.x*=-1;angles.z*=-1;}
    const landing=new THREE.Quaternion().setFromEuler(angles);
    if(jump.route.landingTrunk!=null || Math.abs(angles.z)>.25)pose.slerp(landing,jump.phase==='landing'?1:smooth(st.canopyLeap?.t || 0,.55,1));
  }
  return pose;
}

export function howlerJumpGrips(st, mo, matrix, bark, dt=0, jump=st.howlerJump) {
  if(!jump || !['push','flight','landing'].includes(jump.phase))return null;
  const inverse=matrix.clone().invert(),reach=mo.howlerLengths.map(([a,b])=>a+b-.0001);
  st.gripOffsets ||= mo.canopyFeet.map(()=>new THREE.Vector3());
  if(jump.phase==='push') {
    jump.handFrom ||= st.gripFeet.slice(0,2).map(f=>f.point.clone().applyMatrix4(inverse));
    for(let i=0;i<4;i++) {
      const foot=st.gripFeet[i];
      let target=foot.point.clone().applyMatrix4(inverse);
      if(i<2 || jump.pushContacts?.[i]===false) {
        // The hands swing forward into straight, outstretched arms. The lead
        // (left) arm gets there a little before the other.
        const lag=i===0?0:.2;
        if(i<2)target.lerpVectors(jump.handFrom[i],stretched(mo,i,reach[i],.3,i===0?.04:0),smooth(jump.elapsed/HOWLER_PUSH,lag,1));
        target.sub(mo.canopyJoints[i]).clampLength(0,reach[i]).add(mo.canopyJoints[i]);
        foot.point.copy(target).applyMatrix4(matrix);foot.free=true;foot.site=null;foot.from=foot.to=null;
      }
      // Supporting rear targets remain at their original world-space bark
      // contacts. The thrust straightens those knees against the fixed toes.
      st.gripOffsets[i].copy(target).sub(mo.canopyFeet[i]);
    }
    st.gripSwing=-1;return st.gripOffsets;
  }
  if(jump.phase==='flight') {
    jump.airFrom ||= st.gripFeet.map(f=>f.point.clone().applyMatrix4(inverse));
    const t=st.canopyLeap?.t || 0;
    for(let i=0;i<4;i++) {
      const front=i<2, side=i%2===0?1:-1;
      let target;
      if(front) {
        // Arms stay straight for the whole flight. They angle from up-forward
        // at takeoff down toward the receiving branch, lead arm first.
        const lead=i===0?.06:0;
        target=stretched(mo,i,reach[i],THREE.MathUtils.lerp(.3,-.32,smooth(t+lead,.35,.95)),lead);
      } else {
        // Each leg trails from the push, tucks, then swings forward to catch.
        // The right leg runs a beat behind so the pair never mirrors.
        const lag=i===3?.13:0, tt=THREE.MathUtils.clamp(t-lag,0,1);
        const trail=new THREE.Vector3(-.3,.06,side*.05).multiplyScalar(mo.len);
        const tuck=new THREE.Vector3(i===3?-.16:-.2,i===3?.24:.2,side*.06).multiplyScalar(mo.len);
        const extension=new THREE.Vector3(-.2,.035,side*.04).multiplyScalar(mo.len);
        target=trail.lerp(tuck,smooth(tt,.05,.45)).lerp(extension,smooth(tt,.62,.97));
      }
      target.lerpVectors(jump.airFrom[i],target,smooth(t,0,front?.12:.18));
      // Blend the arm's angle, not a chord through it, so the elbows stay straight.
      if(front)target.sub(mo.canopyJoints[i]).setLength(reach[i]*.985).add(mo.canopyJoints[i]);
      target.sub(mo.canopyJoints[i]).clampLength(0,reach[i]).add(mo.canopyJoints[i]);
      const foot=st.gripFeet[i];foot.point.copy(target).applyMatrix4(matrix);
      foot.free=true;foot.site=null;foot.from=foot.to=null;
      st.gripOffsets[i].copy(target).sub(mo.canopyFeet[i]);
    }
    st.gripSwing=-1;return st.gripOffsets;
  }
  jump.landFrom ||= st.gripFeet.map(f=>f.point.clone());
  jump.landTargets ||= [null,null,null,null];
  for(let i=0;i<4;i++) {
    // Lead hand, other hand, then the feet one after another.
    const foot=st.gripFeet[i], delay=[0,.035,.075,.115][i];
    if(!foot.free&&!foot.from&&foot.plantedFor!==undefined)foot.plantedFor+=dt;
    if(!jump.landTargets[i]) {
      for(const lead of [i<2?.06:0,0]) {
        const desired=mo.canopyFeet[i].clone();desired.x+=mo.len*lead;
        const target=bark(desired.applyMatrix4(matrix));
        if(target?.canopySite && target.clone().applyMatrix4(inverse).distanceTo(mo.canopyJoints[i])<=reach[i]) {jump.landTargets[i]=target;break;}
      }
    }
    jump.landTargets[i] ||= howlerReachTarget(mo,matrix,i,bark);
    const target=jump.landTargets[i];
    if(target && foot.free && jump.elapsed>=delay) {
      foot.from=jump.landFrom[i];foot.to=target;
      const t=smooth(jump.elapsed-delay,0,.085);
      foot.point.copy(foot.from).lerp(target,t);
      if(t>=1){foot.free=false;foot.site=target.canopySite;foot.from=foot.to=null;foot.catches=(foot.catches||0)+1;foot.plantedFor=0;foot.forkCatch=true;foot.reachRadius=mo.len*.55*(mo.canopyReachScale || 1);}
    }
    const local=foot.point.clone().applyMatrix4(inverse);
    local.sub(mo.canopyJoints[i]).clampLength(0,reach[i]).add(mo.canopyJoints[i]);
    if(local.clone().applyMatrix4(matrix).distanceTo(foot.point)>1e-6){foot.free=true;foot.site=null;foot.point.copy(local).applyMatrix4(matrix);jump.landTargets[i]=null;}
    st.gripOffsets[i].copy(local).sub(mo.canopyFeet[i]);
  }
  st.gripSwing=st.gripFeet.findIndex(f=>f.from);return st.gripOffsets;
}
