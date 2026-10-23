# 0017 Long-term forest dynamics: mortality, regeneration and disturbance

Proposed 2026-10-18. Status: done 2026-10-22 (phases 1–6). Follows the ecologist review (Jacob, 2026-10-16), §5, §8 and §12. Renumbered from 0013 in phase 6: `main` has its own 0013–0016.

## Outcome

What changed for a player, over the six phases: trees now die across their whole lives (old age, stress, shade, windstorms, drought, root rot), not only at a fixed age or in fire. Shade-tolerant saplings wait under the canopy and take the gap when the tree above dies. Seedlings do worse among their own kind. Dead trees stand, fall and rot at a pace set by their wood and the ground, and hemlock and redcedar come up on rotten logs. Seed now travels as real seed does: mostly near the parent, a little far, and a forest beyond the map edge rains its trees in. An intact rainforest or wet conifer forest rarely burns while the pasture beside it does.

Where it stands (phase 6, full wildlife, 200 years):

- **PNW:** hemlock and redcedar now spread through the whole forest instead of hugging the north and east edges, and about 1,000 wait in the understory at year 200. They're 7–8% of mature trees at year 200 and 25% at year 400 (fir 74%); before phase 6 they stayed at 2–4% for 400 years. Fir is still 86–89% at year 200. That matches real westside Douglas-fir stands, which stay fir-dominated for 250–500 years while hemlock builds underneath, so the year-200 targets (fir ≤ 60%, hemlock + cedar ≥ 25%) are the wrong horizon; they're met around year 400.
- **Amazon:** Brazil nut 35–37% (was 78–80%), with fig, mahogany and ipê up. Fire is 8–14% of tree deaths (was 26–47%).
- **Every forested map** keeps recruits ÷ deaths in band and its animal species, except Atlanta, which misses both on 2 of 6 seeds before and after phase 6 alike.
- **Hollis in its first 15 years** grows twice the forest tiles along the north and east edges (forest rain). Meadow and elk are unchanged.

Still open: Chinandega's neem (29–48%, unchanged within noise), Serengeti mesquite (92–93%) and its weak drought, Atlanta's slow loss of trees to invasive thicket, and the canopy's effect on moisture itself (only on fire fuel so far). The stack (phases 2–6) is cut from an older `main` (9d99a33). Merging it needs a conflict pass in `sim/animals.js`, `events.js`, `plants.js`, `tools.js` and `world.js`, which `main` has since changed (home ranges, landscape of fear, carcass decay).

## Problem

Seeded 200-year headless runs with `tools/succession-check.mjs` on all seven maps (PNW restore and idle, Atlanta, Amazon and Serengeti ×3 seeds; Sumatra, Chinandega and Reef ×1). The full numbers are under [Baselines](#baselines-phase-1-2026-10-19).

- **One tree species takes over.** Douglas fir goes from 14% to 92–93% of PNW trees under the restore plan, and 95–97% left idle; maple, alder, oak and cottonwood drop out. Brazil nut is 76–81% of Amazon trees. Mesquite is 86–94% on an unmanaged Serengeti. Sumatra (durian 26%), Chinandega (neem 32%) and Atlanta (sycamore or red maple, 24–36%) stay mixed.
- **Change slows to noise.** On PNW, the share of land whose habitat class changes per decade falls from about 55% to 11–16%, and part of what's left is young↔riparian flicker. Mature forest climbs to 6,500–7,200 tiles and stays.
- **Big trees can't die.** Old age (`ageY > p.life`) is the only background mortality, and fir lives 400 years, cedar 600. At year 200 the mean tree age is about 100, so fir can't age out for two more centuries.
- **The promised succession never happens.** The PNW map text says cedar and hemlock take over later. Both seed in from the north, but after 200 years they're 0% of mature-forest trees on every seed. One tree per tile, and `trySeed` can't place a seed on a tile that already has a tree. A shade-tolerant species can only take a tile when the tree on it dies, and then it competes on equal terms with seed from the 90% fir around it.
- **Fire is the only gap-maker.** Fire causes 60–74% of PNW restore tree deaths in years 150–200, and 54–72% on Amazon, which is far too much fire for a rainforest. Fire opens 13–16% of PNW mature forest within 50 years, and those patches close within about ten years. Without fire, only 2–3% of mature forest opens.
- **Wildlife plateaus first.** PNW reaches about 30 animal species by year 40 and holds there (29–32 at year 200).
- **Atlanta is losing trees.** The tree count falls from about 2,600 at year 40 to 1,160–1,520 at year 200. Recruits ÷ deaths over years 150–200 is 0.64–0.72, and invasive thicket takes the gaps (mature→invasive is the largest transition from year 100 on).

## Root causes

These are architectural gaps, not bugs:

1. **No background or stress mortality for adult trees.** The hard age cutoff means turnover in long-lived forest is effectively zero for centuries.
2. **No advance regeneration.** Real shade-tolerant trees wait under the canopy as suppressed saplings and are released when the canopy opens. The game has no place for them, so a gap is a fresh lottery, and that lottery is weighted toward whatever dominates nearby.
3. **Positive feedback in recruitment, nothing pushing back.** Local dispersal means the most common tree supplies most seed for every gap. Real forests have conspecific negative density dependence (pathogens, seed predators and herbivores concentrate near adults of the same species; Janzen–Connell). That is the main reason tropical forests don't go monodominant.
4. **Only one patch-scale disturbance.** Fire is the only thing that kills trees in groups. There is no windthrow, drought die-off or pathogen patch, which are the main gap-makers in PNW, Atlanta and Amazon forests.
5. **Tree removal is scattered.** About a dozen call sites zero `w.tree` directly (`events.js`, `animals.js`, `tools.js`, `plants.js`). None of them records why a tree died, and only `killTree` leaves deadwood. Any new process that reacts to a tree dying (release, gaps, decay) would have to be added to each one.

## Design principles

- **Process over outcome.** Don't target a land-cover mix. Model the processes (mortality, release, density dependence, disturbance), and let the mosaic come from them and from the map's climate.
- **Traits are derived by default.** Every new behavior reads existing plant fields (`life`, `light`, `moist`, `soil`, `conifer`, `layer`) to get its defaults, with an optional explicit override. A new species or map works without new data. Overrides are for where evidence says the default is wrong.
- **Per-map regimes live in data.** Each map's definition says which disturbances it has and how strong they are, like `grazing`. No map-specific branches in shared sim code. Existing `savanna` and `underwater` branches stay as they are; new code doesn't add more.
- **One entry point per concept.** One function removes a tree. One module owns disturbance patches. Recruitment rules stay in `trySeed`.
- **Measurable.** Every phase ships with numbers from the succession check, before and after.

## Architecture

### 1. Tree removal (`sim/plants.js`, replaces `killTree`)

Built in phase 2. `removeTree(w, i, cause, rng, { snagOdds, minG, deadwood })` is the only code that clears a living tree. `cause` is one of `'age' | 'stress' | 'fire' | 'wind' | 'drought' | 'pathogen' | 'flood' | 'browse' | 'beaver' | 'player'`. It:

- clears the tile (`tree`, `treeG`, `treeAge`);
- counts the death by cause in `w.treeDeaths` (every tree) and `w.treeDeathsEst` (trees above `ESTABLISHED_TREE` = 0.35, the succession check's "tree"). The counters live on the world, because `removeTree` only gets `w`. They aren't saved and restart at load: they're for diagnostics, the succession check and later the Field Journal;
- marks the phase 3 hook: a comment where the understory sapling will take the slot (see 3). It does nothing yet;
- leaves deadwood with `killTree`'s old rules: a tree above `minG` (0.6, or `FIRE_SNAG_G` 0.85 for fire) leaves a snag with odds `snagOdds`, else a log. The savanna still scales the odds by 0.35, and the reef's `deadTree` hook still turns dead coral to rubble. The odds default by cause: 0.7, fire 0.7 (crown fire passes 0.9), wind 0.15;
- `deadwood: false` leaves nothing at all, not even the `deadTree` remains. This is how every site that zeroed a tree before keeps its behavior: saplings burned, trampled, browsed or drowned, and player removal that leaves its own stump or palm trunk.

Sites moved to it, each keeping its behavior apart from the bookkeeping:

| Site | Cause | Deadwood |
|---|---|---|
| tree loop, `plants.js` | hazard: `age` or `stress`; inundation: `flood`; savanna thicket dieback, `droughtKills`: `drought`; `grazedSeedlingLost`: `browse`; shrinking to 0, seed-bank natives taking an invasive's tile, establishment stress: `stress` | deaths yes; shrinking to 0 no |
| surface and crown fire, `events.js` | `fire` | big trees only, as before |
| controlled burn (`burnUnderbrush`) | `fire` | no |
| flood, `events.js` | `flood` | no (saplings only) |
| beaver pond flooding (`floodTile`) | `flood` | yes |
| beaver chewing | `beaver` | trees ≥ 0.75 only, as before |
| elephant trampling, deer and elk browsing (`ecological-pressure.js`) | `browse` | no |
| tools: pull, cut, clear, dig, trail, blind, road, dike breach, buildings; Sumatra's fell and cut | `player` | no (cut leaves its own stump) |
| reef bleaching / cyclone / crown-of-thorns | `stress` / `wind` / `browse` | rubble, as before / rubble / no |

`World.clearPlants(i, cause)` and `addStructure(…, cause)` take an optional cause. The tools pass `'player'`; map generation passes none, because laying out a new map isn't a death. Planting (`setPlant`) only goes on empty tiles. `tools/tree-mortality-check.mjs` fails if any file other than `removeTree` and `clearPlants` (and the `*-world.js` generators) zeroes `w.tree`.

### 2. Mortality hazard (`sim/plants.js`, `treeHazard`)

Built in phase 2. It replaces the hard age cutoff (`ageY > p.life && rng() < 0.004`) and the two old poor-site death rolls with one yearly hazard, applied daily as h/120. That's one `rng()` per tree per day, as before:

```
h = base + senescence + stress + poorSite + suppression          (per year)
base        = p.mortality ?? clamp(0.4 / p.life, 0.002, 0.02)
senescence  = 0.05 * max(0, (age/life − 0.7) / 0.3) ^ 3          // 5%/yr at `life`, 40%/yr at 1.3·life
stress      = 0.03 * (1 − suit/0.6)₊
poorSite    = 0.2 * (1 − suit/0.3)₊, trees with treeG ≥ 0.5 only  // the old daily 0.002 / 0.0015 rolls, merged
suppression = 0.03 * min(1, (light[0] − L)/light[0])₊ * min(1, (0.95 − treeG)/0.45)₊,  L = layerLight(w, i, 2)
```

- **Cause.** A hazard death counts as `age` when the roll falls in `base + senescence`, and as `stress` otherwise.
- **Background is 0.4/life, not 0.8.** At 0.8 a bigleaf maple (life 90) died at 0.9% a year, so over half the first maple cohort was gone by year 100. Fir sits at the 0.2% floor either way, so it took the gaps: fir reached 90% of PNW trees against 78% before (`--veg`, seed 1). At 0.4 it reached 86%. The unburned openings were the same (12% and 13%).
- **The old poor-site death is merged in**, not stacked. The old code rolled 0.002 a day (g 0.5–0.95) or 0.0015 a day (g ≥ 0.95) when suitability was under 0.3, about 18–24% a year. That is the same thing as the stress term at its bad end, so it became `poorSite`, at 20% a year. The slow shrinking of a tree under 0.5 on a poor site stays in the growth step.
- **Suppression only applies below the canopy.** `layerLight(w, i, 2)` is `1 − 0.75 × nbCanopy`, so a fir in a closed fir stand reads 0.25, below its `light[0]` of 0.42. Applied to every tree, this would kill canopy trees for having neighbours. The `(0.95 − treeG)/0.45` factor limits it to trees that haven't reached the canopy. Shade-tolerant trees (`light[0]` 0: cedar, hemlock) are never suppressed.
- **Map data.** `definition.mortality: { background, senescence, stress, suppression }` scales each new term; the default is 1. `poorSite` isn't scaled, because every map had it before. The reef sets `background`, `stress` and `suppression` to 0: with them on, coral fell from 2,182 to 1,447 colonies by year 200 (`--veg`, seed 1). It keeps senescence, which replaces its old cutoff at `life` too. The data contract checks the field.
- Planted trees get the hazard; nothing tells them apart.

### 3. Recruitment (`sim/plants.js`, `trySeed`)

Built in phase 3. `trySeed` is still the one place natural recruitment happens (seed rain, dispersal, burn and flood seeds). Player planting goes through `setPlant` and the tools, so none of this applies to it.

**Advance regeneration.** Two saved arrays, `w.understory` (plant id, `Uint8Array`) and `w.understoryG` (`Float32Array`), declared in the `World` constructor and registered in `EXTRA_ARRAYS` (`data/world-schema.js`). Saves remap understory ids by name like the other plant layers, and the contract checks them as tree-layer ids. Saves from before load with the constructor's empty arrays.

- **Entry.** A tree seed landing on a tile with a living tree goes for the understory slot instead of failing, when:
  - the tree above is established (`treeG > ESTABLISHED_TREE`, 0.35). Under a young tree the seed still fails;
  - the shrub-layer light (`layerLight(w, i, 1)` = `1 − 0.85 × canopy`) is at least `p.light[0]`;
  - the site suits it, with `plantSuit(w, i, p, light)` reading that understory light instead of the tree layer's. `plantSuit` gained the optional `light` argument for this.
- **The rest of `trySeed` applies unchanged:** seed spacing, the seed bank, `nativesHold`, `meadowsHold`, the grass sward, grazing (`grazedRecruitOdds`), CNDD and the final roll. The savanna rule that native seedlings don't come up within reach of a grown tree also rules out the tile under one.
- **Replacing.** A newcomer takes the slot from a sapling already waiting if it's more shade-tolerant (`light[0]` lower by more than 0.05) or better suited (suitability higher by more than 0.15).
- **Daily step** (`understoryDay`, run in the tree loop right after the tile's tree):
  - growth is 0.1 of the open-grown rate, times `grazedGrowth`, capped at `UNDER_MAX` = 0.25;
  - yearly death is 2% background, plus up to 25% as the light falls below `light[0]`, plus 30% on a site under 0.3 suitability. `grazedSeedlingLost` applies too. The 0011 browse pressure fades to 0 under a canopy (`seedlingPressure` × (1 − 2 × nbCanopy)), so browsing hardly reaches understory saplings in closed forest. Modelling deer browse on hemlock and cedar would need that fade changed. That belongs to grazing (0011), not this phase.
- **Release.** `removeTree` promotes the sapling to the tree slot at its own size (at least 0.04), age 0, and clears the slot. Releases are counted by species in `w.understoryReleased`, which isn't saved, like `treeDeaths`. The age restarts because nothing tracks how long the sapling waited.
- **What kills the understory with the tree** (`KILLS_UNDERSTORY` in `removeTree`):
  - `fire`: thin-barked saplings low in the fuel bed burn. Every burned tile loses its understory through `clearUnderstory`, even where the big tree survives. That covers surface fire, crown fire and the player's controlled burn. Realistically most do die; this keeps it simple and makes fire-prone stands stay fir.
  - `flood`;
  - `player`, because removing a tree means clearing the tile. `World.clearPlants` clears the understory first too.
  - Other causes release the sapling: age, stress, drought, browse, beaver, and later wind and pathogen.
- **Invariant.** No understory without a living tree on the tile: release or clearing empties the slot in the same call that empties the tree slot. `tools/plant-ecology-check.mjs` checks entry, the cap, release, fire, clearing and the save round trip.
- **Map data.** `recruitment.understory: false` turns it off. The reef sets it, so coral doesn't settle under coral.

**Conspecific negative density dependence (CNDD).** For tree seeds only (layer 2), into either slot, the odds are multiplied by `1 − cndd × f`. `f` is the share of adult trees (`treeG > 0.5`) in the 5×5 around the tile, the tile's own tree included, that are the seed's species (`conspecificShare`).

- `cndd = p.cndd ?? definition.recruitment?.cndd ?? 0.3`. Values: Amazon 0.7; Sumatra 0.65; Chinandega 0.6; PNW and Atlanta 0.3; Serengeti 0, since its savanna spacing rule already keeps trees apart; reef 0.
- The 25-tile scan runs last, only for seeds that passed every other check before the final roll.
- The data contract checks `recruitment: { cndd (0–1), understory (boolean) }` and the plant override `cndd`.

**Seed supply (PNW data).** Hemlock and redcedar came only from the north seed rain, onto the outer eight rows. That edge is dry upland: moisture 0.25, against minimums of 0.4 and 0.5. Neither ever established in the open there, and neither existed anywhere on the map by year 40. The east edge ("the woods to the east", moisture 0.39, like the interior) now carries them too, as real lowland PNW woods would.

### 4. Disturbance regimes (`sim/disturbance.js`)

Built in phase 4. The module owns patch-scale tree mortality other than fire, which stays in `events.js`. Every tree it kills goes through `removeTree` with cause `wind` or `pathogen`; drought deaths come from the hazard with cause `drought`. `Events.daily` calls `disturbanceDaily(game)` right after the campaign's disaster gate (`disturbanceOn`), so in the campaign disturbance starts with the chapter that brings fire and flood, and in free play from the start. Storm and root-rot rates and drought depth scale with the difficulty's `disasters`.

Map data (`definition.disturbance`, checked by the data contract; months run March..February):

```js
disturbance: {
  storms: [{ name: 'A winter windstorm', months: [7, 8, 9, 10, 11], perYear: 1.5, patch: [6, 500], severity: 0.8 }],
  drought: { threshold: 36, span: 10, severity: 1 },
  pathogen: { host: ['fir'], perYear: 2, spread: 0.03, kill: 0.1, news: '…', note: '…' },
}
```

`storms` is a list, so a map can have more than one kind (Atlanta: thunderstorms and ice storms). Optional per storm: `notice` (established trees thrown before the player hears of it, default 10) and `warn` (the notice's tone).

- **Windstorm** (`windstorm`). Each day of a storm month, a storm comes with odds `perYear × disasters / (storm days a year)`.
  - It comes down on a random grown tree (`treeG > 0.5`; the first of up to 24 random tiles that has one). Where a storm lands is weather, not forest structure. The first version started at the most exposed of the 24, which sent most storms to lone young trees in restored fields; exposure now only decides which trees in the patch fall.
  - The patch size is a truncated Pareto draw (exponent 1) between `patch[0]` and `patch[1]` tiles: mostly small gaps, sometimes a blowdown of hundreds. The patch grows from a random point on its edge each step, so it comes out irregular.
  - Per-tree kill chance is `2 × severity × size × exposure × rooting × (1 − windfirm)`, at most 0.95:
    - `size = ((treeG − 0.3)/0.7)²`, clamped: wind load rises with height, so saplings bend, young stands mostly stand and the old giants go;
    - `exposure = 0.25 + 0.75 × open`, where `open` is the share of the 8 neighbours without a tree above 0.5. It's read live rather than from `nbCanopy`, so a tree thrown in this storm exposes the next one and gaps grow at their edges;
    - `rooting = 0.6 + 0.8 × (moist − 0.45)/0.4`, clamped: saturated soil lets the root plate tip.
  - `windfirm(p)`: `p.windfirm` if set, else 0.5, minus 0.15 for conifers (crowns in leaf through the winter gales, mostly shallow roots), minus 0.1 for trees of wet ground (`moist[0] ≥ 0.5`: a high water table keeps roots shallow), plus 0.1 for long-lived trees (`life ≥ 250`: deep taproots, heavy wood). PNW: maple and alder 0.5, fir and hemlock 0.45, redcedar 0.35, oak 0.6. No map overrides it yet.
  - Snags in the patch fall to logs with odds `severity`. A thrown tree leaves a log 85% of the time (`removeTree`'s wind snag odds, 0.15). The cause `wind` releases the understory sapling, so advance regeneration takes wind gaps with no extra code.
  - A storm that throws at least `notice` established trees notifies the player at the gap's centre, naming the species released into it. The notice goes to the Field Journal like every notice. Chinandega's hurricane notice has a Spanish pattern in `lang/es.js`.
- **Drought** (`droughtLevel`, read by `treeHazard`). `w.drought` (a world scalar declared in the constructor) is set daily to `clamp((dryStreak − threshold)/span, 0, 1) × severity × disasters`. `treeHazard` adds `MORT.drought (1/yr) × w.drought × clamp(1 − (moist − p.moist[0])/0.15, 0, 1)`: only trees within 0.15 of the dry end of their range die of it, and the death counts as `drought`. There's no new kill path, so the later hydrology work changes who dies through `w.moist` alone. Thresholds sit near the 85th percentile of each map's longest yearly dry streak under its `climate.rain` (Atlanta 36 days, Serengeti 56), so a drought comes every several years.
- **Root rot** (`rotMonth`, `seedRot`). `w.rot` (`Uint8Array`, in `EXTRA_ARRAYS`, so it saves; older saves load with none) holds the infection on each tile, 0..255. Once a month (`day % 10 === 0`, one pass over the tiles):
  - a host tree on an infected tile dies at `kill` a year once established (`treeG > 0.35`: its roots reach the infected wood, and a pole-sized fir dies as readily as a big one), a seedling at a quarter of that. The death counts as `pathogen` and releases the understory. Snag odds are 0.4, because rot-killed trees mostly tip over green;
  - for its first ~10 years on a tile (`rot ≥ 128`) it spreads root to root into each 4-neighbour holding an established host tree, `spread` a year per neighbour;
  - it fades by 1 a month whatever grows there, gone in about 21 years, so a patch holds non-host trees for a generation and then heals;
  - a new centre starts on a grown host `perYear` times a year.
  - Each tile's infection has a fixed life, so every patch is finite and the infected area settles near `perYear × mean patch size × 21 years`. `spread × 10 years` has to stay well under 1. PNW uses spread 0.03 (a patch of a few trees on average, now and then dozens), 2 new centres a year and kill 0.1.
  - Two designs ran away first. In both, fir covers about 85% of the forest, so any spread above critical makes an epidemic that runs until the fir is used up:
    - spread 0.15 with kill 0.15 put rot on a quarter of PNW by year 200, with 61% of all tree deaths;
    - with a grown host keeping its tile infected, every centre lived as long as fir kept coming back. At spread 0.015–0.05, 350-year runs had rot on 1,300–2,400 tiles, still growing, and about half of all deaths.
  - The tile inspector shows the map's `note` on an infected tile, and the first grown tree it kills brings the map's `news` notice (once a game, `flags.rotSeen`).
- **Each map lists only what fits it.** PNW: winter windstorms (Oct–Feb) and laminated root rot in Douglas-fir. Atlanta: summer thunderstorms (May–Aug), ice storms (Dec–Feb, rarer, wider), drought. Amazon: squall-line blowdowns at the start of the rains (Oct–Jan). Sumatra: "Sumatra" squalls at the monsoon changeovers. Chinandega: a hurricane every ~25 years (Sep–Nov), 400–4,000 tiles. Serengeti: drought only (elephants and fire already open the woodland). Reef: none (its cyclones are its own map code).
- `tools/disturbance-check.mjs` checks windfirmness, the kill chance, a storm's kills, releases and snags, determinism, the drought term, root rot's spread, kills and fading, the save round trip, the campaign gate and the data contract.

### 5. Deadwood (`sim/plants.js`, feature aging)

Built in phase 5. A dead tree goes snag → sound log → rotten log → gone. These are the existing `F.SNAG` and `F.LOG` features: "rotten" is a log far enough into its rot, not a new feature, so nothing that reads `F.LOG` changes.

- **Rot, not age.** For a snag or log, `featureAge` is how far it has rotted, in days at the reference pace (a hardwood on ground at moisture 0.5). It gains `decayRate(w, i)` a day instead of 1:
  ```
  rate      = woodDecay(p) × moistDecay(w, i) × definition.deadwood.decay (default 1)
  woodDecay = p.decay ?? (p.conifer ? 0.6 : 1)       // 1 for deadwood of unknown species
  moistDecay = 0.3 + clamp((moist − 0.15)/0.5, 0, 1)  // 0.3 dry … 1 at 0.5 … 1.3 from 0.65 up
             = 0.35 in standing water, marsh, mud or water deeper than 0.15 (waterlogged: short of air)
  ```
  Moisture is read every day, so a dry summer slows the rot and the wet season speeds it up.
- **Classes**, in reference years (`DECAY`): a snag may fall after 8, then with odds 0.002 × rate a day; a log is rotten from 12; it goes after 25, the same way. On a typical hardwood on damp ground these are the old fixed timers. A Douglas-fir log on PNW ground (moisture about 0.4–0.5) lasts 50–60 years instead of 29; one in a wet hollow about 37; an Amazon log about 14.
- **Wood.** Conifers rot at 0.6: resin and heartwood extractives hold fungi off. Plant overrides where the evidence says the default is wrong: western redcedar 0.35 (thujaplicins: its logs last centuries) and western hemlock 0.85 (no durable heartwood: its logs rot about twice as fast as Douglas-fir's). Real ratios are larger. A Douglas-fir log lasts several times as long as a maple's, and redcedar longer still. The game keeps every log within decades, so a forest's deadwood turns over within a player's lifetime.
- **Map factor** (`definition.deadwood: { decay }`, checked by the data contract): warm, humid tropics rot wood faster. Amazon and Sumatra 1.8, Chinandega 1.4 (termites, but dry half the year). No other map sets it.
- **What it was.** `w.deadwoodId` (`Uint8Array`, in `EXTRA_ARRAYS`, declared in the `World` constructor) is the plant id of the tree that left the snag or log. `removeTree` sets it; the player's snag and log tools, Sumatra's felled palms and map generation leave 0 (unknown wood, rate 1). It's read only while the tile holds a snag or log, saves remap it by name like the other plant layers, and older saves load with none.
- **Soil.** A log adds 0.0004 × rate to `w.soil` a day, so each log returns the same total whatever its pace.
- **Savanna and reef unchanged.** The savanna keeps its fixed two- and four-year timers (fire, termites, elephants). The reef's `deadTree` hook leaves rubble and no deadwood.
- **Snag fall.** `fellSnag(w, i)` is the one way a snag comes down: a sound log (`featureAge` 0) that keeps its species. Callers:
  - its time, in the aging loop;
  - a storm patch (`disturbance.js`, odds `severity`);
  - a wildfire (`burnFeaturesAndWildlife`): on the savanna with odds 0.5, as before; elsewhere only a snag past its standing age (rot over 8 reference years), with odds 0.5, as the fire burns through its rotten base. The trees a fire has just killed stand, so a crown fire still leaves a stand of snags. Controlled burns don't fell snags.
- **Nurse logs** (`nurseBonus(w, i)`, for plants with `p.nurse`: western hemlock, western redcedar, red huckleberry). It replaces the flat +0.3 on or next to any log:
  - +0.4 on a rotten log, +0.15 on a sound log, +0.15 beside a log (`distLog` ≤ 1). Seedlings take on a rotten log: raised above the moss and litter, out of reach of the soil fungi that kill seedlings on the ground, on wood that holds water through the summer. A barked, hard log helps little.
  - The thick-sward penalty in `trySeed` (×0.3 under grass) doesn't apply to a nurse species on a rotten log: it's above the grass.
  - An understory sapling of a nurse species on a rotten log has half the 2% background death.
  - `plantSuit` carries the bonus, so it applies to both the tree slot and the understory slot.
  - Redcedar gained `nurse: true`: it regenerates on logs in wet forests, though less than hemlock.
- **Habitat hooks.** A rotten log adds 0.3 to `w.insects` against 0.2 for other deadwood: beetle larvae, ants and termites concentrate in decayed wood. Everything else reads `F.SNAG` and `F.LOG` as before: cavity nesters, perches and `distSnag` (snags), `distLog` (wren, pond turtle, Amazon and Atlanta log species), dormancy shelters, refuge cover, fire fuel and moisture. No salamander reads logs today; if one is added it should prefer rotten ones.
- **Render.** A rotten log is drawn with the same model, slumped (72% height) and tinted moss-green.
- Fungi and decomposers can later set the rate through `decayRate`: this phase only makes it depend on conditions.
- `tools/deadwood-check.mjs` checks the wood and moisture factors, the classes and their timing, the savanna and reef, nurse logs (suitability, the sward, the understory), wind and fire felling, insects, the save round trip and the data contract.

### 6. Seed dispersal (`sim/plants.js`, `disperse`, `seedRain`)

Built in phase 6. Phases 3–5 left every forested map seed-limited: a tree's seed landed uniformly within `p.radius` of it, and seed from beyond the map reached at most `radius + 4` tiles in. So the commonest tree supplied nearly all the seed for every gap, and a species that arrived only from an edge (PNW hemlock and redcedar) stayed within 15 tiles of it for 200 years. Real seed shadows have a peak under the parent and a long, thin tail, and seed rain from a neighbouring forest falls off with distance rather than stopping. Three changes, all from existing traits:

- **Long-distance dispersal** (`farSeed(p, frugivores, disperserHere)`, trees only). With odds `farSeed`, a tree's seed goes far instead of near: distance `r/u` (`u` uniform in (0,1], a Pareto tail of exponent 1, so half of these land within 2r and one in ten beyond 10r), in any direction; off the map it's lost. One extra `rng()` per seeding, two more when it goes far.
  - `p.farSeed` if set, else from how the seed travels:
    - fruit (`p.look.fruit`): carried by birds and bats, 0.05 while frugivores visit, 0.005 without;
    - one animal (`p.disperser`, the Brazil nut's agouti): 0.01 while it lives on the map, none without;
    - anything else is wind-borne: 0.02 × `radius`/4 (a long radius stands for a light, winged seed). PNW: fir 0.025, hemlock, redcedar and maple 0.02, cottonwood 0.035.
  - Shrubs and groundcover keep their near spread: their long-distance seed already comes in as the map's `berrySeeds` and `windSeeds`.
- **Edge seed rain falls off with depth** (`edgeTile`). Tree seed from beyond an edge lands `s·(1/u − 1)` tiles in, `s = (radius + 4)/4`: the same median depth as the old band (`rng()·rng()·(radius+4)`), but one seed in five gets past 4s and one in sixteen past 15s. Shrub and groundcover seed keeps the old near band, so the neighbours' blackberry, broom and pasture grass press in as before.
- **Forest beyond an edge** (map data `forestRain: { N: 0.01, E: 0.01 }`, seeds per edge tile a day, × the month's `spread`). The old edge rain is three tries a day for the whole map, shared between four edges and every species listed for them, about five hemlock seeds a year. A grown forest along a 120-tile edge drops far more. Each day, `forestRain[edge] × edge length` seeds of that edge's native trees (`forestTrees`: the edge's `seedRain` entries that are trees, native and not invasive, repeats as weights) land through `edgeTile`. The neighbours' invasive trees (Atlanta's callery pear, Chinandega's neem, the Serengeti's mesquite) are garden and hedgerow trees, not a stand, and keep to the old tries. Only PNW (north and east) and the Amazon (north and east) set it: the maps whose text puts a forest there and whose succession depends on it. The data contract checks it.

Phase 6 also lowers the fire fuel of a rotten log (decay class, §5) from 0.4 to 0.15: soaked through, it smoulders rather than carrying flame. Sound logs and snags stay at 0.4. See [Phase 6 results](#phase-6-results-2026-10-22) for the drought and Amazon fire settings.

`tools/dispersal-check.mjs` checks the trait defaults and override, the kernel's far share and tail, the edge kernel for trees and shrubs, the forest rain (native trees only) and its contract, and the fuel of rotten logs.

### Interfaces between parts

```
disturbance.js ──► removeTree(cause) ◄── plants.js hazard, events.js fire/flood, animals.js, tools.js
                        │
                        ├─► feature (snag/log)  ──► deadwood decay, nurse logs, cavity/insect food
                        ├─► understory release  ──► tree slot
                        └─► stats.treeDeaths    ──► diagnostics, Field Journal
trySeed ──► (tree slot | understory slot) × CNDD × grazing × suitability
```

## Invariants

- Deterministic under `game.rng`. No `Math.random` in sim code.
- One tree and at most one understory sapling per tile. An understory sapling never exists on a tile without a tree; promotion or failure clears it.
- Planted trees are never killed by CNDD or recruitment rules. Hazard and disturbance do apply to them, because that's realistic. The ecology difficulty can scale disturbance through `diff.disasters`.
- Saves stay compatible: new arrays go in `EXTRA_ARRAYS`, and missing arrays mean empty.
- Reef (`look.underwater`, `deadTree` hook) and Atlanta's `nativesHold` gardens keep their current behavior unless their map data opts in.
- Campaign gating: disturbances, like fire and flood, start where the campaign says, and in free play from the start.

## Performance

- Hazard: no new loops, a few multiplies per tree per day in the existing loop.
- Understory: two arrays of n (about 10k) tiles. The work happens only when a seed lands on an occupied tile.
- CNDD: a 25-tile scan, only for seeds that already passed suitability, so a small fraction of seed attempts.
- Disturbance: rare events with patch-sized work.
- Budget: `dailyTick` grows by at most 5%, measured in node with `tools/boot-profile.mjs` and a dailyTick timing in the succession check. That stays within the [0004](0004-ecosystem-performance.md) low-end target.

## Acceptance criteria

Each criterion runs on 3 seeds and 200 years, through `tools/succession-check.mjs`:

| Measure | Now | Target |
|---|---|---|
| Largest tree species share, PNW restore, year 200 | 92–93% | ≤ 60% |
| Hemlock + cedar share of PNW mature-forest trees, year 200 | 0% | ≥ 25%, with fir still ≥ 25% |
| Largest tree species share, Amazon, year 200 | 76–81% | ≤ 40% |
| Recruits ÷ deaths, years 150–200, any forested map | Atlanta 0.64–0.72; others 0.94–1.3 | 0.7–1.5 |
| PNW mature-forest tiles that pass through an opening within 50 years (years 150–200) without burning | 2–3% (13–16% counting fire) | ≥ 10% |
| Animal species at year 200 vs baseline | PNW 29, Atlanta 29, Amazon 24, Serengeti 20, Sumatra 34, Chinandega 23, Reef 21 (lowest seed) | ≥ baseline − 1 on every map |
| `balance-sim restore 15` (Hollis meadow and elk numbers from 0011) | n/a | within seed noise |
| `dailyTick` time | PNW restore 6.2–7.4 ms at years 190–200 | ≤ +5%, A/B back to back |

The opening criterion counts only tiles that didn't burn. Phase 1 found that fire alone already opens 13–16% of PNW mature forest, which would pass a fire-inclusive 10% target before any change. The point of the criterion is gaps from wind, drought, pathogens and old trees dying. `--assert` checks the unburned version. "Forested" means PNW, Atlanta, Amazon, Sumatra and Chinandega. PNW idle reads 1.34–2.17 because forest is still spreading onto the old fields at year 200, so a high ratio there isn't a failure.

Existing checks keep passing: `data-contracts-check`, `browser-save-check`, `challenging-ecology-check`, `consistency-check`, and the grazing and trails checks.

### Baselines (phase 1, 2026-10-19)

Before any phase 2 change: `main` at 9d99a33, 200 years, full wildlife (10 × `update(0.1)` a day), `--every 10`. A range is the min–max across seeds. Shares are of established trees (`treeG` > 0.35). "Shade-tolerant" means `light[0]` ≤ 0.15, which on PNW is exactly cedar and hemlock. The window measures are over years 150–200.

| Run | Seeds | Largest species, % | Shade-tolerant % of mature trees | Recruits ÷ deaths, t150–200 | Mature tiles opened, t150–200, % (unburned) | Habitat changed, last decade, % | Simpson | Animal species | Trees | Tree age median / 95th, y | Meadow tiles | Elk |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pnw restore | 3 | fir 92–93 | 0 | 1.06–1.16 | 13–16 (2–3) | 11–16 | 0.13–0.16 | 29–32 | 7188–7780 | 96–115 / 176–179 | 13–344 | 15–16 |
| pnw idle | 3 | fir 95–97 | 0 | 1.34–2.17 | 3–15 | 8–17 | 0.06–0.09 | 29–31 | 7497–8335 | 79–92 / 163–167 | 5–380 | 13–15 |
| atlanta idle | 3 | sycamore/redmaple 24–36 | 0 | 0.64–0.72 | 48–51 | 6–9 | 0.76–0.82 | 29–31 | 1162–1516 | 64–72 / 192–195 | 31–53 | - |
| amazon idle | 3 | brazilnut 76–81 | 0 | 0.94–1.12 | 13–28 | 8–13 | 0.33–0.41 | 24 | 9099–9422 | 98–108 / 166–173 | 7–53 | - |
| serengeti idle | 3 | mesquite 86–94 | 0 | 0.96–1.03 | 61–63 | 6–12 | 0.11–0.25 | 20–23 | 3424–4634 | 13–16 / 55–71 | 440–713 | - |
| sumatra idle | 1 | durian 26 | 0 | 1.02 | 22 | 13 | 0.85 | 34 | 9023 | 75 / 176 | 3 | - |
| chinandega idle | 1 | neem 32 | 0 | 1.28 | 76 | 16 | 0.79 | 23 | 5379 | 31 / 95 | 92 | - |
| reef idle | 1 | boulder 53 | 0 | 1.32 | 42 | 5 | 0.54 | 21 | 1994 | 58 / 188 | 5077 | - |
| pnw restore --veg | 3 | fir 76–87 | 0 | 1.01–1.15 | 16–22 | 12–15 | 0.23–0.38 | 29–31 | 7571–7956 | 86–106 / 179 | 4–58 | 15–22 |

- **Habitat changed** is the share of land tiles whose class differs from 10 years earlier. Part of it is young↔riparian flicker and shrub↔meadow edges, so read it with the transition list the tool prints under each report line (for example `mature>shrub 202`).
- **Opened** on the savanna and pasture maps (Serengeti 61–63%, Chinandega 76%) is mostly fire cycling through open woodland. On Atlanta (48–51%) it's mature forest becoming invasive thicket. Only the PNW number is a target.
- **ms figures.** The 200-year runs ran six at a time at `nice -n 15` while the machine's load average was around 45. That starved them about 40×, so the per-run averages measure the queue. The `dailyTick` costs below come from low-load runs on battery: years 0–20, one process at a time, at `nice -n 5`, plus the final decade of the three-at-a-time reruns. Cost grows as the forest fills in. Compare phases with an A/B on the same seeds, back to back.

| Map | ms/dailyTick, years 0–20 | ms/day with wildlife, years 0–20 | ms/dailyTick, years 190–200 |
|---|---|---|---|
| PNW restore | 4.4 | 11.5 | 6.2–7.4 |
| PNW idle | 3.1 | 6.6 | |
| Atlanta | 1.7 | 5.3 | |
| Amazon | 3.0 | 8.0 | |
| Serengeti | 3.4 | 11.7 | |
| Sumatra | 5.0 | 18.4 | 7.4 |
| Chinandega | 3.6 | 11.1 | 5.1 |
| Reef | 3.3 | 7.9 | 5.0 |

**`--veg` against full wildlife (PNW restore, 3 seeds, means):**

| Year | Meadow tiles, full / veg | Elk, full / veg | Mean `grazed`, full / veg | Mature tiles, full / veg | Largest share (fir), full / veg |
|---|---|---|---|---|---|
| 20 | 556 / 388 | 16.7 / 16.3 | 0.123 / 0.127 | 109 / 100 | 52% / 51% |
| 50 | 84 / 189 | 16.7 / 16.0 | 0.115 / 0.104 | 1,725 / 1,828 | 71% / 68% |
| 100 | 38 / 48 | 18.0 / 16.7 | 0.095 / 0.115 | 4,290 / 4,574 | 77% / 65% |
| 200 | 164 / 23 | 15.7 / 17.3 | 0.139 / 0.112 | 6,667 / 6,888 | 93% / 81% |

Grazing outcomes (elk numbers, grazing pressure, meadow and mature area) stay within seed noise: meadow swings between 5 and 380 tiles across seeds in full mode alone. Composition does not: `--veg` leaves fir 10–15 points lower at years 100–200 (76–87% against 92–93%). The likely cause is animal effects that happen once per `update` call rather than per unit of time, but that is unconfirmed. So use `--veg` for structure, turnover and mortality questions and for 300-year runs. Measure species shares and every acceptance number with full wildlife. `--veg` saves about half the wall time (wildlife is about 60% of a full day).

### Phase 2 results (2026-10-20)

`removeTree` and the hazard, measured as for the baselines: full wildlife, 200 years, same seeds, so each row compares exactly with the baseline row above. Deaths by cause now come from `w.treeDeathsEst`.

| Run | Seeds | Largest species, % (before) | Recruits ÷ deaths (before) | Mature opened, % (unburned) (before) | Habitat changed, % | Simpson | Animal species | Trees | Age median / 95th, y (before) | Meadow | Elk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pnw restore | 3 | fir 86–92 (92–93) | 0.92–1.04 (1.06–1.16) | 25–34 (12–14) (13–16 (2–3)) | 15–20 | 0.15–0.25 | 30 | 6722–7106 | 78–92 / 170–174 (96–115 / 176–179) | 18–346 | 15–20 |
| pnw idle | 3 | fir 94–98 (95–97) | 1.15–1.31 (1.34–2.17) | 21–24 (9–11) (3–15) | 14–15 | 0.05–0.11 | 28–31 | 7276–7691 | 71–77 / 155–160 (79–92 / 163–167) | 10–87 | 16–19 |
| atlanta idle | 3 | redmaple/tulippoplar 24–34 (24–36) | 0.72–0.74 (0.64–0.72) | 48–56 (47–56) (48–51) | 10–11 | 0.77–0.84 | 24–29 | 1256–1404 (1162–1516) | 56–69 / 185–186 (64–72 / 192–195) | 30–35 | - |
| amazon idle | 3 | brazilnut 81–83 (76–81) | 1.02–1.05 (0.94–1.12) | 22–27 (10–14) (13–28) | 11–14 | 0.30–0.34 | 24 | 9425–9482 | 78–91 / 161–166 (98–108 / 166–173) | 6–10 | - |
| sumatra idle | 1 | fig 39 (durian 26) | 1.04 (1.02) | 30 (27) (22) | 15 | 0.80 | 32 | 9023 (9023) | 62 / 166 (75 / 176) | 0 | - |
| chinandega idle | 1 | guacimo 23 (neem 32) | 0.96 (1.28) | 84 (47) (76) | 21 | 0.84 | 23 | 3876 (5379) | 24 / 90 (31 / 95) | 164 | - |

Deaths of established trees in years 150–200, by cause (all seeds):

- PNW restore: age 41%, fire 38%, stress 16%, beaver 4%, flood 1%. Fire's share per seed fell from 60–74% to 31–45%.
- PNW idle: age 45%, fire 24%, stress 21%, beaver 9%.
- Atlanta: age 94%, stress 6%. These are mostly short-lived trees (callery pear lives 25 years, crape myrtle 50, river birch 60) dying on schedule, as before.
- Amazon: age 50%, fire 39%, stress 11%. Fire's share per seed fell from 54–72% to 34–44%. Fire burns no less; there are just more other deaths.
- Sumatra: age 86%, fire 8%, stress 6%. Chinandega: fire 69%, age 29%, stress 2%.

Against this phase's targets:

- **PNW unburned openings** rose from 2–3% to 12–14%, above the 10% acceptance target. Openings counting fire rose from 13–16% to 25–34%.
- **Atlanta recruits ÷ deaths** rose from 0.64–0.72 to 0.72–0.74, inside the 0.7–1.5 band on every seed, but only just. Its deaths are almost all short-lived trees reaching old age. Its recruitment is held back by the invasive thicket, which the hazard doesn't touch. That is phase 3's job (recruitment) and phase 6's (map tuning).
- **Age distribution.** The 95th percentile barely moves, but the median drops by 10–25 years everywhere, and the 25th–75th spread is about 40–130 years on PNW restore. Trees now die across their whole lifespan instead of all at `life`.
- **balance-sim restore 15** is within seed noise. Over seeds 1–8, seeded via `--import`, before → after means: score 58.3 → 58.0, meadow tiles 720 → 836 (spread across seeds 426–1,242), forest 222 → 215, mature 40.5 → 40.4, elk 15.9 → 17.4, invasive 30.2% → 31.1%.
- **dailyTick** is within the 5% budget, just. A/B on PNW restore, `--veg`, 60 years, seed 1, one process at a time in the order old, new, new, old, on AC power. Means, ms per `dailyTick`: years 0–20 3.73 → 3.69, years 20–40 4.37 → 4.44 (+2%), years 40–60 4.43 → 4.67 (+5%). The two old-code runs differ by 4% from each other. The new code has 12% fewer trees at year 60 (3,205 against 3,663), so its cost per tree is higher. On one saved year-40 state, `updatePlants` alone costs about 0.15–0.25 ms more. Most of that is the hazard's `rng()`, which now runs for every tree every day, where the old age check rolled only for trees past `life`. Skipping `treeHazard` when the roll is above an upper bound saved nothing measurable, so it isn't in. The 200-year runs' ms figures are meaningless: the Mac was on battery and slept during them.
- **Gotcha, fixed before measuring:** the first version created `w.treeDeaths` with `||=` at the first death. That changes the World object's shape mid-game, and `updateEnvironment` (canopy, moisture, classify, distances) ran 35–55% slower. The counters are now declared in the `World` constructor. Any new per-world field should be too.

Regression, expected until phase 3:

- **Monodominance is a little worse.** Fir on PNW restore is 86–92% against 92–93% in full mode, a small gain. But under `--veg` on seed 1 it rose from 78% to 86%, and Brazil nut went from 76–81% to 81–83%. Turnover without negative density dependence feeds the lottery that root cause 3 describes: every new gap is filled mostly by the dominant species' seed. More gaps make that lottery run faster. CNDD and advance regeneration in phase 3 are what this needs. Lowering the background coefficient to 0.4 (see §2) halved the effect on PNW.
- **Shade-tolerant share stays 0%**, as expected: cedar and hemlock still can't wait under a canopy.
- **Reef** (`--veg`, seeds 1–3), with the opt-out: 1,858–2,123 coral colonies at year 200 against 2,087–2,349 before, a mean 9% lower; the ranges overlap. Animal species 21, 21, 21 against 21, 21, 20. Without the opt-out, seed 1 fell by a third. What's left is senescence starting at 0.7·life instead of a cutoff at `life`.
- **Chinandega loses trees.** 3,876 trees at year 200 against 5,379 in full mode on seed 1. Under `--veg`, seeds 1–3: 4,064–5,043 against 5,045–6,810 before, a mean 23% fewer, with invasive tiles 5,051–6,008 against 4,238–4,783. Recruits ÷ deaths is 1.01–1.15 against 1.10–1.33, still inside the band. Its trees are short-lived (life 40–100), and the map burns heavily. The extra background deaths open gaps that fire and invasive thicket take before trees can. The hazard terms there are small (about 1% a year). The lever is map data, `mortality: { background }`, which belongs in the phase 6 cross-map tuning.
- **Animal species below baseline − 1:** Sumatra 32 (baseline 34, one seed), and one Atlanta seed at 24 (the other two 28 and 29; baseline 29). Atlanta seed 1 had 29 at year 150. Both may be single-seed noise, but neither is confirmed.

### Phase 3 results (2026-10-21)

Advance regeneration, CNDD and the PNW east seed rain, measured as for phase 2: full wildlife, 200 years, same seeds. These runs used `--every 50`, so the tool's "changed" figure spans 50 years and isn't comparable with the decade figure above; it's left out. "Waiting" is understory saplings at year 200; "released" is saplings promoted into the tree slot over the whole run.

| Run | Seeds | Largest species, % (phase 2) | Shade-tolerant % of mature | Recruits ÷ deaths (phase 2) | Mature opened, % (unburned) (phase 2) | Simpson (phase 2) | Animal species | Trees (phase 2) | Age median / 95th, y | Waiting, year 200 | Released, 200 y |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pnw restore | 3 | fir 85–96 (86–92) | 1 | 1.06–1.25 (0.92–1.04) | 24–31 (6–16) (25–34 (12–14)) | 0.09–0.26 (0.15–0.25) | 30–31 | 7192–7404 (6722–7106) | 72–79 / 170–173 | 164–336, hemlock 125–228 | hemlock 102–114, fir 99–119 |
| pnw idle | 3 | fir 94–98 (94–98) | 0–1 | 1.38–1.69 (1.15–1.31) | 18–25 (10–13) (21–24 (9–11)) | 0.04–0.12 (0.05–0.11) | 29–30 | 7205–7647 (7276–7691) | 62–74 / 148–159 | 135–166, hemlock 108–132 | fir 54–72, hemlock 24–73 |
| amazon idle | 3 | brazilnut 74–75 (81–83) | 0 | 1.04–1.06 (1.02–1.05) | 20–28 (11–12) (22–27 (10–14)) | 0.42–0.44 (0.30–0.34) | 23–24 | 9153–9371 (9425–9482) | 90–103 / 160–165 | 241–388, açaí 195–283 | açaí 760–852, brazilnut 210–240 |
| atlanta idle | 3 | redmaple 34–42 (24–34) | 4–15 | 0.52–0.63 (0.72–0.74) | 61–67 (58–67) (48–56) | 0.74–0.80 (0.77–0.84) | 26–28 | 1047–1240 (1256–1404) | 53–63 / 184–186 | 422–539, redmaple, dogwood | redmaple 591–690 |
| sumatra idle | 1 | pending: the run hit a time limit at year 150 (fig 30%, Simpson 0.84, 33 species, recruits ÷ deaths 1.08 at year 150). A 200-year Sumatra run takes more than the 2 hours a cloud background job may run; finish it locally | | | | | | | | | |
| chinandega idle | 1 | neem 40 (guacimo 23) | 0 | 1.07 (0.96) | 78 (71) (84 (47)) | 0.76 (0.84) | 23 | 3392 (3876) | 30 / 88 | 211, neem 166 | neem 245 |
| serengeti idle | 1 | mesquite 94 (baseline 86–94) | 0 | 0.97 | 61 (44) | 0.12 | 22 | 4246 | 16 / 57 | 22 | sycamore fig 40 |
| reef idle | 1 | boulder 49 (baseline 53) | 0 | 1.27 | 38 (38) | 0.54 | 21 | 2288 colonies (baseline 1994) | 64 / 184 | (off) | - |

Against the targets:

- **Hemlock and redcedar still don't reach the canopy (1%, target ≥ 25%).** The understory works where they arrive: hemlock is most of what waits under PNW fir, and over 200 years it is released into gaps about as often as fir. The bottleneck is seed supply. Edge seed rain brings in about 5 hemlock seeds a year (3 tries a day, a quarter of them per edge, one species in 8–9), all within about 8 tiles of the north and east edges. Beyond that, hemlock spreads only from its own grown trees, radius 4, once per generation, against seed from about 7,000 canopy firs on every tile. A 120 × 90 map can't fill that way in 200 years. Real hemlock and redcedar seed is wind-borne and arrives from the surrounding forest in quantity. The lever is map data (`windSeeds`, more weight in `seedRain`, or a longer `radius`), which belongs to the phase 6 tuning. Fire also takes 30–40% of established-tree deaths on PNW and kills the waiting sapling with the tree; that keeps burned stands fir, as it should.
- **Brazil nut** fell from 81–83% to 74–75%, against a target of ≤ 40%. Simpson rose from 0.30–0.34 to 0.42–0.44. CNDD at 0.7 slows it but doesn't stop it. Brazil nut is 19% of trees at year 50 and 75% at year 200: it lives 500 years against 60–300 for most competitors, so each gap that goes to it stays taken. The understory is mostly açaí, a 60-year palm, which turns over without holding ground. Next levers: stronger CNDD for Brazil nut alone (`p.cndd`, which the code already reads), or giving long-lived shade-tolerant species (mahogany, ipê) a larger share of seed.
- **Recruits ÷ deaths** is inside 0.7–1.5 on PNW restore, Amazon, Chinandega and the reef. PNW idle reads 1.38–1.69 because forest is still spreading onto the old fields (see the note under the acceptance criteria). **Atlanta fell below the band, 0.52–0.63 against 0.72–0.74.** Its trees were already declining in phase 2 (about 2,400 at year 50 to 1,050–1,400 at year 200), with invasive thicket taking the gaps. A one-seed `--veg` A/B on Atlanta: phase 2 0.66, phase 3 0.61, CNDD off 0.65, understory off 0.73. So the understory, not CNDD, is most of the drop, but one seed can't confirm it, and why is open. It isn't a counting artifact: the check counts a released sapling as a recruit once it passes 0.35, and the tree count falls by about what recruits minus deaths says.
- **Chinandega: neem took over.** Invasive neem (`light[0]` 0.35) fills 166 of 211 understory slots, and at year 200 it is the largest species at 40% (phase 2: guacimo 23%, neem below it). Advance regeneration gives an invasive tree the same head start as a native one. Whether invasives may wait in the understory is a design call: real neem does invade forest understory. If not, a `p.invasive` exclusion in `trySeed`'s understory branch is one line.
- **Unburned openings** on PNW restore: 6–16% (phase 2 12–14%), so one seed now misses the 10% target. Released saplings fill gaps as young forest before they read as openings, which is the intent of advance regeneration.
- **Animal species** are within baseline − 1 everywhere measured except Atlanta, 26–28 against a baseline of 29 (phase 2 had a seed at 24).
- **`balance-sim restore 15`**, seeds 1–8 seeded via `--import`, phase 2 → phase 3 means: score 57.8 → 60.3, meadow tiles 764 → 985 (seed 7 at 1,584; phase 2 ranged 570–994), forest 200 → 185, mature 38.4 → 38.1, elk 17.5 → 15.9, invasive 30.0% → 27.7%. All within seed noise; forest is slightly lower, as expected while CNDD thins early same-species clumps.
- **`dailyTick`**: A/B on PNW restore, `--veg`, 60 years, seed 1, one process at a time in the order old, new, new, old, on a cloud container (about 4× slower than the Mac in absolute terms). Means, ms per `dailyTick`: years 0–20 14.35 → 13.63, 20–40 17.63 → 16.65, 40–60 18.41 → 17.44. Phase 3 has 16% fewer trees at year 60 (3,095 against 3,685), so per tree it costs slightly more, but the total is inside the 5% budget.

**Neem in the understory (Cole, 2026-10-21): allowed, as long as it follows nature.** It does: no invasive-only rule applies in the understory branch. Neem waits only where shrub-layer light is at least its `light[0]` 0.35, a canopy no denser than about 0.76. That means under thin dry-forest canopy, never deep shade, which matches a light-demanding tree whose young take moderate shade.

**Relaxed invasives (Cole, 2026-10-21).** Relaxed's `invasives: 0.6` used to thin only the seed rain from the map edges, while invasives already on the land spread at full strength. `trySeed` now multiplies natural invasive recruitment by `w.invasiveOdds`. `updatePlants` sets it daily to `min(1, diff.invasives)`, so it covers seed rain, spread from plants on the land, and burn and flood seeds. Challenging's extra edge seed rain is unchanged, and Standard is identical: a 25-year PNW restore run gives the same output before and after. `succession-check --difficulty relaxed`, `--veg`, seed 1, before → after, invasive tiles:

| Map | Year 25 | Year 50 | Year 100 | Notes |
|---|---|---|---|---|
| PNW restore | 3,820 → 809 | 4,277 → 1,205 | 2,350 → 1,639 | Native shrub and meadow take what blackberry would have (shrub 3,678 → 5,856 at year 25), so trees come a little later: 5,157 → 4,323 at year 100. |
| Atlanta | 2,102 → 1,537 | 1,506 → 1,139 | 1,258 → 1,043 | Mature forest 1,742 → 1,873. |
| Chinandega | 7,038 → 6,967 | 7,126 → 6,912 | 6,352 → 6,483 | No real change. Jaragua fills the open pasture within 25 years either way: it's limited by space, not seed. A Relaxed lever there would have to act on established grass (fire resprouting, or the native seed bank), not on seedlings. |

### Phase 4 results (2026-10-22)

Windstorms, drought and root rot (§4), measured as before: full wildlife, 200 years, `--every 10`, on Cole's Mac at `nice -n 5`. "Before" is a rerun of the phase 3 commit (bb2e3ef) on the same seeds, not the phase 3 table above: that table doesn't reproduce. Rerunning phase 3 Amazon gives Brazil nut 69/75/78%, matching the phase 3 session's own per-seed JSON files but not the table's 74–75%. Shares are of deaths of established trees in years 150–200.

| Run | Seeds | Largest, % (before) | Hemlock+cedar trees in mature forest (before) | Recruits ÷ deaths (before) | Unburned opened, % (before) | Fire share of deaths (before) | Wind / drought / rot share | Animal species (before) | Trees (before) |
|---|---|---|---|---|---|---|---|---|---|
| pnw restore | 3 | fir 90–91 (80–96) | 74–269 (47–94) | 0.99–1.05 (1.03–1.28) | 15–24 (8–12) | 22–36 (28–55) | 22–28 / 0 / 7–9 | 30–31 (30–31) | 6148–7056 (7005–7407) |
| pnw idle | 3 | fir 94–96 (95–96) | 31–111 (20–47) | 1.26–1.43 (1.34–1.43) | 21–33 (7–12) | 11–27 (37–47) | 27–39 / 0 / 6–10 | 28–31 (29–30) | 7301–7370 (7294–7476) |
| amazon idle | 3 | brazilnut 74–77 (69–78) | - | 0.78–1.11 (1.07–1.20) | 14–17 (11–13) | 34–60 (29–44) | 11–15 / 0 / 0 | 24 (23–24) | 7746–9313 (9115–9311) |
| atlanta idle | 3 | redmaple 40–48 (32–43) | - | 0.73–0.96 (0.57–0.59) | 59–69 (51–64) | 0–1 (0–14) | 13–25 / 1–9 / 0 | 28–31 (26–30) | 1213–2139 (1045–1129) |
| chinandega idle | 1 | neem 35 (guacimo 29) | - | 1.18 (1.12) | 68 (60) | 54 (53) | 5 / 0 / 0 | 23 (22) | 3487 (3279) |
| serengeti idle | 1 | mesquite 88 (86) | - | 1.00 (0.98) | 24 (19) | 87 (87) | 0 / ~0 / 0 | 22 (22) | 3812 (3567) |
| sumatra idle | 1 | fig 21 (24) | - | 1.03 (1.01) | 27 (24) | 10 (11) | 14 / 0 / 0 | 34 (34) | 8953 (8931) |

Against the targets:

- **Largest species ≤ 60% on PNW restore: missed**, fir 90–91%. Root rot can't fix it without wrecking the forest: rot on 1,674 tiles killing 40% of trees still left fir at 83% (`--veg`, seed 1), and only a runaway rot (61% of all deaths) got fir to 55%. Fir supplies the seed for every gap it opens. This is the phase 6 seed-supply problem.
- **Hemlock + cedar rising: yes, a little.** Mature-forest hemlock and cedar per seed went from 47–94 to 74–269 on restore and from 20–47 to 31–111 idle, still 1–4% of mature trees. Over 95% of all hemlock and cedar trees are within 15 tiles of the north and east edges (`tolerantNearEdge` in the check). Wind gaps near the edges help, but nothing reaches the interior. The limit is still seed supply.
- **Brazil nut ≤ 40%: missed**, 74–77%. Blowdowns open gaps that the light-demanding, 500-year Brazil nut wins. Levers for phase 6: `p.cndd` or `p.windfirm` for Brazil nut, and seed share for mahogany and ipê.
- **Unburned PNW openings ≥ 10% on every seed: met**, 15–24% restore, 21–33% idle.
- **Fire's share of Amazon deaths falls: missed.** It fell on seeds 1 and 2 (44→34%, 39→34%) and rose on seed 3 (29→60%, a large late fire). The three seeds had 229 fires against 196 and 28% more area burned: blowdown logs count as fuel in `Events.fuel` and gaps open the canopy. Real blowdowns do raise fire risk; the lever is the Amazon's fire settings (phase 6).
- **Recruits ÷ deaths 0.7–1.5: met on every forested map** except PNW idle (1.26–1.43, inside) and Amazon seed 3 (0.78, inside). **Atlanta is back in the band**, 0.73–0.96 against 0.57–0.59, with 1,213–2,139 trees against 1,045–1,129: wind gaps get recruited into.
- **Animal species ≥ baseline − 1: met** everywhere.
- **`balance-sim restore 15`**, 16 seeds seeded via `--import`, phase 3 → phase 4 means ± standard error: score 60.5 ± 1.3 → 61.7 ± 1.9, meadow 958 ± 78 → 941 ± 79, forest 194 ± 5.5 → 182 ± 4.6, mature 38.5 ± 1.3 → 37.8 ± 1.3, invasive 27.7% → 26.1%, elk 16.3 → 16.1. All within noise except forest, which is 6% lower at about 1.6 standard errors. Wind kills only 1–12 established trees per seed in those 15 years, so most of that is the random stream diverging from the first storm.
- **`dailyTick` ≤ +5%: met.** A whole-run A/B (PNW restore `--veg`, 60 years, old/new/new/old) was unreadable: the two old-code runs differed by up to 31% as the load average moved between 5 and 9, and the new code has 16% fewer trees by year 60. Instead, one PNW world grown to year 121, then 20 alternating 60-day blocks with the map's disturbance on and off: 5.31 against 5.22 ms per `dailyTick`, **+1.7%**.
- **Root rot is bounded.** A 350-year `--veg` PNW run holds 109–175 infected tiles from year 100 to 350, with rot 6–9% of deaths.

Also:

- **Drought is weak at severity 1**: 1–9% of Atlanta deaths, almost none on the Serengeti. Raising `drought.severity` is a phase 6 tuning call.
- **Chinandega**: one hurricane-size storm in 200 years on seed 1 (6 storms, the 400–4,000-tile draws mostly on open pasture). Neem became the largest species (35%), as in the phase 3 table; its rise came from phase 3's understory, not from storms.
- Not checked in a browser: the root-rot inspector line and the storm notice. Port 8347 was serving another checkout. `tools/disturbance-check.mjs` covers their logic and the Spanish pattern was checked in node.

### Phase 5 results (2026-10-22)

Deadwood decay, decay classes, nurse logs and snag fall (§5), measured as before: full wildlife, 200 years, `--every 10`, on Cole's Mac at `nice -n 5`, four runs at a time. "Before" is the phase 4 commit (b70c5c5). The phase 4 session's per-seed JSONs reproduce exactly (checked at year 20, and in full for the six PNW runs), so they serve as the before for the other maps. PNW was rerun with the new `succession-check` to get nurse-log numbers for the before. Before phase 5, a log's `featureAge` is plain days, so the before's "rotten" column counts logs at least 12 years old.

Deadwood over time, snags / logs (rotten), range across seeds:

| Run | Seeds | Year 50 | Year 100 | Year 150 | Year 200 (before) |
|---|---|---|---|---|---|
| pnw restore | 3 | 128–164 / 403–636 (91–119) | 400–573 / 1489–1751 (591–885) | 534–756 / 2214–2545 (1193–1439) | 543–754 / 2615–2660 (1211–1454) (295–821 / 1627–1857 (796–958)) |
| pnw idle | 3 | 79–143 / 261–339 | 265–479 / 921–1321 | 538–735 / 2023–2186 | 512–601 / 2812–3020 (1392–1510) (269–598 / 1938–2105 (1063–1270)) |
| amazon idle | 1 | 844 / 1138 | 594 / 1832 | 587 / 1494 | 261 / 707 (439) (474 / 1757) |
| atlanta idle | 1 | 334 / 620 | 148 / 701 | 191 / 595 | 155 / 490 (296) (99 / 427) |
| chinandega idle | 1 | 117 / 518 | 363 / 870 | 403 / 811 | 502 / 1167 (705) (681 / 1305) |
| serengeti idle | 1 | identical to before: the savanna keeps its timers | | | 63 / 503 |

| Run | Seeds | Largest, % (before) | Hemlock + cedar trees in mature forest (before) | Recruits ÷ deaths (before) | Unburned opened, % (before) | Fire share of deaths, % (before) | Area burned, tiles over 200 y (before) | Animal species (before) | Trees (before) |
|---|---|---|---|---|---|---|---|---|---|
| pnw restore | 3 | fir 85–90 (90–91) | 192–209 (74–269) | 1.14–1.16 (0.99–1.05) | 17–28 (15–24) | 22–39 (22–36) | 29,900–33,700 (18,900–27,800) | 30–31 (30–31) | 7113–7392 (6148–7056) |
| pnw idle | 3 | fir 91–96 (94–96) | 50–135 (31–111) | 1.32–1.40 (1.26–1.43) | 23–32 (21–33) | 13–22 (11–27) | 28,600–32,600 (25,500–36,600) | 28–30 (28–31) | 7048–7610 (7301–7370) |
| amazon idle | 1 | brazilnut 78 (77) | - | 1.13 (1.11) | 15 (15) | 26 (34) | 17,400 (30,300) | 24 (24) | 9374 (9190) |
| atlanta idle | 1 | redmaple 42 (40) | - | 0.78 (0.77) | 67 (59) | 2 (0) | 455 (580) | 29 (28) | 1100 (1213) |
| chinandega idle | 1 | neem 32 (35) | - | 1.21 (1.18) | 70 (68) | 41 (54) | 252,700 (238,100) | 23 (23) | 2879 (3487) |
| serengeti idle | 1 | mesquite 88 (88) | - | 1.00 (1.00) | 24 (24) | 87 (87) | identical | 22 (22) | 3812 (3812) |

Nurse logs, PNW, per seed (before → after):

| Run, seed | Hemlock / cedar in mature forest | Nurse-log recruits over 200 y, share on a log | Cedar released from the understory | Hemlock + cedar on a log at year 200, grown + waiting |
|---|---|---|---|---|
| restore 1 | 134 / 6 → 167 / 26 | 337, 64% → 545, 72% | 7 → 43 | 62 + 52 → 101 + 117 |
| restore 2 | 53 / 21 → 191 / 18 | 443, 60% → 436, 70% | 18 → 34 | 21 + 5 → 86 + 98 |
| restore 3 | 263 / 6 → 180 / 12 | 672, 68% → 433, 63% | 18 → 31 | 104 + 37 → 127 + 135 |
| idle 1 | 35 / 6 → 39 / 19 | 191, 66% → 116, 66% | 11 → 14 | 15 + 23 → 24 + 53 |
| idle 2 | 111 / 0 → 117 / 18 | 216, 63% → 234, 70% | 5 → 30 | 66 + 26 → 70 + 80 |
| idle 3 | 31 / 0 → 44 / 6 | 158, 69% → 151, 56% | 3 → 14 | 32 + 21 → 28 + 48 |

"On a log" means the tile held a log when the tree passed 0.35; by then many logs have gone, so it undercounts.

What changed:

- **Deadwood follows conditions.** PNW, where 90% of the trees are fir (wood 0.6) on ground at moisture 0.4–0.5, now holds about 50% more logs at year 200 (2,600–3,000 against 1,600–2,100) and up to twice the snags in years 100–150. The Amazon (map factor 1.8) holds 17–60% fewer logs from year 100 on. Atlanta, mostly hardwood on damp ground at the reference pace, is about where it was. Chinandega's logs rot faster, but this run's storms differed: hurricanes threw 470–810 trees in each of three decades, and wind was 29% of deaths in years 150–200 against 5% before. It ends with 17% fewer trees, so its deadwood counts aren't comparable. The Serengeti is identical, tile for tile.
- **Redcedar is the clearest nurse-log gain.** It gained `nurse` and now waits on rotting logs: released from the understory 14–43 times per run against 3–18, waiting 25–40 against 7–24, and in mature forest on every seed (6–26 against 0–21).
- **Hemlock and cedar are still edge-limited, as expected.** Mature-forest hemlock + cedar is 192–209 against 74–269 on restore (a narrower range, mean 198 against 161) and 50–135 against 31–111 idle. That is still 2–4% of mature trees. 92–100% of all hemlock and cedar trees are within 15 tiles of the north and east edges, the same as phase 4. Nurse logs help where their seed lands; they can't bring seed to the interior.
- **More nurse-log trees sit on logs** at year 200: 2–4 times as many saplings waiting on a log, and more grown ones on restore. The share of nurse-log recruits that came up on a log moved little (56–72% against 60–69%): most hemlock establishes near the edges, where logs are, either way.
- **Fir** fell to 85–90% on restore (90–91%) and 91–96% idle (94–96%), within seed noise of before. The target is ≤ 60%.
- **Recruits ÷ deaths** stays inside 0.7–1.5 on every forested map. PNW restore rose to 1.14–1.16, with 7,100–7,400 trees against 6,100–7,100.
- **Animal species ≥ baseline − 1: met** on every map.

Fire:

- **Amazon fire fell** on its one seed: 17,400 tiles burned against 30,300, and fire 26% of established-tree deaths against 34%. Fewer, faster-rotting blowdown logs is the expected direction, but it's one seed; phase 4 saw 29–60% across seeds.
- **PNW restore burned more on all three seeds**: 29,900–33,700 tiles over 200 years against 18,900–27,800, with about the same number of fires (82–92 against 83–86) and the same fire share of deaths. PNW idle didn't (28,600–32,600 against 25,500–36,600). Snags and logs each add 0.4 to `Events.fuel`, and PNW has about 50% more of them, so some of this may be real. But the area burned per 50 years swings between 3,300 and 11,700 tiles within one build, and one restore seed already burned 60% more in years 0–50, before the deadwood differed. Three seeds can't separate the two. If it's real, the natural lever is that a rotten log, soaked through, adds less fuel than a sound one: that's a phase 6 call with the other fire settings.

Checks:

- **`balance-sim restore 15`**, 16 seeds seeded via `--import`, phase 4 → phase 5 means ± standard error: score 61.7 ± 1.9 → 61.8 ± 1.8, meadow 941 ± 79 → 960 ± 91, forest 182 ± 4.6 → 178 ± 5.4, mature 37.8 ± 1.3 → 35.7 ± 1.9, invasive 26.1% → 26.2%, elk 16.1 → 17.0, snags at year 15 23 → 26. All within noise. A rerun of the phase 4 commit reproduces the phase 4 session's seed 1 exactly.
- **`dailyTick` ≤ +5%: met.** One PNW restore world grown to year 120 with the new code (7,200 trees, about 500 snags and 2,500 logs), loaded into both builds, 12 alternating 60-day blocks in one process: +2.4% ± 1.0% with the new code loaded first, −0.1% ± 1.3% with the old code loaded first. A/A runs read +0.4% and +1.4%. Separate processes, 360 days each: 9.78 and 9.71 ms new, 10.23 and 9.67 ms old.
  - A first attempt read +46%. That harness grew the world in the same process with the new code, then ran the new code on a second, restored world. The A/A and swapped runs on a stored world don't show it. The likely cause is that world objects of different shapes go through the same hot functions: `seedbank`, `bankStrength`, `browseDamage` and `grazed` are added to the world mid-game with `||=`, the pattern AGENTS.md warns about. Whether a player hits it (loading a save in a session that already ran a farm) is unconfirmed.
- `deadwood-check` (11 checks), `data-contracts-check`, `consistency-check`, `tree-mortality-check`, `plant-ecology-check`, `disturbance-check`, `vegetation-check`, `plant-replay-check`, `farm-state-check`, `challenging-ecology-check`, `beaver-dam-check`, `animal-dormancy-check` and `browser-save-check` pass.
- **Browser.** Phase 4's storm notice, root-rot first-kill notice and root-rot inspector line show and read well (PNW, forced through the console). A rotten log draws slumped and moss-green beside sound brown ones.

### Open for phase 6

- **Seed supply and long-distance dispersal.** Hemlock and redcedar: 92–100% within 15 tiles of the seed edges after 200 years. Amazon's long-lived competitors (mahogany, ipê) need a larger share of seed.
- **Fir and Brazil nut dominance**: fir 85–96%, Brazil nut 78%.
- **Fire after blowdowns and deadwood fuel.** Amazon fire may be eased by faster decay (one seed). PNW restore burned more with more deadwood (unconfirmed). A lower fuel value for rotten logs is the candidate lever.
- **Weak drought**: 1–9% of Atlanta deaths, almost none on the Serengeti.
- **Chinandega neem**: 32–35%, from the understory head start (phase 3).
- **Wood overrides** worth considering with the tuning: ipê and mahogany (very durable), balsa and cecropia (rot fast). Only redcedar and hemlock have them now.
- **World shape.** Declare the lazily added world fields (`seedbank`, `bankStrength`, `browseDamage`, `grazed`) in the `World` constructor, and check whether a session that loads a second farm slows down.

### Phase 6 results (2026-10-22)

Seed dispersal (§6), rotten-log fuel, canopy fire damping, drought and the disperser bonus, measured as before: full wildlife, 200 years, `--every 10`, on Cole's Mac at `nice -n 5`, several runs at a time under a high load average (so the runs' ms figures mean nothing). "Before" is phase 5 (27de3ff): the phase 5 session's per-seed JSONs, plus reruns of Amazon and Atlanta seeds 2–6 and Chinandega seeds 2–3.

Changes beyond §6:

- **Fire under a closed canopy** (`Events.fuel`). A surface fire's dryness falls by up to half (`SHADE_DAMP` 0.5) as `w.canopy` goes from 0.5 to 1. The canopy follows the leaves, so a dry forest that drops them in the dry season (Chinandega) and open savanna get none of it, and a crown fire's heat ignores it. The cause: a probe of Amazon fires in years 110–160 found 2,680 of 7,503 burned tiles in mature forest, at a floor moisture of 0.29 (median). The canopy adds only 0.06 to moisture, so closed rainforest burned like pasture. Turning off crown fires alone changed nothing (fire 34–45% of deaths against 36–50%).
- **Amazon `crownFires: false`**: a rainforest fire is a surface fire under the canopy.
- **Rotten logs** add 0.15 fuel instead of 0.4.
- **The disperser bonus** (`disperserMult`): a tree whose one disperser lives on the map seeded at 1.6× the normal rate. That made the Brazil nut, durian and balanites out-seed every other long-lived tree. It's now 1 with the animal and 0.12 without, so agoutis still make an 8× difference. On its own it took Brazil nut from 57–64% to 35–37% (3 seeds each). It was the deciding lever for the Amazon target, and it's a shared rule, not a species override. No species overrides were added: Brazil nut `p.cndd` 0.9 gave 55–61%, and Brazil nut naturally grows in groves, so the case for strong CNDD is mixed.
- **Drought**: Atlanta severity 1 → 3, Serengeti 1 → 3, and the Amazon gains drought (threshold 45, the 85th percentile of its yearly longest dry streak; severity 1.5). Atlanta drought deaths, years 20–200: 5–11% of deaths (before 2–5%). The Serengeti stays at 1–2%: there, who dies of drought is set by how close trees grow to the dry end of their range, which the hydrology track changes, not severity.

| Run | Seeds | Largest, % (before) | Hemlock + cedar % of mature (before) | Tolerant trees, inland of 15 tiles | Recruits ÷ deaths (before) | Unburned opened, % | Fire share of deaths, % (before) | Burned tiles, 200 y (before) | Animal species | Simpson (before) |
|---|---|---|---|---|---|---|---|---|---|---|
| pnw restore | 3 | fir 86 (85–90) | 8 (3) | 209–344 of 605–703 (2–19 of 229–239) | 0.99–1.10 (1.14–1.16) | 24–29 | 9–22 (22–39) | 12,100–18,600 (29,900–33,700) | 30–31 | 0.25 (0.20–0.28) |
| pnw idle | 3 | fir 88–89 (91–96) | 7–8 (1–2) | 307–578 of 559–724 (0–1) | 0.99–1.18 (1.32–1.40) | 26–31 | 10–22 (13–22) | 12,700–24,400 (28,600–32,600) | 29–30 | 0.21–0.22 (0.08–0.16) |
| amazon idle | 3 | brazilnut 35–37 (78–80) | - | - | 1.00–1.04 (0.90–1.13) | 20 | 8–14 (26–47) | 7,000–14,700 (17,400–27,500) | 23–24 | 0.73–0.75 (0.35–0.39) |
| atlanta idle | 6 | redmaple 41–52 (39–53) | - | - | 0.65–0.78 (0.67–0.79) | 64–73 | 0–4 | | 26–30 (25–29) | 0.69–0.77 |
| chinandega idle | 3 | neem 29–48 (32–42) | - | - | 1.08–1.13 (1.15–1.21) | 33–69 | 42–55 (40–41) | 238,000–245,000 | 22–23 | 0.71–0.80 |
| serengeti idle | 3 | mesquite 92–93 (88) | - | - | 0.95–1.00 | 34–48 | 70–76 (87) | 105,000–117,000 (121,000) | 20–22 (22) | 0.13–0.16 (0.23) |
| sumatra idle `--veg` | 1 | fig 34 (durian 6) | - | - | 1.02 | 24 | 6 | 1,700 | (33) | 0.80 |
| reef idle | 1 | boulder 51 | - | - | 1.20 | 37 | 0 | 0 | 21 | 0.53 |

400 years, PNW restore `--veg`, seed 1, hemlock + cedar share of mature trees (fir):

| Year | 100 | 200 | 300 | 400 |
|---|---|---|---|---|
| Phase 5 | 1% (84%) | 2% (88%) | 4% (91%) | 4% (92%) |
| Phase 6 | 2% (88%) | 10% (87%) | 17% (81%) | 25% (74%) |

`--assert` on the final runs (`succession-check`'s targets applied to the saved JSONs): 50 pass, 18 fail. The failures:

- PNW restore and idle, all six seeds: largest ≤ 60% (fir 86–89%) and hemlock + cedar ≥ 25% (7–8%). **The target is wrong for year 200, not unreachable.** Hemlock is suitable under 95% of the fir canopy (a probe of a year-120 world: suitability > 0.6 on 92% of tree tiles), and about 80% of hemlock seed landing there takes. So it's limited only by the time a waiting sapling needs to get a gap, which is set by the tree mortality of phases 2–4. Real westside Douglas-fir stands stay fir-dominated for 250–500 years. The criterion is met at year 400 on the one seed run that long. Redcedar stays minor (1–2%) because 89% of the forest floor is drier than its moisture minimum of 0.5: it belongs to wet ground.
- Atlanta seeds 1, 2, 5 recruits ÷ deaths 0.65–0.70, and seeds 1, 5, 6 species 26–27. Phase 5 on the same six seeds misses on 2 recruits ÷ deaths and 2 species, so this is a pre-existing Atlanta issue (invasive thicket takes the gaps), not a phase 6 effect.

Also:

- **Chinandega neem** isn't settled: 29–48% against 32–42% before (3 seeds each), 42% with the canopy damping off. Per Cole's decision it may wait in the understory; nothing here exempts invasives.
- **Serengeti mesquite** rose from 88% to 92–93% (one before seed). The likely cause is that evergreen mesquite thickets now damp fire a little and the edge kernel sends its seed further in. Real mesquite thickets do suppress grass fires.
- **`balance-sim restore 15`**, 16 seeds seeded via `--import`, phase 5 → phase 6 means ± standard error: score 61.8 ± 1.8 → 60.8 ± 1.0, meadow 960 ± 91 → 822 ± 54, elk 17.0 → 16.1, invasive 26.2% → 28.0%: within noise. But **forest tiles 178 ± 5 → 396 ± 6 and mature 36 → 81**. That's a real change: the forest rain colonizes Hollis's north and east edges within the first 15 years, as conifers do on abandoned fields beside a forest. If it's too fast for the game, `forestRain` in `maps/pnw.js` is the knob.
- **`dailyTick`**: the stored PNW year-120 world from phase 5, loaded into both builds, 12 alternating 60-day blocks per process, both load orders. The Mac was on battery in Low Power Mode with another agent using two cores, so the absolute ms are high and noisy. Against phase 5: −5.2% ± 5.1% and +3.6% ± 4.0% (swapped order, sign as new-vs-old): within noise. Against the phase 1 baseline (9d99a33) for the whole stack: +6.7% ± 11.3%, and +3.8% ± 1.7% in the swapped order. Phase 4 and 5 measured +1.7% and +0–2.4% for their steps, so the stack is about +4–7%, at or slightly over the 5% budget, and this run can't pin it closer. Repeat it on AC power with a quiet machine before relying on it.
- Checks: `data-contracts`, `consistency`, `tree-mortality`, `plant-ecology`, `disturbance`, `deadwood`, the new `dispersal` (5 checks), `vegetation`, `plant-replay`, `farm-state`, `challenging-ecology`, `beaver-dam` and `animal-dormancy` pass. **`browser-save-check` was not run** in phase 6 (out of time); the save format didn't change (no new arrays), but run it before merging.
- No new world fields.

### How to run

```
nice -n 5 node tools/succession-check.mjs --map pnw --mode restore --years 200 --seeds 1,2,3 --assert --json out.json
```

`--map` takes `pnw`, `all`, or a comma list of map ids. `--mode restore` runs the Hollis plan from `tools/hollis-restore-plan.mjs` (shared with `balance-sim`). Other maps fall back to `idle` with a note. `--every` sets the report interval in years. `--veg` is the fast structure mode. `--assert` checks the targets above and exits 1 on a miss; today it fails, as expected. `--json` writes every report and the per-run summary. A seed sets both `Math.random` and `game.rng`, on the same world. A 200-year full run takes 10–40 minutes depending on the map and machine load, so run several seeds as separate background processes. The per-map targets live in `TARGETS` and `BASELINE_SPECIES` at the top of the tool.

## Phases

Each phase is one session, run in order, each building on the last:

1. **Succession check and baselines.** (Done: see [Baselines](#baselines-phase-1-2026-10-19).) Add `tools/succession-check.mjs`, built from the scratch probe. It's seeded, all maps, `idle` and `restore` modes, and a `--veg` mode that steps wildlife less often for fast 300-year structure runs. It reports the measures above plus age structure and deaths by cause, and asserts targets once a `--assert` flag is set. Record the baselines in this doc. No game code changes.
2. **Tree removal and mortality hazard.** (Done: see [Phase 2 results](#phase-2-results-2026-10-20).) Add `removeTree` with causes, move every call site to it, and swap in the hazard model. Tune so that Atlanta's recruits-to-deaths ratio and PNW turnover improve without breaking `balance-sim restore 15`.
3. **Advance regeneration and CNDD.** (Done: see [Phase 3 results](#phase-3-results-2026-10-21). Hemlock, cedar and Brazil nut are not fixed; the remaining levers are map data for phase 6.) Add the understory arrays (with saves), release on removal, CNDD in `trySeed`, and map `recruitment` config. Expected to fix hemlock/cedar and Brazil nut.
4. **Disturbance regimes.** (Done: see [Phase 4 results](#phase-4-results-2026-10-22). Fir, Brazil nut and Amazon fire are not fixed.) Add `sim/disturbance.js` with windstorm and drought on every map that fits, an optional PNW root-rot pathogen, notifications, and a Field Journal line.
5. **Deadwood decay and nurse logs.** (Done: see [Phase 5 results](#phase-5-results-2026-10-22). Hemlock and cedar are still limited by seed supply.) Make decay depend on moisture and wood type, and add nurse-log recruitment and snag fall.
6. **Cross-map tuning and acceptance.** (Done: see [Phase 6 results](#phase-6-results-2026-10-22) and the Outcome.) Sweep all seven maps, tune map data, update this doc's results, and update AGENTS.md's decision list.

Hydrology (finishing `sim/hollis-water.js`) is a separate track. It plugs in through the drought and stress term and `w.moist`, with no new mortality code.

## Out of scope

- Mycorrhiza.
- Individual-tree height or crown models.
- More than one tree per tile.
- Erosion.
- Changing grazing (0011), except that understory saplings are browsed through the existing functions.
