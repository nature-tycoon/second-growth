# 0035 Fire, randomness and deadwood

2026-11-01. Workstream J of Cole's idea list. Five items: fires hit the same spots every game, snags
stand in a grid, a burn stays a wall of snags and logs, loosening soil should turn up rocks, and fire
as an ecological check on Douglas fir and mesquite (left here by 0033).

## 1. Each new game has its own weather and fire (run seed)

**Cause.** The game behind the welcome screen always started with `newGame(1987)`, and its random
numbers came from `mulberry32(seed * 31 + 7)`. Unless a saved farm was being replaced, the player
kept that game, so every playthrough replayed the same weather, fires and events. Replacing a saved
farm did pick a random seed, but used it for the map layout as well.

**Decision (Cole).** The map layout keeps its fixed seed (1987, the land everyone knows). Each new
game gets a random **run seed** (`Game.randomRunSeed()`, 32 bits) for `game.rng`: weather, fires,
floods, storms and events.

- `newGame(seed, mode, difficulty, map, runSeed)`. Left out, `runSeed` is `seed * 31 + 7`, the old
  sequence, so every tool and check that calls `newGame(seed)` reproduces exactly as before,
  `balance-sim` included. The game's own entry points (`main.js` at boot and after a failed load,
  `ui.startMode` for a new farm) pass a random one.
- The `second-growth-pending` hand-off takes an optional `runSeed`, so a browser check can fix it.
- Saves store `runSeed` next to `seed` (the layout seed, which "then and now" regenerates from);
  the RNG state itself was already saved, so a farm carries on exactly where it left off. Older
  saves load with `runSeed: null`.
- The invasive seed-bank roll in `burnTile` used `Math.random`; it uses `game.rng` now.
- The wildlife still draws from `Math.random` (128 sites), so in the browser a run differs even
  with the same run seed. Headless tools seed `Math.random` as before.

## 2. Deadwood where the tree stood

Snags and logs were drawn at the middle of their tile, so a burned stand stood on a grid.
`sim/ground-obstacles.js` now places them, and `flora.js`, the walkers (0023) and perched birds
read the same functions:

- `snagSpot`: the trunk spot the living tree had (`trunkSpot`, the same hash). `snagPose`: a lean
  of up to about 6° each way (the two together at most about 9°), a height of 0.8–1.15 of the model,
  and up to 40% shorter as it rots toward its fall (tops break off first). `snagTop` gives the
  broken top where a perched bird sits, turned as the drawing turns it (Euler XYZ); `CanopySite`
  takes the lean too.
- `logSpot`: the log lies out from the stump spot, downhill on a slope (trees fall downhill),
  elsewhere along a direction that turns slowly across the map (`valueNoise`), so neighbouring logs
  lie roughly parallel, as after a storm, each with up to ±50° of its own. The centre stays inside
  its tile. The windstorm's direction isn't stored, so wind logs aren't aligned to it.
- Walkers cache each tile's deadwood spot (`cachedDeadwood`) as they do trunks.

## 3. A burn turns back into meadow, not a wall

**What was found.** Nothing stops ground plants on a snag or log tile: `terrainFit` and
`plantSuit` ignore deadwood, and the drawing puts groundcover under it. A probe of a 466-tile crown
fire in a mature PNW fir stand found ground cover on deadwood tiles as high as anywhere else in the
burn (0.7–0.8 at years 2–5, falling as young fir shades it). What made it read as a wall was timing:
no snag could fall for 8 reference years (about 16 years for Douglas fir on PNW ground), and then
most came down together, as bright, fresh-looking logs.

**Decision (Cole: keep realistic lifespans).**

- Each snag has its own standing life, `snagLife(w, i)` = `DECAY.snagFall` × 0.1–1.6 (a hash per
  tile, nothing saved), then falls with odds `DECAY.snagRoll` (0.004) × rot rate a day. A PNW fir
  snag (rate about 0.54): 10% down by about 6 years, half by about 16, 90% by about 25, the last
  near 35, before storms take more. That matches fire-killed Douglas fir: half-life 12–16 years,
  and big firs lose under half their snags in 30 (Russell et al. 2006, *For. Ecol. Manage.* 232).
  Western redcedar snags (rot rate 0.35) stand for decades longer, as real ones do.
- A fire brings down a snag past its own standing life (`burnFeaturesAndWildlife`), not past the
  old fixed age.
- Logs keep their 0028 lifespans (decades on PNW). A sound log loses its bark and weathers grey
  within about a third of its sound years, and beds into the ground (drawn up to 15% lower and
  0.035 deeper) before it turns rotten, mossy and slumped. Nurse logs work as in 0028.

## 4. Loosening the soil turns up stones

`turnUpStones` (`tools.js`): a loosened tile with no feature or tree holds stones if
`hash2(x, y, 71)` is under the map's `stones` (a quarter of that within 3 tiles of water: river
silt). It's fixed per tile, so loosening again finds nothing new. They become natural `F.ROCKS` (no
`PLACED` mark, so Demolish leaves them) with `featureAge` `STONES` (config.js), drawn as a small
heap (0.45–0.7 of a rock pile, off the tile's middle). The first time, a note says they shelter
snakes, lizards and beetles. The rock layer feeds `distRocks` like any rock pile. Undo takes them
back with the rest of the stroke.

| Map | `stones` | Why | Measured per loosened tile |
| --- | ---: | --- | ---: |
| PNW | 0.05 | glacial outwash and till | 4.5% |
| Chinandega | 0.035 | volcanic scoria and lava stones | 2.9% |
| Atlanta | 0.03 | Piedmont clay, quartz and granite rubble | 2.3% |
| Serengeti | 0.03 | granite grit under the crust | 2.7% |
| Sumatra | 0.01 | deep weathered and peaty soils | 0.7% |
| Amazon | 0.004 | old, deep oxisols | 0.3% |

## 5. Fire as an ecological check

### PNW: unchanged rate (Cole agreed)

More fire would favour Douglas fir, not hold it back. Mature fir has the thickest bark of the
westside conifers; hemlock and redcedar are the fire-sensitive ones, and westside Douglas-fir
forests burn every 100–400 years and stay fir-dominated for centuries (Agee 1993, *Fire Ecology of
Pacific Northwest Forests*). Where frequent fire does keep fir out is prairie and oak savanna, and
the game already kills young fir (no resprouting, under 0.5 growth) in any fire. The PNW fire rate
is unchanged. What changed there: broadleaves that resprout (alder, birch, cottonwood, maple, ash,
oak) now sprout back after fire (below).

### Serengeti: a real grass-fire regime (Cole: every 3–5 years)

Untended, the Serengeti burned about 1.5–2% of its land a year in the first 40 years (a tile every
50–70 years), against one to three years for much of the real Serengeti's grassland (Holdo et al.
2009, *PNAS* 106; Probert et al. 2019, *Glob. Change Biol.* 25). Three causes:

- **Grass on hardpan never burned.** `Events.fuel` returned 0 for any `T.GRAVEL` tile, but on the
  Serengeti (and the reef) gravel is the crusted hardpan, and the soil builders' grass grows on it:
  a third of the meadow was a firebreak. On a `hardpan` map, gravel with groundcover now burns by
  its plants.
- **A front moved one tile a day** and every fire ended in rain, after about 500 tiles. A savanna
  grass fire runs far faster than a forest fire. `climate.fireSpeed` (Serengeti 2) runs the
  spread step that many times a day; a tile still burns for its own 2–3 days, and a crown fire
  always moves at 1.
- **The fire season** now runs May to September (`fireMonths` [4..8], was May–August), with
  `fireRate` 8 (was 5) and `fireGap` 8 days (was 18).

**Routine fires (`climate.routineFires`).** With fire most dry seasons, the alarm would be
stressful and wrong for the map. A natural grass fire on such a map gets one calm `info` note for the
season's first, emits `'grassfire'` instead of `'fire'` (so pause-on-events doesn't stop the game),
shows no banner, and goes out without a toast. Crown fires, controlled burns that escape and every
other map are unchanged. Analytics still counts them (`wildfire` with `routine: true`).

### Trees that resprout (every map)

`topKill` (`events.js`): a tree with `p.resprout` past seedling age (1.5 years) that a fire would
kill is burned back to a sprout (0.1 growth) on its old roots instead, keeping its age; 10% are
root-killed anyway. Seedlings die. That's the savanna's fire trap: with a grass fire every few
years, saplings are burned back again and again, and only those that outgrow the flames between
fires become trees (Bond & Midgley 2001; Higgins et al. 2000). Mesquite adults resprout after
top-kill and few are root-killed, while seedlings are vulnerable for their first year or two
(Wright et al. 1976). On the Serengeti that's mesquite, the acacias, desert date, commiphora and
sausage tree; elsewhere the broadleaves that already had `resprout` (PNW alder, maple, oak...;
Atlanta's hardwoods; Chinandega's guácimo). Conifers and palms don't resprout. A burned-back sprout
leaves no snag.

### What fire does and doesn't do to mesquite

Measured (results below): fire now holds back mesquite *seedlings* in the grass, as it does in the
field, but it doesn't bring mesquite's share of grown trees down. The share is set by the thickets:
under a closed mesquite canopy there's almost no grass (ground cover 0.05–0.07), so the fires that
burn it are weak, and the grown plants resprout. That matches the field too: fire alone doesn't
clear established *Prosopis* stands. Clearing them is the player's work (pulling,
`--pull=mesquite` in `herbivore-pressure.mjs`), and fire then keeps the cleared grassland clear.

## Results

`succession-check --mode idle --years 200 --veg`, seeds 1 and 2, before (the water-wetlands
commit, 699c712) and after, run side by side at `nice -n 12`:

| Run | Fires in 200 y | Tiles burned a year, years 120–200 | Largest tree share, year 200 | Others |
| --- | ---: | ---: | --- | --- |
| PNW 1 | 57 → 60 | 83 → 88 | fir 67% → 66% | hemlock 20 → 14%, maple 5 → 9% |
| PNW 2 | 61 → 65 | 85 → 70 | fir 68% → 65% | hemlock 14 → 14%, maple 7 → 9% |
| Serengeti 1 | 221 → 297 | 1,301 → 2,885 | mesquite 83% → 94% | fever tree 6 → 2%, sycamore fig 5 → 1% |
| Serengeti 2 | 212 → 285 | 1,123 → 2,767 | mesquite 85% → 94% | fever tree 5 → 2%, sausage tree 3 → 1% |

- **PNW** is unchanged within seed noise: the same fire, fir still leads, and resprouting maple and
  birch gain a little. Shade-tolerant trees (hemlock + cedar) in mature forest: 20/15% → 16/15%.
- **Serengeti fire** is where Cole asked: about 28% of the land burns a year once the grass is
  back (a tile every 3–4 years), against about 12% before.
- **Serengeti mesquite went up, not down.** Before, every burned tree under 0.5 growth died, so fire
  killed mesquite saplings outright. That was unrealistic, and it was part of what held mesquite to
  84%. With resprouting, mesquite past 18 months comes back from the root and outgrows the next
  fire. An 80-year probe (seed 5) separated the parts: the new fire regime alone leaves mesquite
  where it was (71% with or without it at year 100), and turning off mesquite's resprouting alone
  takes it to 50%. The native riverine trees (fever tree, sycamore fig) don't resprout and lose
  share to the extra fire. Separately, on every version the meadow gives way to invasive ground
  (`inv` habitat 6,000–7,000 tiles at year 200, famine weed and lantana), which is older than this
  change.
- `balance-sim restore 15`, seeds 7 and 11 (Hollis): year-16 score 63.2 → 61.3 and 62.1 → 63.3,
  meadow up (1,635 → 1,880, 1,805 → 1,926), forest and mature trees about the same. Animal counts
  reshuffle as usual between seeds. The fires differ because the bank roll now draws `game.rng`.
- `campaign-sim-serengeti` completes (day 601 → 532).
- Performance: placing 3,000 snags and logs costs 1.7 ms per full plant rebuild (about 280 ms on
  PNW), and `flora-rebuild-bench pnw` is within noise. A burning Serengeti runs its fire step twice
  a day.

**Open (asked of Cole):** whether to add the savanna's grass competition, which slows saplings and
sprouts in a thick sward, so the fire trap holds resprouters down as it does in the field
(Riginos 2009, *Ecology* 90). That would act on mesquite and the acacias alike.

## Checks

- `node tools/run-seed-check.mjs`: two run seeds differ in weather and fire on the same land; a
  run seed replays exactly; no run seed gives the old sequence; a save keeps the run seed and its
  next draw; an old save without one still loads.
- `node tools/fire-deadwood-check.mjs`: snags on the trunk spot and spread through the tile (not
  centred); logs lie every way; the snag's top moves with its lean; snags thin out (10% / half /
  90% down); ground cover under deadwood 3 years after a crown fire; stones at each map's rate,
  natural, once per tile; resprouting trees burned back, seedlings and conifers killed; hardpan
  grass burns; routine grass fires (one note, no alarm, a front of two tiles a day).
- `deadwood-check` and `ground-obstacles-check` read `snagLife` and `logSpot` now.

## Gotchas

- Deadwood spots are shared code: change them in `ground-obstacles.js` only.
- `snagLife` and `snagPose` are hashes of the tile: nothing new is saved, and a snag that falls and
  is replaced later on the same tile keeps the same life and lean.
- `STONES` is a `featureAge` value on natural `F.ROCKS`. Map-made boulders (Serengeti kopjes) keep
  age 0 and the full-size model.
- Tools that want a random run seed must pass one; leaving it out is deliberately deterministic.
