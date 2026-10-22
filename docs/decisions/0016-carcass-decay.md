# 0016 Carcasses break down on screen

2026-10-21. Cole asked to show a kill breaking down over time from scavenging and decay.

## Decision

Drawing only. A carcass's simulation (meals, lifetime, scavenger visits; 0008) is unchanged, apart
from two fields recorded at the kill so the renderer can tell how much is gone: `meals0` (meals it
started with) and `feed` (the hunter's feeding time). Neither uses a random draw.

`carcassDecay(c)` in `js/render3d/carcass-decay.js` turns a carcass into:

- `eaten`: 30% over the hunter's feed, then 50% more split across the scavengers' meals.
- `rot`: a smoothstep over the carcass's whole lifetime (slow, then fast).
- `flesh = (1 - eaten) * (1 - rot)`, which only falls.
- `sink`: the last 12% of its time, settling into the ground.
- `tint`: red where it's been opened, then grey-brown as it rots. `bone`: bloody when bared, bleaching pale.

The body is drawn from its species pool as before, squashed across its depth by `0.15 + 0.85 * flesh`
and tinted. Once flesh falls below 0.5, a ribcage, skull, pelvis and leg bones (`Remains`, one
instanced mesh) are drawn inside it. They show through as the body flattens, at flesh below about 0.26.
Up to two extra contact shadows spread a stain under it as it rots.

## Gotchas

- Fauna pools now always carry `instanceColor` (white). `Fauna.add(..., remains)` writes a slot's
  colour only when it is or was tinted, and uploads only then.
- Tints multiply in linear light: a multiplier of 0.4 reads as ~66% on screen. `carcassDecay` picks
  colours as they should look and raises them to the power 2.2.
- Animal models stand on their origin (feet), so a carcass rolled on its side has its torso about
  `motion.center.y * scale` off toward its back. The bones and stain are placed there, not at `c.x, c.y`.

## Checks

`node tools/carcass-decay-check.mjs [--print]`: the stages only advance, eating strips the body,
old carcasses without the new fields still draw, and pool tints reset when a slot is reused. Seen in
headless Chrome on Serengeti zebra and wildebeest kills at seven stages, from fresh to a stain.
