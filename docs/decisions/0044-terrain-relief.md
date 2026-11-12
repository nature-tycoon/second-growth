# 0044 Terrain relief: a landform per map, and land that drains downhill

2026-11-09. Cole chose option B of [the terrain slope proposal](../proposals/terrain-slope.md).

## Rules

- Each map's heights come from `generateHeights(w, fields, land)` (`js/world.js`). `land.base(x, y, h)`
  returns the map's own height in levels (2.4 m; a tile is 8 m) at each corner, given the old shared
  valley's `h`. The recipe lives beside the map's generator: `pnwLand` (world.js), `piedmontLand`
  (atlanta-world.js), `floodplainLand` (amazon-world.js), `plainsLand` (serengeti-world.js), `hillsLand`
  (sumatra-world.js). Chinandega (its volcano) and the reef (its seabed) are unchanged and don't drain.
- `land.drain` makes the land drain (`js/maps/landform.js`): `fillPits` fills every closed hollow before
  the water is dug (a filled hollow leans 0.02 levels a corner toward its way out), then each pond is
  levelled on its own (not all ponds to the lowest one) and gets a bank on its low side standing above
  its water, then `creekDownhill` sinks any creek tile that steps up on its way to the river.
- **A pond dug into a slope needs that bank.** Without it the Hollis stock pond's water stood above the
  land below it, and the water model counted 2,900 tiles of hillside as its basin (`hollis-water-check`).
- **Anything that should shape where water goes belongs in `base()`, not after `generateHeights`.**
  Heights added afterwards aren't drained: the Serengeti's kopjes, raised afterwards at first, dammed a
  korongo into a 1 m pond.
- **Noise that fades out must only add height.** A dip that eases back to nothing (at the peat's edge,
  by the river, down the hill) leaves a rim that closes a basin, and the drains pass fills the basin
  into a flat shelf: Sumatra's hills first had a 4.5 m one. The old shared recipe's levelled fields
  still leave a few such dips at their edges, now filled into level patches about 1 m deep.
- Old saves keep the land they were made on (`vh` is saved); only new games get the new land.
- The land tool (`shiftTile`) raises up to 40 levels, not 14: at 14 it pulled the new hilltops down, and
  raising one charged money for nothing (`tool-actions-check`).
- `node tools/terrain-relief-check.mjs [maps]` checks each map's height range and grades against its
  band, the Amazon's várzea staying in flood reach, no land in closed hollows and no creek in still water.

## The landforms

| Map | Real landscape | What the land does |
|---|---|---|
| PNW | Cascade foothills | Valley floor by the river, foothills rising ever more steeply to the north (spurs and draws), the ditch in a swale that deepens up the hill, steeper again in the forest beyond the fence |
| Atlanta | Piedmont | Ridge to the north, Hollins Creek in a ravine down the middle with the lots on its flanks, a low floodplain strip by the river |
| Amazon | Várzea and terra firme | Flat várzea about 12 tiles deep, a short bluff, terra firme 10–17 m above, the igarapé in its own valley rising gently upstream |
| Serengeti | Plains, korongos, kopjes | Long swells at 1–3%, korongos 1–2 m deep under the old erosion gullies (so the charco sits on one, as stock dams do), kopjes about 10 m |
| Sumatra | Low hills and peat | Rolling mineral hills and the stream's valley in the north, easing out onto the flat peat |

Measured on a new game of each (`terrain-relief-check`; range is the middle 90% of land height):

| Map | Range before → after | Median grade | 90th pct grade | Land over 15% | River flats (lv) |
|---|---|---|---|---|---|
| PNW | 11 → 33 m | 2.5 → 5.0% | 6.4 → 17.0% | 3.8 → 14.7% | 0.61 → 0.61 |
| Atlanta | 12 → 23 m | 4.1 → 6.8% | 8.4 → 12.5% | 4.7 → 7.4% | 0.80 → 0.91 |
| Amazon | 12 → 13 m | 3.2 → 2.2% | 6.4 → 12.5% | 2.6 → 7.5% | 0.69 → 0.52 |
| Serengeti | 12 → 9 m | 3.3 → 1.8% | 7.2 → 9.0% | 4.7 → 6.0% | 0.63 → 0.54 |
| Sumatra | 12 → 23 m | 2.5 → 4.7% | 8.8 → 14.8% | 7.7 → 9.6% | 0.39 → 0.39 |

PNW rises about 44 m from the river to the north fence and about 90 m to the ridge beyond. Most of its
steep land is the northern foothills and the ditch's ravine; the farm itself sits on 2–6%. The
steepest tiles on every map are still creek, pond and river banks, and structure pads cut into a slope.

## What it changed

- **Balance (PNW, `balance-sim restore 15`, seeds 7, 11, 23).** Score, forest, mature trees and
  invasives stay within the spread between seeds. Visitors fall 2–6% and the rating 0.25–0.55 stars
  in every seed (monthly averages over 15 years). The habitat by the scripted trail is unchanged, but the animals spread differently over
  the new land: robins and tree frogs come by it less, deer and elk more, so the trail sees one or two
  fewer species a month. The scripted plan's trail is fixed; a player routes theirs.
- **Moisture.** `elevMoist` already made hollows damper and high ground drier (`environment.js`), so the
  ravines and swales are damper and the PNW foothills drier (its high-ground term is capped at −0.08).
  Not retuned.
- **Fire** runs faster uphill (`events.js`, up to 1.8×); the PNW foothills burn a little faster upslope.
- **Floods.** The Amazon's and the Serengeti's river flats now stand lower, so their floods reach a
  little more land; Atlanta's a little less.
- **Seeded checks** follow a different path on every changed map (the land is different).
  `animal-positioning-check` spawned its thirsty zebra, by luck, right on its drinking spot, so it drank
  there instead of walking over; the test now places it a step back. `salmon-bear-check` wanted a catch
  in each of six seeded runs; bears catch about two a run (24 in 12 runs before, 21 after), and the new
  land moved one run onto none, so it now asks for six catches in all and at most one empty run.
- **Drawing counts** (`perf-guard-check`, baseline refreshed for PNW and Sumatra). PNW's grown forest
  fixture has more closed canopy without groundcover, so forest-floor ferns rose from 174 to 453
  (192 triangles each, no shadow: about 54k triangles over the whole map). Close-up shadow triangles rose
  17% (+35k), while the play view fell 6% in triangles and shadow triangles. Close-ups draw few objects
  (performance review), so it's well inside the budget. Sumatra's close-up draws fell 11%.
- **Motion sweep.** On Sumatra seed 1987 a seedling sprouted on day 2 under a sun bear foraging on the
  spot, and `settleBody` never re-checks an animal that hasn't moved (its `settleKey` covers only its
  own position and heading), so it stood in the stem for 168 frames. That's an old bug the new land set
  off by chance; seeds 91, 7, 42, 5 and 13 show none. It's a KNOWN line in `motion-sweep-check`, next
  to the snag and log one.

## Checks

`terrain-relief-check`, `hollis-water-check`, `beaver-pond-check`, `fish-water-check`,
`animal-steering-check`, `animal-positioning-check`, `home-range-check`, `tool-actions-check` and
`salmon-bear-check` pass. The headless suite's other failures (animal-culling, animal-eyes, hunt,
wildlife-additions, wildlife-diagnostics) fail the same way without this change.
