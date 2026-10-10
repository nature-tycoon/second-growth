import * as THREE from 'three';

// Distance to a finite tapered limb. Its drawn cylinder has flat end caps;
// treating those ends as spheres invents obstacles beyond the real wood.
export function woodDistance(p, b) {
  const x = p.x - b.from.x, y = p.y - b.from.y, z = p.z - b.from.z;
  const along = x * b.dir.x + y * b.dir.y + z * b.dir.z;
  const t = Math.max(0, Math.min(1, along / b.length)), radius = b.r0 + (b.r1 - b.r0) * t;
  const radial = Math.sqrt(Math.max(0, x * x + y * y + z * z - along * along)) - radius;
  const end = Math.max(0, -along, along - b.length);
  return end ? Math.hypot(end, Math.max(0, radial)) : Math.max(radial / Math.hypot(1, (b.r1 - b.r0) / b.length), -along, along - b.length);
}

const xAxis = new THREE.Vector3(), yAxis = new THREE.Vector3(), zAxis = new THREE.Vector3(), frame = new THREE.Matrix4();
export function woodFrame(branch, normal, hanging, sign, quaternion) {
  yAxis.copy(normal).multiplyScalar(hanging ? -1 : 1);
  xAxis.copy(branch.dir).addScaledVector(yAxis, -branch.dir.dot(yAxis));
  if (xAxis.lengthSq() < .001) { xAxis.set(1, 0, 0).addScaledVector(yAxis, -yAxis.x); }
  if (xAxis.lengthSq() < .001) xAxis.set(0, 0, 1).addScaledVector(yAxis, -yAxis.z);
  xAxis.normalize().multiplyScalar(sign);
  zAxis.crossVectors(xAxis, yAxis).normalize();
  return quaternion.setFromRotationMatrix(frame.makeBasis(xAxis, yAxis, zAxis));
}

const bodyUp = new THREE.Vector3(), bodyHold = new THREE.Vector3();
const inversePose = new THREE.Quaternion(), localFrom = new THREE.Vector3(), localDir = new THREE.Vector3(), zero = new THREE.Vector3();
const localWood = { from: localFrom, dir: localDir, length: 0, r0: 0, r1: 0 };

// Transform the handful of limbs into body space, rather than transforming
// hundreds of body vertices for every candidate turn. A segment/box rejection
// also avoids checking wood that cannot reach the body at this orientation.
export function outlineFitsWood(points, bounds, point, quaternion, wood, margin, scale = 1, origin = zero) {
  if (bodyUp.set(0, 1, 0).applyQuaternion(quaternion).y < -.00001) return false;
  inversePose.copy(quaternion).invert();
  const skin = margin / scale;
  for (const b of wood) {
    localFrom.copy(b.from).sub(point).applyQuaternion(inversePose).divideScalar(scale).add(origin);
    localDir.copy(b.dir).applyQuaternion(inversePose);
    localWood.length = b.length / scale; localWood.r0 = b.r0 / scale; localWood.r1 = b.r1 / scale;
    const padding = Math.max(localWood.r0, localWood.r1) + skin;
    let low = 0, high = localWood.length;
    for (const axis of ['x', 'y', 'z']) {
      const min = bounds.min[axis] - padding, max = bounds.max[axis] + padding;
      if (Math.abs(localDir[axis]) < 1e-9) {
        if (localFrom[axis] < min || localFrom[axis] > max) { high = -1; break; }
      } else {
        let a = (min - localFrom[axis]) / localDir[axis], c = (max - localFrom[axis]) / localDir[axis];
        if (a > c) [a, c] = [c, a];
        low = Math.max(low, a); high = Math.min(high, c);
        if (low > high) break;
      }
    }
    if (low > high) continue;
    for (const p of points) if (woodDistance(p, localWood) < skin) return false;
  }
  return true;
}

export function bodyFitsWood(profile, point, quaternion, wood) {
  if (!profile?.motion.canopyBody?.length) return true;
  const { motion: mo, scale } = profile;
  bodyHold.set(mo.gripX || 0, mo.supportY || 0, mo.gripZ || 0);
  return outlineFitsWood(mo.canopyBody, mo.canopyBounds, point, quaternion, wood, mo.len * scale * .008, scale, bodyHold);
}

export function woodNormal(point, branch, normal) {
  const x = point.x - branch.from.x, y = point.y - branch.from.y, z = point.z - branch.from.z;
  const along = x * branch.dir.x + y * branch.dir.y + z * branch.dir.z;
  const radius = THREE.MathUtils.lerp(branch.r0, branch.r1, Math.max(0, Math.min(1, along / branch.length)));
  normal.set(x, y, z).addScaledVector(branch.dir, -along);
  if (normal.length() < radius && along > branch.length - .003) return normal.copy(branch.dir);
  if (normal.length() < radius && along < .003) return normal.copy(branch.dir).negate();
  return normal.normalize();
}
