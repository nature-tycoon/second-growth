# 0021 Watch pace: a speed for sitting and watching

2026-10-24. Cole asked for "real time game speed where you can just observe the animals throughout
a day more realistically. I want this game to be something you can sit and watch."

## Why not literal real time

The game has one clock, counted in game days (`SPEEDS` in `config.js`: game days per real second).
Animals are timed for it. At normal speed (0.72 days a second) an elk walks about a tile (8 m) a
second, a gallop, and a "3-day" rest lasts about 4 seconds. The sun and moon run on their own
6-minute loop (`DAY_CYCLE` in `render3d/scene.js`), unrelated to game days.

- Slowing that one clock to 24 real hours a day would freeze the animals.
- Slowing only the calendar while the animals kept their pace would let hunting, aging and thirst
  run hundreds of times faster than births and plant growth, and populations would crash the
  longer anyone watched.

## Decision

A fifth speed, **watch pace**: `SPEEDS[4] = 0.13` days a second (`WATCH_PACE`), about 5½ times
slower than normal. Everything slows together, so the ecology is unchanged per game day. Animals
walk, graze and rest at about their real pace (an elk about 1.6 m a second), and a month takes
about 75 seconds (a year about 15 minutes). The sky cycle runs a third as fast (`DAY_PACE`, about
18 minutes a day), and the night isn't hurried (`NIGHT_PACE` 1), so dusk, night and dawn play out.

- The button (an eye) sits between pause and normal in the top bar and on the watch bar. The key
  is `0`, also in watch mode. Watch mode doesn't switch to it on its own (see 0020).
- It's index 4, after fastest, so saved speeds 1–3 keep their meaning. Code that compares speeds
  must compare `SPEEDS[game.speed]`, not the index (the ground repaint and plant rebuild throttles
  in `scene.js` do). The save contract allows `0` to `SPEEDS.length - 1`.
- Sprints look slower than life: a wolf at a full run covers about a third of a real wolf's top
  speed, because the run multipliers were tuned at normal speed.
- `tools/farm-state-check.mjs` checks that a farm saved at watch pace comes back at it and that its
  clock runs at that pace.

## Not done

Animals don't yet act by time of day (grazers at dawn and dusk, owls at night, bedding down): the
sky clock isn't part of the simulation. Watch pace is what would make that worth building.
