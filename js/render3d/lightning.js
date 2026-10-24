// Lightning, on thunderstorm days (some rain days, the same ones all day): every few seconds a bolt
// forks down from the clouds to the ground somewhere in view, and the whole view flashes. In the
// usual view it lands somewhere on screen; at eye level (watch mode) somewhere out ahead, and the
// clouds of the eye-level sky light up with it (eye-sky.js). Now and then it's only a flash inside
// the clouds, with no bolt.
//
// Drawing only: a strike never sets anything alight or touches the simulation. The flash is the
// renderer's exposure (no recompiling, no extra lights). The bolt is one mesh of camera-facing
// ribbons, widened to a few pixels in the vertex shader, so it reads the same in the orthographic
// view and the perspective one.

import * as THREE from 'three';

export const BOLT_TOP = 11;  // how far above the ground a bolt leaves the cloud, in tiles
const MAX_SEG = 220;         // segments in one strike, its forks included
const LIFE = 0.42;           // seconds a bolt shows (it flickers on and off through it)

const VERT = `
  attribute vec3 aOther; // a point further along the segment: the ribbon widens across the line toward it
  attribute float aSide, aW, aT;
  uniform vec2 uView;    // the drawing buffer, in pixels
  varying float vSide, vT, vW;
  void main() {
    vec4 a = projectionMatrix * viewMatrix * vec4(position, 1.0);
    vec4 b = projectionMatrix * viewMatrix * vec4(aOther, 1.0);
    vec2 d = (b.xy / b.w - a.xy / a.w) * uView;
    d = length(d) > 1e-4 ? normalize(d) : vec2(0.0, 1.0);
    a.xy += vec2(-d.y, d.x) * aSide * aW / uView * 2.0 * a.w;
    gl_Position = a;
    vSide = aSide; vT = aT; vW = aW;
  }`;
const FRAG = `
  uniform float uGlow;
  varying float vSide, vT, vW;
  void main() {
    float s = abs(vSide);
    float core = 1.0 - smoothstep(0.4 / vW, 2.2 / vW, s); // a white core a pixel or two wide...
    float glow = pow(1.0 - s, 3.0) * 0.45;           // ...in a blue-violet glow
    float top = smoothstep(0.0, 0.18, vT);           // (out of the cloud base, not a hard end)
    vec3 c = vec3(1.0) * core + vec3(0.62, 0.66, 1.0) * glow;
    gl_FragColor = vec4(c * uGlow * top, 1.0);
  }`;

// The bolt's path: midpoint displacement from the cloud to the ground, with a few forks that
// wander off sideways and die out in the air. Returns segments [x0,y0,z0, x1,y1,z1, width px, t0, t1].
export function boltPath(x0, y0, z0, x1, y1, z1, rand = Math.random) {
  const segs = [];
  const split = (a, b, depth, rough) => {
    if (depth === 0) return [a, b];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const m = [(a[0] + b[0]) / 2 + (rand() - 0.5) * len * rough, (a[1] + b[1]) / 2 + (rand() - 0.5) * len * rough * 0.3,
      (a[2] + b[2]) / 2 + (rand() - 0.5) * len * rough, (a[3] + b[3]) / 2];
    return [...split(a, m, depth - 1, rough), ...split(m, b, depth - 1, rough).slice(1)];
  };
  const add = (pts, w) => { for (let i = 0; i + 1 < pts.length && segs.length < MAX_SEG; i++) segs.push([...pts[i].slice(0, 3), ...pts[i + 1].slice(0, 3), w, pts[i][3], pts[i + 1][3]]); };
  const main = split([x0, y0, z0, 0], [x1, y1, z1, 1], 6, 0.42);
  add(main, 9);
  const forks = 2 + Math.floor(rand() * 4);
  for (let f = 0; f < forks; f++) {
    const i = 4 + Math.floor(rand() * (main.length * 0.6)), p = main[Math.min(i, main.length - 2)];
    const h = p[1] - y1, ang = rand() * Math.PI * 2, reach = h * (0.1 + rand() * 0.2);
    const end = [p[0] + Math.cos(ang) * reach, p[1] - h * (0.25 + rand() * 0.35), p[2] + Math.sin(ang) * reach, p[3] + 0.3];
    add(split(p, end, 4, 0.5), 5);
  }
  return segs;
}

export class Lightning {
  constructor(scene) {
    const n = MAX_SEG * 4;
    const g = new THREE.BufferGeometry();
    this.attr = {
      position: new THREE.BufferAttribute(new Float32Array(n * 3), 3), aOther: new THREE.BufferAttribute(new Float32Array(n * 3), 3),
      aSide: new THREE.BufferAttribute(new Float32Array(n), 1), aW: new THREE.BufferAttribute(new Float32Array(n), 1),
      aT: new THREE.BufferAttribute(new Float32Array(n), 1),
    };
    for (const [k, a] of Object.entries(this.attr)) { a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); }
    const idx = new Uint16Array(MAX_SEG * 6);
    for (let s = 0; s < MAX_SEG; s++) idx.set([s * 4, s * 4 + 1, s * 4 + 2, s * 4 + 1, s * 4 + 3, s * 4 + 2], s * 6);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.u = { uView: { value: new THREE.Vector2(1, 1) }, uGlow: { value: 0 } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      side: THREE.DoubleSide, // (a ribbon faces whichever way its segment runs on screen)
    }));
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 20;
    scene.add(this.mesh);
    this.flash = 0; this.next = 2; this.age = LIFE; this.reflash = 0; this.count = 0;
    this.pxScale = 1; // drawing-buffer pixels per CSS pixel
  }

  // storm: a thunderstorm now. place(): where the next bolt lands, {x, y, z} on the ground and how
  // high above it the bolt starts (top, BOLT_TOP if not given). (70% of flashes have a bolt.) view: drawing-buffer size, for the bolt's width in pixels.
  // Returns how bright the flash is (0..1).
  update(dt, storm, place, viewW, viewH) {
    this.flash *= Math.exp(-dt * 7);
    this.age += dt;
    if (storm && (this.next -= dt) <= 0) this.strike(Math.random() < 0.7 ? place() : null);
    if (this.reflash > 0 && (this.reflash -= dt) <= 0) { this.flash = Math.max(this.flash, 0.8); this.age = Math.min(this.age, 0.08); }
    // a bolt flickers: on, dim, on again (the return strokes), then gone
    const a = this.age, on = a < 0.06 ? 1 : a < 0.1 ? 0.25 : a < 0.2 ? 0.9 : a < LIFE ? 0.9 * (1 - (a - 0.2) / (LIFE - 0.2)) : 0;
    this.mesh.visible = on > 0 && this.count > 0;
    this.u.uGlow.value = on;
    this.u.uView.value.set(viewW, viewH);
    return this.flash;
  }

  strike(at) {
    this.flash = 1; this.age = 0;
    this.reflash = Math.random() < 0.6 ? 0.1 + Math.random() * 0.1 : 0;
    this.next = 3 + Math.random() * 13;
    this.count = 0;
    if (!at) return;
    const top = at.top || BOLT_TOP, lean = () => (Math.random() - 0.5) * top * 0.4;
    const segs = boltPath(at.x + lean(), at.y + top, at.z + lean(), at.x, at.y, at.z);
    const A = this.attr;
    segs.forEach((s, i) => {
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k, end = k >> 1, side = k & 1 ? 1 : -1;
        // (the far end looks on past itself, so both ends widen the same way)
        const p = end ? 3 : 0;
        A.position.array.set([s[p], s[p + 1], s[p + 2]], v * 3);
        A.aOther.array.set(end ? [2 * s[3] - s[0], 2 * s[4] - s[1], 2 * s[5] - s[2]] : [s[3], s[4], s[5]], v * 3);
        A.aSide.array[v] = side; A.aW.array[v] = s[6] * this.pxScale; A.aT.array[v] = end ? s[8] : s[7];
      }
    });
    this.count = segs.length;
    for (const a of Object.values(A)) a.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, segs.length * 6);
  }

}
