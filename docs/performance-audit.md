# Ecosystem performance audit

Audited 2026-10-15 at revision `0765363aca9b9495f519f1dd0cb27b5bbaa865cb`. No gameplay or diagnostic source was changed during the audit. The [decision](decisions/0004-ecosystem-performance.md) records Cole's subsequent target and visual preferences; the [plan](performance-plan.md) contains proposed implementation work.

The evidence supports targeted improvements to vegetation invalidation/replay, animal preparation and dense animal neighborhoods. It does not justify a rewrite. Geometry load is a separate concern from CPU preparation: both need validation on the intended older GPU.

## Current architecture

| Responsibility | Existing implementation | Scaling or limitation |
| --- | --- | --- |
| Frame and simulation clock | `js/main.js`, `js/frame-loop.js`, `js/game.js`: simulation, input, rendering, UI on the main thread; 30/60/Auto frame cap; real dt clamped to 100 ms | Wildlife/visitors/map motion runs in steps no larger than .05 game days. At dt 1/30 second, speeds 1/2/3 use about 1/2/6 substeps; a slow frame at maximum speed can use 16. |
| Authoritative ecosystem | `js/world.js`: typed arrays for terrain, plants, growth, food, canopy, moisture and distances | Default property is 120×90 tiles; its border expands rendering to 148×118. Organism count differs from rendered instance count because a plant can generate many parts. |
| Daily ecology | `js/game.js`, `js/sim/environment.js`, `js/sim/plants.js`: environment, growth/seeding, wildlife, visitors, events and campaign work | Many daily passes span the property. Hydrology/elevation already have dirty guards. Suitability is mainly monthly or explicitly refreshed, not computed every frame. |
| Rendering | `js/render3d/scene.js`: orthographic camera, terrain, Flora, Actors, structures, lighting, shadows, sea, and a separate 2D effects canvas | One main scene render and an optional shadow pass. Wind and much animal motion use shader attributes/uniforms. Adaptive resolution/quality already exists. |
| Plant source data | `flora.js`, `plant-pools.js`: cached model geometry and shared material families, instanced source buffers in 48×48-tile regions | Changed regions replay unchanged tiles and finalize/upload source buffers. Source storage, tile replay, view packing and shadow packing retain multiple representations. |
| Geometry sharing | `geometry-index.js`: indexed drawing copies deduplicate identical attributes; originals remain available for support/contact | Already implemented. Indexing reduces vertices and bytes, not the number of triangles. |
| Plant visibility | `plant-view.js`: cached region/instance bounds, individual frustum tests and one packed opaque batch per model | Per-model revisions and a 4% pan margin already avoid many refreshes. Transparent regions retain separate ordering. No general occlusion system. |
| Plant LOD | `Flora.setZoom`, `far-models.js`: close/middle/distant/far models and separate grass thresholds | Zoom/quality controls selection. Far levels are conditional; not every model has one. Orthographic zoom is a reasonable size proxy. |
| Shadows | `plant-shadows.js`, `Renderer.shadowsStale`: light-frustum culling, simplified casters, packed batches and cached shadow map | Refresh on camera/caster/light/settings changes and at least every 500 ms. Offscreen plants can cast onto visible ground. Animals use blob shadows. |
| Animals and visitors | `actors.js`, `actor-view.js`, `animals/animal-pools.js`: conservative per-agent culling before expensive poses, instanced models per species/variant, active-range uploads | Initial scan spans all view agents; detailed preparation scales with visible agents and behavior/contact complexity. Animal geometry lacks comparable distant LOD. Followed animals bypass culling. |
| Animal neighborhoods | `js/sim/animal-positioning.js`, `animals.js`, behavior helpers | Spacing has reused spatial buckets, rebuilt twice per substep. Dense buckets approach all-pairs work. Several social, family, alarm and hunt helpers still search the whole population. |
| Simulation/render synchronization | `Renderer.refreshWorld`, `flora-changes.js` | Day/height/edit signals schedule row bands and one plant region per frame. Broad array comparison discovers exact changes; queued stale tiles preserve pending work. Local changes still incur broad discovery and region replay. |
| UI and tools | `js/ui/ui.js`, `js/tool-actions.js`, `js/undo.js` | Top bar/inspector/minimap/overlays already throttle work. Undo copies saved world arrays per stroke and retains up to 15 strokes. Fire rendering scans every tile each frame. |

The scene graph represents model/region batches rather than one node per organism or animal limb. Hundreds of attached meshes were measured. Three.js still traverses nodes and updates matrices, but this audit did not establish traversal as a dominant cost.

## Coupling and duplicated work

Flora snapshots authoritative arrays so that rendering does not depend on every ecology/tool writer reporting exact changes. That is robust, but repeats global comparisons while processing queued regions. Within a dirty region, unchanged tile records are replayed into source matrices/colors; view and shadow batches may then copy those matrices again. The representations serve different purposes, so eliminating one requires a measured storage/lifetime design.

Actors consumes detailed `Flora.treeSites` support. Region replay constructs new `CanopySite` objects even for unchanged cached tiles, which can trigger route rebasing and lazy support preparation. Stable identity may remove work, but its causal benefit needs an A/B test. This finding is tied to the audited monkey implementation, which may be superseded.

Spacing already provides spatial buckets and Wildlife already has an ID map, while some behavior helpers independently scan/filter agents or count group membership. Reuse must preserve candidate ordering, tie decisions, radius coverage and random calls. A hunt query reaching 12 tiles cannot use only the spacing system's immediate neighboring buckets.

Spacing bucket arrays are reused but entry records are allocated twice per substep. `viewAgents` concatenates arrays each render frame. Canopy preparation creates many temporary vectors, quaternions and arrays. Allocation is visible in sampled profiles; a steady allocation rate and GC pause distribution were not established.

## Measured findings

### Vegetation update amplification

In the dense node fixture, a small edit regenerated four tiles while processing a 2,304-tile region. Its first region took 4.32 ms. A no-change `Flora.rebuild` averaged 1.62 ms. Production does not call this every frame; existing scheduling already limits work.

In the dense stationary 4× CPU-throttled browser trace, plant rebuild averaged 7.14 ms across all frames, with p95 44.4 ms. Change discovery averaged 1.26 ms and source finalization 1.27 ms, nested within rebuild time. Discovery is only part of the hitch.

### Dense forest CPU preparation

| Mode at 4× CPU throttling | FPS | Frame-work p95 |
| --- | ---: | ---: |
| Normal, stationary | 33.0 | 75.4 ms |
| Vegetation drawing hidden, CPU updates retained | 32.3 | 78.7 ms |
| Simulation frozen | 59.5 | 17.1 ms |

The hidden-vegetation result supports CPU/preparation as a major limitation in this constrained local case. Freezing simulation removes growth/terrain changes and changes animal movement/pose costs as well as removing simulation calls; its gain cannot be attributed exclusively to wildlife simulation.

Normal stationary phase means were plants 7.14 ms, actors 6.94 ms, terrain 1.65 ms, visibility 1.10 ms, shadow sync .40 ms and shadow selection .85 ms. These are instrumented CPU phases, with nested measurements, not a sum of independent frame components.

### Crowded animal spacing

Controlled node tests used initially idle zebras and a .024-game-day step, with spacing active.

| Animals | Spread population median step | Packed population median step |
| ---: | ---: | ---: |
| 128 | .159 ms | .520 ms |
| 256 | .273 ms | 1.808 ms |
| 512 | .580 ms | 7.141 ms |
| 1,024 | 1.194 ms | 25.642 ms |

The packed 1,024-animal case reached 523,776 comparisons, the all-pairs count. This is a stress case. The existing grid performs much better for spread animals; truly overlapping groups cannot be made linear merely by adding a different spatial index while preserving every pair interaction.

### Geometry and cached work

The 512-animal scene submitted about 7.55 million triangles with nine median draw calls. Dense forest submitted about .94 million with 106 median draw calls. Batching is effective; low draw count does not imply low GPU work. Per-scenario hardware GPU timings remain unavailable.

Stationary dense vegetation cached visibility on 93/120 frames; frozen simulation cached all 120. The moving trace cached 83/120. A generic recommendation to add visibility caching would duplicate existing work. Movement did raise shadow-selection CPU mean from about .85 ms to 4.34 ms under 4× throttling.

### Daily work and ecosystem age

Dense node `Game.update` measured median .59 ms, p95 1.28 ms and p99 10.78 ms. The eight daily-tick observations averaged 13.42 ms and reached 26.17 ms. The separate speed-3 CPU profile included substantial spacing, distance-field, plant and resource-classification work; GC represented about 3.2% of self samples in that profile.

Age has no direct unbounded processing loop. Its costs arise through plant/animal density, more complex geometry/contact, species/variants encountered, seasonal updates, and retained maximum pool capacity. Monthly history and the journal are capped. These observations do not prove a long-session leak.

The seeded 15-year restoration run completed 1,800 game days, with world seed 1987 and global random seed 20261015. Aggregate cost was 11.87 ms/game day including scripted actions; final ecological score was 63.2. The balance harness calls `dailyTick` plus ten `wildlife.update(.1)` steps/day and excludes rendering, so this is a behavioral reference rather than production frame timing or an aged rendered snapshot.

## Baseline environment and results

Apple M5 MacBook Pro, 10 CPU and 10 GPU cores, 32 GB; Chrome 155.0.8059.84; Node 22.14.0. The accepted browser session verified `ANGLE Metal Renderer: Apple M5`. It used an isolated profile at 960×600, DPR 1, Fast, shadows on, day cycle off, resolution scale 1, a 60 FPS cap, and disabled adaptive resolution/far selection. Audio and autosave were disabled.

Low Power Mode was enabled. Power reporting showed AC while the battery reported discharging. Load-average access was denied. Browser processes ran under `nice -n 15`; the sandbox denied reprioritizing the separate node CPU run. These conditions and JIT/warmup/order variability limit absolute comparisons.

Each initial browser scene had two rounds, each with 30 warmup and 120 measured frames, diagnostic dt 1/30 second and speed 1. The runs span only about 3.6 game days including warmup, ending at day 23, and do not cross a month boundary.

| Scene | FPS range | Frame-work median range | Frame-work p95 range | Median triangles | Median draws |
| --- | ---: | ---: | ---: | ---: | ---: |
| Empty | 57.8–60.0 | .8–1.1 ms | 2.9–9.4 ms | 45,122 | 8 |
| Young | about 60 | 1.6–1.7 ms | 6.9–13.5 ms | 92,610 | 52 |
| Mature | 57.2–60.0 | 2.5–4.2 ms | 11.0–22.2 ms | 350,207 | 82 |
| Dense forest | 42.5–53.7 | 7.7–9.7 ms | 31.0–46.4 ms | 935,278 | 106 |
| 512 animals | 56.7–59.5 | 5.8–6.6 ms | 12.8–21.4 ms | 7,547,374 | 9 |

These are structural fixtures, not organic age progression: empty keeps terrain/buildings but removes vegetation/wildlife; young uses low density with interior growth .2 and tree age 20 days but mature surroundings; mature uses medium-density planted habitat; dense uses high-density Sumatra; animal stress extends a flat Serengeti herd to 512 idle animals with spacing active. Density fixtures couple vegetation and animals, so isolation/scaling tests matter.

### Memory observations

Attached mesh counts were about 230/299/361/599/301 in the five scenes. These include retained/proxy/zero-count meshes and omit detached source meshes; enabled meshes are not exact frustum-visible counts.

Heap-used snapshots were roughly 29/29 MiB empty, 35/60 young, 69/52 mature, 148/162 dense and 198/210 animal stress. They include fixtures, caches and uncollected objects, sometimes across prior pages. They are not retained heap or VRAM estimates.

A separate dense-fixture resource census, collected in a software-rendered session, found 602 attached nodes, 171 enabled nodes, 784 source pools, capacity for 146,468 source instances versus 74,126 active entries, and about 10.6 MiB of source matrix/color buffers before packed view/shadow copies. Geometry attribute bytes attached to the scene totaled about 16.4 MiB, excluding other storage. The geometry census is usable independently of the rejected software FPS measurements.

The allocation sampling run estimated about 759 MB of cumulative allocations and prominently included terrain construction, Flora rebuild and canopy contact/vector work. It includes fixture restoration and is not a steady allocation rate. Lifecycle inspection found structure geometries removed without disposal in `Renderer.setWorld` and line materials replaced without disposing the previous material in `Terrain.buildLine`. Reproduce resource growth before assigning player impact; these are implementation/lifetime issues, not evidence for a rewrite.

### Measurement caveats

- Frame work includes `gl.finish` in the existing benchmark. It differs from presentation interval/FPS; the measured wait is not a GPU elapsed timer.
- Nested CPU phases overlap. Diagnostic wrappers add overhead.
- Original CPU/GPU aggregate windows were not reset for every scene; their GPU fields are not accepted per-scenario timings. Follow-up sessions fell back to SwiftShader and were rejected/stopped. Do not use those FPS values to represent older hardware.
- The empty fixture's raw initial signature/counts were captured before its diagnostic draw cleared the border. Measured/final border vegetation is zero; the initial/final mismatch is a fixture setup issue.
- Normal and hidden-vegetation runs have matching initial/final ecosystem signatures at 1× and 4× CPU; frozen simulation preserves its signature.
- The short baseline does not establish native-resolution HD 520 performance, month/season tails, long-session retention, GC pause percentiles, steady allocation rate, or audio/autosave costs.

## Evidence versus hypotheses

| Finding | Evidence level | Next useful experiment |
| --- | --- | --- |
| Small changes trigger broad discovery/replay/finalization | Confirmed in code and measured | Compare region-local iteration and unchanged-buffer suppression with the full reference rebuild |
| Visible animal preparation is expensive in dense forest | Confirmed phase cost | Separate contact, rebase, pose and upload costs in the current monkey implementation |
| Stable support identity will reduce actor time | Hypothesis | A/B unchanged sites and changed transforms/topology; retain behavior/contact checks |
| Crowding yields near all-pairs spacing | Confirmed scaling test | Measure safe candidate rejection and record allocation reuse; retain exact pair semantics |
| Whole-population social/hunt queries matter in ordinary saves | Code scans confirmed; importance unisolated | Profile representative family, predator and bird scenes |
| Animal LOD can help the low-end target | Large geometry count confirmed; hardware gain unmeasured | Same save/camera at native resolution on tester hardware, with GPU and visual comparisons |
| General graph simplification/occlusion would materially help | Unconfirmed | Measure traversal/overdraw before adding infrastructure |
| Persistent pools cause a harmful leak | Unconfirmed | Repeated reset/terrain-edit and long-session resource/retained-heap measurements |

## Verification and retained data

Unchanged suites passed: `performance-diagnostics-check.mjs` (13 checks), `frame-loop-check.mjs` (5), `render-boundaries-check.mjs` (23 modules/no dependency cycles), and `animal-culling-check.mjs` (17). The latter confirmed continued offscreen ecology and reduced its targeted preparation measurement from .713 to .165 ms/frame for 638 animals with 17 drawn; that is not whole-game FPS.

[Baseline JSON](performance-baselines/2026-10-15.json) retains normalized browser rows, node/scaling measurements, signatures, environment, resource census, balance output and caveats. Large raw traces and profiles remain in the original local audit artifact directory recorded in that JSON; the repository plan and findings do not require those files to be understood. All temporary audit browser profiles and servers were cleaned up.
