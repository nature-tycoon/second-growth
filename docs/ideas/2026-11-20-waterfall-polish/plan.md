# Batch waterfall-polish (2026-11-20)

Branch `claude/ideas-waterfall-polish`, cut from the tip of `claude/ideas-cinema-creeks` (43f5a0b; that batch's 22 commits are not on main yet, and waterfalls and dams live there). Ship both together, or cinema-creeks first, when Cole says.

## Ideas, grouped

- **Usage**: check the last week of PostHog usage: are the recent improvements raising play, and what to fix next.
- **UI & camera**: settings menu has too many items; arrow keys pan the map in overhead mode; Ecosystem Report and field guide show different animal counts.
- **Water & terrain**: expanding a pond (mainly one a creek runs into) leaves a cliff round the edge with very low water.
- **Beaver dams** (from cinema-creeks open.md, Cole's pick): drawn spill over a full dam; dams rise over years; fell trees where the dam's ends land; check a new dam is drawn the next day.
- **Waterfalls**: looks fake and cheap → more realistic without hurting the frame rate; plus Cole's picks: sound, mist/spray, winter ice, American dipper.
- **Serengeti**: bare ground can't be eradicated naturally (**deferred by Cole**); resident grazers follow green grass (Cole's pick).
- **Movement** (Cole's picks): a waiting family lead stops and looks back instead of creeping; Chinandega coati in a trunk; motion sweep counts land walkers stuck on water.

## Nature check / changes from Cole's wording

- Pond cliff: a real pond fed by a creek fills to its outlet (spill) level, and its banks slope; widening it should keep a sloped bank and the same water surface, never a deep pit with low water. Likely `feedLevel` (pond joined to a creek holds the creek's level) meeting `gradeTile` / dig depth.
- Waterfall look (Cole picked): rock lip and wet rock face, a moving sheet that breaks into white streaks, foam and mist at the foot; measured with `play-profile`.
- Dipper: real PNW waterfall bird: walks and dives in fast water, nests behind or beside falls. PNW only.
- Fall ice: real falls ice at the edges in hard cold snaps, rarely freeze through.
- Dams rising over years: real beaver dams grow over seasons and decades, raised after floods.
- Bare ground (deferred): real savanna keeps some bare soil; Serengeti grazer biomass (~4x reference) deferred with it.
- Usage review is read-only: a report, no code; PostHog read only, nothing sent.

## Cole's answers

- Stack on cinema-creeks. Settings: regroup, keep every option; removable ones become questions. Bare ground: ignore for now. Waterfall: rock ledge + water + mist.

## Sessions

| # | Title | Ideas | Model | Size | Status |
|---|---|---|---|---|---|
| 1 | Usage review | last week's PostHog usage, what to fix next | default | S | [x] cbb68ab |
| 2 | Menus & camera keys | settings regroup, arrow keys pan, report vs guide counts | sonnet | M | [x] 5f411e7 |
| 3 | Pond edge cliff | expanding a creek-fed pond leaves a cliff and low water | default | M | [x] 4ec8d02 |
| 4 | Beaver dam polish | spill over full dam, dams rise over years, fell trees at dam ends, drawn-next-day check | default | M | [ ] |
| 5 | Waterfall look | rock ledge, moving sheet, foam, mist and spray | default | M–L | [ ] |
| 6 | Waterfall sound & ice | real recording at the fall, winter ice at the edges | default | S–M | [ ] |
| 7 | American dipper | new PNW bird at falls and fast creeks | default | M | [ ] |
| 8 | Serengeti residents | gazelle, topi, buffalo drift to green grass within home ranges | default | M | [ ] |
| 9 | Movement fixes | waiting lead stops, coati in trunk, sweep catches walkers on water | default | M | [ ] |

Order: usage first (read-only, its findings may add to the next batch); cheap UI early; water/terrain before dams before falls (4–7 build on each other's drawing); Serengeti and movement last. Sessions 3, 4, 5 and 9 (water, terrain, movement) run `regression-reviewer` on the plan and the diff. Long checks go to `checker`.
