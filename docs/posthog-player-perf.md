# Looking up a player's performance in PostHog

Analytics go to PostHog project 630638 ("Default project", UTC).

Player ids that Cole pastes from feedback are **distinct_id** values, not person ids or session ids.

## Lag reports

Query that distinct_id's `perf_sample` events over its play window. Each one carries `fps`, `slow_frames_pct`, `quality`, `res_scale`, `pixel_ratio`, `shadows`, `triangles`, `draw_calls`, `zoom`, `gpu` (for example "Intel HD Graphics 620"), `batched_plant_instances`, `renderer_revision`, `target_fps` and `on_battery`.

Read `fps` against `target_fps`, the frame cap the game allowed itself (30 on touch screens, on battery, or by setting; 60 otherwise): 29 fps under a 30 cap is keeping up. `on_battery` is null where the browser won't say (Safari, Firefox). Both arrived with the first stamped release after 2026-10-24.

From then on `renderer_revision`, and the `release` property on every event, is the release: the commit date and short hash (`2026-10-25-abc1234`), written into `js/release.js` by `tools/stamp-release.sh` in the deploy workflows. Local copies read `dev`. Earlier samples carry hand-set labels (`low-end-1`, then `plant-view-cache-1` from 2026-10-14 until this change).

Also look at `auto_quality` (its `reason`: `graphics_chip` or `slow` for a step down to Fast, `room` for a step back up, `undo` when a step up proved too much), `setting_changed` and `tool_used` (tool, tiles). Device details come from `$os`, `$browser` and `$screen_width`.

## History

- 2026-10-11: a Windows laptop with HD 620 graphics fell from 30 to 2 fps as the farm grew and the player zoomed out to 0.16 (13M triangles). The game had moved it to Fast and the player switched back to High. That led to the far-model, partial ground repaint and desktop auto-resolution fixes (`renderer_revision: low-end-1`, PR #24). They went live on GitHub Pages on 2026-10-11 and on itch.io on 2026-10-12.
- Traffic, same day: about 75% of itch.io visitors start a game, but only about 17% of phone visitors on the GitHub Pages link do, and most of those leave within seconds.
- 2026-10-17: over the previous 60 days, 15 desktop players were moved to Fast automatically (14 for running slowly, at a median 16 fps on Sharp; 1 for the graphics chip). On Fast, those with samples ran at a median of 7 to 38 fps and none held 50. That is why the step back up (`Renderer.autoQuality`) needs 50 fps: it is for a computer that recovered (plugged in, low power mode off), not a slow one.
- 2026-10-24: 53 players, Oct 9–24. The typical player (each player's median `fps`) ran about 22 fps; a third were under 20. Read fps against the frame cap: touch devices and laptops on battery are held to 30 (`js/main.js`), and `perf_sample` doesn't record the cap. Game trails (live 2026-10-17 19:08 UTC) made plants redraw a region nearly every frame until the fix went live 2026-10-24 18:15 UTC: desktop median 31 → 22 fps, slow frames 22% → 46%, phone drawing 6.3 → 11.4 ms. Every iPad sample (11 players, median 19 fps, 23 ms of drawing) falls in that window. Players under 20 fps were limited by processor drawing (25–70 ms) far more than by the simulation (2–3 ms, except weak laptops at 6–24 ms). Weak Intel/AMD laptops were also limited by the GPU (40–58 ms at Fast). `renderer_revision` has read `plant-view-cache-1` since 2026-10-14, so later releases can't be told apart by it; split by deploy time instead.
