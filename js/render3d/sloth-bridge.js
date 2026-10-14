// Temporary drawn wood joining the two real limbs of a sloth's crown crossing.
import * as THREE from 'three';
import { PlantPool } from './plant-pools.js';
import { canopyRotation } from './canopy-pose.js';

const up = new THREE.Vector3(0, 1, 0);

class SlothBridge {
  constructor(from, to, source, target, radius, route) {
    this.transient = true; this.source = source; this.target = target; this.radius = radius; this.route = route;
    this.start = from.clone(); this.end = to.clone();
    const direction = to.clone().sub(from).normalize();
    const normal = up.clone().addScaledVector(direction, -direction.y).normalize();
    const extension = radius * 2;
    const a = from.clone().addScaledVector(normal, radius).addScaledVector(direction, -extension);
    const b = to.clone().addScaledVector(normal, radius).addScaledVector(direction, extension);
    const length = a.distanceTo(b), rotation = new THREE.Quaternion().setFromUnitVectors(up, direction);
    this.matrix = new THREE.Matrix4().compose(a.clone().lerp(b, .5), rotation, new THREE.Vector3(radius, length, radius));
    this.inverse = this.matrix.clone().invert();
    this.wood = [{ from: a, to: b, dir: direction, up: normal, length, r0: radius, r1: radius }];
    this.pose = canopyRotation(Math.atan2(-direction.z, direction.x), Math.atan2(direction.y, Math.hypot(direction.x, direction.z)), 0, new THREE.Quaternion());
  }

  prepare() {}

  rebase(flora) {
    const source = flora.treeSites.get(this.source.tile), target = flora.treeSites.get(this.target.tile);
    if (!source || !target || source.plant !== this.source.plant || target.plant !== this.target.plant) return null;
    if (source === this.source && target === this.target) return this;
    source.prepare(); target.prepare();
    if (source.branches.length !== this.source.branches.length || target.branches.length !== this.target.branches.length) return null;
    const from = this.start.clone().applyMatrix4(this.source.inverse).applyMatrix4(source.matrix);
    const to = this.end.clone().applyMatrix4(this.target.inverse).applyMatrix4(target.matrix);
    return new SlothBridge(from, to, source, target, this.radius, this.route);
  }
}

export function slothBridge(st, flora, size) {
  const route = st.branchRoute;
  if (route && !route.blocked && route.gap > 0 && st.slothBridge?.route !== route) {
    const from = route.points[route.gap - 1], to = route.points[route.gap];
    // Tiny overlaps already have visible bark, and vertical drops are not a
    // connecting limb. Keep the artificial support within neighbouring crowns.
    if (from.distanceTo(to) > .025 && Math.hypot(to.x - from.x, to.z - from.z) > .025) {
      const radius = THREE.MathUtils.clamp(size * .075, .012, .028);
      st.slothBridge = new SlothBridge(from, to, route.sites[route.gap - 1], route.sites[route.gap], radius, route);
    }
  }
  const bridge = st.slothBridge;
  if (bridge && (flora.treeSites.get(bridge.source.tile) !== bridge.source || flora.treeSites.get(bridge.target.tile) !== bridge.target)) st.slothBridge = null;
  return st.slothBridge;
}

export class SlothBridges {
  constructor(scene, flora) { this.scene = scene; this.flora = flora; this.pool = null; this.visible = new Set(); }

  show(bridges) {
    if (bridges.size === this.visible.size && [...bridges].every(bridge => this.visible.has(bridge))) return;
    this.visible = bridges;
    if (!bridges.size && !this.pool) return;
    if (!this.pool) {
      const geo = new THREE.CylinderGeometry(1, 1, 1, 7);
      geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
      this.pool = new PlantPool(this.scene, geo, this.flora.canopyBark, { shadow: false, receive: true });
    }
    this.pool.begin();
    for (const bridge of bridges) {
      const color = new THREE.Color().setRGB(...bridge.source.color, THREE.SRGBColorSpace);
      this.pool.addRaw([...bridge.matrix.elements, color.r, color.g, color.b], 0);
    }
    this.pool.end();
  }

  clear() { this.show(new Set()); }
}
