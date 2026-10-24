// node tools/watch-check.mjs
// Watch mode's eye level (render3d/eye-camera.js): the camera rides behind and above the animal,
// never under the ground, and what it can't see costs nothing: animals past the haze or behind it
// are culled, and distant ones draw their simple models.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { EyeCamera, EYE_FAR } = await import('../js/render3d/eye-camera.js');
const { ActorView, perspectiveScale, pixelsPerUnit } = await import('../js/render3d/actor-view.js');
const { Fauna } = await import('../js/render3d/fauna.js');
const { ANIMALS, loadAnimals } = await import('../js/data/animals.js');
const { adultAnimalScale } = await import('../js/render3d/animal-scale.js');

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
const pose = (x, y, z, yaw, h = 0.5) => ({ visible: true, center: new THREE.Vector3(x, y + h / 2, z), yaw, h, foot: h * 0.8, y });
const flat = () => 0;

check('The eye sits behind the animal, above it, and looks the way it faces', () => {
  const e = new EyeCamera();
  assert.ok(e.update(pose(10, 0, 10, 0), 1, 16 / 9, 1 / 60, flat));
  const p = e.camera.position, d = e.camera.getWorldDirection(new THREE.Vector3());
  assert.ok(p.x < 10 - 0.5, `behind (yaw 0 faces +x): x ${p.x.toFixed(2)}`);
  assert.ok(Math.abs(p.z - 10) < 1e-6);
  assert.ok(p.y > 0.25 + 0.3, `above the animal's middle: y ${p.y.toFixed(2)}`);
  assert.ok(d.x > 0.9, `looking ahead: ${d.toArray().map(v => v.toFixed(2))}`);
});

check('A new animal snaps the eye to it; the same one is followed smoothly', () => {
  const e = new EyeCamera();
  e.update(pose(10, 0, 10, 0), 1, 1.5, 1 / 60, flat);
  e.update(pose(20, 0, 10, 0), 1, 1.5, 1 / 60, flat);
  assert.ok(e.camera.position.x < 12, 'eases, rather than jumping 10 tiles in a frame');
  e.update(pose(20, 0, 10, 0), 2, 1.5, 1 / 60, flat);
  assert.ok(e.camera.position.x > 18, 'a different animal: straight there');
});

check('The eye never goes below the ground or down among the grass', () => {
  const e = new EyeCamera(), hill = (x, z) => Math.max(0, 12 - x) * 0.8; // rising steeply behind the animal
  for (let k = 0; k < 120; k++) e.update(pose(12, 0, 10, 0, 0.08), 1, 1.5, 1 / 30, hill);
  const p = e.camera.position;
  assert.ok(p.y >= hill(p.x, p.z) + 0.15, `y ${p.y.toFixed(2)} over ground ${hill(p.x, p.z).toFixed(2)}`);
  const t = new EyeCamera();
  t.update(pose(5, 0, 5, 1, 0.06), 1, 1.5, 1 / 60, flat);
  assert.ok(t.camera.position.y >= 0.3, 'a tortoise-sized animal still has the eye above the grass');
  for (const v of [...p.toArray(), ...e.camera.quaternion.toArray()]) assert.ok(Number.isFinite(v));
});

check('Upright on a phone, the view widens rather than cropping the animal', () => {
  const e = new EyeCamera();
  e.update(pose(5, 0, 5, 0), 1, 16 / 9, 1 / 60, flat); const wide = e.camera.fov;
  e.update(pose(5, 0, 5, 0), 1, 0.46, 1 / 60, flat);
  assert.ok(e.camera.fov > wide + 15, `fov ${wide} -> ${e.camera.fov}`);
});

check('Animals past the haze or behind the eye are culled', () => {
  const e = new EyeCamera();
  e.update(pose(10, 0, 10, 0), 1, 1.5, 1 / 60, flat);
  const view = new ActorView();
  view.update(e.camera, 800);
  assert.ok(view.enabled, 'culling is on for the perspective camera');
  assert.ok(view.visible(14, 0, 0.5, 10, 0.4), 'ahead');
  assert.ok(!view.visible(10 + EYE_FAR + 4, 0, 0.5, 10, 0.4), 'past the far plane');
  assert.ok(!view.visible(2, 0, 0.5, 10, 0.4), 'behind');
  assert.equal(pixelsPerUnit(e.camera, 800), Infinity);
  assert.ok(perspectiveScale(e.camera, 800) > 0);
});

loadAnimals((await import('../js/data/animals-serengeti.js')).default);
check('At eye level, near animals draw in detail and distant ones simply', () => {
  const e = new EyeCamera();
  e.update(pose(0, 0, 0, 0), 1, 1.5, 1 / 60, flat);
  const def = ANIMALS.find(d => !d.move || d.move === 'walk') || ANIMALS[0], scale = adultAnimalScale(def.sprite);
  const fauna = new Fauna(new THREE.Scene()), c = e.camera.position;
  fauna.begin(pixelsPerUnit(e.camera, 800), { x: c.x, y: c.y, z: c.z, scale: perspectiveScale(e.camera, 800) });
  fauna.add(def, 1.5, 0, 0, 0, scale, 0, 0, 0, 0);
  fauna.add(def, EYE_FAR - 2, 0, 0, 0, scale, 0, 0, 0, 0);
  fauna.end();
  const p = fauna.species.get(fauna.modelKey(def));
  assert.equal(p.count, 1, `${def.key}: the one close by in detail`);
  assert.equal(p.far.count, 1, `${def.key}: the one by the haze as its distant model`);
});

console.log(`${checks} watch checks passed`);
