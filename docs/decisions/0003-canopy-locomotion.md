# 0003 Canopy locomotion: the simulation owns movement

Started 2026-10-14. Monkeys first, behind a per-species flag.

## Context

43 of 184 commits had patched canopy movement symptoms. An audit found the root cause is split authority between the simulation and the renderer:

- The sim moves tree animals tile to tile (`passable` = treeG > .45, `stepToward` at `climbSpeed`).
- The renderer (`actors.js` → `canopy-motion.js` `canopyStep`/`crownRoute`, `canopy-support.js` `anchor`/`woodSurface`) chases that position along branches every frame. It reconciles by catching up, teleporting after a 3-tile gap, and replanning blocked routes.
- Offscreen animals don't climb at all.

## Decision

Make the simulation the single authority for where an arboreal animal is, and make the renderer only read that state.

1. One canonical tree skeleton with explicit parent links.
2. A per-tree navigation graph, plus an inter-tree link mask.
3. Two-level pathfinding: macro (tile/tree) and micro (skeleton).
4. An authoritative locomotion state machine in the sim tick (walk, climb, fork, leap, land, recover) that writes `a.x`/`a.y` and a new `a.elev`.
5. Rendering and IK only read that state.

Cole's decisions:

- Navigation is a pure module the simulation depends on, with no render dependency.
- One canonical skeleton per tree, shared by leafy and winter-bare geometry. Dry-forest deciduous trees currently swap skeletons, so that has to go.
- Every monkey species may come down from the trees for now, but ground descent is a per-species capability so it can be restricted later.

## Consequences

- Don't patch individual monkey glitches in `canopyStep` or `anchor`. Build toward this plan.
- Get navigation reliable before working on animation realism.
- Measure with `tools/canopy-soak.mjs` (and `canopy-soak-metrics.mjs`), which runs the real Flora and Actors headless. Compare new work against the current system's baseline with `--compare`. The baseline is meant to live at `tools/canopy-baselines/render-v1.json`. As of 2026-10-14 the harness and baseline weren't committed yet.
