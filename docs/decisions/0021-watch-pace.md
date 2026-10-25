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
(a month in about 75 seconds, a year in about 15 minutes) while the animals and visitors live at
0.45 (`ANIMAL_SPEEDS[4]`), about 60% of the normal pace. The sky cycle runs a third as fast (`DAY_PACE`, about 18
minutes a day) and the night isn't hurried (`NIGHT_PACE` 1), so dusk, night and dawn play out.

The first version slowed everything together (animals at 0.13 too). Cole: "the animals are moving
way too slow in the watch mode. It looks like they're in slow mo," and asked to break with the
simulation so animals move at their regular speed while days and seasons slow down. With the
animals at the normal 0.72, Cole then found them "a little too quickly" for reality, so they went
down to 0.45. (A true-to-life walk is nearer 0.13, but on screen animals are drawn larger than life
against the land, so it reads as slow motion.)

- The button (an eye) sits between pause and normal in the top bar and on the watch bar. The key
  is `0`, also in watch mode. Watch mode doesn't switch to it on its own (see 0020).
- It's index 4, after fastest, so saved speeds 1–3 keep their meaning. Code that compares speeds
  must compare values, not the index: `SPEEDS` for anything that follows the days (the ground
  repaint and plant rebuild throttles in `scene.js`), `ANIMAL_SPEEDS` for anything that follows
  the animals (`canopy-motion.js`, `canopy-grips.js`). The save contract allows `0` to
  `SPEEDS.length - 1`.

### Keeping the ecology honest

At watch pace each calendar day holds about 3½ days of animal life (5½ when the animals ran at 0.72). Most of what changes
populations already runs on the calendar (births, arrivals, departures, mortality, hunger, the
daily hunt roll). Two things didn't, and a seeded 6-year restore run (`balance-sim`'s plan with
the animals stepped 5.54 times a day, seeds 7, 11, 23) showed them:

- **Aging.** `a.age` advances on the animals' clock and is also the base of their behaviour timers
  (`a.age + 4` and so on), so it keeps doing that. At watch pace `a.lag` collects how far it has
  run ahead of the calendar, and life stages (grown, old, independent, size) read
  `lifeAge(a) = a.age - a.lag`. Without this, short-lived species (voles, robins, treefrogs) hit
  old age several times sooner and crashed.
- **Hunts started at any moment** (a prowling hunter, a soaring hawk scanning, a crocodile at the
  crossing) go through `Wildlife.paced()`, which passes only the calendar's share of the time
  (`lifePace`, calendar days per animal day, 1 at the other speeds). Otherwise a hungry hunter
  that missed got several times as many tries a day.

With both, averaged over years 4–7 (spring and autumn counts, three seeds):

| | health | elk | hawk | owl | hummingbird | rabbit | vole |
|---|---|---|---|---|---|---|---|
| normal speed | 60.7 | 6.0 | 2.2 | 2.9 | 3.3 | 6.1 | 32 |
| watch, animals at 0.45 (3.46×) | 57.5 | 4.5 | 1.2 | 1.3 | 2.5 | 1.0 | 21 |
| watch, animals at 0.72 (5.54×) | 59.5 | 2.2 | 1.2 | 1.5 | 0.6 | 2.9 | 24 |

(Before the fixes, health at 5.54× was about 4 points lower.) Three seeds swing a couple of points
of health, so the two watch rows are about the same; both run some species lower than normal
after hours of watching. Births and arrivals are calendar-bound, so this is the general churn of a
faster animal life, not one rule; I didn't trace it further. Ninety minutes of watching is six
game years, so a normal session moves these very little.

Other things that run on the animals' clock and so go faster per calendar day: carcasses
disappear, game trails wear in, visitors come and go (visitor money ran about 15% higher over the
six years at 5.54×), drinking and resting.

`tools/farm-state-check.mjs` checks that a farm saved at watch pace comes back at it, that the
calendar runs at 0.13 while the animals run at their own pace and age by the calendar, and that the two
clocks agree at the other speeds.

## Not done

Animals don't yet act by time of day (grazers at dawn and dusk, owls at night, bedding down): the
sky clock isn't part of the simulation.
