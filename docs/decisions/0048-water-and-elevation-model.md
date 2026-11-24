# 0048 Water and elevation: one owner for every corner (audit, proposed rework, first fixes)

Status: **approved**, phases 1 and 2 built (phase 2: 2026-11-15, ideas batch edit-path). Phases 3 and 4
are still proposals. 2026-11-14, ideas batch water-fixes, session 2.

## Rules

- **One edit path** (phase 2): every height the player changes after the map is made goes through
  `terrainEdit` (`js/terrain-edit.js`): `digWater` (pond, marsh, creek), `shiftGround` (Raise/Lower),
  `gradeTile` (Fill & grade), `levelBuilding` (a building put up). Never write `setVert`/`vh` from a tool;
  map generation (`world.js`, `maps/*-world.js`, `landform.js`, `carve`, `flattenRect`) keeps its own
  passes, so generated maps are byte-for-byte unchanged.
- **Every corner has an owner** (`cornerOwner`, read from the tiles round it other than the ones the
  edit shapes): a building, then a channel (creek, river), then a body (pond, marsh), then land. An edit
  moves land corners only, with two exceptions it asks for: `join` (water dug up to other water may take
  the corners they share down to that water's bed, never below and never up; a pond joining a creek or
  the river, `CHANNEL_STEP` below) and `shore` (filling part of a pond or marsh may raise the corners it
  shares with the rest of it). A building's corners never move. Corners are decided from the heights
  before the edit, then written. So Raise/Lower beside a creek or pond moves only the land's corners
  (it moved the creek's before), and a pond's bank no longer lifts a building's or a creek's corners.
  Raise/Lower refuse creek tiles as they refuse the river (Cole, 2026-11-15): reshaping a creek undid
  the grading its fish swim by; fill and re-dig it instead, which a one-time hint says (`creekShapeHint`,
  Sumatra's says "channel"). Ponds and marshes can still be lowered.
- Check: `node tools/terrain-edit-check.mjs [maps]` (every land tool beside a creek, pond and building
  on every map; a shed beside the creek; no height writes outside the edit path).
- **Digging never moves another water body's bed** (`join`): no corner goes below the bed of other
  water it touches.
- **A creek the player digs is graded** (`gradeDugCreek`, `js/maps/landform.js`): each dug tile's floor
  stands within `CHANNEL_STEP` (0.2 levels) of every corner it shares with the water it joins and with
  the dug tiles round it, so its water (0.32 over its lowest corner) covers its whole bed by about 30 cm
  and fish swim it both ways. Floors go at most `CHANNEL_CUT` (0.6) under where `carve` put them and
  never above it. A dug creek joined to no other water is graded when it is joined.
- `w.dugBed` marks the player's creek tiles (NaN on the map's own creeks, which grading never touches).
  It isn't saved: loading takes it from the creek tiles the map as generated doesn't have (`game.js`).
- **A pond dug up to a creek or the river is joined to it** (an oxbow, a backwater). `levelPond` digs its
  floor a pond's depth under that water, but never pulls a creek corner more than `CHANNEL_STEP` under
  its bed, read from its corners the pond doesn't share (`channelBed`: reading back the corners the
  pond had just lowered sank pond and creek a step for every tile of a widening stroke, a pit with its
  water far under the rim; fixed 2026-11-20; a creek tile the pond wraps on every side sets no floor).
  Ponds sunk before the fix stay until filled and re-dug. Its bank stands 0.15 over the creek's level. In the Hollis water model `feedLevel` gives it the lowest level of the creeks beside it whose
  water reaches over the shared edge: it stands at that level, the creek keeps it full (`b.floor` =
  capacity, refilled each day), and a pond tile above the water on a steep creek is marsh, not mud. Only a
  pond on its own is a vernal pool. Creeks have no seasonal level yet, so a joined pond stays full all
  year. `feedLevel` is where a seasonal creek level would plug in.
- Check: `node tools/dug-creek-check.mjs` (grading, two-stroke digging, salmon both ways over three run
  seeds, joined pond vs a vernal pool through a dry summer, save and load, widening a joined pond). Also run
  `hollis-water-check`, `tool-actions-check`, `fish-water-check` and `terrain-relief-check` after
  any change to digging or the water model.
- **Fill & grade levels a stroke to one height** (`gradeLevel`, `gradeTile`, `js/terrain-edit.js`): the
  height of the tile where the stroke starts (on water, the land round it but at least a bank, 0.15,
  over that water's surface). Every corner of a graded tile goes to that level; the tiles round it take
  the slope between. Land more than `GRADE_REACH` (1.5 levels, 3.6 m) off the level is skipped, so the
  pad stops where the ground gets steep. Corners shared with a creek, the river, other water or a
  building never move; filling part of a pond or marsh may only *raise* the corners it shares with the
  rest of it (held, a filled shore tile sloped under the water and the Hollis model made it marsh).
  Gravel and roads are graded but stay (Cole, 2026-11-15: roads are Demolish-only, like gravel lots),
  with one hint pointing to Demolish; **Demolish takes up roads and gravel people laid** (`LAID`) to bare
  soil (15 a tile; the suburb's streets stay). Check: `tool-actions-check` (level per map, creek bed
  untouched, filled pond tile dry, gravel lots, roads).
- After every land-tool stroke the shores it reached are shaped again (`shapeShoreNear`, 0054): land
  corners at the edge and the outer corners of water tiles, never a bed or a tile's level.
- The one height write outside generation and `terrainEdit`: `outsideCreek` (0054) carves the drawn
  creek beyond the north fence, vertices north of row 0 only, when the `Border` is built (also on load).
- Before building phase 3, read "Proposed model" below. A new tool or event that changes heights calls
  `terrainEdit` with the tiles it shapes; it never gets its own copy of the owner rules.

## History

### Why (Cole, 2026-11-14)

Cole feels the elevation and water models cause many recent bugs. He chose an audit and design proposal
this batch, with the rework as a later batch once he approves it, plus two concrete fixes: a pond joined
to a creek should keep the creek's level instead of drying like a vernal pool, and salmon got stuck in a
creek the player dug and couldn't reach the main creek.

### How heights and water work now (the audit)

**Heights.** One grid of corner heights `w.vh` (levels of 2.4 m; a tile is 8 m), saved with the farm.
A tile's ground is its four corners (two triangles). Shared corners mean every tile edit moves part of
up to eight neighbours.

| Writer | Where | What it does to corners |
|---|---|---|
| Map generator | `generateHeights` (world.js), `land.base` per map (0044) | Builds the land, then `fillPits`, carves water (`carve`, river at -0.7, ponds levelled with a bank), `creekDownhill` |
| Dig pond / marsh / creek | `dig()` in tools.js → `carve` (+ `levelPond` for ponds, + `gradeDugCreek` for creeks since this record) | Lowers the tile's corners to its highest corner less a depth |
| Raise / Lower ground | `shiftTile` | Moves all four corners, any tile but the river, water included |
| Fill & grade | `gradeTile` (was `raiseToSurroundings`, which also raised the corners of the water beside it) | Sets every stroked tile's corners to the stroke's level, holding other water's corners |
| Buildings | `flattenRect` (generators only) | Levels a rectangle to its mean |
| Beaver dams | none: dams change water, not heights | |

**Water.** Two models side by side:

1. *Fixed fill, every map.* A water tile's surface is its own lowest corner plus `WATER_FILL` for its
   kind (pond 0.4, creek 0.32, river 0.35, marsh 0.16: `tileWaterLevel`, `waterline.js`). It never
   changes with weather or season. A creek running downhill is a staircase of flat pools, one a tile.
2. *The Hollis water model* (`sim/hollis-water.js`, PNW only, 0034). Each connected pond and each beaver
   dam is a basin with one level and a volume budget (rain, snowmelt, evaporation, seepage, overflow);
   it publishes `w.waterLevel`, `waterDepth`, `waterManaged` and rewrites `w.terrain` (pond, marsh,
   mud) from depth. Creeks and the river are not basins: their tiles keep the fixed fill.

**Derived water state.** `updateHydrology` (environment.js): `distWater`, `distPond` and fish passage
`connected` (8-connected water from the river, culverts block). Floods (`w.flood`, events.js) are a
separate regional overlay. Wetness (`moist`) reads distance to water and floods. Fish move by
`swimDepth`, which reads the per-tile surface: the lip between two staircase pools is where fish stall
(the hop in `riverFishStep`, 0034).

### Recent bugs and their root causes

| Commit | Bug | Root cause class |
|---|---|---|
| 1040524 / cf76b22 | A pond dug into a hillside held water only in its downhill row | C: player edits skip the generator's invariants (ponds levelled with a bank) |
| (same) | A pond one tile from a lower creek spilled along the creek bank over 700 tiles | B + C: the basin's footprint flowed past a bank the dig never built |
| 9219a3b | A dam on flat ground flooded 1,300 tiles, an eighth of the farm | D: a cap (`DAM_CELLS`) patches a model that has no outlet |
| 4bf5795 | Beaver ponds shrank to a 3-tile strip once relief (0044) smoothed the swale | D: a marsh fringe added by noise because the land has no floodplain detail |
| 53c8cc9 | A broken dam's pool never emptied, so beavers never rebuilt there | B: the receding pool got rain catchment like a pond |
| 332a462 | Coho piled up at one lip for years (10 fish on 3 tiles) | E: the per-tile staircase leaves a lip a few cm deep; fixed by a hop |
| ceb2cbc | Creek fish slid sideways along bars, big fish showed their backs | E: the same staircase |
| e2519b2 / 48839ea | Relief: kopjes added after generation dammed a korongo, fading noise left closed basins | C: heights added outside `base()` skip the drains pass |
| this record | A creek dug across a slope: dry chutes over a metre high, salmon trapped | C + E: `carve` measures each tile from its own corners |
| this record | Digging the junction tile cut half a level under the main creek and dried two of its tiles | A: a tile edit moves a neighbouring water tile's shared corners |
| this record | A pond dug against the creek fell 0.65 m under the creek's water in summer | B: a pond is a closed tank; it doesn't know the creek beside it |

The classes:

- **A. Edits leak into neighbouring water.** Water level comes from a tile's own corners, and corners
  are shared, so digging, `levelPond`, Raise/Lower or Fill & grade beside a creek silently move that
  creek's level. Nothing owns a corner.
- **B. Water bodies don't know about each other.** Creeks are fixed per tile, ponds and dams are tanks,
  and only Hollis has tanks at all. Nothing passes water from one to another, so joined water stands
  at two levels.
- **C. Player edits don't keep the generator's invariants.** The generator runs global passes (fill
  hollows, bank ponds, creeks fall downhill); the tools edit one tile and skip them. Each new symptom
  gets its own local copy of a pass (`levelPond`, now `gradeDugCreek`).
- **D. Caps and noise stand in for missing physics** (`DAM_CELLS`, the fringe, the 0.25 vernal floor).
  Each is reasonable, but they interact, and a change to the land (0044) silently retunes them.
- **E. The per-tile staircase.** A one-level-per-tile surface on sloping beds makes lips, which fish,
  drawing and wetness each work round differently.

### Proposed model

Keep the corner grid and the Hollis basin maths, which work. Add **ownership** and **one edit path**:

1. **Every corner has one owner**: land, a channel (creek or river reach) or a body (pond, marsh, dam
   pool). Only the owner's code writes it. Land edits may move land corners and lower their own tiles;
   a corner owned by water moves only when that water is rebuilt.
2. **Channels.** A channel is an ordered run of creek tiles from source to outlet, rebuilt from
   `terrain` (as basins are now). It owns its bed profile: falling toward the outlet, at most
   `CHANNEL_STEP` a tile, or an explicit **cascade** where the land is too steep (a list, so fish
   passage and drawing can treat it as a falls). Its surface is `bed + depth(flow)`, and `flow(month)`
   per map climate gives seasonal low water. The map's own creeks are channels too; generation grades
   them the same way, so new games get passable creeks everywhere and old saves keep their land.
3. **Bodies.** The Hollis basin model for every map. A body that touches a channel takes the channel's
   level at the junction (`feedLevel`, already in), so a joined pond rises and falls with the creek and a
   pond on its own is a vernal pool. The caps (`DAM_CELLS`, `FRINGE`) stay, but they are tuned against
   the channel's floodplain rather than noise.
4. **One edit path.** `terrainEdit(game, tiles, op)` for every tool and event that touches heights or
   water kinds: apply the op to land corners, re-grade the channels it touched, rebuild the bodies it
   touched, then publish once (`waterLevel`, `waterDepth`, `terrain`, `connected`). `dig`, `reshape`,
   Fill & grade and Demolish call it instead of `carve`/`shiftTile` directly.

Interfaces (names indicative):

| Part | Owns | Gives others |
|---|---|---|
| `channels` (new, `sim/channels.js`) | creek and river bed corners, cascades | `levelAt(i, month)`, `upstreamAt`, `cascadeAt(i)` |
| `bodies` (today's `HollisWater`, all maps) | pond, marsh and dam corners and levels | `levelOf(i)`, `kindOf(i)`, `note(i)` |
| `terrainEdit` (new, `js/terrain-edit.js`) | the order of an edit | `apply(game, tiles, op)`, undo record |
| `waterline.js` | nothing | `tileWaterLevel`, `swimDepth` read the published arrays only |

### Invariants (each with a check)

1. An edit never changes the level of water on a tile it doesn't touch, unless it joins the two.
   (Property test: every tool at random tiles beside water; compare other water's corners and levels.)
2. Every channel tile's water covers its bed by at least `FISH_DEPTH`, except at a listed cascade.
3. A body joined to a channel stands at the channel's level at the junction, through every month.
4. No body's water reaches land outside its own bank (no spill down a hillside or a creek bank).
5. Undo restores heights, channels and bodies exactly.
6. Generated maps are unchanged byte-for-byte unless a phase says otherwise (and then only new games).

### Migration of saves

Saves already hold `vh`, `terrain` and the Hollis basins' volumes. Channels and bodies are derived on
load, as basins are now. Player-dug creek tiles come from comparing with the map as generated (as
`dugBed` does today). A save from before a phase keeps its land; regrading the map's own creeks
applies to new games only (the 0044 rule). Body volumes carry over by site, as `HollisWater` does with
`saved.basins`. No save format change is needed until seasonal flow (one number per channel, optional).

### Acceptance tests

- `dug-creek-check` (in) grows the invariant 1 property test across all land tools.
- A channel sweep on every map: tiles under `FISH_DEPTH` cover (invariant 2), cascades listed.
- `hollis-water-check`, `beaver-pond-check`, `beaver-dam-check`, `water-check`, `fish-water-check` pass
  unchanged; `river-fish-spread-probe` spread no worse; motion sweep fish counts no worse.
- `calibrate all 15 3` within the seeds' spread; `perf-guard-check` and `play-profile` within budget
  (the water rebuild is the cost to watch: 0034 measured 13.7 ms a rebuild).

### Phases (each a session or two, each shippable)

1. **Local rules** (this record): `keepWater`, dug-creek grading, joined ponds. Done.
2. **One edit path**: `terrainEdit`, corner ownership, Raise/Lower and Fill & grade beside water
   through it. Fixes class A for every tool. Done (2026-11-15): see "Phase 2 as built" below.
3. **Channels**: graded beds and cascades for every creek, seasonal flow per map, a joined pond that
   drops with the creek in a dry summer. Retires the fish hop for graded creeks.
4. **Bodies on every map**: ponds elsewhere dry seasonally where the climate says so (Cole decides per
   map), floods read channel levels.

What it does not change: river and reef water, floods' regional overlay, the drawn water's shaders.

### Measured for this record's fixes

- A creek dug west across Hollis's slope from (64, 65) into the main creek at x 54. Before: two dry
  chutes 0.55 levels (1.3 m) high, and the junction dug 0.48 under the main creek, drying two of its
  tiles. Six salmon spawned in it over 60 days: none reached the main creek. After: water at least 0.14
  deep along it; 3 of 3 out a seed in three seeds, and fish from the main creek swim up into it.
- A 3×3 pond dug against the main creek: through March to May its level fell 0.28 (0.65 m) below the
  creek's. Now it stays at the creek's level; one two tiles away still draws down 0.28.
- Steep creeks: the pond's upstream edge stands on the creek's bed (at most 0.2 under it), so on the
  steep upper ditch a 3×3 pond has a marsh corner or two above its water. Digging a creek straight up a
  hill steeper than 0.2 levels a tile still leaves cascades (`CHANNEL_CUT`); phase 3 would list them.

### Phase 2 as built (2026-11-15)

- Simpler than the sketch (Cole agreed, 2026-11-15): ownership is read per corner when an edit runs
  (`cornerOwner`, four tile lookups), not kept as a derived array, so nothing has to be rebuilt or saved and there is no stale
  state. An edit touches a handful of corners, so the cost is nothing measurable.
- `terrainEdit(w, tiles, want, { self, join, shore })` runs per tool call; it doesn't "re-grade
  channels, rebuild bodies, publish once": the Hollis bodies and hydrology are still rebuilt by the
  usual `hydroDirty` refresh at the end of a stroke. Re-grading channels belongs to phase 3.
- What moved: `levelPond` and the keep-water part of `carve` from `world.js`, `gradeDugCreek`,
  `gradeLevel`, `gradeTile` and `GRADE_REACH` from `maps/landform.js`, `shiftTile` from `world.js`;
  `addStructure(…, level = false)` for the player's buildings. Each tool's own copy of "hold this
  corner" is gone.
- Behaviour that changed, all toward the rules: Raise/Lower beside water moves only land corners; on
  a pond or marsh it moves that water's own corners (the tiles of the same kind round it), never another kind's
  (the hollis-water check lowers a pond tile and its basin follows); the dig and a pond's bank no longer move a
  building's corners or lift another water tile's; a pond dug beside a marsh or another pond no longer
  pulls their beds below their level; a building put up beside water leaves the water's corners.
  Generated maps hash the same on every map (two seeds each).
- Measured: the new check fails on the code before phase 2 (Raise beside a creek on pnw, atlanta and
  amazon moved the creek's corner by 0.23 levels, 55 cm).
