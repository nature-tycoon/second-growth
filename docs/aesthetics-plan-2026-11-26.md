# Aesthetics plan, 2026-11-26: better looks without a slower game

Asked by Cole: where can the game look better without hurting performance, across the whole app,
focused on what makes the biggest difference. Read-only investigation: the drawing code
(`js/render3d/`, `styles.css`, the 2D overlay), the release check's reference pictures of every map
(`tools/release-baselines/`, 2026-11-12/21), and one live look at PNW's opening and the settings menu.
Nothing was built or measured; the Mac was shared, and every item below names its before/after.

## The budget this plan works inside

From the [2026-11-26 performance review](performance-review-2026-11-26.md): the largest group of
players (weak Intel/AMD laptops) is held back by the GPU (~13 ms) and the game's own drawing work
(~6 ms) about equally; draw calls and triangles are already light. So, in order of cost:

| Cost | What | Use freely? |
| --- | --- | --- |
| **Free** | Changing colours, light strengths, grades, vertex/instance colours, start time, CSS behind the canvas | Yes. Only the release pictures need refreshing. |
| **Nearly free** | A few extra shader operations on surfaces that cover few pixels (water, animals, the far border) | Yes, measured once. |
| **Watch** | A new material variant (each is a shader program: 5–45 ms to compile on a Mac, far more on Windows; see the loading rules in the 2026-10-23 review) | Reuse existing materials; check `first-frame-profile`. |
| **Expensive** | Anything per pixel over the whole screen (bloom, ambient occlusion, depth of field, a second shadow cascade, soft shadows), more triangles in wide views, more transparency | Only on High, at reduced size, measured, or not at all. |

The good news: most of what would help most is in the first two rows.

## What's already strong (don't redo)

The look is further along than a quick glance suggests: a per-map colour grade folded into tone
mapping at no extra pass (`installGrade`, scene.js), leaf light that wraps and glows when backlit
(`plant-materials.js`), baked ambient occlusion and shaded crowns in the tree models (`bakeAO`,
`shadeVerts`), close-up soil detail that fades out where it can't be seen (`terrain-materials.js`),
water with sun highlights, sky reflection, shallows caustics and quality-driven murk, drifting cloud
shadows, far haze, a full day cycle with golden hour, seasonal snow, tree impostors and far models,
and a calm, well-made interface. The plan below is mostly art direction on top of that machinery.

## What holds the look back, biggest first

Seen in the reference pictures and the live game:

1. **The world ends in a hard cut over a flat dark void.** Zoomed out, the farm and its forest
   border stop at a straight edge floating on the page's fixed dark green (`--sky-1: #0c1914`,
   styles.css). It doesn't change with the map, the hour or the weather. This is the second picture
   every player sees (after the intro film) and the one in every screenshot people share.
2. **Pictures read milky and low in contrast.** PNW's pasture, Serengeti's grass and Chinandega's
   fields sit in a narrow band of pale yellow-greens; lit ground, shade and forest are close in value,
   so the eye has nowhere to land. The grades are all gentle (`sat` 1.03–1.08, `contrast` 1.05–1.08).
3. **Rainforest canopies are one green.** Amazon and Sumatra read as a field of identical bright
   blobs. Each crown's colour varies by only ±4.5% (`vary(..., 0.045)`, flora.js:700), and the species'
   leaf colours are close to each other, so a mixed rainforest looks like a plantation.
4. **Whole-screen washes painted on top.** The season tint, the savanna's glare, the golden-hour wash
   and the night are flat gradients painted over the finished picture on the 2D overlay
   (`drawEffects`/`drawNight`, scene.js ~1514 and ~1680). A wash tints highlights, shadows and water
   alike, which reads as a filter rather than light, and night is a blue veil rather than moonlight.
5. **Serengeti's bare soil looks stamped.** The dark-brown patches repeat in similar shapes with
   hard edges, and their near-black brown is the darkest thing on a sunlit savanna.
6. **The reef is washed out and busy.** Caustics run at one strength across the whole view, so at
   play zoom the sea floor is a bright mesh over pale green, and the corals lose their colour.
7. **The first shot of the intro film is the weakest close-up in the game.** A deer fills the
   frame with smooth, plasticky shading, flat foliage cards and flower heads floating as pink stars.
   It's the first thing a new player sees.
8. **The first minutes are in flat afternoon light.** The game starts at 45% of the day
   (`todClock = DAY_CYCLE * 0.45`), the plainest light in the cycle, on a deliberately bland,
   degraded farm.

## The plan, ranked by impact for the cost

### Tier 1: free (colours, constants, CSS)

**1. A horizon instead of a void** (small, biggest single win).
- Behind the canvas: a sky gradient that follows the map, the hour and the weather. The 3D canvas is
  already transparent (`alpha: true`), so this is CSS: set three custom properties on `body` from
  `updateSky` a few times a minute (golden at sunset, deep blue at night, grey in rain), reusing the
  colours `timeOfDay` already computes. No GPU cost.
- The edge of the world: fade the outermost border tiles and the skirt into that sky/haze colour so
  the land dissolves into distance instead of stopping. Either vertex colours on the outer ring
  (free) or the existing haze term in `withClouds` weighted by distance from the map's centre
  (a constant change in a shader every material already runs; no new program).
- Check: release pictures at the zoomed-out view, `first-frame-profile` (no new programs),
  `perf-guard-check`.

**2. A value and colour pass per map** (small in code, a look decision for Cole).
- Goal: three clear value bands in every view: dark (forest floor, deep water, shade), middle
  (fields, crowns), light (paths, sunlit tops, sand). Today the middle band swallows the others.
- Levers, all free: `look.grade` (contrast toward 1.10–1.15, a little lift removed), `look.light`
  (a touch more sun against sky so shadows carry), `look.pasture` and soil colours (more hue
  spread, less yellow-grey), and shadow colour (a cooler hemisphere ground colour so shade reads
  blue-green, as it does outdoors, rather than grey).
- Method: `tools/lighting-review.html` side by side, one map at a time, Cole picks. Refresh the
  release references afterwards (`release-browser-check --update-visuals`, locally).

**3. Canopy variety** (small).
- Widen each crown's colour variation from ±4.5% to about ±10–12% in value and a few degrees of hue,
  more in rainforest, less in conifers. Spread the species' leaf colours further apart in
  `js/data` (emergents greyer and paler, understorey darker and bluer, a few yellow-green flushes).
  Instance colours already exist, so this costs nothing per frame.
- Check: `flora-rebuild-bench` signatures will change (expected), `vegetation-review.html`.

**4. Serengeti soil, reef colour** (small each).
- Soil: soften the patch edges in the ground's blend, vary their shapes, and warm the colour toward
  a red-brown laterite at a lighter value so it sits under the grass, not on top of it.
- Reef: fade caustic strength with zoom-out and depth (a constant in `seaCaustic`'s use), deepen the
  shallow and deep sea colours a little, and lift coral saturation.

**5. Start in golden hour** (tiny).
- Start the clock about 0.7 of the day instead of 0.45, so the first minute plays through long
  warm shadows into sunset and dusk. Check the opening (`ui/opening.js`) and the intro film's last
  frame still match the start view (`intro-film-check`).

### Tier 2: cheap shader and overlay work

**6. Light instead of washes** (medium; likely a small performance gain too).
- Move the season tint, the savanna glare, the golden-hour wash and the night's darkening from the
  2D overlay into the lighting: the season and hour as uniforms on the grade, the night as a darker,
  bluer sun and sky (the day cycle already has moonlit keys) rather than a veil. `withClouds` is on
  nearly every lit material already and ends at `opaque_fragment`, so shared uniforms there reach
  everything without a new program. The fireflies, labels and weather stay on the overlay.
- Result: highlights stay bright at golden hour, water keeps its sparkle at night, and the overlay
  stops filling the whole screen every frame. Measure the overlay's cost before and after with
  `play-profile` (the drawing parts now in `perf_sample` will show it).

**7. Water that catches the low sun** (small).
- The water is already Phong with a highlight. Raise its shininess and highlight strength toward
  golden hour and sunset, so creeks and ponds flash at the best time of day. Water covers few
  pixels, so the cost is negligible.

**8. Animals stand out from the ground** (small; decision 0018 applies).
- A faint sky-coloured rim on the shaded side of animals at play zoom, so a deer in grass reads at a
  glance. Animals cover very few pixels; it goes in the existing animal material, not a new one.

**9. Glass menus on weak computers** (small; a performance gain).
- The frosted panels blur the moving 3D view behind them every frame (`backdrop-filter`, 16–32 px).
  They switch to solid on phones and on Fast; also switch them on any weak GPU (`weakGpu`), with a
  fine paper texture so solid panels don't look cheaper.

### Tier 3: first impressions (no cost to play)

**10. Re-stage the intro film's first shot** (medium; uses the film pipeline).
- The film is a video, so its look costs bandwidth, not frame time. Open on a mid-distance shot in
  golden hour (the land, a creek catching the light, an animal crossing), not a full-frame close-up
  of a deer. If a close-up stays, review the flower heads and foliage cards in frame first.
  `tools/intro-film-plan.mjs` holds the shots; `intro-film-check` and `intro-film-motion` cover it.

**11. Make restoration visible at a glance** (small to medium, art direction).
- The game's promise is land getting better. Check each map that restored ground looks *richer* than
  degraded ground, not just different: deeper greens, flowers in colour patches rather than single
  dots, darker wetter soil by water. Mostly palette work in `js/data` and the maps' `look`.

### Tier 4: expensive, only if measured (not recommended now)

- **Tilt-shift/depth of field** (the classic diorama look): a full-screen blur pass. Only plausible
  on High on discrete GPUs, which are 5% of players held to 30. Not now. A cheap stand-in already
  exists: the far haze, which item 1 strengthens toward the top of the screen.
- **Screen-space ambient occlusion, bloom, soft shadows, a second shadow cascade**: per-pixel over the
  whole screen; ruled out by the budget for the players who matter most. Baked occlusion in the models
  already covers most of what SSAO would add.
- **More detailed models in wide views**: triangles are where zoomed-out rainforest already hurts.
  Close-up detail is fine (few objects), paired with distant simplification as before.

One related item lives in the performance review: **"fewer pixels, sharpened"** (item 5 there). A
sharpening pass makes the picture crisper even at full resolution, so if it's built for speed, judge
it for looks too.

## Built

- **2026-11-26, session 1:** items 1 and 5, as [0058](decisions/0058-horizon-backdrop.md). Changed from
  the plan: the near soil walls stay (the diorama is deliberate), only the far edges melt; and the late
  start applies only when the intro film doesn't play (otherwise the film would need re-filming to
  end on the new hour).
- **2026-11-26, session 2:** item 2, a mild value pass on every map: grade contrast 1.09–1.13 with
  less lift, sun up and sky fill down a few percent, blue-green bounce light, richer pasture. Pictures,
  numbers and open questions: [ideas/2026-11-26-aesthetics/s2.md](ideas/2026-11-26-aesthetics/s2.md);
  `tools/value-capture.mjs` retakes them.

## Suggested order

| Session | Items | Size | Needs Cole |
| --- | --- | --- | --- |
| 1 | Horizon and edge fade (1), golden-hour start (5) | small | review pictures |
| 2 | Value and colour pass, one map at a time (2) | small code, long review | picks each map's look |
| 3 | Canopy variety (3), Serengeti soil and reef (4) | small | review pictures |
| 4 | Light instead of washes (6), water at golden hour (7) | medium | review night and dusk |
| 5 | Intro film's first shot (10) | medium | approves the cut |
| 6 | Animal rim (8), glass menus on weak GPUs (9), restoration contrast (11) | small each | review |

Every session: `node tools/perf-guard-check.mjs`, `node tools/first-frame-profile.mjs` (no new shader
programs unless intended), the release check's pictures refreshed only after looking at them, and for
items 6–8 `play-profile` before and after on one wet map and Serengeti.

## What's uncertain

- The reference pictures are from 2026-11-12 (Chinandega 11-21); some maps have changed since.
  Items 3–6 should start by retaking them.
- The cost of the overlay washes (item 6) is a guess; the per-part drawing numbers now in
  `perf_sample` will say whether it's a real saving or only a better look.
- Items 2, 3 and 11 are taste. The plan gives the levers; the picks are Cole's.
