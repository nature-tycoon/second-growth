# 0042 Tree impostors: far crowns as baked cards

## Rules

- Cole approved the look on 2026-11-11 and asked for it to be made ready to ship (on a branch until he says to push).
- With the far level on (`Flora.setZoom` level 3, decision 0022), each tree crown is one camera-facing card (2 triangles) showing a picture of its close model, from `TreeImpostors` (`render3d/tree-impostors.js`). The switch is the far level's own zoom test: no per-plant distance, no second threshold.
- Pictures are baked once per crown model (`crown:<type>:<species>:<variant>:<lift>`) at load, on the GPU, from 8 directions round it at the play camera's fixed 34° tilt (`VIEW_TILT`, keep it equal to `EL` in scene.js). The two pictures either side of the camera's direction (relative to the tree's own turn) are drawn, crossfading near halfway (`FADE`) so a turning camera doesn't flick crowns between pictures.
- Atlas pages of 32 crown models each, up to 4 (`pages`), each with its own card material: 2048×2048 with 128-pixel pictures (about 43 MB a page), or 1024×1024 with 64-pixel ones (about 11 MB) on phones, tablets, `weakGpu` chips and screens at a device pixel ratio of 1 (`smallCards` in scene.js). A crown past the last page keeps its far model.
- The atlas holds colour (the model's vertex colours, without the per-tree tint), surface direction and depth. The per-tree tint (season, autumn colour, bleaching, the border's dimming) is applied when drawn, so seasons need no rebake.
- Lighting goes through the crowns' own material (`windy`, `withFocusFade`, `withClouds`) with the normal from the picture, and snow is the crown formula from `withSnowTops` per pixel. Change one, change the other.
- The far model (`far-models.js`) still casts each crown's shadow (through the pool's shadow proxy). Shadows falling on a card are looked up at the crown's front surface from the picture's depth.
- Trunks keep their far posts; bare winter trees, bamboo, shrubs and anything without a crown pool keep their far models.
- A crown with no card (atlas full, not yet baked, no renderer as in headless checks, `flora.setImpostors(false)`) draws its far model: never nothing. After a lost graphics context `TreeImpostors.restore` bakes every picture again.
- Checks: `node tools/impostor-check.mjs` (headless: card coverage, pages, which model a pool shows); `node tools/impostor-browser-check.mjs [--shots]` (cards drawn with both atlas sizes, fewer triangles, a camera turn, snow, a lost and restored context); `FAR_REVIEW=impostors [FAR_MONTH=8] node tools/far-vegetation-review.mjs sumatra,amazon high` then `http://localhost:8347/tools/far-vegetation-review.html` (before: far models, after: cards); `node tools/play-profile.mjs sumatra,amazon high|fast` with `PLAY_VIEWS=play,wide`; `node tools/far-model-check.mjs`. `perf-guard-check` runs headless with no renderer, so it can't see cards.

## History

2026-11-10. Performance move 2 of the [PostHog review](../posthog-review-2026-11.md): rainforests
are the slowest maps (Sumatra on computers 18 fps with 3.6M triangles, 7M after 15 minutes; the
Amazon's graphics chip 39 ms). Cole asked for a design note and a prototype on Sumatra and the
Amazon before anything is built out.

### What the triangles are (measured first)

`restoredGame` (seed 1987), every plant on the map, triangles at each zoom:

| Map, zoom | Total | Tree crowns | Trunks | Shrubs | Other big parts |
| --- | ---: | ---: | ---: | ---: | --- |
| Sumatra 0.25 (far) | 2.29M | 0.36M | 0.08M | 1.03M | contact discs 0.32M (drawn only with shadows off), brush 0.19M, tree fruit 0.16M |
| Amazon 0.25 (far) | 1.35M | 0.37M | 0.08M | 0.31M | contact discs 0.33M, shrub flowers 0.26M |
| Sumatra 0.7 (play) | 18.4M | 8.0M | 2.3M | 3.3M | grass tufts 3.2M |
| Amazon 0.7 (play) | 15.2M | 7.5M | 2.3M | 1.1M | grass tufts 2.4M |

So, zoomed out, the far models (0022) have already cut crowns to about 45 triangles each, and
cards save what's left of them: about 0.35M per rainforest, 15–30% of the far view. The review's
"5–10× fewer" was the comparison with the detailed models; most of that came with the far models.
What remains zoomed out is mostly shrubs (Sumatra's pandan and gingers: the far-models session
is on them) and fruit and flower heads. The big crown cost is at play zoom (8M on the whole map,
the in-between model), where cards would have to stand up to a crown 70–130 pixels across. That
is a separate question for Cole (see Open).

### Design

- **Atlas and memory.** Pages of 2048×2048 with 128-pixel pictures: 2 crowns per row of 8
  views, 32 crown models a page (Sumatra uses 30, the Amazon 22), up to 4 pages. Two textures a
  page (colour in sRGB, direction and depth) with their smaller copies: about 43 MB of graphics
  memory a page. Each picture is drawn in a small target with a depth buffer and copied in, so
  pages have none. 128 pixels is about a big crown's size on a Retina screen just past the
  switch; phones, tablets, weak GPUs and screens at a device pixel ratio of 1 get 1024 pages of
  64-pixel pictures (about 11 MB a page). A crown model past the last page draws its far model.
- **Load time.** Baking draws each crown model 16 times (8 directions × 2 pictures) into the
  atlas, then makes the smaller copies once. It runs in `Renderer.draw` for crowns that appeared
  since the last frame, so it follows the plants as they're built; measured below.
- **Lighting and the day cycle.** The picture stores the surface direction in the model's own
  frame; the shader turns it by the tree's turn and lights it with the crowns' own leaf lighting
  (wrap and back glow), so the sun's angle and colour through the day, the moon and cloud shade
  act as on the model. Baked darkening inside the crown (vertex colours) is in the colour picture.
- **Shadows.** A camera-facing card can't cast the right shadow (the sun sees the tree from other
  heights), so the far model keeps casting it: shadow triangles don't change. Shadows falling on a
  card would land on a flat plane through the crown's middle and darken half of it; the depth in
  the picture moves the lookup to the crown's front surface, so a crown's sunny side stays lit and
  a neighbour's shadow falls across it as before.
- **Wind.** The card's top sways with the crowns' wind formula, applied to its corners: the whole
  crown leans together rather than leaf by leaf. At this size the sway is a pixel or two.
- **Growth sizes.** Each tree's scale is the card's: width by the tree's width, height by its
  height mixed with its width as the tilt mixes them (cos² 34° and sin² 34°). Groves that
  stretch a crown taller are approximate.
- **Seasons and colour.** The per-tree tint multiplies the picture, so spring green, autumn, coral
  bleaching and the border's dimming come through. Snow is added per pixel from the stored
  surface direction. Flowers and fruit stay their own dots, in front of or behind the card as they
  sit on the crown. Bare winter trees keep their far model (no card yet).
- **Camera turning.** The camera turns in quarter steps (watch mode drifts slowly, mostly zoomed
  in, where there are no cards); each tree's picture changes when the
  direction to the camera crosses the halfway point between two of the 8 views, at different
  moments for different trees (each tree has its own turn). Built out: within 12% either side of
  halfway the card crossfades between the two pictures (colours weighted by coverage, so an edge
  takes the colour of the picture that has a crown there), so crowns morph instead of flicking.
  A tree that stands near halfway shows the blend all the time; at this size it reads as one
  crown. Four texture reads instead of two, only for those trees.
- **Picking.** Plants aren't picked by their drawn meshes (clicks resolve to tiles), so nothing
  changes. The focus window round a selected animal still opens through cards.
- **Weak GPUs.** Needs only what WebGL 2 already has (8-bit render targets, smaller copies).
  If the graphics context is lost, the pictures go with it and are baked again on restore
  (`impostor-browser-check` loses and restores it). The
  card's fragment work is two texture reads and the usual leaf lighting, over roughly the same
  pixels as the far model; alpha-tested cards do overdraw where crowns overlap, as the models do.
- **The LOD switch.** Cards appear where the far models did. They look like the close model
  (lumpy crowns with their shading), so the jump from the distant model at the switch is smaller
  than to today's far diamonds; the thin white limbs inside crowns are lost as before.

### Prototype results

Bake: `far-vegetation-review` reports 30 crown models in 13–24 ms on Sumatra and 22 on the Amazon
(M5, processor time to issue the draws; the GPU work is a few hundred small draws). The atlas has
room for 32, so Sumatra is near the limit: build-out needs a second page or a 2048×4096 atlas.

Triangles in the same frozen scene (`FAR_REVIEW=impostors far-vegetation-review`, far models →
cards):

| View | Sumatra | Amazon |
| --- | ---: | ---: |
| High, zoom 0.34 (just past the switch) | 1.07M → 0.87M | 0.57M → 0.35M |
| High, zoom 0.25 | 1.53M → 1.24M | 0.75M → 0.45M |
| Fast, zoom 0.48 | 0.66M → 0.53M | 0.38M → 0.25M |
| Fast, zoom 0.25 | 1.53M → 1.24M | 0.74M → 0.44M |
| Play zoom 0.62 | unchanged | unchanged |

Frame time, `play-profile.mjs sumatra,amazon high|fast 2`, `PLAY_VIEWS=play,wide`, resolution
held, base checkout (`PLAY_ROOT`) vs this one, M5 at 2880×1800 on mains but with a load average of
10–15 from other agents, so timings are noisy. Games diverge, so trust triangles over timings.

| Wide view (zoom 0.25) | Triangles | GPU ms | Drawing ms | FPS |
| --- | ---: | ---: | ---: | ---: |
| Sumatra High | 3.4–3.5M → 3.1M | 16.6 → 18.8 | 20.7–21.9 → 18.9 | 37–38 → 39 |
| Amazon High | 1.2–1.8M → 1.0M | 9.6–10.4 → 10.0 | 9.8–10.2 → 11.4 | 55–56 → 56 |
| Sumatra Fast | 3.4M → 3.1M | 12.1 → 12.2 | 11.9 → 11.8 | 55 → 55 |
| Amazon Fast | 1.2M → 0.9M | 11.1 → 10.9 | 5.3 → 5.1 | 60 → 60 |

Again after the build-out (crossfade, pages), 2026-11-11, with the machine quiet (load average
under 4), base checkout vs this one; every view held the 60 fps cap:

| Wide view (zoom 0.25) | Triangles | GPU ms | Drawing ms |
| --- | ---: | ---: | ---: |
| Sumatra High | 3.5M → 3.1M | 12.2 → 11.9 | 4.5 → 4.7 |
| Amazon High | 1.3M → 0.9M | 10.9 → 10.3 | 3.5 → 3.3 |
| Sumatra Fast | 3.5M → 3.1M | 11.5 → 11.9 | 4.2 → 5.2 |
| Amazon Fast | 1.2M → 0.9M | 9.8 → 7.6 | 3.4 → 3.5 |

At play zoom triangles are unchanged (2.1M High, 1.7M Fast in Sumatra) and so is the cost.

On the M5 nothing moves beyond noise: at Retina size its GPU is limited by pixels, not triangles,
and the cards cover about the same pixels as the far models. The gain is for triangle-limited
chips (weak laptops, phones), and it is modest: 10–40% of the wide view's triangles. It is not
measured on those devices.

Look (`tools/far-vegetation-review.html`, before = far models, after = cards): at and past the
switch the crowns read like the play-zoom crowns (lumpy, lit from the sun's side, darker
underneath) instead of the far models' flat diamonds. They are fuller and a little lighter, so
less ground shows between crowns than with the far models; that is closer to the close model,
but it is a visible change at the switch. The thin limbs inside crowns stay lost. Cole reviewed the
crops and the review page on 2026-11-11 and approved the look.

### Built out (2026-11-11)

- Atlas pages (4 at most, 128 crown models): a game grown for a few years in Sumatra already
  uses 30 of a page's 32.
- The quarter-size atlas (1024, 64-pixel pictures, about 11 MB a page) on phones, tablets,
  `weakGpu` chips and screens at a device pixel ratio of 1, where a far crown is under 64 device
  pixels. Sumatra at a device pixel ratio of 1 (`impostor-browser-check --shots`) shows the same
  lumpy, shaded crowns, a little softer.
- Crossfade between pictures (see Camera turning).
- Each picture is drawn in a 128-pixel target with a depth buffer and copied into its page, so
  pages have no depth buffer of their own (32 MB less).
- Checked in the browser: a camera turn mid-way (no gaps or doubled crowns), snow (white on the
  crowns' tops, as on the models), autumn on Atlanta (`FAR_MONTH=8`: each tree keeps its own red,
  orange or yellow), conifers on the Pacific Northwest (tiered spires), and a lost and restored
  graphics context (every picture baked again).
- More triangles saved elsewhere (`FAR_REVIEW=impostors`, zoom 0.25): Pacific Northwest 0.61M →
  0.39M, Atlanta 0.31M → 0.21M. Bake: 16 crown models in 16 ms, 28 in 13 ms.

### Open

- Cards at play zoom (level 2), where crowns are 8M of 18M triangles on the whole map: the bigger
  win, but the card must hold up at 70–130 px. Needs Cole's eye on a review crop first.
- Trunks into the crown's card (one card per tree, another 0.08M triangles zoomed out).
- Bare winter trees and palms (frond stars are already 32 triangles: little to gain).
- The flicker during a turn is judged from still frames only; Cole to watch one in play.
