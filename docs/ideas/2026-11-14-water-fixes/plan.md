# Idea batch 2026-11-14 water-fixes

Branch: `claude/ideas-water-fixes`, cut from `origin/main` (d626592), which includes the phone-review work (PR 108).

## Ideas, grouped

**UI and settings**
- Continue button on the start screen: more obvious, set slightly apart from the highlighted Hollis Farm box.
- Unlimited money as a sandbox mode (see answers).
- The setting that turns invasive species off doesn't work (bug).

**Water and elevation**
- Ponds joined to a creek hold the creek's level instead of acting like vernal pools.
- Salmon get stuck in a player-dug creek and can't reach the main creek.
- Rework the elevation and water models, which are behind many recent bugs → audit + design proposal this batch (see answers).

**Terrain tools**
- Fill & grade leaves perfectly flat ground.
- Demolish removes the gravel lot; fill & grade no longer does.

**Animals at the water surface (drawing)**
- The river dolphin looks like it's above the water.
- The beaver walks on top of the water, in watch mode only.

**Wildlife behavior**
- The anaconda doesn't swallow its prey.
- The red-tailed hawk sometimes soars backwards.

**Rendering**
- At eye level, animals sometimes draw in front of foliage they walk behind.

## Nature check / changes from the wording

- Connected ponds: in nature a pond joined to a creek (oxbow, backwater) tracks the creek's level. It stays full while the creek runs and drops only if the creek does. Cole chose this.
- Unlimited money undercuts 0001's tight early game, so it's a sandbox choice made at new game, recorded on the save and kept out of ratings and leaderboard numbers. Cole chose this.
- Elevation/water rework: a rewrite touches many subsystems, so per AGENTS.md this batch does an audit and design proposal for Cole to approve, plus the concrete fixes. Cole chose this.

## Assumptions

- Fill & grade flattens to one height: the height where the stroke starts, or the brushed area's average if that reads better. Water still has to drain off or pond on it sensibly.
- Demolish on a gravel lot returns the ground to what it was before the lot (bare soil if unknown) and refunds by the usual demolish rule.
- The invasive-species setting should stop new invasives arriving and stop existing ones spreading. Whether it also removes existing ones goes in open questions.

## Sessions

| # | Title | Ideas | Model | Size | Status |
|---|-------|-------|-------|------|--------|
| 1 | UI and settings | continue button, sandbox money, invasive toggle | sonnet | S–M | [ ] |
| 2 | Water model audit + connected ponds + salmon passage | pond level, salmon, rework proposal | opus | L | [ ] |
| 3 | Terrain tools | flat fill & grade, gravel lot via demolish | opus | M | [ ] |
| 4 | Animals at the water surface | dolphin, beaver in watch mode | opus | M | [ ] |
| 5 | Hunts and soaring | anaconda swallow, hawk soars backwards | opus | M | [ ] |
| 6 | Eye-level foliage occlusion | animals in front of foliage | opus | M | [ ] |

All sequential in this checkout (3 and 4 depend on 2's water levels; 6 uses browser checks).
