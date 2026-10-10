// node tools/animal-locate-check.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Actors } = await import('../js/render3d/actors.js');
const { Renderer } = await import('../js/render3d/scene.js');
const { focus } = await import('../js/render3d/focus.js');
import { Game } from '../js/game.js';
import { ANIMALS, ANIMAL, drawDef, isMaleVariant } from '../js/data/animals.js';
import { PLANTS } from '../js/data/plants.js';
import { T, LEVEL } from '../js/config.js';
import { mulberry32 } from '../js/rng.js';
Math.random = mulberry32(1987);
let checks = 0, subjects = 0;
const right = new THREE.Vector3(1, 0, 0);
const near = (a, b, msg, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${msg}: ${a} / ${b}`);
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function setup(map = 'sumatra', width = 390, height = 844) {
  const game = new Game(); game.newGame(1987, 'free', 'standard', map); game.speed = 0;
  game.wildlife.agents = []; game.visitors.agents = []; game.residents = [];
  const w = game.world; w.vh.fill(1); w.tree.fill(0); w.shrub.fill(0); w.feature.fill(0); w.struct.fill(-1);
  w.terrain.fill(map === 'reef' ? T.CREEK : T.SOIL);
  const r = Object.create(Renderer.prototype);
  Object.assign(r, { world: w, vw: width, vh: height, zoom: 2.2, az: Math.PI / 4, azTarget: Math.PI / 4,
    target: new THREE.Vector3(), frame: { x: 0.5, y: 0.5 }, v3: new THREE.Vector3(),
    camera: new THREE.OrthographicCamera(-1, 1, 1, -1, -300, 300), sun: new THREE.DirectionalLight(),
    actors: new Actors(new THREE.Scene()) });
  r.centerOn(100, 80);
  return { game, r };
}
function frame(game, r, time = 1) {
  r.actors.followAgent = r.followAgent;
  r.actors.update(game, right, time, r.camera, r.vh);
  r.updateAnimalCamera();
  r.updateFocus(game, 1);
}
function verify(game, r, a, label) {
  const st = r.actors.pose.get(a.id); assert.ok(st?.visible, `${label}: no current pose`);
  const p = r.project(st.center.x, st.center.y, st.center.z);
  near(p.x, r.vw * r.frame.x, `${label}: screen x`); near(p.y, r.vh * r.frame.y, `${label}: screen y`);
  assert.equal(r.pickAgent(game, p.x, p.y), a, `${label}: pick the visible animal`);
  // the marker lies flat under the animal (never over its body), and the foliage opens at the body
  assert.ok(r.actors.ring.visible);
  near(Math.hypot(r.actors.ring.position.x - st.center.x, r.actors.ring.position.z - st.center.z), 0, `${label}: ring under the animal`);
  near(r.actors.ring.position.y, st.base + 0.02, `${label}: ring at its footing`);
  if (ANIMALS[a.sp].move !== 'swim') assert.ok(r.actors.ring.position.y <= st.center.y + 0.03, `${label}: ring at or below the body`); // (a fish is marked at the surface above it)
  near(r.actors.ring.quaternion.angleTo(new r.camera.quaternion.constructor()), 0, `${label}: flat ring`);
  near(focus.uFocus.value.distanceTo(st.center), 0, `${label}: reveal foliage at the body`);
}
function tree(game, a) {
  const p = PLANTS.find(p => p?.layer === 2), i = game.world.idx(Math.floor(a.x), Math.floor(a.y));
  game.world.tree[i] = p.id; game.world.treeG[i] = 1;
}
function dispose(r) {
  for (const p of r.actors.fauna.species.values()) { p.geo.dispose(); p.mat.dispose(); p.mesh.dispose(); }
  r.actors.shadowGeo.dispose(); r.actors.shadowMat.dispose(); r.actors.shadows.dispose();
  r.actors.ring.geometry.dispose(); r.actors.ring.material.dispose();
}
check('Every species, adult variant and juvenile centres on its visible body in portrait and landscape', () => {
  for (const map of ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'reef', 'sumatra']) {
    const { game, r } = setup(map);
    for (const def of ANIMALS) for (const stage of ['adult', ...(def.sprite.male ? ['male'] : []), 'juvenile']) {
      const a = game.wildlife.spawn(def, 30, 30, { silent: true, juvenile: stage === 'juvenile', age: 1000 });
      // Variant selection is deterministic by id; cover both adult looks.
      if (def.sprite.male && stage !== 'juvenile') {
        while (isMaleVariant(def, a) !== (stage === 'male')) a.id++;
      }
      game.wildlife.agents = [a]; game.selectedAgent = a;
      tree(game, a); a.phase = 0.4; a.hd = 1.2;
      const states = def.move === 'fly' ? [false, true] : [false];
      for (const flying of states) {
        a.flying = flying; a.alt = flying ? 1 : 0;
        for (const [width, height] of [[390, 844], [844, 390]]) {
          r.vw = width; r.vh = height; r.az = width > height ? Math.PI / 2 : Math.PI / 4;
          r.centerOn(100, 80); r.followAgent = null; r.actors.followAgent = null;
          r.actors.update(game, right, 1, r.camera, height); // no usable on-screen pose
          r.centerOnAnimal(a); frame(game, r, 4);
          verify(game, r, a, `${map}/${drawDef(def, a).key}/${stage}/${flying}/${width}`);
          subjects++;
        }
      }
    }
    dispose(r);
  }
  console.log(`  ${subjects} species/age/flight/phone-orientation cases checked.`);
});
check('Offscreen orangutans follow fresh canopy heights and moving positions, including paused play', () => {
  const { game, r } = setup(), a = game.wildlife.spawn(ANIMAL.orangutan, 30, 30, { silent: true });
  game.selectedAgent = a; tree(game, a); r.followAgent = a; frame(game, r);
  const original = r.target.y; assert.ok(original > LEVEL + 1);
  a.x += 10; a.y += 4; tree(game, a);
  game.world.treeG[game.world.idx(Math.floor(a.x), Math.floor(a.y))] = 0.6;
  r.az = Math.PI; frame(game, r, 2); verify(game, r, a, 'moving orangutan'); assert.ok(r.target.y < original);
  // Removing the tree also moves the anchor to the newly rendered position.
  game.world.tree[game.world.idx(Math.floor(a.x), Math.floor(a.y))] = 0;
  frame(game, r, 3); verify(game, r, a, 'orangutan without a tree'); assert.ok(r.target.y < LEVEL + 1);
  game.wildlife.agents = []; frame(game, r, 4); assert.equal(r.actors.ring.visible, false);
  dispose(r);
});
check('Swimming and leaping fish follow current rendered depths rather than the riverbed', () => {
  const { game, r } = setup('pnw'), a = game.wildlife.spawn(ANIMAL.coho, 30, 30, { silent: true });
  game.world.terrain[game.world.idx(30, 30)] = T.CREEK; game.selectedAgent = a; r.followAgent = a;
  const heights = [];
  for (let k = 0; k < 40; k++) { frame(game, r, k * 0.1); verify(game, r, a, `salmon/${k}`); heights.push(r.target.y); }
  assert.ok(Math.max(...heights) - Math.min(...heights) > 0.5);
  dispose(r);
});
check('Panning and zooming away from a canopy animal do not jump down to its ground tile', () => {
  const { game, r } = setup(), a = game.wildlife.spawn(ANIMAL.orangutan, 30, 30, { silent: true });
  game.selectedAgent = a; tree(game, a); r.followAgent = a; frame(game, r);
  const centre = r.actors.pose.get(a.id).center.clone(); r.followAgent = null;
  const before = r.project(centre.x, centre.y, centre.z); r.panBy(20, 10);
  const after = r.project(centre.x, centre.y, centre.z);
  near(after.x - before.x, 20, 'pan x', 0.01); near(after.y - before.y, 10, 'pan y', 0.01);
  r.centerOnAnimal(a); frame(game, r, 2);
  const point = r.screenToTile(110, 200); r.zoomAt(110, 200, 1.1);
  const anchored = r.project(point.fx, r.heightAtScene(point.fx, point.fy), point.fy);
  near(anchored.x, 110, 'zoom anchor x', 0.01); near(anchored.y, 200, 'zoom anchor y', 0.01);
  dispose(r);
});
console.log(`${checks} animal locate checks passed.`);
