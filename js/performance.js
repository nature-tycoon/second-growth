// Lightweight frame CPU summaries; deeper diagnostics remain opt-in.
// No GPU synchronization or method wrapping during normal play.
// Checking every shader for compile errors makes the browser finish compiling it then and there,
// a hitch each time a new material first draws. Players can't act on the log, so only local
// development and the checks keep it.
export const CHECK_SHADERS = typeof location === 'undefined' || ['localhost', '127.0.0.1', ''].includes(location.hostname);

// Planting now measures the complete production action, including Undo history.
export const PERFORMANCE_BENCHMARK_REVISION = 'ecosystem-profile-2';
export const percentile = (values, p) => values.length
  ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] : null;

// Aggregate the whole analytics window without retaining an object for every frame.
// Tenths-of-a-millisecond bins give the same displayed precision as the overlay.
export const CPU_STAGES = ['simulation', 'render', 'interface'];
export class FrameCpuStats {
  // (prefix: the analytics field names, cpu_render_ms and so on; the GPU timer uses 'gpu')
  constructor(keys = CPU_STAGES, prefix = 'cpu') { this.keys = keys; this.prefix = prefix; this.reset(); }
  reset() {
    this.frames = 0;
    this.stages = this.keys.map(() => ({ total: 0, bins: new Map() }));
  }
  record({ timings }) {
    if (!this.keys.every(key => Number.isFinite(timings?.[key]) && timings[key] >= 0)) return;
    this.frames++;
    this.keys.forEach((key, i) => {
      const s = this.stages[i], ms = timings[key], bin = Math.round(ms * 10);
      s.total += ms; s.bins.set(bin, (s.bins.get(bin) || 0) + 1);
    });
  }
  sample(reset = true) {
    const P = this.prefix, out = { [`${P}_frames`]: this.frames };
    this.keys.forEach((key, i) => {
      const s = this.stages[i]; let count = 0, p95 = null;
      for (const [bin, n] of [...s.bins].sort((a, b) => a[0] - b[0])) {
        count += n;
        if (count > Math.floor(this.frames * .95)) { p95 = bin / 10; break; }
      }
      out[`${P}_${key}_ms`] = this.frames ? +(s.total / this.frames).toFixed(1) : null;
      out[`${P}_${key}_p95_ms`] = p95;
    });
    if (reset) this.reset();
    return out;
  }
}

// Built-in graphics that the analytics show running the game at about half the frame rate on
// High that they manage on Fast (Intel HD and UHD Graphics; AMD's integrated Radeon, which names
// no model). Newer Intel chips reporting plain "Intel(R) Graphics", Iris Xe and discrete
// Radeons aren't matched.
export const weakGpu = name => !!name &&
  (/\bIntel\b.*\bU?HD Graphics\b/i.test(name) || /\bRadeon(\(TM\))?\s*(R[2-7]\b|Graphics\b|Vega\b)/i.test(name));

// The graphics chip's name, read from a throwaway context, for choices that must be made before
// the game's own WebGL context exists (antialiasing can't be changed afterwards).
export function probeGpu() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).slice(0, 80) : null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch (e) { return null; }
}

// How long the graphics chip takes to draw a frame (the shadow map and the view), from a timer
// query on every `every`th frame. The result is read a few frames later, once the chip has
// finished, so the timing never makes the processor wait. Browsers without the timer extension
// (Safari, some locked-down ones) report nothing.
export class GpuTimer {
  constructor(gl, every = 15) {
    this.gl = gl; this.every = every; this.n = 0; this.active = null; this.pending = [];
    try { this.ext = gl.getExtension?.('EXT_disjoint_timer_query_webgl2') || null; } catch (e) { this.ext = null; }
    this.stats = new FrameCpuStats(['frame'], 'gpu');
  }
  begin() {
    if (!this.ext || this.active || this.pending.length > 4 || ++this.n % this.every) return;
    this.active = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active);
  }
  end() {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active); this.active = null;
  }
  // (a "disjoint" spell, the chip's clock interrupted, makes the timings in flight meaningless)
  poll() {
    if (!this.pending.length) return;
    const gl = this.gl, disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.pending.length) {
      const q = this.pending[0];
      if (!disjoint && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!disjoint) this.stats.record({ timings: { frame: gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 } });
      gl.deleteQuery(q); this.pending.shift();
    }
  }
  sample(reset = true) { return this.ext ? this.stats.sample(reset) : { gpu_frames: 0, gpu_frame_ms: null, gpu_frame_p95_ms: null }; }

}

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
${r.quality} · scale ${(r.resScale ?? 1).toFixed(2)} · DPR ${r.dpr} · shadows ${r.sun.castShadow ? 'on' : 'off'} · far trees ${r.flora.view[0] === 3 ? 'on' : 'off'}
Render CPU excludes GPU completion. Meshes include shadow proxies.`;
  }
}
