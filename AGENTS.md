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

- Cole is not an engineer. When he asks for something a specific way and there's a simpler, more robust or more realistic way to get what he's after, propose it (briefly, with the tradeoff) and go with the better option rather than following the wording literally. Say what you changed from his request and why.
- Prefer simple, modular solutions over elaborate frameworks.
- Do not introduce new abstractions unless they solve a demonstrated problem.
- Distinguish architectural problems from implementation bugs.
- For changes affecting multiple subsystems, present the proposed design and tradeoffs before modifying code.
- After implementation, explain what changed, how it was verified, and what remains uncertain.

## Project

Vanilla JS, no build step, three.js vendored in `vendor/three`. Serve with `python3 tools/serve.py` (port 8347). Tune balance in `js/data/*.js` and `js/sim/`, and check it headless with `node tools/balance-sim.mjs restore 15` before and after.

Read the decision for an area before changing it. Each record in [docs/decisions/](docs/decisions/) has the design, the gotchas and its check script; this list is only an index.

- [0001](docs/decisions/0001-nature-driven-wildlife.md) Nature-driven wildlife: the core design rule
- [0002](docs/decisions/0002-real-animal-recordings.md) Real animal recordings: how to add animal sounds
- [0003](docs/decisions/0003-elk-overland-travel.md) Elk travel between habitat patches
- [0004](docs/decisions/0004-ecosystem-performance.md) Ecosystem performance: the low-end target (30 FPS, Fast, Intel HD 520) and milestones
- Wildlife movement and behavior: [0005](docs/decisions/0005-animal-clustering.md) travel and crowding, [0006](docs/decisions/0006-prey-predator-avoidance.md) prey vigilance, [0007](docs/decisions/0007-species-territories.md) territorial cores, [0008](docs/decisions/0008-longer-carcass-window.md) carcass window, [0009](docs/decisions/0009-seasonal-dormancy.md) seasonal dormancy, [0010](docs/decisions/0010-game-trails.md) game trails (`sim/animal-course.js`)
- [0011](docs/decisions/0011-grazing-pressure.md) Grazing pressure: herds hold back woody seedlings (`sim/grazing.js`)
- [0012](docs/decisions/0012-raptors-soar-and-carry.md) Raptors soar and carry (`sim/bird-behavior.js`)
- [0013](docs/decisions/0013-home-ranges-and-water.md) Home ranges and water (`sim/home-range.js`); `tools/activity-budget.mjs` shows how each species spends its time
- [0014](docs/decisions/0014-activity-budget.md) Activity budget: hunger, rest and soaring compete for a hunter's time
- [0015](docs/decisions/0015-landscape-of-fear.md) Landscape of fear: prey remember kill sites (`sim/predation-risk.js`)
- [0016](docs/decisions/0016-carcass-decay.md) Carcass decay: flesh to skeleton to bones, drawing only (`render3d/carcass-decay.js`)
- [0017](docs/decisions/0017-controlled-burn-crown-fires.md) Controlled burns can torch into crown fires
- [0018](docs/decisions/0018-animal-close-up-shading.md) Animal close-up shading, per-pixel coats, close-up models and eyes (`render3d/animals/`). Gotcha: a model's normal **lengths** carry shading, so normalize before using them
- [0019](docs/decisions/0019-bare-soil-close-up.md) Bare soil painted per pixel at eye level (`render3d/terrain-materials.js`)
- [0020](docs/decisions/0020-watch-mode-and-eye-level.md) Watch mode (`C`), eye level (`F`), eye-level sky, weather, lightning and thunder
- [0021](docs/decisions/0021-watch-pace.md) Watch pace (`0`): the calendar slows, animals keep the normal pace (`ANIMAL_SPEEDS`); life stages read `lifeAge(a)`, not `a.age`; compare speeds by value, not index

New decisions take the next unused number and one line here.

Reference: [PostHog player performance lookups](docs/posthog-player-perf.md).

Performance budget: [2026-10-23 review](docs/performance-review-2026-10-23.md) has where a frame goes, the per-part ceilings for new graphics and simulation, and the open fixes (young climbing primates, daily plant redraw, daily environment update). Measure a new feature with `node tools/play-profile.mjs [maps] [quality] [years]` before and after: an organically grown game through the real frame loop, simulation vs drawing vs GPU.

## Working alongside other agents

Several agents (Claude Code, Codex, Cursor) often edit this checkout at the same time, so uncommitted changes may belong to someone else.

- Run `git status` and `git diff` before branching or committing.
- Commit only your own hunks. If a file holds another agent's edits too, stage just your hunks (for example with `git add -p`, or by building the staged blob from HEAD plus your change).
- Tell Cole when you find another agent's work in progress.
- When you learn something durable (a decision, a gotcha, a workflow), record it in this file or `docs/` in the same commit, not in a tool's private memory.

## Shipping

- When you finish a task, commit your changes on the current branch without being asked (if that's `main`, branch first). Commit only your own hunks, as above, and run the relevant checks first.
- Don't push or open a PR on your own. Wait until Cole says to.
- When Cole says to push it or make it live, open a PR against main and merge it yourself with a merge commit (`gh pr merge N --merge`). If a tool's permission check blocks the merge, try once, then give Cole the command. Never work around the block.
- Merging to main deploys GitHub Pages (nature-tycoon.github.io/second-growth) and runs the itch.io workflow.
- CI: PRs run only the headless suite. The browser suite runs on main before the itch.io upload. Run the relevant `tools/*-check.mjs` locally, and don't wait for or poll CI before merging. `[skip ci]` in the commit message skips the checks and the itch.io upload.

## Phones

The game is played on phones in **landscape**. Design and check phone layouts at a landscape size (for example 812×375 or 844×390), where the height is the tight side. Upright (portrait) phone layouts are a fallback, not the target.

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
- Animals small on screen draw from their species pool's distant model (`fauna.species.get(key).far`). Animals large on screen draw from its close-up model (`.close`, see 0018). A check that counts drawn animals must add `far.count` and `close.count` to `count`.
- "does not provide an export named …" means the browser cached an old module. Refetch with `cache: 'reload'` or clear the site's cache.

## Checklists

Step-by-step checklists live in `.claude/skills/` (Claude Code runs them as `/balance`, `/perf` and `/ship`; other agents can read them as plain files):

- [balance](.claude/skills/balance/SKILL.md): seeded before/after `balance-sim` for ecology changes. `balance-sim` is unseeded, so seed `Math.random` through `node --import` to compare.
- [perf](.claude/skills/perf/SKILL.md): check the machine first (Low Power Mode, battery, load average), which profiler answers which question, and the per-part budget.
- [ship](.claude/skills/ship/SKILL.md): checks, committing only your own hunks, the preview for Cole, and the push/merge steps.
