# Looking up a player's performance in PostHog

Analytics go to PostHog project 630638 ("Default project", UTC).

Player ids that Cole pastes from feedback are **distinct_id** values, not person ids or session ids.

## Lag reports

Query that distinct_id's `perf_sample` events over its play window. Each one carries `fps`, `slow_frames_pct`, `quality`, `res_scale`, `pixel_ratio`, `shadows`, `triangles`, `draw_calls`, `zoom`, `gpu` (for example "Intel HD Graphics 620"), `batched_plant_instances`, `renderer_revision`, `target_fps` and `on_battery`.

Read `fps` against `target_fps`, the frame cap the game allowed itself (30 on touch screens, on battery, or by setting; 60 otherwise): 29 fps under a 30 cap is keeping up. `on_battery` is null where the browser won't say (Safari, Firefox). Both arrived with the first stamped release after 2026-10-24.

From then on `renderer_revision`, and the `release` property on every event, is the release: the commit date and short hash (`2026-10-25-abc1234`), written into `js/release.js` by `tools/stamp-release.sh` in the deploy workflows. Local copies read `dev`. Earlier samples carry hand-set labels (`low-end-1`, then `plant-view-cache-1` from 2026-10-14 until this change).

From 2026-11-22 (creeks-fps, session 8) `perf_sample` also carries `work_p75_ms` (the slower frames' processor work, the 16 ms test `autoQuality` makes for a frame rate held to 30), and `sample_s` (seconds of drawing the sample covers: `shadow_redraws / sample_s` is redraws a second). `gpu_frame_ms` comes from the browser's GPU timer: on Apple chips under Chrome it read 3–9 ms with nothing drawn, so it is not the chip's work there (Safari gives none). From 2026-11-23 the game ignores it on Apple chips when deciding a step up (`auto_quality` then carries `gpu_ignored: true`). `software_render_notice` (`gpu`, `browser`) is the one notice ever telling a player whose browser draws without the graphics chip how to turn hardware acceleration on; `battery_hint` (`fps`, `gpu`) the one notice ever that plugging in would help, after two minutes under 20 FPS on Fast on battery. `quality_hint` (with `quality`, `fps`, `work_ms`, `gpu_ms`) is the one notice ever suggesting Fast to a player whose chosen Sharp or Balanced ran under 20 for a minute.

`triangles` and `draw_calls` before the 2026-11-22 frame-rate change (idea batch creeks-fps, session 7) are unreliable: three.js reset its counters in each render call, so the lens and tree-card passes after the main view left many samples at 0 triangles and 1–10 draws. From then on they count the whole frame.

Also look at `auto_quality` (its `reason`: `graphics_chip` or `slow` for a step down to Fast, `room` for a step back up, `undo` when a step up proved too much; from 2026-11-22 also `work_ms` and `gpu_ms`, the slower frames' processor and GPU time that decided it, and on a step up `capped`, true when the frame rate was held to 30 and the step was judged by that work, plus `base_dpr`; see `Renderer.autoQuality` and [fps-plan](ideas/2026-11-22-creeks-fps/fps-plan.md)), `setting_changed` and `tool_used` (tool, tiles). Device details come from `$os`, `$browser` and `$screen_width`.

## Why players stop

`game_left` (and `went_idle`) carry the session's story: tools used, refusals for money and
unsuitable ground, rewards (goals, objectives, new species) and the seconds since the last tool,
refusal, reward, fire and flood, time paused and at speed 3+, last month's net money, zoom, and
the campaign's next objective (or Free Play's open goal count). Alongside: `objective_done` (each
campaign objective), `quest_help`, `panel_closed` (seconds a panel was open), `warning_shown` (each
warning wording once a session, numbers as #), `species_lost`, and `game_loaded` (`load_ms` and
each loading step's start), `loading_left` and `load_failed`. `webgl_context_lost` (from 2026-11-14: `stage` is the loading step or `playing`, with `seconds`, `quality`, `gpu`) counts the view being dropped, which the iOS simulator did once while loading. `species_discovered.species` is the
species key from 2026-11-09; before that it held the species count. `perf_sample` also fires at
10 s from then.
The intro film (from 2026-11-23, `ui/intro.js`): `intro_started`, `intro_skipped` (`second`; from 2026-11-24 `how` and `taps`, stray taps that only pulse Skip, since a tap on the film no longer skips), `intro_finished`; from 2026-11-24 `intro_failed` (`reason`: `not_ready` is a film too slow to start by the time the game was ready, `stalled` one that froze 6 s, `error`, `no_source`, `play_blocked`, `play_error`) and `intro_not_offered` (`reason`: a first visit with no save that never got it: `map`, `seen`, `save_data`, `no_storage`, `off`). Before 2026-11-24 a film that didn't play left no event. Most players now arrive at secondgrowth.earth/play. Check:
`node tools/play-analytics-browser-check.mjs`. First findings: [posthog-review-2026-11.md](posthog-review-2026-11.md).

## History

- 2026-10-11: a Windows laptop with HD 620 graphics fell from 30 to 2 fps as the farm grew and the player zoomed out to 0.16 (13M triangles). The game had moved it to Fast and the player switched back to High. That led to the far-model, partial ground repaint and desktop auto-resolution fixes (`renderer_revision: low-end-1`, PR #24). They went live on GitHub Pages on 2026-10-11 and on itch.io on 2026-10-12.
- Traffic, same day: about 75% of itch.io visitors start a game, but only about 17% of phone visitors on the GitHub Pages link do, and most of those leave within seconds.
- 2026-10-17: over the previous 60 days, 15 desktop players were moved to Fast automatically (14 for running slowly, at a median 16 fps on Sharp; 1 for the graphics chip). On Fast, those with samples ran at a median of 7 to 38 fps and none held 50. That is why the step back up (`Renderer.autoQuality`) needs 50 fps: it is for a computer that recovered (plugged in, low power mode off), not a slow one.
- 2026-10-24: 53 players, Oct 9–24. The typical player (each player's median `fps`) ran about 22 fps; a third were under 20. Read fps against the frame cap: touch devices and laptops on battery are held to 30 (`js/main.js`), and `perf_sample` doesn't record the cap. Game trails (live 2026-10-17 19:08 UTC) made plants redraw a region nearly every frame until the fix went live 2026-10-24 18:15 UTC: desktop median 31 → 22 fps, slow frames 22% → 46%, phone drawing 6.3 → 11.4 ms. Every iPad sample (11 players, median 19 fps, 23 ms of drawing) falls in that window. Players under 20 fps were limited by processor drawing (25–70 ms) far more than by the simulation (2–3 ms, except weak laptops at 6–24 ms). Weak Intel/AMD laptops were also limited by the GPU (40–58 ms at Fast). `renderer_revision` has read `plant-view-cache-1` since 2026-10-14, so later releases can't be told apart by it; split by deploy time instead.
