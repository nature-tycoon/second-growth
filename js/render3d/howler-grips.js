// Shared overlapping branch-walker placements. Contacts stay on bark while the
// torso passes over them; a new placement need not wait for all other limbs.
import * as THREE from 'three';
import { HOWLER_PLACEMENT, HOWLER_PLANTED, howlerTurnPose } from './howler-motion.js';
import { howlerJumpGrips } from './howler-jump.js';
import { howlerReachTarget } from './howler-contact.js';

export function howlerGrips(st, mo, matrix, dt, fresh, bark) {
  const inverse = matrix.clone().invert(), size = mo.len * st.sc;
  const forward = new THREE.Vector3(st.howlerBacking ? -1 : 1, 0, 0).transformDirection(matrix);
  const rests = mo.canopyFeet.map(p => p.clone().applyMatrix4(matrix));
  const reach = mo.howlerLengths.map(([a,b]) => a + b - .0001);
  const reachable = (p,i,radius=mo.len*(st.howlerForkTurn?.55:.4)*(mo.canopyReachScale || 1)) => {
    const local = p.clone().applyMatrix4(inverse);
    return local.distanceTo(mo.canopyJoints[i]) <= reach[i] &&
      local.distanceTo(mo.canopyFeet[i]) <= radius && local.y >= -mo.len * .14;
  };
  if (!dt && !fresh) return st.gripOffsets;
  if(fresh || !st.howlerGripProgress) {
    st.howlerGripProgress={point:st.branchPoint.clone(),pose:st.canopyQuaternion.clone(),goal:(st.canopyGoal || st.canopyQuaternion).clone()};st.howlerGripStall=0;
  }
  if(st.howlerForkTurn && !st.howlerJump && dt) {
    const progress=st.howlerGripProgress;
    if(progress.point.distanceTo(st.branchPoint)>size*.025 || progress.pose.angleTo(progress.goal)-st.canopyQuaternion.angleTo(progress.goal)>.07) {
      progress.point.copy(st.branchPoint);progress.pose.copy(st.canopyQuaternion);progress.goal.copy(st.canopyGoal || st.canopyQuaternion);st.howlerGripStall=0;
    } else st.howlerGripStall+=dt;
  }
  const jumpGrips=howlerJumpGrips(st,mo,matrix,bark,dt);if(jumpGrips)return jumpGrips;
  if(st.canopyLeap?.t>0 && st.canopyLeap.t<1) {
    // Vertical trunk releases use the existing validated flight pose, with
    // the shared rigid limb rig tucked clear of bark until the catch.
    st.gripOffsets ||= mo.canopyFeet.map(()=>new THREE.Vector3());
    for(let i=0;i<4;i++) {
      const local=mo.canopyFeet[i].clone();local.y+=mo.len*.09;
      local.sub(mo.canopyJoints[i]).clampLength(0,reach[i]).add(mo.canopyJoints[i]);
      Object.assign(st.gripFeet[i],{free:true,site:null,from:null,to:null});
      st.gripFeet[i].point.copy(local).applyMatrix4(matrix);
      st.gripOffsets[i].copy(local).sub(mo.canopyFeet[i]);
    }
    return st.gripOffsets;
  }
  for (let i=0;i<4;i++) {
    const foot=st.gripFeet[i];
    foot.caught=false;
    if(!foot.free&&!foot.from&&foot.plantedFor!==undefined)foot.plantedFor+=dt;
    // Complete an already committed swing before choosing another hold.
    if (foot.from) {
      if(st.howlerForkTurn && !st.howlerJump && !reachable(foot.to,i,foot.reachRadius)) {
        const target=howlerReachTarget(mo,matrix,i,bark,foot.to);
        if(target) {
          const remaining=Math.max(dt,(foot.duration || HOWLER_PLACEMENT)-foot.elapsed);
          const correction=foot.point.distanceTo(target)/(size*4);
          foot.from=foot.point.clone();foot.to=target;foot.elapsed=0;
          // Preserve progress through small moving-body corrections. Starting
          // a full reach clock again each frame can strand a hand in midair.
          foot.duration=Math.max(remaining,correction);
        }
      }
      foot.elapsed += dt;
      const t=Math.min(1,foot.elapsed/(foot.duration || HOWLER_PLACEMENT)), ease=t*t*(3-2*t);
      foot.point.copy(foot.from).lerp(foot.to,ease);
      const lift = new THREE.Vector3(0,1,0).transformDirection(matrix);
      // A squared lift curve starts and catches with zero vertical velocity.
      // Small regrips need a small lift, rather than a full-height hop.
      const height=Math.min(size*.025,foot.from.distanceTo(foot.to)*.35);
      foot.point.addScaledVector(lift, Math.sin(t*Math.PI)**2*height);
      if (t>=1) {
        if(reachable(foot.to,i,foot.reachRadius)) {
          foot.site=foot.to.canopySite;foot.free=false;foot.catches=(foot.catches||0)+1;foot.caught=true;foot.plantedFor=0;foot.forkCatch=(st.howlerForkTurn || foot.reachRadius>mo.len*.4*(mo.canopyReachScale || 1))&&!st.howlerJump;
        } else { foot.free=true;foot.site=null; }
        foot.from=foot.to=null;
      }
    }
    if (!foot.from && !reachable(foot.point,i,foot.reachRadius)) { foot.free=true;foot.site=null; }
  }
  let swinging=st.gripFeet.filter(f=>f.from).length;
  const settled=st.howlerResting && st.gripFeet.some(f=>!f.free && !f.from);
  let future=null;
  const finishing=!st.branchRoute&&st.branchPoint.distanceTo(st.branch.point)<.004;
  if(st.howlerForkTurn && (!st.howlerJump || st.howlerJump.phase==='prepare') && st.canopyGoal && (st.branchRoute || st.howlerTurnBlocked)) {
    // Keep long reaches during travel. If the torso cannot use them, seek a
    // nearer replacement hold that unlocks a small part of the blocked turn.
    const horizon=st.howlerGripStall>.35?.15:st.howlerGripStall>.18?.4:1;
    const current=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(matrix));
    const pose=finishing ? howlerTurnPose(current,st.canopyGoal,mo.canopyTurnLead || .85) : current.rotateTowards(st.canopyGoal,.22*horizon);
    const origin=new THREE.Vector3().setFromMatrixPosition(matrix),destination=st.branchRoute?.points[st.branchRoute.cursor];
    if(destination)origin.add(destination.clone().sub(st.branchPoint).clampLength(0,size*.18*horizon));
    future=new THREE.Matrix4().compose(origin,pose,new THREE.Vector3(st.sc,st.sc,st.sc));
  }
  // Prefer a hind-foot / same-side-hand sequence, but let a threatened contact
  // catch first at a fork. Two overlapping swings remove the stop/start march.
  const order=[2,0,3,1];
  if(future) {
    const nextInverse=future.clone().invert();
    const difficulty=i=>{const local=st.gripFeet[i].point.clone().applyMatrix4(nextInverse);return Math.max(local.distanceTo(mo.canopyJoints[i])-reach[i],local.distanceTo(mo.canopyFeet[i])-mo.len*(st.howlerForkTurn?.55:.4)*(mo.canopyReachScale || 1),-mo.len*.14-local.y);};
    order.sort((a,b)=>difficulty(b)-difficulty(a));
  }
  const first = future ? 0 : st.gripNext || 0;
  if (dt) for (let k=0;k<4 && swinging<2;k++) {
    const i=order[(first+k)%4], foot=st.gripFeet[i];
    if(foot.caught)continue;
    if(st.howlerJump?.phase==='prepare' && i>=2&&!foot.free&&!foot.from && st.canopyQuaternion.angleTo(st.canopyGoal)<.35)continue;
    if(!foot.free&&!foot.from&&foot.plantedFor<HOWLER_PLANTED)continue;
    if (settled && !foot.free) continue;
    if (st.howlerForkTurn && !foot.free && !foot.from && st.gripFeet.filter(f=>!f.free&&!f.from).length<=2)continue;
    if (!foot.free && st.howlerTurnMoved && st.gripFeet.filter(f=>!f.free&&!f.from).length<=2)continue;
    if (!st.howlerForkTurn && st.gripFeet.some((f,j)=>(f.from || f.caught) && (i<2)===(j<2))) continue;
    if (!st.howlerForkTurn && !foot.free && !st.gripFeet.some((f,j)=>j!==i && (i<2)===(j<2) && !f.free && !f.from) && !(st.howlerTurnBlocked && !st.howlerTurnMoved)) continue;
    const extension=foot.point.clone().applyMatrix4(inverse).distanceTo(mo.canopyJoints[i]);
    if (foot.from || !foot.free && foot.point.distanceTo(rests[i])<size*(future?.055:.085) && extension<reach[i]-mo.len*(future?.06:.03) && !(st.howlerTurnBlocked && !st.howlerTurnMoved)) continue;
    let target;
    let minimum=size*.025;
    if(future) {
      let score=Infinity;
      const nextInverse=future.clone().invert();
      const old=foot.point.clone().applyMatrix4(nextInverse);
      const threatened=old.distanceTo(mo.canopyJoints[i])>reach[i] || old.distanceTo(mo.canopyFeet[i])>mo.len*(st.howlerForkTurn?.55:.4)*(mo.canopyReachScale || 1) || old.y < -mo.len*.14;
      if(threatened)minimum=size*.006;
      const candidates=[];
      for(const lead of [0,.08,.16,-.08]) for(const lift of [0,.08,.16,.24]) {
        const desired=mo.canopyFeet[i].clone();desired.x+=mo.len*lead;desired.y+=mo.len*lift;
        candidates.push(bark(desired.applyMatrix4(future)));
      }
      // At a thick fork, the nearest surface to the resting hand can jump to
      // another limb. Also search along the existing hold's own bark surface.
      const rest=mo.canopyFeet[i].clone().applyMatrix4(future);
      if(st.howlerGripStall>.35)for(const amount of [.15,.3,.5,.75])candidates.push(bark(foot.point.clone().lerp(rest,amount)));
      for(const candidate of candidates) {
        if(!candidate?.canopySite || !reachable(candidate,i) || !foot.free && candidate.distanceTo(foot.point)<minimum)continue;
        const local=candidate.clone().applyMatrix4(nextInverse);
        if(local.distanceTo(mo.canopyJoints[i])>reach[i] || local.distanceTo(mo.canopyFeet[i])>mo.len*(st.howlerForkTurn?.55:.4)*(mo.canopyReachScale || 1) || local.y < -mo.len*.14)continue;
        // Leave some bend in the catching limb so this hold supports the
        // next body turn instead of immediately reaching full extension.
        const now=candidate.clone().applyMatrix4(inverse);
        const strain=Math.max(local.distanceTo(mo.canopyJoints[i]),now.distanceTo(mo.canopyJoints[i]));
        const cost=local.distanceTo(mo.canopyFeet[i])+(finishing || st.howlerGripStall>.25 ? Math.max(0,strain-reach[i]+mo.len*.08)*2 : 0);if(cost<score){score=cost;target=candidate;}
      }
    }
    // Reposition toward the next small turn at a fork or after travel ends.
    // Replanting at the current resting pose cannot unlock the remaining yaw.
    if (!target && st.howlerTurnBlocked && st.canopyGoal && (st.howlerForkTurn || st.branchPoint.distanceTo(st.branch.point)<.004)) {
      const current=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(matrix));
      const pose=st.branchPoint.distanceTo(st.branch.point)<.004 ? howlerTurnPose(current,st.canopyGoal,.2) : current.rotateTowards(st.canopyGoal,.2);
      const origin=new THREE.Vector3().setFromMatrixPosition(matrix);
      for(const lead of [0,.08,-.08]) {
        const desired=mo.canopyFeet[i].clone();desired.x+=mo.len*lead;
        desired.multiplyScalar(st.sc).applyQuaternion(pose).add(origin);
        const candidate=bark(desired);
        if(candidate?.canopySite && reachable(candidate,i) && (foot.free || candidate.distanceTo(foot.point)>size*.025)){target=candidate;break;}
      }
    }
    // The thicker lower trunk can put a long forward reach beyond a short
    // rear leg. Try a closer hold instead of leaving that foot tucked in air.
    for (const lead of [.13,.06,0]) {
      if(target)break;
      const candidate=bark(rests[i].clone().addScaledVector(forward,size*lead*(st.howlerTurnBlocked?Math.max(.6,st.gait):st.gait)));
      if(candidate?.canopySite && reachable(candidate,i) && (foot.free || candidate.distanceTo(foot.point)>size*.025)){target=candidate;break;}
    }
    if(!target && st.howlerForkTurn) {
      for(const lift of [.08,.16,.24]) {
        const desired=mo.canopyFeet[i].clone();desired.y+=mo.len*lift;
        const candidate=bark(desired.applyMatrix4(matrix));
        if(candidate?.canopySite && reachable(candidate,i) && (foot.free || candidate.distanceTo(foot.point)>size*.025)){target=candidate;break;}
      }
    }
    if (!target) {
      const candidate=bark(mo.canopyJoints[i].clone().applyMatrix4(matrix));
      if(candidate?.canopySite && reachable(candidate,i))target=candidate;
    }
    if (!target || !foot.free && target.distanceTo(foot.point)<minimum) continue;
    foot.from=foot.point.clone();foot.to=target;foot.elapsed=0;foot.reachRadius=mo.len*(st.howlerForkTurn?.55:.4)*(mo.canopyReachScale || 1);
    foot.duration=HOWLER_PLACEMENT+(st.howlerForkTurn && !st.howlerJump ? THREE.MathUtils.clamp(foot.from.distanceTo(target)/size-.25,0,.3)*.08 : 0);foot.free=false;foot.placements=(foot.placements||0)+1;
    swinging++;st.gripNext=(order.indexOf(i)+1)%4;
  }
  st.gripSwing=st.gripFeet.findIndex(f=>f.from);
  st.gripOffsets ||= mo.canopyFeet.map(()=>new THREE.Vector3());
  for(let i=0;i<4;i++) {
    const foot=st.gripFeet[i];
    if(foot.free && !foot.from) {
      const tuck=mo.canopyFeet[i].clone();tuck.y+=mo.len*.07;
      foot.point.lerp(tuck.applyMatrix4(matrix),1-Math.exp(-18*dt));
    }
    // Bound every rendered target, including airborne reaches. The shader
    // solves the same two bone lengths, without stretching a planted arm.
    const local=foot.point.clone().applyMatrix4(inverse);
    local.sub(mo.canopyJoints[i]).clampLength(0,reach[i]).add(mo.canopyJoints[i]);
    if (!foot.from && !foot.free && local.clone().applyMatrix4(matrix).distanceTo(foot.point)>1e-6) {
      foot.free=true;foot.site=null;
    }
    if(foot.free || foot.from)foot.point.copy(local.clone().applyMatrix4(matrix));
    st.gripOffsets[i].copy(local).sub(mo.canopyFeet[i]);
  }
  return st.gripOffsets;
}
