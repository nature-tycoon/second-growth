# phone-creeks-fish: open questions and new ideas

All 4 sessions landed on `claude/ideas-phone-creeks-fish` (4717ad6, 4f82c99, 024b26b, d16bee0, f085f7d). Nothing is pushed.

## Blocking a merge

- **Motion sweep fails on its default seeds (s4).** An Amazon jaguar's rush at an agouti counts as a position jump: 7.0 per 1000 frames, limit 6. The fish change shifted the random stream, so the chase now lands on the default seeds. Over ten seed pairs, 4 fail after vs 5 before. The PR's headless check will fail on this. Recommended: a small session decides whether a hunter's rush should count as a jump (0026). Don't loosen the limit.

## Phone / UI (s1)

1. The bottom strip in Safari with the bars showing is Safari's own toolbar area, which a page can't draw into. Recommended: accept it. Home Screen play has no strip.
2. The filler band under the Dynamic Island is dark. Recommended: OK as is.
3. On a short screen Sandbox sits below the map and needs a scroll. Recommended: accept.

## Creek drawing (s2)

4. Tight S-curves are still tile-stepped. Recommended: a session that draws dug creeks' water as a smooth ribbon along the course (drawing only; fish and plants stay on tiles). Raising the banks was measured and rejected: it doesn't help PNW and it blocks beaver ponds.
5. Raise/Lower also rebuild the whole map every frame while dragging. Recommended: a medium renderer session that redraws only the edited patch. It also removes the ~100 ms freeze at the end of every land stroke.
6. The blue stroke path leads the creek by a few tiles. Recommended: keep it and look at it in play; shorten the look-ahead from 5 to 3 tiles if it reads as lag.

## Water drawing (s3)

7. Pond ripples drift slowly one way, like a breeze. Recommended: keep.
8. Water drifts at the same speed on steep and gentle reaches. Recommended: leave it. Speed by slope is a small follow-up if it looks lazy.

## Fish (s4)

9. Sumatra snakeheads still pile up in peat marsh (it was the same before this batch). Recommended: its own session with the pile probe over many seeds.
10. A creek dug down into the gorge beside the falls joins over a 2–10 m step, so its fish stay cut off. That's realistic. Recommended: leave it.

## New ideas (nature-checked)

- A creek dug across a slope piles its spoil on the downhill side. Realistic for dug ditches, and it would tidy the flooded strip on the downhill bank in the drawing. Fits the ribbon session (4).
- The steep reach below the falls could be drawn whiter and faster. Realistic: cascades run white. Pairs with 8.
- Side-creek mouths: the drawn current starts turning about two tiles up the side creek. Fine as is.
- Tools: add the new-game menu to `phone-review.mjs`. Turn the visual-qa flow-direction measurement into a browser check. Cover a beaver pond with a marsh fringe in `fish-falls-marsh-check`.

## Cole's answers (2026-11-24)

- Jaguar motion-sweep failure: fix it next.
- S-curves: yes, draw dug creeks as a smooth ribbon.
- Land redraw: yes, redraw only the edited patch.
- Snakeheads: yes, their own session.
- The rest: the recommended answers stand unless Cole says otherwise.
