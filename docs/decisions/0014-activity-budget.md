# 0014 Hunters' activity budget, hunts that can land, lasting trails

2026-10-20. Phase 2 of [0013](0013-home-ranges-and-water.md). Cole asked for needs that compete
for time instead of overriding each other, and approved the design with "make the decisions you
think are best and most realistic while allowing for the most entertaining gameplay".

## Findings

Measured with `tools/activity-budget.mjs` and scratch probes on `claude/home-ranges` (the same on
main). A sim-day is one dt unit, about 1.4 s at normal speed.

- **Big predators were in hunts that failed, not in too many hunts.** 76–95% of samples had gone
  12 days or more since a meal. Catches per hunt: leopard 0/33, hyena 1/94, lion 3/59, cougar 0/6.
  Two rules from 0006 caused it. Prey bolted from any active hunt within 6 tiles, and hunts start
  7–9 tiles out, so the stalk never closed. Fleeing prey also ran at 1.9× their speed at once,
  which matches or beats a hunter's sprint (lion 3.36 vs wildebeest 3.04 tiles/day; hyena 2.94).
- **Hawks never soared.** Soaring needed hunger below 3, but a hawk ate for 4–8 + length/4 days,
  so the fed window had passed before it finished eating.
- **Trails were faint for arithmetic reasons.** Deer walk about 1 tile a day, so a 12-tile feed↔rest
  leg takes 12 days. Each route edge got about 0.044 crossings a day, which settles at about 0.08
  under the 1.5%/day fade, just under the 0.09 visibility threshold. Making trips more frequent
  would need animals to walk more than all of their time.

## Decision

- **Activity budget for hunters** (`js/data/animal-activity.js`, exposed as `behavior.activity`;
  `prowl()` in `sim/animal-life.js` is the decision). Each hunter has `hungry` (days after a meal before
  it hunts), `digest` (days it always lies up after a meal), `rest` with a `bout` (the chance a fed
  hunter lies up, and for how long), and `soar` (the chance a fed soaring raptor circles). Thirst
  that has built up further, relative to its own interval, than hunger has goes first. A hungry
  hunter starts a hunt on prey within 8 tiles (`seek`), else goes looking. The daily 40% roll stays
  as a backstop at `hungry`. Territory patrols, dormancy and bird routines use the same threshold
  (`huntHunger`).

  | Guild | hungry | rest while fed | bout |
  |---|---|---|---|
  | Big cats (lion, tiger, leopard, jaguar, cougar, clouded leopard) | 8 | 80% | 1.5–3 |
  | Cheetah | 6 | 60% | 1–2.5 |
  | Bobcat, ocelot, leopard cat, coyote, fox, hyena | 7 | 55% | 1–2.5 |
  | Raptors and owls (red-tails soar 70% of fed decisions) | 7 | 40% | 1–2 |
  | Others (ambushers, waders, otters, fish) | the old prowl rule, unchanged | | |

  Meals last long enough that kills per hunter stay near what the population balance assumed.
  With 4-day values, voles crashed to 0–1 for years in three of four restore runs.
- **Hunger counts from the end of a meal**, so a long meal no longer uses up the fed window.
- **Hawks hunt from the soar.** A hungry soaring hawk scans the ground every 0.3 day and stoops
  on prey within 7 tiles. It moves on within 4–7 days if nothing shows. Plucking now takes 2–4 + length/8
  days, which is 3–6 s on screen instead of 6–11 s. Owls are unchanged.
- **Hunts that can land** (amends 0006):
  - A hunter that is approaching or creeping is in view but not yet attacking. Prey bolt from it
    within 3 tiles, or once the rush or a raptor's circling starts. Further out, prey stop and
    watch it or move off (the existing non-urgent `watch`).
  - A fleeing animal gets up to its escape pace over half a day, starting from a walk. After 1.5
    days it tires toward 1.3× walking speed. An ambush rush can close on it early, and dogs and
    hyenas can run it down at the end of a long chase.
  - Prey that a stalker crept in on unseen react 0.2–0.45 day after the rush starts, instead of
    0.12–0.3.
  - A stalk the prey has been drawing away from for 1.2 days is given up.
- **Trails** (amends 0010). Edges and density fade 0.5% a day (`TRAIL_FADE`, about half in 140 days)
  instead of 1.5%. `trod` keeps its own ecological decay. Feed↔rest dwell is 3–5 days (it was 5–9).

## Persistence

New field `fleeAge` (time spent fleeing), plus `hunt.best`, `hunt.since`, `hunt.surprise` and
`bird.hunting`/`bird.scan`. All of these are transient and are saved with the existing fields.
Older saves default them to undefined, which reads as 0 or false. No migration is needed.

## Verification

- `node tools/activity-check.mjs`, six checks:
  - a fed lion lies up, and a hungry one hunts prey 4 tiles away;
  - hawks soar at least 20% in a PNW community;
  - hunger resets at the end of a meal;
  - prey watches a creeping hunter and bolts at the rush;
  - flight speeds up, then tires;
  - the trail fade half-life.
- `prey-avoidance-check`, `bird-behavior-check` and `animal-trails-check` were updated where they
  asserted the old rules. The full headless suite passes (`check-release.mjs --headless`, 80 scripts),
  as does `home-range-check`.
- Activity budget, seed 7:
  - Hawks soar 38–49%, from 0%.
  - Lion catches per hunt went from 3/59 to 14/46, about 30%; real lions are about 25%. Leopard
    0/33 → 5/21; hyena 1/94 → 8/78; coyote 8/28 → 12/40.
  - Between hunts (fed, not hunting or eating), big cats rest 51–83% of the time (lion 83%, from
    49%), and owls 89%.
  - Lions eat 0.10 meals per animal-day, from 0.01.
- Trails: visible edges (trailE/trailS above `TRAIL_THRESHOLD`) on PNW after 150 days went from
  24 to 111 (seed 7) and from 14 to 100 (seed 91). On the Serengeti, 187 → 402.
- `balance-sim restore 15`, before (`claude/home-ranges`) and after, with `Math.random` seeded to
  `mulberry32` 73621, 1, 2 and 3. All eight runs complete every goal.
  - Means over years 8–16: voles 26.4 → 24.6, rabbits 8.0 → 9.1, elk 15.4 → 13.9, hawks 2.0 → 2.3,
    owls 2.8 → 2.4, coyotes 2.8 → 2.6.
  - Deer 15.1 → 10.2: the cougar now catches deer.
  - Red-legged frogs 19 → 10 and newts 21.7 → 19.7 move without any predator of theirs changing,
    which shows the noise between runs.
- ms/day is within run-to-run noise (the runs shared the machine).

## Known limits

- The activity-budget community stocks up to 10 of every predator, so on the Serengeti they are
  food-limited and still hunt or eat about 40–60% of the time. That is an honest response to
  hunger. The rest-between-hunts figures above are the better measure of the budget itself.
- Herbivores keep their decision order; only their dwell changed. Water is unchanged: deer still
  drink rarely, because travel takes days of sim time.
- Pride and pack members that assist at a kill feed only if a carcass meal is left (0008).
