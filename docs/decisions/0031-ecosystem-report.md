# 0031 Ecosystem Report: vital signs against a reference ecosystem, carbon, badges

2026-11-01. Cole asked to improve the metrics screen: more detail on ecosystem health, carbon
storage, and make it a game. The old report was one score breakdown, a land-cover list and a
score chart. Cole chose concept B of three mockups (a road to the reference ecosystem), with each
card opening a deep dive like concept A's tabs, and concept C's badges.

## Decision

**The numbers live in the sim, the screen only draws.** `js/sim/eco-metrics.js` (no DOM) computes
everything from the world and game state. `game.updateEco()` runs it at the start of a game, after
a load, in `monthlyTick`, and when the report opens. Never per frame. The postcard and analytics can
call `ecoMetrics(game)` or read `game.cache.eco`. `js/ui/eco-report.js` draws the report, and
`ui.openReport(view)` opens it on any tab.

**Each map has a reference ecosystem** (`js/data/eco-reference.js`). It holds the intact version
of the land (old-growth Douglas-fir forest for Hollis, intact acacia savanna for the Serengeti, a
living reef for the reef), its published carbon figures, the share of land each habitat takes,
its top predators, and five stage names from the starting farm to "reference-like".

**Six vital signs, each 0–1 of the reference:**

| Land maps | Measured from |
| --- | --- |
| Carbon | living plant carbon / reference stand carbon on the reference forest share |
| Plant layers | meadow, shrub, forest and mature-forest tiles against the reference shares (mean) |
| Food web | three levels (plant and insect eaters, hunters, top predators); each level counts in full at 70% of its species present |
| Native plants | native cover (/85%) and kinds (/the map's plant target), scaled down by up to 60% by invasives (full at 30% cover) |
| Water | marsh+pond area, mean water quality, shaded creek share (whichever the map has) |
| Old trees and deadwood | big old native trees and logs+snags per land tile |

The reef swaps in its own: living coral, coral variety (kinds and soft corals), food web, clean
reef (algae, starfish, bleaching), seagrass, and old coral heads. The **stage** is the mean of the
six against 20/40/60/80%. The **hint** names the weakest sign's weakest part, or the food web's
missing level.

Hunters are species with a `prey` (or `challengePrey`) list. The top predators are named per map,
because prey lists alone would make a heron or an owl an apex.

**Badges are for show and pay no grant**, so the money balance is unchanged. Each vital sign has
bronze, silver and gold at 30/60/90%. Health has them at 50/70/90, and a streak of years with
rising health at 2/3/5. They're checked monthly and announced once. Badges already met on day one
are stored as day −1 ("from the start"), not announced.

**Saved state** is `stats.eco = { start, blue, badges, streak }`. `start` is the farm's numbers on
day one, for "since you arrived". An older save gets its baseline the day it's first loaded, and
the report then says "since Year N". Each month's `history` entry gains `c` (total carbon) and `v`
(the six signs, two decimals) for the trend lines.

## The carbon estimate (labelled as an estimate everywhere it shows)

A tile is about 67 m² (the 180-acre maps are 120 × 90 tiles), room for one canopy tree's share
of a stand.

- **Trees**: `agb × 0.47 × tileHa × size × g² × age`. `agb` is the reference stand's above-ground
  biomass. 0.47 is the IPCC default carbon fraction (2006 Vol. 4 Table 4.3). `size` is the
  species' `heightM` over the reference canopy height (`href`), clamped to 0.3–1.6, so tall
  long-lived species store more. Biomass grows with the square of growth `g`. The age factor runs
  from 0.75 at maturity to 1 at three times the species' maturity age, because old trees keep
  thickening. A full mature stand at reference height holds exactly the published figure, which
  `tools/eco-metrics-check.mjs` asserts. Read real height from `heightM`, never the drawn height
  (0024).
- **Shrubs**: 12% of a tree tile at full growth. **Grass and herbs**: IPCC 2006 Table 6.4
  above-ground biomass (2.3–6.2 t d.m./ha).
- **Deadwood**: a log is 40% of a reference tree tile, a snag 30%, a stump or brush pile 5%.
- **Soil to 30 cm**: IPCC reference stock (`soc`), times `fLU + (1 − fLU) × soil`. `fLU` is what
  long-cultivated land keeps (IPCC 2006 Table 5.5), and the game's soil-health array (0–1) wins
  the rest back. Marsh and pond beds use the wetland-soil stock.
- **Blue carbon**: mangrove and seagrass tiles bury carbon each month at published rates, added
  up in `stats.eco.blue`. The game counts it month by month, not as a one-off stock, because a
  new meadow doesn't come with centuries of buried mud. Living seagrass is counted separately.
- **Corals are not carbon.** A growing reef builds calcium carbonate and releases a little CO₂ as
  it does. The reef's carbon is its seagrass and the cay's trees, and the report says why.
- **Equivalents**: CO₂ = C × 44/12. A typical US passenger car emits 4.63 t CO₂ a year (EPA).

Reference figures (`js/data/eco-reference.js`):

| Map | Stand AGB, t d.m./ha (IPCC 2019 Table 4.7) | Soil to 30 cm, t C/ha (IPCC 2019 Table 2.3) | fLU |
| --- | --- | --- | --- |
| pnw | 354.1 temperate oceanic, N/S America, secondary >20 y | 64 warm temperate moist HAC (wetland 135) | 0.69 |
| atlanta | 84.5 subtropical humid, N/S America, primary | 55 warm temperate moist LAC (135) | 0.69 |
| serengeti | 69.6 tropical dry forest, Africa | 21 tropical dry HAC (22) | 0.58 |
| amazon | 307.1 tropical rainforest, N/S America, primary | 38 tropical moist LAC (68) | 0.48 |
| sumatra | 413.1 tropical rainforest, Asia, primary | 52 tropical wet LAC (49) | 0.48 |
| chinandega | 127.5 tropical dry forest, N/S America, primary | 50 tropical dry volcanic (22) | 0.58 |
| reef (cay) | 38.3 tropical shrublands, Asia | not counted | — |

PNW stands go far higher than the IPCC class value: Smithwick et al. (2002) measured
195–1,127 t C/ha in total ecosystem carbon across 43 old-growth stands, area-weighted average 671.
The game uses the conservative IPCC value and could raise it toward Smithwick's figures for
coastal old growth.

Sources:
- IPCC (2019) *Refinement to the 2006 IPCC Guidelines*, Vol. 4: Ch. 4 Table 4.7 (above-ground
  biomass in natural forests) and Ch. 2 Table 2.3 (reference soil organic carbon).
  https://www.ipcc-nggip.iges.or.jp/public/2019rf/vol4.html
- IPCC (2006) *Guidelines*, Vol. 4: Table 4.3 (carbon fraction 0.47), Table 5.5 (land-use
  factor, long-term cultivated), Table 6.4 (grassland above-ground biomass).
- Smithwick, Harmon, Remillard, Acker and Franklin (2002), Potential upper bounds of carbon stores
  in forests of the Pacific Northwest. *Ecological Applications* 12: 1303–1317.
- Mcleod et al. (2011), A blueprint for blue carbon. *Frontiers in Ecology and the Environment* 9:
  552–560. Burial rates: mangroves 2.26, seagrass 1.38 t C/ha/yr.
- Fourqurean et al. (2012), Seagrass ecosystems as a globally significant carbon stock. *Nature
  Geoscience* 5: 505–509. Living seagrass biomass 2.52 t C/ha.
- US EPA Greenhouse Gas Equivalencies Calculator, calculations and references: 4.63 t CO₂e per
  passenger vehicle per year (2019 revision).

## Gotchas

- Water quality is derived state that a load recomputes, so compare metrics across a save only
  after `refreshEnvironment()` (the check does).
- `ensureBaseline` must run after `updateScore`, since the baseline stores the day-one score.
- The badge list's vital order must match `landVitals` / `reefVitals`. Badges index the vitals by
  position.
- Spanish: only Chinandega plays in Spanish, so the reef-only strings are English. The check
  asserts every other report string has a Spanish entry in `js/lang/es.js`.

## Performance

One pass over the tiles, about 2–6 ms on an M-series Mac (Amazon and Sumatra slowest). It runs
once a month, next to `wildlife.monthly`'s existing 8–27 ms month-change hitch (performance review
2026-10-23, finding 5), and when the report opens. Nothing runs per frame.

## Checks

- `node tools/eco-metrics-check.mjs` (headless, every map). Metrics are finite and in range. A
  month adds history. The numbers survive a save and reload. Older saves get a baseline. A full
  reference stand matches the published carbon figure. Badges are announced once. Seagrass buries
  carbon. Spanish coverage.
- `nice -n 15 node tools/eco-report-browser-check.mjs [--shots]`. Every tab opens on every map at
  812×375, 844×390 and 1280×800, fits the screen, has no NaN, and has nothing wider than the
  dialog.

## Open

- Analytics and the postcard don't read `ecoMetrics` yet. Both can call it.
- The reference shares (`cover`, `wet`, `big`, `dead`) are judgement calls for a game-sized
  property, not measured values. Tune them against long `balance-sim` runs if a sign saturates
  too early or never moves.
