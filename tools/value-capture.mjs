// Value and colour pass (aesthetics plan item 2): pictures of every map at the usual zoom, midday and
// golden hour, and how the picture's values spread (luminance percentiles of the land, sRGB 0..255).
// node tools/value-capture.mjs <outDir> [maps...]   (writes <map>-<hour>.png and values.json)
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { openBrowser } from './browser-session.mjs';

const [outArg, ...mapArgs] = process.argv.slice(2);
if (!outArg) throw new Error('usage: node tools/value-capture.mjs <outDir> [maps...]');
const out = resolve(outArg); await mkdir(out, { recursive: true });
const maps = mapArgs.length ? mapArgs : ['pnw', 'atlanta', 'amazon', 'sumatra', 'serengeti', 'chinandega', 'reef'];
const HOURS = [['midday', 0.4], ['golden', 0.79]];
const b = await openBrowser({ label: 'value', width: 960, height: 600 });
const stats = {};
try {
  for (const map of maps) {
    await b.navigate('/tools/release-scenes.html?' + new URLSearchParams({ map, scene: 'forest', quality: 'high' }));
    await b.waitFor(`!!window.releaseScene?.ready && window.releaseScene.map === ${JSON.stringify(map)}`, 'scene ready');
    for (const [hour, u] of HOURS) {
      const r = await b.evaluate(`(() => {
        const { game: g, renderer: r } = window.releaseScene, ui = { clean: true, overlay: 'none' };
        r.dayCycleOn = true; r.setTimeOfDay(${u}); r.zoom = 0.62; r.updateCamera();
        for (let i = 0; i < 30; i++) r.draw(g, ui, 0.5);
        const c = r.capture(g, ui, false), ctx = c.getContext('2d'), d = ctx.getImageData(0, 0, c.width, c.height).data;
        const L = [], hist = new Array(8).fill(0);
        for (let i = 0; i < d.length; i += 4 * 7) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; L.push(l); hist[Math.min(7, l >> 5)]++; }
        L.sort((a, b) => a - b); const p = q => Math.round(L[Math.floor(q * (L.length - 1))]);
        return { png: c.toDataURL('image/png'), p5: p(0.05), p25: p(0.25), p50: p(0.5), p75: p(0.75), p95: p(0.95), hist: hist.map(n => +(n / L.length).toFixed(3)) };
      })()`);
      await writeFile(join(out, `${map}-${hour}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
      delete r.png; (stats[map] ??= {})[hour] = r;
      console.log(map, hour, `p5 ${r.p5} p25 ${r.p25} p50 ${r.p50} p75 ${r.p75} p95 ${r.p95}  spread ${r.p95 - r.p5}`);
    }
  }
  b.assertHealthy();
} finally { await b.close(); }
await writeFile(join(out, 'values.json'), JSON.stringify(stats, null, 1));
