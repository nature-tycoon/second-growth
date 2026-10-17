# 0009 Seasonal dormancy for selected residents

2026-10-17. Cole requested hibernation where appropriate.

## Decision

Keep species and map selection in `js/data/animal-dormancy.js`, attached through
existing behavior profiles. `js/sim/animal-dormancy.js` owns shelter selection,
travel requests, entry, interrupted sleep, brief winter arousals and emergence.
Reuse the current March-based calendar, weather/snow, pathfinder, terrain rules,
fire evacuation, age/hunger counters and wildlife persistence. The renderer only
hides sheltered residents; the population retains them and Locate still centers
their shelter. The inspector and wildlife diagnostics explain winter activity.

| Map / species | Strategy | Game season | Shelter proxy |
| --- | --- | --- | --- |
| PNW black bear | Winter denning | Dec–Feb | Covered dry ground, mature trees, logs, rock/brush piles |
| PNW common garter snake | Brumation | Nov–Feb | Covered dry ground |
| PNW western pond turtle | Brumation | Nov–Feb | Sheltered pond bottom or covered land within four tiles of water |
| Atlanta eastern chipmunk | Torpor | Nov–Feb | Covered dry ground representing a burrow |
| Atlanta big brown bat | Hibernation | Dec–Feb | Buildings, snags, old tree cavities or rock crevices |
| Atlanta eastern box turtle | Brumation | Nov–Feb | Covered dry ground representing soil/leaf litter |

These are explicitly selected cases, not an exhaustive classification of all
seasonally inactive wildlife. Preserve the PNW little brown bat's existing
migration to an off-site winter hibernaculum. No generic bear/bat/reptile rule is
applied to tropical maps. Summer nest/bat boxes alone do not qualify as winter
bat roosts.

Ground animals walk to reachable shelter; bats fly to it. Searches are bounded
(600 ground cells, radius 12 for bats), retried at most every five age days when
no shelter is found. Ordinary route recovery handles changed paths. Final den
waypoints target the shelter rather than diverting a thirsty animal to a bank.
Existing hunts, meals, predator escapes, social interactions and fire evacuation
take priority over entry. Unrelated bears and chipmunks reserve separate shelter sites. Dependent bear cubs use their mother's den. Once hidden,
occupants do not collide, hunt, scavenge, breed, flee surface predators or become
visible prey. They age normally and remain subject to natural/age mortality.

Sheltered food demand is 5% of normal, or 10% for chipmunks. Seasonal food-based
capacity drops do not force *validly sheltered* residents to leave or starve.
Capacity itself is unchanged. New natural settlement for these selected species
waits until their active season. Fire, shelter destruction, unsuitable flooding,
displacement or a mother's emergence wakes occupants, with a retry cooldown.
Spring always ends dormancy. On clear, snow-free intervals, periodic arousals
allow short activity bouts, most frequently for chipmunks. Winter state, site,
arousal age and retry age survive saves; shelter records are copied independently
for save/undo. Missing/invalid records and out-of-season sleep are repaired on the
next simulation step. Pause freezes timers.

## Biological basis and limits

- [NPS: bears in winter](https://www.nps.gov/articles/bears-winter.htm): denning
  varies with location and food. [Yellowstone bears](https://home.nps.gov/yell/learn/nature/bear.htm)
  describes reduced winter activity and occasional arousal.
- [NPS: big brown bat](https://home.nps.gov/shen/learn/nature/big-brown-bat.htm):
  resident southern populations, winter hibernation, cavities/crevices/buildings
  and occasional cold-season activity. [USFWS bat boxes](https://www.fws.gov/question-answer/how-and-whether-install-bat-boxes)
  distinguishes summer boxes from winter shelter.
- [Eastern chipmunk torpor study](https://pubmed.ncbi.nlm.nih.gov/19756651/):
  seasonal torpor interspersed with normothermy.
- [USFWS western pond turtle](https://www.fws.gov/story/2023-10/saving-rapidly-vanishing-turtle)
  describes brumation and winter movement/feeding. [WDFW priority habitat account](https://wdfw.wa.gov/sites/default/files/publications/00025/wdfw00025.pdf)
  includes both aquatic and terrestrial overwintering.
- [WDFW common garter snake](https://wdfw.wa.gov/species-habitats/species/thamnophis-sirtalis):
  western Washington activity season and warm winter surface activity.
- [NPS reptile account](https://home.nps.gov/york/learn/nature/reptiles.htm)
  describes eastern box turtles overwintering under litter, logs or in burrows.

Calendar windows, shelter tile categories, demand multipliers, distances and
arousal intervals are game-scale approximations. The simulation has no body
fat/cache, burrow/cave geometry, den insulation or air-temperature model. Clear
weather without substantial snow is a proxy for surface activity, not a thermal
measurement; not every clear winter day is actually warm. Dormancy does not add
winter births or change the existing breeding calendars. Ecological status is
simulation-owned and independent of render quality/offscreen culling.

## Verification

- `node tools/animal-dormancy-check.mjs`: 17 checks covering all 200 map/species
  entries, entry/travel/barriers, shelter types, demand/age/pause, spring exit,
  winter arousals, fire, damaged/flooded sites, predator priority, families,
  save compatibility, population pressure, arrivals, renderer/Locate and Spanish.
- `node tools/animal-dormancy-soak.mjs`: restored habitats on PNW and Atlanta,
  seeds 1987 and 91, 40 days from winter through spring, daily/monthly ecology and
  midwinter save/load. All six selected cases sleep, arouse and leave dormancy.
- Existing animal-life (13), avoidance (17), territory (13), Challenging ecology
  (26), positioning (26), Locate (4), diagnostics (20), map catalogs (12), data
  contracts (24) and salmon/bear (1) checks pass.
- Before/after `balance-sim.mjs restore 15`, with Math.random seeded using
  mulberry32(73621), complete restoration goals and retain predator/prey
  populations. Later food-web trajectories differ, as expected for an ecological
  behavior change. These runs are correctness/balance checks, not a controlled
  hardware performance claim.
