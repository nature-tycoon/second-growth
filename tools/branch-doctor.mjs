#!/usr/bin/env node
// Branch safety for many agents sharing one repo. Catches the ways work has gone
// missing or landed on an old main: branches cut from a stale local `main`, new
// commits on a branch whose PR already merged, decision numbers taken twice,
// and PRs that will conflict with origin/main.
//
//   node tools/branch-doctor.mjs                 check the current branch (default)
//   node tools/branch-doctor.mjs start <topic>   new branch claude/<topic> from a fresh origin/main
//   node tools/branch-doctor.mjs lost            local branches holding commits main never got
//   node tools/branch-doctor.mjs --no-fetch      skip `git fetch` (offline, or called from a hook)
//
// Exit 1 when a blocker is found, so a hook or CI step can stop on it.

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2);
const cmd = argv.find(a => !a.startsWith('--')) ?? 'check';
const noFetch = argv.includes('--no-fetch');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };
const fetch = () => { if (!noFetch && tryGit('fetch', '--quiet', 'origin') === null) console.log('! git fetch failed; using the last known origin/main'); };
const blockers = [], warnings = [];

// Decision numbers on a ref, from docs/decisions/NNNN-*.md.
const decisions = ref => (tryGit('ls-tree', '--name-only', `${ref}:docs/decisions`) ?? '')
  .split('\n').filter(f => /^\d{4}-/.test(f));

function check() {
  fetch();
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const [behind, ahead] = git('rev-list', '--left-right', '--count', 'origin/main...HEAD').split(/\s+/).map(Number);
  console.log(`${branch}: ${ahead} commit(s) not on origin/main, ${behind} behind it`);
  if (branch === 'main' || branch === 'HEAD') blockers.push(`on ${branch}: start a branch first (node tools/branch-doctor.mjs start <topic>)`);

  // Local main lagging origin/main is how branches got cut from an old main.
  const localBehind = Number(tryGit('rev-list', '--count', 'main..origin/main') ?? 0);
  if (localBehind) warnings.push(`local main is ${localBehind} commit(s) behind origin/main: never branch from it, branch from origin/main`);

  // A branch whose PR already merged: anything committed after that never reaches main on its own.
  const pr = tryGit('-c', 'core.quotepath=off', 'log', '-1', '--format=%H', `--grep=from nature-tycoon/${branch}$`, 'origin/main');
  if (pr && ahead) {
    const after = git('rev-list', '--count', `${pr}^2..HEAD`);
    if (Number(after)) blockers.push(`${branch} was already merged (${pr.slice(0, 7)}); ${after} commit(s) since then need a new PR: push and open one, or move them to a fresh branch`);
  } else if (ahead) {
    // Same thing under another name: the branch sits on a PR tip that main merged.
    const base = git('merge-base', 'HEAD', 'origin/main');
    const merge = git('log', '--merges', '--format=%H %P %s', '-300', 'origin/main').split('\n').find(l => l.split(' ')[2] === base);
    if (merge) warnings.push(`this branch builds on an already merged PR (${merge.split(' ').slice(3).join(' ')}); its ${ahead} newer commit(s) reach main only through a new PR`);
  }

  // Decision numbers: a number used by two different records, here or against main.
  const mine = decisions('HEAD'), theirs = decisions('origin/main');
  const byNum = new Map();
  for (const f of [...theirs, ...mine]) { const n = f.slice(0, 4); byNum.set(n, new Set([...(byNum.get(n) ?? []), f])); }
  for (const [n, names] of byNum) if (names.size > 1) blockers.push(`decision ${n} is used twice: ${[...names].join(', ')}; renumber yours to ${String(Math.max(...[...byNum.keys()].map(Number)) + 1).padStart(4, '0')}`);
  const agents = tryGit('show', 'HEAD:AGENTS.md') ?? '';
  for (const f of mine.filter(f => !theirs.includes(f))) if (!agents.includes(f.slice(0, 4))) warnings.push(`new decision ${f} has no line in AGENTS.md`);

  // Will it merge? merge-tree does the real three-way merge without touching the checkout.
  if (ahead && behind) {
    const merged = tryGit('merge-tree', '--write-tree', '--name-only', '--no-messages', 'origin/main', 'HEAD');
    if (merged === null) {
      let files = '';
      try { git('merge-tree', '--write-tree', '--name-only', '--no-messages', 'origin/main', 'HEAD'); }
      catch (e) { files = String(e.stdout).split('\n').slice(1).filter(Boolean).join(', '); }
      blockers.push(`conflicts with origin/main in: ${files || '(see git merge origin/main)'}; run git merge origin/main, resolve, rerun the checks`);
    } else if (behind > 40) warnings.push(`${behind} commits behind origin/main: merge it in and rerun the checks before the PR, so they test what will land`);
  }

  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trimEnd();
  if (dirty) warnings.push(`uncommitted changes (yours or another agent's):\n    ${dirty.split('\n').slice(0, 8).join('\n    ')}`);
  return report();
}

function start(topic) {
  if (!topic) { console.log('usage: node tools/branch-doctor.mjs start <topic>'); process.exit(1); }
  fetch();
  const name = topic.startsWith('claude/') ? topic : `claude/${topic}`;
  if (git('status', '--porcelain', '--untracked-files=no')) warnings.push('uncommitted changes come along to the new branch; if they are another agent\'s, leave them unstaged');
  git('switch', '--no-track', '-c', name, 'origin/main');
  // Keep local main current too, when no worktree has it checked out.
  if (tryGit('fetch', '--quiet', '.', 'origin/main:main') === null) warnings.push('local main not fast-forwarded (checked out somewhere, or diverged)');
  console.log(`on ${name}, cut from origin/main ${git('rev-parse', '--short', 'origin/main')}`);
  return report();
}

function lost() {
  fetch();
  const rows = [];
  for (const b of git('for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n')) {
    // `git cherry` marks with + the commits whose change is not on main, even after a squash or rebase.
    const missing = (tryGit('cherry', 'origin/main', b) ?? '').split('\n').filter(l => l.startsWith('+')).length;
    if (!missing) continue;
    const date = git('log', '-1', '--format=%cs', b);
    rows.push({ b, missing, date, subject: git('log', '-1', '--format=%s', b).slice(0, 70) });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  console.log(rows.length ? 'Branches with changes origin/main does not have (newest first):' : 'Every local branch is on origin/main.');
  for (const r of rows) console.log(`  ${r.date}  ${String(r.missing).padStart(2)}  ${r.b.padEnd(44)} ${r.subject}`);
  const worktrees = git('worktree', 'list', '--porcelain').split('\n\n').filter(Boolean).length;
  const merged = git('branch', '--merged', 'origin/main', '--format=%(refname:short)').split('\n').filter(b => b.startsWith('claude/')).length;
  console.log(`\n${worktrees} worktrees; ${merged} claude/ branches are fully on origin/main and safe to delete (ask Cole first).`);
}

function report() {
  for (const w of warnings) console.log(`  warn: ${w}`);
  for (const b of blockers) console.log(`  BLOCK: ${b}`);
  if (!warnings.length && !blockers.length) console.log('  ok');
  process.exitCode = blockers.length ? 1 : 0;
}

if (cmd === 'check') check();
else if (cmd === 'start') start(argv.filter(a => !a.startsWith('--'))[1]);
else if (cmd === 'lost') lost();
else { console.log('commands: check | start <topic> | lost'); process.exitCode = 1; }
