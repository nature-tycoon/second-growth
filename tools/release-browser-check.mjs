// Approved images, deterministic work budgets, and real simulation + GPU measurements.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { openBrowser, projectRoot } from './browser-session.mjs';
import { PERFORMANCE_BENCHMARK_REVISION } from '../js/performance.js';

const update = process.argv.includes('--update-visuals');
if (process.argv.some((arg, i) => i > 1 && arg !== '--update-visuals')) throw new Error('Use --update-visuals to explicitly replace references.');
if (update && process.env.CI) throw new Error('CI must compare reference images, never replace them.');
const directory = join(projectRoot, 'tools/release-baselines'), out = join(projectRoot, 'tools/release-output');
await mkdir(out, { recursive: true });
let baseline;
try { baseline = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')); }
catch (error) { if (!update) throw new Error('Missing or unreadable visual references. Generate and review them with node tools/release-browser-check.mjs --update-visuals.'); }
if (!update) assert.equal(baseline.version, 2, 'Visual reference format changed; capture and review current references before comparing.');
if (update) await mkdir(directory, { recursive: true });
const maps = ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'reef', 'sumatra'];
const cases = maps.flatMap(map => [...['fast', 'high'].map(quality => ({ map, quality, scene: 'forest' })), { map, quality: 'high', scene: 'animals' }]);
const report = { startedAt: new Date().toISOString(), visual: [], performance: [], failures: [] };
const browser = await openBrowser({ label: 'release', width: 960, height: 600 });
const { evaluate } = browser;
const saveImage = (path, data) => writeFile(path, Buffer.from(data.split(',')[1], 'base64'));
const dataImage = async path => 'data:image/png;base64,' + (await readFile(path)).toString('base64');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const pendingImages = new Map();
const references = { version: 2, viewport: [960, 600], pixelThreshold: 16, maxChangedFraction: .005, maxMeanDifference: .5, scenes: {}, performance: [] };
async function load(config) {
  await browser.navigate('/tools/release-scenes.html?' + new URLSearchParams(config));
  await browser.waitFor(`!!window.releaseScene?.ready && window.releaseScene.map === ${JSON.stringify(config.map)} && window.releaseScene.kind === ${JSON.stringify(config.scene)} && window.releaseScene.quality === ${JSON.stringify(config.quality)}`, 'Release scene did not finish');
  const error = await evaluate('window.releaseScene.error'); if (error) throw new Error(error);
  browser.assertHealthy();
}
try {
  const version = await browser.send('Browser.getVersion');
  report.environment = { platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, chrome: version.product, viewport: [960, 600], renderer: 'SwiftShader', gameplayPipeline: 'main.js including input, 2D overlays and DOM UI' };
  for (const config of cases) {
    const id = `${config.map}-${config.scene}-${config.quality}`, row = { id, ...config };
    try {
      await load(config);
      row.metrics = await evaluate('window.releaseScene.metrics()');
      assert.equal(row.metrics.quality, config.quality); assert.equal(row.metrics.pixel_ratio, 1);
      row.legend = await evaluate('window.releaseScene.legend');
      row.portraits = await evaluate('window.releaseScene.portraits');
      const current = await evaluate('window.releaseScene.snapshot()');
      await saveImage(join(out, id + '-current.png'), current);
      if (id === 'pnw-forest-fast') {
        // Prove a missing/blank view would fail the reference gate without changing real files.
        const blankDifference = await evaluate(`(async () => {
          const c = document.createElement('canvas'); c.width = 960; c.height = 600;
          const ctx = c.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
          const { changedFraction, meanDifference } = await window.releaseScene.compare(c.toDataURL());
          return { changedFraction, meanDifference };
        })()`);
        assert.ok(blankDifference.changedFraction > references.maxChangedFraction && blankDifference.meanDifference > references.maxMeanDifference, 'Blank-view regression must be rejected by visual thresholds');
      }
      const reference = join(directory, id + '.png');
      if (update) {
        pendingImages.set(reference, current);
        references.scenes[id] = { ...config, metrics: row.metrics };
      } else {
        assert.ok(baseline.scenes[id], 'Scene missing from reviewed manifest');
        const expected = await dataImage(reference);
        const { diff, ...difference } = await evaluate(`window.releaseScene.compare(${JSON.stringify(expected)})`);
        row.difference = difference; await saveImage(join(out, id + '-diff.png'), diff);
        assert.ok(difference.changedFraction <= baseline.maxChangedFraction && difference.meanDifference <= baseline.maxMeanDifference, `${id}: image changed (${(difference.changedFraction * 100).toFixed(2)}% pixels, mean ${difference.meanDifference.toFixed(2)}); review current/reference/diff images`);
        // Stable work budgets run on every platform. Timing comparisons need matching machines.
        for (const key of ['triangles', 'draw_calls', 'geometries', 'textures']) assert.ok(row.metrics[key] <= baseline.scenes[id].metrics[key] * 1.1 + 2, `${id}: ${key} exceeds reviewed work budget`);
      }
      await saveImage(join(out, id + '-expected.png'), update ? current : await dataImage(reference));
      await evaluate('window.releaseScene.interactions()'); browser.assertHealthy();
      row.passed = true; console.log(`PASS ${id}: approved appearance, draw budget, edit + undo + restore`);
    } catch (error) { row.error = error.message; report.failures.push(`${id}: ${error.message}`); console.error(`FAIL ${id}: ${error.message}`); }
    report.visual.push(row);
  }
  report.environment.gpu = await evaluate('window.releaseScene.renderer.gpuName()');
  const matches = baseline?.version === references.version && baseline.environment && ['platform', 'arch', 'cpu', 'chrome', 'gpu'].every(key => baseline.environment[key] === report.environment[key])
    && baseline.performance?.every(row => row.benchmark_revision === PERFORMANCE_BENCHMARK_REVISION);
  report.timingBaselineMatches = !!matches;
  for (const config of [{ map: 'pnw', scene: 'forest', quality: 'fast' }, { map: 'serengeti', scene: 'herd', quality: 'fast' }, { map: 'pnw', scene: 'planting', quality: 'fast' }]) {
    try {
      await evaluate(`localStorage.setItem('second-growth-settings', JSON.stringify({ analytics: false, autosave: false, quality: 'fast', qualityChosen: true, shadows: true, wind: true, weather: true, dayCycle: false, fps: '60', muted: true, music: false, nature: false })); sessionStorage.setItem('second-growth-pending', JSON.stringify(${JSON.stringify({ map: config.map, mode: 'free', difficulty: 'standard' })}));`);
      await browser.navigate('/');
      await browser.waitFor(`window.secondGrowth?.game.map === ${JSON.stringify(config.map)} && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))`, 'Live game did not finish loading');
      const row = await evaluate(`(async () => { const { measureGameplay } = await import('/tools/gameplay-benchmark.mjs'); return measureGameplay(${JSON.stringify(config)}); })()`); browser.assertHealthy();
      // Catch catastrophic stalls on software CI; these are not a 30/60 FPS hardware promise.
      assert.ok(row.frameP95Ms < 1500 && row.simulationP95Ms < 500, `${config.scene}: excessive frame/simulation stalls`);
      assert.equal(row.quality, 'fast'); assert.equal(row.res_scale, 1); assert.equal(row.shadows, true);
      const before = matches && baseline.performance.find(p => p.scenario === row.scenario && p.map === row.map);
      if (before) {
        // Both signals must regress to reject a run: a single noisy tail sample is reported separately.
        assert.ok(!(row.frameMedianMs > before.frameMedianMs * 1.35 + 3 && row.frameP95Ms > before.frameP95Ms * 1.5 + 8), `${config.scene}: typical and slow frames both regressed on the same machine`);
      }
      report.performance.push(row); references.performance.push(row);
      console.log(`PASS gameplay ${config.scene}: median ${row.frameMedianMs.toFixed(1)} ms, p95 ${row.frameP95Ms.toFixed(1)} ms; simulation p95 ${row.simulationP95Ms.toFixed(1)} ms`);
    } catch (error) { report.failures.push(`gameplay/${config.scene}: ${error.message}`); console.error(`FAIL gameplay/${config.scene}: ${error.message}`); }
  }
  if (!report.failures.length && update) {
    references.environment = report.environment;
    for (const [path, data] of pendingImages) await saveImage(path, data);
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(references, null, 2));
  }
} finally {
  await browser.close();
  await writeFile(join(out, 'renderer.json'), JSON.stringify(report, null, 2));
  const cards = report.visual.map(row => `<article><h2>${escape(row.id)}</h2><p>${escape(row.error || 'Passed')}</p><div class="images">${['expected', 'current', 'diff'].map(kind => `<figure><figcaption>${kind}</figcaption><a href="${row.id}-${kind}.png"><img src="${row.id}-${kind}.png" alt="${escape(row.id)} ${kind}"></a></figure>`).join('')}</div><details><summary>Portrait order, animal positions and measurements</summary><pre>${escape(JSON.stringify({ metrics: row.metrics, portraits: row.portraits, legend: row.legend }, null, 2))}</pre></details></article>`).join('');
  await writeFile(join(out, 'review.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Second Growth release review</title><style>body{margin:24px;background:#eff2e9;color:#23392c;font:15px system-ui}article{padding:16px;margin:20px 0;background:white;border-radius:12px}.images{display:flex;gap:12px}figure{margin:0;flex:1;min-width:0}img{width:100%}pre{white-space:pre-wrap}h2{font-size:18px}</style><h1>Second Growth release review</h1><p>${report.failures.length ? escape(report.failures.join('; ')) : 'All renderer checks passed.'}</p><p>Reference, current and difference images. Click an image for full size. Animal portraits use inspection framing, read left to right in rows of six (see portrait order); physical size is checked separately. Regional ecology and palettes remain distinct; these references protect the shared rendering style.</p><h2>Complete gameplay measurements</h2><p>Runs the live main.js loop: simulation, input, 3D drawing, 2D overlays and DOM interface, with a GPU completion barrier. Scripted panning and planting add representative work; simulated time is fixed per frame. CI uses software graphics. Timing comparisons ${report.timingBaselineMatches ? 'used a matching machine baseline' : 'were reported without comparing different machines or benchmark revisions'}; draw budgets and catastrophic-stall limits apply everywhere.</p><pre>${escape(JSON.stringify({ environment: report.environment, measurements: report.performance }, null, 2))}</pre>${cards}</html>`);
}
if (report.failures.length) throw new Error(`${report.failures.length} renderer checks failed. Review tools/release-output/review.html.`);
console.log(update ? 'Reference images captured. Review and commit tools/release-baselines/ with the change.' : 'Renderer release checks passed. Review: tools/release-output/review.html');
