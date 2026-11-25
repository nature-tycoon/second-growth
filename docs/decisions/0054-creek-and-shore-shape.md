# 0054 Creek and shore shape: creeks bend in curves, shores follow smooth lines

2026-11-22, ideas batch creeks-fps, session 5. Cole: creeks get 90° angles as he edits terrain, the PNW
creek has 90° bends, and creek and pond shores both look jagged, "from the terrain". Fix the terrain
cause, not only the creek.

## Rules

- **The shape rule lives in one place**, `js/maps/water-shape.js`. Course: `smoothCourse` (rounded
  corners, `COURSE_RADIUS` 4 tiles), `rasterCourse` (a line to 4-connected tiles), `sharpBends(w)`
  (turn over 3-tile chords above `COURSE_TURN` 70°; within two tiles of a junction it's a confluence,
  not a bend), `steerCourse`/`finishCourse` (the creek tool). Shore: `shoreHeights`/`shapeShore`.
  Anything that lays or re-routes a creek (flood trimming, session 6) calls these, never its own copy.
- **Map creeks are laid as rounded polylines.** PNW's ditch is still a straightened ditch (it's the
  farm's story) but its corners are 4-tile arcs; it still passes the culvert at (54, 75). Sumatra's
  canal grid keeps its right-angle junctions (real peat canals; junctions are exempt).
- **The creek tool steers** (`course: true` on the tool, ToolActions.paint): a head follows the
  stroke 5 tiles behind it, turning no tighter than 4 tiles, so a corner in the stroke is cut round.
  A stroke that turns back or ends inside the tightest turn stops short of the cursor. A stroke
  starting at a creek's end carries on its heading (`creekEndHeading`); from mid-creek it's a
  tributary and may leave at any angle.
  The stroke shows at once (2026-11-23, batch phone-creeks-fish s2): while dragging, the brush preview
  tints the tiles dug so far and the stroke from the head on to the brush (`pendingCourse`, input.js),
  and the water's rebuild is paced to a third of the time (`brushStroke`, Scene.refreshWorld); the
  shore pass still runs once, at the stroke's end. Before, the first tiles after the start showed
  nothing until the head was 5 tiles behind, and each dug tile cost a 50-90 ms frame. Since s7 (same
  batch) the ground is never held: every land stroke redraws only the patch that moved (`Terrain.reshape`,
  0048), so the brush stays on the cursor. Only the water is paced, in any brush stroke: near water,
  for up to 3x its last rebuild, Raise/Lower show the new bank under the old sheet (accepted; exact again
  when the stroke ends).
  A tight brush-1 S still draws tile-stepped (pnw 12.9%, amazon 10.2%, serengeti 13.1% of its
  waterline turning >60° within a tile): a creek's banks sit 0.03 over its water, so the waterline runs
  out along the next tile's edge. Raising a *dug* creek's banks like a pond's was measured (serengeti
  3.5%, amazon 6.5%, pnw unchanged: steep cross-slope, each tile's flat sheet) and not built: it breaks
  the floodplain rule above for the creeks players dig for beavers. Fixed in the drawing instead (0055, the
  creek ribbon).
- **The shore pass** (`shoreHeights`): the water's tiles blurred (σ 0.9 tile), outline where it falls
  to 0.35. A water tile's corner outside the outline (the outer corner of a step or bend: touched by
  that one water tile only) is lifted at most 0.3 out of the water, never the only lowest corner of its
  tile (that sets the tile's level), never a river's or a waterfall's, never one two water bodies share
  (a creek feeding a pond, 0048), and no bed is ever lowered: **water levels, grading (0048) and falls
  (0050) don't move**. The drawing paints such a tile as shore mud (`liftedCorner`, terrain.js), else
  its exposed corner showed as a square tab of pond bed.
- Levels are the full ones: a Hollis pond's never below its lowest corner plus `WATER_FILL`, so a bank
  shaped in a dry August doesn't flood when the pond refills.
- Corners that stay: a building's, a road's (the culvert crossing, the suburb's bridges), a dam's, a
  culvert's, a boardwalk's, and a Fill & grade stroke's own tiles (its pad keeps its level). After an
  edit only corners within 3 tiles of the stroke move (old saves change only where edited).
  A land corner beside the water is set so the drawn waterline crosses each mesh edge where the outline
  does: lowered (never under the water: bank 0.15 by ponds and marsh, 0.03 by creeks), raised at most
  0.3 by ponds and marsh only (a creek's banks stay low: its floodplain is where a beaver pond and a
  flood spread; raised, `beaver-dam-growth-check`'s pond never formed), except within two tiles of a
  creek's head, and only where the land behind still drains (`drainsPast`, else a hollow: 0044), and lifted if
  it stood under the water (after an edit even where that closes a hollow: the player's Lower dug it;
  at generation not).
- **Creek heads narrow into their end** (2026-11-23, batch creeks-fps-2 s3): a head is a creek tile
  with water on one side only, two tiles or more inside the map (PNW's ditch is laid a row in at
  generation, its fence-row tile after: at one tile it was taken for a head and the film's stage rose).
  It counts `HEAD_WET` 0.5 of a water tile in the outline, and land corners within two tiles of it may be
  raised like a pond's (`byHead`), so the water narrows into the end instead of stopping square
  mid-tile. Sumatra's dead-end canals taper too (accepted: within their last tile). Generated maps
  with heads change (Chinandega, Sumatra); the others are byte-identical. One side of an end stays
  straighter than the other where the mesh's diagonal runs: corners alone can't draw a point.
- **Beaver ponds get no shore pass**: a Hollis pond is drawn as one flat sheet over the sloping land,
  so its shore follows the ground's contour, not the tiles (1.2% sharp, as the farm's shores). A
  monthly pass over ponds whose dam rose was built and measured worse (13 sharp samples in 1,070 → 27),
  then taken out. A drained pond leaves its creek exactly as it was. Don't add one without measuring.
- **The creek beyond the fence is heard** from where the camera looks (`sampleSoundLand` reads the
  border's creek tiles round the unclamped focus; silent there when the fence-row tile is Hollis-dry,
  as the drawing). Its staircase where the course steps diagonally (PNW) comes from the drawing: each
  row's water a flat sheet, a shared corner taking the higher row's level, PNW's west ground under it.
  A lower-only carve can't fix that (tried: PNW better, Serengeti worse, the film's first shot moved).
- **It runs last in `generateHeights`** (every map, after drains, ponds, `creekDownhill`, falls) and at
  the end of every land-tool stroke (`shapeShoreNear` in ToolActions.end, through `terrainEdit` with every
  tile its own: the pass keeps its own rules). Undo puts the whole height grid back.
- Old saves keep their heights (vh is saved) until edited nearby. Loading marks as player-dug any creek
  tile the freshly generated map lacks, except `formerCreek` (the PNW ditch's square-cornered course,
  kept by the generator), so an old farm's ditch is never re-graded as a dug creek.
- Generated maps change (heights by the water on every map, PNW's ditch course): 0048's "generated
  maps byte-for-byte unchanged" is about the edit path, not this; baselines that read the map (perf
  guard, calibrate, the intro film's staging) are re-measured with the change.
- **Big floods trim tight bends** (session 6, `js/sim/creek-cutoff.js`, `bendCutoff` here): a flood
  of strength ≥ `BIG_FLOOD` 1.3 may cut one `sharpBends` bend across its inside (a chute cut-off,
  at most `CUT_ADD` 8 new tiles, `CUT_LOOP` 10 left), chance `CUT_CHANCE` 0.5. Fresh maps have no
  sharp bend, so it reaches old saves and creeks a player's edits left sharp. Refused: land higher
  over the nearest creek tile than the flood rises (`RISE` × strength × (1 − sponge), as `reachFrom`'s creek walk;
  since 2026-11-23 `w.flood` follows every creek too, so cuts may come on the PNW ditch above its culvert), a road, trail, gravel, mud, a building, any feature,
  a level pad, a locked tile; a dam, culvert, boardwalk, building, road, pond, Hollis-managed water
  or a fall within 3 tiles. Every test, and a **trial cut** (made, tested by `swimsBetween` down the
  whole reach, put back), comes before `g.rng` is drawn, so a farm with nothing to cut keeps its run's
  random stream. New tiles go through `digWater`, graded alone (a dug creek it joins keeps its bed);
  the old loop is marsh on its old bed (`dugBed` NaN). Undo is cleared on `'creek-cut'` (undo puts
  the whole height grid back). Loading marks dug creek only where the fresh map has none, so a cut
  through an old save's ground the fresh map has as creek loads as the map's own (not graded again,
  never lowered): accepted. Check: `node tools/creek-cutoff-check.mjs`.
- **The starting creek runs on beyond the north fence** (2026-11-22, ideas batch creeks-fps session 9;
  drawing only): a map's `northCreek(y)` (its creek's own line, y < 0) is laid into the drawn border
  by `outsideCreek` at the end of the `Border` constructor (every new game and every load), at the
  creek's full width by the fence (`northCreekSpan`, which the sim also reads: waiting deer stand on a
  bank, not its bed, `offCreek` in fence-gate.js). It carves **only vertices north of row 0** (the farm
  and the simulation never move), its bed falling toward the farm at least 0.02 a row, from bank corners
  it never touches, so running it again moves nothing. It's skipped where the creek no longer reaches
  row 0 (an old PNW farm, whose ditch began a row in, keeps it; a creek the player filled at the fence).
  It draws dry while the Hollis model has the fence tile dry. Its corners aren't recarved after a
  stroke at row 0 until the next load: accepted. **Drawn the farm creek's width along a smooth line**
  (2026-11-24, batch phone-creeks-fish s9; Cole: "looks really fake ... clipping ... wider off the map
  than the creek on the map"): `northCreekLine` smooths each row's span centre, joined to the map's own
  `course(y)` a few rows into the farm and pinned there (no jog at the fence; never from dug tiles, so
  every load lays the same line), into `border.north` with the bed by vertex row. The carve lowers each
  corner to the bed across from it plus `northCreekCross` (flat, rising to the fill line `NORTH_EDGE`
  past the ribbon's edge, then the gorge's walls), only lowering and only inside the old spans' footprint
  (the bank corners `northCreekBank` reads stay untouched: idempotent). `buildWater` lays the sheet at
  bed + fill across from each corner (capped to the ground outside the ribbon's edge: at a sharp bend a
  corner across from a higher stretch of bed stood the sheet 0.4 over a low bank) and ends it at the
  ribbon, half-width `NORTH_HALF` 0.9 (as `RIBBON_HALF`) or the map's `northCreekHalf` (PNW 0.72: its
  ditch draws ~1.4 wide); the fence row's corners keep the farm's level, and where no farm water meets
  one the ribbon ends it too (the border's water spilled west over them onto the farm, the wedge in
  Cole's screenshot; a two-tile creek's or a pond's own fence corners keep the farm's edge). Its tiles
  are those the line runs through, joined edge to edge row to row and to every farm creek tile under the
  fence (the drawn current runs along 4-connected water: across a diagonal step the farm's fence tile
  flowed 101° off downhill, waterfall-check; such a joining tile can be creek under bare bank). Every
  tile under the ribbon gets a sheet, no tree on the old span's footprint. Waiting deer keep clear of
  the drawn water by the line (`offCreek` reads `border.north` when there is one, else the span). Before -> after (seed
  1987, drawn width farm / beyond): pnw 1.41 / 2.31 -> 1.24, amazon 1.81 / 3.32 -> 1.69, serengeti
  1.85 / 3.32 -> 1.65, atlanta 1.73 / 2.93 -> 1.66, chinandega 1.79 / 2.80 -> 1.64, sumatra 1.76 /
  2.77 -> 1.67; outline steps 0%; edge 0.26-0.32 levels over its bank (the farm creek's own 0.21-0.32).
  Its line on PNW is held west of the film stage's kept corners (`keep` in `northCreekLine`): a sharp
  bend at rows -1 to -3, a slight bank bulge there (5 of ~1200 samples), and its fence row necks to ~1.2
  between the farm's own row-0 corners and the stage (the bed climbs ~2.4 levels in that row).
  `MIN_WIDE` still sets the spans the sim and the film read. Earlier (s5-s9 of creeks-fps) it was the
  spans themselves, two tiles wide, each tile's flat sheet, the wall corners lowered halfway (`WALL`). Sunk
  in a shallow gorge (Cole, 2026-11-23: a wide tilted sheet on the hillside looked
  wonky): the bed `GORGE` 0.8 levels under the untouched land a tile beyond its walls (deeper, 2-3
  levels by the fence, stood as raw earth walls in the film's first shot); no tree on the creek or its
  walls. Beyond the fence the bank ring takes the *lowest* water beside it (terrain.js), or the
  water a row upstream stood in the air over a bend's inside. White water there is capped at 0.3
  (`OUTSIDE_WHITE`; full white read as a snowfield) and no waterfall ledge is drawn. PNW's course
  swings west at once so the intro film's marks stay dry, and the film's stage on its east bank is
  never carved (`northCreekKeep`, `pnwNorthKeep` in world.js: by the fence even the creek's own east
  corners, which leaves its gorge one-sided there; the buck's hooves sank 0.26 on the gorge's lip);
  its cameras over the gorge stand on its banks' height (`northCreekBank`, `filmGround` in tools/intro-film.mjs). Move the film's marks and
  `PNW_NORTH` (world.js) together, then run `intro-film-motion`.
  PNW's ditch now starts at row 0, one creek tile with its west corner cut down so it draws about
  two tiles wide (one drew as a neck at the fence; a second creek tile moved the dipper off the creek
  and halved opening-lapse's trees), with
  no fence (Cole: no fence across the creek), yet closed to arrivals while the fence stands either
  side (`fencedCreek` in the map, `waterGapClosed` in fence-gate.js, read by `immigrate` and the
  waiting animals' `gap`), so the opening still opens the farm (0053; an open gap let elk walk in on
  12 of 40 seeded arrivals). The other maps' creeks have always been a gap.
  `vh` is saved, and the carve only lowers: a save made with an earlier course or gorge keeps that
  trench beside the new one. None shipped (the first version never reached main); change `PNW_NORTH`,
  `GORGE`, `NORTH_*` or `northCreekHalf` knowing saves keep the old cut (a save from before s9 keeps its
  wide stepped trench, dry beside the narrower water: start a new farm to see it). The intro film
  (assets/intro) was filmed with the old wide creek.
  That tile is laid after `generateHeights`, its corners cut to just above the next tile's bed: in
  the creek from the start it shifted the planting's random draws and moved the waterfall's ledge a
  tile (`creekFalls` picks it along the whole steep reach). Reef: no creek, no `northCreek`.
- Check: `node tools/offmap-creek-check.mjs [maps] [--report]` for the creek beyond the fence (its drawn
  width against the farm creek's, no tile steps, its water on its banks, no step at the fence, carved again
  unchanged). `node tools/water-shape-check.mjs [maps]` (no sharp bend on any map as generated; the drawn
  waterline's share of points turning over 60° within a tile under each map's ceiling; the creek
  beyond the north fence, full width, falling, carved again unchanged; a right-angle
  creek stroke, a zigzag, a filled tile, a pond dug in steps and Lower beside a creek, through
  ToolActions; no water tile's level moved; creek heads narrow into their end; PNW beaver ponds'
  shores smooth, and a drained one leaves its creek as it was). Sound: `nature-audit-check`. Also run `terrain-relief-check` (no hollows),
  `terrain-edit-check`, `dug-creek-check`, `hollis-water-check`, `waterfall-check`.

## History

### Why the shores were jagged

The ground is a grid of corner heights, 8 m apart, drawn as two triangles a tile, and water is a flat
sheet per tile that the ground hides where it rises above it. A tile is either water (its corners
carved down) or land, so the waterline ran along the tiles' edges: a pond's outline was a staircase
of tile steps, a diagonal creek a zigzag, and a creek turning on the grid a right angle. Measured on
the drawn waterline (ground meets water on the mesh's triangles, as `buildWater` draws it), 4-13% of
every map's shore turned over 60° within a tile. The water shader's rounding (`vRound`) can only draw
the water back by a few centimetres of depth, not round a step a tile wide.

### What was tried

- Lowering land corners only, to an outline of the blurred tiles: halved the sharp turns but left the
  outer corner of every step standing in the water, so diagonals stayed notched.
- Lifting those outer corners too (pass 1) fixed the notches. Raising banks up to 0.3 smoothed straight
  reaches further (281 sharp turns on all maps against 718 before) but at first closed 157 small
  hollows on the PNW behind raised banks; `drainsPast` keeps the raise only where the land behind still
  drains, with no loss of smoothness.
- The creek tool first held the head to a turn rate straight toward the cursor: a right-angle stroke
  overshot 8 tiles and looped. Following a point 5 tiles ahead on the stroke (pure pursuit) cuts the
  corner round instead.
- After the review: creek banks are no longer raised (beaver ponds), only one water body's outer corners
  are lifted, levels are the full ones. Measured share of the waterline turning over 60° within a tile,
  before → after: pnw 7% → 1.2%, amazon 12% → 3.5%, serengeti 13% → 3.6%, atlanta 8% → 5.1%,
  chinandega 9% → 8.0% (its crater lake and lagoon don't drain), sumatra 4% → 3.4%.
- Fixtures that named the PNW ditch's old corner tile (54, 46) for a beaver dam now use (54, 48) on the
  new curve. A dam on a diagonal reach can have its crest under its basin's lowest corner; an empty
  basin's level is now never above its crest (`level`, hollis-water.js).
- Session 6 (flood cut-offs): Cole chose floods trimming tight bends over yearly meandering (decades
  slow, and it would move fish, beavers, dams and dug creeks). First gated on the flood's own marks
  (`w.flood`), but those spread only from creeks open to the river's fish, so the PNW ditch above its
  culvert never floods; the gate is the same height rule instead. (2026-11-23, batch creeks-fps-2 s2: floods now spread along every creek, 0034;
  the gate stayed the height rule, which already matched.) A bend turning up Hollis's slope is
  refused by the trial: the shorter cut puts the corner's 0.5-level drop into a step fish can't swim
  (grading never cuts more than `CHANNEL_CUT`); one turning down the slope is cut in 3 tiles. The
  old loop is marsh, not a pond: a pond needs `levelPond` (it digs deeper), a marsh holds water on the
  old bed as it is. Fish left in it use the stranded-fish path (wildlife-intent: swim to deep water).
- Considered and not done: a separate smooth creek mesh (a ribbon along a spline) in the drawing. It
  would leave the land, the fish and the shore plants on the old staircase, and Cole asked for the
  terrain cause. Smoothing below the tile size (sub-tile shore detail) would need a finer ground mesh.
