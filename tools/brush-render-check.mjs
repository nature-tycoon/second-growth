// Continuous paid brush strokes must become visible while the pointer is still down.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { Renderer } = await import('../js/render3d/scene.js');
const { Flora } = await import('../js/render3d/flora.js');
const { Game } = await import('../js/game.js');
const { ToolActions } = await import('../js/tool-actions.js');
const { BORDER, T } = await import('../js/config.js');

let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
function samePlants(a, b) {
  for (const key of new Set([...a.pools.keys(), ...b.pools.keys()])) {
    const pa = a.pools.get(key), pb = b.pools.get(key);
    for (const region of new Set([...(pa?.subs.keys() || []), ...(pb?.subs.keys() || [])])) {
      const x = pa?.subs.get(region), y = pb?.subs.get(region);
      assert.equal(x?.n || 0, y?.n || 0, key + ' count');
      if (!x?.n) continue;
      assert.deepEqual(x.mesh.instanceMatrix.array.slice(0, x.n * 16), y.mesh.instanceMatrix.array.slice(0, y.n * 16), key + ' placement');
      assert.deepEqual(x.mesh.instanceColor.array.slice(0, x.n * 3), y.mesh.instanceColor.array.slice(0, y.n * 3), key + ' colour');
    }
  }
}
function fixture(light, speed = 0) {
  const game = new Game(); game.newGame(1987, 'free', 'standard', 'pnw');
  game.money = 1e9; game.speed = speed;
  const w = game.world;
  for (let y = 50; y < 60; y++) for (let x = 65; x < 100; x++) {
    const i = w.idx(x, y);
    w.clearPlants(i); w.terrain[i] = T.MUD; w.feature[i] = 0; w.struct[i] = -1;
  }
  const flora = new Flora(new THREE.Scene(), { catalog: game.catalog });
  flora.setLight(light); flora.rebuild(game, true);
  const paints = [];
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    world: w, flora, light, lastFlora: 1000, lastSurface: 1000, lastDay: game.day,
    syncStructures() {},
    terrain: { hv: w.hv, refreshWater() {}, refreshFlood() {},
      updateHeights() { this.hv = w.hv; },
      updateSurface(g, patch) { paints.push(patch ? { ...patch } : null); },
      // (a day's repaint in four bands of rows, as the real terrain does within a world)
      dayBands() { return [0, 1, 2, 3].map(k => ({ x0: 0, y0: k * w.h / 4, x1: w.w - 1, y1: (k + 1) * w.h / 4 - 1, band: k })); },
    },
  });
  const actions = new ToolActions(game, { refreshEnvironment: false });
  const stroke = actions.begin('boardwalk');
  const paint = (x, y) => {
    assert.equal(actions.paint(stroke, x, y, 0).length, 1, 'the paid action changed a tile');
    renderer.markTileDirty(x, y);
  };
  const visible = (x, y) => {
    const cache = flora.tileCache[(y + BORDER) * (w.w + BORDER * 2) + x + BORDER];
    return cache.pools.slice(0, cache.n).includes(flora.pools.get('boardwalk'));
  };
  return { game, renderer, flora, paints, paint, visible };
}

for (const [light, fps] of [[true, 30], [false, 60]]) for (const speed of [0, 1, 3]) {
  check(`${light ? 'Fast / phone' : 'Full / Mac'}, speed ${speed}: brush edits appear on the next frame throughout a stroke`, () => {
    const { game, renderer: r, flora, paints, paint, visible } = fixture(light, speed);
    for (let frame = 0; frame < 18; frame++) {
      const x = 70 + frame, y = 55;
      paint(x, y); r.refreshWorld(game, false, 1000 + (frame + 1) * 1000 / fps);
      assert.equal(paints.length, frame + 1, 'ground updates without the growth cooldown');
      assert.ok(paints.at(-1), 'only the edited ground patch is repainted');
      assert.ok(visible(x, y), 'the latest boardwalk is drawn before the stroke ends');
      assert.ok(flora.lastRebuild.regions <= 1, 'the per-frame plant budget is retained');
    }
  });
}

check('Painting jumps ahead of seasonal growth, drains neighbouring regions and matches a full rebuild', () => {
  const { game, renderer: r, flora, paint, visible } = fixture(true, 3);
  game.day += 30;
  assert.ok(flora.rebuild(game, false, 1), 'a season has queued distant regions');
  r.floraPending = true;
  paint(80, 55); r.refreshWorld(game, false, 1033);
  assert.ok(visible(80, 55), 'the edited region goes ahead of the season queue');
  assert.ok(flora.waitingRegions?.size, 'background growth retains its work budget');
  paint(79, 55); r.refreshWorld(game, false, 1066);
  assert.ok(visible(79, 55), 'a stroke crossing back over a region boundary stays responsive');
  let frame = 0;
  while (r.floraPending && frame < 50) r.refreshWorld(game, false, 1100 + frame++ * 33);
  assert.ok(frame < 50, 'the queue completes after the brush stops');
  assert.equal(flora.editRegions.size, 0, 'edited neighbours have caught up');
  const full = new Flora(new THREE.Scene(), { catalog: game.catalog });
  full.setLight(true); full.rebuild(game, true);
  samePlants(flora, full);
});

check('A stroke completion repaints spread-out ecology immediately, even just after a plant update', () => {
  const { game, renderer: r, paints, paint, visible } = fixture(true);
  paint(75, 55); r.refreshWorld(game, false, 1033);
  assert.ok(visible(75, 55));
  r.markTileDirty(); r.refreshWorld(game, false, 1066);
  assert.equal(paints.at(-1), null, 'completion refreshes the whole ground');
  assert.equal(r.editDirty, false);
  assert.equal(r.floraEditPending, false);
});

check('Reshaping strokes retain the plant budget and finish with the same geometry as a full rebuild', () => {
  const { game, renderer: r, flora } = fixture(true);
  const actions = new ToolActions(game, { refreshEnvironment: false });
  actions.apply('log', [game.world.idx(75, 55)]);
  flora.rebuild(game, true);
  const stroke = actions.begin('raise');
  for (let frame = 0; frame < 12; frame++) {
    const x = 70 + frame, y = 55;
    assert.equal(actions.paint(stroke, x, y, 0).length, 1);
    r.markTileDirty(x, y); r.refreshWorld(game, false, 1033 + frame * 33);
    assert.equal(flora.lastRebuild.regions, 1, 'height edits do not rebuild the whole forest in one frame');
  }
  let frame = 0;
  while (r.floraPending && frame < 50) r.refreshWorld(game, false, 1500 + frame++ * 33);
  assert.ok(frame < 50);
  const full = new Flora(new THREE.Scene(), { catalog: game.catalog });
  full.setLight(true); full.rebuild(game, true);
  samePlants(flora, full);
});

check('Daily growth still waits for its normal cooldown when the player is not editing', () => {
  const { game, renderer: r, flora, paints } = fixture(true, 3);
  const initial = flora.lastRebuild;
  game.day++;
  r.refreshWorld(game, false, 1033); r.refreshWorld(game, false, 1066);
  assert.equal(paints.length, 0);
  assert.equal(flora.lastRebuild, initial, 'growth does not rebuild on every frame');
  r.refreshWorld(game, false, 2201);
  assert.equal(paints.length, 1, 'ground refreshes at its existing growth cadence');
  assert.equal(paints[0].band, 0, 'a day repaints the ground a band at a time');
  assert.equal(flora.lastRebuild, initial, 'ground and background plants use different frames');
  for (let k = 1; k < 4; k++) {
    r.refreshWorld(game, false, 2201 + k * 33);
    assert.equal(paints.at(-1).band, k, 'the next band follows on the next frame, without a cooldown');
    assert.equal(flora.lastRebuild, initial, 'plants wait for the ground to finish');
  }
  r.refreshWorld(game, false, 2366);
  assert.equal(paints.length, 4, 'the ground is done');
  assert.notEqual(flora.lastRebuild, initial, 'plants then catch up');
});

console.log(`${checks} brush rendering checks passed.`);
