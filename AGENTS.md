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
- [0006](docs/decisions/0006-prey-predator-avoidance.md) Prey vigilance and escape, rabbits' freeze-and-dash (`freezes`)
- [0007](docs/decisions/0007-species-territories.md) Territorial cores
- [0008](docs/decisions/0008-longer-carcass-window.md) Carcass window for scavengers
- [0009](docs/decisions/0009-seasonal-dormancy.md) Seasonal dormancy
- [0010](docs/decisions/0010-game-trails.md) Game trails and curved journeys (`sim/animal-course.js`)
- [0011](docs/decisions/0011-grazing-pressure.md) Grazing pressure (`sim/grazing.js`)
- [0012](docs/decisions/0012-raptors-soar-and-carry.md) Raptors soar and carry (`sim/bird-behavior.js`; soarers steer `SOAR_LOOK` ahead so they never fly tail first)
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
- [0025](docs/decisions/0025-shared-steering.md) Shared steering and one facing (`sim/steering.js`, `stepToward`, `a.heading`, `turnRate`, `reefStep`, `turnToward` in actors-common.js)
- File map (fix 8): `Wildlife` (`sim/animals.js`: update's order, save/load) is split by step into `sim/wildlife-intent.js` (what next, hunts, `pathTo`), `-water`, `-move` (`stepToward` per mode), `-population`, `-salmon`, `-beavers`, `-shared`; `Actors.update` (`render3d/actors.js`) dispatches to `actors-common.js` and per-mode `actors-ground.js`, `-climb`, `-fly`, `-swim`, `-reef`. Rules in 0025
- Motion sweep: `node tools/motion-sweep-check.mjs [--report] [maps]` watches every species through `game.update` and `Actors.update` for visible movement glitches (position jumps, heading snaps, wobble and spins, foot slide, bodies in wood, hooves sunk on slopes, standing in water, stalls), with per-species limits; real glitches it found are matched by `KNOWN` and listed, not hidden. Run it before and after any change to movement, facing or the drawing's turning (15–30 s); `node tools/herd-crawl-probe.mjs [maps]` runs it over ten seed pairs (the default two sit at seed-noise level for crawl)
- [0026](docs/decisions/0026-continuous-hunts.md) Continuous hunts, snakes (swallow whole, `swallow`, `gulpBulge`), pounces, prey jinks (`huntStep`, `letGo`, `jinkLine`)
- [0027](docs/decisions/0027-plant-succession.md) Plant colonization and succession (`trySeed`, `forestDamp`)
- [0028](docs/decisions/0028-succession-dynamics.md) Tree mortality, regeneration, disturbance, deadwood (`removeTree`, `sim/disturbance.js`)
- [0029](docs/decisions/0029-pollinators-in-3d.md) 3D pollinators (`render3d/pollinators.js`)
- [0030](docs/decisions/0030-everyday-animal-behaviours.md) Everyday behaviours: fishing, woodpeckers, climbers, night animals, flight clearance, waders (`wades`, `shallowsFor`) and the creek-bound dipper (`fastWater`, `alongCreek`)
- [0031](docs/decisions/0031-ecosystem-report.md) Ecosystem Report (`sim/eco-metrics.js`)
- [0032](docs/decisions/0032-real-moon-and-clear-sky.md) Real moon and clear-day sky
- [0033](docs/decisions/0033-herbivore-pressure.md) Herbivore pressure (`sim/herbivory.js`)
- [0034](docs/decisions/0034-water-and-wetlands.md) Water model, beaver ponds (dams grow over years, `rise`; spill when full), fish depth, wallows, stranded air-breathing fish wriggle over wet ground to the next water (`breathesAir`, `js/sim/fish-wriggle.js`; `fish-wriggle-check`)
- [0035](docs/decisions/0035-fire-randomness-deadwood.md) Run seed, deadwood placement, stones, savanna fire
- [0036](docs/decisions/0036-savanna-grass-recovery.md) Savanna grass recovery
- [0037](docs/decisions/0037-shared-prey-and-recolonisation.md) Shared prey and recolonisation (`sharePrey`)
- [0038](docs/decisions/0038-smooth-first-minutes.md) Smooth first minutes and per-day cost (`Game.dayWork`)
- [0039](docs/decisions/0039-steady-flight-level-fish-floating-ducks.md) Steady flight, level reef fish, floating ducks (tucked legs, dabbling, tint under the waterline), eased follow camera (`holdCruise`, `smoothSeabed`, `Actors.floatLevel`, `dabblePose`, `followHeight`)
- [0040](docs/decisions/0040-depth-based-lens-hole.md) Tracking lens: the animal drawn faintly through cover, cover opens over its outline (at eye level only near the lens), trunks never cut, never through water, a held meal shows with it (`render3d/look-through.js`, `render3d/focus.js`)
- [0041](docs/decisions/0041-primate-climbing-pace.md) Primate climbing pace and crown gaps (`drawnClimbPace`, `sim/canopy-links.js`, `crossGap`)
- [0042](docs/decisions/0042-tree-impostors.md) Tree impostors: far crowns as baked cards (`render3d/tree-impostors.js`)
- [0043](docs/decisions/0043-eating-styles.md) Eating styles, drawing only (`render3d/eating-pose.js`)
- [0044](docs/decisions/0044-terrain-relief.md) Terrain relief: per-map landforms, land drains downhill (`js/maps/landform.js`)
- [0045](docs/decisions/0045-simulation-worker.md) Simulation in a Web Worker: proposed design and spike, no-go for now (`tools/sim-worker-spike.mjs`)
- [0046](docs/decisions/0046-plant-growth-on-the-gpu.md) Plant redraw: deadwood age redraws its own tile; growth on the GPU measured and declined
- [0047](docs/decisions/0047-accounts-sharing-and-home.md) Accounts, sharing farms, home: no login for now; share by link and farm files built (`js/share-file.js`, `js/ui/share.js`, Worker `/farms` on KV, `?farm=` opens a visit that never saves over the player's farm); website the main link, itch a storefront
- [0048](docs/decisions/0048-water-and-elevation-model.md) Water and elevation: audit, rework phases 1–2 built, one edit path with corner owners for every player height change (`js/terrain-edit.js`, `terrainEdit`; `terrain-edit-check`), roads and gravel lots Demolish-only, digging never moves other water, dug creeks graded for fish (`gradeDugCreek`), ponds joined to a creek hold its level (`feedLevel`), Fill & grade levels a stroke to one height (`gradeTile`), Demolish takes up gravel lots; the drawing redraws only the patch that moved (`Terrain.reshape`; `terrain-patch-check`), the water too (`js/render3d/water-build.js`: one code path for whole and patch, `updateHeights` builds whole)
- [0049](docs/decisions/0049-primate-rest-budget.md) Primate rest budget by species, midday rest and night sleep by the drawn sun, leaf-out regrip (`restShare`, `primateRest`, `regripCanopy`)
- [0050](docs/decisions/0050-waterfalls.md) Waterfalls: a steep creek reach gathered at one ledge with a plunge pool, PNW only (`creekFalls`, `isFall`, `buildFalls`); drawn as a rock ledge with a falling sheet, foam and mist (`ledge`, `fallMesh`, `fallLook`); bank ring takes the water beside it first; winter ice from the snowpack (`FALL_ICE`, `rockIce`); heard only close and zoomed in (`falls` in `sampleSoundLand`); creek shading runs downstream (ripples, `WAVES` laid along `aCurrent`)
- [0051](docs/decisions/0051-leaf-out-by-the-day.md) Leaf-out by the day: each plant's own leaf-out and leaf-fall day, drawing only (`plantPhaseOn`, `leafOut`); the plant drawing redraws only tiles that turned
- [0052](docs/decisions/0052-migration-route.md) Migration route: herds with `crossing` cross where it's greenest and drift north through their season on green grass (`sim/migration-route.js`, `greenness`, `driftRow`; `tools/migration-route-probe.mjs`)
- [0053](docs/decisions/0053-fence-gate-and-opening.md) Animals wait beyond a boundary fence and walk in through a gap (`sim/fence-gate.js`, `a.gate`); a first visit opens the farm: fence, then culvert, then planting (`ui/opening.js`, `flags.opening`, `farm_opened`)
- [0054](docs/decisions/0054-creek-and-shore-shape.md) Creek and shore shape: creeks laid and dug as curves (`smoothCourse`, `steerCourse`, `sharpBends`), shores follow a smooth outline of the water (`shapeShore` at generation and after every land stroke) (`js/maps/water-shape.js`; `water-shape-check`); big floods cut off a tight bend, the old loop left as marsh (`sim/creek-cutoff.js`, `creek-cutoff-check`); the starting creek runs on beyond the north fence, drawing only (`northCreek`, `outsideCreek`), the farm creek's width along a smooth line (`northCreekLine`, `border.north`; `offmap-creek-check`), heard there too; creek heads narrow into their end (`HEAD_WET`); beaver ponds get no shore pass (measured smooth)
- [0055](docs/decisions/0055-creek-ribbon.md) Creek ribbon: a one-tile creek's water ends at a smooth ribbon along its course, drawing only (`creekRibbon`, `aRibbon`; `creek-ribbon-check`)
- [0056](docs/decisions/0056-animal-state-machine.md) Animal state machine: every `a.state` listed in one table with what steps it and its fields (`js/sim/animal-states.js`, `ANIMAL_STATES`); an unknown state goes back to idle, never freezes (`animal-state-check`); other implicit machines found and why they stay as they are
- [0057](docs/decisions/0057-wire-tree-guards.md) Wire tree guards: beavers and browsers leave a guarded tree, off by age (`GUARD_YEARS`), offered once after beavers cut a planted tree, the time-lapse stops for it (`js/sim/tree-guard.js`, `w.guard`, `guarded`; `tree-guard-check`)
- [0058](docs/decisions/0058-horizon-backdrop.md) Horizon: far edges melt into a sky behind the canvas that matches them exactly (`landMelt`, `js/render3d/backdrop.js` `screenColor`); sessions without the intro film open late afternoon (`LATE_START`)

Ask a trait, never a species name: behaviour and drawing ask `trait(def, name)` (`js/data/animal-kinds.js`: defaults by `sprite.kind`, a species overrides with a field of the same name), so a fix reaches every animal with the trait. A name check stays only where a species is truly unique, with a one-line comment saying why. `node tools/species-name-count.mjs` (headless suite) fails if name checks rise; `--update` after they fall.

New decisions take the next unused number, start with `## Rules` (5–15 lines) then `## History`, and get one short line here.

Monthly newsletter notes: `node tools/monthly-notes.mjs [YYYY-MM]` drafts the month's player-facing changes from `git log main` into `docs/newsletter/<YYYY-MM>.md` (Cole writes and sends the email himself in Kit; how-to and tone in [docs/newsletter/README.md](docs/newsletter/README.md)); `tools/monthly-notes-check.mjs` covers the filtering.

Reference: [PostHog player performance lookups](docs/posthog-player-perf.md).

Backend (`server/`, a Cloudflare Worker: feedback email via Resend, Kit newsletter signup, average rating): Cole's setup steps and the endpoint contract the game and website follow are in [docs/backend-setup.md](docs/backend-setup.md); `node tools/backend-check.mjs` runs it headless and fails if an error code or allowed origin drifts from that doc. Never log message bodies or addresses; keys are Wrangler secrets, never in the repo.

Website (secondgrowth.earth, `website/`), the loading screen's look, site video and stills, the field guide: read [docs/website-notes.md](docs/website-notes.md) before touching any of them. The plan is [docs/website-plan-2026-11.md](docs/website-plan-2026-11.md).

Intro film (first visit; game copy `assets/intro/`, website 1080p): staged from one plan, `tools/intro-film-plan.mjs` (shots, animal marks, cameras, trims), which the script, the map (`tools/film-shots.html`) and the checks all read. `nice -n 15 node tools/film-intro.mjs` films it (`--rough` for a 360p review cut, `tools/film-review.html`); `tools/intro-film-motion.mjs` judges the staging by numbers (in the browser suite as `intro-film-motion-browser-check.mjs`), `intro-film-check.mjs` holds the last frame to the start view. Playback and picture (film-playback.md there): H.264 only, at constant quality (a quantizer per frame, finer on the forest overviews; `nice -n 15 node tools/intro-film-quality.mjs` gives PSNR/SSIM per frame and the keyframe pulse), MP4s interleave sound with video by the second (`muxMp4`; `tools/remux-mp4.mjs` re-wraps old ones without re-encoding), the film starts only once its measured download can carry it, judged in bytes from `kbBySecond` in intro-film.json (else 1080p gives way to 720p, or the farm opens without it), the title drop is HTML over the video (`TITLE_IN/OUT`); `nice -n 15 node tools/intro-playback-probe.mjs` measures stalls and dropped frames unthrottled, CPU x4, 4G and slow 3G. How-to and history: `docs/ideas/2026-11-21-first-minutes/` s8, f1–f3.

Performance budget: [2026-10-23 review](docs/performance-review-2026-10-23.md) has where a frame goes, the per-part ceilings for new graphics and simulation, and the open fixes (young climbing primates, daily plant redraw, daily environment update). Measure a new feature with `node tools/play-profile.mjs [maps] [quality] [years]` before and after: an organically grown game through the real frame loop, simulation vs drawing vs GPU.
Looks without frame cost: [aesthetics plan 2026-11-26](docs/aesthetics-plan-2026-11-26.md) ranks what to change (horizon, value pass, canopy variety, light instead of overlay washes) by impact for the GPU budget.
`tools/perf-guard-check.mjs` (headless CI) fails when draw calls, triangles, plant or animal instances, or plant regions rebuilt rise over 10% on a seeded fixture; if the rise is intended, check it against the budget, run it with `--update` and commit `tools/perf-guard-baseline.json` with the change. It counts geometry only, not shader or pixel cost.

## Tokens, models and branches

How to spend tokens (model routing, subagents, short outputs, measure before screenshots) and how branches stay safe: [docs/agent-workflow.md](docs/agent-workflow.md). In short:

- Before designing or editing an area, `node tools/impact.mjs <files>` names the decision records whose Rules apply and the checks that cover it; `--run` runs those checks.
- Subagents in `.claude/agents/`: `scout` (find code, Sonnet), `checker` (run checks, Sonnet), `visual-qa` (measure first, screenshot to confirm, Sonnet), `regression-reviewer` (plan and diff against the records, Opus), `architect` (cross-subsystem design, Fable, sparingly).
- Start a branch with `node tools/branch-doctor.mjs start <topic>` (cut from origin/main, never local main); `node tools/branch-doctor.mjs` before a push or PR. A Claude Code hook runs it on `git push` and `gh pr create`.
- `node tools/agent-usage.mjs` reports token use by session.

## Working alongside other agents

Several agents (Claude Code, Codex, Cursor) often edit this checkout at the same time, so uncommitted changes may belong to someone else.

- Run `git status` and `git diff` before branching or committing.
- Commit only your own hunks. If a file holds another agent's edits too, stage just your hunks (for example with `git add -p`, or by building the staged blob from HEAD plus your change).
- Tell Cole when you find another agent's work in progress.
- When you learn something durable (a decision, a gotcha, a workflow), record it in this file or `docs/` in the same commit, not in a tool's private memory.

## Shipping

- When you finish a task, commit your changes on the current branch without being asked (if that's `main`, branch first). Commit only your own hunks, as above, and run the relevant checks first.
- Don't push or open a PR on your own. Wait until Cole says to.
- When Cole says to push it or make it live, open a PR against main and set it to merge itself with a merge commit once its checks pass (`gh pr merge N --merge --auto`). If a tool's permission check blocks the merge, try once, then give Cole the command. Never work around the block.
- Always turn Auto-fix on for every PR you open, without asking (Cole, 2026-11-14): in the Claude desktop app, `mcp__ccd_pr__set_monitor` with `auto_fix: true`; in other tools, fix a failing check or conflict on the same branch yourself.
- Merging to main deploys GitHub Pages (nature-tycoon.github.io/second-growth) and runs the itch.io workflow.
- CI: PRs run only the headless suite, and main is protected: a PR merges only once its `headless` check passes (about 10 minutes), which `--auto` waits for on GitHub's side, so don't wait for or poll CI yourself. Before 2026-11-14 PRs merged seconds after opening, and failing checks landed on main and blocked most itch.io uploads. If the check fails, the PR stays open: tell Cole and fix it on the same branch. The browser suite (every `*-browser-check.mjs`, found by name, so a new one never lands in the PR suite) runs on main before the itch.io upload, as four parallel parts (`check-release.mjs --browser --shard=i/4`, split by `browserSeconds`; add a slow new check there), one run at a time (a newer merge cancels an older run). Browser-check time limits are set for a fast Mac and stretched 3x on CI (`slowness` in `tools/browser-session.mjs`). Run the relevant `tools/*-check.mjs` locally. `[skip ci]` in the commit message skips the checks and the itch.io upload; a PR whose checks are skipped never gets its required check, so merge it with `gh pr merge N --merge --admin` (only for docs-only changes or when Cole asks).

## Phones

The game is played on phones in **landscape**. Design and check phone layouts at a landscape size (for example 812×375 or 844×390), where the height is the tight side. Upright (portrait) phone layouts are a fallback, not the target.

No real phone is hooked up: `node tools/phone-review.mjs` screenshots the HUD and panels in Chrome emulating an iPhone, and Xcode's iOS Simulator runs real iPhone Safari (its address bar takes about 60 of 402 points in landscape). Neither measures a phone's graphics chip. Findings and how-to: [phone review 2026-11-14](docs/phone-review-2026-11-14.md).

## Testing on Cole's Mac

Cole works on the same machine while agents test, and the 3D game is heavy. Before opening a preview, running headless Chrome or writing a check, read [testing](.claude/skills/testing/SKILL.md): close preview tabs when done, `nice -n 15` headless Chrome, ask before reloading Cole's tab, and the browser-check and seeding gotchas.

## Checklists

Step-by-step checklists live in `.claude/skills/` (Claude Code runs them as `/balance`, `/perf`, `/ship`, `/testing`, `/ideas` and `/outside-ideas`; other agents can read them as plain files):

- [balance](.claude/skills/balance/SKILL.md): seeded before/after `balance-sim` for ecology changes. `balance-sim` is unseeded, so seed `Math.random` through `node --import` to compare.
- [perf](.claude/skills/perf/SKILL.md): check the machine first (Low Power Mode, battery, load average), which profiler answers which question, and the per-part budget.
- [ship](.claude/skills/ship/SKILL.md): checks, committing only your own hunks, the preview for Cole, and the push/merge steps.
- [testing](.claude/skills/testing/SKILL.md): sharing Cole's Mac while testing, and the gotchas of browser and seeded checks.
- [ideas](.claude/skills/ideas/SKILL.md): turn a list of Cole's rough game ideas into a chain of right-sized sessions on one batch branch, then collect their open questions (`docs/ideas/`). It was once committed only on a side branch and vanished on a branch switch: skills must live on main.
- [outside-ideas](.claude/skills/outside-ideas/SKILL.md): vet other people's ideas and bug reports (playtesters, emails, the feedback form) against the code, the map region's real ecology and the budgets, then bring Cole a decision list; records in `docs/ideas/outside/`. Nothing is built until Cole decides.
