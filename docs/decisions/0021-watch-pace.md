# 0021 Watch pace: a speed for sitting and watching

2026-10-24. Cole asked for "real time game speed where you can just observe the animals throughout
a day more realistically. I want this game to be something you can sit and watch."

## How time works

`SPEEDS` in `config.js` is game days per real second. The calendar (plants, weather, months,
births, arrivals, hunger) ticks once per game day (`Game.dailyTick`, `Wildlife.daily`/`monthly`).
Animals move and decide in between, on the same days (`Wildlife.update(dt)`), and are timed for
normal speed: there an elk walks about a tile (8 m) a second and a "3-day" rest lasts about 4
seconds. The sun and moon run on their own loop (`DAY_CYCLE` in `render3d/scene.js`), not on game
days.

Literal real time (a day in 24 hours) would freeze the animals.

## Decision

A fifth speed, **watch pace** (`WATCH_PACE`, index 4): the calendar slows to 0.13 days a second
(a month in about 75 seconds, a year in about 15 minutes) while the animals and visitors keep the
normal pace (`ANIMAL_SPEEDS[4] = 0.72`). The sky cycle runs a third as fast (`DAY_PACE`, about 18
minutes a day) and the night isn't hurried (`NIGHT_PACE` 1), so dusk, night and dawn play out.

The first version slowed everything together (animals at 0.13 too). Cole: "the animals are moving
way too slow in the watch mode. It looks like they're in slow mo," and asked to break with the
simulation so animals move at their regular speed while days and seasons slow down.

- The button (an eye) sits between pause and normal in the top bar and on the watch bar. The key
  is `0`, also in watch mode. Watch mode doesn't switch to it on its own (see 0020).
- It's index 4, after fastest, so saved speeds 1–3 keep their meaning. Code that compares speeds
  must compare values, not the index: `SPEEDS` for anything that follows the days (the ground
  repaint and plant rebuild throttles in `scene.js`), `ANIMAL_SPEEDS` for anything that follows
  the animals (`canopy-motion.js`, `canopy-grips.js`). The save contract allows `0` to
  `SPEEDS.length - 1`.

### Keeping the ecology honest

At watch pace each calendar day holds about 5½ days of animal life. Most of what changes
populations already runs on the calendar (births, arrivals, departures, mortality, hunger, the
daily hunt roll). Two things didn't, and a seeded 6-year restore run (`balance-sim`'s plan with
the animals stepped 5.54 times a day, seeds 7, 11, 23) showed them:

- **Aging.** `a.age` advances on the animals' clock and is also the base of their behaviour timers
  (`a.age + 4` and so on), so it keeps doing that. At watch pace `a.lag` collects how far it has
  run ahead of the calendar, and life stages (grown, old, independent, size) read
  `lifeAge(a) = a.age - a.lag`. Without this, short-lived species (voles, robins, treefrogs) hit
  old age 5½ times sooner and crashed.
- **Hunts started at any moment** (a prowling hunter, a soaring hawk scanning, a crocodile at the
  crossing) go through `Wildlife.paced()`, which passes only the calendar's share of the time
  (`lifePace`, calendar days per animal day, 1 at the other speeds). Otherwise a hungry hunter
  that missed got 5½ times as many tries a day.

With both, ecosystem health over years 4–7 averages 59.5 at watch pace vs 60.7 normally (spring
and autumn counts, three seeds; it was about 4 points lower before the fixes). Some species
still settle lower after hours of watching: elk 2.2 vs 6.0, hawks 1.2 vs 2.2, owls 1.5 vs 2.9,
hummingbirds 0.6 vs 3.3, rabbits 2.9 vs 6.1. Births and arrivals are calendar-bound, so this is
the general churn of a faster animal life, not one rule; I didn't trace it further. Ninety minutes
of watching is six game years, so a normal session moves these very little.

Other things that run on the animals' clock and so go 5½ times faster per calendar day: carcasses
disappear, game trails wear in, visitors come and go (visitor money ran about 15% higher over the
six years), drinking and resting.

`tools/farm-state-check.mjs` checks that a farm saved at watch pace comes back at it, that the
calendar runs at 0.13 while the animals run at 0.72 and age by the calendar, and that the two
clocks agree at the other speeds.

## Not done

Animals don't yet act by time of day (grazers at dawn and dusk, owls at night, bedding down): the
sky clock isn't part of the simulation.
