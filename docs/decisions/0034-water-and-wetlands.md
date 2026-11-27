# 0034 Water and wetlands: the Hollis water model on, beaver ponds to meadow, fish in their depth, wallows

## Rules

- The Hollis water model (`sim/hollis-water.js`, `waterModelOn`) is on; `?water=0` switches it off to compare. It is Hollis only; a beaver elsewhere uses the older flooding, which also leaves meadow.
- A tile's kind of water comes from its depth at the basin's usual level, not today's. Levels publish in 0.02 steps so the drawn water rebuilds only on a real change. Old saves migrate through `migrateMarkedPools`.
- A player-dug pond is levelled as the map's own ponds are (0044): `World.levelPond` lowers the whole connected pond to its lowest floor and raises a bank round it above its water (never a creek's or marsh's bed). On the land since 0044, digging without it left a hillside pond's uphill tiles above its water, mud the moment they were dug. A pond held above its spill (one tile from a lower creek, no room for a bank) keeps its water in the pond and its bank ring (`makeBasin`), or it ran out along the creek bank. `hollis-water-check` digs both cases.
- A pond dug up to a creek or the river is joined to it and holds its level (`feedLevel`, 0048); only a pond on its own draws down in summer.
- Beaver ponds (`sim/beaver-ponds.js`): dams at most `DAM_HEAD` over the bed and `DAM_CELLS` 60 tiles; `damCrest` null means no dam there; a standing crest is rechecked on every rebuild. Sites through `damSiteOK` (`SITE_WET`, `SITE_OPEN`, `DAM_GAP`, `CREEK_PER_DAM`, food). A dam without food within 6 tiles (`FOOD_MIN`) is abandoned and breaches.
- Dams span the creek (2026-11-20, `damLine`, `leak` in hollis-water.js): a dam is the tile's downstream edge plus the edges along its line where water would get round it (beavers plug the leak they hear), out to banks above the water or `DAM_SPAN` 8 tiles. Its pond stands at the crest or `SPILL_MARGIN` under the lowest bank it still gets round at, whichever is lower; a creek meander above the dam crossing back over the line isn't a leak. Edges are derived, not saved (`b.dam`, `w.damEdges` for drawing); the saved crest is the one it was built to (`b.top` when a bank holds it lower), so a bank raised again lets the pond back up. One mound per edge, bowed upstream (flora.js); no water sheet drawn on the dry ground below a dam (terrain.js). The creek below keeps its level: the sim has no discharge, and real dams leak and keep baseflow. Check: the s5 case in `beaver-pond-check`.
- Dams grow (2026-11-20, `b.rise` 0..1, `raiseDam`, `breachDam`): a new dam stands `DAM_START` (0.13) over the creek's own water (`nominal`, not the bed: under that the channel never turns pond), and a tended dam rises `DAM_RAISE` (0.15) on the first day of each month June–November (`RAISE_MONTHS`, damDay), full in its second building season (at 0.06 a colony mostly left before its pond was more than marsh: soak); its line lengthens as it rises. A flood breach of a tended dam drops it `DAM_BREACH`. `rise` is saved only under 1; a missing one is full (old saves). Only a previous *dam* basin carries it: one built over a draining pool starts low. Checks build a full dam with `buildDam(site, 1)`.
- Felling (`fellAtDam`): woody plants on the dry tiles of a dam's edges (marsh margin counts as bank) are cut when it is built and at each raise, so no tree stands through a mound: the waiting sapling first (`removeTree` would promote it), a big non-food tree left as a log, the rest with no deadwood; beaver-food shrubs coppiced to 0.15 (their food), other shrubs cleared. A full dam isn't raised again, so regrowth there is cut only after a breach.
- Spill (drawing only): `b.full` (volume at capacity; off once 0.03 under the crest) is published as `w.damSpills`; terrain.js `damSpill` draws thin falling water (`fallMesh`, as a waterfall's but thinner, `thick` 0.7, with foam and no rock or mist; `DAM_SPILL_WIDTH` 0.85 of an edge) over each mound whose tile below is unmanaged water, on its own mesh `spills` (the waterfalls' `falls` is unchanged); `waterKey` hashes the spills. flora-changes redraws a dam's tile when its crest or edges change. Check: `beaver-dam-growth-check`.
- Colonies (2026-11-14): a dam builder's home is its nearest standing dam (`colonyDam` in home-range.js), and a dam that is some beaver's home counts as tended. A flood breaches a tended dam (its pond drops) but washes out only an untended one. A broken dam's draining pool (`receding`) gets no rain and goes once empty, and doesn't block a new dam. Beaver `hr` 20: the creek holds a family. Measure with `tools/beaver-wetland-soak.mjs [years] [every] --restore --run-seed=n`.
- Marsh margin (`FRINGE`, `FRINGE_REACH` in hollis-water.js): land beside a dam's water, up to 4 tiles out and up to about 36 cm over its usual level (varied by slow noise so the margin wanders), is saturated marsh, owned and managed by the dam (`b.fringe`; no water of its own drawn, or the pond's edge leaves its level: `water-check`). It counts toward `damPotential`, and when the dam goes it becomes marsh meadow (`PENDING_DEEP`) that dries back over the years. Dry-ground shrubs die on it in 2-4 years and grown trees over 4-10, standing as snags; willow and dogwood spread.
- Floods (`js/sim/events.js`: `reachFrom`, startFlood, floodReach, the Flood risk overlay) spread from the river (9 tiles, 1.1 × strength over it) and from **every creek** (3 tiles, 0.45 ×), above a culvert or below, dug or the map's: a culvert passes water and stops only fish, so `w.connected` (fish passage) never gates a flood. The river and the creeks are walked apart and joined, so a creek beside the river never takes land the river floods. Check: `flood-reach-check`. (Before 2026-11-23 only fish-connected creeks flooded: PNW's ditch above its culvert never did.)
- Flood drawing (`Terrain.buildFlood`, `FLOOD` define on `floodMat` in `waterLook`; 2026-11-27, Cole: "flooding looks blotchy"): one even sheet of muddy water. The flood skips the river's depth tint, silt plume and small sky patches (they broke it into tan and olive blots a tile or two across), and its sky reflection is broad. Corner depth comes from a smooth share of wet tiles within `FR` 2.3 tiles; a corner touching dry ground stays under it (≤ -0.01) unless the river surface lifts it, and the sheet fades out over its last 0.07 of depth, so the edge is soft and lies inside the flood. Each tile is a fan of four triangles round a centre held at least `CENTRE_MIN` deep, so a one-tile strip along a creek (the usual creek flood) still shows water; the fan stays inside the ground's own A-C triangles, so depth is exact. aDepth is capped at `FULL` 0.2 over the river. Look with `tools/flood-review.html` (`setSpots`); measured as the colour step between neighbouring flooded tiles at the game's camera angle (6.8–7.5 down to 4.3–4.6 of 255 on pnw/atlanta/amazon); `water-check` covers the fade and the river surface (corners only: a centre is its corners' mean).
- A drained pond becomes beaver meadow (`w.meadow`, `MEADOW_YEARS`); drowned trees die through `removeTree` (0028) and stand as snags.
- Fish depth: river fish use `swimDepth` (`waterline.js`, the tile's own flat sheet) for where they rest and aim, never `underWater`/`nearestWater` (those are for a drinker's head). On the move they use `runDepth` (`swim-routes.js`: route edges, `riverFishStep`, steering's snap back while walking; a resting fish is still snapped back to its pool), and are drawn in that running water (`runLevel`, actors-swim.js): on a creek tile that isn't a fall each corner takes the level of the creek tiles round it, as the drawn sheet does (at most `RUN_STEP` 0.7 over the tile's own, never across a managed/unmanaged line such as a dam), so a steep reach is a riffle fish swim up and down, not a wall at every tile (2026-11-23: it sealed PNW's plunge pool off). A flood's cut (`swimsBetween`, 0054) still judges by the flat sheet. A river fish holding where it is lets its oldest `recent` place go, or one whose reachable pools were all among its last four held there for good. Check: `fish-falls-marsh-check`. Each keeps to `fishDepth(def)` (`FISH_DEPTH` 0.07, or the species' `fishDepth` trait); `deepWaterNear`, `stepToward`, `settle` and `chooseTarget` keep them there; a blocked fish tries side headings, the side it went round last first (`a.detour`; afresh each step it zigzagged along a lip, nose flipping each frame), faces the one it takes (no sliding along the bank), keeps its heading when there is none, then hops the lip. River fish keep moving (`riverFish` in `chooseTarget`).
- A river fish's waypoint stays in the tile it walks to: one too shallow at its spot is nudged to deep water in that tile, else to the point its route reached the tile by (`swimPoint`, swim-routes.js), never to deep water in the next tile past dry ground the route never crossed (2026-11-24: Sumatra snakeheads fleeing a monitor into a marsh tile with a sliver of water pressed at its lip for days and piled up, 269 per 1000 samples). Every route a river fish plans keeps to water it can swim (`swimRoute`: `chooseTarget`, `pathTo`, `evadeHunt`, `roam`, `disperse`; roam had none and sent fish across a marsh's dry lip again and again), and one fleeing a hunter scatters from others of its kind rather than all darting into the one tile farthest from it. Check: `fish-marsh-pile-check`; measure over many seeds with `tools/river-fish-pile-probe.mjs`.
- Stranded fish (`js/sim/fish-wriggle.js`, 2026-11-25): a river fish with the `breathesAir` trait (snakehead, African catfish) whose swimmable water holds 2 tiles deep enough or fewer wriggles to the nearest tile within 3 whose water holds more, on a straight line of wet ground (`wetGround`: water, marsh or mud terrain, or soil at `moist` 0.75 or more; never road, gravel, trail or a structure) with at most 2.2 tiles out of the water, at night by the drawn sun or in rain (any time headless). It is a `walk` with `a.wriggle` set: `riverFishStep` lets it onto wet ground only, `walkStep` slows it to 0.35, steering's snap back to deep water skips it, a crossing broken off resumes (`wriggleOn`), and it is drawn belly down on the ground with a fast body wave (`st.wriggle`, actors-swim.js; motion sweep's `surfaced` skips it). A fish without the trait, shallower than its `fishDepth` (by `runDepth`) with no deep water in reach that day (`a.noDeep`), dies at 0.25 a day (`strandedDies`); an air-breather only once its spot holds no water. Check: `tools/fish-wriggle-check.mjs` (dry pasture between: it stays). Seed 37 Sumatra pile 50 → 0.4 per 1000.
- Drawn fish keep their back under the surface wherever the water is deeper than the model (`mo.top`/`mo.bottom`, `riverFishHeight` in actors-swim.js), never in the bed; in a riffle shallower than the fish a back shows. A `bottomDweller` (the catfish) lies on the bed and has a `fishDepth` over its drawn height (0.3 for 0.29), so it never surfaces: a new one needs both. At rest in a creek a river fish faces upstream (`upstreamAt`, from the bed's slope; the sim's rivers are level, so only creeks have a current).
- Checks for fish: `motion-sweep-check` counts `sideways` (a fish moving off the way it faces) and `surfaced` (a `fishDepth` fish breaking the surface); `tools/river-fish-facing-probe.mjs` gives the causes.
- Wallows (`sim/wallows.js`): which species wallow is data, `wallow: { size, rut }` on the species definition; a new big herbivore adds it to its own data. A wet wallow counts as a pool in `distPond`. At most two per wallowing animal and 40 a farm.
- Reef fish over coral are drawing only (`coralFloor` in `render3d/flight-clearance.js`); check `tools/reef-coral-clearance-check.mjs`.
- Checks: `hollis-water-check`, `beaver-pond-check`, `beaver-dam-check`, `beaver-dam-growth-check`, `fish-water-check`, `water-check`; measures `tools/pond-edge-measure.mjs`, `tools/wallow-count.mjs`, `tools/river-fish-roam-probe.mjs`, `tools/river-fish-spread-probe.mjs`.

## History

2026-11-01. Workstream D. Cole agreed the design on 2026-11-01. Builds on the Hollis water model
(5eb0bee, `sim/hollis-water.js`, switched off in f28758b), the pond edges (e609181, f970c10,
fd7899a), the drawn waterline ([0025](0025-shared-steering.md): `waterline.js`), plant succession
([0027](0027-plant-succession.md), [0028](0028-succession-dynamics.md)) and herbivore pressure
([0033](0033-herbivore-pressure.md)).

### Reports

1. Cole: "Fix the pond, I turned it off because it looked too weird and was breaking the game."
2. Cole: pond edges "too jagged or have pieces of pond that are separated from the main pond".
3. Cole: "The fish go under land when in shallows" (cutthroat trout, PNW).
4. Cole: beaver dams "too overpowering and it stays marsh after you destroy the dam … I was
   imagining it as ponds rather than the whole creek."
5. A tester: bigger beaver dams, to engage players in keystone species.
6. A tester: marshes with grassy knolls and tufts, deadwood, scattered pines, small willow and birch,
   which moose seek out; beavers should make plenty of such marsh.
7. A tester: the largest herbivores should make wallows, temporary micro-ponds for amphibians,
   triops and fairy shrimp in spring and early summer.

### Findings

Measured headless (`hollis-soak`, below) before changing anything.

- **The water model flipped the whole map's ponds every year.** A pond tile was pond only while
  today's water stood more than 0.28 levels deep, so a pond drawing down in summer turned every
  pond tile to marsh (61 → 0 pond tiles each September) and back in autumn, each change redrawing
  the map, re-running hydrology and changing habitat under the animals.
- **Its dam pools were mostly marsh, and big.** A dam held water 0.95 levels (2.3 m) over the creek
  bed; four dams took marsh from 105 to 305 tiles. The drowned channel stayed "creek", so the deep
  part of the pool never read as pond.
- **Its water was drawn tile by tile.** Managed tiles drew a flat sheet at their own level, without
  the shared corner levels, bank ring and rounded waterline every other pond gets, so the pool ended
  in hard steps along the tile lines.
- **With the model off, marsh only ever grew.** Breaking a dam turned its mud back to soil but left
  its marsh for good (81 → 183 marsh tiles over ten years in one run), and dams could sit 7 tiles
  apart, so their pools ran together along the creek.
- **The drawn water itself has no detached pieces** (`tools/pond-edge-measure.mjs`: rasterises the
  water mesh as the shader shows it, then counts pieces with no water tile under them, bodies drawn
  in more than one piece and water tiles showing none; 0-1 specks of 1/64 tile on every map, dug
  ponds, painted marsh and dams). The "pieces" were the brown waterline fringe: noise both gated it
  into patches and jittered its outer edge, so on flat ground it broke into blobs standing apart from
  the water.
- **Fish:** a river fish picked any spot in its water tile and was drawn 0.05 + its sink below the
  tile's surface. In the shallows of a carved creek or a marsh the ground there is higher: 1.1-1.2k of
  17k PNW fish samples were drawn inside the ground, and up to 60% on Chinandega. On some maps fish
  also stood in water too shallow to swim in (up to 12% of samples) or on a dry tile.
- The halved Hollis forest seed rain (0fc9228) doesn't interact: it is tree seed, not water.

### Decision

#### The Hollis water model is on (`waterModelOn`; `?water=0` switches it off to compare)

- A tile's kind of water comes from its depth at the basin's **usual level** (a pond's dug level, a
  dam's crest), not today's. A pond drawing down keeps its pond tiles while they hold any water;
  only margins left dry become mud, with a little slack so a shoreline tile doesn't flicker.
- Water levels are published to 0.02 levels (5 cm), so the drawn water rebuilds only when it has
  really moved.
- Its water is drawn like every other pond's: shared corner levels, the bank ring (dry managed tiles
  count as bank) and the rounded waterline.
- Saves from before (no `water` in the save) have their marks-based beaver pools migrated: drowned
  creek back to creek (the model rebuilds the pond behind each standing dam), flooded ground to
  meadow (`migrateMarkedPools`).

#### Beaver ponds (`sim/beaver-ponds.js`, `hollis-water.js`)

- **A dam** holds water at most `DAM_HEAD` 0.6 levels (1.4 m) over the creek bed (real dams are
  mostly under 1.5 m), lowered until the pond covers no more than `DAM_CELLS` 60 tiles (0.4 ha at
  8 m tiles). The channel behind it, drowned 0.12 levels or more over its usual flow, is pond (its
  base stays creek); land deeper than `DAM_POND_DEPTH` 0.15 (36 cm) is open water, shallower is marsh.
  Where even a 0.15 dam would spread past `DAM_CELLS` (flat ground level with the bed: Hollis's
  55,45 once flooded 1,300 tiles) `damCrest` is null and beavers don't build there. A standing
  dam's crest is rechecked on every rebuild and lowered if the ground round it has changed so the
  pond would spread past `DAM_CELLS` (one grew 95 to 131 tiles in 15 years before this); a dam
  from an old save on such flat ground holds a low pool cut off at `DAM_CELLS` tiles.
- **Where beavers build** (`damSiteOK`): a slow stretch where the pond would cover at least
  `SITE_WET` 15 tiles with `SITE_OPEN` 5 of open water (steep riffles are passed over), no other dam
  within `DAM_GAP` 9 tiles and not inside another dam's pond (so a creek with several colonies is a
  chain of ponds with flowing creek between), at most one dam per `CREEK_PER_DAM` 20 creek tiles
  (about 6/km; 2-16/km are recorded), and food round it.
- **Abandonment.** A colony keeps a dam up while there is beaver food (willow, alder, aspen, birch and
  the like, by growth) within 6 tiles (`FOOD_MIN`). Once it is eaten out the dam is untended and
  breaches within a year or two, as before.
- **Beaver meadow.** When a dam goes, what its pond covered becomes meadow once the water has run
  off (`w.meadow`, years since it drained): open water becomes marsh (wet sedge), the shallows stay
  their ground; slough sedge comes up on bare drowned ground, the drowned trees stand as snags and fall
  as logs (0028), and willow, birch and ash come in through ordinary succession on the soggy ground
  (a moisture bonus fading over `MEADOW_YEARS` 60). After the third year the meadow's marsh dries to
  soil at 5% a tile a year (about half gone by year 15, most by 40). The creek runs through again.
  Sedge on meadow tiles is drawn on tussock hummocks.
- With the model off, the old flooding stays, but its flooded ground also becomes meadow.

Sources: dams generally under 1.5 m (Cunningham et al. 2006); ponds commonly over 0.5 ha in
Minnesota (MSU thesis); recolonisation about nine years after abandonment on average, and flooding
killing most trees and setting stands back to early succession (Wildlife Biology 14(3), 2008);
pond-meadow-stream pathways (Naiman, Johnston & Kelley 1988, as cited there).

#### Fish keep to water they can swim in (`waterline.js swimDepth`)

`swimDepth(w, x, y)`: the depth of the fish's own tile's water over the ground at the point, on the
drawn triangles: the level the drawing puts the fish under. A river fish's waypoint is moved to water
at least `FISH_DEPTH` 0.07 levels (17 cm) deep (`deepWaterNear`), `stepToward` won't take it into
shallower water (except out of it), and `settle` (0025) moves one nudged into the shallows back. The
drawing puts it no deeper than half the water there. (`underWater`/`nearestWater` ask whether a
point is under the highest water drawn nearby, which is right for a drinker's head; a fish needs
the depth under the surface it is drawn at, so it has its own measure on the same waterline data.)

#### The waterline fringe

One strip along the water: how far up the bank it reaches varies slowly along the shore and only
its strength is patchy, so no mud stands apart from the water (`terrain-materials.js`).

#### Wallows (`sim/wallows.js`), every map

Data by species key (`WALLOWERS`): elk and moose bulls in the rut, bison, buffalo, elephants (both),
rhinos (both), warthogs, wild boar and tapirs, each with a dish size; hippos live in the water and
don't. Moose and bison wallow as soon as they are added to a map. A wallowing animal now and then
deepens a wallow beside it or wears a new one in damp, open, level ground (`wallowGround`), at most
two per wallowing animal and 40 a farm. Rain fills a wallow (never past its depth), dry weather
empties it faster in a map's dry months, and one no longer used fills in over a few years. While it
holds water (`WALLOW_POOL`) it counts as a pool in `distPond`, which is where frogs breed; the tile
note tells of fairy shrimp and tadpole shrimp. Drawn as a small mud dish with muddy water in it
when wet (flora.js). Bison wallows are a few metres across and tens of centimetres deep, worn over
years, and hold water in spring (Gerlanc & Kaufman 2003, Konza Prairie).

#### Reef fish over coral (2026-11-02)

Reef fish are drawn over the hard corals by body size (`coralFloor` in
`render3d/flight-clearance.js`): a fish of sprite size 6 or less (clownfish, chromis, cleaner
wrasse) rises only over coral on its own tile, so it can sit in an anemone beside a thicket; a
bigger one looks a crown's width round it and ahead and keeps its body depth over the top. Drawing
only; the simulation still lets fish cross any sea tile. Check: `tools/reef-coral-clearance-check.mjs`.
A fish eaten by a fish leaves a faint puff (`game.fishCatches`, drawn in `scene.js drawCatchPuffs`).

### Verification

Checks (all in the headless suite):

- `tools/hollis-water-check.mjs` (13): adds that a pond keeps most of its open water through a dry
  summer and a year of weather changes fewer tiles than twice the pond's size; saves keep the shown
  level.
- `tools/beaver-pond-check.mjs` (6): a dam's pond is mostly open water, 15-60 tiles, at most 1.4 m;
  every creek tile's dam stays under `DAM_CELLS`; steep riffles are passed over; no dam within
  `DAM_GAP` of another or inside its pond; a drained pond becomes meadow, the creek runs again, the
  meadow's marsh is under 30% after 40 years and gone after 100; old marked pools migrate; wallows
  fill with rain, empty in the dry season, count as a pool for frogs and fill in when unused; saves
  keep both.
- `tools/fish-water-check.mjs`: river fish on PNW, Amazon, Chinandega and Serengeti (two seeds,
  40 days each): no sample in water shallower than `FISH_DEPTH` and none drawn under the ground.
  Before: 0.3-121 per 1000 samples too shallow, and 6-63% of samples drawn in the ground (PNW 7%).
- `tools/beaver-dam-check.mjs` now checks the older flooding with the model off.
- `tools/water-check.mjs`: a dried pond tile may carry the water beside it but never above its level.
- `tools/pond-edge-measure.mjs [maps] [--dig] [--scenarios]` (a measure, not a check): drawn water
  pieces, detached pieces and jaggedness.
- `tools/wallow-count.mjs [years] [maps]`: wallows, and how many hold water, through the seasons.

Measured:

| | before | after |
| --- | --- | --- |
| Hollis pond tiles in September (model on) | 0 of 61 | 61 of 61 |
| Tile changes from the water model in a year of weather (stock pond only) | 131 | 24 |
| A dam's pond | ~90 tiles, mostly marsh | 2-54 tiles by site (median 16), capped at 60, ~40% open water |
| Marsh, 10 years after dams (model off, before / model on, after) | 81 → 183, never back | 103 → 140-160 over 40 years of dams coming and going, meadow marsh drying 5% a year |
| Water model cost (headless, ms per game day) | 0.82 | 0.23 |
| Water mesh rebuild | 28.7 ms | 13.7 ms (same output on every map without the model) |
| Water rebuilds per 120 days, grown Hollis | 69 | 16 |

Wallows (`wallow-count`, 3 years, seed 1987): Serengeti 0 → 13, wet November to June and dry July
to October; Sumatra 22, wet all year but August. Hollis's elk wallow only in the rut, and seldom
(0-1 at a time over 40 years).

Balance (`balance-sim restore 15`, seeded): seed 7 score at year 15 61.7 → 73.9, seed 11 63.1 → 62.5;
every restoration goal in both. Brush rabbits rose in both seeds (0-1 → 26-27 at year 15). Forest,
mature trees and invasives within the seeds' usual spread.

Performance (`play-profile`, M5, High): normal speed, wide and close views unchanged (simulation
0.8-1.3 ms, drawing about 2 ms). Top speed on Hollis: drawing 2.4 → 4.8 ms (ceiling 8), simulation
0.9 → 1.1 ms (ceiling 10). Plant redraws per day are the same with the model on or off; the extra
top-speed drawing is the water rebuilds and the regions round the water's changing margins.

### Known limits

- Since terrain relief (0044, e2519b2) cut the Hollis ditch into a smooth swale, a dam's water alone fills a strip of channel about 3 tiles wide (66 dam sites became 34, ponds 29-47 tiles became 12-27). The marsh margin (2026-11-14) brings back the wide, irregular marsh: ponds 13-68 tiles, 46 sites. The swale is still smooth, so the margin's irregularity comes from noise, not the land.
- 60-year restore runs with the margin (seeds 1, 2): marsh at year 61 117-139 → 145-154 tiles (peaks 215), beaver meadow 96-102 → 165-226, the largest complex 55 → 126 tiles; willow on wet ground about 30, lower (willow grows less well on marsh than on a wet bank). `calibrate pnw 15 9` before all the 2026-11-14 beaver work → after: score 66 (57-77) → 64 (60-79), native .47 → .42, invasives 21% → 23% (some reed canarygrass in the new marsh), herbivores 79 → 70 kg/ha, beavers 3 → 5; deer, elk and frogs within a head of before.
- Seeded 60-year restore runs (`beaver-wetland-soak --restore`, seeds 1 and 2), before → after the colony fixes: beavers 1-4 → 1-7; dams lost because the colony wandered off 5-6 → 1-2 a run (most now go when the colony eats out its willow, the real cycle); beaver meadow 66-78 → 96-102 tiles; dams standing at the 10-year checkpoints about the same (2 of 6 → 2-3 of 6). Untended with invasives on, blackberry takes about 500 of the 580 tiles beside the creek by year 20 and beavers starve whatever the dam rules.

- Hollis elk seldom wallow: only bulls' rut wallows, and elk keep to drier ground. Bison and moose
  (workstream F) are listed in `WALLOWERS` and will wallow when they arrive.
- Beaver food along Hollis's creek is eaten out within about ten years of a restoration (beavers
  and browsing elk), and colonies seldom rebuild after that. That is the cycle the design asks for,
  but a farm with heavy elk browsing may see long gaps without ponds; planting willow brings them
  back.
- Wallows only touch the frogs that use `distPond` (PNW and Atlanta's). Fairy and tadpole shrimp are
  told of in the tile note, not simulated.
- The beaver meadow has no pines: Hollis has no shore or lodgepole pine. Willow, birch and Oregon
  ash come in through succession.
- The water model is Hollis only (beavers live only there). A beaver on another map would use the
  older flooding, which now also leaves meadow.
- The rabbits' rise in both balance seeds isn't explained yet.

#### River fish keep moving (2026-11-02)

A river fish (move 'swim', not reef) used to hang in one spot for days: like every animal it
waited 0.5 to 3.5 days after arriving, and when its own tile scored best in the wander search
(`best === start`) another 1 to 4, so in play trout and salmon looked stuck in one stretch. Now it
holds 0.1 to 0.4 days after arriving, always noses on to a nearby spot it could live on when its
own tile is best, and otherwise holds 0.15 to 0.5 days (`riverFish` in `chooseTarget`). Pond
fish in a small pond still keep to it. `node tools/river-fish-roam-probe.mjs [maps]`: stuck
2-day windows (all positions within 1.5 tiles) on pnw, cutthroat 57% to 27%, coho 60% to 17%.

A creek running downhill is a staircase of pools: within each tile `swimDepth` deepens downstream
and drops to a few centimetres at the next tile's lip. `stepToward` refused any step into water
under `FISH_DEPTH`, and `steering.js` snaps a fish in the shallows back to deep water, so fish
pressed against one lip for years and the ones behind piled up (pnw: all 10 coho on 3 tiles after
2 years). Now a river fish blocked by shallows first tries headings either side that keep to
swimmable water. Held up half a day, it hops the lip to the first swimmable water within 0.35
tiles ahead, so it never rests in the shallows (`fish-water-check`: 0 too-shallow samples on every
map). `node tools/river-fish-spread-probe.mjs [map] [years]`: coho after 2 years on 10 tiles,
spread about 20 tiles, through 4 years.
