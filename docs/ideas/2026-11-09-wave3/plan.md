# Idea batch 2026-11-09 wave3

Branch: `claude/ideas-wave3` (from `claude/ideas-wave2` 3a3ec45, which already has refactor fix 4, species traits). Cole's picks from wave2's open.md.

## Cole's answers
- Picked: prey jink sideways; fruit birds and seabirds eat; male anthias and a little more anaconda habitat.
- Not this batch: anaconda coil and swallow (the swallow bulge sits unmerged on `claude/snake-coil-swallow-d0c18e`).
- Ask a species trait, never a species name (fix 4, `tools/species-name-count` ratchet).

## Nature-check notes
- Jink: hares, gazelles and impala cut sideways when a chaser is about a body length or two behind; the faster but less agile chaser overshoots. Keep kills per year by raising catch odds a little, not by removing the jink.
- Fruit birds: toucans, macaws, parrots and hornbills perch in fruiting crowns and take short meals; they also spread seed (0027 `seedTravel` already covers dispersal, don't add a second rule).
- Seabirds: boobies and gannets plunge-dive from height; noddies and terns dip or snatch from the surface. Real: few dives succeed.
- Male anthias: magenta with a long third dorsal spine; one male to a harem of orange females.
- Anaconda: rare, water's edge; a little more habitat, not a population boom.
- Inga pods are green to yellow-green; the white pulp only shows inside.

## Owed checks from wave2 (run 2026-11-09, plugged in)
- hunt-check: seeds 91 and 5 pass; 1987 fails only on leopard stalk 1.36 d (floor 1.5); median over three seeds passes. Session 1 makes the tool judge the median.
- Amazon GPU (play-profile, high): normal 10.0 ms (ceiling 11). Wide 11.9 and close 13.5; main measured 12.9 and 12.5, so fruit and blossoms are not the cause.
- Still Cole's: listen to the 8 Serengeti clips.

## Sessions (sequential, this checkout)
| # | Title | Ideas | Model | Size | Status |
|---|---|---|---|---|---|
| 1 | Prey jink | prey cut sideways when a chaser closes, catch odds raised to keep kills per year; hunt-check runs seeds 1987, 91, 5 and judges the median | opus | M | [x] |
| 2 | Birds eat | perched fruit birds take short meals in fruiting crowns; boobies plunge-dive, noddies dip | opus | M | [ ] |
| 3 | Reef males, anacondas, inga | male anthias drawn and placed in harems; a little more anaconda habitat (balance-checked); Amazon inga pods yellow-green | sonnet | S | [ ] |
| 4 | Fish in creeks and catfish | creek fish slide sideways along the bank (check `motion-sweep-check` first: wave2 fix 2, one facing, may have fixed it); Serengeti catfish fins above water: keep them under the surface (`swimDepth`, 0034) | opus | S–M | [ ] |
| 5 | Natural tracker lens | the tracker lens cuts a cube out of plants round small animals; fade only the plants between camera and animal, with a soft round edge | opus | S–M | [ ] |
| 6 | PostHog review (report only) | performance and other player issues from PostHog, ranked by players affected, with what to fix next; Cole picks | opus | S | [ ] |

Added 2026-11-09 (Cole). Notes: s4 is drawing and movement only, no balance. s5 keeps the lens (tracker) behaviour, changes only how plants give way. s6 needs the PostHog connector authorised (`/mcp`); if it isn't, it uses `docs/posthog-player-perf.md` and says what it couldn't reach.

## After the last wave3 session (Cole, via s8)
| 7 | Refactor fix 8: split `render3d/actors.js` and `sim/animals.js` | first merge `claude/ideas-wave2` (a963a0f, ends in fix 5) into `claude/ideas-wave3`, run the guards in the brief, then start fix 8 in its own worktree from wave3. Not while any wave3 session edits those files. Brief: `~/Library/Application Support/Claude/side-session-notes/local_4092a99c-05b6-4e1c-90fb-a811f906d56e/fix8-split-giant-files-brief.md` | opus | M | [ ] |
