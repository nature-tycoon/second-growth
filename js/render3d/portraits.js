// Field-guide portraits: each species' 3D model rendered once into an image, in a
// three-quarter view under the same soft daylight as the valley.

import * as THREE from 'three';
import { buildSpecies, faunaMaterial } from './fauna.js';
import * as G from './geometry.js';
import { leafColor, SHRUB_SHAPES } from './flora.js';
import { plantPhase } from '../data/plants.js';

let R = null, scene, camera;
const W = 320, H = 240;

function setup() {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.setPixelRatio(1);
  R.setSize(W, H, false);
  R.outputColorSpace = THREE.SRGBColorSpace;
  R.toneMapping = THREE.NeutralToneMapping;
  R.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe4eeff, 0x6f7a4c, 1.35));
  const sun = new THREE.DirectionalLight(0xfff3dc, 2.3);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  camera = new THREE.PerspectiveCamera(24, W / H, 0.1, 1000);
}

// Box around the model, including spread wings when the pose uses them.
function bounds(geo, fly) {
  const box = new THREE.Box3(), v = new THREE.Vector3();
  const pos = geo.attributes.position, ext = geo.attributes.aExt, part = geo.attributes.aPart;
  for (let i = 0; i < pos.count; i++) {
    const wing = part.getX(i) > 5.5 && part.getX(i) < 7.5;
    box.expandByPoint(fly && wing ? v.fromBufferAttribute(ext, i) : v.fromBufferAttribute(pos, i));
  }
  return box;
}

// Frame whatever is in the scene from dir, render it, and hand back a copy of the canvas.
function shoot(box, dir, spread = 1.05) {
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x * 0.55, size.y * 0.75, size.z * 0.55);
  const dist = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * spread;
  camera.position.copy(c).addScaledVector(dir.normalize(), dist);
  camera.lookAt(c);
  camera.near = dist * 0.1; camera.far = dist * 10; camera.updateProjectionMatrix();
  R.render(scene, camera);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  out.getContext('2d').drawImage(R.domElement, 0, 0);
  return out;
}

// Plants for the tool palette and field guide, built from the same geometry as the valley.
// list: plants (or [plant, month]) laid out left to right, as for a seed mix.
const lin = h => new THREE.Color().setRGB(((parseInt(h.slice(1), 16) >> 16) & 255) / 255, ((parseInt(h.slice(1), 16) >> 8) & 255) / 255, (parseInt(h.slice(1), 16) & 255) / 255);
function showMonth(p) { return p.look.bloom ? p.look.bloom[0] : p.look.fruit ? p.look.fruit[0] : 3; }
export function renderPlants(list) {
  if (!R) setup();
  const added = [], box = new THREE.Box3();
  const put = (geo, color, x, z = 0, sc = 1) => {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: !!geo.attributes.color, color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0, z); mesh.scale.setScalar(sc);
    scene.add(mesh); added.push(mesh);
    mesh.updateMatrixWorld(); box.expandByObject(mesh);
  };
  const dot = (color, x, y, z, r) => put(new THREE.SphereGeometry(r, 8, 6).translate(0, y, 0), color, x, z);
  let x = 0;
  list.forEach((entry, n) => {
    const p = Array.isArray(entry) ? entry[0] : entry, month = Array.isArray(entry) ? entry[1] : showMonth(p);
    const phase = plantPhase(p, month), leaf = new THREE.Color().setRGB(...leafColor(p, phase));
    const type = p.look.type;
    if (p.layer === 2) {
      const parts = G.treeParts(G.TREE_SHAPES[type] || G.TREE_SHAPES.oak || Object.values(G.TREE_SHAPES)[0], 500 + p.id);
      const sc = list.length > 1 ? 0.8 : 1;
      put(parts.crown, leaf, x, 0, sc); put(parts.trunk, lin(p.look.bark || '#6a5a48'), x, 0, sc);
      x += 1.3;
    } else if (p.layer === 1) {
      const shape = SHRUB_SHAPES.includes(type) ? type : 'shrub';
      put(G.shrub(shape, 200 + shape.length), leaf, x);
      const c = phase === 'bloom' && p.look.flower ? p.look.flower : phase === 'fruit' && p.look.berry ? p.look.berry : null;
      if (c) for (let k = 0; k < 7; k++) { const a = k * 2.4; dot(lin(c), x + Math.cos(a) * 0.2, 0.18 + (k % 3) * 0.08, Math.sin(a) * 0.2, 0.03); }
      x += 0.75;
    } else {
      for (let k = 0; k < 3; k++) {
        const ox = x + (k - 1) * 0.14, oz = (k % 2) * 0.12 - 0.06;
        put(G.tuft(type, 100 + type.length), leaf, ox, oz, 1.1);
        if (phase === 'bloom' && p.look.flower) dot(lin(p.look.flower), ox, 0.17, oz, 0.022);
      }
      x += 0.55;
    }
  });
  const out = shoot(box, new THREE.Vector3(0.45, 0.5, 1), list.length > 1 ? 1.0 : 1.08);
  for (const m of added) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  return out;
}

// Returns a canvas with the species on a transparent background.
export function renderPortrait(def, { fly: flying = false } = {}) {
  if (!R) setup();
  const { geo, motion } = buildSpecies(def);
  const fly = def.sprite.kind === 'bat' || flying ? 1 : 0; // bats are shown on the wing
  geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, fly, 0]), 4));
  const mat = faunaMaterial(motion);
  const mesh = new THREE.InstancedMesh(geo, mat, 1);
  mesh.setMatrixAt(0, new THREE.Matrix4());
  scene.add(mesh);

  const box = bounds(geo, fly), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  // three-quarter view; bats from above so their wings read
  const dir = (fly ? new THREE.Vector3(0.35, 1.3, 0.75) : new THREE.Vector3(0.5, 0.42, 1)).normalize();
  const radius = Math.max(size.x * 0.55, size.y * 0.75, size.z * 0.55);
  const dist = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
  camera.position.copy(c).addScaledVector(dir, dist);
  camera.lookAt(c);
  camera.near = dist * 0.1; camera.far = dist * 10; camera.updateProjectionMatrix();
  R.render(scene, camera);

  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  out.getContext('2d').drawImage(R.domElement, 0, 0);
  scene.remove(mesh); geo.dispose(); mat.dispose(); mesh.dispose();
  return out;
}
