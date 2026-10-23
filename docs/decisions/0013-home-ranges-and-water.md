# 0013 Home ranges and water trips

2026-10-20. Cole saw PNW brush rabbits clumped against one stretch of river with plenty of
other riverside free, and asked for an architectural fix. He also asked that movement come
from natural causes (food, territory, predators, each animal's own nearest water) rather than
from rules written to spread animals out.

## Findings

Drinking was the only movement rule with no bound. Every 5–9 sim-days a thirst timer sent an
animal on a breadth-first search of up to 5,000 tiles to the nearest free bank, wherever it stood.
Animals walk 1–2 tiles a sim-day (a sim-day is about 1.4 s at normal speed), so a trip often took
longer than the timer: animals commuted to water without end. Every animal in a patch got the same
nearest bank, so they lined up along one stretch. Every species got the same rule, and thirst
has no survival effect: it only drove movement.

Measured on restored maps (`tools/activity-budget.mjs`, seeds 7 and 91):

- PNW brush rabbits spent 60–69% of their time walking to water or drinking; 45% of samples were
  on bank tiles, which make up 2.8% of their habitat. Nearest-neighbour ratio against their
  habitat was 0.55–0.61. With drinking turned off it was 0.93–0.96, so water was the whole cause.
- Most land mammals on all seven maps spent 40–85% of their time on water (bear 65–74%,
  cougar up to 92%).

The PNW farm's water is roughly in proportion: a tile is about 8 m, there are about 2.5 km of
channel per km², and the median distance to water is about 120 m. What was out of proportion was
how far animals went: a brush rabbit's real home is 3–5 tiles across, and it would never walk to
a river 120 m away.

The same pattern (a need on a timer shorter than what it sets off, winning a fixed priority list)
also crowds out other behaviour: hawks hunt about 45% of the time and soar 0% of it. That is Phase 2,
below, and is not changed here.

## Decision

Resident land mammals hold a **home range** (`a.home`, owned by `js/sim/home-range.js`):

- **Who holds one:** land mammals that walk to water (`homeEligible`). Migrants (`crossing`),
  river patrollers and reef animals are excluded. A herd's or family's leader holds the home for
  the group; the young stay with their mother.
- **Settling:** a bounded search (2,500 tiles) scores candidate centers by habitat across
  the core, divided by overlap with the homes its own kind already hold, with a mild preference
  for nearby places. Animals released together spread out because homes are scored against other
  homes, not because of a rule that pushes animals apart. A deer/elk feed-and-rest range (0010) or
  a defended territory (0007) is that animal's home. Radius: `clamp(2 + √hr × 0.7, 4, 16)` tiles.
- **Water:** the home's drinking place is the nearest bank reachable from the home's
  center, within `clamp(√hr × 2, 6, 40) × water.reach` tiles. A rabbit reaches about 7 tiles, a
  deer 13, an elk 22, and a bear or cougar 40. Grazers that need water most days (wildebeest,
  zebra, buffalo, elephants, cattle) get ×1.5. With no water in reach the animal makes no water
  trips and gets by on food and dew (brush rabbits and cottontails take most of their water from
  green plants). It still sips when its wandering passes water. If none is in reach, it checks
  again every 20 days, in case the player has dug a pond.
- **Interval:** `drinkEvery` makes the round trip plus the drink fit within the species'
  `water.share` of time (8%, or 15% for water-dependent grazers). Far water means rarer trips.
  Flying birds use the drink alone (a flight is quick).
- **Route:** the route to water is learned once, from the home's center (with the trail
  preference of 0010), then joined and reused in both directions. A drink sends the animal home
  along the same route. Repeated trips are what wear game trails.
- **Staying home:** local wandering falls off outside the home; an animal far from home (after
  a hunt, a scare or a chase) walks back. Residents roam to a new place at 15% of the old rate and
  drop their home when they do, settling a new one where they arrive. Habitat loss, fire or a cut-off
  route also release a home.
- **The rut:** a bull's harem decides where he and his cows go. His home has no pull in the rut,
  and a cow in a harem drinks where her bull does. A harem bull now takes on rivals only near his
  cows. Before, harem cohesion came mostly from the whole harem trekking 50 tiles to water about
  45% of the rut.

Population, food, breeding, carrying-capacity and predation formulas are unchanged. `followRoute`
was extracted from `rangeChoose` in `animal-trails.js` so water trips and resource trips share it.

## Persistence

`home` (with its `waterRoute` array) and `homeAfter` use the existing animal save/undo fields and
are copied on serialization and load. Older saves have no homes and settle one on a later
decision; no migration is needed.

## Verification

- `node tools/home-range-check.mjs`, six checks:
  - PNW rabbits stay off the bank (bank share below twice the habitat's share plus 3%) and
    spread like their habitat (ratio > 0.85), on two seeds.
  - Animals released together settle separate homes.
  - Each home's water is a bank within reach, or there are no water trips at all.
  - A resident reuses its route to water.
  - Water time stays at or below 20% (30% for water-dependent grazers) for every resident species on six maps.
  - Saves are independent, and legacy animals settle homes.
- After the change: rabbits' ratio is 1.04–1.17, with no water clumping. Water time for land mammals is 1–25%;
  the Serengeti's water-dependent herds are highest.
- The full headless suite passes (`check-release.mjs --headless`), as do the clustering and territory
  soaks (seven maps, two seeds). `animal-positioning-check` now makes its secretary bird thirsty
  relative to its longer interval.
- `balance-sim restore 15`, before and after, seeded `mulberry32(73621)`: both complete every
  restoration goal, and predator and prey populations persist. Trajectories differ. ms/day was 14.3
  before and 13.7 after.

## Known limits and next phases

- **Trails got fainter, not stronger.** After 150 days on PNW there were 40–60% fewer
  visible trail edges than before, because the endless water commuting had been making most
  of the wear. Trails now come from purposeful repeated routes, but those trips are too
  infrequent to beat the 1.5%/day fade. Phase 2 (a daily routine with more frequent feed, rest
  and water cycles) or a retune of trail wear and decay is needed to make them obvious.
- **Phase 2** (done in [0014](0014-activity-budget.md)): needs should compete for time instead of overriding each other, with minimum
  bout lengths and species activities like soaring and patrolling. This would fix hawks never
  soaring and large predators hunting or eating 50–72% of the time.
- **Phase 3 (optional):** predator pressure lowers how attractive a site is.
- Home radii are game-scale. Large mammals' real ranges exceed the farm; their reach is capped.
