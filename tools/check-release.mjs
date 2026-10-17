// One release entry point; each check gets its own process and random/map state.
import { spawn, execFileSync } from 'node:child_process';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url)), out = join(root, 'tools/release-output');
const args = process.argv.slice(2);
const allowed = ['--headless', '--browser', '--update-visuals', '--help'];
if (args.some(arg => !allowed.includes(arg)) || args.includes('--headless') && args.includes('--browser')) throw new Error('Use --headless or --browser, optionally --update-visuals.');
if (args.includes('--help')) {
  console.log('node tools/check-release.mjs [--headless | --browser] [--update-visuals]\nDefault: all headless and browser checks. --update-visuals explicitly replaces reference images; never use it in CI. Reports: tools/release-output/.');
  process.exit(0);
}
if (args.includes('--update-visuals') && (process.env.CI || args.includes('--headless'))) throw new Error('Visual references can only be updated explicitly in a local browser run.');
await mkdir(out, { recursive: true });
const browserNames = new Set(['animal-behavior-browser-check.mjs', 'bird-variant-browser-check.mjs', 'browser-save-check.mjs', 'animal-locate-browser-check.mjs', 'canopy-reveal-browser-check.mjs', 'cervid-groups-browser-check.mjs', 'plant-view-browser-check.mjs', 'plant-render-browser-check.mjs', 'field-audio-browser-check.mjs', 'moments-browser-check.mjs', 'perf-analytics-browser-check.mjs', 'tool-actions-browser-check.mjs', 'map-catalog-browser-check.mjs', 'release-browser-check.mjs']);
browserNames.add('plant-cache-browser-check.mjs');
browserNames.add('website-security-browser-check.mjs');
browserNames.add('animal-trails-browser-check.mjs');
const files = (await readdir(new URL('./', import.meta.url))).filter(file => file.endsWith('-check.mjs')).sort();
const headless = [...files.filter(file => !browserNames.has(file)), 'animal-size-audit.mjs'];
const selected = args.includes('--headless') ? headless : args.includes('--browser') ? [...browserNames] : [...headless, ...browserNames];
let revision = 'uncommitted';
try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
const report = { revision, node: process.version, startedAt: new Date().toISOString(), checks: [] };
let failed = false;
for (const file of selected) {
  const started = Date.now();
  const extra = file === 'plant-performance-check.mjs' ? ['--checks-only'] : file === 'release-browser-check.mjs' && args.includes('--update-visuals') ? ['--update-visuals'] : [];
  console.log(`Checking ${file}…`);
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, [join(root, 'tools', file), ...extra], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', timedOut = false, settled = false, forceKill;
    child.stdout.on('data', data => { output += data; if (browserNames.has(file)) process.stdout.write(data); });
    child.stderr.on('data', data => { output += data; });
    const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); forceKill = setTimeout(() => child.kill('SIGKILL'), 10000); }, browserNames.has(file) ? 1200000 : 300000);
    const finish = (code, signal, error) => { if (settled) return; settled = true; clearTimeout(timeout); clearTimeout(forceKill); resolve({ file, exitCode: code, signal, timedOut, error: error?.message, durationMs: Date.now() - started, output }); };
    child.once('error', error => finish(null, null, error)); child.once('close', finish);
  });
  await writeFile(join(out, file + '.log'), result.output);
  const { output, ...summary } = result; report.checks.push(summary);
  if (result.exitCode !== 0 || result.timedOut) {
    failed = true; console.error(`FAIL ${file}${result.timedOut ? ' (timeout)' : ''}\n${output.slice(-3500)}`);
  } else console.log(`PASS ${file} (${(result.durationMs / 1000).toFixed(1)}s)`);
  // Keep a useful report even when a later check is interrupted.
  report.passed = !failed; await writeFile(join(out, 'checks.json'), JSON.stringify(report, null, 2));
}
console.log(`${report.checks.length} scripts checked; ${failed ? 'release blocked' : 'all passed'}. Logs: tools/release-output/`);
process.exitCode = failed ? 1 : 0;
