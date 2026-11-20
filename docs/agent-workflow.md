# Agent workflow: model routing, tokens, branches

How Claude Code sessions should spend tokens on Second Growth, and the tools that keep branches from losing work. Written 2026-11-19 from an audit of the previous 30 days (`node tools/agent-usage.mjs --days=30`).

## What the audit found (2026-10-20 to 2026-11-19)

- 207 sessions, 18k model calls, **99% on Opus**, 0% in subagents.
- **Re-reading context is most of the cost**: 3.4 billion cache-read tokens against 11 million written by the model. The average call re-reads about 190k tokens of conversation; the longest sessions ran 200–280 calls and passed 450–650k. A session's cost grows with the square of its length, so the costliest third of sessions used 72% of everything.
- What fills the context is mostly **Bash output**: 26M characters (about 6.5M tokens), of which `sed`/`grep`/`cat` reading code is 19M. Every character then rides along in every later call. A quarter came from single outputs over 10k characters.
- Screenshots were modest (about 500 taken, 1,600 images in results), but each image stays in the context for the rest of the session.
- AGENTS.md is loaded into every call; at 24 KB it was about 6k tokens a call. Its website paragraph (8 KB) now lives in [website-notes.md](website-notes.md).
- Branches: local `main` was 25 commits behind origin/main, and 20 local branches hold commits main never got (`node tools/branch-doctor.mjs lost`). Past trouble: wave branches integrated by hand, decision numbers taken twice, a skill lost on a side branch, a duplicate PR (106), commits added to a branch after its PR merged.

## Model routing

| Work | Who | Model |
| --- | --- | --- |
| Finding code, records and checks for a task | `scout` subagent | Sonnet |
| Running checks, calibrate, motion sweep, profiles | `checker` subagent | Sonnet |
| Does it look or move right | `visual-qa` subagent | Sonnet |
| What could this break (plan, then diff) | `regression-reviewer` subagent | Opus |
| New system or cross-subsystem rework | `architect` subagent | Fable, sparingly |
| Editing, deciding, talking to Cole | the main session | Opus |
| Small mechanical batches (renames, docs, copy) | a session started on Sonnet | Sonnet |

Subagents pay twice over: their model is cheaper, and only their short answer enters the main session, which every later call re-reads. Use Fable only through `architect`, about once per large feature, and say so to Cole when you do.

## Token habits for the main session

1. **One task per session.** Start a fresh session (or `/compact`) at a natural break instead of running past ~150 calls; `/ideas` already chains small sessions. A long session's last calls cost several times its first.
2. **Ask for locations, not files.** `node tools/impact.mjs <files>` gives the records and checks for an area in a few lines; `scout` finds the code. Read with `grep -n` and `sed -n` ranges, never `cat` a big file.
3. **Keep outputs short.** Bash output is capped at 15k characters (`BASH_MAX_OUTPUT_LENGTH` in `.claude/settings.json`); pipe check output through `tail`, and hand long runs to `checker`.
4. **Measure before you look.** For a visual bug, read positions, headings and heights from the game state or run `motion-sweep-check` before taking a screenshot; take one at `scale: 0.5` only to confirm. A measurement that finds a bug becomes a check. (Playwright would add nothing: `tools/browser-session.mjs` already drives headless Chrome directly, with no dependencies.)
5. **Read Rules, skip History.** Decision records open with `## Rules`; read History only when you need the why.

## Building features with the right architecture

For anything beyond a single-file fix:

1. `node tools/impact.mjs <files you expect to touch>`: read the Rules it names; these are the invariants.
2. Design (AGENTS.md "Before implementing substantial features"); for a cross-subsystem feature ask `architect`.
3. Send the plan to `regression-reviewer` before writing code; build the checks it asks for along with the feature.
4. Before commit: `node tools/impact.mjs --run` (headless checks for the branch's changes), the area's skill (/balance, /perf, motion sweep), then `regression-reviewer` on the diff.

## Branches

- Start work with `node tools/branch-doctor.mjs start <topic>`: it fetches and cuts `claude/<topic>` from origin/main, and fast-forwards local main.
- `node tools/branch-doctor.mjs` (check) before any push or PR: conflicts with origin/main (a real three-way merge, nothing touched), a decision number used twice, commits on a branch whose PR already merged, a new decision without its AGENTS.md line, a branch far behind main.
- The Claude Code hook `tools/hooks/pre-ship.mjs` (`.claude/settings.json`) runs that check before every `git push` and `gh pr create`, and refuses `git switch -c x main` while local main is stale. Other tools (Codex, Cursor) don't run the hook: run the check by hand.
- `node tools/branch-doctor.mjs lost` lists local branches with changes main never got, newest first. Decide each with Cole before deleting anything.

## Measuring

- `node tools/agent-usage.mjs [--days=7] [--top=25]` reports token use by session (weighted by model price), the share by model and subagents, screenshots, and which tools filled the context. Run it monthly, or before and after changing these habits.
- Frame-time benchmarks stay as they are: `perf-guard-check` in CI counts geometry on every PR, and `play-profile` (/perf) measures a real frame loop on Cole's Mac before and after graphics or simulation work.
