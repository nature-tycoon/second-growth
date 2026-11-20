#!/usr/bin/env node
// What a change touches, before you write it: the decision records whose rules
// name the files, the checks that exercise them, and the skills to run.
//
//   node tools/impact.mjs                  files changed on this branch (vs origin/main) and uncommitted
//   node tools/impact.mjs js/sim/grazing.js js/render3d/actors.js   files you plan to change
//   node tools/impact.mjs --run            also run the headless checks it lists
//   node tools/impact.mjs --all            include checks that reach the files indirectly
//
// Everything is derived from the code and docs as they are (imports, decision
// Rules sections), so nothing here goes stale. Read the records it names first:
// their Rules are the invariants a change must keep.

import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2);
const run = argv.includes('--run');
const git = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

let files = argv.filter(a => !a.startsWith('--')).map(f => relative(root, resolve(f)));
if (!files.length) {
  const base = git('merge-base', 'HEAD', 'origin/main');
  files = [...new Set([...git('diff', '--name-only', base).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')])].filter(Boolean);
}
if (!files.length) { console.log('No changed files; name the files you plan to change.'); process.exit(0); }

// Import graph over js/ and tools/ (static and dynamic string imports).
function* walk(dir) {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|vendor|output|^\./.test(e.name)) yield* walk(p); }
    else if (/\.m?js$/.test(e.name)) yield p;
  }
}
const importers = new Map();
for (const f of [...walk('js'), ...walk('tools')]) {
  const src = readFileSync(join(root, f), 'utf8');
  for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const dep = relative(root, resolve(root, dirname(f), m[1]));
    if (!importers.has(dep)) importers.set(dep, new Set());
    importers.get(dep).add(f);
  }
}
// Hubs import half the game; walking through them would list every check for every change.
// So is any module more than a dozen files import (data tables, the wildlife core).
const HUBS = new Set(['js/game.js', 'js/config.js', 'js/rng.js', 'js/biome.js', 'js/main.js', 'js/i18n.js', 'tools/browser-session.mjs']);
for (const [f, by] of importers) if (by.size > 12) HUBS.add(f);
function checksFor(file) {
  const found = new Map(), seen = new Set([file]);
  let frontier = [file];
  for (let depth = 1; depth <= 2 && frontier.length; depth++) {
    const next = [];
    for (const f of frontier) for (const imp of importers.get(f) ?? []) {
      if (seen.has(imp)) continue;
      seen.add(imp);
      if (/^tools\/.*-check\.mjs$/.test(imp)) { if (!found.has(imp)) found.set(imp, depth); }
      else if (!HUBS.has(imp)) next.push(imp);
    }
    frontier = next;
  }
  // A check named after the file exercises it even when it loads it through the game.
  const stem = basename(file).replace(/\.m?js$/, '');
  for (const c of readdirSync(join(root, 'tools'))) if (c.endsWith('-check.mjs') && c.startsWith(stem + '-') && !found.has('tools/' + c)) found.set('tools/' + c, 1);
  return found;
}

// Decision records whose Rules section (or title) names the file.
const decisionDir = join(root, 'docs/decisions');
const records = readdirSync(decisionDir).filter(f => /^\d{4}-.*\.md$/.test(f)).map(f => {
  const text = readFileSync(join(decisionDir, f), 'utf8');
  return { f, title: text.split('\n')[0].replace(/^#\s*/, ''), rules: text.split(/\n## History/)[0] };
});
const agentsLines = readFileSync(join(root, 'AGENTS.md'), 'utf8').split('\n');
function recordsFor(file) {
  const short = file.replace(/^js\//, ''), stem = basename(file);
  const hits = records.filter(r => r.rules.includes(short) || r.rules.includes(stem)).map(r => r.f);
  // AGENTS.md's index line for a record often names its files when the record itself doesn't.
  for (const line of agentsLines) {
    const m = line.match(/\]\(docs\/decisions\/(\d{4}-[^)]+)\)/);
    if (m && (line.includes(short) || line.includes('`' + stem + '`')) && !hits.includes(m[1])) hits.push(m[1]);
  }
  return hits;
}

// Standing rules from AGENTS.md and the skills, by area.
const AREA_RULES = [
  [/^js\/(sim|data)\//, 'ecology: /balance (node tools/calibrate.mjs <map> 15 3 before and after)'],
  [/^js\/(sim\/(steering|wildlife-move|animal-course|ground-obstacles|bird-behavior|canopy)|render3d\/actors)/, 'movement: node tools/motion-sweep-check.mjs before and after'],
  [/^js\/render3d\//, 'drawing: /perf (tools/play-profile.mjs) for anything that could cost frame time; perf-guard-check runs in CI'],
  [/^js\/(sim|render3d|data)\//, 'species: ask trait(def, name), not a species name; node tools/species-name-count.mjs'],
  [/^website\//, 'website: node tools/website-check.mjs (and website-security-check if an inline script changed)'],
  [/^server\//, 'backend: node tools/backend-check.mjs'],
  [/^js\/terrain-edit|^js\/tools\.js/, 'terrain edits: node tools/terrain-edit-check.mjs (one edit path, decision 0048)'],
  [/^index\.html$/, 'loading screen inline script: node tools/website-security-check.mjs (CSP hash)'],
];

const allChecks = new Map(), allRecords = new Set(), rules = new Set();
for (const f of files) {
  const recs = recordsFor(f), checks = checksFor(f);
  recs.forEach(r => allRecords.add(r));
  for (const [c, d] of checks) allChecks.set(c, Math.min(d, allChecks.get(c) ?? 9));
  for (const [re, rule] of AREA_RULES) if (re.test(f)) rules.add(rule);
  const hub = HUBS.has(f) ? ' (hub file: run the whole headless suite, node tools/check-release.mjs --headless)' : '';
  if (recs.length || checks.size || hub) console.log(`${f}: ${recs.length} record(s), ${checks.size} check(s)${hub}`);
}
if (allRecords.size) {
  console.log('\nRead the Rules of:');
  for (const r of allRecords) console.log(`  docs/decisions/${r}  ${records.find(x => x.f === r).title}`);
}
const sorted = [...allChecks].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
const all = argv.includes('--all');
// Direct users first; checks two imports away only with --all, or when there are few direct ones.
const near = sorted.filter(([, d]) => d === 1);
const shown = all || near.length < 4 ? sorted : near;
if (shown.length < sorted.length) console.log(`\n(${sorted.length - shown.length} more checks reach these files indirectly: --all lists them; the headless CI suite runs them all)`);
const headless = shown.filter(([c]) => !c.includes('browser'));
const browser = shown.filter(([c]) => c.includes('browser'));
if (headless.length) console.log(`\nHeadless checks (closest first):\n  ${headless.map(([c]) => `node ${c}`).join('\n  ')}`);
if (browser.length) console.log(`\nBrowser checks (heavy; run under nice -n 15, see /testing):\n  ${browser.map(([c]) => c.replace('tools/', '')).join(', ')}`);
if (rules.size) console.log(`\nAlso:\n  ${[...rules].join('\n  ')}`);

if (run && headless.length) {
  console.log('');
  let failed = 0;
  for (const [c] of headless) {
    const r = spawnSync('nice', ['-n', '10', 'node', c], { cwd: root, encoding: 'utf8', timeout: 600000 });
    const ok = r.status === 0;
    if (!ok) failed++;
    // Only the tail of a failure: the whole log stays one command away.
    console.log(`${ok ? 'pass' : 'FAIL'}  ${c}${ok ? '' : '\n' + (r.stdout + r.stderr).trim().split('\n').slice(-12).map(l => '      ' + l).join('\n')}`);
  }
  process.exitCode = failed ? 1 : 0;
}
