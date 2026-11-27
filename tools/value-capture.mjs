// Value and colour pass (aesthetics plan item 2): pictures of every map at the usual zoom, midday and
// golden hour, and how the picture's values spread (luminance percentiles of the land, sRGB 0..255).
// node tools/value-capture.mjs <outDir> [maps...] [--hours=midday,golden,sunset,night] [--month=0..11] [--fx] [--water]
// (writes <map>-<hour>[-m<month>].png and values.json; --month sets the game's month, so its season's light and tint;
// --fx draws the 2D effects layer too, as players see it: washes, sparkles, vignette; release-scenes leaves it out;
// --water centres on the open water nearest the view, closer in, for the water's highlights)
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { openBrowser } from './browser-session.mjs';

const args = process.argv.slice(2), flag = n => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const [outArg, ...mapArgs] = args.filter(a => !a.startsWith('--'));
const ALL_HOURS = { midday: 0.4, golden: 0.79, sunset: 0.855, night: 0.91 }, month = flag('month'), fx = args.includes('--fx'), water = args.includes('--water');
if (!outArg) throw new Error('usage: node tools/value-capture.mjs <outDir> [maps...]');
const out = resolve(outArg); await mkdir(out, { recursive: true });
const maps = mapArgs.length ? mapArgs : ['pnw', 'atlanta', 'amazon', 'sumatra', 'serengeti', 'chinandega', 'reef'];
const HOURS = (flag('hours') || 'midday,golden').split(',').map(h => [h, ALL_HOURS[h]]), tag = month != null ? `-m${month}` : '';
const b = await openBrowser({ label: 'value', width: 960, height: 600 });
const stats = {};
try {
  for (const map of maps) {
    await b.navigate('/tools/release-scenes.html?' + new URLSearchParams({ map, scene: 'forest', quality: 'high' }));
    await b.waitFor(`!!window.releaseScene?.ready && window.releaseScene.map === ${JSON.stringify(map)}`, 'scene ready');
    for (const [hour, u] of HOURS) {
      const r = await b.evaluate(`(async () => {
        const { game: g, renderer: r } = window.releaseScene, ui = { clean: true, overlay: 'none' };
        ${month != null ? `g.day = Math.floor(g.day / 120) * 120 + ${+month} * 10 + 2;` : ''}
        ${fx ? 'delete r.drawFX;' : ''}
        r.dayCycleOn = true; r.setTimeOfDay(${u}); r.zoom = ${water ? 1.1 : 0.62}; r.updateCamera();
        ${water ? `{
          const { T } = await import('/js/config.js'), w = g.world, wet = new Set([T.POND, T.CREEK, T.RIVER]);
          let best = null, bd = Infinity;
          for (let z = 0; z < w.h; z++) for (let x = 0; x < w.w; x++) {
            if (!wet.has(w.terrain[w.idx(x, z)])) continue;
            const d = Math.hypot(x - r.target.x, z - r.target.z); if (d < bd) { bd = d; best = [x, z]; }
          }
          if (best) r.centerOn(best[0] + 0.5, best[1] + 0.5);
          r.updateCamera();
        }` : ''}
        for (let i = 0; i < 30; i++) r.draw(g, ui, 0.5);
        const c = r.capture(g, ui, false), ctx = c.getContext('2d'), d = ctx.getImageData(0, 0, c.width, c.height).data;
        const L = [], hist = new Array(8).fill(0);
        for (let i = 0; i < d.length; i += 4 * 7) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; L.push(l); hist[Math.min(7, l >> 5)]++; }
        L.sort((a, b) => a - b); const p = q => Math.round(L[Math.floor(q * (L.length - 1))]);
        return { png: c.toDataURL('image/png'), p5: p(0.05), p25: p(0.25), p50: p(0.5), p75: p(0.75), p95: p(0.95), hist: hist.map(n => +(n / L.length).toFixed(3)) };
      })()`);
      await writeFile(join(out, `${map}-${hour}${tag}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
      delete r.png; (stats[map] ??= {})[hour + tag] = r;
      console.log(map, hour + tag, `p5 ${r.p5} p25 ${r.p25} p50 ${r.p50} p75 ${r.p75} p95 ${r.p95}  spread ${r.p95 - r.p5}`);
    }
  }
  b.assertHealthy();
} finally { await b.close(); }
await writeFile(join(out, 'values.json'), JSON.stringify(stats, null, 1));
