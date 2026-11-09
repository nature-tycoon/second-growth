# 0026 Continuous hunts: stalk, freeze, charge, pursue

2026-10-31. Cole: "Make the hunting more accurate, currently it just runs after the prey, stops,
runs after it again, stops. I'd like it to be a more fluid and continuous hunt, also increase the
stalking phase. Make sure that predation remains balanced." Built on 0025 (shared steering): hunts
still move only through `wl.stepToward`.

Cole's answers to the design questions: keep each species' kills per year the same rather than
retune balance toward real success rates; after a failed hunt the hunter rests and then picks
another animal; stalking cats use cover (grass, brush) in place of approaching from downwind, since
the game has no wind.

## Findings

Measured with `tools/hunt-check.mjs` (below) on the code before this change: every map with hunters,
hungry hunters, 150 days, three seeds.

- **A single hunt almost never stalled.** Under 2 steps in 100 of a chase moved at less than 15% of
  the hunter's pace. The stop-and-go Cole saw happened *between* hunts.
- **A missed grab ended the hunt.** The catch is rolled on contact (45%). On a miss the hunter
  stood for 1.5 days (about 2 s on screen), then started a new hunt, usually on the same animal:
  52–100% of failed hunts, per species, were followed by another hunt on the same prey within 4
  days, typically 1.5 days later, and often straight into a sprint (cheetah 54%, tiger 60%, raptors 100%).
- **A rush ran on a fixed timer**, then the hunter stood 1.5–3 days and tried again. Hyenas
  (sprint 2.94 tiles a day) chase wildebeest that flee at 3.04, so the gap held at about 2.7 tiles
  until the timer ran out: 65% of hyena hunts ended that way.
- **The stalk was slower than a walking animal.** Cats crept at 0.6 of their pace, so prey
  wandering off at a walk drew away (a lion's gap grew from 4.8 to 7 tiles mid-stalk) until the
  hunt timed out.
- **Speed jumped.** Creep 0.6 to sprint 2.4–3.4 in one step, and sprint to standing in one step.
- **Hunts on prey across water.** Jaguars started hunts on capybara across a river and dropped
  them the next step (80% of jaguar hunts lasted one step), then stood a day and tried again.
- Hunters spend most of their time walking to prey and idle (lions 37% and 29%); kills per hunter
  are low (2–5 per hunter-year in the 12-year soak), so hunting efficiency sets how well predators eat.

## Decision

One hunt, start to end, for every hunter on every map (`huntStep` in `sim/animal-life.js`). The
phases are as before (approach, creep, rush, a raptor's circle), plus `ease`, slowing to a stop.

- **Momentum.** A ground hunter keeps its own speed (`hunt.v`, a multiple of its pace) and heading
  (`hunt.hd`). Speed moves toward what the phase wants no faster than the style's `accel` (twice
  that when slowing), and the heading swings no faster than `turn`, easing off in a tight turn. It
  steps along that heading through `stepToward`. At arm's length it closes on the prey itself.
- **Leading.** A chase aims where the prey will be when it gets there (its smoothed velocity times
  the time to reach it, at most half a day ahead).
- **Stalk.** The creep keeps pace with prey wandering off instead of falling behind. The hunter
  **freezes** while the prey looks up (`alertT`, an alert stare from 0006) and the freeze doesn't
  count against the stalk. Every quarter day it checks the way ahead and a little to either side
  and creeps toward the thicker grass or brush (`stalkCover`, reusing `preyCover`). Cover and
  freezing hide it (`hunt.hide`): prey notice it only within `6 × (1 − hide)` tiles and bolt within
  `3 × (1 − hide)` (`watch`). A stalker still unseen in cover creeps nearer than its rush distance
  before charging (`closeIn`; not cheetahs, whose speed is their advantage).
- **Charge and pursuit.** The rush starts in range, or when the prey bolts and is still near
  (1.8 × rush distance; further off, the stalk is blown and the hunter lets it go). It lasts while
  the hunter has **stamina** (days of running flat out; easing off saves it) and is gaining or at
  least holding its ground: no gain for `patience` days, or falling 2 tiles behind its best, ends it.
  Within 1.2 tiles it puts in a last bound (×1.3).
- **A miss doesn't end the hunt** (`pressOn`). The prey jinks free (no second grab for 0.3 days),
  the hunter drops to 40% of its speed and runs on after it, at a cost of 35% of its stamina. A
  raptor climbs and circles for another dive. With too little left, it lets the prey go.
- **Letting go** (`letGo`). The hunter eases to a stop over a fraction of a day (`ease`), then
  rests 1.5–3 days as before. For 3–6 days the prey it lost counts as twice as far away when it
  picks its next target (`huntCool`), so it goes after another animal if there is one. If there
  isn't, a second try at the same animal starts with half a day of stalk or approach, never a
  sprint from standing (`hunt.again`). Hunts on prey the hunter can't reach (across water) aren't
  started (`huntBlocked`), and one whose way is cut off mid-chase eases off too.

Per style (`STYLES`):

| Style | Who | creep at | rush from | sprint | accel /day | turn rad/day | stamina days | patience days |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stalk | lion, leopard, tiger, jaguar, cougar, bobcat, ocelot, clouded leopard, leopard cat | 5 | 3 (nearer in cover) | 2.4 | 10 | 12 | 2.8 | 1 |
| cheetah | | 8 | 5.5 | 3.4 | 16 | 14 | 2 | 0.5 |
| chase | hyena, coyote, fox | – | 4.5 | 2.1 | 6 | 9 | 4.5 | 2.5 |
| ambush | crocodiles, caimans, snakes, monitors | 4 | 1.5 | 3.2 | 24 | 8 | 1.2 | 0.5 |
| wade | herons | 4 | 1.15 | 1.8 | 10 | 10 | 0.8 | 0.4 |
| pursue | otters and the rest | – | 2.5 | 1.9 | 8 | 10 | 2 | 0.8 |
| stoop | raptors, owls | – | circle, then dive | 2.8 | – | – | 2 (about three dives) | – |

Cheetahs: the shortest wind and the fastest start. Hyenas, coyotes and foxes: slow off the mark
but they keep going, and wear prey down as it tires (fleeing prey tires after 1.5 days, 0014).
Lions, tigers and leopards: a long stalk and a short charge. Crocodiles: a lunge. Raptors keep
their circle and dive. The catch roll on contact is unchanged (45%, `predationCatchChance` in
Challenging).

**Changed from the request.** Cole asked that a hunter pick another animal after a failed hunt.
Forbidding the lost animal outright for a few days cut kills by up to a half wherever prey is
sparse (the hunter walked off to find another), so the lost animal only counts as twice as far:
another one nearby is chosen first, and a second try at the same one begins with a stalk. Real
per-hunt success rates are the reference below, not the target: per hunt, game hunters now
succeed more often than real ones, because kills per year were kept where the balance was tuned.

## Real hunts, for reference

Game time is compressed (a day is about 1.4 s), so durations are compared in shape, not length.

- Lions: about a quarter of hunts succeed (Schaller 1972, *The Serengeti Lion*: roughly 26%;
  higher in groups). They stalk to within a few tens of metres and charge; chases are short.
- Cheetahs: 40–60% in the Serengeti depending on prey (Hilborn et al. 2012, *Animal Behaviour* 84);
  26% of 367 runs in Botswana, with a mean run of 173 m (Wilson et al. 2013, *Nature* 498). A long
  stalk, then a sprint of seconds.
- Spotted hyenas: about a third of hunts (Holekamp et al. 1997, *Journal of Zoology* 242), with long
  chases that wear the prey down (Kruuk 1972, *The Spotted Hyena*).
- Wolves: low success per chase, about one in five on elk and less on moose (Mech, Smith and
  MacNulty 2015, *Wolves on the Hunt*). No wolves on the maps yet; coyotes use the same style.
- Leopards: reported between roughly 15 and 40% (Bailey 1993, *The African Leopard*; Stander et al.
  1997, *Journal of Zoology* 242). Tigers: one hunt in ten to twenty (Schaller 1967, *The Deer and
  the Tiger*). Crocodiles: an ambush lunge from the water; no reliable rate.

## Verification

`node tools/hunt-check.mjs` passes the limits in `problems()`: under 1 stall per 100 chase steps;
at most 10% of failed hunts followed within 2 days by a sprint straight at the same prey (birds
excepted, since dropping from a perch is how they hunt); at least 1.5 days' median stalk for cats;
some catches for any species with 25+ hunts.

Hungry hunters, 150 days, seeds 1987, 91 and 5 (before → after):

| | kills per hunter per 10 days | success per hunt | median stalk (days) | straight back into a sprint |
| --- | --- | --- | --- | --- |
| lion | 0.19 → 0.16 | 31% → 37% | 1.8 → 3.2 | 3% → 0% |
| cheetah | 0.15 → 0.11 | 36% → 56% | 0.7 → 3.5 | 62% → 0% |
| leopard | 0.11 → 0.08 | 31% → 29% | 2.4 → 2.8 | 0% → 0% |
| hyena | 0.04 → 0.07 | 7% → 17% | – | 34% → 0% |
| cougar | 0.31 → 0.27 | 48% → 60% | 1.6 → 3.5 | 0% → 0% |
| tiger | 0.13 → 0.18 | 31% → 80% | 2.6 → 4.1 | 17% → 0% |
| clouded leopard | 0.17 → 0.15 | 46% → 61% | 4.1 → 3.3 | 28% → 0% |
| coyote (Atlanta) | 0.11 → 0.10 | 28% → 50% | – | 72% → 0% |
| raptors | about the same | 40% → 70–90% (up to three dives a hunt) | – | perch drops |

Seed-to-seed spread is large (cougar 0.20–0.40 before), so these are within noise.

`node tools/predation-soak.mjs 12` (restored maps run 12 years like balance-sim, seeds 7, 11, 23 and 5),
kills per hunter-year before → after: lion 2.3 → 2.1, cheetah 3.3 → 2.6, leopard 1.9 → 1.9, hyena
1.4 → 1.1, Nile crocodile 1.0 → 1.1, caiman 1.3 → 1.2, gharial 1.7 → 1.3, jaguar 2.7 → 3.0, ocelot 1.3 → 1.3
(Amazon) and 2.4 → 2.1, tiger 4.2 → 4.5, clouded leopard 4.3 → 4.4, cougar 2.0 → 2.2, bobcat 2.2 → 1.9,
coyote 1.7 → 3.7 (PNW, fewer coyotes) and 4.6 → 6.8 (Atlanta), hawks and owls 4–6 both. Predator and
prey populations move within the spread of four seeds. A first version with a 0.5-day ambush lunge
cut crocodile, caiman and gharial kills by 40–65%; the 1.2-day lunge put them back.

Balance-sim `restore 15`, 8 seeds (7, 11, 23, 5, 31, 41, 53, 67), year 15 before → after: score
58.9 → 58.9, natural % 53.6 → 54.5, forest 206 → 217, mature trees 38 → 38; species within noise
(rabbits and voles swing as in 0025).

Cost: `wildlife.update` at 0.012 days with hungry hunters, two seeds: Serengeti 0.60/0.88 → 0.60/0.84 ms,
Sumatra 0.38/0.41 → 0.36/0.37, PNW 0.52/0.54 → 0.50/0.49. No measurable change.

Checks that pass: hunt-check, animal-life, prey-avoidance, activity, animal-behavior, bird-behavior,
challenging-ecology, consistency. `animal-steering-check` serengeti seed 1987 fails on trunks
(1.4 per 1000) from zebras walking, which base shows on other seeds too (a 0025 walk issue, not
hunting); hunting leopards in trunks were fixed here (a frozen stalker no longer turns on the spot).

## Snakes lie in wait (2026-11-08)

Snakes used the crocodiles' `ambush` style: a hunt from up to 12 tiles, approached at 0.8 of a
0.5-speed snake, so prey walked off or saw it, and pythons and anacondas caught nothing in 3-year
soaks (about 40 hunts each, 0 kills). Now every snake hunts in the `strike` style: a hunt starts
only for prey within `reach` (3.5 tiles; `startHunt` caps the reach for any style that sets it), the
snake keeps still (`approach` and `creep` 0) and hidden (`hidden` 0.7, also while idle, through
`hiddenBy` in `watch`) until the prey is within 1.6 tiles, then lunges. Hungry, it lies in wait
(`lieInWait`, from `prowl` through the activity profile's `lieInWait`): the anaconda and python
(`atWater`) at a bank where their prey drink (the prey's `home.water`, 0013), the land snakes near
prey, moving on after 5-15 days. A meal is followed by 5 days digesting. Land snakes are no longer
held within 2 tiles of water by `huntBlocked`. `node tools/snake-hunt-probe.mjs [map] [years]` says
why a snake does or doesn't catch prey; `predation-soak` on 3 years: python 0 → 0.3 kills a
snake-year (and 1.3 → 4.3 pythons), anaconda 0-1 → 2-6 catches in 8 years.

## Gotchas

- `hunt.v` and `hunt.hd` are the hunter's own speed and heading. Anything that stops or turns a
  hunter mid-hunt should set them, not `a.x`/`a.orientation`, or the next step carries on as before.
- A frozen stalker doesn't turn to face its prey: turning on the spot swings its body capsule into
  trunks (0025). It faces the prey when it moves again.
- Ending a hunt from outside `huntStep` should go through `letGo` (cooldown, then ease or rest), not
  set `idle` directly, or a running hunter stops dead.
- `ease` is a hunt phase: `a.state` stays `hunt` while it slows, and the inspector reads "Giving up
  the chase".
- `balance-sim` steps wildlife at 0.1 day, the game at about 0.012. Accelerations and turn rates are
  per day, so they hold at both, but check balance with both `balance-sim` and `hunt-check` (0.02).
