# 0050 Waterfalls: a steep creek reach gathered at one ledge, a plunge pool, a drawn curtain

2026-11-20, ideas batch cinema-creeks, session 6. Cole picked natural spring-fed falls on creeks over
steep steps, no player tool.

## Rules

- Falls are made with the map (`creekFalls`, `js/maps/landform.js`), only on maps whose landform opts in
  (`land.falls`: PNW's `pnwLand` only), after `creekDownhill`. Along each creek from its spring it finds a
  straight, one-tile-wide reach whose bed falls `FALL_STEEP` (0.45) or more a tile and gathers it at one
  ledge: the bed below the lip drops `FALL_DROP` (1.5) more, a plunge pool's far end stands `POOL_RISE`
  (0.12) over its near end, and the gorge eases back to the old bed at least `FALL_MIN_DROP` (0.18) a
  tile. Only lowers. Rocks (`F.ROCKS`) either side. A map without such a reach gets none; don't force one.
- Nothing is saved: the heights are (`vh`), and everything else is read from them (`isFall`: a creek tile
  whose bed drops `FALL_MIN` 1.2 from edge to edge). Old saves keep their land, so no fall.
- No new water solver or basin. The pool is creek water at its own level (lowest corner + 0.32), which by
  its shape stands 0.2 over its tail-out (its lowest way out), far under its banks, and over the creek
  below (`FALL_MIN_DROP` > `POOL_RISE`). Edits can't change it: Raise, Lower and Fill never move a creek's
  corners (0048). A pond dug beside the pool joins it and takes it down 0.08.
- Fish: the fall's upper part stands far over its own water, so `swimRoute`'s depth test refuses the lip
  both ways (no species leaps; don't add one here). Beavers: `damCrest` passes over a head whose pond
  would stand more than 0.12 over a fall's foot (it would stand flat up the face).
- Drawing (`terrain.js`): the bank ring takes the water beside it before the water at its corner (it took
  the highest of all eight, so beside any steep creek the drawn water stood up to 0.6 over the creek's own,
  over its banks, and a fall's lip level spread over its pool). `aWhite` whitens water whose sheet drops
  more than 0.9 across a tile (a steep reach's 0.6 stays clear). `buildFalls` draws a fall as a drawn rock
  ledge (`fallRock`: one opaque flat-shaded mesh, the top just under the lip's water for `FALL_RUN` of the
  tile, a face curving down behind the water, wings tapering into the banks) and falling water off it
  (`falls`, `fallMesh` with `fallLook`'s material: a sheet on a t² arc over `FALL_TRAVEL`, thick and glassy
  at the lip, thinning into white streaks; a foam disc on the drawn pool surface; four mist puffs that fade
  out in a wide view). One mesh of each for all falls; a full dam's spill (`spills`) is the same water,
  thinner, no rock or mist. Drawing only, built when the water rebuilds: nothing per frame but the shader.
- Winter ice (drawing only, no state): `FALL_ICE` (smoothstep 0.3-0.75 of the eased snowpack `snow.uSnow`, so
  after two or more snowy days, thawing as the snowpack melts) freezes the sheet's sides into a rim with
  icicle columns (at most 0.3 of the width each side: the middle always runs), puts shelf ice round the foam
  disc's rim, and glazes the rock where `aIce` says spray wets it (`rockIce`); the rock's dry tops take snow
  (`withSnowTops`). There is no temperature in the game: the snowpack is the cold signal.
- Sound: `sampleSoundLand` (`js/audio/land.js`) gives `falls`: full within a tile or two of the camera's focus,
  none `FALL_EARSHOT` (8) tiles off, scaled by zoom (`FALL_ZOOM`: none from the default overhead view) or full
  at eye level; `natureMix.falls` plays a recorded bed (`RECORDED_BEDS.falls`). Real recordings only (0002).
  Check: `node tools/nature-audit-check.mjs`.
- Check: `node tools/waterfall-check.mjs` (which maps get falls, pool level against tail-out and banks,
  a year, save/load, edits and a dug pond beside it, fish, beaver crest, the drawn ledge, sheet, foam, mist).

## History

PNW's ditch runs down the foothills at a steady 0.6 levels a tile from its spring at (69,1) to y=12.
`creekFalls` puts the fall at (69,6): 11.39 -> 9.29, 2.1 levels (5 m) in one 8 m tile, pool at (69,7)
standing at 9.61. Other maps' creeks (measured on the 1987 map): Atlanta and Chinandega at most 0.36-0.39
a tile, Serengeti 0.25, Amazon one 0.7 step at the bluff, Sumatra one 1.08 step into the peat; none has a
steep reach, so none gets a fall even if it opted in.

The tile grid can't hold a vertical face: the ground under a fall is a steep 8 m ramp. The curtain arcs
out over it; from the side the gorge bank mostly hides the ramp. A taller, sheer fall would need a drawn
rock face (a ledge mesh) or a finer height grid.

2026-11-20, batch waterfall-polish session 5 (Cole: "a good start, but looks fake and cheap"; he picked rock
ledge + water + mist). The flat curtain read as a tilted pale slab. The ledge answers the old note above: the
ramp stays, the rock stands on it, and the water's arc lands at 0.95 of the tile, just above the ramp. Rock
wings sink toward their ends so they meet a bank at any height without an open side.

