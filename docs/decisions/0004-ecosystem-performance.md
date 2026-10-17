# 0004 Ecosystem performance

Target and visual tradeoffs decided 2026-10-15 by Cole. On 2026-10-17 Cole asked for the plan to be carried out. Output-preserving work on loading, P1, P3 and P6 has landed, and distant animal models (P4) are live after Cole reviewed them; P2 and P5 have not (see the plan's [Progress](../performance-plan.md#progress)).

## Context

Second Growth becomes slower as vegetation and wildlife accumulate. The October 15 audit found substantial existing instancing, geometry sharing, visibility caching, LOD and update scheduling. Remaining measured costs include vegetation change discovery and region replay, visible animal pose preparation, crowded animal spacing, and large submitted geometry counts.

The audit covers revision `0765363aca9b9495f519f1dd0cb27b5bbaa865cb`. It does not establish current performance on an Intel HD 520. The [audit](../performance-audit.md) preserves architecture, measurements and limitations; the [implementation plan](../performance-plan.md) defines milestones and regression gates. [Baseline JSON](../performance-baselines/2026-10-15.json) preserves numerical results for other agents.

## Agreed target and tradeoffs

- Target **30 FPS at native screen resolution on Fast** on Intel HD 520-class laptops in a mature ecosystem.
- Simplifying distant plants, distant animals and shadows is acceptable. Preserve close-up detail.
- Preserve ecological simulation accuracy and gameplay. Rendering quality must not change habitat capacity, population, birth, death, migration, growth, predation or offscreen ecology.
- Cole has a tester who can occasionally run the game on older hardware. Use repeatable scenes and short test instructions so that feedback can calibrate local benchmarks.

Native resolution is part of the target. Record the browser viewport, device pixel ratio and actual render-buffer dimensions. A result achieved by reducing resolution must be labeled with that resolution rather than reported as meeting the native-resolution target. Keep production automatic quality behavior in separate measurements from fixed-setting comparisons.

The exact tester hardware, native resolution and reference save still need to be recorded. The plan proposes a frame-time tail threshold and scene matrix; those details are not yet agreed product requirements. The target is an objective, not a claim that the current game meets it.

## Proposed architecture

Keep the typed-array world, simulation rules and clock, pooled instancing, geometry caches, and separate camera/light visibility paths. Reuse the existing diagnostic harnesses. Address measured work in small changes before considering broader infrastructure.

1. Establish repeatable reference scenes and obtain one target-hardware baseline.
2. Reduce vegetation change-discovery, replay and upload amplification.
3. Profile animal preparation and preserve unchanged canopy support/cache lifetime where compatible with current monkey work.
4. Reduce crowded animal neighborhood and repeated population-query work while preserving behavior and iteration semantics.
5. Prototype distant animal LOD and appropriate far vegetation/shadow detail. Evaluate these against the native-resolution hardware target alongside CPU improvements.

There is no evidence supporting a whole-engine rewrite, ECS conversion, worker migration, general spatial streaming system or blanket reduction in simulation cadence. Reconsider any of those only with a specific measured bottleneck and a separately reviewed design.

## Consequences

- Benchmark changes against the [baseline protocol](../performance-plan.md#measurement-and-comparison-rules), recording CPU work, presentation intervals, GPU time where valid, geometry, population and memory.
- CPU throttling is a CPU stress test, not an HD 520 emulator. Software rendering is not an HD 520 performance substitute.
- Do not reduce populations or skip offscreen ecology to meet a rendering target.
- Each milestone must have correctness checks, measured acceptance criteria, and an independent rollback. Expected speedups in the plan are experiment targets, not demonstrated results.
- The canopy locomotion decision was removed in the audited revision while monkey work was being reconsidered. This performance proposal does not restore it or prescribe a locomotion design. Reinspect the current canopy/monkey implementation before changing its cache or support contracts.
- Keep this decision, the audit and the milestone status current as Cole reviews proposals and implementations produce evidence. Do not silently turn a hypothesis into an accepted constraint.
