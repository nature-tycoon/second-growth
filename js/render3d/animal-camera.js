// Follow locomotion without transferring each handover or body lean directly
// into the camera. Explicit Locate still centres the animal immediately.
export function easeAnimalTarget(target, centre, dt) {
  const seconds = Math.max(0, Math.min(.1, dt));
  const distance = target.distanceTo(centre);
  const blend = Math.min(1 - Math.exp(-6 * seconds), distance > 0 ? seconds * 2.5 / distance : 1);
  target.lerp(centre, blend);
  return target;
}
// The followed animal's height for the camera, eased like a body on a soft spring (no step in its
// rate), so a fish nosing over the reef or a bird's small corrections don't jog the whole view.
// It never trails more than LAG tiles, so a diving bird or a leaping fish stays in frame, and an
// animal whose own height jumps more than SNAP tiles in a frame (the tree it was in is gone) is
// followed outright; across and along the ground the camera still follows exactly.
// f: { y, vy, last } kept between frames.
export const FOLLOW_SPRING = 9, FOLLOW_LAG = 0.25, FOLLOW_SNAP = 0.5;
export function followHeight(f, y, dt) {
  const s = Math.max(0, Math.min(0.1, dt)), w = FOLLOW_SPRING, last = f.last;
  f.last = y;
  if (f.y == null || !Number.isFinite(f.y) || !(Math.abs(y - last) <= FOLLOW_SNAP)) { f.y = y; f.vy = 0; return y; }
  // (critically damped: settles without overshoot; semi-implicit, so steady at any frame rate here)
  f.vy = (f.vy || 0) + (w * w * (y - f.y) - 2 * w * (f.vy || 0)) * s;
  f.y += f.vy * s;
  if (f.y > y + FOLLOW_LAG) { f.y = y + FOLLOW_LAG; f.vy = Math.min(f.vy, 0); }
  else if (f.y < y - FOLLOW_LAG) { f.y = y - FOLLOW_LAG; f.vy = Math.max(f.vy, 0); }
  return f.y;
}
