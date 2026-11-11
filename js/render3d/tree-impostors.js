// Tree impostors (decision 0042): with the whole valley in view, each tree crown is drawn as one
// flat card (2 triangles) showing a picture of its close model, baked once at load. The play
// camera has a fixed tilt and no perspective, so a crown only ever needs to be seen from that one
// height, from a ring of directions round it: VIEWS pictures per crown model, side by side in a
// row of the atlas. Each picture keeps the model's colours (the per-tree tint, which carries the
// season, is applied when drawn), its surface directions (so the sun lights the card as it would the
// crown, through the day) and its depth (so other trees' shadows fall on the crown's front, not
// on a flat card through its middle). The crown's far model (far-models.js) still casts its
// shadow: the sun sees the tree from every height through the day, the pictures only from one.
import * as THREE from 'three';
import { windy } from './plant-materials.js';
import { withFocusFade } from './focus.js';
import { withClouds } from './atmosphere.js';
import { snow, SNOW_RGB } from './snow.js';

export const VIEW_TILT = THREE.MathUtils.degToRad(34); // the play camera's fixed tilt (scene.js EL)
const VIEWS = 8; // (pictures round each crown: the nearest is drawn, at most 22.5° off)
const PAD = 3; // (empty pixels round each picture, so neighbours don't bleed into it)

const viewAxes = k => {
  const a = k * Math.PI * 2 / VIEWS, c = Math.cos(VIEW_TILT), s = Math.sin(VIEW_TILT);
  return { // (as Renderer.viewDir and right: d points toward the camera)
    d: new THREE.Vector3(Math.sin(a) * c, s, Math.cos(a) * c),
    r: new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)),
    u: new THREE.Vector3(-Math.sin(a) * s, c, -Math.cos(a) * s),
  };
};

const normalBake = new THREE.ShaderMaterial({
  uniforms: { uC: { value: new THREE.Vector3() }, uD: { value: new THREE.Vector3() }, uR: { value: 1 } },
  vertexShader: `uniform vec3 uC; uniform vec3 uD; uniform float uR; varying vec3 vN; varying float vDepth;
    void main() { vN = normal; vDepth = dot(position - uC, uD) / uR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `varying vec3 vN; varying float vDepth;
    void main() { gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, clamp(vDepth * 0.5 + 0.5, 0.0, 1.0)); }`,
});
const colorBake = new THREE.MeshBasicMaterial({ vertexColors: true });

export class TreeImpostors {
  // cell: pixels per picture (128 is about a crown's size on a Retina screen zoomed out; 64 is
  // enough at a device pixel ratio of 1). size: the atlas's width and height in pixels.
  constructor(wind, { cell = 128, size = 2048 } = {}) {
    this.cell = cell; this.size = size; this.enabled = true;
    this.perRow = Math.floor(size / (cell * VIEWS)); this.capacity = this.perRow * Math.floor(size / cell);
    this.slots = new Map(); this.queue = [];
    this.stats = { baked: 0, ms: 0, full: 0 };
    this.uniforms = { tCardColor: { value: null }, tCardNormal: { value: null }, uCardCell: { value: new THREE.Vector2(cell / size, cell / size) }, uCardPad: { value: PAD / cell } };
    this.material = cardMaterial(wind, this.uniforms);
  }

  // The card for a crown model, or null when the atlas is full (the far model is drawn instead).
  // It is drawn only once baked (userData.ready, see bake).
  card(key, geo) {
    let slot = this.slots.get(key);
    if (slot) return slot.card;
    if (this.slots.size >= this.capacity) { this.stats.full++; return null; }
    const n = this.slots.size, col = n % this.perRow, row = Math.floor(n / this.perRow);
    geo.computeBoundingBox();
    const box = geo.boundingBox, c = new THREE.Vector3(0, (box.min.y + box.max.y) / 2, 0), p = geo.attributes.position, v = new THREE.Vector3();
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, depth = 0;
    for (let k = 0; k < VIEWS; k++) {
      const ax = viewAxes(k);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).sub(c);
        const x = v.dot(ax.r), y = v.dot(ax.u);
        u0 = Math.min(u0, x); u1 = Math.max(u1, x); v0 = Math.min(v0, y); v1 = Math.max(v1, y);
        depth = Math.max(depth, Math.abs(v.dot(ax.d)));
      }
    }
    // (square pictures, centred on the crown's middle, so its pixels are equally sharp both ways)
    const half = Math.max(u1 - u0, v1 - v0) / 2 * 1.02, mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
    const rect = [mu - half, mu + half, mv - half, mv + half];
    const card = new THREE.BufferGeometry(), cu = col * VIEWS * this.cell / this.size, cv = row * this.cell / this.size;
    card.setAttribute('position', new THREE.Float32BufferAttribute([rect[0], rect[2], 0, rect[1], rect[2], 0, rect[1], rect[3], 0, rect[0], rect[3], 0], 3));
    card.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    card.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3));
    card.setAttribute('aCardUv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    card.setAttribute('aCard', new THREE.Float32BufferAttribute(new Array(4).fill([cu, cv, c.y, depth]).flat(), 4));
    card.setIndex([0, 1, 2, 0, 2, 3]);
    card.boundingBox = box.clone(); card.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    card.userData = { ready: false, atlas: this };
    slot = { key, geo, card, col, row, c, rect, depth };
    this.slots.set(key, slot); this.queue.push(slot);
    return card;
  }

  targets() {
    if (this.color) return;
    // (the atlas needs no depth buffer: each picture is drawn in a small target that has one, then copied in)
    const opts = { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.color = new THREE.WebGLRenderTarget(this.size, this.size, { ...opts, colorSpace: THREE.SRGBColorSpace });
    this.normal = new THREE.WebGLRenderTarget(this.size, this.size, opts);
    const cell = { depthBuffer: true, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.cellColor = new THREE.WebGLRenderTarget(this.cell, this.cell, { ...cell, colorSpace: THREE.SRGBColorSpace });
    this.cellNormal = new THREE.WebGLRenderTarget(this.cell, this.cell, cell);
    this.uniforms.tCardColor.value = this.color.texture; this.uniforms.tCardNormal.value = this.normal.texture;
  }

  // Bakes the crowns waiting for their pictures. Returns how many, so the caller can redraw its
  // plants with the new cards (Flora.setZoom with force).
  bake(gl) {
    if (!this.queue.length) return 0;
    const t0 = performance.now();
    this.targets();
    for (const target of [this.color, this.normal]) gl.initRenderTarget(target); // (a copy needs its texture made first)
    const scene = this.bakeScene ||= new THREE.Scene(), mesh = this.bakeMesh ||= new THREE.Mesh(undefined, colorBake);
    if (!mesh.parent) scene.add(mesh);
    const cam = this.bakeCam ||= new THREE.OrthographicCamera();
    const prevTarget = gl.getRenderTarget(), prevColor = gl.getClearColor(new THREE.Color()), prevAlpha = gl.getClearAlpha(), prevAuto = gl.autoClear, prevShadow = gl.shadowMap.autoUpdate;
    gl.autoClear = false; gl.shadowMap.autoUpdate = false;
    this.color.texture.generateMipmaps = this.normal.texture.generateMipmaps = false; // (made once, at the end)
    const n = this.queue.length;
    for (const slot of this.queue.splice(0)) {
      const { geo, c, rect, depth } = slot, cols = geo.attributes.color, avg = [0, 0, 0];
      if (cols) { for (let i = 0; i < cols.count; i++) { avg[0] += cols.getX(i); avg[1] += cols.getY(i); avg[2] += cols.getZ(i); } avg.forEach((x, q) => avg[q] = x / cols.count); }
      mesh.geometry = geo;
      for (let k = 0; k < VIEWS; k++) {
        const ax = viewAxes(k), x = (slot.col * VIEWS + k) * this.cell, y = slot.row * this.cell;
        cam.left = rect[0]; cam.right = rect[1]; cam.bottom = rect[2]; cam.top = rect[3];
        cam.near = 0.01; cam.far = depth * 2 + 2;
        cam.position.copy(c).addScaledVector(ax.d, depth + 1); cam.up.set(0, 1, 0); cam.lookAt(c);
        cam.updateProjectionMatrix(); cam.updateMatrixWorld();
        normalBake.uniforms.uC.value.copy(c); normalBake.uniforms.uD.value.copy(ax.d); normalBake.uniforms.uR.value = depth;
        // (the empty pixels round a crown take its average colour, so the blurred edges of the
        // smaller copies GPUs draw from far away don't darken it)
        for (const [cellTarget, target, material, clear, alpha] of [[this.cellColor, this.color, colorBake, avg, 0], [this.cellNormal, this.normal, normalBake, [0.5, 1, 0.5], 0.5]]) {
          cellTarget.viewport.set(PAD, PAD, this.cell - PAD * 2, this.cell - PAD * 2);
          gl.setRenderTarget(cellTarget);
          gl.setClearColor(new THREE.Color().setRGB(...clear, THREE.LinearSRGBColorSpace), alpha); gl.clear();
          mesh.material = material; gl.render(scene, cam);
          gl.copyTextureToTexture(cellTarget.texture, target.texture, null, new THREE.Vector2(x, y));
        }
      }
      slot.card.userData.ready = true;
    }
    // the smaller copies, once for all the new pictures (a render with mipmaps on makes them)
    for (const target of [this.color, this.normal]) {
      target.texture.generateMipmaps = true; target.viewport.set(0, 0, 1, 1);
      gl.setRenderTarget(target); mesh.visible = false; gl.render(scene, cam); mesh.visible = true;
      target.viewport.set(0, 0, this.size, this.size);
    }
    gl.setRenderTarget(prevTarget); gl.setClearColor(prevColor, prevAlpha); gl.autoClear = prevAuto; gl.shadowMap.autoUpdate = prevShadow;
    this.stats.baked += n; this.stats.ms += performance.now() - t0;
    return n;
  }

  // After a lost graphics context: the pictures are gone with it, bake them all again.
  restore() {
    for (const t of [this.color, this.normal, this.cellColor, this.cellNormal]) t?.dispose();
    this.color = this.normal = null;
    for (const slot of this.slots.values()) { slot.card.userData.ready = false; this.queue.push(slot); }
  }

  dispose() { for (const t of [this.color, this.normal, this.cellColor, this.cellNormal]) t?.dispose(); for (const s of this.slots.values()) s.card.dispose(); this.slots.clear(); this.queue.length = 0; }
}

// The crowns' own material (wind, leaf light, the window round a selected animal, cloud shade),
// drawing a card: turned to face the camera, showing the picture nearest the camera's direction
// relative to the tree, lit by the picture's surface directions.
function cardMaterial(wind, uniforms) {
  const mat = withClouds(withFocusFade(windy(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.012, wind)));
  const prev = mat.onBeforeCompile, baseKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer); // (first: the wind adds its sway after the begin_vertex line, which becomes the card's corner below)
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uSnow = snow.uSnow;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
      mat3 cardM = mat3(instanceMatrix);
      float cardS = length(cardM[0]), cardSy = length(cardM[1]);
      vec3 cardR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 cardU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      vec3 cardD = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
      vec3 objectNormal = vec3(dot(cardM[0], cardD), dot(cardM[1], cardD), dot(cardM[2], cardD));`)
      .replace('#include <begin_vertex>', `
      // (a tree stretched taller than wide shows that stretch mostly upright: the camera's tilt
      // mixes the height (cos² of it) and the width (sin²) into the card's height)
      float cardVs = cardSy * ${(Math.cos(VIEW_TILT) ** 2).toFixed(3)} + cardS * ${(Math.sin(VIEW_TILT) ** 2).toFixed(3)};
      vec3 cardW = vec3(0.0, aCard.z * cardSy, 0.0) + cardR * position.x * cardS + cardU * position.y * cardVs;
      vec3 transformed = vec3(dot(cardM[0], cardW) / (cardS * cardS), dot(cardM[1], cardW) / (cardSy * cardSy), dot(cardM[2], cardW) / (cardS * cardS));
      float cardTurn = atan(cardM[2].x, cardM[2].z);
      float cardK = mod(floor((atan(cardD.x, cardD.z) - cardTurn) / 6.2831853 * ${VIEWS.toFixed(1)} + 0.5), ${VIEWS.toFixed(1)});
      vec2 cardIn = mix(vec2(uCardPad), vec2(1.0 - uCardPad), aCardUv);
      vCardUv = aCard.xy + vec2((cardK + cardIn.x) * uCardCell.x, cardIn.y * uCardCell.y);
      vCardTurn = vec2(cos(cardTurn), sin(cardTurn)); vCardH = aCardUv.y;
      vCardXZ = (instanceMatrix * vec4(transformed, 1.0)).xz;`)
      .replace('#include <shadowmap_vertex>', `#include <shadowmap_vertex>
      #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
        vCardShadow = directionalShadowMatrix[0] * vec4(cardD * aCard.w * cardS, 0.0);
      #else
        vCardShadow = vec4(0.0);
      #endif`);
    shader.vertexShader = 'attribute vec2 aCardUv;\nattribute vec4 aCard;\nuniform vec2 uCardCell;\nuniform float uCardPad;\nvarying vec2 vCardUv;\nvarying vec2 vCardTurn;\nvarying float vCardH;\nvarying vec2 vCardXZ;\nvarying vec4 vCardShadow;\n' + shader.vertexShader;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec4 cardC = texture2D(tCardColor, vCardUv);
      if (cardC.a < 0.5) discard;
      diffuseColor.rgb *= cardC.rgb;
      vec4 cardN = texture2D(tCardNormal, vCardUv);
      vec3 cardNo = normalize(cardN.xyz * 2.0 - 1.0);
      vec3 cardNw = vec3(cardNo.x * vCardTurn.x + cardNo.z * vCardTurn.y, cardNo.y, -cardNo.x * vCardTurn.y + cardNo.z * vCardTurn.x);
      float cardDepth = cardN.a * 2.0 - 1.0;
      if (uSnow > 0.01) { // (as withSnowTops on a crown: snow.js)
        float snGrain = fract(sin(dot(floor(vCardXZ * 9.0), vec2(12.9898, 78.233))) * 43758.5453);
        float snDust = uSnow * 0.95 * smoothstep(0.25, 0.8, cardNw.y) * (0.7 + 0.3 * snGrain) * (0.75 + 0.4 * vCardH);
        float snDeep = smoothstep(0.6, 1.0, uSnow) * smoothstep(0.1, 0.6, cardNw.y) * (0.42 + 0.3 * snGrain) * (0.8 + 0.25 * vCardH);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${SNOW_RGB}, clamp(max(snDust * 1.15, snDeep), 0.0, 0.8));
      }`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      normal = normalize(mat3(viewMatrix) * cardNw); nonPerturbedNormal = normal;`)
      // (shadows are looked up on the crown's front surface, from the picture's depth)
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replaceAll('vDirectionalShadowCoord[ i ]', '( vDirectionalShadowCoord[ i ] + vCardShadow * cardDepth )'));
    shader.fragmentShader = 'uniform sampler2D tCardColor;\nuniform sampler2D tCardNormal;\nuniform float uSnow;\nvarying vec2 vCardUv;\nvarying vec2 vCardTurn;\nvarying float vCardH;\nvarying vec2 vCardXZ;\nvarying vec4 vCardShadow;\n' + shader.fragmentShader;
  };
  mat.customProgramCacheKey = () => baseKey + '|card' + VIEWS;
  return mat;
}
