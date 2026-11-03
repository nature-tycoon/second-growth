# 0030 Everyday animal behaviours: fishing, trunks, climbers, rhythm

2026-10-31. Workstream G of Cole's idea list, built on 0025 (shared steering) and 0026 (hunts).
Eight reports, each diagnosed before it was fixed. Cole's answers to the design questions:
fishing takes a drawn fish when one is in reach, else one the water holds that isn't drawn; bats
are in their roost by day and come out at dusk; at most 2 climbers of a kind per tree on every map,
and gray squirrels forage below (flying squirrels stay up).

## Findings

- **Fishing.** On Standard, herons, kingfishers, eagles and the PNW otter never caught a fish:
  fish were only their habitat score (`fishIndex`), and only Challenging gave them fish to hunt
  (`challengePrey`). Bears swiped salmon in runs only, with nothing drawn in their mouths.
- **Woodpeckers** had no trunk behaviour at all: they perched, preened and nested like songbirds.
- **Squirrels.** Climbers (`move: 'tree'`) can only move tree to tree, so gray squirrels never
  came down. They never crowded either (at most 2 per tree), but flying squirrels, drawn as
  squirrels too, sat up to 7 in one tree, 1-1.8 trees over two at any moment (Atlanta, 3 seeds).
- **Vultures feeding from a tree.** `scavenge` fed any animal within 1.4 tiles of a carcass where
  it stood, so a vulture perched beside a kill ate from the branch, and one that landed beside the
  body on a tile with a tree was drawn in the crown.
- **The frog playing.** `play` was open to the young of any land species.
- **Bats by day.** The sim has no clock: the day and night are drawn on top (one drawn day lasts
  months of game time; the night is ~10 s at normal speed). Bats were drawn flying at all times.
- **Keystone moments.** Atlanta's monarch stopover marked its wave of butterflies `passing`, the
  flag the drawing reserves for bird flyovers (which carry a `passage`), so every frame threw and
  the game stopped drawing. The other 20 moments play cleanly.
- **Birds in the trees.** Since 0024 trees are 2.5-3.6 tiles tall, above ordinary flight (~1.9).
  Only a bird flying to a goal was lifted, and only over its own tile: 69-95% of samples of fliers
  over trees were inside a crown.

## Decision

Species traits live in `behaviorFor` (`js/data/animal-behavior.js`), one place for every map:

| Trait | Who | Where it acts |
| --- | --- | --- |
| `plays` | mammals, not sloths, armadillos, anteaters, pangolins, bats | `play` in `sim/animal-life.js` |
| `nocturnal` | bats, flying squirrels | `roostingNow` (`data/animal-activity.js`): drawing, panel, watch mode |
| `fishing` | `data/animal-fishing.js` by species | `sim/fishing.js`, `wade`, `fishSalmon` |
| `climb` | every `move: 'tree'` species: `{ cap: 2, ground }` | `sim/climbers.js`, `pathTo` |
| `birdProfile.trunk` | every woodpecker (`trunkKeys` for others) | `sim/bird-behavior.js` `'trunk'` |

- **Fishing** (`fishing(def, game)` is null where the species already hunts fish in this mode).
  Styles: *wade* (herons, egrets, storks: a hungry one flies to the shallows and strikes every day
  or so), *plunge* (kingfishers: hover, dive, up to a perch), *snatch* (eagles: swoop and carry,
  0012's `carryCatch`), *swim* (otters: eat afloat), *swipe* (bears: a trout they can see in a
  creek, between salmon runs). A strike takes a drawn fish within 0.6 tiles (bill or feet) and
  calls `onPredation`, though only in proportion to how full that fish's population is (pop/K:
  a scarce stock is mostly missed, so fishers don't hold a small one down); else, for all but
  bears, one of the water's undrawn fish (a species living in that water, one an eagle can lift
  first), which removes nothing. Fishers never seek out the
  drawn fish: each stands for many, and seeking emptied them (20 -> 1 in 100 days). Fed for
  `every` days after a catch. Fishing feeds no population: fishers still arrive by `fishIndex`.
  Every caught fish, and a fish an otter catches on a hunt, is `a.prey` and drawn in front of the eater.
- **Woodpeckers** cling to a big tree's drawn trunk (`treeTrunk`, shared with flora) for 4-9
  days, from a tenth to two fifths up the tree as built before the lift (`treeLevel`, 0024), so on
  the bark under the crown; upright (`st.pitch` 1.2), facing it, head hammering. The drum
  recording (0002) is heard from a woodpecker on a trunk.
- **Climbers.** `pathTo` never ends a climber's walk in a tree already holding `cap` of its kind
  (a mother's young aside). At a decision a climber in a tree with `cap` earlier arrivals moves to
  one with room, along the branches or else over the ground (a flying squirrel would glide; drawn
  as a run); monkeys keep to their troops' canopy routes. Gray squirrels (`ground: 0.2`) go down
  the trunk to forage and bury nuts (more in the fall), moving as ground animals (`a.move`
  'ground', drawn on the ground), and run up the nearest tree with room when a predator (a hunter
  of theirs, or any cat, dog, fox, hawk, owl or snake) is within 6 tiles.
- **Scavenging birds** come down beside a carcass before eating and eat on the ground
  (`birdGround` while the meal lasts).
- **Night animals** are drawn only from sunset to before dawn (`renderer.nightOut`), each coming
  out at its own point in the dusk; by day the panel says "Roosting until dusk". With the day
  cycle off they fly as before. Owls still hunt by day: the sim can't keep them to the drawn night.
- **Flight clearance** (`render3d/flight-clearance.js`): every flier keeps over the crowns under
  it and ahead along the way it's moving, plus 0.2 (0.8 for flyovers), and climbs out of a crown
  fast (12 tiles/s) if its eased height finds it there. Exempt: a stoop, the last tile before
  landing, the end of a vulture's spiral, pollinators. It looks about a second of its own flight
  ahead (1.4 to 4 tiles, sampled every 0.7), and while clearing crowns its height eases up at
  `k * 1` and down at `k * 0.3`, so a run of trees is one swell, not a pop and a drop per crown
  (2026-11-02; a followed bird looked glitchy). `flight-canopy-check` measures the `jolt` (change
  of climb rate per frame, limit 0.4 at the 99th percentile; it was 0.37 to 0.82 before).

## Gotchas

- `a.passing` means a bird flyover (`wl.flyovers`, with `a.passage`); never set it on a resident.
  Loading clears it.
- `passable` reads the animal's own `a.move`, so a climber on the ground is `'ground'` while
  the species stays `'tree'`. Drawing checks `a.move !== 'ground'` before lifting it into a crown.
- Fixed `Math.random` in tests breaks the samplers that pick water or ground spots: seed it.
- A soak that stocks more climbers than the map holds (`wl.state[sp].K`) will show crowding the
  cap can't fix: there are no free trees.

## Balance and cost

Seeded `balance-sim restore 15`, seven seeds (7, 11, 23, 1, 2, 3, 4), the branch base vs this,
years 8-16. Every run completes every goal. Fishing is the change that reaches PNW populations.

| | before | after |
| --- | --- | --- |
| Cutthroat trout | 11.4 (9.7-13.8) | 10.8 (9.4-12.1) |
| Herons, otters, bears (year 15) | 3.6, 2.6, 2.6 | 3.6, 2.4, 2.0 |
| Score | 65.6 (59.6-72.7) | 61.9 (58.5-71.0) |
| Invasive cover | 14.6% (7.0-21.2) | 18.6% (8.6-22.2) |

The first version, where fishers sought out drawn fish and always took one in reach, cut trout to
9.3, with one seed held at a single trout for six years; hence the pop/K rule. The score gap
follows invasive cover: some runs keep invasives very low by luck (3 of 7 before, 1 of 7 after,
and seed 3 the other way round), and plant spread reads only whether dispersers exist, nothing this
changes. Treated as noise; worth a look if it shows up again.

Cost: new code is 1.3% of a PNW community run's CPU in node (`--cpu-prof`), almost all of it
`canopyTop`, about 0.04 ms a frame. `ms/day` in balance-sim unchanged (17.2-17.8 both).

## Checks

- `tools/fishing-check.mjs`: profiles per map and mode, each style end to end, a PNW soak.
- `tools/woodpecker-trunk-check.mjs`: PNW fir and Atlanta oak: time on trunks, drawn on the bark.
- `tools/climber-cap-check.mjs`: data, a crowded grove spreading out, squirrels on the ground and
  up a tree from a fox, an Atlanta soak (squirrels per tree).
- `tools/animal-rhythm-check.mjs`: play and nocturnal data, frogs never play, bats by day.
- `tools/flight-canopy-check.mjs`: fliers inside a crown, four forested maps (limit 1%).
- `tools/bird-behavior-check.mjs` (vulture on the ground), `tools/moments-check.mjs` (stopover).
- `tools/moments-sweep-browser-check.mjs`: all 21 keystone moments on 7 maps in a browser.

## The tracking lens keeps the support (2026-11-02)

The tracking lens (`render3d/focus.js`) used to open a window about 0.85 tiles wide, starting at the back of the animal. That cut the woodpecker's trunk, the coral under reef fish and palm fronds under monkeys. One rule now covers every species: near the animal, only what lies between the camera and the animal's model box (`revealBounds`, now set for every pose) opens. The trunk an animal clings to (`st.trunk`, from `trunkCling`) stays unless it is wholly in front of the animal. Whatever lies below its feet near it, and shows below it on screen, stays. The wider gap opens gradually, over two window radii toward the camera. A new kind of support (a climber on a trunk or a rock face) sets `st.trunk` or a similar uniform; it needs no per-species shader patch. Check: `tools/follow-support-browser-check.mjs` (pictures in `tools/release-output/follow-support-*.png`), and `tools/canopy-reveal-browser-check.mjs` for covering leaves.
