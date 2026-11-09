# 0039 Eating styles

Status: accepted, 2026-11-08 (wave 2, session 5)

## Decision

Every animal that has a meal in the simulation is drawn eating it, through a few shared styles
chosen by **what the meal is**, not by species (`render3d/eating-pose.js`, used by `actors.js`):

| Style | When | Pose |
|---|---|---|
| crop | `forage` on grass, seeds, insects, fruit or dung | head down, nodding with each bite |
| browse | `forage` on `browse` or `leaves` | a shrub: head about level; a tree: head reaching up; a tug as it strips |
| tear | `feed` (a catch or a carcass, 0030) | head down, pulling back hard every so often |
| hand to mouth | a monkey or ape at a fruit meal (`primate` state) or a leaf meal (`forage` on `leaves`) | the existing `feedingPose` arm with the morsel |
| snap | a fish or reef animal at a `forage` meal or a catch (`feed`) | a short dart forward; nose-down at algae, coral, sponge, seagrass |
| peck | ground birds (`a.bird.kind === 'forage'`, 0030) | unchanged |

Drawing only: it reads `a.state`, `a.forage.food`, `a.fruitMeal` and the browsed tile, and never
writes to the animal, so the simulation and balance are unchanged.

Two cosmetic additions have no meal in the simulation behind them:
- **Nibblers** (`NIBBLERS`: turtles, ostriches, ground hornbills, beavers, ducks) dip their heads
  now and then while standing, the same idle rule grazers already had (`GRAZERS`).
- **River fish** (not reef) pick at drift now and then while idle.

## Gotchas

- `GRAZERS` lives in `sim/steering.js` and also sends grazers back to water, so drawing-only
  additions go in `NIBBLERS`, never `GRAZERS`.
- Swimming forces the head level (`swimming ? 0`), and fish models use the head slot for body
  bend (`mo.bend`), so fish eat through position and pitch (the snap), not the head.
- Hanging and gripping animals (sloths, canopy walkers) pass -1 in the head slot for their grips,
  so a sloth's leaf meal shows nothing (see s5.md).
- Benthic animals (urchin, sea cucumber) have no head to show and are skipped.

## Check

`tools/animal-closeup-review.html?pose=crop|browse|hand|snap` shows each style on any species.
`node tools/play-profile.mjs serengeti high 1` before and after (2026-11-08, on battery):
animals drawing 0.25 / 0.21 ms before, 0.28 ms after, in the noise.
