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

# Round 2: open questions (sessions 5–8)

All of round 2 landed: dfb9919 (jaguar), 2fc5da9 (suite green), df61755 (creek ribbon, 0055), 4dcbd66 (patch redraw), f554e1b (snakeheads). Headless suite 150/150, motion sweep passes. Nothing pushed.

## Choice-shaped (asked)

- **Tree guards (s5b):** beavers fell 20–30 of the ~45 trees planted at the opening on about a third of seeds, so the opening time-lapse check passes on its median, not every seed. Realistic: crews wire-guard riparian plantings. Recommended: a cheap wire tree guard for planted saplings, offered after the first beaver cut. It protects habitat and never grows wildlife, so it fits 0001.
- **Water patch redraw (s7):** shaping beside water still rebuilds all the water when the stroke ends (15–85 ms, a hitch on a phone). Recommended: its own session.
- **Stranded snakeheads (s8):** nine fish stranded in a one-tile dry-season puddle. Real snakeheads breathe air and wriggle over wet ground to the next pool. Recommended: fish with an air-breathing trait cross 1–2 wet tiles to the nearest water; other stranded fish die off as the puddle dries.

## Recommended answers stand unless Cole objects

- Spoil bank on downhill side of a dug creek (s6): not now; look in play first. It would change sim heights through `terrainEdit`.
- Ribbon stops two tiles before a pond or river mouth (s6): leave it.
- PNW dug creek reads grey at the overview in dim light (s6): glance in play; tune PNW's shallow colour if it reads as a road.
- Brief water lag while dragging beside a pond (s7): accept; revisit if it flickers.
- Opening check on five seeds (s5b): keep three; fix beavers instead.
- Elephant feet at a bank foot (s8): close-up look before the next film shoot.
- Daily swim-route cost, 1–7 ms once a day (s8): leave it.

## New ideas (nature-checked)

- Young shrubs still die on day one of a flood; give them trees' daily odds (willow and dogwood are flood-tolerant: realistic).
- Fish and waders can sit just outside the drawn ribbon on a diagonal reach; keep them inside it.
- The wet fringe beside water could follow the ribbon.
- A per-fish "no progress in a day, drop the target" rule, as a safety net for any future pile-up.
- Solitary prey (duiker, tapir) scatter when they flee rather than all running to one tile, as a trait. Realistic: herds bunch, solitary animals scatter.
- Tools: `dipper-check` seed luck (restore 6 years or accept K ≥ 0.8), the motion sweep's `sunk` should sample drawn hooves, the end-of-stroke whole-map recolour (6–12 ms) could be patched, the ribbon could be recomputed near the edit only.

## Cole's answers, round 2 (2026-11-24)

- Tree guards: yes, a cheap wire guard offered after the first beaver cut.
- Water patch redraw: yes.
- Stranded snakeheads: yes, air-breathers wriggle 1–2 wet tiles to water.
- Ship: Cole looks at the game first, then says when to push.

# Round 3: open questions (sessions 9–12)

All landed: 0ab9c18 (off-map creeks), 5afd637 (tree guards, 0057), b1237f4 (water patch redraw), 5a7134e (air-breathing fish wriggle). Nothing pushed.

## Before or right after shipping

- **`animal-trails-browser-check` fails on main's code too (s11):** ground trails changed 0 pixels in Fast and High. The browser suite runs on main before the itch.io upload, so a merge won't reach itch until it's fixed. Recommended: a short session to find whether the trails or the check broke.
- **Intro film shows the old wide creek (s9):** re-film after merging (`--rough` first, then `intro-film-motion`). **Done 2026-11-25** (branch `claude/intro-refilm-creek`): re-filmed, all 299 staging measures pass, Cole approved the rough cut. Also fixed there: the farm now opens framed as the film's last frame and glides to the start zoom, so the hand-off doesn't jump on screens other than 1920×1080.
- **Cole's current PNW farm keeps the old wide trench (s9):** saves keep the ground. Start a new PNW farm to see the fix; no players are affected.

## Choice-shaped

- **Time-lapse stops at the first beaver cut (s10)** to offer guards. That happens on most PNW first visits (years 3–8), so most players don't see the full ten years or the closing newcomer. Recommended: keep the stop; the alternative (offer after ten years) comes too late to save the trees.

## Recommended answers stand unless Cole objects

- PNW creek narrows slightly right at the fence (1.2 vs 1.4 tiles), kept to protect the intro film's staging (s9): leave it.
- Guard comes off at 8 years (s10): keep. Guards don't stay on grown trees (s10): right.
- Slow phones keep holding the water during a drag (s11): keep; look at the next phone check.
- Watch a snakehead crossing on Sumatra at night in the dry season (s12).
- Sumatra food-web score dip .98 → .90 reads as random drift (s12): leave it.
- A crossing stuck 4 days falls back to the old jump (s12): leave it.

## New ideas (nature-checked)

- Air-breathers with no water left bury in the mud and wait for the rains (real for snakeheads and Clarias; the dormancy state exists).
- A beaver colony that can only reach guarded trees moves on sooner; guarded trees leave the deer browse map (realistic, small).
- Smooth the farm creek's flare just before PNW's fence (s9).
- Chinandega snappers in cut-off pools: check whether those pools dry under them now that stranded fish can die.
- Tools: the pile probe should count only fish standing still; riverbank stones and the channel flow could also be patched (perf, small).

## Cole's answers, round 3 (2026-11-25)

- Trails browser check: fix it next, on this branch (s13).
- Time-lapse stops at the first beaver cut: keep.
- Intro film: re-film after merge.
- Ship: Cole looks again (new PNW farm) before pushing.
