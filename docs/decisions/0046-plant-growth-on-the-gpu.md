# 0046 Plant growth on the GPU: re-send a plant only when it changes for real

Status: decided 2026-11-11. Cole kept the deadwood fix and chose not to build growth on the GPU:
the measured gain (below) doesn't justify the refactor. Don't revisit without a new measurement
showing growth redraws dominate a frame.

## Rules

- Deadwood's age (`featureAge`) draws only its own tile: a weathering log, a shortening snag, a rotting stump. `FloraChanges.find` re-works just that tile, not its 5×5 neighbourhood. A feature appearing or going is `feature`, which still marks the neighbourhood (fences, boardwalks, dams join their neighbours).
- Measure plant redraw work with `node tools/growth-predict-probe.mjs [maps] [days] [eps]` (tiles and regions a day, today vs a growth prediction) and `tools/plant-churn-probe.mjs`. Count tiles, not milliseconds, when the machine is loaded (load average above ~4): the tile counts are exact, the times are not.
- Growth on the GPU is not built (Cole, 2026-11-11). If it is ever revisited: the shader's growth law must be the one `Flora.rebuild` uses (`0.35+0.6g` groundcover, `0.32+0.6g` shrubs, `0.2+0.8g` trees, `groveForm` for woody crowns), and the processor must re-send a tile when the actual growth is more than `eps` from the shader's prediction, or crosses any threshold the drawing reads (tuft counts 0.3/0.65, grass heads 0.55, shrub heads 0.3 and their count, blossom 0.45, hanging fruit 0.6, forest floor 0.45, wood-edge fringe). Anything with no law in the shader (climbers on trees, reef stars crusting over) is compared exactly, as now.
- Never step the drawn size: a re-send may correct by at most `eps`, and the drawn size moves continuously between re-sends.

## History

### 2026-11-10: what the daily redraw costs, and what growth in the shader would save

Asked: move plant growth into the vertex shader (review performance move 3, finding 2(b)), so the
processor re-sends a plant only when something real changes. Growth must stay smooth.

**How growth reaches the screen today.** `updatePlants` (sim/plants.js) adds a day's growth to
`groundG`, `shrubG` and `treeG`: `grow × season × (suitability − 0.3)/0.7 × 1.4`, times grazing
and sward terms for shrubs and trees, minus grazing losses. The season factor changes monthly
(every 10 game days), suitability daily (moisture, shade), grazing at random. So growth is not a
fixed curve in time: it is the sum of each day's increments. `FloraChanges.find` compares the
world arrays with what was drawn; every changed growth value re-works its tile. `Flora.rebuild`
then redraws every region with a changed tile (24×24 tiles, one or more a frame under a 4 ms
budget). Each daily step today is 0.2–4% of a plant's size: drawn growth is already stepped, once
a day.

Growth `g` is read by the drawing in more places than the size: tuft counts, grass heads, shrub
flower counts, blossom and fruit thresholds, the forest floor, the wood-edge fringe, grove width,
height and tint (nonlinear in `g`), positions of flowers and fruit on a crown, climbers' spots,
contact-shadow radii and reef stars.

**Measured, two-year grown farms (release fixtures, 25 days, tiles re-worked per day of 17,000):**

| | Sumatra | Amazon | PNW |
| --- | ---: | ---: | ---: |
| Today | 9,955 | 9,290 | 4,429 |
| Deadwood age own tile only (exact) | 5,039 | 3,699 | |
| + growth predicted, eps 0.003 | 3,058 | 2,024 | 2,411 |

`perf-guard-check` with the deadwood fix: tiles worked in 100 frames, Amazon 124,791 → 48,411,
Sumatra 144,205 → 54,985; draw calls, triangles and instances unchanged (baseline updated).

**Timed on a quiet machine (2026-11-11, load 3–9, M5 on mains), old code vs the deadwood fix,
back to back.** A game day's plant redraw in node (the release farms, two years grown, 25 days,
two runs each): Sumatra 67–73 → 53 ms, Amazon 65–66 → 49–51, PNW 49 → 46–54, Serengeti 40–42
→ 39–44 (no change where deadwood is scarce). Through the real frame loop (`play-profile
sumatra,amazon high 2`, play and top-speed views, two alternating runs each), plants per frame:

| | Sumatra play | Amazon play | Sumatra top speed | Amazon top speed |
| --- | ---: | ---: | ---: | ---: |
| Before | 0.54, 0.58 ms | 0.48, 0.56 | 4.7, 4.9 | 1.2, 1.8 |
| After | 0.41, 0.52 | 0.39, 0.40 | 4.6, 5.0 | 1.3, 1.2 |

About 0.1 ms a frame less at normal speed; at top speed the difference is inside the run-to-run
noise (the views' triangle counts and frame rates swing more between runs than between
versions). The redraw is a small part of the frame on the M5 at normal speed either way; it
matters most at top speed and on processors several times slower.

`growth-predict-probe` (in-map tiles, 60 days): a linear prediction from the last day's rate
misses by more than 0.005 on about 490 of 3,560 changed tiles a day in PNW (460 of 3,750 in the
Serengeti). The misses are mostly real: groundcover cropped by grazers (the largest), then
suitability changing a rate, and every month the season factor. They are scattered, so 28 of 30
regions are still redrawn every day: the prediction cuts the tiles worked out, not the regions
touched, so replay and buffer uploads (about a quarter of today's cost) stay.

The machine's load average was 14–23 during these runs (other sessions), so milliseconds were 2–3×
noisy; the tile counts are exact. At normal speed the redraw is about 1 ms a frame on the M5; at
top speed (a day every ~8 frames) it is the 5–9 ms "plants" figure in the review.

**The shader design (not built, by decision).** Each plant instance gets two more attributes: the growth when
sent, its daily rate and the send day (`vec3`), and the law's constants and pivot (`vec4`: the
size offset `k` in `(k+g)`, grove height spread; pivot = the plant's base, so flowers and fruit
on a crown move out with it). A uniform carries the game day (fractional, so growth is continuous
between days, smoother than today). The vertex shader rescales the instance about its pivot by
`size(g(t))/size(g0)` per axis before anything else reads `instanceMatrix` (a `#define` covers
wind, snow, focus fade, clouds and the depth materials in one place).

- *Which curves:* only the size laws above. Thresholds, counts and colour stay on the processor
  as re-send triggers. Grove tint can be a colour factor in the shader, or a trigger.
- *Shadows:* every plant material, the stand-in `shadowOnly` proxies and the depth materials need
  the same injection; `PlantShadows` packed batches and `PlantView` visible batches copy the new
  attributes along with matrices.
- *Picking and climbers:* canopy sites (`CanopySite.transform`, read by about eight files of
  climbing and gripping code) would compute their transform at the current day from the same law,
  or monkeys stand on branches up to ~9% off by month's end.
- *Plant cache and save restore:* the tile cache's records grow from 19 to about 26 numbers; saves
  hold no drawing state, and a restore redraws everything (sends every plant afresh), as now.
- *LODs:* close, in-between, distant and far models share one instance buffer, so they all grow
  the same way. Bounds keep their +3 margin, more than a month's growth.
- *Stays on the processor:* planting, death, damage, fire, browsing and grazing, id changes, every
  threshold crossing, month changes (season colours redraw everything anyway), climbers, reef stars.

Cost of building it: changes in `flora.js` (being edited by other sessions), `flora-changes.js`,
`plant-pools.js`, `plant-view.js`, `plant-shadows.js`, `plant-materials.js` and the canopy-site
code, 30–50% more instance memory, a few more vertex-shader operations per plant vertex (GPU,
to be measured). Expected gain on top of the deadwood fix: about 40% fewer tiles worked a day,
the same regions redrawn.
