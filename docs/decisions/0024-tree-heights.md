# 0024 Tree heights from real heights

2026-10-25. Cole saw elk as tall as the conifers on the PNW map. Measured as drawn (a tile is about
8 m, `tools/animal-size-audit.mjs` for the animals): an elk cow is 0.69 tiles, a bull with antlers
1.0, and a mature Douglas-fir about 2 tiles, so the fir stood three cows tall where a real one is
25–30. It was the same on every forested map: ordinary canopy trees were 1.4–2.1 tiles whatever
their species, while the few giants (kapok, tualang, Brazil nut, ceiba) had been drawn about 3.4
and already looked right.

## Decision

Each tree species carries its typical mature height in metres (`heightM` in `js/data/plants-*.js`),
and one module, `js/render3d/tree-stature.js`, turns that into how tall it is drawn:

- **One curve for every map**: `statureTiles(m) = 1.47 * sqrt(m / 10)` tiles, so 10 m is 1.47 tiles,
  30 m is 2.55, 60 m is 3.6. True scale is out: animals are drawn about 2.5 times life size so they
  read from the farm view, and a true 60 m fir would be 7.5 tiles tall, hiding the ground. The curve
  was set so the giants stay about where they were; a fir is now about five elk cows tall, an oak or
  maple about three.
- **Never shorter**: `treeStature(p)` is `max(1, curve / drawn shape height)`. The savanna's
  umbrella thorns and fever trees would come out a little shorter on the curve, and giraffes, also
  drawn large, must still browse under them, so they keep their height.
- **Taller, not wider**: spacing (one tree per tile) is unchanged because crowns keep their width.
  The extra height is `shape.lift` (`statureShape`; conifers put half into `height`, below),
  applied after the tree is built
  (`liftTree` in `geometry/trees.js`): everything from the lowest limb or leaf up moves straight
  up and the trunk under it stretches. Crowns keep their shape, so elk walk under a fir's
  branches. The limbs tree animals climb (`userData.canopyBranches`) are moved the same way and
  keep their angles. A tree with leaves near the ground (a western redcedar's skirt, a banana)
  stretches evenly instead. Winter's bare trees (`bareTree`) are lifted the same way.
- **One place for "how tall is this tree"**: perched birds, monkeys in crowns, flying birds clearing
  crowns (`actors.js`), falling leaves and petals (`ambience.js`), and flocks passing over
  (`sim/bird-passage.js`) all read `treeHeight` / `treeStature`, not `TREE_SHAPES[...].height`.

A species without `heightM` (corals, mangroves) draws as before.

## Gotchas

- Stretching the whole tree upward (an instance `sy`) was tried first and broke the climbing checks
  (`canopy-grips-check`, `howler-prototype-check`): it steepens every limb a monkey walks.
  Raising `trunkH` and `height` in the shape broke them too, because broadleaf forks sit at a
  habit-dependent fraction of `trunkH`. Lift after building is what keeps the crown unchanged.
- The climbing code chose limbs and target heights as fractions of a tree's height (limbs above
  45%, aim at 80%, perches above 30%). A longer trunk moves those cut-offs up the crown, which
  failed `primate-behavior-check` (an orangutan's transfer never finished) and
  `siamang-swing-check`. Lifted geometry records `userData.lift = { at, by }`, and those fractions
  now go through `treeLevel(geo, t)`, which measures them on the tree as built before the lift
  (`canopy-support.js`, `canopy-motion.js`, `bird-perch.js`). New code that picks a height as a
  fraction of a tree must do the same.
- For conifers, all the extra height as bare trunk looked like a short crown on a pole from the
  play camera, so a conifer puts half into a longer crown (`height`) and half into `lift`.
- Flower and fruit positions on a crown are in the shape's own units: add `shapeDef.lift`.
- Tree geometry is cached per species by `type:key:variant:lift`, so `setStature(false)` followed by
  `flora.rebuild(game, true)` draws the old heights (used by the review tool).

## Checks

- `node tools/tree-stature-review.mjs [maps]`, then
  `http://localhost:8347/tools/tree-stature-review.html`: before/after screenshots at play zoom,
  close up and at eye level, with each map's biggest ground animals at the forest edge.
- The climbing checks (`canopy-grips-check`, `canopy-route-check`, `canopy-support-check`,
  `howler-prototype-check`, `howler-jump-check`, `howler-fork-timing-check`) must pass unchanged.
- Cost: `node tools/play-profile.mjs` before and after (below).

## Cost

`play-profile` (High, 3 years, resolution held, on battery, so read differences under ~10% as
noise), HEAD then this change:

| View | HEAD | After |
| --- | --- | --- |
| PNW play | 60 fps, draw 2.2 ms, GPU 11.0 | 60 fps, draw 2.2 ms, GPU 10.7 |
| PNW close | 60 fps, draw 2.9 ms, GPU 10.2 | 60 fps, draw 3.0 ms, GPU 10.5 |
| Sumatra wide (two repeats) | 60 fps, draw 2.0 ms, GPU 10.3–10.5 | 60 fps, draw 2.0–2.1 ms, GPU 10.4 |
| Sumatra top speed (two repeats) | 25–27 fps, plants 10.9–11.9 ms | 23–27 fps, plants 11.5–12.4 ms |

No new triangles (same crowns, a longer trunk). Top speed on Sumatra was already over budget
before this (the daily plant redraw, performance review finding).

## Known

`primate-stall-check` case 1 (orangutan, speed 1, 60 fps, seed 1987) went from passing to a 20.8-day
stuck recovery route (limit 18). The stuck hold is mid-crown, where the geometry is unchanged; the
taller trunks change the run's course of events. HEAD shows the same fault on other seeds (18.6 days
in case 0), so it is an existing rare stall in the canopy recovery (`canopy-motion.js`, recovery
routes that never leave cursor 0), not this change. The check was left as it is.
