import * as THREE from 'three';
import { siamangSwing } from './siamang-swing.js';

const angles = new THREE.Euler(0, 0, 0, 'YZX');

// Bark poses face along each supporting limb. The swing itself must face the
// next tree, even when the two limbs point sideways or in opposite directions.
export function orangutanSwingPose(route, point, target = new THREE.Quaternion()) {
  const from = route.points[route.gap - 1], to = route.points[route.gap];
  const direction = to.clone().sub(from), gap = direction.length();
  const t = gap ? THREE.MathUtils.clamp(1 - point.distanceTo(to) / gap, 0, 1) : 1;
  const yaw = Math.atan2(-direction.z, direction.x);
  const endpoint = t < .5 ? from.canopyPose : to.canopyPose;
  const blend = t < .5 ? THREE.MathUtils.smoothstep(t, 0, .25) : 1 - THREE.MathUtils.smoothstep(t, .75, 1);
  if (!endpoint) return target.setFromEuler(angles.set(0, yaw, 0, 'YZX'));
  angles.setFromQuaternion(endpoint, 'YZX');
  let turn = yaw - angles.y; turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
  return target.setFromEuler(angles.set(angles.x * (1 - blend), angles.y + turn * blend, angles.z * (1 - blend), 'YZX'));
}

// A deliberate handover across a crown gap, then back to the walking stance.
// Both hands catch before the old supporting arm releases. The phase follows
// accepted route progress, so pausing or a blocked step freezes the same pose.
export function orangutanSwing(route, point) {
  if (!route || route.swingable === false || route.cursor !== route.gap) return null;
  const from = route.points[route.gap - 1], to = route.points[route.gap], gap = from.distanceTo(to);
  if (gap < .025) return null;
  const t = THREE.MathUtils.clamp(1 - point.distanceTo(to) / gap, 0, 1);
  const blend = THREE.MathUtils.smoothstep(t, .1, .35) * (1 - THREE.MathUtils.smoothstep(t, .65, .9));
  // Step around the limb before lowering the torso beneath the handhold.
  // Dropping straight through the walking hold puts the branch through the belly.
  const around = THREE.MathUtils.smoothstep(t, 0, .1) * (1 - THREE.MathUtils.smoothstep(t, .9, 1));
  const phase = t * Math.PI * 2, catches = siamangSwing(phase, 1);
  const reach = t < .5 ? -.6 : .6;
  return { t, blend, phase, left: catches.left, right: 1 - catches.right,
    grip: [THREE.MathUtils.lerp(reach, .07, blend) * around, THREE.MathUtils.lerp(-.015, 1.09, blend), .04 * (2 * catches.support - 1) * blend] };
}

export function orangutanHold(st, mo, target) {
  return st.orangutanSwing ? target.set(...st.orangutanSwing.grip).multiplyScalar(mo.len)
    : target.set(mo.gripX || 0, mo.supportY || 0, mo.gripZ || 0);
}
