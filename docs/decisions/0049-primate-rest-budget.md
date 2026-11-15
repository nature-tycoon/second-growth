# 0049 Primate rest budget, midday rest, leaf-out snaps

## Rules

- A primate rests its species' share of the daylight hours: the `restShare` trait (`js/data/animal-kinds.js`; kind defaults monkey 0.4, orangutan 0.25; each primate overrides it in its map's data file with a figure from the field studies below). `primateRest` in `sim/primate-behavior.js` decides; never add a name check.
- Rest is a balance, not a dice roll: owed rest = target share × time since the last decision, less the time sitting idle (`a.stillT`, counted in `animals.js`'s idle step for animals with `a.restAt`). The share then holds however long the walks run. Bouts are 4–9 days.
- It is asked only in `chooseTarget`, after fruit and leaf meals (so meals keep their chances) and only between walks: never mid-route, never on the ground under a tree, never on a tile without a tree for a tree mover. At night it comes before meals (`asleep`): primates sleep.
- The simulation has no clock. The time of day is the drawn sun's: the renderer writes `game.todU` each frame (`scene.js`; null with the day cycle off). Headless it is unset and the share is flat, so balance and calibrate runs are unaffected by the sky. `restTarget`: a cosine over the daylight (0 dawn, 0.42 noon, 0.86 sunset), share × (1 ± 0.6), capped at 0.95; 1 at night.
- Saved fields `restBal`, `restAt`, `restUntil`, `stillT` (on `Animal`); undefined reads as a fresh start.
- Leaf-out: a deciduous crown is drawn on another scaffold in its leafless phase (`flora.js`: `bareTree` vs `treeParts`), so `rebaseCanopy` can't carry a hold across. `regripCanopy` (canopy-motion.js) keeps the body where it is and takes the nearest hold on the new wood (within 0.45 tile; else the old reset). Don't remove it: without it every monkey in a dry forest jumps up to 3.6 tiles at each season change.
- The orangutan's stuck-route recovery starts 0.75 tiles from the simulation, not 1.8 (actors-climb.js): a resting sim gives a wedged body no new target to free it.
- Measure: `tools/activity-budget.mjs` (a `rest` column; `TOD=0.42` pins the sun), `tools/monkey-movement-measure.mjs`. Checks: `primate-stall-check`, `canopy-links-check`, `monkey-pace-check`, `motion-sweep-check amazon chinandega sumatra`, `perf-guard-check`.

## History

2026-11-13 (wildlife-polish batch, Cole's "primate rest budget"). The brief: capuchins were on the move about 90% of the time and howlers about half; real howlers rest about two-thirds of the day and primates rest through the midday heat.

### Figures used

Share of daylight spent resting, from published activity budgets:

| Species (game key) | restShare | Source |
|---|---|---|
| Mantled howler, *Alouatta palliata* (`congo`) | 0.65 | ~66.8% resting, *A. p. aequatorialis*, La Libertad, Ecuador (USFQ thesis, 2016–17); Milton's Barro Colorado work is the classic ~65% (not checked at source) |
| Red-handed howler, *A. belzebul* (`howler`) | 0.55 | 48.7–53.6% at two eastern Amazon sites (Pinto et al. 2003, *Animal Biodiversity and Conservation*); 58.7% (Pinto 2002, via a comparative table) |
| White-cheeked spider monkey, *Ateles marginatus* (`spider`) | 0.40 | No figure for the species; *Ateles* 35–46%: *A. chamek* 41.9% (Peru), 45.5% (Bolivia); *A. geoffroyi* 36.6% over 18 communities |
| White-faced capuchin, *Cebus imitator* (`capuchin`) | 0.20 | Estimate. No clean Santa Rosa figure found; capuchins are among the most active monkeys, foraging on the move; resting peaks 10:00–15:00 and rises with heat in the dry season (Santa Rosa thermoregulation study, *AJPA* 2009; a 1982 Costa Rica dry-forest study) |
| Siamang (`siamang`) | 0.38 | 33.8–36.8% (Lappan 2005, Sumatra); 44% (Palombit 1997, Sumatra); rest rises through the day to an afternoon peak (Chivers 1974) |
| Thomas's langur, *Presbytis thomasi* (`langur`) | 0.45 | No figure for the species; *Presbytis* 35–50%: *P. femoralis* 43%, *P. chrysomelas* 35.4% |
| Sumatran orangutan, *Pongo abelii* (`orangutan`) | 0.25 | Wide range: 11–18% (Batang Toru, Khakim et al. 2016), 48% (Soraya, Mahyana et al. 2023), 38% (semi-wild, Jambi 2018). Sumatran orangutans rest less than Bornean |
| Southern pig-tailed macaque, *Macaca nemestrina* (`macaque`) | 0.20 | No figure for the species; wild macaques 10–30%, long-tailed macaque 19.1% (Sabah) |

There is no colobus in the game; the brief's "colobus" is the mantled howler (`congo`, Chinandega).

### Before and after

Patchy-stand fixture (`monkey-movement-measure`'s forest, 8 animals, 120 s, simulation only, animals leaving the map excluded, no sun): share of frames moving, base → rest budget.
howler 52 → 23%, spider 57 → 47%, capuchin 92 → 87%, congo 78 → 44%, langur 67 → 49%, siamang 71 → 62%, orangutan 57 → 52%.
Capuchins move little less because each wander is one ~11-tile climb (hr 80) of about 50 s; their 20% is met over a longer horizon, and about 80% active is right for them.

By time of day (same fixture, `game.todU` pinned), moving at early morning / noon / night: congo 68 / 20 / 1%, langur 64 / 35 / 5%, capuchin 90 / 83 / 0%. No meals at night (before the `asleep` check, a congo troop took 36 meals in a night).

Feeding, meals per 8 animals in 120 s: howler 18 → 16, spider 7 → 10, congo 17 → 24, langur 24 → 29 (capuchin, siamang, orangutan 0 in both: the fixture's trees bore no fruit). On the restored maps (`activity-budget`, seed 7) eating shares moved by at most ±5 points. Primate hunger feeds no population rule (only predators starve), so this is how often they are seen eating.

Restored maps, sitting (rest + other idle) before → after: howler 47 → 52%, congo 54 → 66%, spider 71 → 76%, capuchin 70 → 72%, orangutan 58 → 63%, siamang 54 → 58%, langur 59 → 62%, macaque 39 → 44%. There most primates already sat more than their share, so the balance only tops up those short of it.

Seeded `calibrate` (15 years, seeds 7, 11, 23), base → after: Amazon 42 → 42, Chinandega 51 → 50 (old growth .47 → .59, the only sign that moved), Sumatra 45 → 44; the same out-of-range flags in both.

### Forward snaps

The earlier finding (capuchins and congos snap forward 5–7 times per 8 monkeys per 40 s in a patchy stand) was not about walking. Every snap fell on one frame, a month change: Chinandega's rainy season begins in month 2, the guanacastes leaf out, and the leafless scaffold (`bareTree`) is replaced by the leafy one (`treeParts`), whose branches lie elsewhere. `rebaseCanopy` refused (different branch counts), the route was declared invalid, and `canopyStep` reset each trailing body onto the simulation's spot, 0.7–3.6 tiles ahead. Resting couldn't cut these. `regripCanopy` fixes it: capuchin 6 → 0, congo 6 → 0 per 40 s; all other species stay 0. It happens at every leaf-out and leaf-drop in the real game, on any deciduous tree that carries a climber.

### Uncertain

- The orangutan's existing wedging (blocked routes 17–27% in the fixture before this change) moves around with resting: across three stands blocked rose 0–8 points and stuck went −5 to +4. `primate-stall-check` failed at first (median 22.4 days at one hold, limit 18) because a resting simulation never hands a wedged body a new target; the earlier recovery (0.75 tiles) brings it to 5.7. The crown-gap fix planned for the next batch is the real cure.
- The capuchin and pig-tailed macaque figures are estimates from related species and general ranges.
- The midday peak is checked headless with a pinned sun, not watched in the browser.
