// The tracked animal seen faintly through what hides it, rather than a hole cut round it: after the
// scene is drawn, the selected (or followed) animal is drawn once more over everything, so the parts
// of it behind leaves, grass or a trunk show through them at partial strength, and the parts already
// in view look just as they were. Nothing is cut, so no shape shows round it (focus.js still opens
// a soft gap through cover well nearer the camera).
//
// Fauna.add records which pool and instance the tracked animal went into (detail = true). This
// copies that instance into a one-instance mesh sharing the species' geometry and material, kept on
// its own layer so the normal draw skips it. The pass: the depth buffer is cleared, the animal's own
// depth laid down (so it hides its own far side, not just the leaves), then its colour blended in
// where it is nearest. Two draws of one animal a frame.

import * as THREE from 'three';

export const LOOK_LAYER = 7;
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
export function drawLookThrough(gl, scene, camera, fauna, amt) {
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
  gl.clearDepth();
  const mats = [...new Set(ghosts.map(g => g.mesh.material))];
  const saved = mats.map(m => ({ colorWrite: m.colorWrite, depthFunc: m.depthFunc, depthWrite: m.depthWrite, transparent: m.transparent, opacity: m.opacity }));
  // its own depth first, then its colour where it is nearest
  for (const m of mats) { m.colorWrite = false; m.depthWrite = true; }
  gl.render(scene, camera);
  for (const m of mats) { m.colorWrite = true; m.depthWrite = false; m.depthFunc = THREE.EqualDepth; m.transparent = true; m.opacity = LOOK_ALPHA * Math.min(1, amt); }
  gl.render(scene, camera);
  mats.forEach((m, i) => Object.assign(m, saved[i]));
  camera.layers.mask = layers; scene.background = background; gl.autoClear = autoClear; gl.shadowMap.needsUpdate = shadows;
  for (const l of lights) l.layers.disable(LOOK_LAYER);
  for (const g of ghosts) g.mesh.visible = false;
}
