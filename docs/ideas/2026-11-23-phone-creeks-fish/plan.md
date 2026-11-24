# Ideas batch phone-creeks-fish (2026-11-23)

Branch: `claude/ideas-phone-creeks-fish`, cut from `claude/ideas-creeks-fps` (not main): the creek-edge and waterfall work Cole is reporting on lives on that unmerged batch, so this batch builds on it.

## Ideas, grouped

UI / phone
1. A blank green strip shows at the bottom of the screen on iPhone while playing. Cole: put that empty space up in the top blur (Dynamic Island / status area) instead.
2. The "turn your phone" reminder no longer appears on phones held upright.
3. The Sandbox checkbox (new-game menu) drops off screen and is a large box; make it a compact control that stays on screen.

Creek drawing tool (0054, 0048)
4. Creek brush lags since the shore-shape update: drag, nothing shows, then it draws late.
5. Sharp S-curves drawn with brush size 1 still come out jagged.

Water drawing (0050)
6. Water shading around the waterfall (not the falling sheet) sometimes looks like it flows upstream.

Fish (0050, 0034) — came back ("again")
7. Coastal cutthroat clump at the base of a waterfall and don't range up and down the free creek below.
8. Fish clump waiting at the entrance of a marsh.

## Nature check and changes

- 1: changed from "move the bar" to "get rid of the blank strip": the strip is almost surely page background showing below the game (safe area / Safari bar / viewport height). The game should fill to the bottom edge, with any leftover filler at the top under the island, per Cole's answer.
- 7: real cutthroat do gather in a plunge pool below a barrier falls, so some holding there is right; the bug is all of them holding there. Realistic: a few hold in the pool, the rest spread through the reaches below and move up and down them.
- 8: cutthroat do use marshes and beaver ponds with open water. Realistic: they swim in if the water is deep enough, otherwise turn away; never queue at the edge.
- 5: real creeks can't bend sharper than their width allows, so a very tight S may be softened, but the outline must be smooth, never stair-stepped by tiles.

## Cole's answers

- Green bar: "a blank green bar that shows up at the bottom of the screen currently. I don't see why we wouldn't put it in the blur."

## Assumptions

- Rotate reminder shows on phones in portrait during play, as before; check against git history for when it broke.
- Sandbox: a small toggle or compact checkbox row, same behaviour.
- Creek preview: the stroke should show under the brush at once; slower shore shaping may finish after the stroke.

## Sessions

| # | Title | Ideas | Model | Size | Status |
|---|---|---|---|---|---|
| 1 | Phone layout fixes | 1, 2, 3 | sonnet | small | [x] 4717ad6, 4f82c99 |
| 2 | Creek brush lag and S-curves | 4, 5 | opus | medium | [x] 024b26b (lag fixed; S-curve still stepped, logged) |
| 3 | Waterfall water flow direction | 6 | opus | small–medium | [ ] |
| 4 | Fish clumping at falls and marsh | 7, 8 | opus | medium | [ ] |

Sequential in this checkout. Sessions 2 and 4 run `regression-reviewer` (water, movement).
