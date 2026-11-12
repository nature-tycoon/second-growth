# 0041 Primate movement: fix today's climbing piece by piece, not the canopy rewrite

Decided 2026-11-11 (wildlife-polish batch, session 4). Cole asked for a choice between his own movement model and fixing today's code, then for the winner to be built.

## What was on the branches

- `monkey/canopy-walker`, `canopy-primates`, `smooth-primate-hitches`, `codex/primate-canopy-recovery`, `codex/primate-movement-fixes`, `codex/primate-tree-transfers`, `codex/canopy-climbing-fixes`: nothing that isn't already in `main` (`git log main..<branch>` is empty). The walker rig (alternating limbs, trunk climbs, leaps) is live.
- `monkey/canopy-rewrite-wip` (one WIP commit, 2026-10-17): the unmerged model. 107 files, about 29,000 lines (most of them baselines), on a base 307 commits behind today's `main`. It adds a canonical tree skeleton (`js/trees/`), a navigation graph and router (`js/navigation/`, with a worker), and a simulation-owned locomotion state machine (`sim/canopy-locomotion.js`) behind an off-by-default species flag. Its own record (`docs/decisions/0003-canopy-locomotion.md` on that branch) ends with "Forest-scale audit: rollout blocked", a guanacaste transfer clearance check still failing, growth re-preparation, save/load, troop spacing and other maps untested, and no proof yet that it is cheaper than the live code (Cole's requirement). It rewrites `render3d/geometry/trees.js`, which `main` has changed a lot since (tree heights 0024, trunks 0023, far models 0022).

## Decision

Fix today's code piece by piece. Don't port the rewrite.

- **Completeness.** The rewrite's own audit blocked rollout; it never ran for a monkey in the real game. Porting it is weeks of merge and validation, not one session, and it would arrive unfinished.
- **Risk.** It replaces how every tree is built and who moves climbers, across code that has moved on for a month. Today's code passes every primate check.
- **Cost.** Its main-thread navigation measured 0.3–0.5 ms per update for 24 monkeys plus a worker; the live simulation side is about 0.04 ms, and the render side is the cost the perf review already cut (young climbers, 2026-10-23). There is no evidence it would be cheaper.
- **What the measurements say.** The worst problem today is not missing navigation but a mismatch of speeds: the simulation moved climbers faster than their drawn bodies can go along the wood.

The rewrite's idea that the simulation should know which crowns really connect is still right, and it is the follow-up for the gaps below. Its branch stays as a reference.

## The problems, measured

`tools/monkey-movement-measure.mjs` runs eight of a species in a seeded patchy forest (about one tile in three open, plus an open strip) through the real `game.update` and `Actors.update`, headless, and reports how far the drawn body trails the simulation (lag), snaps (a jump of over half a tile in one frame), stuck time (still for a second while over a tile behind), blocked crossings, dashes, ground time, how much longer the drawn route is than the straight line (route stretch), and how fast the body actually goes while catching up, relative to the simulation (chase/sim pace).

Before, at normal speed: the body trailed by 1–2.4 tiles on average and was over a tile behind 36–74% of the time (p95 up to 7 tiles); capuchins and Congo monkeys snapped forward several times a minute; orangutans were blocked 35–43% of the time and stuck 15–24%. While catching up, bodies managed only 0.4–0.6 of the simulation's speed.

Why:

1. `climbSpeed` assumed the drawn route is a third longer than the straight line. Measured, it is 1.5–2.2× (2.7 for howlers, which zigzag through forks).
2. The walker monkeys (howler, spider, capuchin, colobus, langur) are drawn at most 1.5 body lengths a second, so each stride stays visible; siamangs at one arm's stride per swing. Capuchins' simulated speed was already above that before the longer route.
3. At faster game speeds the strides, swings and leaps stayed at real-time pace while the simulation ran 4× faster.
4. Orangutans could only cross between crowns whose limb tips came within 0.85 body lengths. In a real Sumatran stand the nearest tips are a median 1.9 body lengths apart, so 3 crossings succeeded and 166 were blocked in a minute.

## What changed

- `sim/climb-pace.js`: `drawnClimbPace` is the drawn body's real top speed along the wood (the walker stride cap, the siamang swing, or `climbPace`), in tiles per game day. A primate's `climbSpeed` is that over `CANOPY_ROUTE` (1.7). Squirrels and sloths keep the old `climbPace * .75` (not measured here). `WALKER_STRIDES` and `SWING_CADENCE` are shared with `canopyStep`, so the two can't drift apart again.
- `render3d/canopy-motion.js`: at faster game speeds the stride, swing and leap timings quicken with the simulation (up to 4×). An orangutan reaches 1.6 body lengths across a gap (its arm span), still only where the crossing clears the wood. That is nearer life but made no measurable difference: the clearance check, not the reach, rejects most crossings.

Primates now travel about a third (capuchin, siamang) to two thirds (howler, langur) as fast as before in the simulation. Real howlers, siamangs and orangutans travel well under a kilometre a day and rest most of it, so slower is also nearer life.

## Results

`monkey-movement-measure`, eight of each for 40 s, old code (a worktree at the previous commit) vs new:

| Normal speed, patchy stand | lag mean (tiles) | p95 | time over a tile behind | chase/sim pace |
| --- | --- | --- | --- | --- |
| howler | 1.13 → 0.59 | 3.2 → 1.8 | 43% → 20% | 0.56 → 0.79 |
| spider | 1.45 → 0.71 | 5.3 → 1.8 | 39% → 23% | 0.39 → 0.84 |
| capuchin | 2.69 → 0.84 | 6.6 → 1.8 | 77% → 36% | 0.39 → 0.85 |
| congo | 0.94 → 0.81 | 2.4 → 1.6 | 38% → 29% | 0.69 → 0.81 |
| langur | 1.18 → 0.66 | 4.1 → 2.3 | 39% → 23% | 0.39 → 0.82 |
| siamang | 1.35 → 0.47 | 4.3 → 1.7 | 46% → 15% | 0.30 → 0.73 |
| orangutan | 1.53 → 1.42 | 5.0 → 4.5 | 44% → 47% | 0.43 → 0.56 |

The dense stand moved the same way (spider 2.36 → 0.79, capuchin 2.72 → 0.83, siamang 1.96 → 0.67 tiles). Orangutans are no better: blocked 31% → 33%, stuck 12% → 14% (noise). At speed 2 the walker monkeys trail about half as far as before (capuchin 5.7 → 2.1, langur 5.1 → 2.6 tiles), but still too far. Actors time is unchanged within noise. Balance: `balance-sim restore 15` (Hollis, seeded) is identical. On the three primate maps over three seeds, year-9 primate counts move both ways within seed noise. `play-profile amazon high 1`: simulation and drawing time unchanged (0.4 ms and 2.3 ms in the play view). In a real browser on a grown Amazon game, 23 howlers and spider monkeys trailed by 0.32 tiles on average, with no snaps.

## Still open

- **Orangutans still meet crowns they can't cross** (blocked about a third of the time in the patchy stand). Real ones sway a tree to close the gap or come down and walk. Both need the simulation to know which neighbouring crowns connect, as the rewrite's tree layer did; then a blocked crossing becomes a climb down, a walk and a climb up (the existing `climbers.js` ground mode).
- **At speed 2 and above the body still trails** (about 1.5 tiles on average). The simulated point wanders inside a crown faster than the drawn body can reroute limb to limb.
- Capuchins and colobus still snap forward a few times a minute in the patchy stand.
- How much of the day each species spends travelling isn't tuned. Capuchins are on the move about 90% of the time.

## Checks

`node tools/monkey-movement-measure.mjs [species] [patchy|dense] [speed] [seconds] [count]` (`MEASURE_ROOT=<checkout>` for an A/B), and the existing primate checks: `canopy-grips-check`, `canopy-route-check`, `canopy-support-check`, `canopy-walker-profile-check`, `monkey-pace-check`, `monkey-transfer-check`, `orangutan-motion-check`, `primate-behavior-check`, `primate-stall-check`, `climber-cap-check`.
