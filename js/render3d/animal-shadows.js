// Shadows shaped like the animal, for reef animals and birds: each species' own model seen from
// straight above, blurred and kept in one atlas, then drawn as a flat quad under it, turned with
// its heading. A flying bird's shadow spreads its wings and narrows with each beat. One draw call
// for all of them; a species' silhouette is drawn once, the first time it needs a shadow.
import * as THREE from 'three';

const CELL = 64, COLS = 16, ROWS = 8; // (a 1024 x 512 atlas: 128 silhouettes)
const BUILDS_PER_FRAME = 1; // (about 1-5 ms each: spread the first sight of many species over a few frames)
const PAD = 1.35; // (room around the body for the blur)
const WING = [5.5, 7.5], TAIL = [4.5, 5.5]; // (part ids: see P in animals/model-core.js)

export class AnimalShadows {
  constructor(scene, material) {
    this.scene = scene;
    this.cells = new Map(); // model key -> { rest, flight, wings } (null: no silhouette, use the disc)
    this.used = 0; this.built = 0; this.count = 0;
    this.ok = typeof document !== 'undefined';
    if (!this.ok) return;
    this.canvas = document.createElement('canvas');
    this.canvas.width = CELL * COLS; this.canvas.height = CELL * ROWS;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, -.5, .5, 0, -.5, .5, 0, .5, -.5, 0, .5], 3));
    quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    quad.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    quad.setIndex([0, 2, 1, 0, 3, 2]);
    this.geo = quad;
    this.mat = new THREE.MeshBasicMaterial({ color: material.color, map: this.tex, transparent: true, opacity: material.opacity, depthWrite: false, side: THREE.DoubleSide });
    this.mat.onBeforeCompile = shader => {
      shader.uniforms.uCell = { value: new THREE.Vector2(1 / COLS, 1 / ROWS) };
      shader.vertexShader = 'attribute vec3 aCell;\nuniform vec2 uCell;\nvarying float vShade;\n' + shader.vertexShader
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = vMapUv * uCell + aCell.xy; vShade = aCell.z;');
      shader.fragmentShader = 'varying float vShade;\n' + shader.fragmentShader
        .replace('#include <alphatest_fragment>', 'diffuseColor.a *= vShade;\n#include <alphatest_fragment>');
    };
    this.mat.customProgramCacheKey = () => 'animal-silhouette';
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.o = new THREE.Vector3();
    this.yAxis = new THREE.Vector3(0, 1, 0);
    this.grow(64);
  }
  grow(cap) {
    const old = this.mesh, n = this.count;
    const oldM = old?.instanceMatrix.array.slice(0, n * 16), oldC = this.cell?.array.slice(0, n * 3);
    if (old) { this.scene.remove(old); old.dispose(); }
    this.cap = cap;
    this.cell = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.cell.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aCell', this.cell);
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; this.mesh.count = 0;
    if (old) { this.mesh.instanceMatrix.array.set(oldM); this.cell.array.set(oldC); }
    this.scene.add(this.mesh);
  }
  begin() { this.count = 0; this.built = 0; }
  // The silhouettes for an animal's model (from fauna, the instanced pools), drawing them if this
  // is its first time. Null while it waits its turn, or with nothing to draw on (no canvas in node).
  shape(fauna, def, lean) {
    if (!this.ok) return null;
    const key = fauna.modelKey(def);
    let c = this.cells.get(key);
    if (c !== undefined) return c;
    if (this.built >= BUILDS_PER_FRAME) return null;
    this.built++;
    const p = fauna.pool(def), geo = p.geo, hasWings = hasPart(geo, WING);
    c = null;
    if (this.used + (hasWings ? 2 : 1) <= COLS * ROWS) {
      c = { rest: this.draw(geo, false, lean, p.motion.bird), flight: null, wings: hasWings };
      c.flight = hasWings ? this.draw(geo, true, lean, p.motion.bird) : c.rest;
      this.tex.needsUpdate = true;
    }
    this.cells.set(key, c);
    return c;
  }
  // Rasterise the model from above (x forward, z across) into the next atlas cell, in plain JS (a
  // canvas path of thousands of triangles takes tens of milliseconds). lean adds two views slanted
  // to either side, so a tall, thin fish still casts a body-shaped shadow.
  draw(geo, flight, lean, bird) {
    const pos = geo.attributes.position, ext = geo.attributes.aExt, part = geo.attributes.aPart, idx = geo.index;
    const n = pos.count, X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
    let x0 = Infinity, x1 = -Infinity, w = 0, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const pt = part ? part.getX(k) : 0;
      const use = flight && ext && (inPart(pt, WING) || bird && inPart(pt, TAIL)) ? ext : pos;
      X[k] = use.getX(k); Y[k] = use.getY(k); Z[k] = use.getZ(k);
      x0 = Math.min(x0, X[k]); x1 = Math.max(x1, X[k]); y0 = Math.min(y0, Y[k]); y1 = Math.max(y1, Y[k]);
    }
    const yc = (y0 + y1) / 2;
    for (let k = 0; k < n; k++) w = Math.max(w, Math.abs(Z[k]) + Math.abs(Y[k] - yc) * lean);
    const cx = (x0 + x1) / 2, size = Math.max(x1 - x0, 2 * w, 1e-6) * PAD;
    // coverage on a grid twice as fine as the cell (u along x, v across, v = 0 at +z)
    const G = CELL * 2, cov = new Uint8Array(G * G), PU = new Float32Array(n), PV = new Float32Array(n);
    for (let k = 0; k < n; k++) PU[k] = ((X[k] - cx) / size + .5) * G;
    const tri = (a, b, c) => {
      const ax = PU[a], ay = PV[a], bx = PU[b], by = PV[b], qx = PU[c], qy = PV[c];
      const area = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax);
      if (Math.abs(area) < 1e-9) return;
      const sgn = area > 0 ? 1 : -1;
      const i0 = Math.max(0, Math.floor(Math.min(ax, bx, qx))), i1 = Math.min(G - 1, Math.ceil(Math.max(ax, bx, qx)));
      const j0 = Math.max(0, Math.floor(Math.min(ay, by, qy))), j1 = Math.min(G - 1, Math.ceil(Math.max(ay, by, qy)));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = i + .5, py = j + .5;
        if (sgn * ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) >= 0 && sgn * ((qx - bx) * (py - by) - (qy - by) * (px - bx)) >= 0 &&
          sgn * ((ax - qx) * (py - qy) - (ay - qy) * (px - qx)) >= 0) cov[j * G + i] = 1;
      }
    };
    for (const side of lean ? [0, 1, -1] : [0]) {
      for (let k = 0; k < n; k++) PV[k] = (.5 - (Z[k] + (Y[k] - yc) * lean * side) / size) * G;
      if (idx) for (let t = 0; t + 2 < idx.count; t += 3) tri(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2));
      else for (let t = 0; t + 2 < n; t += 3) tri(t, t + 1, t + 2);
    }
    // down to the cell (2 x 2 averages), then soften with two box blurs each way
    let a = new Float32Array(CELL * CELL), tmp = new Float32Array(CELL * CELL);
    for (let j = 0; j < CELL; j++) for (let i = 0; i < CELL; i++)
      a[j * CELL + i] = (cov[2 * j * G + 2 * i] + cov[2 * j * G + 2 * i + 1] + cov[(2 * j + 1) * G + 2 * i] + cov[(2 * j + 1) * G + 2 * i + 1]) / 4;
    for (let pass = 0; pass < 4; pass++) {
      const dx = pass % 2 ? CELL : 1;
      for (let j = 0; j < CELL; j++) for (let i = 0; i < CELL; i++) {
        const k = j * CELL + i, at = pass % 2 ? j : i;
        tmp[k] = ((at > 0 ? a[k - dx] : 0) + a[k] + (at < CELL - 1 ? a[k + dx] : 0)) / 3;
      }
      [a, tmp] = [tmp, a];
    }
    const slot = this.used++, col = slot % COLS, row = (slot / COLS) | 0;
    const img = this.ctx.createImageData(CELL, CELL);
    for (let k = 0; k < CELL * CELL; k++) { img.data[k * 4] = img.data[k * 4 + 1] = img.data[k * 4 + 2] = 255; img.data[k * 4 + 3] = Math.min(255, a[k] * 300); }
    this.ctx.putImageData(img, col * CELL, row * CELL);
    return { u: col / COLS, v: 1 - (row + 1) / ROWS, cx, size };
  }
  // One shadow: at x, y, z under a model turned by yaw and scaled by sc. fly blends to the flight
  // silhouette, beat is sin(phase * flap) as in the wing shader, shade fades it (0..1).
  add(c, x, y, z, yaw, sc, fly, beat, shade) {
    const s = fly > 0.5 ? c.flight : c.rest;
    // a beating wing seen from above: its span shortens with the beat's angle (see animal-material.js)
    const across = c.wings && fly > 0 ? 1 - fly * (1 - Math.cos(beat * 0.75)) * 0.85 : 1;
    if (this.count >= this.cap) this.grow(this.cap * 2);
    const k = this.count++;
    this.q.setFromAxisAngle(this.yAxis, yaw);
    this.o.set(s.cx * sc, 0, 0).applyQuaternion(this.q);
    this.m.compose(this.v.set(x + this.o.x, y + 0.012, z + this.o.z), this.q, this.s.set(s.size * sc, 1, s.size * sc * across));
    this.mesh.setMatrixAt(k, this.m);
    const a = this.cell.array;
    a[k * 3] = s.u; a[k * 3 + 1] = s.v; a[k * 3 + 2] = shade;
  }
  end() {
    if (!this.ok) return;
    const n = this.count;
    this.mesh.count = n; this.mesh.visible = n > 0;
    if (n) {
      this.mesh.instanceMatrix.clearUpdateRanges(); this.mesh.instanceMatrix.addUpdateRange(0, n * 16);
      this.cell.clearUpdateRanges(); this.cell.addUpdateRange(0, n * 3);
      this.mesh.instanceMatrix.needsUpdate = true; this.cell.needsUpdate = true;
    }
  }
}

const inPart = (p, [lo, hi]) => p > lo && p < hi;
function hasPart(geo, range) {
  const part = geo.attributes.aPart;
  if (!part || !geo.attributes.aExt) return false;
  for (let k = 0; k < part.count; k++) if (inPart(part.getX(k), range)) return true;
  return false;
}
