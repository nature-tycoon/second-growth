// A padded camera frustum, tested against a vertical capsule enclosing the animal and its
// ground shadow. This costs a few dot products and needs no model construction or allocation.
import * as THREE from 'three';
import { adultAnimalScale } from './animal-scale.js';

const radii = new WeakMap();
export function animalViewRadius(def) {
  let r = radii.get(def);
  if (r == null) {
    const s = def.sprite;
    // Deliberately generous: include heads, antlers, extended wings, animation and boosted
    // small species. Bounds are checked against every map's actual models in the render audit.
    r = Math.max(0.25, 3 * Math.max(s.len || s.size || 10, (s.h || 0) + (s.leg || 0)) *
      adultAnimalScale(s) * Math.max(1, s.juv ?? 0.5));
    radii.set(def, r);
  }
  return r;
}

export class ActorView {
  constructor() {
    this.frustum = new THREE.Frustum(); this.matrix = new THREE.Matrix4(); this.enabled = false;
  }
  update(camera, viewportHeight, enabled = true) {
    // Review tools can omit the camera; the game uses an orthographic camera throughout.
    this.enabled = !!(enabled && camera?.isOrthographicCamera && viewportHeight > 0);
    if (!this.enabled) return;
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix);
    const margin = 96 * (camera.top - camera.bottom) / (camera.zoom * viewportHeight);
    for (const p of this.frustum.planes) p.constant += margin;
  }
  visible(x, low, high, z, radius) {
    if (!this.enabled) return true;
    for (const p of this.frustum.planes) {
      const n = p.normal, y = n.y >= 0 ? high : low;
      if (n.x * x + n.y * y + n.z * z + p.constant < -radius) return false;
    }
    return true;
  }
}
