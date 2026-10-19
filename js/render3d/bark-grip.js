import * as THREE from 'three';
import { woodDistance } from './wood-clearance.js';
const near=new THREE.Vector3(),radial=new THREE.Vector3(),candidate=new THREE.Vector3();
let distances = new Float64Array(64);

// The nearest point on a limb's bark to `point`, into `out`.
function barkPoint(point, b, out) {
  const along = radial.copy(point).sub(b.from).dot(b.dir), t = THREE.MathUtils.clamp(along / b.length, 0, 1);
  near.copy(b.from).lerp(b.to, t);
  radial.copy(point).sub(near).addScaledVector(b.dir, -radial.dot(b.dir));
  const radius = THREE.MathUtils.lerp(b.r0, b.r1, t);
  if (along < 0 || along > b.length) radial.clampLength(0, radius);
  else {
    if (radial.lengthSq() < 1e-10) radial.copy(b.up);
    radial.normalize().multiplyScalar(radius);
  }
  return out.copy(near).add(radial);
}

export function barkGrip(point, wood, triangles = [], owners = null) {
  let best = Infinity, grip = point.clone();
  if (!wood.length) for (const triangle of triangles) {
    triangle.closestPointToPoint(point, near);
    const distance = near.distanceToSquared(point);
    if (distance < best) { best = distance; grip.copy(near); grip.canopySite = triangle.canopySite; }
  }
  // The nearest bark point not buried inside other wood (the first limb wins a tie). Buried
  // checks look at every limb, so take candidates nearest first rather than in limb order.
  if (distances.length < wood.length) distances = new Float64Array(wood.length * 2);
  for (let i = 0; i < wood.length; i++) distances[i] = barkPoint(point, wood[i], candidate).distanceToSquared(point);
  for (;;) {
    let index = -1, nearest = Infinity;
    for (let i = 0; i < wood.length; i++) if (distances[i] < nearest) { nearest = distances[i]; index = i; }
    if (index < 0) break;
    const b = wood[index];
    barkPoint(point, b, candidate);
    if (wood.some(other => woodDistance(candidate, other) < -.001)) { distances[index] = Infinity; continue; }
    best = nearest; grip = candidate.clone(); grip.canopySite = owners?.get(b);
    break;
  }
  return Number.isFinite(best) ? grip : null;
}
