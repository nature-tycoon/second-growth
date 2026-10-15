import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { createFrameLoop } = await import('../js/frame-loop.js');
const { withoutVegetation, renderObjectCounts, PerformancePhases, FrameCpuStats, CPU_STAGES, GpuTimer, weakGpu } = await import('../js/performance.js');
const { Renderer } = await import('../js/render3d/scene.js');
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
check('Built-in graphics that struggle on High are recognised, and capable chips are not', () => {
  for (const name of ['ANGLE (Intel, Intel(R) HD Graphics 620 (0x00005916) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'ANGLE (Intel, Intel(R) UHD Graphics (0x000046D0) Direct3D11',
    'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)', 'ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11', 'AMD Radeon R3 Graphics (stoney LLVM 15.0.7)']) assert.ok(weakGpu(name), name);
  for (const name of [null, 'Apple GPU', 'ANGLE (Intel, Intel(R) Graphics (0x00007D67) Direct3D11', 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11',
    'ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11', 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650']) assert.ok(!weakGpu(name), name);
});
check('The GPU timer times every Nth frame, never waits on an unfinished result and drops disjoint spells', () => {
  const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 }, queries = new Map(); let id = 0, disjoint = false, began = 0;
  const gl = { QUERY_RESULT_AVAILABLE: 3, QUERY_RESULT: 4, getExtension: () => ext,
    createQuery: () => { const q = ++id; queries.set(q, { ready: false, ns: 0 }); return q; }, deleteQuery: q => queries.delete(q),
    beginQuery: () => { began++; }, endQuery() {}, getParameter: p => p === ext.GPU_DISJOINT_EXT && disjoint,
    getQueryParameter: (q, p) => p === gl.QUERY_RESULT_AVAILABLE ? queries.get(q).ready : queries.get(q).ns };
  const t = new GpuTimer(gl, 3), frame = () => { t.poll(); t.begin(); t.end(); };
  for (let k = 0; k < 9; k++) frame();
  assert.equal(began, 3, 'one frame in three'); assert.equal(t.sample(false).gpu_frames, 0, 'nothing recorded before the chip finishes');
  for (const q of queries.values()) { q.ready = true; q.ns = 4e6; }
  frame(); assert.deepEqual(t.sample(), { gpu_frames: 3, gpu_frame_ms: 4, gpu_frame_p95_ms: 4 });
  assert.equal(queries.size, 0, 'finished queries are released');
  for (let k = 0; k < 3; k++) frame();
  disjoint = true; frame(); assert.equal(t.sample().gpu_frames, 0, 'timings across a disjoint spell are dropped'); assert.equal(queries.size, 0);
  assert.deepEqual(new GpuTimer({ getExtension: () => null }).sample(), { gpu_frames: 0, gpu_frame_ms: null, gpu_frame_p95_ms: null }, 'no timer extension: reported as unknown');
});
check('Analytics CPU summaries include means and p95 for every phase across the whole sample window', () => {
  const stats = new FrameCpuStats();
  for (let n = 1; n <= 20; n++) stats.record({ timings: { simulation: n, render: n * 2, interface: n / 2 } });
  const expected = { cpu_frames: 20, cpu_simulation_ms: 10.5, cpu_simulation_p95_ms: 20,
    cpu_render_ms: 21, cpu_render_p95_ms: 40, cpu_interface_ms: 5.3, cpu_interface_p95_ms: 10 };
  assert.deepEqual(stats.sample(false), expected); assert.deepEqual(stats.sample(false), expected);
  assert.deepEqual(stats.sample(), expected);
  assert.deepEqual(stats.sample(false), { cpu_frames: 0, cpu_simulation_ms: null, cpu_simulation_p95_ms: null,
    cpu_render_ms: null, cpu_render_p95_ms: null, cpu_interface_ms: null, cpu_interface_p95_ms: null });
  stats.record({ timings: { simulation: 9, render: 8, interface: 0 } });
  assert.equal(stats.sample(false).cpu_simulation_ms, 9); assert.equal(stats.sample(false).cpu_interface_p95_ms, 0);
});
check('CPU summaries retain long stalls, accept zero work and ignore incomplete or invalid timings', () => {
  const stats = new FrameCpuStats();
  for (let n = 0; n < 100; n++) stats.record({ timings: { simulation: n < 95 ? 0 : 4000.06, render: 0, interface: 0 } });
  for (const simulation of [-1, NaN, Infinity, undefined]) stats.record({ timings: { simulation, render: 0, interface: 0 } });
  stats.record({}); stats.record({ timings: { simulation: 3 } });
  const sample = stats.sample(false);
  assert.equal(sample.cpu_frames, 100); assert.equal(sample.cpu_simulation_ms, 200);
  assert.equal(sample.cpu_simulation_p95_ms, 4000.1); assert.equal(sample.cpu_render_ms, 0);
  assert.equal(stats.stages[0].bins.size, 2, 'equal durations share a bin rather than retain per-frame objects');
});
check('Normal frame timing measures thrown work without counting frame-cap waits as CPU time', () => {
  const stats = new FrameCpuStats(); let now = 0, simulated;
  const frame = createFrameLoop({ now: 0, targetFps: () => 30, requestFrame: () => {}, clock: () => now,
    onError: () => {}, onFrame: sample => stats.record(sample), steps: [
      ['simulation', dt => { simulated = dt; now += 2; throw new Error('tick'); }],
      ['input', () => { now += 1; }], ['render', () => { now += 8; }], ['interface', () => { now += 3; }],
    ] });
  frame(10); assert.equal(stats.frames, 0, 'throttled refresh is not a measured frame');
  frame(2000); const s = stats.sample(false);
  assert.equal(simulated, .1); assert.equal(s.cpu_frames, 1);
  assert.equal(s.cpu_simulation_ms, 2); assert.equal(s.cpu_render_ms, 8); assert.equal(s.cpu_interface_ms, 3);
});
check('Renderer exports CPU fields, including the draw call, through perfSample and excludes hidden/resume frames', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { hidden: false };
  try {
    const r = Object.assign(Object.create(Renderer.prototype), {
      cpuPerf: new FrameCpuStats([...CPU_STAGES, 'submit']), submitMs: 1.5, gl: { info: { render: { triangles: 10, calls: 2 } } }, sun: { castShadow: true }, gpuName: () => 'test',
      flora: { plantView: { stats: {} }, geometryIndex: { stats: {} }, plantShadows: { stats: {} } },
    });
    const sample = { timings: { simulation: 1, render: 2, interface: 3 } };
    r.recordCpuFrame(sample); document.hidden = true; r.recordCpuFrame(sample);
    document.hidden = false; r.recordCpuFrame(sample); r.recordCpuFrame(sample);
    const peek = r.perfSample(false); assert.equal(peek.cpu_frames, 2); assert.equal(peek.cpu_render_p95_ms, 2);
    assert.equal(peek.cpu_submit_ms, 1.5, 'the gl.render share of render is reported on its own');
    assert.equal(r.perfSample().cpu_frames, 2); assert.equal(r.perfSample(false).cpu_frames, 0);
    assert.equal(peek.draw_calls, 2, 'existing performance payload remains available');
  } finally { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; }
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
