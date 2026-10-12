import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { createFrameLoop } = await import('../js/frame-loop.js');
const { withoutVegetation, renderObjectCounts, PerformancePhases } = await import('../js/performance.js');
const { performanceFixture, ecosystemCounts } = await import('./performance-fixtures.mjs');
let checks = 0;
function check(label, fn) { fn(); console.log('PASS ' + label); checks++; }
check('Frame probes retain uncapped visible stalls and measure phases without changing simulated time', () => {
  let time = 0, dt, record;
  const frame = createFrameLoop({ now: 0, targetFps: () => 60, requestFrame: () => {}, clock: () => time,
    onFrameStart: () => { time = 0; },
    steps: [['simulation', value => { dt = value; time += 3; }], ['render', () => { time += 5; }]], onFrame: s => { record = s; } });
  frame(1500); assert.equal(dt, .1); assert.equal(record.interval, 1500); assert.equal(record.work, 8);
  assert.deepEqual(record.timings, { simulation: 3, render: 5 });
  createFrameLoop({ now: 0, targetFps: () => 60, requestFrame: () => {}, clock: () => { throw new Error('Disabled diagnostics measured time'); }, steps: [] })(20);
});
check('Vegetation isolation hides view and shadow batches, retains scenery, and restores visibility after errors', () => {
  const mesh = visible => ({ visible }), plant = { subs: new Map() }, fence = { subs: new Map() };
  const source = { mesh: mesh(true), proxy: mesh(false), viewShadow: mesh(true) }, feature = mesh(true);
  plant.subs.set(0, source); fence.subs.set(0, { mesh: feature });
  const view = mesh(true), shadow = mesh(true), canopy = mesh(true), dots = mesh(true), dotPool = { subs: new Map([[0, { mesh: dots }]]) };
  const flora = { pools: new Map([['crown:fir', plant], ['fencepost', fence], ['dot', dotPool]]),
    plantView: { batches: new Map([[plant, { mesh: view }]]) }, plantShadows: { batches: new Map([[plant, { mesh: shadow }]]) }, canopyPools: new Map([[0, { mesh: canopy }]]) };
  assert.throws(() => withoutVegetation(flora, () => {
    for (const m of [source.mesh, source.proxy, source.viewShadow, view, shadow, canopy, dots]) assert.equal(m.visible, false);
    assert.equal(feature.visible, true); throw new Error('Draw failed');
  }), /Draw failed/);
  assert.equal(source.proxy.visible, false);
  for (const m of [source.mesh, source.viewShadow, view, shadow, canopy, feature, dots]) assert.equal(m.visible, true);
  withoutVegetation(flora, () => assert.equal(dots.visible, true), true);
});
check('Scene counts distinguish meshes, visible meshes and instance populations', () => {
  const scene = new THREE.Scene(), hidden = new THREE.Group(); hidden.visible = false; scene.add(hidden);
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  scene.add(new THREE.InstancedMesh(geometry, material, 100)); hidden.add(new THREE.Mesh(geometry, material));
  assert.deepEqual(renderObjectCounts(scene), { meshes: 2, visibleMeshes: 1, instances: 100 });
});
check('Scoped CPU probes restore original methods, preserve arguments and record thrown work', () => {
  const fail = () => { throw new Error('Tick'); }, noop = () => 7;
  const game = { dailyTick: fail, wildlife: { update: noop } }, renderer = { flora: { rebuild: noop, updateView: noop, syncShadows: noop, updateShadows: noop }, terrain: { updateSurface: noop }, actors: { update: noop } };
  const probe = new PerformancePhases(game, renderer);
  assert.throws(() => game.dailyTick(), /Tick/); assert.equal(game.wildlife.update(), 7); assert.equal(probe.calls.daily, 1);
  probe.reset(); assert.deepEqual(probe.times, {}); probe.dispose(); assert.equal(game.dailyTick, fail); assert.equal(game.wildlife.update, noop);
});
for (const map of ['pnw', 'amazon', 'serengeti']) check(map + ': density fixtures are nested and repeatable, with active wildlife and surrounding vegetation', () => {
  let previous;
  for (const [density, animals] of [['low', 24], ['medium', 96], ['high', 256]]) {
    const fixture = performanceFixture(map, density), counts = ecosystemCounts(fixture.game);
    assert.equal(counts.animals, animals);
    if (previous) {
      for (const key of ['trees', 'shrubs', 'groundcover', 'borderTrees']) assert.ok(counts[key] >= previous.counts[key]);
      for (const field of ['tree', 'shrub', 'ground']) for (let i = 0; i < previous.world[field].length; i++) {
        if (previous.world[field][i]) assert.equal(fixture.game.world[field][i], previous.world[field][i]);
      }
    }
    assert.ok(fixture.game.wildlife.agents.some(a => a.wait < 1000), 'Wildlife is not a frozen model gallery');
    previous = { counts, world: fixture.game.world };
  }
  assert.deepEqual(ecosystemCounts(performanceFixture(map, 'high').game), previous.counts);
});
console.log(`${checks} performance diagnostics checks passed.`);
