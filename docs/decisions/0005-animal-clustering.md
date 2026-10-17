# 0005 Animal travel and crowding across maps

2026-10-17. Cole requested an audit of unnatural clustering on every map, extending
previous fixes for elk.

## Findings

The seeded shared-selector audit covers all 200 regional roster entries across
seven maps. Before the fix, 63 ground-species entries could not leave a small
habitat patch across otherwise passable dry ground. Elk already could. Long-range
roaming ignored occupied destinations and incoming animals. Fixed-size herds were
partitioned by population rank, joining geographically distant arrivals and
reshuffling when a neighbor left. Unlimited herds/schools shared a fixed formation
radius regardless of population and model size.

These are simulation decisions, separate from model overlap or canopy animation.

## Decision

Extend the elk travel policy to non-reef ground movers for roaming and natal
dispersal. Passable, non-burning dry ground may connect suitable patches; it
supplies no suitability or carrying capacity. Shared terrain rules still enforce
buildings, deep water and species-specific fences. Water and canopy specialists
retain their existing corridor requirements. This supersedes the elk-only scope
in 0003-elk-overland-travel.md. Canopy locomotion ownership is unchanged.

Use a sparse destination occupancy field per roaming/flight-sampling decision,
including conspecifics already en route. Weight suitable destinations by available
room rather than making crowding an impassable barrier. The existing local walking
selector and physical spacing remain in place. Each animal contributes a bounded
stencil (radius at most three tiles); the roaming BFS retains its world-size bound.

Keep non-cervid herd membership stable using the existing saved `herdOf` field,
with living nearby leaders, the existing maximum membership and a distance limit.
Followers abandon stale independent trips. Expand formation slots with population
and body radius so a large herd/school can occupy more area. Existing cervid
families, bachelor groups, harems and mother/young links keep their own rules.
No population, feeding, habitat-capacity or predator formulas change. Existing
saves acquire the corrected behavior on subsequent movement decisions.

## Verification

- `node tools/animal-clustering-check.mjs`: all 200 regional entries; dry-gap travel,
  burning barriers, occupied and reserved destinations, local herd membership and
  size limits, stable membership after removal, stale follower trips, expansion of
  old school slots, local/long flights and specialist corridors. `--audit` reports
  selector failures without asserting the new behavior for before/after comparison.
- `node tools/animal-clustering-soak.mjs`: real restored landscapes on all seven
  maps, seeds 1987 and 91, 20 simulation days each. Represents every species with
  suitable habitat (PNW 32/34, all others full rosters); checks finite/in-bounds
  positions, reef shore boundaries and prolonged stalled walking. Seasonal/population
  dynamics are checked separately; this is a movement soak, not an ecological census.
- Existing cervid behavior (28), animal positioning (26), animal life (11) and
  wildlife behavior (15) checks pass.
- `node tools/balance-sim.mjs restore 15` completed before and after. These runs
  are unseeded and their populations/timings should not be treated as an A/B result.

The audit does not claim visual review of every species or eliminate natural
aggregation at scarce food, water, nesting sites and connected treetops. Meals,
canopy structure and social behavior still legitimately gather animals.
