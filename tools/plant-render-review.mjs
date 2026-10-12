import { MAPS, editPlants } from './plant-performance-fixtures.mjs';
import { focus } from '../js/render3d/focus.js';
import { snow } from '../js/render3d/snow.js';
import { LEVEL } from '../js/config.js';

const modes = {
  before: { indexedGeometry: false, cullShadows: false },
  indexed: { indexedGeometry: true, cullShadows: false },
  after: { indexedGeometry: true, cullShadows: true },
};
export function renderPair(review, label, show = false, mode = 'after') {
  const { flora } = review.get();
  flora.setOptimizations(modes.before);
  const a = review.draw(true, show ? document.getElementById('before') : null);
  flora.setOptimizations(modes[mode]);
  const b = review.draw(true, show ? document.getElementById('after') : null);
  const difference = review.compare(a.pixels, b.pixels);
  // Match the existing visibility audit's strict raster-edge tolerance.
  if (difference.changed > 8 || difference.max > 32) throw new Error(`${label}/${mode}: ${difference.changed} changed pixels; max channel difference ${difference.max}`);
  return { label, mode, ...difference, before: { triangles: a.triangles, calls: a.calls }, after: { triangles: b.triangles, calls: b.calls },
    geometry: { ...flora.geometryIndex.stats }, shadows: { ...flora.plantShadows.stats } };
}

export async function runRenderAudit(review, maps = MAPS) {
  const { c, setup, detail, view, yieldPaint, busy } = review;
  busy(true);
  const result = window.plantRenderChecks = { done: false, passed: [], metrics: [], error: null };
  const check = (label, mode) => result.metrics.push(renderPair(review, label, false, mode));
  try {
    for (const map of maps) {
      c.status.textContent = `Checking vertex sharing and shadows in ${map}…`; await yieldPaint(); setup(map);
      for (const quality of ['fast', 'high']) {
        detail(quality);
        for (const [zoom, az, x, z] of [[.2, 0, 40, 32], [.8, Math.PI / 4, 40, 32], [1.5, Math.PI / 2, 40, 32], [1.5, Math.PI, 70, 55]]) {
          view(zoom, az, x, z);
          for (const mode of ['indexed', 'after']) check(`${map}/${quality}/zoom${zoom}/angle${az.toFixed(2)}`, mode);
          await yieldPaint();
        }
        // Grazing sun and opposite azimuths exercise tall, nonuniformly scaled
        // trees crossing the shadow-camera edges, including off-camera casters.
        for (const [x, z] of [[-65, 15], [65, -15]]) {
          view(.8);
          const { sun } = review.get(); sun.position.copy(sun.target.position).add({ x, y: 12, z });
          sun.shadow.camera.far = 220; sun.shadow.camera.updateProjectionMatrix();
          check(`${map}/${quality}/low-sun/${x}`); await yieldPaint();
        }
      }
      const { game, flora, camera } = review.get(); view(.8);
      editPlants(game); let waiting = true, frames = 0;
      while (waiting) {
        waiting = flora.rebuild(game, false, 2); check(`${map}/local edit frame ${frames}`);
        if (++frames > 40) throw new Error('Region updates did not finish'); await yieldPaint();
      }
      game.day = 100; flora.rebuild(game); snow.uSnow.value = .75; check(`${map}/snow and winter`);
      snow.uSnow.value = 0; game.day = 0; flora.rebuild(game);
      const site = [...flora.treeSites.values()][0]; if (site) flora.showCanopySites(new Set([site]));
      focus.uFocus.value.set(40, game.world.heightAt(40, 32) * LEVEL + 1, 32); focus.uFocusAmt.value = 1;
      focus.uViewDir.value.copy(camera.position).sub(focus.uFocus.value).normalize(); check(`${map}/animal canopy opening`);
      focus.uFocusAmt.value = 0; flora.showCanopySites(new Set());
      flora.setFade(true); check(`${map}/see-through trees`); flora.setFade(false); check(`${map}/opaque restored`);
      const { ctx } = review.get(); if (ctx.isContextLost() || ctx.getError() !== ctx.NO_ERROR) throw new Error(`${map}: WebGL failure`);
      result.passed.push(`${map}: exact appearance preserved across detail, camera, low sun, edits, snow, canopy focus and transparency`);
      c.results.textContent = result.passed.join('\n'); await yieldPaint();
    }
    c.status.textContent = 'All vertex sharing and shadow comparisons passed.';
  } catch (error) { result.error = error.stack || error.message; c.status.textContent = 'ERROR: ' + error.message; }
  finally { result.done = true; focus.uFocusAmt.value = 0; snow.uSnow.value = 0; busy(false); }
  return result;
}

export async function renderBenchmark(review) {
  const { c, setup, detail, view, yieldPaint, busy } = review;
  busy(true); const result = window.plantRenderBenchmark = { done: false, rows: [], error: null };
  const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
  try {
    for (const map of ['pnw', 'amazon', 'serengeti']) {
      setup(map);
      for (const quality of ['fast', 'high']) {
        detail(quality); view(.8);
        const { flora, gl, ctx, scene, sun, camera } = review.get(), pixel = new Uint8Array(4);
        const complete = () => ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixel);
        const samples = { before: { cached: [], redraw: [], moving: [] }, after: { cached: [], redraw: [], moving: [] } };
        const row = { map, quality, zoom: .8 };
        // Warm both paths first, then alternate measurement order to reduce
        // shader compilation, GPU power state and thermal ordering biases.
        for (const mode of ['before', 'after']) { flora.setOptimizations(modes[mode]); review.draw(true, null, false); complete(); }
        for (let round = 0; round < 4; round++) for (const mode of round % 2 ? ['after', 'before'] : ['before', 'after']) {
          flora.setOptimizations(modes[mode]); view(.8); review.draw(true, null, false); complete();
          for (const kind of ['cached', 'redraw', 'moving']) {
            const times = samples[mode][kind];
            for (let n = 0; n < 12; n++) {
              if (kind === 'moving') view(.8, Math.PI / 4, 40 + n * .13, 32);
              const at = performance.now(); flora.syncShadows(); flora.updateView(camera);
              if (kind !== 'cached') flora.updateShadows(sun, camera);
              gl.shadowMap.needsUpdate = kind !== 'cached'; gl.render(scene, camera); complete();
              if (n >= 3) times.push(performance.now() - at);
            }
            row[mode] ||= {}; row[mode][kind] = { ms: median(times), triangles: gl.info.render.triangles, calls: gl.info.render.calls };
          }
          row[mode].shadows = { ...flora.plantShadows.stats };
        }
        row.geometry = { ...flora.geometryIndex.stats };
        result.rows.push(row); c.results.textContent = JSON.stringify(result.rows, null, 2); await yieldPaint();
      }
    }
    const { ctx } = review.get(), ext = ctx.getExtension('WEBGL_debug_renderer_info');
    result.gpu = ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    c.status.textContent = 'Drawing measured with GPU completion; excludes simulation. Cached, refreshed and moving views measured separately.';
  } catch (error) { result.error = error.stack || error.message; }
  finally { result.done = true; busy(false); }
  return result;
}
