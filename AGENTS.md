# Agent instructions

Act as a senior software architect and simulation engineer working on Second Growth, a 3D ecosystem simulation.

## Before implementing substantial features

1. Examine the existing code and identify the relevant subsystems.
2. Explain the current architecture and its limitations.
3. Propose the simplest architecture that meets the requirements.
4. Define clear responsibilities and interfaces between components.
5. Identify important invariants, edge cases, and failure modes.
6. Consider performance as the ecosystem scales.
7. Define measurable acceptance criteria and regression tests.
8. Identify which existing components should be reused.

## Principles

- Prefer simple, modular solutions over elaborate frameworks.
- Do not introduce new abstractions unless they solve a demonstrated problem.
- Distinguish architectural problems from implementation bugs.
- For changes affecting multiple subsystems, present the proposed design and tradeoffs before modifying code.
- After implementation, explain what changed, how it was verified, and what remains uncertain.

## Project

Vanilla JS, no build step, three.js vendored in `vendor/three`. Serve with `python3 tools/serve.py` (port 8347). Tune balance in `js/data/*.js` and `js/sim/`, and check it headless with `node tools/balance-sim.mjs restore 15` before and after.

Read the decisions in [docs/decisions/](docs/decisions/) before changing the area they cover:

- [0001 Nature-driven wildlife](docs/decisions/0001-nature-driven-wildlife.md): the core design rule
- [0002 Real animal recordings](docs/decisions/0002-real-animal-recordings.md): how to add animal sounds
- [0004 Ecosystem performance](docs/decisions/0004-ecosystem-performance.md): the low-end target (30 FPS, native resolution, Fast, Intel HD 520), the audit, and the milestone plan with progress
- [0005 Animal travel and crowding](docs/decisions/0005-animal-clustering.md), [0006 Prey vigilance](docs/decisions/0006-prey-predator-avoidance.md), [0007 Territorial cores](docs/decisions/0007-species-territories.md), [0008 Carcass window](docs/decisions/0008-longer-carcass-window.md), [0009 Seasonal dormancy](docs/decisions/0009-seasonal-dormancy.md), [0010 Game trails](docs/decisions/0010-game-trails.md): wildlife movement and behavior added October 2026

Reference: [PostHog player performance lookups](docs/posthog-player-perf.md).

## Working alongside other agents

Several agents (Claude Code, Codex, Cursor) often edit this checkout at the same time, so uncommitted changes may belong to someone else.

- Run `git status` and `git diff` before branching or committing.
- Commit only your own hunks. If a file holds another agent's edits too, stage just your hunks (for example with `git add -p`, or by building the staged blob from HEAD plus your change).
- Tell Cole when you find another agent's work in progress.
- When you learn something durable (a decision, a gotcha, a workflow), record it in this file or `docs/` in the same commit, not in a tool's private memory.

## Shipping

- Don't commit, push or open a PR on your own. Leave changes in the working tree until Cole says to.
- When Cole says to push it or make it live, open a PR against main and merge it yourself with a merge commit (`gh pr merge N --merge`). If a tool's permission check blocks the merge, try once, then give Cole the command. Never work around the block.
- Merging to main deploys GitHub Pages (nature-tycoon.github.io/second-growth) and runs the itch.io workflow.
- CI: PRs run only the headless suite. The browser suite runs on main before the itch.io upload. Run the relevant `tools/*-check.mjs` locally, and don't wait for or poll CI before merging. `[skip ci]` in the commit message skips the checks and the itch.io upload.

## Testing on Cole's Mac

Cole works on the same machine while agents test, and the 3D game is heavy.

- Close browser preview tabs and stop the dev server as soon as a visual check is done. A forgotten preview tab has run the game at ~100% CPU for hours.
- When the work is finished, start a preview server for the checkout the changes are in and leave it open, so Cole can check them himself. Tell him the URL.
- Run headless Chrome under `nice -n 15`, throttle `requestAnimationFrame` when no screenshot is needed, and delete each temp profile afterwards (old `$TMPDIR/sg-chrome-*` folders once reached 5 GB).
- A hidden preview tab can stop `requestAnimationFrame` entirely, so the game never finishes loading and frame rates read there mean nothing. For CPU-side timing, measure `game.update`, `Flora.rebuild` and `Actors.update` in node instead.
- Prefer one or two targeted crash sweeps over all maps unless the change is shared engine code.
- Cole may be playing in a preview tab. Ask before reloading it.
- When sending Cole links to `tools/*.html` review pages, use `http://localhost:8347/tools/...` with the server running. File links open the raw file and the ES modules never run.
- In a `tools/*-browser-check.mjs`, send `Page.enable` before `Page.addScriptToEvaluateOnNewDocument`. Without it the script never runs, so seeded settings and `second-growth-pending` are ignored and the farm selector (which can't be dismissed) stays open.
- Animals small on screen draw from their species pool's distant model (`fauna.species.get(key).far`). A check that counts drawn animals must add `far.count` to `count`.
- "does not provide an export named …" means the browser cached an old module. Refetch with `cache: 'reload'` or clear the site's cache.

## Performance reports

Check the machine before profiling code: `pmset -g custom | grep lowpowermode`, `pmset -g batt` and `sysctl -n vm.loadavg`. Low Power Mode and a high load average have caused "the game got slower" before. The game's Auto frame rate also caps at 30 fps on battery (`js/main.js`). Then time `wildlife.update` headless. For loading, `node tools/boot-profile.mjs 4 1` times each loading-screen stage (a fresh profile each run, so shaders compile cold). `tools/flora-rebuild-bench.mjs` and `tools/spacing-bench.mjs` print output signatures as well as timings, and take `FLORA_ROOT`/`SPACING_ROOT` for an A/B against another checkout. `balance-sim` is unseeded: to compare two checkouts, seed `Math.random` through `node --import`.
