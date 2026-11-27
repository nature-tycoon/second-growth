// Value and colour pass (aesthetics plan item 2): pictures of every map at the usual zoom, midday and
// golden hour, and how the picture's values spread (luminance percentiles of the land, sRGB 0..255).
// node tools/value-capture.mjs <outDir> [maps...] [--hours=midday,golden,sunset,night] [--month=0..11] [--fx] [--water]
// (writes <map>-<hour>[-m<month>].png and values.json; --month sets the game's month, so its season's light and tint;
// --fx draws the 2D effects layer too, as players see it: washes, sparkles, vignette; release-scenes leaves it out;
// --water centres on the open water nearest the view, closer in, for the water's highlights;
// --scene=start pictures the farm as a new game opens it, unrestored, instead of the restored forest;
// --animals=deer,elk puts a few of each on open ground near the view, at play zoom (1.2), to see how they read)
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { openBrowser } from './browser-session.mjs';

const args = process.argv.slice(2), flag = n => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const [outArg, ...mapArgs] = args.filter(a => !a.startsWith('--'));
const ALL_HOURS = { midday: 0.4, golden: 0.79, sunset: 0.855, night: 0.91 }, month = flag('month'), fx = args.includes('--fx'), water = args.includes('--water'), scene = flag('scene') || 'forest', animals = flag('animals')?.split(',');
if (!outArg) throw new Error('usage: node tools/value-capture.mjs <outDir> [maps...]');
const out = resolve(outArg); await mkdir(out, { recursive: true });
const maps = mapArgs.length ? mapArgs : ['pnw', 'atlanta', 'amazon', 'sumatra', 'serengeti', 'chinandega', 'reef'];
const HOURS = (flag('hours') || 'midday,golden').split(',').map(h => [h, ALL_HOURS[h]]), tag = (month != null ? `-m${month}` : '') + (scene !== 'forest' ? '-' + scene : '') + (animals ? '-animals' : '');
const b = await openBrowser({ label: 'value', width: 960, height: 600 });
const stats = {};
try {
  for (const map of maps) {
    await b.navigate('/tools/release-scenes.html?' + new URLSearchParams({ map, scene, quality: 'high' }));
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
        ${animals ? `{
          const { ANIMAL } = await import('/js/data/animals.js'), { DAYS_PER_YEAR } = await import('/js/config.js'), w = g.world;
          if (!window.valueAnimals) {
          let best = null, bd = Infinity; // (open ground: something growing, no tree or water, near the view)
          for (let z = 2; z < w.h - 2; z++) for (let x = 2; x < w.w - 2; x++) {
            let open = 0;
            for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const i = w.idx(x + dx, z + dz); open += !w.tree[i] && w.ground[i] && w.vh[i] >= 0 ? 1 : 0; }
            const d = Math.hypot(x - r.target.x, z - r.target.z) - open; if (open > 20 && d < bd) { bd = d; best = [x, z]; }
          }
          const [cx, cz] = best || [r.target.x, r.target.z], defs = ${JSON.stringify(animals)}.map(k => ANIMAL[k]).filter(Boolean);
          defs.forEach((def, k) => { for (let n = 0; n < 3; n++) {
            const x = cx + 0.5 + (n - 1) * 1.3 + k * 0.4, y = cz + 0.5 + (k - (defs.length - 1) / 2) * 1.6 + (n % 2) * 0.5;
            const a = g.wildlife.spawn(def, x, y, { silent: true, age: def.mature * DAYS_PER_YEAR + 1 });
            Object.assign(a, { x, y, tx: x, ty: y, wait: 1000, heading: -0.35 + n, hunger: 0, thirst: 0 });
          } });
          g.wildlife.recount(); window.valueAnimals = [cx, cz];
          }
          const [cx, cz] = window.valueAnimals; r.zoom = 1.2; r.centerOn(cx + 0.5, cz + 0.5); r.updateCamera();
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
