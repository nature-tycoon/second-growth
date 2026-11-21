# 0053 Animals wait at the boundary fence; a first visit opens the farm

## Rules

- An arrival stopped by a boundary fence (N, E or W edge, ground animals) waits just beyond it for 8–14 game days, then goes back into the forest (`sim/fence-gate.js`, called from `immigrate`). One group per species waits at a time.
- A waiting animal is `leaving = true` with `a.gate` set: outside the farm, so it's left out of the population, prey lists, herds and watch mode. `gateStep` (first thing in `Wildlife.update`'s loop) handles it alone, like a dormant animal. Never give it a path or `chooseTarget` while it's off the map: `pathTo` and stall recovery need the map.
- A gap in the fence within 4 tiles of it lets it in: `admit` counts it into the population, and `enterStep` walks it in from off the map until it's on a tile, then it's an ordinary animal. An undo that puts the fence back while it's still outside sends it back to waiting.
- The daily `leaveDays` removal skips waiting animals. `checkMovementProgress` skips any with `a.gate`.
- A first visit's opening (`ui/opening.js`): the view at the north fence, the species' first try made at once (`immigrate(def, n, false, { edge, at })`), one prompt to tear out the fence, then one for the culvert, then the planting tip. `game.flags.opening.stage` ('fence' | 'culvert' | 'done') is saved with the farm. While it's 'fence', waiting animals hold (up to 90 days past their time) and the fence warning stays quiet.
- Both buttons go through `ToolActions.apply('demolish', ...)`, so cost, undo, goals and `tool_used` run as for a stroke. `farm_opened { how, seconds, prompted }` fires once per farm and kind from the 'tool' event, by button or by hand (Demolish sets `stroke.boundaryFence` / `stroke.culvert`).
- Checks: `tools/first-minutes-browser-check.mjs` (the opening, both sizes), seeded `calibrate.mjs pnw` / `sumatra`, `motion-sweep-check.mjs` (it has no fence in its runs, so it doesn't cover waiting animals).

## History

2026-11-21, first-minutes batch session 3 (`docs/ideas/2026-11-21-first-minutes/`). Arrivals stopped by the fence used to vanish with a warning. Making them wait where they can be seen turns the existing rule into the opening's hook: the deer are real agents through the real arrival rule, and they walk in because the fence is gone (decision 0001). Fence and culvert removal are the classic first moves of real restoration, and deer coming out of a forest edge onto open old field is true to life (mostly at dusk and dawn; a first visit shows them in daylight). The opening applies on any map whose fenced ground species arrives from the north and whose land can already hold it (PNW deer, Sumatra sambar). Elsewhere it skips to the culvert prompt, or straight to the planting tip. Balance didn't move (seeded calibrate, pnw and sumatra), since waiting animals aren't counted.
