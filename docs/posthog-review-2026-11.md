# PostHog review, 2026-11

Read 2026-11-09 from PostHog project 630638, mostly the last 30 days (Oct 10 – Nov 9), with the
internal/test cohort left out. Small numbers: about 150 players sent frame-rate samples, so treat
any figure under ~10 players as a hint. All numbers are per-player medians unless said otherwise.

## Summary for Cole

- **About 1 phone player in 5 never gets in.** They see "Turn your phone sideways" and leave
  without turning it: 14 of 75 phone players in 30 days, and 13 of those 14 never started a game.
  This is the biggest single loss the data shows, and the cheapest one to fix.
- **The rainforests are the slow maps.** Sumatra (median 18 fps on computers) and the Amazon (22)
  are far behind PNW (30), the Serengeti (38) and Chinandega (39). Sumatra gets worse the longer
  people play: after 15 minutes, 88% of its frames are slow.
- **Ordinary laptops are the main audience, and they struggle.** Windows laptops and Chromebooks
  with built-in Intel/AMD graphics are the largest group (55 players). They run at a median 25 fps
  and 23 of 55 run well under their frame cap. Real HD 520 laptops (the target in decision 0004)
  run at 13 fps. Both drawing (15 ms) and the graphics chip (18 ms) are over budget there; the
  simulation (4 ms) is not the problem.
- **The first 30 seconds are rougher than the rest**, on every map, and still were after the Nov 2
  smoothing release. That is exactly when new players decide whether to stay.
- **Crashes are rare and the known one is fixed.** The bird "swoop" crash was fixed on Oct 31 and
  only shows on old cached copies. The most common error (44 players) is a harmless browser
  warning that clutters the list.
- **Loading looks slower since Oct 18, but that may be the measurement.** We don't record how long
  the game takes to load; see fix 5.
- Few players come back: 19 of 98 computer players and 5 of 49 phone players started a game on a
  second day.

## What to fix next, ranked

### 1. Phone players lost at the "turn sideways" screen (S)
- **Players:** 14 of 75 phone players (19%) saw it and never turned the phone; 13 never started.
  Another 10 did turn it once but later left within 30 s with it up again. 51 of 75 phone players
  saw the prompt at all.
- **Evidence:** `rotate_prompt_shown` without `rotate_prompt_cleared`; `game_left` with
  `rotate_prompt_up` and under 30 s active.
- **Likely cause:** the prompt is a hard wall (`#rotate-hint` in `index.html`, shown by CSS on
  portrait ≤700 px; tracked in `js/ui/session-analytics.js`). Many phones have rotation lock on,
  so turning the phone does nothing and the player assumes the game is broken.
- **Fix:** add one line ("Rotation lock on? Swipe down to turn it off") and a small "Play upright
  anyway" button that dismisses it. Portrait stays a fallback, as AGENTS.md says; this only stops
  it from being a dead end.

### 2. Rainforest maps run slowest (M)
- **Players:** everyone who picks Sumatra or the Amazon (29 and 27 starters in 30 days, the next
  most popular maps after PNW).
- **Evidence (computers):** Sumatra 18 fps, 3.6M triangles, drawing 26 ms, GPU 24 ms; Amazon 22 fps,
  GPU 39 ms. Sumatra past 15 minutes: 16 fps, 7M triangles, 88% slow frames. Sumatra's opening
  view is already 2.1M triangles (16 fps at 30 s), against 0.3M for PNW.
- **Likely cause:** dense canopy drawn at full detail. Far tree models switch by screen size
  (decision 0022, `js/render3d/far-models.js`, `js/render3d/flora.js`) but rainforest still sends
  2–7M triangles. Already listed as open in the perf review ("Sumatra's 4–6M triangles in its
  opening view").
- **Fix:** measure with `node tools/play-profile.mjs sumatra fast` at zoom levels players actually
  use, then switch rainforest trees to far models sooner and thin their shadows.

### 3. Weak built-in laptop graphics (L, in steps)
- **Players:** 55 Windows/Chromebook players on integrated graphics, the largest computer group.
- **Evidence:** median 25 fps, only 6 of 55 keep up with their cap. Frame split: simulation 4.3 ms,
  drawing 15.1 ms (p95 33 ms), GPU 18.5 ms. Intel HD 520: 12.8 fps, 92% slow frames; UHD 600:
  14 fps; Radeon R3 Chromebooks: 16 fps. Nearly all of them already run on Fast
  (34 were moved to Fast for their graphics chip, 11 for running slowly).
- **Likely cause:** both sides. On the processor, the daily plant redraw is still open (perf
  review finding 2(b), `js/render3d/flora.js`, `flora-changes.js`). On the GPU, `res_scale` stays
  at 1.0 for almost everyone: drawing fewer pixels is the only thing that cuts GPU time on these
  chips, and the game hardly ever does it.
- **Fix, step 1 (S–M):** when Fast still runs under ~20 fps, lower the drawing resolution (for
  example to 0.75). This needs your OK, because decision 0004's target is "native resolution";
  results reached this way must be labelled. Step 2 (M): finding 2(b).

### 4. Rough first 30 seconds (M)
- **Players:** every new game. 67 computer players left within 30 s of active play.
- **Evidence:** fps at 30 s vs 2 min: Amazon 21 vs 25, Sumatra 16 vs 24, Atlanta 23 vs 28,
  Chinandega 21 vs 25, PNW 27 vs 29. After the Nov 2 release (decision 0038): still 23.6 fps at
  30 s vs 27.7 at 2 min.
- **Likely cause:** what 0038 left: first models and shaders still built mid-play, the opening
  view's triangle count (Sumatra), plus early plant regions. `js/main.js` boot, `Actors.warm*`
  in `js/render3d/scene.js`.
- **Fix:** add a `perf_sample` at 10 s too, so the opening can be told apart from the loading
  screen, then warm the remaining shaders during the loading screen.

### 5. Loading time isn't measured (S)
- **Evidence:** the browser's "largest paint" (LCP) went from p50 0.6–0.9 s, p90 3–4 s before
  Oct 18 to p50 1.5–3.5 s, p90 10–13 s since, on every host (secondgrowth.earth, itch.io and
  GitHub Pages alike). The new loading screen landed Oct 17 (`e7cf210`); it may simply have
  changed which element counts as "largest", so this is not proof of a slowdown. Desktop players
  take a median 56 s from page load to their first tool (phones 37 s).
- **Fix:** send `load_ms` (page start to first drawn frame) with `game_start`. Then we'll know.

### 6. Error list hygiene (S)
- **Evidence:** 30 days, ~200 `js_error` events from 75 players. Most are "ResizeObserver loop
  completed" (44 players): a harmless browser warning, triggered by our observers in
  `js/ui/ui.js:262` and `js/render3d/watershed-view.js:59`. Real ones: the bird `passage.swoop`
  crash (`js/render3d/actors.js:390`), fixed Oct 31 in `429f012`, last seen Nov 2 on the Oct 25
  release only; `scene.js` "reading 'x'" (3 players, Oct, no recent release); "Maximum call stack
  size exceeded" (1 player, Nov 5, current release, location unknown); "Unable to decode audio
  data" (1 player, Nov 8).
- **Fix:** ignore the ResizeObserver message in `reportError` (`js/analytics.js`) so real errors
  stand out, and keep the full stack's first two lines for "Maximum call stack".

### 7. Smaller things
- Stepping back up from Fast rarely sticks: 10 players stepped up ("room"), 6 were stepped back
  down ("undo"). Fine as is, but it means the step-up is mostly churn.
- Phones' graphics-chip time is unknown: only 5 of 410 phone samples carry `gpu_frame_ms` (the
  timer extension isn't on iOS). iPhones run 25.6 fps against a 30 cap with 32% slow frames and
  only 10 ms of drawing, so they are most likely GPU-bound. Nothing to fix yet, just a blind spot.

## Phone vs computer at a glance

| | Phones/tablets | Computers |
| --- | ---: | ---: |
| Players with samples (30 d) | 53 | 93 |
| Median fps | 24 | 29 |
| Under 20 fps | 14 | 16 |
| Started a game, of visitors (secondgrowth.earth) | 35 of 52 | 79 of 87 |
| Still playing after 2 active min | 18 | 53 |
| Came back another day | 5 of 49 | 19 of 98 |

Fps by period (computers): 22 before Oct 24 (the trail redraw bug), 33 Oct 24 – Nov 2, 30 since
Nov 3. Phones: 25, 24, 27. The Nov 3 dip on computers is within the spread of which maps and
machines happened to play; no regression is visible.

## How to repeat this

PostHog MCP connector (HogQL through `execute-sql`), project 630638, excluding cohort 595715.
Main events: `perf_sample` (fps, `target_fps`, `cpu_*_ms`, `gpu_frame_ms`, `triangles`, `map`,
`active_minutes`), `js_error`, `game_left`, `rotate_prompt_shown`/`_cleared`, `first_tool`,
`play_heartbeat`, `auto_quality`, `$web_vitals`. Classify devices by `$os` (iOS/Android = phone)
and `gpu` (NVIDIA/Arc = discrete). See [posthog-player-perf.md](posthog-player-perf.md).
