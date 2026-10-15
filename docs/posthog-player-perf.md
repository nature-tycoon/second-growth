# Looking up a player's performance in PostHog

Analytics go to PostHog project 630638 ("Default project", UTC).

Player ids that Cole pastes from feedback are **distinct_id** values, not person ids or session ids.

## Lag reports

Query that distinct_id's `perf_sample` events over its play window. Each one carries `fps`, `slow_frames_pct`, `quality`, `res_scale`, `pixel_ratio`, `shadows`, `triangles`, `draw_calls`, `zoom`, `gpu` (for example "Intel HD Graphics 620"), `batched_plant_instances` and `renderer_revision`.

Also look at `auto_quality`, `setting_changed` and `tool_used` (tool, tiles). Device details come from `$os`, `$browser` and `$screen_width`.

## History

- 2026-10-11: a Windows laptop with HD 620 graphics fell from 30 to 2 fps as the farm grew and the player zoomed out to 0.16 (13M triangles). The game had moved it to Fast and the player switched back to High. That led to the far-model, partial ground repaint and desktop auto-resolution fixes (`renderer_revision: low-end-1`, PR #24). They went live on GitHub Pages on 2026-10-11 and on itch.io on 2026-10-12.
- Traffic, same day: about 75% of itch.io visitors start a game, but only about 17% of phone visitors on the GitHub Pages link do, and most of those leave within seconds.
