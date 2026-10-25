# Ecosystem performance implementation plan

Proposed 2026-10-15. On 2026-10-17 Cole asked for the plan to be carried out, after reports of lag on slower computers and slow loading; see [Progress](#progress) for what has landed. Read [decision 0004](decisions/0004-ecosystem-performance.md) and the [audit](performance-audit.md) before making changes. The hardware/visual target is agreed; milestone choices and numerical improvement gates below remain proposals for review.

## Target and constraints

Cole's target is **30 FPS at native screen resolution on Fast on Intel HD 520-class laptops in a mature ecosystem**. Distant plants/animals and shadows may be simplified; preserve close-up detail and ecological behavior. Cole has an occasional hardware tester.

Preserve the typed-array world, ecological update order/clock, habitat-driven population rules, saves/Undo, species/sex/season/juvenile identity, collision sizes, offscreen ecology and selected/followed-animal behavior. Keep main-view and shadow visibility separate. No population caps, skipped ecological updates or hidden resolution reductions to pass the target.

The removed canopy locomotion decision must not be restored by implication. Reinspect the latest monkey implementation and coordinate shared files before testing support-lifetime changes. Stable support identity is an optimization hypothesis, not a prescribed locomotion design.

## Component responsibilities

- **Game/World and tools:** own ecological state and mutations. Any future changed-tile/field records should be coalesced at existing completion boundaries and identify the world epoch. Preserve RNG calls and authoritative ordering.
- **FloraChanges and Flora:** retain comparison against world arrays as a reference/fallback; discover and schedule dirty regions without losing changes while work is queued. Distinguish topology, transform/growth and color/season changes only where that reduces demonstrated work.
- **PlantPool:** own source capacity, changed buffer ranges, source revisions and conservative bounds. Avoid changing revisions when represented data is unchanged.
- **PlantView and PlantShadows:** own independent camera/light membership and packing. Reuse immutable geometry facts; do not substitute view culling for shadow culling.
- **Canopy support and Actors:** preserve detailed support independently of drawing LOD, with explicit identity/transform lifetime. Continue visible animation and contact correctness.
- **Wildlife:** own IDs, species/group membership and bounded neighborhood queries; preserve candidate/tie order and query radii.
- **Renderer:** retain frame/surface/plant scheduling, settings, submission and diagnostics. A region count is not a constant time budget; measure expensive units before changing budget granularity.

Introduce no general event framework, ECS, worker or spatial streaming layer as part of these milestones. A local revision or index should solve a measured problem and have a clear owner.

## Measurement and comparison rules

Use the same revision/seed/save, camera path, speed, viewport, DPR, render dimensions, quality, shadows and LOD settings before/after. Record CPU model, GPU string, RAM, OS, browser, power state, Low Power Mode and background load. Reject software rendering when claiming hardware performance.

Separate fixed-setting diagnostic comparisons from production adaptive settings. The current benchmark explicitly disables adaptation (far vegetation is no longer adaptive, see [0022](decisions/0022-far-vegetation-by-screen-size.md)); it must expose and report the intended settings before it can validate the agreed low-end Fast experience. Do not claim native resolution if the backing render dimensions are reduced.

Use five representative scenes: empty, young, mature, dense forest and large animal population. Include naturally aged saves, stationary/pan/rotation/wide/close/follow paths, speeds 0/1/3, day/month/season boundaries, tool strokes with real Undo, and world resets. Keep geometry/population fixed when isolating a renderer change.

Proposed comparison gate: at least 30 seconds per normal timing run and five alternating before/after pairs. Use actual recorded frame counts; 1,800 frames at 60 FPS takes 30 seconds, while a slower device needs longer for the same sample count. Export raw intervals and CPU work with p50/p95/p99, draw calls, triangles, source/visible instance counts, attached nodes, and GPU timing where available. Reset all windows after warmup. Count/query disjoint samples and report missing metrics as null with a reason. Profile allocations separately from frame timing.

For an accepted optimization, aim for improvement in at least four of five pairs, no more than 5% unrelated median-work regression or 10% unrelated p95 regression, and unchanged deterministic ecological outcomes/RNG progression. Inspect per-pair noise before accepting small changes. These statistical gates are proposals, not established product requirements.

Proposed hardware tail criterion: sustained presentation around 30 FPS with p95 frame interval no worse than 50 ms in the agreed mature reference scene. Cole has agreed the 30 FPS/native/Fast target, but not this tail criterion or the dense-stress acceptance level. Record and review those before declaring target compliance.

## Progress

2026-10-17, all in the working tree on top of `0765363`. Every change below produces the same output as before: identical plant instance signatures (`tools/flora-rebuild-bench.mjs`), identical bytes for all 17,950 generated plant geometries, identical herd positions (`tools/spacing-bench.mjs`) and an identical seeded 15-year `balance-sim restore 15` run (`Math.random` seeded 20261015 through `node --import`; the harness itself is unseeded, so unseeded runs always differ).

- **Loading (not in the original audit).** `tools/boot-profile.mjs` times each loading-screen stage. A cold boot at 4× CPU throttling spent about 3 s in the first frame, mostly generating plant models: three.js `mergeVertices` and `GeometryIndex` both built one string key per vertex. `geometry/weld.js` (`weldVertices`, the same result as `mergeVertices`, checked by `tools/weld-check.mjs`) and a numeric hash in `GeometryIndex` cut the first frame from 2.83 s to 2.19 s at 4× (three alternating pairs), and a full plant build from about 500 to 320 ms in node. The remaining first-frame cost is spread out: terrain setup, the rest of plant generation and shader compilation (a second visit is faster because Chrome caches compiled shaders).
- **P1, first step.** Rebuilds visit only the changed regions' tiles. `PlantPool.end` leaves a buffer alone when its instances are exactly those already drawn, so an unchanged buffer no longer re-uploads or makes the view, shadow batches and shadow map redo their work. A small edit went from 481 plant-version bumps to 33, and a day's growth from about 1,100 to 200–340. In the browser (dense Sumatra, Fast, 4× throttle, two alternating pairs) plant preparation fell from 29.1 to 27.1 ms mean and 88.9 to 77.2 ms p95 at speed 1, visibility work halved, and frame work at speed 3 fell from 146 to 134 ms. `PlantShadows.sync` now tells the view batch when a buffer switches shadow path; it used to rely on every rebuild bumping the revision. Remaining: region replay when nearly every tile has grown, which dominates at speed 3. Smaller rebuild units are the next experiment.
- **P3, spacing.** Squared-distance rejection before the square root, and entry records reused between rebuilds. Packed herds: 512 animals 6.2 → 4.0 ms, 1,024 21.0 → 13.3 ms per step. Spread: 1,024 animals 1.14 → 0.63 ms. Packed herds remain all-pairs by design. Social, family and hunt queries are untouched.
- **P6, disposal.** `Renderer.setWorld` disposes building geometry and `Terrain.buildLine` disposes the old line material. Over 20 new games, live GPU geometries grew from 43 to 140 before and stay at about 70 after.
- **P4, distant animal models (live in [#52](https://github.com/nature-tycoon/second-growth/pull/52); Cole approved the before/after sheets).** Animals shorter than 32 CSS pixels on screen draw a vertex-clustered copy of their own model (`animals/animal-lod.js`). The copy is a second instanced mesh in the same species pool and shares its material, motion data and shader. The detailed geometry stays the source for canopy support, contact, head reach and picking, and the selected and followed animals always draw in detail. Clusters never merge across body parts, pivots, connected pieces or light/dark tones, so animation, sex/season/juvenile variants (each has its own pool) and zebra stripes carry over; a 48-pixel switch washed out the stripes. Across all 219 species/variant models, outlines move at most 0.44 of a 1/32-body-length cell. In the browser, the 512-animal Serengeti herd at zoom 0.65 submits 7,547,374 → 2,991,232 triangles for the whole scene (animals 7.44M → 3.14M, 58% fewer), with the same 9 draw calls. At zoom 4.5 every adult is detailed and 0.006% of pixels change. All-species scenes change in under 0.04% of pixels. Each species builds its distant model the first time one is small on screen (about 3 ms on average). `actors.fauna.farModels = false` reverts it; `tools/animal-lod-check.mjs` covers it. Still open: the 20% GPU/presentation p95 gate on tester hardware, and the switch is in CSS pixels, so each cluster is about 2 device pixels on a Retina screen.
- **P2, first step: climbing primates (2026-10-18).** In a dense crown, a primate's frame went mostly to body-clearance tests: each outline has 700–860 points, and the pose search tests them against nearby wood up to a few hundred times a frame. `outlineFitsWood` now groups an outline's points into spheres of 16 once (callers may move an outline only rigidly) and skips each sphere that can't reach a limb. `barkGrip` checks for buried candidates nearest first instead of in limb order, and `woodSurface` takes its contacts from a heap instead of sorting several hundred. Same answers, including ties: identical results on 16,000 random clearance and 20,000 random grip cases, and identical end positions, poses and grips (`tools/canopy-bench.mjs` signature). Twelve capuchins: `Actors.update` 18 → 7 ms mean, 45 → 25 ms p95; howlers/spiders and the Sumatran apes about 1.5–2× faster. Still open: a crossing to another tree plans its route in one frame (`crownRoute`, about 30 ms for a capuchin, mostly `woodSurface` and `clearRoute` sampling), which is what the p95 still shows.
  - **Crossings (2026-10-18).** A crossing to another tree still plans its whole route in one frame (`crownRoute`). Same answers, cheaper: each limb's ring of 17 contacts enters `woodSurface`'s heap as one entry under a lower bound on its distance and is built only if the search reaches it (most rings never are); the nearest limbs are picked without building a contact per limb; the buried/crowded test skips limbs that a distance bound proves can't change the score; the fork pass stops once a pass moves nothing; limb end holds are cached per site and body (`CanopySite.endpoint`, so a monkey's repeat crossings reuse them); and `clearWalkerJump` keeps one shrunk flight outline per body instead of regrouping a new one every call. Same `tools/canopy-bench.mjs` signatures for capuchin, congo, howler/spider and orangutan/siamang. Capuchins: `crownRoute` median 14.4 → 8.0 ms, max 27 → 18 ms; `Actors.update` p95 11 → 7.7 ms, max 31 → 21 ms (4 alternating runs each). Still open: the remaining crossing cost is spread over `clearRoute`'s 0.025-unit samples (each a `woodSurface` search) and the end holds of every limb in both crowns for a body's first crossing. Spreading the plan over frames would remove the hitch but changes behavior.
- **Review (2026-10-23).** [Performance review](performance-review-2026-10-23.md): no overall regression since `f14cae3`. Young climbing primates rebuild their clearance outline every frame (7–10× an adult's cost; open). Plants redraw every region every game day, and `FloraChanges.find` rescans the map on every continuing region frame (open, P1). The daily environment update takes about 21 ms on Sumatra (P5). The review also sets per-part frame budgets, measured with `tools/play-profile.mjs`. Fixed the same day: young climbers (same canopy signatures; juveniles 7–8× cheaper) and footstep-driven plant redraws (plants take up trail wear once a game day; 473 → 54 rebuilds in 8 s, and starved regions catch up). Growth and shade redraw only the tiles they change (exact); drawing growth in size steps was prototyped and dropped. Open: top speed is bounded by one region per frame.
- **Not started.** P5. The tester hardware, reference save and tail criterion are still open.

## Milestones

Each stage is independently reviewable and reversible. Keep correctness fixes, storage changes and quality tradeoffs separate so their effects can be attributed. Do not commit/push without Cole's instruction.

### P0 Establish a trustworthy baseline

Status: partly done (boot, plant rebuild and spacing benches; see Progress). Reference save and tester run outstanding. Complexity low/medium; gameplay risk low; no visual/ecological change.

Reuse `tools/ecosystem-profile.mjs`, `gameplay-benchmark.mjs`, `performance-fixtures.mjs`, `plant-prep-measure.mjs` and signature helpers. Add only missing scene selection, raw timing, post-warmup counter resets, render-setting reporting and memory metadata. Include a stable mature save suitable for the tester. Keep CPU throttling separate from hardware labels.

Acceptance: fixtures restore repeatably; frozen mode preserves signatures; normal/vegetation-hidden modes retain identical ecological results; measurements contain only their intended window; software fallback is rejected; per-frame intervals distinguish CPU work from scheduling; scripts clean up browsers/servers/profiles. Obtain tester hardware/resolution and an initial native/Fast run. Run performance diagnostics, frame loop, render boundaries and fixture checks. Rollback is diagnostic-only.

### P1 Reduce vegetation update amplification

Priority: high measured CPU opportunity. Complexity medium/high; invalidation risk high; intended visual/ecological change none.

First test region-local iteration and unchanged source/finalization/revision suppression with the existing comparator. If broad discovery remains significant, audit mutation paths and introduce coalesced changes while keeping comparison-mode validation. Consider smaller rebuild units or stable slots only if replay remains dominant; measure extra batch/packing costs.

Proposed acceptance: at least 50% lower plant CPU for single-region edits; at least 25% lower plant rebuild p95 on dense growth frames and 15% lower total constrained dense-scene p95. Preserve counts/matrices/colors against full rebuild, stationary cache effectiveness, adjacent features, water/height/season/Undo/reset updates and edits arriving during queued work. Review any draw/triangle increase over 5%. Use plant-performance, plant-replay, plant-view, plant-shadow, ground-patch and plant-cache-browser checks. Preserve a reference/fallback path for independent reversal.

### P2 Profile animal preparation and preserve unchanged support

Priority: high dense-forest actor cost; specific savings unproven. Complexity medium; contact/animation risk medium/high; intended visual/ecological change none.

Profile contact, rebasing, pose, packing and allocation in the current canopy implementation before modifying it. Where compatible, retain unchanged support identity/prepared data and invalidate only changed geometry/transforms. Test reused view iteration and spacing entry records separately so allocation wins are attributable.

Proposed acceptance: at least 20% lower actor preparation mean and 30% lower sampled steady allocation in a representative canopy scene; at least 10% lower total dense-scene p95 or an explicitly documented smaller ceiling. Same unchanged support stays reusable, while growing/removing/moving trees, transfers and selection/following retain correct contact and no new stalls/sliding. Run current canopy support/route/grip/reveal, culling and species-motion checks. Roll back individual lifetime/allocation changes independently.

### P3 Improve crowded animal queries

Priority: high for dense populations, modest for sparse ones. Complexity medium; behavior risk medium/high; intended visual/ecological change none.

Measure spacing rebuild/separation and family/hunt/bird queries independently. Reuse IDs, species/member counts and correctly bounded spatial queries where equivalent. Preserve pair/candidate order; broad-phase rejection must respect actual extents/radii. Do not promise linear complexity for truly overlapping groups or drop interactions to pass a benchmark.

Proposed acceptance: spread 128→1,024 scaling remains near linear; at least 25% lower step p95 in a representative crowded 512-animal herd and 30% lower targeted social-query CPU where profiled. Compare candidates/pairs to brute force and preserve deterministic positions/outcomes/RNG; review any proposed floating-point tolerance explicitly. Run positioning, cervid, animal life/behavior, bird/primate, salmon-bear and movement/stall checks. Change/revert one query family at a time.

### P4 Establish geometry budgets and distant LOD

Status: distant animal models live (see Progress); far vegetation on for every computer when zoomed out ([0022](decisions/0022-far-vegetation-by-screen-size.md)); hardware GPU gate and triangle/shadow budgets outstanding. Priority: part of the agreed native-resolution target, alongside CPU work. Complexity medium/high; distant visual risk medium; ecological change none. Schedule a bounded prototype once P0 provides a reference save; tester availability need not delay all local investigation.

Compare existing far vegetation/shadow settings before building new models. Prototype screen-size animal LOD in existing Fauna/model pools, preserving near detail, identity, picking, animation/contact and independent detailed support. Use target-hardware samples to set triangle/instance/shadow budgets; no universal budget is established by the M5 measurements.

Proposed acceptance: at least 50% fewer submitted animal triangles in the mass-animal wide view and 20% lower GPU or presentation p95 on target hardware, with current near silhouettes and close-up detail. Inspect wide/close/rotation transitions, species/sex/juvenile/season identity, transparent ordering, selected/followed animals and shadows. Native/Fast mature performance is the product target; geometry savings alone do not establish it. Use animal-model/detail/variant, far-model, geometry-index, culling and targeted release-browser checks. Revert via a rendering/model-selection switch without touching ecology.

### P5 Reduce remaining day and surface work

Priority: depends on profiles after preceding work. Complexity medium/high; ecology risk high for authoritative caches; no intended gameplay change.

Start with render-only fire lists, surface-channel revisions and safe fingerprint/structure work. Cache simulation-derived fields only when all input predicates/threshold crossings are tracked exactly. Retain daily resource/season/traffic semantics. Do not split authoritative ecology across frames without a separately reviewed atomic publication design.

Proposed acceptance: at least 30% lower affected day/terrain phase p95; no stale water, shade, trail, suitability or Undo data. Run water/watershed, plant ecology, tool-actions, contracts and consistency checks. Run `node tools/balance-sim.mjs restore 15` before and after any ecological change, with reproducible randomness and reviewed balance results. Roll back by field/path.

### P6 Resource ownership and retention

Priority: small disposal fixes may precede other work; cache eviction requires a demonstrated retention problem. Complexity low for missing disposal, medium for cache policy; FPS improvement unproven.

Reproduce the structure/line disposal gaps and correct resource ownership without disposing shared buffers. Distinguish per-world resources from reusable models. Investigate high-water pool retention with a soak before introducing eviction.

Proposed acceptance: 20 repeated reset/terrain-edit cycles reach a resource plateau; after warmup and GC outside timed windows, retained heap/resource growth stays below 5% over the final ten identical cycles. No missing shared geometry or sustained clearing/repopulation thrash. Run browser-save, render-boundary and relevant world/context checks. Separate disposal and eviction work for independent rollback.

## Occasional tester procedure

1. Record the exact CPU/GPU, RAM, OS/browser, native resolution, DPR, power state and render dimensions. Confirm hardware graphics rather than a software fallback.
2. Use the same provided mature save and camera path at native resolution on Fast. Capture baseline once, then test milestone builds against that same fixture.
3. Run a short settled view, pan/wide zoom, close-up/followed animal and tool stroke. Record FPS/frame-time percentiles and settings; preserve any automatic-quality transitions in the report.
4. Add the dense forest and large-animal stress scenes when the change affects them. Label stress results separately from the mature target scene.
5. Return the small diagnostics file plus brief visual observations. Avoid asking the tester to run the whole map/quality matrix for every milestone.

## Review items

- Record tester hardware/native resolution and select the mature reference save.
- Agree frame-time tail and dense-stress expectations before claiming target compliance.
- Confirm the first implementation scope after reviewing this plan; documentation does not start implementation.
- Reassess canopy-dependent proposals against the latest monkey work and coordinate shared files.
- Update milestone status with measured before/after evidence, regression outcomes and reasons for scope changes.
