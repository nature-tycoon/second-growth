# 0025 Shared steering: animals share space and face what they act on

2026-10-31. Cole's reports: herds fleeing a predator move awkwardly; wildebeest and zebra stand
too tightly; animals shouldn't run into each other unless they mean to (play, a hunt, a fight, a
panicking herd); since trunk avoidance (0023) rutting elk clash antlers with a rump and deer no longer
meet head on; elk antlers clip trees; a deer stuck inside a tree; elephants that seldom leave the
riverbank and drink with their backs to the creek; brush rabbits gathered under water in a marsh;
crocodiles that never go up a creek the player dug.

## Findings

Measured with `tools/animal-steering-check.mjs` (below) before changing anything. There was no
single steering layer: ground animals move by three paths (`smoothWalk` for walks, `stepToward` for
hunts, bouts, play and approaches, `fleeUpdate` for flight). Each turned and placed the animal its
own way, and spacing shoves came after all of them.

- **Fleeing skipped trunk avoidance** and jumped each step to the best of nine fixed headings,
  facing it at once: 2–17% of flee steps turned more than 35°. Herd mates ahead didn't count, so
  only the spacing shoves sorted out the bumping.
- **Bodies were dots.** The trunk keep-out was a circle the body's width round its centre, but a
  walker is about 2.6 times as long as it is wide. Turning on the spot (to drink, to face a
  rival, to look at a neighbour) swung a head, rump or rack into a trunk.
- **Bouts never started near trees.** A stance by a trunk was nudged off by `clearSpot` and
  `resolveStep`, so the rival never "arrived" (0.01 tiles). The bout never began, the timer never
  ran, and it stood stepping toward the spot with its rump to its rival: up to 1,148 stuck steps
  in a PNW run.
- **A squeeze never ended standing still.** `a.squeeze` (0023's pass through a cramped stand) runs
  down only as the animal walks, so a deer that stopped mid-squeeze stood inside the trunk for good.
- **Drinkers did face water.** They face the bank tile's edge, and once the check used the drawn
  waterline (a carved creek's water reaches up its bank tiles) there was water ahead of every
  drinker. A tile-grid check had suggested otherwise. What reads as "drinking with its back to the
  creek" is an elephant standing idle at the water's edge facing away, in the head-down grazing
  pose the drawing gives every idle grazer (`actors.js GRAZERS`): 50–63% of idle elephant time
  (120 days, 4 seeds). That follows from them spending so much time at the bank.
- **Land walkers could stop in water.** `passable` only kept them off ponds and rivers, so marsh and
  creek tiles were destinations, rest spots and drinking spots. Marsh sedges also counted as cover
  for fleeing small prey.
- **Elephants weren't stuck.** Over 2,000 steps there were no stalls and no squeezes. Their habitat
  rated riverside woodland above everything else, and both feeding and resting spots sat in it:
  63–81% of their time within two tiles of water.
- **Crocodiles rated a creek half a river.** A home's core was scored as a patch, which a one-tile
  channel can never fill. With a dug creek joined to the Serengeti river: 0 visits in 120 days.

## Decision

One order, for every ground animal, every step:

1. **Intent.** Behaviour code decides where to go, what to face and why (walk, hunt, flee, bout,
   drink, play).
2. **Steer and move.** Each movement path goes round neighbours (`spacing.steer`) and wood
   (`steerAround`), then `resolveStep` slides it off any wood. Fleeing now goes through `stepToward`
   like hunts and play, so all of them share the same trunk and terrain handling.
3. **Spacing shoves** (`AnimalSpacing.separate`), as before.
4. **Settle** (`sim/steering.js`, after spacing). Drinkers face their water. Anything standing,
   feeding or foraging has its body pushed back out of wood and its squeeze ended. A land walker
   stopped on water walks off to dry ground.

In detail:

- **Body shape** (`ground-obstacles.js`). Trunks are tested against a capsule from rump to chest
  along the animal's heading (`animalRadius / 0.65` long, half-width `animalRadius × 0.38` as
  before), plus a disc of `animalRadius × 0.3` at the head for an antlered male's rack. **Antler
  clearance belongs in the 0023 keep-out, but as part of the body's shape, not a wider round
  radius**, which would keep elk out of dense stands. The rack's keep-out is capped like a trunk's
  (`KEEP_MAX`), so the way between two trunks is unchanged. `clearSpot` leaves room for the body's
  length, short of that gap. `inWood` takes the heading.
- **Flight** turns toward its chosen line at `FLEE_TURN` (14 rad/day) rather than in one step,
  slowing while it swings round so it doesn't run on toward the danger. The choice of line holds
  the last one unless another is clearly better, and is marked down for herd mates in the way
  and for water. It then moves through `stepToward`.
- **Bouts.** `squareUp` chooses a stance where both bodies (with racks, facing each other) are clear
  of wood and of other animals. When the straight line between the rivals has none, the pair
  turns about its midpoint (±0.5, ±1, ±1.6 rad). With no stance anywhere, they only greet. A
  rival within 0.1 of its stance steps into it. Stepping in has 1.5 days for the walk over and
  0.6 for the last steps, then the bout is called off.
- **Drinking** (`aimDrink`). The head goes to the drawn water nearest where the animal actually
  stands (`nearestWater`, using `underWater`), square on to the bank unless water to one side is
  clearly nearer. It is re-aimed if neighbours shove it more than 0.1 along the bank (before, it
  kept facing the old point).
- **Idle grazers at the bank** (Cole: "elephants often get water with their back turned to the
  creek"). `actors.js` lowers every idle grazer's head now and then (`GRAZERS`, now in
  `steering.js`). With drawn water behind it, within its body length and about 30° of straight
  back, that reads as drinking backwards. `settle` sets `a.headUp` for such an animal and the
  drawing skips the head-down pose; it is looked at again only when the animal moves 0.05 or turns
  0.1 rad (`headUpKey`). Keeping the head up was chosen over turning it to face the water or moving
  it inland: it changes nothing in the simulation (where animals stand and face is the same, so
  every other count is unchanged), and a grazer standing head up near a creek looks natural.
- **Water** (Cole: wade across only). Small land animals (drawn kinds `DRY_FOOTED` in
  `animal-terrain.js`: rodents, rabbits, squirrels, agoutis and mouse-deer, armadillos, land
  turtles, beetles, pangolins, lizards) never enter marsh or creek tiles. Raccoons, coatis and civets
  forage in the shallows and are left out. Other land walkers (move `ground`) may wade across,
  but no route ends on water (`pathTo`, `roam`, `chooseTarget`), they drink from the bank
  (`shoreSpot`), flight scores water as worse than open ground, and `settle` walks off any that
  stop there anyway. Semi-aquatic animals, swimmers and fliers are unchanged.
- **Herd room** (Cole: about a body length). For `herd` species, grazing or resting herd mates
  keep their centres `HERD_ROOM` (0.85) of their two lengths apart, about a body length of ground
  between them. They pick standing spots with that room in mind (`herdRoom`, `restSpot`), and drift
  apart a little at a time when closer (`separate`). Drinkers at the bank and a calf by its mother
  are exempt. A walker nearly touching the one in front brakes (`steer`, down to 0.15 of its pace)
  instead of walking into it, so a file or a herd walking through a resting one stops bumping.
- **Exceptions by intent.** A hunter may reach its prey and rivals hold their stance (spacing
  already skipped those pairs). Play keeps its chase. Flight from a predator has a larger shove
  budget, and its own choice of line weighs herd mates rather than braking for them, so a
  panicking herd closes up but doesn't run into itself.
- **Habitat** (Cole: include). Crocodiles (Nile, American) rate creeks 0.9 of a river. An
  amphibious animal's home core (`settle` in `home-range.js`, move `semi`) counts the best water
  along each arm, so a channel can hold a home. Serengeti elephants rate bush 1 and grassland 0.9
  (were 0.8 and 0.6), and good habitat runs 11 tiles from water (was 8).

## Hook for the hunting rework

Hunting's pacing (approach, creep, rush, circling) stays in `huntStep`. It moves only through
`wl.stepToward(a, tx, ty, sp)`, which already steers round wood, keeps to standable ground and
faces its step. Spacing skips a hunter and its target, and `settle` doesn't move hunters. A
pursuit or stalk rework should keep calling `stepToward` (or `smoothWalk` for a curved approach)
rather than writing `a.x`/`a.y` itself, and give any new paired action (a pack's kill, a mother
and young) the same treatment as bouts: a validated spot, a tolerance and a timeout.

## Verification

`node tools/animal-steering-check.mjs [--report] [maps]` (fails on the limits below unless `--report`): restored landscapes on all seven maps.
Animals are spread over their habitat (herds of 14, `HERD=60` for a migration-sized herd), hunters
start hungry and it is the October rut. 12 simulated days at 0.02 a step. Per 1000 animal-steps,
seeds 1987 and 91 (range over maps):

| | before | after |
| --- | --- | --- |
| deep overlaps (centres closer than half their spacing radii) | 0–1.9 | 0–0.9 |
| deep overlaps, herd of 60 | 11.7 | 0.7 |
| overlaps among fleeing animals | 0–15 | 0–1.2 |
| overlaps among fleeing animals, herd of 60 | 12.8 | 2.2 |
| flee steps turning > 35° in one step | 5–173 | 0–12 (mostly rabbits and chipmunks darting) |
| walker bodies (capsule) inside a trunk | 0–31 | 0–0.9 |
| walker centres inside a trunk | 0–10.9 | 0–0.06 |
| antlered racks inside a trunk (per 1000 antlered-steps) | 0–305 | 0–3.5 |
| land walkers stopped on a water tile | 0–19.6 | 0 |
| small animals on a water tile at all | 0–6.1 | 0 |
| rival-steps stuck short of the stance (both there, half a day on) | 0–1,148 | 0 |
| settled rivals not facing within 30° (per 1000 bout-steps) | 0–3.6 | 0–0.8 |
| drinkers with no water within 30° of their heading | 0 | 0 |
| idle grazers head down with water behind them (per 1000 idle grazer-steps) | 0–137 | 0 |
| settled herd mates within a body length, herd of 60 (per 1000) | 11.9 | 4.4 |
| median gap to the nearest settled herd mate (body lengths) | 1.5–3.5 | 2.1–4.2 |

Land walkers wading across creeks and marshes on the way somewhere (allowed) stay about the same:
1–22 before, 1–18 after. Bouts still happen as often (88–3,784 settled bout-steps per run, against
116–4,254 before).

Elephants (Serengeti, 120 days, 4 seeds): within two tiles of water 63–81% of the time before,
5–43% after, and they still come back to drink. Idle at the water's edge with their backs to it:
50–63% of idle time before, 1–51% after. Idle grazers drawn head down with water behind them (`backGraze`, per 1000 idle grazer-steps): Serengeti 57 (seed 1987) and 52 (seed 91) before, 0 after, and 0 on every map for both seeds.
The probe costs about 0.01 ms a step on Serengeti (684 re-probes in 22,203 idle-grazer steps), within noise of `wildlife.update`.
Crocodiles (dug creek joined to the river, six crocodiles at its
mouth, 120 days): 0 steps in it before, 793 after, one settling its home there.

Balance, Hollis `restore 15`, 8 seeds (7, 11, 23, 5, 31, 41, 53, 67), means:

| | year 5 before / after | year 10 | year 15 |
| --- | --- | --- | --- |
| score | 59.5 / 58.1 | 63.2 / 63.5 | 58.8 / 59.6 |
| natural % | 28.2 / 27.9 | 45.6 / 45.2 | 53.9 / 53.6 |
| forest | 47 / 47 | 113 / 111 | 189 / 186 |
| meadow | 1843 / 1839 | 2002 / 2028 | 1119 / 1088 |
| brush rabbits | 7.1 / 1.6 | 5.8 / 4.1 | 3.9 / 11.4 |
| voles | 26.8 / 24.8 | 19.8 / 25.1 | 26.9 / 19.2 |

Everything but the small animals is within seed noise. Brush rabbits and voles can no longer cross
the creek, so rabbits take longer to colonise the farm, then end up commoner. Voles end a little
lower, with two seeds near 0. On four seeds, natural % at year 15 looked 3.7 points lower; on
eight it is 0.3. (0023's lesson again: use 8+ seeds before calling a shift real.) The Serengeti
campaign (`campaign-sim-serengeti`, unseeded) completes on day 531.

Cost: `wildlife.update` at a normal-speed frame (0.012 days), restored maps with the check's
populations, two seeds each: Serengeti 0.46–0.59 → 0.52–0.67 ms, Sumatra 0.28–0.29 → 0.32–0.34 ms,
PNW 0.33–0.34 → 0.36 ms. That is +10–17%, against the 3 ms simulation ceiling (2026-10-23 review).
`balance-sim` ms/day 13.0 → 13.2 (8 seeds). Flight now collects its neighbours once a step, and
`settleBody` skips animals that haven't moved or turned since it last ran.

Checks that pass: ground-obstacles, animal-positioning (the stand-still test now uses rhinos, and a
herd-room test was added), animal-clustering, animal-clustering-soak, animal-life (the flee-corner
test starts the deer already facing its line), animal-behavior, animal-turning, animal-course,
animal-trails, animal-territory, home-range, migration-crossing, activity, bird-behavior,
animal-dormancy, animal-density, moments, and map-catalog, which failed before this change
(0023's body width read `activeCatalog`, not the world's). `cervid-behavior-check` ("calf keeps up
on the overland trip") and `primate-stall-check` (orangutan hold) fail before and after.

## Gotchas

- `inWood` and the keep-out test the body along `a.hd ?? a.orientation`. A new behaviour that turns
  an animal (a `facePoint`) gets its body pushed out of wood by `settle` only if it is standing
  (`idle`, `feed`, `forage`). A new standing state must be added there.
- Rivals stand exactly on `sparAt` once within 0.1. The drawing (`actors.js bout`) and moments
  (`moments.js`) treat 0.02 and 0.05 as "in the stance", which the snap satisfies.
- `settle` runs `pathTo` for a land walker standing on water. That is cheap only because no
  selector chooses water any more. A new selector must exclude water tiles for move `ground`, or
  `settle` will keep walking animals off them.
- New per-animal fields `drinkFrom`, `fleeHd`, `sparSince` and `settleKey` are declared on `Animal`.
  `drinkFrom` and `sparSince` are saved with the drink and the bout. `fleeHd` and `settleKey` are not.
  `settleKey` (position and heading when last settled) lets `settleBody` skip animals that haven't
  moved or turned. `headUp` and `headUpKey` (back to the water, idle grazers) are not saved either;
  `headUpKey` is cleared whenever the animal isn't an idle non-drinking grazer, or one that stops
  drinking where it stood would keep its old answer.

## Racks, pivots and cornered flights (2026-11-02, itch.io release blockers)

`animal-steering-check` failed CI on Atlanta seed 1987 (6.67 racks in a trunk per 1000, limit 5),
and behind that assertion on two more: rival-steps stuck (2) and flee turns (18–20 per 1000, limit 15).

- **Walking into the stance.** A rival's route to its stance (`sparPath`) walked to each tile's
  middle, the stance's own tile too. A tree's trunk stands near its tile's middle, so the buck pressed
  on it until the squeeze rule let him through, rack and all. The last waypoint on the stance's tile
  is now `sparAt` itself, which `squareUp` found clear (`sparUpdate`).
- **Pivoting on the spot.** `walkPath` slid a walker out of wood only after a step. Turning without
  moving (a tight turn, a blocked arc) swung a stag's rack into a trunk and left it there. It now runs
  `resolveStep` after a pivot too (`animal-walking.js`).
- **Cornered flights.** When the line a fleeing animal could turn to this step was blocked, it snapped
  to the open way in one step (chipmunks against houses turned 100°+ at once). Now it turns on the
  spot at `FLEE_TURN` and runs once the line is open (`animal-life.js`).
- **The check.** Wood slides a rack out to exactly its keep-out edge, and rounding read that touch as
  inside: racks are counted only 0.003 tiles in. `sparStuck` counts a pair that hasn't got any nearer
  for half a day. A stance across its own tile is over half a day's walk at the sparring pace, and
  walking steadily in isn't stuck.

Racks inside a trunk per 1000, all maps, seeds 1987 / 91 / 7 / 3 / 42 / 100 / 2024 / 555 / 11 / 23:
at most 0.06 (base: up to 20.8 on Sumatra seed 42, 19.3 on PNW seed 555, 6.85 on PNW seed 11). Seed
1987 passes on every map. Other seeds still trip other limits, before and after: Amazon / Sumatra
flee turns (17–26), Serengeti seed 3 `backGraze` 3.37, PNW seed 11 `stand` 3.4, and Serengeti seed 11
`trunkCentre` 0.94, a hippo that squeezed past a bank tree and then drank standing in its trunk:
`clearSpot` leaves a squeezing animal's goal where it is. The check is only reliable at its default seed.
