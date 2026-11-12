# 0022 Far vegetation by screen size, on every computer

## Rules

- Far tree and shrub models (`far-models.js`, level 3 in `PlantPool.geoFor`) are on for every computer at every Detail level, chosen for the whole view by zoom in `Flora.setZoom`: tile under ~16 CSS px (zoom < 0.36) on High and Balanced, under 23 (zoom < 0.5) on Fast.
- Keep it a zoom test, not per-plant distance: the play camera is orthographic. Eye level passes its own fixed zoom (`eyeDetail` 1.6) and keeps close models. No per-species thresholds (the view would pop in stages).
- `flora.setFar(false)` switches them off to compare (like `actors.fauna.farModels`). `far_models` in `perf_sample` says whether they were drawn in the sampled frame.
- Close-ups keep their detail (Cole's condition in 0004). Frond crowns (tree shapes in `FROND_CROWNS`, flora.js: palms, oil palm, fan palm, banana, cecropia) get `farFronds`, a two-sided star of eight leaves (32 triangles); add a new frond-crowned shape there. Giant clam shells have their own coarser builds (`clamShell(seed, lod)`, 5760 / 960 / 240 triangles; the distant one also at play zoom).
- Shapes far-models.js can't simplify get a far build of their own, lod 3 in their builder: `FAR_SHRUBS` in `G.shrub` (bamboo, ginger, pandan, heliconia, rattan, soft coral, sea fan, clam mantle, mushroom coral, sponge), `FAR_BUILT` tree shapes in flora.js (brain and table coral), `G.accent(type, seed, 3)` (torches, pandan fruit) and `G.blob(color, r, 3)` (flower and fruit dots). Keep the distant model's random draws in the same order (skip drawing, not drawing lots), so leaves stay where they were; leave out what's under a pixel (canes, stalks, whips); widen or lighten what's left to cover as much and keep the shade. far-model-check measures this per pool: area towards the camera within 20%, mean colour within ~0.05, spread and height.
- Still without one: brush piles (Sumatra 0.19M zoomed out), the titan arum's leaf, Amazon's bigleaf shrubs. Find what still lacks a far model by triangles before adding one: count `pool.subs` with `geoFar === geoLo` on `restoredGame(map)` at zoom 0.25 (as far-model-check does).
- Checks: `node tools/far-model-check.mjs`; review `node tools/far-vegetation-review.mjs` then `http://localhost:8347/tools/far-vegetation-review.html`; cost `node tools/play-profile.mjs sumatra,amazon,serengeti high|fast` with `PLAY_VIEWS=play,wide`.

## History

2026-10-24. Step 2 of the frame-rate plan from the [PostHog player performance](../posthog-player-perf.md)
lookups: the typical player ran about 22 fps, a third under 20, and slow players were held back by
drawing on the processor and, on weak laptops, the GPU. iPads and zoomed-out desktops see the most
map. This is the [performance review](../performance-review-2026-10-23.md)'s finding 4 and decision
[0004](0004-ecosystem-performance.md)'s P4 vegetation item. Cole approved simplifying distant
plants in 0004, as long as close-ups keep their detail.

### Before

Trees and shrubs have four models (`PlantPool.geoFor`): close (0), distant (1), in-between (2) and
far (3, made by `far-models.js`). `Flora.setZoom` picks one for the whole view from the zoom. The
far models were only allowed once the game had decided the computer was slow: the first step of
`autoResolution`, the automatic step down to Fast, a saved `slowFps`, or a GPU on the `weakGpu`
list. A computer that kept up drew the distant models even with the whole valley in view, 6–10M
triangles over a grown rainforest.

### Decision

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

### Results

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

### Checks

- `node tools/far-model-check.mjs`: far models on from the start, the switch zooms on High and
  Fast, close/in-between models at play zoom and eye level, triangle savings per map.
- `node tools/far-vegetation-review.mjs` then `http://localhost:8347/tools/far-vegetation-review.html`:
  before/after screenshots of the same frozen scene (`setFar(false)` vs on).
- `node tools/play-profile.mjs sumatra,amazon,serengeti high|fast` with `PLAY_VIEWS=play,wide`.

### Open

- The switch is in CSS pixels, so on a Retina screen a far crown is about twice as many device
  pixels as on a phone. A device-pixel switch would keep the detailed models longer on Retina, the
  opposite of what slow iPads need.
- Bamboo, corals and strap-leaved shrubs have no far model (Sumatra's pandan and ginger 0.7M, Amazon's claw flowers 0.26M, Reef's brain coral 0.12M of a grown game zoomed out). Done 2026-11-11, below.
- The low-end GPU gate (Intel HD 520 on Fast) is still unmeasured on real hardware.

### 2026-11-10: palms and giant clams

From the [PostHog review](../posthog-review-2026-11.md): oil-palm crowns were 70% of the
triangles in Sumatra's opening view, and in grown games zoomed out 60–75% of Sumatra's and the
Amazon's plant triangles had no far model. The Reef map's giant clam shells were 5,760 triangles
each at every zoom, 87% of what the reef drew zoomed out.

- `farFronds` (far-models.js): around the hub under the topmost fronds, each eighth of the way
  round becomes one leaf pointing where that side's fronds point. It reaches as far as most of them
  (85th percentile), bends through their height halfway out and at the tips, and is about half as
  wide as the eighth halfway out, so gaps show between leaves. Leaves face up and down (fronds are
  two-sided), a shade darker (×0.86) because a flat leaf faces the sun more squarely than twisting
  fronds. The first try (full-width leaves, no darkening) read as solid bright stars next to the
  airy fronds; the review crops at zoom 0.48 on Fast now match in tone and spacing.
- `clamShell(seed, lod)`: the same ribs sampled more coarsely. Crests and grooves fall on samples
  whenever U is a multiple of 10, so the zig-zag rims stay exact. At play zoom, old and new
  screenshots look the same.

Triangles, `restoredGame` at zoom 0.25 (far-model-check): Sumatra 3.16M → 2.29M, shadows
0.64M; Amazon 2.02M → 1.35M; Reef 3.45M → 0.59M. perf-guard (seeded fixtures): Sumatra wide 3.31M →
2.60M and shadows 1.46M → 0.63M; Amazon wide shadows 1.08M → 0.45M; Reef wide 3.99M → 1.18M and
play 3.57M → 2.83M. Review screenshots (far-vegetation-review, Fast): Reef play zoom 2.20M → 1.32M.
`plant-render-browser-check` and `plant-view-browser-check` pass unchanged.

Frame time, `play-profile.mjs sumatra,amazon,reef fast 2` with `PLAY_VIEWS=play,wide` and the
resolution held, old and new alternating twice on the M5 at 2880×1800: every view holds 60 fps
either way. Zoomed out, triangles fell from 5.3M to 3.5M in Sumatra, 1.7M to 1.2–1.3M in the Amazon and 3.6–3.9M to 1.2M on the Reef. GPU time didn't
move beyond noise: Reef wide 12.7/9.1 → 10.9/7.6 ms, Sumatra wide 10.0/10.2 → 12.3/11.9. Sumatra
at play zoom, where nothing changed, also read about 2 ms higher in the new runs, so that's run
order or load, not the models. At Retina size the M5's GPU is limited by pixels, not
triangles. The gain is for triangle-limited chips (weak laptops, phones). Read it in PostHog
`perf_sample` (fps and triangles by map) after release; it is not measured on those devices.

### 2026-11-11: bamboo, strap leaves, corals and flower dots

What was left after the palms: per pool, `restoredGame` at zoom 0.25, Sumatra's ginger 0.30M, pandan
0.25M, their torches and fruit 0.17M, fig and flower dots 0.28M, bamboo 0.13M, rattan 0.09M; the
Amazon's claw-flower dots 0.26M, bamboo 0.10M, heliconia 0.06M; the Reef's brain coral 0.12M, clam
mantles 0.06M, table, soft and mushroom corals, sea fans and sponges 0.14M.

These are built of thin straps, canes and lathes, which far-models.js can't turn into clumps or
rings, so each builder draws its own far model (lod 3) from the same random draws as the distant
one: ginger keeps every leaf in two pieces instead of three, a little wider, without the canes and
flower stalks (160 of 428 triangles; with only two leaves a cane it read as a broken zig-zag
beside the leafy column); pandan every other leaf, wider, on one thin post for the stilt roots
(76 of 452); rattan's fronds become straps as wide as their leaflets, a shade yellower for the
canes and whips left out (64 of 408); bamboo's culms lose their caps and a side, its leaves are
straight (70 of 160); heliconia's paddles are straight, a little narrower and lighter (20 of 40).
Torches and pandan fruit are an eight-sided ball each in their average shade (24 of 240). Flower
and fruit dots are octahedra 1.24 times the radius, which covers as many pixels (8 of 20). Brain
coral is an eight-sided ball shaded with its grooves' average (48 of 180), table coral a
seven-sided plate (40 of 60), the clam mantle a flat 12-triangle disc, sponges, sea fans, soft and
mushroom corals fewer sides.

Triangles, `restoredGame` at zoom 0.25 (far-model-check): Sumatra 2.29M → 1.46M, Amazon 1.35M →
1.11M, Reef 0.59M → 0.37M (shadows 0.27M → 0.16M; shrubs cast none this far out). perf-guard
(seeded fixtures, wide): Sumatra 2.60M → 2.07M and 2.89M → 2.14M half a year on, Amazon 1.87M →
1.64M, Reef 1.18M → 0.96M; play and close views unchanged (a few hundred triangles of seeded
drift). Review screenshots (far-vegetation-review, Fast, just past the switch at 0.48): Sumatra
1.86M → 0.46M, Amazon 1.68M → 0.33M, Reef 1.09M → 0.24M against the distant models.

Look: rendered side by side at game size, distant beside far, the pairs match in tone, spread and
height. Close up (not drawn there), the far pandan's leaves read bolder and the far rattan
heavier than the airy fronds. In the reef review crops the new corals are unchanged to the eye;
the staghorn and boulder corals, which have had far-models.js clumps since this decision, read
lumpier than their branching distant models, a separate look question.
`plant-render-browser-check`, `plant-view-browser-check` and `plant-replay-check` pass.
