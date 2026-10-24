// The sky at eye level (watch mode's ride-along view, eye-camera.js): a dome round the eye that
// shades blue overhead down to the haze at the horizon, with the sun (or the moon, and stars) and
// the day's clouds. The clouds are the same field whose shadows drift over the ground
// (atmosphere.js), laid out on a layer a few tiles up, so a cloud overhead is the one shading the
// grass. Overcast days draw a grey veil, rain days a darker one with heavier cloud, and some rain
// days are thunderstorms with lightning. Rain and snow fall round the eye too, since the 2D
// effects layer (placed for the usual view) is off at eye level.
//
// Drawing only, and only at eye level. The dome is drawn after the land with the depth test on,
// so it costs nothing where the land covers it.

import * as THREE from 'three';
import { CLOUD_NOISE } from './atmosphere.js';

export const SKY_RADIUS = 33; // just inside the eye's far plane (EYE_FAR)
const CLOUD_H = 10;           // how high the cloud layer is, in tiles
const RAIN = 2400, SNOW = 2000;
const BOX = new THREE.Vector3(14, 8, 14); // the space round the eye that rain and snow fill
const WHITE = new THREE.Color(1, 1, 1);
const RAIN_VEL = new THREE.Vector3(1.4, -11, 0.5), SNOW_VEL = new THREE.Vector3(0.35, -0.9, 0.15); // tiles a second, with the wind

const DOME_VERT = `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const DOME_FRAG = `
  #include <common>
  uniform vec3 uHorizon, uZenith, uSunDir, uSunCol, uCam;
  uniform float uSunLight, uSunUp, uNight, uCover, uStorm, uFlash, uT;
  varying vec3 vDir;
  ${CLOUD_NOISE}
  void main() {
    vec3 d = normalize(vDir);
    float up = max(d.y, 0.0), s = dot(d, uSunDir), sp = max(s, 0.0);
    float above = smoothstep(0.0, 0.12, d.y); // (at the horizon itself the sky is the haze, as the land's fog is)
    vec3 col = mix(uHorizon, uZenith, pow(up, 0.55));
    // the glow round the sun: a low sun colours a wide stretch of sky its own gold, a high one only
    // brightens a little round itself
    float low = (1.0 - uSunUp) * (1.0 - uSunUp), clear = above * (1.0 - uStorm) * (1.0 - uNight);
    col = mix(col, uSunCol * uSunLight * 0.8, pow(sp, 4.0) * 0.6 * low * clear);
    col += uSunCol * uSunLight * (pow(sp, 6.0) * 0.08 + pow(sp, 48.0) * 0.25) * clear;
    // stars, on a clear night
    if (uNight > 0.01) {
      vec3 q = d * 170.0, c = floor(q);
      float h = fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      float star = step(0.991, h) * smoothstep(0.42, 0.08, length(fract(q) - 0.5));
      col += vec3(0.7, 0.76, 1.0) * star * uNight * smoothstep(0.04, 0.25, d.y) * (0.65 + 0.35 * sin(uT * 2.3 + h * 90.0));
    }
    // the sun's disc, or the moon's at night
    float disc = smoothstep(0.99955, 0.9998, s);
    vec3 discCol = mix(uSunCol * 5.0, vec3(0.8, 0.84, 0.95) * 1.2, uNight);
    // clouds: the ground's cloud field, seen from below on a layer CLOUD_H tiles up
    float cl = 0.0, lit = 0.6;
    if (d.y > 0.0) {
      vec2 xz = uCam.xz + d.xz / max(d.y, 0.03) * ${CLOUD_H.toFixed(1)};
      float n = cloudNoise(xz, uT) + (clN(xz * 1.3 - uT * 0.05) - 0.5) * 0.07; // (and a finer, ragged fringe)
      float edge = cloudEdge(uCover);
      cl = smoothstep(edge - 0.1, edge + 0.12, n) * smoothstep(0.0, 0.2, d.y);
      // thinner toward the sun: that side catches the light
      lit = clamp(0.55 + (n - cloudNoise(xz + uSunDir.xz * 2.5, uT)) * 4.0, 0.0, 1.0);
    }
    vec3 dark = uHorizon * mix(0.8, 0.42, uStorm);
    vec3 bright = uHorizon * 0.92 + uSunCol * uSunLight * 0.5 * (1.0 - 0.75 * uNight); // (moonlit clouds stay dim)
    vec3 cloud = mix(dark, bright, lit * (1.0 - uStorm * 0.75));
    col += discCol * disc * (1.0 - cl);
    col = mix(col, cloud, cl);
    col += uSunCol * uSunLight * pow(sp, 10.0) * cl * (1.0 - cl) * 1.4 * (1.0 - uStorm); // a bright rim on clouds by the sun
    // overcast: a grey veil over the gaps, darker in a storm
    float veil = max(smoothstep(0.42, 0.68, uCover) * 0.75, uStorm * 0.9) * above;
    col = mix(col, mix(uHorizon, dark * 1.08, up), veil * (1.0 - cl * 0.5));
    // lightning: the clouds light up from inside
    col += vec3(0.82, 0.84, 1.0) * uFlash * (0.35 + cl * 1.1) * above;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// Rain and snow: each drop wraps round a box that travels with the eye, so a fixed set fills the
// air wherever it goes, and all the movement is in the vertex shader.
const FALL_VERT = `
  attribute vec4 aSeed; // xyz: where in the box, w: (rain) 0 the drop's head, 1 its tail
  uniform vec3 uOrigin, uBox, uVel;
  uniform float uT, uLen, uPx, uSway;
  varying float vFade;
  void main() {
    vec3 lo = uOrigin - uBox * 0.5;
    float pace = 0.8 + 0.4 * fract(aSeed.x * 7.31 + aSeed.z * 3.7);
    vec3 p = lo + mod(aSeed.xyz * uBox + uVel * uT * pace - lo, uBox);
    p.x += sin(uT * 0.9 + aSeed.y * 40.0) * uSway; p.z += cos(uT * 0.7 + aSeed.x * 40.0) * uSway;
    p -= normalize(uVel) * uLen * aSeed.w;
    float dist = distance(p, cameraPosition);
    vFade = smoothstep(0.5, 1.4, dist) * (1.0 - smoothstep(4.5, 7.0, dist)); // (none right at the lens, where a streak would cross the whole view)
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uPx / -mv.z, 1.0, 9.0);
  }`;
const FALL_FRAG = (points) => `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    float a = uOpacity * vFade;
    ${points ? 'a *= smoothstep(0.5, 0.2, length(gl_PointCoord - 0.5));' : ''}
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }`;

function fall(n, lines) {
  const seed = new Float32Array(n * (lines ? 2 : 1) * 4);
  for (let i = 0; i < n; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random();
    for (let e = 0; e < (lines ? 2 : 1); e++) seed.set([x, y, z, e], (i * (lines ? 2 : 1) + e) * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seed.length / 4 * 3), 3)); // (placed in the shader)
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uOrigin: { value: new THREE.Vector3() }, uBox: { value: BOX }, uVel: { value: new THREE.Vector3(0, -1, 0) },
      uT: { value: 0 }, uLen: { value: 0 }, uPx: { value: 1 }, uSway: { value: 0 },
      uColor: { value: new THREE.Color() }, uOpacity: { value: 0 },
    },
    vertexShader: FALL_VERT, fragmentShader: FALL_FRAG(!lines), transparent: true, depthWrite: false,
  });
  const o = lines ? new THREE.LineSegments(g, m) : new THREE.Points(g, m);
  o.frustumCulled = false; o.visible = false; o.renderOrder = 10;
  return o;
}

export class EyeSky {
  constructor(scene) {
    this.u = {
      uHorizon: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uCam: { value: new THREE.Vector3() },
      uSunLight: { value: 1 }, uSunUp: { value: 1 }, uNight: { value: 0 }, uCover: { value: 0 }, uStorm: { value: 0 },
      uFlash: { value: 0 }, uT: { value: 0 },
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false }));
    // last of the solid things, so the depth test skips every pixel the land already covers
    this.dome.renderOrder = 1e6; this.dome.frustumCulled = false; this.dome.visible = false;
    this.rain = fall(RAIN, true); this.snow = fall(SNOW, false);
    scene.add(this.dome, this.rain, this.snow);
    this.flash = 0; this.boltIn = 2; this.reflash = 0;
  }

  // v: { cam, forward, t, dt, horizon, zenith, sunDir, sunCol, sunLight, sunUp, night, cover, storm,
  //      rain, snow (0..1), bolts (a thunderstorm), px (drawing-buffer pixels a tile-wide thing covers 1 tile away, for snowflakes) }
  // Returns how bright a lightning flash is right now (0 most of the time).
  update(v) {
    const u = this.u, cam = v.cam.position;
    this.dome.visible = true;
    this.dome.position.copy(cam);
    u.uHorizon.value.copy(v.horizon); u.uZenith.value.copy(v.zenith);
    u.uSunDir.value.copy(v.sunDir); u.uSunCol.value.copy(v.sunCol); u.uCam.value.copy(cam);
    u.uSunLight.value = v.sunLight; u.uSunUp.value = v.sunUp; u.uNight.value = v.night;
    u.uCover.value = v.cover; u.uStorm.value = v.storm; u.uT.value = v.t;
    // lightning: a flash every few seconds to a quarter-minute, sometimes flickering twice
    this.flash *= Math.exp(-v.dt * 7);
    if (v.bolts) {
      if ((this.boltIn -= v.dt) <= 0) { this.flash = 1; this.reflash = Math.random() < 0.6 ? 0.1 + Math.random() * 0.1 : 0; this.boltIn = 3 + Math.random() * 13; }
      if (this.reflash > 0 && (this.reflash -= v.dt) <= 0) this.flash = Math.max(this.flash, 0.8);
    }
    u.uFlash.value = this.flash;
    this.lum = Math.min(1, 0.25 + 1.6 * (v.horizon.r * 0.3 + v.horizon.g * 0.6 + v.horizon.b * 0.1)); // (snowflakes go grey as the light fades)
    // rain and snow round the eye, a little ahead of it so more of it is in view
    const o = this.rain.material.uniforms.uOrigin.value.copy(cam).addScaledVector(v.forward, 4);
    o.y += BOX.y * 0.3; // (mostly above the eye: below it, the ground hides them)
    this.place(this.rain, o, v.t, v.rain, 0.5, v.horizon, 1.35, 0, 0.3, RAIN_VEL, v.px);
    this.place(this.snow, o, v.t, v.snow, 0.95, WHITE, 0.92, 0.25, 0, SNOW_VEL, v.px * 0.05);
    return this.flash;
  }

  place(obj, origin, t, amount, opacity, tint, bright, sway, len, vel, px) {
    obj.visible = amount > 0.02;
    if (!obj.visible) return;
    const m = obj.material.uniforms;
    m.uOrigin.value.copy(origin); m.uT.value = t; m.uVel.value.copy(vel);
    m.uLen.value = len; m.uSway.value = sway; m.uPx.value = px;
    m.uOpacity.value = opacity * amount;
    m.uColor.value.copy(tint).multiplyScalar(bright * (tint === WHITE ? this.lum : 1)).addScalar(0.08 + this.flash * 0.5);
  }

  hide() { this.dome.visible = this.rain.visible = this.snow.visible = false; this.flash = 0; }
}
