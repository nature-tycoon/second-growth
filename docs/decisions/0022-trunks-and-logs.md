# 0022 Trunks and logs: walkers go round wood on the ground

2026-10-24. Cole asked: "Make it so that animals walk around trees instead of through. For large
animals they can't get stuck. Maybe for animals like African elephants they trample small trees in
their way and are not affected by hitting branches higher up. For small animals they should also
have to move around fallen logs. Birds need to be able to go through leaves. Don't mess with monkeys."

## Context

Routes are found tile by tile (`pathTo`), and a tree's tile is open ground, so nothing knew where a
trunk stood inside its tile. Walkers, hunters and fleeing prey all passed straight through trunks
and logs. Nothing has ever collided with crowns, so fliers and climbers already moved through the
leaves.

## Decision

`sim/ground-obstacles.js` treats the wood on the ground as solid for **ground walkers** (move
`ground` or `semi`, not reef fish, not leaving, not in the air, and no primate: macaques walk on the
ground and are still left alone).

- **Same spot as drawn.** `trunkSpot` and `dryPoint` moved there from `flora.js`, which now calls
  them, and the trunk radius comes from `render3d/geometry/tree-shapes.js` (`TREE_SHAPES` and
  `CONIFER_HABITS` as plain data, re-exported by `trees.js`) × the tree's drawn scale. Kinds whose
  shape gives no `trunkR` (palms, baobab, banana...) use `KIND_TRUNK`. Corals and anything on a
  water tile don't count. Snags count as trunks.
- **Keep-out distance** is trunk radius + half the body's width (`animalRadius × 0.38`), capped at
  `KEEP_MAX` 0.26 (or the trunk radius + 0.02, if that's bigger). Trunks in neighbouring tiles are at least
  0.55 apart, so the cap always leaves a way between two of them, however dense the stand. The catch:
  in thick forest a big animal (elk, bear, rhino) can let its body overlap a trunk's edge a little.
- **Three hooks**, each on every walker path:
  - `clearSpot` moves a target that falls on a trunk (a rest spot, a waypoint, a hunt target) to
    the trunk's edge, so the animal can arrive instead of pressing on it (walk state and `stepToward`).
  - `steerAround` swings a heading that points into the cone a trunk fills to the cone's nearer
    edge, so walkers curve round early (`smoothWalk` and `stepToward`).
  - `resolveStep` pushes the walker out of any wood it stepped into, so it slides round. A push into
    a fence, building, water or fire is refused. Spacing shoves (`AnimalSpacing.separate`) can't
    push an animal into wood either.
- **Never stuck.** An animal that loses more than 0.5 tiles of walking against wood
  (`a.woodLost`) squeezes through for the next tile it walks (`a.squeeze`).
- **Elephants** (`tramples: true`: the African elephant and the Sumatran gajah) walk through trees
  younger than 0.4 growth. Each sapling they walk into takes the savanna's trampling knock (−0.08
  growth, and one at 0 dies), once per tree they walk into (`a.trampled`). Mature trunks still
  turn them.
- **Logs** (`F.LOG`, the drawn 0.95-tile log as a capsule ±0.42 along its axis, radius 0.11) block
  animals with `animalRadius` under 0.2: voles, rabbits, squirrels, chipmunks, frogs, snakes,
  tortoises. Deer-sized and up step over them. Floating logs don't count.

## Gotchas

- Tree positions are now shared code: change the trunk jitter in `trunkSpot` only, never in `flora.js`.
- The sim imports `tree-shapes.js`, so that file must stay free of three.js imports (balance-sim
  runs without the three loader).
- `clearSpot` only moves targets within 1.5 tiles (it only matters on arrival), and
  `checkMovementProgress` measures progress to the cleared target, or a rest spot on a trunk would
  read as stalled and be re-routed.
- The new per-animal fields (`woodLost`, `squeeze`, `trampled`) are declared on `Animal` and not saved.
- Idle animals standing in a trunk (from an old save) aren't moved until they next walk.

## Consequences

- Cost: about 7% of simulation time on dense Sumatra (0.1 ms per `wildlife.update` with ~300
  animals; CPU profile, callees included), within the 1–2 ms the 2026-10-23 performance review leaves.
  Each tile's trunk is cached (`cachedTrunk`) because the bank check (`visibleLevel`) and grove
  scale are too slow to redo every step.
- In the real frame loop, a deer and an elk crossed a 16-tile mature fir grove with no step inside a
  trunk and no squeeze (1,616 samples).
- Balance, Hollis `restore 15`, 8 seeds: year-16 score, meadow, forest and mature trees are within
  seed noise (5-seed means: meadow 1051 → 1060, forest 204 → 210, score 58.7 → 61.8).
- Elk looked lower in the first 8 seeds (year 11: 15 → 11.5), but that was noise. Elk births,
  arrivals and natural deaths depend only on headcount and K (`Wildlife.monthly`), not on where elk
  walk. K was identical, and predation was unchanged (25 → 23 adults over 8 seeds × 9 years).
  Movement only reshuffles the random sequence. On 16 fresh seeds (101–116) elk means were
  6.1/9.9/13.4 before and 6.1/10.8/14.8 after at years 6/8/10. Lesson: 8 seeds of `restore` can't
  tell a 3-elk difference from noise (seed-to-seed spread is ±4). Use 16+ before calling a shift real.
- Serengeti campaign completes on the same day (522). No elephants arrived in 10-year idle Serengeti
  or Sumatra runs, so the sapling trampling didn't show up in those numbers.

## Check

`node tools/ground-obstacles-check.mjs`: five species cross a dense fir stand without entering a
trunk; the detour costs a deer less than 60% extra time; 24 random trips through a mixed wood all arrive;
a hunter's `stepToward` path stays out of trunks; elephants push through a sapling thicket,
knocking at least 10 back, and stay out of mature trunks; a vole goes round a field of logs while a
deer steps over; fliers, orangutans and macaques are exempt.
