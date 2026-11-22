// One release entry point; each check gets its own process and random/map state.
import { spawn, execFileSync } from 'node:child_process';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url)), out = join(root, 'tools/release-output');
const args = process.argv.slice(2);
const allowed = ['--headless', '--browser', '--update-visuals', '--list', '--help'];
const shardArg = args.find(arg => arg.startsWith('--shard='));
const [shard, shards] = shardArg ? shardArg.slice(8).split('/').map(Number) : [1, 1];
if (!(shards >= 1 && shard >= 1 && shard <= shards) || shards > 1 && !args.includes('--browser')) throw new Error('--shard=i/n splits the browser suite: use it with --browser, 1 <= i <= n.');
if (args.some(arg => !allowed.includes(arg) && arg !== shardArg) || args.includes('--headless') && args.includes('--browser')) throw new Error('Use --headless or --browser, optionally --update-visuals.');
if (args.includes('--help')) {
  console.log('node tools/check-release.mjs [--headless | --browser [--shard=i/n]] [--update-visuals] [--list]\n--list prints the checks that would run, without running them. --shard=i/n runs the i-th of n parts of the browser suite, split by how long each check takes on CI.\nDefault: all headless and browser checks. --update-visuals explicitly replaces reference images; never use it in CI. Reports: tools/release-output/.');
  process.exit(0);
}
if (args.includes('--update-visuals') && (process.env.CI || args.includes('--headless'))) throw new Error('Visual references can only be updated explicitly in a local browser run.');
await mkdir(out, { recursive: true });
// The browser suite is every check that opens Chrome, found by name: a list kept by hand missed
// three (follow-support, lens-depth, moment-camera), which then ran on every PR, and a flaky one
// blocked merges once PRs had to pass their checks.
const files = (await readdir(new URL('./', import.meta.url))).filter(file => file.endsWith('-check.mjs')).sort();
const browserNames = new Set(files.filter(file => file.endsWith('-browser-check.mjs') || file === 'browser-save-check.mjs'));
// Seconds each browser check takes on CI (2026-11-14 run), to split the suite into parts of about
// equal length for checks.yml's parallel jobs. A check not listed counts as a minute.
const browserSeconds = { 'plant-cache-browser-check.mjs': 820, 'release-browser-check.mjs': 730, 'impostor-browser-check.mjs': 470, 'plant-render-browser-check.mjs': 400, 'plant-view-browser-check.mjs': 310, 'moments-sweep-browser-check.mjs': 170, 'intro-browser-check.mjs': 400 };
function browserShard() {
  const parts = Array.from({ length: shards }, () => ({ seconds: 0, files: [] }));
  const longestFirst = [...browserNames].sort((a, b) => (browserSeconds[b] ?? 60) - (browserSeconds[a] ?? 60) || a.localeCompare(b));
  for (const file of longestFirst) { const part = parts.reduce((a, b) => b.seconds < a.seconds ? b : a); part.seconds += browserSeconds[file] ?? 60; part.files.push(file); }
  return parts[shard - 1].files;
}
const headless = [...files.filter(file => !browserNames.has(file)), 'animal-size-audit.mjs', 'species-name-count.mjs'];
const selected = args.includes('--headless') ? headless : args.includes('--browser') ? browserShard() : [...headless, ...browserNames];
if (args.includes('--list')) { console.log(selected.join('\n')); process.exit(0); }
let revision = 'uncommitted';
try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
const report = { revision, node: process.version, ...(shards > 1 && { shard: `${shard}/${shards}` }), startedAt: new Date().toISOString(), checks: [] };
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
