# Open questions and new ideas, batch 2026-11-15 edit-path

Session 1 landed as d4ba432 on `claude/ideas-edit-path`: 0048 phase 2 (one terrain edit path, `js/terrain-edit.js`) and roads Demolish-only. Details are in s1.md.

Note: another agent's commit, f6fbf35 "Website: remove the press kit", landed on this branch in the middle of the batch.

## Open questions (recommended answer in italics)

1. Should Raise/Lower refuse creek tiles, like the river? Reshaping a creek can undo the grading fish need. *Yes; reshape a creek by filling and re-digging it.*
2. Read corner ownership when an edit runs rather than storing it, until phase 3 needs channels as objects? *Yes.*

## New ideas

- **Fill & grade priced by earth moved.** `terrainEdit` knows each corner's old and new height, so it can return the earth moved. Small.
- **Terrain undo stores only the corners an edit moved** instead of a full copy of the height grid. Phase 3's undo will want it.
- The roads and gravel hints share one "seen" flag. They say the same thing, so this is fine.

Still waiting from the last batch: phase 3 (creeks drop gently in a dry summer, which Cole approved; salmon leap cascades) and phase 4 (seasonal ponds on Serengeti and Chinandega).
