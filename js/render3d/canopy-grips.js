import * as THREE from 'three';
import { ANIMAL_SPEEDS as SPEEDS } from '../config.js'; // (how fast the animals live, not the calendar)
import { barkGrip } from './bark-grip.js';
export { barkGrip } from './bark-grip.js';
import { howlerGrips } from './howler-grips.js';
import { howlerJumpGrips } from './howler-jump.js';

const desired = new THREE.Vector3();
const inverse = new THREE.Matrix4(), forward = new THREE.Vector3();
const local = new THREE.Vector3(), air = new THREE.Vector3();
const surfaces = new WeakMap();

// Count physically reachable contacts for a proposed torso pose. This is
// separate from planted state: free limbs still need time to reach those holds.
export function canopyContactCount(profile, point, pose, wood) {
  const { motion: mo, scale } = profile;
  const origin = new THREE.Vector3(mo.gripX || 0, mo.supportY || 0, mo.gripZ || 0), inversePose = pose.clone().invert();
  let contacts = 0, front = 0, rear = 0;
  for (let i = 0; i < 4; i++) {
    const rest = mo.canopyFeet[i].clone().sub(origin).multiplyScalar(scale).applyQuaternion(pose).add(point);
    const grip = barkGrip(rest, wood);
    if (!grip) continue;
    grip.sub(point).applyQuaternion(inversePose).divideScalar(scale).add(origin);
    const reach = mo.canopyWalkerMotion ? mo.howlerLengths[i][0]+mo.howlerLengths[i][1]-.0001 : mo.canopyFeet[i].distanceTo(mo.canopyJoints[i]) * 1.08;
    if (grip.distanceTo(mo.canopyJoints[i]) <= reach &&
        grip.distanceTo(mo.canopyFeet[i]) <= mo.len * (mo.canopyWalkerMotion ? .4*(mo.canopyReachScale || 1) : mo.canopyFootReach?.[i] ?? (i < 2 ? .24 : .18)) &&
        (mo.canopyHanging ? grip.y <= mo.canopyFeet[i].y + mo.len * .04 : grip.y >= -mo.len * (mo.canopyWalkerMotion ? .14 : .04))) {
      contacts++; if(i<2)front++;else rear++;
    }
  }
  return mo.canopyWalkerMotion && (!front || !rear) ? 0 : contacts;
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
  const reach = mo.canopyFeet.map((p, i) => mo.canopyWalkerMotion ? mo.howlerLengths[i].reduce((a, b) => a + b, 0) - .0001 : p.distanceTo(mo.canopyJoints[i]) * 1.08);
  const hanging = !!mo.canopyHanging;
  const reachable = (point, i) => {
    local.copy(point).applyMatrix4(inverse);
    return local.distanceTo(mo.canopyJoints[i]) <= reach[i] &&
      local.distanceTo(mo.canopyFeet[i]) <= mo.len * (mo.canopyFootReach?.[i] ?? (i < 2 ? .24 : .18)) &&
      (hanging ? local.y <= mo.canopyFeet[i].y + mo.len * .04 : local.y >= -mo.len * .04);
  };
  const fresh = reset || !st.gripFeet || st.gripFeet.some((foot, i) => foot.point.distanceTo(rests[i]) > size * 2);
  if (fresh) {
    st.gripFeet = rests.map(p => {
      const point = barkGrip(p, wood, triangles, owners) || p.clone();
      return { point, site: point.canopySite, from: null, to: null, elapsed: 0, free: !point.canopySite };
    });
    st.gripSwing = -1; st.gripNext = 0;
  }
  if (mo.canopyWalkerMotion && !st.walkerClassicTransfer) return howlerGrips(st, mo, matrix, dt, fresh,
    point => barkGrip(point, wood, triangles, owners));
  if (st.canopyLeap && st.canopyLeap.t > 0 && st.canopyLeap.t < 1) {
    if(mo.canopyWalkerMotion && st.branchRoute?.trunkTransfer) {
      if(!dt&&!fresh)return st.gripOffsets;
      const route=st.branchRoute;
      if(st.howlerTrunkReach?.route!==route)st.howlerTrunkReach={route,phase:'flight',elapsed:0};
      return howlerJumpGrips(st,mo,matrix,point=>barkGrip(point,wood,triangles,owners),dt,st.howlerTrunkReach);
    }
    // Release all four contacts on takeoff. Tuck the rear feet and reach
    // forward with the hands as the body descends toward the landing branch.
    const t = st.canopyLeap.t, tuck = Math.sin(Math.PI * t);
    st.gripSwing = -1;
    st.gripOffsets ||= mo.canopyFeet.map(() => new THREE.Vector3());
    for (let i = 0; i < 4; i++) {
      air.copy(mo.canopyFeet[i]);
      air.x += mo.len * (i < 2 ? .18 * tuck : -.07 * tuck);
      air.y += mo.len * (i < 2 ? .12 : .16) * tuck;
      air.sub(mo.canopyJoints[i]).clampLength(0, reach[i]).add(mo.canopyJoints[i]);
      st.gripOffsets[i].copy(air).sub(mo.canopyFeet[i]);
      const foot = st.gripFeet[i];
      foot.point.copy(air).applyMatrix4(matrix);
      foot.free = true; foot.site = null; foot.from = foot.to = null;
    }
    return st.gripOffsets;
  }
  if (dt || fresh) for (let i = 0; i < 4; i++) {
    const foot = st.gripFeet[i];
    if (!foot.free && !reachable(foot.point, i)) {
      foot.free = true; foot.site = null; foot.from = foot.to = null;
      if (st.gripSwing === i) st.gripSwing = -1;
    }
    if (foot.free) {
      air.copy(mo.canopyFeet[i]); air.y += (hanging ? -1 : 1) * mo.len * (i < 2 ? .06 : .14); air.x += mo.len * (i < 2 ? .05 : .04);
      if (mo.primate === 1 && i < 2) {
        // A free hand reaches for its next hold instead of staying rigidly
        // tucked beside a moving shoulder. Opposite phases alternate hands;
        // planted contacts and the airborne leap pose remain independent.
        const phase = (st.branchPhase || 0) + i * Math.PI;
        air.x += mo.len * .045 * Math.sin(phase) * st.gait;
        air.y += mo.len * .025 * Math.cos(phase) * st.gait;
      }
      air.applyMatrix4(matrix);
      foot.point.lerp(air, Math.min(1, dt * (hanging ? 4 : 16)));
      // Bound the release itself, including a fast frame or a sharp turn.
      local.copy(foot.point).applyMatrix4(inverse).sub(mo.canopyJoints[i]).clampLength(0, reach[i]);
      foot.point.copy(local.add(mo.canopyJoints[i]).applyMatrix4(matrix));
    }
  }
  if (dt && st.gripSwing < 0) {
    let worst = size * .12, limb = -1;
    for (let order = 0; order < 4; order++) {
      const i = mo.primate === 2 ? ((st.gripNext || 0) + order) % 4 : order;
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
      if (target.distanceTo(foot.point) > size * .025 || mo.primate === 2 && foot.free) {
        foot.from = foot.point.clone(); foot.to = target; foot.elapsed = 0; foot.free = false; st.gripSwing = limb;
        if (mo.primate === 2) st.gripNext = (limb + 1) % 4;
      } else if (foot.free) {
        foot.point.copy(target); foot.site = target.canopySite; foot.free = false;
      }
    }
  }
  if (dt && st.gripSwing >= 0) {
    const limb = st.gripSwing, foot = st.gripFeet[limb];
    foot.elapsed += dt * (mo.primate === 2 ? Math.min(2, SPEEDS[speed] / SPEEDS[1]) : SPEEDS[speed] / SPEEDS[1]);
    const t = Math.min(1, foot.elapsed / (hanging ? .45 : mo.primate === 2 ? .24 : .12)), ease = t * t * (3 - 2 * t);
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
      local.sub(mo.canopyFeet[i]).clampLength(0, mo.len * (mo.canopyFootReach?.[i] ?? (i < 2 ? .24 : .18))).add(mo.canopyFeet[i]);
      local.y = hanging ? Math.min(mo.canopyFeet[i].y + mo.len * .04, local.y) : Math.max(-mo.len * .04, local.y);
      local.sub(mo.canopyJoints[i]).clampLength(0, reach[i]).add(mo.canopyJoints[i]);
      foot.point.copy(local.applyMatrix4(matrix));
    }
    st.gripOffsets[i].copy(foot.point).applyMatrix4(inverse).sub(mo.canopyFeet[i]);
  }
  return st.gripOffsets;
}
