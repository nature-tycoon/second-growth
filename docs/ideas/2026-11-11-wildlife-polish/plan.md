# Idea batch: wildlife-polish (2026-11-11)

Branch: `claude/ideas-wildlife-polish` (from `main`). Sessions run one at a time in this checkout.

## Ideas, grouped

**Small animals (wildlife behavior + ecology balance)**
- Garter snakes didn't move at all for years. Real garter snakes brumate in winter but are active spring to fall, so this is a bug (check dormancy, 0009).
- Only 1–4 brush rabbits on the PNW map. Brush rabbits are common wherever dense brush is, so numbers should be well above that in brushy habitat, through habitat and cover, not purchase (0001).

**Birds and fish motion**
- Bird flight bobs jerkily up and down. Real flapping flight holds a steady line; altitude changes should be smooth glides/climbs.
- A mallard sat submerged near a creek edge. Mallards float on the surface (dabbling tips only the head and front under). Float at the local water surface, stand on the bank when out of water.
- Fish rise and fall over coral and the follow camera is bumpy. Reef fish hold a fairly level depth over rough bottoms. *Changed:* smooth the fish's depth (follow a smoothed seabed) **and** smooth the camera's vertical follow, rather than only one.

**Eye-level see-through hole (lens tracker)**
- Hole looks like a fake ellipse around the animal. Cole's answer: depth-based. Foliage close to the animal is cut only to the animal's own outline; foliage much closer to the camera gets a wider soft hole; for small animals at eye level, bushes in front count like canopy.

**Monkeys**
- Movement problems. Cole's answer: decide between his canopy-walker model branches (`monkey/canopy-walker`, `monkey/canopy-rewrite-wip`, also `codex/primate-*`, `canopy-primates`, `smooth-primate-hitches`) and piecewise fixes, then build the winner.

## Assumptions
- No balance change beyond brush rabbits; other species' counts in `balance-sim restore 15` should not move much.
- Camera smoothing must not lag behind fast animals noticeably.

## Sessions

| # | Session | Ideas | Model | Size | Status |
|---|---|---|---|---|---|
| 1 | Small animals | garter snakes still, brush rabbit numbers | Opus | S–M | [x] aed7cd7 |
| 2 | Birds and fish motion | jerky flight, submerged mallard, fish depth + camera | Opus | M | [x] 2cf4495 |
| 3 | Lens hole | depth-based see-through hole | Opus | M | [x] f86d41c |
| 4 | Monkeys | compare model vs piecewise, build winner | Opus | L | [x] 1e26e09 |
