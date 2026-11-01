# 0003 Elk travel between separated habitat patches

## Context

Elk arrive from the northern boundary. The long-distance roaming search formerly
required every route tile to have positive habitat suitability. Physically
passable pasture and bare ground therefore isolated the northern creek habitat
from restored interior meadows. A family could follow its leader correctly but
never discover a route out of that patch.

## Decision

Elk may cross passable, non-burning dry ground when roaming to another suitable
habitat patch. The existing destination threshold and habitat-weighted selection
remain unchanged. Crossing pasture does not make it habitat or increase carrying
capacity. Shared terrain rules still block fences, buildings, ponds and rivers.
Other species retain their existing habitat-corridor requirements.

Reuse the existing roaming search, remembered trip, herd following and calf
rejoining. Rutting bulls retain their existing harem behavior. No new state or
save migration is needed, and existing saves use the corrected search on their
next roaming decision. The search retains its existing world-size bound and
reusable BFS buffers; it runs on occasional leader decisions, not every frame.

## Verification

`node tools/cervid-behavior-check.mjs` checks a north-edge cow/calf family crossing
zero-suitability pasture into an interior meadow, barriers and openings, refusal
to settle without another suitable patch, and unchanged deer corridor behavior.
The existing family, bachelor and rut regressions remain part of that check.
Also run the positioning, animal-life and animal-behavior checks, and the required
before/after `node tools/balance-sim.mjs restore 15` runs.

## Gotcha: a calf napping when its mother sets off (2026-10-31)

A family leader slows for a lagging calf or member (`rangePaces` in `sim/animal-trails.js`) on an
overland journey (`a.trip`) as well as on a home-range trip. It used to be home-range trips only,
so a mother that left on a journey while her calf was resting outran it: the calf wakes only
once she is a couple of tiles off (`cervidNeedsRejoin`), and since walkers turn from the way they
face before moving off (0023), it fell 3.7 tiles behind on the return trip in
`cervid-behavior-check` (limit 3.5). Now 3.3.

With shared steering (0025) a walker also eases up to speed, so the calf still fell 3.65 tiles
behind (4.07 on the steering branch alone). While a lagging member is still standing she now
slows to a quarter pace, not 0.7, since a calf that hasn't set off can't close any gap: 3.42.
