#!/usr/bin/env node
// Claude Code PreToolUse hook for Bash (.claude/settings.json). Stops the two
// moves that lost work or landed it on an old main:
//   - pushing or opening a PR while branch-doctor finds a blocker
//     (conflicts with origin/main, a decision number taken twice, commits on an
//     already merged branch);
//   - cutting a new branch from local `main` when it is behind origin/main.
// Exit 2 blocks the command and shows stderr to the agent. Anything else passes.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let input = '';
for await (const chunk of process.stdin) input += chunk;
let cmd = '', cwd = '';
try { const j = JSON.parse(input); cmd = j.tool_input?.command ?? ''; cwd = j.cwd ?? ''; } catch { process.exit(0); }
// Check the checkout the command runs in, not the one this hook file sits in: a worktree session's
// hook is the main checkout's, and checking that one blocked a clean worktree's push over another
// agent's branch (2026-11-27, Cole). A command that starts with `cd <dir> &&` runs in that dir.
const own = fileURLToPath(new URL('../../', import.meta.url));
const top = d => { try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: d, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const cdTo = cmd.match(/^\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/);
const root = (cdTo && top(cdTo[1] ?? cdTo[2] ?? cdTo[3])) || (cwd && top(cwd)) || own;
const git = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

if (/\bgit\s+push\b|\bgh\s+pr\s+create\b/.test(cmd) && !/--dry-run/.test(cmd)) {
  // (branch-doctor checks the checkout its own file is in, so run that checkout's copy)
  const doctor = existsSync(join(root, 'tools/branch-doctor.mjs')) ? join(root, 'tools/branch-doctor.mjs') : join(own, 'tools/branch-doctor.mjs');
  const r = spawnSync('node', [doctor], { cwd: root, encoding: 'utf8', timeout: 60000 });
  if (r.status === 1) {
    process.stderr.write(`branch-doctor found a blocker, so this push/PR was stopped:\n${r.stdout}\nFix it (or, if Cole says to go ahead anyway, tell him what it found first).\n`);
    process.exit(2);
  }
}

// `git switch -c x`, `git checkout -b x`, `git branch x`, optionally with `main` as the base.
const branching = cmd.match(/\bgit\s+(?:switch\s+(?:-c|--create)|checkout\s+-b|branch)\s+\S+(?:\s+(\S+))?/);
if (branching && !/\bgit\s+branch\s+(-|--)/.test(cmd)) {
  const base = branching[1] ?? git('rev-parse', '--abbrev-ref', 'HEAD');
  if (base === 'main' && Number(git('rev-list', '--count', 'main..origin/main') || 0) > 0) {
    process.stderr.write('Local main is behind origin/main, so a branch cut from it starts on an old main. Use `node tools/branch-doctor.mjs start <topic>`, or base it on origin/main after `git fetch origin`.\n');
    process.exit(2);
  }
}
