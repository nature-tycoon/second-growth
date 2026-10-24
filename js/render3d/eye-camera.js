// Eye level, for watch mode (ui/watch.js): a perspective camera that rides low behind a followed
// animal, a little above its head, looking the way it is going. It isn't inside the head: a true
// head camera dips into the grass whenever the animal grazes, swings with every glance, and never
// shows the animal itself. The game's own view stays orthographic; this camera only draws.
//
// Fog (see Renderer) hides the edge of the map a few dozen tiles out, and the far plane stops
// there too, so plants and the ground past it are culled rather than drawn into the haze.

import * as THREE from 'three';

export const EYE_FAR = 34;      // scene units (tiles) the eye sees before the haze closes in
export const EYE_FOG_NEAR = 9;
export const WATER_FAR = 14;    // under the sea the water closes in much sooner (see Renderer.updateEye)
const LOWEST = 0.3; // the eye stays this far above the ground: a tortoise's own eye height is down among the grass blades

export class EyeCamera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.03, EYE_FAR);
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.goal = new THREE.Vector3(); this.aim = new THREE.Vector3();
    this.right = new THREE.Vector3(1, 0, 0);
    this.forward = new THREE.Vector3(1, 0, 0);
    this.agentId = null;
  }

  // pose: the animal's drawn pose (Actors.pose). groundAt(x, z): the terrain's height there.
  // seaY: the sea surface on an underwater map. The eye stays on the animal's side of it, so a
  // manta near the top or a booby on the water isn't seen half through air, half through water.
  // Returns false when there's nothing to look at (the animal is gone or not drawn).
  update(pose, id, aspect, dt, groundAt, seaY = null) {
    if (!pose?.visible) return false;
    const fresh = this.agentId !== id;
    this.agentId = id;
    const c = pose.center, size = this.size = Math.max(pose.h || 0, pose.foot || 0, 0.12);
    // heading: smoothed separately, so a sudden turn swings the view round rather than snapping it
    const fx = Math.cos(pose.yaw), fz = -Math.sin(pose.yaw);
    if (fresh) this.forward.set(fx, 0, fz);
    else this.forward.lerp(this.aim.set(fx, 0, fz), 1 - Math.exp(-dt * 1.6)).normalize();
    const f = this.forward;
    const flying = (pose.fly || 0) > 0.5;
    const back = 0.55 + size * (flying ? 3.2 : 2.4), up = size * (flying ? 1.4 : 0.9) + 0.06;
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
    const cam = this.camera, far = under ? WATER_FAR : EYE_FAR;
    if (cam.far !== far) { cam.far = far; cam.updateProjectionMatrix(); } // (and what's past the murk is culled)
    // (a phone held upright keeps about the landscape view's width: a taller, wider-angle view)
    if (cam.aspect !== aspect) { cam.aspect = aspect; cam.fov = aspect < 1 ? 50 + 25 * Math.min(1, (1 - aspect) / 0.5) : 50; cam.updateProjectionMatrix(); }
    cam.position.copy(this.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    cam.updateMatrixWorld();
    this.right.setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
    return true;
  }

  reset() { this.agentId = null; }
}
