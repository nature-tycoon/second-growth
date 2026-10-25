# Performance review, 2026-10-23

Cole reported the game slowing down again and asked where the time goes now, how simulation and drawing split it, what is realistic, and whether better graphics and more simulation will fit. This review follows the [October 15 audit](performance-audit.md) and [plan](performance-plan.md) (decision [0004](decisions/0004-ecosystem-performance.md)).

## What was measured

- **Machine.** Apple M5 MacBook, 10 CPU and 10 GPU cores, Chrome 156, hardware GPU (ANGLE Metal). At the start the Mac was on battery with Low Power Mode on (`pmset -g custom` shows it on for battery), and the game's Auto frame rate drops to 30 fps on battery (`js/main.js`). Cole turned Low Power Mode off partway through. The browser runs below were nice'd and were not run during the node runs.
- **Organic games** (`node tools/play-profile.mjs`, new). The restored farm from the release fixtures, with three years of wildlife arriving and breeding, played through the real frame loop at 1440×900 CSS pixels and DPR 2 (2880×1800 drawn, like Cole's screen), High quality, shadows and day cycle on. Four views per map: normal (zoom 0.7), zoomed out (0.25), top speed and close-up (2). Each is 8 s after a 3 s settle. GPU time comes from the game's timer queries.
- **Fixed fixtures** (`tools/ecosystem-profile.mjs --quality=high --width=1440 --height=900 --dpr=2`): the same seeded low/medium/high density scenes as the audit.
- **Simulation alone** in node: `game.update` per frame on fixtures at speeds 1 and 3, plus daily/monthly tick timing and a CPU profile.
- **A/B against `f14cae3`** (October 18, the last speed work, before carcass decay, home ranges, landscape of fear, trails as curves and the rest) with every harness above, each checkout in its own worktree.

## Is it a regression?

Not overall. On the fixtures, today's code is the same or slightly faster than October 18 (for example dense Sumatra moving: 15.2 vs 17.7 ms frame work; PNW high: 4.8 vs 6.3 ms). Simulation alone is within about 10–20% of October 18 on every map. In the organic games most views match within noise; the two checkouts' ecologies diverge, so single numbers differ by run. Amazon's animal drawing was higher in today's run (5.0 vs 0.8 ms in the normal view), but the howler/spider canopy bench is identical between checkouts, so that is which monkeys were young and on screen, not new code (see the first finding below).

The slowdown Cole noticed is most likely three things together: Low Power Mode on battery plus the 30 fps battery cap, older costs that grow as a game matures (plants redrawn every day, the daily environment update), and young rainforest primates, which cost far more than adults (below).

## Where a frame goes now

Milliseconds per frame, averaged; organic games, 3 years in, M5, High, 2880×1800. At 60 fps the whole frame has 16.7 ms; at 30 fps, 33.3 ms. "Drawing" is the processor side of drawing and includes plants and animals; GPU is the graphics chip's own time and runs alongside.

| Map | View | FPS | Simulation | Drawing | of which plants | of which animals | GPU | Slowest frame | Triangles | Animals |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Serengeti | normal view | 59 | 1.3 | 5.7 | 4.0 | 0.2 | 8.5 | 45 | 0.9M | 300 |
| Serengeti | zoomed out | 59 | 1.3 | 5.8 | 3.7 | 0.7 | 8.4 | 42 | 2.2M | 323 |
| Serengeti | top speed | 41 | 7.1 | 14.9 | 9.8 | 0.4 | 10.6 | 69 | 1.7M | 335 |
| Sumatra | normal view | 57 | 1.6 | 9.6 | 7.1 | 0.7 | 11.1 | 61 | 2.5M | 318 |
| Sumatra | zoomed out | 29 | 2.6 | 31.1 | 10.6 | 12.5 | 19.7 | 105 | 6.4M | 316 |
| Sumatra | top speed | 6 | 23.4 | 133.6 | 22.1 | 13.9 | 20.3 | 121 | 6.8M | 384 |
| Amazon | normal view | 58 | 1.0 | 13.1 | 5.5 | 5.0 | 11.8 | 59 | 1.7M | 191 |
| Amazon | zoomed out | 30 | 1.6 | 31.3 | 8.1 | 16.9 | 18.5 | 109 | 9.6M | 188 |
| Amazon | top speed | 17 | 8.7 | 48.0 | 16.5 | 4.8 | 15.1 | 103 | 6.0M | 236 |
| PNW | normal view | 59 | 0.8 | 5.7 | 3.9 | 0.2 | 8.3 | 42 | 0.6M | 148 |
| PNW | zoomed out | 58 | 1.0 | 9.9 | 7.1 | 0.7 | 10.8 | 55 | 3.2M | 168 |
| PNW | top speed | 44 | 4.0 | 15.3 | 10.9 | 0.3 | 10.3 | 65 | 1.9M | 128 |

(Close-ups match the normal view within a few ms. The game's automatic quality can step down during the slowest runs, which is part of why Sumatra at top speed reads oddly; treat it as "far too slow" rather than an exact figure.)

**Split.** At normal speed the simulation is 1–3 ms, about a tenth of the frame. Drawing on the processor is 6–13 ms, and most of it is plants. The GPU takes 8–12 ms at Retina resolution in ordinary views and 15–20 ms zoomed out over rainforest. At top speed the simulation grows to 4–23 ms, mostly the daily tick, and the plants redraw continuously.

**Fast quality** (DPR 1.5) cut GPU time in PNW from 8.3 to 5.4 ms (normal view) and in Sumatra from 11.1 to 9.2 ms. In ordinary views the GPU cost tracks the number of pixels more than the number of triangles. Zoomed out over rainforest it tracks triangles (6–10M).

## Findings, largest first

1. **Young climbing primates cost 7–10× what adults do (bug; fixed, see below).** A juvenile's drawn size grows a little every frame (`ageF` in `Actors.update`). `canopyLean` (`render3d/canopy-pose.js`) keeps its body outline only while `st.sc` is unchanged, so every young climber copies its 700–860-point outline and `clustersFor` (`render3d/wood-clearance.js`) regroups it from scratch, every frame. `tools/canopy-bench.mjs` with the fixture's ages changed from 1200 to 200 days: 12 howlers/spiders went from 3.3 to 21.4 ms per frame and 12 langurs/siamangs from 2.9 to 29.5 ms. In the Amazon CPU profile, `clustersFor` was a quarter of all main-thread time. This is why rainforest maps fall to about 30 fps zoomed out, even on an M5. The October monkey speed-ups were measured on adults only. Fix: keep the outline when only its scale changes, and scale the cached cluster radii with it. Spheres that bound their members under one uniform scale still bound them after it, and every candidate is still tested point by point, so the answers stay exactly the same. Check with `canopy-bench` signatures at both ages.
2. **Plants redraw the whole map every game day (the every-frame part fixed, see below).** Every growing plant changes `treeG`/`shrubG`/`groundG` daily, so `FloraChanges.find` marks nearly all 12 regions dirty, and `Flora.rebuild` redraws one region per frame for 12 frames out of every ~83 at normal speed. Each of those frames costs 25–60 ms on the M5, which shows as a stutter even while the average reads 59 fps. Plants are the largest steady drawing cost on every map (4–11 ms per frame averaged). Within that, `find` scans about 14 whole-map arrays on every call, including each continuing region frame; in PNW it was 22% of frame time. Fixes, smallest first: (a) skip `find` while waiting regions are still being worked through. The next `find` still compares against the saved snapshot, so nothing is missed. (b) Then redraw a plant only when its drawn size changes visibly, or move growth into a per-instance scale so it needs no replay. (b) is a small visual tradeoff and needs Cole's review.
3. **The daily environment update is heavy on wet maps.** `dailyTick` takes a median of 21 ms in Sumatra after 2 years (8 ms in the Serengeti), and only about 1 ms of that is wildlife. The rest is `updateEnvironment`, mostly `classifyAndResources`, `updatePlants`/`plantSuit`, the distance fields and the Sumatran `estateStats`. At normal speed it lands once every 1.4 s. At top speed (8 days a second) it is most of the 23 ms simulation figure. This is the plan's P5. Recompute only what each day can change, or spread it over frames. Either changes ecology timing, so `balance-sim` must be run before and after.
4. **Zoomed-out rainforest is heavy on the GPU too.** 6–10M triangles and 15–20 ms of GPU even with the animal fix. Far vegetation models exist (`useFar`) but switch on only when the game detects it is slow. A screen-size switch for distant trees, like the one animals already use, is the plan's open P4 vegetation item. Done 2026-10-24 ([0022](decisions/0022-far-vegetation-by-screen-size.md)): far models zoomed out on every computer; Amazon zoomed out 7.9M → 2.6M triangles, Sumatra 12.3M → 6.3M.
5. **Monthly hitch.** `wildlife.monthly` takes 8–27 ms, and a month change also redraws every plant region. Smaller than the above.

Memory: the JS heap's used size reached several hundred MB over a long run. That figure includes uncollected garbage, so it does not show a leak; it is noted only so a soak test can check it later.

## What is realistic

- **Where it stands.** On this M5, ordinary views hold 60 fps with room to spare. The game falls short zoomed out over rainforest, at top speed on wet maps, and in the small stutter each game day. Decision 0004's low-end target (30 fps on an Intel HD 520 laptop, Fast, native resolution) is still far off. Those laptops are very roughly 3× slower than the M5 on the processor and well over 10× slower on the GPU, so today's 6–13 ms of drawing and 8–12 ms of GPU become about 20–40 ms and 50 ms or more. The PostHog data agree: players moved to Fast run at a median of 7–38 fps.
- **Comparable games.** Ecosystem and management games (Planet Zoo, Cities: Skylines, Eco, Equilibrium) commonly let the frame rate fall at top speed and in huge late games. They run the simulation at a fixed tick that does not depend on the frame rate, and spend most of the frame on drawing. Second Growth's split, about 10% simulation at normal speed, is healthy. Its problem is drawing work redone when nothing visible changed, which can be fixed without losing anything. Wanting 60 fps at normal speed on a good laptop and 30 fps on a weak one, while letting top speed drop to 30 on good hardware, is a realistic standard for this kind of game.

## Budget for new graphics and simulation

Per frame on the M5 at Retina High, normal speed, in an organic 3-year game (`tools/play-profile.mjs`). The ceilings leave room for the low-end target at roughly 3× slower.

| Part | Ceiling | Now (ordinary views) | After findings 1–2 (estimate) |
| --- | ---: | ---: | ---: |
| Simulation, normal speed | 3 ms | 1–3 ms | unchanged |
| Simulation, top speed | 10 ms | 4–23 ms | finding 3 needed |
| Drawing on the processor | 8 ms | 6–13 ms | about 3–6 ms |
| GPU (2880×1800, High) | 11 ms | 8–12 ms | unchanged |
| Slowest frame, normal speed | 33 ms | 41–61 ms | target |

What that means for the next features:

- **More simulation is affordable** if it stays out of per-frame, whole-map and all-pairs work. Keep per-animal work linear in the number of animals, with spatial queries near the animal. Do whole-map work at most once a day, and only on tiles that changed. Keep anything costly out of `wildlife.update`, which runs ten times per game day at top speed. Today the simulation leaves about 1–2 ms of the 3 ms ceiling at normal speed. Fixing finding 3 frees much more at top speed.
- **Better graphics need to be paid for, mostly on the GPU.** The GPU already uses 8–12 ms of 16.7 at Retina High. Full-screen effects (ambient occlusion, bloom, depth of field, screen-space reflections, a second shadow cascade) cost per pixel. Several of them would exceed the budget on this Mac at DPR 2 and are out of reach on low-end laptops. Put each one behind the quality setting (on for High, off for Fast), consider drawing it at reduced resolution, and measure it. Richer models and materials up close cost little, because close-ups draw few objects. More triangles in wide views is where it hurts: pair any added detail with distant simplification.
- **Fix findings 1 and 2 first.** They free roughly 5–15 ms of processor time per frame, more than any new feature is likely to need. Doing them after new work would make it hard to tell what the new work costs.
- **Check every new feature against this table:** `node tools/play-profile.mjs` before and after (at least the affected map), plus the existing headless benches for the subsystem touched.

## Fixes, later the same day

**Young climbers** (`canopyLean` and `clustersFor`). The outline is now rescaled in place, and the cached clusters scale their radii with it. `tools/canopy-bench.mjs` gives the same signatures at both ages. With `CANOPY_AGE=200`, 12 juveniles: howlers/spiders 9.5 → 1.5 ms per frame, langurs/siamangs 10.5 → 1.3, capuchins 11.1 → 2.4, orangutans 1.4 → 0.6. Adults are unchanged.

**Plants redrawing every frame.** The daily growth wasn't the main cost. In the live game the plants were rebuilt on almost every frame (473 rebuilds in 473 frames): animals wear `trailDensity` with nearly every step, and plants read it to leave gaps along trails. Every footstep marked a region as changed, and `find` put those regions first. Only one region is redrawn per frame, so regions that only needed to grow could wait indefinitely. In node at normal speed the old code ended a test with 7 regions and 5,400 tiles still waiting to grow, and new games showed growth late across much of the map. Plants now take up trail wear once a game day, as the ground's trail texture already does. Wear that stays at or below where any plant gives way (`TRAIL_CLEAR`) is never a change, which is exact: a blend of wear samples below that line can't open a gap. In node the queue now empties every day (0 tiles waiting). In a live 3-year game: 473 → 54 rebuilds in 8 s. `flora-rebuild-bench` signatures are unchanged, and `plant-replay-check` covers the rule.

Before → after, organically grown 3-year games, M5 at Retina High, measured old and new back to back for each map (another agent's sweep was loading every core, so absolute numbers run high; compare within a row):

| Map | View | FPS | Drawing (ms) | Plants (ms) | Animals (ms) | Slowest frame (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Serengeti | normal | 59 → 60 | 5.6 → 1.8 | 3.9 → 0.5 | 0.2 → 0.2 | 43 → 19 |
| Serengeti | zoomed out | 59 → 60 | 5.6 → 2.3 | 3.7 → 0.4 | 0.7 → 0.7 | 38 → 13 |
| Sumatra | normal | 58 → 59 | 8.4 → 4.3 | 5.3 → 1.3 | 0.9 → 0.6 | 60 → 37 |
| Sumatra | zoomed out | 30 → 37 | 30.9 → 17.0 | 8.0 → 3.7 | 16.1 → 5.1 | 76 → 74 |
| Sumatra | close-up | 58 → 58 | 10.3 → 4.7 | 7.4 → 1.6 | 0.6 → 0.5 | 58 → 35 |
| Amazon | normal | 59 → 60 | 5.5 → 2.6 | 3.9 → 0.9 | 0.3 → 0.3 | 37 → 26 |
| Amazon | zoomed out | 52 → 54 | 15.6 → 9.6 | 6.6 → 1.9 | 3.4 → 1.9 | 64 → 52 |
| PNW | normal | 60 → 60 | 3.7 → 2.2 | 2.7 → 0.5 | 0.1 → 0.2 | 27 → 18 |
| PNW | zoomed out | 60 → 60 | 3.7 → 2.2 | 2.6 → 0.7 | 0.3 → 0.3 | 34 → 18 |

(How many young monkeys are on screen differs between runs, so the animal column varies more than the code does.)

**Top speed is slower, because the plants now keep up.** At top speed (8 days a second) a day passes in about 8 frames, which is less than one sweep of the 12 regions. The old code mostly redrew the same regions the animals were in and left the rest behind. In two alternating reruns, plant time rose from 5.6–8.4 to 9.9–14.0 ms per frame (PNW 55–57 → 49–54 fps, Amazon 49–54 → 39–45 under load). Serengeti and Sumatra didn't change materially. This is the true cost of drawing a day's growth. The remaining fix is finding 2(b): redraw a plant only when its drawn size changes visibly, or move growth into a per-instance scale. That would cut growth redraws at every speed, but it is a small visual tradeoff for Cole to review.

**Daily growth and shade, exact (later still).** A day's growth and shade change most tiles, and each change re-worked every tile within two of it. A plant's growth draws only its own tile, except for the wood-edge fringe (trees past 0.45, shrubs past 0.3, up to two tiles away), and plants read shade only as their own tile being under a closed canopy (0.5). Changes that cross none of those lines now re-work just their own tile. The same plants are drawn (`flora-rebuild-bench` signatures), and `plant-replay-check` covers the crossings. In node, tiles re-worked fell 65% at normal speed and 45% at top speed. In game at top speed, plants went from 6.0 to 4.9 ms per frame in PNW and from 10.7 to 8.9 in Sumatra. At normal speed plants were already about 0.5 ms.

**Growth in size steps (prototyped, dropped by Cole on 2026-10-23).** Each growing plant's drawn size is rounded to a 1.5% step, and changes are compared as drawn. In review shots 0.4–0.8% of pixels differ, against 0.02% between two captures of the unchanged game. Full-grown plants and the border forest don't change. At top speed it cut plants from 4.9 to 3.9 ms in PNW, with no measurable change in Sumatra. The gain was too small and uneven to justify a stepped growth value everywhere plants read growth, so growth is still drawn exactly. Don't revisit this without a new measurement showing growth redraws dominate.

Unrelated, already failing before these changes, and left alone: `tools/primate-stall-check.mjs` (an orangutan held at a failed grip for 53.9 days; identical output on the unchanged checkout) and `tools/render-boundaries-check.mjs` (`terrain-materials.js` imports `sim/animal-trails.js`, from the trail commits).
