// Follow locomotion without transferring each handover or body lean directly
// into the camera. Explicit Locate still centres the animal immediately.
export function easeAnimalTarget(target, centre, dt) {
  const seconds = Math.max(0, Math.min(.1, dt));
  const distance = target.distanceTo(centre);
  const blend = Math.min(1 - Math.exp(-6 * seconds), distance > 0 ? seconds * 2.5 / distance : 1);
  target.lerp(centre, blend);
  return target;
}
