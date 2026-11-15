# Idea batch 2026-11-15 edit-path

Branch: `claude/ideas-edit-path`, cut from `origin/main` (fcf32fb), which has the whole 2026-11-14 water-fixes batch (PRs 112, 113).

## Ideas

From Cole's answers to [2026-11-14 water-fixes](../2026-11-14-water-fixes/open.md):

- **0048 phase 2: one edit path for every terrain tool.** Raise/Lower ground, Fill & grade, dig creek, dig pond and marsh all change heights through one function that owns the rules: who owns each corner, and that no edit moves another water body's corners. This closes the "an edit beside water breaks the water" bugs, including Raise/Lower beside a creek, which still moves the creek's corners.
- **Roads are Demolish-only**, like gravel lots: Fill & grade levels a road but keeps it.

## Nature check

Nothing unnatural: phase 2 is the plumbing behind what Cole asked for. Removing what people built with Demolish and shaping ground with Fill & grade matches how real restoration crews split the work.

## Assumptions

- Phase 3 (graded creeks with seasonal low water, a gentle summer drop, salmon leaping cascades) and phase 4 (ponds on other maps) are not in this batch.
- Generated maps stay byte-for-byte unchanged; saves load unchanged.
- Fill & grade priced by earth moved is out of scope unless it falls out naturally; log it otherwise.

## Sessions

| # | Title | Ideas | Model | Size | Status |
|---|-------|-------|-------|------|--------|
| 1 | One terrain edit path + roads via Demolish | 0048 phase 2, roads | opus | L | [ ] |

One session: roads touch the same fill tool that phase 2 reroutes, so splitting would mean two sessions editing the same lines.
