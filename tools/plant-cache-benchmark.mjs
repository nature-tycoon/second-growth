// A/B measurements in alternating order, including GPU completion and unchanged ecology.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, projectRoot } from './browser-session.mjs';
const stage = process.argv.find(a => a.startsWith('--stage='))?.split('=')[1] || 'pan';
assert.ok(['pan', 'regional'].includes(stage));
const samples = 120, report = { stage, cpuThrottle: 4, measurements: [], comparisons: [] };
const out = join(projectRoot, 'tools/release-output'); await mkdir(out, { recursive: true });
const path = join(out, 'plant-cache-' + stage + '.json');
const browser = await openBrowser({ label: 'plant-cache-benchmark', software: !!process.env.CI });
try {
  report.chrome = (await browser.send('Browser.getVersion')).product;
  await browser.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  for (const map of ['pnw', 'sumatra', 'serengeti']) {
    await browser.evaluate(`localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'fast',qualityChosen:true,fps:'60',shadows:true,dayCycle:false,v:2}));sessionStorage.setItem('second-growth-pending',JSON.stringify({map:${JSON.stringify(map)},mode:'free',difficulty:'standard'}));`);
    await browser.navigate('/');
    await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game boot');
    report.gpu = await browser.evaluate('window.secondGrowth.renderer.gpuName()');
    const panMargin = await browser.evaluate('window.secondGrowth.renderer.flora.plantView.panMargin');
    report.panMargin = panMargin;
    for (let round = 0; round < 2; round++) for (const enabled of round ? [true, false] : [false, true]) {
      const optimizations = stage === 'pan' ? { panMargin: enabled ? panMargin : 0 } : { panMargin, incrementalView: enabled };
      const config = { map, density: 'high', isolation: 'normal', motion: stage === 'pan', quality: 'fast', samples, warmup: 30, speed: 1, optimizations };
      const result = await browser.evaluate(`(async()=>{const {measurePlantPreparation}=await import('/tools/plant-prep-measure.mjs');return measurePlantPreparation(${JSON.stringify(config)});})()`);
      browser.assertHealthy(); report.measurements.push({ round, enabled, ...result });
      console.log(JSON.stringify({ map, round, enabled, prepMeanMs: +result.preparation.meanMs.toFixed(2), visibilityMeanMs: +result.phases.visibility.meanMs.toFixed(2), frameMeanMs: +result.gameplay.frameMeanMs.toFixed(2), cached: result.viewInvalidation.cached, triangles: result.gameplay.trianglesMedian }));
      await writeFile(path, JSON.stringify(report, null, 2));
    }
    const rows = report.measurements.filter(m => m.config.map === map);
    for (const r of rows) {
      assert.equal(r.gameplay.initialSignature, rows[0].gameplay.initialSignature);
      assert.equal(r.gameplay.finalSignature, rows[0].gameplay.finalSignature);
    }
    const before = rows.find(r => r.round === 1 && !r.enabled), after = rows.find(r => r.round === 1 && r.enabled);
    report.comparisons.push({ map, visibilityBeforeMs: before.phases.visibility.meanMs, visibilityAfterMs: after.phases.visibility.meanMs,
      frameBeforeMs: before.gameplay.frameMeanMs, frameAfterMs: after.gameplay.frameMeanMs,
      visibilitySavedPercent: 100 * (1 - after.phases.visibility.meanMs / before.phases.visibility.meanMs),
      frameSavedPercent: 100 * (1 - after.gameplay.frameMeanMs / before.gameplay.frameMeanMs),
      triangleIncreasePercent: 100 * (after.gameplay.trianglesMedian / before.gameplay.trianglesMedian - 1) });
  }
} catch (error) { report.error = error.stack; throw error; }
finally {
  await browser.close(); await writeFile(path, JSON.stringify(report, null, 2));
  const headings = ['Map', 'Visibility before ms', 'Visibility after ms', 'Frame before ms', 'Frame after ms', 'Visibility saved %', 'Frame saved %', 'Extra triangles %'];
  const rows = report.comparisons.map(r => '<tr>' + Object.values(r).map(v => '<td>' + (typeof v === 'number' ? v.toFixed(2) : v) + '</td>').join('') + '</tr>').join('');
  await writeFile(path.replace(/\.json$/, '.html'), `<!doctype html><meta charset="utf-8"><title>Plant cache ${stage} benchmark</title><style>body{font:15px/1.6 system-ui;background:#eef2e9;color:#243b2d;margin:32px}table{border-collapse:collapse;background:white;font-variant-numeric:tabular-nums}th,td{padding:10px;text-align:right;border-bottom:1px solid #ddd}p{max-width:1000px}</style><h1>Plant cache: ${stage}</h1><p>Warmed second-round comparisons, alternating execution order, 120 measured frames per run. Local Chrome, hardware graphics unless CI explicitly uses software, fourfold CPU throttling. Frame work includes GPU completion; these are not real phone FPS measurements. Both variants retain the same starting and final ecosystem signatures.</p><table><thead><tr>${headings.map(v => '<th>' + v + '</th>').join('')}</tr></thead><tbody>${rows}</tbody></table><p><a href="plant-cache-${stage}.json">Complete results and per-frame traces</a>.</p>`);
}
console.log('Report: ' + path);
