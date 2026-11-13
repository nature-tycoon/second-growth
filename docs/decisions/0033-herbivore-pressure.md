# 0033 Herbivore pressure: kg per hectare, by guild and by taste

## Rules

- One model on every map (`sim/herbivory.js`, effects in `sim/grazing.js` through the plant hooks `grazedRecruitOdds`, `grazedGrowth`, `grazedSeedlingLost`). No map-specific branches.
- Read pressure only through `herbivoreKg(w, i, guild)` / `herbivoreIndex`, never the `w.herbivory` arrays (cells, not tiles). Report totals come from `herbivoreTotals(w)`.
- A new large herbivore needs `kg` (adult live mass) in its definition, and a `BROWSE_SHARE` entry if its diet isn't the default for its forage order. `behaviorFor` builds `behavior.herbivore = { kg, browse, breaks, rubs }`.
- A new map needs `REFERENCE[map].herbivores: [low, high]` (kg/ha, with a source) in `data/eco-reference.js`, or the field is off there.
- Tree `browse` is both forage value and palatability, one number on purpose; no value counts as 0.3. `thorny` and `resprout` flags shelter and spare plants.
- Shelters (brush, fences, thorny shrubs, thicket edges, nurse logs, `UNDER_CANOPY`) cut browsing; trampling (`trampledSeedling`), elephants (`elephantFelled`) and rut rubbing (`rubSapling`) are general rules on every map (the savanna-only trample is gone). Trees killed go through `removeTree` (0028).
- `w.herbivory` is declared in the `World` constructor and isn't saved; a loaded farm rebuilds it from that day's animals.
- Checks: `node tools/herbivore-pressure-check.mjs`; long runs `node tools/herbivore-pressure.mjs pnw,serengeti,atlanta 200 7,11,23 [--exclosure]`; seeded `balance-sim restore 15`.

## History

2026-11-01. Workstream E2. Cole agreed the design and targets on 2026-11-01, then changed the PNW
and Serengeti targets after the first results (below). Builds on [0011](0011-grazing-pressure.md)
(the per-tile sward, `w.grazed`), and fills the hook [0027](0027-plant-succession.md) and
[0028](0028-succession-dynamics.md) left in the plant step (`grazedRecruitOdds`, `grazedGrowth`,
`grazedSeedlingLost`).

### Context

A tester wrote that with intact large herbivores (grazing, browsing, trampling, rubbing) the forest
should be much more mixed, that the engine should account for which herbivores are present and at
what pressure, and that wild nature holds roughly 120–150 kg of large herbivores per hectare.
Decision 0027 had left three gaps for this: Serengeti mesquite at 57–87% of trees on an untended
farm, Atlanta's flowering dogwood at about 24% of trees, and PNW camas and flower meadows needing
something to hold trees back.

What the engine did before:

- Herbivores touched woody plants only in an open sward (0011). The pressure faded to nothing under
  and beside trees, so deer and elk never browsed the young trees filling forest gaps or waiting in
  the understory (0028 noted this).
- Every browser ate every tree species alike. Invasives were exempt altogether.
- There was no body mass: "weight" was (sprite length / deer)², capped at 2.
- The savanna had its own trampling rule (`Wildlife.trample`, any big non-prey animal, 3×3 tiles).

What the farms carry (measured headless, live animals, juveniles at a third). A farm is 120×90 tiles
= 72.8 ha (Atlanta is 72×60 = 29 ha; `TILE_HA` is the same everywhere):

| Map | Herbivores | kg/ha | Wild range used |
|---|---|---|---|
| PNW | 14–19 deer, 4–19 elk | 25–85 | 20–50 (Roosevelt elk 10.8–16/km² in Olympic old growth, Houston et al. 1987, plus black-tailed deer) |
| Atlanta | 10–13 white-tailed deer | 12–22 | 5–15 (8–25 deer/km²; McCabe & McCabe 1997; Côté et al. 2004) |
| Serengeti | ~13 giraffe, 7–11 elephants, 10–20 buffalo, impala, gazelle, hippo… | 450–1,100 | 100–200 (savanna on over 500 mm of rain, 10,000–20,000 kg/km²; Coe et al. 1976) |

The tester's 120–150 kg/ha matches a full Ice-Age guild in rewilded Europe: Fløjgaard et al. (2022,
J. Appl. Ecol.) put Europe's natural baseline at about 9–98 kg/ha (mean 48) from African reserves,
and a later paper tentatively at 50–300. Today's PNW is realistic for elk and deer alone. Cole chose
to keep the herds as they are and to measure pressure in real kg/ha. The Serengeti carries 3–5× a
real savanna, mostly giraffe, elephants and buffalo on a small farm. That is left to workstream F
(animals and species), and pressure here mustn't make the hartebeest decline worse.

### Decision

One model on every map. No map-specific branches.

**Data.**
- Every large plant-eater has `kg`, its adult live mass (Smith et al. 2003, MOM database; Kingdon
  2015). `behaviorFor` gives each one `behavior.herbivore = { kg, browse, breaks, rubs }`:
  - `browse` is the share of feeding that is browse. It defaults from the diet order: browser-first
    0.8, a grazer that also browses 0.3, a pure grazer 0. These species differ (`BROWSE_SHARE`):
    giraffe and black rhino 1, impala 0.45, elephants 0.5, sambar 0.6, elk 0.35.
  - `breaks` is elephants (`tramples`). `rubs` is antlered cervids.
- Woody plants use their existing `browse` (forage value, 0..1) as palatability, with values added
  for young trees, and sources beside them in the plant files:
  - PNW: redcedar 0.9, cottonwood 0.8, maple 0.7, oak and fir 0.6, birch 0.5, ash 0.4, alder 0.3,
    hemlock 0.25 (on Haida Gwaii, hemlock kept regenerating where deer wiped out redcedar).
  - Atlanta: dogwood 0.9, red maple 0.75, tulip poplar and white oak 0.7, … black cherry and loblolly
    0.15.
  - Serengeti: umbrella thorn 0.7, … mesquite 0.35, candelabra 0.05.
  - A tree with no value counts as 0.3.
- New `thorny` flag (rose, blackberry, acacias, desert date, mesquite, whistling thorn, prickly
  pear, Callery pear). `resprout` now also covers broadleaf trees that coppice back from a browsed
  stem.
- `REFERENCE[map].herbivores` (`data/eco-reference.js`) is each biome's intact biomass range.

**The field** (`sim/herbivory.js`).
- A grid of 4×4-tile cells. Once a day, `herbivoryDay` adds every large herbivore's mass to its cell
  and the 8 around it (weights 1-2-1), split into graze, browse and heavy (elephants). The day is
  folded into a 45-day running average.
- `herbivoreKg(w, i, guild)` blends between cell centres, so there are no square edges.
- `herbivoreIndex` is the pressure, 0..1: `1 − exp(−kg / (ref × share))`. `ref` is the middle of
  the map's range; `share` is 0.5 for graze and browse and 0.25 for heavy. That is 63% where a guild
  stands at its share of the intact biomass, and nearly full at three times it.
- The field isn't saved. A loaded farm starts from that day's animals.

**Effects** (`sim/grazing.js`, through the existing hooks in `sim/plants.js`):
- **Browsing** (`browsePressure`) reaches every woody plant below 0.45 (a deer's reach), in the open,
  in forest gaps and in the understory.
  - It is index × palatability, × 0.45 for thorny plants.
  - Shelter cuts it: brush or a fence × 0.15, inside a thorny shrub × 0.3, at a thicket's edge
    × 0.65, up on a rotten nurse log × 0.4 (as hemlock and cedar come up among Olympic elk), and
    under a grown tree × 0.35 (`UNDER_CANOPY`: little to eat in deep shade).
  - What it does:
    - Recruit odds × (1 − 0.8b).
    - Growth: a "browse trap", `max(0, 1 − 1.8b)`, or `max(0.1, 1 − 1.2b)` for a resprouter.
    - Death: a seedling (under 0.1) dies at 0.02b a day, a sapling at 0.004b, half that for a
      resprouter.
- **Trampling** (`trampledSeedling`) is the old savanna rule made general. Woody plants under 0.3
  die at up to 0.004 a day, from total herd kg/ha against three times the intact biomass. It is
  × 0.6 for thorny plants and less under trees.
- **Elephants** (`elephantFelled`) push over young trees (0.1–0.7) at up to 0.003 a day, and strip
  grown ones at up to 2%/yr × palatability. A grown tree killed this way leaves deadwood.
- **Rubbing** (`rubSapling`): antlered males in the rut fray a sapling (0.08–0.5) beside them now
  and then, conifers first.
- **The 0011 sward rule** stays for grazers' non-selective nipping and treading. Invasive woody
  seedlings are no longer exempt; they're scaled by thorns and palatability.
- **Forbs**: where `w.grazed` > 0.3, a wildflower takes a grass's tile as if it were better suited
  (`grazedForbEdge`).
- **The Ecosystem Report** food-web page has one line: large herbivores in kg/ha, mostly grazers or
  browsers, against the wild range. The score is unchanged.

### Targets, and what changed

Cole's first targets (2026-11-01):
- PNW, year 200: no tree species above 50%, at least 6 species at 3% or more, fir at least 10 points
  higher without herbivores.
- Serengeti: mesquite at most 30% of trees with herbivores, and spreading without them.
- Atlanta: dogwood at most 12%.

After the first results, Cole changed two of them (same day):

- **PNW.** Fir's share hardly moves with herbivores, even at the tester's density. What moves is
  structure and the minor species. Most young trees of every species come up inside blackberry and
  rose, so they're sheltered alike, and fir puts out about six times the seed of any other tree. Real
  westside forests with elk and deer also stay fir-led; their documented browsing effect is on
  redcedar and the understory (Vourc'h et al. 2002; Stroh et al. 2008; Woodward et al. 1994). The
  target is now: at year 100 clearly more open land with herbivores (≤ 70% wooded vs ≥ 80% without),
  and a mix shifted by taste. Fir ≤ 50% is left to fire (workstream J) and long-term succession.
- **Serengeti.** The herds give mesquite thickets no use at all (no herbivore lists the INVASIVE
  habitat class), so herbivores can't hold mesquite back. That matches the field: Prosopis spreads
  under heavy grazing and is dispersed by livestock and wildlife (Mwangi & Swallow 2008). Mesquite
  control is left to fire (workstream J) and the player.

### Results

`node tools/herbivore-pressure.mjs <map> 200 <seed> [--exclosure] [--pull=mesquite]`, untended,
year 200 unless noted. Exclosure removes every large herbivore each day.

**PNW** (seeds 7, 11, 23; exclosure seed 7 from an earlier pass of the same exclosure code):

| | Exclosure | With elk and deer |
|---|---|---|
| Herbivores | 0 | 66–82 kg/ha (14–20 elk, 12–17 deer) |
| Wooded at year 50 | 48% | 16–17% |
| Wooded at year 100 | 82–85% | 59 / 71 / 69% |
| Wooded at year 200 | 85–90% | 69–76% |
| Fir at year 200 | 61–63% | 63–70% |
| Hemlock at year 200 | 18–21% | 11–23% |
| Redcedar at year 200 | 11–15% | 2–3% |

The revised target is met on 2 of 3 seeds (seed 11 is 71% wooded at year 100, against ≤ 70%), and
clearly by year 50 on all three. Cedar falls as real deer pressure does. Fir stays in the lead, a
few points higher than without herbivores, because browsing slows the shade-tolerant succession
under it. Before `UNDER_CANOPY` and the lower hemlock value, hemlock fell to 9–10% (fir 73–75%).
Most of the extra open land is blackberry and rose thicket rather than meadow: on an untended farm,
blackberry is left to the player.

**Atlanta** (seeds 11 and 23, plus 7 with herbivores):

| | Exclosure | With deer |
|---|---|---|
| Dogwood at year 200 | 26–30% | 5–8% (under 7% on seed 7) |
| Leading tree | dogwood | loblolly 19–24% |
| Wooded | 88–90% | 84–86% |

Target met. Deer leave the passed-over trees (loblolly, sweetgum, black cherry) in the lead, as in
heavily browsed eastern forests (Horsley et al. 2003).

**Serengeti** (seed 7): mesquite is 79% of trees at year 200 in the exclosure and 84–86% with
herbivores, and woody cover is 36% both ways. With mesquite pulled every year
(`--pull=mesquite`), woody cover is 13% without herbivores and 11% with them: the savanna crowding
and dry-season rules (0011, 0027) already hold native trees down. Herbivores shift the mix: more
desert date (thorny, elephant-dispersed) and less corkwood.

Seeded `balance-sim restore 15` (seeds 7, 11, 23; before → after, year 15):

| | Before | After |
|---|---|---|
| Score | 59.4 / 59.7 / 59.2 | 61.7 / 63.1 / 63.7 |
| Invasives | 27.9 / 29.5 / 30.5% | 22.1 / 25.7 / 23.5% |
| Meadow tiles | 1,443 / 1,302 / 1,167 | 2,035 / 1,830 / 1,284 |
| Forest tiles | 244 / 260 / 284 | 154 / 170 / 220 |
| Mature trees | 50 / 49 / 58 | 38 / 34 / 55 |
| Elk, deer | 16+16 / 17+15 / 16+18 | 16+19 / 16+15 / 9+18 |
| Beaver | 8 / 6 / 5 | 3 / 2 / 6 |
| ms/day | 14.7 / 15.4 / 16.3 | 14.9 / 13.5 / 13.6 |

Serengeti, untended, 15 years, same seeds: hartebeest 2/1/1 → 1/2/0, impala 12/24/27 → 19/29/25,
gazelle 19/22/16 → 12/21/14, cheetah 6/1/1 → 2/3/2, score 61/60/58 → 59/59/58. That is within seed
noise: pressure on plants doesn't make the hartebeest decline worse.

Cost: `node tools/daily-tick-ab.mjs`, a 40-year PNW restore world, 20 paired blocks, both load
orders: +9.6% ± 0.7% and +9.8% ± 1.3% per `dailyTick` (5.2 → 5.7 ms), about 0.5 ms per game day.
That's whole-map work once a day, which the performance review allows (at top speed about 0.07 ms
a frame on average). The field itself is about 0.1% of a profile; the rest is the plant checks for
every young woody plant. If it ever matters, `herbivoreIndex` can be precomputed per tile once a
day. `balance-sim` ms/day didn't rise (table above).

### Consequences

- Restoring the PNW farm: more meadow and fewer invasives early, but **planted saplings are browsed
  too**. Forest tiles at year 15 are about 30% fewer. Brush piles, fences and thickets shelter them,
  as tree guards do on real restoration sites. The score is flat to slightly up.
- Beaver have less to eat: elk and deer now crop the same willow and cottonwood saplings (as in
  Yellowstone).
- The Serengeti's numbers rest on herds 3–5× real. When workstream F brings stocking down, the
  same curve gives a weaker effect; recheck mesquite and native woody cover then.

### Gotchas

- Read pressure through `herbivoreKg` / `herbivoreIndex`, never `w.herbivory` arrays directly
  (cells, not tiles). Totals for reports come from `herbivoreTotals(w)`.
- A new large herbivore needs `kg` in its definition (`tools/herbivore-pressure-check.mjs` fails
  without it), and `BROWSE_SHARE` if its diet isn't the default for its forage order.
- A new map needs `herbivores: [low, high]` in `REFERENCE` (kg/ha, with a source), or the field is
  off there.
- Tree `browse` is both forage value (`w.browse` for young trees) and palatability. One number on
  purpose.
- `w.herbivory` is declared in the `World` constructor (0028's rule) and isn't saved.

### Checks

- `node tools/herbivore-pressure-check.mjs` (headless): data for every large herbivore and map; the
  field adds up to the animals and lands where they are; taste order; the browse trap; shelters;
  thorns; elephants; rut-only rubbing.
- `node tools/herbivore-pressure.mjs pnw,serengeti,atlanta 200 7,11,23 [--exclosure]` for the long
  runs.

### Sources

Volumes and pages are given where they were checked; the palatability values are read from these and
from regional deer-resistance ratings, not measured.

- Coe, Cumming & Phillipson 1976, Oecologia 22: 341–354 (African herbivore biomass and rainfall).
- Côté et al. 2004, Annu. Rev. Ecol. Evol. Syst. 35: 113–147 (deer overabundance).
- Cooper & Owen-Smith 1986, Oecologia (thorns and browsing).
- Crouch 1966, J. Wildl. Manage. (black-tailed deer and Douglas-fir seedlings).
- Fløjgaard et al. 2022, J. Appl. Ecol. 59: 18–24 (natural baseline for large-herbivore biomass).
- Horsley, Stout & deCalesta 2003, Ecol. Appl. 13: 98–118 (deer and forest composition).
- Houston, Schreiner & Moorhead 1987, Northwest Science (Roosevelt elk density, Olympic NP).
- McCabe & McCabe 1997, in The Science of Overabundance (historical white-tailed deer density).
- Milewski, Young & Madden 1991, Oecologia (thorns as defence).
- Mwangi & Swallow 2008, Conservation and Society (Prosopis juliflora in East Africa).
- Rossell et al. 2005, For. Ecol. Manage. (deer browsing in the southern Appalachians).
- Smith et al. 2003, Ecology 84: 3403 (body mass of late Quaternary mammals).
- Strole & Anderson 1992, Nat. Areas J. (white-tailed deer browse preferences).
- Stroh et al. 2008, For. Ecol. Manage. (deer and redcedar regeneration).
- Vourc'h et al. 2002, Oecologia (deer browsing on western redcedar).
- Woodward et al. 1994, Northwest Science (Olympic elk exclosures).
