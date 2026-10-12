import * as THREE from 'three';
import { SPEEDS } from '../config.js';
import { woodDistance } from './wood-clearance.js';

const near = new THREE.Vector3(), radial = new THREE.Vector3(), desired = new THREE.Vector3();
const inverse = new THREE.Matrix4(), forward = new THREE.Vector3();
const local = new THREE.Vector3(), air = new THREE.Vector3();
const surfaces = new WeakMap();

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

// Keep a bark contact while it is within the limb's reach. Rear feet can
// release and tuck under the body during a crown crossing instead of stretching
// back to the old tree. A free limb catches again when wood is within reach.
export function canopyGrips(st, mo, sites, matrix, time, speed, reset = false) {
  const wood = [];
  const owners = new Map();
  for (const site of sites) if (site) { site.prepare(); for (const b of site.wood) { wood.push(b); owners.set(b, site); } }
  const triangles = [];
  if (!wood.length) for (const site of sites) if (site) {
    if (!surfaces.has(site)) surfaces.set(site, site.triangles.map(t => {
      const triangle = new THREE.Triangle(...[t.a, t.b, t.c].map(p => p.clone().applyMatrix4(site.matrix)));
      triangle.canopySite = site; return triangle;
    }));
    triangles.push(...surfaces.get(site));
  }
  if (!wood.length && !triangles.length) return null;
  const dt = speed > 0 ? Math.max(0, Math.min(.1, time - (st.gripTime ?? time))) : 0;
  st.gripTime = time;
  inverse.copy(matrix).invert(); forward.set(1, 0, 0).transformDirection(matrix);
  const size = mo.len * st.sc;
  const rests = mo.canopyFeet.map(p => p.clone().applyMatrix4(matrix));
  const reach = mo.canopyFeet.map((p, i) => p.distanceTo(mo.canopyJoints[i]) * 1.08);
  const hanging = !!mo.canopyHanging;
  const reachable = (point, i) => {
    local.copy(point).applyMatrix4(inverse);
    return local.distanceTo(mo.canopyJoints[i]) <= reach[i] &&
      local.distanceTo(mo.canopyFeet[i]) <= mo.len * (i < 2 ? .24 : .18) &&
      (hanging ? local.y <= mo.canopyFeet[i].y + mo.len * .04 : local.y >= -mo.len * .04);
  };
  const fresh = reset || !st.gripFeet || st.gripFeet.some((foot, i) => foot.point.distanceTo(rests[i]) > size * 2);
  if (fresh) {
    st.gripFeet = rests.map(p => {
      const point = barkGrip(p, wood, triangles, owners) || p.clone();
      return { point, site: point.canopySite, from: null, to: null, elapsed: 0, free: !point.canopySite };
    });
    st.gripSwing = -1;
  }
  if (dt || fresh) for (let i = 0; i < 4; i++) {
    const foot = st.gripFeet[i];
    if (!foot.free && !reachable(foot.point, i)) {
      foot.free = true; foot.site = null; foot.from = foot.to = null;
      if (st.gripSwing === i) st.gripSwing = -1;
    }
    if (foot.free) {
      air.copy(mo.canopyFeet[i]); air.y += (hanging ? -1 : 1) * mo.len * (i < 2 ? .06 : .14); air.x += mo.len * (i < 2 ? .05 : .04);
      air.applyMatrix4(matrix);
      foot.point.lerp(air, Math.min(1, dt * (hanging ? 4 : 16)));
      // Bound the release itself, including a fast frame or a sharp turn.
      local.copy(foot.point).applyMatrix4(inverse).sub(mo.canopyJoints[i]).clampLength(0, reach[i]);
      foot.point.copy(local.add(mo.canopyJoints[i]).applyMatrix4(matrix));
    }
  }
  if (dt && st.gripSwing < 0) {
    let worst = size * .12, limb = -1;
    for (let i = 0; i < 4; i++) {
      const foot = st.gripFeet[i];
      desired.copy(rests[i]).addScaledVector(forward, size * .1 * st.gait);
      const target = barkGrip(desired, wood, triangles, owners);
      if (!target?.canopySite || !reachable(target, i)) continue;
      const distance = foot.free ? size * .3 : foot.point.distanceTo(rests[i]);
      if (distance > worst) { worst = distance; limb = i; }
    }
    if (limb >= 0) {
      const foot = st.gripFeet[limb];
      // Reach just ahead of the shoulder/hip, then let the body pass over
      // the planted grip. At rest or during a turn there is no forward reach.
      desired.copy(rests[limb]).addScaledVector(forward, size * .1 * st.gait);
      const target = barkGrip(desired, wood, triangles, owners);
      if (target.distanceTo(foot.point) > size * .025) {
        foot.from = foot.point.clone(); foot.to = target; foot.elapsed = 0; foot.free = false; st.gripSwing = limb;
      } else if (foot.free) {
        foot.point.copy(target); foot.site = target.canopySite; foot.free = false;
      }
    }
  }
  if (dt && st.gripSwing >= 0) {
    const limb = st.gripSwing, foot = st.gripFeet[limb];
    foot.elapsed += dt * (SPEEDS[speed] / SPEEDS[1]);
    const t = Math.min(1, foot.elapsed / (hanging ? .45 : .12)), ease = t * t * (3 - 2 * t);
    foot.point.copy(foot.from).lerp(foot.to, ease);
    const lift = (hanging ? -1 : 1) * Math.sin(t * Math.PI) * size * .045;
    air.copy(foot.point); foot.point.y += lift;
    if (!reachable(foot.point, limb)) {
      // Near the reach limit, a high placement arc can cancel the catch on
      // every frame. Lower that arc while keeping the handover in progress.
      let low = 0, high = 1;
      for (let k = 0; k < 8; k++) {
        const amount = (low + high) / 2; foot.point.copy(air); foot.point.y += lift * amount;
        if (reachable(foot.point, limb)) low = amount; else high = amount;
      }
      foot.point.copy(air); foot.point.y += lift * low;
    }
    if (t >= 1) { foot.site = foot.to.canopySite; foot.from = foot.to = null; st.gripSwing = -1; }
  }
  st.gripOffsets ||= mo.canopyFeet.map(() => new THREE.Vector3());
  for (let i = 0; i < 4; i++) {
    const foot = st.gripFeet[i];
    if (!reachable(foot.point, i)) {
      foot.free = true; foot.site = null; foot.from = foot.to = null;
      if (st.gripSwing === i) st.gripSwing = -1;
      local.copy(foot.point).applyMatrix4(inverse);
      local.sub(mo.canopyFeet[i]).clampLength(0, mo.len * (i < 2 ? .24 : .18)).add(mo.canopyFeet[i]);
      local.y = hanging ? Math.min(mo.canopyFeet[i].y + mo.len * .04, local.y) : Math.max(-mo.len * .04, local.y);
      local.sub(mo.canopyJoints[i]).clampLength(0, reach[i]).add(mo.canopyJoints[i]);
      foot.point.copy(local.applyMatrix4(matrix));
    }
    st.gripOffsets[i].copy(foot.point).applyMatrix4(inverse).sub(mo.canopyFeet[i]);
  }
  return st.gripOffsets;
}
