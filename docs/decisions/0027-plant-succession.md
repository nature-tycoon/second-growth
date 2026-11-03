# 0027 Plant colonization and succession

2026-10-31. Playtesters left farms untended for 100–850 years. On the PNW map almost every tree
ended up Douglas-fir, and camas, Oregon sunshine, skunk cabbage, cattail, bulrush, red huckleberry,
vine maple, oceanspray, Oregon ash, hemlock and redcedar never appeared, nor did a flower-rich
grassland. The Serengeti never grew a fireball lily, baobab or candelabra tree. Plants looked
"extremely uniformly distributed", ferns stayed green for years after a clearcut, and Cole asked
for birch. Cole agreed the design below on 2026-10-31 (paper birch on PNW, meadows about 30–40%
flowers), and then that it sits on top of the earlier tree-dynamics work, [0028](0028-succession-dynamics.md),
merged first: 0028 owns how trees die, wait and regenerate; this record owns which species can
arrive and establish, the moisture they need, and the groundcover community.

## Diagnosis

`tools/plant-establishment.mjs` runs an untended farm headless and reports, for every species on
a map: the share of land it could take, how many seeds arrived and from where (parent, edge rain,
birds, wind, floods, burns, regional rain), germinations, plants alive at years 15/50/100/200/400/800,
and why the other seeds failed (`w.seedLog`, a hook in `trySeed` that costs nothing when unset).
Before this change (seed 1987):

- **No seed source.** A species can only arrive from outside the farm if it is on one of the map's
  edge, wind, berry, flood or burn lists. Missing from all of them: PNW camas, sunshine, cattail,
  tule, skunk cabbage, huckleberry, oceanspray, ash, oak (only remnant trees); Serengeti fireball
  lily, aloe, baobab, candelabra; 12 Atlanta natives; 1–6 on each other map. That was most of the
  reports.
- **Ground too dry.** 79% of PNW land sat at moisture 0.2–0.4 for 800 years. Redcedar needed 0.5
  and soil 0.4, hemlock 0.4 and soil 0.45, so their seed from the north edge almost always fell on
  ground too dry or too sunny: 2 and 28 germinations in 800 years.
- **Fir refills its own gaps.** Douglas-fir established in tree light down to about 0.25, a closed
  stand, and trees died almost only of old age (400 years) or fire. Fir went 81% of trees at year
  100, 94% at 200, 99% at 400 and 800.
- Serengeti untended goes to invasive mesquite (88% of trees at 800); its baobab got 7 seeds in 800
  years and the candelabra tree died out (thickets crowd its seedlings).

## Decision

Shared engine rules in `sim/plants.js` and `sim/environment.js`, plus data calibrated to the real
habitats. No per-species code.

1. **Regional seed rain** (`regionalRain`, after the edge/wind/bird rain). Up to 4 tries a day at
   peak season (× the month's `spread`, × the map's `regionalRain`, default 1, reef 0), each a random
   native, non-exotic species. How its seed travels (`seedTravel(p)`, overridable with
   `p.seedTravel`) sets the odds: wind 1, water 1, birds 0.8, heavy nuts/bulbs 0.25. Water-carried
   seed (aquatic, mangrove, or wet-ground plants) lands within a tile of water. The seed then goes
   through `trySeed` like any other, so what comes up follows the habitat. The edge lists stay the
   bulk; this is the trickle that lets rare natives turn up at all.
2. **Old forest makes its own damp floor.** `forestDamp(w, i)` (`sim/environment.js`) adds
   `0.14 × canopy²` (up to +0.14 under a closed canopy, on top of the old 0.06 × canopy) and
   `(soil − 0.4) × 0.15` for humus. It is shade and humus, not waterlogged ground: windthrow's
   rooting term and fire's dryness read moisture without it, since 0028 gives both their own canopy
   terms. (Counted there too, it threw down 0.6%/yr of grown firs and nearly stopped forest fire.)
   Data: redcedar moist 0.42+, soil 0.3; hemlock moist 0.35+, soil 0.35.
3. **Who regenerates where** (PNW data, on 0028's mortality and waiting saplings). Real lifespans:
   Douglas-fir 750, redcedar 1000, hemlock 500 (were 400/600/400). Hemlock and redcedar need some
   shade to start (light up to 0.7 and 0.85: in an open field Douglas-fir and alder take the ground,
   as on real Cascade old fields), and back to their own seed crops (0028 had raised them 1.5–2× to
   get past the dry ground this record fixes). Douglas-fir is windfirm (0.6, deep-rooted; hemlock
   0.3, redcedar 0.35) and tolerates moist ground up to 0.85. Bigleaf maple needs light 0.42+ and
   snowberry 0.35+ (open woods, not under conifers). **Light only matters to young trees**: a tree at
   g ≥ 0.6 (`CANOPY_G`) has its crown in the canopy, so `updatePlants` gives it its own best light
   (`plantSuit(w, i, p, p.light[1])`); 0028's suppression term still weighs the saplings below.
   Without this, a grown fir in a closed stand, or a grown hemlock in the sun, counted as a poor site.
   The PNW mix then moves the way real stands do: Douglas-fir dominant for the first two centuries,
   hemlock and redcedar building underneath and sharing the canopy by year 400 (Franklin & Dyrness
   1973; Spies & Franklin 1991), with fir coming back where fire or big blowdowns open the ground.
4. **Patches, not carpets.** Natural recruitment odds × `clamp(sqrt(plantAffinity), 0.08, 1)`: the
   same stable noise seed mixes already use, so each species keeps to its own drifts and clumps and
   the ground reads as a mosaic. Invasives are exempt so the difficulty setting still sets how hard
   they press.
5. **Succession in the sward.** On equally good ground a native that lives at least twice as long
   as the resident native can take its tile, at half the push a better-suited plant gets
   (`OUTLIVE` 0.25 × `compete`). Pioneer legumes and weeds give way to bunchgrasses and perennials.
   To keep it from ending as one grass, groundcovers living 10+ years (`TUSSOCK_LIFE`, bunchgrass
   tussocks, sword fern) die back at 1 / life a year and leave a gap the quick-seeding wildflowers
   get into first. Sown Serengeti grassland turns to red oat grass (Themeda) over about 50 years;
   untended, its wildflower share runs 40–60% for the first centuries and settles near 17% by year
   800 (the real Themeda grassland's forb share is roughly 10–20%; before this change it was 65% and
   rising). PNW meadows stay 30–50% flowers. Tried and dropped: a die-off for every herb (bare patches,
   −20% meadow in the restore run) and the takeover at full push (Serengeti flowers fell to 4%).
6. **Shade plants scorch.** A groundcover in light more than 0.15 above its range dies back at least
   `SCORCH` (0.012) × 0.5 a day, however slowly it grows: sword fern is gone within one summer
   after a clearcut instead of three years.
7. **`meadowsHold` only holds meadows.** Gardens and paddocks keep open meadow (a groundcover needing
   light ≥ 0.3), but not ferns and woodland flowers under a fallen tree, which before blocked any
   tree from coming back once gap mortality started (Atlanta lost most of its canopy).
8. **Paper birch** (Betula papyrifera) on PNW: a wet-ground pioneer that wind-seeds into burns and
   bottomlands, beaver food, drawn with the alder model and white bark, in the pioneer mix. Atlanta
   already has river birch.

## Hook for herbivore pressure (workstream E2)

Where herbivores shape the forest mix, keep it in `trySeed` and the growth step, not a new pass:
`trySeed` multiplies `odds` by `grazedRecruitOdds(w, i, p)` (seedlings eaten as they come up) and
growth by `grazedGrowth` (saplings browsed back), both in `sim/grazing.js`. Make those read a
per-tile herbivore load (kg/ha) and a per-species palatability (`browse`, `graze`), and the gap
rules above decide who wins the opening.

### Known gap for E2: mesquite on an untended Serengeti

An untended Serengeti farm turns to invasive mesquite thicket: 73% of trees at year 100 and 82–88% at
200–800 before this change, 60–75% at year 100 after (it varies with the run). This change didn't
cause it. Fire still runs (seed 1987, 100 years: 91 fires and 45k tiles burned before, 99 and 65k
after), and grazing pressure still builds. Mesquite escapes both by design. Grazing pressure skips
invasives entirely (`grazedRecruitOdds`, `grazedSeedlingLost` and `grazedGrowth` return early for
`p.invasive`, decision 0011), as does the savanna rule that a grown tree's roots keep other seedlings
out (`crowded` in `trySeed`). Fire only kills young mesquite, and grown trees survive 60% of burns.
In the real Serengeti, browsers (elephants, giraffe, goats) and hot dry-season fires keep woody
encroachment in check, and Prosopis takes over mainly on overgrazed, fire-suppressed communal land.
E2 should give herbivore pressure a say over invasive woody seedlings too, by palatability: goats and
camels eat Prosopis pods and seedlings, cattle spread the seed. Don't tune it away in the plant
engine. Until then, keeping grassland open on the Serengeti is the player's job (pulling, cool burns).

## Consequences

`node tools/plant-establishment.mjs`, seed 1987, untended: PNW 400 years with animals, Serengeti 800
with `--still`, the other maps 200 with animals. "Main" is before 0027 and 0028; "0028" is the tree
dynamics alone (commit 2366f1b); "now" is both.

- **PNW trees** (main → 0028 → now). Year 100: fir 81% → 89% → 74%. Year 200: fir 94%, no hemlock or
  cedar → fir 80%, hemlock 11%, cedar 6% → fir 64%, hemlock 14%, cedar 13%, maple 7%. Year 400: fir
  99% → (0028 not run) → fir 41%, hemlock 33%, cedar 25%. Fir leads for two centuries and then shares
  the canopy, as in real westside stands (Franklin & Dyrness 1973; Spies & Franklin 1991).
- **PNW natives present**: 20 (main) → 21 (0028) → 31. Cattail, tule, skunk cabbage, red huckleberry,
  vine maple, oceanspray, Oregon sunshine, Oregon ash, oak and paper birch all come up on their own
  and persist (cattail 318 tiles and tule 214 at year 400, huckleberry 297, vine maple 452). Sword fern
  covers the forest floor (8,285 tiles). Camas stays rare (1 plant at year 400): it needs open wet
  meadow, which an untended valley loses to forest. E2 grazing and burns are what keep it.
- **Serengeti at year 800**: meadow 775 tiles (0028) → 3,325, wildflowers 52% → 19% of it as red oat
  grass matures (40–90% in the first centuries; real Themeda grassland's forb share is roughly
  10–20%, Cole's target 30–40%). Mesquite 87% → 57% of trees (the known E2 gap above). Baobab, which
  never established on main, comes up from regional seed.
- **Year 200 elsewhere** (main → now): Amazon Brazil nut 78% → 21% of trees (fig 36%, mahogany 16%);
  Atlanta 1,495 → 2,931 trees and 15 → 24 natives; Chinandega neem 57% → 27% and 18 → 24 natives;
  Sumatra 22 → 26 natives.
- **To watch**: shade-tolerant understory trees can take a large share of the canopy slots, because
  every tile holds one tree and they wait in the understory for any gap: flowering dogwood is 24%
  of Atlanta's trees at year 200 (magnolia and red maple 17%), and mangosteen 30% of Sumatra's. Both
  are real understory species of those forests, but a quarter of the canopy is more than real
  woodland has. If it shows in play, the knob is their light range or 0028's `cndd`, per species.
- **Cost**: `node tools/daily-tick-ab.mjs` on one 60-year Hollis restore world, both load orders:
  against 0028 alone about +2% per `dailyTick` (+2.5% ± 2.1 and −1.7% ± 1.9, noise); against main
  +6% to +12% (about 0.5–1 ms on an ~8 ms tick; 0028's own share was about +3%). `dailyTick` runs
  once a game day: at top speed (8 days a second) about 0.1 ms per frame on average, up to 1 ms more
  on the frame that runs it, inside the 10 ms top-speed ceiling.
- **Seeded `balance-sim restore 15`** (seeds 7, 11, 23; main → 0028 → now): score 61/55/62 →
  61/64/60 → 58/58/69; plant species 24/21/23 → 24/25/24 → 27/29/28; invasive 25/31/27% → 26/24/28%
  → 33/31/21% (mean 27.5 → 28.4, within seed noise); elk, deer, beaver and meadowlark within noise.
- An untended PNW farm has almost no meadow after 50 years, before and after: blackberry and then
  forest take the old fields, as they would on a real abandoned farm west of the Cascades.
  Flower-rich grassland needs something holding trees back (fire, grazing, the player).

## Gotchas

- `w.seedFrom` tags where a seed came from for the diagnostic; set it before any new `trySeed` caller.
- Regional rain uses the game rng, so any change to it shifts every later random roll: compare runs
  by trend over several seeds, not tile by tile.
- `patchOdds` (`plantAffinity`) costs two noise lookups per recruit that reaches the lottery.
- Anything that reads `w.moist` as soil water (windthrow, fire, flooding) should subtract
  `forestDamp(w, i)`; the damp forest floor is for what grows there.
- Checks that pin exact `trySeed` odds divide out `patchOdds(p, x, y)`, and checks of edge or forest
  seed set `def.regionalRain = 0` for the test (see `tools/dispersal-check.mjs`).
- Hemlock (and less so redcedar) won't start in an open field any more; fixtures that sow it in the
  open use another tree.
