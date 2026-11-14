// Where the last loading steps go: from 'Welcoming the wild' to 'Ready' (main.js), the scene's
// first frame. Splits it into the build (Renderer.prepareFirstFrame), the shader warm-up
// (warmShaders) and the first draw, times the parts and the WebGL calls inside them (program
// links and the waits on them, uploads) and counts the shader programs built at each point.
//   node tools/first-frame-profile.mjs [maps=pnw,sumatra] [runs=2]
// Each map loads twice in a fresh profile: a first visit (no saved farm) and then a return
// with a saved farm (the chooser). Hardware GPU; run under nice -n 15. FF_OUT=<file> saves
// the rows as JSON, FF_ROOT=<checkout> measures another copy (a before/after), FF_SOFTWARE=1 uses
// SwiftShader, a slow software GPU whose shader compiles stand in for a weak laptop's. Cole's M5 compiles shaders far faster than Windows (ANGLE/D3D) or a
// Chromebook, and Chrome keeps compiled programs between loads of one profile, so the program
// count in the first draw matters as much as the milliseconds.
import { openBrowser, pause } from './browser-session.mjs';
import { writeFile } from 'node:fs/promises';

const maps = (process.argv[2] || 'pnw,sumatra').split(','), runs = Number(process.argv[3] || 2);
const probe = `
  const F = window.__ff = { gl: {}, phase: null, parts: {}, marks: [], programsAt: {} };
  const mark = l => F.marks.push([l, performance.now()]);
  // every WebGL call's time in each phase, by name
  const sourceOf = WebGL2RenderingContext.prototype.getShaderSource;
  for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const k of Object.getOwnPropertyNames(C.prototype)) {
    const d = Object.getOwnPropertyDescriptor(C.prototype, k);
    if (typeof d.value !== 'function' || k === 'constructor') continue;
    const f = d.value;
    C.prototype[k] = function (...a) {
      const ph = F.phase; if (!ph) return f.apply(this, a);
      const t = performance.now(); try { return f.apply(this, a); } finally {
        const ms = performance.now() - t, e = (F.gl[ph] ||= {})[k] ||= [0, 0]; e[0] += ms; e[1]++;
        // (the slowest shader waits, named by three.js's SHADER_NAME line and the first lines that differ)
        if (k === 'getShaderInfoLog' && ms > 20) { const src = sourceOf.call(this, a[0]) || ''; (F.slow ||= []).push([ph, Math.round(ms), (src.match(/#define SHADER_NAME (.*)/) || [])[1] || '?', src.length, (src.match(/#define (USE_INSTANCING|DEPTH_PACKING \\d|USE_SHADOWMAP|ALPHATEST|USE_MAP)\\b/g) || []).join(' ')]); }
      }
    };
  }
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.getElementById('loading-status'), l = document.getElementById('loading-screen');
    new MutationObserver(() => mark(s.textContent)).observe(s, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => { if (l.classList.contains('done')) mark('done'); }).observe(l, { attributes: true });
  });
  // main.js sets window.secondGrowth before the first frame is built: wrap the build (prep),
  // the shader warm-up (warm) and the first draw (draw)
  let sg;
  Object.defineProperty(window, 'secondGrowth', { configurable: true, get: () => sg, set(v) {
    sg = v; const r = v.renderer, P = F.parts, count = () => r.gl.info.programs.length;
    const wrap = (o, k, name) => { const f = o[k]; if (typeof f !== 'function') return; o[k] = function (...a) {
      const ph = F.phase; if (ph !== 'prep' && ph !== 'draw') return f.apply(this, a);
      const t = performance.now(); try { return f.apply(this, a); } finally { const key = ph + ' ' + name; P[key] = (P[key] || 0) + performance.now() - t; }
    }; };
    wrap(r, 'setWorld', 'setWorld'); wrap(r, 'refreshWorld', 'refreshWorld'); wrap(r, 'updateOverlay', 'updateOverlay');
    wrap(r.flora, 'bakeImpostors', 'bakeImpostors'); wrap(r.flora, 'setZoom', 'flora.setZoom'); wrap(r.actors, 'update', 'actors.update');
    wrap(r.flora, 'updateShadows', 'updateShadows'); wrap(r.flora, 'updateView', 'flora.updateView'); wrap(r.gl, 'render', 'gl.render');
    wrap(r, 'drawFX', 'drawFX'); wrap(r.seaSurface, 'update', 'seaSurface');
    F.programsAt.start = count();
    const timed = (k, ph, after) => { const f = r[k]; if (typeof f !== 'function') return; r[k] = function (...a) {
      if (ph === 'draw' && (F.drawn || r.preparing)) return f.apply(this, a);
      F.phase = ph; const t = performance.now();
      const end = () => { F[ph] = [t, performance.now()]; F.phase = null; F.programsAt[ph] = count(); after?.(); };
      let out; try { out = f.apply(this, a); } catch (e) { end(); throw e; }
      if (out?.then) return out.finally(end);
      end(); return out;
    }; };
    timed('prepareFirstFrame', 'prep'); timed('warmShaders', 'warm', () => { F.warmed = new Set(r.gl.info.programs); });
    timed('draw', 'draw', () => { F.drawn = true;
      // what the first draw still had to compile (beyond the sun's shadow programs)
      F.missed = []; const seen = new Set();
      r.scene.traverse(o => { for (const m of [o.material].flat()) { const p = m && r.gl.properties.get(m).currentProgram;
        if (p && F.warmed && !F.warmed.has(p) && !seen.has(p)) { seen.add(p); F.missed.push([o.type, o.name || o.parent?.name || '', m.type, m.name || '', o.visible, !!m.map, o.count]); } } }); F.programNames = r.gl.info.programs.map(p => p.name + '|' + p.type); F.memory = { ...r.gl.info.memory }; });
  } });`;

const browser = await openBrowser({ label: 'first-frame', software: process.env.FF_SOFTWARE === '1', width: 1280, height: 800, ...(process.env.FF_ROOT ? { root: process.env.FF_ROOT } : {}) });
const rows = [];
try {
  await browser.send('Page.enable');
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: probe });
  for (const map of maps) for (let run = 0; run < runs; run++) {
    for (const visit of ['first', 'saved']) {
      if (visit === 'first') await browser.evaluate(`(async () => { localStorage.clear(); sessionStorage.clear(); for (const d of await indexedDB.databases?.() || []) indexedDB.deleteDatabase(d.name); })()`).catch(() => {});
      await browser.navigate(`/index.html?map=${map}&ff=${run}${visit}`);
      await browser.waitFor(`window.__ff?.marks.some(m => m[0] === 'done')`, 'loading screen to finish', 180000);
      const ff = await browser.evaluate(`window.__ff`);
      if (!rows.length) console.log('GPU ' + await browser.evaluate(`(() => { const r = window.secondGrowth.renderer; return r.gpuName() + ', parallel shader compile ' + !!r.gl.extensions.get('KHR_parallel_shader_compile'); })()`));
      const at = l => ff.marks.find(m => m[0] === l)?.[1];
      const welcome = at('Welcoming the wild'), ready = at('Ready'), span = k => ff[k] ? ff[k][1] - ff[k][0] : 0;
      const glOf = ph => Object.entries(ff.gl[ph] || {}).sort((a, b) => b[1][0] - a[1][0]);
      const glMs = ph => glOf(ph).reduce((s, e) => s + e[1][0], 0);
      const row = { map, visit, run, step: ready - welcome, prep: span('prep'), warm: span('warm'), draw: span('draw'),
        programs: ff.programsAt, glMs: { prep: glMs('prep'), warm: glMs('warm'), draw: glMs('draw') }, parts: ff.parts,
        gl: glOf('draw').slice(0, 8), memory: ff.memory, programNames: ff.programNames };
      rows.push(row);
      const pa = ff.programsAt;
      console.log(`${map} ${visit} #${run}: Welcoming->Ready ${row.step.toFixed(0)} ms: build ${row.prep.toFixed(0)}, shader warm ${row.warm.toFixed(0)}, first draw ${row.draw.toFixed(0)} (its WebGL calls ${row.glMs.draw.toFixed(0)}); programs ${pa.start} -> build ${pa.prep ?? '-'} -> warm ${pa.warm ?? '-'} -> draw ${pa.draw}; geometries ${ff.memory.geometries} textures ${ff.memory.textures}`);
      console.log('   parts: ' + Object.entries(ff.parts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', '));
      console.log('   first draw gl: ' + row.gl.map(([k, [ms, n]]) => `${k} ${ms.toFixed(0)}/${n}`).join(', '));
      for (const w of (ff.slow || []).sort((x, y) => y[1] - x[1]).slice(0, 6)) console.log(`   slow shader (${w[0]}): ${w[1]} ms ${w[2]} ${w[3]} chars ${w[4]}`);
      row.slow = ff.slow;
      if (ff.missed?.length) console.log('   compiled in the first draw: ' + ff.missed.map(m => m.join(' ')).join('; '));
      row.missed = ff.missed;
      if (visit === 'first') await browser.evaluate(`window.secondGrowth.game.save()`); // (so the return finds a saved farm)
      await pause(300);
    }
  }
  if (process.env.FF_OUT) await writeFile(process.env.FF_OUT, JSON.stringify(rows, null, 1));
  browser.assertHealthy();
} finally { await browser.close(); }
