// Field-guide portraits: each species' 3D model rendered once into an image, in a
// three-quarter view under the same soft daylight as the valley.

import * as THREE from 'three';
import { buildSpecies, faunaMaterial } from './fauna.js';

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

// Returns a canvas with the species on a transparent background.
export function renderPortrait(def) {
  if (!R) setup();
  const { geo, motion } = buildSpecies(def);
  const fly = def.sprite.kind === 'bat' ? 1 : 0; // bats are shown on the wing
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
