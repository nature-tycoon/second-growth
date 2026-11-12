// Performance guard: counts what a frame would draw, in node, with no GPU. Fails when a count
// rises more than 10% over tools/perf-guard-baseline.json; timings only warn.
//   node tools/perf-guard-check.mjs [maps] [--update]
// For each map: the seeded 'high' ecosystem fixture (performance-fixtures.mjs: every plant, 256
// animals), its plants and animals built into a three.js scene, in the fixture's month and half a
// year on (flowers and fruit are seasonal models), then three views of the map's middle at
// 1440x900 (wide 0.25, play 0.7, close 2: the play-profile zooms). Per view it walks the scene the
// way three.js builds its render list (visible, in the camera's frustum, instances > 0) and adds up
// draw calls and triangles (index count / 3 x instances), for the main view and the sun's shadow
// pass. Also: whole-map instances per plant model kind, animals drawn per pool at play zoom, and
// plant regions rebuilt over 100 frames at top speed. Counts are exact run to run; GPU, processor
// and machine don't change them. Timings (game.update, a full Flora.rebuild, Actors.update) only warn.
// It can't see: terrain, water, sky, buildings, particles, post-processing, pixel cost (overdraw,
// fragment shaders, resolution), the shadow map's own culling beyond the sun's frustum, or
// anything the ui draws. A fix that makes shaders slower passes here; play-profile measures that.
// --update writes the baseline. A rise is accepted by committing the new baseline with the change.
// GUARD_ROOT=<checkout> measures another checkout's code; GUARD_BASELINE=<file> reads or writes another baseline;
// GUARD_MONTHS=0,6 the months after the fixture's to measure.
import { register } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
register('./three-loader.mjs', import.meta.url);
const root = pathToFileURL(resolve(process.env.GUARD_ROOT || fileURLToPath(new URL('..', import.meta.url))) + '/').href;
const THREE = await import('three');
const { Flora } = await import(root + 'js/render3d/flora.js');
const { Actors } = await import(root + 'js/render3d/actors.js');
const { performanceFixture } = await import(root + 'tools/performance-fixtures.mjs');
const { mulberry32 } = await import(root + 'js/rng.js');
const CONFIG = await import(root + 'js/config.js'), { LEVEL } = CONFIG;

const args = process.argv.slice(2), update = args.includes('--update');
const MAPS = (args.find(a => !a.startsWith('--')) || 'pnw,amazon,serengeti,sumatra,atlanta,chinandega,reef').split(',');
const BASELINE = process.env.GUARD_BASELINE ? resolve(process.env.GUARD_BASELINE) : fileURLToPath(new URL('./perf-guard-baseline.json', import.meta.url));
const RISE = 0.10, TIME_WARN = 2.5;
// (a rise must also be this large to count: a pool of 12 gaining 2 isn't a slowdown)
const FLOOR = { triangles: 5000, draws: 3, animals: 10, plantRegions: 3, plantTilesWorked: 200, instances: 100 };
const VW = 1440, VH = 900, BASE_PPU = 46, EL = THREE.MathUtils.degToRad(34), AZ = Math.PI / 4;
const VIEWS = [['wide', 0.25], ['play', 0.7], ['close', 2]];
const SEASONS = (process.env.GUARD_MONTHS || '0,6').split(',').map(Number);

// The game's camera (Renderer.updateCamera) and sun shadow box (fitShadow), without a renderer.
function aim(camera, sun, target, zoom) {
  const hw = VW / 2 / (BASE_PPU * zoom), hh = VH / 2 / (BASE_PPU * zoom);
  Object.assign(camera, { left: -hw, right: hw, top: hh, bottom: -hh });
  camera.position.copy(target).add(new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL)).multiplyScalar(120));
  camera.up.set(0, 1, 0); camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const s = Math.max(hw, hh) * 1.35 + 3, sc = sun.shadow.camera;
  Object.assign(sc, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 160 }); sc.updateProjectionMatrix();
  sun.position.copy(target).add(new THREE.Vector3(-30, 55, 20)); sun.target.position.copy(target);
  sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
  sun.shadow.updateMatrices(sun);
  return new THREE.Vector3(Math.cos(AZ), 0, -Math.sin(AZ));
}
const frustumOf = cam => new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));

// What three.js's render list would hold: one draw per visible mesh (per material group),
// triangles = indexed (or plain) vertices / 3, times its instances.
function tally(scene, frustum, shadowPass) {
  let draws = 0, triangles = 0;
  const sphere = new THREE.Sphere();
  (function walk(o) {
    if (!o.visible) return;
    if (o.isMesh && (!shadowPass || o.castShadow)) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      // (shadow-only casters, plant-view.js skipMainDraw, zero their count in the main pass)
      const mainSkip = !shadowPass && (o.onBeforeRender?.toString().includes('count = 0') || mats.every(m => m.colorWrite === false));
      const n = o.isInstancedMesh ? o.count : 1, g = o.geometry;
      if (!mainSkip && n > 0 && mats.some(m => m.visible) && g) {
        let inView = true;
        if (o.frustumCulled) {
          if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); sphere.copy(o.boundingSphere); }
          else { if (!g.boundingSphere) g.computeBoundingSphere(); sphere.copy(g.boundingSphere); }
          inView = frustum.intersectsSphere(sphere.applyMatrix4(o.matrixWorld));
        }
        if (inView) {
          const verts = Math.min(g.index ? g.index.count : g.attributes.position.count, g.drawRange.count);
          draws += Array.isArray(o.material) ? Math.max(1, g.groups.length) : 1;
          triangles += Math.floor(verts / 3) * n;
        }
      }
    }
    for (const c of o.children) walk(c);
  })(scene);
  return { draws, triangles };
}

// Drawing draws on Math.random too (three.js gives every new geometry a random id), so a new
// model would shift the seeded simulation; drawing gets its own stream.
function drawing(fn) {
  const sim = Math.random; Math.random = drawRandom;
  try { return fn(); } finally { Math.random = sim; }
}
let drawRandom;

function measure(map) {
  Math.random = mulberry32(1987); drawRandom = mulberry32(7);
  const fixture = performanceFixture(map, 'high'), game = fixture.game;
  const scene = new THREE.Scene(), flora = drawing(() => new Flora(scene, { catalog: game.catalog })), actors = drawing(() => new Actors(scene, flora));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -300, 300), sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true; scene.add(sun, sun.target);
  const [cx, cy] = fixture.center, w = game.world;
  const target = new THREE.Vector3(cx, w.heightAt(cx, cy) * LEVEL, cy);
  const out = { counts: {}, timings: {} };
  const day0 = game.day, { DAYS_PER_MONTH } = CONFIG;
  let t, actorsMs = 0, time = 10, frames = 0;
  // (each season's flowers and fruit are their own models: the fixture's month and half a year on)
  for (const months of SEASONS) {
    game.day = day0 + months * DAYS_PER_MONTH;
    const season = `m${game.month}`;
    t = performance.now(); drawing(() => flora.rebuild(game, true));
    if (!months) out.timings.floraRebuildMs = performance.now() - t;
    // whole-map plant instances this season, by model kind (the pool key up to its first ':')
    const kinds = {};
    for (const [key, pool] of flora.pools) {
      const kind = key.split(':')[0];
      for (const p of pool.subs.values()) kinds[kind] = (kinds[kind] || 0) + p.n;
    }
    for (const k of Object.keys(kinds).sort()) if (kinds[k]) out.counts[`instances.${season}.plants.${k}`] = kinds[k];
    scene.updateMatrixWorld(true);
    for (const [name, zoom] of VIEWS) {
      const view = `${season}.${name}`;
      flora.setZoom(zoom);
      const right = aim(camera, sun, target, zoom);
      for (let f = 0; f < 3; f++) { // (the first frame places them; later frames are steady)
        t = performance.now(); drawing(() => actors.update(game, right, time += 1 / 60, camera, VH)); actorsMs += performance.now() - t; frames++;
      }
      drawing(() => { flora.syncShadows(); flora.updateView(camera); flora.updateShadows(sun, camera); });
      scene.updateMatrixWorld(true);
      const main = tally(scene, frustumOf(camera), false), shadow = tally(scene, frustumOf(sun.shadow.camera), true);
      Object.assign(out.counts, { [`${view}.draws`]: main.draws, [`${view}.triangles`]: main.triangles,
        [`${view}.shadowDraws`]: shadow.draws, [`${view}.shadowTriangles`]: shadow.triangles });
      // animals drawn in this view, by pool: detailed, distant (far) and close-up models
      let drawn = 0;
      for (const [key, p] of actors.fauna.species) for (const [part, q] of [['', p], ['.far', p.far], ['.close', p.close]]) {
        if (!q?.count) continue;
        drawn += q.count;
        if (name === 'play' && !months) out.counts[`instances.play.animals.${key}${part}`] = q.count;
      }
      out.counts[`${view}.animals`] = drawn;
    }
  }
  out.timings.actorsUpdateMs = actorsMs / frames;
  game.day = day0; drawing(() => flora.rebuild(game, true));
  // 100 frames at top speed (about 13 days). The live loop spreads plant rebuilds a region at a
  // time over a 4 ms budget (scene.js); here every changed region is rebuilt each frame, so the
  // count is how much plant redrawing the days cause, not how the budget timed it.
  game.speed = 3; let regions = 0, tiles = 0, updateMs = 0;
  for (let f = 0; f < 100; f++) {
    const u = performance.now(); game.update(1 / 60); updateMs += performance.now() - u;
    let more = true;
    while (more) {
      more = drawing(() => flora.rebuild(game, false, 1));
      if (flora.lastRebuild.regions) { regions += flora.lastRebuild.regions; tiles += flora.lastRebuild.worked || 0; }
    }
  }
  out.counts['frames100.plantRegions'] = regions; out.counts['frames100.plantTilesWorked'] = tiles;
  out.timings.gameUpdateMs = updateMs / 100;
  out.days = game.day;
  return out;
}

const started = performance.now(), results = {};
for (const map of MAPS) {
  const t = performance.now(); results[map] = measure(map);
  console.log(`${map}: measured in ${((performance.now() - t) / 1000).toFixed(1)}s`);
}
const round = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(2)]));
if (update) {
  const old = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { maps: {} };
  for (const map of MAPS) old.maps[map] = { counts: results[map].counts, timings: round(results[map].timings) };
  old.note = 'Written by node tools/perf-guard-check.mjs --update. Counts are exact; timings are from one machine and only warn.';
  writeFileSync(BASELINE, JSON.stringify(old, null, 1) + '\n');
  console.log('Baseline written: ' + BASELINE);
} else {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')).maps;
  const failures = [], drops = [];
  for (const map of MAPS) {
    const b = base[map];
    if (!b) { failures.push(`${map}: no baseline (run with --update)`); continue; }
    const now = results[map].counts;
    for (const key of new Set([...Object.keys(b.counts), ...Object.keys(now)])) {
      const was = b.counts[key] ?? 0, is = now[key] ?? 0, floor = key.startsWith('instances.') ? FLOOR.instances
        : FLOOR[key.split('.').at(-1).replace(/^shadow(\w)/, (_, c) => c.toLowerCase())] ?? FLOOR.instances;
      if (is > was * (1 + RISE) && is - was >= floor) failures.push(`${map} ${key}: ${was} -> ${is} (+${was ? ((is / was - 1) * 100).toFixed(0) + '%' : 'new'})`);
      else if (is < was * (1 - RISE) && was - is >= floor) drops.push(`${map} ${key}: ${was} -> ${is}`);
    }
    for (const [key, ms] of Object.entries(results[map].timings)) {
      const was = b.timings?.[key];
      if (was && ms > was * TIME_WARN) console.warn(`WARN ${map} ${key}: ${ms.toFixed(1)} ms, baseline ${was} ms (timings vary by machine; check with play-profile)`);
    }
    const m = Object.keys(now).find(k => /^m\d+\./.test(k)).split('.')[0]; // (the fixture's own month)
    const c = Object.fromEntries(Object.entries(now).map(([k, v]) => [k.replace(m + '.', ''), v]));
    console.log(`${map} (${m}): play ${c['play.draws']} draws ${(c['play.triangles'] / 1e6).toFixed(2)}M tris | close ${c['close.draws']} draws ${(c['close.triangles'] / 1e6).toFixed(2)}M tris | wide ${(c['wide.triangles'] / 1e6).toFixed(2)}M tris | ${c['frames100.plantRegions']} regions/100 frames | update ${results[map].timings.gameUpdateMs.toFixed(1)} ms, flora rebuild ${results[map].timings.floraRebuildMs.toFixed(0)} ms, actors ${results[map].timings.actorsUpdateMs.toFixed(1)} ms`);
  }
  if (drops.length) console.log('Fell more than 10% (refresh the baseline with --update to lock in the gain):\n  ' + drops.join('\n  '));
  console.log(`Run time ${((performance.now() - started) / 1000).toFixed(1)}s`);
  if (failures.length) {
    console.error('FAIL counts rose more than 10% over tools/perf-guard-baseline.json:\n  ' + failures.join('\n  ') +
      '\nIf the cost is intended, measure it against the budget (/perf, docs/performance-review-2026-10-23.md), then run\n  node tools/perf-guard-check.mjs --update\nand commit the baseline with the change.');
    process.exitCode = 1;
  } else console.log('PASS draw, triangle, instance and plant-region counts within 10% of the baseline');
}
