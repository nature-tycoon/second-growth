# 0051 Leaf-out by the day (drawing only)

## Rules

- Seasonal looks of temperate deciduous plants, temperate groundcover and dry-forest deciduous trees (`DAY_PHASED`) come from `plantPhaseOn(p, day, x, y, cool)` (`js/data/plants.js`), not the month: each plant has its own leaf-out, summer-dry, autumn-colour and leaf-drop day (`leafDays`): bushes first, then groundcover, then trees, `leafOut` days later still (oaks, Oregon ash), 0–5 days between individuals, up to 3 days later on the map's highest ground (`phenoCool`). Bloom and fruit keep their months, shifted ±3 days per plant.
- Drawing only. Food (`isBlooming`, `isFruiting`), shade (`plantLeafCover`), the terrain's turf tint and the 2D sprites still go by the month; don't feed `plantPhaseOn` into the sim without a balance run.
- `flora.js` asks `phaseOn(game)` for every plant it draws, except a wood's edge fringe (its sapling or bush is not on its own tile, so it keeps `plantPhase` by the month).
- `FloraChanges.find` compares each tile's phase on the last drawn day with today's and redraws only the tiles that turned (a few hundred a day in spring and autumn, none in midsummer); a new month still redraws everything. Anything new that reads `plantPhaseOn` must be on a tile this diff covers, or it shows a stale phase until the month ends.
- Same answer for the same plant, day of year and tile every year (hash of x, y; no rng).
- Climbers on a crown that changes scaffold are carried by `regripCanopy` (0049), now tree by tree.
- Check: `node tools/leaf-out-check.mjs` (spread, order, determinism, redraw counts).

## History

2026-11-20 (idea batch cinema-creeks, session 7). Cole: every bush leafed out on the same spring day. Before, `plantPhase(p, month)` flipped every plant at a month boundary (10 game days). Now 10–90% of Hollis's deciduous plants leaf out over about 12 game days (four weeks of the calendar), oaks last; autumn colour and leaf fall spread over a similar window. The day's diff costs about 1–2 ms per game day on a 120×90 map.
