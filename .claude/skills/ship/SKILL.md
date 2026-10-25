---
name: ship
description: Finish a task in Second Growth - run the right checks, commit only this agent's own changes, and leave a preview running for Cole. Use at the end of every task, or when Cole says to push it or make it live.
---

# Ship

## Commit (always, at the end of a task)

1. `git status` and `git diff`. Other agents edit this checkout at the same time, so any change you didn't make is theirs: leave it unstaged and tell Cole whose files are in progress.
2. If the branch is `main`, create a branch first (`claude/<short-topic>`).
3. Run the checks for what you touched: the `tools/*-check.mjs` named in the matching `docs/decisions/` record, `node tools/balance-sim.mjs restore 15` (see /balance) for ecology changes, `play-profile` (see /perf) for anything that could cost frame time. Report failures as failures; don't commit over a failing check without saying so.
4. Stage only your hunks: `git add <file>` when the whole file is yours, otherwise `git add -p`, or build the staged blob from HEAD plus your change. Check with `git diff --cached`.
5. If you learned something durable (a decision, a gotcha, a workflow), put it in `docs/decisions/` or AGENTS.md in the same commit. A new decision gets the next unused number (`ls docs/decisions`) and one line in AGENTS.md.
6. Commit message: a plain-language summary of what a player would notice, then the why and how in the body. End with the Co-Authored-By line.
7. Don't push.

## Preview for Cole

Start a preview for the checkout the change is in (`.claude/launch.json`, `second-growth` on port 8347 for the main checkout; a worktree needs its own port) and leave it open. Close any tabs you used for your own checks. Give Cole the URL, and for review pages use `http://localhost:8347/tools/...`, never a file link.

## Only when Cole says push / make it live

1. `git push -u origin <branch>`, then `gh pr create --base main` with a plain summary.
2. `gh pr merge <N> --merge` (a merge commit). If a permission check blocks it, try once, then give Cole the command. Never work around the block.
3. Merging deploys GitHub Pages and the itch.io build. Don't wait for or poll CI. `[skip ci]` in the message skips checks and the itch.io upload; only use it when Cole asks or the change is docs only.
