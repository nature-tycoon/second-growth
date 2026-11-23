# Idea batch 2026-11-22: creeks, frame rate, menus

Branch: `claude/ideas-creeks-fps` (cut from origin/main 2f26961). Sessions run one at a time.

## Cole's ideas, split and nature-checked

| # | Change | Area | Note |
|---|---|---|---|
| a | Elevation view stops flickering on and off while editing ground; stays on until turned off | UI / terrain tools | Cole: it flickers while dragging or raising/lowering |
| b | Modernize the map overlay section to match the newer UI | UI | |
| c | Hamburger menu (how-tos, email links) simplified and easier to read | UI | Cole meant this menu, not Settings |
| d | Creeks never have sharp angles, after any terrain edit; fix the terrain cause, not only the creek | terrain / water | Real creeks bend in curves; grid corners are an artifact |
| e | Creeks change over time and round out the 90° bends (PNW) | water / terrain | **Changed:** real tight bends get cut off mostly in floods; full yearly meandering is decades-slow and would touch fish, beavers, dams and dug creeks. Cole chose: round at source (d) + big floods trim remaining tight bends |
| f | Median FPS 35, as many players on Sharp as possible | performance | Cole: 35 FPS wins over Sharp; Sharp wherever it holds ~35. Measured on real players (PostHog). Architect (Fable) for the design. Report plainly if 35 isn't reachable and why |
| g | Fish a bird eats inside a leaf clump stays visible | drawing (0040 lens) | Cole: only when following that bird; extend the tracking lens to the meal |
| h | Starting creek runs off the north edge on every map; refilm the intro so it shows | maps / intro film | Lowest priority. Assumption: the creek enters or leaves by the north edge as the landform's downhill allows; maps without a starting creek (reef) skipped |
| i | Keystone moments wait a while after the opening time-lapse | UI / events | |

## Sessions

| S | Title | Ideas | Model | Size | Status |
|---|---|---|---|---|---|
| 1 | Keystone moments wait after the time-lapse | i | sonnet | S | done b3aa328 |
| 2 | Hamburger menu readability | c | sonnet | S–M | done 340dc41 |
| 3 | Elevation view steady + map overlays modernized | a, b | opus | M | done b86d8a9, 52dd9d2 |
| 4 | Meal visible through leaves while following | g | opus | S–M | done 681eba4 |
| 5 | Creeks never bend sharply (terrain cause) | d | opus | L | done 9add1d3 |
| 6 | Floods trim tight creek bends | e | opus | M | done e642da6 |
| 7 | Frame rate: measure, Fable design, first wins | f | opus | L | done (see s7.md) |
| 8 | Frame rate: build the design's main pieces | f | opus | L | |
| 9 | Starting creek off the north edge + refilm intro | h | opus | L | |

Order: cheap UI first, creek shape before erosion, frame rate after the new drawing lands so it measures it, refilm last.
Sessions 3, 5, 6, 8, 9 run `regression-reviewer` on plan and diff.
