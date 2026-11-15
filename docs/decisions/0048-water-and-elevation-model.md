# 0048 Water and elevation: one owner for every corner (audit, proposed rework, first fixes)

Status: **proposed** (the rework below waits for Cole's go-ahead). The first fixes under "Rules" are in.
2026-11-14, ideas batch water-fixes, session 2.

## Rules

- **Digging never moves another water body's bed.** The dig tools call `carve(x, y, depth, true)`
  (`keepWater`): no corner goes below the bed of other water it touches. Map generation still calls
  `carve` without it, so generated maps are byte-for-byte unchanged.
- **A creek the player digs is graded** (`gradeDugCreek`, `js/maps/landform.js`): each dug tile's floor
  stands within `CHANNEL_STEP` (0.2 levels) of every corner it shares with the water it joins and with
  the dug tiles round it, so its water (0.32 over its lowest corner) covers its whole bed by about 30 cm
  and fish swim it both ways. Floors go at most `CHANNEL_CUT` (0.6) under where `carve` put them and
  never above it. A dug creek joined to no other water is graded when it is joined.
- `w.dugBed` marks the player's creek tiles (NaN on the map's own creeks, which grading never touches).
  It isn't saved: loading takes it from the creek tiles the map as generated doesn't have (`game.js`).
- **A pond dug up to a creek or the river is joined to it** (an oxbow, a backwater). `levelPond` digs its
  floor a pond's depth under that water, but never pulls a creek corner more than `CHANNEL_STEP` under
  its bed. In the Hollis water model `feedLevel` gives it the lowest level of the creeks beside it whose
  water reaches over the shared edge: it stands at that level, the creek keeps it full (`b.floor` =
  capacity, refilled each day), and a pond tile above the water on a steep creek is marsh, not mud. Only a
  pond on its own is a vernal pool. Creeks have no seasonal level yet, so a joined pond stays full all
  year. `feedLevel` is where a seasonal creek level would plug in.
- Check: `node tools/dug-creek-check.mjs` (grading, two-stroke digging, salmon both ways over three run
  seeds, joined pond vs a vernal pool through a dry summer, save and load). Also run
  `hollis-water-check`, `tool-actions-check`, `fish-water-check` and `terrain-relief-check` after
  any change to digging or the water model.
- Before building the rework, read "Proposed model" below. Until then, any new edit that touches heights
  next to water should follow the same rule: it may lower its own tiles and the land, never another
  water body's corners.

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
| Fill & grade | `raiseToSurroundings` | Raises a filled water tile toward the average of the land round it |
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
2. **One edit path**: `terrainEdit`, corner ownership as a derived array, Raise/Lower and Fill & grade
   beside water through it. Fixes class A for every tool.
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
