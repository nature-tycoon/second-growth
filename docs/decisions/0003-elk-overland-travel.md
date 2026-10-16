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
