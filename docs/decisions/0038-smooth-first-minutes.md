# 0038 Smooth first minutes: no stalls for new animals, plant regions or the daily update

2026-11-01. Cole: "Still noticeable lag... right from the get go." PostHog agreed: over the previous
10 days, players under 20 fps in their first 10 minutes of a game (Chromebooks, older Windows
laptops, Android phones) spent a median 42 ms a frame drawing on the processor, 110 ms in their
slower frames, 12 ms (32 ms) on the simulation and 44 ms on the GPU, with only about 100 draw
calls. On the M5 a new game averages 60 fps on every map but Sumatra, so the lag is mostly
single long frames (stutter), and on a laptop 5-10x slower each of those is a visible freeze.

Measured with `tools/new-game-profile.mjs` (new): each map started fresh, as a player starts it,
at normal and fast speed, through the real frame loop, counting long frames and what each of the
slowest went to.

## What stalled a frame (M5, High, a new game)

| Cause | One frame | How often |
| --- | ---: | --- |
| An animal kind seen for the first time: its model, its distant model and its shader built while drawing | 10-100 ms | each of 20-30 kinds arriving in the first minutes (`tools/species-warm-probe.mjs`) |
| A day's plant growth redrawn, one 48-tile region a frame | 15-30 ms | up to 12 frames every game day |
| The daily update (`Game.dailyTick`) | 5-25 ms | every game day (1.4 s at normal speed) |
| A new month (`Wildlife.monthly`, mostly every species' habitat on every tile) plus the autosave packing the save | 26-36 ms + 7-9 ms | every 10 game days (`tools/month-cost-probe.mjs`) |

## Decision

1. **Animals warmed in idle time** (`Actors.warmAnimals`, started with the game). Every look of
   every kind on the map (`drawLooks`: adult male, winter plumage) is built one per idle moment,
   resident kinds first, with its distant model, and its shader compiled through
   `compileAsync` (in the background where the browser can). All are ready within a few seconds
   of loading (38 looks on Sumatra, 40 in PNW). Anything not ready is still built on the spot.
   Nothing about the animals changes.
2. **Smaller plant regions under a time budget.** Regions are 24 tiles across instead of 48
   (`Flora` `chunkSize`), and the renderer rebuilds at least one a frame and more while the
   frame's plant work stays under 4 ms (`FLORA_FRAME_MS`), so a fast computer keeps up at top
   speed and a slow one pauses a quarter as long. While a day's regions are still queued,
   `Flora.rebuild` works through them without comparing the whole map again (the review's open
   fix 2a); the snapshot isn't refreshed either, and one more comparison after the last queued
   region picks up anything that changed meanwhile. The plants drawn are the same: the bench's
   region-independent `plant set` signature matches 48-tile regions on PNW, Sumatra, Serengeti
   and Amazon.
3. **The day in parts.** `Game.dayWork` is the day as a generator: the environment, then plants
   and seeds, then wildlife, visitors, events and weather, then (at a new month) the habitat
   scores six species at a time and the rest of the month. The live game (`Game.update`) runs one
   part a frame; the month's autosave waits for a frame of its own (`saveDue`). `dailyTick`,
   `monthlyTick`, `Wildlife.monthly` and `computeSuitability` still do it all at once, in the
   same order, so headless tools and checks are unchanged: seeded `balance-sim restore 15` and
   `idle 10` are byte-identical before and after. In the live game the animals take their small
   steps between the parts, as they already did between days. A new day or a save finishes any
   day still in progress first (`finishDay`), a load or new game drops it, and the ground and
   plant redraws wait until the day's parts are done.

## Results

New games, M5 on mains power with the Mac otherwise quiet, High, 2880x1800, 20 s at each speed,
`new-game-profile`, the code before this change (821628a) and all three parts back to back,
2026-11-02. Each new game rolls its own run seed, so single frames vary by game; Sumatra was
run three times on each side. "Long frames" are frames whose processor work alone took over
16 ms (a dropped frame at 60 fps on the M5, and several on a laptop 5-10x slower).

| Map | Speed | FPS | Long frames in 20 s | Slowest frame (ms) |
| --- | --- | ---: | ---: | ---: |
| Serengeti | normal | 60 → 60 | 3 → 1 | 20 → 21 |
| Serengeti | fast | 60 → 60 | 1 → 0 | 17 → 15 |
| Sumatra (3 runs) | normal | 56 → 55-56 | 8-14 → 2-14 | 21-57 → 24-31 |
| Sumatra (3 runs) | fast | 54-57 → 48-57 | 26-94 → 23-401* | 69-84 → 70-125 |
| Amazon | normal | 60 → 60 | 4 → 1 | 25 → 21 |
| Amazon | fast | 60 → 60 | 1 → 0 | 168 → 16 |
| PNW | normal | 60 → 60 | 6 → 2 | 40 → 51 |
| PNW | fast | 60 → 60 | 14 → 6 | 31 → 28 |
| Atlanta | normal / fast | 60 → 60 | 4 → 0 / 3 → 0 | 20 → 14 / 18 → 15 |
| Chinandega | normal / fast | 60 → 60 | 1 → 2 / 5 → 0 | 23 → 25 / 23 → 13 |
| Reef | normal / fast | 60 → 60 | 0 → 0 / 1 → 0 | 13 → 8 / 20 → 11 |

\* One of the three Sumatra games after the change grew a much denser view (5.7M triangles
against 3.5M), and its slow frames went to the graphics submit, not to the simulation or the
plants; the other two matched the before games (23 and 26 long frames against 26 and 27).
Average frame rates and work per frame are unchanged within noise on every map: on this Mac the
gain is in the long frames, which are what a slow laptop feels as stutter. The worst single
frames left are mostly graphics, not these causes.

The simulation alone in node (`game.update` at 60 frames a second for 60 s), frames over 16 ms
before → after: PNW normal 2 → 1, PNW fast 7 → 0, Sumatra normal 5 → 0, Serengeti normal 2 → 0,
Sumatra fast 0 → 1.

An earlier run (2026-11-01, another agent's simulations loading the Mac) showed bigger gains
from parts 1 and 2 alone, for example Sumatra at fast 20 → 39 fps; under load the stalls cost
more, as on a slower computer.

## Simulation cost per game day after the wave-2 merge (2026-11-02)

The combined branch (PR 83: 0033-0038 on top of wave 1) ran the simulation 17-22% slower per game
day than main on the Serengeti and Chinandega. Node, seeded (`Math.random` LCG s=7), untended,
15 years, `dailyTick` plus ten `wildlife.update(0.1)` a day, M5 on mains power. Average ms per game
day over years 2-15:

| Map | main (0be3dae) | combined (7103a38) | now |
| --- | ---: | ---: | ---: |
| PNW | 9.0 | 7.8 | 6.1 |
| Amazon | 7.3 | 7.9 | 6.3 |
| Serengeti | 11.6 | 14.1 | 10.9 |
| Atlanta | 5.8 | 5.6 | 4.4 |
| Chinandega | 12.1 | 14.2 | 10.1 |
| Reef | 6.8 | 7.5 | 6.6 |
| Sumatra | 22.9 | 21.3 | 14.4 |

Where it came from (bisected over the first-parent commits): on the Serengeti about half was more
animals alive (300 against 270 on average; shared prey, 0037, lets more predators and rare prey
persist) and half was per-animal cost from wave 1's steering (0025). On Chinandega it was nearly
all per-animal cost, the largest step at 0034: a river fish whose waypoint or position is in the
shallows searched ~290 points for deep water every step, and a fish stranded in shallow water
did it every frame.

The fixes give exactly the same simulation (seeded `balance-sim restore 15` and `idle 10`
byte-identical; every map's yearly forest, mature trees, animals and score identical at s=7, and
at s=11 on three maps). Each is a cheaper way to the same answer:

- `deepWaterNear` (`sim/waterline.js`) tries its grid nearest first and stops at the first deep
  enough point, looking each tile's water level up once; `tileWaterLevel` no longer builds an array.
- `wetTest` looks each tile's drawn water level up once per search, for `lastDry` (bank spots),
  `nearestWater` (where a drinker's head goes) and `backToWater`.
- A landed bird's alarm (`birdAlarm`) checked whether every animal on the map threatens it, every
  few hours of game time: now nearer than the best so far first, and the species-pair answer is
  kept per map and difficulty (`threatens`). It was a tenth of the Serengeti's time.
- Prey vigilance (`watch`) tests distance before cover and footing.
- The spacing grid (`AnimalSpacing`) is a flat array of three-tile squares rather than a hash map.
- The daily distance fields (`distanceField`, a dozen a day) are two sweeps rather than a flood
  fill: the same city-block distances in about a third of the time.
- `w.tileH` without a temporary array; the reef's dry-cay test is kept per height version (`w.hv`).

Not reached: the first game year on Amazon and Chinandega is still about 1-1.5 ms a day dearer
than main (Amazon 6.5 against 5.0, Chinandega 9.0 against 7.1), mostly more animals arriving in
that first year (41 against 25 on Amazon) and the warm-up of the larger code. Tools for the next
look: a per-function CPU profile (`node --cpu-prof`) of a 12-year seeded run, compared
inclusive-time by function between two checkouts.

## Not done

- **The daily plant redraw itself.** A day's growth changes almost every region on every map (27-30
  of 30 regions a day), so plants are rebuilt all over each day: 21 ms of work per game day in
  PNW, 60 in Sumatra (`tools/plant-churn-probe.mjs`). The parts above spread it out; they don't
  shrink it. The review's finding 2(b), redrawing a plant only when its drawn size changes
  visibly or growing it in the shader, is the next step, and needs Cole's review of the look.
- **Sumatra's opening view** draws 3.5-6M triangles, and the GPU takes 14-19 ms on the M5 (48-57 fps).
- The 1.6 s frame seen once in Sumatra at fast speed was not reproduced.
- `perf_sample` has no count of single long frames; `slow_frames_pct` mixes stutter with a low
  steady rate. A `long_frames` count (over 100 ms) would show in PostHog whether this helped.

## Check

`node tools/new-game-profile.mjs [maps] [quality] [seconds]` (under `nice -n 15`) before and after
any change to what a frame does; `tools/flora-rebuild-bench.mjs` (its `plant set` must match),
`plant-replay-check`, `plant-performance-check`, and seeded `balance-sim` for the day parts.
