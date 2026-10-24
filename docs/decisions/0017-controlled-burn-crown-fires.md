# 0017 Controlled burns can torch into crown fires

2026-10-23. Cole felt the controlled burn didn't do much and asked for it to be able to become a crown fire.

## Decision

A controlled burn was always low risk: it could jump the line as a grass wildfire, but it never
touched big trees and never reached the canopy. Real prescribed burns go wrong by *torching*: a
shrub layer under a big tree (ladder fuel) carries the flames into a dry crown. We model that, and
nothing broader.

- `Events.rxTorch(i)` is the chance that a tile in the burn unit torches as the fire reaches it
  (`igniteRx`). It needs a big tree (`treeG >= 0.6`) with a shrub, brush pile or log under it, and
  scales with that ladder fuel, how dry the tile is, the dry streak (`rxDrought()`: 0 just after
  rain) and the fire season (off season ×0.3). `RX_TORCH` sets the scale.
- A torched tile leaves the burn unit and starts a crown fire through the normal `ignite(..., severe)`
  path, with heat 0.5–1 from the dry streak, so a burn in milder weather runs into the crowns for
  fewer days. If the burn has already jumped the line, that wildfire goes up into the crowns instead
  of being restarted.
- Maps with `crownFires: false` (savannas, Atlanta, Sumatra, the reef) never torch.
- Natural crown fires are unchanged, and so is the escape chance.

The player's defenses are the realistic ones: burn after rain or outside the fire season, and clear
the shrubs and saplings under trees first. Open meadow never torches.

## Evidence

`node tools/rx-crown-fire-check.mjs` checks the conditions and both ignition paths.

A probe on a 12-year restored PNW farm (`balance-sim restore`) painted a 7×7 burn around its densest
forest (6–8 big trees over shrubs), 60 runs per row across three seeds:

| Conditions | Crown fire | Jumped the line |
| --- | ---: | ---: |
| Fire season, 10 dry days | 7–15 | 3–17 |
| Fire season, 4 dry days | 3–6 | 2–7 |
| Off season, 10 dry days | 1–2 | 2–7 |
| Just after rain | 0–1 | 2–6 |
| Open meadow, fire season, 10 dry days | 0 | 11–17 |

In that patchy forest a crown fire killed only 1–3 big trees: it spreads by the same rules as a
natural crown fire, so it does real damage only where forest is continuous. `balance-sim restore 15`
(seeded) is identical before and after, since its plan never burns, and `campaign-sim` passes.

## Open

A burn that cleared the understory doesn't yet make a later natural crown fire stall there, beyond
the lower fuel the burn already leaves. Making crown-fire spread depend on ladder fuel would give
burning a lasting payoff, but it would shrink natural crown fires in any forest without shrubs.
