# Proposal: more terrain slope

2026-11-09. Wave 2, session 9. Design only: no game code has changed. Cole decides.

## How height works now

**One shared recipe.** Every map except the reef calls `generateHeights` in `js/world.js`. It makes the
PNW valley: land rising from the river in the south to the foothills in the north (5.2 levels across
the map), two layers of soft noise on top, flattened near the river and in old fields, then water
tiles carved below their banks. Four maps add a little of their own afterwards:

- **Serengeti**: raised domes for the kopjes (`KOPJES`, +2.4 levels).
- **Chinandega**: a steep climb to the north and the San Cristóbal cone (`volcanoHeight`), mostly
  in the surroundings.
- **Sumatra**: the peat area counts as a "field", so it is flattened.
- **Reef**: its own seabed (`reefHeight`), not the shared recipe.

So the Amazon, Atlanta, Serengeti and Sumatra all have the same Cascade-foothills tilt underneath.

**Units.** A tile is about 8 m. A height "level" is about 2.4 m (`LEVEL` 0.3 scene units, so the
3D view is true to scale, not exaggerated). Heights live on tile corners in `w.vh`, including the
decorative border.

**Measured relief** (new game of each map, tool in the session scratchpad, land tiles only):

| Map | Height range on the map | Middle 90% | Median grade | 90th pct grade | Land over 15% |
|---|---|---|---|---|---|
| PNW (Hollis) | 16 m | 13 m | 2.5% | 6.4% | 3.8% |
| Serengeti | 17 m | 14 m | 3.3% | 7.2% | 4.7% |
| Amazon | 17 m | 14 m | 3.2% | 6.4% | 2.6% |
| Atlanta | 16 m | 14 m | 4.1% | 8.4% | 4.7% |
| Chinandega | 34 m | 19 m | 4.2% | 9.8% | 6.7% |
| Sumatra | 16 m | 14 m | 2.5% | 8.8% | 7.7% |
| Reef (seabed) | 29 m | 12 m | 2.1% | 10.9% | 3.4% |

The steep tiles are almost all creek and pond banks, not hillsides. Water already mostly runs
downhill: about 3 land tiles in 1,000 are small pits (18 in Atlanta, among its houses), and 3 to 9
creek tiles per map have no lower neighbour.

**What reads height:**

- **Water**: the Hollis water model (`sim/hollis-water.js`) fills basins by corner heights and spills
  over the lowest sill; beaver dam sites and pond size depend on how flat the creek is
  (`DAM_HEAD`, `DAM_CELLS`, 0034). River floods (`events.js reachFrom`) reach up to 9 tiles from the
  river, only onto land less than about 1 level above it. The experimental `sim/watershed.js` is a
  separate water-budget prototype, not in the game yet.
- **Plants**: `elevMoist` (`environment.js`) makes hollows damper and high ground drier, so relief
  changes where plants grow.
- **Fire** spreads faster uphill (`events.js`, up to 1.8×).
- **Animals**: game trails avoid climbs (`animal-trails.js`); steering, log spots and bird flight read
  ground height but don't slow on slopes.
- **Drawing**: the terrain mesh, trees, water surfaces, riverbanks, pollinators, cameras and eye level.
  The mesh has one vertex per corner whatever the relief.
- **Saves** store the height array (`vh` in `WORLD_ARRAYS`). An old save keeps the land it was made
  on; only new games would get new terrain. Nothing needs migrating.

## What the real places look like

- **PNW, Cascade foothills**: valley floor with steep forested slopes behind, often 30–60% grades and
  100 m or more of relief across a kilometre. The farm sits on the flat bottom; the creek runs in a
  small ravine down to the river. *More slope belongs in the north and in the surroundings.*
- **Serengeti**: gently rolling plains, 1–3% grades, broken by granite kopjes 10–30 m high and shallow
  drainage lines (korongos) a metre or two deep that carry water after rain. *Stays flat; add the
  drainage lines, maybe taller kopjes.*
- **Amazon**: two levels: flat floodplain (várzea) by the river that floods for months, and terra firme
  5–20 m higher behind a short bluff, cut by small stream valleys (igarapés). *Not a tilt: a step.*
- **Atlanta, Piedmont**: rolling ridges and stream ravines, 15–30 m of relief, 5–15% slopes. *A bit more.*
- **Chinandega**: already the most relief: volcanic foot-slope. *Keep.*
- **Sumatra**: low mineral hills to the north; the peat is flat to slightly domed (a peat dome is a
  few metres higher in the middle than at its edges). *Hills a bit more, peat flat.*
- **Reef**: seabed. *Leave alone.*

## Options

### A. Turn up the existing relief, add valleys along water (size S)

Give each map two numbers in its definition: `relief` (scales the tilt and noise; PNW 2, Atlanta 1.6,
Sumatra hills 1.5, Amazon/Serengeti 1, Chinandega and reef unchanged) and `valley` (lowers land within
a few tiles of creeks and the river so water sits in a gentle valley, not a slot).

- **Breaks**: seeded checks and tool numbers (heights move); balance a little (`elevMoist`, uphill fire,
  fewer flood tiles on PNW); beaver ponds get smaller on a steeper creek. Saves are unaffected.
- **Frame cost**: none measurable (same mesh). Generation under 1 ms more.
- **Limits**: every map still has the PNW shape. It doesn't fix the Amazon's floodplain or the
  Serengeti's drainage, and doesn't help water flow later.

### B. A landform recipe per map (size M) — recommended

Keep the shared helpers but give each map its own height recipe, the way the reef and Chinandega
already do: PNW foothill ridges and a creek ravine; Serengeti plains with korongos and kopjes; Amazon
terra firme with a bluff down to a flat várzea; Atlanta ridges and ravines; Sumatra hills and a flat peat
dome. Finish with one shared **"drains downhill" pass**: fill the small pits and make every creek bed
fall steadily to the river (a standard priority-flood, a few milliseconds once per new game).

- **Breaks**: as A, more so per map. Beaver dam sites on PNW need checking (they want a creek of about
  1–3% grade). Amazon floods must still reach the várzea (keep it within 1 level of the river).
  Serengeti grass, fire and wallows assume flat open ground: keep its grades under about 4%.
  Structures still sit on flattened pads. Each map is a separate change, so it can ship one map at a time.
- **Frame cost**: none measurable in play. Hills can hide more of the view at eye level, if anything
  less to draw.
- **Gain**: each map looks like its real place, and water already follows the ground, so option C later
  needs no terrain change.

### C. A generated drainage network (size L)

Build the land from its water: raise the terrain, compute where water would gather (flow direction
and flow accumulation), and let the creeks, drainage lines and ponds come from that, then run water
over it each day (the `watershed.js` prototype).

- **Breaks**: the hand-placed creeks, culverts, beaver sites, campaign goals and map stories all assume
  water in fixed places, so each map's layout would need redoing. Largest balance shift.
- **Frame cost**: generation ~10–50 ms per new game; a daily flow model is new simulation cost
  (the prototype plan puts it on the day budget, not the frame).
- **Better done later**, as its own decision once B is in and Cole wants water to actually move.

## Recommendation

**B, one map at a time, PNW first** (it has the most to gain and has the water model and beavers to
test against), then Atlanta, Amazon, Serengeti, Sumatra. Chinandega and the reef stay as they are.
The "drains downhill" pass is the part C would need anyway, so nothing is wasted.

## Acceptance checks for the build session

Before and after each map:

1. A relief check (new `tools/terrain-relief-check.mjs`, from this session's measuring script): each
   map's height range and grades sit in its band (PNW 40–80 m, median 5–10%; Serengeti median under 4%,
   kopjes kept; Amazon várzea within 1 level of the river, terra firme 5–20 m above), no land pits, and
   every creek tile has a lower neighbour downstream.
2. `node tools/hollis-water-check.mjs`, `beaver-pond-check.mjs`, `fish-water-check.mjs`: ponds hold,
   beavers still find sites and ponds stay pond-sized, fish stay in deep enough water.
3. `node tools/animal-steering-check.mjs`: no animal stuck on a slope or bank.
4. `node tools/balance-sim.mjs restore 15` (seeded, per the balance skill): populations and plant cover
   within the usual spread; note any fire or flood change.
5. `node tools/play-profile.mjs <map> fast 3`: no frame-time change beyond noise.
6. A screenshot from the default camera and eye level for Cole, before and after.
7. Old saves load unchanged (their heights come from the save).
