// Real GPU by default; isolated temporary Chrome profile, no player saves.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { openBrowser, projectRoot } from './browser-session.mjs';

const options = { maps: 'pnw,amazon,serengeti', densities: 'low,medium,high', quality: 'fast', samples: '120', rounds: '2', width: '960', height: '600', dpr: '1', speed: '1' };
let software = !!process.env.CI;
for (const arg of process.argv.slice(2)) {
  if (arg === '--software') { software = true; continue; }
  const match = /^--(maps|densities|quality|samples|rounds|width|height|dpr|speed)=(.+)$/.exec(arg);
  if (!match) throw new Error('Use --maps=pnw,amazon,serengeti --densities=low,medium,high --quality=fast|high --samples=120 --rounds=2 --width=960 --height=600 --dpr=1 --speed=1|2|3 [--software]');
  options[match[1]] = match[2];
}
const maps = options.maps.split(','), samples = Number(options.samples), rounds = Number(options.rounds);
const densities = options.densities.split(','), width = Number(options.width), height = Number(options.height), pixelRatio = Number(options.dpr);
const speed = Number(options.speed); assert.ok([1, 2, 3].includes(speed));
const renderPixelRatio = Math.min(pixelRatio, options.quality === 'fast' ? 1 : 2);
assert.ok(maps.length && maps.every(m => ['pnw', 'amazon', 'serengeti', 'atlanta', 'chinandega', 'reef', 'sumatra'].includes(m)));
assert.ok(['fast', 'high'].includes(options.quality));
assert.ok(Number.isInteger(samples) && samples >= 30 && samples <= 600);
assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 4);
assert.ok(densities.length && densities.every(d => ['low', 'medium', 'high'].includes(d)));
assert.ok(Number.isInteger(width) && width >= 320 && width <= 3840 && Number.isInteger(height) && height >= 240 && height <= 2160);
assert.ok([1, 2].includes(pixelRatio));
const out = join(projectRoot, 'tools/release-output'); await mkdir(out, { recursive: true });
const stem = 'ecosystem-profile-' + options.quality + (width === 960 && height === 600 && pixelRatio === 1 ? '' : `-${width}x${height}-dpr${pixelRatio}`) + (speed === 1 ? '' : '-speed' + speed);
const report = { startedAt: new Date().toISOString(), environment: { platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model,
  viewport: [width, height], pixelRatio, renderPixelRatio, speed, graphics: software ? 'software' : 'hardware requested', quality: options.quality }, measurements: [], comparisons: [] };
const browser = await openBrowser({ label: 'ecosystem-profile', software, width, height, pixelRatio });
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
try {
  report.environment.chrome = (await browser.send('Browser.getVersion')).product;
  for (const map of maps) {
    await browser.evaluate(`localStorage.setItem('second-growth-settings',JSON.stringify({analytics:false,autosave:false,music:false,nature:false,quality:${JSON.stringify(options.quality)},qualityChosen:true,fps:'60',shadows:true,dayCycle:false,v:2}));sessionStorage.setItem('second-growth-pending',JSON.stringify({map:${JSON.stringify(map)},mode:'free',difficulty:'standard'}));`);
    await browser.navigate('/');
    await browser.waitFor('!!window.secondGrowth && (!document.getElementById("loading-screen") || document.getElementById("loading-screen").classList.contains("done"))', 'Game did not boot');
    report.environment.gpu = await browser.evaluate('window.secondGrowth.renderer.gpuName()');
    if (!software && /SwiftShader|llvmpipe|software/i.test(report.environment.gpu || '')) throw new Error('Hardware graphics unavailable; rerun --software to explicitly label software measurements');
    for (const density of densities) for (const motion of density === 'high' ? [false, true] : [false]) {
      const modes = ['normal', 'simulation-off', 'vegetation-hidden'];
      for (let round = 0; round < rounds; round++) for (const isolation of round % 2 ? [...modes].reverse() : modes) {
        const config = { map, density, isolation, motion, quality: options.quality, samples, warmup: 30, speed };
        const row = await browser.evaluate(`(async()=>{const {measureGameplay}=await import('/tools/gameplay-benchmark.mjs');return measureGameplay(${JSON.stringify(config)});})()`);
        browser.assertHealthy();
        assert.equal(row.samples, samples); assert.equal(row.quality, options.quality);
        assert.equal(row.res_scale, 1); assert.equal(row.shadows, true); assert.equal(row.pixel_ratio, renderPixelRatio);
        if (isolation === 'simulation-off') { assert.deepEqual(row.final, row.initial, 'Disabled simulation must leave ecosystem state fixed'); assert.equal(row.finalSignature, row.initialSignature); }
        report.measurements.push({ round, ...row });
        console.log(`${map}/${density}/${motion ? 'moving' : 'stationary'}/${isolation} #${round + 1}: ${row.fps.toFixed(1)} FPS, work ${row.frameMedianMs.toFixed(1)} ms (p95 ${row.frameP95Ms.toFixed(1)}), sim p95 ${row.simulationP95Ms.toFixed(1)} ms, draws ${row.drawCallsMedian}`);
        await writeFile(join(out, stem + '.json'), JSON.stringify(report, null, 2));
      }
      const group = report.measurements.filter(r => r.map === map && r.density === density && r.motion === motion);
      for (const isolation of modes.slice(1)) {
        const normal = group.filter(r => r.isolation === 'normal'), isolated = group.filter(r => r.isolation === isolation);
        assert.ok(normal.every(r => JSON.stringify(r.initial) === JSON.stringify(isolated[0].initial)), 'Equivalent starting ecosystem counts');
        assert.ok(group.every(r => r.initialSignature === group[0].initialSignature), 'Equivalent starting geometry, random state and wildlife');
        if (isolation === 'vegetation-hidden') for (const row of isolated) { assert.deepEqual(row.final, normal.find(n => n.round === row.round).final, 'Hidden vegetation must retain simulation outcomes'); assert.equal(row.finalSignature, normal.find(n => n.round === row.round).finalSignature, 'Vegetation isolation must not alter simulation'); }
        const before = median(normal.map(r => r.frameMedianMs)), after = median(isolated.map(r => r.frameMedianMs));
        report.comparisons.push({ map, density, motion, isolation, frameWorkBeforeMs: before, frameWorkAfterMs: after, savedMs: before - after,
          fpsBefore: median(normal.map(r => r.fps)), fpsAfter: median(isolated.map(r => r.fps)),
          drawsBefore: median(normal.map(r => r.drawCallsMedian)), drawsAfter: median(isolated.map(r => r.drawCallsMedian)) });
      }
    }
  }
  // Exercise overlay in the actual game, including world replacement and long visible stalls.
  await browser.navigate('/?perf=1');
  await browser.waitFor('window.secondGrowth?.diagnostics?.samples.length > 3', 'Overlay did not record the live loop');
  report.overlay = await browser.evaluate(`(()=>{
    const {game,renderer:r,ui,diagnostics:d}=window.secondGrowth;
    const before=r.perf.time;r.perf.last=performance.now()-1500;r.draw(game,ui.state,0);
    const elapsed=r.perf.time-before; if(elapsed < 1500) throw new Error('Long visible stall was discarded');
    const text=d.element.textContent;if(!text.includes('FPS')||!text.includes('triangles')||!text.includes('sim'))throw new Error('Overlay metrics missing');
    game.newGame(1987,'free','standard',game.map); game.speed=0;
    return {text,longStallCounted:true};
  })()`);
  await browser.waitFor('window.secondGrowth.diagnostics.wildlife === window.secondGrowth.game.wildlife', 'Overlay did not follow world replacement');
  await browser.evaluate('window.secondGrowth.ui.closeModal()');
  await browser.waitFor('window.secondGrowth.diagnostics.samples.length === 180 && window.secondGrowth.diagnostics.samples[0].interval < 100', 'Overlay did not settle after world replacement');
  await browser.send('Page.captureScreenshot', { format: 'png' }).then(r => writeFile(join(out, 'performance-overlay.png'), Buffer.from(r.data, 'base64')));
  browser.assertHealthy(); report.finishedAt = new Date().toISOString();
} catch (error) { report.error = error.stack; throw error; }
finally {
  await browser.close();
  await writeFile(join(out, stem + '.json'), JSON.stringify(report, null, 2));
  const rows = report.measurements.map(r => `<tr><td>${r.map}</td><td>${r.density}</td><td>${r.motion ? 'moving' : 'still'}</td><td>${r.isolation}</td><td>${r.round + 1}</td><td>${r.fps.toFixed(1)}</td><td>${r.frameMedianMs.toFixed(2)}</td><td>${r.frameP95Ms.toFixed(2)}</td><td>${r.simulationP95Ms.toFixed(2)}</td><td>${r.drawCallsMedian}</td></tr>`).join('');
  await writeFile(join(out, stem + '.html'), `<!doctype html><meta charset="utf-8"><title>Ecosystem performance</title><style>body{font:14px system-ui;margin:24px;background:#eef2e9;color:#243b2d}table{border-collapse:collapse;background:white}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:right}pre{white-space:pre-wrap}</style><h1>Ecosystem performance</h1><p>Same seeded starting habitats, 24/96/256 active animals, fixed simulated time and rendering clock. FPS includes the 60 FPS cap and browser scheduling. Frame work includes GPU completion; it is not the frame interval. Simulation-off freezes the starting habitat. Vegetation-hidden retains simulation and renderer updates. Source phase times overlap.</p><pre>${JSON.stringify(report.environment, null, 2)}</pre><table><thead><tr>${['Map','Density','Camera','Mode','Round','FPS','Work ms','p95 ms','Sim p95 ms','Draws'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><h2>Isolation comparisons</h2><pre>${JSON.stringify(report.comparisons, null, 2)}</pre><p>Full phase, shadow, population, geometry and timing data: <a href="${stem}.json">JSON report</a>.</p>`);
}
console.log('Report: tools/release-output/' + stem + '.html');
