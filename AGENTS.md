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
- [0022](docs/decisions/0022-far-vegetation-by-screen-size.md) Far vegetation by screen size: far tree and shrub models whenever the view is zoomed out (tile under 16 px on High, 23 on Fast), on every computer; `flora.setFar(false)` to compare
- [0023](docs/decisions/0023-trunks-and-logs.md) Trunks and logs: walkers go round trunks, small animals round logs, elephants trample saplings (`sim/ground-obstacles.js`). Trunk spots are shared with `flora.js`
- [0024](docs/decisions/0024-tree-heights.md) Tree heights from each species' real height (`heightM`, `render3d/tree-stature.js`): taller trunks under the same crowns. Read a tree's height through `treeHeight`, and fractions of it through `treeLevel`, never `TREE_SHAPES[...].height` or `boundingBox.max.y`
- [0025](docs/decisions/0025-shared-steering.md) Shared steering: one order for every ground animal (intent, steer, move, spacing, then `sim/steering.js` settles facing, wood and water); bodies are capsules with antler racks; small animals keep out of water, land walkers never stop in it; `tools/animal-steering-check.mjs`. Hunting moves only through `stepToward`
- [0026](docs/decisions/0026-continuous-hunts.md) Continuous hunts: momentum, leading, freeze-and-cover stalks, stamina, press on after a miss, ease to a stop (`huntStep`); `tools/hunt-check.mjs`, `tools/predation-soak.mjs`. End a hunt through `letGo`. Snakes lie in wait and strike (`strike` style, `lieInWait`; `tools/snake-hunt-probe.mjs`). Cats, foxes and coyotes (on small prey) end a rush in a pounce (`pounce`, `hunt.leap`; a negative `fly` draws the stretched leap; `tools/pounce-probe.mjs`)
- [0027](docs/decisions/0027-plant-succession.md) Plant colonization and succession, on top of 0028: regional seed rain for every native (`seedTravel`), a damp old-forest floor (`forestDamp`, which windthrow and fire subtract), light only matters to young trees, patchy recruitment (`patchOdds`), long-lived natives succeed short-lived ones in the sward, paper birch. `node tools/plant-establishment.mjs [maps] [years]` says why a species never shows up
- [0028](docs/decisions/0028-succession-dynamics.md) Succession dynamics: tree mortality, advance regeneration, CNDD, disturbance (`sim/disturbance.js`, per-map `disturbance`), deadwood decay and seed dispersal; `tools/succession-check.mjs`. Only `removeTree(w, i, cause, rng)` clears a living tree (`tools/tree-mortality-check.mjs`); a sapling waiting underneath (`w.understory`) takes the slot. Declare new per-world fields in the `World` constructor (a field added mid-game changes the object's shape and slowed `updateEnvironment` 35–55%)
- [0029](docs/decisions/0029-pollinators-in-3d.md) Bees and butterflies at the flowers are 3D insects drawn with the wildlife's models (`render3d/pollinators.js`), each map's own species in `look.ambience.pollinators`
- [0030](docs/decisions/0030-everyday-animal-behaviours.md) Everyday behaviours as species traits in `behaviorFor`: fishing (`sim/fishing.js`), woodpeckers on trunks, climbers two to a tree and squirrels on the ground (`sim/climbers.js`), `plays`, `nocturnal` (drawn day only), fliers clear the canopy (`render3d/flight-clearance.js`), carcass meals on the ground. `a.passing` is for flyovers only; a climber on the ground has `a.move` 'ground'. Keystone sweep: `tools/moments-sweep-browser-check.mjs`
- [0031](docs/decisions/0031-ecosystem-report.md) Ecosystem Report: six vital signs against each map's reference ecosystem, a cited carbon estimate, stages and badges (`sim/eco-metrics.js`, `data/eco-reference.js`, `ui/eco-report.js`); badges pay nothing
- [0032](docs/decisions/0032-real-moon-and-clear-sky.md) The real moon (`render3d/moon.js`, turned for the map's `lat`) and a deeper clear-day sky (`SKY_BLUE`, each map's `look.skyHaze`); eye level only
- [0033](docs/decisions/0033-herbivore-pressure.md) Herbivore pressure: a coarse kg/ha field by guild (`sim/herbivory.js`) from each species' `kg`; browsers pick young trees by `browse` (palatability), thorns and thickets shelter them, trampling and elephants are general rules (the savanna-only trample is gone). A new large herbivore needs `kg`, a new map `REFERENCE[map].herbivores`; `tools/herbivore-pressure.mjs` (with `--exclosure`) and `tools/herbivore-pressure-check.mjs`
- [0034](docs/decisions/0034-water-and-wetlands.md) Water and wetlands: the Hollis water model is on (`?water=0` to compare); beaver ponds from dam to meadow (`sim/beaver-ponds.js`: site, spacing, food, `w.meadow`); river fish keep to `swimDepth`, the depth the drawing uses; wallows by species (`sim/wallows.js`, `WALLOWERS`: new big herbivores add a line there). Checks: `hollis-water-check`, `beaver-pond-check`, `fish-water-check`; `tools/pond-edge-measure.mjs`, `tools/wallow-count.mjs`

- [0035](docs/decisions/0035-fire-randomness-deadwood.md) Fire, randomness and deadwood: each new game has a random run seed (`newGame(..., runSeed)`; tools leave it out and keep the fixed sequence), snags and logs where the tree stood (`snagSpot`, `logSpot` in `sim/ground-obstacles.js`) and snags fall one by one (`snagLife`), loosening soil turns up natural stones (map `stones`), savanna grass fires every few years (`fireSpeed`, quiet `routineFires`), resprouting trees burned back not killed (`topKill`), saplings slowed in a grass sward (`swardGrowth`). Checks: `run-seed-check`, `fire-deadwood-check`
- [0036](docs/decisions/0036-savanna-grass-recovery.md) Savanna grass recovery: the Serengeti's pioneer legumes fade on recovered soil (`pioneer`) but pioneers hold crusted hardpan until their roots break it, grazers drop grass seed and acacia pods (`pods`) in their dung (map `dungSeed`, Serengeti only), a grass fire root-kills lantana standing in grass (`grassFireKill`), groundcover burns by its own `fuel` and less where grazed (every map). Check: `savanna-grass-check`; `tools/savanna-sward-probe.mjs` shows the meadow's species and where young mesquite stands
- [0037](docs/decisions/0037-shared-prey-and-recolonisation.md) Shared prey and recolonisation: hunting species split each prey animal between them (`sharePrey`), cats that stalk pick prey near cover (`stalkCoverAt`), a hunter in the open is seen from further, hunters keep a search image of their last catch (`a.searchImage`), so rare prey like hartebeest persist; arrivals from off-map are the existing `mig`/`sources` rule (rhino now `mig: 0.01`)

- [0038](docs/decisions/0038-smooth-first-minutes.md) Smooth first minutes: animal models warmed in idle time (`Actors.warmAnimals`), 24-tile plant regions under a 4 ms frame budget, and the live day in parts (`Game.dayWork`; `dailyTick` still does it all at once, so headless results are unchanged). Tests that stub habitat replace `Wildlife.suitabilityWork`, not `computeSuitability`. Measure with `tools/new-game-profile.mjs`. Its last section has the per-day simulation cost after wave 2 and the same-answer fixes (`wetTest` is per search: make a new one each time, the water moves)
- [0039](docs/decisions/0039-eating-styles.md) Eating styles by food, drawing only (`render3d/eating-pose.js`): crop, browse (up at trees), tear, hand to mouth, fish snap; `NIBBLERS` for idle nibbling, never `GRAZERS` (it moves grazers to water)
- [0040](docs/decisions/0040-terrain-relief.md) Terrain relief: each map's own landform (`land.base` in `generateHeights`) and a drains-downhill pass (`js/maps/landform.js`); shape water's path inside `base()`, not after; old saves keep their land. `tools/terrain-relief-check.mjs`

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
- `browser-session.mjs` `navigate` waits until the new document has replaced the old one. `Page.navigate` alone returns as loading starts, and on CI the next `evaluate` ran in the previous page (`getElementById` null).
- Seed `Math.random` before `restoredGame` (or `newGame`) in a seeded check: the first animals draw on it, so seeding after left `wildlife-additions-check` passing or failing by luck.
- "does not provide an export named …" means the browser cached an old module. Refetch with `cache: 'reload'` or clear the site's cache.
- Seeded headless checks (`mulberry32` on `Math.random`) take a different path whenever any animal model gains or loses a geometry, because three.js draws `Math.random` for every geometry's UUID. A bird reshape once flipped `primate-stall-check`. When a seeded check breaks after an unrelated change, run it on a few other seeds before blaming that change.

## Checklists

Step-by-step checklists live in `.claude/skills/` (Claude Code runs them as `/balance`, `/perf` and `/ship`; other agents can read them as plain files):

- [balance](.claude/skills/balance/SKILL.md): seeded before/after `balance-sim` for ecology changes. `balance-sim` is unseeded, so seed `Math.random` through `node --import` to compare.
- [perf](.claude/skills/perf/SKILL.md): check the machine first (Low Power Mode, battery, load average), which profiler answers which question, and the per-part budget.
- [ship](.claude/skills/ship/SKILL.md): checks, committing only your own hunks, the preview for Cole, and the push/merge steps.
