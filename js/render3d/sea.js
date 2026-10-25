// The sea surface over an underwater map (the reef): one big, nearly clear sheet of water with
// small waves that catch the sun in glints and tilt a little sky colour back at the camera. What's
// underneath gets its blue-green veil and caustics from the shared lighting hook (atmosphere.js).
// At eye level under the water it's seen from below: the sky shows through a bright round window
// overhead and past that the surface is a silvery mirror of the water (see FRAG).

import * as THREE from 'three';
import { BORDER, LEVEL } from '../config.js';
import { sea } from './atmosphere.js';
import { EYE_FAR } from './eye-camera.js';

const VERT = `
  varying vec2 vXZ;
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vXZ = wp.xz; vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const FRAG = `
  uniform float uT, uGlint, uEye, uFogNear, uFogFar;
  uniform vec3 uSun, uView, uSky, uWater, uLight, uFogColor, uFogOut;
  varying vec2 vXZ;
  varying vec3 vW;
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
    vec2 sl = slope(vXZ);
    vec3 n = normalize(vec3(-sl.x * 2.2, 1.0, -sl.y * 2.2));
    // (the usual view looks one way everywhere; the eye-level camera looks out from a point)
    vec3 v = uEye > 0.5 ? normalize(cameraPosition - vW) : uView;
    vec3 col; float a, mirror = 0.0, shimmer = 1.0;
    if (gl_FrontFacing) {
      float facing = max(dot(n, v), 0.0);
      float fres = pow(1.0 - facing, 3.0);
      float spec = pow(max(dot(reflect(-uSun, n), v), 0.0), 220.0) * 3.0 * uGlint;
      col = uWater * uLight * 0.55 + uSky * fres * 0.9 + vec3(1.0, 0.97, 0.9) * spec;
      a = clamp(0.07 + fres * 0.55 + spec, 0.0, 0.92);
    } else {
      // from below: light from above bends into a cone 48.6 degrees round straight up (Snell's
      // window), with the sun a bright, rippling spot in it. Past its edge the surface reflects
      // the water back (total internal reflection), a little brighter than the water itself.
      float up = dot(-v, n);
      float win = smoothstep(0.6, 0.72, up);
      vec3 sunW = -refract(-uSun, n, 0.75); // (the way to the sun, seen from under the water)
      float sun = pow(max(dot(-v, sunW), 0.0), 60.0) * 2.5 * uGlint;
      col = uSky * uLight * 1.15 + vec3(1.0, 0.97, 0.9) * sun + uFogColor * 0.6 * win * (1.0 - win) * 4.0; // (a bright rim round the window)
      a = mix(0.96, 0.75, win);
      // (the mirror is the water's own colour as the haze ends up on screen, so that far off it
      // runs seamlessly into the haze)
      mirror = 1.0 - win; shimmer = 1.06 + 0.3 * (sl.x - sl.y);
    }
    // eye-level haze (off, out of reach, in the usual view): water or air. Like three's own fog
    // it goes on after the tone mapping, in the screen's colours, so it meets the background.
    float f = clamp((length(cameraPosition - vW) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    gl_FragColor = vec4(col, mix(a, 1.0, f));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogOut * shimmer, mirror);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogOut, f);
  }`;

export class SeaSurface {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      uT: { value: 0 }, uGlint: { value: 1 },
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uView: { value: new THREE.Vector3(0, 1, 0) },
      uSky: { value: new THREE.Color(0.75, 0.85, 0.95) }, uWater: { value: new THREE.Color(0.2, 0.6, 0.62) },
      uLight: { value: new THREE.Color(1, 1, 1) },
      uEye: { value: 0 }, uFogNear: { value: 1e5 }, uFogFar: { value: 2e5 }, uFogColor: { value: new THREE.Color() }, uFogOut: { value: new THREE.Color() },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = null;
  }

  // Lay the surface over this map (or take it away on a map that's on land).
  setWorld(world) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    const o = world.catalog.definition.look.underwater;
    sea.uSeaOn.value = o ? 1 : 0;
    if (!o) return;
    const y = o.level * LEVEL;
    sea.uSeaY.value = y;
    if (o.shallow) sea.uSeaShallow.value = o.shallow;
    if (o.deep) sea.uSeaDeep.value = o.deep;
    if (o.surface) this.uniforms.uWater.value.setRGB(...o.surface);
    const W = world.w + BORDER * 2, H = world.h + BORDER * 2;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), this.mat);
    this.eyeScale = [(W + 2 * EYE_FAR) / W, (H + 2 * EYE_FAR) / H]; // (see update)
    this.mesh.position.set(world.w / 2, y, world.h / 2);
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  // Each frame: the waves move, the sun glints off them, and the water dims with the daylight.
  // fog: the scene's (eye level's haze); eye: whether the eye-level camera is drawing.
  update(time, sun, hemi, viewDir, game, fog, eye) {
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
    u.uEye.value = eye ? 1 : 0;
    // at eye level the surface runs on past the edge of the map, out into the haze, rather than
    // stopping in plain view overhead
    this.mesh.scale.set(eye ? this.eyeScale[0] : 1, 1, eye ? this.eyeScale[1] : 1);
    u.uFogNear.value = fog.near; u.uFogFar.value = fog.far; u.uFogColor.value.copy(fog.color); u.uFogOut.value.copy(fog.color).convertLinearToSRGB();
    const sl = sea.uSeaLight.value; sl[0] = hemi.color.r * l; sl[1] = hemi.color.g * l; sl[2] = hemi.color.b * l;
  }
}
