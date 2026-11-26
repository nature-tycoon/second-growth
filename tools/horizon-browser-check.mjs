// The horizon (decision 0058): the land's far edge melts into the sky behind the canvas, and the two
// must meet without a seam. The backdrop's colour is worked out in JS (backdrop.js screenColor: three's
// neutral tone mapping, the map's grade, sRGB); the land's comes out of the shaders. This melts the
// whole land for one frame (test only), reads the drawn pixel and holds it to the backdrop's colour,
// at midday, golden hour and night. Also: the backdrop shows in the usual view, the melt is off at eye
// level, and a session without the intro film opens at LATE_START.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openBrowser, projectRoot } from './browser-session.mjs';

const b = await openBrowser({ label: 'horizon', width: 900, height: 600 });
try {
  await b.navigate('/');
  await b.evaluate(`localStorage.setItem('second-growth-settings', JSON.stringify({ analytics: false, autosave: false, quality: 'fast', qualityChosen: true, shadows: true, wind: true, weather: false, dayCycle: true, fps: '60', muted: true, music: false, nature: false })); sessionStorage.setItem('second-growth-pending', JSON.stringify({ map: 'pnw', mode: 'free', difficulty: 'standard' }));`);
  await b.navigate('/');
  await b.waitFor(`window.secondGrowth?.game.map === 'pnw' && window.secondGrowth.renderer.lightReady && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))`, 'the game loads');
  const start = await b.evaluate(`(() => { const { ui, renderer: r } = window.secondGrowth; return { intro: !!ui.intro, u: r.todClock / 360 }; })()`);
  const LATE_START = Number((await readFile(projectRoot + 'js/render3d/scene.js', 'utf8')).match(/export const LATE_START = ([\d.]+);/)?.[1]);
  assert.ok(LATE_START > 0, 'LATE_START is where this check expects it (scene.js)');
  if (!start.intro) assert.ok(Math.abs(start.u - LATE_START) < 0.02, `no intro film: the day opens at LATE_START (${start.u.toFixed(3)})`);

  for (const [name, u] of [['midday', 0.4], ['golden hour', 0.8], ['night', 0.91]]) {
    const r = await b.evaluate(`(async () => {
      const { game: g, ui, renderer: r } = window.secondGrowth;
      const { haze } = await import('/js/render3d/atmosphere.js');
      g.speed = 0; r.setEyeLevel?.(null); r.todClock = ${u} * 360;
      // (the light eases toward the hour: a few long frames settle it)
      for (let i = 0; i < 40; i++) r.draw(g, ui.state, 0.5);
      const real = Object.getOwnPropertyDescriptor(haze.uMelt, 'value');
      Object.defineProperty(haze.uMelt, 'value', { get() { return 1e4; }, set() {}, configurable: true });
      try {
        r.draw(g, ui.state, 0);
        const gl = r.gl.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(4);
        const at = [[0.5, 0.5], [0.3, 0.6], [0.7, 0.4]].map(([fx, fy]) => { gl.readPixels(Math.round(W * fx), Math.round(H * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return [...px]; });
        return { at, want: r.backStops[0], shown: getComputedStyle(r.backdrop.el).display !== 'none' && !!r.backdrop.el.style.background };
      } finally { delete haze.uMelt.value; Object.defineProperty(haze.uMelt, 'value', real); }
    })()`);
    assert.ok(r.shown, `${name}: the backdrop is shown in the usual view`);
    for (const p of r.at) {
      const d = Math.max(...[0, 1, 2].map(k => Math.abs(p[k] - r.want[k])));
      assert.ok(d <= 3, `${name}: a melted pixel ${p.slice(0, 3)} matches the backdrop ${r.want} (off by ${d}: screenColor no longer copies the tone mapping or grade)`);
    }
    console.log(`PASS ${name}: melted land ${r.at[0].slice(0, 3)} = backdrop ${r.want}`);
  }

  const eye = await b.evaluate(`(async () => {
    const { game: g, ui, renderer: r } = window.secondGrowth;
    const { haze } = await import('/js/render3d/atmosphere.js');
    const a = g.wildlife.agents.find(x => !x.leaving && !x.gate);
    if (!a) return null;
    r.setEyeLevel(a);
    // (the eye camera takes over within a frame or two, once the animal is posed)
    for (let i = 0; i < 4; i++) r.draw(g, ui.state, 0.05);
    if (!r.eyeOn) { r.setEyeLevel(null); return null; }
    r.draw(g, ui.state, 0.05);
    const melt = haze.uMelt.value; r.setEyeLevel(null); r.draw(g, ui.state, 0.05);
    return { melt, back: haze.uMelt.value };
  })()`);
  if (eye) { assert.equal(eye.melt, 0, 'no melt at eye level'); assert.ok(eye.back > 0, 'the melt returns with the usual view'); console.log('PASS eye level: melt off, back on leaving'); } else console.log('SKIP eye level: no animal to ride along with');
  b.assertHealthy();
} finally { await b.close(); }
