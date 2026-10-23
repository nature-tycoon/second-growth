# 0010 Repeated wildlife routes and visible game trails

2026-10-17. Cole requested visible, accurate animal trails, with movement that
concentrates meaningful travel rather than painting the landscape indiscriminately.
During preview review Cole requested more winding trails. A follow-up the same day
replaced tile-edge ribbons with continuous walking and recorded foot traffic, because
the ribbons still showed grid corners where animals had not walked.

## Findings and scope

The previous `trod` field added 0.05 every day beneath stationary large grazers.
Terrain rendering tinted an entire occupied tile. It recorded neither crossings
nor direction, so long rests made patches while actual journeys left gaps.
Frequent new roaming destinations also scattered travel.

Explicit large terrestrial mammal profiles now define trail wear. Hoofed mammals
and tapirs can remember resource sites; large bears/canids/felids/hyenas leave
lighter traffic on their existing hunting/patrol/water routes. Tiny wildlife,
canopy animals, flyers, aquatic/reef animals and ground-feeding birds do not paint
game trails. This is a selected game scope, not a claim that other animals never
make trails. Seasonal migrating herds retain migration rather than acquiring
resident resource circuits. Existing territorial home cores keep their ownership.

Ecological basis: [USFS terrestrial resources account](https://www.fs.usda.gov/Internet/FSE_DOCUMENTS/stelprdb5389663.pdf)
records deer/elk trails leading to crossings and running beside barriers;
[USFS wildlife response research](https://research.fs.usda.gov/rmrs/projects/wildliferecnoise)
uses game trails for large-mammal observations. [Elephant trackway research](https://pmc.ncbi.nlm.nih.gov/articles/PMC3391441/)
discusses repeated trails for resource access; [hippo feeding research](https://pmc.ncbi.nlm.nih.gov/articles/PMC12334000/)
observes paths between resting and feeding areas. These support repeated resource
travel and shared corridors, not the numerical distances, curves or rates below.

## Responsibilities

- `animal-trails.js` in data owns the species/guild selection and wear weights.
- The simulation module records actual movement before physical spacing, fades
  unused traffic, selects resource sites and reuses learned routes. Existing
  passability, fire checks, food queries, family behavior and BFS remain in charge
  of terrain access, feeding and relationships.
- `animal-walking.js` moves ground walkers continuously along their grid route:
  heading turns at a size-dependent rate, tight turns slow or pivot, and a short
  look-ahead rounds open corners. A swept segment test (both sides of every diagonal
  step) keeps it from cutting a fence, building, pond or fire corner.
- Terrain uploads one linear-filtered traffic texture (4×4 samples per tile) through
  existing full/patch/day-band refreshes. Its shader reads it once per pixel and draws
  soil beneath normal lighting, wetness and snow. Fast/High share the same
  ecological field. Plant rendering omits only tufts inside the ribbon; incremental
  plant input tracking includes the two edge arrays.

## Traffic and persistence

`trailDensity` (Float32, `TRAIL_RESOLUTION`² = 16 samples per tile) records where
walkers actually went: each move stamps a soft 0.28-tile footprint along the swept
segment. It decays 1.5% per day over a sparse active set and is cleared on ineligible
ground. It is what the terrain and grass openings draw. Undo does not snapshot it (no
tool draws trails, and restoring the whole field would erase weeks of wear map-wide).
It adds about 0.7 MB to a 120×90 save. The optional `trailE` and `trailS` Float32
arrays still store undirected crossings of each cell's east and south edges, for route
preference and `trod`; legacy edge fields alone never invent a visible track. Neighboring cells read the same edge value. Grid
traversal accounts for every crossed boundary independently of update step size;
large recovery jumps, standing, flying, dormancy and spacing pushes make no trail.
A short per-animal repeated-edge cooldown avoids rapid boundary jitter. Individual
crossings are below the 0.09 visibility threshold. Repeated traffic strengthens
and broadens a narrow track, with a capped display-strength curve. Unused edges
decay 1.5% per game day; flooded/blocked/built/paved/visitor-trail edges are removed.
No game-trail wear is drawn in water or on roads, gravel, structures or reef tiles.

Keep `trod` as coarse ecological compaction for the existing seedling-spread rule,
updated by real crossings instead of occupied-day counts. Existing old saves'
scalar marks decay but are not turned into invented connected paths. Missing or
short optional arrays initialize/extend safely when needed. The existing optional
world-array save format includes edge fields. `range` records, including route
arrays, are copied on wildlife serialization and load so undo/save snapshots are
independent. Derived routing bounds, texture data and `trailMax` are not saved.

## Travel behavior and winding shapes

Eligible adults learn a local feeding site with actual food and a separate usable
resting site. Search at most 1,600 reachable cells, within 22 tiles; favor feed sites
7–20 tiles away and resting habitat within six. Site choices account for nearby
conspecific destinations and, for selected forest mammals, cover. A family leader
chooses trips; followers and dependent young keep their existing following rules.
Animals pause and forage at sites instead of choosing a fresh distant destination
after every rest. Return trips reuse a learned corridor, with short connections
after local feeding. Food/cover loss, barriers or a blocked return permit relearning.
Danger, fire, hunts, meals, water, rutting and dormancy retain their priorities.
A single linear pass measures lagging deer/elk family members; resource-trip leaders
reduce pace when family members fall behind. This does not slow hunts or fire escapes.

A bounded A* can mildly favor existing worn edges and lower-resistance ground.
Approximate family/recovery targets retain their original BFS routes. Searches stop
at 1,800 expansions and retain the safe original if no useful alternative is found.
Ordinary trail preference permits at most 25% plus two steps of detour. A new
resource course may take a stable, modest lateral sweep, trying either side around
blocked ground and remaining within 35% plus two steps of its original BFS route.
It is then reused in both directions. Fine-scale resistance variation, shrubs and
slope break up route ties. These are deliberate game abstractions, not a calibrated
energy/terrain model, GPS-derived paths or a promise that every animal should curve
in perfectly open ground.

Shared sub-tile nodes give resource routes gentle lateral variation, and continuous
walking rounds their turns, so the drawn track is the path animals actually walked,
not a reconstructed curve. Grass openings sample the same density field.

Habitat suitability, carrying capacity, food quantities and birth/death formulas
are unchanged. Trails do not attract animals to empty ground as destinations or
turn habitat into visitor paths. Movement can change later ecological outcomes.
Groundcover openings are a local rendering response to compaction, not a blanket
reduction of a tile's forage or native-plant capacity.

## Narrow, wandering tracks (2026-10-22)

Cole reported trails as too straight and too wide, worst on the Serengeti, where wildebeest
moving along the river bank laid a grid. Cause: outside learned resource trips, ground walkers
steered through tile centers, so a herd traced one straight line per tile row, and cross traffic
to the water traced the other direction. The 0.28-tile footprint drew each about half a tile wide.

- Every ground walker steers through an off-center waypoint in each tile (`walkNode`), up to
  0.34 tile off center from noise at a 1.5-tile scale, so a straight grid route walks as a
  wandering line. A learned resource route shares the tile's waypoint (`trailNode`), so repeated
  trips still wear one trail. Other walking uses the animal's own noise field: shared points made
  a milling herd's traffic into a warped lattice, while separate ones trample unevenly.
- The footprint is 0.17 tile (`TRAIL_FOOTPRINT`), with the same peak wear per pass, so trails
  appear after the same traffic but cover less ground.
- The ground shader frays the edge with fine noise. Plant openings don't follow the fraying;
  it shifts the edge by well under the openings' margin.

Existing saves keep their old wide, straight wear until it fades; new traffic wears the new shape.

## Verification

- `animal-trails-check.mjs`: 11 checks over every map roster, actual crossings,
  pause/stationary exclusions, repeated versus single traffic, shape/seam continuity,
  terrain restrictions, fade/removal, bounded route preference, physical winding
  travel, remembered/replaced resource sites, return corridors, family/migration
  priority and independent/legacy saves.
- `animal-turning-check.mjs`: six checks for smooth turns in all directions and frame
  sizes, no corner cutting past fences/buildings/ponds/fire, tracks following rounded
  motion, no wear from legacy fields or standing, and density save/restore.
- `animal-trails-render-check.mjs`: three checks for patch/day-band/full texture
  equivalence, terrain edits, Fast/snow shader integration and incremental/full
  plant replay with narrow openings.
- `animal-trails-soak.mjs`: six land-map representatives × seeds 1987/91, eight
  mammals per scene, 100 days and a mid-run wildlife save/load. Uses fixed controlled
  food/resting landscapes and ordinary decisions. `TRAIL_BASELINE=1 TRAIL_ROOT=...`
  observes old movement with the same crossing recorder. These controlled scenes
  demonstrate concentration; they do not establish a universal wild trail density.
- `animal-trails-browser-check.mjs`: isolated single-frame Fast/High shader/pixel
  comparison and snow, with automatic browser/server/profile cleanup. The review
  page runs a fixed habitat through two game years without accessing player saves.
- Existing cervid, clustering (including all seven maps/two seeds), positioning,
  avoidance, animal-life, dormancy, territories, Challenging ecology, world-data
  contracts, ground patch and plant replay checks are regression gates.
- Required `balance-sim.mjs restore 15` runs before/after seed Math.random with
  mulberry32(73621). Restoration goals complete and ecological populations persist.
  Population trajectories differ; these runs are not an output-preserving timing
  comparison. The machine had Low Power Mode enabled, so no target-hardware frame
  rate claim is made.
