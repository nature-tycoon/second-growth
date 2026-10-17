# 0008 Longer carcass window for scavengers

2026-10-17. Cole asked for longer-lasting carcasses to increase scavenging.

## Decision

Extend the post-hunter-meal decay window from 7–11 to 21–33 simulation days.
The total lifetime remains the original hunter's feeding time plus that window.
The same random draw determines the window, preserving the number/order of random
calls at carcass creation. The existing `max` field continues to drive the final
30% visual fade without a renderer change.

Keep the size-based finite meal budget, hunger threshold, detection radii, five
concurrent feeder check, arrival-time meal consumption and 16-carcass limit.
Longer availability creates time for late visitors; it does not replenish food or
require another prey kill. Small prey still gets eaten on the spot. Existing
expiration/pause behavior and transient (unsaved) carcass state are unchanged.
New kills use the extended lifetime; already-created carcasses keep their timers.

## Evidence and checks

`node tools/scavenger-arrival-check.mjs --audit` reports the baseline without
requiring arrivals; running without `--audit` asserts that each visitor reaches
and consumes exactly one real meal through ordinary movement. Seed 16203 gives:

| Visitor | Initial distance (tiles) | Old lifetime | New lifetime | Arrives at day |
| --- | ---: | ---: | ---: | ---: |
| Raccoon, PNW deer kill | 21 | 10.50 | 25.70 | 19.35 |
| Coyote, PNW deer kill | 21 | 10.50 | 25.70 | 11.10 |
| Vulture, Serengeti buffalo kill | 38 | 13.13 | 33.49 | 26.80 |

Zero of three distant visitors fed before the change; all three do afterward.
These controlled scenes test travel and decay, not a universal scavenging rate.

The animal-life check now also verifies persistence beyond 15 days, eventual
removal, pause behavior, no food creation while waiting and the existing count
limit. Its existing depletion/arrival checks still verify that exhausted and
expired kills cannot supply meals. The moments and Challenging ecology checks
verify hunt/scavenger scenes and real contact catches.

Required `balance-sim.mjs restore 15` runs before and after use a scratch
`Math.random = mulberry32(73621)` import. Both complete restoration goals and retain
predator/prey populations. Different later food-web trajectories are expected;
these are not output-preserving performance comparisons.
