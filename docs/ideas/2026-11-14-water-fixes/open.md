# Open questions and new ideas, batch 2026-11-14 water-fixes

All six sessions landed on `claude/ideas-water-fixes` (7054cd7, 1cbd18d, 0ba9c5d, 942b61d + 13b2605, 47f8a7e, d18ef43). Details are in s1–s6.md.

## Open questions (recommended answer in italics)

**Water and elevation (0048)**
1. Approve the 0048 rework (3 more phases: one edit path for all terrain tools; graded creeks with seasonal low water; the pond model on every map)? *Yes, phase 2 (one edit path) first: it's the smallest and closes the "an edit beside water breaks the water" bugs.*
2. Should creeks run low in a dry summer? *Yes, gently (a hand's depth), in phase 3, so joined ponds and fish feel the dry season without stranding salmon.*
3. Seasonal ponds on other maps? *Yes for Serengeti and Chinandega (phase 4); Amazon, Sumatra and Atlanta stay wet.*
4. Should salmon leap cascades in steep dug creeks? *Yes in phase 3, with a leap height per species (coho high, cutthroat low).*

**Terrain tools**
5. Roads Demolish-only, like gravel lots? *Yes: Fill & grade only shapes ground and fills water.*
6. Should grading strip plants and turn fields to bare soil? *No, keep plants; Loosen soil does that.*
7. Level to the stroke's start height or the brushed area's average? *Start height (predictable, makes terraces).*
8. Pad edge limit of 3.6 m (about 24°)? *Keep it.*

**UI and settings**
9. Should turning invasives off remove the ones already there? *No; Pull and burning handle them.*
10. Switch sandbox on for an existing farm? *No; start a new sandbox farm.*
11. Goal and grant popups in sandbox? *Leave them.*

**Animal drawing and the tracking lens**
12. From above, should a selected fish still show through the water? *Yes, as now.*
13. Should the dolphin dip and surface to breathe every 30–60 s? *Yes, a small drawing-only follow-up.*
14. How strong should the followed animal show through cover? It is 42% now; it was accidentally 100% before. *Keep 42%; raise it for the overhead view only if selected animals are hard to find.*
15. Should the followed animal show through cover at eye level? *Yes, faintly.*

**Hunts**
16. Draw the snake's coils round its prey? *Wait until you've seen the swallow in the game.*
17. Should the bulge last longer than the 5-day rest? *No, keep it tied to the rest.*
18. Reef coral came out slightly lower after the seabird fix (.88 → .84), within the seed spread. *Keep the fix; watch the coral in the next balance pass.*

## New ideas (nature-checked)

- **Sandbox badge** on the Continue box and on shared farms. Small UI.
- **Tile note "needs shade"** on an unshaded dug creek, so motionless coho don't look broken. Realistic: coho need cool, shaded water.
- **Raise/Lower beside a creek still moves its corners.** This is phase 2 of 0048.
- **Translate the Hollis water tile notes.** Only needed once Hollis gets Spanish.
- **Grader-scraped look** on freshly graded ground that fades as plants return, plus a cursor tint on tiles too steep to grade.
- **Fill & grade priced by earth moved** instead of a flat $25 a tile. Fairer; fits 0048's single edit path.
- **The lens and flood water.** The lens ignores flood water, so a watched animal could look as if it stands on top of a flood.
- **River fish "frozen mid-route"** is the largest motion count left for swimmers (coho, arapaima).
- **Watch-pace motion sweep on every map** (`SPEED=4`) to find other headings frozen by "aim one step ahead" steering. The Amazon dolphin's sideways swimming at watch pace is probably the same cause.
- **Snakes digest under cover** (a log or thick shrub). Realistic for pythons and boas.
- **The lens's see-through depth is capped at 2.5 tiles,** so a bush far in front of an elephant or giraffe still opens. Fix: widen the trunk search.
- **An in-game pixel probe** in a lens browser check would catch the shader bug the headless check missed.
- **`website-security-browser-check` times out locally** before this batch too. Look before the next release; it runs on main before the itch.io upload.
