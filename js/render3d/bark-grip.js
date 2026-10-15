import * as THREE from 'three';
import { woodDistance } from './wood-clearance.js';
const near=new THREE.Vector3(),radial=new THREE.Vector3();

export function barkGrip(point, wood, triangles = [], owners = null) {
  let best = Infinity, grip = point.clone();
  if (!wood.length) for (const triangle of triangles) {
    triangle.closestPointToPoint(point, near);
    const distance = near.distanceToSquared(point);
    if (distance < best) { best = distance; grip.copy(near); grip.canopySite = triangle.canopySite; }
  }
  for (const b of wood) {
    const along = radial.copy(point).sub(b.from).dot(b.dir), t = THREE.MathUtils.clamp(along / b.length, 0, 1);
    near.copy(b.from).lerp(b.to, t);
    radial.copy(point).sub(near).addScaledVector(b.dir, -radial.dot(b.dir));
    const radius = THREE.MathUtils.lerp(b.r0, b.r1, t);
    if (along < 0 || along > b.length) radial.clampLength(0, radius);
    else {
      if (radial.lengthSq() < 1e-10) radial.copy(b.up);
      radial.normalize().multiplyScalar(radius);
    }
    const candidate = near.clone().add(radial);
    const distance = candidate.distanceToSquared(point);
    if (distance >= best || wood.some(other => woodDistance(candidate, other) < -.001)) continue;
    best = distance; grip = candidate; grip.canopySite = owners?.get(b);
  }
  return Number.isFinite(best) ? grip : null;
}

