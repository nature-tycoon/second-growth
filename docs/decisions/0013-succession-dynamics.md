# 0013 Long-term forest dynamics: mortality, regeneration and disturbance

Proposed 2026-10-18. Status: in progress. Phase 1 (succession check and baselines) and phase 2 (tree removal and mortality hazard) done 2026-10-19. Follows the ecologist review (Jacob, 2026-10-16), §5, §8 and §12.

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

**Advance regeneration.** Two new saved arrays, `w.understory` (plant id) and `w.understoryG`, registered in `EXTRA_ARRAYS` in `data/world-schema.js`. Old saves load with empty arrays.

- A tree seed landing on a tile with a living tree no longer just fails. If the light at the shrub layer (`layerLight(w, i, 1)`) is at least `p.light[0]`, and the site is otherwise suitable, it can take the understory slot. It replaces a weaker or less shade-tolerant occupant.
- Understory saplings grow very slowly, capped at about 0.25. They die at a low rate, and browsers hit them through the existing `grazedGrowth` / `grazedSeedlingLost` path. Deer browsing on hemlock and cedar is real and limits recruitment.
- `removeTree` promotes the understory to the tree slot at its current size, so the head start beats a new seed.
- Shade tolerance comes from `p.light[0]`. Cedar and hemlock (0) qualify under almost any canopy, fir (0.42) only under a thin one, alder and cottonwood (0.5–0.6) almost never. That ordering is the real one, and new species fit in automatically.

**Conspecific negative density dependence (CNDD).** Natural tree recruitment odds get multiplied by `1 − cndd × f`, where `f` is the share of the 5×5 neighborhood's adult trees that are the same species.

- `cndd = p.cndd ?? map.recruitment?.cndd ?? 0.3`. Planned map values: about 0.6–0.7 for Amazon, Sumatra and Chinandega, 0.3 for temperate maps, and 0 for savanna and reef, which have their own spacing rules. This is defensible: CNDD is documented as stronger in the tropics.
- It applies to understory recruitment too.
- Player planting is exempt, as with grazing.

### 4. Disturbance regimes (`sim/disturbance.js`, new)

The module owns patch-scale tree mortality other than fire, which stays in `events.js` but calls `removeTree(…, 'fire')`.

Map data:

```js
disturbance: {
  windstorm: { months: [10, 11, 0, 1], perYear: 0.6, patch: [3, 40], severity: 0.5 },
  drought:   { trigger: 'dryStreak', threshold: 9, severity: 0.3 },
  pathogen:  { host: ['fir'], perYear: 0.2, spread: 0.02 },   // e.g. laminated root rot in Douglas fir
}
```

- **Windstorm.** Picks an exposed area and a patch size from a heavy-tailed draw: mostly small gaps, sometimes a large blowdown.
  - Per-tree kill chance is `severity × size(treeG) × exposure × rooting × p.windfirm`.
  - `exposure` rises with open neighbors (`1 − nbCanopy`), so gaps grow at their edges, as in real forests. `rooting` rises on saturated soil.
  - `p.windfirm` defaults from traits (conifers on wet ground are less windfirm; data can override), and snags fall to logs.
- **Drought.** On a long dry streak, raises the stress term for trees near the dry end of their `moist` range. This is the hook the later hydrology work plugs into: wetter or drier ground from water balance changes this, with no new mortality code.
- **Pathogen.** A slow patch that spreads only through its host species and kills mostly adults. It's density-dependent mortality for adults, and the most specific realistic driver of PNW gaps. Optional, in phase 4.
- **Each map lists only what fits it.** PNW: winter windstorms and root rot. Atlanta: summer thunderstorms, ice storms, drought. Amazon and Sumatra: convective blowdowns. Chinandega: hurricanes, rare and large. Serengeti: drought (elephants and fire already exist). Reef: none for now.
- Events notify the player through `events.js`'s existing notify path, and the Field Journal explains gaps ("A windstorm opened this gap. Young hemlock that was waiting under the canopy is taking over.").

### 5. Deadwood (`sim/plants.js`, feature aging)

- Decay rate comes from moisture (`w.moist`) and wood type (conifer slower), replacing the fixed timers. The savanna's termites and fire speed-up stays as a map factor.
- Logs act as nurse sites. `p.nurse` already exists; it gets a recruitment bonus on and next to logs.
- Wind and fire send snags down as logs.
- Fungi and decomposers come in later as the thing that sets decay rate. This phase only makes the rate depend on conditions, so fungi can modulate it later.

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

### How to run

```
nice -n 5 node tools/succession-check.mjs --map pnw --mode restore --years 200 --seeds 1,2,3 --assert --json out.json
```

`--map` takes `pnw`, `all`, or a comma list of map ids. `--mode restore` runs the Hollis plan from `tools/hollis-restore-plan.mjs` (shared with `balance-sim`). Other maps fall back to `idle` with a note. `--every` sets the report interval in years. `--veg` is the fast structure mode. `--assert` checks the targets above and exits 1 on a miss; today it fails, as expected. `--json` writes every report and the per-run summary. A seed sets both `Math.random` and `game.rng`, on the same world. A 200-year full run takes 10–40 minutes depending on the map and machine load, so run several seeds as separate background processes. The per-map targets live in `TARGETS` and `BASELINE_SPECIES` at the top of the tool.

## Phases

Each phase is one session, run in order, each building on the last:

1. **Succession check and baselines.** (Done: see [Baselines](#baselines-phase-1-2026-10-19).) Add `tools/succession-check.mjs`, built from the scratch probe. It's seeded, all maps, `idle` and `restore` modes, and a `--veg` mode that steps wildlife less often for fast 300-year structure runs. It reports the measures above plus age structure and deaths by cause, and asserts targets once a `--assert` flag is set. Record the baselines in this doc. No game code changes.
2. **Tree removal and mortality hazard.** (Done: see [Phase 2 results](#phase-2-results-2026-10-20).) Add `removeTree` with causes, move every call site to it, and swap in the hazard model. Tune so that Atlanta's recruits-to-deaths ratio and PNW turnover improve without breaking `balance-sim restore 15`.
3. **Advance regeneration and CNDD.** Add the understory arrays (with saves), release on removal, CNDD in `trySeed`, and map `recruitment` config. Expected to fix hemlock/cedar and Brazil nut.
4. **Disturbance regimes.** Add `sim/disturbance.js` with windstorm and drought on every map that fits, an optional PNW root-rot pathogen, notifications, and a Field Journal line.
5. **Deadwood decay and nurse logs.** Make decay depend on moisture and wood type, and add nurse-log recruitment and snag fall.
6. **Cross-map tuning and acceptance.** Sweep all seven maps, tune map data, update this doc's results, and update AGENTS.md's decision list.

Hydrology (finishing `sim/hollis-water.js`) is a separate track. It plugs in through the drought and stress term and `w.moist`, with no new mortality code.

## Out of scope

- Mycorrhiza.
- Individual-tree height or crown models.
- More than one tree per tile.
- Erosion.
- Changing grazing (0011), except that understory saplings are browsed through the existing functions.
