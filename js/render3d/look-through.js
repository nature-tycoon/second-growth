// The tracked animal seen faintly through what hides it, rather than a hole cut round it: after the
// scene is drawn, the selected (or followed) animal is drawn once more over everything, so the parts
// of it behind leaves, grass or a trunk show through them at partial strength, and the parts already
// in view look just as they were. Nothing is cut, so no shape shows round it (focus.js still opens
// a soft gap through cover well nearer the camera).
//
// Fauna.add records which pool and instance the tracked animal went into (detail = true). This
// copies that instance into a one-instance mesh sharing the species' geometry and material, kept on
// its own layer so the normal draw skips it. The pass draws it a little nearer the camera (about its
// own size, withLookShift), so it shows through cover close round it but not through a tree well in
// front: its depth is laid down against the scene's (it also hides its own far side), then its
// colour blended in where it is nearest. Where it is in plain view the blend changes nothing. Two
// draws of one animal a frame.

import * as THREE from 'three';
import { focus } from './focus.js';

export const LOOK_LAYER = 7;
// How far in front of the animal cover is seen through is focus.uLookD (about its size: the bush
// or crown it is in, the grass round it). A tree standing farther toward the camera stays in front
// of it (Cole: the animal looked to walk in front of foreground trees); focus.js opens that instead.
const lookShift = { value: 0 };
export const LOOK_TRUNKS = 8; // (the trunks nearest in front of it, focus.uLookTrunks)

// The animal's material, drawn this pass a set distance nearer the camera along each line of
// sight (so it shows in the same place on screen, and passes the depth test only against what lies
// within that distance in front of it); its lighting and shade still come from where it is. 0 in
// the normal draw.
// near: for the branch the animal is on (flora's canopyBark), drawn this pass only round it, fading
// out within uLookD of it, so it is seen sitting on wood rather than floating in the leaves.
export function withLookShift(mat, { near = false } = {}) {
  const prev = mat.onBeforeCompile, baseKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, { uLookShift: lookShift, uLookTrunks: focus.uLookTrunks, uLookDir: focus.uViewDir, uLookAt: focus.uFocus, uLookD: focus.uLookD });
    shader.vertexShader = 'uniform float uLookShift;\nvarying vec3 vLookW;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 lookW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        lookW = instanceMatrix * lookW;
      #endif
      vLookW = (modelMatrix * lookW).xyz;
      if (uLookShift > 0.0) {
        vec4 mvLook = mvPosition;
        if (isOrthographic) mvLook.z += uLookShift; else mvLook.xyz *= max(0.1, 1.0 - uLookShift / max(length(mvLook.xyz), 1e-3));
        gl_Position = projectionMatrix * mvLook;
      }`);
    // a trunk close in front hides it, as the trees farther off do by depth: what of it lies behind
    // one of the trunks round it (Renderer.updateFocus, focus.uLookTrunks: x, z, radius, top) isn't drawn
    // this pass, so it passes behind the trunk rather than seeming to walk in front of it
    shader.fragmentShader = `uniform float uLookShift; uniform vec4 uLookTrunks[${LOOK_TRUNKS}]; uniform vec3 uLookDir; uniform vec3 uLookAt; uniform float uLookD; varying vec3 vLookW;\n` + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      ${near ? 'if (uLookShift > 0.0 && distance(vLookW, uLookAt) > uLookD) discard;' : ''}
      if (uLookShift > 0.0) {
        vec3 lookTo = isOrthographic ? uLookDir : cameraPosition - vLookW; // (to the eye: as far as the eye)
        float lookA = dot(lookTo.xz, lookTo.xz);
        for (int i = 0; i < ${LOOK_TRUNKS}; i++) {
          vec4 tr = uLookTrunks[i];
          vec2 o = vLookW.xz - tr.xy;
          float b = dot(o, lookTo.xz), c = dot(o, o) - tr.z * tr.z, disc = b * b - lookA * c;
          if (tr.z > 0.0 && lookA > 1e-6 && c > 0.0 && disc > 0.0) {
            float t = (-b - sqrt(disc)) / lookA;
            if (t > 0.0 && (isOrthographic || t < 1.0) && vLookW.y + t * lookTo.y < tr.w) discard; // (below the crown)
          }
        }
      }`);
    // (the branch fades out round it)
    if (near) shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      if (uLookShift > 0.0) gl_FragColor.a *= 1.0 - smoothstep(0.4 * uLookD, uLookD, distance(vLookW, uLookAt));`);
  };
  mat.customProgramCacheKey = () => baseKey + '|look' + (near ? '-near' : '');
  return mat;
}
export const LOOK_ALPHA = 0.42; // how strongly a hidden part shows through (1: as if nothing were in front)

// pool: a species' SpeciesMesh (animal-pools.js). Its per-instance attributes are copied for the one
// instance; everything else is the pool's own.
function ghostFor(pool) {
  if (pool.lookGhost && pool.lookGhost.geo === pool.geo && pool.lookGhost.anim === pool.anim) return pool.lookGhost;
  if (pool.lookGhost) { pool.scene.remove(pool.lookGhost.mesh); pool.lookGhost.geometry.dispose(); }
  const geometry = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(pool.geo.attributes)) {
    if (attr.isInstancedBufferAttribute) geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(attr.itemSize), attr.itemSize));
    else geometry.setAttribute(name, attr);
  }
  if (pool.geo.index) geometry.setIndex(pool.geo.index);
  for (const g of pool.geo.groups) geometry.addGroup(g.start, g.count, g.materialIndex);
  const mesh = new THREE.InstancedMesh(geometry, pool.mat, 1);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.layers.set(LOOK_LAYER); mesh.visible = false;
  mesh.receiveShadow = pool.mesh.receiveShadow; // (lit as the animal is, shade included)
  pool.scene.add(mesh);
  return pool.lookGhost = { mesh, geometry, geo: pool.geo, anim: pool.anim };
}

// Draw the tracked animal through cover. amt: 0 off .. 1 full (the lens's uFocusAmt).
// near: other meshes drawn in the same pass round it (the branch it is on: Flora.lookNear), whose
// material has withLookShift({ near: true }).
export function drawLookThrough(gl, scene, camera, fauna, amt, near = []) {
  const tracked = fauna.tracked;
  if (!tracked?.length || amt < 0.01) return;
  const ghosts = [];
  for (const { pool, k } of tracked) {
    if (k >= pool.count || !pool.mesh.visible) continue; // (hidden, as by a check)
    const g = ghostFor(pool), geo = g.geometry;
    g.mesh.instanceMatrix.array.set(pool.mesh.instanceMatrix.array.subarray(k * 16, k * 16 + 16)); g.mesh.instanceMatrix.needsUpdate = true;
    for (const [name, attr] of Object.entries(pool.geo.attributes)) if (attr.isInstancedBufferAttribute) {
      const own = geo.attributes[name], s = attr.itemSize;
      own.array.set(attr.array.subarray(k * s, k * s + s)); own.needsUpdate = true;
    }
    g.mesh.visible = true; ghosts.push(g);
  }
  if (!ghosts.length) return;
  const lights = scene.children.filter(o => o.isLight);
  for (const l of lights) l.layers.enable(LOOK_LAYER);
  const layers = camera.layers.mask, background = scene.background, autoClear = gl.autoClear, shadows = gl.shadowMap.needsUpdate;
  camera.layers.set(LOOK_LAYER); scene.background = null; gl.autoClear = false; gl.shadowMap.needsUpdate = false;
  // how far in front of it to see through (see Renderer.updateFocus), from its front: its far
  // parts are drawn as much farther forward again as it is deep, so cover anywhere up to that line
  // shows it, and focus.js opens what lies beyond
  lookShift.value = focus.uLookD.value + Math.max(0, focus.uFocusFront.value - focus.uFocusBack.value);
  for (const m of near) m.layers.enable(LOOK_LAYER);
  const mats = [...new Set([...ghosts, ...near.map(mesh => ({ mesh }))].map(g => g.mesh.material))];
  const saved = mats.map(m => ({ colorWrite: m.colorWrite, depthFunc: m.depthFunc, depthWrite: m.depthWrite, transparent: m.transparent, opacity: m.opacity }));
  // its own depth first, then its colour where it is nearest
  for (const m of mats) { m.colorWrite = false; m.depthWrite = true; } // (tested against the scene: nothing farther in front is drawn over)
  gl.render(scene, camera);
  for (const m of mats) { m.colorWrite = true; m.depthWrite = false; m.depthFunc = THREE.EqualDepth; m.transparent = true; m.opacity = LOOK_ALPHA * Math.min(1, amt); }
  gl.render(scene, camera);
  mats.forEach((m, i) => Object.assign(m, saved[i]));
  camera.layers.mask = layers; scene.background = background; gl.autoClear = autoClear; gl.shadowMap.needsUpdate = shadows;
  for (const l of lights) l.layers.disable(LOOK_LAYER);
  for (const g of ghosts) g.mesh.visible = false;
  for (const m of near) m.layers.disable(LOOK_LAYER);
  lookShift.value = 0;
}
