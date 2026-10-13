import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { ANIMAL } from '../js/data/animals.js';
import { passable } from '../js/sim/animals.js';
import { mulberry32 } from '../js/rng.js';
Math.random = mulberry32(1987);
const game = new Game();
game.newGame(1987, 'free', 'standard', 'reef');
const wl = game.wildlife, w = game.world;
wl.agents = []; wl.ids.clear(); wl.recount();
w.struct.fill(-1); w._shore = new Uint8Array(w.n);
const land = (x, y) => { w._shore[w.idx(x, y)] = 1; };
const manta = (x = 30.5, y = 30.5) => {
  const a = wl.spawn(ANIMAL.manta, Math.floor(x), Math.floor(y), { silent: true });
  Object.assign(a, { x, y, wait: 100, hunger: 0 }); return a;
};
const reset = () => { wl.agents = []; wl.ids.clear(); wl.recount(); w._shore.fill(0); };
let checks = 0;
function check(name, fn) { reset(); fn(); checks++; console.log('PASS ' + name); }
check('Manta departure routes go around the cay', () => {
  for (let y = 28; y <= 32; y++) for (let x = 32; x <= 36; x++) land(x, y);
  const a = manta(); Object.assign(a, { leaving: true, state: 'leave', tx: w.w + 3, ty: a.y });
  wl.leaveRoute(a);
  assert(a.path?.length > 0);
  assert(a.path.every(j => passable(w, j, a)), 'Departure path must never traverse the cay');
  for (let frame = 0; frame < 3000 && wl.ids.has(a.id); frame++) {
    wl.update(0.05);
    if (w.inb(Math.floor(a.x), Math.floor(a.y))) assert(passable(w, w.idx(Math.floor(a.x), Math.floor(a.y)), a));
  }
  assert(!wl.ids.has(a.id), 'Ray must still be able to leave');
});
check('A short direct step without a swimming heading cannot enter land', () => {
  land(31, 30); const a = manta(30.95, 30.5); a.hd = null;
  wl.stepToward(a, 31.05, 30.5, 0.2);
  assert(a.x < 31);
});
check('Turning and gliding cannot cut a dry diagonal corner', () => {
  land(31, 30); land(30, 31);
  for (const move of ['step', 'swim', 'glide']) {
    const a = manta(30.95, 30.95); a.hd = Math.PI / 4; a.spd = 2; a.path = [w.idx(31, 31)];
    if (move === 'step') wl.stepToward(a, 31.5, 31.5, 0.1);
    else if (move === 'swim') wl.swimToward(a, w.idx(31, 31), 0.1, 0.05);
    else wl.glide(a, 0.05);
    assert(a.x < 31 && a.y < 31, move + ' must respect the blocked corner');
  }
});
check('A fast movement cannot jump across land into water beyond it', () => {
  land(31, 30); const a = manta(); a.hd = 0; a.spd = 10;
  wl.glide(a, 0.3);
  assert(a.x < 31);
});
check('An already-beached ray recovers into water without duplicating it', () => {
  for (const leaving of [false, true]) {
    reset();
    for (let y = 29; y <= 31; y++) for (let x = 29; x <= 31; x++) land(x, y);
    const a = manta(), id = a.id;
    if (leaving) wl.leave(a);
    const pop = wl.state[a.sp].pop;
    wl.update(0); assert.equal(a.x, 30.5); assert.equal(a.y, 30.5);
    wl.update(0.05);
    assert(passable(w, w.idx(Math.floor(a.x), Math.floor(a.y)), a));
    assert.equal(a.leaving, leaving);
    assert.equal(wl.agents.length, 1); assert.equal(a.id, id); assert.equal(wl.state[a.sp].pop, pop);
  }
});
check('A beached ray in a saved real reef recovers after loading', () => {
  const loadedGame = new Game(); loadedGame.newGame(1987, 'free', 'standard', 'reef');
  loadedGame.wildlife.agents = []; loadedGame.wildlife.ids.clear(); loadedGame.wildlife.recount();
  const world = loadedGame.world;
  const j = world.terrain.findIndex((_, i) => !passable(world, i, ANIMAL.manta) && world.struct[i] < 0);
  assert(j >= 0, 'Generated reef has a cay');
  const ray = loadedGame.wildlife.spawn(ANIMAL.manta, j % world.w, j / world.w | 0, { silent: true });
  ray.x = j % world.w + 0.5; ray.y = (j / world.w | 0) + 0.5;
  const id = ray.id;
  assert(loadedGame.restoreSave(loadedGame.saveData()));
  loadedGame.wildlife.update(0.05);
  const recovered = loadedGame.wildlife.ids.get(id), loadedWorld = loadedGame.world;
  assert(recovered && passable(loadedWorld, loadedWorld.idx(Math.floor(recovered.x), Math.floor(recovered.y)), recovered));
  assert.equal(loadedGame.wildlife.agents.length, 1);
});
console.log(checks + ' reef shoreline movement checks passed.');
