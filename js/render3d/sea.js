// The sea surface over an underwater map (the reef): one big, nearly clear sheet of water with
// small waves that catch the sun in glints and tilt a little sky colour back at the camera. What's
// underneath gets its blue-green veil and caustics from the shared lighting hook (atmosphere.js).

import * as THREE from 'three';
import { BORDER, LEVEL } from '../config.js';
import { biome } from '../biome.js';
import { sea } from './atmosphere.js';

const VERT = `
  varying vec2 vXZ;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vXZ = wp.xz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const FRAG = `
  uniform float uT, uGlint;
  uniform vec3 uSun, uView, uSky, uWater, uLight;
  varying vec2 vXZ;
  // a handful of crossing swells and ripples; their slopes make the surface normal
  vec2 slope(vec2 p) {
    vec2 g = vec2(0.0);
    vec4 W[6];
    W[0] = vec4(0.8, 0.6, 1.7, 0.9);  W[1] = vec4(-0.5, 0.86, 2.3, 1.2);
    W[2] = vec4(0.2, -0.98, 3.9, 1.7); W[3] = vec4(-0.9, -0.4, 5.3, 2.1);
    W[4] = vec4(0.6, -0.8, 8.1, 2.9);  W[5] = vec4(-0.3, 0.95, 11.7, 3.6);
    for (int k = 0; k < 6; k++) {
      vec2 d = W[k].xy; float f = W[k].z, s = W[k].w, a = 0.06 / f;
      g += d * f * a * cos(dot(d, p) * f + uT * s);
    }
    return g;
  }
  void main() {
    vec3 n = normalize(vec3(-slope(vXZ).x * 2.2, 1.0, -slope(vXZ).y * 2.2));
    float facing = max(dot(n, uView), 0.0);
    float fres = pow(1.0 - facing, 3.0);
    float spec = pow(max(dot(reflect(-uSun, n), uView), 0.0), 220.0) * 3.0 * uGlint;
    vec3 col = uWater * uLight * 0.55 + uSky * fres * 0.9 + vec3(1.0, 0.97, 0.9) * spec;
    float a = clamp(0.07 + fres * 0.55 + spec, 0.0, 0.92);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class SeaSurface {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      uT: { value: 0 }, uGlint: { value: 1 },
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uView: { value: new THREE.Vector3(0, 1, 0) },
      uSky: { value: new THREE.Color(0.75, 0.85, 0.95) }, uWater: { value: new THREE.Color(0.2, 0.6, 0.62) },
      uLight: { value: new THREE.Color(1, 1, 1) },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false });
    this.mesh = null;
  }

  // Lay the surface over this map (or take it away on a map that's on land).
  setWorld(world) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    const o = biome.look.underwater;
    sea.uSeaOn.value = o ? 1 : 0;
    if (!o) return;
    const y = o.level * LEVEL;
    sea.uSeaY.value = y;
    if (o.shallow) sea.uSeaShallow.value = o.shallow;
    if (o.deep) sea.uSeaDeep.value = o.deep;
    if (o.surface) this.uniforms.uWater.value.setRGB(...o.surface);
    const W = world.w + BORDER * 2, H = world.h + BORDER * 2;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), this.mat);
    this.mesh.position.set(world.w / 2, y, world.h / 2);
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  // Each frame: the waves move, the sun glints off them, and the water dims with the daylight.
  update(time, sun, hemi, viewDir, game) {
    if (!this.mesh) return;
    const murk = game?.flags?.plume?.left > 0 ? 1 : 0; // (a flood plume clouds the water, easing in and out)
    sea.uSeaMurk.value += (murk - sea.uSeaMurk.value) * 0.01;
    const u = this.uniforms;
    u.uT.value = time;
    u.uSun.value.copy(sun.position).sub(sun.target.position).normalize();
    u.uView.value.copy(viewDir).normalize();
    u.uSky.value.copy(hemi.color);
    const l = Math.min(1.3, hemi.intensity * 0.5 + sun.intensity * 0.15);
    u.uLight.value.setRGB(l, l, l);
    u.uGlint.value = Math.min(1, sun.intensity / 2.2);
    const sl = sea.uSeaLight.value; sl[0] = hemi.color.r * l; sl[1] = hemi.color.g * l; sl[2] = hemi.color.b * l;
  }
}
