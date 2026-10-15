# 0001 Nature-driven wildlife

Decided 2026-09-26 by Cole.

## Context

Second Growth is a rewilding tycoon, first set in the Pacific Northwest. It was inspired by PolyPine but meant to be "more natural". It plays like Zoo Tycoon with brush-style planting, in an isometric 3D view with terrain elevation. It should look good without trying to look realistic.

## Decision

Players never buy upgrades to make animals reproduce or spread. They build habitat and introduce a few starting animals. Wildlife then grows and migrates in from the surroundings according to habitat rules.

The early game should be strategically tight (the economy starts at $30k).

## Consequences

- A new feature that grows wildlife must work through habitat, food, cover, water or pressure, never through a purchase.
- Balance changes go through `js/data/*.js` and `js/sim/`, checked with `node tools/balance-sim.mjs restore 15` before and after.
