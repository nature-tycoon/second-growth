# 0022 Far vegetation by screen size, on every computer

2026-10-24. Step 2 of the frame-rate plan from the [PostHog player performance](../posthog-player-perf.md)
lookups: the typical player ran about 22 fps, a third under 20, and slow players were held back by
drawing on the processor and, on weak laptops, the GPU. iPads and zoomed-out desktops see the most
map. This is the [performance review](../performance-review-2026-10-23.md)'s finding 4 and decision
[0004](0004-ecosystem-performance.md)'s P4 vegetation item. Cole approved simplifying distant
plants in 0004, as long as close-ups keep their detail.

## Before

Trees and shrubs have four models (`PlantPool.geoFor`): close (0), distant (1), in-between (2) and
far (3, made by `far-models.js`). `Flora.setZoom` picks one for the whole view from the zoom. The
far models were only allowed once the game had decided the computer was slow: the first step of
`autoResolution`, the automatic step down to Fast, a saved `slowFps`, or a GPU on the `weakGpu`
list. A computer that kept up drew the distant models even with the whole valley in view, 6–10M
triangles over a grown rainforest.

## Decision

The far models are on for everyone, at every Detail level. The switch stays where the slow path
had it: a tile under about 16 CSS pixels across (zoom < 0.36) on High and Balanced, under 23 (zoom
< 0.5) on Fast.

Why a zoom test and not a per-plant distance test, as animals have: the play camera is
orthographic. Every plant on screen is drawn at the same scale wherever it stands, so its size on
screen is the zoom (46 px per tile at zoom 1) times its own size, and a per-plant distance test
would give the same answer everywhere. Animals test per animal only because the selected and
followed animal must stay detailed. Eye level (`F`) is the one perspective view; it passes its own
fixed zoom (`eyeDetail`, 1.6) and keeps the close models, as before.

A per-species threshold (big emergent trees switching later than small shrubs) was considered and
left out: the whole view would pop in stages while zooming instead of once, and the savings are in
the many crowns, which all switch together anyway.

What was removed: `Renderer.useFar`/`farOn`, the "far trees first" step of `autoResolution` (it
returned before lowering the resolution when zoomed out), the `useFar` call in `autoQuality`, and
the `weakGpu` renderer option (`main.js` still uses `weakGpu` to start weak laptops on Fast).
`flora.setFar(false)` remains as a switch for comparing, like `actors.fauna.farModels`.
`far_models` in `perf_sample` now says whether the far models were drawn in the sampled frame
(previously: whether they were allowed).

## Results

`node tools/play-profile.mjs sumatra,amazon,serengeti high|fast 3`, `PLAY_VIEWS=play,wide`,
`PLAY_SETUP="R.autoRes=false;R.setRes(1)"` (before also `R.useFar(false)`: what a computer that kept
up drew; without it the old slow path had already turned far models on in the Sumatra High run).
M5, 2880×1800 on High, DPR 1.5 on Fast, on battery (Low Power Mode off), so GPU times are noisy;
games are unseeded and diverge, so trust the triangles more than single timings.

| Map, zoomed out (0.25) | Quality | Triangles | GPU ms | Drawing ms | FPS |
| --- | --- | ---: | ---: | ---: | ---: |
| Sumatra | High | 12.3M → 6.3M | 49.8 → 31.6 | 12.6 → 13.4 | 18 → 27 |
| Amazon | High | 7.9M → 2.6M | 30.2 → 14.5 | 6.7 → 4.2 | 28 → 53 |
| Serengeti | High | 3.3M → 1.9M | 18.0 → 11.3 | 5.4 → 2.5 | 45 → 57 |
| Sumatra | Fast | 12.3M → 6.3M | 31.1 → 10.6 | 7.6 → 5.4 | 30 → 60 |
| Amazon | Fast | 7.9M → 2.6M | 16.1 → 9.8 | 4.1 → 3.5 | 51 → 60 |
| Serengeti | Fast | 3.3M → 1.9M | 6.2 → 10.2 | 2.4 → 2.2 | 60 → 60 |

At play zoom (0.7) nothing switches and the triangles match where the ecology did (Sumatra 2.32M
both, Serengeti 1.58M both); timing differences there are noise. (The Fast "after" run read about 4 ms more GPU at play zoom on every map, where nothing changed, so Serengeti Fast's 6.2 → 10.2 is the battery, not the far models.) In the same frozen scene
(`far-vegetation-review.mjs`), zoomed out: Sumatra 4.5M → 2.3M, PNW 2.3M → 0.6M, Serengeti 0.87M
→ 0.25M. Sumatra keeps the most because palms (oil palm estates) have no far model.

Look: at play zoom the pictures are identical. Just past the switch (zoom 0.34 High, 0.48 Fast)
broadleaf crowns read as chunkier clumps without the thin white limbs, and a little more ground
shows between them; Cole to judge on the review page.

## Checks

- `node tools/far-model-check.mjs`: far models on from the start, the switch zooms on High and
  Fast, close/in-between models at play zoom and eye level, triangle savings per map.
- `node tools/far-vegetation-review.mjs` then `http://localhost:8347/tools/far-vegetation-review.html`:
  before/after screenshots of the same frozen scene (`setFar(false)` vs on).
- `node tools/play-profile.mjs sumatra,amazon,serengeti high|fast` with `PLAY_VIEWS=play,wide`.

## Open

- The switch is in CSS pixels, so on a Retina screen a far crown is about twice as many device
  pixels as on a phone. A device-pixel switch would keep the detailed models longer on Retina, the
  opposite of what slow iPads need.
- Palms, bamboo and corals have no far model, which is most of what Sumatra still draws zoomed out.
- The low-end GPU gate (Intel HD 520 on Fast) is still unmeasured on real hardware.
