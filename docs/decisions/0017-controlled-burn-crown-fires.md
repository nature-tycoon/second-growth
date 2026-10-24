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

## Burning the understory slows later crown fires

2026-10-23, the same day. A burn has a lasting payoff as well as a risk: in a crown fire, a big tree's
canopy carries the fire in proportion to the ladder fuel under it (`Events.ladder`, shared with
`rxTorch`). With a full shrub layer (`LADDER_FULL` = 0.4) it burns as before; with nothing under it,
the canopy term drops to `CROWN_BARE` (0.3) of that. The shrubs grow back, so the protection fades
over about three to five years with no new state to save: burning every few years keeps a stand safe.

A 36×24 planted stand of big conifers (two thirds with shrubs) on a grown PNW farm, with the east
half's understory burned (`burnUnderbrush`), and a crown fire lit 4 tiles west of it in a 10-day
dry spell (20–40 runs per row):

| Lit after the burn | Big trees lost, unburned east half | Burned east half, old code | Burned east half, new |
| --- | ---: | ---: | ---: |
| right away | 61–67% | 51% | 27% |
| 1 year | 51–61% | 43% | 22% |
| 3 years | 55–60% | 52% | 43% |
| 5 years | 61–62% | 60% | 58% |

The old code already gave a little protection, from the grass and shrubs the burn removes. A crown
fire lit 18 tiles away has cooled to a ground fire by the time it arrives (heat falls 7% a day), so the
crown rule only matters near where a crown fire starts or while it's hot.

Natural crown fires barely change. Three 20-year restored PNW farms (298–392 big trees), the same
farm in both versions, 60 crown fires each lit at a random big tree in a 10-day dry spell:

| Farm | Tiles burned, old → new | Big trees killed, old → new |
| --- | ---: | ---: |
| 1 | 2266 → 2376 | 34.5 → 35.8 |
| 2 | 2262 → 2335 | 49.9 → 51.6 |
| 3 | 2382 → 2333 | 46.7 → 42.5 |

These fires run mostly through grass, and two thirds of big trees on a grown farm have shrubs under
them, so they carry as before. An old forest with no understory at all would slow a crown fire more.
Seeded `balance-sim restore 15` is identical before and after (no crown fire in that run).
