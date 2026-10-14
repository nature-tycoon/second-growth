// node tools/plant-prep-profile.mjs [--software] [--cpu=4] [--samples=60]
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { openBrowser, projectRoot } from './browser-session.mjs';

const args = process.argv.slice(2), software = args.includes('--software');
const cpu = Number(args.find(a => a.startsWith('--cpu='))?.split('=')[1] || 1);
const samples = Number(args.find(a => a.startsWith('--samples='))?.split('=')[1] || 60);
if (args.some(a => !/^--(software|cpu=\d+|samples=\d+)$/.test(a)) || cpu < 1 || cpu > 8 || samples < 30 || samples > 240) throw new Error('Use --software --cpu=1|4 --samples=30..240');
const out = join(projectRoot, 'tools/release-output'); await mkdir(out, { recursive: true });
const path = join(out, `plant-prep-profile-cpu${cpu}.json`);
const report = { environment: { cpu: cpus()[0]?.model, platform: process.platform, cpuThrottle: cpu, software }, measurements: [] };
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function summaryHtml() {
  const rows = report.measurements.map(m => {
    const c = m.config, phase = key => m.phases[key].meanMs.toFixed(2);
    const values = [c.map, c.density, c.isolation === 'simulation-off' ? 'Frozen ecosystem' : c.motion ? 'Panning' : 'Fixed camera',
      m.preparation.meanMs.toFixed(2), phase('plantRebuild'), phase('terrain'), phase('animals'), phase('visibility'),
      (m.phases.shadowSync.meanMs + m.phases.shadowSelection.meanMs).toFixed(2),
      `${m.viewInvalidation.cached}/${c.samples}`, m.frames.filter(f => f.rebuild).length,
      m.frames.filter(f => f.view.revision && !f.rebuild).length];
    return '<tr>' + values.map(v => '<td>' + escape(v) + '</td>').join('') + '</tr>';
  }).join('');
  const headers = ['Map', 'Density', 'Scene', 'Prep ms', 'Plant generation ms', 'Terrain ms', 'Animals ms', 'Visibility ms', 'Shadows ms', 'Cached frames', 'Growth rebuild frames', 'Other revision frames'];
  return `<!doctype html><meta charset="utf-8"><title>Plant preparation investigation</title><style>body{font:15px/1.5 system-ui;margin:32px;color:#243b2d;background:#eef2e9}main{max-width:1400px;margin:auto}table{border-collapse:collapse;background:white;width:100%;font-variant-numeric:tabular-nums}td,th{padding:9px;border-bottom:1px solid #dce4d5;text-align:right}td:first-child,th:first-child{text-align:left}pre{white-space:pre-wrap}.table{overflow:auto}p{max-width:1000px}</style><main><h1>Plant preparation investigation</h1><p>Production game loop, Fast graphics, hardware graphics unless explicitly labelled software, fixed seeded habitats, 24 or 256 active animals. Each scene has 30 warm-up frames and ${samples} measured frames. Automatic cinematic camera moves are suppressed for controlled comparisons. CPU throttling is a diagnostic simulation of slower processing, not a measurement of a real phone.</p><pre>${escape(JSON.stringify(report.environment, null, 2))}</pre><p>All timings below are means across every measured frame, including frames with no work in a phase. Preparation is CPU drawing work minus the rendering hand-off; it excludes the GPU completion wait. Highlighted phases do not include every preparation operation. Detailed bounds, packing, scan and replay timings overlap their parent phase and are recorded separately in the JSON.</p><div class="table"><table><thead><tr>${headers.map(v => '<th>' + escape(v) + '</th>').join('')}</tr></thead><tbody>${rows}</tbody></table></div><h2>What the trace distinguishes</h2><ul><li>A cached frame reuses the packed plant buffers without another visibility pass.</li><li>Growth rebuilds include comparing world arrays, regenerating changed tiles, replaying unchanged tiles and finalizing source buffers.</li><li>A source revision invalidates the complete visible plant batch pass. Other revision frames can reveal canopy scaffolds or detail changes that invalidate otherwise unchanged vegetation.</li><li>Panning changes the camera matrix and requires a new visibility pass under the current cache policy.</li></ul><p>The report retains per-frame camera state, invalidation reasons, mutation origins, region sizes and all phase timings. Trace wrappers add diagnostic overhead. <a href="plant-prep-profile-cpu${cpu}.json">Read the complete JSON report</a>.</p>${report.error ? '<pre>' + escape(report.error) + '</pre>' : ''}</main>`;
}
const browser = await openBrowser({ label: 'plant-preparation', software });
try {
  report.environment.chrome = (await browser.send('Browser.getVersion')).product;
  await browser.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  for (const map of ['pnw', 'sumatra', 'serengeti']) {
    await browser.evaluate(`localStorage.setItem('second-growth-settings', JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:'fast',qualityChosen:true,fps:'60',shadows:true,dayCycle:false,v:2}));sessionStorage.setItem('second-growth-pending',JSON.stringify({map:${JSON.stringify(map)},mode:'free',difficulty:'standard'}));`);
    await browser.navigate('/');
    await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game boot');
    report.environment.gpu = await browser.evaluate('window.secondGrowth.renderer.gpuName()');
    if (!software && /SwiftShader|llvmpipe|software/i.test(report.environment.gpu || '')) throw new Error('Hardware graphics unavailable: rerun --software');
    for (const config of [
      { density: 'low', isolation: 'normal', motion: false },
      { density: 'high', isolation: 'simulation-off', motion: false },
      { density: 'high', isolation: 'normal', motion: false },
      { density: 'high', isolation: 'normal', motion: true },
    ]) {
      const options = { map, ...config, quality: 'fast', samples, warmup: 30, speed: 1 };
      const result = await browser.evaluate(`(async()=>{const {measurePlantPreparation}=await import('/tools/plant-prep-measure.mjs');return measurePlantPreparation(${JSON.stringify(options)});})()`);
      browser.assertHealthy(); report.measurements.push(result);
      const means = Object.fromEntries(['plantRebuild', 'terrain', 'animals', 'visibility', 'shadowSync', 'shadowSelection'].map(key => [key, +result.phases[key].meanMs.toFixed(2)]));
      console.log(JSON.stringify({ map, ...config, prepMeanMs: +result.preparation.meanMs.toFixed(2), means, cache: result.viewInvalidation }));
      await writeFile(path, JSON.stringify(report, null, 2));
    }
  }
} catch (error) { report.error = error.stack; throw error; }
finally {
  await browser.close(); await writeFile(path, JSON.stringify(report, null, 2));
  await writeFile(path.replace(/\.json$/, '.html'), summaryHtml());
}
console.log('Report: ' + path);
