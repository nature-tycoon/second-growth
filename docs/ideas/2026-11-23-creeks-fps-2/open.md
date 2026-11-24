# Batch 2026-11-23 creeks-fps-2: open questions and new ideas

All 4 sessions landed on `claude/ideas-creeks-fps` (cbc2eeb, 85e1f78, d7addd1, d4ee7db), on top of
the first batch. Nothing pushed. Not checked by eye in a running game: the Contact page, the flood-cut
minimap marker, both frame-rate notices.

## Open, by area (recommended answer first)

### Creeks and water
1. The creek beyond the PNW fence still steps like a staircase on its diagonal (s3). It's how that water is drawn (row by row); the fix draws it as one sloping sheet and means refilming the first shot. **Yes, but only the next time the intro is refilmed anyway.**
2. A dug ditch with no outlet floods its banks too (s2). **Keep** (any channel carries storm water; the rule keeps it small).
3. Young birch and maple along the upper ditch now die in floods (s2). **Keep** (real; willow, dogwood, alder and cottonwood stand).
4. The flood notice still says "the river spilled over N tiles" (s2). **Leave** unless a player reads it as wrong.
5. Sumatra's dead-end canals now narrow at their ends (s3). **Leave** (reads as silt).

### Frame rate
6. Safari Macs held to 30 can now step up from Fast, judged by processor work alone (s4). **Keep** (the two-minute trial undoes a bad step).
7. Battery hint also for someone who turned down "try Fast"? (s4). **No**: one speed notice is enough.
8. On about 2026-12-07, review together: session 7's step-up rules, the step-down at 26, Sharp at 1.75 pixels a point, how many software-drawing players come back on a real chip, and how often the battery hint fires (s4, first batch). **Yes**, one review that day.

### UI
9. Flood-cut marker on the minimap only, not on the 3D land (s1). **Keep** (quiet).
10. Creek-tool hint once per device; Contact page shows signup even when subscribed ("You're on the list") (s1). **Keep.**

## New ideas (nature-checked)

- A dry summer ditch on the farm goes silent like the creek beyond the fence; farm sound measured from the camera's real focus, not the fence row (s3). Sound: real dry beds are silent.
- Flood-risk overlay tip: "creeks above a culvert flood too; culverts only stop fish" (s2).
- Journal rows with a place jump the camera there, like toasts (s1).
- Creek-tool hint while still dragging, not only on release (s1).
- `calibrate` mode with separate random streams per system, so before/after runs aren't swamped by noise when a change shifts the random stream (s2). Useful for every future balance change.
- `perf_sample` flags for whether a hint was shown (s4).
- Software-drawing players start paused on Fast with the notice up front, only if more than a couple a month (s4).
- Finer ground mesh at the water's edge for truly round creek ends; only if ever worth the cost (s3).
