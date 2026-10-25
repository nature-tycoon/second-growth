// Eye level, for watch mode (ui/watch.js): a perspective camera that rides low behind a followed
// animal, a little above its head, looking the way it is going. It isn't inside the head: a true
// head camera dips into the grass whenever the animal grazes, swings with every glance, and never
// shows the animal itself. The game's own view stays orthographic; this camera only draws.
//
// Fog (see Renderer) hides the edge of the map a few dozen tiles out, and the far plane stops
// there too, so plants and the ground past it are culled rather than drawn into the haze.
//
// While it follows, a drag or Q / E swings it round the animal (orbit): the angle is kept relative
// to the way the animal faces, so a side-on view stays side-on as it turns. A new animal starts
// behind again.
//
// It can also walk about on its own (WASD at eye level, see walk()): from wherever it was, at about
// a person's eye height, with no animal to follow.

import * as THREE from 'three';

export const EYE_FAR = 34;      // scene units (tiles) the eye sees before the haze closes in
export const EYE_FOG_NEAR = 9;
export const WATER_FAR = 14;    // under the sea the water closes in much sooner (see Renderer.updateEye)
const LOWEST = 0.3; // the eye stays this far above the ground: a tortoise's own eye height is down among the grass blades
const WALK_UP = 0.6;    // walking: the eye's height above the ground
const WALK = 3, RUN = 9; // walking and running (Shift) speeds, tiles a second
const TURN = 1.7;        // radians a second with Q / E

export class EyeCamera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.03, EYE_FAR);
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.goal = new THREE.Vector3(); this.aim = new THREE.Vector3();
    this.right = new THREE.Vector3(1, 0, 0);
    this.forward = new THREE.Vector3(1, 0, 0); // the way the eye looks, level (the sky and the shadow box use it)
    this.heading = new THREE.Vector3(1, 0, 0); // the followed animal's heading, smoothed
    this.agentId = null;
  }

  // pose: the animal's drawn pose (Actors.pose). groundAt(x, z): the terrain's height there.
  // seaY: the sea surface on an underwater map. The eye stays on the animal's side of it, so a
  // manta near the top or a booby on the water isn't seen half through air, half through water.
  // orbit: { yaw, pitch } radians to swing round the animal since last frame (a drag, or Q / E).
  // Returns false when there's nothing to look at (the animal is gone or not drawn).
  update(pose, id, aspect, dt, groundAt, seaY = null, orbit = null) {
    if (!pose?.visible) return false;
    const fresh = this.agentId !== id;
    this.agentId = id;
    if (fresh) { this.orbit = 0; this.rise = 0; }
    if (orbit) {
      this.orbit = (this.orbit + orbit.yaw) % (Math.PI * 2);
      // (dragging down lifts the eye to look down on it; up, down to its level and no lower)
      this.rise = Math.max(-0.15, Math.min(1.1, this.rise - orbit.pitch));
    }
    const c = pose.center, size = this.size = Math.max(pose.h || 0, pose.foot || 0, 0.12);
    // heading: smoothed separately, so a sudden turn swings the view round rather than snapping it
    const fx = Math.cos(pose.yaw), fz = -Math.sin(pose.yaw);
    if (fresh) this.heading.set(fx, 0, fz);
    else this.heading.lerp(this.aim.set(fx, 0, fz), 1 - Math.exp(-dt * 1.6)).normalize();
    // swung round by the orbit: the direction the eye looks along, through the animal
    const h = Math.atan2(this.heading.z, this.heading.x) + this.orbit;
    const f = this.forward.set(Math.cos(h), 0, Math.sin(h));
    const flying = (pose.fly || 0) > 0.5;
    // big animals get more room: past a deer's height (0.6 tiles) the eye steps back three times as
    // far again as the animal is taller, so an elephant or a giraffe is seen whole, in its
    // surroundings, rather than filling the view; and never nearer than 2.6 times the animal's
    // height, so an ostrich's head and neck stay in the frame
    const tall = pose.tall || size;
    const reach = Math.max(0.55 + size * (flying ? 3.2 : 2.4) + 3 * Math.max(0, tall - 0.6), tall * 2.6), back = reach * Math.cos(this.rise);
    const up = Math.max(size * (flying ? 1.4 : 0.9), tall * 0.6) + 0.06 + reach * Math.sin(this.rise);
    this.goal.set(c.x - f.x * back, c.y + up, c.z - f.z * back);
    // never under the ground (behind an animal on a slope, or a fish's tail-end over a reef), and
    // never right down in the grass
    const under = this.under = seaY != null && c.y < seaY;
    // (under the water, just below the surface but still clear of the seabed in the shallows)
    const side = (y, ground) => !under ? (seaY != null ? Math.max(y, seaY + 0.15) : y) : Math.max(ground + 0.05, Math.min(y, seaY - 0.1));
    const g0 = groundAt(this.goal.x, this.goal.z);
    this.goal.y = side(Math.max(this.goal.y, g0 + LOWEST), g0);
    this.aim.set(c.x + f.x * size * 4, c.y + size * 0.25, c.z + f.z * size * 4);
    if (fresh) { this.pos.copy(this.goal); this.look.copy(this.aim); }
    else {
      this.pos.lerp(this.goal, 1 - Math.exp(-dt * 3));
      this.look.lerp(this.aim, 1 - Math.exp(-dt * 4));
      const g = groundAt(this.pos.x, this.pos.z);
      this.pos.y = side(Math.max(this.pos.y, g + LOWEST * 0.6), g);
    }
    this.apply(aspect);
    return true;
  }

  // Walking about on foot, from wherever the eye is now. move: { fwd, side, turn } each -1..1 and
  // run, from the keys; look: { yaw, pitch } radians dragged since last frame. bounds(x, z) keeps
  // it on the map.
  walk(move, look, aspect, dt, groundAt, seaY, bounds) {
    if (this.agentId !== 'walk') {
      // set off the way the view was already looking, so nothing jumps
      this.agentId = 'walk';
      this.yaw = Math.atan2(this.forward.z, this.forward.x);
      const dx = this.look.x - this.pos.x, dz = this.look.z - this.pos.z;
      this.pitch = Math.max(-0.5, Math.min(0.3, Math.atan2(this.look.y - this.pos.y, Math.hypot(dx, dz))));
      this.size = 0.3;
    }
    this.yaw += (move.turn * TURN * dt) + look.yaw;
    this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch + look.pitch));
    const f = this.forward.set(Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const sp = (move.run ? RUN : WALK) * dt;
    // (right of the way it faces is (-f.z, f.x))
    const p = bounds(this.pos.x + (f.x * move.fwd - f.z * move.side) * sp, this.pos.z + (f.z * move.fwd + f.x * move.side) * sp);
    this.pos.x = p.x; this.pos.z = p.z;
    // the eye rides over the ground's bumps rather than jolting with every one; on the reef it stays
    // on the side of the surface it was on, swimming just above the seabed
    const g = groundAt(this.pos.x, this.pos.z);
    const under = this.under = seaY != null && this.pos.y < seaY;
    const y = under ? Math.max(g + 0.15, Math.min(g + WALK_UP, seaY - 0.1)) : Math.max(g + WALK_UP, seaY != null ? seaY + WALK_UP : -Infinity);
    this.pos.y += (y - this.pos.y) * (1 - Math.exp(-dt * 6));
    this.pos.y = Math.max(this.pos.y, g + LOWEST * 0.6);
    const cp = Math.cos(this.pitch);
    this.look.set(this.pos.x + f.x * cp, this.pos.y + Math.sin(this.pitch), this.pos.z + f.z * cp);
    this.apply(aspect);
  }

  apply(aspect) {
    const cam = this.camera, far = this.under ? WATER_FAR : EYE_FAR;
    if (cam.far !== far) { cam.far = far; cam.updateProjectionMatrix(); } // (and what's past the murk is culled)
    // (a phone held upright keeps about the landscape view's width: a taller, wider-angle view)
    if (cam.aspect !== aspect) { cam.aspect = aspect; cam.fov = aspect < 1 ? 50 + 25 * Math.min(1, (1 - aspect) / 0.5) : 50; cam.updateProjectionMatrix(); }
    cam.position.copy(this.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    cam.updateMatrixWorld();
    this.right.setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
  }

  reset() { this.agentId = null; }
}
