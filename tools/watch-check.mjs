// node tools/watch-check.mjs
// Watch mode's eye level (render3d/eye-camera.js): the camera rides behind and above the animal,
// never under the ground, and what it can't see costs nothing: animals past the haze or behind it
// are culled, and distant ones draw their simple models. The sky at eye level (render3d/eye-sky.js)
// goes with the eye and carries the weather, and lightning (render3d/lightning.js) strikes in storms.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { EyeCamera, EYE_FAR, WATER_FAR } = await import('../js/render3d/eye-camera.js');
const { ActorView, perspectiveScale, pixelsPerUnit } = await import('../js/render3d/actor-view.js');
const { Fauna } = await import('../js/render3d/fauna.js');
const { ANIMALS, loadAnimals } = await import('../js/data/animals.js');
const { adultAnimalScale } = await import('../js/render3d/animal-scale.js');
const { EyeSky, SKY_RADIUS } = await import('../js/render3d/eye-sky.js');
const { Lightning, boltPath, BOLT_TOP } = await import('../js/render3d/lightning.js');

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

check('A drag or Q / E swings the eye round the animal, which it keeps following side-on as it turns', () => {
  const e = new EyeCamera(), quarter = { yaw: Math.PI / 2 / 30, pitch: 0 };
  e.update(pose(10, 0, 10, 0), 1, 1.5, 1 / 60, flat);
  for (let k = 0; k < 30; k++) e.update(pose(10, 0, 10, 0), 1, 1.5, 1 / 60, flat, null, quarter);
  for (let k = 0; k < 240; k++) e.update(pose(10, 0, 10, 0), 1, 1.5, 1 / 60, flat);
  let p = e.camera.position, d = e.camera.getWorldDirection(new THREE.Vector3());
  assert.ok(p.z < 10 - 0.5 && Math.abs(p.x - 10) < 0.05, `a quarter round, to its side: ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`);
  assert.ok(d.z > 0.9 && e.forward.z > 0.99, 'looking across at it');
  // the animal turns a quarter (to face -z): the eye goes round with it
  for (let k = 0; k < 600; k++) e.update(pose(10, 0, 10, Math.PI / 2), 1, 1.5, 1 / 60, flat);
  p = e.camera.position;
  assert.ok(p.x < 10 - 0.5 && Math.abs(p.z - 10) < 0.05, `still side-on: ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`);
  // dragging down lifts it to look down on the animal, but never under its level
  const y0 = p.y;
  for (let k = 0; k < 30; k++) e.update(pose(10, 0, 10, Math.PI / 2), 1, 1.5, 1 / 60, flat, null, { yaw: 0, pitch: -0.05 });
  for (let k = 0; k < 240; k++) e.update(pose(10, 0, 10, Math.PI / 2), 1, 1.5, 1 / 60, flat);
  assert.ok(e.camera.position.y > y0 + 0.3, `higher: ${y0.toFixed(2)} -> ${e.camera.position.y.toFixed(2)}`);
  for (let k = 0; k < 120; k++) e.update(pose(10, 0, 10, Math.PI / 2), 1, 1.5, 1 / 60, flat, null, { yaw: 0, pitch: 0.1 });
  assert.ok(e.rise >= -0.15);
  // a new animal starts behind again
  e.update(pose(20, 0, 20, 0), 2, 1.5, 1 / 60, flat);
  assert.ok(e.camera.position.x < 20 - 0.5 && Math.abs(e.camera.position.z - 20) < 1e-6, 'behind the new one');
});

check('Under the sea the eye stays on the animal\'s side of the surface, and sees less far', () => {
  const sea = 1.8, bed = () => 0.6;
  const manta = new EyeCamera(); // (big, and swimming just under the surface)
  for (let k = 0; k < 60; k++) manta.update(pose(10, 1.45, 10, 0, 0.3), 1, 1.5, 1 / 30, bed, sea);
  assert.ok(manta.under && manta.camera.position.y < sea, `eye under water: y ${manta.camera.position.y.toFixed(2)}`);
  assert.equal(manta.camera.far, WATER_FAR);
  const booby = new EyeCamera(); // (resting on the water, its body mostly above it)
  for (let k = 0; k < 60; k++) booby.update(pose(10, sea - 0.02, 10, 0, 0.12), 2, 1.5, 1 / 30, bed, sea);
  assert.ok(!booby.under && booby.camera.position.y > sea, `eye above water: y ${booby.camera.position.y.toFixed(2)}`);
  assert.equal(booby.camera.far, EYE_FAR);
  const shallow = new EyeCamera(); // (water barely deeper than the clamp: the eye stays off the sand)
  shallow.update(pose(10, 1.62, 10, 0, 0.05), 3, 1.5, 1 / 30, () => 1.6, sea);
  assert.ok(shallow.camera.position.y > 1.6, 'above the seabed');
});

check('Walking on foot sets off the way the view looked, turns, follows the ground and stays on the map', () => {
  const e = new EyeCamera(), hill = (x, z) => x * 0.1, still = { yaw: 0, pitch: 0 }, inside = (x, z) => ({ x: Math.min(Math.max(x, 0.5), 30), z: Math.min(Math.max(z, 0.5), 30) });
  e.update(pose(10, 1, 10, 0), 1, 1.5, 1 / 60, hill);
  const x0 = e.camera.position.x;
  for (let k = 0; k < 60; k++) e.walk({ fwd: 1, side: 0, turn: 0, run: false }, still, 1.5, 1 / 60, hill, null, inside);
  let p = e.camera.position;
  assert.ok(p.x > x0 + 2.5 && Math.abs(p.z - 10) < 1e-6, `a second's walk along +x: ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`);
  assert.ok(p.y > hill(p.x) + 0.3, `above the ground: y ${p.y.toFixed(2)}`);
  for (let k = 0; k < 60; k++) e.walk({ fwd: 0, side: 0, turn: 1, run: false }, still, 1.5, 1 / 60, hill, null, inside);
  assert.ok(e.forward.z > 0.9, `E turns right (from +x toward +z): ${e.forward.toArray().map(v => v.toFixed(2))}`);
  for (let k = 0; k < 600; k++) e.walk({ fwd: 1, side: 0, turn: 0, run: true }, still, 1.5, 1 / 60, hill, null, inside);
  assert.ok(e.camera.position.z <= 30, 'kept on the map');
  const s = new EyeCamera(), sea = 1.8, bed = () => 0.6;
  s.update(pose(10, 1.45, 10, 0, 0.3), 1, 1.5, 1 / 60, bed, sea);
  for (let k = 0; k < 120; k++) s.walk({ fwd: 1, side: 0, turn: 0, run: false }, still, 1.5, 1 / 60, bed, sea, inside);
  assert.ok(s.under && s.camera.position.y < sea && s.camera.position.y > 0.6, `swims under the reef's surface: y ${s.camera.position.y.toFixed(2)}`);
});

check('Big animals are framed from further off: a giraffe and an elephant whole, not filling the view', () => {
  // (sizes as drawn: the sprite's own height leaves out a giraffe's neck, so pose.tall carries the model's)
  const away = (h, tall) => { const e = new EyeCamera(); e.update({ ...pose(10, 0, 10, 0, h), tall }, 1, 1.5, 1 / 60, flat); const p = e.camera.position; return Math.hypot(p.x - 10, p.z - 10); };
  const deer = away(0.42, 0.59), elephant = away(0.83, 0.92), giraffe = away(0.73, 1.42), ostrich = away(0.3, 0.76);
  assert.ok(Math.abs(deer - (0.55 + 0.42 * 2.4)) < 1e-6, `a deer as before: ${deer.toFixed(2)}`);
  assert.ok(elephant / 0.92 > deer / 0.59 * 1.2, `an elephant has more room than a deer: ${elephant.toFixed(2)}`);
  assert.ok(giraffe / 1.42 > 3 && ostrich / 0.76 >= 2.6 - 1e-6, `a giraffe ${giraffe.toFixed(2)}, an ostrich ${ostrich.toFixed(2)}`);
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

check('The eye-level sky rides with the eye, inside its far plane, with the weather in it', () => {
  const scene = new THREE.Scene(), sky = new EyeSky(scene), e = new EyeCamera();
  e.update(pose(10, 0, 10, 0), 1, 1.5, 1 / 60, flat);
  assert.ok(SKY_RADIUS < EYE_FAR, 'the dome is never clipped by the far plane');
  const c = new THREE.Color(0.5, 0.6, 0.7);
  const v = { cam: e.camera, forward: e.forward, t: 1, dt: 1 / 60, horizon: c, zenith: c, sunDir: new THREE.Vector3(0, 1, 0), sunCol: c,
    sunLight: 1, sunUp: 1, night: 0, cover: 0, storm: 0, rain: 0, snow: 0, flash: 0, px: 800 };
  sky.update(v);
  assert.ok(sky.dome.visible && sky.dome.position.equals(e.camera.position), 'the dome is centred on the eye');
  assert.ok(!sky.rain.visible && !sky.snow.visible, 'nothing falls on a dry day');
  sky.update({ ...v, rain: 1, storm: 1, flash: 1 });
  assert.ok(sky.rain.visible && sky.u.uFlash.value === 1, 'a thunderstorm rains, and the clouds light up with a flash');
  sky.update({ ...v, snow: 1 });
  assert.ok(sky.snow.visible && !sky.rain.visible, 'snow falls');
  sky.hide();
  assert.ok(!sky.dome.visible && !sky.rain.visible && !sky.snow.visible && sky.flash === 0, 'all of it goes with the usual view');
});

check('A lightning bolt runs from the cloud to the ground where it strikes, with forks', () => {
  for (let k = 0; k < 50; k++) {
    const segs = boltPath(3, 5 + BOLT_TOP, 4, 5, 5, 6);
    const last = segs.filter(s => s[6] === 9).at(-1), first = segs[0];
    assert.ok(Math.abs(first[1] - (5 + BOLT_TOP)) < 1e-9 && first[7] === 0, 'starts at the cloud');
    assert.deepEqual(last.slice(3, 6), [5, 5, 6], 'ends on the strike point');
    assert.ok(segs.some(s => s[6] < 9), 'has forks');
    for (const s of segs) for (const x of s) assert.ok(Number.isFinite(x));
  }
});

check('Lightning strikes only in a thunderstorm, every few seconds, in both views', () => {
  const L = new Lightning(new THREE.Scene()), at = () => ({ x: 4, y: 0, z: 4 });
  let seen = 0;
  for (let k = 0; k < 60 * 30; k++) seen = Math.max(seen, L.update(1 / 60, false, at, 800, 600));
  assert.equal(seen, 0, 'no lightning without a storm');
  assert.ok(!L.mesh.visible);
  let strikes = 0, bolts = 0, prev = 0;
  for (let k = 0; k < 60 * 120; k++) {
    const f = L.update(1 / 60, true, at, 800, 600);
    if (f === 1 && prev < 1) { strikes++; if (L.count) bolts++; }
    prev = f;
  }
  assert.ok(strikes >= 6 && strikes <= 45, `${strikes} flashes in two minutes`);
  assert.ok(bolts >= 3 && bolts < strikes + 1, `${bolts} of them with a bolt`);
  // (a bolt shows for a moment after its strike, then goes)
  L.strike(at()); L.update(0.01, false, at, 800, 600);
  assert.ok(L.mesh.visible && L.mesh.geometry.drawRange.count === L.count * 6);
  for (let k = 0; k < 60; k++) L.update(1 / 60, false, at, 800, 600);
  assert.ok(!L.mesh.visible);
});

console.log(`${checks} watch checks passed`);
