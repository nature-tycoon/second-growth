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

## Curved journeys and beaten paths (2026-10-23)

The 2026-10-22 waypoints still left a checkerboard wherever traffic crossed: routes are searched
north/south/east/west, so every walk ran along a tile row or column, only wobbling inside each tile.
A review on a Serengeti stocked to carrying capacity found trails on 9% of the map after a game year,
visible from about 9 passes, with 64% of wear from herd members keeping up with their leader, 8%
from fleeing, and 16% from resource trips. Cole chose to fix the shape and trail attraction first;
the rest of that plan (only journeys wear trails, about 150 passes to show one, a two-year fade,
single file, routes that weigh slope) is still open.

- `animal-course.js` redraws any ground walker's path of six tiles or more as a curve, the first time
  it walks it: pulled straight across open ground, bent by a meander field anchored to the land (up to
  a tile each side, bends every six tiles or so, read across the direction of travel so a return trip
  retraces it), and drawn into a worn track up to 1.5 tiles to the side (`trailSample` above 0.05).
  The curve is checked step by step against standable ground (pulled back toward the line where it
  isn't), turned back into a four-connected chain of tiles with the point the curve crosses each one
  (`a.course`, not saved), and refused if it can't be walked or is more than 35% plus two tiles longer.
  `pathPoint` gives the walker that point, or the tile's usual waypoint without a course.
  Fleeing (`a.run`), fire escapes and off-map starts keep the route search's path.
- `preferTrailPath` gives a well-worn step 40% of an open step's cost (was 65%), still within a 25%
  plus two steps detour.
- Result on the stocked Serengeti: no grid; trails curve at every angle and braid along the river.
  There are still too many faint strands, which is the "more traffic" step.

`node tools/animal-course-check.mjs`: a long walk isn't axis-aligned and bends off the straight
line, two animals get the same course on the same corridor, an animal a tile to the side steps into
a worn track, and shaping costs about 0.4 ms a 40-tile journey including the route search.
`wildlife.update` on the stocked Serengeti timed the same before and after.

## Only journeys, more traffic, longer memory (2026-10-23)

- Only a journey draws a trail: a curved walk (`a.course`) or a herd leaving the map. Keeping up
  with the herd, foraging steps, chases and flight no longer draw (they were most of the wear and
  drew the stray strands); every step still counts as an edge crossing for route choice and `trod`.
- A pass wears 0.45 of what it did, so a trail shows after about 20 passes (was about 9) and is
  fully dark at 0.2 (`TRAIL_FULL`, was 0.55), about 45 passes. The shader reads the same constants.
  Faint wear is kept down to 0.0006 so single passes can add up.
- Unused trails fade 0.35% a day (`TRAIL_FADE` 0.9965, half in about 200 days, was 140). A fully
  worn trail stays visible about 230 days after its last use, a heavily worn one up to about 690.
- A worn track draws a journey in from 0.02 (about four passes), so routes merge before they show.

Stocked Serengeti after five game years: 1.6% of the map drawn (was 8–9% after one), a few winding
trails to water and a trampled rim round the pond, which is realistic at a watering hole. Forest maps
now get few or no trails (PNW none in five years, Sumatra 0.4%, Amazon 0.3%, Chinandega 0.02%):
resident deer and elk make only about four feed-to-rest trips in two game years and move their sites
about three times, so no route reaches 20 passes, and at about 12 passes the Serengeti already
draws 4% while PNW still draws almost nothing. Steadier daily routes for residents is the open fix.

## Steadier routes, longer memory, thinner and longer trails (2026-10-23)

Cole asked for steadier routes for residents without the clumping of 0005/0013. Read with 0014: a
deer walks about a tile a sim-day, so a leg takes a week or more and a literal daily routine is not
possible; passes have to come from routes kept longer and from more of a family walking them.
Measured on PNW (stocked, three game years): 64 of 87 range changes were a grazed-out feeding
ground relearning the whole range, bed included; an animal at its feeding ground grazed it out
before its arrival was counted, so it went on to the next feeding ground and never back to cover
(about four legs a game year); family members walked as much as their leader but in short hops
that wore nothing.

- **Arrival first** (`rangeChoose`): reaching the target flips the leg before the sites are judged,
  and the feeding ground is judged only when it is time to go back to it.
- **Keep the bed** when only the feeding ground has gone, unless another family of its kind is
  at or heading for ground within three tiles of it (`sharedSite`); the new feeding ground is
  searched from the bed and favours ground near the old one (`along`).
- **Single file** (`followLeaderTrip`, from `keepCervidGroup` and `keepWithHerd`): a member more
  than 2.5 tiles behind a leader on a range trip walks the leader's route, stopping two tiles short.
- **No per-animal bow** (`resourceBend` removed): it gave every animal its own line; the land's
  meander in `animal-course.js` does the winding now and is shared.
- **Fade** 0.17% a day (`TRAIL_FADE` 0.99827, half in about 400 days), so routes used now and then
  build up and join.
- **Thinner, longer**: the drawn trail darkens in proportion to wear above the threshold (it was
  the square root), so only the beaten middle draws; feeding grounds are again about 12 tiles from
  cover (7 at least). The footprint stays 0.17 tile: wear is kept four samples to a tile, and at
  0.12 a line between sample rows wore nothing.

Stocked maps after five to eight game years: Sumatra 1.6% drawn as a connected network through the
forest, Serengeti 4.1% (longer branching trails, the pond's trampled rim, a trampled stretch where
herds come down to the river), Amazon about 0.5%, PNW 0.2% (20 deer and 20 elk on the whole farm,
and families still move to a new area about once a game year, 0003). Clumping, as the share of
samples within three tiles of another family of the same kind, over seeds 5/11/23/37, before →
after: buffalo 11% → 4%, deer 18.5% → 20%, elk 18% → 15%, boar 7.75% → 7.25%, sambar 10.75% → 10%.
`animal-clustering-soak` and `home-range-check` pass. `animal-territory-soak` fails on the
Serengeti leopard; it already did before this trail work (7e7a610).

## Busy trails stay narrow (2026-10-24)

Cole saw some Serengeti trails grow wide, and put it down to elephants walking between water and the
map edge and giraffes between a stand of trees and a lone tree, back and forth for years. The cause
was volume, not those routes as such: walkers on one corridor never walk exactly the same line
(where they joined it, how sharply their size lets them turn, the course's smoothing), and with
hundreds of passes a year even the rare outer lines wore past the threshold, so the trail braided
into a band a tile or more across. Wear was also allowed to reach 1, five times fully drawn, which
took over a decade to fade.

- **Hooves land in the rut** (`rut` in `animal-trails.js`): a journey's step within 0.4 tile of a
  drawn trail wears the trail's middle (the strongest wear across its line, slightly favouring the
  nearer). Real trails get deeper and barer with use, not wider. The animal still walks its own
  line; 0.4 tile is narrower than an elephant or a giraffe. Herds leaving the map don't: they walk
  straight lines, and joining those made ruler-straight trails.
- **Wear is capped at 0.4** (`TRAIL_CAP`, twice fully drawn), so an abandoned trail fades within
  about six game years.

`node tools/trail-width-report.mjs serengeti 5 <seed>` (stocked, five game years) measures drawn trail
with drawn trail half a tile away on both sides as "wide". Away from the migration, seeds 7/23/11:
1.6% / 5.3% / 18% wide → 0.1% / 0% / 0.4%. `SPECIES=elephant,giraffe` stocks only those; over ten
years the giraffe corridor that braided is one line. `wildlife.update` on the stocked Serengeti costs
the same per animal (about 4.4 µs).

Still open: the migration. Herds leaving the map walk straight lines toward the edge, about ten
tiles apart, so the Serengeti's northward migration wears a broad band of parallel straight lines
(most of the remaining wide trail, and it varies a lot from run to run).

## Verification

- `animal-trails-check.mjs`: 15 checks (including years of offset journeys staying one narrow trail) over every map roster, actual crossings,
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
