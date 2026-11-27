# Performance review, 2026-11-26: did the frame-rate work help, and what next

Asked by Cole: did last week's frame-rate work raise FPS, where can play get smoother, and is
three.js the right engine. Read-only review: PostHog `perf_sample` from real players (release builds,
no localhost, players with 2+ samples, each player's median), plus the code. No fresh `play-profile`:
the Mac was on battery with a load average of ~16 from other sessions, so its numbers would not
have meant anything.

## 1. Did the improvements help?

**Too early to tell, and they were never meant to make a frame cheaper.**

- The frame-rate batch (fps-plan sessions 7–8 and creeks-fps-2 session 4) reached players only on
  **2026-11-25 22:20 UTC** (PR #125), about a day before this review. It changes *which Detail level*
  a player ends up on (step-ups judged by frame work, Fast straight to Sharp on 1x screens, Apple's
  GPU timer ignored) and adds three one-time notices. It does not change what a frame costs, so it
  can only show up as more players on Sharp holding 30.
- The old-forest fix (plant culling no longer grows with the map, shadow map not redrawn for
  colour-only edits) went live 2026-11-20 02:47 UTC. It helps farms with centuries of forest, which
  few players reach.

| Window (desktop players) | Players | Median FPS | Holding ~30 (27+) | Under 20 | Holding ~30 on Sharp |
| --- | ---: | ---: | ---: | ---: | ---: |
| Nov 1–19 | 88 | 28.9 | 61% | 26% | 35% |
| Nov 20–25 (old-forest fix) | 34 | 29.7 | 56% | 21% | 29% |
| Since Nov 25 22:20 (frame-rate batch) | 8 | 39.2 | 88% | 0% | 50% |

The first two rows are the same within noise (different players each week; the mix of computers
moves the median more than the code does). The last row looks good but is 8 players over one day.
**Re-check around 2026-12-09** (two weeks of the new release), with the queries in
[fps-plan section 1](ideas/2026-11-22-creeks-fps/fps-plan.md) and `auto_quality` `room` vs `undo`.
So far since the release: 2 players moved to Fast for their chip, 1 for running slowly, no step-ups
yet.

## 2. Where a frame goes for real players now

30 days to 2026-11-26, median of each player's median:

| Computer | Players | FPS | Slow frames | Simulation | Drawing (processor) | of which three.js submit | Drawing p95 | GPU | Draw calls | Triangles | Held to 30 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Weak integrated (Intel UHD/HD, Radeon Vega) | 68 | 27.4 | 25% | 1.3 ms | 10.4 | 4.4 | 20.7 | 12.9 | 74 | 0.34M | 43% |
| Apple | 37 | 29.1 | 18% | 0.6 | 4.8 | 2.0 | 10.0 | (timer unreliable) | 78 | 0.38M | 46% |
| Phones and tablets | 36 | 25.2 | 30% | 1.2 | 8.3 | 3.5 | 18.6 | – | 53 | 0.16M | 97% |
| Discrete (NVIDIA, Radeon RX) | 21 | 51.2 | 2% | 0.4 | 4.0 | 1.4 | 9.2 | 3.5 | 89 | 0.55M | 5% |
| Intel Iris / Xe | 10 | 39.0 | 10% | 0.8 | 5.2 | 2.3 | 12.4 | 6.4 | 90 | 0.51M | 40% |
| Other / unknown | 7 | 12.5 | 62% | 2.2 | 30.4 | 8.1 | 69.2 | 33.9 | 72 | 0.19M | 86% |
| Software drawing | 2 | 3.2 | 100% | – | – | – | – | – | – | – | – |

What it says:

1. **The simulation is not the problem anywhere** (0.4–1.3 ms median, 4–5 ms p95). Moving it to a
   worker ([0045](decisions/0045-simulation-worker.md)) still buys almost nothing; its trigger is not met.
2. **The biggest group, weak laptops, is limited by the main thread's drawing work and the GPU about
   equally** (10.4 and 12.9 ms). Of the 10.4 ms, only 4.4 is three.js sending the frame to the chip;
   about **6 ms is the game's own per-frame drawing work** (animal poses, plant regions, overlay,
   lens, tree cards, terrain and water patches, shadow caster choice). Today `perf_sample` can't say
   which: it records "render" and "submit" only.
3. **Lag is mostly stutter, not a low average.** Drawing's p95 is twice its median on every class
   (weak laptops 10 → 21 ms, phones 8 → 19). A quarter of weak-laptop frames and 30% of phone frames
   count as slow.
4. **The engine's share is small.** 53–90 draw calls and 0.2–0.5M triangles a frame is a light load
   for WebGL; earlier work (instancing, impostors, far models) already got it there.

### Two measurement problems found

- **The slow-frame counter overstates lag for anyone held to 30.** A frame counts as slow when it
  takes over 34 ms (`Renderer.draw`), but a 30 FPS frame is 33.3 ms, so ordinary timing jitter of a
  millisecond counts. On strong chips with light work (under 6 ms), players held to 30 show **15%**
  slow frames against **1.5%** for the same players' class at 60. Half our players are held to 30, so
  `slow_frames_pct` reads worse than the game feels. A slow frame should be one that misses a
  screen refresh: over about 1.5× the target interval (50 ms at 30, 25 ms at 60).
- **The frame cap can land on the wrong rate on 75, 100 and 144 Hz screens.** `createFrameLoop`
  skips a browser frame when less than `1000/target − 3` ms has passed. On a 75 Hz monitor (frames
  every 13.3 ms) the 60 cap's threshold is 13.7 ms, so every other frame is skipped: **37.5 FPS
  instead of 60–75**. The 30 cap gives 25 FPS on 75 and 100 Hz screens. 75 Hz is common on cheap
  monitors and laptops. PostHog doesn't record the screen's refresh rate, so how many players this hits
  is unknown; the FPS histogram neither confirms nor rules it out.

## 3. Is three.js the right engine?

**Yes. Switching would cost months and fix nothing we've measured.**

- three.js (r186, current) is the engine's part of the frame: 1.4–4.4 ms of submit for under 100 draw
  calls. Babylon.js or PlayCanvas would land in the same place; the GPU's pixel work is the same chip
  doing the same shading whatever library asks for it.
- Unity or Godot web builds would be heavier, not lighter: large downloads, slower first load (which
  already loses players), and their own main-thread cost on weak laptops and phones. A native app
  wrapper (Electron, Tauri) uses the same browser engine underneath.
- The drawing code is ~36,600 lines with 21 shader patches (`onBeforeCompile`) and 5 custom shaders.
  A port is a rewrite of the game's whole look and its checks.
- **WebGPU is the one engine change worth watching**, and it stays inside three.js
  (`WebGPURenderer`). It would cut submit cost and allow moving animal posing and plant culling onto
  the chip (compute shaders). But every shader patch must be rewritten in three's node language, and
  the players who need it most (old Intel chips, older drivers, phones) are the most likely to be
  refused WebGPU and fall back to WebGL anyway. Revisit mid-2027, starting as an opt-in for strong chips.

## 4. What would make play smoother, best value first

Each needs the usual before/after (`play-profile`, `perf-guard-check`) and, where it crosses
subsystems, a design reviewed first (AGENTS.md).

1. **See inside the 6 ms (small, measurement only).** Time each part of `Renderer.draw` (animals,
   plants, overlay and lens, tree cards, terrain and water patches, shadows, submit) and send median
   and p95 per part in `perf_sample`, plus the screen's refresh rate (median browser frame gap at
   start). Weak laptops are the largest group and we can't see what fills their frame or causes their
   spikes. Every item below is a guess until this lands.
2. **Fix the slow-frame counter** (small): count a frame slow when it misses a refresh at the
   current cap. Check `autoQuality`'s spell test the same way (it reads the 75th-percentile frame gap,
   so it is less affected, but confirm). Note in `posthog-player-perf.md` that `slow_frames_pct`
   before the change overstates capped players.
3. **Frame pacing on any refresh rate** (small): measure the screen's refresh at start and draw on
   every k-th browser frame, k = the nearest whole number to (refresh ÷ target). 75 Hz → 75 at the 60
   cap, 37.5 at the 30 cap; 144 Hz → 72 and 28.8. `createFrameLoop` already takes a fake clock and
   frame request, so a headless check is easy.
4. **One budget for background drawing work** (medium, cross-subsystem: design first). Plant regions
   (4 ms rule), the day's parts (one a frame), water and terrain patches, tree-card bakes and
   warm-ups each follow their own rule today, so on the frames where several land together they add
   up. That is the likely source of the p95 spikes (confirm with item 1). One queue that runs jobs only
   while time is left in this frame (the cap's interval minus the frame's work so far, with a margin),
   nearest-to-camera first, would turn spikes into slightly later updates. Drawing only, so the
   ecology is untouched ([0004](decisions/0004-ecosystem-performance.md), [0038](decisions/0038-smooth-first-minutes.md)).
5. **Fewer pixels, sharpened** (medium, a look decision for Cole). Pixels are the only thing measured
   to move the GPU (half the pixels: −3 ms on the M5, fps-plan section 7). Drawing the 3D world at
   ~80% and sharpening it in one cheap full-screen pass (AMD's FidelityFX CAS/FSR 1 style) cuts about a
   third of the pixels while the interface (HTML) stays crisp. A stronger option than session 8's
   "Sharp at 1.75 pixels a point on Retina", and it helps weak laptops at 1x too.
6. **Top speed on wet maps** (small, drawing only). Top speed falls to 42–50 FPS on Sumatra and Amazon
   even on the M5, from redrawing a day's plant growth 8 times a second. Redrawing growth every second
   game day at speeds above 3 changes no ecology and is invisible at that speed. Measure first
   (`play-profile` top speed); growth in size steps was dropped in October for being too small a win
   at normal speed, which doesn't apply here.

**Built 2026-11-26 (items 1–3)**, live with the next release: `perf_sample` carries `draw_<part>_ms`
and its p95 for each part of the drawing work, and `refresh_hz`; `slow_frames_pct` uses the new
line; the frame loop paces by the screen's refresh. Details and how to read them in
[posthog-player-perf.md](posthog-player-perf.md). Checks: `frame-loop-check` (pacing at 60–165 Hz,
long frames, the old rule before the refresh is known), `performance-diagnostics-check` (the slow
line, parts reported only for draws that ran to the end), `perf-analytics-browser-check` (the real
game's parts add up to the render stage). Pacing keeps within 1.3× the cap, so 90 and 100 Hz
screens at a cap of 60 stay at 45 and 50 as before (a steady 60 there would need uneven frame
spacing). `regression-reviewer` checked the diff: its two findings (an overloaded machine measuring
its own frame rate as the refresh, and 90–100 Hz drawing up to 1.67× the cap) are fixed. After a
week of the new release, read the weak-laptop parts' medians and p95s to pick between items 4 and 5.

Not recommended now: a different engine; WebGPU (above); the simulation worker (0045, trigger not
met); drawing in a worker (OffscreenCanvas: no saving in total work, a large rewrite, and the frame
cost is the same); fewer animals or plants (0004 rules it out).

**What's realistic:** fps-plan's estimate stands: about 40–45% of players holding 30 on Sharp, from
29%, mostly from the policy changes now live. Items 1–4 target the stutter weak laptops and phones
feel even when their average is near 30; item 5 is the one that can move weak laptops up a Detail
level. Phones stay on Fast; the slowest tenth (software drawing, very old chips) can't reach 30.
