// Opt-in diagnostics. No GPU synchronization or method wrapping during normal play.
export const PERFORMANCE_BENCHMARK_REVISION = 'ecosystem-profile-1';
export const percentile = (values, p) => values.length
  ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] : null;

export function renderObjectCounts(scene) {
  let meshes = 0, visibleMeshes = 0, instances = 0;
  scene.traverse(o => { if (o.isMesh) meshes++; });
  scene.traverseVisible(o => {
    if (o.isMesh) visibleMeshes++;
    if (o.isInstancedMesh) instances += o.count;
  });
  return { meshes, visibleMeshes, instances };
}

// Scoped probes also work in the live benchmark. Times are CPU work; nested
// phases overlap (daily ecology includes wildlife's daily work).
export class PerformancePhases {
  constructor(game, renderer) {
    this.restore = []; this.reset();
    for (const [object, method, label] of [
      [game, 'dailyTick', 'daily'], [game.wildlife, 'update', 'wildlife'],
      [renderer.flora, 'rebuild', 'plants'], [renderer.terrain, 'updateSurface', 'terrain'],
      [renderer.actors, 'update', 'actors'], [renderer.flora, 'updateView', 'visibility'],
      [renderer.flora, 'syncShadows', 'shadowSelection'], [renderer.flora, 'updateShadows', 'shadowSelection'],
    ]) {
      const original = object[method], probe = this;
      object[method] = function (...args) {
        const at = performance.now();
        try { return original.apply(this, args); }
        finally {
          probe.times[label] = (probe.times[label] || 0) + performance.now() - at;
          probe.calls[label] = (probe.calls[label] || 0) + 1;
        }
      };
      this.restore.push(() => { object[method] = original; });
    }
  }
  reset() { this.times = {}; this.calls = {}; }
  dispose() { for (const restore of this.restore.reverse()) restore(); this.restore.length = 0; }
}

// Hide only vegetation drawing, including its shadow casters. Keep all CPU
// updates and non-plant scenery. Restore visibility even if drawing throws.
// Reef dots also contain buoys, so that shared accessory batch remains visible.
export function withoutVegetation(flora, draw, keepSharedDots = false) {
  const hidden = new Map();
  const hide = mesh => { if (mesh && !hidden.has(mesh)) { hidden.set(mesh, mesh.visible); mesh.visible = false; } };
  try {
    for (const [key, pool] of flora.pools) {
      if (!/^(crown:|trunk:|bare:|tuft:|flower:|seed:|grasshead:|litter:|floorfern:|twig:|shrub:|shrubflower:|treeflower:|clamshell:|contact$|dot$)/.test(key) || keepSharedDots && key === 'dot') continue;
      for (const source of pool.subs.values()) for (const mesh of [source.mesh, source.proxy, source.viewShadow]) hide(mesh);
      hide(flora.plantView.batches.get(pool)?.mesh);
      hide(flora.plantShadows.batches.get(pool)?.mesh);
    }
    for (const pool of flora.canopyPools.values()) hide(pool.mesh);
    return draw();
  } finally { for (const [mesh, visible] of hidden) mesh.visible = visible; }
}

export class PerformanceOverlay {
  constructor(game, renderer) {
    this.game = game; this.renderer = renderer; this.samples = []; this.lastPaint = 0;
    this.wildlife = game.wildlife;
    this.phases = new PerformancePhases(game, renderer);
    this.element = document.createElement('pre'); this.element.id = 'performance-overlay';
    this.element.setAttribute('aria-label', 'Performance diagnostics');
    this.element.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:10000;margin:0;padding:10px;background:#10251ee8;color:#e4ffe9;font:11px/1.5 monospace;pointer-events:none;border-radius:6px;max-width:calc(100vw - 20px);white-space:pre-wrap';
    document.body.append(this.element);
    this.onVisibility = () => { this.samples.length = 0; this.skipNext = true; this.phases.reset(); };
    document.addEventListener('visibilitychange', this.onVisibility);
  }
  begin() {
    if (this.game.wildlife !== this.wildlife) {
      this.phases.dispose(); this.phases = new PerformancePhases(this.game, this.renderer);
      this.wildlife = this.game.wildlife; this.samples.length = 0;
    }
    this.phases.reset();
  }
  record(sample) {
    if (document.hidden || this.skipNext) { this.skipNext = false; this.phases.reset(); return; }
    this.samples.push({ ...sample, phases: this.phases.times, shadow: this.renderer.lastShadowRedraw });
    if (this.samples.length > 180) this.samples.shift();
    this.phases.reset();
    const now = performance.now(); if (now - this.lastPaint < 500) return; this.lastPaint = now;
    const r = this.renderer, samples = this.samples, sum = samples.reduce((s, v) => s + v.interval, 0);
    const p95 = key => percentile(samples.map(v => v.timings[key] || 0), .95).toFixed(1);
    const counts = renderObjectCounts(r.scene), info = r.gl.info.render;
    const phase = key => percentile(samples.map(v => v.phases[key] || 0), .95).toFixed(1);
    this.element.textContent = `${(1000 * samples.length / sum).toFixed(1)} FPS · ${(sum / samples.length).toFixed(1)} ms/frame · p95 ${percentile(samples.map(v => v.interval), .95).toFixed(1)} ms
CPU p95: sim ${p95('simulation')} · render ${p95('render')} · UI ${p95('interface')} ms
Last frame: ${info.calls} draws · ${info.triangles.toLocaleString()} triangles
Scene: ${counts.meshes} meshes (${counts.visibleMeshes} enabled) · ${counts.instances.toLocaleString()} instances
CPU p95: plants ${phase('plants')} · terrain ${phase('terrain')} · actors ${phase('actors')} ms
Shadows: ${samples.filter(v => v.shadow).length}/${samples.length} refresh frames
${r.quality} · scale ${(r.resScale ?? 1).toFixed(2)} · DPR ${r.dpr} · shadows ${r.sun.castShadow ? 'on' : 'off'}
Render CPU excludes GPU completion. Meshes include shadow proxies.`;
  }
}
