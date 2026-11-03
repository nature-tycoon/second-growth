# 0036 Savanna grass recovery: perennial grass takes the meadow, lantana held back

2026-11-01. Follows 0035, which left this open: on an untended Serengeti the meadow turned from
grass to the pioneer legumes, then to invasive lantana with mesquite under it.

## What was happening

Untended for 200 years (`succession-check --map serengeti --mode idle --veg`, seeds 1 and 2), the
meadow went from dropseed (about 1,700–2,000 tiles at year 30) to rattlepod and wild indigo
(`crotalaria`, `indigofera`, 2,000–2,600 tiles from year 40 to 100). Red oat grass never passed a few
hundred tiles, and lantana ended on about 6,000 tiles, with `inv` habitat at 5,800–6,900. Mesquite
was 90–93% of trees. `tools/savanna-sward-probe.mjs` traced it:

1. **The pioneers fade on recovered soil, and that left the hardpan bare.** Dropseed (`pioneer:
   0.2`) loses suitability once the soil is past its pioneer level, so that better grasses can take
   over. But the legumes and dropseed raise `w.soil` on crusted hardpan too (it reached 1.0 nearly
   everywhere by year 90), while the crust (`T.GRAVEL` on a `hardpan` map) stays until enough
   rooted plants break it (`rootsLoosen`: five rooted neighbours, no trampling). On crust, dropseed's
   0.6 terrain fit times the 0.35 pioneer floor is under 0.3, so it died back. Nothing else can root
   in crust, so the tile went bare and never loosened.
2. **The legumes never faded at all.** They had no `pioneer` level, so once the soil was rich they
   were the best-suited plants on the land. Red oat grass replaces a resident only through the
   `outlives` rule (a 6% chance per seed), and few red oat seeds arrive.
3. **Perennial grass seed couldn't reach bare ground.** Grass spreads two tiles from a grown parent,
   and the regional and edge seed rain brings a few seeds a year. Loosened bare soil where red oat
   would grow (1,500–2,000 tiles at years 40–60) stayed empty for decades.
4. **Lantana took what grass didn't.** A woody seedling in a thick grass sward has a tenth of the
   chance on the savanna, and dry-season drought kills most of the rest, but bare ground and legume
   patches have neither. Grown lantana (a bramble: 0.85 shade) shades the ground bare, so the
   thicket has no grass fuel, and fire burned it back to a sprout (0.12 growth) that regrew in weeks.
   80–90% of young mesquite stood under lantana on bare ground.

The real reference: recovering East African rangeland goes from annuals and legumes to perennial
grasses (Themeda, Digitaria, Pennisetum) within years to decades, and a vigorous sward with fire
every few years holds lantana to thickets and gullies.

## Decision

Five small rules. Cole saw the design first: legumes fade on rich soil, then measure
lantana and add fire only if needed (it was).

- **The legumes fade too** (`plants-serengeti.js`): rattlepod `pioneer: 0.35`, wild indigo `0.4`.
  Legumes win on nitrogen-poor ground and lose to perennial grasses once the soil has it.
- **Not on crust** (`plantSuit`): the pioneer fade doesn't apply to a `crustOK` plant on crusted
  hardpan, where nothing else can root to take its place. The pioneers hold the crust until their
  roots break it (`rootsLoosen`), then fade on the loosened soil. Only the Serengeti has plants that
  are both `pioneer` and `crustOK`.
- **Herds carry grass seed in their dung** (`grazeDay`, `sim/grazing.js`; map `dungSeed`, Serengeti
  1). Each grazer's feeding day, with chance `dungSeed × weight × the month's seed spread`, takes the
  seed of a grown grass it ate (picked in proportion to what it ate where) and drops it on a random
  tile of its day's range through `trySeed`. Wildebeest, zebra and gazelles pass viable grass seed
  this way (Janzen 1984, "foliage is the fruit"). Only the Serengeti sets it: on Hollis it added
  800–1,200 meadow tiles by year 16 and slowed the planted forest (mature trees 55 → 33 and 51 → 36,
  seeds 7 and 11), and a farm with a few deer isn't where it matters. With `dungSeed` unset no random
  number is drawn, so other maps run exactly as before (seeded `balance-sim restore 15` is identical).
- **A hot grass fire root-kills lantana standing in the grass** (`burnTile`, `grassAround` in
  `events.js`; plant number `grassFireKill`, lantana 0.6). The root-kill chance is
  `grassFireKill` × the mean grass (`grass`, `tallgrass`) growth on the tile and its four
  neighbours, read before the fire burns the grass back. Hot fires on a heavy grass fuel load kill
  lantana seedlings and many grown plants (Day et al. 2003, *Lantana: current management status*,
  ACIAR). Inside a closed thicket there's no grass, so it survives and resprouts, as in the field.
  Controlled burns already kill invasive shrubs outright (`burnUnderbrush`), unchanged.
- **Groundcover reads its own `fuel`** (`Events.fuel`). `fuel` was only read for shrubs, so red oat
  grass's `fuel: 1.2` (and Chinandega's jaragua 1.6 and guinea grass 1.3) did nothing; groundcover
  burned at 0.7 (native) or 1.1 (invasive) × its grassiness. Now a groundcover with `fuel` uses it.
  Red oat grass is the Serengeti's main fire fuel, and with lantana and mesquite thickets gone it's
  what carries the 0035 fire regime.

## Results

Untended Serengeti, 200 years, seeds 1 and 2, before (the 0035 branch tip, 1f6707b) and after,
both seeded (`succession-check --map serengeti --mode idle --years 200 --veg`, and
`savanna-sward-probe` for the species; the two agree tile for tile). Tiles are grown past 0.35.

| Year 200 | Seed 1 before → after | Seed 2 before → after |
| --- | ---: | ---: |
| Red oat grass | 222 → 6,683 | 629 → 7,273 |
| Finger grass | 10 → 350 | 17 → 268 |
| Rattlepod + wild indigo | 1,476 → 40 | 1,441 → 32 |
| Lantana | 6,920 → 1,713 | 5,911 → 1,181 |
| Native thornbush (whistling thorn, croton, raisin bush) | 182 → 778 | 211 → 779 |
| Meadow habitat | 2,014 → 6,536 | 3,010 → 6,995 |
| Invasive habitat | 6,864 → 1,803 | 5,830 → 1,287 |
| Mesquite trees | 3,629 → 1,130 | 2,811 → 752 |
| Native trees | 290 → 116 | 312 → 129 |
| Land burned a year, years 120–200 | 23% → 25% | 24% → 25% |
| Animals / species | 297 / 24 → 363 / 24 | 313 / 24 → 342 / 25 |

- **The meadow goes the way a recovering rangeland does**: dropseed and the legumes hold the bare
  crust for the first 20–40 years, red oat grass passes them around year 60–80, and by year 200 it's
  most of the land, with finger grass in the grazed patches.
- **Lantana peaks at about 2,000–2,600 tiles around year 80 and falls from there** (still falling at
  year 200), against a steady climb to about 6,000 before. Young mesquite still comes up mostly under
  lantana, but there's far less lantana, so mesquite trees are a third to a quarter of before. It's
  still 85–91% of the trees left, because native trees fell too (below).
- **Fire is the 0035 regime**: a quarter of the land a year (a tile every 4 years), now carried by red
  oat grass rather than by lantana and mesquite thickets. Without the groundcover `fuel` fix it was
  21–23%.
- **Native trees fell by about 60%.** With fire every four years across a grass sward, the trees that
  don't resprout (fever tree, sycamore fig) and young acacias in thick grass rarely escape the fire
  trap. Real Serengeti grassland is nearly treeless away from rivers and kopjes, but this is a
  stronger cut than intended, and the next thing to look at (an open question for Cole).
- The steps one at a time, seed 1 (`savanna-sward-probe`): the legume fade alone left the
  land bare (meadow 527 tiles at year 60, lantana everywhere), because the pioneers died on the crust;
  with the crust exemption the meadow held but red oat grass stayed near 300 tiles; dung seed brought
  it to 2,500 by year 80; fire on lantana brought lantana under 1,000 by year 200 (at 21% fire); the
  fuel fix raised fire to 25%.
- **Hollis is unchanged**: seeded `balance-sim restore 15` (seed 7) is identical line for line before
  and after (only the Serengeti sets `dungSeed`; no Hollis groundcover has `fuel`).
- **Chinandega** (jaragua and guinea grass now burn at their own fuel), `succession-check --map
  chinandega --mode idle --years 60 --veg`, seed 1: tiles burned 75,059 → 76,965 (+2.5%), species
  22 → 23, the rest within seed noise.
- **Serengeti campaign** (`campaign-sim-serengeti`, seeded 7, 11, 13, 17, 23 and unseeded): every
  chapter completes; "The herds return" at a mean day 720 (631–1,001) against 721 (552–871). That
  goal needs two wildebeest herds in one dry season, a dice roll, so single runs swing by a year or
  two either way.
- **Performance**: the dung seed costs about 0.05–0.1 ms a day on the Serengeti (342 animals),
  about 1% of `dailyTick`. `succession-check` ms/day rose from 13–14 to 17, from the bigger ecosystem
  (15–20% more animals, more fire), measured under shared load.
- Checks: `savanna-grass-check` (new; each case fails on the old code), `fire-deadwood-check`,
  `herbivore-pressure-check`, `plant-ecology-check`, `rx-crown-fire-check`, `challenging-ecology-check`,
  `vegetation-check`, `consistency-check`, `data-contracts-check` pass.

## Native trees (Cole, the next day)

With the grass back, native trees fell by about 60% (290 → 116 and 312 → 129 at year 200). A
diagnosis (`savanna-sward-probe --trees`, and a cohort of 600 umbrella thorn seedlings in thick red
oat grass burned every 4 years):

- Grown trees died at the same rate as before; **recruitment fell**. Before, most native seedlings
  came up on bare or lantana ground, which skips both grass rules (the tenth odds in `trySeed` and the
  dry-season `droughtKills`). The degraded ground was the trees' nursery.
- In thick grass 18% of the cohort grew out of the flames in 4 years and 25% were alive at year 16;
  with `droughtKills` off, 81% lived. Fire every 4 years is not the limit; getting seedlings started
  is.
- Tried and dropped: native thornbush sheltering seedlings (no better) and easing the tenth odds to
  0.3 (barely better, and lantana came back with it).

Cole chose two rules, both from how the real Serengeti keeps its trees:

- **Herds carry pods** (`grazeDay`; plant flag `pods`: umbrella thorn, fever tree, desert date,
  mesquite). On a `dungSeed` map, a grazer's day of dung carries either grass seed or, where a grown
  pod tree (growth over 0.75) is in its range, pods, half and half where both are on offer
  (`POD_SHARE`). Impala, giraffe, elephants and cattle eat fallen acacia pods and the seeds pass and
  germinate better (Miller 1994); it's how acacias reach open grassland, and also how mesquite
  spreads through East African rangeland, so mesquite carries pods too.
- **Grazed ground carries less fuel** (`Events.fuel`, every map): groundcover fuel × (1 − 0.8 ×
  min(1, grazed / 0.5)), so a grazing lawn (pressure 0.5) has a fifth of the fuel. More wildebeest
  meant less grass, smaller fires and more trees in the Serengeti (Holdo et al. 2009, *PLoS Biol.*
  7). Saplings in the herds' lawns get the fire-free years they need.

Results, the same 200-year runs (seeds 1 / 2; "0036" is before this section):

| Year 200 | Before 0036 | 0036 | + pods, grazed fuel |
| --- | ---: | ---: | ---: |
| Native trees | 290 / 312 | 116 / 129 | 371 / 342 |
| Mesquite trees | 3,629 / 2,811 | 1,130 / 752 | 1,315 / 1,076 |
| Mesquite share of trees | 93% / 90% | 91% / 85% | 78% / 76% |
| Wooded land (young + mature forest + riparian) | 3.3% / 3.6% | 2.0% / 1.8% | 4.2% / 3.8% |
| Lantana | 6,920 / 5,911 | 1,713 / 1,181 | 2,022 / 1,731 |
| Invasive habitat | 6,864 / 5,830 | 1,803 / 1,287 | 2,156 / 1,792 |
| Land burned a year, years 120–200 | 23% / 24% | 25% / 25% | 25% / 24% |
| Tree diversity (Simpson) | 0.14 / 0.19 | 0.18 / 0.27 | 0.37 / 0.40 |

- Native trees are back above where they were before 0036, mostly fever tree, umbrella thorn and
  desert date; the fire regime is unchanged.
- **Still far under the reference**: `eco-reference.js` gives the Serengeti 15% wooded land; the
  untended map reaches about 4%. Native trees peak around year 140–160 (about 480–510) and drift down
  after. Most seedlings still die in their first dry seasons in grass (`droughtKills`), which is
  realistic for a single seedling but leaves the wooded share low. Getting nearer 15% untended would
  need recruitment pulses (wet years, elephants opening the sward). **Cole's call: about 4% wooded
  untended is fine**, since in the campaign the player plants the acacias. Don't tune untended
  Serengeti woodland toward the 15% reference without asking him.
- Mesquite gained a little (+16% / +43% trees) from pods in dung, as it does in the field; lantana
  and invasive habitat rose a little where grazed lawns burn less.
- Hollis (`balance-sim restore 15`, seeds 7 and 11, year 16): the fuel rule is the first change here
  that reaches Hollis. Score 64.2 → 61.9 and 60.2 → 58.8, forest 181 → 193 and 178 → 186, mature
  trees 55 → 57 and 51 → 50, invasives 25.4 → 27.7% and 28.4 → 28.6%: fewer meadow fires where
  the elk and deer feed, a little more woody growth.
- Serengeti campaign (seeds 7, 11, 13, 17, 23, unseeded): every chapter completes; "The herds
  return" at a mean day 646 (552–761), against 720.
- Performance: dung seed with pods costs 0.05–0.07 ms a day (334 animals). `succession-check` ms per
  dailyTick rose 9.7 → 11.7, from more trees and animals, measured under shared load.
- `savanna-grass-check` adds both rules (5 checks); `herbivore-pressure`, `plant-ecology`,
  `fire-deadwood`, `rx-crown-fire`, `challenging-ecology` and `data-contracts` checks pass.

## Gotchas

- A `pioneer` plant fades on any tile whose `w.soil` is past its level, including ground where it's
  the only thing that can grow. Give a fading pioneer somewhere to hand over to (`crustOK` on crust is
  exempt), or the land goes bare.
- `dungSeed` draws random numbers only when a map sets it (grass seed and pods alike). Turning it on for another map changes that
  map's whole random sequence, so compare seeded runs over several seeds.
- `tools/savanna-sward-probe.mjs [--years] [--every] [--seed] [--why] [--map]` prints groundcover and
  shrub species, soil under each groundcover, bare ground by terrain, fire per year, the ground and
  shrub over young mesquite, and (`--why`) why grass, lantana and mesquite seeds failed in `trySeed`.
