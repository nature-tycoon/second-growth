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
`node tools/calibrate.mjs <map|all> [years=15] [seeds=3]` is the before/after for balance: seeded runs, medians against each map's reference, only what's out of range and what moved since the last run (see /balance).

Read the record for an area before changing it. Each record in [docs/decisions/](docs/decisions/) opens with `## Rules` (what an edit must keep, the gotchas, the functions to go through, the checks to run); `## History` below it is background, read only when you need the why.

- [0001](docs/decisions/0001-nature-driven-wildlife.md) Nature-driven wildlife: the core design rule
- [0002](docs/decisions/0002-real-animal-recordings.md) Real animal recordings: adding animal sounds
- [0003](docs/decisions/0003-elk-overland-travel.md) Elk travel between habitat patches
- [0004](docs/decisions/0004-ecosystem-performance.md) Performance target: 30 FPS, Fast, Intel HD 520
- [0005](docs/decisions/0005-animal-clustering.md) Animal travel and crowding
- [0006](docs/decisions/0006-prey-predator-avoidance.md) Prey vigilance and escape
- [0007](docs/decisions/0007-species-territories.md) Territorial cores
- [0008](docs/decisions/0008-longer-carcass-window.md) Carcass window for scavengers
- [0009](docs/decisions/0009-seasonal-dormancy.md) Seasonal dormancy
- [0010](docs/decisions/0010-game-trails.md) Game trails and curved journeys (`sim/animal-course.js`)
- [0011](docs/decisions/0011-grazing-pressure.md) Grazing pressure (`sim/grazing.js`)
- [0012](docs/decisions/0012-raptors-soar-and-carry.md) Raptors soar and carry (`sim/bird-behavior.js`)
- [0013](docs/decisions/0013-home-ranges-and-water.md) Home ranges and water (`sim/home-range.js`)
- [0014](docs/decisions/0014-activity-budget.md) Hunters' activity budget
- [0015](docs/decisions/0015-landscape-of-fear.md) Landscape of fear (`sim/predation-risk.js`)
- [0016](docs/decisions/0016-carcass-decay.md) Carcass decay, drawing only (`render3d/carcass-decay.js`)
- [0017](docs/decisions/0017-controlled-burn-crown-fires.md) Controlled burns torching into crown fires
- [0018](docs/decisions/0018-animal-close-up-shading.md) Animal shading, coats, close-up models, eyes, ears (`render3d/animals/`)
- [0019](docs/decisions/0019-bare-soil-close-up.md) Bare soil at eye level (`render3d/terrain-materials.js`)
- [0020](docs/decisions/0020-watch-mode-and-eye-level.md) Watch mode, eye level, sky, lightning, thunder
- [0021](docs/decisions/0021-watch-pace.md) Watch pace: two clocks (`ANIMAL_SPEEDS`, `lifeAge`)
- [0022](docs/decisions/0022-far-vegetation-by-screen-size.md) Far vegetation by zoom
- [0023](docs/decisions/0023-trunks-and-logs.md) Walkers round trunks and logs (`sim/ground-obstacles.js`)
- [0024](docs/decisions/0024-tree-heights.md) Tree heights (`treeHeight`, `treeLevel`)
- [0025](docs/decisions/0025-shared-steering.md) Shared steering and one facing (`sim/steering.js`, `stepToward`, `a.heading`, `turnRate`, `reefStep`, `turnToward` in actors.js)
- Motion sweep: `node tools/motion-sweep-check.mjs [--report] [maps]` watches every species through `game.update` and `Actors.update` for visible movement glitches (position jumps, heading snaps, wobble and spins, foot slide, bodies in wood, standing in water, stalls), with per-species limits; real glitches it found are matched by `KNOWN` and listed, not hidden. Run it before and after any change to movement, facing or the drawing's turning (15–30 s)
- [0026](docs/decisions/0026-continuous-hunts.md) Continuous hunts, snakes, pounces (`huntStep`, `letGo`)
- [0027](docs/decisions/0027-plant-succession.md) Plant colonization and succession (`trySeed`, `forestDamp`)
- [0028](docs/decisions/0028-succession-dynamics.md) Tree mortality, regeneration, disturbance, deadwood (`removeTree`, `sim/disturbance.js`)
- [0029](docs/decisions/0029-pollinators-in-3d.md) 3D pollinators (`render3d/pollinators.js`)
- [0030](docs/decisions/0030-everyday-animal-behaviours.md) Everyday behaviours: fishing, woodpeckers, climbers, night animals, flight clearance
- [0031](docs/decisions/0031-ecosystem-report.md) Ecosystem Report (`sim/eco-metrics.js`)
- [0032](docs/decisions/0032-real-moon-and-clear-sky.md) Real moon and clear-day sky
- [0033](docs/decisions/0033-herbivore-pressure.md) Herbivore pressure (`sim/herbivory.js`)
- [0034](docs/decisions/0034-water-and-wetlands.md) Water model, beaver ponds, fish depth, wallows
- [0035](docs/decisions/0035-fire-randomness-deadwood.md) Run seed, deadwood placement, stones, savanna fire
- [0036](docs/decisions/0036-savanna-grass-recovery.md) Savanna grass recovery
- [0037](docs/decisions/0037-shared-prey-and-recolonisation.md) Shared prey and recolonisation (`sharePrey`)
- [0038](docs/decisions/0038-smooth-first-minutes.md) Smooth first minutes and per-day cost (`Game.dayWork`)
- [0039](docs/decisions/0039-eating-styles.md) Eating styles, drawing only (`render3d/eating-pose.js`)
- [0040](docs/decisions/0040-terrain-relief.md) Terrain relief: per-map landforms, land drains downhill (`js/maps/landform.js`)

New decisions take the next unused number, start with `## Rules` (5–15 lines) then `## History`, and get one short line here.

Reference: [PostHog player performance lookups](docs/posthog-player-perf.md).

Performance budget: [2026-10-23 review](docs/performance-review-2026-10-23.md) has where a frame goes, the per-part ceilings for new graphics and simulation, and the open fixes (young climbing primates, daily plant redraw, daily environment update). Measure a new feature with `node tools/play-profile.mjs [maps] [quality] [years]` before and after: an organically grown game through the real frame loop, simulation vs drawing vs GPU.
`tools/perf-guard-check.mjs` (headless CI) fails when draw calls, triangles, plant or animal instances, or plant regions rebuilt rise over 10% on a seeded fixture; if the rise is intended, check it against the budget, run it with `--update` and commit `tools/perf-guard-baseline.json` with the change. It counts geometry only, not shader or pixel cost.

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

Cole works on the same machine while agents test, and the 3D game is heavy. Before opening a preview, running headless Chrome or writing a check, read [testing](.claude/skills/testing/SKILL.md): close preview tabs when done, `nice -n 15` headless Chrome, ask before reloading Cole's tab, and the browser-check and seeding gotchas.

## Checklists

Step-by-step checklists live in `.claude/skills/` (Claude Code runs them as `/balance`, `/perf`, `/ship` and `/testing`; other agents can read them as plain files):

- [balance](.claude/skills/balance/SKILL.md): seeded before/after `balance-sim` for ecology changes. `balance-sim` is unseeded, so seed `Math.random` through `node --import` to compare.
- [perf](.claude/skills/perf/SKILL.md): check the machine first (Low Power Mode, battery, load average), which profiler answers which question, and the per-part budget.
- [ship](.claude/skills/ship/SKILL.md): checks, committing only your own hunks, the preview for Cole, and the push/merge steps.
- [testing](.claude/skills/testing/SKILL.md): sharing Cole's Mac while testing, and the gotchas of browser and seeded checks.
