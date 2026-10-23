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
  const skin = margin / scale, clusters = clustersFor(points);
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
    if (!clusters) { for (const p of points) if (woodDistance(p, localWood) < skin) return false; continue; }
    // A point closer than `skin` by woodDistance lies within `reach` of the limb's
    // axis segment, so a cluster whose sphere stays beyond that is clear as a whole.
    const reach = padding + skin * Math.hypot(1, (localWood.r1 - localWood.r0) / localWood.length) + 1e-9;
    const { centers, radii, members, starts } = clusters;
    for (let g = 0; g < centers.length; g++) {
      const c = points[centers[g]], x = c.x - localFrom.x, y = c.y - localFrom.y, z = c.z - localFrom.z;
      const t = Math.max(0, Math.min(localWood.length, x * localDir.x + y * localDir.y + z * localDir.z));
      const dx = x - localDir.x * t, dy = y - localDir.y * t, dz = z - localDir.z * t, far = radii[g] + reach;
      if (dx * dx + dy * dy + dz * dz >= far * far) continue;
      for (let i = starts[g]; i < starts[g + 1]; i++) if (woodDistance(points[members[i]], localWood) < skin) return false;
    }
  }
  return true;
}

// Body outlines have hundreds of points but only a few touch any one limb.
// Group them into small spheres once per outline so most can be skipped.
// Callers may move an outline in place only rigidly (canopyLean turns,
// shifts and scales a copy the same way every frame): the spheres keep their
// radii and follow their center points. A changed span rebuilds them.
const outlineClusters = new WeakMap(), CLUSTER = 16;
function clustersFor(points) {
  if (points.length < CLUSTER * 4) return null;
  let c = outlineClusters.get(points);
  if (c && c.count === points.length && Math.abs(points[0].distanceTo(points[c.farthest]) - c.span) <= c.span * 1e-6) return c;
  let farthest = 0;
  for (let i = 1; i < points.length; i++) if (points[0].distanceToSquared(points[i]) > points[0].distanceToSquared(points[farthest])) farthest = i;
  const order = points.map((_, i) => i), centers = [], radii = [], starts = [0];
  const split = (from, to) => {
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = from; i < to; i++) { const p = points[order[i]]; ['x', 'y', 'z'].forEach((a, k) => { min[k] = Math.min(min[k], p[a]); max[k] = Math.max(max[k], p[a]); }); }
    if (to - from <= CLUSTER) {
      const mid = min.map((v, k) => (v + max[k]) / 2);
      let center = order[from], best = Infinity, radius = 0;
      for (let i = from; i < to; i++) { const p = points[order[i]], d = (p.x - mid[0]) ** 2 + (p.y - mid[1]) ** 2 + (p.z - mid[2]) ** 2; if (d < best) { best = d; center = order[i]; } }
      for (let i = from; i < to; i++) radius = Math.max(radius, points[center].distanceTo(points[order[i]]));
      centers.push(center); radii.push(radius * (1 + 1e-9)); starts.push(to);
      return;
    }
    const axis = ['x', 'y', 'z'][[0, 1, 2].reduce((a, k) => max[k] - min[k] > max[a] - min[a] ? k : a, 0)];
    const part = order.slice(from, to).sort((a, b) => points[a][axis] - points[b][axis]);
    for (let i = from; i < to; i++) order[i] = part[i - from];
    const half = (from + to) >> 1; split(from, half); split(half, to);
  };
  split(0, points.length);
  c = { count: points.length, farthest, span: points[0].distanceTo(points[farthest]), centers: Int32Array.from(centers),
    radii: Float64Array.from(radii), members: Int32Array.from(order), starts: Int32Array.from(starts) };
  outlineClusters.set(points, c);
  return c;
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
