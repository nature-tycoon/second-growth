# Frame rate plan (idea f): 35 FPS median, most players on Sharp

Session 7 measured, got a design from the `architect` (Fable) and landed the first wins. Session 8
builds the numbered list at the end.

**Goal (Cole, 2026-11-22, replacing the first wording):** "35 is an arbitrary number I picked... I
really just want as many players to have a sharp 30 FPS experience as possible." So the measure is
**the share of players holding about 30 FPS (a median of 27+) on Sharp**, and holding 30 wins over
Sharp when they conflict. The 30 FPS cap on phones and on battery is no longer in the way: 30 is
the goal.

| Measure (30 days to 2026-11-22, 157 players) | Now |
| --- | ---: |
| Players holding ~30 (median 27+) on any setting | 90 (57%) |
| Players last seen on Sharp | 50 (32%) |
| **Players holding ~30 on Sharp (the goal)** | **45 (29%)** |
| Holding ~30 on Fast (candidates to move up) | 36 (desktop 26, phones 10) |
| Under 20 on any setting | 37 (24%) |

## 1. Baseline: real players (PostHog, 2026-10-23 → 11-22, 30 days)

Each player's median `fps` over their `perf_sample`s (players with 2+ samples, release builds only,
no localhost). 157 players: 122 desktop, 35 phone/tablet.

| Group | Players | Slowest tenth | Median | Share at 35+ | Share under 20 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Everyone | 157 | 13.1 | **27.8** | 31% | 24% |
| Desktop | 122 | 12.6 | 29.0 | 39% | 23% |
| Phones and tablets | 35 | 14.0 | 26.1 | 0% | 26% |

**The frame cap is the biggest single fact.** The game holds itself to 30 FPS on touch screens and
on laptops running on battery (Auto frame rate, `js/main.js`). In these 30 days that was **all 35
phone/tablet players and 50 of 122 desktop players (mostly Chrome/Edge reporting "on battery")**:
83 of 157, just over half. A capped player can never show more than 30, so a 35 median across all
players (the first wording of the goal) was impossible while the cap stays; with the goal now 30,
the cap fits it. But a capped player's FPS hides how much room it has, so any step-up rule must
judge the measured frame work (processor and GPU ms), not the FPS.

Desktop by frame cap and speed band (median of the players in each band):

| Desktop band | Players | FPS | Drawing (CPU) | Submit | Simulation | GPU | Triangles | Slow frames |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Capped at 30 (battery) | 50 | 24.5 | 10.8 ms | 3.6 | 1.6 | 13.2 | 0.39M | 34% |
| Uncapped, 35+ | 48 | 49.6 | 4.3 | 1.6 | 0.5 | 6.8 | 0.52M | 3% |
| Uncapped, 20–35 | 13 | 28.2 | 7.2 | 2.4 | 0.8 | 9.7 | 0.36M | 19% |
| Uncapped, under 20 | 11 | 15.5 | 19.2 | 6.0 | 2.2 | 33.1 | 0.45M | 86% |

Uncapped desktop players: 48 of 72 (67%) already run at 35+, median about 40.

By graphics chip and the cap (desktop):

| Chip class | Cap | Players | Median FPS | CPU work | GPU | Work under 22 ms (room for 45) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Apple | 30 | 14 | 28.6 | 7.0 ms | 9.4 | 86% |
| Apple | 60 | 12 | 34.4 | 8.1 | 7.8 | 83% |
| Discrete (NVIDIA, Radeon RX) | 60 | 19 | 51.2 | 5.5 | 3.6 | 100% |
| Intel Iris / Xe / Arc | 30 / 60 | 3 / 4 | 27.4 / 50.4 | 11.3 / 8.6 | 5.8 / 8.4 | 100% |
| Weak integrated (Intel UHD/HD, Radeon Vega) | 30 | 26 | 23.0 | 21.6 | 14.8 | 50% |
| Weak integrated | 60 | 33 | 40.4 | 10.9 | 11.6 | 70% |
| Other / unknown / software | any | 9 | 3–15 | 29–85 | 30–78 | 0–33% |

(Apple at cap 60 runs slower than its measured work suggests; Safari gives no GPU timer and the
gap is not explained by these numbers. An open measurement question.)

Weak integrated chips by Detail (desktop): Fast plugged in median 36 (22 players, half at 35+),
Fast on battery 22 (20 players, CPU work 22 ms: Windows' battery saver slows the processor),
Balanced 43.8 (5), Sharp 41.7 (4). The Balanced/Sharp groups are small and self-selected (they got
there by holding 50+), but they say a blanket move of every weak chip to Fast is not always needed.

### How players end up on each setting (same 30 days)

| What happened | Players |
| --- | ---: |
| Moved to Fast at start for the chip's name (`graphics_chip`: Intel UHD/HD, integrated Radeon) | 55 |
| Moved Sharp → Fast for running slowly (under 20 for three spells) | 21 |
| Moved Balanced → Fast for running slowly | 2 |
| Stepped back up Fast → Balanced (`room`, 50+ for a minute) | 13 |
| ...and put straight back (`undo`) | 6 |
| Stepped Balanced → Sharp | 1 |
| Changed Detail themselves | ~8 (4 to Sharp, 3 to Balanced, 1 to Fast) |
| Changed the frame-rate setting | 5 |

Where players sat (last setting seen): desktop Fast 64, Sharp 49, Balanced 9; phones Fast 28.

Today's rules: step down only below **20** FPS (three 3-second spells), always straight to Fast;
step up only at **50+** for a minute, one level at a time, on two minutes' trial. So a desktop
player at 20–34 on Sharp is never helped, and the step-down skips Balanced.

What Sharp, Balanced and Fast change (`Renderer.applySettings`): Sharp draws up to 2 pixels a point,
Balanced and desktop Fast 1.5 (phones' Fast 1). Fast also uses lighter plant models, a 1024 shadow
map (2048 otherwise), no cloud shadows and the lighter ground. **On a 1x screen (most Windows
laptops, the weak-chip players' median pixel ratio is 1.0) Sharp and Balanced draw exactly the same.**

## 2. Baseline: where frame time goes (play-profile)

`node tools/play-profile.mjs serengeti,sumatra,amazon,pnw <quality> 3`, Apple M5, 1440×900 CSS at
DPR 2 (Sharp draws 2880×1800, Fast 2160×1350), 3-year organic games, nice'd, Mac on battery (Low
Power Mode off; the tool forces 60 FPS). JSON in the session scratchpad (`pp-base-high/fast.json`).

| Map / view | Sharp FPS | Sharp draw / GPU ms | Fast FPS | Fast draw / GPU ms |
| --- | ---: | ---: | ---: | ---: |
| Serengeti normal | 60 | 2.1 / 11.8 | 60 | 1.9 / 9.8 |
| Serengeti top speed | 55.8 | 6.7 / 9.1 | 59.8 | 3.3 / 9.5 |
| Sumatra normal | 60 | 2.0 / 11.6 | 60 | 1.6 / 11.3 |
| Sumatra wide | 60 | 3.3 / 11.9 | 60 | 3.6 / 11.2 |
| Sumatra top speed | 42.5 | 9.5 / 17.1 | 58.9 | 8.2 / 9.9 |
| Amazon normal | 60 | 2.9 / 11.3 | 60 | 3.0 / 11.8 |
| Amazon wide | 60 | 4.6 / 11.7 | 60 | 4.7 / 11.6 |
| Amazon top speed | 47.5 | 9.2 / 18.1 | 59.8 | 8.4 / 10.7 |
| PNW normal | 60 | 2.5 / 10.8 | 59.6 | 2.8 / 9.6 |
| PNW wide | 60 | 3.2 / 10.3 | 60 | 3.1 / 10.2 |

What it says:

- **Processor drawing is small now** (2–5 ms at normal speed, 7–10 at top speed, plants about half
  of that at top speed). The batch's new overlay, lens and shore drawing do not show as a cost here.
- **GPU is a flat 9–12 ms in every view, whatever is on screen,** and Fast saves only 0–2 ms of it
  despite drawing 44% fewer pixels. Time that doesn't follow triangles or pixels much is fixed
  per-frame GPU work (shadow map, full-screen passes, depth/lens passes, tiled-GPU overhead at
  Retina) — the thing to break down for weak chips, which are ~10× slower on the GPU.
- Top speed on wet maps is the only place the M5 falls under 60 on Sharp (42–48).
- **Counter quirk:** triangles read 0.0M and draw calls 1–10 in many views (all Serengeti and
  Amazon rows). The renderer's counters are probably reset by a later pass in the frame. If
  `perf_sample` reads the same counter, the triangle and draw-call numbers in PostHog are
  unreliable too (`perf-guard-check` counts its own way and is unaffected).

## 3. Design (architect)

Asked of Fable; Fable could not run (the account needs usage credits for it), so the same brief ran
on the `architect` agent with Opus. Read-only; it measured nothing new, so the cost cuts below are
hypotheses until item 3 of the build list has run.

**Policy (who gets which Detail level, and when it changes)**

- **Start:** keep moving weak chips (Intel UHD/HD, integrated Radeon) to Fast at start by name.
  21 more players were moved Sharp → Fast later for running slowly, so the name is a fair first
  guess; measuring each computer then corrects it, now in both directions.
- **Step up, judged by the work, not the FPS.** A player held to 30 can never show 50, so the old
  rule never moved them. New: either 50+ FPS as before, or held to 30, keeping up (27+), and the
  slower frames' processor work and GPU time both within **16 ms** (half the 33 ms a 30 FPS frame
  has) for a minute. Without a GPU timer (Safari) it can't judge, so it keeps the old rule.
  *(Landed today.)*
- **On screens of 1.5x or less, Fast steps straight up to Sharp**: Sharp and Balanced draw the same
  picture there. *(Landed today.)* On 2x screens it still goes Fast → Balanced → Sharp.
- **Step down earlier and gentler:** under **26** (not 20) for four 3-second spells. On 2x screens
  Sharp → Balanced first, then Fast; on 1x screens straight to Fast. And on computers, step Detail
  down before the resolution scaler blurs the picture (`autoResolution` waits while a Detail step
  is still possible). *(Session 8, after a couple of weeks of the step-up telemetry.)*
- **A level the player chose is never changed.** At most one notice a session suggesting Fast if
  they run under 20 for a long spell. *(Session 8.)*
- **Telemetry** so we can tell it worked: `auto_quality` now carries `work_ms`, `gpu_ms` and, on a
  step up, `capped` and `base_dpr` *(landed)*. Still to add: `perf_sample.work_p75_ms` and the
  sample's length in seconds, so `shadow_redraws` reads as a rate *(session 8)*. Success: more
  `room` moves not followed by `undo` (undo under half of step-ups), a rising share holding ~30
  on Sharp, and no rise in the share under 20.

**Frame-cost cuts for weak chips, best gain per effort first**

1. **Find where the flat 9–12 ms of GPU goes** (measurement only). Toggles in `play-profile`:
   shadows off, shadow map never redrawn, antialiasing off, cloud shadows off, light ground.
2. **Fewer shadow-map redraws.** `shadowsStale` redraws on every camera move, each 0.003 rad of
   sun (about 6 times a second with the day cycle on) and at least every 500 ms. Each is a depth
   pass of all plants plus choosing casters on the processor. Raise the sun step, a 1 s floor,
   snap the shadow camera to a grid so small pans reuse it. Guess: 1–3 ms on the M5, more on weak
   chips, also saves processor time on battery. Needs a visual check for jumping shadows.
3. **Antialiasing off on 2x screens.** It's fixed at start (`antialias: true`, 4 samples at
   2880×1800) where it's barely visible. Could lift the Apple laptops held to 30 (median 28.6)
   over the line. Keep it on 1x screens.
4. **Processor time on battery** (weak chips 21.6 ms): the review's open fixes (daily plant
   redraw, daily environment update) and cut 2. These help Fast reach 30, not Sharp.

## 4. Can it be reached?

- **The original 35 median: no,** not while phones and laptops on battery are held to 30 (just
  over half of players). That was the cap, not the game being slow. With the goal now "a sharp
  30", the cap is fine.
- **Holding ~30 on Sharp: about 40–45% of players is realistic, from 29% today.** Most of the
  gain is the 26 desktop players already holding 30 on Fast (perhaps half have the room for
  Sharp), plus some of the Apple laptops just under 30.
- **Phones (about a fifth of players) won't reach Sharp.** A 2–3x phone screen at Sharp is 4–9
  times the pixels of Fast's one pixel a point, on a phone's chip. If phones should count, the
  measure would have to be "looks sharp", not the Sharp setting.
- **The slowest tenth (median ~13 FPS) cannot reach 30, on any setting.** They are software
  renderers (no graphics chip in use: the processor draws everything) and very old or unknown
  chips. Their processor work alone is 29–85 ms against the 33 ms a frame has. Making that fit
  would mean doing less simulation, and decision 0004 rules that out. Weak chips on battery
  (Windows slows the processor: 22 ms of work, 15 ms GPU) can reach 30 on Fast with the
  processor cuts, not on Sharp.

## 5. Landed in session 7

1. **Triangle and draw-call counters fixed.** three.js resets its counters in every render call,
   and the lens and tree-card passes render after the main view, so `perf_sample` (and
   play-profile) read 0 triangles and 1–10 draws in many views. Now one count per frame, reset
   at the top of `Renderer.draw`. PostHog's `triangles`/`draw_calls` before this release are
   unreliable.
2. **Step up judged by the work for players held to 30** (`Renderer.autoQuality`, 16 ms rule).
3. **Fast → Sharp directly on 1x–1.5x screens.**
4. **`auto_quality` telemetry**: `work_ms`, `gpu_ms`, `capped`, `base_dpr`.
5. **`tools/auto-quality-check.mjs`** (headless, 9 checks): capped + light work steps up, 1x to
   Sharp and 2x to Balanced, no GPU timer or heavy work stays put, the 50 rule unchanged, undo and
   the day's wait, slow drops to Fast, a chosen level never changes.

None of these can show in `play-profile`, which fixes the Detail level (`qualityChosen`): the
policy changes which level a real player ends up on, not what a level costs. Their effect shows in
PostHog over the next two weeks (queries in section 1; compare the share holding ~30 on Sharp).
The before/after play-profile confirms nothing got slower and the counters read:

| Sharp, M5, before → after | FPS | Draw ms | GPU ms | Triangles | Draw calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| Serengeti normal | 60 → 59.9 | 2.1 → 2.1 | 11.8 → 11.1 | 42k → 724k | 1 → 99 |
| Sumatra normal | 60 → 60 | 2.0 → 1.7 | 11.6 → 11.9 | 2.56M → 2.53M | 157 → 157 |
| Sumatra top speed | 42.5 → 45.9 | 9.5 → 9.6 | 17.1 → 17.3 | 6.94M → 6.95M | 213 → 215 |
| Amazon normal | 60 → 60 | 2.9 → 2.8 | 11.3 → 11.5 | 6k → 2.02M | 4 → 131 |
| Amazon top speed | 47.5 → 50.8 | 9.2 → 9.6 | 18.1 → 15.5 | 4k → 5.61M | 2 → 172 |
| PNW normal | 60 → 60 | 2.5 → 2.8 | 10.8 → 11.2 | 2.40M → 2.40M | 110 → 108 |
| PNW close | 60 → 60 | 2.9 → 2.3 | 11.3 → 11.0 | 4k → 1.24M | 1 → 76 |

(All 16 views: frame times within single-run noise on a Mac on battery; counts now read in every
view. Headless checks named by `impact.mjs`, `perf-guard-check` and `auto-quality-check` pass.)

## 6. Build list for session 8

In order; each leaves the game working.

1. **`perf_sample` telemetry:** `work_p75_ms` and the sample's length (`sample_s`), so
   `shadow_redraws` reads per second. Small.
2. **GPU breakdown in `play-profile`** (`PLAY_SETUP` toggles or a `PLAY_GPU_SPLIT=1` mode): GPU ms
   with shadows off, shadow map frozen, cloud shadows off, light ground, and a reload with
   antialiasing off. Run Sharp and Fast on the four maps. This decides 3 and 4.
3. **Shadow-map redraws cut** (`shadowsStale`, scene.js): bigger sun step, 1 s floor, snap the
   shadow camera to a grid. Visual check (`visual-qa`) for shadows jumping at dawn/dusk and while
   panning; measure with play-profile and the `shadow_redraws` rate.
4. **Antialiasing off where `devicePixelRatio >= 2`** (chosen at start, `new WebGLRenderer`).
   Visual check of edges on a 2x screen; play-profile GPU before/after.
5. **Step down earlier (under 26, four spells) and through Balanced on 2x screens; Detail before
   resolution on computers** (`autoQuality`, `autoResolution`). Extend `auto-quality-check`.
   Best after a week or two of the new `auto_quality` telemetry shows how step-ups fare.
6. **One notice for a player who chose Sharp and runs under 20 for a long spell**, suggesting Fast.
7. **Processor time on battery:** pick up the review's open fixes only if item 2 shows weak chips
   on battery are processor-bound on Fast after 3.

Re-measure in PostHog two weeks after each release: the section 1 queries, plus `auto_quality`
`room` vs `undo` by `capped`.

## 7. Session 8: built, measured, and what the numbers decided

Apple M5, 1440×900 CSS at DPR 2 (Sharp draws 2880×1800, Fast 2160×1350), 3-year organic games, play
and wide views, nice'd, Mac plugged in. JSON: `tools/release-output/s8-*.json` (local, not committed).

**1. `perf_sample` telemetry: built.** `work_p75_ms` (the slower frames' processor work, the 16 ms
test `autoQuality` makes for a frame rate held to 30) and `sample_s` (seconds of drawing it covers,
so `shadow_redraws / sample_s` is redraws a second). Covered by `performance-diagnostics-check` and
`perf-analytics-browser-check`. Nothing to measure in frame time.

**2. GPU breakdown in `play-profile`: built** (`PLAY_GPU_SPLIT=1`; `=base` for the view as is only;
`PLAY_NO_AA=1` makes the page's WebGL contexts without antialiasing). The first finding changes how
to read every earlier GPU number from this Mac:

- **The GPU timer query doesn't measure the chip's work on Apple + Chrome.** With nothing in the
  scene drawn it still read 3–9 ms. The "flat 9–12 ms whatever is on screen" in section 2 was the
  timer, not fixed GPU work. (`gpu_frame_ms` in PostHog from Apple chips under Chrome is the same.)
- So the split also times **synced** draws: each draw waits for the chip to finish (a one-pixel
  read-back), the variants take turns in short bursts 14 times over, each keeps its median.

Synced ms, median change from the view as is across the 8 map/views (as is: Sharp 7.3–13.0 ms, Fast 5.0–15.6):

| Variant | Sharp | Fast |
| --- | ---: | ---: |
| No shadows at all | −0.6 | −0.3 |
| Shadow map never redrawn | −0.3 | −1.2 |
| Shadow map redrawn every frame | −0.1 | −1.7 |
| No cloud shadows | −0.3 | −1.8 |
| Other ground (light on Sharp, full on Fast) | −0.5 | −1.6 |
| 70% resolution (half the pixels) | −2.9 | −3.4 |
| Nothing drawn (the floor: sync, clear, passes) | −7.1 | −7.6 |

What it says: on the M5 the frame's chip work is about 5–8 ms, and **pixels are the only lever that
reliably moves it** (half the pixels, about −3 ms). Shadows, their redraws, cloud shadows and the
ground are each within the noise (the Fast column's −1.2 to −1.8 for every variant, including
"redrawn every frame", is the as-is burst running slow in a few rows, not a saving).

Shadow-map redraws by time of day (`tools/shadow-redraw-probe.mjs`, PNW, normal speed, camera
still): dawn ~1/s, day 7/s, dusk 10/s, **night 20/s (up to every frame)**, because the night clock
runs faster (`NIGHT_PACE`) and the moon-lit sun moves past the 0.003 rad step more often.

**3. Shadow-map redraws cut: not built.** One redraw costs nothing measurable on the M5 (every frame
vs never: within 0.5 ms, either sign). At 7–20 redraws a second there's no GPU time to win here, and
a coarser sun step risks visible jumps at dusk. On a weak Intel chip a redraw costs more, but we
can't measure that here; `perf_sample` now gives the redraw rate per player (`shadow_redraws /
sample_s`) to look at first. If it's ever built, the cheap version is night only.

**4. Antialiasing off at DPR ≥ 2: built, measured, reverted.** Runs with and without antialiasing
(Sharp: before on, after off; Fast run twice with it on as a control, once off):

| Synced ms, median of 8 map/views, change from the first run | Change |
| --- | ---: |
| Sharp, antialiasing off | 0.0 |
| Fast, antialiasing on again (control: nothing changed) | +0.9 |
| Fast, antialiasing off | −0.1 |

Run-to-run noise (±2–3 ms a view) is bigger than any antialiasing effect, and the median shows none.
The one-map try that first looked like −2.5 ms didn't hold up. That fits Apple's tile-based chips,
which resolve antialiasing on the chip almost for free. A weak Intel chip, drawing straight to memory,
might gain; that needs a test there (`PLAY_NO_AA=1` is ready). The edges check (visual-qa) wasn't
needed once the change was reverted.

**6. One notice for a player who chose Sharp (or Balanced) and runs slowly: built.** Under 20 FPS
(75th-percentile frame gap in 3-second spells) for a minute in a row, once ever
(`settings.fastHintAt`): "The game is running at about N frames a second on Sharp here. Detail: Fast
in Settings would make it much smoother." Detail is never changed. Shown as a warning so the
"important only" notifications setting can't swallow it. Phones included (the automatic steps still
skip them). Event `quality_hint` (quality, fps, work_ms, gpu_ms). A Detail change starts the minute over. `auto-quality-check` has 4 new
checks (13 in all). No frame cost.

**Still open:**
- **Item 5** (step down earlier, under 26, through Balanced on 2x screens; Detail before resolution):
  waits for a week or two of `auto_quality` telemetry from session 7's step-up rules.
- **Item 7** (processor time on battery): item 2 can't say anything about weak chips on battery (the M5's
  processor drawing is 2–5 ms). Decide from `perf_sample.work_p75_ms` on weak chips with
  `on_battery` once it has a week of data.
- What does cost GPU is pixels. For weak chips the existing lever (the automatic resolution) already
  pulls it. A lower Sharp cap on a 2x screen (1.75 instead of 2: about −23% pixels) is a possible
  next cut. It's a sharpness trade, so it's for Cole.

## 8. Follow-ups (batch 2026-11-23-creeks-fps-2, session 4)

**Apple's GPU timer and the step-up test.** PostHog, `perf_sample` from Apple chips, 30 days to
2026-11-23, release builds:

| Apple chip, browser, Detail, cap | Players | Samples | FPS | GPU timer mean / p95 | Samples over 16 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chrome, Sharp, held to 30 | 10 | 135 | 29.7 | 11.7 / 15.7 | 20 (15%) |
| Chrome, Sharp, 60 | 7 | 45 | 52.9 | 11.6 / 18.0 | 6 |
| Chrome, Fast, held to 30 | 1 | 6 | 28.4 | 8.2 / 14.2 | 0 |
| Safari (any) | 25 | 454 | 16–43 | none | – |

The synced timing on the M5 (section 7) puts the chip's own work at 5–8 ms on Sharp, so under
Chrome the timer reads roughly 4–8 ms high. The 16 ms test takes the 75th percentile of about 6
timer readings in each 3-second spell and needs 20 spells in a row: with one sample in seven
over 16 on the mean, a minute in a row of passing spells is the exception, not the rule. So yes,
it can block a step-up wrongly. How often it did is small and unprovable: in 45 days only 2
Apple + Chrome players were moved down to Fast (`slow`), and one of them was later back on Sharp
by the old 50 FPS rule; most Apple + Chrome players already sit on Sharp. (No `auto_quality` from
Apple chips carries `gpu_ms` yet: session 7's telemetry isn't released.)

**Changed:** on Apple chips `Renderer.autoQuality` ignores the GPU timer and the step-up for a frame
rate held to 30 is judged by the processor's work alone (16 ms). That includes Safari on a Mac, which
gives no timer and so could never step up while held to 30. The two-minute trial still undoes a
step that proves too much. A step up decided this way sends `gpu_ignored: true` on `auto_quality`.
`auto-quality-check` has 4 more checks (17): Apple with the timer over 16 steps up, Apple without a
timer steps up, Apple with heavy processor work stays put, other chips still need the timer.

**play-profile on Macs** now times synced draws for every view (12 bursts of 8, median) and prints
`synced N ms (GPU timer M, unreliable here)` in place of the GPU timer; JSON rows carry `syncedMs`.
`PLAY_SYNC=1` does it on any chip, `PLAY_SYNC=0` never. Synced is processor drawing plus the chip's
whole frame, so it is the frame's real cost, not the chip's alone. First run (M5, Sharp, PNW, 1
year): play 9.8 ms synced vs timer 10.7; wide 8.7 vs 10.0.

**Two notices, once ever each** (`js/ui/perf-notices.js`, `tools/perf-notices-check.mjs`, 9 checks):

- *Software drawing* (SwiftShader, llvmpipe, Microsoft Basic Render Driver): 4 s after the farm
  shows, the steps to turn on graphics acceleration in Chrome, Edge or Firefox (others get a general
  line), plus "updating your graphics driver can help". Event `software_render_notice` (`gpu`,
  `browser`). In 60 days PostHog saw 2 such players (one Windows Basic Render Driver at 5.5 FPS, one
  Linux SwiftShader at 1, probably a bot).
- *On battery and slow*: on Fast, on battery (where the browser says), clock running, under 20 FPS
  (75th-percentile frame gap) for two minutes of 3-second spells in a row: "The game is running at
  about N frames a second on battery. Plugging in will make it smoother: computers slow themselves
  down on battery." Event `battery_hint` (`fps`, `gpu`). Only on Fast, because Sharp and Balanced
  already have the one notice suggesting Fast, and the automatic step to Fast comes long before two
  minutes. Any chip, not only those named weak: the measured slowness is what counts.
