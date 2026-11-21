# 0052 Migration route: green grass within the seasonal loop

## Rules

- Migrating herds (a species with `crossing`: wildebeest, zebra) follow green grass and water within a broad seasonal loop: they swim the river in the south when they arrive and drift north to the park through their season. `js/sim/migration-route.js` holds it all; nothing is saved, everything is read from the land and the calendar.
- `greenness(w, i)`: grown grass × (1 − 0.7 × grazed) × wetness from `w.moist` × 1.3 for a burn's green flush (`scorch` 1–124). Grass types only; burning tiles 0.
- Crossing: `crossingColumn` picks the reach with the greenest grass beyond the bank within ±20% of `def.crossing.x`, with a little chance, on `simRandom` (not `game.rng`: the weather and arrivals keep their sequence). Groups arriving while a crossing is under way (`crossingAt.until`) join it.
- Route: a leader's local walk multiplies its score by `stepWeight` (green², a pull north while behind `driftRow`); `roam()` multiplies by `routeWeight` (green² × a broad band around `driftRow`). Ahead of the drift a herd lingers; it never gets pushed south.
- A herd whose grass is eaten or dried out (`grassGone`, mean green < 0.15 around it) roams twice as often.
- Followers (`keepWithHerd`) stand on a tile with green > `GRAZE_GREEN` within 1.8 tiles of their slot (`greenSpot`: a direct look at about a dozen tiles, the one they stand on first, else the nearest), else their slot as before. Near the slot they step over at a walk (a grazing step), from over 2.5 tiles off they trot as before. Formation, `herdOf`, trips and the leave walk are unchanged.
- A crossing reach whose water runs more than 10 rows inland (a creek or pond joined to the river) is never picked.
- Population, K, season months, arrivals, leaving and the north-fence block are unchanged.
- Checks: `node tools/migration-route-probe.mjs [years] [seeds]` (route difference between years, month-to-month northward share, green under the herds), `migration-crossing-check` (crossing in the middle band, late groups join it), `moments-check`, the motion sweep on serengeti, `calibrate serengeti 15 5`.

## History

Cole's idea (batch cinema-creeks, session 8): the Serengeti herds should follow green grass and water so their route varies year to year, within a broad seasonal loop like the real migration (south plains in the rains, west and north as they dry, back south with the short rains). On this 180-acre range the loop shows as the June–October passage from the river crossing north to the park.

Before: the herds crossed at the same column every year (x 60), walked 14+ rows inland, and wandered by habitat suitability. Over 11 seeds × 8 years on a restored range (fences down), the same month's position differed by 5.3 tiles between years; 98% of month-to-month moves were north or holding.

What decides a migrant's position turned out not to be `roam()`: leaders make about one decision every three days, most of them water trips, foraging or the short local walk (radius about 6), and long roams were tried 3 times in 5 years. So the green-grass weight went into the local walk too, and into followers' slots, where most of the herd stands.

After (same seeds): routes differ by 19.8 tiles between years, 97% of moves still north or holding, crossings spread over the middle 40% of the river. Green under herds standing or feeding rose from 0.76× to 0.82× the range average; the pasture they choose, before their own grazing, 1.06× to 1.09×. A restored range is evenly lush, so there is little greener ground to find; the herds graze down whatever they stand on, which is the ceiling on that measure. Stronger weights (cubed green, a stricter follower threshold) did not move it (0.80–0.81×). On a patchy, part-restored range, or after fires, the choice should show more.

Migrant-days on the map came out 7% lower (11,178 → 10,338, per-seed spread ±3,000): within noise from the changed random sequence. K did not change.

The regression review found followers could hop between green tiles round their slot, and a failing double search on bare ground; `greenSpot` replaced both. Taking the greenest tile made them trot about their place (8.9% of samples, 2.6% at HEAD); the nearest green tile at a walk leaves 1.7% trotting, plus slow grazing steps (all walking near the slot 4.5%). `stepWeight` can favour green over bare ground about 120×: on patchy grass watch for herds stringing out along a strip (motion sweep stall and snake counts).
