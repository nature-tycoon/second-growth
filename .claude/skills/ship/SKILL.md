---
name: ship
description: Finish a task in Second Growth - run the right checks, commit only this agent's own changes, and leave a preview running for Cole. Use at the end of every task, or when Cole says to push it or make it live.
---

# Ship

## Commit (always, at the end of a task)

1. `git status` and `git diff`. Other agents edit this checkout at the same time, so any change you didn't make is theirs: leave it unstaged and tell Cole whose files are in progress.
2. If the branch is `main`, create a branch first: `node tools/branch-doctor.mjs start <short-topic>` (cut from origin/main; local main is often stale).
3. Run the checks for what you touched: `node tools/impact.mjs --run` runs the headless checks that cover the branch's changes and names the records and skills that apply (hand long runs to the `checker` subagent), plus `node tools/calibrate.mjs <map> 15 3` (see /balance) for ecology changes, `play-profile` (see /perf) for anything that could cost frame time. Report failures as failures; don't commit over a failing check without saying so.
4. Stage only your hunks: `git add <file>` when the whole file is yours, otherwise `git add -p`, or build the staged blob from HEAD plus your change. Check with `git diff --cached`.
5. If you learned something durable (a decision, a gotcha, a workflow), put it in `docs/decisions/` or AGENTS.md in the same commit. A new decision gets the next unused number (`ls docs/decisions`) and one line in AGENTS.md.
6. Commit message: a plain-language summary of what a player would notice, then the why and how in the body. End with the Co-Authored-By line.
7. Don't push.

## Preview for Cole

Start a preview for the checkout the change is in (`.claude/launch.json`, `second-growth` on port 8347 for the main checkout; a worktree needs its own port) and leave it open. Close any tabs you used for your own checks. Give Cole the URL, and for review pages use `http://localhost:8347/tools/...`, never a file link.

## Only when Cole says push / make it live

1. `node tools/branch-doctor.mjs`: fix any BLOCK (conflicts with origin/main, a decision number taken twice, commits on an already merged branch) before pushing; the Claude Code hook runs it on push anyway. Then `git push -u origin <branch>` and `gh pr create --base main` with a plain summary.
2. `gh pr merge <N> --merge --auto` (a merge commit, made by GitHub once the required `headless` check passes, about 10 minutes). If a permission check blocks it, try once, then give Cole the command. Never work around the block.
3. Turn Auto-fix on for the PR, always, without asking (Cole's standing rule): in the Claude desktop app, `ccd_pr` `get_status` (bind the PR if it isn't bound), then `set_monitor` with `auto_fix: true`. In other tools, fix a failing check or conflict on the same branch.
4. Merging deploys GitHub Pages and the itch.io build. Don't wait for or poll CI: `--auto` does the waiting. Tell Cole the PR merges itself when its checks pass; if they fail it stays open, so fix it on the same branch. `[skip ci]` in the message skips checks and the itch.io upload; only use it when Cole asks or the change is docs only, and then merge with `gh pr merge <N> --merge --admin`, since the skipped check never reports.
