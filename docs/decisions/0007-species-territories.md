# 0007 Species-specific territorial cores

2026-10-17. Cole requested territorial behavior where ecologically appropriate.

## Ecological scope

Territory is a defended part of a home range, rather than a rule that every solitary
animal excludes every neighbor. Profiles are explicit; species without evidence
for these particular rules keep their existing behavior.

| Species | Implemented scope | Primary reference |
| --- | --- | --- |
| Bobcat | Stable home core; adult same-sex rivals keep separate cores; opposite-sex overlap permitted | [NPS, Oregon Caves](https://www.nps.gov/orca/learn/nature/bobcat.htm) |
| Cougar | Home affinity/patrol for adults; male-male core defense | [NPS, Oregon Caves](https://www.nps.gov/orca/learn/nature/cougar.htm) |
| Ocelot | Home affinity/patrol; male-male defense with opposite-sex overlap | [San Diego Zoo](https://animals.sandiegozoo.org/animals/ocelot) |
| Jaguar | Home affinity/patrol and marking-style pauses; conservative male-male core defense | [Zoo New England](https://migration.zoonewengland.org/stone-zoo/animals/mammals/big-cat/jaguar/) |
| Leopard | Home affinity/patrol and marking-style pauses; male-male core defense | [San Diego Zoo](https://animals.sandiegozoo.org/animals/leopard) |
| Sumatran tiger | Stable home cores and same-sex defense, permitting male/female overlap | [Smithsonian](https://www.nationalzoo.si.edu/animals/tiger), [San Diego Zoo](https://animals.sandiegozoo.org/animals/tiger) |
| American robin | Adult same-sex breeding territory; opposite-sex overlap; released outside the map's breeding months | [Cornell Lab](https://www.allaboutbirds.org/news/is-it-unusual-to-see-american-robins-in-the-middle-of-winter/) |
| Northern cardinal | Same-sex breeding defense; pair overlap and nonbreeding flock behavior retained | [Cornell Lab](https://www.allaboutbirds.org/guide/Northern_Cardinal/), [life history](https://www.allaboutbirds.org/guide/Northern_cardinal/lifehistory) |
| Orange clownfish | Shared anemone-group home; fish affiliated with other hosts are outsiders; new arrivals favor less occupied hosts | [Chausson et al., 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6225843/) |

These nine species occur in ten regional roster entries across all seven maps
(ocelot occurs in Amazon and Chinandega). Profile selection is evidence-based;
numerical radii, cooldowns and nonlethal encounter outcomes are compact game
abstractions, not estimates of hectares or complete species ethograms. Female
home affinity is not claimed to be exclusive defense in the male-only profiles.
Clownfish sex change, size rank, breeding monopolies and eviction are not modeled;
existing host-group members are tolerated, including young.

## Architecture and behavior

- `animal-territories.js` owns explicit species profiles, adult/season eligibility
  and rival rules. `behaviorFor` exposes the selected profile in the catalog.
- `animal-territory.js` owns claims, core return, patrol goals and boundary responses.
  It uses ordinary pathfinding/flight intents, shared passability/landing policy,
  per-species suitability, existing facing and alert poses. No new movement state
  or renderer position correction is introduced.
- `chooseTarget` runs territorial choices after danger, family care, hunting,
  scavenging, drinking and feeding. Established residents skip optional independent
  long-range roaming and eventually return from local excursions. Hunger and active
  hunts may take animals beyond their home; a territory is not a prison.
- Adults establish suitable, non-burning home tiles. Same-sex rivals in the selected
  profiles avoid already defended cores. Male/female ranges may overlap. No space
  means a retry after five simulation days, not a new population cap or eviction.
- Clownfish claim actual living anemones, share host-group membership, select less
  occupied hosts when settling and search for another host after its loss. Routes
  still need reachable sea. There is no individual exclusion radius inside a group.
- Owners near an intruder pause, face it and display; a rival walks/flies toward its
  own home or a reachable position outside the core. No damage or territorial kills.
  Residence and distance-to-home resolve overlapping claims; cooldowns and movement
  priority prevent reciprocal chasing. Blocked searches leave positions unchanged.
- Occasional boundary patrols end in existing alert/marking-style pauses. No visible
  urine decals, new recordings or persistent scent field is implied by these poses.
- Predator/fire escapes and hunts cancel interrupted patrol goals while retaining
  the home. Removing habitat, blocking the return route, losing an anemone or ending
  a bird's breeding season permits release/re-establishment. Departing animals no
  longer reserve space; dependent young do not claim or defend cores.

Claims use bounded local searches (500/600/900 visited-tile limits or fixed nearby
flight/host samples), at animal decisions rather than per-frame world scans.
Seasonal calendars reuse the existing per-map breeding arrays. Food, breeding,
carrying capacity and predation formulas are unchanged; movement can alter later
population trajectories. Group territories for lions/coyotes and unsupported
species were deliberately left for their own researched social models.

## Persistence and invariants

`territory` and `territoryAfter` use the existing animal save/undo mechanism. The
nested claim record is copied on serialization and load so snapshots do not share
mutable claim state with live animals. Older saves establish missing claims on a
later decision; they need no format migration. A stale claim is checked against
current suitability/terrain/season when used. Paths obey barriers and cannot
teleport; no territory action manufactures animals, food or hunger relief.

## Verification

- `node tools/animal-territory-check.mjs`: 13 seeded regressions for explicit
  regional profiles, stable/separated cores, sex/family exceptions, seasonal
  release, encounters and cooldowns, blocked retreats, patrol pauses, home return,
  habitat loss, shared/replaced hosts, survival priority, save independence/legacy
  loading, pause and suppression of friendly greetings between active rivals.
- `node tools/animal-territory-soak.mjs`: each selected species establishes a home
  and produces territorial pauses through ordinary decisions on real restored
  maps; seven maps, seeds 1987 and 91, 40 simulation days each, plus save/load.
- Existing map catalog (12), cervid (28), prey avoidance (17), animal life (11),
  positioning (26), bird behavior (17), wildlife behavior (15) and Challenging
  ecology (26, including all 139 predator/prey contact relationships) checks pass.
- The existing all-species clustering movement soak passes on seven restored maps
  and two seeds for 20 simulation days each.
- Required `balance-sim.mjs restore 15` completed before/after with `Math.random`
  seeded to `mulberry32(73621)` via a scratch loader. Both complete restoration
  goals and retain functioning predator/prey populations; changed trajectories
  mean timings/populations are not an output-preserving performance comparison.

Validation is headless simulation and existing pose reuse; no exhaustive visual
review or species-by-species field calibration is claimed.
