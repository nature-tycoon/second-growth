# 0015 Landscape of fear

2026-10-20. Phase 3 of [0013](0013-home-ranges-and-water.md), on top of [0014](0014-activity-budget.md).
Cole asked for the next phase ("keep going"). Places where prey have been hunted become less attractive.

## Decision

`js/sim/predation-risk.js` keeps a **risk memory for each prey species** (`wl.risk`: species →
sparse map of tile → value):

- A kill marks 1 at the spot. A fresh flight from one of the animal's own modeled hunters marks
  0.25. Both spread to tiles within 3 tiles. Fires and incidental alarms mark nothing.
- It fades 5% a day (about half in two weeks) and drops below 0.03.
- It is per species: a hawk taking voles does not frighten deer.
- It is **not saved**. It is a few weeks of memory, and a loaded game starts it afresh (`load`
  clears it).

Prey read it **only when choosing places**, through `safety = 1 / (1 + 1.5 × risk)`:

- **Settling a home:** the core score is multiplied by safety. A home whose center reaches risk >
  1.2 (repeated kills, not a single scare) is given up, after the settling cooldown, and the
  animal settles again.
- **Drinking:** the nearest bank still wins, unless its kind has been ambushed there. The search
  goes 4 steps past the nearest bank, scoring steps + 6 × risk. A cached spot whose risk passes 1 is
  re-chosen, at most every 10 days.
- **Deer/elk feeding and resting sites** (0010): scored by safety, and a site whose risk passes 1.2
  is given up, like grazed-out grass.
- **Local wandering** is weighted by safety.

It is never a wall: danger everywhere only lowers scores, and animals still settle, feed and drink.
No population, hunger, catch or habitat formulas change.

**Deliberately not done:** marking risk from where predators *are* (territories, patrols). Prey
crowding into "safe" pockets would recreate the clumping 0013 removed. Kills and chases are rare and
local, so the memory shapes particular places (an ambush bank, a home where kills keep happening)
rather than the overall distribution.

## Verification

- `node tools/predation-risk-check.mjs`, six checks:
  - Kills are remembered per species, fading about half in 14 days.
  - Settling avoids a fresh kill site.
  - Two kills make a resident move home; one scare does not.
  - An ambushed drinking spot is swapped for a safer bank nearby.
  - Danger everywhere still lets prey settle.
  - Hunts mark the prey's species, not the hunter's, and a load clears the memory.
- The full headless suite (`check-release.mjs --headless`) passes, as do `home-range-check` and `activity-check`.
- Community A/B against 0014 (PNW and Serengeti, seeds 7 and 91, 120 days, 10 of every species):
  the share of prey samples within 4 tiles of a kill from the last two weeks was 0–1% in both
  versions. These fixtures don't breed, and kills are sparse (30–60), so the effect is too local
  to measure at community scale. The targeted checks above are the evidence for the mechanism.
- `balance-sim restore 15`, before (0014) and after, with `Math.random` seeded to `mulberry32`
  73621, 1, 2 and 3. All eight runs complete all 15 goals. ms/day is within noise.
  - Means over years 8–16 for 73621 and 1: deer 10.2 → 14.1, coyotes 2.2 → 3.1, elk, hawks,
    bobcats and cougars about level.
  - Rabbits boom and bust in both versions: they fall to 0–1 for years in seeds 73621 and 1 after,
    and in seeds 2 and 3 before. The four-seed mean is 8.9 before and 6.9 after, inside run-to-run noise.
    Watch this if rabbits look scarce in play.

## Known limits

- Kills happen where prey are, so the memory partly mirrors prey density. Kept weak (single
  scares never move a home) so it cannot push prey out of their best cover in general.
- Risk is not shown to the player.
