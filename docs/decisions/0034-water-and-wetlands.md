# 0034 Water and wetlands: the Hollis water model on, beaver ponds to meadow, fish in their depth, wallows

## Rules

- The Hollis water model (`sim/hollis-water.js`, `waterModelOn`) is on; `?water=0` switches it off to compare. It is Hollis only; a beaver elsewhere uses the older flooding, which also leaves meadow.
- A tile's kind of water comes from its depth at the basin's usual level, not today's. Levels publish in 0.02 steps so the drawn water rebuilds only on a real change. Old saves migrate through `migrateMarkedPools`.
- Beaver ponds (`sim/beaver-ponds.js`): dams at most `DAM_HEAD` over the bed and `DAM_CELLS` 60 tiles; `damCrest` null means no dam there; a standing crest is rechecked on every rebuild. Sites through `damSiteOK` (`SITE_WET`, `SITE_OPEN`, `DAM_GAP`, `CREEK_PER_DAM`, food). A dam without food within 6 tiles (`FOOD_MIN`) is abandoned and breaches.
- A drained pond becomes beaver meadow (`w.meadow`, `MEADOW_YEARS`); drowned trees die through `removeTree` (0028) and stand as snags.
- Fish depth: river fish use `swimDepth` (`waterline.js`, the depth the drawing uses), never `underWater`/`nearestWater` (those are for a drinker's head). `FISH_DEPTH` 0.07; `deepWaterNear`, `stepToward` and `settle` keep them there; a blocked fish tries side headings, then hops the lip. River fish keep moving (`riverFish` in `chooseTarget`).
- Wallows (`sim/wallows.js`): which species wallow is data, `wallow: { size, rut }` on the species definition; a new big herbivore adds it to its own data. A wet wallow counts as a pool in `distPond`. At most two per wallowing animal and 40 a farm.
- Reef fish over coral are drawing only (`coralFloor` in `render3d/flight-clearance.js`); check `tools/reef-coral-clearance-check.mjs`.
- Checks: `hollis-water-check`, `beaver-pond-check`, `beaver-dam-check`, `fish-water-check`, `water-check`; measures `tools/pond-edge-measure.mjs`, `tools/wallow-count.mjs`, `tools/river-fish-roam-probe.mjs`, `tools/river-fish-spread-probe.mjs`.

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
