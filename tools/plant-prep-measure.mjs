// Diagnostic-only tracing around the production loop. Never runs during normal play.
import * as THREE from 'three';
import { PlantPool, ChunkedPlantPool, floraVersion } from '../js/render3d/plant-pools.js';
import { PlantBatch } from '../js/render3d/plant-view.js';
import { percentile } from '../js/performance.js';
import { measureGameplay } from './gameplay-benchmark.mjs';

export async function measurePlantPreparation(config) {
  const { renderer: r, ui } = window.secondGrowth;
  const restorers = [], rows = [], outside = {}, cameraMatrix = new THREE.Matrix4();
  let current = null, phase = 'outside', lastDraw = null, mutationDepth = 0, cinematicRequests = 0;
  const wrap = (object, key, replacement) => {
    const original = object[key]; object[key] = replacement(original);
    restorers.push(() => { object[key] = original; });
  };
  const timed = (object, key, label) => wrap(object, key, original => function (...args) {
    const previous = phase; phase = label;
    const at = performance.now();
    try { return original.apply(this, args); }
    finally {
      if (current) current.times[label] = (current.times[label] || 0) + performance.now() - at;
      if (current && label === 'plantRebuild') current.rebuild = { ...this.lastRebuild };
      phase = previous;
    }
  });
  for (const key of ['end', 'setView', 'dispose']) wrap(PlantPool.prototype, key, original => function (...args) {
    const version = floraVersion.n, nested = mutationDepth++ > 0;
    try { return original.apply(this, args); }
    finally {
      const delta = floraVersion.n - version;
      mutationDepth--;
      if (delta && !nested) {
        const causes = current?.revisionCauses || outside, cause = phase + ':' + key;
        causes[cause] = (causes[cause] || 0) + delta;
      }
    }
  });
  for (const [object, key, label] of [
    [r.flora, 'rebuild', 'plantRebuild'], [r.terrain, 'updateSurface', 'terrain'],
    [r.actors, 'update', 'animals'], [r.flora, 'updateView', 'visibility'],
    [r.flora, 'syncShadows', 'shadowSync'], [r.flora, 'updateShadows', 'shadowSelection'],
    [r.flora, 'showCanopySites', 'canopy'], [r.flora, 'setZoom', 'detail'],
    [r.flora.changes, 'find', 'plantDiff'], [r.flora.changes, 'remember', 'plantSnapshot'],
    [ChunkedPlantPool.prototype, 'end', 'sourceFinalize'],
    [r.flora.plantView, 'boundsFor', 'visibilityBounds'],
    [r.flora.plantShadows, 'boundsFor', 'shadowBounds'],
    [r, 'updateFocus', 'focus'], [r, 'drawFX', 'effects'],
  ]) timed(object, key, label);
  wrap(PlantBatch.prototype, 'write', original => function (...args) {
    const label = this.shadow ? 'shadowPacking' : 'visibilityPacking', at = performance.now();
    try { return original.apply(this, args); }
    finally { if (current) current.times[label] = (current.times[label] || 0) + performance.now() - at; }
  });
  wrap(ui, 'playMoment', original => function (...args) {
    cinematicRequests++;
    if (config.cinematics) return original.apply(this, args);
  });
  wrap(r.flora.plantView, 'update', original => function (flora, camera, version, enabled) {
    cameraMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const moved = cameraMatrix.elements.some((v, k) => v !== this.previous[k]);
    const maxMatrixDelta = Math.max(...cameraMatrix.elements.map((v, k) => Math.abs(v - this.previous[k])));
    const revision = version !== this.version;
    const updated = original.call(this, flora, camera, version, enabled);
    if (current) current.view = { updated, moved, revision, version,
      candidates: this.stats.candidates, visible: this.stats.visible,
      maxMatrixDelta };
    return updated;
  });
  wrap(r.gl, 'render', original => function (...args) {
    const at = performance.now();
    try { return original.apply(this, args); }
    finally { if (current) current.submissionMs += performance.now() - at; }
  });
  wrap(r, 'draw', original => function (...args) {
    current = { times: {}, revisionCauses: { ...outside }, submissionMs: 0 };
    for (const key of Object.keys(outside)) delete outside[key];
    const at = performance.now();
    try { return original.apply(this, args); }
    finally {
      current.renderCpuMs = performance.now() - at;
      current.preparationMs = current.renderCpuMs - current.submissionMs;
      current.shadowRefresh = this.lastShadowRedraw;
      current.camera = { target: this.target.toArray(), zoom: this.zoom, frame: { ...this.frame },
        fly: !!this.fly, follow: !!this.followAgent, cinematic: ui.moment?.key || null };
      lastDraw = current; current = null;
    }
  });
  wrap(ui, 'frame', original => function (...args) {
    const result = original.apply(this, args);
    if (lastDraw) { rows.push(lastDraw); lastDraw = null; }
    return result;
  });
  let gameplay;
  try { gameplay = await measureGameplay(config); }
  finally { for (const restore of restorers.reverse()) restore(); }
  const measured = rows.slice(-config.samples);
  if (measured.length !== config.samples) throw new Error('Preparation trace lost frames');
  const stats = values => ({ meanMs: values.reduce((a, b) => a + b, 0) / values.length,
    medianMs: percentile(values, .5), p95Ms: percentile(values, .95), maxMs: Math.max(...values) });
  const labels = ['plantRebuild', 'plantDiff', 'plantSnapshot', 'sourceFinalize', 'terrain', 'animals', 'visibility', 'visibilityBounds', 'visibilityPacking', 'shadowSync', 'shadowSelection', 'shadowBounds', 'shadowPacking', 'canopy', 'detail', 'focus', 'effects'];
  const phases = Object.fromEntries(labels.map(label => [label, {
    ...stats(measured.map(row => row.times[label] || 0)),
    frames: measured.filter(row => row.times[label] > 0).length,
  }]));
  const reasons = { cached: 0, cameraOnly: 0, revisionOnly: 0, cameraAndRevision: 0 };
  const revisionCauses = {};
  for (const row of measured) {
    const view = row.view;
    reasons[!view.updated ? 'cached' : view.moved && view.revision ? 'cameraAndRevision' : view.moved ? 'cameraOnly' : 'revisionOnly']++;
    for (const [key, value] of Object.entries(row.revisionCauses)) revisionCauses[key] = (revisionCauses[key] || 0) + value;
  }
  return { config, preparation: stats(measured.map(row => row.preparationMs)),
    phases, viewInvalidation: reasons, revisionCauses, cinematicRequests, gameplay, frames: measured,
    notes: 'Trace wrappers add diagnostic overhead. Automatic cinematics are suppressed unless explicitly requested. Phase timings overlap: canopy is within animals, diff/snapshot/finalize within plantRebuild, bounds/packing within visibility or shadowSelection. Hand-off excludes gl.finish. These are local Chrome measurements, not real iPhone/Android measurements.' };
}
