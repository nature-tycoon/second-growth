import * as THREE from 'three';

// Shared prospective/actual reach search. The prospective callback projects on
// wood geometry; the actual one also attaches the owning canopy site.
export function howlerReachTarget(mo,matrix,i,project,previous=null) {
  const inverse=matrix.clone().invert(),reach=mo.howlerLengths[i][0]+mo.howlerLengths[i][1]-.0001;
  const desired=[];
  if(previous)desired.push(previous.clone().applyMatrix4(inverse).sub(mo.canopyJoints[i]).clampLength(0,reach-mo.len*.01).add(mo.canopyJoints[i]));
  for(const lead of [0,.13,-.08])for(const lift of [0,.08,.16,.24]) {
    const p=mo.canopyFeet[i].clone();p.x+=mo.len*lead;p.y+=mo.len*lift;desired.push(p);
  }
  let target=null,score=Infinity;
  for(const local of desired) {
    const candidate=project(local.applyMatrix4(matrix));if(!candidate)continue;
    const p=candidate.clone().applyMatrix4(inverse);
    if(p.distanceTo(mo.canopyJoints[i])>reach || p.distanceTo(mo.canopyFeet[i])>mo.len*.55*(mo.canopyReachScale || 1) || p.y < -mo.len*.14)continue;
    const cost=previous?candidate.distanceTo(previous):p.distanceTo(mo.canopyFeet[i]);
    if(cost<score){target=candidate;score=cost;}
  }
  return target;
}
